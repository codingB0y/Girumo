-- ============================================================
-- Sprint 5 / F5 — Ponte disparo → fila do worker
--
-- Antes desta migration, `enqueueBroadcast` só marcava broadcasts.status='queued'
-- e quem convertia isso em envio era o engine legado (POST /api/dispatch/pending).
-- O worker novo consome `engine_commands` e nunca via esse trabalho: desligar o
-- Baileys hoje pararia o disparo.
--
-- Três funções, todas chamadas pelo worker (service_role):
--   app.enqueue_broadcast          — fan-out: 1 comando por grupo, transacional
--   app.reconcile_broadcast_progress — roll-up: comandos → broadcasts.sent/status
--   app.promote_due_schedules      — agendamento vencido → fan-out
--
-- Por que SQL e não TypeScript: o fan-out são 5 passos (ler oferta, resolver
-- instância, resolver grupos, inserir N comandos, atualizar a oferta). Em TS
-- seriam 5 round-trips SEM transação — morrendo no meio sobra metade dos
-- comandos e um `total` mentiroso. Aqui é uma transação só.
-- ============================================================

-- ============================================================
-- 1) Colunas de origem
-- ============================================================

alter table public.engine_commands
  add column if not exists origin_kind   text,
  add column if not exists origin_id     uuid,
  add column if not exists origin_run_id uuid;

comment on column public.engine_commands.origin_kind is
  'O que gerou este comando: ''broadcast'' (hoje) ou ''campaign_message'' (a seguir).';
comment on column public.engine_commands.origin_id is
  'Id da linha de origem. É o que permite o roll-up de progresso sem trigger.';
comment on column public.engine_commands.origin_run_id is
  'Muda a CADA enfileiramento. Sem ele o dedupe_key barraria o reenvio da mesma oferta.';

alter table public.broadcasts
  add column if not exists run_id uuid;

-- run_id também é o marcador de "esta oferta é do motor novo": o engine legado
-- filtra `run_id is null` no claim, então os dois consumidores convivem sem
-- disparo duplo durante o cutover (ver claimPendingBroadcasts).
comment on column public.broadcasts.run_id is
  'Corrida atual do fan-out. Não-nulo = enfileirado pelo worker novo; o engine legado ignora.';

create index if not exists engine_commands_origin_idx
  on public.engine_commands (origin_id, origin_run_id, status)
  where origin_id is not null;

-- ============================================================
-- 2) Fan-out
-- ============================================================

create or replace function app.enqueue_broadcast(
  target_tenant_id uuid,
  target_broadcast_id uuid
)
returns public.broadcasts
language plpgsql
security definer
set search_path = public, app
as $$
declare
  b public.broadcasts;
  target_instance uuid;
  new_run_id uuid := gen_random_uuid();
  cmd_type text;
  jids text[];
  inserted integer := 0;
  msg text;
  media text;
  media_kind text;
  mention boolean;
  poll_question text;
  poll_options text[];
