import assert from "node:assert/strict";
import { test } from "node:test";
import { janela, situacaoAoReceber, situacaoAoResponderPelaLoja, tombstoneHash } from "./situacao";

const AGORA = new Date("2026-11-06T12:00:00Z");
const h = (horas: number) => new Date(AGORA.getTime() - horas * 3600_000).toISOString();

test("janela: até 24 h aberta, de 24 h a 7 dias humano, depois ou sem registro fechada", () => {
  assert.equal(janela(h(0), AGORA), "aberta");
  assert.equal(janela(h(24), AGORA), "aberta", "24 h cravadas ainda é aberta");
  assert.equal(janela(h(24.01), AGORA), "humano");
  assert.equal(janela(h(24 * 7), AGORA), "humano", "7 dias cravados ainda é humano");
  assert.equal(janela(h(24 * 7 + 0.01), AGORA), "fechada");
  assert.equal(janela(null, AGORA), "fechada");
  assert.equal(janela("lixo", AGORA), "fechada", "data ilegível nunca abre a janela");
});

test("janela: data no futuro (relógio torto) conta como aberta", () => {
  assert.equal(janela(h(-1), AGORA), "aberta");
});

test("situacaoAoReceber: robô respondeu = aberta; calado ou pausado = aguardando", () => {
  assert.equal(situacaoAoReceber({ robotRespondeu: true, robotPausado: false }), "open");
  assert.equal(situacaoAoReceber({ robotRespondeu: false, robotPausado: false }), "waiting");
  assert.equal(situacaoAoReceber({ robotRespondeu: false, robotPausado: true }), "waiting");
  assert.equal(situacaoAoReceber({ robotRespondeu: true, robotPausado: true }), "waiting", "pausado vence: o robô não deveria ter falado");
  assert.equal(situacaoAoReceber({ atual: "resolved", robotRespondeu: true, robotPausado: false }), "open", "mensagem nova reabre");
});

test("situacaoAoResponderPelaLoja: sempre aberta", () => {
  assert.equal(situacaoAoResponderPelaLoja(), "open");
});

test("tombstoneHash: sha256 hex estável, separado por loja, sem o id em claro", () => {
  const a = tombstoneHash("loja-a", "u1");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, tombstoneHash("loja-a", "u1"));
  assert.notEqual(a, tombstoneHash("loja-b", "u1"));
  assert.notEqual(a, tombstoneHash("loja-a", "u2"));
  assert.equal(a.includes("u1"), false);
  // sha256("loja-a:u1") calculado à parte: trava o formato que a varredura (PR 2a-2) vai repetir.
  assert.equal(a, "df6da240bed5bc9ff64103dccb0491729c07ffd8d844b175d656d8780f6af5bc");
});
