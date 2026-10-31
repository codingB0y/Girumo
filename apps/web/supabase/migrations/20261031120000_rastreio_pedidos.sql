-- 2026-10-31 — Rastreio do pedido, PR 1: banco (spec docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md;
-- nomes no "Contrato entre os PRs" de docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md; plano
-- docs/superpowers/plans/2026-10-29-rastreio-pedidos-pr1-banco.md).
--
-- Os pedidos da Yampi que a loja quer acompanhar (tracking_orders), os avisos à cliente por etapa e canal
-- (tracking_notices) e a configuração da loja (tracking_settings); a regra da etapa que nunca volta, a gravação
-- do pedido sob trava de linha (public.rastreio_gravar_pedido) e a limpeza 90 dias depois da última etapa
-- (public.rastreio_purgar). Depende do B·1a (20261030120000): private_messages e tenant_settings.rastreio_enabled.
--
-- Tudo aqui é lido e escrito só pelo servidor (service_role): as três tabelas têm RLS ligado e NENHUMA policy
-- nem grant para anon/authenticated (telefone, e-mail selado e hash do documento da cliente não têm por que sair
-- pelo PostgREST). As funções executam só como service_role. Toda store filtra por tenant_id — exceto
-- rastreio_purgar, que é global por desenho.
--
-- Idempotente (if not exists, or replace): o job pode morrer entre aplicar e registrar, e o próximo run reaplica
-- o arquivo. Muda a baseline (t|tracking_orders, t|tracking_notices, t|tracking_settings,
-- f|rastreio_gravar_pedido, f|rastreio_purgar). O gate de drift não vê RLS, ACL, CHECK, índice nem corpo de
-- função: conferir com infra/tests/rastreio-check.sql nos dois bancos.

-- 1) Tabelas, índices e privilégios.

-- Um pedido por (loja, origem, id externo). etapa é uma das 8 de ETAPAS; events é a lista {etapa, at} que a
-- página do pedido mostra. link_token vai no link que a cliente recebe (nunca o id). purge_after é preenchido
-- quando o pedido chega a entregue ou cancelado.
create table if not exists public.tracking_orders (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.organizations(id) on delete cascade,
  source             text not null default 'yampi' check (source = 'yampi'),
  external_id        text not null,
  numero             text not null,
  order_created_at   timestamptz not null,
  status_raw         text not null,
  etapa              text not null check (etapa in ('aguardando_pagamento', 'confirmado', 'separando', 'enviado',
                                                    'retirada', 'problema', 'entregue', 'cancelado')),
  etapa_at           timestamptz not null default now(),
  events             jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  shipment_service   text,
  tracking_code      text,
  tracking_url       text,
  buyer_first_name   text,
  buyer_phone        text check (buyer_phone ~ '^55[1-9]{2}[0-9]{8,9}$'),  -- forma de telefoneCanonico
  phone_key          text generated always as (public.phone_key(buyer_phone)) stored,
  phone_last4        text generated always as (right(buyer_phone, 4)) stored,
  buyer_email_enc    text,             -- selado (lib/security/secret-box.ts)
  doc_hmac           text check (doc_hmac ~ '^[0-9a-f]{64}$'),
  link_token         text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
                       check (link_token ~ '^[0-9a-f]{32}$'),
  notices_stopped_at timestamptz,
  purge_after        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, source, external_id),
  unique (tenant_id, id)              -- alvo da FK composta de tracking_notices
);

comment on table public.tracking_orders is
  'Pedido da Yampi acompanhado pelo Rastreio. buyer_email_enc selado; doc_hmac = HMAC do documento. Some em purge_after (90 dias depois de entregue/cancelado). Só service_role.';

