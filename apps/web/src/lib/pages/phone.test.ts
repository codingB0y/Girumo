import assert from "node:assert/strict";
import { test } from "node:test";

import { chaveDoTelefone, normalizeWhatsappBR, telefoneMascarado } from "./phone";

// válidos — celular 11 dígitos (DDD + 9 + 8)
assert.equal(normalizeWhatsappBR("(62) 99819-1314"), "+5562998191314");
assert.equal(normalizeWhatsappBR("62998191314"), "+5562998191314");
assert.equal(normalizeWhatsappBR("5562998191314"), "+5562998191314");
assert.equal(normalizeWhatsappBR("+55 62 99819-1314"), "+5562998191314");

// válido — fixo/10 dígitos (DDD + 8)
assert.equal(normalizeWhatsappBR("6233334444"), "+556233334444");

// válido — DDD 55 (Santa Maria/RS) num número de 11 dígitos NÃO deve ser confundido
// com o código de país +55 (só remove o 55 líder quando há 12+ dígitos)
assert.equal(normalizeWhatsappBR("55987654321"), "+5555987654321");

// válido — 13 dígitos com prefixo de país 55 é removido
assert.equal(normalizeWhatsappBR("5511999998888"), "+5511999998888");

// inválidos
assert.equal(normalizeWhatsappBR("1099819131"), null); // DDD 10 < 11
assert.equal(normalizeWhatsappBR("998191314"), null); // 9 dígitos, curto demais
assert.equal(normalizeWhatsappBR("629981913141"), null); // 12 dígitos sem 55, longo
assert.equal(normalizeWhatsappBR(""), null); // vazio
assert.equal(normalizeWhatsappBR("abc"), null); // sem dígitos
assert.equal(normalizeWhatsappBR("55"), null); // só o prefixo

console.log("phone tests passed");

test("chave de telefone: os exemplos da spec §1 dão a mesma chave", () => {
  for (const telefone of ["(62) 99999-8888", "556299998888", "+55 62 99999-8888", "5562 9999-8888", "062999998888"]) {
    assert.equal(chaveDoTelefone(telefone), "6299998888", telefone);
  }
  assert.equal(chaveDoTelefone("+5511987654321"), "1187654321");
});

test("chave de telefone: DDD 55 com 11 dígitos não perde o DDD; curto ou vazio é null", () => {
  assert.equal(chaveDoTelefone("55987654321"), "5587654321");
  assert.equal(chaveDoTelefone("999998888"), null);
  assert.equal(chaveDoTelefone(""), null);
  assert.equal(chaveDoTelefone(null), null);
  assert.equal(chaveDoTelefone(undefined), null);
});

test("máscara: DDD, o 9 da frente e os 4 últimos; fixo sem o 9", () => {
  assert.equal(telefoneMascarado("+5562999994821"), "(62) 9••••-4821");
  assert.equal(telefoneMascarado("62999994821"), "(62) 9••••-4821");
  assert.equal(telefoneMascarado("(62) 99999-4821"), "(62) 9••••-4821");
  assert.equal(telefoneMascarado("556299994821"), "(62) ••••-4821");
  assert.equal(telefoneMascarado("55987654321"), "(55) 9••••-4321");
  // Onze dígitos cujo terceiro não é 9 não é celular: o dígito não pode vazar.
  assert.equal(telefoneMascarado("62799994821"), "(62) •••••-4821");
});

test("máscara: o que não é telefone BR não mostra dígito nenhum", () => {
  assert.equal(telefoneMascarado("123"), "•••");
  assert.equal(telefoneMascarado(""), "•••");
  assert.equal(telefoneMascarado(null), "•••");
});
