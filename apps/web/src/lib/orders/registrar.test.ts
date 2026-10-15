import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, mock, test } from "node:test";

import type { recordOrder as RecordOrder } from "./registrar";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (padrão de
 * `stores/leads.test.ts`): a query que sai daqui é a de produção, só a rede é
 * trocada. Cobre as duas rotas que gravam pedido — /api/orders e /api/vendas
 * chamam este mesmo `recordOrder`.
 */

type Seen = { method: string; url: URL; body: unknown };
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
      body: text ? JSON.parse(text) : undefined,
    };
    seen.push(request);
    const { status, body, contentRange } = reply(request);
    // `.maybeSingle()` fora de GET pede um objeto, não a lista.
    const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const payload = single && Array.isArray(body) ? body[0] : body;
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (payload !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
});

let recordOrder: typeof RecordOrder;

before(async () => {
  await new Promise<void>((ready) => postgrest.listen(0, "127.0.0.1", ready));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  ({ recordOrder } = await import("./registrar"));
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  seen.length = 0;
});

const TENANT = "loja-a";
const LEAD = { id: "lead-1", source_campaign: null, source_group_id: "vip1@g.us" };

const requestsTo = (path: string) => seen.filter((request) => request.url.pathname === path);
const trail = () => seen.map((request) => `${request.method} ${request.url.pathname}`);
/** Os pedidos da loja que a leitura do marco devolve (ela pede no máximo 2). */
const ordersOfTenant = (...ids: string[]): Reply => ({ status: 200, body: ids.map((id) => ({ id })) });

/** O marco sai com `void` (não segura a resposta): chega depois. */
async function arrived(path: string): Promise<Seen> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const request = requestsTo(path)[0];
    if (request) return request;
    await new Promise((wait) => setTimeout(wait, 10));
  }
  throw new Error(`${path} não chegou`);
}

test("lead de grupo: a campanha mais antiga com o grupo, lead vira comprou e o 1º pedido marca first_order", async () => {
  reply = ({ method, url }) => {
    if (url.pathname === "/rest/v1/campaign_groups") {
      return {
        status: 200,
        body: [
          { id: "camp-nova", name: "Nova", slug: "nova", group_ids: ["vip1@g.us"], created_at: "2026-09-01T00:00:00Z" },
          { id: "camp-antiga", name: "Antiga", slug: "antiga", group_ids: ["vip1@g.us"], created_at: "2026-08-01T00:00:00Z" },
        ],
      };
    }
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ id: LEAD.id, status: "comprou" }] };
    if (url.pathname === "/rest/v1/orders" && method === "GET") return ordersOfTenant("pedido-1");
    if (url.pathname === "/rest/v1/funnel_events") return { status: 201 };
    return { status: 500 };
  };
  const campaigns: (string | undefined)[] = [];

  const order = await recordOrder(TENANT, LEAD, async (campaignId) => {
    campaigns.push(campaignId);
    return { id: "pedido-1" };
  });

  assert.deepEqual(order, { id: "pedido-1" });
  // Mutante: a campanha mais nova roubaria os pedidos de quem entrou pela antiga.
  assert.deepEqual(campaigns, ["camp-antiga"]);
  assert.equal(requestsTo("/rest/v1/campaign_groups")[0].url.searchParams.get("tenant_id"), "eq.loja-a");
  const [patch] = requestsTo("/rest/v1/leads");
  assert.equal(patch.method, "PATCH");
  assert.equal(patch.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(patch.url.searchParams.get("id"), "eq.lead-1");
  assert.deepEqual(patch.body, { status: "comprou" });
  const event = (await arrived("/rest/v1/funnel_events")).body as { tenant_id: string; event_name: string; metadata: unknown };
  assert.equal(event.tenant_id, TENANT);
  assert.equal(event.event_name, "first_order");
  assert.deepEqual(event.metadata, { orderId: "pedido-1" });
  // Mutante: contar todos os pedidos da loja a cada venda (a importação de 90 dias do Bling vira O(n²)).
  const [read] = requestsTo("/rest/v1/orders");
  assert.deepEqual(
    [read.method, read.url.searchParams.get("tenant_id"), read.url.searchParams.get("limit"), read.url.searchParams.get("select")],
    ["GET", "eq.loja-a", "2", "id"],
  );
});

