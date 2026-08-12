import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/broadcasts";
import { enqueueDispatch } from "@/lib/dispatch-store";
import { getSessionAccountId } from "@/lib/session";
import { resolveSessionTenantId } from "@/lib/session-tenant";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dispatch — lojista clicou "Enviar agora" numa oferta. body { id }
export async function POST(req: Request) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  if (!USE_SUPABASE) {
    const c = await enqueueDispatch(String(body.id));
    if (!c) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });
    return Response.json(c, { status: 202 });
  }

  const tenantId = await resolveSessionTenantId(req);
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  const c = await supaStore.enqueueBroadcast(tenantId, String(body.id));
  if (!c) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });

  // Track first dispatch (non-blocking, idempotent)
  const authUserId = await getSessionAccountId();
  if (authUserId) {
    trackFunnelEvent({ tenantId, userId: authUserId, event: "first_dispatch", metadata: { broadcastId: c.id } });
  }

  return Response.json({
    id: c.id,
    name: c.name,
    status: c.status,
    sent: c.sent,
    total: c.total,
  }, { status: 202 });
}
