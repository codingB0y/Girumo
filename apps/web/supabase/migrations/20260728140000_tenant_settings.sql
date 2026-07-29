-- tenant_settings: preferências self-service por tenant.
--
-- Contexto: a tabela foi criada direto no projeto dev, fora de migração
-- versionada (só tenant_id/monthly_goal_contacts/monthly_goal_revenue/
-- updated_at). Produção não a tem. Esta migração é escrita para os dois casos:
-- CREATE IF NOT EXISTS reconstrói do zero (prod, ambiente novo) e os ALTERs
-- completam o que faltar onde ela já existe (dev). Rodar de novo é no-op.
--
-- Um ALTER puro deixaria a pasta migrations/ incapaz de reconstruir o banco:
-- nenhuma migração anterior cria esta tabela.
--
-- P1.9 (relatório semanal por e-mail) adiciona weekly_report_enabled.

create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.organizations(id) on delete cascade,
  monthly_goal_contacts integer,
  monthly_goal_revenue numeric,
  weekly_report_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Onde a tabela já existia (dev), completa as colunas que faltam.
alter table public.tenant_settings
  add column if not exists monthly_goal_contacts integer;
alter table public.tenant_settings
  add column if not exists monthly_goal_revenue numeric;
alter table public.tenant_settings
  add column if not exists weekly_report_enabled boolean not null default true;
alter table public.tenant_settings
  add column if not exists created_at timestamptz not null default now();
alter table public.tenant_settings
  add column if not exists updated_at timestamptz not null default now();

-- RLS — defesa em profundidade. O caminho ativo é service_role + filtro manual
-- .eq('tenant_id'); estas policies existem para que uma chave anon/authenticated
-- vazada não leia/escreva outro tenant.
alter table public.tenant_settings enable row level security;

-- A padronização de RLS (20260713100000) eliminou as policies baseadas em
-- current_setting('app.tenant_id') em favor de app.user_tenant_ids().
-- tenant_settings nasceu depois daquela migração e ficou com o padrão antigo;
-- alinha aqui. A policy legada não concedia nada de qualquer forma: sem a
-- variável de sessão, current_setting devolve null e o predicado nunca casa.
drop policy if exists tenant_settings_tenant_isolation on public.tenant_settings;

drop policy if exists tenant_settings_select_member on public.tenant_settings;
create policy tenant_settings_select_member on public.tenant_settings
  for select to authenticated
  using (tenant_id = any (app.user_tenant_ids()));

drop policy if exists tenant_settings_update_member on public.tenant_settings;
create policy tenant_settings_update_member on public.tenant_settings
  for update to authenticated
  using (tenant_id = any (app.user_tenant_ids()))
  with check (tenant_id = any (app.user_tenant_ids()));

drop trigger if exists set_updated_at_tenant_settings on public.tenant_settings;
create trigger set_updated_at_tenant_settings before update on public.tenant_settings
  for each row execute function app.set_updated_at();