-- Um aviso por (pedido, etapa, canal). A FK composta garante que o aviso de uma loja nunca aponta pedido de outra.
create table if not exists public.tracking_notices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  order_id    uuid not null,
  etapa       text not null check (etapa in ('confirmado', 'enviado', 'retirada', 'problema', 'entregue')),
  channel     text not null check (channel in ('whatsapp', 'email')),
  status      text not null default 'pendente'
                check (status in ('pendente', 'enviando', 'enviado', 'entregue', 'lido', 'falhou', 'pulado')),
  message_id  uuid references public.private_messages(id) on delete set null,
  error       text,
  attempts    integer not null default 0 check (attempts >= 0),
  resends     integer not null default 0 check (resends >= 0),
  next_try_at timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.tracking_orders (tenant_id, id) on delete cascade,
  unique (order_id, etapa, channel)
);

comment on table public.tracking_notices is
  'Aviso do Rastreio à cliente, um por (pedido, etapa, canal). Só service_role.';

-- Configuração da loja. public_slug é o da página pública de consulta (mesmo formato de bio_pages.slug).
create table if not exists public.tracking_settings (
  tenant_id               uuid primary key references public.organizations(id) on delete cascade,
  public_slug             text not null unique
                            check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(public_slug) between 3 and 40),
  matrix                  jsonb not null default '{"confirmado": {"whatsapp": false, "email": false}, "enviado": {"whatsapp": true, "email": true}, "retirada": {"whatsapp": true, "email": true}, "problema": {"whatsapp": true, "email": true}, "entregue": {"whatsapp": true, "email": false}}'::jsonb
                            check (jsonb_typeof(matrix) = 'object'),
  notify_store_on_problem boolean not null default true,
  vip_link_id             uuid references public.tracked_links(id) on delete set null,
  store_whatsapp          text,
  imported_at             timestamptz,
  sweep_cursor            timestamptz,
  updated_at              timestamptz not null default now()
);

comment on table public.tracking_settings is
  'Configuração do Rastreio por loja: slug da consulta pública, matriz etapa × canal dos avisos. Só service_role.';

create index if not exists tracking_orders_doc_idx on public.tracking_orders (tenant_id, doc_hmac);
create index if not exists tracking_orders_etapa_idx on public.tracking_orders (tenant_id, etapa, etapa_at desc);
create index if not exists tracking_notices_fila_idx
  on public.tracking_notices (tenant_id, status, next_try_at) where status in ('pendente', 'enviando');
create index if not exists tracking_notices_message_idx
  on public.tracking_notices (message_id) where message_id is not null;

alter table public.tracking_orders enable row level security;
alter table public.tracking_notices enable row level security;
alter table public.tracking_settings enable row level security;

revoke all on public.tracking_orders, public.tracking_notices, public.tracking_settings
  from public, anon, authenticated;
grant select, insert, update, delete on public.tracking_orders, public.tracking_notices, public.tracking_settings
  to service_role;

-- 2) A regra da etapa. immutable: as duas só olham os argumentos.
create or replace function app.rastreio_etapa_ordem(p_etapa text)
returns integer language sql immutable set search_path to 'public', 'app'
as $$
  select case p_etapa
    when 'aguardando_pagamento' then 1 when 'confirmado' then 2 when 'separando' then 3 when 'enviado' then 4
    when 'retirada' then 5 when 'problema' then 5 when 'entregue' then 6 when 'cancelado' then 7 end
$$;

-- Aviso atrasado não leva a etapa para trás; cancelado vale sempre e não sai; retirada e problema voltam a enviado.
create or replace function app.rastreio_etapa_pode_mudar(p_atual text, p_nova text)
returns boolean language sql immutable set search_path to 'public', 'app'
as $$
  select coalesce(p_atual is null
    or (p_nova <> p_atual and p_atual <> 'cancelado'
        and (p_nova = 'cancelado'
             or (p_nova = 'enviado' and p_atual in ('retirada', 'problema'))
             or app.rastreio_etapa_ordem(p_nova) >= app.rastreio_etapa_ordem(p_atual))), false)
$$;

revoke all on function app.rastreio_etapa_ordem(text) from public, anon, authenticated;
grant execute on function app.rastreio_etapa_ordem(text) to service_role;
revoke all on function app.rastreio_etapa_pode_mudar(text, text) from public, anon, authenticated;
grant execute on function app.rastreio_etapa_pode_mudar(text, text) to service_role;
