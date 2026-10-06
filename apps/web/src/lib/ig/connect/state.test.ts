import assert from "node:assert/strict";
import { test } from "node:test";
import { emitirEstado, lerEstado } from "./state";

const SEG = "segredo-de-teste";

test("o estado volta inteiro dentro de 10 minutos e morre depois", () => {
  const t0 = Date.parse("2026-10-06T12:00:00Z");
  const token = emitirEstado("loja-a", "perfil-1", SEG, t0);
  const lido = lerEstado(token, SEG, t0 + 9 * 60_000);
  assert.equal(lido?.tenantId, "loja-a");
  assert.equal(lido?.profileId, "perfil-1");
  assert.equal(lerEstado(token, SEG, t0 + 11 * 60_000), null);
});

test("assinatura errada, segredo diferente, token torto ou vazio não passam", () => {
  const t0 = Date.now();
  const token = emitirEstado("loja-a", "perfil-1", SEG, t0);
  const [corpo, sig] = token.split(".");
  assert.equal(lerEstado(`${corpo}.${sig.slice(0, -2)}xx`, SEG, t0), null);
  assert.equal(lerEstado(token, "outro", t0), null);
  assert.equal(lerEstado(corpo, SEG, t0), null);
  assert.equal(lerEstado(null, SEG, t0), null);
  assert.equal(lerEstado(token, "", t0), null);
});

test("corpo trocado por outro tenant com a mesma assinatura é recusado", () => {
  const t0 = Date.now();
  const sig = emitirEstado("loja-a", "p", SEG, t0).split(".")[1];
  const corpoFalso = Buffer.from(JSON.stringify({ tenantId: "loja-b", profileId: "p", exp: t0 + 60_000, nonce: "n" })).toString("base64url");
  assert.equal(lerEstado(`${corpoFalso}.${sig}`, SEG, t0), null);
});
