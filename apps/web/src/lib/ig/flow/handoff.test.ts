import assert from "node:assert/strict";
import { test } from "node:test";
import { insertAfter, planRemoveBlock } from "./blocks-edit";
import { foraDaFase } from "./fase";
import { resumoDoBloco, tituloDoBloco } from "./labels";
import { RECIPES } from "./recipes";
import { parseFlowDef } from "./schema";
import { outsOf, type FlowDef, type HandoffNode } from "./types";
import { validateFlow, type ValidateContext } from "./validate";

const ctx: ValidateContext = { campaignSlugs: ["vip"], accountConnected: true, keywordsInUse: [] };
const codes = (d: FlowDef) => validateFlow(d, ctx).map((i) => i.code).sort();

/** gatilho DM → pergunta; a escolha leva ao convite e "outra resposta" passa pra loja. */
function comLoja(handoff: Partial<HandoffNode> = {}): FlowDef {
  return {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["oi"], postId: null, publicReply: null, storyReplies: false },
      { id: "q", type: "message", text: "Qual?", button: null, wait: { minutes: 60 }, choices: ["a"] },
      { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null },
      { id: "loja", type: "handoff", text: null, ...handoff },
    ],
    edges: [{ from: "gatilho", out: "next", to: "q" }, { from: "q", out: "v0", to: "convite" }, { from: "q", out: "other", to: "loja" }],
  };
}

test("Passar pra loja não tem saída; vale sem texto e com texto", () => {
  assert.deepEqual(outsOf({ id: "loja", type: "handoff", text: null }), []);
  assert.deepEqual(codes(comLoja()), []);
  assert.deepEqual(codes(comLoja({ text: "Já já alguém da loja te responde por aqui." })), []);
  assert.equal(parseFlowDef(comLoja({ text: "Oi" })).ok, true);
  assert.deepEqual(foraDaFase(comLoja()), []);
});

test("texto em branco ou longo demais é recusado; ligação de saída também", () => {
  assert.deepEqual(codes(comLoja({ text: "   " })), ["texto_vazio"]);
  assert.deepEqual(codes(comLoja({ text: "a".repeat(1001) })), ["texto_longo"]);
  const ligado: FlowDef = { ...comLoja(), edges: [...comLoja().edges, { from: "loja", out: "next", to: "convite" }] };
  assert.deepEqual(codes(ligado), ["aresta_invalida"]);
});

test("rótulo e resumo do bloco", () => {
  const sem: HandoffNode = { id: "loja", type: "handoff", text: null };
  assert.equal(tituloDoBloco(sem), "Passar pra loja");
  assert.match(resumoDoBloco(sem), /sem mensagem/);
  assert.equal(resumoDoBloco({ ...sem, text: "Já já" }), "Já já");
});

test("a receita Comentou, escolhe o grupo manda os dois 'outra resposta' pra um único Passar pra loja", () => {
  const def = RECIPES.comment_choose_group.build();
  const loja = def.nodes.filter((n) => n.type === "handoff");
  assert.equal(loja.length, 1);
  const para = def.edges.filter((e) => e.out === "other").map((e) => [e.from, e.to]);
  assert.deepEqual(para, [["pergunta", loja[0].id], ["idade", loja[0].id]]);
  const publicavel = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
  assert.deepEqual(validateFlow(publicavel, ctx), []);
  assert.deepEqual(foraDaFase(publicavel), []);
  assert.equal(parseFlowDef(publicavel).ok, true);
});

test("inserir Passar pra loja só vale no fim do caminho; apagar solta quem chegava nele", () => {
  const base = RECIPES.dm_invite.build();
  assert.equal(insertAfter(base, "gatilho", "loja"), base, "com o convite depois, não insere (soltaria o resto)");
  const fim: FlowDef = { ...base, edges: [] };
  const novo = insertAfter(fim, "gatilho", "loja");
  assert.ok(novo.nodes.some((n) => n.type === "handoff"));
  assert.equal(novo.edges.some((e) => e.from === "gatilho" && e.out === "next"), true);
  const { def } = planRemoveBlock(comLoja(), "loja");
  assert.equal(def.edges.some((e) => e.to === "loja"), false);
});
