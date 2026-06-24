# Infra

Artefatos de infraestrutura e banco.

## Estrutura alvo

```txt
infra/
  migrations/
  rls/
  seeds/
  scripts/
```

As migrations Supabase/Postgres, policies RLS, seeds de planos e scripts operacionais devem viver aqui. Codigo de runtime nao deve ser colocado neste diretorio.

## Ordem atual de aplicacao

```txt
infra/migrations/202606240001_base_schema.sql
infra/rls/202606240002_rls_policies.sql
infra/seeds/202606240003_seed_plans.sql
infra/rls/202606240004_storage_policies.sql
infra/migrations/202606240005_engine_rpc.sql
```

Aplicar usando um contexto SQL privilegiado do Supabase. A aplicacao em runtime deve operar com Supabase Auth, RLS e, quando indispensavel no backend, service role restrita a rotas server-side.
