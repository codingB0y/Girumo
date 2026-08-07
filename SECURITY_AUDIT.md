# SECURITY_AUDIT.md — HubFlow Platform

**Data:** 2026-08-06
**Escopo:** repo inteiro (`apps/web`, `hubflow-engine`, `infra`, config, git history)
**Método:** camada manual (config/headers/secrets/deps) + 2 agentes especializados (OWASP Top 10, isolamento multi-tenant). **Todos os achados CRITICAL/HIGH foram verificados manualmente no código-fonte** (arquivo:linha real), não aceitos cegamente do agente.
**Ferramentas:** `npm audit` (gitleaks/semgrep não instalados → fallback grep + `git log`).

> ⚠️ **Disclaimer:** auditoria assistida por IA, não substitui pentest profissional certificado. Os fixes são propostas a revisar, não verdade absoluta. "Invulnerável" não existe — o objetivo é fechar o conhecido e deixar processo que pega regressão.

---

## Sumário executivo

A **base de segurança é boa**: headers completos, sessão HMAC timing-safe, secrets nunca vazaram pro git, fail-closed em produção, RLS presente na maioria das tabelas de produto, Stripe webhook verificado, paywall server-side, sem XSS/SQLi/SSRF nos caminhos revisados.

O que derruba a nota são **2 buracos críticos** — um account-takeover de plataforma e um vazamento cross-tenant total — mais um punhado de rotas que escaparam do padrão dual-mode/authz do resto do código. São exceções pontuais, não um problema sistêmico.

**Score atual: 6.0 / 10** → estimado **8.5 / 10** após corrigir CRITICAL + HIGH.

| Severidade | Qtd |
|---|---|
| 🔴 CRITICAL | 2 |
| 🟠 HIGH | 3 |
| 🟡 MEDIUM | 6 |
| 🔵 LOW | 8 |

---

## 🔴 CRITICAL

### C1 — Account takeover via `DELETE /api/admin/impersonate`
**Arquivo:** `apps/web/src/app/api/admin/impersonate/route.ts:135-175`
**OWASP:** A01 Broken Access Control + A07 Broken Auth

**Vetor (cadeia verificada):**
1. O `DELETE` **não chama `getAdminContext()`** (o `POST` chama, na linha 17; o `DELETE` não valida papel algum).
2. O cookie `dz_impersonate` **não é assinado** — setado como `JSON.stringify()` puro (linha 106/124) e lido com `JSON.parse()` sem HMAC (linha 144), diferente do `dz_session`.
3. Linha 160: `signSession(adminData.adminAuthUserId)` — o `adminAuthUserId` vem 100% do cookie forjável — e a linha 169 devolve isso como `dz_session` HMAC-válido.
4. O middleware classifica `/api/admin/*` como `"user"` → basta **qualquer** sessão autenticada.

**Exploração:**
```
DELETE /api/admin/impersonate
Cookie: dz_session=<a própria, válida>; dz_impersonate={"adminAuthUserId":"<uuid-da-vítima>"}
→ resposta: Set-Cookie: dz_session=<token HMAC válido da vítima>
```
Qualquer conta logada assume a sessão de qualquer usuário. Se o UUID for o do super-admin → controle total da plataforma. O UUID do super-admin é obtível via `GET /api/logs` (`metadata.admin_user_id`, gravado pelo POST na linha 91-103) — **verificado:** `logs/route.ts:24-25` filtra por `tenant_id` do usuário mas devolve `metadata` no SELECT, então o owner de um tenant que o super-admin já impersonou lê o UUID dele. Mesmo **sem** esse elo a severidade é CRITICAL: assumir a sessão de qualquer usuário cujo UUID se conheça já é account takeover.

**Fix:**
```typescript
export async function DELETE(req: NextRequest) {
  const admin = await getAdminContext();                 // 1. exigir admin no DELETE
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminSession = await signSession(admin.authUserId); // 2. usar o admin VERIFICADO, nunca o cookie
  const res = NextResponse.json({ success: true, redirectTo: "/admin" });
  res.cookies.set(SESSION_COOKIE, adminSession, sessionCookieOptions);
  res.cookies.delete(IMPERSONATE_COOKIE);
  return res;
}
```
Adicional: (a) assinar `dz_impersonate` com HMAC (mesma técnica do `signSession`); (b) mover logs de impersonation p/ tabela não exposta por `/api/logs`, ou redigir `admin_user_id` antes de devolver ao tenant.
**Pós-fix:** revisar `logs` por eventos `admin.impersonate.*`/logins anômalos (o bug pode já ter sido explorado) e considerar invalidar sessões ativas.

