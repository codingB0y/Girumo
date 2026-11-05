-- Conferência da migração 20261105140000_fanout_lento_e_jitter.sql (fan-out lento e irregular, agendamento
-- sem horário cravado), nos DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\fanout-lento-e-jitter-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (7e0b…), três números e comandos
-- de envio. Cada bloco levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha traz r = 'ok'.
-- Antes da migração o bloco 1 falha (função ausente) — é o RED.
--
-- O bloco 6 chama app.promote_due_schedules, que olha TODAS as lojas: o que ele promover de outras lojas
-- fica dentro da transação e volta no rollback.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7e0b0000-0000-4000-8000-000000000001', '7e0b0000-0000-4000-8000-000000000001',
   'Check fanout lento', 'check-fanout-lento-7e0b');

insert into public.instances (id, tenant_id, name, status) values
  ('7e0b0000-0000-4000-8000-0000000000e1', '7e0b0000-0000-4000-8000-000000000001', 'Check 1', 'connected'),
  ('7e0b0000-0000-4000-8000-0000000000e2', '7e0b0000-0000-4000-8000-000000000001', 'Check 2', 'connected'),
  ('7e0b0000-0000-4000-8000-0000000000e3', '7e0b0000-0000-4000-8000-000000000001', 'Check 3', 'connected');

-- Com plano: sem ele, promote_due_schedules marca o agendamento como failed ("a assinatura não está ativa")
-- e o bloco 6 não conseguiria separar "saiu" de "perdeu a hora".
insert into public.subscriptions (tenant_id, plan_id, status)
select '7e0b0000-0000-4000-8000-000000000001', p.id, 'free' from public.plans p limit 1;

-- 1) Contrato: record_send e promote_due_schedules com security definer, search_path e execute só do
--    service_role; constantes fora do alcance de anon/authenticated; lote mínimo 10; atraso immutable;
--    corpos = os da migração.
do $$
begin
  if exists (
    select 1
      from (values ('app.record_send(uuid,uuid)'), ('app.promote_due_schedules(integer)')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: record_send/promote_due_schedules fora do contrato (security definer, search_path, execute só service_role)';
  end if;

  if exists (
    select 1
      from (values ('app.lote_minimo()'), ('app.atraso_do_agendamento(uuid,timestamptz)')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or p.provolatile <> 'i'
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: lote_minimo/atraso_do_agendamento ausentes, não immutable ou executáveis por anon/authenticated';
  end if;

  if app.lote_minimo() <> 10 then
    raise exception 'FALHOU: lote mínimo diferente de 10';
  end if;

  if (select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
        from pg_proc p where p.oid = to_regprocedure('app.record_send(uuid,uuid)'))
     <> 'd3cf06ff734ad93b31d8f2df9eae0376' then
    raise exception 'FALHOU: corpo de app.record_send difere da migração 20261105140000';
  end if;
  if (select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
        from pg_proc p where p.oid = to_regprocedure('app.promote_due_schedules(integer)'))
     <> '8c4d3ed17a613f7e803a86b8925d4c06' then
    raise exception 'FALHOU: corpo de app.promote_due_schedules difere da migração 20261105140000';
  end if;
end $$;

-- 2) Fora de lote (nada na fila, nada enviado): 3 a 7 s até o próximo envio, como antes.
do $$
declare v_prox timestamptz;
begin
  perform app.record_send('7e0b0000-0000-4000-8000-0000000000e1', '7e0b0000-0000-4000-8000-000000000001');
  select s.next_send_allowed_at into v_prox from public.instance_send_state s
   where s.instance_id = '7e0b0000-0000-4000-8000-0000000000e1';
  if v_prox is null or v_prox - now() not between interval '3 seconds' and interval '7 seconds' then
    raise exception 'FALHOU: fora de lote o intervalo deveria ser de 3 a 7 s, veio %', v_prox - now();
  end if;
  if (select count(*) from public.instance_sends where instance_id = '7e0b0000-0000-4000-8000-0000000000e1') <> 1 then
    raise exception 'FALHOU: record_send não contou o envio';
  end if;
end $$;

-- 3) Em lote: 1 envio recente + 10 comandos na fila = 11 >= 10. Doze envios seguidos, todos com intervalo
--    de 20 a 60 s e não todos iguais (irregular).
insert into public.engine_commands (tenant_id, instance_id, type, status, payload, available_at)
select '7e0b0000-0000-4000-8000-000000000001', '7e0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now()
from generate_series(1, 10);

do $$
declare v_gap interval; v_min interval; v_max interval; i int;
begin
  for i in 1..12 loop
    perform app.record_send('7e0b0000-0000-4000-8000-0000000000e1', '7e0b0000-0000-4000-8000-000000000001');
    select s.next_send_allowed_at - now() into v_gap from public.instance_send_state s
     where s.instance_id = '7e0b0000-0000-4000-8000-0000000000e1';
    if v_gap not between interval '20 seconds' and interval '60 seconds' then
      raise exception 'FALHOU: em lote o intervalo deveria ser de 20 a 60 s, veio % na rodada %', v_gap, i;
    end if;
    v_min := least(coalesce(v_min, v_gap), v_gap);
    v_max := greatest(coalesce(v_max, v_gap), v_gap);
  end loop;
  if v_max - v_min < interval '1 second' then
    raise exception 'FALHOU: doze intervalos em lote praticamente iguais (% a %): não está irregular', v_min, v_max;
  end if;
end $$;

-- 4) A fronteira é o lote mínimo: 9 na fila (sem envio recente) segue rápido; 10 na fila já é lento. O
--    comando em voo conta como processing.
insert into public.engine_commands (tenant_id, instance_id, type, status, payload, available_at)
select '7e0b0000-0000-4000-8000-000000000001', '7e0b0000-0000-4000-8000-0000000000e2', 'send_media', 'queued', '{}', now()
from generate_series(1, 9);
insert into public.engine_commands (tenant_id, instance_id, type, status, payload, available_at)
select '7e0b0000-0000-4000-8000-000000000001', '7e0b0000-0000-4000-8000-0000000000e3', 'send_media',
       case when n = 1 then 'processing'::public.engine_command_status else 'queued'::public.engine_command_status end, '{}', now()
from generate_series(1, 10) n;

do $$
declare v_gap2 interval; v_gap3 interval;
begin
  perform app.record_send('7e0b0000-0000-4000-8000-0000000000e2', '7e0b0000-0000-4000-8000-000000000001');
  perform app.record_send('7e0b0000-0000-4000-8000-0000000000e3', '7e0b0000-0000-4000-8000-000000000001');
  select s.next_send_allowed_at - now() into v_gap2 from public.instance_send_state s where s.instance_id = '7e0b0000-0000-4000-8000-0000000000e2';
  select s.next_send_allowed_at - now() into v_gap3 from public.instance_send_state s where s.instance_id = '7e0b0000-0000-4000-8000-0000000000e3';
  if v_gap2 not between interval '3 seconds' and interval '7 seconds' then
    raise exception 'FALHOU: 9 na fila deveria seguir rápido (3-7 s), veio %', v_gap2;
  end if;
  if v_gap3 not between interval '20 seconds' and interval '60 seconds' then
    raise exception 'FALHOU: 10 em curso (9 na fila + 1 em voo) deveria ser lento (20-60 s), veio %', v_gap3;
  end if;
end $$;

-- 5) Atraso do agendamento: determinístico para a mesma ocorrência, entre 0 e 7 min, e variado entre
--    ocorrências (200 amostras, pelo menos 20 valores distintos).
do $$
declare v_id uuid := gen_random_uuid(); v_t timestamptz := now(); n_distintos int; fora int;
begin
  if app.atraso_do_agendamento(v_id, v_t) <> app.atraso_do_agendamento(v_id, v_t) then
    raise exception 'FALHOU: atraso_do_agendamento não é determinístico';
  end if;
  select count(distinct app.atraso_do_agendamento(gen_random_uuid(), v_t)),
         count(*) filter (where app.atraso_do_agendamento(gen_random_uuid(), v_t) not between interval '0' and interval '7 minutes')
    into n_distintos, fora
    from generate_series(1, 200);
  if fora <> 0 then
    raise exception 'FALHOU: % atraso(s) fora de 0 a 7 min', fora;
  end if;
  if n_distintos < 20 then
    raise exception 'FALHOU: só % atrasos distintos em 200 amostras', n_distintos;
  end if;
