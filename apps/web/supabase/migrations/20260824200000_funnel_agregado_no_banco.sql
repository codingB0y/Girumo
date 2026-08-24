-- D.5 da auditoria de 22/08/2026 — o funil do admin contava errado em silencio.
--
-- `getFunnelMetrics` e `getTenantFunnelMatrix` liam `funnel_events` linha a linha
-- e contavam em JS. O PostgREST corta a resposta em `max-rows` (1000) sem erro
-- nenhum: passando disso o funil simplesmente conta menos, e a tela nao tem como
-- saber. Mesma familia do B.1 — numero errado com cara de numero certo.
--
-- As duas funcoes devolvem um unico `jsonb` em vez de um conjunto de linhas: nao
-- existe limite de linhas para ser cortado, e o `group by` roda no banco.

create or replace function public.funnel_event_counts()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_object_agg(event_name, total), '{}'::jsonb)
  from (
    select event_name, count(*) as total
    from public.funnel_events
    group by event_name
  ) t;
$$;

comment on function public.funnel_event_counts() is
  'Contagem de funnel_events por event_name, agregada no banco. Devolve jsonb (e nao linhas) porque o PostgREST corta conjunto em max-rows sem avisar. Usada por getFunnelMetrics no admin.';

create or replace function public.funnel_tenant_matrix()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(linha order by created_at desc), '[]'::jsonb)
  from (
    select
      o.created_at,
      jsonb_build_object(
        'tenant_id', o.id,
        'name', o.name,
        'created_at', o.created_at,
        'milestones', coalesce(m.milestones, '{}'::jsonb)
      ) as linha
    from public.organizations o
    left join (
      -- min(occurred_at) guarda a PRIMEIRA ocorrencia. O unique por
      -- (tenant_id, event_name) ja garante uma linha so, mas dado anterior a
      -- constraint pode ter duplicata — o min mantem o comportamento que o JS
      -- tinha antes.
      select tenant_id, jsonb_object_agg(event_name, first_at) as milestones
      from (
        select tenant_id, event_name, min(occurred_at) as first_at
        from public.funnel_events
        group by tenant_id, event_name
      ) f
      group by tenant_id
    ) m on m.tenant_id = o.id
  ) x;
$$;

comment on function public.funnel_tenant_matrix() is
  'Matriz tenant x marcos do funil, uma entrada por organizacao, com o occurred_at da primeira ocorrencia de cada evento. Devolve jsonb pelo mesmo motivo de funnel_event_counts.';
