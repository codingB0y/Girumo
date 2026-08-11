-- F1/PR-1: link mestre de campanha vira linha real em `tracked_links`.
--
-- Contexto: a UI entrega `/r/<slug-da-campanha>` como link de captação, mas nada
-- nunca criou a linha correspondente em `tracked_links` — a rota não achava o
-- slug e todo link mestre respondia "Link não encontrado" (achado A1).
--
-- Duas partes, ambas idempotentes:
--   1) contador de clique atômico (a rota pública incrementa a cada clique humano);
--   2) backfill: uma linha de link mestre por campanha que ainda não tem.
--
-- `campaign_groups.slug` é único por (tenant_id, slug), mas `tracked_links.slug`
-- é único GLOBAL. O backfill só insere quando o slug está livre — campanha cujo
-- slug já pertence a outro link fica de fora de propósito (o painel gera um novo
-- slug na próxima criação em vez de sequestrar um link existente).

-- 1) +1 clique sem read-modify-write (perderia clique simultâneo).
create or replace function public.increment_tracked_link_clicks(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update tracked_links
  set clicks = clicks + 1,
      updated_at = now()
  where id = p_id;
$$;

comment on function public.increment_tracked_link_clicks(uuid) is
  'Incremento atômico de tracked_links.clicks, usado pela rota pública /r/:slug.';

-- Toda função nasce com EXECUTE para PUBLIC: sem revogar, `anon` poderia chamar
-- /rest/v1/rpc/increment_tracked_link_clicks e inflar o contador de qualquer
-- link só sabendo o id. Quem incrementa é a rota, via service-role.
revoke all on function public.increment_tracked_link_clicks(uuid) from public, anon, authenticated;
grant execute on function public.increment_tracked_link_clicks(uuid) to service_role;

-- 2) Backfill do link mestre das campanhas já existentes.
insert into tracked_links (tenant_id, campaign_group_id, slug, target_url, clicks, metadata)
select cg.tenant_id,
       cg.id,
       cg.slug,
       '',                                   -- destino é rotativo: vem do pool da campanha
       0,
       jsonb_build_object('campaignName', cg.name, 'master', true)
from campaign_groups cg
where cg.slug is not null
  and cg.slug <> ''
  and not exists (select 1 from tracked_links tl where tl.campaign_group_id = cg.id)
  and not exists (select 1 from tracked_links tl where tl.slug = cg.slug)
on conflict (slug) do nothing;
