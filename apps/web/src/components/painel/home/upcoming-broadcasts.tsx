"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Repeat } from "lucide-react";
import { EmptyState } from "@/components/painel/empty-state";
import { formatWhen, upcomingSchedules } from "@/lib/upcoming-schedules";
import type { Schedule } from "./types";

/** Quantos disparos cabem no card sem virar uma lista de rolagem. */
const MAX_ITEMS = 4;

/**
 * Próximos disparos agendados.
 *
 * Só leitura: agendar e cancelar continuam em Campanhas, que é onde a mensagem
 * e os grupos de destino são escolhidos. Aqui o lojista só confere o que já
 * está de pé.
 */
export function UpcomingBroadcasts({ schedules }: { schedules: Schedule[] }) {
  const next = useMemo(() => upcomingSchedules(schedules, MAX_ITEMS), [schedules]);

  if (next.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nenhum disparo agendado"
        description="Agende uma campanha pra ela sair nos grupos na hora certa, sem você precisar lembrar."
        ctaLabel="Ver campanhas"
        ctaHref="/painel/campanhas"
        ctaIcon={ArrowRight}
      />
    );
  }

  return (
    <ul className="pn-card rounded-2xl p-2">
      {next.map((s) => (
        <li key={s.id}>
          <Link
            href="/painel/campanhas"
            className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors duration-[160ms] hover:bg-poco"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cobalt-500/10 text-cobalt-500">
                <CalendarClock className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-volt-950">
                  {s.campaignName || "Campanha sem nome"}
                </span>
                {s.recurrence && s.recurrence !== "none" && (
                  <span className="mt-0.5 flex items-center gap-1 font-data text-[11px] text-aco/55">
                    <Repeat className="h-3 w-3" aria-hidden="true" />
                    {s.recurrence === "weekly" ? "toda semana" : "todo dia"}
                  </span>
                )}
              </span>
            </span>
            <span className="font-data shrink-0 text-xs tabular-nums text-aco/70">
              {formatWhen(s.scheduledAt ?? "")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
