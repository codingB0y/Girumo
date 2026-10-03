# Fluxos do Instagram — fase 1 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o lojista cria e edita, no painel, o rascunho das 4 receitas de fluxo do Instagram nas duas visões (passo a passo e mapa só leitura), com a lista "Pra publicar" dizendo o que falta; nada é enviado ao Instagram ainda.

**Architecture:** o fluxo é um grafo pequeno em jsonb (`ig_flows.draft`), manipulado só por funções puras em `apps/web/src/lib/ig/flow/*` (receitas, validação, trilha, posições). Stores Supabase-only com filtro de tenant; rotas em `/api/ig/*` atrás da liberação por loja (`tenant_settings.instagram_enabled`); telas em `/painel/instagram` na direção D, com o editor em "modo foco" (sem corredor nem letreiro).

**Tech Stack:** Next 15 (App Router, `apps/web`), React 19, TypeScript strict, Tailwind com os tokens do painel, zod 4, Supabase (dois bancos), `node:test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md` (leia §2, §4, §6, §7, §10 e §16 antes de começar). Mockup aprovado: canvas de Design `https://claude.ai/artifact/Tbr29ammnMQrnXADVUK3qF`; fontes HTML/CSS do mockup em `C:/Users/Igor/Desktop/girumo-design-refs/fluxo-instagram-2026-10-01/src/` (`lista.html`, `novo.html`, `criar-passo.html`, `criar-mapa.html`, `_a-css.html`, `_b-css.html`, `kit-ig.css`).

## Global Constraints

- Toda query em tabela com `tenant_id` filtra `.eq("tenant_id", tenantId)`, inclusive update e delete. O service-role bypassa RLS; o filtro é a proteção (CLAUDE.md).
- Stores são Supabase-only (sem fallback JSON), começam com `import "server-only"` e usam `getSupabaseAdmin()` de `@/lib/supabase/server`.
- Rotas: `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`, sessão por `getTenantContext(req)` (`@/lib/supabase/tenant-context`), escrita atrás de `assertPermission(ctx.role, ...)` (`@/lib/permissions`), erro `Response.json({ error }, { status })`, 201 ao criar, `catch (e) { if (e instanceof Response) return e; throw e; }`.
- Corpo de requisição validado com zod (`z.strictObject`), nunca confiado.
- Interface em PT-BR, vocabulário do atacado: "direct", "atendimentos", "pessoas", "receita", "fluxo". **Nunca "lead".** Sem emoji na interface.
- Direção D (spec 2026-09-24): tema noite, Archivo, superfícies `bg-paper-0`, fundo `bg-canvas-100`, linhas `border-line-200`, texto `text-volt-950`, apoio `text-slate-600`, ação `text-cobalt-500`/`bg-cobalt-500`, ok/atenção/erro `text-success-700`/`text-warning-700`/`text-danger-700`, séries do mapa `var(--color-serie)` (continua) e `var(--color-saida)` (parou). Tipos `text-12/13/15/20/28`. Raio `rounded-[var(--radius-control)]`. Proibido: `rounded-2xl|3xl`, `backdrop-blur`, gradiente, `italic`, roxo, grade de cartões, eyebrow em caixa alta. `bg-acid-500` só no Postar (máximo 2 ocorrências por arquivo; `npm run painel:check` barra). Skeleton: `pn-skeleton` com `role="status"` e `aria-label`.
- Limites da Meta no modelo: mensagem até **1000 bytes UTF-8** (`utf8Bytes`), **640 caracteres** quando tem botão, **120 bytes** reservados para o link no convite, espera e lembrete até **1380 minutos** (23 h).
- Depois de um comentário só sai **um** direct, e ele não leva botão; segundo direct só depois de a pessoa responder; "Segue a loja?" só depois de a pessoa responder.
- Nome acessível é contrato de teste: `aria-label`, `role="group"`, `aria-pressed`, `role="switch"` como o painel já usa; renomear exige atualizar o teste no mesmo PR.
- Migração: idempotente, **nos dois bancos** (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`), registrada em `deploy/supabase/apply-order.txt`, com `deploy/supabase/schema-baseline.json` regenerado no mesmo PR. DDL quem aplica é o Igor (o classificador recusa).
- Um PR por assunto, fechado na mesma sessão (revisar → CI verde → mergear → apagar a branch). Este plano são **5 PRs** (A–E); cada um termina com "Gate" e "Entrega".
- Commits em inglês com prefixo semântico; código e identificadores em inglês ou no vocabulário do repositório (há muito nome em português nas telas: siga o arquivo vizinho).

## Antes de começar (uma vez)

- [ ] `git fetch origin main` e confirme que `docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md` existe em `origin/main`. Se não existir, pare e peça ao Igor para mergear o PR da documentação.
- [ ] Trabalhe no worktree da própria sessão (nunca crie outro). A cada PR: `git fetch origin main` e `git switch -c <branch> origin/main`.
- [ ] Confira as dependências: `Test-Path apps/web/node_modules/next`. Se faltar, `npm ci --workspace apps/web --include-workspace-root` (ou as duas junctions descritas na memória `finding-worktree-node-modules-junction`).
- [ ] Comandos do gate, da raiz do repositório (rode todos antes de cada push):

```bash
npm --workspace apps/web test
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json
npm --workspace apps/web run lint
npm --workspace apps/web run painel:check
npm --workspace apps/web run brand:check
npm run scan:secrets
```

Antes do push, o gate completo (inclui o build): `pwsh -File infra/scripts/verify-local.ps1`.

- [ ] Um teste só: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/flow/validate.test.ts`.
- [ ] Quadro (prod `nidoatbxaylrkcgbszns`): ao começar o PR A, atualize o card. SQL (rode com `npx supabase --workdir <pasta vazia> db query --linked -f arquivo.sql` depois de `npx supabase --workdir <pasta vazia> link --project-ref nidoatbxaylrkcgbszns --yes`; se o classificador recusar, peça ao Igor):

```sql
update public.board_features
   set blocker = 'Fase 1 em implementação (plano docs/superpowers/plans/2026-10-03-instagram-fluxos-fase1.md): PR A modelo puro, B schema+stores, C API, D casca+lista+novo, E editor.',
       updated_at = now()
 where key = 'ig-painel-gatilhos';
```

## Do mockup para o código

| No mockup (`kit-ig.css`, `base.css`) | No repositório |
|---|---|
| `--bg` | `bg-canvas-100` |
| `--rail`, `--s1` | `bg-paper-0` |
| `--s2`, `--s3` (hover, chip) | `bg-hover-ficha`, `.pn-chip` |
| `--line`, `--line-2` | `border-line-200` |
| `--ink` / `--ink-2` / `--ink-3` | `text-volt-950` / `text-slate-600` / `text-slate-600` |
| `--acid` | `bg-acid-500` (só Postar) |
| `--link` | `text-cobalt-500` |
| `--in` / `--out` / `--click` | `var(--color-serie)` / `var(--color-saida)` / `var(--color-quase)` |
| `--ok` / `--warn` / `--bad` | `text-success-700` / `text-warning-700` / `text-danger-700` |
| `.k-seg` (alternador) | `role="group"` + botões `aria-pressed` (padrão de `visao-geral.tsx:175-190`) |
| `.fx-sw` (interruptor) | botão `role="switch"` + `pn-interruptor` (`configuracoes-vitrine.tsx:201-209`) |
| `.fl-n` (bloco do mapa) | `rounded-[10px] border border-line-200 bg-paper-0` |

Medidas do mapa (de `flow.json`): bloco 250 px de largura, passo de coluna 281 px, espinha principal numa linha, desvios 230 px abaixo.

---

# PR A — modelo puro do fluxo

Branch `feat/ig-flow-model`. Só `apps/web/src/lib/ig/flow/**` e `apps/web/src/lib/ig/match-keyword.ts` (reusado). Sem banco, sem rota.

### Task 1: tipos, grafo e bytes

**Files:**
- Create: `apps/web/src/lib/ig/flow/types.ts`
- Create: `apps/web/src/lib/ig/flow/graph.ts`
- Create: `apps/web/src/lib/ig/flow/bytes.ts`
- Test: `apps/web/src/lib/ig/flow/graph.test.ts`, `apps/web/src/lib/ig/flow/bytes.test.ts`

**Interfaces:**
- Produces: `FlowDef`, `FlowNode` (`TriggerNode | MessageNode | InviteNode | ConditionNode`), `FlowEdge`, `FlowOut`, `MAIN_OUTS`, `outsOf(node)`, constantes `MAX_*`; `nodeById`, `hasNode`, `triggerOf`, `targetOf`, `reachableIds`; `utf8Bytes(text)`.

- [ ] **Step 1: escreva os testes**

```ts
// apps/web/src/lib/ig/flow/graph.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { reachableIds, targetOf, triggerOf } from "./graph";
import type { FlowDef } from "./types";

const def: FlowDef = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
    { id: "convite", type: "invite", text: "Oi", campaignSlug: "vip", remindAfterMinutes: null },
    { id: "solto", type: "message", text: "x", button: null, wait: null },
  ],
  edges: [{ from: "gatilho", out: "next", to: "convite" }],
};

test("alcança a partir do gatilho e deixa o bloco solto de fora", () => {
  assert.deepEqual([...reachableIds(def)].sort(), ["convite", "gatilho"]);
  assert.equal(targetOf(def, "gatilho", "next"), "convite");
  assert.equal(targetOf(def, "convite", "clicked"), null);
  assert.equal(triggerOf(def)?.id, "gatilho");
});
```

```ts
// apps/web/src/lib/ig/flow/bytes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { utf8Bytes } from "./bytes";

test("conta bytes UTF-8, não caracteres: ç custa 2 e emoji custa 4", () => {
  assert.equal(utf8Bytes("abc"), 3);
  assert.equal(utf8Bytes("ç"), 2);
  assert.equal(utf8Bytes("😀"), 4);
  assert.equal(utf8Bytes(""), 0);
});
```

- [ ] **Step 2: rode e veja falhar** — `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/flow/graph.test.ts` → falha com "Cannot find module './graph'".

- [ ] **Step 3: implemente**

```ts
// apps/web/src/lib/ig/flow/types.ts
/**
 * O fluxo do Instagram como dado: um grafo pequeno, guardado em jsonb
 * (`ig_flows.draft` / `ig_flows.published`). Spec §6.
 *
 * Tudo nesta pasta é PURO (sem I/O): painel e servidor validam com a mesma
 * função, e as duas visões saem do mesmo grafo.
 */
export type FlowOut = "next" | "replied" | "timeout" | "yes" | "no" | "clicked" | "not_clicked";

/** Saída sem aresta = o fluxo para ali. Não existe bloco "fim". */
export type FlowEdge = { from: string; out: FlowOut; to: string };

export type TriggerNode = {
  id: string;
  type: "trigger";
  on: "comment" | "dm";
  keywords: string[];
  /** Só `comment`. `null` = qualquer post ou reel. */
  postId: string | null;
  /** Só `comment`. Resposta pública no comentário; `null` = não responde. */
  publicReply: string | null;
  /** Só `dm`. Resposta a story também dispara. */
  storyReplies: boolean;
};

export type MessageNode = {
  id: string;
  type: "message";
  text: string;
  /** Rótulo do botão. Proibido no primeiro direct depois de comentário. */
  button: string | null;
  /** Espera a resposta (ou o toque) da pessoa. `null` = segue direto. */
  wait: { minutes: number } | null;
};

export type InviteNode = {
  id: string;
  type: "invite";
  text: string;
  /** Link mestre da campanha (`/r/<slug>`), acrescentado no fim do texto. */
  campaignSlug: string | null;
  /** Depois de quanto tempo sem clique a saída `not_clicked` dispara. */
  remindAfterMinutes: number | null;
};

export type ConditionNode = { id: string; type: "condition"; check: "follows" };

export type FlowNode = TriggerNode | MessageNode | InviteNode | ConditionNode;

export type FlowDef = { v: 1; nodes: FlowNode[]; edges: FlowEdge[] };

/** As saídas que a trilha principal segue, em ordem de preferência. */
export const MAIN_OUTS: readonly FlowOut[] = ["next", "replied", "yes", "clicked"];

export function outsOf(node: FlowNode): FlowOut[] {
  switch (node.type) {
    case "trigger":
      return ["next"];
    case "message":
      return node.wait ? ["replied", "timeout"] : ["next"];
    case "invite":
      return ["clicked", "not_clicked"];
    case "condition":
      return ["yes", "no"];
  }
}

/** A janela da Meta é de 24 h; paramos em 23 pra não disputar o último minuto. */
export const MAX_WAIT_MINUTES = 1380;
/** Limite da Meta para um direct, em BYTES UTF-8 (emoji custa 4). */
export const MAX_MESSAGE_BYTES = 1000;
/** Espaço guardado para o link que o convite acrescenta no fim do texto. */
export const LINK_RESERVE_BYTES = 120;
export const MAX_TEXT_WITH_BUTTON = 640;
export const MAX_BUTTON_LABEL = 20;
export const MAX_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 40;
export const MAX_PUBLIC_REPLY = 300;
export const MAX_NODES = 20;
```

```ts
// apps/web/src/lib/ig/flow/graph.ts
import type { FlowDef, FlowNode, FlowOut, TriggerNode } from "./types";

export function nodeById(def: FlowDef, id: string): FlowNode | undefined {
  return def.nodes.find((node) => node.id === id);
}

export function hasNode(def: FlowDef, id: string): boolean {
  return def.nodes.some((node) => node.id === id);
}

export function triggerOf(def: FlowDef): TriggerNode | undefined {
  return def.nodes.find((node): node is TriggerNode => node.type === "trigger");
}

/** O bloco em que a saída `out` de `from` chega; `null` quando o fluxo para ali. */
export function targetOf(def: FlowDef, from: string, out: FlowOut): string | null {
  return def.edges.find((edge) => edge.from === from && edge.out === out)?.to ?? null;
}

/** Os blocos que algum caminho a partir do gatilho alcança. */
export function reachableIds(def: FlowDef): Set<string> {
  const seen = new Set<string>();
  const start = triggerOf(def);
  if (!start) return seen;
  const stack = [start.id];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of def.edges) {
      if (edge.from === id && !seen.has(edge.to)) stack.push(edge.to);
    }
  }
  return seen;
}
```

```ts
// apps/web/src/lib/ig/flow/bytes.ts
/**
 * Tamanho em BYTES UTF-8. O limite da Meta para um direct é em bytes, não em
 * caracteres: "ç" custa 2 e um emoji custa 4. `text.length` deixaria passar
 * mensagem que a Meta recusa.
 */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}
```

- [ ] **Step 4: rode os dois testes** → PASS.

- [ ] **Step 5: commit**

```bash
git add apps/web/src/lib/ig/flow
git commit -m "feat(ig): flow graph types, lookups and utf8 byte count"
```

### Task 2: esquema zod do fluxo

**Files:**
- Create: `apps/web/src/lib/ig/flow/schema.ts`
- Test: `apps/web/src/lib/ig/flow/schema.test.ts`

**Interfaces:**
- Consumes: `types.ts`.
- Produces: `flowDefSchema`, `parseFlowDef(input: unknown): { ok: true; def: FlowDef } | { ok: false; error: string }`.

- [ ] **Step 1: teste**

```ts
// apps/web/src/lib/ig/flow/schema.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseFlowDef } from "./schema";

const valido = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: "Te chamei no direct.", storyReplies: false },
    { id: "convite", type: "invite", text: "Oi", campaignSlug: null, remindAfterMinutes: null },
  ],
  edges: [{ from: "gatilho", out: "next", to: "convite" }],
};

test("aceita um fluxo bem formado e devolve o tipo do modelo", () => {
  const r = parseFlowDef(valido);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.def.nodes[1].type, "invite");
});

test("recusa versão desconhecida, campo extra e saída inexistente", () => {
  assert.equal(parseFlowDef({ ...valido, v: 2 }).ok, false);
  assert.equal(parseFlowDef({ ...valido, nodes: [{ ...valido.nodes[0], extra: 1 }, valido.nodes[1]] }).ok, false);
  assert.equal(parseFlowDef({ ...valido, edges: [{ from: "gatilho", out: "voou", to: "convite" }] }).ok, false);
  const r = parseFlowDef("não é objeto");
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.length > 0);
});
```

- [ ] **Step 2: rode e veja falhar.**

- [ ] **Step 3: implemente**

```ts
// apps/web/src/lib/ig/flow/schema.ts
import { z } from "zod";
import {
  MAX_BUTTON_LABEL,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_NODES,
  MAX_PUBLIC_REPLY,
  MAX_WAIT_MINUTES,
  type FlowDef,
} from "./types";

/**
 * Forma do fluxo na fronteira (PATCH do rascunho). Só estrutura: os limites de
 * negócio (bytes, campanha, regras da Meta) ficam em `validate.ts`, porque o
 * lojista precisa SALVAR um rascunho inválido e ver o que falta na lista.
 */
const id = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const minutes = z.number().int().min(1).max(MAX_WAIT_MINUTES);
const texto = z.string().max(4000);

const triggerNode = z.strictObject({
  id,
  type: z.literal("trigger"),
  on: z.enum(["comment", "dm"]),
  keywords: z.array(z.string().max(MAX_KEYWORD_LENGTH)).max(MAX_KEYWORDS),
  postId: z.string().regex(/^\d{1,40}$/).nullable(),
  publicReply: z.string().max(MAX_PUBLIC_REPLY).nullable(),
  storyReplies: z.boolean(),
});
const messageNode = z.strictObject({
  id,
  type: z.literal("message"),
  text: texto,
  button: z.string().max(MAX_BUTTON_LABEL).nullable(),
  wait: z.strictObject({ minutes }).nullable(),
});
const inviteNode = z.strictObject({
  id,
  type: z.literal("invite"),
  text: texto,
  campaignSlug: z.string().max(80).nullable(),
  remindAfterMinutes: minutes.nullable(),
});
const conditionNode = z.strictObject({ id, type: z.literal("condition"), check: z.literal("follows") });

export const flowOutSchema = z.enum(["next", "replied", "timeout", "yes", "no", "clicked", "not_clicked"]);
export const flowNodeSchema = z.discriminatedUnion("type", [triggerNode, messageNode, inviteNode, conditionNode]);
export const flowEdgeSchema = z.strictObject({ from: id, out: flowOutSchema, to: id });
export const flowDefSchema = z.strictObject({
  v: z.literal(1),
  nodes: z.array(flowNodeSchema).min(1).max(MAX_NODES),
  edges: z.array(flowEdgeSchema).max(MAX_NODES * 2),
});

export function parseFlowDef(input: unknown): { ok: true; def: FlowDef } | { ok: false; error: string } {
  const r = flowDefSchema.safeParse(input);
  if (r.success) return { ok: true, def: r.data as FlowDef };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "fluxo"}: ${i.message}`).join("; ") };
}
```

- [ ] **Step 4: rode** → PASS. **Step 5: commit** `git commit -am "feat(ig): zod schema for the flow definition"` (depois de `git add apps/web/src/lib/ig/flow/schema*.ts`).

### Task 3: receitas e rótulos

**Files:**
- Create: `apps/web/src/lib/ig/flow/recipes.ts`
- Create: `apps/web/src/lib/ig/flow/labels.ts`
- Test: `apps/web/src/lib/ig/flow/recipes.test.ts`

**Interfaces:**
- Consumes: `types.ts`.
- Produces: `RecipeId`, `RECIPES: Record<RecipeId, Recipe>`, `RECIPE_ORDER`, `DEFAULT_TEXTS`; `tituloDoBloco(node)`, `resumoDoBloco(node)`, `rotuloDaSaida(out, node)`, `horas(minutos)`.

- [ ] **Step 1: teste**

```ts
// apps/web/src/lib/ig/flow/recipes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES, RECIPE_ORDER } from "./recipes";
import { reachableIds, triggerOf } from "./graph";
import { outsOf } from "./types";

test("toda receita tem um gatilho e nenhum bloco solto", () => {
  for (const id of RECIPE_ORDER) {
    const def = RECIPES[id].build();
    assert.ok(triggerOf(def), `${id} sem gatilho`);
    assert.equal(reachableIds(def).size, def.nodes.length, `${id} com bloco solto`);
    for (const e of def.edges) {
      const from = def.nodes.find((n) => n.id === e.from);
      assert.ok(from && outsOf(from).includes(e.out), `${id}: aresta ${e.from}/${e.out} inválida`);
    }
  }
});

test("a receita de seguir volta pra condição depois de pedir pra seguir", () => {
  const def = RECIPES.comment_follow_invite.build();
  assert.ok(def.edges.some((e) => e.from === "pede_seguir" && e.out === "replied" && e.to === "segue"));
  assert.equal(def.nodes.find((n) => n.id === "convite")?.type, "invite");
});

test("a receita em branco só tem o gatilho, sem palavra", () => {
  const def = RECIPES.blank.build();
  assert.equal(def.nodes.length, 1);
  assert.deepEqual(triggerOf(def)?.keywords, []);
});
```

- [ ] **Step 2: rode e veja falhar.**

- [ ] **Step 3: implemente**

```ts
// apps/web/src/lib/ig/flow/recipes.ts
import { MAX_WAIT_MINUTES, type FlowDef } from "./types";

export type RecipeId = "comment_invite" | "comment_follow_invite" | "dm_invite" | "blank";

