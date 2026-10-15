import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { RelatorioAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { AbaAnuncios, type PropsDaAbaAnuncios } from "./aba-anuncios";

const noop = () => {};

/** O exemplo do mockup (Main.dc.html), com 30 dias de 11/09 a 10/10. */
const RELATORIO: RelatorioAnuncios = {
  periodo: { de: "2026-09-11", ate: "2026-10-10" },
  total: { cadastros: 612, foram: 571, entraram: 498, ja_membros: 34, compradores: 46, pedidos: 58, vendido: 21760, gasto: 2840 },
  linhas: [],
  por_origem: [
    { origem: "ig", cadastros: 356, vendido: 12420 },
    { origem: "fb", cadastros: 238, vendido: 8970 },
    { origem: null, cadastros: 18, vendido: 370 },
  ],
  por_dia: Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 11 + i)).toISOString().slice(0, 10);
    return { dia: d, cadastros: 20, entraram: 16 };
  }),
  fora: { entradas_sem_cadastro: 715, pedidos_sem_origem: 7, vendido_sem_origem: 4120 },
};

/** Espaço sem quebra do Intl ("R$ 21.760") vira espaço comum para o teste ler. */
function html(over: Partial<PropsDaAbaAnuncios> = {}): string {
  const props: PropsDaAbaAnuncios = {
    atalho: "30d",
    onAtalho: noop,
    carga: "ok",
    resposta: { relatorio: RELATORIO, tem_cadastro: true },
    hoje: "2026-10-10",
    aoTentarDeNovo: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(AbaAnuncios, props)).replace(/\u00a0/g, " ");
}

test("carregando: esqueleto anunciado, nenhum número", () => {
  const h = html({ carga: "carregando", resposta: null });
  assert.match(h, /role="status" aria-label="Carregando o funil dos anúncios"/);
  assert.doesNotMatch(h, /Do anúncio à venda|R\$/);
  // Primeira carga: ainda não se sabe se a loja tem cadastro; o seletor sumiria na tela Vazio.
  assert.doesNotMatch(h, /aria-label="Período"/);
});

test("trocar de período: carregando com resposta anterior mantém o seletor", () => {
  const h = html({ carga: "carregando" });
  assert.match(h, /role="group" aria-label="Período"/);
});

test("erro: alerta com Tentar de novo, nunca zero", () => {
  const h = html({ carga: "erro", resposta: null });
  assert.match(h, /role="alert"/);
  assert.match(h, /Não deu para carregar o funil dos anúncios\./);
  assert.match(h, />Tentar de novo</);
  assert.doesNotMatch(h, /R\$ 0/);
});

test("erro ao trocar de período não mostra o relatório anterior", () => {
  const h = html({ carga: "erro" });
  assert.doesNotMatch(h, /Do anúncio à venda/);
});

test("vazio: as duas portas de entrada, sem seletor de período", () => {
  const h = html({ resposta: { relatorio: RELATORIO, tem_cadastro: false } });
  assert.match(h, /Ainda não chegou nenhum cadastro com origem/);
  assert.match(h, /href="\/painel\/configuracoes\?secao=integracoes"[^>]*>[\s\S]*Tenho site próprio/);
  assert.match(h, /href="\/painel\/pages\/nova"[^>]*>[\s\S]*Usar uma página da Girumo/);
  assert.doesNotMatch(h, /aria-label="Período"/);
  assert.doesNotMatch(h, /Do anúncio à venda/);
});

