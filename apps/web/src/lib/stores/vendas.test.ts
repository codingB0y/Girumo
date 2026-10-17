import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, mock, test } from "node:test";

import type * as Store from "./vendas";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (padrão de
 * `leads.test.ts`, #340): a query que sai daqui é a de produção. O que cada
 * teste confere é o filtro — o service-role passa por cima do RLS, então
 * `tenant_id` e `created_by` na URL são a proteção real.
 */

type Seen = { method: string; url: URL; prefer: string; body: unknown };
type Reply = { status: number; body?: unknown; contentRange?: string };

const seen: Seen[] = [];
let reply: (request: Seen) => Reply = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let text = "";
  req.on("data", (chunk) => (text += chunk));
  req.on("end", () => {
    const request: Seen = {
      method: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      body: text ? JSON.parse(text) : undefined,
    };
    seen.push(request);
    const { status, body, contentRange } = reply(request);
    const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const payload = single && Array.isArray(body) ? body[0] : body;
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (payload !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
});

let store: typeof Store;

before(async () => {
  await new Promise<void>((ready) => postgrest.listen(0, "127.0.0.1", ready));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  store = await import("./vendas");
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  seen.length = 0;
});

const SELLER = { tenantId: "loja-a", authUserId: "vendedora-1", role: "seller" } as const;
const OWNER = { tenantId: "loja-a", authUserId: "dono-1", role: "owner" } as const;
const NOW = new Date("2026-10-07T15:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const ITEMS = [{ name: "Saia midi", quantity: 1, unit_price: 59.9 }];
const LEAD_SELECT = "id,name,phone,source_campaign,source_group_id,source_group_name";

/** Todos os parâmetros da URL: filtros, select, order, limit. */
const params = (url: URL) => Object.fromEntries(url.searchParams);
const requestsTo = (path: string) => seen.filter((request) => request.url.pathname === path);

test("lead pelo número: no tenant, em qualquer variante, o que entrou por último, uma linha", async () => {
  const lead = {
    id: "l1", name: "Fernanda Lima", phone: "11987654321",
    source_campaign: null, source_group_id: "vip1@g.us", source_group_name: "VIP 1",
  };
  reply = () => ({ status: 200, body: [lead] });

  assert.deepEqual(await store.findLeadByPhones("loja-a", ["11987654321", "5511987654321"]), lead);

  assert.equal(seen[0].url.pathname, "/rest/v1/leads");
  assert.deepEqual(params(seen[0].url), {
    select: LEAD_SELECT,
    tenant_id: "eq.loja-a",
    phone: "in.(11987654321,5511987654321)",
    order: "entered_at.desc",
    limit: "1",
  });

  reply = () => ({ status: 200, body: [] });
  assert.equal(await store.findLeadByPhones("loja-a", ["11987654321"]), null);
});

test("lead por id: só do tenant; de outra loja volta null", async () => {
  reply = () => ({ status: 200, body: [] });

  assert.equal(await store.findLeadById("loja-a", "lead-de-outra-loja"), null);

  assert.deepEqual(params(seen[0].url), { select: LEAD_SELECT, tenant_id: "eq.loja-a", id: "eq.lead-de-outra-loja" });
});

test("opt-out vale para qualquer variante do número", async () => {
  reply = () => ({ status: 200, body: [{ id: "o1" }] });
  assert.equal(await store.isOptedOutAny("loja-a", ["11987654321", "5511987654321"]), true);
  assert.equal(seen[0].url.pathname, "/rest/v1/optouts");
  assert.deepEqual(params(seen[0].url), {
    select: "id",
    tenant_id: "eq.loja-a",
    phone: "in.(11987654321,5511987654321)",
    limit: "1",
  });

  reply = () => ({ status: 200, body: [] });
  assert.equal(await store.isOptedOutAny("loja-a", ["11987654321"]), false);
});

const MONTH_ROWS = [
  {
    id: "p1", lead_id: "l1", phone: "5511987654321", value: 287.7, created_at: hoursAgo(2), created_by: "vendedora-1", source: "manual",
    order_items: [
      { name: "Blusa bufante", quantity: 2, unit_price: 68.9, position: 1 },
      { name: "Conjunto alfaiataria", quantity: 1, unit_price: 149.9, position: 0 },
    ],
  },
  {
    id: "p2", lead_id: null, phone: "5511912345678", value: 534, created_at: hoursAgo(30), created_by: "vendedora-1", source: "manual",
    order_items: [{ name: "Calça wide leg", quantity: 6, unit_price: 89, position: 0 }],
  },
  // Pedido de antes dos itens: a tela mostra "Pedido sem itens".
  { id: "p3", lead_id: "l1", phone: "5511987654321", value: 50, created_at: hoursAgo(200), created_by: "vendedora-1", source: "manual", order_items: [] },
];

/** Venda que o motor do Bling grava: sem autora e sem itens. */
const BLING_ROW = {
  id: "b1", lead_id: null, phone: "5511955554444", value: 1840, created_at: hoursAgo(1), created_by: null, source: "bling", order_items: [],
};

/** Contagem HEAD de `bling_connections`: nenhuma conexão ativa, salvo se o teste disser outra coisa. */
const SEM_BLING: Reply = { status: 200, contentRange: "*/0" };

function monthReply(contentRange: string | undefined, rows: unknown[] = MONTH_ROWS, bling: Reply = SEM_BLING) {
  return ({ url }: Seen): Reply => {
    if (url.pathname === "/rest/v1/orders") return { status: 200, body: rows, contentRange };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [{ id: "l1", name: "Patrícia Gomes" }] };
    if (url.pathname === "/rest/v1/bling_connections") return bling;
    return { status: 500 };
  };
}

test("vendas do mês: só as de quem chama, na faixa de Brasília, itens em ordem, cliente e editável da vendedora", async () => {
  reply = monthReply("0-2/3");

  const result = await store.listMonthSales(SELLER, "2026-10", NOW);

  assert.deepEqual(result, {
    mes: "2026-10",
    total: 871.7,
    quantidade: 3,
    truncado: false,
    vendas: [
      {
        id: "p1", cliente: "Patrícia Gomes", telefone: "5511987654321", total: 287.7, criadaEm: hoursAgo(2),
        itens: [
          { nome: "Conjunto alfaiataria", quantidade: 1, valorUnitario: 149.9 },
          { nome: "Blusa bufante", quantidade: 2, valorUnitario: 68.9 },
        ],
        editavel: true,
        origem: "manual",
      },
      {
        id: "p2", cliente: null, telefone: "5511912345678", total: 534, criadaEm: hoursAgo(30),
        itens: [{ nome: "Calça wide leg", quantidade: 6, valorUnitario: 89 }],
        editavel: false,
        origem: "manual",
      },
      {
        id: "p3", cliente: "Patrícia Gomes", telefone: "5511987654321", total: 50, criadaEm: hoursAgo(200), itens: [],
        editavel: false, origem: "manual",
      },
    ],
    blingAtivo: false,
  });

  const [orders] = requestsTo("/rest/v1/orders");
  assert.equal(orders.method, "GET");
  assert.match(orders.prefer, /count=exact/);
  assert.equal(
    orders.url.searchParams.get("select"),
    "id,lead_id,phone,value,created_at,created_by,source,order_items(name,quantity,unit_price,position)",
  );
  // Mutantes: sem tenant (o service-role lê todas as lojas), sem autora ou com as vendas
  // do Bling (a vendedora veria o caixa da loja), mês em UTC (a venda das 22h do dia 31
  // cairia no mês seguinte).
  assert.equal(orders.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(orders.url.searchParams.get("created_by"), "eq.vendedora-1");
  assert.equal(orders.url.searchParams.get("or"), null);
  assert.deepEqual(orders.url.searchParams.getAll("created_at"), ["gte.2026-10-01T03:00:00.000Z", "lt.2026-11-01T03:00:00.000Z"]);
  assert.equal(orders.url.searchParams.get("order"), "created_at.desc");
  assert.equal(orders.url.searchParams.get("limit"), "1000");
  assert.deepEqual(requestsTo("/rest/v1/leads").map((request) => params(request.url)), [
    { select: "id,name", tenant_id: "eq.loja-a", id: "in.(l1)" },
  ]);
});

test("dono: as vendas dele, editáveis sem prazo, e as do Bling da loja, que nunca são editáveis", async () => {
  reply = monthReply("0-3/4", [BLING_ROW, ...MONTH_ROWS]);

  const result = await store.listMonthSales(OWNER, "2026-10", NOW);

  assert.deepEqual(
    result.vendas.map((venda) => [venda.id, venda.origem, venda.editavel]),
    [["b1", "bling", false], ["p1", "manual", true], ["p2", "manual", true], ["p3", "manual", true]],
  );
  assert.equal(result.total, 2711.7);
  const [orders] = requestsTo("/rest/v1/orders");
  // A venda do Bling não tem autora (created_by null): só com o `or` ela chega à tela do dono.
  assert.equal(orders.url.searchParams.get("or"), "(created_by.eq.dono-1,source.eq.bling)");
  assert.equal(orders.url.searchParams.get("created_by"), null);
  assert.equal(orders.url.searchParams.get("tenant_id"), "eq.loja-a");
});

test("venda do Bling nunca é editável, em nenhum papel, nem dentro das 24h e com autora", async () => {
  for (const caller of [OWNER, SELLER]) {
    reply = monthReply("0-0/1", [{ ...BLING_ROW, created_by: caller.authUserId }]);

    const [venda] = (await store.listMonthSales(caller, "2026-10", NOW)).vendas;

    assert.deepEqual([venda.origem, venda.editavel], ["bling", false], caller.role);
  }
});

test("blingAtivo: conexão ativa da loja, numa contagem HEAD filtrada por tenant e status", async () => {
  reply = monthReply("0-2/3", MONTH_ROWS, { status: 200, contentRange: "*/1" });

  assert.equal((await store.listMonthSales(SELLER, "2026-10", NOW)).blingAtivo, true);

  const [bling] = requestsTo("/rest/v1/bling_connections");
  assert.equal(bling.method, "HEAD");
  assert.match(bling.prefer, /count=exact/);
  // Mutantes: sem tenant (qualquer loja com Bling acenderia o aviso), sem status (a desconectada também).
  assert.equal(bling.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(bling.url.searchParams.get("status"), "eq.ativa");

  reply = monthReply("0-2/3");
  assert.equal((await store.listMonthSales(SELLER, "2026-10", NOW)).blingAtivo, false);
  // Tabela que ainda não existe: o PostgREST responde 404 sem corpo ao HEAD.
  reply = monthReply("0-2/3", MONTH_ROWS, { status: 404 });
  assert.equal((await store.listMonthSales(SELLER, "2026-10", NOW)).blingAtivo, false);
});

test("conexão do Bling ilegível: blingAtivo false, a lista vem inteira e o erro vai ao log uma vez só", async () => {
  reply = monthReply("0-2/3", MONTH_ROWS, { status: 500, body: { message: "banco fora" } });
  const log = mock.method(console, "error", () => undefined);
  try {
    const first = await store.listMonthSales(OWNER, "2026-10", NOW);
    const second = await store.listMonthSales(OWNER, "2026-10", NOW);

    assert.equal(first.blingAtivo, false);
    assert.equal(second.blingAtivo, false);
    assert.equal(second.vendas.length, 3);
    assert.equal(log.mock.callCount(), 1);
  } finally {
    log.mock.restore();
  }
});

test("origem do pedido: só no tenant; bling, manual, ou null quando não existe ou é de outra loja", async () => {
  reply = () => ({ status: 200, body: [{ source: "bling" }] });
  assert.equal(await store.origemDoPedido("loja-a", "p1"), "bling");
  assert.equal(seen[0].method, "GET");
  assert.deepEqual(params(seen[0].url), { select: "source", tenant_id: "eq.loja-a", id: "eq.p1" });

  reply = () => ({ status: 200, body: [{ source: "manual" }] });
  assert.equal(await store.origemDoPedido("loja-a", "p1"), "manual");

  reply = () => ({ status: 200, body: [] });
  assert.equal(await store.origemDoPedido("loja-a", "pedido-de-outra-loja"), null);

  // Sem saber a origem, a rota não pode decidir: o erro sobe.
  reply = () => ({ status: 500, body: { message: "banco fora" } });
  await assert.rejects(store.origemDoPedido("loja-a", "p1"), /banco fora/);
});

test("mais de 1000 no mês: truncado, e o total é só o das linhas que vieram", async () => {
  reply = monthReply("0-0/1500", [MONTH_ROWS[1]]);

  const result = await store.listMonthSales(SELLER, "2026-10", NOW);

  assert.equal(result.truncado, true);
  assert.equal(result.quantidade, 1500);
  assert.equal(result.total, 534);
});

test("contagem que não veio é erro, nunca um 'não truncou' que ninguém mediu", async () => {
  reply = monthReply(undefined, []);
  await assert.rejects(store.listMonthSales(SELLER, "2026-10", NOW), /Contagem/);
});

test("nomes dos clientes em lotes de 100, sem repetir id e sempre no tenant", async () => {
  reply = ({ url }) => ({
    status: 200,
    body: (url.searchParams.get("id") ?? "")
      .replace(/^in\.\(|\)$/g, "")
      .split(",")
      .map((id) => ({ id, name: `Cliente ${id}` })),
  });
  const ids = Array.from({ length: 150 }, (_, index) => `lead-${index}`);

  const names = await store.leadNames("loja-a", [...ids, "lead-0", null]);

  assert.equal(names.size, 150);
  assert.equal(names.get("lead-149"), "Cliente lead-149");
  const sizes = seen.map((request) => (request.url.searchParams.get("id") ?? "").split(",").length).sort((a, b) => b - a);
  assert.deepEqual(sizes, [100, 50]);
  for (const request of seen) assert.equal(request.url.searchParams.get("tenant_id"), "eq.loja-a");

  seen.length = 0;
  assert.equal((await store.leadNames("loja-a", [null])).size, 0);
  assert.equal(seen.length, 0);
});

test("apagar: vendedora só a própria e dentro das 24h; dono, qualquer venda do tenant", async () => {
  reply = () => ({ status: 200, body: [{ id: "p1" }] });
  assert.equal(await store.deleteSale(SELLER, "p1", NOW), true);
  assert.equal(seen[0].method, "DELETE");
  assert.deepEqual(params(seen[0].url), {
    tenant_id: "eq.loja-a",
    id: "eq.p1",
    created_by: "eq.vendedora-1",
    created_at: "gt.2026-10-06T15:00:00.000Z",
    select: "id",
  });

  reply = () => ({ status: 200, body: [] });
  assert.equal(await store.deleteSale(SELLER, "p1", NOW), false);

  seen.length = 0;
  assert.equal(await store.deleteSale(OWNER, "p1", NOW), false);
  assert.deepEqual(params(seen[0].url), { tenant_id: "eq.loja-a", id: "eq.p1", select: "id" });
});

test("RPCs: a autora é quem chama; a trava de 24h só vale para vendedora; o erro sai com a mensagem da RPC", async () => {
  reply = () => ({ status: 200, body: { id: "p9" } });

  await store.createSale({ caller: SELLER, leadId: null, phone: "5511912345678", groupName: null, campaignId: undefined, items: ITEMS });
  await store.replaceSaleItems(SELLER, "p9", ITEMS);
  await store.replaceSaleItems(OWNER, "p9", ITEMS);

  assert.deepEqual(requestsTo("/rest/v1/rpc/create_order_with_items")[0].body, {
    p_tenant_id: "loja-a",
    p_created_by: "vendedora-1",
    p_lead_id: null,
    p_phone: "5511912345678",
    p_group_name: null,
    p_campaign_id: null,
    p_items: ITEMS,
  });
  assert.deepEqual(requestsTo("/rest/v1/rpc/replace_order_items").map((request) => request.body), [
    { p_tenant_id: "loja-a", p_order_id: "p9", p_items: ITEMS, p_only_author: "vendedora-1" },
    { p_tenant_id: "loja-a", p_order_id: "p9", p_items: ITEMS, p_only_author: null },
  ]);

  reply = () => ({ status: 400, body: { code: "P0001", message: "fora_da_janela", details: null, hint: null } });
  await assert.rejects(store.replaceSaleItems(SELLER, "p9", ITEMS), { message: "fora_da_janela" });
});

test("editável: vendedora até 24h e só a própria; os outros papéis sempre", () => {
  const sale = (by: string, hours: number) => ({ created_by: by, created_at: hoursAgo(hours) });
  assert.equal(store.isSaleEditable(SELLER, sale("vendedora-1", 23.99), NOW), true);
  // O mesmo corte estrito da RPC: created_at > now() - 24h.
  assert.equal(store.isSaleEditable(SELLER, sale("vendedora-1", 24), NOW), false);
  assert.equal(store.isSaleEditable(SELLER, sale("outra-vendedora", 1), NOW), false);
  assert.equal(store.isSaleEditable(OWNER, sale("vendedora-1", 24 * 30), NOW), true);
});

test("papel desconhecido é restrito como vendedora (falha fechado, nunca vira dono)", async () => {
  const unknown = { tenantId: "loja-a", authUserId: "x-1", role: "estagiario" } as unknown as Store.SalesCaller;

  reply = () => ({ status: 200, body: [{ id: "p1" }] });
  await store.deleteSale(unknown, "p1", NOW);
  assert.deepEqual(params(seen[0].url), {
    tenant_id: "eq.loja-a",
    id: "eq.p1",
    created_by: "eq.x-1",
    created_at: "gt.2026-10-06T15:00:00.000Z",
    select: "id",
  });

  reply = () => ({ status: 200, body: { id: "p9" } });
  await store.replaceSaleItems(unknown, "p9", ITEMS);
  assert.equal((requestsTo("/rest/v1/rpc/replace_order_items")[0].body as { p_only_author: string }).p_only_author, "x-1");

  const sale = { created_by: "outra", created_at: hoursAgo(1) };
  assert.equal(store.isSaleEditable(unknown, sale, NOW), false);
});
