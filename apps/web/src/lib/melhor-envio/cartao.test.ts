import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConexaoMelhorEnvio } from "@/lib/stores/melhorenvio-conexoes";

import { montarCartao, type DepsCartao } from "./cartao";

const AGORA = new Date("2026-11-07T12:00:00.000Z");
const SEMANA_MS = 7 * 86_400_000;

const CONEXAO: ConexaoMelhorEnvio = {
  tenantId: "t1",
  status: "ativa",
  accessTokenEnc: "SELADO-ACESSO-123",
  refreshTokenEnc: "SELADO-RENOVA-456",
  expiraEm: "2026-12-01T00:00:00.000Z",
  renovacaoExpiraEm: "2027-01-01T00:00:00.000Z",
  contaNome: "Loja da Ana",
  contaEmail: "ana@exemplo.com",
  temEtiqueta: true,
  primeiraPassadaEm: "2026-11-01T00:00:00.000Z",
  ultimaConsultaEm: "2026-11-07T11:55:00.000Z",
  ultimoErro: null,
};

function deps(over: Partial<DepsCartao> = {}, chamadas: string[] = []): DepsCartao {
  return {
    ligado: async () => true,
    credenciais: () => ({ clientId: "a", clientSecret: "b" }),
    conexao: async () => {
      chamadas.push("conexao");
      return CONEXAO;
    },
    entregues: async (_t, desde) => {
      chamadas.push(`entregues:${desde.toISOString()}`);
      return 4;
    },
    ...over,
  };
}

test("Rastreio desligado: nada é consultado", async () => {
  const chamadas: string[] = [];
  const c = await montarCartao("t1", AGORA, deps({ ligado: async () => false }, chamadas));
  assert.deepEqual(c, { liberado: false, disponivel: true, conexao: null, entreguesEm7Dias: 0 });
  assert.deepEqual(chamadas, []);
});

test("sem conexão: entregues não é chamado", async () => {
  const chamadas: string[] = [];
  const c = await montarCartao("t1", AGORA, deps({ conexao: async () => null }, chamadas));
  assert.deepEqual(c, { liberado: true, disponivel: true, conexao: null, entreguesEm7Dias: 0 });
  assert.deepEqual(chamadas, []);
});

test("conectada: campos mapeados e janela de 7 dias", async () => {
  const chamadas: string[] = [];
  const c = await montarCartao("t1", AGORA, deps({}, chamadas));
  assert.deepEqual(c.conexao, {
    status: "ativa",
    contaNome: "Loja da Ana",
    contaEmail: "ana@exemplo.com",
    temEtiqueta: true,
    primeiraPassadaFeita: true,
    ultimaConsultaEm: "2026-11-07T11:55:00.000Z",
    ultimoErro: null,
  });
  assert.equal(c.entreguesEm7Dias, 4);
  assert.ok(chamadas.includes(`entregues:${new Date(AGORA.getTime() - SEMANA_MS).toISOString()}`));
});

test("primeira passada pendente", async () => {
  const c = await montarCartao("t1", AGORA, deps({ conexao: async () => ({ ...CONEXAO, primeiraPassadaEm: null }) }));
  assert.equal(c.conexao?.primeiraPassadaFeita, false);
});

test("sem variáveis de ambiente: disponivel false", async () => {
  const c = await montarCartao("t1", AGORA, deps({ credenciais: () => null }));
  assert.equal(c.disponivel, false);
});

test("o cartão nunca carrega token selado", async () => {
  const json = JSON.stringify(await montarCartao("t1", AGORA, deps()));
  assert.ok(!json.includes("SELADO-"));
  assert.ok(!json.includes("Enc"));
});
