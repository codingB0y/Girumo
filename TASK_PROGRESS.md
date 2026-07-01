# Objetivo

Elevar o HubFlow a SaaS de alto nível: segurança, growth, automações, polish premium.

# Plano

## Sprint 1 — Segurança (P0) ✅
1. Rotacionar Service Role Key no Supabase
2. Fix middleware Bearer validation
3. Rate limiting em auth routes
4. Security headers

## Sprint 2 — Produto/Growth ✅ (parcial)
5. Feature gating por plano
6. Referral no painel + sidebar
7. Realtime notifications (Supabase Realtime)
8. Animated KPIs (count-up)
9. Banner ROI no dashboard
10. Mobile nav atualizada

## Sprint 3 — Premium Features (ATUAL)
11. Automações (sequências de nurturing, agendamento recorrente)
12. Realtime nos grupos (lead entra → toast animado)
13. Confetti no primeiro disparo (celebração milestone)
14. Email transacional (welcome, 24h sem conectar, trial acabando)
15. Gráfico semanal de crescimento (sparkline)

## Sprint 4 — Qualidade
16. Limpar stores legados
17. UI webhook config
18. Testes automatizados
19. Audit log impersonation
20. Funnel dashboard admin

---

# Checklist

## Sprint 1 — Segurança
- [!] 1. Rotacionar Service Role Key — PENDENTE USUÁRIO
- [x] 2. Fix middleware Bearer validation
- [x] 3. Rate limiting auth routes
- [x] 4. Security headers (CSP, HSTS, X-Frame, Permissions-Policy)

## Sprint 2 — Produto/Growth
- [x] 5. Feature gating por plano (assertPlanLimit em campanhas + broadcasts)
- [x] 6. Referral no painel + sidebar
- [x] 7. Realtime notifications (Supabase Realtime subscription)
- [x] 8. Animated KPIs (AnimatedNumber component)
- [x] 9. Banner ROI no dashboard (leads, cliques, taxa, disparos)
- [x] 10. Mobile nav atualizada (removido DS, adicionado Indicação/Disparos/Agenda)

## Sprint 3 — Premium Features
- [x] 11. Automações (store + API + página /painel/automacoes + templates)
- [x] 12. Realtime grupos (RealtimeToasts — toast quando lead entra)
- [x] 13. Confetti primeiro disparo (Confetti component + localStorage flag)
- [x] 14. Email transacional (Resend: welcome, nudge 24h, trial ending + cron diário)
- [x] 15. Gráfico semanal de crescimento (Sparkline SVG component no dashboard)

## Sprint 4 — Qualidade
- [ ] 16. Limpar stores legados
- [ ] 17. UI webhook config
- [ ] 18. Testes automatizados
- [ ] 19. Audit log impersonation
- [ ] 20. Funnel dashboard admin

---

# Em andamento

(nenhum — Sprint 3 completo)

---

# Decisões

- Rate limiting in-memory no middleware (Vercel single-instance; escalar → Upstash Redis)
- Bearer token validado via supabase.auth.getUser() no edge
- CSP permite Stripe JS + Supabase connections
- Auth shell dark premium (bg-breu + glassmorphism)
- Notifications: Supabase Realtime em vez de polling 30s
- AnimatedNumber: requestAnimationFrame + ease-out cubic 600ms
- ROI banner mostra leads/cliques/taxa/disparos do mês
- Feature gating: assertPlanLimit() antes de criar campanhas/broadcasts

---

# Arquivos alterados

- apps/web/src/middleware.ts (Bearer validation + rate limiting)
- apps/web/next.config.ts (security headers)
- apps/web/src/components/auth-shell.tsx (dark branding)
- apps/web/src/app/login/page.tsx (dark theme)
- apps/web/src/app/signup/page.tsx (dark theme)
- apps/web/src/app/forgot-password/page.tsx (dark theme)
- apps/web/src/components/signup-progress.tsx (dark theme)
- apps/web/src/app/api/campanhas/route.ts (assertPlanLimit)
- apps/web/src/app/api/broadcasts/route.ts (assertPlanLimit)
- apps/web/src/components/painel/sidebar.tsx (Indicação + removido DS)
- apps/web/src/app/painel/indicacao/page.tsx (novo)
- apps/web/src/components/painel/notification-bell.tsx (Supabase Realtime)
- apps/web/src/components/painel/animated-number.tsx (novo)
- apps/web/src/components/painel/mobile-nav.tsx (atualizado)
- apps/web/src/app/painel/page.tsx (ROI banner + AnimatedNumber + leads fetch)

---

# Próximos passos

Implementar item 11: Automações — sequências de nurturing e agendamento recorrente.
