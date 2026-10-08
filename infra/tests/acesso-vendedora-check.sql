-- Conferência do PR 2 do acesso da vendedora (migrações 20261007120000 e 20261007120100), nos
-- DOIS bancos, depois de aplicar:
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\acesso-vendedora-check.sql
--
-- Existe porque o gate de drift não enxerga nada disto: schema_signature() hasheia só nome e tipo
-- de coluna e resultado/secdef/volatilidade de função. Valor de enum, CHECK, índice, policy,
-- privilégio e corpo de função ficam de fora.
--
-- Esperado nos dois bancos: todo ok_* = true; "helpers_def_md5" e "assinatura" (6 chaves) IGUAIS
-- nos dois. "assinatura_total" de prod é a prova da baseline (deploy/supabase/schema-baseline.json).
-- Erro "relation public.order_items does not exist" = a migração 20261007120100 não foi aplicada.
select json_build_object(
  'ok_enum_seller', exists (
    select 1 from pg_enum
    where enumtypid = 'public.member_role'::regtype and enumlabel = 'seller'),
  -- Helpers de leitura do RLS: excluem seller, continuam security definer e chamáveis por
  -- authenticated (sem isso toda policy que os usa nega tudo para todo mundo).
  'ok_helpers_sem_seller', (
    select bool_and(
      p.oid is not null
      and p.prosecdef
      and p.prosrc like '%<> ''seller''%'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    from (values ('app.user_tenant_ids()'), ('app.has_membership(uuid)')) as h(sig)
    left join pg_proc p on p.oid = to_regprocedure(h.sig)),
  'helpers_def_md5', (
    select json_object_agg(h.sig, md5(pg_get_functiondef(p.oid)) order by h.sig)
    from (values ('app.user_tenant_ids()'), ('app.has_membership(uuid)')) as h(sig)
    join pg_proc p on p.oid = to_regprocedure(h.sig)),
  'helpers_execute', (
    select json_object_agg(h.sig, (
      select json_agg(g order by g) from (
        select case when a.grantee = 0 then 'public' else a.grantee::regrole::text end as g
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
        where a.privilege_type = 'EXECUTE') as x) order by h.sig)
    from (values ('app.user_tenant_ids()'), ('app.has_membership(uuid)')) as h(sig)
    join pg_proc p on p.oid = to_regprocedure(h.sig)),
  'ok_modules', exists (
    select 1 from pg_attribute
    where attrelid = 'public.memberships'::regclass and attname = 'modules' and not attisdropped
      and format_type(atttypid, atttypmod) = 'text[]' and attnotnull),
  'ok_modules_check', exists (
    select 1 from pg_constraint
    where conrelid = 'public.memberships'::regclass and conname = 'memberships_modules_validos'
      and contype = 'c' and convalidated),
  'modules_check', (
    select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.memberships'::regclass and conname = 'memberships_modules_validos'),
  'ok_created_by', exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
  'ok_indices', to_regclass('public.orders_tenant_created_by_idx') is not null
    and to_regclass('public.order_items_order_idx') is not null,
  'ok_rls_order_items', (select relrowsecurity from pg_class where oid = 'public.order_items'::regclass),
  'policies_order_items', (
    select json_agg(polname || ' ' || polcmd::text || ': ' || coalesce(pg_get_expr(polqual, polrelid), '-'))
    from pg_policy where polrelid = 'public.order_items'::regclass),
  'policies_orders', (
    select json_agg(polname || ' ' || polcmd::text || ': ' || coalesce(pg_get_expr(polqual, polrelid), '-'))
    from pg_policy where polrelid = 'public.orders'::regclass),
  'ok_order_items_so_servidor_escreve',
    not has_table_privilege('anon', 'public.order_items', 'SELECT')
    and not has_table_privilege('authenticated', 'public.order_items', 'INSERT')
    and not has_table_privilege('authenticated', 'public.order_items', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.order_items', 'DELETE')
    and not has_table_privilege('authenticated', 'public.order_items', 'TRUNCATE')
    and has_table_privilege('service_role', 'public.order_items', 'INSERT')
    and has_table_privilege('service_role', 'public.order_items', 'DELETE'),
  'ok_order_items_leitura_authenticated', has_table_privilege('authenticated', 'public.order_items', 'SELECT'),
  'checks_order_items', (
    select json_agg(pg_get_constraintdef(oid) order by conname)
    from pg_constraint where conrelid = 'public.order_items'::regclass and contype = 'c'),
  'ok_rpcs', (
    select bool_and(
      p.oid is not null
      and not p.prosecdef
      and p.proconfig = array['search_path=""']
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and has_function_privilege('service_role', p.oid, 'EXECUTE'))
    from (values
      ('public.create_order_with_items(uuid,uuid,uuid,text,text,uuid,jsonb)'),
      ('public.replace_order_items(uuid,uuid,jsonb,uuid)'),
      ('public.order_items_total(jsonb)')) as f(sig)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)),
  'rpcs', (
    select json_agg(json_build_object(
      'sig', f.sig,
      'existe', p.oid is not null,
      'definer', p.prosecdef,
      'config', p.proconfig,
      'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE')))
    from (values
      ('public.create_order_with_items(uuid,uuid,uuid,text,text,uuid,jsonb)'),
      ('public.replace_order_items(uuid,uuid,jsonb,uuid)'),
      ('public.order_items_total(jsonb)')) as f(sig)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)),
  'assinatura', (
    select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C")
    from public.schema_signature()
    where nome in ('memberships', 'orders', 'order_items')
       or nome like 'create_order_with_items(%'
       or nome like 'replace_order_items(%'
       or nome like 'order_items_total(%'),
  'assinatura_total', (
    select json_build_object(
      'objetos', count(*),
      'md5', md5(string_agg(chave || '=' || sig, ',' order by chave collate "C")))
    from (select kind || '|' || nome as chave, sig from public.schema_signature()) as s)
) as r;
