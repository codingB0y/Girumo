import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { servirRastreio, type Chamada, type Resposta } from "@/test/rastreio-painel-falso";

import { GET } from "./route";

/** O estado do módulo com o dono logado por Bearer contra um PostgREST de mentira. */

const chamadas: Chamada[] = [];
let papel = "owner";
let tabelas: Record<string, Resposta> = {};

servirRastreio({ chamadas, papel: () => papel, tabelas: () => tabelas });

const comFlag = (ligado: boolean) => ({ "GET /rest/v1/tenant_settings": [{ rastreio_enabled: ligado }] });

beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  tabelas = comFlag(true);
});

const pedir = () =>
  GET(new Request("http://girumo.test/api/rastreio/status", { headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" } }));

test("dono com a flag ligada", async () => {
  const r = await pedir();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), { enabled: true });
});

test("flag desligada responde 200 enabled false", async () => {
  tabelas = comFlag(false);
  const r = await pedir();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enabled: false });
});

test("operador: 403", async () => {
  papel = "operator";
  assert.equal((await pedir()).status, 403);
});

test("vendedora recebe o 403 do mapa", async () => {
  papel = "seller";
  const r = await pedir();
  assert.equal(r.status, 403);
  assert.equal(await r.text(), MENSAGEM_BLOQUEIO);
});
