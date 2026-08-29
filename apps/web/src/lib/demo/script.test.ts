import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_STEPS, DEMO_STEP_COUNT, isLastStep, nextStep, stepAt } from "./script";

test("o roteiro tem exatamente quatro passos, na ordem da venda", () => {
  assert.equal(DEMO_STEP_COUNT, 4);
  assert.deepEqual(
    DEMO_STEPS.map((s) => s.id),
    ["campaign", "dispatch", "group", "order"],
  );
});

test("avançar anda um passo por vez", () => {
  assert.equal(nextStep(0), 1);
  assert.equal(nextStep(1), 2);
});

test("avançar no último passo não sai do fim", () => {
  // Sem o clamp, o índice cresceria para sempre e stepAt devolveria undefined —
  // tela branca no exato momento em que o CTA precisa aparecer.
  assert.equal(nextStep(3), 3);
  assert.equal(nextStep(99), 3);
});

test("índice fora da faixa cai no passo mais próximo, nunca em undefined", () => {
  assert.equal(stepAt(-1).id, "campaign");
  assert.equal(stepAt(99).id, "order");
});

test("só o último passo dispensa botão de avançar — ali entra o CTA", () => {
  assert.equal(isLastStep(3), true);
  assert.equal(isLastStep(2), false);
  assert.equal(stepAt(3).action, null);
  for (const i of [0, 1, 2]) assert.notEqual(stepAt(i).action, null);
});
