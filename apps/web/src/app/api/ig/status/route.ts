import { getAccount } from "@/lib/stores/ig-accounts";
import { listFlows } from "@/lib/stores/ig-flows";
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
    return Response.json({
      enabled: true,
      account: account ? { username: account.username, status: account.status } : null,
      live: flows.filter((f) => f.status === "live").length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
