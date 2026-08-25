# HandleStripeEvent

**Type:** method

A function responsible for processing Stripe webhook events with idempotency checks.<SEP>A function used to process incoming Stripe webhook events and handle database upserts or funnel event recordings.<SEP>A function responsible for handling Stripe events within the application.<SEP>A function responsible for processing incoming Stripe webhook events.

## Neighbors
- [[stripe|Stripe]]
- [[webhookstore|WebhookStore]]
- [[stripe-webhooktestts|Stripe-webhook.test.ts]]
- [[customersubscriptiondeleted|Customer.subscription.deleted]]
- [[checkoutsessioncompleted|Checkout.session.completed]]
- [[checkoutsessionasync_payment_succeeded|Checkout.session.async_payment_succeeded]]
- [[stripesubscriptionmissing_metadata|Stripe.subscription.missing_metadata]]
- [[stripecheckoutpagamento_pendente|Stripe.checkout.pagamento_pendente]]

## Appears in
- `apps » web » src » lib » billing » stripe-webhook.ts`
- `apps » web » src » lib » billing » stripe-webhook.test.ts`
