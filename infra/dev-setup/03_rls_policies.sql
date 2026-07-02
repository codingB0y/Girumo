-- ============================================================
-- HUBFLOW DEV — RLS POLICIES
-- Executar após 02_indexes_triggers.sql
-- ============================================================

-- Helper functions
create or replace function app.current_user_id()
returns uuid language sql stable as $$
  select auth.uid()
$$;

create or replace function app.has_membership(target_tenant_id uuid)
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.accepted_at is not null
  )
$$;

create or replace function app.has_role(target_tenant_id uuid, allowed_roles public.member_role[])
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.accepted_at is not null
      and m.role = any(allowed_roles)
  )
$$;

-- Enable RLS on all tables
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
alter table platform_settings enable row level security;
alter table agent_configs enable row level security;
alter table funnel_events enable row level security;
alter table admin_alerts enable row level security;
alter table templates enable row level security;
alter table orders enable row level security;
alter table referrals enable row level security;
alter table referral_configs enable row level security;
alter table testimonials enable row level security;
alter table public.groups enable row level security;
alter table public.campaign_groups enable row level security;
alter table public.broadcasts enable row level security;
alter table public.campaign_messages enable row level security;
alter table public.schedules enable row level security;
alter table public.tracked_links enable row level security;

-- ========== ORGANIZATIONS ==========
create policy "org_select_member" on public.organizations
  for select using (app.has_membership(id));

create policy "org_insert_authenticated" on public.organizations
  for insert with check (auth.uid() is not null and tenant_id = id);

create policy "org_update_owner" on public.organizations
  for update using (app.has_role(id, array['owner']::public.member_role[]));

-- ========== USERS ==========
create policy "users_select_member" on public.users
  for select using (app.has_membership(tenant_id));

create policy "users_insert" on public.users
  for insert with check (
    (auth.uid() = auth_user_id and app.has_membership(tenant_id))
    or app.has_role(tenant_id, array['owner','admin']::public.member_role[])
  );

create policy "users_update" on public.users
  for update using (
    auth.uid() = auth_user_id
    or app.has_role(tenant_id, array['owner','admin']::public.member_role[])
  );

-- ========== MEMBERSHIPS ==========
create policy "memberships_select" on public.memberships
  for select using (app.has_membership(tenant_id) or user_id = auth.uid());

create policy "memberships_insert" on public.memberships
  for insert with check (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy "memberships_update" on public.memberships
  for update using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy "memberships_delete" on public.memberships
  for delete using (app.has_role(tenant_id, array['owner']::public.member_role[]));

-- ========== PLANS ==========
create policy "plans_select" on public.plans
  for select using (active = true);

-- ========== SUBSCRIPTIONS ==========
create policy "subscriptions_select" on public.subscriptions
  for select using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

-- ========== INSTANCES ==========
create policy "instances_select" on public.instances
  for select using (app.has_membership(tenant_id));

create policy "instances_insert" on public.instances
  for insert with check (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy "instances_update" on public.instances
  for update using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy "instances_delete" on public.instances
  for delete using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

-- ========== FUNNELS ==========
create policy "funnels_select" on public.funnels
  for select using (app.has_membership(tenant_id));

create policy "funnels_write" on public.funnels
  for all using (app.has_membership(tenant_id));

-- ========== CAMPAIGNS ==========
create policy "campaigns_select" on public.campaigns
  for select using (app.has_membership(tenant_id));

create policy "campaigns_write" on public.campaigns
  for all using (app.has_membership(tenant_id));

-- ========== CONTACTS ==========
create policy "contacts_select" on public.contacts
  for select using (app.has_membership(tenant_id));

create policy "contacts_write" on public.contacts
  for all using (app.has_membership(tenant_id));

-- ========== MESSAGES ==========
create policy "messages_select" on public.messages
  for select using (app.has_membership(tenant_id));

create policy "messages_insert" on public.messages
  for insert with check (app.has_membership(tenant_id));

-- ========== UPLOADS ==========
create policy "uploads_select" on public.uploads
  for select using (app.has_membership(tenant_id));

create policy "uploads_write" on public.uploads
  for all using (app.has_membership(tenant_id));

-- ========== LOGS ==========
create policy "logs_select" on public.logs
  for select using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy "logs_insert" on public.logs
  for insert with check (app.has_membership(tenant_id));

-- ========== ENGINE COMMANDS ==========
create policy "engine_commands_select" on public.engine_commands
  for select using (app.has_membership(tenant_id));

create policy "engine_commands_insert" on public.engine_commands
  for insert with check (app.has_membership(tenant_id));

-- ========== ENGINE EVENTS ==========
create policy "engine_events_select" on public.engine_events
  for select using (app.has_membership(tenant_id));

-- ========== AGENT CONFIGS ==========
create policy "agent_configs_select" on agent_configs
  for select using (app.has_membership(tenant_id));

create policy "agent_configs_update" on agent_configs
  for update using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

-- ========== GROUPS / BROADCASTS / ETC ==========
create policy "groups_read" on public.groups for select
  using (app.has_membership(tenant_id));
create policy "groups_write" on public.groups for all
  using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy "campaign_groups_read" on public.campaign_groups for select
  using (app.has_membership(tenant_id));
create policy "campaign_groups_write" on public.campaign_groups for all
  using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy "broadcasts_read" on public.broadcasts for select
  using (app.has_membership(tenant_id));
create policy "broadcasts_write" on public.broadcasts for all
  using (app.has_membership(tenant_id));

create policy "campaign_messages_read" on public.campaign_messages for select
  using (app.has_membership(tenant_id));
create policy "campaign_messages_write" on public.campaign_messages for all
  using (app.has_membership(tenant_id));

create policy "schedules_read" on public.schedules for select
  using (app.has_membership(tenant_id));
create policy "schedules_write" on public.schedules for all
  using (app.has_membership(tenant_id));

create policy "tracked_links_read" on public.tracked_links for select
  using (app.has_membership(tenant_id));
create policy "tracked_links_write" on public.tracked_links for all
  using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

-- ========== TEMPLATES / ORDERS / REFERRALS ==========
create policy "templates_read" on templates for select
  using (app.has_membership(tenant_id));
create policy "templates_write" on templates for all
  using (app.has_membership(tenant_id));

create policy "orders_read" on orders for select
  using (app.has_membership(tenant_id));
create policy "orders_write" on orders for all
  using (app.has_membership(tenant_id));

create policy "referrals_read" on referrals for select
  using (app.has_membership(tenant_id));
create policy "referrals_write" on referrals for all
  using (app.has_membership(tenant_id));

create policy "referral_configs_read" on referral_configs for select
  using (app.has_membership(tenant_id));
create policy "referral_configs_write" on referral_configs for all
  using (app.has_role(tenant_id, array['owner','admin']::public.member_role[]));

-- Testimonials: public read, tenant write
create policy "testimonials_public_read" on testimonials
  for select using (approved = true);
create policy "testimonials_write" on testimonials
  for insert with check (app.has_membership(tenant_id));
