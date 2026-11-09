import "server-only";

import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { checkRateLimit } from "@/lib/security/rate-limit";

/** O que as rotas do cartão da Yampi têm em comum: resposta sem cache, dono ou admin, e o teto. */

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

const MINUTO_MS = 60_000;
/** Conectar e Testar somados, por loja. */
const TENTATIVAS_POR_LOJA = 5;
/**
 * Todas as lojas somadas: o limite da Yampi (~60/min) é do IP de saída, e cada Conectar ou Testar gasta de 1 a 4
 * chamadas. Sem este, umas poucas lojas apertando o botão deixariam a conferência do cron de todas levando 429.
 */
const TENTATIVAS_DE_TODAS = 20;

/** null = pode chamar a Yampi; senão o 429 pronto. A loja primeiro: quem já passou do seu não gasta o de todas. */
export async function passouDoTetoYampi(tenantId: string): Promise<Response | null> {
  const bloqueado =
    (await checkRateLimit(`yampi:cartao:${tenantId}`, TENTATIVAS_POR_LOJA, MINUTO_MS)) ||
    // Com o Upstash fora, o balde em memória é por instância: o teto baixa para não virar N×.
    (await checkRateLimit("yampi:cartao:todas", TENTATIVAS_DE_TODAS, MINUTO_MS, { maxSeFalhar: TENTATIVAS_POR_LOJA }));
  return bloqueado ? respostaYampi({ error: "Muitas tentativas. Aguarde 1 minuto." }, 429) : null;
}
