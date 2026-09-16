import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validarNomeComunidade, validarWhatsappGroupId } from "./validation";

test("nome vazio é recusado", () => {
  const result = validarNomeComunidade("");
  assert.equal(result.ok, false);
});

test("nome só com espaço é recusado", () => {
  const result = validarNomeComunidade("   ");
  assert.equal(result.ok, false);
});

test("nome com mais de 60 caracteres é recusado", () => {
  const result = validarNomeComunidade("a".repeat(61));
  assert.equal(result.ok, false);
});

test("nome com exatos 60 caracteres é aceito", () => {
  const result = validarNomeComunidade("a".repeat(60));
  assert.equal(result.ok, true);
});

test("nome válido é aceito e vem sem espaço nas pontas", () => {
  const result = validarNomeComunidade("  Grupos VIP  ");
  assert.deepEqual(result, { ok: true, nome: "Grupos VIP" });
});

test("nome que não é string é recusado", () => {
  const result = validarNomeComunidade(123);
  assert.equal(result.ok, false);
});

test("corpo sem whatsappGroupId é recusado", () => {
  const result = validarWhatsappGroupId({});
  assert.equal(result.ok, false);
});

test("corpo com whatsappGroupId não-string é recusado", () => {
  const result = validarWhatsappGroupId({ whatsappGroupId: 123 });
  assert.equal(result.ok, false);
});

test("corpo nulo é recusado", () => {
  const result = validarWhatsappGroupId(null);
  assert.equal(result.ok, false);
});

test("whatsappGroupId válido é aceito", () => {
  const result = validarWhatsappGroupId({ whatsappGroupId: "5511999999999-1600000000@g.us" });
  assert.deepEqual(result, { ok: true, whatsappGroupId: "5511999999999-1600000000@g.us" });
});
