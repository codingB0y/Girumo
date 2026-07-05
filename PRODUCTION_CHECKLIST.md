# PRODUCTION_CHECKLIST.md — Pré-deploy HubFlow

> Checklist técnico **preenchido com o estado real** (base: as 5 auditorias, 2026-07-03). Complementa o
> `deploy/GO_NO_GO.md` (decisão de alto nível) com o detalhe por categoria.
>
> **Legenda:** `[x]` confirmado OK · `[ ]` pendente · 🔴 **bloqueador** (não deployar) · 🟠 recomendado ·
> 🟡 aceitável agora · **[EXTERNO]** = confirmar no painel (não verificável pelo repo).

## 🚦 Bloqueadores abertos (resolver antes do deploy) — todos V1 do `ROADMAP.md`

1. ✅ `GET /api/admin/tenants/list` protegido por `getAdminContext()` (BACKEND BE-1)
2. ✅ RBAC enforçado nas mutações de campanhas, automações e conta (BACKEND BE-2)
3. ✅ Engine CommonJS carrega Baileys por `import()` explícito + Node/Alpine pinados (ENGINE A-1)
4. 🔴 Engine `/health` retorna 200 **deslogado** → orquestrador não reinicia (ENGINE 9)
5. ✅ `ENGINE_TOKEN`/`AUTH_SECRET`/`CRON_SECRET` falham em produção se ausentes
6. 🔴 **Service Role Key** não rotacionada (pendente Sprint 1)
7. ✅ `apply-order.txt` cobre as 15 migrações ativas e é fonte canônica (INFRA-2)
8. 🔴 Env template sem `RESEND_API_KEY`/`PLATFORM_ADMIN_EMAILS` → email/admin falham calados (INFRA-4)

---

## 1. Security
- [x] `tenants/list` com `getAdminContext()` (BE-1)
- [x] `assertPermission(ctx.role, …)` nas mutações sensíveis (BE-2)
- [x] IDOR mídia: valida tenant do path antes do download (BE-5)
- [ ] 🔴 Service Role Key rotacionada **[EXTERNO]**
- [x] Boot de produção falha sem `AUTH_SECRET`/`ENGINE_TOKEN`/`CRON_SECRET`
- [x] Secrets fora do git (`git ls-files` limpo; `.gitignore` cobre `.env*`)
- [x] `SUPABASE_SERVICE_ROLE_KEY` só server (`server-only`, não vai ao bundle)
- [x] RLS habilitado nas tabelas *(porém passivo — app usa service-role; ver AUDIT §6)*
- [ ] **[EXTERNO]** smoke RLS 2-tenants executado (`infra/tests/rls-smoke-check.sql`)

## 2. Performance
- [ ] 🟠 reduzir client components (107/155 hoje) — V3
- [ ] 🟠 `unstable_cache` em leituras quentes; paginação por cursor (BE-6)
- [x] landing: GSAP dinâmico + canvas não monta no mobile
- [ ] Lighthouse baseline medido (ver §11)

## 3. Logs
- [x] App grava eventos na tabela `logs` (Supabase, por tenant)
- [ ] 🟠 Engine: `pino` estruturado (hoje `console.log`, pino silenciado)
- [ ] Retenção/rotação de logs definida

## 4. Monitoring
- [ ] 🟠 error-tracking (Sentry no app + coletor da engine) — **ausente** (INFRA-5)
- [ ] **[EXTERNO]** alerta de uptime nos 2 domínios
- [x] crons Vercel ativos e protegidos por Bearer forte (`cron/emails` 12:00, `notifications/alerts` 09:00)

## 5. Health Check
- [x] `/api/health` existe (público no middleware)
- [x] Engine `/health` + healthcheck no compose
- [ ] 🔴 Engine `/health` → **503 quando deslogado** (hoje 200 sempre) (ENGINE 9)
- [ ] 🟠 `connection-watchdog` plugado no `index.js` (hoje órfão) (ENGINE R-1)

## 6. Rate Limit
- [x] Auth routes limitadas (login 5 / signup 3 / account 10 por min)
- [x] Flow Pages `lead`(5/min) / `track`(30/min) limitados
- [ ] 🟡 **in-memory** → não distribuído (só single-instance; Redis = V4)

## 7. Backup
- [ ] **[EXTERNO]** Supabase backups/PITR habilitados (GO/NO-GO)
- [ ] 🟠 volumes da engine (`auth/`+`state`) **sem backup** → VPS morre = re-QR + perde anti-ban (INFRA-6)
- [x] runtime data gitignored (`auth/`, `data/`, `engine-state.json`)

## 8. Environment Variables
- [ ] 🔴 completar template: `RESEND_API_KEY`, `PLATFORM_ADMIN_EMAILS` (+ Google OAuth se usado) (INFRA-4)
- [ ] **[EXTERNO]** todas as envs setadas na Vercel (16+ chaves)
- [ ] **[EXTERNO]** `NEXT_PUBLIC_APP_URL` no domínio final
- [x] templates mínimos auditados por `check-env-template.ps1`

