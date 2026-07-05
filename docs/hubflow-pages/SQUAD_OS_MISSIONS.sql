-- Missões do Squad OS para revisão do briefing "HubFlow Pages"
-- Data: 2026-07-02
-- Origem: conversa Igor
-- Referência: docs/hubflow-pages/BRIEFING.md

-- IMPORTANTE: o squad_id abaixo são PLACEHOLDERS. Substituir pelos IDs reais
-- (rodar: SELECT id, slug, name FROM squads WHERE slug IN ('product', 'growth', 'backend');)

INSERT INTO missions (squad_id, workspace_id, title, description, status, priority)
VALUES
  (
    (SELECT id FROM squads WHERE slug = 'product' LIMIT 1),
    'default',
    'Revisar briefing HubFlow Pages — escopo de produto',
    'Ler apps/web/docs/hubflow-pages/PRODUCT_SQUAD_MISSION.md. Responder às 5 decisões: (1) Lead Data First, (2) Templates por gatilho psicológico, (3) Anti-spam LGPD, (4) Editor simples vs drag-and-drop, (5) Aha Moment trigger. Entregar: resposta ✅/❌/🤔 + sugestões + riscos + ordem recomendada dos 7 templates.',
    'pending',
    2
  ),
  (
    (SELECT id FROM squads WHERE slug = 'backend' LIMIT 1),
    'default',
    'Validar viabilidade técnica do HubFlow Pages',
    'Ler apps/web/docs/hubflow-pages/BACKEND_SQUAD_MISSION.md. Validar 7 pontos: (1) Render via ISR, (2) Schema Supabase com RLS, (3) Tracking server-side CAPI/GA4/TikTok, (4) Custom domain via Vercel, (5) Performance mobile, (6) LGPD/privacidade, (7) Integração WhatsApp. Entregar: estimativa de esforço + diagrama de fluxo.',
    'pending',
    2
  ),
  (
    (SELECT id FROM squads WHERE slug = 'growth' LIMIT 1),
    'default',
    'Estratégia growth do HubFlow Pages',
    'Ler apps/web/docs/hubflow-pages/GROWTH_SQUAD_MISSION.md. Avaliar 6 estratégias: (1) SEO automático, (2) Biblioteca de Copy por nicho, (3) Aha Moment, (4) Onboarding, (5) Tracking como diferencial, (6) PLG via LPs indexadas. Entregar: North Star Metric + funil de ativação + plano de lançamento.',
    'pending',
    2
  )
ON CONFLICT DO NOTHING;
