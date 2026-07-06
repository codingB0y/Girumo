-- HUBFLOW - Engine command leases and fencing
-- Apply after 202606240005_engine_rpc.sql.

begin;

do $$
begin
  create type public.engine_command_failure_kind as enum ('retryable', 'permanent', 'uncertain');
exception
  when duplicate_object then null;
end
$$;

alter table public.engine_commands
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists effect_started_at timestamptz,
  add column if not exists failure_kind public.engine_command_failure_kind;

do $$
begin
  alter table public.engine_commands
    add constraint engine_commands_attempt_count_nonnegative check (attempt_count >= 0);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.engine_commands
    add constraint engine_commands_max_attempts_positive check (max_attempts > 0);
exception
  when duplicate_object then null;
end
$$;

create index if not exists engine_commands_processing_lease_expiry_idx
  on public.engine_commands (lease_expires_at)
  where status = 'processing';

-- Commands processing before leases existed have an unknowable delivery outcome.
-- Never replay them automatically because their external effect may exist.
update public.engine_commands
set
  status = 'failed',
  failure_kind = 'uncertain',
  failed_at = coalesce(failed_at, now()),
  error = coalesce(error, 'Legacy processing command had no lease; delivery outcome is uncertain.'),
  updated_at = now()
where status = 'processing'
  and lease_token is null;

-- Drop the one-argument overload before exposing the fenced contract to PostgREST.
drop function if exists app.claim_engine_commands(integer);

create or replace function app.claim_engine_commands(
  max_commands integer default 5,
  lease_seconds integer default 60
)
returns setof public.engine_commands
language plpgsql
security definer
set search_path = public, app
as $$
declare
  bounded_lease_seconds integer := greatest(15, least(coalesce(lease_seconds, 60), 900));
  recovered_event_count integer;
begin
  -- Status predicate plus row lock makes recovery idempotent under concurrency.
  with expired_candidates as (
    select command.id
    from public.engine_commands as command
    where command.status = 'processing'
      and command.lease_expires_at <= now()
    order by command.lease_expires_at asc
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
        when command.effect_started_at is null and command.attempt_count < command.max_attempts then now()
        else command.available_at
      end,
      claimed_at = case
        when command.effect_started_at is null and command.attempt_count < command.max_attempts then null
        else command.claimed_at
      end,
      failed_at = case
        when command.effect_started_at is null and command.attempt_count < command.max_attempts then null
        else now()
      end,
      error = case
        when command.effect_started_at is not null then 'Lease expired after the external effect started; delivery outcome is uncertain.'
        when command.attempt_count >= command.max_attempts then 'Lease expired and maximum attempts were exhausted.'
        else 'Lease expired before the external effect; command requeued.'
      end,
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
    from expired_candidates
    where command.id = expired_candidates.id
      and command.status = 'processing'
      and command.lease_expires_at <= now()
    returning
      command.tenant_id,
      command.instance_id,
      command.command_id,
      command.attempt_count,
      command.status,
      command.failure_kind
  ),
  inserted_events as (
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
    from recovered
    returning 1
  )
  select count(*) into recovered_event_count from inserted_events;

  return query
  with queued_candidates as (
    select command.id
    from public.engine_commands as command
    where command.status = 'queued'
      and command.available_at <= now()
      and command.attempt_count < command.max_attempts
    order by command.created_at asc
    limit least(greatest(coalesce(max_commands, 5), 1), 100)
    for update skip locked
  )
  update public.engine_commands as command
  set
    status = 'processing',
    claimed_at = now(),
    completed_at = null,
    failed_at = null,
    failure_kind = null,
    effect_started_at = null,
    attempt_count = command.attempt_count + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => bounded_lease_seconds),
    updated_at = now()
  from queued_candidates
  where command.id = queued_candidates.id
    and command.status = 'queued'
    and command.available_at <= now()
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
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated_command public.engine_commands;
  bounded_lease_seconds integer := greatest(15, least(coalesce(lease_seconds, 60), 900));
begin
  update public.engine_commands as command
  set
    lease_expires_at = now() + make_interval(secs => bounded_lease_seconds),
    updated_at = now()
  where command.command_id = target_command_id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > now()
  returning command.* into updated_command;

  return updated_command;
end;
$$;

create or replace function app.mark_engine_command_effect_started(
  target_command_id uuid,
  target_lease_token uuid
)
returns public.engine_commands
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated_command public.engine_commands;
begin
  update public.engine_commands as command
  set
    effect_started_at = coalesce(command.effect_started_at, now()),
    updated_at = now()
  where command.command_id = target_command_id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > now()
  returning command.* into updated_command;

  return updated_command;
end;
$$;

-- Remove the unfenced completion overload so old clients cannot bypass ownership.
drop function if exists app.complete_engine_command(uuid, boolean, text);

create or replace function app.complete_engine_command(
  target_command_id uuid,
  target_lease_token uuid,
  success boolean,
  error_message text default null,
  target_failure_kind public.engine_command_failure_kind default 'retryable',
  retry_delay_seconds integer default 30
)
returns public.engine_commands
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated_command public.engine_commands;
  bounded_retry_delay_seconds integer := greatest(0, least(coalesce(retry_delay_seconds, 30), 86400));
begin
  if success is null then
    raise exception 'success must not be null';
  end if;

  update public.engine_commands as command
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
        then now() + make_interval(secs => bounded_retry_delay_seconds)
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
    completed_at = case when success then now() else null end,
    failed_at = case
      when success then null
      when command.effect_started_at is null
        and coalesce(target_failure_kind, 'retryable') = 'retryable'
        and command.attempt_count < command.max_attempts
        then null
      else now()
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
    updated_at = now()
  where command.command_id = target_command_id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > now()
  returning command.* into updated_command;

  return updated_command;
end;
$$;

revoke execute on function app.claim_engine_commands(integer, integer) from public, anon, authenticated;
revoke execute on function app.renew_engine_command_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function app.mark_engine_command_effect_started(uuid, uuid) from public, anon, authenticated;
revoke execute on function app.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer) from public, anon, authenticated;

grant execute on function app.claim_engine_commands(integer, integer) to service_role;
grant execute on function app.renew_engine_command_lease(uuid, uuid, integer) to service_role;
grant execute on function app.mark_engine_command_effect_started(uuid, uuid) to service_role;
grant execute on function app.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer) to service_role;

commit;
