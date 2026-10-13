-- Funil de anúncios, parte 3: quem veio por um anúncio (gaveta "Ver quem" da aba
-- Anúncios; spec 2026-10-10-funil-anuncios §4 e §7).
--
-- Idempotente. Vai nos DOIS bancos e muda deploy/supabase/schema-baseline.json
-- (f|attribution_people). Depende de 20261010130100_funil_anuncios_relatorio.sql.
--
-- MESMA regra de attribution_report: vale o último cadastro da pessoa (phone_key)
-- antes do evento — entrada até 7 dias antes, pedido até 90 dias antes, as duas
-- bordas inclusivas — e o período escolhe os CADASTROS (coorte). Os CTEs de
-- `cadastros` a `pedido_credito` são CÓPIA dos de attribution_report, na mesma
-- ordem e sem comentário dentro: o teste "espelho da regra" compara o texto das
-- duas migrações, e o de integração "a gaveta bate com a tabela" compara os números.
--
-- Só o nível anúncio: campanha, conjunto e anúncio comparados com
-- `is not distinct from` (nulo casa "(sem UTM)", "(sem conjunto)", "(sem anúncio)").
-- O telefone sai inteiro: a rota mascara antes de responder ao navegador.

create or replace function public.attribution_people(
  p_tenant uuid,
  p_de date,
  p_ate date,
  p_campanha text,
  p_conjunto text,
  p_anuncio text
)
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
  v_campanha constant text := nullif(btrim(p_campanha), '');
  v_conjunto constant text := nullif(btrim(p_conjunto), '');
  v_anuncio constant text := nullif(btrim(p_anuncio), '');
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

  -- Todos os cadastros da loja (o crédito olha para trás, então não só os do período).
  with
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
    select o.id, o.value, o.created_at, o.lead_id,
           coalesce(nullif(btrim(o.phone), ''), l.phone) as telefone,
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
  -- Daqui para baixo é só da gaveta: os cadastros do anúncio pedido.
  do_anuncio as (
    select * from coorte k
     where k.campanha is not distinct from v_campanha
       and k.conjunto is not distinct from v_conjunto
       and k.anuncio is not distinct from v_anuncio
  ),
  vendas as (
    select p.id, p.value, p.created_at, p.chave, p.telefone, p.lead_id,
           k.origem, k.created_at as cadastro_em
      from pedido_credito pc
      join pedidos p on p.id = pc.pedido_id
      join do_anuncio k on k.id = pc.cadastro_id
  ),
  -- Uma linha por pessoa (chave): soma do que ela comprou por ESTE anúncio.
  compradores as (
    select v.chave,
           sum(v.value) as vendido,
           count(*) as pedidos,
           min(v.cadastro_em) as cadastro_em,
           min(v.created_at) as primeira_compra,
           (array_agg(v.telefone order by v.created_at desc))[1] as telefone,
           (array_agg(v.lead_id order by v.created_at desc) filter (where v.lead_id is not null))[1] as lead_do_pedido
      from vendas v
     group by v.chave
  ),
  -- Pedido sem lead_id (só telefone): o contato é o da primeira entrada com a mesma chave.
  lead_da_chave as (
    select distinct on (e.chave) e.chave, e.id
      from entradas e
     where e.chave in (select c.chave from compradores c)
     order by e.chave, e.entered_at, e.id
  ),
  -- Entraram pelo anúncio e não compraram NADA depois de entrar, nem por outro
  -- anúncio: é a lista de remarketing, não pode ter quem já comprou.
  sem_compra as (
    select distinct ec.lead_id
      from entrada_credito ec
      join do_anuncio k on k.id = ec.cadastro_id
      join entradas e on e.id = ec.lead_id
     where not exists (
       select 1 from pedidos p where p.chave = e.chave and p.created_at >= e.entered_at
     )
       -- Pedido ligado ao contato por lead_id, mesmo com outro telefone.
       and not exists (
         select 1 from pedidos p where p.lead_id = e.id and p.created_at >= e.entered_at
       )
  )
  select jsonb_build_object(
    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', o.origem, 'cadastros', o.cadastros, 'vendido', o.vendido)
                       order by o.cadastros desc, o.origem nulls last)
        from (
          select k.origem, count(*) as cadastros,
                 coalesce((select sum(v.value) from vendas v where v.origem is not distinct from k.origem), 0) as vendido
            from do_anuncio k group by k.origem
        ) o
    ), '[]'::jsonb),
    'compradores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lead_id', coalesce(l1.id, l2.id),
               'nome', nullif(btrim(case when l1.id is not null then l1.name else l2.name end), ''),
               'telefone', c.telefone,
               'grupo', nullif(btrim(case when l1.id is not null then l1.source_group_name else l2.source_group_name end), ''),
               'cadastro_em', c.cadastro_em,
               'primeira_compra', c.primeira_compra,
               'pedidos', c.pedidos,
               'vendido', c.vendido)
             order by c.vendido desc, c.primeira_compra, c.chave)
        from compradores c
        left join lead_da_chave lc on lc.chave = c.chave
        left join public.leads l1 on l1.id = c.lead_do_pedido and l1.tenant_id = p_tenant
        left join public.leads l2 on l2.id = lc.id and l2.tenant_id = p_tenant
    ), '[]'::jsonb),
    'sem_compra', coalesce((select jsonb_agg(s.lead_id order by s.lead_id) from sem_compra s), '[]'::jsonb)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.attribution_people(uuid, date, date, text, text, text) is
  'Quem veio por um anúncio (compradores e quem entrou sem comprar nada depois), pela mesma regra de attribution_report. Só service_role; a rota passa o tenant do contexto e mascara o telefone.';

-- Função nova nasce executável por authenticated (default privilege do Supabase):
-- revogar explícito. Só o servidor chama, com o tenant da sessão.
-- Guarda no repositório: apps/web/src/lib/supabase/privilegio-definer.test.ts.
revoke all on function public.attribution_people(uuid, date, date, text, text, text) from public, anon, authenticated;
grant execute on function public.attribution_people(uuid, date, date, text, text, text) to service_role;
