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

export function mapStripeStatus(status: Stripe.Subscription.Status): string {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  if (status === "unpaid") return "unpaid";
  if (status === "canceled") return "canceled";
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.subscription) {
      const subscription = await store.retrieveSubscription(String(session.subscription));
      processed = await upsertSubscription(subscription, eventCreatedAt, store);

      const tenantId = subscription.metadata.tenant_id;
      if (!processed.error && tenantId) {
        await store.trackFunnelEvent({
          tenantId,
          userId: subscription.metadata.user_id ?? null,
          event: "payment_completed",
          metadata: {
            plan_code: subscription.metadata.plan_code,
            stripe_subscription_id: subscription.id,
          },
        });
      }
    }
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
