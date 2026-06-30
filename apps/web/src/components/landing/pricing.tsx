"use client";

import { useState } from "react";
import { ArrowRight, Check, MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function Pricing({
  signupUrl,
  whatsappUrl,
}: {
  signupUrl: string;
  whatsappUrl: string;
}) {
  const [annual, setAnnual] = useState(false);

  return (
    <div>
      {/* toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={cn("text-sm transition", annual ? "text-bruma/50" : "font-medium text-white")}>
          Mensal
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          aria-label="Alternar cobrança anual"
          onClick={() => setAnnual((v) => !v)}
          className={cn(
            "relative h-7 w-12 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2 focus-visible:ring-offset-breu",
            annual ? "bg-iris" : "bg-white/15",
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
              annual ? "left-6" : "left-1",
            )}
          />
        </button>
        <span className={cn("flex items-center gap-2 text-sm transition", annual ? "font-medium text-white" : "text-bruma/50")}>
          Anual
          <span className="font-data rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-emerald-400 ring-1 ring-inset ring-emerald-400/20">
            2 meses grátis
          </span>
        </span>
      </div>

      <div className="mt-12 grid items-start gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const price = annual ? annualMonthly(p.monthly) : p.monthly;
          return (
            <div
              key={p.name}
              className={cn(
                "relative rounded-3xl border p-7 transition",
                p.highlight
                  ? "border-iris/50 bg-iris/[0.07] shadow-iris hf-glow lg:-mt-4 lg:pb-9"
                  : "border-white/10 bg-white/[0.03] hover:border-iris/40",
              )}
            >
              {p.highlight && (
                <span className="font-data absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-iris px-3 py-1 text-xs uppercase tracking-wider text-white shadow-iris">
                  <Sparkles className="h-3 w-3" /> Mais escolhido
                </span>
              )}
              <p className="font-display text-lg font-bold text-white">{p.name}</p>
              <p className="text-xs text-bruma/55">{p.tagline}</p>
              <p className="mt-5 flex items-end gap-1 text-white">
                <span className="text-sm text-bruma/60">R$</span>
                <span className="font-display text-5xl font-extrabold tracking-[-0.03em]">{price}</span>
                <span className="pb-1.5 text-sm text-bruma/60">/mês</span>
              </p>
              <p className="font-data mt-1 h-4 text-[11px] uppercase tracking-wider text-emerald-400">
                {annual ? `cobrado R$ ${price * 12} por ano` : ""}
              </p>
              <ul className="mt-6 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-bruma/70">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={signupUrl}
                className={cn(
                  "mt-7 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition",
                  p.highlight
                    ? "bg-iris text-white shadow-iris hover:-translate-y-0.5 hover:bg-iris-claro"
                    : "border border-white/15 text-white hover:border-iris hover:text-iris-claro",
                )}
              >
                Criar conta
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={whatsappUrl}
                className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-bruma/55 transition hover:text-iris-claro"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Falar no WhatsApp
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
