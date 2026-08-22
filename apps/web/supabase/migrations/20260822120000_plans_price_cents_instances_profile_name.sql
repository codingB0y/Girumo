-- ============================================================
-- plans.price_cents + instances.profile_name: repõe em PROD duas colunas
-- que só existiam em DEV.
--
-- Drift no sentido contrário do usual: dev estava À FRENTE de prod, então
-- tudo passava localmente e quebrava só em produção. Em prod (22/08/2026):
--   select price_cents  from plans     -> 42703 column does not exist
--   select profile_name from instances -> 42703 column does not exist
--
-- As telas admin que leem essas colunas descartam o `error` do PostgREST
-- (`const { data } = await ...`), então `data` vira null e a página renderiza
-- o estado VAZIO — sem 500, sem log, sem alerta:
--   /admin/instancias  -> "Nenhuma instância encontrada" com 6 no banco
--   /admin/billing     -> coluna de plano em "—" e MRR somando 0
--   /admin/tenants/[id] -> idem, nas duas seções
--
-- A forma replica exatamente o que dev já tinha, pra não criar drift novo:
--   plans.price_cents      integer, nullable, default 0
--   instances.profile_name text,    nullable, sem default
--
-- Backfill de preço: as 4 linhas de prod nasceriam com 0, e um MRR de
-- R$ 0,00 calculado sobre preço zerado mente igual à query quebrada — só
-- que sem erro pra culpar. Os valores conferem com pricing.tsx e com o
-- seed, e foram confirmados pelo Igor em 22/08. O `and coalesce(...) = 0`
-- garante que rodar de novo não sobrescreve preço alterado depois.
--
-- Idempotente nas duas partes.
-- ============================================================

alter table public.plans     add column if not exists price_cents  integer default 0;
alter table public.instances add column if not exists profile_name text;

update public.plans set price_cents = 0     where code = 'FREE'            and coalesce(price_cents, 0) = 0;
update public.plans set price_cents = 19700 where code = 'ESSENCIAL'       and coalesce(price_cents, 0) = 0;
update public.plans set price_cents = 29700 where code = 'GROWTH'          and coalesce(price_cents, 0) = 0;
update public.plans set price_cents = 49700 where code = 'PERFORMANCE_MAX' and coalesce(price_cents, 0) = 0;
