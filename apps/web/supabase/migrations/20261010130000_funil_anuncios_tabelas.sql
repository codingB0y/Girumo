-- apps/web/supabase/migrations/20261010130000_funil_anuncios_tabelas.sql
-- Funil de anúncios, parte 1: tabelas (docs/superpowers/specs/2026-10-10-funil-anuncios-design.md §2).
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json
-- (f|phone_key, t|site_integrations, t|site_captures, t|ad_spend, t|link_click_events).

-- Chave de telefone: DDD + últimos 8 dígitos. É ela que junta cadastro, contato e
-- pedido apesar do nono dígito (970 dos 1.214 contatos da loja-piloto chegam sem o 9)
-- e do 55 do país. Colisão aceita: fixo XXXX-XXXX e celular 9XXXX-XXXX com os mesmos
-- 8 finais no mesmo DDD.
-- ATENÇÃO: site_captures.phone_key é coluna GERADA com esta função. Mudar o corpo
-- daqui não recalcula as linhas gravadas: exige reescrever a coluna.
create or replace function public.phone_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when length(d) >= 10 then left(d, 2) || right(d, 8) end
  from (
    select case when length(x) >= 12 and left(x, 2) = '55' then substr(x, 3) else x end as d
    from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^0+', '') as x) a
  ) b
$$;

comment on function public.phone_key(text) is
  'DDD + últimos 8 dígitos do telefone (sem 55, sem nono dígito). Chave da atribuição do funil de anúncios.';

-- Função pura, usada em índice de expressão e em coluna gerada: quem grava nessas
-- tabelas (authenticated, service_role) precisa executá-la. anon nunca; sem o revoke
-- de public, anon herdaria EXECUTE onde o event trigger ensure_anon_revoked não existe.
revoke execute on function public.phone_key(text) from public, anon;
grant execute on function public.phone_key(text) to authenticated, service_role;

-- Uma integração de site próprio por loja. A chave inteira nunca é guardada: só o
-- sha256 (comparação por igualdade do hash) e os 4 últimos caracteres para a tela.
create table if not exists public.site_integrations (
  tenant_id       uuid primary key references public.organizations(id) on delete cascade,
  key_hash        text not null,
  key_last4       text not null,
  tracked_link_id uuid not null references public.tracked_links(id) on delete restrict,
  created_at      timestamptz not null default now(),
  rotated_at      timestamptz,
  last_used_at    timestamptz,
  constraint site_integrations_key_hash_unique unique (key_hash),
  constraint site_integrations_key_hash_formato check (key_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.site_integrations is
  'Chave do site próprio do lojista (POST /api/integracoes/cadastro). Só o hash; trocar a chave desliga a anterior.';

-- Cadastro vindo do site próprio. phone_key gerada: a junção usa o índice abaixo.
create table if not exists public.site_captures (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.organizations(id) on delete cascade,
  whatsapp        text not null,
  phone_key       text generated always as (public.phone_key(whatsapp)) stored,
  event_id        text not null,
  tracked_link_id uuid references public.tracked_links(id) on delete set null,
  page_url        text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  fbclid          text,
  fbc             text,
  fbp             text,
  created_at      timestamptz not null default now(),
  -- O site reenvia o mesmo event_id no segundo toque: não pode virar dois cadastros.
  constraint site_captures_tenant_event_unique unique (tenant_id, event_id)
);

comment on table public.site_captures is
  'Cadastro (WhatsApp + UTMs) enviado pelo site próprio do lojista. Origem do funil de anúncios; nunca guarda IP nem user-agent.';

create index if not exists site_captures_tenant_key_idx
  on public.site_captures (tenant_id, phone_key, created_at desc);
create index if not exists site_captures_tenant_created_idx
  on public.site_captures (tenant_id, created_at);

-- Gasto de anúncio lançado à mão, por campanha (utm_campaign exato).
create table if not exists public.ad_spend (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.organizations(id) on delete cascade,
  utm_campaign text not null,
  starts_on    date not null,
  ends_on      date not null,
  amount       numeric(12, 2) not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ad_spend_campanha_tamanho check (char_length(utm_campaign) between 1 and 200),
  constraint ad_spend_periodo check (ends_on >= starts_on),
  constraint ad_spend_valor check (amount > 0 and amount <= 10000000)
);

create index if not exists ad_spend_tenant_idx on public.ad_spend (tenant_id, starts_on);

-- O clique passa a saber qual cadastro o trouxe (?cid=) e para qual grupo foi.
-- whatsapp_group_id é o que resolveClickTarget devolve em groupId (ex.: 1203...@g.us).
alter table public.link_click_events
  add column if not exists capture_id uuid references public.site_captures(id) on delete set null,
  add column if not exists whatsapp_group_id text;

create index if not exists link_click_events_capture_idx
  on public.link_click_events (capture_id) where capture_id is not null;

-- Junção pela chave nas tabelas que já existem.
create index if not exists leads_tenant_phone_key_idx
  on public.leads (tenant_id, public.phone_key(phone));
create index if not exists orders_tenant_phone_key_idx
  on public.orders (tenant_id, public.phone_key(phone));
create index if not exists lp_contacts_tenant_phone_key_idx
  on public.lp_contacts (tenant_id, public.phone_key(whatsapp));

-- RLS como segunda linha: quem grava e lê é o servidor (service-role), com o tenant explícito.
alter table public.site_integrations enable row level security;
alter table public.site_captures enable row level security;
alter table public.ad_spend enable row level security;

-- site_integrations: SEM policy, de propósito. O hash da chave não tem por que sair do
-- servidor, nem para o dono. Não "destravar" com using (true): ler isto pelo JWT é bug.
revoke all on public.site_integrations from authenticated;

drop policy if exists "site_captures_tenant_read" on public.site_captures;
create policy "site_captures_tenant_read" on public.site_captures
  for select using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.site_captures from authenticated;

drop policy if exists "ad_spend_tenant_read" on public.ad_spend;
create policy "ad_spend_tenant_read" on public.ad_spend
  for select using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.ad_spend from authenticated;

-- O event trigger ensure_anon_revoked já tira anon de tabela e função novas; explícito
-- para não depender dele estar aplicado no banco.
revoke all on public.site_integrations, public.site_captures, public.ad_spend from anon;
