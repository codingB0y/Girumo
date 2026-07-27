import assert from "node:assert/strict";
import { normalizeWhatsappBR } from "./phone";

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
