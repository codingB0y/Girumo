-- Playbook "Primeiros 30 dias" (P1.8) — progresso do checklist por tenant.
--
-- Guarda a marcação dos passos. Os passos AUTOMÁTICOS são computados server-side
-- agregando stores existentes; esta tabela persiste os passos manuais e, por
-- write-through, os autos já atingidos (pra o progresso nunca regredir). Passos
-- definidos em código (src/lib/playbook/steps.ts), não no banco.
--
-- done_at é o único payload — sem updated_at/trigger; upsert idempotente.

create table if not exists playbook_progress (
  tenant_id  uuid        not null references organizations(id) on delete cascade,
  step_key   text        not null,
  done_at    timestamptz not null default now(),
  primary key (tenant_id, step_key)
);

alter table playbook_progress enable row level security;

-- RLS padronizada (app.user_tenant_ids(), padrão de 20260713100000). Defesa em
-- profundidade: o caminho ativo é service_role + filtro .eq('tenant_id'); estas
-- policies impedem que uma chave authenticated vazada leia/marque outro tenant.
drop policy if exists playbook_progress_select_member on playbook_progress;
create policy playbook_progress_select_member on playbook_progress
  for select to authenticated
  using (tenant_id = any (app.user_tenant_ids()));

drop policy if exists playbook_progress_insert_member on playbook_progress;
create policy playbook_progress_insert_member on playbook_progress
  for insert to authenticated
  with check (tenant_id = any (app.user_tenant_ids()));

drop policy if exists playbook_progress_update_member on playbook_progress;
create policy playbook_progress_update_member on playbook_progress
  for update to authenticated
  using (tenant_id = any (app.user_tenant_ids()))
  with check (tenant_id = any (app.user_tenant_ids()));
