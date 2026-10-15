import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { SaleLead } from "@/lib/stores/vendas";
import { idDaVendaBling, projetarPedido, type PedidoParaProjetar } from "./pedido-girumo";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (molde de
 * `orders/registrar.test.ts`): a projeção E o `recordOrder` que ela chama
 * conversam com o mesmo banco falso, como em produção.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown; contentRange?: string };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
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
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  chamadas.length = 0;
});

/**
 * Responde por "MÉTODO /caminho". Chamada que ninguém previu vira 500, para
 * aparecer. A leitura do marco acha 2 pedidos: não é o primeiro da loja, então
 * o `first_order` (que sai sem await) não dispara depois do teste.
 */
function banco(tabelas: Record<string, (chamada: Chamada) => Resposta>): (chamada: Chamada) => Resposta {
  return (chamada) => {
    const chave = `${chamada.metodo} ${chamada.url.pathname}`;
    if (chave === "GET /rest/v1/orders") return { status: 200, corpo: [{ id: "pedido-a" }, { id: "pedido-b" }] };
    const tabela = tabelas[chave];
    return tabela ? tabela(chamada) : { status: 500, corpo: { message: `inesperado: ${chave}` } };
  };
}

const trilha = () => chamadas.map((c) => `${c.metodo} ${c.url.pathname}`);
const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));
const corpoDe = (i: number) => chamadas[i].corpo as Record<string, unknown>;

const LEAD: SaleLead = {
  id: "lead-1",
  name: "Maria",
  phone: "5562999998888",
  source_campaign: null,
  source_group_id: "vip1@g.us",
  source_group_name: "VIP 1",
};
const CAMPANHA = { id: "camp-1", name: "Primavera", slug: "primavera", group_ids: ["vip1@g.us"], created_at: "2026-09-01T00:00:00Z" };
const SALE_AT = new Date("2026-10-12T15:00:00.000Z");
/** sha256("bling:loja-a:1001"), 16 bytes, versão 8 e variante RFC: valor fixo, não a mesma conta refeita. */
const ID_1001 = "8117b239-da96-802a-9ed2-93cb14bbfff2";
const ID_1002 = "0652e244-0749-8aa0-aa2f-d13da4b67897";
const DUPLICADA = { code: "23505", message: 'duplicate key value violates unique constraint "orders_pkey"', details: null, hint: null };

function venda(extra: Partial<PedidoParaProjetar> = {}): PedidoParaProjetar {
  return { tipo: "venda", blingOrderId: 1001, orderId: null, total: 80, telefone: "5562999998888", saleAt: SALE_AT, lead: null, ...extra };
}

test("id da venda: UUID versão 8 dos 16 primeiros bytes do sha256 de loja + pedido, sempre o mesmo", () => {
  assert.equal(idDaVendaBling("loja-a", 1001), ID_1001);
  assert.equal(idDaVendaBling("loja-a", 1002), ID_1002);
  assert.match(ID_1001, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // Outra loja, o mesmo número de pedido: outro id (o Bling numera por conta).
  assert.equal(idDaVendaBling("loja-b", 1001), "29e098a2-53e6-8df2-9a2f-667a3d2b3a9c");
});

test("venda nova com lead: grava com o id determinístico, source bling, centavos, dia da venda e a campanha do grupo", async () => {
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [CAMPANHA] }),
    "POST /rest/v1/orders": () => ({ status: 201 }),
    "PATCH /rest/v1/leads": () => ({ status: 200, corpo: [{ id: "lead-1", status: "comprou" }] }),
  });

  const id = await projetarPedido("loja-a", venda({ total: 149.899, telefone: "+55 (62) 99999-8888", lead: LEAD }));

  assert.equal(id, ID_1001);
  assert.deepEqual(trilha(), ["GET /rest/v1/campaign_groups", "POST /rest/v1/orders", "PATCH /rest/v1/leads", "GET /rest/v1/orders"]);
  // Mutante: id aleatório (ou do banco) deixa a volta seguinte criar outra venda quando a ligação não foi gravada.
  assert.deepEqual(corpoDe(1), {
    id: ID_1001,
    tenant_id: "loja-a",
    phone: "5562999998888",
    lead_id: "lead-1",
    group_name: "VIP 1",
    campaign_id: "camp-1",
    value: 149.9,
    source: "bling",
    created_at: "2026-10-12T15:00:00.000Z",
  });
  // O lead vira "comprou" na loja certa.
  assert.deepEqual(filtros(chamadas[2].url), { tenant_id: "eq.loja-a", id: "eq.lead-1" });
  assert.deepEqual(chamadas[2].corpo, { status: "comprou" });
});

test("venda nova sem lead e sem telefone: entra com phone vazio, sem campanha, sem mexer em lead", async () => {
  responder = banco({ "POST /rest/v1/orders": () => ({ status: 201 }) });

  const id = await projetarPedido("loja-a", venda({ blingOrderId: 1002, total: 50, telefone: null }));

  assert.equal(id, ID_1002);
  assert.deepEqual(trilha(), ["POST /rest/v1/orders", "GET /rest/v1/orders"]);
  assert.deepEqual(corpoDe(0), {
    id: ID_1002,
    tenant_id: "loja-a",
    phone: "",
    lead_id: null,
    group_name: null,
    campaign_id: null,
    value: 50,
    source: "bling",
    created_at: "2026-10-12T15:00:00.000Z",
  });
});

