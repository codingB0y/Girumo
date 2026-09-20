import assert from "node:assert/strict";
import { test } from "node:test";

import { isDraftMode, validateOfferBody } from "./draft-offer";

test("isDraftMode so e verdadeiro com broadcastId string nao-vazio", () => {
  assert.equal(isDraftMode({ broadcastId: "abc" }), true);
  assert.equal(isDraftMode({ broadcastId: "" }), false);
  assert.equal(isDraftMode({}), false);
  assert.equal(isDraftMode({ broadcastId: undefined }), false);
});

test("validateOfferBody exige nome e pecas nos dois modos", () => {
  assert.deepEqual(validateOfferBody(null), { error: "nome obrigatorio" });
  assert.deepEqual(validateOfferBody({ name: "  " }), { error: "nome obrigatorio" });
  assert.deepEqual(validateOfferBody({ name: "oferta", slots: 0 }), {
    error: "informe quantas pecas",
  });
  assert.deepEqual(validateOfferBody({ name: "oferta", slots: 1.5 }), {
    error: "informe quantas pecas",
  });
});

test("validateOfferBody exige groupIds fora do modo rascunho", () => {
  assert.deepEqual(validateOfferBody({ name: "oferta", slots: 5 }), {
    error: "escolha ao menos um grupo",
  });
  assert.deepEqual(validateOfferBody({ name: "oferta", slots: 5, groupIds: [] }), {
    error: "escolha ao menos um grupo",
  });
  assert.equal(
    validateOfferBody({ name: "oferta", slots: 5, groupIds: ["g1"] }),
    null,
  );
});

// O rascunho passa aqui de proposito: a exigencia de "existe um schedules
// pendente, recurrence none, deste tenant" e I/O e vive na rota. Se alguem
// mover essa regra para ca, estes dois asserts viram vermelho e apontam onde.
test("validateOfferBody dispensa groupIds no modo rascunho", () => {
  assert.equal(
    validateOfferBody({ name: "oferta", slots: 5, broadcastId: "b1" }),
    null,
  );
  assert.equal(
    validateOfferBody({ name: "oferta", slots: 5, broadcastId: "b1", groupIds: [] }),
    null,
  );
});
