import test from "node:test";
import assert from "node:assert/strict";
import { alternativesOf, choiceFromPayload, matchChoice, matchFieldValue } from "./choices";
import { moveChoice, removeChoice } from "./choices-edit";
import { fieldLabel, isValidFieldKey, normalizeTag, toFieldKey } from "./names";
import { RECIPES } from "./recipes";
import { MAIN_OUTS, choiceIndex, choiceOut, outsOf, type FlowDef, type FlowNode } from "./types";
import { linearize } from "./linearize";
import { layout } from "./layout";
import { resumoDoBloco, rotuloDaSaida, tituloDoBloco } from "./labels";

test("alternativas: vírgula separa, espaço e vazias saem", () => {
  assert.deepEqual(alternativesOf("Sim, quero"), ["Sim", "quero"]);
  assert.deepEqual(alternativesOf(" , Oi ,, "), ["Oi"]);
  assert.deepEqual(alternativesOf("Até 4 anos"), ["Até 4 anos"]);
});

test("matchChoice: alternativas de escolhas diferentes no mesmo texto são ambíguas (null); da mesma escolha, vale", () => {
  const escolhas = ["Sim, quero", "Não"];
  for (const texto of ["não quero", "quero não", "sim, não sei"]) assert.equal(matchChoice(texto, escolhas), null, texto);
  assert.equal(matchChoice("sim", escolhas), 0);
  assert.equal(matchChoice("não", escolhas), 1);
  assert.equal(matchChoice("Sim, quero", escolhas), 0);
  assert.equal(matchChoice("sim quero", escolhas), 0);
});

test("matchChoice: sem acento, palavra inteira, qualquer alternativa, a mais longa ganha", () => {
  const escolhas = ["Sim, quero", "Não"];
  assert.equal(matchChoice("QUERO!", escolhas), 0);
  assert.equal(matchChoice("sim", escolhas), 0);
  assert.equal(matchChoice("nao, obrigada", escolhas), 1);
  assert.equal(matchChoice("o que é isso?", escolhas), null);
  assert.equal(matchChoice("simples", escolhas), null, "palavra inteira");
  assert.equal(matchChoice("5 a 8 anos", ["5 a 8", "5"]), 0, "a mais longa vence");
  assert.equal(matchChoice("qualquer coisa", []), null);
});

test("choiceFromPayload lê <run>:<bloco>:<i> só do run e do bloco certos", () => {
  assert.equal(choiceFromPayload("r1:idade:2", "r1", "idade"), 2);
  assert.equal(choiceFromPayload("r1:idade:12", "r1", "idade"), 12);
  assert.equal(choiceFromPayload("r1:idade:13", "r1", "idade"), null);
  assert.equal(choiceFromPayload("r2:idade:1", "r1", "idade"), null);
  assert.equal(choiceFromPayload("r1:outro:1", "r1", "idade"), null);
  assert.equal(choiceFromPayload("r1:idade:x", "r1", "idade"), null);
  assert.equal(choiceFromPayload("r1:idade:", "r1", "idade"), null);
});

test("matchFieldValue compara o valor inteiro", () => {
  assert.equal(matchFieldValue("goiania", ["São Paulo", "Goiânia"]), 1);
  assert.equal(matchFieldValue("Goiânia centro", ["Goiânia"]), null);
  assert.equal(matchFieldValue("", ["Goiânia"]), null);
});

test("saídas v<i>: ida e volta", () => {
  assert.equal(choiceOut(3), "v3");
  assert.equal(choiceIndex("v12"), 12);
  assert.equal(choiceIndex("v13" as never), null);
  assert.equal(choiceIndex("other"), null);
  assert.equal(choiceIndex("next"), null);
});

test("normalizeTag e nomes de campo", () => {
  assert.equal(normalizeTag("Quer Infantil"), "quer-infantil");
  assert.equal(normalizeTag("  Preço  alto!! "), "preco-alto");
  assert.equal(normalizeTag("a".repeat(60)), "a".repeat(40));
  assert.equal(normalizeTag("!!!"), null);
  assert.equal(toFieldKey("Tamanho do pé"), "tamanho_do_pe");
  assert.equal(toFieldKey("1 cor"), "cor");
  assert.equal(toFieldKey("???"), null);
  assert.equal(isValidFieldKey("tamanho"), true);
  assert.equal(isValidFieldKey("Tamanho"), false);
  assert.equal(isValidFieldKey("1a"), false);
  assert.equal(fieldLabel("tamanho_do_pe"), "Tamanho do pe");
  assert.equal(fieldLabel("tamanho"), "Tamanho");
});

const pergunta: FlowDef = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "dm", keywords: ["oi"], postId: null, publicReply: null, storyReplies: false },
    { id: "q", type: "message", text: "Qual?", button: null, wait: { minutes: 60 }, choices: ["a", "b", "c"] },
    { id: "ia", type: "invite", text: "A", campaignSlug: "x", remindAfterMinutes: null },
    { id: "ib", type: "invite", text: "B", campaignSlug: "x", remindAfterMinutes: null },
    { id: "ic", type: "invite", text: "C", campaignSlug: "x", remindAfterMinutes: null },
    { id: "fim", type: "invite", text: "Z", campaignSlug: "x", remindAfterMinutes: null },
  ],
  edges: [
    { from: "gatilho", out: "next", to: "q" },
    { from: "q", out: "v0", to: "ia" },
    { from: "q", out: "v1", to: "ib" },
    { from: "q", out: "v2", to: "ic" },
    { from: "q", out: "other", to: "fim" },
  ],
};
const ligacoes = (d: FlowDef) => d.edges.filter((e) => e.from === "q").map((e) => `${e.out}>${e.to}`).sort();

