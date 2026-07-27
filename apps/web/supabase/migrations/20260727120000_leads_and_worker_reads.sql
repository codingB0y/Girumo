-- Leads em Postgres + o que o worker (apps/worker) precisa ler.
--
-- Até aqui os leads viviam num ndjson (`leads-store.ts`, com um "Migrar p/
-- Postgres depois" no topo) e o opt-out num JSON. Isso funcionava porque a
-- engine Baileys e o app compartilhavam disco. O worker da F3 roda em outro
-- container, no Coolify — sem tabela ele não tem onde escrever.
--
-- Escopo desta fase: SÓ GRUPOS. Nenhuma mensagem privada é enviada, então não
-- há tabela de boas-vindas nem enfileiramento de DM.

-- ============================================================
-- 1) leads
-- ============================================================

create type public.lead_status as enum ('novo', 'ativo', 'comprou');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,

  -- Nullable de propósito: um participante `@lid` chega sem telefone real e
  -- NUNCA deve ter um número inventado. Vira lead mesmo assim — a entrada no
  -- grupo é o fato; o telefone pode aparecer depois.
  phone text,
  name text,

  -- JID do grupo é a atribuição robusta; o nome é só para exibição e pode
  -- mudar sem que a origem mude.
  source_group_id text,
  source_group_name text,
  source_campaign text,

  status public.lead_status not null default 'novo',

  -- Primeira entrada, IMUTÁVEL: reentrada não pode inflar "entradas de hoje".
  entered_at timestamptz not null default now(),
  last_seen_at timestamptz,

  -- Outros grupos em que o mesmo número entrou — o dedupe por telefone não
  -- pode fazer a origem extra desaparecer.
  also_in jsonb not null default '[]'::jsonb,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedupe por telefone dentro do tenant — é o que o ndjson fazia à mão.
-- Parcial porque vários leads `@lid` sem telefone podem coexistir.
create unique index leads_tenant_phone_uidx
  on public.leads (tenant_id, phone)
  where phone is not null;

create index leads_tenant_entered_idx on public.leads (tenant_id, entered_at desc);
create index leads_tenant_status_idx on public.leads (tenant_id, status);

comment on column public.leads.phone is
  'Telefone só dígitos. NULL quando o participante veio como @lid sem phoneNumber — nunca inventar.';
comment on column public.leads.entered_at is
  'Primeira entrada. Imutável: reentrada atualiza last_seen_at, não este campo.';

-- ============================================================
-- 2) optouts (LGPD)
-- ============================================================

-- Bloqueia a CAPTURA, não só o envio: quem pediu descadastro não entra na base.
-- Regra já vigente em /api/leads (devolve skipped:"opt-out"), preservada aqui.
create table public.optouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint optouts_tenant_phone_unique unique (tenant_id, phone)
);

comment on table public.optouts is
  'Descadastro LGPD. Bloqueia a captura do lead, não apenas o envio de mensagem.';

-- ============================================================
-- 3) groups.is_admin
-- ============================================================

-- A engine só monitorava grupos onde o número é admin, e documentava o porquê:
-- "NUNCA cai para todos: melhor não capturar do que capturar grupo errado".
-- Capturar lead de grupo alheio é problema de LGPD e de base suja.
-- Default false: sem prova de que somos admin, não se monitora.
alter table public.groups
  add column if not exists is_admin boolean not null default false;

comment on column public.groups.is_admin is
  'O número conectado é admin/dono deste grupo. Só grupos admin alimentam captura de leads.';

-- ============================================================
-- 4) Triggers de updated_at (padrão do schema base)
-- ============================================================

create trigger set_updated_at_leads before update on public.leads
  for each row execute function app.set_updated_at();
create trigger set_updated_at_optouts before update on public.optouts
  for each row execute function app.set_updated_at();

-- ============================================================
-- 5) RLS — defesa em profundidade
-- ============================================================

-- O caminho ativo é service_role + filtro manual .eq('tenant_id'). Estas
-- policies existem para que uma chave anon/authenticated vazada não leia a base
-- de outro tenant. Mecanismo único: app.user_tenant_ids(), como na F0.
alter table public.leads enable row level security;
alter table public.optouts enable row level security;

-- Leitura por membro; escrita só server-side (service_role ignora RLS).
-- Mesmo tratamento de lp_leads: quem escreve é o worker, não o browser.
create policy leads_select_member on public.leads
  for select to authenticated
  using (tenant_id = any (app.user_tenant_ids()));

create policy optouts_select_member on public.optouts
  for select to authenticated
  using (tenant_id = any (app.user_tenant_ids()));

-- ============================================================
-- 6) Claim de eventos para o worker
-- ============================================================

-- Espelha app.claim_engine_commands: FOR UPDATE SKIP LOCKED para que réplicas
-- concorrentes nunca peguem o mesmo evento, e lease para que um worker morto
-- não deixe evento preso em 'processing' para sempre.
create or replace function app.claim_engine_events(max_events integer default 20)
returns setof public.engine_events
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return query
  update public.engine_events e
  set
    status = 'processing',
    updated_at = now()
  where e.id in (
    select pending.id
    from public.engine_events pending
    where pending.status = 'received'
    order by pending.created_at asc
    limit greatest(max_events, 1)
    for update skip locked
  )
  returning e.*;
end;
$$;

