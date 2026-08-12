# Backfill do convite dos grupos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preencher automaticamente o `invite_url` dos grupos onde a conta conectada é admin, buscando o código de convite na Evolution, sem o lojista digitar nada.

**Architecture:** Um cron do Vercel chama `/api/cron/group-invites` a cada 10 minutos. Cada execução pega até 10 grupos por instância conectada que ainda não têm convite, busca o código na Evolution em série e grava. O agendamento **é** o rate limiter (10 por execução × 1 execução/10min = 10/10min), então não existe tabela de bucket nem estado em memória. Toda a lógica de decisão vive num módulo puro; o client HTTP fica burro.

**Tech Stack:** Next.js 15 App Router (rota de cron), Evolution API v2.3.7, Supabase (service-role), `node:test` via `tsx --test`.

**Spec:** [2026-08-12-group-invite-backfill-design.md](../specs/2026-08-12-group-invite-backfill-design.md)

## Global Constraints

- **Nenhuma migração.** `invite_url` e `metadata` já existem em `groups`. `syncGroupsFromProvider` faz upsert de 4 colunas e o `ON CONFLICT` só atualiza coluna presente no payload, então nada do que gravarmos é apagado por um sync.
- **Toda query em tabela com `tenant_id` leva `.eq("tenant_id", ...)` explícito.** O service-role bypassa RLS; esse filtro **é** a proteção, não redundância.
- **Módulo de teste nunca importa `server-only`.** `lib/stores/groups.ts` e `lib/evolution/client.ts` começam com `import "server-only"` e quebram sob `tsx --test`. A lógica pura vai para `lib/groups/invite-backfill.ts`, sem esse import — o mesmo arranjo que `lib/evolution/admin-group.ts` já usa (puro, testado, ao lado de um client que não é testado).
- **Nunca paralelizar as chamadas de convite.** Paralelismo é o oposto de rate limit. Sempre `for … await`.
- **Máximo por execução: 10 por instância** (não global). O limite do WhatsApp é por conta, e cada tenant tem o seu número.
- **Convite de terceiro sempre passa por `normalizeInviteUrl`** de `lib/groups/invite-url.ts` antes de ir ao banco.
- Commits em inglês, prefixo semântico. Código e identificadores em inglês; comentários em pt-BR, como o resto do projeto.
- Testes rodam com `npm --workspace apps/web test`. Arquivo único: `cd apps/web && npx tsx --test src/caminho/arquivo.test.ts`.

---

### Task 1: Módulo puro de decisão

Todo o raciocínio da feature — quem entra na fila, como ler a resposta da Evolution, e se uma falha é definitiva — num arquivo sem dependência de rede ou de Supabase, portanto testável direto.

**Files:**
- Create: `apps/web/src/lib/groups/invite-backfill.ts`
- Test: `apps/web/src/lib/groups/invite-backfill.test.ts`

**Interfaces:**
- Consumes: `normalizeInviteUrl` de `@/lib/groups/invite-url` (já existe).
- Produces:
  - `type BackfillCandidate = { id: string; whatsapp_group_id: string; name: string; members: number; is_admin?: boolean; invite_url?: string | null; metadata?: Record<string, unknown> | null }`
  - `type InviteFailureVerdict = "permanent" | "transient"`
  - `type InviteFailure = { verdict: InviteFailureVerdict; reason: string }`
  - `type InviteFetchMarker = { failed: true; reason: string; at: string }`
  - `selectBackfillCandidates(groups: readonly BackfillCandidate[], limit: number): BackfillCandidate[]`
  - `parseInviteCodeResponse(body: unknown): string | null`
  - `classifyInviteFailure(input: { status: number; detail?: string | null }): InviteFailure`
  - `buildInviteFetchMarker(reason: string, now: Date): InviteFetchMarker`

**Por que `classifyInviteFailure` devolve o motivo junto e não só o veredito:** o
vocabulário de erro da Evolution (403/locked/gone) precisa ser reconhecido uma vez só.
Se a rota tivesse a própria tradução para texto legível, as mesmas regexes viveriam em
dois arquivos e um dia divergiriam.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/groups/invite-backfill.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInviteFetchMarker,
  classifyInviteFailure,
  parseInviteCodeResponse,
  selectBackfillCandidates,
  type BackfillCandidate,
} from "./invite-backfill";

