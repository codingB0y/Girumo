import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { addOrder, removeOrder } from "./orders";

/**
 * O cliente real do Supabase conversando com um PostgREST de mentira (o padrão
 * de `leads.test.ts`): a query que sai daqui é a de produção, só a rede é
 * trocada. Roda sem credencial nenhuma.
 */

type Pedido = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const pedidos: Pedido[] = [];
let responder: (pedido: Pedido) => Resposta = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const pedido: Pedido = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    pedidos.push(pedido);
    const { status, corpo } = responder(pedido);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

test("addOrder grava na loja que a rota passou, sem perguntar à sessão qual é", async () => {
  pedidos.length = 0;
  const linha = { id: "p1", tenant_id: "loja-b", phone: "5511987654321", lead_id: null, group_name: null, campaign_id: null, value: 149.9 };
  responder = () => ({ status: 201, corpo: linha });

  // Mutante: o getTenantId() antigo, que lia a primeira membership da sessão e
  // gravava na loja errada quem pertence a duas.
  assert.deepEqual(await addOrder("loja-b", { phone: "+55 (11) 98765-4321", value: 149.9 }), linha);

  assert.equal(pedidos.length, 1);
  const [{ metodo, url, corpo }] = pedidos;
  assert.equal(metodo, "POST");
  assert.equal(url.pathname, "/rest/v1/orders");
  assert.deepEqual(corpo, {
    tenant_id: "loja-b",
    phone: "5511987654321",
    lead_id: null,
    group_name: null,
    campaign_id: null,
    value: 149.9,
  });
});

test("removeOrder apaga só na loja da rota e diz true quando o banco devolve a linha", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, corpo: [{ id: "p1" }] });

  assert.equal(await removeOrder("loja-b", "p1"), true);

  assert.equal(pedidos.length, 1);
  const [{ metodo, url }] = pedidos;
  assert.equal(metodo, "DELETE");
  assert.equal(url.pathname, "/rest/v1/orders");
  // Sem o tenant, o service-role apaga pedido de qualquer loja. Sem o `select`,
  // o PostgREST não devolve as linhas e não há como saber se apagou.
  assert.deepEqual(Object.fromEntries(url.searchParams), { id: "eq.p1", tenant_id: "eq.loja-b", select: "id" });
});

test("removeOrder sem linha apagada (pedido de outra loja ou inexistente) é false", async () => {
  // Mutante: o `return !error` antigo, que dizia true sem ter apagado nada.
  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await removeOrder("loja-b", "p-de-outra-loja"), false);
});

test("removeOrder com erro do banco rejeita em vez de virar false", async () => {
  responder = () => ({ status: 500, corpo: { message: "falhou no banco" } });
  await assert.rejects(removeOrder("loja-b", "p1"), /falhou no banco/);
});
