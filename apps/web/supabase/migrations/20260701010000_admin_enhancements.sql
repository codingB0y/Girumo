-- Migration: Admin Enhancements
-- Adds: org status columns, platform_settings table, agent_configs table

-- 1. Coluna status na organizations (para suspender/ativar tenants)
alter table organizations add column if not exists status text default 'active';
alter table organizations add column if not exists suspended_at timestamptz;

-- 2. Tabela platform_settings (configurações editáveis do admin)
create table if not exists platform_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now(),
  updated_by text
);

-- 3. Tabela agent_configs (ativação e métricas de agentes IA por tenant)
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

create index if not exists idx_agent_configs_tenant on agent_configs(tenant_id);
create index if not exists idx_agent_configs_agent on agent_configs(agent_id);

-- 4. RLS para platform_settings (apenas service_role acessa)
alter table platform_settings enable row level security;
-- Sem policies = apenas service_role pode ler/escrever (admin usa service_role)

-- 5. RLS para agent_configs (tenant só vê os seus)
alter table agent_configs enable row level security;

create policy "Tenant can view own agent_configs"
  on agent_configs for select
  using (tenant_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid);

create policy "Tenant can update own agent_configs"
  on agent_configs for update
  using (tenant_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid);