export type Recipe = {
  id: RecipeId;
  titulo: string;
  descricao: string;
  /** A cadeia mostrada em "Novo fluxo" (chips ligados por setas). */
  cadeia: string[];
  /** Texto curto na coluna "Gatilho" da lista. */
  gatilho: string;
  destaque?: string;
  build: () => FlowDef;
};

/** Textos iniciais; o lojista troca na tela. Sem emoji: a contagem é em bytes. */
export const DEFAULT_TEXTS = {
  convite: "Oi! Aqui está o link do grupo VIP:",
  respostaPublica: "Te chamei no direct.",
  pedeResposta: "Oi! Vi seu comentário. Me responde aqui com OK que eu te mando o link do grupo.",
  pedeSeguir: "Pra receber o link, segue a loja e me responde aqui de novo.",
  lembrete: "Oi! Ainda dá tempo de entrar no grupo. O link está aqui:",
} as const;

const gatilhoComentario = (keywords: string[]) =>
  ({ id: "gatilho", type: "trigger", on: "comment", keywords, postId: null, publicReply: DEFAULT_TEXTS.respostaPublica, storyReplies: false }) as const;

const convite = (remindAfterMinutes: number | null) =>
  ({ id: "convite", type: "invite", text: DEFAULT_TEXTS.convite, campaignSlug: null, remindAfterMinutes }) as const;

