import test from "node:test";
import assert from "node:assert/strict";
import { setChoices } from "./choices-edit";
import { fieldKeysIn, insertAfter, linkOut, planConditionCheck, planRemoveBlock, removeBlock, setConditionCheck } from "./blocks-edit";
import { RECIPES } from "./recipes";
import type { FlowDef } from "./types";

const base = (): FlowDef => RECIPES.comment_invite.build();

test("insertAfter coloca a etiqueta entre o gatilho e o convite", () => {
  const def = insertAfter(base(), "gatilho", "etiqueta");
  assert.deepEqual(def.edges.filter((e) => e.out === "next").map((e) => [e.from, e.to]), [["gatilho", "etiqueta"], ["etiqueta", "convite"]]);
  assert.deepEqual(def.nodes.find((n) => n.id === "etiqueta"), { id: "etiqueta", type: "tag", add: [], remove: [] });
});

test("insertAfter de uma pergunta liga v0 ao que vinha depois e cria a espera", () => {
  const def = insertAfter(base(), "gatilho", "pergunta");
  const p = def.nodes.find((n) => n.id === "pergunta");
  assert.equal(p?.type === "message" && p.wait?.minutes, 1380);
  assert.deepEqual(p?.type === "message" && p.choices, ["Sim", "Não"]);
  assert.ok(def.edges.some((e) => e.from === "pergunta" && e.out === "v0" && e.to === "convite"));
});

test("insertAfter de um Se… liga a primeira saída ao que vinha depois", () => {
  const def = insertAfter(base(), "gatilho", "se");
  assert.ok(def.edges.some((e) => e.from === "se" && e.out === "v0" && e.to === "convite"));
});

test("insertAfter gera ids novos quando o nome já existe", () => {
  const def = insertAfter(insertAfter(base(), "gatilho", "etiqueta"), "gatilho", "etiqueta");
  assert.ok(def.nodes.some((n) => n.id === "etiqueta_2"));
});

test("insertAfter num bloco sem saída principal não mexe no fluxo", () => {
  const def: FlowDef = { v: 1, nodes: [{ id: "se", type: "condition", check: "field", field: "x", values: [] }], edges: [] };
  assert.equal(insertAfter(def, "se", "etiqueta"), def);
});

test("removeBlock religa quem chegava ao que vinha depois", () => {
  const com = insertAfter(base(), "gatilho", "etiqueta");
  assert.deepEqual(removeBlock(com, "etiqueta"), base());
});

test("removeBlock não apaga o gatilho", () => {
  const def = base();
  assert.equal(removeBlock(def, "gatilho"), def);
});

test("removeBlock sem destino solta quem chegava", () => {
  const def: FlowDef = insertAfter({ v: 1, nodes: [base().nodes[0]], edges: [] }, "gatilho", "etiqueta");
  assert.deepEqual(removeBlock(def, "etiqueta").edges, []);
});

test("linkOut liga, troca e desliga uma saída", () => {
  const com = insertAfter(base(), "gatilho", "pergunta");
  const ligado = linkOut(com, "pergunta", "v1", "convite");
  assert.ok(ligado.edges.some((e) => e.from === "pergunta" && e.out === "v1" && e.to === "convite"));
  const trocado = linkOut(ligado, "pergunta", "v1", "etiqueta_x");
  assert.equal(trocado, ligado, "destino que não existe é ignorado");
  const solto = linkOut(ligado, "pergunta", "v1", null);
  assert.ok(!solto.edges.some((e) => e.from === "pergunta" && e.out === "v1"));
});

test("linkOut recusa saída que o bloco não tem e laço no próprio bloco", () => {
  const com = insertAfter(base(), "gatilho", "pergunta");
  assert.equal(linkOut(com, "pergunta", "v5", "convite"), com);
  assert.equal(linkOut(com, "pergunta", "v1", "pergunta"), com);
});

test("setConditionCheck troca campo por etiqueta levando v0 para yes e de volta", () => {
  const def = insertAfter(base(), "gatilho", "se");
  const tag = setConditionCheck(def, "se", "tag");
  const se = tag.nodes.find((n) => n.id === "se");
  assert.deepEqual(se, { id: "se", type: "condition", check: "tag", tag: "" });
  assert.ok(tag.edges.some((e) => e.from === "se" && e.out === "yes" && e.to === "convite"));
  const volta = setConditionCheck(tag, "se", "field");
  assert.ok(volta.edges.some((e) => e.from === "se" && e.out === "v0" && e.to === "convite"));
});

test("fieldKeysIn junta os campos de perguntas e Se…, sem repetir", () => {
  const def: FlowDef = {
    v: 1,
    nodes: [
      { id: "a", type: "message", text: "x", button: null, wait: { minutes: 60 }, choices: ["a"], saveTo: "cidade" },
      { id: "b", type: "condition", check: "field", field: "cidade", values: ["x"] },
      { id: "c", type: "condition", check: "field", field: "tamanho", values: ["x"] },
    ],
    edges: [],
  };
  assert.deepEqual(fieldKeysIn(def), ["cidade", "tamanho"]);
});

test("campo → etiqueta leva v0 para yes e other para no, e avisa das saídas sem par", () => {
  const def: FlowDef = {
    v: 1,
    nodes: [
      { id: "g", type: "trigger", on: "dm", keywords: ["a"], postId: null, publicReply: null, storyReplies: false },
      { id: "se", type: "condition", check: "field", field: "x", values: ["a", "b"] },
      { id: "t1", type: "tag", add: ["a"], remove: [] },
      { id: "t2", type: "tag", add: ["b"], remove: [] },
      { id: "t3", type: "tag", add: ["c"], remove: [] },
    ],
    edges: [
      { from: "g", out: "next", to: "se" },
      { from: "se", out: "v0", to: "t1" },
      { from: "se", out: "v1", to: "t2" },
      { from: "se", out: "other", to: "t3" },
    ],
  };
  const plano = planConditionCheck(def, "se", "tag");
  assert.deepEqual(plano.lost, ["v1"]);
  assert.deepEqual(plano.def.edges.filter((e) => e.from === "se").map((e) => [e.out, e.to]), [["yes", "t1"], ["no", "t3"]]);
  const volta = planConditionCheck(plano.def, "se", "field");
  assert.deepEqual(volta.lost, []);
  assert.deepEqual(volta.def.edges.filter((e) => e.from === "se").map((e) => [e.out, e.to]), [["v0", "t1"], ["other", "t3"]]);
});

test("planRemoveBlock lista os blocos que ficam sem caminho", () => {
  const def = insertAfter(base(), "gatilho", "pergunta");
  const ligado = linkOut({ ...def, nodes: [...def.nodes, { id: "x", type: "tag", add: ["a"], remove: [] }] }, "pergunta", "v1", "x");
  const plano = planRemoveBlock(ligado, "pergunta");
  assert.deepEqual(plano.loose, ["x"]);
  assert.ok(plano.def.edges.some((e) => e.from === "gatilho" && e.to === "convite"), "a principal religa");
  assert.deepEqual(planRemoveBlock(base(), "convite").loose, []);
});

test("ligar escolhas limpa as palavras da espera", () => {
  const def: FlowDef = {
    v: 1,
    nodes: [{ id: "p", type: "message", text: "?", button: null, wait: { minutes: 60, keywords: ["sim"] } }],
    edges: [],
  };
  const com = setChoices(def, "p", ["Sim", "Não"]).nodes[0];
  assert.deepEqual(com.type === "message" && com.wait, { minutes: 60 });
});
