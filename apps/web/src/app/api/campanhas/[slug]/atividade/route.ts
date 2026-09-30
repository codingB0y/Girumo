import { ENTRADAS_E_SAIDAS_DESDE, janelasDaAtividade, somaDa, type AtividadeDaCampanha } from "@/lib/painel/atividade";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { campaignActivity, campaignGroupMemberCounts } from "@/lib/stores/campaign-activity";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import { listGroupsCreatedSince } from "@/lib/stores/group-grow-jobs";
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

    const agora = new Date();
    const janelas = janelasDaAtividade(agora);
    const campanha = { id: camp.id, groupIds: camp.group_ids ?? [] };
    const [porHora, porDia, antes, hojePorGrupo, abertos] = await Promise.all([
      campaignActivity(tenantId, campanha, janelas.porHora),
      campaignActivity(tenantId, campanha, janelas.porDia),
      campaignActivity(tenantId, campanha, janelas.semanaPassada),
      campaignGroupMemberCounts(tenantId, campanha.groupIds, janelas.porHora),
      listGroupsCreatedSince(tenantId, campanha.id, janelas.porHora.de.toISOString()),
    ]);

    const resposta: AtividadeDaCampanha = {
      geradoEm: agora.toISOString(),
      entradasDesde: new Date(ENTRADAS_E_SAIDAS_DESDE).toISOString(),
      porHora,
      porDia,
      semanaPassada: {
        novas: somaDa(antes, "novas"),
        cliques: somaDa(antes, "cliques"),
        entraram: somaDa(antes, "entraram"),
        sairam: somaDa(antes, "sairam"),
      },
      hojePorGrupo,
      gruposAbertosHoje: abertos.map((g) => ({ nome: g.subject, grupo: g.whatsapp_group_id, quando: g.updated_at })),
    };
    return Response.json(resposta);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/atividade] falha ao ler a série:", error);
    return Response.json({ error: "Não deu para ler a análise da campanha." }, { status: 500 });
  }
}
