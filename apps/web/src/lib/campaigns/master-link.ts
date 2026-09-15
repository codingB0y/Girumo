import * as supaStore from "@/lib/stores/campaign-groups";
import * as linksStore from "@/lib/stores/tracked-links";
import { slugify } from "@/lib/store";

/**
 * Link mestre de campanha (`/r/:slug`). Campanha e comunidade são a mesma linha
 * de `campaign_groups` — as duas portas de criação passam por aqui para a linha
 * nascer com o mesmo invariante: slug livre globalmente + linha em
 * `tracked_links`.
 */

const SLUG_ATTEMPTS = 25;

/** Tentativa `attempt` de slug: a primeira é a base pura, as demais levam sufixo aleatório. */
export function candidatoSlugMestre(base: string, attempt: number, random: () => number = Math.random): string {
  return attempt === 0 ? base : `${base}-${random().toString(36).slice(2, 6)}`;
}

/**
 * O slug da campanha é também o slug do link mestre em `/r/:slug`, e
 * `tracked_links.slug` é único GLOBALMENTE (entre tenants) — então não basta
 * conferir as campanhas do próprio tenant: um slug já tomado por qualquer link
 * faria a criação do link mestre estourar.
 */
export async function uniqueMasterSlug(
  name: string,
  takenInTenant: Set<string>,
  fallback = "campanha",
): Promise<string> {
  const base = slugify(name) || fallback;
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = candidatoSlugMestre(base, attempt);
    if (!takenInTenant.has(slug) && !(await linksStore.getTrackedLinkBySlug(slug))) return slug;
  }
  // Fallback praticamente impossível de colidir, p/ nunca travar a criação.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Link mestre. /r/<slug> só resolve porque existe ESTA linha — campanha sem
 * ela nasce com link morto. Se a criação falhar (corrida de slug), desfaz a
 * campanha em vez de entregar uma com link quebrado. Devolve `false` nesse caso.
 */
export async function criarLinkMestreOuDesfazer(
  tenantId: string,
  rec: { id: string; slug: string; name: string },
): Promise<boolean> {
  try {
    await linksStore.createTrackedLink(tenantId, {
      slug: rec.slug,
      target_url: "",
      campaign_group_id: rec.id,
      metadata: { campaignName: rec.name, master: true },
    });
    return true;
  } catch {
    await supaStore.deleteCampaignGroup(tenantId, rec.id);
    return false;
  }
}
