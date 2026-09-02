-- 02/09/2026 - Paginas v3 (secoes). Uma pagina v3 grava em `landing_pages.structure`
-- a CHAVE DO TEMPLATE (evento-ao-vivo, promo-relampago, ...) e em `visual_direction`
-- a direcao visual (impacto, editorial, vitrine). Os checks de 15/07 fixavam os
-- valores da editorial v2 ('conversion' / 'premium'); passam a aceitar o mesmo
-- formato que o render-context valida (regex) e a lista de direcoes. `lp_captures`
-- ja era texto livre e nao muda. Idempotente: pode rodar duas vezes.

alter table public.landing_pages
  drop constraint if exists landing_pages_structure_check;
alter table public.landing_pages
  add constraint landing_pages_structure_check
  check (structure ~ '^[a-z0-9-]{3,40}$');

alter table public.landing_pages
  drop constraint if exists landing_pages_visual_direction_check;
alter table public.landing_pages
  add constraint landing_pages_visual_direction_check
  check (visual_direction in ('premium', 'editorial', 'impacto', 'vitrine'));

-- Registro do template v3 que ainda nao existia (promo-relampago ja existe desde o
-- Flow Pages v1 e e reaproveitado pela chave). `component_key` nao decide render em
-- v3 (a selecao e por schema_version); fica como marcador do motor de secoes.
insert into public.landing_page_templates (slug, name, component_key, niche, default_copy, required_fields)
select 'evento-ao-vivo', 'Evento ao vivo', 'sections', 'lancador', '{}'::jsonb, '{}'::text[]
where not exists (select 1 from public.landing_page_templates where slug = 'evento-ao-vivo');

-- Rollback (manual):
--   alter table public.landing_pages drop constraint if exists landing_pages_structure_check;
--   alter table public.landing_pages add constraint landing_pages_structure_check check (structure in ('conversion'));
--   alter table public.landing_pages drop constraint if exists landing_pages_visual_direction_check;
--   alter table public.landing_pages add constraint landing_pages_visual_direction_check check (visual_direction in ('premium'));
--   delete from public.landing_page_templates where slug = 'evento-ao-vivo';
