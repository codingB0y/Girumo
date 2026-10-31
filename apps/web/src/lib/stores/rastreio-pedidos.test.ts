import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { PedidoInterno, PedidoParaGravar } from "@/lib/rastreio/tipos";
import { abrir, selar } from "@/lib/security/secret-box";
import {
  abrirEmailDoPedido,
  buscarPedidos,
  gravarPedido,
  lerPedido,
  pararAvisos,
  pedidoPorToken,
  purgarVencidos,
} from "./rastreio-pedidos";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de `bling-pedidos.test.ts`). */

type Chamada = { metodo: string; url: URL; prefer: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500, corpo: { message: "sem resposta" } });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

const CHAVE_ENV = Buffer.alloc(32, 7).toString("base64");
const CHAVE = Buffer.alloc(32, 7);

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
  process.env.INTEGRATIONS_ENCRYPTION_KEY = CHAVE_ENV;
});

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const PEDIDO: PedidoParaGravar = {
  externalId: "Y-1001",
  numero: "1001",
  orderCreatedAt: "2026-10-28T12:00:00.000Z",
  statusRaw: "on_carriage",
  etapa: "enviado",
  trackingCode: "BR123456789",
  trackingUrl: "https://rastreio.exemplo.com/BR123456789",
  shipmentService: "PAC",
  buyerFirstName: "Ana",
  buyerPhone: "5562999994821",
  buyerEmail: "ana@exemplo.com",
  docHmac: "a".repeat(64),
  historico: [{ etapa: "confirmado", at: "2026-10-28T12:05:00.000Z" }],
  atualizadoNaYampi: "2026-10-29T10:00:00.000Z",
};
const RETORNO_DA_RPC = {
  id: "o-1",
  etapa: "enviado",
  etapa_anterior: "separando",
  mudou: true,
  link_token: "f".repeat(32),
  notices_stopped_at: null,
  tem_telefone: true,
  tem_email: true,
};
const COLUNAS_PUBLICAS =
  "id,numero,order_created_at,etapa,etapa_at,events,shipment_service,tracking_code,tracking_url,link_token,notices_stopped_at";
const LINHA_PUBLICA = {
  id: "o-1",
  numero: "1001",
  order_created_at: "2026-10-28T12:00:00+00:00",
  etapa: "enviado",
  etapa_at: "2026-10-29T09:00:00+00:00",
  events: [{ etapa: "enviado", at: "2026-10-29T09:00:00+00:00" }],
  shipment_service: "PAC",
  tracking_code: "BR123456789",
  tracking_url: null,
  link_token: "f".repeat(32),
  notices_stopped_at: null,
};
const PUBLICO = {
  id: "o-1",
  numero: "1001",
  orderCreatedAt: "2026-10-28T12:00:00+00:00",
  etapa: "enviado",
  etapaAt: "2026-10-29T09:00:00+00:00",
  events: [{ etapa: "enviado", at: "2026-10-29T09:00:00+00:00" }],
  shipmentService: "PAC",
  trackingCode: "BR123456789",
  trackingUrl: null,
  linkToken: "f".repeat(32),
  noticesStoppedAt: null,
};

test("gravarPedido sela o e-mail com o contexto do pedido e manda o resto em snake_case", async () => {
  responder = () => ({ status: 200, corpo: RETORNO_DA_RPC });

  const gravado = await gravarPedido("loja-a", PEDIDO, "aviso");

  assert.equal(chamadas.length, 1);
  const [{ metodo, url, corpo }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["POST", "/rest/v1/rpc/rastreio_gravar_pedido"]);
  const { p_tenant: loja, p_pedido: pedido } = corpo as { p_tenant: string; p_pedido: Record<string, unknown> };
  assert.equal(loja, "loja-a");
  assert.deepEqual(Object.keys(pedido).sort(), [
    "buyer_email_enc", "buyer_first_name", "buyer_phone", "carimbar", "doc_hmac", "etapa", "external_id", "historico",
    "numero", "order_created_at", "shipment_service", "status_raw", "tracking_code", "tracking_url",
  ]);
  assert.equal(pedido.carimbar, true);
  assert.equal(pedido.external_id, "Y-1001");
  assert.deepEqual(pedido.historico, PEDIDO.historico);
  assert.equal(abrir(pedido.buyer_email_enc as string, "rastreio:loja-a:yampi:Y-1001:email", CHAVE), "ana@exemplo.com");
  const serializado = JSON.stringify(corpo);
  assert.ok(!serializado.includes("ana@exemplo.com"));
  assert.ok(!serializado.includes("atualizadoNaYampi") && !serializado.includes("2026-10-29T10:00:00.000Z"));
  assert.deepEqual(gravado, {
    id: "o-1",
    etapa: "enviado",
    etapaAnterior: "separando",
    mudou: true,
    linkToken: "f".repeat(32),
    paradoEm: null,
    temTelefone: true,
    temEmail: true,
  });
});

