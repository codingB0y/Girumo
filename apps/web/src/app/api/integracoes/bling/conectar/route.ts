import { randomBytes } from "node:crypto";

import { credenciaisBling, urlDeAutorizacao } from "@/lib/bling/oauth";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { chaveDeIntegracoes } from "@/lib/security/secret-box";
import { cookieDoEstado, criarEstadoOAuth, hashDoEstado } from "@/lib/stores/bling-oauth-states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** O code do Bling vence em 1 min, mas o login e a tela de autorização dele vêm antes. */
const VALIDADE_S = 600;

function resposta(corpo: unknown, status: number, cookie?: string): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return Response.json(corpo, { status, headers });
}

/**
 * POST /api/integracoes/bling/conectar — começa o OAuth (spec §3 "Conectar", passo 1).
 * POST e não link: o painel autentica por Bearer, que uma navegação não carrega, e a loja
 * certa vem do x-tenant-id de quem tem mais de uma. O state inteiro vai só no cookie e na
 * URL; o banco guarda o hash, preso à loja e a quem pediu.
 */
export async function POST(req: Request): Promise<Response> {
  let tenantId: string;
  let userId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !ctx.authUserId || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    tenantId = ctx.tenantId;
    userId = ctx.authUserId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[bling/conectar] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  const credenciais = credenciaisBling();
  if (!credenciais || !chaveDeIntegracoes()) return resposta({ error: "indisponivel" }, 503);

  const state = randomBytes(32).toString("base64url");
  try {
    await criarEstadoOAuth({ stateHash: hashDoEstado(state), tenantId, userId, expiraEm: new Date(Date.now() + VALIDADE_S * 1000) });
  } catch (e) {
    console.error(`[bling/conectar] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível começar a conexão com o Bling." }, 500);
  }
  return resposta({ url: urlDeAutorizacao(credenciais.clientId, state) }, 200, cookieDoEstado(state, VALIDADE_S));
}
