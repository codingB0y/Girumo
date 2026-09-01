-- Oferta Relampago: a lojista abre uma promocao no grupo, as clientes comentam
-- a palavra-chave, e quem comentou primeiro tem prioridade.
--
-- O que estas tabelas impedem, e que a tela nao conseguiria garantir sozinha:
--  - duas ofertas abertas no mesmo grupo (a divergencia que a feature existe
--    para evitar)                        -> flash_offer_groups_um_aberto_uidx
--  - duas vendedoras na mesma cliente    -> flash_offer_claims_ativo_uidx
--  - a mesma cliente ocupando dois lugares -> flash_offer_entries_pessoa_uidx
--  - reentrega do webhook duplicando a fila -> flash_offer_entries_msg_uidx

create table if not exists public.flash_offers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations(id) on delete cascade,
  name          text not null,
  -- Ja normalizada na escrita (minuscula, sem acento). Ver lib/relampago/keyword.ts.
  keyword       text not null default 'eu quero',
  slots         integer not null check (slots > 0),
  -- null = sem timer: a reserva fica com a vendedora ate ela resolver.
  timer_seconds integer check (timer_seconds is null or timer_seconds > 0),
  status        text not null default 'draft'
                  check (status in ('draft','open','closed')),
  opened_at     timestamptz,
  closed_at     timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.flash_offers is
  'Promocao relampago: palavra-chave no grupo, prioridade por ordem de comentario.';
comment on column public.flash_offers.timer_seconds is
  'null = sem timer. A reserva nao expira sozinha.';

create index if not exists flash_offers_tenant_idx
  on public.flash_offers (tenant_id, created_at desc);

