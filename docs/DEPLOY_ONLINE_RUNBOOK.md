# HUBFLOW - Runbook Para Rodar Online

Este runbook foca em colocar o HUBFLOW online com a arquitetura alvo:

```txt
GitHub
  -> Vercel (Next.js + API)
  -> Supabase (Postgres + Auth + Storage + RLS)
  -> Stripe (billing + webhooks)

VPS/Coolify
  -> hubflow-engine (Baileys + worker Supabase)
```

Nao usar Prisma. Nao criar uma nova pasta `engine/`. A engine oficial e `hubflow-engine`.

## Fase Online 0 - Preflight Do Repositorio

Objetivo: garantir que o repo esta limpo o suficiente para ir ao GitHub/Vercel.

Indice dos guias de deploy:

```txt
deploy/README.md
```

Executar:

```powershell
npm run verify:local
```

Validar:

- build do Next.js passa;
- TypeScript passa;
- JSONs principais parseiam;
- sintaxe da engine passa;
- `hubflow-engine/auth/` nao esta versionado;
- `apps/web/data/` nao esta versionado;
- nenhum segredo real foi commitado.

Resultado esperado:

```txt
Verificacao local concluida com sucesso.
```

Guia especifico:

```txt
deploy/github/README.md
```

## Fase Online 1 - Supabase

Objetivo: criar a base multi-tenant real.

1. Criar projeto Supabase.
2. Copiar `Project URL`, `anon key` e `service_role key`.
3. Obter a connection string Postgres.
4. Aplicar SQL:

```powershell
npm run supabase:apply:ps -- -DatabaseUrl "postgresql://..."
```

Ordem aplicada pelo script:

```txt
202606240001_base_schema.sql
202606240002_rls_policies.sql
202606240003_seed_plans.sql
202606240004_storage_policies.sql
202606240005_engine_rpc.sql
202606240006_membership_invites.sql
```

Depois:

- criar dois usuarios/tenants de teste;
- rodar `infra/tests/rls-smoke-check.sql`;
- confirmar que tenant A nao enxerga tenant B;
- confirmar bucket privado `uploads`.

Guia especifico:

```txt
deploy/supabase/README.md
```

## Fase Online 2 - Supabase Auth

Objetivo: deixar login, registro e recuperacao de senha funcionando online.

No Supabase Auth, configurar:

```txt
Site URL: https://app.seudominio.com
Redirect URLs:
https://app.seudominio.com/reset-password
https://app.seudominio.com/login
```

Validar:

- registro cria `auth.users`, `organizations`, `users`, `memberships` e assinatura FREE;
- login persiste sessao;
- recuperacao de senha envia e-mail;
- link de recovery abre `/reset-password`.

## Fase Online 3 - Stripe

Objetivo: ativar planos pagos.

Criar produtos/precos:

```txt
Essencial
Growth
Performance Max
```

Guia especifico:

```txt
deploy/stripe/setup.md
```

Salvar os Price IDs:

```txt
STRIPE_PRICE_ESSENCIAL=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_PERFORMANCE_MAX=price_...
```

Criar webhook:

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

Validar:

- checkout abre pela tela Configuracoes;
- webhook atualiza `subscriptions`;
- portal Stripe abre;
- cancelamento/downgrade reflete no banco.

## Fase Online 4 - Vercel

Objetivo: publicar frontend + API.

Conectar GitHub na Vercel usando o repo, mas configurar o app web como raiz do projeto.

Root Directory:

```txt
apps/web
```

O `apps/web/vercel.json` usa:

```txt
installCommand: npm install
buildCommand: npm run build
outputDirectory: .next
```

Desativar protecao de deploy para o ambiente publico:

```txt
Settings -> Deployment Protection
Vercel Authentication: Disabled
```

Se a protecao ficar ativa, `/api/health`, signup e webhook Stripe podem redirecionar para login da Vercel em vez de responder pelo HUBFLOW.

Configurar envs:

