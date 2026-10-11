import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

/**
 * A rota de verdade — getTenantContext, zod, supabase-js — contra um Supabase
 * falso em 127.0.0.1: só a rede é trocada (padrão de `lib/stores/*.test.ts`,
 * #338/#340). O falso guarda as linhas em memória e aplica os filtros `eq.` que
 * chegam na URL. É isso que prova o `.eq("tenant_id")`: sem ele, a vendedora da
 * outra loja casaria e o teste do 404 cairia.
 */

// O Next liga o AsyncLocalStorage global no boot do servidor, e o `after()` da
// rota só existe dentro dele. Ligado ANTES de carregar a rota (import dinâmico
// no `before`), porque o Next lê esse global uma vez, quando é carregado.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

type Linha = Record<string, unknown>;
type Pedido = { metodo: string; tabela: string; url: URL; corpo: unknown };
type Rota = typeof import("./route");

const LOJA = "11111111-1111-4111-8111-111111111111";
const OUTRA_LOJA = "22222222-2222-4222-8222-222222222222";
const DONO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M_DONO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const M_VENDEDORA = "33333333-3333-4333-8333-333333333333";
const M_ADMIN = "44444444-4444-4444-8444-444444444444";
const M_VENDEDORA_DE_OUTRA = "55555555-5555-4555-8555-555555555555";

let banco: Record<string, Linha[]> = {};
const pedidos: Pedido[] = [];
const tarefasDepois: unknown[] = [];
let rota: Rota;
let chamar: (handler: () => Promise<Response>) => Promise<Response>;

/** Só `eq.` filtra neste falso; select, order, limit e `not.is.null` passam direto. */
function casa(linha: Linha, url: URL): boolean {
  for (const [coluna, valor] of url.searchParams) {
    if (valor.startsWith("eq.") && String(linha[coluna]) !== valor.slice(3)) return false;
  }
  return true;
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((pronto) => {
    let bruto = "";
    req.on("data", (pedaco) => {
      bruto += pedaco;
    });
    req.on("end", () => pronto(bruto ? JSON.parse(bruto) : undefined));
  });
}

const supabase = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  const metodo = req.method ?? "GET";
  const corpo = await lerCorpo(req);
  res.setHeader("Content-Type", "application/json");

  // `getTenantContext` com Bearer pergunta ao Auth de quem é o token.
  if (url.pathname === "/auth/v1/user") {
    res.end(
      JSON.stringify({
        id: DONO,
        email: "dono@loja.test",
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    );
    return;
  }

  const tabela = url.pathname.replace("/rest/v1/", "");
  pedidos.push({ metodo, tabela, url, corpo });
  const linhas = banco[tabela] ?? [];

  if (metodo === "GET") {
    res.end(JSON.stringify(linhas.filter((l) => casa(l, url))));
    return;
  }
  if (metodo === "PATCH") {
    const mudadas = linhas.filter((l) => casa(l, url)).map((l) => ({ ...l, ...(corpo as Linha) }));
    banco = { ...banco, [tabela]: linhas.map((l) => mudadas.find((m) => m.id === l.id) ?? l) };
    res.end(JSON.stringify(mudadas));
    return;
  }
  if (metodo === "POST") {
    const nova: Linha = { id: randomUUID(), created_at: "2026-10-07T12:00:00.000Z", ...(corpo as Linha) };
    banco = { ...banco, [tabela]: [...linhas, nova] };
    res.statusCode = 201;
    // `.insert().select().single()` pede objeto; o insert do log não pede nada de volta.
    const devolve = String(req.headers.prefer ?? "").includes("return=representation");
    const objeto = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    res.end(devolve ? JSON.stringify(objeto ? nova : [nova]) : "");
    return;
  }
  res.statusCode = 405;
  res.end("{}");
});

