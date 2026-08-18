-- ============================================================
-- HUBFLOW DEV — TABELAS BASE
-- Executar após 00_full_schema_dev.sql
-- ============================================================

-- ORGANIZATIONS
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique,
  name text not null,
  slug text not null unique,
  status public.organization_status not null default 'active',
  suspended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_tenant_id_matches_id check (tenant_id = id)
);

-- USERS
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  email text not null,
  image text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_tenant_auth_user_unique unique (tenant_id, auth_user_id),
  constraint users_tenant_email_unique unique (tenant_id, email)
);

-- MEMBERSHIPS
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role public.member_role not null default 'operator',
  invited_by uuid references auth.users(id) on delete set null,
  invited_email text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_tenant_user_unique unique (tenant_id, user_id)
);

-- PLANS
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  stripe_price_id text,
  price_cents integer default 0,
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_unique unique (code)
);

-- SUBSCRIPTIONS
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status public.subscription_status not null default 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_tenant_unique unique (tenant_id),
  constraint subscriptions_stripe_subscription_unique unique (stripe_subscription_id)
);

-- INSTANCES (WhatsApp)
create table if not exists public.instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default '',
  phone text,
  profile_name text,
  status public.instance_status not null default 'pending',
  qr_code text,
  last_seen_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  engine_node text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FUNNELS
create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  status public.funnel_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CAMPAIGNS
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid references public.instances(id) on delete set null,
  funnel_id uuid references public.funnels(id) on delete set null,
  name text not null,
  status public.campaign_status not null default 'draft',
  audience jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CONTACTS
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  phone text,
  email text,
  tags text[] not null default '{}'::text[],
  attributes jsonb not null default '{}'::jsonb,
  opt_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_tenant_phone_unique unique (tenant_id, phone)
);

-- MESSAGES
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid references public.instances(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  direction public.message_direction not null,
  status public.message_status not null default 'queued',
  external_message_id text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- UPLOADS
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  kind public.upload_kind not null,
  bucket text not null default 'uploads',
  path text not null,
  mime_type text,
  size bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- LOGS
create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  instance_id uuid references public.instances(id) on delete set null,
  level public.log_level not null default 'info',
  event text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ENGINE COMMANDS
create table if not exists public.engine_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid references public.instances(id) on delete cascade,
  command_id uuid not null default gen_random_uuid(),
  type text not null,
  status public.engine_command_status not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engine_commands_command_id_unique unique (command_id)
);

-- ENGINE EVENTS
create table if not exists public.engine_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid references public.instances(id) on delete cascade,
  event_id uuid not null default gen_random_uuid(),
  type text not null,
  status public.engine_event_status not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engine_events_event_id_unique unique (event_id)
);

-- PLATFORM ADMINS
-- Autorização de /admin é por identidade. E-mail é rótulo, nunca credencial:
-- o signup não verifica posse do endereço, então uma allowlist de e-mails podia
-- ser reivindicada por quem registrasse o endereço primeiro.
create table if not exists platform_admins (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- AGENT CONFIGS
create table if not exists agent_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  agent_id text not null,
  enabled boolean default true,
  config jsonb default '{}',
  total_executions int default 0,
  last_execution_at timestamptz,
  created_at timestamptz default now(),
  unique(tenant_id, agent_id)
);

-- FUNNEL EVENTS
create table if not exists funnel_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  event_name text not null,
  metadata jsonb default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint uq_funnel_event unique (tenant_id, event_name)
);

-- ADMIN ALERTS
create table if not exists admin_alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('billing', 'instance', 'error', 'signup', 'info')),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text,
  metadata jsonb default '{}',
  tenant_id uuid references organizations(id) on delete set null,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- TEMPLATES
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text not null default 'drop',
  body text not null,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);

-- ORDERS
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  phone text not null default '',
  lead_id uuid,
  group_name text,
  value numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- REFERRALS
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  referrer_name text not null,
  group_name text not null,
  slug text not null,
  invite_url text not null,
  created_at timestamptz not null default now()
);

-- REFERRAL CONFIGS
create table if not exists referral_configs (
  tenant_id uuid primary key references organizations(id) on delete cascade,
  reward text not null default 'Frete grátis no próximo pedido',
  goal integer not null default 3,
  updated_at timestamptz not null default now()
);

-- TESTIMONIALS
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  store text not null default '',
  quote text not null,
  rating smallint not null default 5 check (rating between 1 and 5),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- GROUPS (WhatsApp)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_group_id text not null,
  name text not null,
  display_name_base text,
  display_number integer,
  members integer not null default 0,
  capacity integer not null default 1024,
  selected boolean not null default false,
  engagement public.group_engagement not null default 'medio',
  invite_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_tenant_whatsapp_unique unique (tenant_id, whatsapp_group_id)
);

-- CAMPAIGN GROUPS
create table if not exists public.campaign_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  group_ids text[] not null default '{}'::text[],
  auto_grow boolean not null default false,
  grow_template jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_groups_tenant_slug_unique unique (tenant_id, slug)
);

-- BROADCASTS
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  campaign_group_id uuid references public.campaign_groups(id) on delete set null,
  name text not null,
  message text not null default '',
  group_ids text[] not null default '{}'::text[],
  media_id text,
  media_type text,
  mention_all boolean not null default false,
  poll jsonb,
  status public.broadcast_status not null default 'draft',
  sent integer not null default 0,
  total integer not null default 0,
  error text,
  dispatched_at timestamptz,
  running_since timestamptz,
  last_ack_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CAMPAIGN MESSAGES
create table if not exists public.campaign_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  campaign_group_id uuid not null references public.campaign_groups(id) on delete cascade,
  campaign_slug text not null,
  type public.campaign_message_type not null default 'text',
  body text not null default '',
  group_ids text[] not null default '{}'::text[],
  media_id text,
  media_type text,
  media_name text,
  poll jsonb,
  mention_all boolean not null default false,
  scheduled_at timestamptz,
  recurrence public.schedule_recurrence not null default 'none',
  status public.campaign_message_status not null default 'draft',
  sent integer not null default 0,
  total integer not null default 0,
  error text,
  dispatched_at timestamptz,
  running_since timestamptz,
  last_ack_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SCHEDULES
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  broadcast_id uuid references public.broadcasts(id) on delete set null,
  campaign_message_id uuid references public.campaign_messages(id) on delete set null,
  name text not null,
  scheduled_at timestamptz not null,
  recurrence public.schedule_recurrence not null default 'none',
  status public.schedule_status not null default 'pending',
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TRACKED LINKS
create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  campaign_group_id uuid references public.campaign_groups(id) on delete cascade,
  slug text not null,
  target_url text not null,
  clicks integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracked_links_slug_unique unique (slug)
);
