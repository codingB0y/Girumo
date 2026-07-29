-- Cartão compartilhável + depoimento (P2.17).
--
-- 1) `celebrations`: dedupe dos marcos de celebração (grupo lotou, meta batida,
--    marco de pedidos) — 1 linha por (tenant, marker_key), pra o modal disparar
--    no máximo 1× por marco. Só marcação; sem payload mutável.
-- 2) `testimonials.consent_public`: consentimento explícito de uso público do
--    depoimento (checkbox no modal). `approved` continua sendo o gate do admin;
--    `consent_public` é a permissão do lojista.

create table if not exists celebrations (
  tenant_id     uuid        not null references organizations(id) on delete cascade,
  marker_key    text        not null,
  celebrated_at timestamptz not null default now(),
  primary key (tenant_id, marker_key)
);

alter table celebrations enable row level security;

drop policy if exists celebrations_select_member on celebrations;
create policy celebrations_select_member on celebrations
  for select to authenticated
  using (tenant_id = any (app.user_tenant_ids()));

drop policy if exists celebrations_insert_member on celebrations;
create policy celebrations_insert_member on celebrations
  for insert to authenticated
  with check (tenant_id = any (app.user_tenant_ids()));

-- Consentimento de uso público do depoimento (default false — opt-in explícito).
alter table testimonials add column if not exists consent_public boolean not null default false;
