-- Conferência da migração 20261105130000_convalescenca.sql (o número que o WhatsApp derrubou volta
-- devagar), nos DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\convalescenca-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (7c0b…), dois números (o dos grupos
-- e o do atendimento), 30 grupos administrados e comandos de envio. Cada bloco levanta 'FALHOU: …' e o
-- script para ali. Sem erro, a última linha traz r = 'ok'. Antes da migração o bloco 1 falha (função
-- ausente) — é o RED.
--
-- O claim é sempre chamado com p_tenant da loja do check: o bloco de cancelamento dele não toca comando
-- de outra loja.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7c0b0000-0000-4000-8000-000000000001', '7c0b0000-0000-4000-8000-000000000001',
   'Check convalescenca', 'check-convalescenca-7c0b');

insert into public.instances (id, tenant_id, name, status, phone, purpose) values
  ('7c0b0000-0000-4000-8000-0000000000e1', '7c0b0000-0000-4000-8000-000000000001',
   'Check grupos', 'connected', '5511999990001', 'grupos'),
  ('7c0b0000-0000-4000-8000-0000000000e2', '7c0b0000-0000-4000-8000-000000000001',
   'Check privado', 'connected', '5511999990002', 'privado');

-- 30 grupos administrados com gente: veterano pela evidência (>= 5), per_hour 90 e per_day 450; em
-- convalescença, 30/h (um post por hora) e 60/dia (dois posts).
insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin, members)
select '7c0b0000-0000-4000-8000-000000000001', 'conv-adm-' || n || '@g.us', 'Check ' || n, true, 100
from generate_series(1, 30) n;

