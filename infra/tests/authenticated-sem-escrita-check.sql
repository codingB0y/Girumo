-- authenticated escreve em algo de public? So leitura.
--
-- Roda nos DOIS bancos, antes e depois de 20261004120000_authenticated_sem_escrita_em_public:
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\authenticated-sem-escrita-check.sql
--
-- O gate de drift nao enxerga nada disto: schema_signature() hasheia coluna e assinatura
-- de funcao — privilegio, default privilege e corpo de funcao ficam de fora.
--
-- Esperado DEPOIS da migracao, nos dois bancos:
--   tabela   -> nenhuma linha (relacao de public com INSERT/UPDATE/DELETE/TRUNCATE)
--   coluna   -> nenhuma linha (grant por coluna sem o de tabela; um grant de proposito
--               aparece aqui e precisa estar documentado na migracao que o deu)
--   default  -> so supabase_admin (inalcancavel pela conexao de migracao); nunca postgres
--   trigger  -> revoga_authenticated=true, acl={postgres=X/postgres,service_role=X/postgres}
--   evento   -> ensure_anon_revoked O (habilitado)
-- Para provar que tabela NOVA nasce fechada: infra/tests/authenticated-sem-escrita-prova.sql
select 'tabela' as kind, c.relname::text as name,
       string_agg(p.priv, ',' order by p.priv) as detail
  from pg_class c
 cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
   and has_table_privilege('authenticated', c.oid, p.priv)
 group by c.relname
union all
select 'coluna', c.relname || '.' || a.attname, p.priv
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
 cross join (values ('INSERT'), ('UPDATE')) p(priv)
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')
   and has_column_privilege('authenticated', c.oid, a.attnum, p.priv)
   and not has_table_privilege('authenticated', c.oid, p.priv)
union all
select 'default', d.defaclrole::regrole::text,
       string_agg(x.privilege_type, ',' order by x.privilege_type)
  from pg_default_acl d
 cross join lateral aclexplode(d.defaclacl) x
 where d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
   and x.grantee = 'authenticated'::regrole::oid
   and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
 group by d.defaclrole
union all
select 'trigger', proname::text,
       'revoga_authenticated=' || (prosrc like '%from authenticated%')
         || ' acl=' || coalesce(proacl::text, 'null')
  from pg_proc
 where oid = 'public.anon_revoke_on_new_object()'::regprocedure
union all
select 'evento', evtname::text, evtenabled::text
  from pg_event_trigger
 where evtname = 'ensure_anon_revoked'
order by 1, 2;
