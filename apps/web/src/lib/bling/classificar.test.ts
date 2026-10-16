import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASES_BLOQUEADAS,
  baseDaSituacao,
  classificarPedido,
  dentroDaJanelaMeta,
  horaDoPedido,
  idsDeVendaPadrao,
  idsDeVendaValidos,
  JANELA_META_MS,
  SITUACAO,
  SITUACOES_PADRAO,
} from "./classificar";
import type { SituacaoBling } from "./tipos";

// Situações próprias da loja: herdam de uma padrão (base).
const PAGO_NO_PIX: SituacaoBling = { id: 31337, nome: "Pago no Pix", base: SITUACAO.ATENDIDO };
const DESISTIU: SituacaoBling = { id: 40001, nome: "Desistiu", base: SITUACAO.CANCELADO };
const RASCUNHO: SituacaoBling = { id: 40002, nome: "Rascunho", base: SITUACAO.EM_DIGITACAO };
const SEPARANDO: SituacaoBling = { id: 40003, nome: "Separando", base: SITUACAO.EM_ANDAMENTO };
const DA_LOJA: readonly SituacaoBling[] = [...SITUACOES_PADRAO, PAGO_NO_PIX, DESISTIU, RASCUNHO, SEPARANDO];

test("situações padrão: os 7 ids do Bling, cada uma base de si mesma", () => {
  assert.deepEqual(
    SITUACOES_PADRAO.map((s) => [s.id, s.nome, s.base]),
    [
      [6, "Em aberto", 6],
      [9, "Atendido", 9],
      [12, "Cancelado", 12],
      [15, "Em andamento", 15],
      [18, "Venda agenciada", 18],
      [21, "Em digitação", 21],
      [24, "Verificado", 24],
    ],
  );
  assert.deepEqual(Object.values(SITUACAO), [6, 9, 12, 15, 18, 21, 24]);
});

test("bases bloqueadas: Cancelado e Em digitação", () => {
  assert.deepEqual([...BASES_BLOQUEADAS].sort((a, b) => a - b), [12, 21]);
});

test("base da situação: própria herda; padrão é ela mesma; desconhecida é ela mesma", () => {
  assert.equal(baseDaSituacao(31337, DA_LOJA), 9);
  assert.equal(baseDaSituacao(40001, DA_LOJA), 12);
  assert.equal(baseDaSituacao(9, DA_LOJA), 9);
  assert.equal(baseDaSituacao(777, DA_LOJA), 777);
  assert.equal(baseDaSituacao(21, []), 21);
});

test("ids de venda padrão: toda situação com base Atendido, inclusive a 9, ordenadas", () => {
  assert.deepEqual(idsDeVendaPadrao(SITUACOES_PADRAO), [9]);
  assert.deepEqual(idsDeVendaPadrao([PAGO_NO_PIX, ...DA_LOJA]), [9, 31337]);
  assert.deepEqual(idsDeVendaPadrao([]), []);
});

test("ids de venda padrão sempre passam na validação", () => {
  assert.equal(idsDeVendaValidos(idsDeVendaPadrao(DA_LOJA), DA_LOJA), true);
  assert.equal(idsDeVendaValidos(idsDeVendaPadrao(SITUACOES_PADRAO), SITUACOES_PADRAO), true);
});

test("ids de venda válidos: pelo menos um, conhecidos, sem repetição, nenhum com base bloqueada", () => {
  assert.equal(idsDeVendaValidos([9], DA_LOJA), true);
  assert.equal(idsDeVendaValidos([9, 31337, 24, 40003], DA_LOJA), true);
  assert.equal(idsDeVendaValidos([], DA_LOJA), false);
  assert.equal(idsDeVendaValidos([9, 9], DA_LOJA), false);
  assert.equal(idsDeVendaValidos([9, 777], DA_LOJA), false);
  assert.equal(idsDeVendaValidos([9, 12], DA_LOJA), false);
  assert.equal(idsDeVendaValidos([21], DA_LOJA), false);
  assert.equal(idsDeVendaValidos([9, 40001], DA_LOJA), false);
  assert.equal(idsDeVendaValidos([40002], DA_LOJA), false);
  assert.equal(idsDeVendaValidos([9], []), false);
});

const IDS_DE_VENDA = [9, 31337];
const pedido = (situacaoId: number, total = 150) => ({ situacaoId, total });