-- 1) Contrato: funções com security definer, search_path e execute só do service_role; constantes e
--    tabela fora do alcance de anon/authenticated; janelas de 48 h / 14 d; corpos do claim e dos caps =
--    os da migração.
do $$
begin
  if exists (
    select 1
      from (values
        ('public.iniciar_convalescenca(uuid,uuid,timestamptz)'),
        ('app.instance_caps(uuid)'),
        ('app.claim_send_commands(integer,uuid)')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: funções da convalescença/caps/claim fora do contrato (security definer, search_path, execute só service_role)';
  end if;

  if exists (
    select 1
      from (values ('app.convalescenca_pausa()'), ('app.convalescenca_duracao()')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: constantes da convalescença ausentes ou executáveis por anon/authenticated';
  end if;

  if app.convalescenca_pausa() <> interval '48 hours' or app.convalescenca_duracao() <> interval '14 days' then
    raise exception 'FALHOU: janelas da convalescença diferentes de 48 h / 14 dias';
  end if;

  if to_regclass('app.convalescenca') is null
     or has_table_privilege('anon', 'app.convalescenca', 'SELECT')
     or has_table_privilege('authenticated', 'app.convalescenca', 'SELECT') then
    raise exception 'FALHOU: app.convalescenca ausente ou legível por anon/authenticated';
  end if;

  if (select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
        from pg_proc p where p.oid = to_regprocedure('app.claim_send_commands(integer,uuid)'))
     <> '6626ee339918e46214a93ec035c1b40f' then
    raise exception 'FALHOU: corpo de app.claim_send_commands difere da migração 20261105130000';
  end if;
  if (select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
        from pg_proc p where p.oid = to_regprocedure('app.instance_caps(uuid)'))
     <> '5a6f3fc7b8ebb101d7fc8400b46973c0' then
    raise exception 'FALHOU: corpo de app.instance_caps difere da migração 20261105130000';
  end if;
end $$;

-- 2) Recusas que não registram nada: sem hora, instância de outra loja, número do atendimento, derrubada
--    com mais de 14 dias.
do $$
declare r jsonb;
begin
  r := public.iniciar_convalescenca('7c0b0000-0000-4000-8000-000000000001', '7c0b0000-0000-4000-8000-0000000000e1', null);
  if (r->>'iniciada')::boolean or r->>'motivo' <> 'sem_logout' then
    raise exception 'FALHOU: sem logout_at deveria recusar, veio %', r;
  end if;

  r := public.iniciar_convalescenca('00000000-0000-4000-8000-000000000000', '7c0b0000-0000-4000-8000-0000000000e1', now() - interval '26 hours');
  if (r->>'iniciada')::boolean or r->>'motivo' <> 'instancia_desconhecida' then
    raise exception 'FALHOU: instância de outra loja deveria recusar, veio %', r;
  end if;

  r := public.iniciar_convalescenca('7c0b0000-0000-4000-8000-000000000001', '7c0b0000-0000-4000-8000-0000000000e2', now() - interval '26 hours');
  if (r->>'iniciada')::boolean or r->>'motivo' <> 'nao_e_numero_dos_grupos' then
    raise exception 'FALHOU: número do atendimento deveria recusar, veio %', r;
  end if;

  r := public.iniciar_convalescenca('7c0b0000-0000-4000-8000-000000000001', '7c0b0000-0000-4000-8000-0000000000e1', now() - interval '15 days');
  if (r->>'iniciada')::boolean or r->>'motivo' <> 'derrubada_antiga' then
    raise exception 'FALHOU: derrubada de 15 dias deveria recusar, veio %', r;
  end if;

  if exists (select 1 from app.convalescenca where tenant_id = '7c0b0000-0000-4000-8000-000000000001') then
    raise exception 'FALHOU: recusa não pode registrar convalescença';
  end if;
  if exists (select 1 from public.notifications where tenant_id = '7c0b0000-0000-4000-8000-000000000001') then
    raise exception 'FALHOU: recusa não pode notificar';
  end if;
end $$;

-- 3) Antes: veterano pela evidência, tetos cheios; o número do atendimento segue sem teto.
do $$
declare k record;
begin
  select * into k from app.instance_caps('7c0b0000-0000-4000-8000-0000000000e1');
  if k.perfil <> 'veterano' or k.per_min <> 10 or k.per_hour <> 90 or k.per_day <> 450
     or k.admin_groups <> 30 or not k.graduated then
    raise exception 'FALHOU: caps de base esperados veterano/10/90/450, veio %/%/%/%', k.perfil, k.per_min, k.per_hour, k.per_day;
  end if;
  if (select count(*) from app.instance_caps('7c0b0000-0000-4000-8000-0000000000e2')) <> 0 then
    raise exception 'FALHOU: número do atendimento deveria seguir sem teto (zero linhas)';
  end if;
end $$;

insert into public.engine_commands (id, tenant_id, instance_id, type, status, payload, available_at) values
  ('7c0b0000-0000-4000-8000-0000000000c1', '7c0b0000-0000-4000-8000-000000000001',
   '7c0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now()),
  ('7c0b0000-0000-4000-8000-0000000000c2', '7c0b0000-0000-4000-8000-000000000001',
   '7c0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now() + interval '1 hour');

-- 4) Derrubada há 26 h, voltou agora: registra, pausa até logout + 48 h (daqui a 22 h), ritmo reduzido até
--    logout + 14 d (daqui a 12 d 22 h), cancela a fila do número com o motivo, 1 notificação, 1 log. Repetir a mesma
--    derrubada não registra nem notifica de novo.
do $$
declare r jsonb; r2 jsonb; v app.convalescenca;
begin
  r := public.iniciar_convalescenca('7c0b0000-0000-4000-8000-000000000001', '7c0b0000-0000-4000-8000-0000000000e1', now() - interval '26 hours');
  if not (r->>'iniciada')::boolean or (r->>'cancelados')::int <> 2 then
    raise exception 'FALHOU: deveria iniciar e cancelar 2, veio %', r;
  end if;
  select * into v from app.convalescenca where instance_id = '7c0b0000-0000-4000-8000-0000000000e1';
  if v.tenant_id <> '7c0b0000-0000-4000-8000-000000000001'
     or v.posts_pausados_ate not between now() + interval '21 hours 59 minutes' and now() + interval '22 hours 1 minute'
     or v.perfil_ate not between now() + interval '12 days 21 hours 59 minutes' and now() + interval '12 days 22 hours 1 minute'
     or v.cancelados <> 2 then
    raise exception 'FALHOU: janelas da convalescença erradas: pausa até %, perfil até %, cancelados %', v.posts_pausados_ate, v.perfil_ate, v.cancelados;
  end if;
  if (select count(*) from public.engine_commands
       where tenant_id = '7c0b0000-0000-4000-8000-000000000001' and status = 'canceled'
         and error like '%convalescença%') <> 2 then
    raise exception 'FALHOU: fila não foi cancelada com o motivo da convalescença';
  end if;
  if (select count(*) from public.notifications
       where tenant_id = '7c0b0000-0000-4000-8000-000000000001' and type = 'antiban_convalescenca'
         and body like '%pausados até%') <> 1 then
    raise exception 'FALHOU: deveria haver exatamente 1 notificação antiban_convalescenca com a pausa';
  end if;
  if (select count(*) from public.logs
       where tenant_id = '7c0b0000-0000-4000-8000-000000000001' and event = 'antiban_convalescenca'
         and level = 'warn') <> 1 then
    raise exception 'FALHOU: deveria haver exatamente 1 log antiban_convalescenca';
  end if;

  r2 := public.iniciar_convalescenca('7c0b0000-0000-4000-8000-000000000001', '7c0b0000-0000-4000-8000-0000000000e1', now() - interval '26 hours');
  if (r2->>'iniciada')::boolean or r2->>'motivo' <> 'ja_registrada' then
    raise exception 'FALHOU: a mesma derrubada deveria vir ja_registrada, veio %', r2;
  end if;
  if (select count(*) from public.notifications where tenant_id = '7c0b0000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALHOU: a mesma derrubada notificou de novo';
  end if;
end $$;

-- 5) Em convalescença: 4/min, 30/h (um post por hora), 60/dia (dois posts), base veterano por baixo; a RPC
--    da tela devolve o mesmo perfil.
do $$
declare k record;
begin
  select * into k from app.instance_caps('7c0b0000-0000-4000-8000-0000000000e1');
  if k.perfil <> 'convalescente' or k.per_min <> 4 or k.per_hour <> 30 or k.per_day <> 60
     or k.admin_groups <> 30 or not k.graduated then
    raise exception 'FALHOU: caps em convalescença esperados convalescente/4/30/60, veio %/%/%/%', k.perfil, k.per_min, k.per_hour, k.per_day;
  end if;
  if (select h.perfil from public.instance_health('7c0b0000-0000-4000-8000-000000000001') h
       where h.instance_id = '7c0b0000-0000-4000-8000-0000000000e1') <> 'convalescente' then
    raise exception 'FALHOU: instance_health não mostra o perfil convalescente';
  end if;
end $$;

-- 6) Posts pausados: o claim não pega comando do número, e o que passou da tolerância é cancelado com o
--    motivo da convalescença (não "servidor fora do ar"). Comando dentro da tolerância segue na fila.
insert into public.engine_commands (id, tenant_id, instance_id, type, status, payload, available_at) values
  ('7c0b0000-0000-4000-8000-0000000000c3', '7c0b0000-0000-4000-8000-000000000001',
   '7c0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now() - interval '1 second'),
  ('7c0b0000-0000-4000-8000-0000000000c4', '7c0b0000-0000-4000-8000-000000000001',
   '7c0b0000-0000-4000-8000-0000000000e1', 'send_media', 'queued', '{}', now() - interval '20 minutes');

do $$
declare n int;
begin
  select count(*) into n from app.claim_send_commands(5, '7c0b0000-0000-4000-8000-000000000001');
  if n <> 0 then
    raise exception 'FALHOU: claim pegou % comando(s) com os posts pausados', n;
  end if;
  if (select error from public.engine_commands where id = '7c0b0000-0000-4000-8000-0000000000c4')
       not like '%convalescença%' then
    raise exception 'FALHOU: comando parado durante a pausa deveria ser cancelado com o motivo dela';
  end if;
  if (select status::text from public.engine_commands where id = '7c0b0000-0000-4000-8000-0000000000c3') <> 'queued' then
    raise exception 'FALHOU: comando dentro da tolerância deveria seguir na fila';
  end if;
end $$;

-- 7) Pausa acabou (o ritmo reduzido continua): o claim volta a pegar, no teto de convalescente.
update app.convalescenca set posts_pausados_ate = now() - interval '1 second'
 where instance_id = '7c0b0000-0000-4000-8000-0000000000e1';

do $$
declare n int; k record;
begin
  select count(*) into n from app.claim_send_commands(5, '7c0b0000-0000-4000-8000-000000000001');
  if n <> 1 then
    raise exception 'FALHOU: com a pausa acabada o claim deveria pegar 1, pegou %', n;
  end if;
  select * into k from app.instance_caps('7c0b0000-0000-4000-8000-0000000000e1');
  if k.perfil <> 'convalescente' or k.per_hour <> 30 then
    raise exception 'FALHOU: o ritmo reduzido deveria continuar depois da pausa, veio %/%', k.perfil, k.per_hour;
  end if;
end $$;

update public.engine_commands set status = 'done'
 where tenant_id = '7c0b0000-0000-4000-8000-000000000001' and status = 'processing';

-- 8) 14 dias passados: veterano de novo, sem mexer em nada.
update app.convalescenca set perfil_ate = now() - interval '1 second'
 where instance_id = '7c0b0000-0000-4000-8000-0000000000e1';

do $$
declare k record;
begin
  select * into k from app.instance_caps('7c0b0000-0000-4000-8000-0000000000e1');
  if k.perfil <> 'veterano' or k.per_hour <> 90 or k.per_day <> 450 then
    raise exception 'FALHOU: passados 14 dias deveria voltar a veterano/90/450, veio %/%/%', k.perfil, k.per_hour, k.per_day;
  end if;
end $$;

-- 9) Derrubada mais nova (há 2 h) reinicia as janelas e notifica de novo; uma derrubada mais antiga que a
--    registrada é ignorada como já registrada.
do $$
declare r jsonb; v app.convalescenca;
begin
  r := public.iniciar_convalescenca('7c0b0000-0000-4000-8000-000000000001', '7c0b0000-0000-4000-8000-0000000000e1', now() - interval '2 hours');
  if not (r->>'iniciada')::boolean then
    raise exception 'FALHOU: derrubada nova deveria iniciar, veio %', r;
  end if;
  select * into v from app.convalescenca where instance_id = '7c0b0000-0000-4000-8000-0000000000e1';
  if v.posts_pausados_ate not between now() + interval '45 hours 59 minutes' and now() + interval '46 hours 1 minute' then
    raise exception 'FALHOU: a pausa não reiniciou da derrubada nova: %', v.posts_pausados_ate;
  end if;
  if (select count(*) from public.notifications
       where tenant_id = '7c0b0000-0000-4000-8000-000000000001' and type = 'antiban_convalescenca') <> 2 then
    raise exception 'FALHOU: derrubada nova deveria gerar a 2ª notificação';
  end if;
  r := public.iniciar_convalescenca('7c0b0000-0000-4000-8000-000000000001', '7c0b0000-0000-4000-8000-0000000000e1', now() - interval '26 hours');
  if (r->>'iniciada')::boolean or r->>'motivo' <> 'ja_registrada' then
    raise exception 'FALHOU: derrubada mais antiga que a registrada deveria ser ignorada, veio %', r;
  end if;
end $$;

-- 10) Número declarado novo (dia 1 com 30 grupos: 8/min, 40/h, 40/dia): a convalescença aperta o que está
--     acima dela (per_min 4, per_hour 30) e deixa o que já está abaixo (per_day 40 < 60).
update public.instances set numero_perfil = 'novo' where id = '7c0b0000-0000-4000-8000-0000000000e1';

do $$
declare k record;
begin
  select * into k from app.instance_caps('7c0b0000-0000-4000-8000-0000000000e1');
  if k.perfil <> 'convalescente' or k.per_min <> 4 or k.per_hour <> 30 or k.per_day <> 40
     or k.graduated or k.warmup_day <> 1 then
    raise exception 'FALHOU: novo em convalescença esperado convalescente/4/30/40 dia 1, veio %/%/%/% dia %', k.perfil, k.per_min, k.per_hour, k.per_day, k.warmup_day;
  end if;
end $$;

select 'ok' as r;

rollback;