function group(over: Partial<BackfillCandidate> = {}): BackfillCandidate {
  return {
    id: over.id ?? "row-1",
    whatsapp_group_id: over.whatsapp_group_id ?? "120363000000000001@g.us",
    name: over.name ?? "Atacado Infantil 1",
    members: over.members ?? 100,
    is_admin: over.is_admin ?? true,
    invite_url: over.invite_url ?? null,
    metadata: over.metadata ?? {},
  };
}

// --- selectBackfillCandidates ---

test("selects an admin group with no invite", () => {
  const out = selectBackfillCandidates([group()], 10);
  assert.equal(out.length, 1);
});

test("skips a group where we are not admin", () => {
  // Sem admin não existe código de convite a buscar: a chamada gastaria cota
  // do limite e voltaria 404 sempre.
  const out = selectBackfillCandidates([group({ is_admin: false })], 10);
  assert.deepEqual(out, []);
});

test("skips a group that already has an invite", () => {
  const out = selectBackfillCandidates(
    [group({ invite_url: "https://chat.whatsapp.com/AbCdEfGhIjK" })],
    10,
  );
  assert.deepEqual(out, []);
});

test("skips a group whose invite fetch is marked as failed", () => {
  const out = selectBackfillCandidates(
    [group({ metadata: { inviteFetch: { failed: true, reason: "403", at: "2026-08-12T00:00:00.000Z" } } })],
    10,
  );
  assert.deepEqual(out, []);
});

test("respects the limit", () => {
  const many = Array.from({ length: 25 }, (_, i) => group({ id: `row-${i}`, whatsapp_group_id: `${i}@g.us` }));
  assert.equal(selectBackfillCandidates(many, 10).length, 10);
});

test("puts the fullest group first", () => {
  // Ordenar por membros é o que faz os grupos em zona de lotação virem antes,
  // sem nenhum código de prioridade: quem está cheio é quem precisa do link.
  const out = selectBackfillCandidates(
    [
      group({ id: "vazio", whatsapp_group_id: "a@g.us", members: 5 }),
      group({ id: "cheio", whatsapp_group_id: "b@g.us", members: 980 }),
      group({ id: "medio", whatsapp_group_id: "c@g.us", members: 400 }),
    ],
    10,
  );
  assert.deepEqual(out.map((g) => g.id), ["cheio", "medio", "vazio"]);
});

test("does not mutate the input array", () => {
  const input = [
    group({ id: "a", whatsapp_group_id: "a@g.us", members: 1 }),
    group({ id: "b", whatsapp_group_id: "b@g.us", members: 2 }),
  ];
  selectBackfillCandidates(input, 10);
  assert.deepEqual(input.map((g) => g.id), ["a", "b"]);
});

// --- parseInviteCodeResponse ---

test("reads the invite url the Evolution returns", () => {
  const out = parseInviteCodeResponse({
    inviteUrl: "https://chat.whatsapp.com/AbCdEfGhIjK",
    inviteCode: "AbCdEfGhIjK",
  });
  assert.equal(out, "https://chat.whatsapp.com/AbCdEfGhIjK");
});

test("falls back to inviteCode when inviteUrl is absent", () => {
  const out = parseInviteCodeResponse({ inviteCode: "AbCdEfGhIjK" });
  assert.equal(out, "https://chat.whatsapp.com/AbCdEfGhIjK");
});

test("refuses a response whose url is not a WhatsApp invite", () => {
  // Este é o caso que protege o /r/<slug>: um valor errado aqui não quebra o
  // painel, quebra do outro lado — o cliente clica no link divulgado e cai em
  // lugar nenhum.
  assert.equal(parseInviteCodeResponse({ inviteUrl: "https://evil.example/AbCdEfGhIjK" }), null);
});

test("refuses a response with no invite at all", () => {
  assert.equal(parseInviteCodeResponse({}), null);
  assert.equal(parseInviteCodeResponse(null), null);
  assert.equal(parseInviteCodeResponse("No invite code"), null);
});

// --- classifyInviteFailure ---

