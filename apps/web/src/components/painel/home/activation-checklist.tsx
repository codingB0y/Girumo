"use client";

import Link from "next/link";
import { ArrowUpRight, Check, PartyPopper, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Activation } from "@/lib/onboarding-steps";

/**
 * Os cinco passos da ativação, no topo da Início.
 *
 * Substitui os gates de tela cheia: antes, uma conta sem campanha via só o
 * onboarding e o dashboard ficava inacessível até completar o passo. Agora o
 * dashboard aparece desde o primeiro load e isto é um card entre outros — o
 * lojista escolhe se segue o roteiro ou vai direto ao que quer.
 */
export function ActivationChecklist({
  activation,
  onDismiss,
}: {
  activation: Activation;
  onDismiss: () => void;
}) {
  const { steps, doneCount, total, complete, next } = activation;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <section
      aria-labelledby="activation-title"
      className="pn-card relative rounded-2xl p-6"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Ocultar o roteiro de ativação"
        className="absolute right-4 top-4 rounded-lg p-1.5 text-aco/35 transition-colors duration-[160ms] hover:bg-poco hover:text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>

      <div className="pr-10">
        <h2 id="activation-title" className="font-display text-[17px] font-bold tracking-[-0.01em] text-volt-950">
          {complete ? "Sua loja está no ar" : "Comece por aqui"}
        </h2>
        <p className="mt-1 text-sm text-aco/70">
          {complete
            ? "Os cinco passos estão feitos. Daqui pra frente é ritmo — encha os grupos e dispare suas ofertas."
            : next
              ? next.hint
              : ""}
        </p>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div
          className="pn-poco h-2 flex-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Progresso da ativação"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuetext={`${doneCount} de ${total} passos concluídos`}
        >
          <div
            className={cn(
              "pn-fill h-full w-full rounded-full",
              complete ? "bg-sucesso" : "bg-cobalt-500",
            )}
            style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }}
          />
        </div>
        <span className="font-data shrink-0 text-sm font-medium tabular-nums text-volt-950">
          {doneCount}/{total}
        </span>
      </div>

      <ol className="mt-5 space-y-1">
        {steps.map((step, i) => {
          const isNext = !complete && next?.id === step.id;
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                aria-current={isNext ? "step" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-[160ms]",
                  isNext ? "bg-cobalt-500/[0.06]" : "hover:bg-poco",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-data text-xs font-medium tabular-nums",
                    step.done
                      ? "bg-sucesso/10 text-sucesso"
                      : isNext
                        ? "bg-cobalt-500 text-white shadow-sm"
                        : "pn-poco text-aco/40",
                  )}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                </span>

                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    step.done
                      ? "text-aco/60"
                      : isNext
                        ? "font-medium text-volt-950"
                        : "text-aco/70",
                  )}
                >
                  {step.label}
                  {step.done && <span className="sr-only"> — concluído</span>}
                </span>

                {isNext && (
                  <span className="font-data flex shrink-0 items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-cobalt-500">
                    {step.ctaLabel}
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-[160ms] ease-[var(--ease-fluxo)] group-hover:translate-x-0.5" />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>

      {complete && (
        <p className="mt-5 flex items-center gap-2 border-t border-volt-950/[0.06] pt-5 text-sm text-aco/70">
          <PartyPopper className="h-4 w-4 shrink-0 text-sucesso" strokeWidth={1.75} />
          Pode fechar este roteiro — ele não volta.
        </p>
      )}
    </section>
  );
}
