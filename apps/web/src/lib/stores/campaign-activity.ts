import "server-only";
import type { Janela, PontoDaSerie } from "@/lib/painel/atividade";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type Linha = { bucket: string; novas_pessoas: number | string; cliques: number | string };

/**
 * Série da campanha (`public.campaign_activity`): uma linha por hora ou dia da
 * janela, com zero onde não houve nada. O tenant vai explícito porque o
 * service-role passa por cima do RLS; é este parâmetro que isola as lojas.
 */
export async function campaignActivity(
  tenantId: string,
  campanha: { id: string; groupIds: string[] },
  janela: Janela,
): Promise<PontoDaSerie[]> {
  const { data, error } = await getSupabaseAdmin().rpc("campaign_activity", {
    p_tenant: tenantId,
    p_campaign: campanha.id,
    p_group_ids: campanha.groupIds,
    p_from: janela.de.toISOString(),
    p_to: janela.ate.toISOString(),
    p_bucket: janela.fatia,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Linha[]).map((l) => ({
    inicio: new Date(l.bucket).toISOString(),
    novas: Number(l.novas_pessoas),
    cliques: Number(l.cliques),
  }));
}
