# PROJECT_CONTEXT.md — Mapa/índice do HubFlow

> **Objetivo:** evitar reler o projeto. Antes de abrir arquivos, consulte este mapa e vá direto no alvo.
> **Regra:** nunca ler o projeto inteiro. Planejar → listar (glob/grep) → abrir só o necessário → resumir →
> continuar. Ao aprender algo novo/estável, **atualize este arquivo** em vez de deixar só na conversa.
> Diagnóstico completo (arquitetura, riscos, backlog): ver [AUDIT_REPORT.md](AUDIT_REPORT.md).
> Última atualização: 2026-07-03.

## O que é
SaaS multi-tenant de captação via WhatsApp. Loop: anúncio (link rastreado) → entra no grupo → engine
detecta = lead → boas-vindas → disparos/campanhas → billing por plano. **Em produção.**

## Monorepo (npm workspaces)
- `apps/web` — Next.js 15 (App Router) + React 19 + Tailwind v4 + TS strict. ⭐ app principal.
- `hubflow-engine` — Node CommonJS + Baileys 7 carregado por `import()` explícito. Engine WhatsApp (sem banco).
- Resíduos/legado (não mexer sem confirmar): `hubflow-groups/` (projeto predecessor), `api/server.js`,
  `packages/shared`, `apps/web/prisma`, `apps/web/nextjs-claude-code-starter`, `apps/web/apps/web`.

## Onde fica cada coisa (alvo direto)
| Preciso de… | Vá em |
|---|---|
| Rotas de página | `apps/web/src/app/painel/*` (PT, atual) · `admin/*` · `p/[slug]` (Flow Pages) · `(app)/*` (⚠️ EN legado) |
| API HTTP (84 rotas) | `apps/web/src/app/api/*/route.ts` |
| Auth/sessão | `apps/web/src/lib/auth.ts` (cookie HMAC `dz_session`) · `middleware.ts` · `lib/supabase/tenant-context.ts` |
| Clients Supabase | `apps/web/src/lib/supabase/server.ts` (admin/anon/token) |
| Stores de dados (Supabase) | `apps/web/src/lib/stores/*.ts` — SEMPRE filtram `.eq('tenant_id')` |
| Stores legados JSON (fallback efêmero) | `apps/web/src/lib/*-store.ts` — particionados em `tenants/<uuid>/` |
| Billing/Stripe | `apps/web/src/lib/billing/*` · `api/billing/webhook/route.ts` (idempotente) |
| Emails | `apps/web/src/lib/email/*` + cron `api/cron/emails` |
| Schema base | `infra/migrations/202606240001_base_schema.sql` · RLS `infra/rls/…0002…sql` |
| Migrações novas | `apps/web/supabase/migrations/*` (admin, funnel, templates, flow_pages) |
| Engine | `hubflow-engine/index.js` (produção, 896 LOC) + `anti-ban-queue.js` + `queues/supabase-command-worker.js`; variantes `index-dev*`/`dev-mode`. Auditoria: `hubflow-engine/ENGINE_AUDIT.md` |
| Deploy | `apps/web/vercel.json` (2 crons) · `deploy/coolify/*` (engine) · `infra/scripts/*.ps1` |
| Contrato de API / handoffs | `apps/web/system/API_CONTRACTS.md` · `system/NEXT.md` |
| Contexto por domínio | `docs/contexts/*.md` · fases `docs/FASE_*.md` |
| Progresso/decisões | `TASK_PROGRESS.md` (root e `apps/web`) |

## Fatos-chave (não redescobrir)
- **Multi-tenant:** isolamento por **filtro manual** `.eq('tenant_id')` usando service-role
  (`getSupabaseAdmin` **bypassa RLS**). RLS existe mas é passivo. Ao mexer em store/route, garantir o filtro.
- **Dual-mode:** flag `USE_SUPABASE` (default true) em `lib/stores/use-supabase.ts`; JSON só emergência.
- **Auth em ponte:** cookie HMAC legado + Supabase Auth (Bearer). Produção falha sem
  `AUTH_SECRET`/`ENGINE_TOKEN`/`CRON_SECRET`; defaults existem somente fora de produção.
