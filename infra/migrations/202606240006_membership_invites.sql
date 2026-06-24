-- HUBFLOW - Membership invites
-- Allows pending invites before the invited user exists or accepts.

alter table public.memberships
  alter column user_id drop not null;

create unique index if not exists memberships_tenant_invited_email_pending_unique
  on public.memberships (tenant_id, lower(invited_email))
  where user_id is null and invited_email is not null and accepted_at is null;
