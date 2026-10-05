import "server-only";

import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getTenantContext, type TenantContext } from "@/lib/supabase/tenant-context";

/**
 * Sessão + liberação do add-on. O código fixo deixa a tela distinguir "sem
 * sessão" (401) de "loja sem o Instagram" (403) e mostrar o aviso certo.
 */
export async function requireInstagram(req: Request): Promise<TenantContext> {
  const ctx = await getTenantContext(req);
  const settings = await getTenantSettings(ctx.tenantId);
  if (!settings.instagramEnabled) {
    throw Response.json({ error: "O Instagram não está liberado para esta loja.", code: "instagram_disabled" }, { status: 403 });
  }
  return ctx;
}
