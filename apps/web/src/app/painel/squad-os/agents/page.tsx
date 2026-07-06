"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Zap, Star, Gauge } from "lucide-react";
import { getAgents } from "@/lib/stores/squad-os";
import type { Agent } from "@/lib/types/squad-os";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const a = await getAgents();
      setAgents(a);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/painel/squad-os"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/50 transition hover:bg-white hover:text-breu"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
            Agents
          </h1>
          <p className="font-data mt-0.5 text-[11px] uppercase tracking-wider text-aco/60">
            {agents.length} agentes configurados
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="group flex flex-col rounded-2xl border border-breu/[0.08] bg-white p-5 transition hover:-translate-y-0.5 hover:border-iris/30 hover:shadow-md"
          >
            {/* Avatar + name */}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-iris/20 to-iris/5">
                <Bot className="h-5 w-5 text-iris" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-breu">{agent.name}</h3>
                <p className="font-data text-[10px] text-aco/55">{agent.specialty}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-bruma/60 px-2 py-1.5 text-center">
                <Star className="mx-auto h-3 w-3 text-amber-500" />
                <p className="font-data mt-0.5 text-[10px] font-medium text-breu">
                  {agent.reputation}
                </p>
                <p className="font-data text-[8px] uppercase text-aco/40">Rep</p>
              </div>
              <div className="rounded-lg bg-bruma/60 px-2 py-1.5 text-center">
                <Gauge className="mx-auto h-3 w-3 text-iris" />
                <p className="font-data mt-0.5 text-[10px] font-medium text-breu">
                  {agent.speed_rating}/10
                </p>
                <p className="font-data text-[8px] uppercase text-aco/40">Veloc</p>
              </div>
              <div className="rounded-lg bg-bruma/60 px-2 py-1.5 text-center">
                <Zap className="mx-auto h-3 w-3 text-sucesso" />
                <p className="font-data mt-0.5 text-[10px] font-medium text-breu">
                  ${agent.cost_per_run}
                </p>
                <p className="font-data text-[8px] uppercase text-aco/40">Custo</p>
              </div>
            </div>

            {/* Areas */}
            <div className="mt-3 flex flex-wrap gap-1">
              {agent.allowed_areas.map((area) => (
                <span
                  key={area}
                  className="rounded-full bg-iris/[0.07] px-2 py-0.5 font-data text-[9px] text-iris"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
