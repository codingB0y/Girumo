"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de funnel-hero.tsx).
import React from "react";

import { AtSign, ChevronDown, ImagePlus, Link2, PencilLine, X, Zap } from "lucide-react";

import { Bolha } from "@/components/painel/bolha";
import type { FunnelField } from "@/lib/funnels/templates";
import { cn } from "@/lib/utils";
import { blockerLabels, isBlocked, stepTime, stepWhen, type StepDraft, type StepPlan } from "./funnel-plan";

export type FunnelStepCardProps = {
  plan: StepPlan;
  draft: StepDraft;
  open: boolean;
  grupoNome: string;
  uploading: boolean;
  /** Já agendada nesta rodada: não dá mais para desmarcar. */
  locked: boolean;
  /** De onde vem o valor herdado de um campo vazio. */
  herancaRotulo?: string;
  onToggleOpen: () => void;
  onIncludedChange: (included: boolean) => void;
  onFieldChange: (field: FunnelField, value: string) => void;
  onMentionToggle: () => void;
  onTextChange: (text: string | undefined) => void;
  /** `undefined` volta para a hora do roteiro. */
  onTimeChange: (time: string | undefined) => void;
  onPhotoPick: (file: File) => void;
  onPhotoRemove: () => void;
};

const EXEMPLO: Readonly<Record<FunnelField, string>> = {
  "peça": "vestido midi",
  "preço": "R$ 39,90",
  grade: "P ao GG",
  quantidade: "120",
  "link da live": "https://instagram.com/sualoja/live",
};

const CHIP = "inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-12 font-semibold";
const FERRAMENTA =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-13 font-medium transition-colors";
const INPUT =
  "h-11 w-full rounded-lg border border-line-200 bg-canvas-100/40 px-3 text-base text-volt-950 placeholder:text-slate-600 focus:border-cobalt-500 focus:outline-none";

