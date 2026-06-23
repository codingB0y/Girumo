# DB_SCHEMA

## Atual: store em arquivo (sem banco)
- `data/links.json` — `TrackedLink[]` (+ `clickCap?` = teto de cliques humanos). Ver API_CONTRACTS.
- `data/clicks.ndjson` — 1 clique/linha: `{ slug, ts, utmSource?, utmCampaign?, ref?, ua?, target? }`
  (`target` = JID do grupo p/ onde o link mestre roteou).
- `data/groups.json` — `Group[]` (+ `inviteUrl?` e `capacity` editáveis; preservados no sync da engine).
- `data/campanhas.json` — `Campanha[]` (+ `slug` = link mestre; + `autoGrow`/`growTemplate`/`growCounter` do auto-grow).
- `data/group-grow.json` — `GrowJob[]` (fila de criação automática de grupo; espelha o motor de disparo).

## Postgres (Prisma) — domínio CONTAS + BILLING (em implementação, fase híbrida)
Schema em `prisma/schema.prisma`. Client singleton em `src/lib/db.ts`. `Account` = tenant.
Stack: Prisma 6 + Postgres. `DATABASE_URL` no `.env` (não no `.env.local`). Migração ainda NÃO rodada
(depende de provisionar o Postgres — ver NEXT.md, gate de infra).
- **Account**(id, name, email@unique, passwordHash, status[ACTIVE|SUSPENDED|CANCELED], asaasCustomerId?, …) — login/cadastro; corte por atraso = SUSPENDED.
- **Plan**(id, code@unique, name, priceCents, interval[MONTHLY|YEARLY], active) — catálogo (Essencial/Growth/Performance, ver PRICING.md). Seed em `prisma/seed.ts`.
- **Subscription**(id, accountId, planId, status[ACTIVE|PAST_DUE|CANCELED|TRIALING], startedAt, currentPeriodEnd=vencimento do ciclo, canceledAt?, asaasSubscriptionId?).
- **Invoice**(id, accountId, subscriptionId?, amountCents, dueDate=vencimento, status[OPEN|PAID|OVERDUE|CANCELED], paidAt?, method[PIX|BOLETO|CARD|MANUAL]?, asaasPaymentId?, invoiceUrl?) — financeiro.

Regras: 1 migração por feature. Sem index prematuro. Sem polimorfismo.

## Ainda em file-store (migrar p/ Postgres em fatias futuras, com tenantId)
- O operacional (links/clicks/groups/campanhas/group-grow/leads/dispatch/…) segue em `data/*` por ora.
  A migração completa p/ Postgres + `accountId` (multi-tenant real) é fatia posterior ao billing.
