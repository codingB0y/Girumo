-- Conferência da migração 20261109130000_troca_de_chip.sql (outro chip abrindo a sessão da instância dos
-- grupos reinicia o aquecimento), nos DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\troca-de-chip-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (7e0c…), um número dos grupos veterano
-- e em convalescença, um do atendimento, um nunca conectado e 12 grupos com gente. Cada bloco levanta
-- 'FALHOU: …' e o script para ali. Sem erro, a última linha traz r = 'ok'. Antes da migração o bloco 1 falha
-- (função ausente) — é o RED.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7e0c0000-0000-4000-8000-000000000001', '7e0c0000-0000-4000-8000-000000000001',
   'Check troca de chip', 'check-troca-de-chip-7e0c');

insert into public.instances (id, tenant_id, name, status, phone, purpose, numero_perfil) values
  ('7e0c0000-0000-4000-8000-0000000000e1', '7e0c0000-0000-4000-8000-000000000001',
   'Check grupos', 'connected', '5511999990001', 'grupos', 'antigo'),
  ('7e0c0000-0000-4000-8000-0000000000e2', '7e0c0000-0000-4000-8000-000000000001',
   'Check privado', 'connected', '5511999990002', 'privado', null),
  ('7e0c0000-0000-4000-8000-0000000000e3', '7e0c0000-0000-4000-8000-000000000001',
   'Check nunca conectou', 'pending', null, 'grupos', 'novo');

-- 12 grupos administrados com gente: veterano pela evidência.
insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin, members)
select '7e0c0000-0000-4000-8000-000000000001', 'chip-adm-' || n || '@g.us', 'Check ' || n, true, 100
from generate_series(1, 12) n;

-- Aquecimento graduado há tempo, e uma convalescença do chip antigo.
insert into public.instance_send_state (instance_id, tenant_id, warmup_started_at, warmup_graduated, last_active_at, next_send_allowed_at, paused_until, consecutive_failures)
values ('7e0c0000-0000-4000-8000-0000000000e1', '7e0c0000-0000-4000-8000-000000000001',
        now() - interval '30 days', true, now() - interval '1 hour', now() + interval '2 hours', now() + interval '20 minutes', 3);
insert into app.convalescenca (instance_id, tenant_id, logout_at, reconnected_at, posts_pausados_ate, perfil_ate)
values ('7e0c0000-0000-4000-8000-0000000000e1', '7e0c0000-0000-4000-8000-000000000001',
        now() - interval '2 days', now() - interval '1 day', now() + interval '1 day', now() + interval '12 days');

-- 1) Contrato: security definer, search_path, execute só do service_role, devolve jsonb.
do $$
declare
  p pg_proc;
begin
  select * into p from pg_proc where oid = to_regprocedure('public.registrar_troca_de_chip(uuid,uuid,text)');
  if p.oid is null then raise exception 'FALHOU: public.registrar_troca_de_chip ausente'; end if;
  if not p.prosecdef
     or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
     or has_function_privilege('anon', p.oid, 'EXECUTE')
     or has_function_privilege('authenticated', p.oid, 'EXECUTE')
     or not has_function_privilege('service_role', p.oid, 'EXECUTE')
     or p.prorettype <> 'jsonb'::regtype then
    raise exception 'FALHOU: contrato de registrar_troca_de_chip (security definer, search_path, execute só service_role, jsonb)';
  end if;
end $$;

-- 2) Recusas: instância desconhecida, número do atendimento, telefone vazio, primeira conexão, mesmo chip.
--    Nenhuma recusa escreve nada.
do $$
declare
  t uuid := '7e0c0000-0000-4000-8000-000000000001';
  r jsonb;
begin
  r := public.registrar_troca_de_chip(t, '7e0c0000-0000-4000-8000-0000000000ff', '5511999990009');
  if r->>'motivo' <> 'instancia_desconhecida' then raise exception 'FALHOU: desconhecida: %', r; end if;
  r := public.registrar_troca_de_chip(t, '7e0c0000-0000-4000-8000-0000000000e2', '5511999990009');
  if r->>'motivo' <> 'nao_e_numero_dos_grupos' then raise exception 'FALHOU: privado: %', r; end if;
  r := public.registrar_troca_de_chip(t, '7e0c0000-0000-4000-8000-0000000000e1', '  ');
  if r->>'motivo' <> 'sem_telefone' then raise exception 'FALHOU: telefone vazio: %', r; end if;
  r := public.registrar_troca_de_chip(t, '7e0c0000-0000-4000-8000-0000000000e3', '5511999990009');
  if r->>'motivo' <> 'primeira_conexao' then raise exception 'FALHOU: primeira conexão: %', r; end if;
  r := public.registrar_troca_de_chip(t, '7e0c0000-0000-4000-8000-0000000000e1', '5511999990001');
  if r->>'motivo' <> 'mesmo_chip' then raise exception 'FALHOU: mesmo chip: %', r; end if;
  -- Outra loja não mexe na instância desta.
  r := public.registrar_troca_de_chip('7e0c0000-0000-4000-8000-000000000002', '7e0c0000-0000-4000-8000-0000000000e1', '5511999990009');
  if r->>'motivo' <> 'instancia_desconhecida' then raise exception 'FALHOU: outra loja: %', r; end if;
  if exists (select 1 from public.notifications where tenant_id = t and type = 'antiban_chip_trocado')
     or (select numero_perfil from public.instances where id = '7e0c0000-0000-4000-8000-0000000000e1') <> 'antigo'
     or not exists (select 1 from app.convalescenca where instance_id = '7e0c0000-0000-4000-8000-0000000000e1') then
    raise exception 'FALHOU: recusa escreveu alguma coisa';
  end if;
