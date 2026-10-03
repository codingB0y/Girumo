-- Quem consegue escrever em public.organizations sem ser o servidor.
--
-- Roda nos DOIS bancos, antes e depois de 20261003150000_organizations_escrita_so_servidor:
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\organizations-escrita-check.sql
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
--   trigger    -> informativo (guard_trial_columns aparece se o PR do teste gratis ja entrou)
select 'policy' as kind,
       polname || ' ' || polcmd::text as name,
       polroles::regrole[]::text
         || ' using=' || coalesce(pg_get_expr(polqual, polrelid), '-')
         || ' check=' || coalesce(pg_get_expr(polwithcheck, polrelid), '-') as detail
  from pg_policy
 where polrelid = 'public.organizations'::regclass
union all
select 'privilege', r.role || ' ' || p.priv,
       has_table_privilege(r.role, 'public.organizations', p.priv)::text
  from (values ('anon'), ('authenticated')) r(role)
 cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
union all
-- Grant por coluna (ex.: um `grant update (name)` futuro) nao aparece em has_table_privilege.
select 'column', r.role || ' ' || p.priv, a.attname
  from pg_attribute a
 cross join (values ('anon'), ('authenticated')) r(role)
 cross join (values ('INSERT'), ('UPDATE')) p(priv)
 where a.attrelid = 'public.organizations'::regclass
   and a.attnum > 0 and not a.attisdropped
   and has_column_privilege(r.role, 'public.organizations', a.attname, p.priv)
union all
select 'trigger', tgname, pg_get_triggerdef(oid)
  from pg_trigger
 where tgrelid = 'public.organizations'::regclass and not tgisinternal
order by 1, 2, 3;
