import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/broadcasts";
import { ackDispatch } from "@/lib/dispatch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dispatch/ack — a ENGINE reporta progresso/resultado de um disparo.
// body { id, status: "running"|"sent"|"failed", sent, total, error?, tenantId? }
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const id = b.id ? String(b.id) : "";
  const status = b.status as "running" | "sent" | "failed";
  if (!id || !["running", "sent", "failed"].includes(status)) {
    return Response.json({ error: "id e status válidos são obrigatórios." }, { status: 400 });
  }

  if (!USE_SUPABASE) {
    const c = await ackDispatch({
      id,
      status,
      sent: Number(b.sent) || 0,
      total: Number(b.total) || 0,
      error: typeof b.error === "string" ? b.error : null,
    });
    if (!c) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });
    return Response.json(c);
  }

  // Supabase mode — engine sends tenantId in body or x-tenant-id header
  const tenantId = String(b.tenantId ?? "") || req.headers.get("x-tenant-id");
  if (!tenantId) {
    return Response.json({ error: "tenantId obrigatório." }, { status: 400 });
  }

  const c = await supaStore.ackBroadcast(tenantId, id, {
    status,
    sent: Number(b.sent) || 0,
    total: Number(b.total) || 0,
    error: typeof b.error === "string" ? b.error : null,
  });
  if (!c) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });
  return Response.json({
    id: c.id,
    status: c.status,
    sent: c.sent,
    total: c.total,
    error: c.error,
  });
}
