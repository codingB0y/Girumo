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

Eventos (os 8 que `handleStripeEvent` trata; evento nao marcado aqui nunca chega ao
app, e nada avisa):

```txt
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.trial_will_end
invoice.paid
```

Depois de criar o webhook, copiar o signing secret:

```txt
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Customer Portal (obrigatorio)

O app nao configura o portal por codigo: `/api/billing/portal` cria a sessao com a
configuracao PADRAO da conta (sem `configuration` nem `flow_data`). "Cancelar
assinatura" no painel (`/painel/configuracoes/cancelar`) grava o motivo e abre esse
portal; sem cancelamento ligado nele, o cliente chega numa tela sem como cancelar.

Em Settings -> Billing -> Customer portal, nos modos teste E live (sao configuracoes
separadas):

- Cancelar assinaturas: LIGADO, modo "No fim do periodo de cobranca". O Stripe
  mantem a assinatura `active`/`trialing` com `cancel_at_period_end` ate o fim, e o
  painel le isso: "Assinatura cancelada — acesso ate DD/MM, sem nova cobranca"
  (estado `canceling`) ou "Teste cancelado — termina em DD/MM sem cobranca". Nao
  usar "Imediatamente": corta na hora o acesso que o cliente ja pagou.
- Motivo do cancelamento: opcional, o app ja pergunta antes de abrir o portal
  (log `billing.churn.reason`).
- Atualizar forma de pagamento e historico de faturas: LIGADOS ("Gerenciar cobranca").
- Return URL: o app manda (`/painel/configuracoes?billing=portal`), nao configurar.

Conferido em prod em 05/10/2026: cancelamento pelo portal no fim do periodo, de
ponta a ponta.

Limites conhecidos:

- Trocar de plano pelo portal: o webhook grava `plan_id` a partir do metadata da
  assinatura, que o portal nao altera — o painel continuaria no plano antigo. Troca
  de plano vai pelo checkout do app.
- Cancelar o plano cancela o add-on Instagram no Stripe, e o Instagram desliga
  quando o add-on cai. Instagram ligado a mao (sem add-on) NAO desliga com o
  plano: desligar a mao.

## Validacao

1. Rodar `npm run verify:online -- -AppUrl "https://app.seudominio.com"`.
2. Entrar no app com usuario Owner/Admin.
3. Abrir Configuracoes -> Plano e assinatura.
4. Iniciar checkout de cada plano pago em modo teste.
5. Confirmar que `subscriptions` foi atualizada no Supabase.
6. Confirmar evento `stripe.subscription.synced` em Auditoria.
7. Abrir Customer Portal.
8. Testar cancelamento no modo teste: Configuracoes -> Plano passa a mostrar
   "Assinatura cancelada — acesso ate DD/MM, sem nova cobranca" e some o link
   "Cancelar assinatura".

## Falhas Comuns

- Botao de checkout desabilitado: Price ID ausente na Vercel.
- `/api/health` degraded em `stripePrices`: algum `STRIPE_PRICE_*` ausente.
- Webhook retorna 400: `STRIPE_WEBHOOK_SECRET` incorreto ou evento sem assinatura valida.
- Assinatura nao atualiza: metadata ausente no Stripe Subscription ou webhook nao entregou.
