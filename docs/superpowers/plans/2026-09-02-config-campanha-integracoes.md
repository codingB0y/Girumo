# Configurações da campanha — PR B (Integrações) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a campanha medir o que o anúncio comprou — pixel do Meta com evento escolhido,
API de Conversões deduplicada por `event_id`, GA4 e Google Ads na tela de entrada — configurados
numa aba "Integrações" com evento de teste, sem nunca devolver o token pelo GET nem segurar o
visitante do `/r/`.

**Architecture:** As chaves vivem em `campaign_groups.metadata.settings.integracoes` (mesmo jsonb
do PR A, **sem migração**). `settings.ts` ganha a leitura tolerante e o patch estrito das
integrações, com o `capi_token` em regime **write-only** (o GET devolve `capi_token_set` + 4
últimos). `meta-capi.ts` nasce puro: monta o payload da Graph API e envia com timeout de 3 s,
falha só loga. O `/r/` gera **um** `event_id` por clique e passa o mesmo id para o HTML
(`fbq(..., { eventID })`) e para o CAPI em `after()` — é isso que faz a Meta deduplicar navegador
× servidor. A CSP do `click-redirect` ganha os hosts do Google.

**Tech Stack:** Next.js 15 (App Router, route handlers `nodejs`, `after` de `next/server`), React 19,
Tailwind, Supabase service-role via `getSupabaseAdmin`, `zod` ^4.4, testes unitários em `node:test`
via `tsx`, E2E em Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-config-grupos-campanha-design.md` (este plano cobre só
o item 2 do "Fatiamento": PR B. Revisão de links e remoção de pessoas são planos separados — PR C/D.)

**PR anterior:** `docs/superpowers/plans/2026-09-02-config-campanha-entrada.md` (PR A, mergeado em
#226). Este plano **assume** que `settings.ts`, `deep-link.ts`, `entry-page.ts`,
`resolve-click-target.ts` e a aba Entrada já existem em `main`.

## Global Constraints

- **Worktree:** todo comando roda em `C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\config-grupos-campanha`
  (abaixo, `$W`). O cwd do Bash **reseta entre chamadas**: use `git -C "$W"` e caminhos absolutos,
  ou `cd "$W/apps/web" && …` no MESMO comando. Nunca `cd` numa chamada e comando na seguinte.
- **node_modules** já estão ligados por junction (raiz e `apps/web`). Não rode `npm install`.
- **Sem migração.** Nada de coluna nova; tudo em `campaign_groups.metadata.settings.integracoes`.
  `deploy/supabase/apply-order.txt` e `schema-baseline.json` não mudam.
- **Multi-tenant:** toda leitura/escrita passa pelas stores existentes, que filtram
  `.eq("tenant_id", …)` — o service-role bypassa RLS; o filtro é a proteção real.
- **O `/r/` nunca segura o visitante.** Métrica, cookie e CAPI são best-effort: o CAPI roda em
  `after()`, com timeout de 3 s, e falha só loga com prefixo `[r/capi]`.
- **`capi_token` é write-only.** Nenhuma resposta de API pode conter o token inteiro. O GET devolve
  `capi_token_set: boolean` e `capi_token_last4: string`. Enviar `capi_token: ""` **apaga**; omitir
  o campo **mantém** o valor atual.
- **Bots não geram CAPI.** O `BOT_UA` já existente no `/r/` decide: `human === false` → sem CAPI e
  sem contador (como hoje).
- **Versão da Graph API numa constante única:** `GRAPH_API_VERSION = "v23.0"`.
- **Formatos aceitos** (regex exatos, iguais aos da spec): `pixel_id` `^\d{5,20}$` · `ga4.id`
  `^G-[A-Z0-9]+$` · `google_ads.id` `^AW-\d+$` · `google_ads.label` `^[A-Za-z0-9_-]+$` ·
  `meta.evento` `^[A-Za-z][A-Za-z0-9_]{0,39}$` (padrões oferecidos: `Lead`, `Contact`,
  `CompleteRegistration`) · `test_code` `^[A-Za-z0-9]{1,32}$`.
- **Copy em pt-BR na voz do produto**, direta e sem jargão.
- **Nomes exatos** (a E2E casa por eles): aba `Integrações`; campos `ID do pixel`,
  `Evento de conversão`, `Token da API de Conversões`, `Código de teste`, `ID de medição (GA4)`,
  `ID de conversão (Google Ads)`, `Rótulo de conversão`; botões `Enviar teste` e
  `Salvar alterações`; aviso `Lead registrado mesmo com deep link`.
- **Etiquetas de estado dos cards:** `recebendo eventos` · `sem token` · `não configurado`.

---

### Task 0: Baseline da worktree

**Files:** nenhum.

- [ ] **Step 1: Partir de `main` atualizado**

```bash
W="C:/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/config-grupos-campanha"
git -C "$W" fetch origin main
git -C "$W" checkout -b feat/config-campanha-integracoes origin/main
git -C "$W" log --oneline -1
```
Expected: HEAD é o merge do PR #226 (`feat(campanhas): configuracoes de entrada…`) ou posterior.

- [ ] **Step 2: Confirmar que a base do PR A está presente**

```bash
cd "$W" && ls apps/web/src/lib/campaigns/settings.ts apps/web/src/lib/campaigns/entry-page.ts apps/web/src/components/painel/campanhas/entrada-form.tsx
```
Expected: os três existem. Se não, você não está em cima do merge do PR A — pare e refaça o Step 1.

---

### Task 1: `settings.ts` — integrações com token write-only

**Files:**
- Modify: `apps/web/src/lib/campaigns/settings.ts` (acrescenta ao final; não mexe no que já existe)
- Test: `apps/web/src/lib/campaigns/settings.test.ts` (acrescenta casos ao final)

**Interfaces:**
- Consumes: `isRecord` (função privada já existente no módulo), `z` de `zod`.
- Produces:
  - `type MetaIntegracao = { pixel_id: string; evento: string; capi_token: string; test_code: string }`
  - `type Integracoes = { meta: MetaIntegracao; ga4: { id: string }; google_ads: { id: string; label: string } }`
  - `type IntegracoesPatch` — igual a `Integracoes`, mas com `meta.capi_token` **opcional**
  - `const EVENTOS_PADRAO: readonly ["Lead", "Contact", "CompleteRegistration"]`
  - `const INTEGRACOES_DEFAULTS: Integracoes`
  - `readIntegracoes(metadata): Integracoes` (tolerante)
  - `parseIntegracoesPatch(input): { ok: true; patch: IntegracoesPatch } | { ok: false; error: string }`
  - `mergeIntegracoes(atual: Integracoes, patch: IntegracoesPatch): Integracoes`
  - `withIntegracoes(metadata, integracoes): Record<string, unknown>`
  - `maskToken(token: string): { capi_token_set: boolean; capi_token_last4: string }`
  - `hasIntegracao(i: Integracoes): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `apps/web/src/lib/campaigns/settings.test.ts` (o arquivo já importa
`test` de `node:test` e `assert` de `node:assert/strict`; some os símbolos novos ao import
existente de `./settings`):

```ts
test("readIntegracoes: metadata vazio cai nos defaults", () => {
  assert.deepEqual(readIntegracoes(null), INTEGRACOES_DEFAULTS);
  assert.deepEqual(readIntegracoes({}), INTEGRACOES_DEFAULTS);
  assert.deepEqual(readIntegracoes({ settings: { integracoes: "lixo" } }), INTEGRACOES_DEFAULTS);
});

test("readIntegracoes: campo inválido cai no padrão SÓ dele", () => {
  const lido = readIntegracoes({
    settings: { integracoes: { meta: { pixel_id: "abc", evento: "Contact" }, ga4: { id: "G-ABC123" } } },
  });
  assert.equal(lido.meta.pixel_id, ""); // "abc" não casa ^\d{5,20}$
  assert.equal(lido.meta.evento, "Contact"); // válido, preservado
  assert.equal(lido.ga4.id, "G-ABC123"); // válido, preservado
});

test("readIntegracoes: evento inválido volta pra Lead", () => {
  const lido = readIntegracoes({ settings: { integracoes: { meta: { evento: "1nvalido!" } } } });
  assert.equal(lido.meta.evento, "Lead");
});

test("parseIntegracoesPatch: recusa pixel fora do formato nomeando o campo", () => {
  const r = parseIntegracoesPatch({
    meta: { pixel_id: "12", evento: "Lead", test_code: "" },
    ga4: { id: "" },
    google_ads: { id: "", label: "" },
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /meta\.pixel_id/);
});

test("parseIntegracoesPatch: aceita evento personalizado e campos vazios", () => {
  const r = parseIntegracoesPatch({
    meta: { pixel_id: "1234567890", evento: "EntrouNoGrupo", test_code: "TEST123" },
    ga4: { id: "G-AB12CD34" },
    google_ads: { id: "AW-987654321", label: "abc_DEF-123" },
  });
  assert.equal(r.ok, true);
});

test("parseIntegracoesPatch: chave desconhecida é recusada", () => {
  const r = parseIntegracoesPatch({
    meta: { pixel_id: "", evento: "Lead", test_code: "", tiktok: "x" },
    ga4: { id: "" },
    google_ads: { id: "", label: "" },
  });
  assert.equal(r.ok, false);
});

test("mergeIntegracoes: token omitido MANTÉM, string vazia APAGA", () => {
  const atual = {
    ...INTEGRACOES_DEFAULTS,
    meta: { pixel_id: "1234567890", evento: "Lead", capi_token: "EAAsegredo", test_code: "" },
  };
  const base = { ga4: { id: "" }, google_ads: { id: "", label: "" } };
  const mantido = mergeIntegracoes(atual, {
    ...base,
    meta: { pixel_id: "1234567890", evento: "Lead", test_code: "" },
  });
  assert.equal(mantido.meta.capi_token, "EAAsegredo");
  const apagado = mergeIntegracoes(atual, {
    ...base,
    meta: { pixel_id: "1234567890", evento: "Lead", capi_token: "", test_code: "" },
  });
  assert.equal(apagado.meta.capi_token, "");
});

test("maskToken: nunca devolve o token inteiro", () => {
  assert.deepEqual(maskToken(""), { capi_token_set: false, capi_token_last4: "" });
  const m = maskToken("EAAabcdefgh3456");
  assert.deepEqual(m, { capi_token_set: true, capi_token_last4: "3456" });
  assert.equal(JSON.stringify(m).includes("abcdefgh"), false);
});

test("hasIntegracao: só é verdade quando algum serviço tem id", () => {
  assert.equal(hasIntegracao(INTEGRACOES_DEFAULTS), false);
  assert.equal(hasIntegracao({ ...INTEGRACOES_DEFAULTS, ga4: { id: "G-X1" } }), true);
  assert.equal(
    hasIntegracao({ ...INTEGRACOES_DEFAULTS, meta: { ...INTEGRACOES_DEFAULTS.meta, pixel_id: "1234567890" } }),
    true,
  );
  // Google Ads só conta com id E rótulo: sem rótulo o gtag não tem send_to.
  assert.equal(hasIntegracao({ ...INTEGRACOES_DEFAULTS, google_ads: { id: "AW-1", label: "" } }), false);
});

test("withIntegracoes: preserva loja e entrada, sem mutar o original", () => {
  const antes = { loja: "Mega Stock", settings: { entrada: { deep_link: false } } };
  const depois = withIntegracoes(antes, INTEGRACOES_DEFAULTS) as Record<string, any>;
  assert.equal(depois.loja, "Mega Stock");
  assert.deepEqual(depois.settings.entrada, { deep_link: false });
  assert.deepEqual(depois.settings.integracoes, INTEGRACOES_DEFAULTS);
  assert.equal(Object.hasOwn(antes.settings, "integracoes"), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/settings.test.ts`
