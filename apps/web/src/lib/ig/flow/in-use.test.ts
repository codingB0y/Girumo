import test from "node:test";
import assert from "node:assert/strict";
import { keywordsInUse } from "./in-use";
import { RECIPES } from "./recipes";

test("junta as palavras dos outros fluxos no ar, por tipo de gatilho, e ignora o próprio", () => {
  const flows = [
    { id: "a", published: RECIPES.comment_invite.build() },
    { id: "b", published: RECIPES.dm_invite.build() },
    { id: "c", published: null },
  ];
  assert.deepEqual(keywordsInUse(flows, "a"), [
    { on: "dm", keyword: "quero" },
    { on: "dm", keyword: "grupo" },
  ]);
  assert.equal(keywordsInUse(flows, "zzz").length, 4);
});