end $$;

-- 6) Promoção: 40 agendamentos de 3 min atrás saem só os de atraso <= 3 min (e algum sai, algum fica);
--    o de 10 min atrás sempre sai (atraso máximo 7); o de 16 min atrás perdeu a hora (failed), como antes.
insert into public.schedules (tenant_id, name, scheduled_at, recurrence)
select '7e0b0000-0000-4000-8000-000000000001', 'check lote ' || n, now() - interval '3 minutes', 'none'
from generate_series(1, 40) n;
insert into public.schedules (id, tenant_id, name, scheduled_at, recurrence) values
  ('7e0b0000-0000-4000-8000-0000000000a1', '7e0b0000-0000-4000-8000-000000000001', 'check 10 min', now() - interval '10 minutes', 'none'),
  ('7e0b0000-0000-4000-8000-0000000000a2', '7e0b0000-0000-4000-8000-000000000001', 'check 16 min', now() - interval '16 minutes', 'none');

do $$
declare esperados int; feitos int; pendentes int;
begin
  if not app.tenant_concede_plano('7e0b0000-0000-4000-8000-000000000001') then
    raise exception 'FALHOU: a loja do check ficou sem plano (public.plans vazia?)';
  end if;
  perform app.promote_due_schedules(1000);

  select count(*) filter (where app.atraso_do_agendamento(s.id, s.scheduled_at) <= interval '3 minutes')
    into esperados
    from public.schedules s
   where s.tenant_id = '7e0b0000-0000-4000-8000-000000000001' and s.name like 'check lote %';
  select count(*) filter (where s.status = 'done'), count(*) filter (where s.status = 'pending')
    into feitos, pendentes
    from public.schedules s
   where s.tenant_id = '7e0b0000-0000-4000-8000-000000000001' and s.name like 'check lote %';
  if feitos <> esperados or pendentes <> 40 - esperados then
    raise exception 'FALHOU: dos 40 de 3 min atrás deveriam sair % (atraso <= 3 min), saíram % e ficaram %', esperados, feitos, pendentes;
  end if;
  if esperados = 0 or esperados = 40 then
    raise exception 'FALHOU: atraso sem variação útil: % de 40 com atraso <= 3 min', esperados;
  end if;
  if (select status::text from public.schedules where id = '7e0b0000-0000-4000-8000-0000000000a1') <> 'done' then
    raise exception 'FALHOU: agendamento de 10 min atrás deveria sair (atraso máximo 7 min)';
  end if;
  if (select status::text from public.schedules where id = '7e0b0000-0000-4000-8000-0000000000a2') <> 'failed' then
    raise exception 'FALHOU: agendamento de 16 min atrás deveria ter perdido a hora (failed)';
  end if;
end $$;

select 'ok' as r;

rollback;
