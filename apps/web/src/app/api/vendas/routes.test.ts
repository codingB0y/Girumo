import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, mock, test } from "node:test";

import { brasiliaMonth, monthRange } from "@/lib/vendas/month";
import type { GET as ContactGet } from "./contato/route";
import type { DELETE as SaleDelete, PATCH as SalePatch } from "./[id]/route";
import type { GET as SalesGet, POST as SalesPost } from "./route";

/**
 * As rotas de vendas de ponta a ponta: o handler real, o getRouteTenantContext
 * real (com o guard de módulo do PR 3) e o cliente real do Supabase, falando
 * com um GoTrue e um PostgREST de mentira no mesmo servidor — só a rede é
 * trocada (padrão de `stores/leads.test.ts`, #340). O token Bearer escolhe
 * quem chama; a membership volta com a loja e o papel dessa pessoa.
 */

const STORE = "0b7c9a52-3d1e-4f6a-9c2b-5e8d7f1a2b3c";
const OTHER_STORE = "6f5e4d3c-2b1a-4c9d-8e7f-a0b1c2d3e4f5";
const SELLER = "5a1f0c3e-8b2d-4e7f-9a6c-1d3e5f7a9b0c";
const OWNER = "7e2d4c6b-1a3f-4b5e-8c7d-9f0a1b2c3d4e";
const LEAD = "3c9e1a7b-5d2f-4a8c-b6e0-2f4a6c8e0b1d";

/** Cada token é uma pessoa. "varredura" e "outra-loja" têm balde de rate limit só deles. */
const USERS: Record<string, { id: string; tenant: string; role: string }> = {
  "token-vendedora": { id: SELLER, tenant: STORE, role: "seller" },
  "token-dono": { id: OWNER, tenant: STORE, role: "owner" },
  "token-operador": { id: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", tenant: STORE, role: "operator" },
  "token-varredura": { id: "2b4d6f8a-0c1e-4a3b-9d5f-7e9a1c3e5b7d", tenant: STORE, role: "seller" },
  "token-outra-loja": { id: "8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d", tenant: OTHER_STORE, role: "owner" },
};

const FERNANDA = {
  id: LEAD, name: "Fernanda Lima", phone: "5511987654321",
  source_campaign: null, source_group_id: "vip1@g.us", source_group_name: "VIP 1",
};

type Seen = { method: string; url: URL; prefer: string; body: unknown };
type Reply = { status: number; body?: unknown; contentRange?: string };

const seen: Seen[] = [];
let database: (request: Seen) => Reply = () => ({ status: 500, body: { message: "sem resposta" } });

/** GoTrue e memberships respondem pelo token; o resto é do teste (e fica em `seen`). */
function answer(req: IncomingMessage, request: Seen): Reply {
  if (request.url.pathname === "/auth/v1/user") {
    const token = String(req.headers.authorization ?? "").replace(/^Bearer /i, "");
    const user = USERS[token];
    return user
      ? { status: 200, body: { id: user.id, email: `${token}@loja.test`, aud: "authenticated", role: "authenticated" } }
      : { status: 401, body: { message: "invalid JWT" } };
  }
  if (request.url.pathname === "/rest/v1/memberships") {
    const userId = request.url.searchParams.get("user_id")?.replace(/^eq\./, "");
    const user = Object.values(USERS).find((candidate) => candidate.id === userId);
    return { status: 200, body: user ? [{ tenant_id: user.tenant, role: user.role, modules: [] }] : [] };
  }
  seen.push(request);
  return database(request);
}

const server = createServer((req, res) => {
  let text = "";
  req.on("data", (chunk) => (text += chunk));
  req.on("end", () => {
    const request: Seen = {
      method: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      prefer: String(req.headers.prefer ?? ""),
      body: text ? JSON.parse(text) : undefined,
    };
    const { status, body, contentRange } = answer(req, request);
    // `.single()`/`.maybeSingle()` fora de GET pedem um objeto, não a lista.
    const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const payload = single && Array.isArray(body) ? body[0] : body;
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (payload !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
});

let contactGet: typeof ContactGet;
let salesGet: typeof SalesGet;
let salesPost: typeof SalesPost;
let salePatch: typeof SalePatch;
let saleDelete: typeof SaleDelete;

before(async () => {
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-do-gotrue-falso";
  // Rate limit em memória: sem Upstash o balde é deste processo (lido na importação).
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  ({ GET: contactGet } = await import("./contato/route"));
  ({ GET: salesGet, POST: salesPost } = await import("./route"));
  ({ PATCH: salePatch, DELETE: saleDelete } = await import("./[id]/route"));
});

after(() => {
  server.close();
});

beforeEach(() => {
  seen.length = 0;
});

function call(method: string, path: string, token: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const requestsTo = (path: string) => seen.filter((request) => request.url.pathname === path);

test("sem login → 401, e nada de vendas é lido", async () => {
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11987654321", null));
  assert.equal(res.status, 401);
  assert.equal(seen.length, 0);
});

test("busca: um cliente só, achado por qualquer forma do número, sempre no tenant", async () => {
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [FERNANDA] };
    return { status: 500 };
  };

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=(11)%2098765-4321", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: { id: LEAD, nome: "Fernanda Lima", telefone: "5511987654321" }, optout: false });
  const variants = "in.(11987654321,5511987654321,1187654321,551187654321)";
  for (const path of ["/rest/v1/optouts", "/rest/v1/leads"]) {
    const [request] = requestsTo(path);
    assert.equal(request.url.searchParams.get("tenant_id"), `eq.${STORE}`, path);
    assert.equal(request.url.searchParams.get("phone"), variants, path);
    assert.equal(request.url.searchParams.get("limit"), "1", path);
  }
});

test("número sem DDD → 400 com a frase da tela, sem ir ao banco", async () => {
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=98765-4321", "token-vendedora"));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Digite o número com DDD." });
  assert.equal(seen.length, 0);
});

test("número em opt-out: optout true e nenhum contato, sem ler o lead", async () => {
  database = ({ url }) => (url.pathname === "/rest/v1/optouts" ? { status: 200, body: [{ id: "o1" }] } : { status: 500 });

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11987654321", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: null, optout: true });
  assert.equal(requestsTo("/rest/v1/leads").length, 0);
});

test("ninguém com esse número → contato null: a tela registra como cliente novo", async () => {
  // Também é o caso dos contatos capturados em regime LID, sem telefone (spec §6, medição do §9).
  database = ({ url }) =>
    url.pathname === "/rest/v1/optouts" || url.pathname === "/rest/v1/leads" ? { status: 200, body: [] } : { status: 500 };

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11912345678", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: null, optout: false });
});

test("30 buscas por minuto por pessoa; a 31ª é 429", async () => {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const res = await contactGet(call("GET", "/api/vendas/contato?telefone=1", "token-varredura"));
    assert.equal(res.status, 400, `busca ${attempt}`);
  }
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=1", "token-varredura"));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "Muitas buscas seguidas. Espere um minuto e tente de novo." });

  // O balde é de cada pessoa: quem esgotou não derruba ninguém, nem de outra loja.
  database = () => ({ status: 200, body: [] });
  for (const token of ["token-dono", "token-outra-loja"]) {
    const other = await contactGet(call("GET", "/api/vendas/contato?telefone=11912345678", token));
    assert.equal(other.status, 200, token);
  }
});

