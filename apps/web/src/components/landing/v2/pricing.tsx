"use client";

import { useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
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
    tagline: "Pra botar pra rodar",
    bestFor: "quem tá começando nos grupos",
    features: [
      "1 número de WhatsApp",
      "Até 5 grupos gerenciados",
      "Disparo em massa (texto e imagem)",
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
      "Disparo multi-formato: texto, vídeo e áudio",
      "Agenda semanal recorrente em 1 clique",
      "Config em massa: nome e foto de todos",
      "Auto-criação de grupos quando enchem",
      "Funil e saúde do negócio",
    ],
  },
  {
    name: "Performance Max",
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

/** Equivalente mensal no plano anual: 2 meses grátis (paga 10, leva 12). */
const annualMonthly = (m: number) => Math.round((m * 10) / 12);
const fmt = (v: number) => v.toLocaleString("pt-BR");

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
      {/* controle segmentado mensal/anual */}
      <div className="mx-auto flex w-fit items-center rounded-full border border-white/10 bg-white/[0.03] p-1">
        {(["Mensal", "Anual"] as const).map((label, i) => {
          const active = annual === (i === 1);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => setAnnual(i === 1)}
              className={cn(
                "font-data flex items-center gap-2 rounded-full px-5 py-2 text-xs uppercase tracking-wider transition",
                active ? "bg-white font-medium text-void" : "text-bruma/50 hover:text-white",
              )}
            >
              {label}
              {i === 1 && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-zap/20 text-[#0a5c2e]" : "bg-zap/10 text-zap")}>
                  2 meses grátis
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const price = annual ? annualMonthly(p.monthly) : p.monthly;
          const savings = (p.monthly - annualMonthly(p.monthly)) * 12;
          return (
            <div
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-[1.75rem] p-8",
                p.highlight
                  ? "lp-ring-soft border border-transparent bg-void-2 shadow-deep lg:-my-4 lg:py-12"
                  : "lp-card border border-white/10 bg-white/[0.02]",
              )}
            >
              {p.highlight && (
                <span className="font-data absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-void shadow-lg">
                  <Sparkles className="h-3 w-3" /> mais escolhido
                </span>
              )}

              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-tech text-2xl font-bold tracking-tight text-white">{p.name}</h3>
                <span className="font-data text-[10px] uppercase tracking-wider text-bruma/40">{p.tagline}</span>
              </div>
              <p className="mt-2 text-sm text-bruma/50">Pra {p.bestFor}.</p>

              <div className="mt-7 flex items-end gap-3">
                <p className="flex items-baseline gap-1.5 text-white">
                  <span className="font-data text-sm text-bruma/50">R$</span>
                  <span className="font-tech text-6xl font-bold leading-none tracking-tight">{price}</span>
                  <span className="font-data text-sm text-bruma/50">/mês</span>
                </p>
                {annual && (
                  <span className="font-data pb-1 text-sm text-bruma/35 line-through">R$ {p.monthly}</span>
                )}
              </div>
              <p className="font-data mt-2.5 h-4 text-[11px] uppercase tracking-wider text-zap">
                {annual ? `economia de R$ ${fmt(savings)} no ano` : " "}
              </p>

              <ul className="mt-7 flex-1 space-y-3 border-t border-white/10 pt-7">
                {p.features.map((f, i) => (
                  <li
                    key={f}
                    className={cn(
                      "flex items-start gap-2.5 text-sm",
                      i === 0 && p.name !== "Essencial" ? "font-medium text-bruma/45" : "text-bruma/75",
                    )}
                  >
                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", i === 0 && p.name !== "Essencial" ? "text-bruma/35" : "text-zap")} />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={signupUrl}
                className={cn(
                  "lp-btn mt-8 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition",
                  p.highlight
                    ? "lp-btn-light"
                    : "border border-white/15 text-white hover:border-white/40",
                )}
              >
                Começar com {p.name} <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={whatsappUrl}
                className="mt-3 flex items-center justify-center gap-1.5 text-xs text-bruma/50 transition hover:text-white"
              >
                <WhatsAppIcon className="h-3.5 w-3.5 text-zap" /> Tirar dúvida no WhatsApp
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
