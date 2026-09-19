import "server-only";
import { getSessionAccountId } from "@/lib/session";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { findMembershipTenantId } from "@/lib/session-tenant";

export type MediaAuth = { authUserId: string; tenantId: string };

/** Resolve auth+tenant do chamador (Bearer da engine, ou sessão do painel). Compartilhado entre as rotas de upload de mídia. */
export async function resolveMediaAuth(req: Request): Promise<MediaAuth | Response> {
  if (req.headers.get("authorization")) {
    try {
      const ctx = await getTenantContext(req);
      return { authUserId: ctx.authUserId, tenantId: ctx.tenantId };
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
  }

  const authUserId = await getSessionAccountId();
  if (!authUserId) return Response.json({ error: "Nao autenticado." }, { status: 401 });

  const tenantId = await findMembershipTenantId(authUserId, req.headers.get("x-tenant-id"));
  if (!tenantId) return Response.json({ error: "Tenant nao encontrado." }, { status: 403 });

  return { authUserId, tenantId };
}
