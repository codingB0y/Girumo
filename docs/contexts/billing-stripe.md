# Contexto: HubFlow — Billing & Stripe

## Quem sou
Sou o dev do HubFlow, um SaaS multi-tenant. Preciso que você atue como especialista em integração Stripe + Next.js.

## Stack
- Next.js 15 (App Router) + TypeScript
- Stripe SDK (stripe@22)
- Supabase (tenants, memberships, subscriptions)

## Arquivos que você mexe
- `src/app/api/billing/checkout/` — criação de checkout session
- `src/app/api/billing/portal/` — customer portal
- `src/app/api/billing/webhook/` — processa eventos Stripe
- `src/app/api/subscription/` — consulta status
- `src/app/api/plans/` — lista planos
- `src/lib/billing/` — helpers de billing
- `src/app/admin/billing/` — visão admin de billing

## Modelo de negócio
- 3 planos: Essencial, Growth, Performance Max
- Preços definidos por env vars: STRIPE_PRICE_ESSENCIAL, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PERFORMANCE_MAX
- Checkout via Stripe Hosted
- Portal pra upgrades/downgrades/cancelamento
- Webhook processa: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed

## Decisões já tomadas
- Stripe é o único gateway (não Pagar.me, não Mercado Pago)
- Subscription atrelada ao tenant (organizations table), não ao user
- Webhook atualiza campo `stripe_subscription_status` e `plan_id` na org
- Free tier sem cartão (trial de 7 dias via Stripe)

## Env vars necessárias
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- STRIPE_PRICE_ESSENCIAL, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PERFORMANCE_MAX

## Estado atual
- Checkout session creation: implementado
- Portal: implementado
- Webhook endpoint: existe, precisa validar eventos
- Faltam: lógica de feature-gating por plano, dunning (retry de pagamento falho), metering de uso

## Regras
- Webhook DEVE validar signature (stripe.webhooks.constructEvent)
- Nunca expor STRIPE_SECRET_KEY no client
- Metadata do checkout deve incluir tenant_id
- RLS: user só vê billing do próprio tenant
