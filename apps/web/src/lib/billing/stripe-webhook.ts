import type Stripe from "stripe";
import type { FunnelEvent } from "@/lib/analytics/funnel-summary";

export const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export type StoreResult = { error: string | null };

export type SubscriptionRow = {
  tenant_id: string;
  plan_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  stripe_event_created_at: string;
  metadata: Record<string, unknown>;
};

export type LogRow = {
  tenant_id: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  metadata: Record<string, unknown>;
};

export type FunnelInput = {
  tenantId: string;
  userId: string | null;
  event: FunnelEvent;
  metadata: Record<string, unknown>;
};

/**
 * Porta do webhook. Existe para que a logica seja testavel: os modulos reais
 * (`@/lib/supabase/server`, `@/lib/billing/stripe`) importam "server-only" e
 * nao carregam sob `tsx --test`.
 */
export interface WebhookStore {
  /** true = este stripe_event_id ja foi processado com sucesso antes. */
  hasProcessedEvent(stripeEventId: string): Promise<{ found: boolean } & StoreResult>;
  /** Marcador de idempotencia. Deve ser a ULTIMA escrita do fluxo. */
  markEventProcessed(input: {
    stripeEventId: string;
    type: string;
    eventCreatedAt: string;
  }): Promise<StoreResult>;
  upsertSubscription(row: SubscriptionRow): Promise<StoreResult>;
  insertLog(row: LogRow): Promise<StoreResult>;
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
  trackFunnelEvent(input: FunnelInput): Promise<void>;
}

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * `payment_status` de sessao que significa "o dinheiro entrou".
 *
 * Boleto e Pix sao metodos ASSINCRONOS: o `checkout.session.completed` deles
 * chega assim que o cliente termina o fluxo, com `payment_status: "unpaid"` —
 * antes de qualquer pagamento. Quem confirma e o
 * `checkout.session.async_payment_succeeded`, que vem depois (boleto pode levar
 * dias). Tratar os dois como a mesma coisa registra receita que nao existe.
 *
 * `no_payment_required` entra porque e o caso legitimo de valor zero (cupom de
 * 100%, trial sem cartao): nao ha o que cobrar, e a assinatura vale.
 */
const PAGAMENTO_CONFIRMADO: ReadonlySet<Stripe.Checkout.Session.PaymentStatus> = new Set([
  "paid",
  "no_payment_required",
]);

/**
 * Traduz o status do Stripe para o enum `subscription_status` do banco.
 *
 * O enum tem exatamente seis valores (`free, trialing, active, past_due,
 * canceled, unpaid`), identicos em dev e prod, e NAO inclui `incomplete`. Por
 * isso o mapeamento e explicito em vez de repassar a string do Stripe.
 *
 * `incomplete` e `incomplete_expired` caiam no fallback `past_due` — o que era
 * errado nos dois sentidos. `past_due` significa "estava ativa e uma renovacao
 * falhou"; `incomplete` significa "nunca chegou a ser paga". Sao a mesma coisa
 * para quem le o painel de billing e coisas diferentes para o negocio.
 * `unpaid` e `canceled` sao os vizinhos honestos dentro do enum existente.
 */
export function mapStripeStatus(status: Stripe.Subscription.Status): string {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  if (status === "unpaid") return "unpaid";
  if (status === "canceled") return "canceled";
  // Primeira cobranca pendente ou recusada: a assinatura nunca valeu.
  if (status === "incomplete") return "unpaid";
  // Passou da janela do Stripe sem pagar a primeira cobranca: morreu.
  if (status === "incomplete_expired") return "canceled";
  // Status novo do Stripe (ex.: `paused`): `past_due` e o conservador — nao
  // libera nada, e o log de sincronizacao guarda o valor cru em `stripe_status`.
  return "past_due";
}

async function upsertSubscription(
  subscription: Stripe.Subscription,
  eventCreatedAt: string,
  store: WebhookStore,
): Promise<StoreResult> {
  const tenantId = subscription.metadata.tenant_id;
  const planId = subscription.metadata.plan_id;
  const item = subscription.items.data[0];

  if (!tenantId || !planId) {
    await store.insertLog({
      tenant_id: SYSTEM_TENANT_ID,
      level: "warn",
      event: "stripe.subscription.missing_metadata",
      message: "Assinatura Stripe sem tenant_id ou plan_id.",
      metadata: { stripe_subscription_id: subscription.id },
    });
    // Sem metadata nao ha o que gravar, e reenviar nao conserta: 2xx de proposito.
    return { error: null };
  }

  const upserted = await store.upsertSubscription({
    tenant_id: tenantId,
    plan_id: planId,
    stripe_customer_id: String(subscription.customer),
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price.id ?? null,
    status: mapStripeStatus(subscription.status),
    current_period_start: item?.current_period_start
      ? new Date(item.current_period_start * 1000).toISOString()
      : null,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    stripe_event_created_at: eventCreatedAt,
    metadata: {
      stripe_status: subscription.status,
      plan_code: subscription.metadata.plan_code ?? null,
    },
  });

  // Este erro era descartado. Era ele que transformava "cliente pagou e a
  // assinatura nao foi gravada" num 200 alegre para o Stripe.
  if (upserted.error) return upserted;

  await store.insertLog({
    tenant_id: tenantId,
    level: "info",
    event: "stripe.subscription.synced",
    message: "Assinatura Stripe sincronizada.",
    metadata: { stripe_subscription_id: subscription.id, status: subscription.status },
  });

  return { error: null };
}