test("dono também busca contato: 200", async () => {
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [FERNANDA] };
    return { status: 500 };
  };

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11987654321", "token-dono"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: { id: LEAD, nome: "Fernanda Lima", telefone: "5511987654321" }, optout: false });
});

test("a engine não usa a busca: 403 e nada é lido", async () => {
  const req = new Request("http://localhost/api/vendas/contato?telefone=11987654321", {
    headers: { "x-engine-token": "qualquer-token", "x-tenant-id": STORE },
  });

  const res = await contactGet(req);

  assert.equal(res.status, 403);
  assert.equal(seen.length, 0);
});

test("erro do banco → 500 genérico, a mensagem do banco fica no log e não na resposta", async () => {
  database = () => ({ status: 500, body: { message: "segredo-do-banco" } });
  const log = mock.method(console, "error", () => {});
  try {
    const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11987654321", "token-vendedora"));
    const text = await res.text();

    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(text), { error: "Não deu para concluir agora. Tente de novo." });
    assert.ok(!text.includes("segredo-do-banco"));
    assert.ok(log.mock.calls.some((c) => String(c.arguments[1]).includes("segredo-do-banco")));
  } finally {
    log.mock.restore();
  }
});

const ORDER = "9d8c7b6a-5f4e-4d3c-a2b1-0f9e8d7c6b5a";
const NEW_LEAD = "4d0f2b8c-6e3a-4b9d-a7f1-3a5b7d9f1c2e";
const CAMPAIGN = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ONE_ITEM = [{ nome: "Saia midi", quantidade: 1, valorUnitario: "59,90" }];

