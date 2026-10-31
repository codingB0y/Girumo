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

-- 3) Gravar um pedido (aviso, varredura ou importação). Cria ou atualiza sob trava de linha; a etapa nunca
--    volta (app.rastreio_etapa_pode_mudar). Devolve {id, etapa, etapa_anterior, mudou, link_token,
--    notices_stopped_at, tem_telefone, tem_email}; criação = mudou true e etapa_anterior null.
create or replace function public.rastreio_gravar_pedido(p_tenant uuid, p_pedido jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'app'
as $$
declare
  v_ext   text  := nullif(btrim(p_pedido->>'external_id'), '');
  v_etapa text  := p_pedido->>'etapa';                         -- null = alias desconhecido
  v_hist  jsonb := coalesce(p_pedido->'historico', '[]'::jsonb);
  v_nova  text  := coalesce(v_etapa, 'aguardando_pagamento');
  v_carimbar boolean := coalesce((p_pedido->>'carimbar')::boolean, true);  -- false = importação
  v_linha public.tracking_orders;
  v_mudou boolean;
  v_em    timestamptz;
begin
  if p_tenant is null or v_ext is null then raise exception 'rastreio_gravar_pedido: loja e external_id obrigatórios'; end if;
  if v_etapa is not null and app.rastreio_etapa_ordem(v_etapa) is null then
    raise exception 'rastreio_gravar_pedido: etapa desconhecida %', v_etapa; end if;
  if jsonb_typeof(v_hist) <> 'array' then raise exception 'rastreio_gravar_pedido: historico precisa ser uma lista'; end if;
  -- Criação: pedido ao vivo carimba a etapa com a hora em que a Girumo viu. Importado sem histórico datado da
  -- etapa atual não ganha data inventada (spec §1.1): events fica como veio e etapa_at = criação do pedido.
  if v_carimbar and (v_hist -> -1) ->> 'etapa' is distinct from v_nova then
    v_hist := v_hist || jsonb_build_array(jsonb_build_object('etapa', v_nova, 'at', now())); end if;
  v_em := case when (v_hist -> -1) ->> 'etapa' = v_nova then ((v_hist -> -1) ->> 'at')::timestamptz
               else coalesce((p_pedido->>'order_created_at')::timestamptz, now()) end;

  loop
    insert into public.tracking_orders (tenant_id, source, external_id, numero, order_created_at, status_raw, etapa,
      etapa_at, events, shipment_service, tracking_code, tracking_url, buyer_first_name, buyer_phone, buyer_email_enc,
      doc_hmac, purge_after)
    values (p_tenant, 'yampi', v_ext, p_pedido->>'numero', (p_pedido->>'order_created_at')::timestamptz,
      p_pedido->>'status_raw', v_nova, v_em, v_hist, p_pedido->>'shipment_service', p_pedido->>'tracking_code',
      p_pedido->>'tracking_url', p_pedido->>'buyer_first_name', p_pedido->>'buyer_phone', p_pedido->>'buyer_email_enc',
      p_pedido->>'doc_hmac', case when v_nova in ('entregue', 'cancelado') then v_em + interval '90 days' end)
    on conflict (tenant_id, source, external_id) do nothing
    returning * into v_linha;
    if found then return jsonb_build_object('id', v_linha.id, 'etapa', v_linha.etapa, 'etapa_anterior', null,
                                            'mudou', true, 'link_token', v_linha.link_token,
                                            'notices_stopped_at', v_linha.notices_stopped_at,
                                            'tem_telefone', v_linha.buyer_phone is not null,
                                            'tem_email', v_linha.buyer_email_enc is not null); end if;
    -- Já existe, ou outra transação acabou de criar (o insert esperou por ela). A trava vem ANTES da regra:
    -- quem chega depois espera aqui e lê a etapa que o outro gravou.
    select * into v_linha from public.tracking_orders t
     where t.tenant_id = p_tenant and t.source = 'yampi' and t.external_id = v_ext for update;
    exit when found;  -- o purge apagou entre os dois comandos: cria de novo
  end loop;

  v_mudou := v_etapa is not null and app.rastreio_etapa_pode_mudar(v_linha.etapa, v_etapa);
  v_nova  := case when v_mudou then v_etapa else v_linha.etapa end;
  v_em    := case when v_mudou then now() else v_linha.etapa_at end;

  update public.tracking_orders t set
    etapa = v_nova, etapa_at = v_em, updated_at = now(),
    events = case when v_mudou then t.events || jsonb_build_array(jsonb_build_object('etapa', v_nova, 'at', v_em))
                  else t.events end,
    status_raw = case when v_mudou or v_etapa = v_linha.etapa then p_pedido->>'status_raw' else t.status_raw end,
    purge_after = case when v_nova in ('entregue', 'cancelado') then v_em + interval '90 days' end,
    -- Nulo não apaga: o aviso atrasado sem código não tira o código do pedido entregue.
    shipment_service = coalesce(p_pedido->>'shipment_service', t.shipment_service),
    tracking_code = coalesce(p_pedido->>'tracking_code', t.tracking_code),
    tracking_url = coalesce(p_pedido->>'tracking_url', t.tracking_url),
    buyer_first_name = coalesce(p_pedido->>'buyer_first_name', t.buyer_first_name),
    buyer_phone = coalesce(p_pedido->>'buyer_phone', t.buyer_phone),
    buyer_email_enc = coalesce(p_pedido->>'buyer_email_enc', t.buyer_email_enc),
    doc_hmac = coalesce(p_pedido->>'doc_hmac', t.doc_hmac)
  where t.id = v_linha.id;

  return jsonb_build_object('id', v_linha.id, 'etapa', v_nova, 'etapa_anterior', v_linha.etapa,
                            'mudou', v_mudou, 'link_token', v_linha.link_token,
                            'notices_stopped_at', v_linha.notices_stopped_at,
                            'tem_telefone', coalesce(p_pedido->>'buyer_phone', v_linha.buyer_phone) is not null,
                            'tem_email', coalesce(p_pedido->>'buyer_email_enc', v_linha.buyer_email_enc) is not null);
end;
$$;

revoke all on function public.rastreio_gravar_pedido(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rastreio_gravar_pedido(uuid, jsonb) to service_role;

-- 4) Limpeza: apaga os pedidos 90 dias depois de entregue/cancelado (os avisos vão junto, on delete cascade).
--    Global por desenho — a outra exceção ao filtro por loja. Devolve quantos pedidos apagou.
create or replace function public.rastreio_purgar()
returns integer language sql volatile security definer set search_path to 'public', 'app'
as $$
  with apagados as (delete from public.tracking_orders t where t.purge_after < now() returning 1)
  select count(*)::integer from apagados
$$;

revoke all on function public.rastreio_purgar() from public, anon, authenticated;
grant execute on function public.rastreio_purgar() to service_role;
