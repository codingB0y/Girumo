import assert from "node:assert/strict";
import { test } from "node:test";
import { montarLink, novoRef } from "./link";

test("o ref é aleatório, sem dado pessoal e cabe no formato do /r", () => {
  const refs = new Set(Array.from({ length: 200 }, () => novoRef()));
  assert.equal(refs.size, 200);
  for (const r of refs) assert.match(r, /^[A-Za-z0-9_-]{10,24}$/);
});

test("no app o link é /r/<slug>?ig=; no domínio próprio é /<slug>?ig=", () => {
  assert.equal(montarLink("https://app.girumo.com.br", "vip-outono", "AbC_-123xyz9"), "https://app.girumo.com.br/r/vip-outono?ig=AbC_-123xyz9");
  assert.equal(montarLink("https://loja.exemplo.com.br", "vip-outono", "r1r1r1r1r1"), "https://loja.exemplo.com.br/vip-outono?ig=r1r1r1r1r1");
});