export const RECIPES: Record<RecipeId, Recipe> = {
  comment_invite: {
    id: "comment_invite",
    titulo: "Comentou, entra no grupo",
    descricao: "Quem comenta a palavra recebe o link do grupo no direct, na hora.",
    cadeia: ["Comentário", "Direct com o convite do grupo"],
    gatilho: "Comentário",
    destaque: "a mais usada",
    build: () => ({
      v: 1,
      nodes: [gatilhoComentario(["quero", "eu quero"]), convite(null)],
      edges: [{ from: "gatilho", out: "next", to: "convite" }],
    }),
  },
  comment_follow_invite: {
    id: "comment_follow_invite",
    titulo: "Comentou, segue e entra no grupo",
    descricao: "Pede uma resposta, confere se a pessoa segue a loja e lembra quem não clicou.",
    cadeia: ["Comentário", "Direct que pede resposta", "Segue a loja?", "Convite", "Lembrete"],
    gatilho: "Comentário",
    build: () => ({
      v: 1,
      nodes: [
        gatilhoComentario(["quero", "eu quero"]),
        { id: "pede", type: "message", text: DEFAULT_TEXTS.pedeResposta, button: null, wait: { minutes: MAX_WAIT_MINUTES } },
        { id: "segue", type: "condition", check: "follows" },
        { id: "pede_seguir", type: "message", text: DEFAULT_TEXTS.pedeSeguir, button: null, wait: { minutes: MAX_WAIT_MINUTES } },
        convite(60),
        { id: "lembrete", type: "invite", text: DEFAULT_TEXTS.lembrete, campaignSlug: null, remindAfterMinutes: null },
      ],
      edges: [
        { from: "gatilho", out: "next", to: "pede" },
        { from: "pede", out: "replied", to: "segue" },
        { from: "segue", out: "yes", to: "convite" },
        { from: "segue", out: "no", to: "pede_seguir" },
        { from: "pede_seguir", out: "replied", to: "segue" },
        { from: "convite", out: "not_clicked", to: "lembrete" },
      ],
    }),
  },
  dm_invite: {
    id: "dm_invite",
    titulo: "Pediu no direct",
    descricao: "Quem escreve a palavra no direct, ou responde um story, recebe o link do grupo.",
    cadeia: ["Palavra no direct", "Direct com o convite do grupo"],
    gatilho: "Direct ou story",
    build: () => ({
      v: 1,
      nodes: [
        { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero", "grupo"], postId: null, publicReply: null, storyReplies: true },
        convite(null),
      ],
      edges: [{ from: "gatilho", out: "next", to: "convite" }],
    }),
  },
  blank: {
    id: "blank",
    titulo: "Em branco",
    descricao: "Começa só com o gatilho. Você escreve o resto.",
    cadeia: [],
    gatilho: "Comentário",
    build: () => ({
      v: 1,
      nodes: [{ id: "gatilho", type: "trigger", on: "comment", keywords: [], postId: null, publicReply: null, storyReplies: false }],
      edges: [],
    }),
  },
};

export const RECIPE_ORDER: RecipeId[] = ["comment_invite", "comment_follow_invite", "dm_invite", "blank"];

export function isRecipeId(value: unknown): value is RecipeId {
  return typeof value === "string" && (RECIPE_ORDER as string[]).includes(value);
}
```

```ts
// apps/web/src/lib/ig/flow/labels.ts
import { MAX_WAIT_MINUTES, type FlowNode, type FlowOut } from "./types";

export function horas(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos % 60 === 0) return `${minutos / 60} h`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

export function tituloDoBloco(node: FlowNode): string {
  switch (node.type) {
    case "trigger":
      return node.on === "comment" ? "Quando alguém comenta" : "Quando alguém manda a palavra no direct";
    case "message":
      return node.wait ? "Direct que pede resposta" : "Direct";
    case "invite":
      return "Convite pro grupo";
    case "condition":
      return "Segue a loja?";
  }
}

/** Uma linha, para o bloco do mapa e a lista. */
export function resumoDoBloco(node: FlowNode): string {
  switch (node.type) {
    case "trigger":
      return node.keywords.length ? node.keywords.join(", ") : "sem palavra ainda";
    case "message":
    case "invite":
      return node.text.trim() ? (node.text.length > 90 ? `${node.text.slice(0, 90)}…` : node.text) : "sem texto ainda";
    case "condition":
      return "Confere na hora se a pessoa segue a loja";
  }
}

export function rotuloDaSaida(out: FlowOut, node: FlowNode): string {
  switch (out) {
    case "next":
      return "Segue";
    case "replied":
      return "Respondeu";
    case "timeout":
      return `Não respondeu em ${horas(node.type === "message" && node.wait ? node.wait.minutes : MAX_WAIT_MINUTES)}`;
    case "yes":
      return "Segue a loja";
    case "no":
      return "Não segue";
    case "clicked":
      return "Clicou no link";
    case "not_clicked":
      return node.type === "invite" && node.remindAfterMinutes ? `Não clicou em ${horas(node.remindAfterMinutes)}` : "Não clicou";
  }
}
```

- [ ] **Step 4: rode** → PASS. **Step 5: commit** `git add apps/web/src/lib/ig/flow && git commit -m "feat(ig): the four flow recipes and block labels"`.

### Task 4: validação e lista "Pra publicar"

**Files:**
- Create: `apps/web/src/lib/ig/flow/validate.ts`
- Test: `apps/web/src/lib/ig/flow/validate.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `graph.ts`, `bytes.ts`, `normalizeForMatch` de `@/lib/ig/match-keyword`.
- Produces: `Issue { code: IssueCode; nodeId: string | null; text: string }`, `ValidateContext { campaignSlugs: readonly string[] | null; accountConnected: boolean | null; keywordsInUse: readonly { on: "comment" | "dm"; keyword: string }[] }`, `validateFlow(def, ctx): Issue[]`, `checklist(issues): ChecklistItem[]` (`{ chave, rotulo, ok }`).

- [ ] **Step 1: testes**

```ts
// apps/web/src/lib/ig/flow/validate.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES } from "./recipes";
import { checklist, validateFlow, type ValidateContext } from "./validate";
import type { FlowDef } from "./types";

const ok: ValidateContext = { campaignSlugs: ["vip"], accountConnected: true, keywordsInUse: [] };
const comCampanha = (def: FlowDef): FlowDef => ({
  ...def,
  nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)),
});
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();

test("as receitas com campanha e conta passam limpas", () => {
  for (const id of ["comment_invite", "comment_follow_invite", "dm_invite"] as const) {
    assert.deepEqual(validateFlow(comCampanha(RECIPES[id].build()), ok), [], id);
  }
});

test("sem campanha e sem conta, a lista diz exatamente isso", () => {
  const issues = validateFlow(RECIPES.comment_invite.build(), { ...ok, accountConnected: false });
  assert.deepEqual(codes(issues), ["sem_campanha", "sem_conta"]);
  const itens = checklist(issues);
  assert.equal(itens.find((i) => i.chave === "campanha")?.ok, false);
  assert.equal(itens.find((i) => i.chave === "conta")?.ok, false);
  assert.equal(itens.find((i) => i.chave === "palavras")?.ok, true);
});

test("a receita em branco cobra palavra e convite", () => {
  const issues = validateFlow(RECIPES.blank.build(), ok);
  assert.ok(codes(issues).includes("sem_palavra"));
});

test("botão no primeiro direct depois de comentário é recusado", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const comBotao: FlowDef = {
    ...def,
    nodes: [def.nodes[0], { id: "direct", type: "message", text: "Oi", button: "Quero", wait: { minutes: 60 } }, def.nodes[1]],
    edges: [
      { from: "gatilho", out: "next", to: "direct" },
      { from: "direct", out: "replied", to: "convite" },
    ],
  };
  assert.ok(codes(validateFlow(comBotao, ok)).includes("botao_no_primeiro_direct"));
});

test("segundo direct sem resposta e condição cedo são recusados em fluxo de comentário", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const lembreteSemResposta: FlowDef = {
    ...def,
    nodes: [...def.nodes.map((n) => (n.id === "convite" && n.type === "invite" ? { ...n, remindAfterMinutes: 60 } : n)), { id: "lembrete", type: "invite", text: "De novo", campaignSlug: "vip", remindAfterMinutes: null }],
    edges: [...def.edges, { from: "convite", out: "not_clicked", to: "lembrete" }],
  };
  assert.ok(codes(validateFlow(lembreteSemResposta, ok)).includes("segundo_direct_sem_resposta"));

  const condicaoCedo: FlowDef = {
    ...def,
    nodes: [def.nodes[0], { id: "segue", type: "condition", check: "follows" }, def.nodes[1]],
    edges: [
      { from: "gatilho", out: "next", to: "segue" },
      { from: "segue", out: "yes", to: "convite" },
    ],
  };
  assert.ok(codes(validateFlow(condicaoCedo, ok)).includes("condicao_cedo"));
});

test("mede em bytes: emoji estoura antes dos 1000 caracteres", () => {
  const def = comCampanha(RECIPES.dm_invite.build());
  const longo: FlowDef = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, text: "😀".repeat(230) } : n)) };
  assert.ok(codes(validateFlow(longo, ok)).includes("texto_longo"));
});

test("palavra repetida (com e sem acento) e palavra já em uso em outro fluxo no ar", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const repetida: FlowDef = { ...def, nodes: def.nodes.map((n) => (n.type === "trigger" ? { ...n, keywords: ["preço", "PRECO"] } : n)) };
  assert.ok(codes(validateFlow(repetida, ok)).includes("palavra_repetida"));
  assert.ok(codes(validateFlow(def, { ...ok, keywordsInUse: [{ on: "comment", keyword: "Quero" }] })).includes("palavra_em_uso"));
  assert.deepEqual(validateFlow(def, { ...ok, keywordsInUse: [{ on: "dm", keyword: "quero" }] }), []);
});

test("bloco solto e ciclo sem condição", () => {
  const def = comCampanha(RECIPES.comment_invite.build());
  const solto: FlowDef = { ...def, nodes: [...def.nodes, { id: "perdido", type: "message", text: "x", button: null, wait: null }] };
  assert.ok(codes(validateFlow(solto, ok)).includes("bloco_solto"));
  const ciclo: FlowDef = {
    ...comCampanha(RECIPES.dm_invite.build()),
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "a", type: "message", text: "a", button: null, wait: { minutes: 60 } },
      { id: "b", type: "message", text: "b", button: null, wait: { minutes: 60 } },
    ],
    edges: [
      { from: "gatilho", out: "next", to: "a" },
      { from: "a", out: "replied", to: "b" },
      { from: "b", out: "replied", to: "a" },
    ],
  };
  assert.ok(codes(validateFlow(ciclo, ok)).includes("ciclo_sem_condicao"));
});
```

- [ ] **Step 2: rode e veja falhar.**

- [ ] **Step 3: implemente**

```ts
// apps/web/src/lib/ig/flow/validate.ts
import { normalizeForMatch } from "@/lib/ig/match-keyword";
import { utf8Bytes } from "./bytes";
import { hasNode, reachableIds, targetOf } from "./graph";
import {
  LINK_RESERVE_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_TEXT_WITH_BUTTON,
  MAX_WAIT_MINUTES,
  outsOf,
  type FlowDef,
  type FlowOut,
  type TriggerNode,
} from "./types";

export type IssueCode =
  | "sem_gatilho"
  | "gatilhos_demais"
  | "aresta_invalida"
  | "sem_palavra"
  | "palavra_repetida"
  | "palavra_em_uso"
  | "texto_vazio"
  | "texto_longo"
  | "botao_vazio"
  | "sem_campanha"
  | "campanha_inexistente"
  | "espera_longa"
  | "bloco_solto"
  | "botao_no_primeiro_direct"
  | "segundo_direct_sem_resposta"
  | "condicao_cedo"
  | "ciclo_sem_condicao"
  | "sem_conta";

export type Issue = { code: IssueCode; nodeId: string | null; text: string };

export type ValidateContext = {
  /** Slugs das campanhas da loja. `null` = não conferir (cliente sem a lista). */
  campaignSlugs: readonly string[] | null;
  /** `null` = não conferir. */
  accountConnected: boolean | null;
  /** Palavras dos outros fluxos no ar, por tipo de gatilho. */
  keywordsInUse: readonly { on: "comment" | "dm"; keyword: string }[];
};

/**
 * A mesma função roda no painel (lista "Pra publicar") e no servidor (POST
 * /publish). Devolve TUDO que falta, não só o primeiro problema: o lojista
 * resolve a lista de uma vez.
 */
export function validateFlow(def: FlowDef, ctx: ValidateContext): Issue[] {
  const issues: Issue[] = [];
  const add = (code: IssueCode, nodeId: string | null, text: string) => issues.push({ code, nodeId, text });

  const triggers = def.nodes.filter((n): n is TriggerNode => n.type === "trigger");
  if (triggers.length === 0) add("sem_gatilho", null, "O fluxo precisa de um gatilho.");
  if (triggers.length > 1) add("gatilhos_demais", null, "Só pode haver um gatilho por fluxo.");
  const trigger = triggers[0];

  const saidasUsadas = new Set<string>();
  for (const edge of def.edges) {
    const from = def.nodes.find((n) => n.id === edge.from);
    if (!from || !hasNode(def, edge.to) || !outsOf(from).includes(edge.out)) add("aresta_invalida", edge.from, "Ligação inválida.");
    const chave = `${edge.from}:${edge.out}`;
    if (saidasUsadas.has(chave)) add("aresta_invalida", edge.from, "Uma saída não pode ter duas ligações.");
    saidasUsadas.add(chave);
  }

  if (trigger) {
    const palavras = trigger.keywords.map((k) => k.trim()).filter(Boolean);
    if (palavras.length === 0) add("sem_palavra", trigger.id, "Escolha pelo menos uma palavra que dispara.");
    const normalizadas = new Set<string>();
    for (const palavra of palavras) {
      const n = normalizeForMatch(palavra);
      if (normalizadas.has(n)) add("palavra_repetida", trigger.id, `"${palavra}" aparece mais de uma vez.`);
      normalizadas.add(n);
    }
    for (const uso of ctx.keywordsInUse) {
      if (uso.on === trigger.on && normalizadas.has(normalizeForMatch(uso.keyword))) {
        add("palavra_em_uso", trigger.id, `"${uso.keyword}" já dispara outro fluxo no ar.`);
      }
    }
    if (trigger.on === "comment" && trigger.publicReply !== null && trigger.publicReply.trim() === "") {
      add("texto_vazio", trigger.id, "Escreva a resposta pública ou desligue a opção.");
    }
  }

  const alcancaveis = reachableIds(def);
  for (const node of def.nodes) {
    if (!alcancaveis.has(node.id)) add("bloco_solto", node.id, "Este bloco não está ligado ao fluxo.");
  }

  for (const node of def.nodes) {
    if (node.type === "message") {
      if (node.text.trim() === "") add("texto_vazio", node.id, "Escreva a mensagem deste direct.");
      if (node.button !== null) {
        if (node.button.trim() === "") add("botao_vazio", node.id, "Escreva o texto do botão ou tire o botão.");
        if ([...node.text].length > MAX_TEXT_WITH_BUTTON) add("texto_longo", node.id, `Com botão, a mensagem vai até ${MAX_TEXT_WITH_BUTTON} caracteres.`);
      } else if (utf8Bytes(node.text) > MAX_MESSAGE_BYTES) {
        add("texto_longo", node.id, `Mensagem longa demais: ${utf8Bytes(node.text)} de ${MAX_MESSAGE_BYTES} bytes.`);
      }
      if (node.wait && (node.wait.minutes < 1 || node.wait.minutes > MAX_WAIT_MINUTES)) add("espera_longa", node.id, "A espera vai de 1 minuto a 23 horas.");
    }
    if (node.type === "invite") {
      if (node.text.trim() === "") add("texto_vazio", node.id, "Escreva o texto do convite.");
      if (utf8Bytes(node.text) + LINK_RESERVE_BYTES > MAX_MESSAGE_BYTES) {
        add("texto_longo", node.id, `Convite longo demais: o texto mais o link passam de ${MAX_MESSAGE_BYTES} bytes.`);
      }
      if (node.campaignSlug === null) add("sem_campanha", node.id, "Escolha a campanha do convite.");
      else if (ctx.campaignSlugs && !ctx.campaignSlugs.includes(node.campaignSlug)) add("campanha_inexistente", node.id, "A campanha escolhida não existe mais.");
      if (node.remindAfterMinutes !== null && (node.remindAfterMinutes < 1 || node.remindAfterMinutes > MAX_WAIT_MINUTES)) {
        add("espera_longa", node.id, "O lembrete vai de 1 minuto a 23 horas.");
      }
    }
  }

  // Regras da Meta para quem chegou por comentário: 1 direct, sem botão, e
  // "segue a loja?" só depois de a pessoa mandar mensagem.
  if (trigger?.on === "comment") {
    const primeiroId = targetOf(def, trigger.id, "next");
    const primeiro = primeiroId ? def.nodes.find((n) => n.id === primeiroId) : undefined;
    if (primeiro?.type === "message" && primeiro.button !== null) {
      add("botao_no_primeiro_direct", primeiro.id, "O primeiro direct depois de um comentário não pode ter botão: o Instagram recusa pra quem não segue a loja, e a recusa gasta o único direct do comentário.");
    }
    for (const id of alcancavelSem(def, trigger.id, "replied")) {
      if (id === trigger.id || id === primeiroId) continue;
      const node = def.nodes.find((n) => n.id === id);
      if (!node) continue;
      if (node.type === "message" || node.type === "invite") {
        add("segundo_direct_sem_resposta", id, "Depois de um comentário só sai um direct. Este só pode vir depois de a pessoa responder.");
      }
      if (node.type === "condition") {
        add("condicao_cedo", id, "“Segue a loja?” só funciona depois de a pessoa responder: o Instagram só revela quem segue depois da primeira mensagem.");
      }
    }
  }

  for (const ciclo of ciclos(def)) {
    if (!ciclo.some((id) => def.nodes.find((n) => n.id === id)?.type === "condition")) {
      add("ciclo_sem_condicao", ciclo[0], "O fluxo volta pra um bloco sem passar por uma condição.");
    }
  }

  if (ctx.accountConnected === false) add("sem_conta", null, "Conecte o Instagram pra publicar.");
  return issues;
}

/** Ids alcançáveis a partir de `start` sem atravessar uma aresta `bloqueada`. */
function alcancavelSem(def: FlowDef, start: string, bloqueada: FlowOut): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of def.edges) {
      if (e.from === id && e.out !== bloqueada && !seen.has(e.to)) stack.push(e.to);
    }
  }
  return seen;
}

/** Cada ciclo como a lista de ids que ele atravessa (DFS com pilha). */
function ciclos(def: FlowDef): string[][] {
  const resultado: string[][] = [];
  const estado = new Map<string, "aberto" | "fechado">();
  const pilha: string[] = [];
  const visitar = (id: string) => {
    estado.set(id, "aberto");
    pilha.push(id);
    for (const e of def.edges) {
      if (e.from !== id) continue;
      const s = estado.get(e.to);
      if (s === "aberto") resultado.push(pilha.slice(pilha.indexOf(e.to)));
      else if (!s && hasNode(def, e.to)) visitar(e.to);
    }
    pilha.pop();
    estado.set(id, "fechado");
  };
  for (const n of def.nodes) if (!estado.has(n.id)) visitar(n.id);
  return resultado;
}

export type ChecklistItem = { chave: string; rotulo: string; ok: boolean };

const GRUPOS: { chave: string; rotulo: string; codes: IssueCode[] }[] = [
  { chave: "palavras", rotulo: "Palavras que disparam", codes: ["sem_gatilho", "gatilhos_demais", "sem_palavra", "palavra_repetida", "palavra_em_uso"] },
  { chave: "textos", rotulo: "Texto de cada direct", codes: ["texto_vazio", "texto_longo", "botao_vazio"] },
  { chave: "campanha", rotulo: "Campanha do convite", codes: ["sem_campanha", "campanha_inexistente"] },
  { chave: "regras", rotulo: "Regras do Instagram", codes: ["botao_no_primeiro_direct", "segundo_direct_sem_resposta", "condicao_cedo", "espera_longa"] },
  { chave: "ligacoes", rotulo: "Blocos ligados", codes: ["bloco_solto", "ciclo_sem_condicao", "aresta_invalida"] },
  { chave: "conta", rotulo: "Conta do Instagram conectada", codes: ["sem_conta"] },
];

/** A lista "Pra publicar" da tela: um item por grupo, feito ou pendente. */
export function checklist(issues: readonly Issue[]): ChecklistItem[] {
  return GRUPOS.map((g) => ({ chave: g.chave, rotulo: g.rotulo, ok: !issues.some((i) => g.codes.includes(i.code)) }));
}
```

- [ ] **Step 4: rode** → PASS (8 testes). **Step 5: commit** `git add apps/web/src/lib/ig/flow && git commit -m "feat(ig): flow validation with the Meta rules and the publish checklist"`.

### Task 5: operações de edição

**Files:**
- Create: `apps/web/src/lib/ig/flow/edit.ts`
- Test: `apps/web/src/lib/ig/flow/edit.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `graph.ts`, `recipes.ts` (`DEFAULT_TEXTS`), `linearize.ts` (Task 6; escreva o teste depois da Task 6 se preferir, mas o código abaixo já importa `linearize`).
- Produces: `NodePatch`, `updateNode(def, id, patch: NodePatch)`, `hasFollowGate(def)`, `canAddFollowGate(def)`, `setFollowGate(def, on)`, `hasReminder(def)`, `canAddReminder(def)`, `setReminder(def, on)`, `mainInvite(def)`.

- [ ] **Step 1: teste**

```ts
// apps/web/src/lib/ig/flow/edit.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { canAddFollowGate, canAddReminder, hasFollowGate, hasReminder, setFollowGate, setReminder, updateNode } from "./edit";
import { RECIPES } from "./recipes";

test("a receita simples mais resposta mais lembrete é exatamente a receita de seguir", () => {
  const simples = RECIPES.comment_invite.build();
  assert.equal(canAddFollowGate(simples), true);
  assert.equal(canAddReminder(simples), false, "sem resposta não há segundo direct");
  const comResposta = setFollowGate(simples, true);
  assert.equal(canAddReminder(comResposta), true);
  assert.deepEqual(setReminder(comResposta, true), RECIPES.comment_follow_invite.build());
});

test("tirar a resposta tira o lembrete junto e volta à receita simples", () => {
  const completa = RECIPES.comment_follow_invite.build();
  assert.equal(hasFollowGate(completa), true);
  assert.equal(hasReminder(completa), true);
  const semResposta = setFollowGate(completa, false);
  assert.equal(hasFollowGate(semResposta), false);
  assert.equal(hasReminder(semResposta), false);
  assert.deepEqual(semResposta, RECIPES.comment_invite.build());
});

test("no fluxo de direct o lembrete entra sem precisar da resposta", () => {
  const def = RECIPES.dm_invite.build();
  assert.equal(canAddFollowGate(def), false);
  assert.equal(canAddReminder(def), true);
  const com = setReminder(def, true);
  assert.ok(com.edges.some((e) => e.from === "convite" && e.out === "not_clicked" && e.to === "lembrete"));
  assert.deepEqual(setReminder(com, false), def);
});

test("mudar a campanha do convite muda a do lembrete; mudar o texto não", () => {
  const def = RECIPES.comment_follow_invite.build();
  const com = updateNode(def, "convite", { campaignSlug: "vip" });
  assert.equal(com.nodes.find((n) => n.id === "lembrete")?.type === "invite" && (com.nodes.find((n) => n.id === "lembrete") as { campaignSlug: string | null }).campaignSlug, "vip");
  const texto = updateNode(def, "convite", { text: "Novo" });
  assert.equal((texto.nodes.find((n) => n.id === "lembrete") as { campaignSlug: string | null }).campaignSlug, null);
  assert.equal(def.nodes.find((n) => n.id === "convite")?.type === "invite" && (def.nodes.find((n) => n.id === "convite") as { text: string }).text, "Oi! Aqui está o link do grupo VIP:", "não muta o original");
});
```

- [ ] **Step 2: rode e veja falhar.**

- [ ] **Step 3: implemente**

```ts
// apps/web/src/lib/ig/flow/edit.ts
import { nodeById, targetOf, triggerOf } from "./graph";
import { linearize } from "./linearize";
import { DEFAULT_TEXTS } from "./recipes";
import { MAX_WAIT_MINUTES, type FlowDef, type FlowEdge, type FlowNode, type FlowOut, type InviteNode, type MessageNode, type TriggerNode } from "./types";

/**
 * Edição por operações nomeadas (spec §6): o painel não mexe no grafo à mão,
 * chama estas funções. Todas devolvem um grafo novo; nada é mutado.
 */
export type NodePatch =
  | Partial<Omit<TriggerNode, "id" | "type">>
  | Partial<Omit<MessageNode, "id" | "type">>
  | Partial<Omit<InviteNode, "id" | "type">>;

export function updateNode(def: FlowDef, id: string, patch: NodePatch): FlowDef {
  let nodes = def.nodes.map((n) => (n.id === id ? ({ ...n, ...patch, id: n.id, type: n.type } as FlowNode) : n));
  // O lembrete repete o convite: mudou a campanha num, muda no outro.
  const alvo = nodes.find((n) => n.id === id);
  if (alvo?.type === "invite" && "campaignSlug" in patch) {
    const lembreteId = targetOf(def, id, "not_clicked");
    nodes = nodes.map((n) => (n.id === lembreteId && n.type === "invite" ? { ...n, campaignSlug: alvo.campaignSlug } : n));
  }
  return { ...def, nodes };
}

/** O primeiro convite da trilha principal. */
export function mainInvite(def: FlowDef): InviteNode | undefined {
  return linearize(def)
    .map((p) => p.node)
    .find((n): n is InviteNode => n.type === "invite");
}

export function hasFollowGate(def: FlowDef): boolean {
  return def.nodes.some((n) => n.type === "condition");
}

export function canAddFollowGate(def: FlowDef): boolean {
  const t = triggerOf(def);
  if (!t || t.on !== "comment" || hasFollowGate(def)) return false;
  const alvo = targetOf(def, t.id, "next");
  return alvo !== null && nodeById(def, alvo)?.type === "invite";
}

export function setFollowGate(def: FlowDef, on: boolean): FlowDef {
  const t = triggerOf(def);
  if (!t) return def;
  if (on) {
    if (!canAddFollowGate(def)) return def;
    const convite = targetOf(def, t.id, "next") as string;
    const pede = freshId(def, "pede");
    const segue = freshId(def, "segue");
    const pedeSeguir = freshId(def, "pede_seguir");
    const nodes: FlowNode[] = [
      ...def.nodes.filter((n) => n.id !== convite),
      { id: pede, type: "message", text: DEFAULT_TEXTS.pedeResposta, button: null, wait: { minutes: MAX_WAIT_MINUTES } },
      { id: segue, type: "condition", check: "follows" },
      { id: pedeSeguir, type: "message", text: DEFAULT_TEXTS.pedeSeguir, button: null, wait: { minutes: MAX_WAIT_MINUTES } },
      nodeById(def, convite) as FlowNode,
    ];
    const edges: FlowEdge[] = [
      ...def.edges.filter((e) => !(e.from === t.id && e.out === "next")),
      { from: t.id, out: "next", to: pede },
      { from: pede, out: "replied", to: segue },
      { from: segue, out: "yes", to: convite },
      { from: segue, out: "no", to: pedeSeguir },
      { from: pedeSeguir, out: "replied", to: segue },
    ];
    return ordenar({ ...def, nodes, edges });
  }
  const segue = def.nodes.find((n) => n.type === "condition");
  const pedeId = targetOf(def, t.id, "next");
  const pede = pedeId ? nodeById(def, pedeId) : undefined;
  if (!segue || !pede || pede.type !== "message" || targetOf(def, pede.id, "replied") !== segue.id) return def;
  const pedeSeguir = targetOf(def, segue.id, "no");
  const convite = targetOf(def, segue.id, "yes");
  const remover = new Set([segue.id, pede.id, pedeSeguir].filter((x): x is string => Boolean(x)));
  const base: FlowDef = {
    ...def,
    nodes: def.nodes.filter((n) => !remover.has(n.id)),
    edges: [...def.edges.filter((e) => !remover.has(e.from) && !remover.has(e.to)), ...(convite ? [{ from: t.id, out: "next", to: convite } as FlowEdge] : [])],
  };
  // Sem a resposta não há segundo direct: o lembrete cai junto.
  return ordenar(setReminder(base, false));
}

export function hasReminder(def: FlowDef): boolean {
  const inv = mainInvite(def);
  return !!inv && inv.remindAfterMinutes !== null;
}

export function canAddReminder(def: FlowDef): boolean {
  const inv = mainInvite(def);
  const t = triggerOf(def);
  if (!inv || !t || hasReminder(def)) return false;
  return t.on === "dm" || hasFollowGate(def);
}

export function setReminder(def: FlowDef, on: boolean): FlowDef {
  const inv = mainInvite(def);
  if (!inv) return def;
  if (on) {
    if (!canAddReminder(def)) return def;
    const lembrete = freshId(def, "lembrete");
    const nodes: FlowNode[] = [
      ...def.nodes.map((n) => (n.id === inv.id && n.type === "invite" ? { ...n, remindAfterMinutes: 60 } : n)),
      { id: lembrete, type: "invite", text: DEFAULT_TEXTS.lembrete, campaignSlug: inv.campaignSlug, remindAfterMinutes: null },
    ];
    return ordenar({ ...def, nodes, edges: [...def.edges, { from: inv.id, out: "not_clicked", to: lembrete }] });
  }
  const lembrete = targetOf(def, inv.id, "not_clicked");
  const nodes = def.nodes
    .filter((n) => n.id !== lembrete)
    .map((n) => (n.id === inv.id && n.type === "invite" ? { ...n, remindAfterMinutes: null } : n));
  const edges = def.edges.filter((e) => !(e.from === inv.id && e.out === "not_clicked") && e.from !== lembrete && e.to !== lembrete);
  return ordenar({ ...def, nodes, edges });
}

function freshId(def: FlowDef, base: string): string {
  let id = base;
  for (let i = 2; def.nodes.some((n) => n.id === id); i += 1) id = `${base}_${i}`;
  return id;
}

/** Ordem canônica (trilha primeiro, depois os desvios), para o deepEqual dos testes e um jsonb estável. */
function ordenar(def: FlowDef): FlowDef {
  const ordem = ["gatilho", "pede", "segue", "pede_seguir", "convite", "lembrete"];
  const saidas: FlowOut[] = ["next", "replied", "yes", "no", "clicked", "not_clicked", "timeout"];
  const posicao = (id: string) => (ordem.includes(id) ? ordem.indexOf(id) : ordem.length);
  const nodes = [...def.nodes].sort((a, b) => posicao(a.id) - posicao(b.id));
  const edges = [...def.edges].sort((a, b) => posicao(a.from) - posicao(b.from) || saidas.indexOf(a.out) - saidas.indexOf(b.out));
  return { ...def, nodes, edges };
}
```

- [ ] **Step 4: rode** → PASS. Se o `deepEqual` da receita falhar só pela ORDEM das arestas, ajuste `ordenar` (não a receita): `ordenar` existe para que receita e operação produzam o mesmo jsonb. **Step 5: commit** `git add apps/web/src/lib/ig/flow && git commit -m "feat(ig): named edit operations for the flow graph"`.

### Task 6: trilha (passo a passo) e posições (mapa)

**Files:**
- Create: `apps/web/src/lib/ig/flow/linearize.ts`
- Create: `apps/web/src/lib/ig/flow/layout.ts`
- Test: `apps/web/src/lib/ig/flow/linearize.test.ts`, `apps/web/src/lib/ig/flow/layout.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `graph.ts`.
- Produces: `Passo { node; ramos: Ramo[]; proximo: { out; to: string | null } | null }`, `Ramo { out; alvo: Passo | null; volta: string | null }`, `linearize(def): Passo[]`; `Layout { nodes: NodePos[]; edges: EdgePos[]; width; height }`, `layout(def)`, constantes `NODE_W = 250`, `NODE_H = 150`, `COL_PITCH = 281`, `ROW_PITCH = 230`, `PAD = 30`.

- [ ] **Step 1: testes**

```ts
// apps/web/src/lib/ig/flow/linearize.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { linearize } from "./linearize";
import { RECIPES } from "./recipes";

test("a trilha segue respondeu → segue a loja → clicou, e os desvios ficam pendurados", () => {
  const trilha = linearize(RECIPES.comment_follow_invite.build());
  assert.deepEqual(trilha.map((p) => p.node.id), ["gatilho", "pede", "segue", "convite"]);
  assert.deepEqual(trilha[1].ramos.map((r) => [r.out, r.alvo?.node.id ?? null, r.volta]), [["timeout", null, null]]);
  const naoSegue = trilha[2].ramos.find((r) => r.out === "no");
  assert.equal(naoSegue?.alvo?.node.id, "pede_seguir");
  assert.deepEqual(naoSegue?.alvo?.ramos.map((r) => [r.out, r.volta]), [["replied", "segue"], ["timeout", null]]);
  assert.equal(trilha[3].ramos.find((r) => r.out === "not_clicked")?.alvo?.node.id, "lembrete");
  assert.deepEqual(trilha[3].proximo, { out: "clicked", to: null });
});

test("sem gatilho não há trilha", () => {
  assert.deepEqual(linearize({ v: 1, nodes: [], edges: [] }), []);
});
```

```ts
// apps/web/src/lib/ig/flow/layout.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { COL_PITCH, NODE_W, PAD, layout } from "./layout";
import { RECIPES } from "./recipes";

test("a trilha vira a espinha e os desvios descem da coluna de origem", () => {
  const l = layout(RECIPES.comment_follow_invite.build());
  const pos = Object.fromEntries(l.nodes.map((n) => [n.id, [n.coluna, n.linha]]));
  assert.deepEqual(pos, { gatilho: [0, 0], pede: [1, 0], segue: [2, 0], pede_seguir: [2, 1], convite: [3, 0], lembrete: [3, 1] });
  assert.equal(l.nodes.find((n) => n.id === "pede")?.x, PAD + COL_PITCH);
  assert.equal(l.width, PAD * 2 + 3 * COL_PITCH + NODE_W);
  assert.deepEqual(
    l.edges.map((e) => `${e.from}>${e.to}:${e.kind}`).sort(),
    ["convite>lembrete:desvio", "gatilho>pede:principal", "pede>segue:principal", "pede_seguir>segue:volta", "segue>convite:principal", "segue>pede_seguir:desvio"],
  );
});
```

- [ ] **Step 2: rode e veja falhar.**

- [ ] **Step 3: implemente**

```ts
// apps/web/src/lib/ig/flow/linearize.ts
import { nodeById, targetOf, triggerOf } from "./graph";
import { MAIN_OUTS, outsOf, type FlowDef, type FlowNode, type FlowOut } from "./types";

export type Ramo = {
  out: FlowOut;
  /** O bloco em que o desvio chega, com os próprios desvios; `null` = "Parou aqui" ou volta. */
  alvo: Passo | null;
  /** Id de um bloco da trilha para onde o desvio volta (ciclo). */
  volta: string | null;
};

export type Passo = {
  node: FlowNode;
  ramos: Ramo[];
  /** A saída principal e para onde ela vai; `to: null` = fim do fluxo. */
  proximo: { out: FlowOut; to: string | null } | null;
};

function saidaPrincipal(node: FlowNode): FlowOut | null {
  const outs = outsOf(node);
  return MAIN_OUTS.find((out) => outs.includes(out)) ?? null;
}

/**
 * A visão "Passo a passo": a trilha principal segue `next`, `replied`, `yes`,
 * `clicked` (nessa preferência); as outras saídas viram desvios pendurados no
 * passo. O mesmo grafo alimenta o mapa (`layout.ts`).
 */
export function linearize(def: FlowDef): Passo[] {
  const start = triggerOf(def);
  if (!start) return [];
  const principais: FlowNode[] = [];
  const naTrilha = new Set<string>();
  for (let atual: FlowNode | undefined = start; atual && !naTrilha.has(atual.id); ) {
    naTrilha.add(atual.id);
    principais.push(atual);
    const principal = saidaPrincipal(atual);
    const proximoId = principal ? targetOf(def, atual.id, principal) : null;
    atual = proximoId ? nodeById(def, proximoId) : undefined;
  }
  return principais.map((node) => {
    const principal = saidaPrincipal(node);
    return {
      node,
      proximo: principal ? { out: principal, to: targetOf(def, node.id, principal) } : null,
      ramos: outsOf(node)
        .filter((out) => out !== principal)
        .map((out) => ramo(def, node.id, out, naTrilha, new Set())),
    };
  });
}

function ramo(def: FlowDef, from: string, out: FlowOut, naTrilha: Set<string>, visitados: Set<string>): Ramo {
  const alvoId = targetOf(def, from, out);
  if (!alvoId) return { out, alvo: null, volta: null };
  if (naTrilha.has(alvoId) || visitados.has(alvoId)) return { out, alvo: null, volta: alvoId };
  const node = nodeById(def, alvoId);
  if (!node) return { out, alvo: null, volta: null };
  const vistos = new Set(visitados).add(alvoId);
  return {
    out,
    volta: null,
    alvo: { node, proximo: null, ramos: outsOf(node).map((o) => ramo(def, node.id, o, naTrilha, vistos)) },
  };
}
```

```ts
// apps/web/src/lib/ig/flow/layout.ts
import { linearize, type Passo } from "./linearize";
import type { FlowDef, FlowOut } from "./types";

export const NODE_W = 250;
export const NODE_H = 150;
export const COL_PITCH = 281;
export const ROW_PITCH = 230;
export const PAD = 30;

export type NodePos = { id: string; coluna: number; linha: number; x: number; y: number };
export type EdgePos = { from: string; out: FlowOut; to: string; kind: "principal" | "desvio" | "volta" };
export type Layout = { nodes: NodePos[]; edges: EdgePos[]; width: number; height: number };

/**
 * A visão "Mapa", só leitura na fase 1: a trilha na espinha (linha 0), cada
 * desvio na coluna do bloco de origem, uma linha abaixo. Posições calculadas,
 * não guardadas; passam a ser guardadas quando o mapa for editável (fase 5).
 */
export function layout(def: FlowDef): Layout {
  const trilha = linearize(def);
  const nodes: NodePos[] = [];
  const edges: EdgePos[] = [];
  const proximaLinha = new Map<number, number>();

  const colocar = (id: string, coluna: number, linha: number) =>
    nodes.push({ id, coluna, linha, x: PAD + coluna * COL_PITCH, y: PAD + linha * ROW_PITCH });

  const colocarRamos = (passo: Passo, coluna: number) => {
    for (const r of passo.ramos) {
      if (r.volta) {
        edges.push({ from: passo.node.id, out: r.out, to: r.volta, kind: "volta" });
        continue;
      }
      if (!r.alvo) continue;
      const linha = proximaLinha.get(coluna) ?? 1;
      proximaLinha.set(coluna, linha + 1);
      colocar(r.alvo.node.id, coluna, linha);
      edges.push({ from: passo.node.id, out: r.out, to: r.alvo.node.id, kind: "desvio" });
      colocarRamos(r.alvo, coluna);
    }
  };

  trilha.forEach((passo, coluna) => {
    colocar(passo.node.id, coluna, 0);
    if (passo.proximo?.to) edges.push({ from: passo.node.id, out: passo.proximo.out, to: passo.proximo.to, kind: "principal" });
    colocarRamos(passo, coluna);
  });

  const colunas = Math.max(1, trilha.length);
  const linhas = Math.max(1, ...[...proximaLinha.values()]);
  return {
    nodes,
    edges,
    width: PAD * 2 + (colunas - 1) * COL_PITCH + NODE_W,
    height: PAD * 2 + (linhas - 1) * ROW_PITCH + NODE_H,
  };
}
```

- [ ] **Step 4: rode todos os testes da pasta** — `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test "src/lib/ig/flow/*.test.ts"` → PASS. **Step 5: commit** `git add apps/web/src/lib/ig/flow && git commit -m "feat(ig): linearize the flow for the step view and lay it out for the map"`.

### PR A — gate e entrega

- [ ] Rode o gate (seção "Antes de começar"). `tsc` dos dois projetos limpo; `painel:check` não toca nesta pasta.
- [ ] `git push -u origin feat/ig-flow-model`, PR "feat(ig): pure flow model for the Instagram flows (phase 1, PR A)" com corpo: o que entra (modelo, receitas, validação, edição, trilha, mapa), "sem rota, sem banco, sem tela", e o link do spec. Se o classificador recusar push/merge, passe os comandos ao Igor:

```powershell
git push -u origin feat/ig-flow-model
gh pr create --fill
gh pr checks --watch
gh pr merge --squash --delete-branch
```

- [ ] Mergeado: `git fetch origin main` e siga para o PR B a partir de `origin/main`.

# PR B — schema e stores

Branch `feat/ig-flows-schema`. Migração, `apply-order.txt`, baseline, `tenant_settings.instagramEnabled`, stores `ig-flows` e `ig-accounts`.

### Task 7: migração `ig_fluxos`

**Files:**
- Create: `apps/web/supabase/migrations/20261003120000_ig_fluxos.sql`
- Modify: `deploy/supabase/apply-order.txt` (acrescentar no fim)
- Modify: `deploy/supabase/schema-baseline.json` (regenerado, não editado à mão)

**Interfaces:**
- Produces: tabelas `ig_flows`, `ig_runs`, `ig_run_steps`; colunas novas em `ig_accounts` (`provider`, `provider_account_id`, `provider_profile_id`; token nulável); `tenant_settings.instagram_enabled`; remove `ig_triggers` e `ig_events`.

- [ ] **Step 1: confira por SQL o estado atual nos dois bancos** (leitura; pode rodar você mesmo):

```sql
select (select count(*) from public.ig_triggers) as ig_triggers,
       (select count(*) from public.ig_events) as ig_events,
       (select count(*) from public.ig_accounts) as ig_accounts,
       exists (select 1 from information_schema.columns where table_name = 'tenant_settings' and column_name = 'instagram_enabled') as flag_existe;
```

Esperado em 02/10: `0, 0, 0, false` nos dois. Se `ig_triggers` ou `ig_events` tiver linha, pare e pergunte ao Igor.

- [ ] **Step 2: escreva a migração**

```sql
-- apps/web/supabase/migrations/20261003120000_ig_fluxos.sql
-- Fluxos do Instagram, fase 1 (spec docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md §7).
--
-- O IG Connect de 16/08 previa app próprio na Meta: OAuth nosso, token cifrado,
-- refresh de 60 dias, gatilho de 1 mensagem (ig_triggers) e log de atendimento
-- (ig_events). Em 01/10 a integração passou a ser pela Zernio, que guarda o
-- token, e o produto virou um fluxo de vários passos. Esta migração adapta
-- ig_accounts, apaga as duas tabelas que nunca receberam código nem linha e cria
-- o modelo novo: ig_flows (o grafo, em jsonb), ig_runs (uma pessoa passando pelo
-- fluxo) e ig_run_steps (cada transição; é a fonte dos números). As três tabelas
-- do motor já nascem aqui para não repetir a rodada de DDL na fase 2.
--
-- LGPD: continuamos sem guardar texto de comentário ou direct. Só a palavra que
-- casou, o id escopado da pessoa, o @ e datas. Retenção de 90 dias (fase 3).
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json.

-- ------------------------------------------------------------
-- 1) ig_accounts: conectada pela Zernio, não por token nosso
-- ------------------------------------------------------------
alter table public.ig_accounts
  add column if not exists provider text not null default 'zernio',
  add column if not exists provider_account_id text,
  add column if not exists provider_profile_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ig_accounts_provider_check') then
    alter table public.ig_accounts
      add constraint ig_accounts_provider_check check (provider in ('zernio', 'meta'));
  end if;
end $$;

-- Quem guarda o token é o provedor; as colunas ficam para o plano B (app próprio).
alter table public.ig_accounts alter column access_token_enc drop not null;
alter table public.ig_accounts alter column token_expires_at drop not null;

comment on column public.ig_accounts.provider_account_id is
  'Id da conta no provedor (Zernio: account.accountId do webhook). Chave de roteamento do webhook, única.';
comment on column public.ig_accounts.provider_profile_id is
  'Perfil do tenant no provedor (Zernio: um perfil por loja).';

create unique index if not exists ig_accounts_provider_account_uidx
  on public.ig_accounts (provider_account_id)
  where provider_account_id is not null;

-- A policy antiga dependia de current_setting('app.tenant_id'), que o app nunca
-- seta (nega tudo). Troca pelo padrão que funciona: auth.uid() + memberships.
drop policy if exists "ig_accounts_tenant_isolation" on public.ig_accounts;
drop policy if exists "ig_accounts_tenant_read" on public.ig_accounts;
create policy "ig_accounts_tenant_read" on public.ig_accounts
  for select using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.ig_accounts from authenticated;

-- ------------------------------------------------------------
-- 2) ig_triggers e ig_events saem (nunca tiveram código nem linha)
-- ------------------------------------------------------------
do $$
declare
  n bigint;
begin
  if to_regclass('public.ig_triggers') is not null then
    execute 'select count(*) from public.ig_triggers' into n;
    if n > 0 then raise exception 'ig_triggers tem % linha(s); migre antes de apagar', n; end if;
  end if;
  if to_regclass('public.ig_events') is not null then
    execute 'select count(*) from public.ig_events' into n;
    if n > 0 then raise exception 'ig_events tem % linha(s); migre antes de apagar', n; end if;
  end if;
end $$;

drop table if exists public.ig_events;
drop table if exists public.ig_triggers;

-- ------------------------------------------------------------
-- 3) ig_flows: o fluxo (rascunho e publicado, em jsonb)
-- ------------------------------------------------------------
create table if not exists public.ig_flows (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.organizations(id) on delete cascade,
  -- Nulo enquanto a loja não conectou a conta: dá pra montar o rascunho antes.
  ig_account_id  uuid references public.ig_accounts(id) on delete set null,
  name           text not null check (char_length(name) between 1 and 80),
  recipe         text not null check (recipe in ('comment_invite', 'comment_follow_invite', 'dm_invite', 'blank')),
  status         text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  -- O grafo: { v, nodes[], edges[] }. Forma validada no app (lib/ig/flow/schema.ts).
  draft          jsonb not null,
  published      jsonb,
  version        integer not null default 0,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.ig_flows is
  'Fluxo do Instagram de uma loja: rascunho editável (draft) e a versão no ar (published), ambos o mesmo grafo em jsonb.';

create index if not exists ig_flows_tenant_idx on public.ig_flows (tenant_id, updated_at desc);

alter table public.ig_flows enable row level security;
drop policy if exists "ig_flows_tenant_read" on public.ig_flows;
create policy "ig_flows_tenant_read" on public.ig_flows
  for select using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.ig_flows from authenticated;

-- ------------------------------------------------------------
-- 4) ig_runs: uma pessoa passando por um fluxo
-- ------------------------------------------------------------
create table if not exists public.ig_runs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.organizations(id) on delete cascade,
  ig_account_id      uuid not null references public.ig_accounts(id) on delete cascade,
  flow_id            uuid not null references public.ig_flows(id) on delete cascade,
  flow_version       integer not null,
  source_kind        text not null check (source_kind in ('comment', 'dm', 'story')),
  -- comment id ou message id da Meta. ÚNICO GLOBAL: é a idempotência do webhook
  -- (a Zernio reentrega) e a trava de 1 resposta privada por comentário.
  source_id          text not null,
  -- Id escopado da pessoa (IGSID). Não é o @ e não reidentifica fora do app.
  ig_user_id         text not null,
  username           text,
  matched_keyword    text,
  -- Referência aleatória que vai no link (/r/<slug>?ig=<ref>) e nos botões.
  -- Nunca dado pessoal; é o que liga o clique ao run.
  ref                text not null,
  status             text not null default 'queued'
                       check (status in ('queued', 'active', 'done', 'stopped', 'failed')),
  node_id            text,
  waiting            text check (waiting in ('reply', 'click')),
  wake_at            timestamptz,
  window_expires_at  timestamptz,
  clicked_at         timestamptz,
  error_code         text,
  error_message      text,
  started_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  finished_at        timestamptz
);

comment on table public.ig_runs is
  'Uma linha por pessoa que entrou num fluxo do Instagram. source_id único = idempotência; ref vai no link e atribui o clique. Retenção 90 dias.';

create unique index if not exists ig_runs_source_uidx on public.ig_runs (source_id);
create unique index if not exists ig_runs_ref_uidx on public.ig_runs (ref);
create index if not exists ig_runs_flow_idx on public.ig_runs (tenant_id, flow_id, started_at desc);
create index if not exists ig_runs_person_idx on public.ig_runs (tenant_id, flow_id, ig_user_id, started_at desc);
-- O relógio da fase 3 (lembrete) só olha run ativo com hora marcada.
create index if not exists ig_runs_wake_idx on public.ig_runs (wake_at) where status = 'active' and wake_at is not null;

alter table public.ig_runs enable row level security;
drop policy if exists "ig_runs_tenant_read" on public.ig_runs;
create policy "ig_runs_tenant_read" on public.ig_runs
  for select using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.ig_runs from authenticated;

-- ------------------------------------------------------------
-- 5) ig_run_steps: cada transição; a fonte dos números por passo
-- ------------------------------------------------------------
create table if not exists public.ig_run_steps (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references public.organizations(id) on delete cascade,
  flow_id      uuid not null references public.ig_flows(id) on delete cascade,
  run_id       uuid not null references public.ig_runs(id) on delete cascade,
  node_id      text not null,
  "out"        text not null,
  occurred_at  timestamptz not null default now()
);

comment on table public.ig_run_steps is
  'Uma linha por saída tomada num run (bloco + saída). Agrupada por (node_id, out) vira o número de cada passo nas duas visões.';

create index if not exists ig_run_steps_flow_idx on public.ig_run_steps (tenant_id, flow_id, occurred_at desc);

alter table public.ig_run_steps enable row level security;
drop policy if exists "ig_run_steps_tenant_read" on public.ig_run_steps;
create policy "ig_run_steps_tenant_read" on public.ig_run_steps
  for select using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.ig_run_steps from authenticated;

-- ------------------------------------------------------------
-- 6) A liberação por loja (add-on). Ligada à mão até a fase 4 (cobrança).
-- ------------------------------------------------------------
alter table public.tenant_settings
  add column if not exists instagram_enabled boolean not null default false;

comment on column public.tenant_settings.instagram_enabled is
  'Add-on Instagram liberado para a loja. Até a fase 4 é ligado à mão; depois, pelo webhook do Stripe.';
```

- [ ] **Step 3: registre no `apply-order.txt`** (acrescente no fim do arquivo):

```
# 2026-10-03 - Fluxos do Instagram, fase 1 (spec 2026-10-02): ig_accounts ganha provider e
# provider_account_id (Zernio) e solta o token; ig_triggers e ig_events (vazias, sem codigo)
# saem; entram ig_flows, ig_runs, ig_run_steps e tenant_settings.instagram_enabled.
# Aplicado nos dois bancos.
apps/web/supabase/migrations/20261003120000_ig_fluxos.sql
```

- [ ] **Step 4: PEÇA AO IGOR para aplicar nos dois bancos e regenerar a baseline** (DDL em prod é dele). Comandos, PowerShell, numa pasta vazia fora do repositório (`$w`) e com a raiz do repositório em `$repo`:

```powershell
$w = "C:\Users\Igor\sb-tmp"; New-Item -ItemType Directory -Force $w | Out-Null
$repo = "C:\Users\Igor\Desktop\HubFlow-platform"
npx supabase --workdir $w link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase --workdir $w db query --linked -f "$repo\apps\web\supabase\migrations\20261003120000_ig_fluxos.sql"
npx supabase --workdir $w link --project-ref nidoatbxaylrkcgbszns --yes
npx supabase --workdir $w db query --linked -f "$repo\apps\web\supabase\migrations\20261003120000_ig_fluxos.sql"
```

Depois, com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **de produção** no ambiente, na raiz do repositório: `npm run schema:baseline`. O arquivo `deploy/supabase/schema-baseline.json` muda; entra neste PR.

- [ ] **Step 5: confira** com o SQL do Step 1 (agora `ig_triggers`/`ig_events` não existem; `flag_existe = true`) e rode `npm run check:drift` se tiver as credenciais de dev no ambiente (`E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY`); senão o job `drift` do CI confere.

- [ ] **Step 6: commit**

```bash
git add apps/web/supabase/migrations/20261003120000_ig_fluxos.sql deploy/supabase/apply-order.txt deploy/supabase/schema-baseline.json
git commit -m "feat(ig): schema for Instagram flows, runs and the per-tenant add-on flag"
```

### Task 8: `instagramEnabled` em `tenant_settings`

**Files:**
- Modify: `apps/web/src/lib/stores/tenant-settings.ts`

**Interfaces:**
- Produces: `TenantSettings.instagramEnabled: boolean` (só leitura; a loja não liga pela API).

- [ ] **Step 1: edite o store**. Em `TenantSettings` acrescente `/** Add-on Instagram liberado (fase 1: à mão; fase 4: pelo Stripe). Só leitura pela API. */ instagramEnabled: boolean;`. Logo abaixo de `const SEGMENT_COLUMNS = "segment";` acrescente:

```ts
const INSTAGRAM_COLUMNS = "instagram_enabled";
/** Sem a coluna `instagram_enabled` (banco anterior à migração 20261003120000). */
const PRE_INSTAGRAM_COLUMNS = `${LEGACY_ALL_COLUMNS}, ${SEGMENT_COLUMNS}`;
```

e troque `const ALL_COLUMNS = \`${LEGACY_ALL_COLUMNS}, ${SEGMENT_COLUMNS}\`;` por `const ALL_COLUMNS = \`${PRE_INSTAGRAM_COLUMNS}, ${INSTAGRAM_COLUMNS}\`;`. Em `SettingsRow` acrescente `instagram_enabled?: boolean | null;`. Em `toSettings` acrescente `instagramEnabled: row?.instagram_enabled ?? false,`. Em `getTenantSettings`, a cadeia de leitura vira:

```ts
  let { data, error } = await read(ALL_COLUMNS);
  if (isMissingColumn(error)) ({ data, error } = await read(PRE_INSTAGRAM_COLUMNS));
  if (isMissingColumn(error)) ({ data, error } = await read(LEGACY_ALL_COLUMNS));
  if (isMissingColumn(error)) ({ data, error } = await read(BASE_COLUMNS));
```

Em `updateTenantSettings` **não** acrescente o campo ao input (a loja não liga o add-on). O primeiro `write(..., ALL_COLUMNS)` ganha o mesmo degrau: depois dele, `if (isMissingColumn(error)) ({ data, error } = await write({ ...base, ...onboarding, ...preferences, ...segmento }, PRE_INSTAGRAM_COLUMNS));` antes do degrau `LEGACY_ALL_COLUMNS` que já existe.

- [ ] **Step 2:** `npm --workspace apps/web test` (há testes que importam o store) e `tsc` do projeto principal → limpos.

- [ ] **Step 3: commit** `git add apps/web/src/lib/stores/tenant-settings.ts && git commit -m "feat(ig): read the instagram_enabled flag from tenant_settings"`.

### Task 9: stores `ig-flows` e `ig-accounts`

**Files:**
- Create: `apps/web/src/lib/stores/ig-flows.ts`
- Create: `apps/web/src/lib/stores/ig-accounts.ts`
- Test: `apps/web/src/lib/stores/ig-flows.test.ts`

**Interfaces:**
- Consumes: `FlowDef` (Task 1), `RecipeId` (Task 3).
- Produces: `FlowRow`, `FlowSummary`, `FlowStatus`, `listFlows(tenantId)`, `getFlow(tenantId, id)`, `createFlow(tenantId, { name, recipe, draft })`, `updateDraft(tenantId, id, { name?, draft? })`, `deleteFlow(tenantId, id)`, `publishFlow(tenantId, id, def, fromVersion)`, `listLiveFlows(tenantId)`; `IgAccount`, `getAccount(tenantId)`.

- [ ] **Step 1: teste com o PostgREST falso** (mesmo desenho de `group-member-events.test.ts`)

```ts
// apps/web/src/lib/stores/ig-flows.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { getAccount } from "./ig-accounts";
import { deleteFlow, listFlows, updateDraft } from "./ig-flows";

/**
 * O cliente real do Supabase contra um PostgREST de mentira: a query que sai é a
 * de produção, só a rede é trocada. É o que prova, sem banco, o filtro de loja
 * em cada chamada — o service-role passa por cima do RLS.
 */
type Pedido = { metodo: string; url: URL; accept: string; corpo: unknown };
const pedidos: Pedido[] = [];

const linha = { id: "f1", tenant_id: "loja-a", ig_account_id: null, name: "Comentou, entra no grupo", recipe: "comment_invite", status: "draft", draft: { v: 1, nodes: [], edges: [] }, published: null, version: 0, published_at: null, created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-03T00:00:00Z" };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    const accept = String(req.headers.accept ?? "");
    pedidos.push({ metodo: req.method ?? "", url, accept, corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(accept.includes("pgrst.object") ? linha : [linha]));
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

test("lista só os fluxos da loja, do mais recente", async () => {
  pedidos.length = 0;
  const lista = await listFlows("loja-a");
  assert.equal(lista.length, 1);
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["GET", "/rest/v1/ig_flows"]);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", order: "updated_at.desc", limit: "200" });
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("draft"), "a lista não carrega o grafo");
});

test("salvar o rascunho e apagar filtram loja E id", async () => {
  pedidos.length = 0;
  await updateDraft("loja-a", "f1", { draft: { v: 1, nodes: [], edges: [] } });
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.f1" });
  assert.deepEqual(Object.keys(pedidos[0].corpo as object).sort(), ["draft", "updated_at"]);
  await deleteFlow("loja-a", "f1");
  assert.equal(pedidos[1].metodo, "DELETE");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", id: "eq.f1" });
});

test("a conta nunca sai com o token", async () => {
  pedidos.length = 0;
  await getAccount("loja-a");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a" });
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("access_token"));
});
```

- [ ] **Step 2: rode e veja falhar.**

- [ ] **Step 3: implemente**

```ts
// apps/web/src/lib/stores/ig-flows.ts
import "server-only";

import type { RecipeId } from "@/lib/ig/flow/recipes";
import type { FlowDef } from "@/lib/ig/flow/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Fluxos do Instagram. Supabase-only, sem fallback JSON. Todo acesso filtra
 * `tenant_id`: o service-role bypassa RLS, então o filtro é a proteção real.
 */
export type FlowStatus = "draft" | "live" | "paused";

export type FlowRow = {
  id: string;
  tenant_id: string;
  ig_account_id: string | null;
  name: string;
  recipe: RecipeId;
  status: FlowStatus;
  draft: FlowDef;
  published: FlowDef | null;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FlowSummary = Pick<FlowRow, "id" | "name" | "recipe" | "status" | "version" | "updated_at" | "published_at">;

const COLS = "id, tenant_id, ig_account_id, name, recipe, status, draft, published, version, published_at, created_at, updated_at";
const SUMMARY_COLS = "id, name, recipe, status, version, updated_at, published_at";

export async function listFlows(tenantId: string): Promise<FlowSummary[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_flows")
    .select(SUMMARY_COLS)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FlowSummary[];
}

export async function getFlow(tenantId: string, id: string): Promise<FlowRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_flows").select(COLS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FlowRow | null) ?? null;
}

export async function createFlow(tenantId: string, input: { name: string; recipe: RecipeId; draft: FlowDef }): Promise<FlowRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_flows")
    .insert({ tenant_id: tenantId, name: input.name, recipe: input.recipe, draft: input.draft })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as FlowRow;
}

/** Só o rascunho muda aqui; o publicado só muda em `publishFlow`. */
export async function updateDraft(tenantId: string, id: string, input: { name?: string; draft?: FlowDef }): Promise<FlowRow | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.draft !== undefined) patch.draft = input.draft;
  const { data, error } = await getSupabaseAdmin().from("ig_flows").update(patch).eq("tenant_id", tenantId).eq("id", id).select(COLS).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FlowRow | null) ?? null;
}

export async function deleteFlow(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("ig_flows").delete().eq("tenant_id", tenantId).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Copia o rascunho validado para `published` e sobe a versão. O `.eq("version")`
 * é a trava otimista: duas abas publicando ao mesmo tempo, só uma ganha.
 */
export async function publishFlow(tenantId: string, id: string, def: FlowDef, fromVersion: number): Promise<FlowRow | null> {
  const agora = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("ig_flows")
    .update({ draft: def, published: def, status: "live", version: fromVersion + 1, published_at: agora, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("version", fromVersion)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FlowRow | null) ?? null;
}

/** Os fluxos no ar, com o grafo publicado: é de onde saem as palavras em uso. */
export async function listLiveFlows(tenantId: string): Promise<Pick<FlowRow, "id" | "published">[]> {
  const { data, error } = await getSupabaseAdmin().from("ig_flows").select("id, published").eq("tenant_id", tenantId).eq("status", "live");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Pick<FlowRow, "id" | "published">[];
}
```

```ts
// apps/web/src/lib/stores/ig-accounts.ts
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export type IgAccount = {
  id: string;
  username: string;
  status: "active" | "expired" | "revoked" | "disconnected";
  provider: "zernio" | "meta";
  provider_account_id: string | null;
  connected_at: string;
};

/** A conta do Instagram da loja. NUNCA seleciona `access_token_enc`. */
export async function getAccount(tenantId: string): Promise<IgAccount | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_accounts")
    .select("id, username, status, provider, provider_account_id, connected_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IgAccount | null) ?? null;
}
```

- [ ] **Step 4: rode** → PASS (3 testes). **Step 5: commit** `git add apps/web/src/lib/stores/ig-flows.ts apps/web/src/lib/stores/ig-flows.test.ts apps/web/src/lib/stores/ig-accounts.ts && git commit -m "feat(ig): stores for flows and the connected account, tenant-filtered"`.

### PR B — gate e entrega

- [ ] Gate completo (inclui `scan:secrets`: a chave falsa é `"chave-do-postgrest-falso"`, nunca `eyJ…`).
- [ ] PR "feat(ig): schema and stores for the Instagram flows (phase 1, PR B)". No corpo, diga que a migração **já está aplicada nos dois bancos** e que a baseline foi regenerada; o job `drift` do CI confirma.
- [ ] Mergeado → `git fetch origin main` → PR C.

# PR C — API

Branch `feat/ig-flows-api`. Rotas em `apps/web/src/app/api/ig/**`, liberação por loja e as palavras em uso.

### Task 10: liberação, palavras em uso e `GET /api/ig/status`

**Files:**
- Create: `apps/web/src/lib/ig/access.ts`
- Create: `apps/web/src/lib/ig/flow/in-use.ts`
- Create: `apps/web/src/app/api/ig/status/route.ts`
- Test: `apps/web/src/lib/ig/flow/in-use.test.ts`

**Interfaces:**
- Consumes: `getTenantContext`, `getTenantSettings`, `getAccount`, `listFlows`, `triggerOf`.
- Produces: `requireInstagram(req): Promise<TenantContext>` (403 `{ error, code: "instagram_disabled" }` sem a liberação); `keywordsInUse(flows, exceptId)`; `GET /api/ig/status → { enabled: boolean; account: { username; status } | null; live: number }`.

- [ ] **Step 1: teste das palavras em uso**

```ts
// apps/web/src/lib/ig/flow/in-use.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { keywordsInUse } from "./in-use";
import { RECIPES } from "./recipes";

test("junta as palavras dos outros fluxos no ar, por tipo de gatilho, e ignora o próprio", () => {
  const flows = [
    { id: "a", published: RECIPES.comment_invite.build() },
    { id: "b", published: RECIPES.dm_invite.build() },
    { id: "c", published: null },
  ];
  assert.deepEqual(keywordsInUse(flows, "a"), [
    { on: "dm", keyword: "quero" },
    { on: "dm", keyword: "grupo" },
  ]);
  assert.equal(keywordsInUse(flows, "zzz").length, 4);
});
```

- [ ] **Step 2: implemente**

```ts
// apps/web/src/lib/ig/flow/in-use.ts
import { triggerOf } from "./graph";
import type { FlowDef } from "./types";

/** As palavras que já disparam outro fluxo no ar: a mesma palavra em dois fluxos daria dois directs. */
export function keywordsInUse(flows: readonly { id: string; published: FlowDef | null }[], exceptId: string): { on: "comment" | "dm"; keyword: string }[] {
  const lista: { on: "comment" | "dm"; keyword: string }[] = [];
  for (const flow of flows) {
    if (flow.id === exceptId || !flow.published) continue;
    const trigger = triggerOf(flow.published);
    if (!trigger) continue;
    for (const keyword of trigger.keywords) lista.push({ on: trigger.on, keyword });
  }
  return lista;
}
```

```ts
// apps/web/src/lib/ig/access.ts
import "server-only";

import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getTenantContext, type TenantContext } from "@/lib/supabase/tenant-context";

/**
 * Sessão + liberação do add-on. O código fixo deixa a tela distinguir "sem
 * sessão" (401) de "loja sem o Instagram" (403) e mostrar o aviso certo.
 */
export async function requireInstagram(req: Request): Promise<TenantContext> {
  const ctx = await getTenantContext(req);
  const settings = await getTenantSettings(ctx.tenantId);
  if (!settings.instagramEnabled) {
    throw Response.json({ error: "O Instagram não está liberado para esta loja.", code: "instagram_disabled" }, { status: 403 });
  }
  return ctx;
}
```

```ts
// apps/web/src/app/api/ig/status/route.ts
import { getAccount } from "@/lib/stores/ig-accounts";
import { listFlows } from "@/lib/stores/ig-flows";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ig/status — o que a casca precisa: liberado? conta? quantos no ar?
// Qualquer loja logada pode perguntar; sem a liberação a resposta é só `enabled: false`.
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const settings = await getTenantSettings(ctx.tenantId);
    if (!settings.instagramEnabled) return Response.json({ enabled: false, account: null, live: 0 });
    const [account, flows] = await Promise.all([getAccount(ctx.tenantId), listFlows(ctx.tenantId)]);
    return Response.json({
      enabled: true,
      account: account ? { username: account.username, status: account.status } : null,
      live: flows.filter((f) => f.status === "live").length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

- [ ] **Step 3: rode o teste** → PASS. **Step 4: commit** `git add apps/web/src/lib/ig apps/web/src/app/api/ig/status && git commit -m "feat(ig): add-on gate, keywords in use and the status route"`.

### Task 11: rotas dos fluxos

**Files:**
- Create: `apps/web/src/lib/ig/flow/body.ts`
- Create: `apps/web/src/app/api/ig/flows/route.ts`
- Create: `apps/web/src/app/api/ig/flows/[id]/route.ts`
- Create: `apps/web/src/app/api/ig/flows/[id]/publish/route.ts`
- Test: `apps/web/src/lib/ig/flow/body.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 9, 10; `carregarCampanhas` de `@/lib/painel/inicio-carga`; `assertPermission` de `@/lib/permissions`.
- Produces:
  - `GET /api/ig/flows → { flows: FlowSummary[] }`
  - `POST /api/ig/flows { recipe, name? } → 201 { flow: FlowRow }`
  - `GET /api/ig/flows/:id → { flow: FlowRow }` · `PATCH { name?, draft? } → { flow }` · `DELETE → { ok: true }`
  - `POST /api/ig/flows/:id/publish → 200 { flow } | 409 { issues: Issue[] }`
  - `createBodySchema`, `patchBodySchema`, `isUuid(value)`.

- [ ] **Step 1: teste dos corpos**

```ts
// apps/web/src/lib/ig/flow/body.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createBodySchema, isUuid, patchBodySchema } from "./body";
import { RECIPES } from "./recipes";

test("criar aceita receita conhecida e nome opcional; recusa receita inventada", () => {
  assert.equal(createBodySchema.safeParse({ recipe: "dm_invite" }).success, true);
  assert.equal(createBodySchema.safeParse({ recipe: "dm_invite", name: "  Grupo VIP " }).data?.name, "Grupo VIP");
  assert.equal(createBodySchema.safeParse({ recipe: "manychat" }).success, false);
  assert.equal(createBodySchema.safeParse({ recipe: "dm_invite", status: "live" }).success, false, "campo extra");
});

test("o PATCH aceita nome e rascunho, nunca status nem publicado", () => {
  assert.equal(patchBodySchema.safeParse({ draft: RECIPES.blank.build() }).success, true);
  assert.equal(patchBodySchema.safeParse({ name: "" }).success, false);
  assert.equal(patchBodySchema.safeParse({ published: RECIPES.blank.build() }).success, false);
  assert.equal(patchBodySchema.safeParse({}).success, false, "vazio não salva nada");
});

test("isUuid", () => {
  assert.equal(isUuid("00000000-0000-4000-8000-0000000e2e00"), true);
  assert.equal(isUuid("f1"), false);
});
```

- [ ] **Step 2: implemente**

```ts
// apps/web/src/lib/ig/flow/body.ts
import { z } from "zod";
import { RECIPE_ORDER } from "./recipes";
import { flowDefSchema } from "./schema";

const nome = z.string().trim().min(1).max(80);

export const createBodySchema = z.strictObject({
  recipe: z.enum(RECIPE_ORDER as [string, ...string[]]),
  name: nome.optional(),
});

export const patchBodySchema = z
  .strictObject({ name: nome.optional(), draft: flowDefSchema.optional() })
  .refine((b) => b.name !== undefined || b.draft !== undefined, { message: "Nada para salvar." });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);
```

```ts
// apps/web/src/app/api/ig/flows/route.ts
import { requireInstagram } from "@/lib/ig/access";
import { createBodySchema } from "@/lib/ig/flow/body";
import { RECIPES, type RecipeId } from "@/lib/ig/flow/recipes";
import { assertPermission } from "@/lib/permissions";
import { createFlow, listFlows } from "@/lib/stores/ig-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    return Response.json({ flows: await listFlows(ctx.tenantId) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

// POST /api/ig/flows — nasce rascunho, a partir de uma receita.
export async function POST(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:create");
    const parsed = createBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Corpo inválido." }, { status: 400 });
    const recipe = RECIPES[parsed.data.recipe as RecipeId];
    const flow = await createFlow(ctx.tenantId, { name: parsed.data.name ?? recipe.titulo, recipe: recipe.id, draft: recipe.build() });
    return Response.json({ flow }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

```ts
// apps/web/src/app/api/ig/flows/[id]/route.ts
import { requireInstagram } from "@/lib/ig/access";
import { isUuid, patchBodySchema } from "@/lib/ig/flow/body";
import type { FlowDef } from "@/lib/ig/flow/types";
import { assertPermission } from "@/lib/permissions";
import { deleteFlow, getFlow, updateDraft } from "@/lib/stores/ig-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const naoAchou = () => Response.json({ error: "Fluxo não encontrado." }, { status: 404 });

export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireInstagram(req);
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    const flow = await getFlow(ctx.tenantId, id);
    return flow ? Response.json({ flow }) : naoAchou();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

// PATCH — só o rascunho (e o nome). Publicar é outra rota.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    const parsed = patchBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Corpo inválido." }, { status: 400 });
    const flow = await updateDraft(ctx.tenantId, id, { name: parsed.data.name, draft: parsed.data.draft as FlowDef | undefined });
    return flow ? Response.json({ flow }) : naoAchou();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:delete");
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    return (await deleteFlow(ctx.tenantId, id)) ? Response.json({ ok: true }) : naoAchou();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

```ts
// apps/web/src/app/api/ig/flows/[id]/publish/route.ts
import { requireInstagram } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { keywordsInUse } from "@/lib/ig/flow/in-use";
import { validateFlow } from "@/lib/ig/flow/validate";
import { carregarCampanhas } from "@/lib/painel/inicio-carga";
import { assertPermission } from "@/lib/permissions";
import { getAccount } from "@/lib/stores/ig-accounts";
import { getFlow, listLiveFlows, publishFlow } from "@/lib/stores/ig-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ig/flows/:id/publish — valida no servidor (a lista do painel é só
 * conforto) e copia o rascunho para o publicado. Na fase 1 nenhuma loja tem
 * conta conectada, então a resposta é sempre 409 com "Conecte o Instagram";
 * a fase 2 só acrescenta a conta.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const flow = await getFlow(ctx.tenantId, id);
    if (!flow) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });

    const [account, campanhas, noAr] = await Promise.all([getAccount(ctx.tenantId), carregarCampanhas(ctx.tenantId), listLiveFlows(ctx.tenantId)]);
    const issues = validateFlow(flow.draft, {
      campaignSlugs: campanhas.map((c) => c.slug).filter((s): s is string => typeof s === "string"),
      accountConnected: account?.status === "active",
      keywordsInUse: keywordsInUse(noAr, flow.id),
    });
    if (issues.length > 0) return Response.json({ issues }, { status: 409 });

    const publicado = await publishFlow(ctx.tenantId, id, flow.draft, flow.version);
    if (!publicado) return Response.json({ error: "O fluxo mudou em outra aba. Recarregue e publique de novo." }, { status: 409 });
    return Response.json({ flow: publicado });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

- [ ] **Step 3: rode o teste e o `tsc`.** Se `carregarCampanhas` devolver um tipo sem `slug`, leia `apps/web/src/lib/painel/inicio-carga.ts:68-90` e ajuste o `.map`; o que importa é a lista de slugs das campanhas da loja.

- [ ] **Step 4: prova manual** (`npm --workspace apps/web run dev`, logado no painel com uma loja que tenha `instagram_enabled = true` em dev; ligue com o SQL da Task 16 se precisar):
  - `GET /api/ig/status` → `{"enabled":true,"account":null,"live":0}`.
  - `POST /api/ig/flows {"recipe":"comment_invite"}` → 201 com `flow.draft.nodes` de 2 blocos.
  - `POST /api/ig/flows/<id>/publish` → 409 com `issues` contendo `sem_campanha` e `sem_conta`.
  - Em loja sem a liberação, `GET /api/ig/flows` → 403 `{"code":"instagram_disabled"}`.

- [ ] **Step 5: commit** `git add apps/web/src/lib/ig/flow/body.ts apps/web/src/lib/ig/flow/body.test.ts apps/web/src/app/api/ig/flows && git commit -m "feat(ig): CRUD and publish routes for the Instagram flows"`.

### PR C — gate e entrega

- [ ] Gate completo. PR "feat(ig): API for the Instagram flows (phase 1, PR C)". Mergeado → PR D.

# PR D — casca, lista e novo fluxo

Branch `feat/ig-painel-lista`. Item "Instagram" no menu (só com a liberação), modo foco na casca, `/painel/instagram` e `/painel/instagram/novo`, registros do e2e.

### Task 12: item do menu com liberação

**Files:**
- Modify: `apps/web/src/lib/painel-nav.ts`
- Test: `apps/web/src/lib/painel-nav.test.ts`

**Interfaces:**
- Produces: `NavItem.requer?: Liberacao`, `Liberacao = "instagram"`, `Liberacoes = Record<Liberacao, boolean>`, `liberado(item, liberacoes: Liberacoes | null): boolean`, item `INSTAGRAM` (`/painel/instagram`, grupo `lotar`, logo depois de `CAMPANHAS`).

- [ ] **Step 1: testes** (acrescente ao fim de `painel-nav.test.ts`; importe `liberado` e `type NavItem` junto dos outros):

```ts
test("Instagram fica em Lotar, logo depois de Campanhas, e só aparece com a liberação", () => {
  const lotar = NAV_ALL.filter((i) => i.grupo === "lotar").map((i) => i.href);
  assert.equal(lotar.indexOf("/painel/instagram"), lotar.indexOf("/painel/campanhas") + 1);
  const instagram = NAV_ALL.find((i) => i.href === "/painel/instagram") as NavItem;
  assert.equal(instagram.requer, "instagram");
  assert.equal(liberado(instagram, null), false, "sem resposta ainda, esconde em vez de piscar");
  assert.equal(liberado(instagram, { instagram: false }), false);
  assert.equal(liberado(instagram, { instagram: true }), true);
  const campanhas = NAV_ALL.find((i) => i.href === "/painel/campanhas") as NavItem;
  assert.equal(liberado(campanhas, null), true, "item sem liberação aparece sempre");
  assert.equal(tituloDaSecao("/painel/instagram/abc"), "Instagram");
});
```

- [ ] **Step 2: rode e veja falhar** (`npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/painel-nav.test.ts`). O teste "every navigation destination is a route that exists" também vai falhar até a Task 14 criar `src/app/painel/instagram/page.tsx` — é esperado dentro deste PR.

- [ ] **Step 3: implemente.** Em `painel-nav.ts`: acrescente `Instagram` ao `import { ... } from "lucide-react"`; depois do tipo `NavGrupo`, acrescente:

```ts
/** Add-ons: o item só aparece pra loja com a liberação ligada. */
export type Liberacao = "instagram";
export type Liberacoes = Record<Liberacao, boolean>;
```

em `NavItem` acrescente `requer?: Liberacao;`; depois de `const CAMPANHAS` acrescente:

```ts
const INSTAGRAM: NavItem = { href: "/painel/instagram", label: "Instagram", icon: Instagram, grupo: "lotar", requer: "instagram" };
```

em `NAV_GROUPS` troque `[INICIO, CAMPANHAS, DISPAROS, ...` por `[INICIO, CAMPANHAS, INSTAGRAM, DISPAROS, ...`; e depois de `isNavItemActive` acrescente:

```ts
/** `null` = a casca ainda não sabe: esconde o que depende de liberação em vez de piscar. */
export function liberado(item: NavItem, liberacoes: Liberacoes | null): boolean {
  return !item.requer || (liberacoes?.[item.requer] ?? false);
}
```

- [ ] **Step 4: commit** (sem rodar o teste de rota ainda) `git add apps/web/src/lib/painel-nav.ts apps/web/src/lib/painel-nav.test.ts && git commit -m "feat(painel): Instagram nav item gated by the add-on flag"`.

### Task 13: casca — status do Instagram, modo foco

**Files:**
- Modify: `apps/web/src/components/painel/casca-context.tsx`
- Create: `apps/web/src/components/painel/miolo.tsx`
- Modify: `apps/web/src/app/painel/layout.tsx:40-44`
- Modify: `apps/web/src/components/painel/corredor.tsx:106-125,140`, `folha-mais.tsx:60-71`, `letreiro.tsx:70-79`, `barra-mobile.tsx:69-77`

**Interfaces:**
- Produces: `useCasca()` ganha `foco`, `definirFoco`, `instagram: StatusInstagram | null`, `liberacoes: Liberacoes | null`, `recarregarInstagram()`; `useFoco()` (liga o foco enquanto o componente estiver montado); `MioloDoPainel`.

- [ ] **Step 1: `casca-context.tsx`** — substitua o arquivo por:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Liberacoes } from "@/lib/painel-nav";

export type Passos = { feitos: number; total: number };

/** O que `GET /api/ig/status` devolve. */
export type StatusInstagram = {
  enabled: boolean;
  account: { username: string; status: string } | null;
  live: number;
};

type CascaCtx = {
  /** Passos da ativação, como a Início calculou. null = ainda não visitou a Início. */
  passos: Passos | null;
  definirPassos: (passos: Passos) => void;
  /** Modo foco: a tela toma a janela inteira (editor de fluxo). Corredor, letreiro e barra somem. */
  foco: boolean;
  definirFoco: (ligado: boolean) => void;
  /** null enquanto a casca não perguntou; com a API fora vira `enabled: false`. */
  instagram: StatusInstagram | null;
  liberacoes: Liberacoes | null;
  recarregarInstagram: () => void;
};

const CascaContext = createContext<CascaCtx>({
  passos: null,
  definirPassos: () => {},
  foco: false,
  definirFoco: () => {},
  instagram: null,
  liberacoes: null,
  recarregarInstagram: () => {},
});

export const useCasca = () => useContext(CascaContext);

/** Liga o modo foco enquanto o componente estiver montado. */
export function useFoco() {
  const { definirFoco } = useCasca();
  useEffect(() => {
    definirFoco(true);
    return () => definirFoco(false);
  }, [definirFoco]);
}

const DESLIGADO: StatusInstagram = { enabled: false, account: null, live: 0 };

/**
 * O corredor mostra "N de 5 passos" (spec 3.1) mas não tem os dados pra calcular;
 * a Início já os carrega. O layout não remonta entre rotas, então o valor
 * sobrevive à navegação. O mesmo vale pro status do Instagram: uma pergunta por
 * sessão do painel, e o item do menu aparece (ou não) em todas as telas.
 */
export function CascaProvider({ children }: { children: React.ReactNode }) {
  const [passos, definirPassos] = useState<Passos | null>(null);
  const [foco, definirFoco] = useState(false);
  const [instagram, setInstagram] = useState<StatusInstagram | null>(null);
  const [versao, setVersao] = useState(0);
  const recarregarInstagram = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/ig/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: StatusInstagram | null) => {
        if (cancelado) return;
        setInstagram(raw && typeof raw.enabled === "boolean" ? { enabled: raw.enabled, account: raw.account ?? null, live: Number(raw.live) || 0 } : DESLIGADO);
      })
      .catch(() => {
        if (!cancelado) setInstagram(DESLIGADO);
      });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  const valor = useMemo<CascaCtx>(
    () => ({
      passos,
      definirPassos,
      foco,
      definirFoco,
      instagram,
      liberacoes: instagram ? { instagram: instagram.enabled } : null,
      recarregarInstagram,
    }),
    [passos, foco, instagram, recarregarInstagram],
  );
  return <CascaContext.Provider value={valor}>{children}</CascaContext.Provider>;
}
```

- [ ] **Step 2: `miolo.tsx`** (o `<main>` precisa reagir ao foco, e o layout é componente de servidor):

```tsx
"use client";

import { useCasca } from "@/components/painel/casca-context";
import { PageTransition } from "@/components/painel/page-transition";

/** O miolo do painel. No modo foco ocupa a janela inteira; fora dele, a largura e o respiro da barra mobile de sempre. */
export function MioloDoPainel({ children }: { children: React.ReactNode }) {
  const { foco } = useCasca();
  return (
    <main className={foco ? "flex min-h-screen w-full flex-1 flex-col" : "max-w-[var(--content-max)] flex-1 pb-20 lg:pb-0"}>
      <PageTransition>{children}</PageTransition>
    </main>
  );
}
```

Em `layout.tsx`, troque o bloco `<main className="max-w-[var(--content-max)] flex-1 pb-20 lg:pb-0"><PageTransition>{children}</PageTransition></main>` por `<MioloDoPainel>{children}</MioloDoPainel>`, importe `MioloDoPainel` de `@/components/painel/miolo` e remova o import de `PageTransition` que ficou sem uso.

- [ ] **Step 3: corredor, folha, letreiro e barra.**
  - `corredor.tsx`: `const { passos } = useCasca();` vira `const { passos, foco, liberacoes } = useCasca();`. Depois da última linha de hooks (`const nomeDoNumero = ...`) e **antes** do `return (`, acrescente `if (foco) return null;`. No filtro dos itens, `NAV_ALL.filter((item) => item.grupo === grupo && !RODAPE.includes(item.href))` vira `NAV_ALL.filter((item) => item.grupo === grupo && !RODAPE.includes(item.href) && liberado(item, liberacoes))`; importe `liberado` de `@/lib/painel-nav`.
  - `folha-mais.tsx`: importe `useCasca` e `liberado`; dentro do componente, `const { liberacoes } = useCasca();`; o filtro `NAV_ALL.filter((item) => item.grupo === grupo)` vira `NAV_ALL.filter((item) => item.grupo === grupo && liberado(item, liberacoes))`.
  - `letreiro.tsx`: importe `useCasca`; depois de `const ticker = useTicker();` acrescente `const { foco } = useCasca();` e, depois do cálculo de `ponto`, `if (foco) return null;`.
  - `barra-mobile.tsx`: importe `useCasca`; depois de `const idMais = useId();` acrescente `const { foco } = useCasca();` e `if (foco) return null;`.
  Hooks sempre antes do `return null` (regra do React).

- [ ] **Step 4:** `tsc` e `npm --workspace apps/web run painel:check` limpos. Abra o painel (`npm --workspace apps/web run dev`): com `instagram_enabled = false` o menu não muda; com `true` (SQL da Task 16) aparece "Instagram" em Lotar, logo abaixo de Campanhas, e também na folha "Mais" do celular.

- [ ] **Step 5: commit** `git add apps/web/src/components/painel apps/web/src/app/painel/layout.tsx && git commit -m "feat(painel): focus mode and add-on gated nav in the shell"`.

### Task 14: lista `/painel/instagram`

**Files:**
- Create: `apps/web/src/app/painel/instagram/page.tsx`
- Create: `apps/web/src/components/painel/instagram/lista.tsx`
- Create: `apps/web/src/components/painel/instagram/chip-estado.tsx`

**Interfaces:**
- Consumes: `useCasca().instagram`, `GET /api/ig/flows`, `DELETE /api/ig/flows/:id`, `buscar` de `@/lib/painel/carregar`, `Carga` de `@/lib/painel/types`, `useConfirmacao` de `@/components/painel/confirmacao`, `useToast` de `@/components/toast`, `RECIPES`.
- Produces: tela com os três estados (não liberado / vazio / lista); textos-âncora para o e2e: `Fluxos que respondem comentário e direct` (liberado) e `Nenhum fluxo ainda` (vazio); `ChipEstado`.

- [ ] **Step 1: página (servidor, só a casca)**

```tsx
// apps/web/src/app/painel/instagram/page.tsx
import { InstagramVitrine } from "@/components/painel/instagram/lista";

export const metadata = { title: "Instagram — Girumo" };

export default function InstagramPage() {
  return <InstagramVitrine />;
}
```

- [ ] **Step 2: chip de estado** (reusado na lista e no editor)

```tsx
// apps/web/src/components/painel/instagram/chip-estado.tsx
import type { FlowStatus } from "@/lib/stores/ig-flows";

const ROTULO: Record<FlowStatus, string> = { draft: "Rascunho", live: "No ar", paused: "Pausado" };
const CLASSE: Record<FlowStatus, string> = { draft: "pn-chip pn-chip--line", live: "pn-chip pn-chip--acid", paused: "pn-chip pn-chip--risco" };

export function ChipEstado({ status }: { status: FlowStatus }) {
  return <span className={CLASSE[status]}>{ROTULO[status]}</span>;
}
```

- [ ] **Step 3: a vitrine**

```tsx
// apps/web/src/components/painel/instagram/lista.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useCasca } from "@/components/painel/casca-context";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useToast } from "@/components/toast";
import { RECIPES } from "@/lib/ig/flow/recipes";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import type { FlowSummary } from "@/lib/stores/ig-flows";
import { ChipEstado } from "./chip-estado";

type Resposta = { flows: FlowSummary[] };
const valida = (corpo: unknown): corpo is Resposta => !!corpo && typeof corpo === "object" && Array.isArray((corpo as Resposta).flows);

function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function InstagramVitrine() {
  const { instagram, recarregarInstagram } = useCasca();
  const [fluxos, setFluxos] = useState<FlowSummary[]>([]);
  const [carga, setCarga] = useState<Carga>("carregando");
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const toast = useToast();

  const carregar = useCallback(() => buscar<Resposta>("/api/ig/flows", valida, (r) => setFluxos(r.flows), setCarga), []);
  useEffect(() => {
    if (instagram?.enabled) void carregar();
  }, [instagram?.enabled, carregar]);

  if (instagram === null) {
    return (
      <section className="px-5 py-6 lg:px-8">
        <span role="status" aria-label="Carregando Instagram" className="pn-skeleton block h-7 w-40 rounded-[var(--radius-chip)]" />
      </section>
    );
  }

  if (!instagram.enabled) {
    return (
      <section className="px-5 py-6 lg:px-8">
        <h1 className="text-20 font-semibold text-volt-950">Instagram</h1>
        <p className="mt-2 max-w-[52ch] text-13 text-slate-600">
          O Instagram ainda não está liberado para esta loja. Fale com a Girumo para ligar.
        </p>
      </section>
    );
  }

  const apagar = async (f: FlowSummary) => {
    const ok = await pedirConfirmacao({ titulo: `Apagar “${f.name}”?`, texto: "O rascunho e o histórico deste fluxo somem. Não dá pra desfazer.", rotulo: "Apagar", destrutivo: true });
    if (!ok) return;
    const r = await fetch(`/api/ig/flows/${f.id}`, { method: "DELETE" });
    if (!r.ok) {
      toast("Não deu pra apagar. Tente de novo.", "error");
      return;
    }
    setFluxos((lista) => lista.filter((x) => x.id !== f.id));
    recarregarInstagram();
  };

  return (
    <section className="px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-20 font-semibold text-volt-950">Instagram</h1>
          <p className="mt-1 text-13 text-slate-600">Fluxos que respondem comentário e direct com o convite do grupo.</p>
          <p className="mt-1 text-13 text-slate-600">
            {instagram.account ? `@${instagram.account.username}` : "Nenhuma conta do Instagram conectada ainda."}
          </p>
        </div>
        <Link href="/painel/instagram/novo" className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-volt-950 px-3 text-13 font-medium text-canvas-100">
          Novo fluxo
        </Link>
      </header>

      <div className="mt-5 rounded-[10px] border border-line-200 bg-paper-0">
        {carga === "carregando" && <span role="status" aria-label="Carregando fluxos" className="pn-skeleton m-5 block h-5 w-64 rounded-[var(--radius-chip)]" />}
        {carga === "erro" && (
          <p className="px-5 py-8 text-center text-13 text-slate-600">
            Não deu pra carregar os fluxos.{" "}
            <button type="button" onClick={() => void carregar()} className="text-cobalt-500">Tentar de novo</button>
          </p>
        )}
        {carga === "ok" && fluxos.length === 0 && (
          <p className="px-5 py-8 text-center text-13 text-slate-600">Nenhum fluxo ainda. Comece por uma receita pronta em “Novo fluxo”.</p>
        )}
        {carga === "ok" && fluxos.length > 0 && (
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-line-200 text-left text-12 text-slate-600">
                <th scope="col" className="px-5 py-2.5 font-medium">Fluxo</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Gatilho</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Estado</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Atualizado</th>
                <th scope="col" className="px-5 py-2.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {fluxos.map((f) => (
                <tr key={f.id} className="border-b border-line-200 last:border-0 hover:bg-hover-ficha">
                  <td className="px-5 py-3">
                    <Link href={`/painel/instagram/${f.id}`} className="font-medium text-volt-950">{f.name}</Link>
                  </td>
                  <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">{RECIPES[f.recipe]?.gatilho ?? "—"}</td>
                  <td className="px-3 py-3"><ChipEstado status={f.status} /></td>
                  <td className="hidden px-3 py-3 font-data tabular-nums text-slate-600 sm:table-cell">{dataCurta(f.updated_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" aria-label={`Apagar ${f.name}`} onClick={() => void apagar(f)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:text-danger-700">
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {folhaDeConfirmacao}
    </section>
  );
}
```

- [ ] **Step 4:** `npm --workspace apps/web test` (o teste de rota do menu passa agora), `tsc`, `painel:check`. No navegador, a 1440 e a 390: os três estados.

- [ ] **Step 5: commit** `git add apps/web/src/app/painel/instagram apps/web/src/components/painel/instagram && git commit -m "feat(ig): Instagram flows list in the panel"`.

### Task 15: `/painel/instagram/novo`

**Files:**
- Create: `apps/web/src/lib/ig/visao.ts`
- Test: `apps/web/src/lib/ig/visao.test.ts`
- Create: `apps/web/src/app/painel/instagram/novo/page.tsx`
- Create: `apps/web/src/components/painel/instagram/novo.tsx`

**Interfaces:**
- Produces: `Visao = "passo" | "mapa"`, `lerVisao(store, query)`, `guardarVisao(store, visao)`, `CHAVE_VISAO`; tela "Novo fluxo" (âncora e2e: `Novo fluxo`) que faz `POST /api/ig/flows` e vai para `/painel/instagram/<id>?ver=<visao>`.

- [ ] **Step 1: teste da visão**

```ts
// apps/web/src/lib/ig/visao.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { CHAVE_VISAO, guardarVisao, lerVisao } from "./visao";

const memoria = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test("a query manda; sem query vale a última usada; sem nada, passo a passo", () => {
  const store = memoria();
  assert.equal(lerVisao(store, null), "passo");
  guardarVisao(store, "mapa");
  assert.equal(store.getItem(CHAVE_VISAO), "mapa");
  assert.equal(lerVisao(store, null), "mapa");
  assert.equal(lerVisao(store, "passo"), "passo");
  assert.equal(lerVisao(store, "torto"), "mapa", "valor inválido na query é ignorado");
  assert.equal(lerVisao(null, null), "passo", "sem storage (SSR, modo privado) não quebra");
});
```

- [ ] **Step 2: implemente**

```ts
// apps/web/src/lib/ig/visao.ts
export type Visao = "passo" | "mapa";
export const CHAVE_VISAO = "ig.visao";
type Store = Pick<Storage, "getItem" | "setItem">;

const ehVisao = (v: unknown): v is Visao => v === "passo" || v === "mapa";

/** "Abre na última que você usou": a query (`?ver=`) ganha, depois o navegador, depois o padrão. */
export function lerVisao(store: Store | null, query: string | null): Visao {
  if (ehVisao(query)) return query;
  try {
    const guardada = store?.getItem(CHAVE_VISAO);
    if (ehVisao(guardada)) return guardada;
  } catch {
    /* storage bloqueado: segue o padrão */
  }
  return "passo";
}

export function guardarVisao(store: Store | null, visao: Visao): void {
  try {
    store?.setItem(CHAVE_VISAO, visao);
  } catch {
    /* storage bloqueado: a visão vale só nesta aba */
  }
}
```

```tsx
// apps/web/src/app/painel/instagram/novo/page.tsx
import { NovoFluxo } from "@/components/painel/instagram/novo";

export const metadata = { title: "Novo fluxo — Girumo" };

export default function NovoFluxoPage() {
  return <NovoFluxo />;
}
```

```tsx
// apps/web/src/components/painel/instagram/novo.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, List, Repeat, Workflow } from "lucide-react";
import { useCasca } from "@/components/painel/casca-context";
import { useToast } from "@/components/toast";
import { RECIPES, RECIPE_ORDER, type RecipeId } from "@/lib/ig/flow/recipes";
import { guardarVisao, type Visao } from "@/lib/ig/visao";
import { cn } from "@/lib/utils";

export function NovoFluxo() {
  const router = useRouter();
  const toast = useToast();
  const { instagram, recarregarInstagram } = useCasca();
  const [receita, setReceita] = useState<RecipeId>("comment_invite");
  const [visao, setVisao] = useState<Visao>("passo");
  const [criando, setCriando] = useState(false);

  const criar = async () => {
    setCriando(true);
    try {
      const r = await fetch("/api/ig/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipe: receita }) });
      if (!r.ok) throw new Error(String(r.status));
      const { flow } = (await r.json()) as { flow: { id: string } };
      guardarVisao(typeof window === "undefined" ? null : window.localStorage, visao);
      recarregarInstagram();
      router.push(`/painel/instagram/${flow.id}?ver=${visao}`);
    } catch {
      toast("Não deu pra criar o rascunho. Tente de novo.", "error");
      setCriando(false);
    }
  };

  if (instagram && !instagram.enabled) {
    return (
      <section className="px-5 py-6 lg:px-8">
        <h1 className="text-20 font-semibold text-volt-950">Novo fluxo</h1>
        <p className="mt-2 text-13 text-slate-600">O Instagram ainda não está liberado para esta loja.</p>
      </section>
    );
  }

  return (
    <section className="px-5 py-6 lg:px-8">
      <nav aria-label="Trilha" className="text-13 text-slate-600">
        <Link href="/painel/instagram" className="text-cobalt-500">Instagram</Link> <span aria-hidden="true">›</span> Novo fluxo
      </nav>
      <h1 className="mt-2 text-20 font-semibold text-volt-950">Novo fluxo</h1>
      <p className="mt-1 text-13 text-slate-600">Escolha por onde começar. Nada vai pro ar até você publicar.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[10px] border border-line-200 bg-paper-0">
          <h2 className="flex h-12 items-center gap-2 border-b border-line-200 px-5 text-15 font-semibold text-volt-950">
            Receita <span className="text-12 font-normal text-slate-600">já vem montada, você só troca o texto</span>
          </h2>
          <div role="radiogroup" aria-label="Receita">
            {RECIPE_ORDER.map((id) => {
              const r = RECIPES[id];
              const marcada = receita === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={marcada}
                  onClick={() => setReceita(id)}
                  className={cn("grid w-full grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-line-200 px-5 py-3 text-left last:border-0 hover:bg-hover-ficha", marcada && "bg-hover-ficha")}
                >
                  <span aria-hidden="true" className={cn("mt-0.5 h-[18px] w-[18px] rounded-full border-2", marcada ? "border-cobalt-500 bg-cobalt-500 ring-2 ring-inset ring-paper-0" : "border-slate-600")} />
                  <span className="text-15 font-semibold text-volt-950">
                    {r.titulo}
                    {r.destaque && <span className="ml-2 text-12 font-medium text-slate-600">{r.destaque}</span>}
                  </span>
                  <span className="col-start-2 text-13 text-slate-600">{r.descricao}</span>
                  {r.cadeia.length > 0 && (
                    <span className="col-start-2 mt-1 flex flex-wrap items-center gap-1 text-12 text-slate-600">
                      {r.cadeia.map((passo, i) => (
                        <span key={passo} className="flex items-center gap-1">
                          {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                          <span className="rounded-[var(--radius-chip)] bg-hover-ficha px-2 py-0.5 text-volt-950">{passo}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside>
          <h2 className="flex h-12 items-center text-15 font-semibold text-volt-950">Como você quer montar</h2>
          <div role="radiogroup" aria-label="Como você quer montar" className="grid grid-cols-2 gap-3">
            {(
              [
                ["passo", List, "Passo a passo", "De cima pra baixo, um passo por linha. Edita igual no celular."],
                ["mapa", Workflow, "Mapa", "O desenho inteiro, com blocos e ligações. Por enquanto só pra olhar: edita no passo a passo."],
              ] as const
            ).map(([v, Icone, titulo, descricao]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={visao === v}
                onClick={() => setVisao(v)}
                className={cn("rounded-[10px] border bg-paper-0 p-3 text-left", visao === v ? "border-cobalt-500" : "border-line-200")}
              >
                <span className="flex items-center gap-2 text-15 font-semibold text-volt-950">
                  <Icone className={cn("h-4 w-4", visao === v ? "text-cobalt-500" : "text-slate-600")} aria-hidden="true" />
                  {titulo}
                </span>
                <span className="mt-1 block text-12 text-slate-600">{descricao}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 flex gap-2 text-12 text-slate-600">
            <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span><span className="font-semibold text-volt-950">Dá pra trocar a qualquer hora</span> no botão Ver como. O fluxo é o mesmo nas duas.</span>
          </p>
          <div className="mt-5 flex items-center gap-3 border-t border-line-200 pt-4">
            <button type="button" onClick={() => void criar()} disabled={criando} className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-volt-950 px-4 text-13 font-medium text-canvas-100 disabled:opacity-60">
              {criando ? "Criando…" : "Criar rascunho"}
            </button>
            <span className="text-12 text-slate-600">abre na visão escolhida</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
```

- [ ] **Step 3:** teste → PASS; `tsc`; `painel:check`; no navegador, criar um rascunho leva ao editor (a rota `[id]` só existe no PR E: até lá a navegação dá 404 do Next; valide pelo `POST` de 201 na aba de rede).

- [ ] **Step 4: commit** `git add apps/web/src/lib/ig/visao.ts apps/web/src/lib/ig/visao.test.ts apps/web/src/app/painel/instagram/novo apps/web/src/components/painel/instagram/novo.tsx && git commit -m "feat(ig): new flow screen with recipe and view choice"`.

### Task 16: registros do e2e e a loja de QA

**Files:**
- Modify: `apps/web/e2e/conteudo-esperado.ts` (duas entradas)
- Banco de dev: `tenant_settings.instagram_enabled` da loja de QA

- [ ] **Step 1: ligue a liberação para a loja de QA em dev** (DML; o `E2E_TENANT_ID` está em `apps/web/.env.local` ou nos segredos do CI; se não tiver, peça ao Igor):

```sql
insert into public.tenant_settings (tenant_id, instagram_enabled)
values ('<E2E_TENANT_ID>', true)
on conflict (tenant_id) do update set instagram_enabled = true, updated_at = now();
```

- [ ] **Step 2: entradas em `conteudo-esperado.ts`** (ordem alfabética, depois de `/painel/grupos`):

```ts
  "/painel/instagram": {
    ancora: /respondem comentário e direct/,
    lista: {
      api: "/api/ig/flows",
      marca: (j) => primeiroTexto((j as { flows?: unknown }).flows, "name"),
      vazio: /Nenhum fluxo ainda/i,
    },
  },
  "/painel/instagram/novo": {
    ancora: /Novo fluxo/,
    semLista: "Formulário de criação; não lista registro existente.",
  },
```

- [ ] **Step 3:** `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json` limpo. Se tiver `E2E_EMAIL`/`E2E_PASSWORD` locais: `npm --workspace apps/web run e2e -- painel-rotas.spec.ts painel-vitrine-casca.spec.ts` (a casca a 390 px precisa de `painel-letreiro` e `painel-postar` nas duas rotas novas: as duas ficam dentro da casca normal, então passam).

- [ ] **Step 4: commit** `git add apps/web/e2e/conteudo-esperado.ts && git commit -m "test(e2e): expected content for the Instagram list and new flow routes"`.

### PR D — gate e entrega

- [ ] Gate completo. PR "feat(ig): Instagram in the panel shell, flows list and new flow (phase 1, PR D)". Mergeado → PR E.

# PR E — o editor (passo a passo + mapa só leitura)

Branch `feat/ig-editor`. Rota `/painel/instagram/[id]` em modo foco, com "Ver como", autosave do rascunho, lista "Pra publicar", prévia e o mapa só leitura. Referência visual: `criar-passo.html`, `criar-mapa.html`, `_a-css.html`, `_b-css.html` do mockup.

### Task 17: hook do fluxo (carga, autosave, publicar)

**Files:**
- Create: `apps/web/src/components/painel/instagram/use-fluxo.ts`
- Create: `apps/web/src/lib/ig/flow/salvamento.ts`
- Test: `apps/web/src/lib/ig/flow/salvamento.test.ts`

**Interfaces:**
- Produces: `useFluxo(id)` → `{ flow, carga, naoAchou, salvamento, editar(fn), renomear(nome), publicar(): Promise<Issue[] | null>, recarregar }`; `textoDoSalvamento(estado)`.

- [ ] **Step 1: o único pedaço puro, com teste**

```ts
// apps/web/src/lib/ig/flow/salvamento.ts
export type Salvamento = "salvo" | "pendente" | "salvando" | "erro";

/** O que a barra de cima mostra ao lado do nome. */
export function textoDoSalvamento(estado: Salvamento): string {
  switch (estado) {
    case "salvo":
      return "Salvo";
    case "pendente":
    case "salvando":
      return "Salvando…";
    case "erro":
      return "Não salvou. Tentando de novo…";
  }
}
```

```ts
// apps/web/src/lib/ig/flow/salvamento.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { textoDoSalvamento } from "./salvamento";

test("pendente e salvando dizem a mesma coisa pra pessoa", () => {
  assert.equal(textoDoSalvamento("pendente"), textoDoSalvamento("salvando"));
  assert.equal(textoDoSalvamento("salvo"), "Salvo");
  assert.match(textoDoSalvamento("erro"), /Não salvou/);
});
```

- [ ] **Step 2: o hook**

```ts
// apps/web/src/components/painel/instagram/use-fluxo.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Salvamento } from "@/lib/ig/flow/salvamento";
import type { FlowDef } from "@/lib/ig/flow/types";
import type { Issue } from "@/lib/ig/flow/validate";
import type { Carga } from "@/lib/painel/types";
import type { FlowRow } from "@/lib/stores/ig-flows";

const ATRASO_MS = 800;

/**
 * Carrega o fluxo, guarda o rascunho sozinho (800 ms depois da última edição) e
 * publica. Toda edição passa por `editar(fn)`, que recebe o grafo e devolve
 * outro: é como as operações de `lib/ig/flow/edit.ts` entram na tela.
 */
export function useFluxo(id: string) {
  const [flow, setFlow] = useState<FlowRow | null>(null);
  const [carga, setCarga] = useState<Carga>("carregando");
  const [naoAchou, setNaoAchou] = useState(false);
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const pendente = useRef<{ name?: string; draft?: FlowDef } | null>(null);

  const recarregar = useCallback(async () => {
    setCarga("carregando");
    try {
      const r = await fetch(`/api/ig/flows/${id}`, { cache: "no-store" });
      if (r.status === 404) {
        setNaoAchou(true);
        setCarga("ok");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const { flow: lido } = (await r.json()) as { flow: FlowRow };
      setFlow(lido);
      setCarga("ok");
    } catch {
      setCarga("erro");
    }
  }, [id]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Um temporizador por rajada de edições; o PATCH leva só o que mudou.
  useEffect(() => {
    if (salvamento !== "pendente" && salvamento !== "erro") return;
    const t = setTimeout(async () => {
      const corpo = pendente.current;
      if (!corpo) return;
      setSalvamento("salvando");
      try {
        const r = await fetch(`/api/ig/flows/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        if (!r.ok) throw new Error(String(r.status));
        if (pendente.current === corpo) {
          pendente.current = null;
          setSalvamento("salvo");
        } else {
          setSalvamento("pendente");
        }
      } catch {
        setSalvamento("erro");
      }
    }, ATRASO_MS);
    return () => clearTimeout(t);
  }, [salvamento, id]);

  const editar = useCallback((fn: (def: FlowDef) => FlowDef) => {
    setFlow((atual) => {
      if (!atual) return atual;
      const draft = fn(atual.draft);
      pendente.current = { ...(pendente.current ?? {}), draft };
      return { ...atual, draft };
    });
    setSalvamento("pendente");
  }, []);

  const renomear = useCallback((name: string) => {
    setFlow((atual) => (atual ? { ...atual, name } : atual));
    pendente.current = { ...(pendente.current ?? {}), name };
    setSalvamento("pendente");
  }, []);

  /** `null` = publicou; lista = o que falta. */
  const publicar = useCallback(async (): Promise<Issue[] | null> => {
    const r = await fetch(`/api/ig/flows/${id}/publish`, { method: "POST" });
    if (r.status === 409) {
      const corpo = (await r.json()) as { issues?: Issue[]; error?: string };
      return corpo.issues ?? [{ code: "sem_conta", nodeId: null, text: corpo.error ?? "Não deu pra publicar." }];
    }
    if (!r.ok) return [{ code: "sem_conta", nodeId: null, text: "Não deu pra publicar. Tente de novo." }];
    const { flow: publicado } = (await r.json()) as { flow: FlowRow };
    setFlow(publicado);
    return null;
  }, [id]);

  return { flow, carga, naoAchou, salvamento, editar, renomear, publicar, recarregar };
}
```

- [ ] **Step 3:** teste → PASS; `tsc`. **Commit** `git add apps/web/src/lib/ig/flow/salvamento* apps/web/src/components/painel/instagram/use-fluxo.ts && git commit -m "feat(ig): flow loading, autosave and publish hook"`.

### Task 18: peças de formulário

**Files:**
- Create: `apps/web/src/components/painel/instagram/interruptor.tsx`
- Create: `apps/web/src/components/painel/instagram/palavras.tsx`
- Create: `apps/web/src/components/painel/instagram/contador-bytes.tsx`

**Interfaces:**
- Produces: `Interruptor({ ligado, aoMudar, rotulo })` (botão `role="switch"` com o visual `pn-interruptor` de `configuracoes-vitrine.tsx:201-209`: copie as classes de lá, inclusive a da bolinha e a do estado ligado); `Palavras({ palavras, aoMudar })` (chips + campo; Enter ou vírgula acrescenta; botão "Tirar <palavra>" remove; máximo `MAX_KEYWORDS`); `ContadorBytes({ texto, max, reserva?, emCaracteres? })`.

- [ ] **Step 1: implemente**

```tsx
// apps/web/src/components/painel/instagram/palavras.tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MAX_KEYWORDS, MAX_KEYWORD_LENGTH } from "@/lib/ig/flow/types";

