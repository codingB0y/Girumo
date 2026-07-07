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

---

# Flow Pages — MVP em 4 sessões (briefing aprovado 2026-07-02)

## Sessão 0 — Análise ✅
Crítica ao briefing (8 pontos), stack confirmada, DDL corrigido, contratos, spec dos templates.
Decisões aprovadas: campaign_slug→/r/{slug} preferido; slug com sufixo; métricas via events;
retenção 90d; TikTok só coluna; briefing supersede trava "squads aprovarem".

## Sessão 1 — Schema + render mínimo ✅
- [x] Migração `20260702120000_flow_pages.sql` (4 tabelas lp_*, RLS padrão organizations/current_setting, RPC, seed 3 templates)
- [x] `lib/pages/{schema,slug,store}.ts` (validação sem Zod, E.164 BR, slug anti-squatting, store server-only)
- [x] APIs: GET/POST /api/pages · GET /api/pages/templates · GET /api/p/[slug] · GET /api/p/health
- [x] `/p/[slug]` ISR (unstable_cache tag lp:{slug}) + BasicTemplate mobile-first
- [x] Middleware: matcher exclui `p/` e `api/p/` (públicos)
- [x] Contratos registrados em `system/API_CONTRACTS.md`
- Divergências do briefing: tabelas `lp_leads`/`lp_tracking_events` (colisão com leads/engine legados);
  rotas públicas em `/api/p/*` (POST /api/leads JÁ É rota da engine com x-engine-token)
- CSP: `/p/*` ganhou CSP própria no next.config (img-src https: pra foto do lojista + domínios
  Meta/GA4 pré-liberados pra sessão 4); global intacta (source `/((?!p/).*)`)
- Infra descoberta: `.env.local` aponta pro projeto **hubflow-dev** (wfju...), CLI linkado no
  **hubflow-production** (nido...). Migração aplicada NOS DOIS (dev via link temporário + migration
  repair das 5 antigas; relinkado em produção no fim)
- Armadilha PostgREST: `select(head:true)` NÃO retorna erro de tabela inexistente — health usava e mentia
- LP demo publicada no dev: `/p/loja-demo-hf01` (validação e2e; remover quando quiser)

## Sessão 2 — Templates ✂️ CORTADA (decisão Igor: só o BasicTemplate; registry já mapeia os 3 component_keys pra ele)

## Sessões 3+4 — Editor + Tracking + Métricas ✅ (2026-07-02)
- [x] GET/PATCH `/api/pages/[id]` (detalhe+métricas+20 leads / edição+publish com revalidateTag)
- [x] POST `/api/p/track` (beacon PageView/GroupJoin, 204 sempre, bot-filter, rate 30/min)
- [x] POST `/api/p/lead` (E.164 BR, consent obrigatório + snapshot, ip_hash, honeypot, dedup upsert, rate 5/min) → {redirect_url}
- [x] `tracking-scripts.tsx` (UTMs→sessionStorage, beacon, Meta Pixel + GA4 condicionais) + `lead-form.tsx` (LGPD, sucesso→Entrar no grupo→GroupJoin)
- [x] Editor: `/painel/pages/nova` (form 7 campos + preview ao vivo com o componente real), `/painel/pages` (lista), `/painel/pages/[id]` (publicar/pausar/copiar link/métricas/leads/edição), sidebar "Páginas"
- [x] E2E validado: PageView→Lead→GroupJoin no banco; dedup, sem-consent 400, zap inválido 400, honeypot silencioso, bot 204 sem gravar; lead via UI real com UTM da URL
- **Bug real encontrado:** CSP da /p sem 'unsafe-eval' mata a hidratação no DEV (Turbopack usa eval) —
  form degrada pra submit GET nativo. Fix: 'unsafe-eval' só em development no next.config.
- Build produção EXIT=0 · tsc limpo · eslint limpo

---

# Sessão 2026-07-06 — Redesign premium /painel (ui-ux-pro-max)

> Lane: Frontend+UI · Escopo: `src/app/painel/**`, `src/components/painel/*`, `src/components/ui/*`, `globals.css`
> Fora de escopo: backend/API, landing, admin.

## Objetivo
Interface do cliente em nível SaaS premium — usuário sente que "paga barato". Cores, tipografia,
motion, primitivos. Ideação via subagentes (não-template).

