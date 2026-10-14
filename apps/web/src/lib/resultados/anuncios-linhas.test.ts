import assert from "node:assert/strict";
import { test } from "node:test";

import {
  alternado,
  arvoreDasLinhas,
  caminhoDaLinha,
  cartaoDaCampanha,
  chaveDaLinha,
  colunasDaLinha,
  fatiasDeOrigem,
  FUNIL_GAVETA,
  funilEmPe,
  linhaDoComprador,
  linhasVisiveis,
  miniFunilA,
  notaForaDeContatos,
  resumoDaLinha,
  rotuloDaLinha,
  textoDeSemCompra,
  verEmContatos,
} from "./anuncios-linhas";
import type { LinhaRelatorio } from "./relatorio-anuncios";

/** O Intl separa "R$" do número com espaço sem quebra; o teste lê com espaço comum. */
const legivel = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replace(/ /g, " "));

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

/** O exemplo do mockup (Main.dc.html), na ordem alfabética em que o SQL devolve. */
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
const A1 = LINHAS[10];

test("árvore: campanha › conjunto › anúncio, maior vendido primeiro e (sem UTM) por último", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  assert.deepEqual(
    arvore.map((n) => [n.tipo, n.rotulo]),
    [
      ["Campanha", G],
      ["Campanha", B],
      ["Sem parâmetros no link", "(sem UTM)"],
    ],
  );
  assert.deepEqual(arvore[0].filhos.map((s) => s.rotulo), [S1, S2]);
  assert.deepEqual(
    arvore[0].filhos[0].filhos.map((a) => [a.tipo, a.rotulo]),
    [
      ["Anúncio", "Verão Kids — vídeo 15s"],
      ["Anúncio", "Kit 10 peças — carrossel"],
    ],
  );
  assert.deepEqual(arvore[2].filhos.map((s) => s.rotulo), ["(sem conjunto)"]);
  assert.deepEqual(arvore[2].filhos[0].filhos.map((a) => a.rotulo), ["(sem anúncio)"]);
  // O mesmo nome de anúncio em duas campanhas não se mistura.
  assert.equal(arvore[1].filhos[0].filhos.find((a) => a.rotulo === "Verão Kids — vídeo 15s")?.linha.cadastros, 120);
});

test("campanha só com gasto (nenhum cadastro) entra sem filhos, antes do (sem UTM)", () => {
  const c9 = linha("campanha", "C9", null, null, [0, 0, 0, 0], 0, 90);
  const arvore = arvoreDasLinhas([...LINHAS, c9]);
  assert.deepEqual(arvore.map((n) => n.rotulo), [G, B, "C9", "(sem UTM)"]);
  assert.deepEqual(arvore[2].filhos, []);
});

test("linhas visíveis: fechado mostra só campanhas; aberto desce um nível por vez", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  assert.deepEqual(
    linhasVisiveis(arvore, new Set()).map((l) => [l.profundidade, l.no.rotulo, l.aberto]),
    [
      [0, G, false],
      [0, B, false],
      [0, "(sem UTM)", false],
    ],
  );
  const abertos = new Set([arvore[0].chave, arvore[0].filhos[0].chave]);
  assert.deepEqual(
    linhasVisiveis(arvore, abertos).map((l) => [l.profundidade, l.no.rotulo]),
    [
      [0, G],
      [1, S1],
      [2, "Verão Kids — vídeo 15s"],
      [2, "Kit 10 peças — carrossel"],
      [1, S2],
      [0, B],
      [0, "(sem UTM)"],
    ],
  );
  // Conjunto aberto dentro de campanha fechada não aparece.
  assert.equal(linhasVisiveis(arvore, new Set([arvore[0].filhos[0].chave])).length, 3);
});

test("alternado: adiciona quando ausente, remove quando presente, nunca muda o conjunto de entrada", () => {
  const entrada: ReadonlySet<string> = new Set(["a"]);
  const com = alternado(entrada, "b");
  assert.deepEqual([...com].sort(), ["a", "b"]);
  const sem = alternado(com, "a");
  assert.deepEqual([...sem], ["b"]);
  assert.deepEqual([...entrada], ["a"]);
  assert.deepEqual([...com].sort(), ["a", "b"]);
  assert.notEqual(com, entrada);
});

