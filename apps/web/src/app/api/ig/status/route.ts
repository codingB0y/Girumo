import { getAccount } from "@/lib/stores/ig-accounts";
import { listFlows } from "@/lib/stores/ig-flows";
import { countRunsStartedSince } from "@/lib/stores/ig-runs";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ig/status — o que a casca precisa: liberado? conta? quantos no ar?
// Qualquer loja logada pode perguntar; sem a liberação a resposta é só `enabled: false`.
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const settings = await getTenantSettings(ctx.tenantId);
    if (!settings.instagramEnabled) return Response.json({ enabled: false, account: null, live: 0 });
    const [account, flows] = await Promise.all([getAccount(ctx.tenantId), listFlows(ctx.tenantId)]);
    const startedLastHour = account ? await countRunsStartedSince(ctx.tenantId, account.id, new Date(Date.now() - 3_600_000).toISOString()) : 0;
    return Response.json({
      enabled: true,
      account: account ? { username: account.username, status: account.status } : null,
      live: flows.filter((f) => f.status === "live").length,
      startedLastHour,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
