# Assistente de ofertas: PR 2, ferramentas de leitura (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** três ferramentas que deixam o agente enxergar a loja (campanhas, posts recentes, vendas por campanha) só em
agregado, sempre na loja da sessão. Mais as duas leituras de store que faltam, ambas com colunas mínimas.

**Índice:** `docs/superpowers/plans/2026-11-04-assistente-ofertas-00-indice.md` (decisões 4 e 6). **Depende de:** PR 1 em `main`.

**Arquivos (7):**
- `apps/web/src/lib/stores/broadcasts.ts`: + `listBroadcastsSince`
- `apps/web/src/lib/stores/orders.ts`: + `listOrderTotalsSince`
- `apps/web/src/lib/stores/assistente-leituras.test.ts`: as duas, contra PostgREST de mentira
- `apps/web/src/lib/agents/offers-assistant/read-tools.ts` e `read-tools.test.ts`
- `apps/web/src/lib/agents/offers-assistant/read-deps.ts`: liga as ferramentas às stores reais

## Global Constraints

- `select` com colunas nomeadas, **nunca** `*`. `orders` tem `phone`, e ele não pode nem chegar à memória da ferramenta.
- Toda query com `.eq("tenant_id", tenantId)` (CLAUDE.md, "Isolamento multi-tenant").
- As ferramentas recebem as stores por injeção (`ReadDeps`): o teste da ferramenta não sobe banco. Quem prova a query
  é o teste de store, com o PostgREST de mentira (desenho de `broadcasts.test.ts`).
- O PostgREST corta em 1000 linhas sem erro. `ler_vendas_por_campanha` devolve `parcial: true` quando bate no teto.
- `campaign_groups.group_ids` guarda **JID do WhatsApp**, não UUID (nota `finding-group-ids-casa-por-whatsapp-id`).
  O cruzamento com `groups` é por `whatsapp_group_id`.

## Task 1: as duas leituras de store

- [ ] Teste primeiro, `apps/web/src/lib/stores/assistente-leituras.test.ts`. Copiar o servidor falso de
  `broadcasts.test.ts` (o `createServer` + `before`/`after` que setam `SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE_KEY`) e acrescentar:

```ts
test("listBroadcastsSince asks only this store, the window, the cap and no message metadata", async () => {
  responder = () => [];
  await listBroadcastsSince(LOJA, "2026-10-21T00:00:00.000Z", 30);
  const { url } = pedidos.at(-1)!;
  assert.equal(url.pathname, "/rest/v1/broadcasts");
  assert.equal(url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(url.searchParams.get("created_at"), "gte.2026-10-21T00:00:00.000Z");
  assert.equal(url.searchParams.get("limit"), "30");
  assert.equal(url.searchParams.get("select"), "campaign_group_id,message,status,sent,total,created_at");
});

test("listOrderTotalsSince never selects the phone", async () => {
  responder = () => [{ campaign_id: null, value: 10 }];
  const rows = await listOrderTotalsSince(LOJA, "2026-10-21T00:00:00.000Z");
  const { url } = pedidos.at(-1)!;
  assert.equal(url.pathname, "/rest/v1/orders");
  assert.equal(url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(url.searchParams.get("select"), "campaign_id,value");
  assert.doesNotMatch(url.search, /phone/);
  assert.deepEqual(rows, [{ campaign_id: null, value: 10 }]);
});
```

  Se o supabase-js mandar o `select` com espaço codificado, normalizar com `.replace(/\s/g, "")` antes de comparar.
  O que importa é a lista de colunas.

- [ ] Em `broadcasts.ts`, depois de `listBroadcasts`:

