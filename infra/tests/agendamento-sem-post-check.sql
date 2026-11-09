-- Conferência da migração 20261109120000_agendamento_sem_post.sql (agendamento cujo post foi apagado vira
-- failed e avisa a loja), nos DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\agendamento-sem-post-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (7d0b…) com plano, dois agendamentos
-- sem post e um com post. Cada bloco levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha traz
-- r = 'ok'. Antes da migração o bloco 1 falha (md5 antigo) — é o RED.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7d0b0000-0000-4000-8000-000000000001', '7d0b0000-0000-4000-8000-000000000001',
   'Check agendamento sem post', 'check-agendamento-sem-post-7d0b');

-- Loja com plano: sem assinatura ativa o promote marca failed por outro motivo (tenant_concede_plano).
insert into public.subscriptions (tenant_id, plan_id, status)
select '7d0b0000-0000-4000-8000-000000000001', p.id, 'free' from public.plans p limit 1;

do $$
begin
  if not exists (select 1 from public.subscriptions where tenant_id = '7d0b0000-0000-4000-8000-000000000001') then
    raise exception 'FALHOU: fixture sem plano (public.plans vazio?)';
  end if;
end $$;

-- 1) Contrato: corpo = o desta migração, security definer, search_path, execute só do service_role.
do $$
declare
  p pg_proc;
begin
  select * into p from pg_proc where oid = to_regprocedure('app.promote_due_schedules(integer)');
  if p.oid is null then raise exception 'FALHOU: app.promote_due_schedules ausente'; end if;
  if md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 'ace587089cd637d708a9aec8df1793a9' then
    raise exception 'FALHOU: corpo de app.promote_due_schedules não é o da migração 20261109120000';
  end if;
  if not p.prosecdef
     or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
     or has_function_privilege('anon', p.oid, 'EXECUTE')
     or has_function_privilege('authenticated', p.oid, 'EXECUTE')
     or not has_function_privilege('service_role', p.oid, 'EXECUTE') then
    raise exception 'FALHOU: contrato de app.promote_due_schedules (security definer, search_path, execute só service_role)';
  end if;
end $$;

-- 2) Recorrente sem post, vencido há 8 min (depois do atraso máximo de 7 min): vira failed, a data NÃO
--    avança, a loja recebe a notificação e fica um log.
insert into public.schedules (id, tenant_id, broadcast_id, campaign_message_id, name, scheduled_at, recurrence, status) values
  ('7d0b0000-0000-4000-8000-0000000000a1', '7d0b0000-0000-4000-8000-000000000001', null, null,
   'Check diário sem post', now() - interval '8 minutes', 'daily', 'pending'),
  ('7d0b0000-0000-4000-8000-0000000000a2', '7d0b0000-0000-4000-8000-000000000001', null, null,
   'Check único sem post', now() - interval '8 minutes', 'none', 'pending');

select public.promote_due_schedules(500);

do $$
declare
  s public.schedules;
  n int;
begin
  select * into s from public.schedules where id = '7d0b0000-0000-4000-8000-0000000000a1';
  if s.status::text <> 'failed' then raise exception 'FALHOU: recorrente sem post deveria ser failed, está %', s.status; end if;
  if s.scheduled_at > now() - interval '7 minutes' then raise exception 'FALHOU: a data do recorrente sem post avançou'; end if;
  if s.last_run_at is null then raise exception 'FALHOU: last_run_at não gravado no recorrente sem post'; end if;
  select * into s from public.schedules where id = '7d0b0000-0000-4000-8000-0000000000a2';
  if s.status::text <> 'failed' then raise exception 'FALHOU: único sem post deveria ser failed, está %', s.status; end if;
  select count(*) into n from public.notifications
   where tenant_id = '7d0b0000-0000-4000-8000-000000000001' and type = 'agendamento_sem_post'
     and href = '/painel/disparos' and body like '%"Check diário sem post" (diário)%';
  if n <> 1 then raise exception 'FALHOU: esperada 1 notificação do diário, veio %', n; end if;
  select count(*) into n from public.notifications
   where tenant_id = '7d0b0000-0000-4000-8000-000000000001' and type = 'agendamento_sem_post' and body like '%(único)%';
  if n <> 1 then raise exception 'FALHOU: esperada 1 notificação do único, veio %', n; end if;
  select count(*) into n from public.logs
   where tenant_id = '7d0b0000-0000-4000-8000-000000000001' and event = 'agendamento_sem_post' and level = 'warn';
  if n <> 2 then raise exception 'FALHOU: esperados 2 logs, vieram %', n; end if;
end $$;

-- 3) Agendamento COM post segue o caminho normal: promovido (done), sem notificação de órfão.
insert into public.broadcasts (id, tenant_id, name, message, status) values
  ('7d0b0000-0000-4000-8000-0000000000b1', '7d0b0000-0000-4000-8000-000000000001', 'Check com post', 'teste', 'draft');
insert into public.schedules (id, tenant_id, broadcast_id, name, scheduled_at, recurrence, status) values
  ('7d0b0000-0000-4000-8000-0000000000a3', '7d0b0000-0000-4000-8000-000000000001',
   '7d0b0000-0000-4000-8000-0000000000b1', 'Check com post', now() - interval '8 minutes', 'none', 'pending');

select public.promote_due_schedules(500);

do $$
declare
  s public.schedules;
  n int;
begin
  select * into s from public.schedules where id = '7d0b0000-0000-4000-8000-0000000000a3';
  if s.status::text <> 'done' then raise exception 'FALHOU: agendamento com post deveria ser done, está %', s.status; end if;
  select count(*) into n from public.notifications
   where tenant_id = '7d0b0000-0000-4000-8000-000000000001' and type = 'agendamento_sem_post';
  if n <> 2 then raise exception 'FALHOU: o agendamento com post gerou notificação de órfão (total %)', n; end if;
end $$;

-- 4) Rodar de novo não repete nada: failed não volta à fila, notificação não duplica.
select public.promote_due_schedules(500);

do $$
declare
  n int;
begin
  select count(*) into n from public.notifications
   where tenant_id = '7d0b0000-0000-4000-8000-000000000001' and type = 'agendamento_sem_post';
  if n <> 2 then raise exception 'FALHOU: segunda rodada duplicou notificação (total %)', n; end if;
  select count(*) into n from public.schedules
   where tenant_id = '7d0b0000-0000-4000-8000-000000000001' and status::text = 'failed';
  if n <> 2 then raise exception 'FALHOU: esperados 2 failed, vieram %', n; end if;
end $$;

select 'ok' as r;

rollback;
