-- A.2 da auditoria de 22/08/2026 — fecha a superficie de privilegio do papel `anon`.
--
-- CORRECAO DE PREMISSA: a auditoria afirmou que o RLS era "inerte". Nao e. Em
-- prod, 99 policies em 34 tabelas usam auth.uid() + memberships (via
-- app.has_membership / app.user_tenant_ids / app.has_role) e funcionam. Por isso
-- esta migracao NAO mexe em `authenticated`: e la que essas policies vivem, e
-- revogar o grant transformaria as 99 em codigo morto.
--
-- O que a auditoria subestimou: `anon` nao tinha so SELECT. Tinha os SETE
-- privilegios (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) em
-- TODAS as tabelas de public — 65 em prod, 53 em dev. E o default do Supabase.
--
-- Por que fechar mesmo com RLS ligado nas 65: a chave `anon` esta no browser de
-- qualquer visitante, e o app nao tem NENHUM caminho de dado por ela (os dois
-- usos de getSupabaseServerAnon/getSupabaseAnonForToken chamam so .auth.*, e as
-- rotas publicas /p/[slug] e /r/[slug] leem via getSupabaseAdmin no servidor).
-- Hoje o unico anteparo sao as policies; tres delas ja sao permissivas para
-- qualquer um (landing_page_templates `using (true)`, plans `active = true`,
-- testimonials `approved = true`). Uma policy nova escrita sem cuidado vira
-- leitura publica na hora, e TRUNCATE nao e filtrado por RLS.
--
-- Aplicar nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).

-- 1) Privilegios que ja existem.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Em dev isto tambem tira o EXECUTE de anon em confirm_lp_capture e
-- record_lp_tracking_event — que e exatamente o B.4 (drift de GRANT entre os
-- bancos). As duas sao chamadas com getSupabaseAdmin em lib/pages/store.ts:244 e
-- :304, entao anon nunca precisou delas; prod ja estava no lado certo.
revoke all on all functions in schema public from anon;

-- Revogar de `anon` NAO basta para funcao: o ACL delas comeca com `=X/postgres`,
-- que e EXECUTE para PUBLIC, e anon executa herdando dai. Medido em dev depois
-- do revoke acima: anon continuava com 4 funcoes executaveis.
--
-- E cirurgico: sao exatamente 4 funcoes com EXECUTE para PUBLIC em cada banco, e
-- nenhuma funcao de public tem ACL nula. As 4 ja tem grant EXPLICITO para
-- authenticated e service_role, entao tirar de PUBLIC nao muda nada para eles.
revoke execute on all functions in schema public from public;

-- USAGE no schema fica: sem privilegio de objeto ele nao concede nada, e o
-- PostgREST usa o schema para introspeccao. Revogar aqui e risco sem ganho.

-- 2) Privilegios FUTUROS. Sem este bloco a proxima tabela criada nasce com os
-- sete privilegios para anon de novo, e a correcao dura ate a proxima migracao.
do $$
begin
  alter default privileges in schema public revoke all on tables from anon;
  alter default privileges in schema public revoke all on sequences from anon;
  alter default privileges in schema public revoke all on functions from anon;
exception when others then
  raise log 'anon_sem_privilegio: default privileges do papel corrente nao alterados: %', sqlerrm;
end
$$;

-- O Supabase registra defaults por DOIS concessores: postgres e supabase_admin.
-- O bloco acima resolve os de postgres. Os de supabase_admin sao INALCANCAVEIS
-- daqui — medido em dev: `current_user` = postgres e
-- `pg_has_role(current_user,'supabase_admin','MEMBER')` = false. A tentativa fica
-- registrada porque o dia em que a conexao tiver a permissao ela passa a valer;
-- ate la, quem segura e o event trigger do item (3).
do $$
begin
  alter default privileges for role supabase_admin in schema public revoke all on tables from anon;
  alter default privileges for role supabase_admin in schema public revoke all on sequences from anon;
  alter default privileges for role supabase_admin in schema public revoke all on functions from anon;
exception when others then
  raise log 'anon_sem_privilegio: default privileges de supabase_admin nao alterados: %', sqlerrm;
end
$$;

-- 3) Rede de seguranca em DDL, no mesmo padrao do event trigger `ensure_rls` que
-- ja existe nos dois bancos. E ela que segura de fato, porque os defaults de
-- supabase_admin nao podem ser alterados daqui (ver item 2).
--
-- Funcao separada em vez de estender rls_auto_enable() porque o nome daquela
-- descreve o que ela faz, e "ligar RLS" nao e "revogar anon".
-- Nome anterior desta funcao, que chegou a existir em dev durante a construcao
-- deste PR. Sem o drop os dois bancos divergiriam e o gate de drift reprovaria —
-- corretamente.
drop event trigger if exists ensure_anon_revoked;
drop function if exists public.anon_revoke_on_new_table();

create or replace function public.anon_revoke_on_new_object()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where schema_name = 'public'
  loop
    begin
      if cmd.object_type in ('table', 'partitioned table') then
        execute format('revoke all on table %s from anon', cmd.object_identity);

      elsif cmd.object_type = 'sequence' then
        execute format('revoke all on sequence %s from anon', cmd.object_identity);

      elsif cmd.object_type in ('function', 'procedure') then
        -- PUBLIC junto: sem isso anon executa por heranca, que foi exatamente o
        -- furo que este arquivo corrige. E o grant para service_role vem em
        -- seguida porque, sem ele, funcao criada por uma migracao que esqueca o
        -- grant explicito ficaria inexecutavel para o app.
        execute format('revoke execute on %s %s from anon, public', cmd.object_type, cmd.object_identity);
        execute format('grant execute on %s %s to service_role', cmd.object_type, cmd.object_identity);

      else
        continue;
      end if;

      raise log 'anon_revoke_on_new_object: hardened % %', cmd.object_type, cmd.object_identity;
    exception when others then
      -- Nunca derrubar a DDL do desenvolvedor por causa do hardening; o gate de
      -- CI (npm run check:drift) pega o objeto que escapou.
      raise log 'anon_revoke_on_new_object: failed on %: %', cmd.object_identity, sqlerrm;
    end;
  end loop;
end;
$$;

drop event trigger if exists ensure_anon_revoked;
create event trigger ensure_anon_revoked
  on ddl_command_end
  execute function public.anon_revoke_on_new_object();

comment on function public.anon_revoke_on_new_object() is
  'Event trigger: revoga privilegio de anon (e EXECUTE de PUBLIC) em objeto novo de public. A.2 da auditoria de 22/08/2026.';
