# Funil de anúncios — PR 4: `cid` e grupo no clique do `/r/` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo clique humano no `/r/<slug>` (e `/<slug>` no domínio próprio, `/c/<slug>`) passa a gravar o cadastro que o trouxe (`?cid=`) e o grupo para onde o rotador mandou a pessoa.

**Architecture:** Uma função pura lê o `cid` da URL; uma função assíncrona o aceita só se for um cadastro da MESMA loja do link (consulta filtrada por tenant), engolindo erro como "sem cid". `recordTrackedLinkClick` ganha `{ captureId, whatsappGroupId }`. Em `short-link-click.ts` a validação roda dentro do `Promise.allSettled` que já existe: métrica nunca segura o visitante.

**Tech Stack:** Next 15 route handler, Supabase service-role, `node:test` com PostgREST falso.

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md` (§3 "/r/[slug]?cid=", §6 bordas)

**Depende de:** PR 1 (colunas `link_click_events.capture_id`/`whatsapp_group_id`) e PR 2 (`cadastroDaLoja` em `lib/stores/site-captures.ts`). Índice: `docs/superpowers/plans/2026-10-10-funil-anuncios-00-indice.md`.

## Global Constraints

- `cid` só é aceito se for uuid **e** existir em `site_captures` com o `tenant_id` do link. Qualquer outro caso (ausente, malformado, de outra loja, apagado, erro de banco) → clique gravado com `capture_id = null`. Nunca 4xx/5xx por causa do `cid`.
- Só clique humano grava (o filtro `BOT_UA` que já existe). O redirecionamento não espera a validação além do que já esperava (`Promise.allSettled`).
- `whatsapp_group_id` = `target.groupId ?? null` (o `whatsapp_group_id` que `resolveClickTarget` escolheu).
- O domínio próprio reescreve `/<slug>` para `/r/<slug>` com `req.nextUrl.clone()` (query preservada): nada a mudar no middleware.
- Testes: `node:test` + `node:assert/strict`; rodar em `apps/web` com `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`.

## Review Focus

- **`cid` em maiúsculas** (alguns encurtadores sobem a caixa): aceitar uuid sem diferenciar caixa e gravar em minúsculas. Coberto.
- **Vários `cid` na URL** (`?cid=a&cid=b`): vale o primeiro, como no resto do app. Coberto.
- **`cid` de cadastro de outra loja** (alguém copia o link de uma loja para outra): ignorado. Coberto (a função de conferência recebe o tenant do link).
- **Banco fora do ar na conferência:** o clique ainda é gravado, sem `capture_id`. Coberto.
- **Link comum (sem campanha)**: `whatsapp_group_id` fica nulo, `capture_id` continua valendo. Coberto no teste do store (padrão nulo).

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/links/cid.ts` (+ `.test.ts`) | ler e conferir o `cid` |
| `apps/web/src/lib/stores/tracked-links.ts` (+ `tracked-links.test.ts` novo) | gravar as colunas novas do clique |
| `apps/web/src/lib/links/short-link-click.ts` | ligar as duas coisas no clique humano |

---

### Task 1: Ler e conferir o `cid`

**Files:**
- Create: `apps/web/src/lib/links/cid.ts`
- Test: `apps/web/src/lib/links/cid.test.ts`

**Interfaces:**
- Produces:
  - `function cidDaUrl(url: URL): string | null` — uuid em minúsculas ou null
  - `function cidConferido(url: URL, tenantId: string, confere: (tenantId: string, id: string) => Promise<boolean>): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/links/cid.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { cidConferido, cidDaUrl } from "./cid";

const CID = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const url = (busca: string) => new URL(`https://app.girumo.com.br/r/vip-atacado${busca}`);

test("lê o cid uuid da URL, em minúsculas; o primeiro vale", () => {
  assert.equal(cidDaUrl(url(`?cid=${CID}`)), CID);
  assert.equal(cidDaUrl(url(`?cid=${CID.toUpperCase()}`)), CID);
  assert.equal(cidDaUrl(url(`?cid=${CID}&cid=outro`)), CID);
  assert.equal(cidDaUrl(url(`?utm_source=ig&cid=${CID}`)), CID);
});

test("sem cid ou cid que não é uuid: null", () => {
  assert.equal(cidDaUrl(url("")), null);
  assert.equal(cidDaUrl(url("?cid=")), null);
  assert.equal(cidDaUrl(url("?cid=123")), null);
  assert.equal(cidDaUrl(url(`?cid=${CID}x`)), null);
  assert.equal(cidDaUrl(url("?cid='%20or%201=1")), null);
});

