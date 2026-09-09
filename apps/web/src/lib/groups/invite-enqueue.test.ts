import { test } from "node:test";
import assert from "node:assert/strict";
import { selecionarGruposSemConvite } from "./invite-enqueue";

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
