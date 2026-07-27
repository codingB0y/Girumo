import assert from "node:assert/strict";
import test from "node:test";

import { secretMatches } from "./webhook-secret";

const SECRET = "s".repeat(48);

test("accepts the exact secret", () => {
  assert.equal(secretMatches(SECRET, SECRET), true);
});

test("rejects a wrong secret of the same length", () => {
  assert.equal(secretMatches("x".repeat(48), SECRET), false);
});

test("rejects secrets of different lengths without throwing", () => {
  // timingSafeEqual lança em buffers de tamanhos diferentes, e esse throw
  // viraria um 500 que denuncia o tamanho do secret. Comparar digests evita.
  assert.equal(secretMatches("curto", SECRET), false);
  assert.equal(secretMatches(`${SECRET}extra`, SECRET), false);
});

test("rejects a prefix of the secret", () => {
  assert.equal(secretMatches(SECRET.slice(0, 47), SECRET), false);
});

test("rejects a missing header", () => {
  assert.equal(secretMatches(null, SECRET), false);
  assert.equal(secretMatches("", SECRET), false);
});

test("never authenticates when the expected secret is empty", () => {
  // Fail-closed: env ausente não pode virar "qualquer header serve", nem
  // "header vazio serve".
  assert.equal(secretMatches("", ""), false);
  assert.equal(secretMatches("qualquer coisa", ""), false);
  assert.equal(secretMatches(null, ""), false);
});
