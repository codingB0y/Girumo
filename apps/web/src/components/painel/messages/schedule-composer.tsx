"use client";

import { useState } from "react";
import { Calendar, Clock, Repeat, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageComposer, type ComposerPayload } from "./message-composer";

export type SchedulePayload = ComposerPayload & {
  scheduledAt: string;
  recurrence: "none" | "daily" | "weekly";
};

type Props = {
  onSchedule: (payload: SchedulePayload) => Promise<void>;
  scheduling?: boolean;
  className?: string;
};

export function ScheduleComposer({ onSchedule, scheduling, className }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly">("none");
  const [pendingPayload, setPendingPayload] = useState<ComposerPayload | null>(null);

  const handleSend = async (payload: ComposerPayload) => {
    if (!date || !time) {
      setPendingPayload(payload);
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    await onSchedule({ ...payload, scheduledAt, recurrence });
    setDate("");
    setTime("");
    setRecurrence("none");
    setPendingPayload(null);
  };

  const submitPending = async () => {
    if (!pendingPayload || !date || !time) return;
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    await onSchedule({ ...pendingPayload, scheduledAt, recurrence });
    setDate("");
    setTime("");
    setRecurrence("none");
    setPendingPayload(null);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Date/time picker */}
      <div className="rounded-2xl border border-volt-950/[0.08] bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium text-volt-950">
          <Calendar className="h-4 w-4 text-cobalt-500" /> Agendar envio
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="font-data text-[10px] uppercase tracking-wider text-aco/50">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="mt-1 w-full rounded-lg border border-volt-950/10 bg-canvas-100/30 px-3 py-2 text-sm text-volt-950 focus:border-cobalt-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="font-data text-[10px] uppercase tracking-wider text-aco/50">Horário</label>
            <div className="mt-1 flex items-center gap-2">
              <Clock className="h-4 w-4 text-aco/40" />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="flex-1 rounded-lg border border-volt-950/10 bg-canvas-100/30 px-3 py-2 text-sm text-volt-950 focus:border-cobalt-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="font-data text-[10px] uppercase tracking-wider text-aco/50">Recorrência</label>
            <div className="mt-1 flex items-center gap-2">
              <Repeat className="h-4 w-4 text-aco/40" />
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as "none" | "daily" | "weekly")}
                className="flex-1 rounded-lg border border-volt-950/10 bg-canvas-100/30 px-3 py-2 text-sm text-volt-950 focus:border-cobalt-500 focus:outline-none"
              >
                <option value="none">Única vez</option>
                <option value="daily">Diário</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pending payload alert */}
        {pendingPayload && (!date || !time) && (
          <div className="mt-3 rounded-xl bg-atencao/10 px-3 py-2 text-xs text-atencao">
            Selecione data e horário para confirmar o agendamento.
          </div>
        )}
        {pendingPayload && date && time && (
          <button
            onClick={submitPending}
            disabled={scheduling}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2 text-sm font-medium text-white shadow-brand transition hover:-translate-y-0.5 hover:bg-cobalt-500"
          >
            {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            Confirmar agendamento
          </button>
        )}
      </div>

      {/* Reusa o composer de mensagem */}
      <MessageComposer
        onSend={handleSend}
        sending={scheduling}
      />
    </div>
  );
}
