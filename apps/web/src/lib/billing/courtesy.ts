import type Stripe from "stripe";

/**
 * Cortesia de N meses que devolve a cobrança sozinha no fim.
 *
 * A concessão manual (`manual-grant.ts`) não expira e não fala com o Stripe.
 * Esta é o oposto: um cupom de 100% `repeating` por N meses aplicado na
 * assinatura REAL do tenant. As faturas do período saem a R$ 0 e, quando o
 * cupom vence, o Stripe volta a cobrar o preço cheio pelo mesmo meio de
 * pagamento — ninguém precisa lembrar de revogar nada.
 *
 * Cupom e não `pause_collection` nem `trial_end`:
 *
 * - `pause_collection` não existe na criação, e o tenant sem assinatura (ou com
 *   assinatura cancelada) precisa de uma nova.
 * - `trial_end` põe a assinatura em `trialing`, e aí o webhook roda as travas do
 *   teste grátis (`enforceTrialLocks`): conta que já testou, ou cartão que testou
 *   em outra conta, teria a assinatura CANCELADA no aviso de fim de teste.
 *
 * Fatura de R$ 0 chega como `invoice.paid` com `amount_paid` 0, que o webhook já
 * ignora — a cortesia não vira venda no funil.
 */

/** Teto contra erro de digitação (120 em vez de 12), não regra de negócio. */
export const COURTESY_MAX_MONTHS = 36;

/** Inteiro de 1 a `COURTESY_MAX_MONTHS`, vindo do formulário como número ou texto. */
export function parseCourtesyMonths(raw: unknown): number | null {
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > COURTESY_MAX_MONTHS) return null;
  return n;
}

/**
 * Um cupom por duração, com id fixo: a segunda cortesia de 3 meses reaproveita o
 * da primeira em vez de encher o Dashboard de cupons iguais.
 */
export function courtesyCouponParams(months: number): Stripe.CouponCreateParams & { id: string } {
  return {
    id: `cortesia-100-${months}m`,
    name: `Cortesia ${months} ${months === 1 ? "mês" : "meses"}`,
    percent_off: 100,
    duration: "repeating",
    duration_in_months: months,
  };
}

/** Soma meses de calendário encostando no fim do mês curto (31/01 + 1 = 28/02), como o ciclo do Stripe. */
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(dia, ultimo));
  return r;
}

export type CourtesyTarget = {
  status: Stripe.Subscription.Status;
  /** `cancel_at_period_end` ou `cancel_at`: a cliente já marcou o fim. */
  cancelScheduled: boolean;
} | null;

export type CourtesyDecision =
  | { kind: "update" }
  | { kind: "create" }
  | { kind: "refuse"; error: string };

/**
 * O que fazer com a assinatura Stripe atual do tenant.
 *
 * - `active`/`trialing`: aplica o cupom na própria assinatura.
 * - sem assinatura, ou morta (`canceled`/`incomplete_expired`): cria uma nova.
 * - cancelamento agendado: recusa. Aplicar o cupom não muda nada (ela termina
 *   do mesmo jeito) e desfazer o cancelamento voltaria a cobrar quem pediu
 *   para parar.
 * - cobrança pendente (`past_due`, `unpaid`, `incomplete`, `paused`): recusa. O
 *   cupom vale para faturas FUTURAS; a fatura em aberto continuaria em aberto e
 *   a cliente seguiria bloqueada, com o admin achando que deu cortesia.
 */
export function courtesyDecision(sub: CourtesyTarget): CourtesyDecision {
  if (!sub || sub.status === "canceled" || sub.status === "incomplete_expired") {
    return { kind: "create" };
  }
  if (sub.status === "active" || sub.status === "trialing") {
    if (sub.cancelScheduled) {
      return {
        kind: "refuse",
        error:
          "A cliente agendou o cancelamento. Dar meses grátis voltaria a cobrar quem pediu pra parar — ela precisa desfazer o cancelamento no portal antes.",
      };
    }
    return { kind: "update" };
  }
  return {
    kind: "refuse",
    error: `A assinatura tem cobrança pendente (${sub.status}). Resolva a fatura em aberto no Stripe antes de dar meses grátis.`,
  };
}

/**
 * Quando a cobrança volta: N meses depois da primeira fatura zerada.
 *
 * Em assinatura `active` o período corrente já foi pago, então a primeira
 * fatura zerada é a da próxima renovação — os N meses vêm DEPOIS do que ela já
 * pagou. Assinatura nova ou em teste fatura agora (o teste é encerrado na hora,
 * ver `courtesyUpdateParams`).
 */
export function courtesyResumesAt(i: {
  status: Stripe.Subscription.Status | null;
  /** `items.data[0].current_period_end`, em segundos. */
  currentPeriodEnd: number | null;
  now: Date;
  months: number;
}): Date {
  const primeiraZerada =
    i.status === "active" && i.currentPeriodEnd ? new Date(i.currentPeriodEnd * 1000) : i.now;
  return addMonths(primeiraZerada, i.months);
}

/**
 * Metadata da assinatura. `tenant_id`/`plan_id`/`plan_code` são o contrato com o
 * webhook (sem eles a assinatura não é gravada); `courtesy_*` é o rastro.
 * Motivo vazio vai como "" porque no Stripe é isso que apaga a chave — senão o
 * motivo de uma cortesia anterior ficaria pendurado na nova.
 */
export function courtesyMetadata(i: {
  tenantId: string;
  planId: string;
  planCode: string;
  months: number;
  resumesAt: Date;
  adminEmail: string;
  reason?: string | null;
}): Record<string, string> {
  return {
    tenant_id: i.tenantId,
    plan_id: i.planId,
    plan_code: i.planCode,
    courtesy_months: String(i.months),
    courtesy_until: i.resumesAt.toISOString(),
    courtesy_by: i.adminEmail,
    courtesy_reason: i.reason?.trim().slice(0, 300) ?? "",
  };
}

export function courtesyUpdateParams(i: {
  itemId: string;
  currentPriceId: string | null;
  priceId: string;
  couponId: string;
  trialing: boolean;
  metadata: Record<string, string>;
}): Stripe.SubscriptionUpdateParams {
  return {
    // Substitui descontos anteriores: dois cupons somados não fazem sentido em 100%.
    discounts: [{ coupon: i.couponId }],
    // Trocar de plano no meio do período não gera crédito nem cobrança extra: a
    // cortesia já cobre o período, e o preço novo vale das próximas faturas.
    proration_behavior: "none",
    metadata: i.metadata,
    ...(i.currentPriceId !== i.priceId ? { items: [{ id: i.itemId, price: i.priceId }] } : {}),
    // A cortesia substitui o resto do teste. Sem isto o e-mail "seu teste termina
    // em 3 dias" anunciaria uma cobrança que o cupom zera.
    ...(i.trialing ? { trial_end: "now" as const } : {}),
  };
}

export function courtesyCreateParams(i: {
  customerId: string;
  priceId: string;
  couponId: string;
  /** Cartão salvo do cliente; sem ele a 1ª fatura (R$ 0) passa e a cobrança do fim falha. */
  paymentMethodId: string | null;
  metadata: Record<string, string>;
}): Stripe.SubscriptionCreateParams {
  return {
    customer: i.customerId,
    items: [{ price: i.priceId }],
    discounts: [{ coupon: i.couponId }],
    metadata: i.metadata,
    ...(i.paymentMethodId ? { default_payment_method: i.paymentMethodId } : {}),
  };
}