begin
  -- FOR UPDATE serializa duplo-clique no botão: o segundo espera o primeiro
  -- terminar e então cai no guard de status abaixo, em vez de fazer 2 fan-outs.
  select * into b
  from public.broadcasts
  where id = target_broadcast_id and tenant_id = target_tenant_id
  for update;

  if not found then
    return null;
  end if;

  -- Idempotente: já na fila / já rodando não refaz o fan-out. Mesmos estados que
  -- o enqueueBroadcast antigo aceitava (draft/sent/failed).
  if b.status not in ('draft', 'sent', 'failed') then
    return b;
  end if;

  msg := coalesce(b.message, '');
  media := b.media_id;
  mention := coalesce(b.mention_all, false);
  media_kind := case when b.media_type in ('video', 'document') then b.media_type else 'image' end;
  poll_question := nullif(b.poll ->> 'question', '');

  select coalesce(array_agg(value), '{}'::text[])
    into poll_options
  from jsonb_array_elements_text(coalesce(b.poll -> 'options', '[]'::jsonb)) as value
  where value <> '';

  -- Tipo do comando com a MESMA precedência do engine legado
  -- (hubflow-engine/index.js: enquete > mídia > texto).
  if poll_question is not null and coalesce(array_length(poll_options, 1), 0) >= 2 then
    cmd_type := 'send_poll';
  elsif media is not null then
    cmd_type := 'send_media';
  elsif msg <> '' then
    cmd_type := 'send_message';
  else
    update public.broadcasts
    set status = 'failed', error = 'Oferta sem conteúdo (texto, mídia ou enquete).',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Número que vai disparar. Fixado agora: o comando carrega instance_id e o
  -- gate anti-ban é POR NÚMERO, então o alvo precisa ser conhecido no enfileiramento.
  select id into target_instance
  from public.instances
  where tenant_id = target_tenant_id
    and status = 'connected'
    and provider_instance_id is not null
  order by connected_at desc nulls last, created_at asc
  limit 1;

  if target_instance is null then
    update public.broadcasts
    set status = 'failed', error = 'Nenhum número conectado para disparar.',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Destinos. `group_ids` vazio = todos os grupos ADMIN, regra do legado
  -- ("nunca dispara em grupo onde não somos admin").
  --
  -- O is_admin vale para a lista explícita TAMBÉM, e isso é uma mudança de
  -- comportamento deliberada: o sync legado só gravava grupos admin, então uma
  -- lista explícita só podia conter admin. O sync novo (/api/groups/sync) grava
  -- TODOS os grupos com a flag, então sem este filtro o painel passaria a
  -- conseguir disparar onde não somos admin — envio que o WhatsApp recusa, que
  -- queima cota anti-ban e cujas falhas alimentam o breaker do número.
  select coalesce(array_agg(g.whatsapp_group_id order by g.whatsapp_group_id), '{}'::text[])
    into jids
  from public.groups g
  where g.tenant_id = target_tenant_id
    and g.is_admin
    and (
      coalesce(array_length(b.group_ids, 1), 0) = 0
      or g.whatsapp_group_id = any(b.group_ids)
    );

  if coalesce(array_length(jids, 1), 0) = 0 then
    update public.broadcasts
    set status = 'failed', error = 'Nenhum grupo de destino (verifique se o número é admin dos grupos).',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Um comando por grupo. priority 100 = fan-out (ver engine_queue_v2).
  -- O payload é o contrato que apps/worker/src/send-command.ts consome.
  with ins as (
    insert into public.engine_commands (
      tenant_id, instance_id, type, status, payload, priority, dedupe_key,
      origin_kind, origin_id, origin_run_id
    )
    select
      target_tenant_id,
      target_instance,
      cmd_type,
      'queued',
      case cmd_type
        when 'send_poll' then jsonb_build_object(
          'jid', t.jid, 'question', poll_question, 'options', to_jsonb(poll_options))
        when 'send_media' then jsonb_build_object(
          'jid', t.jid, 'mediaId', media, 'mediaType', media_kind,
          'caption', msg, 'mentionAll', mention)
        else jsonb_build_object(
          'jid', t.jid, 'text', msg, 'mentionAll', mention)
      end,
      100,
      -- run_id na chave: sem ele, reenviar a MESMA oferta bateria no índice
      -- único, inseriria 0 linhas e o disparo sumiria em silêncio.
      'bc:' || target_broadcast_id::text || ':' || new_run_id::text || ':' || t.jid,
      'broadcast',
      target_broadcast_id,
      new_run_id
    from unnest(jids) as t(jid)
    on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*)::integer into inserted from ins;

  update public.broadcasts
  set
    run_id = new_run_id,
    status = 'queued',
    sent = 0,
    total = inserted,
    error = null,
    dispatched_at = null,
    running_since = now(),
    last_ack_at = now(),
    updated_at = now()
  where id = target_broadcast_id
  returning * into b;

  return b;
end;
$$;

-- ============================================================
-- 3) Roll-up de progresso
--
-- Agregado, nunca incremento: o envio é at-least-once, então `sent = sent + 1`
-- contaria duas vezes num reenvio. `count(*) filter (where status='done')` é
-- idempotente por construção.
--
-- Fora da transação de complete_engine_command (nada de trigger) DE PROPÓSITO:
-- um trigger que levantasse exceção abortaria o complete, o lease expiraria e o
-- comando seria reenviado — um bug na régua de progresso viraria mensagem
-- duplicada no WhatsApp do cliente.
-- ============================================================

