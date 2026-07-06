# HUBFLOW Supabase - Ordem De Aplicacao

Aplicar no banco Supabase real nesta ordem:

A fonte canônica, lida pelo script de aplicação, é
[`apply-order.txt`](./apply-order.txt). Não mantenha uma segunda lista manual.

A migration aditiva
[`202607050001_engine_command_leases.sql`](../../infra/migrations/202607050001_engine_command_leases.sql)
deve permanecer imediatamente depois do RPC base. Ela substitui as assinaturas sem
fencing antes que qualquer consumidor novo seja publicado.

Antes de aplicar essa migration, interromper todos os workers antigos da engine.
Somente publique e reinicie os workers novos depois que a migration concluir, pois a
assinatura de conclusão sem lease é removida durante a transação.

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
