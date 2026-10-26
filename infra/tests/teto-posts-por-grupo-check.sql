-- Conferência da migração 20261026120000_teto_posts_por_grupo.sql (teto de 4 posts por grupo por dia),
-- nos DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\teto-posts-por-grupo-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (7e70…), dois números
-- conectados, três grupos administrados e comandos de envio com created_at explícito. Cada bloco
-- levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha traz r = 'ok'. Antes da migração o
-- bloco 1 falha (função ausente) — é o RED.
--
-- Blocos: 1 contrato (funções, ACL, teto, índice); 2 o que conta no dia; 3 trava e corpo de
-- app.enqueue_broadcast; 4 o 4º post sai e o 5º fica de fora (parcial); 5 todos de fora e o
-- recorrente; 6 aviso ao lotar.
--
-- O bloco 6 chama public.enviar_avisos_lotou, que varre TODAS as lojas: o que fizer com linhas reais
-- é desfeito pelo rollback, e os asserts olham só a loja de teste. Escreve, mesmo com rollback: em
-- prod é do Igor.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7e700000-0000-4000-8000-000000000001', '7e700000-0000-4000-8000-000000000001',
   'Check teto posts', 'check-teto-posts-7e70');

-- Dois números conectados e provisionados (provider_instance_id preenchido, como no fan-out de verdade).
insert into public.instances (id, tenant_id, name, status, provider_instance_id, connected_at) values
  ('7e700000-0000-4000-8000-0000000000e1', '7e700000-0000-4000-8000-000000000001',
   'Check 1', 'connected', 'gr_check_teto_1', now()),
  ('7e700000-0000-4000-8000-0000000000e2', '7e700000-0000-4000-8000-000000000001',
   'Check 2', 'connected', 'gr_check_teto_2', now());

-- Três grupos administrados com 100 membros.
insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin, members) values
  ('7e700000-0000-4000-8000-000000000001', 'teto-g1@g.us', 'Check grupo 1', true, 100),
  ('7e700000-0000-4000-8000-000000000001', 'teto-g2@g.us', 'Check grupo 2', true, 100),
  ('7e700000-0000-4000-8000-000000000001', 'teto-g3@g.us', 'Check grupo 3', true, 100);