### C2 — `/api/ad-campaigns` sem tenant: leitura + escrita + delete cross-tenant
**Arquivo:** `apps/web/src/app/api/ad-campaigns/route.ts:14-27` (GET), `:60-79` (POST), `:83-88` (DELETE)
**OWASP:** A01 Broken Access Control

**Vetor (verificado):** a rota usa `collection("ad-campaigns.json")` — arquivo JSON **global sem coluna `tenant_id`** — e **nunca** verifica `USE_SUPABASE` como as rotas irmãs (`links`/`orders`/`leads`). O `tenantId` (linha 15) só filtra `leads`; as campanhas vêm de `coll.list()` (linha 16) sem filtro.
- `GET` → devolve campanhas de **todos os lojistas**: nome, copy, headline, script, orçamento, `inviteUrl` do grupo de WhatsApp de outro tenant.
- `POST` → cria sem gravar dono.
- `DELETE ?id=<uuid-de-outro-tenant>` → `coll.remove(id)` (linha 86) apaga campanha de outro lojista sem checagem.

**Fix:** migrar pro padrão dual-mode das demais rotas — store `ad-campaigns.ts` com tabela Supabase `ad_campaigns(tenant_id, ...)` + RLS, filtrando sempre por `tenantId`:
```typescript
const camps = await supaStore.listAdCampaigns(tenantId);          // .eq("tenant_id", tenantId)
await supaStore.deleteAdCampaign(tenantId, id);                   // .eq("tenant_id",…).eq("id",id)
```

---

## 🟠 HIGH

### H1 — `/api/squad-os/*` sem autorização (service-role, RLS inócua)
**Arquivos:** `apps/web/src/app/api/squad-os/{squads,agents,missions,decisions,handoffs,memories,seed}/route.ts`

**Vetor (verificado em `squads/route.ts`):** GET e POST usam `getSupabaseAdmin()` (service-role, bypassa RLS) **sem `getAdminContext()` nem tenant check**. `workspace_id` vem do body (linha 28). Consumido em `/painel/squad-os/*` (área do lojista). Qualquer conta logada lê/escreve/corrompe os dados internos de roadmap/estratégia do produto (que deveriam ser só do Igor). A RLS do `docs/squad-os/schema.sql` é inócua: (a) o código usa service-role, (b) `app.workspace_id` nunca é setado, e (c) o schema **nem está em migration versionada**.

**Fix:** exigir `getAdminContext()` em todas as rotas `squad-os/*`:
```typescript
export async function GET() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ...
}
```
E versionar o schema + trocar a policy `current_setting('app.workspace_id')` por uma baseada em `auth.uid()`/claim de admin.

### H2 — `PATCH /api/campanhas/[slug]/messages/cancel` sem auth nem tenant
**Arquivo:** `apps/web/src/app/api/campanhas/[slug]/messages/cancel/route.ts:7-12`

**Vetor (verificado):** não chama `getRouteTenantContext` nem verifica `USE_SUPABASE` — `cancelMessage(id)` direto no `messages.json` legado. Qualquer requisição autenticada muda o status de qualquer `id`. (Bônus: em produção nem afeta o `campaign_messages` real no Supabase — bug funcional.)

**Fix:** replicar o dual-mode da rota irmã (`.../messages/route.ts`):
```typescript
const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
const ok = await supaStore.cancelCampaignMessage(tenantId, id); // .eq("tenant_id",…).eq("id",id)
if (!ok) return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });
```

### H3 — Dependências com CVE `high` (6 high + 2 moderate)
**Fonte:** `npm audit` (lockfile único do monorepo)

| Pacote | Sev | Problema | Via |
|---|---|---|---|
| `postcss` ≤8.5.22 | high | Path traversal / arbitrary `.map` file read via `sourceMappingURL`; XSS no stringify | `next`, `@tailwindcss/postcss` |
| `sharp` <0.35.0 | high | CVEs libvips (CVE-2026-33327/33328/35590/35591) — runtime de OG images | `@vercel/og` |
| `protobufjs` 7.5.0–7.6.4 | moderate | DoS por loop infinito no parse de `.proto` | — |

**Exposição real (nuance — revisão):** o rótulo é `high` pelo CVSS, mas a exposição prática nesta app é **baixa-a-média**: `postcss` é dependência de **build** (Tailwind/Next) — o path traversal exige controlar CSS de entrada durante o build, que roda em CI confiável, não é superfície de runtime remota; `sharp`/`@vercel/og` só é explorável se as OG images forem geradas a partir de input controlado por atacante (não o caso hoje — OG é de conteúdo próprio). Corrigir mesmo assim (é grátis), mas **priorizar depois de C1/C2/H1/H2**.

