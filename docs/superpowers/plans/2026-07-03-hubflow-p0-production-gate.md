# HubFlow P0 Production Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os bloqueadores P0 de autenticação, isolamento tenant, crons, secrets, migrações e CI sem reescrever o backend.

**Architecture:** Extrair decisões de segurança para funções puras testáveis, fazer engine e usuário carregarem contextos tenant explícitos, particionar stores legados por tenant e tornar crons/gates fail-closed. Mudanças de comportamento serão entregues por TDD e commits atômicos.

**Tech Stack:** Next.js 15, TypeScript, Node.js, Supabase, PowerShell, GitHub Actions, `tsx --test`.

---

### Task 1: Test runner e política de acesso

**Files:**
- Create: `apps/web/src/lib/security/request-access-policy.ts`
- Create: `apps/web/src/lib/security/request-access-policy.test.ts`
- Modify: `apps/web/package.json`
- Modify: `package.json`

- [ ] **Step 1: Escrever teste RED da matriz de acesso**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequest } from "./request-access-policy";

test("auth POST é público com rate limit", () => {
  assert.equal(classifyRequest("/api/auth/login", "POST"), "auth-rate-limited");
});

test("dispatch pending é exclusivo da engine", () => {
  assert.equal(classifyRequest("/api/dispatch/pending", "POST"), "engine-only");
});

test("leads GET é compartilhado e leads POST é da engine", () => {
  assert.equal(classifyRequest("/api/leads", "GET"), "shared");
  assert.equal(classifyRequest("/api/leads", "POST"), "engine-only");
});
```

- [ ] **Step 2: Executar e confirmar falha por módulo ausente**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/security/request-access-policy.test.ts`

Expected: FAIL com `Cannot find module './request-access-policy'`.

- [ ] **Step 3: Implementar classificador mínimo**

```ts
export type AccessKind = "public" | "auth-rate-limited" | "cron" | "engine-only" | "shared" | "user";

const ENGINE_ONLY = new Set([
  "POST /api/session",
  "POST /api/groups",
  "POST /api/leads",
  "POST /api/activity",
  "POST /api/dispatch/pending",
  "POST /api/dispatch/ack",
  "POST /api/groups/grow/pending",
  "POST /api/groups/grow/ack",
]);

const SHARED_PREFIXES = ["/api/session", "/api/groups", "/api/leads", "/api/welcome", "/api/optout", "/api/media"];

export function classifyRequest(pathname: string, method: string): AccessKind {
  const key = `${method.toUpperCase()} ${pathname}`;
  if (pathname.startsWith("/api/auth/") && method.toUpperCase() === "POST") return "auth-rate-limited";
  if (pathname === "/api/cron/emails" || pathname === "/api/notifications/alerts") return "cron";
  if (ENGINE_ONLY.has(key)) return "engine-only";
  if (SHARED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "shared";
  return pathname.startsWith("/api/") ? "user" : "public";
}
```

- [ ] **Step 4: Adicionar `test` aos package.json e executar todos os testes**

Run: `npm test`

Expected: PASS incluindo os cinco scripts existentes e o novo teste Node.

- [ ] **Step 5: Commit**

```text
test: establish P0 security policy runner
```

### Task 2: Middleware fail-closed e rate limit efetivo

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/lib/security/request-access-policy.ts`
- Modify: `apps/web/src/lib/security/request-access-policy.test.ts`

- [ ] **Step 1: Escrever testes RED para token inválido e método engine-only**

```ts
import { decideEngineAccess } from "./request-access-policy";

test("token de engine inválido não cai para usuário", () => {
  assert.equal(decideEngineAccess("shared", "wrong", "expected"), "reject-401");
});

test("engine-only sem token rejeita usuário", () => {
  assert.equal(decideEngineAccess("engine-only", null, "expected"), "reject-403");
});
```

- [ ] **Step 2: Executar e confirmar falha por export ausente**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/security/request-access-policy.test.ts`

Expected: FAIL indicando `decideEngineAccess` ausente.

- [ ] **Step 3: Implementar decisão e integrar no middleware**

```ts
export type EngineDecision = "allow-engine" | "continue-user" | "reject-401" | "reject-403";

export function decideEngineAccess(kind: AccessKind, token: string | null, expected: string): EngineDecision {
  if (token) return token === expected ? "allow-engine" : "reject-401";
  if (kind === "engine-only") return "reject-403";
  return "continue-user";
}
```

