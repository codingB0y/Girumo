import * as campaignsStore from "@/lib/stores/campaign-groups";
import * as linksStore from "@/lib/stores/tracked-links";

/**
 * Trocar o link (`/r/:slug`) de uma campanha.
 *
 * O slug é a chave do link mestre em `tracked_links` e também de
 * `campaign_groups`. O link antigo já pode estar em grupo, anúncio ou página
 * (`pages.campaign_slug` monta `/r/<slug>`), então ele NÃO morre: a linha dele
 * em `tracked_links` fica e vira apelido da mesma campanha, e o slug novo ganha
 * linha própria. Os cliques somam por `campaign_group_id`, então o painel não
 * percebe a divisão.
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
  createLink: linksStore.createTrackedLink,
  setLinkMetadata: linksStore.setTrackedLinkMetadata,
  deleteLinkBySlug: linksStore.deleteTrackedLinkBySlug,
};
export type RenomearDeps = typeof DEPS;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /duplicate key|unique/i.test(e.message);
}

/** Compensação que falhou não derruba a resposta, mas não pode sumir calada. */
function logCompensacao(etapa: string) {
  return (e: unknown) => console.error(`[rename-slug] ${etapa}: ${e instanceof Error ? e.message : String(e)}`);
}

/** Mesmo metadata, com o papel trocado (`master` ou `alias`). */
function comPapel(metadata: Record<string, unknown> | null, papel: "master" | "alias", campaignName: string) {
  const resto = Object.fromEntries(Object.entries(metadata ?? {}).filter(([k]) => k !== "master" && k !== "alias"));
  return { ...resto, campaignName, [papel]: true };
}

/**
 * Nenhum passo LIBERA slug: o novo nasce como linha nova (ou já é um apelido
 * da campanha) e o antigo continua de pé, só muda de papel. Slug solto por um
 * instante podia ser tomado por outra conta — e o link divulgado abriria o
 * grupo dela.
 */
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

  const daCampanha = (l: { tenant_id: string; campaign_group_id: string | null } | null) =>
    l !== null && l.tenant_id === tenantId && l.campaign_group_id === campaignId;
  const [dono, mestre] = await Promise.all([deps.getLinkBySlug(novo), deps.getLinkBySlug(antigo)]);
  // Slug é único GLOBALMENTE. A única exceção é voltar para um apelido da
  // própria campanha.
  const apelidoProprio = daCampanha(dono) && dono?.metadata?.alias === true;
  if (dono && !apelidoProprio) return { ok: false, status: 409, error: EM_USO };

  if (dono) {
    await deps.setLinkMetadata(tenantId, dono.id, comPapel(dono.metadata, "master", campaign.name));
    try {
      await deps.updateCampaign(tenantId, campaignId, { slug: novo });
    } catch (e) {
      await deps.setLinkMetadata(tenantId, dono.id, dono.metadata).catch(logCompensacao("devolver apelido"));
      if (isUniqueViolation(e)) return { ok: false, status: 409, error: EM_USO };
      throw e;
    }
  } else {
    try {
      await deps.createLink(tenantId, {
        slug: novo,
        campaign_group_id: campaignId,
        target_url: "",
        metadata: comPapel(null, "master", campaign.name),
      });
    } catch (e) {
      // Alguém pegou o slug entre a checagem e o insert: nada a desfazer.
      if (isUniqueViolation(e)) return { ok: false, status: 409, error: EM_USO };
      throw e;
    }
    try {
      await deps.updateCampaign(tenantId, campaignId, { slug: novo });
    } catch (e) {
      await deps.deleteLinkBySlug(tenantId, novo).catch(logCompensacao("apagar link novo"));
      if (isUniqueViolation(e)) return { ok: false, status: 409, error: EM_USO };
      throw e;
    }
  }

  // O link antigo vira apelido. Falhar aqui deixa dois "mestres" que abrem a
  // mesma campanha — nenhum link quebra, só o rótulo fica errado.
  if (mestre && daCampanha(mestre)) {
    await deps
      .setLinkMetadata(tenantId, mestre.id, comPapel(mestre.metadata, "alias", campaign.name))
      .catch(logCompensacao("marcar apelido"));
  }

  return { ok: true, slug: novo };
}
