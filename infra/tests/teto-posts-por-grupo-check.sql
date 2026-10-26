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
-- Blocos: 1 contrato (funções, ACL, teto, índice); 2 o que conta no dia.

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
    (t, i1, 'send_message', 'processing', jsonb_build_object('jid', 'teto-g2@g.us'), v_hoje + interval '1 minute');

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

select 'ok' as r;

rollback;
