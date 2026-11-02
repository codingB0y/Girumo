import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { GET as RotaGet, POST as RotaPost } from "./route";

/**
 * GET/POST /api/instances contra um Supabase + Evolution de mentira (desenho de `campanhas/route.test.ts`).
 * A tela Conectar só vê os números dos grupos; o número do atendimento (`purpose = 'privado'`) vem com o
 * add-on do Recuperar/Rastreio, não ocupa vaga do plano e a loja só tem um.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown; cabecalhos?: Record<string, string> };

type Mundo = {
  instancias: Record<string, unknown>[];
  settings: unknown[];
  /** O banco falha ao ler `tenant_settings`. */
  settingsFora: boolean;
  /** `null` = a loja não tem assinatura. */
  limites: Record<string, number> | null;
  insert: Resposta;
  papel: string;
};

const GRUPOS_CONECTADO = {
  id: "inst-g",
  tenant_id: "loja-a",
  name: "WhatsApp",
  phone: "556299990001",
  purpose: "grupos",
  status: "connected",
  qr_code: null,
  provider: "evolution",
  provider_instance_id: "gr_inst-g",
  last_seen_at: null,
  connected_at: "2026-09-01T00:00:00Z",
  metadata: {},
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const ATENDIMENTO_CONECTADO = {
  ...GRUPOS_CONECTADO,
  id: "inst-p",
  name: "Atendimento",
  phone: "5562988880002",
  purpose: "privado",
  provider_instance_id: "gr_inst-p",
};

const chamadas: Chamada[] = [];
let mundo: Mundo;

/** Zera o histórico e monta o mundo: loja sem número, sem opt-in do add-on, plano sem teto. */
function prepara(parcial: Partial<Mundo> = {}): void {
  chamadas.length = 0;
  mundo = {
    instancias: [],
    settings: [],
    settingsFora: false,
    limites: {},
    insert: {
      status: 201,
      corpo: { id: "nova", name: "WhatsApp", phone: null, status: "pending", created_at: "2026-10-30T00:00:00Z" },
    },
    papel: "owner",
    ...parcial,
  };
}

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo, cabecalhos } = responder(chamada);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    for (const [nome, valor] of Object.entries(cabecalhos ?? {})) res.setHeader(nome, valor);
    res.end(JSON.stringify(corpo ?? null));
  });
});

function responder({ metodo, url }: Chamada): Resposta {
  const { pathname } = url;
  if (pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
  if (pathname === "/rest/v1/memberships") {
    return { status: 200, corpo: [{ tenant_id: "loja-a", role: mundo.papel, modules: [] }] };
  }
  if (pathname === "/rest/v1/subscriptions") {
    const assinatura = { status: "active", metadata: {}, current_period_end: null, plans: { limits: mundo.limites } };
    return { status: 200, corpo: mundo.limites ? [assinatura] : [] };
  }
  if (pathname === "/rest/v1/tenant_settings") {
    return mundo.settingsFora
      ? { status: 500, corpo: { code: "XX000", details: null, hint: null, message: "banco fora do ar" } }
      : { status: 200, corpo: mundo.settings };
  }
  if (pathname === "/rest/v1/instances") {
    if (metodo === "GET") {
      const finalidade = url.searchParams.get("purpose");
      return {
        status: 200,
        corpo: mundo.instancias.filter((i) => !finalidade || finalidade === `eq.${i.purpose}`),
      };
    }
    // A contagem do plano: só os números dos grupos, a loja tem 0 deles; contando tudo, 1.
    if (metodo === "HEAD") {
      const total = url.searchParams.get("purpose") === "eq.grupos" ? 0 : 1;
      return { status: 200, cabecalhos: { "Content-Range": `*/${total}` } };
    }
    if (metodo === "POST") return mundo.insert;
    if (metodo === "PATCH") return { status: 204 };
  }
  if (pathname === "/rest/v1/logs" && metodo === "POST") return { status: 201 };
  // Evolution (mesmo servidor): criar a instância e registrar o webhook.
  if (pathname === "/instance/create" && metodo === "POST") return { status: 201, corpo: {} };
  if (pathname === "/webhook/set/gr_nova" && metodo === "POST") return { status: 201, corpo: {} };
  return { status: 500, corpo: { message: `inesperado: ${metodo} ${pathname}` } };
}

let GET: typeof RotaGet;
let POST: typeof RotaPost;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const origem = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = origem;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.EVOLUTION_API_URL = origem;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  process.env.EVOLUTION_WEBHOOK_SECRET = "segredo-do-webhook-falso";
  process.env.NEXT_PUBLIC_APP_URL = "http://girumo.test";
  ({ GET, POST } = await import("./route"));
});

after(() => {
  servidor.close();
});

