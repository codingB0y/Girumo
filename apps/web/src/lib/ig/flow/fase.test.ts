import assert from "node:assert/strict";
import { test } from "node:test";
import { foraDaFase } from "./fase";
import { RECIPES } from "./recipes";
import { grupoDaIssue } from "./validate";

test("as receitas de um direct passam; a receita com espera, condição e lembrete não", () => {
  assert.deepEqual(foraDaFase(RECIPES.comment_invite.build()), []);
  assert.deepEqual(foraDaFase(RECIPES.dm_invite.build()), []);
  assert.deepEqual(foraDaFase(RECIPES.blank.build()), []);
  const issues = foraDaFase(RECIPES.comment_follow_invite.build());
  assert.ok(issues.length >= 4, "espera (2), condição, lembrete e desvio por clique");
  assert.ok(issues.every((i) => i.code === "fase_seguinte"));
  assert.deepEqual(issues.filter((i) => i.nodeId === "segue").length, 1);
  assert.equal(grupoDaIssue("fase_seguinte"), "regras");
});
