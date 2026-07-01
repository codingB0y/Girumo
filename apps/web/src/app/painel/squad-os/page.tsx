"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Bot,
  Target,
  Brain,
  Activity,
  ArrowRight,
  Zap,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSquads, getAgents, getMissions, getDecisions } from "@/lib/stores/squad-os";
import { useRealtimeSquads, useRealtimeMissions, useRealtimeDecisions } from "@/lib/hooks/use-realtime-squad-os";
import type { Squad, Agent, Mission, Decision } from "@/lib/types/squad-os";
import { SQUAD_STATUS_CONFIG } from "@/lib/types/squad-os";

export default function SquadOSPage() {
  const [initialSquads, setInitialSquads] = useState<Squad[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [initialMissions, setInitialMissions] = useState<Mission[]>([]);
  const [initialDecisions, setInitialDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [s, a, m, d] = await Promise.all([
        getSquads(),
        getAgents(),
        getMissions(),
        getDecisions(),
      ]);
      setInitialSquads(s);
      setAgents(a);
      setInitialMissions(m);
      setInitialDecisions(d);
      setLoading(false);
    })();
  }, []);

  // Realtime — UI atualiza automaticamente quando o banco muda
  const squads = useRealtimeSquads(initialSquads);
  const missions = useRealtimeMissions(initialMissions);
  const decisions = useRealtimeDecisions(initialDecisions);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-white" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  const activeSquads = squads.filter((s) => s.status !== "completed");
  const activeMissions = missions.filter((m) => m.status === "active");
  const completedMissions = missions.filter((m) => m.status === "completed");
  const avgHealth = Math.round(
    squads.reduce((a, s) => a + s.health, 0) / (squads.length || 1),
  );

  const stats = [
    {
      label: "Squads ativas",
      value: activeSquads.length,
      total: squads.length,
      icon: Users,
      color: "text-iris",
    },
    {
      label: "Agents disponíveis",
      value: agents.length,
      total: null,
      icon: Bot,
      color: "text-purple-600",
    },
    {
      label: "Missions em andamento",
      value: activeMissions.length,
      total: missions.length,
      icon: Target,
      color: "text-amber-600",
    },
    {
      label: "Saúde média",
      value: `${avgHealth}%`,
      total: null,
      icon: Activity,
      color: avgHealth >= 80 ? "text-sucesso" : "text-atencao",
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">
            Equipe AI
          </h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
            Squad OS · Operando o HubFlow
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sucesso/10 px-2 py-0.5 text-[9px] text-sucesso">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sucesso" />
              Realtime
            </span>
          </p>
        </div>
        <Link
          href="/painel/squad-os/squads"
          className="hidden items-center gap-2 rounded-xl bg-iris px-4 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro sm:inline-flex"
        >
          <Users className="h-4 w-4" />
          Ver squads
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-breu/[0.08] bg-white p-4 transition-all"
          >
            <div className="flex items-center gap-2">
              <s.icon className={cn("h-4 w-4", s.color)} />
              <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">
                {s.label}
              </span>
            </div>
            <p className="font-display mt-2 text-2xl font-extrabold tracking-tight text-breu">
              {s.value}
              {s.total !== null && (
                <span className="text-sm font-normal text-aco/40">/{s.total}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Squads Grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-breu">Squads</h2>
          <Link
            href="/painel/squad-os/squads"
            className="font-data flex items-center gap-1 text-[11px] uppercase tracking-wider text-iris transition hover:text-iris-escuro"
          >
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {squads.slice(0, 8).map((squad) => {
            const cfg = SQUAD_STATUS_CONFIG[squad.status];
            return (
              <Link
                key={squad.id}
                href={`/painel/squad-os/squads/${squad.slug}`}
                className="group rounded-2xl border border-breu/[0.08] bg-white p-4 transition hover:-translate-y-0.5 hover:border-iris/30 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-breu">{squad.name}</h3>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      cfg.bg,
                      cfg.color,
                    )}
                  >
                    {cfg.label}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-aco/60">
                  {squad.objective}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-aco/40" />
                    <span className="font-data text-[10px] text-aco/50">
                      {squad.health}%
                    </span>
                  </div>
                  {squad.next_action && (
                    <span className="max-w-[120px] truncate font-data text-[10px] text-aco/40">
                      → {squad.next_action}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Missions + Decisions */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Active Missions */}
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-breu">Missions ativas</h2>
            <Link
              href="/painel/squad-os/missions"
              className="font-data text-[11px] uppercase tracking-wider text-iris transition hover:text-iris-escuro"
            >
              Ver todas →
            </Link>
          </div>
          {activeMissions.length === 0 ? (
            <p className="mt-4 text-sm text-aco/60">Nenhuma mission ativa.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {activeMissions.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-bruma/50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Zap className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-breu">
                      {m.title}
                    </p>
                    <p className="font-data text-[11px] text-aco/55">
                      {squads.find((s) => s.id === m.squad_id)?.name ?? m.squad_id}
                    </p>
                  </div>
                  <Clock className="h-4 w-4 shrink-0 text-aco/30" />
                </div>
              ))}
            </div>
          )}

          {/* Completed */}
          {completedMissions.length > 0 && (
            <div className="mt-4 border-t border-breu/[0.06] pt-4">
              <p className="font-data mb-2 text-[10px] uppercase tracking-wider text-aco/40">
                Concluídas recentemente
              </p>
              {completedMissions.slice(0, 2).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4 text-sucesso" />
                  <span className="truncate text-sm text-breu">{m.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Decisions */}
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
          <h2 className="font-display text-base font-bold text-breu">Decisões ativas</h2>
          <div className="mt-4 space-y-3">
            {decisions.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-breu/[0.05] px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-breu">{d.title}</p>
                  <span className="font-data flex items-center gap-1 text-[10px] text-sucesso">
                    <Brain className="h-3 w-3" />
                    {d.confidence}/100
                  </span>
                </div>
                <p className="mt-1 text-xs text-aco/55">{d.rationale}</p>
                <span className="font-data mt-2 inline-block rounded-full bg-bruma px-2 py-0.5 text-[9px] uppercase tracking-wider text-aco/50">
                  {d.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
