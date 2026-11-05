-- apps/web/supabase/migrations/20261106120000_ig_conversations.sql
-- Conversas do Instagram, PR 2a-1 (spec docs/superpowers/specs/2026-10-16-instagram-pessoas-blocos-conversas-design.md §7).
--
-- A Girumo NÃO guarda o histórico (mensagens ficam na Zernio e no Instagram). Guardamos só:
--   ig_conversations        índice da lista: quem, quando, não lidas, situação, última mensagem (200 caracteres)
--   ig_conversation_events  o que o robô e a loja fizeram em cada conversa, SEM texto
--   ig_canned_replies       respostas prontas da loja (até 50)
--   ig_contact_tombstones   marcador (hash) de quem a loja apagou, para a varredura não trazer de volta
-- Escrita só pelo servidor; leitura por authenticated pela RLS (tenant_id = any(app.user_tenant_ids())).
-- ig_conversations entra na publicação supabase_realtime (a tela assina postgres_changes).
-- ig_conversation_touch grava o índice num comando (upsert atômico); ig_conversations_rotina fecha
-- conversas e apaga o que passou do prazo (de hora em hora, junto de ig_purge_contacts).
--
-- O gate de drift não hasheia CHECK, ACL nem publicação: conferir com infra/tests/ig-conversations-check.sql
-- nos dois bancos. Reversão: drop das 4 tabelas, das 3 funções e tirar ig_conversations da publicação.

set lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1) ig_conversations
-- ------------------------------------------------------------
create table if not exists public.ig_conversations (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.organizations(id) on delete cascade,
  ig_account_id          uuid,
  zernio_conversation_id text not null,
  ig_user_id             text not null,
  username               text,
  display_name           text,
  status                 text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  -- 'requests' fica no CHECK do spec, mas a Zernio responde 400 para folder=requests no Instagram: só 'inbox' nasce.
  folder                 text not null default 'inbox' check (folder in ('inbox', 'requests')),
  unread_count           integer not null default 0 check (unread_count >= 0),
  last_message_at        timestamptz,
  last_direction         text check (last_direction in ('in', 'out')),
  last_preview           text check (char_length(last_preview) <= 200),
  bot_paused_until       timestamptz,
  updated_at             timestamptz not null default now(),
  unique (tenant_id, zernio_conversation_id)
);

comment on table public.ig_conversations is
  'Índice da lista de Conversas do Instagram (sem histórico). Escrita só por ig_conversation_touch e pelo servidor; prazos por ig_conversations_rotina.';

create index if not exists ig_conversations_list_idx on public.ig_conversations (tenant_id, status, last_message_at desc);
create index if not exists ig_conversations_user_idx on public.ig_conversations (tenant_id, ig_user_id);
-- A rotina de prazo varre a tabela inteira por last_message_at, sem loja.
create index if not exists ig_conversations_purge_idx on public.ig_conversations (last_message_at);

alter table public.ig_conversations enable row level security;
drop policy if exists "ig_conversations_tenant_read" on public.ig_conversations;
create policy "ig_conversations_tenant_read" on public.ig_conversations
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
revoke all on public.ig_conversations from authenticated;
grant select on public.ig_conversations to authenticated;

drop trigger if exists set_updated_at_ig_conversations on public.ig_conversations;
create trigger set_updated_at_ig_conversations before update on public.ig_conversations
  for each row execute function app.set_updated_at();

-- Realtime: a lista assina postgres_changes. Idempotente e tolerante a banco sem a publicação.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ig_conversations') then
    alter publication supabase_realtime add table public.ig_conversations;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2) ig_conversation_events (sem texto)
-- ------------------------------------------------------------
create table if not exists public.ig_conversation_events (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null references public.organizations(id) on delete cascade,
  conversation_id   uuid not null references public.ig_conversations(id) on delete cascade,
  kind              text not null check (kind in ('bot_message', 'store_message', 'waiting', 'paused', 'resolved')),
  zernio_message_id text,
  run_id            uuid,
  detail            text,
  occurred_at       timestamptz not null default now()
);

