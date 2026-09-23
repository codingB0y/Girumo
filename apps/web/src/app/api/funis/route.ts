import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as broadcastsStore from "@/lib/stores/broadcasts";
import * as schedulesStore from "@/lib/stores/schedules";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import { offerTotalsByBroadcastIds } from "@/lib/stores/flash-offers";
import { buildDispatchList } from "@/lib/campaigns/dispatch-view";
import { buildFunnelResults } from "@/lib/funnels/results";
import { buildOverview, type CampaignRef } from "@/lib/funnels/overview";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listByCampaign } from "@/lib/messages-store";
import { collection } from "@/lib/json-collection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Campanha = { id: string; name: string; slug?: string };
const campanhas = collection<Campanha>("campanhas.json");

// GET /api/funis — os funis de TODAS as campanhas da loja, para a tela Funis:
// agendados (com o que dá para cancelar) e enviados (com os números da oferta).
export async function GET(req: Request) {
  if (!USE_SUPABASE) {
    const lista = await campanhas.list();
    const runs = await Promise.all(
      lista.map(async (c) => {
        const campaign: CampaignRef = { slug: c.slug ?? c.id, name: c.name };
        return buildFunnelResults(await listByCampaign(c.id)).map((r) => ({ ...r, campaign }));
      }),
    );
    return Response.json(buildOverview(runs.flat()));
  }

  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  const broadcasts = await broadcastsStore.listFunnelBroadcasts(tenantId);
  if (broadcasts.length === 0) return Response.json(buildOverview([]));

  const ids = broadcasts.map((b) => b.id);
  const [schedules, ofertas, campanhasDoTenant] = await Promise.all([
    schedulesStore.listSchedulesByBroadcastIds(tenantId, ids),
    offerTotalsByBroadcastIds(tenantId, ids),
    supaCampaigns.listCampaignGroups(tenantId),
  ]);

  // Um funil é sempre de uma campanha só; agrupa por ela para o link e o nome.
  const porCampanha = new Map<string, typeof broadcasts>();
  for (const b of broadcasts) {
    if (!b.campaign_group_id) continue;
    porCampanha.set(b.campaign_group_id, [...(porCampanha.get(b.campaign_group_id) ?? []), b]);
  }

  const runs = campanhasDoTenant.flatMap((c) => {
    const doFunil = porCampanha.get(c.id);
    if (!doFunil) return [];
    const campaign: CampaignRef = { slug: c.slug, name: c.name };
    return buildFunnelResults(buildDispatchList(doFunil, schedules, c.slug), ofertas).map((r) => ({ ...r, campaign }));
  });
  return Response.json(buildOverview(runs));
}
