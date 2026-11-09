import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { assinaturaYampiConfere } from "./assinatura";

// Vetor conferido fora do código: printf '%s' "$CORPO" | openssl dgst -sha256 -hmac "$SEGREDO" -binary | base64
const CORPO = '{"event":"order.paid","resource":{"id":42}}';
const SEGREDO = "segredo-de-teste-da-yampi";
const BOA = "AuFezIw0B8ulxtZZm4L3MwEvD39h0p4Bjl0Us/HsZa0=";
const b64 = (c: string | Uint8Array, s = SEGREDO) => createHmac("sha256", s).update(c).digest("base64");

test("vetor conhecido: o base64 do HMAC-SHA256 do corpo cru confere, com espaço em volta do cabeçalho", () => {
  assert.equal(b64(CORPO), BOA);
  assert.equal(assinaturaYampiConfere(CORPO, BOA, SEGREDO), true);
  assert.equal(assinaturaYampiConfere(CORPO, `  ${BOA} `, SEGREDO), true);
});

test("o HMAC é sobre os bytes crus: BOM e byte UTF-8 inválido conferem; o corpo decodificado antes, não", () => {
  const json = new TextEncoder().encode(CORPO);
  for (const bytes of [Uint8Array.from([0xef, 0xbb, 0xbf, ...json]), Uint8Array.from([...json.subarray(0, 10), 0xff, ...json.subarray(10)])]) {
    assert.equal(assinaturaYampiConfere(bytes, b64(bytes), SEGREDO), true);
    assert.equal(assinaturaYampiConfere(new TextDecoder().decode(bytes), b64(bytes), SEGREDO), false);
    assert.equal(assinaturaYampiConfere(Uint8Array.from([...bytes, 0x20]), b64(bytes), SEGREDO), false);
  }
});

test("corpo alterado, segredo errado ou vazio, cabeçalho ausente ou vazio: não confere", () => {
  assert.equal(assinaturaYampiConfere(`${CORPO} `, BOA, SEGREDO), false);
  assert.equal(assinaturaYampiConfere(CORPO, BOA, "outro"), false);
  assert.equal(assinaturaYampiConfere(CORPO, BOA, ""), false);
  assert.equal(assinaturaYampiConfere(CORPO, null, SEGREDO), false);
  assert.equal(assinaturaYampiConfere(CORPO, "", SEGREDO), false);
});

test("cabeçalho que não é base64 padrão de 32 bytes não confere e não lança (hex, sem '=', url-safe, curto, longo, com prefixo)", () => {
  const hex = createHmac("sha256", SEGREDO).update(CORPO).digest("hex");
  for (const c of [hex, BOA.slice(0, -1), BOA.replace("/", "_"), BOA.slice(0, 20), `${BOA}AA`, `sha256=${BOA}`, `${BOA.slice(0, 10)} ${BOA.slice(10)}`]) {
    assert.equal(assinaturaYampiConfere(CORPO, c, SEGREDO), false, c);
  }
});
