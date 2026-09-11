-- Biblioteca de copys: substitui a "category" fixa de `templates` por pastas
-- de verdade (`template_folders`), nomeáveis e criáveis pelo tenant.
--
-- `templates` já usa o padrão moderno de RLS (Pattern B — membros leem,
-- owner/admin/operator escrevem — via app.user_tenant_ids()/
-- app.user_operator_tenant_ids(), definidos em 20260713100000_rls_standardization.sql).
-- template_folders replica o mesmo padrão.
--
-- Backfill: dev tinha 5 linhas de seed com categorias soltas (drop, promocao,
-- reativacao, pos-venda) de um único tenant; prod estava vazia (0 linhas). O
-- backfill cria uma pasta por (tenant_id, category) existente e liga cada
-- template a ela antes de tornar folder_id NOT NULL e derrubar category — é
-- no-op onde não há linha nenhuma.

create table if not exists template_folders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists idx_template_folders_tenant on template_folders(tenant_id);

alter table template_folders enable row level security;

create policy template_folders_select_member on template_folders
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
create policy template_folders_insert_operator on template_folders
  for insert to authenticated with check (tenant_id = any (app.user_operator_tenant_ids()));
create policy template_folders_update_operator on template_folders
  for update to authenticated
  using (tenant_id = any (app.user_operator_tenant_ids()))
  with check (tenant_id = any (app.user_operator_tenant_ids()));
create policy template_folders_delete_operator on template_folders
  for delete to authenticated using (tenant_id = any (app.user_operator_tenant_ids()));

alter table templates add column if not exists folder_id uuid references template_folders(id) on delete cascade;

insert into template_folders (tenant_id, name)
select distinct tenant_id, category from templates
on conflict (tenant_id, name) do nothing;

update templates t
set folder_id = f.id
from template_folders f
where f.tenant_id = t.tenant_id and f.name = t.category and t.folder_id is null;

alter table templates alter column folder_id set not null;
alter table templates drop column if exists category;

create index if not exists idx_templates_folder on templates(folder_id);
