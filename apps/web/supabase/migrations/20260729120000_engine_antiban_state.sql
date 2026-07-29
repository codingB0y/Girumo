-- F4 · Anti-ban portado — Opção C (cota/estado no banco), por instância.
--
-- Contexto: o engine legado Baileys era "1 processo = 1 número", então o governor
-- anti-ban em memória (anti-ban-queue.js: sentTimestamps[] + caps 8/min·120/h·800/dia
-- + warmup) era correto por processo. O worker novo (apps/worker) é multi-tenant e
-- pode rodar com N réplicas drenando engine_commands — um contador em memória por
-- processo (a) somaria números diferentes no mesmo balde e (b) liberaria N× a cota.
--
-- Solução (spec em apps/worker/docs/anti-ban-spec.md): o estado de ritmo vive AQUI,
-- por instance_id, e o anti-ban entra no PRÓPRIO claim (atômico, SKIP LOCKED — mesmo
-- mecanismo do engine_queue_v2). Workers ficam stateless; correto sob 1 ou N réplicas
-- por construção; e sobrevive a restart (fecha a dívida "estado anti-ban reseta no boot").
--
-- Só controle operacional seguro (hubflow-engine/DECISIONS.md): limita ritmo, não forja
-- nada. Nenhuma mudança no contrato de payload de send_message ({jid,text}).

-- ============================================================
-- 1) Estado por instância (warmup + gate de espaçamento + breaker)
-- ============================================================

create table if not exists public.instance_send_state (
  instance_id          uuid primary key references public.instances (id) on delete cascade,
  tenant_id            uuid not null,
  -- Warmup: rampa de volume p/ número novo (porte de warmup.js). Cada número recebe
  -- um fator de crescimento estável em [1.5, 2.2] (era aleatório por processo no legado).
  warmup_started_at    timestamptz not null default now(),
  warmup_growth        numeric not null default round((1.5 + random() * 0.7)::numeric, 2),
  warmup_graduated     boolean not null default false,
  -- Reentra em warmup após inatividade longa (72h) — número que "some" e volta a jorrar
  -- é sinal de spam. last_active_at rastreia o último envio bem-sucedido.
  last_active_at       timestamptz not null default now(),
  -- Gate de espaçamento: próximo envio permitido p/ ESTE número (gap gaussiano ~3–7s).
  -- Serializa envios do mesmo número entre todas as réplicas; números distintos correm juntos.
  next_send_allowed_at timestamptz not null default now(),
  -- Circuit breaker por número: N falhas seguidas → pausa curta.
  paused_until         timestamptz,
  consecutive_failures integer not null default 0,
  updated_at           timestamptz not null default now()
);

comment on table public.instance_send_state is
  'Estado anti-ban por número (warmup, espaçamento, breaker). Fonte de verdade do ritmo de envio; substitui o governor em memória do engine legado.';

-- Log append-only de envios p/ contar janelas min/hora/dia (podado > 24h).
-- ~800/dia/número × ~10 números = ~8k linhas/dia, podadas — trivial.
create table if not exists public.instance_sends (
  id          bigint generated always as identity primary key,
  instance_id uuid not null references public.instances (id) on delete cascade,
  sent_at     timestamptz not null default now()
);

create index if not exists instance_sends_instance_sent_idx
  on public.instance_sends (instance_id, sent_at);
create index if not exists instance_sends_sent_at_idx
  on public.instance_sends (sent_at);

-- Fila/estado anti-ban: deny-all p/ authenticated/anon (igual engine_commands).
-- Só service_role (worker) acessa, e via RPCs security-definer abaixo.
alter table public.instance_send_state enable row level security;
alter table public.instance_sends enable row level security;

-- ============================================================
-- 2) Teto diário efetivo do número (min entre 800 e o teto do warmup)
-- ============================================================

create or replace function app.instance_daily_cap(target_instance_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, app
as $$
  -- Dia do warmup = dias inteiros desde warmup_started_at. day1Limit=20, ×growth/dia,
  -- gradua (∞→teto duro 800) em 7 dias. Sem estado ainda = dia 0 = 20.
  select least(
    800,
    coalesce((
      select case
        when s.warmup_graduated then 800
        when floor(extract(epoch from now() - s.warmup_started_at) / 86400) >= 7 then 800
        else round(20 * power(s.warmup_growth, floor(extract(epoch from now() - s.warmup_started_at) / 86400)::int))::int
      end
      from public.instance_send_state s
      where s.instance_id = target_instance_id
    ), 20)
  )::integer;
$$;

-- ============================================================
-- 3) Claim anti-ban: só devolve send_message de número PRONTO,
--    no máx. 1 por número por lote (serializa por número).
-- ============================================================

