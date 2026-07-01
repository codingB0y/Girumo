-- Templates de mensagem (por tenant)
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text not null default 'drop',
  body text not null,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_templates_tenant on templates(tenant_id);

alter table templates enable row level security;

create policy "templates_tenant_isolation" on templates
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Helper RPC para incrementar uses
create or replace function increment_template_uses(template_id uuid)
returns void language sql security definer as $$
  update templates set uses = uses + 1 where id = template_id;
$$;

-- Orders (pedidos registrados pelo lojista)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  phone text not null default '',
  lead_id uuid,
  group_name text,
  value numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_tenant on orders(tenant_id);
create index if not exists idx_orders_phone on orders(tenant_id, phone);

alter table orders enable row level security;

create policy "orders_tenant_isolation" on orders
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Referrals (indicação premiada)
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  referrer_name text not null,
  group_name text not null,
  slug text not null,
  invite_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_referrals_tenant on referrals(tenant_id);
create unique index if not exists idx_referrals_slug on referrals(slug);

alter table referrals enable row level security;

create policy "referrals_tenant_isolation" on referrals
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Referral config (1 por tenant)
create table if not exists referral_configs (
  tenant_id uuid primary key references organizations(id) on delete cascade,
  reward text not null default 'Frete grátis no próximo pedido',
  goal integer not null default 3,
  updated_at timestamptz not null default now()
);

alter table referral_configs enable row level security;

create policy "referral_configs_tenant_isolation" on referral_configs
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
