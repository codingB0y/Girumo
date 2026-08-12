-- ============================================================
-- Fila de auto-grow — "o grupo lotou, o próximo nasce sozinho".
--
-- Até aqui a fila vivia só em JSON (`tenants/<id>/group-grow.json`), então em
-- produção — onde HUBFLOW_USE_SUPABASE está ligado — o auto-grow simplesmente
-- não tinha onde guardar job. Esta tabela é o estado que faltava.
--
-- A fila nasce AGNÓSTICA DE EXECUTOR de propósito. Hoje quem consome é a engine
-- Baileys (`hubflow-engine/index.js`, `runGrow`), que segue de pé por 1-2 meses
-- (decisão Igor 11/08). Quando o cutover acontecer, troca-se só quem faz o
-- claim — nada aqui nomeia o executor, nem em coluna nem em valor de enum.
--
-- Contrato de claim: espelha `app.claim_automation_runs`
-- (20260729010000_automation_runs.sql) na intenção, mas sem função dedicada —
-- o claim é um UPDATE ... WHERE status = 'queued' de uma só instrução, que já
-- é atômico: um segundo claim concorrente bloqueia, reavalia e não encontra
-- mais nada em 'queued'. Menos superfície que uma security definer a mais.
--
-- ANTI-BAN: esta fila cria GRUPO, não conversa. Ela não tem campo de telefone
-- nem de destinatário — não existe caminho de DM aqui, por construção.
-- ============================================================

create table if not exists public.group_grow_jobs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references organizations(id) on delete cascade,
  campaign_group_id   uuid not null references campaign_groups(id) on delete cascade,

  -- Slug da campanha no momento do enfileiramento. Desnormalizado de propósito:
  -- é o que a engine usa para logar, e o job precisa ser autocontido no claim.
  campaign_slug       text not null default '',

  -- Número do grupo — o {n} de `subjectPattern`. Único por campanha para que
  -- um enfileiramento duplicado estoure em vez de criar dois grupos iguais.
  seq                 integer not null,

  -- Molde já RESOLVIDO (o {n} substituído). O que a engine recebe no claim.
  subject             text not null,
  description         text,
  media_id            text,
  announce            boolean not null default true,
  member_add_mode     text not null default 'admin_add'
                        check (member_add_mode in ('admin_add', 'all_member_add')),

  --   queued  = enfileirado, esperando o executor puxar
  --   running = executor claimou e está criando no WhatsApp
  --   created = grupo criado e devolvido ao pool (já roteável pelo /r/<campanha>)
  --   failed  = criação falhou, ou job preso recuperado
  status              text not null default 'queued'
                        check (status in ('queued', 'running', 'created', 'failed')),
  attempts            integer not null default 0,

  -- Preenchidos no ack `created`.
  whatsapp_group_id   text,
  invite_url          text,
  error               text,

  created_at          timestamptz not null default now(),
  running_since       timestamptz,
  last_ack_at         timestamptz,
  updated_at          timestamptz not null default now()
);

comment on table public.group_grow_jobs is
  'Fila de criação de grupo do auto-grow. Agnóstica de executor: hoje consumida pela engine Baileys.';
comment on column public.group_grow_jobs.seq is
  'Número do grupo na campanha — o {n} do subjectPattern. Único por campanha.';
comment on column public.group_grow_jobs.campaign_slug is
  'Slug da campanha no enfileiramento. Desnormalizado p/ o claim ser autocontido.';

-- Um job por (campanha, número): enfileiramento duplicado falha em vez de
-- criar dois grupos com o mesmo nome.
create unique index if not exists group_grow_jobs_seq_uidx
  on public.group_grow_jobs (tenant_id, campaign_group_id, seq);

-- Índice do claim: só o que pode ser reivindicado.
create index if not exists group_grow_jobs_queued_idx
  on public.group_grow_jobs (tenant_id, created_at)
  where status = 'queued';

-- Índice da recuperação de job preso: só os que estão com o executor.
create index if not exists group_grow_jobs_running_idx
  on public.group_grow_jobs (tenant_id, last_ack_at)
  where status = 'running';

create index if not exists group_grow_jobs_campaign_idx
  on public.group_grow_jobs (tenant_id, campaign_group_id, created_at desc);

alter table public.group_grow_jobs enable row level security;

create policy "group_grow_jobs_tenant_isolation" on public.group_grow_jobs
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