-- Os grupos-alvo. Tabela, e nao `group_ids uuid[]` no estilo de broadcasts,
-- porque e ela que carrega o indice de exclusao mutua abaixo.
create table if not exists public.flash_offer_groups (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,
  offer_id          uuid not null references public.flash_offers(id) on delete cascade,
  group_id          uuid not null references public.groups(id) on delete cascade,
  -- Desnormalizado: o receiver do webhook nao faz join.
  whatsapp_group_id text not null,
  -- Corta comentario anterior a abertura da janela. A entrega da Evolution nao
  -- e ordenada e este projeto ja foi mordido por isso (QR atrasado rebaixando
  -- sessao viva de volta para `qr`).
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  -- @lid -> telefone, colhido na abertura. Ver lib/relampago/lid-map.ts.
  lid_map           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on column public.flash_offer_groups.lid_map is
  'Mapa @lid -> telefone montado na abertura. 100% dos participantes chegam como @lid.';

-- Abrir uma segunda oferta num grupo que ja tem uma aberta e recusado pelo
-- Postgres. Nenhuma tela pode errar isso.
create unique index if not exists flash_offer_groups_um_aberto_uidx
  on public.flash_offer_groups (tenant_id, whatsapp_group_id)
  where closed_at is null;

create index if not exists flash_offer_groups_offer_idx
  on public.flash_offer_groups (offer_id);

create table if not exists public.flash_offer_entries (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,
  offer_id          uuid not null references public.flash_offers(id) on delete cascade,
  group_id          uuid references public.groups(id) on delete set null,
  whatsapp_group_id text not null,
  -- Como chegou: @lid ou @s.whatsapp.net. Guardado cru.
  participant_jid   text not null,
  -- null quando nao resolvemos. NUNCA inventado.
  phone             text,
  push_name         text,
  -- O comentario cru. E a prova que encerra a discussao de quem veio primeiro.
  message_text      text not null,
  message_id        text not null,
  -- Timestamp do WhatsApp, nao o nosso. Nunca reescrito.
  commented_at      timestamptz not null,
  -- null = na ordem original. Preenchido manda para o fim da fila sem apagar
  -- commented_at.
  deprioritized_at  timestamptz,
  outcome           text check (outcome is null or outcome in ('sold','dropped')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.flash_offer_entries.phone is
  'null quando nao resolvemos o @lid. Nunca um numero inventado.';
comment on column public.flash_offer_entries.commented_at is
  'Timestamp do WhatsApp. Nunca reescrito: e a prova da ordem da fila.';

-- Reentrega do webhook vira no-op.
create unique index if not exists flash_offer_entries_msg_uidx
  on public.flash_offer_entries (tenant_id, message_id);

-- A mesma pessoa comentando 5x ocupa UM lugar, o primeiro. Casa por telefone
-- quando temos, por jid quando nao: sem o coalesce, a mesma cliente vinda como
-- @lid num evento e resolvida noutro entraria duas vezes.
create unique index if not exists flash_offer_entries_pessoa_uidx
  on public.flash_offer_entries (offer_id, coalesce(phone, participant_jid));

create index if not exists flash_offer_entries_fila_idx
  on public.flash_offer_entries (offer_id, deprioritized_at, commented_at);

create table if not exists public.flash_offer_claims (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references organizations(id) on delete cascade,
  offer_id       uuid not null references public.flash_offers(id) on delete cascade,
  entry_id       uuid not null references public.flash_offer_entries(id) on delete cascade,
  seller_user_id uuid not null,
  -- O prazo para CHAMAR corre daqui.
  claimed_at     timestamptz not null default now(),
  -- Clicou "chamei": o prazo passa a correr daqui.
  contacted_at   timestamptz,
  released_at    timestamptz,
  release_reason text check (release_reason is null or release_reason in
                   ('seller_timeout','customer_timeout','sold','dropped','manual')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Duas vendedoras nao pegam a mesma cliente. Garantido pelo banco, nao pela UI.
create unique index if not exists flash_offer_claims_ativo_uidx
  on public.flash_offer_claims (entry_id) where released_at is null;

create index if not exists flash_offer_claims_offer_idx
  on public.flash_offer_claims (offer_id) where released_at is null;

-- Libera as reservas vencidas. O desfecho depende de QUEM falhou:
--  - venceu sem contacted_at -> a loja nao chamou. A cliente MANTEM a posicao.
--  - venceu com contacted_at -> a cliente nao respondeu. Vai para o fim.
-- E a diferenca entre "a loja me ignorou" e "eu sumi", e e o que impede o
-- sistema de punir a cliente por lentidao interna da loja.
--
-- Nao ha cron nem job: quem le a fila e quem recicla o que venceu.
create or replace function public.release_expired_flash_claims(p_tenant uuid, p_offer uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timer     integer;
  v_liberados integer := 0;
begin
  select timer_seconds into v_timer
    from public.flash_offers
   where id = p_offer and tenant_id = p_tenant;

  -- Sem timer, nada expira.
  if v_timer is null then
    return 0;
  end if;

  -- O CTE que desprioriza roda mesmo sem ser lido pela query principal:
  -- statement que modifica dado dentro de WITH executa sempre, ate o fim.
  with vencidos as (
    select id, entry_id, contacted_at
      from public.flash_offer_claims
     where tenant_id = p_tenant
       and offer_id = p_offer
       and released_at is null
       and coalesce(contacted_at, claimed_at) + make_interval(secs => v_timer) < now()
       for update skip locked
  ),
  liberados as (
    update public.flash_offer_claims c
       set released_at    = now(),
           release_reason = case when v.contacted_at is null
                                 then 'seller_timeout' else 'customer_timeout' end,
           updated_at     = now()
      from vencidos v
     where c.id = v.id
    returning v.entry_id as entry_id, v.contacted_at as contacted_at
  ),
  despriorizados as (
    update public.flash_offer_entries e
       set deprioritized_at = now(),
           updated_at       = now()
      from liberados l
     where e.id = l.entry_id
       -- So quem JA tinha sido chamada. Quem a loja nunca chamou mantem a posicao.
       and l.contacted_at is not null
       and e.deprioritized_at is null
    returning e.id
  )
  select count(*) into v_liberados from liberados;

  return v_liberados;
end;
$$;

-- Revogar de `public` tambem: o ACL padrao de funcao e `=X/postgres`, ou seja
-- EXECUTE para PUBLIC — tirar de `anon` sozinho nao fecha a porta.
--
-- E de `authenticated` tambem, que neste projeto MANTEM os sete privilegios por
-- default (so `anon` foi zerado, em 22/08). Sem este revoke, qualquer usuario
-- logado chamaria a RPC passando o `tenant_id` de outro: a funcao e
-- `security definer` e recebe o tenant como PARAMETRO, entao nao tem como saber
-- que quem chamou nao e dono dele. Foi o que o advisor apontou em
-- `claim_bulk_jobs` na primeira aplicacao.
revoke all on function public.release_expired_flash_claims(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_expired_flash_claims(uuid, uuid) to service_role;

-- Reserva a proxima da fila. Atomica de proposito: o teto de `slots` nao pode
-- ser conferido pela rota e aplicado depois, senao duas vendedoras clicando
-- juntas passam do estoque. O indice unico cobre a colisao na MESMA cliente;
-- o `for update` na oferta cobre o teto.
create or replace function public.claim_next_flash_entry(
  p_tenant uuid, p_offer uuid, p_seller uuid
)
returns public.flash_offer_claims
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slots    integer;
  v_ocupadas integer;
  v_entry    uuid;
  v_claim    public.flash_offer_claims;
begin
  select slots into v_slots
    from public.flash_offers
   where id = p_offer and tenant_id = p_tenant and status = 'open'
     for update;

  if v_slots is null then
    raise exception 'oferta nao encontrada ou nao esta aberta' using errcode = 'P0002';
  end if;

  -- Vaga e slots menos o que ja virou venda menos o que esta reservado agora.
  -- A linha da espera anda junto com o estoque: quem era a 11a numa oferta de
  -- 10 pecas entra na fila de verdade assim que a primeira venda fecha.
  select (select count(*) from public.flash_offer_entries
           where offer_id = p_offer and outcome = 'sold')
       + (select count(*) from public.flash_offer_claims
           where offer_id = p_offer and released_at is null)
    into v_ocupadas;

  if v_ocupadas >= v_slots then
    raise exception 'sem vaga livre' using errcode = 'P0001';
  end if;

  select e.id into v_entry
    from public.flash_offer_entries e
   where e.tenant_id = p_tenant
     and e.offer_id = p_offer
     and e.outcome is null
     and not exists (
       select 1 from public.flash_offer_claims c
        where c.entry_id = e.id and c.released_at is null
     )
   order by e.deprioritized_at nulls first, e.commented_at
   limit 1
     for update skip locked;

  if v_entry is null then
    raise exception 'fila vazia' using errcode = 'P0002';
  end if;

  insert into public.flash_offer_claims (tenant_id, offer_id, entry_id, seller_user_id)
  values (p_tenant, p_offer, v_entry, p_seller)
  returning * into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.claim_next_flash_entry(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_next_flash_entry(uuid, uuid, uuid) to service_role;

-- RLS: defesa em profundidade. A protecao REAL e o .eq('tenant_id') na store —
-- o caminho de escrita usa service-role, que bypassa RLS por desenho.
--
-- Padrao `app.has_membership` de proposito: policy com
-- `current_setting('app.tenant_id')` depende de GUC que o app nunca seta, e por
-- isso nunca avalia verdadeiro. Ha 13 policies assim neste banco, todas inertes.
alter table public.flash_offers        enable row level security;
alter table public.flash_offer_groups  enable row level security;
alter table public.flash_offer_entries enable row level security;
alter table public.flash_offer_claims  enable row level security;

drop policy if exists "flash_offers_tenant" on public.flash_offers;
create policy "flash_offers_tenant" on public.flash_offers
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));

drop policy if exists "flash_offer_groups_tenant" on public.flash_offer_groups;
create policy "flash_offer_groups_tenant" on public.flash_offer_groups
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));

drop policy if exists "flash_offer_entries_tenant" on public.flash_offer_entries;
create policy "flash_offer_entries_tenant" on public.flash_offer_entries
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));

drop policy if exists "flash_offer_claims_tenant" on public.flash_offer_claims;
create policy "flash_offer_claims_tenant" on public.flash_offer_claims
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));
