-- Conferência da migração 20261023120000_antiban_saidas_e_todos.sql (disjuntor por saídas e orçamento
-- de @todos), nos DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\antiban-saidas-e-todos-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (7a0b…), um número, dois grupos
-- e comandos de envio. Cada bloco levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha
-- traz r = 'ok'. Antes da migração o bloco 1 falha (função ausente) — é o RED.
--
-- O claim é sempre chamado com p_tenant da loja do check: o bloco de cancelamento dele não toca
-- comando de outra loja.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7a0b0000-0000-4000-8000-000000000001', '7a0b0000-0000-4000-8000-000000000001',
   'Check antiban saidas', 'check-antiban-saidas-7a0b');

insert into public.instances (id, tenant_id, name, status) values
  ('7a0b0000-0000-4000-8000-0000000000e1', '7a0b0000-0000-4000-8000-000000000001', 'Check', 'connected');

-- Grupo administrado com 1000 membros (limite = max(30, 1% de 1000) = 30) e um grupo de terceiro.
insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin, members) values
  ('7a0b0000-0000-4000-8000-000000000001', 'check-adm@g.us', 'Check admin', true, 1000),
  ('7a0b0000-0000-4000-8000-000000000001', 'check-terceiro@g.us', 'Check terceiro', false, 1000);

-- 1) Contrato: funções com security definer, search_path e execute só do service_role; tabela do
--    disjuntor fora do alcance de anon/authenticated; corpo do claim = o da migração.
do $$
begin
  if exists (
    select 1
      from (values
        ('public.avaliar_disjuntor_saidas(uuid)'),
        ('app.exit_breaker_limit(uuid)'),
        ('app.claim_send_commands(integer,uuid)')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: funções do disjuntor/claim fora do contrato (security definer, search_path, execute só service_role)';
  end if;

  if to_regclass('app.exit_breaker') is null
     or has_table_privilege('anon', 'app.exit_breaker', 'SELECT')
     or has_table_privilege('authenticated', 'app.exit_breaker', 'SELECT') then
    raise exception 'FALHOU: app.exit_breaker ausente ou legível por anon/authenticated';
  end if;

  if app.mention_all_daily_budget() <> 2 then
    raise exception 'FALHOU: orçamento de @todos diferente de 2';
  end if;

  if (select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
        from pg_proc p where p.oid = to_regprocedure('app.claim_send_commands(integer,uuid)'))
     <> 'e129ff5b504e8e86122f5fdf53bb1955' then
    raise exception 'FALHOU: corpo de app.claim_send_commands difere da migração 20261023120000';
  end if;
end $$;

-- 2) Sem envio nas últimas 3 h: não avalia nem abre.
do $$
declare r jsonb;
begin
  r := public.avaliar_disjuntor_saidas('7a0b0000-0000-4000-8000-000000000001');
  if (r->>'aberto')::boolean or r->>'motivo' is distinct from 'sem_envio' then
    raise exception 'FALHOU: sem envio deveria devolver sem_envio, veio %', r;
  end if;
end $$;

insert into public.instance_sends (instance_id, sent_at) values
  ('7a0b0000-0000-4000-8000-0000000000e1', now() - interval '20 minutes');

-- Saídas: 29 voluntárias no grupo administrado (uma delas repetida por um segundo número), 10 no
-- grupo de terceiro, 5 remoções por admin e 1 voluntária de 4 h atrás. Só as 29 contam.
insert into public.engine_events (tenant_id, instance_id, type, payload, created_at)
select '7a0b0000-0000-4000-8000-000000000001', '7a0b0000-0000-4000-8000-0000000000e1',
       'group-participants.update',
       jsonb_build_object('data', jsonb_build_object(
         'id', g, 'action', 'remove', 'author', autor,
         'participants', jsonb_build_array(jsonb_build_object('id', pid)))),
       quando
from (
  select 'check-adm@g.us' g, 'p' || n || '@lid' pid, 'p' || n || '@lid' autor, now() - interval '30 minutes' quando
    from generate_series(1, 29) n
  union all select 'check-adm@g.us', 'p1@lid', 'p1@lid', now() - interval '30 minutes'
  union all select 'check-terceiro@g.us', 't' || n || '@lid', 't' || n || '@lid', now() - interval '30 minutes'
    from generate_series(1, 10) n
  union all select 'check-adm@g.us', 'a' || n || '@lid', 'admin@lid', now() - interval '30 minutes'
    from generate_series(1, 5) n
  union all select 'check-adm@g.us', 'velho@lid', 'velho@lid', now() - interval '4 hours'
) s;

-- 3) 29 < 30: não abre.
do $$
declare r jsonb;
begin
  r := public.avaliar_disjuntor_saidas('7a0b0000-0000-4000-8000-000000000001');
  if (r->>'aberto')::boolean or (r->>'saidas')::int <> 29 or (r->>'limite')::int <> 30 then
    raise exception 'FALHOU: com 29 saídas válidas e limite 30 não deveria abrir, veio %', r;
  end if;
