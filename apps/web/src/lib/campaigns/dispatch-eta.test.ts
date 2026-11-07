import { test } from "node:test";
import assert from "node:assert/strict";
import { etaDisparo, segundosPorMensagem } from "./dispatch-eta";

test("ETA usa 45 s por mensagem restante num post em lote (10 grupos ou mais) e arredonda para cima", () => {
  // 53 restantes x 45 s = 2385 s = 39,75 min
  assert.equal(etaDisparo({ sent: 38, total: 91 }), "≈ 40 min");
  // 10 x 45 s = 450 s = 7,5 min
  assert.equal(etaDisparo({ sent: 0, total: 10 }), "≈ 8 min");
  assert.equal(etaDisparo({ sent: 91, total: 91 }), null);
});

test("ETA usa 6 s por mensagem num post pequeno (menos de 10 grupos)", () => {
  assert.equal(etaDisparo({ sent: 0, total: 5 }), "≈ 1 min");
  // 9 x 6 s = 54 s
  assert.equal(etaDisparo({ sent: 0, total: 9 }), "≈ 1 min");
});

test("o ritmo prometido muda exatamente no tamanho do lote do banco (app.lote_minimo = 10)", () => {
  assert.equal(segundosPorMensagem(9), 6);
  assert.equal(segundosPorMensagem(10), 45);
});
