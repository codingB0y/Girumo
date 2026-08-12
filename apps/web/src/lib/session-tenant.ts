import "server-only";
import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Tenant do usuário a partir da membership aceita, honrando `x-tenant-id`.
 *
 * Sem esse filtro a consulta devolve sempre a membership mais antiga: quem
 * pertence a mais de uma organização fica preso na primeira e nunca enxerga as
 * outras. Cinco rotas carregavam uma cópia própria desta query — todas sem o
 * filtro. Esta é a única implementação.
 *
 * Devolve `null` em vez de lançar, ao contrário de `getTenantContext`: as rotas
 * que usam isto respondem lista vazia ou um 403 próprio, e trocar isso por um
 * 401 propagado mudaria o contrato delas.
 */
export async function findMembershipTenantId(
  authUserId: string,
  requestedTenantId: string | null,
): Promise<string | null> {
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

/**
 * Idem, partindo do cookie de sessão. `null` quando não há sessão — o chamador
 * decide se isso vira lista vazia ou 403.
 */
export async function resolveSessionTenantId(req: Request): Promise<string | null> {
  const authUserId = await getSessionAccountId();
  if (!authUserId) return null;
  return findMembershipTenantId(authUserId, req.headers.get("x-tenant-id"));
}