test("importação não carimba data", async () => {
  responder = () => ({ status: 200, corpo: RETORNO_DA_RPC });
  await gravarPedido("loja-a", PEDIDO, "importacao");
  const { p_pedido: pedido } = chamadas[0].corpo as { p_pedido: { carimbar: boolean } };
  assert.equal(pedido.carimbar, false);
});

test("sem chave de cifra, pedido com e-mail não vai ao banco", async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  await assert.rejects(gravarPedido("loja-a", PEDIDO, "aviso"), /INTEGRATIONS_ENCRYPTION_KEY/);
  assert.equal(chamadas.length, 0);

  // Sem e-mail não precisa de chave.
  responder = () => ({ status: 200, corpo: RETORNO_DA_RPC });
  await gravarPedido("loja-a", { ...PEDIDO, buyerEmail: null }, "aviso");
  const { p_pedido: pedido } = chamadas[0].corpo as { p_pedido: { buyer_email_enc: unknown } };
  assert.equal(pedido.buyer_email_enc, null);

  process.env.INTEGRATIONS_ENCRYPTION_KEY = CHAVE_ENV;
  responder = () => ({ status: 500, corpo: { message: "falhou" } });
  await assert.rejects(gravarPedido("loja-a", PEDIDO, "aviso"), /falhou/);
});

test("lerPedido lê o pedido da própria loja", async () => {
  const selado = selar("ana@exemplo.com", "rastreio:loja-a:yampi:Y-1001:email", CHAVE);
  responder = () => ({
    status: 200,
    corpo: [{ ...LINHA_PUBLICA, tenant_id: "loja-a", external_id: "Y-1001", status_raw: "on_carriage", buyer_first_name: "Ana", buyer_phone: "5562999994821", buyer_email_enc: selado }],
  });

  assert.deepEqual(await lerPedido("loja-a", "o-1"), {
    ...PUBLICO,
    tenantId: "loja-a",
    externalId: "Y-1001",
    statusRaw: "on_carriage",
    buyerFirstName: "Ana",
    buyerPhone: "5562999994821",
    buyerEmailEnc: selado,
  });
  assert.equal(chamadas[0].url.pathname, "/rest/v1/tracking_orders");
  assert.deepEqual(filtros(chamadas[0].url), { tenant_id: "eq.loja-a", id: "eq.o-1" });

  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await lerPedido("loja-a", "o-1"), null);
});

test("abrirEmailDoPedido abre só com o contexto certo e não loga o e-mail", (t) => {
  const erro = t.mock.method(console, "error", () => {});
  const interno = (externalId: string, enc: string | null): PedidoInterno => ({
    ...PUBLICO,
    etapa: "enviado",
    events: [],
    tenantId: "loja-a",
    externalId,
    statusRaw: "on_carriage",
    buyerFirstName: "Ana",
    buyerPhone: null,
    buyerEmailEnc: enc,
  });
  const selado = selar("ana@exemplo.com", "rastreio:loja-a:yampi:Y-1001:email", CHAVE);

  assert.equal(abrirEmailDoPedido(interno("Y-1001", selado)), "ana@exemplo.com");
  assert.equal(erro.mock.callCount(), 0);

  assert.equal(abrirEmailDoPedido(interno("Y-2002", selado)), null);
  assert.equal(erro.mock.callCount(), 1);
  const logado = erro.mock.calls[0].arguments.map(String).join(" ");
  assert.ok(!logado.includes("ana@exemplo.com"));
  assert.match(logado, /\[rastreio\] e-mail do pedido o-1 não abriu/);

  assert.equal(abrirEmailDoPedido(interno("Y-1001", null)), null);
  assert.equal(erro.mock.callCount(), 1);
});

