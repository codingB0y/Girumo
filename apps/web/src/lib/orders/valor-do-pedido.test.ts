import assert from "node:assert/strict";
import { test } from "node:test";

import { parseValorDoPedido } from "./valor-do-pedido";

test("vírgula é decimal e ponto é milhar", () => {
  assert.equal(parseValorDoPedido("149,90"), 149.9);
  assert.equal(parseValorDoPedido("1.149,90"), 1149.9);
  assert.equal(parseValorDoPedido("12.345,67"), 12345.67);
});

test("sem vírgula, o ponto é decimal — não separador de milhar", () => {
  // Este é o caso que fazia a tela mostrar 14990 e o banco gravar 149,90.
  assert.equal(parseValorDoPedido("149.90"), 149.9);
  assert.equal(parseValorDoPedido("1500"), 1500);
});

test("número passa direto", () => {
  assert.equal(parseValorDoPedido(149.9), 149.9);
  assert.equal(parseValorDoPedido(0), 0);
});

test("vazio e lixo viram NaN, para quem chama recusar", () => {
  assert.ok(Number.isNaN(parseValorDoPedido("")));
  assert.ok(Number.isNaN(parseValorDoPedido("   ")));
  assert.ok(Number.isNaN(parseValorDoPedido(null)));
  assert.ok(Number.isNaN(parseValorDoPedido(undefined)));
  assert.ok(Number.isNaN(parseValorDoPedido("abc")));
});
