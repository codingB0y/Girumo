-- ============================================================
-- HUBFLOW DEV — STORAGE + RPC + SEED
-- Executar após 03_rls_policies.sql
-- ============================================================

-- ========== STORAGE BUCKET ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 52428800, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Storage policies
create policy "storage_select_member" on storage.objects
  for select using (
    bucket_id = 'uploads'
    and app.has_membership((storage.foldername(name))[1]::uuid)
  );

create policy "storage_insert_member" on storage.objects
  for insert with check (
    bucket_id = 'uploads'
    and app.has_membership((storage.foldername(name))[1]::uuid)
  );

create policy "storage_update_member" on storage.objects
  for update using (
    bucket_id = 'uploads'
    and app.has_membership((storage.foldername(name))[1]::uuid)
  );

create policy "storage_delete_admin" on storage.objects
  for delete using (
    bucket_id = 'uploads'
    and app.has_role((storage.foldername(name))[1]::uuid, array['owner','admin']::public.member_role[])
  );

-- ========== ENGINE RPCs ==========

drop function if exists public.claim_engine_commands(integer);
drop function if exists public.complete_engine_command(uuid, boolean, text);
drop function if exists public.record_engine_event(uuid, uuid, text, jsonb, uuid);
drop function if exists public.update_instance_status(uuid, uuid, public.instance_status, text, text, text, jsonb);
drop function if exists app.claim_engine_commands(integer);
drop function if exists app.complete_engine_command(uuid, boolean, text);

create or replace function app.claim_engine_commands(max_commands integer default 5, lease_seconds integer default 60)
returns setof public.engine_commands
language plpgsql security definer set search_path = public, app as $$
declare
  bounded_lease_seconds integer := greatest(15, least(coalesce(lease_seconds, 60), 900));
begin
  with expired_candidates as (
    select command.id
    from public.engine_commands as command
    where command.status = 'processing'
      and command.lease_expires_at <= clock_timestamp()
    order by command.lease_expires_at asc, command.id asc
    limit least(greatest(coalesce(max_commands, 5), 1), 100)
    for update skip locked
  ),
  recovered as (
    update public.engine_commands as command
    set
      status = case
        when command.effect_started_at is not null then 'failed'::public.engine_command_status
        when command.attempt_count >= command.max_attempts then 'failed'::public.engine_command_status
        else 'queued'::public.engine_command_status
      end,
      failure_kind = case
        when command.effect_started_at is not null then 'uncertain'::public.engine_command_failure_kind
        when command.attempt_count >= command.max_attempts then 'permanent'::public.engine_command_failure_kind
        else 'retryable'::public.engine_command_failure_kind
      end,
      available_at = case
        when command.effect_started_at is null and command.attempt_count < command.max_attempts then clock_timestamp()
        else command.available_at
      end,
      claimed_at = case
        when command.effect_started_at is null and command.attempt_count < command.max_attempts then null
        else command.claimed_at
      end,
      failed_at = case
        when command.effect_started_at is null and command.attempt_count < command.max_attempts then null
        else clock_timestamp()
      end,
      error = case
        when command.effect_started_at is not null then 'Lease expired after the external effect started; delivery outcome is uncertain.'
        when command.attempt_count >= command.max_attempts then 'Lease expired and maximum attempts were exhausted.'
        else 'Lease expired before the external effect; command requeued.'
      end,
      lease_token = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
    from expired_candidates
    where command.id = expired_candidates.id
      and command.status = 'processing'
      and command.lease_expires_at <= clock_timestamp()
    returning
      command.tenant_id,
      command.instance_id,
      command.command_id,
      command.attempt_count,
      command.status,
      command.failure_kind
  )
  insert into public.engine_events (
    tenant_id,
    instance_id,
    event_id,
    type,
    payload,
    status
  )
  select
    recovered.tenant_id,
    recovered.instance_id,
    gen_random_uuid(),
    case
      when recovered.failure_kind = 'uncertain' then 'engine_command_uncertain'
      when recovered.failure_kind = 'permanent' then 'engine_command_attempts_exhausted'
      else 'engine_command_requeued'
    end,
    jsonb_build_object(
      'command_id', recovered.command_id,
      'attempt_count', recovered.attempt_count
    ),
    'received'
  from recovered;

  return query
  with queued_candidates as (
    select command.id
    from public.engine_commands as command
    where command.status = 'queued'
      and command.available_at <= clock_timestamp()
      and command.attempt_count < command.max_attempts
    order by command.created_at asc, command.id asc
    limit least(greatest(coalesce(max_commands, 5), 1), 100)
    for update skip locked
  )
  update public.engine_commands as command
  set
    status = 'processing',
    claimed_at = clock_timestamp(),
    completed_at = null,
    failed_at = null,
    failure_kind = null,
    effect_started_at = null,
    attempt_count = command.attempt_count + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = clock_timestamp() + make_interval(secs => bounded_lease_seconds),
    updated_at = clock_timestamp()
  from queued_candidates
  where command.id = queued_candidates.id
    and command.status = 'queued'
    and command.available_at <= clock_timestamp()
    and command.attempt_count < command.max_attempts
  returning command.*;
