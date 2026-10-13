import "server-only";
import { estadoFromRow, type EstadoGrupo, type EstadoRow } from "@/lib/groups/estado";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Estados dos grupos de UMA campanha, na ordem do pool
 * (`public.campaign_group_states`, PR 1 do "postar por grupo").
 *
 * O tenant vai explícito porque o service-role passa por cima do RLS: é
 * `p_tenant` que isola as lojas. A RPC só devolve grupos da campanha que existem
 * em `groups` — JID órfão do pool não sai (o `diagnosePool` do link trata).
 *
 * Erro da RPC lança: devolver `[]` faria o link dizer "campanha não está aberta"
 * para uma campanha cheia de grupo, sem rastro nenhum.
 */
export async function listCampaignGroupStates(tenantId: string, campaignId: string): Promise<EstadoGrupo[]> {
  const { data, error } = await getSupabaseAdmin().rpc("campaign_group_states", {
    p_tenant: tenantId,
    p_campaign: campaignId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as EstadoRow[]).map(estadoFromRow);
}
