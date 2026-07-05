-- ============================================================
-- Flow Pages — landing pages de captação pra grupos de WhatsApp
-- Tabelas prefixadas lp_* (leads/tracking_events já existem como
-- conceitos no domínio legado — evita colisão).
-- ============================================================

-- Catálogo de templates (mantido pelo time, não por tenant)
create table if not exists landing_page_templates (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  niche           text,
  component_key   text not null,
  default_copy    jsonb not null default '{}',
  required_fields text[] not null default '{}',
  thumbnail_url   text,
  created_at      timestamptz not null default now()
);

alter table landing_page_templates enable row level security;

-- Catálogo é leitura pública-autenticada; escrita só via service role
create policy "lp_templates_read" on landing_page_templates
  for select using (true);

-- Instâncias publicadas por tenant
create table if not exists landing_pages (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references organizations(id) on delete cascade,
  template_id      uuid not null references landing_page_templates(id),
  slug             text unique not null
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                          and char_length(slug) between 3 and 60),
  status           text not null default 'draft'
                   check (status in ('draft','published','paused')),
  content          jsonb not null default '{}',
  campaign_slug    text,           -- destino preferido: link rastreado /r/{slug} (rotação)
  target_group_url text,           -- fallback: URL fixa de grupo
  meta_pixel_id    text,
  ga4_id           text,
  tiktok_pixel_id  text,
  published_at     timestamptz,
  views_count      integer not null default 0,  -- cache; fonte de verdade = lp_tracking_events
  leads_count      integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (campaign_slug is not null or target_group_url is not null or status = 'draft')
);

create index if not exists idx_landing_pages_tenant on landing_pages(tenant_id);

alter table landing_pages enable row level security;

create policy "landing_pages_tenant_isolation" on landing_pages
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Leads capturados pelas LPs
create table if not exists lp_leads (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references organizations(id) on delete cascade,
  landing_page_id  uuid not null references landing_pages(id) on delete cascade,
  name             text,
  whatsapp         text,           -- normalizado E.164 BR (+55DDDNÚMERO) no server
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_content      text,
  utm_term         text,
  fbclid           text,
  gclid            text,
  ttclid           text,
  referrer         text,
  user_agent       text,
  ip_hash          text,           -- sha256(ip + LP_IP_SALT) — nunca IP puro (LGPD)
  country          text,
  city             text,
  consent_at       timestamptz not null,
  consent_text     text not null,  -- snapshot do texto aceito (prova LGPD)
  status           text not null default 'novo'
                   check (status in ('novo','enviado_grupo','engajado')),
  entered_group_at timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_lp_leads_tenant on lp_leads(tenant_id);
create index if not exists idx_lp_leads_landing_page on lp_leads(landing_page_id);
create index if not exists idx_lp_leads_created on lp_leads(created_at desc);
-- Dedup: mesmo WhatsApp na mesma LP = upsert (preserva 1º consent)
create unique index if not exists uq_lp_leads_lp_whatsapp
  on lp_leads(landing_page_id, whatsapp) where whatsapp is not null;

alter table lp_leads enable row level security;

create policy "lp_leads_tenant_isolation" on lp_leads
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Log de eventos client+server side
create table if not exists lp_tracking_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references organizations(id) on delete cascade,
  landing_page_id uuid not null references landing_pages(id) on delete cascade,
  event_name      text not null check (event_name in ('PageView','Lead','GroupJoin')),
  event_data      jsonb not null default '{}',
  sent_to_meta    boolean not null default false,
  sent_to_ga4     boolean not null default false,
  sent_to_tiktok  boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_lp_tracking_events_landing_page
  on lp_tracking_events(landing_page_id);
create index if not exists idx_lp_tracking_events_tenant_time
  on lp_tracking_events(tenant_id, created_at desc);
-- Retenção: eventos > 90 dias são elegíveis a delete (cron externo, ver docs)

alter table lp_tracking_events enable row level security;

create policy "lp_tracking_events_tenant_isolation" on lp_tracking_events
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Contadores-cache sem hot-row race
create or replace function increment_lp_counter(p_lp_id uuid, p_field text)
returns void language sql security definer as $$
  update landing_pages
  set views_count = views_count + (p_field = 'views')::int,
      leads_count = leads_count + (p_field = 'leads')::int,
      updated_at  = now()
  where id = p_lp_id;
$$;

-- ============================================================
-- Seed: 3 templates por gatilho psicológico
-- ============================================================
insert into landing_page_templates (slug, name, niche, component_key, default_copy, required_fields)
values
  (
    'promo-relampago',
    'Promoção relâmpago',
    'varejo',
    'promo-relampago',
    '{
      "headline": "⚡ 40% OFF só até meia-noite",
      "description": "Oferta exclusiva pra quem entra no grupo hoje. Estoque limitado.",
      "badge": "PROMOÇÃO RELÂMPAGO",
      "cta": "Quero meu desconto",
      "scarcity_note": "restam poucas vagas no grupo"
    }'::jsonb,
    array['store_name','photo_url','headline','description','group_topic','primary_color']
  ),
  (
    'sorteio-premio',
    'Sorteio de prêmio',
    'varejo',
    'sorteio-premio',
    '{
      "headline": "Concorra a um kit completo grátis",
      "description": "Entre no grupo e participe do sorteio desta semana. Ganhador anunciado ao vivo.",
      "badge": "SORTEIO ATIVO",
      "cta": "Participar do sorteio",
      "rules_note": "sorteio entre membros do grupo · sem compra obrigatória"
    }'::jsonb,
    array['store_name','photo_url','headline','description','group_topic','primary_color']
  ),
  (
    'catalogo-grupo',
    'Catálogo no grupo',
    'varejo',
    'catalogo-grupo',
    '{
      "headline": "O catálogo que não vai pro feed",
      "description": "Peças novas e preço de atacado, só pra quem tá dentro.",
      "badge": "ACESSO ANTECIPADO",
      "cta": "Ver o catálogo no grupo",
      "teaser_note": "novidades toda semana, antes de todo mundo"
    }'::jsonb,
    array['store_name','photo_url','headline','description','group_topic','primary_color']
  )
on conflict (slug) do nothing;
