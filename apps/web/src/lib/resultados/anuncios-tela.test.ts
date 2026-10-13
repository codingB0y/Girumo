import assert from "node:assert/strict";
import { test } from "node:test";

import {
  avisoDePeriodoRecente,
  bicoDoTotal,
  clipDoDegrau,
  custo,
  degrausDoTotal,
  dinheiro,
  ehRespostaAnuncios,
  faixaDoTotal,
  FUNIL_CELULAR,
  FUNIL_COMPUTADOR,
  geometriaDoFunil,
  graficoPorDia,
  marcasDeGasto,
  notaDeJaMembros,
  porcentagem,
  porOnde,
  retorno,
} from "./anuncios-tela";

/** O Intl separa "R$" do número com espaço sem quebra; o teste lê com espaço comum. */
const sp = (s: string | null) => (s === null ? null : s.replace(/\u00a0/g, " "));

/** O exemplo do mockup (Main.dc.html). */
const TOTAL = {
  cadastros: 612,
  foram: 571,
  entraram: 498,
  ja_membros: 34,
  compradores: 46,
  pedidos: 58,
  vendido: 21760,
  gasto: 2840,
};

test("formatos: total sem centavos, custo com, taxa com uma casa só abaixo de 10%", () => {
  assert.equal(sp(dinheiro(21760)), "R$ 21.760");
  assert.equal(sp(dinheiro(-50)), "-R$ 50");
  assert.equal(sp(custo(4.6405)), "R$ 4,64");
  assert.equal(porcentagem(571, 612), "93%");
  assert.equal(porcentagem(46, 498), "9,2%");
  assert.equal(porcentagem(0, 10), "0%");
  assert.equal(porcentagem(3, 0), null);
  assert.equal(retorno(21760, 2840), "7,7×");
  assert.equal(retorno(21760, 0), null);
  assert.equal(retorno(-50, 100), "-0,5×");
});

test("faixa com gasto: gasto, vendido em verde e retorno com a frase por real", () => {
  const faixa = faixaDoTotal(TOTAL).map((c) => ({ ...c, valor: sp(c.valor), detalhe: sp(c.detalhe) }));
  assert.deepEqual(faixa, [
    { chave: "gasto", rotulo: "Gasto lançado", valor: "R$ 2.840", detalhe: "proporcional aos dias do período", sucesso: false },
    {
      chave: "vendido",
      rotulo: "Vendido pra quem veio dos anúncios",
      valor: "R$ 21.760",
      detalhe: "58 pedidos de 46 pessoas",
      sucesso: true,
    },
    { chave: "retorno", rotulo: "Retorno", valor: "7,7×", detalhe: "R$ 7,66 vendidos a cada R$ 1 de anúncio", sucesso: false },
  ]);
});

test("faixa sem gasto: travessão, nunca R$ 0 nem retorno inventado; singular certo", () => {
  const [gasto, vendido, ret] = faixaDoTotal({ ...TOTAL, gasto: 0, pedidos: 1, compradores: 1 });
  assert.equal(gasto.valor, "—");
  assert.equal(gasto.detalhe, "nenhum gasto lançado no período");
  assert.equal(vendido.detalhe, "1 pedido de 1 pessoa");
  assert.equal(ret.valor, "—");
  assert.equal(ret.detalhe, "aparece quando houver gasto lançado");
});

test("gasto escondido (null, sem ads:manage): travessão em gasto, retorno e custo, e o porquê", () => {
  const escondido = { ...TOTAL, gasto: null };
  const [gasto, , ret] = faixaDoTotal(escondido);
  assert.equal(gasto.valor, "—");
  assert.equal(gasto.detalhe, "só o dono e a administração veem o gasto");
  assert.equal(ret.valor, "—");
  assert.equal(ret.detalhe, "só o dono e a administração veem o gasto");
  assert.ok(degrausDoTotal(escondido).every((d) => d.custo === null));
  assert.equal(bicoDoTotal(escondido).direita, null);
  assert.equal(retorno(100, null), null);
});

test("degraus: passagem à esquerda e custo à direita, como no mockup", () => {
  const d = degrausDoTotal(TOTAL);
  assert.deepEqual(
    d.map((x) => [x.rotulo, x.valor, x.passagem, sp(x.custo), x.unidadeDoCusto]),
    [
      ["Se cadastraram", 612, "ponto de partida", "R$ 4,64", "por cadastro"],
      ["Foram pro grupo", 571, "93% dos cadastros", "R$ 4,97", "por clique"],
      ["Entraram no grupo", 498, "87% de quem foi", "R$ 5,70", "por entrada"],
      ["Compraram", 46, "9,2% de quem entrou", "R$ 61,74", "por comprador"],
    ],
  );
  assert.deepEqual(d.map((x) => x.taxa), [null, "93%", "87%", "9,2%"]);
});

