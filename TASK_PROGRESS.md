# Objetivo

Corrigir vulnerabilidades de segurança críticas identificadas pelo AppSec Engineer + Backend Architect.
Depois avançar para feature gating, growth, e qualidade.

# Plano

## Sprint 1 — Segurança (P0)
1. Rotacionar Service Role Key no Supabase
2. Fix middleware Bearer validation (validar token contra Supabase Auth)
3. Rate limiting em auth routes (login, signup, account)
4. Security headers (CSP, X-Frame-Options, HSTS)

## Sprint 2 — Produto/Growth
5. Feature gating por plano
6. Email nurturing (welcome + 24h sem conectar)
7. Referral no painel + sidebar
8. Funnel dashboard no admin

## Sprint 3 — Qualidade
9. Remover stores legados não usados
10. UI de webhook config no painel
11. Testes automatizados (auth + billing)
12. Audit log de impersonation
13. Remover /painel/ds da sidebar em produção

---

# Checklist

## Sprint 1 — Segurança
- [!] 1. Rotacionar Service Role Key (manual no Supabase Dashboard) — PENDENTE USUÁRIO
- [x] 2. Fix middleware — validar Bearer token contra Supabase Auth
- [x] 3. Rate limiting em /api/auth/* (5 tentativas/min login, 3 signup/min por IP)
- [x] 4. Security headers no next.config (CSP, HSTS, X-Frame, Permissions-Policy)

## Sprint 2 — Produto/Growth
- [ ] 5. Feature gating por plano
- [ ] 6. Email nurturing
- [ ] 7. Referral no painel
- [ ] 8. Funnel dashboard admin

## Sprint 3 — Qualidade
- [ ] 9. Limpar stores legados
- [ ] 10. UI webhook config
- [ ] 11. Testes automatizados
- [ ] 12. Audit log impersonation
- [ ] 13. Remover /painel/ds da sidebar

---

# Em andamento

[-] 5. Feature gating por plano

---

# Decisões

- Rate limiting in-memory no middleware (suficiente pra single-instance Vercel; se escalar, migrar pra Upstash Redis)
- Bearer token validado via supabase.auth.getUser() no middleware edge
- CSP permite Stripe JS + Supabase connections
- Auth shell rebrandado para dark premium (bg-breu + glassmorphism)

---

# Arquivos alterados

- apps/web/src/middleware.ts (Bearer validation + rate limiting)
- apps/web/next.config.ts (security headers)
- apps/web/src/components/auth-shell.tsx (dark branding)
- apps/web/src/app/login/page.tsx (dark theme)
- apps/web/src/app/signup/page.tsx (dark theme)
- apps/web/src/app/forgot-password/page.tsx (dark theme)
- apps/web/src/components/signup-progress.tsx (dark theme)

---

# Próximos passos

Iniciar item 2 (fix middleware Bearer). Item 1 é manual no dashboard.
