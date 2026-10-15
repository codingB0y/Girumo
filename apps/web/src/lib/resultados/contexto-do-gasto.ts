import { assertPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

/** Resposta JSON sem cache: gasto é dado de caixa. */
export function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

const SEM_PERMISSAO = "Sem permissão para esta ação.";

/**
 * O portão das rotas de gasto: loja da sessão + `ads:manage` (dono, administração)
 * em todo verbo, o GET também. A vendedora para antes, no guard de módulo de
 * `getTenantContext` (a rota não está em `lib/auth/modulos.ts`). Devolve o contexto
 * ou a `Response` que a rota deve devolver como está.
 */
export async function contextoDoGasto(
  req: Request,
  rota: string,
): Promise<{ tenantId: string; autor: string | null } | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role) throw new Response(SEM_PERMISSAO, { status: 403 });
    assertPermission(ctx.role, "ads:manage");
    return { tenantId: ctx.tenantId, autor: ctx.authUserId };
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[${rota}] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }
}