test("network failure is transient", () => {
  // status 0 é o sinal do EvolutionError para "não chegou na Evolution".
  assert.equal(classifyInviteFailure({ status: 0, detail: "TimeoutError" }).verdict, "transient");
});

test("server error is transient", () => {
  assert.equal(classifyInviteFailure({ status: 502, detail: "bad gateway" }).verdict, "transient");
});

test("losing admin is permanent, and says so in Portuguese", () => {
  const out = classifyInviteFailure({ status: 404, detail: "Error: 403 forbidden" });
  assert.equal(out.verdict, "permanent");
  assert.equal(out.reason, "a conta não é mais admin do grupo");
});

test("a locked group is permanent", () => {
  const out = classifyInviteFailure({ status: 404, detail: "Error: locked" });
  assert.equal(out.verdict, "permanent");
  assert.equal(out.reason, "o grupo está travado para convites");
});

test("a revoked invite is permanent", () => {
  const out = classifyInviteFailure({ status: 404, detail: "Error: gone" });
  assert.equal(out.verdict, "permanent");
  assert.equal(out.reason, "o convite foi revogado no WhatsApp");
});

test("an unrecognised detail is permanent and carries the raw detail", () => {
  // Sem tradução conhecida, mostrar o texto cru é melhor que esconder: quem
  // olhar o painel precisa de alguma pista pra decidir se tenta de novo.
  const out = classifyInviteFailure({ status: 404, detail: "quem sabe" });
  assert.equal(out.verdict, "permanent");
  assert.equal(out.reason, "quem sabe");
});

test("a permanent failure with no detail still has a usable reason", () => {
  assert.equal(classifyInviteFailure({ status: 404 }).verdict, "permanent");
  assert.equal(classifyInviteFailure({ status: 404 }).reason, "a Evolution não devolveu o convite");
  assert.equal(classifyInviteFailure({ status: 404, detail: null }).reason, "a Evolution não devolveu o convite");
});

test("a 5xx whose body says locked is still transient", () => {
  // Regressão da ordem: status antes de detail. Um 5xx pode carregar qualquer
  // texto no corpo, e classificar por causa de uma palavra ali mataria um
  // grupo bom para sempre.
  assert.equal(classifyInviteFailure({ status: 503, detail: "upstream locked" }).verdict, "transient");
});

// --- buildInviteFetchMarker ---

test("stamps the failure with reason and time", () => {
  const marker = buildInviteFetchMarker("403 forbidden", new Date("2026-08-12T15:30:00.000Z"));
  assert.deepEqual(marker, { failed: true, reason: "403 forbidden", at: "2026-08-12T15:30:00.000Z" });
});

