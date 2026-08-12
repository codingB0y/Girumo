"use client";

import { useState } from "react";
import { STATUS_LABELS, type BoardEvent, type BoardFeature, type BoardStatus } from "@/lib/quadro/status";

function label(status: string | null): string {
  if (!status) return "—";
  return STATUS_LABELS[status as BoardStatus] ?? status;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface QuadroFeedProps {
  events: BoardEvent[];
  features: BoardFeature[];
}

export function QuadroFeed({ events, features }: QuadroFeedProps) {
  const [open, setOpen] = useState(true);
  const titles = new Map(features.map((f) => [f.id, f.title]));

  return (
    <aside className="w-full shrink-0 lg:w-72">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-data flex w-full items-center justify-between rounded-lg border border-line-200 bg-paper-0 px-3 py-2 text-[11px] uppercase tracking-wider text-aco/70"
      >
        Atividade
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <ol className="mt-2 space-y-2">
          {events.length === 0 ? (
            <li className="px-1 text-xs text-aco/50">Nenhum movimento ainda.</li>
          ) : null}

          {events.map((event) => (
            <li key={event.id} className="rounded-lg border border-line-200 bg-paper-0 p-2.5">
              <p className="font-data text-[10px] uppercase tracking-wider text-aco/45">
                {formatTime(event.createdAt)} · {event.actor}
              </p>
              <p className="mt-1 text-xs font-semibold text-volt-950">
                {event.featureId ? titles.get(event.featureId) ?? "(card removido)" : "—"}
              </p>
              <p className="mt-0.5 text-xs text-aco/70">
                {label(event.fromStatus)} → {label(event.toStatus)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-aco/80">
                {event.note ?? <span className="text-danger-700">movido sem motivo registrado</span>}
              </p>
              {event.ref ? (
                <p className="font-data mt-1 text-[10px] uppercase tracking-wider text-aco/45">
                  {event.ref}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}
