"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Eye,
  Users,
  MousePointerClick,
  ShoppingBag,
  RotateCcw,
  Megaphone,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "Semana" | "Mês";

const STATS: Record<Period, { label: string; value: string; delta: string; spark: number[] }[]> = {
  Semana: [
    { label: "Membros novos", value: "+312", delta: "+18%", spark: [20, 26, 24, 30, 28, 36, 42] },
    { label: "Receita", value: "R$ 84k", delta: "+31%", spark: [40, 48, 44, 60, 56, 72, 84] },
    { label: "Conversão", value: "38%", delta: "+4 p.p.", spark: [30, 32, 31, 34, 33, 36, 38] },
    { label: "Recuperado · recompra", value: "R$ 12k", delta: "+22%", spark: [6, 8, 7, 9, 10, 11, 12] },
  ],
  Mês: [
    { label: "Membros novos", value: "+1.184", delta: "+24%", spark: [60, 70, 80, 90, 110, 130, 150] },
    { label: "Receita", value: "R$ 318k", delta: "+27%", spark: [180, 200, 220, 250, 270, 300, 318] },
    { label: "Conversão", value: "36%", delta: "+3 p.p.", spark: [30, 31, 32, 33, 34, 35, 36] },
    { label: "Recuperado · recompra", value: "R$ 41k", delta: "+19%", spark: [22, 26, 30, 33, 36, 39, 41] },
  ],
};

const FUNNEL = [
  { icon: Eye, label: "Viram o anúncio", value: "4.820", pct: 100 },
  { icon: Users, label: "Entraram no grupo", value: "1.240", pct: 26 },
  { icon: MousePointerClick, label: "Interagiram", value: "680", pct: 14 },
  { icon: ShoppingBag, label: "Compraram", value: "312", pct: 6.5 },
  { icon: RotateCcw, label: "Voltaram a comprar", value: "148", pct: 3 },
];

const ACTIVITY = [
  { label: "Vivos", count: 17, color: "#1E8E5A" },
  { label: "Atenção", count: 2, color: "#D99B2A" },
  { label: "Parados", count: 5, color: "#D84040" },
];

const BY_CAMPAIGN = [
  { name: "Oferta da Semana", value: "R$ 34k", pct: 100 },
  { name: "Lançamento Inverno", value: "R$ 28k", pct: 82 },
  { name: "Recompra VIP", value: "R$ 12k", pct: 35 },
  { name: "Promo Fim de Mês", value: "R$ 10k", pct: 29 },
];

export default function PainelResultados() {
  const [period, setPeriod] = useState<Period>("Semana");
  const totalGroups = ACTIVITY.reduce((a, x) => a + x.count, 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Resultados</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
            Crescimento, atividade e eficiência — sem número inflado
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-breu/10 bg-white p-1">
          {(["Semana", "Mês"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                period === p ? "bg-breu text-white" : "text-aco/70 hover:text-breu",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS[period].map((s) => (
          <div key={s.label} className="rounded-2xl border border-breu/[0.08] bg-white p-4">
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{s.label}</p>
            <p className="font-display mt-1.5 text-2xl font-extrabold tracking-tight text-breu">
              {s.value}
            </p>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-data inline-flex items-center gap-0.5 text-[11px] text-sucesso">
                <ArrowUpRight className="h-3 w-3" />
                {s.delta}
              </span>
              <Sparkline points={s.spark} />
            </div>
          </div>
        ))}
      </div>

      {/* Funil + lateral */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Funil real */}
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-6 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-base font-bold text-breu">O caminho até a venda</h2>
            <span className="font-data rounded-full bg-bruma px-2 py-0.5 text-[10px] uppercase tracking-wider text-aco/55">
              funil real
            </span>
          </div>
          <div className="mt-6 space-y-3">
            {FUNNEL.map((s, i) => {
              const Icon = s.icon;
              const prev = i > 0 ? FUNNEL[i - 1].pct : null;
              const stepConv = prev ? Math.round((s.pct / prev) * 100) : null;
              return (
                <div key={s.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-aco">
                      <Icon className="h-4 w-4 text-iris" />
                      {s.label}
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-display text-lg font-extrabold tabular-nums text-breu">
                        {s.value}
                      </span>
                      {stepConv != null && (
                        <span className="font-data text-[11px] text-aco/45">
                          {stepConv}% do passo
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-bruma">
                    <div
                      className="hf-gradient h-full rounded-full"
                      style={{ width: `${Math.max(s.pct, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="font-data mt-6 text-[11px] text-aco/50">
            De cada 100 que viram o anúncio, ~6 compraram e ~3 voltaram. Foque o próximo passo em
            quem interagiu mas não comprou.
          </p>
        </div>

        {/* Lateral: atividade + retorno */}
        <div className="space-y-5">
          {/* Atividade dos grupos */}
          <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
            <h2 className="font-display text-base font-bold text-breu">Atividade dos grupos</h2>
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full">
              {ACTIVITY.map((a) => (
                <div
                  key={a.label}
                  style={{ width: `${(a.count / totalGroups) * 100}%`, background: a.color }}
                />
              ))}
            </div>
            <div className="mt-4 space-y-2.5">
              {ACTIVITY.map((a) => (
                <div key={a.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-aco">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                    {a.label}
                  </span>
                  <span className="font-data tabular-nums text-breu">{a.count} grupos</span>
                </div>
              ))}
            </div>
          </div>

          {/* Retorno do anúncio */}
          <div className="rounded-3xl bg-breu p-6 text-white">
            <p className="font-data text-[10px] uppercase tracking-[0.2em] text-iris-claro/80">
              Retorno do anúncio
            </p>
            <p className="font-display mt-3 text-4xl font-extrabold tracking-tight">R$ 6,40</p>
            <p className="mt-1 text-sm text-bruma/55">pra cada R$ 1 investido em anúncio</p>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.06] px-3 py-2.5">
              <span className="font-data text-xs text-bruma/60">R$ 13k investido</span>
              <ChevronRight className="h-4 w-4 text-bruma/40" />
              <span className="font-data text-xs font-medium text-[#5ED9A0]">R$ 84k em venda</span>
            </div>
          </div>
        </div>
      </div>

      {/* Eficiência + recompra */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Receita por campanha */}
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-6 lg:col-span-2">
          <h2 className="font-display text-base font-bold text-breu">Receita por campanha</h2>
          <div className="mt-5 space-y-4">
            {BY_CAMPAIGN.map((c) => (
              <div key={c.name} className="flex items-center gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-iris/10 text-iris">
                  <Megaphone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm text-breu">{c.name}</p>
                    <p className="font-display text-sm font-bold tabular-nums text-breu">{c.value}</p>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bruma">
                    <div className="h-full rounded-full bg-iris" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recompra a recuperar */}
        <div className="flex flex-col justify-between rounded-3xl border border-iris/20 bg-iris/[0.05] p-6">
          <div>
            <p className="font-data text-[10px] uppercase tracking-wider text-iris-escuro">
              Dinheiro na mesa
            </p>
            <p className="font-display mt-3 text-3xl font-extrabold tracking-tight text-breu">
              R$ 23k
            </p>
            <p className="mt-1 text-sm text-aco">
              <strong className="text-breu">64 clientes</strong> compraram e sumiram. Uma recompra
              traz boa parte de volta.
            </p>
          </div>
          <button className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-iris py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro">
            <RotateCcw className="h-4 w-4" /> Criar recompra
          </button>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 56;
  const h = 18;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <path d={d} stroke="#6A4BF0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
