import "server-only";

import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getTenantContext, type TenantContext } from "@/lib/supabase/tenant-context";

/**
 * Sessão + liberação do add-on. O código fixo deixa a tela distinguir "sem
 * sessão" (401) de "loja sem o Recuperar" (403) e mostrar o aviso certo.
 * Toda rota do módulo chama isto, menos `status` (`rotas-guardadas.test.ts`).
 */
export async function requireRecuperar(req: Request): Promise<TenantContext> {
  const ctx = await getTenantContext(req);
  const settings = await getTenantSettings(ctx.tenantId);
  if (!settings.recuperarEnabled) {
    throw Response.json({ error: "O Recuperar não está liberado para esta loja.", code: "recuperar_disabled" }, { status: 403 });
  }
  return ctx;
}