test("colunas: gasto e retorno só na campanha; sem gasto, escondido ou zero, travessão", () => {
  const [goiania] = arvoreDasLinhas(LINHAS);
  assert.deepEqual(legivel(colunasDaLinha(goiania.linha)), {
    gasto: "R$ 1.620",
    cadastros: "371",
    compraram: "31",
    vendido: "R$ 14.980",
    retorno: "9,2×",
  });
  const conjunto = colunasDaLinha(goiania.filhos[0].linha);
  assert.deepEqual([conjunto.gasto, conjunto.retorno], ["—", "—"]);
  for (const gasto of [null, 0]) {
    const c = colunasDaLinha({ ...goiania.linha, gasto });
    assert.deepEqual([c.gasto, c.retorno], ["—", "—"], String(gasto));
  }
  // Campanha só com gasto: o retorno zero é verdade, não travessão.
  const c9 = colunasDaLinha(linha("campanha", "C9", null, null, [0, 0, 0, 0], 0, 90));
  assert.deepEqual(legivel([c9.gasto, c9.cadastros, c9.retorno]), ["R$ 90", "0", "0,0×"]);
});

test("mini-funil A: altura pelos cadastros da própria linha, número de cada degrau no título e no leitor", () => {
  const m = miniFunilA(A1);
  assert.deepEqual(m.segmentos, [
    { clip: "polygon(0 0%, 100% 2.2%, 100% 97.8%, 0 100%)", titulo: "141 cadastros" },
    { clip: "polygon(0 2.2%, 100% 6.4%, 100% 93.6%, 0 97.8%)", titulo: "133 foram pro grupo" },
    { clip: "polygon(0 6.4%, 100% 34.6%, 100% 65.4%, 0 93.6%)", titulo: "118 entraram" },
    { clip: "polygon(0 34.6%, 100% 42%, 100% 58%, 0 65.4%)", titulo: "16 compraram" },
  ]);
  assert.equal(m.taxa, "11%");
  assert.equal(m.leitor, "Funil: 141 cadastros, 133 foram pro grupo, 118 entraram, 16 compraram.");
});

test("mini-funil A sem cadastro (campanha só com gasto): tudo no piso, taxa em travessão, sem NaN", () => {
  const m = miniFunilA(linha("campanha", "C9", null, null, [0, 0, 0, 0], 0, 90));
  const piso = "polygon(0 39%, 100% 39%, 100% 61%, 0 61%)";
  assert.deepEqual(m.segmentos.map((s) => s.clip), [piso, piso, piso, "polygon(0 39%, 100% 42%, 100% 58%, 0 61%)"]);
  assert.equal(m.taxa, "—");
  assert.doesNotMatch(JSON.stringify(m), /NaN/);
});

test("mini-funil A nunca alarga: entraram acima de foram satura na altura de cima", () => {
  const m = miniFunilA(linha("anuncio", "C", "S", "A", [10, 4, 6, 0], 0));
  assert.deepEqual(m.segmentos.map((s) => s.clip), [
    "polygon(0 0%, 100% 23.4%, 100% 76.6%, 0 100%)",
    "polygon(0 23.4%, 100% 23.4%, 100% 76.6%, 0 76.6%)",
    "polygon(0 23.4%, 100% 39%, 100% 61%, 0 76.6%)",
    "polygon(0 39%, 100% 42%, 100% 58%, 0 61%)",
  ]);
  assert.equal(m.taxa, "0%");
});

test("funil em pé da gaveta: 36% + 64%, bico de 34%, passagem só com a taxa", () => {
  const f = funilEmPe(A1, FUNIL_GAVETA);
  assert.deepEqual(
    f.degraus.map((d) => [d.valor, d.rotulo, d.passagem, d.largura, d.clip]),
    [
      [141, "cadastros", "", 100, "polygon(0 0, 100% 0, 98.18% 100%, 1.82% 100%)"],
      [133, "foram pro grupo", "94%", 96.37, "polygon(0 0, 100% 0, 96.47% 100%, 3.53% 100%)"],
      [118, "entraram", "89%", 89.56, "polygon(0 0, 100% 0, 74.15% 100%, 25.85% 100%)"],
      [16, "compraram", "14%", 43.26, "polygon(0 0, 100% 0, 89.3% 100%, 10.7% 100%)"],
    ],
  );
  assert.deepEqual(legivel(f.bico), { largura: 34, valor: "R$ 7.920", pedidos: "21 pedidos" });
});

test("cartão B: funil 40% + 60%, retorno, taxa e custo por comprador; 'Ver N conjuntos e M anúncios'", () => {
  const [goiania, brasil, semUtm] = arvoreDasLinhas(LINHAS);
  const c = cartaoDaCampanha(goiania);
  assert.deepEqual(
    legivel({
      rotulo: c.rotulo,
      aviso: c.aviso,
      gasto: c.gasto,
      retorno: c.retorno,
      compram: c.compram,
      porComprador: c.porComprador,
      mais: c.mais,
    }),
    {
      rotulo: G,
      aviso: null,
      gasto: "R$ 1.620",
      retorno: "9,2×",
      compram: "8,4%",
      porComprador: "R$ 52,26",
      mais: "Ver 2 conjuntos e 4 anúncios",
    },
  );
  assert.deepEqual(c.funil.degraus.map((d) => d.largura), [100, 96.28, 89.16, 45.01]);
  assert.equal(c.funil.degraus[2].clip, "polygon(0 0, 100% 0, 75.24% 100%, 24.76% 100%)");
  assert.equal(c.funil.bico.largura, 36);
  assert.equal(cartaoDaCampanha(brasil).mais, "Ver 1 conjunto e 2 anúncios");

  const s = cartaoDaCampanha(semUtm);
  assert.deepEqual(
    [s.aviso, s.gasto, s.retorno, s.compram, s.porComprador, s.mais],
    ["Chegaram sem os parâmetros do anúncio no link.", "—", "—", "0%", "—", "Ver 1 conjunto e 1 anúncio"],
  );
});

