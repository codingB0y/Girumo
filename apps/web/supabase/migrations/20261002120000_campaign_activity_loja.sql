-- Início "Ao vivo" (spec 2026-10-02): a faixa de status conta os cliques da loja
-- inteira. campaign_activity passa a aceitar p_campaign nulo; o resto da função
-- (novas pessoas e entradas/saídas, filtradas por p_group_ids) não muda.
-- Os cliques vão em dois ramos de union all: o filtro por campanha fica uma igualdade simples e
-- o índice por tenant/campanha/tempo continua usável no plano genérico da função.
-- create or replace não preserva ACL em dev: o revoke/grant vai de novo.

create or replace function public.campaign_activity(
  p_tenant uuid,
  p_campaign uuid,
  p_group_ids text[],
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text
)
returns table (bucket timestamptz, novas_pessoas bigint, cliques bigint, entraram bigint, sairam bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with fatia as (
    -- Uma linha por hora (ou dia) do intervalo, mesmo vazia: hora sem ninguém
    -- é zero, e é a tela que decide se ela ainda não aconteceu.
    select generate_series(
      date_trunc(p_bucket, p_from at time zone 'America/Sao_Paulo'),
      date_trunc(p_bucket, (p_to - interval '1 microsecond') at time zone 'America/Sao_Paulo'),
      case p_bucket when 'hour' then interval '1 hour' else interval '1 day' end
    ) as inicio
    where p_bucket in ('hour', 'day')
      and p_to > p_from
      and p_to - p_from <= interval '45 days'
  ),
  entrada as (
    select date_trunc(p_bucket, l.entered_at at time zone 'America/Sao_Paulo') as inicio, count(*) as n
    from public.leads l
    where l.tenant_id = p_tenant
      and l.source_group_id = any (p_group_ids)
      and l.entered_at >= p_from
      and l.entered_at < p_to
    group by 1
  ),
  clique as (
    -- Dois ramos, só um dá linha: o "p_campaign is null or ..." num ramo só impede o índice por campanha.
    -- Nulo = a loja inteira (a Início): todo clique do tenant, de link com ou sem campanha.
    select date_trunc(p_bucket, e.occurred_at at time zone 'America/Sao_Paulo') as inicio, count(*) as n
    from public.link_click_events e
    where e.tenant_id = p_tenant
      and p_campaign is null
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
    group by 1
    union all
    select date_trunc(p_bucket, e.occurred_at at time zone 'America/Sao_Paulo') as inicio, count(*) as n
    from public.link_click_events e
    where e.tenant_id = p_tenant
      and e.campaign_group_id = p_campaign
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
    group by 1
  ),
  membro as (
    select date_trunc(p_bucket, m.occurred_at at time zone 'America/Sao_Paulo') as inicio,
           count(*) filter (where m.kind = 'join') as entraram,
           count(*) filter (where m.kind = 'leave') as sairam
    from public.group_member_events m
    where m.tenant_id = p_tenant
      and m.whatsapp_group_id = any (p_group_ids)
      and m.occurred_at >= p_from
      and m.occurred_at < p_to
    group by 1
  )
  select f.inicio at time zone 'America/Sao_Paulo', coalesce(en.n, 0), coalesce(cl.n, 0),
         coalesce(me.entraram, 0), coalesce(me.sairam, 0)
  from fatia f
  left join entrada en on en.inicio = f.inicio
  left join clique cl on cl.inicio = f.inicio
  left join membro me on me.inicio = f.inicio
  order by f.inicio;
$$;

comment on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) is
  'Novas pessoas (leads.entered_at), cliques no link (link_click_events; p_campaign nulo = todos os links da loja) e entradas e saídas (group_member_events) por hora ou dia de Brasília, com zero nas fatias vazias. Chamada só pelo servidor, com o tenant explícito.';

revoke all on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) to service_role;
