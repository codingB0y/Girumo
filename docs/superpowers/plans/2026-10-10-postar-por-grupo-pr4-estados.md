# Postar por grupo — PR 4: estados e aba Grupos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba Grupos da campanha passa a mostrar o estado de cada grupo como o banco decide (Lotado · Enchendo agora · Na fila · Vazio): faixa de contagem, a frase "O link está mandando gente para X", a lista na ordem do pool com chip, detalhe e menu ⋯, e o lojista marca um grupo como lotado ou reabre um lotado sem sair da tela. O Reabrir fica travado, com o motivo escrito, enquanto o grupo está em 95% ou mais.

**Architecture:** O estado vem pronto de `public.campaign_group_states` (PR 1) pela store do PR 2 (`listCampaignGroupStates`); este PR acrescenta à mesma store `marcarGrupoLotado`/`reabrirGrupo` (RPCs do PR 1). Duas funções puras com teste carregam toda a regra de TS: `lib/groups/resumo-estados.ts` (contagem, regras, frase do link, detalhe por grupo, dias em Brasília) e `lib/groups/acao-lotado.ts` (corpo do POST, grupo desta campanha, mensagem do `ainda_cheio`, status por resultado). As duas rotas novas (`GET .../grupos/estados`, `POST .../grupos/lotado`) são finas. A tela troca o `GroupCard` por `GruposDaCampanha` (faixa + frase + lista) e `estado-do-grupo.tsx` (chip + menu); "Editar capacidade" reusa o `GroupSettings` (`PATCH /api/groups`). Um teste de integração contra o dev prova o SQL (ordem, estados, regras, prioridade do reaberto, marca ao cruzar 95%, marcar/reabrir) e um E2E prova a tela contra a API real e, com a API simulada, o Reabrir travado e o menu.

**Tech Stack:** Next.js 15 (App Router, route handlers `nodejs`), React 19 (client components), Tailwind v4 com tokens G2 (`painel-vitrine.css`), lucide-react 1.21, `@supabase/supabase-js` 2.108 (`.rpc`), `node --test` via tsx, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` (§2 D1–D3, D12 · §3 vocabulário · §4 um lugar só · §6.4 · §7 bordas · §8 testes · §9 fatia PR 4 · §11 itens 1 e 3) · **contratos vinculantes:** `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md` (§1 funções e `EstadoRow`, §3 `estado.ts` e store, §4 rotas — se divergir, os contratos vencem) · **mockup:** board "Grupos da campanha" (`Main.dc.html` do artifact https://claude.ai/artifact/VvMiGdwbaNCP9pHJQZzmwc).

## Global Constraints

- Branch `feat/postar-grupo-estados`, a partir de `origin/main`; base do PR `main`.
- Depende de **PR 1 e PR 2 mergeados em `main`** e do PR 1 **aplicado no banco de dev** (o teste de integração e o E2E batem no dev).
- Consome sem renomear (PR 2): `EstadoGrupo`, `EstadoDoGrupo`, `RegraDestino`, `ROTULO_ESTADO` de `@/lib/groups/estado`; `listCampaignGroupStates(tenantId: string, campaignId: string): Promise<EstadoGrupo[]>` de `@/lib/stores/campaign-group-states`.
- Produz (contratos §3): `marcarGrupoLotado(tenantId: string, groupId: string): Promise<"ok" | "ja_lotado" | "nao_encontrado">` e `reabrirGrupo(tenantId: string, groupId: string): Promise<"ok" | "nao_lotado" | "ainda_cheio" | "nao_encontrado">`, no mesmo arquivo da store.
- RPCs: `rpc("marcar_grupo_lotado", { p_tenant, p_group })` e `rpc("reabrir_grupo", { p_tenant, p_group })`.
- `GET /api/campanhas/[slug]/grupos/estados` → `{ grupos: EstadoGrupo[]; contagem: { lotado: number; enchendo: number; fila: number; vazio: number; membros: number }; regras: Record<RegraDestino, number> }`.
- `POST /api/campanhas/[slug]/grupos/lotado` corpo `{ groupId: string; acao: "marcar" | "reabrir" }` → 200 `{ ok: true }`, 404 `{ error }`, 409 `{ error, motivo: "ainda_cheio" | "nao_lotado" | "ja_lotado" }`. Não confundir com a irmã `grupos/estado` (abrir/fechar).
- Mensagem do 409 `ainda_cheio` (e do Reabrir travado): `Ainda está com {membros} de {capacidade} ({pct}%). O link só manda gente abaixo de 95%: aumente a capacidade ou espere sair gente.` — números em pt-BR (`996`, `1.024`), `pct = Math.round(membros / capacidade × 100)`.
- Limiar: 95% de `capacity > 0 ? capacity : 1024` (`app.limiar_lotado`); "lota de novo sozinho em" = `Math.ceil(capacidade × 95 / 100)` (973 para 1024).
- Rótulos de estado: `Lotado` · `Enchendo agora` · `Na fila` · `Vazio` (de `ROTULO_ESTADO`).
- Auth: GET com `getRouteTenantContext(req, { allowEngine: false })`; POST com `resolveBulkCampaign` (`campaign:edit`). Campanha sempre por `getCampaignGroupBySlug(tenantId, slug)` (filtra tenant).
- Visual G2: Acid **só** no chip Lotado; números da faixa em Manrope (`Celula` de `numeros.tsx`); números da lista em Plex Mono (`font-data`); nenhum texto abaixo de 13px no que é novo (os reusados `SeloEnvio`, `CopyLink` e `GroupSettings` ficam como são); `<button>` de verdade; `aria-label` do ⋯ = `Ações do grupo {nome}`.
- Substituir o `GroupCard` não derruba recurso: selo de envio por grupo (`SeloEnvio`, movido sem mudança) e copiar convite por grupo (bloco `CopyLink` do cartão, como item "Copiar convite" do ⋯) continuam.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>` · tipos `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json` (lint e tsx não checam tipo) · `npm run lint` · `npm test` · `npx tsx scripts/check-painel-vitrine.ts`.
- Gate antes do push: `infra/scripts/verify-local.ps1` (secrets + testes + 2 tsc + build).
- Git: nunca `git add -A`; `git -C <wt> diff --cached --stat` numa chamada **separada** antes de cada commit; sempre `git -C <wt>` com caminho absoluto; caminho com `[slug]` vai como `":(literal)…"`. Terminal PowerShell 5.1: sem `&&`/`||`; `Select-String`/`Get-Content` com `-LiteralPath` em caminho com colchete.
- Commits em inglês com prefixo semântico, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Em execução por waves, quem commita é o controller (os implementadores param no "commit").
- Teste de integração: `E2E_TENANT_ID`, só dev, recusa `SUPABASE_URL` com `nidoatbxaylrkcgbszns`, pula com `return` (o CI exige `# skipped 0` e `# pass ≥ 1`).
- E2E não mexe em grupo do dev: estado que o dev não garante é simulado com `page.route` (o banco de dev é de todos os PRs ao mesmo tempo).
- Fora de escopo: modo JSON (`HUBFLOW_USE_SUPABASE=0`), `/painel/grupos` global, Visão geral, `enqueue_broadcast` com regra (PR 5), conflitos de campanha (PR 6), Padronizar (PR 8), aviso ao lotar (PR 9).
- **19 arquivos** (11 de código, 6 de teste unitário/integração, 1 E2E, 1 componente compartilhado com 1 prop nova). Passa da régua de ~10; se o Igor quiser dividir: **4A** = Tasks 1–6 (store, puras, rotas; 9 arquivos) e **4B** = Tasks 7–10 (tela, aba Link e cliques e E2E; 10 arquivos), 4B depois de 4A.
- `withSequentialEstado` (aproximação temporária do PR 2, marcada `ponytail:`) **sai** neste PR: a aba Link e cliques passa a ler o `enchendo` de `GET .../grupos/estados`, a mesma fonte da aba Grupos (Task 9). `toResolvableGroup` fica (usada por `short-link-click.ts` e pela Task 9).

## Review Focus

Os cinco defeitos mais prováveis que os testes "do caminho feliz" de cada task não pegariam — e o teste que foi acrescentado à task dona para pegar cada um:

1. **Grupo de outra campanha (ou de outro tenant) mudado pelo POST.** O RPC só filtra `p_tenant`; sem conferir que o `groupId` está nos estados **desta** campanha, a tela de uma campanha marca grupo de outra. → Task 4: "grupo que não é desta campanha é 404, mesmo com id bem-formado" (mutante: tirar o `find`). Task 2: `marcarGrupoLotado`/`reabrirGrupo` com outro tenant devolvem `nao_encontrado` (mutante SQL: tenant fora do `where`).
2. **"Editar capacidade" com o id errado ou apagando o convite.** `PATCH /api/groups` quer o **JID** em `id` e trata `inviteUrl: ""` como "remover convite"; mandar o UUID dá 404 e mandar convite vazio tira o grupo do link. → Task 10: o E2E captura o corpo do PATCH e exige `{ id: whatsappGroupId, inviteUrl: <o convite atual>, capacity: 500 }`.
3. **Dia contado em UTC.** "Lotou hoje" às 22h de Brasília virava "Lotou ontem" (UTC já virou o dia). → Task 3: `diasAtras` às 23h de SP com evento às 9h do mesmo dia de SP = "hoje" (mutante: `iso.slice(0, 10)`).
4. **Estado novo caindo num `return` final.** Um quinto estado sumiria da faixa ou cairia no detalhe errado sem erro de compilação. → Task 3: os quatro contadores somam `grupos.length`; `detalheDoGrupo` é `switch` exaustivo sem `return` final (estado novo = erro de `tsc`); `ESTILO_DO_CHIP`/`BARRA` são `Record<EstadoDoGrupo, …>` montados como literal (chave faltando = erro de `tsc`).
5. **Menu ⋯ que não fecha, dois abertos ou foco perdido.** → Task 10: Esc fecha e devolve o foco ao ⋯; abrir o ⋯ de outro grupo deixa um só `aria-expanded="true"`; clique fora fecha.

## File Structure

| Arquivo (em `apps/web/`) | Ação | Responsabilidade | Task |
|---|---|---|---|
| `src/lib/stores/campaign-group-states.ts` | modificar (acrescentar no fim) | `marcarGrupoLotado`, `reabrirGrupo` | 1 |
| `src/lib/stores/campaign-group-states-acoes.test.ts` | criar | store contra PostgREST falso | 1 |
| `src/lib/stores/campaign-group-states.integration.test.ts` | criar | SQL de verdade no dev | 2 |
| `src/lib/groups/resumo-estados.ts` | criar | contagem, regras, frase do link, detalhe, dias em SP | 3 |
| `src/lib/groups/resumo-estados.test.ts` | criar | teste | 3 |
| `src/lib/groups/acao-lotado.ts` | criar | corpo do POST, grupo da campanha, mensagens, status | 4 |
| `src/lib/groups/acao-lotado.test.ts` | criar | teste | 4 |
| `src/app/api/campanhas/[slug]/grupos/estados/route.ts` | criar | GET | 5 |
| `src/app/api/campanhas/[slug]/grupos/lotado/route.ts` | criar | POST | 6 |
| `src/components/painel/grupos/estado-do-grupo.tsx` | criar | `ChipDeEstado`, `MenuDoGrupo` (com Copiar convite), `SeloEnvio` (movido da página) | 7 |
| `src/components/painel/numeros.tsx` | modificar | `Celula` ganha `valorTestId` | 8 |
| `src/components/painel/grupos/grupos-da-campanha.tsx` | criar | faixa, frase do link, lista | 8 |
| `src/app/painel/campanhas/[slug]/page.tsx` | modificar | aba Grupos usa `GruposDaCampanha` (com `origin` e `envio`); `GroupCard` sai; `SeloEnvio` muda para `estado-do-grupo.tsx` | 8 |
| `src/lib/painel/destino-do-link.ts` | criar | destino do link mestre a partir dos estados (mesmo `resolveClickTarget` do `/r/`) | 9 |
| `src/lib/painel/destino-do-link.test.ts` | criar | teste | 9 |
| `src/components/painel/campanhas/detalhe/link-e-cliques.tsx` | modificar | lê `/grupos/estados`; sai `withSequentialEstado` | 9 |
| `src/lib/links/resolve-click-target.ts` | modificar | apaga `withSequentialEstado` (PR 2) | 9 |
| `src/lib/links/resolve-click-target.test.ts` | modificar | apaga o teste de `withSequentialEstado` | 9 |
| `e2e/painel-campanha-estados-grupos.spec.ts` | criar | contraste com a API + API simulada; aba Link e cliques com o mesmo enchendo | 10 |

**Decisão sobre o `GroupCard`: substituído, não estendido — e sem derrubar recurso.** O mockup troca a grade de cartões por uma lista com colunas; manter os dois mostraria cada grupo duas vezes. O que o cartão fazia e a lista não teria volta por reuso, não por reescrita: o `SeloEnvio` **muda de arquivo sem mudar uma linha** (de `page.tsx` para `estado-do-grupo.tsx`, com `export`) e o bloco de convite do cartão (`CopyLink` com a mesma expressão de URL e o mesmo "Configure o link de convite") vira o item "Copiar convite" do menu ⋯. Condição a condição do cartão antigo (`finding-gate-de-exibicao-some-no-diff`):

| Condição no `GroupCard`/`SeloEnvio` | Para onde vai |
|---|---|
| `status === "missing_invite"` → chip "Sem convite" | detalhe da linha "Sem convite: o link pula este grupo" (fila/vazio sem convite válido) **e** "Configure o link de convite" no item Copiar convite do ⋯; a faixa vermelha do cabeçalho ("N grupos sem convite") continua |
| `live === false` → chip "Desconectado" por grupo | sai da linha; a faixa "WhatsApp desconectado" do cabeçalho continua (o estado é da conexão, não do grupo) |
| `status === "full"` → "Cheio"/"Ativo" | chip de estado (vem do SQL; spec §6.4 manda o overview parar de decidir isso nesta aba) |
| `cap >= QUASE_LOTADO` → % em cor de aviso | barra por estado + `958/1.024`; o "quase" some (o estado diz mais) |
| `SeloEnvio` (Aberto / Fechado / "Envio: sem informação") | **continua por grupo**, na coluna Detalhe, ao lado do texto. Mesmo componente, mesmo `sendState ?? null` (nulo continua dito "sem informação"); o dado vem de `/api/groups` pela página, por `whatsappGroupId` |
| `inviteUrl ? <CopyLink url={origin && !inviteUrl.startsWith("http") ? origin + inviteUrl : inviteUrl}/> : "Configure o link de convite"` | **continua por grupo**, como item "Copiar convite" do menu ⋯: o mesmo bloco, com a mesma expressão e o mesmo feedback (✓ por 1,5 s); só a margem muda (`mt-3` → `px-3 py-2`, para caber no painel). Copiar não fecha o menu, para o ✓ aparecer |

## Waves (execução paralela)

| Wave | Tasks | Files disjuntos? |
|---|---|---|
| 1 | 1, 3, 4 | sim |
| 2 | 2, 5, 6, 7, 9 | sim |
| 3 | 8 | — |
| 4 | 10 | — |
| depois | 11, 12 | — |

---

### Task 0: worktree, branch, dependências, banco de dev e card

**Files:** nenhum.
**Interfaces:** Consumes: `origin/main` com PR 1 e PR 2. Produces: `<wt>` e a branch.
**Depends-on:** none

- [ ] **Step 1:** na sessão (já num worktree do app — não criar outro, `finding-harness-bloqueia-escrita-em-outro-worktree`):

```powershell
git rev-parse --show-toplevel
```

  Anotar a saída como `<wt>` e substituir literalmente em todo comando daqui em diante.

- [ ] **Step 2:** atualizar e conferir que PR 1 e PR 2 estão em `main`:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> ls-tree --name-only origin/main apps/web/src/lib/groups/estado.ts apps/web/src/lib/stores/campaign-group-states.ts apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql
```

  Esperado: os três caminhos. Faltando qualquer um → **parar e perguntar ao Igor** (PR 1 ou PR 2 não mergeou).

```powershell
git -C <wt> grep -n "export async function listCampaignGroupStates\|export const ROTULO_ESTADO\|export type EstadoGrupo" origin/main -- apps/web/src/lib/groups/estado.ts apps/web/src/lib/stores/campaign-group-states.ts
```

  Esperado: três linhas. Assinatura diferente da Global Constraints → parar e perguntar (os contratos vencem; o PR 2 está errado ou mudou).

```powershell
git -C <wt> grep -n "export function withSequentialEstado\|export function toResolvableGroup" origin/main -- apps/web/src/lib/links/resolve-click-target.ts
```

  Esperado: duas linhas (a aproximação temporária que a Task 9 apaga). Vazio → o PR 2 já não deixou `withSequentialEstado`; ler a aba `link-e-cliques.tsx` em `origin/main` e ajustar os blocos "antes" da Task 9 ao que estiver lá.

```powershell
git -C <wt> grep -n "marcarGrupoLotado\|reabrirGrupo" origin/main -- apps/web/src
```

  Esperado: vazio (ninguém criou antes).

```powershell
git -C <wt> ls-tree --name-only origin/main apps/web/src/lib/stores/campaign-group-states.integration.test.ts apps/web/src/lib/stores/campaign-group-states-acoes.test.ts apps/web/src/lib/groups/resumo-estados.ts apps/web/src/lib/groups/acao-lotado.ts
```

  Esperado: vazio. Algum existe → parar e perguntar (este plano cria esses arquivos inteiros).

- [ ] **Step 3:** branch a partir de `origin/main`, sem upstream herdado, defasagem zero:

```powershell
git -C <wt> switch -c feat/postar-grupo-estados origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Esperado: vazio.

- [ ] **Step 4:** colisão com outra sessão (`finding-sessoes-paralelas-colidem-em-pr`):

```powershell
gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title
```

  Para cada PR suspeito: `gh pr diff <N> --repo codingB0y/Girumo --name-only`. Nenhum pode mexer em `app/painel/campanhas/[slug]/page.tsx`, `components/painel/numeros.tsx`, `components/painel/grupos/`, `components/painel/campanhas/detalhe/link-e-cliques.tsx`, `lib/links/resolve-click-target*.ts` ou `lib/stores/campaign-group-states.ts`. Colisão → parar e avisar o Igor com o número do PR.

- [ ] **Step 5:** dependências do worktree:

```powershell
Test-Path "<wt>\node_modules\next"
```

  `False` → `Set-Location <wt>; npm ci --workspace apps/web --include-workspace-root --no-audit --no-fund` (~1 min; `finding-worktree-node-modules-junction`).

- [ ] **Step 6:** as três funções do PR 1 existem no **dev** (o teste de integração e o E2E dependem disso; leitura em dev passa no classificador — `tecnica-supabase-cli-sql-nos-dois-bancos`):

```powershell
Set-Content -LiteralPath "$env:TEMP\pg4-funcoes.sql" -Encoding ascii -Value "select proname from pg_proc where proname in ('campaign_group_states','marcar_grupo_lotado','reabrir_grupo') order by 1;"
```
```powershell
Set-Location <wt>\apps\web; supabase link --project-ref wfjuwogxaupyadwhvoxy --yes; supabase db query --linked -o json -f "$env:TEMP\pg4-funcoes.sql"
```

  Esperado: `rows` com `campaign_group_states`, `marcar_grupo_lotado`, `reabrir_grupo`. Faltando → **parar**: o Igor aplica a migração do PR 1 no dev antes (sem ela o job e2e do PR reprova com 500 em `/grupos/estados`).

- [ ] **Step 7 (Igor, prod):** card ao começar (`feedback-quadro-atualizar-ao-comecar`). A chave não está no spec nem nos contratos; conferir primeiro:

```sql
select key, status, blocker from public.board_features where key ilike '%postar%' order by key;
```

  Com a chave confirmada (o esperado é `postar-por-grupo`, criada no PR 1):

```sql
select public.move_card('postar-por-grupo', 'em_construcao', 'PR 4 começou: estados e aba Grupos (marcar/reabrir lotado)', 'feat/postar-grupo-estados');
```

---

### Task 1: store — marcar e reabrir (TDD)

