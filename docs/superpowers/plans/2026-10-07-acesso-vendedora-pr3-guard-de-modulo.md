# Acesso da vendedora — PR 3 (guard de módulo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendedora (`seller`) passa a ser barrada **no servidor** fora do que o dono liberou: um mapa de módulos decide rota × método, e o guard roda nos dois lugares onde a membership é lida (`getTenantContext` e `findMembershipTenantId`). Dono, admin e operador continuam exatamente como hoje.

**Architecture:** `lib/auth/modulos.ts` é puro (sem `server-only`; o painel usa o mesmo mapa no PR 5). `getTenantContext` passa a ler `role, modules` e lança `403 MENSAGEM_BLOQUEIO`; `findMembershipTenantId` recebe o `req` (caminho + método + `x-tenant-id`) e devolve `null`. `TenantRole` vive só em `permissions.ts`, com `seller` presente só em `message:send`. Dois testes estruturais seguram o futuro: ninguém lê `memberships` fora da allowlist, e todo padrão do mapa tem `route.ts` com o método. Sem DDL, sem tela, sem dependência nova.

**Tech Stack:** Next.js 15 (route handlers), TypeScript strict, Supabase service-role, `node --test` via tsx com Supabase de mentira (`node:http`, desenho de `src/lib/stores/broadcast-deliveries.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` (§1 Modelo de acesso; §3 `Equipe — api/members` e `GET /api/auth/me`; §5 linha `normalizeRole`; §7 Testes) · contrato vinculante: `docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md` (seções "PR 3 → PR 4, 5, 6" e "PR 3 → PR 6").

## Global Constraints

Regras que valem para os seis (índice):

- Código, identificadores e commits em inglês; texto de tela e de erro em pt-BR. Commits com prefixo semântico e terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`:
  - unit: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`
  - tipos (os **dois**; lint e tsx não checam tipo): `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`
  - lint: `npm run lint` · suíte: `npm test` (roda só `src/**/*.test.ts` — teste novo é `.test.ts`, nunca `.test.tsx`)
- Antes do push: `infra/scripts/verify-local.ps1` (secrets + build) — é o gate real; o `verify` do CI é pulado na `main`. (O índice escreve `scripts/verify-local.ps1`; o arquivo mora em `infra/scripts/`.)
- Nunca `git add -A`. `git diff --cached --stat` numa chamada **separada** antes de cada commit. O cwd do Bash reseta entre chamadas: sempre `git -C <worktree>` com caminho absoluto.
- Store Supabase: **sempre** `.eq("tenant_id", tenantId)` — o service-role ignora RLS.
- Ao começar, card `acesso-vendedora` em `em_construcao` (Task 0); ao terminar, `move_card` + `blocker = null` (Task 8). DML em prod passa pelo Igor.
- Fechar o loop na mesma sessão: revisar → CI verde → mergear → apagar branch. Ao encerrar: "PRs que deixei abertos: …".

Deste PR:

- **Depende do PR 2 aplicado em dev E prod.** `getTenantContext` vai selecionar `modules`; se a coluna não existir, o PostgREST devolve erro, o `if (error || !membership)` vira 403 e **ninguém** usa o painel (lockout total). A Task 0 confere por SQL nos dois bancos antes de qualquer código.
- **Owner/admin/operator: zero mudança de comportamento.** `podeAcessar` e `paginaLiberada` devolvem `true` para qualquer papel ≠ `seller` antes de olhar caminho. Única mudança visível para eles: `POST /api/members` com papel desconhecido ou ausente passa a 400 (o único cliente, `painel/configuracoes/page.tsx:336`, manda `role: "operator"` explícito).
- **Fechado por padrão para `seller`:** rota fora do mapa = 403 (`getTenantContext`) ou `null` (`findMembershipTenantId`). Barra dupla, caixa diferente, segmento a mais ou a menos e método fora da lista não casam.
- Os nomes do contrato (`MODULOS_OPCIONAIS`, `ModuloOpcional`, `Modulo`, `Acesso`, `parseModulos`, `modulosDoAcesso`, `podeAcessar`, `paginaLiberada`, `ROTAS`, `PAGINAS`, `MENSAGEM_BLOQUEIO`, `TenantContext.modules`, `RouteTenantContext.authUserId/modules`, `useRole().modules/acesso`) são exatamente os do índice. Não renomear.
- Fora deste PR: menu, página e casca da vendedora (PR 5); convite de `seller` e `PATCH /api/members` (PR 6 — aqui `POST /api/members` continua recusando `seller` com 400); `api/vendas/*` (PR 4).
- 19 arquivos (13 de código, 6 de teste). Passa da régua de ~10 do `CLAUDE.md`, mas o escopo é o fixado no §8 da spec: guard sem os testes estruturais e sem a migração das rotas deixaria porta aberta no mesmo merge.

## Onde a spec/contrato e o código divergem (decidido neste plano)

1. **`api/notifications/alerts` não é rota de sessão.** A spec (§1) a lista entre as que "passam a usar `resolveSessionTenantId`". O código: `GET` protegido por `isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)` (L20), varre `memberships` só para **enumerar todas as lojas** (L26-32); `request-access-policy.ts:72` a classifica como `"cron"` e o `vercel.json` a agenda. Não existe sessão nem tenant de sessão para resolver. **O plano não a migra:** entra na allowlist com motivo "cron".
2. **`findMembershipTenantId` tem mais dois chamadores.** Além de `resolveSessionTenantId`: `app/api/subscription/route.ts:22` e `lib/media-auth.ts:23` — e o `media-auth` é o caminho de cookie de `POST /api/media/prepare` e `POST /api/media/register`, que estão no módulo `postar` (o `media-upload-client.ts` usa `fetch` puro, sem Bearer). Guardar só o `resolveSessionTenantId` deixaria esses dois sem guard. **A assinatura muda** de `(authUserId, requestedTenantId: string | null)` para `(authUserId, req: Request)` e os dois chamadores passam `req`; o contrato deles (null → 401/403 próprio) fica igual.
3. **`agents/copy` e `testimonials` usam `findMembershipTenantId(authUserId, req)`, não `resolveSessionTenantId(req)`.** As duas já chamam `getSessionAccountId()` para responder 401 sem sessão; `resolveSessionTenantId` leria o cookie de novo e juntaria "sem sessão" e "sem loja" no mesmo `null`. É o mesmo resolvedor guardado (o `resolveSessionTenantId` só delega para ele). Contrato de resposta preservado: 401 sem sessão, 403 `{ error: "Tenant não encontrado." }` sem loja, 200/201 iguais.
4. **`agents/copy` passa a resolver o tenant antes de gerar.** Hoje gera o texto e só depois lê `memberships` (L48-58) para contar uso — quem não tinha loja recebia o texto. Com o guard, a vendedora fora do mapa receberia o texto do agente mesmo com 403 na contagem. Agora: sem tenant → 403 antes do `generateCopy`. Nenhum componente em `src/` chama `/api/agents/copy` hoje (grep vazio).
5. **Nome novo para o PR 6: `parseInviteRole` em `lib/permissions.ts`.** O teste do `normalizeRole` estrito precisa de função pura: a rota importa `after` de `next/server`, e-mail e Supabase, e nenhum teste do repo importa route handler. A regra sai para `permissions.ts` (`parseInviteRole(raw: unknown): TenantRole | null`, com `INVITABLE_ROLES` privado). **O PR 6 acrescenta `"seller"` ali** — o índice ainda não lista esse nome.
6. **Papel ausente no `POST /api/members` também é 400.** Hoje `String(role ?? "operator")` faz ausente virar `operator`. O contrato do índice tem `role` obrigatório; o único cliente sempre manda.
7. **`papelEmPortugues` não muda.** O `PAPEIS` de `lib/painel/configuracoes.ts:13` é `Record<string, string>`, não exaustivo em `TenantRole`: o compilador não exige `seller`, e nenhum `Record<TenantRole, …>` existe no repo (grep). `seller` aparece como "Equipe" até o PR 6 (aba Equipe) acrescentar `seller: "Vendedora"`.
8. **Nenhum teste monta `TenantContext`/`RouteTenantContext` à mão nem mocka `getTenantContext`** (grep em `src/**/*.test.ts` e `e2e/` vazio em 07/10). Nada a atualizar; a Task 3 repete o grep.
9. **`lib/stores/orders.ts` e `lib/session.ts` ainda leem `memberships`** (saem no PR 1, do qual este PR não depende). Ficam na allowlist com motivo "sai no PR 1". O teste também falha com **entrada morta** (entrada que não cobre nenhuma leitura): quem mergear por último entre PR 1 e PR 3 apaga as duas linhas — o próprio teste aponta.
10. **`/api/vendas*` ainda não existe.** O teste estrutural 2 pula os padrões de `PENDENTES_DO_PR_4` e **falha se algum deles já existir** — o PR 4 é obrigado a esvaziar a lista quando criar as rotas.

## File Structure

Todos em `apps/web/`.

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/permissions.ts` | modificar | `TenantRole` com `seller`, ação `message:send`, `parseInviteRole` |
| `src/lib/permissions.test.ts` | criar | matriz da vendedora, `message:send`, convite estrito |
| `src/lib/auth/member-removal.ts` | modificar | importa `TenantRole` de `permissions.ts` |
| `src/lib/auth/modulos.ts` | criar | mapa de módulos, `podeAcessar`, `paginaLiberada`, `parseModulos` |
| `src/lib/auth/modulos.test.ts` | criar | tabela papel × rota × método × módulo |
| `src/lib/supabase/tenant-context.ts` | modificar | lê `modules`, guard 403, `TenantRole` importado |
| `src/lib/session-tenant.ts` | modificar | `findMembershipTenantId(authUserId, req)` com guard → `null` |
| `src/lib/route-tenant-context.ts` | modificar | `authUserId` e `modules` no contexto |
| `src/lib/media-auth.ts` | modificar | passa `req` |
| `src/app/api/subscription/route.ts` | modificar | passa `req` |
| `src/lib/auth/resolvedores-com-guard.test.ts` | criar | guard nos dois resolvedores contra Supabase de mentira |
| `src/app/api/members/route.ts` | modificar | papel desconhecido → 400 |
| `src/app/api/campanhas/[slug]/messages/route.ts` | modificar | `POST` usa `message:send` |
| `src/app/api/auth/me/route.ts` | modificar | devolve `modules` |
| `src/components/painel/role-provider.tsx` | modificar | `modules` e `acesso` |
| `src/app/api/agents/copy/route.ts` | modificar | tenant pelo resolvedor guardado, antes de gerar |
| `src/app/api/testimonials/route.ts` | modificar | tenant pelo resolvedor guardado |
| `src/lib/auth/memberships-allowlist.test.ts` | criar | estrutural 1 |
| `src/lib/auth/modulos-rotas.test.ts` | criar | estrutural 2 |

### Ondas (regra de subagentes paralelos)

| Onda | Tasks | Por quê |
|---|---|---|
| 0 | Task 0 | preparação (inclui o SQL de lockout) |
| 1 | Task 1 | `TenantRole` com `seller` é tipo de todo o resto |
| 2 | Task 2 ∥ Task 4 | arquivos disjuntos; os dois dependem só da Task 1 |
| 3 | Task 3 ∥ Task 7 | arquivos disjuntos; Task 3 depende de 1 e 2, Task 7 só de 2 |
| 4 | Task 5 ∥ Task 6 | arquivos disjuntos; os dois dependem da Task 3 |
| 5 | Task 8 | verificação, mutantes, revisão, PR |

Implementadores não commitam; o controller commita por task, na ordem da onda, com HEAD lido na hora.

---

### Task 0: preparação

**Files:** nenhum
**Depends-on:** PR 2 (`feat/vendedora-banco`) mergeado **e** aplicado em dev e prod
**Interfaces:** nenhuma

- [ ] **Step 1 (Igor — lockout):** conferir nos **dois** bancos que a coluna e o papel existem. Da pasta `apps\web` do worktree, em PowerShell:

```powershell
@'
select
  (select data_type || ' | ' || is_nullable || ' | ' || coalesce(column_default, '-')
     from information_schema.columns
    where table_schema = 'public' and table_name = 'memberships' and column_name = 'modules') as modules_col,
  (select string_agg(enumlabel, ',' order by enumsortorder)
     from pg_enum where enumtypid = 'public.member_role'::regtype) as roles,
  (select count(*) from pg_constraint where conname = 'memberships_modules_validos') as check_modules;
'@ | Set-Content -Encoding utf8 $env:TEMP\pr3-modulos.sql
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
supabase db query --linked -f $env:TEMP\pr3-modulos.sql
supabase link --project-ref nidoatbxaylrkcgbszns --yes
supabase db query --linked -f $env:TEMP\pr3-modulos.sql
```

  Esperado nos dois: `modules_col = "ARRAY | NO | '{}'::text[]"`, `roles = "owner,admin,operator,seller"`, `check_modules = 1`. **Qualquer diferença em qualquer banco: parar.** Mergear este PR sem a coluna em prod derruba todo mundo com 403; sem ela em dev, o e2e do CI cai inteiro.
- [ ] **Step 2:** no worktree da sessão (nunca o checkout principal; nunca `git worktree add` — o harness bloqueia escrever em outro worktree):
  - `git -C <worktree> status --short` → vazio;
  - `git -C <worktree> fetch origin main`;
  - `git -C <worktree> switch -c feat/vendedora-guard origin/main`;
  - `git -C <worktree> branch --unset-upstream` (a branch herda `origin/main` como upstream; o push vai com nome explícito).
- [ ] **Step 3:** `apps/web/node_modules` do worktree: `ls <worktree>/apps/web/node_modules | wc -l` > 0 e `ls <worktree>/apps/web/node_modules/next/headers.js` existe. Se não: junctions absolutas para o checkout principal (`cmd /c mklink /J "<worktree>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"` e o mesmo para `apps\web\node_modules`), e se o alvo estiver vazio, `npm ci` no worktree. O teste da Task 3 carrega `next/headers`: sem `apps/web/node_modules` ele falha por `Cannot find module`, não por asserção.
- [ ] **Step 4:** conferir a base que este plano assume (se algo divergir, parar e reler os arquivos):
  - `git -C <worktree> grep -n "export type TenantRole" apps/web/src` → exatamente `lib/permissions.ts:1`, `lib/supabase/tenant-context.ts:7`, `lib/auth/member-removal.ts:13`;
  - `git -C <worktree> grep -n "function normalizeRole" apps/web/src/app/api/members/route.ts` → L19;
  - `git -C <worktree> grep -n "assertCampaignOperator" "apps/web/src/app/api/campanhas/[slug]/messages/route.ts"` → L33, L130, L241;
  - `git -C <worktree> grep -n "findMembershipTenantId(" apps/web/src` → `session-tenant.ts` (L17, L42), `subscription/route.ts:22`, `media-auth.ts:23`;
  - `git -C <worktree> grep -n 'select("tenant_id, role")' apps/web/src/lib/supabase/tenant-context.ts` → L96;
  - `apps/web/src/lib/auth/modulos.ts` **não** existe; `apps/web/src/app/api/vendas` **não** existe (se existir, o PR 4 entrou antes: tirar de `PENDENTES_DO_PR_4` na Task 7 o que já existir).
- [ ] **Step 5:** `gh pr list --state open` — nenhuma outra sessão com PR aberto em `tenant-context.ts`, `session-tenant.ts`, `permissions.ts`, `members/route.ts` ou `role-provider.tsx`. E `gh pr list --state merged --head fix/orders-tenant-da-rota`: se o **PR 1 já está em `main`**, anotar — na Task 6 as duas linhas "sai no PR 1" da allowlist **não entram**.
- [ ] **Step 6 (Igor — card, prod):**

```sql
select key, status, blocker from public.board_features where key = 'acesso-vendedora';
-- Se não voltar linha (nenhum PR da série criou o card ainda):
insert into public.board_features (key, title, area, status, summary, priority) values
  ('acesso-vendedora', 'Acesso da vendedora (vendas por módulo)', 'Auth', 'nao_existe',
   'Papel seller com módulos liberados pelo dono; registra venda com itens.', 'alta')
on conflict (key) do nothing;

select public.move_card('acesso-vendedora', 'em_construcao',
  'PR 3 começou: guard de módulo (modulos.ts, guard nos 2 resolvedores, TenantRole único, message:send)',
  'feat/vendedora-guard');
```

---

### Task 1: papel `seller`, `message:send` e convite estrito (TDD)

**Files:** modificar `apps/web/src/lib/permissions.ts`, `apps/web/src/lib/auth/member-removal.ts`; criar `apps/web/src/lib/permissions.test.ts`
**Depends-on:** Task 0
**Interfaces (produz):** `type TenantRole = "owner" | "admin" | "operator" | "seller"`; `Action` com `"message:send"`; `parseInviteRole(raw: unknown): TenantRole | null`

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/permissions.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { hasPermission, parseInviteRole, type Action, type TenantRole } from "./permissions";

/** Exaustivo pelo tipo: ação nova que não entrar aqui não compila (tsc). */
const ACOES: Record<Action, true> = {
  "billing:manage": true,
  "billing:view": true,
  "team:invite": true,
  "team:remove": true,
  "campaign:delete": true,
  "campaign:create": true,
  "campaign:edit": true,
  "settings:connection": true,
  "settings:account": true,
  "account:delete": true,
  "message:send": true,
};

test("a vendedora só tem message:send na matriz", () => {
  for (const acao of Object.keys(ACOES) as Action[]) {
    assert.equal(hasPermission("seller", acao), acao === "message:send", acao);
  }
});

test("message:send vale para os quatro papéis; editar campanha continua sem a vendedora", () => {
  for (const papel of ["owner", "admin", "operator", "seller"] as TenantRole[]) {
    assert.equal(hasPermission(papel, "message:send"), true, papel);
  }
  assert.equal(hasPermission("operator", "campaign:edit"), true);
  assert.equal(hasPermission("seller", "campaign:edit"), false);
});

test("convite aceita admin e operator, sem ligar pra caixa e espaço", () => {
  assert.equal(parseInviteRole("admin"), "admin");
  assert.equal(parseInviteRole(" Operator "), "operator");
});

test("convite recusa owner, seller (o PR 6 libera), vazio e lixo — nada vira operator calado", () => {
  for (const lixo of ["owner", "seller", "", "gerente", null, undefined, 1, ["admin"]]) {
    assert.equal(parseInviteRole(lixo), null, JSON.stringify(lixo) ?? "undefined");
  }
});
```

- [ ] **Step 2:** em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/permissions.test.ts` → **FAIL** (`parseInviteRole is not a function`; `message:send` dá `false` para todo papel).
- [ ] **Step 3:** substituir `apps/web/src/lib/permissions.ts` inteiro (hoje 36 linhas) por:

```ts
export type TenantRole = "owner" | "admin" | "operator" | "seller";

export type Action =
  | "billing:manage"
  | "billing:view"
  | "team:invite"
  | "team:remove"
  | "campaign:delete"
  | "campaign:create"
  | "campaign:edit"
  | "settings:connection"
  | "settings:account"
  | "account:delete"
  | "message:send";

/**
 * O que cada papel faz DENTRO de uma rota. Quais rotas a vendedora (`seller`)
 * alcança é decidido antes, pelo mapa de `lib/auth/modulos.ts` (spec
 * acesso-vendedora §1, "Duas camadas"). Por isso `seller` aparece só em
 * `message:send`.
 */
const PERMISSIONS: Record<Action, TenantRole[]> = {
  "billing:manage": ["owner"],
  "billing:view": ["owner", "admin"],
  "team:invite": ["owner", "admin"],
  "team:remove": ["owner"],
  "campaign:delete": ["owner", "admin"],
  "campaign:create": ["owner", "admin", "operator"],
  "campaign:edit": ["owner", "admin", "operator"],
  "settings:connection": ["owner", "admin"],
  "settings:account": ["owner", "admin", "operator"],
  "account:delete": ["owner"],
  // POST /api/campanhas/[slug]/messages: postar na campanha sem poder editá-la.
  "message:send": ["owner", "admin", "operator", "seller"],
};

export function hasPermission(role: TenantRole, action: Action): boolean {
  return PERMISSIONS[action]?.includes(role) ?? false;
}

export function assertPermission(role: TenantRole, action: Action): void {
  if (!hasPermission(role, action)) {
    throw new Response("Sem permissão para esta ação.", { status: 403 });
  }
}

/** Papéis que entram por convite (POST /api/members). Dono nasce no cadastro, nunca por convite. */
const INVITABLE_ROLES: readonly TenantRole[] = ["admin", "operator"];

/**
 * Papel pedido no convite, ou `null` — a rota responde 400 "Função inválida.".
 *
 * Antes, papel desconhecido virava `operator` em silêncio: uma tela mandando
 * "seller" antes do backend aceitá-lo criaria um operador, com MAIS acesso que a
 * vendedora. O PR 6 da série acrescenta "seller" à lista.
 */
export function parseInviteRole(raw: unknown): TenantRole | null {
  if (typeof raw !== "string") return null;
  const role = raw.trim().toLowerCase();
  return INVITABLE_ROLES.find((r) => r === role) ?? null;
}
```

- [ ] **Step 4:** em `apps/web/src/lib/auth/member-removal.ts`, trocar a L13

```ts
export type TenantRole = "owner" | "admin" | "operator";
```

  por

```ts
import type { TenantRole } from "@/lib/permissions";
```

  (`permissions.ts` é puro, então o módulo continua carregando sob `tsx --test`; ninguém importa `TenantRole` de `member-removal` — `grep -rn "TenantRole.*member-removal" src` vazio.)
- [ ] **Step 5:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/permissions.test.ts src/lib/auth/member-removal.test.ts` → **PASS**.
- [ ] **Step 6 (controller):** `git -C <worktree> add apps/web/src/lib/permissions.ts apps/web/src/lib/permissions.test.ts apps/web/src/lib/auth/member-removal.ts`; em outra chamada `git -C <worktree> diff --cached --stat` (só os três); `git -C <worktree> commit -m "feat(auth): seller role and message:send in the permission matrix; strict invite role" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 2: mapa de módulos (TDD)

**Files:** criar `apps/web/src/lib/auth/modulos.ts`, `apps/web/src/lib/auth/modulos.test.ts`
**Depends-on:** Task 1 (tipo `TenantRole` com `seller`)
**Interfaces (produz, exatamente o contrato):** `MODULOS_OPCIONAIS`, `ModuloOpcional`, `Modulo`, `Acesso`, `parseModulos(raw: unknown): ModuloOpcional[]`, `modulosDoAcesso(acesso: Acesso): Modulo[]`, `podeAcessar(acesso: Acesso, pathname: string, method: string): boolean`, `paginaLiberada(acesso: Acesso, pathname: string): boolean`, `ROTAS`, `PAGINAS`, `MENSAGEM_BLOQUEIO`

**Decisão sobre páginas:** `paginaLiberada` casa por **prefixo de segmento** — `/painel/vendas` libera `/painel/vendas` e `/painel/vendas/qualquer/coisa`, nunca `/painel/vendasx` nem `/painel`. Página é só experiência (spec §1, "Página"): quem barra é a API, que casa segmento a segmento sem prefixo.

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/auth/modulos.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantRole } from "@/lib/permissions";
import {
  MENSAGEM_BLOQUEIO,
  MODULOS_OPCIONAIS,
  ROTAS,
  modulosDoAcesso,
  paginaLiberada,
  parseModulos,
  podeAcessar,
  type Acesso,
} from "./modulos";

const SO_VENDAS: Acesso = { role: "seller", modules: [] };
const COM_POSTAR: Acesso = { role: "seller", modules: ["postar"] };

/** [método, caminho, vendedora só com vendas, vendedora com postar] */
const TABELA: ReadonlyArray<readonly [string, string, boolean, boolean]> = [
  // base
  ["GET", "/api/auth/me", true, true],
  ["POST", "/api/auth/me", false, false],
  // vendas: sempre ligado para a vendedora
  ["GET", "/api/vendas", true, true],
  ["POST", "/api/vendas", true, true],
  ["GET", "/api/vendas/contato", true, true],
  ["PATCH", "/api/vendas/0b6c1d2e-7f80-4a1b-9c3d-5e6f7a8b9c0d", true, true],
  ["DELETE", "/api/vendas/0b6c1d2e-7f80-4a1b-9c3d-5e6f7a8b9c0d", true, true],
  // método errado
  ["DELETE", "/api/vendas", false, false],
  ["GET", "/api/vendas/0b6c1d2e-7f80-4a1b-9c3d-5e6f7a8b9c0d", false, false],
  ["PUT", "/api/vendas", false, false],
  ["HEAD", "/api/auth/me", false, false],
  // `*` é exatamente um segmento
  ["PATCH", "/api/vendas/a/b", false, false],
  ["GET", "/api/vendas/contato/extra", false, false],
  // barra no fim normaliza; barra dupla, caixa e prefixo parecido não passam
  ["GET", "/api/vendas/", true, true],
  ["GET", "/api/auth/me/", true, true],
  ["GET", "/api//vendas", false, false],
  ["GET", "/API/vendas", false, false],
  ["GET", "/api/vendasx", false, false],
  ["GET", "/api", false, false],
  ["GET", "/", false, false],
  // postar
  ["GET", "/api/campanhas", false, true],
  ["GET", "/api/groups", false, true],
  ["GET", "/api/disparos", false, true],
  ["GET", "/api/session", false, true],
  ["GET", "/api/library", false, true],
  ["POST", "/api/campanhas/promo-de-verao/messages", false, true],
  ["POST", "/api/media/prepare", false, true],
  ["POST", "/api/media/register", false, true],
  // postar não edita: criar/editar/apagar campanha, cancelar oferta, mexer no número
  ["POST", "/api/campanhas", false, false],
  ["PATCH", "/api/campanhas", false, false],
  ["DELETE", "/api/campanhas/promo-de-verao/messages", false, false],
  ["GET", "/api/campanhas/promo-de-verao/messages", false, false],
  ["POST", "/api/campanhas/promo-de-verao/messages/cancel", false, false],
  ["POST", "/api/groups", false, false],
  ["POST", "/api/session", false, false],
  ["GET", "/api/media", false, false],
  // fora do mapa
  ["GET", "/api/orders", false, false],
  ["GET", "/api/contatos", false, false],
  ["GET", "/api/members", false, false],
  ["GET", "/api/notifications", false, false],
  ["GET", "/api/subscription", false, false],
];

test("vendedora: rota × método × módulo", () => {
  for (const [metodo, caminho, soVendas, comPostar] of TABELA) {
    assert.equal(podeAcessar(SO_VENDAS, caminho, metodo), soVendas, `${metodo} ${caminho} (só vendas)`);
    assert.equal(podeAcessar(COM_POSTAR, caminho, metodo), comPostar, `${metodo} ${caminho} (com postar)`);
  }
});

test("o método chega em qualquer caixa", () => {
  assert.equal(podeAcessar(SO_VENDAS, "/api/vendas", "post"), true);
  assert.equal(podeAcessar(COM_POSTAR, "/api/campanhas", "get"), true);
});

test("toda rota do mapa abre para quem tem o módulo dela", () => {
  const tudo: Acesso = { role: "seller", modules: [...MODULOS_OPCIONAIS] };
  for (const rotas of Object.values(ROTAS)) {
    for (const { padrao, metodos } of rotas) {
      const caminho = padrao.replaceAll("*", "qualquer-id");
      for (const metodo of metodos) assert.equal(podeAcessar(tudo, caminho, metodo), true, `${metodo} ${caminho}`);
    }
  }
});

test("dono, admin e operador passam em tudo, com qualquer módulo", () => {
  for (const role of ["owner", "admin", "operator"] as TenantRole[]) {
    for (const [metodo, caminho] of TABELA) {
      assert.equal(podeAcessar({ role, modules: [] }, caminho, metodo), true, `${role} ${metodo} ${caminho}`);
    }
    assert.equal(paginaLiberada({ role, modules: [] }, "/painel/configuracoes"), true, role);
    assert.equal(paginaLiberada({ role, modules: [] }, "/painel"), true, role);
  }
});

test("páginas: vendas sempre, postar só liberado, por prefixo de segmento", () => {
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/vendas"), true);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/vendas/"), true);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/vendas/qualquer"), true);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/vendasx"), false);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel"), false);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/contatos"), false);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/disparos"), false);
  assert.equal(paginaLiberada(COM_POSTAR, "/painel/disparos"), true);
  assert.equal(paginaLiberada(COM_POSTAR, "/painel/campanhas"), false);
});

test("modulosDoAcesso: vendas implícito para a vendedora, nada para os outros", () => {
  assert.deepEqual(modulosDoAcesso(SO_VENDAS), ["vendas"]);
  assert.deepEqual(modulosDoAcesso(COM_POSTAR), ["vendas", "postar"]);
  assert.deepEqual(modulosDoAcesso({ role: "owner", modules: [] }), []);
});

test("parseModulos fica só com os opcionais conhecidos, sem repetir; lixo vira []", () => {
  assert.deepEqual(parseModulos(["postar"]), ["postar"]);
  assert.deepEqual(parseModulos(["postar", "postar"]), ["postar"]);
  assert.deepEqual(parseModulos(["postar", "xpto", 1, null]), ["postar"]);
  // `vendas` é implícito e nunca vem do banco; se vier, não vira opcional.
  assert.deepEqual(parseModulos(["vendas"]), []);
  assert.deepEqual(parseModulos(["POSTAR"]), []);
  for (const lixo of [null, undefined, "postar", "{postar}", {}, 42]) {
    assert.deepEqual(parseModulos(lixo), [], JSON.stringify(lixo) ?? "undefined");
  }
});

test("o mapa só tem padrão de /api sem barra no fim e método em maiúsculas", () => {
  for (const rotas of Object.values(ROTAS)) {
    for (const { padrao, metodos } of rotas) {
      assert.match(padrao, /^\/api(\/[^/]+)+$/, padrao);
      for (const metodo of metodos) assert.equal(metodo, metodo.toUpperCase(), `${padrao} ${metodo}`);
    }
  }
});

test("a mensagem de bloqueio é a do contrato", () => {
  assert.equal(MENSAGEM_BLOQUEIO, "Área não liberada para o seu acesso.");
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/modulos.test.ts` → **FAIL** (`Cannot find module './modulos'`).
- [ ] **Step 3:** criar `apps/web/src/lib/auth/modulos.ts`:

```ts
import type { TenantRole } from "@/lib/permissions";

/**
 * Acesso por módulo da vendedora (spec 2026-10-07-acesso-vendedora §1).
 *
 * Só vale para `seller`: dono, admin e operador passam direto, como sempre.
 * Para `seller` é FECHADO por padrão — rota fora deste mapa é 403, inclusive a
 * que alguém criar amanhã sem saber que a vendedora existe.
 *
 * Duas camadas, sem misturar: aqui é QUAL rota ela alcança; o que cada papel
 * faz dentro da rota continua em `lib/permissions.ts`.
 *
 * Sem `server-only`: o painel usa o mesmo mapa no menu e na guarda de página.
 */

export const MODULOS_OPCIONAIS = ["postar"] as const;
export type ModuloOpcional = (typeof MODULOS_OPCIONAIS)[number];
/** `vendas` é implícito para `seller` e nunca é gravado em `memberships.modules`. */
export type Modulo = "vendas" | ModuloOpcional;
export type Acesso = { role: TenantRole; modules: readonly ModuloOpcional[] };

export const MENSAGEM_BLOQUEIO = "Área não liberada para o seu acesso.";

/** `*` casa exatamente um segmento. Método sempre em maiúsculas. */
export const ROTAS: Readonly<
  Record<Modulo | "base", ReadonlyArray<{ padrao: string; metodos: readonly string[] }>>
> = {
  base: [{ padrao: "/api/auth/me", metodos: ["GET"] }],
  vendas: [
    { padrao: "/api/vendas/contato", metodos: ["GET"] },
    { padrao: "/api/vendas", metodos: ["GET", "POST"] },
    { padrao: "/api/vendas/*", metodos: ["PATCH", "DELETE"] },
  ],
  // O que `painel/disparos/page.tsx`, `folha-postar.tsx`, o upload do
  // `message-composer.tsx` (`media-upload-client.ts`) e o `copy-picker.tsx` chamam.
  postar: [
    { padrao: "/api/campanhas", metodos: ["GET"] },
    { padrao: "/api/groups", metodos: ["GET"] },
    { padrao: "/api/disparos", metodos: ["GET"] },
    { padrao: "/api/session", metodos: ["GET"] },
    { padrao: "/api/library", metodos: ["GET"] },
    { padrao: "/api/campanhas/*/messages", metodos: ["POST"] },
    { padrao: "/api/media/prepare", metodos: ["POST"] },
    { padrao: "/api/media/register", metodos: ["POST"] },
  ],
};

/** Páginas do /painel. Cada entrada libera a página e o que estiver embaixo dela. */
export const PAGINAS: Readonly<Record<Modulo, readonly string[]>> = {
  vendas: ["/painel/vendas"],
  postar: ["/painel/disparos"],
};

/** Filtra para os módulos opcionais conhecidos, sem repetição. Lixo vira []. */
export function parseModulos(raw: unknown): ModuloOpcional[] {
  if (!Array.isArray(raw)) return [];
  return MODULOS_OPCIONAIS.filter((modulo) => raw.includes(modulo));
}

/** seller → ["vendas", ...modules]; outros papéis → []. */
export function modulosDoAcesso(acesso: Acesso): Modulo[] {
  return acesso.role === "seller" ? ["vendas", ...acesso.modules] : [];
}

/**
 * Segmentos do caminho. Só a barra do fim sai (`/api/vendas/` = `/api/vendas`);
 * barra dupla no meio vira segmento vazio, que nenhum padrão casa.
 */
function segmentos(caminho: string): string[] {
  return caminho.replace(/\/+$/, "").split("/").slice(1);
}

function casa(padrao: string, caminho: readonly string[]): boolean {
  const partes = segmentos(padrao);
  return (
    partes.length === caminho.length &&
    partes.every((parte, i) => (parte === "*" ? caminho[i] !== "" : parte === caminho[i]))
  );
}

/** Papel ≠ seller → true. seller → rota da base ou de um módulo liberado, com o método certo. */
export function podeAcessar(acesso: Acesso, pathname: string, method: string): boolean {
  if (acesso.role !== "seller") return true;
  const caminho = segmentos(pathname);
  const verbo = method.toUpperCase();
  const liberados: ReadonlyArray<Modulo | "base"> = ["base", ...modulosDoAcesso(acesso)];
  return liberados.some((modulo) =>
    ROTAS[modulo].some((rota) => rota.metodos.includes(verbo) && casa(rota.padrao, caminho)),
  );
}

/**
 * Mesmo princípio para páginas do /painel, por prefixo de segmento:
 * `/painel/vendas` libera `/painel/vendas/qualquer`, não `/painel/vendasx`.
 * É só experiência — quem barra de verdade é a API.
 */
export function paginaLiberada(acesso: Acesso, pathname: string): boolean {
  if (acesso.role !== "seller") return true;
  const caminho = segmentos(pathname);
  return modulosDoAcesso(acesso).some((modulo) =>
    PAGINAS[modulo].some((pagina) => segmentos(pagina).every((parte, i) => parte === caminho[i])),
  );
}
```

- [ ] **Step 4:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/modulos.test.ts` → **PASS**.
- [ ] **Step 5 (controller):** `git -C <worktree> add apps/web/src/lib/auth/modulos.ts apps/web/src/lib/auth/modulos.test.ts`; `diff --cached --stat` em chamada separada; `git -C <worktree> commit -m "feat(auth): module map for the seller role (podeAcessar, paginaLiberada)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 3: guard nos dois resolvedores (TDD)

**Files:** modificar `apps/web/src/lib/supabase/tenant-context.ts`, `apps/web/src/lib/session-tenant.ts`, `apps/web/src/lib/route-tenant-context.ts`, `apps/web/src/lib/media-auth.ts`, `apps/web/src/app/api/subscription/route.ts`; criar `apps/web/src/lib/auth/resolvedores-com-guard.test.ts`
**Depends-on:** Task 1, Task 2
**Interfaces (produz):**
- `TenantContext = { authUserId: string; email: string | null; tenantId: string; role: TenantRole; modules: ModuloOpcional[] }`; `getTenantContext(req)` lança `new Response(MENSAGEM_BLOQUEIO, { status: 403 })` quando `!podeAcessar`.
- `findMembershipTenantId(authUserId: string, req: Request): Promise<string | null>` (era `(authUserId, requestedTenantId: string | null)`); `resolveSessionTenantId(req)` igual. Bloqueado → `null`.
- `RouteTenantContext = { tenantId; actor: "engine" | "user"; role: TenantRole | null; authUserId: string | null; modules: ModuloOpcional[] }` (engine: `null`, `[]`).
- `tenant-context.ts` **deixa de exportar** `TenantRole` (quem importava: `route-tenant-context.ts`, aqui; `members/route.ts`, na Task 4).

- [ ] **Step 1 (grep de testes que montam contexto):** `grep -rln "getTenantContext\|getRouteTenantContext\|TenantContext\|findMembershipTenantId" apps/web/src --include=*.test.ts apps/web/e2e` → vazio (conferido em 07/10). Se aparecer arquivo, ele monta/mocka contexto: acrescentar `modules: []` (e `authUserId: null` no de rota) no objeto e seguir.
- [ ] **Step 2 (teste):** criar `apps/web/src/lib/auth/resolvedores-com-guard.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { findMembershipTenantId } from "@/lib/session-tenant";
import { getTenantContext } from "@/lib/supabase/tenant-context";

/**
 * O guard de módulo nos dois resolvedores de tenant (spec acesso-vendedora §1),
 * com o cliente real do Supabase contra um servidor de mentira (desenho de
 * `broadcast-deliveries.test.ts`): o Bearer vira usuário em `/auth/v1/user` e a
 * membership sai de `/rest/v1/memberships`.
 *
 * Mutante: tirar o `podeAcessar` de `getTenantContext` ou de
 * `findMembershipTenantId` derruba os testes da vendedora fora do mapa.
 */

const USUARIO = "6f0c7c2e-1d4b-4a8e-9b2f-3c5d7e9a1b20";
let membership: { tenant_id: string; role: string; modules: unknown } | null = null;
const leituras: URL[] = [];

const supabase = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/auth/v1/user") {
    res.end(
      JSON.stringify({
        id: USUARIO,
        aud: "authenticated",
        email: "vendedora@loja.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-07T12:00:00Z",
      }),
    );
    return;
  }
  if (url.pathname === "/rest/v1/memberships") {
    leituras.push(url);
    res.end(JSON.stringify(membership ? [membership] : []));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: `rota inesperada no teste: ${url.pathname}` }));
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-service-do-teste";
  process.env.SUPABASE_ANON_KEY = "chave-anon-do-teste";
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  membership = null;
  leituras.length = 0;
});

function pedido(method: string, caminho: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${caminho}`, {
    method,
    headers: { authorization: "Bearer token-do-teste", ...headers },
  });
}

