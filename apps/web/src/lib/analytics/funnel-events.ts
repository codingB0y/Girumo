import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
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
 */
export async function getFunnelMetrics(): Promise<Record<FunnelEvent, number>> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("funnel_events")
    .select("event_name");

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.event_name] = (counts[row.event_name] ?? 0) + 1;
  }

  return counts as Record<FunnelEvent, number>;
}

/**
 * Matriz tenant × marcos para o admin. Junta organizations + funnel_events em JS
 * (2 queries). Guarda o occurred_at da PRIMEIRA vez de cada evento por tenant.
 */
export async function getTenantFunnelMatrix(): Promise<TenantFunnelRow[]> {
  const supabase = getSupabaseAdmin();

  const [orgsRes, eventsRes] = await Promise.all([
    supabase.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }),
    supabase.from("funnel_events").select("tenant_id, event_name, occurred_at"),
  ]);

  const byTenant = new Map<string, Partial<Record<FunnelEvent, string>>>();
  for (const e of eventsRes.data ?? []) {
    const current = byTenant.get(e.tenant_id) ?? {};
    const prev = current[e.event_name as FunnelEvent];
    // Mantém a 1ª ocorrência caso haja duplicata histórica (o unique já garante 1,
    // mas defensivo se o dado vier de antes da constraint).
    if (!prev || e.occurred_at < prev) current[e.event_name as FunnelEvent] = e.occurred_at;
    byTenant.set(e.tenant_id, current);
  }

  return (orgsRes.data ?? []).map((o) => ({
    tenantId: o.id,
    name: o.name ?? "—",
    createdAt: o.created_at,
    milestones: byTenant.get(o.id) ?? {},
  }));
}
