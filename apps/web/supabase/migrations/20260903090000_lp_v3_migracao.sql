-- 03/09/2026 - Paginas v3, Fase 2: migracao v2 -> v3. A rota POST /api/pages/{id}/migrate
-- converte o content editorial v2 em secoes v3 (template acesso-vip) e guarda a v2
-- original em `content_before_v3` para reversao manual (spec 14/07 s15). A copia e
-- sempre a PRIMEIRA v2 (reverter e migrar de novo nao a sobrescreve). Idempotente:
-- pode rodar duas vezes.

alter table public.landing_pages
  add column if not exists content_before_v3 jsonb;
alter table public.landing_pages
  add column if not exists migrated_to_v3_at timestamptz;

comment on column public.landing_pages.content_before_v3 is
  'Copia da primeira versao v2 anterior a migracao para v3 (reversao manual, spec 14/07 s15).';
comment on column public.landing_pages.migrated_to_v3_at is
  'Quando a pagina migrou de v2 para v3 pela rota /api/pages/{id}/migrate.';

-- Templates v3 novos da Fase 2. `component_key` nao decide render em v3 (a selecao e por
-- schema_version); fica como marcador do motor de secoes, igual ao evento-ao-vivo.
insert into public.landing_page_templates (slug, name, component_key, niche, default_copy, required_fields)
select 'acesso-vip', 'Acesso VIP', 'sections', 'atacado-moda', '{}'::jsonb, '{}'::text[]
where not exists (select 1 from public.landing_page_templates where slug = 'acesso-vip');

insert into public.landing_page_templates (slug, name, component_key, niche, default_copy, required_fields)
select 'lista-de-espera', 'Lista de espera', 'sections', 'atacado-moda', '{}'::jsonb, '{}'::text[]
where not exists (select 1 from public.landing_page_templates where slug = 'lista-de-espera');

-- Rollback (manual):
--   alter table public.landing_pages drop column if exists content_before_v3;
--   alter table public.landing_pages drop column if exists migrated_to_v3_at;
--   delete from public.landing_page_templates where slug in ('acesso-vip', 'lista-de-espera');
