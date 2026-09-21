/**
 * Lógica pura da sub-aba Funil. Sem React, sem fetch: tudo que decide o que a
 * tela mostra e o que vai para a rota passa por aqui e é testado.
 *
 * O gate do botão é `missingKeys` sobre a copy efetiva (inclui loja, nicho,
 * link, dia e hora), nunca `missingFields` — `renderCopy` lança por qualquer
 * chave vazia, e uma exceção no meio da confirmação deixaria mensagens já
 * agendadas.
 */
import { anchorValues, missingKeys, renderCopy, resolveStepDate } from "@/lib/funnels/render";
import type { FunnelField, FunnelStep, FunnelTemplate, FunnelTemplateId } from "@/lib/funnels/templates";

export type StepMedia = { id: string; name: string; previewUrl: string };

export type StepDraft = {
  /** Só o que o lojista digitou NESTA etapa; o vazio herda (ver `inheritedFields`). */
  fields?: Partial<Record<FunnelField, string>>;
  /** Texto editado à mão. `undefined` = copy do roteiro. */
  customText?: string;
  /** `undefined` = o que o roteiro manda. */
  mentionAll?: boolean;
  excluded?: boolean;
  media?: StepMedia;
};

export type FunnelContext = { anchor: Date; now: Date; loja: string; nicho: string; link: string };

export type StepPlan = {
  step: FunnelStep;
  at: Date;
  isPast: boolean;
  included: boolean;
  mentionAll: boolean;
  edited: boolean;
  /** Copy efetiva, ainda com {chaves}: a do roteiro ou a editada. */
  source: string;
  values: Record<string, string>;
  missing: string[];
  quantidadeInvalida: boolean;
  /** Mensagem final; `null` enquanto faltar chave. */
  text: string | null;
  /** O que a bolha mostra: a mensagem com `[chave]` no lugar do que falta. */
  preview: string;
  media?: StepMedia;
};

export type FunnelRun = { templateId: FunnelTemplateId; runId: string; groupIds: readonly string[] };

export type MessagePayload = {
  body: string;
  mentionAll: boolean;
  scheduledAt: string;
  recurrence: "none";
  groupIds: string[];
  funnelTemplateId: FunnelTemplateId;
  funnelRunId: string;
  mediaId?: string;
  mediaType?: "image";
  mediaName?: string;
};

export type OfferPayload = { name: string; keyword: "eu quero"; slots: number; broadcastId: string };

const QUANTIDADE = /^[1-9]\d*$/;
const CHAVE = /\{([^}]+)\}/g;
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

const ROTULO: Readonly<Record<string, string>> = {
  loja: "Sua loja",
  nicho: "Seu nicho",
  link: "link da campanha",
  dia: "data",
  hora: "hora",
  texto: "texto da mensagem",
};

const dois = (n: number) => String(n).padStart(2, "0");

export function isoLocalDate(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Amanhã (06:00 de hoje já pode ter passado); a BF usa a sugestão do roteiro. */
export function defaultAnchorDate(t: FunnelTemplate, today: Date): string {
  if (t.suggestAnchor) return isoLocalDate(t.suggestAnchor(today));
  const amanha = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return isoLocalDate(amanha);
}

/** Mesma montagem da sub-aba Agendar: `new Date(`${date}T${time}`)`, hora local. */
export function anchorFrom(date: string, time: string, needsTime: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const hora = needsTime ? time : "00:00";
  if (!/^\d{2}:\d{2}$/.test(hora)) return null;
  const d = new Date(`${date}T${hora}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function inheritedFields(
  steps: readonly FunnelStep[],
  drafts: Readonly<Record<string, StepDraft>>,
  i: number,
): Partial<Record<FunnelField, string>> {
  const saida: Partial<Record<FunnelField, string>> = {};
  for (const step of steps.slice(0, i + 1)) {
    for (const [campo, valor] of Object.entries(drafts[step.id]?.fields ?? {})) {
      if (valor?.trim()) saida[campo as FunnelField] = valor.trim();
    }
  }
  return saida;
}

export function planFunnel(
  t: FunnelTemplate,
  drafts: Readonly<Record<string, StepDraft>>,
  ctx: FunnelContext,
): StepPlan[] {
  const ancora = anchorValues(ctx.anchor);
  return t.steps.map((step, i) => {
    const draft = drafts[step.id] ?? {};
    const at = resolveStepDate(ctx.anchor, step);
    const isPast = at.getTime() <= ctx.now.getTime();
    const values: Record<string, string> = {
      loja: ctx.loja.trim(),
      nicho: ctx.nicho.trim(),
      link: ctx.link.trim(),
      ...ancora,
      ...inheritedFields(t.steps, drafts, i),
    };
    const edited = draft.customText !== undefined;
    const source = draft.customText ?? step.copy;
    const faltando = edited && !source.trim() ? ["texto"] : missingKeys(source, values);
    const quantidade = values.quantidade ?? "";
    // Relâmpago precisa de `slots` mesmo que o texto editado não cite {quantidade}.
    const missing = step.kind === "relampago" && !quantidade && !faltando.includes("quantidade")
      ? [...faltando, "quantidade"]
      : faltando;
    const quantidadeInvalida = quantidade !== "" && step.fields.includes("quantidade") && !QUANTIDADE.test(quantidade);
    // `missingKeys` é provadamente consistente com `renderCopy`: sem chave
    // faltando, não lança.
    const text = missing.length === 0 ? renderCopy(source, values) : null;
    const preview = source.replace(CHAVE, (_, chave: string) => values[chave]?.trim() || `[${chave}]`);
    return {
      step,
      at,
      isPast,
      included: !isPast && !draft.excluded,
      mentionAll: draft.mentionAll ?? step.mentionAll,
      edited,
      source,
      values,
      missing,
      quantidadeInvalida,
      text,
      preview,
      media: draft.media,
    };
  });
}

/** Só etapa incluída bloqueia: passada ou desmarcada não segura o botão. */
export function isBlocked(p: StepPlan): boolean {
  return p.included && (p.missing.length > 0 || p.quantidadeInvalida);
}

export function keyLabel(k: string): string {
  return ROTULO[k] ?? k;
}

export function blockerLabels(p: StepPlan): string[] {
  return [...p.missing.map(keyLabel), ...(p.quantidadeInvalida ? ["quantidade (número inteiro)"] : [])];
}

export function stepTime(at: Date): string {
  return `${dois(at.getHours())}:${dois(at.getMinutes())}`;
}

export function stepWhen(at: Date): string {
  return `${DIAS[at.getDay()]} ${dois(at.getDate())}/${dois(at.getMonth() + 1)} · ${stepTime(at)}`;
}

export function messagePayload(p: StepPlan, run: FunnelRun): MessagePayload {
  if (p.text === null) throw new Error(`etapa incompleta: ${p.step.id}`);
  return {
    body: p.text,
    mentionAll: p.mentionAll,
    scheduledAt: p.at.toISOString(),
    recurrence: "none",
    groupIds: [...run.groupIds],
    funnelTemplateId: run.templateId,
    funnelRunId: run.runId,
    ...(p.media ? { mediaId: p.media.id, mediaType: "image" as const, mediaName: p.media.name } : {}),
  };
}

export function offerPayload(p: StepPlan, broadcastId: string): OfferPayload {
  return { name: p.step.label, keyword: "eu quero", slots: Number(p.values.quantidade), broadcastId };
}