end;
$$;

create or replace function app.renew_engine_command_lease(
  target_command_id uuid,
  target_lease_token uuid,
  lease_seconds integer default 60
)
returns public.engine_commands
language plpgsql security definer set search_path = public, app as $$
declare
  updated public.engine_commands;
  locked public.engine_commands;
  bounded_lease_seconds integer := greatest(15, least(coalesce(lease_seconds, 60), 900));
begin
  select command.* into locked
  from public.engine_commands command
  where command.command_id = target_command_id
  for update;

  if not found
    or locked.status <> 'processing'
    or locked.lease_token is distinct from target_lease_token
    or locked.lease_expires_at is null
    or locked.lease_expires_at <= clock_timestamp()
  then
    return null;
  end if;

  update public.engine_commands command
  set
    lease_expires_at = greatest(locked.lease_expires_at, clock_timestamp() + make_interval(secs => bounded_lease_seconds)),
    updated_at = clock_timestamp()
  where command.id = locked.id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > clock_timestamp()
  returning * into updated;

  return updated;
end;
$$;

create or replace function app.mark_engine_command_effect_started(
  target_command_id uuid,
  target_lease_token uuid
)
returns public.engine_commands
language plpgsql security definer set search_path = public, app as $$
declare
  updated public.engine_commands;
  locked public.engine_commands;
begin
  select command.* into locked
  from public.engine_commands command
  where command.command_id = target_command_id
  for update;

  if not found
    or locked.status <> 'processing'
    or locked.lease_token is distinct from target_lease_token
    or locked.lease_expires_at is null
    or locked.lease_expires_at <= clock_timestamp()
  then
    return null;
  end if;

  update public.engine_commands command
  set effect_started_at = coalesce(command.effect_started_at, clock_timestamp()), updated_at = clock_timestamp()
  where command.id = locked.id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > clock_timestamp()
  returning * into updated;

  return updated;
end;
$$;

create or replace function app.complete_engine_command(
  target_command_id uuid,
  target_lease_token uuid,
  success boolean,
  error_message text default null,
  target_failure_kind public.engine_command_failure_kind default 'retryable',
  retry_delay_seconds integer default 30
)
returns public.engine_commands
language plpgsql security definer set search_path = public, app as $$
declare
  updated public.engine_commands;
  locked public.engine_commands;
  bounded_retry_delay_seconds integer := greatest(0, least(coalesce(retry_delay_seconds, 30), 86400));
begin
  if success is null then
    raise exception 'success must not be null';
  end if;

  select command.* into locked
  from public.engine_commands command
  where command.command_id = target_command_id
  for update;

  if not found
    or locked.status <> 'processing'
    or locked.lease_token is distinct from target_lease_token
    or locked.lease_expires_at is null
    or locked.lease_expires_at <= clock_timestamp()
  then
    return null;
  end if;

  update public.engine_commands command
  set
    status = case
      when success then 'done'::public.engine_command_status
      when command.effect_started_at is not null then 'failed'::public.engine_command_status
      when coalesce(target_failure_kind, 'retryable') = 'uncertain' then 'failed'::public.engine_command_status
      when coalesce(target_failure_kind, 'retryable') = 'permanent' then 'failed'::public.engine_command_status
      when command.attempt_count >= command.max_attempts then 'failed'::public.engine_command_status
      else 'queued'::public.engine_command_status
    end,
    failure_kind = case
      when success then null
      when command.effect_started_at is not null then 'uncertain'::public.engine_command_failure_kind
      when coalesce(target_failure_kind, 'retryable') = 'uncertain' then 'uncertain'::public.engine_command_failure_kind
      when coalesce(target_failure_kind, 'retryable') = 'permanent' then 'permanent'::public.engine_command_failure_kind
      when command.attempt_count >= command.max_attempts then 'permanent'::public.engine_command_failure_kind
      else 'retryable'::public.engine_command_failure_kind
    end,
    available_at = case
      when not success
        and command.effect_started_at is null
        and coalesce(target_failure_kind, 'retryable') = 'retryable'
        and command.attempt_count < command.max_attempts
        then clock_timestamp() + make_interval(secs => bounded_retry_delay_seconds)
      else command.available_at
    end,
    claimed_at = case
      when not success
        and command.effect_started_at is null
        and coalesce(target_failure_kind, 'retryable') = 'retryable'
        and command.attempt_count < command.max_attempts
        then null
      else command.claimed_at
    end,
    completed_at = case when success then clock_timestamp() else null end,
    failed_at = case
      when success then null
      when command.effect_started_at is null
        and coalesce(target_failure_kind, 'retryable') = 'retryable'
        and command.attempt_count < command.max_attempts
        then null
      else clock_timestamp()
    end,
    error = case when success then null else error_message end,
    effect_started_at = case
      when not success
        and command.effect_started_at is null
        and coalesce(target_failure_kind, 'retryable') = 'retryable'
        and command.attempt_count < command.max_attempts
        then null
      else command.effect_started_at
    end,
    lease_token = null,
    lease_expires_at = null,
    updated_at = clock_timestamp()
  where command.id = locked.id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > clock_timestamp()
  returning * into updated;

  return updated;
