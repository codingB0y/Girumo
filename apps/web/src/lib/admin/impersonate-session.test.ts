import { test } from "node:test";
import assert from "node:assert/strict";
import { isImpersonateFresh, IMPERSONATE_MAX_AGE_MS } from "./impersonate-session";

const NOW = Date.parse("2026-08-12T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test("cookie recém-emitido é aceito", () => {
  assert.equal(isImpersonateFresh(ago(0), NOW), true);
  assert.equal(isImpersonateFresh(ago(60 * 60 * 1000), NOW), true);
});

test("cookie além das 2h é recusado — o maxAge do navegador não vale no servidor", () => {
  // O ataque: alguém copia o valor do cookie (extensão, log, DevTools em máquina
  // compartilhada). Sem esta checagem o DELETE ainda emite sessão de super-admin.
  assert.equal(isImpersonateFresh(ago(IMPERSONATE_MAX_AGE_MS), NOW), false);
  assert.equal(isImpersonateFresh(ago(3 * 60 * 60 * 1000), NOW), false);
  assert.equal(isImpersonateFresh(ago(365 * 24 * 60 * 60 * 1000), NOW), false);
});

test("um milissegundo antes do limite ainda passa", () => {
  assert.equal(isImpersonateFresh(ago(IMPERSONATE_MAX_AGE_MS - 1), NOW), true);
});

test("startedAt ausente ou inválido é recusado", () => {
  assert.equal(isImpersonateFresh(undefined, NOW), false);
  assert.equal(isImpersonateFresh(null, NOW), false);
  assert.equal(isImpersonateFresh("", NOW), false);
  assert.equal(isImpersonateFresh("ontem", NOW), false);
  assert.equal(isImpersonateFresh(NOW, NOW), false); // number, não ISO string
});

test("startedAt no futuro é recusado", () => {
  // Cookie forjado com data adiantada não compra validade extra.
  assert.equal(isImpersonateFresh(new Date(NOW + 60_000).toISOString(), NOW), false);
});
