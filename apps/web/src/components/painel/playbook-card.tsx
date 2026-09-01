"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Circle } from "lucide-react";
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

/**
 * Card "Seus primeiros 30 dias" (P1.8) — playbook de ativação no dashboard.
 *
 * O que está feito fica COLAPSADO. Com 7 de 8 passos concluídos o card ocupava
 * meia tela para dizer uma coisa só ("falta captar 50 contatos"): sete linhas
 * riscadas empurravam o único item acionável para o meio da lista, e o card
 * tinha a mesma altura no começo e no fim da jornada, porque só sumia ao
 * completar tudo.
 *
 * Agora o corpo é o trabalho que resta. O que já foi vira uma linha de resumo
 * que se abre sob demanda — o progresso continua à vista na barra e no
 * contador, que é a parte que motiva.
 */
export function PlaybookCard() {
  const [data, setData] = useState<PlaybookState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [marking, setMarking] = useState(false);
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);

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

  if (loading || error || !data) return null;
  if (data.graduated || data.completed === data.total) return null;

  const pct = data.total > 0 ? Math.min(Math.round((data.completed / data.total) * 100), 100) : 0;

  // A ordem da API mistura feito e por fazer, então o passo acionável caía no
  // meio da lista. Aqui o que resta vem primeiro porque é o que se faz agora.
  const pendentes = data.steps.filter((s) => !s.done);
  const concluidos = data.steps.filter((s) => s.done);

  return (
    <section aria-labelledby="playbook-title" className="pn-card rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 id="playbook-title" className="font-display text-base font-bold text-volt-950">
          Seus primeiros 30 dias
        </h2>
        <span className="font-data text-sm font-medium tabular-nums text-aco/55">
          {data.completed}/{data.total}
        </span>
      </div>

      <div
        className="pn-poco mt-3 h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={data.completed}
        aria-valuemin={0}
        aria-valuemax={data.total}
        aria-valuetext={`${data.completed} de ${data.total} passos concluídos`}
      >
        <div
          className="pn-fill h-full w-full rounded-full bg-cobalt-500"
          style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }}
        />
      </div>

      <ol className="mt-5 space-y-1">
        {pendentes.map((step) => {
          const isNext = step.key === data.nextStepKey;
          return (
            <li
              key={step.key}
              aria-current={isNext ? "step" : undefined}
              className={cn(
                "flex items-start gap-3 rounded-xl px-3 py-2.5",
                isNext && "border-l-2 border-cobalt-500 bg-cobalt-500/[0.04]",
              )}
            >
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-aco/40" strokeWidth={1.75} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-volt-950">{step.title}</p>
                <p className="mt-0.5 text-xs text-aco/55">{step.description}</p>

                {isNext && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Link
                      href={step.ctaHref}
                      className="inline-flex items-center rounded-lg bg-cobalt-500 px-3.5 py-2 text-xs font-medium text-white transition hover:brightness-110"
                    >
                      {step.ctaLabel}
                    </Link>
                    {!step.auto && (
                      <button
                        type="button"
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
            </li>
          );
        })}
      </ol>

      {concluidos.length > 0 && (
        <div className="mt-3 border-t border-volt-950/[0.06] pt-3">
          <button
            type="button"
            onClick={() => setMostrarConcluidos((v) => !v)}
            aria-expanded={mostrarConcluidos}
            aria-controls="playbook-concluidos"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors duration-[160ms] hover:bg-poco focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-sucesso" strokeWidth={1.75} aria-hidden="true" />
            <span className="flex-1 text-sm text-aco/70">
              {concluidos.length} {concluidos.length === 1 ? "concluído" : "concluídos"}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-aco/40 transition-transform duration-[240ms] ease-[var(--ease-fluxo)]",
                mostrarConcluidos && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>

          {mostrarConcluidos && (
            <ol id="playbook-concluidos" className="mt-1 space-y-0.5">
              {concluidos.map((step) => (
                <li key={step.key} className="flex items-start gap-3 rounded-xl px-3 py-2">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-sucesso"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {/* Sem `line-through`: riscar comunica cancelado, não
                      conquistado — e era o que a tela fazia com as vitórias do
                      lojista. O estado também precisa existir fora da cor. */}
                  <p className="min-w-0 flex-1 text-sm text-aco/55">
                    {step.title}
                    <span className="sr-only"> — concluído</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
