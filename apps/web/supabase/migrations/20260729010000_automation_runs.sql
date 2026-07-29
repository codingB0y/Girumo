-- ============================================================
-- Automation runs — estado de execução das automações do lojista.
--
-- A tabela `automations` guarda a CONFIGURAÇÃO (steps como jsonb). Ela não
-- serve como fila: `steps` é uma sequência COM ESTADO (passo atual, quando o
-- próximo dispara, condição avaliada na hora), enquanto `engine_commands` e
-- `broadcasts` são filas planas de uma-linha-uma-ação. Daí esta tabela: um run
-- = uma execução de uma automação disparada por um gatilho.
--
-- Camada 1 do plano em docs/superpowers/plans/2026-07-29-automations-executor.md.
-- Nesta fase NADA cria runs automaticamente — os gatilhos são a camada 2. Runs
-- são inseridos à mão para teste, então o risco em produção é zero.
--
-- O contrato de claim/lease espelha app.claim_engine_events
-- (20260727120000_leads_and_worker_reads.sql): `for update skip locked`, lease
-- com expiração e requeue dos órfãos de worker que morreu no meio.
-- ============================================================

-- ============================================================
-- 1) Tabela
-- ============================================================

create table if not exists automation_runs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,
  automation_id     uuid not null references automations(id) on delete cascade,

  -- O que disparou (lead_id, group_id, etc). Livre por gatilho.
  trigger_context   jsonb not null default '{}'::jsonb,

  -- Onde as mensagens vão. O CHECK abaixo é a garantia ANTI-BAN estrutural:
  -- decisão Igor 28/07 — nenhum passo envia DM, toda mensagem vai pro grupo.
  -- `broadcasts` garantia isso por não ter campo de telefone; como o executor
  -- passou a enfileirar em `engine_commands` (cujo payload aceita `phone`),
  -- a garantia é recriada aqui, no schema, além da validação no enqueue.
  target_group_jid  text not null check (target_group_jid like '%@g.us'),

  -- Estado da sequência.
  --   pending  = esperando `next_step_at` chegar (ou recém-criado)
  --   running  = reivindicado por um worker, lease ativo, processando o passo
  status            text not null default 'pending'
                      check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  current_step      integer not null default 0,
  next_step_at      timestamptz not null default now(),

  -- Lease (mesmo contrato de engine_events / engine_commands).
  claimed_at        timestamptz,
  lease_expires_at  timestamptz,
  attempts          integer not null default 0,
  max_attempts      integer not null default 5,
  error             text,

  -- Idempotência do gatilho: um run por (automação, chave do evento).
  -- Ex.: 'lead:<lead_id>:<automation_id>'.
  dedupe_key        text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column automation_runs.target_group_jid is
  'JID do grupo destino. CHECK @g.us impede DM (decisão anti-ban 2026-07-28).';
comment on column automation_runs.dedupe_key is
  'Idempotência do gatilho. Único por tenant quando preenchido.';

create unique index if not exists automation_runs_dedupe_uidx
  on automation_runs (tenant_id, dedupe_key)
  where dedupe_key is not null;

-- Índice do claim: só runs que podem ser reivindicados.
create index if not exists automation_runs_due_idx
  on automation_runs (next_step_at)
  where status = 'pending';

-- Índice do requeue: só runs com lease em aberto.
create index if not exists automation_runs_lease_idx
  on automation_runs (lease_expires_at)
  where status = 'running';

create index if not exists automation_runs_tenant_idx
  on automation_runs (tenant_id, created_at desc);

alter table automation_runs enable row level security;

create policy "automation_runs_tenant_isolation" on automation_runs
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================================
-- 2) Claim: runs vencidos, com lease
-- ============================================================

create or replace function app.claim_automation_runs(max_runs integer default 10)
returns setof public.automation_runs
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return query
  update public.automation_runs r
  set
    status = 'running',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now()
  where r.id in (
    select due.id
    from public.automation_runs due
    where due.status = 'pending'
      and due.next_step_at <= now()
    order by due.next_step_at asc
    limit greatest(max_runs, 1)
    for update skip locked
  )
  returning r.*;
end;
$$;

-- ============================================================
-- 3) Advance: passo concluído → agenda o próximo, solta o lease
-- ============================================================

