import { getSession, setSession, isLive, type EngineStats } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/session — status real (live = heartbeat recente da engine).
export async function GET() {
  const s = await getSession();
  return Response.json({ ...s, live: isLive(s) });
}

// POST /api/session — heartbeat/atualização vinda da engine.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const s = await setSession({
    status: body.status === "connected" ? "connected" : "disconnected",
    phone: body.phone ? String(body.phone) : null,
    profileName: body.profileName ? String(body.profileName) : null,
    connectedSince: body.connectedSince ? String(body.connectedSince) : null,
    stats: (body.stats as EngineStats) ?? null,
  });
  return Response.json(s, { status: 201 });
}
