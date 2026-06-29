"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Lock, TrendingUp, TrendingDown } from "lucide-react";
import type { FunnelStage, FunnelInsight } from "@/lib/business-health";

type Props = {
  funnel: FunnelStage[];
  insight: FunnelInsight;
  /** variação % da etapa "entradas" vs semana anterior (única que temos histórico) */
  entradasVar: number | null;
};

const INSIGHT_TONE = {
  green: { wrap: "border-green-200 bg-green-50", text: "text-green-800", emoji: "🟢", btn: "bg-green-600 hover:bg-green-700" },
  amber: { wrap: "border-amber-200 bg-amber-50", text: "text-amber-800", emoji: "🟡", btn: "bg-amber-500 hover:bg-amber-600" },
  red: { wrap: "border-red-200 bg-red-50", text: "text-red-800", emoji: "🔴", btn: "bg-red-600 hover:bg-red-700" },
} as const;

// Etapas mostradas no MODO SIMPLES.
const SIMPLE_KEYS = new Set(["entradas", "pedido", "recompra"]);

export function FunnelVisual({ funnel, insight, entradasVar }: Props) {
  const [detailed, setDetailed] = useState(true);

  const stages = detailed ? funnel : funnel.filter((s) => SIMPLE_KEYS.has(s.key));

  // Valor do topo medido = base de proporção das larguras.
  const topValue = funnel.find((s) => s.available && s.value !== null)?.value ?? 0;

  // Pré-calcula larguras: o funil só estreita. Etapas sem dado afunilam visualmente.
  let prevFrac = 1;
  let prevMeasured: number | null = null;
  const rows = stages.map((s) => {
    let frac: number;
    let pct: number | null = null;
    let loss: number | null = null;
    if (s.available && s.value !== null && topValue > 0) {
      frac = Math.min(prevFrac, Math.max(s.value / topValue, 0.2));
      if (prevMeasured !== null && prevMeasured > 0) {
        pct = Math.round((s.value / prevMeasured) * 100);
        loss = prevMeasured - s.value;
      }
      prevMeasured = s.value;
    } else {
      frac = Math.max(prevFrac - 0.12, 0.18);
    }
    prevFrac = frac;
    return { s, frac, pct, loss };
  });

  const tone = INSIGHT_TONE[insight.tone];

  return (
    <div>
      {/* Toggle simples / detalhado */}
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-lg border border-breu/10 p-0.5 text-xs">
          <button
            onClick={() => setDetailed(false)}
            className={`rounded-md px-3 py-1 font-medium transition ${!detailed ? "bg-breu text-white" : "text-aco/70 hover:text-aco"}`}
          >
            Simples
          </button>
          <button
            onClick={() => setDetailed(true)}
            className={`rounded-md px-3 py-1 font-medium transition ${detailed ? "bg-breu text-white" : "text-aco/70 hover:text-aco"}`}
          >
            Detalhado
          </button>
        </div>
      </div>

      {/* Funil vertical */}
      <div className="flex flex-col items-center gap-0">
        {rows.map(({ s, frac, pct, loss }, i) => {
          const locked = !(s.available && s.value !== null);
          return (
            <div key={s.key} className="w-full">
              {/* Camada */}
              <div
                className={`mx-auto flex items-center justify-between rounded-xl px-4 py-3 text-white shadow-sm transition-all ${
                  locked ? "bg-breu/10 text-aco/50" : `${s.color}`
                }`}
                style={{ width: `${Math.round(frac * 100)}%`, minWidth: "180px" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg leading-none">{locked ? "🔒" : s.icon}</span>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${locked ? "text-aco/70" : "text-white"}`}>
                      {s.short}
                    </p>
                    {locked && <p className="text-[11px] leading-tight">em breve</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap text-right">
                  {pct !== null && (
                    <span className="rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-medium">{pct}%</span>
                  )}
                  {s.key === "entradas" && entradasVar !== null && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium">
                      {entradasVar >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {entradasVar >= 0 ? "+" : ""}
                      {entradasVar}%
                    </span>
                  )}
                  <span className="text-lg font-bold tabular-nums">
                    {locked ? <Lock className="h-4 w-4" /> : s.value!.toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>

              {/* Conector + perda entre etapas */}
              {i < rows.length - 1 && (
                <div className="flex items-center justify-center gap-2 py-1">
                  <ArrowDown className="h-3.5 w-3.5 text-aco/30" />
                  {loss !== null && loss > 0 && (
                    <span className="text-[11px] text-aco/50">−{loss.toLocaleString("pt-BR")} no caminho</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Insight automático + CTA */}
      <div className={`mt-5 rounded-xl border p-4 ${tone.wrap}`}>
        <p className={`text-sm font-medium ${tone.text}`}>
          {tone.emoji} {insight.text}
        </p>
        <Link
          href={insight.href}
          className={`mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${tone.btn}`}
        >
          {insight.cta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-aco/50">
        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
        Voltaram e cliente fiel acendem quando você registra pedidos (recompra). Interagiram = membros que
        conversaram no grupo (medido pela engine).
      </p>
    </div>
  );
}
