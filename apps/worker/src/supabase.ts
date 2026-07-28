import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client service-role do worker.
 *
 * O worker roda fora do request de usuário: usa a service_role e filtra por
 * tenant nos próprios dados dos eventos. As RPCs que ele chama
 * (claim_engine_events, complete_engine_event, upsert_lead,
 * requeue_stale_engine_events) têm execute concedido só a service_role.
 */
export function createSupabaseClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
