import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { getTenantSettings, updateTenantSettings } from "@/lib/stores/tenant-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/settings — preferências do tenant (ex.: relatório semanal por e-mail).
export async function GET(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  return Response.json(await getTenantSettings(tenantId));
}

// PATCH /api/settings — lojista liga/desliga preferências.
export async function PATCH(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const partial: { weeklyReportEnabled?: boolean } = {};
  if (typeof body.weeklyReportEnabled === "boolean") partial.weeklyReportEnabled = body.weeklyReportEnabled;

  const settings = await updateTenantSettings(tenantId, partial);
  return Response.json(settings);
}
