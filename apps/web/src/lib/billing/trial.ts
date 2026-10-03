/**
 * Teste grátis de 7 dias com cartão (spec 2026-10-03).
 *
 * Puro de propósito: roda sob `tsx --test` e no browser. Quem lê o banco é
 * `trial-facts.ts`; quem aplica o teste é a rota de checkout. O cliente nunca pede
 * teste — o servidor decide com estes fatos.
 */

export const TRIAL_DAYS = 7;

/** Por que o webhook cancelou uma assinatura de teste. Vai em `metadata.cancel_reason`. */
export type TrialCancelReason = "trial_card_reused" | "trial_duplicate";

export type TrialSubscriptionFacts = {
  /** `subscriptions.status`. */
  status: string | null;
  /** `subscriptions.stripe_subscription_id`. */
  stripeSubscriptionId: string | null;
  /** `subscriptions.current_period_end` — durante o teste, é o fim do teste. */
  periodEnd: string | null;
  /** `subscriptions.metadata.cancel_reason`. */
  cancelReason: string | null;
  planName: string | null;
  priceCents: number | null;
};

export type TrialFacts = {
  /** `organizations.trial_subscription_id`: a assinatura que já consumiu o teste. */
  trialSubscriptionId: string | null;
  subscription: TrialSubscriptionFacts | null;
};

export type TrialView = {
  elegivel: boolean;
  emTeste: { fim: string; plano: string; precoCents: number } | null;
  cartaoRepetido: boolean;
};

/**
 * Elegível = nunca testou E nunca teve assinatura no Stripe.
 *
 * A segunda metade é o que impede o cliente que já pagou (e cancelou) de voltar
 * por 7 dias grátis. Linha de `subscriptions` SEM id do Stripe — o FREE antigo e a
 * concessão manual — continua elegível de propósito.
 */
export function trialEligible(facts: TrialFacts): boolean {
  return !facts.trialSubscriptionId && !facts.subscription?.stripeSubscriptionId;
}

export function trialView(facts: TrialFacts): TrialView {
  const sub = facts.subscription;
  const emTeste =
    sub?.status === "trialing" && sub.periodEnd
      ? { fim: sub.periodEnd, plano: sub.planName ?? "", precoCents: sub.priceCents ?? 0 }
      : null;

  return {
    elegivel: trialEligible(facts),
    emTeste,
    cartaoRepetido: sub?.status === "canceled" && sub.cancelReason === "trial_card_reused",
  };
}
