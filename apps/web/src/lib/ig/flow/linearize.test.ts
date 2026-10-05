import test from "node:test";
import assert from "node:assert/strict";
import { linearize } from "./linearize";
import { RECIPES } from "./recipes";

test("a trilha segue respondeu → segue a loja → clicou, e os desvios ficam pendurados", () => {
  const trilha = linearize(RECIPES.comment_follow_invite.build());
  assert.deepEqual(trilha.map((p) => p.node.id), ["gatilho", "pede", "segue", "convite"]);
  assert.deepEqual(trilha[1].ramos.map((r) => [r.out, r.alvo?.node.id ?? null, r.volta]), [["timeout", null, null]]);
  const naoSegue = trilha[2].ramos.find((r) => r.out === "no");
  assert.equal(naoSegue?.alvo?.node.id, "pede_seguir");
  assert.deepEqual(naoSegue?.alvo?.ramos.map((r) => [r.out, r.volta]), [["replied", "segue"], ["timeout", null]]);
  assert.equal(trilha[3].ramos.find((r) => r.out === "not_clicked")?.alvo?.node.id, "lembrete");
  assert.deepEqual(trilha[3].proximo, { out: "clicked", to: null });
});

test("sem gatilho não há trilha", () => {
  assert.deepEqual(linearize({ v: 1, nodes: [], edges: [] }), []);
});
