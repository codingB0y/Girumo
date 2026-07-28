-- HUBFLOW - Engine command leases and fencing
-- Apply after 202606240005_engine_rpc.sql.
--
-- Safe whether or not 20260713120000_engine_queue_v2.sql (tracked lane,
-- apps/web/supabase/migrations/) has already run: max_attempts default is
-- pinned to 5 below either way, matching what that migration already applied
-- in production. See finding-painel-heartbeat-false-disconnect in project
-- memory for how the two migrations were reconciled.

begin;

do $$
begin
  create type public.engine_command_failure_kind as enum ('retryable', 'permanent', 'uncertain');
exception
  when duplicate_object then null;
end
$$;

-- IF NOT EXISTS must not hide an incompatible enum left by a partial/manual deploy.
do $$
declare
  actual_labels text[];
begin
  select array_agg(enum_label.enumlabel::text order by enum_label.enumsortorder)
  into actual_labels
  from pg_catalog.pg_type as enum_type
  join pg_catalog.pg_namespace as enum_namespace
    on enum_namespace.oid = enum_type.typnamespace
  join pg_catalog.pg_enum as enum_label
    on enum_label.enumtypid = enum_type.oid
  where enum_namespace.nspname = 'public'
    and enum_type.typname = 'engine_command_failure_kind';

  if actual_labels is distinct from array['retryable', 'permanent', 'uncertain']::text[] then
    raise exception 'Schema drift: public.engine_command_failure_kind has labels %, expected %',
      actual_labels,
      array['retryable', 'permanent', 'uncertain']::text[];
  end if;
end
$$;

-- max_attempts default is 5, not 3: 20260713120000_engine_queue_v2.sql already
-- added this column in production (and dev/staging apply this migration after
-- that one too) with default 5. Reconciling to the already-live value avoids a
-- schema-drift false positive below without touching a column that predates
-- this migration. attempts/priority/dedupe_key from that same migration are
-- superseded by attempt_count/lease_token below and become dormant; left in
-- place rather than dropped here to keep this migration purely additive.
alter table public.engine_commands
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists effect_started_at timestamptz,
  add column if not exists failure_kind public.engine_command_failure_kind;

-- Validate catalog shape explicitly because ADD COLUMN IF NOT EXISTS does not
-- verify the type, default or nullability of a pre-existing column.
do $$
declare
  expected record;
  actual_type oid;
  actual_type_name text;
  actual_not_null boolean;
  actual_default text;
begin
  for expected in
    select *
    from (values
      ('lease_token', 'pg_catalog.uuid'::pg_catalog.regtype, false, null::text),
      ('lease_expires_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, false, null::text),
      ('attempt_count', 'pg_catalog.int4'::pg_catalog.regtype, true, '0'::text),
      ('max_attempts', 'pg_catalog.int4'::pg_catalog.regtype, true, '5'::text),
      ('effect_started_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, false, null::text),
      ('failure_kind', 'public.engine_command_failure_kind'::pg_catalog.regtype, false, null::text)
    ) as expected_columns(column_name, type_oid, is_not_null, default_expression)
  loop
    select
      column_catalog.atttypid,
      pg_catalog.format_type(column_catalog.atttypid, column_catalog.atttypmod),
      column_catalog.attnotnull,
      pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid)
    into actual_type, actual_type_name, actual_not_null, actual_default
    from pg_catalog.pg_attribute as column_catalog
    left join pg_catalog.pg_attrdef as column_default
      on column_default.adrelid = column_catalog.attrelid
      and column_default.adnum = column_catalog.attnum
    where column_catalog.attrelid = 'public.engine_commands'::pg_catalog.regclass
      and column_catalog.attname = expected.column_name
      and not column_catalog.attisdropped;

    if not found then
      raise exception 'Schema drift: public.engine_commands.% is missing', expected.column_name;
    end if;

    if actual_type <> expected.type_oid
      or actual_not_null is distinct from expected.is_not_null
      or (
        expected.default_expression is null
        and actual_default is not null
      )
      or (
        expected.default_expression is not null
        and (
          actual_default is null
          or actual_default not in (
            expected.default_expression,
            expected.default_expression || '::integer'
          )
        )
      )
    then
      raise exception 'Schema drift: public.engine_commands.% has type %, not_null %, default %',
        expected.column_name,
        actual_type_name,
        actual_not_null,
        actual_default;
    end if;
  end loop;
end
$$;

do $$
begin
  alter table public.engine_commands
    add constraint engine_commands_attempt_count_nonnegative check (attempt_count >= 0) not valid;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.engine_commands
    add constraint engine_commands_max_attempts_positive check (max_attempts > 0) not valid;
exception
  when duplicate_object then null;
end
$$;

-- Duplicate constraint names must not hide a weaker or unrelated definition.
-- Validation state is intentionally ignored: NOT VALID still protects new rows,
-- and the historical scan is scheduled separately in the runbook.
do $$
declare
  expected record;
  actual_definition text;
begin
  for expected in
    select *
    from (values
      ('engine_commands_attempt_count_nonnegative', 'checkattempt_count>=0'),
      ('engine_commands_max_attempts_positive', 'checkmax_attempts>0')
    ) as expected_constraints(constraint_name, normalized_definition)
  loop
    select replace(
      lower(pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_catalog.oid),
        '[[:space:]()]+',
        '',
        'g'
      )),
      'notvalid',
      ''
    )
    into actual_definition
    from pg_catalog.pg_constraint as constraint_catalog
    where constraint_catalog.conrelid = 'public.engine_commands'::pg_catalog.regclass
      and constraint_catalog.conname = expected.constraint_name
      and constraint_catalog.contype = 'c';

    if actual_definition is distinct from expected.normalized_definition then
      raise exception 'Constraint % schema drift: definition %, expected %',
        expected.constraint_name,
        actual_definition,
        expected.normalized_definition;
    end if;
  end loop;
