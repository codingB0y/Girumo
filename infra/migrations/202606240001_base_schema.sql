-- HUBFLOW - Fase 4 - Base schema Supabase/Postgres
-- Apply before RLS policies and seeds.

create extension if not exists "pgcrypto";

create schema if not exists app;

create type public.member_role as enum ('owner', 'admin', 'operator');
create type public.organization_status as enum ('active', 'suspended', 'canceled');
create type public.subscription_status as enum ('free', 'trialing', 'active', 'past_due', 'canceled', 'unpaid');
create type public.instance_status as enum ('pending', 'qr', 'connected', 'disconnected', 'blocked', 'error');
create type public.funnel_status as enum ('draft', 'active', 'paused', 'archived');
create type public.campaign_status as enum ('draft', 'queued', 'running', 'paused', 'sent', 'failed', 'canceled');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_status as enum ('queued', 'sending', 'sent', 'delivered', 'read', 'failed');
create type public.upload_kind as enum ('media', 'document', 'avatar', 'campaign');
create type public.log_level as enum ('debug', 'info', 'warn', 'error');
create type public.engine_command_status as enum ('queued', 'processing', 'done', 'failed', 'canceled');
create type public.engine_event_status as enum ('received', 'processed', 'failed');

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app.set_organization_tenant_id()
returns trigger
language plpgsql
as $$
begin
  if new.id is null then
    new.id = gen_random_uuid();
  end if;

  if new.tenant_id is null then
    new.tenant_id = new.id;
  end if;

  if new.created_by is null then
    new.created_by = auth.uid();
  end if;

  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique,
  name text not null,
  slug text not null unique,
  status public.organization_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_tenant_id_matches_id check (tenant_id = id)
);

create table public.users (
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

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'operator',
  invited_by uuid references auth.users(id) on delete set null,
  invited_email text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_tenant_user_unique unique (tenant_id, user_id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  stripe_price_id text,
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_unique unique (code)
);

create table public.subscriptions (
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

create table public.instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
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

create table public.funnels (
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

create table public.campaigns (
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

create table public.contacts (
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

create table public.messages (
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

create table public.uploads (
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
  updated_at timestamptz not null default now(),
  constraint uploads_path_tenant_prefix check (path like ('uploads/' || tenant_id::text || '/%')),
  constraint uploads_tenant_path_unique unique (tenant_id, path)
);

create table public.logs (
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

create table public.engine_commands (
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

create table public.engine_events (
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

create index organizations_slug_idx on public.organizations (slug);
create index users_auth_user_id_idx on public.users (auth_user_id);
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_tenant_role_idx on public.memberships (tenant_id, role);
create index subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id);
create index instances_tenant_status_idx on public.instances (tenant_id, status);
create index campaigns_tenant_status_idx on public.campaigns (tenant_id, status);
create index contacts_tenant_email_idx on public.contacts (tenant_id, email);
create index messages_tenant_created_idx on public.messages (tenant_id, created_at desc);
create index logs_tenant_created_idx on public.logs (tenant_id, created_at desc);
create index engine_commands_claim_idx on public.engine_commands (status, available_at, created_at);
create index engine_events_status_idx on public.engine_events (status, created_at);

create trigger set_organization_tenant_id before insert on public.organizations for each row execute function app.set_organization_tenant_id();
create trigger set_updated_at_organizations before update on public.organizations for each row execute function app.set_updated_at();
create trigger set_updated_at_users before update on public.users for each row execute function app.set_updated_at();
create trigger set_updated_at_memberships before update on public.memberships for each row execute function app.set_updated_at();
create trigger set_updated_at_plans before update on public.plans for each row execute function app.set_updated_at();
create trigger set_updated_at_subscriptions before update on public.subscriptions for each row execute function app.set_updated_at();
create trigger set_updated_at_instances before update on public.instances for each row execute function app.set_updated_at();
create trigger set_updated_at_funnels before update on public.funnels for each row execute function app.set_updated_at();
create trigger set_updated_at_campaigns before update on public.campaigns for each row execute function app.set_updated_at();
create trigger set_updated_at_contacts before update on public.contacts for each row execute function app.set_updated_at();
create trigger set_updated_at_messages before update on public.messages for each row execute function app.set_updated_at();
create trigger set_updated_at_uploads before update on public.uploads for each row execute function app.set_updated_at();
create trigger set_updated_at_logs before update on public.logs for each row execute function app.set_updated_at();
create trigger set_updated_at_engine_commands before update on public.engine_commands for each row execute function app.set_updated_at();
create trigger set_updated_at_engine_events before update on public.engine_events for each row execute function app.set_updated_at();
