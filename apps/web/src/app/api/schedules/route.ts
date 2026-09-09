import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/schedules";
import { collection } from "@/lib/json-collection";
import { crudRoute } from "@/lib/crud-route";
import type { Schedule, ScheduleStatus } from "@/lib/mock-data";
import { resolveSessionTenantId } from "@/lib/session-tenant";
import { carregarAgendamentos } from "@/lib/painel/inicio-carga";

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

// GET /api/schedules — mesmo corpo que a rota agregada da Início serve.
export async function GET(req: Request) {
  const tenantId = USE_SUPABASE ? await resolveSessionTenantId(req) : "";
  if (USE_SUPABASE && !tenantId) return Response.json([]);
  return Response.json(await carregarAgendamentos(tenantId ?? ""));
}

export async function POST(req: Request) {
  if (!USE_SUPABASE) return legacy.POST(req);

  const tenantId = await resolveSessionTenantId(req);
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

  const tenantId = await resolveSessionTenantId(req);
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  await supaStore.deleteSchedule(tenantId, id);
  return Response.json({ ok: true });
}
