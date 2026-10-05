# Domínio próprio do lojista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o lojista conecta um subdomínio dele (`links.sualoja.com.br`) e os links de grupo (`/r/`, `/c/`) e páginas (`/p/`) passam a abrir nesse endereço.

**Architecture:** o host do lojista é adicionado ao projeto Vercel `girumo` pela API de Domínios, depois de provar posse por TXT. O middleware restringe o que um host não-Girumo serve (só `/r` `/c` `/p` e `/api/p`), e os handlers só abrem link/página do tenant dono do domínio ativo. O painel ganha o cartão de configuração e passa a montar os links copiáveis com a origem do domínio ativo.

**Tech Stack:** Next 15.5 (App Router, middleware Edge), Supabase (service-role + RLS), API REST da Vercel, `node:dns/promises`, testes `tsx --test` (node:test).

**Spec:** `docs/superpowers/specs/2026-10-04-dominio-proprio-design.md`

## Global Constraints

- Toda query em tabela com `tenant_id` filtra `.eq("tenant_id", …)` — única exceção documentada: `getActiveDomainTenant` (descobre o tenant pelo host).
- Ids da Vercel são constantes: projeto `prj_OqpJ680p1Q5LWE2cGjiOg1cnuJPq`, time `team_2H4HYmKVySM4jMf2MCOAdm3E`. Único env novo: `VERCEL_API_TOKEN` (servidor).
- Registro de posse: `_girumo-verify.<host>` TXT `girumo-verify=<token>`; CNAME: `<host>` → `cname.vercel-dns.com`.
- Hosts first-party (padrão literal, igual no middleware): `(?:localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)*(?:girumo\.com\.br|hubflow\.com\.br|vercel\.app|localhost))`.
- Mutação de domínio exige `assertPermission(ctx.role, "settings:connection")` (owner/admin).
- Migração idempotente, nos DOIS bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`), registrada em `deploy/supabase/apply-order.txt`. NÃO aplicar — fica para o Igor.
- Testes: rodar de `apps/web` com `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Suite inteira: `npm test` em `apps/web`.
- Implementadores **não commitam**: deixam as mudanças na árvore e reportam os arquivos tocados. O controlador commita por tarefa.
- Copy em pt-BR para o lojista; código, nomes de teste podem ser pt-BR (padrão do repo); commits em inglês.

## File Structure

**PR 1 — servidor (branch `worktree-dominio-proprio`)**

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/custom-domains/host.ts` | padrão first-party, `isFirstPartyHost`, `hostnameFromHostHeader`, `customHostRoute` (Edge-safe) |
| `apps/web/src/lib/custom-domains/hostname.ts` | `normalizeHostname`, `dnsRecordsFor`, `CNAME_TARGET`, `DnsRecord` |
| `apps/web/src/lib/custom-domains/vercel.ts` | cliente da API de Domínios da Vercel |
| `apps/web/src/lib/custom-domains/verify.ts` | orquestra TXT → Vercel → config |
| `apps/web/src/lib/custom-domains/serves-tenant.ts` | `hostServesTenant` |
| `apps/web/src/lib/custom-domains/view.ts` | `DominioView`, `toDominioView`, `textoDoProblema`, `customLinkOrigin` (client-safe) |
| `apps/web/src/lib/stores/custom-domains.ts` | store da tabela |
| `apps/web/supabase/migrations/20261005120000_custom_domains.sql` | tabela + RLS |
| `apps/web/src/middleware.ts` | ramo de host de lojista + entrada no `matcher` |
| `apps/web/src/lib/links/short-link-click.ts` | checagem de tenant em `/r` `/c` |
| `apps/web/src/app/p/[slug]/page.tsx` | checagem de tenant em `/p` |
| `apps/web/src/app/api/dominio/route.ts` | GET/POST/DELETE |
| `apps/web/src/app/api/dominio/verificar/route.ts` | POST verificar |

**PR 2 — painel (branch `feat/dominio-proprio-painel`, criada depois do PR 1)**

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/painel/use-link-origin.ts` | hook `useLinkOrigin` + `esquecerOrigemDoDominio` |
| `apps/web/src/components/painel/configuracoes/dominio-proprio.tsx` | cartão "Domínio próprio" |
| `apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx` | monta o cartão na aba Conexão |
| `apps/web/src/app/painel/campanhas/page.tsx`, `apps/web/src/app/painel/campanhas/[slug]/page.tsx`, `apps/web/src/components/painel/campaign-config.tsx` | origem dos links copiáveis |

## Waves (execução paralela segura)

| Wave | Tarefas | Por quê |
|---|---|---|
| 1 | T1, T2, T3, T4 | arquivos disjuntos, sem dependência |
| 2 | T5, T6 | T5 usa T2+T3; T6 usa T1+T4; arquivos disjuntos |
| 3 | T7, T8, T9 | T7 usa T2+T4+T5; T8 usa T1; T9 usa T1+T6 |
| 4 | T10 | usa T2, T3, T4, T5, T7 |
| 5 (PR 2) | T11 | usa T7 |
| 6 (PR 2) | T12 | usa T7, T11 |

---

### Task 1: Fronteira de host (`host.ts`)

**Files:**
- Create: `apps/web/src/lib/custom-domains/host.ts`
- Test: `apps/web/src/lib/custom-domains/host.test.ts`

**Interfaces:**
- Produces: `FIRST_PARTY_HOST_PATTERN: string`, `isFirstPartyHost(hostname: string): boolean`, `hostnameFromHostHeader(host: string | null): string`, `type CustomHostRoute = "surface" | "public-api" | "not-found"`, `customHostRoute(pathname: string): CustomHostRoute`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/custom-domains/host.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { customHostRoute, hostnameFromHostHeader, isFirstPartyHost } from "./host";

test("hosts do Girumo, previews e dev local são first-party", () => {
  for (const host of [
    "girumo.com.br",
    "app.girumo.com.br",
    "www.girumo.com.br",
    "app.hubflow.com.br",
    "girumo-git-main-time.vercel.app",
    "localhost",
    "127.0.0.1",
    "APP.GIRUMO.COM.BR",
  ]) {
    assert.equal(isFirstPartyHost(host), true, host);
  }
});

test("domínio de lojista e imitações não são first-party", () => {
  for (const host of [
    "links.sualoja.com.br",
    "evilgirumo.com.br",
    "girumo.com.br.evil.com",
    "app.girumo.com.br.sualoja.com",
    "vercel.app.evil.com",
    "",
  ]) {
    assert.equal(isFirstPartyHost(host), false, host);
  }
});

test("Host com porta e caixa vira o hostname que o Next compara", () => {
  assert.equal(hostnameFromHostHeader("Links.SuaLoja.com.br:443"), "links.sualoja.com.br");
  assert.equal(hostnameFromHostHeader("localhost:3000"), "localhost");
  assert.equal(hostnameFromHostHeader(null), "");
});