end $$;

insert into public.engine_commands (id, tenant_id, instance_id, type, status, payload, available_at) values
  ('7a0b0000-0000-4000-8000-0000000000c1', '7a0b0000-0000-4000-8000-000000000001',
   '7a0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now()),
  ('7a0b0000-0000-4000-8000-0000000000c2', '7a0b0000-0000-4000-8000-000000000001',
   '7a0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now() + interval '1 hour');

insert into public.engine_events (tenant_id, instance_id, type, payload)
values ('7a0b0000-0000-4000-8000-000000000001', '7a0b0000-0000-4000-8000-0000000000e1',
        'group-participants.update',
        '{"data":{"id":"check-adm@g.us","action":"remove","author":"p30@lid","participants":[{"id":"p30@lid"}]}}');

-- 4) A 30ª abre: pausa de 6 h, fila cancelada com o motivo, uma notificação; chamar de novo não
--    reabre nem notifica outra vez.
do $$
declare r jsonb; r2 jsonb;
begin
  r := public.avaliar_disjuntor_saidas('7a0b0000-0000-4000-8000-000000000001');
  if not (r->>'aberto')::boolean or not (r->>'novo')::boolean or (r->>'cancelados')::int <> 2 then
    raise exception 'FALHOU: a 30ª saída deveria abrir e cancelar 2, veio %', r;
  end if;
  if (select count(*) from app.exit_breaker b
       where b.tenant_id = '7a0b0000-0000-4000-8000-000000000001'
         and b.until between now() + interval '5 hours 59 minutes' and now() + interval '6 hours 1 minute') <> 1 then
    raise exception 'FALHOU: app.exit_breaker sem a pausa de 6 h';
  end if;
  if (select count(*) from public.engine_commands
       where tenant_id = '7a0b0000-0000-4000-8000-000000000001' and status = 'canceled'
         and error like '%muita gente saiu dos grupos%') <> 2 then
    raise exception 'FALHOU: fila não foi cancelada com o motivo do disjuntor';
  end if;
  r2 := public.avaliar_disjuntor_saidas('7a0b0000-0000-4000-8000-000000000001');
  if (r2->>'novo')::boolean or not (r2->>'aberto')::boolean then
    raise exception 'FALHOU: segunda avaliação deveria ver o disjuntor já aberto, veio %', r2;
  end if;
  if (select count(*) from public.notifications
       where tenant_id = '7a0b0000-0000-4000-8000-000000000001' and type = 'antiban_saidas') <> 1 then
    raise exception 'FALHOU: deveria haver exatamente 1 notificação antiban_saidas';
  end if;
end $$;

-- 5) Disjuntor aberto: o claim não pega comando da loja, e o que passou da tolerância é cancelado
--    com o motivo do disjuntor (não "servidor fora do ar").
insert into public.engine_commands (id, tenant_id, instance_id, type, status, payload, available_at) values
  ('7a0b0000-0000-4000-8000-0000000000c3', '7a0b0000-0000-4000-8000-000000000001',
   '7a0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now() - interval '1 second'),
  ('7a0b0000-0000-4000-8000-0000000000c4', '7a0b0000-0000-4000-8000-000000000001',
   '7a0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now() - interval '20 minutes');

do $$
declare n int;
begin
  select count(*) into n from app.claim_send_commands(5, '7a0b0000-0000-4000-8000-000000000001');
  if n <> 0 then
    raise exception 'FALHOU: claim pegou % comando(s) com o disjuntor aberto', n;
  end if;
  if (select error from public.engine_commands where id = '7a0b0000-0000-4000-8000-0000000000c4')
       not like '%muita gente saiu dos grupos%' then
    raise exception 'FALHOU: comando parado durante o disjuntor deveria ser cancelado com o motivo dele';
  end if;
  if (select status::text from public.engine_commands where id = '7a0b0000-0000-4000-8000-0000000000c3') <> 'queued' then
    raise exception 'FALHOU: comando dentro da tolerância deveria seguir na fila';
  end if;
end $$;

-- 6) Disjuntor fechado: o claim volta a pegar.
update app.exit_breaker set until = now() - interval '1 second'
 where tenant_id = '7a0b0000-0000-4000-8000-000000000001';

do $$
declare n int;
begin
  select count(*) into n from app.claim_send_commands(5, '7a0b0000-0000-4000-8000-000000000001');
  if n <> 1 then
    raise exception 'FALHOU: com o disjuntor fechado o claim deveria pegar 1, pegou %', n;
  end if;
end $$;

update public.engine_commands set status = 'done'
 where tenant_id = '7a0b0000-0000-4000-8000-000000000001' and status = 'processing';

-- 7) Orçamento de @todos (2 posts por número em 24 h). Post = (origin_id, origin_run_id): o broadcast
--    se repete no agendamento recorrente, o run não. O1/run 1 já saiu marcando há 1 h.
insert into public.engine_commands (tenant_id, instance_id, type, status, payload, available_at, claimed_at, origin_kind, origin_id, origin_run_id) values
  ('7a0b0000-0000-4000-8000-000000000001', '7a0b0000-0000-4000-8000-0000000000e1', 'send_media', 'done',
   '{"mentionAll":true}', now() - interval '1 hour', now() - interval '1 hour', 'broadcast',
   '7a0b0000-0000-4000-8000-0000000000b1', '7a0b0000-0000-4000-8000-0000000000f1');