test("degrau maior que o de cima não vira taxa acima de 100%: diz de onde veio a diferença", () => {
  // Só páginas da Girumo: ninguém "foi pro grupo" pelo link, mas 3 entraram e 5 compraram.
  const d = degrausDoTotal({ ...TOTAL, foram: 0, entraram: 3, compradores: 5, gasto: 0 });
  assert.equal(d[1].passagem, "0% dos cadastros");
  assert.equal(d[2].passagem, "inclui quem entrou sem passar pelo link");
  assert.equal(d[2].taxa, null);
  assert.equal(d[3].passagem, "inclui quem já era do grupo");
  assert.ok(d.every((x) => x.custo === null), "sem gasto, nenhum custo");
});

test("funil vazio: passagens viram travessão, sem dividir por zero", () => {
  const d = degrausDoTotal({ ...TOTAL, cadastros: 0, foram: 0, entraram: 0, compradores: 0 });
  assert.deepEqual(d.map((x) => x.passagem), ["ponto de partida", "—", "—", "—"]);
});

test("bico: vendido, pedidos por comprador e retorno; sem comprador não inventa ritmo", () => {
  const b = bicoDoTotal(TOTAL);
  assert.deepEqual({ ...b, valor: sp(b.valor) }, {
    valor: "R$ 21.760",
    pedidos: "58 pedidos",
    esquerda: "58 pedidos, 1,3 por comprador",
    direita: "7,7× de retorno",
  });
  const vazio = bicoDoTotal({ ...TOTAL, compradores: 0, pedidos: 0, vendido: 0, gasto: 0 });
  assert.equal(vazio.esquerda, "nenhum pedido ainda");
  assert.equal(vazio.direita, null);
});

test("nota de já membros só quando há", () => {
  assert.equal(
    notaDeJaMembros(34),
    "+34 se cadastraram já sendo do grupo. Não contam como entrada nova; o que compraram depois do cadastro conta pro anúncio.",
  );
  assert.equal(notaDeJaMembros(0), null);
});

test("geometria do funil grande: largura 30% + 70% × n/topo, fundo fecha no próximo e no bico", () => {
  assert.deepEqual(geometriaDoFunil([612, 571, 498, 46], FUNIL_COMPUTADOR), [
    { largura: 100, recuo: 2.34 },
    { largura: 95.31, recuo: 4.38 },
    { largura: 86.96, recuo: 29.73 },
    { largura: 35.26, recuo: 10.3 },
  ]);
  assert.deepEqual(geometriaDoFunil([612, 571, 498, 46], FUNIL_CELULAR), [
    { largura: 100, recuo: 1.74 },
    { largura: 96.52, recuo: 3.21 },
    { largura: 90.31, recuo: 21.26 },
    { largura: 51.91, recuo: 11.47 },
  ]);
});

test("geometria nunca alarga: degrau maior que o de cima satura na largura do de cima", () => {
  const g = geometriaDoFunil([10, 4, 6, 0], FUNIL_COMPUTADOR);
  assert.deepEqual(g, [
    { largura: 100, recuo: 21 },
    { largura: 58, recuo: 0 },
    { largura: 58, recuo: 24.14 },
    { largura: 30, recuo: 3.33 },
  ]);
  assert.ok(g.every((f) => f.recuo >= 0));
});

test("geometria com topo zero: tudo no piso, sem NaN", () => {
  const g = geometriaDoFunil([0, 0, 0, 0], FUNIL_COMPUTADOR);
  assert.deepEqual(g.map((f) => f.largura), [30, 30, 30, 30]);
  assert.ok(g.every((f) => Number.isFinite(f.recuo)));
});

test("clip-path do degrau", () => {
  assert.equal(clipDoDegrau(2.34), "polygon(0 0, 100% 0, 97.66% 100%, 2.34% 100%)");
  assert.equal(clipDoDegrau(0), "polygon(0 0, 100% 0, 100% 100%, 0% 100%)");
});