test("truncates a very long reason", () => {
  const marker = buildInviteFetchMarker("x".repeat(500), new Date("2026-08-12T15:30:00.000Z"));
  assert.equal(marker.reason.length, 200);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx tsx --test src/lib/groups/invite-backfill.test.ts
```

Expected: FAIL — `Cannot find module './invite-backfill'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/groups/invite-backfill.ts`:

```ts
/**
 * Decisões do backfill de convite — funções PURAS.
 *
 * Mora fora de `lib/stores/groups.ts` e de `lib/evolution/client.ts` de
 * propósito: os dois começam com `import "server-only"`, que quebra sob
 * `tsx --test`. Mesmo arranjo de `lib/evolution/admin-group.ts`.
 */

import { normalizeInviteUrl } from "@/lib/groups/invite-url";

/** Só o que a decisão precisa de um grupo (evita importar o tipo server-only). */
export type BackfillCandidate = {
  id: string;
  whatsapp_group_id: string;
  name: string;
  members: number;
  is_admin?: boolean;
  invite_url?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type InviteFailureVerdict = "permanent" | "transient";

export type InviteFailure = { verdict: InviteFailureVerdict; reason: string };

export type InviteFetchMarker = { failed: true; reason: string; at: string };

const REASON_MAX_LENGTH = 200;

/**
 * Vocabulário de erro da Evolution → motivo legível. Único lugar do sistema que
 * conhece esses padrões: a rota consome o `reason` já traduzido em vez de ter a
 * própria cópia das regexes.
 *
 * Mesmo vocabulário de `classifyGroupOpError` da engine.
 */
const PERMANENT_REASONS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b403\b|forbidden|not-authorized/i, reason: "a conta não é mais admin do grupo" },
  { pattern: /locked/i, reason: "o grupo está travado para convites" },
  { pattern: /\bgone\b/i, reason: "o convite foi revogado no WhatsApp" },
];

const UNKNOWN_PERMANENT_REASON = "a Evolution não devolveu o convite";

function hasFailedMarker(group: BackfillCandidate): boolean {
  const marker = group.metadata?.inviteFetch;
  return typeof marker === "object" && marker !== null && (marker as { failed?: unknown }).failed === true;
}

/**
 * Grupos que ainda podem ganhar convite, os mais cheios primeiro.
 *
 * A ordem por membros é o que prioriza quem está em zona de lotação sem
 * precisar de código especial pra isso.
 */
export function selectBackfillCandidates(
  groups: readonly BackfillCandidate[],
  limit: number,
): BackfillCandidate[] {
  return groups
    .filter((g) => g.is_admin === true)
    .filter((g) => !g.invite_url || g.invite_url.trim() === "")
    .filter((g) => !hasFailedMarker(g))
    .slice()
    .sort((a, b) => b.members - a.members)
    .slice(0, Math.max(0, limit));
}

/**
 * Extrai o convite da resposta da Evolution (`{ inviteUrl, inviteCode }`).
 *
 * `null` quando não há convite utilizável. Passa por `normalizeInviteUrl`
 * porque é resposta de terceiro: uma URL que não seja do WhatsApp entraria no
 * banco calada e só apareceria como funil furado no `/r/<slug>`.
 */
export function parseInviteCodeResponse(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const candidate = typeof record.inviteUrl === "string" && record.inviteUrl
    ? record.inviteUrl
    : typeof record.inviteCode === "string"
      ? record.inviteCode
      : null;
  if (!candidate) return null;
  return normalizeInviteUrl(candidate);
}

/**
 * Falha definitiva ou passageira?
 *
 * A Evolution 2.3.7 achata TODA falha de grupo num 404 `No invite code`
 * (whatsapp.baileys.service.ts:4483), então num 404 o status não informa nada e
 * a causa real vive no detail. Mas em rede/5xx o status é o que vale — por isso
 * ele é checado ANTES do detail.
 */
export function classifyInviteFailure(input: { status: number; detail?: string | null }): InviteFailure {
  if (input.status === 0) return { verdict: "transient", reason: "a Evolution não respondeu" };
  if (input.status >= 500) return { verdict: "transient", reason: "a Evolution falhou temporariamente" };

  const detail = (input.detail ?? "").trim();
  const known = PERMANENT_REASONS.find((entry) => entry.pattern.test(detail));
  if (known) return { verdict: "permanent", reason: known.reason };

  // Sem tradução conhecida, o texto cru é melhor que silêncio: é a única pista
  // de quem for decidir no painel se vale tentar de novo.
  return { verdict: "permanent", reason: detail || UNKNOWN_PERMANENT_REASON };
}

/** Marcador gravado em `groups.metadata.inviteFetch`. `now` entra por parâmetro pra ser testável. */
export function buildInviteFetchMarker(reason: string, now: Date): InviteFetchMarker {
  return { failed: true, reason: reason.slice(0, REASON_MAX_LENGTH), at: now.toISOString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx tsx --test src/lib/groups/invite-backfill.test.ts
```

Expected: PASS, 21 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/groups/invite-backfill.ts apps/web/src/lib/groups/invite-backfill.test.ts
git commit -m "feat(grupos): pure decisions for the group invite backfill"
```

---

### Task 2: `fetchInviteCode` no client da Evolution

O client fica burro de propósito: faz a chamada e delega a leitura da resposta pro módulo puro.

**Files:**
- Modify: `apps/web/src/lib/evolution/client.ts` (adicionar após `fetchAllGroups`, ~linha 259)

**Interfaces:**
- Consumes: `request()` e `EvolutionError` (privados do arquivo); `parseInviteCodeResponse` da Task 1.
- Produces: `fetchInviteCode(instanceName: string, groupJid: string): Promise<string | null>` — **lança** `EvolutionError` (com `status` e `detail`) quando a chamada não completa; devolve `null` só quando a resposta veio 200 sem convite utilizável.

- [ ] **Step 1: Add the import**

No topo de `apps/web/src/lib/evolution/client.ts`, junto dos imports existentes:

```ts
import { parseInviteCodeResponse } from "@/lib/groups/invite-backfill";
```

- [ ] **Step 2: Add the function**

Depois de `fetchAllGroups`, no fim do arquivo:

```ts
/**
 * Link de convite de UM grupo. Exige que a conta conectada seja admin dele.
 *
 * É LEITURA — devolve o código que já existe, não cria nem envia convite a
 * ninguém. Mesmo assim o chamador respeita ritmo: o teto do WhatsApp aqui não é
 * documentado e o custo de errar é a conta do lojista.
 *
 * Contrato de falha (a classificação depende dele):
 * - LANÇA `EvolutionError` em qualquer falha de HTTP, preservando `status` e
 *   `detail` — engolir o erro apagaria a única informação que distingue
 *   "perdi o admin" de "a rede oscilou".
 * - devolve `null` apenas no 200 com corpo sem convite utilizável.
 *
 * Atenção: na v2.3.7 a Evolution transforma QUALQUER erro daqui num 404
 * `No invite code`, com a causa real dentro do detail.
 */
export async function fetchInviteCode(instanceName: string, groupJid: string): Promise<string | null> {
  const data = await request<unknown>(
    `/group/inviteCode/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
  );
  return parseInviteCodeResponse(data);
}
```

- [ ] **Step 3: Verify it compiles and lints**

Não há teste unitário aqui: o arquivo é `server-only` e não carrega sob `tsx --test`. É o mesmo motivo pelo qual o resto de `client.ts` não tem teste — e é por isso que a lógica testável foi toda pra Task 1. A verificação desta task é o typecheck.

```bash
npm run web:lint
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Expected: sem erro em `client.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/evolution/client.ts
git commit -m "feat(evolution): fetch a group invite code from the provider"
```

---

### Task 3: Rota do cron

**Files:**
- Create: `apps/web/src/app/api/cron/group-invites/route.ts`

**Interfaces:**
- Consumes: `isCronAuthorized` de `@/lib/cron-auth`; `getSupabaseAdmin` de `@/lib/supabase/server`; `fetchInviteCode` e `EvolutionError` de `@/lib/evolution/client`; `providerInstanceId` de `@/lib/evolution/client`; tudo da Task 1.
- Produces: `GET /api/cron/group-invites` → `{ ok: true, filled, failed, skipped, remaining, timestamp }`.

- [ ] **Step 1: Write the route**

Create `apps/web/src/app/api/cron/group-invites/route.ts`:

```ts
import { isCronAuthorized } from "@/lib/cron-auth";
import { EvolutionError, fetchInviteCode, providerInstanceId } from "@/lib/evolution/client";
import {
  buildInviteFetchMarker,
  classifyInviteFailure,
  selectBackfillCandidates,
  type BackfillCandidate,
} from "@/lib/groups/invite-backfill";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Quantos convites buscar por instância em CADA execução.
 *
 * Este número junto com a cadência do cron (a cada 10 min, em vercel.json) É o
 * rate limiter: 10/10min, o mesmo teto do bucket `invite` do group-guard da
 * engine. Não existe bucket em memória aqui de propósito — o agendador é
 * durável, um processo que morre no meio não libera rajada no próximo boot.
 *
 * O limite é POR INSTÂNCIA porque o teto do WhatsApp é por conta, e cada tenant
 * tem o seu número.
 *
 * Mexer aqui sem mexer no `schedule` do vercel.json quebra a política.
 */
const MAX_PER_INSTANCE_PER_RUN = 10;

/**
 * GET /api/cron/group-invites
 * Chamado por Vercel Cron (vercel.json) com Authorization Bearer.
 *
 * Preenche `groups.invite_url` dos grupos onde somos admin e o campo está
 * vazio. É o insumo do link mestre `/r/<slug>` e do auto-grow — sem ele as duas
 * features ficam corretas e inertes.
 *
 * Falha definitiva (perdi admin, grupo travado, convite revogado) grava
 * `metadata.inviteFetch` e tira o grupo da fila para sempre: o cron não pode
 * bater eternamente num grupo impossível. O resgate é manual, pela rota PATCH
 * (ver Task 5) — nunca automático.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { filled: 0, failed: 0, skipped: 0, remaining: 0 };

  const { data: instances, error: instancesError } = await supabase
    .from("instances")
    .select("id, tenant_id, provider_instance_id, status")
    .eq("status", "connected");

  if (instancesError) {
    console.error("[cron] group-invites: falha lendo instances:", instancesError.message);
    return Response.json({ error: "instances unavailable" }, { status: 500 });
  }

  for (const instance of instances ?? []) {
    const tenantId = instance.tenant_id as string | null;
    if (!tenantId) continue;

    // O filtro por tenant_id é a proteção real: o service-role bypassa RLS.
    const { data: groups, error: groupsError } = await supabase
      .from("groups")
      .select("id, whatsapp_group_id, name, members, is_admin, invite_url, metadata")
      .eq("tenant_id", tenantId);

    if (groupsError) {
      console.error(`[cron] group-invites: falha lendo groups de ${tenantId}:`, groupsError.message);
      results.failed++;
      continue;
    }

    const all = (groups ?? []) as BackfillCandidate[];
    const candidates = selectBackfillCandidates(all, MAX_PER_INSTANCE_PER_RUN);
    const pending = selectBackfillCandidates(all, all.length).length;
    results.remaining += Math.max(0, pending - candidates.length);

    const remoteName = instance.provider_instance_id || providerInstanceId(instance.id as string);

    // Em série, sempre. Paralelizar aqui é o oposto de respeitar o limite.
    for (const group of candidates) {
      try {
        const inviteUrl = await fetchInviteCode(remoteName, group.whatsapp_group_id);

        if (!inviteUrl) {
          // 200 sem convite utilizável: não vai melhorar sozinho.
          const marker = buildInviteFetchMarker("a Evolution respondeu sem um convite válido", now);
          await supabase
            .from("groups")
            .update({ metadata: { ...(group.metadata ?? {}), inviteFetch: marker } })
            .eq("tenant_id", tenantId)
            .eq("id", group.id);
          results.failed++;
          continue;
        }

        const { error: updateError } = await supabase
          .from("groups")
          .update({ invite_url: inviteUrl })
          .eq("tenant_id", tenantId)
          .eq("id", group.id);

        if (updateError) {
          console.error(`[cron] group-invites: convite obtido mas não gravado (${group.id}):`, updateError.message);
          results.failed++;
          continue;
        }
        results.filled++;
      } catch (error) {
        if (!(error instanceof EvolutionError)) {
          console.error(`[cron] group-invites: erro inesperado em ${group.id}:`, error);
          results.failed++;
          continue;
        }

        // `EvolutionError` só expõe status e path; o detail vive dentro da
        // message composta, então é ela que vai para a classificação.
        const failure = classifyInviteFailure({ status: error.status, detail: error.message });

        if (failure.verdict === "transient") {
          // Não marca: a próxima execução tenta de novo.
          results.skipped++;
          continue;
        }

        const marker = buildInviteFetchMarker(failure.reason, now);
        await supabase
          .from("groups")
          .update({ metadata: { ...(group.metadata ?? {}), inviteFetch: marker } })
          .eq("tenant_id", tenantId)
          .eq("id", group.id);
        results.failed++;
      }
    }
  }

  return Response.json({ ok: true, ...results, timestamp: now.toISOString() });
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npm run web:lint
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Expected: sem erro.

- [ ] **Step 3: Verify the whole suite still passes**

```bash
npm --workspace apps/web test
```

Expected: todos os testes passam (305 anteriores + 21 da Task 1).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/cron/group-invites/route.ts
git commit -m "feat(grupos): cron route that backfills group invites"
```

---

### Task 4: Agendar o cron e publicar o contrato

**Files:**
- Modify: `apps/web/vercel.json`
- Modify: `apps/web/system/API_CONTRACTS.md`
- Modify: `apps/web/system/NEXT.md`

- [ ] **Step 1: Add the cron entry**

Em `apps/web/vercel.json`, dentro de `crons`, depois da entrada de `/api/notifications/alerts`:

```json
    {
      "path": "/api/cron/group-invites",
      "schedule": "*/10 * * * *"
    }
```

O arquivo inteiro fica:

```json
{
  "framework": "nextjs",
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "crons": [
    {
      "path": "/api/cron/emails",
      "schedule": "0 12 * * *"
    },
    {
      "path": "/api/notifications/alerts",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/group-invites",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

- [ ] **Step 2: Publish the contract**

Adicionar em `apps/web/system/API_CONTRACTS.md` (a lane Banco/API publica; as outras tratam como somente-leitura):

```markdown
### GET /api/cron/group-invites

Cron do Vercel, a cada 10 minutos. `Authorization: Bearer <CRON_SECRET>`.

Preenche `groups.invite_url` de até 10 grupos por instância conectada onde
`is_admin = true` e o convite está vazio, buscando na Evolution
(`GET /group/inviteCode/{instance}?groupJid=`).

A cadência do cron × o teto de 10 por execução É o rate limiter (10/10min).
Alterar um sem o outro quebra a política anti-ban.

Resposta: `{ ok: true, filled, failed, skipped, remaining, timestamp }`

- `filled` — convites gravados
- `failed` — falha definitiva; grava `groups.metadata.inviteFetch = { failed, reason, at }`
  e o grupo sai da fila até um resgate manual
- `skipped` — falha passageira (rede/5xx); volta na próxima execução
- `remaining` — quantos ainda esperam vez
```

- [ ] **Step 3: Register the lane handoff**

Adicionar em `apps/web/system/NEXT.md`:

```markdown
HANDOFF → Frontend+UI: exibir o motivo do convite indisponível

Banco/API entregou o backfill automático (`GET /api/cron/group-invites`) e o
resgate manual (`PATCH /api/groups` com `clearInviteFetchError: true`).

Falta na tela de grupos: quando `metadata.inviteFetch.failed` for true, mostrar
`metadata.inviteFetch.reason` ao lado do grupo e um botão "buscar de novo" que
chama o PATCH acima. O input manual de convite do PR #86 continua como saída
final.

Por que existe botão em vez de retry automático: a Evolution 2.3.7 achata toda
falha num 404, então uma oscilação passageira é indistinguível de "perdi o
admin". Marcar e nunca retentar sozinho evita o cron bater eternamente num
grupo impossível; o botão devolve o grupo à fila com um clique.
```

- [ ] **Step 4: Verify the build**

```bash
npm run web:build
```

Expected: `✓ Compiled successfully`. A rota `/api/cron/group-invites` aparece na listagem.

- [ ] **Step 5: Commit**

```bash
git add apps/web/vercel.json apps/web/system/API_CONTRACTS.md apps/web/system/NEXT.md
git commit -m "feat(grupos): schedule the invite backfill cron every 10 minutes"
```

---

### Task 5: Resgate manual de um grupo marcado

O `PATCH /api/groups` tem whitelist estrita de campos (`invite_url`, `capacity`, `display_name_base`, `display_number`), então limpar o marcador precisa de adição explícita — não passa "de graça".

**Files:**
- Modify: `apps/web/src/app/api/groups/route.ts` (bloco PATCH, ~linhas 134-152)
- Test: `apps/web/src/lib/groups/invite-backfill.test.ts` (adicionar ao arquivo da Task 1)

**Interfaces:**
- Consumes: `BackfillCandidate` da Task 1.
- Produces: `clearInviteFetchMarker(metadata: Record<string, unknown> | null | undefined): Record<string, unknown>`; e `PATCH /api/groups` passa a aceitar `clearInviteFetchError?: boolean`.

- [ ] **Step 1: Write the failing test**

Adicionar no fim de `apps/web/src/lib/groups/invite-backfill.test.ts`:

```ts
// --- clearInviteFetchMarker ---

test("clearing the marker returns the group to the queue", () => {
  const cleared = clearInviteFetchMarker({
    inviteFetch: { failed: true, reason: "403", at: "2026-08-12T00:00:00.000Z" },
    outroCampo: "preservado",
  });
  assert.deepEqual(cleared, { outroCampo: "preservado" });
  assert.deepEqual(selectBackfillCandidates([group({ metadata: cleared })], 10).length, 1);
});

test("clearing keeps other metadata untouched and handles empty input", () => {
  assert.deepEqual(clearInviteFetchMarker(null), {});
  assert.deepEqual(clearInviteFetchMarker(undefined), {});
  assert.deepEqual(clearInviteFetchMarker({ a: 1 }), { a: 1 });
});
```

E acrescentar `clearInviteFetchMarker` ao import no topo do arquivo:

```ts
import {
  buildInviteFetchMarker,
  classifyInviteFailure,
  clearInviteFetchMarker,
  parseInviteCodeResponse,
  selectBackfillCandidates,
  type BackfillCandidate,
} from "./invite-backfill";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx tsx --test src/lib/groups/invite-backfill.test.ts
```

Expected: FAIL — `clearInviteFetchMarker is not a function`.

- [ ] **Step 3: Implement the helper**

Adicionar no fim de `apps/web/src/lib/groups/invite-backfill.ts`:

```ts
/**
 * Remove o marcador de falha, devolvendo o grupo à fila do cron.
 *
 * Imutável: devolve objeto novo. O resto do metadata é preservado — ele
 * carrega coisa de outras features.
 */
export function clearInviteFetchMarker(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const { inviteFetch: _removed, ...rest } = metadata;
  return rest;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx tsx --test src/lib/groups/invite-backfill.test.ts
```

Expected: PASS, 23 testes.

- [ ] **Step 5: Wire it into the PATCH route**

Em `apps/web/src/app/api/groups/route.ts`, adicionar o import:

```ts
import { clearInviteFetchMarker } from "@/lib/groups/invite-backfill";
```

No bloco Supabase do PATCH, depois de `if (b.displayNumber !== undefined) patch.display_number = ...`, e ANTES do `select("id")` que busca o grupo, trocar a busca para trazer o metadata:

```ts
  // Find the group by whatsapp_group_id
  const { data: group } = await getSupabaseAdmin()
    .from("groups")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_group_id", id)
    .maybeSingle();
  if (!group) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });

  // Resgate manual de um grupo marcado como sem-convite pelo cron. Nunca é
  // automático: a Evolution achata toda falha num 404, então só uma pessoa
  // olhando sabe se vale tentar de novo.
  if (b.clearInviteFetchError === true) {
    patch.metadata = clearInviteFetchMarker(group.metadata as Record<string, unknown> | null);
  }
