import { countCampaignEntries } from "@/lib/campaigns/campaign-entries";
import { dayBR } from "@/lib/date-br";
import { meiaNoiteBR } from "@/lib/painel/atividade";
import {
  novasHojePorGrupo,
  paraEntradaRecente,
  ultimasEntradas,
  type EntradasDaCampanha,
} from "@/lib/painel/campanha-visao";
import { carregarCampanhas, carregarLeads, LEAD_SEM_NOME } from "@/lib/painel/inicio-carga";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import * as supaLeads from "@/lib/stores/leads";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quantas linhas a lista "Últimas entradas" da visão geral mostra. */
const ULTIMAS = 5;

const naoEncontrada = () => Response.json({ error: "Campanha não encontrada." }, { status: 404 });

/**
 * GET /api/campanhas/[slug]/entradas — `EntradasDaCampanha`: quantas pessoas
 * entraram nos grupos da campanha desde que ela foi criada, as últimas entradas
 * e as de hoje por grupo. Lê no banco; a página lia a lista de /api/leads, que o
 * PostgREST corta em 1000 linhas sem avisar.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    const agora = new Date();

    if (!USE_SUPABASE) {
      // O arquivo JSON não tem teto de linhas: a lista inteira cabe na conta.
      const [campanhas, leads] = await Promise.all([carregarCampanhas(tenantId), carregarLeads(tenantId)]);
      const camp = campanhas.find((c) => c.slug === slug || c.id === slug);
      if (!camp) return naoEncontrada();
      const resposta: EntradasDaCampanha = {
        entradas: countCampaignEntries(leads, camp.groupIds, { since: camp.createdAt }),
        ultimas: ultimasEntradas(leads, camp.groupIds, ULTIMAS).map(paraEntradaRecente),
        novasHojePorGrupo: Object.fromEntries(novasHojePorGrupo(leads, camp.groupIds, agora)),
      };
      return Response.json(resposta);
    }

    const camp = await supaCampaigns.getCampaignGroupBySlug(tenantId, slug);
    if (!camp) return naoEncontrada();
    const groupIds = camp.group_ids ?? [];
    // ponytail: as três levam os JIDs na URL; o teto de ~230 grupos anotado em
    // countEntriesSince vale para todas.
    const [entradas, ultimas, hojePorGrupo] = await Promise.all([
      supaLeads.countEntriesSince(tenantId, groupIds, camp.created_at),
      supaLeads.listLatestEntries(tenantId, groupIds, ULTIMAS),
      supaLeads.countEntriesByGroupSince(tenantId, groupIds, meiaNoiteBR(dayBR(agora)).toISOString()),
    ]);
    const resposta: EntradasDaCampanha = {
      entradas,
      // O nome padrão de /api/leads, que a tela abreviava: o lead sem nome segue "Novo M.".
      ultimas: ultimas.map((l) =>
        paraEntradaRecente({ id: l.id, name: l.name ?? LEAD_SEM_NOME, sourceGroup: l.source_group_name, enteredAt: l.entered_at }),
      ),
      novasHojePorGrupo: Object.fromEntries(hojePorGrupo),
    };
    return Response.json(resposta);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/entradas] falha ao ler:", error);
    return Response.json({ error: "Não deu para ler as entradas da campanha." }, { status: 500 });
  }
}
