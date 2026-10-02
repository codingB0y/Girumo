import { carregarAtividade } from "@/lib/painel/atividade-carga";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campanhas/[slug]/atividade — entradas e saídas, novas pessoas e
 * cliques no link da campanha: hoje por hora, os dias do mês (com os 7 últimos),
 * o mesmo horário da semana passada e o dia de hoje em cada grupo. Uma chamada
 * só, para a troca de período na tela não voltar ao servidor.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // O JSON de dev não guarda clique nem entrada com data: sem banco não existe série.
  if (!USE_SUPABASE) {
    return Response.json({ error: "A análise da campanha precisa do banco." }, { status: 501 });
  }

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    const camp = await supaCampaigns.getCampaignGroupBySlug(tenantId, slug);
    if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

    const atividade = await carregarAtividade(tenantId, { campanhaId: camp.id, groupIds: camp.group_ids ?? [] }, new Date());
    return Response.json(atividade);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/atividade] falha ao ler a série:", error);
    return Response.json({ error: "Não deu para ler a análise da campanha." }, { status: 500 });
  }
}