comment on table public.ig_conversation_events is
  'O que o robô e a loja fizeram em cada conversa, sem o texto das mensagens. Some com a conversa (cascata).';

create index if not exists ig_conversation_events_conv_time_idx
  on public.ig_conversation_events (tenant_id, conversation_id, occurred_at);
-- Lado filho do FK: o on delete cascade varre a tabela sem ele.
create index if not exists ig_conversation_events_conv_idx on public.ig_conversation_events (conversation_id);

alter table public.ig_conversation_events enable row level security;
drop policy if exists "ig_conversation_events_tenant_read" on public.ig_conversation_events;
create policy "ig_conversation_events_tenant_read" on public.ig_conversation_events
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
revoke all on public.ig_conversation_events from authenticated;
grant select on public.ig_conversation_events to authenticated;

-- ------------------------------------------------------------
-- 3) ig_canned_replies (até 50 por loja)
-- ------------------------------------------------------------
create table if not exists public.ig_canned_replies (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.organizations(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 40),
  text       text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists ig_canned_replies_tenant_idx on public.ig_canned_replies (tenant_id, created_at);

alter table public.ig_canned_replies enable row level security;
drop policy if exists "ig_canned_replies_tenant_read" on public.ig_canned_replies;
create policy "ig_canned_replies_tenant_read" on public.ig_canned_replies
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
revoke all on public.ig_canned_replies from authenticated;
grant select on public.ig_canned_replies to authenticated;

create or replace function app.ig_canned_replies_cap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.ig_canned_replies where tenant_id = new.tenant_id) >= 50 then
    raise exception 'ig_canned_replies_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function app.ig_canned_replies_cap() from public, anon, authenticated;

drop trigger if exists ig_canned_replies_cap on public.ig_canned_replies;
create trigger ig_canned_replies_cap before insert on public.ig_canned_replies
  for each row execute function app.ig_canned_replies_cap();

-- ------------------------------------------------------------
-- 4) ig_contact_tombstones: quem a loja apagou (hash do id, nunca o id). Sem leitura nenhuma fora do servidor.
-- ------------------------------------------------------------
create table if not exists public.ig_contact_tombstones (
  tenant_id    uuid not null references public.organizations(id) on delete cascade,
  ig_user_hash text not null,
  deleted_at   timestamptz not null default now(),
  primary key (tenant_id, ig_user_hash)
);

comment on table public.ig_contact_tombstones is
  'Marcador (sha256 de tenant_id:ig_user_id) de quem a loja apagou da lista; a varredura do Atualizar pula. Some em 12 meses (ig_conversations_rotina).';

create index if not exists ig_contact_tombstones_age_idx on public.ig_contact_tombstones (deleted_at);

alter table public.ig_contact_tombstones enable row level security;
revoke all on public.ig_contact_tombstones from authenticated;

grant all on public.ig_conversations, public.ig_conversation_events, public.ig_canned_replies, public.ig_contact_tombstones to service_role;

-- ------------------------------------------------------------
-- 5) ig_conversation_touch: upsert atômico do índice
-- ------------------------------------------------------------
create or replace function public.ig_conversation_touch(
  p_tenant uuid,
  p_zernio_conversation_id text,
  p_ig_user_id text,
  p_ig_account_id uuid,
  p_username text,
  p_display_name text,
  p_direction text,
  p_at timestamptz,
  p_preview text,
  p_status text
)
returns public.ig_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at timestamptz := least(coalesce(p_at, now()), now() + interval '5 minutes');
  v_row public.ig_conversations;