```ts
/**
 * Posts since `sinceIso`, newest first, with only what the offers assistant reads.
 * Campaign posts are broadcasts too (`/api/campanhas/[slug]/messages` lists them by campaign).
 */
export async function listBroadcastsSince(
  tenantId: string,
  sinceIso: string,
  limit: number,
): Promise<Pick<Broadcast, "campaign_group_id" | "message" | "status" | "sent" | "total" | "created_at">[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("campaign_group_id, message, status, sent, total, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

- [ ] Em `orders.ts`, depois de `listOrdersSince`:

```ts
/**
 * Value and source campaign of each order since `sinceIso` — the offers assistant sums them per
 * campaign. No phone, on purpose: tool output goes to the model.
 * PostgREST stops at 1000 rows without an error; the caller flags the sum as partial.
 */
export async function listOrderTotalsSince(
  tenantId: string,
  sinceIso: string,
): Promise<{ campaign_id: string | null; value: number }[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("campaign_id, value")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceIso);
  if (error) throw new Error(error.message);
  return (data ?? []) as { campaign_id: string | null; value: number }[];
}
```

- [ ] Rodar o teste de store e ver passar.

## Task 2: ferramentas de leitura

- [ ] Teste primeiro, `apps/web/src/lib/agents/offers-assistant/read-tools.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { createReadTools, MAX_POSTS, type ReadDeps } from "./read-tools";

const LOJA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const CAMP = "33333333-3333-4333-8333-333333333333";
const cfg = { configurable: { tenantId: LOJA } };

function fakeDeps(calls: string[]): ReadDeps {
  return {
    async listCampaignGroups(t) {
      calls.push(`camps:${t}`);
      return [{ id: CAMP, slug: "vip-verao", name: "VIP Verão", group_ids: ["g1@g.us", "g2@g.us"], whatsapp_community_jid: null }];
    },
    async listGroups(t) {
      calls.push(`groups:${t}`);
      return [
        { whatsapp_group_id: "g1@g.us", members: 900, lotado_em: "2026-10-01T00:00:00Z" },
        { whatsapp_group_id: "g2@g.us", members: 300, lotado_em: null },
        { whatsapp_group_id: "outro@g.us", members: 50 },
      ];
    },
    async listBroadcastsSince(t, _since, limit) {
      calls.push(`posts:${t}:${limit}`);
      return Array.from({ length: 40 }, () => ({
        campaign_group_id: CAMP, message: "x".repeat(400), status: "sent", sent: 2, total: 2, created_at: "2026-11-01T12:00:00Z",
      }));
    },
    async listOrderTotalsSince(t) {
      calls.push(`orders:${t}`);
      return [{ campaign_id: CAMP, value: 100.1 }, { campaign_id: CAMP, value: 50.2 }, { campaign_id: null, value: 10 }];
    },
  };
}

test("every read uses the config tenant even when the model passes another one", async () => {
  const calls: string[] = [];
  const { campaigns: camps, recentPosts: posts, salesByCampaign: sales } = createReadTools(fakeDeps(calls));
  await camps.invoke({ tenantId: OUTRA } as never, cfg);
  await posts.invoke({ dias: 7, tenantId: OUTRA } as never, cfg);
  await sales.invoke({ dias: 7 }, cfg);
  assert.ok(calls.length > 0);
  assert.ok(calls.every((c) => c.includes(LOJA) && !c.includes(OUTRA)), calls.join(", "));
});

test("campaigns are summarized: size, full groups, no WhatsApp ids", async () => {
  const { campaigns: camps } = createReadTools(fakeDeps([]));
  const out = String(await camps.invoke({}, cfg));
  assert.deepEqual(JSON.parse(out), [
    { slug: "vip-verao", nome: "VIP Verão", grupos: 2, grupos_lotados: 1, membros: 1200, comunidade_whatsapp: false },
  ]);
  assert.doesNotMatch(out, /@g\.us/);
});

test("recent posts are capped and cut so the prompt stays small", async () => {
  const { recentPosts: posts } = createReadTools(fakeDeps([]));
  const rows = JSON.parse(String(await posts.invoke({ dias: 30 }, cfg)));
  assert.equal(rows.length, MAX_POSTS);
  assert.equal(rows[0].texto.length, 160);
  assert.equal(rows[0].campanha, "vip-verao");
});

