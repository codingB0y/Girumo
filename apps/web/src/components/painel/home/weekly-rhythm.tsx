"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { weeklyRhythm, WEEK_DAYS, type RhythmEntry } from "@/lib/weekly-rhythm";

/** Altura da pista das barras, em px. */
const TRACK_H = 88;

/**
 * Piso de altura para um dia com movimento. Sem ele, 1 contato numa semana que
 * teve 60 vira uma barra de 1px — some, e o dia parece parado quando não
 * estava. O número impresso acima da barra é que dá o valor exato.
 */
const MIN_FILL_PCT = 8;

/**
 * Entradas nos grupos nos últimos 7 dias.
 *
 * Só contatos: cliques não têm data por evento (ver `lib/weekly-rhythm.ts`), e
 * inventar a curva a partir do contador acumulado seria dado fabricado.
 */
export function WeeklyRhythm({ leads }: { leads: readonly RhythmEntry[] }) {
  const bars = useMemo(() => weeklyRhythm(leads), [leads]);
  const total = useMemo(() => bars.reduce((a, b) => a + b.count, 0), [bars]);
  const peak = useMemo(() => Math.max(...bars.map((b) => b.count)), [bars]);

  return (
    <section className="pn-card rounded-2xl px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">
          Entradas nos grupos — últimos {WEEK_DAYS} dias
        </p>
        <p className="font-data text-sm tabular-nums text-aco/70">
          <span className="font-medium text-volt-950">{total.toLocaleString("pt-BR")}</span>{" "}
          {total === 1 ? "contato" : "contatos"}
        </p>
      </div>

      <ol className="mt-4 flex items-end gap-1.5 sm:gap-2.5">
        {bars.map((bar) => {
          const pct =
            peak > 0 && bar.count > 0
              ? Math.max((bar.count / peak) * 100, MIN_FILL_PCT)
              : 0;

          return (
            <li key={bar.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              {/* O leitor de tela lê a frase inteira; o desenho fica escondido
                  dele pra não virar "12 08 qua" solto. */}
              <span className="sr-only">
                {bar.label}: {bar.count} {bar.count === 1 ? "contato" : "contatos"}
              </span>

              <span
                aria-hidden="true"
                className={cn(
                  "font-data text-[11px] leading-none tabular-nums",
                  bar.count > 0 ? "text-aco/70" : "text-transparent",
                )}
              >
                {bar.count}
              </span>

              <div
                aria-hidden="true"
                className="pn-poco flex w-full items-end overflow-hidden rounded-lg"
                style={{ height: TRACK_H }}
              >
                <div
                  className={cn(
                    "pn-fill w-full rounded-lg",
                    bar.count > 0 ? "bg-cobalt-500" : "bg-transparent",
                  )}
                  style={{ height: `${pct}%` }}
                />
              </div>

              <span
                aria-hidden="true"
                className={cn(
                  "font-data w-full truncate text-center text-[10px] uppercase tracking-[0.04em]",
                  bar.isToday ? "font-medium text-volt-950" : "text-aco/55",
                )}
              >
                {bar.isToday ? "hoje" : bar.weekdayShort}
              </span>
            </li>
          );
        })}
      </ol>

      {total === 0 && (
        <p className="mt-3 border-t border-aco/10 pt-3 text-xs text-aco/65">
          Nenhum contato entrou nos grupos nesta semana. Assim que alguém clicar no link de uma
          campanha e entrar, o movimento aparece aqui.
        </p>
      )}
    </section>
  );
}
