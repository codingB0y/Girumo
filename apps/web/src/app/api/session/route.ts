import { getSession, setSession, isLive, type EngineStats } from "@/lib/session-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/session — status real (live = heartbeat recente da engine).
export async function GET(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  const s = await getSession(tenantId);
  return Response.json({ ...s, live: isLive(s) });
}

// POST /api/session — heartbeat/atualização vinda da engine.
export async function POST(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const s = await setSession(tenantId, {
    status: body.status === "connected" ? "connected" : "disconnected",
    phone: body.phone ? String(body.phone) : null,
    profileName: body.profileName ? String(body.profileName) : null,
    connectedSince: body.connectedSince ? String(body.connectedSince) : null,
    stats: (body.stats as EngineStats) ?? null,
  });
  return Response.json(s, { status: 201 });
}
