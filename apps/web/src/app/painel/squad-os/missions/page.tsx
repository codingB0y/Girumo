"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Zap,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSquads, getMissions } from "@/lib/stores/squad-os";
import { useRealtimeMissions } from "@/lib/hooks/use-realtime-squad-os";
import type { Squad, Mission, MissionStatus } from "@/lib/types/squad-os";
import { MISSION_STATUS_CONFIG } from "@/lib/types/squad-os";

const STATUS_ORDER: MissionStatus[] = ["active", "pending", "validating", "completed", "failed"];

export default function MissionsPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [initialMissions, setInitialMissions] = useState<Mission[]>([]);
  const [filter, setFilter] = useState<MissionStatus | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [s, m] = await Promise.all([getSquads(), getMissions()]);
      setSquads(s);
      setInitialMissions(m);
      setLoading(false);
    })();
  }, []);

  const missions = useRealtimeMissions(initialMissions);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  const filtered =
    filter === "all"
      ? [...missions].sort(
          (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
        )
      : missions.filter((m) => m.status === filter);

  const counts = {
    all: missions.length,
    active: missions.filter((m) => m.status === "active").length,
    pending: missions.filter((m) => m.status === "pending").length,
    validating: missions.filter((m) => m.status === "validating").length,
    completed: missions.filter((m) => m.status === "completed").length,
    failed: missions.filter((m) => m.status === "failed").length,
  };

  // Helper: find squad name by id or slug
  function getSquadName(squadId: string): string {
    const byId = squads.find((s) => s.id === squadId);
    if (byId) return byId.name;
    const bySlug = squads.find((s) => s.slug === squadId);
    if (bySlug) return bySlug.name;
    return squadId;
  }

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
            Missions
          </h1>
          <p className="font-data mt-0.5 text-[11px] uppercase tracking-wider text-aco/60">
            {missions.length} total · {counts.active} em andamento
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-aco/40" />
        {(["all", ...STATUS_ORDER] as const).map((status) => {
          const label =
            status === "all" ? "Todas" : MISSION_STATUS_CONFIG[status].label;
          const count = counts[status];
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                filter === status
                  ? "bg-cobalt-500 text-white"
                  : "bg-white text-aco/70 hover:bg-canvas-100 hover:text-volt-950",
              )}
            >
              {label}
              <span
                className={cn(
                  "font-data rounded-full px-1.5 py-0.5 text-[9px]",
                  filter === status
                    ? "bg-white/20 text-white"
                    : "bg-canvas-100 text-aco/50",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mission list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-volt-950/[0.08] bg-white p-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-aco/20" />
            <p className="mt-3 text-sm text-aco/60">Nenhuma mission neste filtro.</p>
          </div>
        ) : (
          filtered.map((m) => {
            const mCfg = MISSION_STATUS_CONFIG[m.status];
            const squadName = getSquadName(m.squad_id);

            return (
              <div
                key={m.id}
                className="flex items-center gap-4 rounded-2xl border border-volt-950/[0.08] bg-white px-5 py-4 transition hover:border-cobalt-500/20 hover:shadow-sm"
              >
                <MissionIcon status={m.status} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-volt-950">
                    {m.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-aco/55">
                    {m.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="font-data text-[10px] text-cobalt-500">
                      {squadName}
                    </span>
                    <span className="font-data text-[10px] text-aco/40">
                      Prioridade: {m.priority}
                    </span>
                    {m.started_at && (
                      <span className="font-data text-[10px] text-aco/40">
                        Início:{" "}
                        {new Date(m.started_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>

                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium",
                    mCfg.bg,
                    mCfg.color,
                  )}
                >
                  {mCfg.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function MissionIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sucesso/10">
          <CheckCircle2 className="h-5 w-5 text-sucesso" />
        </span>
      );
    case "active":
      return (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
          <Zap className="h-5 w-5 text-amber-600" />
        </span>
      );
    case "failed":
      return (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alerta/10">
          <AlertTriangle className="h-5 w-5 text-alerta" />
        </span>
      );
    default:
      return (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas-100">
          <Clock className="h-5 w-5 text-aco/40" />
        </span>
      );
  }
}
