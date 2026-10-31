import "server-only";

import { bloqueioDoRecuperar, precoRecuperar, type BloqueioDoRecuperar } from "@/lib/billing/recuperar-addon";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type ContextoDoRecuperar = {
  bloqueio: BloqueioDoRecuperar | null;
  /** `null` = `STRIPE_PRICE_RECUPERAR` ausente: a venda está fechada. */
  precoId: string | null;
};

/** O que a oferta e o checkout decidem, lido no servidor e sempre da loja da sessão. */
export async function contextoDoRecuperar(tenantId: string): Promise<ContextoDoRecuperar> {
  const [plano, settings] = await Promise.all([
    getSupabaseAdmin().from("subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle(),
    getTenantSettings(tenantId),
  ]);
  if (plano.error) throw new Error(plano.error.message);
  return {
    bloqueio: bloqueioDoRecuperar({
      planoStatus: (plano.data?.status as string | undefined) ?? null,
      recuperarAtivo: settings.recuperarEnabled,
    }),
    precoId: precoRecuperar(),
  };
}
