import "server-only";
import { parseModulos, podeAcessar } from "@/lib/auth/modulos";
import type { TenantRole } from "@/lib/permissions";
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
 * Guard de módulo (spec acesso-vendedora §1): recebe o `req` inteiro porque a
 * vendedora (`seller`) só ganha o tenant numa rota do mapa de
 * `lib/auth/modulos.ts`, com o método certo. Fora do mapa = `null`, igual a não
 * ter membership.
 *
 * Devolve `null` em vez de lançar, ao contrário de `getTenantContext`: as rotas
 * que usam isto respondem lista vazia ou um 403 próprio, e trocar isso por um
 * 401 propagado mudaria o contrato delas.
 */
export async function findMembershipTenantId(
  authUserId: string,
  req: Request,
): Promise<string | null> {
  let query = getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id, role, modules")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  const requestedTenantId = req.headers.get("x-tenant-id");
  if (requestedTenantId) query = query.eq("tenant_id", requestedTenantId);

  const { data } = await query.maybeSingle();
  const membership = data as { tenant_id: string; role: TenantRole; modules: unknown } | null;
  if (!membership) return null;

  const acesso = { role: membership.role, modules: parseModulos(membership.modules) };
  return podeAcessar(acesso, new URL(req.url).pathname, req.method) ? membership.tenant_id : null;
}

/**
 * Idem, partindo do cookie de sessão. `null` quando não há sessão — o chamador
 * decide se isso vira lista vazia ou 403.
 */
export async function resolveSessionTenantId(req: Request): Promise<string | null> {
  const authUserId = await getSessionAccountId();
  if (!authUserId) return null;
  return findMembershipTenantId(authUserId, req);
}