**Fix:** `npm audit fix` (postcss/protobufjs, não-breaking) + `npm audit fix --force` p/ sharp (breaking → `sharp@0.35.3`, testar geração de OG images).

---

## 🟡 MEDIUM

### M1 — `dev-tools/*` destrutivos sem `getAdminContext()` *(convergência dos 2 agentes)*
**Arquivos:** `apps/web/src/app/api/admin/dev-tools/{reset,clear-sessions,simulate-ban,simulate-failure,simulate-webhook,engine-health,security-check}/route.ts`, `admin/seed/dev/route.ts`
Dependem **só** de `blockInProduction()`/`isDev()`, nunca de papel de admin. Se `isDev()` retornar `true` em ambiente acessível (preview/staging mal configurado, `NODE_ENV` ausente), qualquer usuário logado pode `POST /api/admin/dev-tools/reset` e **apagar o banco** (organizations, memberships, subscriptions, users, logs…). Não explorável em prod hoje, mas é defesa-em-profundidade ausente.
**Fix:** `getAdminContext()` como 2ª camada, independente do guard de ambiente.

### M2 — `ENGINE_TOKEN` da engine sem fail-closed garantido
**Arquivos:** `hubflow-engine/index.js:223`, `hubflow-engine/config/env.js`
O app falha-fechado (`resolveSecret` throw em prod). A **engine não** — usa `?? "dz_dev_engine_token"` e `validateEngineEnvironment` só exige o token se `isProductionEngine()` (depende de `ENGINE_MODE`/`NODE_ENV` no deploy). Se o Coolify não setar nenhum, o token dev **público no repo** autentica `POST /api/session|groups|leads|activity|dispatch/*` contra o app.
**Fix:** exigir `ENGINE_TOKEN` sempre que não for mock, independente de `NODE_ENV`:
```javascript
if (!isMockMode() && !process.env.ENGINE_TOKEN) errors.push("ENGINE_TOKEN obrigatório fora do modo mock");
```

### M3 — Rate limit em memória + IP spoofável *(meu + agente OWASP)*
**Arquivo:** `apps/web/src/middleware.ts:6-32`
O `Map ipAttempts` é por-instância → em serverless/multi-réplica o limite multiplica pelo nº de instâncias e zera em cold start (bypass trivial de brute force no login). Além disso o IP vem de `x-forwarded-for` (controlável pelo cliente se não estiver estritamente atrás de proxy que sobrescreve).
**Fix:** rate limit distribuído (`@upstash/ratelimit`/Redis) + IP do hop confiável do proxy.

### M4 — Sem rate limit dedicado em envio/broadcast
**Arquivo:** `apps/web/src/app/api/broadcasts/route.ts` (e `campanhas/[slug]/messages`)
Só `assertPlanLimit` (quantidade, não frequência). Impacto atenuado pela `AntiBanQueue` da engine, mas falta rate limit na camada HTTP (defesa em profundidade).

### M5 — CSP com `'unsafe-inline'` **e** `'unsafe-eval'` no `script-src` global
**Arquivo:** `apps/web/next.config.ts:14`
Enfraquece muito a defesa contra XSS — qualquer script inline injetado executa. A CSP das LPs públicas já restringe `unsafe-eval` a dev; a global sempre permite.
**Fix:** migrar p/ CSP com nonce; remover `unsafe-eval` do global.

**Status: corrigido em PR #59** (`fix/security-csp-nonce`) — com escopo reduzido de propósito:

- `'unsafe-eval'` **removido de produção em todas as rotas** (segue só em dev, onde o Turbopack/HMR precisa). Varredura nos 185 arquivos JS de cliente do build: zero `eval(` / `new Function(`.
- **Nonce por-request** (novo `apps/web/src/lib/security/csp.ts` + middleware) em `/p/:slug` e `/r/:slug` — as duas superfícies públicas que renderizam conteúdo controlado pelo lojista (headline, `photo_url`, `meta_pixel_id`, `ga4_id`) e que já rendem por request, então o nonce ali custa zero.
- As demais rotas **seguem com `'unsafe-inline'`**: o `next build` pré-renderiza **42 rotas** em HTML estático (home, `/lp`, `/login`, todo o `/painel` — só a home sai com 91 scripts inline). O nonce nasce por request e não entra em HTML gerado no build; cobri-las exigiria `force-dynamic` nas 42, trocando o shell servido do CDN por SSR a cada request. Decisão explícita, documentada em `csp.ts`, a reavaliar se/quando o rendering dessas rotas mudar.

