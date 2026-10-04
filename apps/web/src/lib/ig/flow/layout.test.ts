import test from "node:test";
import assert from "node:assert/strict";
import { COL_PITCH, NODE_W, PAD, layout } from "./layout";
import { RECIPES } from "./recipes";

test("a trilha vira a espinha e os desvios descem da coluna de origem", () => {
  const l = layout(RECIPES.comment_follow_invite.build());
  const pos = Object.fromEntries(l.nodes.map((n) => [n.id, [n.coluna, n.linha]]));
  assert.deepEqual(pos, { gatilho: [0, 0], pede: [1, 0], segue: [2, 0], pede_seguir: [2, 1], convite: [3, 0], lembrete: [3, 1] });
  assert.equal(l.nodes.find((n) => n.id === "pede")?.x, PAD + COL_PITCH);
  assert.equal(l.width, PAD * 2 + 3 * COL_PITCH + NODE_W);
  assert.deepEqual(
    l.edges.map((e) => `${e.from}>${e.to}:${e.kind}`).sort(),
    ["convite>lembrete:desvio", "gatilho>pede:principal", "pede>segue:principal", "pede_seguir>segue:volta", "segue>convite:principal", "segue>pede_seguir:desvio"],
  );
});
