import assert from "node:assert/strict";
import { test } from "node:test";

import { numerosCaidos } from "./numero-caido";

const AGORA = Date.parse("2026-10-30T15:00:00Z");
const ha = (h: number) => new Date(AGORA - h * 3_600_000).toISOString();
const linha = (purpose: string | null, status: string, caiuHa: number | null) => ({
  purpose,
  status,
  updated_at: ha(caiuHa ?? 0),
  disconnected_at: caiuHa === null ? null : ha(caiuHa),
});

test("número dos grupos caído há 3 h com o do atendimento conectado: avisa o dos grupos", () => {
  // Mutante: selectSessionRow sobre todas as linhas — o atendimento conectado esconderia a queda dos grupos.
  assert.deepEqual(numerosCaidos([linha("privado", "connected", null), linha("grupos", "disconnected", 3)], AGORA), ["grupos"]);
});

test("número do atendimento caído há 3 h com o dos grupos conectado: só o do atendimento", () => {
  assert.deepEqual(numerosCaidos([linha("grupos", "connected", null), linha("privado", "disconnected", 3)], AGORA), ["privado"]);
});

test("caído há 1 h ainda não avisa", () => {
  assert.deepEqual(numerosCaidos([linha("grupos", "disconnected", 1), linha("privado", "disconnected", 1)], AGORA), []);
});

test("os dois caídos: os dois, grupos primeiro", () => {
  assert.deepEqual(numerosCaidos([linha("privado", "disconnected", 5), linha("grupos", "disconnected", 4)], AGORA), ["grupos", "privado"]);
});

test("sem linha, nunca conectou (sem disconnected_at) ou sem purpose: nada", () => {
  assert.deepEqual(numerosCaidos([], AGORA), []);
  assert.deepEqual(numerosCaidos([linha("grupos", "qr", null), linha("privado", "pending", null)], AGORA), []);
  assert.deepEqual(numerosCaidos([linha(null, "disconnected", 3)], AGORA), []);
});
