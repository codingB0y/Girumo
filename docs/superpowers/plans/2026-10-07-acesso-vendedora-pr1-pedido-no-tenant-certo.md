# Acesso da vendedora — PR 1 (pedido no tenant certo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/orders` e `DELETE /api/orders` passam a gravar e apagar pedido **na loja da rota** (a do `x-tenant-id`), não na primeira membership da sessão; o `DELETE` exige sessão e responde 404 quando nada foi apagado; o `POST` recusa `leadId` de outra loja; `getSessionTenantId` (sem chamador) sai.

**Architecture:** Nenhum arquivo de produção novo. A store `lib/stores/orders.ts` para de descobrir o tenant sozinha (`getTenantId()` sai) e recebe o `tenantId` que a rota já resolve com `getRouteTenantContext`. A rota confere o lead com o `getLeadAttribution(tenantId, leadId)` que ela já chamava — hoje o `null` só pulava a atribuição — e usa o retorno de `removeOrder` (agora contado pelas linhas devolvidas por `.select("id")`) para responder 404. Os testes usam o cliente real do Supabase contra um servidor HTTP local (padrão de `lib/stores/leads.test.ts`, PR #340); o teste da rota também responde o `/auth/v1/user` do Bearer, então `getTenantContext` roda de verdade, sem mock de módulo e sem credencial.

**Tech Stack:** Next.js 15 (route handlers), `@supabase/supabase-js` 2.108 (postgrest-js / auth-js), `node --test` via tsx.

**Spec:** `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` (§3 "Registrar", §5 "Correções que entram junto", §8 PR 1) · **Índice e contrato:** `docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md` (seção "PR 1 → PR 4")

## Global Constraints

Regras que valem para os seis (copiadas do índice):

- Código, identificadores e commits em inglês; texto de tela e de erro em pt-BR. Commits com prefixo semântico e terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`:
  - unit: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`
  - tipos (os **dois**; lint e tsx não checam tipo): `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`
  - lint: `npm run lint` · suíte: `npm test`
- Antes do push: `scripts/verify-local.ps1` (secrets + build) — é o gate real; o `verify` do CI é pulado na `main`. **O caminho real no repositório é `infra/scripts/verify-local.ps1`** (conferido em 07/10).
- Nunca `git add -A`. `git diff --cached --stat` numa chamada separada antes de cada commit.
- Store Supabase: **sempre** `.eq("tenant_id", tenantId)` — o service-role ignora RLS.
- Ao **começar** cada PR, mover o card no quadro de prod; ao terminar, `move_card` com prova + `update ... set blocker = null`. DML em prod passa pelo Igor (o classificador barra). O plano lista o SQL; não pular.
- Fechar o loop na mesma sessão: revisar → CI verde → mergear → apagar branch. Ao encerrar: "PRs que deixei abertos: …".

Específicas deste PR:

- **Contrato PR 1 → PR 4 é vinculante** (o PR 4 consome exatamente isto):
  ```ts
  export async function addOrder(tenantId: string, input: {
    phone?: string; leadId?: string; group?: string; campaignId?: string; value: number;
  }): Promise<Order>;
  /** true só se uma linha foi apagada. */
  export async function removeOrder(tenantId: string, id: string): Promise<boolean>;
  ```
- Mensagens exatas: `POST` com lead que não é da loja → **400 `{ error: "Contato não encontrado." }`**; `DELETE` sem linha apagada → **404 `{ error: "Pedido não encontrado." }`**; `DELETE` que apagou → **200 `{ ok: true }`**.
- `GET /api/orders` não muda. Nenhuma tela muda: o único cliente do `POST` (`components/painel/contatos/vitrine/contatos-vitrine.tsx:374-384`) já mostra `corpo?.error`, e **nenhum** cliente chama o `DELETE` (conferido por grep em 07/10).
- Testes sem credencial e sem mock de módulo: servidor HTTP local + `SUPABASE_URL` apontando para ele, como `lib/stores/leads.test.ts`. Nada de banco real neste PR.
- `<WT>` neste plano = caminho absoluto do worktree onde a branch `fix/orders-tenant-da-rota` está (o `git rev-parse --show-toplevel` da Task 0). O cwd do Bash reseta entre chamadas: todo comando leva `git -C "<WT>"` ou `cd "<WT>/apps/web" && …` na mesma chamada.
- Escopo: 5 arquivos (tabela abaixo). Se aparecer um sexto, parar e perguntar.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/stores/orders.ts` | modificar | `addOrder(tenantId, input)` e `removeOrder(tenantId, id)`; sai `getTenantId()` e o import de `getSessionAccountId`; `removeOrder` conta as linhas apagadas |
| `apps/web/src/lib/stores/orders.test.ts` | criar | PostgREST falso: insert na loja passada, delete com `tenant_id` + `select=id`, 0 linhas = `false`, erro do banco rejeita |
| `apps/web/src/app/api/orders/route.ts` | modificar | `POST` confere o lead na loja (400) e passa o tenant; `DELETE` com `getRouteTenantContext` e 404 |
| `apps/web/src/app/api/orders/route.test.ts` | criar | a rota inteira contra Supabase falso (PostgREST + `/auth/v1/user`) |
| `apps/web/src/lib/session.ts` | modificar | sai `getSessionTenantId` e o import de `getSupabaseAdmin` |

---

### Task 0: branch, defasagem e card

**Files:** nenhum arquivo do repositório.

**Interfaces:** Consumes: `origin/main`. Produces: branch `fix/orders-tenant-da-rota` em `<WT>`, sem upstream; `node_modules` utilizável em `<WT>`.

- [ ] **Step 1: escolher o worktree.** Se a sessão já roda num worktree do app (`.claude/worktrees/<nome>`), a branch nasce **nele** — criar outro worktree e escrever lá é bloqueado pelo harness. Conferir que está limpo:

```bash
git -C "<WT>" status --short
```

Esperado: vazio. Se não estiver, parar e perguntar (pode ser trabalho de outra sessão). Fora de worktree do app (checkout principal): `git worktree add "<pasta>" -b fix/orders-tenant-da-rota origin/main` e usar `<pasta>` como `<WT>` — **nunca** `checkout -b` no checkout principal.

- [ ] **Step 2: criar a branch de `origin/main` atualizado e tirar o upstream herdado.**

```bash
git -C "<WT>" fetch origin main
```
```bash
git -C "<WT>" switch -c fix/orders-tenant-da-rota origin/main
```
```bash
git -C "<WT>" branch --unset-upstream
```

- [ ] **Step 3: defasagem (regra de PR do `CLAUDE.md`).**

```bash
git -C "<WT>" fetch origin main
```
```bash
git -C "<WT>" log HEAD..origin/main --oneline | wc -l
```

Esperado: `0` (a branch acabou de nascer de `origin/main`). Mais de ~20 → atualizar antes de escrever código.

- [ ] **Step 4: o trabalho já está em `main` ou em outro PR?**

```bash
grep -n "export async function addOrder\|export async function removeOrder\|async function getTenantId" "<WT>/apps/web/src/lib/stores/orders.ts"
```

Esperado (estado de 07/10): `17:async function getTenantId()`, `60:export async function addOrder(input: {`, `84:export async function removeOrder(id: string)`. Se `addOrder` já recebe `tenantId`, o PR já foi entregue: parar e avisar.

```bash
gh pr list --repo codingB0y/Girumo --state open --search "orders in:title"
```
```bash
git -C "<WT>" ls-remote --heads origin fix/orders-tenant-da-rota
```

Esperado: nenhum PR de pedidos aberto e nenhuma branch remota com esse nome (sessões paralelas colidem em PR).

- [ ] **Step 5: dependências.** O `node_modules` do checkout principal estava **vazio** em 07/10, então junction não serve. No PowerShell:

```powershell
Test-Path "<WT>\node_modules\next"
```

Se `False`:

```powershell
Set-Location "<WT>"; npm ci --workspace apps/web --include-workspace-root --no-audit --no-fund
```

(~1 min, ~0.7 GB; conferir espaço no C: antes — ENOSPC aparece disfarçado de erro de código.)

- [ ] **Step 6: card no quadro (prod `nidoatbxaylrkcgbszns`, o Igor roda).** O `insert` só age se o card ainda não existir (o PR 2 pode ter criado antes):

```sql
insert into public.board_features (key, title, area, status, summary, priority)
values ('acesso-vendedora', 'Acesso da vendedora (vendas por módulo)', 'Auth', 'nao_existe',
        'Papel seller com módulos liberados pelo dono e tela Registrar venda. Spec docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md; planos 2026-10-07-acesso-vendedora-*.',
        'alta')
on conflict (key) do nothing;
select public.move_card('acesso-vendedora', 'em_construcao',
  'PR 1 começou: pedido gravado no tenant da rota (addOrder/removeOrder), DELETE autenticado com 404, leadId conferido na loja.',
  'fix/orders-tenant-da-rota');
```

---

### Task 1: a store recebe o tenant da rota (TDD)

**Files:** criar `apps/web/src/lib/stores/orders.test.ts`; modificar `apps/web/src/lib/stores/orders.ts`, `apps/web/src/app/api/orders/route.ts`.

**Interfaces:**
- Consumes: `getSupabaseAdmin()` (`lib/supabase/server.ts:13`, lê `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` na primeira chamada); `getRouteTenantContext(req, { allowEngine: false })` (`lib/route-tenant-context.ts:13`).
- Produces: `addOrder(tenantId: string, input: { phone?; leadId?; group?; campaignId?; value }): Promise<Order>` e `removeOrder(tenantId: string, id: string): Promise<boolean>` — o contrato PR 1 → PR 4.

- [ ] **Step 1: todos os chamadores.**

```bash
grep -rn "addOrder\|removeOrder" "<WT>/apps/web/src" "<WT>/apps/web/e2e" "<WT>/apps/web/scripts" "<WT>/hubflow-engine" "<WT>/packages"
```

Esperado (07/10): só `apps/web/src/app/api/orders/route.ts:1` (import), `:62` (`addOrder({`), `:94` (`removeOrder(id)`) e as definições em `apps/web/src/lib/stores/orders.ts:60` e `:84`. Nenhum teste, e2e ou seed chama. Se aparecer outro chamador, ele entra neste task com a mesma troca (`tenantId` como primeiro argumento) — e o escopo do PR muda: avisar.

- [ ] **Step 2: teste que falha.** Criar `apps/web/src/lib/stores/orders.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { addOrder, removeOrder } from "./orders";

/**
 * O cliente real do Supabase conversando com um PostgREST de mentira (o padrão
 * de `leads.test.ts`): a query que sai daqui é a de produção, só a rede é
 * trocada. Roda sem credencial nenhuma.
 */

type Pedido = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const pedidos: Pedido[] = [];
let responder: (pedido: Pedido) => Resposta = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const pedido: Pedido = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    pedidos.push(pedido);
    const { status, corpo } = responder(pedido);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
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

test("addOrder grava na loja que a rota passou, sem perguntar à sessão qual é", async () => {
  pedidos.length = 0;
  const linha = { id: "p1", tenant_id: "loja-b", phone: "5511987654321", lead_id: null, group_name: null, campaign_id: null, value: 149.9 };
  responder = () => ({ status: 201, corpo: linha });

  // Mutante: o getTenantId() antigo, que lia a primeira membership da sessão e
  // gravava na loja errada quem pertence a duas.
  assert.deepEqual(await addOrder("loja-b", { phone: "+55 (11) 98765-4321", value: 149.9 }), linha);

  assert.equal(pedidos.length, 1);
  const [{ metodo, url, corpo }] = pedidos;
  assert.equal(metodo, "POST");
  assert.equal(url.pathname, "/rest/v1/orders");
  assert.deepEqual(corpo, {
    tenant_id: "loja-b",
    phone: "5511987654321",
    lead_id: null,
    group_name: null,
    campaign_id: null,
    value: 149.9,
  });
});

test("removeOrder apaga só na loja da rota e diz true quando o banco devolve a linha", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, corpo: [{ id: "p1" }] });

  assert.equal(await removeOrder("loja-b", "p1"), true);

  assert.equal(pedidos.length, 1);
  const [{ metodo, url }] = pedidos;
  assert.equal(metodo, "DELETE");
  assert.equal(url.pathname, "/rest/v1/orders");
  // Sem o tenant, o service-role apaga pedido de qualquer loja. Sem o `select`,
  // o PostgREST não devolve as linhas e não há como saber se apagou.
  assert.deepEqual(Object.fromEntries(url.searchParams), { id: "eq.p1", tenant_id: "eq.loja-b", select: "id" });
});

test("removeOrder sem linha apagada (pedido de outra loja ou inexistente) é false", async () => {
  // Mutante: o `return !error` antigo, que dizia true sem ter apagado nada.
  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await removeOrder("loja-b", "p-de-outra-loja"), false);
});

test("removeOrder com erro do banco rejeita em vez de virar false", async () => {
  responder = () => ({ status: 500, corpo: { message: "falhou no banco" } });
  await assert.rejects(removeOrder("loja-b", "p1"), /falhou no banco/);
});
```

- [ ] **Step 3: rodar e ver falhar.**

```bash
cd "<WT>/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/orders.test.ts
```

Esperado: **FAIL 4/4** (conferido contra o código de 07/10). Os três primeiros com `` Error: `cookies` was called outside a request scope `` — é o `getTenantId()` antigo (`orders.ts:17-30`) chamando `getSessionAccountId()` → `cookies()` fora de request, ou seja, a store ainda decide o tenant pela sessão. O quarto com `The input did not match the regular expression /falhou no banco/` (mesma causa).

- [ ] **Step 4: implementação.** `apps/web/src/lib/stores/orders.ts` fica assim (sai o import de `getSessionAccountId` da linha 3 e o `getTenantId` das linhas 17-30; `listOrdersByTenant` e `countOrders` não mudam):

```ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type Order = {
  id: string;
  phone: string;
  lead_id?: string | null;
  group_name?: string | null;
  /** Campanha de origem (inferida do lead no registro); null = sem origem. */
  campaign_id?: string | null;
  value: number;
  tenant_id?: string;
  created_at?: string;
};

/**
 * Pedidos do tenant, mais recentes primeiro.
 *
 * Parametrizado de propósito: a versão que derivava o tenant da sessão por
 * conta própria era a única das dez cargas da Início que ignorava o header
 * `x-tenant-id`, então quem pertence a duas organizações via os pedidos da
 * primeira enquanto o resto da tela falava da segunda.
 */
export async function listOrdersByTenant(tenantId: string): Promise<Order[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

/** Total de pedidos do tenant. */
export async function countOrders(tenantId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * O tenant vem da rota (`getRouteTenantContext`), como no `listOrdersByTenant`:
 * a versão que lia a primeira membership da sessão gravava o pedido na loja
 * errada para quem pertence a duas — a vendedora com loja própria convidada
 * para outra, por exemplo.
 */
export async function addOrder(
  tenantId: string,
  input: {
    phone?: string;
    leadId?: string;
    group?: string;
    campaignId?: string;
    value: number;
  },
): Promise<Order> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .insert({
      tenant_id: tenantId,
      phone: (input.phone ?? "").replace(/\D/g, ""),
      lead_id: input.leadId || null,
      group_name: input.group || null,
      campaign_id: input.campaignId || null,
      value: input.value,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Order;
}

/** true só se uma linha foi apagada: pedido de outra loja ou inexistente devolve false. */
export async function removeOrder(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
```

(`removeOrder` segue o `removeLead` de `lib/stores/leads.ts:181-190`: erro sobe, a contagem decide.)

- [ ] **Step 5: os dois chamadores na rota.** Em `apps/web/src/app/api/orders/route.ts`:

  Linha 62, trocar `    const order = await addOrder({` por:

```ts
    const order = await addOrder(tenantId, {
```

  e o `DELETE` inteiro (linhas 90-99, hoje sem contexto de rota) por — a store não sabe mais achar o tenant, então a rota precisa resolvê-lo:

```ts
export async function DELETE(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  try {
    const ok = await removeOrder(tenantId, id);
    return Response.json({ ok });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

  (O 404 e a conferência do lead entram na Task 2, com teste próprio.)

- [ ] **Step 6: rodar e ver passar.**

```bash
cd "<WT>/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/orders.test.ts
```

Esperado: `pass 4`, `fail 0`.

- [ ] **Step 7: tipos.**

```bash
cd "<WT>/apps/web" && npx tsc --noEmit -p tsconfig.json
```
```bash
cd "<WT>/apps/web" && npx tsc --noEmit -p tsconfig.e2e.json
```

Esperado: os dois limpos (um chamador esquecido aparece aqui como `Expected 2 arguments, but got 1`).

- [ ] **Step 8: commit.**

```bash
git -C "<WT>" add apps/web/src/lib/stores/orders.ts apps/web/src/lib/stores/orders.test.ts apps/web/src/app/api/orders/route.ts
```
```bash
git -C "<WT>" diff --cached --stat
```

Esperado: exatamente esses 3 arquivos.

```bash
git -C "<WT>" commit -m "fix(orders): store takes the tenant from the route" -m "addOrder and removeOrder looked up the first accepted membership of the session cookie, so a member of two stores wrote orders to the first one and ignored x-tenant-id. Both now take the tenantId that the route resolves with getRouteTenantContext; DELETE resolves it too. removeOrder counts the rows returned by select(\"id\") and is true only when one was deleted." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: a rota confere o lead e diz 404 quando não apagou (TDD)

**Files:** criar `apps/web/src/app/api/orders/route.test.ts`; modificar `apps/web/src/app/api/orders/route.ts`.

**Interfaces:**
- Consumes: `getLeadAttribution(tenantId, leadId): Promise<{ source_campaign; source_group_id } | null>` (`lib/stores/leads.ts:109-121`, filtra por `tenant_id` e `id`, `maybeSingle`); `removeOrder(tenantId, id): Promise<boolean>` (Task 1); `getTenantContext` lendo Bearer → `GET {SUPABASE_URL}/auth/v1/user` e `memberships` (`lib/supabase/tenant-context.ts:60-117`).
- Produces: `POST /api/orders` → 400 `{ error: "Contato não encontrado." }` quando o lead não é da loja (ou não é uuid), 500 sem gravar quando a busca do lead falha; `DELETE /api/orders?id=` → 401 sem sessão, 404 `{ error: "Pedido não encontrado." }` sem linha apagada (ou id não-uuid), 200 `{ ok: true }`.

- [ ] **Step 1: teste que falha.** Criar `apps/web/src/app/api/orders/route.test.ts` (é o primeiro teste de rota do repo que roda `getTenantContext` de verdade: o servidor falso responde também o `/auth/v1/user` do Bearer; sem Bearer nem cookie, o `cookies()` de dentro do `sessionExpired` lança fora de request e é engolido por ele — o 401 sai igual):

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { DELETE, POST } from "./route";

/**
 * A rota inteira contra um Supabase de mentira: o PostgREST falso de
 * `lib/stores/leads.test.ts` mais o `/auth/v1/user` que confere o Bearer.
 * Sessão, membership, lead e pedido saem como em produção; só a rede é trocada.
 */

const LEAD = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const PEDIDO = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const CAMPANHA = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown; contentRange?: string };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo, contentRange } = responder(chamada);
    if (contentRange) res.setHeader("Content-Range", contentRange);
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
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
});

after(() => {
  supabase.close();
});

/**
 * Dono logado por Bearer e membro aceito da `loja-b`; `tabelas` responde o resto
 * por "MÉTODO /caminho". Chamada que ninguém previu vira 500, para aparecer.
 */
function banco(tabelas: Record<string, () => Resposta>): (chamada: Chamada) => Resposta {
  return ({ metodo, url }) => {
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: "loja-b", role: "owner" }] };
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela() : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

/** Request do dono, com a loja escolhida no `x-tenant-id` como o painel manda. */
function doDono(metodo: string, caminho: string, corpo?: unknown): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

test("POST recusa lead que não é da loja e não grava pedido", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/leads": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/orders": () => ({ status: 201, corpo: { id: PEDIDO } }),
  });

  // Mutante: o `if (lead)` antigo, que só pulava a atribuição e gravava o
  // lead_id de outra loja no pedido.
  const res = await POST(doDono("POST", "/api/orders", { value: "149,90", leadId: LEAD }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Contato não encontrado." });
  assert.equal(feitas("POST", "/rest/v1/orders").length, 0);
  // A busca é na loja da rota: sem o filtro, o service-role acha o lead de qualquer loja.
  const [busca] = feitas("GET", "/rest/v1/leads");
  assert.equal(busca.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(busca.url.searchParams.get("id"), `eq.${LEAD}`);
});

test("POST com leadId que não é uuid responde 400 sem ir ao banco", async () => {
  chamadas.length = 0;
  responder = banco({ "POST /rest/v1/orders": () => ({ status: 201, corpo: { id: PEDIDO } }) });

  // Sem a checagem o Postgres devolve 22P02 e a rota daria 500 com a mensagem dele.
  const res = await POST(doDono("POST", "/api/orders", { value: "10", leadId: "abc" }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Contato não encontrado." });
  assert.equal(feitas("GET", "/rest/v1/leads").length, 0);
  assert.equal(feitas("POST", "/rest/v1/orders").length, 0);
});

test("POST com o banco fora na busca do lead responde 500 e não grava pedido", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/leads": () => ({ status: 500, corpo: { message: "banco fora" } }),
    "POST /rest/v1/orders": () => ({ status: 201, corpo: { id: PEDIDO } }),
  });

  // Mutante: a busca do lead de volta no try best-effort da atribuição, que
  // engolia o erro e gravava o pedido com um lead que ninguém conferiu.
  const res = await POST(doDono("POST", "/api/orders", { value: "10", leadId: LEAD }));

  assert.equal(res.status, 500);
  assert.equal(feitas("POST", "/rest/v1/orders").length, 0);
});

test("POST grava na loja da rota, com o lead e a campanha dela", async () => {
  chamadas.length = 0;
  const linha = { id: PEDIDO, tenant_id: "loja-b", phone: "5511987654321", lead_id: LEAD, group_name: "VIP 1", campaign_id: CAMPANHA, value: 149.9 };
  responder = banco({
    "GET /rest/v1/leads": () => ({ status: 200, corpo: [{ source_campaign: null, source_group_id: "120363@g.us" }] }),
    "GET /rest/v1/campaign_groups": () => ({
      status: 200,
      corpo: [{ id: CAMPANHA, name: "VIP", slug: "vip", group_ids: ["120363@g.us"], created_at: "2026-09-01T00:00:00Z" }],
    }),
    "POST /rest/v1/orders": () => ({ status: 201, corpo: linha }),
    "PATCH /rest/v1/leads": () => ({ status: 200, corpo: [] }),
    "HEAD /rest/v1/orders": () => ({ status: 200, contentRange: "*/7" }),
  });

  const res = await POST(
    doDono("POST", "/api/orders", { value: "149,90", leadId: LEAD, phone: "5511987654321", group: "VIP 1" }),
  );

  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), linha);
  const [gravado] = feitas("POST", "/rest/v1/orders");
  assert.deepEqual(gravado.corpo, {
    tenant_id: "loja-b",
    phone: "5511987654321",
    lead_id: LEAD,
    group_name: "VIP 1",
    campaign_id: CAMPANHA,
    value: 149.9,
  });
});

test("DELETE sem sessão é 401 e não apaga nada", async () => {
  chamadas.length = 0;
  responder = banco({ "DELETE /rest/v1/orders": () => ({ status: 200, corpo: [{ id: PEDIDO }] }) });

  // Mutante: o DELETE antigo, que não chamava getRouteTenantContext.
  const res = await DELETE(new Request(`http://girumo.test/api/orders?id=${PEDIDO}`, { method: "DELETE" }));

  assert.equal(res.status, 401);
  assert.equal(feitas("DELETE", "/rest/v1/orders").length, 0);
});

test("DELETE de pedido que não é da loja (ou id que não é uuid) responde 404", async () => {
  chamadas.length = 0;
  responder = banco({ "DELETE /rest/v1/orders": () => ({ status: 200, corpo: [] }) });

  // Mutante: o `{ ok }` antigo, que respondia 200 sem ter apagado nada.
  const res = await DELETE(doDono("DELETE", `/api/orders?id=${PEDIDO}`));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Pedido não encontrado." });
  const [apagar] = feitas("DELETE", "/rest/v1/orders");
  assert.equal(apagar.url.searchParams.get("tenant_id"), "eq.loja-b");

  const lixo = await DELETE(doDono("DELETE", "/api/orders?id=abc"));
  assert.equal(lixo.status, 404);
  assert.equal(feitas("DELETE", "/rest/v1/orders").length, 1);
});

test("DELETE do pedido da loja responde 200", async () => {
  responder = banco({ "DELETE /rest/v1/orders": () => ({ status: 200, corpo: [{ id: PEDIDO }] }) });

  const res = await DELETE(doDono("DELETE", `/api/orders?id=${PEDIDO}`));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});
```

- [ ] **Step 2: rodar e ver falhar.**

```bash
cd "<WT>/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/orders/route.test.ts
```

Esperado (conferido contra o estado do fim da Task 1): **`pass 3`, `fail 4`**.
  - `POST recusa lead que não é da loja…` → `actual: 201, expected: 400` (o pedido foi gravado com o lead de outra loja).
  - `POST com leadId que não é uuid…` → `actual: 201, expected: 400`.
  - `POST com o banco fora na busca do lead…` → `actual: 201, expected: 500` (o erro foi engolido pelo try da atribuição).
  - `DELETE de pedido que não é da loja…` → `actual: 200, expected: 404`.

  Já passam, e ficam como guarda: `POST grava na loja da rota…` e `DELETE sem sessão é 401…` (a Task 1 trouxe o tenant da rota) e `DELETE do pedido da loja responde 200`. Se o `DELETE sem sessão` falhar com 500, a Task 1 não pôs o `getRouteTenantContext` no `DELETE`.

- [ ] **Step 3: implementação em `apps/web/src/app/api/orders/route.ts`.**

  (a) Depois de `export const dynamic = "force-dynamic";` (linha 10), mesma regex de `api/pages/[id]/route.ts:21`:

```ts

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

  (b) No `POST`, trocar o bloco que hoje é (linhas 47-60 do original)

```ts
    const leadId = b.leadId ? String(b.leadId) : undefined;

    // Atribuição de campanha: infere do lead — grupo de origem → campanha que o contém.
    // Best-effort — falha aqui não deve derrubar o registro do pedido.
    let campaignId: string | undefined;
    if (leadId) {
      try {
        const lead = await getLeadAttribution(tenantId, leadId);
        if (lead) campaignId = resolveCampaignId(lead, await listCampaignGroups(tenantId)) ?? undefined;
      } catch (e) {
        // sem atribuição → cai em "sem origem"
        console.error(`[orders] atribuição de campanha falhou para ${tenantId}:`, (e as Error).message);
      }
    }
```

  por

```ts
    const leadId = b.leadId ? String(b.leadId) : undefined;

    let campaignId: string | undefined;
    if (leadId) {
      // O lead tem que ser desta loja: sem a conferência o pedido gravava o
      // lead_id de outra. Id que não é uuid também não existe (o Postgres
      // responderia 22P02 e a rota, 500). Erro do banco aqui não é engolido:
      // sem saber de quem é o lead, o pedido não é gravado.
      const lead = UUID_RE.test(leadId) ? await getLeadAttribution(tenantId, leadId) : null;
      if (!lead) return Response.json({ error: "Contato não encontrado." }, { status: 400 });

      // Atribuição de campanha: grupo de origem → campanha que o contém.
      // Best-effort — falha aqui não deve derrubar o registro do pedido.
      try {
        campaignId = resolveCampaignId(lead, await listCampaignGroups(tenantId)) ?? undefined;
      } catch (e) {
        // sem atribuição → cai em "sem origem"
        console.error(`[orders] atribuição de campanha falhou para ${tenantId}:`, (e as Error).message);
      }
    }
```

  O `return` dentro do `try` externo é de propósito: o `catch` externo só transforma exceção em 500, e o `getLeadAttribution` que lança cai nele.

  (c) No `DELETE` (como ficou na Task 1), trocar

```ts
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  try {
    const ok = await removeOrder(tenantId, id);
    return Response.json({ ok });
  } catch (e) {
```

  por

```ts
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  // Id que não é uuid não existe; sem isto o Postgres responde 22P02 e a rota daria 500.
  if (!UUID_RE.test(id)) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  try {
    if (!(await removeOrder(tenantId, id))) {
      return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
```

  O `DELETE` final, para conferência:

```ts
export async function DELETE(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  // Id que não é uuid não existe; sem isto o Postgres responde 22P02 e a rota daria 500.
  if (!UUID_RE.test(id)) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  try {
    if (!(await removeOrder(tenantId, id))) {
      return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: rodar e ver passar (os dois arquivos).**

```bash
cd "<WT>/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/orders/route.test.ts src/lib/stores/orders.test.ts
```

Esperado: `tests 11`, `pass 11`, `fail 0`.

- [ ] **Step 5: tipos e lint.**

```bash
cd "<WT>/apps/web" && npx tsc --noEmit -p tsconfig.json
```
```bash
cd "<WT>/apps/web" && npx eslint src/app/api/orders/route.ts src/app/api/orders/route.test.ts src/lib/stores/orders.ts src/lib/stores/orders.test.ts
```

Esperado: limpos.

- [ ] **Step 6: commit.**

```bash
git -C "<WT>" add apps/web/src/app/api/orders/route.ts apps/web/src/app/api/orders/route.test.ts
```
```bash
git -C "<WT>" diff --cached --stat
```

Esperado: exatamente esses 2 arquivos.

```bash
git -C "<WT>" commit -m "fix(orders): reject a lead from another store, 404 when nothing was deleted" -m "POST /api/orders already looked the lead up with getLeadAttribution(tenantId, leadId) but only skipped the campaign attribution when it was null, so an order could carry another store's lead_id. A lead that is not in the store, or an id that is not a uuid, is now 400 \"Contato não encontrado.\", and a failed lookup is a 500 that writes nothing instead of being swallowed. DELETE answers 404 \"Pedido não encontrado.\" when no row was deleted and { ok: true } otherwise." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: sai `getSessionTenantId`

**Files:** `apps/web/src/lib/session.ts`.

**Interfaces:** Consumes: nada. Produces: `lib/session.ts` só com `getSessionAccountId()` (que segue com 5 chamadores: `api/agents/copy`, `api/campanhas/[slug]/messages`, `api/dispatch`, `api/subscription`, `api/testimonials` — o `orders.ts` deixou de usar na Task 1).

- [ ] **Step 1: confirmar que não tem chamador.**

```bash
grep -rn "getSessionTenantId" "<WT>/apps" "<WT>/hubflow-engine" "<WT>/packages" --include=*.ts --include=*.tsx --include=*.mjs --include=*.js
```

Esperado (07/10): só `apps/web/src/lib/session.ts:13` (a definição). **Se aparecer qualquer chamador, NÃO remover**: pular para o Step 4 sem mexer no arquivo e registrar no corpo do PR quem chama.

- [ ] **Step 2: remover.** Sai a função (linhas 13-28) e o import de `getSupabaseAdmin` (linha 4), que só ela usava. O arquivo fica:

```ts
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Le o authUserId do cookie legado dentro de route handlers Node.
// Rotas novas devem preferir Supabase Auth + tenant_id explicito.
export async function getSessionAccountId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
```

- [ ] **Step 3: tipos e lint** (código morto: o `tsc` é a prova de que ninguém chamava).

```bash
cd "<WT>/apps/web" && npx tsc --noEmit -p tsconfig.json
```
```bash
cd "<WT>/apps/web" && npx eslint src/lib/session.ts
```

Esperado: limpos.

- [ ] **Step 4: commit.**

```bash
git -C "<WT>" add apps/web/src/lib/session.ts
```
```bash
git -C "<WT>" diff --cached --stat
```

Esperado: só `apps/web/src/lib/session.ts`.

```bash
git -C "<WT>" commit -m "refactor(session): drop unused getSessionTenantId" -m "It had no caller and read memberships on its own, outside the two tenant resolvers that the seller module guard will live in (PR 3)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: verificação final, PR e quadro

**Files:** nenhum arquivo novo do repositório.

**Interfaces:** Consumes: Tasks 1-3. Produces: PR aberto de `fix/orders-tenant-da-rota` para `main`.

- [ ] **Step 0: o PR 3 já entrou em `main`?** Ele cria `apps/web/src/lib/auth/memberships-allowlist.test.ts`
  com duas entradas que este PR torna mortas — e o teste falha com entrada morta. Atualizar a branch e
  conferir:

```bash
git -C "<WT>" fetch origin main
```
```bash
git -C "<WT>" merge origin/main
```
```bash
grep -n "sai no PR 1" "<WT>/apps/web/src/lib/auth/memberships-allowlist.test.ts"
```

  Sem o arquivo ou sem resultado: nada a fazer. Com resultado: apagar exatamente estas duas linhas do
  array da allowlist —

```ts
  { caminho: "lib/stores/orders.ts", motivo: "sai no PR 1 (getTenantId local)" },
  { caminho: "lib/session.ts", motivo: "sai no PR 1 (getSessionTenantId sem chamador)" },
```

  — rodar `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/memberships-allowlist.test.ts`
  (em `apps/web`) → PASS, e commitar:

```bash
git -C "<WT>" add apps/web/src/lib/auth/memberships-allowlist.test.ts
```
```bash
git -C "<WT>" diff --cached --stat
```
```bash
git -C "<WT>" commit -m "test(auth): drop allowlist entries retired by this PR" -m "orders.ts and session.ts no longer read memberships." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 1: a suíte inteira.**

```bash
cd "<WT>/apps/web" && npx tsc --noEmit -p tsconfig.json
```
```bash
cd "<WT>/apps/web" && npx tsc --noEmit -p tsconfig.e2e.json
```
```bash
cd "<WT>/apps/web" && npm run lint
```
```bash
cd "<WT>/apps/web" && npm test
```

Esperado: tudo limpo; `npm test` com `fail 0` (os 11 testes novos dentro).

- [ ] **Step 2: o gate real** (PowerShell; `pwsh` não existe nesta máquina, chamar o script direto; **sem** `2>&1` nem `*>`, que no PS 5.1 transformam aviso de stderr em falha falsa):

```powershell
Set-Location "<WT>"; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Esperado: `EXIT=0` (scan de secrets, testes, os dois tsc, build web). As strings dos testes (`chave-do-postgrest-falso`, `token-falso`) não casam com nenhum padrão de `infra/scripts/scan-secrets.ps1`.

- [ ] **Step 3: o que vai no PR.**

```bash
git -C "<WT>" fetch origin main
```
```bash
git -C "<WT>" log fix/orders-tenant-da-rota..origin/main --oneline
```

Se não vier vazio, `git -C "<WT>" merge origin/main` e repetir os Steps 1-2.

```bash
git -C "<WT>" log origin/main..fix/orders-tenant-da-rota --oneline
```
```bash
git -C "<WT>" diff origin/main...fix/orders-tenant-da-rota --stat
```

Esperado: 3 commits (`fix(orders): store takes…`, `fix(orders): reject a lead…`, `refactor(session): drop…`) e exatamente os 5 arquivos da File Structure.

- [ ] **Step 4: corpo do PR.** Escrever em `C:\Users\Igor\AppData\Local\Temp\pr1-orders-tenant-body.md` (fora do repo, para não entrar em commit):

```markdown
## O que muda

- `addOrder`/`removeOrder` recebem o `tenantId` da rota. O `getTenantId()` local, que lia a primeira membership da sessão, sai: quem pertence a duas lojas gravava o pedido na primeira e ignorava o `x-tenant-id` (o mesmo bug já corrigido no `listOrdersByTenant`).
- `DELETE /api/orders` passa por `getRouteTenantContext` (sem sessão → 401) e responde 404 `{ error: "Pedido não encontrado." }` quando nada foi apagado; `removeOrder` só devolve `true` se o banco devolveu a linha apagada.
- `POST /api/orders` recusa `leadId` que não é da loja (ou não é uuid) com 400 `{ error: "Contato não encontrado." }` — antes gravava o `lead_id` de outra loja. Falha do banco ao buscar o lead vira 500 sem gravar (antes era engolida).
- `getSessionTenantId` (sem chamador, lia `memberships` sem guard) sai de `lib/session.ts`.

PR 1 de 6 do acesso da vendedora — spec `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` §5, plano `docs/superpowers/plans/2026-10-07-acesso-vendedora-pr1-pedido-no-tenant-certo.md`. Nenhuma tela muda: Registrar pedido em Contatos já mostra o `error` da rota, e nenhum cliente chama o `DELETE`.

## Test plan

- [x] `src/lib/stores/orders.test.ts` (PostgREST falso): insert na loja passada; delete com `tenant_id` + `select=id`; 0 linhas → `false`; erro do banco rejeita
- [x] `src/app/api/orders/route.test.ts` (Supabase falso com Bearer): lead de outra loja → 400 sem insert; `leadId` não-uuid → 400 sem ir ao banco; banco fora → 500 sem insert; pedido gravado na loja do `x-tenant-id` com a campanha atribuída; `DELETE` sem sessão → 401; pedido de outra loja → 404; pedido da loja → 200
- [x] os dois `tsc`, `npm run lint`, `npm test`, `infra/scripts/verify-local.ps1`
- [ ] Em produção, logado na loja de QA: `DELETE /api/orders?id=<uuid inexistente>` → 404; `POST /api/orders` com `leadId` inexistente → 400 "Contato não encontrado."

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 5: entregar os comandos ao Igor** (push, merge e DML em prod passam por ele). Encerrar a sessão com o bloco abaixo, trocando `<WT>` pelo caminho absoluto e `<N>` pelo número que o `gh pr create` devolver.

#### Comandos para o Igor

Um comando por bloco (PowerShell 5.1, sem `&&`). Todo `git` leva `-C` com o worktree e o nome da branch — o terminal do Igor roda no checkout principal, e `HEAD` lá é de outra sessão.

```bash
git -C "<WT>" push -u origin fix/orders-tenant-da-rota
```

```bash
gh pr create --repo codingB0y/Girumo --base main --head fix/orders-tenant-da-rota --title "fix(orders): tenant from the route, authenticated DELETE, lead checked against the store" --body-file "C:\Users\Igor\AppData\Local\Temp\pr1-orders-tenant-body.md"
```

```bash
gh pr checks <N> --repo codingB0y/Girumo
```

```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

(`--repo` no merge evita o `git checkout main` local que o `--delete-branch` tenta e que erra quando a `main` está presa noutro worktree.)

**Prova no ar** (depois do deploy, sem sujar o caixa — nenhuma das duas grava nada). No painel de produção, logado na loja de QA, console do navegador:

```js
await fetch("/api/orders?id=00000000-0000-4000-8000-000000000000", { method: "DELETE" }).then((r) => r.status) // 404
```
```js
await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "1", leadId: "00000000-0000-4000-8000-000000000000" }) }).then(async (r) => [r.status, await r.json()]) // [400, { error: "Contato não encontrado." }]
```

**Quadro** (prod `nidoatbxaylrkcgbszns`, depois do merge). O card fica em `em_construcao`: a feature só vai ao ar com os PRs 2-6.

```sql
select public.move_card('acesso-vendedora', 'em_construcao',
  'PR 1 mergeado: pedido gravado no tenant da rota, DELETE autenticado com 404, leadId conferido na loja, getSessionTenantId removido. Faltam os PRs 2-6.',
  'PR #<N>');
update public.board_features
   set blocker = null,
       updated_at = now()
 where key = 'acesso-vendedora';
```

**Grafo** (opcional, PowerShell na raiz do repo):

```powershell
rag insert "decisão: POST /api/orders é fail-closed na conferência do lead — lead fora da loja ou id não-uuid = 400 'Contato não encontrado.'; erro do banco na busca = 500 sem gravar. addOrder/removeOrder recebem o tenant da rota (PR 1 do acesso da vendedora)." --source decisao-2026-10-07
```

Ao encerrar: **"PRs que deixei abertos: #<N> (aguardando push/CI/merge pelo Igor)"** — ou "nenhum", se o Igor já mergeou na sessão.
