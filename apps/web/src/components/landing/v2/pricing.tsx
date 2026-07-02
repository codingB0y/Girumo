"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/landing/icons";

type Plan = {
  name: string;
  monthly: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Essencial",
    monthly: 197,
    tagline: "Pra botar pra rodar",
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
    features: [
      "Tudo do Essencial +",
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
    features: [
      "Tudo do Growth +",
      "Setup e operação assistidos",
      "Revisão estratégica mensal 1:1",
      "Prioridade no suporte",
    ],
  },
];

/** Equivalente mensal no plano anual: 2 meses grátis (paga 10, leva 12). */
const annualMonthly = (m: number) => Math.round((m * 10) / 12);

export function PricingV2({
  signupUrl,
  whatsappUrl,
}: {
  signupUrl: string;
  whatsappUrl: string;
}) {
  const [annual, setAnnual] = useState(false);

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
                active ? "bg-iris text-white shadow-iris" : "text-bruma/50 hover:text-white",
              )}
            >
              {label}
              {i === 1 && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-white/20 text-white" : "bg-zap/10 text-zap")}>
                  −2 meses
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const price = annual ? annualMonthly(p.monthly) : p.monthly;
          return (
            <div
              key={p.name}
              className={cn(
                "lp-card relative flex flex-col rounded-[1.75rem] border p-8",
                p.highlight
                  ? "border-iris/50 bg-gradient-to-b from-iris/[0.14] to-white/[0.02] shadow-[0_30px_80px_-30px_rgba(106,75,240,0.6)]"
                  : "border-white/10 bg-white/[0.03]",
              )}
            >
              {p.highlight && (
                <span className="font-data absolute -top-3.5 left-8 rounded-full bg-iris px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white shadow-iris">
                  mais escolhido
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <h3 className="font-editorial text-3xl text-white">{p.name}</h3>
              </div>
              <p className="font-data mt-1 text-xs uppercase tracking-wider text-bruma/45">{p.tagline}</p>

              <p className="mt-7 flex items-baseline gap-1.5 text-white">
                <span className="font-data text-sm text-bruma/50">R$</span>
                <span className="font-editorial text-6xl leading-none tracking-tight">{price}</span>
                <span className="font-data text-sm text-bruma/50">/mês</span>
              </p>
              <p className="font-data mt-2 h-4 text-[11px] uppercase tracking-wider text-zap">
                {annual ? `cobrado R$ ${(price * 12).toLocaleString("pt-BR")} por ano` : " "}
              </p>

              <ul className="mt-7 flex-1 space-y-3 border-t border-white/10 pt-7">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-bruma/70">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-zap" />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={signupUrl}
                className={cn(
                  "lp-btn mt-8 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium transition",
                  p.highlight
                    ? "lp-btn-primary bg-iris text-white"
                    : "border border-white/15 text-white hover:border-iris-claro/60 hover:text-iris-claro",
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