async function recusa(promessa: Promise<unknown>): Promise<Response> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof Response) return erro;
    throw erro;
  }
  return assert.fail("esperava a Response de recusa");
}

test("getTenantContext lê role e modules e deixa o dono em qualquer rota", async () => {
  membership = { tenant_id: "loja-a", role: "owner", modules: [] };
  const ctx = await getTenantContext(pedido("GET", "/api/orders"));
  assert.equal(leituras[0]?.searchParams.get("select"), "tenant_id,role,modules");
  assert.deepEqual(
    { authUserId: ctx.authUserId, tenantId: ctx.tenantId, role: ctx.role, modules: ctx.modules },
    { authUserId: USUARIO, tenantId: "loja-a", role: "owner", modules: [] },
  );
});

test("getTenantContext barra a vendedora fora do mapa com 403 e a mensagem do contrato", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: [] };
  for (const [metodo, caminho] of [["GET", "/api/orders"], ["DELETE", "/api/members"]] as const) {
    const resposta = await recusa(getTenantContext(pedido(metodo, caminho)));
    assert.equal(resposta.status, 403, `${metodo} ${caminho}`);
    assert.equal(await resposta.text(), MENSAGEM_BLOQUEIO);
  }
});

test("getTenantContext deixa a vendedora na base e nas vendas", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: [] };
  assert.equal((await getTenantContext(pedido("GET", "/api/auth/me"))).role, "seller");
  assert.equal((await getTenantContext(pedido("POST", "/api/vendas"))).tenantId, "loja-a");
});

