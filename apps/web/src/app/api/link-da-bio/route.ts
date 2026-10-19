// apps/web/src/app/api/link-da-bio/route.ts
import { estadoDosLinks } from "@/lib/bio/conferir";
import { documentoPadrao } from "@/lib/bio/documento";
import {
  campanhasDaLoja,
  lojaDoPainel,
  resposta,
  sugerirSlug,
  type ErroDoPainelBio,
  type RespostaDoPainelBio,
} from "@/lib/bio/painel-api";
import { getPublicSiteUrl } from "@/lib/brand";
import { criarPaginaDaLoja, lerPaginaDaLoja } from "@/lib/stores/bio-pages";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { getOrganizationProfile } from "@/lib/stores/organization-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function falhou(acao: string, tenantId: string, e: unknown, mensagem: string): Response {
  console.error(`[api/link-da-bio] ${acao} ${tenantId}: ${(e as Error).message}`);
  return resposta({ error: mensagem } satisfies ErroDoPainelBio, 500);
}

/**
 * GET /api/link-da-bio — tudo que o editor precisa para abrir (spec §9): a página (ou `null`), as
 * campanhas com o slug do link mestre, o domínio próprio ativo, a origem Girumo (constante do
 * servidor, nunca o Host), a sugestão de endereço e os links que a página pública esconde.
 */
export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "ler");
  if (loja instanceof Response) return loja;
  const { tenantId } = loja;
  try {
    const [pagina, dominio, campanhas, perfil] = await Promise.all([
      lerPaginaDaLoja(tenantId),
      getCustomDomain(tenantId),
      campanhasDaLoja(tenantId),
      getOrganizationProfile(tenantId),
    ]);
    const linksEscondidos = pagina ? (await estadoDosLinks(tenantId, pagina.documento)).linksEscondidos : [];
    // Com página, a sugestão é o próprio slug (nada a consultar); sem, um endereço livre.
    const sugestaoSlug = pagina ? pagina.slug : await sugerirSlug(perfil.storeName, tenantId);
    const corpo: RespostaDoPainelBio = {
      pagina,
      campanhas,
      dominio: dominio?.status === "active" ? dominio.hostname : null,
      origemGirumo: getPublicSiteUrl(),
      sugestaoSlug,
      linksEscondidos,
    };
    return resposta(corpo, 200);
  } catch (e) {
    return falhou("GET", tenantId, e, "Não deu pra carregar o link da bio.");
  }
}

/**
 * POST /api/link-da-bio — "Criar minha página" (spec §8, primeira vez). Idempotente: com página,
 * devolve a que existe. Nasce fora do ar, no modelo padrão, com o nome da loja, o link mestre da
 * primeira campanha que tem um (a mais recente, ordem de `listCampaignGroups`) e um endereço livre.
 */
export async function POST(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "editar");
  if (loja instanceof Response) return loja;
  const { tenantId } = loja;
  try {
    const existente = await lerPaginaDaLoja(tenantId);
    if (existente) return resposta(existente, 201);
    const [perfil, campanhas] = await Promise.all([getOrganizationProfile(tenantId), campanhasDaLoja(tenantId)]);
    const campanhaId = campanhas.find((c) => c.slug !== null)?.id ?? null;
    // O nome vai cru: o `documentoPadrao` apara, corta em 60 sem partir emoji e troca vazio por "Minha loja".
    const documento = documentoPadrao({ nome: perfil.storeName, campanhaId });
    // Dois cliques ao mesmo tempo: o segundo insert cai no unique de loja e o store devolve a mesma.
    const criada = await criarPaginaDaLoja(tenantId, await sugerirSlug(perfil.storeName, tenantId), documento);
    return resposta(criada, 201);
  } catch (e) {
    return falhou("POST", tenantId, e, "Não deu pra criar a página.");
  }
}