**Files:**
- Modify: `apps/web/src/lib/stores/campaign-group-states.ts` (acrescentar no fim do arquivo; nada do PR 2 muda)
- Create: `apps/web/src/lib/stores/campaign-group-states-acoes.test.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin(): SupabaseClient` de `@/lib/supabase/server`; RPCs `public.marcar_grupo_lotado(p_tenant uuid, p_group uuid) returns text` e `public.reabrir_grupo(p_tenant uuid, p_group uuid) returns text`.
- Produces: `marcarGrupoLotado(tenantId: string, groupId: string): Promise<"ok" | "ja_lotado" | "nao_encontrado">`; `reabrirGrupo(tenantId: string, groupId: string): Promise<"ok" | "nao_lotado" | "ainda_cheio" | "nao_encontrado">`.

**Depends-on:** Task 0

- [ ] **Step 1: teste que falha.** Criar `apps/web/src/lib/stores/campaign-group-states-acoes.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type * as Loja from "./campaign-group-states";

/**
 * O cliente real do Supabase conversando com um PostgREST de mentira (técnica do
 * `leads.test.ts`): a chamada que sai daqui é a de produção, só a rede é trocada. Prova o
 * nome de cada RPC, os nomes dos parâmetros (`p_tenant`/`p_group`, contratos §1) e que um
 * resultado fora do contrato vira erro em vez de virar 200 ou 404 na rota.
 *
 * O SQL de verdade (tenant no `where`, limiar, prioridade) é provado no
 * `campaign-group-states.integration.test.ts`, contra o banco de dev.
 */

type Pedido = { metodo: string; caminho: string; corpo: unknown };
type Resposta = { status: number; corpo: unknown };

const pedidos: Pedido[] = [];
let responder: () => Resposta = () => ({ status: 500, corpo: { message: "sem resposta configurada" } });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => {
    bruto += parte.toString("utf8");
  });
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://postgrest.falso");
    pedidos.push({ metodo: req.method ?? "", caminho: url.pathname, corpo: bruto ? JSON.parse(bruto) : null });
    const { status, corpo } = responder();
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(corpo));
  });
});

let loja: typeof Loja;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  // Depois do env: o cliente admin nasce na primeira chamada e guarda a URL.
  loja = await import("./campaign-group-states");
});

after(() => {
  postgrest.close();
});

test("marcar chama marcar_grupo_lotado com p_tenant e p_group e devolve o que o banco disse", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, corpo: "ja_lotado" });

  assert.equal(await loja.marcarGrupoLotado("loja-a", "grupo-1"), "ja_lotado");

  assert.deepEqual(pedidos, [
    { metodo: "POST", caminho: "/rest/v1/rpc/marcar_grupo_lotado", corpo: { p_tenant: "loja-a", p_group: "grupo-1" } },
  ]);
});

test("reabrir chama reabrir_grupo e repassa os quatro resultados do contrato", async () => {
  for (const resultado of ["ok", "nao_lotado", "ainda_cheio", "nao_encontrado"] as const) {
    pedidos.length = 0;
    responder = () => ({ status: 200, corpo: resultado });

    assert.equal(await loja.reabrirGrupo("loja-a", "grupo-2"), resultado);

    assert.deepEqual(pedidos, [
      { metodo: "POST", caminho: "/rest/v1/rpc/reabrir_grupo", corpo: { p_tenant: "loja-a", p_group: "grupo-2" } },
    ]);
  }
});

test("resultado fora do contrato é erro, nunca um 200 ou 404 por engano", async () => {
  responder = () => ({ status: 200, corpo: "talvez" });
  await assert.rejects(loja.marcarGrupoLotado("loja-a", "grupo-1"), /fora do contrato/);

  // Cada RPC tem a sua lista. Mutante: uma lista só para os dois.
  responder = () => ({ status: 200, corpo: "ainda_cheio" });
  await assert.rejects(loja.marcarGrupoLotado("loja-a", "grupo-1"), /fora do contrato/);
  responder = () => ({ status: 200, corpo: "ja_lotado" });
  await assert.rejects(loja.reabrirGrupo("loja-a", "grupo-1"), /fora do contrato/);
});

test("erro do banco sobe com a mensagem dele", async () => {
  // 400, não 503/520: o postgrest-js repete esses com espera de 1s, 2s, 4s.
  responder = () => ({ status: 400, corpo: { code: "42501", message: "permission denied for function reabrir_grupo" } });
  await assert.rejects(loja.reabrirGrupo("loja-a", "grupo-1"), /permission denied/);
});
```

- [ ] **Step 2: rodar e ver falhar.** Em `<wt>\apps\web`:

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/campaign-group-states-acoes.test.ts
```

  Esperado: FAIL nos quatro testes com `TypeError: loja.marcarGrupoLotado is not a function` (e `reabrirGrupo`).

- [ ] **Step 3: conferir o import que o código novo usa.**

```powershell
Select-String -LiteralPath "<wt>\apps\web\src\lib\stores\campaign-group-states.ts" -Pattern 'getSupabaseAdmin'
```

  Esperado: pelo menos uma linha de `import` com `getSupabaseAdmin` vindo de `@/lib/supabase/server` (o PR 2 já chama `.rpc`) — aí não mexer nos imports. Só se `getSupabaseAdmin` não aparecer em nenhum `import`, acrescentar esta linha logo abaixo de `import "server-only";` no topo do arquivo:

```ts
import { getSupabaseAdmin } from "@/lib/supabase/server";
```

- [ ] **Step 4: implementar.** Acrescentar no **fim** de `apps/web/src/lib/stores/campaign-group-states.ts`:

```ts

/** Resultados de `public.marcar_grupo_lotado` (contratos §1). */
const RESULTADOS_MARCAR = ["ok", "ja_lotado", "nao_encontrado"] as const;
/** Resultados de `public.reabrir_grupo` (contratos §1). */
const RESULTADOS_REABRIR = ["ok", "nao_lotado", "ainda_cheio", "nao_encontrado"] as const;

/**
 * Texto fora do contrato é erro alto. Virar 200 ou 404 por engano esconderia uma função
 * trocada no banco — e a rota mapeia cada resultado para um status.
 */
function resultadoDoRpc<T extends string>(rpc: string, validos: readonly T[], valor: unknown): T {
  if (typeof valor === "string" && (validos as readonly string[]).includes(valor)) return valor as T;
  throw new Error(`${rpc} devolveu um resultado fora do contrato: ${JSON.stringify(valor)}`);
}

/**
 * Marca o grupo como lotado à mão (`lotado_por = 'manual'`, spec D1). Sai do link na hora.
 * O tenant vai no `where` do próprio RPC: grupo de outra loja volta `nao_encontrado`.
 */
export async function marcarGrupoLotado(
  tenantId: string,
  groupId: string,
): Promise<"ok" | "ja_lotado" | "nao_encontrado"> {
  const { data, error } = await getSupabaseAdmin().rpc("marcar_grupo_lotado", { p_tenant: tenantId, p_group: groupId });
  if (error) throw new Error(error.message);
  return resultadoDoRpc("marcar_grupo_lotado", RESULTADOS_MARCAR, data);
}

/**
 * Tira a marca e dá prioridade no link (spec D2/D3). Recusa com `ainda_cheio` enquanto o grupo
 * está em 95% ou mais — a condição mora no `where` do UPDATE, sem corrida entre checar e gravar.
 */
export async function reabrirGrupo(
  tenantId: string,
  groupId: string,
): Promise<"ok" | "nao_lotado" | "ainda_cheio" | "nao_encontrado"> {
  const { data, error } = await getSupabaseAdmin().rpc("reabrir_grupo", { p_tenant: tenantId, p_group: groupId });
  if (error) throw new Error(error.message);
  return resultadoDoRpc("reabrir_grupo", RESULTADOS_REABRIR, data);
}
```

- [ ] **Step 5: rodar e ver passar.**

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/campaign-group-states-acoes.test.ts
```

  Esperado: `# pass 4`, `# fail 0`.

- [ ] **Step 6: mutantes (`pattern-teste-de-integracao-mata-mutante`).** Um de cada vez, rodar o Step 5 e reverter:
  - em `reabrirGrupo`, trocar `"reabrir_grupo"` (o do `.rpc`) por `"marcar_grupo_lotado"` → FAIL em "reabrir chama reabrir_grupo…";
  - em `marcarGrupoLotado`, trocar `RESULTADOS_MARCAR` por `RESULTADOS_REABRIR` → FAIL em "resultado fora do contrato…";
  - trocar `p_group: groupId` por `p_grupo: groupId` em `marcarGrupoLotado` → FAIL em "marcar chama…".

```powershell
git -C <wt> diff --stat
```

  Esperado depois de reverter: só os dois arquivos desta task.

- [ ] **Step 7: tipos.** Em `<wt>\apps\web`: `npx tsc --noEmit -p tsconfig.json` → sem erro.

- [ ] **Step 8: commit.**

```powershell
git -C <wt> add -- apps/web/src/lib/stores/campaign-group-states.ts apps/web/src/lib/stores/campaign-group-states-acoes.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: exatamente os dois arquivos.

```powershell
git -C <wt> commit -m "feat(groups): add marcarGrupoLotado and reabrirGrupo to campaign group states store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: teste de integração da store contra o dev

**Files:**
- Create: `apps/web/src/lib/stores/campaign-group-states.integration.test.ts`

**Interfaces:**
- Consumes: `listCampaignGroupStates` (PR 2), `marcarGrupoLotado`/`reabrirGrupo` (Task 1), `applyMemberCountDelta(tenantId, whatsappGroupId, delta)` de `./groups` (RPC `apply_group_members_delta`, que só soma onde `admins_counted_at is not null`), `getSupabaseAdmin`, env `E2E_TENANT_ID`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
- Produces: 4 testes que rodam no passo "Integracao das stores contra o banco de dev" do job `e2e` (`verify.yml:227-254`).

**Depends-on:** Task 1

Nesta máquina não há credencial de E2E (`feedback-painel-menu-em-cima-estilo-bling`, "Sem credencial E2E na máquina"): localmente os quatro testes se pulam com `return` e passam; o que vale é o job `e2e` do PR (Task 11, Step 8). O CI reprova se algum `*.integration.test.ts` sair como `skipped`.

- [ ] **Step 1: criar o teste.** `apps/web/src/lib/stores/campaign-group-states.integration.test.ts`:

```ts
import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { EstadoGrupo } from "@/lib/groups/estado";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { listCampaignGroupStates, marcarGrupoLotado, reabrirGrupo } from "./campaign-group-states";
import { applyMemberCountDelta } from "./groups";

/**
 * Contra o Supabase de DEV (job e2e do CI). Estado, "enchendo agora", regras de destino, a
 * marca automática e as ações manuais vivem em SQL (spec §4): nenhum fake alcança. É este
 * teste que reprova quando alguém troca a regra, a ordem ou o `where` no banco
 * (pattern-teste-de-integracao-mata-mutante).
 *
 * Cada teste monta a própria campanha com cinco grupos de capacidade 100 (limiar 95) e JID
 * sorteado por execução: o banco de dev é de todos os PRs ao mesmo tempo.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = crypto.randomUUID().slice(0, 8);

const campanhaIds: string[] = [];
const grupoIds: string[] = [];

after(async () => {
  if (!TENANT || EM_PRODUCAO) return;
  const supabase = getSupabaseAdmin();
  if (campanhaIds.length) {
    await supabase.from("campaign_groups").delete().eq("tenant_id", TENANT).in("id", campanhaIds);
  }
  if (grupoIds.length) await supabase.from("groups").delete().eq("tenant_id", TENANT).in("id", grupoIds);
});

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!TENANT) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

/** Ordem do pool = ordem desta lista. Capacidade 100 em todos: o limiar é 95. */
const POOL = [
  { chave: "enche", membros: 50, admin: true },
  { chave: "fila", membros: 10, admin: true },
  { chave: "cheio", membros: 96, admin: true },
  { chave: "vazio", membros: 1, admin: true },
  { chave: "semadmin", membros: 30, admin: false },
] as const;
type Chave = (typeof POOL)[number]["chave"];
type Cenario = { campanhaId: string; jid: Record<Chave, string>; id: Record<Chave, string> };

async function cenario(nome: string): Promise<Cenario> {
  const supabase = getSupabaseAdmin();
  const contadoEm = new Date().toISOString();
  const jid = Object.fromEntries(
    POOL.map((g) => [g.chave, `pg4-${RUN}-${nome}-${g.chave}@g.us`]),
  ) as Record<Chave, string>;

  const { data: grupos, error } = await supabase
    .from("groups")
    .insert(
      POOL.map((g) => ({
        tenant_id: TENANT,
        whatsapp_group_id: jid[g.chave],
        name: `pg4 ${RUN} ${nome} ${g.chave}`,
        members: g.membros,
        capacity: 100,
        is_admin: g.admin,
        invite_url: `https://chat.whatsapp.com/pg4${RUN}${g.chave}`,
        // Base conferida: sem ela apply_group_members_delta não soma nada.
        admins_counted_at: contadoEm,
        admins_ours: g.admin ? 1 : 0,
        // Dois admins: fora de groups_sem_backup_idx, que alertaria o tenant de QA.
        admins_total: 2,
      })),
    )
    .select("id, whatsapp_group_id");
  if (error) throw new Error(error.message);
  const idPorJid = new Map((grupos ?? []).map((g) => [g.whatsapp_group_id as string, g.id as string]));
  grupoIds.push(...idPorJid.values());
  const id = Object.fromEntries(POOL.map((g) => [g.chave, idPorJid.get(jid[g.chave]) ?? ""])) as Record<Chave, string>;

  const { data: campanha, error: erroCampanha } = await supabase
    .from("campaign_groups")
    .insert({
      tenant_id: TENANT,
      name: `pg4 ${RUN} ${nome}`,
      slug: `pg4-${RUN}-${nome}`,
      group_ids: POOL.map((g) => jid[g.chave]),
    })
    .select("id")
    .single();
  if (erroCampanha) throw new Error(erroCampanha.message);
  campanhaIds.push(campanha!.id as string);
  return { campanhaId: campanha!.id as string, jid, id };
}

async function estados(c: Cenario): Promise<Record<Chave, EstadoGrupo>> {
  const lista = await listCampaignGroupStates(TENANT, c.campanhaId);
  const porChave = {} as Record<Chave, EstadoGrupo>;
  for (const g of POOL) {
    const estado = lista.find((e) => e.groupId === c.id[g.chave]);
    if (!estado) throw new Error(`grupo ${g.chave} sumiu dos estados`);
    porChave[g.chave] = estado;
  }
  return porChave;
}

test("campanha nasce com estados, ordem e regras vindos do SQL", async () => {
  if (pular()) return;
  const c = await cenario("ordem");

  const lista = await listCampaignGroupStates(TENANT, c.campanhaId);
  assert.deepEqual(
    lista.map((g) => g.whatsappGroupId),
    POOL.map((g) => c.jid[g.chave]),
  );
  assert.deepEqual(
    lista.map((g) => g.posicao),
    [1, 2, 3, 4, 5],
  );
  // O primeiro disponível enche; o que já nasceu em 96/100 está lotado; 1 membro é vazio;
  // sem admin não é disponível, mas tem gente: fila.
  assert.deepEqual(
    lista.map((g) => g.estado),
    ["enchendo", "fila", "lotado", "vazio", "fila"],
  );
  // Regras: a única definição é app.grupo_na_regra. Sem admin, nenhuma regra pega.
  assert.deepEqual(
    lista.map((g) => g.naRegra),
    [
      { menos_enchendo: false, lotados: false, com_gente: true },
      { menos_enchendo: true, lotados: false, com_gente: true },
      { menos_enchendo: true, lotados: true, com_gente: true },
      { menos_enchendo: false, lotados: false, com_gente: false },
      { menos_enchendo: false, lotados: false, com_gente: false },
    ],
  );

  const e = await estados(c);
  // Descoberto já cheio: marcado no INSERT e sem aviso (aviso_lotou_em preenchido, spec §5.3).
  assert.equal(e.cheio.lotadoPor, "auto");
  assert.notEqual(e.cheio.lotadoEm, null);
  assert.notEqual(e.cheio.avisoLotouEm, null);
  assert.equal(e.cheio.podeReabrir, false);

  // A campanha não existe para outra loja.
  assert.equal((await listCampaignGroupStates(crypto.randomUUID(), c.campanhaId)).length, 0);
});

test("reabrir: travado acima de 95%, liberado abaixo, e o reaberto passa na frente da ordem", async () => {
  if (pular()) return;
  const c = await cenario("reabrir");

  assert.equal(await reabrirGrupo(TENANT, c.id.cheio), "ainda_cheio");
  let e = await estados(c);
  assert.equal(e.cheio.estado, "lotado", "ainda_cheio não muda nada");
  assert.equal(e.cheio.reabertoEm, null);

  // Saíram 10: a marca não sai sozinha (D1), mas agora dá para reabrir.
  await applyMemberCountDelta(TENANT, c.jid.cheio, -10);
  e = await estados(c);
  assert.equal(e.cheio.membros, 86);
  assert.equal(e.cheio.estado, "lotado");
  assert.equal(e.cheio.podeReabrir, true);

  assert.equal(await reabrirGrupo(TENANT, c.id.cheio), "ok");
  e = await estados(c);
  // Posição 3 vence a posição 1: reaberto tem prioridade (D3).
  assert.equal(e.cheio.estado, "enchendo");
  assert.equal(e.enche.estado, "fila");
  assert.notEqual(e.cheio.reabertoEm, null);
  assert.equal(e.cheio.lotadoEm, null);
  assert.equal(e.cheio.lotadoPor, null);

  assert.equal(await reabrirGrupo(TENANT, c.id.cheio), "nao_lotado");
});

test("a marca automática entra ao cruzar 95% subindo e não sai descendo", async () => {
  if (pular()) return;
  const c = await cenario("cruza");

  await applyMemberCountDelta(TENANT, c.jid.enche, 44); // 50 → 94
  let e = await estados(c);
  assert.equal(e.enche.estado, "enchendo");

  await applyMemberCountDelta(TENANT, c.jid.enche, 1); // 94 → 95: cruzou
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.lotadoPor, "auto");
  assert.equal(e.fila.estado, "enchendo", "o link passa para o próximo da ordem");

  await applyMemberCountDelta(TENANT, c.jid.enche, -5); // 95 → 90
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado", "descer não tira a marca (D1)");
  assert.equal(e.enche.podeReabrir, true);

  // Reaberto que volta a lotar perde a prioridade: reaberto_em limpo pelo trigger.
  assert.equal(await reabrirGrupo(TENANT, c.id.enche), "ok");
  await applyMemberCountDelta(TENANT, c.jid.enche, 5); // 90 → 95
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.reabertoEm, null);
});

test("marcar à mão: ok, depois ja_lotado; outro tenant ou grupo inexistente é nao_encontrado", async () => {
  if (pular()) return;
  const c = await cenario("marcar");

  // Review Focus 1: o tenant está no `where` dos dois RPCs.
  assert.equal(await marcarGrupoLotado(crypto.randomUUID(), c.id.enche), "nao_encontrado");
  assert.equal(await reabrirGrupo(crypto.randomUUID(), c.id.cheio), "nao_encontrado");
  assert.equal(await marcarGrupoLotado(TENANT, crypto.randomUUID()), "nao_encontrado");

  assert.equal(await marcarGrupoLotado(TENANT, c.id.enche), "ok");
  assert.equal(await marcarGrupoLotado(TENANT, c.id.enche), "ja_lotado");

  const e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.lotadoPor, "manual");
  assert.equal(e.enche.podeReabrir, true, "50 de 100: marcado à mão abaixo do limiar reabre");
  assert.equal(e.enche.naRegra.menos_enchendo, true, "lotado entra no atalho padrão");
  assert.equal(e.fila.estado, "enchendo");
});
```

- [ ] **Step 2: rodar local (pula).** Em `<wt>\apps\web`:

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/campaign-group-states.integration.test.ts
```

  Esperado: quatro linhas `E2E_TENANT_ID ausente — teste de integração pulado`, `# pass 4`, `# fail 0`. (Se esta máquina tiver `E2E_TENANT_ID` e a service-role de dev no ambiente, os quatro rodam de verdade; tem que dar `# pass 4` também.)

- [ ] **Step 3: tipos.** `npx tsc --noEmit -p tsconfig.json` → sem erro.

- [ ] **Step 4: commit.**

