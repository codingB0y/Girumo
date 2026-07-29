import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { getSession, isLive } from "@/lib/session-store";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
import { listBroadcasts } from "@/lib/stores/broadcasts";
import { listAutomations } from "@/lib/stores/automations";
import { countLeads } from "@/lib/stores/leads";
import { countOrders } from "@/lib/stores/orders";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getPlaybookProgress, markPlaybookStep } from "@/lib/stores/playbook";
import { computePlaybook, type PlaybookState } from "@/lib/playbook/aggregate";
import { isManualStepKey } from "@/lib/playbook/steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settled = <T,>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === "fulfilled" ? r.value : fallback);

// Agrega os sinais dos stores (em paralelo, resiliente — um store que falhar
// degrada o sinal em vez de derrubar o card), computa o estado e faz o
// write-through sticky dos autos já atingidos.
async function buildPlaybookState(tenantId: string): Promise<PlaybookState> {
  const [session, campaigns, broadcasts, automations, leadCount, orderCount, settings, persisted] =
    await Promise.allSettled([
      getSession(tenantId),
      listCampaignGroups(tenantId),
      listBroadcasts(tenantId),
      listAutomations(tenantId),
      countLeads(tenantId),
      countOrders(tenantId),
      getTenantSettings(tenantId),
      getPlaybookProgress(tenantId),
    ]);

  const sessionInfo = session.status === "fulfilled" ? session.value : null;
  const automationRows = settled(automations, []);
  const persistedDoneAt = settled(persisted, {});

  const state = computePlaybook({
    isConnected: sessionInfo ? isLive(sessionInfo) : false,
    campaignCount: settled(campaigns, []).length,
    broadcastCount: settled(broadcasts, []).length,
    hasWelcomeAutomation: automationRows.some((a) => a.trigger === "lead_entered" && a.enabled),
    leadCount: settled(leadCount, 0),
    orderCount: settled(orderCount, 0),
    hasGoal: settled(settings, { monthlyGoalContacts: null }).monthlyGoalContacts != null,
    persistedDoneAt,
  });

  // Sticky: grava os autos já verdadeiros que ainda não estão persistidos, pra o
  // done_at ser durável e o progresso nunca regredir. Best-effort, não bloqueia.
  const toPersist = state.steps.filter((s) => s.auto && s.done && !persistedDoneAt[s.key]);
  if (toPersist.length > 0) {
    await Promise.all(toPersist.map((s) => markPlaybookStep(tenantId, s.key).catch(() => {})));
  }

  return state;
}

// GET /api/playbook — estado do playbook do tenant (autos + manuais).
export async function GET(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  try {
    return Response.json(await buildPlaybookState(tenantId));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/playbook — marca um passo MANUAL. Body: { stepKey }.
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

  const stepKey = String(body.stepKey ?? "");
  if (!isManualStepKey(stepKey)) {
    // Passos automáticos não podem ser forjados pelo cliente.
    return Response.json({ error: "Passo não é manual." }, { status: 400 });
  }

  try {
    await markPlaybookStep(tenantId, stepKey);
    return Response.json(await buildPlaybookState(tenantId));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
