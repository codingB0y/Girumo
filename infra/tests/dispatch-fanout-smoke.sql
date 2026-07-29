-- ============================================================
-- Smoke do fan-out de disparo (20260730100000_dispatch_fanout.sql)
-- Postgres real, schema real. Cada bloco falha alto (assert) se a regra quebrar.
--
-- Como rodar: contra um Postgres 16 descartável com o schema completo aplicado
-- (infra/migrations/* na ordem, depois apps/web/supabase/migrations/* na ordem).
-- Precisa dos roles service_role/anon/authenticated e de um stub do schema `auth`
-- (auth.users + auth.uid()), que o Supabase provê e o Postgres cru não.
--
--   psql -d <db> -v ON_ERROR_STOP=1 -f infra/tests/dispatch-fanout-smoke.sql
--
-- Usa dois tenants fixos (1111…/2222…) e limpa tudo no fim. NÃO rode em produção.
-- ============================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ------------------------------------------------------------
-- Fixture
-- ------------------------------------------------------------
create or replace function pg_temp.reset_fixture() returns void language plpgsql as $fx$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  t2 uuid := '22222222-2222-4222-8222-222222222222';
begin
  delete from public.engine_commands where tenant_id in (t, t2);
  delete from public.schedules where tenant_id in (t, t2);
  delete from public.broadcasts where tenant_id in (t, t2);
  delete from public.groups where tenant_id in (t, t2);
  delete from public.instances where tenant_id in (t, t2);
  delete from public.organizations where tenant_id in (t, t2);

  -- organizations tem check (tenant_id = id)
  insert into public.organizations (id, tenant_id, name, slug) values
    (t, t, 'Tenant A', 'tenant-a'), (t2, t2, 'Tenant B', 'tenant-b');

  -- número conectado e provisionado
  insert into public.instances (id, tenant_id, name, status, provider_instance_id, connected_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', t, 'principal', 'connected', 'gr_principal', now());

  -- 3 grupos admin + 1 NÃO-admin (o sync novo grava os dois tipos)
  insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin) values
    (t, '111@g.us', 'Grupo 1', true),
    (t, '222@g.us', 'Grupo 2', true),
    (t, '333@g.us', 'Grupo 3', true),
    (t, '999@g.us', 'Grupo alheio', false);
end;
$fx$;

-- ------------------------------------------------------------
-- 1) Fan-out básico: 1 comando por grupo admin, tipo texto
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
  n integer;
  bs public.broadcasts;
begin
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Oferta texto', 'bom dia', '{}') returning id into b;

  bs := app.enqueue_broadcast(t, b);

  select count(*) into n from public.engine_commands where origin_id = b;
  assert n = 3, format('esperava 3 comandos (só grupos admin), veio %s', n);

  assert (select count(*) from public.engine_commands
          where origin_id = b and type = 'send_message') = 3, 'tipo deveria ser send_message';

  -- o grupo NÃO-admin não pode receber nada
  assert (select count(*) from public.engine_commands
          where origin_id = b and payload->>'jid' = '999@g.us') = 0,
         'grupo não-admin não pode entrar no fan-out';

  assert bs.status = 'queued', format('status deveria ser queued, veio %s', bs.status);
  assert bs.total = 3, format('total deveria ser 3, veio %s', bs.total);
  assert bs.run_id is not null, 'run_id deveria ter sido gravado';

  -- payload no contrato que send-command.ts consome
  assert (select payload->>'text' from public.engine_commands
          where origin_id = b limit 1) = 'bom dia', 'payload.text errado';
  assert (select payload->>'mentionAll' from public.engine_commands
          where origin_id = b limit 1) = 'false', 'payload.mentionAll errado';
  assert (select instance_id from public.engine_commands where origin_id = b limit 1)
         = 'aaaaaaaa-0000-4000-8000-000000000001', 'instance_id errado';
  assert (select priority from public.engine_commands where origin_id = b limit 1) = 100,
         'priority do fan-out deveria ser 100';

  raise notice 'OK 1 — fan-out básico (3 admin, não-admin fora, payload correto)';
end $$;

-- ------------------------------------------------------------
-- 2) group_ids explícito é interseccionado com os grupos admin
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
begin
  perform pg_temp.reset_fixture();
  -- pede 2 admin + 1 não-admin + 1 inexistente
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Lista explícita', 'oi', array['111@g.us','222@g.us','999@g.us','000@g.us'])
  returning id into b;

  perform app.enqueue_broadcast(t, b);

  assert (select count(*) from public.engine_commands where origin_id = b) = 2,
         'lista explícita deveria render só os 2 admin existentes';
  assert (select count(*) from public.engine_commands
          where origin_id = b and payload->>'jid' in ('999@g.us','000@g.us')) = 0,
         'não-admin/inexistente não pode entrar';

  raise notice 'OK 2 — lista explícita interseccionada com admin';
end $$;

-- ------------------------------------------------------------
-- 3) Precedência: enquete > mídia > texto (regra do engine legado)
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
  p jsonb;
begin
  perform pg_temp.reset_fixture();

  -- tem os três: enquete tem de ganhar
  insert into public.broadcasts (tenant_id, name, message, group_ids, media_id, media_type, poll)
  values (t, 'Tudo', 'texto', '{}', 'bWVkaWE', 'image',
          '{"question":"Qual?","options":["A","B"]}'::jsonb)
  returning id into b;
  perform app.enqueue_broadcast(t, b);
  assert (select count(*) from public.engine_commands where origin_id = b and type = 'send_poll') = 3,
         'enquete deveria ter precedência sobre mídia e texto';
  select payload into p from public.engine_commands where origin_id = b limit 1;
  assert p->>'question' = 'Qual?', 'payload.question errado';
  assert p->'options' = '["A","B"]'::jsonb, 'payload.options errado';

  -- mídia + texto (sem enquete): mídia ganha, texto vira caption
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids, media_id, media_type, mention_all)
  values (t, 'Foto', 'legenda', '{}', 'bWVkaWE', 'video', true)
  returning id into b;
  perform app.enqueue_broadcast(t, b);
  assert (select count(*) from public.engine_commands where origin_id = b and type = 'send_media') = 3,
         'mídia deveria ganhar do texto';
  select payload into p from public.engine_commands where origin_id = b limit 1;
  assert p->>'mediaId' = 'bWVkaWE', 'payload.mediaId errado';
  assert p->>'mediaType' = 'video', 'payload.mediaType errado';
  assert p->>'caption' = 'legenda', 'payload.caption errado';
  assert p->>'mentionAll' = 'true', 'payload.mentionAll deveria ser true';

  -- enquete com 1 opção só NÃO é enquete (WhatsApp exige 2+): cai para texto
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids, poll)
  values (t, 'Enquete torta', 'fallback', '{}', '{"question":"Q","options":["só uma"]}'::jsonb)
  returning id into b;
  perform app.enqueue_broadcast(t, b);
  assert (select count(*) from public.engine_commands where origin_id = b and type = 'send_message') = 3,
         'enquete com <2 opções deveria cair para texto';

  raise notice 'OK 3 — precedência enquete > mídia > texto';
end $$;

-- ------------------------------------------------------------
-- 4) Duplo-clique não duplica; reenvio gera run_id novo
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
  run1 uuid;
  run2 uuid;
begin
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Duplo', 'oi', '{}') returning id into b;

  perform app.enqueue_broadcast(t, b);
  select run_id into run1 from public.broadcasts where id = b;

  -- segundo clique com a oferta já 'queued': guard de status barra
  perform app.enqueue_broadcast(t, b);
  assert (select count(*) from public.engine_commands where origin_id = b) = 3,
         'duplo-clique não pode duplicar comandos';
  assert (select run_id from public.broadcasts where id = b) = run1,
         'duplo-clique não pode trocar o run_id';

  -- REENVIO legítimo: oferta volta a 'sent', dispara de novo
  update public.broadcasts set status = 'sent' where id = b;
  perform app.enqueue_broadcast(t, b);
  select run_id into run2 from public.broadcasts where id = b;

  assert run2 <> run1, 'reenvio deveria gerar run_id novo';
  assert (select count(*) from public.engine_commands where origin_id = b and origin_run_id = run2) = 3,
         'reenvio deveria inserir 3 comandos novos — se der 0, o dedupe_key comeu o disparo';
  assert (select total from public.broadcasts where id = b) = 3, 'total do reenvio errado';

  raise notice 'OK 4 — duplo-clique idempotente, reenvio com run_id novo';
end $$;

-- ------------------------------------------------------------
-- 5) Falhas de fan-out com mensagem clara
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
  bs public.broadcasts;
begin
  -- (a) sem número conectado
  perform pg_temp.reset_fixture();
  update public.instances set status = 'disconnected' where tenant_id = t;
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Sem número', 'oi', '{}') returning id into b;
  bs := app.enqueue_broadcast(t, b);
  assert bs.status = 'failed', 'sem número conectado deveria falhar';
  assert bs.error like '%número conectado%', format('mensagem ruim: %s', bs.error);
  assert (select count(*) from public.engine_commands where origin_id = b) = 0,
         'não pode enfileirar nada sem número';

  -- (b) instância conectada mas sem provider_instance_id
  perform pg_temp.reset_fixture();
  update public.instances set provider_instance_id = null where tenant_id = t;
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Sem provider', 'oi', '{}') returning id into b;
  bs := app.enqueue_broadcast(t, b);
  assert bs.status = 'failed', 'instância sem provider_instance_id deveria falhar';

  -- (c) sem grupo de destino
  perform pg_temp.reset_fixture();
  update public.groups set is_admin = false where tenant_id = t;
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Sem grupo', 'oi', '{}') returning id into b;
  bs := app.enqueue_broadcast(t, b);
  assert bs.status = 'failed', 'sem grupo admin deveria falhar';
  assert bs.error like '%admin%', format('mensagem ruim: %s', bs.error);

  -- (d) oferta sem conteúdo nenhum
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Vazia', '', '{}') returning id into b;
  bs := app.enqueue_broadcast(t, b);
  assert bs.status = 'failed', 'oferta sem conteúdo deveria falhar';
  assert bs.error like '%conteúdo%', format('mensagem ruim: %s', bs.error);

  raise notice 'OK 5 — falhas de fan-out com mensagem clara';
end $$;

-- ------------------------------------------------------------
-- 6) Isolamento multi-tenant
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  t2 uuid := '22222222-2222-4222-8222-222222222222';
  b uuid;
  bs public.broadcasts;
begin
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Do tenant A', 'oi', '{}') returning id into b;

  -- tenant B tentando enfileirar a oferta do tenant A
  bs := app.enqueue_broadcast(t2, b);
  assert bs is null, 'tenant errado não pode enfileirar oferta alheia';
  assert (select count(*) from public.engine_commands where origin_id = b) = 0,
         'nada pode ser enfileirado para o tenant errado';

  raise notice 'OK 6 — isolamento multi-tenant';
end $$;

-- ------------------------------------------------------------
-- 7) Reconciliador: queued → running → sent
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
  cid uuid;
  touched integer;
begin
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Progresso', 'oi', '{}') returning id into b;
  perform app.enqueue_broadcast(t, b);

  -- nada concluído ainda: continua queued e NÃO reescreve (guard de "só se mudou")
  touched := app.reconcile_broadcast_progress(100);
  assert (select status from public.broadcasts where id = b) = 'queued',
         'sem nada concluído deveria seguir queued';
  assert touched = 0, format('não deveria reescrever nada, reescreveu %s', touched);

  -- 1 concluído de 3 → running, sent = 1
  select id into cid from public.engine_commands where origin_id = b order by id limit 1;
  update public.engine_commands set status = 'done' where id = cid;
  perform app.reconcile_broadcast_progress(100);
  assert (select status from public.broadcasts where id = b) = 'running',
         'com 1 de 3 concluído deveria ser running';
  assert (select sent from public.broadcasts where id = b) = 1, 'sent deveria ser 1';

  -- todos concluídos → sent
  update public.engine_commands set status = 'done' where origin_id = b;
  perform app.reconcile_broadcast_progress(100);
  assert (select status from public.broadcasts where id = b) = 'sent',
         'com tudo concluído deveria ser sent';
  assert (select sent from public.broadcasts where id = b) = 3, 'sent deveria ser 3';
  assert (select error from public.broadcasts where id = b) is null, 'não deveria ter erro';
  assert (select dispatched_at from public.broadcasts where id = b) is not null,
         'dispatched_at deveria ser preenchido no fim';

  raise notice 'OK 7 — reconciliador queued → running → sent';
end $$;

-- ------------------------------------------------------------
-- 8) Reconciliador: retry NÃO conta como falha; agregado é idempotente
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
  cid uuid;
begin
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Retry', 'oi', '{}') returning id into b;
  perform app.enqueue_broadcast(t, b);

  -- um comando voltou para a fila (lease expirado / retry): ainda é pendente
  select id into cid from public.engine_commands where origin_id = b order by id limit 1;
  update public.engine_commands set status = 'queued', attempts = 2 where id = cid;
  update public.engine_commands set status = 'done' where origin_id = b and id <> cid;

  perform app.reconcile_broadcast_progress(100);
  assert (select status from public.broadcasts where id = b) = 'running',
         'comando em retry deveria manter o disparo em running, não falhar';
  assert (select sent from public.broadcasts where id = b) = 2, 'sent deveria ser 2';

  -- rodar de novo não muda nada (agregado, não incremento)
  update public.engine_commands set status = 'done' where id = cid;
  perform app.reconcile_broadcast_progress(100);
  perform app.reconcile_broadcast_progress(100);
  perform app.reconcile_broadcast_progress(100);
  assert (select sent from public.broadcasts where id = b) = 3,
         'agregado tem de ser idempotente — 3 execuções não podem inflar o sent';

  raise notice 'OK 8 — retry não vira falha, agregado idempotente';
end $$;

-- ------------------------------------------------------------
-- 9) Reconciliador: tudo falhou → failed; fila sumida → failed explicado
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
begin
  -- (a) todos os comandos falharam
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Tudo falhou', 'oi', '{}') returning id into b;
  perform app.enqueue_broadcast(t, b);
  update public.engine_commands set status = 'failed' where origin_id = b;
  perform app.reconcile_broadcast_progress(100);
  assert (select status from public.broadcasts where id = b) = 'failed',
         'sem nenhum done deveria ser failed';
  assert (select sent from public.broadcasts where id = b) = 0, 'sent deveria ser 0';

  -- (b) fila evaporada pelo CASCADE da instância
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Fila sumiu', 'oi', '{}') returning id into b;
  perform app.enqueue_broadcast(t, b);
  delete from public.instances where tenant_id = t;   -- CASCADE leva os comandos
  assert (select count(*) from public.engine_commands where origin_id = b) = 0,
         'pré-condição: o CASCADE deveria ter apagado os comandos';
  perform app.reconcile_broadcast_progress(100);
  assert (select status from public.broadcasts where id = b) = 'failed',
         'fila evaporada deveria virar failed';
  assert (select error from public.broadcasts where id = b) like '%desapareceu%',
         'erro deveria explicar que a fila sumiu';

  raise notice 'OK 9 — falha total e fila evaporada';
end $$;

-- ------------------------------------------------------------
-- 10) Reconciliador NÃO toca broadcast legado (run_id null)
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
begin
  perform pg_temp.reset_fixture();
  -- oferta do motor ANTIGO: presa em running, sem run_id, sem comandos
  insert into public.broadcasts (tenant_id, name, message, group_ids, status, sent, total)
  values (t, 'Legado', 'oi', '{}', 'running', 7, 10) returning id into b;

  perform app.reconcile_broadcast_progress(100);

  assert (select status from public.broadcasts where id = b) = 'running',
         'broadcast legado (run_id null) não pode ser tocado pelo reconciliador';
  assert (select sent from public.broadcasts where id = b) = 7, 'sent do legado não pode mudar';

  raise notice 'OK 10 — broadcast legado intocado';
end $$;

-- ------------------------------------------------------------
-- 11) Agendamento vencido vira fan-out de verdade
-- ------------------------------------------------------------
do $$
declare
  t uuid := '11111111-1111-4111-8111-111111111111';
  b uuid;
  s uuid;
  promoted integer;
  prox timestamptz;
begin
  -- (a) recorrência 'none' → done
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Agendada', 'oi', '{}') returning id into b;
  insert into public.schedules (tenant_id, broadcast_id, name, scheduled_at, recurrence)
  values (t, b, 'ag', now() - interval '5 minutes', 'none') returning id into s;

  promoted := app.promote_due_schedules(50);
  assert promoted = 1, format('deveria promover 1, promoveu %s', promoted);
  assert (select count(*) from public.engine_commands where origin_id = b) = 3,
         'o agendamento tem de gerar fila de verdade, não só marcar queued';
  assert (select status from public.broadcasts where id = b) = 'queued', 'oferta deveria ficar queued';
  assert (select status from public.schedules where id = s) = 'done', 'agendamento deveria ficar done';

  -- (b) agendamento futuro não é tocado
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Futura', 'oi', '{}') returning id into b;
  insert into public.schedules (tenant_id, broadcast_id, name, scheduled_at, recurrence)
  values (t, b, 'ag', now() + interval '1 hour', 'none') returning id into s;
  promoted := app.promote_due_schedules(50);
  assert promoted = 0, 'agendamento futuro não pode ser promovido';
  assert (select count(*) from public.engine_commands where origin_id = b) = 0, 'nada deveria enfileirar';

  -- (c) recorrência diária atrasada 3 dias reprograma para o FUTURO (1 disparo, não 3)
  perform pg_temp.reset_fixture();
  insert into public.broadcasts (tenant_id, name, message, group_ids)
  values (t, 'Diária', 'oi', '{}') returning id into b;
  insert into public.schedules (tenant_id, broadcast_id, name, scheduled_at, recurrence)
  values (t, b, 'ag', now() - interval '3 days', 'daily') returning id into s;

  promoted := app.promote_due_schedules(50);
  assert promoted = 1, 'deveria promover 1 vez';
  assert (select count(*) from public.engine_commands where origin_id = b) = 3,
         'worker parado 3 dias não pode gerar 3 disparos';
  select scheduled_at into prox from public.schedules where id = s;
  assert prox > now(), format('próxima execução deveria estar no futuro, veio %s', prox);
  assert (select status from public.schedules where id = s) = 'pending',
         'recorrente deveria seguir pending';

  raise notice 'OK 11 — agendamentos (none, futuro, recorrente atrasado)';
end $$;

-- ------------------------------------------------------------
-- 12) Wrappers públicos existem e são service_role-only
-- ------------------------------------------------------------
do $$
begin
  assert has_function_privilege('service_role', 'public.enqueue_broadcast(uuid,uuid)', 'execute'),
         'service_role precisa executar enqueue_broadcast';
  assert not has_function_privilege('anon', 'public.enqueue_broadcast(uuid,uuid)', 'execute'),
         'anon NÃO pode executar enqueue_broadcast';
  assert not has_function_privilege('authenticated', 'public.reconcile_broadcast_progress(integer)', 'execute'),
         'authenticated NÃO pode executar o reconciliador';
  assert not has_function_privilege('anon', 'public.promote_due_schedules(integer)', 'execute'),
         'anon NÃO pode executar promote_due_schedules';

  raise notice 'OK 12 — grants dos wrappers';
end $$;

-- limpeza
do $$
begin
  perform pg_temp.reset_fixture();
  delete from public.organizations where tenant_id in
    ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
end $$;

select '=== SMOKE DO FAN-OUT: TODAS AS ASSERÇÕES PASSARAM ===' as resultado;