test("cartão sem ads:manage (gasto null): gasto, retorno e custo em travessão", () => {
  const [goiania] = arvoreDasLinhas(LINHAS.map((l) => ({ ...l, gasto: null })));
  const c = cartaoDaCampanha(goiania);
  assert.deepEqual([c.gasto, c.retorno, c.porComprador], ["—", "—", "—"]);
});

test("rótulos, caminho e chave da linha", () => {
  const vazia = { nivel: "anuncio", campanha: null, conjunto: null, anuncio: null } as const;
  assert.equal(rotuloDaLinha(vazia), "(sem anúncio)");
  assert.equal(rotuloDaLinha({ ...vazia, nivel: "conjunto" }), "(sem conjunto)");
  assert.equal(rotuloDaLinha({ ...vazia, nivel: "campanha" }), "(sem UTM)");
  assert.equal(caminhoDaLinha(vazia), "(sem UTM) › (sem conjunto)");
  assert.equal(caminhoDaLinha(A1), `${G} › ${S1}`);
  assert.deepEqual(chaveDaLinha(A1), { campanha: G, conjunto: S1, anuncio: "Verão Kids — vídeo 15s" });
});

test("resumo da linha no cartão aberto", () => {
  assert.equal(legivel(resumoDaLinha(A1)), "141 cadastros · 16 compraram · R$ 7.920");
  assert.equal(legivel(resumoDaLinha(linha("anuncio", "C", "S", "A", [1, 1, 1, 1], 50))), "1 cadastro · 1 comprou · R$ 50");
});

test("por onde a pessoa viu: fatias em % dos cadastros, ig e fb agrupados como na aba", () => {
  assert.deepEqual(
    fatiasDeOrigem([
      { origem: "ig", cadastros: 90, vendido: 5000 },
      { origem: "fb", cadastros: 51, vendido: 2920 },
    ]),
    [
      { nome: "Instagram", largura: 63.83, texto: "Instagram 64%" },
      { nome: "Facebook", largura: 36.17, texto: "Facebook 36%" },
    ],
  );
  assert.deepEqual(fatiasDeOrigem([]), []);
});

test("comprador: nome do WhatsApp quando há; sem nome, o telefone mascarado vira o título", () => {
  const base = {
    nome: "Bia Kids Modas",
    telefone: "(62) 9••••-4821",
    grupo: "Moda Kids VIP 3",
    cadastro_em: "2026-09-14T15:00:00+00:00",
    primeira_compra: "2026-09-16T15:00:00+00:00",
    pedidos: 2,
    vendido: 1480,
    em_contatos: true,
  };
  assert.deepEqual(legivel(linhaDoComprador(base)), {
    titulo: "Bia Kids Modas",
    detalhe: "(62) 9••••-4821 · Moda Kids VIP 3",
    total: "R$ 1.480",
    quando: "cadastro 14/09 · 1ª compra 16/09 · 2 pedidos",
  });
  assert.deepEqual(
    legivel(linhaDoComprador({ ...base, nome: "  ", grupo: null, pedidos: 1, em_contatos: false })),
    {
      titulo: "(62) 9••••-4821",
      detalhe: "não está em Contatos",
      total: "R$ 1.480",
      quando: "cadastro 14/09 · 1ª compra 16/09",
    },
  );
});

test("textos da gaveta", () => {
  assert.equal(verEmContatos(16), "Ver os 16 em Contatos");
  assert.equal(verEmContatos(1), "Ver a pessoa em Contatos");
  assert.equal(notaForaDeContatos(0), null);
  assert.equal(notaForaDeContatos(1), "1 pessoa comprou sem estar em Contatos: o telefone veio só no pedido.");
  assert.equal(notaForaDeContatos(3), "3 pessoas compraram sem estar em Contatos: o telefone veio só no pedido.");
  assert.equal(textoDeSemCompra(102, 118), "Entraram pelo anúncio. Uma oferta postada no grupo alcança quem continua lá.");
  assert.equal(textoDeSemCompra(0, 0), "Ninguém entrou no grupo por este anúncio ainda.");
  assert.equal(textoDeSemCompra(0, 5), "Quem entrou por este anúncio já comprou.");
});
