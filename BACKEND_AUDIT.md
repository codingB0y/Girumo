# BACKEND_AUDIT.md — Auditoria de Backend (API · Supabase · Auth · Segurança)

> **Natureza:** diagnóstico somente-leitura. Nenhum código/config alterado. Data: 2026-07-02.
> **Escopo lido nesta passada:** `lib/permissions.ts`, `lib/admin-guard.ts`, `lib/security-guards.ts`,
> `lib/billing/entitlements.ts`, `lib/media-store.ts`, `lib/leads-store.ts`, `admin/layout.tsx`, e amostra
> de rotas (`api/media/[id]`, `api/leads`, `api/admin/tenants/list`) + grep de padrões em 84 rotas.
> Complementa (não repete) o [AUDIT_REPORT.md](AUDIT_REPORT.md) §5-7 (auth, RLS, dual-mode).
> **Veredito:** a fundação (tenant-context, webhook idempotente, guards de ambiente, gating de plano) é
> competente, mas o **enforcement de autorização é desigual** — há 1 vazamento cross-tenant real, RBAC
> definido e quase não aplicado no server, e um IDOR de baixa explorabilidade. Caching é praticamente
> inexistente por opção (`force-dynamic`).

## Placar por área

| Área | Nota | Resumo |
|---|---|---|
| Auth (sessão) | 🟢 Bom | Cookie HMAC edge-safe + Supabase Bearer; tenant-context sólido |
| Middleware | 🟢 Bom | Rotas públicas/engine/rate-limit/bearer bem ordenadas |
| Guards de ambiente | 🟢 Bom | dev×prod (Stripe/DB/engine/domínio) — porém só advisory |
| Webhook Stripe | 🟢 Bom | Assinatura + idempotência via `logs` |
| Storage | 🟠 Médio | Bucket único por prefixo; **sem checagem de propriedade no read** |
| Queries | 🟠 Médio | Índices ok; **sem paginação por cursor**; 1 full-scan |
| Permissões (RBAC) | 🔴 Fraco | `permissions.ts` definido mas **enforçado no server em 1 rota** |
| Autorização de rota | 🔴 Furo | `/api/admin/tenants/list` **sem admin-guard** → leak cross-tenant |
| Isolamento multi-tenant | 🟠 Médio | Filtro manual `.eq(tenant_id)` (service-role bypassa RLS) + rotas engine em JSON global |
| Caching | 🟡 Info | Quase tudo `force-dynamic`; ISR só nas Flow Pages |

---

## 1. Autorização de rota  🔴

### 🔴 BE-1 — `/api/admin/tenants/list` vaza todos os tenants
[api/admin/tenants/list/route.ts](apps/web/src/app/api/admin/tenants/list/route.ts) chama `getSupabaseAdmin()`
e retorna `id, name, slug, status` de **todas** as organizations, **sem** `requireAdmin`/`getAdminContext` e
**sem** gate de ambiente. O middleware só exige *estar autenticado* (qualquer tenant), sem regra especial
para `/api/admin`. Resultado: **qualquer usuário logado enumera todos os clientes da plataforma**.
As páginas `/admin/*` **estão** protegidas (`requireAdmin` no [admin/layout.tsx:12](apps/web/src/app/admin/layout.tsx)) —
o furo é só nesta API (as 7 outras rotas admin usam guard: seed, impersonate, tenants/create, tenants/bulk,
alerts, settings, tenants/[id]/actions). → adicionar `getAdminContext()` no topo (e, se é só p/ dev banner,
gate `isDev()`).

> **Verificar também** as `/api/admin/dev-tools/*` (reset, clear-sessions, simulate-*): não aparecem com
> `requireAdmin`. Confirmar que estão atrás de `dev-guard` (bloqueio em produção) — senão são destrutivas e
> expostas.

### 🔴 BE-2 — RBAC definido mas quase não aplicado no servidor
[permissions.ts](apps/web/src/lib/permissions.ts) tem um mapa role→ação claro
(`owner/admin/operator`), mas o grep mostra `hasPermission` usado no server **só** em
[api/webhooks/config/route.ts:25](apps/web/src/app/api/webhooks/config/route.ts) — o restante é o
`role-provider.tsx` (client/UI). Billing usa `assertBillingRole` (check inline). As demais rotas de mutação
(campanhas, grupos, disparos, automações…) validam **tenant** mas **não role** → um `operator` executa ações
de `owner`/`admin`. O RBAC vive na UI (esconde botões), não no backend. → aplicar `hasPermission(ctx.role, …)`
nas mutações sensíveis.

