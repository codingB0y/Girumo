import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { TrialFacts } from "./trial";

/**
 * Os fatos que decidem o teste grátis de um tenant.
 *
 * Erro de leitura SOBE: em caminho de cobrança, "não consegui ler" virar "nunca
 * testou" entregaria um segundo teste de graça — é o mesmo defeito de forma que
 * `getTenantLimits` já teve.
 */
export async function readTrialFacts(supabase: SupabaseClient, tenantId: string): Promise<TrialFacts> {
  const [org, sub] = await Promise.all([
    supabase
      .from("organizations")
      .select("trial_subscription_id")
      .eq("id", tenantId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, stripe_subscription_id, current_period_end, metadata, plans(name, price_cents)")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  if (org.error) throw org.error;
  if (sub.error) throw sub.error;

  const linha = sub.data;
  const plano = (linha?.plans ?? null) as { name?: string | null; price_cents?: number | null } | null;
  const meta = (linha?.metadata ?? null) as { cancel_reason?: string | null } | null;

  return {
    trialSubscriptionId: (org.data?.trial_subscription_id as string | null | undefined) ?? null,
    subscription: linha
      ? {
          status: (linha.status as string | null) ?? null,
          stripeSubscriptionId: (linha.stripe_subscription_id as string | null) ?? null,
          periodEnd: (linha.current_period_end as string | null) ?? null,
          cancelReason: meta?.cancel_reason ?? null,
          planName: plano?.name ?? null,
          priceCents: plano?.price_cents ?? null,
        }
      : null,
  };
}