create or replace function app.complete_engine_event(
  target_event_id uuid,
  target_status public.engine_event_status default 'processed',
  target_error text default null
)
returns public.engine_events
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated public.engine_events;
begin
  update public.engine_events
  set
    status = target_status,
    processed_at = case when target_status = 'processed' then now() else processed_at end,
    error = target_error,
    updated_at = now()
  where event_id = target_event_id
  returning * into updated;

  return updated;
end;
$$;

-- Requeue de eventos cujo worker morreu no meio. 'processing' não é estado
-- final; sem isto um kill -9 perderia o evento em silêncio.
create or replace function app.requeue_stale_engine_events(older_than interval default '5 minutes')
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  affected integer;
begin
  update public.engine_events
  set status = 'received', updated_at = now()
  where status = 'processing'
    and updated_at < now() - older_than;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ============================================================
-- 7) Upsert de lead (dedupe por telefone, atômico)
-- ============================================================

-- O store JSON fazia read-modify-write sob file lock. O worker processa lotes e
-- pode ter réplicas, então aqui o dedupe é ON CONFLICT no banco — a única forma
-- de duas entradas simultâneas do mesmo número não virarem dois leads.
--
-- Regras preservadas do leads-store.ts:
--   entered_at é IMUTÁVEL (reentrada não infla "entradas de hoje");
--   reentrada atualiza last_seen_at;
--   grupo de origem diferente é acumulado em also_in, não sobrescreve.
create or replace function app.upsert_lead(
  target_tenant_id uuid,
  target_phone text,
  target_name text default null,
  target_source_group_id text default null,
  target_source_group_name text default null,
  target_source_campaign text default null
)
returns public.leads
language plpgsql
security definer
set search_path = public, app
as $$
declare
  result public.leads;
  clean_phone text := nullif(regexp_replace(coalesce(target_phone, ''), '\D', '', 'g'), '');
begin
  -- Sem telefone (participante @lid) não há chave de dedupe: sempre nova linha.
  -- Inventar um identificador aqui seria pior — juntaria pessoas diferentes.
  if clean_phone is null then
    insert into public.leads (
      tenant_id, phone, name, source_group_id, source_group_name, source_campaign
    )
    values (
      target_tenant_id, null, nullif(trim(coalesce(target_name, '')), ''),
      target_source_group_id, target_source_group_name, target_source_campaign
    )
    returning * into result;
    return result;
  end if;

  insert into public.leads (
    tenant_id, phone, name, source_group_id, source_group_name, source_campaign, last_seen_at
  )
  values (
    target_tenant_id, clean_phone, nullif(trim(coalesce(target_name, '')), ''),
    target_source_group_id, target_source_group_name, target_source_campaign, now()
  )
  on conflict (tenant_id, phone) where phone is not null
  do update set
    last_seen_at = now(),
    -- Origem nova entra em also_in; a original nunca é sobrescrita.
    also_in = case
      when nullif(excluded.source_group_name, '') is null then leads.also_in
      when excluded.source_group_name = leads.source_group_name then leads.also_in
      when leads.also_in @> to_jsonb(excluded.source_group_name) then leads.also_in
      else leads.also_in || to_jsonb(excluded.source_group_name)
    end,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

-- ============================================================
-- 8) Wrappers públicos + grants (padrão da F0)
-- ============================================================

-- supabase-js chama RPC no schema public; o schema app fica fora do PostgREST.
create or replace function public.claim_engine_events(max_events integer default 20)
returns setof public.engine_events
language sql
security definer
set search_path = public, app
as $$
  select * from app.claim_engine_events(max_events);
$$;

create or replace function public.complete_engine_event(
  target_event_id uuid,
  target_status public.engine_event_status default 'processed',
  target_error text default null
)
returns public.engine_events
language sql
security definer
set search_path = public, app
as $$
  select app.complete_engine_event(target_event_id, target_status, target_error);
$$;

create or replace function public.requeue_stale_engine_events(older_than interval default '5 minutes')
returns integer
language sql
security definer
set search_path = public, app
as $$
  select app.requeue_stale_engine_events(older_than);
$$;

create or replace function public.upsert_lead(
  target_tenant_id uuid,
  target_phone text,
  target_name text default null,
  target_source_group_id text default null,
  target_source_group_name text default null,
  target_source_campaign text default null
)
returns public.leads
language sql
security definer
set search_path = public, app
as $$
  select app.upsert_lead(
    target_tenant_id, target_phone, target_name,
    target_source_group_id, target_source_group_name, target_source_campaign
  );
$$;

-- A fila é exclusiva do worker: nenhuma sessão de usuário pode drenar eventos.
-- upsert_lead idem: escrever lead é privilégio de servidor, não de browser.
revoke execute on function public.upsert_lead(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.upsert_lead(uuid, text, text, text, text, text) to service_role;

revoke execute on function public.claim_engine_events(integer) from public, anon, authenticated;
revoke execute on function public.complete_engine_event(uuid, public.engine_event_status, text) from public, anon, authenticated;
revoke execute on function public.requeue_stale_engine_events(interval) from public, anon, authenticated;

grant execute on function public.claim_engine_events(integer) to service_role;
grant execute on function public.complete_engine_event(uuid, public.engine_event_status, text) to service_role;
grant execute on function public.requeue_stale_engine_events(interval) to service_role;
