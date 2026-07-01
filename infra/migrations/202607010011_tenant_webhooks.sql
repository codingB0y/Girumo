-- Configuração de webhook/notificação WhatsApp por tenant
create table if not exists tenant_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  type text not null default 'whatsapp',
  phone text,
  enabled boolean default true,
  events text[] default array['group_full', 'lead_hot', 'broadcast_failed']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, type)
);

alter table tenant_webhooks enable row level security;

create policy "Owners and admins manage webhooks"
  on tenant_webhooks for all
  using (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid()
        and accepted_at is not null
        and role in ('owner', 'admin')
    )
  );
