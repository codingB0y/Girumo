-- HUBFLOW - engine_command_leases RPC smoke check (full)
-- Execute against dev/staging (or prod during a maintenance window) after applying
-- 202607050001_engine_command_leases.sql. Exercises the real public.* RPCs the
-- hubflow-engine worker calls (queues/supabase-command-worker.js), including
-- claim_engine_commands.
--
-- NOT prod-safe under live traffic: claim_engine_commands() operates on the shared
-- queue across every tenant (ORDER BY created_at ASC, FOR UPDATE SKIP LOCKED) with no
-- tenant filter, so this transaction briefly locks real queued/expired-lease rows
-- until rollback. Use infra/tests/engine-command-leases-smoke-prod-safe.sql instead
-- for a check safe to run against production under live traffic.
--
-- begin/rollback: nothing persists, even the rows this script inserts.

begin;

do $$
declare
  test_tenant_id uuid := gen_random_uuid();
  claimed public.engine_commands;
  renewed public.engine_commands;
  completed public.engine_commands;
  stale_command_id uuid := gen_random_uuid();
  recovered_count integer;
  recovered_event_count integer;
begin
  insert into public.organizations (id, tenant_id, name, slug, status)
  values (test_tenant_id, test_tenant_id, 'smoke-test-org', 'smoke-test-org-' || test_tenant_id, 'active');

  -- === Happy path: claim -> mark_effect_started -> renew -> complete(success) ===
  insert into public.engine_commands (tenant_id, command_id, type, status, payload)
  values (test_tenant_id, gen_random_uuid(), 'smoke_test_command', 'queued', '{}'::jsonb);

  select t.* into claimed
  from public.claim_engine_commands(max_commands => 5, lease_seconds => 30) as t
  where t.tenant_id = test_tenant_id
  limit 1;

  if claimed.command_id is null then
    raise exception 'smoke: claim_engine_commands did not return the queued test command';
  end if;
  if claimed.status <> 'processing' or claimed.lease_token is null then
    raise exception 'smoke: claimed command has unexpected status=% lease_token=%', claimed.status, claimed.lease_token;
  end if;

  select * into claimed
  from public.mark_engine_command_effect_started(claimed.command_id, claimed.lease_token);
  if claimed.effect_started_at is null then
    raise exception 'smoke: mark_engine_command_effect_started did not set effect_started_at';
  end if;

  select * into renewed
  from public.renew_engine_command_lease(claimed.command_id, claimed.lease_token, 45);
  if renewed.command_id is null or renewed.lease_expires_at <= claimed.lease_expires_at then
    raise exception 'smoke: renew_engine_command_lease did not extend the lease';
  end if;

  select * into completed
  from public.complete_engine_command(claimed.command_id, claimed.lease_token, true, null, 'retryable', 30);
  if completed.command_id is null or completed.status <> 'done' or completed.lease_token is not null then
    raise exception 'smoke: complete_engine_command(success) left status=% lease_token=%', completed.status, completed.lease_token;
  end if;

  -- A stale/consumed lease token must now be rejected (fencing).
  select * into completed
  from public.complete_engine_command(claimed.command_id, claimed.lease_token, true, null, 'retryable', 30);
  if completed.command_id is not null then
    raise exception 'smoke: complete_engine_command accepted a stale/already-consumed lease token';
  end if;

  -- === Expired lease recovery path (inside claim_engine_commands) ===
  insert into public.engine_commands (
    id, tenant_id, command_id, type, status, attempt_count, max_attempts,
    lease_token, lease_expires_at, claimed_at
  )
  values (
    gen_random_uuid(), test_tenant_id, stale_command_id, 'smoke_test_stale_command', 'processing', 1, 3,
    gen_random_uuid(), clock_timestamp() - interval '5 minutes', clock_timestamp() - interval '5 minutes'
  );

  perform public.claim_engine_commands(max_commands => 5, lease_seconds => 30);

  select count(*) into recovered_count
  from public.engine_commands
  where command_id = stale_command_id
    and status = 'queued'
    and lease_token is null
    and failure_kind = 'retryable';

  if recovered_count <> 1 then
    raise exception 'smoke: expired lease was not recovered into queued/retryable (got % rows)', recovered_count;
  end if;

  select count(*) into recovered_event_count
  from public.engine_events
  where tenant_id = test_tenant_id
    and type = 'engine_command_requeued';

  if recovered_event_count <> 1 then
    raise exception 'smoke: expired-lease recovery did not emit an engine_command_requeued event (got %)', recovered_event_count;
  end if;

  raise notice 'smoke: engine_command_leases RPC contract OK (happy path + fencing + claim-based expired-lease recovery)';
end;
$$;

rollback;