test("getTenantContext: postar liberado abre o GET de campanhas, não o POST; lixo em modules some", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: ["postar", "xpto"] };
  assert.deepEqual((await getTenantContext(pedido("GET", "/api/campanhas"))).modules, ["postar"]);
  assert.equal((await recusa(getTenantContext(pedido("POST", "/api/campanhas")))).status, 403);
});

test("getTenantContext sem membership: o 403 de sempre, não o de módulo", async () => {
  const resposta = await recusa(getTenantContext(pedido("GET", "/api/auth/me")));
  assert.equal(resposta.status, 403);
  assert.equal(await resposta.text(), "Tenant nao encontrado ou sem permissao.");
});

test("findMembershipTenantId devolve null para a vendedora fora do mapa", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: [] };
  assert.equal(await findMembershipTenantId(USUARIO, pedido("GET", "/api/subscription")), null);
  assert.equal(leituras[0]?.searchParams.get("select"), "tenant_id,role,modules");
});

test("findMembershipTenantId: upload de mídia pelo cookie só com postar liberado", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: ["postar"] };
  assert.equal(await findMembershipTenantId(USUARIO, pedido("POST", "/api/media/prepare")), "loja-a");
  membership = { tenant_id: "loja-a", role: "seller", modules: [] };
  assert.equal(await findMembershipTenantId(USUARIO, pedido("POST", "/api/media/prepare")), null);
});

