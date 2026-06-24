# Fase 8 - Checklist Producao

## Objetivo

Definir o checklist minimo para colocar o HUBFLOW em producao com ate 100 clientes ativos, sem overengineering e sem esconder bloqueadores criticos.

## Status Geral

```txt
Arquitetura alvo: definida
Auditoria: criada e atualizada
Refatoracao monorepo: iniciada
Banco Supabase/RLS: scripts criados
Stripe: fundacao criada
Engine: worker Supabase inicial criado
Deploy: artefatos criados
Producao: ainda nao liberada
```

## Bloqueadores P0

- Validar rotas substituidas de Prisma para Supabase em ambiente real.
- Validar autenticao real com Supabase Auth na UI em ambiente Supabase real.
- Aplicar migrations SQL no Supabase real.
- Validar RLS com pelo menos dois tenants reais de teste.
- Criar produtos/precos no Stripe e preencher envs.
- Testar Stripe webhook com assinatura real.
- Confirmar que `hubflow-engine/auth` nao esta rastreado no Git.
- Rotacionar/desconectar qualquer sessao WhatsApp que ja esteve versionada.
- Garantir que secrets reais nao estao no repositorio.

## Checklist GitHub

- Repositorio privado ou com secrets totalmente removidos.
- `.gitignore` cobrindo runtime data.
- `hubflow-engine/auth/` fora do indice Git.
- `apps/web/data/` e dados runtime legados fora do indice Git.
- Branch principal protegida.
- PR/review antes de deploy em producao.

## Checklist Vercel

- Projeto apontando para o repo correto.
- Build usando `vercel.json`.
- Variaveis configuradas:

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

- `SUPABASE_SERVICE_ROLE_KEY` nunca exposta ao client.
- Build final aprovado sem Prisma como dependencia operacional.
- `npm run verify:local` aprovado antes de deploy.
- `npm run scan:secrets` aprovado antes de push/deploy.
- `npm run verify:online -- -AppUrl "https://app.seudominio.com"` aprovado apos deploy Vercel.
- Landing, login, signup e recuperacao de senha abrindo no dominio final.
- Rotas API protegidas por Supabase Auth e tenant context.

## Checklist Supabase

- Projeto criado.
- Backups habilitados.
- SQL aplicado em ordem:

```txt
202606240001_base_schema.sql
202606240002_rls_policies.sql
202606240003_seed_plans.sql
202606240004_storage_policies.sql
202606240005_engine_rpc.sql
202606240006_membership_invites.sql
```

- RLS habilitado nas tabelas sensiveis.
- Teste de tenant A nao acessando tenant B.
- Bucket `uploads` privado.
- Policies de storage validadas.
- Service role usada apenas no backend/server/engine.

## Checklist Stripe

- Produtos criados:

```txt
Essencial
Growth
Performance Max
```

- Price IDs preenchidos.
- Webhook criado:

```txt
https://app.seudominio.com/api/billing/webhook
```

- Eventos habilitados:

```txt
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

- Checkout testado.
- Customer Portal testado.
- Cancelamento/downgrade testado.
- Bloqueio por plano validado com `assertPlanLimit`.

## Checklist Engine

- Deploy em VPS/Coolify.
- Variaveis configuradas:

```txt
PORT
APP_URL
ENGINE_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ENGINE_COMMAND_POLL_MS
ENGINE_COMMAND_BATCH_SIZE
ENGINE_STATE_FILE
```

- `/health` respondendo.
- `npm run verify:online -- -AppUrl "https://app.seudominio.com" -EngineUrl "https://engine.seudominio.com"` aprovado.
- Volumes persistentes configurados:

```txt
auth
sessions
state
```

- QR code validado.
- Reconnect validado.
- Comando `send_message` validado por `engine_commands`.
- Evento `message_sent` validado em `engine_events`.
- Logs por tenant validados.

## Checklist Multi-Tenant

- Todas as tabelas de dominio com `tenant_id`.
- Toda rota sensivel resolvendo tenant ativo.
- Owner/Admin/Operator testados.
- Operator sem acesso a billing.
- Tenant A nao lista dados do tenant B.
- Uploads separados por path do tenant.
- Commands/events sempre com `tenant_id` e `instance_id`.

## Checklist Observabilidade

- Tabela `logs` recebendo eventos criticos.
- Stripe webhook registrando eventos.
- Engine registrando erros em `engine_events`.
- Healthcheck da engine monitorado.
- Erros Next.js monitorados.
- Alertas para:
  - webhook Stripe falhando;
  - engine offline;
  - fila de comandos acumulando;
  - falha de RLS/testes de isolamento.

## Checklist Antes Do Primeiro Cliente Pago

- Executar o roteiro E2E online:

```txt
deploy/e2e/README.md
```

- Preencher e aprovar o Go/No-Go:

```txt
deploy/GO_NO_GO.md
```

- Testar registro completo.
- Testar convite de membro.
- Testar troca de plano.
- Testar bloqueio por limite.
- Testar upload privado.
- Testar envio WhatsApp por comando.
- Testar restart da engine mantendo sessao.
- Testar backup/restore basico do Supabase.
- Criar procedimento de suporte para desconectar/reconectar WhatsApp.

## Nao Liberar Producao Se

- Build volta a depender de `prisma generate`.
- Rotas multi-tenant consultam banco sem tenant context.
- `SUPABASE_SERVICE_ROLE_KEY` aparece em bundle client.
- RLS esta desativado em tabela sensivel.
- Webhook Stripe aceita request sem assinatura valida.
- Engine recebe comandos operacionais por endpoint publico sem escopo.
- Sessao Baileys ou dados de cliente aparecem no Git.
