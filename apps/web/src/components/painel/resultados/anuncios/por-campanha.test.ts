import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { arvoreDasLinhas } from "@/lib/resultados/anuncios-linhas";
import type { PessoasDaGaveta } from "@/lib/resultados/pessoas-do-anuncio";
import type { LinhaRelatorio, RelatorioParaTela } from "@/lib/resultados/relatorio-anuncios";
import { AbaAnuncios } from "./aba-anuncios";
import { CartoesDeCampanha } from "./cartoes-de-campanha";
import { ConteudoDaGaveta } from "./gaveta-do-anuncio";
import { TabelaDeAnuncios } from "./tabela-de-anuncios";

const noop = () => {};
/** Espaço sem quebra do Intl ("R$ 1.620") vira espaço comum para o teste ler. */
const html = (el: ReactElement) => renderToStaticMarkup(el).replace(/\u00a0/g, " ");

function linha(
  nivel: LinhaRelatorio["nivel"],
  campanha: string | null,
  conjunto: string | null,
  anuncio: string | null,
  [cadastros, foram, entraram, compradores]: [number, number, number, number],
  vendido: number,
  gasto: number | null = null,
  pedidos = compradores,
): LinhaRelatorio {
  return { nivel, campanha, conjunto, anuncio, cadastros, foram, entraram, ja_membros: 0, compradores, pedidos, vendido, gasto };
}

const G = "VIP Atacado — Goiânia";
const B = "VIP Atacado — Brasil";
const S1 = "Lojistas de moda infantil · Goiânia 40 km";
const S2 = "Interesse: moda infantil atacado";
const S3 = "Brasil · lojistas 25–50";

/** O exemplo do mockup (Main.dc.html). */
const LINHAS: LinhaRelatorio[] = [
  linha("campanha", B, null, null, [196, 182, 158, 12], 5740, 980),
  linha("conjunto", B, S3, null, [196, 182, 158, 12], 5740),
  linha("anuncio", B, S3, "Kit 10 peças — carrossel", [76, 69, 59, 3], 1330),
  linha("anuncio", B, S3, "Verão Kids — vídeo 15s", [120, 113, 99, 9], 4410),
  linha("campanha", G, null, null, [371, 348, 304, 31], 14980, 1620, 39),
  linha("conjunto", G, S2, null, [143, 134, 115, 9], 4140),
  linha("anuncio", G, S2, "Preço de atacado — estático", [47, 44, 38, 2], 830),
  linha("anuncio", G, S2, "Provador ao vivo — reels", [96, 90, 77, 7], 3310),
  linha("conjunto", G, S1, null, [228, 214, 189, 22], 10840),
  linha("anuncio", G, S1, "Kit 10 peças — carrossel", [87, 81, 71, 6], 2920),
  linha("anuncio", G, S1, "Verão Kids — vídeo 15s", [141, 133, 118, 16], 7920, null, 21),
  linha("campanha", null, null, null, [14, 14, 14, 0], 0),
  linha("conjunto", null, null, null, [14, 14, 14, 0], 0),
  linha("anuncio", null, null, null, [14, 14, 14, 0], 0),
];
const TOTAL = {
  cadastros: 581,
  foram: 544,
  entraram: 476,
  ja_membros: 20,
  compradores: 43,
  pedidos: 54,
  vendido: 20720,
  gasto: 2600,
};

test("tabela fechada: só campanhas, cada uma com o botão de abrir; total no pé com o próprio mini-funil", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  const h = html(createElement(TabelaDeAnuncios, { arvore, total: TOTAL, onVerQuem: noop }));
  assert.match(h, /<table aria-label="Resultado por campanha, conjunto e anúncio"/);
  assert.match(h, /aria-expanded="false" aria-label="Abrir VIP Atacado — Goiânia"/);
  assert.match(h, /aria-expanded="false" aria-label="Abrir \(sem UTM\)"/);
  assert.doesNotMatch(h, /Verão Kids|Ver quem/);
  assert.match(h, />Total dos anúncios</);
  assert.match(h, /title="581 cadastros"/);
  assert.match(h, /Funil: 581 cadastros, 544 foram pro grupo, 476 entraram, 43 compraram\./);
  assert.match(h, />7,4%</);
  assert.match(h, />R\$ 2\.600</);
  assert.match(h, />8,0×</);
});