test("findMembershipTenantId continua honrando x-tenant-id; dono passa", async () => {
  membership = { tenant_id: "loja-b", role: "owner", modules: [] };
  const tenantId = await findMembershipTenantId(
    USUARIO,
    pedido("GET", "/api/subscription", { "x-tenant-id": "loja-b" }),
  );
  assert.equal(tenantId, "loja-b");
  assert.equal(leituras[0]?.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(leituras[0]?.searchParams.get("user_id"), `eq.${USUARIO}`);
});
```

- [ ] **Step 3:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/resolvedores-com-guard.test.ts` → **FAIL** por asserção (`select` = `tenant_id,role`; "esperava a Response de recusa"; `findMembershipTenantId` devolve `"loja-a"`). Se o erro for `Cannot find module 'next/headers'`, é o `node_modules` do worktree: voltar à Task 0, Step 3.
- [ ] **Step 4:** `apps/web/src/lib/supabase/tenant-context.ts`:
  - L1-5 (imports) passam a ser:

```ts
import "server-only";
import { cookies } from "next/headers";
import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";
import { SESSION_COOKIE, parseSession } from "@/lib/auth";
import { MENSAGEM_BLOQUEIO, parseModulos, podeAcessar, type ModuloOpcional } from "@/lib/auth/modulos";
import { isRevoked } from "@/lib/auth/session-revocation-store";
import type { TenantRole } from "@/lib/permissions";
```

  - L7-14 (`export type TenantRole …` e `TenantContext`) viram:

```ts
export type TenantContext = {
  authUserId: string;
  email: string | null;
  tenantId: string;
  role: TenantRole;
  /** Módulos opcionais liberados pelo dono. Só `seller` tem; os outros papéis vêm com []. */
  modules: ModuloOpcional[];
};
```

  - L92-117 (da `requestedTenantId` até o fim de `getTenantContext`) viram:

```ts
  const requestedTenantId = req.headers.get("x-tenant-id");

  let query = supabase
    .from("memberships")
    .select("tenant_id, role, modules")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (requestedTenantId) query = query.eq("tenant_id", requestedTenantId);

  const { data: memberships, error } = await query;
  const membership = memberships?.[0] as
    | { tenant_id: string; role: TenantRole; modules: unknown }
    | undefined;

  if (error || !membership) {
    throw new Response("Tenant nao encontrado ou sem permissao.", { status: 403 });
  }

  const modules = parseModulos(membership.modules);

  // Guard de módulo (spec acesso-vendedora §1). Para `seller`, rota fora do mapa
  // de `lib/auth/modulos.ts` é 403 — inclusive a criada amanhã. Os outros papéis
  // passam direto. `modules` é lido a cada request: o dono muda o acesso e vale
  // na próxima chamada dela, sem cache.
  if (!podeAcessar({ role: membership.role, modules }, new URL(req.url).pathname, req.method)) {
    throw new Response(MENSAGEM_BLOQUEIO, { status: 403 });
  }

  return {
    authUserId,
    email,
    tenantId: membership.tenant_id,
    role: membership.role,
    modules,
  };
}
```

  `assertBillingRole` (L119-123) não muda.
- [ ] **Step 5:** substituir `apps/web/src/lib/session-tenant.ts` inteiro por:

```ts
import "server-only";
import { parseModulos, podeAcessar } from "@/lib/auth/modulos";
import type { TenantRole } from "@/lib/permissions";
import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Tenant do usuário a partir da membership aceita, honrando `x-tenant-id`.
 *
 * Sem esse filtro a consulta devolve sempre a membership mais antiga: quem
 * pertence a mais de uma organização fica preso na primeira e nunca enxerga as
 * outras. Cinco rotas carregavam uma cópia própria desta query — todas sem o
 * filtro. Esta é a única implementação.
 *
 * Guard de módulo (spec acesso-vendedora §1): recebe o `req` inteiro porque a
 * vendedora (`seller`) só ganha o tenant numa rota do mapa de
 * `lib/auth/modulos.ts`, com o método certo. Fora do mapa = `null`, igual a não
 * ter membership.
 *
 * Devolve `null` em vez de lançar, ao contrário de `getTenantContext`: as rotas
 * que usam isto respondem lista vazia ou um 403 próprio, e trocar isso por um
 * 401 propagado mudaria o contrato delas.
 */
export async function findMembershipTenantId(
  authUserId: string,
  req: Request,
): Promise<string | null> {
  let query = getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id, role, modules")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  const requestedTenantId = req.headers.get("x-tenant-id");
  if (requestedTenantId) query = query.eq("tenant_id", requestedTenantId);

  const { data } = await query.maybeSingle();
  const membership = data as { tenant_id: string; role: TenantRole; modules: unknown } | null;
  if (!membership) return null;

  const acesso = { role: membership.role, modules: parseModulos(membership.modules) };
  return podeAcessar(acesso, new URL(req.url).pathname, req.method) ? membership.tenant_id : null;
}

/**
 * Idem, partindo do cookie de sessão. `null` quando não há sessão — o chamador
 * decide se isso vira lista vazia ou 403.
 */
export async function resolveSessionTenantId(req: Request): Promise<string | null> {
  const authUserId = await getSessionAccountId();
  if (!authUserId) return null;
  return findMembershipTenantId(authUserId, req);
}
```

- [ ] **Step 6:** os outros dois chamadores de `findMembershipTenantId` passam o `req`:
  - `apps/web/src/lib/media-auth.ts` L23: `const tenantId = await findMembershipTenantId(authUserId, req.headers.get("x-tenant-id"));` → `const tenantId = await findMembershipTenantId(authUserId, req);`
  - `apps/web/src/app/api/subscription/route.ts` L22: `tenantId = await findMembershipTenantId(authUserId, req.headers.get("x-tenant-id"));` → `tenantId = await findMembershipTenantId(authUserId, req);`
- [ ] **Step 7:** substituir `apps/web/src/lib/route-tenant-context.ts` inteiro por:

```ts
import "server-only";
import { ENGINE_TOKEN } from "@/lib/auth";
import type { ModuloOpcional } from "@/lib/auth/modulos";
import { getEngineTenantId } from "@/lib/engine-context";
import type { TenantRole } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export type RouteTenantContext = {
  tenantId: string;
  actor: "engine" | "user";
  role: TenantRole | null;
  /** Quem chamou. `null` quando é a engine. */
  authUserId: string | null;
  /** Módulos opcionais da membership (só `seller` tem). Engine: []. */
  modules: ModuloOpcional[];
};

export async function getRouteTenantContext(
  req: Request,
  options: { allowEngine: boolean },
): Promise<RouteTenantContext> {
  const engineToken = req.headers.get("x-engine-token");
  if (engineToken) {
    if (!options.allowEngine) {
      throw new Response("Rota não permitida para a engine.", { status: 403 });
    }
    if (ENGINE_TOKEN === "" || engineToken !== ENGINE_TOKEN) {
      throw new Response("Token da engine inválido.", { status: 401 });
    }

    let tenantId: string;
    try {
      tenantId = getEngineTenantId(req);
    } catch {
      throw new Response("Tenant da engine ausente ou inválido.", { status: 400 });
    }

    const { data: organization } = await getSupabaseAdmin()
      .from("organizations")
      .select("id, status")
      .eq("id", tenantId)
      .maybeSingle();

    if (!organization || (organization.status && organization.status !== "active")) {
      throw new Response("Tenant da engine não encontrado ou inativo.", { status: 403 });
    }

    return { tenantId, actor: "engine", role: null, authUserId: null, modules: [] };
  }

  const user = await getTenantContext(req);
  return {
    tenantId: user.tenantId,
    actor: "user",
    role: user.role,
    authUserId: user.authUserId,
    modules: user.modules,
  };
}
```

- [ ] **Step 8:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/resolvedores-com-guard.test.ts src/lib/auth/modulos.test.ts` → **PASS**. Depois `npx tsc --noEmit -p tsconfig.json` → limpo (a Task 4, da onda 2, já tirou de `members/route.ts` o `import type { TenantRole }` de `tenant-context`, que deixou de exportá-lo).
- [ ] **Step 9 (controller):** `git -C <worktree> add apps/web/src/lib/supabase/tenant-context.ts apps/web/src/lib/session-tenant.ts apps/web/src/lib/route-tenant-context.ts apps/web/src/lib/media-auth.ts apps/web/src/app/api/subscription/route.ts apps/web/src/lib/auth/resolvedores-com-guard.test.ts`; `diff --cached --stat` separado (seis arquivos); `git -C <worktree> commit -m "feat(auth): module guard in getTenantContext and findMembershipTenantId" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 4: convite estrito e `message:send` no POST de mensagem

**Files:** modificar `apps/web/src/app/api/members/route.ts`, `apps/web/src/app/api/campanhas/[slug]/messages/route.ts`
**Depends-on:** Task 1
**Interfaces (consome):** `parseInviteRole`, `TenantRole`, `Action` de `@/lib/permissions`. **Produz** (contrato PR 3 → PR 6): `POST /api/members` com papel desconhecido ou ausente → `400 { error: "Função inválida." }`.

Sem teste de rota: as duas importam `next/server`, e-mail e stores, e o repo não testa route handler (`src/lib/links/decisao.ts` explica). A decisão do papel está testada em `permissions.test.ts` (Task 1); aqui é fiação de duas linhas, coberta por tsc e pela revisão.

- [ ] **Step 1:** `apps/web/src/app/api/members/route.ts` (números de linha do arquivo original):
  - L6-8 (`getAppUrl`, `getSupabaseAdmin`, `tenant-context`) viram — a importação de `TenantRole` sai de `tenant-context`, que deixa de exportá-lo na Task 3:

```ts
import { getAppUrl } from "@/lib/environment";
import { parseInviteRole, type TenantRole } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";
```

  - apagar a L13 (`const INVITABLE_ROLES = new Set<TenantRole>(["admin", "operator"]);`) e a função `normalizeRole` inteira (L19-22). `normalizeEmail` (L15-17) fica.
  - L48-54 viram:

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

  - L202 (`target: { role: target.role as TenantRole, userId: target.user_id },`) não muda: o `TenantRole` agora vem de `@/lib/permissions`.
- [ ] **Step 2:** `apps/web/src/app/api/campanhas/[slug]/messages/route.ts`:
  - L9: `import { assertPermission, type TenantRole } from "@/lib/permissions";` → `import { assertPermission, type Action, type TenantRole } from "@/lib/permissions";`
  - L29-36 viram:

```ts
/**
 * `role` é nulo quando quem chama é a engine. Estas rotas são de painel
 * (`allowEngine: false`), então sem papel não há o que autorizar.
 */
function assertCampaignOperator(role: TenantRole | null, action: Action): asserts role is TenantRole {
  if (!role) throw new Response("Sem permissão para esta ação.", { status: 403 });
  assertPermission(role, action);
}
```

  - L129-130 (no `POST`) viram:

```ts
  // Postar é `message:send` (spec acesso-vendedora §1): a vendedora com o módulo
  // `postar` dispara, mas não cria, edita nem apaga campanha.
  assertCampaignOperator(ctx.role, "message:send");
```

  - L241 (no `DELETE`): `assertCampaignOperator(ctx.role);` → `assertCampaignOperator(ctx.role, "campaign:edit");`
  - `GET` (L39-58) não chama o helper e não muda. `messages/cancel/route.ts` usa `assertPermission(ctx.role, "campaign:edit")` direto (L25) e não muda.
- [ ] **Step 3:** `grep -n "campaign:edit\|message:send" "src/app/api/campanhas/[slug]/messages/route.ts"` → uma linha de cada (DELETE e POST). `grep -rn "normalizeRole\|INVITABLE_ROLES" src` → só `src/lib/permissions.ts`.
- [ ] **Step 4 (controller):** `git -C <worktree> add apps/web/src/app/api/members/route.ts "apps/web/src/app/api/campanhas/[slug]/messages/route.ts"`; `diff --cached --stat` separado; `git -C <worktree> commit -m "fix(members): unknown invite role is a 400, not a silent operator; campaign post uses message:send" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 5: `GET /api/auth/me` e `RoleProvider` com `modules`

**Files:** modificar `apps/web/src/app/api/auth/me/route.ts`, `apps/web/src/components/painel/role-provider.tsx`
**Depends-on:** Task 2, Task 3
**Interfaces (produz, contrato PR 3 → PR 5):** `GET /api/auth/me` → `{ userId, email, tenantId, tenantName, role, modules }`; `useRole()` ganha `modules: ModuloOpcional[]` e `acesso: Acesso | null` (null até `/api/auth/me` devolver o papel).

Sem teste unitário: rota e provider são fiação (o repo não renderiza componente em `npm test`, que só pega `.test.ts`). `ctx.modules` está provado em `resolvedores-com-guard.test.ts`; `parseModulos`, em `modulos.test.ts`.

- [ ] **Step 1:** `apps/web/src/app/api/auth/me/route.ts`, L25-31 viram:

```ts
    return NextResponse.json({
      userId: ctx.authUserId,
      email: ctx.email,
      tenantId: ctx.tenantId,
      tenantName: await tenantName(ctx.tenantId),
      role: ctx.role,
      modules: ctx.modules,
    });
```

- [ ] **Step 2:** substituir `apps/web/src/components/painel/role-provider.tsx` inteiro por:

```tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { parseModulos, type Acesso, type ModuloOpcional } from "@/lib/auth/modulos";
import type { TenantRole, Action } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

type RoleCtx = {
  role: TenantRole | null;
  /** Tenant ativo. Usado, entre outras coisas, para filtrar canais de Realtime. */
  tenantId: string | null;
  /** Nome da loja, como aparece no letreiro. null enquanto carrega ou sem nome. */
  tenantName: string | null;
  /** false até /api/auth/me responder (com sucesso ou erro): distingue "carregando" de "sem nome". */
  carregado: boolean;
  /** Módulos opcionais que o dono liberou (só a vendedora tem). [] até carregar. */
  modules: ModuloOpcional[];
  /** Pronto para `paginaLiberada`/`podeAcessar`. null até /api/auth/me devolver o papel. */
  acesso: Acesso | null;
  can: (action: Action) => boolean;
};

const RoleContext = createContext<RoleCtx>({
  role: null,
  tenantId: null,
  tenantName: null,
  carregado: false,
  modules: [],
  acesso: null,
  can: () => true,
});

export const useRole = () => useContext(RoleContext);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<TenantRole | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuloOpcional[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) setRole(data.role);
        if (data?.tenantId) setTenantId(String(data.tenantId));
        if (typeof data?.tenantName === "string") setTenantName(data.tenantName);
        setModules(parseModulos(data?.modules));
      })
      .catch(() => {})
      .finally(() => setCarregado(true));
  }, []);

  // Memo: um objeto novo a cada render faria efeito que depende de `acesso` rodar sem parar.
  const acesso = useMemo<Acesso | null>(() => (role ? { role, modules } : null), [role, modules]);

  const can = (action: Action): boolean => {
    if (!role) return true;
    return hasPermission(role, action);
  };

  return (
    <RoleContext.Provider value={{ role, tenantId, tenantName, carregado, modules, acesso, can }}>
      {children}
    </RoleContext.Provider>
  );
}
```

- [ ] **Step 3:** com a onda 4 fechada (a Task 6 mexe em rotas ao mesmo tempo): `npx tsc --noEmit -p tsconfig.json` → limpo; `npm run lint` → verde.
- [ ] **Step 4 (controller):** `git -C <worktree> add apps/web/src/app/api/auth/me/route.ts apps/web/src/components/painel/role-provider.tsx`; `diff --cached --stat` separado; `git -C <worktree> commit -m "feat(auth): /api/auth/me and RoleProvider expose modules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 6: rotas que liam `memberships` por conta própria + estrutural 1 (TDD)