test("sales are aggregated per campaign, never per customer", async () => {
  const { salesByCampaign: sales } = createReadTools(fakeDeps([]));
  const out = JSON.parse(String(await sales.invoke({ dias: 7 }, cfg)));
  assert.deepEqual(out.por_campanha, [
    { campanha: "vip-verao", pedidos: 2, faturamento: 150.3 },
    { campanha: "sem_campanha", pedidos: 1, faturamento: 10 },
  ]);
  assert.equal(out.parcial, false);
});

test("a window above 30 days is refused by the schema", async () => {
  const { recentPosts: posts } = createReadTools(fakeDeps([]));
  await assert.rejects(posts.invoke({ dias: 365 }, cfg));
});
```

- [ ] Criar `apps/web/src/lib/agents/offers-assistant/read-tools.ts`:

```ts
import "server-only";

import { tool } from "langchain";
import * as z from "zod";

import { tenantFromConfig } from "@/lib/agents/llm/run-config";

/** What the read tools need from the stores — injected so tests run without a database. */
export type ReadDeps = {
  listCampaignGroups(tenantId: string): Promise<
    Array<{ id: string; slug: string; name: string; group_ids: string[]; whatsapp_community_jid: string | null }>
  >;
  listGroups(tenantId: string): Promise<
    Array<{ whatsapp_group_id: string; members: number; is_admin?: boolean; lotado_em?: string | null }>
  >;
  listBroadcastsSince(tenantId: string, sinceIso: string, limit: number): Promise<
    Array<{ campaign_group_id: string | null; message: string; status: string; sent: number; total: number; created_at: string }>
  >;
  listOrderTotalsSince(tenantId: string, sinceIso: string): Promise<
    Array<{ campaign_id: string | null; value: number }>
  >;
};

export const MAX_DAYS = 30;
export const MAX_POSTS = 30;
export const POST_EXCERPT = 160;
/** PostgREST stops at 1000 rows without an error (see orders.ts). */
export const POSTGREST_PAGE = 1000;

const daysSchema = z.object({
  dias: z.number().int().min(1).max(MAX_DAYS).default(14).describe("Janela em dias, de 1 a 30."),
});

