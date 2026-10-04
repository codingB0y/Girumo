import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES } from "./recipes";
import { checklist, grupoDaIssue, validateFlow, type ValidateContext } from "./validate";
import type { FlowDef } from "./types";

const ok: ValidateContext = { campaignSlugs: ["vip"], accountConnected: true, keywordsInUse: [] };
const comCampanha = (def: FlowDef): FlowDef => ({
  ...def,
  nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)),
});
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();

test("as receitas com campanha e conta passam limpas", () => {
  for (const id of ["comment_invite", "comment_follow_invite", "dm_invite"] as const) {
    assert.deepEqual(validateFlow(comCampanha(RECIPES[id].build()), ok), [], id);
  }
});

test("sem campanha e sem conta, a lista diz exatamente isso", () => {
  const issues = validateFlow(RECIPES.comment_invite.build(), { ...ok, accountConnected: false });
  assert.deepEqual(codes(issues), ["sem_campanha", "sem_conta"]);
  const itens = checklist(issues);
  assert.equal(itens.find((i) => i.chave === "campanha")?.ok, false);
  assert.equal(itens.find((i) => i.chave === "conta")?.ok, false);
  assert.equal(itens.find((i) => i.chave === "palavras")?.ok, true);
});

test("a receita em branco cobra palavra e convite", () => {
  const issues = validateFlow(RECIPES.blank.build(), ok);
  assert.ok(codes(issues).includes("sem_palavra"));
  assert.ok(codes(issues).includes("sem_convite"));
  assert.equal(checklist(issues).find((i) => i.chave === "campanha")?.ok, false);
});

test("grupoDaIssue devolve o grupo do checklist de cada código", () => {
  assert.equal(grupoDaIssue("sem_convite"), "campanha");
  assert.equal(grupoDaIssue("sem_palavra"), "palavras");
  assert.equal(grupoDaIssue("sem_conta"), "conta");
  assert.equal(grupoDaIssue("condicao_cedo"), "regras");
});

test("botão no primeiro direct depois de comentário é recusado", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const comBotao: FlowDef = {
    ...def,
    nodes: [def.nodes[0], { id: "direct", type: "message", text: "Oi", button: "Quero", wait: { minutes: 60 } }, def.nodes[1]],
    edges: [
      { from: "gatilho", out: "next", to: "direct" },
      { from: "direct", out: "replied", to: "convite" },
    ],
  };
  assert.ok(codes(validateFlow(comBotao, ok)).includes("botao_no_primeiro_direct"));
});

test("segundo direct sem resposta e condição cedo são recusados em fluxo de comentário", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const lembreteSemResposta: FlowDef = {
    ...def,
    nodes: [...def.nodes.map((n) => (n.id === "convite" && n.type === "invite" ? { ...n, remindAfterMinutes: 60 } : n)), { id: "lembrete", type: "invite", text: "De novo", campaignSlug: "vip", remindAfterMinutes: null }],
    edges: [...def.edges, { from: "convite", out: "not_clicked", to: "lembrete" }],
  };
  assert.ok(codes(validateFlow(lembreteSemResposta, ok)).includes("segundo_direct_sem_resposta"));

  const condicaoCedo: FlowDef = {
    ...def,
    nodes: [def.nodes[0], { id: "segue", type: "condition", check: "follows" }, def.nodes[1]],
    edges: [
      { from: "gatilho", out: "next", to: "segue" },
      { from: "segue", out: "yes", to: "convite" },
    ],
  };
  assert.ok(codes(validateFlow(condicaoCedo, ok)).includes("condicao_cedo"));
});

test("mede em bytes: emoji estoura antes dos 1000 caracteres", () => {
  const def = comCampanha(RECIPES.dm_invite.build());
  const longo: FlowDef = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, text: "😀".repeat(230) } : n)) };
  assert.ok(codes(validateFlow(longo, ok)).includes("texto_longo"));
});

test("palavra repetida (com e sem acento) e palavra já em uso em outro fluxo no ar", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const repetida: FlowDef = { ...def, nodes: def.nodes.map((n) => (n.type === "trigger" ? { ...n, keywords: ["preço", "PRECO"] } : n)) };
  assert.ok(codes(validateFlow(repetida, ok)).includes("palavra_repetida"));
  assert.ok(codes(validateFlow(def, { ...ok, keywordsInUse: [{ on: "comment", keyword: "Quero" }] })).includes("palavra_em_uso"));
  assert.deepEqual(validateFlow(def, { ...ok, keywordsInUse: [{ on: "dm", keyword: "quero" }] }), []);
});

test("bloco solto e ciclo sem condição", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const solto: FlowDef = { ...def, nodes: [...def.nodes, { id: "perdido", type: "message", text: "x", button: null, wait: null }] };
  assert.ok(codes(validateFlow(solto, ok)).includes("bloco_solto"));
  const ciclo: FlowDef = {
    ...comCampanha(RECIPES.dm_invite.build()),
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "a", type: "message", text: "a", button: null, wait: { minutes: 60 } },
      { id: "b", type: "message", text: "b", button: null, wait: { minutes: 60 } },
    ],
    edges: [
      { from: "gatilho", out: "next", to: "a" },
      { from: "a", out: "replied", to: "b" },
      { from: "b", out: "replied", to: "a" },
    ],
  };
  assert.ok(codes(validateFlow(ciclo, ok)).includes("ciclo_sem_condicao"));
});

test("id de bloco repetido e ligação pra bloco que não existe nunca viram fluxo válido", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const duplicado: FlowDef = { ...def, nodes: [...def.nodes, { id: "convite", type: "message", text: "x", button: null, wait: null }] };
  assert.ok(codes(validateFlow(duplicado, ok)).includes("id_duplicado"));
  const pendurada: FlowDef = { ...def, edges: [...def.edges, { from: "convite", out: "not_clicked", to: "fantasma" }] };
  assert.ok(codes(validateFlow(pendurada, ok)).includes("aresta_invalida"));
});
