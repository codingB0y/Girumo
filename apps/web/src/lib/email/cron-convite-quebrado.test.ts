import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { podeEnviar } from "./cron-recipients";
import type { avisarConvitesQuebrados as Job } from "./cron-convite-quebrado";

/**
 * Job 9 do cron contra um servidor falso que faz papel do PostgREST E do Resend
 * (`RESEND_BASE_URL`): nada sai daqui, e o e-mail montado chega inteiro no corpo
 * do `POST /emails` — é a prova do que o lojista receberia.
 */

const HOJE = "2026-11-12T00:00:00.000Z";
/** `auth.admin.getUserById` recusa id que não seja UUID. */
const DONO = "00000000-0000-4000-8000-000000000001";
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

type Chamada = { metodo: string; url: URL; corpo: unknown; cabecalhos: Record<string, string | string[] | undefined> };
const chamadas: Chamada[] = [];

type Campanha = { id: string; name: string; slug: string; group_ids: string[]; metadata: Record<string, unknown> };
type Grupo = { whatsapp_group_id: string; name: string };
type Mundo = {
  lojas: string[];
  /** Grupos com `invite_check = 'broken'`, por loja. */
  quebrados: Record<string, Grupo[]>;
  campanhas: Record<string, Campanha[]>;
  /** `href` que já têm aviso nos últimos 7 dias. */
  avisados?: string[];
  erroNosGrupos?: boolean;
  insertFalha?: boolean;
  resendFora?: boolean;
};
let m: Mundo = { lojas: [], quebrados: {}, campanhas: {} };

function filtro(url: URL, coluna: string): string | null {
  return url.searchParams.get(coluna)?.replace(/^eq\./, "") ?? null;
}

function responder({ metodo, url }: Chamada): { status: number; corpo?: unknown } {
  const rota = `${metodo} ${url.pathname}`;
  if (rota === "GET /rest/v1/organizations") return { status: 200, corpo: m.lojas.map((id) => ({ id, name: id })) };
  if (rota === "GET /rest/v1/groups") {
    if (m.erroNosGrupos) return { status: 500, corpo: { message: "timeout" } };
    // Só responde a pergunta certa: tirar o filtro do veredito devolveria grupo bom.
    if (filtro(url, "invite_check") !== "broken") return { status: 500, corpo: { message: "sem filtro de veredito" } };
    const todos = m.quebrados[filtro(url, "tenant_id") ?? ""] ?? [];
    const de = Number(url.searchParams.get("offset") ?? 0);
    const quantos = Number(url.searchParams.get("limit") ?? todos.length);
    return { status: 200, corpo: todos.slice(de, de + quantos) };
  }
  if (rota === "GET /rest/v1/campaign_groups") return { status: 200, corpo: m.campanhas[filtro(url, "tenant_id") ?? ""] ?? [] };
  if (rota === "GET /rest/v1/notifications") {
    // Avisado só conta com o tipo certo E o corte de uma semana atrás.
    const desde = Date.parse(url.searchParams.get("created_at")?.replace(/^gte\./, "") ?? "");
    const avisado =
      (m.avisados ?? []).includes(filtro(url, "href") ?? "") &&
      filtro(url, "type") === "convite_quebrado" &&
      Math.abs(Date.now() - SEMANA_MS - desde) < 60_000;
    return { status: 200, corpo: avisado ? [{ id: "n1" }] : [] };
  }
  if (rota === "GET /rest/v1/memberships") return { status: 200, corpo: [{ user_id: DONO }] };
  if (metodo === "GET" && url.pathname.startsWith("/auth/v1/admin/users/")) {
    return { status: 200, corpo: { id: DONO, email: "dono@loja.test", user_metadata: { name: "Ana Souza" } } };
  }
  if (rota === "POST /emails") return m.resendFora ? { status: 500, corpo: { message: "fora" } } : { status: 200, corpo: { id: "e1" } };
  if (rota === "POST /rest/v1/notifications" && m.insertFalha) return { status: 500, corpo: { message: "timeout" } };
  if (rota === "POST /rest/v1/logs" || rota === "POST /rest/v1/notifications") return { status: 201 };
  return { status: 500, corpo: { message: `inesperado: ${rota}` } };
}

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
      cabecalhos: req.headers,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let avisarConvitesQuebrados: typeof Job;
