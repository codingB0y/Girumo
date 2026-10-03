# Teste grátis de 7 dias com cartão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** conta nova ganha 7 dias grátis cadastrando cartão; no 8º dia o Stripe cobra o plano sozinho.

**Architecture:** o servidor decide a elegibilidade (`organizations.trial_subscription_id` + linha de
`subscriptions`) e monta o Checkout do Stripe com `trial_period_days: 7`. O webhook reserva o teste e o
cartão (índice único), cancela sem cobrar o que for abuso, separa `trial_started` de `payment_completed`
e manda o e-mail de aviso. O painel mostra modal + faixa + paywall em modo teste a partir de
`GET /api/billing/trial`.

**Tech Stack:** Next.js 15 (App Router), Supabase (service-role), Stripe SDK 22 (API `2026-05-27.dahlia`),
Resend, `node:test` via `tsx --test`, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-03-trial-7-dias-cartao-design.md`
**Mockup aprovado:** https://claude.ai/artifact/6tkmnLBdunQWcqqfooStWg (v4)

## Global Constraints

- Copy em PT-BR; código, nomes de commit e de branch em inglês; commits com prefixo semântico.
- **Reembolso NUNCA aparece** em tela, e-mail ou LP — só nos Termos (`app/termos/page.tsx`).
- Continua visível: data e valor da 1ª cobrança e "cancele antes e não paga nada".
- Teste: `TRIAL_DAYS = 7`, os 3 planos, **só cartão**; sem cartão → checkout atual (`semTeste: true`).
- Toda query em `organizations` filtra `.eq("id", tenantId).eq("tenant_id", tenantId)`; em
  `subscriptions`, `.eq("tenant_id", tenantId)`. `plans` é catálogo global (sem filtro, de propósito).
- Motivos de cancelamento gravados em `metadata.cancel_reason`: `"trial_card_reused"` e `"trial_duplicate"`.
- Sem `any`. Arquivos < 800 linhas. Comentários no estilo do repo: explicam o **porquê**.
- Testes unitários: `node:test` + `assert`, sem credencial. Fixture **nunca** com `sk_test_`/`sk_live_`
  (o scan de secrets do CI reprova — ver memória `finding-scan-secrets-pega-fixture`).
- Datas na tela: `diaMesBR` de `apps/web/src/lib/date-br.ts` (fuso de Brasília).
- PR 2 só começa **depois** do PR 1 mergeado, em branch nova a partir de `origin/main`
  (nunca branch em cima de branch de feature — `CLAUDE.md`, "Regra de PR").

## Setup do worktree (uma vez por branch)

Worktree novo vem sem `node_modules`. Ligar por junction (PowerShell, caminhos absolutos):

```powershell
cmd /c mklink /J "<worktree>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
cmd /c mklink /J "<worktree>\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules"
```

Comandos de verificação usados no plano (rodar de `apps/web` do worktree):

- Um teste: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/<arquivo>.test.ts`
- Todos: `npm test`
- Tipos: `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`
- Gate do CI (antes de cada push, PowerShell, da raiz do worktree): `& .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"`

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `apps/web/supabase/migrations/20261003120000_trial_organizations.sql` | colunas + índice único | 1 |
| `apps/web/src/lib/billing/trial.ts` (+test) | regra pura: elegibilidade e visão do teste | 2 |
| `apps/web/src/lib/billing/subscription-access.ts` (+test) | estados `trial` e `trial_card_reused` | 3 |
| `apps/web/src/lib/billing/checkout-session.ts` (+test) | parâmetros da sessão de Checkout | 4 |
| `apps/web/src/lib/billing/trial-facts.ts` | leitura server-only dos fatos do teste | 4 |
| `apps/web/src/app/api/billing/checkout/route.ts` | aplica teste quando elegível | 4 |
| `apps/web/src/app/api/billing/trial/route.ts` | `GET` da visão do teste | 4 |
| `apps/web/src/lib/billing/stripe-webhook.ts` (+test) | caminho do teste, fatura paga, aviso | 5, 6 |
| `apps/web/src/lib/analytics/funnel-summary.ts`, `app/admin/funil/page.tsx` | evento `trial_started` | 5 |
| `apps/web/src/lib/email/trial-ending-copy.ts` (+test) | texto puro do e-mail | 7 |
| `apps/web/src/lib/email/templates.ts`, `delivery-log.ts`, `brand-copy.test.ts` | e-mail de aviso | 7 |
| `apps/web/src/app/api/billing/webhook/route.ts` | store real (Supabase + Stripe + e-mail) | 7 |
| `apps/web/src/app/termos/page.tsx`, `apps/web/src/lib/legal.ts` | Termos | 8 |
| `apps/web/src/lib/billing/trial-copy.ts` (+test) | textos puros do painel | 10 |
| `apps/web/src/lib/billing/checkout-client.ts` | chamada de checkout no browser | 10 |
| `apps/web/src/components/painel/trial/use-trial.ts` | hook de leitura | 10 |
| `apps/web/src/components/painel/trial/trial-offer.tsx` | modal "Ganhe 7 dias grátis" | 11 |
| `apps/web/src/components/painel/trial/trial-banner.tsx`, `app/painel/layout.tsx` | faixa + abertura do modal | 12 |
| `apps/web/src/components/painel/plan-paywall.tsx` | paywall em modo teste | 13 |
| `apps/web/src/components/painel/configuracoes/vitrine/aba-plano.tsx`, `app/painel/configuracoes/page.tsx` | Configurações › Plano | 14 |
| 13 arquivos de LP (+1 teste) + `app/signup/page.tsx` | "7 dias pra desistir" → "7 dias grátis"; anual sem devolução | 16 |

## Ondas (paralelismo seguro — regra de `parallel-subagent-driven-development`)

| Onda | Tarefas | Motivo |
|---|---|---|
| A | 1, 2, 8 | arquivos disjuntos, sem dependência |
| B | 3, 4 | dependem de 2; arquivos disjuntos entre si |
| C | 5 | depende de 2 |
| D | 6 | mesmo arquivo da 5 |
| E | 7 | depende de 5 e 6 (implementa a interface) |
| F | 9 | fecha o PR 1 |
| G (PR 2) | 10 → 11, 13, 14 → 12 → 15 | 11/13/14 disjuntos entre si; 12 monta o 11 |
| H (PR 3) | 16, 17 | — |

Implementadores **não** commitam; o controller commita por tarefa, na ordem, ao fechar a onda.

---

# PR 1 — servidor + Termos (branch `feat/trial-7-dias`, já criada com o spec)

### Task 1: Migração das colunas do teste

**Files:**
- Create: `apps/web/supabase/migrations/20261003120000_trial_organizations.sql`
- Modify: `deploy/supabase/apply-order.txt` (final do arquivo)

**Depends-on:** none

**Interfaces:**
- Produces: `organizations.trial_subscription_id text null`, `organizations.trial_card_fingerprint text null`
  com índice único parcial `organizations_trial_card_fingerprint_key`.

- [ ] **Step 1: Conferir que o objeto ainda não existe (regra do `CLAUDE.md`)**

Pedir ao Igor rodar nos dois bancos (`supabase db query --linked`, ver memória
`tecnica-supabase-cli-sql-nos-dois-bancos`):

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'organizations'
  and column_name in ('trial_subscription_id', 'trial_card_fingerprint');
```

Esperado: 0 linhas nos dois. E conferir as branches abertas: `gh pr list --state open --search trial`.

- [ ] **Step 2: Escrever a migração**

```sql
-- Teste grátis de 7 dias com cartão (spec 2026-10-03).
--
-- As duas colunas moram em organizations pelo mesmo motivo do stripe_customer_id:
-- subscriptions tem unique(tenant_id) e é sobrescrita por todo evento do webhook,
-- então nada que precise sobreviver a uma assinatura pode morar lá.
--
--   trial_subscription_id  — a assinatura do Stripe que consumiu o teste desta conta.
--                            Nulo = nunca testou. É o id (e não um booleano) para o
--                            webhook saber qual de dois checkouts simultâneos venceu.
--   trial_card_fingerprint — o cartão do teste. O índice único é a trava
--                            "um teste por cartão" entre contas diferentes.
alter table public.organizations
  add column if not exists trial_subscription_id text,
  add column if not exists trial_card_fingerprint text;

create unique index if not exists organizations_trial_card_fingerprint_key
  on public.organizations (trial_card_fingerprint)
  where trial_card_fingerprint is not null;
```

- [ ] **Step 3: Registrar na ordem de aplicação**

Acrescentar ao fim de `deploy/supabase/apply-order.txt`:

```text
# 2026-10-03 - Teste gratis de 7 dias com cartao: organizations.trial_subscription_id
# e trial_card_fingerprint (indice unico = um teste por cartao).
apps/web/supabase/migrations/20261003120000_trial_organizations.sql
```

- [ ] **Step 4: Aplicação nos dois bancos — PENDÊNCIA DO IGOR (DDL é bloqueada pelo classificador)**

Deixar anotado para o fim do PR (Task 9):

```powershell
cd apps\web
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
supabase db query --linked -f supabase\migrations\20261003120000_trial_organizations.sql
supabase link --project-ref nidoatbxaylrkcgbszns --yes
supabase db query --linked -f supabase\migrations\20261003120000_trial_organizations.sql
git checkout -- supabase/.temp/
```

A migração traz o gatilho `guard_trial_columns` (Task 1b, decisão do Igor em 03/10): `authenticated`
e `anon` não criam, mudam nem apagam linha com as colunas do teste, seja qual for a policy de
`organizations`. Conferir depois de aplicar, nos dois bancos (espera 1 linha):

```sql
select tgname from pg_trigger
 where tgrelid = 'public.organizations'::regclass and tgname = 'guard_trial_columns';
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20261003120000_trial_organizations.sql deploy/supabase/apply-order.txt
git commit -m "feat(billing): add trial columns to organizations"
```

---

### Task 2: Regra pura do teste (`trial.ts`)

**Files:**
- Create: `apps/web/src/lib/billing/trial.ts`
- Test: `apps/web/src/lib/billing/trial.test.ts`

**Depends-on:** none

**Interfaces:**
- Produces:
  - `TRIAL_DAYS = 7`
  - `type TrialCancelReason = "trial_card_reused" | "trial_duplicate"`
  - `type TrialFacts = { trialSubscriptionId: string | null; subscription: TrialSubscriptionFacts | null }`
  - `type TrialSubscriptionFacts = { status: string | null; stripeSubscriptionId: string | null; periodEnd: string | null; cancelReason: string | null; planName: string | null; priceCents: number | null }`
  - `type TrialView = { elegivel: boolean; emTeste: { fim: string; plano: string; precoCents: number } | null; cartaoRepetido: boolean }`
  - `trialEligible(facts: TrialFacts): boolean`
  - `trialView(facts: TrialFacts): TrialView`

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/src/lib/billing/trial.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { trialEligible, trialView, type TrialFacts, type TrialSubscriptionFacts } from "./trial";

function facts(
  trialSubscriptionId: string | null,
  sub: Partial<TrialSubscriptionFacts> | null,
): TrialFacts {
  return {
    trialSubscriptionId,
    subscription:
      sub === null
        ? null
        : {
            status: null,
            stripeSubscriptionId: null,
            periodEnd: null,
            cancelReason: null,
            planName: null,
            priceCents: null,
            ...sub,
          },
  };
}

test("conta nova, sem assinatura e sem teste, é elegível", () => {
  assert.equal(trialEligible(facts(null, null)), true);
});

test("conta que já usou o teste não é elegível", () => {
  assert.equal(trialEligible(facts("sub_antiga", null)), false);
});

test("conta que já teve assinatura no Stripe não é elegível, mesmo cancelada", () => {
  assert.equal(
    trialEligible(facts(null, { status: "canceled", stripeSubscriptionId: "sub_paga" })),
    false,
  );
});

test("conta parada no FREE antigo (linha sem Stripe) é elegível", () => {
  // São as ~20 contas que ficaram no gratuito depois do paid-first: o melhor público do teste.
  assert.equal(trialEligible(facts(null, { status: "free", stripeSubscriptionId: null })), true);
});

test("em teste: devolve fim, plano e preço", () => {
  const v = trialView(
    facts("sub_trial", {
      status: "trialing",
      stripeSubscriptionId: "sub_trial",
      periodEnd: "2026-10-10T12:00:00.000Z",
      planName: "Growth",
      priceCents: 29700,
    }),
  );
  assert.deepEqual(v, {
    elegivel: false,
    emTeste: { fim: "2026-10-10T12:00:00.000Z", plano: "Growth", precoCents: 29700 },
    cartaoRepetido: false,
  });
});

test("cartão repetido: cancelada com cancel_reason trial_card_reused", () => {
  const v = trialView(
    facts("sub_trial", {
      status: "canceled",
      stripeSubscriptionId: "sub_trial",
      cancelReason: "trial_card_reused",
    }),
  );
  assert.deepEqual(v, { elegivel: false, emTeste: null, cartaoRepetido: true });
});

test("assinatura ativa: nem oferta, nem teste, nem aviso", () => {
  const v = trialView(facts("sub_trial", { status: "active", stripeSubscriptionId: "sub_trial" }));
  assert.deepEqual(v, { elegivel: false, emTeste: null, cartaoRepetido: false });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/trial.test.ts`
Expected: FAIL — `Cannot find module './trial'`.

- [ ] **Step 3: Implementar**

`apps/web/src/lib/billing/trial.ts`:

