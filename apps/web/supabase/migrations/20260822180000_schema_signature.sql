-- Assinatura de schema, consumida pelo gate de drift dev x prod
-- (infra/scripts/check-schema-drift.ts).
--
-- Por que uma funcao em vez de o script ler information_schema direto: o unico
-- caminho que o CI tem para dentro de um banco Supabase e o PostgREST, e o
-- PostgREST nao expoe information_schema nem pg_catalog. Sem esta RPC o gate
-- precisaria de conexao Postgres direta (senha do banco) ou de um personal
-- access token da Management API — as duas alternativas dao MAIS acesso do que
-- ler nomes de coluna.
--
-- Esta funcao e a unica fonte da consulta de assinatura. Nao existe copia dela
-- em outro arquivo de proposito: um detector de drift que pode divergir de si
-- mesmo nao serve para nada.
--
-- Aplicar nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).

create or replace function public.schema_signature()
returns table (kind text, nome text, sig text)
language sql
stable
security definer
-- `set search_path` obrigatorio em security definer: sem isso um schema no
-- caminho do chamador pode sombrear pg_catalog e trocar o que a funcao le.
set search_path = pg_catalog, public
as $$
  -- Tabelas: nome + md5 da lista de colunas com o tipo formatado.
  -- `format_type` em vez de information_schema.data_type porque distingue
  -- varchar(120) de varchar(255) e numeric(10,2) de numeric — drift de precisao
  -- quebra insert do mesmo jeito que coluna faltando.
  select 't'::text,
         c.relname::text,
         md5(string_agg(
           a.attname || ':' || format_type(a.atttypid, a.atttypmod),
           ',' order by a.attname
         ))
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'public'
    and c.relkind = 'r'
    and a.attnum > 0
    and not a.attisdropped
  group by c.relname

  union all

  -- Funcoes: a chave inclui os argumentos porque overload e legitimo — duas
  -- `record_send` com assinaturas diferentes sao dois objetos, nao um conflito.
  -- No sig entram tambem prosecdef e provolatile: uma funcao que vira
  -- SECURITY DEFINER num banco so e drift, e e drift de seguranca.
  select 'f'::text,
         (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text,
         md5(
           pg_get_function_result(p.oid)
           || '|secdef=' || p.prosecdef::text
           || '|vol=' || p.provolatile::text
         )
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
$$;

-- Superficie minima: quem chama e o gate, que roda com a service-role. anon e
-- authenticated nao tem motivo para enumerar o schema, e deixar EXECUTE aberto
-- numa SECURITY DEFINER e exatamente o que o advisor
-- `anon_security_definer_function_executable` acusa.
revoke execute on function public.schema_signature() from public;
revoke execute on function public.schema_signature() from anon;
revoke execute on function public.schema_signature() from authenticated;
grant execute on function public.schema_signature() to service_role;

comment on function public.schema_signature() is
  'Assinatura md5 de tabelas e funcoes do schema public. Consumida pelo gate de drift dev x prod (infra/scripts/check-schema-drift.ts).';
