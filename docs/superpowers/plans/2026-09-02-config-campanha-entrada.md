# Configurações da campanha — PR A (Entrada) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à campanha suas primeiras configurações de comportamento — deep link, um grupo por
pessoa, encerramento por data e destino de lotado — com aba "Entrada" na página de editar, chips de
estado, QR do link mestre e painel de ajuda, e fazer o `/r/<slug>` obedecer a tudo isso.

**Architecture:** As configurações vivem em `campaign_groups.metadata.settings.entrada` (jsonb já
existente, sem migração), lidas de forma tolerante no `/r/` e validadas estrito no PATCH. A lógica
nova mora em módulos puros testáveis com `tsx --test` (`settings.ts`, `deep-link.ts`,
`entry-page.ts`, `resolve-click-target.ts`); a rota `/r/` só liga os fios. A tela de entrada vira
um intersticial claro de 600 ms com botão sempre visível, que tenta `whatsapp://` em celular e cai
no link https.

**Tech Stack:** Next.js 15 (App Router, route handlers `nodejs`), React 19, Tailwind, Supabase
service-role via `getSupabaseAdmin`, `zod` ^4.4, `qrcode.react` ^4.2, `lucide-react` ^1.21,
testes unitários em `node:test` via `tsx`, E2E em Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-config-grupos-campanha-design.md` (este plano cobre
só o item 1 do "Fatiamento": PR A. Integrações, revisão de links e remoção são planos separados.)

## Global Constraints

- **Worktree:** todo comando roda em `C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\config-grupos-campanha`
  (abaixo, `$W`). O cwd do Bash **reseta entre chamadas**: use `git -C "$W"` e caminhos absolutos,
  ou `cd "$W/apps/web" && …` no MESMO comando. Nunca `cd` numa chamada e comando na seguinte.
- **node_modules** já estão ligados por junction (raiz e `apps/web`). Não rode `npm install`.
- **Sem migração.** Nada de coluna nova; tudo em `campaign_groups.metadata`.
- **Multi-tenant:** toda leitura/escrita em store filtra `.eq("tenant_id", …)` — o service-role
  bypassa RLS; o filtro é a proteção. As stores existentes já fazem isso; não crie query nova fora
  delas.
- **`/r/` nunca segura o visitante:** métrica, cookie e CAPI (PR B) são best-effort; falha loga e
  segue.
- **Copy em pt-BR na voz do produto** (direta, sem jargão): "Abrir direto no aplicativo do
  WhatsApp", "Um grupo por pessoa", "Encerrar automaticamente", "Quando lotar".
- **Nomes exatos** (a E2E casa por eles): switch `Abrir direto no aplicativo do WhatsApp`, switch
  `Um grupo por pessoa`, campo `Encerrar automaticamente`, rádios `Só um aviso` / `Lista de espera
  numa Página da conta` / `Mandar para outro link`, select `Página da lista de espera`, campo
  `Link de destino`, botão `Salvar alterações`, botão `Configurar`, botão `QR code`, botão `Ajuda`.
  Chips: `Deep link · ligado|desligado`, `1 grupo por pessoa · ligado|desligado`,
  `Encerra em DD/MM` (só quando há data), `Lotado · aviso|lista de espera|outro link`.
- **Testes:** unitário = `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`;
  suíte inteira = `cd "$W" && npm --workspace apps/web test`; tipos = `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json`
  **e** `npx tsc --noEmit -p apps/worker/tsconfig.json` (lint e `tsx --test` não checam tipo);
  lint = `cd "$W" && npm run web:lint`; gate real do CI = `infra/scripts/verify-local.ps1` pela
  ferramenta PowerShell (não existe `pwsh`).
- **Commits:** prefixo semântico, em inglês, com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
  Conferir `git -C "$W" diff --cached --stat` em chamada SEPARADA antes de cada commit; nunca
  `git add -A`.
- **Branch:** renomear `worktree-config-grupos-campanha` → `feat/config-campanha-entrada` antes do
  push (Task 10). Base é `origin/main` (já está em dia, 0 atrás).

---

### Task 0: Baseline da worktree

**Files:** nenhum.

- [ ] **Step 1: Provar que a suíte passa antes de mexer**

Run: `cd "$W" && npm --workspace apps/web test 2>&1 | tail -15`
Expected: última linha com `# fail 0`.

- [ ] **Step 2: Provar que os tipos fecham**

Run: `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json && npx tsc --noEmit -p apps/worker/tsconfig.json && echo TYPES_OK`
Expected: `TYPES_OK`.

Se qualquer um falhar aqui, pare e reporte — não é desta feature.

---

### Task 1: `settings.ts` — leitura tolerante, validação estrita, merge e encerramento

**Files:**
- Create: `apps/web/src/lib/campaigns/settings.ts`
- Test: `apps/web/src/lib/campaigns/settings.test.ts`

**Interfaces:**
- Produces:
  - `type LotadoDestino = { modo: "aviso" } | { modo: "pagina"; pagina_slug: string } | { modo: "url"; url: string }`
  - `type EntradaSettings = { deep_link: boolean; um_grupo_por_pessoa: boolean; encerra_em: string | null; lotado: LotadoDestino }`
  - `ENTRADA_DEFAULTS: EntradaSettings`
  - `readEntrada(metadata: Record<string, unknown> | null | undefined): EntradaSettings`
  - `parseEntradaPatch(input: unknown): { ok: true; entrada: EntradaSettings } | { ok: false; error: string }`
  - `withEntrada(metadata, entrada): Record<string, unknown>`
  - `isClosedAt(encerraEm: string | null, now: Date): boolean`
  - `isHttpsUrl(v: string): boolean`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/src/lib/campaigns/settings.test.ts
import assert from "node:assert/strict";
import {
  ENTRADA_DEFAULTS,
  isClosedAt,
  parseEntradaPatch,
  readEntrada,
  withEntrada,
} from "./settings";

// --- leitura tolerante ------------------------------------------------------

// Sem settings → tudo no padrão (deep link e um grupo por pessoa LIGADOS).
assert.deepEqual(readEntrada({ loja: "Mega" }), ENTRADA_DEFAULTS);
assert.deepEqual(readEntrada(null), ENTRADA_DEFAULTS);

// Campo válido é respeitado; campo inválido cai no padrão SÓ dele.
assert.deepEqual(
  readEntrada({ settings: { entrada: { deep_link: false, encerra_em: "31/12/2026", lotado: { modo: "url", url: "http://inseguro" } } } }),
  { deep_link: false, um_grupo_por_pessoa: true, encerra_em: null, lotado: { modo: "aviso" } },
);
assert.deepEqual(
  readEntrada({ settings: { entrada: { lotado: { modo: "pagina", pagina_slug: "lista-saldao" } } } }).lotado,
  { modo: "pagina", pagina_slug: "lista-saldao" },
);

// --- validação estrita do PATCH --------------------------------------------

const ok = parseEntradaPatch({ deep_link: true, um_grupo_por_pessoa: false, encerra_em: "2026-09-30", lotado: { modo: "url", url: "https://loja.com.br/lista" } });
assert.equal(ok.ok, true);
if (ok.ok) assert.equal(ok.entrada.lotado.modo, "url");

// Chave desconhecida é recusada (não silenciada) — evita gravar lixo no jsonb.
const extra = parseEntradaPatch({ ...ENTRADA_DEFAULTS, pixel: "123" });
assert.equal(extra.ok, false);

// URL sem https é recusada com o nome do campo.
const http = parseEntradaPatch({ ...ENTRADA_DEFAULTS, lotado: { modo: "url", url: "http://loja.com.br" } });
assert.equal(http.ok, false);
if (!http.ok) assert.match(http.error, /lotado/);

// Data fora do formato é recusada.
const data = parseEntradaPatch({ ...ENTRADA_DEFAULTS, encerra_em: "30/09/2026" });
assert.equal(data.ok, false);
if (!data.ok) assert.match(data.error, /encerra_em/);

// --- merge sem mutação ------------------------------------------------------

const antes = { loja: "Mega", settings: { outra: 1, entrada: ENTRADA_DEFAULTS } };
const depois = withEntrada(antes, { ...ENTRADA_DEFAULTS, deep_link: false });
assert.equal((depois.settings as { outra: number }).outra, 1, "preserva outras chaves de settings");
assert.equal(depois.loja, "Mega", "preserva o resto do metadata");
assert.equal(antes.settings.entrada.deep_link, true, "não muta o original");
assert.equal((depois.settings as { entrada: { deep_link: boolean } }).entrada.deep_link, false);

// --- encerramento: fim do dia em Brasília (UTC-3) ---------------------------

assert.equal(isClosedAt(null, new Date("2026-09-30T12:00:00Z")), false);
// 23:59 de 30/09 em Brasília = 02:59Z de 01/10 → ainda aberto às 02:00Z.
assert.equal(isClosedAt("2026-09-30", new Date("2026-10-01T02:00:00Z")), false);
// 03:00Z de 01/10 já passou do fim do dia 30/09 em Brasília.
assert.equal(isClosedAt("2026-09-30", new Date("2026-10-01T03:00:00Z")), true);
// Data inválida nunca fecha (o /r/ não pode morrer por dado ruim).
assert.equal(isClosedAt("lixo", new Date()), false);

console.log("settings.test ok");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/settings.test.ts`
Expected: falha com `Cannot find module './settings'`.

- [ ] **Step 3: Implementar**

```ts
// apps/web/src/lib/campaigns/settings.ts
/**
 * Configurações de comportamento da campanha (`campaign_groups.metadata.settings.entrada`).
 *
 * Duas portas, de propósito diferentes:
 *  - `readEntrada` é TOLERANTE: campo inválido cai no padrão só dele. Quem lê é
 *    o /r/, e o /r/ nunca pode morrer por causa de um jsonb estranho.
 *  - `parseEntradaPatch` é ESTRITO: é o que valida o PATCH do painel. Chave
 *    desconhecida, URL sem https ou data fora do formato são recusadas com o
 *    nome do campo, para a tela mostrar o erro no lugar certo.
 *
 * Sem `server-only`: o módulo é puro e roda em `tsx --test` e no cliente.
 */
