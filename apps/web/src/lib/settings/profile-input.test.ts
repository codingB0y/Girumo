import assert from "node:assert/strict";
import { test } from "node:test";
import { NICHE_MAX, STORE_NAME_MAX, parseProfileInput } from "./profile-input";

test("sem os campos, não mexe em nada", () => {
  assert.deepEqual(parseProfileInput({ weeklyReportEnabled: true }), { ok: true, input: {} });
});

test("apara espaços e aceita nome e nicho", () => {
  assert.deepEqual(parseProfileInput({ storeName: "  Mega Stock ", niche: " moda infantil " }), {
    ok: true,
    input: { storeName: "Mega Stock", niche: "moda infantil" },
  });
});

test("nome vazio é recusado: a loja não pode ficar sem nome", () => {
  const r = parseProfileInput({ storeName: "   " });
  assert.equal(r.ok, false);
});

test("nicho vazio ou null vira null (apagar o nicho)", () => {
  assert.deepEqual(parseProfileInput({ niche: "  " }), { ok: true, input: { niche: null } });
  assert.deepEqual(parseProfileInput({ niche: null }), { ok: true, input: { niche: null } });
});

test("tipo errado e tamanho acima do teto são recusados", () => {
  assert.equal(parseProfileInput({ storeName: 42 }).ok, false);
  assert.equal(parseProfileInput({ niche: 7 }).ok, false);
  assert.equal(parseProfileInput({ storeName: "x".repeat(STORE_NAME_MAX + 1) }).ok, false);
  assert.equal(parseProfileInput({ niche: "x".repeat(NICHE_MAX + 1) }).ok, false);
  assert.equal(parseProfileInput({ storeName: "x".repeat(STORE_NAME_MAX) }).ok, true);
});

test("nicho com exatamente o teto de caracteres é aceito", () => {
  assert.deepEqual(parseProfileInput({ niche: "x".repeat(NICHE_MAX) }), {
    ok: true,
    input: { niche: "x".repeat(NICHE_MAX) },
  });
});

test("teto do nome é medido depois do trim, não antes", () => {
  const nome = "x".repeat(STORE_NAME_MAX);
  assert.deepEqual(parseProfileInput({ storeName: `  ${nome}  ` }), {
    ok: true,
    input: { storeName: nome },
  });
});
