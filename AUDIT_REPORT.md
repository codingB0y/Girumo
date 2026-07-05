# AUDIT_REPORT.md — Auditoria de Engenharia Reversa do HubFlow

> **Natureza deste documento:** diagnóstico somente-leitura. Nada de código, config, migração ou dado foi
> alterado para produzi-lo. As seções 13 e 14 (dívida técnica e melhorias) são **propostas** — não foram
> executadas. Data da auditoria: 2026-07-02. Branch: `landing-v21-trust-redesign`.

---

## 1. Sumário executivo

O **HubFlow** é um SaaS multi-tenant de **captação e engajamento via WhatsApp**. O loop de produto é:

```
anúncio (link rastreado) → pessoa entra no grupo de WhatsApp → engine detecta a entrada = LEAD
→ boas-vindas automáticas → disparos/campanhas → conversão → billing por plano
```

Está **em produção**, com dois projetos Supabase (dev + prod), deploy web na Vercel e engine WhatsApp em
container (Coolify). O produto evoluiu bastante além do núcleo: hoje inclui **Flow Pages** (landing pages
de captação com tracking LGPD), **Squad OS** (time de agentes de IA interno) e um **painel admin** completo.

**Top achados (detalhe nas seções 6, 12 e 13):**

| # | Achado | Severidade |
|---|--------|-----------|
| 1 | RLS existe no banco mas as API routes usam **service-role key** (bypassa RLS) com filtro manual `.eq('tenant_id')`. A doc diz que RLS é a camada primária — a realidade é isolamento por código. | 🔴 Crítico |
| 2 | Rotação da **Service Role Key** consta como pendente (Sprint 1, item 1). Defaults inseguros de `AUTH_SECRET`/`ENGINE_TOKEN` no código (só devem valer em dev). | 🔴 Crítico |
| 3 | **Drift de migrações**: 3 diretórios de SQL (`infra/migrations`, `infra/dev-setup`, `apps/web/supabase/migrations`) + 2 projetos Supabase (dev `wfju…` / prod `nido…`). Sem fonte única de verdade. | 🟠 Aviso |
| 4 | **Duplicação de rotas**: `app/(app)/*` (inglês, legado) coexiste com `app/painel/*` (PT, atual). | 🟠 Aviso |
| 5 | **Projeto predecessor inteiro versionado** na raiz (`hubflow-groups/`) + resíduos (`api/`, `packages/`, `apps/web/apps/web`, `apps/web/prisma`, `nextjs-claude-code-starter`). | 🟠 Aviso |
| 6 | Sem testes automatizados de integração (só ~6 `*.test.ts` unitários). Rate-limit in-memory (single-instance). Stores legados JSON ainda no repo. | 🟡 Info |

**Ponto positivo:** `.env.local` e segredos **não estão versionados** — o `.gitignore` cobre `.env*` e só os
`.env.example` aparecem no git. Postura de segurança (headers/CSP/HSTS/bcrypt/consent) é sólida.

---

## 2. Arquitetura geral