```powershell
git -C <wt> add -- apps/web/src/lib/stores/campaign-group-states.integration.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "test(groups): integration test for campaign group states against dev" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: resumo dos estados — funções puras (TDD)

**Files:**
- Create: `apps/web/src/lib/groups/resumo-estados.ts`
- Create: `apps/web/src/lib/groups/resumo-estados.test.ts`

**Interfaces:**
- Consumes: `EstadoGrupo`, `RegraDestino` de `@/lib/groups/estado`; `dayBR(d: Date): string`, `dayBROf(iso?: string | null): string | undefined` de `@/lib/date-br`.
- Produces:
  - `type ContagemEstados = { lotado: number; enchendo: number; fila: number; vazio: number; membros: number }`
  - `type EstadosDaCampanha = { grupos: EstadoGrupo[]; contagem: ContagemEstados; regras: Record<RegraDestino, number> }` (a resposta do GET; o PR 5 importa daqui)
  - `resumirEstados(grupos: EstadoGrupo[]): { contagem: ContagemEstados; regras: Record<RegraDestino, number> }`
  - `diasAtras(iso: string, agora: Date): string` → `"hoje" | "ontem" | "há N dias" | ""`
  - `proximoDoLink(grupos: EstadoGrupo[]): EstadoGrupo | null`
  - `type FraseDoLink = { tipo: "parado" } | { tipo: "enchendo"; nome: string; reaberto: string | null; voltaPara: number | null }`
  - `fraseDoLink(grupos: EstadoGrupo[], agora: Date): FraseDoLink`
  - `detalheDoGrupo(g: EstadoGrupo, grupos: EstadoGrupo[], agora: Date): string`

**Depends-on:** Task 0

- [ ] **Step 1: teste que falha.** `apps/web/src/lib/groups/resumo-estados.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { EstadoGrupo } from "./estado";
import { detalheDoGrupo, diasAtras, fraseDoLink, proximoDoLink, resumirEstados } from "./resumo-estados";

const TODAS = { menos_enchendo: true, lotados: true, com_gente: true };
const NENHUMA = { menos_enchendo: false, lotados: false, com_gente: false };
/** 12h de 10/10 em Brasília. */
const AGORA = new Date("2026-10-10T15:00:00Z");

function grupo(parcial: Partial<EstadoGrupo> & Pick<EstadoGrupo, "posicao" | "estado">): EstadoGrupo {
  return {
    groupId: `00000000-0000-4000-8000-${String(parcial.posicao).padStart(12, "0")}`,
    whatsappGroupId: `g${parcial.posicao}@g.us`,
    nome: `Moda Kids do Sul ${parcial.posicao}`,
    membros: 10,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: `https://chat.whatsapp.com/C${parcial.posicao}`,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    podeReabrir: false,
    naRegra: NENHUMA,
    ...parcial,
  };
}

test("resumo conta cada estado, soma membros e lê as regras de naRegra", () => {
  const grupos = [
    grupo({ posicao: 1, estado: "lotado", membros: 1003, naRegra: TODAS }),
    grupo({ posicao: 2, estado: "lotado", membros: 812, naRegra: TODAS }),
    grupo({ posicao: 3, estado: "enchendo", membros: 958, naRegra: { menos_enchendo: false, lotados: false, com_gente: true } }),
    grupo({ posicao: 4, estado: "fila", membros: 412, naRegra: { menos_enchendo: true, lotados: false, com_gente: true } }),
    // Fila sem admin: estado fila, nenhuma regra. Mutante: contar a regra pelo estado.
    grupo({ posicao: 5, estado: "fila", membros: 30, isAdmin: false }),
    grupo({ posicao: 6, estado: "vazio", membros: 1 }),
  ];

  const { contagem, regras } = resumirEstados(grupos);

  assert.deepEqual(contagem, { lotado: 2, enchendo: 1, fila: 2, vazio: 1, membros: 3216 });
  assert.deepEqual(regras, { menos_enchendo: 3, lotados: 2, com_gente: 4 });
  // Review Focus 4: os quatro estados somam o total. Estado novo que nenhum contador pega aparece aqui.
  assert.equal(contagem.lotado + contagem.enchendo + contagem.fila + contagem.vazio, grupos.length);
});

test("campanha sem grupo resolvido é tudo zero, nunca NaN", () => {
  assert.deepEqual(resumirEstados([]), {
    contagem: { lotado: 0, enchendo: 0, fila: 0, vazio: 0, membros: 0 },
    regras: { menos_enchendo: 0, lotados: 0, com_gente: 0 },
  });
});

test("dias contados em Brasília: 23h de SP ainda é hoje, mesmo com o UTC no dia seguinte", () => {
  // Review Focus 3. 02:00Z de 10/10 = 23:00 de 09/10 em SP.
  const agora = new Date("2026-10-10T02:00:00Z");
  assert.equal(diasAtras("2026-10-09T12:00:00Z", agora), "hoje"); // 09h de 09/10 em SP; UTC diria "ontem"
  assert.equal(diasAtras("2026-10-09T02:30:00Z", agora), "ontem"); // 23h30 de 08/10 em SP
  assert.equal(diasAtras("2026-10-06T15:00:00Z", agora), "há 3 dias");
  assert.equal(diasAtras("2026-10-11T12:00:00Z", agora), "hoje"); // relógio adiantado não vira "há -2 dias"
  assert.equal(diasAtras("não é data", agora), "");
});

test("detalhe do lotado diz quando e como lotou", () => {
  const auto = grupo({ posicao: 1, estado: "lotado", lotadoEm: "2026-09-19T15:00:00Z", lotadoPor: "auto" });
  const mao = grupo({ posicao: 10, estado: "lotado", lotadoEm: "2026-10-10T11:00:00Z", lotadoPor: "manual" });
  assert.equal(detalheDoGrupo(auto, [auto, mao], AGORA), "Lotou há 21 dias · automático");
  assert.equal(detalheDoGrupo(mao, [auto, mao], AGORA), "Lotou hoje · marcado à mão");
});

test("reaberto enchendo: a frase do link, o pausado e para onde o link volta", () => {
  const grupos = [
    grupo({ posicao: 11, estado: "lotado", lotadoEm: "2026-10-08T15:00:00Z", lotadoPor: "auto" }),
    grupo({ posicao: 12, estado: "enchendo", membros: 958, reabertoEm: "2026-10-09T18:00:00Z" }),
    grupo({ posicao: 13, estado: "fila", membros: 412 }),
    grupo({ posicao: 14, estado: "fila", membros: 38 }),
    grupo({ posicao: 16, estado: "vazio", membros: 1 }),
  ];

  assert.deepEqual(fraseDoLink(grupos, AGORA), {
    tipo: "enchendo",
    nome: "Moda Kids do Sul 12",
    reaberto: "ontem",
    voltaPara: 13,
  });
  assert.equal(detalheDoGrupo(grupos[1], grupos, AGORA), "Reaberto ontem · prioridade no link");
  assert.equal(detalheDoGrupo(grupos[2], grupos, AGORA), "Pausado: volta a encher quando o 12 lotar");
  assert.equal(detalheDoGrupo(grupos[3], grupos, AGORA), "Aguardando a vez");
  assert.equal(detalheDoGrupo(grupos[4], grupos, AGORA), "Só o nosso número");
});

test("sem grupo enchendo o link está parado; enchendo sem reabrir não fala de prioridade", () => {
  assert.deepEqual(fraseDoLink([grupo({ posicao: 1, estado: "lotado" })], AGORA), { tipo: "parado" });

  const normal = [grupo({ posicao: 1, estado: "enchendo" }), grupo({ posicao: 2, estado: "fila" })];
  assert.deepEqual(fraseDoLink(normal, AGORA), {
    tipo: "enchendo",
    nome: "Moda Kids do Sul 1",
    reaberto: null,
    voltaPara: null,
  });
  assert.equal(detalheDoGrupo(normal[0], normal, AGORA), "Recebendo quem clica no link");
  // Sem reaberto ninguém está "pausado".
  assert.equal(detalheDoGrupo(normal[1], normal, AGORA), "Aguardando a vez");
});

test("fila que o link pula diz o porquê, em vez de 'Aguardando a vez'", () => {
  const semAdmin = grupo({ posicao: 2, estado: "fila", isAdmin: false });
  const semConvite = grupo({ posicao: 3, estado: "fila", inviteUrl: null });
  const conviteTorto = grupo({ posicao: 4, estado: "fila", inviteUrl: "chat.whatsapp.com/sem-esquema" });
  const todos = [semAdmin, semConvite, conviteTorto];
  assert.equal(detalheDoGrupo(semAdmin, todos, AGORA), "Nosso número não é admin: o link pula este grupo");
  assert.equal(detalheDoGrupo(semConvite, todos, AGORA), "Sem convite: o link pula este grupo");
  assert.equal(detalheDoGrupo(conviteTorto, todos, AGORA), "Sem convite: o link pula este grupo");
});

test("o próximo do link pula quem o link pula e põe reaberto na frente da ordem", () => {
  const grupos = [
    grupo({ posicao: 1, estado: "enchendo", reabertoEm: "2026-10-10T10:00:00Z" }),
    grupo({ posicao: 2, estado: "fila", isAdmin: false }),
    grupo({ posicao: 3, estado: "fila", inviteUrl: null }),
    grupo({ posicao: 4, estado: "lotado" }),
    grupo({ posicao: 5, estado: "vazio", membros: 1 }),
    grupo({ posicao: 6, estado: "fila", reabertoEm: "2026-10-10T12:00:00Z" }),
  ];
  assert.equal(proximoDoLink(grupos)?.posicao, 6, "o segundo reaberto vence a ordem");
  assert.equal(proximoDoLink(grupos.slice(0, 5))?.posicao, 5, "vazio com admin e convite também recebe");
  assert.equal(proximoDoLink(grupos.slice(0, 4)), null);
});
```

- [ ] **Step 2: rodar e ver falhar.**

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/resumo-estados.test.ts
```

  Esperado: FAIL com `ERR_MODULE_NOT_FOUND` (`./resumo-estados`).

- [ ] **Step 3: implementar.** `apps/web/src/lib/groups/resumo-estados.ts`:

```ts
import { dayBR, dayBROf } from "@/lib/date-br";
import type { EstadoGrupo, RegraDestino } from "@/lib/groups/estado";

/**
 * Apresentação dos estados dos grupos de uma campanha: a faixa e a lista da aba Grupos (PR 4)
 * e, no PR 5, o seletor de destino. O ESTADO e as REGRAS chegam prontos do SQL
 * (`campaign_group_states`, spec §4); aqui só se conta e se escreve frase.
 */

export type ContagemEstados = {
  lotado: number;
  enchendo: number;
  fila: number;
  vazio: number;
  membros: number;
};

/** Resposta de `GET /api/campanhas/[slug]/grupos/estados` (contratos §4). */
export type EstadosDaCampanha = {
  grupos: EstadoGrupo[];
  contagem: ContagemEstados;
  regras: Record<RegraDestino, number>;
};

export function resumirEstados(grupos: EstadoGrupo[]): {
  contagem: ContagemEstados;
  regras: Record<RegraDestino, number>;
} {
  const quantos = (cumpre: (g: EstadoGrupo) => boolean) => grupos.filter(cumpre).length;
  return {
    // Literais com todas as chaves: estado novo sem contador é erro de compilação, não NaN.
    contagem: {
      lotado: quantos((g) => g.estado === "lotado"),
      enchendo: quantos((g) => g.estado === "enchendo"),
      fila: quantos((g) => g.estado === "fila"),
      vazio: quantos((g) => g.estado === "vazio"),
      membros: grupos.reduce((soma, g) => soma + g.membros, 0),
    },
    // Lido de naRegra, nunca do estado: a regra mora numa função SQL só.
    regras: {
      menos_enchendo: quantos((g) => g.naRegra.menos_enchendo),
      lotados: quantos((g) => g.naRegra.lotados),
      com_gente: quantos((g) => g.naRegra.com_gente),
    },
  };
}

const UM_DIA_MS = 86_400_000;

/** "hoje", "ontem" ou "há N dias", em dias de Brasília: às 21h de SP o UTC já virou o dia. */
export function diasAtras(iso: string, agora: Date): string {
  const dia = dayBROf(iso);
  if (!dia) return "";
  const dias = Math.round((Date.parse(dayBR(agora)) - Date.parse(dia)) / UM_DIA_MS);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** O mesmo teste de convite do "disponível" do SQL e de `isGroupAvailable`. */
const CONVITE = /^https?:\/\/\S+$/;

/**
 * Para quem o link vai quando o grupo que está enchendo lotar: reabertos primeiro, depois a
 * ordem do pool (a ordem de `app.estados_da_campanha`).
 *
 * ponytail: repete o "disponível" do SQL (admin + convite; fora do lotado a contagem já está
 * abaixo do limiar) só para escrever "volta para o 13" e "Pausado". O estado de cada linha
 * continua vindo do banco. Se o SQL ganhar condição nova de disponível, esta frase pode errar o
 * número; aí subir `proximo` para `campaign_group_states`.
 */
export function proximoDoLink(grupos: EstadoGrupo[]): EstadoGrupo | null {
  const candidatos = [...grupos]
    .sort((a, b) => a.posicao - b.posicao)
    .filter((g) => (g.estado === "fila" || g.estado === "vazio") && g.isAdmin && CONVITE.test(g.inviteUrl ?? ""));
  return candidatos.find((g) => g.reabertoEm !== null) ?? candidatos[0] ?? null;
}

export type FraseDoLink =
  | { tipo: "parado" }
  | { tipo: "enchendo"; nome: string; reaberto: string | null; voltaPara: number | null };

/** "O link está mandando gente para X — reaberto ontem, tem prioridade. Quando ele lotar, volta para o 13." */
export function fraseDoLink(grupos: EstadoGrupo[], agora: Date): FraseDoLink {
  const enchendo = grupos.find((g) => g.estado === "enchendo");
  if (!enchendo) return { tipo: "parado" };
  if (!enchendo.reabertoEm) return { tipo: "enchendo", nome: enchendo.nome, reaberto: null, voltaPara: null };
  return {
    tipo: "enchendo",
    nome: enchendo.nome,
    reaberto: diasAtras(enchendo.reabertoEm, agora),
    voltaPara: proximoDoLink(grupos)?.posicao ?? null,
  };
}

/** A coluna Detalhe do mockup. `switch` sem `return` final: estado novo é erro de `tsc`. */
export function detalheDoGrupo(g: EstadoGrupo, grupos: EstadoGrupo[], agora: Date): string {
  switch (g.estado) {
    case "lotado": {
      const quando = g.lotadoEm ? `Lotou ${diasAtras(g.lotadoEm, agora)}` : "Lotado";
      return `${quando} · ${g.lotadoPor === "manual" ? "marcado à mão" : "automático"}`;
    }
    case "enchendo":
      return g.reabertoEm
        ? `Reaberto ${diasAtras(g.reabertoEm, agora)} · prioridade no link`
        : "Recebendo quem clica no link";
    case "fila":
    case "vazio": {
      if (!g.isAdmin) return "Nosso número não é admin: o link pula este grupo";
      if (!CONVITE.test(g.inviteUrl ?? "")) return "Sem convite: o link pula este grupo";
      if (g.estado === "vazio") return "Só o nosso número";
      const enchendo = grupos.find((e) => e.estado === "enchendo");
      if (enchendo?.reabertoEm && g.reabertoEm === null && proximoDoLink(grupos)?.groupId === g.groupId) {
        return `Pausado: volta a encher quando o ${enchendo.posicao} lotar`;
      }
      return "Aguardando a vez";
    }
  }
}
```

- [ ] **Step 4: rodar e ver passar.**

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/resumo-estados.test.ts
```

  Esperado: `# pass 8`, `# fail 0`.

- [ ] **Step 5: mutantes.** Um por vez, rodar o Step 4 e reverter:
  - em `diasAtras`, trocar `const dia = dayBROf(iso);` por `const dia = iso.slice(0, 10);` e `dayBR(agora)` por `agora.toISOString().slice(0, 10)` → FAIL em "dias contados em Brasília…";
  - em `resumirEstados`, trocar `quantos((g) => g.naRegra.menos_enchendo)` por `quantos((g) => g.estado === "lotado" || g.estado === "fila")` → FAIL em "resumo conta…";
  - em `proximoDoLink`, apagar `.find((g) => g.reabertoEm !== null) ??` → FAIL em "o próximo do link…".

- [ ] **Step 6: tipos.** `npx tsc --noEmit -p tsconfig.json` → sem erro.

- [ ] **Step 7: commit.**

```powershell
git -C <wt> add -- apps/web/src/lib/groups/resumo-estados.ts apps/web/src/lib/groups/resumo-estados.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(groups): summarize campaign group states for the Grupos tab" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ação de lotado — validação e respostas (TDD)

**Files:**
- Create: `apps/web/src/lib/groups/acao-lotado.ts`
- Create: `apps/web/src/lib/groups/acao-lotado.test.ts`

**Interfaces:**
- Consumes: `EstadoGrupo` de `@/lib/groups/estado` (só tipo — o arquivo é importável no cliente).
- Produces:
  - `type AcaoLotado = "marcar" | "reabrir"`
  - `type ResultadoDaAcao = "ok" | "ja_lotado" | "nao_lotado" | "ainda_cheio" | "nao_encontrado"`
  - `lerAcaoLotado(body: unknown, grupos: EstadoGrupo[]): { ok: true; grupo: EstadoGrupo; acao: AcaoLotado } | { ok: false; status: 400 | 404; error: string }`
  - `lotaDeNovoEm(capacidade: number): number`
  - `mensagemAindaCheio(membros: number, capacidade: number): string`
  - `type RespostaDaAcao = { status: 200; corpo: { ok: true } } | { status: 404; corpo: { error: string } } | { status: 409; corpo: { error: string; motivo: "ainda_cheio" | "nao_lotado" | "ja_lotado" } }`
  - `respostaDaAcao(resultado: ResultadoDaAcao, grupo: Pick<EstadoGrupo, "membros" | "capacidade">): RespostaDaAcao`

**Depends-on:** Task 0

- [ ] **Step 1: teste que falha.** `apps/web/src/lib/groups/acao-lotado.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { lerAcaoLotado, lotaDeNovoEm, mensagemAindaCheio, respostaDaAcao } from "./acao-lotado";
import type { EstadoGrupo } from "./estado";

const ID = "0b6f7c1e-2f43-4a51-9d3e-6a1c2b3d4e5f";
const OUTRO_ID = "7d1e0c2a-5b4f-4c3d-8e2f-1a0b9c8d7e6f";

function grupo(groupId: string): EstadoGrupo {
  return {
    posicao: 1,
    groupId,
    whatsappGroupId: "g1@g.us",
    nome: "Moda Kids do Sul 1",
    membros: 996,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/C1",
    lotadoEm: "2026-10-01T12:00:00Z",
    lotadoPor: "auto",
    reabertoEm: null,
    avisoLotouEm: "2026-10-01T12:00:00Z",
    estado: "lotado",
    podeReabrir: false,
    naRegra: { menos_enchendo: true, lotados: true, com_gente: true },
  };
}

test("lê marcar e reabrir de um grupo desta campanha", () => {
  const daCampanha = [grupo(ID)];
  assert.deepEqual(lerAcaoLotado({ groupId: ID, acao: "marcar" }, daCampanha), {
    ok: true,
    grupo: daCampanha[0],
    acao: "marcar",
  });
  assert.deepEqual(lerAcaoLotado({ groupId: ID, acao: "reabrir" }, daCampanha), {
    ok: true,
    grupo: daCampanha[0],
    acao: "reabrir",
  });
});

test("corpo, ação ou id fora do formato são 400", () => {
  const daCampanha = [grupo(ID)];
  for (const corpo of [null, [], "marcar", 42]) {
    assert.deepEqual(lerAcaoLotado(corpo, daCampanha), { ok: false, status: 400, error: "Corpo inválido." });
  }
  assert.deepEqual(lerAcaoLotado({ groupId: ID, acao: "apagar" }, daCampanha), {
    ok: false,
    status: 400,
    error: 'acao deve ser "marcar" ou "reabrir".',
  });
  assert.deepEqual(lerAcaoLotado({ acao: "marcar" }, daCampanha), { ok: false, status: 400, error: "groupId inválido." });
  // O JID não serve: a ação é pelo UUID de `groups` (EstadoGrupo.groupId).
  assert.deepEqual(lerAcaoLotado({ groupId: "g1@g.us", acao: "marcar" }, daCampanha), {
    ok: false,
    status: 400,
    error: "groupId inválido.",
  });
});