import { z } from "zod";

export type LotadoDestino =
  | { modo: "aviso" }
  | { modo: "pagina"; pagina_slug: string }
  | { modo: "url"; url: string };

export type EntradaSettings = {
  /** Em celular, tenta abrir o app pelo esquema whatsapp:// antes do link web. */
  deep_link: boolean;
  /** Cookie por campanha lembra o grupo da primeira entrada. */
  um_grupo_por_pessoa: boolean;
  /** "AAAA-MM-DD" ou null. Fim do dia em America/Sao_Paulo. */
  encerra_em: string | null;
  lotado: LotadoDestino;
};

export const ENTRADA_DEFAULTS: EntradaSettings = Object.freeze({
  deep_link: true,
  um_grupo_por_pessoa: true,
  encerra_em: null,
  lotado: { modo: "aviso" },
}) as EntradaSettings;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const lotadoSchema = z.discriminatedUnion("modo", [
  z.strictObject({ modo: z.literal("aviso") }),
  z.strictObject({
    modo: z.literal("pagina"),
    pagina_slug: z.string().regex(PAGE_SLUG, "slug da página inválido"),
  }),
  z.strictObject({
    modo: z.literal("url"),
    url: z.string().max(2000).refine(isHttpsUrl, "só aceitamos link https://"),
  }),
]);

