-- Fila de ações em massa sobre grupos que JÁ EXISTEM (foto, descrição,
-- abrir/fechar). Irmã de `group_grow_jobs`, que cobre a criação.
--
-- Um job por (grupo x ação), e não um job por lote com group_ids[]: falha
-- parcial precisa ter onde morar. 4 grupos que recusaram a foto não podem
-- obrigar os outros 87 a repetir a operação — e cada repetição gasta janela
-- anti-ban. O progresso ("47 de 91") sai da contagem de linhas do batch.

create table if not exists public.group_bulk_jobs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references organizations(id) on delete cascade,
  campaign_group_id  uuid not null references campaign_groups(id) on delete cascade,

  -- Agrupa os N jobs de UMA aplicação. É o que dá a barra de progresso.
  batch_id           uuid not null,

  action             text not null
                       check (action in ('set_description','set_picture','open','close')),

  group_id           uuid not null references groups(id) on delete cascade,
  -- Desnormalizado de propósito: o claim tem de ser autocontido, como
  -- group_grow_jobs.campaign_slug. O worker não faz join.
  whatsapp_group_id  text not null,

  -- Carga da ação. Conforme `action`, no máximo um dos dois é preenchido.
  description        text,
  media_id           text,

  status             text not null default 'queued'
                       check (status in ('queued','running','done','failed')),
  -- Conta recuperação de job preso, NÃO retry automático: `failed` é terminal.
  -- Reenfileirar 91 operações sozinho é como se fabrica rajada contra o
  -- WhatsApp, e o modo de falha mais provável (grupo onde perdemos o admin)
  -- não melhora com repetição.
  attempts           integer not null default 0,
  error              text,

  created_at         timestamptz not null default now(),
  running_since      timestamptz,
  last_ack_at        timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table public.group_bulk_jobs is
  'Fila de ações em massa sobre grupos existentes. Um job por (grupo x ação).';
comment on column public.group_bulk_jobs.batch_id is
  'Agrupa os jobs de uma aplicação. Base do progresso "N de M".';
comment on column public.group_bulk_jobs.attempts is
  'Recuperações de job preso. Não é retry: `failed` é terminal.';

-- Reenfileirar o mesmo lote vira no-op em vez de duplicar a operação no WhatsApp.
create unique index if not exists group_bulk_jobs_batch_uidx
  on public.group_bulk_jobs (tenant_id, batch_id, group_id, action);

create index if not exists group_bulk_jobs_queued_idx
  on public.group_bulk_jobs (tenant_id, created_at) where status = 'queued';
create index if not exists group_bulk_jobs_running_idx
  on public.group_bulk_jobs (tenant_id, last_ack_at) where status = 'running';
create index if not exists group_bulk_jobs_batch_idx
  on public.group_bulk_jobs (tenant_id, batch_id);

-- Estado de envio conhecido do grupo. Sem isso a tela não sabe dizer se o grupo
-- está aberto sem perguntar ao WhatsApp um a um. Registra o que NÓS aplicamos:
-- null é resposta honesta ("nunca aplicamos, não sabemos").
alter table public.groups
  add column if not exists send_state    text,
  add column if not exists send_state_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'groups_send_state_check'
  ) then
    alter table public.groups
      add constraint groups_send_state_check
      check (send_state is null or send_state in ('open','closed'));
  end if;
end $$;

comment on column public.groups.send_state is
  'Ultimo estado de envio APLICADO por nos (open/closed). null = nunca aplicamos.';

-- Claim com teto. O `p_limit` é METADE do anti-ban (a outra metade é o intervalo
-- do tick no worker): uma operação por tenant por vez, espaçada de 4s, dá ~15/min
-- distribuídos. `skip locked` mantém dois workers coexistindo sem entregar o
-- mesmo job duas vezes.
create or replace function public.claim_bulk_jobs(p_tenant uuid, p_limit int default 1)
returns setof public.group_bulk_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with picked as (
    select id
      from public.group_bulk_jobs
     where tenant_id = p_tenant
       and status = 'queued'
     order by created_at
     limit greatest(p_limit, 1)
     for update skip locked
  )
  update public.group_bulk_jobs j
     set status        = 'running',
         running_since = now(),
         last_ack_at   = now(),
         attempts      = j.attempts + 1,
         updated_at    = now()
    from picked
   where j.id = picked.id
  returning j.*;
end;
$$;

-- Revogar de `public` também: o ACL padrão de função é `=X/postgres`, ou seja
-- EXECUTE para PUBLIC — tirar de `anon` sozinho não fecha a porta.
--
-- E de `authenticated` também, que neste projeto MANTÉM os sete privilégios por
-- default (só `anon` foi zerado, em 22/08). Sem este revoke, qualquer usuário
-- logado chamaria `/rest/v1/rpc/claim_bulk_jobs` passando o `tenant_id` de
-- outro: a função é `security definer` e recebe o tenant como PARÂMETRO, então
-- ela não tem como saber que quem chamou não é dono dele. Seria roubo de fila
-- entre tenants — apontado pelo advisor de segurança na primeira aplicação.
revoke all on function public.claim_bulk_jobs(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_bulk_jobs(uuid, int) to service_role;

alter table public.group_bulk_jobs enable row level security;

-- Defesa em profundidade. A proteção REAL é o `.eq('tenant_id')` nas stores:
-- o caminho de escrita usa service-role, que bypassa RLS por desenho.
-- Padrão `app.has_membership` de propósito — a policy de group_grow_jobs usa
-- `current_setting('app.tenant_id')`, GUC que o app nunca seta, e por isso
-- nunca avalia verdadeiro.
drop policy if exists "group_bulk_jobs_tenant" on public.group_bulk_jobs;
create policy "group_bulk_jobs_tenant" on public.group_bulk_jobs
  for all
  using (app.has_membership(tenant_id))
  with check (app.has_membership(tenant_id));
