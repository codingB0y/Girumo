import "server-only";
import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";
import { SESSION_COOKIE, parseSession } from "@/lib/auth";
import { isRevoked } from "@/lib/auth/session-revocation-store";

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

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }

  return null;
}

export async function getTenantContext(req: Request): Promise<TenantContext> {
  const accessToken = getBearerToken(req);
  const supabase = getSupabaseAdmin();
  let authUserId: string | null = null;
  let email: string | null = null;

  if (accessToken) {
    const authClient = getSupabaseAnonForToken(accessToken);
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);

    if (userError || !userData.user) {
      throw new Response("Sessao Supabase invalida.", { status: 401 });
    }

    authUserId = userData.user.id;
    email = userData.user.email ?? null;
  } else {
    // O cookie legado vale 30 dias. A revogação é checada AQUI, e não no
    // middleware, porque o middleware roda em Edge e não tem banco — e é aqui
    // que os dados são servidos, então é aqui que a recusa importa.
    const claims = await parseSession(getCookie(req, SESSION_COOKIE));
    if (!claims) throw new Response("Nao autenticado.", { status: 401 });
    if (await isRevoked(claims.authUserId, claims.issuedAt)) {
      throw new Response("Sessao encerrada. Entre de novo.", { status: 401 });
    }

    authUserId = claims.authUserId;

    const { data: userData } = await supabase.auth.admin.getUserById(authUserId);
    email = userData.user?.email ?? null;
  }

  const requestedTenantId = req.headers.get("x-tenant-id");

  let query = supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", authUserId)
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
    authUserId,
    email,
    tenantId: membership.tenant_id,
    role: membership.role,
  };
}

export function assertBillingRole(ctx: TenantContext): void {
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new Response("Sem permissao para billing.", { status: 403 });
  }
}
