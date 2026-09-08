import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cenaDoRanking,
  comMetaRecalculada,
  linkDaIndicadora,
  metaValida,
  ordenarRanking,
  quadrosDaIndicacao,
  podeCriarIndicadora,
  progressoDaIndicadora,
  resumoDoPrograma,
  textoDeCliques,
  totaisDaIndicacao,
  type IndicadoraNaFicha,
} from "./indicacao";

function ficha(over: Partial<IndicadoraNaFicha> = {}): IndicadoraNaFicha {
  return {
    id: "r1",
    referrerName: "Ana",
    group: "Ofertas 01",
    path: "/r/ind-ana",
    cliques: 2,
    atingiu: false,
    ...over,
  };
}

test("carregando ganha de vazio; erro é cena própria", () => {
  assert.equal(cenaDoRanking({ carga: "carregando", total: 0 }), "carregando");
  assert.equal(cenaDoRanking({ carga: "carregando", total: 4 }), "carregando");
  assert.equal(cenaDoRanking({ carga: "erro", total: 0 }), "erro");
  assert.equal(cenaDoRanking({ carga: "ok", total: 0 }), "vazio");
  assert.equal(cenaDoRanking({ carga: "ok", total: 1 }), "lista");
});

test("resumo do programa concorda no singular e tolera recompensa vazia", () => {
  assert.equal(
    resumoDoPrograma({ goal: 3, reward: "Frete grátis no próximo pedido" }),
    "Quem trouxer 3 cliques ganha Frete grátis no próximo pedido",
  );
  assert.equal(
    resumoDoPrograma({ goal: 1, reward: "10% off" }),
    "Quem trouxer 1 clique ganha 10% off",
  );
  // Mutante: interpolar a recompensa crua deixa a frase pendurada em "ganha ".
  assert.equal(
    resumoDoPrograma({ goal: 2, reward: "   " }),
    "Quem trouxer 2 cliques ganha a recompensa combinada",
  );
});

test("meta zero ou negativa não faz todo mundo bater a meta", () => {
  // Mutante: usar goal cru. Com goal 0, `cliques >= 0` é sempre verdade e a
  // tela dá o prêmio para quem nunca trouxe ninguém.
  const p = progressoDaIndicadora({ cliques: 0 }, 0);
  assert.equal(p.atingiu, false);
  assert.equal(p.faltam, 1);
});

test("'faltam' nunca fica negativo", () => {
  // Mutante: `meta - cliques` sem piso escreve "faltam -2" para quem passou
  // da meta com o selo dessincronizado.
  const p = progressoDaIndicadora({ cliques: 7 }, 5);
  assert.equal(p.faltam, 0);
  assert.equal(p.atingiu, true);
  assert.equal(p.texto, "Bateu a meta");
});

test("progresso: barra com piso de 2% e teto de 100%", () => {
  assert.equal(progressoDaIndicadora({ cliques: 0 }, 5).proporcao, 0.02);
  assert.equal(progressoDaIndicadora({ cliques: 5 }, 5).proporcao, 1);
  assert.equal(progressoDaIndicadora({ cliques: 50 }, 5).proporcao, 1);
  assert.equal(progressoDaIndicadora({ cliques: 1 }, 4).proporcao, 0.25);
});

test("quem não bateu mostra quantos faltam", () => {
  assert.equal(progressoDaIndicadora({ cliques: 1 }, 3).texto, "faltam 2");
});

test("cliques em pt-BR, singular só no 1", () => {
  assert.equal(textoDeCliques(0), "0 cliques");
  assert.equal(textoDeCliques(1), "1 clique");
  assert.equal(textoDeCliques(2048), "2.048 cliques");
});

test("totais somam o que a lista tem", () => {
  const lista = [
    ficha({ id: "a", cliques: 5, atingiu: true }),
    ficha({ id: "b", cliques: 2, atingiu: false }),
    ficha({ id: "c", cliques: 3, atingiu: true }),
  ];
  assert.deepEqual(totaisDaIndicacao(lista), { pessoas: 3, cliques: 10, bateram: 2 });
  assert.deepEqual(totaisDaIndicacao([]), { pessoas: 0, cliques: 0, bateram: 0 });
});

