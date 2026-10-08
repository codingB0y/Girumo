import assert from "node:assert/strict";
import { test } from "node:test";
import { foraDaFase } from "./fase";
import { RECIPES } from "./recipes";
import type { FlowDef } from "./types";
import { grupoDaIssue } from "./validate";

test("as receitas de um direct passam; a receita com condição e lembrete não", () => {
  assert.deepEqual(foraDaFase(RECIPES.comment_invite.build()), []);
  assert.deepEqual(foraDaFase(RECIPES.dm_invite.build()), []);
  assert.deepEqual(foraDaFase(RECIPES.blank.build()), []);
  const issues = foraDaFase(RECIPES.comment_follow_invite.build());
  assert.deepEqual(issues.map((i) => i.nodeId), ["segue", "convite", null], "condição, lembrete e desvio por clique; a espera já roda");
  assert.ok(issues.every((i) => i.code === "fase_seguinte"));
  assert.equal(grupoDaIssue("fase_seguinte"), "regras");
});

test("esperar a resposta publica; o desvio de quem não respondeu (timeout) ainda não", () => {
  const def = RECIPES.comment_follow_invite.build();
  const espera: FlowDef = {
    v: 1,
    nodes: [def.nodes[0], def.nodes[1], { id: "convite", type: "invite", text: "Link:", campaignSlug: null, remindAfterMinutes: null }],
    edges: [{ from: "gatilho", out: "next", to: "pede" }, { from: "pede", out: "replied", to: "convite" }],
  };
  assert.deepEqual(foraDaFase(espera), []);
  const comTimeout: FlowDef = { ...espera, edges: [...espera.edges, { from: "pede", out: "timeout", to: "convite" }] };
  assert.deepEqual(foraDaFase(comTimeout).map((i) => i.nodeId), ["pede"]);
});
