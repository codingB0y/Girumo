import assert from "node:assert/strict";
import { test } from "node:test";

import type { AtividadeDaCampanha, Movimento, PontoDaSerie } from "@/lib/painel/atividade";
import {
  dataDaFaixa,
  haQuanto,
  legendaDaComparacao,
  legendaDosCliques,
  legendaDosPedidos,
  numerosDaFaixa,
  pedidosDeHoje,
  variacaoNaFaixa,
  type Comparacao,
} from "./faixa";

const ponto = (inicio: string, p: Partial<PontoDaSerie> = {}): PontoDaSerie => ({
  inicio, novas: 0, cliques: 0, entraram: 0, sairam: 0, ...p,
});

function atividade(geradoEm: string, porHora: PontoDaSerie[], porDia: PontoDaSerie[], semanaPassada: Partial<Movimento> = {}): AtividadeDaCampanha {
  return {
    geradoEm,
    entradasDesde: "2026-10-01T02:01:58.000Z",
    porHora,
    porDia,
    semanaPassada: { novas: 0, cliques: 0, entraram: 0, sairam: 0, ...semanaPassada },
    hojePorGrupo: {},
    gruposAbertosHoje: [],
  };
}

test("soma entraram, saíram e cliques de hoje", () => {
  const a = atividade(
    "2026-10-02T17:10:00.000Z",
    [ponto("2026-10-02T12:00:00.000Z", { entraram: 10, sairam: 2, cliques: 30 }), ponto("2026-10-02T16:00:00.000Z", { entraram: 5, sairam: 1, cliques: 4 })],
    [ponto("2026-10-01T03:00:00.000Z", { entraram: 20, sairam: 3 }), ponto("2026-10-02T03:00:00.000Z", { entraram: 15, sairam: 3 })],
  );
  const n = numerosDaFaixa(a);
  assert.equal(n.entraram, 15);
  assert.equal(n.sairam, 3);
  assert.equal(n.cliques, 34);
  // As barras vêm dos dias da série; o último é hoje, aceso.
  assert.equal(n.seteDias.at(-1)?.atual, true);
});

test("antes de 7 dias medidos não compara: diz desde quando mede", () => {
  const a = atividade("2026-10-02T17:10:00.000Z", [], [], { entraram: 99, sairam: 9 });
  assert.deepEqual(numerosDaFaixa(a).comparacao, { tipo: "medindo", desde: "2026-10-01T02:01:58.000Z" });
});

test("com a semana passada medida, compara entradas e saídas com ela", () => {
  const a = atividade("2026-10-09T17:10:00.000Z", [], [], { entraram: 40, sairam: 6 });
  assert.deepEqual(numerosDaFaixa(a).comparacao, {
    tipo: "contra",
    antes: { entraram: 40, sairam: 6 },
    diaPassado: "na sexta passada",
  });
});

test("variação: sinal de menos tipográfico, e nas saídas cair é bom", () => {
  assert.deepEqual(variacaoNaFaixa(214, 181), { texto: "+18%", bom: true });
  assert.deepEqual(variacaoNaFaixa(150, 181), { texto: "−17%", bom: false });
  assert.deepEqual(variacaoNaFaixa(23, 27, true), { texto: "−15%", bom: true });
  assert.deepEqual(variacaoNaFaixa(30, 27, true), { texto: "+11%", bom: false });
  assert.deepEqual(variacaoNaFaixa(10, 10, true), { texto: "0%", bom: true });
});

test("sem base na semana passada não há variação", () => {
  assert.equal(variacaoNaFaixa(5, 0), null);
});

test("legenda de entradas e saídas: o número da semana passada, ou desde quando mede", () => {
  const contra: Comparacao = { tipo: "contra", antes: { entraram: 1236, sairam: 27 }, diaPassado: "na terça passada" };
  assert.equal(legendaDaComparacao(contra, "entraram"), "1.236 na terça passada, mesma hora");
  assert.equal(legendaDaComparacao(contra, "sairam"), "27 na terça passada");
  const medindo: Comparacao = { tipo: "medindo", desde: "2026-10-01T02:01:58.000Z" };
  assert.equal(legendaDaComparacao(medindo, "entraram"), "medindo desde 30/09, 23h");
  assert.equal(legendaDaComparacao(medindo, "sairam"), "medindo desde 30/09, 23h");
});

