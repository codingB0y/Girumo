-- 03/09/2026 - Paginas v3, Fase 3: modelo "Vitrine" (direcao vitrine). So o registro do
-- modelo: a tela de criacao casa `content.template` com o `slug` desta tabela para mandar
-- `template_id` no POST /api/pages, entao sem esta linha o modelo aparece na galeria e
-- recusa ao salvar ("modelo ainda nao esta cadastrado no banco").
--
-- Nao ha DDL nesta fase: `structure` ja aceita qualquer chave por regex e
-- `visual_direction` ja tem 'vitrine' no CHECK desde a Fase 1. Idempotente.

insert into public.landing_page_templates (slug, name, component_key, niche, default_copy, required_fields)
select 'vitrine', 'Vitrine', 'sections', 'varejo', '{}'::jsonb, '{}'::text[]
where not exists (select 1 from public.landing_page_templates where slug = 'vitrine');

-- Rollback (manual):
--   delete from public.landing_page_templates where slug = 'vitrine';
