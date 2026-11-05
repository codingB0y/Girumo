import test from "node:test";
import assert from "node:assert/strict";
import { foraDaFase } from "./fase";
import { RECIPES } from "./recipes";
import { parseFlowDef } from "./schema";
import type { FlowDef, FlowNode } from "./types";
import { grupoDaIssue, validateFlow, type ValidateContext } from "./validate";

const ctx: ValidateContext = { campaignSlugs: ["vip"], accountConnected: true, keywordsInUse: [] };
const codes = (d: FlowDef) => validateFlow(d, ctx).map((i) => i.code).sort();
const comCampanha = (def: FlowDef): FlowDef => ({ ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) });

/** gatilho DM → pergunta → convite em v0; troca a pergunta para testar uma regra. */
function comPergunta(patch: Partial<Extract<FlowNode, { type: "message" }>>): FlowDef {
  return {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["oi"], postId: null, publicReply: null, storyReplies: false },
      { id: "q", type: "message", text: "Qual?", button: null, wait: { minutes: 60 }, choices: ["a", "b"], ...patch },
      { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "q" }, { from: "q", out: "v0", to: "convite" }],
  };
}

test("a receita Comentou, escolhe o grupo valida limpa e o motor já a publica (foraDaFase vazio)", () => {
  const def = comCampanha(RECIPES.comment_choose_group.build());
  assert.deepEqual(validateFlow(def, ctx), []);
  assert.deepEqual(foraDaFase(def), []);
  assert.equal(parseFlowDef(def).ok, true);
});

test("escolhas válidas passam; as de um fluxo antigo continuam passando", () => {
  assert.deepEqual(codes(comPergunta({})), []);
  assert.deepEqual(codes(comPergunta({ choices: ["Sim, quero", "Não"], saveTo: "resposta" })), []);
  assert.deepEqual(codes(comCampanha(RECIPES.comment_confirm_invite.build())), []);
});

test("escolhas_invalidas: vazia, repetida, longa, demais, alternativa repetida, com botão", () => {
  assert.deepEqual(codes(comPergunta({ choices: ["a", " "] })), ["escolhas_invalidas"]);
  assert.deepEqual(codes(comPergunta({ choices: ["Sim", "sim"] })), ["escolhas_invalidas"]);
  assert.deepEqual(codes(comPergunta({ choices: ["x".repeat(21)] })), ["escolhas_invalidas"]);
  assert.deepEqual(codes(comPergunta({ choices: Array.from({ length: 14 }, (_, i) => `e${i}`) })), ["escolhas_invalidas"]);
  assert.deepEqual(codes(comPergunta({ choices: ["Sim, quero", "Quero"] })), ["escolhas_invalidas"]);
  assert.deepEqual(codes(comPergunta({ button: "Toque" })), ["escolhas_invalidas"]);
});

test("escolhas sem espera = botao_sem_espera; saveTo fora do formato = campo_invalido", () => {
  assert.deepEqual(codes(comPergunta({ wait: null })), ["botao_sem_espera"]);
  assert.deepEqual(codes(comPergunta({ saveTo: "Tamanho do pé" })), ["campo_invalido"]);
  assert.deepEqual(codes(comPergunta({ saveTo: null })), []);
});

test("aresta para saída que não existe mais é erro", () => {
  const def = comPergunta({ choices: ["só uma"] });
  const comSobra: FlowDef = { ...def, edges: [...def.edges, { from: "q", out: "v1", to: "convite" }] };
  assert.ok(codes(comSobra).includes("aresta_invalida"));
  const semEscolhas: FlowDef = { ...def, nodes: def.nodes.map((n) => (n.id === "q" ? { ...n, choices: undefined } : n)) };
  assert.ok(codes(semEscolhas).includes("aresta_invalida"), "v0 sem escolhas");
});

test("escolhas no primeiro direct depois de comentário são válidas (botão não)", () => {
  const def = comCampanha(RECIPES.comment_choose_group.build());
  assert.equal(codes(def).includes("botao_no_primeiro_direct"), false);
  const comBotao: FlowDef = { ...def, nodes: def.nodes.map((n) => (n.id === "pergunta" && n.type === "message" ? { ...n, button: "Toque" } : n)) };
  assert.ok(codes(comBotao).includes("botao_no_primeiro_direct"));
});

test("depois de comentário, o que vem depois de uma escolha conta como resposta (sem segundo_direct_sem_resposta)", () => {
  const def = comCampanha(RECIPES.comment_choose_group.build());
  assert.equal(codes(def).includes("segundo_direct_sem_resposta"), false);
});

