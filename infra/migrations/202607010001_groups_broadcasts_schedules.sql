-- HUBFLOW - Migração: stores JSON → Supabase
-- Cria tabelas para groups, campaign_groups (campanhas), broadcasts, campaign_messages,
-- schedules e tracked_links — substituindo os .json locais.

-- ============================================================
-- 1) GROUPS — espelho dos grupos do WhatsApp por tenant
-- ============================================================
create type public.group_engagement as enum ('alto', 'medio', 'baixo');

create table public.groups (
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

create index groups_tenant_idx on public.groups (tenant_id);
create trigger set_updated_at_groups before update on public.groups for each row execute function app.set_updated_at();

-- ============================================================
-- 2) CAMPAIGN_GROUPS — as "campanhas" de roteamento (com slug, tracked links)
-- ============================================================
create table public.campaign_groups (
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

create index campaign_groups_tenant_idx on public.campaign_groups (tenant_id);
create index campaign_groups_slug_idx on public.campaign_groups (slug);
create trigger set_updated_at_campaign_groups before update on public.campaign_groups for each row execute function app.set_updated_at();

-- ============================================================
-- 3) BROADCASTS — mensagens em massa (antigo broadcasts.json)
-- ============================================================
create type public.broadcast_status as enum ('draft', 'queued', 'running', 'sent', 'failed');

create table public.broadcasts (
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

create index broadcasts_tenant_status_idx on public.broadcasts (tenant_id, status);
create index broadcasts_campaign_group_idx on public.broadcasts (campaign_group_id);
create trigger set_updated_at_broadcasts before update on public.broadcasts for each row execute function app.set_updated_at();

-- ============================================================
-- 4) CAMPAIGN_MESSAGES — módulo de mensagens dentro de campanhas
-- ============================================================
create type public.campaign_message_type as enum ('text', 'image', 'video', 'audio', 'file', 'poll');
create type public.campaign_message_status as enum ('draft', 'scheduled', 'queued', 'running', 'sent', 'failed');
create type public.schedule_recurrence as enum ('none', 'daily', 'weekly');

create table public.campaign_messages (
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

create index campaign_messages_tenant_idx on public.campaign_messages (tenant_id);
create index campaign_messages_campaign_idx on public.campaign_messages (campaign_group_id);
create index campaign_messages_status_idx on public.campaign_messages (status, scheduled_at);
create trigger set_updated_at_campaign_messages before update on public.campaign_messages for each row execute function app.set_updated_at();

-- ============================================================
-- 5) SCHEDULES — agendamentos genéricos (antigo schedules.json)
-- ============================================================
create type public.schedule_status as enum ('pending', 'running', 'done', 'failed');

create table public.schedules (
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

create index schedules_tenant_status_idx on public.schedules (tenant_id, status);
create index schedules_due_idx on public.schedules (status, scheduled_at) where status = 'pending';
create trigger set_updated_at_schedules before update on public.schedules for each row execute function app.set_updated_at();

-- ============================================================
-- 6) TRACKED_LINKS — links rastreados por campanha
-- ============================================================
create table public.tracked_links (
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

create index tracked_links_tenant_idx on public.tracked_links (tenant_id);
create index tracked_links_slug_idx on public.tracked_links (slug);
create trigger set_updated_at_tracked_links before update on public.tracked_links for each row execute function app.set_updated_at();

-- ============================================================
-- 7) RLS POLICIES
-- ============================================================
alter table public.groups enable row level security;
alter table public.campaign_groups enable row level security;
alter table public.broadcasts enable row level security;
alter table public.campaign_messages enable row level security;
alter table public.schedules enable row level security;
alter table public.tracked_links enable row level security;

-- Membros do tenant podem ler tudo do seu tenant
create policy "groups_tenant_read" on public.groups for select using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);
create policy "groups_tenant_write" on public.groups for all using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null and role in ('owner', 'admin'))
);

create policy "campaign_groups_tenant_read" on public.campaign_groups for select using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);
create policy "campaign_groups_tenant_write" on public.campaign_groups for all using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null and role in ('owner', 'admin'))
);

create policy "broadcasts_tenant_read" on public.broadcasts for select using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);
create policy "broadcasts_tenant_write" on public.broadcasts for all using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);

create policy "campaign_messages_tenant_read" on public.campaign_messages for select using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);
create policy "campaign_messages_tenant_write" on public.campaign_messages for all using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);

create policy "schedules_tenant_read" on public.schedules for select using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);
create policy "schedules_tenant_write" on public.schedules for all using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);

create policy "tracked_links_tenant_read" on public.tracked_links for select using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null)
);
create policy "tracked_links_tenant_write" on public.tracked_links for all using (
  tenant_id in (select tenant_id from public.memberships where user_id = auth.uid() and accepted_at is not null and role in ('owner', 'admin'))
);

-- Service role bypass (para APIs do backend que usam admin client)
-- O admin client do Supabase (service_role) já bypassa RLS por padrão.