test("por onde: ig e fb do Meta viram Instagram e Facebook; o resto, e o sem origem, em Outros", () => {
  const cartoes = porOnde([
    { origem: "ig", cadastros: 356, vendido: 12420 },
    { origem: "FB", cadastros: 238, vendido: 8970 },
    { origem: "an", cadastros: 10, vendido: 300 },
    { origem: null, cadastros: 8, vendido: 70 },
    { origem: "instagram", cadastros: 1, vendido: 0 },
  ]);
  assert.deepEqual(cartoes, [
    { nome: "Instagram", cadastros: 357, vendido: 12420 },
    { nome: "Facebook", cadastros: 238, vendido: 8970 },
    { nome: "Outros", cadastros: 18, vendido: 370 },
  ]);
  assert.deepEqual(porOnde([{ origem: "ig", cadastros: 2, vendido: 0 }]), [
    { nome: "Instagram", cadastros: 2, vendido: 0 },
  ]);
  assert.deepEqual(porOnde([]), []);
});

test("gráfico por dia: rótulos dd/mm nas pontas e terços, teto redondo, resumo para o leitor de tela", () => {
  const porDia = Array.from({ length: 30 }, (_, i) => ({
    dia: `2026-09-${String(i + 1).padStart(2, "0")}`,
    cadastros: i === 20 ? 28 : 10,
    entraram: 1,
  }));
  const g = graficoPorDia(porDia);
  assert.equal(g.teto, 50);
  assert.deepEqual(
    g.dias.filter((d) => d.mostraRotulo).map((d) => d.rotulo),
    ["01/09", "11/09", "20/09", "30/09"],
  );
  assert.equal(g.dias[0].dica, "01/09: 10 cadastros, 1 entrou");
  assert.equal(
    g.resumo,
    "Cadastros e entradas por dia, de 01/09 a 30/09: 318 cadastros e 30 entradas; pico de 28 em 21/09.",
  );
});

test("gráfico sem movimento: resumo sem pico, teto mínimo; período de um dia tem um rótulo", () => {
  const g = graficoPorDia([{ dia: "2026-10-10", cadastros: 0, entraram: 0 }]);
  assert.equal(g.teto, 5);
  assert.equal(g.resumo, "Cadastros e entradas por dia, de 10/10 a 10/10: 0 cadastros e 0 entradas.");
  assert.deepEqual(g.dias.map((d) => d.mostraRotulo), [true]);
  assert.equal(graficoPorDia([]).resumo, "Sem dias no período.");
});

test("marcas de gasto: traço no começo do dia; fora do período some; mesmo dia junta", () => {
  const porDia = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"].map((dia) => ({
    dia,
    cadastros: 1,
    entraram: 1,
  }));
  assert.deepEqual(
    marcasDeGasto(porDia, [
      { dia: "2026-09-22", campanha: "Remarketing" },
      { dia: "2026-09-21", campanha: "Brasil" },
      { dia: "2026-09-22", campanha: "Goiânia" },
      { dia: "2026-09-22", campanha: "Goiânia" },
      { dia: "2026-08-01", campanha: "Antiga" },
    ]),
    [
      { chave: "2026-09-21", posicao: 0.25, texto: "21/09 · Brasil entrou no ar" },
      { chave: "2026-09-22", posicao: 0.5, texto: "22/09 · Remarketing, Goiânia entraram no ar" },
    ],
  );
  assert.deepEqual(marcasDeGasto(porDia, []), []);
});

test("aviso de período recente: até 90 dias depois do fim do período", () => {
  assert.match(avisoDePeriodoRecente("2026-10-10", "2026-10-10") ?? "", /ainda está comprando/);
  assert.match(avisoDePeriodoRecente("2026-07-13", "2026-10-10") ?? "", /ainda está comprando/);
  assert.equal(avisoDePeriodoRecente("2026-07-12", "2026-10-10"), null);
});

test("guarda da resposta: aceita o formato da rota, recusa erro e lixo", () => {
  const relatorio = {
    periodo: { de: "2026-09-11", ate: "2026-10-10" },
    total: TOTAL,
    linhas: [],
    por_origem: [],
    por_dia: [],
    fora: { entradas_sem_cadastro: 0, pedidos_sem_origem: 0, vendido_sem_origem: 0 },
  };
  assert.equal(ehRespostaAnuncios({ relatorio, tem_cadastro: true }), true);
  assert.equal(ehRespostaAnuncios({ error: "Não deu para montar o funil dos anúncios." }), false);
  assert.equal(ehRespostaAnuncios({ relatorio: { total: {} }, tem_cadastro: true }), false);
  assert.equal(ehRespostaAnuncios(null), false);
});