create temp table check_claims (ordem serial, passo text, mention text, cortado text) on commit drop;

create function pg_temp.check_claim(p_passo text, p_origem uuid, p_run uuid, p_mention boolean)
returns void language plpgsql as $f$
declare c public.engine_commands;
begin
  insert into public.engine_commands (tenant_id, instance_id, type, status, payload, available_at, origin_kind, origin_id, origin_run_id)
  values ('7a0b0000-0000-4000-8000-000000000001', '7a0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued',
          jsonb_build_object('mentionAll', p_mention), now() - interval '1 second', 'broadcast', p_origem, p_run);
  select * into c from app.claim_send_commands(1, '7a0b0000-0000-4000-8000-000000000001') limit 1;
  if c.id is null then
    raise exception 'FALHOU: claim não pegou o passo %', p_passo;
  end if;
  insert into check_claims (passo, mention, cortado) values (p_passo, c.payload->>'mentionAll', c.payload->>'mentionAllCortado');
  update public.engine_commands set status = 'done' where id = c.id;
end $f$;

select pg_temp.check_claim('O2 (2º post)',          '7a0b0000-0000-4000-8000-0000000000b2', '7a0b0000-0000-4000-8000-0000000000f2', true);
select pg_temp.check_claim('O3 (3º post)',          '7a0b0000-0000-4000-8000-0000000000b3', '7a0b0000-0000-4000-8000-0000000000f3', true);
select pg_temp.check_claim('O3 outro grupo',        '7a0b0000-0000-4000-8000-0000000000b3', '7a0b0000-0000-4000-8000-0000000000f3', true);
select pg_temp.check_claim('O1 outro grupo',        '7a0b0000-0000-4000-8000-0000000000b1', '7a0b0000-0000-4000-8000-0000000000f1', true);
select pg_temp.check_claim('O1 recorrente (run 2)', '7a0b0000-0000-4000-8000-0000000000b1', '7a0b0000-0000-4000-8000-0000000000f4', true);
select pg_temp.check_claim('O5 sem @todos',         '7a0b0000-0000-4000-8000-0000000000b5', '7a0b0000-0000-4000-8000-0000000000f5', false);

-- Passadas 24 h, o orçamento libera: O3 recorrente (run novo) volta a marcar, mesmo com o run
-- anterior cortado.
update public.engine_commands set claimed_at = now() - interval '25 hours'
 where tenant_id = '7a0b0000-0000-4000-8000-000000000001' and claimed_at is not null;

select pg_temp.check_claim('O3 recorrente no dia seguinte', '7a0b0000-0000-4000-8000-0000000000b3', '7a0b0000-0000-4000-8000-0000000000f6', true);

do $$
declare got text;
begin
  select string_agg(passo || '=' || mention || '/' || coalesce(cortado, '-'), '; ' order by ordem) into got from check_claims;
  if got is distinct from
     'O2 (2º post)=true/-; O3 (3º post)=false/true; O3 outro grupo=false/true; O1 outro grupo=true/-; '
     'O1 recorrente (run 2)=false/true; O5 sem @todos=false/-; O3 recorrente no dia seguinte=true/-' then
    raise exception 'FALHOU: orçamento de @todos: %', got;
  end if;
end $$;

select 'ok' as r;

rollback;
