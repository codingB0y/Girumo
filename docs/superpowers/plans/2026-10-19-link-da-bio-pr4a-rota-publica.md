# Link da bio — PR 4a: rota pública Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A página do link da bio abre em `https://www.girumo.com.br/bio/<slug>` e na raiz do domínio próprio da loja, com a CSP de nonce, `noindex`, 301 do slug antigo, 308 de `app.`/apex e contagem de visita; renomear ou apagar campanha invalida o cache da página.

**Architecture:** `app/bio/[slug]/route.ts` (GET e HEAD) só chama `responderBio` (`lib/bio/rota-publica.ts`), que decide a resposta com o cache do PR 2 e o HTML do PR 3a, e agenda a visita em `after()`. Cache e banco entram por parâmetro (`DepsBio`, o desenho de `renomearSlugCampanha`), então o handler é testado sem rede. Os registros de rota pública (CSP, matcher, `headers()`, robots, 308) seguem o padrão de `/r/` e `/c/`. A raiz do domínio próprio é um rewrite do middleware para `/bio/_dominio` (irmã de `rootLinkResponse`), e a regra global de `headers()` passa a se dividir por host na raiz para não sair CSP dupla.

**Tech Stack:** Next 15.5 route handler + middleware (Edge), `unstable_cache`/`revalidateTag` (via PR 2), Supabase service role, `node:test` via tsx, Playwright contra o banco de dev.

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` (§2 endereço, §6 rota e cache, §7 só a visita, §10 host, linha 4a do §12). Índice: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`.

**Depende de:** PR 1 (tabelas e `bio_contar` nos dois bancos), PR 2 (`cache.ts`, `documento.ts`, store `bio-pages.ts`), PR 3a (`lib/bio/render/index.ts`). O 4b e o 6a só depois da Parte 2 em `main`.

## Por que duas partes

Num PR só seriam 17 arquivos (10 de código + 7 de teste). Dividido, sem mudar nenhum nome do §9:

| Parte | Branch | O quê | Código | Teste |
|---|---|---|---|---|
| 1 | `feat/bio-rota-publica` | `/bio/<slug>` em www: rota, 301, 404, visita, CSP `bio`, matcher, `headers()`, robots, 308 de `app.`/apex, e2e | 8 | 5 |
| 2 | `feat/bio-raiz-dominio` | raiz do domínio próprio (`"bio-root"`, `/bio/_dominio`, `/` por host no `headers()`), `invalidarBioDaLoja` no PATCH/DELETE de campanha, e2e do domínio | 5 | 5 |

A Parte 2 sai de `origin/main` depois da Parte 1 mergeada (mexe em `rota-publica.ts`, `next.config.ts` e no e2e criados/alterados na Parte 1).

## Global Constraints

- Endereço Girumo: `https://www.girumo.com.br/bio/<slug>`; `/bio/:path*` em `app.girumo.com.br` e em `girumo.com.br` → **308** para `https://www.girumo.com.br/bio/:path*` (regra em `lib/domain-redirects.ts`, destino com `PUBLIC_SITE_HOST`).
- Slug: 3–40, `^[a-z0-9]+(-[a-z0-9]+)*$` (`SLUG_BIO`); fora disso → 404 sem consultar o cache.
- Slug antigo da página → **301** para `/bio/<atual>`, com `cache-control: no-store`; a query vai junto.
- 404 (inexistente, não publicada, bloqueada, `_dominio` em host Girumo) → HTML de `renderPaginaNaoEncontrada(nonce)`, sem marca Girumo. Raiz de domínio próprio sem página → o texto do middleware: `Link não encontrado.`
- Domínio próprio: só a raiz `/` serve, e só a página da loja dona do host ativo (`getActiveDomainTenant`), com origem `https://<host ativo>`; `/bio/*` nesse host continua 404 (`customHostRoute` → `"not-found"`).
- CSP `"bio"`, exatamente: `default-src 'none'; script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` — e **exatamente um** header `Content-Security-Policy` em `www…/bio/<slug>` e na raiz do domínio próprio.
- `noindex`: `<meta>` do PR 3a + header `X-Robots-Tag: noindex` (é o que o `curl -sI` enxerga) + `/bio/` no `disallow` do `robots.ts`.
- Visita: `after()` → `contarBio(paginaId, "visita")`; nunca para `HEAD`, `Sec-Purpose`/`Purpose: prefetch` nem `isBotUserAgent`; teto `isRateLimited("bio-visita", req, 30, paginaId)`. Nada de IP, user agent ou referer guardado.
- Invalidação: `invalidarBioDaLoja(tenantId)` depois de trocar o slug (`PATCH`) e de apagar (`DELETE`) campanha em `app/api/campanhas/route.ts`.
- Rota: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `params` é Promise.
- Testes: em `apps/web`, `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; e2e com uma loja fixa no banco de **dev** (como o usuário de QA), criada no primeiro run e só regravada nos outros: nada para apagar.

## Review Focus

- **Slug digitado à mão fora do formato** (maiúscula, acento, `_dominio`, 2 ou 41+ caracteres): 404 sem ir ao cache, para slug inventado não virar chave de cache. Teste: Task 2, "slug fora do formato nem chega no cache".
- **Prévia de link e prefetch** (WhatsApp/Facebook buscando a página quando a loja cola o link; prefetch do navegador; o `curl -sI` da prova): não conta visita. Teste: Task 2, "HEAD, prefetch e robô não contam visita".
- **QR ou anúncio antigo com utm no slug antigo**: 301 para o atual levando a query. Teste: Task 2, "slug antigo".
- **`/bio/_dominio` digitado direto** (www, `app.`, domínio do lojista): nunca mostra página de loja nem consulta o banco no host Girumo; no domínio do lojista é o 404 de texto. Testes: Task 2 (www), Task 8 (host Girumo sem consulta), Task 10 (`/bio/*` no domínio).
- **Domínio próprio de loja sem página publicada, ou host sem dono ativo**: `Link não encontrado.` de texto, não o 404 da Girumo. Testes: Task 8 e Task 10.

---

# Parte 1 — `/bio/<slug>` em www

**Antes de começar** (na raiz do checkout principal, PowerShell):

```powershell
git fetch origin main
git ls-tree --name-only origin/main apps/web/src/lib/bio/cache.ts apps/web/src/lib/bio/documento.ts apps/web/src/lib/bio/render/index.ts apps/web/src/lib/stores/bio-pages.ts
git worktree add .claude/worktrees/bio-rota-publica -b feat/bio-rota-publica origin/main
```

Expected: o `ls-tree` lista os 4 caminhos (PRs 1, 2 e 3a em `main`); se faltar algum, parar. No worktree novo: `node_modules` por junction e e2e contra o dev só com `E2E_SUPABASE_*` no ambiente (ver "Ambiente do worktree" no índice).

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/security/csp.ts` (+ `csp.test.ts`) | superfície `"bio"` e a política dela |
| `apps/web/src/lib/bio/rota-publica.ts` (+ `.test.ts`) | `responderBio`: 200/301/404/503 e a visita |
| `apps/web/src/app/bio/[slug]/route.ts` | GET e HEAD chamando `responderBio` |
| `apps/web/src/lib/pages/analytics.ts` | balde `"bio-visita"` |
| `apps/web/src/middleware.ts`, `apps/web/next.config.ts`, `apps/web/src/app/robots.ts` (+ `brand-routes.test.ts`) | registros de rota pública |
| `apps/web/src/lib/domain-redirects.ts` (+ `.test.ts`) | 308 de `app.`/apex |
| `apps/web/e2e/link-da-bio-publica.spec.ts` | prova contra o servidor e o banco de dev |

### Task 1: Superfície `"bio"` na CSP

**Files:**
- Modify: `apps/web/src/lib/security/csp.ts` (`NonceSurface`, `surfaceForPath`, `buildCsp`)
- Test: `apps/web/src/lib/security/csp.test.ts`

**Interfaces:**
- Produces: `type NonceSurface = "public-lp" | "click-redirect" | "bio"`; `surfaceForPath("/bio" | "/bio/…") → "bio"`; `buildCsp("bio", nonce, isDev): string` (a política do §6; o PR 7 acrescenta os hosts da Meta e do GA aqui).

- [ ] **Step 1: Write the failing test** (acrescentar ao fim de `csp.test.ts` e incluir `"bio"` no laço do teste "production script-src drops unsafe-inline and unsafe-eval": `for (const surface of ["public-lp", "click-redirect", "bio"] as const)`)

```ts
test("o link da bio é superfície com nonce própria; prefixo parecido não entra", () => {
  assert.equal(surfaceForPath("/bio/loja-teste"), "bio");
  assert.equal(surfaceForPath("/bio"), "bio");
  for (const path of ["/biografia", "/bio-loja", "/api/p/bio/toque"]) {
    assert.equal(surfaceForPath(path), null, path);
  }
});

test("CSP do link da bio: fechada, só o nonce, nenhum terceiro (spec link-da-bio §6)", () => {
  const nonce = generateNonce();
  const csp = buildCsp("bio", nonce, false);
  assert.deepEqual(csp.split("; "), [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ]);
  assert.equal(nonceSeenByNext(csp), nonce);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts`
Expected: FAIL — `surfaceForPath("/bio/loja-teste")` devolve `null`.

- [ ] **Step 3: Implement**

Em `csp.ts`: `export type NonceSurface = "public-lp" | "click-redirect" | "bio";`; em `surfaceForPath`, antes do `return null`:

```ts
  if (pathname === "/bio" || pathname.startsWith("/bio/")) return "bio";
```

Em `buildCsp`, primeiro ramo:

```ts
  if (surface === "bio") {
    // Link da bio (spec link-da-bio §6): HTML montado à mão, sem React e sem
    // terceiros — `<style>` e `<script>` só com o nonce. O PR 7 acrescenta os
    // hosts da Meta e do GA fixos, como no click-redirect: quem monta a CSP é o
    // middleware, que não sabe se a loja tem rastreio.
    return [
      "default-src 'none'",
      scriptSrc(nonce, isDev),
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; ");
  }
```

Atualizar o comentário do topo de `csp.ts` ("O que ENTRA") com a terceira superfície: `/bio/:slug` (link da bio, HTML do route handler).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/security/csp.ts apps/web/src/lib/security/csp.test.ts
git commit -m "feat(bio): CSP surface for the public link-in-bio page"
```

---

### Task 2: `responderBio` e a rota `/bio/[slug]`

**Files:**
- Create: `apps/web/src/lib/bio/rota-publica.ts`
- Create: `apps/web/src/app/bio/[slug]/route.ts`
- Modify: `apps/web/src/lib/pages/analytics.ts` (union de `isRateLimited`)
- Test: `apps/web/src/lib/bio/rota-publica.test.ts`

**Interfaces:**
- Consumes: `paginaPublicaPorSlug(slug: string): Promise<BuscaPorSlug>` (PR 2, `lib/bio/cache.ts`); `SLUG_BIO`, `documentoPadrao`, `type DadosRender` (PR 2, `lib/bio/documento.ts`); `contarBio(paginaId: string, alvo: string): Promise<void>` (PR 2, `lib/stores/bio-pages.ts`); `renderPaginaBio`, `renderPaginaNaoEncontrada` (PR 3a, `lib/bio/render`).
- Produces: `type DepsBio = { porSlug; contar }` (a Parte 2 acrescenta `daLoja` e `donoDoHost`); `responderBio(req: Request, slug: string, deps?: DepsBio): Promise<Response>`; `isRateLimited(rota: "lead" | "track" | "outbound" | "bio-visita", …)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/bio/rota-publica.test.ts
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { before, test } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

import type { BuscaPorSlug } from "@/lib/bio/cache";
import { documentoPadrao, type DadosRender } from "@/lib/bio/documento";

/**
 * `responderBio` com cache e banco trocados por funções (`DepsBio`). A visita vai
 * para o `after()`: o escopo falso só guarda a tarefa e o teste a roda quando
 * quer — é assim que se prova que a página não espera o banco.
 */

