import "server-only";

import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { checkRateLimit } from "@/lib/security/rate-limit";

/** O que as rotas do cartão da Yampi têm em comum: resposta sem cache, dono ou admin, e o teto por loja. */

export function respostaYampi(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/** Dono ou admin da loja do pedido (`settings:connection`); senão a resposta de recusa pronta. */
export async function lojaDoDonoYampi(req: Request, rotulo: string): Promise<string | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return respostaYampi({ error: "Sem permissão para esta ação." }, 403);
    }
    return ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[${rotulo}] contexto: ${(e as Error).message}`);
    return respostaYampi({ error: "erro" }, 500);
  }
}

const TENTATIVAS_POR_MINUTO = 5;

/** Conectar e Testar chamam a Yampi, cujo limite é do IP de saída, dividido entre todas as lojas. */
export async function passouDoTetoYampi(acao: "conectar" | "testar", tenantId: string): Promise<Response | null> {
  if (!(await checkRateLimit(`yampi:${acao}:${tenantId}`, TENTATIVAS_POR_MINUTO, 60_000))) return null;
  return respostaYampi({ error: "Muitas tentativas. Aguarde 1 minuto." }, 429);
}