test("só vale se o cadastro for da loja do link; conferência recebe o tenant do link", async () => {
  const vistos: string[] = [];
  const confere = async (tenantId: string, id: string) => {
    vistos.push(`${tenantId}:${id}`);
    return tenantId === "loja-a";
  };
  assert.equal(await cidConferido(url(`?cid=${CID}`), "loja-a", confere), CID);
  assert.equal(await cidConferido(url(`?cid=${CID}`), "loja-b", confere), null);
  assert.deepEqual(vistos, [`loja-a:${CID}`, `loja-b:${CID}`]);
});

test("sem cid não consulta; erro na consulta vira null (o clique segue)", async () => {
  let chamou = false;
  assert.equal(await cidConferido(url(""), "loja-a", async () => { chamou = true; return true; }), null);
  assert.equal(chamou, false);
  assert.equal(await cidConferido(url(`?cid=${CID}`), "loja-a", async () => { throw new Error("banco caiu"); }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/cid.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/links/cid.ts
/**
 * `?cid=` no link de grupo: o id do cadastro que o site da loja acabou de
 * mandar (spec 2026-10-10-funil-anuncios §3). Liga o clique à pessoa.
 *
 * Métrica nunca segura o visitante: tudo que não for um cadastro DESTA loja
 * vira `null` e o clique é gravado sem ele.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function cidDaUrl(url: URL): string | null {
  const cid = (url.searchParams.get("cid") ?? "").trim().toLowerCase();
  return UUID.test(cid) ? cid : null;
}

export async function cidConferido(
  url: URL,
  tenantId: string,
  confere: (tenantId: string, id: string) => Promise<boolean>,
): Promise<string | null> {
  const cid = cidDaUrl(url);
  if (!cid) return null;
  try {
    return (await confere(tenantId, cid)) ? cid : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/cid.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/links/cid.ts apps/web/src/lib/links/cid.test.ts
git commit -m "feat(links): read and verify the signup cid on group link clicks"
```

---

### Task 2: Gravar `capture_id` e `whatsapp_group_id` no clique

**Files:**
- Modify: `apps/web/src/lib/stores/tracked-links.ts` (`recordTrackedLinkClick`, hoje nas linhas ~64–75)
- Test: `apps/web/src/lib/stores/tracked-links.test.ts` (novo)

**Interfaces:**
- Produces: `recordTrackedLinkClick(link: { id: string; tenant_id: string; campaign_group_id: string | null }, extra?: { captureId: string | null; whatsappGroupId: string | null }): Promise<void>` — `extra` opcional, padrão tudo nulo (as outras chamadas não mudam).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/stores/tracked-links.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { recordTrackedLinkClick } from "./tracked-links";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de ig-accounts.test.ts). */

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null });
    res.statusCode = 201;
    res.end();
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const LINK = { id: "link-1", tenant_id: "loja-a", campaign_group_id: "camp-1" };

test("grava o cadastro e o grupo escolhido junto do clique", async () => {
  pedidos.length = 0;
  await recordTrackedLinkClick(LINK, { captureId: "cad-1", whatsappGroupId: "1203@g.us" });
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/link_click_events"]);
  assert.deepEqual(pedidos[0].corpo, {
    tenant_id: "loja-a",
    tracked_link_id: "link-1",
    campaign_group_id: "camp-1",
    capture_id: "cad-1",
    whatsapp_group_id: "1203@g.us",
  });
});

test("sem extra (link comum, chamada antiga): as colunas novas vão nulas", async () => {
  pedidos.length = 0;
  await recordTrackedLinkClick({ ...LINK, campaign_group_id: null });
  assert.deepEqual(pedidos[0].corpo, {
    tenant_id: "loja-a",
    tracked_link_id: "link-1",
    campaign_group_id: null,
    capture_id: null,
    whatsapp_group_id: null,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/tracked-links.test.ts`
Expected: FAIL — o corpo não tem `capture_id` nem `whatsapp_group_id`.

- [ ] **Step 3: Write minimal implementation**

Trocar `recordTrackedLinkClick` em `tracked-links.ts` por:

```ts
export async function recordTrackedLinkClick(
  link: {
    id: string;
    tenant_id: string;
    campaign_group_id: string | null;
  },
  // Funil de anúncios: o cadastro que trouxe o clique (?cid=, já conferido) e o
  // grupo que o rotador escolheu. Opcional para as chamadas que não sabem disso.
  extra: { captureId: string | null; whatsappGroupId: string | null } = { captureId: null, whatsappGroupId: null },
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("link_click_events").insert({
    tenant_id: link.tenant_id,
    tracked_link_id: link.id,
    campaign_group_id: link.campaign_group_id,
    capture_id: extra.captureId,
    whatsapp_group_id: extra.whatsappGroupId,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/tracked-links.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/tracked-links.ts apps/web/src/lib/stores/tracked-links.test.ts
git commit -m "feat(links): store capture id and chosen group on click events"
```

---

### Task 3: Ligar no clique humano do `/r/`

**Files:**
- Modify: `apps/web/src/lib/links/short-link-click.ts` (bloco `if (human) { await Promise.allSettled([...]) }`, hoje logo depois do `if (target.kind === "blocked")`)

**Interfaces:**
- Consumes: `cidConferido` (Task 1); `recordTrackedLinkClick(link, extra)` (Task 2); `cadastroDaLoja(tenantId, id): Promise<boolean>` de `@/lib/stores/site-captures` (PR 2).

- [ ] **Step 1: Trocar o bloco**

Imports (junto dos outros `@/lib/...`):

```ts
import { cidConferido } from "@/lib/links/cid";
import { cadastroDaLoja } from "@/lib/stores/site-captures";
```

Bloco novo no lugar do atual:

```ts
  if (human) {
    // Duas gravações independentes: o contador (total) e o evento com data
    // (histórico). `allSettled` porque uma falhar não pode cancelar a outra —
    // e nenhuma das duas é caminho crítico: métrica nunca segura o visitante.
    // O evento leva o cadastro que trouxe a pessoa (?cid= da MESMA loja, conferido
    // no banco) e o grupo escolhido: é o degrau "foi pro grupo" do funil de anúncios.
    await Promise.allSettled([
      linksStore.incrementTrackedLinkClicks(link.id),
      (async () => {
        const captureId = await cidConferido(reqUrl, link.tenant_id, cadastroDaLoja);
        await linksStore.recordTrackedLinkClick(link, { captureId, whatsappGroupId: target.groupId ?? null });
      })(),
    ]);
  }
```

`reqUrl` já é declarado antes de `resolveClickTarget` nesta função; não declarar de novo.

- [ ] **Step 2: Rodar os testes que tocam o fluxo de link**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test "src/lib/links/*.test.ts" src/lib/stores/tracked-links.test.ts`
Expected: PASS (os de `resolve-click-target`, `decisao`, `deep-link`, `click-attribution`, `cid` e `tracked-links`).

- [ ] **Step 3: Tipos e lint**

Run (em `apps/web`): `npx tsc --noEmit` e `npm run lint`
Expected: sem erro novo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/links/short-link-click.ts
git commit -m "feat(links): record the signup cid and chosen group on human clicks"
```

---

### Task 4: Verificação, PR e prova em prod

- [ ] **Step 1:** Em `apps/web`: `npm test` inteiro verde.
- [ ] **Step 2:** Push e PR "feat(links): record signup cid and chosen group on /r clicks (funil de anúncios, PR 4)". Terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Prova em prod depois do deploy, numa loja de teste (NUNCA no link da loja-piloto, que somaria um clique falso no contador dela).** Com a chave de teste do PR 2 gerada para um link de campanha da loja de teste:

```bash
curl -s -X POST "https://app.girumo.com.br/api/integracoes/cadastro" -H "authorization: Bearer <chave da loja de teste>" -H "content-type: application/json" -d "{\"whatsapp\":\"62900000001\",\"page_url\":\"https://teste.example/vip?utm_campaign=PROVA\",\"event_id\":\"prova-pr4-0001\"}"
```

Abrir o `redirect` devolvido num navegador de verdade (o `curl` cai no filtro de bot e não grava clique). Depois, leitura em prod:

```sql
select e.occurred_at, e.capture_id, e.whatsapp_group_id, s.utm_campaign
  from public.link_click_events e
  join public.site_captures s on s.id = e.capture_id
 where s.event_id = 'prova-pr4-0001';
```

Expected: uma linha com `capture_id` preenchido, `whatsapp_group_id` do grupo aberto e `utm_campaign = 'PROVA'`. Apagar depois o cadastro de prova (`delete from public.site_captures where event_id = 'prova-pr4-0001'` — o clique fica com `capture_id` nulo pelo `on delete set null`).
- [ ] **Step 4:** Card: `select public.move_card('funil-anuncios', 'em_construcao', 'PR 4: clique grava cid e grupo; captura de ponta a ponta provada na loja de teste', 'PR #<n>');`
