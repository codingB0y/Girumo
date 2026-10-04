-- apps/web/supabase/migrations/20261003120000_ig_fluxos.sql
-- Fluxos do Instagram, fase 1 (spec docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md §7).
--
-- O IG Connect de 16/08 previa app próprio na Meta: OAuth nosso, token cifrado,
-- refresh de 60 dias, gatilho de 1 mensagem (ig_triggers) e log de atendimento
-- (ig_events). Em 01/10 a integração passou a ser pela Zernio, que guarda o
-- token, e o produto virou um fluxo de vários passos. Esta migração adapta
-- ig_accounts, apaga as duas tabelas que nunca receberam código nem linha e cria
-- o modelo novo: ig_flows (o grafo, em jsonb), ig_runs (uma pessoa passando pelo
-- fluxo) e ig_run_steps (cada transição; é a fonte dos números). As três tabelas
-- do motor já nascem aqui para não repetir a rodada de DDL na fase 2.
--
-- LGPD: continuamos sem guardar texto de comentário ou direct. Só a palavra que
-- casou, o id escopado da pessoa, o @ e datas. Retenção de 90 dias (fase 3).
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json.

-- ------------------------------------------------------------
-- 1) ig_accounts: conectada pela Zernio, não por token nosso
-- ------------------------------------------------------------
alter table public.ig_accounts
  add column if not exists provider text not null default 'zernio',
  add column if not exists provider_account_id text,
  add column if not exists provider_profile_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ig_accounts_provider_check') then
    alter table public.ig_accounts
      add constraint ig_accounts_provider_check check (provider in ('zernio', 'meta'));
  end if;
end $$;

-- Quem guarda o token é o provedor; as colunas ficam para o plano B (app próprio).
alter table public.ig_accounts alter column access_token_enc drop not null;
alter table public.ig_accounts alter column token_expires_at drop not null;

comment on column public.ig_accounts.provider_account_id is
  'Id da conta no provedor (Zernio: account.accountId do webhook). Chave de roteamento do webhook, única.';
comment on column public.ig_accounts.provider_profile_id is
  'Perfil do tenant no provedor (Zernio: um perfil por loja).';

create unique index if not exists ig_accounts_provider_account_uidx
  on public.ig_accounts (provider_account_id)
  where provider_account_id is not null;

-- A policy antiga dependia de current_setting('app.tenant_id'), que o app nunca
-- seta (nega tudo). Troca pelo padrão que funciona: auth.uid() + memberships.
drop policy if exists "ig_accounts_tenant_isolation" on public.ig_accounts;
drop policy if exists "ig_accounts_tenant_read" on public.ig_accounts;
create policy "ig_accounts_tenant_read" on public.ig_accounts
  for select to authenticated using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.ig_accounts from authenticated;

-- ------------------------------------------------------------
-- 2) ig_triggers e ig_events saem (nunca tiveram código nem linha)
-- ------------------------------------------------------------
do $$
declare
  n bigint;
begin
  if to_regclass('public.ig_triggers') is not null then
    execute 'select count(*) from public.ig_triggers' into n;
    if n > 0 then raise exception 'ig_triggers tem % linha(s); migre antes de apagar', n; end if;
  end if;
  if to_regclass('public.ig_events') is not null then
    execute 'select count(*) from public.ig_events' into n;
    if n > 0 then raise exception 'ig_events tem % linha(s); migre antes de apagar', n; end if;
  end if;
end $$;

drop table if exists public.ig_events;
drop table if exists public.ig_triggers;

-- ------------------------------------------------------------
-- 3) ig_flows: o fluxo (rascunho e publicado, em jsonb)
-- ------------------------------------------------------------
create table if not exists public.ig_flows (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.organizations(id) on delete cascade,
  -- Nulo enquanto a loja não conectou a conta: dá pra montar o rascunho antes.
  ig_account_id  uuid references public.ig_accounts(id) on delete set null,
  name           text not null check (char_length(name) between 1 and 80),
  recipe         text not null check (recipe in ('comment_invite', 'comment_follow_invite', 'dm_invite', 'blank')),
  status         text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  -- O grafo: { v, nodes[], edges[] }. Forma validada no app (lib/ig/flow/schema.ts).
  draft          jsonb not null,
  published      jsonb,
  version        integer not null default 0,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.ig_flows is
  'Fluxo do Instagram de uma loja: rascunho editável (draft) e a versão no ar (published), ambos o mesmo grafo em jsonb.';

create index if not exists ig_flows_tenant_idx on public.ig_flows (tenant_id, updated_at desc);

alter table public.ig_flows enable row level security;
drop policy if exists "ig_flows_tenant_read" on public.ig_flows;
create policy "ig_flows_tenant_read" on public.ig_flows
  for select to authenticated using (app.has_membership(tenant_id));
revoke all on public.ig_flows from authenticated;
grant select on public.ig_flows to authenticated;

-- Indice do lado filho dos FKs: o on delete set null/cascade varre a tabela sem ele.
create index if not exists ig_flows_account_idx on public.ig_flows (ig_account_id);

drop trigger if exists set_updated_at_ig_flows on public.ig_flows;
create trigger set_updated_at_ig_flows before update on public.ig_flows
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- 4) ig_runs: uma pessoa passando por um fluxo
-- ------------------------------------------------------------
create table if not exists public.ig_runs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.organizations(id) on delete cascade,
  ig_account_id      uuid not null references public.ig_accounts(id) on delete cascade,
  flow_id            uuid not null references public.ig_flows(id) on delete cascade,
  flow_version       integer not null,
  source_kind        text not null check (source_kind in ('comment', 'dm', 'story')),
  -- comment id ou message id da Meta. ÚNICO GLOBAL: é a idempotência do webhook
  -- (a Zernio reentrega) e a trava de 1 resposta privada por comentário.
  source_id          text not null,
  -- Id escopado da pessoa (IGSID). Não é o @ e não reidentifica fora do app.
  ig_user_id         text not null,
  username           text,
  matched_keyword    text,
  -- Referência aleatória que vai no link (/r/<slug>?ig=<ref>) e nos botões.
  -- Nunca dado pessoal; é o que liga o clique ao run.
  ref                text not null,
  status             text not null default 'queued'
                       check (status in ('queued', 'active', 'done', 'stopped', 'failed')),
  node_id            text,
  waiting            text check (waiting in ('reply', 'click')),
  wake_at            timestamptz,
  window_expires_at  timestamptz,
  clicked_at         timestamptz,
  error_code         text,
  error_message      text,
  started_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  finished_at        timestamptz
);

