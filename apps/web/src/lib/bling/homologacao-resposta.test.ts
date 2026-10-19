import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConexaoBling } from "@/lib/stores/bling-conexoes";

import { homologarPeloAdmin, type DepsDoAdmin } from "./homologacao-resposta";
import type { Resultado } from "./sincronizar";

const LOJA = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const AGORA = new Date("2026-10-19T21:00:00.000Z");
const base: Resultado = { tenantId: LOJA, trava: true, processados: 0, falhas: 0, varredura: 0, historico: 0 };
const relatorio = {
  ok: true,
  passos: [{ passo: "GET" as const, status: 200, ms: 120, intervaloMs: 0, renovou: false, renovacaoMs: null, hashNo401: false }],
  totalMs: 900,
  erro: null,
};

function pedido(corpo: unknown, origem: string | null = "same-origin"): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (origem) headers.set("sec-fetch-site", origem);
  return new Request("https://app.girumo.test/api/admin/bling/homologacao", { method: "POST", headers, body: JSON.stringify(corpo) });
}

function deps(over: Partial<DepsDoAdmin> = {}) {
  const chamadas: string[] = [];
  const logs: string[] = [];
  const d: DepsDoAdmin = {
    admin: async () => ({ authUserId: "admin-1" }),
    disponivel: () => true,
    sincronizar: async (tenantId) => {
      chamadas.push(tenantId);
      return { ...base, homologacao: relatorio };
    },
    lerConexao: async () => null,
    agora: () => AGORA,
    log: (linha) => logs.push(linha),
    ...over,
  };
  return { d, chamadas, logs };
}

test("sem admin: 401 e o teste nunca roda (ele invalida o acesso de uma loja)", async () => {
  const { d, chamadas } = deps({ admin: async () => null });
  const r = await homologarPeloAdmin(pedido({ tenantId: LOJA }), d);
  assert.equal(r.status, 401);
  assert.deepEqual(chamadas, []);
});

test("pedido de outro site (sec-fetch-site cross-site): 403 sem rodar; sem o cabeçalho (cliente antigo) passa", async () => {
  const cruzado = deps();
  assert.equal((await homologarPeloAdmin(pedido({ tenantId: LOJA }, "cross-site"), cruzado.d)).status, 403);
  assert.deepEqual(cruzado.chamadas, []);
  const semCabecalho = deps();
  assert.equal((await homologarPeloAdmin(pedido({ tenantId: LOJA }, null), semCabecalho.d)).status, 200);
});

test("corpo inválido: 400 sem rodar; sem as variáveis do Bling: 503", async () => {
  for (const corpo of [{}, { tenantId: "loja-a" }, { tenantId: LOJA, extra: 1 }]) {
    const { d, chamadas } = deps();
    assert.equal((await homologarPeloAdmin(pedido(corpo), d)).status, 400, JSON.stringify(corpo));
    assert.deepEqual(chamadas, []);
  }
  assert.equal((await homologarPeloAdmin(pedido({ tenantId: LOJA }), deps({ disponivel: () => false }).d)).status, 503);
});

test("rodou: 200 com o relatório (ok ou não) e uma linha de auditoria com o admin, a loja e o resultado, sem token", async () => {
  const { d, chamadas, logs } = deps();
  const r = await homologarPeloAdmin(pedido({ tenantId: LOJA }), d);
  assert.deepEqual([r.status, r.corpo], [200, { relatorio }]);
  assert.deepEqual(chamadas, [LOJA]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], new RegExp(`admin-1.*${LOJA}.*ok`));
});

test("não pegou a trava: diz por quê — sem conexão (404), sem acesso (422), pausada (409 com a hora) ou sincronizando (409)", async () => {
  const conexao = (over: Partial<ConexaoBling>) => async () => ({ status: "ativa", pausedUntil: null, ...over }) as ConexaoBling;
  const casos: [DepsDoAdmin["lerConexao"], number, RegExp][] = [
    [async () => null, 404, /não tem o Bling conectado/],
    [conexao({ status: "reconectar" }), 422, /precisa reconectar/],
    [conexao({ status: "desconectada" }), 404, /não tem o Bling conectado/],
    [conexao({ pausedUntil: "2026-10-19T22:30:00.000Z" }), 409, /pausada.*19:30/],
    [conexao({}), 409, /sincronizando agora/],
  ];
  for (const [lerConexao, status, mensagem] of casos) {
    const { d } = deps({ lerConexao, sincronizar: async () => ({ ...base, trava: false }) });
    const r = await homologarPeloAdmin(pedido({ tenantId: LOJA }), d);
    assert.equal(r.status, status, String(mensagem));
    assert.match(String((r.corpo as { error: string }).error), mensagem);
  }
});

test("parou antes do teste (sem as variáveis no motor, chave trocada): 422 com o motivo", async () => {
  const { d } = deps({ sincronizar: async () => ({ ...base, parou: "chave" }) });
  const r = await homologarPeloAdmin(pedido({ tenantId: LOJA }), d);
  assert.equal(r.status, 422);
  assert.match(String((r.corpo as { error: string }).error), /teste não rodou: os tokens da loja/);
});
