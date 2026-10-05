import * as campaignsStore from "@/lib/stores/campaign-groups";
import * as linksStore from "@/lib/stores/tracked-links";

/**
 * Trocar o link (`/r/:slug`) de uma campanha.
 *
 * O slug é a chave do link mestre em `tracked_links` e também de
 * `campaign_groups`. O link antigo já pode estar em grupo, anúncio ou página
 * (`pages.campaign_slug` monta `/r/<slug>`), então ele NÃO morre: vira um
 * apelido — outra linha de `tracked_links` apontando pra mesma campanha. Os
 * cliques somam por `campaign_group_id`, então o painel não percebe a divisão.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MIN = 3;
const SLUG_MAX = 60;
// `api` é caminho do próprio app no domínio do lojista (`/api/p/...`).
const RESERVADOS = new Set(["api"]);

export type SlugValidado = { ok: true; slug: string } | { ok: false; error: string };

export function validarSlug(raw: string): SlugValidado {
  const slug = raw.trim().toLowerCase();
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    return { ok: false, error: `O link precisa ter de ${SLUG_MIN} a ${SLUG_MAX} caracteres.` };
  }
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "Use só letras minúsculas, números e hífen — sem acento nem espaço." };
  }
  if (RESERVADOS.has(slug)) return { ok: false, error: "Esse link é reservado. Escolha outro." };
  return { ok: true, slug };
}

export type RenomearResultado =
  | { ok: true; slug: string }
  | { ok: false; status: 400 | 404 | 409; error: string };

const EM_USO = "Esse link já está em uso. Escolha outro.";

const DEPS = {
  getCampaign: campaignsStore.getCampaignGroupById,
  updateCampaign: campaignsStore.updateCampaignGroup,
  getLinkBySlug: linksStore.getTrackedLinkBySlug,
  renameLink: linksStore.renameTrackedLinkSlug,
  createLink: linksStore.createTrackedLink,
  deleteLinkBySlug: linksStore.deleteTrackedLinkBySlug,
};
export type RenomearDeps = typeof DEPS;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /duplicate key|unique/i.test(e.message);
}

export async function renomearSlugCampanha(
  tenantId: string,
  campaignId: string,
  novoRaw: string,
  deps: RenomearDeps = DEPS,
): Promise<RenomearResultado> {
  const v = validarSlug(novoRaw);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const novo = v.slug;

  const campaign = await deps.getCampaign(tenantId, campaignId);
  if (!campaign) return { ok: false, status: 404, error: "Campanha não encontrada." };
  const antigo = campaign.slug;
  if (novo === antigo) return { ok: true, slug: novo };

  // Slug é único GLOBALMENTE. A única exceção é voltar para um apelido da
  // própria campanha: ele sai da frente e o link mestre assume o nome.
  const dono = await deps.getLinkBySlug(novo);
  const apelidoProprio =
    dono !== null &&
    dono.tenant_id === tenantId &&
    dono.campaign_group_id === campaignId &&
    dono.metadata?.alias === true;
  if (dono && !apelidoProprio) return { ok: false, status: 409, error: EM_USO };

  try {
    await deps.updateCampaign(tenantId, campaignId, { slug: novo });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, status: 409, error: EM_USO };
    throw e;
  }

  const meta = { campaignName: campaign.name };
  let apagouApelido = false;
  let renomeou = false;
  try {
    if (apelidoProprio) apagouApelido = await deps.deleteLinkBySlug(tenantId, novo);
    renomeou = await deps.renameLink(tenantId, campaignId, antigo, novo);
    if (renomeou) {
      await deps.createLink(tenantId, { slug: antigo, campaign_group_id: campaignId, target_url: "", metadata: { ...meta, alias: true } });
    } else {
      // Campanha sem link mestre (backfill pulou): nasce agora, já no slug novo.
      await deps.createLink(tenantId, { slug: novo, campaign_group_id: campaignId, target_url: "", metadata: { ...meta, master: true } });
    }
  } catch (e) {
    // Desfaz na ordem inversa: campanha e link voltam juntos pro slug antigo,
    // senão o painel mostraria um link que não abre.
    if (renomeou) await deps.renameLink(tenantId, campaignId, novo, antigo).catch(() => false);
    if (apagouApelido) {
      await deps
        .createLink(tenantId, { slug: novo, campaign_group_id: campaignId, target_url: "", metadata: { ...meta, alias: true } })
        .catch(() => null);
    }
    await deps.updateCampaign(tenantId, campaignId, { slug: antigo }).catch(() => null);
    if (isUniqueViolation(e)) return { ok: false, status: 409, error: EM_USO };
    throw e;
  }

  return { ok: true, slug: novo };
}