---

## 2. Autenticação & Middleware  🟢

Sólido e já documentado no [AUDIT_REPORT.md](AUDIT_REPORT.md) §5. Reforços desta passada:
- **Admin por allowlist de e-mail** ([admin-guard.ts:11-15](apps/web/src/lib/admin-guard.ts)) —
  `PLATFORM_ADMIN_EMAILS` (default `igor@hubflow.com.br`). O próprio código diz *"em produção, mover para
  tabela `platform_admins`"*. 🟠 **BE-3**: além de frágil, `getAdminContext` lê **só o cookie** de sessão
  ([:27](apps/web/src/lib/admin-guard.ts)) — um admin autenticado só via Bearer/Supabase não é reconhecido.
- **Guards de ambiente** ([security-guards.ts](apps/web/src/lib/security-guards.ts)) são bem pensados
  (bloqueiam Stripe live em dev, DB/engine/domínio de prod em dev) mas 🟠 **só logam** — `logSecurityStatus`
  é chamado em `instrumentation.ts:15` e **não interrompe** o boot. `guardStorage` apenas delega a
  `guardDatabase` (não valida bucket).

---

## 3. Permissões / Multi-tenant  🟠

- **Isolamento por filtro manual** `.eq("tenant_id")` com service-role (bypassa RLS) — achado central do
  [AUDIT_REPORT.md](AUDIT_REPORT.md) §6, aplicável a todo o backend.
- 🟠 **BE-4 — rotas da engine ainda em JSON global sem tenant.**
  [api/leads/route.ts](apps/web/src/app/api/leads/route.ts) usa `leads-store` =
  **NDJSON global** (`data/leads.ndjson`, [leads-store.ts:9-10](apps/web/src/lib/leads-store.ts)),
  **sem `tenant_id`** (comentário: *"Migrar p/ Postgres depois"*). `optout-store` idem. `GET /api/leads`
  retorna **todos** os leads sem filtro. Protegido por `x-engine-token`, e mitigado na prática porque cada
  engine é 1 número/1 cliente — mas num app multi-tenant compartilhado é mistura de dados. Inconsistente com
  o resto (Supabase tenant-scoped).

---

## 4. Storage  🟠

[media-store.ts](apps/web/src/lib/media-store.ts): bucket único `uploads`, multi-tenant por **prefixo de
path** `{tenantId}/media/{uuid}.ext`, upload com allowlist de MIME ([:6-26](apps/web/src/lib/media-store.ts)),
`upsert:false`, e **rollback** do arquivo se o insert de metadados falhar ([:95-98](apps/web/src/lib/media-store.ts))
— bom.

🟠 **BE-5 — IDOR (baixa explorabilidade) no read.** `mediaId` é apenas `base64url(storagePath)`. `readMedia`
decodifica e baixa via service-role **sem verificar** que o `tenantId` do path pertence ao requester
([media-store.ts:110-117](apps/web/src/lib/media-store.ts) + [api/media/[id]/route.ts](apps/web/src/app/api/media/[id]/route.ts)).
Qualquer autenticado que **conheça** o id de outro tenant baixa o arquivo. Mitigado porque o path embute
**dois UUIDs** (tenant + filename), não-enumeráveis — mas a **autorização por propriedade está ausente**;
protege só a obscuridade. → validar `tenantId` do path contra o contexto, ou usar `createSignedUrl` com
expiração em vez de proxy aberto.

**RLS de storage** existe (`infra/rls/…_storage_policies.sql`) mas, como todo acesso é service-role, é
passivo (mesmo caso do §6 do audit geral).

---

## 5. Queries & Performance  🟠

- **Índices**: o schema base cobre bem (`tenant_id`, `status`, `created_at` compostos — ver
  `infra/migrations/202606240001_base_schema.sql:265-276`). ✓
- 🟠 **BE-6 — sem paginação por cursor.** Nenhum `.range()` no código; só `.limit(n)` fixo ou **sem limite**
  (ex.: `listGroups` em [stores/groups.ts:23-31](apps/web/src/lib/stores/groups.ts) faz `order + select *`
  sem `limit`; `tenants/list` fixa `.limit(50)` sem cursor). Para tenant com muitos grupos/leads/mensagens,
  carrega tudo em memória.
