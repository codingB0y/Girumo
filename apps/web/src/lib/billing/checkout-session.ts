import type Stripe from "stripe";

import { TRIAL_DAYS, trialEligible, type TrialFacts } from "./trial";

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

/**
 * Validade da sessão COM teste. 30 min é o mínimo do Stripe, contado da criação no
 * relógio dele; o minuto a mais cobre latência e relógio, que senão fariam o Stripe
 * recusar a sessão. Curta de propósito: encolhe a janela em que uma sessão de
 * teste esquecida conclui depois de outro checkout.
 */
const TRIAL_SESSION_TTL_S = 31 * 60;

export function checkoutSessionParams(
  i: CheckoutSessionInput,
  agora: Date = new Date(),
): Stripe.Checkout.SessionCreateParams {
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
    expires_at: Math.floor(agora.getTime() / 1000) + TRIAL_SESSION_TTL_S,
    // Volta para o Início: é lá que a faixa confirma "teste até DD/MM".
    success_url: `${i.appUrl}/painel?billing=trial_started`,
    subscription_data: {
      metadata: { ...metadata, trial: "1" },
      trial_period_days: TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    },
  };
}

/**
 * O checkout leva teste só se a conta for elegível E o cliente não tiver desistido.
 *
 * O cliente nunca pede teste — só pode recusá-lo, e só com o booleano `true`
 * (é o caminho do boleto). Qualquer outro valor, `"true"` incluso, segue a regra
 * do servidor.
 */
export function trialApplies(semTeste: unknown, facts: TrialFacts): boolean {
  return semTeste !== true && trialEligible(facts);
}

export type TrialCheckoutDecision = "sem_teste" | "com_teste" | "em_teste";

/**
 * O que o teste decide sobre um checkout.
 *
 * - Flag desligada: o checkout de antes do teste — nem lê os fatos.
 * - Conta em teste (`trialing`): `em_teste`, boleto incluso. Uma segunda assinatura
 *   ao lado do teste cobraria em dobro; troca de plano no teste é pelo portal.
 *   `active`/`past_due` passam: é o "Trocar de plano" de quem já assina.
 * - Senão, `trialApplies`.
 *
 * Erro de leitura sobe: a rota responde 500, nunca um checkout no escuro.
 */
export async function trialCheckoutDecision(i: {
  enabled: boolean;
  semTeste: unknown;
  readFacts: () => Promise<TrialFacts>;
}): Promise<TrialCheckoutDecision> {
  if (!i.enabled) return "sem_teste";
  const facts = await i.readFacts();
  if (facts.subscription?.status === "trialing") return "em_teste";
  return trialApplies(i.semTeste, facts) ? "com_teste" : "sem_teste";
}
