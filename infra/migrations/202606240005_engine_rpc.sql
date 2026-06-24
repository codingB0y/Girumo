-- HUBFLOW - Fase 6 - Engine command RPC helpers
-- Apply after engine_commands and engine_events exist.

create or replace function app.claim_engine_commands(max_commands integer default 5)
returns setof public.engine_commands
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return query
  update public.engine_commands c
  set
    status = 'processing',
    claimed_at = now(),
    updated_at = now()
  where c.id in (
    select pending.id
    from public.engine_commands pending
    where pending.status = 'queued'
      and pending.available_at <= now()
    order by pending.created_at asc
    limit greatest(max_commands, 1)
    for update skip locked
  )
  returning c.*;
end;
$$;

create or replace function app.complete_engine_command(
  target_command_id uuid,
  success boolean,
  error_message text default null
)
returns public.engine_commands
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated public.engine_commands;
begin
  update public.engine_commands
  set
    status = case when success then 'done'::public.engine_command_status else 'failed'::public.engine_command_status end,
    completed_at = case when success then now() else completed_at end,
    failed_at = case when success then failed_at else now() end,
    error = case when success then null else error_message end,
    updated_at = now()
  where command_id = target_command_id
  returning * into updated;

  return updated;
end;
$$;

create or replace function app.record_engine_event(
  target_tenant_id uuid,
  target_instance_id uuid,
  target_type text,
  target_payload jsonb default '{}'::jsonb,
  target_event_id uuid default gen_random_uuid()
)
returns public.engine_events
language plpgsql
security definer
set search_path = public, app
as $$
declare
  inserted public.engine_events;
begin
  insert into public.engine_events (
    tenant_id,
    instance_id,
    event_id,
    type,
    payload,
    status
  )
  values (
    target_tenant_id,
    target_instance_id,
    target_event_id,
    target_type,
    coalesce(target_payload, '{}'::jsonb),
    'received'
  )
  on conflict (event_id) do update set
    payload = excluded.payload,
    updated_at = now()
  returning * into inserted;

  return inserted;
end;
$$;

create or replace function app.update_instance_status(
  target_tenant_id uuid,
  target_instance_id uuid,
  target_status public.instance_status,
  target_phone text default null,
  target_qr_code text default null,
  target_engine_node text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns public.instances
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated public.instances;
begin
  update public.instances
  set
    status = target_status,
    phone = coalesce(target_phone, phone),
    qr_code = case when target_status = 'qr' then target_qr_code else null end,
    last_seen_at = now(),
    connected_at = case when target_status = 'connected' then coalesce(connected_at, now()) else connected_at end,
    disconnected_at = case when target_status in ('disconnected', 'blocked', 'error') then now() else disconnected_at end,
    engine_node = coalesce(target_engine_node, engine_node),
    metadata = metadata || coalesce(target_metadata, '{}'::jsonb),
    updated_at = now()
  where id = target_instance_id
    and tenant_id = target_tenant_id
  returning * into updated;

  return updated;
end;
$$;
