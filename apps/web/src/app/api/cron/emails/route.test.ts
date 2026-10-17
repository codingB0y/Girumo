import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { GET as RotaGet } from "./route";

/**
 * O cron de e-mails contra um Supabase de mentira (o PostgREST falso de
 * `api/orders/route.test.ts`). Sem `RESEND_API_KEY` nenhum e-mail sai de verdade:
 * `sendEmail` falha e grava `email.failed` em `logs` — essa linha é a prova de
 * que o cron TENTOU enviar, e a ausência dela, de que pulou.
 */

const CRON_SECRET = "segredo-do-cron-falso-com-24-caracteres";
const H = 60 * 60 * 1000;
/** `auth.admin.getUserById` recusa id que não seja UUID. */
const DONO = "00000000-0000-4000-8000-000000000001";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let GET: typeof RotaGet;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.CRON_SECRET = CRON_SECRET;
  // Nenhum e-mail pode sair deste teste.
  delete process.env.RESEND_API_KEY;
  // A rota lê CRON_SECRET ao carregar: import depois do env.
  ({ GET } = await import("./route"));
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  chamadas.length = 0;
});

type Mundo = {
  /** Lojas criadas há 24-48h (Job 1). */
  novas?: string[];
  /** Lojas varridas pelos Jobs 3, 6 e 7. */
  lojas?: string[];
  /** Linhas de `subscriptions`; `"erro"` responde 500. */
  assinaturas?: Array<{ tenant_id: string; status: string }> | "erro";
  /** Lojas com instância que já conectou alguma vez (`connected_at`). */
  jaConectaram?: string[];
  /** Resposta do dedupe em `notifications`. */
  dedupe?: Resposta;
};

function filtro(url: URL, coluna: string): string | null {
  return url.searchParams.get(coluna)?.replace(/^eq\./, "") ?? null;
}

/** Responde por "MÉTODO /caminho"; chamada que ninguém previu vira 500, para aparecer. */
function mundo(m: Mundo): (chamada: Chamada) => Resposta {
  const desconectadoHa3h = new Date(Date.now() - 3 * H).toISOString();
  return ({ metodo, url }) => {
    const rota = `${metodo} ${url.pathname}`;
    const select = url.searchParams.get("select");
    if (rota === "GET /rest/v1/organizations") {
      if (select === "id,name,created_at") return { status: 200, corpo: (m.novas ?? []).map((id) => ({ id, name: id, created_at: desconectadoHa3h })) };
      if (select === "id,name") return { status: 200, corpo: (m.lojas ?? []).map((id) => ({ id, name: id })) };
      return { status: 200, corpo: [] };
    }
    if (rota === "GET /rest/v1/subscriptions") {
      if (m.assinaturas === "erro") return { status: 500, corpo: { message: "timeout" } };
      const tenant = filtro(url, "tenant_id");
      return {
        status: 200,
        corpo: (m.assinaturas ?? [])
          .filter((a) => a.tenant_id === tenant)
          .map((a) => ({ status: a.status, metadata: {}, current_period_end: null })),
      };
    }
    if (rota === "GET /rest/v1/funnel_events") return { status: 200, corpo: [] };
    if (rota === "GET /rest/v1/instances") {
      const tenant = filtro(url, "tenant_id") ?? "";
      if (url.searchParams.has("connected_at")) {
        return { status: 200, corpo: (m.jaConectaram ?? []).includes(tenant) ? [{ id: `inst-${tenant}` }] : [] };
      }
      return { status: 200, corpo: [{ status: "disconnected", updated_at: desconectadoHa3h, disconnected_at: desconectadoHa3h }] };
    }
    if (rota === "GET /rest/v1/tenant_settings") return { status: 200, corpo: [] };
    if (rota === "GET /rest/v1/notifications") return m.dedupe ?? { status: 200, corpo: [] };
    if (rota === "GET /rest/v1/memberships") return { status: 200, corpo: [{ user_id: DONO }] };
    if (metodo === "GET" && url.pathname.startsWith("/auth/v1/admin/users/")) {
      return { status: 200, corpo: { id: url.pathname.split("/").pop(), email: "dono@loja.test", user_metadata: { name: "Ana" } } };
    }
    if (rota === "GET /rest/v1/broadcasts") return { status: 200, corpo: [] };
    if (rota === "POST /rest/v1/logs" || rota === "POST /rest/v1/notifications") return { status: 201 };
    return { status: 500, corpo: { message: `inesperado: ${rota}` } };
  };
}

async function rodarCron(m: Mundo): Promise<void> {
  responder = mundo(m);
  const resposta = await GET(new Request("http://girumo.test/api/cron/emails", { headers: { authorization: `Bearer ${CRON_SECRET}` } }));
  assert.equal(resposta.status, 200);
}

/** Lojas para as quais o cron tentou mandar o e-mail `kind` (linha em `logs`). */
function tentativas(kind: string): string[] {
  return chamadas
    .filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/logs")
    .map((c) => c.corpo as { tenant_id: string; metadata: { kind: string } })
    .filter((linha) => linha.metadata.kind === kind)
    .map((linha) => linha.tenant_id);
}

test("Job 1: loja que já conectou o número não recebe 'conecte seu WhatsApp'", async () => {
  // O marco `qr_connected` nunca era gravado com a Evolution, então o lembrete
  // saía para toda conta nova — inclusive a que conectou no primeiro dia.
  await rodarCron({ novas: ["conectou", "nunca-conectou"], jaConectaram: ["conectou"] });
  assert.deepEqual(tentativas("nudge_connect"), ["nunca-conectou"]);
});

test("Job 3: aviso de desconexão só vai para loja com plano valendo", async () => {
  await rodarCron({
    lojas: ["pagante", "ex-cliente", "nunca-assinou"],
    assinaturas: [
      { tenant_id: "pagante", status: "active" },
      { tenant_id: "ex-cliente", status: "canceled" },
    ],
  });
  assert.deepEqual(tentativas("disconnect"), ["pagante"]);
});

test("Job 3: erro lendo as assinaturas não manda aviso para ninguém", async () => {
  await rodarCron({ lojas: ["pagante"], assinaturas: "erro" });
  assert.deepEqual(tentativas("disconnect"), []);
});

test("Job 3: erro no dedupe não reenvia o aviso", async () => {
  await rodarCron({
    lojas: ["pagante"],
    assinaturas: [{ tenant_id: "pagante", status: "active" }],
    dedupe: { status: 500, corpo: { message: "timeout" } },
  });
  assert.deepEqual(tentativas("disconnect"), []);
});

test("Job 3: duas linhas no dedupe não viram mais um envio", async () => {
  // Com `maybeSingle`, duas linhas = erro PGRST116 = "nada enviado" = envia e
  // grava a terceira. Daí em diante, um e-mail por rodada até o fim do dia.
  await rodarCron({
    lojas: ["pagante"],
    assinaturas: [{ tenant_id: "pagante", status: "active" }],
    dedupe: { status: 200, corpo: [{ id: "n1" }, { id: "n2" }] },
  });
  assert.deepEqual(tentativas("disconnect"), []);
});
