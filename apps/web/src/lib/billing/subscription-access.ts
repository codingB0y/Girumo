/**
 * Uma assinatura concede o plano pago? E o que dizer ao cliente sobre ela?
 *
 * Existe porque `subscriptions.status` não basta para responder nenhuma das
 * duas perguntas. O enum do banco tem seis valores e `unpaid` carrega DOIS
 * significados opostos:
 *
 *  - primeira cobrança pendente (o Stripe manda `incomplete`, e
 *    `mapStripeStatus` traduz para `unpaid` por falta de valor melhor no enum);
 *  - o Stripe tentou cobrar, falhou várias vezes e desistiu (`unpaid` nativo).
 *
 * O primeiro é um cliente que ACABOU de pagar por boleto. O segundo é um
 * inadimplente. Até 26/08 os dois recebiam o mesmo tratamento: caíam no FREE e
 * liam "Pagamento pendente — regularize pra não perder acesso". Quem tinha
 * emitido boleto não tinha o que regularizar, e ao tentar criar uma campanha
 * ainda ouvia "Seu plano atual não inclui campanhas. Escolha um plano pra
 * liberar" — um convite a pagar duas vezes.
 *
 * O que separa os dois é `metadata.stripe_status`, que o webhook já grava na
 * própria linha desde sempre. Nenhuma migração foi necessária.
 *
 * Decisão do Igor em 26/08: boleto emitido LIBERA o plano até vencer. Não é
 * trial (que foi descartado no mesmo dia) — é acesso preso a uma compra já
 * iniciada. Sem isso, o cliente que converteu bate numa parede por 1 a 3 dias
 * úteis logo depois de decidir comprar, e o paywall é o único momento de
 * conversão do produto.
 */

/** Status crus do Stripe que significam "primeira cobrança ainda pendente". */
const STRIPE_PENDENTE: ReadonlySet<string> = new Set(["incomplete"]);

/** Status do banco que já significam assinatura valendo. */
const CONCEDE_DIRETO: ReadonlySet<string> = new Set(["active", "trialing", "free"]);

/**
 * Até quando um boleto pendente concede o plano.
 *
 * Quem normalmente encerra um boleto não pago é o próprio Stripe:
 * `incomplete_expired` chega, `mapStripeStatus` devolve `canceled` e o acesso
 * cai sozinho. `current_period_end` é o teto para o caso em que ESSE webhook se
 * perde — sem ele, o acesso ficaria aberto para sempre, de graça, sem ninguém
 * notar.
 *
 * É `current_period_end` e NÃO `updated_at` de propósito: o trigger
 * `set_updated_at_subscriptions` grava `now()` em todo update, então
 * `updated_at` mede a última sincronização do webhook e não a idade da
 * pendência — um teto baseado nele reiniciaria a cada evento do Stripe e nunca
 * fecharia. Isso passou despercebido no teste unitário (que injeta a data
 * direto) e só apareceu ao escrever no banco de verdade.
 */
export type SubscriptionAccessInput = {
  /** `subscriptions.status`. */
  status: string | null;
  /** `subscriptions.metadata.stripe_status` — o valor cru do Stripe. */
  stripeStatus: string | null;
  /** `subscriptions.current_period_end`. */
  periodEnd: string | null;
};

export type SubscriptionState =
  /** Assinatura valendo. */
  | "active"
  /** Boleto/Pix emitido, dinheiro a caminho. Concede o plano. */
  | "pending_payment"
  /** Pendente tempo demais: provável webhook perdido. Não concede. */
  | "pending_expired"
  /** Cobrança falhou (renovação ou tentativas esgotadas). Não concede. */
  | "payment_failed"
  /** Assinatura cancelada. */
  | "canceled"
  /** Sem assinatura. */
  | "none";

export type SubscriptionAccess = {
  grantsPlan: boolean;
  state: SubscriptionState;
};

/** O periodo ainda vale? Data ausente ou ilegivel conta como vencida. */
function periodoVigente(periodEnd: string | null, agora: Date): boolean {
  if (!periodEnd) return false;
  const t = Date.parse(periodEnd);
  if (Number.isNaN(t)) return false;
  return t > agora.getTime();
}

export function subscriptionAccess(
  input: SubscriptionAccessInput,
  agora: Date,
): SubscriptionAccess {
  const status = input.status?.trim() ?? "";

  if (!status) return { grantsPlan: false, state: "none" };
  if (CONCEDE_DIRETO.has(status)) return { grantsPlan: true, state: "active" };
  if (status === "canceled") return { grantsPlan: false, state: "canceled" };

  // `unpaid` só concede quando o Stripe diz que é primeira cobrança pendente.
  // Sem `stripe_status` (linha antiga) o desconhecido é tratado como falha: em
  // caminho de cobrança, adivinhar a favor entrega plano pago de graça.
  if (status === "unpaid" && input.stripeStatus && STRIPE_PENDENTE.has(input.stripeStatus)) {
    if (!periodoVigente(input.periodEnd, agora)) {
      return { grantsPlan: false, state: "pending_expired" };
    }
    return { grantsPlan: true, state: "pending_payment" };
  }

  return { grantsPlan: false, state: "payment_failed" };
}

/**
 * A frase que o cliente lê sobre a própria assinatura.
 *
 * Fica junto da decisão de acesso porque as duas têm de concordar: dizer
 * "regularize" para quem está com acesso liberado por boleto emitido é o
 * defeito original, só que ao contrário.
 */
export function subscriptionNotice(state: SubscriptionState): string {
  switch (state) {
    case "pending_payment":
      return "Boleto emitido — seu acesso já está liberado. Confirmamos assim que o pagamento compensar.";
    case "pending_expired":
      return "Não recebemos a confirmação do pagamento. Gere uma nova cobrança pra liberar o acesso.";
    case "payment_failed":
      return "Pagamento pendente — regularize pra não perder acesso.";
    case "canceled":
      return "Assinatura cancelada.";
    case "none":
      return "Sem assinatura ativa.";
    default:
      return "Assinatura ativa.";
  }
}
