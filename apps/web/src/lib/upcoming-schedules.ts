/**
 * Próximos disparos agendados, para o card da aba Início.
 *
 * Ao contrário do gráfico de ritmo (que agrupa por dia UTC pra concordar com os
 * KPIs), aqui o recorte é o **fuso local do lojista**: "amanhã às 14:00" é uma
 * hora de relógio que ele vai olhar no celular, não um balde de agregação.
 */

/** Status vindos de `/api/schedules` (mapeados de `schedules.status`). */
export type ScheduleStatusLike = "pending" | "sent" | "failed" | "canceled" | (string & {});

export type ScheduleLike = {
  id: string;
  campaignName?: string;
  scheduledAt?: string;
  status?: ScheduleStatusLike;
  recurrence?: string;
};

/**
 * Os `limit` agendamentos ainda por acontecer, do mais próximo ao mais distante.
 *
 * Só `pending`: enviado, falhado e cancelado não são "próximos disparos", e
 * mostrá-los daria a entender que ainda vão sair. Sem data válida também fica
 * de fora — melhor um card mais curto do que uma linha "Invalid Date".
 */
export function upcomingSchedules(
  list: readonly ScheduleLike[],
  limit: number,
  now: Date = new Date(),
): ScheduleLike[] {
  const nowMs = now.getTime();

  return list
    .filter((s) => (s.status ?? "pending") === "pending")
    .map((s) => ({ s, at: s.scheduledAt ? new Date(s.scheduledAt).getTime() : NaN }))
    .filter(({ at }) => Number.isFinite(at) && at >= nowMs)
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map(({ s }) => s);
}

/** `YYYY-MM-DD` do instante, no fuso pedido. */
function localDay(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
}

/** `HH:MM` em 24h, no fuso pedido. */
function localTime(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

/** `15/08` no fuso pedido. */
function localDayMonth(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone }).format(date);
}

const MINUTE_MS = 60_000;
/** Abaixo disso a contagem em minutos é mais útil que a hora do relógio. */
const SOON_MS = 60 * MINUTE_MS;

/**
 * Quando o disparo sai, em linguagem de lojista.
 *
 * `timeZone` indefinido usa o fuso do navegador — que é o certo em produção. Os
 * testes passam um fuso explícito pra não depender da máquina que roda o CI.
 */
export function formatWhen(iso: string, now: Date = new Date(), timeZone?: string): string {
  const when = new Date(iso);
  if (!Number.isFinite(when.getTime())) return "";

  const diff = when.getTime() - now.getTime();
  if (diff <= 0) return "agora";
  if (diff < SOON_MS) {
    const min = Math.max(1, Math.round(diff / MINUTE_MS));
    return `em ${min} min`;
  }

  const time = localTime(when, timeZone);
  const today = localDay(now, timeZone);
  if (localDay(when, timeZone) === today) return `hoje às ${time}`;

  const tomorrow = localDay(new Date(now.getTime() + 24 * 60 * MINUTE_MS), timeZone);
  if (localDay(when, timeZone) === tomorrow) return `amanhã às ${time}`;

  return `${localDayMonth(when, timeZone)} às ${time}`;
}

/**
 * Data e hora absolutas, no fuso local — para "última execução".
 *
 * Aqui o absoluto vence o relativo: "3d" não diz se a automação rodou antes ou
 * depois da campanha de sexta, e é isso que o lojista está conferindo.
 * Devolve string vazia para data ausente ou inválida, e quem chama decide o
 * texto de "nunca rodou".
 */
export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return `${localDayMonth(date, timeZone)} às ${localTime(date, timeZone)}`;
}
