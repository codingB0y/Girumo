-- Quem consegue escrever em public.memberships e public.users sem ser o servidor.
-- Irmao de infra/tests/organizations-escrita-check.sql, com a tabela como coluna.
--
-- Roda nos DOIS bancos, antes e depois de 20261003160000_memberships_users_escrita_so_servidor:
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\memberships-users-escrita-check.sql
-- (supabase/.temp/ esta no .gitignore; o link nao suja o git.)
--
-- Existe porque o gate de drift nao enxerga nada disto: schema_signature() hasheia so
-- coluna e assinatura de funcao — policy, privilegio e trigger ficam de fora.
--
-- Esperado DEPOIS da migracao, nos dois bancos:
--   privilege  -> todas as linhas 'false'
--   column     -> nenhuma linha
--   policy     -> informativo (pode continuar existindo; sem privilegio ela nao abre nada).
--                 Papel {-} = PUBLIC; o comando vem como r/a/w/d (select/insert/update/delete).
--   trigger    -> informativo
with t(rel) as (values ('public.memberships'::regclass), ('public.users'::regclass))
select t.rel::text as tbl, 'policy' as kind,
       polname || ' ' || polcmd::text as name,
       polroles::regrole[]::text
         || ' using=' || coalesce(pg_get_expr(polqual, polrelid), '-')
         || ' check=' || coalesce(pg_get_expr(polwithcheck, polrelid), '-') as detail
  from t join pg_policy on polrelid = t.rel
union all
select t.rel::text, 'privilege', r.role || ' ' || p.priv,
       has_table_privilege(r.role, t.rel, p.priv)::text
  from t
 cross join (values ('anon'), ('authenticated')) r(role)
 cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
union all
-- Grant por coluna (ex.: um `grant update (name)` futuro) nao aparece em has_table_privilege.
select t.rel::text, 'column', r.role || ' ' || p.priv, a.attname
  from t
  join pg_attribute a on a.attrelid = t.rel
 cross join (values ('anon'), ('authenticated')) r(role)
 cross join (values ('INSERT'), ('UPDATE')) p(priv)
 where a.attnum > 0 and not a.attisdropped
   and has_column_privilege(r.role, t.rel, a.attname, p.priv)
union all
select t.rel::text, 'trigger', tgname, pg_get_triggerdef(pg_trigger.oid)
  from t join pg_trigger on tgrelid = t.rel
 where not tgisinternal
order by 1, 2, 3, 4;