test("tabela aberta: conjunto e anúncio com o próprio mini-funil, 'Ver quem' só no anúncio, gasto e retorno só na campanha", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  const h = html(
    createElement(TabelaDeAnuncios, {
      arvore,
      total: TOTAL,
      onVerQuem: noop,
      abertosDeInicio: [arvore[0].chave, arvore[0].filhos[0].chave],
    }),
  );
  assert.match(h, /aria-expanded="true" aria-label="Fechar VIP Atacado — Goiânia"/);
  assert.match(h, /aria-label="Ver quem veio por Verão Kids — vídeo 15s"/);
  assert.doesNotMatch(h, /Ver quem veio por Lojistas/);
  assert.match(h, /title="141 cadastros"/);
  assert.match(h, /clip-path:polygon\(0 0%, 100% 2\.2%, 100% 97\.8%, 0 100%\)/);
  assert.match(h, /Funil: 141 cadastros, 133 foram pro grupo, 118 entraram, 16 compraram\./);
  assert.match(h, />R\$ 1\.620</);
  assert.match(h, />9,2×</);
  const conjunto = h.match(/Lojistas de moda infantil · Goiânia 40 km[\s\S]*?<\/tr>/)?.[0] ?? "";
  assert.equal((conjunto.match(/>—</g) ?? []).length, 2, "gasto e retorno do conjunto");
  assert.match(conjunto, />R\$ 10\.840</);
});

test("operador (gasto escondido): nenhum gasto nem retorno na tabela e nos cartões", () => {
  const arvore = arvoreDasLinhas(LINHAS.map((l) => ({ ...l, gasto: null })));
  const tabela = html(createElement(TabelaDeAnuncios, { arvore, total: { ...TOTAL, gasto: null }, onVerQuem: noop }));
  assert.doesNotMatch(tabela, /R\$ 1\.620|R\$ 980|R\$ 2\.600|×/);
  const cartoes = html(createElement(CartoesDeCampanha, { arvore, onVerQuem: noop }));
  assert.match(cartoes, /gasto —/);
  assert.doesNotMatch(cartoes, /×|R\$ 52,26/);
});

test("cartões B: funil em pé com bico em R$, retorno, taxa e custo por comprador, e o botão de ver conjuntos", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  const h = html(createElement(CartoesDeCampanha, { arvore, onVerQuem: noop }));
  assert.match(h, /<h2 id="cartoes-titulo"[^>]*>Por campanha<\/h2>/);
  assert.match(h, /<article aria-label="VIP Atacado — Goiânia"/);
  assert.match(h, />gasto R\$ 1\.620</);
  assert.match(h, /<ol aria-label="Funil de VIP Atacado — Goiânia"/);
  assert.match(h, /width:89\.16%;clip-path:polygon\(0 0, 100% 0, 75\.24% 100%, 24\.76% 100%\)/);
  assert.match(h, />R\$ 14\.980</);
  assert.match(h, /Retorno<\/dt><dd[^>]*>9,2×</);
  assert.match(h, /Compram<\/dt><dd[^>]*>8,4%</);
  assert.match(h, /Por comprador<\/dt><dd[^>]*>R\$ 52,26</);
  assert.match(h, /aria-expanded="false"[^>]*>Ver 2 conjuntos e 4 anúncios</);
  assert.match(h, /Chegaram sem os parâmetros do anúncio no link\./);
  assert.doesNotMatch(h, /Ver quem/);
});

test("cartão aberto: conjuntos e anúncios com resumo e 'Ver quem'", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  const h = html(createElement(CartoesDeCampanha, { arvore, onVerQuem: noop, abertosDeInicio: [arvore[0].chave] }));
  assert.match(h, /aria-expanded="true"[^>]*>Fechar conjuntos</);
  assert.match(h, /<ul aria-label="Conjuntos de VIP Atacado — Goiânia"/);
  assert.match(h, />141 cadastros · 16 compraram · R\$ 7\.920</);
  assert.match(h, /aria-label="Ver quem veio por Verão Kids — vídeo 15s"/);
});

const PERIODO = { de: "2026-09-11", ate: "2026-10-10" };
const A1 = LINHAS[10];

const PESSOAS: PessoasDaGaveta = {
  por_origem: [
    { origem: "ig", cadastros: 90, vendido: 5000 },
    { origem: "fb", cadastros: 51, vendido: 2920 },
  ],
  compradores: [
    {
      nome: "Bia Kids Modas",
      telefone: "(62) 9••••-4821",
      grupo: "Moda Kids VIP 3",
      cadastro_em: "2026-09-14T15:00:00+00:00",
      primeira_compra: "2026-09-16T15:00:00+00:00",
      pedidos: 2,
      vendido: 1480,
      em_contatos: true,
    },
    {
      nome: null,
      telefone: "(62) 9••••-1107",
      grupo: null,
      cadastro_em: "2026-09-15T15:00:00+00:00",
      primeira_compra: "2026-09-15T18:00:00+00:00",
      pedidos: 1,
      vendido: 960,
      em_contatos: false,
    },
  ],
  contatos_dos_compradores: 1,
  sem_compra: 102,
};

function gaveta(over: Partial<Parameters<typeof ConteudoDaGaveta>[0]> = {}): string {
  return html(
    createElement(ConteudoDaGaveta, {
      linha: A1,
      periodo: PERIODO,
      carga: "ok",
      pessoas: PESSOAS,
      aoTentarDeNovo: noop,
      ...over,
    }),
  );
}

