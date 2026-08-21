import { test } from "node:test";
import assert from "node:assert/strict";
import { INVALID_GOAL, parseGoalInput } from "./goal-input";

test("número válido passa", () => {
  assert.equal(parseGoalInput(500), 500);
  assert.equal(parseGoalInput(0), 0);
});

test("string numérica passa — o input do formulário manda texto", () => {
  assert.equal(parseGoalInput("500"), 500);
  assert.equal(parseGoalInput("0"), 0);
});

test("null limpa a meta", () => {
  // Apagar a meta é uma operação legítima, diferente de mandar lixo.
  assert.equal(parseGoalInput(null), null);
});

test("string vazia limpa a meta em vez de virar zero", () => {
  // Number("") é 0. Sem esta guarda, esvaziar o campo no formulário gravaria
  // "meta de 0 contatos" — que a tela então exibe como uma meta de verdade.
  assert.equal(parseGoalInput(""), null);
  assert.equal(parseGoalInput("   "), null);
});

test("texto não-numérico é rejeitado, não vira NaN", () => {
  // Number("abc") é NaN, e NaN chegava no banco pela rota antiga.
  assert.equal(parseGoalInput("abc"), INVALID_GOAL);
  assert.equal(parseGoalInput("12abc"), INVALID_GOAL);
  assert.equal(parseGoalInput({}), INVALID_GOAL);
  assert.equal(parseGoalInput([]), INVALID_GOAL);
  assert.equal(parseGoalInput(true), INVALID_GOAL);
});

test("infinito é rejeitado", () => {
  assert.equal(parseGoalInput(Infinity), INVALID_GOAL);
  assert.equal(parseGoalInput(-Infinity), INVALID_GOAL);
  assert.equal(parseGoalInput("Infinity"), INVALID_GOAL);
  assert.equal(parseGoalInput(NaN), INVALID_GOAL);
});

test("meta negativa é rejeitada", () => {
  // Meta de -50 contatos não significa nada, e a barra de progresso do painel
  // divide por ela.
  assert.equal(parseGoalInput(-1), INVALID_GOAL);
  assert.equal(parseGoalInput("-50"), INVALID_GOAL);
});
