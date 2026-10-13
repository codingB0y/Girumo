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

test("ciclo sem condição é achado em qualquer ordem das ligações", () => {
  const nodes: FlowDef["nodes"] = [
    { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
    { id: "x", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: 60 },
    { id: "k", type: "condition", check: "follows" },
    { id: "y", type: "message", text: "y", button: null, wait: null },
  ];
  const base: FlowDef["edges"] = [
    { from: "gatilho", out: "next", to: "x" },
    { from: "k", out: "yes", to: "y" },
    { from: "y", out: "next", to: "x" },
  ];
  const clicked = { from: "x", out: "clicked", to: "k" } as const;
  const notClicked = { from: "x", out: "not_clicked", to: "y" } as const;
  for (const edges of [[...base, clicked, notClicked], [...base, notClicked, clicked]]) {
    assert.ok(codes(validateFlow({ v: 1, nodes, edges }, ok)).includes("ciclo_sem_condicao"));
  }
});

test("com botão valem os dois limites: 640 caracteres e 1000 bytes", () => {
  const def = comCampanha(RECIPES.dm_invite.build());
  const comBotao = (text: string): FlowDef => ({
    ...def,
    nodes: [def.nodes[0], { id: "direct", type: "message", text, button: "Quero", wait: { minutes: 60 } }, def.nodes[1]],
    edges: [
      { from: "gatilho", out: "next", to: "direct" },
      { from: "direct", out: "replied", to: "convite" },
    ],
  });
  // 300 emojis = 300 caracteres (< 640) mas 1200 bytes (> 1000).
  assert.ok(codes(validateFlow(comBotao("😀".repeat(300)), ok)).includes("texto_longo"));
  assert.deepEqual(validateFlow(comBotao("Oi"), ok), []);
});

test("id de bloco repetido e ligação pra bloco que não existe nunca viram fluxo válido", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const duplicado: FlowDef = { ...def, nodes: [...def.nodes, { id: "convite", type: "message", text: "x", button: null, wait: null }] };
  assert.ok(codes(validateFlow(duplicado, ok)).includes("id_duplicado"));
  const pendurada: FlowDef = { ...def, edges: [...def.edges, { from: "convite", out: "not_clicked", to: "fantasma" }] };
  assert.ok(codes(validateFlow(pendurada, ok)).includes("aresta_invalida"));
});

/** Comentário → pergunta que espera "sim" → convite com botão (a confirmação de 08/10). */
const confirma = (over: { botaoNoConvite?: string | null; textoConvite?: string } = {}): FlowDef => ({
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
    { id: "pergunta", type: "message", text: "Quer o link do grupo? Responde SIM.", button: null, wait: { minutes: 1380, keywords: ["sim", "quero"] } },
    { id: "convite", type: "invite", text: over.textoConvite ?? "Clique no botão abaixo e entre no grupo VIP.", campaignSlug: "vip", button: over.botaoNoConvite === undefined ? "Entrar no grupo VIP" : over.botaoNoConvite, remindAfterMinutes: null },
  ],
  edges: [{ from: "gatilho", out: "next", to: "pergunta" }, { from: "pergunta", out: "replied", to: "convite" }],
});

test("confirmação antes do link com botão no convite passa limpa", () => {
  assert.deepEqual(validateFlow(confirma(), ok), []);
});

test("convite com botão: rótulo vazio e texto acima de 640 caracteres são cobrados; sem botão vale a reserva do link", () => {
  assert.deepEqual(codes(validateFlow(confirma({ botaoNoConvite: "  " }), ok)), ["botao_vazio"]);
  assert.deepEqual(codes(validateFlow(confirma({ textoConvite: "a".repeat(641) }), ok)), ["texto_longo"]);
  // Com botão o link não vai no texto: 600 caracteres passam; sem botão, 900 bytes mais o link não.
  assert.deepEqual(codes(validateFlow(confirma({ textoConvite: "a".repeat(600) }), ok)), []);
  assert.deepEqual(codes(validateFlow(confirma({ botaoNoConvite: null, textoConvite: "a".repeat(900) }), ok)), ["texto_longo"]);
});

test("botão em direct que não espera resposta é cobrado: ninguém ouviria o toque", () => {
  const def = confirma();
  const comBotao: FlowDef = { ...def, nodes: def.nodes.map((n) => (n.id === "pergunta" && n.type === "message" ? { ...n, button: "Sim" } : n)) };
  // Na pergunta logo depois do comentário o botão já é recusado por outra regra; aqui só interessa a espera.
  assert.ok(!codes(validateFlow(comBotao, ok)).includes("botao_sem_espera"));
  const semEspera: FlowDef = { ...comBotao, nodes: comBotao.nodes.map((n) => (n.id === "pergunta" && n.type === "message" ? { ...n, wait: null } : n)), edges: [{ from: "gatilho", out: "next", to: "pergunta" }, { from: "pergunta", out: "next", to: "convite" }] };
  assert.ok(codes(validateFlow(semEspera, ok)).includes("botao_sem_espera"));
});

test("convite com botão logo depois do comentário é recusado: é o único direct e o Instagram recusa botão", () => {
  const def = confirma();
  const direto: FlowDef = { ...def, nodes: def.nodes.filter((n) => n.id !== "pergunta"), edges: [{ from: "gatilho", out: "next", to: "convite" }] };
  assert.deepEqual(codes(validateFlow(direto, ok)), ["botao_no_primeiro_direct"]);
});