/** A linha de `public.orders` que as RPCs devolvem. */
function orderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER, tenant_id: STORE, phone: "5511987654321", lead_id: LEAD, group_name: "VIP 1", campaign_id: null,
    value: 59.9, created_at: new Date().toISOString(), created_by: SELLER, ...overrides,
  };
}

const rpcBody = (name: string) => requestsTo(`/rest/v1/rpc/${name}`)[0]?.body as Record<string, unknown> | undefined;

test("registrar com leadId do tenant: RPC com a vendedora de autora, campanha do lead, lead vira comprou", async () => {
  const createdAt = new Date().toISOString();
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [FERNANDA] };
    if (url.pathname === "/rest/v1/campaign_groups") {
      return {
        status: 200,
        body: [{ id: CAMPAIGN, name: "VIP outubro", slug: "vip-outubro", group_ids: ["vip1@g.us"], created_at: "2026-10-01T12:00:00Z" }],
      };
    }
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") {
      return { status: 200, body: orderRow({ campaign_id: CAMPAIGN, value: 287.7, created_at: createdAt }) };
    }
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ ...FERNANDA, status: "comprou" }] };
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/7" };
    return { status: 500 };
  };

  const res = await salesPost(
    call("POST", "/api/vendas", "token-vendedora", {
      leadId: LEAD,
      itens: [
        { nome: "Conjunto alfaiataria", quantidade: 1, valorUnitario: "149,90" },
        { nome: "Blusa bufante", quantidade: 2, valorUnitario: 68.9 },
      ],
    }),
  );

  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), {
    id: ORDER, cliente: "Fernanda Lima", telefone: "5511987654321", total: 287.7, criadaEm: createdAt,
    itens: [
      { nome: "Conjunto alfaiataria", quantidade: 1, valorUnitario: 149.9 },
      { nome: "Blusa bufante", quantidade: 2, valorUnitario: 68.9 },
    ],
    editavel: true,
  });
  const [lookup] = requestsTo("/rest/v1/leads");
  assert.equal(lookup.url.searchParams.get("tenant_id"), `eq.${STORE}`);
  assert.equal(lookup.url.searchParams.get("id"), `eq.${LEAD}`);
  assert.deepEqual(rpcBody("create_order_with_items"), {
    p_tenant_id: STORE, p_created_by: SELLER, p_lead_id: LEAD, p_phone: "5511987654321", p_group_name: "VIP 1",
    p_campaign_id: CAMPAIGN,
    p_items: [
      { name: "Conjunto alfaiataria", quantity: 1, unit_price: 149.9 },
      { name: "Blusa bufante", quantity: 2, unit_price: 68.9 },
    ],
  });
  assert.deepEqual(requestsTo("/rest/v1/leads").find((request) => request.method === "PATCH")?.body, { status: "comprou" });
});

test("leadId de outra loja → 400 Contato não encontrado., e nada é gravado", async () => {
  database = ({ url }) => (url.pathname === "/rest/v1/leads" ? { status: 200, body: [] } : { status: 500 });

  const res = await salesPost(call("POST", "/api/vendas", "token-vendedora", { leadId: LEAD, itens: ONE_ITEM }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Contato não encontrado." });
  assert.deepEqual(seen.map((request) => `${request.method} ${request.url.pathname}`), ["GET /rest/v1/leads"]);
});

test("sem leadId, cliente gravado em outro formato: usa o lead achado e não cria outro", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [{ ...FERNANDA, phone: "11987654321" }] };
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") return { status: 200, body: orderRow({ phone: "11987654321" }) };
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [FERNANDA] };
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/8" };
    return { status: 500 };
  };

  const res = await salesPost(
    call("POST", "/api/vendas", "token-vendedora", { telefone: "+55 11 98765-4321", nome: "Outro nome", itens: ONE_ITEM }),
  );

  assert.equal(res.status, 201);
  assert.equal((await res.json()).cliente, "Fernanda Lima");
  assert.equal(requestsTo("/rest/v1/rpc/upsert_lead").length, 0);
  assert.equal(rpcBody("create_order_with_items")?.p_lead_id, LEAD);
  assert.equal(rpcBody("create_order_with_items")?.p_phone, "11987654321");
});