**Files:** criar `apps/web/src/lib/auth/memberships-allowlist.test.ts`; modificar `apps/web/src/app/api/agents/copy/route.ts`, `apps/web/src/app/api/testimonials/route.ts`
**Depends-on:** Task 3 (`findMembershipTenantId(authUserId, req)`)
**Interfaces (consome):** `findMembershipTenantId`. Produz a lista `PERMITIDOS` (allowlist) que o PR 1 vai encolher.

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/auth/memberships-allowlist.test.ts`. **Se a Task 0, Step 5 achou o PR 1 em `main`, não incluir as duas últimas entradas ("sai no PR 1").**

```ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Estrutural 1 do acesso da vendedora (spec §1): tenant de sessão só nasce nos
 * dois resolvedores guardados (`getTenantContext` e `lib/session-tenant.ts`).
 * Quem lê `memberships` por conta própria fura o guard de módulo — a vendedora
 * alcançaria a rota mesmo fora do mapa de `lib/auth/modulos.ts`.
 *
 * Entrada terminada em "/" vale para a pasta inteira. Entrada que não cobre
 * nenhuma leitura também falha: lista que só cresce vira porta aberta.
 */
const PERMITIDOS: ReadonlyArray<{ caminho: string; motivo: string }> = [
  { caminho: "lib/supabase/tenant-context.ts", motivo: "resolvedor guardado: getTenantContext" },
  { caminho: "lib/session-tenant.ts", motivo: "resolvedor guardado: findMembershipTenantId" },
  { caminho: "app/api/members/", motivo: "gestão da equipe (lista, convida, remove, aceita convite)" },
  { caminho: "lib/auth/accept-pending-invite.ts", motivo: "aceite de convite no cadastro, antes de existir tenant" },
  { caminho: "app/api/auth/login/", motivo: "login: devolve loja e papel antes de existir sessão" },
  { caminho: "app/api/auth/signup/", motivo: "cadastro: cria a membership de dono" },
  { caminho: "app/api/auth/oauth-complete/", motivo: "login Google: acha ou cria a membership" },
  { caminho: "app/api/cron/emails/", motivo: "cron (CRON_SECRET): acha o dono de cada loja, sem sessão" },
  { caminho: "app/api/notifications/alerts/", motivo: "cron (CRON_SECRET): enumera as lojas, sem sessão" },
  { caminho: "app/api/admin/", motivo: "admin da plataforma (getAdminContext)" },
  { caminho: "app/admin/", motivo: "páginas do admin da plataforma" },
  { caminho: "lib/stores/orders.ts", motivo: "sai no PR 1 (getTenantId local)" },
  { caminho: "lib/session.ts", motivo: "sai no PR 1 (getSessionTenantId sem chamador)" },
];