test("campanhas fora do ar não derrubam o pedido: grava sem origem", async () => {
  reply = ({ method, url }) => {
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 500, body: { message: "timeout" } };
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ id: LEAD.id }] };
    if (url.pathname === "/rest/v1/orders" && method === "GET") return ordersOfTenant("pedido-1", "pedido-2");
    return { status: 500 };
  };
  const campaigns: (string | undefined)[] = [];

  const order = await recordOrder(TENANT, LEAD, async (campaignId) => {
    campaigns.push(campaignId);
    return { id: "pedido-2" };
  });

  assert.deepEqual(order, { id: "pedido-2" });
  assert.deepEqual(campaigns, [undefined]);
  assert.equal(requestsTo("/rest/v1/leads").length, 1);
  assert.equal(requestsTo("/rest/v1/funnel_events").length, 0);
});

test("campanhas fora do ar com throwOnCampaignError: o erro sobe antes de gravar (a venda não nasce sem campanha)", async (t) => {
  t.mock.method(console, "error", () => undefined);
  reply = ({ url }) => (url.pathname === "/rest/v1/campaign_groups" ? { status: 500, body: { message: "timeout" } } : { status: 500 });
  let writes = 0;

  await assert.rejects(
    recordOrder(
      TENANT,
      LEAD,
      async () => {
        writes += 1;
        return { id: "pedido-5" };
      },
      { throwOnCampaignError: true },
    ),
    /timeout/,
  );

  // Mutante: seguir sem campanha gravaria a venda sem origem para sempre (o update não mexe nela).
  assert.equal(writes, 0);
  assert.deepEqual(trail(), ["GET /rest/v1/campaign_groups"]);
});

test("throwOnCampaignError sem grupo que case: segue sem campanha, como sempre", async () => {
  reply = ({ method, url }) => {
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ id: LEAD.id }] };
    if (url.pathname === "/rest/v1/orders" && method === "GET") return ordersOfTenant("pedido-1", "pedido-6");
    return { status: 500 };
  };
  const campaigns: (string | undefined)[] = [];

  await recordOrder(TENANT, LEAD, async (campaignId) => {
    campaigns.push(campaignId);
    return { id: "pedido-6" };
  }, { throwOnCampaignError: true });

  assert.deepEqual(campaigns, [undefined]);
});

test("sem lead: nem campanha nem status; do 2º pedido em diante, sem marco", async () => {
  reply = ({ url, method }) =>
    url.pathname === "/rest/v1/orders" && method === "GET" ? ordersOfTenant("pedido-1", "pedido-3") : { status: 500 };
  const campaigns: (string | undefined)[] = [];

  await recordOrder(TENANT, null, async (campaignId) => {
    campaigns.push(campaignId);
    return { id: "pedido-3" };
  });

  assert.deepEqual(campaigns, [undefined]);
  assert.deepEqual(trail(), ["GET /rest/v1/orders"]);
  assert.equal(requestsTo("/rest/v1/funnel_events").length, 0);
});

test("gravação falhou: o erro sobe e o lead não vira comprou", async () => {
  reply = ({ url }) => (url.pathname === "/rest/v1/campaign_groups" ? { status: 200, body: [] } : { status: 500 });

  await assert.rejects(
    recordOrder(TENANT, LEAD, async () => {
      throw new Error("total_zero");
    }),
    { message: "total_zero" },
  );

  assert.deepEqual(trail(), ["GET /rest/v1/campaign_groups"]);
});

test("status do lead falhou: o pedido sai e o erro fica no log, com a loja", async () => {
  reply = ({ method, url }) => {
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 500, body: { message: "banco fora" } };
    if (url.pathname === "/rest/v1/orders" && method === "GET") return ordersOfTenant("pedido-1", "pedido-4");
    return { status: 500 };
  };
  const log = mock.method(console, "error", () => undefined);

  const order = await recordOrder(TENANT, LEAD, async () => ({ id: "pedido-4" }));
  log.mock.restore();

  assert.deepEqual(order, { id: "pedido-4" });
  assert.equal(log.mock.callCount(), 1);
  assert.deepEqual(log.mock.calls[0].arguments.slice(0, 2), ["[orders] status do lead falhou", TENANT]);
});