O middleware deve classificar cada request, aplicar rate limit antes da autenticação, liberar crons ao handler, validar engine fail-closed e remover `api/auth` do negative lookahead do matcher.

- [ ] **Step 4: Executar teste e TypeScript**

Run: `npm test && npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
fix: enforce fail-closed request authentication
```

### Task 3: Contextos tenant da engine e do usuário

**Files:**
- Create: `apps/web/src/lib/engine-context.ts`
- Create: `apps/web/src/lib/engine-context.test.ts`
- Modify: `hubflow-engine/config/env.js`
- Modify: `hubflow-engine/index.js`
- Modify: `deploy/coolify/.env.example`
- Modify: `deploy/coolify/engine.docker-compose.yml`

- [ ] **Step 1: Escrever teste RED para UUID e headers**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseEngineTenantId } from "./engine-context";

test("aceita UUID de tenant", () => {
  assert.equal(parseEngineTenantId("11111111-1111-4111-8111-111111111111"), "11111111-1111-4111-8111-111111111111");
});

test("rejeita tenant ausente ou inválido", () => {
  assert.throws(() => parseEngineTenantId(null));
  assert.throws(() => parseEngineTenantId("tenant-1"));
});
```

- [ ] **Step 2: Executar RED**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/engine-context.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar parser e header da engine**

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseEngineTenantId(value: string | null): string {
  if (!value || !UUID.test(value)) throw new Error("Tenant da engine ausente ou inválido.");
  return value;
}
```

A engine deve carregar `ENGINE_TENANT_ID`, falhar em produção quando ausente e incluir `x-tenant-id` em `appFetch`.

- [ ] **Step 4: Executar testes web e sintaxe engine**

Run: `npm test && node --check hubflow-engine/index.js && node --check hubflow-engine/config/env.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
fix: add explicit engine tenant context
```

### Task 4: Stores legados isolados por tenant

**Files:**
- Create: `apps/web/src/lib/tenant-data-path.ts`
- Create: `apps/web/src/lib/tenant-data-path.test.ts`
- Modify: `apps/web/src/lib/leads-store.ts`
- Modify: `apps/web/src/lib/optout-store.ts`
- Modify: `apps/web/src/lib/welcome-store.ts`
- Modify: `apps/web/src/app/api/leads/route.ts`
- Modify: `apps/web/src/app/api/optout/route.ts`
- Modify: `apps/web/src/app/api/welcome/route.ts`

- [ ] **Step 1: Escrever teste RED de path tenant-scoped**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { tenantDataPath } from "./tenant-data-path";

test("gera caminho separado por tenant", () => {
  const path = tenantDataPath("11111111-1111-4111-8111-111111111111", "leads.ndjson");
  assert.match(path.replaceAll("\\", "/"), /tenants\/11111111-1111-4111-8111-111111111111\/leads\.ndjson$/);
});

test("rejeita filename com travessia", () => {
  assert.throws(() => tenantDataPath("11111111-1111-4111-8111-111111111111", "../leads.ndjson"));
});
```

- [ ] **Step 2: Executar RED**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/tenant-data-path.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar path e tornar tenant obrigatório nos stores**

```ts
export function tenantDataPath(tenantId: string, filename: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error("tenantId inválido");
  if (!/^[a-z0-9.-]+$/i.test(filename) || filename.includes("..")) throw new Error("filename inválido");
  return legacyDataPath("tenants", tenantId, filename);
}
```

Todas as funções públicas de leads, opt-out e welcome recebem `tenantId`. Os handlers resolvem engine context para métodos da engine e `getTenantContext(req)` para métodos da UI.

- [ ] **Step 4: Executar testes e TypeScript**

Run: `npm test && npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
fix: isolate legacy stores by tenant
```

### Task 5: Sessão, grupos, activity e mídia tenant-scoped

**Files:**
- Modify: `apps/web/src/lib/session-store.ts`
- Modify: `apps/web/src/app/api/session/route.ts`
- Modify: `apps/web/src/app/api/groups/route.ts`
- Modify: `apps/web/src/app/api/activity/route.ts`
- Modify: `apps/web/src/lib/media-store.ts`
- Modify: `apps/web/src/app/api/media/[id]/route.ts`
- Create: `apps/web/src/lib/media-store.test.ts`

- [ ] **Step 1: Escrever teste RED de propriedade de mídia**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { mediaPathBelongsToTenant } from "./media-store";

test("aceita somente path do tenant", () => {
  assert.equal(mediaPathBelongsToTenant("tenant-a/media/file.jpg", "tenant-a"), true);
  assert.equal(mediaPathBelongsToTenant("tenant-b/media/file.jpg", "tenant-a"), false);
});
```

