import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import {
  handleStripeEvent,
  type WebhookStore,
} from "@/lib/billing/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKER_EVENT = "stripe.webhook.received";
const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/** 23505 = unique_violation: outra entrega concorrente ganhou a corrida. */
const UNIQUE_VIOLATION = "23505";

function createStore(): WebhookStore {
  const supabase = getSupabaseAdmin();

  return {
    async hasProcessedEvent(stripeEventId) {
      const { data, error } = await supabase
        .from("logs")
        .select("id")
        .eq("event", MARKER_EVENT)
        .contains("metadata", { stripe_event_id: stripeEventId })
        .maybeSingle();

      if (error) return { found: false, error: error.message };
      return { found: Boolean(data), error: null };
    },

    async markEventProcessed({ stripeEventId, type, eventCreatedAt }) {
      const { error } = await supabase.from("logs").insert({
        tenant_id: SYSTEM_TENANT_ID,
        level: "info",
        event: MARKER_EVENT,
        message: `Webhook Stripe recebido: ${type}.`,
        metadata: {
          stripe_event_id: stripeEventId,
          type,
          event_created_at: eventCreatedAt,
        },
      });

      // Corrida perdida para outra entrega do MESMO evento: ela ja gravou o
      // marcador, entao o efeito desejado esta garantido. Nao e falha.
      if (error && error.code === UNIQUE_VIOLATION) return { error: null };
      return { error: error?.message ?? null };
    },

    async upsertSubscription(row) {
      const { error } = await supabase
        .from("subscriptions")
        .upsert(row, { onConflict: "tenant_id" });
      return { error: error?.message ?? null };
    },

    async insertLog(row) {
      const { error } = await supabase.from("logs").insert(row);
      return { error: error?.message ?? null };
    },

    async retrieveSubscription(id) {
      return getStripe().subscriptions.retrieve(id);
    },

    async trackFunnelEvent(input) {
      await trackFunnelEvent(input);
    },
  };
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return Response.json({ error: "Webhook Stripe mal configurado." }, { status: 400 });
  }

  let event: Stripe.Event;
  const rawBody = await req.text();

  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Assinatura Stripe invalida." }, { status: 400 });
  }

  try {
    const { status, body } = await handleStripeEvent(event, createStore());
    return Response.json(body, { status });
  } catch (err) {
    // Excecao inesperada tambem precisa virar 5xx: um 200 aqui faria o Stripe
    // considerar entregue um evento que nao foi processado.
    console.error("[billing/webhook] excecao ao processar evento:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Erro inesperado.", retry: true },
      { status: 500 },
    );
  }
}