test("grupo que não é desta campanha é 404, mesmo com id bem-formado", () => {
  // Review Focus 1. Mutante: tirar o `find` e mandar o groupId direto ao RPC, que só filtra tenant.
  assert.deepEqual(lerAcaoLotado({ groupId: OUTRO_ID, acao: "marcar" }, [grupo(ID)]), {
    ok: false,
    status: 404,
    error: "Grupo não encontrado nesta campanha.",
  });
  assert.deepEqual(lerAcaoLotado({ groupId: ID, acao: "reabrir" }, []), {
    ok: false,
    status: 404,
    error: "Grupo não encontrado nesta campanha.",
  });
});

test("a mensagem do ainda_cheio é a do mockup, com milhar e porcentagem", () => {
  const cauda = "O link só manda gente abaixo de 95%: aumente a capacidade ou espere sair gente.";
  assert.equal(mensagemAindaCheio(996, 1024), `Ainda está com 996 de 1.024 (97%). ${cauda}`);
  assert.equal(mensagemAindaCheio(1003, 1024), `Ainda está com 1.003 de 1.024 (98%). ${cauda}`);
  // Capacidade 0 vale 1024, como app.limiar_lotado.
  assert.equal(mensagemAindaCheio(990, 0), `Ainda está com 990 de 1.024 (97%). ${cauda}`);
});

test("lota de novo sozinho no primeiro número que alcança 95%", () => {
  assert.equal(lotaDeNovoEm(1024), 973);
  assert.equal(lotaDeNovoEm(100), 95);
  assert.equal(lotaDeNovoEm(0), 973);
  assert.equal(lotaDeNovoEm(1), 1);
});

test("cada resultado do banco vira o status e o motivo do contrato", () => {
  const g = { membros: 996, capacidade: 1024 };
  assert.deepEqual(respostaDaAcao("ok", g), { status: 200, corpo: { ok: true } });
  assert.deepEqual(respostaDaAcao("nao_encontrado", g), { status: 404, corpo: { error: "Grupo não encontrado." } });
  assert.deepEqual(respostaDaAcao("ja_lotado", g), {
    status: 409,
    corpo: { error: "Este grupo já está marcado como lotado.", motivo: "ja_lotado" },
  });
  assert.deepEqual(respostaDaAcao("nao_lotado", g), {
    status: 409,
    corpo: { error: "Este grupo não está marcado como lotado.", motivo: "nao_lotado" },
  });
  assert.deepEqual(respostaDaAcao("ainda_cheio", g), {
    status: 409,
    corpo: { error: mensagemAindaCheio(996, 1024), motivo: "ainda_cheio" },
  });
});
```

- [ ] **Step 2: rodar e ver falhar.**

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/acao-lotado.test.ts
```

  Esperado: FAIL com `ERR_MODULE_NOT_FOUND` (`./acao-lotado`).

- [ ] **Step 3: implementar.** `apps/web/src/lib/groups/acao-lotado.ts`:

```ts
import type { EstadoGrupo } from "@/lib/groups/estado";

/**
 * Marcar e reabrir à mão (`POST /api/campanhas/[slug]/grupos/lotado`, contratos §4). Sem
 * `server-only`: a tela usa as mesmas mensagens no menu ⋯ antes de qualquer clique.
 */

export type AcaoLotado = "marcar" | "reabrir";
export type ResultadoDaAcao = "ok" | "ja_lotado" | "nao_lotado" | "ainda_cheio" | "nao_encontrado";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lerAcaoLotado(
  body: unknown,
  grupos: EstadoGrupo[],
): { ok: true; grupo: EstadoGrupo; acao: AcaoLotado } | { ok: false; status: 400 | 404; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Corpo inválido." };
  }
  const { groupId, acao } = body as Record<string, unknown>;
  if (acao !== "marcar" && acao !== "reabrir") {
    return { ok: false, status: 400, error: 'acao deve ser "marcar" ou "reabrir".' };
  }
  if (typeof groupId !== "string" || !UUID.test(groupId)) {
    return { ok: false, status: 400, error: "groupId inválido." };
  }
  // O grupo tem de ser DESTA campanha: o RPC só filtra tenant, e sem isto a tela de uma
  // campanha mexeria no grupo de outra da mesma loja.
  const grupo = grupos.find((g) => g.groupId === groupId);
  if (!grupo) return { ok: false, status: 404, error: "Grupo não encontrado nesta campanha." };
  return { ok: true, grupo, acao };
}

/** Capacidade 0 ou ausente vale o teto do WhatsApp, como em `app.limiar_lotado`. */
function capacidadeReal(capacidade: number): number {
  return capacidade > 0 ? capacidade : 1024;
}

/** O primeiro número de membros que marca o grupo sozinho: ⌈95% da capacidade⌉ (973 em 1024). */
export function lotaDeNovoEm(capacidade: number): number {
  return Math.ceil((capacidadeReal(capacidade) * 95) / 100);
}

/** Texto do mockup para o Reabrir travado e para o 409 `ainda_cheio`. */
export function mensagemAindaCheio(membros: number, capacidade: number): string {
  const cap = capacidadeReal(capacidade);
  const pct = Math.round((membros / cap) * 100);
  return `Ainda está com ${membros.toLocaleString("pt-BR")} de ${cap.toLocaleString("pt-BR")} (${pct}%). O link só manda gente abaixo de 95%: aumente a capacidade ou espere sair gente.`;
}

export type RespostaDaAcao =
  | { status: 200; corpo: { ok: true } }
  | { status: 404; corpo: { error: string } }
  | { status: 409; corpo: { error: string; motivo: "ainda_cheio" | "nao_lotado" | "ja_lotado" } };

/** `switch` sem `return` final: resultado novo do RPC é erro de `tsc`, não um 200 por engano. */
export function respostaDaAcao(
  resultado: ResultadoDaAcao,
  grupo: Pick<EstadoGrupo, "membros" | "capacidade">,
): RespostaDaAcao {
  switch (resultado) {
    case "ok":
      return { status: 200, corpo: { ok: true } };
    case "nao_encontrado":
      return { status: 404, corpo: { error: "Grupo não encontrado." } };
    case "ja_lotado":
      return { status: 409, corpo: { error: "Este grupo já está marcado como lotado.", motivo: "ja_lotado" } };
    case "nao_lotado":
      return { status: 409, corpo: { error: "Este grupo não está marcado como lotado.", motivo: "nao_lotado" } };
    case "ainda_cheio":
      return {
        status: 409,
        corpo: { error: mensagemAindaCheio(grupo.membros, grupo.capacidade), motivo: "ainda_cheio" },
      };
  }
}
```

- [ ] **Step 4: rodar e ver passar.**

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/acao-lotado.test.ts
```

  Esperado: `# pass 6`, `# fail 0`.

- [ ] **Step 5: mutantes.** Um por vez, rodar o Step 4 e reverter:
  - em `lerAcaoLotado`, trocar `const grupo = grupos.find((g) => g.groupId === groupId);` por `const grupo = grupos[0];` → FAIL em "grupo que não é desta campanha…";
  - em `lotaDeNovoEm`, trocar `capacidadeReal(capacidade)` por `capacidade` → FAIL em "lota de novo sozinho…" (`lotaDeNovoEm(0)` vira 0);
  - em `mensagemAindaCheio`, trocar `cap.toLocaleString("pt-BR")` por `String(cap)` → FAIL em "a mensagem do ainda_cheio…" (`1024` em vez de `1.024`);
  - em `respostaDaAcao`, trocar o `motivo: "nao_lotado"` por `motivo: "ja_lotado"` → FAIL em "cada resultado do banco…".

- [ ] **Step 6: tipos.** `npx tsc --noEmit -p tsconfig.json` → sem erro.

- [ ] **Step 7: commit.**

```powershell
git -C <wt> add -- apps/web/src/lib/groups/acao-lotado.ts apps/web/src/lib/groups/acao-lotado.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(groups): validate and map manual lotado actions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `GET /api/campanhas/[slug]/grupos/estados`

**Files:**
- Create: `apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts`

**Interfaces:**
- Consumes: `getRouteTenantContext(req, { allowEngine: false })`; `getCampaignGroupBySlug(tenantId, slug)` de `@/lib/stores/campaign-groups`; `listCampaignGroupStates` (PR 2); `resumirEstados`, `EstadosDaCampanha` (Task 3).
- Produces: `GET` → 200 `EstadosDaCampanha` · 404 `{ error: "Campanha não encontrada." }` · 401/403 do helper · 500 `{ error: "Não deu para ler o estado dos grupos." }`.

**Depends-on:** Task 3

- [ ] **Step 1: criar a rota.** `apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts`:

```ts
import { resumirEstados, type EstadosDaCampanha } from "@/lib/groups/resumo-estados";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listCampaignGroupStates } from "@/lib/stores/campaign-group-states";
import * as campaignGroupsStore from "@/lib/stores/campaign-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campanhas/[slug]/grupos/estados — o estado de cada grupo da campanha na ordem do
 * pool, a contagem da faixa e quantos grupos cada atalho de destino pega agora.
 *
 * O estado vem pronto de `campaign_group_states` (spec §4); esta rota só conta. Leitura de
 * painel: sessão (`allowEngine: false`, Bearer ou cookie — `finding-tenant-helper-cookie-vs-bearer`),
 * sem exigir `campaign:edit`. A campanha é lida com o tenant da sessão, e o RPC filtra o tenant
 * de novo: o service-role passa por cima do RLS.
 *
 * Modo JSON fora de escopo (spec §10), como as rotas irmãs `grupos/lotes` e `grupos/estado`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    const campaign = await campaignGroupsStore.getCampaignGroupBySlug(tenantId, slug);
    if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

    const grupos = await listCampaignGroupStates(tenantId, campaign.id);
    const resposta: EstadosDaCampanha = { grupos, ...resumirEstados(grupos) };
    return Response.json(resposta);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/estados] falha ao ler:", error);
    return Response.json({ error: "Não deu para ler o estado dos grupos." }, { status: 500 });
  }
}
```

- [ ] **Step 2: tipos e lint.** Em `<wt>\apps\web`: `npx tsc --noEmit -p tsconfig.json` → sem erro; `npm run lint` → sem erro novo.

  (Sem teste de rota: a regra está em `resumirEstados` (Task 3) e na store (Tasks 1–2); a rota é provada ponta a ponta pelo E2E de contraste da Task 10.)

- [ ] **Step 3: commit.**

```powershell
git -C <wt> add -- ":(literal)apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts"
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(api): GET campaign group states" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `POST /api/campanhas/[slug]/grupos/lotado`

**Files:**
- Create: `apps/web/src/app/api/campanhas/[slug]/grupos/lotado/route.ts`

**Interfaces:**
- Consumes: `resolveBulkCampaign(req, slug): Promise<{ tenantId; campaign }>` de `@/lib/groups/bulk-request` (`campaign:edit`, lança `Response`); `listCampaignGroupStates`; `marcarGrupoLotado`, `reabrirGrupo` (Task 1); `lerAcaoLotado`, `respostaDaAcao` (Task 4).
- Produces: `POST` → 200 `{ ok: true }` · 400 `{ error }` · 404 `{ error }` · 409 `{ error, motivo }` · 403 do `assertPermission` · 500 `{ error: "Não deu para mudar o grupo." }`.

**Depends-on:** Task 1, Task 4

- [ ] **Step 1: criar a rota.** `apps/web/src/app/api/campanhas/[slug]/grupos/lotado/route.ts`:

```ts
import { lerAcaoLotado, respostaDaAcao } from "@/lib/groups/acao-lotado";
import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { listCampaignGroupStates, marcarGrupoLotado, reabrirGrupo } from "@/lib/stores/campaign-group-states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/grupos/lotado
 * body { groupId: string (UUID de groups); acao: "marcar" | "reabrir" }
 *
 * Marca ou tira à mão a marca de lotado (spec D1/D2). `campaign:edit` pelo
 * `resolveBulkCampaign`, como as ações irmãs da aba Grupos. O grupo tem de estar nos estados
 * DESTA campanha (`lerAcaoLotado`); o RPC filtra o tenant de novo.
 *
 * O "ainda cheio" é decidido no UPDATE do banco (atômico). A contagem lida aqui só serve para
 * escrever a mensagem do 409.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const grupos = await listCampaignGroupStates(tenantId, campaign.id);
    const lido = lerAcaoLotado(body, grupos);
    if (!lido.ok) return Response.json({ error: lido.error }, { status: lido.status });

    const resultado =
      lido.acao === "marcar"
        ? await marcarGrupoLotado(tenantId, lido.grupo.groupId)
        : await reabrirGrupo(tenantId, lido.grupo.groupId);
    const { status, corpo } = respostaDaAcao(resultado, lido.grupo);
    return Response.json(corpo, { status });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/lotado] falha ao marcar ou reabrir:", error);
    return Response.json({ error: "Não deu para mudar o grupo." }, { status: 500 });
  }
}
```

- [ ] **Step 2: tipos e lint.** `npx tsc --noEmit -p tsconfig.json` → sem erro; `npm run lint` → sem erro novo.

- [ ] **Step 3: commit.**

```powershell
git -C <wt> add -- ":(literal)apps/web/src/app/api/campanhas/[slug]/grupos/lotado/route.ts"
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(api): POST mark or reopen a campaign group as lotado" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: chip de estado e menu ⋯

**Files:**
- Create: `apps/web/src/components/painel/grupos/estado-do-grupo.tsx`

**Interfaces:**
- Consumes: `ROTULO_ESTADO`, `EstadoDoGrupo`, `EstadoGrupo` (PR 2); `lotaDeNovoEm`, `mensagemAindaCheio` (Task 4); `CopyLink({ url, className })` de `@/components/painel/copy-link`; `cn` de `@/lib/utils`; `Lock`, `MoreHorizontal`, `Unlock` de `lucide-react`.
- Produces:
  - `ChipDeEstado({ estado }: { estado: EstadoDoGrupo }): JSX.Element` — `<span data-testid="chip-estado">`.
  - `SeloEnvio({ estado }: { estado: "open" | "closed" | null }): JSX.Element` — **movido sem mudança** de `page.tsx:560-588` (só ganha `export`); a página deixa de declará-lo na Task 8.
  - `MenuDoGrupo(props: { grupo: EstadoGrupo; origin: string; aberto: boolean; ocupado: boolean; aoAlternar: () => void; aoFechar: () => void; aoMarcar: () => void; aoReabrir: () => void; aoEditarCapacidade: () => void }): JSX.Element` — botão `aria-label="Ações do grupo {nome}"`, painel `role="group"` com "Reabrir para receber gente" (lotado) ou "Marcar como lotado" (os outros), "Copiar convite" (o bloco `CopyLink` do `GroupCard`) e "Editar capacidade". `aoFechar` precisa ser estável (`useCallback` no pai).

**Depends-on:** Task 4

Menu como **disclosure** (botão + painel logo depois no DOM), não `role="menu"` como no mockup: o motivo do Reabrir travado é um parágrafo e o Copiar convite mostra a URL, e `menu` só aceita itens. Tab entra no painel, Esc fecha e devolve o foco ao ⋯, clique fora fecha. Copiar **não** fecha o painel: o feedback do `CopyLink` (✓ por 1,5 s) aparece ali, como aparecia no cartão.

- [ ] **Step 1: criar o componente.** `apps/web/src/components/painel/grupos/estado-do-grupo.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef } from "react";
import { Lock, MoreHorizontal, Unlock } from "lucide-react";
import { CopyLink } from "@/components/painel/copy-link";
import { lotaDeNovoEm, mensagemAindaCheio } from "@/lib/groups/acao-lotado";
import { ROTULO_ESTADO, type EstadoDoGrupo, type EstadoGrupo } from "@/lib/groups/estado";
import { cn } from "@/lib/utils";

/**
 * Chip de estado e menu ⋯ de um grupo da campanha (mockup "Grupos da campanha").
 *
 * Acid só no Lotado: é o LOTOU do painel (G2, decisão 11). O vazio leva fio tracejado
 * cinza — borda colorida não pinta no painel (`* { border-color }` em globals.css).
 */
const ESTILO_DO_CHIP: Record<EstadoDoGrupo, string> = {
  lotado: "bg-acid-500 text-volt-950",
  enchendo: "bg-cobalt-500 text-white",
  fila: "bg-porta-ativa text-slate-600",
  vazio: "border border-dashed bg-paper-0 text-slate-600",
};

export function ChipDeEstado({ estado }: { estado: EstadoDoGrupo }) {
  return (
    <span
      data-testid="chip-estado"
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-13 font-semibold",
        ESTILO_DO_CHIP[estado],
      )}
    >
      {ROTULO_ESTADO[estado]}
    </span>
  );
}

/**
 * Aberto / Fechado / sem informação.
 *
 * O terceiro estado é dito em voz alta de propósito: sumir com o selo quando
 * `send_state` é nulo faria "nunca aplicamos" parecer "está aberto", que é a
 * suposição errada mais cara — o lojista acharia que fechou o grupo de
 * madrugada quando não fechou.
 */
export function SeloEnvio({ estado }: { estado: "open" | "closed" | null }) {
  if (estado === "open") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-sucesso/10 px-2.5 py-1 text-12 uppercase tracking-wider text-sucesso">
        <Unlock className="h-3 w-3" /> Aberto
      </span>
    );
  }
  if (estado === "closed") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-poco px-2.5 py-1 text-12 uppercase tracking-wider text-aco">
        <Lock className="h-3 w-3" /> Fechado
      </span>
    );
  }
  return (
    <span className="font-data inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-12 uppercase tracking-wider text-aco">
      Envio: sem informação
    </span>
  );
}

const ITEM =
  "rounded-lg px-3 py-2.5 text-left text-sm font-medium text-volt-950 transition-colors hover:bg-hover-ficha disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent";

type MenuDoGrupoProps = {
  grupo: EstadoGrupo;
  /** `useLinkOrigin()` da página: convite relativo vira absoluto, como no cartão antigo. */
  origin: string;
  aberto: boolean;
  /** Uma ação deste grupo está a caminho do servidor. */
  ocupado: boolean;
  aoAlternar: () => void;
  /** Estável (`useCallback`): entra na dependência do efeito do clique fora. */
  aoFechar: () => void;
  aoMarcar: () => void;
  aoReabrir: () => void;
  aoEditarCapacidade: () => void;
};

/**
 * Disclosure, não `role="menu"`: o motivo do Reabrir travado e a URL do convite são texto, e
 * `menu` só aceita itens. Esc fecha e devolve o foco ao ⋯; clique fora fecha; escolher uma ação
 * fecha e devolve o foco. Copiar o convite não fecha: o ✓ do `CopyLink` aparece ali.
 */