create or replace function app.reconcile_broadcast_progress(max_broadcasts integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  touched integer := 0;
  r record;
  done_count integer;
  pending_count integer;
  total_count integer;
  new_status public.broadcast_status;
  new_error text;
begin
  for r in
    select b.id, b.run_id, b.status, b.sent, b.total, b.error
    from public.broadcasts b
    -- `run_id is not null` não é detalhe: sem ele, todo broadcast legado preso em
    -- 'running' seria marcado 'failed' na primeira execução desta função.
    where b.run_id is not null
      and b.status in ('queued', 'running')
    order by b.updated_at asc
    limit greatest(max_broadcasts, 1)
    for update skip locked
  loop
    select
      count(*) filter (where c.status = 'done'),
      count(*) filter (where c.status in ('queued', 'processing')),
      count(*)
    into done_count, pending_count, total_count
    from public.engine_commands c
    where c.origin_id = r.id and c.origin_run_id = r.run_id;

    new_error := null;

    if total_count = 0 then
      -- engine_commands.instance_id é ON DELETE CASCADE: apagar a instância
      -- evapora a fila sem disparar trigger nenhum. Só um reconciliador vê isso.
      new_status := 'failed';
      new_error := 'A fila deste disparo desapareceu (número removido?).';
    elsif pending_count > 0 then
      new_status := case when done_count > 0 then 'running' else 'queued' end;
    elsif done_count > 0 then
      new_status := 'sent';
    else
      new_status := 'failed';
      new_error := 'Nenhuma mensagem foi entregue.';
    end if;

    -- Só escreve se mudou: sem este guard, todo broadcast vivo seria reescrito a
    -- cada poll de 3 s, disparando realtime no painel à toa.
    if r.status is distinct from new_status
       or r.sent is distinct from done_count
       or r.error is distinct from new_error then
      update public.broadcasts
      set
        status = new_status,
        sent = done_count,
        error = new_error,
        last_ack_at = now(),
        dispatched_at = case when new_status in ('sent', 'failed') then now() else dispatched_at end,
        updated_at = now()
      where id = r.id;
      touched := touched + 1;
    end if;
  end loop;

  return touched;
end;
$$;

-- ============================================================
-- 4) Agendamentos
--
-- Porte de processDueSchedules (apps/web/src/lib/stores/schedules.ts), que só era
-- chamado de dentro de /api/dispatch/pending — rota engine-only que a F5 remove.
-- A diferença: ali o UPDATE marcava 'queued' direto (sem fan-out); aqui chama
-- app.enqueue_broadcast, então o agendamento produz fila de verdade.
-- ============================================================

create or replace function app.promote_due_schedules(max_schedules integer default 50)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  promoted integer := 0;
  s record;
  step interval;
  next_at timestamptz;
begin
  for s in
    select sc.id, sc.tenant_id, sc.broadcast_id, sc.scheduled_at, sc.recurrence
    from public.schedules sc
    where sc.status = 'pending'
      and sc.scheduled_at <= now()
    order by sc.scheduled_at asc
    limit greatest(max_schedules, 1)
    for update skip locked
  loop
    if s.broadcast_id is not null then
      perform app.enqueue_broadcast(s.tenant_id, s.broadcast_id);
      promoted := promoted + 1;
    end if;

    if s.recurrence = 'none' then
      update public.schedules
      set status = 'done', last_run_at = now(), updated_at = now()
      where id = s.id;
    else
      step := case when s.recurrence = 'daily' then interval '1 day' else interval '7 days' end;
      -- Avança até o futuro: um worker parado 3 dias não pode gerar 3 disparos.
      next_at := s.scheduled_at;
      while next_at <= now() loop
        next_at := next_at + step;
      end loop;
      update public.schedules
      set scheduled_at = next_at, last_run_at = now(), updated_at = now()
      where id = s.id;
    end if;
  end loop;

  return promoted;
end;
$$;

-- ============================================================
-- 5) Wrappers PostgREST (service_role apenas)
-- ============================================================

create or replace function public.enqueue_broadcast(
  target_tenant_id uuid,
  target_broadcast_id uuid
)
returns public.broadcasts
language sql
security definer
set search_path = public, app
as $$
  select app.enqueue_broadcast(target_tenant_id, target_broadcast_id);
$$;

create or replace function public.reconcile_broadcast_progress(max_broadcasts integer default 200)
returns integer
language sql
security definer
set search_path = public, app
as $$
  select app.reconcile_broadcast_progress(max_broadcasts);
$$;

create or replace function public.promote_due_schedules(max_schedules integer default 50)
returns integer
language sql
security definer
set search_path = public, app
as $$
  select app.promote_due_schedules(max_schedules);
$$;

revoke execute on function public.enqueue_broadcast(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reconcile_broadcast_progress(integer) from public, anon, authenticated;
revoke execute on function public.promote_due_schedules(integer) from public, anon, authenticated;

grant execute on function public.enqueue_broadcast(uuid, uuid) to service_role;
grant execute on function public.reconcile_broadcast_progress(integer) to service_role;
grant execute on function public.promote_due_schedules(integer) to service_role;
