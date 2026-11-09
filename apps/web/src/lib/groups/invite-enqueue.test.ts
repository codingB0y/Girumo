import { test } from "node:test";
import assert from "node:assert/strict";
import { REVISAO_QUEBRADA_REPOUSO_DIAS, selecionarGruposSemConvite } from "./invite-enqueue";

const g = (over: Partial<Parameters<typeof selecionarGruposSemConvite>[0][number]>) => ({
  id: "g1",
  whatsapp_group_id: "1203@g.us",
  is_admin: true,
  invite_url: null,
  metadata: {},
  ...over,
});

test("entra só grupo admin, sem convite, sem falha marcada, com JID e fora da fila", () => {
  const out = selecionarGruposSemConvite(
    [
      g({ id: "a" }),
      g({ id: "b", is_admin: false }),
      g({ id: "c", invite_url: "https://chat.whatsapp.com/x" }),
      g({ id: "d", metadata: { inviteFetch: { failed: true, reason: "x", at: "y" } } }),
      g({ id: "e", whatsapp_group_id: null }),
      g({ id: "f" }),
    ],
    new Set(["f"]),
  );
  assert.deepEqual(out.map((x) => x.id), ["a"]);
});

test("grupo revisado como quebrado descansa uma semana antes de voltar à fila", () => {
  const agora = new Date("2026-11-08T20:00:00Z");
  const dias = (n: number) => new Date(agora.getTime() - n * 86_400_000).toISOString();
  const out = selecionarGruposSemConvite(
    [
      g({ id: "ontem", invite_check: "broken", invite_checked_at: dias(1) }),
      g({ id: "quase", invite_check: "broken", invite_checked_at: dias(REVISAO_QUEBRADA_REPOUSO_DIAS - 0.5) }),
      g({ id: "semana", invite_check: "broken", invite_checked_at: dias(REVISAO_QUEBRADA_REPOUSO_DIAS) }),
      g({ id: "sem-data", invite_check: "broken", invite_checked_at: null }),
      g({ id: "data-lixo", invite_check: "broken", invite_checked_at: "ontem" }),
      // `changed`/`same` já têm convite e saem pelo filtro de invite_url; sem convite e sem veredito entra.
      g({ id: "nunca", invite_check: null, invite_checked_at: null }),
    ],
    new Set(),
    agora,
  );
  assert.deepEqual(out.map((x) => x.id), ["semana", "sem-data", "data-lixo", "nunca"]);
});
