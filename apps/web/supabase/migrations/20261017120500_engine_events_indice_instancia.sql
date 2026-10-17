-- Índice de public.engine_events por número (instance_id, created_at desc).
--
-- app.instance_health devolve, por número, o último evento recebido:
--   (select max(e.created_at) from public.engine_events e where e.instance_id = i.id)
-- e engine_events não tinha índice que começasse por instance_id (só (id), (event_id),
-- (status, created_at) e (tenant_id, type, created_at desc)). Cada número custava um Seq Scan da
-- tabela inteira, que só cresce (nada apaga: ~58 mil linhas e 54 MB em prod em 17/10/2026).
-- A RPC roda ao abrir a tela Conectar e a cada 30 s com ela visível (numero-saude-vitrine.tsx) e,
-- por loja, no cron de e-mails (Job 6 de /api/cron/emails). Medido em prod em 16/10/2026
-- (pg_stat_statements): média 174 ms, pico 4,8 s; o resto da RPC soma ~3 ms por número.
--
-- Plano de hoje (prod, explain generic_plan da subquery): Seq Scan, custo ~6047. O índice
-- (tenant_id, type, created_at desc), do mesmo formato, já faz o max(created_at) do filtro
-- tenant_id + type virar Limit + Index Only Scan (custo 0,66): é o caminho que este índice abre
-- para instance_id.
--
-- Sem CONCURRENTLY: infra/scripts/apply-migrations.ts manda o arquivo inteiro numa chamada
-- (transação implícita), onde CREATE INDEX CONCURRENTLY não roda. Com ~58 mil linhas o build
-- segura escrita em engine_events por fração de segundo (o webhook da Evolution insere ali).
--
-- Só o índice: não apaga nem muda o que é gravado (retenção de engine_events é outra decisão).
-- Não muda a baseline: o gate de drift não vê índice — conferir com
-- infra/tests/engine-events-indice-instancia-check.sql nos DOIS bancos
-- (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).
--
-- Idempotente.

-- Se estourar o timeout (webhook ou worker segurando engine_events), é só rodar de novo.
set lock_timeout = '5s';

create index if not exists engine_events_instance_created_idx
  on public.engine_events (instance_id, created_at desc);
