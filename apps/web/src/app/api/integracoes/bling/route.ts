import { credenciaisBling, revogarToken } from "@/lib/bling/oauth";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { abrir, chaveDeIntegracoes } from "@/lib/security/secret-box";
import { contextoDoToken, desconectarConexao, type ConexaoBling } from "@/lib/stores/bling-conexoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * DELETE /api/integracoes/bling — desconecta a loja (spec §3 "Desconectar"). Primeiro o banco
 * (tokens apagados, `desconectada`, trava solta), depois a revogação no Bling, que é melhor
 * esforço: sem ela a desconexão já vale aqui. Pedidos, contatos e vendas importadas ficam.
 */
export async function DELETE(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    tenantId = ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[bling/desconectar] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  let anterior: ConexaoBling | null;
  try {
    anterior = await desconectarConexao(tenantId);
  } catch (e) {
    console.error(`[bling/desconectar] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível desconectar o Bling." }, 500);
  }
  if (!anterior) return resposta({ error: "Sem conexão com o Bling." }, 404);

  await revogarAnterior(tenantId, anterior);
  return resposta({ ok: true }, 200);
}

/** Sem variáveis, sem token ou cifra que não abre: só pula a revogação (a mensagem do secret-box é fixa). */
async function revogarAnterior(tenantId: string, anterior: ConexaoBling): Promise<void> {
  const credenciais = credenciaisBling();
  const chave = chaveDeIntegracoes();
  if (!credenciais || !chave || !anterior.refreshTokenEnc) return;
  try {
    const refresh = abrir(anterior.refreshTokenEnc, contextoDoToken(tenantId, "refresh"), chave);
    await revogarToken(refresh, credenciais);
  } catch (e) {
    console.warn(`[bling/desconectar] ${tenantId}: revogação pulada (${(e as Error).message})`);
  }
}
