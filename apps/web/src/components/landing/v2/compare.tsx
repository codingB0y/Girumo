"use client";

import { useMemo, useState } from "react";
import { Check, TrendingDown, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/landing/icons";

const WITHOUT = [
  "2h por dia copiando a mesma oferta, grupo por grupo",
  "Grupo lotou → link morto, lead indo pro concorrente",
  "Venda acontece e você não sabe de qual anúncio veio",
  "Página de captação? Só pagando programador e hospedagem",
];

const WITH = [
  "1 clique publica em todos os grupos, no horário certo",
  "Grupo cheio → o próximo nasce e o link nunca morre",
  "Cada venda com origem: anúncio, story ou bio",
  "Modelos prontos: sua página de captação no ar em minutos",
];

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function Compare() {
  const [leadsDay, setLeadsDay] = useState(50);
  const [ticket, setTicket] = useState(80);
  const [conv, setConv] = useState(5);
  const [lossRate, setLossRate] = useState(10);

  const monthlyLoss = useMemo(
    () => Math.round(leadsDay * 30 * (lossRate / 100) * (conv / 100) * ticket),
    [leadsDay, ticket, conv, lossRate],
  );

  return (
    <div className="mx-auto max-w-[var(--content-max)] px-4 md:px-8">
      <div className="grid gap-px bg-volt-800 lg:grid-cols-2" data-reveal-group>
        <section className="bg-paper-0 p-7 text-volt-950 sm:p-9" aria-labelledby="without-title">
          <p id="without-title" className="font-data flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-danger-700">
            <X className="h-4 w-4" /> sem a Girumo
          </p>
          <ul className="mt-7 space-y-5">
            {WITHOUT.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-slate-600">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-volt-950 p-7 text-paper-0 sm:p-9" aria-labelledby="with-title">
          <p id="with-title" className="font-data flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-acid-500">
            <WhatsAppIcon className="h-3.5 w-3.5" /> com a Girumo
          </p>
          <ul className="mt-7 space-y-5">
            {WITH.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] font-medium leading-relaxed text-paper-0">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-acid-500" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-5 bg-paper-0 p-7 text-volt-950 sm:p-10" data-reveal aria-labelledby="loss-title">
        <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <p className="font-data flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-danger-700">
              <TrendingDown className="h-4 w-4" /> a conta que ninguém faz
            </p>
            <h3 id="loss-title" className="mt-4 font-tech text-2xl font-bold tracking-tight sm:text-3xl">
              Quanto você deixa na mesa todo mês?
            </h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">
              Ajuste para os seus números. A conta considera os cliques que se perdem quando o grupo lota e não existe redirecionamento automático.
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
              <Slider
                label="Cliques que não chegam ao próximo grupo"
                value={lossRate}
                display={`${lossRate}%`}
                min={0}
                max={100}
                step={1}
                onChange={setLossRate}
              />
            </div>
          </div>

          <div className="border border-cobalt-500 bg-canvas-100 p-7 text-center sm:p-9">
            <p className="font-data text-[11px] uppercase tracking-[0.14em] text-slate-600">oportunidade estimada</p>
            <p className="mt-3 font-tech text-5xl font-bold tracking-tight text-cobalt-700 sm:text-6xl" aria-live="polite">
              {money(monthlyLoss)}
            </p>
            <p className="mt-2 font-data text-xs uppercase tracking-[0.12em] text-danger-700">
              por mês | {money(monthlyLoss * 12)} por ano
            </p>
            <div className="my-6 h-px bg-line-200" />
            <p className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <WhatsAppIcon className="h-4 w-4 text-acid-500" />
              O redirecionamento mantém o link disponível quando um grupo lota.
            </p>
            <p className="mt-5 font-data text-[10px] uppercase tracking-[0.1em] text-slate-600">
              estimativa ajustável, sem garantia de resultado
            </p>
          </div>
        </div>
      </section>
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
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="font-data text-sm font-medium text-volt-950">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="lp-range mt-3 w-full !bg-slate-600 accent-cobalt-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cobalt-500 [&::-moz-range-thumb]:!border-volt-950 [&::-moz-range-thumb]:!bg-cobalt-500 [&::-moz-range-track]:!bg-slate-600 [&::-webkit-slider-runnable-track]:!bg-slate-600 [&::-webkit-slider-thumb]:!border-volt-950 [&::-webkit-slider-thumb]:!bg-cobalt-500 [&::-webkit-slider-thumb]:!shadow-none"
        aria-label={label}
      />
    </label>
  );
}
