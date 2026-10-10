-- Funil de anúncios, parte 2: o relatório (spec 2026-10-10-funil-anuncios §1–§2).
--
-- Idempotente. Vai nos DOIS bancos e muda deploy/supabase/schema-baseline.json
-- (f|attribution_report). Depende de 20261010130000_funil_anuncios_tabelas.sql.
--
-- Regra única: vale o último cadastro da pessoa (phone_key) antes do evento —
-- entrada até 7 dias antes, pedido até 90 dias antes, as duas bordas inclusivas.
-- O período escolhe os CADASTROS (coorte); "fora" conta pela data do evento.

create or replace function public.attribution_report(p_tenant uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  janela_entrada constant interval := interval '7 days';
  janela_venda constant interval := interval '90 days';
  fuso constant text := 'America/Sao_Paulo';
  v_ini timestamptz;
  v_fim timestamptz;
  v_resultado jsonb;
begin
  if p_tenant is null or p_de is null or p_ate is null or p_de > p_ate then
    raise exception 'periodo invalido' using errcode = '22023';
  end if;
  if p_ate - p_de > 400 then
    raise exception 'periodo invalido: mais de 400 dias' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_tenant) then
    raise exception 'loja inexistente' using errcode = '22023';
  end if;

  v_ini := p_de::timestamp at time zone fuso;
  v_fim := (p_ate + 1)::timestamp at time zone fuso;

  with
  -- Todos os cadastros da loja (o crédito olha para trás, então não só os do período).
  cadastros as (
    select s.id, s.phone_key as chave, s.created_at,
           nullif(btrim(s.utm_source), '') as origem,
           nullif(btrim(s.utm_campaign), '') as campanha,
           nullif(btrim(s.utm_term), '') as conjunto,
           nullif(btrim(s.utm_content), '') as anuncio
      from public.site_captures s
     where s.tenant_id = p_tenant and s.phone_key is not null
    union all
    select c.id, public.phone_key(k.whatsapp), c.created_at,
           nullif(btrim(c.utm_source), ''), nullif(btrim(c.utm_campaign), ''),
           nullif(btrim(c.utm_term), ''), nullif(btrim(c.utm_content), '')
      from public.lp_captures c
      join public.lp_contacts k on k.id = c.contact_id and k.tenant_id = p_tenant
     where c.tenant_id = p_tenant and public.phone_key(k.whatsapp) is not null
  ),
  coorte as (
    select * from cadastros where created_at >= v_ini and created_at < v_fim
  ),
  entradas as (
    select l.id, public.phone_key(l.phone) as chave, l.entered_at
      from public.leads l
     where l.tenant_id = p_tenant
  ),
  entrada_credito as (
    select distinct on (e.id) e.id as lead_id, e.entered_at, c.id as cadastro_id
      from entradas e
      join cadastros c
        on c.chave = e.chave
       and c.created_at <= e.entered_at
       and c.created_at >= e.entered_at - janela_entrada
     order by e.id, c.created_at desc, c.id desc
  ),
  pedidos as (
    select o.id, o.value, o.created_at,
           public.phone_key(coalesce(nullif(btrim(o.phone), ''), l.phone)) as chave
      from public.orders o
      left join public.leads l on l.id = o.lead_id and l.tenant_id = p_tenant
     where o.tenant_id = p_tenant
  ),
  pedido_credito as (
    select distinct on (p.id) p.id as pedido_id, c.id as cadastro_id
      from pedidos p
      join cadastros c
        on c.chave = p.chave
       and c.created_at <= p.created_at
       and c.created_at >= p.created_at - janela_venda
     order by p.id, c.created_at desc, c.id desc
  ),
  cliques as (
    select distinct ev.capture_id
      from public.link_click_events ev
     where ev.tenant_id = p_tenant and ev.capture_id is not null
  ),
  entradas_por_cadastro as (
    select ec.cadastro_id, count(*) as n from entrada_credito ec group by ec.cadastro_id
  ),
  primeira_entrada as (
    select e.chave, min(e.entered_at) as entered_at
      from entradas e where e.chave is not null group by e.chave
  ),
  por_cadastro as (
    select k.id, k.chave, k.origem, k.campanha, k.conjunto, k.anuncio, k.created_at,
           (cl.capture_id is not null) as foi,
           coalesce(epc.n, 0) as entrou,
           (pe.entered_at is not null and pe.entered_at < k.created_at) as ja_membro
      from coorte k
      left join cliques cl on cl.capture_id = k.id
      left join entradas_por_cadastro epc on epc.cadastro_id = k.id
      left join primeira_entrada pe on pe.chave = k.chave
  ),
  vendas as (
    select p.id, p.value, p.chave, k.origem, k.campanha, k.conjunto, k.anuncio
      from pedido_credito pc
      join pedidos p on p.id = pc.pedido_id
      join coorte k on k.id = pc.cadastro_id
  ),
  cad_niveis as (
    select 'campanha'::text as nivel, campanha, null::text as conjunto, null::text as anuncio,
           count(*) as cadastros, count(*) filter (where foi) as foram,
           coalesce(sum(entrou), 0) as entraram, count(*) filter (where ja_membro) as ja_membros
      from por_cadastro group by campanha
    union all
    select 'conjunto', campanha, conjunto, null,
           count(*), count(*) filter (where foi), coalesce(sum(entrou), 0), count(*) filter (where ja_membro)
      from por_cadastro group by campanha, conjunto
    union all
    select 'anuncio', campanha, conjunto, anuncio,
           count(*), count(*) filter (where foi), coalesce(sum(entrou), 0), count(*) filter (where ja_membro)
      from por_cadastro group by campanha, conjunto, anuncio
  ),
  venda_niveis as (
    select 'campanha'::text as nivel, campanha, null::text as conjunto, null::text as anuncio,
           count(distinct chave) as compradores, count(*) as pedidos, coalesce(sum(value), 0) as vendido
      from vendas group by campanha
    union all
    select 'conjunto', campanha, conjunto, null, count(distinct chave), count(*), coalesce(sum(value), 0)
      from vendas group by campanha, conjunto
    union all
    select 'anuncio', campanha, conjunto, anuncio, count(distinct chave), count(*), coalesce(sum(value), 0)
      from vendas group by campanha, conjunto, anuncio
  ),
  -- Lançamento de 30 dias num período que pega 7 deles entra como valor × 7/30.
  gasto as (
    select g.utm_campaign as campanha,
           round(sum(g.amount
             * ((least(g.ends_on, p_ate) - greatest(g.starts_on, p_de) + 1)::numeric
                / (g.ends_on - g.starts_on + 1))), 2) as valor
      from public.ad_spend g
     where g.tenant_id = p_tenant and g.starts_on <= p_ate and g.ends_on >= p_de
     group by g.utm_campaign
  ),
  linhas as (
    select c.nivel, c.campanha, c.conjunto, c.anuncio,
           c.cadastros, c.foram, c.entraram, c.ja_membros,
           coalesce(v.compradores, 0) as compradores,
           coalesce(v.pedidos, 0) as pedidos,
           coalesce(v.vendido, 0) as vendido,
           case when c.nivel = 'campanha' then g.valor end as gasto
      from cad_niveis c
      left join venda_niveis v
        on v.nivel = c.nivel
       and v.campanha is not distinct from c.campanha
       and v.conjunto is not distinct from c.conjunto
       and v.anuncio is not distinct from c.anuncio
      left join gasto g on c.nivel = 'campanha' and g.campanha = c.campanha
    union all
    -- Campanha com gasto e nenhum cadastro no período: aparece só com o gasto.
    select 'campanha', g.campanha, null, null, 0, 0, 0, 0, 0, 0, 0, g.valor
      from gasto g
     where not exists (select 1 from coorte k where k.campanha = g.campanha)
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'total', (
      select jsonb_build_object(
        'cadastros', count(*),
        'foram', count(*) filter (where pc.foi),
        'entraram', coalesce(sum(pc.entrou), 0),
        'ja_membros', count(*) filter (where pc.ja_membro),
        'compradores', (select count(distinct v.chave) from vendas v),
        'pedidos', (select count(*) from vendas v),
        'vendido', (select coalesce(sum(v.value), 0) from vendas v),
        'gasto', (select coalesce(sum(g.valor), 0) from gasto g)
      )
      from por_cadastro pc
    ),
    'linhas', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.campanha nulls last, l.conjunto nulls first, l.anuncio nulls first)
        from linhas l
    ), '[]'::jsonb),
    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', o.origem, 'cadastros', o.cadastros, 'vendido', o.vendido)
                       order by o.cadastros desc, o.origem nulls last)
        from (
          select pc.origem, count(*) as cadastros,
                 coalesce((select sum(v.value) from vendas v where v.origem is not distinct from pc.origem), 0) as vendido
            from por_cadastro pc group by pc.origem
        ) o
    ), '[]'::jsonb),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'cadastros', d.cadastros, 'entraram', d.entraram) order by d.dia)
        from (
          select g.dia::date as dia,
                 (select count(*) from por_cadastro pc
                   where (pc.created_at at time zone fuso)::date = g.dia::date) as cadastros,
                 (select count(*) from entrada_credito ec join coorte k on k.id = ec.cadastro_id
                   where (ec.entered_at at time zone fuso)::date = g.dia::date) as entraram
            from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') as g(dia)
        ) d
    ), '[]'::jsonb),
    'fora', jsonb_build_object(
      'entradas_sem_cadastro', (
        select count(*) from entradas e
         where e.entered_at >= v_ini and e.entered_at < v_fim
           and not exists (select 1 from entrada_credito ec where ec.lead_id = e.id)
      ),
      'pedidos_sem_origem', (
        select count(*) from pedidos p
         where p.created_at >= v_ini and p.created_at < v_fim
           and not exists (select 1 from pedido_credito pc where pc.pedido_id = p.id)
      ),
      'vendido_sem_origem', (
        select coalesce(sum(p.value), 0) from pedidos p
         where p.created_at >= v_ini and p.created_at < v_fim
           and not exists (select 1 from pedido_credito pc where pc.pedido_id = p.id)
      )
    )
  )
  into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.attribution_report(uuid, date, date) is
  'Funil de anúncios (cadastro → grupo → entrada → pedido) por campanha/conjunto/anúncio. Só service_role; a rota passa o tenant do contexto.';

-- Função nova nasce executável por authenticated (default privilege do Supabase):
-- revogar explícito. Só o servidor chama, com o tenant da sessão.
revoke all on function public.attribution_report(uuid, date, date) from public, anon, authenticated;
grant execute on function public.attribution_report(uuid, date, date) to service_role;