```txt
NEXT_PUBLIC_APP_URL=https://app.seudominio.com
AUTH_SECRET=<segredo-longo>
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=<supabase-url>
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
STRIPE_SECRET_KEY=<stripe-secret>
STRIPE_WEBHOOK_SECRET=<webhook-secret>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<publishable-key>
STRIPE_PRICE_ESSENCIAL=<price-id>
STRIPE_PRICE_GROWTH=<price-id>
STRIPE_PRICE_PERFORMANCE_MAX=<price-id>
ENGINE_TOKEN=<token-compartilhado-com-engine>
HUBFLOW_DATA_DIR=./data
```

Template:

```txt
deploy/vercel/.env.production.example
```

Guia especifico:

```txt
deploy/vercel/README.md
```

Validar apos deploy:

```txt
GET https://app.seudominio.com/api/health
```

Ou via script:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com"
```

O script tambem valida landing, login, signup e recuperacao de senha. Para validar apenas healthchecks:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com" -SkipPublicPages
```

Esperado:

```json
{ "service": "hubflow-web", "status": "ok" }
```

Se vier `degraded`, olhar `checks`:

- `checks.env`: variaveis obrigatorias ausentes;
- `checks.stripePrices`: Price IDs ausentes por plano pago;
- `checks.database`: falha de conexao/tabelas Supabase;
- `checks.planCount`: seed de planos ausente quando menor que 4;
- `checks.storage`: bucket privado `uploads` ausente ou publico.

Corrigir esses pontos antes de seguir para engine/cliente real.

## Fase Online 5 - Coolify/VPS Engine

Objetivo: publicar `hubflow-engine` separada do frontend.

No Coolify:

- criar app Docker Compose;
- usar `deploy/coolify/engine.docker-compose.yml`;
- configurar volumes persistentes;
- configurar envs:

```txt
ENGINE_PORT=3001
APP_URL=https://app.seudominio.com
ENGINE_TOKEN=<mesmo-token-da-vercel>
SUPABASE_URL=<supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ENGINE_COMMAND_POLL_MS=3000
ENGINE_COMMAND_BATCH_SIZE=5
ENGINE_STATE_FILE=engine-state.json
```

Template:

```txt
deploy/coolify/.env.example
```

Guia especifico:

```txt
deploy/coolify/README.md
```

Validar:

```txt
GET https://engine.seudominio.com/health
```

Ou validando app + engine:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com" -EngineUrl "https://engine.seudominio.com"
```

Esperado:

```json
{
  "ok": true,
  "service": "hubflow-engine"
}
```

## Fase Online 6 - Teste E2E Minimo

Guia detalhado:

```txt
deploy/e2e/README.md
```

Executar nesta ordem:

1. Criar conta nova no app online.
2. Confirmar tenant e assinatura FREE no Supabase.
3. Criar instancia WhatsApp em Configuracoes.
4. Subir engine no Coolify e validar `/health`.
5. Enviar `refresh_status` pela UI de instancias.
6. Confirmar `engine_commands`, `engine_events` e `instances.status`.
7. Fazer upload de midia e confirmar storage privado.
8. Criar convite de membro.
9. Fazer checkout Stripe em modo teste.
10. Confirmar `subscriptions` atualizada pelo webhook.
11. Confirmar eventos em Auditoria.

## Fase Online 7 - Go/No-Go

Checklist operacional:

```txt
deploy/GO_NO_GO.md
```

Liberar primeiro cliente pago somente se:

- `/api/health` esta `ok`;
- engine `/health` esta `ok`;
- RLS smoke check passou;
- webhook Stripe passou;
- recovery password passou;
- uploads privados passaram;
- engine nao depende de arquivos versionados;
- `hubflow-engine/auth/` esta fora do Git;
- secrets reais nao estao no repo.

Nao liberar se:

- qualquer rota sensivel opera sem tenant;
- service role aparece em client bundle;
- Stripe webhook aceita request sem assinatura;
- engine processa comando sem `tenant_id` e `instance_id`;
- sessao WhatsApp real esta versionada.
