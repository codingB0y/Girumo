"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/painel/empty-state";

type Schedule = {
  id: string;
  campaignName: string;
  scheduledAt: string;
  status: string;
};

function getWeekDays(start: Date): Date[] {
  const days: Date[] = [];
  const d = new Date(start);
  d.setDate(d.getDate() - d.getDay());
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function PainelAgenda() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    fetch("/api/schedules")
      .then((r) => r.json())
      .then((d) => setSchedules(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const schedulesByDay = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of schedules) {
      const date = new Date(s.scheduledAt);
      const key = date.toISOString().slice(0, 10);
      const existing = map.get(key) ?? [];
      existing.push(s);
      map.set(key, existing);
    }
    return map;
  }, [schedules]);

  function prevWeek() {
    setWeekStart((w) => {
      const d = new Date(w);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setWeekStart((w) => {
      const d = new Date(w);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToday() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    setWeekStart(d);
  }

  const weekLabel = `${days[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${days[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white" />
        <div className="h-96 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Agenda</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">Calendário de disparos</p>
        <div className="mt-6">
          <EmptyState
            icon={Clock}
            title="Nenhum agendamento"
            description="Agende disparos nas suas campanhas para visualizar aqui no calendário."
            ctaLabel="Criar campanha"
            ctaHref="/painel/campanhas/nova"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Agenda</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">Calendário de disparos</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="rounded-lg border border-breu/10 bg-white px-3 py-1.5 text-xs font-medium text-breu transition hover:border-iris/30">
            Hoje
          </button>
          <button onClick={prevWeek} className="flex h-8 w-8 items-center justify-center rounded-lg border border-breu/10 bg-white transition hover:border-iris/30" aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4 text-aco" />
          </button>
          <span className="font-data text-sm font-medium text-breu">{weekLabel}</span>
          <button onClick={nextWeek} className="flex h-8 w-8 items-center justify-center rounded-lg border border-breu/10 bg-white transition hover:border-iris/30" aria-label="Próxima semana">
            <ChevronRight className="h-4 w-4 text-aco" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const key = day.toISOString().slice(0, 10);
          const daySchedules = schedulesByDay.get(key) ?? [];
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={key}
              className={cn(
                "min-h-[140px] rounded-2xl border bg-white p-3 transition",
                isToday ? "border-iris/40 ring-2 ring-iris/10" : "border-breu/[0.08]",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("font-data text-[10px] uppercase tracking-wider", isToday ? "text-iris" : "text-aco/50")}>
                  {DAY_NAMES[i]}
                </span>
                <span className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                  isToday ? "bg-iris text-white" : "text-breu",
                )}>
                  {day.getDate()}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {daySchedules.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-lg px-2 py-1.5 text-[11px] font-medium",
                      s.status === "completed" ? "bg-sucesso/10 text-sucesso" : s.status === "pending" ? "bg-iris/10 text-iris" : "bg-bruma text-aco/70",
                    )}
                  >
                    <p className="truncate">{s.campaignName}</p>
                    <p className="font-data text-[9px] opacity-70">
                      {new Date(s.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
                {daySchedules.length === 0 && (
                  <Link
                    href="/painel/campanhas/nova"
                    className="flex h-8 items-center justify-center rounded-lg border border-dashed border-breu/10 text-aco/30 transition hover:border-iris/40 hover:text-iris"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
