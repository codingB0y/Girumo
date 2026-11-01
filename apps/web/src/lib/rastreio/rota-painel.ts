import "server-only";

import { resposta } from "@/lib/bio/painel-api";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { rastreioLigado } from "@/lib/stores/rastreio-config";

/** O 403 do módulo desligado (contrato do PR 1, molde `requireInstagram`). */
export const RASTREIO_DISABLED = {
  error: "O Rastreio de pedidos não está liberado para esta loja.",
  code: "rastreio_disabled",
} as const;

/**
 * Guarda das rotas `app/api/rastreio/*` do painel: sessão, `settings:connection` (dono e admin) e, por
 * padrão, o módulo ligado. A vendedora para antes, no mapa de `lib/auth/modulos.ts` (fechado para
 * `/api/rastreio`): a `Response` lançada pelo contexto volta como está.
 */
export async function lojaDoRastreioNoPainel(
  req: Request,
  opcoes: { exigirLigado?: boolean } = {},
): Promise<{ tenantId: string } | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    if ((opcoes.exigirLigado ?? true) && !(await rastreioLigado(ctx.tenantId))) return resposta(RASTREIO_DISABLED, 403);
    return { tenantId: ctx.tenantId };
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/rastreio] sessão: ${(e as Error).message}`);
    return resposta({ error: "Não deu para abrir o Rastreio." }, 500);
  }
}