end;
$$;

create or replace function app.record_engine_event(
  target_tenant_id uuid, target_instance_id uuid, target_type text,
  target_payload jsonb default '{}'::jsonb, target_event_id uuid default gen_random_uuid()
)
returns public.engine_events
language plpgsql security definer set search_path = public, app as $$
declare inserted public.engine_events;
begin
  insert into public.engine_events (tenant_id, instance_id, event_id, type, payload, status)
  values (target_tenant_id, target_instance_id, target_event_id, target_type, coalesce(target_payload, '{}'::jsonb), 'received')
  on conflict (event_id) do update set payload = excluded.payload, updated_at = now()
  returning * into inserted;
  return inserted;
end;
$$;

create or replace function app.update_instance_status(
  target_tenant_id uuid, target_instance_id uuid, target_status public.instance_status,
  target_phone text default null, target_qr_code text default null,
  target_engine_node text default null, target_metadata jsonb default '{}'::jsonb
)
returns public.instances
language plpgsql security definer set search_path = public, app as $$
declare updated public.instances;
begin
  update public.instances set
    status = target_status,
    phone = coalesce(target_phone, phone),
    qr_code = case when target_status = 'qr' then target_qr_code else null end,
    last_seen_at = now(),
    connected_at = case when target_status = 'connected' then coalesce(connected_at, now()) else connected_at end,
    disconnected_at = case when target_status in ('disconnected', 'blocked', 'error') then now() else disconnected_at end,
    engine_node = coalesce(target_engine_node, engine_node),
    metadata = metadata || coalesce(target_metadata, '{}'::jsonb),
    updated_at = now()
  where id = target_instance_id and tenant_id = target_tenant_id
  returning * into updated;
  return updated;
end;
$$;

create or replace function public.claim_engine_commands(
  max_commands integer default 5,
  lease_seconds integer default 60
)
returns setof public.engine_commands
language sql security definer set search_path = pg_catalog as $$
  select * from app.claim_engine_commands(max_commands, lease_seconds);
$$;

create or replace function public.renew_engine_command_lease(
  target_command_id uuid,
  target_lease_token uuid,
  lease_seconds integer default 60
)
returns public.engine_commands
language sql security definer set search_path = pg_catalog as $$
  select * from app.renew_engine_command_lease(target_command_id, target_lease_token, lease_seconds);
$$;

create or replace function public.mark_engine_command_effect_started(
  target_command_id uuid,
  target_lease_token uuid
)
returns public.engine_commands
language sql security definer set search_path = pg_catalog as $$
  select * from app.mark_engine_command_effect_started(target_command_id, target_lease_token);
$$;

create or replace function public.complete_engine_command(
  target_command_id uuid,
  target_lease_token uuid,
  success boolean,
  error_message text default null,
  target_failure_kind public.engine_command_failure_kind default 'retryable',
  retry_delay_seconds integer default 30
)
returns public.engine_commands
language sql security definer set search_path = pg_catalog as $$
  select * from app.complete_engine_command(
    target_command_id,
    target_lease_token,
    success,
    error_message,
    target_failure_kind,
    retry_delay_seconds
  );
$$;

create or replace function public.record_engine_event(
  target_command_id uuid,
  target_lease_token uuid,
  target_tenant_id uuid,
  target_instance_id uuid,
  target_type text,
  target_payload jsonb default '{}'::jsonb,
  target_event_id uuid default gen_random_uuid()
)
returns public.engine_events
language sql security definer set search_path = pg_catalog as $$
  with owned_command as materialized (
    select command.id
    from public.engine_commands as command
    where command.command_id = target_command_id
      and command.status = 'processing'
      and command.lease_token = target_lease_token
      and command.lease_expires_at > pg_catalog.clock_timestamp()
    for update
  )
  select event_row.*
  from owned_command
  cross join lateral app.record_engine_event(
    target_tenant_id,
    target_instance_id,
    target_type,
    target_payload,
    target_event_id
  ) as event_row;
