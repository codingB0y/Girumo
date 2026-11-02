import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cenaDoCartao,
  noArDesde,
  recusadoPeloChipDosGrupos,
  textoDaSaude,
  type NumeroNaTela,
} from "./cartao";

// Telefones inventados (repo público).
const numero = (over: Partial<NumeroNaTela> = {}): NumeroNaTela => ({
  id: "inst-p",
  name: "Atendimento",
  status: "connected",
  phone: "5562988880002",
  qr_code: null,
  connected_at: "2026-10-02T02:00:00Z",
  metadata: null,
  pausadoAte: null,
  ...over,
});

test("sem resposta ainda, ou sem add-on e sem número, o cartão não aparece", () => {
  assert.equal(cenaDoCartao(null), "oculto");
  assert.equal(cenaDoCartao({ liberado: false, numero: null }), "oculto");
});

test("com add-on e sem número, convida a conectar", () => {
  assert.equal(cenaDoCartao({ liberado: true, numero: null }), "sem-numero");
});

test("QR, código ou conectando é pareando; aberto é conectado; o resto é desconectado", () => {
  for (const status of ["pending", "qr", "connecting"]) {
    assert.equal(cenaDoCartao({ liberado: true, numero: numero({ status }) }), "pareando", status);
  }
  assert.equal(cenaDoCartao({ liberado: true, numero: numero() }), "conectado");
  for (const status of ["disconnected", "blocked", "error"]) {
    assert.equal(cenaDoCartao({ liberado: true, numero: numero({ status }) }), "desconectado", status);
  }
});

test("add-on desligado com o número ainda lá: o cartão continua (para desconectar)", () => {
  assert.equal(cenaDoCartao({ liberado: false, numero: numero() }), "conectado");
});

test("a recusa pelo chip dos grupos vem do metadata", () => {
  assert.equal(recusadoPeloChipDosGrupos(numero({ metadata: { privado_recusado: "numero_dos_grupos" } })), true);
  assert.equal(recusadoPeloChipDosGrupos(numero({ metadata: null })), false);
});

test("a recusa limpa (chave presente, valor null) não conta como recusa", () => {
  // Reconectar com outro chip grava `privado_recusado: null` — a chave fica no JSON.
  assert.equal(recusadoPeloChipDosGrupos(numero({ metadata: { privado_recusado: null } })), false);
});

test("saúde: sem pausa, pausa que acaba hoje e pausa até outro dia, no horário de Brasília", () => {
  const agora = new Date("2026-10-30T15:00:00Z"); // 12:00 em Brasília
  assert.equal(textoDaSaude({ pausadoAte: null }, agora), "Sem pausa de proteção");
  assert.equal(textoDaSaude({ pausadoAte: "2026-10-30T14:00:00Z" }, agora), "Sem pausa de proteção");
  assert.equal(textoDaSaude({ pausadoAte: "2026-10-30T17:30:00Z" }, agora), "Em pausa de proteção até 14:30");
  assert.equal(textoDaSaude({ pausadoAte: "2026-10-31T12:00:00Z" }, agora), "Em pausa de proteção até 31/10 às 09:00");
});

test("saúde: perto da meia-noite o dia é o de Brasília, não o de UTC", () => {
  const agora = new Date("2026-10-30T23:30:00Z"); // 20:30 em Brasília
  // 31/10 01:00 UTC = 30/10 22:00 em Brasília: ainda hoje.
  assert.equal(textoDaSaude({ pausadoAte: "2026-10-31T01:00:00Z" }, agora), "Em pausa de proteção até 22:00");
});

test("no ar desde: a data do primeiro pareamento, em Brasília", () => {
  assert.equal(noArDesde("2026-10-02T02:00:00Z"), "No ar desde 01/10/2026");
  assert.equal(noArDesde(null), null);
});
