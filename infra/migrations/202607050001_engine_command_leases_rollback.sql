-- HUBFLOW - Rollback of 202607050001_engine_command_leases
-- Manual/emergency use only. NOT part of deploy/supabase/apply-order.txt.
--
-- WARNING — destructive and only partially reversible:
--   1. Drops lease_token/lease_expires_at/attempt_count/max_attempts/effect_started_at/
--      failure_kind from public.engine_commands. Any command mid-flight loses its lease
--      state; there is no way to recover which owner held it.
--   2. The forward migration's backfill (processing rows without a lease -> failed/
--      uncertain) is NOT undone. That data change is irreversible by design (the
--      original delivery outcome was already unknowable when it ran).
--   3. Must be paired with rolling back the hubflow-engine deploy. The engine version
--      shipped alongside 202607050001 calls the new-signature public.* RPCs
--      (claim_engine_commands(int,int), complete_engine_command(uuid,uuid,boolean,...)).
--      Running this rollback while that engine version is still deployed will break the
--      worker immediately (function signature mismatch / PostgREST 404).
--
-- Restores app.claim_engine_commands/app.complete_engine_command to the pre-lease
-- definitions from 202606240005_engine_rpc.sql, and removes the public.* wrapper
-- functions entirely (they did not exist before 202607050001 — see the "Remove any
-- legacy public overloads" comment in the forward migration).

-- Deliberately outside the transaction, mirroring the forward migration's index step.
drop index concurrently if exists public.engine_commands_processing_lease_expiry_idx;

begin;

-- New-signature public wrappers never existed before 202607050001: just drop them.
drop function if exists public.claim_engine_commands(integer, integer);
drop function if exists public.renew_engine_command_lease(uuid, uuid, integer);
drop function if exists public.mark_engine_command_effect_started(uuid, uuid);
drop function if exists public.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer);
drop function if exists public.record_engine_event(uuid, uuid, uuid, uuid, text, jsonb, uuid);
drop function if exists public.update_instance_status(uuid, uuid, uuid, uuid, public.instance_status, text, text, text, jsonb);

-- Drop the lease-fenced app.* overloads before recreating the pre-migration signatures.
drop function if exists app.claim_engine_commands(integer, integer);
drop function if exists app.renew_engine_command_lease(uuid, uuid, integer);
drop function if exists app.mark_engine_command_effect_started(uuid, uuid);
drop function if exists app.complete_engine_command(uuid, uuid, boolean, text, public.engine_command_failure_kind, integer);

-- Restored verbatim from 202606240005_engine_rpc.sql.
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

-- record_engine_event / update_instance_status app.* definitions were never changed by
-- 202607050001 (only their revoke/grant), so nothing to restore there beyond the grants
-- below.

-- Pre-202607050001 state had no revoke on app.*, so PUBLIC held the default execute
-- privilege. Restore that.
grant execute on function app.claim_engine_commands(integer) to public;
grant execute on function app.complete_engine_command(uuid, boolean, text) to public;
grant execute on function app.record_engine_event(uuid, uuid, text, jsonb, uuid) to public;
grant execute on function app.update_instance_status(uuid, uuid, public.instance_status, text, text, text, jsonb) to public;

-- Drop the check constraints before the columns they reference.
alter table public.engine_commands
  drop constraint if exists engine_commands_attempt_count_nonnegative,
  drop constraint if exists engine_commands_max_attempts_positive;

alter table public.engine_commands
  drop column if exists lease_token,
  drop column if exists lease_expires_at,
  drop column if exists attempt_count,
  drop column if exists max_attempts,
  drop column if exists effect_started_at,
  drop column if exists failure_kind;

drop type if exists public.engine_command_failure_kind;

commit;
