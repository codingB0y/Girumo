# Fase 4 - Banco Supabase

## Objetivo Da Fase

Criar a base Supabase Postgres para o HUBFLOW multi-tenant, com tabelas obrigatorias, seeds dos planos finais e RLS como barreira real de isolamento.

Esta fase nao usa Prisma.

## Arquivos Criados

```txt
infra/
  migrations/
    202606240001_base_schema.sql
    202606240005_engine_rpc.sql
    202606240006_membership_invites.sql
  rls/
    202606240002_rls_policies.sql
    202606240004_storage_policies.sql
  seeds/
    202606240003_seed_plans.sql
  tests/
    rls-smoke-check.sql
```

## Decisoes

- `organizations.id` representa o tenant.
- `organizations.tenant_id` existe para cumprir a regra global do projeto e deve ser igual a `organizations.id`.
- `users` representa o perfil do usuario dentro de um tenant e referencia `auth.users`.
- `memberships` referencia `auth.users`, permitindo um mesmo usuario participar de mais de uma organizacao.
- `memberships.user_id` pode ser nulo em convites pendentes; ao aceitar, o usuario autenticado assume o convite.
- `plans` possui `tenant_id` por padrao do projeto, usando um tenant de sistema para catalogo global.
- Stripe atualiza `subscriptions`, e a aplicacao consulta `subscriptions` + `plans.limits` para entitlements.
- Commands/events da engine foram modelados no banco para permitir operar sem Redis inicialmente.

## Ordem De Aplicacao

1. `infra/migrations/202606240001_base_schema.sql`
2. `infra/rls/202606240002_rls_policies.sql`
3. `infra/seeds/202606240003_seed_plans.sql`
4. `infra/rls/202606240004_storage_policies.sql`
5. `infra/migrations/202606240005_engine_rpc.sql`
6. `infra/migrations/202606240006_membership_invites.sql`

## Smoke Check RLS

- `infra/tests/rls-smoke-check.sql`
- executar no Supabase SQL Editor apos criar dois usuarios de tenants diferentes;
- validar que cada `auth.uid()` simulado enxerga apenas os dados do proprio tenant.

## Criterios De Aceite

- Todas as tabelas obrigatorias possuem `id`, `tenant_id`, `created_at` e `updated_at`.
- RLS esta habilitado nas tabelas multi-tenant.
- Usuario so acessa tenants em que possui membership aceita.
- Owner/Admin possuem escrita operacional.
- Operator possui acesso operacional limitado, sem billing/memberships.
- Convites de membros podem ser criados como pendentes e depois aceitos pelo e-mail convidado.
- Planos `FREE`, `Essencial`, `Growth` e `Performance Max` existem no catalogo.
- Bucket privado `uploads` existe e isola objetos por primeiro segmento do path.
- Prisma nao e necessario para aplicar ou evoluir o schema.
- Smoke check de RLS executado antes de liberar producao.
