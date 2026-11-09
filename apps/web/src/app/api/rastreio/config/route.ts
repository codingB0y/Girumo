import { numeroEhDeInstanciaDaLoja } from "@/lib/bio/conferir";
import { falhou, resposta } from "@/lib/bio/painel-api";
import {
  corpoDoPatchDaConfig,
  erroDoPatchDaConfig,
  MSG_LINK_VIP,
  NUMERO_DA_LOJA_CONECTADO,
  type RespostaDaConfig,
} from "@/lib/rastreio/config-painel";
import { linkDaBusca } from "@/lib/rastreio/link";
import { DEPS, lojaDoRastreio } from "@/lib/rastreio/loja";
import { lojaDoRastreioNoPainel } from "@/lib/rastreio/rota-painel";
import { garantirConfig, salvarConfig, SlugEmUso } from "@/lib/stores/rastreio-config";
import type { RastreioConfig } from "@/lib/rastreio/tipos";
import { getTrackedLinkById, listTrackedLinks } from "@/lib/stores/tracked-links";
import { conexaoYampiAtiva } from "@/lib/yampi/conexao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LINKS_DE_CONVITE = 200;

const erro400 = (error: string, campo: string) => resposta({ error, campo }, 400);

async function montar(tenantId: string, config: RastreioConfig): Promise<RespostaDaConfig> {
  // A config já está na mão: a loja não precisa lê-la de novo.
  const [loja, yampi, links] = await Promise.all([
    lojaDoRastreio(tenantId, { ...DEPS, lerConfig: async () => config }),
    conexaoYampiAtiva(tenantId),
    listTrackedLinks(tenantId),
  ]);
  return {
    config: {
      publicSlug: config.publicSlug,
      matrix: config.matrix,
      notifyStoreOnProblem: config.notifyStoreOnProblem,
      vipLinkId: config.vipLinkId,
      storeWhatsapp: config.storeWhatsapp,
      importedAt: config.importedAt,
    },
    linkDaBusca: loja ? linkDaBusca(loja) : null,
    loja: loja?.nome ?? null,
    yampi: yampi?.status ?? null,
    // Só link de convite (de campanha); os soltos não servem de Grupo VIP.
    linksDeConvite: links
      .filter((l) => l.campaign_group_id !== null)
      .map((l) => ({ id: l.id, slug: l.slug }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .slice(0, MAX_LINKS_DE_CONVITE),
  };
}

export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoRastreioNoPainel(req);
  if (loja instanceof Response) return loja;
  try {
    return resposta(await montar(loja.tenantId, await garantirConfig(loja.tenantId)), 200);
  } catch (e) {
    return falhou("api/rastreio/config", loja.tenantId, e, "Não deu para ler a configuração do Rastreio.");
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const loja = await lojaDoRastreioNoPainel(req);
  if (loja instanceof Response) return loja;
  try {
    let bruto: unknown;
    try {
      bruto = await req.json();
    } catch {
      return erro400("Corpo inválido.", "corpo");
    }
    const lido = corpoDoPatchDaConfig.safeParse(bruto);
    if (!lido.success) {
      const { error, campo } = erroDoPatchDaConfig(lido.error);
      return erro400(error, campo);
    }
    const patch = lido.data;

    if (patch.vipLinkId) {
      const link = await getTrackedLinkById(loja.tenantId, patch.vipLinkId);
      if (!link?.campaign_group_id) return erro400(MSG_LINK_VIP, "vipLinkId");
    }
    if (patch.storeWhatsapp && (await numeroEhDeInstanciaDaLoja(loja.tenantId, patch.storeWhatsapp))) {
      return erro400(NUMERO_DA_LOJA_CONECTADO, "storeWhatsapp");
    }

    await garantirConfig(loja.tenantId); // o salvarConfig falha sem linha
    return resposta(await montar(loja.tenantId, await salvarConfig(loja.tenantId, patch)), 200);
  } catch (e) {
    if (e instanceof SlugEmUso) return resposta({ error: "Esse endereço já está em uso. Escolha outro.", campo: "publicSlug" }, 409);
    return falhou("api/rastreio/config", loja.tenantId, e, "Não deu para salvar a configuração do Rastreio.");
  }
}
