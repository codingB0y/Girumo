import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { assinaturaConfere } from "./signature";

const SEG = "segredo";
const corpo = '{"id":"evt","event":"comment.received"}';
const boa = createHmac("sha256", SEG).update(corpo).digest("hex");

test("hex minúsculo, maiúsculo ou com espaço em volta: confere", () => {
  assert.equal(assinaturaConfere(corpo, boa, SEG), true);
  assert.equal(assinaturaConfere(corpo, boa.toUpperCase(), SEG), true);
  assert.equal(assinaturaConfere(corpo, ` ${boa} `, SEG), true);
});

test("corpo alterado, segredo errado, assinatura curta, não-hex ou ausente: não confere", () => {
  assert.equal(assinaturaConfere(`${corpo} `, boa, SEG), false);
  assert.equal(assinaturaConfere(corpo, boa, "outro"), false);
  assert.equal(assinaturaConfere(corpo, boa.slice(0, 60), SEG), false);
  assert.equal(assinaturaConfere(corpo, "zz".repeat(32), SEG), false);
  assert.equal(assinaturaConfere(corpo, null, SEG), false);
  assert.equal(assinaturaConfere(corpo, boa, ""), false);
});
