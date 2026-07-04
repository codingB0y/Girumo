"use client";

import { useMemo, useState } from "react";
import { Check, TrendingDown, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/landing/icons";

/**
 * Comparação SEM × COM HubFlow + calculadora de dinheiro deixado na mesa.
 * Substitui os depoimentos: prova por lógica, não por citação.
 */

const WITHOUT = [
  "2h por dia copiando a mesma oferta, grupo por grupo",
  "Grupo lotou → link morto, lead indo pro concorrente",
  "Venda acontece e você não sabe de qual anúncio veio",
  "Página de captação? Só pagando programador e hospedagem",
];

const WITH = [
  "1 clique posta em todos os grupos, no horário certo",
  "Grupo cheio → o próximo nasce e o link nunca morre",
  "Cada venda com origem: anúncio, story ou bio",
  "Modelos prontos: sua página de captação no ar em minutos",
];

/** Premissa declarada: sem redirecionamento automático, ~35% dos cliques se perdem quando o grupo lota. */
const LOSS_RATE = 0.35;

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function Compare() {
  const [leadsDay, setLeadsDay] = useState(50);
  const [ticket, setTicket] = useState(80);
  const [conv, setConv] = useState(5);

  const monthlyLoss = useMemo(
    () => Math.round(leadsDay * 30 * LOSS_RATE * (conv / 100) * ticket),
    [leadsDay, ticket, conv],
  );

  return (
    <div className="mx-auto max-w-6xl px-5">
      {/* SEM × COM */}
      <div className="grid gap-4 lg:grid-cols-2" data-reveal-group>
        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.02] p-8">
          <p className="font-data flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-bruma/40">
            <span className="h-1.5 w-1.5 rounded-full bg-alerta/70" /> sem o hubflow
          </p>
          <ul className="mt-6 space-y-4">
            {WITHOUT.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-bruma/55">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-alerta/60" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-ring-soft rounded-[1.75rem] border border-transparent bg-void-2 p-8 shadow-deep">
          <p className="font-data flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-zap">
            <WhatsAppIcon className="h-3.5 w-3.5" /> com o hubflow
          </p>
          <ul className="mt-6 space-y-4">
            {WITH.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] font-medium leading-relaxed text-white">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-zap" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* calculadora de prejuízo */}
      <div className="mt-4 rounded-[1.75rem] border border-white/10 bg-white/[0.02] p-8 sm:p-10" data-reveal>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="font-data flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-bruma/40">
              <TrendingDown className="h-4 w-4 text-alerta/70" /> a conta que ninguém faz
            </p>
            <h3 className="font-tech mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Quanto você deixa na mesa todo mês?
            </h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-bruma/55">
              Ajuste pros seus números. A conta considera os cliques que se perdem
              quando o grupo lota e não existe redirecionamento automático.
            </p>

            <div className="mt-8 space-y-6">
              <Slider
                label="Leads que clicam por dia"
                value={leadsDay}
                display={`${leadsDay}`}
                min={10}
                max={500}
                step={10}
                onChange={setLeadsDay}
              />
              <Slider
                label="Ticket médio"
                value={ticket}
                display={money(ticket)}
                min={20}
                max={500}
                step={10}
                onChange={setTicket}
              />
              <Slider
                label="Dos que entram, quantos compram"
                value={conv}
                display={`${conv}%`}
                min={1}
                max={20}
                step={1}
                onChange={setConv}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-alerta/25 bg-alerta/[0.06] p-8 text-center">
            <p className="font-data text-[11px] uppercase tracking-[0.25em] text-bruma/45">
              deixando de ganhar
            </p>
            <p className="font-tech mt-3 text-5xl font-bold tracking-tight text-white sm:text-6xl" aria-live="polite">
              {money(monthlyLoss)}
            </p>
            <p className="font-data mt-1 text-xs uppercase tracking-[0.2em] text-alerta/80">
              por mês · {money(monthlyLoss * 12)} por ano
            </p>
            <div className="my-6 h-px bg-white/10" />
            <p className="flex items-center justify-center gap-2 text-sm text-bruma/60">
              <WhatsAppIcon className="h-4 w-4 text-zap" />
              Com redirecionamento automático:{" "}
              <span className="font-medium text-zap">R$ 0 perdido</span>
            </p>
            <p className="font-data mt-5 text-[10px] uppercase tracking-wider text-bruma/30">
              estimativa · premissa: {LOSS_RATE * 100}% dos cliques se perdem com grupo lotado
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-sm text-bruma/60">{label}</span>
        <span className="font-data text-sm font-medium text-white">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="lp-range mt-3 w-full"
        aria-label={label}
      />
    </label>
  );
}
