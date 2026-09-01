/**
 * Ritmo da semana: entradas nos grupos por dia, nos últimos 7 dias.
 *
 * Só entra aqui o que tem data por evento. `leads.entered_at` tem; o contador
 * de cliques (`tracked_links.clicks`) não — é um acumulado que a rota `/r/:slug`
 * incrementa sem guardar quando cada clique aconteceu. Derivar uma curva diária
 * desse total seria desenhar ficção, então cliques ficam de fora até existir
 * registro por evento.
 *
 * O balde é o dia de **Brasília**, igual aos KPIs da Início — os dois leem
 * `@/lib/date-br`. Antes era UTC, e a justificativa era que o gráfico precisava
 * concordar com o card logo acima dele; concordavam, mas os dois viravam o dia
 * às 21h. Agora concordam no fuso certo.
 */

import { dayBRAgo, dayBROf } from "./date-br";

/** Janela do gráfico, em dias, terminando hoje. */
export const WEEK_DAYS = 7;

export type RhythmEntry = {
  /** ISO 8601, ou qualquer string que comece com `YYYY-MM-DD`. */
  enteredAt?: string;
};

export type RhythmBar = {
  /** `YYYY-MM-DD` no fuso de Brasília. */
  date: string;
  /** Entradas nos grupos nesse dia. */
  count: number;
  /** Abreviação do dia da semana, minúscula: `seg`, `ter`… */
  weekdayShort: string;
  /** Rótulo completo para leitor de tela: `Hoje, 12/08`, `quinta, 06/08`. */
  label: string;
  isToday: boolean;
};

const WEEKDAY_SHORT = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  timeZone: "UTC",
});
const WEEKDAY_LONG = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  timeZone: "UTC",
});

/** `qua.` / `qua` conforme o ICU da versão do Node — o ponto final some aqui. */
function weekdayShortOf(date: string): string {
  return WEEKDAY_SHORT.format(new Date(`${date}T12:00:00.000Z`)).replace(/\.$/, "");
}

function weekdayLongOf(date: string): string {
  return WEEKDAY_LONG.format(new Date(`${date}T12:00:00.000Z`))
    .replace(/-feira$/, "")
    .trim();
}

/** `2026-08-06` → `06/08`. */
function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

/**
 * Sete baldes, do mais antigo para hoje, com zero nos dias parados.
 *
 * Entradas sem data ou fora da janela ficam de fora em vez de cair no primeiro
 * dia — um lead de março não é movimento desta semana.
 */
export function weeklyRhythm(
  entries: readonly RhythmEntry[],
  now: Date = new Date(),
): RhythmBar[] {
  const buckets = new Map<string, number>();
  for (let i = WEEK_DAYS - 1; i >= 0; i--) buckets.set(dayBRAgo(i, now), 0);

  for (const entry of entries) {
    const key = dayBROf(entry.enteredAt);
    if (!key || !buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const today = dayBRAgo(0, now);
  const yesterday = dayBRAgo(1, now);

  return [...buckets.entries()].map(([date, count]) => {
    const isToday = date === today;
    const name = isToday ? "Hoje" : date === yesterday ? "Ontem" : weekdayLongOf(date);
    return {
      date,
      count,
      weekdayShort: weekdayShortOf(date),
      label: `${name}, ${shortDate(date)}`,
      isToday,
    };
  });
}
