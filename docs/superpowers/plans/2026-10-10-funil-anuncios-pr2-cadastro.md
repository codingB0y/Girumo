# Funil de anúncios — PR 2: endpoint de cadastro e chave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O site próprio do lojista manda cada cadastro (WhatsApp + UTMs) para `POST /api/integracoes/cadastro` com uma chave secreta e recebe de volta o link do grupo com `?cid=`; o dono gera essa chave em `POST /api/integracoes/site/chave`.

**Architecture:** Funções puras em `lib/integracoes/` (chave, leitura do corpo, montagem do redirect), stores finos em `lib/stores/` (sempre `.eq('tenant_id', …)`), duas rotas. A rota pública entra na política de acesso como `public-rate-limited` com teto por IP no middleware e teto por chave no handler.

**Tech Stack:** Next 15 route handlers (`runtime = "nodejs"`), Supabase service-role, zod 4, `node:crypto`, `node:test` com PostgREST falso.

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md` (§3 API, §5 site da loja, §6 bordas, §7 segurança)

**Depende de:** PR 1 mergeado e aplicado (`site_integrations`, `site_captures`). Índice: `docs/superpowers/plans/2026-10-10-funil-anuncios-00-indice.md`.

## Global Constraints

- Chave: `gk_live_` + 32 bytes aleatórios em base64url (43 caracteres); no banco só `sha256` hex e os 4 últimos; mostrada uma vez; gerar outra desliga a anterior.
- Corpo do cadastro: `whatsapp` (≤ 40) → `normalizeWhatsappBR`, nulo → **422** `{ "error": "numero" }`; `page_url` http(s) ≤ 2048; UTMs e `fbclid` lidos dela, aparados, cortados em 200, vazio → nulo; `event_id` `^[A-Za-z0-9_-]{8,100}$`; `fbc`/`fbp` opcionais `^fb\.\d\.\d+\.[A-Za-z0-9_.-]{1,200}$`; campo desconhecido → 400; corpo > 8 KB → 413.
- Mesmo `event_id` na mesma loja → **200** com o mesmo `redirect`; novo → **201**. Resposta `{ "redirect", "capture_id" }`.
- Redirect: domínio próprio **ativo** da loja (`https://<hostname>/<slug>?cid=`) ou `getAppUrl()` + `/r/<slug>?cid=`.
- Teto: 120/min por IP no middleware; 60/min por chave no handler (`checkRateLimit("site-key:<tenant>", 60, 60_000)`) → 429.
- Nunca guardar IP, user-agent ou corpo cru; log sem telefone.
- `POST /api/integracoes/site/chave`: `settings:connection` (owner/admin); a vendedora já é barrada pelo mapa fechado de `lib/auth/modulos.ts` (não incluir as rotas novas lá).
- Testes: `node:test` + `node:assert/strict`; rodar em `apps/web` com `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`.
- Commits em inglês com prefixo semântico.

## Review Focus

- **`link` no corpo** (o mockup antigo mostrava): o corpo é `.strict()`, então `link` vira 400. O destino vem da integração. Coberto no teste do corpo.
- **Reenvio do mesmo `event_id` depois de o link mudar:** responde o redirect com o link **atual** da integração e o `capture_id` antigo. Coberto (teste do 200).
- **Domínio próprio pendente** (`status = 'pending'`): o redirect sai no host do app, nunca no domínio não verificado. Coberto.
- **Chave com espaço ou prefixo errado** (`Bearer  gk_live_…`, `gk_test_…`): 401 sem consultar o banco. Coberto.
- **Link da integração apagado:** 409 `{ "error": "link" }`, sem gravar cadastro. Coberto.

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/integracoes/chave-do-site.ts` (+ `.test.ts`) | gerar chave, hash, ler do cabeçalho |
| `apps/web/src/lib/integracoes/cadastro-do-site.ts` (+ `.test.ts`) | validar corpo, extrair UTMs |
| `apps/web/src/lib/integracoes/redirect-do-cadastro.ts` (+ `.test.ts`) | montar o link de volta |
| `apps/web/src/lib/stores/site-integrations.ts` | ler/gravar integração |
| `apps/web/src/lib/stores/site-captures.ts` (+ `.test.ts`) | gravar cadastro (idempotente) |
| `apps/web/src/lib/stores/tracked-links.ts` | + `getTrackedLinkById(tenantId, id)` |
| `apps/web/src/app/api/integracoes/cadastro/route.ts` (+ `route.test.ts`) | endpoint público |
| `apps/web/src/app/api/integracoes/site/chave/route.ts` (+ `route.test.ts`) | gerar chave |
| `apps/web/src/lib/security/request-access-policy.ts` (+ teste existente) | rota pública com teto |
| `apps/web/src/middleware.ts` | `RATE_LIMITS` |

---

### Task 1: Chave do site

**Files:**
- Create: `apps/web/src/lib/integracoes/chave-do-site.ts`
- Test: `apps/web/src/lib/integracoes/chave-do-site.test.ts`

**Interfaces:**
- Produces:
  - `type ChaveNova = { chave: string; hash: string; last4: string }`
  - `function gerarChave(): ChaveNova`
  - `function hashDaChave(chave: string): string` (sha256 hex, 64 chars)
  - `function chaveDoCabecalho(authorization: string | null): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/integracoes/chave-do-site.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { chaveDoCabecalho, gerarChave, hashDaChave } from "./chave-do-site";

