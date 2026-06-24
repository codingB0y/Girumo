import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionAccountId } from "@/lib/session";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveTenantId(authUserId: string, requestedTenantId: string | null): Promise<string | null> {
  let query = getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (requestedTenantId) query = query.eq("tenant_id", requestedTenantId);

  const { data } = await query.maybeSingle();
  return data?.tenant_id ?? null;
}

export async function GET(req: Request) {
  let tenantId: string | null = null;

  if (req.headers.get("authorization")) {
    try {
      tenantId = (await getTenantContext(req)).tenantId;
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
  } else {
    const authUserId = await getSessionAccountId();
    if (!authUserId) return Response.json({ error: "Nao autenticado." }, { status: 401 });
    tenantId = await resolveTenantId(authUserId, req.headers.get("x-tenant-id"));
  }

  if (!tenantId) return Response.json({ error: "Tenant nao encontrado." }, { status: 403 });

  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST() {
  return Response.json(
    { error: "Fluxo manual legado desativado. Use /api/billing/checkout para alterar assinatura." },
    { status: 410 },
  );
}
