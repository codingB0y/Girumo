import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { RASTREIO_DISABLED } from "@/lib/rastreio/rota-painel";
import { servirRastreio, type Chamada, type Resposta } from "@/test/rastreio-painel-falso";

import { POST } from "./route";

/** Reenviar o aviso da etapa atual, com o dono logado por Bearer contra um PostgREST de mentira. */

const ID = "1c7a2d3b-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
const PEDIDO = {
  id: ID, numero: "1049", order_created_at: "2026-10-28T12:00:00+00:00", etapa: "enviado", etapa_at: "2026-10-30T12:00:00+00:00",
  events: [], shipment_service: null, tracking_code: "AB123456789BR", tracking_url: null, link_token: "tok-enviado",
  notices_stopped_at: null, tenant_id: "loja-b", external_id: "ext-1", status_raw: "on_carriage",
  buyer_first_name: "Ana", buyer_phone: "5511987654321", buyer_email_enc: "cifra-qualquer",
};
const CONFIG = {
  tenant_id: "loja-b", public_slug: "loja-exemplo", notify_store_on_problem: false, vip_link_id: null,
  store_whatsapp: null, imported_at: null, sweep_cursor: null,
  matrix: { enviado: { whatsapp: true, email: true } },
};

const chamadas: Chamada[] = [];
let papel = "owner";
let tabelas: Record<string, Resposta> = {};
let pedido: Record<string, unknown> = PEDIDO;
let config: Record<string, unknown> | null = CONFIG;

const { doBanco, escritas } = servirRastreio({ chamadas, papel: () => papel, tabelas: () => tabelas });

/**
 * O balde de rate limit (10 por minuto por loja) é em memória e dura o arquivo: os testes da "loja-b" juntos
 * não passam de 10 reenvios que chegam ao limitador (o 400 de id e os 403 do guard não contam). Teste novo
 * que reenvia pela "loja-b" além disso usa outra loja no `x-tenant-id`.
 */

beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  pedido = PEDIDO;
  config = CONFIG;
  tabelas = {
    "GET /rest/v1/tenant_settings": [{ rastreio_enabled: true }],
    // Só devolve o pedido a quem filtra pelo tenant dele: o de outra loja volta vazio.
    "GET /rest/v1/tracking_orders": (c: Chamada) => ({
      status: 200,
      corpo: c.url.searchParams.get("tenant_id") === `eq.${pedido.tenant_id}` ? [pedido] : [],
    }),
    "GET /rest/v1/tracking_settings": () => ({ status: 200, corpo: config ? [config] : [] }),
    "GET /rest/v1/tracking_notices": [],
    "POST /rest/v1/tracking_notices": (c: Chamada) => ({
      status: 201,
      corpo: (c.corpo as { channel: string }[]).map((l, i) => ({ id: `n-${i}`, channel: l.channel })),
    }),
  };
});

const reenviar = (id = ID, headers: Record<string, string> = {}) =>
  POST(
    new Request(`http://girumo.test/api/rastreio/entregas/${id}/reenviar`, {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", ...headers },
    }),
    { params: Promise.resolve({ id }) },
  );

test("reabre os dois canais ligados com contato", async () => {
  const r = await reenviar();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), { reabertos: 2, canais: ["whatsapp", "email"] });
  const gravacoes = escritas().filter((c) => c.url.pathname === "/rest/v1/tracking_notices");
  assert.ok(gravacoes.length > 0);
  assert.deepEqual(
    (gravacoes[0].corpo as { tenant_id: string }[]).map((l) => l.tenant_id),
    ["loja-b", "loja-b"],
  );
  for (const c of doBanco().filter((x) => x.url.pathname.startsWith("/rest/v1/tracking_") && x.metodo === "GET")) {
    assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b", c.url.toString());
  }
});

test("matriz só com e-mail: reabre só o e-mail", async () => {
  config = { ...CONFIG, matrix: { enviado: { whatsapp: false, email: true } } };
  const corpo = await (await reenviar()).json();
  assert.deepEqual(corpo.canais, ["email"]);
});