const entradaSchema = z.strictObject({
  deep_link: z.boolean(),
  um_grupo_por_pessoa: z.boolean(),
  encerra_em: z.string().regex(ISO_DATE, "data no formato AAAA-MM-DD").nullable(),
  lotado: lotadoSchema,
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Leitura tolerante: campo inválido cai no padrão dele, nunca derruba o /r/. */
export function readEntrada(metadata: Record<string, unknown> | null | undefined): EntradaSettings {
  const settings = isRecord(metadata?.settings) ? metadata.settings : {};
  const raw = isRecord(settings.entrada) ? settings.entrada : {};
  const lotado = lotadoSchema.safeParse(raw.lotado);
  return {
    deep_link: typeof raw.deep_link === "boolean" ? raw.deep_link : ENTRADA_DEFAULTS.deep_link,
    um_grupo_por_pessoa:
      typeof raw.um_grupo_por_pessoa === "boolean" ? raw.um_grupo_por_pessoa : ENTRADA_DEFAULTS.um_grupo_por_pessoa,
    encerra_em: typeof raw.encerra_em === "string" && ISO_DATE.test(raw.encerra_em) ? raw.encerra_em : null,
    lotado: lotado.success ? lotado.data : ENTRADA_DEFAULTS.lotado,
  };
}

/** Validação estrita do PATCH. O erro nomeia o primeiro campo errado. */
export function parseEntradaPatch(
  input: unknown,
): { ok: true; entrada: EntradaSettings } | { ok: false; error: string } {
  const result = entradaSchema.safeParse(input);
  if (result.success) return { ok: true, entrada: result.data };
  const issue = result.error.issues[0];
  const path = issue.path.map(String).join(".") || "settings.entrada";
  return { ok: false, error: `${path}: ${issue.message}` };
}

/** Metadata novo com a entrada gravada — cópia, nunca mutação. */
export function withEntrada(
  metadata: Record<string, unknown> | null | undefined,
  entrada: EntradaSettings,
): Record<string, unknown> {
  const base = isRecord(metadata) ? metadata : {};
  const settings = isRecord(base.settings) ? base.settings : {};
  return { ...base, settings: { ...settings, entrada } };
}

/**
 * Encerrou? O dia termina às 23:59:59 em Brasília. UTC-3 fixo é correto: o
 * Brasil não tem horário de verão desde 2019.
 */
export function isClosedAt(encerraEm: string | null, now: Date): boolean {
  if (!encerraEm || !ISO_DATE.test(encerraEm)) return false;
  const end = Date.parse(`${encerraEm}T23:59:59.999-03:00`);
  return Number.isFinite(end) && now.getTime() > end;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/settings.test.ts`
Expected: `settings.test ok` e `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C "$W" add apps/web/src/lib/campaigns/settings.ts apps/web/src/lib/campaigns/settings.test.ts
git -C "$W" diff --cached --stat
```
(conferir que só os dois arquivos estão no índice; então)
```bash
git -C "$W" commit -m "feat(campanhas): settings de entrada com leitura tolerante e patch estrito

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `deep-link.ts` — código do convite, esquema whatsapp://, cookie de grupo lembrado

**Files:**
- Create: `apps/web/src/lib/links/deep-link.ts`
- Test: `apps/web/src/lib/links/deep-link.test.ts`

**Interfaces:**
- Produces:
  - `inviteCode(url: string): string | null`
  - `whatsappDeepLink(url: string): string | null` → `whatsapp://chat?code=<CODE>`
  - `isMobileUa(ua: string): boolean`
  - `rememberCookieName(campaignId: string): string` → `gr_<uuid sem hífens>`
  - `readCookie(header: string | null, name: string): string | null`
  - `rememberCookieHeader(name: string, whatsappGroupId: string, slug: string, secure: boolean): string`
  - `REMEMBER_MAX_AGE_S = 7776000`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/src/lib/links/deep-link.test.ts
import assert from "node:assert/strict";
import {
  REMEMBER_MAX_AGE_S,
  inviteCode,
  isMobileUa,
  readCookie,
  rememberCookieHeader,
  rememberCookieName,
  whatsappDeepLink,
} from "./deep-link";

// Só convite do WhatsApp vira esquema; qualquer outra URL fica sem deep link.
assert.equal(inviteCode("https://chat.whatsapp.com/AbC123xyz"), "AbC123xyz");
assert.equal(inviteCode("https://chat.whatsapp.com/AbC123xyz?x=1"), null);
assert.equal(inviteCode("https://loja.com.br/grupo"), null);
assert.equal(whatsappDeepLink("https://chat.whatsapp.com/AbC123xyz"), "whatsapp://chat?code=AbC123xyz");
assert.equal(whatsappDeepLink("https://loja.com.br/grupo"), null);

// Celular sim, desktop não.
assert.equal(isMobileUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram"), true);
assert.equal(isMobileUa("Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/126"), true);
assert.equal(isMobileUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126"), false);

// Nome do cookie: por campanha, sem hífen (nome de cookie não aceita tudo).
assert.equal(rememberCookieName("6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8"), "gr_6f1a2b3c4d5e6f708192a3b4c5d6e7f8");

// Leitura do header Cookie: acha o certo no meio de outros, tolera ausência.
assert.equal(readCookie("a=1; gr_x=1203%40g.us; b=2", "gr_x"), "1203@g.us");
assert.equal(readCookie("a=1", "gr_x"), null);
assert.equal(readCookie(null, "gr_x"), null);

// Header de gravação: HttpOnly, Lax, 90 dias, path só do slug; Secure só em https.
const h = rememberCookieHeader("gr_x", "1203@g.us", "saldao", true);
assert.equal(h, `gr_x=1203%40g.us; Path=/r/saldao; Max-Age=${REMEMBER_MAX_AGE_S}; HttpOnly; SameSite=Lax; Secure`);
assert.equal(rememberCookieHeader("gr_x", "1203@g.us", "saldao", false).includes("Secure"), false);
assert.equal(REMEMBER_MAX_AGE_S, 90 * 24 * 60 * 60);

console.log("deep-link.test ok");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/deep-link.test.ts`
Expected: `Cannot find module './deep-link'`.

- [ ] **Step 3: Implementar**

```ts
// apps/web/src/lib/links/deep-link.ts
/**
 * Deep link do WhatsApp e cookie "um grupo por pessoa" — funções puras do /r/.
 *
 * `whatsapp://chat?code=<CODE>` abre o app direto em celular, sem passar pela
 * página web do WhatsApp (que, dentro do navegador do Instagram, costuma parar
 * num "baixe o WhatsApp"). Um redirect 302 do servidor para esse esquema é
 * bloqueado ou pede confirmação; por isso quem navega é a tela de entrada, com
 * fallback para o link https e botão sempre visível.
 */

const INVITE_RE = /^https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9]{6,64})$/;

export function inviteCode(url: string): string | null {
  const m = INVITE_RE.exec(url);
  return m ? m[1] : null;
}

export function whatsappDeepLink(url: string): string | null {
  const code = inviteCode(url);
  return code ? `whatsapp://chat?code=${code}` : null;
}

/** Só celular tenta o esquema: em desktop ele abre nada ou pede confirmação. */
export function isMobileUa(ua: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

/** 90 dias — o tempo de uma campanha de estação. */
export const REMEMBER_MAX_AGE_S = 90 * 24 * 60 * 60;

/** Um cookie por campanha. Sem hífen: mantém o nome dentro do charset seguro. */
export function rememberCookieName(campaignId: string): string {
  return `gr_${campaignId.replace(/-/g, "")}`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Path restrito ao slug: o cookie de uma campanha não viaja para as outras.
 * HttpOnly porque nenhum script precisa lê-lo; Lax porque o clique vem de fora.
 */
export function rememberCookieHeader(name: string, whatsappGroupId: string, slug: string, secure: boolean): string {
  const attrs = [
    `${name}=${encodeURIComponent(whatsappGroupId)}`,
    `Path=/r/${slug}`,
    `Max-Age=${REMEMBER_MAX_AGE_S}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/deep-link.test.ts`
Expected: `deep-link.test ok`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C "$W" add apps/web/src/lib/links/deep-link.ts apps/web/src/lib/links/deep-link.test.ts
git -C "$W" diff --cached --stat
git -C "$W" commit -m "feat(campanhas): deep link do WhatsApp e cookie de grupo lembrado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `resolve-click-target.ts` — encerramento, grupo lembrado, nome do grupo

**Files:**
- Modify: `apps/web/src/lib/links/resolve-click-target.ts` (tipos `ResolvableGroup`, `BlockedReason`, `ClickTarget`; função `resolveClickTarget`)
- Test: `apps/web/src/lib/links/resolve-click-target.test.ts` (acrescentar no fim)

**Interfaces:**
- Consumes: `EntradaSettings`, `ENTRADA_DEFAULTS`, `isClosedAt` de `@/lib/campaigns/settings` (Task 1).
- Produces:
  - `ResolvableGroup` ganha `name?: string`.
  - `BlockedReason` ganha `"closed"`.
  - `ClickTarget` redirect ganha `groupName?: string`.
  - `resolveClickTarget(input)` aceita, além de `link/campaign/groups`, os opcionais
    `entrada?: EntradaSettings`, `rememberedGroupId?: string | null`, `now?: Date`.

- [ ] **Step 1: Acrescentar os testes que falham** (no fim de `resolve-click-target.test.ts`)

```ts
// --- PR A: encerramento e grupo lembrado ---------------------------------------

import { ENTRADA_DEFAULTS } from "../campaigns/settings";

const masterLink = { campaign_group_id: "camp-1", target_url: "", clicks: 0, metadata: {} };
const pool = [
  group({ whatsapp_group_id: "g1@g.us", name: "Saldão 1", members: 990, capacity: 1000 }), // cheio
  group({ whatsapp_group_id: "g2@g.us", name: "Saldão 2", invite_url: "https://chat.whatsapp.com/BBB" }),
];
const campaign = { group_ids: ["g1@g.us", "g2@g.us"] };

// Sem cookie: rotação normal pula o cheio e entrega o nome do grupo.
const normal = resolveClickTarget({ link: masterLink, campaign, groups: pool, entrada: ENTRADA_DEFAULTS });
assert.equal(normal.kind, "redirect");
if (normal.kind === "redirect") {
  assert.equal(normal.groupId, "g2@g.us");
  assert.equal(normal.groupName, "Saldão 2");
}

// Grupo lembrado vence MESMO cheio (D3): quem clicou uma vez já está lá.
const lembrado = resolveClickTarget({ link: masterLink, campaign, groups: pool, entrada: ENTRADA_DEFAULTS, rememberedGroupId: "g1@g.us" });
assert.equal(lembrado.kind, "redirect");
if (lembrado.kind === "redirect") assert.equal(lembrado.groupId, "g1@g.us");

// Com a opção desligada o cookie é ignorado.
const ignorado = resolveClickTarget({ link: masterLink, campaign, groups: pool, entrada: { ...ENTRADA_DEFAULTS, um_grupo_por_pessoa: false }, rememberedGroupId: "g1@g.us" });
if (ignorado.kind === "redirect") assert.equal(ignorado.groupId, "g2@g.us");

// Grupo lembrado que saiu da campanha (ou perdeu o convite) cai na rotação.
const fora = resolveClickTarget({ link: masterLink, campaign, groups: pool, entrada: ENTRADA_DEFAULTS, rememberedGroupId: "g9@g.us" });
if (fora.kind === "redirect") assert.equal(fora.groupId, "g2@g.us");
const semConvite = resolveClickTarget({
  link: masterLink, campaign, groups: [group({ whatsapp_group_id: "g1@g.us", invite_url: null }), pool[1]],
  entrada: ENTRADA_DEFAULTS, rememberedGroupId: "g1@g.us",
});
if (semConvite.kind === "redirect") assert.equal(semConvite.groupId, "g2@g.us");

// Encerrada por data: bloqueia com "closed" antes de olhar o pool.
const fechada = resolveClickTarget({
  link: masterLink, campaign, groups: pool,
  entrada: { ...ENTRADA_DEFAULTS, encerra_em: "2026-09-30" }, now: new Date("2026-10-02T12:00:00Z"),
});
assert.deepEqual(fechada, { kind: "blocked", reason: "closed" });
// …e no dia, ainda aberta.
const noDia = resolveClickTarget({
  link: masterLink, campaign, groups: pool,
  entrada: { ...ENTRADA_DEFAULTS, encerra_em: "2026-09-30" }, now: new Date("2026-09-30T20:00:00Z"),
});
assert.equal(noDia.kind, "redirect");

// Link comum (sem campanha) nunca usa cookie nem data.
const comum = resolveClickTarget({ link: { campaign_group_id: null, target_url: "https://x.com", clicks: 0, metadata: {} }, campaign: null, groups: [], rememberedGroupId: "g1@g.us" });
assert.deepEqual(comum, { kind: "redirect", url: "https://x.com", pixelId: undefined });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/resolve-click-target.test.ts`
Expected: falha (`groupName` undefined / `closed` não bate).

- [ ] **Step 3: Implementar** — em `resolve-click-target.ts`:

Acrescentar o import no topo:
```ts
import { ENTRADA_DEFAULTS, isClosedAt, type EntradaSettings } from "@/lib/campaigns/settings";
```
(`@/` resolve em `tsx --test` como nos outros testes do projeto — `campaign-entries.ts` já importa assim.)

Alterar os tipos:
```ts
export type ResolvableGroup = {
  whatsapp_group_id: string;
  /** Nome do grupo no WhatsApp — a tela de entrada mostra "você vai entrar em …". */
  name?: string;
  members: number;
  capacity: number;
  invite_url?: string | null;
  is_admin?: boolean | null;
};

export type BlockedReason =
  | "cap-reached"
  | "empty-pool"
  | "no-invite"
  | "no-admin"
  | "all-full"
  /** Campanha passou de `encerra_em` (fim do dia em Brasília). */
  | "closed";

export type ClickTarget =
  | { kind: "redirect"; url: string; groupId?: string; groupName?: string; pixelId?: string }
  | { kind: "blocked"; reason: BlockedReason };
```

Acrescentar antes de `resolveClickTarget`:
```ts
/**
 * Grupo lembrado pelo cookie: vence MESMO lotado (quem clicou uma vez quase
 * sempre já está dentro; mandar para outro é o que fabrica duplicata). Só cai
 * na rotação se saiu da campanha, perdeu o convite ou não é mais nosso.
 */
function rememberedGroup(
  id: string | null | undefined,
  groupIds: readonly string[],
  groups: readonly ResolvableGroup[],
): ResolvableGroup | null {
  if (!id || !groupIds.includes(id)) return null;
  const g = groups.find((x) => x.whatsapp_group_id === id);
  if (!g || g.is_admin === false || !isUsableInvite(g.invite_url)) return null;
  return g;
}
```

Substituir o ramo 1 de `resolveClickTarget` por:
```ts
export function resolveClickTarget(input: {
  link: ResolvableLink;
  campaign: { group_ids: string[] } | null;
  groups: readonly ResolvableGroup[];
  entrada?: EntradaSettings;
  rememberedGroupId?: string | null;
  now?: Date;
}): ClickTarget {
  const { link, campaign, groups } = input;

  // 1) Link MESTRE de campanha → grupo lembrado ou próximo disponível do pool.
  if (link.campaign_group_id) {
    if (!campaign) return { kind: "blocked", reason: "empty-pool" };
    const entrada = input.entrada ?? ENTRADA_DEFAULTS;
    if (isClosedAt(entrada.encerra_em, input.now ?? new Date())) return { kind: "blocked", reason: "closed" };
    const remembered = entrada.um_grupo_por_pessoa
      ? rememberedGroup(input.rememberedGroupId, campaign.group_ids, groups)
      : null;
    const target = remembered ?? nextAvailableGroup(campaign.group_ids, groups);
    if (!target) return { kind: "blocked", reason: diagnosePool(campaign.group_ids, groups) };
    return {
      kind: "redirect",
      url: target.invite_url!,
      groupId: target.whatsapp_group_id,
      groupName: target.name,
      pixelId: readPixelId(link.metadata),
    };
  }
  // 2) … (ramo do link comum fica como está)
```

- [ ] **Step 4: Rodar e ver passar** (o arquivo inteiro, incluindo os testes antigos)

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/resolve-click-target.test.ts`
Expected: `# fail 0`.

- [ ] **Step 5: Tipos** — `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json` (a rota `/r/` ainda compila: os campos novos são opcionais).

- [ ] **Step 6: Commit**

```bash
git -C "$W" add apps/web/src/lib/links/resolve-click-target.ts apps/web/src/lib/links/resolve-click-target.test.ts
git -C "$W" diff --cached --stat
git -C "$W" commit -m "feat(campanhas): rotacao respeita grupo lembrado e encerramento por data

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `entry-page.ts` — tela de entrada, tela de lotado e destino de lotado

**Files:**
- Create: `apps/web/src/lib/campaigns/entry-page.ts`
- Test: `apps/web/src/lib/campaigns/entry-page.test.ts`

**Interfaces:**
- Consumes: `nonceAttribute` de `@/lib/security/csp` (puro), `LotadoDestino` (Task 1), `BlockedReason` (Task 3).
- Produces:
  - `renderEntryPage(i: { loja: string; campaignName: string; groupName: string | null; httpsUrl: string; deepLinkUrl: string | null; nonce: string | null; pixelId?: string }): string`
  - `renderBlockedPage(i: { loja: string; title: string; message: string }): string`
  - `lotadoRedirect(reason: BlockedReason, lotado: LotadoDestino, origin: string): string | null`
  - `LOTADO_REASONS: ReadonlySet<BlockedReason>` = `all-full`, `cap-reached`, `closed`
  - `escapeHtml(s: string): string`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/src/lib/campaigns/entry-page.test.ts
import assert from "node:assert/strict";
import { LOTADO_REASONS, lotadoRedirect, renderBlockedPage, renderEntryPage } from "./entry-page";

const base = {
  loja: "Mega <Stock>",
  campaignName: "Saldão",
  groupName: "Saldão 14",
  httpsUrl: "https://chat.whatsapp.com/AbC123xyz",
  nonce: "AAAAAAAAAAAAAAAAAAAAAA==",
};

// Com deep link: o script tenta o esquema e guarda o https como fallback; o botão aponta pro esquema.
const mobile = renderEntryPage({ ...base, deepLinkUrl: "whatsapp://chat?code=AbC123xyz" });
assert.match(mobile, /whatsapp:\/\/chat\?code=AbC123xyz/);
assert.match(mobile, /visibilityState/);
assert.match(mobile, /href="whatsapp:\/\/chat\?code=AbC123xyz"/);
assert.match(mobile, /Mega &lt;Stock&gt;/, "nome da loja escapado");
assert.match(mobile, /Saldão 14/);
assert.match(mobile, /<noscript><meta http-equiv="refresh" content="0;url=https:\/\/chat\.whatsapp\.com\/AbC123xyz">/);
// Todo <script> leva o nonce — sem ele a CSP do /r/ mata a página.
const scripts = mobile.match(/<script[^>]*>/g) ?? [];
assert.ok(scripts.length >= 1);
for (const tag of scripts) assert.match(tag, /nonce="AAAAAAAAAAAAAAAAAAAAAA=="/);

// Sem deep link: nada de esquema, o botão aponta pro https.
const desktop = renderEntryPage({ ...base, deepLinkUrl: null });
assert.doesNotMatch(desktop, /whatsapp:\/\//);
assert.match(desktop, /href="https:\/\/chat\.whatsapp\.com\/AbC123xyz"/);

// Pixel só entra quando há id — e o snippet dispara Lead.
assert.doesNotMatch(desktop, /fbevents/);
const comPixel = renderEntryPage({ ...base, deepLinkUrl: null, pixelId: "123456789" });
assert.match(comPixel, /fbq\('init','123456789'\)/);
assert.match(comPixel, /fbq\('track','Lead'\)/);

// Sem grupo nomeado a frase muda, sem "undefined".
const semNome = renderEntryPage({ ...base, groupName: null, deepLinkUrl: null });
assert.doesNotMatch(semNome, /undefined/);

// Tela de lotado/aviso: 200, loja e mensagem escapadas.
const aviso = renderBlockedPage({ loja: "Mega", title: "Grupo cheio", message: "Todos <cheios>" });
assert.match(aviso, /Todos &lt;cheios&gt;/);
assert.match(aviso, /Mega/);

// Destino de lotado: só os motivos de lotação/encerramento redirecionam.
assert.equal(lotadoRedirect("all-full", { modo: "aviso" }, "https://www.girumo.com.br"), null);
assert.equal(lotadoRedirect("all-full", { modo: "pagina", pagina_slug: "lista" }, "https://www.girumo.com.br"), "https://www.girumo.com.br/p/lista");
assert.equal(lotadoRedirect("closed", { modo: "url", url: "https://loja.com.br/x" }, "https://www.girumo.com.br"), "https://loja.com.br/x");
assert.equal(lotadoRedirect("cap-reached", { modo: "url", url: "https://loja.com.br/x" }, "https://www.girumo.com.br"), "https://loja.com.br/x");
// Campanha NÃO configurada nunca vira lista de espera (esconderia o problema do lojista).
assert.equal(lotadoRedirect("no-invite", { modo: "url", url: "https://loja.com.br/x" }, "https://www.girumo.com.br"), null);
assert.equal(lotadoRedirect("no-admin", { modo: "pagina", pagina_slug: "lista" }, "https://www.girumo.com.br"), null);
assert.equal(lotadoRedirect("empty-pool", { modo: "pagina", pagina_slug: "lista" }, "https://www.girumo.com.br"), null);
assert.deepEqual([...LOTADO_REASONS].sort(), ["all-full", "cap-reached", "closed"]);

console.log("entry-page.test ok");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts`
Expected: `Cannot find module './entry-page'`.

- [ ] **Step 3: Implementar**

```ts
// apps/web/src/lib/campaigns/entry-page.ts
/**
 * HTML das telas públicas do /r/: a de ENTRADA (intersticial de 600 ms que
 * dispara o pixel, tenta o deep link e cai no link https) e a de LOTADO/AVISO.
 *
 * Montado por concatenação, sem React, de propósito: é a única superfície
 * pública sem pré-render, e a CSP dela é por nonce — cada <script> abaixo tem
 * de carregar o atributo, senão a página morre em silêncio.
 *
 * Puro (sem `server-only`), para o `tsx --test` cobrir o HTML.
 */
import { nonceAttribute } from "@/lib/security/csp";
import type { LotadoDestino } from "@/lib/campaigns/settings";
import type { BlockedReason } from "@/lib/links/resolve-click-target";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Motivos que significam "não coube" — só eles levam ao destino de lotado. */
export const LOTADO_REASONS: ReadonlySet<BlockedReason> = new Set<BlockedReason>(["all-full", "cap-reached", "closed"]);

/**
 * Para onde mandar quem não coube. `null` = mostrar a tela de aviso. Campanha
 * NÃO configurada (sem convite, sem admin, pool vazio) nunca redireciona:
 * mostrar lista de espera ali esconderia do lojista o que ele precisa arrumar.
 */
export function lotadoRedirect(reason: BlockedReason, lotado: LotadoDestino, origin: string): string | null {
  if (!LOTADO_REASONS.has(reason)) return null;
  if (lotado.modo === "pagina") return `${origin}/p/${lotado.pagina_slug}`;
  if (lotado.modo === "url") return lotado.url;
  return null;
}

const STYLE = `body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F0E7;color:#071923;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
.card{width:100%;max-width:420px;background:#FFFEFA;border:1px solid rgba(7,25,35,.08);border-radius:20px;padding:28px 24px;box-shadow:0 18px 40px -30px rgba(7,25,35,.35)}
.loja{font:500 11px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:#52646C}
h1{font-size:26px;line-height:1.1;letter-spacing:-.02em;margin:10px 0 8px}
p{margin:0;color:#52646C;font-size:15px;line-height:1.5}
.linha{height:3px;border-radius:3px;background:#E4E0D6;overflow:hidden;margin:18px 0}
.linha i{display:block;height:100%;width:0;background:#2E66FF;border-radius:3px;animation:enche .6s ease-out forwards}
@keyframes enche{to{width:100%}}
.btn{display:flex;align-items:center;justify-content:center;padding:14px 16px;border-radius:14px;background:#25D366;color:#052E16;font-weight:700;font-size:16px;text-decoration:none}
.dica{margin-top:10px;text-align:center;font-size:12px;color:#52646C}
.rodape{margin-top:22px;display:flex;justify-content:space-between;font:500 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8A979D}
@media (prefers-reduced-motion:reduce){.linha i{animation:none;width:100%}}`;

function pixelScript(pixelId: string, nonceAttr: string): string {
  return `<script${nonceAttr}>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');fbq('track','Lead');</script>`;
}

export function renderEntryPage(i: {
  loja: string;
  campaignName: string;
  groupName: string | null;
  httpsUrl: string;
  deepLinkUrl: string | null;
  nonce: string | null;
  pixelId?: string;
}): string {
  const nonceAttr = nonceAttribute(i.nonce);
  const href = escapeHtml(i.deepLinkUrl ?? i.httpsUrl);
  const frase = i.groupName
    ? `Você vai entrar no grupo <b>${escapeHtml(i.groupName)}</b>.`
    : `Você vai entrar num grupo de <b>${escapeHtml(i.campaignName)}</b>.`;
  // JSON.stringify: as URLs viram literais JS seguros (escapa aspas, barras e <).
  const nav = `<script${nonceAttr}>(function(){var https=${JSON.stringify(i.httpsUrl)};var deep=${JSON.stringify(i.deepLinkUrl)};
setTimeout(function(){if(deep){location.href=deep;setTimeout(function(){if(document.visibilityState==="visible")location.replace(https)},1200)}else{location.replace(https)}},600)})();</script>`;
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Abrindo o WhatsApp…</title>
<style>${STYLE}</style>${i.pixelId ? pixelScript(i.pixelId, nonceAttr) : ""}</head>
<body><div class="card"><div class="loja">${escapeHtml(i.loja)}</div><h1>Abrindo o WhatsApp…</h1><p>${frase}</p>
<div class="linha"><i></i></div><a class="btn" id="abrir" href="${href}">Abrir WhatsApp</a><p class="dica">Não abriu? Toque no botão.</p>
<div class="rodape"><span>girumo</span><span>chat.whatsapp.com</span></div></div>
${nav}<noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(i.httpsUrl)}"></noscript></body></html>`;
}

/** Aviso (lotado, encerrada, não configurada) — 200 para o visitante ler, não um erro. */
export function renderBlockedPage(i: { loja: string; title: string; message: string }): string {
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(i.title)}</title>
<style>${STYLE}</style></head>
<body><div class="card">${i.loja ? `<div class="loja">${escapeHtml(i.loja)}</div>` : ""}<h1>${escapeHtml(i.title)}</h1><p>${escapeHtml(i.message)}</p>
<div class="rodape"><span>girumo</span><span></span></div></div></body></html>`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd "$W/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts`
Expected: `entry-page.test ok`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git -C "$W" add apps/web/src/lib/campaigns/entry-page.ts apps/web/src/lib/campaigns/entry-page.test.ts
git -C "$W" diff --cached --stat
git -C "$W" commit -m "feat(campanhas): tela de entrada com deep link e destino de lotado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `/r/[slug]/route.ts` — ligar settings, cookie, deep link e lotado

**Files:**
- Modify: `apps/web/src/app/r/[slug]/route.ts` (função `GET` do ramo Supabase; `BLOCKED_MESSAGE`; remover `pixelInterstitial` e `page`/`fullPage`/`notFoundPage` locais em favor de `entry-page.ts`, mantendo o ramo legado funcionando)

**Interfaces:**
- Consumes: `readEntrada`, `ENTRADA_DEFAULTS` (Task 1); `whatsappDeepLink`, `isMobileUa`, `rememberCookieName`, `readCookie`, `rememberCookieHeader` (Task 2); `resolveClickTarget` com `entrada`/`rememberedGroupId` (Task 3); `renderEntryPage`, `renderBlockedPage`, `lotadoRedirect` (Task 4).

- [ ] **Step 1: Editar a rota.** Imports novos no topo:

```ts
import { ENTRADA_DEFAULTS, readEntrada } from "@/lib/campaigns/settings";
import { lotadoRedirect, renderBlockedPage, renderEntryPage } from "@/lib/campaigns/entry-page";
import { isMobileUa, readCookie, rememberCookieHeader, rememberCookieName, whatsappDeepLink } from "@/lib/links/deep-link";
```
Remover o import de `nonceAttribute` (só a `entry-page` usa agora).

`BLOCKED_MESSAGE` ganha a linha:
```ts
  closed: "Esta campanha já encerrou. Fique de olho: em breve tem novidade. 💛",
```

Substituir o miolo do `GET` (do `const target = …` até o fim da função) por:

```ts
  const entrada = campaign ? readEntrada(campaign.metadata) : ENTRADA_DEFAULTS;
  const loja = campaign ? String((campaign.metadata as Record<string, unknown>)?.loja ?? "") : "";
  const cookieName = campaign ? rememberCookieName(campaign.id) : null;
  const rememberedGroupId = cookieName ? readCookie(req.headers.get("cookie"), cookieName) : null;
  const reqUrl = new URL(req.url);

  const target = resolveClickTarget({ link, campaign, groups, entrada, rememberedGroupId });
  if (target.kind === "blocked") {
    // Lotado/encerrada pode ir para a lista de espera; campanha não configurada
    // mostra a mensagem honesta (ver lotadoRedirect).
    const destino = lotadoRedirect(target.reason, entrada.lotado, reqUrl.origin);
    if (destino) return Response.redirect(destino, 302);
    return html(renderBlockedPage({ loja, title: "Grupo cheio", message: BLOCKED_MESSAGE[target.reason] }), 200);
  }

  if (human) {
    await Promise.allSettled([
      linksStore.incrementTrackedLinkClicks(link.id),
      linksStore.recordTrackedLinkClick(link),
    ]);
  }

  const headers = new Headers();
  // Grupo lembrado: só gente real, só campanha, só quando a opção está ligada.
  if (human && cookieName && target.groupId && entrada.um_grupo_por_pessoa) {
    headers.append("set-cookie", rememberCookieHeader(cookieName, target.groupId, slug, reqUrl.protocol === "https:"));
  }

  const deepLinkUrl = campaign && entrada.deep_link && isMobileUa(ua) ? whatsappDeepLink(target.url) : null;
  if (target.pixelId || deepLinkUrl) {
    // Tela de entrada: dispara o pixel e/ou tenta o app. Nonce da CSP desta
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
        pixelId: target.pixelId,
      }),
      { headers },
    );
  }
  headers.set("location", target.url);
  return new Response(null, { status: 302, headers });
}

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}
```

No ramo `legacyGet` e nas funções `notFoundPage`/`fullPage`/`page`/`pixelInterstitial`: trocar `page(message, status, title)` por `html(renderBlockedPage({ loja: "", title, message }), status)` e o `pixelInterstitial(pixelId, dest, nonce)` por
`html(renderEntryPage({ loja: "", campaignName: "", groupName: null, httpsUrl: dest, deepLinkUrl: null, nonce, pixelId }), 200)`.
Apagar `page`, `fullPage`, `notFoundPage` e `pixelInterstitial`; reescrever `notFoundPage` como:
```ts
function notFoundPage(): Response {
  return html(renderBlockedPage({ loja: "", title: "Link não encontrado", message: "Este link não existe ou foi desativado." }), 404);
}
```
e `fullPage(message)` como `html(renderBlockedPage({ loja: "", title: "Grupo cheio", message }), 200)` (o legado ainda chama `fullPage`).

- [ ] **Step 2: Tipos e lint**

Run: `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json && npm run web:lint 2>&1 | tail -5`
Expected: sem erro.

- [ ] **Step 3: Smoke local com uma campanha real** (dev usa Supabase; `.env.local` está em `apps/web` do checkout principal — copie para `$W/apps/web/.env.local` se ainda não existir).

Suba o dev server pela ferramenta de preview (nunca pelo Bash) — se a entrada da worktree não existir em `.claude/launch.json` do checkout principal, criar TEMPORARIAMENTE:
`{ "name": "config-campanha (worktree)", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "C:/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/config-grupos-campanha/apps/web", "run", "dev"], "port": 3100, "autoPort": true }`
e reverter depois com `git checkout -- .claude/launch.json` no principal.

Com uma campanha existente `<slug>` do tenant de QA (`GET /api/campanhas` logado lista as que existem):
```bash
curl -s -o /dev/null -D - -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" "http://localhost:3100/r/<slug>" | grep -iE "^(HTTP|set-cookie|location|content-type)"
```
Expected: `HTTP/1.1 200`, `content-type: text/html`, `set-cookie: gr_…; Path=/r/<slug>; Max-Age=7776000; HttpOnly; SameSite=Lax`.
Depois com o cookie e UA de desktop:
```bash
curl -s -o /dev/null -D - -H "cookie: gr_<id>=<grupo>" "http://localhost:3100/r/<slug>" | grep -iE "^(HTTP|location)"
```
Expected: `302` com `location: https://chat.whatsapp.com/…` do MESMO grupo. Se a campanha não tiver grupo com convite, o esperado é `200` com a tela "ainda não está aberta" — e nenhum `set-cookie`.

- [ ] **Step 4: Commit**

```bash
git -C "$W" add "apps/web/src/app/r/[slug]/route.ts"
git -C "$W" diff --cached --stat
git -C "$W" commit -m "feat(campanhas): /r/ obedece deep link, grupo lembrado, encerramento e destino de lotado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: API — `settings` no GET e no PATCH de `/api/campanhas`

**Files:**
- Modify: `apps/web/src/app/api/campanhas/route.ts` (`GET` mapping; `PATCH` ramo Supabase e resposta)

**Interfaces:**
- Consumes: `readEntrada`, `parseEntradaPatch`, `withEntrada` (Task 1); `listLandingPages(tenantId)` de `@/lib/pages/store` (`LandingPage` tem `slug` e `status: "draft" | "published" | "paused"`); `supaStore.getCampaignGroupById`.
- Produces: resposta de `GET /api/campanhas` e do `PATCH` ganham `settings: { entrada: EntradaSettings }`. `PATCH` aceita `settings: { entrada: <EntradaSettings completo> }`; 400 `{ error }` nomeando o campo; 400 `"Página não encontrada ou não publicada."` quando `lotado.modo === "pagina"` e o slug não é uma página publicada do tenant.

- [ ] **Step 1: Editar.** Imports:

```ts
import { parseEntradaPatch, readEntrada, withEntrada } from "@/lib/campaigns/settings";
import { listLandingPages } from "@/lib/pages/store";
```

No `GET`, dentro do `map`, acrescentar `settings: { entrada: readEntrada(c.metadata as Record<string, unknown>) },`.

No `PATCH` (ramo Supabase), antes de `const updated = …`:
```ts
  if (b.settings !== undefined) {
    const s = (b.settings ?? {}) as Record<string, unknown>;
    const parsed = parseEntradaPatch(s.entrada);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    if (parsed.entrada.lotado.modo === "pagina") {
      const slug = parsed.entrada.lotado.pagina_slug;
      const pages = await listLandingPages(tenantId);
      if (!pages.some((p) => p.slug === slug && p.status === "published")) {
        return Response.json({ error: "Página não encontrada ou não publicada." }, { status: 400 });
      }
    }
    // `metadata` é substituído inteiro pelo update: lê o atual para não perder `loja` e o resto.
    const current = await supaStore.getCampaignGroupById(tenantId, id);
    if (!current) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    patch.metadata = withEntrada(current.metadata as Record<string, unknown>, parsed.entrada);
  }
```
Na resposta do `PATCH`, acrescentar `settings: { entrada: readEntrada(updated.metadata as Record<string, unknown>) },`.
No ramo legado (`!USE_SUPABASE`), acima do `const patch`, um comentário: `// settings de entrada só existem no ramo Supabase — o JSON legado é emergência/dev antigo.`

- [ ] **Step 2: Tipos** — `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json`.

- [ ] **Step 3: Smoke no dev server** (logado no navegador; pegue o `id` em `/api/campanhas`). Pela ferramenta de navegador, no console da página do painel:
```js
await (await fetch("/api/campanhas", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "<id>", settings: { entrada: { deep_link: false, um_grupo_por_pessoa: true, encerra_em: null, lotado: { modo: "url", url: "http://inseguro" } } } }) })).json()
```
Expected: `{ error: "lotado.url: só aceitamos link https://" }`. Repetir com `https://exemplo.com` → resposta com `settings.entrada.lotado.url === "https://exemplo.com"` e `loja` preservada.

- [ ] **Step 4: Commit**

```bash
git -C "$W" add apps/web/src/app/api/campanhas/route.ts
git -C "$W" diff --cached --stat
git -C "$W" commit -m "feat(campanhas): API grava e devolve settings de entrada

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Aba "Entrada" em Configurações da campanha

**Files:**
- Create: `apps/web/src/components/painel/campanhas/entrada-form.tsx`
- Modify: `apps/web/src/components/painel/campaign-config.tsx` (tipo `Campanha`, `SECTIONS`, estado, `save`, seção nova, título "Configurações da campanha", `?aba=`)

**Interfaces:**
- Consumes: `EntradaSettings`, `ENTRADA_DEFAULTS`, `isHttpsUrl` (Task 1); `GET /api/pages` devolve `LandingPage[]` com `slug`, `title`, `status`.
- Produces: `EntradaForm({ value, onChange, pages }: { value: EntradaSettings; onChange: (v: EntradaSettings) => void; pages: { slug: string; title: string }[] })`.

- [ ] **Step 1: Criar `entrada-form.tsx`**

```tsx
"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { isHttpsUrl, type EntradaSettings, type LotadoDestino } from "@/lib/campaigns/settings";

type PageOption = { slug: string; title: string };

/** Dias até a data (fim do dia em Brasília); negativo = já passou. */
export function diasAte(iso: string, now = new Date()): number {
  const end = Date.parse(`${iso}T23:59:59.999-03:00`);
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[160ms]", checked ? "bg-cobalt-500" : "bg-volt-950/15")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-[160ms] ease-[var(--ease-fluxo)]", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function Setting({ title, children, control }: { title: string; children: React.ReactNode; control: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 border-t border-volt-950/[0.07] py-4 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium text-volt-950">{title}</p>
      <div className="row-span-2 flex flex-col items-end gap-1">{control}</div>
      <div className="max-w-[58ch] text-xs leading-relaxed text-aco/60">{children}</div>
    </div>
  );
}

export function EntradaForm({ value, onChange, pages }: { value: EntradaSettings; onChange: (v: EntradaSettings) => void; pages: PageOption[] }) {
  const name = useId();
  const set = (patch: Partial<EntradaSettings>) => onChange({ ...value, ...patch });
  const setLotado = (lotado: LotadoDestino) => set({ lotado });
  const dias = value.encerra_em ? diasAte(value.encerra_em) : null;
  const urlAtual = value.lotado.modo === "url" ? value.lotado.url : "";
  const urlInvalida = value.lotado.modo === "url" && urlAtual.length > 0 && !isHttpsUrl(urlAtual);

  const radio = (modo: LotadoDestino["modo"], titulo: string, desc: React.ReactNode, on: () => void) => (
    <label className={cn("grid cursor-pointer grid-cols-[18px_1fr] gap-x-3 gap-y-1 rounded-xl border p-3 transition-colors duration-[160ms]", value.lotado.modo === modo ? "border-cobalt-500 bg-cobalt-500/[0.05]" : "border-volt-950/[0.09] bg-papel hover:border-cobalt-500/30")}>
      <input type="radio" name={name} value={modo} checked={value.lotado.modo === modo} onChange={on} className="mt-0.5 accent-cobalt-500" aria-label={titulo} />
      <span className="text-sm font-medium text-volt-950">{titulo}</span>
      <span className="col-start-2 text-xs text-aco/60">{desc}</span>
    </label>
  );

  return (
    <div>
      <Setting
        title="Abrir direto no aplicativo do WhatsApp"
        control={<><Switch label="Abrir direto no aplicativo do WhatsApp" checked={value.deep_link} onChange={(v) => set({ deep_link: v })} /><span className="font-data text-[11px] text-aco/50">{value.deep_link ? "ligado" : "desligado"}</span></>}
      >
        Deep link. Quem clica no Instagram ou no Facebook vai para o app, sem passar pela página do WhatsApp na web. Em computador, segue o link normal.
      </Setting>

      <Setting
        title="Um grupo por pessoa"
        control={<><Switch label="Um grupo por pessoa" checked={value.um_grupo_por_pessoa} onChange={(v) => set({ um_grupo_por_pessoa: v })} /><span className="font-data text-[11px] text-aco/50">{value.um_grupo_por_pessoa ? "ligado" : "desligado"}</span></>}
      >
        Quem já entrou por este link volta sempre para o mesmo grupo, em vez de cair no próximo. Vale por 90 dias, no mesmo aparelho e navegador.
      </Setting>

      <Setting
        title="Encerrar automaticamente"
        control={
          <>
            <input
              type="date"
              aria-label="Encerrar automaticamente"
              value={value.encerra_em ?? ""}
              onChange={(e) => set({ encerra_em: e.target.value || null })}
              className="rounded-[10px] border border-volt-950/10 bg-poco px-3 py-2 text-sm text-volt-950 outline-none focus:border-cobalt-500/50"
            />
            {dias !== null && (
              <span className="font-data text-[11px] text-aco/50">{dias < 0 ? "encerrou" : dias === 0 ? "encerra hoje" : `faltam ${dias} dias`}</span>
            )}
          </>
        }
      >
        Depois desta data o link para de mandar gente para os grupos e mostra a tela de &ldquo;lotado&rdquo;. Em branco, nunca encerra sozinho.
      </Setting>

      <div className="border-t border-volt-950/[0.07] py-4">
        <p className="text-sm font-medium text-volt-950">Quando lotar (ou encerrar)</p>
        <p className="mb-3 mt-0.5 text-xs text-aco/60">O que o cliente vê quando não há vaga em nenhum grupo.</p>
        <div className="grid gap-2" role="radiogroup" aria-label="Quando lotar">
          {radio("aviso", "Só um aviso", <>&ldquo;Todos os grupos estão cheios. Em breve abriremos um novo.&rdquo;</>, () => setLotado({ modo: "aviso" }))}
          {radio(
            "pagina",
            "Lista de espera numa Página da conta",
            <>
              Captura nome e WhatsApp com consentimento, e o lead entra na campanha seguinte.
              {value.lotado.modo === "pagina" && (
                <select
                  aria-label="Página da lista de espera"
                  value={value.lotado.pagina_slug}
                  onChange={(e) => setLotado({ modo: "pagina", pagina_slug: e.target.value })}
                  className="mt-2 block w-full rounded-[10px] border border-volt-950/10 bg-poco px-3 py-2 text-sm text-volt-950"
                >
                  <option value="">Escolha uma página publicada…</option>
                  {pages.map((p) => <option key={p.slug} value={p.slug}>{p.title || p.slug}</option>)}
                </select>
              )}
              {value.lotado.modo === "pagina" && pages.length === 0 && <span className="mt-1 block text-atencao">Você ainda não tem página publicada. Crie uma em Páginas.</span>}
            </>,
            () => setLotado({ modo: "pagina", pagina_slug: pages[0]?.slug ?? "" }),
          )}
          {radio(
            "url",
            "Mandar para outro link",
            <>
              Seu site, seu catálogo, outra campanha.
              {value.lotado.modo === "url" && (
                <input
                  type="url"
                  aria-label="Link de destino"
                  placeholder="https://…"
                  value={urlAtual}
                  onChange={(e) => setLotado({ modo: "url", url: e.target.value })}
                  className={cn("mt-2 block w-full rounded-[10px] border bg-poco px-3 py-2 text-sm text-volt-950 outline-none", urlInvalida ? "border-alerta/60" : "border-volt-950/10 focus:border-cobalt-500/50")}
                />
              )}
              {urlInvalida && <span className="mt-1 block text-alerta">Só aceitamos link começando com https://</span>}
            </>,
            () => setLotado({ modo: "url", url: urlAtual }),
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ligar em `campaign-config.tsx`**

Imports:
```tsx
import { useSearchParams } from "next/navigation";
import { ENTRADA_DEFAULTS, isHttpsUrl, type EntradaSettings } from "@/lib/campaigns/settings";
import { EntradaForm } from "@/components/painel/campanhas/entrada-form";
```
Tipo `Campanha` ganha `settings?: { entrada: EntradaSettings };`.

`SECTIONS` no modo edit vira `["Cadastro", "Grupos", "Entrada"]`. Estado novo:
```tsx
  const [entrada, setEntrada] = useState<EntradaSettings>(ENTRADA_DEFAULTS);
  const [pages, setPages] = useState<{ slug: string; title: string }[]>([]);
  const searchParams = useSearchParams();
```
No `useEffect` de carga, no `mode === "edit"`: após `setSelected(...)`, `setEntrada(c.settings?.entrada ?? ENTRADA_DEFAULTS);` e, fora do `if (c)`, carregar páginas publicadas:
```tsx
          const pgs = await fetch("/api/pages").then((r) => r.json()).catch(() => []);
          setPages(Array.isArray(pgs) ? pgs.filter((p: { status?: string }) => p.status === "published").map((p: { slug: string; title?: string }) => ({ slug: p.slug, title: p.title ?? "" })) : []);
          if (searchParams.get("aba") === "entrada") setIdx(2);
```
(`useSearchParams` exige que a página que renderiza este componente esteja num `<Suspense>` — `apps/web/src/app/painel/campanhas/[slug]/editar/page.tsx` já é client; se o build acusar "useSearchParams() should be wrapped in a suspense boundary", envolver `<CampaignConfig …/>` em `<Suspense fallback={null}>` nessa page.)

`canAdvance` no modo edit passa a exigir entrada válida:
```tsx
  const entradaValida =
    (value => value.lotado.modo !== "url" || isHttpsUrl(value.lotado.url))(entrada) &&
    (entrada.lotado.modo !== "pagina" || entrada.lotado.pagina_slug.length > 0);
  const canAdvance = isObjetivoStep ? true : name.trim().length > 0 && (mode !== "edit" || entradaValida);
```
No `save()`, ramo edit, o body ganha `settings: { entrada }`.

Seção nova e título:
```tsx
  const entradaCard = (
    <Card key="entrada">
      <EntradaForm value={entrada} onChange={setEntrada} pages={pages} />
    </Card>
  );
  const sections = mode === "create" ? [objetivoCard, cadastroCard, gruposCard] : [cadastroCard, gruposCard, entradaCard];
```
e o `<h1>` do modo edit passa a `Configurações da campanha`.

- [ ] **Step 3: Tipos, lint, tela**

Run: `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json && npm run web:lint 2>&1 | tail -5`.
No dev server: abrir `/painel/campanhas/<slug>/editar?aba=entrada` — aba já aberta, dois switches ligados, rádio "Só um aviso" marcado. Desligar deep link, escolher "Mandar para outro link", digitar `http://x` → mensagem de erro e botão "Salvar alterações" desabilitado; corrigir para `https://x.com` → salvar → volta para a página da campanha. Recarregar `/editar?aba=entrada` → valores persistidos (vêm do servidor).

- [ ] **Step 4: Commit**

```bash
git -C "$W" add apps/web/src/components/painel/campanhas/entrada-form.tsx apps/web/src/components/painel/campaign-config.tsx
git -C "$W" diff --cached --stat
git -C "$W" commit -m "feat(campanhas): aba Entrada nas configuracoes da campanha

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Página da campanha — chips, "Configurar", QR code e Ajuda

**Files:**
- Create: `apps/web/src/components/painel/campanhas/config-chips.tsx`
- Create: `apps/web/src/components/painel/campanhas/qr-link.tsx`
- Create: `apps/web/src/components/painel/campanhas/ajuda-painel.tsx`
- Modify: `apps/web/src/app/painel/campanhas/[slug]/page.tsx` (tipo `Campanha`, imports, cabeçalho)
- Modify: `apps/web/src/components/painel/campaign-config.tsx` (botão Ajuda no cabeçalho do modo edit)

**Interfaces:**
- Consumes: `EntradaSettings` (Task 1), `QRCodeCanvas` de `qrcode.react`, ícones `Settings2`, `QrCode`, `Info`, `X` de `lucide-react` (os três primeiros conferidos na 1.21 instalada).
- Produces: `ConfigChips({ entrada, href })`, `QrLink({ url, nome })`, `AjudaPainel()`.

- [ ] **Step 1: `config-chips.tsx`**

```tsx
import Link from "next/link";
import type { EntradaSettings } from "@/lib/campaigns/settings";

/** Rótulos EXATOS — a E2E casa por eles. */
export function chipLabels(e: EntradaSettings): string[] {
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
  return chips;
}

/** Resumo do comportamento do link, no cabeçalho. Cada chip leva à aba Entrada. */
export function ConfigChips({ entrada, href }: { entrada: EntradaSettings; href: string }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Configurações de entrada">
      {chipLabels(entrada).map((label) => (
        <li key={label}>
          <Link href={href} className="pn-etiqueta bg-poco text-aco transition-colors duration-[160ms] hover:bg-cobalt-500/10 hover:text-cobalt-500">
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: `qr-link.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download, QrCode, X } from "lucide-react";

/**
 * QR do link mestre — cartaz no balcão, adesivo na sacola. Gerado no cliente
 * (`qrcode.react`), nunca por serviço externo: o link não sai da máquina.
 */
export function QrLink({ url, nome }: { url: string; nome: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  function baixar() {
    const canvas = wrap.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-volt-950/10 bg-papel px-2.5 py-1.5 text-xs font-medium text-volt-950 transition-colors duration-[160ms] hover:border-cobalt-500/30"
      >
        <QrCode className="h-3.5 w-3.5" /> QR code
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="QR code do link da campanha" className="fixed inset-0 z-40 flex items-center justify-center bg-volt-950/40 p-4" onClick={() => setOpen(false)}>
          <div className="pn-card w-full max-w-xs rounded-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-volt-950">Aponte a câmera</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-aco/60 hover:text-volt-950"><X className="h-4 w-4" /></button>
            </div>
            <div ref={wrap} className="mt-4 inline-block rounded-xl bg-white p-3">
              <QRCodeCanvas value={url} size={512} level="M" marginSize={2} bgColor="#ffffff" fgColor="#071923" style={{ width: 208, height: 208 }} />
            </div>
            <p className="font-data mt-3 break-all text-[11px] text-aco/60">{url}</p>
            <button type="button" onClick={baixar} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2 text-sm font-medium text-white hover:brightness-110">
              <Download className="h-4 w-4" /> Baixar PNG
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: `ajuda-painel.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

const CARTOES: { titulo: string; texto: string }[] = [
  { titulo: "Como divulgar o link", texto: "Cole o link da campanha na bio do Instagram, nos anúncios e no status. Ele leva cada pessoa para o grupo certo, na ordem: enche um até 95% e passa para o próximo." },
  { titulo: "Como o rodízio enche os grupos", texto: "Os grupos entram na ordem em que estão na campanha. Grupo sem convite ou onde você não é admin fica de fora. Com a criação automática ligada, a Girumo abre um grupo novo quando o último passa de 90%." },
  { titulo: "Abrir direto no aplicativo", texto: "Com o deep link ligado, quem clica no Instagram vai direto para o app do WhatsApp, sem a página \"baixe o WhatsApp\" do navegador. Em computador, o link normal continua valendo." },
  { titulo: "Quando lotar", texto: "Escolha o que a pessoa vê quando não há vaga: um aviso, uma lista de espera numa Página da conta (com consentimento) ou outro link seu. Campanha sem grupo configurado sempre mostra o aviso — para você ver o que falta." },
];

/** Painel lateral de ajuda — aberto pelo "?" em qualquer aba. Vídeos entram quando existirem. */
export function AjudaPainel() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-volt-950/10 bg-papel px-3 text-sm font-medium text-aco transition-colors duration-[160ms] hover:text-volt-950"
      >
        <Info className="h-4 w-4" /> Ajuda
      </button>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Ajuda">
          <button type="button" className="absolute inset-0 cursor-default bg-volt-950/30" onClick={() => setOpen(false)} aria-label="Fechar ajuda" />
          <aside className="hf-enter absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-papel p-6 shadow-deep">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold tracking-[-0.02em] text-volt-950">Como funciona</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-aco/60 hover:text-volt-950"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 grid gap-3">
              {CARTOES.map((c) => (
                <section key={c.titulo} className="rounded-2xl border border-volt-950/[0.08] bg-poco p-4">
                  <h3 className="text-sm font-medium text-volt-950">{c.titulo}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-aco">{c.texto}</p>
                </section>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Cabeçalho da página da campanha** (`[slug]/page.tsx`)

Tipo: `type Campanha = { …; settings?: { entrada: EntradaSettings } };` com
`import { ENTRADA_DEFAULTS, type EntradaSettings } from "@/lib/campaigns/settings";`.
Imports: `Settings2` no lugar de `Pencil` (nos dois usos), e
```tsx
import { ConfigChips } from "@/components/painel/campanhas/config-chips";
import { QrLink } from "@/components/painel/campanhas/qr-link";
import { AjudaPainel } from "@/components/painel/campanhas/ajuda-painel";
```
No bloco do título, logo abaixo do `<CopyLink …/>`:
```tsx
              {masterUrl && (
                <div className="mt-1.5 flex items-center gap-2">
                  <QrLink url={masterUrl} nome={campanha.name} />
                </div>
              )}
              <ConfigChips entrada={campanha.settings?.entrada ?? ENTRADA_DEFAULTS} href={`/painel/campanhas/${campanha.slug ?? campanha.id}/editar?aba=entrada`} />
```
Os dois `Editar` viram `<Settings2 className="h-4 w-4" /> Configurar` (o do menu com `text-aco/50` como estava). Antes do botão primário "Configurar", acrescentar `<AjudaPainel />` dentro do mesmo `div.relative.flex.gap-2`.

Em `campaign-config.tsx`, no cabeçalho (`div.flex.items-center.gap-3` com o `<h1>`), acrescentar `<div className="ml-auto"><AjudaPainel /></div>` quando `mode === "edit"`.

- [ ] **Step 5: Tipos, lint, tela**

Run: `cd "$W" && npx tsc --noEmit -p apps/web/tsconfig.json && npm run web:lint 2>&1 | tail -5`.
No dev server: página da campanha mostra os chips, "Configurar" com engrenagem, "QR code" abre o modal com QR e "Baixar PNG", "Ajuda" abre o painel e `Esc` fecha. Clicar num chip abre `/editar?aba=entrada` já na aba certa.

- [ ] **Step 6: Commit**

```bash
git -C "$W" add apps/web/src/components/painel/campanhas/config-chips.tsx apps/web/src/components/painel/campanhas/qr-link.tsx apps/web/src/components/painel/campanhas/ajuda-painel.tsx "apps/web/src/app/painel/campanhas/[slug]/page.tsx" apps/web/src/components/painel/campaign-config.tsx
git -C "$W" diff --cached --stat
git -C "$W" commit -m "feat(campanhas): chips de entrada, botao Configurar, QR do link e painel de ajuda

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: E2E — salvar Entrada e ver os chips refletirem o servidor

**Files:**
- Create: `apps/web/e2e/painel-campanha-entrada.spec.ts`

**Interfaces:**
- Consumes: `ESTADO_LOGADO`, `exigeCredenciais`, `coletarFalhasDeApi` de `./sessao-helpers`; `chipLabels` (Task 8) é reimplementado no spec de propósito (contraste API × tela, não import do app).

- [ ] **Step 1: Escrever o spec**

```ts
import { expect, test } from "@playwright/test";
import { ESTADO_LOGADO, coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Aba Entrada das configurações da campanha.
 *
 * Contraste API × tela: o spec grava pela TELA, lê pela API e cobra que os
 * chips do cabeçalho digam exatamente o que o servidor devolveu. Número ou
 * valor fixo aqui passaria hoje e quebraria amanhã por dado.
 *
 * A campanha é criada e apagada pelo próprio spec (a API tem DELETE), com nome
 * único — uma esquecida por execução anterior não se confunde com esta.
 */

type Entrada = {
  deep_link: boolean;
  um_grupo_por_pessoa: boolean;
  encerra_em: string | null;
  lotado: { modo: "aviso" } | { modo: "pagina"; pagina_slug: string } | { modo: "url"; url: string };
};
type Campanha = { id: string; slug?: string; settings?: { entrada: Entrada } };

test.use({ storageState: ESTADO_LOGADO });

const URL_DESTINO = "https://exemplo.girumo.com.br/lista-de-espera";

function chipsEsperados(e: Entrada): string[] {
  const lotado = e.lotado.modo === "aviso" ? "aviso" : e.lotado.modo === "pagina" ? "lista de espera" : "outro link";
  const chips = [`Deep link · ${e.deep_link ? "ligado" : "desligado"}`, `1 grupo por pessoa · ${e.um_grupo_por_pessoa ? "ligado" : "desligado"}`, `Lotado · ${lotado}`];
  if (e.encerra_em) {
    const [, m, d] = e.encerra_em.split("-");
    chips.splice(2, 0, `Encerra em ${d}/${m}`);
  }
  return chips;
}

test.describe("configurações de entrada da campanha", () => {
  exigeCredenciais();

  test("salva pela tela, persiste no servidor e os chips refletem", async ({ page }) => {
    const falhasDeApi = coletarFalhasDeApi(page);
    const nome = `E2E entrada ${Date.now().toString(36)}`;
    const criada = await page.request.post("/api/campanhas", { data: { name: nome } });
    expect(criada.ok(), `POST /api/campanhas respondeu ${criada.status()}`).toBeTruthy();
    const campanha = (await criada.json()) as Campanha;
    const chave = campanha.slug ?? campanha.id;

    try {
      await page.goto(`/painel/campanhas/${chave}/editar?aba=entrada`);

      const deepLink = page.getByRole("switch", { name: "Abrir direto no aplicativo do WhatsApp" });
      await expect(deepLink).toHaveAttribute("aria-checked", "true");
      await deepLink.click();
      await expect(deepLink).toHaveAttribute("aria-checked", "false");

      await page.getByRole("radio", { name: "Mandar para outro link" }).check();
      const destino = page.getByLabel("Link de destino");
      await destino.fill("http://inseguro.com");
      await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
      await destino.fill(URL_DESTINO);
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await page.waitForURL(new RegExp(`/painel/campanhas/${chave}$`));

      // Âncora: o que o servidor gravou.
      const lista = await page.request.get("/api/campanhas");
      expect(lista.ok()).toBeTruthy();
      const salva = ((await lista.json()) as Campanha[]).find((c) => c.id === campanha.id);
      expect(salva?.settings?.entrada).toBeTruthy();
      const entrada = salva!.settings!.entrada;
      expect(entrada.deep_link).toBe(false);
      expect(entrada.lotado).toEqual({ modo: "url", url: URL_DESTINO });

      // Contraste: a tela, depois de recarregar, diz o mesmo que a API.
      await page.reload();
      const chips = page.getByRole("list", { name: "Configurações de entrada" });
      for (const rotulo of chipsEsperados(entrada)) {
        await expect(chips.getByRole("link", { name: rotulo, exact: true })).toBeVisible();
      }

      expect(falhasDeApi, "nenhuma chamada de API pode ter falhado").toEqual([]);
    } finally {
      await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
    }
  });
});
```

- [ ] **Step 2: Rodar contra o dev server da worktree**

As credenciais e o `E2E_BASE_URL` estão documentados em `apps/web/e2e/README.md`. Com o dev server da worktree na porta 3100:

Run: `cd "$W/apps/web" && E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/painel-campanha-entrada.spec.ts --reporter=line`
Expected: `1 passed`. (Rodar DUAS vezes — o servidor `next dev` pode servir HMR velho na primeira; a segunda tem de passar igual.)

- [ ] **Step 3: Commit**

```bash
git -C "$W" add apps/web/e2e/painel-campanha-entrada.spec.ts
git -C "$W" diff --cached --stat
git -C "$W" commit -m "test(campanhas): e2e da aba Entrada com contraste API x tela

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Gate local, PR, CI, quadro, merge

**Files:** nenhum novo. (`apply-order.txt` não muda: sem migração.)

- [ ] **Step 1: Suíte inteira + os dois tsc + lint**

Run: `cd "$W" && npm --workspace apps/web test 2>&1 | tail -5 && npx tsc --noEmit -p apps/web/tsconfig.json && npx tsc --noEmit -p apps/worker/tsconfig.json && npm run web:lint 2>&1 | tail -3`
Expected: `# fail 0`, sem erro de tipo, lint limpo.

- [ ] **Step 2: Gate real do CI** (ferramenta PowerShell, não Bash):

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\config-grupos-campanha"; powershell -ExecutionPolicy Bypass -File infra\scripts\verify-local.ps1
```
Expected: termina sem `falhou`. Cobre scan de secrets, templates de env e build.

- [ ] **Step 3: Renomear a branch e pushar**

```bash
git -C "$W" branch -m worktree-config-grupos-campanha feat/config-campanha-entrada
git -C "$W" push -u origin feat/config-campanha-entrada
```

- [ ] **Step 4: Abrir o PR**

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/config-campanha-entrada --title "feat(campanhas): configuracoes de entrada — deep link, um grupo por pessoa, encerramento e lotado" --body "$(cat <<'EOF'
## O que muda

- **Configurações da campanha** (`/editar`) ganha a aba **Entrada**: deep link, um grupo por pessoa, encerrar automaticamente e o que fazer quando lotar (aviso / Página da conta / outro link).
- **`/r/<slug>`** obedece: tela de entrada clara de 600 ms com botão sempre visível, `whatsapp://` em celular com fallback https, cookie `gr_<campanha>` (HttpOnly, 90 dias, path do slug) lembrando o grupo, encerramento no fim do dia em Brasília, destino de lotado só para lotação/encerramento (campanha não configurada segue com a mensagem honesta).
- **Página da campanha**: chips de estado, botão "Configurar", QR do link mestre, painel de ajuda.
- Dados em `campaign_groups.metadata.settings.entrada` — **sem migração**.

Spec: `docs/superpowers/specs/2026-09-02-config-grupos-campanha-design.md` (PR A do fatiamento). Plano: `docs/superpowers/plans/2026-09-02-config-campanha-entrada.md`.

## Como foi verificado

- Unitário: `settings`, `deep-link`, `entry-page`, `resolve-click-target` (grupo lembrado vence lotado; encerramento; pool não configurado nunca vira lista de espera).
- E2E `painel-campanha-entrada.spec.ts`: grava pela tela, lê pela API, chips refletem.
- Smoke no `/r/` com UA de iPhone (200 + set-cookie) e com cookie (302 para o mesmo grupo).

## Fora deste PR

Integrações (pixel da campanha, CAPI, GA4, Google Ads) = PR B. Revisar links / remover pessoas = PR C/D.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Card no quadro (produção)** — o card `campanhas-config-entrada` foi criado em `em_construcao` no início do trabalho. Ao mergear:

```sql
select public.move_card('campanhas-config-entrada', 'no_ar_nao_verificado', 'PR A mergeado: aba Entrada + /r/ com deep link, cookie, encerramento e lotado', 'PR #<N>');
```
(`no_ar_verificado` só depois de olhar em produção: abrir `/r/<slug>` real no celular e ver o app abrir, e um chip mudar após salvar.)

- [ ] **Step 6: CI e merge**

```bash
gh pr checks <N> --repo codingB0y/Girumo --watch
gh pr merge <N> --repo codingB0y/Girumo --squash --delete-branch
```
Reverter a entrada temporária do `.claude/launch.json` no checkout principal, se criada:
`git -C "C:/Users/Igor/Desktop/HubFlow-platform" checkout -- .claude/launch.json`.

---

## Self-review (feito ao escrever)

- **Cobertura da spec (PR A):** D1 (nomes, "Configurar") → Tasks 7/8 · D2 (deep link default ligado, só celular, botão) → Tasks 1/2/4/5 · D3 (grupo lembrado vence) → Task 3 · D4 (aviso/página/url + encerrar) → Tasks 1/4/5/6/7 · D9 (ajuda em painel) → Task 8 · D10 (texto fixo) → Task 4 · D11 (QR) → Task 8 · chips → Task 8 · cookie (HttpOnly, Lax, 90 d, path) → Task 2 · sem migração → Task 6 (`withEntrada`) · campanha não configurada nunca vira lista de espera → Task 4 · testes unit/integração/E2E → Tasks 1–4, 5 (smoke), 9.
- **Deixado de fora de propósito (segue no PR B):** prévia da tela ao lado do formulário — entra quando a tela ganhar os scripts das integrações, para a prévia mostrar o estado real.
- **Consistência de nomes:** `readEntrada` / `parseEntradaPatch` / `withEntrada` / `isClosedAt` (Task 1) são os usados nas Tasks 3, 5, 6, 7; `rememberCookieName` / `readCookie` / `rememberCookieHeader` / `whatsappDeepLink` / `isMobileUa` (Task 2) usados na Task 5; `renderEntryPage` / `renderBlockedPage` / `lotadoRedirect` (Task 4) usados na Task 5; `chipLabels` (Task 8) espelhado em `chipsEsperados` (Task 9) com os mesmos rótulos.
