# Acesso da vendedora — PR 6 (equipe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono convida alguém escolhendo a **Função** (Administração, Atendimento, Vendedora — os mesmos nomes que a lista da equipe já usa); para a vendedora marca o que ela alcança (Registrar vendas sempre ligado, Postar nos grupos opcional) e depois troca isso pelo **Editar acesso** da ficha, sem refazer o convite. É o PR que liga o acesso da vendedora para os lojistas: até ele, ninguém consegue convidar uma.

**Architecture:** `parseInviteRole` (`lib/permissions.ts`, criado pelo PR 3) passa a aceitar `"seller"`; `api/members` ganha forma do corpo checada por zod no `POST` (chaves conhecidas, `modules` só com `seller`) sem duplicar a regra do papel, a coluna `modules` no `GET` e um `PATCH` novo que só mexe em membership `seller` da loja do contexto e registra `membership.modules_changed` em `public.logs` — o mesmo `insert` que o `DELETE` usa para `membership.removed`. A aba Equipe vira três peças: `ConviteDaEquipe` (o formulário), `FichaDoMembro` (a linha, com chips e Editar acesso) e `CamposDoAcesso` (o fieldset dos módulos, usado pelos dois). A lógica pura (corpo do convite, rótulos, chips, validação de e-mail) mora em `lib/painel/configuracoes.ts`; o estado continua na página.

**Tech Stack:** Next.js 15, React 19, Tailwind v4 (design system do painel `pn-*`), zod v4, supabase-js 2.108, `node --test` via tsx, Playwright (job `e2e` do CI).

**Spec:** `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` (§3 "Equipe — `api/members`", §4 "Configurações › Equipe") · índice/contrato `docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md` (consome "PR 2 → PR 3, 4, 6" e "PR 3 → PR 4, 5, 6"; implementa "PR 3 → PR 6") · mockup https://claude.ai/artifact/UdVL13GDUZU9ggZo4pjGsC (tela "Configurações › Equipe").

## Global Constraints

