import assert from "node:assert/strict";
import { test } from "node:test";

import { lerFormatoPostsHoje, linhaDosPostsHoje, type PostsHoje } from "./posts-hoje";

const dados = (grupos: Record<string, number>): PostsHoje => ({ teto: 4, grupos });

test("sem grupos escolhidos ou sem post hoje, nenhuma linha", () => {
  assert.equal(linhaDosPostsHoje(dados({ a: 4 }), []), null);
  assert.equal(linhaDosPostsHoje(dados({}), ["a", "b"]), null);
});

test("só conta os grupos escolhidos, mesmo que outros tenham post hoje", () => {
  assert.equal(linhaDosPostsHoje(dados({ z: 4 }), ["a", "b"]), null);
});

test("abaixo do teto mostra o maior número", () => {
  assert.deepEqual(linhaDosPostsHoje(dados({ a: 1, b: 3 }), ["a", "b", "c"]), {
    texto: "Hoje: até 3 de 4 posts nestes grupos.",
    tom: "info",
  });
});

test("alguns no teto avisam quantos ficam de fora", () => {
  assert.deepEqual(linhaDosPostsHoje(dados({ a: 4, b: 5, c: 2 }), ["a", "b", "c"]), {
    texto: "2 de 3 grupos já receberam 4 posts hoje e vão ficar de fora.",
    tom: "aviso",
  });
});

test("todos no teto dizem que o post não vai sair", () => {
  assert.deepEqual(linhaDosPostsHoje(dados({ a: 4, b: 4 }), ["a", "b"]), {
    texto:
      "Todos estes grupos já receberam 4 posts hoje. O post não vai sair; o limite volta à meia-noite.",
    tom: "erro",
  });
});

test("o teto vem dos dados, não do código", () => {
  assert.equal(
    linhaDosPostsHoje({ teto: 2, grupos: { a: 2 } }, ["a", "b"])?.texto,
    "1 de 2 grupos já receberam 2 posts hoje e vão ficar de fora.",
  );
});

test("o formato do corpo: teto inteiro > 0 e contagens inteiras >= 0, senão null", () => {
  assert.deepEqual(lerFormatoPostsHoje({ teto: 4, grupos: { a: 0, b: 3 } }), { teto: 4, grupos: { a: 0, b: 3 } });
  assert.deepEqual(lerFormatoPostsHoje({ teto: 1, grupos: {} }), { teto: 1, grupos: {} });
  const fora: unknown[] = [
    null,
    "4",
    [],
    { grupos: {} },
    { teto: 0, grupos: {} },
    { teto: 4.5, grupos: {} },
    { teto: 4, grupos: [] },
    { teto: 4, grupos: { a: -1 } },
    { teto: 4, grupos: { a: 1.5 } },
    { teto: 4, grupos: { a: "3" } },
  ];
  for (const corpo of fora) assert.equal(lerFormatoPostsHoje(corpo), null, JSON.stringify(corpo));
});
