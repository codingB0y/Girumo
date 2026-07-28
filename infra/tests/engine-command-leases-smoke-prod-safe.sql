-- HUBFLOW - engine_command_leases RPC smoke check (production-safe subset)
-- Execute against production under live traffic after applying
-- 202607050001_engine_command_leases.sql. Exercises the real public.* RPCs the
-- hubflow-engine worker calls, scoped so it never touches the shared queue:
-- every function here (mark_engine_command_effect_started, renew_engine_command_lease,
-- complete_engine_command) is fenced by command_id + lease_token and only ever locks
-- the single row this script creates.
--
-- Deliberately does NOT call claim_engine_commands(): that RPC scans/locks the shared
-- queue across every tenant with no tenant filter (ORDER BY created_at ASC, FOR UPDATE
-- SKIP LOCKED), which could transiently delay a concurrent real worker's claim. That
-- path (happy-path claim + expired-lease recovery) is proven separately by
-- infra/tests/engine-command-leases-smoke.sql against dev/staging.
--
-- begin/rollback: nothing persists, even the rows this script inserts.

begin;

do $$
declare
  test_tenant_id uuid := gen_random_uuid();
  command_id uuid := gen_random_uuid();
  lease_token uuid := gen_random_uuid();
  wrong_token uuid := gen_random_uuid();
  row_state public.engine_commands;
  renewed public.engine_commands;
  completed public.engine_commands;
begin
  insert into public.organizations (id, tenant_id, name, slug, status)
  values (test_tenant_id, test_tenant_id, 'smoke-test-org', 'smoke-test-org-' || test_tenant_id, 'active');

  -- Seed the row already "processing" with a known lease, bypassing claim_engine_commands.
  insert into public.engine_commands (
    tenant_id, command_id, type, status, attempt_count, max_attempts,
    lease_token, lease_expires_at, claimed_at
  )
  values (
    test_tenant_id, command_id, 'smoke_test_command', 'processing', 1, 3,
    lease_token, clock_timestamp() + interval '30 seconds', clock_timestamp()
  );

  -- Wrong lease token must be rejected by every fenced RPC.
  select * into row_state from public.mark_engine_command_effect_started(command_id, wrong_token);
  if row_state.command_id is not null then
    raise exception 'smoke(prod-safe): mark_engine_command_effect_started accepted a wrong lease token';
  end if;

  select * into row_state from public.renew_engine_command_lease(command_id, wrong_token, 45);
  if row_state.command_id is not null then
    raise exception 'smoke(prod-safe): renew_engine_command_lease accepted a wrong lease token';
  end if;

  -- Correct token: full happy path.
  select * into row_state from public.mark_engine_command_effect_started(command_id, lease_token);
  if row_state.effect_started_at is null then
    raise exception 'smoke(prod-safe): mark_engine_command_effect_started did not set effect_started_at';
  end if;

  select * into renewed from public.renew_engine_command_lease(command_id, lease_token, 45);
  if renewed.command_id is null or renewed.lease_expires_at <= row_state.lease_expires_at then
    raise exception 'smoke(prod-safe): renew_engine_command_lease did not extend the lease';
  end if;

  select * into completed from public.complete_engine_command(command_id, lease_token, true, null, 'retryable', 30);
  if completed.command_id is null or completed.status <> 'done' or completed.lease_token is not null then
    raise exception 'smoke(prod-safe): complete_engine_command(success) left status=% lease_token=%', completed.status, completed.lease_token;
  end if;

  -- Stale/consumed token must now be rejected (fencing survives completion).
  select * into completed from public.complete_engine_command(command_id, lease_token, true, null, 'retryable', 30);
  if completed.command_id is not null then
    raise exception 'smoke(prod-safe): complete_engine_command accepted a stale/already-consumed lease token';
  end if;

  raise notice 'smoke(prod-safe): engine_command_leases fenced RPC contract OK (mark_effect_started/renew/complete + fencing rejection)';
end;
$$;

rollback;