/** apps/web/src — este arquivo mora em src/lib/auth. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEITURA = /\.from\(\s*["'`]memberships["'`]\s*\)/;

function cobre(caminho: string, arquivo: string): boolean {
  return caminho.endsWith("/") ? arquivo.startsWith(caminho) : arquivo === caminho;
}

const leitores = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .map((relativo) => relativo.split(sep).join("/"))
  .filter((arquivo) => /\.tsx?$/.test(arquivo) && !/\.test\.tsx?$/.test(arquivo))
  .filter((arquivo) => LEITURA.test(readFileSync(join(SRC, arquivo), "utf8")))
  .sort();

test("memberships só é lida onde a lista diz por quê", () => {
  const fora = leitores.filter((arquivo) => !PERMITIDOS.some((p) => cobre(p.caminho, arquivo)));
  assert.deepEqual(
    fora,
    [],
    "resolva o tenant por getTenantContext/getRouteTenantContext ou lib/session-tenant.ts — leitura direta fura o guard da vendedora",
  );
});

test("toda entrada da lista ainda cobre uma leitura", () => {
  const mortas = PERMITIDOS.filter((p) => !leitores.some((arquivo) => cobre(p.caminho, arquivo))).map(
    (p) => `${p.caminho} — ${p.motivo}`,
  );
  assert.deepEqual(mortas, [], "entrada sem leitura: apague da lista");
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/memberships-allowlist.test.ts` → **FAIL** no primeiro teste com exatamente `["app/api/agents/copy/route.ts", "app/api/testimonials/route.ts"]`. Se vier outro arquivo, é leitura nova que entrou em `main` depois de 07/10: ler o arquivo e decidir (migrar para o resolvedor guardado, ou entrada com motivo se for cron/admin/auth). Se o segundo teste falhar com as linhas "sai no PR 1", o PR 1 já entrou: apagar as duas.
- [ ] **Step 3:** substituir `apps/web/src/app/api/agents/copy/route.ts` inteiro por:

```ts
import { getSessionAccountId } from "@/lib/session";
import { findMembershipTenantId } from "@/lib/session-tenant";
import { generateCopy, type CopyInput } from "@/lib/agents/copy-agent";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = ["oferta", "novidade", "reativacao", "lancamento", "lembrete"] as const;
const VALID_TONES = ["direto", "divertido", "urgente", "premium"] as const;

export async function POST(req: Request) {
  const authUserId = await getSessionAccountId();
  if (!authUserId) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Tenant pelo resolvedor guardado, ANTES de gerar: quem não tem esta rota
  // liberada (a vendedora) não chega ao agente. Antes a rota lia `memberships`
  // por conta própria, depois de gerar, sem `x-tenant-id` e sem o guard.
  const tenantId = await findMembershipTenantId(authUserId, req);
  if (!tenantId) {
    return Response.json({ error: "Tenant não encontrado." }, { status: 403 });
  }

  let body: Partial<CopyInput>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  // Validation
  const type = body.type as CopyInput["type"];
  const tone = body.tone as CopyInput["tone"];
  const product = String(body.product ?? "").trim();

  if (!type || !VALID_TYPES.includes(type)) {
    return Response.json({ error: `Tipo inválido. Use: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!tone || !VALID_TONES.includes(tone)) {
    return Response.json({ error: `Tom inválido. Use: ${VALID_TONES.join(", ")}` }, { status: 400 });
  }
  if (!product || product.length < 2) {
    return Response.json({ error: "Informe o produto/serviço (mínimo 2 caracteres)." }, { status: 400 });
  }

  const input: CopyInput = {
    type,
    tone,
    product,
    price: body.price ? String(body.price) : undefined,
    discount: body.discount ? String(body.discount) : undefined,
    extraContext: body.extraContext ? String(body.extraContext).slice(0, 500) : undefined,
  };

  const result = await generateCopy(input);

  // Increment agent execution count (non-blocking)
  getSupabaseAdmin()
    .from("agent_configs")
    .upsert(
      {
        tenant_id: tenantId,
        agent_id: "copy",
        enabled: true,
        total_executions: 1,
        last_execution_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,agent_id" },
    )
    .then(({ error }) => {
      if (error) console.warn("[copy-agent] Failed to track execution:", error.message);
    });

  return Response.json(result);
}
```

- [ ] **Step 4:** `apps/web/src/app/api/testimonials/route.ts`:
  - L1-2 viram:

```ts
import { getSessionAccountId } from "@/lib/session";
import { findMembershipTenantId } from "@/lib/session-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/server";
```

  - L28-64 (de `const supabase = getSupabaseAdmin();` até o fim do `insert`) viram:

```ts
  // Tenant pelo resolvedor guardado (`x-tenant-id` + guard de módulo). Antes a
  // rota lia `memberships` por conta própria e pegava sempre a mais antiga.
  const tenantId = await findMembershipTenantId(authUserId, req);
  if (!tenantId) {
    return Response.json({ error: "Tenant não encontrado." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  // `users` tem uma linha por loja: sem o tenant, quem está em duas lojas cai
  // no erro de mais-de-uma-linha do maybeSingle e vira "Lojista".
  const { data: user } = await supabase
    .from("users")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  const { error } = await supabase.from("testimonials").insert({
    tenant_id: tenantId,
    name: user?.name ?? "Lojista",
    store: org?.name ?? "",
    quote,
    rating,
    consent_public: consentPublic,
    approved: false,
  });
```

  O resto (401 sem sessão, 400 de JSON/tamanho, 500 do insert, `201 { success: true }`) não muda.
- [ ] **Step 5:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/memberships-allowlist.test.ts` → **PASS**.
- [ ] **Step 6 (controller):** `git -C <worktree> add apps/web/src/lib/auth/memberships-allowlist.test.ts apps/web/src/app/api/agents/copy/route.ts apps/web/src/app/api/testimonials/route.ts`; `diff --cached --stat` separado; `git -C <worktree> commit -m "refactor(api): copy and testimonials resolve the tenant through the guarded resolver; memberships read allowlist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 7: estrutural 2 — mapa × `route.ts` × métodos (TDD)

**Files:** criar `apps/web/src/lib/auth/modulos-rotas.test.ts`
**Depends-on:** Task 2
**Interfaces (produz, para o PR 4):** `PENDENTES_DO_PR_4` — o PR 4 **esvazia** a lista quando cria `api/vendas/*` (o teste falha enquanto uma rota existir e continuar listada).

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/auth/modulos-rotas.test.ts`:

```ts
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ROTAS } from "./modulos";

/**
 * Estrutural 2 do acesso da vendedora (spec §1): cada padrão do mapa casa com um
 * `route.ts` real que exporta cada método liberado. Um typo no mapa deixaria o
 * módulo mudo — a vendedora com 403 numa tela que devia funcionar — sem ninguém ver.
 */