-- 1) Contrato: as três funções existem, nenhuma é chamável por anon/authenticated e todas por
--    service_role; as duas security definer têm search_path; teto = 4; índice do dia criado.
do $$
begin
  if exists (
    select 1
      from (values
        ('app.posts_por_grupo_dia()'),
        ('app.posts_hoje_por_grupo(uuid)'),
        ('public.posts_hoje_por_grupo(uuid)')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: funções do teto ausentes ou fora do contrato (execute só service_role)';
  end if;

  if exists (
    select 1
      from (values
        ('app.posts_hoje_por_grupo(uuid)'),
        ('public.posts_hoje_por_grupo(uuid)')) as f(sig)
      join pg_proc p on p.oid = to_regprocedure(f.sig)
     where not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
  ) then
    raise exception 'FALHOU: as funções de contagem têm que ser security definer com search_path';
  end if;

  if app.posts_por_grupo_dia() <> 4 then
    raise exception 'FALHOU: teto de posts por grupo por dia diferente de 4';
  end if;

  if to_regclass('public.engine_commands_posts_dia_idx') is null then
    raise exception 'FALHOU: índice engine_commands_posts_dia_idx ausente';
  end if;
end $$;

-- 2) O que conta no dia (Brasília). g1: 2 done pelo número 1 + 1 queued pelo número 2 (os dois números
--    somam) = 3; canceled, failed e o done de 1 minuto antes da meia-noite não contam. g2: 1 processing.
--    Também não contam: comando de outro tipo (refresh_status, tipo real já aposentado) done para g1, e
--    comando de envio sem jid no payload (sem a chave ou com jid nulo).
do $$
declare
  t      constant uuid := '7e700000-0000-4000-8000-000000000001';
  i1     constant uuid := '7e700000-0000-4000-8000-0000000000e1';
  i2     constant uuid := '7e700000-0000-4000-8000-0000000000e2';
  v_hoje timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
begin
  insert into public.engine_commands (tenant_id, instance_id, type, status, payload, created_at) values
    (t, i1, 'send_media',   'done',       jsonb_build_object('jid', 'teto-g1@g.us'), v_hoje + interval '1 minute'),
    (t, i1, 'send_media',   'done',       jsonb_build_object('jid', 'teto-g1@g.us'), v_hoje + interval '1 minute'),
    (t, i2, 'send_poll',    'queued',     jsonb_build_object('jid', 'teto-g1@g.us'), v_hoje + interval '2 minutes'),
    (t, i1, 'send_message', 'canceled',   jsonb_build_object('jid', 'teto-g1@g.us'), v_hoje + interval '3 minutes'),
    (t, i1, 'send_message', 'failed',     jsonb_build_object('jid', 'teto-g1@g.us'), v_hoje + interval '3 minutes'),
    (t, i1, 'send_media',   'done',       jsonb_build_object('jid', 'teto-g1@g.us'), v_hoje - interval '1 minute'),
    (t, i1, 'send_message', 'processing', jsonb_build_object('jid', 'teto-g2@g.us'), v_hoje + interval '1 minute'),
    (t, i1, 'refresh_status', 'done',     jsonb_build_object('jid', 'teto-g1@g.us'), v_hoje + interval '1 minute'),
    (t, i1, 'send_message', 'done',       '{}'::jsonb,                               v_hoje + interval '1 minute'),
    (t, i1, 'send_media',   'done',       '{"jid": null}'::jsonb,                    v_hoje + interval '1 minute');

  if (select jsonb_object_agg(jid, posts) from app.posts_hoje_por_grupo(t))
     is distinct from '{"teto-g1@g.us": 3, "teto-g2@g.us": 1}'::jsonb then
    raise exception 'FALHOU: contagem do dia errada';
  end if;
  if public.posts_hoje_por_grupo(t)
     is distinct from '{"teto": 4, "grupos": {"teto-g1@g.us": 3, "teto-g2@g.us": 1}}'::jsonb then
    raise exception 'FALHOU: leitura da tela errada';
  end if;
  if public.posts_hoje_por_grupo(gen_random_uuid()) is distinct from '{"teto": 4, "grupos": {}}'::jsonb then
    raise exception 'FALHOU: loja sem post deveria devolver grupos vazio';
  end if;
end $$;

-- 3) Trava: app.enqueue_broadcast pega o advisory lock da loja ANTES de contar (dois posts juntos não
--    leem o mesmo "3"), o corpo é o desta migração (md5 normalizado, como na trava da migração) e o
--    execute segue só do service_role.
do $$
declare
  v_oid oid := to_regprocedure('app.enqueue_broadcast(uuid,uuid)');
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
  if v_src is null then
    raise exception 'FALHOU: app.enqueue_broadcast(uuid,uuid) ausente';
  end if;
  if position('pg_advisory_xact_lock' in v_src) = 0
     or position('pg_advisory_xact_lock' in v_src) > position('posts_hoje_por_grupo' in v_src) then
    raise exception 'FALHOU: app.enqueue_broadcast tem que pegar pg_advisory_xact_lock antes de contar (posts_hoje_por_grupo)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       <> '1f4dd5f929572998777a1fd9c4901398' then
    raise exception 'FALHOU: corpo de app.enqueue_broadcast diferente do desta migração';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'FALHOU: execute de app.enqueue_broadcast deveria ser só do service_role';
  end if;
end $$;

-- 4) Parcial. Do bloco 2: g1 = 3, g2 = 1. O post A para g1 sai (g1 = 4). O post B para g1 e g2 com
--    @todos sai só para g2: g1 ganha, na mesma rodada, o comando canceled com foraDoTeto e o motivo
--    (mesma dedupe_key, mesmo número, mesmo payload); o post fica queued com total 2 (inclui o de fora).
--    A linha de fora não conta: g1 segue em 4.
do $$
declare
  t        constant uuid := '7e700000-0000-4000-8000-000000000001';
  v_motivo constant text := 'Não enviado: este grupo já recebeu 4 posts hoje (limite do anti-ban). Volta à meia-noite.';
  v_id     uuid;
  b        public.broadcasts;
  c1       public.engine_commands;
  c2       public.engine_commands;
