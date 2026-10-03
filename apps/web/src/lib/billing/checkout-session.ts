import type Stripe from "stripe";

import { TRIAL_DAYS } from "./trial";

/**
 * A sessão de Checkout do Stripe, montada fora da rota para ser testada.
 *
 * Sem teste, ela tem de sair idêntica à de antes do teste grátis — é o caminho do
 * boleto, e os métodos de pagamento vêm do Dashboard. Com teste, o cartão é
 * obrigatório: boleto não renova sozinho, e um teste que termina sem meio de
 * cobrança só existe para ser cancelado.
 */
export type CheckoutSessionInput = {
  customerId: string;
  priceId: string;
  appUrl: string;
  tenantId: string;
  planId: string;
  planCode: string;
  comTeste: boolean;
};

export function checkoutSessionParams(i: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams {
  const metadata = { tenant_id: i.tenantId, plan_id: i.planId, plan_code: i.planCode };
  const base: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: i.customerId,
    line_items: [{ price: i.priceId, quantity: 1 }],
    success_url: `${i.appUrl}/painel/configuracoes?billing=success`,
    cancel_url: `${i.appUrl}/painel/configuracoes?billing=cancelled`,
    client_reference_id: i.tenantId,
    metadata,
    subscription_data: { metadata },
  };

  if (!i.comTeste) return base;

  return {
    ...base,
    payment_method_types: ["card"],
    payment_method_collection: "always",
    // Volta para o Início: é lá que a faixa confirma "teste até DD/MM".
    success_url: `${i.appUrl}/painel?billing=trial_started`,
    subscription_data: {
      metadata: { ...metadata, trial: "1" },
      trial_period_days: TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    },
  };
}
