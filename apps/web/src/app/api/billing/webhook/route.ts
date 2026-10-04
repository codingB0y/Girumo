import type Stripe from "stripe";
import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { sendEmail } from "@/lib/email/send";
import { trialEndingEmail } from "@/lib/email/templates";
import { claimCardFingerprint, claimTrial } from "@/lib/billing/trial-claims";
import {
  handleStripeEvent,
  type DefaultCard,
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

  async function lerCartao(subscription: Stripe.Subscription): Promise<DefaultCard> {
    const pm = subscription.default_payment_method;
    if (!pm) return { fingerprint: null, last4: null };
    const metodo = typeof pm === "string" ? await getStripe().paymentMethods.retrieve(pm) : pm;
    return { fingerprint: metodo.card?.fingerprint ?? null, last4: metodo.card?.last4 ?? null };
  }

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

    // As reservas moram em trial-claims.ts, onde os filtros de tenant têm teste.
    claimTrial: (input) => claimTrial(supabase, input),

    defaultCard: lerCartao,

    claimCardFingerprint: (input) => claimCardFingerprint(supabase, input),

    async cancelTrialSubscription({ subscription, reason }) {
      try {
        const stripe = getStripe();
        // Motivo ANTES do cancelamento: o `subscription.deleted` que vem em seguida
        // carrega o metadata, e é por ele que a tela explica e o upsert decide.
        await stripe.subscriptions.update(subscription.id, {
          metadata: { ...subscription.metadata, cancel_reason: reason },
        });
        await stripe.subscriptions.cancel(subscription.id);
        return { error: null };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },

    async sendTrialEndingEmail(subscription) {
      try {
        const tenantId = subscription.metadata.tenant_id;
        if (!tenantId || !subscription.trial_end) return { error: "assinatura sem tenant ou sem trial_end" };
        // O valor é parte do aviso que as bandeiras exigem: sem ele, "R$ 0" seria um
        // aviso falso. Erro, para o Stripe reenviar e o log mostrar.
        const amountCents = subscription.items.data[0]?.price.unit_amount;
        if (amountCents == null) return { error: "assinatura sem preco unitario" };

        const customer = await getStripe().customers.retrieve(String(subscription.customer));
        const email = customer.deleted ? null : customer.email;
        if (!email) return { error: "customer sem e-mail" };

        // `plans` é catálogo global: sem filtro de tenant, de propósito (ver /api/plans).
        const { data: plano, error: planError } = await supabase
          .from("plans")
          .select("name")
          .eq("id", subscription.metadata.plan_id)
          .maybeSingle();
        if (planError) return { error: planError.message };

        const cartao = await lerCartao(subscription);
        const { subject, html } = trialEndingEmail({
          planName: (plano?.name as string | undefined) ?? "seu plano",
          amountCents,
          chargeAt: new Date(subscription.trial_end * 1000).toISOString(),
          cardLast4: cartao.last4,
          appUrl: getAppUrl(),
        });

        // A chave segura o e-mail único: o handler devolve erro na falha e o Stripe reenvia o evento.
        const ok = await sendEmail({
          to: email,
          subject,
          html,
          tenantId,
          kind: "trial_ending",
          idempotencyKey: `trial-ending/${subscription.id}`,
        });
        return { error: ok ? null : "envio falhou (ver email.failed nos logs)" };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
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
