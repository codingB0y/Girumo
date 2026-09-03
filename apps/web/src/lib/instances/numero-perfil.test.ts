import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumeroPerfil } from "./numero-perfil";

test("aceita novo, antigo e ausente", () => {
  assert.deepEqual(parseNumeroPerfil("novo"), { ok: true, value: "novo" });
  assert.deepEqual(parseNumeroPerfil("antigo"), { ok: true, value: "antigo" });
  assert.deepEqual(parseNumeroPerfil(undefined), { ok: true, value: null });
});

test("rejeita qualquer outro valor", () => {
  assert.equal(parseNumeroPerfil("veterano").ok, false);
  assert.equal(parseNumeroPerfil(1).ok, false);
  assert.equal(parseNumeroPerfil("").ok, false);
});
