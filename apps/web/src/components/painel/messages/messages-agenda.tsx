"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Repeat,
  Trash2,
  Send,
  Image,
  Video,
  Mic,
  FileUp,
  BarChart3,
  AtSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampaignMessage } from "@/lib/messages-store";

type Props = {
  messages: CampaignMessage[];
  onCancel: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  className?: string;
};

const STATUS_BADGE: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  scheduled: { label: "Agendado", color: "bg-cobalt-500/10 text-cobalt-500", icon: Clock },
  queued: { label: "Na fila", color: "bg-atencao/10 text-atencao", icon: Loader2 },
  running: { label: "Enviando", color: "bg-atencao/10 text-atencao", icon: Loader2 },
  sent: { label: "Enviado", color: "bg-sucesso/10 text-sucesso", icon: CheckCircle2 },
  failed: { label: "Falhou", color: "bg-alerta/10 text-alerta", icon: XCircle },
  draft: { label: "Rascunho", color: "bg-canvas-100 text-aco", icon: Send },
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Send,
  image: Image,
  video: Video,
  audio: Mic,
  file: FileUp,
  poll: BarChart3,
};

export function MessagesAgenda({ messages, onCancel, onDelete, className }: Props) {
  const [view, setView] = useState<"timeline" | "calendar">("timeline");

  // Agrupa por dia
  const grouped = useMemo(() => {
    const sorted = [...messages].sort((a, b) => {
      const dateA = a.scheduledAt ?? a.createdAt;
      const dateB = b.scheduledAt ?? b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    const groups: Record<string, CampaignMessage[]> = {};
    for (const m of sorted) {
      const day = (m.scheduledAt ?? m.createdAt).slice(0, 10);
      if (!groups[day]) groups[day] = [];
      groups[day].push(m);
    }
    return groups;
  }, [messages]);

  // Calendar dots
  const daysWithMessages = useMemo(() => new Set(Object.keys(grouped)), [grouped]);

  // Current month calendar
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const calendarDays = useMemo(() => {
    const [year, month] = calMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const startDay = first.getDay(); // 0=Sunday
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: { day: number; date: string; hasMsg: boolean }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, date: dateStr, hasMsg: daysWithMessages.has(dateStr) });
    }
    return { days, startDay, year, month };
  }, [calMonth, daysWithMessages]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* View toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView("timeline")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            view === "timeline" ? "bg-cobalt-500/10 text-cobalt-500" : "text-aco/50 hover:text-volt-950",
          )}
        >
          Timeline
        </button>
        <button
          onClick={() => setView("calendar")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            view === "calendar" ? "bg-cobalt-500/10 text-cobalt-500" : "text-aco/50 hover:text-volt-950",
          )}
        >
          <Calendar className="mr-1 inline h-3.5 w-3.5" />
          Calendário
        </button>
      </div>

      {view === "calendar" && (
        <div className="rounded-2xl border border-volt-950/[0.08] bg-white p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const [y, m] = calMonth.split("-").map(Number);
                const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
                setCalMonth(prev);
              }}
              className="text-aco/50 hover:text-volt-950"
              aria-label="Mês anterior"
            >
              ←
            </button>
            <span className="font-display text-sm font-bold text-volt-950">
              {new Date(calendarDays.year, calendarDays.month - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </span>
            <button
              onClick={() => {
                const [y, m] = calMonth.split("-").map(Number);
                const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
                setCalMonth(next);
              }}
              className="text-aco/50 hover:text-volt-950"
              aria-label="Próximo mês"
            >
              →
            </button>
          </div>

          {/* Weekday headers */}
          <div className="mt-3 grid grid-cols-7 text-center">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <span key={i} className="font-data text-[10px] text-aco/50">{d}</span>
            ))}
          </div>

          {/* Days grid */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: calendarDays.startDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {calendarDays.days.map(({ day, date, hasMsg }) => {
              const isToday = date === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={date}
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-lg text-xs",
                    isToday && "bg-cobalt-500/10 font-bold text-cobalt-500",
                    !isToday && "text-aco/70",
                  )}
                >
                  {day}
                  {hasMsg && (
                    <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cobalt-500" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      {messages.length === 0 ? (
        <div className="rounded-2xl border border-volt-950/[0.08] bg-white px-5 py-12 text-center">
          <p className="font-display text-base font-bold text-volt-950">Nenhuma mensagem ainda</p>
          <p className="mt-1 text-sm text-aco/60">Envie ou agende mensagens para os grupos desta campanha.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([day, msgs]) => (
            <div key={day}>
              <h4 className="font-data mb-2 text-[11px] uppercase tracking-wider text-aco/50">
                {formatDay(day)}
              </h4>
              <div className="space-y-2">
                {msgs.map((m) => (
                  <MessageRow key={m.id} msg={m} onCancel={onCancel} onDelete={onDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({
  msg,
  onCancel,
  onDelete,
}: {
  msg: CampaignMessage;
  onCancel: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const badge = STATUS_BADGE[msg.status] ?? STATUS_BADGE.draft;
  const BadgeIcon = badge.icon;
  const TypeIcon = TYPE_ICON[msg.type] ?? Send;
  const isScheduled = msg.status === "scheduled";
  const canDelete = ["draft", "sent", "failed"].includes(msg.status);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-volt-950/[0.06] bg-white p-3 transition hover:border-volt-950/10">
      {/* Type icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-100">
        <TypeIcon className="h-4 w-4 text-aco/60" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-volt-950">
          {msg.body || (msg.poll ? `📊 ${msg.poll.question}` : msg.mediaName ?? "Mídia")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", badge.color)}>
            <BadgeIcon className={cn("h-3 w-3", msg.status === "running" && "animate-spin")} />
            {badge.label}
          </span>
          {msg.scheduledAt && (
            <span className="font-data text-[10px] text-aco/50">
              {new Date(msg.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {msg.recurrence !== "none" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-aco/50">
              <Repeat className="h-3 w-3" />
              {msg.recurrence === "daily" ? "Diário" : "Semanal"}
            </span>
          )}
          {msg.mentionAll && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-cobalt-500">
              <AtSign className="h-3 w-3" /> Todos
            </span>
          )}
          {msg.status === "sent" && (
            <span className="font-data text-[10px] text-sucesso">
              {msg.sent}/{msg.total} grupos
            </span>
          )}
          {msg.error && (
            <span className="text-[10px] text-alerta">{msg.error}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {isScheduled && (
          <button
            onClick={() => onCancel(msg.id)}
            className="rounded-lg p-1.5 text-aco/40 transition hover:bg-atencao/10 hover:text-atencao"
            title="Cancelar agendamento"
            aria-label="Cancelar agendamento"
          >
            <XCircle className="h-4 w-4" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(msg.id)}
            className="rounded-lg p-1.5 text-aco/40 transition hover:bg-alerta/10 hover:text-alerta"
            title="Excluir"
            aria-label="Excluir mensagem"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function formatDay(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10);

  if (dateStr === todayStr) return "Hoje";
  if (dateStr === yesterday) return "Ontem";
  if (dateStr === tomorrow) return "Amanhã";
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
}
