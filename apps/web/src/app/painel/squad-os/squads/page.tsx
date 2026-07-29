"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Activity, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSquads, getMissions } from "@/lib/stores/squad-os";
import type { Squad, Mission } from "@/lib/types/squad-os";
import { SQUAD_STATUS_CONFIG } from "@/lib/types/squad-os";

export default function SquadsPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [s, m] = await Promise.all([getSquads(), getMissions()]);
      setSquads(s);
      setMissions(m);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
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
            Squads
          </h1>
          <p className="font-data mt-0.5 text-[11px] uppercase tracking-wider text-aco/60">
            {squads.length} squads · {squads.filter((s) => s.status !== "completed").length} ativas
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {squads.map((squad) => {
          const cfg = SQUAD_STATUS_CONFIG[squad.status];
          const squadMissions = missions.filter((m) => m.squad_id === squad.slug);
          const activeMissions = squadMissions.filter((m) => m.status === "active");
          const completedMissions = squadMissions.filter((m) => m.status === "completed");

          return (
            <Link
              key={squad.id}
              href={`/painel/squad-os/squads/${squad.slug}`}
              className="group flex flex-col rounded-2xl border border-volt-950/[0.08] bg-white p-5 transition hover:-translate-y-0.5 hover:border-cobalt-500/30 hover:shadow-md"
            >
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cobalt-500/10">
                  <Users className="h-5 w-5 text-cobalt-500" />
                </div>
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

              {/* Info */}
              <h3 className="mt-3 text-base font-bold text-volt-950">{squad.name}</h3>
              <p className="mt-1 line-clamp-2 flex-1 text-xs text-aco/60">
                {squad.objective}
              </p>

              {/* Health bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <span className="font-data text-[10px] uppercase tracking-wider text-aco/40">
                    Saúde
                  </span>
                  <span className="font-data text-[10px] text-aco/50">
                    {squad.health}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas-100">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      squad.health >= 80
                        ? "bg-sucesso"
                        : squad.health >= 50
                          ? "bg-atencao"
                          : "bg-alerta",
                    )}
                    style={{ width: `${squad.health}%` }}
                  />
                </div>
              </div>

              {/* Footer stats */}
              <div className="mt-4 flex items-center gap-4 border-t border-volt-950/[0.05] pt-3">
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span className="font-data text-[10px] text-aco/50">
                    {activeMissions.length} ativa{activeMissions.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-sucesso" />
                  <span className="font-data text-[10px] text-aco/50">
                    {completedMissions.length} concluída{completedMissions.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Next action */}
              {squad.next_action && (
                <div className="mt-3 rounded-lg bg-canvas-100/60 px-3 py-2">
                  <p className="font-data text-[10px] uppercase tracking-wider text-aco/40">
                    Próxima ação
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-volt-950">
                    {squad.next_action}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