test("sem leadId e sem cliente: cria o lead sem grupo de origem, com o nome digitado", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/upsert_lead") {
      return {
        status: 200,
        body: { id: NEW_LEAD, name: "Maria Souza", phone: "5511912345678", source_campaign: null, source_group_id: null, source_group_name: null },
      };
    }
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") {
      return { status: 200, body: orderRow({ lead_id: NEW_LEAD, phone: "5511912345678", group_name: null }) };
    }
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ id: NEW_LEAD }] };
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/9" };
    return { status: 500 };
  };

  const res = await salesPost(
    call("POST", "/api/vendas", "token-vendedora", { telefone: "11 91234-5678", nome: "  Maria Souza ", itens: ONE_ITEM }),
  );

  assert.equal(res.status, 201);
  assert.equal((await res.json()).cliente, "Maria Souza");
  assert.deepEqual(rpcBody("upsert_lead"), {
    target_tenant_id: STORE,
    target_phone: "5511912345678",
    target_name: "Maria Souza",
    target_source_group_id: null,
    target_source_group_name: null,
    target_source_campaign: null,
  });
  assert.equal(rpcBody("create_order_with_items")?.p_lead_id, NEW_LEAD);
  assert.equal(rpcBody("create_order_with_items")?.p_group_name, null);
});

test("número em opt-out: venda sem lead e sem tocar em leads; item de R$ 0 (brinde) passa", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [{ id: "o1" }] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") {
      return { status: 200, body: orderRow({ lead_id: null, phone: "5511912345678", group_name: null }) };
    }
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/10" };
    return { status: 500 };
  };

  const res = await salesPost(
    call("POST", "/api/vendas", "token-vendedora", {
      telefone: "11912345678",
      nome: "Maria",
      itens: [...ONE_ITEM, { nome: "Brinde: sacola", quantidade: 1, valorUnitario: "0" }],
    }),
  );

  assert.equal(res.status, 201);
  assert.equal((await res.json()).cliente, null);
  assert.equal(requestsTo("/rest/v1/leads").length, 0);
  assert.equal(requestsTo("/rest/v1/rpc/upsert_lead").length, 0);
  assert.equal(rpcBody("create_order_with_items")?.p_lead_id, null);
  assert.equal(rpcBody("create_order_with_items")?.p_phone, "5511912345678");
  assert.deepEqual(rpcBody("create_order_with_items")?.p_items, [
    { name: "Saia midi", quantity: 1, unit_price: 59.9 },
    { name: "Brinde: sacola", quantity: 1, unit_price: 0 },
  ]);
});

test("corpo ruim → 400 com a frase da tela, sem ir ao banco", async () => {
  const okItem = { nome: "Saia midi", quantidade: 1, valorUnitario: "59,90" };
  const items = "Preencha nome, quantidade e valor de cada produto.";
  const cases: Array<[unknown, string]> = [
    [{ telefone: "11987654321", itens: [] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, nome: "  " }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, quantidade: 0 }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, valorUnitario: "abc" }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, valorUnitario: "-5" }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, valorUnitario: "1000000" }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, valorUnitario: "0" }] }, "A venda precisa somar mais que zero."],
    // Cada item cabe no teto, a soma passa do teto do total da RPC: 400 antes de criar o lead.
    [{ telefone: "11912345678", itens: Array(2).fill({ nome: "Lote", quantidade: 9999, valorUnitario: "999999,99" }) }, items],
    [{ telefone: "9876-5432", itens: [okItem] }, "Digite o número com DDD."],
    [{ itens: [okItem] }, "Digite o número com DDD."],
    [{ leadId: "nao-e-uuid", itens: [okItem] }, "Contato não encontrado."],
    [{ telefone: "11987654321", itens: [okItem], desconto: 10 }, "Dados inválidos. Recarregue a página e tente de novo."],
    [null, "Dados inválidos. Recarregue a página e tente de novo."],
  ];

  for (const [body, error] of cases) {
    const res = await salesPost(call("POST", "/api/vendas", "token-vendedora", body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(await res.json(), { error }, JSON.stringify(body));
  }
  assert.equal(seen.length, 0);
});

test("exceção da RPC vira a frase da tela, e o lead não vira comprou", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [FERNANDA] };
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") {
      return { status: 400, body: { code: "P0001", message: "itens_invalidos", details: null, hint: null } };
    }
    return { status: 500 };
  };

  const res = await salesPost(call("POST", "/api/vendas", "token-vendedora", { leadId: LEAD, itens: ONE_ITEM }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Preencha nome, quantidade e valor de cada produto." });
  assert.equal(requestsTo("/rest/v1/leads").filter((request) => request.method === "PATCH").length, 0);
});

