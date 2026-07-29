/**
 * Atribuição de campanha a pedido (P2.18) — matcher puro (sem I/O, testável).
 *
 * O lead traz `source_campaign` como texto livre (nome OU slug da campanha,
 * conforme a origem). Resolve pro id da campanha casando por slug ou nome
 * (case-insensitive, trim). Sem match → null ("sem origem").
 */

export type CampaignRef = { id: string; name: string; slug: string };

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
