-- tenant_settings já existe no projeto dev (criada fora de migração versionada,
-- só com monthly_goal_contacts/monthly_goal_revenue/updated_at — pendência
-- conhecida, sincronizar com prod não é escopo deste item).
--
-- P1.9 (relatório semanal por e-mail): adiciona o opt-out. ALTER, não recria.
-- Idempotente: pode rodar de novo sem quebrar caso parte já exista.

alter table public.tenant_settings
  add column if not exists weekly_report_enabled boolean not null default true;

alter table public.tenant_settings
  add column if not exists created_at timestamptz not null default now();

alter table public.tenant_settings enable row level security;

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
