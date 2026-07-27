"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, BookOpen, Lightbulb, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDecisions } from "@/lib/stores/squad-os";
import type { Decision } from "@/lib/types/squad-os";

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  architecture: Shield,
  product: Lightbulb,
  design: BookOpen,
  growth: Brain,
  ops: Brain,
};

export default function KnowledgePage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const d = await getDecisions();
      setDecisions(d);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  const activeDecisions = decisions.filter((d) => d.status === "active");

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/painel/squad-os"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/50 transition hover:bg-white hover:text-volt-950"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
            Knowledge Base
          </h1>
          <p className="font-data mt-0.5 text-[11px] uppercase tracking-wider text-aco/60">
            {activeDecisions.length} decisões ativas · memória do projeto
          </p>
        </div>
      </div>

      {/* Memory layers overview */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Operacional", desc: "Tasks ativas", count: 5, color: "bg-amber-50 text-amber-600" },
          { label: "Projeto", desc: "Arquitetura", count: 8, color: "bg-cobalt-500/10 text-cobalt-500" },
          { label: "Reutilizável", desc: "Playbooks", count: 3, color: "bg-purple-50 text-purple-600" },
          { label: "Estratégico", desc: "Benchmark", count: 2, color: "bg-sucesso/10 text-sucesso" },
        ].map((layer) => (
          <div
            key={layer.label}
            className="rounded-2xl border border-volt-950/[0.08] bg-white p-4"
          >
            <span className={cn("inline-flex rounded-lg px-2 py-1 text-[10px] font-medium", layer.color)}>
              {layer.label}
            </span>
            <p className="font-display mt-2 text-lg font-bold text-volt-950">{layer.count}</p>
            <p className="font-data text-[10px] text-aco/50">{layer.desc}</p>
          </div>
        ))}
      </div>

      {/* Decisions */}
      <div className="rounded-3xl border border-volt-950/[0.08] bg-white p-6">
        <h2 className="font-display text-base font-bold text-volt-950">Decisões Ativas</h2>
        <p className="mt-1 text-xs text-aco/55">
          Decisões registradas que guiam o desenvolvimento da Girumo
        </p>

        <div className="mt-5 space-y-3">
          {activeDecisions.map((d) => {
            const Icon = CATEGORY_ICONS[d.category] ?? Brain;
            return (
              <div
                key={d.id}
                className="rounded-xl border border-volt-950/[0.06] px-5 py-4 transition hover:border-cobalt-500/20 hover:bg-canvas-100/20"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cobalt-500/10">
                    <Icon className="h-4 w-4 text-cobalt-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-volt-950">{d.title}</p>
                      <span className="font-data shrink-0 text-[10px] text-sucesso">
                        {d.confidence}/100
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-aco/60">{d.rationale}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-data rounded-full bg-canvas-100 px-2 py-0.5 text-[9px] uppercase tracking-wider text-aco/50">
                        {d.category}
                      </span>
                      <span className="font-data text-[10px] text-aco/40">
                        {new Date(d.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Playbooks placeholder */}
      <div className="rounded-3xl border border-volt-950/[0.08] bg-white p-6">
        <h2 className="font-display text-base font-bold text-volt-950">Playbooks</h2>
        <p className="mt-1 text-xs text-aco/55">
          Processos validados que as squads seguem
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { name: "Frontend", desc: "Padrões de componentes, Tailwind, a11y" },
            { name: "Growth", desc: "Experimentos, funil, métricas" },
            { name: "Backend", desc: "API routes, RLS, edge functions" },
            { name: "Brand", desc: "Tons, tipografia, paleta Cobalt/Volt" },
            { name: "Produto", desc: "PRD template, priorização, roadmap" },
            { name: "Operações", desc: "Deploy, CI/CD, monitoramento" },
          ].map((pb) => (
            <div
              key={pb.name}
              className="rounded-xl border border-volt-950/[0.05] px-4 py-3 transition hover:border-cobalt-500/20"
            >
              <p className="text-sm font-medium text-volt-950">{pb.name}</p>
              <p className="mt-0.5 text-xs text-aco/50">{pb.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
