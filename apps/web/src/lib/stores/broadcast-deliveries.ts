import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type EntregaBruta = {
  /** `payload->>jid`: o grupo de destino do comando. */
  jid: string | null;
  status: string;
  completed_at: string | null;
  failed_at: string | null;
};

/**
 * Os comandos de uma rodada do post: um por grupo (`app.enqueue_broadcast`),
 * ligados à oferta por `origin_id` e à rodada por `origin_run_id`, que muda a
 * cada envio da mesma oferta. O índice `engine_commands_origin_idx` cobre a busca.
 *
 * ponytail: uma leitura, sem paginar. Um post vai para os grupos de uma
 * campanha, bem abaixo do teto de 1000 linhas do PostgREST; paginar quando
 * alguém postar em mais de 1000 grupos de uma vez.
 */
export async function listBroadcastDeliveries(
  tenantId: string,
  broadcastId: string,
  runId: string,
): Promise<EntregaBruta[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("engine_commands")
    .select("jid:payload->>jid,status,completed_at,failed_at")
    .eq("tenant_id", tenantId)
    .eq("origin_kind", "broadcast")
    .eq("origin_id", broadcastId)
    .eq("origin_run_id", runId);
  if (error) throw new Error(error.message);
  return (data ?? []) as EntregaBruta[];
}