```

- [ ] **Step 6: Verify lint, types and the whole suite**

```bash
npm run web:lint
cd apps/web && npx tsc --noEmit -p tsconfig.json
cd ../.. && npm --workspace apps/web test
```

Expected: lint limpo, sem erro de tipo, suíte inteira passando.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/groups/invite-backfill.ts apps/web/src/lib/groups/invite-backfill.test.ts apps/web/src/app/api/groups/route.ts
git commit -m "feat(grupos): let the panel return a marked group to the invite queue"
```

---

## Verificação final antes do PR

- [ ] `npm --workspace apps/web test` — suíte inteira verde
- [ ] `npm run web:lint` — limpo
- [ ] `npm run web:build` — compila, e `/api/cron/group-invites` aparece na listagem de rotas
- [ ] `npm run brand:check` — exit 0 (nenhuma string nova de marca)
- [ ] Conferir que **nenhum** arquivo `.env*` entrou no commit: `git diff origin/main --stat | grep -i env` deve vir vazio

## Depois do merge — o que observar em produção

O cron roda a cada 10 min. Primeira execução preenche até 10 grupos.

```sql
-- Progresso do backfill (rodar em girumo-production)
select count(*) as total,
       count(nullif(trim(coalesce(invite_url,'')),'')) as com_invite,
       count(*) filter (where metadata ? 'inviteFetch') as marcados_falha
from groups where is_admin;
```

Esperado: `com_invite` subindo ~10 por 10 minutos até ~90 em ~1h30.

Se `marcados_falha` subir rápido junto, ler as razões antes de concluir que a
feature funciona — pode ser a instância sem admin de verdade, e não convite
indisponível:

```sql
select metadata->'inviteFetch'->>'reason' as motivo, count(*)
from groups where metadata ? 'inviteFetch' group by 1 order by 2 desc;
```

**Não** marcar a feature como entregue com base em "o deploy passou". O critério é
`com_invite > 0` em produção, com link válido — o mesmo erro de considerar
shipado o que está inerte é o que deixou #86 e #90 parados.
