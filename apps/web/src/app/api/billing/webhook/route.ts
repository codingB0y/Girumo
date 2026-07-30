import Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  if (status === "unpaid") return "unpaid";
  if (status === "canceled") return "canceled";
  return "past_due";
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const supabase = getSupabaseAdmin();
  const tenantId = subscription.metadata.tenant_id;
  const planId = subscription.metadata.plan_id;
  const subscriptionItem = subscription.items.data[0];
  const priceId = subscriptionItem?.price.id ?? null;

  if (!tenantId || !planId) {
    await supabase.from("logs").insert({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      level: "warn",
      event: "stripe.subscription.missing_metadata",
      message: "Assinatura Stripe sem tenant_id ou plan_id.",
      metadata: { stripe_subscription_id: subscription.id },
    });
    return;
  }

  await supabase.from("subscriptions").upsert(
    {
      tenant_id: tenantId,
      plan_id: planId,
      stripe_customer_id: String(subscription.customer),
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      status: mapStripeStatus(subscription.status),
      current_period_start: subscriptionItem?.current_period_start
        ? new Date(subscriptionItem.current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscriptionItem?.current_period_end
        ? new Date(subscriptionItem.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      metadata: {
        stripe_status: subscription.status,
        plan_code: subscription.metadata.plan_code ?? null,
      },
    },
    { onConflict: "tenant_id" },
  );

  await supabase.from("logs").insert({
    tenant_id: tenantId,
    level: "info",
    event: "stripe.subscription.synced",
    message: "Assinatura Stripe sincronizada.",
    metadata: { stripe_subscription_id: subscription.id, status: subscription.status },
  });
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

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("logs")
    .select("id")
    .eq("event", "stripe.webhook.received")
    .contains("metadata", { stripe_event_id: event.id })
    .maybeSingle();

  if (existing) return Response.json({ received: true, duplicate: true });

  await supabase.from("logs").insert({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    level: "info",
    event: "stripe.webhook.received",
    message: `Webhook Stripe recebido: ${event.type}.`,
    metadata: { stripe_event_id: event.id, type: event.type },
  });

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await upsertSubscription(event.data.object as Stripe.Subscription);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.subscription) {
      const subscription = await getStripe().subscriptions.retrieve(String(session.subscription));
      await upsertSubscription(subscription);

      // Track payment funnel event
      const tenantId = subscription.metadata.tenant_id;
      const userId = subscription.metadata.user_id;
      if (tenantId) {
        trackFunnelEvent({
          tenantId,
          userId: userId ?? null,
          event: "payment_completed",
          metadata: { plan_code: subscription.metadata.plan_code, stripe_subscription_id: subscription.id },
        });
      }
    }
  }

  return Response.json({ received: true });
}
