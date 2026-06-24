# Fase 5 - Stripe

## Objetivo Da Fase

Adicionar a fundacao de billing com Stripe sem usar Prisma, mantendo Supabase como fonte local de entitlements, planos e assinatura ativa do tenant.

## Arquivos Criados

```txt
apps/web/src/lib/billing/stripe.ts
apps/web/src/lib/billing/plans.ts
apps/web/src/lib/billing/entitlements.ts
apps/web/src/lib/supabase/server.ts
apps/web/src/lib/supabase/tenant-context.ts
apps/web/src/app/api/billing/checkout/route.ts
apps/web/src/app/api/billing/portal/route.ts
apps/web/src/app/api/billing/webhook/route.ts
```

## Rotas

### `POST /api/billing/checkout`

Cria uma Stripe Checkout Session para planos pagos.

Contrato:

```txt
Authorization: Bearer <supabase_access_token>
x-tenant-id: <tenant_id>
body: { "planCode": "ESSENCIAL" | "GROWTH" | "PERFORMANCE_MAX" }
```

Resposta:

```json
{ "url": "https://checkout.stripe.com/..." }
```

### `POST /api/billing/portal`

Cria uma sessao do Stripe Customer Portal para o tenant.

Contrato:

```txt
Authorization: Bearer <supabase_access_token>
x-tenant-id: <tenant_id>
```

Resposta:

```json
{ "url": "https://billing.stripe.com/..." }
```

### `POST /api/billing/webhook`

Recebe eventos Stripe, valida assinatura e atualiza Supabase.

Eventos tratados:

```txt
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

## Entitlements

Fonte local:

```txt
plans.limits
subscriptions.status
subscriptions.current_period_end
subscriptions.stripe_price_id
```

O app deve consultar `subscriptions` + `plans` para bloquear:

```txt
instances:create
contacts:create
campaigns:create
campaigns:send
funnels:create
uploads:create
team_members:invite
```

Helper criado:

```txt
assertPlanLimit(tenantId, capability)
assertUploadLimit(tenantId, nextBytes)
```

## Seguranca

- Checkout e portal exigem Supabase Auth.
- Checkout e portal exigem membership aceita no tenant.
- Apenas Owner/Admin acessam billing.
- Service role fica restrita a rotas server-side.
- Webhook Stripe valida `stripe-signature`.
- Eventos Stripe sao registrados em `logs`.

## Variaveis

```txt
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_ESSENCIAL
STRIPE_PRICE_GROWTH
STRIPE_PRICE_PERFORMANCE_MAX
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Pendencias

## Status Atual Pos-Fase 8

- UI de planos ja esta conectada em `apps/web/src/components/billing-panel.tsx`.
- `/api/plans` e `/api/subscription` ja usam Supabase, sem Prisma.
- Price IDs podem vir do banco ou das envs `STRIPE_PRICE_*`.
- Ainda falta configurar produtos/precos reais no Stripe e testar webhook online.

## Setup Online

Checklist detalhado:

```txt
deploy/stripe/setup.md
```

- Conectar UI de planos aos novos endpoints.
- Aplicar `assertPlanLimit()` nas rotas de criacao/envio conforme cada dominio for migrado para Supabase.
- Criar produtos/precos reais no Stripe e preencher envs.
- Testar webhook com Stripe CLI ou dashboard.
- Desativar as rotas legadas Prisma de `/api/plans` e `/api/subscription` depois da migração de UI.
