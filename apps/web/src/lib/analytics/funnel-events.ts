import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Funnel events tracking — registra eventos-chave do funil de conversão.
 *
 * Pipeline:
 *   signup → qr_connected → first_dispatch → first_schedule → payment → referral
 *
 * Cada evento é idempotente (upsert por tenant_id + event_name).
 * Isso permite calcular taxas de conversão entre etapas.
 */

export type FunnelEvent =
  | "signup"
  | "qr_connected"
  | "first_group_synced"
  | "first_dispatch"
  | "first_schedule"
  | "first_campaign_created"
  | "first_lead_captured"
  | "trial_started"
  | "payment_completed"
  | "referral_sent";

export type TrackEventInput = {
  tenantId: string;
  userId: string;
  event: FunnelEvent;
  metadata?: Record<string, unknown>;
};

/**
 * Registra um evento de funil. Idempotente — se o mesmo tenant já registrou
 * o evento, atualiza o timestamp (para tracking de re-ocorrência) mas não duplica.
 */
export async function trackFunnelEvent({ tenantId, userId, event, metadata }: TrackEventInput) {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("funnel_events").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      event_name: event,
      metadata: metadata ?? {},
      occurred_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,event_name" },
  );

  if (error) {
    // Non-blocking — log but don't throw
    console.error(`[funnel-events] Failed to track '${event}' for tenant ${tenantId}:`, error.message);
  }
}

/**
 * Busca todos os eventos de funil de um tenant (para mostrar progresso no onboarding).
 */
export async function getTenantFunnelEvents(tenantId: string): Promise<FunnelEvent[]> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("funnel_events")
    .select("event_name")
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: true });

  return (data ?? []).map((row) => row.event_name as FunnelEvent);
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
