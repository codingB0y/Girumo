"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type PlaybookStepState = {
  key: string;
  title: string;
  description: string;
  auto: boolean;
  done: boolean;
  doneAt: string | null;
  ctaHref: string;
  ctaLabel: string;
};

type PlaybookState = {
  steps: PlaybookStepState[];
  completed: number;
  total: number;
  nextStepKey: string | null;
  graduated: boolean;
};

/** Card "Seus primeiros 30 dias" (P1.8) — playbook de ativação no dashboard. */
export function PlaybookCard() {
  const [data, setData] = useState<PlaybookState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/playbook");
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as PlaybookState;
        setData(json);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || error || !data) return null;
  if (data.graduated || data.completed === data.total) return null;

  const pct = data.total > 0 ? Math.min(Math.round((data.completed / data.total) * 100), 100) : 0;

  async function markManualStep(stepKey: string) {
    if (marking) return;
    setMarking(true);
    try {
      const res = await fetch("/api/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepKey }),
      });
      if (res.ok) {
        const json = (await res.json()) as PlaybookState;
        setData(json);
      }
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="pn-card rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-volt-950">Seus primeiros 30 dias</h2>
        <span className="font-data text-sm font-medium tabular-nums text-aco/55">
          {data.completed}/{data.total}
        </span>
      </div>

      <div className="pn-poco mt-3 h-2 w-full overflow-hidden rounded-full">
        <div
          className="pn-fill h-full w-full rounded-full bg-cobalt-500"
          style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }}
        />
      </div>

      <div className="mt-5 space-y-1">
        {data.steps.map((step) => {
          const isNext = step.key === data.nextStepKey;
          return (
            <div
              key={step.key}
              className={cn(
                "flex items-start gap-3 rounded-xl px-3 py-2.5",
                isNext && "border-l-2 border-cobalt-500 bg-cobalt-500/[0.04]",
              )}
            >
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sucesso" strokeWidth={1.75} />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-aco/40" strokeWidth={1.75} />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", step.done ? "text-aco/55 line-through" : "font-medium text-volt-950")}>
                  {step.title}
                </p>
                {!step.done && (
                  <p className="mt-0.5 text-xs text-aco/55">{step.description}</p>
                )}

                {isNext && !step.done && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Link
                      href={step.ctaHref}
                      className="inline-flex items-center rounded-lg bg-cobalt-500 px-3.5 py-2 text-xs font-medium text-white transition hover:brightness-110"
                    >
                      {step.ctaLabel}
                    </Link>
                    {!step.auto && (
                      <button
                        onClick={() => markManualStep(step.key)}
                        disabled={marking}
                        className="inline-flex items-center rounded-lg border border-volt-950/15 px-3.5 py-2 text-xs font-medium text-volt-950 transition-colors duration-[160ms] ease-[var(--ease-fluxo)] hover:border-cobalt-500 hover:text-cobalt-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {marking ? "…" : "Marquei"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
