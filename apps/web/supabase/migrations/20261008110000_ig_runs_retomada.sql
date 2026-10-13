-- Fase 3a dos Fluxos do Instagram: o direct que responde a um bloco que espera
-- retoma o run. `resumed_by` guarda o id do direct que retomou (único global,
-- como `source_id`): o reenvio do mesmo direct pela Zernio vira duplicado em
-- vez de abrir outro run e mandar um segundo convite.

alter table public.ig_runs add column if not exists resumed_by text;

create unique index if not exists ig_runs_resumed_by_uidx on public.ig_runs (resumed_by);

-- A busca roda em todo direct recebido; só run que espera resposta entra.
create index if not exists ig_runs_waiting_user_idx on public.ig_runs (tenant_id, ig_account_id, ig_user_id)
  where status = 'active' and waiting = 'reply';
create index if not exists ig_runs_waiting_username_idx on public.ig_runs (tenant_id, ig_account_id, username)
  where status = 'active' and waiting = 'reply';
