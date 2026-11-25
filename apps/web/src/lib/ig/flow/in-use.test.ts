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

test("fluxo de qualquer mensagem entra como any, sem as palavras dele", () => {
  const dm = RECIPES.dm_invite.build();
  const qualquer = { ...dm, nodes: dm.nodes.map((n) => (n.type === "trigger" ? { ...n, anyMessage: true } : n)) };
  assert.deepEqual(keywordsInUse([{ id: "q", published: qualquer }], "outro"), [{ on: "dm", keyword: "", any: true }]);
});
