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

A migration confirma explicitamente os tipos, defaults e nullability das colunas
de lease. Qualquer drift de schema interrompe a aplicação em vez de ser ocultado
por `IF NOT EXISTS`.

Os dois `CHECK` novos são criados como `NOT VALID`: novas escritas já são
protegidas, mas a validação do histórico fica para uma janela operacional posterior,
com os workers ainda parados:

```sql
alter table public.engine_commands
  validate constraint engine_commands_attempt_count_nonnegative;
alter table public.engine_commands
  validate constraint engine_commands_max_attempts_positive;
```

O índice parcial é recriado por `DROP INDEX CONCURRENTLY` e
`CREATE INDEX CONCURRENTLY` depois do commit da parte transacional. Isso reduz
bloqueios de escrita e remove eventual índice `INVALID` deixado por uma tentativa
interrompida. Se apenas essa etapa falhar, rerode a migration; com os workers
parados, a pequena janela sem o índice não afeta o processamento.

Emergência (reverter `202607050001` depois de aplicada): use
[`infra/migrations/202607050001_engine_command_leases_rollback.sql`](../../infra/migrations/202607050001_engine_command_leases_rollback.sql)
— manual, NÃO faz parte de `apply-order.txt`. É destrutivo (perde estado de lease
em voo, não desfaz o backfill de comandos `uncertain`) e precisa do mesmo
procedimento de workers parados: pare os workers novos antes de rodar o rollback,
só suba os workers antigos depois que ele concluir.

Smoke tests pós-aplicação (RPC real, transacionais — `begin`/`rollback`, nada
persiste):
[`infra/tests/engine-command-leases-smoke-prod-safe.sql`](../../infra/tests/engine-command-leases-smoke-prod-safe.sql)
é seguro rodar em produção mesmo com workers ativos (não toca a fila
compartilhada). O smoke completo,
[`infra/tests/engine-command-leases-smoke.sql`](../../infra/tests/engine-command-leases-smoke.sql)
(exercita `claim_engine_commands`, incluindo recuperação de lease expirado), só
deve rodar com os workers parados ou em dev/staging.

✅ Reconciliado com `engine_queue_v2` (achado + fix documentados em
`finding-painel-heartbeat-false-disconnect` na memória do projeto):
`engine_commands` em produção já tem colunas de
`apps/web/supabase/migrations/20260713120000_engine_queue_v2.sql` (`attempts`,
`priority`, `dedupe_key`, `max_attempts` default 5, `lease_expires_at`). O
único choque real era `max_attempts` (5 em prod vs. 3 esperado pelo
drift-check) — a migração agora pina o default em 5, funciona igual com ou
sem `engine_queue_v2` já aplicado. `attempts`/`priority`/`dedupe_key` ficam
dormentes (nada no código grava valor não-default hoje) e não são tocadas.
`app.requeue_expired_commands()`/`public.requeue_expired_commands()` (sem
nenhum caller) são dropadas — a recuperação de lease expirado passa a viver
dentro do próprio `claim_engine_commands`. O rollback restaura para o estado
`engine_queue_v2`, não para o estado anterior a ele.

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