function pedir(metodo: "GET" | "POST", corpo?: unknown): Request {
  return new Request("http://girumo.test/api/instances", {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-a", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

test("GET devolve só os números dos grupos: a tela Conectar nunca vê o do atendimento", async () => {
  prepara({ instancias: [ATENDIMENTO_CONECTADO, GRUPOS_CONECTADO] });
  const res = await GET(pedir("GET"));
  assert.deepEqual(((await res.json()) as { id: string }[]).map((i) => i.id), ["inst-g"]);
  assert.equal(feitas("GET", "/rest/v1/instances")[0].url.searchParams.get("purpose"), "eq.grupos");
});

test("loja só com o número do atendimento: a lista do Conectar vem vazia (a tela cria o dos grupos)", async () => {
  prepara({ instancias: [ATENDIMENTO_CONECTADO] });
  assert.deepEqual(await (await GET(pedir("GET"))).json(), []);
});

test("POST de grupos: a vaga do plano conta só os números dos grupos", async () => {
  prepara({ instancias: [ATENDIMENTO_CONECTADO], limites: { whatsapp_instances: 1 } });
  const res = await POST(pedir("POST", { name: "WhatsApp", numero_perfil: "antigo" }));
  // Mutante: sem o countFilter a contagem é */1 e o plano devolve 402.
  assert.equal(res.status, 201);
  assert.equal(feitas("HEAD", "/rest/v1/instances")[0].url.searchParams.get("purpose"), "eq.grupos");
  assert.equal((feitas("POST", "/rest/v1/instances")[0].corpo as Record<string, unknown>).purpose, "grupos");
});

test("POST do número do atendimento sem Recuperar nem Rastreio: 403 e nada é criado", async () => {
  prepara({ settings: [{ recuperar_enabled: false, rastreio_enabled: false }] });
  const res = await POST(pedir("POST", { purpose: "privado" }));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    error: "O número do atendimento vem com o Recuperar ou o Rastreio. Ative um deles primeiro.",
    code: "privado_sem_addon",
  });
  assert.equal(feitas("POST", "/rest/v1/instances").length, 0);
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/instance/")).length, 0);
});

test("POST do número do atendimento com o add-on: cria privado sem olhar o plano", async () => {
  prepara({ settings: [{ recuperar_enabled: true, rastreio_enabled: false }], limites: null });
  const res = await POST(pedir("POST", { purpose: "privado", numero_perfil: "novo" }));
  assert.equal(res.status, 201);
  const linha = feitas("POST", "/rest/v1/instances")[0].corpo as Record<string, unknown>;
  assert.equal(linha.purpose, "privado");
  assert.equal(linha.numero_perfil, null);
  assert.equal(linha.name, "Atendimento");
  assert.equal(feitas("HEAD", "/rest/v1/instances").length, 0);
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 0);
  assert.equal(feitas("POST", "/instance/create").length, 1);
});

test("o telefone do corpo não entra na linha do número do atendimento (vem do pareamento); no dos grupos, entra", async () => {
  prepara({ settings: [{ recuperar_enabled: true, rastreio_enabled: false }], limites: null });
  assert.equal((await POST(pedir("POST", { purpose: "privado", phone: "5511900000009" }))).status, 201);
  assert.equal((feitas("POST", "/rest/v1/instances")[0].corpo as Record<string, unknown>).phone, null);

  prepara({ limites: {} });
  assert.equal((await POST(pedir("POST", { phone: "5511900000009", numero_perfil: "antigo" }))).status, 201);
  assert.equal((feitas("POST", "/rest/v1/instances")[0].corpo as Record<string, unknown>).phone, "5511900000009");
});

test("segundo número do atendimento (clique duplo): 409 e nenhuma instância nova na Evolution", async () => {
  prepara({
    settings: [{ recuperar_enabled: true, rastreio_enabled: false }],
    insert: { status: 409, corpo: { code: "23505", details: null, hint: null, message: "duplicate key value violates unique constraint \"instances_one_privado_per_tenant\"" } },
  });
  const res = await POST(pedir("POST", { purpose: "privado" }));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "Esta loja já tem um número do atendimento." });
  assert.equal(feitas("POST", "/instance/create").length, 0);
});

test("tipo de número desconhecido: 400", async () => {
  prepara({});
  assert.equal((await POST(pedir("POST", { purpose: "vendas" }))).status, 400);
});

test("tipo de número desconhecido: a mensagem é a do contrato e nada é criado", async () => {
  prepara({});
  const res = await POST(pedir("POST", { purpose: null }));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Tipo de número inválido." });
  assert.equal(feitas("POST", "/rest/v1/instances").length, 0);
});

test("papel sem permissão: 403 antes de olhar o tipo, o add-on ou o plano", async () => {
  prepara({ papel: "operator", settings: [{ recuperar_enabled: true, rastreio_enabled: true }] });
  const res = await POST(pedir("POST", { purpose: "privado" }));
  assert.equal(res.status, 403);
  assert.equal(feitas("GET", "/rest/v1/tenant_settings").length, 0);
  assert.equal(feitas("POST", "/rest/v1/instances").length, 0);
});

test("leitura do add-on falha: fecha com 500, não cria o número do atendimento", async () => {
  prepara({ settingsFora: true });
  const res = await POST(pedir("POST", { purpose: "privado" }));
  assert.equal(res.status, 500);
  assert.equal(feitas("POST", "/rest/v1/instances").length, 0);
  assert.equal(feitas("POST", "/instance/create").length, 0);
});