test("canal ligado sem contato não conta", async () => {
  pedido = { ...PEDIDO, buyer_phone: null };
  assert.deepEqual((await (await reenviar()).json()).canais, ["email"]);
});

test("compradora pediu para parar: 409 e nada gravado", async () => {
  pedido = { ...PEDIDO, notices_stopped_at: "2026-10-31T10:00:00+00:00" };
  const r = await reenviar();
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "A compradora pediu para parar os avisos deste pedido.", code: "avisos_parados" });
  assert.equal(escritas().length, 0);
});

test("etapa sem aviso: 409 e nada gravado", async () => {
  pedido = { ...PEDIDO, etapa: "separando" };
  const r = await reenviar();
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "Este pedido não está numa etapa com aviso.", code: "etapa_sem_aviso" });
  assert.equal(escritas().length, 0);
});

test("sem telefone nem e-mail: 409 sem_canal", async () => {
  pedido = { ...PEDIDO, buyer_phone: null, buyer_email_enc: null };
  const r = await reenviar();
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "Nenhum canal ligado tem contato da compradora nesta etapa.", code: "sem_canal" });
  assert.equal(escritas().length, 0);
});

test("loja sem configuração ou matriz malformada: 409 sem_canal", async () => {
  config = null;
  assert.equal((await (await reenviar()).json()).code, "sem_canal");
  config = { ...CONFIG, matrix: "lixo" };
  assert.equal((await (await reenviar()).json()).code, "sem_canal");
  assert.equal(escritas().length, 0);
});

test("pedido de outra loja: 404 e nada gravado", async () => {
  pedido = { ...PEDIDO, tenant_id: "loja-a" };
  const r = await reenviar();
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "Pedido não encontrado." });
  assert.equal(escritas().length, 0);
});

test("id que não é uuid: 400 sem tocar no banco", async () => {
  const r = await reenviar("1049");
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "Pedido inválido." });
  assert.equal(doBanco().filter((c) => c.url.pathname.startsWith("/rest/v1/tracking_")).length, 0);
});

test("vendedora recebe o 403 do mapa", async () => {
  papel = "seller";
  const r = await reenviar();
  assert.equal(r.status, 403);
  assert.equal(await r.text(), MENSAGEM_BLOQUEIO);
  assert.equal(escritas().length, 0);
});

test("operador não tem settings:connection", async () => {
  papel = "operator";
  const r = await reenviar();
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: "Sem permissão para esta ação." });
  assert.equal(escritas().length, 0);
});

test("módulo desligado: 403", async () => {
  tabelas = { ...tabelas, "GET /rest/v1/tenant_settings": [{ rastreio_enabled: false }] };
  const r = await reenviar();
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), RASTREIO_DISABLED);
  assert.equal(escritas().length, 0);
});

test("aviso do único canal já pendente: 200 com reabertos 0 e nada inserido", async () => {
  config = { ...CONFIG, matrix: { enviado: { whatsapp: true, email: false } } };
  tabelas = {
    ...tabelas,
    "GET /rest/v1/tracking_notices": [{ id: "n-1", channel: "whatsapp", resends: 0 }],
    "PATCH /rest/v1/tracking_notices": [],
  };
  const r = await reenviar();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { reabertos: 0, canais: ["whatsapp"] });
  assert.equal(escritas().filter((c) => c.metodo === "POST").length, 0);
});

test("11º reenvio no minuto da mesma loja: 429 sem tocar no banco", async () => {
  const daRajada = { "x-tenant-id": "loja-rajada" };
  for (let i = 1; i <= 10; i += 1) assert.equal((await reenviar(ID, daRajada)).status, 404, `reenvio ${i}`);
  chamadas.length = 0;
  const r = await reenviar(ID, daRajada);
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "Muitas tentativas. Espere um minuto." });
  assert.equal(doBanco().filter((c) => c.url.pathname.startsWith("/rest/v1/tracking_")).length, 0);
  // O balde é da loja: outra loja segue passando pelo limitador (404: o pedido não é dela).
  assert.equal((await reenviar(ID, { "x-tenant-id": "loja-c" })).status, 404);
});
