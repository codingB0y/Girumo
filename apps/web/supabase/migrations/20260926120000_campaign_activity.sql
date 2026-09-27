-- Série da campanha por hora ou por dia, no relógio de Brasília (painel direção
-- D, PR C; spec docs/superpowers/specs/2026-09-24-painel-direcao-d-design.md).
--
-- Até aqui o painel contava as novas pessoas no navegador, a partir de
-- /api/leads, que o PostgREST corta em 1000 linhas sem avisar. E o clique com
-- data (link_click_events) era gravado e nunca lido. A função agrupa as duas
-- coisas no banco e devolve só as barras: 24 por dia, até 37 por mês.
--
-- "novas_pessoas" sai de leads.entered_at: a 1ª entrada de cada pessoa, no grupo
-- de origem (source_group_id). Entradas e saídas de verdade chegam no PR D.
--
-- security INVOKER, não definer: quem chama é o service-role do servidor, que já
-- lê as duas tabelas. Se o EXECUTE vazar para `authenticated`, o RLS delas ainda
-- vale; com definer, a função leria qualquer loja em nome de quem chamasse.
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json.

-- Cliques de UMA campanha num intervalo. O índice que existia é por loja e
-- tempo, e obrigava a ler os cliques de todas as campanhas da loja.
create index if not exists link_click_events_tenant_campaign_time_idx
  on public.link_click_events (tenant_id, campaign_group_id, occurred_at desc);

create or replace function public.campaign_activity(
  p_tenant uuid,
  p_campaign uuid,
  p_group_ids text[],
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text
)
returns table (bucket timestamptz, novas_pessoas bigint, cliques bigint)
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
    select date_trunc(p_bucket, e.occurred_at at time zone 'America/Sao_Paulo') as inicio, count(*) as n
    from public.link_click_events e
    where e.tenant_id = p_tenant
      and e.campaign_group_id = p_campaign
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
    group by 1
  )
  select f.inicio at time zone 'America/Sao_Paulo', coalesce(en.n, 0), coalesce(cl.n, 0)
  from fatia f
  left join entrada en on en.inicio = f.inicio
  left join clique cl on cl.inicio = f.inicio
  order by f.inicio;
$$;

comment on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) is
  'Novas pessoas (leads.entered_at nos grupos da campanha) e cliques no link (link_click_events da campanha) por hora ou dia de Brasília, com zero nas fatias vazias. Chamada só pelo servidor, com o tenant explícito.';

-- O default privilege do grantor postgres dá EXECUTE a authenticated em toda
-- função nova de public (privilegio-definer.test.ts): quem chama é só o servidor.
revoke all on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) to service_role;
