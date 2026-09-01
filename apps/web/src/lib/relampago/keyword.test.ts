import assert from "node:assert/strict";
import { test } from "node:test";

import { matchesKeyword, normalizeKeyword } from "./keyword";

test("normalizeKeyword tira acento, caixa e espaço sobrando", () => {
  assert.equal(normalizeKeyword("  EU QUÉRO  "), "eu quero");
  assert.equal(normalizeKeyword("Eu    Quero"), "eu quero");
});

test("matchesKeyword aceita caixa, acento, emoji e pontuação", () => {
  assert.equal(matchesKeyword("EU QUERO", "eu quero"), true);
  assert.equal(matchesKeyword("eu quero 😍", "eu quero"), true);
  assert.equal(matchesKeyword("eu quero esse!!!", "eu quero"), true);
  assert.equal(matchesKeyword("Oi, eu quéro sim", "eu quero"), true);
  assert.equal(matchesKeyword("EU,QUERO", "eu quero"), true);
});

test("matchesKeyword exige fronteira de palavra", () => {
  // Sem isto, "quero" casaria dentro de "euquero" e a fila encheria de falso
  // positivo — que é exatamente o que a feature existe para não ter.
  assert.equal(matchesKeyword("euquero", "eu quero"), false);
  assert.equal(matchesKeyword("euquero", "quero"), false);
  assert.equal(matchesKeyword("requerido", "quero"), false);
});

test("matchesKeyword sem texto é falso, nunca lança", () => {
  assert.equal(matchesKeyword(null, "eu quero"), false);
  assert.equal(matchesKeyword(undefined, "eu quero"), false);
  assert.equal(matchesKeyword("", "eu quero"), false);
  assert.equal(matchesKeyword("eu quero", ""), false);
});
