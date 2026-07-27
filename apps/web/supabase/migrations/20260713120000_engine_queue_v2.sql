-- engine_commands queue v2: retry, lease, priority, enqueue idempotency.
--
-- engine_commands becomes the SINGLE work queue for the WhatsApp worker
-- (apps/worker), replacing the legacy HTTP pull/ack path
-- (/api/dispatch/pending|ack) which is removed at cutover.
--
-- Additions:
--   attempts/max_attempts  -> retry with exponential backoff on failure
--   lease_expires_at       -> worker crash mid-job => command is requeued
--   priority               -> welcome messages (10) jump broadcast fan-out (100)
--   dedupe_key             -> idempotent ENQUEUE (e.g. 'cm:<campaign_message_id>',
--                             'welcome:<group_jid>:<participant>')
--
-- Also creates public.* wrapper RPCs: the app.* functions are not reachable
-- through PostgREST (only public is exposed), so the worker could never call
-- them over REST. Wrappers are EXECUTE-revoked from anon/authenticated —
-- only service_role (worker + API routes) may call them.

-- ============================================================
-- 1) Columns + indexes
-- ============================================================

alter table public.engine_commands
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists priority smallint not null default 100,
  add column if not exists dedupe_key text;

comment on column public.engine_commands.priority is
  'Lower runs first. 10 = welcome/urgent, 100 = broadcast fan-out.';
comment on column public.engine_commands.dedupe_key is
  'Idempotency key for enqueueing. Unique per tenant when set.';

create unique index if not exists engine_commands_dedupe_uidx
  on public.engine_commands (tenant_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists engine_commands_claim_idx
  on public.engine_commands (status, available_at, priority, created_at);

-- ============================================================
-- 2) Claim: SKIP LOCKED + lease + priority ordering
-- ============================================================

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
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now()
  where c.id in (
    select pending.id
    from public.engine_commands pending
    where pending.status = 'queued'
      and pending.available_at <= now()
    order by pending.priority asc, pending.created_at asc
    limit greatest(max_commands, 1)
    for update skip locked
  )
  returning c.*;
end;
$$;

-- ============================================================
-- 3) Complete: success -> done; failure -> retry with backoff
--    (30s * 2^attempts) until max_attempts, then failed
-- ============================================================

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
    status = case
      when success then 'done'::public.engine_command_status
      when attempts + 1 < max_attempts then 'queued'::public.engine_command_status
      else 'failed'::public.engine_command_status
    end,
    attempts = case when success then attempts else attempts + 1 end,
    available_at = case
      when not success and attempts + 1 < max_attempts
        then now() + (interval '30 seconds' * power(2, attempts))
      else available_at
    end,
    lease_expires_at = null,
    completed_at = case when success then now() else completed_at end,
    failed_at = case
      when not success and attempts + 1 >= max_attempts then now()
      else failed_at
    end,
    error = case when success then null else error_message end,
    updated_at = now()
  where command_id = target_command_id
  returning * into updated;

  return updated;
end;
$$;

-- ============================================================
-- 4) Requeue expired leases (worker calls this every loop)
-- ============================================================

create or replace function app.requeue_expired_commands()
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  requeued integer;
begin
  -- exhausted retries: fail them
  update public.engine_commands
  set
    status = 'failed',
    attempts = attempts + 1,
    lease_expires_at = null,
    failed_at = now(),
    error = coalesce(error, 'lease expired'),
    updated_at = now()
  where status = 'processing'
    and lease_expires_at < now()
    and attempts + 1 >= max_attempts;

  -- still has budget: back to the queue
  with r as (
    update public.engine_commands
    set
      status = 'queued',
      attempts = attempts + 1,
      lease_expires_at = null,
      updated_at = now()
    where status = 'processing'
      and lease_expires_at < now()
      and attempts + 1 < max_attempts
    returning 1
  )
  select count(*)::integer into requeued from r;

  return requeued;
end;
$$;

-- ============================================================
-- 5) PostgREST-reachable wrappers (service_role only)
-- ============================================================

create or replace function public.claim_engine_commands(max_commands integer default 5)
returns setof public.engine_commands
language sql
security definer
set search_path = public, app
as $$
  select * from app.claim_engine_commands(max_commands);
$$;

create or replace function public.complete_engine_command(
  target_command_id uuid,
  success boolean,
  error_message text default null
)
returns public.engine_commands
language sql
security definer
set search_path = public, app
as $$
  select app.complete_engine_command(target_command_id, success, error_message);
$$;

create or replace function public.requeue_expired_commands()
returns integer
language sql
security definer
set search_path = public, app
as $$
  select app.requeue_expired_commands();
$$;

create or replace function public.record_engine_event(
  target_tenant_id uuid,
  target_instance_id uuid,
  target_type text,
  target_payload jsonb default '{}'::jsonb,
  target_event_id uuid default gen_random_uuid()
)
returns public.engine_events
language sql
security definer
set search_path = public, app
as $$
  select app.record_engine_event(target_tenant_id, target_instance_id, target_type, target_payload, target_event_id);
$$;

create or replace function public.update_instance_status(
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
set search_path = public, app
as $$
  select app.update_instance_status(target_tenant_id, target_instance_id, target_status, target_phone, target_qr_code, target_engine_node, target_metadata);
$$;

revoke execute on function public.claim_engine_commands(integer) from public, anon, authenticated;
revoke execute on function public.complete_engine_command(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.requeue_expired_commands() from public, anon, authenticated;
revoke execute on function public.record_engine_event(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.update_instance_status(uuid, uuid, public.instance_status, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.claim_engine_commands(integer) to service_role;
grant execute on function public.complete_engine_command(uuid, boolean, text) to service_role;
grant execute on function public.requeue_expired_commands() to service_role;
grant execute on function public.record_engine_event(uuid, uuid, text, jsonb, uuid) to service_role;
grant execute on function public.update_instance_status(uuid, uuid, public.instance_status, text, text, text, jsonb) to service_role;