export function FunnelStepCard(props: FunnelStepCardProps) {
  const { plan, draft, open } = props;
  const { step } = plan;
  const corpoId = `funil-etapa-${step.id}`;
  const bloqueada = isBlocked(plan);

  return (
    <article aria-label={step.label} className="rounded-xl bg-volt-950/[0.04] p-1.5">
      <div
        className={cn(
          "rounded-lg border bg-paper-0 p-4 sm:p-5",
          bloqueada ? "border-alerta" : "border-line-200",
        )}
      >
        <div className="flex items-start gap-2">
          <label className="flex h-11 w-11 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              className="h-5 w-5 accent-cobalt-500"
              checked={plan.included}
              disabled={plan.isPast || props.locked}
              onChange={(e) => props.onIncludedChange(e.target.checked)}
              aria-label={`Incluir ${step.label}`}
            />
          </label>
          <button
            type="button"
            onClick={props.onToggleOpen}
            aria-expanded={open}
            aria-controls={open ? corpoId : undefined}
            className="flex min-h-11 flex-1 items-start justify-between gap-2 text-left"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-data text-12 text-slate-600">{stepWhen(plan.at)}</span>
              <span className="text-15 font-semibold text-volt-950">{step.label}</span>
            </span>
            <ChevronDown aria-hidden className={cn("mt-2 h-5 w-5 shrink-0 text-slate-600 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 pl-[52px]">
          {plan.mentionAll && <span className={cn(CHIP, "bg-cobalt-500/10 text-cobalt-700")}><AtSign aria-hidden className="h-3 w-3" />todos</span>}
          {step.kind === "link" && <span className={cn(CHIP, "bg-cobalt-500/10 text-cobalt-700")}><Link2 aria-hidden className="h-3 w-3" />link</span>}
          {step.kind === "relampago" && <span className={cn(CHIP, "bg-volt-950 text-acid-500")}><Zap aria-hidden className="h-3 w-3" />relâmpago · EU QUERO</span>}
          {step.wantsMedia && <span className={cn(CHIP, "bg-volt-950/[0.06] text-volt-950")}><ImagePlus aria-hidden className="h-3 w-3" />{plan.media ? "1 foto" : "foto"}</span>}
          {plan.edited && <span className={cn(CHIP, "bg-atencao/10 text-atencao")}>editado</span>}
          {plan.timeEdited && <span className={cn(CHIP, "bg-atencao/10 text-atencao")}>hora editada</span>}
        </div>

        {/* Travada já está na Agenda: "não será enviada" seria falso. */}
        {plan.isPast && !props.locked && <p className="mt-2 pl-[52px] text-12 text-slate-600">Já passou: esta etapa não será enviada.</p>}
        {props.locked && <p className="mt-2 pl-[52px] text-12 text-sucesso">Agendada. Está na Agenda.</p>}
        {bloqueada && <p className="mt-2 pl-[52px] text-12 text-alerta">Falta: {blockerLabels(plan).join(", ")}</p>}

        {open && (
          <div id={corpoId} className="mt-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">Hora</span>
                <input
                  type="time"
                  aria-label={`Hora de ${step.label}`}
                  value={stepTime(plan.at)}
                  disabled={props.locked}
                  // Vazio é segmento apagado no meio da digitação, não "voltar": tratar
                  // como reset devolvia a hora do roteiro ao campo a cada tecla. O
                  // reset é só o botão ao lado.
                  onChange={(e) => {
                    if (e.target.value) props.onTimeChange(e.target.value);
                  }}
                  className={cn(INPUT, "w-36")}
                />
              </label>
              {plan.timeEdited && !props.locked && (
                <button
                  type="button"
                  onClick={() => props.onTimeChange(undefined)}
                  className={cn(FERRAMENTA, "border-line-200 bg-paper-0 text-slate-600 hover:border-cobalt-500")}
                >
                  Voltar à hora do roteiro
                </button>
              )}
            </div>
            {step.fields.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {step.fields.map((campo) => {
                  const proprio = draft.fields?.[campo] ?? "";
                  const herdado = !proprio.trim() && plan.values[campo] ? plan.values[campo] : "";
                  return (
                    <label key={campo} className="flex flex-col gap-1">
                      <span className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">{campo}</span>
                      <input
                        aria-label={campo}
                        type={campo === "quantidade" ? "number" : campo === "link da live" ? "url" : "text"}
                        inputMode={campo === "quantidade" ? "numeric" : undefined}
                        min={campo === "quantidade" ? 1 : undefined}
                        step={campo === "quantidade" ? 1 : undefined}
                        value={proprio}
                        placeholder={herdado || EXEMPLO[campo]}
                        onChange={(e) => props.onFieldChange(campo, e.target.value)}
                        className={INPUT}
                      />
                      {herdado && <span className="text-12 text-slate-600">{props.herancaRotulo ?? "igual à etapa anterior"}</span>}
                    </label>
                  );
                })}
              </div>
            )}

            {step.wantsMedia &&
              (plan.media ? (
                <div className="flex items-center gap-2 rounded-lg bg-canvas-100 pl-3 text-13 text-volt-950">
                  <span className="truncate">{plan.media.name}</span>
                  <button type="button" onClick={props.onPhotoRemove} aria-label="Remover foto" className="ml-auto flex h-11 w-11 items-center justify-center text-slate-600 hover:text-alerta">
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-200 px-3 text-13 text-slate-600 hover:border-cobalt-500">
                  <ImagePlus aria-hidden className="h-4 w-4" />
                  {props.uploading ? "Enviando foto…" : "Anexar 1 foto (opcional)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={props.uploading}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      if (arquivo) props.onPhotoPick(arquivo);
                      e.target.value = "";
                    }}
                  />
                </label>
              ))}

            <Bolha
              grupo={props.grupoNome}
              hora={stepTime(plan.at)}
              texto={plan.preview}
              foto={plan.media?.previewUrl}
              mencaoTodos={plan.mentionAll}
              testId={`funil-previa-${step.id}`}
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={plan.mentionAll}
                onClick={props.onMentionToggle}
                className={cn(FERRAMENTA, plan.mentionAll ? "border-cobalt-500 bg-cobalt-500/10 text-cobalt-700" : "border-line-200 bg-paper-0 text-slate-600 hover:border-cobalt-500")}
              >
                <AtSign aria-hidden className="h-4 w-4" /> @Todos
              </button>
              <button
                type="button"
                onClick={() => props.onTextChange(plan.edited ? undefined : (plan.text ?? plan.source))}
                className={cn(FERRAMENTA, "border-line-200 bg-paper-0 text-slate-600 hover:border-cobalt-500")}
              >
                <PencilLine aria-hidden className="h-4 w-4" /> {plan.edited ? "Voltar ao roteiro" : "Editar texto"}
              </button>
            </div>

            {plan.edited && (
              <label className="flex flex-col gap-1">
                <span className="text-12 text-atencao">Texto editado à mão: os campos só preenchem as {"{chaves}"} que ficaram no texto.</span>
                <textarea
                  aria-label={`Texto de ${step.label}`}
                  value={plan.source}
                  onChange={(e) => props.onTextChange(e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-line-200 bg-canvas-100/40 px-3 py-2 text-base text-volt-950 focus:border-cobalt-500 focus:outline-none"
                />
              </label>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
