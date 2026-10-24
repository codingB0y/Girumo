/**
 * Manutenção da fila — roda a cada tick, INDEPENDENTE do loop de envio.
 *
 * Fica fora do `if (sendDeps)` de propósito: sem Evolution configurada o worker
 * não envia, mas a fila continua existindo e continua precisando de manutenção
 * (comando com lease vencido, progresso de broadcast, agendamento vencendo).
 * Amarrar isso ao sender faria uma instalação sem Evolution acumular lixo
 * silenciosamente.
 *
 * Tolerância a função ausente é deliberada: o container do worker e as migrations
 * do Supabase sobem por caminhos separados. Se o worker subir antes da migration,
 * queremos degradar (pular a etapa) e não um erro a cada 3 s.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "./log.js";

export type HousekeepingSummary = {
  /** Comandos cujo lease venceu e voltaram para a fila. */
  requeued: number;
  /** Broadcasts cujo progresso (sent/status) foi reescrito. */
  reconciled: number;
  /** Agendamentos vencidos que viraram disparo. */
  promoted: number;
  /** Avisos ao lotar enfileirados: um disparo por grupo que acabou de lotar (spec 2026-10-10 D10). */
  avisos: number;
  /** Linhas podadas do log de envios (só quando `prune` é pedido). */
  pruned: number;
};

export type HousekeepingOptions = {
  /** Poda do log de envios — cara e desnecessária a cada tick; o index chama ~1×/h. */
  prune?: boolean;
};

const MAX_BROADCASTS_PER_TICK = 200;
const MAX_SCHEDULES_PER_TICK = 50;
// Teto por ciclo de 30 s, uma chamada só (sem laço de "até zerar"): cada aviso vira um
// disparo na fila anti-ban do número e cada chamada a mais é egress. A função no banco
// só enxerga grupos que lotaram na última hora; worker parado por mais que isso perde
// os avisos de quem lotou antes da janela. O teto só evita rajada quando ele volta.
const MAX_AVISOS_PER_TICK = 20;
const PRUNE_OLDER_THAN = "25 hours";

/** Códigos de "essa função não existe (ainda)" — PostgREST e Postgres. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

/** Evita repetir o mesmo aviso de função ausente a cada poll. */
const warnedMissing = new Set<string>();

/**
 * Chama uma RPC que devolve inteiro. Função ausente → 0 (com um aviso, uma vez).
 * Qualquer outro erro sobe: é falha real e o index marca o worker unhealthy.
 */
async function rpcInt(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (MISSING_FUNCTION_CODES.has(error.code ?? "")) {
      if (!warnedMissing.has(fn)) {
        warnedMissing.add(fn);
        log.warn("housekeeping: função ausente no banco, etapa pulada", { fn });
      }
      return 0;
    }
    throw new Error(`${fn}: ${error.message}`);
  }
  return typeof data === "number" ? data : 0;
}

/**
 * Um ciclo de manutenção. As etapas são independentes; a ordem só reflete
 * causalidade: requeue devolve comandos à fila ANTES do reconciliador contar
 * pendentes (senão um lease vencido apareceria momentaneamente como "acabou").
 * O aviso ao lotar vem depois das etapas da fila e antes da poda: um erro nele
 * (que sobe, como nas outras etapas) não segura a fila, e pula a poda só neste ciclo
 * — o index avança lastPruneAt apenas quando este ciclo retorna.
 */
export async function runHousekeeping(
  supabase: SupabaseClient,
  options: HousekeepingOptions = {},
): Promise<HousekeepingSummary> {
  const requeued = await rpcInt(supabase, "requeue_expired_commands", {});
  const reconciled = await rpcInt(supabase, "reconcile_broadcast_progress", {
    max_broadcasts: MAX_BROADCASTS_PER_TICK,
  });
  const promoted = await rpcInt(supabase, "promote_due_schedules", {
    max_schedules: MAX_SCHEDULES_PER_TICK,
  });
  const avisos = await rpcInt(supabase, "enviar_avisos_lotou", { p_limit: MAX_AVISOS_PER_TICK });
  const pruned = options.prune
    ? await rpcInt(supabase, "prune_instance_sends", { older_than: PRUNE_OLDER_THAN })
    : 0;

  return { requeued, reconciled, promoted, avisos, pruned };
}

/** True se o ciclo mexeu em alguma coisa — o index só loga quando mexeu. */
export function housekeepingDidWork(summary: HousekeepingSummary): boolean {
  return (
    summary.requeued > 0 ||
    summary.reconciled > 0 ||
    summary.promoted > 0 ||
    summary.avisos > 0 ||
    summary.pruned > 0
  );
}
