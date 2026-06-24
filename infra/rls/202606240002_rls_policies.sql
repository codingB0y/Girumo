-- HUBFLOW - Fase 4 - RLS policies for Supabase/Postgres
-- Apply after infra/migrations/202606240001_base_schema.sql.

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

create or replace function app.has_membership(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.accepted_at is not null
  )
$$;

create or replace function app.has_role(target_tenant_id uuid, allowed_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.accepted_at is not null
      and m.role = any(allowed_roles)
  )
$$;

create or replace function app.is_system_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select target_tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
$$;

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.memberships enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.instances enable row level security;
alter table public.funnels enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;
alter table public.contacts enable row level security;
alter table public.uploads enable row level security;
alter table public.logs enable row level security;
alter table public.engine_commands enable row level security;
alter table public.engine_events enable row level security;

create policy organizations_select_member on public.organizations
for select using (app.has_membership(id));

create policy organizations_insert_authenticated on public.organizations
for insert with check (
  auth.uid() is not null
  and tenant_id = id
  and created_by = auth.uid()
);

create policy organizations_update_owner on public.organizations
for update using (app.has_role(id, array['owner']::public.member_role[]))
with check (app.has_role(id, array['owner']::public.member_role[]));

create policy users_select_member on public.users
for select using (app.has_membership(tenant_id));

create policy users_insert_self_or_admin on public.users
for insert with check (
  (auth.uid() = auth_user_id and app.has_membership(tenant_id))
  or app.has_role(tenant_id, array['owner','admin']::public.member_role[])
);

create policy users_update_self_or_admin on public.users
for update using (
  auth.uid() = auth_user_id
  or app.has_role(tenant_id, array['owner','admin']::public.member_role[])
)
with check (
  auth.uid() = auth_user_id
  or app.has_role(tenant_id, array['owner','admin']::public.member_role[])
);

create policy memberships_select_member on public.memberships
for select using (app.has_membership(tenant_id) or user_id = auth.uid());

create policy memberships_insert_owner_admin on public.memberships
for insert with check (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy memberships_insert_initial_owner on public.memberships
for insert with check (
  user_id = auth.uid()
  and role = 'owner'
  and accepted_at is not null
  and exists (
    select 1
    from public.organizations o
    where o.id = memberships.tenant_id
      and o.tenant_id = memberships.tenant_id
      and o.created_by = auth.uid()
  )
  and not exists (
    select 1
    from public.memberships existing
    where existing.tenant_id = memberships.tenant_id
  )
);

create policy memberships_update_owner_admin on public.memberships
for update using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]))
with check (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy memberships_delete_owner on public.memberships
for delete using (app.has_role(tenant_id, array['owner']::public.member_role[]));

create policy plans_select_active_or_member on public.plans
for select using (active = true or app.has_membership(tenant_id));

create policy plans_write_service_only on public.plans
for all using (false) with check (false);

create policy subscriptions_select_owner_admin on public.subscriptions
for select using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy subscriptions_write_service_only on public.subscriptions
for all using (false) with check (false);

create policy instances_select_member on public.instances
for select using (app.has_membership(tenant_id));

create policy instances_insert_owner_admin on public.instances
for insert with check (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy instances_update_owner_admin on public.instances
for update using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]))
with check (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy instances_delete_owner_admin on public.instances
for delete using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy funnels_select_member on public.funnels
for select using (app.has_membership(tenant_id));

create policy funnels_write_owner_admin_operator on public.funnels
for all using (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]))
with check (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]));

create policy campaigns_select_member on public.campaigns
for select using (app.has_membership(tenant_id));

create policy campaigns_write_owner_admin_operator on public.campaigns
for all using (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]))
with check (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]));

create policy contacts_select_member on public.contacts
for select using (app.has_membership(tenant_id));

create policy contacts_write_owner_admin_operator on public.contacts
for all using (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]))
with check (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]));

create policy messages_select_member on public.messages
for select using (app.has_membership(tenant_id));

create policy messages_insert_member on public.messages
for insert with check (app.has_membership(tenant_id));

create policy messages_update_owner_admin_operator on public.messages
for update using (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]))
with check (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]));

create policy uploads_select_member on public.uploads
for select using (app.has_membership(tenant_id));

create policy uploads_write_owner_admin_operator on public.uploads
for all using (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]))
with check (app.has_role(tenant_id, array['owner','admin','operator']::public.member_role[]));

create policy logs_select_owner_admin on public.logs
for select using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy logs_insert_member on public.logs
for insert with check (app.has_membership(tenant_id));

create policy logs_update_service_only on public.logs
for update using (false) with check (false);

create policy logs_delete_service_only on public.logs
for delete using (false);

create policy engine_commands_select_member on public.engine_commands
for select using (app.has_membership(tenant_id));

create policy engine_commands_insert_member on public.engine_commands
for insert with check (app.has_membership(tenant_id));

create policy engine_commands_update_service_only on public.engine_commands
for update using (false) with check (false);

create policy engine_commands_delete_owner_admin on public.engine_commands
for delete using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy engine_events_select_member on public.engine_events
for select using (app.has_membership(tenant_id));

create policy engine_events_insert_service_only on public.engine_events
for insert with check (false);

create policy engine_events_update_service_only on public.engine_events
for update using (false) with check (false);

create policy engine_events_delete_owner_admin on public.engine_events
for delete using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));
