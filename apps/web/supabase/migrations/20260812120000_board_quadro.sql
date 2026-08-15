-- ============================================================
-- Quadro Scrumban de features (docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md)
--
-- Dado operacional interno: SEM tenant_id, RLS ligada e SEM policy (deny-all).
-- Só service_role enxerga. NÃO entra na publicação supabase_realtime — a
-- entrega é por polling em rota autenticada.
-- Idempotente.
-- ============================================================

create table if not exists public.board_features (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  title       text not null,
  area        text not null,
  status      text not null default 'nao_existe',
  summary     text,
  blocker     text,
  evidence    text,
  evidence_at timestamptz,
  priority    text not null default 'media',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint board_features_status_valido
    check (status in ('nao_existe','em_construcao','no_ar_nao_verificado','no_ar_verificado','quebrado')),

  constraint board_features_priority_valida
    check (priority in ('alta','media','baixa')),

  -- A regra anti-mentira: verificado exige prova datada. Não é convenção, é o banco recusando.
  constraint board_features_verificado_exige_prova
    check (status <> 'no_ar_verificado' or (evidence is not null and evidence_at is not null))
);

create index if not exists board_features_status_idx
  on public.board_features (status, sort_order, created_at);

create table if not exists public.board_events (
  id          uuid primary key default gen_random_uuid(),
  feature_id  uuid references public.board_features(id) on delete cascade,
  from_status text,
  to_status   text,
  note        text,
  ref         text,
  actor       text not null default 'claude',
  created_at  timestamptz not null default now(),

  constraint board_events_actor_valido check (actor in ('claude','igor'))
);

create index if not exists board_events_created_idx
  on public.board_events (created_at desc);

alter table public.board_features enable row level security;
alter table public.board_events   enable row level security;
-- Nenhuma policy, de propósito. service_role bypassa RLS; todo o resto fica de fora.

-- ------------------------------------------------------------
-- Trigger: o evento é escrito pelo banco, não por disciplina de quem move.
-- Motivo/ref/ator chegam por GUC de transação (public.move_card seta).
-- Update cru grava evento com note nulo — e evento sem motivo é o sinal
-- de que alguém mexeu sem explicar.
-- ------------------------------------------------------------
create or replace function public.board_features_log_move()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    insert into public.board_events (feature_id, from_status, to_status, note, ref, actor)
    values (
      new.id,
      old.status,
      new.status,
      nullif(btrim(coalesce(current_setting('app.board_note', true), '')), ''),
      nullif(btrim(coalesce(current_setting('app.board_ref',  true), '')), ''),
      case when current_setting('app.board_actor', true) = 'igor' then 'igor' else 'claude' end
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists board_features_log_move on public.board_features;
create trigger board_features_log_move
  before update on public.board_features
  for each row execute function public.board_features_log_move();

-- O Postgres já recusa chamada direta a função `returns trigger` ("trigger functions can
-- only be called as triggers"), então isto não fecha buraco nenhum. É para silenciar o
-- advisor: dois WARN benignos e permanentes no painel são como um WARN real passa batido.
revoke all on function public.board_features_log_move()
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- public.move_card: um movimento = uma chamada. Exige motivo.
-- Ao mover para 'no_ar_verificado', carimba a prova com p_ref e a data de agora;
-- se não houver prova nenhuma, a constraint derruba o update — que é o objetivo.
-- ------------------------------------------------------------
create or replace function public.move_card(
  p_key    text,
  p_status text,
  p_note   text,
  p_ref    text default null,
  p_actor  text default 'claude'
) returns public.board_features
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.board_features;
begin
  if p_note is null or btrim(p_note) = '' then
    raise exception 'move_card exige motivo em p_note';
  end if;

  -- Prova NOVA a cada verificação. Sem isto, um card que já foi verificado um dia
  -- carrega a prova velha para sempre: mover para quebrado e voltar para verificado
  -- sem p_ref passava na constraint (evidence sobreviveu) e ainda zerava o relogio
  -- dos 30 dias, exibindo "verificado ha 0 dias" com a prova de meses atras.
  if p_status = 'no_ar_verificado' and (p_ref is null or btrim(p_ref) = '') then
    raise exception 'mover para no_ar_verificado exige prova em p_ref';
  end if;

  perform set_config('app.board_note',  p_note, true);
  perform set_config('app.board_ref',   coalesce(p_ref, ''), true);
  perform set_config('app.board_actor',
                     case when p_actor = 'igor' then 'igor' else 'claude' end, true);

  update public.board_features
     set status      = p_status,
         evidence    = case when p_status = 'no_ar_verificado'
                            then p_ref else evidence end,
         evidence_at = case when p_status = 'no_ar_verificado'
                            then now() else evidence_at end
   where key = p_key
  returning * into v_row;

  if v_row.id is null then
    raise exception 'card % nao existe', p_key;
  end if;

  return v_row;
end;
$$;

revoke all on function public.move_card(text, text, text, text, text)
  from public, anon, authenticated;
