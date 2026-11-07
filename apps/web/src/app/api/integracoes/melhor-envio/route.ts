import { montarCartao } from "@/lib/melhor-envio/cartao";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { apagarConexao } from "@/lib/stores/melhorenvio-conexoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/** Dono ou admin da loja do pedido; senão a resposta de recusa pronta. */
async function lojaDoDono(req: Request, rotulo: string): Promise<string | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    return ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[${rotulo}] contexto: ${e instanceof Error ? e.name : "erro"}`);
    return resposta({ error: "erro" }, 500);
  }
}

/** GET /api/integracoes/melhor-envio — o cartão. Nunca devolve token. */
export async function GET(req: Request): Promise<Response> {
  const tenantId = await lojaDoDono(req, "melhor-envio/cartao");
  if (tenantId instanceof Response) return tenantId;
  try {
    return resposta(await montarCartao(tenantId, new Date()), 200);
  } catch (e) {
    console.error(`[melhor-envio/cartao] ${tenantId}: ${e instanceof Error ? e.name : "erro"}`);
    return resposta({ error: "Não foi possível carregar o Melhor Envio." }, 500);
  }
}

/** DELETE /api/integracoes/melhor-envio — desconecta (apaga a conexão e os tokens da loja). */
export async function DELETE(req: Request): Promise<Response> {
  const tenantId = await lojaDoDono(req, "melhor-envio/desconectar");
  if (tenantId instanceof Response) return tenantId;
  try {
    await apagarConexao(tenantId);
    return resposta({ ok: true }, 200);
  } catch (e) {
    console.error(`[melhor-envio/desconectar] ${tenantId}: ${e instanceof Error ? e.name : "erro"}`);
    return resposta({ error: "Não foi possível desconectar o Melhor Envio." }, 500);
  }
}
