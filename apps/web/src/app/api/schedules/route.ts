import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/schedules";
import { collection } from "@/lib/json-collection";
import { crudRoute } from "@/lib/crud-route";
import type { Schedule, ScheduleStatus } from "@/lib/mock-data";
import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Legacy
const coll = collection<Schedule>("schedules.json");
const legacy = crudRoute<Schedule>(coll, (b) => {
  if (!b.campaignName || !b.scheduledAt) return { error: "campaignName e scheduledAt obrigatórios." };
  const recurrence = (b.recurrence as Schedule["recurrence"]) ?? "none";
  return {
    campaignId: b.campaignId ? String(b.campaignId) : undefined,
    campaignName: String(b.campaignName),
    scheduledAt: String(b.scheduledAt),
    recurrence,
    status: "pending" as ScheduleStatus,
  };
});

async function resolveTenantId(): Promise<string | null> {
  const authUserId = await getSessionAccountId();
  if (!authUserId) return null;
  const { data } = await getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

export async function GET() {
  if (!USE_SUPABASE) return legacy.GET();
  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json([]);
  const list = await supaStore.listSchedules(tenantId);
  // Map to legacy shape
  const mapped = list.map((s) => ({
    id: s.id,
    campaignId: s.broadcast_id ?? s.campaign_message_id,
    campaignName: s.name,
    scheduledAt: s.scheduled_at,
    recurrence: s.recurrence,
    status: s.status,
    lastRunAt: s.last_run_at,
  }));
  return Response.json(mapped);
}

export async function POST(req: Request) {
  if (!USE_SUPABASE) return legacy.POST(req);

  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!b.campaignName || !b.scheduledAt) {
    return Response.json({ error: "campaignName e scheduledAt obrigatórios." }, { status: 400 });
  }

  const rec = await supaStore.createSchedule(tenantId, {
    broadcast_id: b.campaignId ? String(b.campaignId) : undefined,
    name: String(b.campaignName),
    scheduled_at: String(b.scheduledAt),
    recurrence: (["none", "daily", "weekly"].includes(String(b.recurrence ?? "")) ? String(b.recurrence) : "none") as supaStore.ScheduleRecurrence,
  });

  // Marco: agendar é o passo em que o lojista para de disparar na mão.
  void trackFunnelEvent({
    tenantId,
    userId: null,
    event: "first_schedule",
    onlyFirst: true,
    metadata: { scheduleId: rec.id, recurrence: rec.recurrence },
  });

  return Response.json({
    id: rec.id,
    campaignId: rec.broadcast_id,
    campaignName: rec.name,
    scheduledAt: rec.scheduled_at,
    recurrence: rec.recurrence,
    status: rec.status,
  }, { status: 201 });
}

export async function DELETE(req: Request) {
  if (!USE_SUPABASE) return legacy.DELETE(req);

  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  await supaStore.deleteSchedule(tenantId, id);
  return Response.json({ ok: true });
}