/** apps/web/src/app — este arquivo mora em src/lib/auth. */
const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app");

/**
 * Rotas do mapa que ainda não existem: nascem no PR 4 (`feat/vendas-api`).
 * O PR 4 esvazia esta lista — o teste falha se uma delas já existir.
 */
const PENDENTES_DO_PR_4: ReadonlySet<string> = new Set(["/api/vendas", "/api/vendas/contato", "/api/vendas/*"]);

/** Pastas que o padrão alcança. `*` desce em qualquer segmento dinâmico `[x]` (não catch-all). */
function pastas(padrao: string): string[] {
  let atuais = [APP];
  for (const parte of padrao.split("/").filter(Boolean)) {
    atuais = atuais.flatMap((pasta) => {
      if (parte !== "*") return existsSync(join(pasta, parte)) ? [join(pasta, parte)] : [];
      return readdirSync(pasta, { withFileTypes: true })
        .filter((item) => item.isDirectory() && /^\[[^.\]]+\]$/.test(item.name))
        .map((item) => join(pasta, item.name));
    });
  }
  return atuais;
}

function rotasDoPadrao(padrao: string): string[] {
  return pastas(padrao)
    .map((pasta) => join(pasta, "route.ts"))
    .filter((arquivo) => existsSync(arquivo));
}