test("Etiqueta: sem nada, formato inválido; vale em qualquer lugar, até logo depois do comentário", () => {
  const base = comCampanha(RECIPES.comment_invite.build());
  const comTag = (tag: Extract<FlowNode, { type: "tag" }>): FlowDef => ({
    ...base,
    nodes: [...base.nodes, tag],
    edges: [{ from: "gatilho", out: "next", to: "t" }, { from: "t", out: "next", to: "convite" }],
  });
  assert.deepEqual(codes(comTag({ id: "t", type: "tag", add: ["quer-infantil"], remove: ["frio"] })), []);
  assert.deepEqual(codes(comTag({ id: "t", type: "tag", add: [], remove: [] })), ["etiqueta_invalida"]);
  assert.deepEqual(codes(comTag({ id: "t", type: "tag", add: ["Quer Infantil"], remove: [] })), ["etiqueta_invalida"]);
});

test("Se…: campo sem valores, tag sem etiqueta, formato; valores repetidos", () => {
  const base = comCampanha(RECIPES.dm_invite.build());
  const comCond = (cond: Extract<FlowNode, { type: "condition" }>): FlowDef => ({
    ...base,
    nodes: [...base.nodes, cond],
    edges: [{ from: "gatilho", out: "next", to: "c" }, { from: "c", out: cond.check === "field" ? "v0" : "yes", to: "convite" }],
  });
  assert.deepEqual(codes(comCond({ id: "c", type: "condition", check: "field", field: "cidade", values: ["Goiânia"] })), []);
  assert.deepEqual(codes(comCond({ id: "c", type: "condition", check: "field", field: "cidade", values: [] })), ["aresta_invalida", "condicao_incompleta"]);
  assert.deepEqual(codes(comCond({ id: "c", type: "condition", check: "field", values: ["a"] })), ["condicao_incompleta"]);
  assert.deepEqual(codes(comCond({ id: "c", type: "condition", check: "field", field: "Cidade", values: ["a"] })), ["campo_invalido"]);
  assert.deepEqual(codes(comCond({ id: "c", type: "condition", check: "field", field: "cidade", values: ["a", "A"] })), ["escolhas_invalidas"]);
  assert.deepEqual(codes(comCond({ id: "c", type: "condition", check: "tag" })), ["condicao_incompleta"]);
  assert.deepEqual(codes(comCond({ id: "c", type: "condition", check: "tag", tag: "Nao Valida" })), ["etiqueta_invalida"]);
  assert.deepEqual(codes(comCond({ id: "c", type: "condition", check: "tag", tag: "quer-infantil" })), []);
});

test("fase_seguinte: follows, clicked e timeout; field e tag rodam", () => {
  const base = comCampanha(RECIPES.dm_invite.build());
  const cond = (c: Extract<FlowNode, { type: "condition" }>): FlowDef => ({ ...base, nodes: [...base.nodes, c] });
  assert.equal(foraDaFase(cond({ id: "c", type: "condition", check: "follows" })).length, 1);
  assert.equal(foraDaFase(cond({ id: "c", type: "condition", check: "clicked" })).length, 1);
  assert.equal(foraDaFase(cond({ id: "c", type: "condition", check: "tag", tag: "x" })).length, 0);
  assert.equal(foraDaFase(cond({ id: "c", type: "condition", check: "field", field: "x", values: ["a"] })).length, 0);
  const comTimeout: FlowDef = { ...comPergunta({}), edges: [...comPergunta({}).edges, { from: "q", out: "timeout", to: "convite" }] };
  assert.deepEqual(foraDaFase(comTimeout).map((i) => i.nodeId), ["q"]);
});

test("todo código novo tem grupo no checklist", () => {
  for (const c of ["escolhas_invalidas", "campo_invalido", "etiqueta_invalida", "condicao_incompleta"] as const) assert.ok(grupoDaIssue(c));
});

test("o esquema aceita os campos novos e recusa campo desconhecido", () => {
  const def = comPergunta({ saveTo: "tamanho" });
  assert.equal(parseFlowDef({ ...def, nodes: [...def.nodes, { id: "t", type: "tag", add: ["a"], remove: [] }, { id: "c", type: "condition", check: "field", field: "x", values: ["a"] }] }).ok, true);
  assert.equal(parseFlowDef({ ...def, edges: [...def.edges, { from: "q", out: "v12", to: "convite" }, { from: "q", out: "other", to: "convite" }] }).ok, true);
  assert.equal(parseFlowDef({ ...def, edges: [...def.edges, { from: "q", out: "v13", to: "convite" }] }).ok, false);
  assert.equal(parseFlowDef({ ...def, nodes: [def.nodes[0], { ...def.nodes[1], extra: 1 }, def.nodes[2]] }).ok, false);
  assert.equal(parseFlowDef({ ...def, nodes: [...def.nodes, { id: "t", type: "tag", add: [] }] }).ok, false);
});