function membro(id: string, tenantId: string, role: string, extra: Linha = {}): Linha {
  return {
    id,
    tenant_id: tenantId,
    user_id: null,
    role,
    modules: [],
    invited_email: `${role}@loja.test`,
    accepted_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

/** Uma loja com dono, vendedora e admin; outra loja com a vendedora dela. */
function bancoInicial(papelDoDono: string): Record<string, Linha[]> {
  return {
    memberships: [
      membro(M_DONO, LOJA, papelDoDono, {
        user_id: DONO,
        invited_email: null,
        accepted_at: "2026-01-01T00:00:00.000Z",
      }),
      membro(M_VENDEDORA, LOJA, "seller"),
      membro(M_ADMIN, LOJA, "admin"),
      membro(M_VENDEDORA_DE_OUTRA, OUTRA_LOJA, "seller"),
    ],
    // Plano sem teto de equipe: `assertPlanLimit` libera sem contar.
    subscriptions: [{ tenant_id: LOJA, status: "active", metadata: null, current_period_end: null, plans: { limits: {} } }],
    users: [],
    logs: [],
  };
}

function pedido(metodo: string, corpo?: unknown): Request {
  return new Request("http://localhost/api/members", {
    method: metodo,
    headers: { authorization: "Bearer token-do-dono", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

function escritas(metodo: string, tabela: string): Linha[] {
  return pedidos.filter((p) => p.metodo === metodo && p.tabela === tabela).map((p) => p.corpo as Linha);
}

function linhaDe(id: string): Linha | undefined {
  return banco.memberships.find((m) => m.id === id);
}

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-do-falso";
  process.env.SUPABASE_ANON_KEY = "anon-do-falso";
  process.env.AUTH_SECRET ??= "segredo-do-teste";
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  // Escopo falso de requisição: o `after()` da rota só entrega a tarefa aqui —
  // o e-mail do convite não sai em teste.
  const escopo = {
    afterContext: { after: (tarefa: unknown) => void tarefasDepois.push(tarefa) },
  } as unknown as WorkStore;
  chamar = (handler) => workAsyncStorage.run(escopo, handler);
  rota = await import("./route");
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  banco = bancoInicial("owner");
  pedidos.length = 0;
  tarefasDepois.length = 0;
});

/* -------------------------------------------------------------------------- */
/* POST: convite com função e módulos                                          */
/* -------------------------------------------------------------------------- */

test("POST: vendedora com Postar grava papel e módulos na linha do convite", async () => {
  const res = await chamar(() =>
    rota.POST(pedido("POST", { email: " Carla@Loja.test ", role: "seller", modules: ["postar", "postar"] })),
  );
  assert.equal(res.status, 201);
  const corpo = (await res.json()) as Linha;

  const [convite] = escritas("POST", "memberships");
  assert.deepEqual(convite, {
    tenant_id: LOJA,
    user_id: null,
    role: "seller",
    modules: ["postar"],
    invited_by: DONO,
    invited_email: "carla@loja.test",
    accepted_at: null,
  });
  assert.deepEqual(corpo.modules, ["postar"]);

  const [log] = escritas("POST", "logs");
  assert.equal(log.event, "membership.invited");
  assert.deepEqual(log.metadata, { membership_id: corpo.id, role: "seller", modules: ["postar"] });
  assert.equal(tarefasDepois.length, 1, "o e-mail do convite continua saindo depois da resposta");
});

test("POST: vendedora sem extras grava modules vazio (Registrar vendas é implícito)", async () => {
  const res = await chamar(() => rota.POST(pedido("POST", { email: "bia@loja.test", role: "seller" })));
  assert.equal(res.status, 201);
  assert.deepEqual(escritas("POST", "memberships")[0].modules, []);
});

test("POST: módulo em administrador ou operador é 400 e nada é gravado", async () => {
  for (const role of ["admin", "operator"]) {
    const res = await chamar(() =>
      rota.POST(pedido("POST", { email: "ana@loja.test", role, modules: role === "admin" ? ["postar"] : [] })),
    );
    assert.equal(res.status, 400, role);
    assert.deepEqual(await res.json(), { error: "Só a vendedora tem módulos." });
  }
  assert.equal(escritas("POST", "memberships").length, 0);
});

/**
 * O `normalizeRole` antigo (route.ts:19-22 em 0287eba0) transformava qualquer
 * papel desconhecido em `operator`. Com a vendedora na tela, isso daria MAIS
 * acesso a quem devia ter menos.
 */
test("POST: papel desconhecido ou ausente é 400 e nunca vira operador", async () => {
  for (const role of ["owner", "gerente", undefined]) {
    const res = await chamar(() => rota.POST(pedido("POST", { email: "x@loja.test", role })));
    assert.equal(res.status, 400, String(role));
    assert.deepEqual(await res.json(), { error: "Função inválida." });
  }
  assert.equal(escritas("POST", "memberships").length, 0);
});

test("POST: módulo que não existe é 400", async () => {
  const res = await chamar(() =>
    rota.POST(pedido("POST", { email: "x@loja.test", role: "seller", modules: ["grupos"] })),
  );
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Módulo desconhecido." });
  assert.equal(escritas("POST", "memberships").length, 0);
});

/* -------------------------------------------------------------------------- */
/* GET                                                                         */
/* -------------------------------------------------------------------------- */

test("GET devolve os módulos de cada membro, só da loja do contexto", async () => {
  banco = {
    ...banco,
    memberships: banco.memberships.map((m) => (m.id === M_VENDEDORA ? { ...m, modules: ["postar"] } : m)),
  };
  const res = await chamar(() => rota.GET(pedido("GET")));
  assert.equal(res.status, 200);
  const lista = (await res.json()) as Linha[];
  assert.deepEqual(lista.map((m) => m.id).sort(), [M_DONO, M_VENDEDORA, M_ADMIN].sort());
  assert.deepEqual(lista.find((m) => m.id === M_VENDEDORA)?.modules, ["postar"]);
  const leitura = pedidos.find(
    (p) => p.metodo === "GET" && p.tabela === "memberships" && !p.url.searchParams.has("user_id"),
  );
  assert.ok(leitura?.url.searchParams.get("select")?.split(",").includes("modules"), "o select do GET pede modules");
});

/* -------------------------------------------------------------------------- */
/* PATCH: Editar acesso da vendedora                                          */
/* -------------------------------------------------------------------------- */

test("PATCH: dono liga o Postar da vendedora e o evento entra no log", async () => {
  const res = await chamar(() => rota.PATCH(pedido("PATCH", { id: M_VENDEDORA, modules: ["postar"] })));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: M_VENDEDORA, modules: ["postar"] });

  const escrita = pedidos.find((p) => p.metodo === "PATCH");
  assert.deepEqual(escrita?.corpo, { modules: ["postar"] });
  assert.equal(escrita?.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(escrita?.url.searchParams.get("role"), "eq.seller");
  assert.deepEqual(linhaDe(M_VENDEDORA)?.modules, ["postar"]);

  const [log] = escritas("POST", "logs");
  assert.equal(log.event, "membership.modules_changed");
  assert.equal(log.tenant_id, LOJA);
  assert.equal(log.actor_user_id, DONO);
  assert.deepEqual(log.metadata, {
    membership_id: M_VENDEDORA,
    role: "seller",
    modules_before: [],
    modules_after: ["postar"],
  });
});

test("PATCH em quem não é vendedora: 400 e nada gravado", async () => {
  const res = await chamar(() => rota.PATCH(pedido("PATCH", { id: M_ADMIN, modules: ["postar"] })));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Só a vendedora tem módulos." });
  assert.equal(pedidos.some((p) => p.metodo === "PATCH"), false);
  assert.equal(escritas("POST", "logs").length, 0);
});

test("PATCH na vendedora de outra loja: 404 e a linha dela fica intacta", async () => {
  const res = await chamar(() =>
    rota.PATCH(pedido("PATCH", { id: M_VENDEDORA_DE_OUTRA, modules: ["postar"] })),
  );
  assert.equal(res.status, 404);
  assert.equal(pedidos.some((p) => p.metodo === "PATCH"), false, "não tentou escrever na outra loja");
  assert.deepEqual(linhaDe(M_VENDEDORA_DE_OUTRA)?.modules, []);
});

test("PATCH por operador: 403 antes de ler o alvo", async () => {
  banco = bancoInicial("operator");
  const res = await chamar(() => rota.PATCH(pedido("PATCH", { id: M_VENDEDORA, modules: ["postar"] })));
  assert.equal(res.status, 403);
  const leituras = pedidos.filter((p) => p.tabela === "memberships" && !p.url.searchParams.has("user_id"));
  assert.equal(leituras.length, 0);
  assert.deepEqual(linhaDe(M_VENDEDORA)?.modules, []);
});

test("PATCH com corpo inválido: 400 sem tocar no banco", async () => {
  const ruins = [
    { id: "nao-e-uuid", modules: [] },
    { id: M_VENDEDORA, modules: ["grupos"] },
    { id: M_VENDEDORA, modules: [], role: "admin" },
    { id: M_VENDEDORA },
  ];
  for (const corpo of ruins) {
    const res = await chamar(() => rota.PATCH(pedido("PATCH", corpo)));
    assert.equal(res.status, 400, JSON.stringify(corpo));
    assert.deepEqual(await res.json(), { error: "Pedido inválido." });
  }
  assert.equal(pedidos.some((p) => p.metodo === "PATCH"), false);
});
