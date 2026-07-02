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

---

# Sessão 2026-07-02 — Redesign Landing (v2)

> Lane: Frontend+UI · Escopo: `apps/web/src/app/page.tsx` + `src/components/landing/v2/*` + `globals.css`

## Objetivo
Redesign completo da landing (awwwards-level): micro-animações GSAP, canvas de partículas "o fluxo",
scrollytelling do mecanismo, responsivo com fallback leve no mobile, SEO mantido/ampliado.

## Restrições
- Manter: logo/logotipo, íris #6A4BF0 primário (pode complementar).
- Verde só semântico (WhatsApp/pessoas/sucesso) — nunca ação.
- Sem copy de "medo de ban" (regra durável da lane).
- `logo.tsx` e `icons.tsx` intactos (painel/auth-shell usam).
- Sem Three.js (peso mobile) — canvas 2D custom + GSAP.
- Fontes: reusar as já carregadas (Instrument Serif display, Plex Sans body, Plex Mono data).

## Etapas
- [x] Explorar landing atual, tokens, componentes, primer da lane
- [x] Instalar gsap (apps/web)
- [x] Tokens/utilities `lp-*` no globals.css
- [x] Componentes v2: flow-canvas, nav, landing-fx (GSAP central), mechanism, pricing, faq, group-wall
- [x] Reescrever page.tsx (copy nova + SEO)
- [x] Build + lint + verificação visual (desktop 1366/1440 + mobile 375)

## Decisões
- GSAP importado dinamicamente no client pra não pesar LCP; entrada do hero em CSS puro.
- Canvas do hero: 130 partículas desktop, DPR cap 1.5, pausa fora da viewport; mobile/reduced-motion/deviceMemory≤2 → não monta (glow CSS por trás).
- Scrollytelling: texto + visual sticky em 3 atos (ScrollTrigger toggla .is-active); mobile → visual embutido em cada ato.
- **Conflito importante:** `html { scroll-behavior: smooth }` + ScrollTrigger = scrolls fantasmas nos refresh/restore.
  Fix em landing-fx.tsx: scrollBehavior "auto" enquanto FX ativa + âncoras suaves via JS + `ScrollTrigger.clearScrollMemory("manual")` + `ignoreMobileResize`.
- Nós do canvas desenhados em source-over (blend "lighter" acumula brilho em elemento estático até estourar).
- Componentes antigos da landing ficam no lugar sem uso (flow-visual, product-frame, interactive, pricing antigo, etc.); logo.tsx/icons.tsx seguem usados pelo painel. Limpeza em passada futura.

## Fixes colaterais (bloqueavam o build, pré-existentes)
- `painel/page.tsx`: import faltante de SocialProof.
- `api/admin/seed/route.ts` + `seed/dev/route.ts`: prefer-const em planIds.
- `dev-mode-banner.tsx`: useEffect condicional (rules-of-hooks) — early return movido pra depois dos hooks.

## Resultado
- `npm run build` ✅ · `tsc --noEmit` ✅ · eslint landing v2 ✅
- Verificado no preview: hero+canvas, ticker, 3 atos do mecanismo, painel+bento, depoimentos, planos, FAQ, muro de grupos, footer, menu mobile, CTA fixo mobile.

## Iteração v2.1 (feedback Igor, mesma sessão)
- **Tipografia SaaS/tech:** Instrument Serif → Space Grotesk bold (`--font-tech`) em todos os headings.
- **Menos íris (ref. zavu.dev):** base neutra `#07080f`, CTA primário BRANCO (padrão Linear/Vercel),
  headlines two-tone (branco + cinza), partículas do canvas neutras (verde só na chegada), íris restrito à logo.
- **Prints do painel removidos** → `features.tsx`: bento de mock-UIs feitas à mão (status entregue/na fila,
  calendário, biblioteca, barras de receita por origem, auto-criação, chat da IA).
- **Depoimentos removidos** (pareciam falsos) → `compare.tsx`: SEM × COM HubFlow + calculadora interativa
  de "dinheiro deixado na mesa" (sliders leads/dia, ticket, conversão; premissa 35% declarada).
- **Nova seção `lp-showcase.tsx`:** modelos de landing page de captação em frame de celular,
  3 temas de marca trocáveis (Moda/Eletrônicos/Beleza).
- **Pricing v2.1:** anual default com preço riscado + economia em R$, card destaque com anel gradiente
  (double background padding-box/border-box — pseudo com z-index -1 pinta ACIMA do bg do pai, não usar).
- Build ✅ após reforma. Branch `landing-v2-redesign` + PR aberto.
