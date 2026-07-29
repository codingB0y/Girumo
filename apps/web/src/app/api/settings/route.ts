import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { getTenantSettings, updateTenantSettings } from "@/lib/stores/tenant-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/settings — settings do tenant autenticado (meta do mês, relatório semanal, etc).
export async function GET(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  try {
    return Response.json(await getTenantSettings(tenantId));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH /api/settings — Body: { weeklyReportEnabled?: boolean, monthlyGoalContacts?: number|null, monthlyGoalRevenue?: number|null }
export async function PATCH(req: Request) {
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

  const input: { weeklyReportEnabled?: boolean; monthlyGoalContacts?: number | null; monthlyGoalRevenue?: number | null } = {};
  if (typeof body.weeklyReportEnabled === "boolean") input.weeklyReportEnabled = body.weeklyReportEnabled;
  if ("monthlyGoalContacts" in body) {
    const v = body.monthlyGoalContacts;
    input.monthlyGoalContacts = v === null ? null : Number(v);
  }
  if ("monthlyGoalRevenue" in body) {
    const v = body.monthlyGoalRevenue;
    input.monthlyGoalRevenue = v === null ? null : Number(v);
  }

  try {
    return Response.json(await updateTenantSettings(tenantId, input));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
