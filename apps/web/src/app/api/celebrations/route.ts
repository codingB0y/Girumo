import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { getCelebratedKeys, markCelebrated } from "@/lib/stores/celebrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/celebrations — marcos já celebrados (o cliente compara com os atingidos).
export async function GET(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  try {
    return Response.json({ celebrated: await getCelebratedKeys(tenantId) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/celebrations — marca um marco como celebrado. Body: { markerKey }.
export async function POST(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const markerKey = String(body.markerKey ?? "").trim();
  if (!markerKey) {
    return Response.json({ error: "markerKey obrigatório." }, { status: 400 });
  }

  try {
    await markCelebrated(tenantId, markerKey);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