test("23505 no insert (uma volta anterior criou e morreu antes de ligar): atualiza a mesma venda e devolve o id", async () => {
  responder = banco({
    "POST /rest/v1/orders": () => ({ status: 409, corpo: DUPLICADA }),
    "PATCH /rest/v1/orders": () => ({ status: 200, corpo: [{ id: ID_1001 }] }),
  });

  const id = await projetarPedido("loja-a", venda({ total: 90 }));

  // Mutante: 23505 subindo como erro deixaria o pedido falhando para sempre (a venda já existe).
  assert.equal(id, ID_1001);
  assert.deepEqual(trilha(), ["POST /rest/v1/orders", "PATCH /rest/v1/orders", "GET /rest/v1/orders"]);
  // Só a venda do Bling desta loja, com esse id; lead e campanha ficam os da criação.
  assert.deepEqual(filtros(chamadas[1].url), { id: `eq.${ID_1001}`, tenant_id: "eq.loja-a", source: "eq.bling" });
  assert.deepEqual(chamadas[1].corpo, { value: 90, phone: "5562999998888" });
});

test("23505 e o update não acha a venda do Bling: lança o erro original do insert", async () => {
  responder = banco({
    "POST /rest/v1/orders": () => ({ status: 409, corpo: DUPLICADA }),
    "PATCH /rest/v1/orders": () => ({ status: 200, corpo: [] }),
  });

  await assert.rejects(projetarPedido("loja-a", venda()), /duplicate key/);
});

test("campanhas fora do ar: o erro sobe e a venda não é criada sem campanha", async (t) => {
  t.mock.method(console, "error", () => undefined);
  responder = banco({ "GET /rest/v1/campaign_groups": () => ({ status: 500, corpo: { message: "timeout" } }) });

  await assert.rejects(projetarPedido("loja-a", venda({ lead: LEAD })), /timeout/);
  assert.deepEqual(trilha(), ["GET /rest/v1/campaign_groups"]);
});

test("venda que já tem pedido: atualiza valor e telefone só no pedido do Bling da loja", async () => {
  responder = banco({ "PATCH /rest/v1/orders": () => ({ status: 200, corpo: [{ id: "ord-1" }] }) });

  const id = await projetarPedido("loja-a", venda({ orderId: "ord-1", total: 200, lead: LEAD }));

  assert.equal(id, "ord-1");
  // Lead e campanha não mudam: nada de recordOrder.
  assert.deepEqual(trilha(), ["PATCH /rest/v1/orders"]);
  assert.deepEqual(filtros(chamadas[0].url), { id: "eq.ord-1", tenant_id: "eq.loja-a", source: "eq.bling" });
  assert.deepEqual(chamadas[0].corpo, { value: 200, phone: "5562999998888" });
});

test("venda cujo pedido sumiu (update não acha linha): cria de novo, com o id determinístico", async () => {
  responder = banco({
    "PATCH /rest/v1/orders": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/orders": () => ({ status: 201 }),
  });

  const id = await projetarPedido("loja-a", venda({ orderId: "ord-apagado" }));

  assert.equal(id, ID_1001);
  assert.deepEqual(trilha(), ["PATCH /rest/v1/orders", "POST /rest/v1/orders", "GET /rest/v1/orders"]);
  assert.deepEqual([corpoDe(1).source, corpoDe(1).id], ["bling", ID_1001]);
});

test("pedido, ignorado ou excluído com pedido Girumo: apaga pelo id da linha e pelo determinístico, só o do Bling da loja", async () => {
  for (const tipo of ["pedido", "ignorado", "excluido"] as const) {
    chamadas.length = 0;
    responder = banco({ "DELETE /rest/v1/orders": () => ({ status: 204 }) });

    const id = await projetarPedido("loja-a", venda({ tipo, orderId: "ord-1", total: 99, telefone: null }));

    assert.equal(id, null, tipo);
    assert.deepEqual(trilha(), ["DELETE /rest/v1/orders"], tipo);
    // Mutante: apagar sem `source = bling` levaria junto uma venda registrada à mão.
    assert.deepEqual(filtros(chamadas[0].url), { id: `in.(ord-1,${ID_1001})`, tenant_id: "eq.loja-a", source: "eq.bling" }, tipo);
  }
});

test("pedido, ignorado ou excluído sem pedido ligado: apaga pelo id determinístico (o órfão de uma volta que morreu antes de ligar)", async () => {
  for (const tipo of ["pedido", "ignorado", "excluido"] as const) {
    chamadas.length = 0;
    responder = banco({ "DELETE /rest/v1/orders": () => ({ status: 204 }) });

    assert.equal(await projetarPedido("loja-a", venda({ tipo, total: 99, telefone: null })), null, tipo);

    // Mutante: sem pedido ligado não apagar nada deixaria a venda órfã contando no funil.
    assert.deepEqual(trilha(), ["DELETE /rest/v1/orders"], tipo);
    assert.deepEqual(filtros(chamadas[0].url), { id: `in.(${ID_1001})`, tenant_id: "eq.loja-a", source: "eq.bling" }, tipo);
  }
});

test("venda com total que arredonda para ≤ 0 nunca chega em orders (o relatório do funil recusa)", async () => {
  responder = banco({});
  for (const total of [0, -5, 0.004, Number.NaN]) {
    await assert.rejects(projetarPedido("loja-a", venda({ total, telefone: null })), /total/, String(total));
  }
  assert.equal(chamadas.length, 0);
});

test("erro ao gravar o pedido sobe com a mensagem do banco", async () => {
  responder = banco({ "POST /rest/v1/orders": () => ({ status: 400, corpo: { message: "violates check constraint" } }) });
  await assert.rejects(projetarPedido("loja-a", venda({ total: 10, telefone: null })), /check constraint/);
});