begin
  insert into public.broadcasts (tenant_id, name, message, group_ids, status)
  values (t, 'Check teto A', 'oferta', array['teto-g1@g.us'], 'draft')
  returning id into v_id;
  b := app.enqueue_broadcast(t, v_id);
  if b.status is distinct from 'queued' or b.total <> 1 then
    raise exception 'FALHOU: post A (4º do g1) deveria sair: status %, total %', b.status, b.total;
  end if;
  if exists (select 1 from public.engine_commands c
             where c.origin_id = v_id and c.origin_run_id = b.run_id
               and (c.status <> 'queued' or c.payload ? 'foraDoTeto' or c.error is not null)) then
    raise exception 'FALHOU: o comando do post A deveria ser queued, sem foraDoTeto';
  end if;

  insert into public.broadcasts (tenant_id, name, message, group_ids, mention_all, status)
  values (t, 'Check teto B', 'oferta', array['teto-g1@g.us', 'teto-g2@g.us'], true, 'draft')
  returning id into v_id;
  b := app.enqueue_broadcast(t, v_id);
  if b.status is distinct from 'queued' or b.total <> 2 or b.sent <> 0 or b.error is not null then
    raise exception 'FALHOU: post B (parcial) deveria ficar queued com total 2: status %, total %, error %',
      b.status, b.total, b.error;
  end if;

  select * into c2 from public.engine_commands c
  where c.origin_id = v_id and c.origin_run_id = b.run_id and c.payload->>'jid' = 'teto-g2@g.us';
  if c2.status is distinct from 'queued' or c2.payload ? 'foraDoTeto' or c2.error is not null
     or c2.payload->>'mentionAll' is distinct from 'true' then
    raise exception 'FALHOU: g2 (abaixo do teto) deveria receber o comando queued de sempre';
  end if;

  select * into c1 from public.engine_commands c
  where c.origin_id = v_id and c.origin_run_id = b.run_id and c.payload->>'jid' = 'teto-g1@g.us';
  if c1.status is distinct from 'canceled' or c1.payload->>'foraDoTeto' is distinct from 'true'
     or c1.claimed_at is not null or c1.error is distinct from v_motivo then
    raise exception 'FALHOU: g1 (no teto) deveria ganhar comando canceled com foraDoTeto e o motivo: status %, error %',
      c1.status, c1.error;
  end if;
  if c1.dedupe_key is distinct from 'bc:' || v_id::text || ':' || b.run_id::text || ':teto-g1@g.us'
     or c1.instance_id is distinct from c2.instance_id
     or c1.origin_kind is distinct from 'broadcast' or c1.type is distinct from c2.type
     or (c1.payload - 'foraDoTeto') is distinct from jsonb_set(c2.payload, '{jid}', '"teto-g1@g.us"') then
    raise exception 'FALHOU: o comando de fora deveria ter a dedupe_key, o número, a origem e o payload de sempre';
  end if;

  if (select jsonb_object_agg(jid, posts) from app.posts_hoje_por_grupo(t))
     is distinct from '{"teto-g1@g.us": 4, "teto-g2@g.us": 2}'::jsonb then
    raise exception 'FALHOU: depois do parcial, g1 deveria seguir em 4 (a linha de fora não conta) e g2 ir a 2';
  end if;
end $$;

-- 5) Todos de fora. O post C só para g1 (em 4) não sai: vira failed com o erro do teto, numa rodada nova
--    (run_id, running_since) com a linha canceled/foraDoTeto, para a coluna do post mostrar "limite do
--    dia". Enfileirar de novo o mesmo post (failed é aceito, como no recorrente do dia seguinte) abre
--    outra rodada com outra linha de fora.
do $$
declare
  t        constant uuid := '7e700000-0000-4000-8000-000000000001';
  v_motivo constant text := 'Não enviado: este grupo já recebeu 4 posts hoje (limite do anti-ban). Volta à meia-noite.';
  v_erro   constant text := 'Nenhum grupo recebeu: todos já tinham 4 posts hoje. O limite volta à meia-noite.';
  v_id     uuid;
  v_run    uuid;
  b        public.broadcasts;
begin
  insert into public.broadcasts (tenant_id, name, message, group_ids, status)
  values (t, 'Check teto C', 'oferta', array['teto-g1@g.us'], 'draft')
  returning id into v_id;
  b := app.enqueue_broadcast(t, v_id);
  if b.status is distinct from 'failed' or b.error is distinct from v_erro or b.total <> 1 or b.sent <> 0
     or b.run_id is null or b.running_since is null then
    raise exception 'FALHOU: post C (todos de fora) deveria virar failed com o erro do teto: status %, total %, error %',
      b.status, b.total, b.error;
  end if;
  if (select count(*) from public.engine_commands c
      where c.origin_id = v_id and c.origin_run_id = b.run_id) <> 1
     or not exists (select 1 from public.engine_commands c
                    where c.origin_id = v_id and c.origin_run_id = b.run_id
                      and c.status = 'canceled' and c.payload->>'foraDoTeto' = 'true'
                      and c.payload->>'jid' = 'teto-g1@g.us' and c.error = v_motivo) then
    raise exception 'FALHOU: a rodada do post C deveria ter só a linha canceled/foraDoTeto do g1';
  end if;

  v_run := b.run_id;
  b := app.enqueue_broadcast(t, v_id);
  if b.run_id is null or b.run_id = v_run or b.status is distinct from 'failed' or b.error is distinct from v_erro then
    raise exception 'FALHOU: reenfileirar o post failed deveria abrir rodada nova, de novo failed';
  end if;
  if (select count(*) from public.engine_commands c
      where c.origin_id = v_id and c.origin_run_id = b.run_id
        and c.status = 'canceled' and c.payload->>'foraDoTeto' = 'true') <> 1 then
    raise exception 'FALHOU: a rodada nova do post C deveria ter uma linha de fora';
  end if;

  if (select h.posts from app.posts_hoje_por_grupo(t) h where h.jid = 'teto-g1@g.us') <> 4 then
    raise exception 'FALHOU: as linhas de fora do post C não deveriam contar no g1';
  end if;
