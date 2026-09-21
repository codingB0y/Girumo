import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunnelTemplate, type FunnelTemplate } from "@/lib/funnels/templates";
import { planFunnel, type FunnelContext, type StepDraft } from "./funnel-plan";
import { FunnelStepCard, type FunnelStepCardProps } from "./funnel-step-card";

const live = getFunnelTemplate("live") as FunnelTemplate;
const ctx: FunnelContext = {
  anchor: new Date(2026, 9, 10, 20, 0),
  now: new Date(2026, 9, 1, 12, 0),
  loja: "Mega Stock",
  nicho: "moda feminina",
  link: "https://app.girumo.com.br/r/saldao",
};
const drafts: Record<string, StepDraft> = {
  "previa-da-grade": { fields: { "peça": "vestido midi", "preço": "R$ 39,90", grade: "P ao GG", quantidade: "120" } },
};
const noop = () => {};

type Over = Partial<FunnelStepCardProps> & { index?: number; c?: FunnelContext; d?: Record<string, StepDraft> };

function buildProps(over: Over = {}): FunnelStepCardProps {
  const { index = 0, c = ctx, d = drafts, ...rest } = over;
  const plan = planFunnel(live, d, c)[index];
  return {
    plan, draft: d[plan.step.id] ?? {}, open: false, grupoNome: "Saldão", uploading: false, locked: false,
    onToggleOpen: noop, onIncludedChange: noop, onFieldChange: noop, onMentionToggle: noop,
    onTextChange: noop, onPhotoPick: noop, onPhotoRemove: noop, ...rest,
  };
}

function card(over: Over = {}) {
  return renderToStaticMarkup(createElement(FunnelStepCard, buildProps(over)));
}

test("fechado: mostra data e nome, esconde os campos", () => {
  const html = card();
  assert.match(html, /sex 09\/10 · 19:00/);
  assert.match(html, /Prévia da grade/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /id="funil-etapa-previa-da-grade"/);
});

test("aberto: a prévia reflete os campos preenchidos", () => {
  const html = card({ open: true });
  assert.match(html, /id="funil-etapa-previa-da-grade"/);
  assert.match(html, /Amanhã 20h tem live da Mega Stock! Prévia da grade de moda feminina: vestido midi/);
});

test("campo herdado aparece como placeholder com a dica", () => {
  // Valor diferente do EXEMPLO ("vestido midi"): senão o placeholder bate sem herança nenhuma.
  const d = { "previa-da-grade": { fields: { ...drafts["previa-da-grade"].fields, "peça": "saia plissada" } } };
  const html = card({ open: true, index: 2, d });
  assert.match(html, /placeholder="saia plissada"/);
  assert.match(html, /igual à etapa anterior/);
});

test("bloqueado: diz o que falta", () => {
  const html = card({ c: { ...ctx, loja: "" } });
  assert.match(html, /Falta: Sua loja/);
});

test("passado: checkbox desabilitado e aviso", () => {
  const html = card({ c: { ...ctx, now: new Date(2026, 9, 10, 23, 0) } });
  assert.match(html, /Já passou/);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled=""|<input[^>]*disabled=""[^>]*type="checkbox"/);
});

test("relâmpago tem o chip EU QUERO", () => {
  assert.match(card({ index: 2 }), /relâmpago · EU QUERO/);
});

test("texto editado mostra o aviso e troca o botão", () => {
  const d = { ...drafts, "previa-da-grade": { ...drafts["previa-da-grade"], customText: "Oi" } };
  const html = card({ open: true, d });
  assert.match(html, /Texto editado à mão: os campos só preenchem as \{chaves\} que ficaram no texto\./);
  assert.match(html, /Voltar ao roteiro/);
});

test("aberto com campo vazio: a prévia marca o que falta em vez de ficar muda", () => {
  const html = card({ open: true, d: {} });
  assert.match(html, /Prévia da grade de moda feminina: \[peça\]/);
});

test("agendada (locked) numa etapa futura: aviso e checkbox desabilitado", () => {
  const html = card({ locked: true });
  assert.match(html, /Agendada\. Está na Agenda\./);
  assert.doesNotMatch(html, /Já passou/);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled=""|<input[^>]*disabled=""[^>]*type="checkbox"/);
});

/** Texto visível de uma subárvore (sem expandir componentes filhos). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const achado = findButton(n, label);
      if (achado) return achado;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode; onClick: () => void }>(node)) return null;
  if (node.type === "button" && textOf(node.props.children).includes(label)) return node;
  return findButton(node.props.children, label);
}

/** O componente não tem hook: chamá-lo como função devolve a árvore sem renderizar. */
function seedFromEditButton(over: Over): string | undefined {
  const chamadas: (string | undefined)[] = [];
  const props = buildProps({ open: true, ...over, onTextChange: (t) => chamadas.push(t) });
  const botao = findButton(FunnelStepCard(props), "Editar texto");
  assert.ok(botao, "botão Editar texto não encontrado");
  botao.props.onClick();
  assert.equal(chamadas.length, 1);
  return chamadas[0];
}

test("Editar texto com campos cheios semeia a mensagem final", () => {
  const semente = seedFromEditButton({});
  assert.match(semente ?? "", /Prévia da grade de moda feminina: vestido midi/);
  assert.doesNotMatch(semente ?? "", /[[{]/);
});

test("Editar texto com campo faltando semeia a copy com {chave} crua, nunca [chave]", () => {
  const semente = seedFromEditButton({ d: {} });
  assert.match(semente ?? "", /\{peça\}/);
  assert.doesNotMatch(semente ?? "", /\[peça\]/);
});
