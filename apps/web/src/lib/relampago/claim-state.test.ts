import assert from "node:assert/strict";
import { test } from "node:test";

import { claimState, deadlineOf } from "./claim-state";

const t0 = new Date("2026-09-01T14:00:00.000Z");
const emSegundos = (s: number) => new Date(t0.getTime() + s * 1000);

test("reservada enquanto o prazo de chamar não venceu", () => {
  const c = { claimedAt: t0, contactedAt: null };
  assert.equal(claimState(c, 300, emSegundos(299)), "reservada");
});

test("expirada_vendedora quando venceu sem ter chamado", () => {
  // A falha foi da loja: a cliente mantém a posição.
  const c = { claimedAt: t0, contactedAt: null };
  assert.equal(claimState(c, 300, emSegundos(301)), "expirada_vendedora");
});

test("em_conversa depois de chamar, com prazo correndo do contato", () => {
  const c = { claimedAt: t0, contactedAt: emSegundos(280) };
  // 290s do claim, mas só 10s do contato: o prazo reiniciou.
  assert.equal(claimState(c, 300, emSegundos(290)), "em_conversa");
});

test("expirada_cliente quando venceu depois de chamada", () => {
  // A cliente não respondeu: vai para o fim da fila.
  const c = { claimedAt: t0, contactedAt: emSegundos(100) };
  assert.equal(claimState(c, 300, emSegundos(401)), "expirada_cliente");
});

test("sem timer nada expira", () => {
  const semChamar = { claimedAt: t0, contactedAt: null };
  const chamada = { claimedAt: t0, contactedAt: emSegundos(10) };
  assert.equal(claimState(semChamar, null, emSegundos(999_999)), "reservada");
  assert.equal(claimState(chamada, null, emSegundos(999_999)), "em_conversa");
  assert.equal(deadlineOf(semChamar, null), null);
});

test("deadlineOf corre do contato quando existe", () => {
  assert.equal(
    deadlineOf({ claimedAt: t0, contactedAt: emSegundos(100) }, 300)?.toISOString(),
    emSegundos(400).toISOString(),
  );
  assert.equal(
    deadlineOf({ claimedAt: t0, contactedAt: null }, 300)?.toISOString(),
    emSegundos(300).toISOString(),
  );
});