end $$;

-- 6) Aviso ao lotar segue a regra. g3 recebe 4 posts e lota; a varredura cria o "Aviso ao lotar · …",
--    que volta failed com o erro do teto, e g3 fica com aviso_lotou_em (o aviso não sai depois: aceito
--    na spec). O retorno de enviar_avisos_lotou conta avisos enfileirados de TODAS as lojas, então o
--    assert é sobre o aviso desta loja, não sobre o número devolvido.
-- A varredura trava linhas reais até o rollback (em prod também): sem lock em 5 s, ou passando de
-- 2 min, aborta em vez de segurar o worker.
set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $$
declare
  t      constant uuid := '7e700000-0000-4000-8000-000000000001';
  v_erro constant text := 'Nenhum grupo recebeu: todos já tinham 4 posts hoje. O limite volta à meia-noite.';
  v_id   uuid;
  v_plano uuid;
  b      public.broadcasts;
  i      integer;
begin
  for i in 1..4 loop
    insert into public.broadcasts (tenant_id, name, message, group_ids, status)
    values (t, 'Check teto g3 ' || i, 'oferta', array['teto-g3@g.us'], 'draft')
    returning id into v_id;
    b := app.enqueue_broadcast(t, v_id);
    if b.status is distinct from 'queued' then
      raise exception 'FALHOU: post % do g3 deveria sair: status %', i, b.status;
    end if;
  end loop;

  -- Loja com plano (plans é catálogo global: qualquer plano serve), campanha com aviso ligado há
  -- 1 minuto e g3 lotado agora, sem aviso.
  select p.id into v_plano from public.plans p order by p.id limit 1;
  if v_plano is null then
    raise exception 'FALHOU fixture: public.plans vazio, não dá para montar a loja com plano';
  end if;
  insert into public.subscriptions (tenant_id, plan_id, status) values (t, v_plano, 'active');
  insert into public.campaign_groups
    (id, tenant_id, name, slug, group_ids, aviso_ao_lotar, aviso_ao_lotar_desde)
  values
    ('7e700000-0000-4000-8000-0000000000c1', t, 'Check teto campanha', 'check-teto-posts-7e70',
     array['teto-g3@g.us'], 'Lotou! Entre no próximo pelo link da campanha.', now() - interval '1 minute');
  update public.groups
     set lotado_em = now(), lotado_por = 'manual', aviso_lotou_em = null
   where tenant_id = t and whatsapp_group_id = 'teto-g3@g.us';

  -- Lote grande: a varredura vai por lotado_em, e grupos reais lotados na última hora viriam antes.
  perform public.enviar_avisos_lotou(100000);

  if (select count(*) from public.broadcasts x where x.tenant_id = t and x.name like 'Aviso ao lotar · %') <> 1 then
    raise exception 'FALHOU: a varredura deveria criar um aviso para g3';
  end if;
  select * into b from public.broadcasts x where x.tenant_id = t and x.name like 'Aviso ao lotar · %';
  if b.status is distinct from 'failed' or b.error is distinct from v_erro then
    raise exception 'FALHOU: o aviso ao lotar no g3 (em 4) deveria virar failed com o erro do teto: status %, error %',
      b.status, b.error;
  end if;
  if exists (select 1 from public.engine_commands c
             where c.origin_id = b.id and c.origin_run_id = b.run_id
               and (c.status <> 'canceled' or c.payload->>'foraDoTeto' is distinct from 'true'))
     or not exists (select 1 from public.engine_commands c
                    where c.origin_id = b.id and c.origin_run_id = b.run_id
                      and c.payload->>'jid' = 'teto-g3@g.us') then
    raise exception 'FALHOU: o aviso deveria ter só a linha de fora do g3';
  end if;
  if (select g.aviso_lotou_em from public.groups g
      where g.tenant_id = t and g.whatsapp_group_id = 'teto-g3@g.us') is null then
    raise exception 'FALHOU: g3 deveria ficar com aviso_lotou_em (a varredura carimba mesmo sem envio)';
  end if;
  if (select h.posts from app.posts_hoje_por_grupo(t) h where h.jid = 'teto-g3@g.us') <> 4 then
    raise exception 'FALHOU: g3 deveria seguir em 4 depois do aviso de fora';
  end if;
end $$;

select 'ok' as r;

rollback;
