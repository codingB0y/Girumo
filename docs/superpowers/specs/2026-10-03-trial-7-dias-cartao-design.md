# Teste grátis de 7 dias com cartão — design

**Data:** 03/10/2026 · **Decisão:** Igor · **Mockup aprovado:** https://claude.ai/artifact/6tkmnLBdunQWcqqfooStWg (v4)

## 1. Contexto

Em 27/08/2026 a decisão paid-first tirou o FREE e **descartou trial**
(`docs/strategy/2026-08-27-pricing-paid-first.md`). Desde então a conta nasce sem assinatura e
todo recurso responde 402 até o cliente pagar. O paywall é o único momento de conversão.

Esta decisão **reverte o "sem trial"**: a categoria (DevZapp) converte com teste de 7 dias que
exige cartão e cobra sozinho no 8º dia. O resto do paid-first continua (sem plano gratuito, sem
garantia voluntária de reembolso).

O que já existe e é reaproveitado:

- `subscriptionAccess` concede acesso a `trialing` (`lib/billing/subscription-access.ts`).
- `mapStripeStatus` mapeia `trialing`; o webhook já sincroniza assinatura de teste.
- `romaneioDoPlano` já escreve "GROWTH · teste até 10/10" no rodapé do menu.
- `PlanPaywall` já abre em todo 402 e leva direto ao Checkout do Stripe.
- `trialEndingEmail` existe em `lib/email/templates.ts`, aposentado.
- Funil idempotente por `tenant_id + event_name`, com `onlyFirst`.

## 2. Regras de negócio

| Regra | Decisão |
|---|---|
| Duração | 7 dias corridos (`trial_period_days: 7`) |
| Planos | Os 3: Essencial, Growth e Operação |
| Meio de pagamento do teste | **Só cartão** — boleto não renova sozinho |
| Sem cartão | Link "Prefere boleto? Assine sem teste grátis" → checkout atual, sem teste |
| Elegibilidade | Conta que **nunca teve teste** e **nunca teve assinatura no Stripe** |
| Anti-abuso | 1 teste por conta **e** por cartão (fingerprint do Stripe) |
| Cartão repetido | Assinatura de teste **cancelada sem cobrar**; tela oferece assinar direto |
| Fim do teste | Stripe cobra o plano no 8º dia; cartão recusado → `past_due` → acesso cai |
| Cancelar no teste | Pelo portal do Stripe (fluxo atual); cancela no fim do teste, sem fatura |
| Reembolso | **Só nos Termos.** Não aparece em tela, e-mail nem LP. CDC art. 49 conta da 1ª cobrança |

**Por que cancelar e não cobrar o cartão repetido:** o Checkout do Stripe mostra "7 dias grátis"
antes de saber qual cartão vai ser usado. Cobrar na hora contrariaria a oferta exibida
(CDC art. 30 e 35). Cancelar sem cobrar bloqueia o abuso do mesmo jeito.

**Por que o reembolso sai da tela:** cada reembolso perde a taxa do Stripe, e anunciar estimula
o pedido. O direito existe por lei de qualquer forma e fica escrito nos Termos. O que **continua
visível** é data e valor da 1ª cobrança e "cancele antes e não paga nada": isso é aviso exigido
pelas bandeiras para teste com cartão, e é o que evita chargeback (mais caro que reembolso).

## 3. Fluxo (exemplo: hoje = 03/10)

1. Cliente cria a conta normalmente (cadastro e Google não mudam).
2. Ao entrar no painel sem plano: **modal "Ganhe 7 dias grátis"** (fechável; volta na próxima
   sessão) e **faixa fixa** no topo com "Ativar 7 dias grátis".