test("gera chave gk_live_ de 43 caracteres, hash sha256 e os 4 últimos", () => {
  const { chave, hash, last4 } = gerarChave();
  assert.match(chave, /^gk_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(hash, createHash("sha256").update(chave).digest("hex"));
  assert.equal(last4, chave.slice(-4));
});

test("duas chaves nunca saem iguais", () => {
  assert.notEqual(gerarChave().chave, gerarChave().chave);
});

test("hash é determinístico e hexadecimal", () => {
  assert.equal(hashDaChave("gk_live_x"), hashDaChave("gk_live_x"));
  assert.match(hashDaChave("gk_live_x"), /^[0-9a-f]{64}$/);
});

test("lê a chave só de 'Bearer gk_live_<43>'", () => {
  const chave = `gk_live_${"A".repeat(43)}`;
  assert.equal(chaveDoCabecalho(`Bearer ${chave}`), chave);
  assert.equal(chaveDoCabecalho(null), null);
  assert.equal(chaveDoCabecalho(chave), null);
  assert.equal(chaveDoCabecalho(`Bearer  ${chave}`), chave);
  assert.equal(chaveDoCabecalho(`Bearer gk_test_${"A".repeat(43)}`), null);
  assert.equal(chaveDoCabecalho(`Bearer gk_live_${"A".repeat(42)}`), null);
  assert.equal(chaveDoCabecalho(`Bearer gk_live_${"A".repeat(43)}!`), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/chave-do-site.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/integracoes/chave-do-site.ts
import { createHash, randomBytes } from "node:crypto";

/**
 * Chave do site próprio do lojista (spec 2026-10-10-funil-anuncios §7).
 *
 * No banco só fica o sha256: quem lê a tabela não consegue se passar pela loja.
 * A busca é por igualdade do hash (índice único), então não existe comparação
 * de string da chave para medir tempo.
 */

const PREFIXO = "gk_live_";
const FORMATO = /^gk_live_[A-Za-z0-9_-]{43}$/;

export type ChaveNova = { chave: string; hash: string; last4: string };

export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

export function gerarChave(): ChaveNova {
  const chave = PREFIXO + randomBytes(32).toString("base64url");
  return { chave, hash: hashDaChave(chave), last4: chave.slice(-4) };
}

/** `Authorization: Bearer gk_live_…` → a chave; qualquer outro formato → null, sem ir ao banco. */
export function chaveDoCabecalho(authorization: string | null): string | null {
  const achado = /^Bearer\s+(\S+)$/.exec(authorization ?? "");
  if (!achado) return null;
  return FORMATO.test(achado[1]) ? achado[1] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/chave-do-site.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/integracoes/chave-do-site.ts apps/web/src/lib/integracoes/chave-do-site.test.ts
git commit -m "feat(integracoes): site integration key generation and parsing"
```

---

### Task 2: Leitura do corpo do cadastro

**Files:**
- Create: `apps/web/src/lib/integracoes/cadastro-do-site.ts`
- Test: `apps/web/src/lib/integracoes/cadastro-do-site.test.ts`

**Interfaces:**
- Consumes: `normalizeWhatsappBR(raw: string): string | null` de `@/lib/pages/phone`.
- Produces:
  - `type Utms = { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null }`
  - `type CadastroDoSite = { whatsapp: string; eventId: string; pageUrl: string; utm: Utms; fbclid: string | null; fbc: string | null; fbp: string | null }`
  - `type LeituraDoCadastro = { ok: true; cadastro: CadastroDoSite } | { ok: false; erro: "corpo" | "numero" }`
  - `function lerCadastro(bruto: unknown): LeituraDoCadastro`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/integracoes/cadastro-do-site.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { lerCadastro } from "./cadastro-do-site";

const BASE = {
  whatsapp: "62999998888",
  page_url:
    "https://modakidsdosul.com.br/vip?utm_source=ig&utm_medium=paid&utm_campaign=VIP%20Atacado%20%E2%80%94%20Goi%C3%A2nia&utm_term=Lojistas&utm_content=Ver%C3%A3o%20Kids&fbclid=abc123",
  event_id: "3f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  fbc: "fb.1.1728000000000.abc123",
  fbp: "fb.1.1727000000000.987654321",
};

test("lê o cadastro do site com UTMs decodificados da page_url", () => {
  const lido = lerCadastro(BASE);
  assert.ok(lido.ok);
  assert.equal(lido.cadastro.whatsapp, "+5562999998888");
  assert.equal(lido.cadastro.eventId, BASE.event_id);
  assert.deepEqual(lido.cadastro.utm, {
    source: "ig",
    medium: "paid",
    campaign: "VIP Atacado — Goiânia",
    content: "Verão Kids",
    term: "Lojistas",
  });
  assert.equal(lido.cadastro.fbclid, "abc123");
  assert.equal(lido.cadastro.fbc, BASE.fbc);
  assert.equal(lido.cadastro.fbp, BASE.fbp);
});

test("parâmetro vazio vira null, repetido vale o primeiro e longo é cortado em 200", () => {
  const longo = "x".repeat(300);
  const lido = lerCadastro({
    ...BASE,
    page_url: `https://loja.test/vip?utm_source=&utm_campaign=A&utm_campaign=B&utm_content=${longo}`,
    fbc: undefined,
    fbp: undefined,
  });
  assert.ok(lido.ok);
  assert.equal(lido.cadastro.utm.source, null);
  assert.equal(lido.cadastro.utm.campaign, "A");
  assert.equal(lido.cadastro.utm.content?.length, 200);
  assert.equal(lido.cadastro.fbc, null);
  assert.equal(lido.cadastro.fbclid, null);
});

test("número inválido é 'numero'; o resto inválido é 'corpo'", () => {
  assert.deepEqual(lerCadastro({ ...BASE, whatsapp: "123" }), { ok: false, erro: "numero" });
  assert.deepEqual(lerCadastro({ ...BASE, link: "vip-atacado" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, event_id: "curto" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, event_id: "tem espaço aqui!!" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, page_url: "javascript:alert(1)" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, page_url: "não é url" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, fbc: "qualquer coisa" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro(null), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro("texto"), { ok: false, erro: "corpo" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/cadastro-do-site.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/integracoes/cadastro-do-site.ts
import { z } from "zod";

import { normalizeWhatsappBR } from "@/lib/pages/phone";

/**
 * Corpo de POST /api/integracoes/cadastro (spec 2026-10-10-funil-anuncios §3).
 *
 * `.strictObject`: campo desconhecido é erro, não ignorado — um site que manda
 * `link` acha que escolhe o destino, e quem escolhe é a integração.
 * Os UTMs vêm da page_url, lidos aqui: o site não precisa saber quais são.
 */

const MAX_PARAMETRO = 200;
const COOKIE_DO_META = /^fb\.\d\.\d+\.[A-Za-z0-9_.-]{1,200}$/;

const corpoSchema = z.strictObject({
  whatsapp: z.string().max(40),
  page_url: z.string().max(2048),
  event_id: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  fbc: z.string().regex(COOKIE_DO_META).optional(),
  fbp: z.string().regex(COOKIE_DO_META).optional(),
});

export type Utms = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

export type CadastroDoSite = {
  whatsapp: string;
  eventId: string;
  pageUrl: string;
  utm: Utms;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
};

export type LeituraDoCadastro = { ok: true; cadastro: CadastroDoSite } | { ok: false; erro: "corpo" | "numero" };

function parametro(url: URL, nome: string): string | null {
  const valor = url.searchParams.get(nome)?.trim() ?? "";
  return valor ? valor.slice(0, MAX_PARAMETRO) : null;
}

function urlDaPagina(texto: string): URL | null {
  try {
    const url = new URL(texto);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function lerCadastro(bruto: unknown): LeituraDoCadastro {
  const lido = corpoSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, erro: "corpo" };
  const url = urlDaPagina(lido.data.page_url);
  if (!url) return { ok: false, erro: "corpo" };
  const whatsapp = normalizeWhatsappBR(lido.data.whatsapp);
  if (!whatsapp) return { ok: false, erro: "numero" };
  return {
    ok: true,
    cadastro: {
      whatsapp,
      eventId: lido.data.event_id,
      pageUrl: url.toString(),
      utm: {
        source: parametro(url, "utm_source"),
        medium: parametro(url, "utm_medium"),
        campaign: parametro(url, "utm_campaign"),
        content: parametro(url, "utm_content"),
        term: parametro(url, "utm_term"),
      },
      fbclid: parametro(url, "fbclid"),
      fbc: lido.data.fbc ?? null,
      fbp: lido.data.fbp ?? null,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/cadastro-do-site.test.ts`
Expected: PASS (3 testes). Se o caso `fbc: undefined` falhar por `strictObject` recusar chave com `undefined`, trocar no teste por um objeto sem as chaves (`const { fbc, fbp, ...semCookies } = BASE`) — o JSON real nunca traz `undefined`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/integracoes/cadastro-do-site.ts apps/web/src/lib/integracoes/cadastro-do-site.test.ts
git commit -m "feat(integracoes): validate site signup payload and read UTMs from page_url"
```

---

### Task 3: Link de volta (redirect)

**Files:**
- Create: `apps/web/src/lib/integracoes/redirect-do-cadastro.ts`
- Test: `apps/web/src/lib/integracoes/redirect-do-cadastro.test.ts`

**Interfaces:**
- Consumes: `campaignLinkPath(origin: string, slug: string): string` de `@/lib/custom-domains/host`; `getAppUrl(): string` de `@/lib/environment`.
- Produces: `function redirectDoCadastro(entrada: { dominioAtivo: string | null; slug: string; captureId: string }): string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/integracoes/redirect-do-cadastro.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { redirectDoCadastro } from "./redirect-do-cadastro";

const CID = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";

test("sem domínio próprio: host do app com /r/<slug>?cid=", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.girumo.com.br/";
  assert.equal(
    redirectDoCadastro({ dominioAtivo: null, slug: "vip-atacado", captureId: CID }),
    `https://app.girumo.com.br/r/vip-atacado?cid=${CID}`,
  );
});

test("domínio próprio ativo: link na raiz do domínio da loja", () => {
  assert.equal(
    redirectDoCadastro({ dominioAtivo: "links.modakidsdosul.com.br", slug: "vip-atacado", captureId: CID }),
    `https://links.modakidsdosul.com.br/vip-atacado?cid=${CID}`,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/redirect-do-cadastro.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/integracoes/redirect-do-cadastro.ts
import { campaignLinkPath } from "@/lib/custom-domains/host";
import { getAppUrl } from "@/lib/environment";

/**
 * Para onde o site manda a pessoa depois do cadastro: o link de grupo da loja
 * com o id do cadastro (`cid`), que o /r/ grava junto do clique.
 *
 * Domínio próprio só entra ATIVO (quem chama já filtrou): pendente ainda não
 * serve link, e mandar a pessoa para lá seria mandá-la para um 404.
 */
export function redirectDoCadastro(entrada: { dominioAtivo: string | null; slug: string; captureId: string }): string {
  const origem = entrada.dominioAtivo ? `https://${entrada.dominioAtivo}` : getAppUrl().replace(/\/+$/, "");
  const url = new URL(campaignLinkPath(origem, entrada.slug), origem);
  url.searchParams.set("cid", entrada.captureId);
  return url.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/redirect-do-cadastro.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/integracoes/redirect-do-cadastro.ts apps/web/src/lib/integracoes/redirect-do-cadastro.test.ts
git commit -m "feat(integracoes): build the group link returned to the store's site"
```

---

### Task 4: Stores (integração, cadastro, link por id)

**Files:**
- Create: `apps/web/src/lib/stores/site-integrations.ts`
- Create: `apps/web/src/lib/stores/site-captures.ts`
- Modify: `apps/web/src/lib/stores/tracked-links.ts` (acrescentar `getTrackedLinkById` depois de `getTrackedLinkBySlug`)
- Test: `apps/web/src/lib/stores/site-captures.test.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin()` de `@/lib/supabase/server`; tipos `CadastroDoSite` (Task 2).
- Produces:
  - `type SiteIntegration = { tenantId: string; keyLast4: string; trackedLinkId: string; createdAt: string; rotatedAt: string | null; lastUsedAt: string | null }`
  - `integracaoPelaChave(keyHash: string): Promise<SiteIntegration | null>` (sem tenant: ponto de entrada; `key_hash` é único)
  - `integracaoDaLoja(tenantId: string): Promise<SiteIntegration | null>`
  - `salvarChave(tenantId: string, chave: { hash: string; last4: string; trackedLinkId: string }): Promise<void>`
  - `marcarUso(tenantId: string): Promise<void>`
  - `gravarCadastro(tenantId: string, trackedLinkId: string, cadastro: CadastroDoSite): Promise<{ id: string; novo: boolean }>`
  - `cadastroDaLoja(tenantId: string, id: string): Promise<boolean>` (usado no PR 4)
  - `getTrackedLinkById(tenantId: string, id: string): Promise<TrackedLink | null>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/stores/site-captures.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { CadastroDoSite } from "@/lib/integracoes/cadastro-do-site";
import { cadastroDaLoja, gravarCadastro } from "./site-captures";
import { integracaoPelaChave, salvarChave } from "./site-integrations";
import { getTrackedLinkById } from "./tracked-links";

/** O cliente real do Supabase contra um PostgREST de mentira (mesmo molde de ig-accounts.test.ts). */

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };
const pedidos: Pedido[] = [];
let respostas: { status: number; body: unknown }[] = [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? ""), corpo: bruto ? JSON.parse(bruto) : null });
    const proxima = respostas.shift() ?? { status: 200, body: [] };
    res.setHeader("Content-Type", "application/json");
    res.statusCode = proxima.status;
    res.end(JSON.stringify(proxima.body));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

const CADASTRO: CadastroDoSite = {
  whatsapp: "+5562999998888",
  eventId: "evento-123456",
  pageUrl: "https://loja.test/vip?utm_campaign=C1",
  utm: { source: "ig", medium: "paid", campaign: "C1", content: "A1", term: "S1" },
  fbclid: null,
  fbc: "fb.1.1.abc",
  fbp: null,
};

test("grava o cadastro com a loja e o link da integração, sem IP nem user-agent", async () => {
  pedidos.length = 0;
  respostas = [{ status: 201, body: { id: "cad-1" } }];
  assert.deepEqual(await gravarCadastro("loja-a", "link-1", CADASTRO), { id: "cad-1", novo: true });
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/site_captures"]);
  assert.deepEqual(corpo, {
    tenant_id: "loja-a",
    tracked_link_id: "link-1",
    whatsapp: "+5562999998888",
    event_id: "evento-123456",
    page_url: "https://loja.test/vip?utm_campaign=C1",
    utm_source: "ig",
    utm_medium: "paid",
    utm_campaign: "C1",
    utm_content: "A1",
    utm_term: "S1",
    fbclid: null,
    fbc: "fb.1.1.abc",
    fbp: null,
  });
});

test("mesmo event_id (23505) devolve o cadastro existente da MESMA loja, novo = false", async () => {
  pedidos.length = 0;
  respostas = [
    { status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint", details: null, hint: null } },
    { status: 200, body: [{ id: "cad-antigo" }] },
  ];
  assert.deepEqual(await gravarCadastro("loja-a", "link-1", CADASTRO), { id: "cad-antigo", novo: false });
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", event_id: "eq.evento-123456", limit: "1" });
});

test("outro erro do banco estoura com a mensagem", async () => {
  respostas = [{ status: 500, body: { code: "XX000", message: "caiu", details: null, hint: null } }];
  await assert.rejects(gravarCadastro("loja-a", "link-1", CADASTRO), /caiu/);
});

test("cadastroDaLoja filtra pela loja e pelo id", async () => {
  pedidos.length = 0;
  respostas = [{ status: 200, body: [{ id: "cad-1" }] }, { status: 200, body: [] }];
  assert.equal(await cadastroDaLoja("loja-a", "cad-1"), true);
  assert.equal(await cadastroDaLoja("loja-b", "cad-1"), false);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.cad-1", limit: "1" });
});

test("integração pela chave lê só pelo hash e não pede o hash de volta", async () => {
  pedidos.length = 0;
  respostas = [{ status: 200, body: [{ tenant_id: "loja-a", key_last4: "AbCd", tracked_link_id: "link-1", created_at: "t", rotated_at: null, last_used_at: null }] }];
  const integracao = await integracaoPelaChave("f".repeat(64));
  assert.deepEqual(integracao, { tenantId: "loja-a", keyLast4: "AbCd", trackedLinkId: "link-1", createdAt: "t", rotatedAt: null, lastUsedAt: null });
  assert.deepEqual(filtros(pedidos[0].url), { key_hash: `eq.${"f".repeat(64)}`, limit: "1" });
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("key_hash"));
});

test("salvar chave faz upsert por loja com o hash, nunca a chave", async () => {
  pedidos.length = 0;
  respostas = [{ status: 201, body: [] }];
  await salvarChave("loja-a", { hash: "a".repeat(64), last4: "WXYZ", trackedLinkId: "link-1" });
  assert.equal(pedidos[0].url.searchParams.get("on_conflict"), "tenant_id");
  assert.match(pedidos[0].prefer, /resolution=merge-duplicates/);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.tenant_id, "loja-a");
  assert.equal(corpo.key_hash, "a".repeat(64));
  assert.equal(corpo.key_last4, "WXYZ");
  assert.equal(corpo.tracked_link_id, "link-1");
  assert.equal(typeof corpo.rotated_at, "string");
});

test("link por id filtra pela loja", async () => {
  pedidos.length = 0;
  respostas = [{ status: 200, body: [] }];
  assert.equal(await getTrackedLinkById("loja-a", "link-9"), null);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.link-9", limit: "1" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/site-captures.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/stores/site-captures.ts
import "server-only";

import type { CadastroDoSite } from "@/lib/integracoes/cadastro-do-site";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "site_captures";
const UNIQUE_VIOLATION = "23505";

/**
 * Grava o cadastro do site. O mesmo `event_id` na mesma loja (o site reenvia no
 * segundo toque) devolve o cadastro que já existe, com `novo = false`.
 * Nunca recebe nem grava IP ou user-agent (spec §7).
 */
export async function gravarCadastro(
  tenantId: string,
  trackedLinkId: string,
  cadastro: CadastroDoSite,
): Promise<{ id: string; novo: boolean }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      tracked_link_id: trackedLinkId,
      whatsapp: cadastro.whatsapp,
      event_id: cadastro.eventId,
      page_url: cadastro.pageUrl,
      utm_source: cadastro.utm.source,
      utm_medium: cadastro.utm.medium,
      utm_campaign: cadastro.utm.campaign,
      utm_content: cadastro.utm.content,
      utm_term: cadastro.utm.term,
      fbclid: cadastro.fbclid,
      fbc: cadastro.fbc,
      fbp: cadastro.fbp,
    })
    .select("id")
    .single();
  if (!error) return { id: (data as { id: string }).id, novo: true };
  if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message);

  const { data: existente, error: erroLeitura } = await supabase
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("event_id", cadastro.eventId)
    .limit(1);
  if (erroLeitura) throw new Error(erroLeitura.message);
  const id = (existente as { id: string }[] | null)?.[0]?.id;
  if (!id) throw new Error("cadastro duplicado sumiu entre o insert e a leitura");
  return { id, novo: false };
}

/** O cadastro existe E é desta loja — o /r/ só aceita `cid` que passa aqui (PR 4). */
export async function cadastroDaLoja(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
```

```ts
// apps/web/src/lib/stores/site-integrations.ts
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "site_integrations";
// Sem key_hash: o hash entra no filtro e nunca volta na resposta.
const COLS = "tenant_id, key_last4, tracked_link_id, created_at, rotated_at, last_used_at";

export type SiteIntegration = {
  tenantId: string;
  keyLast4: string;
  trackedLinkId: string;
  createdAt: string;
  rotatedAt: string | null;
  lastUsedAt: string | null;
};

type Row = {
  tenant_id: string;
  key_last4: string;
  tracked_link_id: string;
  created_at: string;
  rotated_at: string | null;
  last_used_at: string | null;
};

function toIntegration(r: Row): SiteIntegration {
  return {
    tenantId: r.tenant_id,
    keyLast4: r.key_last4,
    trackedLinkId: r.tracked_link_id,
    createdAt: r.created_at,
    rotatedAt: r.rotated_at,
    lastUsedAt: r.last_used_at,
  };
}

/**
 * Única leitura SEM `.eq("tenant_id")`, e de propósito: é a chave que descobre a
 * loja (ponto de entrada público, como getTrackedLinkBySlug). `key_hash` é único,
 * então no máximo uma linha casa, e o tenant_id dela filtra todo o resto.
 */
export async function integracaoPelaChave(keyHash: string): Promise<SiteIntegration | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select(COLS).eq("key_hash", keyHash).limit(1);
  if (error) throw new Error(error.message);
  const linha = (data as Row[] | null)?.[0];
  return linha ? toIntegration(linha) : null;
}

export async function integracaoDaLoja(tenantId: string): Promise<SiteIntegration | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select(COLS).eq("tenant_id", tenantId).limit(1);
  if (error) throw new Error(error.message);
  const linha = (data as Row[] | null)?.[0];
  return linha ? toIntegration(linha) : null;
}

/** Uma integração por loja: gerar outra chave sobrescreve o hash, e a anterior para na hora. */
export async function salvarChave(
  tenantId: string,
  chave: { hash: string; last4: string; trackedLinkId: string },
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        tenant_id: tenantId,
        key_hash: chave.hash,
        key_last4: chave.last4,
        tracked_link_id: chave.trackedLinkId,
        rotated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
  if (error) throw new Error(error.message);
}

export async function marcarUso(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ last_used_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
```

Em `apps/web/src/lib/stores/tracked-links.ts`, logo depois de `getTrackedLinkBySlug`:

```ts
/** Link da loja pelo id — sempre com o tenant (a integração do site guarda o id). */
export async function getTrackedLinkById(tenantId: string, id: string): Promise<TrackedLink | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data as TrackedLink[] | null)?.[0] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/site-captures.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/site-captures.ts apps/web/src/lib/stores/site-integrations.ts apps/web/src/lib/stores/tracked-links.ts apps/web/src/lib/stores/site-captures.test.ts
git commit -m "feat(stores): site captures and site integration stores, tenant-scoped"
```

---

### Task 5: `POST /api/integracoes/cadastro` + política de acesso + teto

**Files:**
- Create: `apps/web/src/app/api/integracoes/cadastro/route.ts`
- Test: `apps/web/src/app/api/integracoes/cadastro/route.test.ts`
- Modify: `apps/web/src/lib/security/request-access-policy.ts` (perto da linha de `POST /api/track/outbound`)
- Modify: `apps/web/src/lib/security/request-access-policy.test.ts` (perto do teste de `/api/track/outbound`)
- Modify: `apps/web/src/middleware.ts` (`RATE_LIMITS`, antes de `"/api/track/outbound"`)

**Interfaces:**
- Consumes: Tasks 1–4; `getCustomDomain(tenantId): Promise<CustomDomain | null>` de `@/lib/stores/custom-domains`; `checkRateLimit(id, max, windowMs): Promise<boolean>` (true = bloqueado) de `@/lib/security/rate-limit`; `USE_SUPABASE` de `@/lib/stores/use-supabase`.
- Produces: `POST /api/integracoes/cadastro` → `201|200 { redirect, capture_id }`, `400|401|409|413|422|429|500|503 { error }`.

- [ ] **Step 1: Write the failing tests**

No `request-access-policy.test.ts`, junto dos de `/api/track/outbound`:

```ts
test("cadastro do site próprio é público com teto, só no POST e só no path exato", () => {
  assert.equal(classifyRequest("/api/integracoes/cadastro", "POST"), "public-rate-limited");
  assert.equal(classifyRequest("/api/integracoes/cadastro", "GET"), "user");
  assert.equal(classifyRequest("/api/integracoes/cadastro/outra", "POST"), "user");
  assert.equal(classifyRequest("/api/integracoes/site/chave", "POST"), "user");
});
```

E a rota:

```ts
// apps/web/src/app/api/integracoes/cadastro/route.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { hashDaChave } from "@/lib/integracoes/chave-do-site";
import { POST } from "./route";

/**
 * A rota inteira contra um PostgREST de mentira, por "MÉTODO /caminho".
 * Chamada que ninguém previu vira 500, para aparecer.
 */

const CHAVE = `gk_live_${"A".repeat(43)}`;
const HASH = hashDaChave(CHAVE);
const CID = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";

type Chamada = { metodo: string; url: URL; corpo: unknown; accept: string };
type Resposta = { status: number; corpo?: unknown };
const chamadas: Chamada[] = [];
let tabelas: Record<string, (c: Chamada) => Resposta> = {};

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
      accept: String(req.headers.accept ?? ""),
    };
    chamadas.push(chamada);
    const responder = tabelas[`${chamada.metodo} ${chamada.url.pathname}`];
    const { status, corpo } = responder ? responder(chamada) : { status: 500, corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` } };
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.HUBFLOW_USE_SUPABASE = "1";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.girumo.com.br";
});
after(() => { supabase.close(); });

const INTEGRACAO = { tenant_id: "loja-a", key_last4: "AAAA", tracked_link_id: "link-1", created_at: "t", rotated_at: null, last_used_at: null };
const LINK = { id: "link-1", tenant_id: "loja-a", slug: "vip-atacado", campaign_group_id: "camp-1", target_url: "x", clicks: 0, metadata: {}, created_at: "t", updated_at: "t" };
const SEM_LINHA = { status: 406, corpo: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null } };

/** Banco "feliz": chave válida, link existe, sem domínio próprio, cadastro novo. */
function bancoFeliz(extra: Record<string, (c: Chamada) => Resposta> = {}): void {
  tabelas = {
    "GET /rest/v1/site_integrations": (c) => ({ status: 200, corpo: c.url.searchParams.get("key_hash") === `eq.${HASH}` ? [INTEGRACAO] : [] }),
    "GET /rest/v1/tracked_links": () => ({ status: 200, corpo: [LINK] }),
    "POST /rest/v1/site_captures": () => ({ status: 201, corpo: { id: CID } }),
    "GET /rest/v1/custom_domains": () => SEM_LINHA,
    "PATCH /rest/v1/site_integrations": () => ({ status: 204 }),
    ...extra,
  };
}

const CORPO = {
  whatsapp: "62999998888",
  page_url: "https://modakidsdosul.com.br/vip?utm_source=ig&utm_campaign=C1&utm_term=S1&utm_content=A1",
  event_id: "3f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
};

function enviar(corpo: unknown, chave: string | null = CHAVE, ip = "203.0.113.7"): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "Cloudflare-Workers" };
  if (chave) headers.authorization = `Bearer ${chave}`;
  return new Request("https://app.girumo.com.br/api/integracoes/cadastro", {
    method: "POST",
    headers,
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

test("cadastro novo: 201 com o link do app e o cid; grava a loja da CHAVE, nunca IP nem user-agent", async () => {
  chamadas.length = 0;
  bancoFeliz();
  const resposta = await POST(enviar(CORPO));
  assert.equal(resposta.status, 201);
  assert.deepEqual(await resposta.json(), {
    redirect: `https://app.girumo.com.br/r/vip-atacado?cid=${CID}`,
    capture_id: CID,
  });
  const [insert] = feitas("POST", "/rest/v1/site_captures");
  const gravado = insert.corpo as Record<string, unknown>;
  assert.equal(gravado.tenant_id, "loja-a");
  assert.equal(gravado.tracked_link_id, "link-1");
  assert.equal(gravado.whatsapp, "+5562999998888");
  assert.equal(gravado.utm_campaign, "C1");
  assert.ok(!JSON.stringify(gravado).includes("203.0.113.7"));
  assert.ok(!JSON.stringify(gravado).includes("Cloudflare-Workers"));
  assert.equal(feitas("PATCH", "/rest/v1/site_integrations").length, 1);
});

test("mesmo event_id: 200 com o cadastro antigo e o link ATUAL da integração", async () => {
  chamadas.length = 0;
  bancoFeliz({
    "POST /rest/v1/site_captures": () => ({ status: 409, corpo: { code: "23505", message: "duplicate key", details: null, hint: null } }),
    "GET /rest/v1/site_captures": () => ({ status: 200, corpo: [{ id: "cad-antigo" }] }),
    "GET /rest/v1/tracked_links": () => ({ status: 200, corpo: [{ ...LINK, slug: "link-novo" }] }),
  });
  const resposta = await POST(enviar(CORPO));
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), {
    redirect: "https://app.girumo.com.br/r/link-novo?cid=cad-antigo",
    capture_id: "cad-antigo",
  });
});

