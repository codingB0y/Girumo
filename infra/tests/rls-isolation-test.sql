-- HUBFLOW - RLS isolation test (self-contained, assert-based)
--
-- Valida o mecanismo único de RLS criado em
-- apps/web/supabase/migrations/20260713100000_rls_standardization.sql:
--   1. Membro do tenant A enxerga apenas linhas do tenant A.
--   2. Membro do tenant A NÃO consegue inserir linhas no tenant B.
--   3. Role authenticated NÃO lê engine_commands/engine_events (deny-all).
--
-- Execução: SQL Editor do Supabase (ou psql) como postgres/service.
-- Tudo roda dentro de uma transação com ROLLBACK — nada persiste.
-- Falha = exception "RLS TEST FAILED: ..."; sucesso = notice final.

begin;

-- ============================================================
-- Fixtures sintéticas (UUIDs fixos, removidos no rollback)
-- ============================================================

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'rls-test-a@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'rls-test-b@test.local');

insert into public.organizations (id, tenant_id, name, slug, created_by)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'RLS Test Org A', 'rls-test-org-a', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'RLS Test Org B', 'rls-test-org-b', '22222222-2222-4222-8222-222222222222');

insert into public.memberships (tenant_id, user_id, role, accepted_at)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', now()),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'owner', now());

insert into public.instances (tenant_id, name)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'rls-test-instance-a'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'rls-test-instance-b');

insert into public.groups (tenant_id, whatsapp_group_id, name)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'rls-test-group-a@g.us', 'Grupo A'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'rls-test-group-b@g.us', 'Grupo B');

insert into public.broadcasts (tenant_id, name, message)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Broadcast A', 'oi A'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'Broadcast B', 'oi B');

insert into public.engine_commands (tenant_id, type, payload)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'send_text', '{}'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'send_text', '{}');

insert into public.engine_events (tenant_id, type, payload)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'rls_test', '{}'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'rls_test', '{}');

-- ============================================================
-- Simular usuário A (role authenticated + JWT sub)
-- ============================================================

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
declare
  c integer;
begin
  -- 1. A enxerga o próprio tenant
  select count(*) into c from public.instances where name like 'rls-test-instance-%';
  if c <> 1 then
    raise exception 'RLS TEST FAILED: user A deveria ver 1 instance, viu %', c;
  end if;

  select count(*) into c from public.instances
  where tenant_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  if c <> 0 then
    raise exception 'RLS TEST FAILED: user A enxerga instances do tenant B (%)', c;
  end if;

  select count(*) into c from public.groups where name in ('Grupo A', 'Grupo B');
  if c <> 1 then
    raise exception 'RLS TEST FAILED: user A deveria ver 1 group, viu %', c;
  end if;

  select count(*) into c from public.broadcasts where name in ('Broadcast A', 'Broadcast B');
  if c <> 1 then
    raise exception 'RLS TEST FAILED: user A deveria ver 1 broadcast, viu %', c;
  end if;

  -- 2. Fila é deny-all para authenticated
  select count(*) into c from public.engine_commands;
  if c <> 0 then
    raise exception 'RLS TEST FAILED: authenticated lê engine_commands (%)', c;
  end if;

  select count(*) into c from public.engine_events;
  if c <> 0 then
    raise exception 'RLS TEST FAILED: authenticated lê engine_events (%)', c;
  end if;

  -- 3. A não escreve no tenant B (with check)
  begin
    insert into public.groups (tenant_id, whatsapp_group_id, name)
    values ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'rls-test-hack@g.us', 'Invasao');
    raise exception 'RLS TEST FAILED: user A inseriu group no tenant B';
  exception
    when insufficient_privilege then null; -- 42501 = RLS bloqueou, esperado
  end;

  -- 4. A não escreve na fila (deny-all)
  begin
    insert into public.engine_commands (tenant_id, type, payload)
    values ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'send_text', '{}');
    raise exception 'RLS TEST FAILED: authenticated inseriu em engine_commands';
  exception
    when insufficient_privilege then null;
  end;

  raise notice 'RLS TEST OK: isolamento por tenant + deny-all na fila validados';
end;
$$;

reset role;

rollback;
