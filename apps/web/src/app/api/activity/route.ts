import { listActivity, upsertActivity, type ActivitySnapshot } from "@/lib/activity-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/activity — atividade dos grupos (lida pelo painel).
export async function GET(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  return Response.json(await listActivity(tenantId));
}

// POST /api/activity — a ENGINE reporta o snapshot de atividade. { groups: [...] }
export async function POST(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const groups = Array.isArray(b.groups) ? (b.groups as ActivitySnapshot[]) : [];
  await upsertActivity(tenantId, groups);
  return Response.json({ ok: true, count: groups.length });
}
