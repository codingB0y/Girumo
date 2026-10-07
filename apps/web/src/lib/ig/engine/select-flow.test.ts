import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowDef, TriggerNode } from "@/lib/ig/flow/types";
import { escolherFluxo, type FluxoNoAr } from "./select-flow";

const fluxo = (id: string, trigger: Partial<TriggerNode>): FluxoNoAr => ({
  id,
  version: 1,
  published: { v: 1, nodes: [{ id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false, ...trigger }], edges: [] },
});

test("comentário: post específico ganha de qualquer post; depois a palavra mais longa", () => {
  const qualquer = fluxo("q", { keywords: ["quero", "eu quero"] });
  const doPost = fluxo("p", { keywords: ["quero"], postId: "post-1" });
  assert.equal(escolherFluxo([qualquer, doPost], { kind: "comment", postId: "post-1", text: "EU QUERO!" })?.flowId, "p");
  assert.equal(escolherFluxo([doPost, qualquer], { kind: "comment", postId: "post-2", text: "eu quero" })?.flowId, "q");
  assert.equal(escolherFluxo([qualquer], { kind: "comment", postId: "post-2", text: "eu quero" })?.keyword, "eu quero");
  assert.equal(escolherFluxo([qualquer], { kind: "comment", postId: "post-2", text: "quero" })?.keyword, "quero");
  assert.equal(escolherFluxo([qualquer], { kind: "comment", postId: "post-2", text: "nada a ver" }), null);
});

test("direct só casa gatilho de direct; comentário só gatilho de comentário", () => {
  const deComentario = fluxo("c", { on: "comment" });
  const deDirect = fluxo("d", { on: "dm", keywords: ["quero", "grupo"] });
  assert.equal(escolherFluxo([deComentario, deDirect], { kind: "dm", text: "grupo" })?.flowId, "d");
  assert.equal(escolherFluxo([deDirect], { kind: "comment", postId: "x", text: "quero" }), null);
  assert.equal(escolherFluxo([deComentario], { kind: "dm", text: "quero" }), null);
});

test("story só com storyReplies; dispara sem palavra, e a palavra conta quando casa", () => {
  const semStory = fluxo("s0", { on: "dm", storyReplies: false });
  const comStory = fluxo("s1", { on: "dm", storyReplies: true, keywords: ["quero"] });
  assert.equal(escolherFluxo([semStory], { kind: "story", text: "lindo" }), null);
  const semPalavra = escolherFluxo([comStory], { kind: "story", text: "lindo" });
  assert.equal(semPalavra?.flowId, "s1");
  assert.equal(semPalavra?.keyword, null);
  assert.equal(escolherFluxo([comStory], { kind: "story", text: "quero" })?.keyword, "quero");
});

test("fluxo sem grafo publicado ou sem gatilho é ignorado; empate fica com o primeiro", () => {
  const vazio: FluxoNoAr = { id: "v", version: 1, published: null };
  const semGatilho: FluxoNoAr = { id: "g", version: 1, published: { v: 1, nodes: [], edges: [] } };
  const a = fluxo("a", {});
  const b = fluxo("b", {});
  assert.equal(escolherFluxo([vazio, semGatilho, a, b], { kind: "comment", postId: "x", text: "quero" })?.flowId, "a");
});
