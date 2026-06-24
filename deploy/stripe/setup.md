# HUBFLOW Stripe - Setup Online

## Produtos

Criar no Stripe:

```txt
Essencial
Growth
Performance Max
```

Cada produto deve ter um Price recorrente mensal ou anual, conforme decisao comercial.

## Variaveis Vercel

Copiar os Price IDs para:

```txt
STRIPE_PRICE_ESSENCIAL=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_PERFORMANCE_MAX=price_...
```

Configurar tambem:

```txt
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

## Webhook

Endpoint:

```txt
https://app.seudominio.com/api/billing/webhook
```

Eventos:

```txt
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Depois de criar o webhook, copiar o signing secret:

```txt
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Validacao

1. Rodar `npm run verify:online -- -AppUrl "https://app.seudominio.com"`.
2. Entrar no app com usuario Owner/Admin.
3. Abrir Configuracoes -> Plano e assinatura.
4. Iniciar checkout de cada plano pago em modo teste.
5. Confirmar que `subscriptions` foi atualizada no Supabase.
6. Confirmar evento `stripe.subscription.synced` em Auditoria.
7. Abrir Customer Portal.
8. Testar cancelamento/downgrade no modo teste.

## Falhas Comuns

- Botao de checkout desabilitado: Price ID ausente na Vercel.
- `/api/health` degraded em `stripePrices`: algum `STRIPE_PRICE_*` ausente.
- Webhook retorna 400: `STRIPE_WEBHOOK_SECRET` incorreto ou evento sem assinatura valida.
- Assinatura nao atualiza: metadata ausente no Stripe Subscription ou webhook nao entregou.
