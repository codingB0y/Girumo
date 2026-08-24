import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { parseFunnelCounts, parseTenantFunnelMatrix } from "./funnel-summary";
import type { FunnelEvent, TenantFunnelRow } from "./funnel-summary";

/**
 * Funnel events tracking — registra eventos-chave do funil de conversão.
 *
 * Cada evento é idempotente (upsert por tenant_id + event_name).
 * A lógica pura de derivação (marcos, resumo por tenant) vive em `funnel-summary.ts`.
 */

// Re-export da camada pura pra call-sites importarem tudo de um lugar só.
export {
  ACTIVATION_MILESTONES,
  summarizeTenantFunnel,
} from "./funnel-summary";
export type { FunnelEvent, TenantFunnelRow, TenantFunnelSummary } from "./funnel-summary";

export type TrackEventInput = {
  tenantId: string;
  /** null para marcos disparados pela engine (sem usuário logado). */
  userId: string | null;
  event: FunnelEvent;
  metadata?: Record<string, unknown>;
  /**
   * Marcos de ativação ("primeira vez que X aconteceu"): preserva o occurred_at
   * da PRIMEIRA ocorrência (INSERT ... ON CONFLICT DO NOTHING) em vez de bumpar
   * o timestamp a cada re-disparo. Sem isso, o tempo-até-marco do funil ficaria
   * errado (registraria a última ocorrência, não a primeira). Deixa o hook
   * disparar à vontade em cada ação — o 1º insert é o que fica.
   */
  onlyFirst?: boolean;
};

/**
 * Registra um evento de funil. Idempotente (unique por tenant_id + event_name).
 * - default: upsert que atualiza o timestamp (tracking de re-ocorrência).
 * - `onlyFirst`: no-op se já existe, preservando o occurred_at da 1ª vez.
 */
export async function trackFunnelEvent({ tenantId, userId, event, metadata, onlyFirst }: TrackEventInput) {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("funnel_events").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      event_name: event,
      metadata: metadata ?? {},
      occurred_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,event_name", ignoreDuplicates: onlyFirst ?? false },
  );

  if (error) {
    // Non-blocking — log but don't throw
    console.error(`[funnel-events] Failed to track '${event}' for tenant ${tenantId}:`, error.message);
  }
}

/**
 * Métricas agregadas do funil — para o admin dashboard.
 * Retorna contagem de tenants em cada etapa.
 *
 * O `group by` roda no banco (`funnel_event_counts()`): ler linha a linha e
 * contar em JS batia no `max-rows` do PostgREST (1000) e passava a contar menos
 * sem erro nenhum.
 */
export async function getFunnelMetrics(): Promise<Record<FunnelEvent, number>> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("funnel_event_counts");

  // Numero errado com cara de numero certo e o pior resultado possivel aqui:
  // melhor a pagina do admin quebrar do que decidir com um funil menor que o real.
  if (error) throw error;

  return parseFunnelCounts(data);
}

/**
 * Matriz tenant × marcos para o admin. Uma entrada por organização, com o
 * occurred_at da PRIMEIRA vez de cada evento — o join e o `min()` acontecem no
 * banco (`funnel_tenant_matrix()`), não mais em JS sobre duas leituras que o
 * PostgREST podia cortar em 1000 linhas.
 */
export async function getTenantFunnelMatrix(): Promise<TenantFunnelRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("funnel_tenant_matrix");

  if (error) throw error;

  return parseTenantFunnelMatrix(data);
}
