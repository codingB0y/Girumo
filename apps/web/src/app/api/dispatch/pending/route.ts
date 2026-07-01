import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/broadcasts";
import * as supaSchedules from "@/lib/stores/schedules";
import { claimPending } from "@/lib/dispatch-store";
import { processDueSchedules } from "@/lib/schedules-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dispatch/pending — a ENGINE reivindica as ofertas enfileiradas.
export async function POST(req: Request) {
  if (!USE_SUPABASE) {
    await processDueSchedules();
    return Response.json(await claimPending());
  }

  // Resolve tenant from request header (engine sends x-tenant-id)
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    return Response.json({ error: "x-tenant-id header obrigatório." }, { status: 400 });
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
