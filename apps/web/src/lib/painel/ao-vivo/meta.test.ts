import assert from "node:assert/strict";
import { test } from "node:test";

import { metaDoTexto } from "./meta";

test("metaDoTexto lê reais com ponto de milhar, vírgula e prefixo", () => {
  assert.equal(metaDoTexto("50000"), 50000);
  assert.equal(metaDoTexto("50.000"), 50000);
  assert.equal(metaDoTexto("R$ 50.000"), 50000);
  assert.equal(metaDoTexto(" 1.234,56 "), 1235);
});

test("metaDoTexto recusa vazio, zero, negativo e lixo", () => {
  assert.equal(metaDoTexto(""), null);
  assert.equal(metaDoTexto("   "), null);
  assert.equal(metaDoTexto("0"), null);
  assert.equal(metaDoTexto("-50"), null);
  assert.equal(metaDoTexto("abc"), null);
  assert.equal(metaDoTexto("1,2,3"), null);
});
