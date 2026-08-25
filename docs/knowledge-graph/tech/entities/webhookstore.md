# WebhookStore

**Type:** concept

A store interface or service used for handling database operations, logging, upserting subscriptions, and tracking funnel events.<SEP>A TypeScript interface defining database and store methods for webhook processing, idempotency, and logging.<SEP>An interface representing the storage mechanism for idempotency markers, subscription states, logs, and funnel events.

## Neighbors
- [[upsertsubscription|UpsertSubscription]]
- [[handlecheckoutsession|HandleCheckoutSession]]
- [[storeresult|StoreResult]]
- [[handlestripeevent|HandleStripeEvent]]
- [[apps-web-src-lib-billing-stripe-webhookts|Apps/web/src/lib/billing/stripe-webhook.ts]]
- [[subscriptionrow|SubscriptionRow]]
- [[logrow|LogRow]]
- [[funnelinput|FunnelInput]]
- [[makestore|MakeStore]]

## Appears in
- `apps » web » src » lib » billing » stripe-webhook.ts`
- `apps » web » src » lib » billing » stripe-webhook.test.ts`