export function MenuDoGrupo({
  grupo,
  origin,
  aberto,
  ocupado,
  aoAlternar,
  aoFechar,
  aoMarcar,
  aoReabrir,
  aoEditarCapacidade,
}: MenuDoGrupoProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const painelId = useId();
  const notaId = useId();

  useEffect(() => {
    if (!aberto) return;
    function aoApertarFora(e: PointerEvent) {
      if (!caixa.current?.contains(e.target as Node)) aoFechar();
    }
    document.addEventListener("pointerdown", aoApertarFora);
    return () => document.removeEventListener("pointerdown", aoApertarFora);
  }, [aberto, aoFechar]);

  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || !aberto) return;
    e.stopPropagation();
    aoFechar();
    gatilho.current?.focus();
  }

  function escolher(acao: () => void) {
    aoFechar();
    gatilho.current?.focus();
    acao();
  }

  const lotado = grupo.estado === "lotado";

  return (
    <div ref={caixa} className="relative" onKeyDown={aoTeclar}>
      <button
        ref={gatilho}
        type="button"
        aria-label={`Ações do grupo ${grupo.nome}`}
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        onClick={aoAlternar}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-hover-ficha hover:text-volt-950"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {aberto && (
        <div
          id={painelId}
          role="group"
          aria-label={`Ações de ${grupo.nome}`}
          className="absolute right-0 top-12 z-20 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-[10px] border border-line-200 bg-paper-0 p-1.5 shadow-deep"
        >
          {lotado ? (
            <>
              <button
                type="button"
                disabled={!grupo.podeReabrir || ocupado}
                aria-describedby={notaId}
                onClick={() => escolher(aoReabrir)}
                className={ITEM}
              >
                Reabrir para receber gente
              </button>
              <p id={notaId} className="mx-3 mb-2 text-13 text-slate-600">
                {grupo.podeReabrir
                  ? `Volta para o link com prioridade sobre o grupo que está enchendo. Lota de novo sozinho em ${lotaDeNovoEm(grupo.capacidade).toLocaleString("pt-BR")}.`
                  : mensagemAindaCheio(grupo.membros, grupo.capacidade)}
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={ocupado}
                aria-describedby={notaId}
                onClick={() => escolher(aoMarcar)}
                className={ITEM}
              >
                Marcar como lotado
              </button>
              <p id={notaId} className="mx-3 mb-2 text-13 text-slate-600">
                Sai do link e passa a receber postagem mesmo sem chegar a 95%.
              </p>
            </>
          )}
          <div className="my-1 h-px bg-line-200" aria-hidden="true" />
          {/* O bloco de convite do GroupCard, igual: mesma URL, mesmo feedback; só a margem muda. */}
          <div data-testid="copiar-convite">
            <p className="px-3 pt-2 text-sm font-medium text-volt-950">Copiar convite</p>
            {grupo.inviteUrl ? (
              <CopyLink url={origin && !grupo.inviteUrl.startsWith("http") ? `${origin}${grupo.inviteUrl}` : grupo.inviteUrl} className="px-3 py-2" />
            ) : (
              <p className="font-data px-3 py-2 text-12 text-atencao">Configure o link de convite</p>
            )}
          </div>
          <button type="button" onClick={() => escolher(aoEditarCapacidade)} className={ITEM}>
            Editar capacidade
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: tipos, lint e regras do painel.** Em `<wt>\apps\web`:
  - `npx tsc --noEmit -p tsconfig.json` → sem erro;
  - `npm run lint` → sem erro novo;
  - `npx tsx scripts/check-painel-vitrine.ts` → `painel:check OK` (1 fundo Acid neste arquivo; máximo 2).

- [ ] **Step 3: commit.**

```powershell
git -C <wt> add -- apps/web/src/components/painel/grupos/estado-do-grupo.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(painel): group state chip and actions menu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: aba Grupos — faixa, frase do link e lista

**Files:**
- Modify: `apps/web/src/components/painel/numeros.tsx:10-17` (`Celula` ganha `valorTestId`)
- Create: `apps/web/src/components/painel/grupos/grupos-da-campanha.tsx`
- Modify: `apps/web/src/app/painel/campanhas/[slug]/page.tsx` (imports `:6-46`; aba Grupos `:374-397`; `GroupCard` `:491-547`; `SeloEnvio` `:560-588`)

**Interfaces:**
- Consumes: `Celula` (`numeros.tsx`), `GroupSettings` (`group-settings.tsx`, `PATCH /api/groups` com `id` = JID), `numero` de `@/lib/painel/grupos`, `detalheDoGrupo`, `fraseDoLink`, `EstadosDaCampanha` (Task 3), `AcaoLotado` (Task 4), `ChipDeEstado`, `MenuDoGrupo`, `SeloEnvio` (Task 7), rotas das Tasks 5 e 6; na página, `groups: Group[]` (de `/api/groups`, com `whatsappGroupId` e `sendState`) e `origin` (`useLinkOrigin()`), que ela já carrega.
- Produces: `GruposDaCampanha({ slug: string; origin: string; envio: Record<string, "open" | "closed" | null>; atualizadoEm: Date; aoMudarCapacidade: () => void | Promise<void> })` — `envio` é `sendState` por `whatsappGroupId`. Âncoras de teste: região "Resumo dos grupos" com `data-testid` `resumo-lotados`, `resumo-enchendo`, `resumo-fila`, `resumo-vazios`, `resumo-membros`; `data-testid="frase-do-link"`; região "Grupos da campanha" com `<li data-group-id="{groupId}">`, `data-testid="selo-envio"` na linha e `data-testid="copiar-convite"` no ⋯ aberto.

**Depends-on:** Task 3, Task 7 (e Tasks 5–6 para funcionar na tela)

- [ ] **Step 1: `Celula` com âncora de teste.** Em `apps/web/src/components/painel/numeros.tsx`, substituir:

```tsx
export function Celula({ rotulo, valor, className, children }: { rotulo: string; valor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("bg-paper-0 px-5 py-4", className)}>
      <p className="text-13 text-slate-600">{rotulo}</p>
      <p className="mt-2 font-display text-32 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950">{valor}</p>
```

por:

```tsx
export function Celula({
  rotulo,
  valor,
  className,
  valorTestId,
  children,
}: {
  rotulo: string;
  valor: string;
  className?: string;
  /** Âncora do E2E no número (a aba Grupos cobra a faixa contra a API). */
  valorTestId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("bg-paper-0 px-5 py-4", className)}>
      <p className="text-13 text-slate-600">{rotulo}</p>
      <p
        data-testid={valorTestId}
        className="mt-2 font-display text-32 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950"
      >
        {valor}
      </p>
```

- [ ] **Step 2: criar o componente da aba.** `apps/web/src/components/painel/grupos/grupos-da-campanha.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { GroupSettings } from "@/components/painel/grupos/group-settings";
import { Celula } from "@/components/painel/numeros";
import type { AcaoLotado } from "@/lib/groups/acao-lotado";
import type { EstadoDoGrupo, EstadoGrupo } from "@/lib/groups/estado";
import { detalheDoGrupo, fraseDoLink, type EstadosDaCampanha } from "@/lib/groups/resumo-estados";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";
import { ChipDeEstado, MenuDoGrupo, SeloEnvio } from "./estado-do-grupo";

/**
 * Aba Grupos da campanha (spec postar por grupo §6.4): faixa de estados, para onde o link
 * está mandando gente e a lista na ordem do pool, com chip, detalhe, selo de envio e o menu ⋯.
 *
 * O estado vem de `GET /api/campanhas/[slug]/grupos/estados`; nada aqui decide estado. O selo
 * de envio vem de `/api/groups` pela página (`envio`), como vinha no cartão antigo. Relê depois
 * de cada ação e quando a página atualiza (`atualizadoEm`).
 */

type Carga = { fase: "carregando" } | { fase: "erro" } | { fase: "pronto"; dados: EstadosDaCampanha };

/** Ordem · Grupo · Membros · Estado · Detalhe · ⋯ (mockup). No celular a linha quebra. */
const COLUNAS = "md:grid md:grid-cols-[56px_minmax(0,1.6fr)_200px_150px_minmax(0,2fr)_48px] md:items-center md:gap-x-3";

const BARRA: Record<EstadoDoGrupo, string> = {
  lotado: "bg-volt-950",
  enchendo: "bg-cobalt-500",
  fila: "bg-slate-600/50",
  vazio: "bg-slate-600/50",
};

const FALHA_NA_ACAO = "Não deu para mudar o grupo. Tente de novo.";

type Props = {
  slug: string;
  /** `useLinkOrigin()` da página, para o Copiar convite do ⋯. */
  origin: string;
  /** `sendState` por `whatsappGroupId` (de `/api/groups`). Ausente = "Envio: sem informação". */
  envio: Record<string, "open" | "closed" | null>;
  /** Muda quando a página recarrega os dados: a lista relê junto. */
  atualizadoEm: Date;
  /** Capacidade mexe na faixa da Visão geral também: a página inteira relê. */
  aoMudarCapacidade: () => void | Promise<void>;
};

export function GruposDaCampanha({ slug, origin, envio, atualizadoEm, aoMudarCapacidade }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: "carregando" });
  const [menu, setMenu] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/campanhas/${encodeURIComponent(slug)}/grupos/estados`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dados = (await res.json()) as EstadosDaCampanha;
      setCarga({ fase: "pronto", dados });
    } catch {
      // Com a lista na tela ela fica, e o aviso diz que está velha; sem lista, é erro.
      setCarga((atual) => (atual.fase === "pronto" ? atual : { fase: "erro" }));
      setAviso((atual) => atual ?? "Não deu para atualizar o estado dos grupos.");
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar, atualizadoEm]);

  const fecharMenu = useCallback(() => setMenu(null), []);

  async function agir(grupo: EstadoGrupo, acao: AcaoLotado) {
    setOcupado(grupo.groupId);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${encodeURIComponent(slug)}/grupos/lotado`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: grupo.groupId, acao }),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => ({}))) as { error?: string };
        setAviso(corpo.error ?? FALHA_NA_ACAO);
      }
    } catch {
      setAviso(FALHA_NA_ACAO);
    } finally {
      setOcupado(null);
    }
    // 409 também relê: outro clique, ou o webhook, pode ter mudado o grupo.
    await carregar();
  }

  if (carga.fase === "carregando") {
    return (
      <div role="status" aria-label="Carregando o estado dos grupos" className="space-y-4">
        <div className="pn-skeleton h-28 rounded-xl" aria-hidden="true" />
        <div className="pn-skeleton h-64 rounded-xl" aria-hidden="true" />
      </div>
    );
  }

  if (carga.fase === "erro") {
    return (
      <div role="alert" className="pn-card rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-volt-950">Não deu para ler o estado dos grupos.</p>
        <button
          type="button"
          onClick={() => {
            setCarga({ fase: "carregando" });
            void carregar();
          }}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-4 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { grupos, contagem } = carga.dados;
  const agora = new Date();
  const enchendo = grupos.find((g) => g.estado === "enchendo") ?? null;
  const frase = fraseDoLink(grupos, agora);

  return (
    <div className="space-y-4">
      {/* Faixa: um painel só, fio entre as células (gap-px sobre o fundo do fio), como a Visão geral. */}
      <section
        aria-label="Resumo dos grupos"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line-200 bg-line-200 sm:grid-cols-3 lg:grid-cols-5"
      >
        <Celula rotulo="Lotados" valor={numero(contagem.lotado)} valorTestId="resumo-lotados">
          recebem postagem
        </Celula>
        <Celula rotulo="Enchendo agora" valor={numero(contagem.enchendo)} valorTestId="resumo-enchendo">
          {enchendo?.nome ?? "nenhum agora"}
        </Celula>
        <Celula rotulo="Na fila" valor={numero(contagem.fila)} valorTestId="resumo-fila">
          recebem postagem
        </Celula>
        <Celula rotulo="Vazios" valor={numero(contagem.vazio)} valorTestId="resumo-vazios">
          só o nosso número
        </Celula>
        <Celula
          rotulo="Membros"
          valor={numero(contagem.membros)}
          valorTestId="resumo-membros"
          className="col-span-2 lg:col-span-1"
        >
          em {numero(grupos.length)} {grupos.length === 1 ? "grupo" : "grupos"}
        </Celula>
      </section>

      <p
        data-testid="frase-do-link"
        className="flex items-start gap-3 rounded-xl border border-line-200 bg-paper-0 px-4 py-3.5 text-sm text-volt-950"
      >
        <Link2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-cobalt-500" aria-hidden="true" />
        {frase.tipo === "parado" ? (
          <span>O link está parado: não há grupo com vaga, convite e o nosso número como admin.</span>
        ) : (
          <span>
            O link está mandando gente para <strong className="font-semibold">{frase.nome}</strong>
            {frase.reaberto ? ` — reaberto ${frase.reaberto}, tem prioridade.` : "."}
            {frase.voltaPara !== null && (
              <>
                {" Quando ele lotar, volta para o "}
                <strong className="font-semibold">{frase.voltaPara}</strong>.
              </>
            )}
          </span>
        )}
      </p>

      {aviso && (
        <p role="alert" className="rounded-xl border border-line-200 bg-aviso-fundo px-4 py-3 text-sm text-volt-950">
          {aviso}
        </p>
      )}

      {/* Sem overflow-hidden: o painel do ⋯ abre por cima da borda da lista. */}
      <section aria-label="Grupos da campanha" className="rounded-xl border border-line-200 bg-paper-0">
        <div
          aria-hidden="true"
          className={cn("hidden border-b border-line-200 px-4 py-2.5 text-13 font-medium text-slate-600", COLUNAS)}
        >
          <span>Ordem</span>
          <span>Grupo</span>
          <span>Membros</span>
          <span>Estado</span>
          <span>Detalhe</span>
          <span />
        </div>
        <ul>
          {grupos.map((g) => (
            <LinhaDoGrupo
              key={g.groupId}
              grupo={g}
              origin={origin}
              envio={envio[g.whatsappGroupId] ?? null}
              detalhe={detalheDoGrupo(g, grupos, agora)}
              menuAberto={menu === g.groupId}
              ocupado={ocupado === g.groupId}
              editando={editando === g.groupId}
              aoAlternarMenu={() => setMenu((atual) => (atual === g.groupId ? null : g.groupId))}
              aoFecharMenu={fecharMenu}
              aoAgir={(acao) => void agir(g, acao)}
              aoEditar={() => setEditando(g.groupId)}
              aoFecharEdicao={() => setEditando(null)}
              aoSalvarCapacidade={aoMudarCapacidade}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

type LinhaProps = {
  grupo: EstadoGrupo;
  origin: string;
  envio: "open" | "closed" | null;
  detalhe: string;
  menuAberto: boolean;
  ocupado: boolean;
  editando: boolean;
  aoAlternarMenu: () => void;
  aoFecharMenu: () => void;
  aoAgir: (acao: AcaoLotado) => void;
  aoEditar: () => void;
  aoFecharEdicao: () => void;
  aoSalvarCapacidade: () => void | Promise<void>;
};

function LinhaDoGrupo({
  grupo: g,
  origin,
  envio,
  detalhe,
  menuAberto,
  ocupado,
  editando,
  aoAlternarMenu,
  aoFecharMenu,
  aoAgir,
  aoEditar,
  aoFecharEdicao,
  aoSalvarCapacidade,
}: LinhaProps) {
  const capacidade = g.capacidade > 0 ? g.capacidade : 1024;
  const pct = Math.min(100, Math.round((g.membros / capacidade) * 100));

  return (
    <li
      data-group-id={g.groupId}
      className={cn("border-b border-line-200 px-4 py-2 last:border-b-0", g.estado === "enchendo" && "bg-cobalt-500/5")}
    >
      <div className={cn("flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2", COLUNAS)}>
        <span className="font-data text-13 tabular-nums text-slate-600">{g.posicao}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-volt-950">{g.nome}</span>
        <span className="flex items-center gap-2.5">
          <span className="font-data min-w-[92px] text-13 tabular-nums text-volt-950">
            {numero(g.membros)}
            <span className="text-slate-600">/{numero(capacidade)}</span>
          </span>
          <span className="block h-1.5 w-[90px] overflow-hidden rounded-sm bg-line-200" aria-hidden="true">
            <span className={cn("block h-full", BARRA[g.estado])} style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span>
          <ChipDeEstado estado={g.estado} />
        </span>
        <span className="flex flex-wrap items-center gap-2.5 text-13 text-slate-600">
          <span>{detalhe}</span>
          {/* O selo do cartão antigo, igual: nulo continua dito "sem informação", nunca "aberto". */}
          <span data-testid="selo-envio">
            <SeloEnvio estado={envio} />
          </span>
          {g.estado === "enchendo" && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => aoAgir("marcar")}
              className="inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-2.5 text-13 font-medium text-volt-950 transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60 md:min-h-9"
            >
              Marcar como lotado
            </button>
          )}
        </span>
        <div className="ml-auto md:ml-0 md:justify-self-end">
          <MenuDoGrupo
            grupo={g}
            origin={origin}
            aberto={menuAberto}
            ocupado={ocupado}
            aoAlternar={aoAlternarMenu}
            aoFechar={aoFecharMenu}
            aoMarcar={() => aoAgir("marcar")}
            aoReabrir={() => aoAgir("reabrir")}
            aoEditarCapacidade={aoEditar}
          />
        </div>
      </div>
      {editando && (
        <div className="pb-2 pt-1">
          {/* O PATCH quer o JID em `id` e o convite atual: convite vazio é "remover convite". */}
          <GroupSettings
            groupId={g.whatsappGroupId}
            inviteUrl={g.inviteUrl ?? undefined}
            capacity={g.capacidade}
            onSaved={aoSalvarCapacidade}
            onClose={aoFecharEdicao}
          />
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 3: página — imports.** Em `apps/web/src/app/painel/campanhas/[slug]/page.tsx`, substituir:

```tsx
import {
  ArrowLeft,
  MessageCircle,
  MoreHorizontal,
  Users,
  Lock,
  Unlock,
  MousePointerClick,
  AlertTriangle,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Loader2,
} from "lucide-react";
```

por:

```tsx
import {
  ArrowLeft,
  MoreHorizontal,
  Users,
  MousePointerClick,
  AlertTriangle,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Loader2,
} from "lucide-react";
```

  Substituir:

```tsx
import {
  buildCampaignGroupsOverview,
  type CampaignGroupOverview,
  type CampaignGroupsOverview,
} from "@/lib/campaign-groups-overview";
```

  por:

```tsx
import { buildCampaignGroupsOverview, type CampaignGroupsOverview } from "@/lib/campaign-groups-overview";
```

  Substituir:

```tsx
import { AcoesEmMassa } from "@/components/painel/grupos/acoes-em-massa";
```

  por:

```tsx
import { AcoesEmMassa } from "@/components/painel/grupos/acoes-em-massa";
import { GruposDaCampanha } from "@/components/painel/grupos/grupos-da-campanha";
```

  Apagar a linha:

```tsx
import { QUASE_LOTADO } from "@/lib/painel/grupos";
```

- [ ] **Step 4: página — aba Grupos.** Substituir:

```tsx
            <>
              <AcoesEmMassa
```

  por:

```tsx
            <div className="space-y-6">
              <GruposDaCampanha
                slug={campanha.slug ?? campanha.id}
                origin={origin}
                envio={Object.fromEntries(groups.map((g) => [g.whatsappGroupId, g.sendState ?? null]))}
                atualizadoEm={atualizadoEm}
                aoMudarCapacidade={loadData}
              />
              <AcoesEmMassa
```

  (`groups` é o estado da página com `/api/groups`; `g.sendState ?? null` é a mesma leitura que o `GroupCard` fazia com `g.group?.sendState ?? null`.)

  Substituir:

```tsx
                onLoteConcluido={loadData}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {o.groups.map((g) => <GroupCard key={g.id} g={g} live={live} origin={origin} />)}
              </div>
            </>
```

  por:

```tsx
                onLoteConcluido={loadData}
              />
            </div>
```

- [ ] **Step 5: página — apagar o `GroupCard`.** Substituir:

```tsx
/* ---------- grupo (dados reais) ---------- */

function GroupCard({ g, live, origin }: { g: CampaignGroupOverview; live: boolean | null; origin: string }) {
  const cap = g.capacity > 0 ? (g.members / g.capacity) * 100 : 0;
  // O mesmo limiar da tela de Grupos e da Visão geral (era 80 só aqui).
  const quase = cap >= QUASE_LOTADO * 100;
  const conectado = live !== false && g.status !== "missing_invite";
  const name = g.group?.name ?? "Grupo";

  return (
    <div className={cn("pn-card rounded-xl p-5", !conectado && "border-alerta/20")}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#25D366] text-white"><MessageCircle className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="font-display truncate text-sm font-bold text-volt-950">{name}</p>
            <p className="font-data text-12 uppercase tracking-wider text-aco">WhatsApp</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {g.status === "missing_invite" ? (
          <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-atencao/10 px-2.5 py-1 text-12 uppercase tracking-wider text-atencao">
            <Lock className="h-3 w-3" /> Sem convite
          </span>
        ) : conectado ? (
          <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-sucesso/10 px-2.5 py-1 text-12 uppercase tracking-wider text-sucesso">
            <Unlock className="h-3 w-3" /> {g.status === "full" ? "Cheio" : "Ativo"}
          </span>
        ) : (
          <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-alerta/10 px-2.5 py-1 text-12 uppercase tracking-wider text-alerta">
            <Lock className="h-3 w-3" /> Desconectado
          </span>
        )}
        <SeloEnvio estado={g.group?.sendState ?? null} />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="font-data text-12 uppercase tracking-wider text-aco">Capacidade</span>
          <span className={cn("font-data text-sm font-medium tabular-nums", quase ? "text-atencao" : "text-cobalt-500")}>{Math.round(cap)}%</span>
        </div>
        <div className="pn-poco mt-1.5 h-2 w-full overflow-hidden rounded-full">
          <div className="pn-fill h-full w-full rounded-full" style={{ transform: `scaleX(${Math.max(cap / 100, 0.02)})`, background: quase ? "#D99B2A" : "var(--color-cobalt-500)" }} />
        </div>
        <p className="font-data mt-1 text-12 tabular-nums text-aco">{g.members.toLocaleString("pt-BR")} membros · limite {g.capacity.toLocaleString("pt-BR")}</p>
      </div>

      {g.inviteUrl ? (
        <CopyLink url={origin && !g.inviteUrl.startsWith("http") ? `${origin}${g.inviteUrl}` : g.inviteUrl} className="mt-3" />
      ) : (
        <p className="font-data mt-3 text-12 text-atencao">Configure o link de convite</p>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */
```

  por:

```tsx
/* ---------- helpers ---------- */
```

- [ ] **Step 6: página — tirar o `SeloEnvio` daqui (ele mora em `estado-do-grupo.tsx` desde a Task 7, idêntico).** Antes, conferir que o corpo é o mesmo nos dois arquivos:

```powershell
$pagina = (Get-Content -Raw -LiteralPath "<wt>\apps\web\src\app\painel\campanhas\[slug]\page.tsx") -replace "`r`n", "`n"
$novo = (Get-Content -Raw -LiteralPath "<wt>\apps\web\src\components\painel\grupos\estado-do-grupo.tsx") -replace "`r`n", "`n"
$corpo = [regex]::Match($pagina, '(?s)function SeloEnvio\(.*?\n\}\n').Value
$corpo.Length -gt 0 -and $novo.Contains("export $corpo")
```

  Esperado: `True`. Então substituir em `page.tsx` (o `}` do começo é o fim de `Tile`):

```tsx
}

/**
 * Aberto / Fechado / sem informação.
 *
 * O terceiro estado é dito em voz alta de propósito: sumir com o selo quando
 * `send_state` é nulo faria "nunca aplicamos" parecer "está aberto", que é a
 * suposição errada mais cara — o lojista acharia que fechou o grupo de
 * madrugada quando não fechou.
 */
function SeloEnvio({ estado }: { estado: "open" | "closed" | null }) {
  if (estado === "open") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-sucesso/10 px-2.5 py-1 text-12 uppercase tracking-wider text-sucesso">
        <Unlock className="h-3 w-3" /> Aberto
      </span>
    );
  }
  if (estado === "closed") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-poco px-2.5 py-1 text-12 uppercase tracking-wider text-aco">
        <Lock className="h-3 w-3" /> Fechado
      </span>
    );
  }
  return (
    <span className="font-data inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-12 uppercase tracking-wider text-aco">
      Envio: sem informação
    </span>
  );
}
```

  por:

```tsx
}
```

  (O selo continua por grupo, agora na linha da lista; a contagem de "Configurações dos grupos", `grupos-estado-contagem`, não muda.)

- [ ] **Step 7: nada sobrou.**

```powershell
Select-String -LiteralPath "<wt>\apps\web\src\app\painel\campanhas\[slug]\page.tsx" -Pattern "GroupCard|SeloEnvio|QUASE_LOTADO|MessageCircle|Unlock|CampaignGroupOverview\b"
```

  Esperado: nenhuma linha.

```powershell
Select-String -LiteralPath "<wt>\apps\web\src\app\painel\campanhas\[slug]\page.tsx" -Pattern "CopyLink|origin|GruposDaCampanha"
```

  Esperado: `CopyLink` no import e no cabeçalho (`masterUrl`), `origin` em `useLinkOrigin`/`linkPublico` e no `origin={origin}` da aba, `GruposDaCampanha` no import e na aba.

- [ ] **Step 8: tipos, lint, painel, testes.** Em `<wt>\apps\web`, um por vez:
  - `npx tsc --noEmit -p tsconfig.json` → sem erro;
  - `npm run lint` → sem erro novo (import sem uso aparece aqui);
  - `npx tsx scripts/check-painel-vitrine.ts` → `painel:check OK` (`grupos-da-campanha.tsx` com 0 fundo Acid; `page.tsx` continua com 1);
  - `npm test` → verde.

- [ ] **Step 9: commit.**

```powershell
git -C <wt> add -- apps/web/src/components/painel/numeros.tsx apps/web/src/components/painel/grupos/grupos-da-campanha.tsx ":(literal)apps/web/src/app/painel/campanhas/[slug]/page.tsx"
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: os três arquivos; `page.tsx` com saldo negativo (~90 linhas a menos).

```powershell
git -C <wt> commit -m "feat(painel): Grupos tab reads group states (strip, link line, list)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: aba "Link e cliques" lê o enchendo de `/grupos/estados`; sai `withSequentialEstado` (TDD)

**Files:**
- Create: `apps/web/src/lib/painel/destino-do-link.ts`
- Create: `apps/web/src/lib/painel/destino-do-link.test.ts`
- Modify: `apps/web/src/components/painel/campanhas/detalhe/link-e-cliques.tsx` (imports `:3-15`; o `useMemo` de `destino` `:44-64`; o destino na tela `:96-109` — linhas de hoje; os blocos "antes" abaixo já são os do arquivo depois do PR 2, Task 5 Step 8)
- Modify: `apps/web/src/lib/links/resolve-click-target.ts` (o `withSequentialEstado` e o comentário de `nextAvailableGroup`, do PR 2 Task 4)
- Modify: `apps/web/src/lib/links/resolve-click-target.test.ts` (o import e o bloco "Aproximação da aba Link e cliques", do PR 2 Task 4)

**Interfaces:**
- Consumes: `resolveClickTarget`, `toResolvableGroup` de `@/lib/links/resolve-click-target` (PR 2); `paradoDoLink` de `@/lib/painel/link-parado`; `EntradaSettings`, `ENTRADA_DEFAULTS` de `@/lib/campaigns/settings`; `EstadoGrupo` (PR 2); `EstadosDaCampanha` (Task 3); `GET /api/campanhas/[slug]/grupos/estados` (Task 5).
- Produces: `destinoDoLink(input: { estados: EstadoGrupo[]; groupIds: string[]; gruposNaTela: number; entrada: EntradaSettings; agora: Date }): { grupo: EstadoGrupo | null; parado: { texto: string; grave: boolean } | null }`; `data-testid="destino-do-link"` na aba Link e cliques.
- Removes: `withSequentialEstado` de `@/lib/links/resolve-click-target`. `toResolvableGroup` **fica**: `short-link-click.ts` (PR 2) e `destino-do-link.ts` usam.

**Depends-on:** Task 3 (e Task 5 para funcionar na tela; PR 2 em `main`)

O PR 2 deixou a aba com `withSequentialEstado` (`ponytail:`): o "enchendo" aproximado pela sequência antiga, sem a marca de lotado nem a prioridade do reaberto — diverge do `/r/` quando um lotado volta para baixo de 95% ou um grupo é reaberto. Aqui a aba passa a ler o estado da mesma rota da aba Grupos e a passar esses grupos (com `estado`, via `toResolvableGroup`) pelo mesmo `resolveClickTarget` do `/r/`. Volta a existir uma fonte só do estado (o SQL) e uma regra só do alvo; a data de encerramento e o diagnóstico do link parado continuam no resolvedor, como hoje.

- [ ] **Step 1: o que o PR 2 deixou.**

```powershell
git -C <wt> grep -n "withSequentialEstado\|toResolvableGroup" -- apps/web/src
```

  Esperado: `withSequentialEstado` em `resolve-click-target.ts` (definição), `resolve-click-target.test.ts` (import e o bloco de teste) e `link-e-cliques.tsx` (import e uso); `toResolvableGroup` também em `short-link-click.ts`. Outro arquivo usando `withSequentialEstado` → parar e perguntar (apareceu consumidor novo).

```powershell
Select-String -LiteralPath "<wt>\apps\web\src\components\painel\campanhas\detalhe\link-e-cliques.tsx" -Pattern "withSequentialEstado|resolveClickTarget|paradoDoLink"
```

  Esperado: o import da linha 9 com `withSequentialEstado`, o `resolveClickTarget({`, o `groups: withSequentialEstado(groupIds, resolviveis),` e o `paradoDoLink(` — os blocos "antes" dos Steps 7–9. Diferente disso, comparar com `git -C <wt> show origin/main:apps/web/src/components/painel/campanhas/detalhe/link-e-cliques.tsx` e ajustar os blocos "antes" ao que está lá (o "depois" não muda).

- [ ] **Step 2: teste que falha.** `apps/web/src/lib/painel/destino-do-link.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { ENTRADA_DEFAULTS } from "@/lib/campaigns/settings";
import type { EstadoGrupo } from "@/lib/groups/estado";
import { destinoDoLink } from "./destino-do-link";
import { paradoDoLink } from "./link-parado";

/** 12h de 10/10 em Brasília. */
const AGORA = new Date("2026-10-10T15:00:00Z");

function grupo(p: Pick<EstadoGrupo, "posicao" | "estado"> & Partial<EstadoGrupo>): EstadoGrupo {
  return {
    groupId: `00000000-0000-4000-8000-${String(p.posicao).padStart(12, "0")}`,
    whatsappGroupId: `g${p.posicao}@g.us`,
    nome: `Moda Kids do Sul ${p.posicao}`,
    membros: 100,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: `https://chat.whatsapp.com/C${p.posicao}`,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    podeReabrir: false,
    naRegra: { menos_enchendo: false, lotados: false, com_gente: false },
    ...p,
  };
}
const ids = (gs: EstadoGrupo[]) => gs.map((g) => g.whatsappGroupId);

test("manda para o enchendo do banco, não para o primeiro com vaga da sequência antiga", () => {
  // Marcado à mão com 812 (abaixo de 95%): withSequentialEstado mandaria para ele.
  const marcado = [
    grupo({ posicao: 1, estado: "lotado", membros: 812, lotadoPor: "manual", lotadoEm: "2026-10-09T12:00:00Z" }),
    grupo({ posicao: 2, estado: "enchendo", membros: 300 }),
  ];
  const d1 = destinoDoLink({ estados: marcado, groupIds: ids(marcado), gruposNaTela: 2, entrada: ENTRADA_DEFAULTS, agora: AGORA });
  assert.equal(d1.grupo?.posicao, 2);
  assert.equal(d1.parado, null);

  // Reaberto com prioridade: o banco diz que o 3 enche, mesmo com o 1 tendo vaga.
  const reaberto = [
    grupo({ posicao: 1, estado: "fila", membros: 40 }),
    grupo({ posicao: 3, estado: "enchendo", membros: 900, reabertoEm: "2026-10-10T10:00:00Z" }),
  ];
  const d2 = destinoDoLink({ estados: reaberto, groupIds: ids(reaberto), gruposNaTela: 2, entrada: ENTRADA_DEFAULTS, agora: AGORA });
  assert.equal(d2.grupo?.posicao, 3);
});

test("sem grupo enchendo, o link está parado com o motivo e o destino do /r/", () => {
  const cheios = [
    grupo({ posicao: 1, estado: "lotado", membros: 1000 }),
    grupo({ posicao: 2, estado: "lotado", membros: 990 }),
  ];
  assert.deepEqual(
    destinoDoLink({ estados: cheios, groupIds: ids(cheios), gruposNaTela: 2, entrada: ENTRADA_DEFAULTS, agora: AGORA }),
    { grupo: null, parado: paradoDoLink("all-full", ids(cheios), 2, ENTRADA_DEFAULTS.lotado) },
  );
});

test("campanha encerrada vence o grupo que está enchendo", () => {
  const um = [grupo({ posicao: 1, estado: "enchendo" })];
  const encerrada = { ...ENTRADA_DEFAULTS, encerra_em: "2026-10-01" };
  assert.deepEqual(
    destinoDoLink({ estados: um, groupIds: ids(um), gruposNaTela: 1, entrada: encerrada, agora: AGORA }),
    { grupo: null, parado: paradoDoLink("closed", ids(um), 1, encerrada.lotado) },
  );
});

test("grupos da campanha fora dos estados: quem diz se sumiram da conta é o que a página leu de /api/groups", () => {
  // Mutante: passar estados.length (0) no lugar de gruposNaTela troca "não estão mais na sua
  // conta" (grave) por "não apareceram aqui".
  assert.deepEqual(
    destinoDoLink({ estados: [], groupIds: ["sumiu@g.us"], gruposNaTela: 5, entrada: ENTRADA_DEFAULTS, agora: AGORA }),
    { grupo: null, parado: paradoDoLink("empty-pool", ["sumiu@g.us"], 5, ENTRADA_DEFAULTS.lotado) },
  );
});
```

- [ ] **Step 3: rodar e ver falhar.** Em `<wt>\apps\web`:

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/destino-do-link.test.ts
```

  Esperado: FAIL com `ERR_MODULE_NOT_FOUND` (`./destino-do-link`).

- [ ] **Step 4: implementar.** `apps/web/src/lib/painel/destino-do-link.ts`:

```ts
import type { EntradaSettings } from "@/lib/campaigns/settings";
import type { EstadoGrupo } from "@/lib/groups/estado";
import { resolveClickTarget, toResolvableGroup } from "@/lib/links/resolve-click-target";
import { paradoDoLink } from "@/lib/painel/link-parado";

export type DestinoDoLink = {
  grupo: EstadoGrupo | null;
  parado: { texto: string; grave: boolean } | null;
};

/**
 * Para que grupo o link mestre manda quem clica pela primeira vez agora (aba "Link e cliques").
 *
 * O mesmo `resolveClickTarget` do `/r/`, com os grupos e o estado de
 * `GET /api/campanhas/[slug]/grupos/estados` — a fonte da aba Grupos. Nada aqui decide quem
 * enche: o `estado` vem do SQL via `toResolvableGroup`. Sem grupo lembrado, de propósito: é a
 * visão de quem nunca clicou.
 *
 * `gruposNaTela` é quantos grupos a página leu de `/api/groups`: é ele que separa "os grupos
 * saíram da sua conta" de "os grupos não apareceram aqui" (`paradoDoLink`).
 */
export function destinoDoLink(input: {
  estados: EstadoGrupo[];
  groupIds: string[];
  gruposNaTela: number;
  entrada: EntradaSettings;
  agora: Date;
}): DestinoDoLink {
  const alvo = resolveClickTarget({
    link: { campaign_group_id: "campanha", target_url: "", clicks: 0, metadata: {} },
    campaign: { group_ids: input.groupIds },
    groups: input.estados.map(toResolvableGroup),
    entrada: input.entrada,
    now: input.agora,
  });
  if (alvo.kind === "blocked") {
    return {
      grupo: null,
      parado:
        alvo.reason === "cap-reached"
          ? null
          : paradoDoLink(alvo.reason, input.groupIds, input.gruposNaTela, input.entrada.lotado),
    };
  }
  return { grupo: input.estados.find((g) => g.whatsappGroupId === alvo.groupId) ?? null, parado: null };
}
```

- [ ] **Step 5: rodar e ver passar.**

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/destino-do-link.test.ts
```

  Esperado: `# pass 4`, `# fail 0`.

- [ ] **Step 6: mutantes.** Um por vez, rodar o Step 5 e reverter:
  - trocar `groups: input.estados.map(toResolvableGroup),` por `groups: input.estados.map((e) => ({ ...toResolvableGroup(e), estado: undefined })),` → FAIL em "manda para o enchendo do banco…" (sem estado, ninguém enche);
  - trocar `input.gruposNaTela` por `input.estados.length` → FAIL em "grupos da campanha fora dos estados…".

- [ ] **Step 7: a aba — imports.** Em `link-e-cliques.tsx`, substituir:

```tsx
import { useMemo, useState } from "react";
import Link from "next/link";
import { CopyLink } from "@/components/painel/copy-link";
import { QrLink } from "@/components/painel/campanhas/qr-link";
import type { EntradaSettings } from "@/lib/campaigns/settings";
import { dayBR, horaBR } from "@/lib/date-br";
import { resolveClickTarget, withSequentialEstado, type ResolvableGroup } from "@/lib/links/resolve-click-target";
import type { Group } from "@/lib/mock-data";
import { barrasDaAtividade, nomeDoMes, somaDa, type Periodo } from "@/lib/painel/atividade";
import { medindoDesde } from "@/lib/painel/atividade-texto";
import { lotacao, numero } from "@/lib/painel/grupos";
import { paradoDoLink } from "@/lib/painel/link-parado";
import { cn } from "@/lib/utils";
```

  por:

```tsx
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CopyLink } from "@/components/painel/copy-link";
import { QrLink } from "@/components/painel/campanhas/qr-link";
import type { EntradaSettings } from "@/lib/campaigns/settings";
import { dayBR, horaBR } from "@/lib/date-br";
import type { EstadoGrupo } from "@/lib/groups/estado";
import type { EstadosDaCampanha } from "@/lib/groups/resumo-estados";
import type { Group } from "@/lib/mock-data";
import { barrasDaAtividade, nomeDoMes, somaDa, type Periodo } from "@/lib/painel/atividade";
import { medindoDesde } from "@/lib/painel/atividade-texto";
import { destinoDoLink } from "@/lib/painel/destino-do-link";
import { lotacao, numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";
```

- [ ] **Step 8: a aba — de onde vem o destino.** Substituir:

```tsx
  const destino = useMemo(() => {
    const resolviveis: ResolvableGroup[] = grupos.map((g) => ({
      whatsapp_group_id: g.whatsappGroupId,
      name: g.name,
      members: g.members,
      capacity: g.capacity,
      invite_url: g.inviteUrl ?? null,
      is_admin: g.isAdmin,
    }));
    const alvo = resolveClickTarget({
      link: { campaign_group_id: "campanha", target_url: "", clicks: 0, metadata: {} },
      campaign: { group_ids: groupIds },
      // Esta aba ainda não recebe o estado do banco: aproxima o "enchendo" pela
      // sequência antiga (ver withSequentialEstado). O PR 4 troca por /grupos/estados.
      groups: withSequentialEstado(groupIds, resolviveis),
      entrada,
      now: agora,
    });
    if (alvo.kind === "blocked") {
      return { grupo: null, parado: alvo.reason === "cap-reached" ? null : paradoDoLink(alvo.reason, groupIds, grupos.length, entrada.lotado) };
    }
    return { grupo: grupos.find((g) => g.whatsappGroupId === alvo.groupId) ?? null, parado: null };
  }, [grupos, groupIds, entrada, agora]);
```

  por:

```tsx
  // O "enchendo" vem do banco, pela mesma rota da aba Grupos: uma fonte só do estado.
  // null = lendo; "erro" = a leitura falhou, e a aba não chuta destino.
  const [estados, setEstados] = useState<EstadoGrupo[] | "erro" | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/campanhas/${encodeURIComponent(slug)}/grupos/estados`)
      .then((r) => (r.ok ? (r.json() as Promise<EstadosDaCampanha>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (vivo) setEstados(d.grupos);
      })
      .catch(() => {
        if (vivo) setEstados("erro");
      });
    return () => {
      vivo = false;
    };
  }, [slug, agora]);

  const destino = useMemo(
    () =>
      Array.isArray(estados)
        ? destinoDoLink({ estados, groupIds, gruposNaTela: grupos.length, entrada, agora })
        : null,
    [estados, groupIds, grupos.length, entrada, agora],
  );
```

- [ ] **Step 9: a aba — o destino na tela (três estados: lendo, erro, pronto).** Substituir:

```tsx
            {destino.grupo ? (
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                <strong className="font-semibold text-volt-950">{destino.grupo.name}</strong>
                <span className="tabular-nums text-slate-600">
                  {numero(destino.grupo.members)} de {numero(destino.grupo.capacity)} ·{" "}
                  {Math.round(lotacao(destino.grupo.members, destino.grupo.capacity) * 100)}%
                </span>
              </p>
            ) : (
              <p className={cn("mt-1 text-sm font-medium", destino.parado?.grave === false ? "text-volt-950" : "text-danger-700")}>
                {destino.parado?.texto ?? "Nenhum grupo agora."}
              </p>
            )}
```

  por:

```tsx
            {destino === null ? (
              <p data-testid="destino-do-link" className="mt-1 text-sm text-slate-600">
                {estados === "erro" ? "Não deu para ler o estado dos grupos agora." : "Lendo o estado dos grupos…"}
              </p>
            ) : destino.grupo ? (
              <p data-testid="destino-do-link" className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                <strong className="font-semibold text-volt-950">{destino.grupo.nome}</strong>
                <span className="tabular-nums text-slate-600">
                  {numero(destino.grupo.membros)} de {numero(destino.grupo.capacidade)} ·{" "}
                  {Math.round(lotacao(destino.grupo.membros, destino.grupo.capacidade) * 100)}%
                </span>
              </p>
            ) : (
              <p
                data-testid="destino-do-link"
                className={cn("mt-1 text-sm font-medium", destino.parado?.grave === false ? "text-volt-950" : "text-danger-700")}
              >
                {destino.parado?.texto ?? "Nenhum grupo agora."}
              </p>
            )}
```

- [ ] **Step 10: apagar `withSequentialEstado`.** Em `apps/web/src/lib/links/resolve-click-target.ts`, substituir (o bloco que o PR 2 criou, com a linha em branco antes dele):

```ts

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

  por nada (o arquivo segue do `}` de `toResolvableGroup` para o que vinha depois). No comentário de `nextAvailableGroup`, substituir:

```ts
 * `enchendo` que o banco calcula. Sobra só para `withSequentialEstado`.
```

  por:

```ts
 * `enchendo` que o banco calcula. Sem uso em produção desde o PR 4 (a aba Link e
 * cliques lê o `enchendo` de /grupos/estados); fica coberta pelos testes da regra antiga.
```

- [ ] **Step 11: o teste do PR 2 que usava a função.** Em `apps/web/src/lib/links/resolve-click-target.test.ts`, substituir:

```ts
  toResolvableGroup,
  withSequentialEstado,
  type ResolvableGroup,
```

  por:

```ts
  toResolvableGroup,
  type ResolvableGroup,
```

  e substituir (bloco inteiro, com a linha em branco depois dele):

```ts
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

```

  por nada (o `console.log("resolve-click-target estado tests passed");` continua).

- [ ] **Step 12: uma fonte só.**

```powershell
git -C <wt> grep -n "withSequentialEstado" -- apps/web
```

  Esperado: vazio.

```powershell
git -C <wt> grep -n "toResolvableGroup" -- apps/web/src
```

  Esperado: definição em `resolve-click-target.ts`, uso em `short-link-click.ts` e `destino-do-link.ts`, e os testes. Fica.

```powershell
git -C <wt> grep -n "nextAvailableGroup\|isGroupAvailable" -- apps/web/src
```

  Esperado: só `resolve-click-target.ts`, `resolve-click-target.test.ts` e o `nextAvailableGroup` próprio de `lib/groups-store.ts` (modo JSON). Sem importador de produção: não apagar neste PR (os testes da regra antiga são do PR 2); anotar no corpo do PR como limpeza seguinte.

- [ ] **Step 13: testes, tipos, lint.** Em `<wt>\apps\web`:

```powershell
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/destino-do-link.test.ts src/lib/links/resolve-click-target.test.ts src/lib/links/resolve-click-target.entrada.test.ts
```

  Esperado: `# fail 0`.
  - `npx tsc --noEmit -p tsconfig.json` → sem erro (import sem uso de `ResolvableGroup`/`paradoDoLink` na aba aparece aqui ou no lint);
  - `npm run lint` → sem erro novo;
  - `npx tsx scripts/check-painel-vitrine.ts` → `painel:check OK`.

- [ ] **Step 14: commit.**

```powershell
git -C <wt> add -- apps/web/src/lib/painel/destino-do-link.ts apps/web/src/lib/painel/destino-do-link.test.ts apps/web/src/components/painel/campanhas/detalhe/link-e-cliques.tsx apps/web/src/lib/links/resolve-click-target.ts apps/web/src/lib/links/resolve-click-target.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: os cinco arquivos.

```powershell
git -C <wt> commit -m "refactor(painel): Link e cliques reads the filling group from group states; drop withSequentialEstado" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: E2E da aba Grupos

**Files:**
- Create: `apps/web/e2e/painel-campanha-estados-grupos.spec.ts`

**Interfaces:**
- Consumes: `coletarFalhasDeApi`, `exigeCredenciais` de `./sessao-helpers`; `import type { EstadoGrupo }` de `../src/lib/groups/estado` (só tipo, apagado em runtime — o spec não depende do alias `@/` em runtime); rotas reais `GET /api/campanhas`, `GET .../grupos/estados`; âncoras da Task 8.
- Produces: 2 testes: contraste com a API real (faixa, chip e selo de envio por grupo contra `/grupos/estados` e `/api/groups`); API simulada (`page.route`) para Reabrir travado, Copiar convite (área de transferência e "Configure o link de convite"), selo Aberto/Fechado/sem informação, menu, ações e Editar capacidade, com prova visual em 1280 e 390. Nos dois, a aba Link e cliques mostra o mesmo grupo que enche (`destino-do-link`, Task 9) — com a API simulada, prova que ela lê `/grupos/estados` e não a sequência antiga.

**Depends-on:** Task 5, Task 6, Task 8, Task 9

Textos cobrados como literais (rótulos e mensagem), não importados: o teste cobra o contrato visível, e um rótulo trocado no código tem de reprovar aqui.

- [ ] **Step 1: criar o spec.** `apps/web/e2e/painel-campanha-estados-grupos.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

import type { EstadoGrupo } from "../src/lib/groups/estado";
import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Aba Grupos da campanha (postar por grupo, PR 4): faixa de estados, chip por grupo, frase do
 * link e o menu ⋯ com Reabrir / Marcar como lotado / Editar capacidade.
 *
 * Dois desenhos, de propósito:
 * - CONTRASTE com a API real: a tela mostra exatamente o que /grupos/estados respondeu. Nenhum
 *   número fixo — o estado de dev muda a cada sync.
 * - API SIMULADA (page.route) para o que o dev não garante: um lotado ainda cheio (o Reabrir
 *   travado com o motivo) e um enchendo reaberto. Simular em vez de mexer em grupo real: o banco
 *   de dev é de todos os PRs ao mesmo tempo, e mudar capacidade ou marca de um grupo de QA mudaria
 *   o destino do link no meio do run de outro PR. O SQL de `podeReabrir` é provado no teste de
 *   integração da store.
 */

type Campanha = {
  id: string;
  slug?: string;
  groupIds: string[];
  settings?: { entrada?: { encerra_em?: string | null } };
};
type Alvo = { slug: string; estados: Estados; encerraEm: string | null };
type Estados = {
  grupos: EstadoGrupo[];
  contagem: { lotado: number; enchendo: number; fila: number; vazio: number; membros: number };
};

type GrupoDaApi = { whatsappGroupId: string; sendState?: "open" | "closed" | null };

const ROTULO: Record<EstadoGrupo["estado"], string> = {
  lotado: "Lotado",
  enchendo: "Enchendo agora",
  fila: "Na fila",
  vazio: "Vazio",
};
/** Texto do `SeloEnvio` (o CSS põe em caixa alta; o texto do DOM é este). */
const SELO = { open: "Aberto", closed: "Fechado", nenhum: "Envio: sem informação" } as const;
const selo = (s: GrupoDaApi["sendState"]) => (s === "open" ? SELO.open : s === "closed" ? SELO.closed : SELO.nenhum);
const numero = (n: number) => n.toLocaleString("pt-BR");

exigeCredenciais();

/** A campanha com mais grupos resolvidos, lida pela mesma rota que a tela usa. */
async function campanhaComEstados(page: Page): Promise<Alvo | null> {
  const res = await page.request.get("/api/campanhas");
  expect(res.ok(), `GET /api/campanhas respondeu ${res.status()}`).toBeTruthy();
  let melhor: Alvo | null = null;
  for (const campanha of (await res.json()) as Campanha[]) {
    if (!campanha.slug || campanha.groupIds.length === 0) continue;
    const r = await page.request.get(`/api/campanhas/${encodeURIComponent(campanha.slug)}/grupos/estados`);
    expect(r.ok(), `GET .../grupos/estados de ${campanha.slug} respondeu ${r.status()}`).toBeTruthy();
    const estados = (await r.json()) as Estados;
    if (estados.grupos.length > (melhor?.estados.grupos.length ?? 0)) {
      melhor = { slug: campanha.slug, estados, encerraEm: campanha.settings?.entrada?.encerra_em ?? null };
    }
  }
  return melhor;
}

async function abrirAbaGrupos(page: Page, slug: string) {
  await page.goto(`/painel/campanhas/${slug}`);
  await page.getByRole("button", { name: "Grupos", exact: true }).click();
  // "Grupos da campanha" também nomeia uma seção da Visão geral; a faixa só existe nesta aba.
  await expect(page.getByRole("region", { name: "Resumo dos grupos" })).toBeVisible();
}

test("a faixa e o chip de cada grupo mostram o que /grupos/estados respondeu", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const alvo = await campanhaComEstados(page);
  test.skip(!alvo, "Nenhuma campanha com grupos neste ambiente.");
  if (!alvo) return;
  const { slug, estados } = alvo;

  // O selo de envio por grupo continua vindo de /api/groups, como no cartão antigo.
  const resGrupos = await page.request.get("/api/groups");
  expect(resGrupos.ok(), `GET /api/groups respondeu ${resGrupos.status()}`).toBeTruthy();
  const envio = new Map(((await resGrupos.json()) as GrupoDaApi[]).map((g) => [g.whatsappGroupId, g.sendState]));

  await abrirAbaGrupos(page, slug);

  const resumo = page.getByRole("region", { name: "Resumo dos grupos" });
  await expect(resumo.getByTestId("resumo-lotados")).toHaveText(numero(estados.contagem.lotado));
  await expect(resumo.getByTestId("resumo-enchendo")).toHaveText(numero(estados.contagem.enchendo));
  await expect(resumo.getByTestId("resumo-fila")).toHaveText(numero(estados.contagem.fila));
  await expect(resumo.getByTestId("resumo-vazios")).toHaveText(numero(estados.contagem.vazio));
  await expect(resumo.getByTestId("resumo-membros")).toHaveText(numero(estados.contagem.membros));

  const lista = page.getByRole("region", { name: "Grupos da campanha" });
  await expect(lista.getByRole("listitem")).toHaveCount(estados.grupos.length);
  for (const g of estados.grupos) {
    const linha = lista.locator(`li[data-group-id="${g.groupId}"]`);
    await expect(linha.getByTestId("chip-estado")).toHaveText(ROTULO[g.estado]);
    // Nulo ou ausente é "sem informação", nunca "Aberto" (o motivo de o SeloEnvio existir).
    await expect(linha.getByTestId("selo-envio")).toHaveText(selo(envio.get(g.whatsappGroupId)));
  }
  // No máximo um "Enchendo agora" (spec §3), e o botão da linha só nele.
  await expect(lista.getByRole("button", { name: "Marcar como lotado" })).toHaveCount(estados.contagem.enchendo);

  // Uma fonte só do estado: a aba Link e cliques diz o mesmo grupo que enche na aba Grupos.
  // (Campanha com data de encerramento pode estar parada por ela; aí não há o que comparar.)
  const enchendo = estados.grupos.find((g) => g.estado === "enchendo");
  if (enchendo && !alvo.encerraEm) {
    await page.getByRole("button", { name: "Link e cliques", exact: true }).click();
    await expect(page.getByTestId("destino-do-link")).toContainText(enchendo.nome);
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

// ---------------------------------------------------------------- API simulada

const DIA_MS = 86_400_000;
const atras = (dias: number) => new Date(Date.now() - dias * DIA_MS).toISOString();
const TODAS = { menos_enchendo: true, lotados: true, com_gente: true };

function grupo(p: Pick<EstadoGrupo, "posicao" | "estado" | "membros"> & Partial<EstadoGrupo>): EstadoGrupo {
  return {
    groupId: `00000000-0000-4000-8000-0000000e2e0${p.posicao}`,
    whatsappGroupId: `e2e-estado-${p.posicao}@g.us`,
    nome: `E2E estado ${p.posicao}`,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: `https://chat.whatsapp.com/E2EESTADO${p.posicao}`,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    podeReabrir: false,
    naRegra: { menos_enchendo: false, lotados: false, com_gente: false },
    ...p,
  };
}

