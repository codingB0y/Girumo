/**
 * Registro durável de cada execução do backfill de convites.
 *
 * O cron muta dado de produção todo dia (até 10 grupos por instância) e, até
 * aqui, só falava por `console.warn`/`console.error` — que no plano Hobby da
 * Vercel some em horas. Em 14/08/2026 a execução preencheu zero convites, com
 * os dias vizinhos em 10, e não sobrou NADA para dizer se o disjuntor abriu, se
 * a instância caiu ou se o cron nem rodou. O único rastro era o efeito
 * colateral: contar `invite_url` no banco.
 *
 * Este módulo monta o registro; quem grava é a rota. A montagem fica separada
 * de propósito — é a parte que decide o nível do alerta, e decisão merece
 * teste sem precisar de Supabase nem de `server-only`.
 */

export type BackfillRunResults = {
  filled: number;
  failed: number;
  skipped: number;
  remaining: number;
};

export type BackfillBreakerTrip = {
  tenantId: string;
  reason: string;
};

export type BackfillRunInput = {
  /** Tenants com alguma linha em `instances`, conectada ou não. */
  tenantsSeen: number;
  /** Tenants que chegaram a ser processados (sessão viva). */
  processedInstances: number;
  results: BackfillRunResults;
  breakerTrips: BackfillBreakerTrip[];
};

export type BackfillRunRecord = {
  level: "info" | "warn";
  event: "groups.invite_backfill";
  message: string;
  metadata: Record<string, unknown>;
};

export const BACKFILL_RUN_EVENT = "groups.invite_backfill" as const;

/**
 * Traduz o resultado de um run na linha que vai para `logs`.
 *
 * A ordem das checagens é a ordem do que é mais alarmante, porque só um nível e
 * uma mensagem sobram no fim: disjuntor aberto é o pior (a instância está
 * doente e a fila parou), depois deploy inerte (nada conectado), depois fila
 * cheia sem nenhum convite (o estrago silencioso). Um run que preencheu alguma
 * coisa é `info` mesmo tendo falhas — falha isolada de grupo é rotina.
 */
export function summarizeBackfillRun(input: BackfillRunInput): BackfillRunRecord {
  const { tenantsSeen, processedInstances, results, breakerTrips } = input;

  const metadata: Record<string, unknown> = {
    tenants_seen: tenantsSeen,
    processed_instances: processedInstances,
    filled: results.filled,
    failed: results.failed,
    skipped: results.skipped,
    remaining: results.remaining,
    breaker_trips: breakerTrips.length,
    ...(breakerTrips.length > 0
      ? { breaker_detail: breakerTrips.map((t) => ({ tenant_id: t.tenantId, reason: t.reason })) }
      : {}),
  };

  if (breakerTrips.length > 0) {
    const motivos = breakerTrips.map((t) => t.reason).join(" | ");
    return {
      level: "warn",
      event: BACKFILL_RUN_EVENT,
      message: `Disjuntor abriu em ${breakerTrips.length} tenant(s): falhas seguidas sem nenhum convite, tratadas como problema da instância. A fila desses tenants não avançou. Motivos: ${motivos}`,
      metadata,
    };
  }

  if (processedInstances === 0) {
    return {
      level: "warn",
      event: BACKFILL_RUN_EVENT,
      message: `Nenhuma instância conectada em ${tenantsSeen} tenant(s) — o run não tinha o que fazer. Se isto se repetir, o backfill está parado.`,
      metadata,
    };
  }

  if (results.filled === 0 && (results.failed > 0 || results.skipped > 0)) {
    return {
      level: "warn",
      event: BACKFILL_RUN_EVENT,
      message: `${processedInstances} instância(s) processada(s) e nenhum convite preenchido, com fila pendente (falhas=${results.failed}, adiados=${results.skipped}, restantes=${results.remaining}).`,
      metadata,
    };
  }

  return {
    level: "info",
    event: BACKFILL_RUN_EVENT,
    message: `Backfill preencheu ${results.filled} convite(s) em ${processedInstances} instância(s); restam ${results.remaining} na fila.`,
    metadata,
  };
}