```ts
/**
 * Teste grátis de 7 dias com cartão (spec 2026-10-03).
 *
 * Puro de propósito: roda sob `tsx --test` e no browser. Quem lê o banco é
 * `trial-facts.ts`; quem aplica o teste é a rota de checkout. O cliente nunca pede
 * teste — o servidor decide com estes fatos.
 */

export const TRIAL_DAYS = 7;

/** Por que o webhook cancelou uma assinatura de teste. Vai em `metadata.cancel_reason`. */
export type TrialCancelReason = "trial_card_reused" | "trial_duplicate";

export type TrialSubscriptionFacts = {
  /** `subscriptions.status`. */
  status: string | null;
  /** `subscriptions.stripe_subscription_id`. */
  stripeSubscriptionId: string | null;
  /** `subscriptions.current_period_end` — durante o teste, é o fim do teste. */
  periodEnd: string | null;
  /** `subscriptions.metadata.cancel_reason`. */
  cancelReason: string | null;
  planName: string | null;
  priceCents: number | null;
};

export type TrialFacts = {
  /** `organizations.trial_subscription_id`: a assinatura que já consumiu o teste. */
  trialSubscriptionId: string | null;
  subscription: TrialSubscriptionFacts | null;
};

export type TrialView = {
  elegivel: boolean;
  emTeste: { fim: string; plano: string; precoCents: number } | null;
  cartaoRepetido: boolean;
};

/**
 * Elegível = nunca testou E nunca teve assinatura no Stripe.
 *
 * A segunda metade é o que impede o cliente que já pagou (e cancelou) de voltar
 * por 7 dias grátis. Linha de `subscriptions` SEM id do Stripe — o FREE antigo e a
 * concessão manual — continua elegível de propósito.
 */
export function trialEligible(facts: TrialFacts): boolean {
  return !facts.trialSubscriptionId && !facts.subscription?.stripeSubscriptionId;
}

export function trialView(facts: TrialFacts): TrialView {
  const sub = facts.subscription;
  const emTeste =
    sub?.status === "trialing" && sub.periodEnd
      ? { fim: sub.periodEnd, plano: sub.planName ?? "", precoCents: sub.priceCents ?? 0 }
      : null;

  return {
    elegivel: trialEligible(facts),
    emTeste,
    cartaoRepetido: sub?.status === "canceled" && sub.cancelReason === "trial_card_reused",
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/trial.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/billing/trial.ts apps/web/src/lib/billing/trial.test.ts
git commit -m "feat(billing): pure trial eligibility rules"
```

---

### Task 3: Estados `trial` e `trial_card_reused` em `subscription-access`

**Files:**
- Modify: `apps/web/src/lib/billing/subscription-access.ts`
- Test: `apps/web/src/lib/billing/subscription-access.test.ts` (acrescentar ao fim)

**Depends-on:** 2 (usa a string `"trial_card_reused"`, mas não importa nada da Task 2)

**Interfaces:**
- Produces:
  - `SubscriptionAccessInput.cancelReason?: string | null`
  - `SubscriptionState` ganha `"trial"` e `"trial_card_reused"`
  - `subscriptionNotice(state: SubscriptionState, periodEnd?: string | null): string`

- [ ] **Step 1: Escrever os testes que falham** (acrescentar ao fim de `subscription-access.test.ts`)

```ts
test("teste grátis concede o plano e tem estado próprio", () => {
  const r = subscriptionAccess(
    { status: "trialing", stripeStatus: "trialing", periodEnd: emDias(4) },
    AGORA,
  );
  assert.deepEqual(r, { grantsPlan: true, state: "trial" });
});

test("teste cancelado por cartão repetido não concede e se explica", () => {
  const r = subscriptionAccess(
    { status: "canceled", stripeStatus: "canceled", periodEnd: emDias(4), cancelReason: "trial_card_reused" },
    AGORA,
  );
  assert.deepEqual(r, { grantsPlan: false, state: "trial_card_reused" });
  assert.equal(
    subscriptionNotice(r.state),
    "Esse cartão já foi usado num teste grátis. Assine direto pra continuar.",
  );
});

test("cancelada por outro motivo continua só cancelada", () => {
  const r = subscriptionAccess(
    { status: "canceled", stripeStatus: "canceled", periodEnd: emDias(4), cancelReason: null },
    AGORA,
  );
  assert.equal(r.state, "canceled");
});

test("aviso do teste traz a data do fim, em Brasília", () => {
  assert.equal(
    subscriptionNotice("trial", "2026-10-10T15:00:00.000Z"),
    "Teste grátis até 10/10. Depois a assinatura segue sozinha.",
  );
  assert.equal(subscriptionNotice("trial", null), "Teste grátis ativo.");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/subscription-access.test.ts`
Expected: FAIL nos 4 novos (`state` vem `"active"`/`"canceled"`; `subscriptionNotice("trial")` cai no default).

- [ ] **Step 3: Implementar**

Em `subscription-access.ts`:

1. Import no topo do arquivo (depois do comentário de cabeçalho):

```ts
import { diaMesBR } from "../date-br";
```

2. Em `SubscriptionAccessInput`, acrescentar o campo:

```ts
  /** `subscriptions.metadata.cancel_reason` — por que o webhook cancelou (teste grátis). */
  cancelReason?: string | null;
```

3. Em `SubscriptionState`, acrescentar os dois membros (antes de `"none"`):

```ts
  /** Teste grátis de 7 dias em andamento. Concede o plano. */
  | "trial"
  /** Teste cancelado sem cobrança: o cartão já tinha feito teste em outra conta. */
  | "trial_card_reused"
```

4. Em `subscriptionAccess`, trocar as duas linhas

```ts
  if (CONCEDE_DIRETO.has(status)) return { grantsPlan: true, state: "active" };
  if (status === "canceled") return { grantsPlan: false, state: "canceled" };
```

por

```ts
  // Antes de CONCEDE_DIRETO: `trialing` concede igual, mas a tela precisa dizer
  // "teste até 10/10" e não "renova em 10/10" — a frase errada faz o cliente achar
  // que já está pagando.
  if (status === "trialing") return { grantsPlan: true, state: "trial" };
  if (CONCEDE_DIRETO.has(status)) return { grantsPlan: true, state: "active" };
  if (status === "canceled") {
    return {
      grantsPlan: false,
      state: input.cancelReason === "trial_card_reused" ? "trial_card_reused" : "canceled",
    };
  }
```

5. Trocar a assinatura e o `switch` de `subscriptionNotice`:

```ts
export function subscriptionNotice(state: SubscriptionState, periodEnd?: string | null): string {
  switch (state) {
    case "trial": {
      const fim = diaMesBR(periodEnd);
      return fim ? `Teste grátis até ${fim}. Depois a assinatura segue sozinha.` : "Teste grátis ativo.";
    }
    case "trial_card_reused":
      return "Esse cartão já foi usado num teste grátis. Assine direto pra continuar.";
    case "pending_payment":
```

(o resto do `switch` fica igual).

- [ ] **Step 4: Rodar e ver passar (arquivo inteiro, inclusive os testes antigos)**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/subscription-access.test.ts`
Expected: PASS em todos. O teste antigo "assinatura paga concede o plano" continua verde (`trialing` ainda concede).

- [ ] **Step 5: Tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro (o único consumidor de `subscriptionNotice` é `app/painel/configuracoes/page.tsx`, que passa só o estado — o segundo parâmetro é opcional; a Task 14 passa a data).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/billing/subscription-access.ts apps/web/src/lib/billing/subscription-access.test.ts
git commit -m "feat(billing): trial and reused-card subscription states"
```

---

### Task 4: Checkout com teste + leitura dos fatos + `GET /api/billing/trial`

**Files:**
- Create: `apps/web/src/lib/billing/checkout-session.ts`
- Test: `apps/web/src/lib/billing/checkout-session.test.ts`
- Create: `apps/web/src/lib/billing/trial-facts.ts`
- Modify: `apps/web/src/app/api/billing/checkout/route.ts`
- Create: `apps/web/src/app/api/billing/trial/route.ts`

**Depends-on:** 2

**Interfaces:**
- Consumes: `TRIAL_DAYS`, `TrialFacts`, `trialEligible`, `trialView` (Task 2)
- Produces:
  - `checkoutSessionParams(i: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams`
  - `type CheckoutSessionInput = { customerId; priceId; appUrl; tenantId; planId; planCode: string; comTeste: boolean }`
  - `readTrialFacts(supabase: SupabaseClient, tenantId: string): Promise<TrialFacts>` (server-only)
  - `POST /api/billing/checkout` aceita `{ planCode: string; semTeste?: boolean }`
  - `GET /api/billing/trial` → `TrialView` (JSON)

- [ ] **Step 1: Teste que falha**

`apps/web/src/lib/billing/checkout-session.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkoutSessionParams } from "./checkout-session";

const BASE = {
  customerId: "cus_1",
  priceId: "price_1",
  appUrl: "https://app.girumo.com.br",
  tenantId: "t1",
  planId: "p1",
  planCode: "GROWTH",
};

test("sem teste, a sessão é exatamente a de antes do teste grátis", () => {
  // Boleto continua vindo do Dashboard: nada de payment_method_types aqui.
  assert.deepEqual(checkoutSessionParams({ ...BASE, comTeste: false }), {
    mode: "subscription",
    customer: "cus_1",
    line_items: [{ price: "price_1", quantity: 1 }],
    success_url: "https://app.girumo.com.br/painel/configuracoes?billing=success",
    cancel_url: "https://app.girumo.com.br/painel/configuracoes?billing=cancelled",
    client_reference_id: "t1",
    metadata: { tenant_id: "t1", plan_id: "p1", plan_code: "GROWTH" },
    subscription_data: { metadata: { tenant_id: "t1", plan_id: "p1", plan_code: "GROWTH" } },
  });
});

test("com teste: só cartão, 7 dias, cancela sem cartão e volta pro painel", () => {
  const p = checkoutSessionParams({ ...BASE, comTeste: true });
  assert.deepEqual(p.payment_method_types, ["card"]);
  assert.equal(p.payment_method_collection, "always");
  assert.equal(p.subscription_data?.trial_period_days, 7);
  assert.deepEqual(p.subscription_data?.trial_settings, {
    end_behavior: { missing_payment_method: "cancel" },
  });
  assert.deepEqual(p.subscription_data?.metadata, {
    tenant_id: "t1",
    plan_id: "p1",
    plan_code: "GROWTH",
    trial: "1",
  });
  assert.equal(p.success_url, "https://app.girumo.com.br/painel?billing=trial_started");
  assert.equal(p.customer, "cus_1");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/checkout-session.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `checkout-session.ts`**

```ts
import type Stripe from "stripe";

import { TRIAL_DAYS } from "./trial";

/**
 * A sessão de Checkout do Stripe, montada fora da rota para ser testada.
 *
 * Sem teste, ela tem de sair idêntica à de antes do teste grátis — é o caminho do
 * boleto, e os métodos de pagamento vêm do Dashboard. Com teste, o cartão é
 * obrigatório: boleto não renova sozinho, e um teste que termina sem meio de
 * cobrança só existe para ser cancelado.
 */
export type CheckoutSessionInput = {
  customerId: string;
  priceId: string;
  appUrl: string;
  tenantId: string;
  planId: string;
  planCode: string;
  comTeste: boolean;
};