## 9. SSL
- [ ] **[EXTERNO]** HTTPS forçado no app (Vercel auto)
- [ ] **[EXTERNO]** HTTPS na engine (Coolify/Traefik/Let's Encrypt)
- [ ] 🔴 `APP_URL` da engine é `https://` (senão `x-engine-token` trafega em claro) (ENGINE 11)

## 10. Headers
- [x] HSTS 1 ano, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`
- [x] CSP global (Stripe+Supabase) + CSP própria das LPs `/p`
- [x] `'unsafe-eval'` só em `development`

## 11. Lighthouse
- [ ] rodar baseline real (`next build && next start` + CLI) — **não executado**
- [ ] metas: LCP, **TBT** (risco: client-heavy), **CLS** (risco: banners no topo)
- [x] `display:swap` nas fontes (sem FOIT)

## 12. SEO
- [x] metadata template + description no root layout
- [x] `/admin` com `robots: noindex`
- [x] OG images dinâmicas (`/posts/og`, `@vercel/og`)
- [ ] confirmar `sitemap.xml` / `robots.txt` públicos

## 13. Docker
- [x] multi-stage + `npm ci --omit=dev` + `.dockerignore` (auth/state/env)
- [ ] 🟠 rodar **non-root** (`USER node`)
- [ ] 🟠 **resource limits** (`mem_limit`/`cpus`)
- [x] imagem pinada em `node:22.14.0-alpine3.21` nos dois estágios (ENGINE A-1)
- [x] HEALTHCHECK (no compose)

## 14. Coolify
- [ ] **[EXTERNO]** volumes persistentes ativos (`auth`/`state`)
- [ ] 🟠 remover volume `sessions` órfão (não usado pelo `index.js`)
- [x] `restart: unless-stopped`
- [ ] **[EXTERNO]** `ENGINE_TOKEN` = o da Vercel

## 15. Supabase
- [x] `apply-order.txt` lista as 15 migrações ativas; script rejeita ausentes e duplicatas (INFRA-2)
- [ ] **[EXTERNO]** migrações aplicadas no projeto **prod** (`nido…`, não no dev `wfju…`)
- [ ] **[EXTERNO]** bucket `uploads` **privado** (serve via proxy — sinal de que já é)
- [x] storage isolado por prefixo `{tenantId}/media/…`

## 16. Stripe
- [x] webhook com **assinatura + idempotência** (via tabela `logs`)
- [ ] **[EXTERNO]** webhook no domínio final + secret configurado
- [ ] **[EXTERNO]** price IDs **live** (`STRIPE_PRICE_*`) setados
- [ ] **[EXTERNO]** checkout / portal / cancelamento testados (refletem no Supabase)

## 17. Engine
- [x] boot determinístico: módulos CommonJS + Baileys via `import()` + Node pinado (ENGINE A-1)
- [x] estado anti-ban **persistido atômico** (sobrevive a restart, não libera cota nova)
- [ ] **[EXTERNO]** restart **preserva sessão** (volume `auth/` ok)
- [ ] ⚠️ **só 1 instância** — NÃO subir réplica do mesmo número (= ban) até multi-socket (V4)

## 18. Webhooks
- [x] Stripe webhook público no middleware (`/api/billing/webhook`)
- [x] rotas da engine protegidas fail-closed por `x-engine-token` + `x-tenant-id`
- [ ] 🟡 app→engine webhook inexistente (hoje poll 3-10s; otimização V4)

## 19. Workers
- [x] `supabase-command-worker` funcional (poll 3s, batch 5, backoff)
- [x] worker se **autodesativa** sem `SUPABASE_*`
- [ ] **[EXTERNO]** RPCs aplicadas no banco (`claim/complete_engine_command`, `record_engine_event`, `update_instance_status`)

## 20. Redis
- [x] 🟡 **N/A** — não usado. Rate-limit/analytics in-memory (ok p/ single-instance; vira requisito no V4)

---

## ✅ Comando de smoke (do GO/NO-GO)
```powershell
npm run verify:local
npm run verify:online -- -AppUrl "https://app.SEUDOMINIO.com" -EngineUrl "https://engine.SEUDOMINIO.com"
```

## Resumo
- **Já OK:** headers/CSP, secrets fora do git, webhook Stripe, RLS presente, storage por tenant, anti-ban persistido, crons, worker.
- **Gate P0 do repositório:** aprovado (`npm run verify:local`, testes web/migrador/engine, build e sintaxe).
- **Bloqueadores ainda abertos:** engine health, rotação externa da service-role e envs externos/incompletos.
- **[EXTERNO]:** SSL, DNS, backups Supabase, envs na Vercel, testes Stripe — confirmar nos painéis.
- **Não deployar réplica da engine** até o multi-socket (V4).

*Checklist atualizado após o gate de boot determinístico da engine em 2026-07-03.*
