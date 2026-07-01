"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Bot,
  Zap,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSquads, getAgents, getMissions } from "@/lib/stores/squad-os";
import type { Squad, Agent, Mission } from "@/lib/types/squad-os";
import { SQUAD_STATUS_CONFIG, MISSION_STATUS_CONFIG } from "@/lib/types/squad-os";

export default function SquadDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [squads, allAgents, allMissions] = await Promise.all([
        getSquads(),
        getAgents(),
        getMissions(),
      ]);
      const found = squads.find((s) => s.slug === slug) ?? null;
      setSquad(found);
      setAgents(allAgents);
      setMissions(allMissions.filter((m) => m.squad_id === slug));
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-white" />
        <div className="h-48 animate-pulse rounded-3xl bg-white" />
        <div className="h-64 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  if (!squad) {
    return (
      <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6">
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-atencao" />
          <p className="mt-3 text-sm text-aco/70">Squad não encontrada.</p>
          <Link
            href="/painel/squad-os/squads"
            className="mt-4 inline-flex items-center gap-2 text-sm text-iris hover:text-iris-escuro"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para squads
          </Link>
        </div>
      </div>
    );
  }

  const cfg = SQUAD_STATUS_CONFIG[squad.status];

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-6 sm:px-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/painel/squad-os/squads"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/50 transition hover:bg-white hover:text-breu"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <nav className="font-data text-[11px] uppercase tracking-wider text-aco/50">
          <Link href="/painel/squad-os" className="hover:text-iris">Squad OS</Link>
          {" / "}
          <Link href="/painel/squad-os/squads" className="hover:text-iris">Squads</Link>
          {" / "}
          <span className="text-breu">{squad.name}</span>
        </nav>
      </div>

      {/* Squad Header Card */}
      <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">
                {squad.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium",
                  cfg.bg,
                  cfg.color,
                )}
              >
                {cfg.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-aco/70">{squad.objective}</p>
          </div>

          {/* Health */}
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <Activity
                className={cn(
                  "h-4 w-4",
                  squad.health >= 80
                    ? "text-sucesso"
                    : squad.health >= 50
                      ? "text-atencao"
                      : "text-alerta",
                )}
              />
              <span className="font-display text-xl font-bold">{squad.health}%</span>
            </div>
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/40">
              Saúde
            </span>
          </div>
        </div>

        {/* Meta info */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-breu/[0.06] pt-5 sm:grid-cols-4">
          <div>
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/40">Reputação</p>
            <p className="mt-1 text-sm font-semibold text-breu">{squad.reputation_score}/100</p>
          </div>
          <div>
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/40">Missions</p>
            <p className="mt-1 text-sm font-semibold text-breu">{missions.length}</p>
          </div>
          <div>
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/40">Última entrega</p>
            <p className="mt-1 text-sm text-breu">{squad.last_delivery ?? "—"}</p>
          </div>
          <div>
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/40">Próxima ação</p>
            <p className="mt-1 text-sm font-medium text-iris">{squad.next_action ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Missions */}
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-5 lg:col-span-2">
          <h2 className="font-display text-base font-bold text-breu">Missions</h2>
          {missions.length === 0 ? (
            <div className="mt-4 text-center">
              <Target className="mx-auto h-8 w-8 text-aco/20" />
              <p className="mt-2 text-sm text-aco/50">Nenhuma mission atribuída.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {missions.map((m) => {
                const mCfg = MISSION_STATUS_CONFIG[m.status];
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl border border-breu/[0.05] px-4 py-3 transition hover:border-iris/20 hover:bg-bruma/30"
                  >
                    <MissionIcon status={m.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-breu">{m.title}</p>
                      <p className="line-clamp-1 text-xs text-aco/50">{m.description}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        mCfg.bg,
                        mCfg.color,
                      )}
                    >
                      {mCfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agents */}
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-5">
          <h2 className="font-display text-base font-bold text-breu">Agents</h2>
          <div className="mt-4 space-y-3">
            {agents.slice(0, 4).map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-bruma/50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-iris/10">
                  <Bot className="h-4 w-4 text-iris" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-breu">{agent.name}</p>
                  <p className="font-data text-[10px] text-aco/50">{agent.specialty}</p>
                </div>
                <div className="text-right">
                  <p className="font-data text-[10px] text-aco/40">{agent.reputation}/100</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function MissionIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-sucesso" />;
    case "active":
      return <Zap className="h-4 w-4 shrink-0 text-amber-500" />;
    case "failed":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-alerta" />;
    default:
      return <Clock className="h-4 w-4 shrink-0 text-aco/30" />;
  }
}