- 🟠 **BE-7 — `assertUploadLimit` faz full-scan + soma no JS** ([entitlements.ts:89-93](apps/web/src/lib/billing/entitlements.ts))
  (`select("size")` de todos os uploads e reduce). Deveria agregar no banco (`sum`). Contraste: `assertPlanLimit`
  usa `count: exact, head:true` — eficiente ([:73](apps/web/src/lib/billing/entitlements.ts)).
- 🟡 **BE-8 — `assertPlanLimit` é TOCTOU**: conta e depois o caller insere, sem transação/lock
  ([:71-79](apps/web/src/lib/billing/entitlements.ts)) → duas requisições concorrentes podem ambas passar e
  exceder o limite do plano por 1. Baixo impacto; citar.

---

## 6. Supabase (clients)  🟢/🟠

- 3 clients bem separados ([supabase/server.ts](apps/web/src/lib/supabase/server.ts)): admin (service-role,
  singleton), anon (singleton) e por-token. `requireEnv` falha cedo se faltar env. ✓
- 🟠 **service-role é o caminho padrão** de quase tudo → toda a autorização depende do código, não do banco
  (§3). O worker da engine também usa service-role direto no container (ver ENGINE_AUDIT §11).

---

## 7. Caching  🟡

- **Quase inexistente por opção.** `force-dynamic` aparece em ~toda rota/página → SSR dinâmico sempre. Só as
  **Flow Pages** usam cache real (`unstable_cache` + `revalidateTag('lp:{slug}')`,
  [lib/pages/store.ts](apps/web/src/lib/pages/store.ts) e [app/p/[slug]/page.tsx](apps/web/src/app/p/[slug]/page.tsx)).
- `/api/media/[id]` seta `cache-control: private, max-age=3600` (bom p/ mídia imutável).
- **Trade-off:** correção sobre custo — nenhum dado servido velho, mas todo dashboard recomputa a cada hit
  (custo Vercel + latência). Há espaço para `revalidate` curto ou `unstable_cache` em leituras quentes
  (planos, templates, config) sem risco de stale relevante.
- Rate-limit **in-memory** no middleware (single-instance) — já registrado no audit geral.

---

## 8. Validação de input  🟡

Padrão manual e **consistente** rota a rota: `try/catch` no `req.json()`, coerção `String(...)`, checagem de
obrigatórios, retorno 400 (ex.: [api/leads/route.ts:16-29](apps/web/src/app/api/leads/route.ts); Flow Pages
com E.164/consent/honeypot — audit geral §8). Não há schema central (Zod) — decisão registrada de *validar
sem Zod*. Aceitável; o risco é divergência de regra entre rotas equivalentes.

---

## 9. Prioridades sugeridas (NÃO implementar sem aprovação)

| P | Item | Ação mínima | Ref. |
|---|---|---|---|
| P0 | Leak cross-tenant | `getAdminContext()` (+ `isDev` se for dev-only) em `tenants/list`; auditar `dev-tools/*` | BE-1 |
| P0 | RBAC no server | aplicar `hasPermission(ctx.role, …)` nas mutações sensíveis | BE-2 |
| P1 | IDOR de mídia | validar tenant do path no `readMedia` ou migrar p/ `createSignedUrl` | BE-5 |
| P1 | Admin allowlist | mover p/ tabela `platform_admins`; aceitar Bearer no `getAdminContext` | BE-3 |
| P2 | Leads sem tenant | migrar `leads-store`/`optout-store` p/ Supabase tenant-scoped | BE-4 |
| P2 | Queries | paginação por cursor (`.range`) nas listagens; `sum` no `assertUploadLimit` | BE-6, BE-7 |
| P3 | Caching | `unstable_cache` curto em leituras quentes (planos/templates/config) | §7 |
| P3 | Guards | tornar `security-guards` bloqueantes em boot de produção | §2 |

---

## 10. Resposta direta

O backend **não é inseguro por acidente de framework** — a arquitetura tem as peças certas (tenant-context,
webhook idempotente, gating de plano, guards de ambiente). O problema é **enforcement desigual**: a
autorização foi aplicada onde alguém lembrou (billing, páginas admin) e esquecida onde não (a API
`tenants/list`, o RBAC nas mutações, a propriedade da mídia). São correções **pontuais e baratas** (P0/P1),
não reescrita. O item que eu trataria hoje é o **BE-1** (um GET vaza a base de clientes).

*Fim do relatório. Diagnóstico apenas; nenhuma alteração aplicada.*