## Etapas
- [x] 1. Mapeamento (30 páginas painel, primitivos ui/*, tokens hf-* atuais)
- [x] 2. Design system base via script do skill (guard-rails, não estética)
- [x] 3. Ideação subagentes (UI Designer → conceito "O Balcão" · Whimsy → motion "ease-fluxo")
- [x] 4. Síntese da direção (O Balcão + assinaturas: fio de íris, etiqueta, Aurora VIP, romaneio)
- [x] 5. Tokens + motion layer no globals.css (namespace pn-*)
- [x] 6. Primitivos ui/* (button, card, input, skeleton; badge mantido pílula)
- [x] 7. Shell (sidebar, topbar, mobile-nav, page-transition, command palette)
- [x] 8. Dashboard /painel
- [x] 9. Telas quentes (grupos + campanhas + resultados; extra: contatos, conectar)
- [~] 10. A11y + build limpo — build/lint limpos ✅; a11y aplicado por tela conforme redesenhadas
        (aria-label em buscas etc.). Pass final de a11y quando as ~16 telas restantes terminarem.

## Decisões
- Íris mantido como âncora de marca (regra durável da lane); verde só sucesso.
- **Conceito "O Balcão"** (UI Designer subagente): estoque escuro (sidebar gradiente breu→breu-2)
  + balcão claro (conteúdo bg-balcao #edeaf1 re-temperado). Namespace `pn-*` no globals.css.
- **Assinaturas:** fio de íris (`.pn-ativo`, inset 2px) = único padrão de "ativo"; etiqueta canto-cortado
  (`.pn-etiqueta`); Aurora VIP (`.pn-aurora`, 1 peça escura/tela: card de plano + Peça Escura do dashboard);
  romaneio (números Plex Mono tabular); numeração editorial de seção (Instrument Serif itálico 01/02/03).
- **Tipografia:** número = Plex Mono tabular; voz do produto = Instrument Serif itálico; título = Bricolage;
  label = Space Grotesk uppercase; corpo = Plex Sans.
- **Motion "ease-fluxo"** (Whimsy subagente): família de easings + tokens dur-*; skeleton respira,
  status conectado respira (parado = alarme), toast lead 4 batidas (`pn-toast-in`/`pn-ping` prontos p/ uso).
- Primitivos ui/* compartilhados c/ admin → mudança sóbria e não-quebrante; ousadia fica nos componentes
  painel-específicos. Badge mantido pílula (etiqueta é padrão local via `.pn-etiqueta`).

## Resultado
- `npm run web:build` ✅ (tabela de rotas completa; 2º run deu OOM só por rodar build 2x). `web:lint` ✅ (0 erro).
- Verificado no preview (localhost, tenant Moda dev): Aurora VIP, card bancada (#fcfbfe + sombra 3 camadas +
  realce interno), editorial Instrument Serif itálico #5b6172, sidebar gradiente dark, fio de íris no ativo.
- Armadilha .next dev×build reincidiu (build de prod clobberou .next do dev) → limpeza + restart resolveu.
- Screenshot trava por animações infinitas (pn-respira) — validação via preview_inspect (mais confiável).
- NÃO verificado visualmente: FullDashboard conectado (session.live=false no dev) — compila e usa primitivos
  já verificados. Peça Escura/KPIs/romaneio dependem de sessão WhatsApp ativa.

## Arquivos alterados
- globals.css (camada pn-* : tokens balcão, sombras, ease-fluxo, etiqueta, aurora, keyframes + reduced-motion)
- ui/{button,card,input,skeleton}.tsx (primitivos premium; badge mantido)
- painel/{sidebar,topbar,mobile-nav,page-transition,empty-state}.tsx + command-palette.tsx (shell)
- painel/layout.tsx (bg-bruma→bg-balcao) · painel/page.tsx (bento Peça Escura + romaneio + editorial + fix typo `n`/emojis→Lucide)

## Iteração 2 (mesma sessão) — Nova paleta COBALTO + telas internas

**Paleta nova (decisão Igor: "ousada"):** roxo íris → **cobalto/azul-índigo elétrico**.
- Arquitetura: família `iris` saiu do `@theme inline` → foi p/ `@theme` normal (var-based). Default roxo.
  `.pn-root` (no painel/layout.tsx) sobrescreve p/ cobalto: iris `#3d5af1`, claro `#6b81f7`, escuro `#2237a8`, light `#e9edfe`.
- **Por que escopo e não trocar o token:** admin usa `iris` em 65 lugares + logo da landing usa. Trocar global
  quebraria os dois. `.pn-root` recolore SÓ o painel (cascade atinge até primitivos compartilhados); admin/landing ficam roxos.
- VERIFICADO ao vivo: painel = rgb(61,90,241) cobalto · landing = rgb(106,75,240) roxo intacto.
- button.tsx virou token-based (hover:brightness, sem hex literal) p/ o escopo funcionar no primitivo compartilhado.
- Barras de capacidade com `#6A4BF0` literal → `#3D5AF1` (grupos, campanhas x3, plan-gate).
- pn-* literais roxos → cobalto (aurora, ativo via var, card-hover, shadow-pn-escura).

**Telas internas — status:**
- ✅ Redesenhadas (O Balcão completo): dashboard (/painel), **grupos**, **campanhas (lista)**,
  **resultados**, **contatos**, **conectar** (onboarding + painel QR escuro).
- ⏳ FALTAM (~16, layout antigo mas JÁ em cobalto + primitivos premium): campanhas/nova,
  campanhas/[slug], campanhas/[slug]/editar, configuracoes(+webhooks,cancelar),
  pages(+nova,[id]), indicacao, biblioteca, agenda, disparos, automacoes, squad-os/*, dev-tools.

## Checklist — Redesign O Balcão (telas internas)
- [x] dashboard (/painel)
- [x] grupos
- [x] campanhas (lista)
- [x] resultados
- [x] contatos
- [x] conectar
- [ ] campanhas/nova
- [ ] campanhas/[slug]
- [ ] campanhas/[slug]/editar
- [ ] configuracoes
- [ ] configuracoes/webhooks
- [ ] configuracoes/cancelar
- [ ] pages
- [ ] pages/nova
- [ ] pages/[id]
- [ ] indicacao
- [ ] biblioteca
- [ ] agenda
- [ ] disparos
- [ ] automacoes
- [ ] squad-os
- [ ] squad-os/agents
- [ ] squad-os/knowledge
- [ ] squad-os/missions
- [ ] squad-os/setup
- [ ] squad-os/squads
- [ ] squad-os/squads/[slug]
- [ ] dev-tools

## Iteração 3 (Sessão 2026-07-07) — 4 telas quentes no O Balcão
- campanhas/resultados/contatos/conectar redesenhadas seguindo o template de 8 passos (baseado em grupos).
- Padrões aplicados: header display+editorial itálico, `pn-card`/`pn-card-hover`, `pn-poco`+`pn-fill` (scaleX)
  nas barras, `pn-skeleton`, romaneio `divide-dashed` nas tabelas, números `font-data tabular-nums`,
  empty/voz do produto em `font-editorial italic`, busca com anel `focus:shadow var(--color-iris-light)`.
- Cor 100% via token (cobalto automático no `.pn-root`); único hex literal trocado: barra funil/campanha → `#3D5AF1`.
- Botões primários: removido `shadow-iris` (glow roxo literal) → `hover:brightness-110` + ease-fluxo.
- Verificado: `web:lint` 0 erro · `web:build` EXIT 0 (armadilha .next dev×build reincidiu → `rm -rf .next` + rebuild limpo resolveu). NÃO verificado ao vivo (preview autenticado; sistema pn-* já validado visualmente na sessão anterior).

**HANDOFF → próxima sessão:** replicar o template de `grupos/page.tsx` nas telas ⏳. Padrão O Balcão:
  1. container `space-y-8 px-4 py-8 sm:px-8`
  2. header: `<h1 font-display text-[28px] font-extrabold tracking-[-0.02em] text-breu>` + `<p font-editorial text-[19px] italic text-ardosia>`
  3. cards `bg-white`/`rounded-3xl` → `pn-card rounded-2xl`; insets/inputs → `bg-poco` `.pn-poco`
  4. números → `font-data tabular-nums`; labels → `font-data uppercase tracking-[0.08em]`
  5. listas → `divide-dashed` (romaneio); status → pílula ou `.pn-etiqueta`; barra → `.pn-fill`/`.pn-poco`
  6. empty/voz do produto → `font-editorial italic`; loading → `.pn-skeleton`
  7. cor já é automática (tokens iris = cobalto no painel). NÃO usar hex roxo literal.
  8. build (heap: rodar só 1x) + lint + preview_inspect. Armadilha .next dev×build: se preview 500, `rm -rf apps/web/.next` + restart.
