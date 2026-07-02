-- ============================================================
-- HUBFLOW DEV — INDEXES + TRIGGERS
-- Executar após 01_tables.sql
-- ============================================================

-- INDEXES
create index if not exists organizations_slug_idx on public.organizations (slug);
create index if not exists users_auth_user_id_idx on public.users (auth_user_id);
create index if not exists memberships_user_id_idx on public.memberships (user_id);
create index if not exists memberships_tenant_role_idx on public.memberships (tenant_id, role);
create index if not exists subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id);
create index if not exists instances_tenant_status_idx on public.instances (tenant_id, status);
create index if not exists campaigns_tenant_status_idx on public.campaigns (tenant_id, status);
create index if not exists contacts_tenant_email_idx on public.contacts (tenant_id, email);
create index if not exists messages_tenant_created_idx on public.messages (tenant_id, created_at desc);
create index if not exists logs_tenant_created_idx on public.logs (tenant_id, created_at desc);
create index if not exists engine_commands_claim_idx on public.engine_commands (status, available_at, created_at);
create index if not exists engine_events_status_idx on public.engine_events (status, created_at);
create index if not exists idx_agent_configs_tenant on agent_configs(tenant_id);
create index if not exists idx_agent_configs_agent on agent_configs(agent_id);
create index if not exists idx_funnel_events_tenant on funnel_events(tenant_id);
create index if not exists idx_funnel_events_event on funnel_events(event_name);
create index if not exists idx_funnel_events_occurred on funnel_events(occurred_at);
create index if not exists idx_admin_alerts_unread on admin_alerts(created_at desc) where read_at is null;
create index if not exists idx_admin_alerts_type on admin_alerts(type);
create index if not exists idx_templates_tenant on templates(tenant_id);
create index if not exists idx_orders_tenant on orders(tenant_id);
create index if not exists idx_referrals_tenant on referrals(tenant_id);
create index if not exists idx_testimonials_approved on testimonials(approved) where approved = true;
create index if not exists groups_tenant_idx on public.groups (tenant_id);
create index if not exists campaign_groups_tenant_idx on public.campaign_groups (tenant_id);
create index if not exists campaign_groups_slug_idx on public.campaign_groups (slug);
create index if not exists broadcasts_tenant_status_idx on public.broadcasts (tenant_id, status);
create index if not exists broadcasts_campaign_group_idx on public.broadcasts (campaign_group_id);
create index if not exists campaign_messages_tenant_idx on public.campaign_messages (tenant_id);
create index if not exists campaign_messages_campaign_idx on public.campaign_messages (campaign_group_id);
create index if not exists campaign_messages_status_idx on public.campaign_messages (status, scheduled_at);
create index if not exists schedules_tenant_status_idx on public.schedules (tenant_id, status);
create index if not exists schedules_due_idx on public.schedules (status, scheduled_at) where status = 'pending';
create index if not exists tracked_links_tenant_idx on public.tracked_links (tenant_id);
create index if not exists tracked_links_slug_idx on public.tracked_links (slug);

-- Unique index para invites pendentes
create unique index if not exists memberships_tenant_invited_email_pending_unique
  on public.memberships (tenant_id, lower(invited_email))
  where user_id is null and invited_email is not null and accepted_at is null;

-- TRIGGERS
create or replace trigger set_organization_tenant_id before insert on public.organizations for each row execute function app.set_organization_tenant_id();

do $$ begin
  create trigger set_updated_at_organizations before update on public.organizations for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_users before update on public.users for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_memberships before update on public.memberships for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_plans before update on public.plans for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_subscriptions before update on public.subscriptions for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_instances before update on public.instances for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_funnels before update on public.funnels for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_campaigns before update on public.campaigns for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_contacts before update on public.contacts for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_messages before update on public.messages for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_uploads before update on public.uploads for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_logs before update on public.logs for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_engine_commands before update on public.engine_commands for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_engine_events before update on public.engine_events for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_groups before update on public.groups for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_campaign_groups before update on public.campaign_groups for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_broadcasts before update on public.broadcasts for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_campaign_messages before update on public.campaign_messages for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_schedules before update on public.schedules for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_updated_at_tracked_links before update on public.tracked_links for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;