test("domínio próprio ATIVO: link na raiz do domínio da loja; PENDENTE: host do app", async () => {
  const dominio = (status: string) => () => ({
    status: 200,
    corpo: { tenant_id: "loja-a", hostname: "links.modakidsdosul.com.br", verification_token: "t", status, last_error: null, checked_at: null, verified_at: null },
  });
  bancoFeliz({ "GET /rest/v1/custom_domains": dominio("active") });
  const ativo = await (await POST(enviar(CORPO))).json();
  assert.equal(ativo.redirect, `https://links.modakidsdosul.com.br/vip-atacado?cid=${CID}`);

  bancoFeliz({ "GET /rest/v1/custom_domains": dominio("pending") });
  const pendente = await (await POST(enviar(CORPO))).json();
  assert.equal(pendente.redirect, `https://app.girumo.com.br/r/vip-atacado?cid=${CID}`);
});

test("sem chave, chave malformada ou desconhecida: 401 e nada gravado", async () => {
  chamadas.length = 0;
  bancoFeliz();
  assert.equal((await POST(enviar(CORPO, null))).status, 401);
  assert.equal((await POST(enviar(CORPO, "gk_test_xyz"))).status, 401);
  assert.equal(chamadas.length, 0, "formato errado não vai ao banco");
  assert.equal((await POST(enviar(CORPO, `gk_live_${"B".repeat(43)}`))).status, 401);
  assert.equal(feitas("POST", "/rest/v1/site_captures").length, 0);
});