export function checkoutSessionParams(i: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams {
  const metadata = { tenant_id: i.tenantId, plan_id: i.planId, plan_code: i.planCode };
  const base: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: i.customerId,
    line_items: [{ price: i.priceId, quantity: 1 }],
    success_url: `${i.appUrl}/painel/configuracoes?billing=success`,
    cancel_url: `${i.appUrl}/painel/configuracoes?billing=cancelled`,
    client_reference_id: i.tenantId,
    metadata,
    subscription_data: { metadata },
  };

  if (!i.comTeste) return base;

  return {
    ...base,
    payment_method_types: ["card"],
    payment_method_collection: "always",
    // Volta para o Início: é lá que a faixa confirma "teste até DD/MM".
    success_url: `${i.appUrl}/painel?billing=trial_started`,
    subscription_data: {
      metadata: { ...metadata, trial: "1" },
      trial_period_days: TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/checkout-session.test.ts`
Expected: PASS, 2 testes.

- [ ] **Step 5: `trial-facts.ts` (server-only, sem teste unitário — é só leitura)**

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { TrialFacts } from "./trial";

/**
 * Os fatos que decidem o teste grátis de um tenant.
 *
 * Erro de leitura SOBE: em caminho de cobrança, "não consegui ler" virar "nunca
 * testou" entregaria um segundo teste de graça — é o mesmo defeito de forma que
 * `getTenantLimits` já teve.
 */
export async function readTrialFacts(supabase: SupabaseClient, tenantId: string): Promise<TrialFacts> {
  const [org, sub] = await Promise.all([
    supabase
      .from("organizations")
      .select("trial_subscription_id")
      .eq("id", tenantId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, stripe_subscription_id, current_period_end, metadata, plans(name, price_cents)")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  if (org.error) throw org.error;
  if (sub.error) throw sub.error;

  const linha = sub.data;
  const plano = (linha?.plans ?? null) as { name?: string | null; price_cents?: number | null } | null;
  const meta = (linha?.metadata ?? null) as { cancel_reason?: string | null } | null;

  return {
    trialSubscriptionId: (org.data?.trial_subscription_id as string | null | undefined) ?? null,
    subscription: linha
      ? {
          status: (linha.status as string | null) ?? null,
          stripeSubscriptionId: (linha.stripe_subscription_id as string | null) ?? null,
          periodEnd: (linha.current_period_end as string | null) ?? null,
          cancelReason: meta?.cancel_reason ?? null,
          planName: plano?.name ?? null,
          priceCents: plano?.price_cents ?? null,
        }
      : null,
  };
}
```

- [ ] **Step 6: Rota de checkout**

Em `apps/web/src/app/api/billing/checkout/route.ts`:

1. Imports (somar aos existentes):

```ts
import { checkoutSessionParams } from "@/lib/billing/checkout-session";
import { trialEligible } from "@/lib/billing/trial";
import { readTrialFacts } from "@/lib/billing/trial-facts";
```

2. Trocar a leitura do corpo:

```ts
    const body = (await req.json().catch(() => ({}))) as { planCode?: string; semTeste?: boolean };
```

3. Logo depois do bloco `if (!priceId) { ... }`, acrescentar:

```ts
    // O cliente não pede teste: o servidor aplica quando a conta é elegível. O único
    // pedido aceito é o contrário — "sem teste", que é o caminho do boleto.
    const comTeste = body.semTeste !== true && trialEligible(await readTrialFacts(supabase, ctx.tenantId));
```

4. Substituir a chamada `stripe.checkout.sessions.create({ ... })` inteira por:

```ts
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        customerId,
        priceId,
        appUrl,
        tenantId: ctx.tenantId,
        planId: String(plan.id),
        planCode,
        comTeste,
      }),
    );
```

(o comentário "Sem idempotencyKey de proposito..." acima da chamada fica.)

5. No insert de log, trocar o `metadata` por:

```ts
      metadata: { checkout_session_id: session.id, plan_code: planCode, com_teste: comTeste },
```

- [ ] **Step 7: Rota `GET /api/billing/trial`**

`apps/web/src/app/api/billing/trial/route.ts`:

```ts
import { trialView } from "@/lib/billing/trial";
import { readTrialFacts } from "@/lib/billing/trial-facts";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/billing/trial — o que as telas do teste grátis precisam saber
 * (spec 2026-10-03, 4.2): se a conta pode testar, se está testando e se o
 * cartão já tinha sido usado num teste.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const facts = await readTrialFacts(getSupabaseAdmin(), ctx.tenantId);
    return Response.json(trialView(facts));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return Response.json({ error: "Nao foi possivel ler o teste gratis." }, { status: 500 });
  }
}
```

- [ ] **Step 8: Tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro. Se `sub.data.plans` vier tipado como array pelo client, o cast em `trial-facts.ts`
já cobre (mesmo padrão de `entitlements.ts`).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/billing/checkout-session.ts apps/web/src/lib/billing/checkout-session.test.ts apps/web/src/lib/billing/trial-facts.ts apps/web/src/app/api/billing/checkout/route.ts apps/web/src/app/api/billing/trial/route.ts
git commit -m "feat(billing): apply 7-day card trial at checkout when eligible"
```

---

### Task 5: Webhook — início do teste, cartão repetido, teste duplicado

**Files:**
- Modify: `apps/web/src/lib/billing/stripe-webhook.ts`
- Modify: `apps/web/src/lib/billing/stripe-webhook.test.ts`
- Modify: `apps/web/src/lib/analytics/funnel-summary.ts:7-23`
- Modify: `apps/web/src/app/admin/funil/page.tsx:21-28`

**Depends-on:** 2

**Interfaces:**
- Consumes: `TrialCancelReason` (Task 2)
- Produces (usado pela Task 7, que implementa no store real):

```ts
export type ClaimTrialResult = { outcome: "won" | "same" | "lost"; winnerId: string | null } & StoreResult;
export type ClaimCardResult = { outcome: "ok" | "taken" } & StoreResult;
export type DefaultCard = { fingerprint: string | null; last4: string | null };

// novos métodos de WebhookStore
claimTrial(input: { tenantId: string; subscriptionId: string }): Promise<ClaimTrialResult>;
defaultCard(subscription: Stripe.Subscription): Promise<DefaultCard>;
claimCardFingerprint(input: { tenantId: string; fingerprint: string }): Promise<ClaimCardResult>;
cancelTrialSubscription(input: { subscription: Stripe.Subscription; reason: TrialCancelReason }): Promise<StoreResult>;
sendTrialEndingEmail(subscription: Stripe.Subscription): Promise<StoreResult>;
// FunnelInput ganha:
onlyFirst?: boolean;
```

- [ ] **Step 1: Atualizar o fake do teste para a interface nova**

Em `stripe-webhook.test.ts`, substituir `type FakeOptions` e `function makeStore` inteiros por:

```ts
type FakeOptions = {
  upsertError?: string | null;
  /** Assinatura que o Stripe devolve no `retrieveSubscription`. */
  subscription?: Stripe.Subscription;
  /** Assinaturas por id — para quando o handler busca OUTRA (a vencedora do teste). */
  subscriptionsById?: Record<string, Stripe.Subscription>;
  /** Quem já reservou o teste desta conta (`organizations.trial_subscription_id`). */
  trialHolder?: string | null;
  /** Fingerprints já reservados por OUTRAS contas. */
  takenFingerprints?: string[];
  card?: { fingerprint: string | null; last4: string | null };
  emailError?: string | null;
};

/**
 * Fake que modela o que importa para estes testes: o marcador de idempotencia,
 * o estado da assinatura e as reservas do teste grátis, com falha injetavel.
 */
function makeStore(options: FakeOptions = {}) {
  const processedEvents = new Set<string>();
  const upserts: SubscriptionRow[] = [];
  const logs: LogRow[] = [];
  const funnelEvents: FunnelInput[] = [];
  const cancels: { id: string; reason: string }[] = [];
  const emails: string[] = [];
  let upsertError = options.upsertError ?? null;
  let trialHolder = options.trialHolder ?? null;

  const store: WebhookStore = {
    async hasProcessedEvent(id) {
      return { found: processedEvents.has(id), error: null };
    },
    async markEventProcessed({ stripeEventId }) {
      processedEvents.add(stripeEventId);
      return { error: null };
    },
    async upsertSubscription(row): Promise<StoreResult> {
      if (upsertError) return { error: upsertError };
      upserts.push(row);
      return { error: null };
    },
    async insertLog(row) {
      logs.push(row);
      return { error: null };
    },
    async retrieveSubscription(id) {
      return options.subscriptionsById?.[id] ?? options.subscription ?? makeSubscription();
    },
    async trackFunnelEvent(input) {
      funnelEvents.push(input);
    },
    async claimTrial({ subscriptionId }) {
      if (!trialHolder) {
        trialHolder = subscriptionId;
        return { outcome: "won", winnerId: subscriptionId, error: null };
      }
      return {
        outcome: trialHolder === subscriptionId ? "same" : "lost",
        winnerId: trialHolder,
        error: null,
      };
    },
    async defaultCard() {
      return options.card ?? { fingerprint: "fp_cartao_a", last4: "4242" };
    },
    async claimCardFingerprint({ fingerprint }) {
      const taken = (options.takenFingerprints ?? []).includes(fingerprint);
      return { outcome: taken ? "taken" : "ok", error: null };
    },
    async cancelTrialSubscription({ subscription, reason }) {
      cancels.push({ id: subscription.id, reason });
      return { error: null };
    },
    async sendTrialEndingEmail(subscription) {
      emails.push(subscription.id);
      return { error: options.emailError ?? null };
    },
  };

  return {
    store,
    upserts,
    logs,
    funnelEvents,
    cancels,
    emails,
    processedEvents,
    recuperaBanco: () => {
      upsertError = null;
    },
  };
}
```

- [ ] **Step 2: Escrever os testes novos (fim do arquivo)**

```ts
// ---------------------------------------------------------------------------
// Teste grátis de 7 dias (spec 2026-10-03). O checkout de teste volta com
// `payment_status: no_payment_required` — o mesmo do cupom de 100% —, e é o
// status da ASSINATURA (`trialing`) que separa os dois.
// ---------------------------------------------------------------------------

function trialing(id: string, metadata: Record<string, string> = {}): Stripe.Subscription {
  return makeSubscription({
    id,
    status: "trialing",
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH", ...metadata },
  });
}

test("teste novo: reserva, conta trial_started e NAO conta venda", async () => {
  const f = makeStore({ subscription: trialing("sub_trial") });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.funnelEvents.map((e) => e.event), ["trial_started"]);
  assert.equal(f.funnelEvents[0].onlyFirst, true);
  assert.equal(f.cancels.length, 0);
});

test("teste ja reservado por esta mesma assinatura (retry) segue sem cancelar", async () => {
  const f = makeStore({ subscription: trialing("sub_trial"), trialHolder: "sub_trial" });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.equal(f.cancels.length, 0);
  assert.deepEqual(f.funnelEvents.map((e) => e.event), ["trial_started"]);
});

test("cartao usado em teste de outra conta: cancela sem cobrar e nao conta teste", async () => {
  const f = makeStore({
    subscription: trialing("sub_trial"),
    card: { fingerprint: "fp_repetido", last4: "4242" },
    takenFingerprints: ["fp_repetido"],
  });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, [{ id: "sub_trial", reason: "trial_card_reused" }]);
  assert.equal(f.funnelEvents.length, 0);
  assert.ok(f.logs.some((l) => l.event === "stripe.trial.cartao_repetido"));
});

test("segundo checkout de teste da mesma conta: cancela o perdedor e devolve a linha a vencedora", async () => {
  const vencedora = trialing("sub_win");
  const f = makeStore({
    subscription: trialing("sub_dup"),
    trialHolder: "sub_win",
    subscriptionsById: { sub_win: vencedora },
  });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, [{ id: "sub_dup", reason: "trial_duplicate" }]);
  assert.equal(f.upserts.at(-1)?.stripe_subscription_id, "sub_win");
  assert.equal(f.funnelEvents.length, 0);
});

test("teste sem fingerprint de cartao segue, mas deixa rastro", async () => {
  const f = makeStore({
    subscription: trialing("sub_trial"),
    card: { fingerprint: null, last4: null },
  });

  await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.ok(f.logs.some((l) => l.event === "stripe.trial.sem_cartao"));
  assert.deepEqual(f.funnelEvents.map((e) => e.event), ["trial_started"]);
});

test("eventos da assinatura duplicada nao sobrescrevem a linha", async () => {
  const f = makeStore();
  const dup = makeSubscription({
    id: "sub_dup",
    status: "canceled",
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH", cancel_reason: "trial_duplicate" },
  });

  const res = await handleStripeEvent(
    makeEvent({ type: "customer.subscription.deleted", data: { object: dup } } as unknown as Partial<Stripe.Event>),
    f.store,
  );

  assert.equal(res.status, 200);
  assert.equal(f.upserts.length, 0);
});