export function Palavras({ palavras, aoMudar }: { palavras: string[]; aoMudar: (lista: string[]) => void }) {
  const [digitando, setDigitando] = useState("");
  const acrescentar = () => {
    const nova = digitando.trim().slice(0, MAX_KEYWORD_LENGTH);
    if (!nova || palavras.length >= MAX_KEYWORDS) return;
    aoMudar([...palavras, nova]);
    setDigitando("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-2 py-1.5">
      {palavras.map((p, i) => (
        <span key={`${p}-${i}`} className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-chip)] bg-hover-ficha pl-2 pr-1 text-13 text-volt-950">
          {p}
          <button type="button" aria-label={`Tirar ${p}`} onClick={() => aoMudar(palavras.filter((_, j) => j !== i))} className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-600 hover:text-volt-950">
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        aria-label="Adicionar palavra"
        value={digitando}
        onChange={(e) => setDigitando(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            acrescentar();
          }
        }}
        onBlur={acrescentar}
        placeholder={palavras.length ? "" : "adicionar palavra"}
        className="min-w-[8ch] flex-1 bg-transparent text-13 text-volt-950 outline-none placeholder:text-slate-600"
      />
    </div>
  );
}
```

```tsx
// apps/web/src/components/painel/instagram/contador-bytes.tsx
import { utf8Bytes } from "@/lib/ig/flow/bytes";
import { cn } from "@/lib/utils";

/** "95 de 1.000": bytes por padrão (regra da Meta); caracteres quando a mensagem tem botão. */
export function ContadorBytes({ texto, max, reserva = 0, emCaracteres = false }: { texto: string; max: number; reserva?: number; emCaracteres?: boolean }) {
  const usado = (emCaracteres ? [...texto].length : utf8Bytes(texto)) + reserva;
  const estourou = usado > max;
  return (
    <span aria-live="polite" className={cn("font-data text-12 tabular-nums", estourou ? "text-danger-700" : "text-slate-600")}>
      {usado.toLocaleString("pt-BR")} de {max.toLocaleString("pt-BR")}
      {reserva > 0 && <span className="ml-1">(com o link)</span>}
    </span>
  );
}
```

`interruptor.tsx`: um botão `type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => aoMudar(!ligado)}` com as classes `pn-interruptor` (e a variante de ligado) e um `<span className="pn-interruptor__bolinha" aria-hidden="true" />`, exatamente como `configuracoes-vitrine.tsx:201-209` faz; exporte `Interruptor`.

- [ ] **Step 2:** `tsc`, `painel:check`. **Commit** `git add apps/web/src/components/painel/instagram && git commit -m "feat(ig): switch, keyword chips and byte counter for the flow editor"`.

### Task 19: a trilha editável (passo a passo)

**Files:**
- Create: `apps/web/src/components/painel/instagram/bloco-form.tsx`
- Create: `apps/web/src/components/painel/instagram/trilha.tsx`

**Interfaces:**
- Consumes: `linearize`, `rotuloDaSaida`, `tituloDoBloco`, `horas`, `updateNode`, `setFollowGate`, `setReminder`, `canAddFollowGate`, `hasFollowGate`, `canAddReminder`, `hasReminder`, Task 18.
- Produces: `Trilha({ def, campanhas, editar, issues })` e `BlocoForm({ node, primeiroDepoisDoComentario, campanhas, issues, aoMudar })`.

- [ ] **Step 1: o formulário de cada bloco**

```tsx
// apps/web/src/components/painel/instagram/bloco-form.tsx
"use client";