Monorepo **npm workspaces** com dois workspaces ativos:

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/web  (Next.js 15 App Router + React 19 + Tailwind v4)       │
│  ├─ Painel do cliente (/painel/*)                                 │
│  ├─ Admin (/admin/*)                                              │
│  ├─ Landing pública (/)                                           │
│  ├─ Flow Pages (/p/[slug])                                        │
│  └─ API routes (/api/*) ── contrato HTTP                          │
└───────────────┬───────────────────────────┬─────────────────────┘
                │ x-engine-token             │ service-role
                ▼                            ▼
┌───────────────────────────┐   ┌──────────────────────────────────┐
│ hubflow-engine (Node ESM) │   │ Supabase                         │
│ Baileys 7 · WhatsApp      │   │ Auth · Postgres+RLS · Realtime · │
│ QR · detecção lead ·      │   │ Storage                          │
│ disparo · anti-ban        │   └──────────────────────────────────┘
└───────────────────────────┘
                                 ┌──────────────────────────────────┐
   Stripe (billing/webhook) ◄────┤ Resend (emails) ◄── cron Vercel  │
                                 └──────────────────────────────────┘
```

- **App ↔ Engine:** a engine **não tem banco**; consome endpoints do app via HTTP com header
  `x-engine-token`. O app é a fonte de verdade.
- **App ↔ Supabase:** via `@supabase/supabase-js` com **service-role** no servidor (ver seção 6).
- **Workspaces declarados:** `apps/web`, `hubflow-engine` (ver [package.json](package.json)). O root
  também tem `express` como dep (usado por `api/server.js`, resíduo — ver seção 13).

---

## 3. Stack & dependências

**Web** ([apps/web/package.json](apps/web/package.json)):

| Dependência | Versão | Papel |
|---|---|---|
| `next` | ^15.5.19 | Framework (App Router, Turbopack) |
| `react` / `react-dom` | 19.2.4 | UI |
| `@supabase/supabase-js` | ^2.108 | Auth + Postgres + Realtime + Storage |
| `stripe` | ^22.2 | Billing multi-tenant |
| `resend` | ^4.8 | Emails transacionais |
| `bcryptjs` | ^3.0 | Hash de senha (auth legado) |
| `@vercel/og` | ^0.11 | OG images (`/posts/og`) |
| `gsap` | ^3.15 | Animações da landing v2 |
| `lucide-react` | ^1.21 | Ícones |
| `tailwindcss` / `@tailwindcss/postcss` | ^4 | Estilo (Tailwind v4, sem config JS) |
| `tsx` | ^4.22 | Scripts TS (dev/seed) |
| TypeScript | ^5 (strict) | Tipagem |

**Engine** ([hubflow-engine/package.json](hubflow-engine/package.json)): `@whiskeysockets/baileys`
^7.0.0-rc13, `express` ^5.2, `pino` (log), `qrcode-terminal`.

---

## 4. Estrutura de pastas

```
HubFlow-platform/
├─ apps/web/                    # ⭐ aplicação principal
│  ├─ src/app/                  # rotas (App Router)
│  │  ├─ (app)/                 # ⚠️ rotas EN legadas (dashboard, campaigns, leads…)
│  │  ├─ painel/               # ✅ painel PT atual (campanhas, grupos, disparos, squad-os, pages…)
│  │  ├─ admin/                # painel administrativo (tenants, billing, saúde, logs…)
│  │  ├─ p/[slug]/             # Flow Pages públicas (ISR)
│  │  ├─ r/[slug]/             # redirect de links rastreados
│  │  ├─ api/                  # 84 route.ts (contrato HTTP)
│  │  ├─ login|signup|forgot-password|reset-password
│  │  └─ posts/                # posts + OG images
│  ├─ src/components/          # 90 componentes (landing/v2, painel, admin, pages, ui)
│  ├─ src/lib/                 # 73 libs (auth, supabase, stores, billing, email, agents, pages…)
│  ├─ supabase/migrations/     # migrações "novas" (admin, funnel, templates, flow-pages)
│  ├─ system/                  # API_CONTRACTS.md, NEXT.md (handoff entre lanes)
│  ├─ data/                    # fallback JSON legado (gitignored)
│  ├─ prisma/migrations/       # ⚠️ resíduo (não há Prisma nas deps)
│  └─ middleware.ts, next.config.ts, vercel.json
├─ hubflow-engine/            # engine WhatsApp Baileys (Node ESM)
├─ infra/                     # migrations + rls + seeds + dev-setup + scripts PowerShell
├─ deploy/                    # runbooks Vercel/Coolify/Supabase/Stripe + GO_NO_GO
├─ docs/                      # contexto, fases de migração, brand, audits prévios
├─ hubflow-groups/            # ⚠️ projeto predecessor completo (legado)
├─ api/server.js              # ⚠️ resíduo (express standalone)
├─ packages/shared/           # workspace não declarado
└─ tools/lightrag/            # knowledge graph (LightRAG)
```

---

## 5. Autenticação & sessão

Modelo **duplo/ponte** (em migração de auth legado → Supabase Auth):

1. **Cookie HMAC legado** — `dz_session` ([lib/auth.ts](apps/web/src/lib/auth.ts)). Payload
   `{sub: authUserId, iat}` assinado com HMAC-SHA256 (`AUTH_SECRET`), edge-safe (Web Crypto), validade
   30 dias, `httpOnly`+`sameSite=lax`+`secure` em prod. Comparação de assinatura em tempo constante.
2. **Supabase Auth (Bearer)** — tokens validados via `supabase.auth.getUser(token)`.

**Fluxo do [middleware.ts](apps/web/src/middleware.ts):**
- Rotas públicas: `/`, `/api/health`, `/api/billing/webhook`, `/posts/og`.
- **Rotas da engine** (`ENGINE_ROUTES`: session, groups, leads, welcome, optout, dispatch/*, activity,
  media): liberadas com header `x-engine-token === ENGINE_TOKEN`.
- **Rate-limit** in-memory (`Map`) em `POST /api/auth/*`: login 5/min, signup 3/min, account 10/min.
- **Bearer** → valida no Supabase; senão **cookie** de sessão; senão 401 (API) ou redirect `/login` (páginas).
- `matcher` exclui rotas de auth, `p/`, `api/p/`, `r/` e estáticos.

**Resolução de tenant** — [lib/supabase/tenant-context.ts](apps/web/src/lib/supabase/tenant-context.ts):
extrai `authUserId` (Bearer ou cookie), busca `memberships` (aceita), resolve `{tenantId, role}`.
`role ∈ {owner, admin, operator}`. `assertBillingRole` restringe billing a owner/admin.

> ⚠️ **Defaults inseguros:** `ENGINE_TOKEN` cai em `"dz_dev_engine_token"` e `AUTH_SECRET` em
> `"dz-dev-secret-troque-em-producao"` quando não setados ([lib/auth.ts:8-9](apps/web/src/lib/auth.ts)).
> Confirmar que ambos estão sobrescritos por env em produção.

---

## 6. Multi-tenancy & banco de dados

**Fonte canônica do schema base:** [infra/migrations/202606240001_base_schema.sql](infra/migrations/202606240001_base_schema.sql).

**Tabelas núcleo** (todas com `tenant_id` + trigger `set_updated_at`):
`organizations` (tenant = id), `users`, `memberships`, `plans`, `subscriptions`, `instances` (conexão
WhatsApp), `funnels`, `campaigns`, `contacts`, `messages`, `uploads`, `logs`, `engine_commands`,
`engine_events`. Enums fortes para status (campaign/message/instance/subscription…).

**Módulos adicionais** (migrações em `apps/web/supabase/migrations` + `docs/`):
- `20260701010000_admin_enhancements`, `..020000_funnel_events`, `..030000_templates_orders_referrals`,
  `..040000_testimonials`, `..050000_admin_alerts`.
- `20260702120000_flow_pages` → tabelas `lp_*` (páginas, leads, tracking events).
- Squad OS → `docs/squad-os/schema.sql`.

### 🔴 Achado central — RLS vs service-role

O banco **tem RLS** ([infra/rls/202606240002_rls_policies.sql](infra/rls/202606240002_rls_policies.sql))
com helpers `app.has_membership()` / `app.has_role()` baseados em `auth.uid()`. **Porém**, as API routes
e stores usam `getSupabaseAdmin()` = **service-role key**, que **bypassa RLS**
([lib/supabase/server.ts:13](apps/web/src/lib/supabase/server.ts)). O isolamento efetivo vem de **filtro
manual** `.eq("tenant_id", tenantId)` em cada query (ex.:
[lib/stores/groups.ts:23-31](apps/web/src/lib/stores/groups.ts)). ~10 stores seguem esse padrão.

**Implicação:** o isolamento multi-tenant depende de **disciplina de código**, não do RLS. Um `store` que
esqueça o `.eq('tenant_id')` vaza dados entre tenants sem o banco impedir. Isso **diverge** do que o
[CLAUDE.md](CLAUDE.md) afirma ("Supabase RLS é a camada primária de isolamento multi-tenant"). RLS aqui é
defense-in-depth passivo, não o caminho ativo. → ver melhoria proposta 14.1.

---

## 7. Camada de dados dual-mode

Herança da migração JSON → Supabase:
- **Flag** `USE_SUPABASE` ([lib/stores/use-supabase.ts](apps/web/src/lib/stores/use-supabase.ts)) —
  default `true`; `HUBFLOW_USE_SUPABASE=0` volta pro JSON (emergência).
- **Stores Supabase:** `lib/stores/*.ts` (groups, broadcasts, campaign-*, automations, referrals,
  schedules, orders, templates, tracked-links, squad-os).
- **Stores legados JSON:** `lib/*-store.ts` (groups-store, leads-store, dispatch-store, messages-store,
  session-store, media-store, etc.) + helper genérico [crud-route.ts](apps/web/src/lib/crud-route.ts) +
  `json-collection.ts` / `atomic-fs.ts`. Mantidos "para referência", não executam. → melhoria 14.2.

---

## 8. Módulos / domínios

| Módulo | Rotas | Descrição |
|---|---|---|
| **Painel (cliente)** | `/painel/*` | Dashboard (ROI, KPIs animados, sparkline), campanhas, grupos, disparos, agenda, contatos, biblioteca, indicação (referral), resultados, automações, conectar (QR), configurações (+ webhooks, cancelar), dev-tools |
| **Admin** | `/admin/*` | Tenants (+detalhe), usuários, billing, instâncias, funil, saúde, logs, alertas, agentes, configurações, impersonate |
| **Flow Pages** | `/p/[slug]`, `/painel/pages/*` | LP de captação (ISR + `unstable_cache`), editor, tracking LGPD (consent, honeypot, ip_hash), Meta Pixel + GA4 |
| **Squad OS** | `/painel/squad-os/*` | "Time de IA interno": squads, agents, missions, knowledge, handoffs, decisions (Realtime) |
| **Landing** | `/` | Redesign v2/v2.1 (GSAP + canvas de partículas "o fluxo"); componentes antigos ainda no repo sem uso |
| **Posts/OG** | `/posts` | Galeria + OG images dinâmicas |
| **Auth** | `/login`, `/signup`, `/forgot|reset-password` | Shell dark premium |

> ⚠️ **Duplicação:** `app/(app)/*` traz versões **em inglês** (`dashboard`, `campaigns`, `leads`,
> `groups`, `settings`, `schedules`, `templates`, `reports`, `acquisition`, `crescer`, `hoje`…) que
> coexistem com o `painel/*` PT. Aparenta ser a geração anterior do painel. → melhoria 14.3.

**APIs (84 route.ts)** cobrem: auth, billing (checkout/portal/usage/webhook), engine (commands, dispatch
pending/ack, groups grow, leads, session, activity, welcome, optout, media), admin (tenants, dev-tools,
impersonate, seed, settings, alerts), squad-os, pages públicas (`/api/p/*`), cron/emails, notifications.

---

## 9. Integrações externas

- **Supabase** — Auth (sessão principal em migração), Postgres+RLS, Realtime (notificações, squad-os,
  grupos), Storage (uploads com prefixo por tenant). Clients em
  [lib/supabase/server.ts](apps/web/src/lib/supabase/server.ts) (admin/anon/token).
- **Stripe** ([webhook](apps/web/src/app/api/billing/webhook/route.ts)) — checkout, portal, usage. Webhook
  `force-dynamic`, verifica assinatura (`constructEvent`), **idempotente** (dedup via tabela `logs` +
  `stripe_event_id`), faz upsert em `subscriptions` por `tenant_id`. Preços via env
  (`STRIPE_PRICE_ESSENCIAL|GROWTH|PERFORMANCE_MAX`, ver [lib/billing/plans.ts](apps/web/src/lib/billing/plans.ts)).
  Feature gating via `assertPlanLimit` (entitlements) antes de criar campanhas/broadcasts.
- **Resend** — emails transacionais (welcome, nudge 24h sem conectar, trial acabando) via
  `lib/email/*` + cron diário.
- **Engine Baileys** — via HTTP com `x-engine-token` (seção 10).

---

## 10. Engine WhatsApp

[hubflow-engine/](hubflow-engine/) — PoC Baileys promovida a produção. Sem banco: sessão em `auth/`
(gitignored), estado anti-ban em `engine-state.json` (gitignored).

- **Entrypoints múltiplos** (⚠️ risco de clareza): `index.js` (896 LOC, produção — conexão/QR, sync de
  grupos admin, **detecção de entrada/saída = lead**, motor de disparo, heartbeat 30s, boas-vindas),
  `index-dev.js`, `index-dev-real.js`, `dev-mode.js`, `supervisor.js`, `connection-watchdog.js`.
- **Anti-ban (só controle operacional seguro, sem stealth/proxy/fingerprint — política em `DECISIONS.md`):**
  `anti-ban-queue.js` (delays gaussianos 3–7s, lanes de prioridade, governor min/hora/dia 8/120/800,
  backoff+jitter, circuit breaker), `warmup.js` (teto crescente ~7 dias), `group-guard.js` (3 adds/10min),
  `delivery-tracker.js` (alerta <60%).
- **Invariantes** (de [hubflow-engine/CLAUDE.md]): todo envio passa pela fila; só monitora/dispara em grupo
  onde o número é **admin**; telefone via `resolvePhone` (LID→PN Baileys 7); chamadas ao app são
  **fail-silent**; estado anti-ban persiste entre restarts.
- **Consome do app:** `POST /api/leads`, `/api/groups`, `/api/session`, `/api/activity`, `GET /api/welcome`,
  `/api/optout`, `POST /api/dispatch/pending|ack`, `GET /api/media/:id`.

---

## 11. Deploy & infra

- **Web → Vercel** ([vercel.json](apps/web/vercel.json)): framework next, 2 crons —
  `/api/cron/emails` (12:00 UTC) e `/api/notifications/alerts` (09:00 UTC).
- **Engine → Coolify**: `deploy/coolify/engine.docker-compose.yml` + `hubflow-engine/Dockerfile`.
- **Scripts PowerShell** (`infra/scripts/*`, expostos no [package.json](package.json) root):
  `apply-supabase-sql`, `verify-local`, `verify-online`, `check-env-template` (vercel/coolify),
  `scan-secrets`.
- **Runbooks** em `deploy/`: `GO_NO_GO.md`, `DEPLOY_ONLINE_RUNBOOK`, `supabase/apply-order.md`,
  `stripe/setup.md`, exemplos `.env.production`/`.env.staging`.
- **Dois projetos Supabase:** dev (`wfju…`, apontado por `.env.local`) e prod (`nido…`, linkado no CLI).

---

## 12. Segurança

**Presente (bom):**
- `.gitignore` cobre `.env*` — **nenhum segredo versionado** (só `.env.example`). ✅ verificado via `git ls-files`.
- Headers em [next.config.ts](apps/web/next.config.ts): `X-Frame-Options: DENY`, `nosniff`, HSTS 1 ano,
  `Referrer-Policy`, `Permissions-Policy`. **CSP global** (script/style/img/connect/frame restritos;
  Stripe + Supabase liberados) e **CSP própria das LPs `/p`** (img `https:` para foto do lojista;
  Meta/GA4 liberados; `'unsafe-eval'` só em dev por causa do Turbopack).
- Rate-limit em auth; bcrypt; consent LGPD + honeypot + `ip_hash` nas Flow Pages; webhook Stripe com
  verificação de assinatura + idempotência.

**Pendências / atenção:**
- 🔴 **Rotação da Service Role Key** — marcada `[!]` pendente no [TASK_PROGRESS.md](TASK_PROGRESS.md) Sprint 1.
- 🔴 **Defaults inseguros** de `AUTH_SECRET`/`ENGINE_TOKEN` — garantir override por env em prod (seção 5).
- 🟡 **Rate-limit in-memory** — só protege por instância; em multi-instância (escala) não é global
  (a própria doc sugere Upstash Redis).

---

## 13. Dívida técnica & riscos (diagnóstico)

| # | Item | Sev. | Evidência |
|---|---|---|---|
| 13.1 | Isolamento multi-tenant depende de filtro manual, não de RLS (service-role bypassa) | 🔴 | seção 6 |
| 13.2 | Service Role Key não rotacionada / defaults inseguros em código | 🔴 | seção 12 |
| 13.3 | Drift de migrações: `infra/migrations` + `infra/dev-setup` + `apps/web/supabase/migrations` + docs; 2 projetos Supabase | 🟠 | seção 6/11 |
| 13.4 | Duplicação de rotas `app/(app)/*` (EN legado) × `app/painel/*` (PT) | 🟠 | seção 8 |
| 13.5 | **Projeto predecessor inteiro versionado** (`hubflow-groups/` com src/prisma/system próprios) + resíduos `api/server.js`, `packages/shared`, `apps/web/apps/web`, `apps/web/prisma/migrations`, `apps/web/nextjs-claude-code-starter` | 🟠 | árvore de pastas |
| 13.6 | Stores legados JSON ainda no repo (não executam) | 🟡 | seção 7 |
| 13.7 | Múltiplos entrypoints da engine (`index` vs `index-dev*`/`dev-mode`/`supervisor`) sem um "canônico" óbvio | 🟡 | seção 10 |
| 13.8 | Sem testes de integração/e2e automatizados (só ~6 `*.test.ts` unitários) | 🟡 | Sprint 4 item 18 pendente |
| 13.9 | Rate-limit não distribuído | 🟡 | seção 12 |

---

## 14. Backlog de melhorias propostas (NÃO implementar agora)

> Todas **incrementais**, sem reescrever módulos. Ordenadas por risco. Requerem aprovação antes de qualquer
> execução — coerente com a regra do projeto (mapear primeiro, refatorar em passos, não quebrar).

1. **RLS como rede de segurança real (13.1):** adotar cliente com token do usuário (RLS ativo) ou criar um
   *wrapper* de query que **exige** `tenant_id` e falha em dev se ausente. Manter service-role só onde é
   legítimo (webhook, admin, engine). Alinhar a doc do CLAUDE.md com a realidade escolhida.
2. **Segurança P0 (13.2):** confirmar/rotacionar Service Role Key; falhar o boot em prod se
   `AUTH_SECRET`/`ENGINE_TOKEN` forem os defaults (via `env-validator.ts`, que já existe).
3. **Consolidar migrações (13.3):** eleger `apps/web/supabase/migrations` OU `infra/` como fonte única;
   documentar ordem em `deploy/supabase/apply-order.md`; garantir paridade dev↔prod.
4. **Resolver duplicação de rotas (13.4):** confirmar que `app/(app)/*` está morto e removê-lo (ou
   redirecionar), reduzindo superfície e confusão.
5. **Limpeza de resíduos (13.5/13.6):** mover `hubflow-groups/`, `api/`, `nextjs-claude-code-starter`,
   `apps/web/prisma` e stores JSON para fora do repo/branch de arquivo — depois de confirmar zero
   referências. (É o item 16 do Sprint 4.)
6. **Engine: entrypoint canônico (13.7):** documentar/renomear qual arquivo é produção vs dev; um README
   curto de "como rodar cada modo".
7. **Testes (13.8):** smoke de contrato nas rotas da engine (`x-engine-token`) + teste de isolamento
   multi-tenant (garante que store sem `tenant_id` falha). É o item 18 do Sprint 4.
8. **Rate-limit distribuído (13.9):** só quando escalar além de 1 instância (Upstash Redis).

---

## 15. Referências (docs já existentes — não duplicar)

- Migração em fases: `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md` … `docs/FASE_8_CHECKLIST_PRODUCAO.md`.
- Contextos por domínio: `docs/contexts/{painel-auth,engine-whatsapp,billing-stripe,admin-platform,agentes-ia,landing-marketing}.md`.
- Auditorias prévias do painel: `docs/audit/*`, `docs/design-audit/*`.
- Contrato canônico de API e handoffs: `apps/web/system/API_CONTRACTS.md`, `apps/web/system/NEXT.md`.
- Progresso/decisões correntes: `TASK_PROGRESS.md` (root e `apps/web`).
- Engine: `hubflow-engine/{README,DECISIONS,CLAUDE}.md`.
- Knowledge graph (LightRAG): `tools/lightrag/` — consultável via `kg_query` para decisões arquiteturais.

---

*Fim do relatório. Diagnóstico apenas; nenhuma alteração foi aplicada ao sistema.*
