import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantLimits } from "@/lib/billing/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/billing/usage
 *
 * Retorna uso atual vs limites do plano.
 * Usado pelo frontend pra mostrar gating contextual.
 */
export async function GET(req: Request) {
  const ctx = await getTenantContext(req);
  const supabase = getSupabaseAdmin();
  const tenantId = ctx.tenantId;

  const [limits, campaignsRes, contactsRes] = await Promise.all([
    getTenantLimits(tenantId),
    supabase
      .from("campaign_groups")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  const campaignsCount = campaignsRes.count ?? 0;
  const contactsCount = contactsRes.count ?? 0;

  return NextResponse.json({
    campaigns: { used: campaignsCount, limit: limits.campaigns ?? null },
    contacts: { used: contactsCount, limit: limits.contacts ?? null },
  });
}
