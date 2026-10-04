import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES, RECIPE_ORDER } from "./recipes";
import { reachableIds, triggerOf } from "./graph";
import { outsOf } from "./types";

test("toda receita tem um gatilho e nenhum bloco solto", () => {
  for (const id of RECIPE_ORDER) {
    const def = RECIPES[id].build();
    assert.ok(triggerOf(def), `${id} sem gatilho`);
    assert.equal(reachableIds(def).size, def.nodes.length, `${id} com bloco solto`);
    for (const e of def.edges) {
      const from = def.nodes.find((n) => n.id === e.from);
      assert.ok(from && outsOf(from).includes(e.out), `${id}: aresta ${e.from}/${e.out} inválida`);
    }
  }
});

test("a receita de seguir volta pra condição depois de pedir pra seguir", () => {
  const def = RECIPES.comment_follow_invite.build();
  assert.ok(def.edges.some((e) => e.from === "pede_seguir" && e.out === "replied" && e.to === "segue"));
  assert.equal(def.nodes.find((n) => n.id === "convite")?.type, "invite");
});

test("a receita em branco só tem o gatilho, sem palavra", () => {
  const def = RECIPES.blank.build();
  assert.equal(def.nodes.length, 1);
  assert.deepEqual(triggerOf(def)?.keywords, []);
});