test("apagar a escolha apaga a ligação dela e renumera as seguintes", () => {
  const d = removeChoice(pergunta, "q", 1);
  assert.deepEqual((d.nodes[1] as { choices: string[] }).choices, ["a", "c"]);
  assert.deepEqual(ligacoes(d), ["other>fim", "v0>ia", "v1>ic"]);
  assert.deepEqual(pergunta.nodes[1], { ...pergunta.nodes[1] }, "não muta");
  assert.equal((pergunta.nodes[1] as { choices: string[] }).choices.length, 3);
});

test("apagar a última escolha leva o other junto", () => {
  const um: FlowDef = { ...pergunta, nodes: pergunta.nodes.map((n) => (n.id === "q" ? { ...n, choices: ["a"] } : n)), edges: pergunta.edges.filter((e) => e.out !== "v1" && e.out !== "v2") };
  assert.deepEqual(ligacoes(removeChoice(um, "q", 0)), []);
});

test("mover a escolha leva a ligação junto", () => {
  const sobe = moveChoice(pergunta, "q", 2, 0);
  assert.deepEqual((sobe.nodes[1] as { choices: string[] }).choices, ["c", "a", "b"]);
  assert.deepEqual(ligacoes(sobe), ["other>fim", "v0>ic", "v1>ia", "v2>ib"]);
  const desce = moveChoice(pergunta, "q", 0, 2);
  assert.deepEqual((desce.nodes[1] as { choices: string[] }).choices, ["b", "c", "a"]);
  assert.deepEqual(ligacoes(desce), ["other>fim", "v0>ib", "v1>ic", "v2>ia"]);
  assert.equal(moveChoice(pergunta, "q", 0, 9), pergunta);
});

test("renumerar também vale para os valores do Se… campo", () => {
  const def: FlowDef = {
    v: 1,
    nodes: [
      { id: "g", type: "trigger", on: "dm", keywords: ["oi"], postId: null, publicReply: null, storyReplies: false },
      { id: "c", type: "condition", check: "field", field: "cidade", values: ["x", "y"] },
      { id: "i1", type: "invite", text: "1", campaignSlug: null, remindAfterMinutes: null },
      { id: "i2", type: "invite", text: "2", campaignSlug: null, remindAfterMinutes: null },
    ],
    edges: [{ from: "g", out: "next", to: "c" }, { from: "c", out: "v0", to: "i1" }, { from: "c", out: "v1", to: "i2" }],
  };
  const d = removeChoice(def, "c", 0);
  assert.deepEqual(d.edges.filter((e) => e.from === "c"), [{ from: "c", out: "v0", to: "i2" }]);
});

test("outsOf dos blocos novos", () => {
  const q = pergunta.nodes[1];
  assert.deepEqual(outsOf(q), ["v0", "v1", "v2", "other", "timeout"]);
  assert.deepEqual(outsOf({ ...q, choices: [] } as FlowNode), ["replied", "timeout"]);
  assert.deepEqual(outsOf({ id: "t", type: "tag", add: ["a"], remove: [] }), ["next"]);
  assert.deepEqual(outsOf({ id: "c", type: "condition", check: "field", field: "x", values: ["a", "b"] }), ["v0", "v1", "other"]);
  assert.deepEqual(outsOf({ id: "c", type: "condition", check: "tag", tag: "x" }), ["yes", "no"]);
  assert.deepEqual(outsOf({ id: "c", type: "condition", check: "clicked" }), ["yes", "no"]);
  assert.deepEqual(outsOf({ id: "c", type: "condition", check: "follows" }), ["yes", "no"]);
  assert.ok(MAIN_OUTS.includes("v0"));
});

test("trilha: v0 é o caminho principal, as outras saídas viram desvios; o Mapa desenha uma seta por saída", () => {
  const trilha = linearize(pergunta);
  assert.deepEqual(trilha.map((p) => p.node.id), ["gatilho", "q", "ia"]);
  assert.deepEqual(trilha[1].ramos.map((r) => r.out), ["v1", "v2", "other", "timeout"]);
  const l = layout(pergunta);
  assert.equal(l.edges.length, pergunta.edges.length);
});

test("rótulos das saídas e dos blocos novos", () => {
  const q = pergunta.nodes[1];
  assert.equal(rotuloDaSaida("v1", q), "b");
  assert.equal(rotuloDaSaida("v5", q), "Escolha 6");
  assert.equal(rotuloDaSaida("other", q), "Outra resposta");
  assert.equal(tituloDoBloco({ id: "t", type: "tag", add: [], remove: [] }), "Etiqueta");
  assert.equal(resumoDoBloco({ id: "t", type: "tag", add: ["a"], remove: ["b"] }), "Põe: a · Tira: b");
  const campo: FlowNode = { id: "c", type: "condition", check: "field", field: "tamanho", values: ["P", "M"] };
  assert.equal(tituloDoBloco(campo), "Se Tamanho for…");
  assert.equal(rotuloDaSaida("v1", campo), "M");
  assert.equal(rotuloDaSaida("yes", { id: "c", type: "condition", check: "tag", tag: "x" }), "Tem a etiqueta");
});

test("a receita Comentou, escolhe o grupo tem a forma do roteiro", () => {
  const def = RECIPES.comment_choose_group.build();
  const p = def.nodes.find((n) => n.id === "pergunta");
  assert.ok(p?.type === "message" && p.button === null && p.choices?.[0] === "Sim, quero" && p.wait);
  const idade = def.nodes.find((n) => n.id === "idade");
  assert.ok(idade?.type === "message" && idade.choices?.length === 3 && idade.saveTo === "tamanho");
  assert.equal(def.nodes.filter((n) => n.type === "invite").length, 3);
});
