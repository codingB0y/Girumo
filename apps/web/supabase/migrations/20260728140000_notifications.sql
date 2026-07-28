-- ============================================================
-- Notifications — dedupe de e-mails/alertas transacionais por
-- tenant+tipo. Já referenciada por api/cron/emails (nudge_connect,
-- trial_ending) e agora pelo alerta de desconexão (P1.13) — a tabela
-- nunca tinha sido migrada, então esse dedup estava sempre "vazio".
-- ============================================================

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizations(id) on delete cascade,
  user_id    uuid,
  type       text not null,
  title      text,
  body       text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_tenant_type on notifications(tenant_id, type, created_at desc);

alter table notifications enable row level security;

create policy "notifications_tenant_isolation" on notifications
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
