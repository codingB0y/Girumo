import test from "node:test";
import assert from "node:assert/strict";
import { reachableIds, targetOf, triggerOf } from "./graph";
import type { FlowDef } from "./types";

const def: FlowDef = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
    { id: "convite", type: "invite", text: "Oi", campaignSlug: "vip", remindAfterMinutes: null },
    { id: "solto", type: "message", text: "x", button: null, wait: null },
  ],
  edges: [{ from: "gatilho", out: "next", to: "convite" }],
};

test("alcança a partir do gatilho e deixa o bloco solto de fora", () => {
  assert.deepEqual([...reachableIds(def)].sort(), ["convite", "gatilho"]);
  assert.equal(targetOf(def, "gatilho", "next"), "convite");
  assert.equal(targetOf(def, "convite", "clicked"), null);
  assert.equal(triggerOf(def)?.id, "gatilho");
});
