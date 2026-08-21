import assert from "node:assert/strict";
import { test } from "node:test";
import { isSessionRevoked } from "./session-revocation";

const AGORA = Date.parse("2026-08-19T20:00:00.000Z");

test("sem linha na tabela, nada esta revogado", () => {
  assert.equal(isSessionRevoked(AGORA, null), false);
});

test("token emitido ANTES do corte e recusado", () => {
  const corte = new Date(AGORA);
  assert.equal(isSessionRevoked(AGORA - 60_000, corte), true);
});

test("token emitido DEPOIS do corte continua valendo", () => {
  const corte = new Date(AGORA - 60_000);
  assert.equal(isSessionRevoked(AGORA, corte), false);
});

// O logout revoga e alguns fluxos reemitem em seguida; sem a folga, o usuario
// sairia e nao conseguiria entrar de novo no mesmo segundo.
test("token do mesmo instante do corte sobrevive (folga de relogio)", () => {
  assert.equal(isSessionRevoked(AGORA, new Date(AGORA)), false);
  assert.equal(isSessionRevoked(AGORA, new Date(AGORA + 500)), false);
});

test("aceita timestamp em texto, como vem do supabase-js", () => {
  assert.equal(isSessionRevoked(AGORA - 60_000, "2026-08-19T20:00:00.000Z"), true);
  assert.equal(isSessionRevoked(AGORA, "2026-08-19T19:00:00.000Z"), false);
});

// Falhar para o lado de deixar passar: data corrompida nao pode virar logout em
// massa. O problema aparece no monitoramento, nao na cara do usuario.
test("data invalida nao derruba sessao", () => {
  assert.equal(isSessionRevoked(AGORA, "nao-e-data"), false);
  assert.equal(isSessionRevoked(AGORA, ""), false);
});

test("token sem iat (0) e recusado por qualquer corte", () => {
  assert.equal(isSessionRevoked(0, new Date(AGORA)), true);
});
