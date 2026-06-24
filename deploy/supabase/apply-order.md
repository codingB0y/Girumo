# HUBFLOW Supabase - Ordem De Aplicacao

Aplicar no banco Supabase real nesta ordem:

```txt
infra/migrations/202606240001_base_schema.sql
infra/rls/202606240002_rls_policies.sql
infra/seeds/202606240003_seed_plans.sql
infra/rls/202606240004_storage_policies.sql
infra/migrations/202606240005_engine_rpc.sql
infra/migrations/202606240006_membership_invites.sql
```

Via script:

```powershell
npm run supabase:apply:ps -- -DatabaseUrl "postgresql://..."
```

Depois de aplicar:

1. Criar dois usuarios de teste.
2. Criar dois tenants de teste via signup.
3. Rodar `infra/tests/rls-smoke-check.sql` no SQL Editor.
4. Validar que cada usuario enxerga somente o proprio tenant.
5. Confirmar bucket `uploads` como privado.