- [ ] **Step 2: Executar RED**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/media-store.test.ts`

Expected: FAIL por export ausente.

- [ ] **Step 3: Implementar escopo tenant**

`getSession(tenantId)` e `setSession(tenantId, info)` filtram `.eq("tenant_id", tenantId)`. Grupos usam tenant de engine no POST e tenant do usuário no GET/PATCH. Activity segue a mesma separação. `readMedia(id, tenantId)` retorna `null` quando o path não começa com `${tenantId}/media/`.

- [ ] **Step 4: Executar testes e TypeScript**

Run: `npm test && npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
fix: scope operational routes to tenant
```

### Task 6: Admin, RBAC e crons

**Files:**
- Modify: `apps/web/src/app/api/admin/tenants/list/route.ts`
- Create: `apps/web/src/lib/cron-auth.ts`
- Create: `apps/web/src/lib/cron-auth.test.ts`
- Modify: `apps/web/src/app/api/cron/emails/route.ts`
- Modify: `apps/web/src/app/api/notifications/alerts/route.ts`
- Modify: `apps/web/src/lib/permissions.ts`
- Modify: `apps/web/src/app/api/campanhas/route.ts`
- Modify: `apps/web/src/app/api/automations/route.ts`
- Modify: `apps/web/src/app/api/auth/account/route.ts`
- Verify existing guards: `apps/web/src/app/api/members/route.ts`
- Verify existing guards: `apps/web/src/app/api/webhooks/config/route.ts`

- [ ] **Step 1: Escrever testes RED de cron e permissão**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { isCronAuthorized } from "./cron-auth";

test("cron exige Bearer exato", () => {
  assert.equal(isCronAuthorized("Bearer secret", "secret"), true);
  assert.equal(isCronAuthorized("Bearer wrong", "secret"), false);
  assert.equal(isCronAuthorized(null, "secret"), false);
});
```

- [ ] **Step 2: Executar RED**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/cron-auth.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar cron GET e guards**

```ts
export function isCronAuthorized(header: string | null, secret: string): boolean {
  return secret.length >= 24 && header === `Bearer ${secret}`;
}
```

`tenants/list` chama `getAdminContext()` e retorna `403` sem admin. Os dois crons aceitam apenas GET autorizado. `campanhas` aplica `campaign:create`, `campaign:edit` e `campaign:delete`; `automations` aplica as mesmas permissões conforme POST/PATCH/DELETE; `auth/account` aplica `settings:account` no PATCH e `account:delete` no DELETE. `members` e `webhooks/config` mantêm os guards existentes, cobertos pela verificação de TypeScript e grep do gate.

- [ ] **Step 4: Executar testes e TypeScript**

Run: `npm test && npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
fix: enforce privileged route authorization
```

### Task 7: Secrets, migrações, gate e CI

**Files:**
- Create: `apps/web/src/lib/runtime-secrets.ts`
- Create: `apps/web/src/lib/runtime-secrets.test.ts`
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/instrumentation.ts`
- Modify: `deploy/vercel/.env.production.example`
- Create: `deploy/supabase/apply-order.txt`
- Modify: `deploy/supabase/apply-order.md`
- Modify: `infra/scripts/apply-supabase-sql.ps1`
- Modify: `infra/scripts/scan-secrets.ps1`
- Modify: `infra/scripts/verify-local.ps1`
- Create: `.github/workflows/verify.yml`

- [ ] **Step 1: Escrever testes RED de secrets**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveSecret } from "./runtime-secrets";

test("produção rejeita secret ausente", () => {
  assert.throws(() => resolveSecret("AUTH_SECRET", undefined, "production", "dev-secret"));
});

test("development aceita default local", () => {
  assert.equal(resolveSecret("AUTH_SECRET", undefined, "development", "dev-secret"), "dev-secret");
});
```

