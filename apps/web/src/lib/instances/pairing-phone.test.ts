import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizarTelefonePareamento } from "./pairing-phone";

test("número com DDI e máscara vira só dígitos", () => {
  assert.equal(normalizarTelefonePareamento("+55 (11) 99999-8888"), "5511999998888");
});

test("número brasileiro sem DDI ganha o 55", () => {
  assert.equal(normalizarTelefonePareamento("(11) 99999-8888"), "5511999998888");
  assert.equal(normalizarTelefonePareamento("1133334444"), "551133334444");
});

/**
 * O 0 de operadora e o 00 de discagem internacional fazem o número parecer ter
 * DDI e saem para a Evolution errados — o código vai para outro número e
 * digitá-lo no celular não faz nada.
 */
test("zero de operadora e 00 internacional são descartados", () => {
  assert.equal(normalizarTelefonePareamento("(011) 99999-8888"), "5511999998888");
  assert.equal(normalizarTelefonePareamento("0055 11 99999-8888"), "5511999998888");
});

test("número estrangeiro com DDI passa como veio", () => {
  assert.equal(normalizarTelefonePareamento("+1 415 555 2671"), "14155552671");
});

test("curto, longo, vazio ou não-texto é recusado", () => {
  assert.equal(normalizarTelefonePareamento("99999"), null);
  assert.equal(normalizarTelefonePareamento("1234567890123456"), null);
  assert.equal(normalizarTelefonePareamento(""), null);
  assert.equal(normalizarTelefonePareamento(undefined), null);
  assert.equal(normalizarTelefonePareamento(5511999998888), null);
});