let supabase: Parameters<typeof Job>[0]["supabase"];

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  // O Resend lê a base ao carregar o módulo: env antes do import.
  process.env.RESEND_BASE_URL = base;
  process.env.RESEND_API_KEY = "re_falso";
  ({ avisarConvitesQuebrados } = await import("./cron-convite-quebrado"));
  supabase = (await import("@/lib/supabase/server")).getSupabaseAdmin();
});

after(() => servidor.close());
beforeEach(() => {
  chamadas.length = 0;
});

function rodar(mundo: Mundo) {
  m = mundo;
  return avisarConvitesQuebrados({
    supabase,
    appUrl: "https://app.girumo.test",
    now: new Date(),
    todayStartISO: HOJE,
    temPlanoValendo: async (t) => t !== "ex-cliente",
    liberado: (_job, _t, leitura) => podeEnviar(leitura),
  });
}

function campanha(slug: string, group_ids: string[], metadata: Record<string, unknown> = {}): Campanha {
  return { id: `id-${slug}`, name: `Campanha ${slug}`, slug, group_ids, metadata };
}
const quebrado = (n: number): Grupo => ({ whatsapp_group_id: `g${n}@g.us`, name: `Moda Kids ${n}` });

const envios = () => chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/emails");
const emails = () => envios().map((c) => c.corpo as { to: string; subject: string; html: string });
const avisosGravados = () =>
  chamadas
    .filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/notifications")
    .flatMap((c) => c.corpo as Array<{ tenant_id: string; type: string; href: string; body: string }>);

test("avisa a campanha com grupo quebrado; a sem grupo quebrado e a encerrada ficam de fora", async () => {
  const r = await rodar({
    lojas: ["pagante"],
    quebrados: { pagante: [quebrado(2)] },
    campanhas: {
      pagante: [
        campanha("bf", ["g1@g.us", "g2@g.us"]),
        campanha("ok", ["g1@g.us"]),
        campanha("encerrada", ["g2@g.us"], { settings: { entrada: { encerra_em: "2020-01-01" } } }),
      ],
    },
  });

  assert.deepEqual(r, { enviados: 1, erros: 0 });
  const [email, ...resto] = emails();
  assert.equal(resto.length, 0);
  assert.equal(email.to, "dono@loja.test");
  assert.equal(email.subject, "Um grupo da campanha Campanha bf está com o convite quebrado");
  assert.match(email.html, /Oi Ana!/);
  assert.match(email.html, />Campanha bf<\/a>: Moda Kids 2</);
  assert.match(email.html, /href="https:\/\/app\.girumo\.test\/painel\/campanhas\/bf"[^>]*>Abrir a campanha/);
  assert.deepEqual(
    avisosGravados().map((a) => [a.tenant_id, a.type, a.href]),
    [["pagante", "convite_quebrado", "/painel/campanhas/bf"]],
  );
  assert.match(avisosGravados()[0].body, /convite de Moda Kids 2/);
});

test("toda leitura da loja filtra por tenant_id (o service-role ignora o RLS)", async () => {
  await rodar({ lojas: ["pagante"], quebrados: { pagante: [quebrado(1)] }, campanhas: { pagante: [campanha("bf", ["g1@g.us"])] } });
  const daLoja = chamadas.filter((c) => c.metodo === "GET" && /^\/rest\/v1\/(groups|campaign_groups|notifications|memberships)$/.test(c.url.pathname));
  assert.ok(daLoja.length >= 4);
  for (const c of daLoja) assert.equal(filtro(c.url, "tenant_id"), "pagante", c.url.pathname);
  assert.equal(filtro(chamadas.find((c) => c.url.pathname === "/rest/v1/memberships")!.url, "role"), "owner");
});

test("o grupo quebrado número 1001 ainda entra: a leitura pagina além do corte do PostgREST", async () => {
  const muitos = Array.from({ length: 1001 }, (_, i) => quebrado(i + 1));
  await rodar({ lojas: ["pagante"], quebrados: { pagante: muitos }, campanhas: { pagante: [campanha("bf", ["g1001@g.us"])] } });
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/groups").length, 2);
  assert.match(emails()[0].html, /Moda Kids 1001/);
});