test("relatório: seção Anúncios marcada, aviso, faixa, funil, por onde, fora e regras", () => {
  const h = html();
  assert.match(h, /aria-current="page"[^>]*href="\/painel\/resultados\/anuncios"/);
  assert.match(h, /<a class="[^"]*" href="\/painel\/resultados">Visão geral/);
  assert.match(h, /aria-pressed="true"[^>]*>30 dias</);
  assert.match(h, /ainda está comprando/);
  // Faixa.
  assert.match(h, /Gasto lançado<\/p><p[^>]*>R\$ 2\.840</);
  assert.match(h, /Vendido pra quem veio dos anúncios<\/p><p[^>]*>R\$ 21\.760</);
  assert.match(h, /58 pedidos de 46 pessoas/);
  assert.match(h, /7,7×/);
  // Funil: passagem, custo, geometria em variável CSS, bico e nota.
  assert.match(h, /Do anúncio à venda/);
  assert.match(h, /Quem se cadastrou nos últimos 30 dias, acompanhado até hoje/);
  assert.match(h, /93% dos cadastros/);
  assert.match(h, /R\$ 61,74<\/span> <span[^>]*>por comprador/);
  assert.match(h, /--clip:polygon\(0 0, 100% 0, 97\.66% 100%, 2\.34% 100%\)/);
  assert.match(h, /58 pedidos, 1,3 por comprador/);
  assert.match(h, /\+34 se cadastraram já sendo do grupo/);
  // Gráfico, por onde, fora, regras.
  assert.match(h, /role="img" aria-label="Cadastros e entradas por dia, de 11\/09 a 10\/10: 600 cadastros e 480 entradas/);
  assert.match(h, /Instagram<\/p><p[^>]*>356 <span[^>]*>· R\$ 12\.420/);
  assert.match(h, /Outros<\/p><p[^>]*>18 /);
  assert.match(h, />715</);
  assert.match(h, /R\$ 4\.120 <span[^>]*>· 7 pedidos/);
  assert.match(h, /<summary[^>]*>Como cada número é contado<\/summary>/);
});

test("período com zero cadastros numa loja que já teve: frase no lugar do funil, sem geometria", () => {
  const zerado = {
    ...RELATORIO,
    total: { ...RELATORIO.total, cadastros: 0, foram: 0, entraram: 0, ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0 },
    por_origem: [],
  };
  const h = html({ resposta: { relatorio: zerado, tem_cadastro: true } });
  assert.match(h, /Nenhum cadastro com origem neste período/);
  assert.doesNotMatch(h, /--clip:/);
  assert.doesNotMatch(h, /Por onde chegaram/);
});

test("sem gasto: travessão no gasto e no retorno, nenhum custo inventado", () => {
  const h = html({ resposta: { relatorio: { ...RELATORIO, total: { ...RELATORIO.total, gasto: 0 } }, tem_cadastro: true } });
  assert.match(h, /Gasto lançado<\/p><p[^>]*>—</);
  assert.match(h, /nenhum gasto lançado no período/);
  assert.doesNotMatch(h, /por cadastro|por entrada/);
});

test("gasto escondido (operador, sem ads:manage): travessão em gasto, retorno e custos, e nenhum valor de gasto", () => {
  const h = html({ resposta: { relatorio: { ...RELATORIO, total: { ...RELATORIO.total, gasto: null } }, tem_cadastro: true } });
  assert.match(h, /Gasto lançado<\/p><p[^>]*>—</);
  assert.match(h, /só o dono e a administração veem o gasto/);
  assert.match(h, /Retorno<\/p><p[^>]*>—</);
  assert.doesNotMatch(h, /R\$ 2\.840|7,7×|por cadastro|por entrada/);
});

test("vendido negativo aparece como veio", () => {
  const h = html({ resposta: { relatorio: { ...RELATORIO, total: { ...RELATORIO.total, vendido: -40 } }, tem_cadastro: true } });
  assert.match(h, /-R\$ 40/);
});

test("pontos de encaixe do PR 7: ações no cabeçalho, rodapé do gasto e anotação de início no gráfico", () => {
  const h = html({
    acoesDoCabecalho: createElement("button", { type: "button" }, "Lançar gasto"),
    rodapeDoGasto: createElement("span", null, "3 lançamentos"),
    iniciosDeGasto: [{ dia: "2026-09-21", campanha: "VIP Atacado — Brasil" }],
  });
  assert.match(h, /<button type="button">Lançar gasto<\/button>/);
  assert.match(h, /<span>3 lançamentos<\/span>/);
  assert.doesNotMatch(h, /proporcional aos dias do período/);
  assert.match(h, /21\/09 · VIP Atacado — Brasil entrou no ar/);
});

test("gasto escondido: o rodapé do gasto não aparece mesmo se a página o passar", () => {
  const h = html({
    resposta: { relatorio: { ...RELATORIO, total: { ...RELATORIO.total, gasto: null } }, tem_cadastro: true },
    rodapeDoGasto: createElement("span", null, "3 lançamentos"),
  });
  assert.doesNotMatch(h, /3 lançamentos/);
  assert.match(h, /só o dono e a administração veem o gasto/);
});
