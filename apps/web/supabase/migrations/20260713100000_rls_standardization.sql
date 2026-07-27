-- RLS standardization: single mechanism for tenant isolation (defense-in-depth).
--
-- Before this migration the repo carried 4 different policy mechanisms in drift:
--   1. app.has_membership()/app.has_role() helpers        (infra/rls/202606240002)
--   2. inline membership subqueries                        (infra/migrations/202607010001, notifications, tenant_webhooks)
--   3. request.jwt.claims ->> 'tenant_id'                  (agent_configs, funnel_events, testimonials)
--   4. current_setting('app.tenant_id') session GUC        (templates, orders, referrals, landing_pages, lp_*)
--
-- Mechanisms 3 and 4 never match the real auth flow (no tenant_id JWT claim is
-- issued and no GUC is set), so those tables were effectively deny-all for
-- authenticated users and only reachable through service_role. This migration
-- rewrites every tenant-data table to ONE mechanism: accepted membership looked
-- up by auth.uid(), exposed through stable helper functions.
--
-- Identity/billing tables (organizations, users, memberships, plans,
-- subscriptions) keep their original policies from 202606240002 — they are
-- already auth.uid()-based and carry special semantics (self-access, initial
-- owner bootstrap, public plan catalog).
--
-- Queue tables (engine_commands, engine_events) become deny-all for
-- authenticated/anon: only service_role (API routes + worker) touches them.
--
-- NOTE: the active data path still uses service_role + explicit
-- .eq('tenant_id') filters in apps/web/src/lib/stores/*. RLS here is
-- defense-in-depth, not the primary gate (decision recorded in the
-- Evolution migration plan).

-- ============================================================
-- 1) Helper functions (single source of tenant scoping)
-- ============================================================

create or replace function app.user_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and m.accepted_at is not null;
$$;

create or replace function app.user_admin_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and m.accepted_at is not null
    and m.role in ('owner', 'admin');
$$;

create or replace function app.user_operator_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and m.accepted_at is not null
    and m.role in ('owner', 'admin', 'operator');
$$;

-- ============================================================
-- 2) Drop ALL existing policies on tenant-data + queue tables
--    (dynamic: immune to naming drift between SQL directories)
-- ============================================================

do $$
declare
  t text;
  p record;
  tables text[] := array[
    'instances', 'groups', 'campaign_groups', 'tracked_links', 'tenant_webhooks',
    'landing_pages', 'referral_configs',
    'funnels', 'campaigns', 'contacts', 'uploads', 'templates', 'orders', 'referrals',
    'broadcasts', 'campaign_messages', 'schedules',
    'messages', 'logs', 'notifications', 'agent_configs', 'testimonials',
    'funnel_events', 'lp_leads', 'lp_tracking_events',
    'engine_commands', 'engine_events'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end;
$$;

-- ============================================================
-- 3) Recreate policies by access pattern
-- ============================================================

do $$
declare
  t text;
  -- Pattern A: members read, owner/admin write
  pattern_a text[] := array['instances', 'groups', 'campaign_groups', 'tracked_links', 'landing_pages', 'referral_configs'];
  -- Pattern B: members read, owner/admin/operator write
  pattern_b text[] := array['funnels', 'campaigns', 'contacts', 'uploads', 'templates', 'orders', 'referrals'];
  -- Pattern C: members read + write
  pattern_c text[] := array['broadcasts', 'campaign_messages', 'schedules'];
  -- Pattern D: members read only (writes are server-side via service_role)
  pattern_d text[] := array['funnel_events', 'lp_leads', 'lp_tracking_events'];
begin
  foreach t in array pattern_a loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = any (app.user_tenant_ids()))', t || '_select_member', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id = any (app.user_admin_tenant_ids()))', t || '_insert_admin', t);
    execute format('create policy %I on public.%I for update to authenticated using (tenant_id = any (app.user_admin_tenant_ids())) with check (tenant_id = any (app.user_admin_tenant_ids()))', t || '_update_admin', t);
    execute format('create policy %I on public.%I for delete to authenticated using (tenant_id = any (app.user_admin_tenant_ids()))', t || '_delete_admin', t);
  end loop;

  foreach t in array pattern_b loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = any (app.user_tenant_ids()))', t || '_select_member', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id = any (app.user_operator_tenant_ids()))', t || '_insert_operator', t);
    execute format('create policy %I on public.%I for update to authenticated using (tenant_id = any (app.user_operator_tenant_ids())) with check (tenant_id = any (app.user_operator_tenant_ids()))', t || '_update_operator', t);
    execute format('create policy %I on public.%I for delete to authenticated using (tenant_id = any (app.user_operator_tenant_ids()))', t || '_delete_operator', t);
  end loop;

  foreach t in array pattern_c loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = any (app.user_tenant_ids()))', t || '_select_member', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id = any (app.user_tenant_ids()))', t || '_insert_member', t);
    execute format('create policy %I on public.%I for update to authenticated using (tenant_id = any (app.user_tenant_ids())) with check (tenant_id = any (app.user_tenant_ids()))', t || '_update_member', t);
    execute format('create policy %I on public.%I for delete to authenticated using (tenant_id = any (app.user_tenant_ids()))', t || '_delete_member', t);
  end loop;

  foreach t in array pattern_d loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = any (app.user_tenant_ids()))', t || '_select_member', t);
  end loop;
end;
$$;

-- ============================================================
-- 4) Special-case tables (semantics preserved from originals)
-- ============================================================

do $$
begin
  -- messages: members read/insert, operators update (no client delete)
  if to_regclass('public.messages') is not null then
    create policy messages_select_member on public.messages
      for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
    create policy messages_insert_member on public.messages
      for insert to authenticated with check (tenant_id = any (app.user_tenant_ids()));
    create policy messages_update_operator on public.messages
      for update to authenticated
      using (tenant_id = any (app.user_operator_tenant_ids()))
      with check (tenant_id = any (app.user_operator_tenant_ids()));
  end if;

  -- logs: owner/admin read, members insert (audit trail: no client update/delete)
  if to_regclass('public.logs') is not null then
    create policy logs_select_admin on public.logs
      for select to authenticated using (tenant_id = any (app.user_admin_tenant_ids()));
    create policy logs_insert_member on public.logs
      for insert to authenticated with check (tenant_id = any (app.user_tenant_ids()));
  end if;

  -- notifications: members read + update (mark as read); inserts are server-side
  if to_regclass('public.notifications') is not null then
    create policy notifications_select_member on public.notifications
      for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
    create policy notifications_update_member on public.notifications
      for update to authenticated
      using (tenant_id = any (app.user_tenant_ids()))
      with check (tenant_id = any (app.user_tenant_ids()));
  end if;

  -- tenant_webhooks: owner/admin only (read + write)
  if to_regclass('public.tenant_webhooks') is not null then
    create policy tenant_webhooks_all_admin on public.tenant_webhooks
      for all to authenticated
      using (tenant_id = any (app.user_admin_tenant_ids()))
      with check (tenant_id = any (app.user_admin_tenant_ids()));
  end if;

  -- agent_configs: members read, owner/admin update; inserts server-side
  if to_regclass('public.agent_configs') is not null then
    create policy agent_configs_select_member on public.agent_configs
      for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
    create policy agent_configs_update_admin on public.agent_configs
      for update to authenticated
      using (tenant_id = any (app.user_admin_tenant_ids()))
      with check (tenant_id = any (app.user_admin_tenant_ids()));
  end if;

  -- testimonials: members insert own tenant; approved ones are public (landing)
  if to_regclass('public.testimonials') is not null then
    create policy testimonials_insert_member on public.testimonials
      for insert to authenticated with check (tenant_id = any (app.user_tenant_ids()));
    create policy testimonials_select_approved_public on public.testimonials
      for select using (approved = true);
    create policy testimonials_select_member on public.testimonials
      for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
  end if;

  -- engine_commands / engine_events: deny-all for authenticated/anon.
  -- RLS is enabled (step 2) and no policies are created: only service_role
  -- (API routes on Vercel + worker on Coolify) reads or writes the queue.
end;
$$;

comment on function app.user_tenant_ids() is
  'Tenants where auth.uid() holds an accepted membership. Single RLS mechanism.';
comment on function app.user_admin_tenant_ids() is
  'Tenants where auth.uid() is owner/admin (accepted).';
comment on function app.user_operator_tenant_ids() is
  'Tenants where auth.uid() is owner/admin/operator (accepted).';
