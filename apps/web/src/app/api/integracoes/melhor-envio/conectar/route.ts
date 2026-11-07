import { iniciarConexao } from "@/lib/melhor-envio/conexao";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: unknown, status: number, cookie?: string): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return Response.json(corpo, { status, headers });
}

/**
 * POST /api/integracoes/melhor-envio/conectar — começa o OAuth. POST e não link: o painel autentica por
 * Bearer, que uma navegação não carrega. Molde: `bling/conectar`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !ctx.authUserId || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    const r = await iniciarConexao({ tenantId: ctx.tenantId, userId: ctx.authUserId });
    return resposta(r.corpo, r.status, r.cookie);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[melhor-envio/conectar] ${(e as Error).message}`);
    return resposta({ error: "Não foi possível começar a conexão com o Melhor Envio." }, 500);
  }
}
