import test from "node:test";
import assert from "node:assert/strict";
import { parseFlowDef } from "./schema";

const valido = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: "Te chamei no direct.", storyReplies: false },
    { id: "convite", type: "invite", text: "Oi", campaignSlug: null, remindAfterMinutes: null },
  ],
  edges: [{ from: "gatilho", out: "next", to: "convite" }],
};

test("aceita um fluxo bem formado e devolve o tipo do modelo", () => {
  const r = parseFlowDef(valido);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.def.nodes[1].type, "invite");
});

test("recusa versão desconhecida, campo extra e saída inexistente", () => {
  assert.equal(parseFlowDef({ ...valido, v: 2 }).ok, false);
  assert.equal(parseFlowDef({ ...valido, nodes: [{ ...valido.nodes[0], extra: 1 }, valido.nodes[1]] }).ok, false);
  assert.equal(parseFlowDef({ ...valido, edges: [{ from: "gatilho", out: "voou", to: "convite" }] }).ok, false);
  const r = parseFlowDef("não é objeto");
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.length > 0);
});
