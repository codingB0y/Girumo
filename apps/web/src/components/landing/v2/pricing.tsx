"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/landing/icons";

type Plan = {
  name: string;
  monthly: number;
  tagline: string;
  bestFor: string;
  features: string[];
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Essencial",
    monthly: 197,
    tagline: "Pra começar",
    bestFor: "quem tá botando os primeiros grupos pra rodar",
    features: [
      "1 número de WhatsApp",
      "Até 5 grupos gerenciados",
      "Publicação em massa com texto e imagem",
      "Agendamento de mensagens",
      "Monitoramento dos grupos",
    ],
  },
  {
    name: "Growth",
    monthly: 297,
    highlight: true,
    tagline: "Pra escalar de verdade",
    bestFor: "quem opera 10, 50, 100+ grupos",
    features: [
      "Tudo do Essencial",
      "Grupos ilimitados",
      "Publicação multi-formato com texto, vídeo e áudio",
      "Agenda semanal recorrente em 1 clique",
      "Configuração em massa de nome e foto",
      "Criação automática de grupos quando enchem",
      "Funil e saúde do negócio",
    ],
  },
  {
    name: "Operação",
    monthly: 497,
    tagline: "A gente opera com você",
    bestFor: "quem quer um time junto na operação",
    features: [
      "Tudo do Growth",
      "Setup e operação assistidos",
      "Revisão estratégica mensal 1:1",
      "Prioridade no suporte",
    ],
  },
];

const annualMonthly = (monthly: number) => Math.round((monthly * 10) / 12);
const annualTotal = (monthly: number) => monthly * 10;
const annualSavings = (monthly: number) => monthly * 2;
const fmt = (value: number) => value.toLocaleString("pt-BR");

export function PricingV2({
  signupUrl,
  whatsappUrl,
}: {
  signupUrl: string;
  whatsappUrl: string;
}) {
  const [annual, setAnnual] = useState(true);

  return (
    <div>
      <p className="mx-auto mb-8 max-w-lg text-center text-sm text-slate-600">
        A Mega Stock fez R$350 mil por mês com esse jeito de vender. O Growth custa menos que uma grade.
      </p>

      <div className="mx-auto grid w-fit grid-cols-2 gap-px rounded-[var(--radius-control)] bg-volt-800 p-px">
        {(["Mensal", "Anual"] as const).map((label, index) => {
          const active = annual === (index === 1);

          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => setAnnual(index === 1)}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius-control)] px-5 py-2.5 font-data text-xs uppercase tracking-[0.12em] transition-colors motion-reduce:transition-none",
                active
                  ? "bg-cobalt-500 font-medium text-paper-0"
                  : "bg-volt-950 text-canvas-100/65 hover:text-paper-0",
              )}
            >
              {label}
              {index === 1 && (
                <span
                  className={cn(
                    "rounded-[var(--radius-control)] px-2 py-0.5 text-[10px] normal-case tracking-normal",
                    active ? "bg-acid-500 text-volt-950" : "bg-volt-900 text-canvas-100/65",
                  )}
                >
                  2 meses grátis
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const price = annual ? annualMonthly(plan.monthly) : plan.monthly;
          const total = annualTotal(plan.monthly);
          const savings = annualSavings(plan.monthly);

          return (
            <article
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-[var(--radius-card)] p-7 text-volt-950 sm:p-8",
                plan.highlight ? "bg-paper-0" : "bg-canvas-100",
              )}
            >
              {plan.highlight && <span className="absolute inset-x-0 top-0 h-1 bg-acid-500" aria-hidden />}

              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-tech text-2xl font-bold tracking-tight">{plan.name}</h3>
                <span className="font-data text-[10px] uppercase tracking-[0.12em] text-slate-600">
                  {plan.tagline}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Pra {plan.bestFor}.</p>

              <div className="mt-7">
                <p className="flex items-baseline gap-1.5">
                  <span className="font-data text-sm text-slate-600">R$</span>
                  <span className="font-tech text-6xl font-bold leading-none tracking-tight">{price}</span>
                  <span className="font-data text-sm text-slate-600">/mês</span>
                </p>
                <p className="mt-2 font-data text-[10px] uppercase tracking-[0.1em] text-slate-600">
                  {annual ? "equivalente mensal arredondado" : "cobrança mensal"}
                </p>
              </div>

              <p className="mt-4 min-h-5 font-data text-[11px] uppercase tracking-[0.1em] text-cobalt-700">
                {annual ? `R$ ${fmt(total)} no ano · economize R$ ${fmt(savings)}` : " "}
              </p>

              <ul className="mt-7 flex-1 space-y-3 border-t border-line-200 pt-7">
                {plan.features.map((feature, index) => (
                  <li
                    key={feature}
                    className={cn(
                      "flex items-start gap-2.5 text-sm text-slate-600",
                      index === 0 && plan.name !== "Essencial" && "font-medium text-volt-950",
                    )}
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href={signupUrl}
                className={cn(
                  "mt-8 flex items-center justify-center gap-2 rounded-[var(--radius-control)] py-3.5 text-sm font-semibold transition motion-reduce:transition-none",
                  plan.highlight
                    ? "bg-acid-500 text-volt-950 hover:brightness-95"
                    : "bg-volt-950 text-paper-0 hover:bg-volt-900",
                )}
              >
                Começar com {plan.name} <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={whatsappUrl}
                className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-600 transition hover:text-volt-950 motion-reduce:transition-none"
              >
                <WhatsAppIcon className="h-3.5 w-3.5 text-success-700" /> Tirar dúvida no WhatsApp
              </a>
            </article>
          );
        })}
      </div>

      <p className="mt-10 text-center font-data text-[11px] uppercase tracking-[0.1em] text-slate-600">
        garantia de 30 dias · sem fidelidade · seus contatos são seus
      </p>
    </div>
  );
}
