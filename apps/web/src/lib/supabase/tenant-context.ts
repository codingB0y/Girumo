import "server-only";
import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";

export type TenantRole = "owner" | "admin" | "operator";

export type TenantContext = {
  authUserId: string;
  email: string | null;
  tenantId: string;
  role: TenantRole;
};

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function getTenantContext(req: Request): Promise<TenantContext> {
  const accessToken = getBearerToken(req);
  if (!accessToken) throw new Response("Nao autenticado.", { status: 401 });

  const authClient = getSupabaseAnonForToken(accessToken);
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    throw new Response("Sessao Supabase invalida.", { status: 401 });
  }

  const requestedTenantId = req.headers.get("x-tenant-id");
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", userData.user.id)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (requestedTenantId) query = query.eq("tenant_id", requestedTenantId);

  const { data: memberships, error } = await query;
  const membership = memberships?.[0] as { tenant_id: string; role: TenantRole } | undefined;

  if (error || !membership) {
    throw new Response("Tenant nao encontrado ou sem permissao.", { status: 403 });
  }

  return {
    authUserId: userData.user.id,
    email: userData.user.email ?? null,
    tenantId: membership.tenant_id,
    role: membership.role,
  };
}

export function assertBillingRole(ctx: TenantContext): void {
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new Response("Sem permissao para billing.", { status: 403 });
  }
}