end $$;

-- 3) Antes da troca: veterano (graduado), em convalescença.
do $$
declare
  c record;
begin
  select * into c from app.instance_caps('7e0c0000-0000-4000-8000-0000000000e1');
  if c.perfil <> 'convalescente' then raise exception 'FALHOU: antes da troca esperava convalescente, veio %', c.perfil; end if;
end $$;

-- 4) A troca: telefone novo, perfil novo, aquecimento do zero, convalescença apagada, notificação e log.
do $$
declare
  t uuid := '7e0c0000-0000-4000-8000-000000000001';
  e uuid := '7e0c0000-0000-4000-8000-0000000000e1';
  r jsonb;
  i public.instances;
  s public.instance_send_state;
  c record;
  n int;
begin
  r := public.registrar_troca_de_chip(t, e, '5511999990009');
  if (r->>'aplicado')::boolean is not true or r->>'phone_antigo' <> '5511999990001' or r->>'phone_novo' <> '5511999990009'
     or (r->>'convalescenca_removida')::boolean is not true then
    raise exception 'FALHOU: retorno da troca: %', r;
  end if;
  select * into i from public.instances where id = e;
  if i.phone <> '5511999990009' or i.numero_perfil <> 'novo' then raise exception 'FALHOU: instância após a troca: % %', i.phone, i.numero_perfil; end if;
  select * into s from public.instance_send_state where instance_id = e;
  if s.warmup_graduated or s.warmup_started_at < now() - interval '1 minute' or s.paused_until is not null
     or s.consecutive_failures <> 0 or s.next_send_allowed_at > now() then
    raise exception 'FALHOU: aquecimento não reiniciado: graduated=% started=% paused=% falhas=% next=%',
      s.warmup_graduated, s.warmup_started_at, s.paused_until, s.consecutive_failures, s.next_send_allowed_at;
  end if;
  if exists (select 1 from app.convalescenca where instance_id = e) then raise exception 'FALHOU: convalescença do chip antigo ficou'; end if;
  select count(*) into n from public.notifications
   where tenant_id = t and type = 'antiban_chip_trocado' and href = '/painel/conectar'
     and body like '%5511999990001%' and body like '%5511999990009%';
  if n <> 1 then raise exception 'FALHOU: esperada 1 notificação, veio %', n; end if;
  select count(*) into n from public.logs where tenant_id = t and instance_id = e and event = 'antiban_chip_trocado' and level = 'warn';
  if n <> 1 then raise exception 'FALHOU: esperado 1 log, veio %', n; end if;
  select * into c from app.instance_caps(e);
  if c.perfil <> 'novo' or c.warmup_day <> 1 or c.graduated then
    raise exception 'FALHOU: caps após a troca: perfil=% dia=% graduado=%', c.perfil, c.warmup_day, c.graduated;
  end if;
end $$;

-- 5) O webhook chega em rajada: o mesmo chip de novo é mesmo_chip e não repete notificação nem reinicia nada.
do $$
declare
  t uuid := '7e0c0000-0000-4000-8000-000000000001';
  e uuid := '7e0c0000-0000-4000-8000-0000000000e1';
  r jsonb;
  n int;
begin
  r := public.registrar_troca_de_chip(t, e, '5511999990009');
  if r->>'motivo' <> 'mesmo_chip' then raise exception 'FALHOU: repetição: %', r; end if;
  select count(*) into n from public.notifications where tenant_id = t and type = 'antiban_chip_trocado';
  if n <> 1 then raise exception 'FALHOU: notificação duplicada (%)', n; end if;
end $$;

-- 6) Instância sem estado de envio (nunca enviou) também troca: o estado nasce já reiniciado.
do $$
declare
  t uuid := '7e0c0000-0000-4000-8000-000000000001';
  e uuid := '7e0c0000-0000-4000-8000-0000000000e4';
  r jsonb;
  s public.instance_send_state;
begin
  insert into public.instances (id, tenant_id, name, status, phone, purpose, numero_perfil)
  values (e, t, 'Check sem estado', 'connected', '5511999990003', 'grupos', 'antigo');
  r := public.registrar_troca_de_chip(t, e, '5511999990004');
  if (r->>'aplicado')::boolean is not true then raise exception 'FALHOU: troca sem estado: %', r; end if;
  select * into s from public.instance_send_state where instance_id = e;
  if s.instance_id is null or s.warmup_graduated then raise exception 'FALHOU: estado não nasceu reiniciado'; end if;
end $$;

select 'ok' as r;

rollback;