test("classificar: pedido sumido (null) é excluído", () => {
  assert.equal(classificarPedido(null, DA_LOJA, IDS_DE_VENDA), "excluido");
});

test("classificar: Em digitação (padrão ou herdada) é ignorado, mesmo marcada como venda", () => {
  assert.equal(classificarPedido(pedido(21), DA_LOJA, IDS_DE_VENDA), "ignorado");
  assert.equal(classificarPedido(pedido(40002), DA_LOJA, IDS_DE_VENDA), "ignorado");
  assert.equal(classificarPedido(pedido(21), DA_LOJA, [21]), "ignorado");
  assert.equal(classificarPedido(pedido(21), [], []), "ignorado");
});

test("classificar: total zero, negativo ou não finito é ignorado, mesmo em situação de venda", () => {
  for (const total of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(classificarPedido(pedido(9, total), DA_LOJA, IDS_DE_VENDA), "ignorado", `total ${total}`);
  }
  assert.equal(classificarPedido(pedido(6, 0), DA_LOJA, IDS_DE_VENDA), "ignorado");
});

test("classificar: situação marcada como venda é venda (padrão e herdada)", () => {
  assert.equal(classificarPedido(pedido(9), DA_LOJA, IDS_DE_VENDA), "venda");
  assert.equal(classificarPedido(pedido(31337, 0.01), DA_LOJA, IDS_DE_VENDA), "venda");
  assert.equal(classificarPedido(pedido(24), DA_LOJA, [24]), "venda");
});

test("classificar: venda depende da escolha da loja, não da base", () => {
  // 31337 herda de Atendido, mas a loja só marcou a 9.
  assert.equal(classificarPedido(pedido(31337), DA_LOJA, [9]), "pedido");
});

test("classificar: o resto é pedido (lead qualificado)", () => {
  assert.equal(classificarPedido(pedido(6), DA_LOJA, IDS_DE_VENDA), "pedido");
  assert.equal(classificarPedido(pedido(12), DA_LOJA, IDS_DE_VENDA), "pedido");
  assert.equal(classificarPedido(pedido(15), DA_LOJA, IDS_DE_VENDA), "pedido");
  assert.equal(classificarPedido(pedido(40003), DA_LOJA, IDS_DE_VENDA), "pedido");
  assert.equal(classificarPedido(pedido(777), DA_LOJA, IDS_DE_VENDA), "pedido");
});

test("classificar: base Cancelado nunca vira venda, mesmo se a lista de venda estiver errada", () => {
  assert.equal(classificarPedido(pedido(12), DA_LOJA, [9, 12]), "pedido");
  assert.equal(classificarPedido(pedido(40001), DA_LOJA, [9, 40001]), "pedido");
});

// Meio-dia em São Paulo (UTC−3, sem horário de verão) = 15:00 UTC. Nos casos abaixo sem `visto`, o
// pedido foi visto agora: a regra de antes da referência pela 1ª vez.
const meioDiaSP = (dia: string) => new Date(`${dia}T15:00:00.000Z`);

test("hora do pedido: data nula, malformada ou antes de 2000 → agora", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z");
  const tortas = [null, "", "13/10/2026", "2026-1-5", "2026-10-13T10:00:00", " 2026-10-12", "0000-00-00", "2026-13-01", "2026-02-30", "2026-02-29"];
  for (const dia of [...tortas, "0001-01-01", "1970-01-01", "1999-12-31"]) {
    assert.equal(horaDoPedido(dia, agora, agora).getTime(), agora.getTime(), `dia ${String(dia)}`);
  }
});

test("hora do pedido: hoje em São Paulo → agora, não o meio-dia", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z"); // 17:00 em SP
  assert.equal(horaDoPedido("2026-10-13", agora, agora).getTime(), agora.getTime());
});

test("hora do pedido: perto da meia-noite UTC ainda é o dia anterior em São Paulo", () => {
  const agora = new Date("2026-10-14T02:30:00.000Z"); // 23:30 do dia 13 em SP
  assert.equal(horaDoPedido("2026-10-13", agora, agora).getTime(), agora.getTime());
  assert.equal(horaDoPedido("2026-10-12", agora, agora).getTime(), meioDiaSP("2026-10-12").getTime());
});

test("hora do pedido: virou o dia em São Paulo, ontem vira meio-dia de ontem", () => {
  const agora = new Date("2026-10-14T03:00:00.000Z"); // 00:00 do dia 14 em SP
  assert.equal(horaDoPedido("2026-10-13", agora, agora).getTime(), meioDiaSP("2026-10-13").getTime());
  assert.equal(horaDoPedido("2026-10-14", agora, agora).getTime(), agora.getTime());
});

