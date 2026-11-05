import test from "node:test";
import assert from "node:assert/strict";
import { canAddFollowGate, hasFollowGate, setFollowGate } from "./edit";
import { setChoices } from "./choices-edit";
import { foraDaFase } from "./fase";
import { RECIPES } from "./recipes";
import type { FlowDef, FlowNode } from "./types";
import { validateFlow, type ValidateContext } from "./validate";

const ctx: ValidateContext = { campaignSlugs: ["vip"], accountConnected: true, keywordsInUse: [] };
const codes = (d: FlowDef) => validateFlow(d, ctx).map((i) => i.code).sort();
const gatilho: FlowNode = { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false };
const convite = (id: string): FlowNode => ({ id, type: "invite", text: "L", campaignSlug: "vip", remindAfterMinutes: null });

test("1. o motor roda os blocos novos: foraDaFase não os trava mais (follows e clicked continuam)", () => {
  const def = RECIPES.comment_choose_group.build();
  assert.deepEqual(foraDaFase(def), []);
  const tag: FlowDef = { ...def, nodes: [...RECIPES.comment_invite.build().nodes, { id: "t", type: "tag", add: ["a"], remove: [] }], edges: [] };
  assert.deepEqual(foraDaFase(tag), []);
  for (const c of [{ check: "field" as const, field: "x", values: ["a"] }, { check: "tag" as const, tag: "x" }]) {
    assert.equal(foraDaFase({ v: 1, nodes: [gatilho, { id: "c", type: "condition", ...c }], edges: [] }).length, 0);
  }
  assert.equal(foraDaFase({ v: 1, nodes: [gatilho, { id: "c", type: "condition", check: "follows" }], edges: [] }).length, 1);
});

test("2. Se campo/etiqueta logo depois do comentário não contam como primeiro direct", () => {
  const def: FlowDef = {
    v: 1,
    nodes: [gatilho, { id: "c", type: "condition", check: "tag", tag: "x" }, { id: "m", type: "message", text: "Oi", button: "Toque", wait: { minutes: 5 } }, convite("i")],
    edges: [{ from: "gatilho", out: "next", to: "c" }, { from: "c", out: "yes", to: "m" }, { from: "m", out: "replied", to: "i" }],
  };
  assert.ok(codes(def).includes("botao_no_primeiro_direct"));
});

test("3. v*/other de um Se campo são ramos comuns: dois directs seguem proibidos", () => {
  const def: FlowDef = {
    v: 1,
    nodes: [gatilho, { id: "c", type: "condition", check: "field", field: "x", values: ["a", "b"] }, convite("i1"), convite("i2")],
    edges: [{ from: "gatilho", out: "next", to: "c" }, { from: "c", out: "v0", to: "i1" }, { from: "c", out: "v1", to: "i2" }],
  };
  assert.ok(codes(def).includes("segundo_direct_sem_resposta"));
});

test("4. Se campo/etiqueta nunca é confundido com o portão de seguir", () => {
  const base = RECIPES.comment_invite.build();
  const comTag: FlowDef = { ...base, nodes: [...base.nodes, { id: "c", type: "condition", check: "tag", tag: "x" }] };
  assert.equal(hasFollowGate(comTag), false);
  assert.equal(canAddFollowGate(comTag), true);
  assert.equal(setFollowGate(comTag, false), comTag);
  const ligado = setFollowGate(comTag, true);
  assert.ok(ligado.nodes.some((n) => n.id === "c"));
  assert.equal(hasFollowGate(ligado), true);
  assert.ok(setFollowGate(ligado, false).nodes.some((n) => n.id === "c"));
});

test("5. ordenar mantém v0…v12 em ordem numérica e other depois", () => {
  const base = RECIPES.comment_invite.build();
  const idade: FlowNode = { id: "idade", type: "message", text: "?", button: null, wait: { minutes: 5 }, choices: Array.from({ length: 11 }, (_, i) => `e${i}`) };
  const solta = (out: "other" | "v10" | "v2" | "v1") => ({ from: "idade", out, to: "convite" });
  const def: FlowDef = { ...base, nodes: [...base.nodes, idade], edges: [...base.edges, solta("other"), solta("v10"), solta("v2"), solta("v1")] };
  const saidas = setFollowGate(def, true).edges.filter((e) => e.from === "idade").map((e) => e.out);
  assert.deepEqual(saidas, ["v1", "v2", "v10", "other"]);
});

test("6. etiqueta repetida na mesma lista, ou em pôr e tirar, é etiqueta_invalida", () => {
  const mk = (add: string[], remove: string[]): FlowDef => ({ v: 1, nodes: [gatilho, { id: "t", type: "tag", add, remove }, convite("i")], edges: [{ from: "gatilho", out: "next", to: "t" }, { from: "t", out: "next", to: "i" }] });
  assert.deepEqual(codes(mk(["a", "b"], ["c"])), []);
  assert.ok(codes(mk(["a", "a"], [])).includes("etiqueta_invalida"));
  assert.ok(codes(mk(["a"], ["a"])).includes("etiqueta_invalida"));
});

test("7. ligar escolhas move replied para v0 e tira o botão; desligar volta", () => {
  const def = RECIPES.comment_confirm_invite.build();
  const com = setChoices(def, "pergunta", ["Sim, quero", "Não"]);
  const p = com.nodes.find((n) => n.id === "pergunta");
  assert.ok(p?.type === "message" && p.button === null && p.choices?.length === 2);
  assert.deepEqual(com.edges.filter((e) => e.from === "pergunta").map((e) => e.out), ["v0"]);
  const sem = setChoices({ ...com, edges: [...com.edges, { from: "pergunta", out: "v1", to: "convite" }, { from: "pergunta", out: "other", to: "convite" }] }, "pergunta", []);
  assert.deepEqual(sem.edges.filter((e) => e.from === "pergunta").map((e) => e.out), ["replied"]);
  assert.equal(sem.edges.find((e) => e.out === "replied")?.to, "convite");
  const cortou = setChoices({ ...com, edges: [...com.edges, { from: "pergunta", out: "v1", to: "convite" }] }, "pergunta", ["Só uma"]);
  assert.deepEqual(cortou.edges.filter((e) => e.from === "pergunta").map((e) => e.out), ["v0"]);
});