- **Engine ↔ app:** engine não tem banco; consome `/api/{leads,groups,session,activity,welcome,optout,
  dispatch/*,media}` com `x-engine-token` e `x-tenant-id`. Métodos são classificados fail-closed. Segunda via: worker puxa
  `claim_engine_commands` do Supabase por RPC (poll 3s).
- **Engine é single-número/single-instance** (`auth/` fixo). NÃO escala horizontal (2 réplicas do mesmo
  número = ban). `supervisor.js` (multi-tenant) é órfão/desalinhado — NÃO roda (`CMD=node index.js`).
  `connection-watchdog.js` também órfão. `/health` responde 200 mesmo deslogado. O boot CJS×ESM foi
  corrigido: módulos internos CommonJS, Baileys via `import()` e imagem `node:22.14.0-alpine3.21` pinada.
  Núcleo anti-ban é forte (não mexer). Detalhes: `hubflow-engine/ENGINE_AUDIT.md`.
- **Supabase:** 2 projetos — dev `wfju…` (`.env.local`) e prod `nido…` (CLI). Cuidado com drift.
- **Segredos:** `.gitignore` cobre `.env*`; nada versionado. ✅
- **Convenções:** arquivos kebab-case, componentes PascalCase, funções camelCase, alias `@/`, Tailwind
  utilitário. `apps/web/CLAUDE.md` define lanes (Frontend+UI vs Banco/API) — respeitar handoff.

## Riscos abertos
Geral (AUDIT_REPORT.md §13-14): RLS×service-role · rotação Service Role Key · drift de migrações ·
duplicação `(app)`×`painel` · resíduos legados · sem testes de integração · rate-limit in-memory.
Engine (ENGINE_AUDIT.md): single-número · supervisor/watchdog órfãos · `/health` mente. CJS×ESM foi corrigido.
Backend (BACKEND_AUDIT.md): admin guard, RBAC sensível, IDOR de mídia e stores legados globais foram
corrigidos no gate P0. Permanecem: paginação por cursor, caching quase ausente e migração definitiva do
fallback JSON para Postgres.
Frontend (FRONTEND_AUDIT.md): 🔴 shell duplicado `(app)` EN × `painel` PT (sidebar/topbar/mobile-nav/
stat-card em 2-3 pastas) · 🔴 107/155 `.tsx` são `"use client"` · 🟠 2 vocabulários de token
(`brand-*` #7c5cff × `iris/breu` #6a4bf0) · 🟠 5 fontes no root (Instrument Serif provável órfã) ·
🟠 ~5 componentes `landing/*` mortos (0 imports) · DS de 5 primitivos p/ 90 componentes.
Infra (INFRA_AUDIT.md): CI de PR e ordem canônica das 15 migrações foram adicionados; gate local propaga
falhas e inclui testes/build/scanner. Permanece: 🟠 env template sem `RESEND_API_KEY`/
`PLATFORM_ADMIN_EMAILS` · 🟠 volumes da engine sem backup · 🟠 sem error-tracking (Sentry) · Redis NÃO usado ·
GO_NO_GO declara `NO-GO` (diverge do "produção"). DNS/SSL = externos (Vercel/Coolify auto).

## Auditorias geradas (ler ANTES de reauditar)
`AUDIT_REPORT.md` (geral) · `hubflow-engine/ENGINE_AUDIT.md` (engine) · `BACKEND_AUDIT.md` (api/auth/security) ·
`FRONTEND_AUDIT.md` (ux/ui/perf) · `INFRA_AUDIT.md` (deploy/ci/secrets/backup).

## Plano de execução
`ROADMAP.md` — V1 Correções (🔴 segurança/bugs) → V2 Refatorações → V3 Performance → V4 Escalabilidade →
V5 Enterprise. Cada achado das 5 auditorias mapeado a uma versão, com critério de saída. Um item por PR.
V1 primeiro sempre (um 🔴 aberto trava as fases seguintes).
`PRODUCTION_CHECKLIST.md` — checklist pré-deploy por categoria (20 tópicos) com estado real preenchido;
8 bloqueadores 🔴 no topo (= V1). Complementa `deploy/GO_NO_GO.md`.
