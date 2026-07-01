-- Notificações in-app por tenant
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null default 'info',
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_tenant_unread
  on notifications(tenant_id, created_at desc)
  where read_at is null;

create index idx_notifications_user
  on notifications(user_id, created_at desc);

-- RLS
alter table notifications enable row level security;

create policy "Users see own tenant notifications"
  on notifications for select
  using (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid() and accepted_at is not null
    )
  );

create policy "Users mark own notifications as read"
  on notifications for update
  using (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid() and accepted_at is not null
    )
  )
  with check (
    tenant_id in (
      select tenant_id from memberships
      where user_id = auth.uid() and accepted_at is not null
    )
  );