test("dedupe por campanha e por semana: a já avisada sai do e-mail, a outra ainda vai", async () => {
  await rodar({
    lojas: ["pagante"],
    quebrados: { pagante: [quebrado(1), quebrado(2)] },
    campanhas: { pagante: [campanha("a", ["g1@g.us"]), campanha("b", ["g2@g.us"])] },
    avisados: ["/painel/campanhas/a"],
  });
  assert.deepEqual(emails().map((e) => e.subject), ["Um grupo da campanha Campanha b está com o convite quebrado"]);
  assert.deepEqual(avisosGravados().map((a) => a.href), ["/painel/campanhas/b"]);
});

test("duas campanhas viram um e-mail só e um aviso para cada", async () => {
  await rodar({
    lojas: ["pagante"],
    quebrados: { pagante: [quebrado(1), quebrado(2)] },
    campanhas: { pagante: [campanha("a", ["g1@g.us"]), campanha("b", ["g1@g.us", "g2@g.us"])] },
  });
  assert.deepEqual(emails().map((e) => e.subject), ["Grupos de 2 campanhas estão com o convite quebrado"]);
  assert.match(emails()[0].html, />Campanha b<\/a>: Moda Kids 1 e Moda Kids 2</);
  assert.deepEqual(avisosGravados().map((a) => a.href), ["/painel/campanhas/a", "/painel/campanhas/b"]);
});

test("tudo já avisado na semana não manda nada", async () => {
  const r = await rodar({
    lojas: ["pagante"],
    quebrados: { pagante: [quebrado(1)] },
    campanhas: { pagante: [campanha("a", ["g1@g.us"])] },
    avisados: ["/painel/campanhas/a"],
  });
  assert.deepEqual(r, { enviados: 0, erros: 0 });
  assert.equal(emails().length, 0);
});

test("loja sem grupo quebrado nem lê as campanhas", async () => {
  const r = await rodar({ lojas: ["pagante"], quebrados: {}, campanhas: { pagante: [campanha("a", ["g1@g.us"])] } });
  assert.deepEqual(r, { enviados: 0, erros: 0 });
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/campaign_groups").length, 0);
});

test("loja sem plano valendo nem tem os grupos lidos", async () => {
  await rodar({ lojas: ["ex-cliente"], quebrados: { "ex-cliente": [quebrado(1)] }, campanhas: { "ex-cliente": [campanha("a", ["g1@g.us"])] } });
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/groups").length, 0);
  assert.equal(emails().length, 0);
});

test("erro lendo os grupos não manda e conta erro", async () => {
  const r = await rodar({ lojas: ["pagante"], quebrados: { pagante: [quebrado(1)] }, campanhas: { pagante: [campanha("a", ["g1@g.us"])] }, erroNosGrupos: true });
  assert.deepEqual(r, { enviados: 0, erros: 1 });
  assert.equal(emails().length, 0);
});

test("e-mail que não saiu não grava o aviso (a próxima rodada tenta de novo)", async () => {
  const r = await rodar({ lojas: ["pagante"], quebrados: { pagante: [quebrado(1)] }, campanhas: { pagante: [campanha("a", ["g1@g.us"])] }, resendFora: true });
  assert.deepEqual(r, { enviados: 0, erros: 1 });
  assert.deepEqual(avisosGravados(), []);
});

test("insert do dedupe falhando: o reenvio da rodada seguinte leva a mesma idempotencyKey", async () => {
  const mundo: Mundo = { lojas: ["pagante"], quebrados: { pagante: [quebrado(1)] }, campanhas: { pagante: [campanha("a", ["g1@g.us"])] }, insertFalha: true };
  assert.deepEqual(await rodar(mundo), { enviados: 1, erros: 1 });
  const primeira = envios()[0].cabecalhos["idempotency-key"];
  chamadas.length = 0;
  await rodar(mundo);
  const segunda = envios()[0].cabecalhos["idempotency-key"];
  assert.ok(typeof primeira === "string" && primeira.startsWith("convite-quebrado/pagante/2026-11-12/"));
  assert.equal(segunda, primeira);
});
