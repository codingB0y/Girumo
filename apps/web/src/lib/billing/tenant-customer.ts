import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { resolveCheckoutCustomerId } from "./checkout-customer";

/**
 * O Customer do Stripe do tenant: o que já existe, ou um novo, gravado em
 * `organizations.stripe_customer_id`.
 *
 * Saiu da rota de checkout para a cortesia do admin usar o MESMO ponteiro —
 * dois caminhos criando Customer por conta própria é o bug que
 * `checkout-customer.ts` existe para matar.
 */
export function resolveTenantCustomerId(i: {
  supabase: SupabaseClient;
  stripe: Stripe;
  tenantId: string;
  email: string | null;
  /** Vai no metadata do Customer criado; o checkout passa quem está logado. */
  authUserId: string | null;
}): Promise<string> {
  const { supabase, stripe, tenantId } = i;

  return resolveCheckoutCustomerId({
    tenantId,
    email: i.email,
    readTenantCustomerId: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("stripe_customer_id")
        .eq("id", tenantId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      // Engolir erro aqui traz o bug de volta invisivel: leitura que falha
      // vira customer novo a cada tentativa, que e exatamente o que este
      // caminho existe para evitar.
      if (error) throw error;
      return (data?.stripe_customer_id as string | null) ?? null;
    },
    readSubscriptionCustomerId: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return (data?.stripe_customer_id as string | null) ?? null;
    },
    createCustomer: async ({ idempotencyKey }) => {
      const customer = await stripe.customers.create(
        {
          email: i.email ?? undefined,
          metadata: {
            tenant_id: tenantId,
            ...(i.authUserId ? { auth_user_id: i.authUserId } : {}),
          },
        },
        { idempotencyKey },
      );
      return customer.id;
    },
    claimCustomerId: async (candidate) => {
      // Grava so enquanto o ponteiro estiver vazio: se duas abas abrirem o
      // checkout juntas, quem perde a corrida segue com o customer do vencedor
      // em vez de apontar para um que ninguem mais referencia.
      const { data: claimed, error: claimError } = await supabase
        .from("organizations")
        .update({ stripe_customer_id: candidate })
        .eq("id", tenantId)
        .eq("tenant_id", tenantId)
        .is("stripe_customer_id", null)
        .select("stripe_customer_id")
        .maybeSingle();

      // Nao ter casado linha e o caso normal da corrida e vem sem erro. Erro
      // aqui e outra coisa — violacao do indice unico, por exemplo — e nao
      // pode virar checkout silenciosamente apontado para o customer errado.
      if (claimError) throw claimError;
      if (claimed?.stripe_customer_id) return claimed.stripe_customer_id as string;

      const { data: winner } = await supabase
        .from("organizations")
        .select("stripe_customer_id")
        .eq("id", tenantId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      return (winner?.stripe_customer_id as string | null) ?? candidate;
    },
  });
}