test("domínio de lojista serve só links, páginas e as APIs públicas delas", () => {
  assert.equal(customHostRoute("/r/vip"), "surface");
  assert.equal(customHostRoute("/c/comunidade"), "surface");
  assert.equal(customHostRoute("/p/minha-loja"), "surface");
  assert.equal(customHostRoute("/api/p/lead"), "public-api");
  assert.equal(customHostRoute("/api/p/media/123"), "public-api");
  for (const path of ["/", "/login", "/signup", "/painel", "/painel/campanhas", "/admin", "/api/dominio", "/api/auth/login", "/r", "/p", "/rr/x"]) {
    assert.equal(customHostRoute(path), "not-found", path);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/host.test.ts`
Expected: FAIL — `Cannot find module './host'`.

- [ ] **Step 3: Write minimal implementation** — `apps/web/src/lib/custom-domains/host.ts`

```ts
/**
 * Fronteira entre os hosts do Girumo e os domínios próprios dos lojistas.
 * Roda no middleware (Edge): nada de import de Node aqui.
 */

/**
 * Hosts do próprio Girumo — o resto é domínio de lojista.
 *
 * O MESMO texto mora literal no `matcher` do middleware, porque o Next exige
 * config estática ali; `host.test.ts` lê o middleware e trava os dois iguais.
 * O Next compara com o host sem porta e em minúsculas, ancorando `^…$`: o grupo
 * externo é o que impede a alternação de escapar da âncora.
 */
export const FIRST_PARTY_HOST_PATTERN =
  "(?:localhost|127\\.0\\.0\\.1|(?:[a-z0-9-]+\\.)*(?:girumo\\.com\\.br|hubflow\\.com\\.br|vercel\\.app|localhost))";

const FIRST_PARTY_HOST_RE = new RegExp(`^${FIRST_PARTY_HOST_PATTERN}$`);

export function isFirstPartyHost(hostname: string): boolean {
  return FIRST_PARTY_HOST_RE.test(hostname.trim().toLowerCase());
}

/** `Host` da request sem porta e em minúsculas — o mesmo recorte que o Next faz. */
export function hostnameFromHostHeader(host: string | null): string {
  return (host ?? "").split(":", 1)[0].trim().toLowerCase();
}

export type CustomHostRoute = "surface" | "public-api" | "not-found";

/**
 * O que um domínio de lojista serve: os links (/r, /c), as páginas (/p) e as
 * APIs públicas que essas páginas chamam (/api/p — lead, track e mídia).
 * Painel, login e API logada não existem nesse endereço.
 */
export function customHostRoute(pathname: string): CustomHostRoute {
  if (/^\/[rcp]\//.test(pathname)) return "surface";
  if (pathname.startsWith("/api/p/")) return "public-api";
  return "not-found";
}
```

- [ ] **Step 4: Run test to verify it passes** — mesmo comando. Expected: PASS (4 testes).

- [ ] **Step 5: Report files** — `host.ts`, `host.test.ts`. (Controlador commita: `feat: add first-party host boundary for custom domains`.)

---

### Task 2: Validação do endereço e registros DNS (`hostname.ts`)

**Files:**
- Create: `apps/web/src/lib/custom-domains/hostname.ts`
- Test: `apps/web/src/lib/custom-domains/hostname.test.ts`

**Interfaces:**
- Consumes: `isFirstPartyHost` de `./host` (Task 1).
- Produces: `CNAME_TARGET = "cname.vercel-dns.com"`, `type DnsRecord = { tipo: "CNAME" | "TXT"; nome: string; valor: string }`, `dnsRecordsFor(hostname: string, token: string): { cname: DnsRecord; txt: DnsRecord }`, `type HostnameCheck = { ok: true; hostname: string } | { ok: false; error: string }`, `normalizeHostname(input: string): HostnameCheck`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/custom-domains/hostname.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { dnsRecordsFor, normalizeHostname } from "./hostname";

test("aceita subdomínio e limpa URL colada", () => {
  assert.deepEqual(normalizeHostname("links.sualoja.com.br"), { ok: true, hostname: "links.sualoja.com.br" });
  assert.deepEqual(normalizeHostname("  https://Links.SuaLoja.com.br/r/vip?utm=x "), { ok: true, hostname: "links.sualoja.com.br" });
  assert.deepEqual(normalizeHostname("grupos.loja.com."), { ok: true, hostname: "grupos.loja.com" });
  assert.deepEqual(normalizeHostname("vip.loja.co.uk"), { ok: true, hostname: "vip.loja.co.uk" });
});

test("recusa raiz da loja e pede subdomínio", () => {
  for (const raiz of ["sualoja.com.br", "sualoja.com", "loja.co.uk"]) {
    const r = normalizeHostname(raiz);
    assert.equal(r.ok, false, raiz);
    if (!r.ok) assert.match(r.error, /subdomínio/, raiz);
  }
});

test("recusa endereço inválido e IP", () => {
  for (const ruim of ["", "   ", "links..loja.com", "-links.loja.com", "links_loja.com.br", "*.loja.com.br", "127.0.0.1", "links.loja.c0m"]) {
    assert.equal(normalizeHostname(ruim).ok, false, JSON.stringify(ruim));
  }
});

test("recusa host do próprio Girumo", () => {
  const r = normalizeHostname("app.girumo.com.br");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Girumo/);
});

test("registros DNS: CNAME para a Vercel e TXT de posse com o token", () => {
  assert.deepEqual(dnsRecordsFor("links.sualoja.com.br", "abc123"), {
    cname: { tipo: "CNAME", nome: "links.sualoja.com.br", valor: "cname.vercel-dns.com" },
    txt: { tipo: "TXT", nome: "_girumo-verify.links.sualoja.com.br", valor: "girumo-verify=abc123" },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/hostname.test.ts`
Expected: FAIL — `Cannot find module './hostname'`.

- [ ] **Step 3: Write minimal implementation** — `apps/web/src/lib/custom-domains/hostname.ts`

```ts
/**
 * O endereço que o lojista digita e os registros DNS que ele cria. Puro: roda
 * no servidor, no painel e no teste.
 */
import { isFirstPartyHost } from "./host";

export const CNAME_TARGET = "cname.vercel-dns.com";

export type DnsRecord = { tipo: "CNAME" | "TXT"; nome: string; valor: string };

/** Os dois registros que ativam o domínio: o apontamento e a prova de posse. */
export function dnsRecordsFor(hostname: string, token: string): { cname: DnsRecord; txt: DnsRecord } {
  return {
    cname: { tipo: "CNAME", nome: hostname, valor: CNAME_TARGET },
    txt: { tipo: "TXT", nome: `_girumo-verify.${hostname}`, valor: `girumo-verify=${token}` },
  };
}

export type HostnameCheck = { ok: true; hostname: string } | { ok: false; error: string };

const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Segundo nível público de ccTLD (`com.br`, `co.uk`): `sualoja.com.br` é raiz,
 * não subdomínio. ponytail: lista curta à mão em vez da Public Suffix List —
 * raiz que escapar daqui cai no "CNAME não aponta" da Vercel, que tem o mesmo
 * conserto (usar um subdomínio).
 */
const SECOND_LEVEL = new Set(["com", "net", "org", "edu", "gov", "co"]);

const PEDE_SUBDOMINIO =
  "Use um subdomínio, como links.sualoja.com.br — o endereço principal continua com o site da loja.";

/** Aceita a URL colada da barra do navegador: tira esquema, caminho, porta e o ponto final. */
function limpar(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/, 1)[0]
    .split(":", 1)[0]
    .replace(/\.$/, "");
}

export function normalizeHostname(input: string): HostnameCheck {
  const host = limpar(input);
  if (!host) return { ok: false, error: "Digite o endereço, por exemplo links.sualoja.com.br." };

  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (host.length > 253 || !labels.every((l) => LABEL_RE.test(l)) || !TLD_RE.test(tld)) {
    return { ok: false, error: "Endereço inválido. Use só letras, números, hífen e ponto." };
  }
  if (isFirstPartyHost(host)) {
    return { ok: false, error: "Esse endereço é do Girumo. Use um domínio da sua loja." };
  }

  const ccSecondLevel = labels.length >= 3 && tld.length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]);
  if (labels.length < (ccSecondLevel ? 4 : 3)) return { ok: false, error: PEDE_SUBDOMINIO };

  return { ok: true, hostname: host };
}
```

- [ ] **Step 4: Run test to verify it passes** — mesmo comando. Expected: PASS (5 testes).

- [ ] **Step 5: Report files** — `hostname.ts`, `hostname.test.ts`. (Commit: `feat: validate custom domain hostnames and DNS records`.)

---

### Task 3: Cliente da API de Domínios da Vercel (`vercel.ts`)

**Files:**
- Create: `apps/web/src/lib/custom-domains/vercel.ts`
- Test: `apps/web/src/lib/custom-domains/vercel.test.ts`

**Interfaces:**
- Produces: `class VercelApiError extends Error { status: number; code: string }`, `type VercelChallenge = { type: string; domain: string; value: string; reason: string }`, `type ProjectDomain = { name: string; verified: boolean; verification: VercelChallenge[] }`, `vercelConfigured(): boolean`, `getProjectDomain(name): Promise<ProjectDomain | null>`, `addProjectDomain(name): Promise<ProjectDomain>`, `verifyProjectDomain(name): Promise<ProjectDomain>`, `isDomainMisconfigured(name): Promise<boolean>`, `removeProjectDomain(name): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/custom-domains/vercel.test.ts`

```ts
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  VercelApiError,
  addProjectDomain,
  getProjectDomain,
  isDomainMisconfigured,
  removeProjectDomain,
  vercelConfigured,
  verifyProjectDomain,
} from "./vercel";

type Chamada = { method: string; url: URL; auth: string | null; body: unknown };
let chamadas: Chamada[] = [];
let respostas: Response[] = [];
const fetchOriginal = globalThis.fetch;

const PROJETO = "prj_OqpJ680p1Q5LWE2cGjiOg1cnuJPq";
const TIME = "team_2H4HYmKVySM4jMf2MCOAdm3E";
const HOST = "links.loja.com.br";

beforeEach(() => {
  chamadas = [];
  respostas = [];
  process.env.VERCEL_API_TOKEN = "token-de-teste";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      auth: new Headers(init?.headers).get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const proxima = respostas.shift();
    if (!proxima) throw new Error("fetch sem resposta preparada");
    return proxima;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.VERCEL_API_TOKEN;
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("sem token a integração fica desligada e não chama a API", async () => {
  delete process.env.VERCEL_API_TOKEN;
  assert.equal(vercelConfigured(), false);
  await assert.rejects(getProjectDomain(HOST), (e: unknown) => e instanceof VercelApiError && e.code === "not_configured");
  assert.equal(chamadas.length, 0);
});

test("lê o domínio do projeto com token e time; 404 vira null", async () => {
  respostas.push(json(404, { error: { code: "not_found", message: "x" } }));
  assert.equal(await getProjectDomain(HOST), null);
  const [c] = chamadas;
  assert.equal(c.method, "GET");
  assert.equal(c.url.pathname, `/v9/projects/${PROJETO}/domains/${HOST}`);
  assert.equal(c.url.searchParams.get("teamId"), TIME);
  assert.equal(c.auth, "Bearer token-de-teste");
});

test("adiciona o domínio ao projeto e devolve o estado de verificação", async () => {
  const desafio = { type: "TXT", domain: "_vercel.loja.com.br", value: "vc-domain-verify=abc", reason: "pending_domain_verification" };
  respostas.push(json(200, { name: HOST, verified: false, verification: [desafio], apexName: "loja.com.br", projectId: PROJETO }));
  assert.deepEqual(await addProjectDomain(HOST), { name: HOST, verified: false, verification: [desafio] });
  assert.equal(chamadas[0].method, "POST");
  assert.equal(chamadas[0].url.pathname, `/v10/projects/${PROJETO}/domains`);
  assert.deepEqual(chamadas[0].body, { name: HOST });
});

test("409 da Vercel vira VercelApiError com status e código", async () => {
  respostas.push(json(409, { error: { code: "domain_already_in_use", message: "in use" } }));
  await assert.rejects(
    addProjectDomain(HOST),
    (e: unknown) => e instanceof VercelApiError && e.status === 409 && e.code === "domain_already_in_use",
  );
});

test("verify com desafio pendente (400) devolve o estado lido de novo", async () => {
  respostas.push(json(400, { error: { code: "missing_txt_record", message: "x" } }));
  respostas.push(json(200, { name: HOST, verified: false, verification: [{ type: "TXT", domain: "_vercel.loja.com.br", value: "v", reason: "r" }] }));
  const d = await verifyProjectDomain(HOST);
  assert.equal(d.verified, false);
  assert.equal(d.verification.length, 1);
  assert.equal(chamadas[0].method, "POST");
  assert.equal(chamadas[0].url.pathname, `/v9/projects/${PROJETO}/domains/${HOST}/verify`);
});

test("verify bem-sucedido devolve verificado", async () => {
  respostas.push(json(200, { name: HOST, verified: true }));
  assert.deepEqual(await verifyProjectDomain(HOST), { name: HOST, verified: true, verification: [] });
});

test("configuração: misconfigured da Vercel, com o projeto e o time na query", async () => {
  respostas.push(json(200, { misconfigured: true, configuredBy: null }));
  respostas.push(json(200, { misconfigured: false, configuredBy: "CNAME" }));
  assert.equal(await isDomainMisconfigured(HOST), true);
  assert.equal(await isDomainMisconfigured(HOST), false);
  assert.equal(chamadas[0].url.pathname, `/v6/domains/${HOST}/config`);
  assert.equal(chamadas[0].url.searchParams.get("projectIdOrName"), PROJETO);
  assert.equal(chamadas[0].url.searchParams.get("teamId"), TIME);
});

test("remover domínio que já não está no projeto é sucesso", async () => {
  respostas.push(json(404, { error: { code: "not_found", message: "x" } }));
  await removeProjectDomain(HOST);
  assert.equal(chamadas[0].method, "DELETE");
  assert.equal(chamadas[0].url.pathname, `/v9/projects/${PROJETO}/domains/${HOST}`);
});

test("falha inesperada ao remover sobe como erro", async () => {
  respostas.push(json(500, { error: { code: "internal", message: "boom" } }));
  await assert.rejects(removeProjectDomain(HOST), (e: unknown) => e instanceof VercelApiError && e.status === 500);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/vercel.test.ts`
Expected: FAIL — `Cannot find module './vercel'`.

- [ ] **Step 3: Write minimal implementation** — `apps/web/src/lib/custom-domains/vercel.ts`

```ts
import "server-only";

/**
 * API de Domínios da Vercel, só o que o domínio próprio usa.
 * Docs: vercel.com/docs/rest-api — projects/add-a-domain-to-a-project,
 * projects/verify-project-domain, domains/get-a-domain-s-configuration.
 */

const API = "https://api.vercel.com";
// Projeto `girumo` e o time dono dele (`.vercel/project.json`). Não são segredo e não mudam.
const PROJECT_ID = "prj_OqpJ680p1Q5LWE2cGjiOg1cnuJPq";
const TEAM_ID = "team_2H4HYmKVySM4jMf2MCOAdm3E";
const TIMEOUT_MS = 10_000;

export type VercelChallenge = { type: string; domain: string; value: string; reason: string };
export type ProjectDomain = { name: string; verified: boolean; verification: VercelChallenge[] };

export class VercelApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
}

function token(): string | null {
  return process.env.VERCEL_API_TOKEN?.trim() || null;
}

/** Sem token o domínio próprio fica desligado — o painel nem mostra o cartão. */
export function vercelConfigured(): boolean {
  return token() !== null;
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const bearer = token();
  if (!bearer) throw new VercelApiError(0, "not_configured", "VERCEL_API_TOKEN ausente.");
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM_ID}`;
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

async function fail(res: Response): Promise<never> {
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  throw new VercelApiError(res.status, data?.error?.code ?? "unknown", data?.error?.message ?? `HTTP ${res.status}`);
}

function toProjectDomain(data: { name: string; verified?: boolean; verification?: VercelChallenge[] }): ProjectDomain {
  return { name: data.name, verified: data.verified === true, verification: data.verification ?? [] };
}

function domainPath(name: string): string {
  return `/v9/projects/${PROJECT_ID}/domains/${encodeURIComponent(name)}`;
}

export async function getProjectDomain(name: string): Promise<ProjectDomain | null> {
  const res = await call("GET", domainPath(name));
  if (res.status === 404) return null;
  if (!res.ok) return fail(res);
  return toProjectDomain(await res.json());
}

export async function addProjectDomain(name: string): Promise<ProjectDomain> {
  const res = await call("POST", `/v10/projects/${PROJECT_ID}/domains`, { name });
  if (!res.ok) return fail(res);
  return toProjectDomain(await res.json());
}

export async function verifyProjectDomain(name: string): Promise<ProjectDomain> {
  const res = await call("POST", `${domainPath(name)}/verify`);
  if (res.ok) return toProjectDomain(await res.json());
  // 400 = desafio ainda não cumprido. Os desafios só vêm no GET do domínio.
  if (res.status === 400) {
    const atual = await getProjectDomain(name);
    if (atual) return atual;
  }
  return fail(res);
}

/** `true` enquanto o DNS não aponta para a Vercel (ou ela ainda não consegue emitir o certificado). */
export async function isDomainMisconfigured(name: string): Promise<boolean> {
  const res = await call("GET", `/v6/domains/${encodeURIComponent(name)}/config?projectIdOrName=${PROJECT_ID}`);
  if (!res.ok) return fail(res);
  const data = (await res.json()) as { misconfigured?: boolean };
  return data.misconfigured !== false;
}

export async function removeProjectDomain(name: string): Promise<void> {
  const res = await call("DELETE", domainPath(name));
  if (res.ok || res.status === 404) return;
  return fail(res);
}
```

- [ ] **Step 4: Run test to verify it passes** — mesmo comando. Expected: PASS (9 testes).

- [ ] **Step 5: Report files** — `vercel.ts`, `vercel.test.ts`. (Commit: `feat: add Vercel domains API client`.)

---

### Task 4: Tabela `custom_domains` e store

**Files:**
- Create: `apps/web/supabase/migrations/20261005120000_custom_domains.sql`
- Modify: `deploy/supabase/apply-order.txt` (append no fim)
- Modify: `infra/tests/tenant-tables-escrita-check.sql` (lista `t(name)`)
- Create: `apps/web/src/lib/stores/custom-domains.ts`
- Test: `apps/web/src/lib/stores/custom-domains.test.ts`

**Interfaces:**
- Produces: `type CustomDomainStatus = "pending" | "active"`, `type CustomDomain = { tenantId; hostname; verificationToken; status; lastError: string | null; checkedAt: string | null; verifiedAt: string | null }`, `getCustomDomain(tenantId): Promise<CustomDomain | null>`, `getActiveDomainTenant(hostname): Promise<string | null>`, `claimCustomDomain(tenantId, hostname, verificationToken): Promise<{ ok: true; domain: CustomDomain } | { ok: false; reason: "exists" }>`, `saveVerification(tenantId, { status, lastError }): Promise<{ ok: true; domain: CustomDomain } | { ok: false; reason: "taken" | "gone" }>`, `deleteCustomDomain(tenantId): Promise<void>`.

- [ ] **Step 1: Write the migration** — `apps/web/supabase/migrations/20261005120000_custom_domains.sql`

```sql
-- Domínio próprio do lojista para os links de grupo
-- (docs/superpowers/specs/2026-10-04-dominio-proprio-design.md).
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json
-- (entrada nova t|custom_domains).

create table if not exists public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  hostname text not null,
  verification_token text not null,
  status text not null default 'pending' check (status in ('pending', 'active')),
  last_error text,
  checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  -- Um domínio por conta. Trocar = remover e cadastrar de novo.
  constraint custom_domains_tenant_unique unique (tenant_id),
  constraint custom_domains_hostname_minusculo check (hostname = lower(hostname))
);

comment on table public.custom_domains is
  'Subdomínio do lojista que serve /r, /c e /p dele. Ativo só depois da prova de posse por TXT (_girumo-verify) e da Vercel aceitar o host.';

-- Único SÓ entre ativos: com unique global, quem cadastrasse primeiro o
-- subdomínio de outra loja (sem conseguir provar posse) travaria o dono de
-- verdade. Pendentes coexistem; só quem tem o TXT chega a ativo. É também o
-- índice da consulta "de quem é este host" que roda a cada clique.
create unique index if not exists custom_domains_hostname_ativo
  on public.custom_domains (hostname) where status = 'active';

-- RLS como segunda linha: quem grava e lê é o servidor, com o tenant explícito.
alter table public.custom_domains enable row level security;
drop policy if exists "custom_domains_tenant_read" on public.custom_domains;
create policy "custom_domains_tenant_read" on public.custom_domains
  for select using (app.has_membership(tenant_id));

-- Só o servidor escreve: ativar um domínio decide qual tenant um host serve.
-- O event trigger de 20261004120000 já revoga isto em tabela nova; fica
-- explícito para não depender dele estar aplicado no banco.
revoke insert, update, delete, truncate on public.custom_domains from authenticated;
```

- [ ] **Step 2: Register the migration** — append ao fim de `deploy/supabase/apply-order.txt`:

```
# 2026-10-05 - Dominio proprio do lojista (custom_domains): tabela nova, muda a baseline
# (t|custom_domains). Escrita so do servidor — conferir com
# infra/tests/tenant-tables-escrita-check.sql nos dois bancos.
apps/web/supabase/migrations/20261005120000_custom_domains.sql
```

E em `infra/tests/tenant-tables-escrita-check.sql`, na lista `with t(name) as (values …)`, trocar a primeira linha

```sql
  ('agent_configs'), ('broadcasts'), ('campaign_groups'), ('campaign_messages'), ('campaigns'),
```

por

```sql
  ('agent_configs'), ('broadcasts'), ('campaign_groups'), ('campaign_messages'), ('campaigns'),
  ('custom_domains'),
```

- [ ] **Step 3: Write the failing store test** — `apps/web/src/lib/stores/custom-domains.test.ts`

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { claimCustomDomain, getActiveDomainTenant, getCustomDomain, saveVerification } from "./custom-domains";

// PostgREST falso: o supabase-js real roda e só a rede é trocada.
type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: [] };

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (pedaco) => {
    bruto += pedaco;
  });
  req.on("end", () => {
    pedidos.push({
      metodo: req.method ?? "GET",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    });
    res.statusCode = resposta.status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(resposta.corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  pedidos.length = 0;
});

const LINHA = {
  tenant_id: "loja-a",
  hostname: "links.loja.com.br",
  verification_token: "tok",
  status: "pending",
  last_error: null,
  checked_at: null,
  verified_at: null,
};

function filtros(url: URL): Record<string, string> {
  return Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));
}

test("lê o domínio da conta filtrando pelo tenant", async () => {
  resposta = { status: 200, corpo: [LINHA] };
  const d = await getCustomDomain("loja-a");
  assert.equal(d?.hostname, "links.loja.com.br");
  assert.equal(d?.verificationToken, "tok");
  assert.equal(pedidos[0].url.pathname, "/rest/v1/custom_domains");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a" });
});

test("dono do host: só linha ativa, filtrando pelo host", async () => {
  resposta = { status: 200, corpo: [{ tenant_id: "loja-a" }] };
  assert.equal(await getActiveDomainTenant("links.loja.com.br"), "loja-a");
  assert.deepEqual(filtros(pedidos[0].url), { hostname: "eq.links.loja.com.br", status: "eq.active" });
});

test("host desconhecido ou pendente: null", async () => {
  resposta = { status: 200, corpo: [] };
  assert.equal(await getActiveDomainTenant("x.loja.com.br"), null);
});

test("cadastro grava pendente com o token", async () => {
  resposta = { status: 201, corpo: LINHA };
  assert.deepEqual(await claimCustomDomain("loja-a", "links.loja.com.br", "tok"), {
    ok: true,
    domain: {
      tenantId: "loja-a",
      hostname: "links.loja.com.br",
      verificationToken: "tok",
      status: "pending",
      lastError: null,
      checkedAt: null,
      verifiedAt: null,
    },
  });
  assert.equal(pedidos[0].metodo, "POST");
  assert.deepEqual(pedidos[0].corpo, {
    tenant_id: "loja-a",
    hostname: "links.loja.com.br",
    verification_token: "tok",
    status: "pending",
  });
});

test("segundo domínio na mesma conta: exists", async () => {
  resposta = {
    status: 409,
    corpo: { code: "23505", message: 'duplicate key value violates unique constraint "custom_domains_tenant_unique"', details: null, hint: null },
  };
  assert.deepEqual(await claimCustomDomain("loja-a", "outro.loja.com.br", "tok"), { ok: false, reason: "exists" });
});

test("ativar host já ativo em outra conta: taken, com filtro de tenant no update", async () => {
  resposta = {
    status: 409,
    corpo: { code: "23505", message: 'duplicate key value violates unique constraint "custom_domains_hostname_ativo"', details: null, hint: null },
  };
  assert.deepEqual(await saveVerification("loja-a", { status: "active", lastError: null }), { ok: false, reason: "taken" });
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a" });
});

test("verificação pendente grava o problema e não marca verified_at", async () => {
  resposta = { status: 200, corpo: [{ ...LINHA, last_error: "txt", checked_at: "2026-10-04T12:00:00.000Z" }] };
  const r = await saveVerification("loja-a", { status: "pending", lastError: "txt" });
  assert.equal(r.ok, true);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.status, "pending");
  assert.equal(corpo.last_error, "txt");
  assert.equal(corpo.verified_at, null);
  assert.equal(typeof corpo.checked_at, "string");
});

test("ativação marca verified_at", async () => {
  resposta = { status: 200, corpo: [{ ...LINHA, status: "active", verified_at: "2026-10-04T12:00:00.000Z" }] };
  const r = await saveVerification("loja-a", { status: "active", lastError: null });
  assert.equal(r.ok && r.domain.status, "active");
  assert.equal(typeof (pedidos[0].corpo as Record<string, unknown>).verified_at, "string");
});

test("domínio apagado no meio da verificação: gone", async () => {
  resposta = { status: 200, corpo: [] };
  assert.deepEqual(await saveVerification("loja-a", { status: "pending", lastError: "txt" }), { ok: false, reason: "gone" });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/custom-domains.test.ts`
Expected: FAIL — `Cannot find module './custom-domains'`.

- [ ] **Step 5: Write the store** — `apps/web/src/lib/stores/custom-domains.ts`

```ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "custom_domains";
const COLS = "tenant_id, hostname, verification_token, status, last_error, checked_at, verified_at";
const UNIQUE_VIOLATION = "23505";

export type CustomDomainStatus = "pending" | "active";

export type CustomDomain = {
  tenantId: string;
  hostname: string;
  verificationToken: string;
  status: CustomDomainStatus;
  lastError: string | null;
  checkedAt: string | null;
  verifiedAt: string | null;
};

type Row = {
  tenant_id: string;
  hostname: string;
  verification_token: string;
  status: CustomDomainStatus;
  last_error: string | null;
  checked_at: string | null;
  verified_at: string | null;
};

function toDomain(r: Row): CustomDomain {
  return {
    tenantId: r.tenant_id,
    hostname: r.hostname,
    verificationToken: r.verification_token,
    status: r.status,
    lastError: r.last_error,
    checkedAt: r.checked_at,
    verifiedAt: r.verified_at,
  };
}

export async function getCustomDomain(tenantId: string): Promise<CustomDomain | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(COLS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDomain(data as Row) : null;
}

/**
 * Dono de um host ATIVO — `null` para host desconhecido ou ainda pendente.
 *
 * Única consulta desta tabela SEM `.eq("tenant_id")`, e de propósito: é ela que
 * descobre o tenant a partir do host. Devolve só o id, e só de linha ativa — o
 * índice único parcial `custom_domains_hostname_ativo` garante no máximo uma.
 */
export async function getActiveDomainTenant(hostname: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("tenant_id")
    .eq("hostname", hostname)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { tenant_id: string } | null)?.tenant_id ?? null;
}

export type ClaimResult = { ok: true; domain: CustomDomain } | { ok: false; reason: "exists" };

/** Cadastra pendente. Um domínio por conta: o segundo cai no unique de `tenant_id`. */
export async function claimCustomDomain(
  tenantId: string,
  hostname: string,
  verificationToken: string,
): Promise<ClaimResult> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({ tenant_id: tenantId, hostname, verification_token: verificationToken, status: "pending" })
    .select(COLS)
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "exists" };
    throw new Error(error.message);
  }
  return { ok: true, domain: toDomain(data as Row) };
}

export type SaveResult = { ok: true; domain: CustomDomain } | { ok: false; reason: "taken" | "gone" };

/**
 * Grava o resultado de uma verificação. `taken` = outro tenant já ativou este
 * host (o índice parcial recusou); `gone` = a linha sumiu no meio do caminho.
 */
export async function saveVerification(
  tenantId: string,
  patch: { status: CustomDomainStatus; lastError: string | null },
): Promise<SaveResult> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: patch.status,
      last_error: patch.lastError,
      checked_at: now,
      verified_at: patch.status === "active" ? now : null,
    })
    .eq("tenant_id", tenantId)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "taken" };
    throw new Error(error.message);
  }
  return data ? { ok: true, domain: toDomain(data as Row) } : { ok: false, reason: "gone" };
}

export async function deleteCustomDomain(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 6: Run test to verify it passes** — mesmo comando. Expected: PASS (9 testes).

- [ ] **Step 7: Report files** — migração, `apply-order.txt`, `tenant-tables-escrita-check.sql`, store e teste. (Commit: `feat: add custom_domains table and store`.)

---

### Task 5: Orquestração da verificação (`verify.ts`)

**Files:**
- Create: `apps/web/src/lib/custom-domains/verify.ts`
- Test: `apps/web/src/lib/custom-domains/verify.test.ts`

**Interfaces:**
- Consumes: `dnsRecordsFor`, `DnsRecord` (Task 2); `VercelApiError`, `ProjectDomain`, `getProjectDomain`, `addProjectDomain`, `verifyProjectDomain`, `isDomainMisconfigured` (Task 3).
- Produces: `type VerifyProblem = "txt" | "em-uso" | "vercel-verificacao" | "dns" | "vercel-erro"`, `type VerifyOutcome = { active: true } | { active: false; problem: VerifyProblem; challenges: DnsRecord[] }`, `type VerifyDeps`, `verifyCustomDomain(hostname: string, token: string, deps?: VerifyDeps): Promise<VerifyOutcome>`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/custom-domains/verify.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyCustomDomain, type VerifyDeps } from "./verify";
import { VercelApiError, type ProjectDomain } from "./vercel";

const HOST = "links.sualoja.com.br";
const TOKEN = "tok123";
const VERIFICADO: ProjectDomain = { name: HOST, verified: true, verification: [] };

/** Dependências que levam até "ativo"; cada teste troca só o que quer quebrar. */
function deps(over: Partial<VerifyDeps> = {}): { log: string[]; deps: VerifyDeps } {
  const log: string[] = [];
  const base: VerifyDeps = {
    txtRecords: async (name) => {
      log.push(`txt:${name}`);
      return ["outra-coisa", `girumo-verify=${TOKEN}`];
    },
    getProjectDomain: async () => {
      log.push("get");
      return VERIFICADO;
    },
    addProjectDomain: async () => {
      log.push("add");
      return VERIFICADO;
    },
    verifyProjectDomain: async () => {
      log.push("verify");
      return VERIFICADO;
    },
    isDomainMisconfigured: async () => {
      log.push("config");
      return false;
    },
  };
  return { log, deps: { ...base, ...over } };
}

test("sem o TXT de posse não fala com a Vercel", async () => {
  const { log, deps: d } = deps({ txtRecords: async () => ["girumo-verify=de-outra-conta"] });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: false, problem: "txt", challenges: [] });
  assert.deepEqual(log, []);
});

test("procura o TXT no nome _girumo-verify do host", async () => {
  const { log, deps: d } = deps();
  await verifyCustomDomain(HOST, TOKEN, d);
  assert.equal(log[0], `txt:_girumo-verify.${HOST}`);
});

test("domínio fora do projeto é adicionado; tudo certo vira ativo", async () => {
  const { log, deps: d } = deps({
    getProjectDomain: async () => null,
  });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: true });
  assert.ok(log.includes("add"));
  assert.ok(log.includes("config"));
  assert.ok(!log.includes("verify"), "já veio verificado, não precisa do verify");
});

test("desafio da Vercel volta como registro para o lojista", async () => {
  const pendente: ProjectDomain = {
    name: HOST,
    verified: false,
    verification: [{ type: "TXT", domain: "_vercel.sualoja.com.br", value: "vc-domain-verify=x", reason: "r" }],
  };
  const { deps: d } = deps({
    getProjectDomain: async () => pendente,
    verifyProjectDomain: async () => pendente,
  });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), {
    active: false,
    problem: "vercel-verificacao",
    challenges: [{ tipo: "TXT", nome: "_vercel.sualoja.com.br", valor: "vc-domain-verify=x" }],
  });
});

test("CNAME ainda não chegou: pendente por dns", async () => {
  const { deps: d } = deps({ isDomainMisconfigured: async () => true });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: false, problem: "dns", challenges: [] });
});

test("host preso a outro projeto Vercel (409): em-uso", async () => {
  const { deps: d } = deps({
    getProjectDomain: async () => null,
    addProjectDomain: async () => {
      throw new VercelApiError(409, "domain_already_in_use", "in use");
    },
  });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: false, problem: "em-uso", challenges: [] });
});

test("falha inesperada da Vercel: vercel-erro", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps: d } = deps({
    getProjectDomain: async () => {
      throw new Error("rede caiu");
    },
  });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: false, problem: "vercel-erro", challenges: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/verify.test.ts`
Expected: FAIL — `Cannot find module './verify'`.

- [ ] **Step 3: Write minimal implementation** — `apps/web/src/lib/custom-domains/verify.ts`

```ts
import "server-only";
import { resolveTxt } from "node:dns/promises";
import { dnsRecordsFor, type DnsRecord } from "./hostname";
import {
  VercelApiError,
  addProjectDomain,
  getProjectDomain,
  isDomainMisconfigured,
  verifyProjectDomain,
} from "./vercel";

export type VerifyProblem = "txt" | "em-uso" | "vercel-verificacao" | "dns" | "vercel-erro";

export type VerifyOutcome =
  | { active: true }
  | { active: false; problem: VerifyProblem; challenges: DnsRecord[] };

export type VerifyDeps = {
  txtRecords: (name: string) => Promise<string[]>;
  getProjectDomain: typeof getProjectDomain;
  addProjectDomain: typeof addProjectDomain;
  verifyProjectDomain: typeof verifyProjectDomain;
  isDomainMisconfigured: typeof isDomainMisconfigured;
};

async function txtRecords(name: string): Promise<string[]> {
  try {
    // Um TXT longo chega em pedaços de até 255 bytes; o valor é a junção.
    return (await resolveTxt(name)).map((pedacos) => pedacos.join(""));
  } catch {
    // ENOTFOUND/ENODATA (ainda não criado) e timeout de DNS dão no mesmo para
    // o lojista: "ainda não achamos o registro".
    return [];
  }
}

const defaultDeps: VerifyDeps = {
  txtRecords,
  getProjectDomain,
  addProjectDomain,
  verifyProjectDomain,
  isDomainMisconfigured,
};

function pending(problem: VerifyProblem, challenges: DnsRecord[] = []): VerifyOutcome {
  return { active: false, problem, challenges };
}

/**
 * Leva um domínio pendente até ativo, parando no primeiro problema.
 *
 * A prova de posse vem ANTES de qualquer chamada à Vercel: sem ela, um tenant
 * que cadastrasse o subdomínio de outra loja (com o CNAME esquecido apontando
 * para a Vercel) assumiria o endereço — e o projeto viraria depósito de
 * domínio alheio.
 */
export async function verifyCustomDomain(
  hostname: string,
  token: string,
  deps: VerifyDeps = defaultDeps,
): Promise<VerifyOutcome> {
  const { txt } = dnsRecordsFor(hostname, token);
  if (!(await deps.txtRecords(txt.nome)).includes(txt.valor)) return pending("txt");

  try {
    let domain = (await deps.getProjectDomain(hostname)) ?? (await deps.addProjectDomain(hostname));
    if (!domain.verified) domain = await deps.verifyProjectDomain(hostname);
    if (!domain.verified) {
      // Raro: a raiz do domínio mora em outra conta Vercel e ela pede o desafio dela.
      return pending(
        "vercel-verificacao",
        domain.verification.map((c) => ({ tipo: "TXT" as const, nome: c.domain, valor: c.value })),
      );
    }
    if (await deps.isDomainMisconfigured(hostname)) return pending("dns");
    return { active: true };
  } catch (err) {
    // 409 = o host está preso a outro projeto Vercel (o site da loja, por exemplo).
    if (err instanceof VercelApiError && err.status === 409) return pending("em-uso");
    console.error(`[custom-domains] verificação de ${hostname}:`, err);
    return pending("vercel-erro");
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — mesmo comando. Expected: PASS (7 testes).

- [ ] **Step 5: Report files** — `verify.ts`, `verify.test.ts`. (Commit: `feat: orchestrate custom domain ownership and Vercel verification`.)

---

### Task 6: `hostServesTenant`

**Files:**
- Create: `apps/web/src/lib/custom-domains/serves-tenant.ts`
- Test: `apps/web/src/lib/custom-domains/serves-tenant.test.ts`

**Interfaces:**
- Consumes: `isFirstPartyHost` (Task 1), `getActiveDomainTenant` (Task 4).
- Produces: `hostServesTenant(hostname: string, tenantId: string, lookup?: (hostname: string) => Promise<string | null>): Promise<boolean>`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/custom-domains/serves-tenant.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { hostServesTenant } from "./serves-tenant";

test("host do Girumo serve qualquer tenant sem consultar o banco", async () => {
  let consultas = 0;
  const lookup = async () => {
    consultas++;
    return null;
  };
  assert.equal(await hostServesTenant("app.girumo.com.br", "loja-a", lookup), true);
  assert.equal(await hostServesTenant("localhost", "loja-b", lookup), true);
  assert.equal(consultas, 0);
});

test("domínio de lojista serve só o próprio tenant", async () => {
  const lookup = async (h: string) => (h === "links.loja-a.com.br" ? "loja-a" : null);
  assert.equal(await hostServesTenant("Links.Loja-A.com.br", "loja-a", lookup), true);
  assert.equal(await hostServesTenant("links.loja-a.com.br", "loja-b", lookup), false);
  assert.equal(await hostServesTenant("desconhecido.loja.com.br", "loja-a", lookup), false);
});

test("erro na consulta nega", async (t) => {
  t.mock.method(console, "error", () => {});
  const lookup = async (): Promise<string | null> => {
    throw new Error("banco fora");
  };
  assert.equal(await hostServesTenant("links.loja-a.com.br", "loja-a", lookup), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/serves-tenant.test.ts`
Expected: FAIL — `Cannot find module './serves-tenant'`.

- [ ] **Step 3: Write minimal implementation** — `apps/web/src/lib/custom-domains/serves-tenant.ts`

```ts
import "server-only";
import { getActiveDomainTenant } from "@/lib/stores/custom-domains";
import { isFirstPartyHost } from "./host";

/**
 * Este host pode mostrar conteúdo deste tenant?
 *
 * Host do Girumo: sempre (o comportamento de antes). Domínio de lojista: só o
 * do próprio lojista, e só ativo — sem isto `links.lojaA.com.br/r/<slug-de-B>`
 * abriria o grupo de B no endereço de A. Erro de banco nega: link que não abre
 * é recuperável; grupo de outra loja no endereço errado não é.
 */
export async function hostServesTenant(
  hostname: string,
  tenantId: string,
  lookup: (hostname: string) => Promise<string | null> = getActiveDomainTenant,
): Promise<boolean> {
  if (isFirstPartyHost(hostname)) return true;
  try {
    return (await lookup(hostname.trim().toLowerCase())) === tenantId;
  } catch (err) {
    console.error(`[custom-domains] dono de ${hostname}:`, err);
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — mesmo comando. Expected: PASS (3 testes).

- [ ] **Step 5: Report files** — `serves-tenant.ts`, `serves-tenant.test.ts`. (Commit: `feat: restrict custom domains to their own tenant`.)

---

### Task 7: Visão do domínio para o painel (`view.ts`)

**Files:**
- Create: `apps/web/src/lib/custom-domains/view.ts`
- Test: `apps/web/src/lib/custom-domains/view.test.ts`

**Interfaces:**
- Consumes: `dnsRecordsFor`, `DnsRecord` (Task 2); `type CustomDomain` (Task 4); `type VerifyProblem` (Task 5) — **imports só de tipo** desses dois, porque este arquivo é importado por componentes client.
- Produces: `type DominioView = { hostname: string; status: "pending" | "active"; problema: string | null; verificadoEm: string | null; registros: DnsRecord[] }`, `toDominioView(domain: CustomDomain): DominioView`, `textoDoProblema(problema: string | null): string | null`, `customLinkOrigin(body: unknown): string | null`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/custom-domains/view.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { customLinkOrigin, textoDoProblema, toDominioView } from "./view";

test("visão do domínio traz o estado e os dois registros, sem campos internos", () => {
  const view = toDominioView({
    tenantId: "loja-a",
    hostname: "links.loja.com.br",
    verificationToken: "tok",
    status: "pending",
    lastError: "txt",
    checkedAt: "2026-10-04T12:00:00.000Z",
    verifiedAt: null,
  });
  assert.deepEqual(view, {
    hostname: "links.loja.com.br",
    status: "pending",
    problema: "txt",
    verificadoEm: null,
    registros: [
      { tipo: "CNAME", nome: "links.loja.com.br", valor: "cname.vercel-dns.com" },
      { tipo: "TXT", nome: "_girumo-verify.links.loja.com.br", valor: "girumo-verify=tok" },
    ],
  });
  assert.equal("tenantId" in view, false);
});

test("problema vira frase para o lojista; código desconhecido não", () => {
  assert.match(textoDoProblema("txt") ?? "", /TXT/);
  assert.match(textoDoProblema("dns") ?? "", /CNAME/);
  assert.equal(textoDoProblema(null), null);
  assert.equal(textoDoProblema("toString"), null);
  assert.equal(textoDoProblema("qualquer"), null);
});

test("origem dos links só com domínio ativo", () => {
  assert.equal(customLinkOrigin({ dominio: { hostname: "links.loja.com.br", status: "active" } }), "https://links.loja.com.br");
  assert.equal(customLinkOrigin({ dominio: { hostname: "links.loja.com.br", status: "pending" } }), null);
  assert.equal(customLinkOrigin({ habilitado: false, dominio: null }), null);
  assert.equal(customLinkOrigin(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/view.test.ts`
Expected: FAIL — `Cannot find module './view'`.

- [ ] **Step 3: Write minimal implementation** — `apps/web/src/lib/custom-domains/view.ts`

```ts
/**
 * O que o painel recebe e mostra sobre o domínio próprio. Sem `server-only`:
 * o cartão de Configurações e o hook dos links importam daqui — por isso os
 * imports do store e da verificação são SÓ de tipo.
 */
import type { CustomDomain } from "@/lib/stores/custom-domains";
import { dnsRecordsFor, type DnsRecord } from "./hostname";
import type { VerifyProblem } from "./verify";

export type DominioView = {
  hostname: string;
  status: "pending" | "active";
  problema: string | null;
  verificadoEm: string | null;
  registros: DnsRecord[];
};

export function toDominioView(domain: CustomDomain): DominioView {
  const { cname, txt } = dnsRecordsFor(domain.hostname, domain.verificationToken);
  return {
    hostname: domain.hostname,
    status: domain.status,
    problema: domain.lastError,
    verificadoEm: domain.verifiedAt,
    registros: [cname, txt],
  };
}

const PROBLEMAS: Record<VerifyProblem, string> = {
  txt: "Ainda não encontramos o registro TXT. Depois de criar, ele pode levar até 1 hora para aparecer.",
  dns: "O registro CNAME ainda não aponta para o Girumo. Confira o valor e, se usa Cloudflare, deixe a nuvem cinza (somente DNS).",
  "em-uso": "Este endereço está ligado a outro site ou conta. Use outro subdomínio ou fale com o suporte.",
  "vercel-verificacao": "O provedor pediu uma confirmação extra. Crie o registro abaixo e verifique de novo.",
  "vercel-erro": "Não conseguimos verificar agora. Tente de novo em alguns minutos.",
};

/** Frase para o lojista; `null` sem problema ou com código que não conhecemos. */
export function textoDoProblema(problema: string | null): string | null {
  // hasOwnProperty, não `in`: "toString" está em todo objeto.
  if (!problema || !Object.prototype.hasOwnProperty.call(PROBLEMAS, problema)) return null;
  return PROBLEMAS[problema as VerifyProblem];
}

/** `https://<host>` quando a resposta de `/api/dominio` traz domínio ATIVO; senão `null`. */
export function customLinkOrigin(body: unknown): string | null {
  const dominio = (body as { dominio?: Partial<DominioView> | null } | null)?.dominio;
  return dominio?.status === "active" && typeof dominio.hostname === "string" ? `https://${dominio.hostname}` : null;
}
```

- [ ] **Step 4: Run test to verify it passes** — mesmo comando. Expected: PASS (3 testes).

- [ ] **Step 5: Report files** — `view.ts`, `view.test.ts`. (Commit: `feat: shape custom domain view for the panel`.)

---

### Task 8: Middleware — host de lojista

**Files:**
- Modify: `apps/web/src/middleware.ts` (topo de `middleware()` e `config.matcher`)
- Modify: `apps/web/src/lib/custom-domains/host.test.ts` (teste de sincronia do matcher)

**Interfaces:**
- Consumes: `FIRST_PARTY_HOST_PATTERN`, `isFirstPartyHost`, `customHostRoute` (Task 1).

- [ ] **Step 1: Write the failing test** — acrescentar ao fim de `apps/web/src/lib/custom-domains/host.test.ts` (e os imports no topo):

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FIRST_PARTY_HOST_PATTERN } from "./host";

const MIDDLEWARE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "middleware.ts");

test("o matcher do middleware usa o mesmo padrão de host, no `missing`", () => {
  const fonte = readFileSync(MIDDLEWARE, "utf8");
  assert.ok(
    fonte.includes(`value: ${JSON.stringify(FIRST_PARTY_HOST_PATTERN)}`),
    "o literal do matcher saiu de sincronia com FIRST_PARTY_HOST_PATTERN",
  );
  assert.match(fonte, /missing:\s*\[\s*\{\s*type:\s*"host"/);
});
```

(Juntar `FIRST_PARTY_HOST_PATTERN` ao import existente de `./host` em vez de duplicar a linha.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/host.test.ts`
Expected: FAIL — `o literal do matcher saiu de sincronia com FIRST_PARTY_HOST_PATTERN`.

- [ ] **Step 3: Edit the middleware** — `apps/web/src/middleware.ts`

Import (junto aos outros `@/lib`):

```ts
import { customHostRoute, isFirstPartyHost } from "@/lib/custom-domains/host";
```

Antes de `export async function middleware`, acrescentar:

```ts
/** 404 seco no domínio do lojista: lá não existe painel, login nem API logada. */
function customHostNotFound(): NextResponse {
  return new NextResponse("Link não encontrado.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
```

No começo de `middleware()`, logo depois de `const { pathname } = req.nextUrl;`:

```ts
  // Domínio próprio do lojista: só links e páginas. A checagem de que o link é
  // do DONO do domínio fica no handler, que tem acesso ao banco — aqui só se
  // decide o que pode existir nesse endereço.
  if (!isFirstPartyHost(req.nextUrl.hostname)) {
    const route = customHostRoute(pathname);
    if (route === "not-found") return customHostNotFound();
    // /api/p/* em host do Girumo nem passa pelo middleware (fora do matcher).
    if (route === "public-api") return NextResponse.next();
    // "surface" (/r, /c, /p) segue o fluxo de sempre: CSP com nonce logo abaixo.
  }
```

No `config.matcher`, acrescentar a entrada depois de `"/c/:path*",` e estender o comentário do bloco:

```ts
    // Domínio próprio do lojista: o middleware roda em TODO path de host que
    // não é do Girumo — inclusive os que a primeira entrada exclui (/login,
    // /api/p/...) — para o ramo de host de lojista barrar o que não é link nem
    // página. O `value` é o FIRST_PARTY_HOST_PATTERN literal (o Next exige
    // config estática aqui); host.test.ts trava os dois iguais. Assets
    // (`_next/*`, arquivos com ponto) ficam de fora: as LPs precisam deles.
    {
      source: "/((?!_next/static|_next/image|.*\\.).*)",
      missing: [
        {
          type: "host",
          value: "(?:localhost|127\\.0\\.0\\.1|(?:[a-z0-9-]+\\.)*(?:girumo\\.com\\.br|hubflow\\.com\\.br|vercel\\.app|localhost))",
        },
      ],
    },
```

- [ ] **Step 4: Run test to verify it passes** — mesmo comando. Expected: PASS (5 testes).

- [ ] **Step 5: Typecheck** — em `apps/web`: `npx tsc --noEmit -p .` Expected: sem erros novos.

- [ ] **Step 6: Report files** — `middleware.ts`, `host.test.ts`. (Commit: `feat: serve only links and pages on custom domains`.)

---

### Task 9: Checagem de tenant em `/r`, `/c` e `/p`

**Files:**
- Modify: `apps/web/src/lib/links/short-link-click.ts` (início de `handleShortLinkClick`)
- Modify: `apps/web/src/app/p/[slug]/page.tsx` (`PublicLandingPage`)

**Interfaces:**
- Consumes: `isFirstPartyHost`, `hostnameFromHostHeader` (Task 1); `hostServesTenant` (Task 6).

- [ ] **Step 1: Edit `short-link-click.ts`**

Imports novos:

```ts
import { isFirstPartyHost } from "@/lib/custom-domains/host";
import { hostServesTenant } from "@/lib/custom-domains/serves-tenant";
```

Trocar

```ts
  if (!USE_SUPABASE) return legacyGet(req, slug, ua, human);

  const link = await linksStore.getTrackedLinkBySlug(slug);
  if (!link) return notFoundPage();
```

por

```ts
  const host = new URL(req.url).hostname;
  // Modo JSON (dev) não conhece domínio próprio: host de lojista não abre nada.
  if (!USE_SUPABASE) return isFirstPartyHost(host) ? legacyGet(req, slug, ua, human) : notFoundPage();

  const link = await linksStore.getTrackedLinkBySlug(slug);
  if (!link) return notFoundPage();
  // Domínio próprio: o host do lojista só abre link do próprio lojista. O slug
  // é global, então sem isto qualquer loja abriria o link de outra no endereço dela.
  if (!(await hostServesTenant(host, link.tenant_id))) return notFoundPage();
```

- [ ] **Step 2: Edit `apps/web/src/app/p/[slug]/page.tsx`**

Imports novos:

```ts
import { hostnameFromHostHeader } from "@/lib/custom-domains/host";
import { hostServesTenant } from "@/lib/custom-domains/serves-tenant";
```

Em `PublicLandingPage`, trocar

```ts
  const page = await getCachedPage(slug);
  if (!page) notFound();
```

por

```ts
  const page = await getCachedPage(slug);
  if (!page) notFound();

  // Domínio próprio: o host do lojista só mostra página do próprio lojista.
  const requestHeaders = await headers();
  if (!(await hostServesTenant(hostnameFromHostHeader(requestHeaders.get("host")), page.tenant_id))) notFound();
```

e, mais abaixo, trocar

```ts
  const nonce = (await headers()).get("x-nonce");
```

por

```ts
  const nonce = requestHeaders.get("x-nonce");
```

- [ ] **Step 3: Typecheck and run the links/pages tests** — em `apps/web`:
`npx tsc --noEmit -p .` (sem erros novos) e
`npx tsx --import ./src/test/server-only-shim.mjs --test "src/lib/links/*.test.ts" "src/lib/pages/*.test.ts"` (PASS, nada quebrado).

- [ ] **Step 4: Report files** — `short-link-click.ts`, `p/[slug]/page.tsx`. (Commit: `feat: open links and pages only on their owner's custom domain`.)

---

### Task 10: Rotas `/api/dominio` e env

**Files:**
- Create: `apps/web/src/app/api/dominio/route.ts`
- Create: `apps/web/src/app/api/dominio/verificar/route.ts`
- Modify: `deploy/vercel/.env.production.example`, `apps/web/.env.production.example`

**Interfaces:**
- Consumes: `getTenantContext` (`@/lib/supabase/tenant-context`), `assertPermission` (`@/lib/permissions`), `USE_SUPABASE` (`@/lib/stores/use-supabase`), `normalizeHostname` (T2), `vercelConfigured`, `removeProjectDomain` (T3), store (T4), `verifyCustomDomain` (T5), `toDominioView` (T7).
- Produces (contrato HTTP, usado no PR 2):
  - `GET /api/dominio` → `200 { habilitado: boolean, dominio: DominioView | null }`
  - `POST /api/dominio` body `{ hostname: string }` → `201 { dominio: DominioView }` | `400/409/503 { error }`
  - `DELETE /api/dominio` → `204`
  - `POST /api/dominio/verificar` → `200 { dominio: DominioView, desafios: DnsRecord[] }` | `404/503 { error }`

- [ ] **Step 1: Write `apps/web/src/app/api/dominio/route.ts`**

```ts
import { randomBytes } from "node:crypto";
import { normalizeHostname } from "@/lib/custom-domains/hostname";
import { removeProjectDomain, vercelConfigured } from "@/lib/custom-domains/vercel";
import { toDominioView } from "@/lib/custom-domains/view";
import { assertPermission } from "@/lib/permissions";
import { claimCustomDomain, deleteCustomDomain, getCustomDomain } from "@/lib/stores/custom-domains";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function indisponivel(): Response {
  return Response.json({ error: "Domínio próprio ainda não está disponível." }, { status: 503 });
}

function erroInterno(acao: string, error: unknown): Response {
  if (error instanceof Response) return error;
  console.error(`[api/dominio] ${acao}`, error);
  return Response.json({ error: "Erro ao processar o domínio." }, { status: 500 });
}

// GET /api/dominio — estado do domínio da conta. `habilitado: false` esconde o cartão.
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    if (!USE_SUPABASE || !vercelConfigured()) return Response.json({ habilitado: false, dominio: null });
    const domain = await getCustomDomain(ctx.tenantId);
    return Response.json({ habilitado: true, dominio: domain ? toDominioView(domain) : null });
  } catch (error) {
    return erroInterno("GET", error);
  }
}

// POST /api/dominio { hostname } — cadastra pendente, com token de posse novo.
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "settings:connection");
    if (!USE_SUPABASE || !vercelConfigured()) return indisponivel();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }
    const raw = (body as { hostname?: unknown } | null)?.hostname;
    const check = normalizeHostname(typeof raw === "string" ? raw : "");
    if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

    const claim = await claimCustomDomain(ctx.tenantId, check.hostname, randomBytes(16).toString("hex"));
    if (!claim.ok) {
      return Response.json({ error: "Sua conta já tem um domínio. Remova o atual para trocar." }, { status: 409 });
    }
    return Response.json({ dominio: toDominioView(claim.domain) }, { status: 201 });
  } catch (error) {
    return erroInterno("POST", error);
  }
}

// DELETE /api/dominio — tira do projeto Vercel e apaga a linha.
export async function DELETE(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "settings:connection");
    if (!USE_SUPABASE) return indisponivel();

    const domain = await getCustomDomain(ctx.tenantId);
    if (!domain) return new Response(null, { status: 204 });
    if (vercelConfigured()) {
      // Falha aqui não segura a remoção: host no projeto sem linha no banco
      // responde 404 em tudo, e um novo cadastro ainda precisa provar posse.
      await removeProjectDomain(domain.hostname).catch((err) =>
        console.error(`[api/dominio] remover ${domain.hostname} da Vercel`, err),
      );
    }
    await deleteCustomDomain(ctx.tenantId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return erroInterno("DELETE", error);
  }
}
```

- [ ] **Step 2: Write `apps/web/src/app/api/dominio/verificar/route.ts`**

```ts
import { vercelConfigured } from "@/lib/custom-domains/vercel";
import { verifyCustomDomain } from "@/lib/custom-domains/verify";
import { toDominioView } from "@/lib/custom-domains/view";
import { assertPermission } from "@/lib/permissions";
import { getCustomDomain, saveVerification } from "@/lib/stores/custom-domains";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAO_ENCONTRADO = "Nenhum domínio cadastrado.";

// POST /api/dominio/verificar — TXT de posse → Vercel → DNS. Só promove:
// domínio ativo não é reverificado (TXT apagado depois não derruba links no ar).
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "settings:connection");
    if (!USE_SUPABASE || !vercelConfigured()) {
      return Response.json({ error: "Domínio próprio ainda não está disponível." }, { status: 503 });
    }

    const domain = await getCustomDomain(ctx.tenantId);
    if (!domain) return Response.json({ error: NAO_ENCONTRADO }, { status: 404 });
    if (domain.status === "active") return Response.json({ dominio: toDominioView(domain), desafios: [] });

    const outcome = await verifyCustomDomain(domain.hostname, domain.verificationToken);
    let saved = await saveVerification(
      ctx.tenantId,
      outcome.active ? { status: "active", lastError: null } : { status: "pending", lastError: outcome.problem },
    );
    // Outra conta já ativou este host (posse provada lá também): fica pendente.
    if (!saved.ok && saved.reason === "taken") {
      saved = await saveVerification(ctx.tenantId, { status: "pending", lastError: "em-uso" });
    }
    if (!saved.ok) return Response.json({ error: NAO_ENCONTRADO }, { status: 404 });

    return Response.json({
      dominio: toDominioView(saved.domain),
      desafios: outcome.active ? [] : outcome.challenges,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/dominio/verificar]", error);
    return Response.json({ error: "Erro ao verificar o domínio." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Document the env** — em `deploy/vercel/.env.production.example` e `apps/web/.env.production.example`, acrescentar no fim:

```
# Dominio proprio do lojista (links de grupo no endereco dele). Token da Vercel com
# escopo no time do projeto `girumo` (Account Settings > Tokens). Server-side apenas,
# marcar como Sensitive. Sem ele o cartao "Dominio proprio" nao aparece no painel.
VERCEL_API_TOKEN=
```

- [ ] **Step 4: Typecheck, lint, full tests** — em `apps/web`: `npx tsc --noEmit -p .`, `npx eslint src/app/api/dominio src/lib/custom-domains src/lib/stores/custom-domains.ts src/middleware.ts`, `npm test`. Expected: tudo verde.

- [ ] **Step 5: Report files** — as duas rotas e os dois `.env.production.example`. (Commit: `feat: add custom domain API routes`.)

---

### Task 11 (PR 2): Origem dos links de campanha

**Files:**
- Create: `apps/web/src/lib/painel/use-link-origin.ts`
- Modify: `apps/web/src/app/painel/campanhas/page.tsx` (estado `origin`)
- Modify: `apps/web/src/app/painel/campanhas/[slug]/page.tsx` (estado `origin`, `masterUrl`)
- Modify: `apps/web/src/components/painel/campaign-config.tsx` (estado `origin`)

**Interfaces:**
- Consumes: `customLinkOrigin` (Task 7), `authenticatedFetch` (`@/lib/supabase/client`).
- Produces: `useLinkOrigin(): string`, `esquecerOrigemDoDominio(): void`.

- [ ] **Step 1: Write the hook** — `apps/web/src/lib/painel/use-link-origin.ts`

```ts
"use client";

import { useEffect, useState } from "react";
import { customLinkOrigin } from "@/lib/custom-domains/view";
import { authenticatedFetch } from "@/lib/supabase/client";

let pedido: Promise<string | null> | null = null;

function origemDoDominio(): Promise<string | null> {
  // Uma consulta por carga do painel: lista, detalhe e criação montam o hook.
  pedido ??= authenticatedFetch("/api/dominio")
    .then((res) => (res.ok ? res.json() : null))
    .then(customLinkOrigin)
    .catch(() => null);
  return pedido;
}

/** Esquece a origem lida — o cartão de domínio chama ao conectar, ativar ou remover. */
export function esquecerOrigemDoDominio(): void {
  pedido = null;
}

/**
 * Origem dos links públicos de campanha: `https://<domínio do lojista>` quando
 * ele está ativo, senão o host atual do painel.
 *
 * Começa VAZIA de propósito: `linkPublico` e companhia devolvem `null` para
 * origem vazia, então ninguém copia o link do host errado enquanto a consulta
 * não volta.
 */
export function useLinkOrigin(): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    let montado = true;
    void origemDoDominio().then((dominio) => {
      if (montado) setOrigin(dominio ?? window.location.origin);
    });
    return () => {
      montado = false;
    };
  }, []);
  return origin;
}
```

- [ ] **Step 2: `apps/web/src/app/painel/campanhas/page.tsx`** — importar `useLinkOrigin` de `@/lib/painel/use-link-origin`; trocar `const [origin, setOrigin] = useState("");` por `const origin = useLinkOrigin();`; apagar a linha `setOrigin(window.location.origin);` dentro de `carregar`.

- [ ] **Step 3: `apps/web/src/app/painel/campanhas/[slug]/page.tsx`** — importar `useLinkOrigin`; trocar `const [origin, setOrigin] = useState("");` por `const origin = useLinkOrigin();`; apagar `setOrigin(window.location.origin);` do `useEffect` de carga; trocar

```ts
  const masterUrl = campanha.slug ? `${origin}/r/${campanha.slug}` : "";
```

por

```ts
  // Sem origem ainda (consulta do domínio próprio voltando), sem link: um
  // "/r/slug" relativo copiado ou embutido no funil seria link quebrado.
  const masterUrl = origin && campanha.slug ? `${origin}/r/${campanha.slug}` : "";
```

- [ ] **Step 4: `apps/web/src/components/painel/campaign-config.tsx`** — importar `useLinkOrigin`; trocar `const [origin, setOrigin] = useState("");` por `const origin = useLinkOrigin();`; apagar `setOrigin(window.location.origin);` do `useEffect`.

- [ ] **Step 5: Typecheck and lint** — `npx tsc --noEmit -p .` e `npx eslint src/lib/painel/use-link-origin.ts "src/app/painel/campanhas" src/components/painel/campaign-config.tsx`. Expected: sem erros (sem import `useState` sobrando sem uso).

- [ ] **Step 6: Report files.** (Commit: `feat: build campaign links with the active custom domain`.)

---

### Task 12 (PR 2): Cartão "Domínio próprio" em Configurações

**Files:**
- Create: `apps/web/src/components/painel/configuracoes/dominio-proprio.tsx`
- Modify: `apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx` (aba Conexão)

**Interfaces:**
- Consumes: contrato HTTP da Task 10; `DominioView`, `textoDoProblema` (Task 7); `DnsRecord` (Task 2); `esquecerOrigemDoDominio` (Task 11); `useToast` (`@/components/toast`), `useRole` (`@/components/painel/role-provider`), `authenticatedFetch`, `cn` (`@/lib/utils`).

- [ ] **Step 1: Write the card** — `apps/web/src/components/painel/configuracoes/dominio-proprio.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { useRole } from "@/components/painel/role-provider";
import type { DnsRecord } from "@/lib/custom-domains/hostname";
import { textoDoProblema, type DominioView } from "@/lib/custom-domains/view";
import { esquecerOrigemDoDominio } from "@/lib/painel/use-link-origin";
import { authenticatedFetch } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Leitura = { habilitado: boolean; dominio: DominioView | null };
type Acao = "conectar" | "verificar" | "remover";

const INPUT =
  "min-h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-15 text-volt-950 outline-none transition-colors placeholder:text-slate-600 focus:border-cobalt-500";
const PRIMARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-4 text-15 font-semibold text-paper-0 transition-colors";
const SECUNDARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100";

async function erroDa(res: Response): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || "Não deu certo. Tente de novo.";
}

/** Valor de registro DNS com botão de copiar (o `CopyLink` prefixaria https://). */
function Copiavel({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard indisponível — o valor continua na tela para copiar à mão */
    }
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="font-data min-w-0 break-all text-13 text-volt-950">{valor}</span>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar ${rotulo}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-600 transition hover:bg-cobalt-500/10 hover:text-cobalt-500"
      >
        {copiado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </button>
    </span>
  );
}

function Registros({ registros }: { registros: DnsRecord[] }) {
  return (
    <table className="mt-4 w-full table-fixed border-collapse text-left">
      <thead>
        <tr className="text-12 text-slate-600">
          <th scope="col" className="w-20 pb-2 font-normal">Tipo</th>
          <th scope="col" className="pb-2 font-normal">Nome</th>
          <th scope="col" className="pb-2 font-normal">Valor</th>
        </tr>
      </thead>
      <tbody>
        {registros.map((r) => (
          <tr key={`${r.tipo}-${r.nome}`} className="border-t border-line-200 align-top">
            <td className="font-data py-3 text-13 text-volt-950">{r.tipo}</td>
            <td className="py-3 pr-3"><Copiavel valor={r.nome} rotulo={`nome do registro ${r.tipo}`} /></td>
            <td className="py-3"><Copiavel valor={r.valor} rotulo={`valor do registro ${r.tipo}`} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Cartão "Domínio próprio" da aba Conexão: o lojista liga um subdomínio dele
 * aos links de grupo. Some inteiro enquanto a integração com a Vercel não está
 * configurada no servidor (`habilitado: false`).
 */
export function DominioProprio() {
  const toast = useToast();
  const { can } = useRole();
  const podeEditar = can("settings:connection");
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [host, setHost] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [desafios, setDesafios] = useState<DnsRecord[]>([]);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    authenticatedFetch("/api/dominio")
      .then((res) => (res.ok ? (res.json() as Promise<Leitura>) : Promise.reject(new Error(String(res.status)))))
      .then(setLeitura)
      .catch(() => setFalhou(true));
  }, []);

  function trocar(dominio: DominioView | null) {
    setLeitura({ habilitado: true, dominio });
    // A origem dos links de campanha foi lida com o domínio anterior.
    esquecerOrigemDoDominio();
  }

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAcao("conectar");
    try {
      const res = await authenticatedFetch("/api/dominio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: host }),
      });
      if (!res.ok) return setErro(await erroDa(res));
      trocar(((await res.json()) as { dominio: DominioView }).dominio);
      setHost("");
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setAcao(null);
    }
  }

  async function verificar() {
    setAcao("verificar");
    try {
      const res = await authenticatedFetch("/api/dominio/verificar", { method: "POST" });
      if (!res.ok) return toast(await erroDa(res), "error");
      const corpo = (await res.json()) as { dominio: DominioView; desafios: DnsRecord[] };
      trocar(corpo.dominio);
      setDesafios(corpo.desafios);
      if (corpo.dominio.status === "active") toast("Domínio ativo. Os links já saem com o seu endereço.");
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setAcao(null);
    }
  }

  async function remover() {
    setAcao("remover");
    try {
      const res = await authenticatedFetch("/api/dominio", { method: "DELETE" });
      if (!res.ok) return toast(await erroDa(res), "error");
      trocar(null);
      setDesafios([]);
      setConfirmando(false);
      toast("Domínio removido. Os links voltam a sair com o endereço do Girumo.");
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setAcao(null);
    }
  }

  if (falhou) {
    return (
      <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8" data-testid="configuracoes-dominio">
        <h2 className="text-[18px] font-semibold text-volt-950">Domínio próprio</h2>
        <p className="mt-2 text-13 text-slate-600">Não conseguimos carregar o domínio agora.</p>
      </section>
    );
  }
  if (!leitura) {
    return (
      <div
        className="pn-skeleton h-32 rounded-[var(--radius-control)]"
        data-testid="painel-skeleton"
        role="status"
        aria-label="Carregando o domínio próprio"
      />
    );
  }
  if (!leitura.habilitado) return null;

  const { dominio } = leitura;
  const ativo = dominio?.status === "active";
  const problema = dominio && !ativo ? textoDoProblema(dominio.problema) : null;

  return (
    <section
      className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8"
      data-testid="configuracoes-dominio"
      aria-labelledby="dominio-proprio-titulo"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="dominio-proprio-titulo" className="text-[18px] font-semibold text-volt-950">
          Domínio próprio
        </h2>
        {dominio && (
          <span className={cn("pn-chip", ativo ? "text-success-700" : "text-slate-600")} data-testid="dominio-etiqueta">
            {ativo ? "Ativo" : "Aguardando DNS"}
          </span>
        )}
      </div>

      {!dominio && (
        <>
          <p className="mt-2 text-13 text-slate-600">
            Os links dos seus grupos saem no seu endereço: <span className="font-data">links.sualoja.com.br/r/vip</span>{" "}
            em vez do endereço do Girumo.
          </p>
          {podeEditar && (
            <form onSubmit={conectar} className="mt-5 flex flex-wrap items-start gap-3" noValidate>
              <div className="min-w-[240px] flex-1">
                <label htmlFor="dominio-proprio-host" className="mb-1.5 block text-13 font-semibold text-volt-950">
                  Subdomínio da loja
                </label>
                <input
                  id="dominio-proprio-host"
                  className={INPUT}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="links.sualoja.com.br"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? "dominio-proprio-erro" : undefined}
                />
                {erro && (
                  <p id="dominio-proprio-erro" className="mt-1 text-13 text-danger-700">
                    {erro}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={acao !== null || !host.trim()}
                className={cn(
                  PRIMARIO,
                  "mt-6",
                  acao !== null || !host.trim() ? "cursor-not-allowed bg-volt-950/30" : "bg-volt-950 hover:bg-volt-800",
                )}
              >
                {acao === "conectar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Conectar
              </button>
            </form>
          )}
        </>
      )}

      {dominio && (
        <>
          <p className="font-data mt-3 break-all text-[20px] text-volt-950">{dominio.hostname}</p>
          {ativo ? (
            <p className="mt-2 text-13 text-slate-600">
              Seus links de campanha já saem assim: <span className="font-data">https://{dominio.hostname}/r/…</span>
            </p>
          ) : (
            <>
              <p className="mt-2 text-13 text-slate-600">
                No painel do seu provedor de domínio, crie os dois registros abaixo. Alguns provedores pedem só a parte
                do nome antes do seu domínio (por exemplo, só <span className="font-data">links</span>).
              </p>
              <Registros registros={dominio.registros} />
              {desafios.length > 0 && <Registros registros={desafios} />}
              {problema && (
                <p role="status" className="pn-aviso mt-4 rounded-[var(--radius-control)] p-4 text-13 text-volt-950">
                  {problema}
                </p>
              )}
            </>
          )}

          {podeEditar && (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-200 pt-5">
              {!ativo && (
                <button
                  type="button"
                  onClick={verificar}
                  disabled={acao !== null}
                  className={cn(PRIMARIO, acao !== null ? "cursor-not-allowed bg-volt-950/30" : "bg-volt-950 hover:bg-volt-800")}
                >
                  {acao === "verificar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Verificar agora
                </button>
              )}
              {confirmando ? (
                <>
                  <button type="button" onClick={remover} disabled={acao !== null} className={cn(SECUNDARIO, "text-danger-700")}>
                    {acao === "remover" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Confirmar remoção
                  </button>
                  <button type="button" onClick={() => setConfirmando(false)} className={SECUNDARIO}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmando(true)} disabled={acao !== null} className={SECUNDARIO}>
                  Remover
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Mount on the Conexão tab** — em `configuracoes-vitrine.tsx`, importar `import { DominioProprio } from "@/components/painel/configuracoes/dominio-proprio";` e trocar

```tsx
          {porta === "Conexão" && <AbaConexao {...conexao} />}
```

por

```tsx
          {porta === "Conexão" && (
            <div className="space-y-6">
              <AbaConexao {...conexao} />
              <DominioProprio />
            </div>
          )}
```

- [ ] **Step 3: Typecheck, lint, build** — em `apps/web`: `npx tsc --noEmit -p .`, `npx eslint src/components/painel/configuracoes`, e `npm run build`. Expected: verdes.

- [ ] **Step 4: Report files.** (Commit: `feat: add custom domain card to settings`.)

---

## Fechamento (controlador)

1. Revisão final da branch inteira (Code Reviewer + Security Engineer) — pega o que revisão por tarefa não vê (middleware × CSP × handlers).
2. `infra/scripts/verify-local.ps1` no worktree (é o gate real do CI).
3. Push + PR 1; PR 2 só depois do merge do PR 1 (base sempre `main`).
4. Pendências do Igor, em ordem: DDL dev → prod; conferir `tenant-tables-escrita-check.sql` e advisor; regravar `schema-baseline.json` (`t|custom_domains`) e mergear esse commit primeiro; `VERCEL_API_TOKEN` na Vercel; card do quadro.
