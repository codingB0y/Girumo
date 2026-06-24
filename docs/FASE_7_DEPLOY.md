# Fase 7 - Deploy

## Objetivo Da Fase

Preparar os artefatos de deploy do HUBFLOW para GitHub, Vercel, Supabase, Stripe e VPS/Coolify, mantendo frontend/API separados da engine Baileys.

## Arquivos Criados

```txt
vercel.json
infra/scripts/apply-supabase-sql.ps1
infra/scripts/apply-supabase-sql.sh
infra/scripts/verify-local.ps1
infra/scripts/verify-online.ps1
infra/scripts/check-env-template.ps1
deploy/github/README.md
deploy/coolify/engine.docker-compose.yml
deploy/coolify/.env.example
deploy/coolify/README.md
deploy/vercel/.env.production.example
deploy/vercel/README.md
deploy/supabase/apply-order.md
deploy/supabase/README.md
deploy/stripe/setup.md
docs/FASE_7_DEPLOY.md
docs/DEPLOY_ONLINE_RUNBOOK.md
```

## Fluxo De Deploy

```txt
GitHub
  |
  v
Vercel - apps/web
  |
  v
Supabase - SQL/RLS/Storage
  |
  v
Stripe - Webhook para Vercel

VPS/Coolify
  |
  v
hubflow-engine - Docker
```

## Vercel

Configuracao criada em `vercel.json`:

```txt
installCommand: cd apps/web && npm install
buildCommand: cd apps/web && npm run build
outputDirectory: apps/web/.next
framework: nextjs
```

Variaveis obrigatorias no projeto Vercel:

```txt
NEXT_PUBLIC_APP_URL
AUTH_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_ESSENCIAL
STRIPE_PRICE_GROWTH
STRIPE_PRICE_PERFORMANCE_MAX
ENGINE_TOKEN
```

Observacao 2026-06-24: as rotas legadas Prisma foram substituidas por Supabase e o build final do app web passou. Ainda falta validar Supabase real, RLS e variaveis de producao.

## Supabase

Aplicar SQL em ordem:

```txt
infra/migrations/202606240001_base_schema.sql
infra/rls/202606240002_rls_policies.sql
infra/seeds/202606240003_seed_plans.sql
infra/rls/202606240004_storage_policies.sql
infra/migrations/202606240005_engine_rpc.sql
infra/migrations/202606240006_membership_invites.sql
```

Scripts:

```powershell
npm run verify:local
```

```powershell
npm run supabase:apply:ps -- -DatabaseUrl "postgresql://..."
```

```powershell
.\infra\scripts\apply-supabase-sql.ps1 -DatabaseUrl "postgresql://..."
```

```sh
./infra/scripts/apply-supabase-sql.sh 'postgresql://...'
```

## Stripe

Webhook alvo:

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

Depois de criar produtos/precos no Stripe, preencher:

```txt
STRIPE_PRICE_ESSENCIAL
STRIPE_PRICE_GROWTH
STRIPE_PRICE_PERFORMANCE_MAX
```

## Coolify/VPS

Arquivos:

```txt
hubflow-engine/Dockerfile
deploy/coolify/engine.docker-compose.yml
deploy/coolify/.env.example
```

Healthcheck:

```txt
GET http://engine-host:3001/health
```

Build local da imagem:

```txt
npm run engine:docker:build
```

Volumes:

```txt
hubflow_engine_auth
hubflow_engine_sessions
hubflow_engine_state
```

## Ordem Recomendada

1. Executar `npm run verify:local`.
2. Criar projeto Supabase.
3. Aplicar SQL.
4. Configurar Supabase Auth e Redirect URLs.
5. Criar produtos/precos no Stripe.
6. Configurar webhook Stripe para Vercel.
7. Configurar variaveis na Vercel.
8. Fazer deploy do app web.
9. Validar `/api/health`.
10. Configurar variaveis no Coolify.
11. Fazer deploy da engine.
12. Validar `/health` da engine.
13. Executar teste E2E minimo do `docs/DEPLOY_ONLINE_RUNBOOK.md`.

## Bloqueadores Antes De Producao

- Aplicar migrations no Supabase real.
- Rodar smoke check RLS com dois tenants reais.
- Testar webhook Stripe com assinatura real.
- Validar recuperacao de senha com redirect URL do Supabase.
- Migrar sessao Baileys para `sessions/<tenant_id>/<instance_id>`.
- Validar engine em VPS/Coolify com `/health` e comandos Supabase.
