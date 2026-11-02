import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { RASTREIO_DISABLED } from "@/lib/rastreio/rota-painel";
import { servirRastreio, type Chamada, type Resposta } from "@/test/rastreio-painel-falso";

import { GET } from "./route";

/** A saúde do código com o dono logado por Bearer contra um PostgREST de mentira. */

const SEM_CODIGO = { id: "0b6f1c2a-3d4e-4f5a-8b6c-7d8e9f0a1b2c", numero: "1539", etapa_at: "2026-10-20T12:00:00+00:00" };

const chamadas: Chamada[] = [];
let papel = "owner";
let tabelas: Record<string, Resposta> = {};

const { doBanco } = servirRastreio({ chamadas, papel: () => papel, tabelas: () => tabelas });

/** 15 enviados, 14 com código. */
const contagem = (c: Chamada) => ({
  status: 200,
  contentRange: `*/${c.url.searchParams.get("tracking_code") === "not.is.null" ? 14 : 15}`,
});

beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  tabelas = {
    "GET /rest/v1/tenant_settings": [{ rastreio_enabled: true }],
    "GET /rest/v1/tracking_orders": [SEM_CODIGO],
    "HEAD /rest/v1/tracking_orders": contagem,
  };
});

const pedir = () =>
  GET(new Request("http://girumo.test/api/rastreio/saude", { headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" } }));
const aoRastreio = () => doBanco().filter((c) => c.url.pathname.startsWith("/rest/v1/tracking_"));

test("dono lê a saúde do código da própria loja", async () => {
  const r = await pedir();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const corpo = await r.json();
  assert.equal(corpo.enviados, 15);
  assert.equal(corpo.comCodigo, 14);
  assert.equal(corpo.maisAntigoSemCodigo.numero, "1539");
  const pedidos = aoRastreio();
  assert.ok(pedidos.some((c) => c.metodo === "HEAD") && pedidos.some((c) => c.metodo === "GET"));
  for (const c of pedidos) assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b", c.url.toString());
});

test("sem pedido sem código", async () => {
  tabelas = { ...tabelas, "GET /rest/v1/tracking_orders": [] };
  assert.equal((await (await pedir()).json()).maisAntigoSemCodigo, null);
});

test("módulo desligado: 403", async () => {
  tabelas = { ...tabelas, "GET /rest/v1/tenant_settings": [{ rastreio_enabled: false }] };
  const r = await pedir();
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), RASTREIO_DISABLED);
  assert.equal(aoRastreio().length, 0);
});

test("operador não tem settings:connection", async () => {
  papel = "operator";
  const r = await pedir();
  assert.equal(r.status, 403);
  assert.equal(aoRastreio().length, 0);
});

test("vendedora recebe o 403 do mapa", async () => {
  papel = "seller";
  const r = await pedir();
  assert.equal(r.status, 403);
  assert.equal(await r.text(), MENSAGEM_BLOQUEIO);
  assert.equal(aoRastreio().length, 0);
});