create or replace function app.claim_send_commands(max_commands integer default 5)
returns setof public.engine_commands
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return query
  update public.engine_commands c
  set
    status = 'processing',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now()
  where c.id in (
    select cand.id
    from public.engine_commands cand
    where cand.status = 'queued'
      and cand.type = 'send_message'
      and cand.available_at <= now()
      and cand.instance_id is not null
      -- (a) número não está pausado pelo breaker
      and not exists (
        select 1 from public.instance_send_state s
        where s.instance_id = cand.instance_id
          and s.paused_until is not null
          and s.paused_until > now()
      )
      -- (b) gate de espaçamento (gap gaussiano do último envio) já passou
      and coalesce(
        (select s.next_send_allowed_at from public.instance_send_state s where s.instance_id = cand.instance_id),
        now()
      ) <= now()
      -- (c) sob os caps por janela (min/hora/dia). Dia usa o teto do warmup.
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 minute') < 8
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 hour') < 120
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 day')
          < app.instance_daily_cap(cand.instance_id)
      -- (d) no máx. 1 comando por número por lote: só o de maior prioridade/mais antigo
      --     daquele número é elegível (os demais do mesmo número esperam o próximo tick).
      and cand.id = (
        select best.id
        from public.engine_commands best
        where best.status = 'queued'
          and best.type = 'send_message'
          and best.available_at <= now()
          and best.instance_id = cand.instance_id
        -- id como desempate ESTÁVEL: comandos enfileirados no mesmo statement
        -- compartilham created_at (now() é fixo na transação), então sem o id o
        -- "1 por número" ficaria dependente do plano.
        order by best.priority asc, best.created_at asc, best.id asc
        limit 1
      )
    order by cand.priority asc, cand.created_at asc, cand.id asc
    limit greatest(max_commands, 1)
    for update skip locked
  )
  returning c.*;
end;
$$;

-- ============================================================
-- 4) Pós-envio OK: registra o envio + estica o gate de espaçamento
--    (gap gaussiano ~3–7s via Bates n=2) + gradua/reentra warmup.
-- ============================================================

create or replace function app.record_send(target_instance_id uuid, target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.instance_send_state (
    instance_id, tenant_id, warmup_started_at, last_active_at, next_send_allowed_at
  )
  values (
    target_instance_id, target_tenant_id, now(), now(),
    now() + make_interval(secs => 3 + ((random() + random()) / 2) * 4)
  )
  on conflict (instance_id) do update set
    -- Reentra em warmup se ficou > 72h sem enviar (e ainda não graduou).
    warmup_started_at = case
      when not instance_send_state.warmup_graduated
        and now() - instance_send_state.last_active_at >= interval '72 hours'
      then now()
      else instance_send_state.warmup_started_at
    end,
    warmup_graduated = case
      when not instance_send_state.warmup_graduated
        and now() - instance_send_state.last_active_at >= interval '72 hours'
      then false
      when floor(extract(epoch from now() - instance_send_state.warmup_started_at) / 86400) >= 7
      then true
      else instance_send_state.warmup_graduated
    end,
    last_active_at = now(),
    consecutive_failures = 0,
    paused_until = null,
    next_send_allowed_at = now() + make_interval(secs => 3 + ((random() + random()) / 2) * 4),
    updated_at = now();

  insert into public.instance_sends (instance_id) values (target_instance_id);
end;
$$;

-- ============================================================
-- 5) Pós-envio FALHA: circuit breaker por número.
--    O retry/backoff do comando individual é do complete_engine_command;
--    aqui é a pausa do NÚMERO após falhas seguidas (proteção contra soft-ban).
-- ============================================================

create or replace function app.record_send_failure(target_instance_id uuid, target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.instance_send_state (instance_id, tenant_id, consecutive_failures)
  values (target_instance_id, target_tenant_id, 1)
  on conflict (instance_id) do update set
    consecutive_failures = instance_send_state.consecutive_failures + 1,
    paused_until = case
      when instance_send_state.consecutive_failures + 1 >= 5
      then now() + interval '60 seconds'
      else instance_send_state.paused_until
    end,
    updated_at = now();
end;
$$;

-- ============================================================
-- 6) Poda do log de envios (worker chama esporadicamente, como requeue_*).
-- ============================================================

create or replace function app.prune_instance_sends(older_than interval default interval '25 hours')
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  removed integer;
begin
  with d as (
    delete from public.instance_sends
    where sent_at < now() - older_than
    returning 1
  )
  select count(*)::integer into removed from d;
  return removed;
end;
$$;

-- ============================================================
-- 7) Wrappers public.* (PostgREST) — service_role only.
-- ============================================================

create or replace function public.claim_send_commands(max_commands integer default 5)
returns setof public.engine_commands
language sql
security definer
set search_path = public, app
as $$
  select * from app.claim_send_commands(max_commands);
$$;

create or replace function public.record_send(target_instance_id uuid, target_tenant_id uuid)
returns void
language sql
security definer
set search_path = public, app
as $$
  select app.record_send(target_instance_id, target_tenant_id);
$$;

create or replace function public.record_send_failure(target_instance_id uuid, target_tenant_id uuid)
returns void
language sql
security definer
set search_path = public, app
as $$
  select app.record_send_failure(target_instance_id, target_tenant_id);
$$;

create or replace function public.prune_instance_sends(older_than interval default interval '25 hours')
returns integer
language sql
security definer
set search_path = public, app
as $$
  select app.prune_instance_sends(older_than);
$$;

revoke execute on function public.claim_send_commands(integer) from public, anon, authenticated;
revoke execute on function public.record_send(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.record_send_failure(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.prune_instance_sends(interval) from public, anon, authenticated;

grant execute on function public.claim_send_commands(integer) to service_role;
grant execute on function public.record_send(uuid, uuid) to service_role;
grant execute on function public.record_send_failure(uuid, uuid) to service_role;
grant execute on function public.prune_instance_sends(interval) to service_role;
