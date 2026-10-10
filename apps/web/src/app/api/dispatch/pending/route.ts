import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/broadcasts";
import * as supaSchedules from "@/lib/stores/schedules";
import { claimPending } from "@/lib/dispatch-store";
import { processDueSchedules } from "@/lib/schedules-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dispatch/pending — a ENGINE reivindica as ofertas enfileiradas.
// O tenant vem do `x-tenant-id` autenticado pelo token da engine.
export async function POST(req: Request) {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: true });
    if (ctx.actor !== "engine") return new Response(null, { status: 403 });
    tenantId = ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  if (!USE_SUPABASE) {
    await processDueSchedules();
    return Response.json(await claimPending());
  }

  // Process due schedules first
  await supaSchedules.processDueSchedules(tenantId);

  // Claim pending broadcasts
  const claimed = await supaStore.claimPendingBroadcasts(tenantId);
  const jobs = claimed.map((c) => ({
    id: c.id,
    name: c.name,
    message: c.message,
    groupIds: c.group_ids,
    mediaId: c.media_id,
    mediaType: c.media_type,
    mentionAll: c.mention_all,
    poll: c.poll,
  }));
  return Response.json(jobs);
}
