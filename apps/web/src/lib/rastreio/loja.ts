import "server-only";

import { coresDaMarca } from "@/lib/bio/editor-aparencia";
import { humanizeName } from "@/lib/email/invite-copy";
import { lerConfig } from "@/lib/stores/rastreio-config";
import { lerPublicadaDaLoja } from "@/lib/stores/bio-pages";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { getOrganizationProfile } from "@/lib/stores/organization-profile";

export type LojaDoRastreio = {
  tenantId: string;
  nome: string;
  publicSlug: string;
  dominio: string | null;
  corPrimaria: string | null;
  storeWhatsapp: string | null;
  vipLinkId: string | null;
};

const DEPS = { lerConfig, dominio: getCustomDomain, perfil: getOrganizationProfile, bio: lerPublicadaDaLoja };
export type DepsLoja = typeof DEPS;

/**
 * Dados da loja para a página pública e os avisos. Não lê `rastreio_enabled` (quem chama confere);
 * `null` = o Rastreio nunca foi ligado (sem config).
 */
export async function lojaDoRastreio(tenantId: string, deps: DepsLoja = DEPS): Promise<LojaDoRastreio | null> {
  const config = await deps.lerConfig(tenantId);
  if (!config) return null;
  const [d, perfil, pagina] = await Promise.all([deps.dominio(tenantId), deps.perfil(tenantId), deps.bio(tenantId)]);
  return {
    tenantId,
    // Metade das `organizations.name` guarda o e-mail; o nome vira remetente e texto do aviso.
    nome: pagina?.documento.perfil.nome.trim() || humanizeName(perfil.storeName) || config.publicSlug,
    publicSlug: config.publicSlug,
    dominio: d?.status === "active" ? d.hostname : null,
    corPrimaria: pagina ? coresDaMarca(pagina.documento).botao : null,
    storeWhatsapp: config.storeWhatsapp,
    vipLinkId: config.vipLinkId,
  };
}
