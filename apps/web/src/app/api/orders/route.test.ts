import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { DELETE, POST } from "./route";

/**
 * A rota inteira contra um Supabase de mentira: o PostgREST falso de
 * `lib/stores/leads.test.ts` mais o `/auth/v1/user` que confere o Bearer.
 * Sessão, membership, lead e pedido saem como em produção; só a rede é trocada.
 */

const LEAD = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const PEDIDO = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const CAMPANHA = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown; contentRange?: string };

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
    const { status, corpo, contentRange } = responder(chamada);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
});

after(() => {
  supabase.close();
});

/**
 * Dono logado por Bearer e membro aceito da `loja-b`; `tabelas` responde o resto
 * por "MÉTODO /caminho". Chamada que ninguém previu vira 500, para aparecer.
 */
function banco(tabelas: Record<string, () => Resposta>): (chamada: Chamada) => Resposta {
  return ({ metodo, url }) => {
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: "loja-b", role: "owner" }] };
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela() : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

/** Request do dono, com a loja escolhida no `x-tenant-id` como o painel manda. */
function doDono(metodo: string, caminho: string, corpo?: unknown): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

test("POST recusa lead que não é da loja e não grava pedido", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/leads": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/orders": () => ({ status: 201, corpo: { id: PEDIDO } }),
  });

  // Mutante: o `if (lead)` antigo, que só pulava a atribuição e gravava o
  // lead_id de outra loja no pedido.
  const res = await POST(doDono("POST", "/api/orders", { value: "149,90", leadId: LEAD }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Contato não encontrado." });
  assert.equal(feitas("POST", "/rest/v1/orders").length, 0);
  // A busca é na loja da rota: sem o filtro, o service-role acha o lead de qualquer loja.
  const [busca] = feitas("GET", "/rest/v1/leads");
  assert.equal(busca.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(busca.url.searchParams.get("id"), `eq.${LEAD}`);
});

test("POST com leadId que não é uuid responde 400 sem ir ao banco", async () => {
  chamadas.length = 0;
  responder = banco({ "POST /rest/v1/orders": () => ({ status: 201, corpo: { id: PEDIDO } }) });

  // Sem a checagem o Postgres devolve 22P02 e a rota daria 500 com a mensagem dele.
  const res = await POST(doDono("POST", "/api/orders", { value: "10", leadId: "abc" }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Contato não encontrado." });
  assert.equal(feitas("GET", "/rest/v1/leads").length, 0);
  assert.equal(feitas("POST", "/rest/v1/orders").length, 0);
});

test("POST com o banco fora na busca do lead responde 500 e não grava pedido", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/leads": () => ({ status: 500, corpo: { message: "banco fora" } }),
    "POST /rest/v1/orders": () => ({ status: 201, corpo: { id: PEDIDO } }),
  });

  // Mutante: a busca do lead de volta no try best-effort da atribuição, que
  // engolia o erro e gravava o pedido com um lead que ninguém conferiu.
  const res = await POST(doDono("POST", "/api/orders", { value: "10", leadId: LEAD }));

  assert.equal(res.status, 500);
  assert.equal(feitas("POST", "/rest/v1/orders").length, 0);
});

test("POST grava na loja da rota, com o lead e a campanha dela", async () => {
  chamadas.length = 0;
  const linha = { id: PEDIDO, tenant_id: "loja-b", phone: "5511987654321", lead_id: LEAD, group_name: "VIP 1", campaign_id: CAMPANHA, value: 149.9 };
  responder = banco({
    "GET /rest/v1/leads": () => ({ status: 200, corpo: [{ source_campaign: null, source_group_id: "120363@g.us" }] }),
    "GET /rest/v1/campaign_groups": () => ({
      status: 200,
      corpo: [{ id: CAMPANHA, name: "VIP", slug: "vip", group_ids: ["120363@g.us"], created_at: "2026-09-01T00:00:00Z" }],
    }),
    "POST /rest/v1/orders": () => ({ status: 201, corpo: linha }),
    "PATCH /rest/v1/leads": () => ({ status: 200, corpo: [] }),
    "HEAD /rest/v1/orders": () => ({ status: 200, contentRange: "*/7" }),
  });

  const res = await POST(
    doDono("POST", "/api/orders", { value: "149,90", leadId: LEAD, phone: "5511987654321", group: "VIP 1" }),
  );

  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), linha);
  const [gravado] = feitas("POST", "/rest/v1/orders");
  assert.deepEqual(gravado.corpo, {
    tenant_id: "loja-b",
    phone: "5511987654321",
    lead_id: LEAD,
    group_name: "VIP 1",
    campaign_id: CAMPANHA,
    value: 149.9,
  });
});

test("DELETE sem sessão é 401 e não apaga nada", async () => {
  chamadas.length = 0;
  responder = banco({ "DELETE /rest/v1/orders": () => ({ status: 200, corpo: [{ id: PEDIDO }] }) });

  // Mutante: o DELETE antigo, que não chamava getRouteTenantContext.
  const res = await DELETE(new Request(`http://girumo.test/api/orders?id=${PEDIDO}`, { method: "DELETE" }));

  assert.equal(res.status, 401);
  assert.equal(feitas("DELETE", "/rest/v1/orders").length, 0);
});

test("DELETE de pedido que não é da loja (ou id que não é uuid) responde 404", async () => {
  chamadas.length = 0;
  responder = banco({ "DELETE /rest/v1/orders": () => ({ status: 200, corpo: [] }) });

  // Mutante: o `{ ok }` antigo, que respondia 200 sem ter apagado nada.
  const res = await DELETE(doDono("DELETE", `/api/orders?id=${PEDIDO}`));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Pedido não encontrado." });
  const [apagar] = feitas("DELETE", "/rest/v1/orders");
  assert.equal(apagar.url.searchParams.get("tenant_id"), "eq.loja-b");

  const lixo = await DELETE(doDono("DELETE", "/api/orders?id=abc"));
  assert.equal(lixo.status, 404);
  assert.equal(feitas("DELETE", "/rest/v1/orders").length, 1);
});

test("DELETE do pedido da loja responde 200", async () => {
  responder = banco({ "DELETE /rest/v1/orders": () => ({ status: 200, corpo: [{ id: PEDIDO }] }) });

  const res = await DELETE(doDono("DELETE", `/api/orders?id=${PEDIDO}`));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});