test("motivo do cancelamento chega na linha de subscriptions", async () => {
  const f = makeStore();
  const sub = makeSubscription({
    status: "canceled",
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH", cancel_reason: "trial_card_reused" },
  });

  await handleStripeEvent(
    makeEvent({ type: "customer.subscription.deleted", data: { object: sub } } as unknown as Partial<Stripe.Event>),
    f.store,
  );

  assert.equal(f.upserts[0].metadata.cancel_reason, "trial_card_reused");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/stripe-webhook.test.ts`
Expected: FAIL nos 7 novos (o caminho de teste não existe; `cancel_reason` não é copiado). Os antigos
continuam passando.

- [ ] **Step 4: Implementar em `stripe-webhook.ts`**

4a. Import, logo abaixo dos existentes:

```ts
import type { TrialCancelReason } from "./trial";
```

4b. Em `FunnelInput`, acrescentar:

```ts
  /** Preserva a 1ª ocorrência em vez de atualizar o timestamp (ver funnel-events.ts). */
  onlyFirst?: boolean;
```

4c. Logo depois de `export type FunnelInput = { ... };`, acrescentar:

```ts
/** Reserva do teste da conta. `same` = retry do mesmo evento; `lost` = outra assinatura venceu. */
export type ClaimTrialResult = { outcome: "won" | "same" | "lost"; winnerId: string | null } & StoreResult;

/** Reserva do cartão do teste. `taken` = outra conta já testou com este cartão. */
export type ClaimCardResult = { outcome: "ok" | "taken" } & StoreResult;

export type DefaultCard = { fingerprint: string | null; last4: string | null };
```

4d. Em `interface WebhookStore`, acrescentar depois de `trackFunnelEvent`:

```ts
  /** Grava `organizations.trial_subscription_id` se ainda estiver vazio. */
  claimTrial(input: { tenantId: string; subscriptionId: string }): Promise<ClaimTrialResult>;
  /** Cartão padrão da assinatura. Lança se o Stripe falhar (vira 5xx e reenvio). */
  defaultCard(subscription: Stripe.Subscription): Promise<DefaultCard>;
  /** Grava `organizations.trial_card_fingerprint`; o índice único decide entre contas. */
  claimCardFingerprint(input: { tenantId: string; fingerprint: string }): Promise<ClaimCardResult>;
  /** Grava `metadata.cancel_reason` e cancela a assinatura no Stripe, sem cobrar. */
  cancelTrialSubscription(input: {
    subscription: Stripe.Subscription;
    reason: TrialCancelReason;
  }): Promise<StoreResult>;
  /** E-mail "seu teste grátis termina em 3 dias". */
  sendTrialEndingEmail(subscription: Stripe.Subscription): Promise<StoreResult>;
```

4e. No começo de `upsertSubscription` (antes de `const tenantId = ...`):

```ts
  // A perdedora de dois checkouts de teste simultâneos (ver handleTrialStart). Os
  // eventos dela chegam DEPOIS do cancelamento e sobrescreveriam a linha da
  // vencedora — `subscriptions` tem unique(tenant_id).
  if (subscription.metadata.cancel_reason === "trial_duplicate") {
    await store.insertLog({
      tenant_id: subscription.metadata.tenant_id ?? SYSTEM_TENANT_ID,
      level: "info",
      event: "stripe.trial.duplicado_ignorado",
      message: "Evento de assinatura de teste duplicada ignorado.",
      metadata: { stripe_subscription_id: subscription.id },
    });
    return { error: null };
  }
```

4f. No objeto `metadata` do `store.upsertSubscription({...})`, acrescentar a terceira chave:

```ts
    metadata: {
      stripe_status: subscription.status,
      plan_code: subscription.metadata.plan_code ?? null,
      // A tela precisa saber POR QUE foi cancelada (cartão repetido no teste).
      cancel_reason: subscription.metadata.cancel_reason ?? null,
    },
```

4g. Nova função, logo antes de `async function handleCheckoutSession`:

```ts
/**
 * O checkout terminou e a assinatura nasceu em teste.
 *
 * Três travas, nesta ordem:
 * 1. Um teste por conta: `claimTrial`. Duas abas podem concluir dois checkouts —
 *    a segunda perde, é cancelada sem cobrança, e a linha de `subscriptions` (que
 *    ela acabou de sobrescrever) volta para a vencedora.
 * 2. Um teste por cartão: `claimCardFingerprint`. Cartão que já testou em outra
 *    conta → cancela SEM cobrar. Cobrar na hora contrariaria a oferta "7 dias
 *    grátis" que o Checkout já mostrou (CDC art. 30 e 35).
 * 3. Só então o funil ganha `trial_started` — e nunca `payment_completed`, que
 *    agora sai da primeira fatura paga (`invoice.paid`).
 *
 * Retry é seguro: as duas reservas reconhecem a própria assinatura, e um retry
 * depois do cancelamento lê a assinatura fresca, já `canceled`, e nem entra aqui.
 */
async function handleTrialStart(
  subscription: Stripe.Subscription,
  tenantId: string,
  store: WebhookStore,
): Promise<StoreResult> {
  const claim = await store.claimTrial({ tenantId, subscriptionId: subscription.id });
  if (claim.error) return { error: claim.error };

  if (claim.outcome === "lost") {
    const cancelled = await store.cancelTrialSubscription({ subscription, reason: "trial_duplicate" });
    if (cancelled.error) return cancelled;

    await store.insertLog({
      tenant_id: tenantId,
      level: "warn",
      event: "stripe.trial.duplicado",
      message: "Segundo checkout de teste da mesma conta: cancelado sem cobranca.",
      metadata: { stripe_subscription_id: subscription.id, vencedora: claim.winnerId },
    });

    if (!claim.winnerId) return { error: null };
    // `now` e nao o `created` deste evento: e uma leitura fresca do Stripe, e o
    // banco descarta evento mais velho que o ultimo gravado (C.2).
    const vencedora = await store.retrieveSubscription(claim.winnerId);
    return upsertSubscription(vencedora, new Date().toISOString(), store);
  }

  const card = await store.defaultCard(subscription);
  if (!card.fingerprint) {
    // Nao deveria acontecer (o teste exige cartao). Segue sem a trava por cartao
    // em vez de negar um teste legitimo — e deixa o rastro para alguem olhar.
    await store.insertLog({
      tenant_id: tenantId,
      level: "warn",
      event: "stripe.trial.sem_cartao",
      message: "Teste iniciado sem fingerprint de cartao; trava por cartao nao aplicada.",
      metadata: { stripe_subscription_id: subscription.id },
    });
  } else {
    const cardClaim = await store.claimCardFingerprint({ tenantId, fingerprint: card.fingerprint });
    if (cardClaim.error) return { error: cardClaim.error };

    if (cardClaim.outcome === "taken") {
      const cancelled = await store.cancelTrialSubscription({ subscription, reason: "trial_card_reused" });
      if (cancelled.error) return cancelled;

      await store.insertLog({
        tenant_id: tenantId,
        level: "warn",
        event: "stripe.trial.cartao_repetido",
        message: "Cartao ja usado em teste de outra conta: assinatura de teste cancelada sem cobranca.",
        metadata: { stripe_subscription_id: subscription.id },
      });
      return { error: null };
    }
  }

  await store.trackFunnelEvent({
    tenantId,
    userId: subscription.metadata.user_id ?? null,
    event: "trial_started",
    metadata: {
      plan_code: subscription.metadata.plan_code ?? null,
      stripe_subscription_id: subscription.id,
    },
    onlyFirst: true,
  });

  return { error: null };
}
```

4h. Em `handleCheckoutSession`, logo depois de `if (!tenantId) return { error: null };`:

```ts
  // `no_payment_required` vem tanto do cupom de 100% quanto do teste grátis; o
  // que separa os dois é o status da assinatura.
  if (subscription.status === "trialing") return handleTrialStart(subscription, tenantId, store);
```

- [ ] **Step 5: `trial_started` no tipo do funil**

Em `apps/web/src/lib/analytics/funnel-summary.ts`, trocar o fim da união e o comentário abaixo dela:

```ts
  | "goal_set"
  | "trial_started"
  | "payment_completed";
// `trial_started` voltou em 03/10/2026 com o teste grátis de 7 dias com cartão
// (spec 2026-10-03): sai do webhook quando o checkout de teste termina. Desde
// então `payment_completed` sai da primeira fatura PAGA (`invoice.paid`), e não
// mais do checkout de teste, que volta `no_payment_required`.
```

(apagar o comentário antigo "`trial_started` foi removido: ..." inteiro.)

Em `apps/web/src/app/admin/funil/page.tsx`, inserir depois da linha do `signup` em `FUNNEL_STEPS`:

```ts
  { event: "trial_started", label: "Teste grátis", icon: Check, color: "text-sky-600 bg-sky-50" },
```

(`Check` já é importado no arquivo.)

- [ ] **Step 6: Rodar e ver passar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/stripe-webhook.test.ts`
Expected: PASS em todos, antigos e novos.

- [ ] **Step 7: Tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: **um** erro esperado em `app/api/billing/webhook/route.ts` (o store real ainda não implementa os
métodos novos) — a Task 7 resolve. Qualquer outro erro, corrigir aqui.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/billing/stripe-webhook.ts apps/web/src/lib/billing/stripe-webhook.test.ts apps/web/src/lib/analytics/funnel-summary.ts apps/web/src/app/admin/funil/page.tsx
git commit -m "feat(billing): handle trial start, reused card and duplicate trial in webhook"
```

---

### Task 6: Webhook — primeira fatura paga e aviso de fim de teste

**Files:**
- Modify: `apps/web/src/lib/billing/stripe-webhook.ts`
- Modify: `apps/web/src/lib/billing/stripe-webhook.test.ts` (fim do arquivo)

**Depends-on:** 5

**Interfaces:**
- Consumes: `WebhookStore.sendTrialEndingEmail`, `FunnelInput.onlyFirst` (Task 5)
- Produces: tratamento de `invoice.paid` e `customer.subscription.trial_will_end` em `handleStripeEvent`.

- [ ] **Step 1: Testes que falham**

```ts
function invoiceEvent(
  amountPaid: number,
  meta: Record<string, string> | null = { tenant_id: TENANT, plan_code: "GROWTH" },
): Stripe.Event {
  return {
    id: `evt_inv_${amountPaid}`,
    type: "invoice.paid",
    created: 1_700_000_000,
    data: {
      object: {
        id: "in_1",
        amount_paid: amountPaid,
        billing_reason: "subscription_cycle",
        parent: meta ? { subscription_details: { subscription: "sub_trial", metadata: meta } } : null,
      },
    },
  } as unknown as Stripe.Event;
}

test("primeira fatura paga (fim do teste) conta a venda, uma vez so", async () => {
  const f = makeStore();

  const res = await handleStripeEvent(invoiceEvent(29700), f.store);

  assert.equal(res.status, 200);
  assert.equal(f.funnelEvents.length, 1);
  assert.equal(f.funnelEvents[0].event, "payment_completed");
  assert.equal(f.funnelEvents[0].onlyFirst, true);
});

test("fatura de R$ 0 (a que abre o teste) nao e venda", async () => {
  const f = makeStore();

  await handleStripeEvent(invoiceEvent(0), f.store);

  assert.equal(f.funnelEvents.length, 0);
});

test("fatura sem assinatura (sem tenant) e ignorada sem erro", async () => {
  const f = makeStore();

  const res = await handleStripeEvent(invoiceEvent(29700, null), f.store);

  assert.equal(res.status, 200);
  assert.equal(f.funnelEvents.length, 0);
});

function trialWillEnd(over: Partial<Stripe.Subscription> = {}): Stripe.Event {
  return makeEvent({
    id: "evt_twe",
    type: "customer.subscription.trial_will_end",
    data: { object: makeSubscription({ status: "trialing", ...over }) },
  } as unknown as Partial<Stripe.Event>);
}

test("aviso de fim de teste manda o e-mail", async () => {
  const f = makeStore();

  const res = await handleStripeEvent(trialWillEnd(), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.emails, ["sub_123"]);
});

test("teste ja cancelado pelo cliente nao recebe aviso de cobranca", async () => {
  const f = makeStore();

  await handleStripeEvent(trialWillEnd({ cancel_at_period_end: true }), f.store);

  assert.deepEqual(f.emails, []);
});

test("falha no e-mail vira log e 2xx: reenvio duplicaria o e-mail de quem recebeu", async () => {
  const f = makeStore({ emailError: "resend fora" });

  const res = await handleStripeEvent(trialWillEnd(), f.store);

  assert.equal(res.status, 200);
  assert.ok(f.logs.some((l) => l.event === "stripe.trial.aviso_falhou"));
  assert.ok(f.processedEvents.has("evt_twe"));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/stripe-webhook.test.ts`
Expected: FAIL nos 4 que esperam efeito (`invoice.paid` com valor, e-mail, log de falha).

- [ ] **Step 3: Implementar**

3a. Duas funções novas, logo antes de `export async function handleStripeEvent`:

```ts
/**
 * Primeira fatura PAGA = venda. Vale para o fim do teste grátis e para qualquer
 * primeira cobrança; `onlyFirst` impede que renovações reescrevam o marco.
 *
 * A fatura de R$ 0 que abre o teste também chega como `invoice.paid` — o valor é
 * o filtro. O tenant vem do metadata da assinatura copiado na fatura
 * (`parent.subscription_details`, API dahlia).
 */
async function handleInvoicePaid(invoice: Stripe.Invoice, store: WebhookStore): Promise<StoreResult> {
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return { error: null };

  const meta = invoice.parent?.subscription_details?.metadata ?? null;
  const tenantId = meta?.tenant_id;
  if (!tenantId) return { error: null };

  await store.trackFunnelEvent({
    tenantId,
    userId: meta?.user_id ?? null,
    event: "payment_completed",
    metadata: {
      plan_code: meta?.plan_code ?? null,
      stripe_invoice_id: invoice.id,
      billing_reason: invoice.billing_reason ?? null,
    },
    onlyFirst: true,
  });

  return { error: null };
}

/**
 * O Stripe avisa 3 dias antes do fim do teste. Mandamos o e-mail com valor, data
 * e como cancelar — exigência das bandeiras para teste com cartão, e o que segura
 * chargeback.
 *
 * Falha no envio NÃO pede reenvio: o Stripe reentregaria o evento e quem já
 * recebeu ganharia um segundo e-mail. Vira log e o marcador é gravado.
 */
async function handleTrialWillEnd(
  subscription: Stripe.Subscription,
  store: WebhookStore,
): Promise<StoreResult> {
  const tenantId = subscription.metadata.tenant_id;
  if (!tenantId || subscription.status !== "trialing") return { error: null };
  // Cancelou durante o teste: não vai haver cobrança, e o aviso seria mentira.
  if (subscription.cancel_at_period_end) return { error: null };

  const sent = await store.sendTrialEndingEmail(subscription);
  if (sent.error) {
    await store.insertLog({
      tenant_id: tenantId,
      level: "warn",
      event: "stripe.trial.aviso_falhou",
      message: "E-mail de fim de teste nao saiu.",
      metadata: { stripe_subscription_id: subscription.id, error: sent.error },
    });
  }

  return { error: null };
}
```

3b. Em `handleStripeEvent`, logo depois do bloco de `checkout.session.async_payment_failed`:

```ts
  if (event.type === "invoice.paid") {
    processed = await handleInvoicePaid(event.data.object as Stripe.Invoice, store);
  }

  if (event.type === "customer.subscription.trial_will_end") {
    processed = await handleTrialWillEnd(event.data.object as Stripe.Subscription, store);
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/stripe-webhook.test.ts`
Expected: PASS em todos.

- [ ] **Step 5: Tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: só o erro já conhecido do store real em `webhook/route.ts`. Se `invoice.parent` não existir
no tipo, é sinal de que o pin de API mudou — parar e reportar (não fazer cast para contornar).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/billing/stripe-webhook.ts apps/web/src/lib/billing/stripe-webhook.test.ts
git commit -m "feat(billing): count first paid invoice and send trial-ending notice"
```

---

### Task 7: E-mail de aviso + store real do webhook

**Files:**
- Create: `apps/web/src/lib/email/trial-ending-copy.ts`
- Test: `apps/web/src/lib/email/trial-ending-copy.test.ts`
- Modify: `apps/web/src/lib/email/templates.ts:343-366` (função `trialEndingEmail`)
- Modify: `apps/web/src/lib/email/delivery-log.ts:9-20` (`EmailKind`)
- Modify: `apps/web/src/lib/email/send.ts` (`SendOptions.idempotencyKey?`, repassado como
  `resend.emails.send(payload, { idempotencyKey })`; resend 4.8.0 aceita)
- Modify: `apps/web/src/lib/email/brand-copy.test.ts:58`
- Modify: `apps/web/src/app/api/cron/emails/route.ts:45-46` (comentário)
- Modify: `apps/web/src/app/api/billing/webhook/route.ts`

**Depends-on:** 5, 6

**Interfaces:**
- Consumes: `WebhookStore` completo (Tasks 5–6), `formatarPreco` (`lib/billing/plan-display.ts`),
  `diaMesBR` (`lib/date-br.ts`), `escapeHtml` (`lib/email/invite-copy.ts`), `sendEmail` (`lib/email/send.ts`)
- Produces:
  - `trialEndingCopy(i: TrialEndingCopyInput): TrialEndingCopy`
  - `type TrialEndingCopyInput = { planName: string; amountCents: number; chargeAt: string; cardLast4: string | null }`
  - `trialEndingEmail(input: TrialEndingCopyInput & { appUrl: string }): { subject: string; html: string }`
  - `EmailKind` ganha `"trial_ending"`

- [ ] **Step 1: Teste do texto, que falha**

`apps/web/src/lib/email/trial-ending-copy.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { trialEndingCopy } from "./trial-ending-copy";

const BASE = {
  planName: "Growth",
  amountCents: 29700,
  chargeAt: "2026-10-10T15:00:00.000Z",
  cardLast4: "4242",
};

test("assunto, valor, data e final do cartao", () => {
  const c = trialEndingCopy(BASE);
  assert.equal(c.subject, "Seu teste grátis termina em 3 dias");
  assert.equal(c.titulo, "Seu teste do Growth termina em 10/10");
  assert.equal(
    c.cobranca,
    "Nesse dia cobramos R$ 297 no cartão final 4242 e a assinatura continua sozinha, sem você precisar fazer nada.",
  );
  assert.equal(c.botao, "Continuar no Growth");
  assert.equal(c.cancelarAte, "09/10");
});

test("sem o final do cartao, a frase nao inventa numero", () => {
  const c = trialEndingCopy({ ...BASE, cardLast4: null });
  assert.equal(
    c.cobranca,
    "Nesse dia cobramos R$ 297 no cartão cadastrado e a assinatura continua sozinha, sem você precisar fazer nada.",
  );
});

test("o e-mail nao fala em reembolso (decisao 03/10/2026: so nos Termos)", () => {
  assert.doesNotMatch(JSON.stringify(trialEndingCopy(BASE)), /reembols|devolv|desist|arrepend/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/email/trial-ending-copy.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `trial-ending-copy.ts`**

```ts
import { formatarPreco } from "../billing/plan-display";
import { diaMesBR } from "../date-br";

/**
 * O texto do e-mail "seu teste grátis termina em 3 dias", puro para ser testado
 * (mesmo padrão de invite-copy e broadcast-failed-copy). O HTML fica em templates.ts.
 *
 * Não menciona reembolso de propósito: desde 03/10/2026 ele vive só nos Termos.
 * O que o e-mail PRECISA ter é valor, data e como cancelar antes — é o aviso que
 * as bandeiras exigem para teste com cartão.
 */
export type TrialEndingCopyInput = {
  planName: string;
  amountCents: number;
  /** Fim do teste = data da 1ª cobrança (ISO). */
  chargeAt: string;
  cardLast4: string | null;
};

export type TrialEndingCopy = {
  subject: string;
  titulo: string;
  cobranca: string;
  botao: string;
  /** Último dia para cancelar sem cobrança: a véspera da cobrança. */
  cancelarAte: string;
};

const DIA_MS = 86_400_000;

export function trialEndingCopy(i: TrialEndingCopyInput): TrialEndingCopy {
  const data = diaMesBR(i.chargeAt) ?? "";
  const vespera = diaMesBR(new Date(Date.parse(i.chargeAt) - DIA_MS).toISOString()) ?? "";
  const cartao = i.cardLast4 ? `no cartão final ${i.cardLast4}` : "no cartão cadastrado";

  return {
    subject: "Seu teste grátis termina em 3 dias",
    titulo: `Seu teste do ${i.planName} termina em ${data}`,
    cobranca: `Nesse dia cobramos ${formatarPreco(i.amountCents)} ${cartao} e a assinatura continua sozinha, sem você precisar fazer nada.`,
    botao: `Continuar no ${i.planName}`,
    cancelarAte: vespera,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/email/trial-ending-copy.test.ts`
Expected: PASS, 3 testes. (Se `formatarPreco` devolver espaço não separável, o teste mostra — a
função atual troca por espaço comum.)

- [ ] **Step 5: Reescrever `trialEndingEmail` em `templates.ts`**

Acrescentar `escapeHtml` ao import existente de `invite-copy`:

```ts
import { escapeHtml, inviteCopy } from "@/lib/email/invite-copy";
```

e o import do texto:

```ts
import { trialEndingCopy, type TrialEndingCopyInput } from "@/lib/email/trial-ending-copy";
```

Substituir o bloco inteiro de `// --- Trial acabando (2 dias) — APOSENTADO ---` até o `}` final da
função `trialEndingEmail` por:

```ts
// --- Fim do teste grátis (3 dias antes da 1ª cobrança) ---
// Disparado pelo webhook do Stripe (`customer.subscription.trial_will_end`), não
// pelo cron. Sem menção a reembolso: ele mora só nos Termos (decisão 03/10/2026).
export function trialEndingEmail(
  input: TrialEndingCopyInput & { appUrl: string },
): { subject: string; html: string } {
  const c = trialEndingCopy(input);
  const { appUrl } = input;
  return {
    subject: c.subject,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">${escapeHtml(c.titulo)}</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">${escapeHtml(c.cobranca)}</p>
      ${button(escapeHtml(c.botao), `${appUrl}/painel`)}
      <p style="margin:20px 0 8px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        Não quer continuar? <a href="${appUrl}/painel/configuracoes" style="color:${BRAND_COLORS.cobaltText}">Cancele o teste até ${escapeHtml(c.cancelarAte)}</a> e não cobramos nada.
      </p>
      <p style="margin:0;font-size:13px;color:${BRAND_COLORS.slate}">
        Cancelamento sem multa a qualquer momento · <a href="${appUrl}/termos" style="color:${BRAND_COLORS.slate}">Termos de uso</a>
      </p>
    `),
  };
}
```

- [ ] **Step 6: `EmailKind`, teste de marca e comentário do cron**

`delivery-log.ts` — acrescentar ao fim da união `EmailKind`:

```ts
  | "alert_optout"
  | "trial_ending";
```

`brand-copy.test.ts:58` — a frase "Ver planos e assinar" só existia no e-mail de teste aposentado:

```ts
  assert.match(templates, /Cancele o teste até/);
```

`app/api/cron/emails/route.ts:45-46` — trocar as duas linhas do comentário por:

```ts
 * O e-mail de fim de teste (`trialEndingEmail`) não sai daqui: desde 03/10/2026 quem
 * o dispara é o webhook do Stripe (`customer.subscription.trial_will_end`).
```

- [ ] **Step 7: Store real no `webhook/route.ts`**

Imports (somar):

```ts
import { getAppUrl } from "@/lib/billing/stripe";
import { sendEmail } from "@/lib/email/send";
import { trialEndingEmail } from "@/lib/email/templates";
import type { DefaultCard } from "@/lib/billing/stripe-webhook";
```

(`getStripe` já vem do mesmo módulo — juntar no import existente.)

Dentro de `createStore()`, antes do `return {`:

```ts
  async function lerCartao(subscription: Stripe.Subscription): Promise<DefaultCard> {
    const pm = subscription.default_payment_method;
    if (!pm) return { fingerprint: null, last4: null };
    const metodo = typeof pm === "string" ? await getStripe().paymentMethods.retrieve(pm) : pm;
    return { fingerprint: metodo.card?.fingerprint ?? null, last4: metodo.card?.last4 ?? null };
  }
```

E no objeto devolvido, depois de `trackFunnelEvent`:

```ts
    async claimTrial({ tenantId, subscriptionId }) {
      const { data, error } = await supabase
        .from("organizations")
        .update({ trial_subscription_id: subscriptionId })
        .eq("id", tenantId)
        .eq("tenant_id", tenantId)
        .is("trial_subscription_id", null)
        .select("trial_subscription_id")
        .maybeSingle();
      if (error) return { outcome: "lost", winnerId: null, error: error.message };
      if (data) return { outcome: "won", winnerId: subscriptionId, error: null };

      // Nada casou: alguém já reservou. Pode ser esta mesma assinatura (retry).
      const { data: atual, error: readError } = await supabase
        .from("organizations")
        .select("trial_subscription_id")
        .eq("id", tenantId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (readError) return { outcome: "lost", winnerId: null, error: readError.message };
      const winnerId = (atual?.trial_subscription_id as string | null | undefined) ?? null;
      // Sem organização não há onde reservar: erro, para o Stripe reenviar e o log mostrar.
      if (!winnerId) return { outcome: "lost", winnerId: null, error: `organizacao ${tenantId} nao encontrada` };
      return { outcome: winnerId === subscriptionId ? "same" : "lost", winnerId, error: null };
    },

    defaultCard: lerCartao,

    async claimCardFingerprint({ tenantId, fingerprint }) {
      const { error } = await supabase
        .from("organizations")
        .update({ trial_card_fingerprint: fingerprint })
        .eq("id", tenantId)
        .eq("tenant_id", tenantId)
        .is("trial_card_fingerprint", null);
      // Índice único: outra conta já testou com este cartão. Não é falha, é a trava.
      if (error?.code === UNIQUE_VIOLATION) return { outcome: "taken", error: null };
      if (error) return { outcome: "ok", error: error.message };
      // Zero linhas casadas também é "ok": a conta já tinha o cartão gravado (retry).
      return { outcome: "ok", error: null };
    },

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
          amountCents: subscription.items.data[0]?.price.unit_amount ?? 0,
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
```

- [ ] **Step 8: Rodar tudo**

Run: `npm test` (de `apps/web`) e `npx tsc --noEmit -p tsconfig.json`
Expected: PASS e zero erros de tipo (o erro do store some aqui).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/email/trial-ending-copy.ts apps/web/src/lib/email/trial-ending-copy.test.ts apps/web/src/lib/email/templates.ts apps/web/src/lib/email/delivery-log.ts apps/web/src/lib/email/brand-copy.test.ts apps/web/src/app/api/cron/emails/route.ts apps/web/src/app/api/billing/webhook/route.ts
git commit -m "feat(billing): trial-ending email and real webhook store for trial"
```

---

### Task 8: Termos — teste grátis e arrependimento a partir da 1ª cobrança

**Files:**
- Modify: `apps/web/src/app/termos/page.tsx` (seção 7, "Cancelamento")
- Modify: `apps/web/src/lib/legal.ts:13-14`

**Depends-on:** none

- [ ] **Step 1: Parágrafo do teste grátis**

Em `app/termos/page.tsx`, dentro de `<LegalSection n={7} title="Cancelamento">`, inserir **antes** do
parágrafo que começa com `<strong>Arrependimento em 7 dias:</strong>`:

```tsx
        <p>
          <strong>Teste grátis de 7 dias:</strong> a assinatura pode começar com 7 dias grátis. Para
          ativar o teste é preciso cadastrar um cartão de crédito, e nada é cobrado durante o teste.
          Ao fim dos 7 dias, o plano escolhido passa a ser cobrado automaticamente no cartão, todo
          mês, até você cancelar. Avisamos por e-mail antes da primeira cobrança, e cancelando antes
          do fim do teste nada é cobrado. O teste vale uma vez por conta e por cartão: se o cartão já
          tiver sido usado num teste, o teste não é ativado e nada é cobrado.
        </p>
```

- [ ] **Step 2: Arrependimento conta da 1ª cobrança**

No parágrafo do arrependimento, trocar

```tsx
          atualizado. Basta pedir por {LEGAL_CONTACT_EMAIL}.
```

por

```tsx
          atualizado. Quando a assinatura começa por teste grátis, os 7 dias contam a partir da
          primeira cobrança. Basta pedir por {LEGAL_CONTACT_EMAIL}.
```

- [ ] **Step 3: Subir a versão (obrigatório no mesmo commit — comentário de `legal.ts`)**

```ts
export const LEGAL_VERSION = "2026-10-03.1";
export const LEGAL_EFFECTIVE_DATE = "3 de outubro de 2026";
```

- [ ] **Step 4: Testes**

Run: `npm test` (de `apps/web`)
Expected: PASS (`legal-acceptance.test.ts` lê a constante, não o valor).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/termos/page.tsx apps/web/src/lib/legal.ts
git commit -m "docs(legal): terms for 7-day card trial; CDC withdrawal counts from first charge"
```

---

### Task 9: Fechar o PR 1

**Depends-on:** 1–8

- [ ] **Step 1: Atualizar com a main e conferir defasagem**

```bash
git fetch origin main && git log HEAD..origin/main --oneline | wc -l
```

Se > 0: pedir ao app o merge (`sync_with_base_branch`) ou `git merge origin/main`; resolver e rodar os
testes de novo.

- [ ] **Step 2: Gate do CI local** (PowerShell, raiz do worktree)

`& .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"` → `EXIT=0`.
Mais `npx tsc --noEmit -p tsconfig.e2e.json` (de `apps/web`).

- [ ] **Step 3: Revisão de código antes do push**

Despachar **Code Reviewer** e **Security Engineer** (paralelo) no diff `origin/main...HEAD`. Pontos que
o revisor de segurança deve olhar: ninguém além do servidor decide `comTeste`; o filtro de tenant em
`organizations`; o cancelamento nunca cobra. Corrigir CRITICAL/HIGH.

- [ ] **Step 4: Pendências do Igor (juntas, no fim — memória `feedback-execucao-autonoma-pendencias-no-fim`)**

1. Aplicar a migração nos dois bancos (comandos da Task 1, Step 4) e mandar o resultado da consulta do
   gatilho `guard_trial_columns` (1 linha em cada banco). O gate de drift não enxerga gatilho: essa
   consulta é a única prova de que ele existe. Junto, a do furo aceito (função `security definer` que
   escreve em `organizations` passa pela guarda; qualquer linha que faça update/delete merece olhar):

   ```sql
   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname in ('public', 'app')
      and pg_get_functiondef(p.oid) ~* 'organizations';
   ```
2. Atualizar a baseline do gate de drift: rodar em **prod**

   ```sql
   select json_object_agg(kind || '|' || nome, sig order by kind, nome)::text from public.schema_signature();
   ```

   colar em `objetos` de `deploy/supabase/schema-baseline.json` (+ `gerado_em`), e validar com
   `npx tsx infra/scripts/check-schema-drift.ts` (credencial de dev do `.env.local`) → "Sem drift fora da
   allowlist". Commit: `chore(schema): baseline with trial columns`.
3. Stripe Dashboard → Developers → Webhooks → endpoint de produção → **adicionar eventos**
   `customer.subscription.trial_will_end` e `invoice.paid`.
4. Stripe Dashboard → Settings → Billing → Customer portal → Cancellations → **"At end of billing period"**.
5. Push + PR:

   ```bash
   git push -u origin feat/trial-7-dias
   gh pr create --base main --title "feat(billing): 7-day free trial with card (server + terms)" --body-file <corpo>
   ```

   Corpo: resumo do spec, lista das 4 pendências acima marcadas, plano de teste, e o rodapé
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
6. CI verde → `gh pr merge <N> --squash --delete-branch` (merge à mão — `main` sem proteção, nunca
   auto-merge).
7. **Não** ligar `BILLING_TRIAL_ENABLED` agora. O PR 1 entra desligado (sem a chave o checkout é o de
   antes, então a ordem deploy × migração deixa de importar); liga na Task 15, Step 6.

---

# PR 2 — telas do painel (branch nova `feat/trial-7-dias-painel` a partir de `origin/main` com o PR 1 mergeado)

### Task 10: Textos puros, chamada de checkout e hook de leitura

**Files:**
- Create: `apps/web/src/lib/billing/trial-copy.ts`
- Test: `apps/web/src/lib/billing/trial-copy.test.ts`
- Create: `apps/web/src/lib/billing/checkout-client.ts`
- Create: `apps/web/src/components/painel/trial/use-trial.ts`

**Depends-on:** PR 1 mergeado

**Interfaces:**
- Consumes: `TrialView`, `TRIAL_DAYS` (`lib/billing/trial.ts`); `formatarPreco`; `diaMesBR`
- Produces:
  - `type Faixa = { tipo: "oferta" | "em_teste" | "cartao_repetido"; texto: string; acao: string } | null`
  - `faixaDoTeste(view: TrialView | null, agora: Date): Faixa`
  - `datasDoTeste(agora: Date): { aviso: string; cobranca: string }`
  - `linhaDoPrecoNoTeste(precoCents: number): string`
  - `abrirCheckout(planCode: string, opcoes?: { semTeste?: boolean }): Promise<void>` (lança `Error` com mensagem para a tela)
  - `useTrial(): { view: TrialView | null; ativando: boolean; voltouDoCheckout: boolean }`

- [ ] **Step 1: Teste que falha**

`apps/web/src/lib/billing/trial-copy.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { datasDoTeste, faixaDoTeste, linhaDoPrecoNoTeste } from "./trial-copy";

const AGORA = new Date("2026-10-06T12:00:00.000Z");
const NADA = { elegivel: false, emTeste: null, cartaoRepetido: false };

test("oferta para quem e elegivel", () => {
  assert.deepEqual(faixaDoTeste({ ...NADA, elegivel: true }, AGORA), {
    tipo: "oferta",
    texto: "Teste o Girumo completo por 7 dias. Hoje você não paga nada.",
    acao: "Ativar 7 dias grátis",
  });
});

test("em teste: dias que faltam, data e valor da cobranca", () => {
  const faixa = faixaDoTeste(
    { ...NADA, emTeste: { fim: "2026-10-10T12:00:00.000Z", plano: "Growth", precoCents: 29700 } },
    AGORA,
  );
  assert.deepEqual(faixa, {
    tipo: "em_teste",
    texto: "Teste grátis do Growth: faltam 4 dias. Em 10/10 começa a cobrança de R$ 297/mês no cartão cadastrado.",
    acao: "Ver plano",
  });
});

test("ultimo dia do teste", () => {
  const fim = new Date(AGORA.getTime() + 5 * 3_600_000).toISOString();
  const faixa = faixaDoTeste({ ...NADA, emTeste: { fim, plano: "Growth", precoCents: 29700 } }, AGORA);
  assert.match(faixa?.texto ?? "", /^Teste grátis do Growth: último dia\./);
});

test("cartao repetido oferece assinar direto, sem falar em teste", () => {
  assert.deepEqual(faixaDoTeste({ ...NADA, cartaoRepetido: true }, AGORA), {
    tipo: "cartao_repetido",
    texto: "Esse cartão já foi usado num teste grátis em outra conta. Não cobramos nada. Pra continuar, assine direto.",
    acao: "Ver planos",
  });
});

test("nada a mostrar: assinatura ativa ou leitura que falhou", () => {
  assert.equal(faixaDoTeste(NADA, AGORA), null);
  assert.equal(faixaDoTeste(null, AGORA), null);
});

test("datas do modal: aviso em 4 dias, cobranca em 7", () => {
  assert.deepEqual(datasDoTeste(new Date("2026-10-03T12:00:00.000Z")), { aviso: "07/10", cobranca: "10/10" });
});

test("preco no modo teste", () => {
  assert.equal(linhaDoPrecoNoTeste(19700), "R$ 0 hoje · depois R$ 197/mês");
});

test("nenhum texto do painel fala em reembolso", () => {
  const todos = JSON.stringify([
    faixaDoTeste({ ...NADA, elegivel: true }, AGORA),
    faixaDoTeste({ ...NADA, cartaoRepetido: true }, AGORA),
    linhaDoPrecoNoTeste(19700),
  ]);
  assert.doesNotMatch(todos, /reembols|devolv|desist|arrepend/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/trial-copy.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `trial-copy.ts`**

```ts
import { diaMesBR } from "../date-br";
import { formatarPreco } from "./plan-display";
import { TRIAL_DAYS, type TrialView } from "./trial";

/**
 * Os textos do teste grátis no painel (mockup v4), puros para serem testados.
 * Nenhum fala em reembolso: desde 03/10/2026 ele vive só nos Termos.
 */

const DIA_MS = 86_400_000;
/** O Stripe emite `trial_will_end` 3 dias antes do fim. */
const AVISO_ANTES_DIAS = 3;

export type Faixa = {
  tipo: "oferta" | "em_teste" | "cartao_repetido";
  texto: string;
  acao: string;
} | null;

/** Dias inteiros até o fim. Menos de 24 h é o último dia, não "faltam 0 dias". */
function faltam(fim: string, agora: Date): string {
  const dias = Math.floor((Date.parse(fim) - agora.getTime()) / DIA_MS);
  if (!Number.isFinite(dias) || dias <= 0) return "último dia";
  return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}

export function faixaDoTeste(view: TrialView | null, agora: Date): Faixa {
  if (!view) return null;

  if (view.emTeste) {
    const { fim, plano, precoCents } = view.emTeste;
    return {
      tipo: "em_teste",
      texto: `Teste grátis do ${plano || "seu plano"}: ${faltam(fim, agora)}. Em ${diaMesBR(fim) ?? "breve"} começa a cobrança de ${formatarPreco(precoCents)}/mês no cartão cadastrado.`,
      acao: "Ver plano",
    };
  }

  if (view.cartaoRepetido) {
    return {
      tipo: "cartao_repetido",
      texto: "Esse cartão já foi usado num teste grátis em outra conta. Não cobramos nada. Pra continuar, assine direto.",
      acao: "Ver planos",
    };
  }

  if (view.elegivel) {
    return {
      tipo: "oferta",
      texto: "Teste o Girumo completo por 7 dias. Hoje você não paga nada.",
      acao: "Ativar 7 dias grátis",
    };
  }

  return null;
}

/** Linha do tempo do modal: quando chega o aviso e quando acontece a 1ª cobrança. */
export function datasDoTeste(agora: Date): { aviso: string; cobranca: string } {
  const fim = agora.getTime() + TRIAL_DAYS * DIA_MS;
  return {
    aviso: diaMesBR(new Date(fim - AVISO_ANTES_DIAS * DIA_MS).toISOString()) ?? "",
    cobranca: diaMesBR(new Date(fim).toISOString()) ?? "",
  };
}

export function linhaDoPrecoNoTeste(precoCents: number): string {
  return `R$ 0 hoje · depois ${formatarPreco(precoCents)}/mês`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/trial-copy.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: `checkout-client.ts`**

```ts
import { authenticatedFetch } from "@/lib/supabase/client";

/**
 * Abre o Checkout do Stripe. O servidor decide se entra o teste grátis; o único
 * pedido que a tela pode fazer é `semTeste` — o caminho do boleto.
 *
 * Lança com a mensagem do servidor: engolir aqui deixava o botão girar, parar, e
 * a tela idêntica a antes do clique (ver plan-paywall.tsx).
 */
export async function abrirCheckout(planCode: string, opcoes: { semTeste?: boolean } = {}): Promise<void> {
  const res = await authenticatedFetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planCode, semTeste: opcoes.semTeste === true }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || "Checkout indisponível.");
  window.location.href = data.url;
}
```

- [ ] **Step 6: `use-trial.ts`**

```ts
"use client";

import { useEffect, useState } from "react";

import type { TrialView } from "@/lib/billing/trial";
import { authenticatedFetch } from "@/lib/supabase/client";

/** Voltando do Checkout, o webhook leva alguns segundos: relê até o teste aparecer. */
const TENTATIVAS_APOS_CHECKOUT = 10;
const INTERVALO_MS = 2000;

/**
 * O estado do teste grátis do tenant (`GET /api/billing/trial`).
 *
 * `view` nulo = carregando ou leitura falhou: as telas de teste simplesmente não
 * aparecem, e o gate de 402 continua funcionando sozinho.
 *
 * `ativando` cobre a janela entre voltar do Stripe e o webhook gravar: sem ela a
 * faixa mostraria "Ativar 7 dias grátis" a quem acabou de ativar.
 */
export function useTrial(): { view: TrialView | null; ativando: boolean; voltouDoCheckout: boolean } {
  const [view, setView] = useState<TrialView | null>(null);
  const [ativando, setAtivando] = useState(false);
  const [voltouDoCheckout, setVoltouDoCheckout] = useState(false);

  useEffect(() => {
    let vivo = true;
    let tentativas = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const voltou = new URLSearchParams(window.location.search).get("billing") === "trial_started";
    setVoltouDoCheckout(voltou);
    setAtivando(voltou);

    async function ler() {
      try {
        const res = await authenticatedFetch("/api/billing/trial");
        if (!vivo || !res.ok) return;
        const dados = (await res.json()) as TrialView;
        if (!vivo) return;
        setView(dados);
        const resolvido = Boolean(dados.emTeste) || dados.cartaoRepetido;
        if (voltou && !resolvido && ++tentativas < TENTATIVAS_APOS_CHECKOUT) {
          timer = setTimeout(ler, INTERVALO_MS);
          return;
        }
        setAtivando(false);
      } catch {
        if (vivo) setAtivando(false);
      }
    }

    void ler();
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { view, ativando, voltouDoCheckout };
}
```

- [ ] **Step 7: Tipos, lint e commit**

Run: `npx tsc --noEmit -p tsconfig.json` → sem erro. `npx eslint src/components/painel/trial src/lib/billing` →
sem erro. Se o eslint acusar `react-hooks/set-state-in-effect` no `useTrial`, mover os dois `set` iniciais
(`setVoltouDoCheckout`, `setAtivando`) para a primeira linha de `ler()`, antes do `await`.

```bash
git add apps/web/src/lib/billing/trial-copy.ts apps/web/src/lib/billing/trial-copy.test.ts apps/web/src/lib/billing/checkout-client.ts apps/web/src/components/painel/trial/use-trial.ts
git commit -m "feat(painel): trial copy helpers, checkout client and useTrial hook"
```

---

### Task 11: Modal "Ganhe 7 dias grátis"

**Files:**
- Create: `apps/web/src/components/painel/trial/trial-offer.tsx`

**Depends-on:** 10

**Interfaces:**
- Consumes: `abrirCheckout`, `datasDoTeste`, `formatarPreco`, `planosParaOferecer`, `PlanoCatalogo`
- Produces: `<TrialOffer onClose={() => void} />`

- [ ] **Step 1: Implementar**

```tsx
"use client";

/**
 * "Ganhe 7 dias grátis" — a oferta ao entrar no painel sem plano (spec 2026-10-03,
 * 4.7; mockup v4, tela 1).
 *
 * Só abre quando `/api/billing/trial` diz `elegivel`, e o checkout aplica o teste
 * sozinho: este modal escolhe o plano, não decide teste. O link do boleto é o
 * único jeito de pedir "sem teste".
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { abrirCheckout } from "@/lib/billing/checkout-client";
import { formatarPreco, planosParaOferecer, type PlanoCatalogo } from "@/lib/billing/plan-display";
import { datasDoTeste } from "@/lib/billing/trial-copy";

interface TrialOfferProps {
  onClose: () => void;
}

export function TrialOffer({ onClose }: TrialOfferProps) {
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const datas = datasDoTeste(new Date());

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const lista = planosParaOferecer(Array.isArray(d) ? d : []);
        setPlanos(lista);
        // Começa no do meio, como no mockup aprovado.
        setEscolhido(lista[Math.min(1, lista.length - 1)]?.code ?? null);
      })
      .catch(() => setPlanos([]));
  }, []);

  // Esc fecha e o foco entra no diálogo — mesmo contrato do PlanPaywall.
  useEffect(() => {
    fecharRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  const comecar = useCallback(
    async (semTeste: boolean) => {
      if (!escolhido) return;
      setAbrindo(true);
      setErro(null);
      try {
        await abrirCheckout(escolhido, { semTeste });
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível abrir o checkout.");
        setAbrindo(false);
      }
    },
    [escolhido],
  );

  const plano = planos.find((p) => p.code === escolhido) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-volt-950/70 p-4 sm:py-14" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oferta-teste-titulo"
        className="w-full max-w-3xl rounded-xl bg-paper-0 p-6 shadow-xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="oferta-teste-titulo" className="text-2xl font-bold text-volt-950">
              Ganhe 7 dias grátis no Girumo
            </h2>
            <p className="mt-1 text-sm text-volt-950/70">
              Escolha o plano, cadastre o cartão e use tudo liberado por 7 dias. Hoje você não paga nada.
            </p>
          </div>
          <button
            ref={fecharRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xl leading-none text-volt-950/50 transition-colors hover:text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          >
            ×
          </button>
        </div>

        {erro && (
          <p role="alert" className="mt-4 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta">
            {erro}
          </p>
        )}

        <fieldset className="mt-5">
          <legend className="sr-only">Plano</legend>
          {planos.length === 0 ? (
            <p className="text-sm text-volt-950/70">
              Não consegui listar os planos aqui. Abra{" "}
              <a className="font-medium underline" href="/painel/configuracoes">
                Configurações
              </a>{" "}
              pra escolher.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {planos.map((p) => (
                <label
                  key={p.code}
                  className={`block cursor-pointer rounded-xl border p-4 text-volt-950 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt-500 ${
                    escolhido === p.code ? "border-cobalt-500 ring-2 ring-cobalt-500/20" : "border-volt-950/[0.12]"
                  }`}
                >
                  <input
                    type="radio"
                    name="plano-teste"
                    value={p.code}
                    checked={escolhido === p.code}
                    onChange={() => setEscolhido(p.code)}
                    className="sr-only"
                  />
                  <span className="block font-semibold">{p.name}</span>
                  <span className="font-data mt-1 block text-lg tabular-nums">
                    {formatarPreco(p.price_cents ?? 0)}
                    <span className="text-sm text-volt-950/60"> /mês</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <ol aria-label="Como funciona a cobrança" className="mt-5 grid gap-3 rounded-xl bg-volt-950/[0.04] px-4 py-3 sm:grid-cols-3">
          <li>
            <span className="font-data block text-sm font-semibold">Hoje</span>
            <span className="text-sm text-volt-950/70">R$ 0 · cartão cadastrado</span>
          </li>
          <li>
            <span className="font-data block text-sm font-semibold">{datas.aviso}</span>
            <span className="text-sm text-volt-950/70">te avisamos por e-mail</span>
          </li>
          <li>
            <span className="font-data block text-sm font-semibold">{datas.cobranca}</span>
            <span className="text-sm text-volt-950/70">
              1ª cobrança{plano ? `: ${formatarPreco(plano.price_cents ?? 0)}/mês` : ""}
            </span>
          </li>
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void comecar(true)}
            disabled={abrindo || !escolhido}
            className="text-sm font-medium text-cobalt-700 underline disabled:opacity-50"
          >
            Prefere boleto? Assine sem teste grátis
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-[var(--radius-control)] border border-volt-950/[0.12] px-4 text-sm font-semibold text-volt-950"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={() => void comecar(false)}
              disabled={abrindo || !escolhido}
              className="min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-sm font-semibold text-white transition-[filter] duration-[var(--duration-micro)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:opacity-50"
            >
              {abrindo ? "Abrindo…" : `Começar 7 dias grátis${plano ? ` no ${plano.name}` : ""}`}
            </button>
          </div>
        </div>

        <p className="mt-4 text-xs text-volt-950/60">
          Cancele antes de {datas.cobranca} em Configurações › Plano e não paga nada. Um teste por conta e por cartão.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Tipos e lint**

Run: `npx tsc --noEmit -p tsconfig.json` e `npx eslint src/components/painel/trial`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/painel/trial/trial-offer.tsx
git commit -m "feat(painel): trial offer modal"
```

---

### Task 12: Faixa do teste + abertura do modal no layout

**Files:**
- Create: `apps/web/src/components/painel/trial/trial-banner.tsx`
- Modify: `apps/web/src/app/painel/layout.tsx`

**Depends-on:** 10, 11, 13 (monta o `PlanPaywall` do jeito que a Task 13 deixa)

**Interfaces:**
- Consumes: `useTrial`, `faixaDoTeste`, `TrialOffer`, `PlanPaywall`
- Produces: `<TrialBanner />`

- [ ] **Step 1: Implementar `trial-banner.tsx`**

```tsx
"use client";

/**
 * A faixa do teste grátis no topo do conteúdo do painel (spec 2026-10-03, 4.7):
 * oferta para quem pode testar, contagem para quem está testando, e a saída para
 * quem teve o cartão recusado por já ter testado.
 *
 * Também abre o modal de oferta UMA vez por sessão. Fechar grava em
 * sessionStorage; sem storage (aba privada), o layout persistente já impede que
 * ele reabra a cada navegação — só um reload o traria de volta.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { faixaDoTeste } from "@/lib/billing/trial-copy";

import { PlanPaywall } from "../plan-paywall";
import { TrialOffer } from "./trial-offer";
import { useTrial } from "./use-trial";

const CHAVE_OFERTA_VISTA = "girumo:oferta-teste-vista";

function jaViuNestaSessao(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_OFERTA_VISTA) === "1";
  } catch {
    return false;
  }
}

function marcarComoVista(): void {
  try {
    sessionStorage.setItem(CHAVE_OFERTA_VISTA, "1");
  } catch {
    // Sem storage: ver o comentário do componente.
  }
}

const BOTAO =
  "inline-flex min-h-10 shrink-0 items-center rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-sm font-semibold text-white transition-[filter] duration-[var(--duration-micro)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

export function TrialBanner() {
  const { view, ativando, voltouDoCheckout } = useTrial();
  const [ofertaAberta, setOfertaAberta] = useState(false);
  const [planosAbertos, setPlanosAbertos] = useState(false);

  useEffect(() => {
    // Quem acabou de voltar do Checkout não pode ver a oferta de novo enquanto o
    // webhook não grava — seria o convite a pagar duas vezes.
    if (!view?.elegivel || ativando || voltouDoCheckout || jaViuNestaSessao()) return;
    marcarComoVista();
    setOfertaAberta(true);
  }, [view?.elegivel, ativando, voltouDoCheckout]);

  if (ativando) {
    return (
      <p role="status" className="border-b border-volt-950/[0.08] bg-paper-0 px-4 py-2.5 text-sm text-volt-950 lg:px-7">
        Ativando seu teste grátis…
      </p>
    );
  }

  const faixa = faixaDoTeste(view, new Date());
  if (!faixa) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Teste grátis"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-volt-950/[0.08] bg-paper-0 px-4 py-2.5 text-sm text-volt-950 lg:px-7"
      >
        <p className="min-w-0">{faixa.texto}</p>
        {faixa.tipo === "em_teste" ? (
          <Link href="/painel/configuracoes" className="shrink-0 font-semibold underline">
            {faixa.acao}
          </Link>
        ) : (
          <button
            type="button"
            className={BOTAO}
            onClick={() => (faixa.tipo === "oferta" ? setOfertaAberta(true) : setPlanosAbertos(true))}
          >
            {faixa.acao}
          </button>
        )}
      </div>

      {ofertaAberta && <TrialOffer onClose={() => setOfertaAberta(false)} />}
      {planosAbertos && (
        <PlanPaywall motivo="Assine pra continuar usando o Girumo." onClose={() => setPlanosAbertos(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Montar no layout**

Em `apps/web/src/app/painel/layout.tsx`, import:

```tsx
import { TrialBanner } from "@/components/painel/trial/trial-banner";
```

e trocar

```tsx
                <Letreiro />
                <main className="max-w-[var(--content-max)] flex-1 pb-20 lg:pb-0">
```

por

```tsx
                <Letreiro />
                <TrialBanner />
                <main className="max-w-[var(--content-max)] flex-1 pb-20 lg:pb-0">
```

- [ ] **Step 3: Tipos, lint e verificação visual**

Run: `npx tsc --noEmit -p tsconfig.json` e `npx eslint src/components/painel/trial src/app/painel/layout.tsx`

Verificação visual: o `preview_start` serve o **checkout principal**, não o worktree (memória
`finding-preview-serve-checkout-principal`). Rodar o `next dev` do worktree e capturar com Playwright
(memória `tecnica-verificar-artifact-com-playwright`), logado com o usuário E2E de dev, em 3 estados —
forçar cada um interceptando `GET /api/billing/trial` com `page.route`:
`{elegivel:true,...}` (modal abre + faixa), `{emTeste:{...}}` (faixa verde de contagem),
`{cartaoRepetido:true}` (faixa + "Ver planos"). Conferir a 390 px que a faixa quebra linha sem
overflow horizontal e que o tema noite do `pn-root` não deixa texto ilegível.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/painel/trial/trial-banner.tsx apps/web/src/app/painel/layout.tsx
git commit -m "feat(painel): trial banner and first-visit offer"
```

---

### Task 13: `PlanPaywall` em modo teste (e sem reembolso)

**Files:**
- Modify: `apps/web/src/components/painel/plan-paywall.tsx` (substituir o arquivo inteiro)

**Depends-on:** 10

**Interfaces:**
- Consumes: `useTrial`, `abrirCheckout`, `linhaDoPrecoNoTeste`
- Produces: mesma API pública (`<PlanPaywall motivo onClose />`) — os consumidores não mudam.

- [ ] **Step 1: Substituir o arquivo**

```tsx
"use client";

/**
 * Os planos no próprio ponto de bloqueio.
 *
 * O PR #158 fez o gate mostrar a mensagem certa e um botão "Ver planos" que
 * levava a `/painel/configuracoes`. Funcionava, mas cobrava do cliente dois
 * cliques e a perda do contexto — ele estava escrevendo uma campanha, e para
 * pagar tinha de sair da tela e procurar o plano.
 *
 * Desde 03/10/2026 este é também a porta do teste grátis: quando a conta é
 * elegível, o mesmo diálogo vira "Teste 7 dias grátis pra continuar" — o servidor
 * aplica o teste no checkout. O rodapé não fala mais em reembolso (só nos Termos).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useTrial } from "@/components/painel/trial/use-trial";
import { abrirCheckout } from "@/lib/billing/checkout-client";
import { formatarPreco, planosParaOferecer, type PlanoCatalogo } from "@/lib/billing/plan-display";
import { linhaDoPrecoNoTeste } from "@/lib/billing/trial-copy";

interface PlanPaywallProps {
  /** A mensagem do 402, para o cliente saber o que o trouxe até aqui. */
  motivo: string;
  onClose: () => void;
}

export function PlanPaywall({ motivo, onClose }: PlanPaywallProps) {
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [assinando, setAssinando] = useState<string | null>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const { view } = useTrial();
  const comTeste = view?.elegivel === true;

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPlanos(planosParaOferecer(Array.isArray(d) ? d : [])))
      .catch(() => setPlanos([]))
      .finally(() => setCarregando(false));
  }, []);

  // Esc fecha, e o foco entra no diálogo: sem isso quem navega por teclado fica
  // preso atrás de um overlay que não dá para alcançar.
  useEffect(() => {
    fecharRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  const assinar = useCallback(async (planCode: string, semTeste = false) => {
    setAssinando(planCode);
    setErro(null);
    try {
      await abrirCheckout(planCode, { semTeste });
    } catch (e) {
      // Engolir aqui deixaria o botão girar, parar, e a tela idêntica a antes do
      // clique — inclusive para o suporte, porque o cliente só sabe dizer "não acontece".
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o checkout.");
      setAssinando(null);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-volt-950/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-titulo"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper-0 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="paywall-titulo" className="text-lg font-semibold text-volt-950">
              {comTeste ? "Teste 7 dias grátis pra continuar" : "Escolha um plano pra continuar"}
            </h2>
            <p className="mt-1 text-sm text-volt-950/70">{motivo}</p>
          </div>
          <button
            ref={fecharRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xl leading-none text-volt-950/50 transition-colors hover:text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          >
            ×
          </button>
        </div>

        {erro && (
          <p role="alert" className="mt-4 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta">
            {erro}
          </p>
        )}

        <div className="mt-5 space-y-3">
          {carregando && <p className="text-sm text-volt-950/60">Carregando planos…</p>}

          {!carregando && planos.length === 0 && (
            // Lista vazia não pode virar diálogo vazio. O texto não afirma a causa:
            // o catálogo pode ter falhado ou vindo sem plano vendável (banco de dev).
            <p className="text-sm text-volt-950/70">
              Não consegui listar os planos aqui. Abra{" "}
              <a className="font-medium underline" href="/painel/configuracoes">
                Configurações
              </a>{" "}
              pra escolher.
            </p>
          )}

          {planos.map((plano) => (
            <div
              key={plano.code}
              className="flex items-center justify-between gap-4 rounded-xl border border-volt-950/[0.08] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-volt-950">{plano.name}</p>
                <p className="text-sm text-volt-950/60">
                  {comTeste ? (
                    linhaDoPrecoNoTeste(plano.price_cents ?? 0)
                  ) : (
                    <>
                      {formatarPreco(plano.price_cents ?? 0)}
                      <span className="text-volt-950/40"> /mês</span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void assinar(plano.code)}
                disabled={assinando !== null}
                className="min-h-11 shrink-0 rounded-[var(--radius-control)] bg-cobalt-500 px-4 py-2 text-sm font-semibold text-white transition-[filter] duration-[var(--duration-micro)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:opacity-50"
              >
                {assinando === plano.code ? "Abrindo…" : comTeste ? "Testar grátis" : "Assinar"}
              </button>
            </div>
          ))}
        </div>

        {comTeste ? (
          <div className="mt-5 space-y-2 text-center text-xs text-volt-950/60">
            <p>A cobrança começa no 8º dia, no cartão que você cadastrar. Cancele antes e não paga nada.</p>
            {planos[0] && (
              <button
                type="button"
                onClick={() => void assinar(planos[0].code, true)}
                disabled={assinando !== null}
                className="font-medium text-cobalt-700 underline disabled:opacity-50"
              >
                Prefere boleto? Assine sem teste grátis
              </button>
            )}
          </div>
        ) : (
          <p className="mt-5 text-center text-xs text-volt-950/50">Cancele quando quiser, sem multa.</p>
        )}
      </div>
    </div>
  );
}
```

> Nota: o link do boleto no paywall abre o checkout sem teste no **primeiro** plano da lista (o de
> entrada). Quem quiser boleto em outro plano escolhe em Configurações › Plano. `ponytail:` um seletor
> de plano para o boleto aqui só se o suporte pedir.

- [ ] **Step 2: Tipos, lint e o e2e que toca o gate**

Run: `npx tsc --noEmit -p tsconfig.json`, `npx eslint src/components/painel/plan-paywall.tsx`.
O e2e `e2e/painel-vitrine-conectar.spec.ts` procura o botão "Ver planos" do `PlanLimitAlert`, que não muda.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/painel/plan-paywall.tsx
git commit -m "feat(painel): paywall offers the free trial when eligible; drop refund footer"
```

---

### Task 14: Configurações › Plano mostra o teste

**Files:**
- Modify: `apps/web/src/components/painel/configuracoes/vitrine/aba-plano.tsx`
- Modify: `apps/web/src/app/painel/configuracoes/page.tsx:76-82, 220-230, 413-420`

**Depends-on:** PR 1 (Task 3: `subscriptionNotice(state, periodEnd)` e `cancelReason`)

- [ ] **Step 1: `aba-plano.tsx`**

1. Em `PropsDoPlano`, depois de `renovaEm`:

```ts
  /** Assinatura em teste grátis (`trialing`): muda o selo, a data e o link de cancelar. */
  emTeste: boolean;
```

2. Na desestruturação de `AbaPlano`, acrescentar `emTeste,` depois de `renovaEm,`.

3. Trocar o selo:

```tsx
            <span className={cn("pn-chip", vigente ? "text-success-700" : "text-danger-700")}>
              {emTeste ? "Teste grátis" : vigente ? "Ativa" : "Inativa"}
            </span>
```

4. Trocar a linha de estado:

```tsx
          <p className="font-data mt-2 text-13 tabular-nums text-slate-600">
            {vigente
              ? renova
                ? emTeste
                  ? `Teste grátis · 1ª cobrança em ${renova}`
                  : `Renova em ${renova}`
                : "Assinatura ativa"
              : (recado ?? "Assinatura sem cobrança em dia")}
          </p>
```

5. Trocar o texto do link de cancelar:

```tsx
            <Link href="/painel/configuracoes/cancelar" className="text-13 text-slate-600 hover:text-danger-700">
              {emTeste ? "Cancelar teste (sem cobrança)" : "Cancelar assinatura"}
            </Link>
```

- [ ] **Step 2: `configuracoes/page.tsx`**

1. No tipo `Subscription`, trocar a linha do `metadata`:

```ts
  metadata?: { stripe_status?: string | null; cancel_reason?: string | null } | null;
```

2. Na chamada de `subscriptionAccess`, acrescentar o motivo:

```ts
          stripeStatus: sub.metadata?.stripe_status ?? null,
          periodEnd: sub.current_period_end ?? null,
          cancelReason: sub.metadata?.cancel_reason ?? null,
```

3. No objeto `plano={{ ... }}`:

```ts
        recado: acessoPlano ? subscriptionNotice(acessoPlano.state, sub?.current_period_end ?? null) : null,
        renovaEm: sub?.current_period_end ?? null,
        emTeste: sub?.status === "trialing",
```

- [ ] **Step 3: Tipos, lint e testes**

Run: `npx tsc --noEmit -p tsconfig.json`, `npx eslint src/components/painel/configuracoes src/app/painel/configuracoes`, `npm test`.
Se algum teste/e2e procura literalmente "Cancelar assinatura" ou "Ativa", continua valendo (o texto só
muda em `trialing`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/painel/configuracoes/vitrine/aba-plano.tsx apps/web/src/app/painel/configuracoes/page.tsx
git commit -m "feat(painel): show trial status and first charge date in plan settings"
```

---

### Task 15: QA de ponta a ponta em modo teste do Stripe + fechar o PR 2

**Depends-on:** 10–14

Precisa das chaves **de teste** do Stripe no `.env.local` do worktree de dev e do Stripe CLI. Se faltar
qualquer um, registrar como pendência do Igor e seguir para o Step 5 com os unitários verdes + a
verificação visual da Task 12 — sem afirmar QA de ponta a ponta.

- [ ] **Step 1: Webhook local**

`stripe listen --forward-to localhost:3000/api/billing/webhook` (copiar o `whsec_` impresso para
`STRIPE_WEBHOOK_SECRET` do `.env.local` e reiniciar o `next dev`). No `.env.local`,
`BILLING_TRIAL_ENABLED=1` — sem ela o teste não aparece (chave da revisão final do PR 1).

- [ ] **Step 2: Teste novo** — conta de dev nova → modal abre → Growth → cartão `4242 4242 4242 4242` →
volta para `/painel?billing=trial_started` → "Ativando…" → faixa "faltam 7 dias". Conferir no banco de
dev: `organizations.trial_subscription_id` e `trial_card_fingerprint` preenchidos; `subscriptions.status
= trialing`; `funnel_events` com `trial_started` e **sem** `payment_completed`.

- [ ] **Step 3: Cartão repetido** — segunda conta, mesmo `4242` → volta → faixa "Esse cartão já foi
usado…"; no Stripe a assinatura está `canceled` sem fatura paga; `subscriptions.metadata.cancel_reason
= trial_card_reused`.

- [ ] **Step 4: Fim do teste com Test Clock** — Dashboard de teste → Billing → Test clocks → criar
relógio, criar Customer nele, gravar o id em `organizations.stripe_customer_id` de uma terceira conta de
dev, fazer o checkout de teste com ela. Avançar o relógio 4 dias → evento `trial_will_end` → e-mail sai
(ver `logs` com `email.sent` / kind `trial_ending`). Avançar mais 3 dias → fatura paga →
`subscriptions.status = active` + `funnel_events.payment_completed`. Repetir com o cartão
`4000 0000 0000 0341` (recusa na cobrança) → `past_due` → faixa some e o 402 volta.

- [ ] **Step 5: Fechar o PR 2** — `verify-local.ps1` verde, **Code Reviewer** + **Accessibility Auditor**
em paralelo no diff, push, `gh pr create` (corpo com capturas da Task 12 e o resultado do QA, rodapé
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`), CI verde, `gh pr merge <N> --squash --delete-branch`.

- [ ] **Step 6: Ligar o teste em produção (Igor)** — só com o PR 2 no ar, a migração aplicada nos dois
bancos e os eventos do Stripe habilitados: Vercel → `BILLING_TRIAL_ENABLED=1` em Production → redeploy.
Desligar é o freio de emergência (mesmo caminho, valor vazio).

---

# PR 3 — copy das LPs e do cadastro (branch `feat/trial-7-dias-lps` a partir de `origin/main`)

### Task 16: "7 dias pra desistir" → "7 dias grátis"

**Files:**
- Modify: `apps/web/src/app/signup/page.tsx:98`
- Modify: `apps/web/src/components/lp-atacado/atacado-closing.tsx:8-31, 97`
- Modify: `apps/web/src/components/lp-cartaz/cartaz-landing.tsx:86-87`
- Modify: `apps/web/src/components/lp-cartaz/hero.tsx:48`
- Modify: `apps/web/src/components/lp-cartaz/plans.tsx:38, 66-76`
- Modify: `apps/web/src/components/lp-piloto/proof-plans.tsx:85-86`
- Modify: `apps/web/src/components/lp3/landing-data.ts:182`
- Modify: `apps/web/src/components/lp3/landing-desktop.tsx:435`
- Modify: `apps/web/src/components/lp3/landing-mobile.tsx:231-234`
- Modify: `apps/web/src/components/lp3/landing.tsx:108`
- Modify: `apps/web/src/components/lp-piloto/closing.tsx:52-53`
- Modify: `apps/web/src/components/lp-shared/lp-data.ts:11-24` (resposta do anual)
- Modify: `apps/web/src/components/lp-shared/lp-data.test.ts:13-16`
- Modify: `apps/web/src/components/lp3/landing-data.ts:186` (resposta do anual)

**Depends-on:** PR 1 no ar (a oferta precisa existir antes de ser anunciada)

> A devolução proporcional do **anual** também sai das LPs: é reembolso, e desde 03/10/2026 reembolso
> vive só nos Termos (onde a regra do anual continua escrita, com o exemplo numérico).

- [ ] **Step 1: Trocas exatas** (string antiga → nova)

`signup/page.tsx`:
- `subtitle="7 dias pra desistir · sem fidelidade · sem multa"` → `subtitle="7 dias grátis · sem fidelidade · sem multa"`

`lp-atacado/atacado-closing.tsx`:
- `/** Selo dos 7 dias: direito de arrependimento do CDC (art. 49), o mesmo texto do FAQ. */` →
  `/** Selo dos 7 dias: o teste grátis com cartão (spec 2026-10-03). */`
- `Testa 7 dias.<span className="hidden lg:inline"> Não gostou, devolvemos tudo.</span>` →
  `Testa 7 dias grátis.<span className="hidden lg:inline"> Cancelou antes, não paga nada.</span>`
- `<span className="lg:hidden"> Não gostou, devolvemos tudo. É lei.</span>` →
  `<span className="lg:hidden"> Cancelou antes, não paga nada.</span>`
- `É o direito de arrependimento do Código de Defesa do Consumidor. Depois, cancela na própria tela, sem multa.` →
  `Cadastra o cartão, usa tudo liberado, e a cobrança só começa no 8º dia. Depois, cancela na própria tela, sem multa.`
- `<b>PS:</b> são 7 dias pra desistir. Se não gostar, devolvemos tudo e os grupos continuam seus.` →
  `<b>PS:</b> são 7 dias grátis. Cancelou antes, não paga nada, e os grupos continuam seus.`

`lp-cartaz/cartaz-landing.tsx`:
- `mobile="7 dias pra desistir. Os grupos continuam seus."` → `mobile="7 dias grátis. Os grupos continuam seus."`
- `desktop="são 7 dias pra desistir. Se não gostar, devolvemos tudo, e os grupos continuam seus."` →
  `desktop="são 7 dias grátis. Cancelou antes, não paga nada, e os grupos continuam seus."`

`lp-cartaz/hero.tsx`:
- `{ Icone: Check, texto: "7 dias pra desistir" },` → `{ Icone: Check, texto: "7 dias grátis" },`

`lp-cartaz/plans.tsx`:
- `/** Etiqueta kraft "7 dias PRA DESISTIR. É LEI." — o direito de arrependimento do CDC. */` →
  `/** Etiqueta kraft "7 dias GRÁTIS PRA TESTAR." — o teste grátis com cartão. */`
- `PRA DESISTIR. É LEI.` → `GRÁTIS PRA TESTAR.`
- `<b>Não gostou? Devolvemos tudo.</b>{" "}` → `<b>Não gostou? Cancela e não paga nada.</b>{" "}`
- `mobile="Depois, cancela na própria tela, sem multa."` → `mobile="A cobrança só começa no 8º dia."`
- `desktop="Nos primeiros 7 dias você desiste e recebe tudo de volta: é o direito de arrependimento do Código de Defesa do Consumidor. Depois, cancela quando quiser, na própria tela de configurações. Sem multa, sem fidelidade, e os grupos e os contatos continuam seus."` →
  `desktop="Você cadastra o cartão e usa tudo liberado por 7 dias. A cobrança só começa no 8º dia, e a gente avisa antes por e-mail. Depois, cancela quando quiser, na própria tela de configurações. Sem multa, sem fidelidade, e os grupos e os contatos continuam seus."`

`lp-piloto/proof-plans.tsx`:
- `<b className="font-bold">Testa 7 dias. Não gostou, devolvemos tudo.</b> É o direito de arrependimento do` +
  linha seguinte `Código de Defesa do Consumidor, e a gente cumpre sem burocracia. Depois, cancela na própria tela, sem multa.` →
  `<b className="font-bold">Testa 7 dias grátis. Cancelou antes, não paga nada.</b> A cobrança só começa no` +
  `8º dia, e a gente avisa antes por e-mail. Depois, cancela na própria tela, sem multa.`

`lp3/landing-data.ts` (resposta de "E se eu não gostar?"):
- texto inteiro →
  `"Você testa 7 dias grátis: cadastra o cartão, usa tudo liberado, e se cancelar antes do 8º dia não paga nada — a gente avisa por e-mail antes da primeira cobrança. Depois disso você cancela quando quiser, sem multa e sem fidelidade, na própria tela de configurações: o acesso vale até o fim do período já pago. Os grupos e os contatos são seus de qualquer jeito.",`

`lp3/landing-desktop.tsx`:
- `Conecte seu WhatsApp em 2 minutos e veja a esteira trabalhar. Com 7 dias pra desistir.` →
  `Conecte seu WhatsApp em 2 minutos e veja a esteira trabalhar. Com 7 dias grátis.`

`lp3/landing-mobile.tsx`:
- `direito garantido por lei` → `teste sem compromisso`
- `7 dias pra desistir. Sem multa nunca.` → `7 dias grátis. Sem multa nunca.`
- `Conecte seu WhatsApp em 2 minutos. Desistiu em 7 dias, devolvemos tudo — e os grupos continuam seus.` →
  `Conecte seu WhatsApp em 2 minutos. Cancelou nos 7 dias, não paga nada — e os grupos continuam seus.`

`lp3/landing.tsx`:
- `7 dias pra desistir e receber tudo de volta · sem fidelidade` → `7 dias grátis · sem fidelidade`

`lp-piloto/closing.tsx` (duas linhas):
- `<b className="font-bold text-paper-0">PS:</b> se em 7 dias você não gostar, devolvemos tudo. Você não` +
  `arrisca nada pra ver a Girumo rodando nos seus grupos.` →
  `<b className="font-bold text-paper-0">PS:</b> são 7 dias grátis: cancelando antes, você não` +
  `paga nada pra ver a Girumo rodando nos seus grupos.`

`lp3/landing-data.ts` (resposta de "Como funciona o plano anual?"):
- texto inteiro →
  `"Você paga 1x ao ano e o mês sai até 40% mais barato — no Growth, R$ 197 em vez de R$ 297. Cancelamento sem multa; as regras do anual estão nos Termos de uso.",`

`lp-shared/lp-data.ts` — substituir o comentário e a função `respostaAnual` inteiros por:

```ts
/**
 * A resposta do anual herdada do LP3_FAQ tem preço digitado ("R$ 197 em vez de
 * R$ 297"). Aqui ela é refeita a partir de PLANS. A regra de devolução do anual
 * vive só nos Termos desde 03/10/2026: a landing não anuncia reembolso.
 */
function respostaAnual(): string {
  const plano = PLANS.find((p) => p.featured) ?? PLANS[0];
  return (
    `Você paga 1x ao ano e o mês sai até ${MAX_OFF}% mais barato — no ${plano.name}, R$ ${plano.annualPrice} em vez de R$ ${plano.price}. ` +
    "Cancelamento sem multa; as regras do anual estão nos Termos de uso."
  );
}
```

`lp-shared/lp-data.test.ts` — apagar a linha 13 (`const devolvido = ...`) e trocar a asserção da linha 16
(`assert.ok(anual[1].endsWith(\`voltam R$ ${devolvido}.\`), anual[1]);`) por:

```ts
  assert.ok(anual[1].endsWith("as regras do anual estão nos Termos de uso."), anual[1]);
  assert.doesNotMatch(anual[1], /devolv|voltam|reembols/i);
```

Run (de `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/lp-shared/lp-data.test.ts` → PASS.

- [ ] **Step 2: Varredura — nada de reembolso fora dos Termos**

```bash
git grep -niE "devolvemos|devolvido|voltam R|tudo de volta|pra desistir|reembols|arrependimento" -- apps/web/src ':!apps/web/src/app/termos/*' ':!*.test.*'
```

Expected: nenhuma linha de texto exibido (comentários de código que mencionem a decisão são aceitáveis).

- [ ] **Step 3: Visual** — capturar `/`, `/lp3`, `/automatico` e a LP de atacado em 390 px e 1440 px com
Playwright (o selo kraft "GRÁTIS PRA TESTAR." precisa caber na etiqueta).

- [ ] **Step 4: Commit, PR e merge**

```bash
git add apps/web/src/app/signup/page.tsx apps/web/src/components/lp-atacado apps/web/src/components/lp-cartaz apps/web/src/components/lp-piloto apps/web/src/components/lp3 apps/web/src/components/lp-shared/lp-data.ts apps/web/src/components/lp-shared/lp-data.test.ts
git commit -m "feat(lp): advertise 7-day free trial; refunds live only in the terms"
```

`verify-local.ps1` verde → push → `gh pr create` (com as capturas) → CI → `gh pr merge <N> --squash --delete-branch`.

---

### Task 17: Encerramento

- [ ] **Step 1: Quadro (`/admin/quadro`, prod)** — localizar o card:
  `select key, title, status from board_features where title ilike '%teste%' or title ilike '%trial%';`
  Se não existir, criar pela tela. Mover para `no_ar_nao_verificado` com o PR 1, e só para
  `no_ar_verificado` com a prova da Task 15 colhida na hora:
  `select public.move_card('<key>', 'no_ar_verificado', 'teste de 7 dias ativado e cobrado no Test Clock', 'PR #<N>');`

- [ ] **Step 2: Grafo** (PowerShell, raiz do repo):

```powershell
& tools\lightrag\.venv\Scripts\Activate.ps1
rag insert "decisão: teste grátis de 7 dias com cartão obrigatório nos 3 planos, cobrança automática no 8º dia; reverte o 'sem trial' de 27/08. Um teste por conta (organizations.trial_subscription_id) e por cartão (trial_card_fingerprint, índice único); cartão repetido é cancelado sem cobrar. Reembolso só nos Termos, arrependimento conta da 1ª cobrança. Spec docs/superpowers/specs/2026-10-03-trial-7-dias-cartao-design.md" --source decisao-2026-10-03
```

- [ ] **Step 3: Memória** — atualizar `trial-7-dias-cartao.md` com os PRs e o estado final.

- [ ] **Step 4: Relatório final** — "PRs que deixei abertos: …" (ou "nenhum").