Expected: FAIL — `readIntegracoes is not a function` (ou erro de import do símbolo).

- [ ] **Step 3: Implementar**

Acrescente ao fim de `apps/web/src/lib/campaigns/settings.ts`:

```ts
/* ── Integrações (PR B) ────────────────────────────────────────────────── */

export type MetaIntegracao = { pixel_id: string; evento: string; capi_token: string; test_code: string };
export type Integracoes = {
  meta: MetaIntegracao;
  ga4: { id: string };
  google_ads: { id: string; label: string };
};
/** Igual a `Integracoes`, mas o token é opcional: ausente = manter, "" = apagar. */
export type IntegracoesPatch = {
  meta: Omit<MetaIntegracao, "capi_token"> & { capi_token?: string };
  ga4: { id: string };
  google_ads: { id: string; label: string };
};

export const EVENTOS_PADRAO = ["Lead", "Contact", "CompleteRegistration"] as const;

export const INTEGRACOES_DEFAULTS: Integracoes = Object.freeze({
  meta: Object.freeze({ pixel_id: "", evento: "Lead", capi_token: "", test_code: "" }),
  ga4: Object.freeze({ id: "" }),
  google_ads: Object.freeze({ id: "", label: "" }),
}) as Integracoes;

const PIXEL_ID = /^\d{5,20}$/;
const GA4_ID = /^G-[A-Z0-9]+$/;
const ADS_ID = /^AW-\d+$/;
const ADS_LABEL = /^[A-Za-z0-9_-]+$/;
const EVENTO = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const TEST_CODE = /^[A-Za-z0-9]{1,32}$/;

/** "" é sempre aceito (campo não configurado); preenchido tem de casar o regex. */
const vazioOu = (re: RegExp, msg: string) => z.string().refine((v) => v === "" || re.test(v), msg);

const integracoesPatchSchema = z.strictObject({
  meta: z.strictObject({
    pixel_id: vazioOu(PIXEL_ID, "o ID do pixel tem de ser só números (5 a 20 dígitos)"),
    evento: z.string().regex(EVENTO, "nome de evento inválido"),
    capi_token: z.string().max(500).optional(),
    test_code: vazioOu(TEST_CODE, "código de teste inválido"),
  }),
  ga4: z.strictObject({ id: vazioOu(GA4_ID, 'o ID do GA4 começa com "G-"') }),
  google_ads: z.strictObject({
    id: vazioOu(ADS_ID, 'o ID do Google Ads começa com "AW-"'),
    label: vazioOu(ADS_LABEL, "rótulo de conversão inválido"),
  }),
});

/** Leitura tolerante — mesmo contrato do `readEntrada`: campo ruim cai no padrão dele. */
export function readIntegracoes(metadata: Record<string, unknown> | null | undefined): Integracoes {
  const settings = isRecord(metadata?.settings) ? metadata.settings : {};
  const raw = isRecord(settings.integracoes) ? settings.integracoes : {};
  const meta = isRecord(raw.meta) ? raw.meta : {};
  const ga4 = isRecord(raw.ga4) ? raw.ga4 : {};
  const ads = isRecord(raw.google_ads) ? raw.google_ads : {};
  const str = (v: unknown, re: RegExp, padrao: string): string =>
    typeof v === "string" && re.test(v) ? v : padrao;
  return {
    meta: {
      pixel_id: str(meta.pixel_id, PIXEL_ID, ""),
      evento: str(meta.evento, EVENTO, INTEGRACOES_DEFAULTS.meta.evento),
      capi_token: typeof meta.capi_token === "string" ? meta.capi_token : "",
      test_code: str(meta.test_code, TEST_CODE, ""),
    },
    ga4: { id: str(ga4.id, GA4_ID, "") },
    google_ads: { id: str(ads.id, ADS_ID, ""), label: str(ads.label, ADS_LABEL, "") },
  };
}

/** Validação estrita do PATCH. O erro nomeia o primeiro campo errado. */
export function parseIntegracoesPatch(
  input: unknown,
): { ok: true; patch: IntegracoesPatch } | { ok: false; error: string } {
  const result = integracoesPatchSchema.safeParse(input);
  if (result.success) return { ok: true, patch: result.data };
  const issue = result.error.issues[0];
  const path = issue.path.map(String).join(".") || "settings.integracoes";
  return { ok: false, error: `${path}: ${issue.message}` };
}

/**
 * Aplica o patch sobre o valor atual. A única regra fina é o token: o painel
 * NUNCA recebe o valor, então não pode reenviá-lo — omitir tem de significar
 * "não mexi nisso", e só "" apaga de propósito.
 */
export function mergeIntegracoes(atual: Integracoes, patch: IntegracoesPatch): Integracoes {
  return {
    meta: {
      pixel_id: patch.meta.pixel_id,
      evento: patch.meta.evento,
      capi_token: patch.meta.capi_token === undefined ? atual.meta.capi_token : patch.meta.capi_token,
      test_code: patch.meta.test_code,
    },
    ga4: { id: patch.ga4.id },
    google_ads: { id: patch.google_ads.id, label: patch.google_ads.label },
  };
}

/** Metadata novo com as integrações gravadas — cópia, nunca mutação. */
export function withIntegracoes(
  metadata: Record<string, unknown> | null | undefined,
  integracoes: Integracoes,
): Record<string, unknown> {
  const base = isRecord(metadata) ? metadata : {};
  const settings = isRecord(base.settings) ? base.settings : {};
  return { ...base, settings: { ...settings, integracoes } };
}

/** O que o GET pode dizer sobre o token: que existe e os 4 últimos. Nunca o valor. */
export function maskToken(token: string): { capi_token_set: boolean; capi_token_last4: string } {
  return { capi_token_set: token.length > 0, capi_token_last4: token.length > 0 ? token.slice(-4) : "" };
}

/**
 * Alguma integração configurada? É o que decide se o /r/ mostra o intersticial
 * mesmo sem deep link. Google Ads só conta com id E rótulo: sem rótulo não há
 * `send_to` e o gtag não dispara nada.
 */
export function hasIntegracao(i: Integracoes): boolean {
  return Boolean(i.meta.pixel_id || i.ga4.id || (i.google_ads.id && i.google_ads.label));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/settings.test.ts`
Expected: PASS, `fail 0`.

- [ ] **Step 5: Matar o mutante** (prova que o teste do token vale)

Troque em `mergeIntegracoes` `patch.meta.capi_token === undefined` por `!patch.meta.capi_token`
e rode de novo.
Expected: o teste "token omitido MANTÉM, string vazia APAGA" **falha** — a variante não distingue
omitido de vazio. Desfaça a troca e confirme que volta a passar.

- [ ] **Step 6: Commit**

```bash
git -C "$W" add apps/web/src/lib/campaigns/settings.ts apps/web/src/lib/campaigns/settings.test.ts
git -C "$W" commit -m "feat(campanhas): settings de integracoes com token write-only"
```

---

### Task 2: `meta-capi.ts` — payload da API de Conversões e envio

**Files:**
- Create: `apps/web/src/lib/campaigns/meta-capi.ts`
- Test: `apps/web/src/lib/campaigns/meta-capi.test.ts`

**Interfaces:**
- Consumes: nada do projeto (módulo puro + `fetch` global).
- Produces:
  - `const GRAPH_API_VERSION = "v23.0"`
  - `type CapiInput = { eventName: string; eventId: string; eventTimeMs: number; sourceUrl: string; clientIp: string | null; userAgent: string; fbclid: string | null; fbp: string | null; campaignName: string; groupId: string | null; testCode?: string }`
  - `type CapiPayload` — o corpo JSON exato que vai para a Graph API
  - `buildCapiPayload(input: CapiInput): CapiPayload`
  - `capiEndpoint(pixelId: string): string`
  - `sendCapiEvent(a: { pixelId: string; token: string; payload: CapiPayload; timeoutMs?: number }): Promise<{ ok: boolean; eventsReceived?: number; error?: string }>`
  - `firstForwardedIp(header: string | null): string | null`

- [ ] **Step 1: Escrever os testes que falham**

Crie `apps/web/src/lib/campaigns/meta-capi.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildCapiPayload, capiEndpoint, firstForwardedIp, GRAPH_API_VERSION, sendCapiEvent } from "./meta-capi";

const base = {
  eventName: "Lead",
  eventId: "11111111-2222-3333-4444-555555555555",
  eventTimeMs: 1_756_000_000_000,
  sourceUrl: "https://girumo.com.br/r/grade-verao",
  clientIp: "203.0.113.7",
  userAgent: "Mozilla/5.0 (iPhone)",
  fbclid: null as string | null,
  fbp: null as string | null,
  campaignName: "Grade de verão",
  groupId: "120363001@g.us",
};

test("payload: campos obrigatórios da Meta, tempo em SEGUNDOS", () => {
  const p = buildCapiPayload(base);
  const e = p.data[0];
  assert.equal(e.event_name, "Lead");
  assert.equal(e.event_id, base.eventId);
  assert.equal(e.event_time, 1_756_000_000); // ms → s
  assert.equal(e.action_source, "website");
  assert.equal(e.event_source_url, base.sourceUrl);
  assert.equal(e.user_data.client_ip_address, "203.0.113.7");
  assert.equal(e.user_data.client_user_agent, base.userAgent);
  assert.deepEqual(e.custom_data, { campaign: "Grade de verão", group: "120363001@g.us" });
});

test("fbc só existe quando há fbclid de verdade", () => {
  assert.equal(buildCapiPayload(base).data[0].user_data.fbc, undefined);
  const comClid = buildCapiPayload({ ...base, fbclid: "IwAR123" });
  assert.equal(comClid.data[0].user_data.fbc, `fb.1.${base.eventTimeMs}.IwAR123`);
});

test("fbp entra só quando o cookie existe", () => {
  assert.equal(buildCapiPayload(base).data[0].user_data.fbp, undefined);
  assert.equal(buildCapiPayload({ ...base, fbp: "fb.1.1.2" }).data[0].user_data.fbp, "fb.1.1.2");
});

test("test_event_code só quando pedido", () => {
  assert.equal(buildCapiPayload(base).test_event_code, undefined);
  assert.equal(buildCapiPayload({ ...base, testCode: "TEST123" }).test_event_code, "TEST123");
});

test("payload nunca leva PII crua nem o token", () => {
  const texto = JSON.stringify(buildCapiPayload({ ...base, testCode: "TEST123" }));
  for (const proibido of ["email", "phone", "access_token", "EAA"]) {
    assert.equal(texto.includes(proibido), false, `payload não pode conter ${proibido}`);
  }
});

test("endpoint fixa a versão da Graph API numa constante", () => {
  assert.equal(capiEndpoint("1234567890"), `https://graph.facebook.com/${GRAPH_API_VERSION}/1234567890/events`);
});