test("gaveta carregando: o funil da linha aparece na hora, as pessoas em esqueleto anunciado", () => {
  const h = gaveta({ carga: "carregando", pessoas: null });
  assert.match(h, />VIP Atacado — Goiânia › Lojistas de moda infantil · Goiânia 40 km</);
  assert.match(h, /<ol aria-label="Funil do anúncio"/);
  assert.match(h, />141<\/span><span[^>]*>cadastros</);
  assert.match(h, />94%</);
  assert.match(h, />21 pedidos</);
  assert.match(h, />R\$ 7\.920</);
  assert.match(h, /role="status" aria-label="Carregando quem veio por este anúncio"/);
  assert.doesNotMatch(h, /Quem comprou/);
});

test("gaveta com erro: alerta com Tentar de novo, nenhuma pessoa", () => {
  const h = gaveta({ carga: "erro", pessoas: null });
  assert.match(h, /role="alert"/);
  assert.match(h, /Não deu para carregar quem veio por este anúncio\./);
  assert.match(h, />Tentar de novo</);
  assert.doesNotMatch(h, /Quem comprou|Entraram e ainda não compraram/);
});

test("gaveta carregada: por onde, quem comprou com telefone mascarado e datas, links pro Contatos filtrado", () => {
  const h = gaveta();
  assert.match(h, />Por onde a pessoa viu</);
  assert.match(h, /style="width:63\.83%"/);
  assert.match(h, />Instagram 64%</);
  assert.match(h, /<h3 id="quem-comprou-titulo"[^>]*>Quem comprou<\/h3>/);
  assert.match(h, />2 pessoas</);
  assert.match(h, />Bia Kids Modas</);
  assert.match(h, />\(62\) 9••••-4821 · Moda Kids VIP 3</);
  assert.match(h, />cadastro 14\/09 · 1ª compra 16\/09 · 2 pedidos</);
  assert.match(h, />R\$ 1\.480</);
  assert.match(h, />\(62\) 9••••-1107</);
  assert.match(h, />não está em Contatos</);
  assert.match(
    h,
    /href="\/painel\/contatos\?de=2026-09-11&amp;ate=2026-10-10&amp;campanha=VIP\+Atacado\+%E2%80%94\+Goi%C3%A2nia&amp;conjunto=[^"]*&amp;anuncio=[^"]*&amp;lista=compraram"[^>]*>Ver a pessoa em Contatos</,
  );
  assert.match(h, /1 pessoa comprou sem estar em Contatos/);
  assert.match(h, /<h3 id="sem-compra-titulo"[^>]*>Entraram e ainda não compraram<\/h3>/);
  assert.match(h, />102</);
  assert.match(h, /lista=sem-compra"[^>]*>Ver em Contatos</);
});

test("gaveta sem comprador nem entrada: frases no lugar das listas, nenhum link pro Contatos", () => {
  const vazio = { ...A1, entraram: 0, compradores: 0, pedidos: 0, vendido: 0 };
  const h = gaveta({ linha: vazio, pessoas: { por_origem: [], compradores: [], contatos_dos_compradores: 0, sem_compra: 0 } });
  assert.match(h, /Ninguém comprou por este anúncio ainda\./);
  assert.match(h, /Ninguém entrou no grupo por este anúncio ainda\./);
  assert.doesNotMatch(h, /painel\/contatos|Por onde a pessoa viu/);
});

test("a aba encaixa a tabela e os cartões entre o gráfico por dia e 'fora dos anúncios'; sem linhas, nada", () => {
  const relatorio: RelatorioParaTela = {
    periodo: PERIODO,
    total: TOTAL,
    linhas: LINHAS,
    por_origem: [],
    por_dia: [{ dia: "2026-10-10", cadastros: 1, entraram: 1 }],
    fora: { entradas_sem_cadastro: 0, pedidos_sem_origem: 0, vendido_sem_origem: 0 },
  };
  const props = {
    atalho: "30d" as const,
    onAtalho: noop,
    carga: "ok" as const,
    hoje: "2026-10-10",
    aoTentarDeNovo: noop,
  };
  const h = html(createElement(AbaAnuncios, { ...props, resposta: { relatorio, tem_cadastro: true } }));
  const dia = h.indexOf("Cadastros e entradas por dia");
  const tabela = h.indexOf("Por campanha, conjunto e anúncio");
  const cartoes = h.indexOf('id="cartoes-titulo"');
  const fora = h.indexOf("No mesmo período, fora dos anúncios");
  assert.ok(dia > -1 && dia < tabela && tabela < cartoes && cartoes < fora, `${dia} ${tabela} ${cartoes} ${fora}`);
  assert.match(h, /<section aria-labelledby="tabela-titulo" class="hidden [^"]*md:block/);
  assert.match(h, /<div class="md:hidden"><section aria-labelledby="cartoes-titulo"/);

  const semLinhas = html(
    createElement(AbaAnuncios, { ...props, resposta: { relatorio: { ...relatorio, linhas: [] }, tem_cadastro: true } }),
  );
  assert.doesNotMatch(semLinhas, /Por campanha/);
});
