-- 2026-10-19 — Link da bio, PR 1: banco (spec docs/superpowers/specs/2026-10-19-link-da-bio-design.md §5).
--
-- Uma página de links por loja (bio_pages; o documento é validado no app por documentoBio, PR 2), todo
-- slug já usado (bio_slugs: um slug nunca vai para outra loja, e o antigo responde 301 para o atual) e os
-- contadores por dia (bio_contagens, só via bio_contar), somados no banco por bio_relatorio (o PostgREST
-- corta em 1000 linhas sem avisar). Nada de IP, user agent ou referer.
--
-- Só o servidor (service_role) lê e grava: as três tabelas têm RLS ligado e NENHUMA policy nem privilégio
-- para anon/authenticated; bio_pages e bio_contagens sempre com .eq('tenant_id'), bio_slugs (sem
-- tenant_id) só por slug. As funções são security invoker e executam só como service_role: se um grant
-- escapar, quem chamar esbarra no RLS sem policy.
--
-- Aplicada pelo CI (migrate-dev no PR, migrate-prod no merge). Idempotente (if not exists / or replace /
-- drop trigger if exists): o job pode morrer entre aplicar e registrar, e o próximo run reaplica o
-- arquivo. O gate de drift não vê RLS, policy, ACL, trigger, CHECK nem corpo de função: conferir com
-- infra/tests/bio-pages-check.sql nos dois bancos.
--
-- Reversão (emergência): migração NOVA, pelo CI, com
--   drop table if exists public.bio_contagens, public.bio_slugs, public.bio_pages;
--   drop function if exists public.bio_contar(uuid, text), public.bio_relatorio(uuid, date, date),
--     public.bio_registra_slug();
-- (apaga páginas e contadores; a baseline volta a não ter os seis objetos).

-- As FKs pegam lock em organizations. Sem o lock em 5 s, aborta em vez de segurar o cadastro de loja: é
-- só rodar o job de novo, a migração é idempotente.
set lock_timeout = '5s';