// O Next lê este global uma vez, quando carrega: antes do import (dinâmico, no `before`).
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

const PAGINA = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607";
const NONCE = "bm9uY2UtZG8tdGVzdGUtMTIz"; // base64 de "nonce-do-teste-123": passa no nonceAttribute
const GENTE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

let modulo: typeof import("./rota-publica");
let noEscopo: (fn: () => Promise<Response>) => Promise<Response>;
const depois: (() => Promise<unknown>)[] = [];

before(async () => {
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const escopo = {
    afterContext: { after: (tarefa: () => Promise<unknown>) => void depois.push(tarefa) },
  } as unknown as WorkStore;
  noEscopo = (fn) => workAsyncStorage.run(escopo, fn);
  modulo = await import("./rota-publica");
});

function dados(): DadosRender {
  return {
    documento: documentoPadrao({ nome: "Ateliê da Ana", campanhaId: null }),
    paginaId: PAGINA,
    campanhas: {},
    linksEscondidos: [],
    origem: "https://www.girumo.com.br",
    dominioProprio: false,
  };
}

type Opcoes = { busca?: BuscaPorSlug | Error };

function cenario(o: Opcoes = {}) {
  depois.length = 0;
  const buscados: string[] = [];
  const contados: [string, string][] = [];
  const busca = o.busca === undefined ? { tipo: "pagina" as const, dados: dados() } : o.busca;
  const deps = {
    porSlug: async (slug: string): Promise<BuscaPorSlug> => {
      buscados.push(slug);
      if (busca instanceof Error) throw busca;
      return busca;
    },
    contar: async (paginaId: string, alvo: string): Promise<void> => {
      contados.push([paginaId, alvo]);
    },
  };
  return { deps, buscados, contados };
}

