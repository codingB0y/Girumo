import { countCampaignEntries } from "@/lib/campaigns/campaign-entries";
import { carregarCampanhas, carregarLeads } from "@/lib/painel/inicio-carga";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import * as supaLeads from "@/lib/stores/leads";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const naoEncontrada = () => Response.json({ error: "Campanha não encontrada." }, { status: 404 });

/**
 * GET /api/campanhas/[slug]/entradas — `{ entradas }`: quantas pessoas entraram
 * nos grupos da campanha desde que ela foi criada. Conta no banco; a página
 * contava a lista de /api/leads, que o PostgREST corta em 1000 linhas sem avisar.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });

    if (!USE_SUPABASE) {
      // O arquivo JSON não tem teto de linhas: a lista inteira cabe na conta.
      const [campanhas, leads] = await Promise.all([carregarCampanhas(tenantId), carregarLeads(tenantId)]);
      const camp = campanhas.find((c) => c.slug === slug || c.id === slug);
      if (!camp) return naoEncontrada();
      return Response.json({ entradas: countCampaignEntries(leads, camp.groupIds, { since: camp.createdAt }) });
    }

    const camp = await supaCampaigns.getCampaignGroupBySlug(tenantId, slug);
    if (!camp) return naoEncontrada();
    const entradas = await supaLeads.countEntriesSince(tenantId, camp.group_ids ?? [], camp.created_at);
    return Response.json({ entradas });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/entradas] falha ao contar:", error);
    return Response.json({ error: "Não deu para contar as entradas da campanha." }, { status: 500 });
  }
}