function exporta(arquivo: string, metodo: string): boolean {
  const fonte = readFileSync(arquivo, "utf8");
  return new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${metodo}\\b`).test(fonte);
}

const ENTRADAS = Object.values(ROTAS).flat();

test("cada padrão do mapa tem route.ts que exporta cada método liberado", () => {
  for (const { padrao, metodos } of ENTRADAS) {
    if (PENDENTES_DO_PR_4.has(padrao)) continue;
    const arquivos = rotasDoPadrao(padrao);
    assert.ok(arquivos.length > 0, `${padrao}: nenhum route.ts em src/app${padrao}`);
    for (const metodo of metodos) {
      assert.ok(
        arquivos.some((arquivo) => exporta(arquivo, metodo)),
        `${metodo} ${padrao}: o route.ts não exporta ${metodo}`,
      );
    }
  }
});

test("pendente do PR 4 continua no mapa e ainda não existe", () => {
  for (const padrao of PENDENTES_DO_PR_4) {
    assert.ok(ENTRADAS.some((e) => e.padrao === padrao), `${padrao} saiu do mapa: tire de PENDENTES_DO_PR_4`);
    assert.deepEqual(
      rotasDoPadrao(padrao),
      [],
      `${padrao} já existe: tire de PENDENTES_DO_PR_4 para o teste conferir os métodos`,
    );
  }
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/modulos-rotas.test.ts` → **PASS** direto: é teste estrutural sobre rotas que já existem (as oito de `postar` e a da base, com os métodos; as três de `vendas` pendentes e inexistentes). O vermelho é provado no mutante 6 da Task 8. **Não** mexer em `modulos.ts` aqui, nem temporariamente: a Task 3 roda na mesma onda e importa esse arquivo.
- [ ] **Step 3 (controller):** `git -C <worktree> add apps/web/src/lib/auth/modulos-rotas.test.ts`; `diff --cached --stat` separado; `git -C <worktree> commit -m "test(auth): every route in the module map exists with its methods" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 8: verificação, mutantes, revisão, PR

**Files:** nenhum (correção da revisão volta à task dona do arquivo)
**Depends-on:** Tasks 1–7

- [ ] **Step 1:** em `apps/web`:
  - `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json` → limpos;
  - `npm run lint` → verde;
  - `npm test` → verde (inclui os seis arquivos novos).
- [ ] **Step 2 (greps):**
  - `grep -rn "export type TenantRole" src` → só `src/lib/permissions.ts:1`;
  - `grep -rn "TenantRole } from \"@/lib/supabase/tenant-context\"\|type TenantRole } from \"@/lib/supabase" src` → vazio;
  - `grep -rn "normalizeRole\|INVITABLE_ROLES" src` → só `src/lib/permissions.ts`;
  - `grep -rn "findMembershipTenantId(.*x-tenant-id" src` → vazio;
  - `grep -rn "server-only" src/lib/auth/modulos.ts` → vazio.
- [ ] **Step 3 (mutantes — cada um tem que derrubar teste; desfazer com `git -C <worktree> restore <arquivo>` logo depois):**
  1. `src/lib/supabase/tenant-context.ts`: comentar o bloco `if (!podeAcessar(...)) { throw new Response(MENSAGEM_BLOQUEIO, …) }` → `--test src/lib/auth/resolvedores-com-guard.test.ts` **FAIL** em "getTenantContext barra a vendedora fora do mapa…" e "postar liberado…".
  2. `src/lib/session-tenant.ts`: trocar a última linha de `findMembershipTenantId` por `return membership.tenant_id;` → mesmo arquivo **FAIL** em "findMembershipTenantId devolve null…" e "upload de mídia…".
  3. `src/lib/auth/modulos.ts`: em `casa`, apagar `partes.length === caminho.length &&` → `--test src/lib/auth/modulos.test.ts` **FAIL** (`GET /api/vendas/contato/extra`, `PATCH /api/vendas/a/b`).
  4. `src/app/api/orders/route.ts`: acrescentar no fim a linha `// .from("memberships")` → `--test src/lib/auth/memberships-allowlist.test.ts` **FAIL** listando `app/api/orders/route.ts`.
  5. `src/lib/permissions.ts`: acrescentar `"seller"` em `"campaign:edit"` → `--test src/lib/permissions.test.ts` **FAIL**.
  6. `src/lib/auth/modulos.ts`: trocar `"/api/disparos"` por `"/api/disparo"` → `--test src/lib/auth/modulos-rotas.test.ts` **FAIL** com `/api/disparo: nenhum route.ts`; restaurar e trocar `metodos: ["GET"]` do `/api/library` por `["GET", "DELETE"]` → **FAIL** com `DELETE /api/library`.
  Depois dos seis: `git -C <worktree> status --short` → vazio.
- [ ] **Step 4 (revisão):** dois agentes em paralelo sobre `git -C <worktree> diff origin/main...HEAD`: **Code Reviewer** (correção, contrato do índice) e **Security Engineer** (auth: fail-closed, bypass por caminho/método/`x-tenant-id`, rotas que resolvem tenant fora dos dois resolvedores). Corrigir CRITICAL/HIGH na task dona, com commit próprio.
- [ ] **Step 5:** `git -C <worktree> fetch origin main`; `git -C <worktree> log HEAD..origin/main --oneline` → vazio (senão `git -C <worktree> merge origin/main` e repetir os Steps 1–2; se o merge trouxe o PR 1, o estrutural 1 vai pedir para apagar as linhas "sai no PR 1"). Rodar o gate real em PowerShell, sem `2>&1`/`*>`:

```powershell
Set-Location <worktree>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  → `EXIT=0`.
- [ ] **Step 6 (push + PR):** `git -C <worktree> push -u origin HEAD:feat/vendedora-guard`. Corpo do PR em arquivo e `gh pr create`:

```powershell
@'
## O que muda
- `lib/auth/modulos.ts`: mapa de módulos da vendedora (`vendas` sempre; `postar` liberável), `podeAcessar` e `paginaLiberada`. Fechado por padrão para `seller`; os outros papéis passam direto.
- Guard nos dois resolvedores: `getTenantContext` (403 "Área não liberada para o seu acesso.") e `findMembershipTenantId` (`null`). `findMembershipTenantId` recebe o `req`; `subscription` e `media-auth` passam o `req`.
- `TenantRole` só em `permissions.ts`, com `seller`; ação nova `message:send` (POST de mensagem na campanha); `seller` em nenhuma outra ação.
- `POST /api/members`: papel desconhecido ou ausente → 400 "Função inválida." (antes virava `operator` calado).
- `/api/auth/me` e `RoleProvider` com `modules` (+ `acesso`).
- `agents/copy` e `testimonials` resolvem o tenant pelo resolvedor guardado (o `copy` antes de gerar).
- Testes estruturais: allowlist de `.from("memberships")`; mapa × `route.ts` × métodos (`/api/vendas*` pendentes do PR 4).

## Fora deste PR
Tela, menu e casca da vendedora (PR 5), convite de vendedora (PR 6), API de vendas (PR 4). Ninguém consegue criar `seller` até o PR 6.

## Pré-requisito conferido
PR 2 aplicado em dev e prod: `memberships.modules` e `member_role` com `seller` (SQL da Task 0).

## Teste
- unit: permissions, modulos, resolvedores contra Supabase de mentira, 2 estruturais
- tsc x2, lint, npm test, verify-local.ps1
- mutantes: guard do getTenantContext, guard do findMembershipTenantId, casamento por segmento, leitura nova de memberships, seller em campaign:edit, typo/método errado no mapa — todos derrubam teste

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@ | Set-Content -Encoding utf8 $env:TEMP\pr3-corpo.md
gh pr create --repo codingB0y/Girumo --base main --head feat/vendedora-guard --title "feat(auth): module guard for the seller role (acesso da vendedora, PR 3)" --body-file $env:TEMP\pr3-corpo.md
```

- [ ] **Step 7 (CI + merge):** `gh pr checks <N> --repo codingB0y/Girumo --watch` até verde. Vermelho por corrida no banco dev (`processing`) → `gh pr update-branch <N> --repo codingB0y/Girumo`. `main` não tem proteção: **sem auto-merge**; no verde, `gh pr merge <N> --repo codingB0y/Girumo --squash --delete-branch`.
- [ ] **Step 8 (produção — sem lockout):** em `/admin/configuracoes` (Deploy), o commit do merge no ar. Logado como dono (Igor): `/painel` abre, Disparos lista as campanhas, e no DevTools `await (await fetch("/api/auth/me")).json()` devolve `role: "owner"` e `modules: []`. Não gravar nada.
- [ ] **Step 9 (fechamento):** "Comandos para o Igor" abaixo; encerrar com "PRs que deixei abertos: …" (ou "nenhum").

#### Comandos para o Igor

Se o classificador barrar push/merge do agente, rodar nesta ordem (PowerShell, de qualquer pasta):

```powershell
git -C <worktree> push -u origin HEAD:feat/vendedora-guard
gh pr create --repo codingB0y/Girumo --base main --head feat/vendedora-guard --title "feat(auth): module guard for the seller role (acesso da vendedora, PR 3)" --body-file $env:TEMP\pr3-corpo.md
gh pr checks <N> --repo codingB0y/Girumo --watch
gh pr merge <N> --repo codingB0y/Girumo --squash --delete-branch
```

Depois do merge e do Step 8 (prod, SQL):

```sql
select public.move_card('acesso-vendedora', 'em_construcao',
  'PR 3 mergeado: guard de módulo nos 2 resolvedores, TenantRole único, message:send, convite com papel estrito. Dono confere /api/auth/me com modules [] em prod. Vendedora ainda não pode ser convidada (PR 6).',
  'PR #<N>');
update public.board_features set blocker = null where key = 'acesso-vendedora';
```

Registro da decisão no grafo:

```powershell
rag insert "decisão: acesso da vendedora — guard de módulo em getTenantContext e findMembershipTenantId(authUserId, req), mapa em lib/auth/modulos.ts, fechado por padrão para seller; memberships só é lida na allowlist de lib/auth/memberships-allowlist.test.ts; TenantRole só em permissions.ts; seller só em message:send; convite com papel desconhecido = 400" --source decisao-2026-10-07
```

## Riscos

- **Lockout se a coluna faltar.** Coberto pela Task 0, Step 1. Se um dia `modules` sumir (rollback do PR 2 sem rollback deste), todo usuário toma 403: o rollback do PR 2 exige reverter este antes.
- **Rotas que engolem o 403.** `GET /api/auth/account` faz `catch { return 401 }` (L27): para a vendedora, a recusa chega como 401, não 403. Continua negado; a casca do PR 5 não chama essa rota.
- **O estrutural 1 só vê `.from("memberships")` literal.** `lib/billing/capability-limits.ts:78` usa `"memberships"` como nome de tabela para contar membros do plano por tenant — não resolve tenant de sessão, não precisa entrar. Uma leitura por variável (`.from(tabela)`) passaria pelo teste; a revisão de segurança da Task 8 é a segunda linha.
- **`HEAD`/`OPTIONS` da vendedora dão 403.** Fechado de propósito: nenhuma tela dela usa.
- **Entre este merge e o PR 5, `can()` devolve `true` com `role` nulo** (comportamento de hoje): sem efeito, porque ainda não existe `seller` para convidar até o PR 6.
- **PR 1 × PR 3 na allowlist.** Quem mergear por último apaga as linhas "sai no PR 1" — o teste de entrada morta aponta. Se o PR 1 mergear sem atualizar a branch (`main` sem proteção), a `main` fica vermelha no `npm test` até alguém apagar as duas linhas.
