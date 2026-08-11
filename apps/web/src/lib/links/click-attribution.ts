/**
 * Cliques por campanha — função PURA, sem I/O.
 *
 * Antes a atribuição era feita comparando a STRING do nome
 * (`link.campaignName === campanha.name`): renomear a campanha zerava o
 * histórico de cliques dela. `tracked_links.campaign_group_id` já existia e
 * nunca era escrito. Agora o ID manda, e o nome fica só como ponte para os
 * links criados antes do backfill.
 */

export type AttributableLink = {
  campaignGroupId?: string | null;
  campaignName?: string | null;
  clicks?: number | null;
};

export type AttributableCampaign = {
  id: string;
  name: string;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Soma de cliques por ID de campanha.
 *
 * Ordem de atribuição, sem empate possível:
 *  1. `campaignGroupId` — vínculo explícito, imune a rename;
 *  2. `campaignName` — só para link legado, que ainda não tem o ID.
 *
 * Link com ID apontando pra campanha inexistente NÃO cai no nome: alguém já
 * decidiu a quem ele pertence, e adivinhar por nome ressuscitaria o bug.
 */
export function clicksByCampaign(
  links: readonly AttributableLink[],
  campaigns: readonly AttributableCampaign[],
): Map<string, number> {
  const idsExistentes = new Set(campaigns.map((c) => c.id));
  const idPorNome = new Map<string, string>();
  for (const c of campaigns) {
    const key = normalizeName(c.name);
    // Nome repetido entre campanhas é ambíguo — não atribui a nenhuma.
    idPorNome.set(key, idPorNome.has(key) ? "" : c.id);
  }

  const total = new Map<string, number>();
  for (const link of links) {
    const clicks = link.clicks ?? 0;
    if (!clicks) continue;

    let campaignId: string | null = null;
    if (link.campaignGroupId) {
      campaignId = idsExistentes.has(link.campaignGroupId) ? link.campaignGroupId : null;
    } else if (link.campaignName) {
      campaignId = idPorNome.get(normalizeName(link.campaignName)) || null;
    }
    if (!campaignId) continue;

    total.set(campaignId, (total.get(campaignId) ?? 0) + clicks);
  }
  return total;
}

/** Cliques de UMA campanha — mesma regra, para a tela de detalhe. */
export function clicksForCampaign(
  links: readonly AttributableLink[],
  campaign: AttributableCampaign,
): number {
  return clicksByCampaign(links, [campaign]).get(campaign.id) ?? 0;
}