test("firstForwardedIp pega o PRIMEIRO da lista, ignora vazio", () => {
  assert.equal(firstForwardedIp("203.0.113.7, 70.41.3.18"), "203.0.113.7");
  assert.equal(firstForwardedIp("  203.0.113.7  "), "203.0.113.7");
  assert.equal(firstForwardedIp(null), null);
  assert.equal(firstForwardedIp(""), null);
});

test("sendCapiEvent: manda o token no CORPO e devolve events_received", async () => {
  const chamadas: Array<{ url: string; body: string }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), body: String(init.body) });
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as typeof fetch;
  try {
    const r = await sendCapiEvent({ pixelId: "1234567890", token: "EAAsegredo", payload: buildCapiPayload(base) });
    assert.equal(r.ok, true);
    assert.equal(r.eventsReceived, 1);
    assert.equal(chamadas[0].url.includes("EAAsegredo"), false, "token não pode ir na URL");
    assert.equal(JSON.parse(chamadas[0].body).access_token, "EAAsegredo");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendCapiEvent: erro da Meta NÃO lança, devolve ok:false", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Invalid OAuth token" } }), { status: 400 })) as typeof fetch;
  try {
    const r = await sendCapiEvent({ pixelId: "1234567890", token: "ruim", payload: buildCapiPayload(base) });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /Invalid OAuth token/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendCapiEvent: rede caída NÃO lança", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const r = await sendCapiEvent({ pixelId: "1234567890", token: "x", payload: buildCapiPayload(base) });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /ECONNREFUSED/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/meta-capi.test.ts`
Expected: FAIL — `Cannot find module './meta-capi'`.

- [ ] **Step 3: Implementar**

Crie `apps/web/src/lib/campaigns/meta-capi.ts`:

```ts
/**
 * API de Conversões do Meta (CAPI) para o clique do /r/.
 *
 * Por que existe: o pixel do navegador some quando o visitante bloqueia script,
 * usa iOS com prevenção de rastreamento ou sai antes do fbevents.js carregar —
 * e no /r/ isso é a regra, não a exceção: a página vive 600 ms. O evento pelo
 * servidor chega sempre. Os dois carregam o MESMO `event_id`, que é como a Meta
 * junta os dois num só (dedup) em vez de contar Lead dobrado.
 *
 * Puro + um envio isolado: `buildCapiPayload` não toca rede, então o `tsx --test`
 * cobre o formato inteiro sem mock de servidor. Sem `server-only` de propósito.
 */

/** A Meta mantém cada versão por ~2 anos e avisa 90 dias antes de aposentar. */
export const GRAPH_API_VERSION = "v23.0";

const TIMEOUT_MS = 3000;

export type CapiInput = {
  eventName: string;
  eventId: string;
  eventTimeMs: number;
  sourceUrl: string;
  clientIp: string | null;
  userAgent: string;
  fbclid: string | null;
  fbp: string | null;
  campaignName: string;
  groupId: string | null;
  testCode?: string;
};

export type CapiPayload = {
  data: Array<{
    event_name: string;
    event_time: number;
    event_id: string;
    action_source: "website";
    event_source_url: string;
    user_data: {
      client_ip_address?: string;
      client_user_agent?: string;
      fbc?: string;
      fbp?: string;
    };
    custom_data: { campaign: string; group?: string };
  }>;
  test_event_code?: string;
};

/**
 * `x-forwarded-for` é uma LISTA: o primeiro é o visitante, os seguintes são os
 * proxies. Mandar a lista inteira faz a Meta descartar o campo.
 */
export function firstForwardedIp(header: string | null): string | null {
  const first = (header ?? "").split(",")[0]?.trim();
  return first ? first : null;
}

export function capiEndpoint(pixelId: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;
}

/**
 * Sem PII: só IP, UA e os identificadores de clique do próprio Meta. Não temos
 * (nem queremos) e-mail ou telefone de quem clica num link público — pedir isso
 * seria trocar consentimento por match quality.
 */
export function buildCapiPayload(i: CapiInput): CapiPayload {
  const user_data: CapiPayload["data"][0]["user_data"] = {};
  if (i.clientIp) user_data.client_ip_address = i.clientIp;
  if (i.userAgent) user_data.client_user_agent = i.userAgent;
  // fbc SÓ com fbclid real na URL: inventar um estraga a atribuição do anúncio.
  if (i.fbclid) user_data.fbc = `fb.1.${i.eventTimeMs}.${i.fbclid}`;
  if (i.fbp) user_data.fbp = i.fbp;

  const custom_data: CapiPayload["data"][0]["custom_data"] = { campaign: i.campaignName };
  if (i.groupId) custom_data.group = i.groupId;

  const payload: CapiPayload = {
    data: [
      {
        event_name: i.eventName,
        event_time: Math.floor(i.eventTimeMs / 1000), // a Meta quer SEGUNDOS
        event_id: i.eventId,
        action_source: "website",
        event_source_url: i.sourceUrl,
        user_data,
        custom_data,
      },
    ],
  };
  if (i.testCode) payload.test_event_code = i.testCode;
  return payload;
}

/**
 * Envia e NUNCA lança: quem chama está num `after()` do /r/, e uma exceção ali
 * viraria ruído no log sem ajudar ninguém. O token vai no CORPO, nunca na URL —
 * URL entra em log de proxy e de CDN.
 */
export async function sendCapiEvent(a: {
  pixelId: string;
  token: string;
  payload: CapiPayload;
  timeoutMs?: number;
}): Promise<{ ok: boolean; eventsReceived?: number; error?: string }> {
  try {
    const res = await fetch(capiEndpoint(a.pixelId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...a.payload, access_token: a.token }),
      signal: AbortSignal.timeout(a.timeoutMs ?? TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, eventsReceived: json.events_received ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/meta-capi.test.ts`
Expected: PASS, `fail 0`.

- [ ] **Step 5: Matar o mutante**

Troque `Math.floor(i.eventTimeMs / 1000)` por `i.eventTimeMs` e rode.
Expected: o teste "campos obrigatórios da Meta, tempo em SEGUNDOS" **falha**. Desfaça.

- [ ] **Step 6: Commit**

```bash
git -C "$W" add apps/web/src/lib/campaigns/meta-capi.ts apps/web/src/lib/campaigns/meta-capi.test.ts
git -C "$W" commit -m "feat(campanhas): payload e envio da API de Conversoes do Meta"
```

---

### Task 3: `entry-page.ts` — evento escolhido, eventID, GA4, Google Ads e prévia

**Files:**
- Modify: `apps/web/src/lib/campaigns/entry-page.ts`
- Test: `apps/web/src/lib/campaigns/entry-page.test.ts` (acrescenta casos)

**Interfaces:**
- Consumes: `nonceAttribute` de `@/lib/security/csp` (já importado), `Integracoes` de
  `@/lib/campaigns/settings`.
- Produces: `renderEntryPage` com a assinatura NOVA abaixo. Quem chama (Task 5 e o ramo legado
  do `/r/`) precisa ser atualizado junto.

```ts
export function renderEntryPage(i: {
  loja: string;
  campaignName: string;
  groupName: string | null;
  httpsUrl: string;
  deepLinkUrl: string | null;
  nonce: string | null;
  pixelId?: string;          // continua existindo: o link comum (não-campanha) só tem isso
  evento?: string;           // default "Lead"
  eventId?: string;          // dedup com o CAPI
  ga4Id?: string;
  googleAds?: { id: string; label: string };
  preview?: boolean;         // painel: sem scripts, sem navegação
}): string;
```

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `apps/web/src/lib/campaigns/entry-page.test.ts`:

```ts
const comum = {
  loja: "Mega Stock",
  campaignName: "Grade de verão",
  groupName: "Grade #3",
  httpsUrl: "https://chat.whatsapp.com/ABC123",
  deepLinkUrl: null,
  nonce: "dGVzdGVub25jZTEyMzQ1Ng==",
};

test("pixel: usa o evento escolhido e carrega o eventID do CAPI", () => {
  const html = renderEntryPage({ ...comum, pixelId: "1234567890", evento: "Contact", eventId: "abc-123" });
  assert.match(html, /fbq\('init','1234567890'\)/);
  assert.match(html, /fbq\('track','Contact',\{\},\{eventID:'abc-123'\}\)/);
});

test("pixel sem eventId ainda funciona (link comum, sem campanha)", () => {
  const html = renderEntryPage({ ...comum, pixelId: "1234567890" });
  assert.match(html, /fbq\('track','Lead'/);
});

test("GA4 e Google Ads entram com nonce e send_to montado", () => {
  const html = renderEntryPage({ ...comum, ga4Id: "G-AB12CD34", googleAds: { id: "AW-99", label: "rot_1" } });
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-AB12CD34/);
  assert.match(html, /gtag\('event','generate_lead'/);
  assert.match(html, /send_to:'AW-99\/rot_1'/);
});

test("Google Ads sem rótulo não dispara conversão", () => {
  const html = renderEntryPage({ ...comum, googleAds: { id: "AW-99", label: "" } });
  assert.equal(html.includes("send_to"), false);
});

test("TODO script inline carrega o nonce", () => {
  const html = renderEntryPage({
    ...comum,
    deepLinkUrl: "whatsapp://chat?code=ABC123",
    pixelId: "1234567890",
    ga4Id: "G-AB12CD34",
    eventId: "abc-123",
  });
  const scripts = html.match(/<script[^>]*>/g) ?? [];
  assert.ok(scripts.length >= 3, "esperava pixel + gtag + navegação");
  for (const s of scripts) {
    assert.match(s, /nonce="dGVzdGVub25jZTEyMzQ1Ng=="/, `script sem nonce: ${s}`);
  }
});

test("sem integração e sem deep link: nenhum script de terceiro", () => {
  const html = renderEntryPage(comum);
  assert.equal(html.includes("connect.facebook.net"), false);
  assert.equal(html.includes("googletagmanager.com"), false);
});

test("preview: zero script, nem o de navegação — o painel não pode disparar evento", () => {
  const html = renderEntryPage({
    ...comum,
    deepLinkUrl: "whatsapp://chat?code=ABC123",
    pixelId: "1234567890",
    ga4Id: "G-AB12CD34",
    preview: true,
  });
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("http-equiv=\"refresh\""), false);
  assert.match(html, /Abrir WhatsApp/); // o botão continua aparecendo na prévia
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts`
Expected: FAIL — o pixel ainda dispara `fbq('track','Lead')` fixo e não há gtag.

- [ ] **Step 3: Implementar**

Em `apps/web/src/lib/campaigns/entry-page.ts`, substitua `pixelScript` e `renderEntryPage`:

```ts
/**
 * `eventID` liga este disparo ao evento que o servidor manda pelo CAPI. Sem ele
 * a Meta conta dois Leads pelo mesmo clique e o CPL da campanha vira ficção.
 */
function pixelScript(pixelId: string, evento: string, eventId: string | undefined, nonceAttr: string): string {
  const opts = eventId ? `,{},{eventID:${JSON.stringify(eventId)}}` : "";
  return `<script${nonceAttr}>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init',${JSON.stringify(pixelId)});fbq('track','PageView');fbq('track',${JSON.stringify(evento)}${opts});</script>`;
}