create or replace function app.advance_automation_run(
  target_run_id uuid,
  next_step integer,
  next_at timestamptz default now()
)
returns public.automation_runs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated public.automation_runs;
begin
  update public.automation_runs
  set
    status = 'pending',
    current_step = next_step,
    next_step_at = next_at,
    claimed_at = null,
    lease_expires_at = null,
    attempts = 0,          -- passo entregue: zera o orçamento de retry
    error = null,
    updated_at = now()
  where id = target_run_id
    and status = 'running'  -- fencing: só quem detém o lease avança
  returning * into updated;

  return updated;
end;
$$;

-- ============================================================
-- 4) Finish: terminal. Em 'done', contabiliza na automação.
-- ============================================================

create or replace function app.finish_automation_run(
  target_run_id uuid,
  final_status text,
  error_message text default null
)
returns public.automation_runs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  updated public.automation_runs;
begin
  if final_status not in ('done', 'failed', 'cancelled') then
    raise exception 'finish_automation_run: status invalido %', final_status;
  end if;

  update public.automation_runs
  set
    status = final_status,
    claimed_at = null,
    lease_expires_at = null,
    error = error_message,
    updated_at = now()
  where id = target_run_id
    and status in ('pending', 'running')  -- não re-finaliza terminal
  returning * into updated;

  -- Só sequência concluída conta como execução pro lojista. Cancelada
  -- (automação desligada no meio) e falha não incrementam.
  if updated.id is not null and final_status = 'done' then
    update public.automations
    set
      total_runs = total_runs + 1,
      last_run_at = now(),
      updated_at = now()
    where id = updated.automation_id;
  end if;

  return updated;
end;
$$;

-- ============================================================
-- 5) Requeue: worker morreu no meio → devolve (ou falha se estourou)
-- ============================================================

create or replace function app.requeue_stale_automation_runs(
  older_than interval default '5 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  requeued integer;
begin
  -- Orçamento de retry esgotado: falha de vez.
  update public.automation_runs
  set
    status = 'failed',
    attempts = attempts + 1,
    claimed_at = null,
    lease_expires_at = null,
    error = coalesce(error, 'lease expirado'),
    updated_at = now()
  where status = 'running'
    and lease_expires_at < now() - older_than
    and attempts + 1 >= max_attempts;

  -- Ainda tem orçamento: volta pra fila, disponível agora.
  with r as (
    update public.automation_runs
    set
      status = 'pending',
      attempts = attempts + 1,
      claimed_at = null,
      lease_expires_at = null,
      next_step_at = now(),
      updated_at = now()
    where status = 'running'
      and lease_expires_at < now() - older_than
      and attempts + 1 < max_attempts
    returning 1
  )
  select count(*)::integer into requeued from r;

  return requeued;
end;
$$;

-- ============================================================
-- 6) Wrappers PostgREST-alcançáveis (só service_role)
--    PostgREST expõe apenas o schema `public`; o worker chama por REST.
-- ============================================================

create or replace function public.claim_automation_runs(max_runs integer default 10)
returns setof public.automation_runs
language sql
security definer
set search_path = public, app
as $$
  select * from app.claim_automation_runs(max_runs);
$$;

create or replace function public.advance_automation_run(
  target_run_id uuid,
  next_step integer,
  next_at timestamptz default now()
)
returns public.automation_runs
language sql
security definer
set search_path = public, app
as $$
  select app.advance_automation_run(target_run_id, next_step, next_at);
$$;

create or replace function public.finish_automation_run(
  target_run_id uuid,
  final_status text,
  error_message text default null
)
returns public.automation_runs
language sql
security definer
set search_path = public, app
as $$
  select app.finish_automation_run(target_run_id, final_status, error_message);
$$;

create or replace function public.requeue_stale_automation_runs(
  older_than interval default '5 minutes'
)
returns integer
language sql
security definer
set search_path = public, app
as $$
  select app.requeue_stale_automation_runs(older_than);
$$;

revoke execute on function public.claim_automation_runs(integer) from public, anon, authenticated;
revoke execute on function public.advance_automation_run(uuid, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.finish_automation_run(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.requeue_stale_automation_runs(interval) from public, anon, authenticated;

grant execute on function public.claim_automation_runs(integer) to service_role;
grant execute on function public.advance_automation_run(uuid, integer, timestamptz) to service_role;
grant execute on function public.finish_automation_run(uuid, text, text) to service_role;
grant execute on function public.requeue_stale_automation_runs(interval) to service_role;
