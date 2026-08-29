import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhoneBR, validateDemoRequest } from "./request-validation";

test("aceita celular com máscara e devolve só dígitos", () => {
  assert.equal(normalizePhoneBR("(62) 99819-1314"), "62998191314");
});

test("aceita +55 na frente e descarta o país", () => {
  assert.equal(normalizePhoneBR("+55 62 99819-1314"), "62998191314");
  assert.equal(normalizePhoneBR("5562998191314"), "62998191314");
});

test("recusa fixo — o produto manda no WhatsApp", () => {
  // 10 dígitos, sem o 9 do celular.
  assert.equal(normalizePhoneBR("(62) 3212-1314"), null);
});

test("recusa DDD inválido e número curto", () => {
  assert.equal(normalizePhoneBR("(00) 99819-1314"), null);
  assert.equal(normalizePhoneBR("99819"), null);
});

test("payload válido passa e vem normalizado", () => {
  const r = validateDemoRequest({ name: "  Igor Toledo ", phone: "+55 62 99819-1314", stepReached: 3 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.value, { name: "Igor Toledo", phone: "62998191314", stepReached: 3 });
});

test("nome vazio ou só espaço é recusado com mensagem de gente", () => {
  const r = validateDemoRequest({ name: "   ", phone: "62998191314" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, "Preencha seu nome.");
});

test("nome absurdamente longo é recusado", () => {
  const r = validateDemoRequest({ name: "a".repeat(121), phone: "62998191314" });
  assert.equal(r.ok, false);
});

test("telefone inválido é recusado com mensagem própria", () => {
  const r = validateDemoRequest({ name: "Igor", phone: "3212-1314" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, "Informe um celular com DDD e WhatsApp.");
});

test("body que não é objeto não derruba a rota", () => {
  // req.json() devolve null quando o corpo não é JSON. Sem este caminho o
  // handler estoura em TypeError e vira 500 numa requisição só malformada.
  assert.equal(validateDemoRequest(null).ok, false);
  assert.equal(validateDemoRequest("x").ok, false);
  assert.equal(validateDemoRequest(42).ok, false);
});

test("stepReached fora da faixa do roteiro vira null em vez de sujar o banco", () => {
  const r = validateDemoRequest({ name: "Igor", phone: "62998191314", stepReached: 99 });
  assert.equal(r.ok && r.value.stepReached, null);
  const s = validateDemoRequest({ name: "Igor", phone: "62998191314", stepReached: "dois" });
  assert.equal(s.ok && s.value.stepReached, null);
});
