// apps/web/src/lib/integracoes/chave-do-site.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { chaveDoCabecalho, gerarChave, hashDaChave } from "./chave-do-site";

test("gera chave gk_live_ de 43 caracteres, hash sha256 e os 4 últimos", () => {
  const { chave, hash, last4 } = gerarChave();
  assert.match(chave, /^gk_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(hash, createHash("sha256").update(chave).digest("hex"));
  assert.equal(last4, chave.slice(-4));
});

test("duas chaves nunca saem iguais", () => {
  assert.notEqual(gerarChave().chave, gerarChave().chave);
});

test("hash é determinístico e hexadecimal", () => {
  assert.equal(hashDaChave("gk_live_x"), hashDaChave("gk_live_x"));
  assert.match(hashDaChave("gk_live_x"), /^[0-9a-f]{64}$/);
});

test("lê a chave só de 'Bearer gk_live_<43>'", () => {
  const chave = `gk_live_${"A".repeat(43)}`;
  assert.equal(chaveDoCabecalho(`Bearer ${chave}`), chave);
  assert.equal(chaveDoCabecalho(null), null);
  assert.equal(chaveDoCabecalho(chave), null);
  assert.equal(chaveDoCabecalho(`Bearer  ${chave}`), chave);
  assert.equal(chaveDoCabecalho(`Bearer gk_test_${"A".repeat(43)}`), null);
  assert.equal(chaveDoCabecalho(`Bearer gk_live_${"A".repeat(42)}`), null);
  assert.equal(chaveDoCabecalho(`Bearer gk_live_${"A".repeat(43)}!`), null);
});
