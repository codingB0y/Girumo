# HUBFLOW Supabase - Ordem De Aplicacao

Aplicar no banco Supabase real nesta ordem:

A fonte canônica, lida pelo script de aplicação, é
[`apply-order.txt`](./apply-order.txt). Não mantenha uma segunda lista manual.

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
