"use client";

import { useState } from "react";
import {
  BOARD_STATUSES,
  STATUS_LABELS,
  isVerificationStale,
  type BoardFeature,
  type BoardStatus,
} from "@/lib/quadro/status";

const PRIORITY_STYLE: Record<BoardFeature["priority"], string> = {
  alta: "bg-danger-700/10 text-danger-700",
  media: "bg-aco/10 text-aco",
  baixa: "bg-aco/5 text-aco/60",
};

function daysSince(iso: string, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(iso)) / (24 * 60 * 60 * 1000));
}

interface QuadroCardProps {
  feature: BoardFeature;
  nowMs: number;
  onChanged: () => void;
}

export function QuadroCard({ feature, nowMs, onChanged }: QuadroCardProps) {
  const stale = isVerificationStale(feature, nowMs);

  const [target, setTarget] = useState<BoardStatus | null>(null);
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proofRequired = target === "no_ar_verificado";

  function handleCancel() {
    setTarget(null);
    setNote("");
    setRef("");
    setError(null);
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;

    if (!note.trim()) {
      setError("O motivo é obrigatório: é ele que dá valor ao feed.");
      return;
    }
    if (proofRequired && !ref.trim()) {
      setError("Verificado exige prova (PR, query, arquivo).");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/quadro", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: feature.key,
          status: target,
          note,
          ref: ref.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Falhou");
        return;
      }
      handleCancel();
      onChanged();
    } catch {
      setError("Rede falhou. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-lg border border-line-200 bg-paper-0 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-volt-950">{feature.title}</h3>
        <span
          className={`font-data shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${PRIORITY_STYLE[feature.priority]}`}
        >
          {feature.priority}
        </span>
      </div>

      <p className="font-data mt-1 text-[10px] uppercase tracking-wider text-aco/55">
        {feature.area}
      </p>

      {feature.summary ? (
        <p className="mt-2 text-xs leading-relaxed text-aco/80">{feature.summary}</p>
      ) : null}

      {feature.blocker ? (
        <p className="mt-2 rounded bg-danger-700/8 px-2 py-1 text-xs leading-relaxed text-danger-700">
          <span className="font-semibold">Trava:</span> {feature.blocker}
        </p>
      ) : null}

      {feature.status === "no_ar_verificado" && feature.evidenceAt ? (
        <p
          className={`font-data mt-2 text-[10px] uppercase tracking-wider ${stale ? "text-danger-700" : "text-aco/45"}`}
        >
          {stale ? "⚠ verificação vencida · " : "verificado "}
          há {daysSince(feature.evidenceAt, nowMs)} dias
          {feature.evidence ? ` · ${feature.evidence}` : ""}
        </p>
      ) : null}

      <label className="sr-only" htmlFor={`mover-${feature.key}`}>
        Mover {feature.title}
      </label>
      <select
        id={`mover-${feature.key}`}
        value={target ?? feature.status}
        disabled={saving}
        onChange={(e) => {
          const chosen = e.target.value as BoardStatus;
          setError(null);
          setTarget(chosen === feature.status ? null : chosen);
        }}
        className="mt-2 w-full rounded border border-line-200 bg-canvas-100 px-1.5 py-1 text-[11px] text-aco disabled:opacity-50"
      >
        {BOARD_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      {target ? (
        <form onSubmit={handleConfirm} className="mt-2 space-y-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo (vai pro feed)"
            aria-label={`Motivo para mover ${feature.title}`}
            autoFocus
            className="w-full rounded border border-line-200 bg-paper-0 px-1.5 py-1 text-[11px] text-volt-950"
          />
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={proofRequired ? "Prova — obrigatória" : "Referência (opcional)"}
            aria-label={`Referência para ${feature.title}`}
            className="w-full rounded border border-line-200 bg-paper-0 px-1.5 py-1 text-[11px] text-volt-950"
          />
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-volt-950 px-2 py-1 text-[11px] font-semibold text-paper-0 disabled:opacity-50"
            >
              Confirmar
            </button>
            {/* Desabilitado durante o envio: sem isso o Cancelar fecha o formulário mas
                não impede o PATCH já em voo — o card se move depois de você ter cancelado. */}
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="text-[11px] text-aco/60 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-danger-700">{error}</p>
      ) : null}
    </article>
  );
}