test("número inválido: 422 'numero'; corpo inválido: 400; corpo grande: 413", async () => {
  bancoFeliz();
  const numero = await POST(enviar({ ...CORPO, whatsapp: "123" }));
  assert.equal(numero.status, 422);
  assert.deepEqual(await numero.json(), { error: "numero" });
  assert.equal((await POST(enviar({ ...CORPO, link: "vip-atacado" }))).status, 400);
  assert.equal((await POST(enviar("{não é json"))).status, 400);
  assert.equal((await POST(enviar({ ...CORPO, page_url: `https://x.test/?a=${"x".repeat(9000)}` }))).status, 413);
});

test("link da integração apagado: 409 'link' sem gravar cadastro", async () => {
  chamadas.length = 0;
  bancoFeliz({ "GET /rest/v1/tracked_links": () => ({ status: 200, corpo: [] }) });
  const resposta = await POST(enviar(CORPO));
  assert.equal(resposta.status, 409);
  assert.deepEqual(await resposta.json(), { error: "link" });
  assert.equal(feitas("POST", "/rest/v1/site_captures").length, 0);
});

test("erro do banco: 500 sem vazar a mensagem", async () => {
  bancoFeliz({ "POST /rest/v1/site_captures": () => ({ status: 500, corpo: { code: "XX000", message: "senha do banco: segredo", details: null, hint: null } }) });
  const resposta = await POST(enviar(CORPO));
  assert.equal(resposta.status, 500);
  assert.ok(!(await resposta.text()).includes("segredo"));
});