function sinceIso(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/** Tool output is data for the model, never raw rows: no phone, no name of a person, no ids of WhatsApp. */
export function createReadTools(deps: ReadDeps, now: () => Date = () => new Date()) {
  const campaigns = tool(
    async (_input, config) => {
      const tenantId = tenantFromConfig(config);
      const [camps, groups] = await Promise.all([deps.listCampaignGroups(tenantId), deps.listGroups(tenantId)]);
      const byJid = new Map(groups.map((g) => [g.whatsapp_group_id, g]));
      return JSON.stringify(
        camps.map((c) => {
          const own = c.group_ids.map((jid) => byJid.get(jid)).filter((g) => g !== undefined);
          return {
            slug: c.slug,
            nome: c.name,
            grupos: own.length,
            grupos_lotados: own.filter((g) => g.lotado_em).length,
            membros: own.reduce((sum, g) => sum + (g.members ?? 0), 0),
            comunidade_whatsapp: c.whatsapp_community_jid !== null,
          };
        }),
      );
    },
    {
      name: "ler_campanhas",
      description: "Lista as campanhas da loja (conjuntos de grupos de WhatsApp) com tamanho. Use o slug na proposta.",
      schema: z.object({}),
    },
  );

  const recentPosts = tool(
    async ({ dias }, config) => {
      const tenantId = tenantFromConfig(config);
      const [rows, camps] = await Promise.all([
        deps.listBroadcastsSince(tenantId, sinceIso(dias, now()), MAX_POSTS),
        deps.listCampaignGroups(tenantId),
      ]);
      const slugById = new Map(camps.map((c) => [c.id, c.slug]));
      return JSON.stringify(
        rows.slice(0, MAX_POSTS).map((b) => ({
          campanha: b.campaign_group_id ? slugById.get(b.campaign_group_id) ?? null : null,
          quando: b.created_at,
          texto: b.message.slice(0, POST_EXCERPT),
          status: b.status,
          enviados: b.sent,
          total: b.total,
        })),
      );
    },
    {
      name: "ler_posts_recentes",
      description: "Posts que a loja fez nos últimos dias, com o começo do texto e quantos grupos receberam.",
      schema: daysSchema,
    },
  );

  const salesByCampaign = tool(
    async ({ dias }, config) => {
      const tenantId = tenantFromConfig(config);
      const [orders, camps] = await Promise.all([
        deps.listOrderTotalsSince(tenantId, sinceIso(dias, now())),
        deps.listCampaignGroups(tenantId),
      ]);
      const slugById = new Map(camps.map((c) => [c.id, c.slug]));
      const totals = new Map<string, { pedidos: number; faturamento: number }>();
      for (const o of orders) {
        const key = (o.campaign_id && slugById.get(o.campaign_id)) || "sem_campanha";
        const t = totals.get(key) ?? { pedidos: 0, faturamento: 0 };
        t.pedidos += 1;
        t.faturamento += Number(o.value) || 0;
        totals.set(key, t);
      }
      return JSON.stringify({
        dias,
        parcial: orders.length >= POSTGREST_PAGE,
        por_campanha: [...totals].map(([campanha, t]) => ({ campanha, ...t, faturamento: Math.round(t.faturamento * 100) / 100 })),
      });
    },
    {
      name: "ler_vendas_por_campanha",
      description: "Pedidos e faturamento por campanha nos últimos dias. 'parcial: true' = mais de 1000 pedidos, conta incompleta.",
      schema: daysSchema,
    },
  );

  return { campaigns, recentPosts, salesByCampaign };
}
```

- [ ] As ferramentas são devolvidas num **objeto**, não num array: com array, o TypeScript vê uma união de ferramentas
  e o `.invoke` deixa de ser chamável (TS2349, visto em 04/11).
- [ ] Rodar e ver passar (5 testes).

## Task 3: ligar às stores reais

- [ ] Criar `apps/web/src/lib/agents/offers-assistant/read-deps.ts`:

```ts
import "server-only";

import { listBroadcastsSince } from "@/lib/stores/broadcasts";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
import { listGroups } from "@/lib/stores/groups";
import { listOrderTotalsSince } from "@/lib/stores/orders";
import type { ReadDeps } from "./read-tools";

/** The real stores. Their row types are supersets of what ReadDeps asks, so this assignment type-checks. */
export const storeReadDeps: ReadDeps = { listCampaignGroups, listGroups, listBroadcastsSince, listOrderTotalsSince };
```

- [ ] Se o `tsc` reclamar de algum campo (por exemplo, `members` opcional em `Group`), ajustar o **`ReadDeps`** para
  bater com o tipo real. Não fazer cast.

## Task 4: gate e PR

- [ ] Os dois `tsc`, `npm test`, build.
- [ ] Commit `feat(agents): offers assistant read tools — campaigns, recent posts, sales per campaign (aggregates only)`.
- [ ] CI verde → merge → apagar branch → `blocker` do card: "PR 2 em main; falta PR 3 (agente e rota)".

## Interface com os outros PRs

- `createReadTools(deps, now)` → `{ campaigns, recentPosts, salesByCampaign }`, com os nomes de ferramenta
  `ler_campanhas`, `ler_posts_recentes` e `ler_vendas_por_campanha` (o prompt do PR 3 cita esses nomes).
- `ler_campanhas` devolve `slug`: é o identificador que a proposta usa e que a tela manda para
  `/api/campanhas/[slug]/messages`.
- `storeReadDeps`: o PR 3 passa para a rota.