const CHEIO = grupo({ posicao: 1, estado: "lotado", membros: 1003, lotadoEm: atras(4), lotadoPor: "auto", naRegra: TODAS });
const COM_VAGA = grupo({
  posicao: 2,
  estado: "lotado",
  membros: 812,
  lotadoEm: atras(2),
  lotadoPor: "manual",
  podeReabrir: true,
  naRegra: TODAS,
});
const ENCHENDO = grupo({
  posicao: 3,
  estado: "enchendo",
  membros: 958,
  reabertoEm: atras(1),
  naRegra: { menos_enchendo: false, lotados: false, com_gente: true },
});
const FILA = grupo({
  posicao: 4,
  estado: "fila",
  membros: 412,
  naRegra: { menos_enchendo: true, lotados: false, com_gente: true },
});
const VAZIO = grupo({ posicao: 5, estado: "vazio", membros: 1 });
const SEM_CONVITE = grupo({
  posicao: 6,
  estado: "fila",
  membros: 20,
  inviteUrl: null,
  naRegra: { menos_enchendo: true, lotados: false, com_gente: true },
});
const RESPOSTA = {
  grupos: [CHEIO, COM_VAGA, ENCHENDO, FILA, VAZIO, SEM_CONVITE],
  contagem: { lotado: 2, enchendo: 1, fila: 2, vazio: 1, membros: 3206 },
  regras: { menos_enchendo: 4, lotados: 2, com_gente: 5 },
};