-- 1) Tabelas (§5 da spec, sem mudar nome nem coluna: o store do PR 2 depende deles).
create table if not exists public.bio_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.organizations(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  publicada boolean not null default false,
  bloqueada_em timestamptz,                        -- só admin, por SQL: some do público
  documento jsonb not null,
  versao integer not null default 1 check (versao > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bio_pages is
  'Link da bio: uma página por loja. documento validado no app (documentoBio); versao = trava otimista; updated_at gravado pelo store (sem trigger); bloqueada_em só por SQL (admin). Só service_role.';

create table if not exists public.bio_slugs (       -- todo slug já usado; nunca volta para outra loja
  slug text primary key,
  pagina_id uuid references public.bio_pages(id) on delete set null,
  criado_em timestamptz not null default now()
);

comment on table public.bio_slugs is
  'Todo slug que uma página já usou, mantido pelo trigger bio_pages_registra_slug. pagina_id null = página apagada: o slug fica preso. Só service_role, lido por slug.';

create table if not exists public.bio_contagens (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  pagina_id uuid not null references public.bio_pages(id) on delete cascade,
  dia date not null,                               -- America/Sao_Paulo
  alvo text not null                               -- 'visita' ou o uuid do link
    check (alvo = 'visita' or alvo ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
  total integer not null default 0,
  primary key (pagina_id, dia, alvo)
);

comment on table public.bio_contagens is
  'Contadores por dia (America/Sao_Paulo) da página: alvo = visita ou id do link (uuid minúsculo). Escrita só por bio_contar; leitura por bio_relatorio.';

-- 2) Slug nunca volta para outra loja. Depois do insert/update de bio_pages (a linha já existe, então a FK
--    de bio_slugs passa): grava (slug, página). Se o slug já estava lá, só segue se é desta página (a loja
--    voltando a um slug que já foi dela); de outra página ou de página apagada (pagina_id null) é
--    unique_violation citando bio_slugs, e a gravação inteira desfaz. Slug ATUAL de outra página nem chega
--    aqui: a unique de bio_pages.slug recusa antes (23505 bio_pages_slug_key).
create or replace function public.bio_registra_slug()
returns trigger
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  insert into public.bio_slugs (slug, pagina_id)
  values (new.slug, new.id)
  on conflict (slug) do nothing;

  if not exists (
    select 1 from public.bio_slugs s where s.slug = new.slug and s.pagina_id = new.id
  ) then
    raise exception using
      errcode = 'unique_violation',
      message = format('bio_slugs: o slug "%s" já foi de outra página', new.slug);
  end if;

  return null;
end;
$$;

comment on function public.bio_registra_slug() is
  'Trigger de bio_pages: registra o slug em bio_slugs e recusa (23505 citando bio_slugs) slug que já foi de outra página ou de página apagada.';

drop trigger if exists bio_pages_registra_slug on public.bio_pages;
create trigger bio_pages_registra_slug
  after insert or update of slug on public.bio_pages
  for each row
  execute function public.bio_registra_slug();

-- 3) Contador: +1 no dia de hoje em America/Sao_Paulo (nunca no fuso da sessão). tenant_id sai da página;
--    página inexistente não conta nem dá erro (insert … select de zero linhas). alvo fora do formato é
--    23514 (CHECK de bio_contagens): a rota só manda 'visita' ou uuid minúsculo.
create or replace function public.bio_contar(p_pagina uuid, p_alvo text)
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  insert into public.bio_contagens as c (tenant_id, pagina_id, dia, alvo, total)
  select p.tenant_id, p.id, (now() at time zone 'America/Sao_Paulo')::date, p_alvo, 1
    from public.bio_pages p
   where p.id = p_pagina
  on conflict (pagina_id, dia, alvo) do update set total = c.total + 1;
$$;

comment on function public.bio_contar(uuid, text) is
  'Link da bio: soma 1 à visita (alvo = visita) ou ao toque (alvo = id do link) de hoje em America/Sao_Paulo. Só service_role.';

-- 4) Relatório do painel (RelatorioBio, spec §9), somado no banco e já em camelCase. porDia traz TODOS os
--    dias do intervalo (inclusivo), zeros incluídos, em ordem; porLink só ids de link, por toques (desc) e
--    linkId. Intervalo invertido = zeros e listas vazias. A página da loja vem da unique de tenant_id e os
--    contadores da PK (pagina_id, dia, alvo): nenhum índice novo.
create or replace function public.bio_relatorio(p_tenant uuid, p_desde date, p_ate date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with contagens as (
    select c.dia, c.alvo, c.total
      from public.bio_pages p
      join public.bio_contagens c
        on c.pagina_id = p.id
       and c.tenant_id = p_tenant
     where p.tenant_id = p_tenant
       and c.dia between p_desde and p_ate
  ),
  por_dia as (
    select g.d::date as dia,
           coalesce(sum(c.total) filter (where c.alvo = 'visita'), 0) as visitas,
           coalesce(sum(c.total) filter (where c.alvo <> 'visita'), 0) as toques
      from generate_series(p_desde::timestamp, p_ate::timestamp, interval '1 day') as g(d)
      left join contagens c on c.dia = g.d::date
     group by g.d
  ),
  por_link as (
    select c.alvo as link_id, sum(c.total) as toques
      from contagens c
     where c.alvo <> 'visita'
     group by c.alvo
  )
  select jsonb_build_object(
    'visitas', coalesce((select sum(d.visitas) from por_dia d), 0),
    'toques', coalesce((select sum(d.toques) from por_dia d), 0),
    'porLink', coalesce((
      select jsonb_agg(jsonb_build_object('linkId', l.link_id, 'toques', l.toques)
                       order by l.toques desc, l.link_id collate "C")
        from por_link l), '[]'::jsonb),
    'porDia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'visitas', d.visitas, 'toques', d.toques)
                       order by d.dia)
        from por_dia d), '[]'::jsonb)
  );
$$;

comment on function public.bio_relatorio(uuid, date, date) is
  'Link da bio: {visitas, toques, porLink:[{linkId,toques}], porDia:[{dia,visitas,toques}]} da loja entre p_desde e p_ate (inclusivo). Só service_role.';

-- 5) RLS sem policy e privilégios: só service_role.
alter table public.bio_pages enable row level security;
alter table public.bio_slugs enable row level security;
alter table public.bio_contagens enable row level security;

-- Tabela nova nasce com SELECT/REFERENCES/TRIGGER para authenticated (default privilege do grantor
-- postgres; o event trigger ensure_anon_revoked só tira anon e a escrita de authenticated).
revoke all on public.bio_pages, public.bio_slugs, public.bio_contagens from anon, authenticated;
grant select, insert, update, delete on public.bio_pages, public.bio_contagens to service_role;
-- bio_slugs: o trigger (security invoker, roda como service_role) só insere e lê; ninguém do app apaga
-- nem reescreve o histórico. O "on delete set null" roda como dono da tabela.
grant select, insert on public.bio_slugs to service_role;
revoke update, delete, truncate on public.bio_slugs from service_role;

-- Função nova nasce executável por authenticated (default privilege) e por public (anon herda): revogar
-- depois do create or replace, sempre — não confiar que ele preserva o ACL. Disparar trigger não checa
-- EXECUTE: o revoke da função do trigger é só para ninguém chamá-la por fora.
revoke all on function public.bio_registra_slug() from public, anon, authenticated;
revoke all on function public.bio_contar(uuid, text) from public, anon, authenticated;
revoke all on function public.bio_relatorio(uuid, date, date) from public, anon, authenticated;
grant execute on function public.bio_contar(uuid, text) to service_role;
grant execute on function public.bio_relatorio(uuid, date, date) to service_role;
