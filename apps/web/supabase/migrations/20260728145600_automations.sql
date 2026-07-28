-- ============================================================
-- Automations — automações do lojista (CRUD por tenant).
-- Sem esta tabela, apps/web/src/lib/stores/automations.ts faz throw em toda
-- operação (a página /painel/automacoes retornaria 500). A shape espelha
-- exatamente o tipo `Automation` do store.
--
-- Nota de escopo: por ora é só configuração persistida — ainda não há executor
-- que rode os `steps` automaticamente. Anti-ban (decisão Igor 28/07): nenhum
-- passo envia DM; toda mensagem é postada nos grupos.
-- ============================================================

create table if not exists automations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references organizations(id) on delete cascade,
  name         text not null,
  trigger      text not null check (trigger in (
                 'lead_entered', 'signup', 'group_full', 'weekly_recurring',
                 'group_stalled', 'no_connect_24h', 'trial_ending'
               )),
  enabled      boolean not null default true,
  steps        jsonb not null default '[]'::jsonb,
  total_runs   integer not null default 0,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists automations_tenant_created_idx
  on automations (tenant_id, created_at desc);

alter table automations enable row level security;

create policy "automations_tenant_isolation" on automations
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
