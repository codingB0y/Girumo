import "server-only";
import type { Janela, Movimento, PontoDaSerie, SaidaDepoisDoPost } from "@/lib/painel/atividade";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type Quantidade = number | string;
type Linha = { bucket: string; novas_pessoas: Quantidade; cliques: Quantidade; entraram: Quantidade; sairam: Quantidade };
type LinhaDoGrupo = { whatsapp_group_id: string; entraram: Quantidade; sairam: Quantidade };
type LinhaDoPost = { broadcast_id: string; sent_at: string; grupos: Quantidade; sairam: Quantidade; conta_ate: string };

/**
 * Série da campanha (`public.campaign_activity`): uma linha por hora ou dia da
 * janela, com zero onde não houve nada. O tenant vai explícito porque o
 * service-role passa por cima do RLS; é este parâmetro que isola as lojas.
 * `id` nulo é a loja inteira: cliques de todos os links (a Início).
 */
export async function campaignActivity(
  tenantId: string,
  campanha: { id: string | null; groupIds: string[] },
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
    entraram: Number(l.entraram),
    sairam: Number(l.sairam),
  }));
}

/**
 * Entraram e saíram de cada grupo da campanha na janela
 * (`public.campaign_group_member_counts`). Grupo sem movimento não vem.
 */
export async function campaignGroupMemberCounts(
  tenantId: string,
  groupIds: string[],
  janela: Janela,
): Promise<Record<string, Movimento>> {
  const { data, error } = await getSupabaseAdmin().rpc("campaign_group_member_counts", {
    p_tenant: tenantId,
    p_group_ids: groupIds,
    p_from: janela.de.toISOString(),
    p_to: janela.ate.toISOString(),
  });
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    ((data ?? []) as LinhaDoGrupo[]).map((l) => [l.whatsapp_group_id, { entraram: Number(l.entraram), sairam: Number(l.sairam) }]),
  );
}

/**
 * Quem saiu depois de cada rodada de post da campanha na janela (`public.campaign_post_leaves`):
 * a regra de atribuição mora no banco, que agrega; a lista crua de entregas e saídas de um mês
 * passa das 1000 linhas que o PostgREST corta sem erro.
 */
export async function campaignPostLeaves(
  tenantId: string,
  campanha: { id: string; groupIds: string[] },
  janela: Janela,
): Promise<SaidaDepoisDoPost[]> {
  const { data, error } = await getSupabaseAdmin().rpc("campaign_post_leaves", {
    p_tenant: tenantId,
    p_campaign: campanha.id,
    p_group_ids: campanha.groupIds,
    p_from: janela.de.toISOString(),
    p_to: janela.ate.toISOString(),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LinhaDoPost[]).map((l) => ({
    postId: l.broadcast_id,
    enviadoEm: new Date(l.sent_at).toISOString(),
    grupos: Number(l.grupos),
    sairam: Number(l.sairam),
    contaAte: new Date(l.conta_ate).toISOString(),
  }));
}