test("60 vendas por minuto por loja; a 61ª é 429", async () => {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const res = await salesPost(call("POST", "/api/vendas", "token-outra-loja", {}));
    assert.equal(res.status, 400, `venda ${attempt}`);
  }
  const res = await salesPost(call("POST", "/api/vendas", "token-outra-loja", {}));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "Muitas vendas seguidas. Espere um minuto e tente de novo." });
});

test("minhas vendas: sem ?mes= é o mês corrente de Brasília, e só as de quem chama", async () => {
  database = ({ url }) => (url.pathname === "/rest/v1/orders" ? { status: 200, body: [], contentRange: "*/0" } : { status: 500 });
  const month = brasiliaMonth(new Date());

  const res = await salesGet(call("GET", "/api/vendas", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { mes: month, total: 0, quantidade: 0, truncado: false, vendas: [] });
  const [orders] = requestsTo("/rest/v1/orders");
  const { start, end } = monthRange(month);
  assert.deepEqual(orders.url.searchParams.getAll("created_at"), [`gte.${start}`, `lt.${end}`]);
  assert.equal(orders.url.searchParams.get("created_by"), `eq.${SELLER}`);
  assert.equal(orders.url.searchParams.get("tenant_id"), `eq.${STORE}`);
});

test("mês fora do formato → 400 Mês inválido.", async () => {
  const res = await salesGet(call("GET", "/api/vendas?mes=2026-13", "token-vendedora"));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Mês inválido." });
  assert.equal(seen.length, 0);
});

const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

test("vendedora corrige a própria venda: trava de autora na RPC, 200 com os itens novos", async () => {
  const createdAt = hoursAgo(1);
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/rpc/replace_order_items") return { status: 200, body: orderRow({ value: 119.8, created_at: createdAt }) };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [{ id: LEAD, name: "Fernanda Lima" }] };
    return { status: 500 };
  };

  const res = await salePatch(
    call("PATCH", `/api/vendas/${ORDER}`, "token-vendedora", { itens: [{ nome: "Vestido midi", quantidade: 2, valorUnitario: "59,90" }] }),
    withId(ORDER),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    id: ORDER, cliente: "Fernanda Lima", telefone: "5511987654321", total: 119.8, criadaEm: createdAt,
    itens: [{ nome: "Vestido midi", quantidade: 2, valorUnitario: 59.9 }],
    editavel: true,
  });
  assert.deepEqual(rpcBody("replace_order_items"), {
    p_tenant_id: STORE,
    p_order_id: ORDER,
    p_items: [{ name: "Vestido midi", quantity: 2, unit_price: 59.9 }],
    p_only_author: SELLER,
  });
  assert.equal(requestsTo("/rest/v1/leads")[0].url.searchParams.get("tenant_id"), `eq.${STORE}`);
});

test("passou de 24 horas (ou não é dela) → 403 com a frase da tela", async () => {
  database = () => ({ status: 400, body: { code: "P0001", message: "fora_da_janela", details: null, hint: null } });

  const res = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-vendedora", { itens: ONE_ITEM }), withId(ORDER));

  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Passou de 24 horas: só o dono da loja corrige." });
});

test("dono corrige qualquer venda da loja, sem trava de autora nem de prazo", async () => {
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/rpc/replace_order_items") return { status: 200, body: orderRow({ created_at: hoursAgo(24 * 30) }) };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [{ id: LEAD, name: "Fernanda Lima" }] };
    return { status: 500 };
  };

  const res = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-dono", { itens: ONE_ITEM }), withId(ORDER));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).editavel, true);
  assert.equal(rpcBody("replace_order_items")?.p_only_author, null);
});

test("venda que não existe → 404; id que não é UUID nem chega ao banco", async () => {
  database = () => ({ status: 400, body: { code: "P0001", message: "pedido_nao_encontrado", details: null, hint: null } });
  const missing = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-dono", { itens: ONE_ITEM }), withId(ORDER));
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Venda não encontrada." });

  seen.length = 0;
  const patched = await salePatch(call("PATCH", "/api/vendas/123", "token-dono", { itens: ONE_ITEM }), withId("123"));
  const deleted = await saleDelete(call("DELETE", "/api/vendas/123", "token-dono"), withId("123"));
  assert.equal(patched.status, 404);
  assert.equal(deleted.status, 404);
  assert.equal(seen.length, 0);
});