function pedido(caminho: string, i: { metodo?: string; ua?: string | null; ip?: string; extra?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = {
    host: "www.girumo.com.br",
    "x-nonce": NONCE,
    "x-forwarded-for": i.ip ?? "203.0.113.10",
    ...i.extra,
  };
  if (i.ua !== null) headers["user-agent"] = i.ua ?? GENTE;
  return new Request(`https://www.girumo.com.br${caminho}`, { method: i.metodo ?? "GET", headers });
}

function responder(req: Request, slug: string, deps: ReturnType<typeof cenario>["deps"]): Promise<Response> {
  return noEscopo(() => modulo.responderBio(req, slug, deps));
}

/** O que o Next faz depois que a resposta sai. */
async function rodarDepois(): Promise<void> {
  for (const tarefa of depois.splice(0)) await tarefa();
}

test("página publicada: 200, HTML com o nonce da request, noindex", async () => {
  const { deps, buscados } = cenario();
  const res = await responder(pedido("/bio/atelie-da-ana"), "atelie-da-ana", deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  const html = await res.text();
  assert.ok(html.includes(`nonce="${NONCE}"`), "o <style>/<script> perdeu o nonce do middleware");
  assert.ok(html.includes(`data-pagina="${PAGINA}"`));
  assert.deepEqual(buscados, ["atelie-da-ana"]);
});

test("slug antigo: 301 para o atual, no-store, levando a query; não conta visita", async () => {
  const { deps } = cenario({ busca: { tipo: "mudou", slugAtual: "atelie-novo" } });
  const res = await responder(pedido("/bio/atelie-velho?utm_source=ig"), "atelie-velho", deps);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "/bio/atelie-novo?utm_source=ig");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(depois.length, 0);
});

test("inexistente, não publicada ou bloqueada (o cache devolve null): 404 HTML com o nonce", async () => {
  const { deps } = cenario({ busca: null });
  const res = await responder(pedido("/bio/nao-existe"), "nao-existe", deps);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  const html = await res.text();
  assert.match(html, /Página não encontrada/);
  assert.ok(html.includes(`nonce="${NONCE}"`));
  assert.equal(depois.length, 0);
});

test("slug fora do formato nem chega no cache", async () => {
  for (const slug of ["Atelie", "at", "a".repeat(41), "_dominio", "ateliê", "a--b", "-ab", "ab-"]) {
    const { deps, buscados } = cenario();
    const res = await responder(pedido(`/bio/${encodeURIComponent(slug)}`), slug, deps);
    assert.equal(res.status, 404, slug);
    assert.deepEqual(buscados, [], slug);
  }
});

test("visita: GET de gente conta uma vez, depois da resposta", async () => {
  const { deps, contados } = cenario();
  const res = await responder(pedido("/bio/atelie-da-ana", { ip: "203.0.113.21" }), "atelie-da-ana", deps);
  assert.equal(res.status, 200);
  assert.deepEqual(contados, [], "contou antes de responder");
  await rodarDepois();
  assert.deepEqual(contados, [[PAGINA, "visita"]]);
});

test("HEAD, prefetch e robô não contam visita", async () => {
  const casos = [
    pedido("/bio/atelie-da-ana", { metodo: "HEAD" }),
    pedido("/bio/atelie-da-ana", { extra: { "sec-purpose": "prefetch;prerender" } }),
    pedido("/bio/atelie-da-ana", { extra: { purpose: "prefetch" } }),
    pedido("/bio/atelie-da-ana", { ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" }),
    pedido("/bio/atelie-da-ana", { ua: "WhatsApp/2.23.20.0" }),
    pedido("/bio/atelie-da-ana", { ua: null }),
  ];
  for (const req of casos) {
    const { deps, contados } = cenario();
    const res = await responder(req, "atelie-da-ana", deps);
    assert.equal(res.status, 200);
    await rodarDepois();
    assert.deepEqual(contados, [], `${req.method} ${req.headers.get("user-agent")} ${req.headers.get("sec-purpose") ?? req.headers.get("purpose")}`);
  }
});

test("teto por IP e página: a 31ª visita do minuto não conta; outro IP conta", async () => {
  const { deps, contados } = cenario();
  for (let i = 0; i < 31; i++) {
    await responder(pedido("/bio/atelie-da-ana", { ip: "203.0.113.31" }), "atelie-da-ana", deps);
  }
  await responder(pedido("/bio/atelie-da-ana", { ip: "203.0.113.32" }), "atelie-da-ana", deps);
  await rodarDepois();
  assert.equal(contados.length, 31);
});

test("falha ao contar não derruba nada: vai pro log", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  const { deps } = cenario();
  deps.contar = async () => {
    throw new Error("banco caiu");
  };
  const res = await responder(pedido("/bio/atelie-da-ana", { ip: "203.0.113.40" }), "atelie-da-ana", deps);
  assert.equal(res.status, 200);
  await rodarDepois();
  assert.equal(erros.mock.callCount(), 1);
  assert.match(String(erros.mock.calls[0].arguments[0]), /visita não contada/);
});

test("cache ou banco fora do ar: 503 de texto, sem cache, e o erro no log", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  const { deps } = cenario({ busca: new Error("banco caiu") });
  const res = await responder(pedido("/bio/atelie-da-ana"), "atelie-da-ana", deps);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(await res.text(), /Tente de novo/);
  assert.equal(erros.mock.callCount(), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/rota-publica.test.ts`
Expected: FAIL — `Cannot find module './rota-publica'`.

- [ ] **Step 3: Implement**

Em `apps/web/src/lib/pages/analytics.ts`, só a assinatura: `rota: "lead" | "track" | "outbound" | "bio-visita",` (o PR 4b acrescenta `"bio-toque"`).

```ts
// apps/web/src/lib/bio/rota-publica.ts
import "server-only";
import { after } from "next/server";

import { paginaPublicaPorSlug } from "@/lib/bio/cache";
import { SLUG_BIO, type DadosRender } from "@/lib/bio/documento";
import { renderPaginaBio, renderPaginaNaoEncontrada } from "@/lib/bio/render";
import { isBotUserAgent, isRateLimited } from "@/lib/pages/analytics";
import { contarBio } from "@/lib/stores/bio-pages";

/**
 * `GET|HEAD /bio/<slug>` — página pública do link da bio (spec link-da-bio §6 e §7).
 *
 * O HTML sai do renderizador com o nonce que o middleware pôs em `x-nonce`; o
 * dado vem do cache (5 min). A CSP sai do middleware e o 308 de `app.`/apex do
 * next.config: aqui só a decisão da resposta e a contagem da visita.
 *
 * Cache e banco entram por parâmetro para o teste trocá-los sem rede (o desenho
 * de `renomearSlugCampanha`).
 */
const DEPS = { porSlug: paginaPublicaPorSlug, contar: contarBio };
export type DepsBio = typeof DEPS;

/** O teto do `/api/p/track`: por IP e página, por minuto (spec §7). */
const VISITAS_POR_MINUTO = 30;
const CABECALHO_HTML = { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" };
const CABECALHO_TEXTO = { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" };

export async function responderBio(req: Request, slug: string, deps: DepsBio = DEPS): Promise<Response> {
  try {
    // Fora do formato nem consulta: slug inventado não vira chave de cache.
    if (!SLUG_BIO.test(slug)) return naoEncontrada(req); // o SLUG_BIO do PR 2 já conta 3–40
    const busca = await deps.porSlug(slug);
    if (!busca) return naoEncontrada(req);
    if (busca.tipo === "mudou") return paraOSlugAtual(req, busca.slugAtual);
    return pagina(req, busca.dados, deps);
  } catch (e) {
    console.error(`[bio] ${slug}: página não abriu`, e);
    return new Response("Não conseguimos abrir agora. Tente de novo em instantes.", {
      status: 503,
      headers: { ...CABECALHO_TEXTO, "cache-control": "no-store" },
    });
  }
}

function pagina(req: Request, dados: DadosRender, deps: DepsBio): Response {
  const html = renderPaginaBio(dados, {
    modo: "publica",
    nonce: req.headers.get("x-nonce"),
    animarEntrada: dados.documento.animar,
  });
  if (ehVisita(req)) {
    // Depois da resposta: a contagem nunca segura a página, e falha aqui só vai pro log.
    after(async () => {
      try {
        if (await isRateLimited("bio-visita", req, VISITAS_POR_MINUTO, dados.paginaId)) return;
        await deps.contar(dados.paginaId, "visita");
      } catch (e) {
        console.error(`[bio] ${dados.paginaId}: visita não contada`, e);
      }
    });
  }
  return new Response(html, { status: 200, headers: CABECALHO_HTML });
}

/** Visita = GET de gente. HEAD, prefetch do navegador e robô de prévia de link não contam. */
function ehVisita(req: Request): boolean {
  if (req.method !== "GET") return false;
  const proposito = `${req.headers.get("sec-purpose") ?? ""} ${req.headers.get("purpose") ?? ""}`;
  if (/prefetch/i.test(proposito)) return false;
  return !isBotUserAgent(req.headers.get("user-agent"));
}

/**
 * Slug antigo → o atual. `no-store`: a loja pode voltar ao slug antigo, e um 301
 * guardado no navegador viraria laço. A query vai junto (utm do anúncio, do QR).
 */
function paraOSlugAtual(req: Request, slugAtual: string): Response {
  return new Response(null, {
    status: 301,
    headers: { location: `/bio/${slugAtual}${new URL(req.url).search}`, "cache-control": "no-store" },
  });
}

function naoEncontrada(req: Request): Response {
  return new Response(renderPaginaNaoEncontrada(req.headers.get("x-nonce")), { status: 404, headers: CABECALHO_HTML });
}
```

```ts
// apps/web/src/app/bio/[slug]/route.ts
import { responderBio } from "@/lib/bio/rota-publica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /bio/:slug — página pública do link da bio (ver responderBio).
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return responderBio(req, slug);
}

// Explícito (o Next já faria o mesmo): HEAD cai no GET, e a visita não conta pelo `req.method`.
export const HEAD = GET;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/rota-publica.test.ts src/lib/pages/analytics.test.ts`
Expected: PASS (9 testes de `rota-publica` + os 3 de `analytics`).
Run: `npx tsc --noEmit --project tsconfig.json`
Expected: sem erro (o tsx não checa tipo: é aqui que um nome do §9 trocado aparece).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bio/rota-publica.ts apps/web/src/lib/bio/rota-publica.test.ts "apps/web/src/app/bio/[slug]/route.ts" apps/web/src/lib/pages/analytics.ts
git commit -m "feat(bio): public /bio/[slug] route with old-slug 301 and visit count"
```

---

### Task 3: Registros da rota pública (matcher, `headers()`, robots)

Os três lugares fora de `app/` que o achado "rota pública precisa de 3 registros" lista. Sem o matcher, `/bio/foo.bar` sai sem CSP; sem tirar `/bio` da regra global do next.config, a Vercel manda **duas** CSP (a estática, com `'unsafe-inline'`, e a de nonce).

**Files:**
- Modify: `apps/web/src/middleware.ts` (array `matcher`, hoje ~linha 274, e o comentário acima dele)
- Modify: `apps/web/next.config.ts` (`headers()`, ~linhas 110–138)
- Modify: `apps/web/src/app/robots.ts` (`disallow`)
- Test: `apps/web/src/lib/security/csp.test.ts`, `apps/web/src/app/brand-routes.test.ts`

**Interfaces:**
- Consumes: `surfaceForPath` → `"bio"` (Task 1).
- Produces: `/bio/:path*` no matcher; regra global de `headers()` com `bio/|bio$` no lookahead; `{ source: "/bio/:path*", headers: headersWithoutCsp }`; `"/bio/"` no `disallow`.

- [ ] **Step 1: Write the failing tests**

Em `csp.test.ts`, imports novos (`import { readFileSync } from "node:fs";` e `import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";`) e, ao fim:

```ts
const NEXT_CONFIG = readFileSync(new URL("../../../next.config.ts", import.meta.url), "utf8");
const MIDDLEWARE = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");

/**
 * A regra que entrega a CSP ESTÁTICA a tudo que não tem nonce, lida do next.config
 * (que importa @sentry/nextjs e não roda sob tsx) e casada com o matcher do próprio Next.
 */
function regraGlobal(): (caminho: string) => boolean {
  const fonte = NEXT_CONFIG.match(/source:\s*"([^"]+)",\s*headers:\s*securityHeaders/)?.[1];
  assert.ok(fonte, "regra global de headers não encontrada no next.config.ts");
  const casa = getPathMatch(fonte, { strict: true, removeUnnamedParams: true });
  return (caminho) => casa(caminho) !== false;
}

test("a CSP estática do next.config não casa o link da bio (na Vercel sairiam duas CSP)", () => {
  const casa = regraGlobal();
  for (const caminho of ["/bio", "/bio/loja-teste", "/p/x", "/r/x", "/c/x"]) {
    assert.equal(casa(caminho), false, `${caminho} sairia com duas CSP`);
  }
  for (const caminho of ["/painel", "/termos", "/biografia", "/login"]) {
    assert.equal(casa(caminho), true, `${caminho} ficou sem a CSP estática`);
  }
  assert.match(NEXT_CONFIG, /source:\s*"\/bio\/:path\*",\s*headers:\s*headersWithoutCsp/);
});

test("o middleware roda em toda /bio/* (entrada própria no matcher, como /p/ /r/ /c/)", () => {
  assert.match(MIDDLEWARE, /"\/bio\/:path\*"/);
});
```

Em `brand-routes.test.ts`, no teste "mantém as páginas de terceiros fora do rastreio":

```ts
  assert.ok(paths.includes("/bio/"), "o link da bio (página do lojista) precisa sair do rastreio");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts src/app/brand-routes.test.ts`
Expected: FAIL — `/bio sairia com duas CSP`, matcher sem `/bio/:path*` e `/bio/` fora do `disallow`.

- [ ] **Step 3: Implement**

`middleware.ts`: no `matcher`, depois de `"/c/:path*",` acrescentar `"/bio/:path*",`; no comentário de cima trocar "As duas entradas dedicadas de /p/ e /r/" por "As entradas dedicadas (/p/, /r/, /c/ e /bio/)".

`next.config.ts`, em `headers()`:

```ts
      {
        // tudo, exceto /p/*, /r/*, /c/*, /bio/* e a prévia do editor (todas com
        // regra própria abaixo). Ficam FORA do match global pra não sair header
        // duplicado. `p$`/`r$`/`c$`/`bio$` cobrem os paths exatos: `:path*` na
        // regra dedicada casa zero segmentos, então sem eles esses sairiam com
        // dois headers de CSP.
        source: "/((?!p/|p$|r/|r$|c/|c$|bio/|bio$|editor-preview).*)",
        headers: securityHeaders,
      },
```

e, depois da regra de `/c/:path*`:

```ts
      {
        // Link da bio (spec link-da-bio §6): CSP com nonce, do middleware.
        source: "/bio/:path*",
        headers: headersWithoutCsp,
      },
```

`robots.ts`: `disallow: ["/painel", "/api", "/p/", "/r/", "/c/", "/bio/"],` e, no comentário, "`/p/` (LPs), `/r/` e `/c/` (links) e `/bio/` (link da bio) entram pelo mesmo motivo".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts src/app/brand-routes.test.ts src/lib/custom-domains/host.test.ts`
Expected: PASS (o `host.test.ts` confere que a primeira entrada do matcher não mudou).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/middleware.ts apps/web/next.config.ts apps/web/src/app/robots.ts apps/web/src/lib/security/csp.test.ts apps/web/src/app/brand-routes.test.ts
git commit -m "feat(bio): register /bio in middleware matcher, static headers and robots"
```

---

### Task 4: 308 de `app.` e do apex para o www

**Files:**
- Modify: `apps/web/src/lib/domain-redirects.ts`
- Modify: `apps/web/next.config.ts` (`redirects()`)
- Test: `apps/web/src/lib/domain-redirects.test.ts`

**Interfaces:**
- Produces: `export const APEX_HOST = "girumo.com.br"`; `export function bioDomainRedirects(): HostRedirect[]`.

- [ ] **Step 1: Write the failing test**

Import: `import { APEX_HOST, APP_HOST, APP_ONLY_PATHS, PUBLIC_SITE_HOST, appDomainRedirects, bioDomainRedirects } from "./domain-redirects";`. No teste "deixa o site público onde ele está", incluir `"/bio/:path*"` na lista. Novo teste:

```ts
test("o link da bio sai de app. e do apex para o www, com 308 (spec link-da-bio §2)", () => {
  const regras = bioDomainRedirects();
  // Nunca com host www: casaria no próprio destino (laço).
  assert.deepEqual(regras.map((r) => r.has[0].value).sort(), [APEX_HOST, APP_HOST].sort());
  for (const r of regras) {
    assert.equal(r.has.length, 1);
    assert.equal(r.source, "/bio/:path*");
    assert.equal(r.destination, `https://${PUBLIC_SITE_HOST}/bio/:path*`);
    assert.equal(r.permanent, true, "308 preserva a query (utm do anúncio)");
  }
  assert.equal(APEX_HOST, "girumo.com.br");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/domain-redirects.test.ts`
Expected: FAIL — `bioDomainRedirects` não existe.

- [ ] **Step 3: Implement**

```ts
// em apps/web/src/lib/domain-redirects.ts, depois de APP_HOST
export const APEX_HOST = "girumo.com.br";

// depois de appDomainRedirects
/**
 * O link da bio (spec link-da-bio §2) mora só no host público. Em `app.` a
 * página dividiria a origem com a sessão do painel — o supabase-js guarda a
 * sessão no localStorage de `app.`. O apex já responde 308 para o www na
 * Vercel; a regra dele aqui é a rede se isso mudar.
 */
export function bioDomainRedirects(): HostRedirect[] {
  return [APP_HOST, APEX_HOST].map((host) => ({
    source: "/bio/:path*",
    has: [{ type: "host" as const, value: host }],
    destination: `https://${PUBLIC_SITE_HOST}/bio/:path*`,
    permanent: true as const,
  }));
}
```

`next.config.ts`: `import { appDomainRedirects, bioDomainRedirects } from "./src/lib/domain-redirects";` e, em `redirects()`, depois de `...appDomainRedirects(),`:

```ts
      // Link da bio só no www (spec link-da-bio §2). Lista e teste em domain-redirects.ts.
      ...bioDomainRedirects(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/domain-redirects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/domain-redirects.ts apps/web/src/lib/domain-redirects.test.ts apps/web/next.config.ts
git commit -m "feat(bio): 308 /bio from app. and apex to www"
```

---

### Task 5: e2e da página pública

**Loja fixa do e2e, não descartável.** O PR 1 tira `DELETE` de `bio_slugs` até da service role (slug usado nunca volta para outra loja, no banco): loja e página criadas por run deixariam dois slugs presos a cada run. Então o spec usa uma loja fixa no banco de **dev** — como o usuário de QA —, criada pela service role no primeiro run (`organizations` com `{ name, slug }`, como os testes de integração) e reaproveitada nos outros; cada run só regrava o estado esperado (publicada, sem bloqueio, `documento` no formato atual, slug atual) e nada fica para apagar. A página nasce no slug antigo e troca para o atual, então o antigo responde 301 para sempre. Nunca toca a loja de QA. Como dois runs (CI de PRs diferentes) usam a mesma página, a visita é conferida com "pelo menos +1"; a exatidão (HEAD, prefetch e robô não contam) fica no teste de unidade da Task 2. `app.` e apex vão pelo header `Host`: o servidor decide por ele, como a Vercel.

**Files:**
- Create: `apps/web/e2e/link-da-bio-publica.spec.ts`

**Interfaces:**
- Consumes: `documentoPadrao` (PR 2); tabelas `organizations`, `bio_pages` (o trigger `bio_pages_registra_slug` preenche `bio_slugs`), `bio_contagens` (PR 1); a rota das Tasks 2–4.

- [ ] **Step 1: Write the spec**

```ts
// apps/web/e2e/link-da-bio-publica.spec.ts
import { expect, test, type APIResponse } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { documentoPadrao } from "../src/lib/bio/documento";

/**
 * Link da bio, página pública (spec 2026-10-19-link-da-bio §2, §6 e §7), sem sessão, contra o banco de dev.
 *
 * Loja FIXA, como o usuário de QA: `bio_slugs` não aceita DELETE nem da service role (slug usado nunca volta para
 * outra loja), então loja e página por run deixariam slugs presos a cada run. O primeiro run cria; os outros só
 * regravam o estado que os testes esperam. O que este arquivo NÃO prova: CSP duplicada — o `next start` junta dois
 * headers iguais num só (Node `setHeader`); só a Vercel mostra, e a prova da spec é o `curl -sI` depois do deploy.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);
const EM_PRODUCAO = URL_SUPABASE.includes("nidoatbxaylrkcgbszns");

const LOJA_SLUG = "e2e-bio-fixa";
const NOME = "Loja E2E Bio";
const SLUG_ANTIGO = "e2e-bio-antigo";
const SLUG_ATUAL = "e2e-bio-atual";
/** Navegador de gente: conta visita. */
const GENTE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
/** Robô de prévia de link: nunca conta. Os testes que não medem visita usam ele. */
const ROBO = "facebookexternalhit/1.1";

test.use({ storageState: { cookies: [], origins: [] } });

function csps(res: APIResponse): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "content-security-policy")
    .map((h) => h.value);
}

/** Um header CSP só, o da superfície "bio", e o HTML usando o nonce dele. Devolve o HTML. */
async function conferirNonce(res: APIResponse): Promise<string> {
  const lista = csps(res);
  expect(lista, "um header CSP só").toHaveLength(1);
  expect(lista[0]).toContain("default-src 'none'");
  const nonce = lista[0].match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1] ?? "";
  expect(nonce, "CSP sem nonce").not.toBe("");
  const html = await res.text();
  expect(html).toContain(`nonce="${nonce}"`);
  return html;
}

test.describe("link da bio: página pública", () => {
  test.skip(!TEM_BANCO || EM_PRODUCAO, "Precisa da service role do banco de DEV (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");

  let banco: SupabaseClient;
  let lojaId = "";
  let paginaId = "";

  async function idDe(tabela: "organizations" | "bio_pages", coluna: string, valor: string): Promise<string> {
    const { data, error } = await banco.from(tabela).select("id").eq(coluna, valor).maybeSingle();
    if (error) throw new Error(`${tabela}: ${error.message}`);
    return (data as { id: string } | null)?.id ?? "";
  }

  async function visitas(): Promise<number> {
    const { data, error } = await banco
      .from("bio_contagens")
      .select("total")
      .eq("tenant_id", lojaId)
      .eq("pagina_id", paginaId)
      .eq("alvo", "visita");
    if (error) throw new Error(`leitura das visitas: ${error.message}`);
    return ((data ?? []) as { total: number }[]).reduce((soma, linha) => soma + linha.total, 0);
  }

  test.beforeAll(async () => {
    banco = createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
    const documento = documentoPadrao({ nome: NOME, campanhaId: null });

    // Primeiro run cria; 23505 = outro run criou no meio, então só lê de novo.
    lojaId = await idDe("organizations", "slug", LOJA_SLUG);
    if (!lojaId) {
      const { error } = await banco.from("organizations").insert({ name: NOME, slug: LOJA_SLUG });
      if (error && error.code !== "23505") throw new Error(`loja do e2e: ${error.message}`);
      lojaId = await idDe("organizations", "slug", LOJA_SLUG);
    }
    paginaId = await idDe("bio_pages", "tenant_id", lojaId);
    if (!paginaId) {
      // Nasce no slug antigo; a troca logo abaixo deixa o antigo em bio_slugs, respondendo 301.
      const { error } = await banco
        .from("bio_pages")
        .insert({ tenant_id: lojaId, slug: SLUG_ANTIGO, publicada: true, documento });
      if (error && error.code !== "23505") throw new Error(`página do e2e: ${error.message}`);
      paginaId = await idDe("bio_pages", "tenant_id", lojaId);
    }

    // O estado que os testes esperam, a cada run (o mesmo slug de novo passa no trigger: já é desta página).
    const { error } = await banco
      .from("bio_pages")
      .update({ slug: SLUG_ATUAL, publicada: true, bloqueada_em: null, documento })
      .eq("tenant_id", lojaId)
      .eq("id", paginaId);
    if (error) throw new Error(`estado da página do e2e: ${error.message}`);
  });

  test("página publicada: 200 com a CSP da bio, o nonce dela no HTML e noindex", async ({ request }) => {
    const res = await request.get(`/bio/${SLUG_ATUAL}`, { headers: { "user-agent": ROBO } });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
    const html = await conferirNonce(res);
    expect(html).toContain(`data-pagina="${paginaId}"`);
    expect(html).toContain(`<title>${NOME}`);
  });

  test("HEAD: mesmo status e headers, sem corpo", async ({ request }) => {
    const res = await request.head(`/bio/${SLUG_ATUAL}`, { headers: { "user-agent": ROBO } });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
    expect(csps(res)).toHaveLength(1);
    expect((await res.body()).length).toBe(0);
  });

  test("slug antigo: 301 para o atual, sem guardar no navegador, com a query", async ({ request }) => {
    const res = await request.get(`/bio/${SLUG_ANTIGO}?utm_source=e2e`, { headers: { "user-agent": ROBO }, maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const destino = new URL(res.headers()["location"] ?? "", "http://base.invalid");
    expect(destino.pathname).toBe(`/bio/${SLUG_ATUAL}`);
    expect(destino.searchParams.get("utm_source")).toBe("e2e");
  });

  test("slug que não existe e /bio/_dominio no host do Girumo: 404 HTML, sem marca", async ({ request }) => {
    for (const caminho of ["/bio/e2e-bio-nao-existe", "/bio/_dominio"]) {
      const res = await request.get(caminho, { headers: { "user-agent": ROBO } });
      expect(res.status(), caminho).toBe(404);
      expect(res.headers()["x-robots-tag"], caminho).toBe("noindex");
      const html = await conferirNonce(res);
      expect(html, caminho).toContain("Página não encontrada");
      expect(html, caminho).not.toMatch(/girumo/i);
    }
  });

  test("app. e o apex mandam /bio para o www com 308, levando a query", async ({ request }) => {
    for (const host of ["app.girumo.com.br", "girumo.com.br"]) {
      const res = await request.get(`/bio/${SLUG_ATUAL}?utm_source=e2e`, {
        headers: { host, "user-agent": ROBO },
        maxRedirects: 0,
      });
      expect(res.status(), host).toBe(308);
      expect(res.headers()["location"], host).toBe(`https://www.girumo.com.br/bio/${SLUG_ATUAL}?utm_source=e2e`);
    }
  });

  test("visita: o GET de gente chega no contador, depois da resposta", async ({ request }) => {
    const antes = await visitas();
    expect((await request.get(`/bio/${SLUG_ATUAL}`, { headers: { "user-agent": GENTE } })).status()).toBe(200);
    // "Pelo menos": outro run em paralelo usa a mesma página. HEAD, prefetch e robô: rota-publica.test.ts.
    await expect.poll(visitas, { timeout: 15_000 }).toBeGreaterThanOrEqual(antes + 1);
  });
});
```

- [ ] **Step 2: Run the spec locally**

Pré-requisito: `E2E_SUPABASE_URL`/`E2E_SUPABASE_SERVICE_ROLE_KEY` do **dev** no ambiente (sem elas o e2e roda só no CI) e nenhum `e2e` de outro PR em `pending` (`gh pr checks <N>` nos PRs abertos — achado "corrida no banco dev").
Run (em `apps/web`): `npx playwright test e2e/link-da-bio-publica.spec.ts`, duas vezes seguidas (a segunda prova que a loja fixa é reaproveitada sem erro).
Expected: `6 passed` nas duas. "skipped" não vale como prova (faltou a service role).

- [ ] **Step 3: Typecheck do e2e**

Run: `npx tsc --noEmit --project tsconfig.e2e.json`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/link-da-bio-publica.spec.ts
git commit -m "test(e2e): public link-in-bio page against dev"
```

---

### Task 6: Fechamento da Parte 1 (PR, revisão de segurança, merge, prova, quadro)

- [ ] **Step 1: Gate local** (raiz do worktree, PowerShell): `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1` → termina sem erro (testes, os dois `tsc`, lint, build). Se o disco encher (ENOSPC), deixar o CI validar.
- [ ] **Step 2: Defasagem:** `git fetch origin main; git log HEAD..origin/main --oneline` → vazio ou poucos; senão `git rebase origin/main` e repetir o Step 1.
- [ ] **Step 3: Push e PR**

```powershell
git push -u origin feat/bio-rota-publica
gh pr create --base main --title "feat(bio): public link-in-bio page at /bio/<slug> (link da bio 4a, parte 1)" --body @'
Link da bio, PR 4a parte 1 (docs/superpowers/specs/2026-10-19-link-da-bio-design.md §2, §6, §7):
- GET|HEAD /bio/<slug>: HTML do renderizador com o nonce do middleware, X-Robots-Tag: noindex
- slug antigo -> 301 no-store (com a query); 404 HTML; 503 de texto se o banco cair
- visita em after(): sem HEAD, prefetch e robô; teto 30/min por IP+página (balde bio-visita)
- registros: CSP "bio", matcher, headers() do next.config, robots, 308 de app./apex
- e2e com a loja fixa do e2e no dev (bio_slugs não aceita DELETE: loja por run deixaria slug preso)

Prova pós-deploy: saída dos curl.exe -sI do plano colada aqui.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```

- [ ] **Step 4: Revisão de segurança** (spec §10, obrigatória antes do merge): agente `Security Engineer` sobre `git diff origin/main...HEAD`, pedindo atenção a: CSP de uma linha só e sem `'unsafe-inline'`, `Location` montado só com slug do banco + `search` normalizado, slug validado antes de qualquer consulta, nenhum texto do lojista fora do renderizador, teto da visita, `app.`/apex. Corrigir CRITICAL/HIGH antes de seguir.
- [ ] **Step 5: CI:** `gh pr checks <N>` → tudo verde, e no log do job `e2e` o `link-da-bio-publica.spec.ts` com `6 passed` (não skipped). Falha em cascata com 401/500 em specs alheios = corrida no banco dev: `gh run rerun <id> --failed`.
- [ ] **Step 6: Merge:** `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`. Esperar o deploy: `/admin/configuracoes`, campo "Deploy", com o sha do merge (ou um descendente).
- [ ] **Step 7: Página de prova em prod** (ainda não há painel). Gerar o documento válido (em `apps/web`):

```powershell
npx tsx -e "console.log(JSON.stringify(require('./src/lib/bio/documento').documentoPadrao({ nome: 'Loja de teste', campanhaId: '<id de uma campanha da loja de teste com link mestre>' })))"
```

O Igor roda no SQL de **prod** (troca do slug ANTES de qualquer visita, para o 301 sair sem esperar o cache; os dois slugs ficam reservados para a loja de teste, que é o desenho):

```sql
insert into public.bio_pages (tenant_id, slug, publicada, documento)
values ('<tenant da loja de teste>', 'prova-bio-a', true, $json$<JSON gerado acima>$json$::jsonb);
update public.bio_pages set slug = 'prova-bio', versao = versao + 1, updated_at = now()
 where tenant_id = '<tenant da loja de teste>';
```

- [ ] **Step 8: Prova pós-deploy** (PowerShell; `curl.exe -sI` é HEAD: não conta visita):

```powershell
$p = "https://www.girumo.com.br/bio/prova-bio"
curl.exe -sI $p | Select-String "^HTTP/|^content-security-policy:|^x-robots-tag:"
(curl.exe -sI $p | Select-String "^content-security-policy:").Count
curl.exe -sI "https://app.girumo.com.br/bio/prova-bio" | Select-String "^HTTP/|^location:"
curl.exe -sI "https://girumo.com.br/bio/prova-bio" | Select-String "^HTTP/|^location:"
curl.exe -sI "https://www.girumo.com.br/bio/prova-bio-a?utm_source=prova" | Select-String "^HTTP/|^location:|^cache-control:"
curl.exe -sI "https://www.girumo.com.br/bio/prova-nao-existe" | Select-String "^HTTP/|^content-security-policy:|^x-robots-tag:"
curl.exe -sI "https://www.girumo.com.br/" | Select-String "^content-security-policy:"
```

Expected, na ordem: `HTTP/1.1 200` (ou `HTTP/2 200`), uma linha `content-security-policy: default-src 'none'; script-src 'self' 'nonce-…' …` e `x-robots-tag: noindex`; contagem `1`; `308` + `location: https://www.girumo.com.br/bio/prova-bio` (duas vezes; no apex o 308 pode vir da própria Vercel); `301` + `location: /bio/prova-bio?utm_source=prova` + `cache-control: no-store`; `404` com uma CSP `default-src 'none'…` e `noindex`; a home com a CSP estática de sempre (`'unsafe-inline'`, `js.stripe.com`), uma linha. Depois, abrir `$p` uma vez num celular de verdade e conferir: `select dia, alvo, total from public.bio_contagens where tenant_id = '<tenant da loja de teste>' order by dia desc;` → `visita` igual ao número de aberturas reais (os HEAD não somaram). Colar tudo no PR.

- [ ] **Step 9: Quadro.** O card `link-da-bio` continua `em_construcao`: não chamar `move_card` para o mesmo status (não grava evento). O Igor roda em prod:

```sql
update public.board_features
   set blocker = 'Falta: 4a parte 2 (raiz do domínio próprio + invalidação), 4b, 5, 6a, 3b, 6b, 7. /bio/<slug> no ar em www desde o PR #<N>.'
 where key = 'link-da-bio';
```

Sugerir ao Igor: `rag insert "decisão: link da bio sai com X-Robots-Tag noindex (o curl -sI prova) e /bio fora da CSP estática do next.config" --source decisao-2026-10-19-link-da-bio-pr4a`. Encerrar com "PRs que deixei abertos: nenhum".

---

# Parte 2 — raiz do domínio próprio e invalidação

**Antes de começar:** Parte 1 mergeada. `git fetch origin main; git worktree add .claude/worktrees/bio-raiz-dominio -b feat/bio-raiz-dominio origin/main` (raiz do checkout principal); `node_modules` e e2e como na Parte 1.

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/custom-domains/host.ts` (+ `host.test.ts`) | `"bio-root"`, `BIO_DOMINIO`, `LINK_NAO_ENCONTRADO` |
| `apps/web/src/middleware.ts` | `bioRootResponse` (rewrite `/` → `/bio/_dominio` com a CSP `bio`) |
| `apps/web/next.config.ts` (+ `csp.test.ts`) | raiz dividida por host no `headers()` |
| `apps/web/src/lib/bio/rota-publica.ts` (+ `.test.ts`) | ramo `_dominio` |
| `apps/web/src/app/api/campanhas/route.ts` (+ `route.test.ts`) | `invalidarBioDaLoja` no PATCH (slug) e no DELETE |
| `apps/web/e2e/link-da-bio-publica.spec.ts` | domínio próprio pelo header `Host` |

### Task 7: Roteamento da raiz do domínio próprio

Hoje a regra global de `headers()` casa `/`: na raiz de um domínio de lojista sairiam a CSP estática **e** a de nonce do middleware (duas, na Vercel). A raiz passa a ter duas regras por host, com o mesmo `FIRST_PARTY_HOST_PATTERN` que o middleware usa — então quem o middleware trata como domínio de lojista nunca recebe a estática, e o host do Girumo continua recebendo.

**Files:**
- Modify: `apps/web/src/lib/custom-domains/host.ts`
- Modify: `apps/web/src/middleware.ts` (`customHostNotFound`, ramo `!firstParty`, função nova)
- Modify: `apps/web/next.config.ts` (`headers()` e import)
- Test: `apps/web/src/lib/custom-domains/host.test.ts`, `apps/web/src/lib/security/csp.test.ts`

**Interfaces:**
- Consumes: `buildCsp("bio", …)` (Task 1); `nonceResponse`, `generateNonce` (middleware); `regraGlobal()` (helper de teste da Task 3).
- Produces: `CustomHostRoute` com `"bio-root"`; `customHostRoute("/") → "bio-root"`; `export const BIO_DOMINIO = "_dominio"`; `export const LINK_NAO_ENCONTRADO = "Link não encontrado."`.

- [ ] **Step 1: Write the failing tests**

`host.test.ts`: importar `BIO_DOMINIO` e `LINK_NAO_ENCONTRADO`; no teste "domínio de lojista serve só links…", tirar `"/"` da lista de `not-found` e acrescentar `"/bio/loja-x"` e `"/bio/_dominio"`. Novo teste:

```ts
test("no domínio do lojista, a raiz é o link da bio da loja", () => {
  assert.equal(customHostRoute("/"), "bio-root");
  // `/bio/_dominio` é caminho interno do rewrite: digitado lá, não existe.
  assert.equal(customHostRoute(`/bio/${BIO_DOMINIO}`), "not-found");
  // A raiz sem página responde o mesmo texto do 404 do middleware (spec §6).
  assert.equal(LINK_NAO_ENCONTRADO, "Link não encontrado.");
});
```

`csp.test.ts`, novo teste:

```ts
test("a raiz se divide pelo host: CSP estática no Girumo, a do middleware no domínio do lojista", () => {
  assert.equal(regraGlobal()("/"), false, "a raiz casou a regra global: no domínio do lojista sairiam duas CSP");
  assert.match(NEXT_CONFIG, /source:\s*"\/",\s*has:\s*\[\{\s*type:\s*"host",\s*value:\s*FIRST_PARTY_HOST_PATTERN\s*\}\],\s*headers:\s*securityHeaders/);
  assert.match(NEXT_CONFIG, /source:\s*"\/",\s*missing:\s*\[\{\s*type:\s*"host",\s*value:\s*FIRST_PARTY_HOST_PATTERN\s*\}\],\s*headers:\s*headersWithoutCsp/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/host.test.ts src/lib/security/csp.test.ts`
Expected: FAIL — `customHostRoute("/")` devolve `"not-found"`; a regra global casa `/`.

- [ ] **Step 3: Implement**

`host.ts`:

```ts
export type CustomHostRoute = "surface" | "public-api" | "root-link" | "bio-root" | "not-found";

/**
 * Slug interno que a raiz do domínio do lojista vira (`/bio/_dominio`, spec
 * link-da-bio §6). Fora do formato de slug: nenhuma loja tem esse.
 */
export const BIO_DOMINIO = "_dominio";

/** O 404 seco do domínio do lojista: middleware e raiz sem página. */
export const LINK_NAO_ENCONTRADO = "Link não encontrado.";
```

e a primeira linha de `customHostRoute` (atualizar o JSDoc: "a raiz é o link da bio da loja"):

```ts
  if (pathname === "/") return "bio-root";
```

`middleware.ts`: importar `BIO_DOMINIO` e `LINK_NAO_ENCONTRADO` de `@/lib/custom-domains/host`; `customHostNotFound` passa a usar `new NextResponse(LINK_NAO_ENCONTRADO, …)`; depois de `rootLinkResponse`:

```ts
/**
 * Raiz do domínio do lojista: o link da bio da loja, sem mudar a URL do
 * visitante (spec link-da-bio §6). Irmã de rootLinkResponse, com a CSP da
 * superfície "bio"; quem acha a loja pelo host é o handler.
 */
function bioRootResponse(req: NextRequest): NextResponse {
  const nonce = generateNonce();
  const destino = req.nextUrl.clone();
  destino.pathname = `/bio/${BIO_DOMINIO}`;
  return nonceResponse(req, buildCsp("bio", nonce, process.env.NODE_ENV === "development"), nonce, destino);
}
```

e, no ramo `if (!firstParty)`, depois do `root-link`: `if (route === "bio-root") return bioRootResponse(req);` (atualizar o comentário do ramo: "só links, páginas e, na raiz, o link da bio").

`next.config.ts`: `import { FIRST_PARTY_HOST_PATTERN } from "./src/lib/custom-domains/host";` (antes do import de `domain-redirects`); na regra global, `source: "/((?!$|p/|p$|r/|r$|c/|c$|bio/|bio$|editor-preview).*)",` com o comentário acrescido de "e a raiz, que se divide por host logo abaixo"; logo depois dela:

```ts
      // A raiz se divide pelo host (mesmo padrão do matcher do middleware): no
      // Girumo é a home, com a CSP estática; no domínio do lojista é o link da
      // bio, e a CSP com nonce vem do middleware (bioRootResponse). As duas
      // juntas sairiam como dois headers na Vercel.
      { source: "/", has: [{ type: "host", value: FIRST_PARTY_HOST_PATTERN }], headers: securityHeaders },
      { source: "/", missing: [{ type: "host", value: FIRST_PARTY_HOST_PATTERN }], headers: headersWithoutCsp },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/host.test.ts src/lib/security/csp.test.ts`
Expected: PASS (inclusive "o matcher do middleware usa o mesmo padrão de host").
Run: `npx tsc --noEmit --project tsconfig.json`
Expected: sem erro (o `type: "host"` do `has` é checado pelo `NextConfig`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/custom-domains/host.ts apps/web/src/lib/custom-domains/host.test.ts apps/web/src/middleware.ts apps/web/next.config.ts apps/web/src/lib/security/csp.test.ts
git commit -m "feat(bio): custom domain root routes to the link-in-bio with its own CSP"
```

---

### Task 8: `_dominio` no handler

**Files:**
- Modify: `apps/web/src/lib/bio/rota-publica.ts`
- Test: `apps/web/src/lib/bio/rota-publica.test.ts`

**Interfaces:**
- Consumes: `paginaPublicaDaLoja(tenantId: string, origem: string): Promise<DadosRender | null>` (PR 2); `getActiveDomainTenant(hostname: string): Promise<string | null>` (`lib/stores/custom-domains`); `BIO_DOMINIO`, `LINK_NAO_ENCONTRADO`, `hostnameFromHostHeader`, `isFirstPartyHost` (Task 7 / `host.ts`).
- Produces: `DepsBio = { porSlug; daLoja; donoDoHost; contar }`.

- [ ] **Step 1: Write the failing tests**

No teste: `pedido` ganha a opção `host?: string` (`host: i.host ?? "www.girumo.com.br"`); `Opcoes` vira `{ busca?: BuscaPorSlug | Error; dono?: string | null; loja?: DadosRender | null }`; `cenario` devolve também `consultas: string[]` e o `deps` ganha:

```ts
    donoDoHost: async (host: string): Promise<string | null> => {
      consultas.push(`host:${host}`);
      return o.dono ?? null;
    },
    daLoja: async (tenantId: string, origem: string): Promise<DadosRender | null> => {
      consultas.push(`loja:${tenantId}:${origem}`);
      return o.loja ?? null;
    },
```

Testes novos:

```ts
test("raiz do domínio próprio: a página da loja dona do host, com a origem dele; conta visita", async () => {
  const loja = { ...dados(), origem: "https://links.atelie-da-ana.test", dominioProprio: true };
  const { deps, consultas, contados } = cenario({ dono: "loja-a", loja });
  const res = await responder(pedido("/bio/_dominio", { host: "Links.Atelie-da-Ana.test:443", ip: "203.0.113.50" }), "_dominio", deps);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(`data-pagina="${PAGINA}"`));
  assert.deepEqual(consultas, ["host:links.atelie-da-ana.test", "loja:loja-a:https://links.atelie-da-ana.test"]);
  await rodarDepois();
  assert.deepEqual(contados, [[PAGINA, "visita"]]);
});

test("_dominio no host do Girumo é 404 HTML, sem consultar nada", async () => {
  for (const host of ["www.girumo.com.br", "app.girumo.com.br", "localhost:3000"]) {
    const { deps, consultas, buscados } = cenario({ dono: "loja-a", loja: dados() });
    const res = await responder(pedido("/bio/_dominio", { host }), "_dominio", deps);
    assert.equal(res.status, 404, host);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8", host);
    assert.deepEqual([...consultas, ...buscados], [], host);
  }
});

test("domínio sem dono ativo, ou loja sem página: o 404 de texto do middleware", async () => {
  for (const o of [{ dono: null }, { dono: "loja-a", loja: null }]) {
    const { deps } = cenario(o);
    const res = await responder(pedido("/bio/_dominio", { host: "links.atelie-da-ana.test" }), "_dominio", deps);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(await res.text(), "Link não encontrado.");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/rota-publica.test.ts`
Expected: FAIL — `_dominio` ainda cai no 404 de formato (`consultas` vazio no primeiro teste novo).

- [ ] **Step 3: Implement**

Imports novos em `rota-publica.ts`: `paginaPublicaDaLoja` (junto de `paginaPublicaPorSlug`), `BIO_DOMINIO, LINK_NAO_ENCONTRADO, hostnameFromHostHeader, isFirstPartyHost` de `@/lib/custom-domains/host`, `getActiveDomainTenant` de `@/lib/stores/custom-domains`. Depois:

```ts
const DEPS = {
  porSlug: paginaPublicaPorSlug,
  daLoja: paginaPublicaDaLoja,
  donoDoHost: getActiveDomainTenant,
  contar: contarBio,
};
```

Primeira linha do `try` de `responderBio` (antes do filtro de formato, que recusaria `_dominio`; `return await` para o `catch` pegar a rejeição):

```ts
    if (slug === BIO_DOMINIO) return await raizDoDominio(req, deps);
```

```ts
/**
 * Raiz do domínio do lojista: o middleware reescreve `/` para `/bio/_dominio`
 * (spec §6). Em host do Girumo esse caminho não existe. No domínio, só a página
 * da loja DONA do host ativo, com a origem dele; sem dono ou sem página, o mesmo
 * 404 de texto do middleware.
 */
async function raizDoDominio(req: Request, deps: DepsBio): Promise<Response> {
  const host = hostnameFromHostHeader(req.headers.get("host"));
  if (isFirstPartyHost(host)) return naoEncontrada(req);
  const tenantId = await deps.donoDoHost(host);
  const dados = tenantId ? await deps.daLoja(tenantId, `https://${host}`) : null;
  if (!dados) return new Response(LINK_NAO_ENCONTRADO, { status: 404, headers: CABECALHO_TEXTO });
  return pagina(req, dados, deps);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/rota-publica.test.ts`
Expected: PASS (12 testes; o "slug fora do formato" continua passando com `_dominio` no host www).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bio/rota-publica.ts apps/web/src/lib/bio/rota-publica.test.ts
git commit -m "feat(bio): resolve the custom domain root to the owner's page"
```

---

### Task 9: Invalidação nas rotas de campanha

O botão "Grupo VIP" da página aponta para o link mestre (`campaignLinkPath(origem, slug)`); o cache guarda `campanhas` e `linksEscondidos` por 5 min. Trocar o slug ou apagar a campanha invalida a loja na hora.

**Files:**
- Modify: `apps/web/src/app/api/campanhas/route.ts` (PATCH, bloco `if (typeof b.slug === "string")`; DELETE, depois de `deleteCampaignGroup`)
- Test: `apps/web/src/app/api/campanhas/route.test.ts`

**Interfaces:**
- Consumes: `invalidarBioDaLoja(tenantId: string): void` (PR 2, `lib/bio/cache.ts`), que se espera chamar `revalidateTag("bio-loja:<tenantId>")` (tag da spec §6).

- [ ] **Step 1: Write the failing tests**

Em `route.test.ts`: imports novos `import { AsyncLocalStorage } from "node:async_hooks";` e `import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";`; o import de tipos vira `import type { DELETE as RotaDelete, PATCH as RotaPatch, POST as RotaPost } from "./route";`. Logo depois do comentário do topo:

```ts
// O Next lê este global uma vez, quando carrega: antes do import (dinâmico, no `before`).
// Sem ele o `revalidateTag` do link da bio não tem escopo de requisição onde registrar a tag.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
```

No `responder`, antes do ramo de `campaign_groups`:

```ts
  // Link novo da troca de slug (rename-slug): o mestre nasce antes de a campanha mudar.
  if (pathname === "/rest/v1/tracked_links" && metodo === "POST") {
    return {
      status: 201,
      corpo: { id: "link-novo", tenant_id: "loja-a", campaign_group_id: ESTA, slug: "verao-novo", target_url: "", clicks: 0, metadata: { master: true } },
    };
  }
  // O DELETE cancela os disparos da campanha antes de apagar: aqui não há nenhum.
  if (pathname === "/rest/v1/broadcasts" && metodo === "GET") return { status: 200, corpo: [] };
```

Variáveis `let DELETE: typeof RotaDelete;` e `let naRequisicao: (escopo: WorkStore, fn: () => Promise<Response>) => Promise<Response>;`; no `before`, antes do import da rota:

```ts
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  naRequisicao = (escopo, fn) => workAsyncStorage.run(escopo, fn);
  ({ POST, PATCH, DELETE } = await import("./route"));
```

Testes novos, ao fim:

```ts
/** Escopo de requisição falso: o `revalidateTag` do Next só pede `incrementalCache` e registra a tag nele. */
function novoEscopo(): WorkStore {
  return { incrementalCache: {} } as unknown as WorkStore;
}

test("PATCH que troca o link da campanha invalida o link da bio da loja", async () => {
  chamadas.length = 0;
  escrita = { status: 200, corpo: [linha(ESTA, "Verao")] };
  const escopo = novoEscopo();

  const res = await naRequisicao(escopo, () => PATCH(pedir("PATCH", { id: ESTA, slug: "verao-novo" })));

  assert.equal(res.status, 200);
  assert.equal(feitas("POST", "/rest/v1/tracked_links").length, 1, "o link novo nasce antes");
  assert.ok(escopo.pendingRevalidatedTags?.includes("bio-loja:loja-a"), `tags: ${escopo.pendingRevalidatedTags}`);
});

test("PATCH que não troca o link não mexe no cache da bio", async () => {
  chamadas.length = 0;
  escrita = { status: 200, corpo: [linha(ESTA, "Verao")] };
  const escopo = novoEscopo();

  const res = await naRequisicao(escopo, () => PATCH(pedir("PATCH", { id: ESTA, name: "Verao 2" })));

  assert.equal(res.status, 200);
  assert.equal(escopo.pendingRevalidatedTags, undefined);
});

test("DELETE da campanha invalida o link da bio da loja", async () => {
  chamadas.length = 0;
  escrita = { status: 204 };
  const escopo = novoEscopo();

  const res = await naRequisicao(escopo, () =>
    DELETE(
      new Request(`http://girumo.test/api/campanhas?id=${ESTA}`, {
        method: "DELETE",
        headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-a" },
      }),
    ),
  );

  assert.equal(res.status, 200);
  const [apagou] = feitas("DELETE", "/rest/v1/campaign_groups");
  assert.equal(apagou.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.ok(escopo.pendingRevalidatedTags?.includes("bio-loja:loja-a"), `tags: ${escopo.pendingRevalidatedTags}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/campanhas/route.test.ts`
Expected: FAIL nos dois testes de invalidação (`tags: undefined`); os 4 antigos e o "não troca o link" passam.

- [ ] **Step 3: Implement**

`route.ts`: `import { invalidarBioDaLoja } from "@/lib/bio/cache";` junto dos outros `@/lib`. No PATCH:

```ts
  if (typeof b.slug === "string") {
    const r = await renomearSlugCampanha(tenantId, id, b.slug);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    // O botão "Grupo VIP" do link da bio aponta para o link mestre: sem isto a
    // página mostra o link antigo por até 5 min (spec link-da-bio §6).
    invalidarBioDaLoja(tenantId);
  }
```

No DELETE:

```ts
  await supaStore.deleteCampaignGroup(tenantId, id);
  // Campanha apagada sai do link da bio já na próxima visita (linksEscondidos).
  invalidarBioDaLoja(tenantId);
  return Response.json({ ok: true });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/campanhas/route.test.ts src/app/api/campanhas/campanhas.integracoes.test.ts`
Expected: PASS (7 testes em `route.test.ts`). Se o PR 2 tiver nomeado a tag diferente de `bio-loja:<tenantId>`, ajustar a asserção à tag real — nunca apagar o teste.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/campanhas/route.ts apps/web/src/app/api/campanhas/route.test.ts
git commit -m "feat(campanhas): invalidate the link-in-bio cache on slug change and delete"
```

---

### Task 10: e2e do domínio próprio

**Files:**
- Modify: `apps/web/e2e/link-da-bio-publica.spec.ts`

**Interfaces:**
- Consumes: tabela `custom_domains` (já em produção); o roteamento das Tasks 7–8.

- [ ] **Step 1: Acrescentar ao spec**

Constante: `const DOMINIO = "links.e2e-bio.test";` (TLD `.test`: nunca é host de verdade). No fim do `beforeAll` — idempotente como o resto da loja fixa (um domínio por loja: `custom_domains_tenant_unique`):

```ts
    // Domínio próprio ativo da loja do e2e: a raiz dele serve a página (o host vem do header Host).
    const dominio = await banco
      .from("custom_domains")
      .upsert(
        { tenant_id: lojaId, hostname: DOMINIO, verification_token: "e2e-bio", status: "active" },
        { onConflict: "tenant_id" },
      );
    if (dominio.error) throw new Error(`domínio do e2e: ${dominio.error.message}`);
```

Testes novos, depois do de 308:

```ts
  test("domínio próprio: a raiz mostra a página da loja dona, com a CSP da bio", async ({ request }) => {
    const res = await request.get("/", { headers: { host: DOMINIO, "user-agent": ROBO } });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
    const html = await conferirNonce(res);
    expect(html).toContain(`data-pagina="${paginaId}"`);
  });

  test("domínio próprio: /bio/* lá é 404, e host sem dono também — o 404 de texto", async ({ request }) => {
    const casos: [string, string][] = [
      [DOMINIO, `/bio/${SLUG_ATUAL}`],
      ["sem-dono.e2e-bio.test", "/"],
    ];
    for (const [host, caminho] of casos) {
      const res = await request.get(caminho, { headers: { host, "user-agent": ROBO } });
      expect(res.status(), `${host}${caminho}`).toBe(404);
      expect(await res.text(), `${host}${caminho}`).toBe("Link não encontrado.");
    }
  });
```

- [ ] **Step 2: Run** (em `apps/web`, mesmos pré-requisitos da Task 5): `npx playwright test e2e/link-da-bio-publica.spec.ts`
Expected: `8 passed`.

- [ ] **Step 3: Typecheck:** `npx tsc --noEmit --project tsconfig.e2e.json` → sem erro.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/link-da-bio-publica.spec.ts
git commit -m "test(e2e): link-in-bio on a custom domain root"
```

---

### Task 11: Fechamento da Parte 2

- [ ] **Step 1:** `verify-local.ps1` e defasagem, como na Task 6.
- [ ] **Step 2: Push e PR:** `git push -u origin feat/bio-raiz-dominio`; `gh pr create --base main --title "feat(bio): custom domain root serves the link-in-bio (link da bio 4a, parte 2)"` com corpo no mesmo formato (raiz `bio-root` → `/bio/_dominio`, `/` dividida por host no `headers()`, `invalidarBioDaLoja` no PATCH/DELETE de campanha, e2e) terminando em `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Revisão de segurança** (spec §10): agente `Security Engineer`, foco em: `_dominio` só fora dos hosts Girumo; loja sempre a dona do host **ativo**; nada da loja A no domínio da B; a home do www sem perder a CSP com o `has`/`missing`.
- [ ] **Step 4:** `gh pr checks <N>` verde com o e2e em `8 passed`; `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`; esperar o deploy em `/admin/configuracoes`.
- [ ] **Step 5: Prova pós-deploy** — **logo depois do deploy, primeiro a home** (se a CSP dela sumir ou dobrar, reverter este PR na hora):

```powershell
curl.exe -sI "https://www.girumo.com.br/" | Select-String "^content-security-policy:"
$d = "https://<dominio de teste — o Igor indica>"
curl.exe -sI "$d/" | Select-String "^HTTP/|^content-security-policy:|^x-robots-tag:"
(curl.exe -sI "$d/" | Select-String "^content-security-policy:").Count
curl.exe -sI "$d/bio/prova-bio" | Select-String "^HTTP/"
curl.exe -s -A "facebookexternalhit/1.1" "https://www.girumo.com.br/bio/prova-bio" | Select-String -Pattern 'href="[^"]*/r/[^"]*"' -AllMatches | ForEach-Object { $_.Matches.Value }
```

Expected: a home com a CSP estática, uma linha; a raiz do domínio com `200` (se o domínio for da loja de teste, que tem a página) ou `404` (loja sem página) — nos dois casos **uma** linha `content-security-policy: default-src 'none'…` e `x-robots-tag: noindex`; contagem `1`; `/bio/prova-bio` no domínio → `404`. Invalidação: renomear no painel o link da campanha usada na página de prova e repetir a última linha na hora → o `href` já mostra o slug novo (antes desta parte, levava até 5 min). O UA `facebookexternalhit` não conta visita. Colar no PR.
- [ ] **Step 6: Quadro:** card segue `em_construcao`; o Igor reescreve o blocker (`update public.board_features set blocker = 'Falta: 4b, 5, 6a, 3b, 6b, 7. /bio e a raiz do domínio próprio no ar (PRs #<N1>, #<N2>).' where key = 'link-da-bio';`). Encerrar com "PRs que deixei abertos: nenhum".

---

## Critérios de aceite

**Parte 1**
- `GET /bio/<slug publicado>` em www → 200, HTML de `renderPaginaBio`, `x-robots-tag: noindex`, **um** `content-security-policy` com `default-src 'none'`, e o nonce do header é o do HTML.
- `HEAD` → 200 sem corpo e sem visita.
- Slug antigo → 301 `location: /bio/<atual><query>`, `cache-control: no-store`.
- Inexistente, não publicada, bloqueada, fora do formato ou `_dominio` → 404 HTML "Página não encontrada", sem marca; fora do formato não consulta o cache.
- `app.girumo.com.br` e `girumo.com.br` → 308 `https://www.girumo.com.br/bio/:path*`.
- Visita: uma por GET de gente, depois da resposta; nenhuma para HEAD, prefetch e robô; teto 30/min por IP+página.
- `/bio/` no `robots.ts`; `/bio/:path*` no matcher; a regra global do next.config não casa `/bio`.
- CI verde com o e2e `6 passed`, revisão de segurança sem CRITICAL/HIGH, prova pós-deploy colada no PR.

**Parte 2**
- Raiz de domínio próprio ativo com página → 200 da loja dona, origem `https://<host>`, uma CSP `bio`, `noindex`, visita contada.
- Raiz sem dono ou sem página → 404 `Link não encontrado.` (texto); `/bio/*` no domínio → 404 de texto; `/bio/_dominio` em host Girumo → 404 HTML sem consultar o banco.
- A home do www continua com a CSP estática, uma linha (curl).
- `PATCH` com `slug` e `DELETE` de campanha registram `bio-loja:<tenantId>`; `PATCH` sem `slug`, não.
- CI verde com o e2e `8 passed`, revisão de segurança, prova pós-deploy.

## Comandos de verificação

Em `apps/web`:

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/rota-publica.test.ts src/lib/security/csp.test.ts src/lib/domain-redirects.test.ts src/app/brand-routes.test.ts src/lib/custom-domains/host.test.ts src/app/api/campanhas/route.test.ts src/lib/pages/analytics.test.ts
npm test
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm run lint
npm run brand:check
npx playwright test e2e/link-da-bio-publica.spec.ts
```

Na raiz: `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`. No PR: `gh pr checks <N>`. Depois do deploy: os blocos `curl.exe -sI` das Tasks 6 e 11 (HEAD, não contam visita).

## Riscos e pontos de atenção

- **CSP dupla só aparece na Vercel.** O `next start` do CI junta dois headers iguais (Node `setHeader` sobrescreve), então o e2e "um header só" não pega a duplicação. Quem pega antes do deploy é o teste de texto do next.config (`csp.test.ts`); a prova é o `curl.exe -sI` (spec §6).
- **`has`/`missing` de host em `headers()` (Parte 2).** Se a Vercel não aplicar como o `next start`, a home do www pode perder a CSP. Por isso o primeiro curl depois do deploy é o da home, com reversão imediata do PR se falhar.
- **Achado pré-existente, fora do escopo:** no domínio do lojista, `/<slug>` (root-link → `/r/<slug>`) também casa a regra global; na Vercel deve sair com duas CSP, e a estática não libera `connect.facebook.net` — o Pixel/GA da tela de entrada no domínio próprio estaria bloqueado. Conferir com `(curl.exe -sI "https://<dominio>/<slug-de-campanha-com-pixel>" | Select-String "^content-security-policy:").Count` (o UA do curl é robô no `/r/`: não grava clique) e, se der 2, abrir card próprio.
- **Cache de 5 min:** publicar, bloquear ou trocar slug por SQL não invalida. O e2e regrava sempre o mesmo estado antes das visitas (no CI o servidor nasce com o cache vazio) e a prova em prod cria tudo antes da primeira visita.
- **Tag de invalidação:** o teste da Task 9 assume `revalidateTag("bio-loja:<tenantId>")` dentro de `invalidarBioDaLoja` (tags da spec §6). Se o PR 2 usar outro nome, ajustar a asserção, não apagar o teste.
- **`isBotUserAgent` não reconhece `curl`:** um `curl` GET em prod conta visita. A prova usa `curl.exe -sI` (HEAD) ou `-A "facebookexternalhit/1.1"`; nunca GET de curl na página de loja real.
- **`X-Robots-Tag: noindex`** é acréscimo à spec (que fala do `<meta>`): é o que deixa o `curl -sI` provar o `noindex`, e cobre o 404 de texto do domínio.
- **Slug com maiúscula** (`/bio/MinhaLoja`) dá 404, sem normalizar — aceito na v1. `/bio` sem slug cai no 404 do Next com a CSP da bio (sem estilo), como `/p` e `/r` hoje.
- **e2e com loja fixa:** o PR 1 tira `DELETE` de `bio_slugs` até da service role, então loja por run deixaria dois slugs presos por run. A loja `e2e-bio-fixa` fica no dev (como o usuário de QA), o run só regrava o estado; a visita é "pelo menos +1" porque outro run pode usar a mesma página ao mesmo tempo, e a exatidão fica no teste de unidade. Guarda de produção; nada na loja de QA. Não rodar local com `e2e` de outro PR em `pending` (corrida no banco dev).
- **Ordem:** o 4b só com a Parte 2 em `main` (o e2e dele usa o `DOMINIO`); o 6a só com a Parte 2 em prod (o painel mostra a raiz do domínio próprio como endereço principal).

## Interface com os outros PRs

**Exporta — Parte 1**

```ts
// apps/web/src/lib/bio/rota-publica.ts (server-only) — nome novo, acrescentado ao §9
export type DepsBio = {
  porSlug: (slug: string) => Promise<BuscaPorSlug>;                          // = typeof paginaPublicaPorSlug
  contar: (paginaId: string, alvo: string) => Promise<void>;                 // = typeof contarBio
  daLoja: (tenantId: string, origem: string) => Promise<DadosRender | null>; // Parte 2: = typeof paginaPublicaDaLoja
  donoDoHost: (hostname: string) => Promise<string | null>;                  // Parte 2: = typeof getActiveDomainTenant
};
export function responderBio(req: Request, slug: string, deps?: DepsBio): Promise<Response>;

// apps/web/src/app/bio/[slug]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response>;
export const HEAD: typeof GET;

// apps/web/src/lib/security/csp.ts — o PR 7 acrescenta os hosts da Meta/GA no ramo "bio"
export type NonceSurface = "public-lp" | "click-redirect" | "bio";
export function surfaceForPath(pathname: string): NonceSurface | null; // "/bio" e "/bio/…" → "bio"
export function buildCsp(surface: NonceSurface, nonce: string, isDev: boolean): string;

// apps/web/src/lib/pages/analytics.ts — o PR 4b acrescenta "bio-toque"
export function isRateLimited(
  rota: "lead" | "track" | "outbound" | "bio-visita",
  req: Request,
  max: number,
  slug?: string,
  limitar?: typeof checkRateLimit,
): Promise<boolean>;

// apps/web/src/lib/domain-redirects.ts
export const APEX_HOST = "girumo.com.br";
export function bioDomainRedirects(): HostRedirect[]; // /bio/:path* em app. e apex → https://www.girumo.com.br/bio/:path*
```

**Exporta — Parte 2**

```ts
// apps/web/src/lib/custom-domains/host.ts (Edge)
export type CustomHostRoute = "surface" | "public-api" | "root-link" | "bio-root" | "not-found";
export const BIO_DOMINIO = "_dominio";
export const LINK_NAO_ENCONTRADO = "Link não encontrado.";
export function customHostRoute(pathname: string): CustomHostRoute; // "/" → "bio-root"
```

**Contrato HTTP** (o que 4b, 6a e 7 podem assumir): `https://www.girumo.com.br/bio/<slug>` e, depois da Parte 2, `https://<domínio ativo>/` servem a página; `app.` e apex → 308 www; `/bio/*` no domínio próprio → 404. Resposta da página: `content-type: text/html; charset=utf-8`, `x-robots-tag: noindex`, CSP `bio` com o nonce de `x-nonce`; `connect-src 'self'` deixa passar o beacon do 4b (`/api/p/bio/toque`, fora do matcher do middleware).

**Usa**

- PR 1: tabelas `bio_pages`, `bio_slugs` (trigger `bio_pages_registra_slug` → `bio_registra_slug()`; sem `DELETE` nem para a service role), `bio_contagens`; função `bio_contar` (via `contarBio`). O e2e cria/regrava `organizations`, `bio_pages` e `custom_domains` da loja fixa e lê `bio_contagens`; nunca escreve em `bio_slugs`.
- PR 2, `lib/bio/cache.ts`: `type BuscaPorSlug = { tipo: "pagina"; dados: DadosRender } | { tipo: "mudou"; slugAtual: string } | null`; `paginaPublicaPorSlug(slug: string): Promise<BuscaPorSlug>`; `paginaPublicaDaLoja(tenantId: string, origem: string): Promise<DadosRender | null>`; `invalidarBioDaLoja(tenantId: string): void` (espera-se `revalidateTag("bio-loja:<tenantId>")`).
- PR 2, `lib/bio/documento.ts`: `SLUG_BIO: RegExp`; `documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio`; `type DadosRender = { documento: DocumentoBio; paginaId: string; campanhas: Record<string, string>; linksEscondidos: string[]; origem: string; dominioProprio: boolean }`.
- PR 2, `lib/stores/bio-pages.ts`: `contarBio(paginaId: string, alvo: string): Promise<void>`.
- PR 3a, `lib/bio/render/index.ts`: `renderPaginaBio(d: DadosRender, o: { modo: "publica" | "previa"; nonce: string | null; animarEntrada: boolean }): string` — chamado com `modo: "publica"`, `nonce` = `x-nonce`, `animarEntrada` = `documento.animar`; `renderPaginaNaoEncontrada(nonce: string | null): string`. Esperado do HTML: nonce no `<style>`/`<script>`, `<body data-pagina="<uuid>">`, `<title>` = nome da loja; o 404 com "Página não encontrada", o nonce no `<style>` e nenhum "girumo".
- Já no repo: `getActiveDomainTenant(hostname: string): Promise<string | null>` (`lib/stores/custom-domains`), `isBotUserAgent`, `hostnameFromHostHeader`, `isFirstPartyHost`, `FIRST_PARTY_HOST_PATTERN`, `generateNonce`, `nonceResponse` (middleware), `renomearSlugCampanha`, `deleteCampaignGroup`.