const CAMPANHAS = [
  { id: "c1", name: "VIP Revenda" },
  { id: "c2", name: "Saldão de Setembro" },
  { id: "c3", name: "Lojistas do Brás" },
  { id: "c4", name: "Pouca Gente" },
];

test("legenda dos cliques: as três campanhas com mais cliques, no total", () => {
  const links = [
    { campaignGroupId: "c1", clicks: 200 },
    { campaignGroupId: "c1", clicks: 63 },
    { campaignGroupId: "c2", clicks: 48 },
    // Link antigo, sem o ID: casa pelo nome (regra de click-attribution).
    { campaignName: "lojistas do brás", clicks: 17 },
    { campaignGroupId: "c4", clicks: 2 },
    // Campanha apagada: conta no total, mas não entra na lista.
    { campaignGroupId: "apagada", clicks: 500 },
  ];
  assert.equal(legendaDosCliques(links, CAMPANHAS), "no total: VIP Revenda 263 · Saldão de Setembro 48 · Lojistas do Brás 17");
});

test("legenda dos cliques sem campanha atribuída, e sem clique nenhum", () => {
  assert.equal(legendaDosCliques([{ campaignGroupId: "apagada", clicks: 1500 }], CAMPANHAS), "1.500 no total");
  assert.equal(legendaDosCliques([], CAMPANHAS), "ninguém clicou num link ainda");
  assert.equal(legendaDosCliques([{ campaignGroupId: "c1", clicks: 0 }], CAMPANHAS), "ninguém clicou num link ainda");
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

test("legenda dos pedidos: quantos, e o mês contra a meta", () => {
  const agora = new Date("2026-10-05T17:00:00.000Z");
  assert.equal(legendaDosPedidos({ quantidade: 6, valor: 1240, metaPct: 63 }, agora, true), "6 pedidos · outubro em 63% da meta");
  assert.equal(legendaDosPedidos({ quantidade: 1, valor: 50, metaPct: 0 }, agora, true), "1 pedido · outubro em 0% da meta");
  assert.equal(legendaDosPedidos({ quantidade: 0, valor: 0, metaPct: null }, agora, true), "nenhum pedido hoje · sem meta do mês");
  // A meta que não carregou não vira "sem meta".
  assert.equal(legendaDosPedidos({ quantidade: 6, valor: 1240, metaPct: null }, agora, false), "6 pedidos · meta não carregou");
  // 31/10 às 23h em Brasília ainda é outubro.
  assert.equal(legendaDosPedidos({ quantidade: 2, valor: 80, metaPct: 90 }, new Date("2026-11-01T02:00:00.000Z"), true), "2 pedidos · outubro em 90% da meta");
});

test("há quanto: agora, minutos e horas", () => {
  const agora = new Date("2026-10-02T17:10:00.000Z");
  assert.equal(haQuanto("2026-10-02T17:09:40.000Z", agora), "agora");
  assert.equal(haQuanto("2026-10-02T17:07:00.000Z", agora), "há 3 min");
  assert.equal(haQuanto("2026-10-02T15:05:00.000Z", agora), "há 2 h");
});

test("data do AO VIVO por extenso e curta, no fuso de Brasília", () => {
  const esperado = { longa: "segunda, 5 de outubro", curta: "segunda 05/10" };
  assert.deepEqual(dataDaFaixa(new Date("2026-10-05T17:00:00.000Z")), esperado);
  // 23h30 de segunda em Brasília já é terça em UTC.
  assert.deepEqual(dataDaFaixa(new Date("2026-10-06T02:30:00.000Z")), esperado);
});