/**
 * Sessao de checkout: sincroniza a assinatura e decide se houve PAGAMENTO.
 *
 * As duas coisas sao separadas de proposito. A assinatura e gravada sempre —
 * saber que existe uma tentativa em aberto tem valor, e o status real dela vem
 * do proprio Stripe. Ja o evento de funil `payment_completed` significa receita
 * reconhecida, e so pode sair quando `payment_status` confirma que o dinheiro
 * entrou.
 *
 * Antes disto, qualquer `checkout.session.completed` disparava
 * `payment_completed`. Como boleto e Pix emitem esse evento ANTES do pagamento,
 * gerar um boleto e nunca paga-lo contava como venda no funil.
 */
async function handleCheckoutSession(
  session: Stripe.Checkout.Session,
  eventCreatedAt: string,
  store: WebhookStore,
  options: { pagamentoFalhou?: boolean } = {},
): Promise<StoreResult> {
  if (!session.subscription) return { error: null };

  const subscription = await store.retrieveSubscription(String(session.subscription));
  const processed = await upsertSubscription(subscription, eventCreatedAt, store);
  if (processed.error) return processed;

  const tenantId = subscription.metadata.tenant_id;
  // Sem tenant nao ha a quem atribuir; `upsertSubscription` ja registrou o aviso.
  if (!tenantId) return { error: null };

  const metadataComum = {
    stripe_subscription_id: subscription.id,
    stripe_session_id: session.id,
    payment_status: session.payment_status,
    plan_code: subscription.metadata.plan_code ?? null,
  };

  if (options.pagamentoFalhou) {
    await store.insertLog({
      tenant_id: tenantId,
      level: "warn",
      event: "stripe.checkout.pagamento_falhou",
      message: "Pagamento assincrono (boleto/Pix) nao foi concluido.",
      metadata: metadataComum,
    });
    return { error: null };
  }

  if (!PAGAMENTO_CONFIRMADO.has(session.payment_status)) {
    // Nao e erro: e o estado normal de boleto/Pix recem-emitido. Vira log para
    // que a espera seja visivel, em vez de a tentativa sumir ate o desfecho.
    await store.insertLog({
      tenant_id: tenantId,
      level: "info",
      event: "stripe.checkout.pagamento_pendente",
      message: `Checkout concluido, aguardando pagamento (${session.payment_status}).`,
      metadata: metadataComum,
    });
    return { error: null };
  }

  await store.trackFunnelEvent({
    tenantId,
    userId: subscription.metadata.user_id ?? null,
    event: "payment_completed",
    metadata: {
      plan_code: subscription.metadata.plan_code,
      stripe_subscription_id: subscription.id,
    },
  });

  return { error: null };
}

export async function handleStripeEvent(
  event: Stripe.Event,
  store: WebhookStore,
): Promise<WebhookResult> {
  const eventCreatedAt = new Date(event.created * 1000).toISOString();

  const existing = await store.hasProcessedEvent(event.id);

  // Sem conseguir consultar o marcador nao da para afirmar que e duplicata.
  // Processar as cegas arrisca efeito duplo; 5xx faz o Stripe tentar de novo.
  if (existing.error) {
    return {
      status: 503,
      body: { error: "Nao foi possivel verificar idempotencia.", retry: true },
    };
  }

  if (existing.found) return { status: 200, body: { received: true, duplicate: true } };

  // ORDEM CRITICA: processa PRIMEIRO, marca por ULTIMO.
  // O inverso (marcar antes) fazia com que uma falha no processamento virasse
  // um evento "ja recebido": o reenvio do Stripe batia no branch de duplicata
  // e era descartado, sem nenhum caminho de recuperacao automatico.
  let processed: StoreResult = { error: null };

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    processed = await upsertSubscription(
      event.data.object as Stripe.Subscription,
      eventCreatedAt,
      store,
    );
  }

  // `async_payment_succeeded` e a confirmacao tardia de boleto/Pix e chega com
  // `payment_status: "paid"`, entao passa pelo mesmo caminho: o gate la dentro
  // decide se houve pagamento, e nao o tipo do evento.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    processed = await handleCheckoutSession(
      event.data.object as Stripe.Checkout.Session,
      eventCreatedAt,
      store,
    );
  }

  // Boleto vencido ou Pix nao pago. Sem isto, a tentativa morria em silencio e
  // a assinatura ficava parada no ultimo status conhecido.
  if (event.type === "checkout.session.async_payment_failed") {
    processed = await handleCheckoutSession(
      event.data.object as Stripe.Checkout.Session,
      eventCreatedAt,
      store,
      { pagamentoFalhou: true },
    );
  }

  if (processed.error) {
    await store.insertLog({
      tenant_id: SYSTEM_TENANT_ID,
      level: "error",
      event: "stripe.webhook.failed",
      message: `Falha ao processar webhook Stripe: ${event.type}.`,
      metadata: { stripe_event_id: event.id, type: event.type, error: processed.error },
    });

    // 5xx sem marcador gravado: o Stripe reenvia e o reenvio VAI processar.
    return { status: 500, body: { error: processed.error, retry: true } };
  }

  const marked = await store.markEventProcessed({
    stripeEventId: event.id,
    type: event.type,
    eventCreatedAt,
  });

  // O trabalho critico ja esta commitado. Pedir reenvio aqui nao recupera nada
  // e ainda duplicaria o evento de funil, entao devolve 2xx e registra alto.
  if (marked.error) {
    await store.insertLog({
      tenant_id: SYSTEM_TENANT_ID,
      level: "error",
      event: "stripe.webhook.marker_failed",
      message: "Evento processado, mas o marcador de idempotencia nao foi gravado.",
      metadata: { stripe_event_id: event.id, type: event.type, error: marked.error },
    });
  }

  return { status: 200, body: { received: true } };
}