begin
  insert into public.ig_conversations as c
    (tenant_id, zernio_conversation_id, ig_user_id, ig_account_id, username, display_name,
     status, unread_count, last_message_at, last_direction, last_preview)
  values (
    p_tenant, p_zernio_conversation_id, p_ig_user_id, p_ig_account_id, nullif(p_username, ''), nullif(p_display_name, ''),
    coalesce(p_status, 'open'),
    case when p_direction = 'in' then 1 else 0 end,
    v_at, p_direction, left(p_preview, 200)
  )
  on conflict (tenant_id, zernio_conversation_id) do update set
    ig_user_id      = p_ig_user_id,
    ig_account_id   = coalesce(p_ig_account_id, c.ig_account_id),
    username        = coalesce(nullif(p_username, ''), c.username),
    display_name    = coalesce(nullif(p_display_name, ''), c.display_name),
    status          = coalesce(p_status, c.status),
    unread_count    = c.unread_count + case when p_direction = 'in' then 1 else 0 end,
    -- A última mensagem só anda para frente: aviso atrasado não desfaz a lista.
    last_direction  = case when c.last_message_at is null or v_at >= c.last_message_at then p_direction else c.last_direction end,
    last_preview    = case when c.last_message_at is null or v_at >= c.last_message_at then left(p_preview, 200) else c.last_preview end,
    last_message_at = greatest(c.last_message_at, v_at)
  returning c.* into v_row;
  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- 6) Rotina de hora em hora: fechar conversas e apagar o que passou do prazo
-- ------------------------------------------------------------
create or replace function public.ig_conversations_rotina(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parada bigint;
  v_janela bigint;
  v_idle bigint;
  v_off bigint;
  v_tomb bigint;
begin
  -- Aberta parada há 24 h.
  with up as (
    update public.ig_conversations c set status = 'resolved'
     where c.status = 'open' and c.last_message_at < p_now - interval '24 hours'
    returning c.id, c.tenant_id),
  ins as (
    insert into public.ig_conversation_events (tenant_id, conversation_id, kind, detail, occurred_at)
    select tenant_id, id, 'resolved', 'parada_24h', p_now from up returning 1)
  select count(*) into v_parada from ins;

  -- Aguardando você cuja janela de 7 dias fechou (ninguém mais pode responder).
  with alvo as (
    select c.id from public.ig_conversations c
      left join public.ig_contacts k on k.tenant_id = c.tenant_id and k.ig_user_id = c.ig_user_id
     where c.status = 'waiting' and coalesce(k.last_dm_at, c.last_message_at) < p_now - interval '7 days'),
  up as (
    update public.ig_conversations c set status = 'resolved'
      from alvo where c.id = alvo.id
    returning c.id, c.tenant_id),
  ins as (
    insert into public.ig_conversation_events (tenant_id, conversation_id, kind, detail, occurred_at)
    select tenant_id, id, 'resolved', 'janela_fechou', p_now from up returning 1)
  select count(*) into v_janela from ins;

  delete from public.ig_conversations where last_message_at < p_now - interval '12 months';
  get diagnostics v_idle = row_count;

  delete from public.ig_conversations c
  using public.tenant_settings s
  where s.tenant_id = c.tenant_id
    and s.instagram_enabled is not true
    and s.instagram_disabled_at < p_now - interval '30 days';
  get diagnostics v_off = row_count;

  delete from public.ig_contact_tombstones where deleted_at < p_now - interval '12 months';
  get diagnostics v_tomb = row_count;

  return jsonb_build_object(
    'resolvidas_parada_24h', v_parada, 'resolvidas_janela_fechou', v_janela,
    'apagadas_12_meses', v_idle, 'apagadas_loja_cancelada', v_off, 'marcadores_apagados', v_tomb);
end;
$$;

-- ------------------------------------------------------------
-- 7) ACL: o default privilege do banco concede EXECUTE a authenticated; só o servidor chama.
-- ------------------------------------------------------------
revoke all on function public.ig_conversation_touch(uuid, text, text, uuid, text, text, text, timestamptz, text, text)
  from public, anon, authenticated;
revoke all on function public.ig_conversations_rotina(timestamptz) from public, anon, authenticated;
grant execute on function public.ig_conversation_touch(uuid, text, text, uuid, text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.ig_conversations_rotina(timestamptz) to service_role;