test("baixar a meta promove quem já tinha os cliques", () => {
  // Mutante: não recalcular deixa a regra nova na tela com o veredito velho —
  // a lojista muda a meta de 5 para 2 e ninguém com 3 cliques "bate".
  const lista = [
    { cliques: 3, atingiu: false },
    { cliques: 1, atingiu: false },
  ];
  assert.deepEqual(comMetaRecalculada(lista, 2), [
    { cliques: 3, atingiu: true },
    { cliques: 1, atingiu: false },
  ]);
  // E subir a meta rebaixa de volta.
  assert.deepEqual(comMetaRecalculada([{ cliques: 3, atingiu: true }], 10), [
    { cliques: 3, atingiu: false },
  ]);
  // Não muta o original.
  assert.equal(lista[0].atingiu, false);
});

test("ranking ordena por cliques, empate pelo nome, sem mutar", () => {
  const lista = [
    ficha({ id: "z", referrerName: "Zeca", cliques: 4 }),
    ficha({ id: "a", referrerName: "Ana", cliques: 9 }),
    ficha({ id: "b", referrerName: "Bia", cliques: 4 }),
  ];
  assert.deepEqual(
    ordenarRanking(lista).map((r) => r.id),
    ["a", "b", "z"],
  );
  assert.deepEqual(
    lista.map((r) => r.id),
    ["z", "a", "b"],
  );
});

test("link só existe com origin E caminho vindos da API", () => {
  assert.equal(linkDaIndicadora("https://app.girumo.com.br", "/r/ind-ana"), "https://app.girumo.com.br/r/ind-ana");
  // Mutante: montar sem o origin gera "/r/x", que colado no WhatsApp não abre.
  assert.equal(linkDaIndicadora("", "/r/ind-ana"), null);
  assert.equal(linkDaIndicadora("https://app.girumo.com.br", ""), null);
});

test("meta digitada é validada antes de virar número", () => {
  // Mutante: usar `Number(goal)` cru. `Number("")` é 0, e meta 0 dá o prêmio
  // a todo mundo na hora.
  assert.equal(metaValida(""), null);
  assert.equal(metaValida("0"), null);
  assert.equal(metaValida("-3"), null);
  assert.equal(metaValida("1001"), null);
  assert.equal(metaValida("abc"), null);
  assert.equal(metaValida("3"), 3);
  assert.equal(metaValida("1000"), 1000);
  // Vírgula e decimal chegam de teclado numérico; o inteiro é o que vale.
  assert.equal(metaValida("3,7"), 3);
});

test("criar indicadora exige os três campos com conteúdo", () => {
  // Mutante: aceitar espaço em branco cria indicadora sem nome, e a ficha
  // fica com as iniciais vazias.
  assert.equal(podeCriarIndicadora({ nome: "Ana", grupo: "G1", inviteUrl: "https://x" }), true);
  assert.equal(podeCriarIndicadora({ nome: "  ", grupo: "G1", inviteUrl: "https://x" }), false);
  assert.equal(podeCriarIndicadora({ nome: "Ana", grupo: "", inviteUrl: "https://x" }), false);
  assert.equal(podeCriarIndicadora({ nome: "Ana", grupo: "G1", inviteUrl: "   " }), false);
});

test("os quadros do topo nao afirmam zero antes da lista chegar", () => {
  // Mutante: ler os totais sem olhar a carga. Visto na captura de tela: com a
  // lista ainda em esqueleto, os tres quadros ja mostravam "0", afirmando que
  // a lojista nao tem indicadora nenhuma antes de saber.
  assert.deepEqual(
    quadrosDaIndicacao([], "carregando").map((q) => q.valor),
    [null, null, null],
  );
  assert.deepEqual(
    quadrosDaIndicacao([], "erro").map((q) => q.valor),
    [null, null, null],
  );
  // Com a resposta em mãos, zero é medição de verdade.
  assert.deepEqual(
    quadrosDaIndicacao([], "ok").map((q) => q.valor),
    ["0", "0", "0"],
  );
  assert.deepEqual(
    quadrosDaIndicacao(
      [ficha({ id: "a", cliques: 1200, atingiu: true }), ficha({ id: "b", cliques: 2 })],
      "ok",
    ).map((q) => [q.rotulo, q.valor]),
    [
      ["Indicadoras", "2"],
      ["Cliques", "1.202"],
      ["Bateram a meta", "1"],
    ],
  );
});
