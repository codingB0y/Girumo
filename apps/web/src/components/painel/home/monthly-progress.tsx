"use client";

import { useState } from "react";
import { PartyPopper, Pencil, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { brl } from "./format";

type GoalKind = "contacts" | "revenue";

const GOAL_COPY: Record<
  GoalKind,
  { label: string; field: string; format: (n: number) => string; emptyCta: string }
> = {
  contacts: {
    label: "Meta do mês",
    field: "monthlyGoalContacts",
    format: (n) => `${n.toLocaleString("pt-BR")} contatos`,
    emptyCta: "Defina uma meta de contatos",
  },
  revenue: {
    label: "Meta de faturamento",
    field: "monthlyGoalRevenue",
    format: (n) => brl.format(n),
    emptyCta: "Defina uma meta de faturamento",
  },
};

/**
 * Progresso de uma meta mensal. `goal === null` = o lojista ainda não definiu
 * — vira um convite pra definir, em vez de sumir. A meta de faturamento era
 * gravável pela API e lida pela tela, mas nunca chegou a ser renderizada.
 */
export function MonthlyProgress({
  kind,
  current,
  goal,
  isSuggested,
  onSaved,
}: {
  kind: GoalKind;
  current: number;
  goal: number | null;
  isSuggested: boolean;
  onSaved: (value: number) => void;
}) {
  const copy = GOAL_COPY[kind];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal != null ? String(goal) : "");
  const [saving, setSaving] = useState(false);

  const pct = goal && goal > 0 ? Math.min(Math.round((current / goal) * 100), 100) : 0;
  const achieved = goal != null && current >= goal;

  async function handleSave() {
    const value = Math.round(Number(draft.replace(/\./g, "").replace(",", ".")));
    if (!value || value <= 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [copy.field]: value }),
      });
      if (res.ok) {
        onSaved(value);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  // Sem meta definida: convite discreto, sem barra de progresso vazia.
  if (goal == null && !editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="pn-card group flex w-full items-center gap-2 rounded-2xl px-5 py-4 text-left transition-colors duration-[160ms] hover:bg-poco"
      >
        <Target className="h-4 w-4 text-aco/40 transition-colors group-hover:text-cobalt-500" strokeWidth={1.75} />
        <span className="text-sm text-aco/70">{copy.emptyCta}</span>
        <Pencil className="ml-auto h-3 w-3 text-aco/30 transition-colors group-hover:text-cobalt-500" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <div className="pn-card rounded-2xl px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />
          <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">
            {copy.label}
            {isSuggested && !editing ? " (meta sugerida)" : ""}
          </span>
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              inputMode="numeric"
              value={draft}
              aria-label={copy.emptyCta}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="font-data w-24 rounded-lg border border-volt-950/10 bg-poco px-2 py-1 text-right text-sm tabular-nums text-volt-950 outline-none focus:border-cobalt-500/50"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="font-data rounded-lg bg-cobalt-500 px-2.5 py-1 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "…" : "Salvar"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setDraft(goal != null ? String(goal) : "");
              setEditing(true);
            }}
            className="group flex items-center gap-1.5"
          >
            <span
              className={cn(
                "font-data text-sm font-medium tabular-nums",
                achieved ? "text-sucesso" : "text-volt-950",
              )}
            >
              {copy.format(current)} / {copy.format(goal ?? 0)}
            </span>
            <Pencil className="h-3 w-3 text-aco/40 transition-colors group-hover:text-cobalt-500" strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div
        className="pn-poco mt-3 h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-label={copy.label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${copy.format(current)} de ${copy.format(goal ?? 0)}`}
      >
        <div
          className={cn("pn-fill h-full w-full rounded-full", achieved ? "bg-sucesso" : "bg-cobalt-500")}
          style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }}
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-aco/60">
        {achieved ? (
          <>
            <PartyPopper className="h-3.5 w-3.5 text-sucesso" strokeWidth={1.75} />
            Meta atingida! Continue crescendo.
          </>
        ) : isSuggested ? (
          <>Faltam {copy.format((goal ?? 0) - current)} pra bater a meta sugerida — clique pra definir a sua.</>
        ) : (
          <>Faltam {copy.format((goal ?? 0) - current)} pra bater a meta.</>
        )}
      </p>
    </div>
  );
}
