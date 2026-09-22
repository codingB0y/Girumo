import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as broadcastsStore from "@/lib/stores/broadcasts";
import * as schedulesStore from "@/lib/stores/schedules";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import { offerTotalsByBroadcastIds } from "@/lib/stores/flash-offers";
import { buildDispatchList } from "@/lib/campaigns/dispatch-view";
import { buildFunnelResults } from "@/lib/funnels/results";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listByCampaign } from "@/lib/messages-store";
import { collection } from "@/lib/json-collection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
const campanhas = collection<Campanha>("campanhas.json");

// GET /api/campanhas/[slug]/funis — um item por confirmação de funil, do mais
// novo pro mais velho, com as etapas e os números da oferta relâmpago.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Legado (dev local, single-tenant): messages.json não tem oferta relâmpago,
  // então as etapas vêm sem os números dela.
  if (!USE_SUPABASE) {
    const lista = await campanhas.list();
    const camp = lista.find((c) => c.slug === slug || c.id === slug);
    if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    return Response.json(buildFunnelResults(await listByCampaign(camp.id)));
  }

  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  const camp = await supaCampaigns.getCampaignGroupBySlug(tenantId, slug);
  if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  const broadcasts = await broadcastsStore.listBroadcastsByCampaign(tenantId, camp.id);
  const doFunil = broadcasts.filter((b) => b.funnel_run_id);
  if (doFunil.length === 0) return Response.json([]);

  const schedules = await schedulesStore.listSchedulesByBroadcastIds(
    tenantId,
    doFunil.map((b) => b.id),
  );
  const ofertas = await offerTotalsByBroadcastIds(
    tenantId,
    doFunil.map((b) => b.id),
  );

  return Response.json(
    buildFunnelResults(buildDispatchList(doFunil, schedules, camp.slug), ofertas),
  );
}
