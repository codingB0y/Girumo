/**
 * Atribuição de campanha a pedido (P2.18) — matchers puros (sem I/O, testáveis).
 *
 * A fonte real é o grupo de origem do lead: `leads.source_group_id` é o JID do
 * 1º grupo, e a campanha é a de `campaign_groups` cujo `group_ids` o contém
 * (`group_ids` guarda whatsapp_group_id, não o UUID de `groups`).
 * `source_campaign` (texto livre, nome OU slug) vence quando existe, mas o
 * worker nunca o preenche. Sem match → null ("sem origem").
 */

export type CampaignRef = {
  id: string;
  name: string;
  slug: string;
  group_ids: string[];
  created_at: string;
};

export type LeadAttribution = {
  source_campaign: string | null;
  source_group_id: string | null;
};

export function matchCampaignId(
  source: string | null | undefined,
  campaigns: CampaignRef[],
): string | null {
  if (!source) return null;
  const s = source.trim().toLowerCase();
  if (!s) return null;
  const hit = campaigns.find(
    (c) => c.slug.trim().toLowerCase() === s || c.name.trim().toLowerCase() === s,
  );
  return hit?.id ?? null;
}

/**
 * Campanha cujo `group_ids` contém o JID. Um grupo pode estar em várias:
 * vence a mais antiga (created_at, depois id), pra uma campanha criada depois
 * reaproveitando o grupo não roubar a atribuição dos pedidos seguintes.
 * O backfill SQL do PR usa a mesma regra.
 */
export function matchCampaignByGroup(
  groupJid: string | null | undefined,
  campaigns: CampaignRef[],
): string | null {
  if (!groupJid) return null;
  const hits = campaigns
    .filter((c) => c.group_ids.includes(groupJid))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return hits[0]?.id ?? null;
}

export function resolveCampaignId(lead: LeadAttribution, campaigns: CampaignRef[]): string | null {
  return matchCampaignId(lead.source_campaign, campaigns) ?? matchCampaignByGroup(lead.source_group_id, campaigns);
}
