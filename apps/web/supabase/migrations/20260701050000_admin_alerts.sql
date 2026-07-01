-- Admin Alerts table
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

create index if not exists idx_admin_alerts_unread on admin_alerts(created_at desc) where read_at is null;
create index if not exists idx_admin_alerts_type on admin_alerts(type);

-- RLS: apenas service_role acessa (admin usa service_role)
alter table admin_alerts enable row level security;
