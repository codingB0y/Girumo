# Postar por grupo — PR 2 (link) e PR 3 (recontagem) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (PR 2) O link mestre `/r/` e `/c/` de campanha passa a mandar gente só para o grupo que o banco marca como `enchendo` (nunca para um lotado; o reaberto tem prioridade), lendo `public.campaign_group_states` em vez da lista inteira de grupos da loja; o auto-grow para de tratar grupo lotado como folga e o grupo que ele cria nasce com a contagem conferida, para o webhook somar membros nele e ele poder lotar sozinho; o claim legado de disparos nunca pega disparo com regra. (PR 3) Uma recontagem diária dos grupos de cada loja com número conectado corrige a contagem que o webhook perdeu — sem ela a marca automática de lotado nunca vem.

**Architecture:** PR 2 cria `lib/groups/estado.ts` (tipos, rótulos e a tradução da linha da RPC, sem `server-only`) e `lib/stores/campaign-group-states.ts` (`listCampaignGroupStates`, `server-only`), que os PRs 4, 5 e 9 consomem. `resolve-click-target.ts` ganha `ResolvableGroup.estado`, `toResolvableGroup` e o alvo `remembered ?? groups.find(estado === "enchendo") ?? null`; `short-link-click.ts` troca `groupsStore.listGroups` pela RPC. A aba "Link e cliques" do painel (único outro consumidor de `resolveClickTarget`, no cliente) recebe uma aproximação explícita (`withSequentialEstado`) até o PR 4. No auto-grow, `PoolGroup.lotadoEm` chega ao `hasHeadroom`, e `registerGrownGroup` grava `admins_total/ours = 1` e `admins_counted_at = now()`. PR 3 extrai o núcleo de `POST /api/groups/sync` para `lib/groups/sincronizar.ts` (`sincronizarGrupos(tenantId, { somenteContagem })`), usado pela rota de sempre e por `POST /api/groups/recount` (engine-only); o worker ganha o loop `recontagem` (1×/dia, uma loja por vez, nasce em DRY-RUN).

