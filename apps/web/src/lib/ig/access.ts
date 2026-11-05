import "server-only";

import { decidirPessoas, type AcessoPessoas, type NivelPessoas } from "@/lib/ig/pessoas-acesso";
import { getInstagramDisabledAt, getTenantSettings } from "@/lib/stores/tenant-settings";
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

type AcessoLiberado = Extract<AcessoPessoas, { ok: true }>;

/**
 * Guarda das rotas de Pessoas. Além do add-on ligado (como `requireInstagram`), deixa dono e admin
 * lerem e exportarem por 30 dias depois de cancelar; escrita nesse período responde 403
 * `instagram_read_only`. A regra mora em `pessoas-acesso.ts` (pura, testável sem banco).
 */
export async function requirePessoas(req: Request, nivel: NivelPessoas): Promise<{ ctx: TenantContext; acesso: AcessoLiberado }> {
  const ctx = await getTenantContext(req);
  const settings = await getTenantSettings(ctx.tenantId);
  const disabledAt = settings.instagramEnabled ? null : await getInstagramDisabledAt(ctx.tenantId);
  const acesso = decidirPessoas({ role: ctx.role, enabled: settings.instagramEnabled, disabledAt, nivel, agoraMs: Date.now() });
  if (!acesso.ok) throw Response.json({ error: acesso.error, code: acesso.code }, { status: acesso.status });
  return { ctx, acesso };
}