end
$$;

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

-- requeue_expired_commands (20260713120000_engine_queue_v2.sql) is fully
-- superseded by the expired-lease recovery built into claim_engine_commands
-- below. Confirmed zero callers in hubflow-engine or apps/worker before
-- dropping it; restored verbatim by the rollback if this migration is undone.
drop function if exists app.requeue_expired_commands();
drop function if exists public.requeue_expired_commands();

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
begin
  -- Status predicate plus row lock makes recovery idempotent under concurrency.
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
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated_command public.engine_commands;
  locked_command public.engine_commands;
  bounded_lease_seconds integer := greatest(15, least(coalesce(lease_seconds, 60), 900));
begin
  select command.*
  into locked_command
  from public.engine_commands as command
  where command.command_id = target_command_id
  for update;

  -- clock_timestamp() is evaluated after any row-lock wait, fencing an expired owner.
  if not found
    or locked_command.status <> 'processing'
    or locked_command.lease_token is distinct from target_lease_token
    or locked_command.lease_expires_at is null
    or locked_command.lease_expires_at <= clock_timestamp()
  then
    return null;
  end if;

  update public.engine_commands as command
  set
    lease_expires_at = greatest(
      locked_command.lease_expires_at,
      clock_timestamp() + make_interval(secs => bounded_lease_seconds)
    ),
    updated_at = clock_timestamp()
  where command.id = locked_command.id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > clock_timestamp()
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
  locked_command public.engine_commands;
begin
  select command.*
  into locked_command
  from public.engine_commands as command
  where command.command_id = target_command_id
  for update;

  if not found
    or locked_command.status <> 'processing'
    or locked_command.lease_token is distinct from target_lease_token
    or locked_command.lease_expires_at is null
    or locked_command.lease_expires_at <= clock_timestamp()
  then
    return null;
  end if;

  update public.engine_commands as command
  set
    effect_started_at = coalesce(command.effect_started_at, clock_timestamp()),
    updated_at = clock_timestamp()
  where command.id = locked_command.id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > clock_timestamp()
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
  locked_command public.engine_commands;
  bounded_retry_delay_seconds integer := greatest(0, least(coalesce(retry_delay_seconds, 30), 86400));
begin
  if success is null then
    raise exception 'success must not be null';
  end if;

  select command.*
  into locked_command
  from public.engine_commands as command
  where command.command_id = target_command_id
  for update;

  if not found
    or locked_command.status <> 'processing'
    or locked_command.lease_token is distinct from target_lease_token
    or locked_command.lease_expires_at is null
    or locked_command.lease_expires_at <= clock_timestamp()
  then
    return null;
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
  where command.id = locked_command.id
    and command.status = 'processing'
    and command.lease_token = target_lease_token
    and command.lease_expires_at > clock_timestamp()
  returning command.* into updated_command;

  return updated_command;
end;
$$;

-- app.* remains an internal implementation surface. PostgREST uses public.* below.
revoke execute on function app.claim_engine_commands(integer, integer) from public, anon, authenticated, service_role;
revoke execute on function app.renew_engine_command_lease(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke execute on function app.mark_engine_command_effect_started(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function app.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer) from public, anon, authenticated, service_role;
revoke execute on function app.record_engine_event(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke execute on function app.update_instance_status(uuid, uuid, public.instance_status, text, text, text, jsonb) from public, anon, authenticated, service_role;

-- Remove any legacy public overloads that would bypass lease ownership or make
-- PostgREST function resolution ambiguous.
drop function if exists public.claim_engine_commands(integer);
drop function if exists public.complete_engine_command(uuid, boolean, text);
drop function if exists public.record_engine_event(uuid, uuid, text, jsonb, uuid);
drop function if exists public.update_instance_status(uuid, uuid, public.instance_status, text, text, text, jsonb);

create or replace function public.claim_engine_commands(
  max_commands integer default 5,
  lease_seconds integer default 60
)
returns setof public.engine_commands
language sql
security definer
set search_path = pg_catalog
as $$
  select *
  from app.claim_engine_commands(max_commands, lease_seconds);
$$;

create or replace function public.renew_engine_command_lease(
  target_command_id uuid,
  target_lease_token uuid,
  lease_seconds integer default 60
)
returns public.engine_commands
language sql
security definer
set search_path = pg_catalog
as $$
  select *
  from app.renew_engine_command_lease(target_command_id, target_lease_token, lease_seconds);
$$;

create or replace function public.mark_engine_command_effect_started(
  target_command_id uuid,
  target_lease_token uuid
)
returns public.engine_commands
language sql
security definer
set search_path = pg_catalog
as $$
  select *
  from app.mark_engine_command_effect_started(target_command_id, target_lease_token);
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
language sql
security definer
set search_path = pg_catalog
as $$
  select *
  from app.complete_engine_command(
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
language sql
security definer
set search_path = pg_catalog
as $$
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
language sql
security definer
set search_path = pg_catalog
as $$
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

commit;

-- Deliberately outside the transaction: CONCURRENTLY avoids blocking command
-- writes. Dropping the known name first also removes an INVALID index left by a
-- failed concurrent build, so rerunning the migration really retries this phase.
drop index concurrently if exists public.engine_commands_processing_lease_expiry_idx;

create index concurrently engine_commands_processing_lease_expiry_idx
  on public.engine_commands (lease_expires_at)
  where status = 'processing';