/**
 * Um único gtag.js serve GA4 e Google Ads. O `id=` da tag carrega o primeiro
 * que existir; os dois `config` abaixo é que ligam cada um.
 */
function gtagScript(ga4Id: string, ads: { id: string; label: string } | undefined, nonceAttr: string): string {
  const tagId = ga4Id || ads?.id || "";
  if (!tagId) return "";
  const linhas = [
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());`,
  ];
  if (ga4Id) linhas.push(`gtag('config',${JSON.stringify(ga4Id)});gtag('event','generate_lead');`);
  if (ads?.id && ads.label) {
    linhas.push(
      `gtag('config',${JSON.stringify(ads.id)});gtag('event','conversion',{send_to:${JSON.stringify(`${ads.id}/${ads.label}`)}});`,
    );
  }
  return `<script${nonceAttr} async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}"></script>
<script${nonceAttr}>${linhas.join("")}</script>`;
}

export function renderEntryPage(i: {
  loja: string;
  campaignName: string;
  groupName: string | null;
  httpsUrl: string;
  deepLinkUrl: string | null;
  nonce: string | null;
  pixelId?: string;
  evento?: string;
  eventId?: string;
  ga4Id?: string;
  googleAds?: { id: string; label: string };
  preview?: boolean;
}): string {
  const nonceAttr = nonceAttribute(i.nonce);
  const href = escapeHtml(i.deepLinkUrl ?? i.httpsUrl);
  const frase = i.groupName
    ? `Você vai entrar no grupo <b>${escapeHtml(i.groupName)}</b>.`
    : `Você vai entrar num grupo de <b>${escapeHtml(i.campaignName)}</b>.`;
  // Prévia do painel: a MESMA tela, sem nada que dispare evento ou navegue.
  // Um <iframe srcdoc> não tem CSP nossa, então "sem nonce" não bastaria —
  // os scripts têm de não existir.
  const head = i.preview
    ? ""
    : `${i.pixelId ? pixelScript(i.pixelId, i.evento ?? "Lead", i.eventId, nonceAttr) : ""}${gtagScript(i.ga4Id ?? "", i.googleAds, nonceAttr)}`;
  // JSON.stringify: as URLs viram literais JS seguros (escapa aspas, barras e <).
  const nav = i.preview
    ? ""
    : `<script${nonceAttr}>(function(){var https=${JSON.stringify(i.httpsUrl)};var deep=${JSON.stringify(i.deepLinkUrl)};
setTimeout(function(){if(deep){location.href=deep;setTimeout(function(){if(document.visibilityState==="visible")location.replace(https)},1200)}else{location.replace(https)}},600)})();</script>`;
  const noscript = i.preview ? "" : `<noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(i.httpsUrl)}"></noscript>`;
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Abrindo o WhatsApp…</title>
<style>${STYLE}</style>${head}</head>
<body><div class="card"><div class="loja">${escapeHtml(i.loja)}</div><h1>Abrindo o WhatsApp…</h1><p>${frase}</p>
<div class="linha"><i></i></div><a class="btn" id="abrir" href="${href}">Abrir WhatsApp</a><p class="dica">Não abriu? Toque no botão.</p>
<div class="rodape"><span>girumo</span><span>chat.whatsapp.com</span></div></div>
${nav}${noscript}</body></html>`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts`
Expected: PASS, `fail 0`. Os testes do PR A (nonce, tela de lotado, `lotadoRedirect`) continuam passando.

- [ ] **Step 5: Commit**

```bash
git -C "$W" add apps/web/src/lib/campaigns/entry-page.ts apps/web/src/lib/campaigns/entry-page.test.ts
git -C "$W" commit -m "feat(campanhas): tela de entrada com evento escolhido, eventID, GA4 e Google Ads"
```

---

### Task 4: CSP — hosts do Google na política do `/r/`

**Files:**
- Modify: `apps/web/src/lib/security/csp.ts:76-90` (bloco `click-redirect`)
- Test: `apps/web/src/lib/security/csp.test.ts` (acrescenta casos)

**Interfaces:**
- Consumes: `buildCsp(surface, nonce, isDev)` — assinatura **não muda**.
- Produces: nada novo; só a política do `click-redirect` fica mais larga.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `apps/web/src/lib/security/csp.test.ts`:

```ts
test("click-redirect libera o gtag: script, img e connect do Google", () => {
  const csp = buildCsp("click-redirect", "n0nc3n0nc3n0nc3AA==", false);
  const dir = (nome: string) =>
    csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(nome)) ?? "";
  assert.match(dir("script-src"), /https:\/\/www\.googletagmanager\.com/);
  assert.match(dir("connect-src"), /https:\/\/\*\.google-analytics\.com/);
  assert.match(dir("connect-src"), /https:\/\/\*\.analytics\.google\.com/);
  // A conversão do Google Ads chega como PIXEL (img), não como fetch.
  assert.match(dir("img-src"), /https:\/\/www\.google\.com/);
  assert.match(dir("img-src"), /https:\/\/googleads\.g\.doubleclick\.net/);
});

test("click-redirect continua sem 'unsafe-inline' em produção", () => {
  const csp = buildCsp("click-redirect", "n0nc3n0nc3n0nc3AA==", false);
  const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"))!;
  assert.equal(scriptSrc.includes("'unsafe-inline'"), false);
  assert.equal(scriptSrc.includes("'unsafe-eval'"), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts`
Expected: FAIL — o `click-redirect` não tem host nenhum do Google.

- [ ] **Step 3: Implementar**

Em `apps/web/src/lib/security/csp.ts`, dentro de `buildCsp`, troque o bloco do
`click-redirect` por:

```ts
  if (surface === "click-redirect") {
    // Intersticial de clique: scripts inline nossos (pixel, gtag e o
    // location.replace) — todos nonce-ados no route handler. De terceiros só
    // entram os dois hosts de tag: fbevents.js do Meta e gtag.js do Google.
    // A conversão do Google Ads chega como IMAGEM (googleads/doubleclick), não
    // como fetch — sem esses dois no img-src ela morre em silêncio.
    return [
      "default-src 'self'",
      scriptSrc(nonce, isDev, "https://connect.facebook.net", "https://www.googletagmanager.com"),
      "style-src 'unsafe-inline'",
      "img-src 'self' data: https://www.facebook.com https://www.google.com https://googleads.g.doubleclick.net",
      `connect-src https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com ${SENTRY_CSP_HOST}`,
      "font-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts`
Expected: PASS, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C "$W" add apps/web/src/lib/security/csp.ts apps/web/src/lib/security/csp.test.ts
git -C "$W" commit -m "feat(seguranca): CSP do /r/ libera gtag do Google"
```

---

### Task 5: `/r/[slug]` — event_id compartilhado e CAPI em `after()`

**Files:**
- Modify: `apps/web/src/app/r/[slug]/route.ts`
- Test: `apps/web/src/app/r/[slug]/route.integracoes.test.ts` (novo, integração sem rede)

**Interfaces:**
- Consumes: `readIntegracoes`, `hasIntegracao` (Task 1); `buildCapiPayload`, `sendCapiEvent`,
  `firstForwardedIp` (Task 2); `renderEntryPage` com a assinatura nova (Task 3);
  `readCookie` de `@/lib/links/deep-link` (PR A).
- Produces: nada exportado novo — a rota só liga os fios.

**Regras que este passo tem de manter:**
1. **Um** `event_id` por clique, usado no HTML e no CAPI.
2. Pixel da **campanha** ganha do `link.metadata.pixelId`; sem campanha, o do link.
3. Bot (`human === false`) → sem CAPI.
4. CAPI dentro de `after()`, nunca no caminho da resposta.
5. Intersticial quando **há integração** OU deep link em celular; senão 302 (como hoje).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/app/r/[slug]/route.integracoes.test.ts`. Ele testa a REGRA de decisão,
extraída num helper puro exportado da rota — assim não precisamos subir Supabase:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { INTEGRACOES_DEFAULTS } from "@/lib/campaigns/settings";
import { capiEnvio, pixelDaTela } from "./decisao";

const semNada = INTEGRACOES_DEFAULTS;
const comPixel = { ...INTEGRACOES_DEFAULTS, meta: { pixel_id: "1234567890", evento: "Lead", capi_token: "", test_code: "" } };
const comToken = { ...comPixel, meta: { ...comPixel.meta, capi_token: "EAAsegredo" } };

test("pixel da CAMPANHA ganha do pixel do link", () => {
  assert.equal(pixelDaTela(comPixel, "999999"), "1234567890");
  assert.equal(pixelDaTela(semNada, "999999"), "999999");
  assert.equal(pixelDaTela(semNada, undefined), undefined);
});