Achados do review do próprio fix, já corrigidos no PR: o `matcher` do middleware exclui **qualquer** path com ponto (`.*\.`, não só extensão no fim), então `/p/foo.bar` sairia sem CSP nenhuma — falha aberta; e `/p`/`/r` exatos recebiam CSP duplicada.

### M6 — IDOR em `/api/links/[slug]` (analytics cross-tenant)
**Arquivo:** `apps/web/src/app/api/links/[slug]/route.ts:7-9`, `apps/web/src/lib/clicks-analytics.ts`
`getClickAnalytics(slug)` sem checar dono → qualquer usuário logado lê total de cliques/UTM de link de outro tenant (mitigado: slug tem sufixo timestamp, não trivialmente enumerável).
**Fix:** resolver o link, comparar `link.tenant_id === tenantId`, 404 caso contrário.

---

## 🔵 LOW

| # | Achado | Arquivo |
|---|---|---|
| L1 | `impersonate/status` aceita cookie `dz_impersonate` não assinado (resolvido junto com C1) | `admin/impersonate/status/route.ts` |
| L2 | Idempotência do webhook Stripe com TOCTOU (SELECT+INSERT não atômico) | `api/billing/webhook/route.ts:86-94` |
| L3 | `PLATFORM_ADMIN_EMAILS` com fallback hardcoded `igor@hubflow.com.br` sem fail-closed | `lib/admin-guard.ts:12` |
| L4 | Rotas repassam `error.message` bruto do Supabase/Stripe ao cliente (vaza schema) | várias rotas admin |
| L5 | `ENGINE_TOKEN` comparado com `===` (não timing-safe) | `lib/security/request-access-policy.ts:68` |
| L6 | Sessão sem revogação — cookie válido 30 dias, sem logout server-side | `lib/auth.ts:21` |
| L7 | Engine Express sem `helmet`/CORS, bind `0.0.0.0`, `/health` sem auth (só status, sem dado de tenant) | `hubflow-engine/index.js:23-49` |
| L8 | `console.log` de telefones/PII na engine (LGPD) | `hubflow-engine/index.js:774,779` |
| L9 | Derivação de tenant inconsistente (cookie legado vs `getRouteTenantContext`) — não explorável, dívida técnica | `lib/stores/{orders,templates,referrals}.ts` |

---

## ✅ O que está bem (não regride)

- **Secrets:** nenhum `.env` real jamais commitado (só `.example`); `.gitignore` cobre `.env*`; zero secret hardcoded no código.
- **Headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, CSP (após o M5: nonce nas superfícies públicas dinâmicas; `'unsafe-inline'` permanece nas rotas pré-renderizadas, sem `'unsafe-eval'` em produção).
- **Sessão:** cookie HMAC-SHA256, comparação **timing-safe**, `httpOnly`+`sameSite=lax`+`secure` em prod. Bearer validado server-side via `supabase.auth.getUser`.
- **Fail-closed:** `resolveSecret` derruba o app em prod se `AUTH_SECRET`/`ENGINE_TOKEN` faltarem (defaults de dev não vazam).
- **Stripe:** assinatura do webhook verificada (`constructEvent` com raw body); paywall/entitlements server-side; `priceId` resolvido no servidor.
- **Injection:** SQL parametrizado (Supabase client), sem command injection no fluxo, sem path traversal (media-store valida + UUID).
- **XSS:** `dangerouslySetInnerHTML` só com JSON-LD estático; tracking scripts sanitizados (`replace(/[^0-9]/g)`).
- **SSRF / mass assignment / CSRF:** sem fetch de URL do usuário; inserts por allowlist campo-a-campo; `sameSite=lax` cobre mutations.
- **Multi-tenant:** RLS presente e correta na maioria das tabelas de produto; `x-tenant-id` **não** é escalável (validado contra memberships do usuário). Os achados acima são exceções pontuais.

---

## Roadmap de remediação (ordem)

1. **Agora (CRITICAL):** C1 (fix ~5 linhas) + C2. Depois do C1, revisar logs por exploração e considerar invalidar sessões.
2. **Esta semana (HIGH):** H1 (authz squad-os), H2 (cancel), H3 (`npm audit fix`).
3. **Sprint (MEDIUM):** M1 (gate admin dev-tools), M2 (engine fail-closed), M3 (rate limit distribuído), M6 (IDOR links), M4, M5.
4. **Backlog (LOW):** L1–L9.
5. **Processo (anti-regressão):** teste/lint no CI que falhe se `getSupabaseAdmin().from(<tabela_tenant>)` aparecer numa rota sem `.eq("tenant_id", …)` no mesmo arquivo; e checagem de que toda rota `/api/*` (fora da allowlist pública) tenha gate de auth/tenant.