test("buscarPedidos: colunas públicas, documento + celular + desde, da loja, mais novo primeiro, no máximo 20", async () => {
  responder = () => ({ status: 200, corpo: [LINHA_PUBLICA] });

  const achados = await buscarPedidos("loja-a", "a".repeat(64), "4321", new Date("2026-07-31T15:00:00.000Z"));

  assert.deepEqual(achados, [PUBLICO]);
  const [{ metodo, url }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["GET", "/rest/v1/tracking_orders"]);
  assert.equal(url.searchParams.get("select")?.replace(/\s/g, ""), COLUNAS_PUBLICAS);
  assert.equal(url.searchParams.get("select"), COLUNAS_PUBLICAS);
  assert.deepEqual(filtros(url), {
    tenant_id: "eq.loja-a",
    doc_hmac: `eq.${"a".repeat(64)}`,
    phone_last4: "eq.4321",
    order_created_at: "gte.2026-07-31T15:00:00.000Z",
    order: "order_created_at.desc",
    limit: "20",
  });
});

test("pedidoPorToken: um pedido da loja, só colunas públicas", async () => {
  responder = () => ({ status: 200, corpo: [LINHA_PUBLICA] });
  assert.deepEqual(await pedidoPorToken("loja-a", "f".repeat(32)), PUBLICO);
  const [{ url }] = chamadas;
  assert.equal(url.searchParams.get("select"), COLUNAS_PUBLICAS);
  assert.deepEqual(filtros(url), { tenant_id: "eq.loja-a", link_token: `eq.${"f".repeat(32)}` });

  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await pedidoPorToken("loja-a", "0".repeat(32)), null);
});

test("pararAvisos grava a data uma vez, pula os pendentes e nunca toca em optouts", async () => {
  const token = "f".repeat(32);
  responder = ({ metodo, url }) => {
    if (url.pathname === "/rest/v1/tracking_orders") return { status: 200, corpo: [{ id: "o-1" }] };
    if (url.pathname === "/rest/v1/tracking_notices" && metodo === "PATCH") return { status: 200, corpo: [{ id: "n-1" }] };
    return { status: 500, corpo: { message: "inesperado" } };
  };

  assert.deepEqual(await pararAvisos("loja-a", token), { orderId: "o-1" });

  const [pedidos, avisos] = chamadas;
  assert.deepEqual([pedidos.metodo, pedidos.url.pathname], ["PATCH", "/rest/v1/tracking_orders"]);
  assert.deepEqual(filtros(pedidos.url), { tenant_id: "eq.loja-a", link_token: `eq.${token}`, notices_stopped_at: "is.null" });
  assert.match((pedidos.corpo as { notices_stopped_at: string }).notices_stopped_at, ISO);
  assert.deepEqual([avisos.metodo, avisos.url.pathname], ["PATCH", "/rest/v1/tracking_notices"]);
  assert.deepEqual(filtros(avisos.url), { tenant_id: "eq.loja-a", order_id: "eq.o-1", status: "eq.pendente" });
  const { updated_at: carimbo, ...resto } = avisos.corpo as Record<string, string>;
  assert.deepEqual(resto, { status: "pulado" });
  assert.match(carimbo, ISO);
  assert.ok(chamadas.every((c) => !c.url.pathname.includes("optouts")));

  // Já parado: o 1º PATCH volta vazio, a leitura acha, os avisos pendentes seguem pulados, mesmo retorno.
  chamadas.length = 0;
  responder = ({ metodo, url }) => {
    if (url.pathname === "/rest/v1/tracking_orders") return { status: 200, corpo: metodo === "PATCH" ? [] : [{ id: "o-1" }] };
    return { status: 200, corpo: [] };
  };
  assert.deepEqual(await pararAvisos("loja-a", token), { orderId: "o-1" });
  assert.deepEqual(chamadas.map((c) => [c.metodo, c.url.pathname]), [
    ["PATCH", "/rest/v1/tracking_orders"],
    ["GET", "/rest/v1/tracking_orders"],
    ["PATCH", "/rest/v1/tracking_notices"],
  ]);
  assert.deepEqual(filtros(chamadas[1].url), { tenant_id: "eq.loja-a", link_token: `eq.${token}` });

  // Token desconhecido: nada a pular.
  chamadas.length = 0;
  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await pararAvisos("loja-a", "0".repeat(32)), null);
  assert.ok(chamadas.every((c) => c.url.pathname !== "/rest/v1/tracking_notices"));
});

test("purgarVencidos chama o purge e devolve quantos saíram", async () => {
  responder = () => ({ status: 200, corpo: 3 });
  assert.equal(await purgarVencidos(), 3);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url.pathname], ["POST", "/rest/v1/rpc/rastreio_purgar"]);
});
