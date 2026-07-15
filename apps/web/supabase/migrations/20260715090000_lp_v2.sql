-- ============================================================
-- Girumo LP v2 — dimensões do modelo, contato × captura, funil de 5 eventos
-- Base: feat/lp-experience (flow_pages 20260702). Sem dados de produção →
-- migração forward. RLS espelha as tabelas lp_* irmãs (current_setting
-- 'app.tenant_id'); service_role é o gate primário, RLS é defesa em profundidade.
-- Reversível: bloco de ROLLBACK comentado no fim.
-- ============================================================

-- landing_pages: dimensões do modelo + versionamento de conteúdo/aviso
alter table landing_pages
  add column if not exists structure text not null default 'conversion'
    check (structure in ('conversion')),
  add column if not exists visual_direction text not null default 'premium'
    check (visual_direction in ('premium')),
  add column if not exists model_version int not null default 1,
  add column if not exists content_schema_version int not null default 2,
  add column if not exists notice_version text not null default 'v1',
  add column if not exists published_version int not null default 0;

-- CONTATO: único por tenant+whatsapp (dedup global de pessoa)
create table if not exists lp_contacts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizations(id) on delete cascade,
  name       text,
  whatsapp   text not null,                 -- E.164 BR (+55DDDNÚMERO)
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, whatsapp)
);
create index if not exists idx_lp_contacts_tenant on lp_contacts(tenant_id);
alter table lp_contacts enable row level security;
create policy "lp_contacts_tenant_isolation" on lp_contacts
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- CAPTURA: por página+versão+campanha, referencia o contato; snapshot do aviso
create table if not exists lp_captures (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,
  landing_page_id   uuid not null references landing_pages(id) on delete cascade,
  contact_id        uuid not null references lp_contacts(id) on delete cascade,
  published_version int  not null default 0,
  campaign_slug     text,
  structure         text not null default 'conversion',
  visual_direction  text not null default 'premium',
  model_version     int  not null default 1,
  notice_version    text not null,
  notice_text       text not null,          -- snapshot do aviso apresentado (prova)
  device            text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  fbclid text, gclid text, ttclid text, referrer text,
  idem_key          text not null,          -- chave idempotente do envio
  group_clicked_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (landing_page_id, published_version, contact_id, idem_key)
);
create index if not exists idx_lp_captures_tenant on lp_captures(tenant_id);
create index if not exists idx_lp_captures_page on lp_captures(landing_page_id);
create index if not exists idx_lp_captures_contact on lp_captures(contact_id);
alter table lp_captures enable row level security;
create policy "lp_captures_tenant_isolation" on lp_captures
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- EVENTOS: funil de 5 canônicos + compat legado + dimensões + idempotência
alter table lp_tracking_events
  drop constraint if exists lp_tracking_events_event_name_check;
alter table lp_tracking_events
  add constraint lp_tracking_events_event_name_check
  check (event_name in (
    'page_view','form_start','lead_submit_attempt','lead_created','group_click', -- canônicos
    'PageView','Lead','GroupJoin'                                                 -- legado (compat)
  ));
alter table lp_tracking_events
  add column if not exists published_version int,
  add column if not exists structure text,
  add column if not exists visual_direction text,
  add column if not exists model_version int,
  add column if not exists device text,
  add column if not exists idem_key text;
create unique index if not exists uq_lp_events_idem
  on lp_tracking_events(landing_page_id, event_name, idem_key) where idem_key is not null;

-- ============================================================
-- ROLLBACK (reversível) — descomente para reverter:
--   drop index if exists uq_lp_events_idem;
--   alter table lp_tracking_events
--     drop column if exists idem_key, drop column if exists device,
--     drop column if exists model_version, drop column if exists visual_direction,
--     drop column if exists structure, drop column if exists published_version;
--   alter table lp_tracking_events drop constraint if exists lp_tracking_events_event_name_check;
--   alter table lp_tracking_events add constraint lp_tracking_events_event_name_check
--     check (event_name in ('PageView','Lead','GroupJoin'));
--   drop table if exists lp_captures;
--   drop table if exists lp_contacts;
--   alter table landing_pages
--     drop column if exists published_version, drop column if exists notice_version,
--     drop column if exists content_schema_version, drop column if exists model_version,
--     drop column if exists visual_direction, drop column if exists structure;
-- ============================================================
