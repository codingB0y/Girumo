"use client";

import Link from "next/link";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepInfo = { n: number; label: string; done?: boolean; active?: boolean };

export function OnboardingShell({
  eyebrow,
  greeting,
  icon: Icon,
  iconClass,
  title,
  headline,
  body,
  ctaHref,
  ctaLabel,
  ctaIcon: CtaIcon,
  steps,
  footnote,
  onSkip,
}: {
  eyebrow: string;
  greeting: string;
  icon: LucideIcon;
  iconClass: string;
  title: string;
  headline: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
  ctaIcon: LucideIcon;
  steps: StepInfo[];
  /** Contexto do que já aconteceu — mostra ao lojista que o passo anterior deu certo. */
  footnote?: string;
  /** Saída pro painel completo. Sem isso, quem trava num passo não tem pra onde ir. */
  onSkip?: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">{title}</h1>
        <p className="font-editorial mt-1 text-[19px] italic text-ardosia">{greeting}</p>
        <p className="font-data mt-3 text-[11px] uppercase tracking-[0.08em] text-aco/55">{eyebrow}</p>
      </div>

      <div className="pn-card mt-6 rounded-2xl p-8">
        <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
          <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl", iconClass)}>
            <Icon className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-volt-950">{headline}</h2>
            <p className="mt-2 text-sm leading-relaxed text-aco/75">{body}</p>
          </div>
          <Link
            href={ctaHref}
            className="hf-shine inline-flex items-center gap-2 rounded-[10px] bg-cobalt-500 px-6 py-3 text-sm font-medium text-white shadow-sm transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:brightness-110 active:scale-[0.97]"
          >
            <CtaIcon className="h-4 w-4" /> {ctaLabel}
          </Link>
        </div>

        {footnote && (
          <p className="mt-6 border-t border-volt-950/[0.06] pt-5 text-sm text-aco/70">{footnote}</p>
        )}

        <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <Step key={s.n} n={s.n} label={s.label} done={s.done} active={s.active} />
          ))}
        </ol>
      </div>

      {onSkip && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-aco/60 underline-offset-4 transition-colors duration-[160ms] hover:text-volt-950 hover:underline"
          >
            Ver o painel mesmo assim
          </button>
        </div>
      )}
    </div>
  );
}

function Step({ n, label, active, done }: StepInfo) {
  return (
    <li className="flex items-center gap-2.5" aria-current={active ? "step" : undefined}>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-data text-sm font-medium tabular-nums",
          done
            ? "bg-sucesso/10 text-sucesso"
            : active
              ? "bg-cobalt-500 text-white shadow-sm"
              : "pn-poco text-aco/40",
        )}
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <span className={cn("text-sm", active ? "font-medium text-volt-950" : done ? "text-aco/70" : "text-aco/40")}>
        {label}
      </span>
    </li>
  );
}