**Tech Stack:** Next.js 15 (App Router, route handlers `runtime = "nodejs"`), `@supabase/supabase-js` 2.108 (service-role), `@upstash/redis` 1.38 (trava do #397), `node:test` via `tsx` com o shim de `server-only`, worker Node (ESM/NodeNext) em `apps/worker`, deploy do worker pelo Coolify (compose do git).

**Spec:** `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` (§3 vocabulário, §4 um lugar só, §6.1 link, §6.2 auto-grow, §6.3 recontagem, §7 bordas, §8 testes, §9 fatias) · contrato vinculante: `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md` (§1 banco do PR 1, §3 TypeScript compartilhado, §4 rota `POST /api/groups/recount`, §5 env do worker). Se este plano e o contrato divergirem, o contrato vence.

## Global Constraints

Do spec e dos contratos (valores literais):

- `limiar(capacity) = (capacity > 0 ? capacity : 1024) × 0,95` — calculado **só** no SQL (`app.limiar_lotado`); o TS não recalcula estado nem regra (spec §4).
- Estados: `'lotado' | 'enchendo' | 'fila' | 'vazio'`. Regras: `'menos_enchendo' | 'lotados' | 'com_gente'`.
- Linha `EstadoRow`, nesta ordem: `posicao integer, group_id uuid, whatsapp_group_id text, name text, members integer, capacity integer, is_admin boolean, invite_url text, lotado_em timestamptz, lotado_por text, reaberto_em timestamptz, aviso_lotou_em timestamptz, estado text, pode_reabrir boolean, na_regra_menos_enchendo boolean, na_regra_lotados boolean, na_regra_com_gente boolean`.
- RPC: `public.campaign_group_states(p_tenant uuid, p_campaign uuid)`, `security definer`, execute **só** `service_role` (criada pelo PR 1 — este plano não muda banco).
- `apps/web/src/lib/groups/estado.ts`: sem `server-only`, exporta `EstadoDoGrupo`, `RegraDestino`, `REGRAS`, `EstadoGrupo`, `EstadoRow`, `estadoFromRow`, `ROTULO_ESTADO`, `ROTULO_REGRA`, `isRegraDestino` com as assinaturas do contrato §3.
- `apps/web/src/lib/stores/campaign-group-states.ts`: `server-only`, `listCampaignGroupStates(tenantId: string, campaignId: string): Promise<EstadoGrupo[]>` (PR 4 acrescenta `marcarGrupoLotado` e `reabrirGrupo` no mesmo arquivo).
- `ResolvableGroup` ganha `estado?: EstadoDoGrupo`; alvo do link mestre = `remembered ?? groups.find((g) => g.estado === "enchendo") ?? null`.
- Grupo lembrado **continua vencendo mesmo lotado** (`resolve-click-target.ts:117-126`); `diagnosePool` igual; "todos lotados" cai em `all-full`.
- Modo JSON (`legacyGet`, `HUBFLOW_USE_SUPABASE=0`) fora de escopo: continua com a lógica antiga.
- `hasHeadroom`: grupo com `lotado_em` conta **sem vaga**, mesmo abaixo de 90%; **não** filtrar do pool.
- `registerGrownGroup`: `admins_counted_at = now()` no insert e no update.
- Claim legado (`claimPendingBroadcasts`): `.is("target_rule", null)`.
- `POST /api/groups/recount` — engine-only, header `x-tenant-id`, resposta `{ ok: true, atualizados: number }`; entra no `ENGINE_ONLY` de `request-access-policy.ts`.
- `sincronizarGrupos(tenantId, { somenteContagem })`: com `somenteContagem`, atualiza `members` (com `escolherContagem`) e `admins_*`; não enfileira `check_invite` nem mexe em convite. Respeita a trava de um sync por número (#397).
- Worker: `WORKER_RECOUNT_INTERVAL_MS` padrão `86_400_000`, mínimo `3_600_000`; lojas com instância conectada, uma por vez.

Do repositório:

- Código, identificadores e commits em inglês, exceto o vocabulário de domínio que já é pt-BR (`estado`, `enchendo`, `sincronizarGrupos`, `somenteContagem`, do contrato). Texto de tela, log e comentário em pt-BR. Commits com prefixo semântico e terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (segundo `-m`).
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; suíte `npm test`; tipos (os **dois** — lint e tsx não checam tipo) `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; Vitrine `npx tsx scripts/check-painel-vitrine.ts`.
- Em `apps/worker`: unit `npx tsx --test <arquivo>`; suíte `npm test`; tipos `npx tsc --noEmit -p tsconfig.json` (o `verify-local.ps1` não checa tipo do worker).
- Antes do push: `infra/scripts/verify-local.ps1` (é o gate real; o `verify` do CI é pulado na `main`). Sem `2>&1` nem `*>`.
- `<wt>` = raiz do worktree da sessão (impressa no primeiro Step de cada PR); substituir literalmente. Todo git é `git -C <wt>`; nunca `cd` + `git`. Nunca `git add -A`; `git -C <wt> diff --cached --stat` numa chamada **separada** antes de cada commit. Terminal é PowerShell 5.1: sem `&&`/`||`, sem `grep`/`head`/`curl` sem `.exe`.
- PR: base `main`, um por vez, fechado na mesma sessão (revisar → CI verde → mergear → apagar branch). Merge **à mão** no verde (`gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`); **nunca** ligar o auto-merge do GitHub (a `main` não tem proteção e mergearia na hora). `gh pr create` sempre com `--head`.
- Push, merge, DML/consulta em prod passam pelo Igor (o classificador barra); juntar no fim, em "Comandos para o Igor".

## Review Focus

Os cinco defeitos mais prováveis que nenhum teste de task pegaria sem esta lista — cada um ganhou um teste na task dona:

1. **O estado se perde no caminho do clique.** Se `short-link-click.ts` mapear a linha da RPC para `ResolvableGroup` sem o `estado` (ou continuar em `groupsStore.listGroups`), nenhum grupo é `enchendo` e **todo** link mestre responde "Todos os grupos desta campanha estão cheios". `tsc` não pega (`estado` é opcional). → Task 4 (`toResolvableGroup` + ida e volta `estadoFromRow → toResolvableGroup → resolveClickTarget`) e Task 5 (`short-link-click.test.ts`: o clique vai para o `enchendo`, pula o lotado com vaga, e a RPC leva o tenant da linha do link).
2. **A aba "Link e cliques" do painel quebra calada.** `components/painel/campanhas/detalhe/link-e-cliques.tsx:53` chama `resolveClickTarget` no cliente com os grupos da loja, **sem estado**. Com o alvo novo, a aba diria "Nenhum grupo agora"/"todos cheios" em toda campanha. O spec não cita esse consumidor. → Task 4 (`withSequentialEstado` marca o mesmo grupo que a sequência antiga escolheria, e o resolvedor o devolve) e Task 5 (a aba passa a usar a função).
3. **RPC ausente vira campanha vazia em silêncio.** O PR 2 vai ao ar no merge (Vercel); se o PR 1 não estiver aplicado em **prod**, a RPC responde `PGRST202`. Um store que devolvesse `[]` faria todo link dizer "campanha não está aberta" sem erro nenhum no log. → Task 3 (RPC que falha **lança**, nunca `[]`) e o portão de SQL em prod antes do merge (Task 1 Step 3 em dev, Task 9 "Comandos para o Igor" em prod).
4. **Recontagem e Sincronizar disputando o mesmo número.** O incidente do #397: a segunda chamada pesada na mesma instância entra na fila da Evolution atrás da primeira e as duas estouram o tempo. A recontagem roda na subida do worker e 1×/dia; o lojista pode estar clicando "Sincronizar" na mesma hora. → Task 11 (trava ocupada → 409 sem tocar na Evolution e sem soltar a trava alheia; trava liberada quando a Evolution falha).
5. **A extração muda o botão, ou a recontagem herda o botão inteiro.** Mover ~240 linhas da rota para `sincronizar.ts` sem teste deixaria o Sincronizar regredir calado; e reusar o caminho completo na recontagem importaria grupo novo, apagaria não-admin e enfileiraria `check_invite` de madrugada. → Task 11 (teste do modo completo: importa o novo, apaga o de terceiro, pede o convite que falta, agenda participantes para depois da resposta; teste da recontagem: só grupos já gravados, payload só de contagem, nenhuma escrita além do upsert e do log).

## File Structure

### PR 2 — `feat/postar-grupo-link`

| Arquivo (em `apps/web/`) | Ação | Responsabilidade | Task |
|---|---|---|---|
| `src/lib/groups/estado.ts` | criar | tipos, rótulos e leitura da linha da RPC (contrato §3) | 2 |
| `src/lib/groups/estado.test.ts` | criar | teste do mapeamento e dos rótulos | 2 |
| `src/lib/stores/campaign-group-states.ts` | criar | `listCampaignGroupStates` sobre a RPC | 3 |
| `src/lib/stores/campaign-group-states.test.ts` | criar | PostgREST falso: corpo da RPC e erro | 3 |
| `src/lib/links/resolve-click-target.ts` | modificar | `estado`, `toResolvableGroup`, `withSequentialEstado`, alvo `enchendo` | 4 |
| `src/lib/links/resolve-click-target.test.ts` | modificar | fixtures com estado + casos novos | 4 |
| `src/lib/links/resolve-click-target.entrada.test.ts` | modificar | fixtures com estado + lembrado lotado à mão | 4 |
| `src/lib/links/short-link-click.ts` | modificar | lê `campaign_group_states` | 5 |
| `src/lib/links/short-link-click.test.ts` | criar | o clique inteiro contra o PostgREST falso | 5 |
| `src/components/painel/campanhas/detalhe/link-e-cliques.tsx` | modificar | aproximação explícita até o PR 4 | 5 |
| `src/lib/groups/grow-headroom.ts` | modificar | `lotadoEm` sem folga | 6 |
| `src/lib/groups/grow-headroom.test.ts` | modificar | casos do lotado | 6 |
| `src/lib/stores/groups.ts` | modificar | `Group.lotado_em`; `GroupUpsert` aceita `admins_*` | 7 |
| `src/lib/group-grow-store.ts` | modificar | `lotadoEm` no pool; grupo criado nasce contado | 7 |
| `src/lib/group-grow-store.test.ts` | criar | PostgREST falso: ack e avaliação | 7 |
| `src/lib/stores/broadcasts.ts` | modificar | `.is("target_rule", null)` no claim legado (se o PR 1 não fez) | 8 |
| `src/lib/stores/broadcasts.test.ts` | criar | filtros do claim legado | 8 |

### PR 3 — `feat/postar-grupo-recontagem`

| Arquivo | Ação | Responsabilidade | Task |
|---|---|---|---|
| `apps/web/src/lib/stores/groups.ts` | modificar | `updateGroupCounts` | 11 |
| `apps/web/src/lib/groups/sincronizar.ts` | criar | núcleo do sync, dois modos | 11 |
| `apps/web/src/lib/groups/sincronizar.test.ts` | criar | PostgREST + Evolution + Upstash falsos | 11 |
| `apps/web/src/app/api/groups/sync/route.ts` | modificar | delega a `sincronizarGrupos` | 12 |
| `apps/web/src/app/api/groups/recount/route.ts` | criar | rota engine-only | 13 |
| `apps/web/src/app/api/groups/recount/route.test.ts` | criar | engine entra, dono não, resposta do contrato | 13 |
| `apps/web/src/lib/security/request-access-policy.ts` | modificar | `ENGINE_ONLY` | 13 |
| `apps/web/src/lib/security/request-access-policy.test.ts` | modificar | a rota é engine-only | 13 |
| `apps/worker/src/env.ts` | modificar | `recountEnabled`, `recountIntervalMs` | 14 |
| `apps/worker/src/env.test.ts` | modificar | padrão e mínimo | 14 |
| `apps/worker/src/recount-loop.ts` | criar | loop, deps, tenants, DRY-RUN | 15 |
| `apps/worker/src/recount-loop.test.ts` | criar | deps falsas | 15 |
| `apps/worker/src/index.ts` | modificar | liga o loop | 15 |
| `deploy/coolify/worker.docker-compose.yml` | modificar | repassa as duas variáveis | 15 |

### Divisão sugerida (passa da régua de ~10 arquivos)

PR 2 tem 17 arquivos (8 de teste) e PR 3 tem 14 (6 de teste). Se o controller quiser respeitar a régua:

| Bloco | Tasks | Arquivos | Branch | Depende de |
|---|---|---|---|---|
| 2A — link | 1–5, 8, 9 | 12 | `feat/postar-grupo-link` | PR 1 em dev **e** prod |
| 2B — auto-grow | 6–7 (+ Task 9 repetida) | 5 | `feat/postar-grupo-grow` | PR 1 em dev **e** prod |
| 3A — rota | 10–13, 16 | 8 | `feat/postar-grupo-recontagem` | — |
| 3B — worker | 14–15 (+ Task 16 repetida) | 6 | `feat/postar-grupo-recontagem-worker` | 3A mergeado e no ar |

Sem dividir, seguir o plano em ordem: uma branch por PR.

---

## PR 2 — link pelo estado + auto-grow (branch `feat/postar-grupo-link`)

### Task 1: worktree, branch, PR 1 no banco, dependências e card

**Files:** nenhum.
**Depends-on:** —
**Interfaces:** Consumes: `public.campaign_group_states(p_tenant uuid, p_campaign uuid)` e as colunas `groups.lotado_em`, `broadcasts.target_rule` (PR 1). Produces: —.

- [ ] **Step 1:** na sessão (que já roda num worktree — não criar outro, `finding-harness-bloqueia-escrita-em-outro-worktree`):

```powershell
git rev-parse --show-toplevel
```

  Anotar a saída como `<wt>`. Daqui em diante todo `git` é `git -C <wt>`.

- [ ] **Step 2:** atualizar e conferir que o PR 1 está em `main`:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> ls-tree --name-only origin/main apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql
```

  Esperado: o caminho impresso. Vazio → **parar** e perguntar ao Igor: o PR 1 não mergeou.

  Anotar se o PR 1 já pôs a guarda no claim legado (spec §9 a lista no PR 1):

```powershell
git -C <wt> grep -n "target_rule" origin/main -- apps/web/src/lib/stores/broadcasts.ts
```

  Uma linha com `.is("target_rule", null)` → a Task 8 vira "já entregue" (pular). Vazio → a Task 8 roda.

- [ ] **Step 3:** conferir que a migração do PR 1 está aplicada em **dev** (leitura em dev passa no classificador; `tecnica-supabase-cli-sql-nos-dois-bancos`). Gravar o SQL sem BOM:

```powershell
$sql = @'
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'groups'
       and column_name in ('lotado_em', 'lotado_por', 'reaberto_em', 'aviso_lotou_em')) as colunas_groups,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'broadcasts' and column_name = 'target_rule') as coluna_target_rule,
  pg_get_function_identity_arguments('public.campaign_group_states(uuid, uuid)'::regprocedure) as rpc_argumentos,
  pg_get_function_result('public.campaign_group_states(uuid, uuid)'::regprocedure) as rpc_colunas,
  has_function_privilege('service_role', 'public.campaign_group_states(uuid, uuid)', 'execute') as service_role_executa,
  has_function_privilege('authenticated', 'public.campaign_group_states(uuid, uuid)', 'execute') as authenticated_executa;
'@
[IO.File]::WriteAllText("$env:TEMP\postar-pr2-confere-pr1.sql", $sql)
```
```powershell
Set-Location <wt>\apps\web; supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```
```powershell
Set-Location <wt>\apps\web; supabase db query --linked -o json -f "$env:TEMP\postar-pr2-confere-pr1.sql"
```

  Esperado em `rows[0]`: `colunas_groups = 4`, `coluna_target_rule = 1`, `rpc_argumentos = "p_tenant uuid, p_campaign uuid"`, `rpc_colunas` com as 17 colunas do `EstadoRow` na ordem das Global Constraints (`TABLE(posicao integer, group_id uuid, …, na_regra_com_gente boolean)`; se vier `SETOF <tipo>`, listar as colunas com `select attname from pg_attribute where attrelid = '<tipo>'::regclass and attnum > 0 order by attnum`), `service_role_executa = true`, `authenticated_executa = false`.

  Erro `function public.campaign_group_states(uuid, uuid) does not exist` ou qualquer valor diferente → **parar** e perguntar ao Igor: o PR 1 não está aplicado em dev (ou divergiu do contrato). Não seguir — o `short-link-click.test.ts` passa contra o PostgREST falso, mas o link em dev quebraria.

- [ ] **Step 4:** branch a partir de `origin/main`, sem upstream herdado:

```powershell
git -C <wt> switch -c feat/postar-grupo-link origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Esperado: vazio (defasagem zero). `--unset-upstream` pode dizer que não havia upstream — tudo bem.

- [ ] **Step 5:** colisão com outra sessão (`finding-sessoes-paralelas-colidem-em-pr`):

```powershell
gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title
```

  Para cada PR suspeito, `gh pr diff <N> --repo codingB0y/Girumo --name-only`. Nenhum pode mexer em `resolve-click-target.ts`, `short-link-click.ts`, `link-e-cliques.tsx`, `grow-headroom.ts`, `group-grow-store.ts`, `stores/groups.ts`, `stores/broadcasts.ts` ou criar `stores/campaign-group-states.ts`/`groups/estado.ts`. Se houver, parar e perguntar ao Igor a ordem.

- [ ] **Step 6:** dependências do worktree:

```powershell
Test-Path "<wt>\apps\web\node_modules\next"
```

  `False` → `Set-Location <wt>; npm ci --no-audit --no-fund` (~1 min; o `node_modules` do checkout principal costuma estar vazio — `finding-worktree-node-modules-junction`). Instala também `apps/worker` e `hubflow-engine`, que o `verify-local.ps1` usa.

- [ ] **Step 7 (Igor, prod):** achar o card da feature e movê-lo:

```sql
select key, title, status, blocker from public.board_features where key ilike '%postar%' or title ilike '%postar por grupo%' order by key;
```

  Com a `key` devolvida (anotar como `<key>` — se não houver linha, pedir ao Igor para criar o card antes de seguir):

```sql
select public.move_card('<key>', 'em_construcao', 'PR 2 começou: link /r/ pelo estado do grupo e auto-grow que respeita lotado', 'feat/postar-grupo-link');
```

---

### Task 2: `estado.ts` — tipos, rótulos e a linha da RPC (TDD)

**Files:** criar `apps/web/src/lib/groups/estado.ts`, `apps/web/src/lib/groups/estado.test.ts`
**Depends-on:** Task 1
**Interfaces:**
- Consumes: —
- Produces (contrato §3, literal):
```ts
export type EstadoDoGrupo = "lotado" | "enchendo" | "fila" | "vazio";
export type RegraDestino = "menos_enchendo" | "lotados" | "com_gente";
export const REGRAS: readonly RegraDestino[];
export type EstadoGrupo = { posicao: number; groupId: string; whatsappGroupId: string; nome: string; membros: number; capacidade: number; isAdmin: boolean; inviteUrl: string | null; lotadoEm: string | null; lotadoPor: "auto" | "manual" | null; reabertoEm: string | null; avisoLotouEm: string | null; estado: EstadoDoGrupo; podeReabrir: boolean; naRegra: Record<RegraDestino, boolean> };
export type EstadoRow = { /* as 17 colunas snake_case */ };
export function estadoFromRow(row: EstadoRow): EstadoGrupo;
export const ROTULO_ESTADO: Record<EstadoDoGrupo, string>;
export const ROTULO_REGRA: Record<RegraDestino, string>;
export function isRegraDestino(v: unknown): v is RegraDestino;
```

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/groups/estado.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REGRAS,
  ROTULO_ESTADO,
  ROTULO_REGRA,
  estadoFromRow,
  isRegraDestino,
  type EstadoRow,
} from "./estado";

/** Linha como `public.campaign_group_states` devolve; cada teste muda o que precisa. */
const linha = (over: Partial<EstadoRow> = {}): EstadoRow => ({
  posicao: 3,
  group_id: "7d0c2f4e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
  whatsapp_group_id: "120363000000000003@g.us",
  name: "Moda Kids do Sul 3",
  members: 812,
  capacity: 1024,
  is_admin: true,
  invite_url: "https://chat.whatsapp.com/KxY7bQ2mNp",
  lotado_em: "2026-10-07T14:08:00+00:00",
  lotado_por: "manual",
  reaberto_em: null,
  aviso_lotou_em: "2026-10-07T14:08:30+00:00",
  estado: "lotado",
  pode_reabrir: true,
  na_regra_menos_enchendo: true,
  na_regra_lotados: true,
  na_regra_com_gente: true,
  ...over,
});

test("a linha da RPC vira o EstadoGrupo do contrato, campo a campo", () => {
  assert.deepEqual(estadoFromRow(linha()), {
    posicao: 3,
    groupId: "7d0c2f4e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
    whatsappGroupId: "120363000000000003@g.us",
    nome: "Moda Kids do Sul 3",
    membros: 812,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/KxY7bQ2mNp",
    lotadoEm: "2026-10-07T14:08:00+00:00",
    lotadoPor: "manual",
    reabertoEm: null,
    avisoLotouEm: "2026-10-07T14:08:30+00:00",
    estado: "lotado",
    podeReabrir: true,
    naRegra: { menos_enchendo: true, lotados: true, com_gente: true },
  });
});

test("cada regra vem da sua coluna — trocar duas de lugar muda quem recebe o post", () => {
  // Mutante: ligar `lotados` em `na_regra_menos_enchendo` (ou o contrário).
  const enchendo = estadoFromRow(
    linha({
      estado: "enchendo",
      lotado_em: null,
      lotado_por: null,
      aviso_lotou_em: null,
      pode_reabrir: false,
      na_regra_menos_enchendo: false,
      na_regra_lotados: false,
      na_regra_com_gente: true,
    }),
  );
  assert.deepEqual(enchendo.naRegra, { menos_enchendo: false, lotados: false, com_gente: true });

  const fila = estadoFromRow(
    linha({ estado: "fila", na_regra_menos_enchendo: true, na_regra_lotados: false, na_regra_com_gente: true }),
  );
  assert.deepEqual(fila.naRegra, { menos_enchendo: true, lotados: false, com_gente: true });
});

test("nulos da linha continuam nulos — grupo sem convite não ganha convite vazio", () => {
  const g = estadoFromRow(
    linha({ estado: "vazio", invite_url: null, lotado_em: null, lotado_por: null, aviso_lotou_em: null, reaberto_em: null }),
  );
  assert.equal(g.inviteUrl, null);
  assert.equal(g.lotadoEm, null);
  assert.equal(g.lotadoPor, null);
  assert.equal(g.avisoLotouEm, null);
  assert.equal(g.reabertoEm, null);
});

test("rótulos da tela, um por estado e por regra; o atalho padrão vem primeiro", () => {
  assert.deepEqual(ROTULO_ESTADO, { lotado: "Lotado", enchendo: "Enchendo agora", fila: "Na fila", vazio: "Vazio" });
  assert.deepEqual(ROTULO_REGRA, {
    menos_enchendo: "Todos menos o que está enchendo",
    lotados: "Só lotados",
    com_gente: "Todos com gente",
  });
  // D6: "Todos menos o que está enchendo" é o padrão, e é o primeiro atalho.
  assert.deepEqual(REGRAS, ["menos_enchendo", "lotados", "com_gente"]);
});

test("isRegraDestino só aceita as três regras, do jeito que o banco grava", () => {
  for (const regra of REGRAS) assert.equal(isRegraDestino(regra), true, regra);
  for (const lixo of ["todos", "", "LOTADOS", "menos-enchendo", null, undefined, 1, {}]) {
    assert.equal(isRegraDestino(lixo), false, String(lixo));
  }
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/estado.test.ts
```

  Esperado: **FAIL** — `Cannot find module` apontando para `./estado`.

- [ ] **Step 3 (implementação):** criar `apps/web/src/lib/groups/estado.ts`:

```ts
/**
 * Estado de um grupo DENTRO da sua campanha, como `public.campaign_group_states`
 * devolve (spec "postar por grupo" §3 e §5.2).
 *
 * O banco é o único lugar que decide lotado/enchendo/fila/vazio e quem entra em
 * cada regra de destino (spec §4): o link `/r/`, a aba Grupos e o seletor do
 * Postar leem daqui e nunca recalculam. Este arquivo só traduz a linha da RPC e
 * dá nome às coisas na tela.
 *
 * Sem `server-only` de propósito: a tela importa os tipos e os rótulos.
 */

export type EstadoDoGrupo = "lotado" | "enchendo" | "fila" | "vazio";
export type RegraDestino = "menos_enchendo" | "lotados" | "com_gente";

/** Ordem dos atalhos na tela (D6): o padrão primeiro. */
export const REGRAS: readonly RegraDestino[] = ["menos_enchendo", "lotados", "com_gente"];

export type EstadoGrupo = {
  posicao: number;
  groupId: string;
  whatsappGroupId: string;
  nome: string;
  membros: number;
  capacidade: number;
  isAdmin: boolean;
  inviteUrl: string | null;
  lotadoEm: string | null;
  lotadoPor: "auto" | "manual" | null;
  reabertoEm: string | null;
  avisoLotouEm: string | null;
  estado: EstadoDoGrupo;
  podeReabrir: boolean;
  naRegra: Record<RegraDestino, boolean>;
};

/** Linha de `public.campaign_group_states`, na ordem das colunas do contrato. */
export type EstadoRow = {
  posicao: number;
  group_id: string;
  whatsapp_group_id: string;
  name: string;
  members: number;
  capacity: number;
  is_admin: boolean;
  invite_url: string | null;
  lotado_em: string | null;
  lotado_por: "auto" | "manual" | null;
  reaberto_em: string | null;
  aviso_lotou_em: string | null;
  estado: EstadoDoGrupo;
  pode_reabrir: boolean;
  na_regra_menos_enchendo: boolean;
  na_regra_lotados: boolean;
  na_regra_com_gente: boolean;
};

export function estadoFromRow(row: EstadoRow): EstadoGrupo {
  return {
    // `Number` porque inteiro grande pode chegar como texto no JSON do PostgREST.
    posicao: Number(row.posicao),
    groupId: row.group_id,
    whatsappGroupId: row.whatsapp_group_id,
    nome: row.name,
    membros: Number(row.members),
    capacidade: Number(row.capacity),
    isAdmin: row.is_admin === true,
    inviteUrl: row.invite_url ?? null,
    lotadoEm: row.lotado_em ?? null,
    lotadoPor: row.lotado_por ?? null,
    reabertoEm: row.reaberto_em ?? null,
    avisoLotouEm: row.aviso_lotou_em ?? null,
    estado: row.estado,
    podeReabrir: row.pode_reabrir === true,
    naRegra: {
      menos_enchendo: row.na_regra_menos_enchendo === true,
      lotados: row.na_regra_lotados === true,
      com_gente: row.na_regra_com_gente === true,
    },
  };
}

export const ROTULO_ESTADO: Record<EstadoDoGrupo, string> = {
  lotado: "Lotado",
  enchendo: "Enchendo agora",
  fila: "Na fila",
  vazio: "Vazio",
};

export const ROTULO_REGRA: Record<RegraDestino, string> = {
  menos_enchendo: "Todos menos o que está enchendo",
  lotados: "Só lotados",
  com_gente: "Todos com gente",
};

export function isRegraDestino(v: unknown): v is RegraDestino {
  return typeof v === "string" && (REGRAS as readonly string[]).includes(v);
}
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/estado.test.ts
```

  Esperado: **PASS** (`# pass 5`, `# fail 0`).

- [ ] **Step 5:** commit:

```powershell
git -C <wt> add apps/web/src/lib/groups/estado.ts apps/web/src/lib/groups/estado.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 2 arquivos.

```powershell
git -C <wt> commit -m "feat(groups): group state types, labels and campaign_group_states row mapping" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: store `listCampaignGroupStates` (TDD, PostgREST falso)

**Files:** criar `apps/web/src/lib/stores/campaign-group-states.ts`, `apps/web/src/lib/stores/campaign-group-states.test.ts`
**Depends-on:** Task 2
**Interfaces:**
- Consumes: `estadoFromRow`, `EstadoGrupo`, `EstadoRow` (Task 2); RPC `public.campaign_group_states(p_tenant uuid, p_campaign uuid)` (PR 1).
- Produces: `export async function listCampaignGroupStates(tenantId: string, campaignId: string): Promise<EstadoGrupo[]>`.

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/stores/campaign-group-states.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { EstadoRow } from "@/lib/groups/estado";
import { listCampaignGroupStates } from "./campaign-group-states";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `leads.test.ts`): prova, sem banco, que a RPC leva a loja e a campanha no corpo
 * — o service-role passa por cima do RLS, e `p_tenant` é o que isola — e que RPC
 * que falha é erro, nunca campanha vazia.
 */

type Pedido = { metodo: string; caminho: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const pedidos: Pedido[] = [];
let responder: () => Resposta = () => ({ status: 200, corpo: [] });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    pedidos.push({
      metodo: req.method ?? "",
      caminho: new URL(req.url ?? "/", "http://postgrest.falso").pathname,
      corpo: bruto ? JSON.parse(bruto) : undefined,
    });
    const { status, corpo } = responder();
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

const linha = (over: Partial<EstadoRow> & Pick<EstadoRow, "posicao" | "whatsapp_group_id" | "estado">): EstadoRow => ({
  group_id: `id-${over.posicao}`,
  name: `Moda Kids ${over.posicao}`,
  members: 300,
  capacity: 1024,
  is_admin: true,
  invite_url: `https://chat.whatsapp.com/CONVITE${over.posicao}`,
  lotado_em: null,
  lotado_por: null,
  reaberto_em: null,
  aviso_lotou_em: null,
  pode_reabrir: false,
  na_regra_menos_enchendo: false,
  na_regra_lotados: false,
  na_regra_com_gente: false,
  ...over,
});

test("lê os estados pela RPC, com a loja e a campanha no corpo, na ordem do pool", async () => {
  pedidos.length = 0;
  responder = () => ({
    status: 200,
    corpo: [
      linha({ posicao: 1, whatsapp_group_id: "g1@g.us", estado: "lotado", lotado_em: "2026-10-09T12:00:00+00:00", lotado_por: "auto" }),
      linha({ posicao: 2, whatsapp_group_id: "g2@g.us", estado: "enchendo", na_regra_com_gente: true }),
    ],
  });

  const estados = await listCampaignGroupStates("loja-a", "camp-1");

  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/campaign_group_states");
  // Mutante: sem `p_tenant` (ou com o tenant errado) a RPC lê a campanha de outra loja.
  assert.deepEqual(pedidos[0].corpo, { p_tenant: "loja-a", p_campaign: "camp-1" });
  assert.deepEqual(
    estados.map((e) => [e.posicao, e.whatsappGroupId, e.estado, e.lotadoPor]),
    [
      [1, "g1@g.us", "lotado", "auto"],
      [2, "g2@g.us", "enchendo", null],
    ],
  );
});

test("RPC que falha é erro, nunca uma campanha vazia", async () => {
  // PR 1 não aplicado no banco: a RPC não existe (PGRST202). Devolver [] aqui faria
  // todo link mestre dizer "campanha não está aberta" em silêncio.
  responder = () => ({
    status: 404,
    corpo: {
      code: "PGRST202",
      message: "Could not find the function public.campaign_group_states(p_campaign, p_tenant) in the schema cache",
      details: null,
      hint: null,
    },
  });
  await assert.rejects(listCampaignGroupStates("loja-a", "camp-1"), /campaign_group_states/);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/campaign-group-states.test.ts
```

  Esperado: **FAIL** — `Cannot find module` apontando para `./campaign-group-states`.

- [ ] **Step 3 (implementação):** criar `apps/web/src/lib/stores/campaign-group-states.ts`:

```ts
import "server-only";
import { estadoFromRow, type EstadoGrupo, type EstadoRow } from "@/lib/groups/estado";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Estados dos grupos de UMA campanha, na ordem do pool
 * (`public.campaign_group_states`, PR 1 do "postar por grupo").
 *
 * O tenant vai explícito porque o service-role passa por cima do RLS: é
 * `p_tenant` que isola as lojas. A RPC só devolve grupos da campanha que existem
 * em `groups` — JID órfão do pool não sai (o `diagnosePool` do link trata).
 *
 * Erro da RPC lança: devolver `[]` faria o link dizer "campanha não está aberta"
 * para uma campanha cheia de grupo, sem rastro nenhum.
 */
export async function listCampaignGroupStates(tenantId: string, campaignId: string): Promise<EstadoGrupo[]> {
  const { data, error } = await getSupabaseAdmin().rpc("campaign_group_states", {
    p_tenant: tenantId,
    p_campaign: campaignId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as EstadoRow[]).map(estadoFromRow);
}
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/campaign-group-states.test.ts
```

  Esperado: **PASS** (`# pass 2`, `# fail 0`).

- [ ] **Step 5 (mutante):** trocar `p_tenant: tenantId` por `p_tenant: campaignId` no store, rodar o Step 4 → **FAIL** no `deepEqual` do corpo. Reverter e rodar de novo → PASS.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/lib/stores/campaign-group-states.ts apps/web/src/lib/stores/campaign-group-states.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 2 arquivos.

```powershell
git -C <wt> commit -m "feat(groups): campaign group states store over the campaign_group_states RPC" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: resolvedor — alvo é o `enchendo` do banco (TDD)

**Files:** modificar `apps/web/src/lib/links/resolve-click-target.ts` (linhas 8, 26-27, 75-91, 150-159), `apps/web/src/lib/links/resolve-click-target.test.ts` (linhas 1-9, 46-51, 86-110, 186, fim do arquivo), `apps/web/src/lib/links/resolve-click-target.entrada.test.ts` (linhas 19-22, depois da 42)
**Depends-on:** Task 2
**Interfaces:**
- Consumes: `EstadoDoGrupo`, `EstadoGrupo`, `estadoFromRow` (Task 2).
- Produces:
```ts
export type ResolvableGroup = { /* campos de hoje */ estado?: EstadoDoGrupo };
export function toResolvableGroup(e: EstadoGrupo): ResolvableGroup;
export function withSequentialEstado(groupIds: readonly string[], groups: readonly ResolvableGroup[]): ResolvableGroup[];
// resolveClickTarget: mesma assinatura; alvo do link mestre = remembered ?? groups.find((g) => g.estado === "enchendo") ?? null
```

Importadores conferidos (`git grep -n "resolve-click-target"`): `isGroupAvailable` e `nextAvailableGroup` só são usados neste arquivo e no teste — continuam exportados porque `withSequentialEstado` (usada pela aba Link e cliques, Task 5) é feita deles. `DEFAULT_GROUP_CAPACITY` (`api/groups/route.ts`, `group-grow-store.ts`, `groups-store.ts`), `GROUP_FULL_RATIO` (`visao-geral.tsx`, `campaign-groups-overview.ts`, `painel/grupos.ts`, `groups-store.ts`) e `BlockedReason` (`entry-page.ts`, `link-parado.ts`) não mudam. `lib/groups-store.ts` tem o seu próprio `nextAvailableGroup` (modo JSON) e fica.

Premissa do alvo literal do contrato: `groups` são **os da campanha** (é o que a RPC devolve). Por isso os testes que passavam a lista inteira com um pool menor passam a filtrar o pool (`daCampanha`).

- [ ] **Step 1 (teste):** em `resolve-click-target.test.ts`, trocar o import (linhas 1-9):

```ts
import assert from "node:assert/strict";
import {
  isGroupAvailable,
  nextAvailableGroup,
  readClickCap,
  readPixelId,
  resolveClickTarget,
  type ResolvableGroup,
} from "./resolve-click-target";
```

  por:

```ts
import assert from "node:assert/strict";
import { estadoFromRow } from "@/lib/groups/estado";
import {
  isGroupAvailable,
  nextAvailableGroup,
  readClickCap,
  readPixelId,
  resolveClickTarget,
  toResolvableGroup,
  withSequentialEstado,
  type ResolvableGroup,
} from "./resolve-click-target";
```

- [ ] **Step 2 (teste):** no mesmo arquivo, trocar a fixture (linhas 46-51):

```ts
const pool = ["a@g.us", "b@g.us", "c@g.us"];
const groups = [
  group({ whatsapp_group_id: "a@g.us", members: 1000 }), // cheio
  group({ whatsapp_group_id: "b@g.us", invite_url: null }), // sem convite
  group({ whatsapp_group_id: "c@g.us", members: 10 }), // disponível
];
```

  por:

```ts
const pool = ["a@g.us", "b@g.us", "c@g.us"];
// `estado` é o que `campaign_group_states` devolveria para este pool: o banco
// decide. `nextAvailableGroup` ignora o campo.
const groups = [
  group({ whatsapp_group_id: "a@g.us", members: 1000, estado: "lotado" }), // cheio
  group({ whatsapp_group_id: "b@g.us", invite_url: null, estado: "vazio" }), // sem convite
  group({ whatsapp_group_id: "c@g.us", members: 10, estado: "enchendo" }), // disponível
];
```

- [ ] **Step 3 (teste):** no mesmo arquivo, trocar o trecho das linhas 86-110:

```ts
// Todos com convite porém cheios → "cheio" de verdade.
assert.deepEqual(
  resolveClickTarget({
    link: master,
    campaign: { group_ids: ["a@g.us"] },
    groups,
  }),
  { kind: "blocked", reason: "all-full" },
);

// Grupos existem mas nenhum tem convite → NÃO é "cheio", é falta de configuração.
assert.deepEqual(
  resolveClickTarget({
    link: master,
    campaign: { group_ids: ["b@g.us"] },
    groups,
  }),
  { kind: "blocked", reason: "no-invite" },
);

// Campanha sem grupos no pool.
assert.deepEqual(
  resolveClickTarget({ link: master, campaign: { group_ids: [] }, groups }),
  { kind: "blocked", reason: "empty-pool" },
);
```

  por:

```ts
// `groups` é o que a RPC devolve: só os grupos DESTA campanha.
const daCampanha = (ids: string[]) => groups.filter((g) => ids.includes(g.whatsapp_group_id));

// Todos com convite porém cheios → "cheio" de verdade.
assert.deepEqual(
  resolveClickTarget({
    link: master,
    campaign: { group_ids: ["a@g.us"] },
    groups: daCampanha(["a@g.us"]),
  }),
  { kind: "blocked", reason: "all-full" },
);

// Grupos existem mas nenhum tem convite → NÃO é "cheio", é falta de configuração.
assert.deepEqual(
  resolveClickTarget({
    link: master,
    campaign: { group_ids: ["b@g.us"] },
    groups: daCampanha(["b@g.us"]),
  }),
  { kind: "blocked", reason: "no-invite" },
);

// Campanha sem grupos no pool (a RPC não devolve linha nenhuma).
assert.deepEqual(
  resolveClickTarget({ link: master, campaign: { group_ids: [] }, groups: [] }),
  { kind: "blocked", reason: "empty-pool" },
);
```

- [ ] **Step 4 (teste):** no mesmo arquivo, linha 186, trocar:

```ts
      group({ whatsapp_group_id: "y@g.us", is_admin: true, invite_url: "https://chat.whatsapp.com/BBB" }),
```

  por:

```ts
      group({ whatsapp_group_id: "y@g.us", is_admin: true, invite_url: "https://chat.whatsapp.com/BBB", estado: "enchendo" }),
```

- [ ] **Step 5 (teste):** acrescentar ao **fim** de `resolve-click-target.test.ts`:

```ts

// --- estado vindo do banco (postar por grupo, PR 2) ------------------------

const masterCg = { campaign_group_id: "cg1", target_url: "", clicks: 0, metadata: {} };

// O alvo é o `enchendo` que o banco escolheu, mesmo fora da ordem do pool: é o
// grupo reaberto, que tem prioridade sobre a sequência (D3).
{
  const alvo = resolveClickTarget({
    link: masterCg,
    campaign: { group_ids: ["a@g.us", "b@g.us", "c@g.us"] },
    groups: [
      group({ whatsapp_group_id: "a@g.us", members: 100, estado: "fila" }),
      group({ whatsapp_group_id: "b@g.us", members: 300, estado: "fila" }),
      group({ whatsapp_group_id: "c@g.us", members: 700, estado: "enchendo", invite_url: "https://chat.whatsapp.com/CCC" }),
    ],
  });
  assert.deepEqual(alvo, { kind: "redirect", url: "https://chat.whatsapp.com/CCC", groupId: "c@g.us", pixelId: undefined });
}

// Lotado nunca é o alvo, por mais vaga que tenha (D1/D3): marcado à mão com 100 de 1000.
{
  const alvo = resolveClickTarget({
    link: masterCg,
    campaign: { group_ids: ["a@g.us", "c@g.us"] },
    groups: [
      group({ whatsapp_group_id: "a@g.us", members: 100, estado: "lotado" }),
      group({ whatsapp_group_id: "c@g.us", members: 500, estado: "enchendo", invite_url: "https://chat.whatsapp.com/CCC" }),
    ],
  });
  assert.equal(alvo.kind === "redirect" ? alvo.groupId : alvo.reason, "c@g.us");
}

// Sem `enchendo` no pool, bloqueia com o motivo do diagnóstico: todos lotados é "all-full"…
assert.deepEqual(
  resolveClickTarget({
    link: masterCg,
    campaign: { group_ids: ["a@g.us"] },
    groups: [group({ whatsapp_group_id: "a@g.us", members: 100, estado: "lotado" })],
  }),
  { kind: "blocked", reason: "all-full" },
);
// …e um pool só de grupo alheio continua "no-admin", não "cheio".
assert.deepEqual(
  resolveClickTarget({
    link: masterCg,
    campaign: { group_ids: ["x@g.us"] },
    groups: [group({ whatsapp_group_id: "x@g.us", is_admin: false, estado: "fila" })],
  }),
  { kind: "blocked", reason: "no-admin" },
);
// Grupo SEM estado nunca é escolhido pela rotação: quem esquece de passar o estado
// do banco bloqueia o link — não volta escondido para a regra antiga dos 95%.
assert.deepEqual(
  resolveClickTarget({
    link: masterCg,
    campaign: { group_ids: ["c@g.us"] },
    groups: [group({ whatsapp_group_id: "c@g.us", members: 10 })],
  }),
  { kind: "blocked", reason: "all-full" },
);

// A linha da RPC vira grupo resolvível COM o estado — é o que faz o link andar.
{
  const e = estadoFromRow({
    posicao: 2,
    group_id: "id-2",
    whatsapp_group_id: "g2@g.us",
    name: "Moda Kids 2",
    members: 600,
    capacity: 1024,
    is_admin: true,
    invite_url: "https://chat.whatsapp.com/DDD",
    lotado_em: null,
    lotado_por: null,
    reaberto_em: null,
    aviso_lotou_em: null,
    estado: "enchendo",
    pode_reabrir: false,
    na_regra_menos_enchendo: false,
    na_regra_lotados: false,
    na_regra_com_gente: true,
  });
  assert.deepEqual(toResolvableGroup(e), {
    whatsapp_group_id: "g2@g.us",
    name: "Moda Kids 2",
    members: 600,
    capacity: 1024,
    invite_url: "https://chat.whatsapp.com/DDD",
    is_admin: true,
    estado: "enchendo",
  });
  assert.deepEqual(
    resolveClickTarget({ link: masterCg, campaign: { group_ids: ["g2@g.us"] }, groups: [toResolvableGroup(e)] }),
    { kind: "redirect", url: "https://chat.whatsapp.com/DDD", groupId: "g2@g.us", groupName: "Moda Kids 2", pixelId: undefined },
  );
}

// Aproximação da aba Link e cliques (sem estado do banco até o PR 4): marca o mesmo
// grupo que a sequência antiga escolheria, e o resolvedor o devolve.
{
  const semEstado = [
    group({ whatsapp_group_id: "a@g.us", members: 1000 }),
    group({ whatsapp_group_id: "b@g.us", invite_url: null }),
    group({ whatsapp_group_id: "c@g.us", members: 10 }),
  ];
  const marcados = withSequentialEstado(["a@g.us", "b@g.us", "c@g.us"], semEstado);
  assert.deepEqual(
    marcados.map((g) => g.estado),
    [undefined, undefined, "enchendo"],
  );
  const alvo = resolveClickTarget({ link: masterCg, campaign: { group_ids: ["a@g.us", "b@g.us", "c@g.us"] }, groups: marcados });
  assert.equal(alvo.kind === "redirect" ? alvo.groupId : alvo.reason, "c@g.us");
  // Nada disponível: ninguém é marcado e o diagnóstico continua valendo.
  assert.deepEqual(
    withSequentialEstado(["a@g.us"], semEstado).map((g) => g.estado),
    [undefined, undefined, undefined],
  );
}

console.log("resolve-click-target estado tests passed");
```

- [ ] **Step 6 (teste):** em `resolve-click-target.entrada.test.ts`, trocar as linhas 19-22:

```ts
const pool = [
  group({ whatsapp_group_id: "g1@g.us", name: "Saldão 1", members: 990, capacity: 1000 }), // cheio
  group({ whatsapp_group_id: "g2@g.us", name: "Saldão 2", invite_url: "https://chat.whatsapp.com/BBB" }),
];
```

  por:

```ts
// `estado` é o que `campaign_group_states` devolveria: o banco escolhe o enchendo.
const pool = [
  group({ whatsapp_group_id: "g1@g.us", name: "Saldão 1", members: 990, capacity: 1000, estado: "lotado" }), // cheio
  group({ whatsapp_group_id: "g2@g.us", name: "Saldão 2", invite_url: "https://chat.whatsapp.com/BBB", estado: "enchendo" }),
];
```

- [ ] **Step 7 (teste):** no mesmo arquivo, logo depois de

```ts
assert.equal(lembrado.kind, "redirect");
if (lembrado.kind === "redirect") assert.equal(lembrado.groupId, "g1@g.us");
```

  acrescentar:

```ts

// Lotado À MÃO, com vaga sobrando: o lembrado continua vencendo (spec §6.1) — quem
// clicou já está lá dentro, e mandá-lo para outro é o que fabrica duplicata.
const lotadoAMao = resolveClickTarget({
  link: masterLink,
  campaign,
  groups: [group({ whatsapp_group_id: "g1@g.us", name: "Saldão 1", members: 120, capacity: 1000, estado: "lotado" }), pool[1]],
  entrada: ENTRADA_DEFAULTS,
  rememberedGroupId: "g1@g.us",
});
assert.equal(lotadoAMao.kind, "redirect");
if (lotadoAMao.kind === "redirect") assert.equal(lotadoAMao.groupId, "g1@g.us");
```

- [ ] **Step 8:** rodar os dois e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/resolve-click-target.test.ts src/lib/links/resolve-click-target.entrada.test.ts
```

  Esperado: **FAIL** em `resolve-click-target.test.ts` (a regra antiga escolhe o `a@g.us` de 100 membros no caso do lotado, e `toResolvableGroup`/`withSequentialEstado` não existem). O `entrada` pode passar — a regra antiga já pulava o de 990.

- [ ] **Step 9 (implementação):** em `resolve-click-target.ts`, trocar o import (linha 8):

```ts
import { ENTRADA_DEFAULTS, isClosedAt, type EntradaSettings } from "@/lib/campaigns/settings";
```

  por:

```ts
import { ENTRADA_DEFAULTS, isClosedAt, type EntradaSettings } from "@/lib/campaigns/settings";
import type { EstadoDoGrupo, EstadoGrupo } from "@/lib/groups/estado";
```

- [ ] **Step 10:** no mesmo arquivo, fim do tipo `ResolvableGroup` (linhas 26-27):

```ts
  is_admin?: boolean | null;
};
```

  por:

```ts
  is_admin?: boolean | null;
  /**
   * Estado do grupo NA campanha, calculado no banco (`campaign_group_states`).
   * O link mestre só manda gente para o `enchendo`; grupo sem estado nunca é o
   * alvo da rotação (o lembrado continua valendo, ver `rememberedGroup`).
   */
  estado?: EstadoDoGrupo;
};
```

- [ ] **Step 11:** no mesmo arquivo, trocar `nextAvailableGroup` inteiro (linhas 75-91):

```ts
/**
 * Próximo grupo DISPONÍVEL na ordem do pool (preenchimento sequencial = "lota sozinho":
 * enche o 1º até ~95%, transborda pro próximo). Pula cheios e os sem convite.
 *
 * `groupIds` guarda `whatsapp_group_id` (ex.: `1203...@g.us`), não o uuid da tabela.
 */
export function nextAvailableGroup(
  groupIds: readonly string[],
  groups: readonly ResolvableGroup[],
): ResolvableGroup | null {
  const byWhatsappId = new Map(groups.map((g) => [g.whatsapp_group_id, g]));
  for (const id of groupIds) {
    const g = byWhatsappId.get(id);
    if (g && isGroupAvailable(g)) return g;
  }
  return null;
}
```

  por:

```ts
/**
 * Próximo grupo DISPONÍVEL na ordem do pool (preenchimento sequencial = "lota sozinho":
 * enche o 1º até ~95%, transborda pro próximo). Pula cheios e os sem convite.
 *
 * `groupIds` guarda `whatsapp_group_id` (ex.: `1203...@g.us`), não o uuid da tabela.
 *
 * Fora do caminho do `/r/` desde o PR 2 do "postar por grupo" — lá o alvo é o
 * `enchendo` que o banco calcula. Sobra só para `withSequentialEstado`.
 */
export function nextAvailableGroup(
  groupIds: readonly string[],
  groups: readonly ResolvableGroup[],
): ResolvableGroup | null {
  const byWhatsappId = new Map(groups.map((g) => [g.whatsapp_group_id, g]));
  for (const id of groupIds) {
    const g = byWhatsappId.get(id);
    if (g && isGroupAvailable(g)) return g;
  }
  return null;
}

/** Linha de `campaign_group_states` no formato do resolvedor. Levar o `estado` junto é o que faz o link andar. */
export function toResolvableGroup(e: EstadoGrupo): ResolvableGroup {
  return {
    whatsapp_group_id: e.whatsappGroupId,
    name: e.nome,
    members: e.membros,
    capacity: e.capacidade,
    invite_url: e.inviteUrl,
    is_admin: e.isAdmin,
    estado: e.estado,
  };
}

/**
 * Aproximação do estado para quem ainda não lê o banco: marca como `enchendo` o
 * primeiro grupo disponível pela regra antiga (95%, convite, admin), sem a marca
 * de lotado nem a prioridade do reaberto.
 *
 * ponytail: só a aba "Link e cliques" usa, até o PR 4 trocá-la pelo
 * `GET /api/campanhas/[slug]/grupos/estados`. Pode divergir do `/r/` quando um
 * grupo lotado volta para baixo de 95% — o link real pula, a aba não.
 */
export function withSequentialEstado(
  groupIds: readonly string[],
  groups: readonly ResolvableGroup[],
): ResolvableGroup[] {
  const enchendo = nextAvailableGroup(groupIds, groups);
  return groups.map((g): ResolvableGroup => (g === enchendo ? { ...g, estado: "enchendo" } : g));
}
```

- [ ] **Step 12:** no mesmo arquivo, trocar o começo do ramo do link mestre (linhas 150-159):

```ts
  // 1) Link MESTRE de campanha → grupo lembrado ou próximo disponível do pool.
  if (link.campaign_group_id) {
    // Campanha sumiu (ou o link ficou órfão): trata como pool vazio, nunca redireciona.
    if (!campaign) return { kind: "blocked", reason: "empty-pool" };
    const entrada = input.entrada ?? ENTRADA_DEFAULTS;
    if (isClosedAt(entrada.encerra_em, input.now ?? new Date())) return { kind: "blocked", reason: "closed" };
    const remembered = entrada.um_grupo_por_pessoa
      ? rememberedGroup(input.rememberedGroupId, campaign.group_ids, groups)
      : null;
    const target = remembered ?? nextAvailableGroup(campaign.group_ids, groups);
```

  por:

```ts
  // 1) Link MESTRE de campanha → grupo lembrado ou o `enchendo` da campanha.
  if (link.campaign_group_id) {
    // Campanha sumiu (ou o link ficou órfão): trata como pool vazio, nunca redireciona.
    if (!campaign) return { kind: "blocked", reason: "empty-pool" };
    const entrada = input.entrada ?? ENTRADA_DEFAULTS;
    if (isClosedAt(entrada.encerra_em, input.now ?? new Date())) return { kind: "blocked", reason: "closed" };
    const remembered = entrada.um_grupo_por_pessoa
      ? rememberedGroup(input.rememberedGroupId, campaign.group_ids, groups)
      : null;
    // O banco já escolheu o `enchendo` (reabertos primeiro, depois a ordem do pool;
    // nunca um lotado). `groups` são os desta campanha, como a RPC devolve — aqui
    // não se recalcula nada.
    const target = remembered ?? groups.find((g) => g.estado === "enchendo") ?? null;
```

- [ ] **Step 13:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/resolve-click-target.test.ts src/lib/links/resolve-click-target.entrada.test.ts
```

  Esperado: **PASS** nos dois (`# fail 0`; o log imprime `resolve-click-target tests passed`, `resolve-click-target estado tests passed` e `resolve-click-target.entrada.test ok`).

- [ ] **Step 14 (mutante):** trocar `groups.find((g) => g.estado === "enchendo")` por `nextAvailableGroup(campaign.group_ids, groups)`, rodar o Step 13 → **FAIL** ("lotado nunca é o alvo" e "grupo sem estado"). Reverter e rodar de novo → PASS.

- [ ] **Step 15:** commit:

```powershell
git -C <wt> add apps/web/src/lib/links/resolve-click-target.ts apps/web/src/lib/links/resolve-click-target.test.ts apps/web/src/lib/links/resolve-click-target.entrada.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 3 arquivos.

```powershell
git -C <wt> commit -m "feat(links): master link targets the group the database marks as enchendo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `/r/` e `/c/` leem `campaign_group_states`; a aba Link e cliques continua de pé (TDD)

**Files:** modificar `apps/web/src/lib/links/short-link-click.ts` (linhas 4-5, 46-50, 67-74), `apps/web/src/components/painel/campanhas/detalhe/link-e-cliques.tsx` (linhas 9, 55-56); criar `apps/web/src/lib/links/short-link-click.test.ts`
**Depends-on:** Task 3, Task 4
**Interfaces:**
- Consumes: `listCampaignGroupStates` (Task 3); `toResolvableGroup`, `withSequentialEstado` (Task 4).
- Produces: nenhuma assinatura nova — `handleShortLinkClick(req, slug)` muda de comportamento.

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/links/short-link-click.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { EstadoRow } from "@/lib/groups/estado";
import { handleShortLinkClick } from "./short-link-click";

/**
 * O clique em `/r/<slug>` inteiro contra um PostgREST de mentira: link, campanha e
 * estados saem como em produção, só a rede é trocada. Prova o que o PR 2 muda — o
 * alvo vem do `enchendo` da RPC, com a loja tirada da linha do link (o clique não
 * traz loja nenhuma).
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let estados: EstadoRow[] = [];

const LINK = {
  id: "link-1",
  tenant_id: "loja-a",
  campaign_group_id: "camp-1",
  slug: "moda-kids",
  target_url: "",
  clicks: 0,
  metadata: {},
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};

const CAMPANHA = {
  id: "camp-1",
  tenant_id: "loja-a",
  name: "Moda Kids",
  slug: "moda-kids",
  group_ids: ["g1@g.us", "g2@g.us"],
  auto_grow: false,
  grow_template: null,
  metadata: {},
  whatsapp_community_jid: null,
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const respostas: Record<string, Resposta> = {
      "GET /rest/v1/tracked_links": { status: 200, corpo: [LINK] },
      "GET /rest/v1/campaign_groups": { status: 200, corpo: [CAMPANHA] },
      "POST /rest/v1/rpc/campaign_group_states": { status: 200, corpo: estados },
      "POST /rest/v1/rpc/increment_tracked_link_clicks": { status: 204 },
      "POST /rest/v1/link_click_events": { status: 201 },
    };
    // Chamada que ninguém previu vira 500, para aparecer.
    const { status, corpo } = respostas[`${chamada.metodo} ${chamada.url.pathname}`] ?? {
      status: 500,
      corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` },
    };
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

const linha = (over: Partial<EstadoRow> & Pick<EstadoRow, "posicao" | "whatsapp_group_id" | "estado">): EstadoRow => ({
  group_id: `id-${over.posicao}`,
  name: `Moda Kids ${over.posicao}`,
  members: 300,
  capacity: 1024,
  is_admin: true,
  invite_url: `https://chat.whatsapp.com/CONVITE${over.posicao}`,
  lotado_em: null,
  lotado_por: null,
  reaberto_em: null,
  aviso_lotou_em: null,
  pode_reabrir: false,
  na_regra_menos_enchendo: false,
  na_regra_lotados: false,
  na_regra_com_gente: false,
  ...over,
});

/** Clique de gente no host do Girumo, de um desktop: sem deep link nem tela de entrada. */
function clique(): Request {
  return new Request("https://www.girumo.com.br/r/moda-kids", {
    headers: {
      host: "www.girumo.com.br",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
    },
  });
}

test("o clique vai para o grupo que o banco marcou como enchendo, pulando o lotado com vaga", async () => {
  chamadas.length = 0;
  estados = [
    // Lotado à mão com 300 de 1024: a regra antiga (95%) mandaria gente para cá.
    linha({ posicao: 1, whatsapp_group_id: "g1@g.us", estado: "lotado", lotado_em: "2026-10-09T12:00:00+00:00", lotado_por: "manual" }),
    linha({ posicao: 2, whatsapp_group_id: "g2@g.us", estado: "enchendo", members: 600 }),
  ];

  const res = await handleShortLinkClick(clique(), "moda-kids");

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://chat.whatsapp.com/CONVITE2");
  const rpcs = chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/campaign_group_states");
  assert.equal(rpcs.length, 1);
  // Mutante: tenant de outro lugar que não a linha do link (service-role passa por cima do RLS).
  assert.deepEqual(rpcs[0].corpo, { p_tenant: "loja-a", p_campaign: "camp-1" });
  // A listagem da loja inteira (paginada, sem estado) saiu do caminho do clique.
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/groups").length, 0);
});

test("sem grupo enchendo (todos lotados), mostra 'todos cheios' em vez de mandar para um lotado", async () => {
  chamadas.length = 0;
  estados = [
    linha({ posicao: 1, whatsapp_group_id: "g1@g.us", estado: "lotado", lotado_em: "2026-10-09T12:00:00+00:00", lotado_por: "manual" }),
    linha({ posicao: 2, whatsapp_group_id: "g2@g.us", estado: "lotado", members: 990, lotado_em: "2026-10-08T12:00:00+00:00", lotado_por: "auto" }),
  ];

  const res = await handleShortLinkClick(clique(), "moda-kids");

  assert.equal(res.status, 200);
  assert.match(await res.text(), /Todos os grupos desta campanha estão cheios/);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/short-link-click.test.ts
```

  Esperado: **FAIL** — o código de hoje chama `GET /rest/v1/groups` (o falso responde 500 `inesperado`) e nunca a RPC. Se falhar por **import** de `next/server` (e não pela asserção ou pelo 500), parar e reportar: nenhum teste deste repo importava `next/server` até aqui; não contornar.

- [ ] **Step 3 (implementação):** em `short-link-click.ts`, trocar os imports (linhas 4-5):

```ts
import * as groupsStore from "@/lib/stores/groups";
import { resolveClickTarget, type BlockedReason } from "@/lib/links/resolve-click-target";
```

  por:

```ts
import { listCampaignGroupStates } from "@/lib/stores/campaign-group-states";
import { resolveClickTarget, toResolvableGroup, type BlockedReason } from "@/lib/links/resolve-click-target";
```

- [ ] **Step 4:** no mesmo arquivo, atualizar o comentário (linhas 47-49):

```ts
 *  1) link MESTRE de campanha (`campaign_group_id` preenchido) → grupo lembrado
 *     pelo cookie ou próximo grupo DISPONÍVEL do pool ("lota sozinho"), obedecendo
 *     às configurações de entrada da campanha (deep link, encerramento, lotado).
```

  por:

```ts
 *  1) link MESTRE de campanha (`campaign_group_id` preenchido) → grupo lembrado
 *     pelo cookie ou o grupo `enchendo` da campanha, que o banco escolhe
 *     (`campaign_group_states`: nunca um lotado; o reaberto tem prioridade),
 *     obedecendo às configurações de entrada da campanha (deep link, encerramento, lotado).
```

- [ ] **Step 5:** no mesmo arquivo, trocar a leitura (linhas 67-74):

```ts
  // Daqui pra baixo o tenant sai da PRÓPRIA linha do link: toda query seguinte
  // filtra por ele (service-role bypassa RLS — o filtro é que isola o tenant).
  const [campaign, groups] = link.campaign_group_id
    ? await Promise.all([
        campaignsStore.getCampaignGroupById(link.tenant_id, link.campaign_group_id),
        groupsStore.listGroups(link.tenant_id),
      ])
    : [null, []];
```

  por:

```ts
  // Daqui pra baixo o tenant sai da PRÓPRIA linha do link: toda query seguinte
  // filtra por ele (service-role bypassa RLS — o filtro é que isola o tenant).
  // Os grupos são só os DESTA campanha, já com o estado calculado no banco: o link
  // não recalcula lotado/enchendo em TS (spec §4).
  const [campaign, estados] = link.campaign_group_id
    ? await Promise.all([
        campaignsStore.getCampaignGroupById(link.tenant_id, link.campaign_group_id),
        listCampaignGroupStates(link.tenant_id, link.campaign_group_id),
      ])
    : [null, []];
  const groups = estados.map(toResolvableGroup);
```

- [ ] **Step 6:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/links/short-link-click.test.ts
```

  Esperado: **PASS** (`# pass 2`, `# fail 0`).

- [ ] **Step 7 (mutante):** em `toResolvableGroup` (Task 4), apagar a linha `estado: e.estado,`, rodar o Step 6 → **FAIL** no primeiro teste (302 vira a página de "todos cheios"). Reverter e rodar de novo → PASS.

- [ ] **Step 8 (aba do painel):** em `link-e-cliques.tsx`, trocar o import (linha 9):

```tsx
import { resolveClickTarget, type ResolvableGroup } from "@/lib/links/resolve-click-target";
```

  por:

```tsx
import { resolveClickTarget, withSequentialEstado, type ResolvableGroup } from "@/lib/links/resolve-click-target";
```

  e, no mesmo arquivo (linhas 55-56), trocar:

```tsx
      campaign: { group_ids: groupIds },
      groups: resolviveis,
```

  por:

```tsx
      campaign: { group_ids: groupIds },
      // Esta aba ainda não recebe o estado do banco: aproxima o "enchendo" pela
      // sequência antiga (ver withSequentialEstado). O PR 4 troca por /grupos/estados.
      groups: withSequentialEstado(groupIds, resolviveis),
```

- [ ] **Step 9:** tipos e lint do que mudou:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```
```powershell
Set-Location <wt>\apps\web; npm run lint
```

  Esperado: sem erro. Erro em `short-link-click.ts` sobre `groupsStore` = o import velho ficou; apagar.

- [ ] **Step 10:** commit:

```powershell
git -C <wt> add apps/web/src/lib/links/short-link-click.ts apps/web/src/lib/links/short-link-click.test.ts apps/web/src/components/painel/campanhas/detalhe/link-e-cliques.tsx
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 3 arquivos.

```powershell
git -C <wt> commit -m "feat(links): /r/ and /c/ read campaign_group_states instead of every tenant group" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `hasHeadroom` — lotado não é folga (TDD)

**Files:** modificar `apps/web/src/lib/groups/grow-headroom.ts` (linhas 11-15, 46-49), `apps/web/src/lib/groups/grow-headroom.test.ts` (fim do arquivo)
**Depends-on:** Task 1
**Interfaces:**
- Consumes: —
- Produces: `export type PoolGroup = { members: number; capacity: number; inviteUrl?: string; lotadoEm?: string | null }`; `hasHeadroom(g)` = `false` quando `g.lotadoEm`.

- [ ] **Step 1 (teste):** acrescentar ao fim de `grow-headroom.test.ts`:

```ts

test("grupo lotado abaixo de 90% NÃO é folga — marcado à mão com 812 seguraria o próximo para sempre", () => {
  const lotado: PoolGroup = { members: 812, capacity: 1024, inviteUrl: CONVITE, lotadoEm: "2026-10-09T12:00:00Z" };
  assert.equal(hasHeadroom(lotado), false);
  // Mutante: tirar o lotado do pool (ou dos roteáveis) deixaria a lista vazia — e
  // vazio aqui é "convite faltando"/"dado quebrado" (false), não "tudo cheio".
  assert.equal(shouldEnqueueGrow([lotado]), true);
});

test("ao lado de um lotado, um grupo aberto com folga ainda segura a fila", () => {
  const lotado: PoolGroup = { members: 812, capacity: 1024, inviteUrl: CONVITE, lotadoEm: "2026-10-09T12:00:00Z" };
  assert.equal(shouldEnqueueGrow([lotado, g(100, CONVITE)]), false);
});

test("sem a marca, o mesmo grupo de 812 de 1024 continua sendo folga", () => {
  assert.equal(hasHeadroom({ members: 812, capacity: 1024, inviteUrl: CONVITE, lotadoEm: null }), true);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/grow-headroom.test.ts
```

  Esperado: **FAIL** no primeiro teste novo (`hasHeadroom` devolve `true` para 812/1024).

- [ ] **Step 3 (implementação):** em `grow-headroom.ts`, trocar (linhas 11-15):

```ts
export type PoolGroup = {
  members: number;
  capacity: number;
  inviteUrl?: string;
};
```

  por:

```ts
export type PoolGroup = {
  members: number;
  capacity: number;
  inviteUrl?: string;
  /**
   * Marca de lotado (`groups.lotado_em`). Lotado não recebe ninguém pelo link,
   * então não é folga — nem o marcado à mão com 812 de 1024.
   */
  lotadoEm?: string | null;
};
```

  e (linhas 46-49):

```ts
/** Grupo roteável ainda com espaço para receber gente. */
export function hasHeadroom(g: PoolGroup): boolean {
  return g.capacity > 0 && g.members < g.capacity * GROW_AHEAD_RATIO;
}
```

  por:

```ts
/**
 * Grupo roteável ainda com espaço para receber gente. Lotado nunca tem: sem isto,
 * um grupo marcado à mão abaixo de 90% seguraria a criação do próximo para sempre.
 * O lotado continua no pool de propósito — pool vazio aqui quer dizer "ids órfãos"
 * (ver `shouldEnqueueGrow`), não "tudo cheio".
 */
export function hasHeadroom(g: PoolGroup): boolean {
  return !g.lotadoEm && g.capacity > 0 && g.members < g.capacity * GROW_AHEAD_RATIO;
}
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/grow-headroom.test.ts
```

  Esperado: **PASS** (`# pass 11`, `# fail 0`).

- [ ] **Step 5:** commit:

```powershell
git -C <wt> add apps/web/src/lib/groups/grow-headroom.ts apps/web/src/lib/groups/grow-headroom.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 2 arquivos.

```powershell
git -C <wt> commit -m "fix(grow): a group marked lotado has no headroom" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: auto-grow lê a marca e o grupo criado nasce contado (TDD, PostgREST falso)

**Files:** modificar `apps/web/src/lib/stores/groups.ts` (linhas 25, 99-105), `apps/web/src/lib/group-grow-store.ts` (linhas 124-127, 283-320); criar `apps/web/src/lib/group-grow-store.test.ts`
**Depends-on:** Task 6
**Interfaces:**
- Consumes: `PoolGroup.lotadoEm` (Task 6); coluna `groups.lotado_em` (PR 1).
- Produces: `Group.lotado_em?: string | null`; `GroupUpsert` aceita `admins_total`, `admins_ours`, `admins_counted_at`; `registerGrownGroup` grava `admins_total: 1, admins_ours: 1, admins_counted_at: <agora>` no insert e no update.

Efeito visível conferido (`git grep -n "admins_counted_at\|summarizeProtection\|groups_sem_backup_idx"`): o índice `groups_sem_backup_idx` (`is_admin and admins_counted_at is not null and admins_total <= 1`) não tem leitor no código — ele serve à varredura de `summarizeProtection(listGroupsForProtection(...))`, usada por `GET /api/groups/protecao` (painel "Proteção dos grupos") e pelo e-mail `group_admin_risk` do `api/cron/emails` (dedupe de 14 dias). O grupo criado pelo auto-grow passa a contar como "sem admin reserva" nos dois — é verdade até o lojista promover alguém. E `inicio-carga.ts:73` (`syncedAt`) passa a mostrar a hora da criação em vez de "nunca conferido".

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/group-grow-store.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { ackGrow, evaluateAutoGrow } from "./group-grow-store";

/**
 * O auto-grow no modo Supabase contra um PostgREST de mentira (o desenho de
 * `stores/leads.test.ts`): prova, sem banco, o que o PR 2 do "postar por grupo"
 * muda — o grupo criado nasce com a contagem conferida, e a marca de lotado
 * chega do banco até o `hasHeadroom`.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let tabelas: Record<string, (c: Chamada) => Resposta> = {};

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const tabela = tabelas[`${chamada.metodo} ${chamada.url.pathname}`];
    const { status, corpo } = tabela
      ? tabela(chamada)
      : { status: 500, corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` } };
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

const feitas = (metodo: string, caminho: string) =>
  chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);

const JOB = {
  id: "job-1",
  tenant_id: "loja-a",
  campaign_group_id: "camp-1",
  campaign_slug: "moda-kids",
  seq: 21,
  subject: "Moda Kids 21",
  description: null,
  media_id: null,
  announce: true,
  member_add_mode: "admin_add",
  status: "created",
  attempts: 1,
  whatsapp_group_id: "g21@g.us",
  invite_url: "https://chat.whatsapp.com/NOVO21",
  error: null,
  created_at: "2026-10-10T12:00:00+00:00",
  running_since: null,
  last_ack_at: null,
  updated_at: "2026-10-10T12:01:00+00:00",
};

const ACK_CRIADO = {
  id: "job-1",
  status: "created" as const,
  whatsappGroupId: "g21@g.us",
  members: 1,
  inviteLink: "https://chat.whatsapp.com/NOVO21",
};

function ackComGrupos(gruposNoBanco: unknown[]): Record<string, (c: Chamada) => Resposta> {
  return {
    "PATCH /rest/v1/group_grow_jobs": () => ({ status: 200, corpo: JOB }),
    "GET /rest/v1/groups": () => ({ status: 200, corpo: gruposNoBanco }),
    "POST /rest/v1/groups": (c) => ({ status: 201, corpo: c.corpo }),
    "PATCH /rest/v1/groups": (c) => ({ status: 200, corpo: c.corpo }),
    "POST /rest/v1/rpc/campaign_group_append_group_id": () => ({ status: 204 }),
  };
}

test("grupo criado pelo auto-grow nasce contado: um admin, o nosso, conferido agora", async () => {
  chamadas.length = 0;
  tabelas = ackComGrupos([]);
  const antes = Date.now();

  await ackGrow("loja-a", ACK_CRIADO);

  const [insert] = feitas("POST", "/rest/v1/groups");
  const [linha] = insert.corpo as Array<Record<string, unknown>>;
  assert.equal(linha.tenant_id, "loja-a");
  assert.equal(linha.whatsapp_group_id, "g21@g.us");
  assert.equal(linha.is_admin, true);
  // Mutante: sem o carimbo, `apply_group_members_delta` ignora o grupo e ele nunca lota sozinho.
  assert.ok(Date.parse(String(linha.admins_counted_at)) >= antes - 1000);
  // Mutante: carimbo com 0/0 — um admin promovido depois somaria 1 e o grupo seguiria "sem reserva".
  assert.equal(linha.admins_total, 1);
  assert.equal(linha.admins_ours, 1);
});

test("ack reentregue: o grupo que já existe também ganha o carimbo, filtrado pela loja", async () => {
  chamadas.length = 0;
  tabelas = ackComGrupos([
    { id: "row-21", tenant_id: "loja-a", whatsapp_group_id: "g21@g.us", name: "Moda Kids 21", members: 1, capacity: 1024 },
  ]);

  await ackGrow("loja-a", ACK_CRIADO);

  assert.equal(feitas("POST", "/rest/v1/groups").length, 0);
  const [update] = feitas("PATCH", "/rest/v1/groups");
  assert.equal(update.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(update.url.searchParams.get("id"), "eq.row-21");
  const corpo = update.corpo as Record<string, unknown>;
  assert.equal(corpo.admins_total, 1);
  assert.equal(corpo.admins_ours, 1);
  assert.equal(typeof corpo.admins_counted_at, "string");
});

const CAMPANHA = {
  id: "camp-1",
  tenant_id: "loja-a",
  name: "Moda Kids",
  slug: "moda-kids",
  group_ids: ["g1@g.us"],
  auto_grow: true,
  grow_template: { subjectPattern: "Moda Kids {n}" },
  metadata: {},
  whatsapp_community_jid: null,
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};

const GRUPO_ABERTO = {
  id: "row-1",
  tenant_id: "loja-a",
  whatsapp_group_id: "g1@g.us",
  name: "Moda Kids 1",
  members: 500,
  capacity: 1024,
  invite_url: "https://chat.whatsapp.com/AAA",
  is_admin: true,
  lotado_em: null,
};

function avaliacaoCom(grupo: Record<string, unknown>): Record<string, (c: Chamada) => Resposta> {
  return {
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [CAMPANHA] }),
    "GET /rest/v1/groups": () => ({ status: 200, corpo: [grupo] }),
    // Nenhum job em voo e nenhum seq anterior: o próximo é max(0, 1) + 1 = 2.
    "GET /rest/v1/group_grow_jobs": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/group_grow_jobs": (c) => ({
      status: 201,
      corpo: { ...JOB, ...(c.corpo as Record<string, unknown>), status: "queued" },
    }),
  };
}

test("pool cujo único grupo aberto foi marcado lotado (500 de 1024) enfileira o próximo", async () => {
  chamadas.length = 0;
  tabelas = avaliacaoCom({ ...GRUPO_ABERTO, lotado_em: "2026-10-09T12:00:00+00:00" });

  await evaluateAutoGrow("loja-a");

  const enfileirados = feitas("POST", "/rest/v1/group_grow_jobs");
  // Mutante: não levar `lotado_em` do banco até o `hasHeadroom` — 500 de 1024 parece folga.
  assert.equal(enfileirados.length, 1);
  assert.equal((enfileirados[0].corpo as Record<string, unknown>).subject, "Moda Kids 2");
});

test("o mesmo grupo sem a marca ainda é folga: nada enfileirado", async () => {
  chamadas.length = 0;
  tabelas = avaliacaoCom(GRUPO_ABERTO);

  await evaluateAutoGrow("loja-a");

  assert.equal(feitas("POST", "/rest/v1/group_grow_jobs").length, 0);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/group-grow-store.test.ts
```

  Esperado: **FAIL** em três testes (carimbo ausente no insert e no update; nada enfileirado com o lotado). O quarto ("sem a marca") já passa.

- [ ] **Step 3 (implementação, tipos):** em `stores/groups.ts`, logo depois de `admins_counted_at?: string | null;` (linha 25), acrescentar:

```ts
  /**
   * Marca de lotado (PR 1 do "postar por grupo"): gravada pelo trigger ao cruzar
   * 95% subindo, ou à mão. Nunca recalculada da contagem.
   */
  lotado_em?: string | null;
```

  e, no mesmo arquivo (linhas 99-105), trocar:

```ts
      // `is_admin` é fato do WhatsApp, não config do painel — quem normalmente o
      // grava é `syncGroupsFromProvider`. Está aqui, opcional, para o auto-grow:
      // ao criar o grupo nós SOMOS o admin por definição, e essa é a única via
      // que também grava o `invite_url` do grupo recém-criado. Continua opcional
      // para que nenhum outro chamador o sobrescreva sem querer.
      | "is_admin"
    >
```

  por:

```ts
      // `is_admin` é fato do WhatsApp, não config do painel — quem normalmente o
      // grava é `syncGroupsFromProvider`. Está aqui, opcional, para o auto-grow:
      // ao criar o grupo nós SOMOS o admin por definição, e essa é a única via
      // que também grava o `invite_url` do grupo recém-criado. Continua opcional
      // para que nenhum outro chamador o sobrescreva sem querer.
      | "is_admin"
      // Idem: o auto-grow sabe a contagem de admins do grupo que acabou de criar
      // (um, o nosso número) e grava como conferência — ver registerGrownGroup.
      | "admins_total"
      | "admins_ours"
      | "admins_counted_at"
    >
```

- [ ] **Step 4 (implementação, pool):** em `group-grow-store.ts`, trocar (linhas 124-127, o bloco com `g.invite_url`):

```ts
    const pool: PoolGroup[] = c.group_ids
      .map((id) => byId.get(id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map((g) => ({ members: g.members, capacity: g.capacity, inviteUrl: g.invite_url }));
```

  por:

```ts
    const pool: PoolGroup[] = c.group_ids
      .map((id) => byId.get(id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      // `lotadoEm` vai junto: grupo marcado lotado (à mão ou pelo trigger) não é
      // folga, mesmo abaixo de 90% — ver `hasHeadroom`. Ele NÃO sai do pool.
      .map((g) => ({ members: g.members, capacity: g.capacity, inviteUrl: g.invite_url, lotadoEm: g.lotado_em ?? null }));
```

- [ ] **Step 5 (implementação, grupo criado):** no mesmo arquivo, trocar `registerGrownGroup` inteiro (linhas 283-320):

```ts
/**
 * Registra o grupo recém-criado no pool SEM apagar os demais e sem resetar o que
 * o lojista configurou — se o ack for reentregue, só atualiza nome/membros/convite.
 */
async function registerGrownGroup(tenantId: string, g: {
  whatsappGroupId: string;
  name: string;
  members: number;
  inviteUrl: string;
}): Promise<void> {
  const existing = (await supaGroups.listGroups(tenantId)).find(
    (row) => row.whatsapp_group_id === g.whatsappGroupId,
  );
  if (existing) {
    await supaGroups.updateGroup(tenantId, existing.id, {
      name: g.name,
      members: g.members,
      invite_url: g.inviteUrl,
    });
    return;
  }
  await supaGroups.upsertGroupsBatch(tenantId, [{
    whatsapp_group_id: g.whatsappGroupId,
    name: g.name,
    members: g.members,
    capacity: DEFAULT_GROUP_CAPACITY,
    selected: false,
    engagement: "medio",
    invite_url: g.inviteUrl,
    // Quem cria um grupo no WhatsApp é admin dele — não é suposição, é a regra da
    // plataforma. Sem esta flag o grupo entra no pool "não-admin" e a captura de
    // lead o descarta (`lead-capture.ts`), então todo mundo que entrasse pelo
    // link recém-criado seria perdido até o próximo sync recalcular `is_admin`.
    // A janela é curta, mas o link vai ao ar no mesmo instante: é justamente
    // quando mais gente entra.
    is_admin: true,
  }]);
}
```

  por:

```ts
/**
 * Registra o grupo recém-criado no pool SEM apagar os demais e sem resetar o que
 * o lojista configurou — se o ack for reentregue, só atualiza nome/membros/convite.
 *
 * Grava também a contagem de admins como CONFERIDA, no insert e no update: o
 * grupo acabou de ser criado por nós, então tem um admin, o nosso número. Sem o
 * carimbo (`admins_counted_at`), `apply_group_members_delta` ignora todo delta do
 * grupo (só soma onde ele não é nulo) e a contagem ficaria parada no 1 até um
 * Sincronizar manual — o grupo nunca lotaria sozinho. Efeito visível, e
 * verdadeiro: ele passa a contar como "sem admin reserva" (`/api/groups/protecao`
 * e o e-mail `group_admin_risk`) até o lojista promover alguém.
 */
async function registerGrownGroup(tenantId: string, g: {
  whatsappGroupId: string;
  name: string;
  members: number;
  inviteUrl: string;
}): Promise<void> {
  const contagemDeAdmins = {
    admins_total: 1,
    admins_ours: 1,
    admins_counted_at: new Date().toISOString(),
  };
  const existing = (await supaGroups.listGroups(tenantId)).find(
    (row) => row.whatsapp_group_id === g.whatsappGroupId,
  );
  if (existing) {
    await supaGroups.updateGroup(tenantId, existing.id, {
      name: g.name,
      members: g.members,
      invite_url: g.inviteUrl,
      ...contagemDeAdmins,
    });
    return;
  }
  await supaGroups.upsertGroupsBatch(tenantId, [{
    whatsapp_group_id: g.whatsappGroupId,
    name: g.name,
    members: g.members,
    capacity: DEFAULT_GROUP_CAPACITY,
    selected: false,
    engagement: "medio",
    invite_url: g.inviteUrl,
    // Quem cria um grupo no WhatsApp é admin dele — não é suposição, é a regra da
    // plataforma. Sem esta flag o grupo entra no pool "não-admin" e a captura de
    // lead o descarta (`lead-capture.ts`), então todo mundo que entrasse pelo
    // link recém-criado seria perdido até o próximo sync recalcular `is_admin`.
    // A janela é curta, mas o link vai ao ar no mesmo instante: é justamente
    // quando mais gente entra.
    is_admin: true,
    ...contagemDeAdmins,
  }]);
}
```

- [ ] **Step 6:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/group-grow-store.test.ts src/lib/groups/grow-headroom.test.ts
```

  Esperado: **PASS** nos dois (`# fail 0`).

- [ ] **Step 7:** tipos:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```

  Esperado: sem erro.

- [ ] **Step 8:** commit:

```powershell
git -C <wt> add apps/web/src/lib/stores/groups.ts apps/web/src/lib/group-grow-store.ts apps/web/src/lib/group-grow-store.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 3 arquivos.

```powershell
git -C <wt> commit -m "fix(grow): lotado reaches the headroom check and grown groups are counted at creation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: claim legado nunca pega disparo com regra (TDD) — só se o PR 1 não fez

**Files:** modificar `apps/web/src/lib/stores/broadcasts.ts` (linhas 212-231); criar `apps/web/src/lib/stores/broadcasts.test.ts`
**Depends-on:** Task 1 (Step 2 decide se esta task roda)
**Interfaces:**
- Consumes: coluna `broadcasts.target_rule` (PR 1).
- Produces: `claimPendingBroadcasts(tenantId, limit?)` com o filtro `target_rule is null`.

O plano do PR 1 (`2026-10-10-postar-por-grupo-pr1-banco.md`) já inclui esta guarda em `claimPendingBroadcasts` — o esperado é que o Task 1 Step 2 a encontre. Se achou `.is("target_rule", null)` em `origin/main`, marcar todos os Steps abaixo como "já entregue no PR 1" e seguir para a Task 9. Esta task só roda se o PR 1 tiver saído sem ela.

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/stores/broadcasts.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { claimPendingBroadcasts } from "./broadcasts";

/** PostgREST de mentira (o desenho de `leads.test.ts`): prova os filtros do claim sem banco. */

const pedidos: Array<{ metodo: string; url: URL }> = [];

const postgrest = createServer((req, res) => {
  req.on("data", () => undefined);
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://postgrest.falso") });
    res.setHeader("Content-Type", "application/json");
    res.end("[]");
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

test("o claim legado nunca pega disparo com regra — lá, group_ids vazio é 'todos os grupos'", async () => {
  pedidos.length = 0;

  assert.equal((await claimPendingBroadcasts("loja-a")).length, 0);

  assert.equal(pedidos.length, 1);
  const [{ metodo, url }] = pedidos;
  assert.equal(metodo, "PATCH");
  assert.equal(url.pathname, "/rest/v1/broadcasts");
  assert.equal(url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(url.searchParams.get("status"), "eq.queued");
  assert.equal(url.searchParams.get("run_id"), "is.null");
  // Mutante: sem este filtro, um disparo de regra que escapasse para o motor legado
  // (group_ids vazio) iria para TODOS os grupos do lojista.
  assert.equal(url.searchParams.get("target_rule"), "is.null");
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/broadcasts.test.ts
```

  Esperado: **FAIL** na última asserção (`null !== 'is.null'`).

- [ ] **Step 3 (implementação):** em `broadcasts.ts`, trocar o comentário e o filtro do claim (linhas 212-231):

```ts
/**
 * @deprecated Motor legado (removido na F5) — o worker novo lê `engine_commands`.
 *
 * O filtro `run_id is null` é o que impede DISPARO DUPLO durante o cutover: com o
 * fan-out, a oferta também entra em 'queued', e sem este filtro o engine legado
 * claimaria a mesma linha e enviaria tudo de novo. Oferta com `run_id` é do motor
 * novo e o legado ignora — por isso os dois podem ficar vivos ao mesmo tempo.
 */
export async function claimPendingBroadcasts(tenantId: string, limit = 10): Promise<Broadcast[]> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "running" as BroadcastStatus,
      running_since: now,
      last_ack_at: now,
    })
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .is("run_id", null)
```

  por:

```ts
/**
 * @deprecated Motor legado (removido na F5) — o worker novo lê `engine_commands`.
 *
 * O filtro `run_id is null` é o que impede DISPARO DUPLO durante o cutover: com o
 * fan-out, a oferta também entra em 'queued', e sem este filtro o engine legado
 * claimaria a mesma linha e enviaria tudo de novo. Oferta com `run_id` é do motor
 * novo e o legado ignora — por isso os dois podem ficar vivos ao mesmo tempo.
 *
 * `target_rule is null`: disparo com regra (postar por grupo) guarda `group_ids`
 * vazio, e o legado lê vazio como "todos os grupos". `enqueue_broadcast` sempre
 * seta `run_id`, então hoje ele nunca chega aqui — este filtro é para o dia em que
 * escapar.
 */
export async function claimPendingBroadcasts(tenantId: string, limit = 10): Promise<Broadcast[]> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "running" as BroadcastStatus,
      running_since: now,
      last_ack_at: now,
    })
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .is("run_id", null)
    .is("target_rule", null)
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/broadcasts.test.ts
```

  Esperado: **PASS** (`# pass 1`, `# fail 0`).

- [ ] **Step 5:** commit:

```powershell
git -C <wt> add apps/web/src/lib/stores/broadcasts.ts apps/web/src/lib/stores/broadcasts.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 2 arquivos.

```powershell
git -C <wt> commit -m "fix(dispatch): legacy claim never takes a broadcast with a target rule" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: verificação final do PR 2, revisão, PR e comandos para o Igor

**Files:** nenhum novo.
**Depends-on:** Tasks 2–8
**Interfaces:** —

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez:
  - `npx tsc --noEmit -p tsconfig.json`
  - `npx tsc --noEmit -p tsconfig.e2e.json`
  - `npm run lint`
  - `npm test`
  - `npx tsx scripts/check-painel-vitrine.ts`

  Esperado: todos sem erro; `npm test` com `# fail 0`.

- [ ] **Step 2:** o gate real (sem `2>&1` nem `*>`):

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`.

- [ ] **Step 3:** revisão final do diff inteiro (a revisão por task não vê a costura — `pattern-revisao-final-pega-o-que-revisao-por-task-nao-ve`): superpowers:requesting-code-review sobre `git -C <wt> diff origin/main...HEAD`, com foco nos itens 1–3 da Review Focus e em: (a) nenhuma query nova sem `tenant_id`/`p_tenant`; (b) `nextAvailableGroup` fora do caminho do `/r/` (`git -C <wt> grep -n "nextAvailableGroup" -- apps/web/src` → só `resolve-click-target.ts`, o teste e `groups-store.ts`/`short-link-click.ts` do modo JSON); (c) o modo JSON (`legacyGet`) intocado. CRITICAL/HIGH → corrigir e commitar antes do push.

- [ ] **Step 4:** defasagem:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Commits novos → `git -C <wt> merge origin/main` (não rebase) e Steps 1–2 de novo.

- [ ] **Step 5:** `git -C <wt> status --short` vazio e `git -C <wt> log origin/main..HEAD --oneline` com os 7 commits das Tasks 2–8 (6 se a Task 8 foi "já entregue").

- [ ] **Step 6:** registrar a decisão no grafo (MCP): `kg_insert_text` com `source = "decisao-2026-10-10-postar-por-grupo-link"` e o texto do `rag insert` abaixo.

#### Comandos para o Igor (PR 2)

Push e PR:

```bash
git -C <wt> push -u origin feat/postar-grupo-link
```

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-link --title "feat(links): link pelo estado do grupo e auto-grow que respeita lotado (postar por grupo PR 2)" --body "## O que entra

- Link /r/ e /c/ de campanha leem public.campaign_group_states (PR 1): o alvo e o grupo que o banco marca como enchendo. Lotado nunca recebe gente, o reaberto tem prioridade, o grupo lembrado continua vencendo mesmo lotado.
- lib/groups/estado.ts (tipos, rotulos e leitura da linha da RPC) e lib/stores/campaign-group-states.ts (listCampaignGroupStates), que os PRs 4, 5 e 9 consomem.
- Aba Link e cliques: continua mostrando o destino pela sequencia antiga (withSequentialEstado) ate o PR 4 trocar pelo endpoint de estados.
- Auto-grow: grupo com lotado_em nao conta como folga; grupo criado pelo auto-grow nasce com a contagem de admins conferida (1 de 1), para o webhook somar membros nele e ele lotar sozinho.
- Claim legado de disparos ignora disparo com target_rule (se o PR 1 ja nao trouxe).

## Efeito visivel

- Grupos criados pelo auto-grow passam a aparecer como sem admin reserva (Protecao dos grupos e e-mail group_admin_risk), o que e verdade ate o lojista promover alguem.

## Antes do merge

- PR 1 aplicado em PROD. Sem a RPC, todo link mestre responde erro.

## Teste

- [x] npm test, tsc x2, lint, painel:check, verify-local.ps1
- [x] short-link-click.test.ts: o clique vai para o enchendo, pula o lotado com vaga, tenant tirado da linha do link
- [x] group-grow-store.test.ts: lotado chega ao hasHeadroom; grupo criado nasce contado
- [x] mutantes: sem o estado no mapeamento o link bloqueia tudo; sem p_tenant o teste reprova
- [ ] CI verde
- [ ] Em prod: /r/ da Moda Kids do Sul vai para o enchendo de campaign_group_states

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

CI (trocar `<N>` pelo número do PR):

```bash
gh pr checks <N> --repo codingB0y/Girumo
```

**Portão antes do merge — PR 1 em produção.** O merge em `main` põe o PR 2 no ar sozinho (Vercel); sem a RPC em prod, todo link mestre quebra. Na raiz do checkout principal, anotar o projeto ligado hoje e ligar prod:

```powershell
Set-Location C:\Users\Igor\Desktop\HubFlow-platform\apps\web; Get-Content supabase\.temp\project-ref
```
```powershell
Set-Location C:\Users\Igor\Desktop\HubFlow-platform\apps\web; supabase link --project-ref nidoatbxaylrkcgbszns --yes
```
```powershell
Set-Location C:\Users\Igor\Desktop\HubFlow-platform\apps\web; supabase db query --linked -o json -f "$env:TEMP\postar-pr2-confere-pr1.sql"
```

Esperado o mesmo de dev (Task 1 Step 3): `4`, `1`, `p_tenant uuid, p_campaign uuid`, as 17 colunas, `true`, `false`. Qualquer diferença → **não mergear**. Depois, religar o projeto que estava (`supabase link --project-ref <o que o Get-Content mostrou> --yes`).

Merge (só com o CI verde e o portão acima ok; nunca auto-merge):

```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

Verificação em prod (depois de `/admin/configuracoes` → "Deploy" mostrar o commit do merge). O destino que o banco escolheu:

```sql
select c.slug, s.whatsapp_group_id, s.name, s.members, s.capacity, s.invite_url
  from public.campaign_groups c
  cross join lateral public.campaign_group_states(c.tenant_id, c.id) s
 where c.name ilike '%moda kids%' and s.estado = 'enchendo';
```

E para onde o link manda (UA do curl conta como robô: não soma clique). Trocar `<slug>` pelo da consulta:

```powershell
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" https://www.girumo.com.br/r/<slug>
```

Esperado: `302` com o `invite_url` da consulta. Se vier `200` (campanha com pixel abre a tela de entrada), conferir o convite no HTML:

```powershell
curl.exe -s https://www.girumo.com.br/r/<slug> | Select-String "chat.whatsapp.com"
```

Quadro (prod). A feature só fica completa com os PRs 4–9, então o card continua em construção:

```sql
select public.move_card('<key>', 'em_construcao', 'PR 2 mergeado: /r/ manda para o enchendo de campaign_group_states, lotado nunca recebe; auto-grow respeita lotado e conta o grupo criado', 'PR #<N>');
```

Grafo (PowerShell, na raiz do checkout principal):

```powershell
.\tools\lightrag\.venv\Scripts\rag.exe insert "decisão: o link /r/ e /c/ de campanha lê o estado do grupo de public.campaign_group_states (alvo = grupo lembrado ou o enchendo) e não recalcula lotado em TS; a aba Link e cliques usa withSequentialEstado até o PR 4; auto-grow trata lotado_em como sem vaga e grava admins_total/ours=1 e admins_counted_at no grupo que cria" --source decisao-2026-10-10-postar-por-grupo-link
```

Ao encerrar: "PRs que deixei abertos: …".

---

## PR 3 — recontagem diária (branch `feat/postar-grupo-recontagem`)

Independente do PR 1 e do PR 2: só lê o WhatsApp e regrava `members`/`admins_*`. Se o PR 1 estiver aplicado, a regravação passa pelo trigger `groups_marca_lotado` e a marca automática vem sozinha — é o objetivo.

### Task 10: branch, defasagem, colisões, dependências e card

**Files:** nenhum.
**Depends-on:** —
**Interfaces:** —

- [ ] **Step 1:** `<wt>` = `git rev-parse --show-toplevel` (o mesmo worktree da sessão). Se veio do PR 2 nesta sessão, conferir que nada ficou para trás:

```powershell
git -C <wt> status --short
```

  Esperado: vazio. Sobrou algo → commitar no PR certo antes de trocar de branch.

- [ ] **Step 2:** branch a partir de `origin/main`:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> switch -c feat/postar-grupo-recontagem origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Esperado: vazio.

- [ ] **Step 3:** colisões: `gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title` e `gh pr diff <N> --repo codingB0y/Girumo --name-only` nos suspeitos. Nenhum pode mexer em `app/api/groups/sync/route.ts`, `stores/groups.ts`, `request-access-policy.ts`, `apps/worker/src/index.ts`, `apps/worker/src/env.ts` ou `deploy/coolify/worker.docker-compose.yml`. O plano da fase 3 do Instagram (`2026-10-08-instagram-fluxos-fase3.md`) prevê um tick no worker e uma rota engine nova: se o PR dele estiver aberto, os dois mexem em `index.ts`, `env.ts`, no compose e no `ENGINE_ONLY` — combinar a ordem com o Igor e, se o outro entrar antes, `merge origin/main` aqui resolvendo os blocos lado a lado.

- [ ] **Step 4:** dependências: `Test-Path "<wt>\apps\worker\node_modules"` ou `Test-Path "<wt>\node_modules\tsx"`; `False` → `Set-Location <wt>; npm ci --no-audit --no-fund`.

- [ ] **Step 5 (Igor, prod):**

```sql
select public.move_card('<key>', 'em_construcao', 'PR 3 começou: recontagem diária dos grupos (rota engine + loop do worker)', 'feat/postar-grupo-recontagem');
```

---

### Task 11: `sincronizarGrupos` com modo `somenteContagem` (TDD, três serviços falsos)

**Files:** modificar `apps/web/src/lib/stores/groups.ts` (depois de `insertNewGroups`, linha 177); criar `apps/web/src/lib/groups/sincronizar.ts`, `apps/web/src/lib/groups/sincronizar.test.ts`
**Depends-on:** Task 10
**Interfaces:**
- Consumes: `travarSync`/`liberarSync` (`lib/groups/sync-lock.ts`, #397), `escolherContagem`, `tallyAdmins`, `partitionByAdmin`, `classificarPapel`, `fetchAllGroups`, os stores de hoje.
- Produces:
```ts
// lib/stores/groups.ts
export async function updateGroupCounts(
  tenantId: string,
  groups: ReadonlyArray<{ whatsapp_group_id: string; name: string; members: number; admins_total: number; admins_ours: number; admins_counted_at: string }>,
): Promise<number>;

// lib/groups/sincronizar.ts
export type OpcoesDoSync = {
  somenteContagem: boolean;
  instanceId?: string;
  actorUserId?: string | null;
  depois?: (tarefa: () => Promise<void>) => void;
};
export type ResultadoDoSync =
  | { ok: true; synced: number; admin: number; semBackup: number; ignorados: number; removidos: number }
  | { ok: false; status: 409 | 502 | 504; error: string };
export async function sincronizarGrupos(tenantId: string, opts: OpcoesDoSync): Promise<ResultadoDoSync>;
```

Desenho (spec §6.3): o corpo de `POST /api/groups/sync` (`route.ts:62-343`) muda de lugar **sem mudar de comportamento** no modo completo. A recontagem compartilha a escolha da instância, a trava, o fetch, a partição por admin e a contagem com proteção (`escolherContagem`), e diverge só na escrita: upsert de `name`, `members`, `admins_total`, `admins_ours`, `admins_counted_at` dos grupos que **já** estão no banco. `name` vai junto só porque `groups.name` é `not null` e o Postgres confere NOT NULL na linha proposta **antes** de achar o conflito do upsert — sem ele o upsert falha inteiro; é o mesmo nome que o sync grava. Nada de `is_admin`, convite, comunidade, participantes, remoção ou grupo novo. `depois` existe só porque o `after` do Next lança fora de uma request: a rota não passa nada (usa `after`), o teste passa um coletor.

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/groups/sincronizar.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { sincronizarGrupos as SincronizarGrupos } from "./sincronizar";

/**
 * O sync inteiro contra três serviços de mentira num servidor só: o PostgREST
 * (`/rest/v1`), a Evolution (`/group/fetchAllGroups`) e o Upstash da trava por
 * número (`/upstash`). O que sai daqui é o que sai em produção; só a rede é trocada.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown; prefer: string };
type Resposta = { status: number; corpo?: unknown };

const LOJA = "loja-a";
const chamadas: Chamada[] = [];
let banco: Record<string, (c: Chamada) => Resposta> = {};
let evolution: Resposta = { status: 200, corpo: [] };
/** `true` = outro sync deste número segura a trava (o SET NX não grava). */
let travaOcupada = false;

/** `set … nx` só grava se ninguém segura; `del` apaga. */
function resultadoDaTrava(comando: unknown[]): unknown {
  return String(comando[0]).toLowerCase() === "set" ? (travaOcupada ? null : "OK") : 1;
}

/** Os comandos que chegaram ao Upstash, na ordem — com ou sem pipeline. */
function comandosDaTrava(): string[] {
  return chamadas
    .filter((c) => c.url.pathname.startsWith("/upstash"))
    .flatMap((c) =>
      c.url.pathname.endsWith("/pipeline")
        ? (c.corpo as unknown[][]).map((cmd) => String(cmd[0]).toLowerCase())
        : [String((c.corpo as unknown[])[0]).toLowerCase()],
    );
}

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
      prefer: String(req.headers.prefer ?? ""),
    };
    chamadas.push(chamada);
    const responder = (status: number, corpo?: unknown) => {
      if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
      res.statusCode = status;
      res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
    };

    if (chamada.url.pathname.startsWith("/upstash")) {
      // Upstash REST: o comando chega como array no corpo (ou lista deles, em
      // /pipeline). Com `Upstash-Encoding: base64`, string volta em base64.
      const base64 = req.headers["upstash-encoding"] === "base64";
      const codificar = (v: unknown) => (base64 && typeof v === "string" ? Buffer.from(v).toString("base64") : v);
      if (chamada.url.pathname.endsWith("/pipeline")) {
        return responder(
          200,
          (chamada.corpo as unknown[][]).map((cmd) => ({ result: codificar(resultadoDaTrava(cmd)) })),
        );
      }
      return responder(200, { result: codificar(resultadoDaTrava(chamada.corpo as unknown[])) });
    }
    if (chamada.url.pathname.startsWith("/group/fetchAllGroups/")) {
      return responder(evolution.status, evolution.corpo);
    }
    const tabela = banco[`${chamada.metodo} ${chamada.url.pathname}`];
    if (tabela) {
      const { status, corpo } = tabela(chamada);
      return responder(status, corpo);
    }
    // Chamada que ninguém previu vira 500, para aparecer.
    return responder(500, { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` });
  });
});

let sincronizarGrupos: typeof SincronizarGrupos;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.EVOLUTION_API_URL = base;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  // A trava lê o Upstash na importação: o env vem antes do import dinâmico.
  process.env.UPSTASH_REDIS_REST_URL = `${base}/upstash`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "token-do-upstash-falso";
  ({ sincronizarGrupos } = await import("./sincronizar"));
});

after(() => {
  servidor.close();
});

const feitas = (metodo: string, caminho: string) =>
  chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);

const INSTANCIA = {
  id: "inst-1",
  tenant_id: LOJA,
  name: "Número 1",
  phone: "5511999990000",
  status: "connected",
  qr_code: null,
  provider: "evolution",
  provider_instance_id: "gr_inst-1",
  last_seen_at: null,
  connected_at: null,
  metadata: {},
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};

const NOS = { id: "5511999990000@s.whatsapp.net", phoneNumber: "5511999990000@s.whatsapp.net", admin: "superadmin" };
const SOCIA = { id: "88888@lid", phoneNumber: "5511888880000@s.whatsapp.net", admin: "admin" };

/** O que a Evolution devolve: dois grupos que já temos, um novo e um de terceiro. */
const DA_EVOLUTION = [
  { id: "g1@g.us", subject: "Moda Kids 1", size: 980, participants: [NOS, SOCIA] },
  // Payload truncado (evolution-api#2124): só o "self". O banco tem 500.
  { id: "g2@g.us", subject: "Moda Kids 2", size: 1, participants: [NOS] },
  // Somos admin, mas o grupo nunca foi importado.
  { id: "g3@g.us", subject: "Grupo novo", size: 40, participants: [NOS] },
  // Não somos admin.
  { id: "g4@g.us", subject: "Grupo de terceiro", size: 300, participants: [{ ...NOS, admin: null }, SOCIA] },
];

/** `listMemberCounts`: o que já está gravado. */
const CONTAGENS = [
  { whatsapp_group_id: "g1@g.us", members: 900 },
  { whatsapp_group_id: "g2@g.us", members: 500 },
  { whatsapp_group_id: "g4@g.us", members: 290 },
];

/** `listGroups` (backfill de convite do modo completo): o g3 já gravado, sem convite. */
const GRUPOS_DO_BANCO = [
  { id: "row-1", tenant_id: LOJA, whatsapp_group_id: "g1@g.us", is_admin: true, invite_url: "https://chat.whatsapp.com/AAA", metadata: {} },
  { id: "row-2", tenant_id: LOJA, whatsapp_group_id: "g2@g.us", is_admin: true, invite_url: "https://chat.whatsapp.com/BBB", metadata: {} },
  { id: "row-3", tenant_id: LOJA, whatsapp_group_id: "g3@g.us", is_admin: true, invite_url: null, metadata: {} },
];

function bancoDaLoja(instancias: unknown[] = [INSTANCIA]): Record<string, (c: Chamada) => Resposta> {
  return {
    "GET /rest/v1/instances": () => ({ status: 200, corpo: instancias }),
    "GET /rest/v1/groups": (c) =>
      c.url.searchParams.get("select") === "whatsapp_group_id,members"
        ? { status: 200, corpo: CONTAGENS }
        : { status: 200, corpo: GRUPOS_DO_BANCO },
    "POST /rest/v1/groups": (c) => ({
      status: 201,
      corpo: (c.corpo as unknown[]).map((_, i) => ({ id: `row-${i}` })),
    }),
    "DELETE /rest/v1/groups": () => ({ status: 200, corpo: [{ id: "row-4" }] }),
    "GET /rest/v1/group_bulk_jobs": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/group_bulk_jobs": () => ({ status: 201, corpo: [{ id: "bulk-1" }] }),
    "POST /rest/v1/funnel_events": () => ({ status: 201 }),
    "POST /rest/v1/logs": () => ({ status: 201 }),
  };
}

function prepara(over: { instancias?: unknown[]; evolution?: Resposta; travaOcupada?: boolean } = {}): void {
  chamadas.length = 0;
  banco = bancoDaLoja(over.instancias);
  evolution = over.evolution ?? { status: 200, corpo: DA_EVOLUTION };
  travaOcupada = over.travaOcupada ?? false;
}

test("recontagem regrava só membros e admins dos grupos que já estão no banco", async () => {
  prepara();

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.deepEqual(r, { ok: true, synced: 2, admin: 2, semBackup: 1, ignorados: 1, removidos: 0 });

  const upserts = feitas("POST", "/rest/v1/groups");
  assert.equal(upserts.length, 1);
  const [upsert] = upserts;
  assert.equal(upsert.url.searchParams.get("on_conflict"), "tenant_id,whatsapp_group_id");
  assert.match(upsert.prefer, /resolution=merge-duplicates/);
  const linhas = upsert.corpo as Array<Record<string, unknown>>;
  // Mutante: mandar o payload do Sincronizar (is_admin, comunidade) — recontar não decide nada disso.
  for (const linha of linhas) {
    assert.deepEqual(Object.keys(linha).sort(), [
      "admins_counted_at",
      "admins_ours",
      "admins_total",
      "members",
      "name",
      "tenant_id",
      "whatsapp_group_id",
    ]);
    assert.equal(linha.tenant_id, LOJA);
    assert.equal(typeof linha.admins_counted_at, "string");
  }
  assert.deepEqual(
    linhas.map((l) => [l.whatsapp_group_id, l.name, l.members, l.admins_total, l.admins_ours]),
    [
      ["g1@g.us", "Moda Kids 1", 980, 2, 1],
      // Payload truncado: a contagem gravada (500) vence o "1" da Evolution.
      ["g2@g.us", "Moda Kids 2", 500, 1, 1],
    ],
  );

  // Mutantes: herdar do Sincronizar a fila de convite, o apagar de não-admin, o
  // grupo novo, o marco de funil ou a leitura da loja inteira.
  assert.equal(chamadas.filter((c) => c.metodo === "DELETE").length, 0);
  assert.equal(feitas("GET", "/rest/v1/group_bulk_jobs").length, 0);
  assert.equal(feitas("POST", "/rest/v1/group_bulk_jobs").length, 0);
  assert.equal(feitas("POST", "/rest/v1/funnel_events").length, 0);
  assert.equal(feitas("GET", "/rest/v1/groups").length, 1);

  // O service-role passa por cima do RLS: toda leitura filtra a loja.
  for (const c of chamadas.filter((c) => c.metodo === "GET" && c.url.pathname.startsWith("/rest/v1/"))) {
    assert.equal(c.url.searchParams.get("tenant_id"), `eq.${LOJA}`, c.url.pathname);
  }
  const fetches = feitas("GET", "/group/fetchAllGroups/gr_inst-1");
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].url.searchParams.get("getParticipants"), "true");
  assert.deepEqual(comandosDaTrava(), ["set", "del"]);
  const [log] = feitas("POST", "/rest/v1/logs");
  assert.equal((log.corpo as Record<string, unknown>).event, "groups.recounted");
});

test("com outro sync do mesmo número rodando, a recontagem desiste sem tocar na Evolution", async () => {
  prepara({ travaOcupada: true });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.deepEqual(r, {
    ok: false,
    status: 409,
    error: "Os grupos deste numero ja estao sendo sincronizados. Aguarde um minuto e atualize a pagina.",
  });
  // O incidente de 06/10 (#397): a segunda chamada pesada na mesma instância entra
  // na fila da Evolution atrás da primeira, e as duas estouram o tempo.
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/group/")).length, 0);
  assert.equal(feitas("POST", "/rest/v1/groups").length, 0);
  // Quem não pegou a trava não a solta: o `del` apagaria a do sync que está rodando.
  assert.deepEqual(comandosDaTrava(), ["set"]);
});

test("Evolution fora: a trava é liberada e a falha fica registrada como recontagem", async () => {
  prepara({ evolution: { status: 500, corpo: { message: "Internal Server Error" } } });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.deepEqual(r, { ok: false, status: 502, error: "Erro ao sincronizar grupos." });
  assert.deepEqual(comandosDaTrava(), ["set", "del"]);
  const [log] = feitas("POST", "/rest/v1/logs");
  const corpo = log.corpo as Record<string, unknown>;
  assert.equal(corpo.event, "groups.recount_failed");
  assert.equal(corpo.tenant_id, LOJA);
  assert.equal(corpo.level, "error");
});

test("sem número conectado, 409 sem tocar na trava nem na Evolution", async () => {
  prepara({ instancias: [{ ...INSTANCIA, status: "disconnected" }] });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.deepEqual(r, { ok: false, status: 409, error: "Nenhuma instancia conectada." });
  assert.equal(chamadas.filter((c) => !c.url.pathname.startsWith("/rest/v1/")).length, 0);
});

test("o Sincronizar do painel continua igual: importa o novo, apaga o de terceiro e pede o convite que falta", async () => {
  prepara();
  const depois: Array<() => Promise<void>> = [];

  const r = await sincronizarGrupos(LOJA, {
    somenteContagem: false,
    actorUserId: "usuario-1",
    depois: (tarefa) => {
      depois.push(tarefa);
    },
  });

  assert.deepEqual(r, { ok: true, synced: 3, admin: 3, semBackup: 2, ignorados: 1, removidos: 1 });
  const [upsert] = feitas("POST", "/rest/v1/groups");
  assert.deepEqual(
    (upsert.corpo as Array<Record<string, unknown>>).map((l) => [l.whatsapp_group_id, l.members, l.is_admin]),
    [
      ["g1@g.us", 980, true],
      ["g2@g.us", 500, true],
      ["g3@g.us", 40, true],
    ],
  );
  const [apagar] = chamadas.filter((c) => c.metodo === "DELETE");
  assert.equal(apagar.url.pathname, "/rest/v1/groups");
  assert.equal(apagar.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.match(String(apagar.url.searchParams.get("whatsapp_group_id")), /^in\.\("?g4@g\.us"?\)$/);
  const [convites] = feitas("POST", "/rest/v1/group_bulk_jobs");
  assert.deepEqual(
    (convites.corpo as Array<Record<string, unknown>>).map((j) => [j.action, j.whatsapp_group_id]),
    [["check_invite", "g3@g.us"]],
  );
  // Participantes e comunidades ficam para depois da resposta, como antes.
  assert.equal(depois.length, 1);
  const [log] = feitas("POST", "/rest/v1/logs");
  const corpo = log.corpo as Record<string, unknown>;
  assert.equal(corpo.event, "groups.synced");
  assert.equal(corpo.actor_user_id, "usuario-1");
  assert.deepEqual(comandosDaTrava(), ["set", "del"]);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/sincronizar.test.ts
```

  Esperado: **FAIL** — o `before` não acha `./sincronizar`.

- [ ] **Step 3 (implementação, store):** em `stores/groups.ts`, logo depois do fim de `insertNewGroups` (a linha `}` que fecha a função, logo antes do comentário de `listMemberCounts`), acrescentar:

```ts

/**
 * Recontagem diária: regrava `members` e `admins_*` de grupos que JÁ existem.
 *
 * `name` vai junto só porque `groups.name` é NOT NULL e o Postgres confere NOT
 * NULL na linha proposta ANTES de achar o conflito do upsert — sem ele o upsert
 * falha inteiro. É o mesmo nome que o sync grava. Nada de `is_admin`,
 * `invite_url` ou comunidade: quem decide isso é o Sincronizar.
 *
 * Quem chama filtra para grupos já gravados; um JID novo aqui viraria linha nova.
 * O upsert passa pelo trigger `groups_marca_lotado` (PR 1 do "postar por grupo"):
 * é assim que a contagem corrigida traz a marca de lotado.
 */
export async function updateGroupCounts(
  tenantId: string,
  groups: ReadonlyArray<{
    whatsapp_group_id: string;
    name: string;
    members: number;
    admins_total: number;
    admins_ours: number;
    admins_counted_at: string;
  }>,
): Promise<number> {
  if (groups.length === 0) return 0;
  const rows = groups.map((g) => ({ ...g, tenant_id: tenantId }));
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "tenant_id,whatsapp_group_id" })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
```

- [ ] **Step 4 (implementação, núcleo):** criar `apps/web/src/lib/groups/sincronizar.ts`:

```ts
import "server-only";
import { after } from "next/server";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { classificarPapel } from "@/lib/communities/papel";
import {
  EvolutionError,
  FETCH_GROUPS_TIMEOUT_MS,
  fetchAllGroups,
  isEvolutionTimeout,
  providerInstanceId,
  type EvolutionGroup,
} from "@/lib/evolution/client";
import { tallyAdmins } from "@/lib/groups/admin-protection";
import { selecionarGruposSemConvite } from "@/lib/groups/invite-enqueue";
import { escolherContagem } from "@/lib/groups/member-count";
import { liberarSync, travarSync } from "@/lib/groups/sync-lock";
import { partitionByAdmin } from "@/lib/groups/sync-partition";
import { enqueueBulkJobs, listPendingCheckInviteGroupIds } from "@/lib/stores/group-bulk-jobs";
import { upsertParticipantesDoGrupo } from "@/lib/stores/group-participants";
import {
  listGroups,
  listMemberCounts,
  removeGroupsByWhatsappIds,
  syncGroupsFromProvider,
  updateGroupCounts,
} from "@/lib/stores/groups";
import { espelharComunidadesNativas } from "@/lib/stores/communities";
import { getInstance, listInstances, type Instance } from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Núcleo do sync de grupos (Evolution → `groups`), extraído de
 * `POST /api/groups/sync` para a recontagem diária reusar (spec "postar por
 * grupo" §6.3).
 *
 * Dois modos:
 * - completo (`somenteContagem: false`): o botão Sincronizar e o auto-sync de
 *   /painel/conectar. Importa grupo novo, grava nome/admin/comunidade, apaga o que
 *   deixou de ser nosso, grava os participantes e enfileira a revisão de convite.
 *   O comportamento de sempre.
 * - recontagem (`somenteContagem: true`): o worker, 1×/dia. Só `members` (com a
 *   proteção contra payload truncado) e `admins_*` dos grupos que JÁ estão no
 *   banco. Não importa, não apaga, não mexe em convite nem em participante.
 *
 * Os dois respeitam a trava de um sync por número (#397).
 *
 * Nome de grupo é conteúdo controlado por terceiros: entra no banco como texto e
 * só pode ser renderizado via escape do JSX. Nada de `dangerouslySetInnerHTML`.
 */

export type OpcoesDoSync = {
  somenteContagem: boolean;
  /** Instância escolhida no painel; sem ela, a primeira conectada. */
  instanceId?: string;
  /** Quem pediu, para `logs` e funil. Nulo quando é o worker. */
  actorUserId?: string | null;
  /**
   * Quem roda o que fica para depois da resposta (participantes e comunidades).
   * A rota não passa nada e usa o `after` do Next; só o teste passa outro,
   * porque fora de uma request o `after` lança.
   */
  depois?: (tarefa: () => Promise<void>) => void;
};

export type ResultadoDoSync =
  | { ok: true; synced: number; admin: number; semBackup: number; ignorados: number; removidos: number }
  | { ok: false; status: 409 | 502 | 504; error: string };

/** Linha que o sync grava em `groups` (o payload de `syncGroupsFromProvider`). */
type LinhaDoSync = Parameters<typeof syncGroupsFromProvider>[1][number];

/** O que os dois modos já sabem depois de ler a Evolution. */
type Leitura = {
  tenantId: string;
  actorUserId: string | null;
  depois: (tarefa: () => Promise<void>) => void;
  instance: Instance;
  remoteGroups: EvolutionGroup[];
  fetchMs: number | undefined;
  gruposAdmin: EvolutionGroup[];
  descartar: string[];
  deteccaoSuspeita: boolean;
  anterior: Map<string, number>;
  rows: LinhaDoSync[];
  protegidos: number;
};

const MENSAGEM_TRAVADO =
  "Os grupos deste numero ja estao sendo sincronizados. Aguarde um minuto e atualize a pagina.";

export async function sincronizarGrupos(tenantId: string, opts: OpcoesDoSync): Promise<ResultadoDoSync> {
  const actorUserId = opts.actorUserId ?? null;
  // Id da instância cuja trava ESTA chamada segura — só ela pode liberá-la.
  let travada: string | null = null;
  let fetchMs: number | undefined;
  try {
    const instance = opts.instanceId
      ? await getInstance(tenantId, opts.instanceId)
      : ((await listInstances(tenantId)).find((i) => i.status === "connected") ?? null);
    if (!instance) return { ok: false, status: 409, error: "Nenhuma instancia conectada." };
    if (instance.status !== "connected") {
      return { ok: false, status: 409, error: "A instancia precisa estar conectada para sincronizar grupos." };
    }

    // Um sync por número de cada vez (ver sync-lock.ts). O caso comum é o
    // auto-sync de /painel/conectar ainda rodando quando o lojista clica — e,
    // desde a recontagem diária, o worker passando na mesma hora.
    if (!(await travarSync(instance.id))) return { ok: false, status: 409, error: MENSAGEM_TRAVADO };
    travada = instance.id;

    const remoteName = instance.provider_instance_id || providerInstanceId(instance.id);

    // Mede o fetch para a próxima decisão sobre o teto não ser chute: o log
    // carrega quanto a Evolution demorou, no sucesso e no timeout.
    //
    // Não há plano B depois de um timeout. Existiu (lista sem participantes,
    // 15s) e falhou 5 de 5 vezes entre 05 e 06/10: abortar o fetch daqui não
    // para a Evolution, e a segunda chamada entrava na fila atrás da primeira.
    const iniciouFetch = Date.now();
    let remoteGroups: EvolutionGroup[];
    try {
      remoteGroups = await fetchAllGroups(remoteName);
    } finally {
      fetchMs = Date.now() - iniciouFetch;
    }

    const leitura = await lerGrupos({
      tenantId,
      actorUserId,
      depois: opts.depois ?? after,
      instance,
      remoteGroups,
      fetchMs,
    });
    return opts.somenteContagem ? await gravarRecontagem(leitura) : await gravarSyncCompleto(leitura);
  } catch (error) {
    return await falhaDoSync(error, { tenantId, actorUserId, fetchMs, somenteContagem: opts.somenteContagem });
  } finally {
    if (travada) await liberarSync(travada);
  }
}

/** Contagem e admins de cada grupo que administramos — a parte que os dois modos gravam. */
async function lerGrupos(
  base: Pick<Leitura, "tenantId" | "actorUserId" | "depois" | "instance" | "remoteGroups" | "fetchMs">,
): Promise<Leitura> {
  // Proteção do ativo (R1): "nosso" é qualquer número do tenant, não só o que
  // está sincronizando. Quando houver uma segunda instância, é ela que faz o
  // grupo deixar de depender de um único admin — e o sync precisa enxergá-la.
  const ourPhones = (await listInstances(base.tenantId)).map((i) => i.phone);
  const countedAt = new Date().toISOString();

  // Só entra o que administramos. Grupo onde o número é mero participante não
  // dispara, não captura lead e não cresce — guardá-lo era manter uma base de
  // contatos de terceiros parada no banco (ver sync-partition.ts).
  const { admin: gruposAdmin, descartar, deteccaoSuspeita } = partitionByAdmin(
    base.remoteGroups,
    base.instance.phone,
  );

  // Contagem já gravada, para não deixar um payload truncado apagá-la.
  const anterior = await listMemberCounts(base.tenantId);
  const linhas = gruposAdmin.map((g) => linhaDoGrupo(g, ourPhones, countedAt, anterior.get(String(g.id))));

  return {
    ...base,
    gruposAdmin,
    descartar,
    deteccaoSuspeita,
    anterior,
    rows: linhas.map((l) => l.linha),
    protegidos: linhas.filter((l) => l.protegido).length,
  };
}

function linhaDoGrupo(
  g: EvolutionGroup,
  ourPhones: (string | null)[],
  countedAt: string,
  jaGravado: number | undefined,
): { linha: LinhaDoSync; protegido: boolean } {
  const tally = tallyAdmins(g.participants, ourPhones);
  // `size` é o campo declarado pela Evolution; `participants` é a lista que
  // ela realmente entregou. Quando divergem, o maior é o que existe: um
  // `size` menor que a lista significa contagem desatualizada do lado dela,
  // e nunca o contrário — a lista não inventa gente.
  const doProvedor = Math.max(
    typeof g.size === "number" && g.size >= 0 ? g.size : 0,
    g.participants?.length ?? 0,
  );
  const contagem = escolherContagem(doProvedor, jaGravado);
  const vinculo = classificarPapel({
    id: String(g.id),
    isCommunity: g.isCommunity,
    isCommunityAnnounce: g.isCommunityAnnounce,
    linkedParent: g.linkedParent,
  });
  return {
    protegido: contagem.protegido,
    linha: {
      whatsapp_group_id: String(g.id),
      name: (g.subject ?? "").trim().slice(0, 200) || "Grupo sem nome",
      members: contagem.members,
      is_admin: true,
      // Esta é a única leitura que vê a lista inteira de participantes; o
      // webhook só mantém o número vivo daqui em diante.
      admins_total: tally.total,
      admins_ours: tally.ours,
      admins_counted_at: countedAt,
      community_jid: vinculo.communityJid,
      community_role: vinculo.communityRole,
    },
  };
}

/**
 * Recontagem: só os grupos que JÁ estão no banco, só contagem. Importar grupo
 * novo ou apagar o que deixou de ser nosso é decisão do Sincronizar, que o
 * lojista vê acontecer — fazer isso de madrugada mudaria a lista dele sem
 * ninguém pedir.
 */
async function gravarRecontagem(l: Leitura): Promise<ResultadoDoSync> {
  const contagens = l.rows
    .filter((r) => l.anterior.has(r.whatsapp_group_id))
    .map((r) => ({
      whatsapp_group_id: r.whatsapp_group_id,
      name: r.name,
      members: r.members,
      admins_total: r.admins_total,
      admins_ours: r.admins_ours,
      admins_counted_at: r.admins_counted_at,
    }));
  const atualizados = await updateGroupCounts(l.tenantId, contagens);
  const semBackup = contagens.filter((r) => r.admins_total <= 1).length;

  await registrarLog(
    l,
    "groups.recounted",
    `${atualizados} grupos recontados (${l.protegidos} com contagem preservada de payload truncado).`,
    { count: atualizados, removidos: 0, sem_backup: semBackup, convites_enfileirados: 0 },
  );
  return {
    ok: true,
    synced: atualizados,
    admin: contagens.length,
    semBackup,
    ignorados: l.remoteGroups.length - l.rows.length,
    removidos: 0,
  };
}

/** O Sincronizar do painel: o comportamento de sempre de `POST /api/groups/sync`. */
async function gravarSyncCompleto(l: Leitura): Promise<ResultadoDoSync> {
  const synced = await syncGroupsFromProvider(l.tenantId, l.rows);
  gravarParticipantesDepois(l);
  const convitesEnfileirados = await enfileirarConvites(l.tenantId);

  // Limpa o que sobrou de antes de o filtro existir. `descartar` vem vazio
  // quando a detecção é suspeita, então uma quebra de contrato da Evolution
  // não apaga a base do lojista.
  const removidos = await removeGroupsByWhatsappIds(l.tenantId, l.descartar);
  const admin = l.rows.length;
  const semBackup = l.rows.filter((r) => r.admins_total <= 1).length;
  const ignorados = l.remoteGroups.length - admin;

  // Marco de ativação. Era a única etapa do funil do admin que nunca populava
  // — o evento existia no tipo desde sempre e não tinha quem o emitisse.
  // Uma sync que não trouxe grupo nenhum não é marco: o lojista conectou mas
  // ainda não tem o que sincronizar.
  if (synced > 0) {
    void trackFunnelEvent({
      tenantId: l.tenantId,
      userId: l.actorUserId,
      event: "first_group_synced",
      onlyFirst: true,
      metadata: { count: synced, adminCount: admin },
    });
  }

  await registrarLog(
    l,
    "groups.synced",
    `${synced} grupos admin sincronizados (${ignorados} ignorados por nao sermos admin, ${removidos} removidos, ${l.protegidos} com contagem preservada de payload truncado).`,
    { count: synced, removidos, sem_backup: semBackup, convites_enfileirados: convitesEnfileirados },
  );
  return { ok: true, synced, admin, semBackup, ignorados, removidos };
}

/**
 * Fase 3 de Comunidades: a mesma leitura do sync já tem os participantes —
 * zero chamada nova à Evolution. Falha aqui não pode derrubar o sync: alcance
 * real é enriquecimento, não o que o lojista veio fazer. E não pode ficar no
 * caminho crítico da resposta: a rota já tem maxDuration=60 por causa da
 * Evolution; `after()` roda depois que a resposta já saiu.
 */
function gravarParticipantesDepois(l: Leitura): void {
  l.depois(async () => {
    const r = await Promise.allSettled(
      l.gruposAdmin.map((g) =>
        upsertParticipantesDoGrupo(
          l.tenantId,
          String(g.id),
          (g.participants ?? [])
            .filter((p): p is { id: string; phoneNumber?: string | null; admin?: string | null } => Boolean(p?.id))
            .map((p) => ({
              participantLid: p.id,
              phone: p.phoneNumber ?? null,
              isAdmin: p.admin === "admin" || p.admin === "superadmin",
            })),
        ),
      ),
    );
    const falhas = r.filter((x) => x.status === "rejected");
    if (falhas.length > 0) {
      console.error(`[groups/sincronizar] ${falhas.length} grupo(s) sem participantes gravados:`, falhas[0]);
    }

    try {
      await espelharComunidadesNativas(l.tenantId);
    } catch (e) {
      // Espelhar comunidade é enriquecimento; falhar aqui não pode derrubar
      // um sync que o lojista veio fazer por outro motivo.
      console.error("[groups/sincronizar] falha ao espelhar comunidades nativas:", e);
    }
  });
}

/**
 * Backfill de convite pela fila do lote (15/min), no lugar do cron diário.
 * Falha aqui não pode derrubar o sync: convite é enriquecimento.
 */
async function enfileirarConvites(tenantId: string): Promise<number> {
  try {
    const [grupos, jaNaFila] = await Promise.all([listGroups(tenantId), listPendingCheckInviteGroupIds(tenantId)]);
    const alvos = selecionarGruposSemConvite(grupos, jaNaFila);
    if (alvos.length === 0) return 0;
    return await enqueueBulkJobs(
      tenantId,
      alvos.map((g) => ({
        tenant_id: tenantId,
        campaign_group_id: null,
        batch_id: crypto.randomUUID(),
        action: "check_invite" as const,
        group_id: g.id,
        whatsapp_group_id: g.whatsapp_group_id as string,
        description: null,
        media_id: null,
        target_phone: null,
      })),
    );
  } catch (err) {
    console.error("[groups/sincronizar] backfill de convite nao enfileirou:", err);
    return 0;
  }
}

async function registrarLog(
  l: Leitura,
  evento: "groups.synced" | "groups.recounted",
  mensagem: string,
  extra: { count: number; removidos: number; sem_backup: number; convites_enfileirados: number },
): Promise<void> {
  await getSupabaseAdmin().from("logs").insert({
    tenant_id: l.tenantId,
    actor_user_id: l.actorUserId,
    // Nenhum grupo admin, com grupos existindo, é sinal de detecção quebrada
    // — não de conta sem grupos. A engine emitia o mesmo aviso.
    level: l.deteccaoSuspeita ? "warn" : "info",
    event: evento,
    message: l.deteccaoSuspeita
      ? `Nenhum grupo admin detectado entre os ${l.remoteGroups.length} do numero — nada foi importado nem removido.`
      : mensagem,
    metadata: {
      instance_id: l.instance.id,
      count: extra.count,
      admin_count: l.rows.length,
      // Quantos grupos o número participa sem administrar. Ficam de fora do
      // banco de propósito.
      ignorados: l.remoteGroups.length - l.rows.length,
      // Quantos não-admin já gravados este sync limpou.
      removidos: extra.removidos,
      // Grupos cuja contagem antiga foi mantida porque o provedor devolveu
      // payload truncado (evolution-api#2124).
      protegidos: l.protegidos,
      // Quantos grupos ficariam órfãos se este número caísse.
      sem_backup: extra.sem_backup,
      // Quanto a Evolution levou. Cresce com o número de grupos; é o que
      // decide se o teto (FETCH_GROUPS_TIMEOUT_MS) ainda cabe.
      fetch_ms: l.fetchMs,
      // Backfill de convite pela fila do lote, disparado neste mesmo sync.
      convites_enfileirados: extra.convites_enfileirados,
    },
  });
}

/**
 * Traduz a falha para o lojista e DEIXA RASTRO.
 *
 * O catch anterior devolvia 502 "Erro ao sincronizar grupos." e não gravava
 * nada: quando o sync começou a estourar o tempo em 31/08, a única evidência
 * existia no painel da Vercel, e foi preciso a CLI para descobrir que era
 * timeout. Um erro que não se registra custa uma investigação inteira toda vez.
 */
async function falhaDoSync(
  error: unknown,
  ctx: { tenantId: string; actorUserId: string | null; fetchMs: number | undefined; somenteContagem: boolean },
): Promise<ResultadoDoSync> {
  const evo = error instanceof EvolutionError ? error : null;
  const expirou = isEvolutionTimeout(error);

  const mensagem = expirou
    ? "O WhatsApp demorou demais para responder a lista de grupos. Isso costuma acontecer logo depois de conectar ou com muitos grupos. Tente de novo em alguns minutos."
    : "Erro ao sincronizar grupos.";

  try {
    await getSupabaseAdmin().from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.actorUserId,
      level: "error",
      event: ctx.somenteContagem ? "groups.recount_failed" : "groups.sync_failed",
      message: expirou
        ? `Sync de grupos expirou: a Evolution não respondeu em ${Math.round(FETCH_GROUPS_TIMEOUT_MS / 1000)}s.`
        : `Sync de grupos falhou: ${evo ? evo.message : String(error)}`,
      metadata: {
        timeout: expirou,
        status: evo?.status ?? null,
        detail: evo?.detail ?? null,
        // Ausente quando a falha veio antes do fetch.
        fetch_ms: ctx.fetchMs ?? null,
      },
    });
  } catch (logError) {
    // Falhar ao registrar a falha não pode virar uma terceira falha: o lojista
    // ainda precisa da resposta.
    console.error("[groups/sincronizar] nao consegui registrar a falha:", logError);
  }

  // 504 quando é tempo: o status diz a verdade sobre o que houve, e separa isto
  // de "a Evolution respondeu erro" nas métricas.
  return { ok: false, status: expirou ? 504 : 502, error: mensagem };
}
```

- [ ] **Step 5:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/sincronizar.test.ts
```

  Esperado: **PASS** (`# pass 5`, `# fail 0`). Se falhar só nas asserções de `comandosDaTrava` (a forma do corpo do Upstash 1.38 diferir do fake), conferir o pedido real com um `console.log(JSON.stringify(chamadas.filter((c) => c.url.pathname.startsWith("/upstash"))))` temporário e ajustar **o fake**, nunca a trava; tirar o log antes do commit.

- [ ] **Step 6 (mutantes):** um de cada vez, rodar o Step 5 e reverter:
  - em `gravarRecontagem`, apagar o `.filter((r) => l.anterior.has(r.whatsapp_group_id))` → **FAIL** (o `g3` novo entra no upsert);
  - em `sincronizarGrupos`, trocar `if (!(await travarSync(instance.id))) return …` por `await travarSync(instance.id);` → **FAIL** no teste da trava ocupada (a Evolution é chamada);
  - em `gravarRecontagem`, trocar `updateGroupCounts(l.tenantId, contagens)` por `syncGroupsFromProvider(l.tenantId, l.rows)` → **FAIL** (chaves do payload e o `g3`).

- [ ] **Step 7:** tipos:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```

  Esperado: sem erro. (A rota ainda tem a cópia antiga — a Task 12 a remove.)

- [ ] **Step 8:** commit:

```powershell
git -C <wt> add apps/web/src/lib/stores/groups.ts apps/web/src/lib/groups/sincronizar.ts apps/web/src/lib/groups/sincronizar.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 3 arquivos.

```powershell
git -C <wt> commit -m "refactor(groups): extract sincronizarGrupos with a count-only recount mode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: `POST /api/groups/sync` delega a `sincronizarGrupos`

**Files:** modificar `apps/web/src/app/api/groups/sync/route.ts` (arquivo inteiro, 343 linhas → ~45)
**Depends-on:** Task 11
**Interfaces:**
- Consumes: `sincronizarGrupos` (Task 11).
- Produces: a mesma rota, a mesma resposta (`{ synced, admin, semBackup, ignorados, removidos }` ou `{ error }` com 401/403/409/502/504).

- [ ] **Step 1:** substituir o conteúdo de `apps/web/src/app/api/groups/sync/route.ts` por:

```ts
import { sincronizarGrupos } from "@/lib/groups/sincronizar";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A Evolution busca a foto de perfil de cada grupo em série antes de responder,
 * então o fetch escala com o número de grupos. O default da Vercel (10-15s)
 * cortaria o sync de quem tem muitos grupos — exatamente quem mais precisa.
 */
export const maxDuration = 60;

/**
 * Importa os grupos da instância conectada (o botão Sincronizar e o auto-sync
 * de /painel/conectar).
 *
 * Só o que o WhatsApp é dono é gravado — a seleção e a capacidade definidas no
 * painel sobrevivem ao sync (ver `syncGroupsFromProvider`). O núcleo mora em
 * `sincronizarGrupos`, que a recontagem diária (`/api/groups/recount`) reusa
 * com `somenteContagem`.
 */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof getTenantContext>>;
  try {
    ctx = await getTenantContext(req);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao sincronizar grupos." }, { status: 502 });
  }

  const body = (await req.json().catch(() => ({}))) as { instance_id?: string };
  const resultado = await sincronizarGrupos(ctx.tenantId, {
    somenteContagem: false,
    instanceId: body.instance_id ? String(body.instance_id) : undefined,
    actorUserId: ctx.authUserId,
  });
  if (!resultado.ok) return Response.json({ error: resultado.error }, { status: resultado.status });

  const { synced, admin, semBackup, ignorados, removidos } = resultado;
  return Response.json({ synced, admin, semBackup, ignorados, removidos });
}
```

- [ ] **Step 2:** conferir condição a condição que nada se perdeu na mudança de lugar (`finding-gate-de-exibicao-some-no-diff`):

```powershell
git -C <wt> show origin/main:apps/web/src/app/api/groups/sync/route.ts
```

  Para cada item, apontar a linha correspondente em `sincronizar.ts` ou na rota nova: (1) `instance_id` → `getInstance`; (2) sem instância → 409 "Nenhuma instancia conectada."; (3) não conectada → 409; (4) trava ocupada → 409 com a mesma frase; (5) `fetchMs` medido no `finally`; (6) `partitionByAdmin(remoteGroups, instance.phone)`; (7) `listInstances` de novo para `ourPhones`; (8) `escolherContagem` com `listMemberCounts`; (9) `syncGroupsFromProvider`; (10) participantes + `espelharComunidadesNativas` depois da resposta; (11) backfill de convite em try/catch; (12) `removeGroupsByWhatsappIds(descartar)`; (13) funil `first_group_synced` só com `synced > 0`; (14) log `groups.synced` com as 9 chaves de `metadata` (`instance_id, count, admin_count, ignorados, removidos, protegidos, sem_backup, fetch_ms, convites_enfileirados`) e `level` warn na detecção suspeita; (15) resposta `{ synced, admin, semBackup, ignorados, removidos }`; (16) falha → log `groups.sync_failed` + 504/502 com as mesmas mensagens; (17) `liberarSync` no `finally`. Faltou algum → corrigir em `sincronizar.ts` e cobrir no teste do modo completo (Task 11) antes de seguir.

- [ ] **Step 3:** tipos, lint e os testes do núcleo:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```
```powershell
Set-Location <wt>\apps\web; npm run lint
```
```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/sincronizar.test.ts
```

  Esperado: sem erro; `# fail 0`.

- [ ] **Step 4:** commit:

```powershell
git -C <wt> add apps/web/src/app/api/groups/sync/route.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: só a rota.

```powershell
git -C <wt> commit -m "refactor(groups): sync route delegates to sincronizarGrupos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: `POST /api/groups/recount` engine-only (TDD)

**Files:** criar `apps/web/src/app/api/groups/recount/route.ts`, `apps/web/src/app/api/groups/recount/route.test.ts`; modificar `apps/web/src/lib/security/request-access-policy.ts` (linhas 26-28), `apps/web/src/lib/security/request-access-policy.test.ts` (depois da linha 31)
**Depends-on:** Task 11
**Interfaces:**
- Consumes: `sincronizarGrupos` (Task 11), `getRouteTenantContext(req, { allowEngine: true })`.
- Produces (contrato §4): `POST /api/groups/recount`, header `x-engine-token` + `x-tenant-id` → 200 `{ ok: true, atualizados: number }`; 409/502/504 `{ error }` repassados de `sincronizarGrupos`; 401 token errado; 403 sem token (middleware) ou usuário logado (handler).

- [ ] **Step 1 (teste, middleware):** em `request-access-policy.test.ts`, logo depois do teste `"bulk group actions are engine-only — …"` (que termina na linha 31), acrescentar:

```ts

test("a recontagem diária é engine-only — fora da lista o worker leva 401 para sempre", () => {
  // Mesmo motivo das ações em massa: o middleware só olha o x-engine-token das
  // rotas desta lista; fora dela a recontagem cairia no gate de sessão e o
  // sintoma (contagem que nunca anda) apontaria para o worker.
  assert.equal(classifyRequest("/api/groups/recount", "POST"), "engine-only");
});
```

- [ ] **Step 2 (teste, rota):** criar `apps/web/src/app/api/groups/recount/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { POST as Post } from "./route";

/**
 * A rota da recontagem contra um Supabase e uma Evolution de mentira (o desenho
 * de `api/orders/route.test.ts`). O worker depende de duas coisas daqui: só a
 * engine entra, e a resposta é `{ ok: true, atualizados }`.
 */

const LOJA = "5b7e3c1a-2d4f-4a6b-8c9d-0e1f2a3b4c5d";
const TOKEN = "token-da-engine-de-teste";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];

const RESPOSTAS: Record<string, Resposta> = {
  "GET /rest/v1/organizations": { status: 200, corpo: [{ id: LOJA, status: "active" }] },
  "GET /rest/v1/instances": {
    status: 200,
    corpo: [
      {
        id: "inst-1",
        tenant_id: LOJA,
        name: "Número 1",
        phone: "5511999990000",
        status: "connected",
        qr_code: null,
        provider: "evolution",
        provider_instance_id: "gr_inst-1",
        last_seen_at: null,
        connected_at: null,
        metadata: {},
        created_at: "2026-09-01T00:00:00+00:00",
        updated_at: "2026-09-01T00:00:00+00:00",
      },
    ],
  },
  "GET /rest/v1/groups": { status: 200, corpo: [{ whatsapp_group_id: "g1@g.us", members: 900 }] },
  "POST /rest/v1/groups": { status: 201, corpo: [{ id: "row-1" }] },
  "POST /rest/v1/logs": { status: 201 },
  "GET /auth/v1/user": { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } },
  "GET /rest/v1/memberships": { status: 200, corpo: [{ tenant_id: LOJA, role: "owner" }] },
  "GET /group/fetchAllGroups/gr_inst-1": {
    status: 200,
    corpo: [
      {
        id: "g1@g.us",
        subject: "Moda Kids 1",
        size: 950,
        participants: [{ id: "5511999990000@s.whatsapp.net", phoneNumber: "5511999990000@s.whatsapp.net", admin: "superadmin" }],
      },
    ],
  },
};

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = RESPOSTAS[`${chamada.metodo} ${chamada.url.pathname}`] ?? {
      status: 500,
      corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` },
    };
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let POST: typeof Post;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.EVOLUTION_API_URL = base;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  // Sem Upstash a trava fica desligada (o pior caso é o de antes do #397); ela
  // tem teste próprio em sincronizar.test.ts.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  // `ENGINE_TOKEN` é lido na importação de `@/lib/auth`.
  process.env.ENGINE_TOKEN = TOKEN;
  ({ POST } = await import("./route"));
});

after(() => {
  servidor.close();
});

const pedido = (headers: Record<string, string>) =>
  new Request("http://girumo.test/api/groups/recount", { method: "POST", headers });

test("a engine reconta a loja do x-tenant-id e recebe { ok, atualizados }", async () => {
  chamadas.length = 0;

  const res = await POST(pedido({ "x-engine-token": TOKEN, "x-tenant-id": LOJA }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, atualizados: 1 });
  // O tenant vem do header validado — toda leitura de dado da loja filtra por ele.
  for (const c of chamadas.filter((c) => c.metodo === "GET" && c.url.pathname.startsWith("/rest/v1/") && c.url.pathname !== "/rest/v1/organizations")) {
    assert.equal(c.url.searchParams.get("tenant_id"), `eq.${LOJA}`, c.url.pathname);
  }
  const [upsert] = chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/groups");
  assert.equal((upsert.corpo as Array<Record<string, unknown>>)[0].tenant_id, LOJA);
});

test("usuário logado não reconta: a rota é da engine", async () => {
  chamadas.length = 0;

  const res = await POST(pedido({ authorization: "Bearer token-falso", "x-tenant-id": LOJA }));

  assert.equal(res.status, 403);
  // Mutante: aceitar o dono — vira um segundo Sincronizar, sem tela e sem trava de UI.
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/group/")).length, 0);
});

test("token da engine errado volta 401, não 500", async () => {
  const res = await POST(pedido({ "x-engine-token": "outro-token", "x-tenant-id": LOJA }));

  assert.equal(res.status, 401);
});
```

- [ ] **Step 3:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/request-access-policy.test.ts src/app/api/groups/recount/route.test.ts
```

  Esperado: **FAIL** — a política classifica a rota como `"user"`, e `./route` não existe.

- [ ] **Step 4 (implementação, middleware):** em `request-access-policy.ts`, trocar (linhas 26-28):

```ts
  "POST /api/groups/bulk/pending",
  "POST /api/groups/bulk/ack",
]);
```

  por:

```ts
  "POST /api/groups/bulk/pending",
  "POST /api/groups/bulk/ack",
  // Recontagem diária dos grupos (worker, 1×/dia).
  "POST /api/groups/recount",
]);
```

- [ ] **Step 5 (implementação, rota):** criar `apps/web/src/app/api/groups/recount/route.ts`:

```ts
import { sincronizarGrupos } from "@/lib/groups/sincronizar";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mesmo teto do Sincronizar: o `fetchAllGroups` da Evolution chega a 50 s. */
export const maxDuration = 60;

/**
 * POST /api/groups/recount — o WORKER reconta os grupos de uma loja (1×/dia).
 *
 * Só `members` (com a proteção contra payload truncado) e `admins_*` dos grupos
 * que já estão no banco: sem grupo novo, sem remoção, sem convite. Evento de
 * webhook perdido deixava a contagem errada para sempre, e a marca automática de
 * lotado (trigger que olha `members`) nunca vinha. Spec "postar por grupo" §6.3.
 *
 * Engine-only: está no `ENGINE_ONLY` de `request-access-policy.ts` — fora dele o
 * worker levaria 401 para sempre. 409 = já há um sync deste número rodando, ou o
 * número caiu; o worker pula e tenta no dia seguinte.
 */
export async function POST(req: Request) {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: true });
    // O middleware já barra quem não traz o token; isto segura se a rota sair da lista.
    if (ctx.actor !== "engine") return Response.json({ error: "Rota exclusiva da engine." }, { status: 403 });
    tenantId = ctx.tenantId;
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/groups/recount] falha ao resolver o tenant:", error);
    return Response.json({ error: "Erro ao recontar grupos." }, { status: 500 });
  }

  const resultado = await sincronizarGrupos(tenantId, { somenteContagem: true });
  if (!resultado.ok) return Response.json({ error: resultado.error }, { status: resultado.status });
  return Response.json({ ok: true, atualizados: resultado.synced });
}
```

- [ ] **Step 6:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/request-access-policy.test.ts src/app/api/groups/recount/route.test.ts
```

  Esperado: **PASS** nos dois (`# fail 0`).

- [ ] **Step 7:** tipos e lint:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```
```powershell
Set-Location <wt>\apps\web; npm run lint
```

- [ ] **Step 8:** commit:

```powershell
git -C <wt> add apps/web/src/app/api/groups/recount/route.ts apps/web/src/app/api/groups/recount/route.test.ts apps/web/src/lib/security/request-access-policy.ts apps/web/src/lib/security/request-access-policy.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 4 arquivos.

```powershell
git -C <wt> commit -m "feat(groups): engine-only POST /api/groups/recount for the daily recount" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: env do worker — intervalo e chave da recontagem (TDD)

**Files:** modificar `apps/worker/src/env.ts` (linhas 62-68, 117-120), `apps/worker/src/env.test.ts` (fim do arquivo)
**Depends-on:** Task 10
**Interfaces:**
- Produces: `WorkerEnv.recountEnabled: boolean` (`WORKER_RECOUNT_ENABLED`, só `"true"` liga) e `WorkerEnv.recountIntervalMs: number` (`WORKER_RECOUNT_INTERVAL_MS`, padrão `86_400_000`, mínimo `3_600_000`).

`WORKER_RECOUNT_ENABLED` não está no contrato: entra porque todo loop do worker que fala com o WhatsApp nasce em DRY-RUN e liga à mão (send, grow, lote), e é o único jeito de desligar a recontagem sem tirar `APP_URL` (que derruba grow e lote junto).

- [ ] **Step 1 (teste):** acrescentar ao fim de `apps/worker/src/env.test.ts`:

```ts

test("recountEnabled e false por default — a recontagem nasce em dry-run como os outros loops", () => {
  withEnv({ WORKER_RECOUNT_ENABLED: undefined }, () => {
    assert.equal(loadEnv().recountEnabled, false);
  });
  withEnv({ WORKER_RECOUNT_ENABLED: "true" }, () => {
    assert.equal(loadEnv().recountEnabled, true);
  });
  withEnv({ WORKER_RECOUNT_ENABLED: "1" }, () => {
    assert.equal(loadEnv().recountEnabled, false);
  });
});

test("recountIntervalMs default e 24h", () => {
  withEnv({ WORKER_RECOUNT_INTERVAL_MS: undefined }, () => {
    assert.equal(loadEnv().recountIntervalMs, 86_400_000);
  });
});

test("recountIntervalMs abaixo de 1h e recusado: cada volta e um fetchAllGroups por loja", () => {
  withEnv({ WORKER_RECOUNT_INTERVAL_MS: "600000" }, () => {
    assert.throws(() => loadEnv(), /WORKER_RECOUNT_INTERVAL_MS/);
  });
  withEnv({ WORKER_RECOUNT_INTERVAL_MS: "3600000" }, () => {
    assert.equal(loadEnv().recountIntervalMs, 3_600_000);
  });
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/env.test.ts
```

  Esperado: **FAIL** nos três testes novos (`undefined`).

- [ ] **Step 3 (implementação):** em `env.ts`, trocar o fim do tipo (linhas 62-68):

```ts
  /**
   * Intervalo entre ticks das ações em massa. É metade do anti-ban — com 1
   * operação por tenant por tick, 4s dá ~15/min ESPAÇADOS. Subir o número de
   * operações por tick ou baixar isto afrouxa o anti-ban.
   */
  bulkIntervalMs: number;
};
```

  por:

```ts
  /**
   * Intervalo entre ticks das ações em massa. É metade do anti-ban — com 1
   * operação por tenant por tick, 4s dá ~15/min ESPAÇADOS. Subir o número de
   * operações por tick ou baixar isto afrouxa o anti-ban.
   */
  bulkIntervalMs: number;
  /**
   * Recontagem real dos grupos. Default `false` (DRY-RUN): o loop lista as lojas
   * e loga quem recontaria, sem chamar o app — a mesma postura de ligar à mão dos
   * outros loops, e o jeito de desligar sem tirar APP_URL (que derruba grow e lote).
   */
  recountEnabled: boolean;
  /**
   * Intervalo da recontagem. Default 24 h; mínimo 1 h: cada volta é um
   * `fetchAllGroups` de até 50 s por loja, numa Evolution que é uma só.
   */
  recountIntervalMs: number;
};
```

  e o fim de `loadEnv` (linhas 117-120):

```ts
    bulkEnabled: boolEnv("WORKER_BULK_ENABLED"),
    // Mínimo de 1s: abaixo disso o espaçamento deixa de ser espaçamento.
    bulkIntervalMs: intEnv("WORKER_BULK_INTERVAL_MS", 4_000, 1_000),
  };
```

  por:

```ts
    bulkEnabled: boolEnv("WORKER_BULK_ENABLED"),
    // Mínimo de 1s: abaixo disso o espaçamento deixa de ser espaçamento.
    bulkIntervalMs: intEnv("WORKER_BULK_INTERVAL_MS", 4_000, 1_000),
    recountEnabled: boolEnv("WORKER_RECOUNT_ENABLED"),
    // Padrão 24 h, mínimo 1 h (ver o tipo).
    recountIntervalMs: intEnv("WORKER_RECOUNT_INTERVAL_MS", 86_400_000, 3_600_000),
  };
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/env.test.ts
```

  Esperado: **PASS** (`# fail 0`).

- [ ] **Step 5:** commit:

```powershell
git -C <wt> add apps/worker/src/env.ts apps/worker/src/env.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 2 arquivos.

```powershell
git -C <wt> commit -m "feat(worker): WORKER_RECOUNT_INTERVAL_MS and WORKER_RECOUNT_ENABLED" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: loop `recontagem` no worker (TDD) + compose

**Files:** criar `apps/worker/src/recount-loop.ts`, `apps/worker/src/recount-loop.test.ts`; modificar `apps/worker/src/index.ts` (linhas 18-20, 35-36, 126-130, 139-140, 162-164, 259), `deploy/coolify/worker.docker-compose.yml` (depois de `WORKER_BULK_INTERVAL_MS`)
**Depends-on:** Task 13 (contrato da rota), Task 14
**Interfaces:**
- Consumes: `AppClient`, `AppRequestError`, `createAppClient` (`app-client.ts`), `distinctTenantIds` (`grow-tenants.ts`), `startLoop` (`loop.ts`), `WorkerEnv.recountEnabled/recountIntervalMs` (Task 14), `POST /api/groups/recount` (Task 13).
- Produces:
```ts
export const RECOUNT_TIMEOUT_MS = 70_000;
export type RecountDeps = { listTenants(): Promise<string[]>; recount(tenantId: string): Promise<number> };
export type RecountTickSummary = { tenants: number; atualizados: number; pulados: number; falhas: number };
export async function runRecountTick(deps: RecountDeps, isStopping?: () => boolean): Promise<RecountTickSummary>;
export function recountDidWork(summary: RecountTickSummary): boolean;
export async function listRecountTenants(supabase: SupabaseClient): Promise<string[]>;
export function makeRecountDeps(supabase: SupabaseClient, app: AppClient): RecountDeps;
export function withRecountDryRun(deps: RecountDeps): RecountDeps;
```

Como os outros loops falam com o app: `grow-deps.ts` faz `app.post<T>(tenantId, "/api/groups/grow/pending")` com o client de `createAppClient({ baseUrl: APP_URL, engineToken: ENGINE_TOKEN })`, que manda `x-engine-token` + `x-tenant-id`. Nenhum loop lista lojas por instância conectada hoje (o grow lista por `campaign_groups.auto_grow`); `listRecountTenants` segue o desenho de `listGrowTenants` e reusa o `distinctTenantIds` (dedupe + ordem estável). O client precisa de teto maior que os 20 s padrão: a rota roda até 60 s.

- [ ] **Step 1 (teste):** criar `apps/worker/src/recount-loop.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AppRequestError, type AppClient } from "./app-client.js";
import {
  RECOUNT_TIMEOUT_MS,
  listRecountTenants,
  makeRecountDeps,
  runRecountTick,
  withRecountDryRun,
  type RecountDeps,
} from "./recount-loop.js";

/** Deps de mentira: três lojas, 10 grupos cada; conta quantas recontagens correm juntas. */
function makeDeps(over: Partial<RecountDeps> = {}): { deps: RecountDeps; chamados: string[]; maxEmVoo: () => number } {
  const chamados: string[] = [];
  let emVoo = 0;
  let maximo = 0;
  const deps: RecountDeps = {
    listTenants: async () => ["t-a", "t-b", "t-c"],
    recount: async (tenantId) => {
      emVoo += 1;
      maximo = Math.max(maximo, emVoo);
      chamados.push(tenantId);
      await new Promise((pronto) => setTimeout(pronto, 5));
      emVoo -= 1;
      return 10;
    },
    ...over,
  };
  return { deps, chamados, maxEmVoo: () => maximo };
}

/** Supabase de mentira para `from("instances").select(...).eq(...)`. */
function supabaseFalso(linhas: Array<{ tenant_id: string }>) {
  const consulta: { tabela?: string; colunas?: string; filtro?: [string, string] } = {};
  const client = {
    from(tabela: string) {
      consulta.tabela = tabela;
      return {
        select(colunas: string) {
          consulta.colunas = colunas;
          return {
            async eq(coluna: string, valor: string) {
              consulta.filtro = [coluna, valor];
              return { data: linhas, error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, consulta };
}

test("reconta uma loja por vez e soma os grupos atualizados", async () => {
  const d = makeDeps();

  const r = await runRecountTick(d.deps);

  assert.deepEqual(r, { tenants: 3, atualizados: 30, pulados: 0, falhas: 0 });
  assert.deepEqual(d.chamados, ["t-a", "t-b", "t-c"]);
  // Mutante: Promise.all — três fetchAllGroups de até 50 s ao mesmo tempo na mesma Evolution.
  assert.equal(d.maxEmVoo(), 1);
});

test("409 (Sincronizar do lojista rodando, ou número caiu) é pulado, não falha, e a próxima loja segue", async () => {
  const d = makeDeps({
    recount: async (tenantId) => {
      if (tenantId === "t-b") throw new AppRequestError(409, "/api/groups/recount", "ja estao sendo sincronizados");
      return 4;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps), { tenants: 3, atualizados: 8, pulados: 1, falhas: 0 });
});

test("erro de uma loja não derruba as outras", async () => {
  const d = makeDeps({
    recount: async (tenantId) => {
      if (tenantId === "t-a") throw new AppRequestError(504, "/api/groups/recount", "demorou");
      return 2;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps), { tenants: 3, atualizados: 4, pulados: 0, falhas: 1 });
});

test("worker encerrando para entre uma loja e outra", async () => {
  let parar = false;
  const d = makeDeps({
    recount: async () => {
      parar = true;
      return 1;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps, () => parar), { tenants: 3, atualizados: 1, pulados: 0, falhas: 0 });
});

test("DRY-RUN lista as lojas e não chama o app", async () => {
  let chamou = 0;
  const d = makeDeps({
    recount: async () => {
      chamou += 1;
      return 9;
    },
  });

  assert.deepEqual(await runRecountTick(withRecountDryRun(d.deps)), { tenants: 3, atualizados: 0, pulados: 0, falhas: 0 });
  assert.equal(chamou, 0);
});

test("a recontagem chama a rota engine do app com a loja e lê os atualizados", async () => {
  const posts: Array<{ tenantId: string; path: string; body: unknown }> = [];
  const app: AppClient = {
    async post<T>(tenantId: string, path: string, body?: unknown): Promise<T> {
      posts.push({ tenantId, path, body });
      return { ok: true, atualizados: 7 } as unknown as T;
    },
  };

  const deps = makeRecountDeps(supabaseFalso([]).client, app);

  assert.equal(await deps.recount("t-a"), 7);
  assert.deepEqual(posts, [{ tenantId: "t-a", path: "/api/groups/recount", body: undefined }]);
});

test("lojas = quem tem número conectado, cada uma uma vez, em ordem estável", async () => {
  const s = supabaseFalso([{ tenant_id: "t-b" }, { tenant_id: "t-a" }, { tenant_id: "t-b" }]);

  assert.deepEqual(await listRecountTenants(s.client), ["t-a", "t-b"]);
  assert.deepEqual(s.consulta, { tabela: "instances", colunas: "tenant_id", filtro: ["status", "connected"] });
});

test("o teto do worker passa do maxDuration da rota (60 s)", () => {
  // Com os 20 s padrão do client, toda recontagem de loja grande (fetchAllGroups de
  // 30–50 s) seria contada como falha, com o app tendo terminado o trabalho.
  assert.ok(RECOUNT_TIMEOUT_MS > 60_000);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/recount-loop.test.ts
```

  Esperado: **FAIL** — `Cannot find module` apontando para `./recount-loop.js`.

- [ ] **Step 3 (implementação):** criar `apps/worker/src/recount-loop.ts`:

```ts
/**
 * Loop de RECONTAGEM: uma vez por dia, reconta os grupos de cada loja com número
 * conectado (spec "postar por grupo" §6.3).
 *
 * Por que existe: a contagem de membros só anda pelo webhook
 * `group-participants.update` e pelo botão Sincronizar. Evento perdido = contagem
 * errada para sempre = a marca automática de lotado (trigger do PR 1, que olha
 * `members`) nunca vem, e o link continua mandando gente para um grupo cheio.
 *
 * A decisão e a escrita moram no app (`POST /api/groups/recount`, que reusa o
 * núcleo do Sincronizar com `somenteContagem`); aqui é só a cadência — o mesmo
 * arranjo do auto-grow.
 *
 * Nasce em DRY-RUN (`WORKER_RECOUNT_ENABLED != true`), como os outros loops: lista
 * as lojas e loga quem recontaria, sem chamar o app.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { AppRequestError, type AppClient } from "./app-client.js";
import { distinctTenantIds } from "./grow-tenants.js";
import { log } from "./log.js";

/**
 * Teto do POST por loja. A rota roda com `maxDuration = 60` (o `fetchAllGroups`
 * da Evolution chega a 50 s): com os 20 s padrão do client, o worker desistiria no
 * meio de toda loja grande e contaria falha de um trabalho que o app terminou.
 */
export const RECOUNT_TIMEOUT_MS = 70_000;

export type RecountDeps = {
  /** Lojas com ao menos um número `connected`. */
  listTenants(): Promise<string[]>;
  /** `POST /api/groups/recount` — quantos grupos tiveram a contagem regravada. */
  recount(tenantId: string): Promise<number>;
};

export type RecountTickSummary = {
  tenants: number;
  atualizados: number;
  /** 409: outro sync do número rodando (trava do #397) ou o número caiu no meio. */
  pulados: number;
  falhas: number;
};

/**
 * Uma volta sobre as lojas, UMA POR VEZ: a Evolution é uma só para todos os
 * números, e cada recontagem é um `fetchAllGroups` de até 50 s. Em paralelo, a
 * volta empilharia chamadas pesadas e derrubaria o Sincronizar de quem clicasse
 * no meio.
 */
export async function runRecountTick(
  deps: RecountDeps,
  isStopping: () => boolean = () => false,
): Promise<RecountTickSummary> {
  const summary: RecountTickSummary = { tenants: 0, atualizados: 0, pulados: 0, falhas: 0 };
  const tenants = await deps.listTenants();
  summary.tenants = tenants.length;

  for (const tenantId of tenants) {
    // Uma volta pode levar minutos; o shutdown não espera por ela inteira.
    if (isStopping()) break;
    try {
      summary.atualizados += await deps.recount(tenantId);
    } catch (err) {
      // Não é falha: amanhã tem outra volta.
      if (err instanceof AppRequestError && err.status === 409) {
        summary.pulados += 1;
        continue;
      }
      summary.falhas += 1;
      log.error("recontagem: loja falhou", {
        tenant_id: tenantId,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }

  return summary;
}

export function recountDidWork(summary: RecountTickSummary): boolean {
  return summary.tenants > 0;
}

/** Lojas distintas com ao menos uma instância `connected`. */
export async function listRecountTenants(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("instances").select("tenant_id").eq("status", "connected");
  if (error) throw new Error(`listRecountTenants: ${error.message}`);
  return distinctTenantIds(data ?? []);
}

export function makeRecountDeps(supabase: SupabaseClient, app: AppClient): RecountDeps {
  return {
    listTenants: () => listRecountTenants(supabase),
    async recount(tenantId) {
      const resposta = await app.post<{ ok: true; atualizados: number }>(tenantId, "/api/groups/recount");
      return typeof resposta?.atualizados === "number" ? resposta.atualizados : 0;
    },
  };
}

/** DRY-RUN: lista as lojas e loga quem recontaria, sem chamar o app. */
export function withRecountDryRun(deps: RecountDeps): RecountDeps {
  return {
    ...deps,
    async recount(tenantId) {
      log.info("DRY-RUN: recontaria os grupos", { tenant_id: tenantId });
      return 0;
    },
  };
}
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/recount-loop.test.ts
```

  Esperado: **PASS** (`# pass 8`, `# fail 0`).

- [ ] **Step 5 (index.ts, cabeçalho):** trocar (linhas 18-20):

```ts
 *  - manutenção da fila: lease vencido, progresso de broadcast e agendamento.
 *    Roda SEMPRE, inclusive sem Evolution configurada (ver housekeeping.ts).
 */
```

  por:

```ts
 *  - manutenção da fila: lease vencido, progresso de broadcast e agendamento.
 *    Roda SEMPRE, inclusive sem Evolution configurada (ver housekeeping.ts);
 *  - recontagem: 1×/dia (WORKER_RECOUNT_INTERVAL_MS), reconta os grupos de cada
 *    loja com número conectado pelo app (/api/groups/recount). Nasce em DRY-RUN,
 *    até WORKER_RECOUNT_ENABLED=true (ver recount-loop.ts).
 */
```

- [ ] **Step 6 (index.ts, import):** trocar (linhas 35-36):

```ts
import { log } from "./log.js";
import { startLoop } from "./loop.js";
```

  por:

```ts
import { log } from "./log.js";
import { startLoop } from "./loop.js";
import {
  RECOUNT_TIMEOUT_MS,
  makeRecountDeps,
  recountDidWork,
  runRecountTick,
  withRecountDryRun,
  type RecountDeps,
} from "./recount-loop.js";
```

- [ ] **Step 7 (index.ts, deps):** trocar (linhas 126-130):

```ts
  log.info("ações em massa ATIVAS: foto, descrição e abrir/fechar serão aplicados de verdade");
  return deps;
}

async function main(): Promise<void> {
```

  por:

```ts
  log.info("ações em massa ATIVAS: foto, descrição e abrir/fechar serão aplicados de verdade");
  return deps;
}

/**
 * Deps da recontagem diária, ou null sem a ponte com o app. Só precisa do app:
 * quem fala com a Evolution é a rota, não o worker.
 */
function buildRecountDeps(env: WorkerEnv, supabase: SupabaseClient): RecountDeps | null {
  if (!env.appBaseUrl || !env.engineToken) {
    log.warn("recontagem desligada: APP_URL/ENGINE_TOKEN ausentes");
    return null;
  }
  const app = createAppClient({
    baseUrl: env.appBaseUrl,
    engineToken: env.engineToken,
    timeoutMs: RECOUNT_TIMEOUT_MS,
  });
  const deps = makeRecountDeps(supabase, app);

  if (!env.recountEnabled) {
    log.warn("recontagem em DRY-RUN: lista as lojas e não reconta (WORKER_RECOUNT_ENABLED != true)");
    return withRecountDryRun(deps);
  }
  log.info("recontagem ATIVA: os grupos de cada loja conectada serão recontados");
  return deps;
}

async function main(): Promise<void> {
```

- [ ] **Step 8 (index.ts, main):** trocar (linhas 139-140):

```ts
  const growDeps = buildGrowDeps(env, supabase);
  const bulkDeps = buildBulkDeps(env, supabase);
```

  por:

```ts
  const growDeps = buildGrowDeps(env, supabase);
  const bulkDeps = buildBulkDeps(env, supabase);
  const recountDeps = buildRecountDeps(env, supabase);
```

  e (linhas 162-164):

```ts
    bulk: bulkDeps ? (env.bulkEnabled ? "on" : "dry-run") : "off",
    bulk_interval_ms: env.bulkIntervalMs,
    health_port: env.healthPort,
```

  por:

```ts
    bulk: bulkDeps ? (env.bulkEnabled ? "on" : "dry-run") : "off",
    bulk_interval_ms: env.bulkIntervalMs,
    recount: recountDeps ? (env.recountEnabled ? "on" : "dry-run") : "off",
    recount_interval_ms: env.recountIntervalMs,
    health_port: env.healthPort,
```

- [ ] **Step 9 (index.ts, loop):** trocar (linha 259):

```ts
  await Promise.all([principal.done, envio?.done, grow?.done, lote?.done]);
```

  por:

```ts
  // 5) recontagem dos grupos, 1×/dia. O primeiro tick roda na subida do container.
  const recontagem = recountDeps
    ? startLoop({
        name: "recontagem",
        intervalMs: env.recountIntervalMs,
        isStopping,
        onError: falhou("ciclo de recontagem"),
        async tick() {
          const recontados = await runRecountTick(recountDeps, isStopping);
          state.lastTickAt = Date.now();
          if (recountDidWork(recontados)) log.info("ciclo de recontagem", recontados);
        },
      })
    : null;

  await Promise.all([principal.done, envio?.done, grow?.done, lote?.done, recontagem?.done]);
```

- [ ] **Step 10 (compose):** em `deploy/coolify/worker.docker-compose.yml`, logo depois da linha `      WORKER_BULK_INTERVAL_MS: ${WORKER_BULK_INTERVAL_MS:-4000}`, acrescentar:

```yaml
      # Recontagem diária dos grupos (Evolution → members/admins_*), uma loja por
      # vez, pelo app (/api/groups/recount). Só LÊ o WhatsApp — o mesmo
      # fetchAllGroups do botão Sincronizar. DRY-RUN por default: o loop lista as
      # lojas e loga "DRY-RUN: recontaria"; vire "true" depois de ler esses logs.
      # O primeiro tick roda na subida do container. Mínimo de 1 h.
      WORKER_RECOUNT_ENABLED: ${WORKER_RECOUNT_ENABLED:-false}
      WORKER_RECOUNT_INTERVAL_MS: ${WORKER_RECOUNT_INTERVAL_MS:-86400000}
```

  Sem isto as variáveis criadas no Coolify não chegam ao container (`finding-egress-supabase-e-polling-do-worker`, `finding-coolify-compose-colado-nao-vem-do-git`: o worker lê o compose do git).

- [ ] **Step 11:** tipos e suíte do worker:

```powershell
Set-Location <wt>\apps\worker; npx tsc --noEmit -p tsconfig.json
```
```powershell
Set-Location <wt>\apps\worker; npm test
```

  Esperado: sem erro; `# fail 0`.

- [ ] **Step 12:** commit:

```powershell
git -C <wt> add apps/worker/src/recount-loop.ts apps/worker/src/recount-loop.test.ts apps/worker/src/index.ts deploy/coolify/worker.docker-compose.yml
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os 4 arquivos.

```powershell
git -C <wt> commit -m "feat(worker): daily group recount loop through /api/groups/recount" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: verificação final do PR 3, revisão, PR, deploy do worker e comandos para o Igor

**Files:** nenhum novo.
**Depends-on:** Tasks 11–15
**Interfaces:** —

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez: `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.e2e.json`, `npm run lint`, `npm test`. Em `<wt>\apps\worker`: `npx tsc --noEmit -p tsconfig.json`, `npm test`.

- [ ] **Step 2:** o gate real:

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`.

- [ ] **Step 3:** revisão final (superpowers:requesting-code-review sobre `git -C <wt> diff origin/main...HEAD`) com foco nos itens 4 e 5 da Review Focus e em: (a) `POST /api/groups/recount` no `ENGINE_ONLY` **e** com o `actor !== "engine"` no handler; (b) o modo completo idêntico ao `route.ts` de `origin/main` (a lista da Task 12 Step 2); (c) nenhuma escrita da recontagem fora de `updateGroupCounts` e do log. CRITICAL/HIGH → corrigir e commitar antes do push.

- [ ] **Step 4:** `git -C <wt> fetch origin main`; `git -C <wt> log HEAD..origin/main --oneline` — commits novos → `git -C <wt> merge origin/main` e Steps 1–2 de novo (o PR 2 pode ter mexido em `stores/groups.ts` em outro trecho).

- [ ] **Step 5:** `git -C <wt> status --short` vazio; `git -C <wt> log origin/main..HEAD --oneline` com os 5 commits das Tasks 11–15.

- [ ] **Step 6:** `kg_insert_text` com `source = "decisao-2026-10-10-postar-por-grupo-recontagem"` e o texto do `rag insert` abaixo.

#### Comandos para o Igor (PR 3)

Push e PR:

```bash
git -C <wt> push -u origin feat/postar-grupo-recontagem
```

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-recontagem --title "feat(groups): recontagem diaria dos grupos (postar por grupo PR 3)" --body "## O que entra

- lib/groups/sincronizar.ts: o nucleo do POST /api/groups/sync mudou de lugar sem mudar de comportamento (sincronizarGrupos). A rota de sempre so delega.
- Modo somenteContagem: regrava members (com a protecao contra payload truncado) e admins_* dos grupos que ja estao no banco. Nao importa grupo novo, nao apaga, nao mexe em convite nem em participante. Respeita a trava de um sync por numero (#397).
- POST /api/groups/recount, engine-only (ENGINE_ONLY + checagem no handler), resposta { ok: true, atualizados }.
- Worker: loop recontagem, uma loja por vez, WORKER_RECOUNT_INTERVAL_MS (padrao 24 h, minimo 1 h). Nasce em DRY-RUN ate WORKER_RECOUNT_ENABLED=true. O primeiro tick roda na subida do container.

## Por que

Evento de webhook perdido deixava a contagem errada para sempre, e a marca automatica de lotado (trigger do PR 1, que olha members) nunca vinha.

## Teste

- [x] npm test (web e worker), tsc x2 web, tsc worker, lint, verify-local.ps1
- [x] sincronizar.test.ts: recontagem so regrava contagem dos grupos ja gravados; trava ocupada = 409 sem tocar na Evolution; trava liberada na falha; modo completo igual ao de antes
- [x] recount/route.test.ts: engine entra, dono leva 403, token errado 401
- [x] recount-loop.test.ts: uma loja por vez, 409 pulado, dry-run nao chama o app
- [ ] CI verde
- [ ] Coolify: Redeploy em dry-run, ler os logs, ligar WORKER_RECOUNT_ENABLED, Redeploy
- [ ] Prod: logs groups.recounted aparecendo; Sincronizar do painel continua funcionando

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

CI e merge (só no verde; nunca auto-merge):

```bash
gh pr checks <N> --repo codingB0y/Girumo
```

```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

Depois do merge, nesta ordem:

1. Conferir que o app novo está no ar: `/admin/configuracoes` → "Deploy" mostra o commit do merge. (A rota precisa existir antes do worker chamá-la; se o worker subir antes, o tick do boot vira `falhas` no log e a próxima volta acerta.)
2. Botão Sincronizar ainda funciona (a rota foi reescrita): em `/painel/grupos`, clicar em Sincronizar numa loja de teste e ver o resultado de sempre. No banco:

```sql
select created_at, level, event, message from public.logs where event in ('groups.synced', 'groups.sync_failed') order by created_at desc limit 5;
```

3. Coolify → recurso `hubflow-platform:main-…` (Application, compose do git `deploy/coolify/worker.docker-compose.yml`) → **Redeploy** (não Restart: só o Redeploy relê o compose e as variáveis). Na primeira linha de log, `worker iniciado` deve trazer `"recount":"dry-run"` e `"recount_interval_ms":86400000`; em seguida uma linha `DRY-RUN: recontaria os grupos` por loja conectada e `ciclo de recontagem` com `tenants` > 0. `"recount":"off"` = faltam `APP_URL`/`ENGINE_TOKEN` no recurso.
4. Ligar: em *Environment Variables* do mesmo recurso, `WORKER_RECOUNT_ENABLED=true` → Save → **Redeploy**. Esperado no log: `"recount":"on"` e, minutos depois, `ciclo de recontagem` com `atualizados` > 0 (e `pulados` só se algum lojista estava sincronizando na hora). No banco:

```sql
select created_at, tenant_id, level, event, message from public.logs where event in ('groups.recounted', 'groups.recount_failed') order by created_at desc limit 10;
```

Quadro (prod):

```sql
select public.move_card('<key>', 'em_construcao', 'PR 3 no ar: recontagem diária dos grupos (rota engine + loop do worker); recount ligado no Coolify', 'PR #<N>');
```

Grafo (PowerShell, na raiz do checkout principal):

```powershell
.\tools\lightrag\.venv\Scripts\rag.exe insert "decisão: o núcleo do POST /api/groups/sync vive em lib/groups/sincronizar.ts (sincronizarGrupos); a recontagem diária é POST /api/groups/recount (engine-only) com somenteContagem, que só regrava members e admins_* de grupos já gravados e respeita a trava por número do #397; o worker roda o loop recontagem 1x/dia, uma loja por vez, em DRY-RUN até WORKER_RECOUNT_ENABLED=true" --source decisao-2026-10-10-postar-por-grupo-recontagem
```

Ao encerrar: "PRs que deixei abertos: …".

---

## Conferência com o spec e os contratos

| Requisito | Onde |
|---|---|
| Spec §6.1: `short-link-click.ts:89-93` troca `listGroups` por `campaign_group_states` | Task 5 Step 5 (as linhas reais são 67-74) |
| Spec §6.1: `ResolvableGroup.estado`; alvo `remembered ?? enchendo`; `nextAvailableGroup`/`isGroupAvailable` fora do caminho do link | Task 4 Steps 10–12 |
| Spec §6.1: lembrado vence mesmo lotado; `diagnosePool` igual; todos lotados = `all-full` | Task 4 Steps 5 e 7 |
| Spec §6.1: modo JSON fora de escopo | `legacyGet` intocado (Task 9 Step 3c) |
| Spec §6.2: `hasHeadroom` com `lotado_em` sem vaga, sem filtrar do pool | Tasks 6 e 7 |
| Spec §6.2: `registerGrownGroup` grava `admins_counted_at` no insert e no update; consumidores de `groups_sem_backup_idx` | Task 7 (efeito visível descrito) |
| Spec §5.5: `.is("target_rule", null)` no claim legado | Task 8 (condicional ao PR 1) |
| Spec §6.3: `sincronizarGrupos(tenantId, { somenteContagem })`; `escolherContagem`; sem `check_invite` nem convite; trava do #397 | Task 11 |
| Spec §6.3 / contrato §4: `POST /api/groups/recount` engine-only, `x-tenant-id`, `{ ok: true, atualizados }`, na `ENGINE_ONLY` | Task 13 |
| Spec §6.3 / contrato §5: `WORKER_RECOUNT_INTERVAL_MS` 24 h, mínimo 1 h, lojas conectadas, uma por vez | Tasks 14 e 15 |
| Spec §8: teste de `resolve-click-target` (alvo = enchendo, lembrado vence lotado) e `grow-headroom` (lotado sem vaga) | Tasks 4 e 6 |
| Spec §9: deploy do worker separado do app | Task 16, "Depois do merge" |
| Contrato §3: `estado.ts` (sem `server-only`) e `campaign-group-states.ts` (`server-only`), nomes e assinaturas literais | Tasks 2 e 3 |

Divergências e acréscimos em relação ao spec e ao contrato (nenhum item do contrato foi renomeado):

1. **Consumidor não previsto:** `link-e-cliques.tsx` (cliente) usa `resolveClickTarget`. Sem tratamento, a aba quebraria. Acréscimo: `withSequentialEstado` (aproximação explícita) e `toResolvableGroup` em `resolve-click-target.ts`. O PR 4 deveria trocar a aba pelo endpoint de estados.
2. **Alvo literal do contrato pressupõe `groups` ⊆ pool** (é o que a RPC devolve). Os testes que passavam a lista inteira com pool menor passaram a filtrar o pool. Alternativa não adotada: `&& campaign.group_ids.includes(...)` no `find`.
3. **`registerGrownGroup` grava também `admins_total: 1` e `admins_ours: 1`**, não só o carimbo: com o carimbo e 0/0, um admin promovido depois somaria 1 e o grupo continuaria "sem reserva".
4. **Guarda do claim legado:** o spec §9 e o plano do PR 1 a põem no PR 1; o pedido deste plano, no PR 2. A Task 8 é condicional (pula se o PR 1 já trouxe — o esperado).
9. **Arquivos de teste do store:** este plano cria `campaign-group-states.test.ts` (PostgREST falso). `campaign-group-states.integration.test.ts` e `campaign-group-states-acoes.test.ts` são do plano do PR 4 — não criar aqui.
5. **`sincronizarGrupos` aceita mais opções** que o spec cita (`instanceId?`, `actorUserId?`, `depois?`), todas opcionais — o que a rota de sempre precisa e a costura de teste do `after`.
6. **A recontagem grava `name` junto** (NOT NULL checado antes do conflito do upsert) e usa um store novo, `updateGroupCounts`. Eventos de log novos: `groups.recounted` e `groups.recount_failed`.
7. **Env nova no worker, fora do contrato:** `WORKER_RECOUNT_ENABLED` (DRY-RUN por padrão, como send/grow/lote).
8. **Régua de ~10 arquivos:** PR 2 tem 17 e PR 3 tem 14 (com testes). Divisão sugerida na seção File Structure.
