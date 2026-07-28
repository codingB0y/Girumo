-- HUBFLOW - Rollback of 202607050001_engine_command_leases
-- Manual/emergency use only. NOT part of deploy/supabase/apply-order.txt.
--
-- Restores the state left by 20260713120000_engine_queue_v2.sql, not the
-- older pre-engine_queue_v2 state from 202606240005_engine_rpc.sql.
-- engine_queue_v2 (apps/web/supabase/migrations/, tracked lane) was already
-- live in production before 202607050001 (infra/migrations/, untracked lane)
-- was ever applied — see finding-painel-heartbeat-false-disconnect in project
-- memory. This rollback undoes exactly what 202607050001 changed and leaves
-- engine_queue_v2's contribution intact.
--
-- WARNING — destructive and only partially reversible:
--   1. Drops lease_token/attempt_count/effect_started_at/failure_kind from
--      public.engine_commands. Any command mid-flight loses its lease state;
--      there is no way to recover which owner held it.
--      lease_expires_at and max_attempts are deliberately NOT dropped: both
--      predate 202607050001 (added by engine_queue_v2) and are read by the
--      engine_queue_v2 function bodies restored below. Dropping them here
--      would break the very functions this rollback recreates.
--   2. The forward migration's backfill (processing rows without a lease ->
--      failed/uncertain) is NOT undone. That data change is irreversible by
--      design (the original delivery outcome was already unknowable when it
--      ran).
--   3. Must be paired with rolling back the hubflow-engine deploy. The engine
--      version shipped alongside 202607050001 calls the new-signature
--      public.* RPCs (claim_engine_commands(int,int),
--      complete_engine_command(uuid,uuid,boolean,...)). Running this rollback
--      while that engine version is still deployed will break the worker
--      immediately (function signature mismatch / PostgREST 404).
--
-- Restores app.claim_engine_commands / app.complete_engine_command /
-- app.requeue_expired_commands and their public.* wrappers to the exact
-- definitions from 20260713120000_engine_queue_v2.sql.

-- Deliberately outside the transaction, mirroring the forward migration's index step.
drop index concurrently if exists public.engine_commands_processing_lease_expiry_idx;

begin;

-- New-signature public wrappers were introduced by 202607050001: just drop them.
drop function if exists public.claim_engine_commands(integer, integer);
drop function if exists public.renew_engine_command_lease(uuid, uuid, integer);
drop function if exists public.mark_engine_command_effect_started(uuid, uuid);
drop function if exists public.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer);
drop function if exists public.record_engine_event(uuid, uuid, uuid, uuid, text, jsonb, uuid);
drop function if exists public.update_instance_status(uuid, uuid, uuid, uuid, public.instance_status, text, text, text, jsonb);

-- Drop the lease-fenced app.* overloads before recreating the engine_queue_v2 signatures.
drop function if exists app.claim_engine_commands(integer, integer);
drop function if exists app.renew_engine_command_lease(uuid, uuid, integer);
drop function if exists app.mark_engine_command_effect_started(uuid, uuid);
drop function if exists app.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer);

-- Restored verbatim from 20260713120000_engine_queue_v2.sql.
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

-- record_engine_event/update_instance_status app.* bodies were never changed
-- by 202607050001 (only their revoke), so no create-or-replace needed for
-- app.* here. Only the public.* wrapper signatures need to be restored.
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

-- Grants restored exactly as 20260713120000_engine_queue_v2.sql left them.
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

-- Neither 202606240005 nor engine_queue_v2 ever revoked on app.*, so PUBLIC
-- held the default execute privilege on all five. Restore that.
grant execute on function app.claim_engine_commands(integer) to public;
grant execute on function app.complete_engine_command(uuid, boolean, text) to public;
grant execute on function app.requeue_expired_commands() to public;
grant execute on function app.record_engine_event(uuid, uuid, text, jsonb, uuid) to public;
grant execute on function app.update_instance_status(uuid, uuid, public.instance_status, text, text, text, jsonb) to public;

-- Drop the check constraints before the columns they reference.
alter table public.engine_commands
  drop constraint if exists engine_commands_attempt_count_nonnegative,
  drop constraint if exists engine_commands_max_attempts_positive;

-- Only drop what 202607050001 actually added. lease_expires_at and
-- max_attempts predate it (engine_queue_v2) and must survive this rollback.
alter table public.engine_commands
  drop column if exists lease_token,
  drop column if exists attempt_count,
  drop column if exists effect_started_at,
  drop column if exists failure_kind;

drop type if exists public.engine_command_failure_kind;

commit;
