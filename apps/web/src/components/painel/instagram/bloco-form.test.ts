import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RECIPES } from "@/lib/ig/flow/recipes";
import type { FlowDef, FlowNode } from "@/lib/ig/flow/types";
import { BlocoForm } from "./bloco-form";
import { Previa } from "./previa";

const noop = () => {};
const render = (node: FlowNode, primeiro = false) =>
  renderToStaticMarkup(createElement(BlocoForm, { node, primeiroDepoisDoComentario: primeiro, def: { v: 1, nodes: [node], edges: [] }, confirmar: async () => true, campanhas: [], issues: [], chaves: ["cidade"], aoMudar: noop, editarDef: noop }));

const pergunta: FlowNode = { id: "p", type: "message", text: "Qual tamanho?", button: null, wait: { minutes: 1380 }, choices: ["P", "M, medio"], saveTo: "tamanho" };

test("Pergunta com escolhas mostra a lista, o contador de 20 e esconde palavras e botão", () => {
  const h = render(pergunta);
  assert.match(h, /aria-label="Escolha 1"/);
  assert.match(h, /aria-label="Escolha 2"/);
  assert.match(h, /8\/20/);
  assert.match(h, /separe por vírgula|Separe por vírgula/);
  assert.doesNotMatch(h, /Adicionar resposta/);
  assert.doesNotMatch(h, /Texto do botão/);
  assert.match(h, /Tamanho/, "guardar em mostra o rótulo, não a chave");
});

test("Pergunta em texto livre mostra palavras e não mostra a lista de escolhas", () => {
  const h = render({ ...pergunta, choices: undefined });
  assert.match(h, /Adicionar resposta/);
  assert.doesNotMatch(h, /aria-label="Escolha 1"/);
});

test("no primeiro direct depois de comentário as escolhas avisam que valem só digitando", () => {
  assert.match(render(pergunta, true), /valem só digitando/);
  assert.doesNotMatch(render(pergunta, false), /valem só digitando/);
});

test("Se… desativa o que ainda não roda e Etiqueta mostra os chips", () => {
  const se = render({ id: "s", type: "condition", check: "field", field: "cidade", values: ["Goiânia"] });
  assert.match(se, /disabled=""[^>]*>Segue a loja \(chega na fase 3\)/);
  assert.match(se, /aria-label="Valor 1"/);
  const tag = render({ id: "t", type: "tag", add: ["quer-infantil"], remove: [] });
  assert.match(tag, /Tirar a etiqueta quer-infantil/);
});

test("a prévia mostra as escolhas como respostas rápidas, menos no 1º direct depois de comentário", () => {
  const def: FlowDef = RECIPES.dm_invite.build();
  const comPergunta: FlowDef = { ...def, nodes: [def.nodes[0], pergunta, ...def.nodes.slice(1)], edges: [{ from: def.nodes[0].id, out: "next", to: "p" }] };
  const h = renderToStaticMarkup(createElement(Previa, { def: comPergunta, handle: null }));
  assert.match(h, /Respostas rápidas/);
  const comentario = RECIPES.comment_invite.build();
  const t = comentario.nodes[0];
  const h2 = renderToStaticMarkup(createElement(Previa, { def: { ...comentario, nodes: [t, pergunta], edges: [{ from: t.id, out: "next", to: "p" }] }, handle: null }));
  assert.doesNotMatch(h2, /Respostas rápidas/);
});

test("Passar pra loja mostra o texto opcional com a dica e a prévia leva a marca", () => {
  const sem: FlowNode = { id: "loja", type: "handoff", text: null };
  const h = render(sem);
  assert.match(h, /aria-label="Mensagem ao passar pra loja: Passar pra loja \(loja\)"/);
  assert.match(h, /Já já alguém da loja te responde por aqui\./);
  assert.match(h, /Aguardando você/);
  const dm = RECIPES.dm_invite.build();
  const t = dm.nodes[0];
  const def = (text: string | null): FlowDef => ({ ...dm, nodes: [t, { id: "loja", type: "handoff", text }], edges: [{ from: t.id, out: "next", to: "loja" }] });
  const com = renderToStaticMarkup(createElement(Previa, { def: def("Oi, já já!"), handle: null }));
  assert.match(com, /Oi, já já!/);
  assert.match(com, /Passa pra loja/);
  const nada = renderToStaticMarkup(createElement(Previa, { def: def(null), handle: null }));
  assert.doesNotMatch(nada, /sem texto ainda/);
  assert.match(nada, /Passa pra loja/);
});