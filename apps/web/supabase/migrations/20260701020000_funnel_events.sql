-- Funnel events tracking table
-- Tracks key conversion milestones per tenant for funnel analytics.
-- Idempotent: one row per (tenant_id, event_name), upserted on re-occurrence.

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

-- Indexes for common queries
create index if not exists idx_funnel_events_tenant on funnel_events(tenant_id);
create index if not exists idx_funnel_events_event on funnel_events(event_name);
create index if not exists idx_funnel_events_occurred on funnel_events(occurred_at);

-- RLS: tenants can only read their own events
alter table funnel_events enable row level security;

create policy "Tenants read own funnel events"
  on funnel_events for select
  using (tenant_id::text = current_setting('request.jwt.claims', true)::jsonb->>'tenant_id');

-- Service role (admin) can insert/update for any tenant
create policy "Service role full access"
  on funnel_events for all
  using (current_setting('role', true) = 'service_role');
