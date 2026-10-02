import assert from "node:assert/strict";
import { test } from "node:test";

import type { AtividadeDaCampanha, PontoDaSerie } from "@/lib/painel/atividade";
import { atualizadoHa, comparacaoComecaEm, numerosDaFaixa, pedidosDeHoje } from "./faixa";

const ponto = (inicio: string, p: Partial<PontoDaSerie> = {}): PontoDaSerie => ({
  inicio, novas: 0, cliques: 0, entraram: 0, sairam: 0, ...p,
});

function atividade(geradoEm: string, porHora: PontoDaSerie[], porDia: PontoDaSerie[], semanaPassadaEntraram = 0): AtividadeDaCampanha {
  return {
    geradoEm,
    entradasDesde: "2026-10-01T02:01:58.000Z",
    porHora,
    porDia,
    semanaPassada: { novas: 0, cliques: 0, entraram: semanaPassadaEntraram, sairam: 0 },
    hojePorGrupo: {},
    gruposAbertosHoje: [],
  };
}

test("soma entraram, saíram e cliques de hoje e tira o saldo", () => {
  const a = atividade(
    "2026-10-02T17:10:00.000Z",
    [ponto("2026-10-02T12:00:00.000Z", { entraram: 10, sairam: 2, cliques: 30 }), ponto("2026-10-02T16:00:00.000Z", { entraram: 5, sairam: 1, cliques: 4 })],
    [ponto("2026-10-01T03:00:00.000Z", { entraram: 20, sairam: 3 }), ponto("2026-10-02T03:00:00.000Z", { entraram: 15, sairam: 3 })],
  );
  const n = numerosDaFaixa(a);
  assert.equal(n.entraram, 15);
  assert.equal(n.sairam, 3);
  assert.equal(n.saldo, 12);
  assert.equal(n.cliques, 34);
  // As barras vêm dos dias da série; o último é hoje, aceso.
  assert.equal(n.seteDias.at(-1)?.atual, true);
});

test("antes de 7 dias medidos não compara: diz desde quando mede", () => {
  const a = atividade("2026-10-02T17:10:00.000Z", [], [], 99);
  assert.deepEqual(numerosDaFaixa(a).comparacao, { tipo: "medindo", desde: "2026-10-01T02:01:58.000Z" });
});

test("com a semana passada medida, compara com ela", () => {
  const a = atividade("2026-10-09T17:10:00.000Z", [], [], 40);
  const c = numerosDaFaixa(a).comparacao;
  assert.equal(c.tipo, "contra");
  assert.equal(c.tipo === "contra" && c.antes, 40);
});

test("saldo da semana não conta dia sem medição como zero de verdade", () => {
  const a = atividade(
    "2026-10-02T17:10:00.000Z",
    [],
    [ponto("2026-09-28T03:00:00.000Z", { entraram: 999, sairam: 0 }), ponto("2026-10-01T03:00:00.000Z", { entraram: 20, sairam: 3 }), ponto("2026-10-02T03:00:00.000Z", { entraram: 15, sairam: 3 })],
  );
  // 28/09 é antes da medição: fica de fora do saldo.
  assert.equal(numerosDaFaixa(a).saldoSemana, 29);
});

test("pedidos de hoje: só os de hoje em Brasília, e a meta do mês em %", () => {
  const agora = new Date("2026-10-02T17:00:00.000Z");
  const orders = [
    { value: 100, created_at: "2026-10-02T13:00:00.000Z" },
    { value: 50, created_at: "2026-10-02T02:30:00.000Z" }, // 01/10 23:30 em Brasília
    { value: 250, created_at: "2026-10-01T15:00:00.000Z" },
  ];
  assert.deepEqual(pedidosDeHoje(orders, 1000, agora), { quantidade: 1, valor: 100, metaPct: 40 });
  assert.equal(pedidosDeHoje(orders, null, agora).metaPct, null);
  assert.equal(pedidosDeHoje(orders, 0, agora).metaPct, null);
});

test("atualizado há: agora, minutos e horas", () => {
  const agora = new Date("2026-10-02T17:10:00.000Z");
  assert.equal(atualizadoHa("2026-10-02T17:09:40.000Z", agora), "atualizado agora");
  assert.equal(atualizadoHa("2026-10-02T17:07:00.000Z", agora), "atualizado há 3 min");
  assert.equal(atualizadoHa("2026-10-02T15:05:00.000Z", agora), "atualizado há 2 h");
});

test("a comparação começa no primeiro dia com 7 dias medidos antes dele", () => {
  // Mediu a partir de 30/09 23:01 (Brasília): o primeiro dia inteiro medido é 01/10, e a semana passada dele fecha em 08/10.
  assert.equal(comparacaoComecaEm("2026-09-30T23:01:58-03:00"), "08/10");
  // Medição que começa à meia-noite exata: aquele dia já é inteiro.
  assert.equal(comparacaoComecaEm("2026-10-01T00:00:00-03:00"), "08/10");
});
