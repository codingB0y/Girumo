-- ============================================================
-- Tenant settings — configurações persistidas por tenant.
-- Primeiro uso: meta do mês (contatos/receita) definida pelo lojista.
-- ============================================================

create table if not exists tenant_settings (
  tenant_id             uuid primary key references organizations(id) on delete cascade,
  monthly_goal_contacts integer,
  monthly_goal_revenue  numeric(12,2),
  updated_at            timestamptz not null default now()
);

alter table tenant_settings enable row level security;

create policy "tenant_settings_tenant_isolation" on tenant_settings
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