import { horas } from "@/lib/ig/flow/labels";
import type { NodePatch } from "@/lib/ig/flow/edit";
import { LINK_RESERVE_BYTES, MAX_MESSAGE_BYTES, MAX_TEXT_WITH_BUTTON, type FlowNode } from "@/lib/ig/flow/types";
import type { Issue } from "@/lib/ig/flow/validate";
import { ContadorBytes } from "./contador-bytes";
import { Interruptor } from "./interruptor";
import { Palavras } from "./palavras";

export type CampanhaOpcao = { slug: string; name: string };
const ESPERAS = [60, 360, 720, 1380];
const LEMBRETES = [60, 180, 360, 1380];

const rotulo = "text-13 font-medium text-volt-950";
const campo = "w-full rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 py-2 text-13 text-volt-950 outline-none focus:border-slate-600";
const ajuda = "mt-1 text-12 text-slate-600";
const erro = "mt-1 text-12 text-warning-700";

function Problemas({ issues }: { issues: Issue[] }) {
  return issues.length ? <ul>{issues.map((i) => <li key={i.code + i.text} className={erro}>{i.text}</li>)}</ul> : null;
}

export function BlocoForm({ node, primeiroDepoisDoComentario, campanhas, issues, aoMudar }: {
  node: FlowNode;
  primeiroDepoisDoComentario: boolean;
  campanhas: CampanhaOpcao[];
  issues: Issue[];
  aoMudar: (patch: NodePatch) => void;
}) {
  const doBloco = issues.filter((i) => i.nodeId === node.id);

  if (node.type === "trigger") {
    return (
      <div className="grid gap-4">
        <label className="block">
          <span className={rotulo}>Palavras que disparam <span className="font-normal text-slate-600">vale com ou sem acento, no meio da frase</span></span>
          <div className="mt-1"><Palavras palavras={node.keywords} aoMudar={(keywords) => aoMudar({ keywords })} /></div>
        </label>
        {node.on === "comment" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={rotulo}>Onde vale</span>
              <p className={`${campo} mt-1 text-slate-600`}>Qualquer post ou reel</p>
              <p className={ajuda}>Escolher um post específico chega com a conexão da conta.</p>
            </div>
            <div>
              <span className="flex items-center justify-between">
                <span className={rotulo}>Responder no comentário</span>
                <Interruptor ligado={node.publicReply !== null} aoMudar={(on) => aoMudar({ publicReply: on ? "Te chamei no direct." : null })} rotulo="Responder no comentário" />
              </span>
              {node.publicReply !== null && (
                <input aria-label="Resposta pública" value={node.publicReply} onChange={(e) => aoMudar({ publicReply: e.target.value })} className={`${campo} mt-1`} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className={rotulo}>Resposta a story também conta</span>
            <Interruptor ligado={node.storyReplies} aoMudar={(storyReplies) => aoMudar({ storyReplies })} rotulo="Resposta a story também conta" />
          </div>
        )}
        <Problemas issues={doBloco} />
      </div>
    );
  }

  if (node.type === "message") {
    const comBotao = node.button !== null;
    return (
      <div className="grid gap-4">
        <label className="block">
          <span className="flex items-center justify-between">
            <span className={rotulo}>Mensagem</span>
            <ContadorBytes texto={node.text} max={comBotao ? MAX_TEXT_WITH_BUTTON : MAX_MESSAGE_BYTES} emCaracteres={comBotao} />
          </span>
          <textarea aria-label="Mensagem" value={node.text} onChange={(e) => aoMudar({ text: e.target.value })} rows={3} className={`${campo} mt-1 resize-y`} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="flex items-center justify-between">
              <span className={rotulo}>Esperar a resposta</span>
              <Interruptor ligado={node.wait !== null} aoMudar={(on) => aoMudar({ wait: on ? { minutes: 1380 } : null })} rotulo="Esperar a resposta" />
            </span>
            {node.wait && (
              <select aria-label="Esperar por quanto tempo" value={node.wait.minutes} onChange={(e) => aoMudar({ wait: { minutes: Number(e.target.value) } })} className={`${campo} mt-1`}>
                {ESPERAS.map((m) => <option key={m} value={m}>{horas(m)}</option>)}
              </select>
            )}
            <p className={ajuda}>Quem não responde para aqui. A janela da Meta é de 24 h.</p>
          </div>
          <div>
            {primeiroDepoisDoComentario ? (
              <p className={ajuda}>Sem botão neste direct: é o único que a Meta deixa mandar por comentário, e o Instagram recusa botão pra quem não segue a loja.</p>
            ) : (
              <>
                <span className="flex items-center justify-between">
                  <span className={rotulo}>Botão</span>
                  <Interruptor ligado={comBotao} aoMudar={(on) => aoMudar({ button: on ? "Quero o link" : null })} rotulo="Botão" />
                </span>
                {comBotao && <input aria-label="Texto do botão" maxLength={20} value={node.button ?? ""} onChange={(e) => aoMudar({ button: e.target.value })} className={`${campo} mt-1`} />}
              </>
            )}
          </div>
        </div>
        <Problemas issues={doBloco} />
      </div>
    );
  }

  if (node.type === "invite") {
    return (
      <div className="grid gap-4">
        <label className="block">
          <span className={rotulo}>Campanha do convite</span>
          <select aria-label="Campanha do convite" value={node.campaignSlug ?? ""} onChange={(e) => aoMudar({ campaignSlug: e.target.value || null })} className={`${campo} mt-1`}>
            <option value="">Escolha a campanha</option>
            {campanhas.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <p className={ajuda}>O link sai da campanha e leva a pessoa pro grupo com vaga.</p>
        </label>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className={rotulo}>Mensagem</span>
            <ContadorBytes texto={node.text} max={MAX_MESSAGE_BYTES} reserva={LINK_RESERVE_BYTES} />
          </span>
          <textarea aria-label="Mensagem do convite" value={node.text} onChange={(e) => aoMudar({ text: e.target.value })} rows={3} className={`${campo} mt-1 resize-y`} />
          <p className={ajuda}>O link da campanha entra no fim, sozinho.</p>
        </label>
        {node.remindAfterMinutes !== null && (
          <label className="block">
            <span className={rotulo}>Lembrar quem não clicou depois de</span>
            <select aria-label="Lembrar depois de" value={node.remindAfterMinutes} onChange={(e) => aoMudar({ remindAfterMinutes: Number(e.target.value) })} className={`${campo} mt-1`}>
              {LEMBRETES.map((m) => <option key={m} value={m}>{horas(m)}</option>)}
            </select>
          </label>
        )}
        <Problemas issues={doBloco} />
      </div>
    );
  }

  return <p className="text-13 text-slate-600">Confere na hora se a pessoa segue a loja. Quem não segue recebe o pedido pra seguir e volta pra cá quando responder.</p>;
}
```

- [ ] **Step 2: a trilha**

```tsx
// apps/web/src/components/painel/instagram/trilha.tsx
"use client";

import { GitBranch, MessageCircle, Send, Users } from "lucide-react";
import { canAddFollowGate, canAddReminder, hasFollowGate, hasReminder, setFollowGate, setReminder, updateNode, type NodePatch } from "@/lib/ig/flow/edit";
import { rotuloDaSaida, tituloDoBloco } from "@/lib/ig/flow/labels";
import { linearize, type Passo, type Ramo } from "@/lib/ig/flow/linearize";
import { triggerOf } from "@/lib/ig/flow/graph";
import type { FlowDef, FlowNode } from "@/lib/ig/flow/types";
import type { Issue } from "@/lib/ig/flow/validate";
import { BlocoForm, type CampanhaOpcao } from "./bloco-form";
import { Interruptor } from "./interruptor";

const ICONE = { trigger: MessageCircle, message: Send, invite: Users, condition: GitBranch } as const;

export function Trilha({ def, campanhas, issues, editar }: { def: FlowDef; campanhas: CampanhaOpcao[]; issues: Issue[]; editar: (fn: (d: FlowDef) => FlowDef) => void }) {
  const passos = linearize(def);
  const trigger = triggerOf(def);
  const mudar = (id: string) => (patch: NodePatch) => editar((d) => updateNode(d, id, patch));

  const Bloco = ({ node, indice, ramos, fim }: { node: FlowNode; indice: number | null; ramos: Ramo[]; fim?: Passo["proximo"] }) => {
    const Icone = ICONE[node.type];
    return (
      <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 border-t border-line-200 py-5 first:border-0">
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full border border-line-200 font-data text-13 text-slate-600">{indice ?? "↳"}</span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-15 font-semibold text-volt-950">
            <Icone className="h-4 w-4 text-slate-600" strokeWidth={1.75} aria-hidden="true" />
            {tituloDoBloco(node)}
          </h3>
          <div className="mt-3 max-w-[560px]">
            <BlocoForm node={node} primeiroDepoisDoComentario={indice === 2 && trigger?.on === "comment"} campanhas={campanhas} issues={issues} aoMudar={mudar(node.id)} />
          </div>
          {(ramos.length > 0 || fim) && (
            <ul className="mt-4 grid gap-2">
              {fim && !fim.to && (
                <li className="text-13 text-slate-600"><span className="font-medium text-volt-950">{rotuloDaSaida(fim.out, node)}</span> · fim do fluxo</li>
              )}
              {ramos.map((r) => (
                <li key={r.out} className="text-13 text-slate-600">
                  <span className="font-medium text-volt-950">{rotuloDaSaida(r.out, node)}</span>
                  {r.volta ? ` · volta pra “${tituloDoBloco(def.nodes.find((n) => n.id === r.volta) as FlowNode)}”` : r.alvo ? "" : " · parou aqui"}
                  {r.alvo && <ol className="mt-2 border-l-2 border-line-200 pl-4"><Bloco node={r.alvo.node} indice={null} ramos={r.alvo.ramos} /></ol>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby="roteiro" className="rounded-[10px] border border-line-200 bg-paper-0 px-5">
      <header className="flex h-12 items-center justify-between">
        <h2 id="roteiro" className="text-15 font-semibold text-volt-950">Roteiro</h2>
        <span className="text-12 text-slate-600">{passos.length} {passos.length === 1 ? "passo" : "passos"}</span>
      </header>
      <ol>
        {passos.map((p, i) => <Bloco key={p.node.id} node={p.node} indice={i + 1} ramos={p.ramos} fim={p.proximo} />)}
      </ol>
      <footer className="border-t border-line-200 py-4">
        <h3 className="text-13 font-semibold text-volt-950">Dá pra acrescentar <span className="font-normal text-slate-600">cada um vira um passo ou um desvio</span></h3>
        <ul className="mt-2 grid gap-3">
          {(hasFollowGate(def) || canAddFollowGate(def)) && (
            <li className="flex items-start justify-between gap-4">
              <span><span className="block text-13 font-medium text-volt-950">Pedir resposta e conferir se segue a loja</span><span className="text-12 text-slate-600">A resposta abre 24 h de conversa. Só recebe o link quem segue.</span></span>
              <Interruptor ligado={hasFollowGate(def)} aoMudar={(on) => editar((d) => setFollowGate(d, on))} rotulo="Pedir resposta e conferir se segue a loja" />
            </li>
          )}
          <li className="flex items-start justify-between gap-4">
            <span><span className="block text-13 font-medium text-volt-950">Lembrar quem não clicou</span><span className="text-12 text-slate-600">{hasReminder(def) || canAddReminder(def) ? "Um segundo direct com o link, horas depois." : "Precisa da resposta da pessoa antes: depois de um comentário só sai um direct."}</span></span>
            <Interruptor ligado={hasReminder(def)} aoMudar={(on) => editar((d) => setReminder(d, on))} rotulo="Lembrar quem não clicou" />
          </li>
        </ul>
      </footer>
    </section>
  );
}
```

`indice === 2` é o segundo passo da trilha (o primeiro direct depois do gatilho); se o modelo mudar a numeração, mude aqui e no teste e2e.

- [ ] **Step 3:** `tsc`, `painel:check`. **Commit** `git add apps/web/src/components/painel/instagram && git commit -m "feat(ig): editable step-by-step view of the flow"`.

### Task 20: prévia, "Pra publicar" e o mapa só leitura

**Files:**
- Create: `apps/web/src/components/painel/instagram/previa.tsx`
- Create: `apps/web/src/components/painel/instagram/pra-publicar.tsx`
- Create: `apps/web/src/components/painel/instagram/mapa.tsx`

- [ ] **Step 1: prévia e checklist**

```tsx
// apps/web/src/components/painel/instagram/previa.tsx
import { linearize } from "@/lib/ig/flow/linearize";
import { triggerOf } from "@/lib/ig/flow/graph";
import type { FlowDef } from "@/lib/ig/flow/types";

/** "Como a cliente vê": comentário, resposta pública e os directs da trilha principal. Claro de propósito: é o Instagram, não o painel. */
export function Previa({ def, handle }: { def: FlowDef; handle: string | null }) {
  const trigger = triggerOf(def);
  const palavra = trigger?.keywords[0] ?? "quero";
  const directs = linearize(def).map((p) => p.node).filter((n) => n.type === "message" || n.type === "invite");
  const loja = handle ?? "sua loja";
  return (
    <section aria-labelledby="previa" className="rounded-[10px] border border-line-200 bg-paper-0">
      <h2 id="previa" className="flex h-12 items-center px-5 text-15 font-semibold text-volt-950">Como a cliente vê</h2>
      <div className="rounded-b-[10px] bg-white px-4 py-3 text-13 text-[#262626]">
        {trigger?.on === "comment" && (
          <>
            <p className="text-12 text-[#737373]">No post</p>
            <p className="mt-1"><b>cliente</b> {palavra}</p>
            {trigger.publicReply && <p className="mt-1 pl-4"><b>{loja}</b> {trigger.publicReply}</p>}
          </>
        )}
        <p className="mt-3 text-12 text-[#737373]">No direct</p>
        {directs.map((n) => (
          <p key={n.id} className="mt-2 max-w-[85%] rounded-2xl bg-[#efefef] px-3 py-2">
            {n.text || <span className="text-[#737373]">(sem texto ainda)</span>}
            {n.type === "invite" && <span className="ml-1 rounded border border-dashed border-[#9aa0a6] px-1 text-12 text-[#5f6368]">link da campanha</span>}
          </p>
        ))}
      </div>
    </section>
  );
}
```

A prévia reproduz o Instagram, por isso usa branco e `rounded-2xl` **de propósito**; `npm run painel:check` reprova `rounded-2xl` em `src/components/painel`: troque por `rounded-[18px]` se o lint barrar.

```tsx
// apps/web/src/components/painel/instagram/pra-publicar.tsx
import { Check, CircleAlert } from "lucide-react";
import { checklist, type Issue } from "@/lib/ig/flow/validate";

export function PraPublicar({ issues }: { issues: Issue[] }) {
  const itens = checklist(issues);
  const feitos = itens.filter((i) => i.ok).length;
  return (
    <section aria-labelledby="pra-publicar" className="rounded-[10px] border border-line-200 bg-paper-0 px-5 pb-3">
      <header className="flex h-12 items-center justify-between">
        <h2 id="pra-publicar" className="text-15 font-semibold text-volt-950">Pra publicar</h2>
        <span className="font-data text-13 tabular-nums text-slate-600">{feitos} de {itens.length}</span>
      </header>
      <ul>
        {itens.map((i) => (
          <li key={i.chave} className="flex items-start gap-2 border-t border-line-200 py-2.5 text-13">
            {i.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden="true" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />}
            <span className={i.ok ? "text-slate-600" : "font-medium text-volt-950"}>
              {i.rotulo}
              {!i.ok && <span className="block font-normal text-slate-600">{issues.find((x) => checklistCode(x.code, i.chave))?.text}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function checklistCode(code: Issue["code"], chave: string): boolean {
  return checklist([{ code, nodeId: null, text: "" }]).find((i) => i.chave === chave)?.ok === false;
}
```

- [ ] **Step 2: o mapa**

```tsx
// apps/web/src/components/painel/instagram/mapa.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, MessageCircle, Send, Users } from "lucide-react";
import { resumoDoBloco, rotuloDaSaida, tituloDoBloco } from "@/lib/ig/flow/labels";
import { layout, NODE_H, NODE_W, type EdgePos, type NodePos } from "@/lib/ig/flow/layout";
import { outsOf, type FlowDef } from "@/lib/ig/flow/types";

const ICONE = { trigger: MessageCircle, message: Send, invite: Users, condition: GitBranch } as const;
const COR: Record<EdgePos["kind"], string> = { principal: "var(--color-serie)", desvio: "var(--color-saida)", volta: "var(--color-slate-600)" };

function caminho(a: NodePos, b: NodePos, kind: EdgePos["kind"]): string {
  if (kind === "principal") {
    const x1 = a.x + NODE_W, y1 = a.y + 64, x2 = b.x, y2 = b.y + 64, c = Math.max(20, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
  }
  if (kind === "desvio") {
    const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y;
    return `M ${x1} ${y1} C ${x1} ${y1 + 40}, ${x2} ${y2 - 40}, ${x2} ${y2}`;
  }
  const x1 = a.x + NODE_W, y1 = a.y + 40, x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H;
  return `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 + 60} ${y2 + 50}, ${x2} ${y2}`;
}

/** Só leitura na fase 1: os mesmos blocos do passo a passo, na espinha. Cabe na largura disponível (escala para baixo, nunca para cima). */
export function Mapa({ def }: { def: FlowDef }) {
  const l = layout(def);
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, (el.clientWidth - 16) / l.width));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [l.width]);
  const pos = Object.fromEntries(l.nodes.map((n) => [n.id, n]));

  return (
    <div ref={caixa} data-testid="ig-mapa" role="img" aria-label={`Mapa do fluxo com ${def.nodes.length} blocos`} className="overflow-auto rounded-[10px] border border-line-200 bg-canvas-100 [background-image:radial-gradient(var(--color-line-200)_1px,transparent_1px)] [background-size:24px_24px]">
      <div style={{ width: l.width * escala, height: l.height * escala }}>
        <div className="relative origin-top-left" style={{ width: l.width, height: l.height, transform: `scale(${escala})` }}>
          <svg className="absolute inset-0" width={l.width} height={l.height} aria-hidden="true">
            {l.edges.map((e) => <path key={`${e.from}-${e.out}`} d={caminho(pos[e.from], pos[e.to], e.kind)} fill="none" stroke={COR[e.kind]} strokeWidth={e.kind === "principal" ? 3 : 2} strokeDasharray={e.kind === "volta" ? "4 4" : undefined} />)}
          </svg>
          {l.nodes.map((n) => {
            const node = def.nodes.find((x) => x.id === n.id);
            if (!node) return null;
            const Icone = ICONE[node.type];
            return (
              <article key={n.id} className="absolute rounded-[10px] border border-line-200 bg-paper-0" style={{ left: n.x, top: n.y, width: NODE_W, minHeight: NODE_H }}>
                <h3 className="flex h-10 items-center gap-2 border-b border-line-200 px-3 text-13 font-semibold text-volt-950">
                  <Icone className="h-4 w-4 text-slate-600" strokeWidth={1.75} aria-hidden="true" />{tituloDoBloco(node)}
                </h3>
                <p className="px-3 py-2 text-12 leading-snug text-slate-600">{resumoDoBloco(node)}</p>
                <ul className="border-t border-line-200 px-3 py-1.5 text-12 text-slate-600">
                  {outsOf(node).map((out) => <li key={out} className="flex items-center justify-between py-0.5"><span>{rotuloDaSaida(out, node)}</span><span aria-hidden="true" className="h-2 w-2 rounded-full border border-slate-600" /></li>)}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

O `background-image` com `radial-gradient` é o pontilhado do mapa; se `painel:check` reprovar a palavra "gradient", troque por `bg-[url('data:image/svg+xml;...')]` com um círculo de 1 px, ou remova o pontilhado (não é funcional).

- [ ] **Step 3:** `tsc`, `painel:check`. **Commit** `git add apps/web/src/components/painel/instagram && git commit -m "feat(ig): preview, publish checklist and read-only map"`.

### Task 21: o editor e a rota `[id]`

**Files:**
- Create: `apps/web/src/components/painel/instagram/editor.tsx`
- Create: `apps/web/src/app/painel/instagram/[id]/page.tsx`

**Interfaces:**
- Consumes: Tasks 17–20, `useFoco`, `useCasca().instagram`, `validateFlow`, `lerVisao`/`guardarVisao`, `ChipEstado`, `/api/campanhas` (lista com `slug` e `name`).
- Produces: a tela do fluxo em modo foco: barra de cima (voltar, nome, estado, salvamento, Publicar), faixa de abas (Roteiro) + "Ver como", conteúdo por visão.

- [ ] **Step 1: a rota**

```tsx
// apps/web/src/app/painel/instagram/[id]/page.tsx
import { EditorDoFluxo } from "@/components/painel/instagram/editor";

export const metadata = { title: "Fluxo do Instagram — Girumo" };

export default async function FluxoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorDoFluxo id={id} />;
}
```

- [ ] **Step 2: o editor**

```tsx
// apps/web/src/components/painel/instagram/editor.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, List, Workflow } from "lucide-react";
import { useCasca, useFoco } from "@/components/painel/casca-context";
import { useToast } from "@/components/toast";
import { textoDoSalvamento } from "@/lib/ig/flow/salvamento";
import { validateFlow, type Issue } from "@/lib/ig/flow/validate";
import { guardarVisao, lerVisao, type Visao } from "@/lib/ig/visao";
import { cn } from "@/lib/utils";
import type { CampanhaOpcao } from "./bloco-form";
import { ChipEstado } from "./chip-estado";
import { Mapa } from "./mapa";
import { PraPublicar } from "./pra-publicar";
import { Previa } from "./previa";
import { Trilha } from "./trilha";
import { useFluxo } from "./use-fluxo";

export function EditorDoFluxo({ id }: { id: string }) {
  useFoco();
  const { instagram } = useCasca();
  const toast = useToast();
  const query = useSearchParams();
  const { flow, carga, naoAchou, salvamento, editar, renomear, publicar } = useFluxo(id);
  const [visao, setVisao] = useState<Visao>("passo");
  const [campanhas, setCampanhas] = useState<CampanhaOpcao[]>([]);
  const [issuesDoServidor, setIssuesDoServidor] = useState<Issue[] | null>(null);

  useEffect(() => {
    setVisao(lerVisao(window.localStorage, query.get("ver")));
  }, [query]);
  useEffect(() => {
    fetch("/api/campanhas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: unknown) => setCampanhas(Array.isArray(lista) ? lista.filter((c) => typeof c?.slug === "string").map((c) => ({ slug: c.slug as string, name: String(c.name ?? c.slug) })) : []))
      .catch(() => setCampanhas([]));
  }, []);

  const issues = useMemo(
    () => (flow ? validateFlow(flow.draft, { campaignSlugs: campanhas.map((c) => c.slug), accountConnected: instagram?.account?.status === "active", keywordsInUse: [] }) : []),
    [flow, campanhas, instagram],
  );
  const todasAsIssues = issuesDoServidor ?? issues;

  const trocarVisao = (v: Visao) => {
    setVisao(v);
    guardarVisao(window.localStorage, v);
  };

  const aoPublicar = async () => {
    const faltou = await publicar();
    setIssuesDoServidor(faltou);
    toast(faltou ? "Ainda falta coisa pra publicar. Veja a lista." : "Fluxo publicado.", faltou ? "error" : "success");
  };

  if (carga === "carregando" && !flow) {
    return <div className="p-6"><span role="status" aria-label="Carregando fluxo" className="pn-skeleton block h-7 w-56 rounded-[var(--radius-chip)]" /></div>;
  }
  if (naoAchou) {
    return (
      <div className="p-6">
        <p className="text-15 text-volt-950">Fluxo não encontrado.</p>
        <Link href="/painel/instagram" className="mt-2 inline-block text-13 text-cobalt-500">Voltar pra lista</Link>
      </div>
    );
  }
  if (carga === "erro" || !flow) {
    return <div className="p-6"><p className="text-13 text-slate-600">Não deu pra carregar o fluxo. <Link href="/painel/instagram" className="text-cobalt-500">Voltar</Link></p></div>;
  }

  const bloqueado = todasAsIssues.length > 0;
  const motivo = bloqueado ? todasAsIssues[0].text : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-canvas-100">
      <header className="flex h-14 items-center gap-3 border-b border-line-200 bg-paper-0 px-4">
        <Link href="/painel/instagram" aria-label="Voltar pra lista de fluxos" className="flex h-9 items-center gap-1 text-13 text-slate-600 hover:text-volt-950">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />Instagram
        </Link>
        <input aria-label="Nome do fluxo" value={flow.name} onChange={(e) => renomear(e.target.value)} maxLength={80} className="min-w-0 flex-1 bg-transparent text-15 font-semibold text-volt-950 outline-none" />
        <ChipEstado status={flow.status} />
        <span role="status" className="hidden text-12 text-slate-600 sm:block">{textoDoSalvamento(salvamento)}</span>
        <button type="button" onClick={() => void aoPublicar()} disabled={bloqueado} title={motivo} className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-volt-950 px-3 text-13 font-medium text-canvas-100 disabled:cursor-not-allowed disabled:opacity-50">
          {flow.status === "live" ? "Publicar alteração" : "Publicar"}
        </button>
      </header>

      <div className="flex h-11 items-center justify-between border-b border-line-200 bg-paper-0 px-4">
        <nav aria-label="Seções do fluxo" className="flex gap-4 text-13">
          <button type="button" aria-pressed="true" className="h-11 border-b-2 border-volt-950 font-medium text-volt-950">Roteiro</button>
        </nav>
        <div className="flex items-center gap-2">
          <span id="ver-como" className="text-12 text-slate-600">Ver como</span>
          <div role="group" aria-labelledby="ver-como" className="flex gap-1">
            {([["passo", List, "Passo a passo"], ["mapa", Workflow, "Mapa"]] as const).map(([v, Icone, texto]) => (
              <button key={v} type="button" aria-pressed={visao === v} onClick={() => trocarVisao(v)} className={cn("flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-13", visao === v ? "border-slate-600 bg-hover-ficha text-volt-950" : "border-line-200 text-slate-600 hover:text-volt-950")}>
                <Icone className="h-3.5 w-3.5" aria-hidden="true" />{texto}
              </button>
            ))}
          </div>
        </div>
      </div>

      {motivo && <p className="border-b border-line-200 bg-aviso-fundo px-4 py-2 text-13 text-volt-950">Pra publicar: {motivo}</p>}

      <main className="grid flex-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6">
        {visao === "passo" ? (
          <Trilha def={flow.draft} campanhas={campanhas} issues={todasAsIssues} editar={editar} />
        ) : (
          <div className="grid gap-3">
            <Mapa def={flow.draft} />
            <p className="text-12 text-slate-600">O mapa é só pra olhar por enquanto. Pra mudar um bloco, troque pra “Passo a passo”.</p>
          </div>
        )}
        <aside className="grid gap-5 self-start">
          <Previa def={flow.draft} handle={instagram?.account?.username ?? null} />
          <PraPublicar issues={todasAsIssues} />
        </aside>
      </main>
    </div>
  );
}
```

Quando o servidor devolve a lista (409), ela substitui a do cliente até a próxima edição: em `editar`/`renomear` chame também `setIssuesDoServidor(null)` (embrulhe as duas funções no editor).

- [ ] **Step 3:** `tsc`, `painel:check`, `lint`. No navegador (1440 e 390): criar pelas quatro receitas, trocar a visão (o `?ver=mapa` abre no mapa; o botão persiste no `localStorage`), editar texto e ver "Salvando…" → "Salvo" (PATCH na aba de rede), ligar "Pedir resposta…" na receita simples e ver os passos entrarem, "Publicar" desabilitado com o motivo "Conecte o Instagram pra publicar." quando o resto está preenchido. Com `?id` inexistente: "Fluxo não encontrado." e `painel-root` segue montado (o foco só esconde corredor, letreiro e barra).

- [ ] **Step 4: commit** `git add apps/web/src/components/painel/instagram/editor.tsx "apps/web/src/app/painel/instagram/[id]" && git commit -m "feat(ig): flow editor route with the two views in focus mode"`.

### Task 22: e2e do editor

**Files:**
- Modify: `apps/web/e2e/fixtures-dinamicas.ts` (fixture de `/painel/instagram/[id]`)
- Create: `apps/web/e2e/painel-instagram.spec.ts`

- [ ] **Step 1: o fixture** (antes de `export const FIXTURES_DINAMICAS`):

```ts
const fixtureFluxoInstagram: FixtureDinamica = {
  inexistente: UUID_INEXISTENTE,
  async criar(request) {
    const nome = `E2E fluxo instagram ${Date.now().toString(36)}`;
    const res = await request.post("/api/ig/flows", { data: { recipe: "comment_invite", name: nome } });
    if (!res.ok()) throw new Error(`POST /api/ig/flows respondeu ${res.status()}: ${await res.text()}`);
    const criado = (await res.json()) as { flow: { id: string } };
    return {
      valor: criado.flow.id,
      // O nome fica num <input> na barra de cima, não em texto corrido.
      marca: { tipo: "campo", valor: nome },
      apagar: async () => {
        await request.delete(`/api/ig/flows/${criado.flow.id}`);
      },
    };
  },
};
```

e em `FIXTURES_DINAMICAS` acrescente `"/painel/instagram/[id]": fixtureFluxoInstagram,`.

- [ ] **Step 2: o spec** (copie as 10 primeiras linhas de `e2e/painel-vitrine-relampago.spec.ts`: imports do Playwright, `exigeCredenciais` e `semErroDeRuntime` de `./sessao-helpers`; o corpo é este):

```ts
test.describe("Fluxos do Instagram", () => {
  test.beforeEach(() => exigeCredenciais());

  test("cria um rascunho pela receita, troca de visão e vê o que falta pra publicar", async ({ page }) => {
    await page.goto("/painel/instagram/novo", { waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name: /Comentou, segue e entra no grupo/ }).click();
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await expect(page).toHaveURL(/\/painel\/instagram\/[0-9a-f-]{36}/);

    await expect(page.getByRole("heading", { name: "Roteiro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pra publicar" })).toBeVisible();
    await expect(page.getByText("Conecte o Instagram pra publicar.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Publicar/ })).toBeDisabled();

    await page.getByRole("group", { name: "Ver como" }).getByRole("button", { name: "Mapa" }).click();
    await expect(page.getByTestId("ig-mapa")).toBeVisible();
    await page.getByRole("group", { name: "Ver como" }).getByRole("button", { name: "Passo a passo" }).click();
    await expect(page.getByRole("heading", { name: "Roteiro" })).toBeVisible();

    // O editor é modo foco: a casca some, a raiz fica.
    await expect(page.getByTestId("painel-root")).toBeVisible();
    await expect(page.getByTestId("painel-letreiro")).toHaveCount(0);
    await semErroDeRuntime(page);

    const id = page.url().match(/instagram\/([0-9a-f-]{36})/)?.[1];
    if (id) await page.request.delete(`/api/ig/flows/${id}`);
  });
});
```

- [ ] **Step 3:** `tsc` do e2e limpo; com credenciais: `npm --workspace apps/web run e2e -- painel-instagram.spec.ts painel-rotas-dinamicas.spec.ts`.

- [ ] **Step 4: commit** `git add apps/web/e2e && git commit -m "test(e2e): Instagram flow editor and its dynamic-route fixture"`.

### PR E — gate e entrega

- [ ] Gate completo. PR "feat(ig): flow editor with step-by-step and read-only map (phase 1, PR E)". No corpo, anexe uma captura do editor nas duas visões (a prova do quadro).
- [ ] Mergeado: quadro e encerramento na seção final.

# Encerramento da fase 1

- [ ] Quadro (prod), depois do PR E mergeado e aberto no ar pelo Igor (ou por você com a loja de QA em produção, se tiver acesso):

```sql
select public.move_card('ig-painel-gatilhos', 'no_ar_nao_verificado',
  'Fase 1 mergeada: modelo do fluxo, schema, API, menu com liberação, lista, novo fluxo e editor (passo a passo + mapa só leitura).',
  'PRs A-E da fase 1 (plano 2026-10-03)');
update public.board_features
   set blocker = 'Fase 1 no ar sem verificação em produção. Fase 2 (conectar pela Zernio, motor das receitas de 1 direct) não começou. Liberação por loja é manual (tenant_settings.instagram_enabled).',
       updated_at = now()
 where key = 'ig-painel-gatilhos';
update public.board_features
   set blocker = 'Schema da fase 1 aplicado nos dois bancos pela migração 20261003120000 (ig_flows, ig_runs, ig_run_steps; ig_triggers e ig_events removidas).',
       updated_at = now()
 where key = 'ig-schema';
```

`no_ar_verificado` só com prova colhida na hora (captura do editor em produção, com data) no `p_ref`.

- [ ] Registre a decisão no grafo (PowerShell, raiz do repositório):

```powershell
.\tools\lightrag\.venv\Scripts\rag.exe insert "fase 1 dos Fluxos do Instagram entregue (plano 2026-10-03): modelo puro em lib/ig/flow, schema ig_flows/ig_runs/ig_run_steps, rotas /api/ig/*, item Instagram no menu só com tenant_settings.instagram_enabled, modo foco na casca, lista, novo fluxo e editor com passo a passo editável e mapa só leitura. Fase 2: conexão pela Zernio e motor." --source decisao-YYYY-MM-DD-ig-fase1
```

- [ ] Reporte "PRs que deixei abertos: nenhum" (ou qual e por quê).

## O que fica para as próximas fases (não faça agora)

Conectar a conta pela Zernio, webhook, motor e aba Atendimentos (fase 2); espera por resposta de verdade, "segue a loja?", clique atribuído com `?ig=<ref>`, lembrete pelo relógio do worker, números por passo (fase 3); cobrança R$ 297 + R$ 200 e a oferta na tela (fase 4); mapa editável com arrastar (fase 5). Blocos Etiqueta, Teste A/B, Esperar e Passar pra loja, receita "Perguntas prontas" e botão "Testar" ficam fora até alguém pedir.

## Auto-revisão do plano (feita em 03/10)

- Cobertura do spec §16 fase 1: migração (T7), modelo (T1–T6), stores (T9), rotas (T10–T11), lista (T14), novo (T15), passo a passo (T19, T21), mapa só leitura (T20), modo foco (T13), menu com liberação (T12–T13), "Publicar" bloqueado com o motivo (T11, T21), e2e (T16, T22).
- Nomes usados nas tarefas tardias existem nas iniciais: `FlowDef`/`FlowNode`/`outsOf` (T1), `parseFlowDef`/`flowDefSchema` (T2), `RECIPES`/`RECIPE_ORDER`/`DEFAULT_TEXTS`/`isRecipeId` (T3), `validateFlow`/`checklist`/`Issue` (T4), `updateNode`/`NodePatch`/`setFollowGate`/`setReminder`/`canAdd*`/`has*` (T5), `linearize`/`Passo`/`Ramo`/`layout`/`NODE_W`/`NODE_H` (T6), `FlowRow`/`FlowSummary`/`FlowStatus`/`listFlows`/`getFlow`/`createFlow`/`updateDraft`/`deleteFlow`/`publishFlow`/`listLiveFlows`/`getAccount` (T9), `requireInstagram`/`keywordsInUse` (T10), `isUuid`/`createBodySchema`/`patchBodySchema` (T11), `liberado`/`Liberacoes` (T12), `useCasca`/`useFoco`/`StatusInstagram` (T13), `ChipEstado` (T14), `lerVisao`/`guardarVisao` (T15), `useFluxo`/`textoDoSalvamento` (T17), `Interruptor`/`Palavras`/`ContadorBytes` (T18), `Trilha`/`BlocoForm`/`CampanhaOpcao` (T19), `Previa`/`PraPublicar`/`Mapa` (T20).
- Pontos que o executor pode precisar ajustar ao vivo (marcados no texto): a ordem canônica de `ordenar` (T5), o tipo de retorno de `carregarCampanhas` (T11), `rounded-2xl`/`gradient` barrados pelo `painel:check` na prévia e no mapa (T20), as classes exatas do interruptor (T18).