test("passou de 60 por minuto na mesma chave: 429", async () => {
  bancoFeliz({ "GET /rest/v1/site_integrations": () => ({ status: 200, corpo: [{ ...INTEGRACAO, tenant_id: "loja-teto" }] }) });
  let ultimo = 0;
  for (let i = 0; i < 61; i++) ultimo = (await POST(enviar({ ...CORPO, event_id: `evento-teto-${i}` }))).status;
  assert.equal(ultimo, 429);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/request-access-policy.test.ts src/app/api/integracoes/cadastro/route.test.ts`
Expected: FAIL — rota não existe; a política devolve `"user"` para o POST.

- [ ] **Step 3: Write minimal implementation**

Em `request-access-policy.ts`, logo depois da linha de `POST /api/track/outbound`:

```ts
  // Cadastro do site próprio do lojista (funil de anúncios). Sem sessão por
  // natureza: quem chama é o servidor do site, autenticado pela chave no handler,
  // que também aplica o teto por chave. Path EXATO, pelo mesmo motivo do beacon.
  if (key === "POST /api/integracoes/cadastro") return "public-rate-limited";
```

Em `middleware.ts`, dentro de `RATE_LIMITS`, antes de `"/api/track/outbound"`:

```ts
  // Cadastro do site próprio: o IP é o do Cloudflare do lojista, compartilhado
  // entre muitos sites — teto folgado aqui; o de verdade é por chave, no handler.
  "/api/integracoes/cadastro": 120,
```

A rota:

```ts
// apps/web/src/app/api/integracoes/cadastro/route.ts
import { lerCadastro } from "@/lib/integracoes/cadastro-do-site";
import { chaveDoCabecalho, hashDaChave } from "@/lib/integracoes/chave-do-site";
import { redirectDoCadastro } from "@/lib/integracoes/redirect-do-cadastro";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { gravarCadastro } from "@/lib/stores/site-captures";
import { integracaoPelaChave, marcarUso } from "@/lib/stores/site-integrations";
import { getTrackedLinkById } from "@/lib/stores/tracked-links";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CORPO = 8 * 1024;
const TETO_POR_CHAVE = 60;
const JANELA_MS = 60_000;

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/integracoes/cadastro — o servidor do site do lojista manda o cadastro
 * e recebe o link do grupo com o `cid` (spec 2026-10-10-funil-anuncios §3).
 *
 * A loja sai da CHAVE, nunca do corpo. O site tem 2 s e cai no link de sempre se
 * isto falhar (spec §5): nenhuma resposta daqui pode prender a pessoa fora do grupo.
 */
export async function POST(req: Request): Promise<Response> {
  if (!USE_SUPABASE) return resposta({ error: "indisponivel" }, 503);

  const chave = chaveDoCabecalho(req.headers.get("authorization"));
  if (!chave) return resposta({ error: "nao_autorizado" }, 401);

  try {
    const integracao = await integracaoPelaChave(hashDaChave(chave));
    if (!integracao) return resposta({ error: "nao_autorizado" }, 401);
    const tenantId = integracao.tenantId;

    if (await checkRateLimit(`site-key:${tenantId}`, TETO_POR_CHAVE, JANELA_MS)) {
      return resposta({ error: "limite" }, 429);
    }

    const texto = await req.text();
    if (texto.length > MAX_CORPO) return resposta({ error: "corpo" }, 413);
    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch {
      return resposta({ error: "corpo" }, 400);
    }
    const lido = lerCadastro(bruto);
    if (!lido.ok) return resposta({ error: lido.erro }, lido.erro === "numero" ? 422 : 400);

    const link = await getTrackedLinkById(tenantId, integracao.trackedLinkId);
    if (!link) return resposta({ error: "link" }, 409);

    const { id, novo } = await gravarCadastro(tenantId, link.id, lido.cadastro);
    const dominio = await getCustomDomain(tenantId);
    const redirect = redirectDoCadastro({
      dominioAtivo: dominio?.status === "active" ? dominio.hostname : null,
      slug: link.slug,
      captureId: id,
    });

    // "Último cadastro há N min" na tela de integração. Falhar aqui não derruba o cadastro.
    await marcarUso(tenantId).catch((e: unknown) =>
      console.warn(`[integracoes/cadastro] last_used_at de ${tenantId}: ${(e as Error).message}`),
    );

    return resposta({ redirect, capture_id: id }, novo ? 201 : 200);
  } catch (e) {
    console.error(`[integracoes/cadastro] falha: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/request-access-policy.test.ts src/app/api/integracoes/cadastro/route.test.ts`
Expected: PASS. Se o caso de domínio próprio falhar porque `getCustomDomain` (`maybeSingle`) pede objeto e o falso devolveu objeto mas o cliente esperava outra forma, conferir o `accept` da chamada em `chamadas` e responder no formato pedido (objeto quando o `accept` tem `pgrst.object`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/integracoes/cadastro apps/web/src/lib/security/request-access-policy.ts apps/web/src/lib/security/request-access-policy.test.ts apps/web/src/middleware.ts
git commit -m "feat(integracoes): public signup endpoint for the store's own site"
```

---

### Task 6: `POST /api/integracoes/site/chave`

**Files:**
- Create: `apps/web/src/app/api/integracoes/site/chave/route.ts`
- Test: `apps/web/src/app/api/integracoes/site/chave/route.test.ts`

**Interfaces:**
- Consumes: `getRouteTenantContext(req, { allowEngine: false })` de `@/lib/route-tenant-context`; `hasPermission(role, "settings:connection")` de `@/lib/permissions`; `gerarChave`, `salvarChave`, `getTrackedLinkById`.
- Produces: `POST /api/integracoes/site/chave` com `{ "tracked_link_id": "<uuid>" }` → `201 { chave, key_last4, link: { id, slug } }` (`cache-control: no-store`); `400|403|404|500`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/integracoes/site/chave/route.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { POST } from "./route";

/** Dono logado por Bearer (mesmo molde de api/orders/route.test.ts). */

const LINK = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let linkDaLoja = true;

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    chamadas.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined });
    const chave = `${req.method} ${url.pathname}`;
    let status = 500;
    let corpo: unknown = { message: `inesperado: ${chave}` };
    if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
    else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel }]];
    else if (chave === "GET /rest/v1/tracked_links") [status, corpo] = [200, linkDaLoja ? [{ id: LINK, tenant_id: "loja-b", slug: "vip-atacado" }] : []];
    else if (chave === "POST /rest/v1/site_integrations") [status, corpo] = [201, []];
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
});
after(() => { supabase.close(); });

function pedir(corpo: unknown): Request {
  return new Request("http://girumo.test/api/integracoes/site/chave", {
    method: "POST",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

test("dono gera chave: 201, mostra a chave uma vez e grava só o hash", async () => {
  chamadas.length = 0;
  papel = "owner";
  linkDaLoja = true;
  const resposta = await POST(pedir({ tracked_link_id: LINK }));
  assert.equal(resposta.status, 201);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const corpo = await resposta.json();
  assert.match(corpo.chave, /^gk_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(corpo.key_last4, corpo.chave.slice(-4));
  assert.deepEqual(corpo.link, { id: LINK, slug: "vip-atacado" });

  const upsert = chamadas.find((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/site_integrations");
  const gravado = upsert?.corpo as Record<string, unknown>;
  assert.equal(gravado.tenant_id, "loja-b");
  assert.equal(gravado.key_hash, createHash("sha256").update(corpo.chave).digest("hex"));
  assert.ok(!JSON.stringify(gravado).includes(corpo.chave));
});

test("operador e vendedora não geram chave (403) e nada é gravado", async () => {
  for (const p of ["operator", "seller"]) {
    chamadas.length = 0;
    papel = p;
    assert.equal((await POST(pedir({ tracked_link_id: LINK }))).status, 403);
    assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/site_integrations").length, 0);
  }
});

test("link de outra loja: 404; corpo inválido: 400", async () => {
  papel = "owner";
  linkDaLoja = false;
  assert.equal((await POST(pedir({ tracked_link_id: LINK }))).status, 404);
  linkDaLoja = true;
  assert.equal((await POST(pedir({ tracked_link_id: "nao-e-uuid" }))).status, 400);
  assert.equal((await POST(pedir({}))).status, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/integracoes/site/chave/route.test.ts`
Expected: FAIL — rota não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/app/api/integracoes/site/chave/route.ts
import { z } from "zod";

import { gerarChave } from "@/lib/integracoes/chave-do-site";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { salvarChave } from "@/lib/stores/site-integrations";
import { getTrackedLinkById } from "@/lib/stores/tracked-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({ tracked_link_id: z.uuid() });

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/integracoes/site/chave — gera (ou troca) a chave do site próprio.
 * A chave inteira só existe nesta resposta; no banco fica o hash. Gerar outra
 * desliga a anterior na hora (spec 2026-10-10-funil-anuncios §3).
 */
export async function POST(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    tenantId = ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    return resposta({ error: "erro" }, 500);
  }

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return resposta({ error: "JSON inválido." }, 400);
  }
  const lido = corpoSchema.safeParse(bruto);
  if (!lido.success) return resposta({ error: "Escolha o link de destino." }, 400);

  try {
    const link = await getTrackedLinkById(tenantId, lido.data.tracked_link_id);
    if (!link) return resposta({ error: "Link não encontrado." }, 404);
    const nova = gerarChave();
    await salvarChave(tenantId, { hash: nova.hash, last4: nova.last4, trackedLinkId: link.id });
    return resposta({ chave: nova.chave, key_last4: nova.last4, link: { id: link.id, slug: link.slug } }, 201);
  } catch (e) {
    console.error(`[integracoes/site/chave] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível gerar a chave." }, 500);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/integracoes/site/chave/route.test.ts`
Expected: PASS (3 testes). Se a vendedora devolver outro status que não 403 porque `getRouteTenantContext` barra o papel antes (mapa de módulos), aceitar o status que ele lançar desde que **nada** seja gravado: ajustar a asserção para `assert.ok([403].includes(status))` só depois de ler `route-tenant-context.ts` e confirmar de onde vem.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/integracoes/site/chave
git commit -m "feat(integracoes): owner/admin can generate the site integration key"
```

---

### Task 7: Verificação final, PR e chave da loja-piloto

- [ ] **Step 1:** Em `apps/web`: `npm run lint`, `npx tsc --noEmit` e `npm test` — tudo verde.
- [ ] **Step 2:** Rodar `scripts/verify-local.ps1` se existir na raiz (gate de secrets + build antes do push); senão o CI.
- [ ] **Step 3:** Push e PR "feat(integracoes): signup endpoint and key for the store's own site (funil de anúncios, PR 2)". No corpo: os contratos de request/response, o teto (120/min IP, 60/min chave), e que a tela vem no PR 3. Terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 4:** Depois do deploy, gerar a chave da loja-piloto (a tela vem no PR 3). Primeiro o id do link, por leitura em prod:

```sql
select id, slug from public.tracked_links
 where tenant_id = '076cafce-4aa6-4203-8b60-3b68228e886f' and slug = 'vip-atacado';
```

Depois, **logado como dona/admin** no painel, no console do navegador (com o `id` acima):

```js
const r = await fetch("/api/integracoes/site/chave", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tracked_link_id: "<id do vip-atacado>" }),
});
console.log(r.status, await r.json());
```

Guardar a `chave` como secret `GIRUMO_KEY` da função do site (spec §5). Ela não aparece de novo.
- [ ] **Step 5:** Card: `select public.move_card('funil-anuncios', 'em_construcao', 'PR 2: endpoint de cadastro e chave no ar', 'PR #<n>');`
