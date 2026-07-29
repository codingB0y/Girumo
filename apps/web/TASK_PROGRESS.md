# Objetivo

Corrigir vulnerabilidades de seguranca criticas identificadas pelo AppSec Engineer + Backend Architect.
Depois avancar para feature gating, growth, e qualidade.

# Plano

## Sprint 1 - Seguranca (P0)
1. Rotacionar Service Role Key no Supabase
2. Fix middleware Bearer validation (validar token contra Supabase Auth)
3. Rate limiting em auth routes (login, signup, account)
4. Security headers (CSP, X-Frame-Options, HSTS)

## Sprint 2 - Produto/Growth
5. Feature gating por plano
6. Email nurturing (welcome + 24h sem conectar)
7. Referral no painel + sidebar
8. Funnel dashboard no admin

## Sprint 3 - Qualidade
9. Remover stores legados nao usados
10. UI de webhook config no painel
11. Testes automatizados (auth + billing)
12. Audit log de impersonation
13. Remover /painel/ds da sidebar em producao

---

# Checklist

## Sprint 1 - Seguranca
- [!] 1. Rotacionar Service Role Key (manual no Supabase Dashboard) - ACAO DO USUARIO
- [x] 2. Fix middleware - validar Bearer token contra Supabase Auth
- [x] 3. Rate limiting em /api/auth/* (5 tentativas/min login, 3 signup/min por IP)
- [x] 4. Security headers no next.config (CSP, HSTS, X-Frame, Permissions-Policy)

## Sprint 2 - Produto/Growth
- [ ] 5. Feature gating por plano
- [ ] 6. Email nurturing
- [ ] 7. Referral no painel
- [ ] 8. Funnel dashboard admin

## Sprint 3 - Qualidade
- [ ] 9. Limpar stores legados
- [ ] 10. UI webhook config
- [ ] 11. Testes automatizados
- [ ] 12. Audit log impersonation
- [ ] 13. Remover /painel/ds da sidebar

---

# Em andamento

Sprint 1 concluido (exceto item 1 que depende do usuario).

---

# Decisoes

| # | Decisao | Motivo |
|---|---------|--------|
| 1 | Rate limit in-memory (Map) no middleware | Edge runtime nao suporta Redis. Suficiente pra single-instance Vercel. |
| 2 | Bearer validado via supabase.auth.getUser() | Unica forma confiavel de validar JWT do Supabase sem shared secret |
| 3 | CSP com unsafe-inline/unsafe-eval | Next.js precisa pra inline styles e HMR. Stripe precisa de frame-src |
| 4 | Rate limit por IP (x-forwarded-for) | Vercel sempre passa o header. Suficiente pra brute-force basico |

---

# Arquivos alterados

| Arquivo | Tipo | Mudanca |
|---------|------|--------|
| apps/web/src/middleware.ts | EDITADO | Bearer validation + rate limiting |
| apps/web/next.config.ts | EDITADO | Security headers (CSP, HSTS, X-Frame, etc) |

---

# Proximos passos

1. Usuario rotacionar Service Role Key no Supabase Dashboard
2. Commit + push das correcoes de seguranca
3. Iniciar Sprint 2 (feature gating por plano)

---

# 🚀 SPRINT 4 — HubFlow Pages (Módulo Novo)

## Objetivo
Criar módulo "HubFlow Pages" — landing pages com templates prontos integradas ao funil WhatsApp. Lojista publica em `hubflow.com.br/p/{slug}`, lead preenche nome+tel ANTES de entrar no grupo.

## Restrições firmes
- ❌ NÃO codar até 3 squads aprovarem
- ❌ NÃO definir pricing
- ❌ NÃO tocar landing page atual
- ❌ LPs complementam links (não substituem)

## Briefing
- 📄 `apps/web/docs/hubflow-pages/BRIEFING.md` (master doc)
- 🎯 `apps/web/docs/hubflow-pages/PRODUCT_SQUAD_MISSION.md` (decisões produto)
- ⚙️ `apps/web/docs/hubflow-pages/BACKEND_SQUAD_MISSION.md` (viabilidade técnica)
- 📈 `apps/web/docs/hubflow-pages/GROWTH_SQUAD_MISSION.md` (estratégia growth)
- 🗄️ `docs/hubflow-pages/SQUAD_OS_MISSIONS.sql` (insere missões no Squad OS)

## Checklist Sprint 4
- [ ] Product Squad revisar 5 decisões (Lead Data First, Templates, LGPD, Editor, Aha Moment)
- [ ] Backend Squad validar 7 pontos (Render, Schema, Tracking, Domain, Mobile, Privacidade, WhatsApp)
- [ ] Growth Squad avaliar 6 estratégias (SEO, Copy, Aha, Onboarding, Tracking, PLG)
- [ ] Consolidar plano de implementação após 3 aprovações
- [ ] Schema Supabase com RLS
- [ ] Render via Next.js ISR /p/[slug]
- [ ] 5-7 templates prioritários
- [ ] Editor simples com preview ao vivo
- [ ] Tracking server-side (CAPI + GA4 MP + TikTok)
- [ ] LGPD: consent_at + IP hash + exclusão
- [ ] Dashboard do cliente: métricas da LP

## Próxima ação
Quando você me chamar, **não começar codando**. Primeiro verificar se os 3 squads já responderam nas missões. Se sim, consolidar plano. Se não, lembrete pra eles.
