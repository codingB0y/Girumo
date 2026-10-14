import { resumirEstados, type EstadosDaCampanha } from "@/lib/groups/resumo-estados";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listCampaignGroupStates } from "@/lib/stores/campaign-group-states";
import * as campaignGroupsStore from "@/lib/stores/campaign-groups";
import { contarEstruturaDeComunidade } from "@/lib/stores/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campanhas/[slug]/grupos/estados — o estado de cada grupo da campanha na ordem do
 * pool, a contagem da faixa e quantos grupos cada atalho de destino pega agora.
 *
 * O estado vem pronto de `campaign_group_states` (spec §4); esta rota só conta. Leitura de
 * painel: sessão (`allowEngine: false`, Bearer ou cookie — `finding-tenant-helper-cookie-vs-bearer`),
 * sem exigir `campaign:edit`. A campanha é lida com o tenant da sessão, e o RPC filtra o tenant
 * de novo: o service-role passa por cima do RLS.
 *
 * Modo JSON fora de escopo (spec §10), como as rotas irmãs `grupos/lotes` e `grupos/estado`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    const campaign = await campaignGroupsStore.getCampaignGroupBySlug(tenantId, slug);
    if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

    const grupos = await listCampaignGroupStates(tenantId, campaign.id);
    // Pai e Avisos de comunidade ficam fora dos estados de propósito (20261014120000). Só se
    // pergunta ao banco pelos JIDs do pool que não voltaram, o que no caso comum é nenhum.
    const voltaram = new Set(grupos.map((g) => g.whatsappGroupId));
    const faltam = [...new Set(campaign.group_ids)].filter((jid) => !voltaram.has(jid));
    const estruturaDeComunidade = await contarEstruturaDeComunidade(tenantId, faltam);
    const resposta: EstadosDaCampanha = { grupos, ...resumirEstados(grupos), estruturaDeComunidade };
    return Response.json(resposta);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/estados] falha ao ler:", error);
    return Response.json({ error: "Não deu para ler o estado dos grupos." }, { status: 500 });
  }
}
