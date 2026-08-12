-- Clique de link com data por evento.
--
-- Até aqui o clique só existia como contador: /r/:slug chamava
-- increment_tracked_link_clicks e somava 1 em tracked_links.clicks. Isso responde
-- "quantos cliques ao todo" e nada mais — não dá pra dizer quantos foram ontem,
-- e derivar uma curva diária de um acumulado seria inventar dado. O contador
-- CONTINUA existindo e continua sendo a fonte dos totais; esta tabela é o
-- histórico que faltava.
--
-- O que NÃO é guardado, de propósito: user-agent, IP e referer. Quem clica é
-- cliente do lojista, não usuário da plataforma, e o gráfico precisa de "quando
-- + qual link", não de quem. O ndjson legado (data/clicks.ndjson) guardava
-- user-agent; não foi reproduzido aqui.
--
-- Idempotente.

create table if not exists link_click_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  tracked_link_id uuid not null references tracked_links(id) on delete cascade,
  -- Desnormalizado de propósito: a campanha do link pode mudar depois, e o
  -- clique pertence à campanha que estava valendo na hora. `null` = link comum,
  -- sem campanha.
  campaign_group_id uuid references campaign_groups(id) on delete set null,
  occurred_at timestamptz not null default now()
);

-- Consulta principal: "cliques do tenant nos últimos N dias".
create index if not exists idx_link_click_events_tenant_time
  on link_click_events (tenant_id, occurred_at desc);

-- Por link, para a análise de uma campanha específica.
create index if not exists idx_link_click_events_link
  on link_click_events (tracked_link_id);

comment on table link_click_events is
  'Um registro por clique humano em /r/:slug. Bots não entram (filtrados na rota). Cresce sem limite: quando incomodar, agregar por dia e podar o detalhe antigo.';

-- RLS como segunda linha. A proteção primária continua sendo o filtro
-- .eq(tenant_id) nas queries, já que o app usa service-role.
alter table link_click_events enable row level security;

drop policy if exists "Tenants read own link clicks" on link_click_events;
create policy "Tenants read own link clicks"
  on link_click_events for select
  using (tenant_id::text = current_setting('request.jwt.claims', true)::jsonb->>'tenant_id');

drop policy if exists "Service role full access on link clicks" on link_click_events;
create policy "Service role full access on link clicks"
  on link_click_events for all
  using (current_setting('role', true) = 'service_role');
