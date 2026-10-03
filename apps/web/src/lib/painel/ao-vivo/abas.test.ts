import assert from "node:assert/strict";
import { test } from "node:test";

import { ABAS, abaDaUrl, abaInicial, contadoresDasAbas } from "./abas";

test("abaDaUrl aceita só as três abas", () => {
  assert.deepEqual(ABAS, ["relampago", "postando", "grupos"]);
  assert.equal(abaDaUrl("relampago"), "relampago");
  assert.equal(abaDaUrl("postando"), "postando");
  assert.equal(abaDaUrl("grupos"), "grupos");
  assert.equal(abaDaUrl("x"), null);
  assert.equal(abaDaUrl("Grupos"), null);
  assert.equal(abaDaUrl(""), null);
  assert.equal(abaDaUrl(null), null);
});

test("abaInicial: relâmpago no ar vence, depois post saindo, senão grupos", () => {
  assert.equal(abaInicial({ relampagoNoAr: true, postSaindo: true }), "relampago");
  assert.equal(abaInicial({ relampagoNoAr: true, postSaindo: false }), "relampago");
  assert.equal(abaInicial({ relampagoNoAr: false, postSaindo: true }), "postando");
  assert.equal(abaInicial({ relampagoNoAr: false, postSaindo: false }), "grupos");
});

const base = { relampagoNoAr: false, esperando: null, post: null, grupos: 0 };

test("contador da Relâmpago: número quando conhecido, bolinha sem número, nada sem oferta", () => {
  assert.equal(contadoresDasAbas({ ...base, relampagoNoAr: true, esperando: 8 }).relampago, "8");
  assert.equal(contadoresDasAbas({ ...base, relampagoNoAr: true, esperando: 0 }).relampago, "0");
  assert.equal(contadoresDasAbas({ ...base, relampagoNoAr: true, esperando: null }).relampago, "●");
  assert.equal(contadoresDasAbas({ ...base, relampagoNoAr: false, esperando: 8 }).relampago, null);
});

test("contador do Postando: placar só enquanto o post sai", () => {
  assert.equal(contadoresDasAbas({ ...base, post: { entregues: 27, total: 40, saindo: true } }).postando, "27/40");
  assert.equal(contadoresDasAbas({ ...base, post: { entregues: 40, total: 40, saindo: false } }).postando, null);
  assert.equal(contadoresDasAbas(base).postando, null);
});

test("contador dos Grupos: a quantidade, nada com zero", () => {
  assert.equal(contadoresDasAbas({ ...base, grupos: 58 }).grupos, "58");
  assert.equal(contadoresDasAbas({ ...base, grupos: 0 }).grupos, null);
});