- **Base:** `origin/main` com o PR 3 (`feat/vendedora-guard`) mergeado e o PR 2 aplicado em dev **e** prod. Nunca abrir em cima de `feat/vendas-tela` nem de outra branch de feature.
- **Ordem de merge: este PR entra DEPOIS do PR 5** (`feat/vendas-tela`). Desenvolver em paralelo com o 5 é ok (arquivos disjuntos); mergear antes dele deixaria o dono convidar uma vendedora que cai num painel sem a tela de Vendas (spec §8: "Até o 6 entrar ninguém consegue convidar vendedora").
- **Contrato do PR 3, sem renomear:** de `@/lib/auth/modulos` — `MODULOS_OPCIONAIS`, `ModuloOpcional`, `Modulo`, `parseModulos`, `modulosDoAcesso`; de `@/lib/permissions` — `TenantRole` (com `"seller"`) e `parseInviteRole(raw: unknown)` (PR 3: `"admin" | "operator"`; **este PR acrescenta `"seller"`** — é ali que o papel convidável é decidido, nada de reintroduzir `normalizeRole`/`INVITABLE_ROLES` na rota). Corpos: `POST { email, role: "admin" | "operator" | "seller", modules?: ModuloOpcional[] }`, `PATCH { id, modules } → 200 { id, modules }`, `GET` com `modules` por membro.
- **Estado de partida de `api/members/route.ts`:** o que a Task 4 do plano do PR 3 (`2026-10-07-acesso-vendedora-pr3-guard-de-modulo.md`) deixa — `normalizeEmail` mantido, `parseInviteRole` importado de `@/lib/permissions` com `type TenantRole`, `400 "E-mail invalido."` e depois `400 "Função inválida."` (papel desconhecido **ou ausente**). As edições da Task 1 são escritas contra esse texto.
- **Sem leitura do Supabase pelo cliente:** desde o PR 2 a vendedora não tem nenhum acesso `authenticated` ao banco (os helpers do RLS excluem `seller`). Nada da Equipe lê tabela pelo cliente — tudo passa por `/api/members` (service-role + `getTenantContext`), e a tela é do dono/admin.
- **Isolamento:** toda query em `memberships` leva `.eq("tenant_id", ctx.tenantId)` — o cliente é service-role e ignora RLS. Isso vale para a leitura **e** para a escrita do `PATCH`.
- **Log:** o mecanismo é a tabela `public.logs` (colunas `tenant_id, actor_user_id, level, event, message, metadata`), escrita por `supabase.from("logs").insert({ ... event: "..." })` — `route.ts:229-236` na main de 07/10 (`0287eba0`). O evento novo é `membership.modules_changed`.
- **Fora deste PR (de propósito):** o contador "N de M vagas do plano" da spec §4 (M depende do teto do plano + extras; o limite já chega como 402 do `assertPlanLimit`), o "Reenviar" e o "Remover da equipe" do mockup (não existe rota de reenvio; a lixeira da ficha já remove/revoga). Trocar o papel de um membro existente é "Fora da v1" na spec.
- **Sem banco:** nenhum DDL/DML de schema aqui — `modules`, a constraint `memberships_modules_validos` e o `seller` no enum são do PR 2.
- **Não mexer:** `api/members/accept/route.ts` (o `update` dele só grava `user_id`/`accepted_at`; `modules` segue na linha do convite) e `lib/auth/member-removal.ts` (`canRemoveMember` trata `seller` como qualquer não-dono; o PR 3 já trocou o `TenantRole` de lá).
- Código, identificadores e commits em inglês; texto de tela e de erro em pt-BR. Commits com prefixo semântico terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Acessibilidade: `fieldset`/`legend` nos dois grupos, radios e checkboxes reais dentro de `<label>`, nome curto por `aria-labelledby` e descrição por `aria-describedby`, `aria-expanded`/`aria-controls` no Editar acesso, alvos ≥ 44 px (`h-11`/`min-h-11`), erro com `role="alert"`, inputs com `text-[16px]`.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json` (lint e tsx não checam tipo); lint `npm run lint`; suíte `npm test`; vitrine `npm run painel:check`. Antes do push: `infra/scripts/verify-local.ps1` (é o gate real; o `verify` do CI é pulado na `main`).
- Nunca `git add -A`. `git diff --cached --stat` numa chamada separada antes de cada commit. Quem commita é o controller, por task, depois da wave.
- Componentes TSX não têm teste unitário (o repo não renderiza React no `node --test`): a prova deles é tsc + lint + `painel:check` + o E2E da Task 6.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/permissions.ts` | modificar | `parseInviteRole` aceita `"seller"` |
| `apps/web/src/lib/permissions.test.ts` | modificar | o teste do PR 3 que recusava `seller` passa a aceitá-lo |
| `apps/web/src/app/api/members/route.ts` | modificar | `POST` com forma do corpo (zod) + `modules`; `GET` com `modules`; `PATCH` novo |
| `apps/web/src/app/api/members/members.test.ts` | criar | a rota real contra um Supabase falso em memória (padrão "PostgREST falso" do #338/#340) |
| `apps/web/src/lib/painel/configuracoes.ts` | modificar | rótulo "Vendedora", funções do convite, rótulos/descrições dos módulos, chips, `montarConvite` |
| `apps/web/src/lib/painel/configuracoes.test.ts` | modificar | testes da lógica pura nova |
| `apps/web/src/components/painel/configuracoes/vitrine/campos-do-acesso.tsx` | criar | fieldset "O que ela pode acessar" (convite e Editar acesso) |
| `apps/web/src/components/painel/configuracoes/vitrine/ficha-do-membro.tsx` | criar | a linha de cada pessoa: papel, chips, Editar acesso, lixeira; `MembroNaTela` |
| `apps/web/src/components/painel/configuracoes/vitrine/convite-da-equipe.tsx` | criar | o formulário "Convidar pessoa" com Função e módulos |
| `apps/web/src/components/painel/configuracoes/vitrine/aba-equipe.tsx` | modificar | vira a casca: estados da lista + ficha + formulário |
| `apps/web/src/app/painel/configuracoes/page.tsx` | modificar | estado da função e dos módulos; `POST` com `montarConvite`; `saveMemberModules` (PATCH) |
| `apps/web/e2e/equipe-convite.spec.ts` | modificar | rótulos novos no teste que existe + teste novo da vendedora |

12 arquivos — dois a mais que o teto de ~10 só pela linha do `parseInviteRole` e o teste dele, que não fazem sentido num PR separado (sem eles o convite de vendedora dá 400). `configuracoes-vitrine.tsx` não muda: ele repassa `equipe` inteiro com `{...equipe}`.

---

### Task 0: worktree, base e card

**Files:** nenhum arquivo do repo.
**Depends-on:** none.
**Interfaces:** consome o que o PR 3 deixou em `main` (conferido aqui antes de escrever código).

> **Ordem de merge: este PR entra DEPOIS do PR 5** (`feat/vendas-tela`). Ele é o interruptor que deixa o dono convidar vendedora; mergeado antes, a convidada cairia num painel sem a tela de Vendas. Pode ser **desenvolvido** em paralelo com o 5 (arquivos disjuntos); o merge espera — a Task 7 confere antes do `gh pr merge`.

- [ ] **Step 1: worktree da sessão.** Se a sessão ainda está no checkout principal, `EnterWorktree` (nome `equipe-vendedora`). Dentro do worktree (troque `<WORKTREE>` pelo caminho absoluto dele em todos os comandos deste plano):

```powershell
git -C "<WORKTREE>" fetch origin main
git -C "<WORKTREE>" switch -c feat/equipe-vendedora origin/main
git -C "<WORKTREE>" rev-list --count HEAD..origin/main
```

O último tem que dar `0`.

- [ ] **Step 2: o PR 3 está mesmo em `main`.** Os quatro abaixo têm que achar alguma coisa; se algum vier vazio, **parar** — o plano não roda em cima de branch:

```powershell
git -C "<WORKTREE>" log origin/main --oneline -1 -- apps/web/src/lib/auth/modulos.ts
Select-String -Path "<WORKTREE>\apps\web\src\lib\permissions.ts" -Pattern 'export function parseInviteRole|const INVITABLE_ROLES'
Select-String -Path "<WORKTREE>\apps\web\src\lib\auth\modulos.ts" -Pattern 'export function parseModulos|export function modulosDoAcesso|export const MODULOS_OPCIONAIS'
Select-String -Path "<WORKTREE>\apps\web\src\app\api\members\route.ts" -Pattern 'parseInviteRole\(body\.role\)|Função inválida'
```

- [ ] **Step 3: o texto de partida bate com o que a Task 1 edita.** As edições da Task 1 são hunks contra o que as Tasks 1 e 4 do plano do PR 3 deixam em `permissions.ts`, `permissions.test.ts` e `api/members/route.ts`. Conferir que cada "antes" da Task 1 está lá, literal:

```powershell
Select-String -Path "<WORKTREE>\apps\web\src\lib\permissions.ts" -SimpleMatch -Pattern 'const INVITABLE_ROLES: readonly TenantRole[] = ["admin", "operator"];'
Select-String -Path "<WORKTREE>\apps\web\src\lib\permissions.test.ts" -SimpleMatch -Pattern 'for (const lixo of ["owner", "seller", "", "gerente", null, undefined, 1, ["admin"]]) {'
Select-String -Path "<WORKTREE>\apps\web\src\app\api\members\route.ts" -SimpleMatch -Pattern 'const role = parseInviteRole(body.role);'
Select-String -Path "<WORKTREE>\apps\web\src\app\api\members\route.ts" -SimpleMatch -Pattern 'import { parseInviteRole, type TenantRole } from "@/lib/permissions";'
```

Se algum não achar (o PR 3 mergeou com texto diferente do plano dele), ler `git -C "<WORKTREE>" diff 0287eba0 origin/main -- apps/web/src/lib/permissions.ts apps/web/src/app/api/members/route.ts` e reescrever o "antes" do hunk afetado com o texto real — o "depois" não muda.

- [ ] **Step 4: ninguém mais mexendo nos mesmos arquivos.** `gh pr list --repo codingB0y/Girumo --state open` — se algum PR aberto toca `api/members`, `configuracoes/vitrine/` ou `lib/painel/configuracoes.ts`, falar com o Igor antes de seguir (sessões paralelas já colidiram em PR).

- [ ] **Step 5: `node_modules`.** Em 07/10 o `node_modules` do checkout principal estava vazio, então junction não serve:

```powershell
(Get-ChildItem "C:\Users\Igor\Desktop\HubFlow-platform\node_modules" -ErrorAction SilentlyContinue | Measure-Object).Count
```

Se der mais que 0: duas junctions (caminhos absolutos; `next` mora em `apps/web/node_modules`):

```powershell
cmd /c mklink /J "<WORKTREE>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
cmd /c mklink /J "<WORKTREE>\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules"
```

Se der 0: `Get-PSDrive C` (precisa de alguns GB livres) e `npm ci` na raiz do worktree.

- [ ] **Step 6: o banco de dev tem o que o PR 2 criou** (leitura em dev passa no classificador). Gravar em `<scratchpad>\pr6-dev-check.sql`:

```sql
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'memberships' and column_name = 'modules') as tem_modules,
  (select 'seller' = any (enum_range(null::public.member_role)::text[])) as tem_seller;
```

e rodar de `<WORKTREE>\apps\web`:

```powershell
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
supabase db query --linked -f "<scratchpad>\pr6-dev-check.sql"
```

Esperado `tem_modules = 1`, `tem_seller = true`. Diferente disso: parar — o E2E da Task 6 roda no banco de dev e cairia por falta de coluna.

- [ ] **Step 7: card (DML em prod — o Igor roda).** Entregar ao Igor, para o SQL Editor de prod (`nidoatbxaylrkcgbszns`):

```sql
select public.move_card('acesso-vendedora', 'em_construcao', 'PR 6 começou: convite com função e módulos, PATCH /api/members, aba Equipe', 'feat/equipe-vendedora');
```

---

### Task 1: `POST` com função e módulos, `GET` com `modules` (TDD)

**Files:** `apps/web/src/lib/permissions.ts`, `apps/web/src/lib/permissions.test.ts`, `apps/web/src/app/api/members/members.test.ts` (criar), `apps/web/src/app/api/members/route.ts`
**Depends-on:** 0.
**Interfaces:**
- produz `parseInviteRole("seller") === "seller"` (assinatura do PR 3 intacta).
- produz `POST /api/members` body `{ email, role: "admin" | "operator" | "seller", modules?: ModuloOpcional[] }` → `201` linha com `modules` · `400 { error }` ("E-mail invalido." e "Função inválida." como o PR 3 deixou; novos: "Módulo desconhecido." · "Só a vendedora tem módulos." · "Pedido inválido.") · `402`/`409` como hoje. O papel é decidido **só** por `parseInviteRole`; o zod checa a forma do resto (chaves conhecidas, tipos, `modules`).
- produz `GET /api/members` → `Array<{ id, user_id, role, modules, invited_email, accepted_at, created_at }>`.
- consome `MODULOS_OPCIONAIS`, `parseModulos` (`@/lib/auth/modulos`), `parseInviteRole`/`TenantRole` (`@/lib/permissions`), `getTenantContext`/`assertBillingRole` (`@/lib/supabase/tenant-context`).

- [ ] **Step 0a (teste): `parseInviteRole` aceita a vendedora.** Em `apps/web/src/lib/permissions.test.ts` (criado pelo PR 3), o hunk:

antes:

```ts
test("convite recusa owner, seller (o PR 6 libera), vazio e lixo — nada vira operator calado", () => {
  for (const lixo of ["owner", "seller", "", "gerente", null, undefined, 1, ["admin"]]) {
```

depois:

```ts
test("convite aceita a vendedora, sem ligar pra caixa e espaço", () => {
  assert.equal(parseInviteRole("seller"), "seller");
  assert.equal(parseInviteRole(" Seller "), "seller");
});

test("convite recusa owner, vazio e lixo — nada vira operator calado", () => {
  for (const lixo of ["owner", "", "gerente", null, undefined, 1, ["admin"]]) {
```

- [ ] **Step 0b:** de `apps/web`, `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/permissions.test.ts` → **FAIL** em "convite aceita a vendedora" (`null !== "seller"`).
- [ ] **Step 0c:** em `apps/web/src/lib/permissions.ts`, o hunk:

antes:

```ts
/** Papéis que entram por convite (POST /api/members). Dono nasce no cadastro, nunca por convite. */
const INVITABLE_ROLES: readonly TenantRole[] = ["admin", "operator"];

/**
 * Papel pedido no convite, ou `null` — a rota responde 400 "Função inválida.".
 *
 * Antes, papel desconhecido virava `operator` em silêncio: uma tela mandando
 * "seller" antes do backend aceitá-lo criaria um operador, com MAIS acesso que a
 * vendedora. O PR 6 da série acrescenta "seller" à lista.
 */
```

depois:

```ts
/** Papéis que entram por convite (POST /api/members). Dono nasce no cadastro, nunca por convite. */
const INVITABLE_ROLES: readonly TenantRole[] = ["admin", "operator", "seller"];

/**
 * Papel pedido no convite, ou `null` — a rota responde 400 "Função inválida.".
 *
 * Antes, papel desconhecido virava `operator` em silêncio: uma tela mandando
 * "seller" antes do backend aceitá-lo criaria um operador, com MAIS acesso que a
 * vendedora. Desde o PR 6 do acesso da vendedora, "seller" é convidável.
 */
```

  A assinatura de `parseInviteRole` fica como o PR 3 deixou.
- [ ] **Step 0d:** mesmo comando do 0b → **PASS**.

O teste chama a rota de verdade: `getTenantContext` (Bearer → `GET /auth/v1/user`), `assertPlanLimit`, supabase-js e zod, contra um servidor HTTP em `127.0.0.1` que guarda as linhas em memória e aplica os filtros `eq.` da URL. É isso que prova o `.eq("tenant_id")`: sem ele, a linha da outra loja casaria. Duas peças fora do comum, conferidas no `next@15.5` em 07/10:

- o `after()` do `POST` lança `` `after` was called outside a request scope `` fora do Next. O teste liga `globalThis.AsyncLocalStorage` **antes** de carregar a rota (o Next lê esse global uma vez, ao ser carregado — por isso a rota entra por `await import` no `before`) e roda cada chamada dentro de `workAsyncStorage.run(escopoFalso, ...)`, cujo `afterContext.after` só guarda a tarefa: o e-mail do convite não sai em teste;
- o pacote é CJS (sem `"type": "module"`), então nada de `await` no topo do arquivo.

- [ ] **Step 1: criar `members.test.ts` com o falso e os testes de `POST`/`GET`:**

```ts
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

/**
 * A rota de verdade — getTenantContext, zod, supabase-js — contra um Supabase
 * falso em 127.0.0.1: só a rede é trocada (padrão de `lib/stores/*.test.ts`,
 * #338/#340). O falso guarda as linhas em memória e aplica os filtros `eq.` que
 * chegam na URL. É isso que prova o `.eq("tenant_id")`: sem ele, a vendedora da
 * outra loja casaria e o teste do 404 cairia.
 */

// O Next liga o AsyncLocalStorage global no boot do servidor, e o `after()` da
// rota só existe dentro dele. Ligado ANTES de carregar a rota (import dinâmico
// no `before`), porque o Next lê esse global uma vez, quando é carregado.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

type Linha = Record<string, unknown>;
type Pedido = { metodo: string; tabela: string; url: URL; corpo: unknown };
type Rota = typeof import("./route");

const LOJA = "11111111-1111-4111-8111-111111111111";
const OUTRA_LOJA = "22222222-2222-4222-8222-222222222222";
const DONO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M_DONO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const M_VENDEDORA = "33333333-3333-4333-8333-333333333333";
const M_ADMIN = "44444444-4444-4444-8444-444444444444";
const M_VENDEDORA_DE_OUTRA = "55555555-5555-4555-8555-555555555555";

let banco: Record<string, Linha[]> = {};
const pedidos: Pedido[] = [];
const tarefasDepois: unknown[] = [];
let rota: Rota;
let chamar: (handler: () => Promise<Response>) => Promise<Response>;

/** Só `eq.` filtra neste falso; select, order, limit e `not.is.null` passam direto. */
function casa(linha: Linha, url: URL): boolean {
  for (const [coluna, valor] of url.searchParams) {
    if (valor.startsWith("eq.") && String(linha[coluna]) !== valor.slice(3)) return false;
  }
  return true;
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((pronto) => {
    let bruto = "";
    req.on("data", (pedaco) => {
      bruto += pedaco;
    });
    req.on("end", () => pronto(bruto ? JSON.parse(bruto) : undefined));
  });
}

const supabase = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  const metodo = req.method ?? "GET";
  const corpo = await lerCorpo(req);
  res.setHeader("Content-Type", "application/json");

  // `getTenantContext` com Bearer pergunta ao Auth de quem é o token.
  if (url.pathname === "/auth/v1/user") {
    res.end(
      JSON.stringify({
        id: DONO,
        email: "dono@loja.test",
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    );
    return;
  }

  const tabela = url.pathname.replace("/rest/v1/", "");
  pedidos.push({ metodo, tabela, url, corpo });
  const linhas = banco[tabela] ?? [];

  if (metodo === "GET") {
    res.end(JSON.stringify(linhas.filter((l) => casa(l, url))));
    return;
  }
  if (metodo === "PATCH") {
    const mudadas = linhas.filter((l) => casa(l, url)).map((l) => ({ ...l, ...(corpo as Linha) }));
    banco = { ...banco, [tabela]: linhas.map((l) => mudadas.find((m) => m.id === l.id) ?? l) };
    res.end(JSON.stringify(mudadas));
    return;
  }
  if (metodo === "POST") {
    const nova: Linha = { id: randomUUID(), created_at: "2026-10-07T12:00:00.000Z", ...(corpo as Linha) };
    banco = { ...banco, [tabela]: [...linhas, nova] };
    res.statusCode = 201;
    // `.insert().select().single()` pede objeto; o insert do log não pede nada de volta.
    const devolve = String(req.headers.prefer ?? "").includes("return=representation");
    const objeto = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    res.end(devolve ? JSON.stringify(objeto ? nova : [nova]) : "");
    return;
  }
  res.statusCode = 405;
  res.end("{}");
});

function membro(id: string, tenantId: string, role: string, extra: Linha = {}): Linha {
  return {
    id,
    tenant_id: tenantId,
    user_id: null,
    role,
    modules: [],
    invited_email: `${role}@loja.test`,
    accepted_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

/** Uma loja com dono, vendedora e admin; outra loja com a vendedora dela. */
function bancoInicial(papelDoDono: string): Record<string, Linha[]> {
  return {
    memberships: [
      membro(M_DONO, LOJA, papelDoDono, {
        user_id: DONO,
        invited_email: null,
        accepted_at: "2026-01-01T00:00:00.000Z",
      }),
      membro(M_VENDEDORA, LOJA, "seller"),
      membro(M_ADMIN, LOJA, "admin"),
      membro(M_VENDEDORA_DE_OUTRA, OUTRA_LOJA, "seller"),
    ],
    // Plano sem teto de equipe: `assertPlanLimit` libera sem contar.
    subscriptions: [{ tenant_id: LOJA, status: "active", metadata: null, current_period_end: null, plans: { limits: {} } }],
    users: [],
    logs: [],
  };
}

function pedido(metodo: string, corpo?: unknown): Request {
  return new Request("http://localhost/api/members", {
    method: metodo,
    headers: { authorization: "Bearer token-do-dono", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

function escritas(metodo: string, tabela: string): Linha[] {
  return pedidos.filter((p) => p.metodo === metodo && p.tabela === tabela).map((p) => p.corpo as Linha);
}

function linhaDe(id: string): Linha | undefined {
  return banco.memberships.find((m) => m.id === id);
}

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-do-falso";
  process.env.SUPABASE_ANON_KEY = "anon-do-falso";
  process.env.AUTH_SECRET ??= "segredo-do-teste";
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  // Escopo falso de requisição: o `after()` da rota só entrega a tarefa aqui —
  // o e-mail do convite não sai em teste.
  const escopo = {
    afterContext: { after: (tarefa: unknown) => void tarefasDepois.push(tarefa) },
  } as unknown as WorkStore;
  chamar = (handler) => workAsyncStorage.run(escopo, handler);
  rota = await import("./route");
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  banco = bancoInicial("owner");
  pedidos.length = 0;
  tarefasDepois.length = 0;
});

/* -------------------------------------------------------------------------- */
/* POST: convite com função e módulos                                          */
/* -------------------------------------------------------------------------- */

test("POST: vendedora com Postar grava papel e módulos na linha do convite", async () => {
  const res = await chamar(() =>
    rota.POST(pedido("POST", { email: " Carla@Loja.test ", role: "seller", modules: ["postar", "postar"] })),
  );
  assert.equal(res.status, 201);
  const corpo = (await res.json()) as Linha;

  const [convite] = escritas("POST", "memberships");
  assert.deepEqual(convite, {
    tenant_id: LOJA,
    user_id: null,
    role: "seller",
    modules: ["postar"],
    invited_by: DONO,
    invited_email: "carla@loja.test",
    accepted_at: null,
  });
  assert.deepEqual(corpo.modules, ["postar"]);

  const [log] = escritas("POST", "logs");
  assert.equal(log.event, "membership.invited");
  assert.deepEqual(log.metadata, { membership_id: corpo.id, role: "seller", modules: ["postar"] });
  assert.equal(tarefasDepois.length, 1, "o e-mail do convite continua saindo depois da resposta");
});

test("POST: vendedora sem extras grava modules vazio (Registrar vendas é implícito)", async () => {
  const res = await chamar(() => rota.POST(pedido("POST", { email: "bia@loja.test", role: "seller" })));
  assert.equal(res.status, 201);
  assert.deepEqual(escritas("POST", "memberships")[0].modules, []);
});

test("POST: módulo em administrador ou operador é 400 e nada é gravado", async () => {
  for (const role of ["admin", "operator"]) {
    const res = await chamar(() =>
      rota.POST(pedido("POST", { email: "ana@loja.test", role, modules: role === "admin" ? ["postar"] : [] })),
    );
    assert.equal(res.status, 400, role);
    assert.deepEqual(await res.json(), { error: "Só a vendedora tem módulos." });
  }
  assert.equal(escritas("POST", "memberships").length, 0);
});

/**
 * O `normalizeRole` antigo (route.ts:19-22 em 0287eba0) transformava qualquer
 * papel desconhecido em `operator`. Com a vendedora na tela, isso daria MAIS
 * acesso a quem devia ter menos.
 */
test("POST: papel desconhecido ou ausente é 400 e nunca vira operador", async () => {
  for (const role of ["owner", "gerente", undefined]) {
    const res = await chamar(() => rota.POST(pedido("POST", { email: "x@loja.test", role })));
    assert.equal(res.status, 400, String(role));
    assert.deepEqual(await res.json(), { error: "Função inválida." });
  }
  assert.equal(escritas("POST", "memberships").length, 0);
});

test("POST: módulo que não existe é 400", async () => {
  const res = await chamar(() =>
    rota.POST(pedido("POST", { email: "x@loja.test", role: "seller", modules: ["grupos"] })),
  );
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Módulo desconhecido." });
  assert.equal(escritas("POST", "memberships").length, 0);
});

/* -------------------------------------------------------------------------- */
/* GET                                                                         */
/* -------------------------------------------------------------------------- */

test("GET devolve os módulos de cada membro, só da loja do contexto", async () => {
  banco = {
    ...banco,
    memberships: banco.memberships.map((m) => (m.id === M_VENDEDORA ? { ...m, modules: ["postar"] } : m)),
  };
  const res = await chamar(() => rota.GET(pedido("GET")));
  assert.equal(res.status, 200);
  const lista = (await res.json()) as Linha[];
  assert.deepEqual(lista.map((m) => m.id).sort(), [M_DONO, M_VENDEDORA, M_ADMIN].sort());
  assert.deepEqual(lista.find((m) => m.id === M_VENDEDORA)?.modules, ["postar"]);
  const leitura = pedidos.find(
    (p) => p.metodo === "GET" && p.tabela === "memberships" && !p.url.searchParams.has("user_id"),
  );
  assert.ok(leitura?.url.searchParams.get("select")?.split(",").includes("modules"), "o select do GET pede modules");
});
```

`linhaDe` e as constantes `M_VENDEDORA_DE_OUTRA`/`OUTRA_LOJA` são usadas pelos testes da Task 2; se o lint acusar "assigned but never used" nesta task, é esperado e some na Task 2 (não commitar entre as duas sem rodar o lint de novo).

- [ ] **Step 2: rodar → FAIL.** De `apps/web`:

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/members/members.test.ts
```

Falha esperada (com o `parseInviteRole` do Step 0 já aceitando `seller`): a vendedora com Postar é criada, mas a linha do convite sai **sem** `modules` (o `deepEqual` do insert cai); "módulo em administrador ou operador" recebe `201` em vez de `400`; o do `GET` acusa "o select do GET pede modules". Se a falha for `Cannot find module`, `` `after` was called outside a request scope `` ou `ECONNREFUSED`, o problema é o falso, não a rota — corrigir antes de seguir.

- [ ] **Step 3: editar `route.ts` em cima do que o PR 3 deixou** (Task 4 do plano do PR 3). Seis hunks; o `DELETE` e o `normalizeEmail` não mudam.

  **Hunk A — imports.** Antes:

```ts
import { after } from "next/server";
import { canRemoveMember } from "@/lib/auth/member-removal";
```

  depois:

```ts
import { after } from "next/server";
import { z } from "zod";
import { canRemoveMember } from "@/lib/auth/member-removal";
import { MODULOS_OPCIONAIS, parseModulos } from "@/lib/auth/modulos";
```

  **Hunk B — forma do corpo, depois do `normalizeEmail`.** Antes:

```ts
function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}
```

  depois:

```ts
function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Só a FORMA do corpo. O papel quem decide é `parseInviteRole` e o e-mail, a
 * regex de sempre — aqui não entra uma segunda lista de papéis. `strictObject`:
 * chave a mais é 400, não ignorada em silêncio.
 */
const conviteSchema = z.strictObject({
  email: z.string().optional(),
  role: z.string().optional(),
  modules: z.array(z.enum(MODULOS_OPCIONAIS)).optional(),
});

const acessoSchema = z.strictObject({
  id: z.uuid(),
  modules: z.array(z.enum(MODULOS_OPCIONAIS)),
});

const SO_A_VENDEDORA = "Só a vendedora tem módulos.";

/** Mesmas frases que o PR 3 já devolve para e-mail e papel; as outras são deste PR. */
function erroDoConvite(error: z.ZodError): string {
  const campo = error.issues[0]?.path[0];
  if (campo === "email") return "E-mail invalido.";
  if (campo === "role") return "Função inválida.";
  if (campo === "modules") return "Módulo desconhecido.";
  return "Pedido inválido.";
}
```

  **Hunk C — `GET` devolve `modules`.** Antes:

```ts
      .select("id, user_id, role, invited_email, accepted_at, created_at")
```

  depois:

```ts
      .select("id, user_id, role, modules, invited_email, accepted_at, created_at")
```

  **Hunk D — parse do `POST`.** Antes (o que a Task 4 do PR 3 deixa):

```ts
    const body = (await req.json().catch(() => ({}))) as { email?: string; role?: unknown };
    const invitedEmail = normalizeEmail(body.email);
    const role = parseInviteRole(body.role);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invitedEmail)) {
      return Response.json({ error: "E-mail invalido." }, { status: 400 });
    }

    // Papel desconhecido virava `operator` em silêncio (spec acesso-vendedora §3):
    // a tela da vendedora chegando antes do backend criaria um operador.
    if (!role) {
      return Response.json({ error: "Função inválida." }, { status: 400 });
    }
```

  depois:

```ts
    const parsed = conviteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: erroDoConvite(parsed.error) }, { status: 400 });
    }
    const invitedEmail = normalizeEmail(parsed.data.email);
    const role = parseInviteRole(parsed.data.role);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invitedEmail)) {
      return Response.json({ error: "E-mail invalido." }, { status: 400 });
    }

    // Papel desconhecido virava `operator` em silêncio (spec acesso-vendedora §3):
    // a tela da vendedora chegando antes do backend criaria um operador.
    if (!role) {
      return Response.json({ error: "Função inválida." }, { status: 400 });
    }

    // Módulo é acesso da vendedora. Em admin/operador não teria efeito nenhum, e o
    // banco recusaria (`memberships_modules_validos`) com um 500 cru.
    if (parsed.data.modules !== undefined && role !== "seller") {
      return Response.json({ error: SO_A_VENDEDORA }, { status: 400 });
    }
    const modules = parseModulos(parsed.data.modules ?? []);
```

  **Hunk E — insert e log do convite gravam `modules`.** Antes:

```ts
      .insert({
        tenant_id: ctx.tenantId,
        user_id: null,
        role,
        invited_by: ctx.authUserId,
        invited_email: invitedEmail,
        accepted_at: null,
      })
      .select("id, role, invited_email, accepted_at, created_at")
      .single();
```

  depois:

```ts
      .insert({
        tenant_id: ctx.tenantId,
        user_id: null,
        role,
        modules,
        invited_by: ctx.authUserId,
        invited_email: invitedEmail,
        accepted_at: null,
      })
      .select("id, role, modules, invited_email, accepted_at, created_at")
      .single();
```

  e, no `insert` do log `membership.invited` logo abaixo, antes:

```ts
      metadata: { membership_id: data.id, role },
```

  depois:

```ts
      metadata: { membership_id: data.id, role, modules },
```

  (Esta linha só existe uma vez com `data.id`; a do `DELETE` usa `membershipId`.)

  **Hunk F — `PATCH` novo.** Inserir entre o fim do `POST` e o comentário `/** Remove um membro ou revoga um convite pendente.` do `DELETE`:

```ts
/**
 * Troca os módulos da vendedora: `PATCH /api/members` com `{ id, modules }`.
 *
 * Vale na próxima chamada dela: o guard do `getTenantContext` lê `modules` a cada
 * requisição, sem cache. Só para `seller` — os outros papéis não têm módulo, e
 * trocar o papel de alguém está fora da v1 (spec do acesso da vendedora).
 */
export async function PATCH(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const parsed = acessoSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });

    const { id } = parsed.data;
    const modules = parseModulos(parsed.data.modules);
    const supabase = getSupabaseAdmin();

    const { data: alvo, error: alvoErro } = await supabase
      .from("memberships")
      .select("id, user_id, role, modules, invited_email")
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (alvoErro) return Response.json({ error: alvoErro.message }, { status: 500 });
    if (!alvo) return Response.json({ error: "Membro não encontrado." }, { status: 404 });
    if (alvo.role !== "seller") return Response.json({ error: SO_A_VENDEDORA }, { status: 400 });

    // Tenant e papel de novo na escrita: entre a leitura e o update o membro pode
    // ter sido removido — aí nada casa e a resposta é 404, não um 200 que mente.
    const { data: salvo, error } = await supabase
      .from("memberships")
      .update({ modules })
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .eq("role", "seller")
      .select("id, modules")
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!salvo) return Response.json({ error: "Membro não encontrado." }, { status: 404 });

    const quem = alvo.invited_email ?? alvo.user_id ?? id;
    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "membership.modules_changed",
      message: `Acesso de ${quem} alterado.`,
      metadata: {
        membership_id: id,
        role: "seller",
        modules_before: parseModulos(alvo.modules),
        modules_after: modules,
      },
    });

    return Response.json({ id: salvo.id, modules: parseModulos(salvo.modules) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao salvar o acesso." }, { status: 500 });
  }
}
```

  O `PATCH` entra já aqui porque é o mesmo arquivo; os testes dele vêm na Task 2, que prova o RED comentando a função (Task 2, Step 2).

- [ ] **Step 4: rodar → PASS** (mesmo comando do Step 2). Depois `npx tsc --noEmit -p tsconfig.json` sem erro novo e `Select-String -Path src\app\api\members\route.ts -Pattern 'z\.enum\(\["admin"|INVITABLE_ROLES|normalizeRole'` vazio (nenhuma segunda lista de papéis na rota).

Sem commit aqui: o controller commita Tasks 1 e 2 juntas (mesmos arquivos).

---

### Task 2: `PATCH /api/members` (TDD) e mutantes

**Files:** `apps/web/src/app/api/members/members.test.ts`, `apps/web/src/app/api/members/route.ts`
**Depends-on:** 1.
**Interfaces:** produz `PATCH /api/members` body `{ id: uuid, modules: ModuloOpcional[] }` → `200 { id, modules }` · `400 { error: "Pedido inválido." | "Só a vendedora tem módulos." }` · `403` (texto do `assertBillingRole`) · `404 { error: "Membro não encontrado." }`; linha em `public.logs` com `event = 'membership.modules_changed'` e `metadata = { membership_id, role: "seller", modules_before, modules_after }`.

- [ ] **Step 1: acrescentar ao fim de `members.test.ts`:**

```ts
/* -------------------------------------------------------------------------- */
/* PATCH: Editar acesso da vendedora                                          */
/* -------------------------------------------------------------------------- */

test("PATCH: dono liga o Postar da vendedora e o evento entra no log", async () => {
  const res = await chamar(() => rota.PATCH(pedido("PATCH", { id: M_VENDEDORA, modules: ["postar"] })));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: M_VENDEDORA, modules: ["postar"] });

  const escrita = pedidos.find((p) => p.metodo === "PATCH");
  assert.deepEqual(escrita?.corpo, { modules: ["postar"] });
  assert.equal(escrita?.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(escrita?.url.searchParams.get("role"), "eq.seller");
  assert.deepEqual(linhaDe(M_VENDEDORA)?.modules, ["postar"]);

  const [log] = escritas("POST", "logs");
  assert.equal(log.event, "membership.modules_changed");
  assert.equal(log.tenant_id, LOJA);
  assert.equal(log.actor_user_id, DONO);
  assert.deepEqual(log.metadata, {
    membership_id: M_VENDEDORA,
    role: "seller",
    modules_before: [],
    modules_after: ["postar"],
  });
});

test("PATCH em quem não é vendedora: 400 e nada gravado", async () => {
  const res = await chamar(() => rota.PATCH(pedido("PATCH", { id: M_ADMIN, modules: ["postar"] })));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Só a vendedora tem módulos." });
  assert.equal(pedidos.some((p) => p.metodo === "PATCH"), false);
  assert.equal(escritas("POST", "logs").length, 0);
});

test("PATCH na vendedora de outra loja: 404 e a linha dela fica intacta", async () => {
  const res = await chamar(() =>
    rota.PATCH(pedido("PATCH", { id: M_VENDEDORA_DE_OUTRA, modules: ["postar"] })),
  );
  assert.equal(res.status, 404);
  assert.equal(pedidos.some((p) => p.metodo === "PATCH"), false, "não tentou escrever na outra loja");
  assert.deepEqual(linhaDe(M_VENDEDORA_DE_OUTRA)?.modules, []);
});

test("PATCH por operador: 403 antes de ler o alvo", async () => {
  banco = bancoInicial("operator");
  const res = await chamar(() => rota.PATCH(pedido("PATCH", { id: M_VENDEDORA, modules: ["postar"] })));
  assert.equal(res.status, 403);
  const leituras = pedidos.filter((p) => p.tabela === "memberships" && !p.url.searchParams.has("user_id"));
  assert.equal(leituras.length, 0);
  assert.deepEqual(linhaDe(M_VENDEDORA)?.modules, []);
});

test("PATCH com corpo inválido: 400 sem tocar no banco", async () => {
  const ruins = [
    { id: "nao-e-uuid", modules: [] },
    { id: M_VENDEDORA, modules: ["grupos"] },
    { id: M_VENDEDORA, modules: [], role: "admin" },
    { id: M_VENDEDORA },
  ];
  for (const corpo of ruins) {
    const res = await chamar(() => rota.PATCH(pedido("PATCH", corpo)));
    assert.equal(res.status, 400, JSON.stringify(corpo));
    assert.deepEqual(await res.json(), { error: "Pedido inválido." });
  }
  assert.equal(pedidos.some((p) => p.metodo === "PATCH"), false);
});
```

- [ ] **Step 2: RED.** Provar que estes testes pegam a ausência do `PATCH`: comentar temporariamente a função `PATCH` inteira em `route.ts`, rodar

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/members/members.test.ts
```

e ver os cinco testes de `PATCH` falharem com `TypeError: rota.PATCH is not a function`. Descomentar.

- [ ] **Step 3: GREEN.** Mesmo comando → todos os testes do arquivo passam (11).
- [ ] **Step 4: tipos e lint.** De `apps/web`: `npx tsc --noEmit -p tsconfig.json` e `npm run lint` → sem erro.
- [ ] **Step 5: commit (controller).** Da raiz do worktree:

```powershell
git -C "<WORKTREE>" add apps/web/src/lib/permissions.ts apps/web/src/lib/permissions.test.ts apps/web/src/app/api/members/route.ts apps/web/src/app/api/members/members.test.ts
```

```powershell
git -C "<WORKTREE>" diff --cached --stat
```

```powershell
git -C "<WORKTREE>" commit -m "feat(equipe): invite a seller with modules and edit her access via PATCH /api/members" -m "parseInviteRole accepts seller; POST checks the body shape with zod (modules only for seller), GET returns modules, PATCH changes a seller's modules within the tenant and logs membership.modules_changed." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: mutantes** (um de cada vez; cada um tem que derrubar o teste citado; depois `git -C "<WORKTREE>" checkout -- apps/web/src/app/api/members/route.ts`):
  1. Apagar as **duas** linhas `.eq("tenant_id", ctx.tenantId)` do `PATCH` → cai "PATCH na vendedora de outra loja".
  2. Apagar só a `.eq("tenant_id", ctx.tenantId)` da leitura do alvo no `PATCH` → cai o mesmo teste (pela asserção "não tentou escrever na outra loja").
  3. Apagar `if (alvo.role !== "seller") ...` → cai "PATCH em quem não é vendedora" (o update ainda filtra `role`, então vira 404 ≠ 400).
  4. Apagar o `if (parsed.data.modules !== undefined && role !== "seller")` do `POST` → cai "módulo em administrador ou operador".
  5. Tirar `modules` do `select` do `GET` → cai "GET devolve os módulos".
  6. Tirar `"seller"` de `INVITABLE_ROLES` em `permissions.ts` → caem "convite aceita a vendedora" e "vendedora com Postar" (restaurar com `git -C "<WORKTREE>" checkout -- apps/web/src/lib/permissions.ts`).

Anotar os cinco resultados para o corpo do PR.

---

### Task 3: lógica pura da Equipe (TDD)

**Files:** `apps/web/src/lib/painel/configuracoes.ts`, `apps/web/src/lib/painel/configuracoes.test.ts`
**Depends-on:** 0. (Disjunta das Tasks 1-2: pode rodar na mesma wave.)
**Interfaces:**

```ts
export type FuncaoDoConvite = "admin" | "operator" | "seller";
export const FUNCOES_DO_CONVITE: ReadonlyArray<{ id: FuncaoDoConvite; nome: string; descricao: string }>;
export const MODULOS_NA_TELA: readonly Modulo[];                 // ["vendas", ...MODULOS_OPCIONAIS]
export const ROTULO_DO_MODULO: Record<Modulo, string>;
export const DESCRICAO_DO_MODULO: Record<Modulo, string>;
export function chipsDoAcesso(papel: string, modules: unknown): string[];
export type CorpoDoConvite = { email: string; role: FuncaoDoConvite; modules?: ModuloOpcional[] };
export function montarConvite(email: string, funcao: FuncaoDoConvite, modulos: readonly ModuloOpcional[]):
  { ok: true; corpo: CorpoDoConvite } | { ok: false; erro: string };
// papelEmPortugues("seller") === "Vendedora"
```

Consome `MODULOS_OPCIONAIS`, `modulosDoAcesso`, `parseModulos`, `Modulo`, `ModuloOpcional` (`@/lib/auth/modulos`, sem `server-only`) e `pareceEmail` (`@/lib/painel/auth-aparelho.ts:19`, a validação frouxa que o login já usa — não criar outra).

- [ ] **Step 1 (teste):** em `configuracoes.test.ts`, trocar a linha 4 por

```ts
import {
  chipsDoAcesso,
  FUNCOES_DO_CONVITE,
  iniciaisDoEmail,
  montarConvite,
  papelEmPortugues,
  resumoDasPortas,
} from "./configuracoes";
```

e acrescentar depois do teste `"papel é reconhecido independente de caixa e espaço"` (linha 35):

```ts
test("vendedora tem nome na tela: o identificador seller nunca aparece", () => {
  assert.equal(papelEmPortugues("seller"), "Vendedora");
});

/* -------------------------------------------------------------------------- */
/* Convite e acesso da vendedora (spec 2026-10-07, §4).                         */
/* -------------------------------------------------------------------------- */

test("o convite oferece as três funções na ordem do mockup, e dono não se convida", () => {
  assert.deepEqual(
    FUNCOES_DO_CONVITE.map((f) => [f.id, f.nome]),
    [
      ["admin", "Administração"],
      ["operator", "Atendimento"],
      ["seller", "Vendedora"],
    ],
  );
});

/** Quem convida "Atendimento" tem que ver "Atendimento" na ficha, não "Operador". */
test("a função do convite tem o mesmo nome que a ficha da equipe mostra", () => {
  for (const f of FUNCOES_DO_CONVITE) assert.equal(f.nome, papelEmPortugues(f.id), f.id);
});

test("chips da vendedora: Registrar vendas sempre, Postar só quando liberado", () => {
  assert.deepEqual(chipsDoAcesso("seller", []), ["Registrar vendas"]);
  assert.deepEqual(chipsDoAcesso("seller", ["postar"]), ["Registrar vendas", "Postar nos grupos"]);
});

test("chips: lixo no banco não vira chip, e os outros papéis não têm chip", () => {
  assert.deepEqual(chipsDoAcesso("seller", null), ["Registrar vendas"]);
  assert.deepEqual(chipsDoAcesso("seller", ["postar", "postar", "grupos"]), ["Registrar vendas", "Postar nos grupos"]);
  assert.deepEqual(chipsDoAcesso("admin", ["postar"]), []);
  assert.deepEqual(chipsDoAcesso("operator", []), []);
});

test("convite de vendedora leva os módulos marcados, sem repetição", () => {
  assert.deepEqual(montarConvite(" carla@loja.com.br ", "seller", ["postar", "postar"]), {
    ok: true,
    corpo: { email: "carla@loja.com.br", role: "seller", modules: ["postar"] },
  });
  assert.deepEqual(montarConvite("carla@loja.com.br", "seller", []), {
    ok: true,
    corpo: { email: "carla@loja.com.br", role: "seller", modules: [] },
  });
});

/** O servidor responde 400 a módulo fora da vendedora: a tela não deve nem tentar. */
test("convite de administrador ou operador não manda modules", () => {
  assert.deepEqual(montarConvite("ana@loja.com.br", "admin", ["postar"]), {
    ok: true,
    corpo: { email: "ana@loja.com.br", role: "admin" },
  });
  assert.deepEqual(montarConvite("ana@loja.com.br", "operator", []), {
    ok: true,
    corpo: { email: "ana@loja.com.br", role: "operator" },
  });
});

test("e-mail que nem parece e-mail para na tela, antes de gastar uma chamada", () => {
  for (const ruim of ["", "   ", "carla", "carla@", "carla@loja", "car la@loja.com"]) {
    assert.deepEqual(montarConvite(ruim, "seller", []), { ok: false, erro: "Digite um e-mail válido." }, ruim);
  }
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/configuracoes.test.ts` → FAIL (`chipsDoAcesso`/`montarConvite`/`FUNCOES_DO_CONVITE` não existem; `papelEmPortugues("seller")` dá `"Equipe"`).

- [ ] **Step 3:** em `configuracoes.ts`:
  - linha 1 vira

```ts
import {
  MODULOS_OPCIONAIS,
  modulosDoAcesso,
  parseModulos,
  type Modulo,
  type ModuloOpcional,
} from "@/lib/auth/modulos";
import { pareceEmail } from "@/lib/painel/auth-aparelho";
import { iniciais } from "@/lib/painel/inicio";
```

  - `PAPEIS` (linhas 13-17) e o comentário de `papelEmPortugues` (linhas 19-23) viram

```ts
const PAPEIS: Record<string, string> = {
  owner: "Dono",
  admin: "Administração",
  operator: "Atendimento",
  seller: "Vendedora",
};

/**
 * "owner", "operator" e "seller" nunca chegam à tela (regra da spec 12.6). Papel
 * que não conhecemos vira "Equipe" — melhor genérico do que o identificador do
 * banco vazando para quem contrata o produto.
 */
```

  - depois de `iniciaisDoEmail` (fim da linha 41), inserir:

```ts
/* -------------------------------------------------------------------------- */
/* Convite e acesso da vendedora (spec 2026-10-07-acesso-vendedora, §4)       */
/* -------------------------------------------------------------------------- */

export type FuncaoDoConvite = "admin" | "operator" | "seller";

/**
 * As funções do convite, na ordem e com as descrições do mockup aprovado. O nome é
 * o mesmo de `papelEmPortugues` (o teste cobra): convite e ficha falam a mesma
 * língua. Dono não se convida.
 */
export const FUNCOES_DO_CONVITE: ReadonlyArray<{ id: FuncaoDoConvite; nome: string; descricao: string }> = [
  { id: "admin", nome: "Administração", descricao: "Tudo, menos trocar o plano e excluir a conta." },
  { id: "operator", nome: "Atendimento", descricao: "Campanhas, disparos, grupos e contatos." },
  { id: "seller", nome: "Vendedora", descricao: "Só o que você marcar abaixo." },
];

/** Os módulos na ordem da tela: `vendas` (sempre da vendedora) e depois os opcionais. */
export const MODULOS_NA_TELA: readonly Modulo[] = ["vendas", ...MODULOS_OPCIONAIS];

/**
 * `Record<Modulo, …>` de propósito: módulo novo no contrato sem rótulo aqui é
 * erro de tipo, não um chip em branco na ficha.
 */
export const ROTULO_DO_MODULO: Record<Modulo, string> = {
  vendas: "Registrar vendas",
  postar: "Postar nos grupos",
};

export const DESCRICAO_DO_MODULO: Record<Modulo, string> = {
  vendas: "Busca o cliente pelo número e lança os produtos. Vê só as vendas dela, nunca a lista de contatos.",
  postar: "Envia texto, foto, vídeo e áudio pros grupos das campanhas.",
};

/** Os chips da ficha. Só a vendedora tem; o que vier torto do banco não vira chip. */
export function chipsDoAcesso(papel: string, modules: unknown): string[] {
  if (papel !== "seller") return [];
  return modulosDoAcesso({ role: "seller", modules: parseModulos(modules) }).map((m) => ROTULO_DO_MODULO[m]);
}

export type CorpoDoConvite = { email: string; role: FuncaoDoConvite; modules?: ModuloOpcional[] };

/**
 * O corpo do `POST /api/members`. `modules` só vai com a vendedora: o servidor
 * responde 400 a módulo em outro papel. O e-mail passa pela checagem frouxa do
 * login (`pareceEmail`) — quem valida de verdade é o servidor.
 */
export function montarConvite(
  email: string,
  funcao: FuncaoDoConvite,
  modulos: readonly ModuloOpcional[],
): { ok: true; corpo: CorpoDoConvite } | { ok: false; erro: string } {
  const limpo = email.trim();
  if (!pareceEmail(limpo)) return { ok: false, erro: "Digite um e-mail válido." };
  if (funcao !== "seller") return { ok: true, corpo: { email: limpo, role: funcao } };
  return { ok: true, corpo: { email: limpo, role: funcao, modules: parseModulos(modulos) } };
}
```

- [ ] **Step 4:** mesmo comando do Step 2 → PASS. `npx tsc --noEmit -p tsconfig.json` sem erro novo.
- [ ] **Step 5: commit (controller):**

```powershell
git -C "<WORKTREE>" add apps/web/src/lib/painel/configuracoes.ts apps/web/src/lib/painel/configuracoes.test.ts
```

```powershell
git -C "<WORKTREE>" diff --cached --stat
```

```powershell
git -C "<WORKTREE>" commit -m "feat(equipe): invite payload, module labels and seller role label" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: componentes da aba Equipe

**Files:** criar `apps/web/src/components/painel/configuracoes/vitrine/campos-do-acesso.tsx`, `ficha-do-membro.tsx`, `convite-da-equipe.tsx`; modificar `aba-equipe.tsx` (mesma pasta).
**Depends-on:** 3.
**Interfaces:**

```ts
// campos-do-acesso.tsx
export function CamposDoAcesso(props: { legenda: string; modulos: readonly ModuloOpcional[];
  onModulos: (m: ModuloOpcional[]) => void; desabilitado?: boolean }): JSX.Element;
// ficha-do-membro.tsx
export type MembroNaTela = { id: string; role: string; invited_email?: string | null;
  accepted_at?: string | null; modules?: readonly string[] | null };
export function FichaDoMembro(props: { membro: MembroNaTela; removendo: boolean;
  onRemover: (m: MembroNaTela) => void;
  onSalvarAcesso: (id: string, modulos: ModuloOpcional[]) => Promise<void> }): JSX.Element;
// convite-da-equipe.tsx
export type PropsDoConvite = { email: string; onEmail: (v: string) => void; funcao: FuncaoDoConvite;
  onFuncao: (f: FuncaoDoConvite) => void; modulos: readonly ModuloOpcional[];
  onModulos: (m: ModuloOpcional[]) => void; convidando: boolean; erro: string | null;
  upgradeUrl: string | null; onConvidar: () => void };
export function ConviteDaEquipe(props: PropsDoConvite): JSX.Element;
// aba-equipe.tsx
export type PropsDaEquipe = PropsDoConvite & { membros: readonly MembroNaTela[];
  carga: "carregando" | "ok" | "erro"; aviso: string | null; removendoId: string | null;
  onRemover: (m: MembroNaTela) => void;
  onSalvarAcesso: (id: string, modulos: ModuloOpcional[]) => Promise<void> };
export function AbaEquipe(props: PropsDaEquipe): JSX.Element;
```

Hoje `aba-equipe.tsx` tem 145 linhas com lista e convite juntos; com Função, módulos e Editar acesso passaria de 300. Por isso as três peças. Tradução do mockup para o painel: fichas `pn-ficha` (não o card branco do mockup), chips `pn-chip`, cores pelos tokens (`cobalt-500`, `cobalt-soft`, `canvas-100`, `line-200`, `volt-950`, `slate-600`, `danger-700`), raio `--radius-control`. Esta task **não commita**: o tsc só fecha com a página (Task 5), que passa as props novas.

- [ ] **Step 1: `campos-do-acesso.tsx`:**

```tsx
"use client";

import { useId } from "react";
import type { ModuloOpcional } from "@/lib/auth/modulos";
import { DESCRICAO_DO_MODULO, MODULOS_NA_TELA, ROTULO_DO_MODULO } from "@/lib/painel/configuracoes";
import { cn } from "@/lib/utils";

type Props = {
  /** Vira o nome do grupo para leitor de tela ("O que ela pode acessar"). */
  legenda: string;
  modulos: readonly ModuloOpcional[];
  onModulos: (m: ModuloOpcional[]) => void;
  desabilitado?: boolean;
};

/**
 * O que a vendedora alcança, no convite e no "Editar acesso" da ficha (mockup
 * "Configurações › Equipe"). "Registrar vendas" vem marcado e travado: para o
 * papel `seller` ele é implícito e nem é gravado em `modules` — o servidor só
 * guarda os extras.
 */
export function CamposDoAcesso({ legenda, modulos, onModulos, desabilitado = false }: Props) {
  const id = useId();
  return (
    <fieldset disabled={desabilitado} className="min-w-0 rounded-[var(--radius-control)] bg-canvas-100 p-4">
      {/* `float` + `w-full`: sem isso a legenda senta na borda do fieldset, metade fora do fundo. */}
      <legend className="float-left mb-2 w-full text-13 font-semibold text-volt-950">{legenda}</legend>
      <div className="clear-both space-y-1">
        {MODULOS_NA_TELA.map((modulo) => (
          <label
            key={modulo}
            className={cn("flex min-h-11 gap-3 py-1.5", modulo === "vendas" ? "cursor-default" : "cursor-pointer")}
          >
            <input
              type="checkbox"
              checked={modulo === "vendas" || modulos.includes(modulo)}
              disabled={modulo === "vendas"}
              onChange={(e) => {
                if (modulo === "vendas") return;
                onModulos(e.target.checked ? [...modulos, modulo] : modulos.filter((m) => m !== modulo));
              }}
              aria-labelledby={`${id}-${modulo}`}
              aria-describedby={`${id}-${modulo}-desc`}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-cobalt-500"
            />
            <span className="flex flex-col gap-0.5">
              <span id={`${id}-${modulo}`} className="text-[14px] font-semibold text-volt-950">
                {ROTULO_DO_MODULO[modulo]}
              </span>
              <span id={`${id}-${modulo}-desc`} className="text-13 text-slate-600">
                {DESCRICAO_DO_MODULO[modulo]}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 2: `ficha-do-membro.tsx`** (o corpo da ficha sai de `aba-equipe.tsx:70-99`; o botão da lixeira sobe de `h-10 w-10` para `h-11 w-11`, alvo de 44 px):

```tsx
"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { canOfferRemoval, removalActionLabel } from "@/lib/auth/member-removal";
import { parseModulos, type ModuloOpcional } from "@/lib/auth/modulos";
import { chipsDoAcesso, iniciaisDoEmail, papelEmPortugues } from "@/lib/painel/configuracoes";
import { CamposDoAcesso } from "./campos-do-acesso";

export type MembroNaTela = {
  id: string;
  role: string;
  invited_email?: string | null;
  accepted_at?: string | null;
  /** Os módulos extras da vendedora; os outros papéis vêm com `[]`. */
  modules?: readonly string[] | null;
};

type Props = {
  membro: MembroNaTela;
  removendo: boolean;
  onRemover: (m: MembroNaTela) => void;
  /** Lança `Error` com a frase do servidor; a ficha mostra e continua aberta. */
  onSalvarAcesso: (id: string, modulos: ModuloOpcional[]) => Promise<void>;
};

/**
 * Uma pessoa da equipe, na ficha de 64px (spec 12.6).
 *
 * O papel sai sempre em português: "owner", "operator" e "seller" nunca chegam à
 * tela. A vendedora ganha os chips do que alcança e o "Editar acesso", que abre
 * ali mesmo os módulos dela — vale na próxima ação dela, porque o guard do
 * servidor lê `modules` a cada requisição.
 */
export function FichaDoMembro({ membro: m, removendo, onRemover, onSalvarAcesso }: Props) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<ModuloOpcional[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const vendedora = m.role === "seller";
  const chips = chipsDoAcesso(m.role, m.modules);
  const quem = m.invited_email ?? "este membro";
  const painelId = `acesso-${m.id}`;

  function alternar() {
    // Abre sempre do que está salvo: o rascunho de uma edição largada não pode
    // voltar como se fosse o acesso atual dela.
    setRascunho(parseModulos(m.modules));
    setErro(null);
    setAberto(!aberto);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvarAcesso(m.id, rascunho);
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o acesso.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    // A última ficha perde a borda: com ela, a linha da ficha e a do bloco de
    // convite logo abaixo desenhavam um filete duplo.
    <li className="pn-ficha flex-wrap last:border-b-0">
      <span className="pn-ficha__iniciais" aria-hidden="true">
        {iniciaisDoEmail(m.invited_email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="pn-ficha__nome truncate">{m.invited_email ?? "Membro"}</p>
        <p className="pn-ficha__origem">
          {papelEmPortugues(m.role)}
          {!m.accepted_at && " · convite pendente"}
        </p>
        {chips.length > 0 && (
          <ul aria-label="Acesso liberado" className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip} className="pn-chip">
                {chip}
              </li>
            ))}
          </ul>
        )}
      </div>
      {vendedora && (
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls={painelId}
          aria-label={`${aberto ? "Fechar" : "Editar"} acesso de ${quem}`}
          className="inline-flex h-11 shrink-0 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-13 font-semibold text-volt-950"
        >
          {aberto ? "Fechar" : "Editar acesso"}
        </button>
      )}
      {canOfferRemoval(m) && (
        <button
          type="button"
          onClick={() => onRemover(m)}
          disabled={removendo}
          aria-label={removalActionLabel(m)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-slate-600 hover:text-danger-700 disabled:opacity-50"
        >
          {removendo ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}
      {vendedora && (
        // Sempre no DOM (escondido) para o `aria-controls` apontar para algo real.
        <div id={painelId} hidden={!aberto} className="basis-full pb-2 sm:pl-[52px]">
          <CamposDoAcesso
            legenda={`O que ${quem} pode acessar`}
            modulos={rascunho}
            onModulos={setRascunho}
            desabilitado={salvando}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-[14px] font-semibold text-paper-0 disabled:opacity-50"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Salvar acesso
            </button>
            <p className="text-12 text-slate-600">Vale na próxima ação dela, sem precisar sair e entrar de novo.</p>
          </div>
          {erro && (
            <p role="alert" className="mt-2 text-13 text-danger-700">
              {erro}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 3: `convite-da-equipe.tsx`** (o bloco de convite sai de `aba-equipe.tsx:104-136`; os textos são os do mockup):

```tsx
"use client";

import { useId } from "react";
import { Loader2 } from "lucide-react";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import type { ModuloOpcional } from "@/lib/auth/modulos";
import { FUNCOES_DO_CONVITE, type FuncaoDoConvite } from "@/lib/painel/configuracoes";
import { cn } from "@/lib/utils";
import { CamposDoAcesso } from "./campos-do-acesso";

export type PropsDoConvite = {
  email: string;
  onEmail: (v: string) => void;
  funcao: FuncaoDoConvite;
  onFuncao: (f: FuncaoDoConvite) => void;
  modulos: readonly ModuloOpcional[];
  onModulos: (m: ModuloOpcional[]) => void;
  convidando: boolean;
  erro: string | null;
  upgradeUrl: string | null;
  onConvidar: () => void;
};

/**
 * "Convidar pessoa" com a função escolhida na hora (mockup "Configurações ›
 * Equipe"). Vendedora abre os módulos; os outros papéis não têm o que marcar.
 * `noValidate`: o e-mail é conferido por `montarConvite` e o erro sai no alerta
 * da tela, não no balão do navegador.
 */
export function ConviteDaEquipe({
  email,
  onEmail,
  funcao,
  onFuncao,
  modulos,
  onModulos,
  convidando,
  erro,
  upgradeUrl,
  onConvidar,
}: PropsDoConvite) {
  const id = useId();
  return (
    <form
      noValidate
      aria-labelledby={`${id}-titulo`}
      onSubmit={(e) => {
        e.preventDefault();
        onConvidar();
      }}
      className="mt-6 space-y-5 border-t border-line-200 pt-5"
    >
      <h2 id={`${id}-titulo`} className="font-brand text-[16px] font-bold text-volt-950">
        Convidar pessoa
      </h2>

      <div>
        {/* O rótulo visível É o nome acessível do campo: `aria-label` diferente
            do texto na tela quebra "label in name" (WCAG 2.5.3) e some com o
            seletor que o E2E de convite usa. */}
        <label htmlFor="convite-email" className="block text-13 font-semibold text-volt-950">
          E-mail
        </label>
        <input
          id="convite-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="nome@exemplo.com.br"
          className="mt-1 h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 text-[16px] text-volt-950 sm:max-w-sm"
        />
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-13 font-semibold text-volt-950">Função</legend>
        {FUNCOES_DO_CONVITE.map((f) => (
          <label
            key={f.id}
            className={cn(
              "flex min-h-11 cursor-pointer gap-3 rounded-[var(--radius-control)] border p-3",
              funcao === f.id ? "border-cobalt-500 bg-cobalt-soft" : "border-line-200 bg-paper-0",
            )}
          >
            <input
              type="radio"
              name={`${id}-funcao`}
              value={f.id}
              checked={funcao === f.id}
              onChange={() => onFuncao(f.id)}
              aria-labelledby={`${id}-${f.id}`}
              aria-describedby={`${id}-${f.id}-desc`}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-cobalt-500"
            />
            <span className="flex flex-col gap-0.5">
              <span id={`${id}-${f.id}`} className="text-[14px] font-semibold text-volt-950">
                {f.nome}
              </span>
              <span id={`${id}-${f.id}-desc`} className="text-13 text-slate-600">
                {f.descricao}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {funcao === "seller" && (
        <CamposDoAcesso legenda="O que ela pode acessar" modulos={modulos} onModulos={onModulos} />
      )}

      <PlanLimitAlert
        message={erro}
        upgradeUrl={upgradeUrl}
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border-l-[3px] border-danger-700 bg-canvas-100 px-4 py-3 text-13 text-danger-700"
      />

      <div>
        <button
          type="submit"
          disabled={convidando || !email.trim()}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-6 text-[15px] font-semibold text-paper-0 disabled:opacity-50 sm:w-auto"
        >
          {convidando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Enviar convite
        </button>
        <p className="mt-2 text-12 text-slate-600">Cada pessoa da equipe usa 1 vaga do plano, vendedora também.</p>
      </div>
    </form>
  );
}
```

O `disabled` com e-mail vazio fica de propósito: o E2E usa o "habilitou" como prova de que o React hidratou e registrou o que foi digitado (`e2e/equipe-convite.spec.ts:35-51`).

- [ ] **Step 4: `aba-equipe.tsx` inteiro:**

```tsx
"use client";

import type { ModuloOpcional } from "@/lib/auth/modulos";
import { ConviteDaEquipe, type PropsDoConvite } from "./convite-da-equipe";
import { FichaDoMembro, type MembroNaTela } from "./ficha-do-membro";

export type PropsDaEquipe = PropsDoConvite & {
  membros: readonly MembroNaTela[];
  /**
   * Lista vazia não é o mesmo que "só você", e "ainda não voltou" não é o mesmo
   * que "falhou" — são três telas, não duas.
   */
  carga: "carregando" | "ok" | "erro";
  aviso: string | null;
  removendoId: string | null;
  onRemover: (m: MembroNaTela) => void;
  onSalvarAcesso: (id: string, modulos: ModuloOpcional[]) => Promise<void>;
};

/** Equipe como fichas de 64px (spec 12.6), com o convite embaixo. Todo o estado vem da página. */
export function AbaEquipe({
  membros,
  carga,
  aviso,
  removendoId,
  onRemover,
  onSalvarAcesso,
  ...convite
}: PropsDaEquipe) {
  return (
    <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8" data-testid="configuracoes-equipe">
      {carga === "carregando" ? (
        <div
          className="pn-skeleton h-32 rounded-[var(--radius-control)]"
          data-testid="painel-skeleton"
          role="status"
          aria-label="Carregando a equipe"
        />
      ) : carga === "erro" ? (
        // Lista vazia por falha de rota diria "só você" a quem tem equipe.
        <p className="text-[14px] text-slate-600">
          Não deu para carregar a equipe agora. Atualize a página em alguns instantes.
        </p>
      ) : membros.length === 0 ? (
        <p className="text-[14px] text-slate-600">Só você por enquanto. Convide alguém abaixo.</p>
      ) : (
        <ul>
          {membros.map((m) => (
            <FichaDoMembro
              key={m.id}
              membro={m}
              removendo={removendoId === m.id}
              onRemover={onRemover}
              onSalvarAcesso={onSalvarAcesso}
            />
          ))}
        </ul>
      )}

      <ConviteDaEquipe {...convite} />

      {aviso && (
        <p role="status" className="mt-3 text-13 text-slate-600">
          {aviso}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5:** `npm run painel:check` → `painel:check OK` (raio ≤ 12px, sem blur/gradiente, esqueleto com `role="status"`). O `tsc` ainda acusa a página (props novas) — esperado até a Task 5.

---

### Task 5: a página passa função, módulos e o `PATCH`

**Files:** `apps/web/src/app/painel/configuracoes/page.tsx`
**Depends-on:** 2, 4.
**Interfaces:** consome `montarConvite`, `FuncaoDoConvite` (`@/lib/painel/configuracoes`), `ModuloOpcional` (`@/lib/auth/modulos`), `PropsDaEquipe` (via `ConfiguracoesVitrine`); chama `POST` e `PATCH /api/members` com `authenticatedFetch`.

As linhas citadas são as da main de 07/10; o PR 3 não toca esta página (só o `RoleProvider`), mas confira o texto antes de editar.

- [ ] **Step 1: imports** — depois da linha 20 (`import { useRole } ...`):

```ts
import type { ModuloOpcional } from "@/lib/auth/modulos";
import { montarConvite, type FuncaoDoConvite } from "@/lib/painel/configuracoes";
```

- [ ] **Step 2:** a linha 94 vira

```ts
type Membership = {
  id: string;
  role: string;
  invited_email?: string | null;
  accepted_at?: string | null;
  modules?: readonly string[] | null;
};
```

(`readonly` igual ao `MembroNaTela`: o `onRemover` devolve a ficha para `removeMember(m: Membership)`.)

- [ ] **Step 3:** depois da linha 129 (`const [inviteUpgradeUrl, setInviteUpgradeUrl] = ...`):

```ts
  // "operator" é o que o convite sempre mandou; quem quer vendedora escolhe.
  const [inviteRole, setInviteRole] = useState<FuncaoDoConvite>("operator");
  const [inviteModules, setInviteModules] = useState<ModuloOpcional[]>([]);
```

- [ ] **Step 4:** `inviteMember` (linhas 328-350) inteiro vira

```ts
  async function inviteMember() {
    // E-mail que nem parece e-mail para aqui, antes de gastar uma chamada; quem
    // valida de verdade continua sendo o servidor.
    const convite = montarConvite(inviteEmail, inviteRole, inviteModules);
    if (!convite.ok) {
      setInviteError(convite.erro);
      setInviteUpgradeUrl(null);
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    try {
      const res = await authenticatedFetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(convite.corpo),
      });
      if (!res.ok) {
        throw await toPlanLimitError(res, "Erro ao convidar.");
      }
      const newMember = await res.json();
      setMembers((prev) => [...prev, newMember]);
      setInviteEmail("");
      setInviteModules([]);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Erro ao convidar.");
      setInviteUpgradeUrl(upgradeUrlFrom(e));
    } finally {
      setInviteBusy(false);
    }
  }
```

- [ ] **Step 5:** depois de `removeMember` (fim na linha 381), acrescentar

```ts
  /**
   * Troca os módulos da vendedora. Lança com a frase do servidor: a ficha que
   * chamou mostra o erro e continua aberta, com o rascunho intacto.
   */
  async function saveMemberModules(id: string, modules: ModuloOpcional[]) {
    const res = await authenticatedFetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, modules }),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string; modules?: string[] };
    if (!res.ok) throw new Error(d.error || "Não foi possível salvar o acesso.");
    setMembers((prev) => prev.map((x) => (x.id === id ? { ...x, modules: d.modules ?? [] } : x)));
  }
```

- [ ] **Step 6:** o objeto `equipe={{ ... }}` (linhas 405-417) vira

```tsx
      equipe={{
        membros: members,
        carga: respondeu.members,
        email: inviteEmail,
        onEmail: setInviteEmail,
        funcao: inviteRole,
        onFuncao: setInviteRole,
        modulos: inviteModules,
        onModulos: setInviteModules,
        convidando: inviteBusy,
        erro: inviteError,
        upgradeUrl: inviteUpgradeUrl,
        aviso: removeNotice,
        removendoId: removingId,
        onConvidar: () => void inviteMember(),
        onRemover: (m) => void removeMember(m),
        onSalvarAcesso: saveMemberModules,
      }}
```

- [ ] **Step 7:** de `apps/web`: `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, `npm run painel:check` → limpos.
- [ ] **Step 8: commit (controller) das Tasks 4 e 5:**

```powershell
git -C "<WORKTREE>" add apps/web/src/components/painel/configuracoes/vitrine/campos-do-acesso.tsx apps/web/src/components/painel/configuracoes/vitrine/ficha-do-membro.tsx apps/web/src/components/painel/configuracoes/vitrine/convite-da-equipe.tsx apps/web/src/components/painel/configuracoes/vitrine/aba-equipe.tsx apps/web/src/app/painel/configuracoes/page.tsx
```

```powershell
git -C "<WORKTREE>" diff --cached --stat
```

```powershell
git -C "<WORKTREE>" commit -m "feat(equipe): invite with role and modules, seller access editor in the Equipe tab" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: E2E da equipe

**Files:** `apps/web/e2e/equipe-convite.spec.ts`
**Depends-on:** 5.
**Interfaces:** contrato com a tela — campo `E-mail`, botão `Enviar convite`, radio `Vendedora`, grupo `O que ela pode acessar`, checkboxes `Registrar vendas`/`Postar nos grupos`, lista `Acesso liberado`, botões `Editar acesso de <e-mail>`/`Fechar acesso de <e-mail>`/`Salvar acesso`/`Revogar convite de <e-mail>`.

**Estratégia:** o usuário de E2E (`E2E_EMAIL`, `qa-user`) é "não-admin" **de plataforma** (`admin-gate.spec.ts` cobra o redirect de `/admin`), mas é **dono** do próprio tenant de dev — o teste que já existe faz `POST /api/members` → 201, e isso só passa pelo `assertBillingRole` com owner/admin. Então o fluxo do dono roda com a sessão do `auth.setup.ts`, sem usuário novo. O lado da vendedora (entrar e ver só Vendas, 403 nas outras rotas) precisa de um segundo login e é do PR 5. Roda no job `e2e` do CI contra o banco de dev; o convite criado é revogado no fim e, se o teste cair no meio, apagado no `finally` (convite que sobra ocupa vaga do plano em todo run seguinte).

- [ ] **Step 1:** substituir o arquivo inteiro:

```ts
import { expect, test } from "@playwright/test";
import { exigeCredenciais } from "./sessao-helpers";
import { confirmarNaFolha } from "./confirmacao";

/**
 * Convidar -> aparece na lista -> revogar -> some.
 *
 * Este e o teste que teria pego o #114: o botao de revogar existia como
 * componente, tinha teste unitario, e nenhuma pagina o importava. Nada disso
 * aparece se a asercao for sobre o componente; so aparece clicando na tela.
 *
 * A entrega do e-mail fica de fora de proposito — depende de caixa externa e
 * deixaria a suite instavel. Desde o #112 a entrega vira linha em public.logs,
 * que se confere por SQL sem browser.
 */
test.describe("convite de equipe", () => {
  exigeCredenciais();

  test("convidar, ver na lista e revogar", async ({ page }) => {
    // Endereco unico por execucao: sem isso a segunda rodada esbarra no convite
    // que a primeira deixou para tras.
    const convidado = `e2e-convite-${Date.now()}@exemplo.invalid`;

    // Sessao vem do auth.setup.ts; aqui so navega.
    await page.goto("/painel/configuracoes");
    // Sem `exact`: na Vitrine a porta carrega o resumo embaixo do rótulo, então
    // o nome acessível vira "Equipe 2 pessoas" assim que a consulta responde —
    // com `exact: true` o teste virava corrida com o fetch.
    await page.getByRole("button", { name: /^Equipe/ }).first().click();

    const equipe = page.getByTestId("configuracoes-equipe");
    const campoEmail = equipe.getByLabel("E-mail", { exact: true });
    const botaoConvidar = equipe.getByRole("button", { name: "Enviar convite", exact: true });
    await expect(campoEmail).toBeVisible();

    // Esperar a lista chegar antes de digitar. Escrever no campo antes do React
    // hidratar poe o texto no DOM sem por no state: o botao continua disabled e
    // o clique nao faz nada. Foi assim que a primeira versao deste teste falhou
    // com a API respondendo 201 normalmente.
    // "Ativo" é da casca antiga; a Vitrine mostra o papel em português ("Dono",
    // "Administração"), porque "owner"/"operator" não podem chegar à tela. O
    // teste vale nas duas até a casca antiga sair.
    await expect(
      page
        .getByText("Ativo")
        .or(page.getByText("Dono"))
        .or(page.getByText("Só você por enquanto"))
        .first(),
    ).toBeVisible();

    await campoEmail.fill(convidado);
    await expect(botaoConvidar, "o React nao registrou o e-mail digitado").toBeEnabled();

    // Esperar a RESPOSTA, nao um tempo arbitrario: POST /api/members envia o
    // e-mail de convite de forma sincrona, entao a rota demora mais que o
    // timeout padrao. Com espera por tempo, o teste reprovava um convite que o
    // banco ja tinha gravado.
    const [resposta] = await Promise.all([
      page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/members" && r.request().method() === "POST",
        { timeout: 60_000 },
      ),
      botaoConvidar.click(),
    ]);
    expect(resposta.status(), "POST /api/members nao criou o convite").toBe(201);

    const linhaDoConvidado = page.getByText(convidado, { exact: true });
    await expect(linhaDoConvidado, "convite nao apareceu na lista da equipe").toBeVisible();

    const botaoRevogar = page.getByRole("button", { name: `Revogar convite de ${convidado}` });
    await expect(botaoRevogar, "o botao de revogar nao chegou na tela (regressao do #114)").toBeVisible();

    // A revogacao pergunta antes de agir; sem responder a folha, nada acontece.
    await botaoRevogar.click();
    await confirmarNaFolha(page, "Revogar");

    await expect(linhaDoConvidado, "convite continuou na lista depois de revogar").toHaveCount(0);
  });

  /**
   * Acesso da vendedora, PR 6: o dono escolhe a função no convite e liga os
   * módulos dela; depois troca pelo "Editar acesso" sem refazer o convite. A
   * vendedora entrando e vendo só Vendas é do PR 5 (precisa de um segundo login).
   */
  test("convidar vendedora com Postar, ver os chips, tirar o Postar e revogar", async ({ page }) => {
    const convidada = `e2e-vendedora-${Date.now()}@exemplo.invalid`;
    let conviteId: string | null = null;

    await page.goto("/painel/configuracoes");
    await page.getByRole("button", { name: /^Equipe/ }).first().click();

    const equipe = page.getByTestId("configuracoes-equipe");
    const campoEmail = equipe.getByLabel("E-mail", { exact: true });
    const botaoEnviar = equipe.getByRole("button", { name: "Enviar convite", exact: true });
    await expect(equipe.getByText("Dono").or(equipe.getByText("Só você por enquanto")).first()).toBeVisible();

    try {
      await campoEmail.fill(convidada);
      await expect(botaoEnviar, "o React nao registrou o e-mail digitado").toBeEnabled();

      await equipe.getByRole("radio", { name: "Vendedora", exact: true }).check();
      const acesso = equipe.getByRole("group", { name: "O que ela pode acessar" });
      const vendas = acesso.getByRole("checkbox", { name: "Registrar vendas", exact: true });
      await expect(vendas).toBeChecked();
      await expect(vendas, "Registrar vendas é da vendedora sempre").toBeDisabled();
      await acesso.getByRole("checkbox", { name: "Postar nos grupos", exact: true }).check();

      const [resposta] = await Promise.all([
        page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/members" && r.request().method() === "POST",
          { timeout: 60_000 },
        ),
        botaoEnviar.click(),
      ]);
      expect(resposta.status(), "POST /api/members nao criou o convite").toBe(201);
      expect(resposta.request().postDataJSON()).toEqual({ email: convidada, role: "seller", modules: ["postar"] });
      conviteId = ((await resposta.json()) as { id: string }).id;

      const linha = equipe.getByRole("listitem").filter({ hasText: convidada });
      await expect(linha).toContainText("Vendedora");
      const chips = linha.getByRole("list", { name: "Acesso liberado" }).getByRole("listitem");
      await expect(chips).toHaveText(["Registrar vendas", "Postar nos grupos"]);
      await expect(equipe, "o identificador do banco não chega à tela").not.toContainText("seller");

      const editar = linha.getByRole("button", { name: `Editar acesso de ${convidada}` });
      await expect(editar).toHaveAttribute("aria-expanded", "false");
      await editar.click();
      await expect(linha.getByRole("button", { name: `Fechar acesso de ${convidada}` })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      const painel = linha.getByRole("group", { name: `O que ${convidada} pode acessar` });
      await painel.getByRole("checkbox", { name: "Postar nos grupos", exact: true }).uncheck();

      const [patch] = await Promise.all([
        page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/members" && r.request().method() === "PATCH",
        ),
        linha.getByRole("button", { name: "Salvar acesso", exact: true }).click(),
      ]);
      expect(patch.status(), "PATCH /api/members nao salvou o acesso").toBe(200);
      expect(await patch.json()).toEqual({ id: conviteId, modules: [] });
      await expect(chips).toHaveText(["Registrar vendas"]);
      await expect(painel, "o painel fecha depois de salvar").toBeHidden();

      await linha.getByRole("button", { name: `Revogar convite de ${convidada}` }).click();
      await confirmarNaFolha(page, "Revogar");
      await expect(equipe.getByText(convidada, { exact: true })).toHaveCount(0);
      conviteId = null;
    } finally {
      // Convite que sobra no tenant de dev ocupa vaga do plano em todo run seguinte.
      if (conviteId) await page.request.delete(`/api/members?id=${conviteId}`);
    }
  });
});
```

- [ ] **Step 2:** de `apps/web`: `npx tsc --noEmit -p tsconfig.e2e.json` e `npm run lint` → limpos.
- [ ] **Step 3 (opcional, local):** com `E2E_EMAIL`/`E2E_PASSWORD` no `.env.local` do worktree e o dev server **deste** worktree no ar, `$env:E2E_BASE_URL = "http://localhost:<porta>"; npx playwright test e2e/equipe-convite.spec.ts`. Sem isso, a prova é o job `e2e` do CI no PR (o `preview_start` serve o checkout principal, não o worktree).
- [ ] **Step 4: commit (controller):**

```powershell
git -C "<WORKTREE>" add apps/web/e2e/equipe-convite.spec.ts
```

```powershell
git -C "<WORKTREE>" diff --cached --stat
```

```powershell
git -C "<WORKTREE>" commit -m "test(e2e): owner invites a seller with Postar and edits her access" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: verificação, PR, merge e produção

**Files:** nenhum arquivo novo (só `fix:` se a verificação acusar algo).
**Depends-on:** 1-6.
**Interfaces:** —

- [ ] **Step 1: gates locais**, de `<WORKTREE>\apps\web`:

```powershell
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.e2e.json
npm run lint
npm test
npm run painel:check
```

Todos limpos; `npm test` com os 11 de `members.test.ts` e os novos de `configuracoes.test.ts` passando.

- [ ] **Step 2: gate real do CI**, da raiz do worktree (sem `2>&1` nem `*>`: no PS 5.1 isso transforma aviso de stderr em falha falsa):

```powershell
Set-Location "<WORKTREE>"; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

`EXIT=0`. Se algo mudar para passar: commit `fix: <o quê>` com o mesmo rito (`add` por arquivo, `diff --cached --stat` separado, `Co-Authored-By`).

- [ ] **Step 3: revisão.** Antes de entregar: `git -C "<WORKTREE>" diff origin/main...feat/equipe-vendedora --stat` mostra só os 12 arquivos da File Structure; rodar o agente Code Reviewer sobre o diff (rota com input de usuário e escrita em `memberships` → também Security Engineer). Corrigir CRITICAL/HIGH.

- [ ] **Step 4: corpo do PR.** Gravar (Write, UTF-8) em `<scratchpad>\pr6-body.md`:

```markdown
## O que muda
- `POST /api/members`: corpo validado com zod (`strictObject`); função `admin | operator | seller`; `modules` só com vendedora (senão 400 "Só a vendedora tem módulos."); papel desconhecido ou ausente é 400. Grava `modules` na linha do convite e no log `membership.invited`.
- `PATCH /api/members` (novo): `{ id, modules }`, só dono/admin, só membership `seller` da loja do contexto (400 em outro papel, 404 em outra loja); registra `membership.modules_changed` em `public.logs` com antes/depois. Vale na próxima chamada da vendedora (o guard lê `modules` a cada requisição).
- `GET /api/members` devolve `modules`.
- Configurações › Equipe: convite com Função (Administração / Atendimento / Vendedora, os mesmos nomes da lista); vendedora abre "O que ela pode acessar" (Registrar vendas travado, Postar nos grupos); ficha da vendedora com chips e "Editar acesso" inline.

**Ordem de merge: este PR entra depois do PR 5 (`feat/vendas-tela`)** — é o interruptor que deixa o dono convidar vendedora (spec §8); antes do 5, a convidada cairia num painel sem a tela de Vendas.

## Como testei
- `members.test.ts`: a rota real contra um Supabase falso em memória — vendedora com/sem módulos, módulo em admin/operador (400), papel inválido/ausente (400), módulo desconhecido (400), GET com `modules`, PATCH ok com log, não-vendedora (400), outra loja (404, sem escrita), operador (403), corpo inválido (400).
- Mutantes rodados e mortos: tirar o filtro de tenant do PATCH (os dois e só o da leitura), tirar a checagem de papel do PATCH, tirar a trava de módulo fora da vendedora no POST, tirar `modules` do select do GET.
- `configuracoes.test.ts`: rótulo "Vendedora", funções do convite, chips, corpo do convite, e-mail.
- E2E `equipe-convite.spec.ts`: dono convida vendedora com Postar → chips → Editar acesso tira o Postar (PATCH 200) → revoga.
- `tsc` (app e e2e), `lint`, `npm test`, `painel:check`, `verify-local.ps1`.

## Test plan
- [ ] CI `verify` e `e2e` verdes
- [ ] Produção: roteiro do plano (vendedora de teste convidada, venda registrada, 403 em `/api/orders`, Postar liberado na hora)

Spec: `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` · Plano: `docs/superpowers/plans/2026-10-07-acesso-vendedora-pr6-equipe.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 5: Comandos para o Igor** (push, PR e merge passam por ele; um bloco por comando, PowerShell 5.1 sem `&&`; `<N>` é o número do PR):

Antes de abrir/mergear, o PR 5 tem que estar em `main` — este comando tem que listar o PR da `feat/vendas-tela`:

```bash
gh pr list --repo codingB0y/Girumo --state merged --head feat/vendas-tela
```

```bash
git -C "<WORKTREE>" fetch origin main
```

```bash
git -C "<WORKTREE>" rev-list --count feat/equipe-vendedora..origin/main
```

Se der mais que 0: `git -C "<WORKTREE>" merge origin/main`, rodar de novo o Step 1 e o Step 2, e só então seguir.

```bash
git -C "<WORKTREE>" push -u origin feat/equipe-vendedora
```

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/equipe-vendedora --title "feat(equipe): convidar vendedora e escolher módulos" --body-file "<scratchpad>\pr6-body.md"
```

```bash
gh pr checks <N> --repo codingB0y/Girumo
```

Com tudo verde (a `main` não tem proteção: não usar auto-merge, mergear à mão no verde):

```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

Card, logo depois do merge (SQL Editor de prod `nidoatbxaylrkcgbszns`):

```sql
select public.move_card('acesso-vendedora', 'no_ar_nao_verificado', 'PR 6 mergeado: o dono convida vendedora com função e módulos e edita o acesso — a feature chega aos lojistas. Falta a prova em produção.', 'PR #<N>');
```

- [ ] **Step 6: roteiro de verificação em produção** (o que permite `no_ar_verificado`; a prova é colhida na hora — mergeado não é verificado). Criar conta e digitar senha é do Igor.
  1. **Deploy certo:** `/admin/configuracoes` → campo "Deploy" igual ao SHA curto de `git -C "<WORKTREE>" log origin/main -1 --format=%h` (ou mais novo). Verificar antes disso mede o binário antigo.
  2. **Convite (dono):** na loja de teste do Igor (não na loja real: a venda de teste entra no caixa), Configurações › Equipe → E-mail = um e-mail de teste dele, Função **Vendedora**, sem Postar → Enviar convite. Esperado: ficha "Vendedora · convite pendente" com o chip "Registrar vendas".
  3. **Ela entra:** janela anônima, o Igor cria/entra com esse e-mail → o convite é aceito no login → cai em `/painel/vendas`; a barra só mostra Vendas e o chip "Vendedora".
  4. **Venda:** como vendedora, buscar um número de teste e registrar 2 produtos ("Teste PR6 A" 1 × 1,00 e "Teste PR6 B" 1 × 0,50) → **Registrar venda · R$ 1,50** → aparece em "Minhas vendas".
  5. **Bloqueio:** na mesma janela, abrir `https://app.girumo.com.br/api/orders` → **403** "Área não liberada para o seu acesso." (print com a URL). `/painel/contatos` → "Essa área não foi liberada pra você".
  6. **Liberar na hora:** dono → Editar acesso → marcar Postar nos grupos → Salvar acesso. Vendedora → recarregar → Disparos aparece no menu e `https://app.girumo.com.br/api/campanhas` responde 200 — sem sair e entrar de novo.
  7. **Prova no banco (prod, leitura; trocar o e-mail):**

```sql
select m.id as membership_id, m.role::text as role, m.modules, m.accepted_at,
       o.id as order_id, o.value, o.created_at, count(i.id) as itens
from public.memberships m
join public.orders o on o.tenant_id = m.tenant_id and o.created_by = m.user_id
left join public.order_items i on i.order_id = o.id
where m.invited_email = '<e-mail de teste>'
group by m.id, o.id
order by o.created_at desc
limit 5;
```

  Esperado: `role = seller`, `modules = {postar}`, `value = 1.50`, `itens = 2`. E o log, com o `membership_id` de cima:

```sql
select id, event, metadata, created_at
from public.logs
where event in ('membership.invited', 'membership.modules_changed')
  and metadata->>'membership_id' = '<membership_id>'
order by created_at;
```

  Esperado: `membership.invited` com `modules: []` e `membership.modules_changed` com `modules_before: []`, `modules_after: ["postar"]`.
  8. **Card com a prova** (o banco recusa `no_ar_verificado` sem `p_ref`):

```sql
select public.move_card('acesso-vendedora', 'no_ar_verificado', 'Vendedora de teste convidada pelo painel, registrou venda de 2 itens, levou 403 em /api/orders e ganhou Postar sem relogar.', '<AAAA-MM-DD HH:MM> membership <membership_id> seller {postar}; order <order_id> created_by <user_id> 2 itens R$ 1,50; GET /api/orders 403; log membership.modules_changed <log_id>');
update public.board_features set blocker = null where key = 'acesso-vendedora';
select key, blocker from public.board_features where blocker ilike '%acesso-vendedora%';
```

  O último `select` lista cards que citavam este como bloqueio — limpar o `blocker` deles também (`move_card` não limpa).
  9. **Limpeza:** na janela da vendedora, dentro das 24h, apagar a venda de teste pelo console: `await fetch("/api/vendas/<order_id>", { method: "DELETE" }).then((r) => r.status)` → `200`. Depois o dono remove a vendedora de teste pela lixeira da ficha.

- [ ] **Step 7: grafo e encerramento.** Comando para o Igor, da raiz do repo:

```powershell
.\tools\lightrag\.venv\Scripts\rag.exe insert "decisão: convite de equipe exige função explícita (admin | operator | seller) e papel desconhecido é 400; modules só existe para seller e é editado por PATCH /api/members (owner/admin, membership seller do tenant), que registra membership.modules_changed em public.logs; o PR 6 só entra depois do PR 5." --source decisao-2026-10-07-equipe-vendedora
```

Ao encerrar a sessão: "PRs que deixei abertos: #N (motivo)" — ou "nenhum".
