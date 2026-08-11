import { getRouteTenantContext } from "@/lib/route-tenant-context";
import {
  getTenantSettings,
  updateTenantSettings,
  type TenantSettingsInput,
} from "@/lib/stores/tenant-settings";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";

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

// PATCH /api/settings
// Body: { weeklyReportEnabled?: boolean, monthlyGoalContacts?: number|null,
//         monthlyGoalRevenue?: number|null, onboardingDismissed?: boolean,
//         onboardingCompleted?: boolean }
//
// Os dois campos de onboarding são SINAIS, não datas: quem carimba o horário é o
// servidor. O cliente não escolhe quando algo aconteceu.
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

  const input: TenantSettingsInput = {};
  if (typeof body.weeklyReportEnabled === "boolean") input.weeklyReportEnabled = body.weeklyReportEnabled;
  if ("monthlyGoalContacts" in body) {
    const v = body.monthlyGoalContacts;
    input.monthlyGoalContacts = v === null ? null : Number(v);
  }
  if ("monthlyGoalRevenue" in body) {
    const v = body.monthlyGoalRevenue;
    input.monthlyGoalRevenue = v === null ? null : Number(v);
  }

  const now = new Date().toISOString();
  if (typeof body.onboardingDismissed === "boolean") {
    input.onboardingDismissedAt = body.onboardingDismissed ? now : null;
  }
  if (body.onboardingCompleted === true) {
    // Marco: vale a PRIMEIRA vez. Reenviar não empurra a data pra frente, senão
    // o tempo signup → ativação viraria "quando o lojista abriu a tela de novo".
    const current = await getTenantSettings(tenantId).catch(() => null);
    if (!current?.onboardingCompletedAt) input.onboardingCompletedAt = now;
  }

  try {
    const settings = await updateTenantSettings(tenantId, input);
    // Marco de ativação: definiu a meta do mês (contatos ou receita não-nulos).
    // onlyFirst → só a 1ª vez conta; re-salvar não bumpa o tempo-até-marco.
    if (input.monthlyGoalContacts != null || input.monthlyGoalRevenue != null) {
      void trackFunnelEvent({ tenantId, userId: null, event: "goal_set", onlyFirst: true });
    }
    return Response.json(settings);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