comment on table public.ig_runs is
  'Uma linha por pessoa que entrou num fluxo do Instagram. source_id único = idempotência; ref vai no link e atribui o clique. Retenção 90 dias.';

create unique index if not exists ig_runs_source_uidx on public.ig_runs (source_id);
create unique index if not exists ig_runs_ref_uidx on public.ig_runs (ref);
create index if not exists ig_runs_flow_idx on public.ig_runs (tenant_id, flow_id, started_at desc);
create index if not exists ig_runs_person_idx on public.ig_runs (tenant_id, flow_id, ig_user_id, started_at desc);
-- O relógio da fase 3 (lembrete) só olha run ativo com hora marcada.
create index if not exists ig_runs_wake_idx on public.ig_runs (wake_at) where status = 'active' and wake_at is not null;

alter table public.ig_runs enable row level security;
drop policy if exists "ig_runs_tenant_read" on public.ig_runs;
create policy "ig_runs_tenant_read" on public.ig_runs
  for select to authenticated using (app.has_membership(tenant_id));
revoke all on public.ig_runs from authenticated;
grant select on public.ig_runs to authenticated;

create index if not exists ig_runs_account_idx on public.ig_runs (ig_account_id);
-- ig_runs_flow_idx comeca em tenant_id; o FK flow_id precisa de indice proprio.
create index if not exists ig_runs_flow_fk_idx on public.ig_runs (flow_id);

drop trigger if exists set_updated_at_ig_runs on public.ig_runs;
create trigger set_updated_at_ig_runs before update on public.ig_runs
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- 5) ig_run_steps: cada transição; a fonte dos números por passo
-- ------------------------------------------------------------
create table if not exists public.ig_run_steps (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references public.organizations(id) on delete cascade,
  flow_id      uuid not null references public.ig_flows(id) on delete cascade,
  run_id       uuid not null references public.ig_runs(id) on delete cascade,
  node_id      text not null,
  "out"        text not null,
  occurred_at  timestamptz not null default now()
);

comment on table public.ig_run_steps is
  'Uma linha por saída tomada num run (bloco + saída). Agrupada por (node_id, out) vira o número de cada passo nas duas visões.';

create index if not exists ig_run_steps_flow_idx on public.ig_run_steps (tenant_id, flow_id, occurred_at desc);

alter table public.ig_run_steps enable row level security;
drop policy if exists "ig_run_steps_tenant_read" on public.ig_run_steps;
create policy "ig_run_steps_tenant_read" on public.ig_run_steps
  for select to authenticated using (app.has_membership(tenant_id));
revoke all on public.ig_run_steps from authenticated;
grant select on public.ig_run_steps to authenticated;

create index if not exists ig_run_steps_run_idx on public.ig_run_steps (run_id);

-- ------------------------------------------------------------
-- 6) A liberação por loja (add-on). Ligada à mão até a fase 4 (cobrança).
-- ------------------------------------------------------------
alter table public.tenant_settings
  add column if not exists instagram_enabled boolean not null default false;

comment on column public.tenant_settings.instagram_enabled is
  'Add-on Instagram liberado para a loja. Até a fase 4 é ligado à mão; depois, pelo webhook do Stripe.';

-- tenant_settings tem policy de UPDATE para qualquer membro (campos de
-- autoatendimento). Sem esta trava, um membro faria PATCH {"instagram_enabled":
-- true} direto no PostgREST e destravaria o add-on pago. Só service role e
-- migração (postgres) mudam a flag.
create or replace function public.tenant_settings_guard_instagram_flag()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.instagram_enabled is true then
        raise exception 'instagram_enabled so pode ser alterado pelo servidor' using errcode = '42501';
      end if;
    elsif new.instagram_enabled is distinct from old.instagram_enabled then
      raise exception 'instagram_enabled so pode ser alterado pelo servidor' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tenant_settings_guard_instagram_flag() from public, anon, authenticated;

drop trigger if exists tenant_settings_guard_instagram_flag on public.tenant_settings;
create trigger tenant_settings_guard_instagram_flag
  before insert or update on public.tenant_settings
  for each row execute function public.tenant_settings_guard_instagram_flag();