test("hora do pedido: dia passado → 12:00 de São Paulo daquele dia", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z");
  assert.equal(horaDoPedido("2026-09-25", agora, agora).toISOString(), "2026-09-25T15:00:00.000Z");
  assert.equal(horaDoPedido("2024-02-29", agora, agora).toISOString(), "2024-02-29T15:00:00.000Z");
  assert.equal(horaDoPedido("2000-01-01", agora, agora).toISOString(), "2000-01-01T15:00:00.000Z");
});

test("hora do pedido: dia futuro nunca sai no futuro", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z");
  assert.equal(horaDoPedido("2026-10-14", agora, agora).getTime(), agora.getTime());
  assert.equal(horaDoPedido("2027-01-01", agora, agora).getTime(), agora.getTime());
});

test("hora do pedido: devolve Date novo, nunca o próprio agora", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z");
  for (const dia of [null, "2026-10-13", "2026-10-20", "lixo"]) {
    const hora = horaDoPedido(dia, agora, agora);
    assert.notEqual(hora, agora, `dia ${String(dia)}`);
    hora.setTime(0);
    assert.equal(agora.toISOString(), "2026-10-13T20:00:00.000Z");
  }
});

test("hora do pedido: a referência é quando a Girumo o viu pela 1ª vez — a nova tentativa não muda a hora", () => {
  const visto = new Date("2026-10-14T02:50:00.000Z"); // 23:50 do dia 13 em SP
  const agora = new Date("2026-10-14T03:10:00.000Z"); // 00:10 do dia 14: a nova tentativa
  // Mutante (a hora da tentativa): virava 12:00 do dia 13, e a venda, o created_at e o event_time divergiam.
  assert.equal(horaDoPedido("2026-10-13", visto, agora).toISOString(), visto.toISOString());
  assert.equal(horaDoPedido(null, visto, agora).toISOString(), visto.toISOString());
});

test("hora do pedido: visto semana passada e com a data editada para hoje → 12:00 de hoje, mas nunca depois de agora", () => {
  const visto = new Date("2026-10-06T15:00:00.000Z");
  const cedo = new Date("2026-10-13T12:00:00.000Z"); // 09:00 em SP: o meio-dia ainda não chegou
  assert.equal(horaDoPedido("2026-10-13", visto, cedo).toISOString(), cedo.toISOString());
  const tarde = new Date("2026-10-13T20:00:00.000Z");
  assert.equal(horaDoPedido("2026-10-13", visto, tarde).toISOString(), "2026-10-13T15:00:00.000Z");
});

test("hora do pedido: visto à frente do relógio (o do banco adiantado) ou ilegível → nunca depois de agora", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z");
  assert.equal(horaDoPedido("2026-10-13", new Date(agora.getTime() + 5_000), agora).getTime(), agora.getTime());
  assert.equal(horaDoPedido(null, new Date(Number.NaN), agora).getTime(), agora.getTime());
});

test("janela do Meta: 6 dias e 23 horas", () => {
  assert.equal(JANELA_META_MS, (6 * 24 + 23) * 60 * 60 * 1000);
});

test("janela do Meta: borda exata dentro; 1 ms além, fora", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z");
  assert.equal(dentroDaJanelaMeta(new Date(agora.getTime() - JANELA_META_MS), agora), true);
  assert.equal(dentroDaJanelaMeta(new Date(agora.getTime() - JANELA_META_MS - 1), agora), false);
  assert.equal(dentroDaJanelaMeta(agora, agora), true);
  assert.equal(dentroDaJanelaMeta(new Date("2026-10-06T20:00:00.000Z"), agora), false);
});

test("janela do Meta: até 5 minutos no futuro passa (relógios diferentes); mais que isso, não", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z");
  const cincoMin = 5 * 60 * 1000;
  assert.equal(dentroDaJanelaMeta(new Date(agora.getTime() + cincoMin), agora), true);
  assert.equal(dentroDaJanelaMeta(new Date(agora.getTime() + cincoMin + 1), agora), false);
});

test("janela do Meta: data inválida está fora", () => {
  const agora = new Date("2026-10-13T20:00:00.000Z");
  assert.equal(dentroDaJanelaMeta(new Date(Number.NaN), agora), false);
});
