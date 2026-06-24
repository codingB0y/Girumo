# HUBFLOW Supabase - Setup Online

Este guia cobre Supabase Postgres, Auth, Storage e RLS para rodar o HUBFLOW online.

## Criar Projeto

No Supabase:

1. Criar projeto.
2. Copiar `Project URL`.
3. Copiar `anon public key`.
4. Copiar `service_role key`.
5. Copiar connection string Postgres.

Esses valores alimentam Vercel, engine e scripts SQL.

## Aplicar SQL

Rodar na raiz do repo:

```powershell
npm run supabase:apply:ps -- -DatabaseUrl "postgresql://..."
```

Ordem:

```txt
infra/migrations/202606240001_base_schema.sql
infra/rls/202606240002_rls_policies.sql
infra/seeds/202606240003_seed_plans.sql
infra/rls/202606240004_storage_policies.sql
infra/migrations/202606240005_engine_rpc.sql
infra/migrations/202606240006_membership_invites.sql
```

Referencia curta:

```txt
deploy/supabase/apply-order.md
```

## Auth

Em Authentication -> URL Configuration:

```txt
Site URL: https://app.seudominio.com
```

Redirect URLs:

```txt
https://app.seudominio.com/login
https://app.seudominio.com/reset-password
```

Validar:

- signup cria usuario;
- login persiste sessao;
- reset password envia e-mail;
- link de recovery abre `/reset-password`.

## Storage

O SQL cria/atualiza bucket:

```txt
uploads
```

Regras:

- bucket privado;
- path de objeto: `<tenant_id>/<kind>/<file>`;
- metadata no banco: `uploads/<tenant_id>/<kind>/<file>`;
- membros do tenant podem ler/escrever;
- Owner/Admin podem deletar.

Validar no dashboard:

- bucket `uploads` existe;
- `public = false`;
- policies em `storage.objects` existem.

## RLS Smoke Check

1. Criar tenant A via signup no app.
2. Criar tenant B via signup no app.
3. Copiar os `auth.users.id` dos dois usuarios.
4. Abrir `infra/tests/rls-smoke-check.sql`.
5. Substituir `<AUTH_USER_ID_A>` e `<AUTH_USER_ID_B>`.
6. Executar no SQL Editor.

Resultado esperado:

- usuario A enxerga apenas tenant A;
- usuario B enxerga apenas tenant B;
- tabelas `memberships`, `organizations`, `users`, `subscriptions` respeitam isolamento.

## Healthcheck

Apos Vercel estar configurada:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com"
```

`/api/health` deve retornar:

```json
{ "service": "hubflow-web", "status": "ok" }
```

Se `checks.database` estiver `degraded`, revisar migrations/envs.

Se `checks.storage` estiver `degraded`, revisar bucket `uploads`.

Se `checks.planCount` for menor que 4, revisar seed de planos.

## Nao Fazer

- Nao expor `SUPABASE_SERVICE_ROLE_KEY` no client.
- Nao desativar RLS para resolver bug de permissao.
- Nao usar Prisma.
- Nao criar tabelas fora das migrations SQL.
