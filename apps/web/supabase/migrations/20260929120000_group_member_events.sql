-- Entradas e saídas de verdade nos grupos (painel direção D, PR D; spec
-- docs/superpowers/specs/2026-09-24-painel-direcao-d-design.md).
--
-- Até aqui o painel só sabia a 1ª entrada de cada pessoa (leads.entered_at, no
-- grupo de origem) e a última saída de quem tem telefone (leads.metadata.left_at).
-- Quem entra num 2º grupo, sai e volta, ou sai sem telefone conhecido não
-- aparecia em lugar nenhum. Esta tabela guarda cada entrada e cada saída como o
-- webhook da Evolution avisa (group-participants.update, add e remove).
--
-- Não há histórico para trás: conta a partir do deploy do webhook.
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json.

create table if not exists public.group_member_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_group_id text not null,
  -- O id do participante como a Evolution manda: `@lid` na quase totalidade.
  -- Não é telefone e nunca vira telefone.
  participant text not null,
  kind text not null check (kind in ('join', 'leave')),
  -- O minuto em que o aviso chegou ao webhook (o `date_time` da Evolution é a
  -- hora de Brasília com "Z", então não serve; corrigido no #345). Truncado de propósito: dois
  -- números da mesma loja no mesmo grupo recebem o mesmo aviso com poucos
  -- milissegundos de diferença, e o índice único abaixo conta a pessoa uma vez.
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.group_member_events is
  'Uma linha por pessoa que entrou ou saiu de um grupo onde a loja é admin, gravada pelo webhook da Evolution. Fonte de "Entraram" e "Saíram" no painel. Cresce sem limite: quando incomodar, agregar por dia e podar o detalhe antigo.';

-- Único e, na mesma ordem, o índice das consultas do painel: loja + grupos da
-- campanha + intervalo de tempo.
create unique index if not exists group_member_events_uniq
  on public.group_member_events (tenant_id, whatsapp_group_id, occurred_at, participant, kind);

-- RLS como segunda linha: quem grava e lê é o servidor, com o tenant explícito.
alter table public.group_member_events enable row level security;

drop policy if exists "group_member_events_tenant_read" on public.group_member_events;
create policy "group_member_events_tenant_read" on public.group_member_events
  for select using (app.has_membership(tenant_id));

-- Só o servidor escreve: nenhum usuário logado cria ou apaga entrada de grupo.
revoke insert, update, delete, truncate on public.group_member_events from authenticated;

-- A série da campanha ganha entraram e saíram. O tipo de retorno muda, e isso
-- `create or replace` não faz: sai e volta na mesma transação.
drop function if exists public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text);

create function public.campaign_activity(
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
  'Novas pessoas (leads.entered_at), cliques no link (link_click_events) e entradas e saídas (group_member_events) da campanha por hora ou dia de Brasília, com zero nas fatias vazias. Chamada só pelo servidor, com o tenant explícito.';

-- Entraram e saíram de cada grupo num intervalo: a coluna "Entraram hoje" da
-- tabela de grupos. No máximo uma linha por grupo da campanha.
create or replace function public.campaign_group_member_counts(
  p_tenant uuid,
  p_group_ids text[],
  p_from timestamptz,
  p_to timestamptz
)
returns table (whatsapp_group_id text, entraram bigint, sairam bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.whatsapp_group_id,
         count(*) filter (where m.kind = 'join'),
         count(*) filter (where m.kind = 'leave')
  from public.group_member_events m
  where m.tenant_id = p_tenant
    and m.whatsapp_group_id = any (p_group_ids)
    and m.occurred_at >= p_from
    and m.occurred_at < p_to
    and p_to - p_from <= interval '45 days'
  group by 1;
$$;

comment on function public.campaign_group_member_counts(uuid, text[], timestamptz, timestamptz) is
  'Entradas e saídas (group_member_events) por grupo num intervalo de até 45 dias. Chamada só pelo servidor, com o tenant explícito.';

-- O default privilege do grantor postgres dá EXECUTE a authenticated em toda
-- função nova de public (privilegio-definer.test.ts): quem chama é só o servidor.
revoke all on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) to service_role;
revoke all on function public.campaign_group_member_counts(uuid, text[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_group_member_counts(uuid, text[], timestamptz, timestamptz) to service_role;