test("CAPI só com pixel E token E gente de verdade", () => {
  assert.equal(capiEnvio(comToken, true), true);
  assert.equal(capiEnvio(comToken, false), false, "bot não gera CAPI");
  assert.equal(capiEnvio(comPixel, true), false, "sem token não há CAPI");
  assert.equal(capiEnvio(semNada, true), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test "src/app/r/[slug]/route.integracoes.test.ts"`
Expected: FAIL — `Cannot find module './decisao'`.

- [ ] **Step 3: Criar o helper puro**

Crie `apps/web/src/app/r/[slug]/decisao.ts`:

```ts
/**
 * As duas decisões do /r/ que valem um teste próprio. Ficam fora do `route.ts`
 * porque o route handler importa store, Supabase e `next/server` — testá-las lá
 * exigiria subir meio app para conferir dois `if`.
 */
import type { Integracoes } from "@/lib/campaigns/settings";

/**
 * O pixel da CAMPANHA ganha do pixel do link: quem configurou a campanha
 * escolheu depois, e um link antigo com pixel velho não pode sequestrar a
 * medição da campanha nova.
 */
export function pixelDaTela(integracoes: Integracoes, pixelDoLink: string | undefined): string | undefined {
  return integracoes.meta.pixel_id || pixelDoLink;
}

/** CAPI exige pixel + token, e só para gente de verdade (bot não vira Lead). */
export function capiEnvio(integracoes: Integracoes, human: boolean): boolean {
  return Boolean(human && integracoes.meta.pixel_id && integracoes.meta.capi_token);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test "src/app/r/[slug]/route.integracoes.test.ts"`
Expected: PASS, `fail 0`.

- [ ] **Step 5: Ligar na rota**

Em `apps/web/src/app/r/[slug]/route.ts`:

1. Acrescente aos imports:

```ts
import { after } from "next/server";
import { ENTRADA_DEFAULTS, INTEGRACOES_DEFAULTS, readEntrada, readIntegracoes, hasIntegracao } from "@/lib/campaigns/settings";
import { buildCapiPayload, firstForwardedIp, sendCapiEvent } from "@/lib/campaigns/meta-capi";
import { capiEnvio, pixelDaTela } from "./decisao";
```
(o import de `ENTRADA_DEFAULTS`/`readEntrada` já existe — só some os novos na mesma linha).

2. Logo depois da linha `const entrada = campaign ? readEntrada(campaign.metadata) : ENTRADA_DEFAULTS;`:

```ts
  const integracoes = campaign ? readIntegracoes(campaign.metadata) : INTEGRACOES_DEFAULTS;
```

3. Substitua o bloco final (do `const deepLinkUrl = …` até o `return new Response(null, { status: 302, headers })`) por:

```ts
  const deepLinkUrl = campaign && entrada.deep_link && isMobileUa(ua) ? whatsappDeepLink(target.url) : null;
  const pixelId = pixelDaTela(integracoes, target.pixelId);
  // UM id por clique: o mesmo vai no fbq do HTML e no CAPI. É ele que faz a
  // Meta juntar navegador e servidor num Lead só.
  const eventId = crypto.randomUUID();

  if (capiEnvio(integracoes, human)) {
    // `after()`: roda DEPOIS da resposta sair. O visitante não espera a Meta.
    after(async () => {
      const r = await sendCapiEvent({
        pixelId: integracoes.meta.pixel_id,
        token: integracoes.meta.capi_token,
        payload: buildCapiPayload({
          eventName: integracoes.meta.evento,
          eventId,
          eventTimeMs: Date.now(),
          sourceUrl: reqUrl.toString(),
          clientIp: firstForwardedIp(req.headers.get("x-forwarded-for")),
          userAgent: ua,
          fbclid: reqUrl.searchParams.get("fbclid"),
          fbp: readCookie(req.headers.get("cookie"), "_fbp"),
          campaignName: campaign?.name ?? "",
          groupId: target.groupId ?? null,
          testCode: integracoes.meta.test_code || undefined,
        }),
      });
      if (!r.ok) console.warn(`[r/capi] ${slug}: ${r.error}`);
    });
  }

  if (pixelId || hasIntegracao(integracoes) || deepLinkUrl) {
    // Tela de entrada: dispara as tags e/ou tenta o app. Nonce da CSP desta
    // request, posto pelo middleware — sem ele os scripts inline morrem.
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(
      renderEntryPage({
        loja,
        campaignName: campaign?.name ?? "",
        groupName: target.groupName ?? null,
        httpsUrl: target.url,
        deepLinkUrl,
        nonce: req.headers.get("x-nonce"),
        pixelId,
        evento: integracoes.meta.evento,
        eventId,
        ga4Id: integracoes.ga4.id || undefined,
        googleAds: integracoes.google_ads.id ? integracoes.google_ads : undefined,
      }),
      { headers },
    );
  }
  headers.set("location", target.url);
  return new Response(null, { status: 302, headers });
```

- [ ] **Step 6: Typecheck e suíte**

Run: `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json && npm --workspace apps/web test 2>&1 | tail -6`
Expected: sem erro de tipo; `fail 0`. Se o ramo legado (`legacyGet`) reclamar da assinatura nova
do `renderEntryPage`, ele continua válido — os campos novos são todos opcionais.

- [ ] **Step 7: Smoke local do `/r/`** (dev server na porta 3100)

Suba o dev server da worktree e rode, em PowerShell:

```powershell
$ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
$r = Invoke-WebRequest -Uri "http://localhost:3100/r/grade-verao?fbclid=IwARtest" -Headers @{ "User-Agent" = $ua } -MaximumRedirection 0 -SkipHttpErrorCheck
$r.StatusCode
($r.Content -match "fbq\('track'") ; ($r.Content -match "eventID")
```
Expected: `200`; os dois `match` devolvem `True` quando a campanha `grade-verao` tem pixel
configurado (configure pela aba Integrações na Task 8, ou grave o settings direto no banco de dev).

- [ ] **Step 8: Commit**

```bash
git -C "$W" add "apps/web/src/app/r/[slug]/route.ts" "apps/web/src/app/r/[slug]/decisao.ts" "apps/web/src/app/r/[slug]/route.integracoes.test.ts"
git -C "$W" commit -m "feat(campanhas): /r/ dispara CAPI em after() com event_id compartilhado"
```

---

### Task 6: API — `integracoes` no GET (mascarado) e no PATCH

**Files:**
- Modify: `apps/web/src/app/api/campanhas/route.ts` (GET nas linhas ~50 e ~139; PATCH ~196-226)
- Test: `apps/web/src/app/api/campanhas/campanhas.integracoes.test.ts` (novo)

**Interfaces:**
- Consumes: `readIntegracoes`, `parseIntegracoesPatch`, `mergeIntegracoes`, `withIntegracoes`,
  `maskToken` (Task 1).
- Produces: o formato de resposta abaixo, que a UI da Task 8 e a E2E da Task 9 consomem:

```jsonc
"settings": {
  "entrada": { /* … PR A, sem mudança … */ },
  "integracoes": {
    "meta": { "pixel_id": "1234567890", "evento": "Lead", "test_code": "",
              "capi_token_set": true, "capi_token_last4": "3456" },
    "ga4": { "id": "" },
    "google_ads": { "id": "", "label": "" }
  }
}
```

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/app/api/campanhas/campanhas.integracoes.test.ts`. Testa a função de
apresentação, que é onde mora o risco (vazar o token):

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { INTEGRACOES_DEFAULTS } from "@/lib/campaigns/settings";
import { apresentaIntegracoes } from "./apresenta";

test("GET nunca devolve o token inteiro", () => {
  const saida = apresentaIntegracoes({
    ...INTEGRACOES_DEFAULTS,
    meta: { pixel_id: "1234567890", evento: "Lead", capi_token: "EAAabcdefgh3456", test_code: "T1" },
  });
  const texto = JSON.stringify(saida);
  assert.equal(texto.includes("EAAabcdefgh"), false);
  assert.equal(texto.includes("capi_token\":"), false, "a chave capi_token não pode existir na saída");
  assert.equal(saida.meta.capi_token_set, true);
  assert.equal(saida.meta.capi_token_last4, "3456");
  assert.equal(saida.meta.pixel_id, "1234567890");
  assert.equal(saida.meta.test_code, "T1");
});

test("sem token: set=false e last4 vazio", () => {
  const saida = apresentaIntegracoes(INTEGRACOES_DEFAULTS);
  assert.equal(saida.meta.capi_token_set, false);
  assert.equal(saida.meta.capi_token_last4, "");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/campanhas/campanhas.integracoes.test.ts`
Expected: FAIL — `Cannot find module './apresenta'`.

- [ ] **Step 3: Criar o apresentador**

Crie `apps/web/src/app/api/campanhas/apresenta.ts`:

```ts
/**
 * Forma pública das integrações. Existe para que o token só possa sair daqui de
 * um jeito: mascarado. Espalhar o `maskToken` por três pontos do route.ts é como
 * um deles acabaria devolvendo o objeto cru num refactor futuro.
 */
import { maskToken, type Integracoes } from "@/lib/campaigns/settings";

export type IntegracoesPublicas = {
  meta: { pixel_id: string; evento: string; test_code: string; capi_token_set: boolean; capi_token_last4: string };
  ga4: { id: string };
  google_ads: { id: string; label: string };
};

export function apresentaIntegracoes(i: Integracoes): IntegracoesPublicas {
  return {
    meta: { pixel_id: i.meta.pixel_id, evento: i.meta.evento, test_code: i.meta.test_code, ...maskToken(i.meta.capi_token) },
    ga4: { id: i.ga4.id },
    google_ads: { id: i.google_ads.id, label: i.google_ads.label },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/campanhas/campanhas.integracoes.test.ts`
Expected: PASS, `fail 0`.

- [ ] **Step 5: Ligar no route.ts**

Em `apps/web/src/app/api/campanhas/route.ts`:

1. Nos imports, some os símbolos novos:

```ts
import {
  mergeIntegracoes, parseEntradaPatch, parseIntegracoesPatch, readEntrada, readIntegracoes,
  withEntrada, withIntegracoes,
} from "@/lib/campaigns/settings";
import { apresentaIntegracoes } from "./apresenta";
```

2. Nos **três** pontos que hoje montam `settings: { entrada: readEntrada(...) }` (GET da lista
   ~linha 50, POST ~linha 139 e o retorno do PATCH ~linha 226), troque por:

```ts
    settings: {
      entrada: readEntrada(X.metadata as Record<string, unknown>),
      integracoes: apresentaIntegracoes(readIntegracoes(X.metadata as Record<string, unknown>)),
    },
```
(`X` é `c`, `rec` e `updated` respectivamente — mantenha o nome de cada lugar.)

3. No PATCH, dentro do `if (b.settings !== undefined) { … }`, **depois** do bloco do
   `parseEntradaPatch` e antes do `patch.metadata = withEntrada(...)`, deixe assim:

```ts
    // `metadata` é substituído inteiro pelo update: lê o atual para não perder
    // `loja` e o que mais estiver lá.
    const current = await supaStore.getCampaignGroupById(tenantId, id);
    if (!current) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    let metadata = withEntrada(current.metadata as Record<string, unknown>, parsed.entrada);

    if (s.integracoes !== undefined) {
      const pi = parseIntegracoesPatch(s.integracoes);
      if (!pi.ok) return Response.json({ error: pi.error }, { status: 400 });
      // O painel nunca recebeu o token, então não pode reenviá-lo: o merge é
      // quem decide entre manter o que está no banco e apagar de propósito.
      const atual = readIntegracoes(current.metadata as Record<string, unknown>);
      metadata = withIntegracoes(metadata, mergeIntegracoes(atual, pi.patch));
    }
    patch.metadata = metadata;
```

- [ ] **Step 6: Typecheck e suíte**

Run: `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json && npm --workspace apps/web test 2>&1 | tail -6`
Expected: sem erro de tipo; `fail 0`.

- [ ] **Step 7: Commit**

```bash
git -C "$W" add apps/web/src/app/api/campanhas/route.ts apps/web/src/app/api/campanhas/apresenta.ts apps/web/src/app/api/campanhas/campanhas.integracoes.test.ts
git -C "$W" commit -m "feat(campanhas): API grava integracoes e devolve o token mascarado"
```

---

### Task 7: Rota do evento de teste

**Files:**
- Create: `apps/web/src/app/api/campanhas/[slug]/integracoes/teste/route.ts`

**Interfaces:**
- Consumes: `resolveBulkCampaign(req, slug)` de `@/lib/groups/bulk-request` (devolve
  `{ tenantId, campaign }`, lança `Response` em erro); `readIntegracoes` (Task 1);
  `buildCapiPayload` / `sendCapiEvent` (Task 2).
- Produces: `POST` → `200 { events_received: number }` · `400 { error }` quando falta pixel,
  token ou código de teste · `404` campanha inexistente · `403` sem permissão.

- [ ] **Step 1: Criar a rota**

```ts
import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { readIntegracoes } from "@/lib/campaigns/settings";
import { buildCapiPayload, sendCapiEvent } from "@/lib/campaigns/meta-capi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/integracoes/teste
 *
 * Manda UM evento com `test_event_code` para a aba "Testar eventos" do
 * Gerenciador. É o único jeito de o lojista saber que o token funciona sem
 * esperar um clique real — e sem sujar o pixel: evento de teste não entra na
 * otimização da campanha.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { campaign } = await resolveBulkCampaign(req, slug);
    const i = readIntegracoes(campaign.metadata as Record<string, unknown>);

    if (!i.meta.pixel_id) return Response.json({ error: "Configure o ID do pixel antes de testar." }, { status: 400 });
    if (!i.meta.capi_token) return Response.json({ error: "Configure o token da API de Conversões antes de testar." }, { status: 400 });
    if (!i.meta.test_code) {
      return Response.json(
        { error: "Informe o código de teste que aparece na aba \"Testar eventos\" do Gerenciador." },
        { status: 400 },
      );
    }

    const r = await sendCapiEvent({
      pixelId: i.meta.pixel_id,
      token: i.meta.capi_token,
      payload: buildCapiPayload({
        eventName: i.meta.evento,
        eventId: crypto.randomUUID(),
        eventTimeMs: Date.now(),
        sourceUrl: new URL(req.url).origin + `/r/${slug}`,
        clientIp: null,
        userAgent: req.headers.get("user-agent") ?? "",
        fbclid: null,
        fbp: null,
        campaignName: campaign.name,
        groupId: null,
        testCode: i.meta.test_code,
      }),
    });

    if (!r.ok) return Response.json({ error: r.error ?? "A Meta recusou o evento." }, { status: 400 });
    return Response.json({ events_received: r.eventsReceived ?? 0 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: "Não deu para enviar o teste." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: sem erro.

- [ ] **Step 3: Conferir que a rota está atrás de autenticação**

Run: `cd "$W" && grep -n "allowEngine" apps/web/src/lib/groups/bulk-request.ts`
Expected: `allowEngine: false` — rota de painel, o worker não entra. Sem sessão o
`getRouteTenantContext` já devolve 401/403 antes de qualquer leitura.

- [ ] **Step 4: Commit**

```bash
git -C "$W" add "apps/web/src/app/api/campanhas/[slug]/integracoes/teste/route.ts"
git -C "$W" commit -m "feat(campanhas): rota de evento de teste da API de Conversoes"
```

---

### Task 8: Aba "Integrações" + chip do pixel + prévia da tela

**Files:**
- Create: `apps/web/src/components/painel/campanhas/integracoes-form.tsx`
- Create: `apps/web/src/components/painel/campanhas/entrada-preview.tsx`
- Modify: `apps/web/src/components/painel/campaign-config.tsx` (SECTIONS, estado, salvar, render)
- Modify: `apps/web/src/components/painel/campanhas/config-chips.tsx` (chip do pixel)

**Interfaces:**
- Consumes: `IntegracoesPublicas` (Task 6, forma que vem do GET); `EVENTOS_PADRAO` (Task 1);
  `renderEntryPage` com `preview: true` (Task 3).
- Produces:
  - `<IntegracoesForm value onChange onTestar />` — `value: IntegracoesFormValue`
  - `type IntegracoesFormValue = IntegracoesPublicas & { capi_token_novo?: string }`
    (o campo digitado; `undefined` = não mexeu, `""` = apagar)
  - `<EntradaPreview loja campaignName groupName />`

- [ ] **Step 1: Criar a prévia**

Crie `apps/web/src/components/painel/campanhas/entrada-preview.tsx`:

```tsx
"use client";

import { renderEntryPage } from "@/lib/campaigns/entry-page";

/**
 * A MESMA função que serve o /r/, com `preview: true` — sem script nenhum, para
 * o painel não disparar Lead falso no pixel do lojista. Um <iframe srcDoc> não
 * herda a CSP da página, então "sem nonce" não bastaria: os scripts têm de não
 * existir no HTML.
 */
export function EntradaPreview({ loja, campaignName, groupName }: { loja: string; campaignName: string; groupName: string | null }) {
  const html = renderEntryPage({
    loja: loja || "Sua loja",
    campaignName: campaignName || "sua campanha",
    groupName,
    httpsUrl: "https://chat.whatsapp.com/EXEMPLO",
    deepLinkUrl: null,
    nonce: null,
    preview: true,
  });
  return (
    <div className="rounded-2xl border border-aco/10 bg-poco p-3">
      <p className="mb-2 font-data text-[11px] uppercase tracking-[0.08em] text-aco/55">Prévia da tela</p>
      <iframe
        title="Prévia da tela de entrada"
        srcDoc={html}
        sandbox=""
        className="h-[380px] w-full rounded-xl border-0 bg-white"
      />
    </div>
  );
}
```

- [ ] **Step 2: Criar a aba Integrações**

Crie `apps/web/src/components/painel/campanhas/integracoes-form.tsx`. Um card por serviço,
etiqueta de estado à direita, texto curto sob cada campo:

```tsx
"use client";

import { useState } from "react";
import { EVENTOS_PADRAO } from "@/lib/campaigns/settings";
import type { IntegracoesPublicas } from "@/app/api/campanhas/apresenta";

export type IntegracoesFormValue = IntegracoesPublicas & { capi_token_novo?: string };

/** `recebendo eventos` só quando dá para MEDIR de verdade: pixel + token. */
export function etiquetaMeta(v: IntegracoesFormValue): "recebendo eventos" | "sem token" | "não configurado" {
  if (!v.meta.pixel_id) return "não configurado";
  const temToken = v.capi_token_novo ? true : v.capi_token_novo === "" ? false : v.meta.capi_token_set;
  return temToken ? "recebendo eventos" : "sem token";
}

const CAMPO = "w-full rounded-xl border border-aco/15 bg-white px-3 py-2 text-sm text-volt-950 outline-none focus:border-cobalt-500";
const DICA = "mt-1 text-xs text-aco/60";

function Card({ titulo, etiqueta, children }: { titulo: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-aco/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-volt-950">{titulo}</h3>
        <span className="font-data text-[11px] uppercase tracking-[0.08em] text-aco/55">{etiqueta}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function IntegracoesForm({
  value,
  onChange,
  onTestar,
}: {
  value: IntegracoesFormValue;
  onChange: (v: IntegracoesFormValue) => void;
  onTestar: () => Promise<{ ok: boolean; mensagem: string }>;
}) {
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const meta = (p: Partial<IntegracoesFormValue["meta"]>) => onChange({ ...value, meta: { ...value.meta, ...p } });
  const personalizado = !EVENTOS_PADRAO.includes(value.meta.evento as (typeof EVENTOS_PADRAO)[number]);

  return (
    <div className="space-y-4">
      <Card titulo="Meta (Facebook e Instagram)" etiqueta={etiquetaMeta(value)}>
        <label className="block">
          <span className="text-sm text-volt-950">ID do pixel</span>
          <input className={CAMPO} value={value.meta.pixel_id} inputMode="numeric"
            onChange={(e) => meta({ pixel_id: e.target.value.trim() })} />
          <p className={DICA}>Só números. Está no Gerenciador de Eventos, ao lado do nome do pixel.</p>
        </label>

        <label className="block">
          <span className="text-sm text-volt-950">Evento de conversão</span>
          <select className={CAMPO} value={personalizado ? "__outro" : value.meta.evento}
            onChange={(e) => meta({ evento: e.target.value === "__outro" ? "" : e.target.value })}>
            {EVENTOS_PADRAO.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            <option value="__outro">Outro nome…</option>
          </select>
          {personalizado && (
            <input className={`${CAMPO} mt-2`} value={value.meta.evento} placeholder="EntrouNoGrupo"
              onChange={(e) => meta({ evento: e.target.value.trim() })} />
          )}
          <p className={DICA}>É o evento que a Meta usa para otimizar o anúncio. Na dúvida, deixe Lead.</p>
        </label>

        <label className="block">
          <span className="text-sm text-volt-950">Token da API de Conversões</span>
          <input className={CAMPO} type="password" autoComplete="off"
            placeholder={value.meta.capi_token_set ? `Guardado · termina em ${value.meta.capi_token_last4}` : "Cole o token aqui"}
            value={value.capi_token_novo ?? ""}
            onChange={(e) => onChange({ ...value, capi_token_novo: e.target.value })} />
          <p className={DICA}>
            Sem ele, quem bloqueia rastreamento no celular some da conta.{" "}
            {value.meta.capi_token_set && "Deixe em branco para manter o token atual."}
          </p>
          {value.meta.capi_token_set && (
            <button type="button" className="mt-2 text-xs text-erro underline"
              onClick={() => onChange({ ...value, capi_token_novo: "" })}>
              Apagar token guardado
            </button>
          )}
        </label>

        <label className="block">
          <span className="text-sm text-volt-950">Código de teste</span>
          <input className={CAMPO} value={value.meta.test_code}
            onChange={(e) => meta({ test_code: e.target.value.trim() })} />
          <p className={DICA}>Opcional. Copie da aba "Testar eventos" do Gerenciador para conferir a ligação.</p>
        </label>

        <div className="flex items-center gap-3">
          <button type="button" disabled={testando}
            className="rounded-xl bg-poco px-3 py-2 text-sm font-medium text-volt-950 disabled:opacity-50"
            onClick={async () => {
              setTestando(true);
              setResultado(null);
              try { setResultado(await onTestar()); } finally { setTestando(false); }
            }}>
            {testando ? "Enviando…" : "Enviar teste"}
          </button>
          {resultado && (
            <span role="status" className={`text-xs ${resultado.ok ? "text-sucesso" : "text-erro"}`}>
              {resultado.mensagem}
            </span>
          )}
        </div>

        <p className="rounded-xl bg-poco px-3 py-2 text-xs text-aco/70">
          Lead registrado mesmo com deep link — o evento sai antes de o WhatsApp abrir.
        </p>
      </Card>

      <Card titulo="Google Analytics 4" etiqueta={value.ga4.id ? "recebendo eventos" : "não configurado"}>
        <label className="block">
          <span className="text-sm text-volt-950">ID de medição (GA4)</span>
          <input className={CAMPO} value={value.ga4.id} placeholder="G-XXXXXXX"
            onChange={(e) => onChange({ ...value, ga4: { id: e.target.value.trim() } })} />
          <p className={DICA}>Registra um `generate_lead` a cada entrada.</p>
        </label>
      </Card>

      <Card titulo="Google Ads" etiqueta={value.google_ads.id && value.google_ads.label ? "recebendo eventos" : "não configurado"}>
        <label className="block">
          <span className="text-sm text-volt-950">ID de conversão (Google Ads)</span>
          <input className={CAMPO} value={value.google_ads.id} placeholder="AW-000000000"
            onChange={(e) => onChange({ ...value, google_ads: { ...value.google_ads, id: e.target.value.trim() } })} />
        </label>
        <label className="block">
          <span className="text-sm text-volt-950">Rótulo de conversão</span>
          <input className={CAMPO} value={value.google_ads.label}
            onChange={(e) => onChange({ ...value, google_ads: { ...value.google_ads, label: e.target.value.trim() } })} />
          <p className={DICA}>Os dois vêm juntos quando você cria a conversão no Google Ads. Sem o rótulo não conta.</p>
        </label>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Ligar no `campaign-config.tsx`**

1. `SECTIONS` (linha ~56) na edição vira:

```ts
  const SECTIONS = mode === "create" ? ["Objetivo", "Cadastro", "Grupos"] : ["Cadastro", "Grupos", "Entrada", "Integrações"];
```

2. Estado novo, ao lado do `entrada`:

```tsx
  const [integracoes, setIntegracoes] = useState<IntegracoesFormValue>(INTEGRACOES_FORM_VAZIO);
```
com

```ts
const INTEGRACOES_FORM_VAZIO: IntegracoesFormValue = {
  meta: { pixel_id: "", evento: "Lead", test_code: "", capi_token_set: false, capi_token_last4: "" },
  ga4: { id: "" },
  google_ads: { id: "", label: "" },
};
```

3. No carregamento (perto de `setEntrada(c.settings?.entrada ?? ENTRADA_DEFAULTS)`):

```ts
          setIntegracoes(c.settings?.integracoes ?? INTEGRACOES_FORM_VAZIO);
```

4. No leitor de `?aba=` (linha ~131), acrescente:

```ts
          const aba = new URLSearchParams(window.location.search).get("aba");
          if (aba === "entrada") setIdx(2);
          if (aba === "integracoes") setIdx(3);
```

5. No corpo do salvar, junto do `settings: { entrada }`, mande também:

```ts
        settings: {
          entrada,
          integracoes: {
            meta: {
              pixel_id: integracoes.meta.pixel_id,
              evento: integracoes.meta.evento,
              test_code: integracoes.meta.test_code,
              // Omitir = manter o token do banco. Só vai quando o usuário digitou
              // algo (ou pediu para apagar, mandando "").
              ...(integracoes.capi_token_novo === undefined ? {} : { capi_token: integracoes.capi_token_novo }),
            },
            ga4: integracoes.ga4,
            google_ads: integracoes.google_ads,
          },
        },
```

6. Render da aba nova (ao lado do `<EntradaForm …/>`):

```tsx
      {SECTIONS[idx] === "Integrações" && (
        <IntegracoesForm
          value={integracoes}
          onChange={setIntegracoes}
          onTestar={async () => {
            const res = await fetch(`/api/campanhas/${slug}/integracoes/teste`, { method: "POST" });
            const j = (await res.json().catch(() => ({}))) as { events_received?: number; error?: string };
            return res.ok
              ? { ok: true, mensagem: `A Meta recebeu ${j.events_received ?? 0} evento(s) de teste.` }
              : { ok: false, mensagem: j.error ?? "Não deu para enviar." };
          }}
        />
      )}
```
**Salve antes de testar:** o botão manda o que está no BANCO, não o que está na tela. Se
`integracoes.capi_token_novo !== undefined`, desabilite o "Enviar teste" com o aviso
"Salve as alterações antes de testar."

7. Prévia ao lado da aba Entrada (pendência que o PR A deixou):

```tsx
      {SECTIONS[idx] === "Entrada" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <EntradaForm value={entrada} onChange={setEntrada} pages={pages} />
          <EntradaPreview loja={loja} campaignName={name} groupName={null} />
        </div>
      )}
```

- [ ] **Step 4: Chip do pixel**

`chipLabels` hoje devolve `string[]` a partir só da `EntradaSettings`. Acrescente um segundo
parâmetro **opcional** — assim nenhuma chamada existente quebra — e o chip que a spec pede:

```tsx
import type { EntradaSettings, Integracoes } from "@/lib/campaigns/settings";

/** Rótulos EXATOS — a E2E casa por eles. */
export function chipLabels(e: EntradaSettings, i?: { meta: { pixel_id: string } }): string[] {
  const lotado = e.lotado.modo === "aviso" ? "aviso" : e.lotado.modo === "pagina" ? "lista de espera" : "outro link";
  const chips = [
    `Deep link · ${e.deep_link ? "ligado" : "desligado"}`,
    `1 grupo por pessoa · ${e.um_grupo_por_pessoa ? "ligado" : "desligado"}`,
    `Lotado · ${lotado}`,
  ];
  if (e.encerra_em) {
    const [, m, d] = e.encerra_em.split("-");
    chips.splice(2, 0, `Encerra em ${d}/${m}`);
  }
  // O pixel entra por último: é a configuração que o lojista confere depois de
  // subir o anúncio, não a que ele olha todo dia.
  if (i) chips.push(`Pixel · ${i.meta.pixel_id ? `…${i.meta.pixel_id.slice(-4)}` : "não configurado"}`);
  return chips;
}
```

E no componente, repasse a prova nova (também opcional):

```tsx
export function ConfigChips({
  entrada,
  integracoes,
  href,
}: {
  entrada: EntradaSettings;
  integracoes?: { meta: { pixel_id: string } };
  href: string;
}) {
  // …chipLabels(entrada, integracoes).map(…) — o resto do componente não muda.
```

Quem renderiza o `<ConfigChips …/>` (página da campanha) passa a mandar
`integracoes={campanha.settings.integracoes}`. O tipo aceito é estrutural de propósito: a
página recebe a forma **pública** (`IntegracoesPublicas`, sem `capi_token`), não a `Integracoes`
do servidor.

**Não existe** `config-chips.test.ts` — o PR A cobriu os rótulos pela E2E, com o espelho
`chipsEsperados` dentro de `painel-campanha-entrada.spec.ts`. Crie o teste unitário agora, que é
mais barato que uma rodada de Playwright para três strings:

```ts
// apps/web/src/components/painel/campanhas/config-chips.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { ENTRADA_DEFAULTS } from "@/lib/campaigns/settings";
import { chipLabels } from "./config-chips";

test("chip do pixel: últimos 4 quando configurado, aviso quando não", () => {
  assert.equal(chipLabels(ENTRADA_DEFAULTS).length, 3, "sem integrações o chip não aparece");
  assert.ok(chipLabels(ENTRADA_DEFAULTS, { meta: { pixel_id: "1234563456" } }).includes("Pixel · …3456"));
  assert.ok(chipLabels(ENTRADA_DEFAULTS, { meta: { pixel_id: "" } }).includes("Pixel · não configurado"));
});
```
Se o padrão de `src/**/*.test.ts` não pegar componente `.tsx`, confira como os outros testes de
componente do repo são nomeados e siga o mesmo — não invente um runner novo.

- [ ] **Step 5: Lint, typecheck e suíte**

Run: `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json && npm run web:lint 2>&1 | tail -3 && npm --workspace apps/web test 2>&1 | tail -6`
Expected: sem erro de tipo, lint limpo, `fail 0`.

- [ ] **Step 6: Conferir que o componente CHEGA na tela**

Run: `cd "$W" && git grep -n "IntegracoesForm\|EntradaPreview" -- apps/web/src/app apps/web/src/components`
Expected: cada um aparece no `campaign-config.tsx`, que é renderizado por
`apps/web/src/app/painel/campanhas/[slug]/editar/page.tsx`. Componente que só existe no
próprio arquivo nunca chega ao usuário.

- [ ] **Step 7: Commit**

```bash
git -C "$W" add apps/web/src/components/painel/campanhas/integracoes-form.tsx apps/web/src/components/painel/campanhas/entrada-preview.tsx apps/web/src/components/painel/campaign-config.tsx apps/web/src/components/painel/campanhas/config-chips.tsx
git -C "$W" commit -m "feat(campanhas): aba Integracoes, chip do pixel e previa da tela de entrada"
```

---

### Task 9: E2E — salvar Integrações e ver o servidor confirmar

**Files:**
- Create: `apps/web/e2e/painel-campanha-integracoes.spec.ts`

**Interfaces:**
- Consumes: os nomes exatos dos campos (Global Constraints) e o formato do GET (Task 6).
- Produces: nada.

**Padrão obrigatório** (memória `pattern-e2e-contraste-api-x-tela`): âncora + contraste
derivado em runtime. Nunca número fixo, nunca "espera 2 s".

- [ ] **Step 1: Escrever a spec**

Crie `apps/web/e2e/painel-campanha-integracoes.spec.ts`:

Mesmo esqueleto do `painel-campanha-entrada.spec.ts`: `./sessao-helpers` (não existe
`e2e/helpers.ts`), campanha criada e apagada pelo próprio spec, `storageState` no lugar de um
`login()`.

```ts
import { expect, test } from "@playwright/test";
import { ESTADO_LOGADO, coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Aba Integrações das configurações da campanha.
 *
 * Contraste API × tela: grava pela TELA, lê pela API. O valor novo é DERIVADO do
 * que o servidor devolveu antes — literal fixo passa hoje e colide amanhã com
 * outra rodada. E cobra o que mais importa aqui: o token nunca volta inteiro.
 */

type IntegracoesPublicas = {
  meta: { pixel_id: string; evento: string; test_code: string; capi_token_set: boolean; capi_token_last4: string };
  ga4: { id: string };
  google_ads: { id: string; label: string };
};
type Campanha = { id: string; slug?: string; settings?: { integracoes: IntegracoesPublicas } };

test.use({ storageState: ESTADO_LOGADO });

// Montado em pedaços de propósito: o scan de secrets do verify-local pega
// literal que parece token do Meta (ver finding-scan-secrets-pega-fixture).
const TOKEN_FALSO = "EAA" + "tokendeteste" + "XY99";

test.describe("integrações da campanha", () => {
  exigeCredenciais();

  test("salva pela tela, persiste no servidor e o token nunca volta", async ({ page }) => {
    const falhasDeApi = coletarFalhasDeApi(page);
    const nome = `E2E integracoes ${Date.now().toString(36)}`;
    const criada = await page.request.post("/api/campanhas", { data: { name: nome } });
    expect(criada.ok(), `POST /api/campanhas respondeu ${criada.status()}`).toBeTruthy();
    const campanha = (await criada.json()) as Campanha;
    const chave = campanha.slug ?? campanha.id;

    try {
      // ÂNCORA: o que o servidor diz ANTES. Tudo depois é derivado disto.
      const pixelAntes = campanha.settings?.integracoes.meta.pixel_id ?? "";
      const pixelNovo = pixelAntes === "1234567890" ? "1234567891" : "1234567890";

      await page.goto(`/painel/campanhas/${chave}/editar?aba=integracoes`);
      await page.getByLabel("ID do pixel").fill(pixelNovo);
      await page.getByLabel("Token da API de Conversões").fill(TOKEN_FALSO);
      await page.getByLabel("ID de medição (GA4)").fill("G-E2E12345");
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await page.waitForURL(new RegExp(`/painel/campanhas/${chave}$`));

      // CONTRASTE: o servidor mudou exatamente o que a tela mandou.
      const lista = (await (await page.request.get("/api/campanhas")).json()) as Campanha[];
      const depois = lista.find((c) => c.id === campanha.id)!;
      const i = depois.settings!.integracoes;
      expect(i.meta.pixel_id).toBe(pixelNovo);
      expect(i.ga4.id).toBe("G-E2E12345");

      // O token existe, mas o GET só admite os 4 últimos.
      expect(i.meta.capi_token_set).toBe(true);
      expect(i.meta.capi_token_last4).toBe("XY99");
      expect(JSON.stringify(depois)).not.toContain(TOKEN_FALSO.slice(0, 12));

      // O chip do cabeçalho reflete o SERVIDOR, não o estado local do formulário.
      await expect(page.getByText(`Pixel · …${pixelNovo.slice(-4)}`)).toBeVisible();
    } finally {
      await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
    }
    expect(falhasDeApi, "nenhuma chamada de API pode ter falhado").toEqual([]);
  });

  test("pixel inválido é recusado pelo servidor com o campo no erro", async ({ page }) => {
    const criada = await page.request.post("/api/campanhas", { data: { name: `E2E integracoes 400 ${Date.now().toString(36)}` } });
    const campanha = (await criada.json()) as Campanha;
    try {
      const res = await page.request.patch("/api/campanhas", {
        data: {
          id: campanha.id,
          settings: {
            entrada: { deep_link: true, um_grupo_por_pessoa: true, encerra_em: null, lotado: { modo: "aviso" } },
            integracoes: {
              meta: { pixel_id: "abc", evento: "Lead", test_code: "" },
              ga4: { id: "" },
              google_ads: { id: "", label: "" },
            },
          },
        },
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toContain("meta.pixel_id");
    } finally {
      await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
    }
  });
});
```

- [ ] **Step 2: Rodar**

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\config-grupos-campanha\apps\web"
$env:E2E_BASE_URL = "http://localhost:3100"
npx playwright test e2e/painel-campanha-integracoes.spec.ts
```
Expected: 2 passed. Rode **duas vezes seguidas** — o valor derivado tem de alternar sem quebrar.
(Memória `finding-e2e-mutacao-servidor-errado`: se `reuseExistingServer` pegar um servidor órfão
noutra porta, o teste mede o app errado. Confirme que o 3100 é o desta worktree.)

- [ ] **Step 3: Commit**

```bash
git -C "$W" add apps/web/e2e/painel-campanha-integracoes.spec.ts
git -C "$W" commit -m "test(campanhas): e2e da aba Integracoes com contraste API x tela"
```

---

### Task 10: Gate local, PR, CI, quadro, merge

**Files:** nenhum novo. (`apply-order.txt` e `schema-baseline.json` não mudam: sem migração.)

- [ ] **Step 1: Suíte inteira + os dois tsc + lint**

Run: `cd "$W" && npm --workspace apps/web test 2>&1 | tail -6 && npx tsc --noEmit -p apps/web/tsconfig.json && npx tsc --noEmit -p apps/worker/tsconfig.json && npm run web:lint 2>&1 | tail -3`
Expected: `fail 0`, sem erro de tipo, lint limpo.
(Memória `finding-lint-e-tsx-test-nao-checam-tipo`: os dois `tsc` são obrigatórios; nenhum dos
outros dois comandos checa tipo.)

- [ ] **Step 2: Gate real do CI** (ferramenta PowerShell, não Bash):

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\config-grupos-campanha"; powershell -ExecutionPolicy Bypass -File infra\scripts\verify-local.ps1
```
Expected: termina com `Verificacao local concluida com sucesso.`
O token fake da E2E já é montado em pedaços na Task 9 justamente para não disparar o scan de
secrets (memória `finding-scan-secrets-pega-fixture`). Se mesmo assim disparar, quebre a string
em mais pedaços — nunca afrouxe o scanner.

- [ ] **Step 3: Rebase e push**

```bash
git -C "$W" fetch origin main
git -C "$W" rebase origin/main
git -C "$W" push -u origin feat/config-campanha-integracoes
```

- [ ] **Step 4: Abrir o PR**

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/config-campanha-integracoes --title "feat(campanhas): integracoes da campanha - pixel, API de Conversoes, GA4 e Google Ads" --body "$(cat <<'EOF'
## O que muda

- **Configurações da campanha** ganha a aba **Integrações**: pixel do Meta com evento escolhido, token da API de Conversões (write-only), código e botão de **Enviar teste**, GA4 e Google Ads. Um card por serviço, com etiqueta de estado (`recebendo eventos` / `sem token` / `não configurado`).
- **`/r/<slug>`** dispara o pixel com o evento escolhido e manda o mesmo evento pela **API de Conversões** em `after()`, com **`event_id` compartilhado** — é isso que faz a Meta deduplicar navegador × servidor em vez de contar Lead dobrado. GA4 (`generate_lead`) e Google Ads (`conversion`) entram no mesmo intersticial.
- **CSP** do `/r/` ganha os hosts do Google (script, img e connect).
- **Prévia da tela** ao lado da aba Entrada — a pendência que o PR A deixou.
- Dados em `campaign_groups.metadata.settings.integracoes` — **sem migração**.

Spec: `docs/superpowers/specs/2026-09-02-config-grupos-campanha-design.md` (PR B do fatiamento). Plano: `docs/superpowers/plans/2026-09-02-config-campanha-integracoes.md`.

## Segurança

O `capi_token` é **write-only**: o GET devolve só `capi_token_set` e os 4 últimos caracteres. Enviar `""` apaga; omitir mantém. Teste cobre os dois lados, e a E2E confere que o token não aparece na resposta.

## Como foi verificado

- Unitário: `settings` (parse tolerante, patch estrito, máscara, merge do token), `meta-capi` (fbc só com fbclid, tempo em segundos, token no corpo, erro não lança), `entry-page` (nonce em todo script, `eventID`, `send_to`, prévia sem script), `csp`, `decisao` do `/r/`.
- Mutantes mortos: `mergeIntegracoes` sem distinguir omitido de vazio; `event_time` em ms.
- E2E `painel-campanha-integracoes.spec.ts`: grava pela tela, lê pela API, chip reflete, token não volta.

## Fora deste PR

Revisar links (PR C) e remover pessoas (PR D). GTM, TikTok e GA4 server-side seguem fora de escopo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: CI e merge**

```bash
gh pr checks <N> --repo codingB0y/Girumo --watch
gh pr merge <N> --repo codingB0y/Girumo --squash --delete-branch
```
Se `gh` for recusado pelo classificador na ferramenta Bash, rode os mesmos comandos pela
ferramenta PowerShell (memória `finding-classificador-bloqueia-merge-e-ddl`).

- [ ] **Step 6: Quadro (produção)**

Crie o card ao COMEÇAR o PR B (memória `feedback-quadro-atualizar-ao-comecar`) e mova ao mergear:

```sql
-- no começo:
select public.move_card('campanhas-config-integracoes', 'em_construcao', 'PR B: aba Integracoes, CAPI, GA4 e Google Ads', 'plano 2026-09-02-config-campanha-integracoes.md');
-- ao mergear:
select public.move_card('campanhas-config-integracoes', 'no_ar_nao_verificado', 'PR B mergeado: aba Integracoes + CAPI deduplicado no /r/', 'PR #<N>');
```

- [ ] **Step 7: Verificação manual em produção** (é o que autoriza `no_ar_verificado`)

1. Configurar pixel + token numa campanha real e clicar em **Enviar teste**; ver o evento
   aparecer na aba "Testar eventos" do Gerenciador de Eventos.
2. Clicar num anúncio real (URL com `fbclid`) e confirmar, no Gerenciador, **um** Lead —
   com a origem marcada como navegador **e** servidor (dedup funcionando), não dois.

Só com essas duas provas colhidas na hora:

```sql
select public.move_card('campanhas-config-integracoes', 'no_ar_verificado', 'evento de teste recebido e Lead deduplicado no Gerenciador', 'print do Gerenciador de Eventos <data>');
```

---

## Self-review (feito ao escrever)

- **Cobertura da spec (PR B):** D5 (Meta, GA4, Google Ads; GTM e TikTok fora) → Tasks 1/3/8 ·
  D6 (evento padrão Lead + seletor com Contact, CompleteRegistration e nome próprio) → Tasks 1/8 ·
  "API de Conversões" (payload exato, timeout 3 s, falha só loga, `BOT_UA` sem CAPI, versão em
  constante, botão Enviar teste devolvendo `events_received`) → Tasks 2/5/7 · `capi_token`
  write-only + máscara → Tasks 1/6 · regex de `pixel_id`/`ga4.id`/`google_ads.*` → Task 1 ·
  pixel da campanha ganha do `tracked_links.metadata.pixelId` → Task 5 · scripts com nonce no
  intersticial → Task 3 · CSP com hosts do Google → Task 4 · Interface (card por serviço,
  etiquetas, aviso "Lead registrado mesmo com deep link", chip `Pixel · …3456`) → Task 8 ·
  prévia da tela → Tasks 3/8 · testes unit/integração/E2E e o mutante → Tasks 1–9.
- **Herança do PR A conferida:** `readEntrada`/`ENTRADA_DEFAULTS`/`withEntrada` (Task 6),
  `renderEntryPage` (Task 3 muda a assinatura e a Task 5 acompanha), `readCookie` (Task 5 usa
  para o `_fbp`), `nonceAttribute` (Task 3), `resolveBulkCampaign` (Task 7).
- **Consistência de nomes:** `readIntegracoes` / `parseIntegracoesPatch` / `mergeIntegracoes` /
  `withIntegracoes` / `maskToken` / `hasIntegracao` / `INTEGRACOES_DEFAULTS` / `EVENTOS_PADRAO`
  (Task 1) são exatamente os usados nas Tasks 5, 6, 7 e 8; `buildCapiPayload` / `sendCapiEvent` /
  `firstForwardedIp` / `GRAPH_API_VERSION` / `capiEndpoint` (Task 2) nas Tasks 5 e 7;
  `pixelDaTela` / `capiEnvio` (Task 5) só na rota; `apresentaIntegracoes` /
  `IntegracoesPublicas` (Task 6) na Task 8; `IntegracoesFormValue` / `etiquetaMeta` (Task 8) na
  Task 9.
- **Deixado de fora de propósito:** GA4 server-side (Measurement Protocol), GTM e TikTok — a
  spec põe os três fora de escopo. Fila de retentativa do CAPI: um Lead perdido por timeout de
  3 s é ruído; uma fila seria um sistema novo para um evento best-effort.