3. Ao tentar qualquer recurso bloqueado (402): o `PlanPaywall` abre **em modo teste**.
4. Escolhe o plano → Checkout hospedado do Stripe ("7 dias grátis, depois R$ 297/mês a partir de
   10/10", só cartão) → volta para `/painel?billing=trial_started`.
5. Webhook grava a assinatura `trialing` → acesso liberado na hora.
6. **07/10:** Stripe emite `customer.subscription.trial_will_end` → nosso e-mail com valor, data,
   final do cartão e link de cancelamento.
7. **10/10:** Stripe cobra. Pago → `active` + `payment_completed` no funil. Recusado → `past_due`,
   acesso cai, e a faixa pede regularização (texto que já existe em `subscriptionNotice`).

## 4. Arquitetura

### 4.1 Banco — uma migração, sem tabela nova

```sql
alter table public.organizations
  add column if not exists trial_subscription_id text,
  add column if not exists trial_card_fingerprint text;

create unique index if not exists organizations_trial_card_fingerprint_key
  on public.organizations (trial_card_fingerprint)
  where trial_card_fingerprint is not null;
```

- `trial_subscription_id`: qual assinatura do Stripe consumiu o teste desta conta. Nulo =
  nunca testou. Guardar o **id** (e não só um booleano) resolve o caso de duas abas concluírem
  dois checkouts de teste: a segunda perde a reserva e é cancelada (4.4).
- `trial_card_fingerprint`: o cartão que fez o teste. O índice único é a trava entre contas.
- Mora em `organizations` pelo mesmo motivo do `stripe_customer_id`
  (`billing-customer-mora-em-organizations`): `subscriptions` tem `unique(tenant_id)` e é
  sobrescrita por todo evento do webhook.
- Aplicar nos **dois bancos**, entrar em `deploy/supabase/apply-order.txt` e atualizar o
  baseline do gate de drift. DDL é aplicada pelo Igor (`npx supabase db query --linked`).

### 4.2 Elegibilidade — servidor decide

`lib/billing/trial.ts` (puro, testável sob `tsx --test`):

```ts
export const TRIAL_DAYS = 7;
export function trialEligible(input: {
  trialSubscriptionId: string | null;
  stripeSubscriptionId: string | null; // da linha de subscriptions, se houver
}): boolean
```

Elegível ⇔ `trialSubscriptionId` nulo **e** `stripeSubscriptionId` nulo. Isso inclui as contas
paradas no FREE antigo e as de concessão manual sem Stripe — de propósito: são o melhor público
para o teste.

`GET /api/billing/trial` (tenant do cookie) devolve o que as telas precisam:

```ts
{
  elegivel: boolean;
  emTeste: { fim: string; plano: string; precoCents: number } | null; // status trialing
  cartaoRepetido: boolean; // canceled com metadata.cancel_reason = "trial_card_reused"
}
```

### 4.3 Checkout

`POST /api/billing/checkout` aceita `{ planCode, semTeste?: boolean }`. O cliente **não** pede
teste: o servidor aplica quando `trialEligible` e `semTeste` não vier `true`.

A montagem da sessão sai da rota para uma função pura (`lib/billing/checkout-session.ts`) para
ser testada. Com teste, a sessão ganha:

```ts
payment_method_types: ["card"],
payment_method_collection: "always",
subscription_data: {
  trial_period_days: TRIAL_DAYS,
  trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
  metadata: { ...atual, trial: "1" },
},
success_url: `${appUrl}/painel?billing=trial_started`,
```

Sem teste, a sessão fica **idêntica à de hoje** (herda os métodos do Dashboard, inclusive boleto).

### 4.4 Webhook

Eventos novos a habilitar no endpoint do Stripe (Dashboard): `customer.subscription.trial_will_end`
e `invoice.paid`.

**`checkout.session.completed` com assinatura em `trialing`** (caminho novo, dentro de
`handleCheckoutSession`, depois do `upsertSubscription` que já existe):

1. **Reservar o teste:** `update organizations set trial_subscription_id = $sub
   where id = $tenant and tenant_id = $tenant and trial_subscription_id is null`.
   Desfechos: `ganhou` · `mesma` (retry do mesmo evento) · `perdeu` (outra assinatura já
   reservou). `perdeu` → cancela esta assinatura no Stripe com `cancel_reason: "trial_duplicate"`,
   re-sincroniza a vencedora (a linha de `subscriptions` foi sobrescrita pela perdedora) e para.
2. **Cartão:** lê o fingerprint do `default_payment_method` da assinatura. Sem fingerprint
   (não deveria acontecer, o teste é só cartão) → log `warn` e segue sem a trava de cartão.
3. **Reservar o cartão:** `update organizations set trial_card_fingerprint = $fp where ... and
   trial_card_fingerprint is null`. `23505` = outro tenant já usou esse cartão →
   `subscriptions.update(sub, { metadata: { ...meta, cancel_reason: "trial_card_reused" } })` e
   `subscriptions.cancel(sub)`. Log `stripe.trial.cartao_repetido`. Para.
4. Funil: `trial_started`. **Não** emite `payment_completed` — hoje o checkout de teste volta
   `payment_status: no_payment_required`, que o código atual conta como pagamento.

Idempotência: o passo 1 tolera retry (`mesma`), o 3 também (fingerprint já é do próprio tenant).
Retry depois do cancelamento lê a assinatura fresca, vê `canceled` e não entra no caminho de teste.

**`upsertSubscription`** passa a copiar `metadata.cancel_reason` da assinatura para a linha
(junto do `stripe_status` e `plan_code` que já copia), para a tela saber explicar o cancelamento.

**`invoice.paid` com `amount_paid > 0`** → `payment_completed` com `onlyFirst: true`. Vale para a
conversão do teste e para qualquer primeira cobrança real; renovações não reescrevem o marco.

**`customer.subscription.trial_will_end`** → e-mail de aviso (4.6). Falha no envio vira log
`warn` e **2xx**: reenviar o evento duplicaria o e-mail para quem recebeu.

### 4.5 Estado e textos

- `SubscriptionState` ganha `"trial"`: `trialing` concede o plano e passa a ter frase própria em
  `subscriptionNotice` ("Teste grátis até DD/MM"). `free` e `active` continuam `"active"`.
- `canceled` com `cancel_reason = "trial_card_reused"` → frase "Esse cartão já foi usado num
  teste grátis. Assine direto pra continuar."

### 4.6 E-mail de aviso

`trialEndingEmail` é reescrito (o atual fala em "dados guardados 30 dias", que não vale mais):
assunto "Seu teste grátis termina em 3 dias", plano, valor, data da cobrança, final do cartão
(lido do payment method no próprio handler; ausente → frase sem o final), botão "Continuar no
plano" e link "Cancele o teste até DD/MM" (portal). Rodapé: "Cancelamento sem multa a qualquer
momento · Termos de uso". **Sem menção a reembolso.** Destinatário: e-mail do Customer do Stripe.

### 4.7 Telas (mockup v4)

- **`TrialOffer`** (modal): 3 planos como radio, linha do tempo Hoje R$ 0 → aviso → 1ª cobrança,
  "Agora não", "Prefere boleto? Assine sem teste grátis" e o botão "Começar 7 dias grátis no
  <plano>". Abre ao entrar no painel quando `elegivel`; fechar grava em `sessionStorage`
  (try/catch) e volta na próxima sessão.
- **`TrialBanner`** (faixa no topo do conteúdo do painel):
  - elegível → "Teste o Girumo completo por 7 dias. Hoje você não paga nada." + "Ativar 7 dias grátis";
  - em teste → "Teste grátis do <plano>: faltam N dias. Em DD/MM começa a cobrança de R$ X/mês" + "Ver plano";
  - fora disso → não renderiza.
- **`PlanPaywall`** ganha modo teste quando `elegivel`: título "Teste 7 dias grátis pra continuar",
  "R$ 0 hoje · depois R$ X/mês" por plano, botão "Testar grátis", rodapé "A cobrança começa no
  8º dia… Cancele antes e não paga nada" e o link do boleto. **Remove** o rodapé atual "7 dias
  pra desistir e receber tudo de volta".
- **Cartão repetido:** quando `cartaoRepetido`, o Início mostra o aviso com os planos para
  assinar direto (checkout com `semTeste: true`).
- **Configurações › Plano:** mostra teste, data e valor da 1ª cobrança, "Trocar cartão" /
  "Trocar plano" / "Cancelar teste (sem cobrança)" — todos pelo portal que já existe.

### 4.8 Termos

Seção 7 dos Termos (`app/termos/page.tsx`):

- parágrafo novo sobre o **teste grátis**: 7 dias, cartão obrigatório, cobrança automática no 8º
  dia, aviso por e-mail antes, cancelamento até o fim do teste sem cobrança, 1 teste por pessoa e
  por cartão;
- **arrependimento**: os 7 dias do art. 49 passam a contar **da primeira cobrança** quando a
  contratação começa por teste grátis.

Sobe `LEGAL_VERSION` e `LEGAL_EFFECTIVE_DATE` em `lib/legal.ts` no mesmo commit.

### 4.9 Copy fora do painel

"7 dias pra desistir / devolvemos tudo" sai de **10 lugares** e vira "7 dias grátis":
`app/signup/page.tsx`, `lp-cartaz/{hero,plans,cartaz-landing}.tsx`, `lp3/{landing,landing-data,
landing-desktop,landing-mobile}.tsx`, `lp-atacado/atacado-closing.tsx`, `lp-piloto/{proof-plans,closing}.tsx`.
A devolução proporcional do **anual** também sai do FAQ das LPs (`lp-shared/lp-data.ts` e
`lp3/landing-data.ts`) — continua escrita só nos Termos.

## 5. Divisão em PRs

| PR | Conteúdo | Visível para o cliente? |
|---|---|---|
| 1 — servidor + Termos | migração, `trial.ts`, checkout, webhook, `GET /api/billing/trial`, e-mail, Termos | Sim: quem clicar em "Assinar" já vê o teste no Checkout do Stripe |
| 2 — painel | `TrialOffer`, `TrialBanner`, `PlanPaywall` em modo teste, aviso de cartão repetido, Configurações › Plano | Sim |
| 3 — copy das LPs + cadastro | 4.9 | Sim |

PR 1 e PR 2 mergeiam na mesma sessão. Pré-requisitos de PR 1 no ar (mão do Igor):

- migração nos dois bancos;
- `customer.subscription.trial_will_end` e `invoice.paid` habilitados no endpoint do webhook;
- portal do cliente do Stripe com cancelamento **no fim do período** (não imediato) — é isso
  que faz "cancelar no teste" não gerar fatura.

## 6. Bordas e falhas

| Situação | Comportamento |
|---|---|
| Duas abas concluem dois checkouts de teste | A segunda perde a reserva → cancelada sem cobrança, vencedora re-sincronizada |
| Mesmo cartão em duas contas ao mesmo tempo | Índice único decide; a perdedora é cancelada |
| Cartão recusado no 8º dia | `past_due` → `subscriptionAccess` nega → faixa "Pagamento pendente" que já existe |
| Cliente cancela no portal durante o teste | `cancel_at_period_end` → fim do teste sem fatura → `canceled` |
| Webhook do `trial_will_end` perdido | Cliente não recebe o aviso; o Stripe ainda cobra. Mitigação: log `stripe.trial.aviso_falhou` visível no admin |
| Conta com concessão manual (`active` sem Stripe) | Não vê oferta (não toma 402); continua elegível se um dia perder a concessão |
| Checkout sem teste (boleto) | Fluxo atual, intocado |

## 7. Testes

Unitários (`tsx --test`), sem credencial:

- `trialEligible`: as 4 combinações.
- `checkoutSessionParams`: com teste (cartão, 7 dias, `trial: "1"`, success_url de teste) e sem
  teste (idêntico ao de hoje).
- `handleStripeEvent` com store falso: teste novo (reserva + `trial_started`, sem
  `payment_completed`); retry do mesmo evento; teste duplicado (cancela perdedora, re-sincroniza);
  cartão repetido (metadata + cancel); `invoice.paid` com e sem valor; `trial_will_end` com envio
  falhando (2xx + log).
- `subscriptionAccess`/`subscriptionNotice`: estado `trial` e cartão repetido.

Manual em modo teste do Stripe (antes do merge do PR 2): cartão `4242` → teste ativo; **Test Clock**
avançado 4 dias (e-mail chega) e 7 dias (cobrança, `payment_completed`); segundo tenant com o mesmo
cartão → cancelado sem cobrança; cartão `4000 0000 0000 0341` (recusa na cobrança) → `past_due`.

## 8. Fora de escopo

- Checkout embutido no painel (`ui_mode: "embedded"`) — troca de modo da sessão depois, sem
  refazer nada.
- Final do cartão nas telas do painel (só no e-mail).
- Teste de duração diferente por plano.