/**
 * Os grupos simulados não existem em /api/groups: a lista real volta inteira e ganha o
 * `sendState` de dois deles, para o selo ter Aberto, Fechado e "sem informação" na mesma tela.
 */
const ENVIO_SIMULADO = [
  { whatsappGroupId: CHEIO.whatsappGroupId, sendState: "closed" },
  { whatsappGroupId: COM_VAGA.whatsappGroupId, sendState: "open" },
].map((g) => ({
  ...g,
  id: g.whatsappGroupId,
  name: g.whatsappGroupId,
  members: 0,
  capacity: 1024,
  selected: false,
  engagement: "medio",
  isAdmin: true,
}));

test("Reabrir fica travado com o motivo, o menu é acessível e as ações mandam o contrato das rotas", async ({
  page,
}, testInfo) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  // A aba só monta a lista com grupo resolvido em /api/groups: precisa de uma campanha real.
  const alvo = await campanhaComEstados(page);
  test.skip(!alvo, "Nenhuma campanha com grupos neste ambiente.");
  if (!alvo) return;
  const base = `**/api/campanhas/${encodeURIComponent(alvo.slug)}/grupos`;

  let leituras = 0;
  const acoes: unknown[] = [];
  const patches: unknown[] = [];
  await page.route(`${base}/estados`, (rota) => {
    leituras += 1;
    return rota.fulfill({ json: RESPOSTA });
  });
  await page.route(`${base}/lotado`, (rota) => {
    acoes.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/groups", async (rota) => {
    const metodo = rota.request().method();
    if (metodo === "PATCH") {
      patches.push(rota.request().postDataJSON());
      return rota.fulfill({ json: {} });
    }
    if (metodo !== "GET") return rota.continue();
    const real = await rota.fetch();
    const lista = (await real.json()) as unknown[];
    return rota.fulfill({ response: real, json: [...lista, ...ENVIO_SIMULADO] });
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await abrirAbaGrupos(page, alvo.slug);
  const lista = page.getByRole("region", { name: "Grupos da campanha" });
  const linha = (g: EstadoGrupo) => lista.locator(`li[data-group-id="${g.groupId}"]`);
  const gatilho = (g: EstadoGrupo) => linha(g).getByRole("button", { name: `Ações do grupo ${g.nome}` });
  const reabrir = (g: EstadoGrupo) => linha(g).getByRole("button", { name: "Reabrir para receber gente" });

  // Frase do link e detalhes que só existem com um reaberto enchendo.
  await expect(page.getByTestId("frase-do-link")).toHaveText(
    "O link está mandando gente para E2E estado 3 — reaberto ontem, tem prioridade. Quando ele lotar, volta para o 4.",
  );
  await expect(linha(CHEIO)).toContainText("Lotou há 4 dias · automático");
  await expect(linha(COM_VAGA)).toContainText("Lotou há 2 dias · marcado à mão");
  await expect(linha(ENCHENDO)).toContainText("Reaberto ontem · prioridade no link");
  await expect(linha(FILA)).toContainText("Pausado: volta a encher quando o 3 lotar");
  await expect(linha(VAZIO)).toContainText("Só o nosso número");
  await expect(linha(SEM_CONVITE)).toContainText("Sem convite: o link pula este grupo");
  await expect(linha(ENCHENDO).getByTestId("chip-estado")).toHaveText("Enchendo agora");

  // O selo de envio do cartão antigo continua por grupo, com os três estados.
  await expect(linha(CHEIO).getByTestId("selo-envio")).toHaveText("Fechado");
  await expect(linha(COM_VAGA).getByTestId("selo-envio")).toHaveText("Aberto");
  await expect(linha(ENCHENDO).getByTestId("selo-envio")).toHaveText("Envio: sem informação");

  // Lotado ainda cheio: Reabrir travado, com o motivo do mockup.
  await gatilho(CHEIO).click();
  await expect(gatilho(CHEIO)).toHaveAttribute("aria-expanded", "true");
  await expect(reabrir(CHEIO)).toBeDisabled();
  await expect(
    linha(CHEIO).getByText(
      "Ainda está com 1.003 de 1.024 (98%). O link só manda gente abaixo de 95%: aumente a capacidade ou espere sair gente.",
    ),
  ).toBeVisible();

  // Copiar convite: o CopyLink do cartão antigo, no ⋯. Copia o convite e o menu fica aberto (o ✓ aparece ali).
  const convite = linha(CHEIO).getByTestId("copiar-convite");
  await expect(convite).toContainText("Copiar convite");
  await expect(convite).toContainText(CHEIO.inviteUrl!);
  await convite.getByRole("button", { name: "Copiar link" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(CHEIO.inviteUrl);
  await expect(gatilho(CHEIO)).toHaveAttribute("aria-expanded", "true");

  // Review Focus 5: Esc fecha e devolve o foco ao ⋯.
  await page.keyboard.press("Escape");
  await expect(reabrir(CHEIO)).toHaveCount(0);
  await expect(gatilho(CHEIO)).toBeFocused();

  // Review Focus 5: um menu por vez; clique fora fecha.
  await gatilho(CHEIO).click();
  await gatilho(COM_VAGA).click();
  await expect(lista.locator('button[aria-expanded="true"]')).toHaveCount(1);
  await expect(gatilho(COM_VAGA)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("region", { name: "Resumo dos grupos" }).click();
  await expect(lista.locator('button[aria-expanded="true"]')).toHaveCount(0);

  // Lotado com vaga: Reabrir liberado, manda o contrato da rota e relê os estados.
  await gatilho(COM_VAGA).click();
  await expect(linha(COM_VAGA)).toContainText("Lota de novo sozinho em 973.");
  const lidasAntes = leituras;
  await reabrir(COM_VAGA).click();
  await expect.poll(() => acoes).toEqual([{ groupId: COM_VAGA.groupId, acao: "reabrir" }]);
  await expect.poll(() => leituras).toBeGreaterThan(lidasAntes);

  // O enchendo tem o botão na própria linha.
  await linha(ENCHENDO).getByRole("button", { name: "Marcar como lotado" }).click();
  await expect.poll(() => acoes.length).toBe(2);
  expect(acoes[1]).toEqual({ groupId: ENCHENDO.groupId, acao: "marcar" });

  // Review Focus 2: Editar capacidade usa o PATCH que já existe, pelo JID e sem apagar o convite.
  await gatilho(FILA).click();
  await linha(FILA).getByRole("button", { name: "Editar capacidade" }).click();
  await linha(FILA).getByLabel("Capacidade").fill("500");
  await linha(FILA).getByRole("button", { name: "Salvar" }).click();
  await expect
    .poll(() => patches)
    .toEqual([{ id: FILA.whatsappGroupId, inviteUrl: FILA.inviteUrl, capacity: 500 }]);

  // Sem convite: o item diz o mesmo que o cartão dizia, e não há o que copiar.
  await gatilho(SEM_CONVITE).click();
  const semConvite = linha(SEM_CONVITE).getByTestId("copiar-convite");
  await expect(semConvite).toContainText("Configure o link de convite");
  await expect(semConvite.getByRole("button", { name: "Copiar link" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Prova visual: 1280 e 390, sem nada da aba passando da borda no celular.
  await page.setViewportSize({ width: 1280, height: 900 });
  await testInfo.attach("estados-grupos-1280", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const nome of ["Resumo dos grupos", "Grupos da campanha"]) {
    const caixa = await page.getByRole("region", { name: nome }).boundingBox();
    expect(caixa, `região ${nome} sem caixa`).not.toBeNull();
    expect(caixa!.x + caixa!.width, `${nome} passa da borda em 390`).toBeLessThanOrEqual(391);
  }
  await testInfo.attach("estados-grupos-390", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  // A aba Link e cliques lê a MESMA rota (aqui, a simulada): o destino é o reaberto que enche,
  // não o primeiro com vaga da sequência antiga (withSequentialEstado escolheria outro).
  if (!alvo.encerraEm) {
    await page.getByRole("button", { name: "Link e cliques", exact: true }).click();
    await expect(page.getByTestId("destino-do-link")).toContainText(ENCHENDO.nome);
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
```

- [ ] **Step 2: tipos do E2E.** Em `<wt>\apps\web`: `npx tsc --noEmit -p tsconfig.e2e.json` → sem erro.

- [ ] **Step 3: sentinelas e nomes acessíveis (`finding-frase-copiada-colide-com-sentinela-e2e`, `finding-nome-acessivel-e-contrato-com-o-teste`).**

```powershell
Select-String -LiteralPath "<wt>\apps\web\e2e\conteudo-esperado.ts" -Pattern "vazio:"
```

  Conferir que nenhuma sentinela casa com textos novos ("O link está parado…", "nenhum agora", "Só o nosso número"). As de `/painel` e `/painel/grupos` são `/Nenhum grupo/i`; a tela nova não diz "Nenhum grupo".

```powershell
git -C <wt> grep -n "\"Grupos\", exact: true\|Configurações dos grupos" -- apps/web/e2e
```

  Os specs vizinhos (`painel-campanha-acoes-em-massa`, `painel-funil`) clicam a aba "Grupos" e usam a região "Configurações dos grupos": os dois nomes não mudaram.

- [ ] **Step 4 (só se esta máquina tiver credencial de E2E):** conferir só os nomes, nunca o valor:

```powershell
Select-String -LiteralPath "<wt>\apps\web\.env.local" -Pattern "^E2E_EMAIL=|^E2E_PASSWORD=" | ForEach-Object { $_.Line.Split("=")[0] }
```

  Se vierem os dois: nenhum outro E2E batendo no dev agora (`finding-e2e-local-e-ci-corrida-no-mesmo-banco`):

```powershell
gh run list --repo codingB0y/Girumo --workflow Verify --status in_progress --json databaseId,headBranch
```

  Lista vazia → subir o dev do worktree numa porta própria, em background (`run_in_background: true`; a 3000 pode ser de outra sessão — `finding-preview-serve-checkout-principal`):

```powershell
Set-Location <wt>\apps\web; npx next dev -p 3005
```

  Quando `Invoke-WebRequest http://localhost:3005/login -UseBasicParsing | Select-Object StatusCode` der 200:

```powershell
Set-Location <wt>\apps\web; $env:E2E_BASE_URL = "http://localhost:3005"; npx playwright test e2e/painel-campanha-estados-grupos.spec.ts e2e/painel-campanha-acoes-em-massa.spec.ts --project=chromium
```

  Esperado: verde. Derrubar o dev pelo PID (`finding-taskstop-nao-mata-next-dev`):

```powershell
Get-NetTCPConnection -LocalPort 3005 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

  Sem credencial → o E2E roda no job `e2e` do PR (Task 11, Step 8), e a prova visual fica no artefato `e2e-report`.

- [ ] **Step 5: commit.**

```powershell
git -C <wt> add -- apps/web/e2e/painel-campanha-estados-grupos.spec.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "test(e2e): Grupos tab states, reopen lock and actions menu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: verificação final, revisão, PR e comandos para o Igor

**Files:** nenhum novo.
**Depends-on:** Tasks 1–10

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez:
  - `npx tsc --noEmit -p tsconfig.json`
  - `npx tsc --noEmit -p tsconfig.e2e.json`
  - `npm run lint`
  - `npm test`
  - `npx tsx scripts/check-painel-vitrine.ts`

- [ ] **Step 2: o gate real** (sem `2>&1` nem `*>` — no PS 5.1 aviso de stderr vira falha falsa):

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`.

- [ ] **Step 3: revisão final do diff inteiro** (`pattern-revisao-final-pega-o-que-revisao-por-task-nao-ve`): superpowers:requesting-code-review sobre `git -C <wt> diff origin/main...HEAD`, com foco nos cinco itens de **Review Focus** e em: (a) nenhum `.eq`/filtro de tenant faltando (as duas rotas leem a campanha pela sessão); (b) nada da aba antiga sumiu sem estar na tabela "Decisão sobre o `GroupCard`"; (c) Acid só no chip Lotado. CRITICAL/HIGH → corrigir, commitar e repetir os Steps 1–2.

- [ ] **Step 4:** `git -C <wt> fetch origin main` e `git -C <wt> log HEAD..origin/main --oneline`. Commits novos → `git -C <wt> merge origin/main` (não rebase) e repetir os Steps 1–2.

- [ ] **Step 5:** `git -C <wt> status --short` limpo e `git -C <wt> log origin/main..HEAD --oneline` com os 10 commits deste plano (Tasks 1–10).

#### Comandos para o Igor

Push e PR (se o classificador deixar, o executor roda; senão, o Igor — `finding-classificador-bloqueia-merge-e-ddl`). O corpo vai por arquivo, sem BOM:

```powershell
git -C <wt> push -u origin feat/postar-grupo-estados
```

```powershell
$corpo = @'
## O que entra

- `GET /api/campanhas/[slug]/grupos/estados`: estado de cada grupo pronto do SQL (`campaign_group_states`), contagem da faixa e quantos grupos cada atalho de destino pega agora.
- `POST /api/campanhas/[slug]/grupos/lotado` `{ groupId, acao: "marcar" | "reabrir" }`: marcar e reabrir à mão (`campaign:edit`), só grupo desta campanha; `ainda_cheio` vira 409 com a mensagem do mockup.
- Store: `marcarGrupoLotado` e `reabrirGrupo` (RPCs do PR 1), testados contra PostgREST falso; teste de integração contra o dev (ordem do pool, estados, regras, prioridade do reaberto, marca ao cruzar 95% subindo, outro tenant = `nao_encontrado`).
- Aba Grupos: faixa (Lotados / Enchendo agora / Na fila / Vazios / Membros), "O link está mandando gente para X", lista na ordem do pool com chip de estado, detalhe ("Lotou há 3 dias · automático", "Pausado: volta a encher quando o 12 lotar"), "Marcar como lotado" na linha que enche e menu ⋯ (Reabrir travado com o motivo, Marcar como lotado, Copiar convite, Editar capacidade).
- A lista substitui o cartão por grupo sem perder recurso: o selo de envio (Aberto / Fechado / sem informação) continua em cada linha — o mesmo `SeloEnvio`, só mudou de arquivo — e o copiar convite virou o item "Copiar convite" do ⋯, com o mesmo `CopyLink` e o mesmo "Configure o link de convite" quando falta convite.

- Aba Link e cliques: "o link manda para" passa a ler o grupo que enche de `/grupos/estados` (a mesma fonte da aba Grupos) e passa pelo mesmo `resolveClickTarget` do `/r/`. Sai `withSequentialEstado`, a aproximação temporária do PR 2: o estado volta a ter uma fonte só.

## Fora

Postar com destino (PR 5), Padronizar (PR 8), Aviso ao lotar (PR 9), conflitos de campanha (PR 6), /painel/grupos global, modo JSON. A Visão geral continua contando "lotados" pela porcentagem. `nextAvailableGroup`/`isGroupAvailable` ficaram sem uso em produção (só os testes da regra antiga): limpeza seguinte.

## Teste

- [x] unit: resumo-estados, acao-lotado, destino-do-link, store contra PostgREST falso (com mutantes); resolve-click-target sem o teste de withSequentialEstado
- [x] tsc x2, lint, npm test, painel:check, verify-local.ps1
- [ ] integração da store no job e2e (4 testes rodando, nenhum pulado)
- [ ] e2e painel-campanha-estados-grupos.spec.ts (contraste com a API e API simulada, inclusive a aba Link e cliques com o mesmo grupo que enche) e painel-campanha-acoes-em-massa.spec.ts
- [ ] CI verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
[IO.File]::WriteAllText("$env:TEMP\pr4-estados-corpo.md", $corpo)
```

```powershell
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-estados --title "feat(grupos): estados na aba Grupos e marcar/reabrir lotado (postar por grupo, PR 4)" --body-file "$env:TEMP\pr4-estados-corpo.md"
```

- [ ] **Step 6:** CI (trocar `<N>` pelo número do PR):

```powershell
gh pr checks <N> --repo codingB0y/Girumo
```

- [ ] **Step 7:** E2E vermelho com 401/500 em specs que não são deste PR = corrida no banco de dev com outro run: depois que o outro terminar, `gh run rerun <run-id> --failed --repo codingB0y/Girumo`. Re-run reusa o SHA (`finding-rerun-reusa-sha-original`): se o PR ganhou commit, `gh pr update-branch <N> --repo codingB0y/Girumo`.

- [ ] **Step 8: a integração rodou de verdade.** Com o job `e2e` verde:

```powershell
gh run view <run-id> --repo codingB0y/Girumo --log | Select-String -Pattern "campanha nasce com estados|reabrir: travado|a marca automática entra|marcar à mão"
```

  Esperado: as quatro linhas com ✔ (não "pulado"). E no mesmo log, o spec `painel-campanha-estados-grupos.spec.ts` com 2 passed (skip aqui = nenhuma campanha com grupo no QA; aí avisar o Igor, o teste não provou nada).

- [ ] **Step 9: merge à mão no verde** (`finding-main-sem-protecao-auto-merge-imediato` — nunca auto-merge):

```powershell
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

---

### Task 12: verificação em produção (spec §11, itens 1 e 3), quadro e grafo

**Files:** nenhum.
**Depends-on:** Task 11 (mergeado e com deploy), PR 2 em produção (o link lê o estado)

- [ ] **Step 1: o deploy é este.** Logado em `https://www.girumo.com.br/admin/configuracoes`, bloco "Deploy" (`verificar-commit-em-producao`): o commit tem de ser o merge do PR 4 ou posterior.

- [ ] **Step 2 (item 1): a aba mostra os lotados do backfill e o "Enchendo agora" é o destino real do link.** Com o Igor logado no painel do navegador (Browser pane; se falhar, Playwright do `node_modules` da raiz — `tecnica-verificar-artifact-com-playwright`), abrir a campanha **Moda Kids do Sul** → aba **Grupos**. Conferir: lotados com "Lotou … · automático" (os do backfill aparecem como "Lotou hoje" no dia do PR 1, spec §5.7), um único "Enchendo agora", faixa somando o total de grupos. Ler o convite do enchendo pela própria API (no console da aba, logado):

```js
await fetch(location.pathname.replace("/painel/campanhas/", "/api/campanhas/") + "/grupos/estados")
  .then((r) => r.json())
  .then((d) => d.grupos.filter((g) => g.estado === "enchendo").map((g) => [g.posicao, g.nome, g.inviteUrl]));
```

  Copiar o link mestre do cabeçalho da campanha e perguntar ao link para onde ele manda, sem cookie e com user-agent de robô (redireciona igual, mas não conta clique nem grava "grupo lembrado"):

```powershell
curl.exe -s -i "<link mestre>" | Select-String -Pattern "https://chat\.whatsapp\.com/[A-Za-z0-9]+" -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Unique
```

  Esperado: exatamente o `inviteUrl` do enchendo. (Com pixel/integração ligados a resposta é a página de entrada em HTML, e o convite está no corpo; o padrão pega os dois casos.) Conferir também que nada do cartão antigo sumiu: cada linha com o selo de envio (Aberto / Fechado / "Envio: sem informação", batendo com a contagem de "Configurações dos grupos") e o ⋯ de um grupo com "Copiar convite" mostrando o convite e o ✓ ao copiar. Na aba **Link e cliques**, "o link manda para" tem de dizer o mesmo grupo que a aba Grupos marca como "Enchendo agora". Capturar a tela da aba em 1440 e 390.

- [ ] **Step 3 (item 3): reabrir manda o próximo clique para ele.** **Muda para onde clientes reais vão: só com o OK do Igor na hora, e ele escolhe o grupo.** Num lotado com "Reabrir para receber gente" liberado (abaixo de 95%), clicar Reabrir. Conferir: o chip vira "Enchendo agora", o detalhe "Reaberto hoje · prioridade no link", a frase "— reaberto hoje, tem prioridade". Repetir o `curl.exe` do Step 2: o convite tem de ser o do grupo reaberto. Nenhum lotado com vaga → o item 3 fica pendente, anotado no `blocker` (Step 4), sem forçar estado.

- [ ] **Step 4: quadro (prod, Igor).** O feature só fecha com os PRs 5–9; o card segue em construção com a prova no motivo:

```sql
select public.move_card('postar-por-grupo', 'em_construcao', 'PR 4 mergeado e conferido em prod: aba Grupos com estados; Enchendo agora = destino real do /r/; Reabrir manda o próximo clique', 'PR #<N>');
```

  Se o item 3 ficou pendente:

```sql
update public.board_features set blocker = 'PR 4: falta conferir em prod que Reabrir manda o próximo clique do /r/ (nenhum lotado com vaga na Moda Kids do Sul em <data>)' where key = 'postar-por-grupo';
```

- [ ] **Step 5: grafo** (PowerShell, na raiz do checkout principal — `feedback-encerrar-sessao-com-comandos-rag`):

```powershell
rag insert "decisão: a aba Grupos da campanha lê estados prontos de GET /api/campanhas/[slug]/grupos/estados (campaign_group_states) e só conta; marcar/reabrir lotado à mão por POST .../grupos/lotado com campaign:edit e grupo desta campanha; a lista substituiu o GroupCard sem perder recurso (SeloEnvio por linha, Copiar convite no menu ⋯); a aba Link e cliques lê o enchendo do mesmo endpoint e passa pelo resolveClickTarget do /r/ (withSequentialEstado do PR 2 apagado); o TS só repete o 'disponível' do SQL para escrever 'volta para o N'/'Pausado'" --source decisao-2026-10-10-postar-grupo-estados
```

- [ ] **Step 6:** ao encerrar: "PRs que deixei abertos: …" (o esperado é "nenhum").

---

## Self-review (contra spec e contratos)

| Item | Onde |
|---|---|
| D1 marca gravada, nunca sai sozinha | Task 2 ("não sai descendo"); a tela só mostra o que veio |
| D2 Reabrir bloqueado ≥ 95% com o motivo | Task 2 (`ainda_cheio`), Task 4 (mensagem), Task 7 (travado + nota), Task 10 (E2E) |
| D3 reaberto com prioridade, volta à ordem ao lotar | Task 2 ("passa na frente", "perde a prioridade"); frase do link (Task 3) |
| D12 95%, capacidade 1–1024 | `lotaDeNovoEm`/`mensagemAindaCheio` (Task 4); Editar capacidade reusa a validação do `PATCH /api/groups` |
| §3 estados e regras | só lidos (`estado`, `naRegra`); `resumirEstados` conta `regras` de `naRegra` (Task 3) |
| §4 um lugar só | nenhuma regra de estado em TS; a exceção (`proximoDoLink`, só texto) está marcada com `ponytail:` |
| §6.4 GET, POST, faixa, frase, chip, detalhe, botão, menu, componente novo | Tasks 5, 6, 8, 7 |
| §6.4 `buildCampaignGroupsOverview` não decide cheio/ativo nesta aba | `GroupCard` sai (Task 8); overview segue para cabeçalho e Configurações dos grupos |
| §7 reabrir ≥ 95% → 409 e nada muda | Task 2 + Task 4 |
| §8 integração com o tenant de E2E | Task 2 (o `enqueue_broadcast` com regra fica no PR 5, que é quem grava `target_rule`) |
| §4 um lugar só — a aba Link e cliques | Task 9: lê `/grupos/estados` e passa pelo `resolveClickTarget` do `/r/`; `withSequentialEstado` (PR 2) apagado; E2E da Task 10 compara as duas abas |
| §11 itens 1 e 3 | Task 12 |
| Contratos §3 assinaturas da store | Task 1 (literais idênticos) |
| Contratos §4 GET e POST | Tasks 5 e 6 (`EstadosDaCampanha` = shape do contrato) |

Divergências encontradas entre spec, contratos e código (não renomeadas; seguido o que está indicado):

1. **Resposta do GET:** o spec §6.4 diz `{ grupos, enchendo, contagem }`; os contratos §4 dizem `{ grupos, contagem, regras }`. **Seguido o contrato** (sem campo `enchendo`; a tela acha o enchendo em `grupos`).
2. **Menu do mockup:** `role="menu"`/`menuitem` com um `<p>` de motivo dentro — ARIA inválido (`menu` só aceita itens). Feito como disclosure (Task 7).
3. **`EstadoDoGrupo` com dois sentidos:** `@/lib/painel/grupos` já exporta `EstadoDoGrupo = "cheio" | "quase" | "ativo" | "sem_convite"`; o contrato cria `EstadoDoGrupo` em `@/lib/groups/estado` com outros valores. Este PR importa só o do contrato; quem importar dos dois no mesmo arquivo precisa de alias.
4. **Vendedora:** a lista fechada de rotas do módulo `postar` (spec da vendedora, §"Fechado por padrão") não inclui `GET /api/campanhas/*/grupos/estados`. Não afeta o PR 4 (aba do dono), mas o seletor de destino do PR 5 (`folha-postar.tsx`, que a vendedora usa) vai dar 403 para `seller` se a rota não entrar no mapa.
5. **Detalhe "saíram 25 desde então"** (mockup): não existe coluna com a contagem no momento em que lotou. Fora.
6. **O mockup não tem selo de envio nem copiar convite por grupo**, e o `GroupCard` tinha os dois. Seguido o pedido de não derrubar recurso: o `SeloEnvio` fica na coluna Detalhe e o bloco `CopyLink` vira o item "Copiar convite" do ⋯ (tabela "Decisão sobre o `GroupCard`"). O `sendState` não está no `EstadoGrupo` dos contratos; vem de `/api/groups` pela página (`envio`), sem mudar contrato.
7. **`GroupSettings` reusado** tem rótulos `text-12` (abaixo do piso de 13 px do G2). Mantido como está: é componente compartilhado com `/painel/grupos`.
8. **Chave do card do quadro** não está no spec nem nos contratos; o plano usa `postar-por-grupo` e manda conferir antes (Task 0, Step 7).
9. **Visão geral** continua contando "lotados" pela porcentagem (`buildCampaignGroupsOverview`), enquanto a aba Grupos usa a marca: as duas abas podem discordar (ex.: grupo marcado à mão com 812). O spec limita a troca "nesta aba"; fica para quem decidir a Visão geral.
10. **Rotas por slug só:** `getCampaignGroupBySlug` não aceita id; a página manda `slug ?? id`, então campanha sem slug dá 404 nas rotas novas, como já dá nas irmãs (`grupos/lotes`, `grupos/estado`).
11. **Consumidor que o spec não cita:** `link-e-cliques.tsx` chama `resolveClickTarget` no navegador. O PR 2 cobriu com `withSequentialEstado` (aproximação marcada `ponytail:`); a Task 9 troca pela leitura de `/grupos/estados` e apaga a aproximação. Com isso `nextAvailableGroup` e `isGroupAvailable` ficam só nos testes da regra antiga (o comentário é atualizado; apagar os dois e os testes deles é a limpeza seguinte, fora deste PR).
