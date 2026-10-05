-- Quem consegue escrever nas tabelas de tenant de public sem ser o servidor.
-- Generaliza infra/tests/memberships-users-escrita-check.sql: uma linha por tabela, com
-- `ok` explicito. Para conferir outra tabela, so acrescentar o nome em t(name).
--
-- Roda nos DOIS bancos, antes e depois de 20261003170000_tabelas_tenant_escrita_so_servidor:
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\tenant-tables-escrita-check.sql
-- (supabase/.temp/ esta no .gitignore; o link nao suja o git.)
--
-- Existe porque o gate de drift nao enxerga nada disto: schema_signature() hasheia so
-- coluna e assinatura de funcao — policy e privilegio ficam de fora.
--
-- Colunas:
--   table_privs     privilegio de TABELA de escrita que anon/authenticated ainda tem
--   column_privs    grant por COLUNA sem o de tabela (ex.: um `grant update (name)` futuro,
--                   que has_table_privilege nao mostra)
--   write_policies  informativo: policies de insert/update/delete/all. Sem privilegio elas
--                   nao abrem nada.
--
-- ANTES da migracao: ok=false, table_privs 'authenticated:INSERT,UPDATE,DELETE,TRUNCATE'.
--   Linha 'MISSING' = a tabela nao existe neste banco; a migracao vai falhar inteira
--   (um revoke so). Resolver o drift antes de aplicar.
-- DEPOIS, nos dois bancos: toda linha ok=true (column_privs pode listar um grant por coluna
--   que alguem tenha dado de proposito — ai ok=false ate tirar a tabela da lista).
with t(name) as (values
  ('agent_configs'), ('broadcasts'), ('campaign_groups'), ('campaign_messages'), ('campaigns'),
  ('custom_domains'),
  ('celebrations'), ('contacts'), ('flash_offer_claims'), ('flash_offer_entries'),
  ('flash_offer_groups'), ('flash_offers'), ('funnels'), ('group_bulk_jobs'),
  ('group_participants'), ('groups'), ('instances'), ('landing_pages'), ('logs'), ('messages'),
  ('orders'), ('playbook_progress'), ('schedules'), ('template_folders'), ('templates'),
  ('tenant_settings'), ('testimonials'), ('tracked_links'), ('uploads')
), r as (
  select t.name, to_regclass('public.' || t.name) as rel from t
), x as (
  select r.name, r.rel,
         (select string_agg(ro.role || ':' || p.privs, ' ' order by ro.role)
            from (values ('anon'), ('authenticated')) ro(role)
           cross join lateral (
             select string_agg(pr.priv, ',' order by pr.ord) as privs
               from (values (1, 'INSERT'), (2, 'UPDATE'), (3, 'DELETE'), (4, 'TRUNCATE')) pr(ord, priv)
              where has_table_privilege(ro.role, r.rel, pr.priv)) p
           where p.privs is not null) as table_privs,
         (select string_agg(ro.role || ':' || pr.priv || '(' || a.attname || ')', ' ')
            from pg_attribute a
           cross join (values ('anon'), ('authenticated')) ro(role)
           cross join (values ('INSERT'), ('UPDATE')) pr(priv)
           where a.attrelid = r.rel and a.attnum > 0 and not a.attisdropped
             and has_column_privilege(ro.role, r.rel, a.attname, pr.priv)
             and not has_table_privilege(ro.role, r.rel, pr.priv)) as column_privs,
         (select count(*) from pg_policy
           where polrelid = r.rel and polcmd in ('a', 'w', 'd', '*')) as write_policies
    from r
)
select name as tbl,
       case when rel is null then 'MISSING'
            else (table_privs is null and column_privs is null)::text end as ok,
       coalesce(table_privs, '') as table_privs,
       coalesce(column_privs, '') as column_privs,
       write_policies
  from x
 order by (rel is not null and table_privs is null and column_privs is null), 1;