test("correção com itens ruins → 400 antes da RPC", async () => {
  const res = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-vendedora", { itens: [] }), withId(ORDER));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Preencha nome, quantidade e valor de cada produto." });
  assert.equal(seen.length, 0);
});

test("vendedora apaga a própria venda dentro das 24h", async () => {
  database = ({ method, url }) =>
    method === "DELETE" && url.pathname === "/rest/v1/orders" ? { status: 200, body: [{ id: ORDER }] } : { status: 500 };
  const cutoff = Date.now() - 24 * 3_600_000;

  const res = await saleDelete(call("DELETE", `/api/vendas/${ORDER}`, "token-vendedora"), withId(ORDER));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const [deleted] = requestsTo("/rest/v1/orders");
  assert.equal(deleted.url.searchParams.get("tenant_id"), `eq.${STORE}`);
  assert.equal(deleted.url.searchParams.get("created_by"), `eq.${SELLER}`);
  const limit = Date.parse((deleted.url.searchParams.get("created_at") ?? "").replace(/^gt\./, ""));
  assert.ok(Math.abs(limit - cutoff) < 5_000, "o corte é agora − 24h");
});

test("vendedora, nada apagado (outra autora ou mais de 24h) → 403 com a frase", async () => {
  database = () => ({ status: 200, body: [] });
  const res = await saleDelete(call("DELETE", `/api/vendas/${ORDER}`, "token-vendedora"), withId(ORDER));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Passou de 24 horas: só o dono da loja corrige." });
});

test("dono apaga sem filtro de autora nem prazo; nada apagado → 404", async () => {
  database = () => ({ status: 200, body: [] });

  const res = await saleDelete(call("DELETE", `/api/vendas/${ORDER}`, "token-dono"), withId(ORDER));

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Venda não encontrada." });
  const [deleted] = requestsTo("/rest/v1/orders");
  assert.equal(deleted.url.searchParams.get("tenant_id"), `eq.${STORE}`);
  assert.equal(deleted.url.searchParams.get("created_by"), null);
  assert.equal(deleted.url.searchParams.get("created_at"), null);
});

test("falha depois da gravação (status do lead e contagem) não derruba a venda: 201 com a venda", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [FERNANDA] };
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") return { status: 200, body: orderRow() };
    return { status: 500, body: { message: "banco fora" } };
  };

  const log = mock.method(console, "error", () => undefined);

  const res = await salesPost(call("POST", "/api/vendas", "token-vendedora", { leadId: LEAD, itens: ONE_ITEM }));
  log.mock.restore();

  assert.equal(res.status, 201);
  assert.equal((await res.json()).id, ORDER);
  assert.equal(requestsTo("/rest/v1/leads").filter((request) => request.method === "PATCH").length, 1, "tentou marcar comprou");
  assert.equal(requestsTo("/rest/v1/orders").length, 1, "tentou contar os pedidos");
});

test("leadId de contato sem telefone (@lid) → 400 Contato não encontrado., e nada é gravado", async () => {
  database = ({ url }) => (url.pathname === "/rest/v1/leads" ? { status: 200, body: [{ ...FERNANDA, phone: null }] } : { status: 500 });

  const res = await salesPost(call("POST", "/api/vendas", "token-vendedora", { leadId: LEAD, itens: ONE_ITEM }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Contato não encontrado." });
  assert.equal(requestsTo("/rest/v1/rpc/create_order_with_items").length, 0);
});

test("correção: erro do banco → 500 genérico, sem a mensagem dele na resposta", async () => {
  database = () => ({ status: 500, body: { code: "XX000", message: "segredo-do-banco", details: null, hint: null } });
  const error = mock.method(console, "error", () => undefined);

  const res = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-vendedora", { itens: ONE_ITEM }), withId(ORDER));
  error.mock.restore();

  assert.equal(res.status, 500);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { error: "Não deu para concluir agora. Tente de novo." });
  assert.ok(!text.includes("segredo-do-banco"));
});

test("operador corrige qualquer venda da loja, sem trava de autora nem de prazo", async () => {
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/rpc/replace_order_items") return { status: 200, body: orderRow({ created_at: hoursAgo(24 * 30) }) };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [{ id: LEAD, name: "Fernanda Lima" }] };
    return { status: 500 };
  };

  const res = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-operador", { itens: ONE_ITEM }), withId(ORDER));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).editavel, true);
  assert.equal(rpcBody("replace_order_items")?.p_only_author, null);
});