- [ ] **Step 2: Executar RED**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/runtime-secrets.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar secrets e fonte canônica de SQL**

```ts
export function resolveSecret(name: string, value: string | undefined, env: string | undefined, devDefault: string): string {
  if (value?.trim()) return value.trim();
  if (env === "production") throw new Error(`Variável obrigatória ausente: ${name}`);
  return devDefault;
}
```

`apply-order.txt` contém, em ordem, todos os SQLs ativos de `infra/migrations`, `infra/rls`, `infra/seeds` e `apps/web/supabase/migrations`. O script lê esse arquivo, rejeita duplicatas e arquivos ausentes.

```text
infra/migrations/202606240001_base_schema.sql
infra/rls/202606240002_rls_policies.sql
infra/seeds/202606240003_seed_plans.sql
infra/rls/202606240004_storage_policies.sql
infra/migrations/202606240005_engine_rpc.sql
infra/migrations/202606240006_membership_invites.sql
infra/migrations/202607010001_groups_broadcasts_schedules.sql
infra/migrations/202607010010_notifications.sql
infra/migrations/202607010011_tenant_webhooks.sql
apps/web/supabase/migrations/20260701010000_admin_enhancements.sql
apps/web/supabase/migrations/20260701020000_funnel_events.sql
apps/web/supabase/migrations/20260701030000_templates_orders_referrals.sql
apps/web/supabase/migrations/20260701040000_testimonials.sql
apps/web/supabase/migrations/20260701050000_admin_alerts.sql
apps/web/supabase/migrations/20260702120000_flow_pages.sql
```

- [ ] **Step 4: Corrigir scanner e propagação de falhas**

O scanner obtém arquivos com `git ls-files`, exclui apenas exemplos aprovados e retorna `1` em achado. `verify-local.ps1` usa uma função `Invoke-NativeStep` que verifica `$LASTEXITCODE` após cada comando e inclui `npm test`.

- [ ] **Step 5: Criar workflow de PR e executar gate completo**

Run: `npm run verify:local`

Expected: exit `0`, testes/build/sintaxe aprovados e nenhuma mensagem de falha ignorada.

- [ ] **Step 6: Commit**

```text
ci: make production gate fail closed
```

### Task 8: Migração legada, documentação e smoke final

**Files:**
- Create: `infra/scripts/migrate-legacy-tenant-data.ts`
- Create: `infra/scripts/migrate-legacy-tenant-data.test.ts`
- Modify: `package.json`
- Modify: `PROJECT_CONTEXT.md`
- Modify: `PRODUCTION_CHECKLIST.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Escrever teste RED do plano de migração**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { planLegacyMigration } from "./migrate-legacy-tenant-data";

test("recusa tenant inválido", () => {
  assert.throws(() => planLegacyMigration("tenant-1", "C:/tmp/data"));
});

test("planeja backup e destino sem remover originais", () => {
  const plan = planLegacyMigration("11111111-1111-4111-8111-111111111111", "C:/tmp/data");
  assert.equal(plan.destination.replaceAll("\\", "/"), "C:/tmp/data/tenants/11111111-1111-4111-8111-111111111111");
  assert.deepEqual(plan.files, ["leads.ndjson", "optout.json", "welcome.json"]);
  assert.equal(plan.deleteOriginals, false);
});
```

- [ ] **Step 2: Executar RED**

Run: `npm exec tsx -- --test infra/scripts/migrate-legacy-tenant-data.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar comando explícito**

Run esperado:

```powershell
npm run migrate:legacy-tenant -- --tenant-id 11111111-1111-4111-8111-111111111111
```

O comando valida, cria backup timestampado, copia `leads.ndjson`, `optout.json` e `welcome.json`, e nunca remove os originais.

- [ ] **Step 4: Atualizar documentação com estado comprovado**

Marcar apenas itens verificados pelo gate. Manter rotação de service-role e configurações externas como pendentes.

- [ ] **Step 5: Executar verificação final**

Run: `npm run verify:local`

Expected: exit `0`.

Run: `git diff --check`

Expected: sem saída e exit `0`.

- [ ] **Step 6: Commit**

```text
docs: complete P0 production gate handoff
```
