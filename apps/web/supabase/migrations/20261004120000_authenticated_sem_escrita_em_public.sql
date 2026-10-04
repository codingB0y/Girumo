-- authenticated nao escreve em public — nem nas tabelas que ja existem, nem nas que vierem.
--
-- #364, #365 e #366 (03-04/10/2026) revogaram escrita de `authenticated` em 31 tabelas
-- uma a uma, porque policy de INSERT/UPDATE sem restricao de coluna + o privilegio
-- default do Supabase deixava o usuario logado escrever qualquer coluna pelo PostgREST.
-- Faltavam tres coisas, medidas nos dois bancos em 04/10/2026:
--
-- 1) ~30 tabelas ainda com INSERT/UPDATE/DELETE/TRUNCATE para authenticated. Quase todas
--    sem policy de escrita viva (RLS nega), mas TRUNCATE pula RLS. E duas com policy
--    VIVA SO EM PROD, que a auditoria do #366 nao viu por ter medido em dev:
--      automations    "Users manage own tenant automations" (ALL, membro do tenant)
--      notifications  notifications_update_member (UPDATE, membro do tenant)
--    Nenhuma escrita do app passa por JWT nelas: notifications e escrita por
--    /api/notifications, /api/notifications/alerts e cron/emails (getSupabaseAdmin); o
--    sino usa o cliente de browser so para o realtime (SELECT); automations nao tem
--    chamada no app nem na engine.
--
-- 2) O default privilege do grantor `postgres` (a conexao que aplica migracao):
--      postgres r {..., authenticated=arwdDxtm/postgres, ...}
--    Toda tabela/view nova nasce com escrita para authenticated.
--
-- 3) O event trigger ensure_anon_revoked so endurecia anon. Os defaults do grantor
--    supabase_admin continuam inalcancaveis daqui (ver 20260822190000), entao objeto
--    criado por ele so e segurado pelo trigger.
--
-- SELECT fica: e onde as policies de leitura funcionam. Sequencia e funcao ficam de
-- fora deste PR: sequencia sem INSERT na tabela nao da escrita util, e funcao nova
-- executavel por authenticated e outra torneira (default privilege `f`), com
-- superficie de RPC propria.
--
-- Se um dia a UI precisar escrever pelo JWT, o caminho e grant por coluna explicito
-- depois do create, ex.: `grant update (name) on public.x to authenticated`. O
-- trigger so age em comando de CRIACAO, entao um ALTER TABLE posterior nao apaga o grant.

-- 1) Tabelas e views que ja existem. Revoke de tabela leva junto os grants por coluna.
revoke insert, update, delete, truncate on all tables in schema public from authenticated;

-- 2) A torneira: objetos criados pelo postgres.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from authenticated;

-- 3) A rede: objetos criados por qualquer papel, inclusive supabase_admin.
-- Nome mantido (renomear muda a assinatura e o gate de drift); o comentario diz o escopo.
-- Corpo de partida: pg_get_functiondef em dev e prod em 04/10/2026, identicos (md5).
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
      if cmd.object_type in ('table', 'partitioned table', 'view') then
        execute format('revoke all on table %s from anon', cmd.object_identity);
        -- So na criacao: este trigger tambem dispara em ALTER TABLE, e revogar ali
        -- apagaria um `grant update (coluna)` dado de proposito depois do create.
        if cmd.command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'CREATE VIEW') then
          execute format('revoke insert, update, delete, truncate on table %s from authenticated', cmd.object_identity);
        end if;

      elsif cmd.object_type = 'sequence' then
        execute format('revoke all on sequence %s from anon', cmd.object_identity);

      elsif cmd.object_type in ('function', 'procedure') then
        -- PUBLIC junto: sem isso anon executa por heranca. O grant para service_role
        -- vem em seguida para funcao de migracao que esqueca o grant explicito.
        execute format('revoke execute on %s %s from anon, public', cmd.object_type, cmd.object_identity);
        execute format('grant execute on %s %s to service_role', cmd.object_type, cmd.object_identity);

      else
        continue;
      end if;

      raise log 'anon_revoke_on_new_object: hardened % %', cmd.object_type, cmd.object_identity;
    exception when others then
      -- Nunca derrubar a DDL do desenvolvedor por causa do hardening.
      raise log 'anon_revoke_on_new_object: failed on %: %', cmd.object_identity, sqlerrm;
    end;
  end loop;
end;
$$;

-- create or replace preserva o ACL, mas nao confiar nisso (ver 20260904100000): o
-- estado esperado e o de 20260831140000, postgres=X | service_role=X.
revoke all on function public.anon_revoke_on_new_object() from public, anon, authenticated;

comment on function public.anon_revoke_on_new_object() is
  'Event trigger: em objeto novo de public, revoga privilegio de anon (e EXECUTE de PUBLIC) e escrita de authenticated em tabela/view. A.2 de 22/08/2026 + 04/10/2026.';

-- Conferencia depois de aplicar, nos dois bancos (o gate de drift nao ve privilegio,
-- default privilege nem corpo de funcao): infra/tests/authenticated-sem-escrita-check.sql
-- e, para provar a tabela nova, infra/tests/authenticated-sem-escrita-prova.sql.
