-- ============================================================
-- Girumo LP v2 — Fase 5: rollout
-- Base: 20260715090000_lp_v2.sql (já aplicada). Aditiva e repetível.
-- Reversível: bloco de ROLLBACK comentado no fim.
-- ============================================================

-- 1) BACKFILL da mentira do default
-- `content_schema_version` entrou com `not null default 2`, então TODA linha que
-- já existia foi marcada como v2 sem o conteúdo ter mudado — inclusive as páginas
-- legadas do Flow Pages v1. Nada quebrou porque o render decide pelo
-- `content->>'schema_version'` e ignora a coluna (decisão travada na Fase 2), mas
-- a coluna precisa dizer a verdade: alguém vai confiar nela um dia.
update landing_pages
   set content_schema_version = 1
 where not (content ? 'schema_version')
   and content_schema_version <> 1;

-- 2) MODELO ÚNICO ("Oferta Impacto")
-- Os 3 seeds do v1 (promo-relampago/sorteio-premio/catalogo-grupo) continuam
-- existindo: as páginas legadas apontam pra eles e é o `component_key` deles que
-- escolhe o BasicTemplate no render. Apagá-los ou renomeá-los mudaria a página de
-- quem está no ar. O v2 tem estrutura única (§3), então entra UM template novo, e
-- é ele que as páginas novas usam. Os antigos morrem por desuso, não por delete.
insert into landing_page_templates (slug, name, niche, component_key, default_copy, required_fields, thumbnail_url)
select 'oferta-impacto',
       'Oferta Impacto',
       'atacado-moda',
       'conversion',
       '{"headline":"Peças novas toda semana no grupo","description":"Entre no grupo e receba os drops com preço de atacado."}'::jsonb,
       array['store_name','headline','description','cta','hero','gallery'],
       null
 where not exists (select 1 from landing_page_templates where slug = 'oferta-impacto');

-- ============================================================
-- ROLLBACK (reversível) — descomente para reverter:
--   delete from landing_page_templates where slug = 'oferta-impacto'
--     and not exists (select 1 from landing_pages p
--                      where p.template_id = landing_page_templates.id);
--   -- O backfill NÃO se desfaz: ele corrigiu dado errado. Reverter significaria
--   -- voltar a marcar página legada como v2, que é a mentira original.
-- ============================================================