$$;

create or replace function public.update_instance_status(
  target_command_id uuid,
  target_lease_token uuid,
  target_tenant_id uuid,
  target_instance_id uuid,
  target_status public.instance_status,
  target_phone text default null,
  target_qr_code text default null,
  target_engine_node text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns public.instances
language sql security definer set search_path = pg_catalog as $$
  with owned_command as materialized (
    select command.id
    from public.engine_commands as command
    where command.command_id = target_command_id
      and command.status = 'processing'
      and command.lease_token = target_lease_token
      and command.lease_expires_at > pg_catalog.clock_timestamp()
    for update
  )
  select instance_row.*
  from owned_command
  cross join lateral app.update_instance_status(
    target_tenant_id,
    target_instance_id,
    target_status,
    target_phone,
    target_qr_code,
    target_engine_node,
    target_metadata
  ) as instance_row;
$$;

revoke execute on function app.claim_engine_commands(integer, integer) from public, anon, authenticated, service_role;
revoke execute on function app.renew_engine_command_lease(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke execute on function app.mark_engine_command_effect_started(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function app.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer) from public, anon, authenticated, service_role;
revoke execute on function app.record_engine_event(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke execute on function app.update_instance_status(uuid, uuid, public.instance_status, text, text, text, jsonb) from public, anon, authenticated, service_role;

revoke execute on function public.claim_engine_commands(integer, integer) from public, anon, authenticated;
revoke execute on function public.renew_engine_command_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.mark_engine_command_effect_started(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer) from public, anon, authenticated;
revoke execute on function public.record_engine_event(uuid, uuid, uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.update_instance_status(uuid, uuid, uuid, uuid, public.instance_status, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.claim_engine_commands(integer, integer) to service_role;
grant execute on function public.renew_engine_command_lease(uuid, uuid, integer) to service_role;
grant execute on function public.mark_engine_command_effect_started(uuid, uuid) to service_role;
grant execute on function public.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer) to service_role;
grant execute on function public.record_engine_event(uuid, uuid, uuid, uuid, text, jsonb, uuid) to service_role;
grant execute on function public.update_instance_status(uuid, uuid, uuid, uuid, public.instance_status, text, text, text, jsonb) to service_role;

create or replace function increment_template_uses(template_id uuid)
returns void language sql security definer as $$
  update templates set uses = uses + 1 where id = template_id;
$$;

-- ========== SEED: SYSTEM ORG + PLANS ==========

insert into public.organizations (id, tenant_id, name, slug, status, metadata)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'HUBFLOW System',
  'hubflow-system',
  'active',
  '{"system": true}'::jsonb
)
on conflict (id) do update set name = excluded.name, slug = excluded.slug;

insert into public.plans (tenant_id, code, name, stripe_price_id, limits, active, sort_order)
values
(
  '00000000-0000-0000-0000-000000000001', 'FREE', 'FREE', null,
  '{"whatsapp_instances":1,"contacts":250,"campaigns":0,"funnels":1,"uploads_mb":100,"team_members":1}'::jsonb,
  true, 10
),
(
  '00000000-0000-0000-0000-000000000001', 'ESSENCIAL', 'Essencial', null,
  '{"whatsapp_instances":1,"contacts":2000,"campaigns":10,"funnels":5,"uploads_mb":1024,"team_members":3}'::jsonb,
  true, 20
),
(
  '00000000-0000-0000-0000-000000000001', 'GROWTH', 'Growth', null,
  '{"whatsapp_instances":3,"contacts":10000,"campaigns":50,"funnels":20,"uploads_mb":5120,"team_members":10}'::jsonb,
  true, 30
),
(
  '00000000-0000-0000-0000-000000000001', 'PERFORMANCE_MAX', 'Performance Max', null,
  '{"whatsapp_instances":10,"contacts":100000,"campaigns":500,"funnels":100,"uploads_mb":51200,"team_members":50}'::jsonb,
  true, 40
)
on conflict (code) do update set
  name = excluded.name,
  limits = excluded.limits,
  active = excluded.active,
  sort_order = excluded.sort_order;

-- ============================================================
-- PRONTO! Schema completo aplicado.
-- Agora suba o app e rode: POST /api/admin/seed/dev
-- ============================================================
