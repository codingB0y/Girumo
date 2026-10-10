# Postar por grupo — PR 6: um grupo, uma campanha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um grupo de WhatsApp passa a pertencer a **uma campanha só** (D4): o banco recusa grupo novo que já esteja em outra campanha da loja, o seletor de grupos mostra esses grupos travados com o nome da outra campanha, os conflitos que já existem aparecem numa tela para o lojista escolher onde cada grupo fica (nada sai sozinho), e `reordenar_campanha` fica pronta para o Padronizar (PR 8).

**Architecture:** Uma migração pequena: trigger `before insert or update of group_ids` em `campaign_groups` (função `app.campaign_groups_grupo_exclusivo`, `security invoker`) que confere **só os JIDs novos** (`new.group_ids` menos `old.group_ids`) contra as outras campanhas do mesmo tenant e levanta `unique_violation` com `grupo_em_outra_campanha:<jid>:<id>`; duas RPCs `security definer` (execute só `service_role`): `grupos_em_mais_de_uma_campanha` e `reordenar_campanha`. No app, um módulo puro (`lib/campaigns/conflito-grupo.ts`, importável no cliente) concentra parser da mensagem, travas do seletor, filtro do espelho de comunidade nativa, validação/plano da escolha e o texto da faixa; um adaptador server-only transforma a recusa em 409 nas três rotas que escrevem `group_ids` a pedido do lojista. O espelho de comunidade nativa (sync) filtra antes de escrever, para não ser recusado inteiro. Tela de conflitos e faixa amarela leem `GET /api/campanhas/conflitos`.

**Tech Stack:** Postgres 15 (Supabase), plpgsql, Supabase CLI (`db query --linked`), Next.js 15 (route handlers + client pages), TypeScript strict, `node --test` via tsx com PostgREST falso (`node:http`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` (§2 D4, §5.8, §6.6, §7 linha "Grupo em duas campanhas", §8, §9 linha 6) · **contratos (vinculantes):** `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md`, seção 2 (banco do PR 6) e seção 4 (`GET/POST /api/campanhas/conflitos` e o 409 de exclusividade). Se este plano e os contratos divergirem, os contratos vencem.

**Pré-requisito:** PR 1 (`20261010120000_postar_por_grupo.sql`) mergeado e aplicado nos dois bancos. O código deste PR não usa nada do PR 1, mas a migração entra **depois** dele na `apply-order` e a baseline parte da baseline do PR 1.

## Global Constraints

- Código, identificadores e commits em inglês; texto de tela e de erro em pt-BR. Commits com prefixo semântico, terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- O cwd do Bash reseta entre chamadas (memória `finding-cwd-do-bash-reseta-entre-chamadas`): **todo** comando começa com `WT=$(git rev-parse --show-toplevel)` e usa `git -C "$WT"` / `cd "$WT/apps/web"`. Nos blocos para o Igor (PowerShell, que ele roda do checkout principal), `<WT>` é o caminho Windows impresso na Task 0, Step 1 — **nunca** `HEAD` nem caminho relativo (memória `finding-comando-entregue-roda-no-checkout-principal`).
- Em `apps/web`:
  - unit: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`
  - tipos — os **dois** (lint e tsx não checam tipo): `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`
  - lint: `npm run lint` · suíte: `npm test` (só `src/**/*.test.ts`; teste novo é `.test.ts`)
- Antes do push: `infra/scripts/verify-local.ps1` (secrets + testes + build) — é o gate real; o `verify` do CI é pulado na `main`.
- Nunca `git add -A`. `git diff --cached --stat` numa chamada **separada** antes de cada commit (memória `finding-indice-sujo-quase-reverteu-feature`).
- Store Supabase: **sempre** `.eq("tenant_id", tenantId)`; RPC leva o tenant no corpo (`p_tenant` / `p_tenant_id`). O service-role ignora RLS.
- Nomes exatamente como nos contratos: trigger `campaign_groups_grupo_exclusivo`, função `app.campaign_groups_grupo_exclusivo()`, mensagem `grupo_em_outra_campanha:<jid>:<id>`, `public.grupos_em_mais_de_uma_campanha(p_tenant uuid)` → `table(whatsapp_group_id text, name text, campanhas jsonb)`, `public.reordenar_campanha(p_tenant uuid, p_campanha uuid, p_esperado text[], p_nova text[]) returns boolean`, `listarConflitos`, `reordenarCampanha`, 409 `{ error, grupo, campanha: { id, name } }`, `GET /api/campanhas/conflitos` → `{ conflitos }`, `POST /api/campanhas/conflitos` `{ jid, ficaEm }` → `{ ok: true }`.
- **DDL é do Igor.** O agente nunca aplica DDL (nem em dev, nem por MCP / `execute_sql` / `db query` da migração). Leitura em dev e o script de conferência (DML dentro de `begin … rollback`) o agente pode tentar; se o classificador negar, não insista por outra ferramenta — vai para o Igor. Leitura em prod é sempre do Igor (memória `finding-classificador-bloqueia-merge-e-ddl`).
- **Do DDL ao merge, sem pausa** (Task 10): enquanto a baseline nova não estiver na `main`, o `drift` de todo PR aberto fica vermelho; e este PR fica vermelho até o DDL chegar no dev.
- Migração: `create or replace` + `drop trigger if exists`; toda função `public` nova `security definer` com `set search_path` e, logo depois, `revoke all … from public, anon, authenticated` + `grant execute … to service_role` (memórias `finding-default-privilege-concede-authenticated`, `finding-create-or-replace-nao-preserva-acl-em-dev`). O gate de drift não vê trigger, schema `app`, ACL nem corpo: quem prova nos dois bancos é `infra/tests/grupo-uma-campanha-check.sql` (memória `finding-gate-drift-cego-constraint-e-corpo`).
- Modo JSON (`HUBFLOW_USE_SUPABASE=0`) fora de escopo (spec §10): as rotas novas só funcionam no ramo Supabase.
- Card no quadro (prod) ao começar e ao terminar; DML em prod passa pelo Igor.
- Fechar o loop na mesma sessão: revisar → DDL → CI verde → mergear → apagar branch. Ao encerrar: "PRs que deixei abertos: …".
- **19 arquivos** (14 de código/SQL/config, 5 de teste: dois `.test.ts`, o check SQL, o spec e2e e o registro do smoke). Passa da régua de ~10 do `CLAUDE.md`, mas o escopo é o fixado no §9 do spec para o PR 6 (migração + API + seletor + conflitos): separar deixaria o trigger no ar sem o 409 (vira 500 no seletor) ou o seletor sem o trigger.

## Onde o spec/contrato e o código divergem (decidido neste plano)

1. **"Fluxo de comunidade nativa recebe a mesma mensagem" (spec §6.6).** Não existe fluxo de usuário que crie comunidade nativa com grupos: `criarComunidade` (`lib/stores/communities.ts:128`) sempre grava `group_ids: []`, e quem escreve os grupos de uma comunidade nativa é `espelharComunidadesNativas` (`:213`), que roda no `after()` do `POST /api/groups/sync` (`api/groups/sync/route.ts:191`) — não há ninguém para receber mensagem, e uma recusa ali derrubaria o espelho daquela comunidade a cada sync, só com `console.error`. **Decisão:** o espelho grava o que o WhatsApp diz **menos** os grupos que já estão em outra campanha e ainda não estão na gaveta (`gruposDoEspelho`) — quem chegou primeiro fica com o grupo, o que a gaveta já tinha continua (nada sai sozinho, D4). Quem recebe a mensagem é o fluxo de usuário que de fato existe: `POST /api/comunidades/[slug]/grupos` (vincular órfão, `campaign_group_append_group_id`) → mesmo 409.
2. **Auto-grow (`campaign_group_append_group_id` em `group-grow-store.ts:277`).** O grupo acabou de ser criado pelo próprio worker: não pode estar em outra campanha. Fica como está; se um dia for recusado, o erro sobe com a mensagem `grupo_em_outra_campanha:…` no log do ack, que já se explica.
3. **Contrato da RPC usa `name`, o spec §5.8 escreve `nome`.** Vale o contrato: a coluna SQL é `name`; o TS (`listarConflitos`) devolve `nome`, como o contrato §4.
4. **409 `grupo: string` (contrato §4) não diz se é JID ou nome.** É o **JID** (identificador; o seletor tem o nome e monta a frase com ele). O `error` do servidor nomeia só a campanha.
5. **Mockup "Conflito"** mostra membros, estado ("lotado nas duas") e "entrou em dd/mm" por opção. O contrato `GET /api/campanhas/conflitos` não traz membros nem estado, e `campaign_groups` não guarda quando o grupo entrou. A tela mostra membros (de `/api/groups`, que ela já precisa) e "posição N"; estado e data ficam de fora.
6. **A tela de conflitos é da loja inteira** (o contrato não tem filtro por campanha). A faixa amarela é por campanha e leva a `/painel/campanhas/conflitos?de=<slug>`; o `de` só monta o caminho de volta.
7. **`PATCH /api/campanhas` troca o link antes do update** (`route.ts:219-222`). Se o mesmo PATCH trocar o link e for recusado por grupo, o link já trocou (o antigo continua como apelido, `rename-slug.ts`) e repetir o PATCH é no-op no link (`novo === antigo`). Como o seletor trava os grupos, o 409 só vem de corrida; fica como está, documentado no código.
8. **`/painel/campanhas/conflitos` sombreia uma campanha de slug `conflitos`** no painel (rota estática vence `[slug]`), o mesmo risco latente que `nova` já tem. Não reservado aqui.
9. **O trigger não olha `update of tenant_id`.** Nenhum caminho do app muda o tenant de uma campanha; o script de conferência usa isso para simular um conflito antigo sem DDL.

## Review Focus

Os cinco modos de falha mais prováveis que nenhum teste "natural" das tasks pegaria — cada um tem teste próprio na task dona:

1. **Espelho de comunidade nativa recusado inteiro.** Lojista põe grupos numa campanha e depois os vincula a uma comunidade no WhatsApp: o insert/update da gaveta (array inteiro) traz JID novo de outra campanha → o trigger recusa → a comunidade para de espelhar para sempre, só com log. → Task 2 (`gruposDoEspelho`: gaveta nova sem o grupo alheio; gaveta existente mantém conflito antigo) + Task 3, bloco 2 do check (insert com JID alheio é recusado — é por isso que o filtro existe).
2. **JID repetido dentro da MESMA campanha tratado como conflito** (trigger cruzando a linha consigo mesma; função contando ocorrências em vez de campanhas). → Task 3, blocos 5 (update com `check-g7` e `check-g3` repetidos passa) e 7 (`check-g7` repetido só em A2 não aparece; `check-g3` sai uma vez por campanha, com a menor posição).
3. **Escolha que deixa o grupo sem campanha nenhuma** — `ficaEm` não tem mais o JID (outra aba tirou) e o POST tira o grupo de todas as outras. → Task 2 (`planejarEscolha` devolve 409 e não planeja remoção nenhuma; `tirarDe` nunca inclui `ficaEm`).
4. **Vazamento entre lojas.** JID é id global do WhatsApp (duas lojas podem administrar o mesmo grupo): trigger ou RPC sem `tenant_id` travaria a loja B pelo grupo da loja A, ou listaria campanhas de outra loja. → Task 3, blocos 3 (outra loja aceita o mesmo JID), 7 (TB não vê o conflito de TA) e 8 (reordenar com o tenant errado devolve `false`); Task 4 (as RPCs levam `p_tenant` no corpo).
5. **A mensagem do trigger se perde entre o PostgREST e a rota** (store reembrulha o erro, regex estreita demais) → o lojista vê 500 em vez do 409 com o nome da campanha. → Task 4 (409 do PostgREST falso no insert e no append chega inteiro e é lido por `lerConflitoGrupo`) + Task 2 (JID com `:`, mensagem embrulhada, uuid maiúsculo) + Task 8 (e2e real de POST e PATCH com 409 no formato do contrato).

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/campaigns/conflito-grupo.ts` | criar | puro: parser da mensagem e do 409, texto do erro, travas do seletor, filtro do espelho, escolha (validar + planejar), `faltaEscolher`, faixa da aba Grupos |
| `apps/web/src/lib/campaigns/conflito-grupo.test.ts` | criar | 17 testes do módulo acima |
| `apps/web/supabase/migrations/20261010130000_grupo_uma_campanha.sql` | criar | trigger + 2 RPCs + ACL |
| `infra/tests/grupo-uma-campanha-check.sql` | criar | conferência nos dois bancos (`begin`…`rollback`, blocos que falham alto) + assinatura para a baseline |
| `deploy/supabase/apply-order.txt` | modificar | entrada da migração, depois de `20261010120000` |
| `deploy/supabase/schema-baseline.json` | modificar | dois `f\|` novos |
| `apps/web/src/lib/stores/campaign-groups.ts` | modificar | `listarConflitos`, `reordenarCampanha`, `removeGroupId` |
| `apps/web/src/lib/stores/campaign-groups.test.ts` | criar | PostgREST falso: corpo das RPCs e mensagem do trigger intacta |
| `apps/web/src/lib/campaigns/conflito-grupo-409.ts` | criar | server-only: recusa do trigger → `Response` 409 do contrato |
| `apps/web/src/app/api/campanhas/route.ts` | modificar | POST e PATCH mapeiam a recusa para 409 |
| `apps/web/src/app/api/comunidades/[slug]/grupos/route.ts` | modificar | POST (vincular) mapeia a recusa para 409 |
| `apps/web/src/lib/stores/communities.ts` | modificar | espelho de comunidade nativa filtra com `gruposDoEspelho` |
| `apps/web/src/app/api/campanhas/conflitos/route.ts` | criar | `GET` lista, `POST` escolhe onde o grupo fica |
| `apps/web/src/components/painel/campaign-config.tsx` | modificar | seletor trava grupo de outra campanha; 409 vira trava + frase com o nome do grupo |
| `apps/web/src/app/painel/campanhas/conflitos/page.tsx` | criar | tela do mockup "Conflito" |
| `apps/web/src/components/painel/campanhas/aviso-conflitos.tsx` | criar | faixa amarela da aba Grupos |
| `apps/web/src/app/painel/campanhas/[slug]/page.tsx` | modificar | 1 import + 1 linha: a faixa na aba Grupos |
| `apps/web/e2e/painel-campanha-grupo-exclusivo.spec.ts` | criar | seletor travado, 409 real, tela de conflitos e faixa (interceptadas) |
| `apps/web/e2e/conteudo-esperado.ts` | modificar | entrada da rota nova (a guarda de completude exige) |

---

### Task 0: branch no worktree da sessão e card

**Files:** nenhum arquivo do repo (cria `C:\Users\Igor\AppData\Local\Temp\pr6-card-inicio.sql`).

**Depends-on:** none

**Interfaces:**
- Produces: branch `feat/postar-grupo-exclusivo` a partir de `origin/main`, sem upstream, no worktree da sessão; o caminho Windows `<WT>` usado em todos os blocos do Igor; `pr6-card-inicio.sql` (Task 1).

- [ ] **Step 1: estou num worktree limpo da sessão, não no checkout principal.**

```bash
WT=$(git rev-parse --show-toplevel); echo "$WT"; cygpath -w "$WT"; git -C "$WT" branch --show-current; git -C "$WT" status --short
```

Esperado: o caminho está dentro de `.claude/worktrees/` e o `status` vem vazio. Anote a segunda linha (caminho Windows): é o `<WT>` dos blocos do Igor. Se o caminho for `C:/Users/Igor/Desktop/HubFlow-platform` (checkout principal) ou o `status` tiver qualquer linha, **pare** e pergunte ao Igor — o HEAD do principal é compartilhado com outras sessões.

- [ ] **Step 2: ninguém pegou isto ainda.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" fetch origin --prune && git -C "$WT" ls-remote --heads origin feat/postar-grupo-exclusivo && gh pr list --repo codingB0y/Girumo --state open --head feat/postar-grupo-exclusivo
```

Esperado: as duas últimas sem saída. Se a branch existe ou há PR aberto, **pare** (outra sessão está nela).

- [ ] **Step 3: o PR 1 está na `main`.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" ls-tree --name-only origin/main apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql; git -C "$WT" grep -n "20261010120000_postar_por_grupo" origin/main -- deploy/supabase/apply-order.txt
```

Esperado: as duas linhas aparecem. Vazio = o PR 1 ainda não mergeou: **pare** e avise o Igor (este PR entra depois dele na `apply-order` e na baseline).

- [ ] **Step 4: criar a branch a partir de `origin/main` e tirar o upstream** (o `switch -c` a partir de `origin/main` amarra o upstream na `main`; um `git push` sem argumento mandaria para lá).

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" switch -c feat/postar-grupo-exclusivo origin/main && git -C "$WT" branch --unset-upstream && git -C "$WT" log -1 --oneline && git -C "$WT" status -sb | head -1
```

Esperado: o último commit é o de `origin/main`; a linha do `status -sb` é `## feat/postar-grupo-exclusivo` (sem `...origin/main`).

- [ ] **Step 5: `node_modules`.** Na ferramenta PowerShell:

```powershell
$wt = (git rev-parse --show-toplevel) -replace '/', '\'; Test-Path "$wt\node_modules\.bin\tsx"; Test-Path "C:\Users\Igor\Desktop\HubFlow-platform\node_modules\next"
```

- Primeira `True`: nada a fazer.
- Primeira `False` e segunda `True`: ligar por junction (caminhos absolutos; memória `finding-worktree-node-modules-junction`):

```powershell
$wt = (git rev-parse --show-toplevel) -replace '/', '\'; cmd /c mklink /J "$wt\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"; if (Test-Path "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules") { cmd /c mklink /J "$wt\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules" }
```

- As duas `False` (o `node_modules` do principal vive vazio desde 05/10):

```powershell
$wt = (git rev-parse --show-toplevel) -replace '/', '\'; Set-Location $wt; npm ci --workspace apps/web --include-workspace-root --no-audit --no-fund
```

- [ ] **Step 6: a key do card.** O plano do PR 1 pode ter criado o card com outra key:

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" grep -n "move_card(" origin/main -- 'docs/superpowers/plans/2026-10-10-postar-por-grupo-pr1*.md' | head -3
```

Se aparecer uma key diferente de `postar-por-grupo`, use-a no lugar de `postar-por-grupo` neste step e na Task 10.

- [ ] **Step 7: SQL do card** (o Igor roda na Task 1). Crie com a ferramenta Write `C:\Users\Igor\AppData\Local\Temp\pr6-card-inicio.sql`:

```sql
-- Card do quadro (prod). Cria se o PR 1 ainda não criou, e move.
insert into public.board_features (key, title, area, summary)
values ('postar-por-grupo', 'Postar por grupo (lotado, destino por regra, padronizar, aviso ao lotar)', 'Grupos',
        'Spec docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md — 9 PRs.')
on conflict (key) do nothing;

select public.move_card('postar-por-grupo', 'em_construcao',
  'PR 6 começou: um grupo, uma campanha (trigger de exclusividade, tela de conflitos, seletor travado)',
  'feat/postar-grupo-exclusivo');
```

### Task 1: conferir que nada disto existe (branches, dev, prod)

**Files:** nenhum arquivo do repo (cria `C:\Users\Igor\AppData\Local\Temp\pr6-precheck.sql` e as saídas `pr6-precheck-dev.json` / `pr6-precheck-prod.json`).

**Depends-on:** Task 0

**Interfaces:**
- Consumes: `pr6-card-inicio.sql` (Task 0).
- Produces: "nada do PR 6 existe em dev nem em prod, e o PR 1 está aplicado nos dois"; a lista de colunas obrigatórias que o fixture do check (Task 3) precisa preencher; `conflitos_por_loja` de prod (vai para o corpo do PR).

- [ ] **Step 1: nenhum PR ou branch mexe nisto** (`CLAUDE.md`: em 30/07 uma migração foi reescrita à toa porque já existia numa branch).

```bash
WT=$(git rev-parse --show-toplevel); gh pr list --repo codingB0y/Girumo --state open --limit 50 --json number,title,headRefName; for s in campaign_groups_grupo_exclusivo grupos_em_mais_de_uma_campanha reordenar_campanha; do echo "== $s"; git -C "$WT" log --all --oneline -S "$s" -- apps/web/supabase deploy/supabase infra; done
```

Esperado: nenhum PR aberto com título/branch sobre exclusividade de grupo, conflito de campanha ou trigger em `campaign_groups`; os três `log -S` vazios (nas pastas de banco — os docs do spec citam os nomes, por isso o filtro de caminho).

```bash
WT=$(git rev-parse --show-toplevel); for b in $(git -C "$WT" branch -r --format='%(refname:short)' | grep -v -e HEAD -e '^origin/main$'); do n=$(git -C "$WT" diff origin/main..."$b" -- apps/web/supabase/migrations deploy/supabase 2>/dev/null | grep -ci "campaign_groups"); [ "$n" -gt 0 ] && echo "$b $n"; done; echo fim
```

Esperado: só `fim`. Branch listada → `git -C "$WT" diff origin/main...<branch> --stat` e pergunte ao Igor antes de seguir.

- [ ] **Step 2: escrever a conferência** com a ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\pr6-precheck.sql`:

```sql
-- PR 6 (um grupo, uma campanha) — conferência ANTES da migração. Só leitura.
-- Esperado nos dois bancos: trigger_exclusivo = false; funcoes_pr6 = null; pr1_aplicado = true;
-- rpcs_array = as duas de 20260916040000; triggers_campaign_groups sem campaign_groups_grupo_exclusivo;
-- colunas_obrigatorias = exatamente organizations.name, organizations.slug, organizations.tenant_id,
-- campaign_groups.name, campaign_groups.slug, campaign_groups.tenant_id, groups.name, groups.tenant_id,
-- groups.whatsapp_group_id (é o que o fixture de infra/tests/grupo-uma-campanha-check.sql preenche).
-- conflitos_por_loja é informação: quantos grupos JÁ estão em 2+ campanhas, por loja.
select json_build_object(
  'trigger_exclusivo', exists (
    select 1 from pg_trigger
     where tgrelid = 'public.campaign_groups'::regclass and tgname = 'campaign_groups_grupo_exclusivo'),
  'triggers_campaign_groups', (
    select json_agg(tgname order by tgname) from pg_trigger
     where tgrelid = 'public.campaign_groups'::regclass and not tgisinternal),
  'funcoes_pr6', (
    select json_agg(p.oid::regprocedure::text) from pg_proc p
     where p.proname in ('campaign_groups_grupo_exclusivo', 'grupos_em_mais_de_uma_campanha', 'reordenar_campanha')),
  'pr1_aplicado', to_regprocedure('public.campaign_group_states(uuid,uuid)') is not null,
  'rpcs_array', (
    select json_agg(p.oid::regprocedure::text order by p.proname) from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('campaign_group_append_group_id', 'campaign_group_remove_group_id')),
  'colunas_obrigatorias', (
    select json_agg(table_name || '.' || column_name order by table_name, column_name)
      from information_schema.columns
     where table_schema = 'public'
       and table_name in ('organizations', 'campaign_groups', 'groups')
       and is_nullable = 'NO' and column_default is null),
  'conflitos_por_loja', (
    select json_agg(json_build_object('tenant_id', tenant_id, 'grupos', n) order by n desc)
      from (
        select tenant_id, count(*) as n
          from (
            select c.tenant_id, j.jid
              from public.campaign_groups c
             cross join lateral unnest(c.group_ids) as j(jid)
             group by c.tenant_id, j.jid
            having count(distinct c.id) > 1) as x
         group by tenant_id) as y)
) as r;
```

- [ ] **Step 3: dev, por você** (leitura em dev passou no classificador desde 03/10):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f "C:/Users/Igor/AppData/Local/Temp/pr6-precheck.sql"
```

Se o classificador negar, não tente por outra ferramenta: o Igor roda o mesmo arquivo em dev junto do Step 4 (troque o ref na primeira linha `supabase link` do bloco e rode de novo).

- [ ] **Step 4: PEÇA AO IGOR — prod (conferência + card).** Mande este bloco (PowerShell 5.1) e siga para a Task 2 enquanto ele roda; a Task 3 só começa com a resposta dele:

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "C:\Users\Igor\AppData\Local\Temp\pr6-precheck.sql" }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "C:\Users\Igor\AppData\Local\Temp\pr6-card-inicio.sql" }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

- [ ] **Step 5: guardar as saídas.** Com a ferramenta Write, salve o objeto `r` (de `rows[0].r`) de dev em `C:\Users\Igor\AppData\Local\Temp\pr6-precheck-dev.json` e o de prod em `C:\Users\Igor\AppData\Local\Temp\pr6-precheck-prod.json` (JSON puro).

- [ ] **Step 6: decidir.** Nos dois bancos o resultado tem de bater com o "Esperado" do cabeçalho. Pare e mostre a saída ao Igor se:
  - `trigger_exclusivo` for `true` ou `funcoes_pr6` não for `null` — alguém já aplicou algo (o `create or replace` passaria por cima em silêncio);
  - `pr1_aplicado` for `false` em algum banco — a ordem da `apply-order` estaria mentindo;
  - `rpcs_array` não tiver as duas funções — o bloco 4 do check e `removeGroupId` dependem delas.

  Se `colunas_obrigatorias` trouxer coluna além das nove esperadas, acrescente-a com um valor fixo ao `insert` correspondente do fixture do check (Task 3, Step 1) antes de seguir. `conflitos_por_loja` de prod vai para o corpo do PR (Task 9).

### Task 2: módulo puro do "um grupo, uma campanha" (TDD)

**Files:**
- Create: `apps/web/src/lib/campaigns/conflito-grupo.test.ts`
- Create: `apps/web/src/lib/campaigns/conflito-grupo.ts`

**Depends-on:** Task 0

**Interfaces:**
- Produces (sem `server-only`, importável no cliente):
  - `type ConflitoDeGrupo = { whatsappGroupId: string; nome: string; campanhas: Array<{ id: string; name: string; slug: string; posicao: number }> }` (forma do contrato §4)
  - `type Conflito409 = { grupo: string; campanha: { id: string; name: string } }`
  - `lerConflitoGrupo(mensagem: string): { jid: string; campanhaId: string } | null`
  - `lerCorpo409(corpo: unknown): Conflito409 | null`
  - `mensagemConflito(nomeDoGrupo: string | null, nomeDaCampanha: string): string`
  - `travasDoSeletor(campanhas, atual: { id: string | null; groupIds: readonly string[] }): Map<string, string>`
  - `gruposDoEspelho(membros: readonly string[], campanhas, gavetaId: string | null): string[]`
  - `lerEscolha(corpo: unknown)`, `planejarEscolha(campanhas, escolha)`, `GRUPO_SAIU_DA_CAMPANHA`
  - `faltaEscolher(conflitos, escolhas: Record<string, string>): number`
  - `avisoDaCampanha(conflitos, campanhaId): { inicio: string; nomes: string } | null`

- [ ] **Step 1: escrever o teste** — `apps/web/src/lib/campaigns/conflito-grupo.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  avisoDaCampanha,
  faltaEscolher,
  GRUPO_SAIU_DA_CAMPANHA,
  gruposDoEspelho,
  lerConflitoGrupo,
  lerCorpo409,
  lerEscolha,
  mensagemConflito,
  planejarEscolha,
  travasDoSeletor,
  type ConflitoDeGrupo,
} from "./conflito-grupo";

const A1 = "6a7e0000-0000-4000-8000-0000000000a1";
const A2 = "6a7e0000-0000-4000-8000-0000000000a2";
const A3 = "6a7e0000-0000-4000-8000-0000000000a3";
const A4 = "6a7e0000-0000-4000-8000-0000000000a4";
const FORA = "6a7e0000-0000-4000-8000-0000000000ff";

test("lê a mensagem do trigger: o grupo e a campanha que já o tem", () => {
  assert.deepEqual(lerConflitoGrupo(`grupo_em_outra_campanha:120363001@g.us:${A1}`), {
    jid: "120363001@g.us",
    campanhaId: A1,
  });
});

test("o JID vai até o último ':' antes do uuid, e o uuid volta minúsculo", () => {
  assert.deepEqual(lerConflitoGrupo(`grupo_em_outra_campanha:abc:def@g.us:${A1.toUpperCase()}`), {
    jid: "abc:def@g.us",
    campanhaId: A1,
  });
});

test("acha a mensagem mesmo embrulhada por quem repassou o erro", () => {
  assert.deepEqual(lerConflitoGrupo(`Error: grupo_em_outra_campanha:g1@g.us:${A2}`), {
    jid: "g1@g.us",
    campanhaId: A2,
  });
});

test("qualquer outro erro não é conflito de grupo", () => {
  assert.equal(
    lerConflitoGrupo('duplicate key value violates unique constraint "campaign_groups_tenant_slug_unique"'),
    null,
  );
  assert.equal(lerConflitoGrupo("grupo_em_outra_campanha:g1@g.us:nao-e-uuid"), null);
  assert.equal(lerConflitoGrupo(""), null);
});

test("o corpo do 409 só vale com grupo e campanha completos", () => {
  assert.deepEqual(lerCorpo409({ error: "x", grupo: "g1@g.us", campanha: { id: A1, name: "Saldão" } }), {
    grupo: "g1@g.us",
    campanha: { id: A1, name: "Saldão" },
  });
  // O 402 do gate de plano também é erro com corpo — não pode virar conflito.
  assert.equal(lerCorpo409({ error: "Limite do plano", upgradeUrl: "/painel/configuracoes" }), null);
  assert.equal(lerCorpo409({ grupo: "g1@g.us", campanha: { id: A1 } }), null);
  assert.equal(lerCorpo409(null), null);
});

test("a mensagem nomeia a outra campanha, e o grupo quando a tela sabe o nome", () => {
  assert.equal(
    mensagemConflito(null, "Saldão Outubro"),
    "Um dos grupos já está na campanha “Saldão Outubro”. Cada grupo fica em uma campanha só — tire de lá primeiro.",
  );
  assert.equal(
    mensagemConflito("Saldão 1", "Saldão Outubro"),
    "O grupo “Saldão 1” já está na campanha “Saldão Outubro”. Cada grupo fica em uma campanha só — tire de lá primeiro.",
  );
});

const campanhas = [
  { id: A1, name: "Moda Kids do Sul", groupIds: ["g1", "g2", "g9"] },
  { id: A2, name: "Saldão Outubro", groupIds: ["g3", "g9"] },
];

test("na edição, grupo de outra campanha trava com o nome dela; os da própria não", () => {
  const travas = travasDoSeletor(campanhas, { id: A1, groupIds: ["g1", "g2", "g9"] });
  assert.deepEqual([...travas], [["g3", "Saldão Outubro"]]);
});

test("conflito antigo (grupo nesta e noutra) não trava: o lojista tem de conseguir desmarcar", () => {
  const travas = travasDoSeletor(campanhas, { id: A2, groupIds: ["g3", "g9"] });
  assert.equal(travas.has("g9"), false);
  assert.equal(travas.get("g1"), "Moda Kids do Sul");
});

test("na criação toda campanha é outra; o grupo em duas fica com o nome da primeira da lista", () => {
  const travas = travasDoSeletor(campanhas, { id: null, groupIds: [] });
  assert.deepEqual([...travas.keys()].sort(), ["g1", "g2", "g3", "g9"]);
  assert.equal(travas.get("g9"), "Moda Kids do Sul");
});

test("espelho de comunidade nativa: grupo que já está numa campanha fica fora da gaveta nova", () => {
  // Gaveta ainda não existe (insert): sem o filtro o trigger recusaria a gaveta inteira.
  assert.deepEqual(gruposDoEspelho(["g1", "g5", "g6"], campanhas, null), ["g5", "g6"]);
});

test("espelho: o que a gaveta já tinha continua, mesmo em conflito antigo — nada sai sozinho", () => {
  const comGaveta = [...campanhas, { id: A3, name: "Comunidade", groupIds: ["g9", "g5"] }];
  // g9 já era da gaveta (conflito antigo com A1 e A2): fica. g3 é novo e é de A2: sai. g7 é livre: entra.
  assert.deepEqual(gruposDoEspelho(["g9", "g3", "g5", "g7"], comGaveta, A3), ["g9", "g5", "g7"]);
});

test("a escolha precisa de grupo e de uuid de campanha", () => {
  assert.deepEqual(lerEscolha({ jid: " g1@g.us ", ficaEm: A1.toUpperCase() }), { ok: true, jid: "g1@g.us", ficaEm: A1 });
  assert.deepEqual(lerEscolha({ ficaEm: A1 }), { ok: false, error: "Grupo inválido." });
  assert.deepEqual(lerEscolha({ jid: "g1@g.us", ficaEm: "moda-kids" }), { ok: false, error: "Campanha inválida." });
  assert.deepEqual(lerEscolha({ jid: "x".repeat(201), ficaEm: A1 }), { ok: false, error: "Grupo inválido." });
  assert.deepEqual(lerEscolha("g1@g.us"), { ok: false, error: "Grupo inválido." });
});

const linhas = [
  { id: A1, group_ids: ["g1", "g9"] },
  { id: A2, group_ids: ["g9", "g9", "g3"] },
  { id: A3, group_ids: ["g9"] },
];

test("o grupo fica numa campanha e sai de todas as outras que o têm", () => {
  assert.deepEqual(planejarEscolha(linhas, { jid: "g9", ficaEm: A2 }), { ok: true, tirarDe: [A1, A3] });
  assert.deepEqual(planejarEscolha(linhas, { jid: "g1", ficaEm: A1 }), { ok: true, tirarDe: [] });
});

test("se a campanha escolhida não tem mais o grupo, nada sai (senão ele ficaria sem campanha)", () => {
  assert.deepEqual(planejarEscolha(linhas, { jid: "g3", ficaEm: A1 }), {
    ok: false,
    status: 409,
    error: GRUPO_SAIU_DA_CAMPANHA,
  });
});

test("campanha escolhida que não é da loja é 404", () => {
  assert.deepEqual(planejarEscolha(linhas, { jid: "g9", ficaEm: FORA }), {
    ok: false,
    status: 404,
    error: "Campanha não encontrada.",
  });
});

const moda = { id: A1, name: "Moda Kids do Sul", slug: "moda", posicao: 5 };
const saldao = { id: A2, name: "Saldão Outubro", slug: "saldao", posicao: 2 };
const bota = { id: A3, name: "Bota Fora", slug: "bota", posicao: 3 };
const conflitos: ConflitoDeGrupo[] = [
  { whatsappGroupId: "g9", nome: "Grupo VIP", campanhas: [moda, saldao] },
  { whatsappGroupId: "g8", nome: "Novo grupo", campanhas: [moda, saldao] },
  { whatsappGroupId: "g7", nome: "Outro", campanhas: [saldao, bota] },
];

test("falta escolher conta grupo sem escolha e escolha que não é uma das campanhas dele", () => {
  assert.equal(faltaEscolher(conflitos, {}), 3);
  assert.equal(faltaEscolher(conflitos, { g9: A2, g8: A3, g7: A3 }), 1);
  assert.equal(faltaEscolher(conflitos, { g9: A2, g8: A1, g7: A3 }), 0);
});

test("a faixa conta só os grupos desta campanha e nomeia as outras", () => {
  assert.deepEqual(avisoDaCampanha(conflitos, A1), {
    inicio: "2 grupos desta campanha também estão em",
    nomes: "Saldão Outubro",
  });
  assert.deepEqual(avisoDaCampanha(conflitos, A3), {
    inicio: "1 grupo desta campanha também está em",
    nomes: "Saldão Outubro",
  });
  assert.deepEqual(avisoDaCampanha(conflitos, A2), {
    inicio: "3 grupos desta campanha também estão em",
    nomes: "Moda Kids do Sul e Bota Fora",
  });
  const quatro: ConflitoDeGrupo[] = [
    {
      whatsappGroupId: "g1",
      nome: "G",
      campanhas: [moda, saldao, bota, { id: A4, name: "Queima", slug: "queima", posicao: 1 }],
    },
  ];
  assert.deepEqual(avisoDaCampanha(quatro, A1), {
    inicio: "1 grupo desta campanha também está em",
    nomes: "Saldão Outubro, Bota Fora e Queima",
  });
  assert.equal(avisoDaCampanha(conflitos, FORA), null);
});
```

- [ ] **Step 2: RED.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/conflito-grupo.test.ts
```

Esperado: FAIL — `Cannot find module` (o `conflito-grupo.ts` ainda não existe).

- [ ] **Step 3: implementar** — `apps/web/src/lib/campaigns/conflito-grupo.ts`:

```ts
/**
 * Um grupo, uma campanha (spec 2026-10-10-postar-por-grupo §5.8 e §6.6, D4) — o lado TS do
 * trigger `campaign_groups_grupo_exclusivo`. Puro e sem `server-only`: o seletor de grupos, a
 * tela de conflitos, a faixa da aba Grupos, as rotas e o espelho de comunidade importam daqui.
 */

/** Linha de `GET /api/campanhas/conflitos` (contrato §4). */
export type ConflitoDeGrupo = {
  whatsappGroupId: string;
  nome: string;
  campanhas: Array<{ id: string; name: string; slug: string; posicao: number }>;
};

/** O que importa do corpo do 409 de POST/PATCH /api/campanhas (contrato §4). */
export type Conflito409 = { grupo: string; campanha: { id: string; name: string } };

const MENSAGEM_DO_TRIGGER =
  /grupo_em_outra_campanha:(.+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JID_MAX = 200;

export const GRUPO_SAIU_DA_CAMPANHA = "Esse grupo não está mais nessa campanha. Recarregue a lista.";

/**
 * Lê `grupo_em_outra_campanha:<jid>:<id da outra>`. O JID vai até o ÚLTIMO `:` antes do uuid,
 * então JID com `:` no meio não quebra. `null` para qualquer outro erro.
 */
export function lerConflitoGrupo(mensagem: string): { jid: string; campanhaId: string } | null {
  const m = MENSAGEM_DO_TRIGGER.exec(mensagem);
  return m ? { jid: m[1], campanhaId: m[2].toLowerCase() } : null;
}

/** O corpo do 409 lido no cliente; `null` se não for o 409 de grupo (o 402 do plano também tem `error`). */
export function lerCorpo409(corpo: unknown): Conflito409 | null {
  if (!corpo || typeof corpo !== "object") return null;
  const { grupo, campanha } = corpo as { grupo?: unknown; campanha?: unknown };
  if (typeof grupo !== "string" || !campanha || typeof campanha !== "object") return null;
  const { id, name } = campanha as { id?: unknown; name?: unknown };
  if (typeof id !== "string" || typeof name !== "string") return null;
  return { grupo, campanha: { id, name } };
}

/** Texto do erro. O servidor não sabe o nome do grupo e manda `null`; o seletor sabe e completa. */
export function mensagemConflito(nomeDoGrupo: string | null, nomeDaCampanha: string): string {
  const quem = nomeDoGrupo ? `O grupo “${nomeDoGrupo}”` : "Um dos grupos";
  return `${quem} já está na campanha “${nomeDaCampanha}”. Cada grupo fica em uma campanha só — tire de lá primeiro.`;
}

type CampanhaComGrupos = { id: string; name: string; groupIds: readonly string[] };

/**
 * JID → nome da outra campanha, para travar no seletor. Espelha o trigger: só trava o que
 * ENTRARIA agora — grupo que a campanha já tem (inclusive conflito antigo) nunca trava, senão o
 * lojista não conseguiria desmarcá-lo. Na criação, `atual = { id: null, groupIds: [] }`.
 */
export function travasDoSeletor(
  campanhas: readonly CampanhaComGrupos[],
  atual: { id: string | null; groupIds: readonly string[] },
): Map<string, string> {
  const proprios = new Set(atual.groupIds);
  const travas = new Map<string, string>();
  for (const c of campanhas) {
    if (c.id === atual.id) continue;
    for (const jid of c.groupIds) {
      if (!proprios.has(jid) && !travas.has(jid)) travas.set(jid, c.name);
    }
  }
  return travas;
}

/**
 * O que o espelho da comunidade nativa grava em `group_ids`: o que o WhatsApp diz, MENOS os
 * grupos que já estão em outra campanha e ainda não estão nesta gaveta (o trigger recusaria a
 * escrita inteira). Quem chegou primeiro fica com o grupo; o que a gaveta já tinha continua.
 */
export function gruposDoEspelho(
  membros: readonly string[],
  campanhas: ReadonlyArray<{ id: string; groupIds: readonly string[] }>,
  gavetaId: string | null,
): string[] {
  const daGaveta = new Set(campanhas.find((c) => c.id === gavetaId)?.groupIds ?? []);
  const deOutras = new Set(campanhas.filter((c) => c.id !== gavetaId).flatMap((c) => c.groupIds));
  return membros.filter((jid) => daGaveta.has(jid) || !deOutras.has(jid));
}

/** Corpo de `POST /api/campanhas/conflitos` (`{ jid, ficaEm }`). */
export function lerEscolha(
  corpo: unknown,
): { ok: true; jid: string; ficaEm: string } | { ok: false; error: string } {
  const b = corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>) : {};
  const jid = typeof b.jid === "string" ? b.jid.trim() : "";
  const ficaEm = typeof b.ficaEm === "string" ? b.ficaEm.trim().toLowerCase() : "";
  if (!jid || jid.length > JID_MAX) return { ok: false, error: "Grupo inválido." };
  if (!UUID.test(ficaEm)) return { ok: false, error: "Campanha inválida." };
  return { ok: true, jid, ficaEm };
}

/**
 * De quais campanhas o grupo sai para ficar em `ficaEm`. Recusa quando `ficaEm` não tem mais o
 * grupo — senão ele sairia de todas e não ficaria em nenhuma.
 */
export function planejarEscolha(
  campanhas: ReadonlyArray<{ id: string; group_ids: readonly string[] }>,
  escolha: { jid: string; ficaEm: string },
): { ok: true; tirarDe: string[] } | { ok: false; status: 404 | 409; error: string } {
  const fica = campanhas.find((c) => c.id === escolha.ficaEm);
  if (!fica) return { ok: false, status: 404, error: "Campanha não encontrada." };
  if (!fica.group_ids.includes(escolha.jid)) return { ok: false, status: 409, error: GRUPO_SAIU_DA_CAMPANHA };
  return {
    ok: true,
    tirarDe: campanhas.filter((c) => c.id !== fica.id && c.group_ids.includes(escolha.jid)).map((c) => c.id),
  };
}

/** Quantos conflitos ainda não têm escolha válida (uma das campanhas do próprio grupo). */
export function faltaEscolher(
  conflitos: readonly ConflitoDeGrupo[],
  escolhas: Readonly<Record<string, string>>,
): number {
  return conflitos.filter((c) => !c.campanhas.some((camp) => camp.id === escolhas[c.whatsappGroupId])).length;
}

/**
 * Faixa amarela da aba Grupos (mockup "Main"): quantos grupos DESTA campanha também estão em
 * outra, e os nomes das outras. `null` = nada a avisar.
 */
export function avisoDaCampanha(
  conflitos: readonly ConflitoDeGrupo[],
  campanhaId: string,
): { inicio: string; nomes: string } | null {
  const daCampanha = conflitos.filter((c) => c.campanhas.some((camp) => camp.id === campanhaId));
  if (daCampanha.length === 0) return null;
  const outras = [
    ...new Set(
      daCampanha.flatMap((c) => c.campanhas.filter((camp) => camp.id !== campanhaId).map((camp) => camp.name)),
    ),
  ];
  const n = daCampanha.length;
  const inicio = n === 1 ? "1 grupo desta campanha também está em" : `${n} grupos desta campanha também estão em`;
  return { inicio, nomes: juntarNomes(outras) };
}

function juntarNomes(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}
```

- [ ] **Step 4: GREEN.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/conflito-grupo.test.ts
```

Esperado: `# pass 17`, `# fail 0`.

- [ ] **Step 5: commit.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/src/lib/campaigns/conflito-grupo.ts apps/web/src/lib/campaigns/conflito-grupo.test.ts
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" diff --cached --stat
```

Esperado: os 2 arquivos, nada mais.

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" commit -F - <<'EOF'
feat(campaigns): pure helpers for one group, one campaign

Parser for the exclusive-group trigger message and the 409 body, picker
locks, native-community mirror filter, conflict choice validation and
plan, and the groups-tab warning text.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 3: banco — conferência primeiro, depois migração, apply-order e baseline

**Files:**
- Create: `infra/tests/grupo-uma-campanha-check.sql`
- Create: `apps/web/supabase/migrations/20261010130000_grupo_uma_campanha.sql`
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)
- Modify: `deploy/supabase/schema-baseline.json`

**Depends-on:** Task 1 (o OK dos dois bancos e `colunas_obrigatorias`)

**Interfaces:**
- Produces (contrato §2, exatamente):
  - trigger `campaign_groups_grupo_exclusivo` `before insert or update of group_ids on public.campaign_groups` → `app.campaign_groups_grupo_exclusivo()`; recusa com `errcode = 'unique_violation'`, `message = 'grupo_em_outra_campanha:' || jid || ':' || outra_campanha_id`
  - `public.grupos_em_mais_de_uma_campanha(p_tenant uuid) returns table(whatsapp_group_id text, name text, campanhas jsonb)`, `campanhas = [{"id","name","slug","posicao"}]` por `created_at` da campanha
  - `public.reordenar_campanha(p_tenant uuid, p_campanha uuid, p_esperado text[], p_nova text[]) returns boolean`
  - baseline: `f|grupos_em_mais_de_uma_campanha(p_tenant uuid)` = `d4b914108a3146913b311ff40fea570c` e `f|reordenar_campanha(p_tenant uuid, p_campanha uuid, p_esperado text[], p_nova text[])` = `e2129f5f932794247606386523d5715e` (`md5(pg_get_function_result || '|secdef=true|vol=' || provolatile)`, a fórmula de `schema_signature()`; conferida contra `f|schema_signature()` e `f|campaign_group_append_group_id(...)` da baseline atual)
- Consumes: `public.campaign_group_append_group_id(uuid, uuid, text)` (20260916040000), `public.schema_signature()`.

- [ ] **Step 1: escrever a conferência (o teste do SQL)** — `infra/tests/grupo-uma-campanha-check.sql`:

```sql
-- Conferência do PR 6 do postar por grupo (migração 20261010130000_grupo_uma_campanha.sql), nos
-- DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\grupo-uma-campanha-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: duas lojas descartáveis, campanhas e um grupo,
-- com uuids 6a7e…. Cada bloco levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha
-- traz `r` com a assinatura das duas funções para a baseline — o gate de drift não vê trigger,
-- schema app, ACL nem corpo de função; é este arquivo que prova isso nos dois bancos.
--
-- Antes da migração o bloco 1 falha com 'FALHOU: trigger campaign_groups_grupo_exclusivo
-- ausente ou desligado' — é o RED.
--
-- Lojas: TA = 6a7e0000-0000-4000-8000-000000000001, TB = 6a7e0000-0000-4000-8000-000000000002.
-- Campanhas: A1 (TA, a mais antiga), A2 (TA), B1 (TB), A3 (TA, recusada no bloco 2) e A4 (nasce
-- em TB e muda para TA no bloco 6: o trigger só olha group_ids, então mudar de loja simula um
-- conflito ANTIGO sem DDL).

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('6a7e0000-0000-4000-8000-000000000001', '6a7e0000-0000-4000-8000-000000000001',
   'Check grupo exclusivo TA', 'check-grupo-exclusivo-6a7e-ta'),
  ('6a7e0000-0000-4000-8000-000000000002', '6a7e0000-0000-4000-8000-000000000002',
   'Check grupo exclusivo TB', 'check-grupo-exclusivo-6a7e-tb');

-- 1) Trigger ligado; RPCs com a ACL do contrato; função do trigger fora do alcance de anon/authenticated.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.campaign_groups'::regclass
       and tgname = 'campaign_groups_grupo_exclusivo'
       and tgenabled = 'O'
  ) then
    raise exception 'FALHOU: trigger campaign_groups_grupo_exclusivo ausente ou desligado';
  end if;

  if exists (
    select 1
      from (values
        ('public.grupos_em_mais_de_uma_campanha(uuid)'),
        ('public.reordenar_campanha(uuid,uuid,text[],text[])')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: grupos_em_mais_de_uma_campanha/reordenar_campanha fora do contrato (security definer, search_path, execute so service_role)';
  end if;

  if has_function_privilege('anon', 'app.campaign_groups_grupo_exclusivo()', 'EXECUTE')
     or has_function_privilege('authenticated', 'app.campaign_groups_grupo_exclusivo()', 'EXECUTE') then
    raise exception 'FALHOU: app.campaign_groups_grupo_exclusivo() executavel por anon/authenticated';
  end if;
end $$;

insert into public.campaign_groups (id, tenant_id, name, slug, group_ids, created_at) values
  ('6a7e0000-0000-4000-8000-0000000000a1', '6a7e0000-0000-4000-8000-000000000001', 'Check A1', 'check-a1',
   array['check-g1@g.us', 'check-g2@g.us'], now() - interval '3 hours'),
  ('6a7e0000-0000-4000-8000-0000000000a2', '6a7e0000-0000-4000-8000-000000000001', 'Check A2', 'check-a2',
   array['check-g3@g.us'], now() - interval '2 hours'),
  -- Mesmo check-g1 de A1, mas em OUTRA loja: tem de entrar.
  ('6a7e0000-0000-4000-8000-0000000000b1', '6a7e0000-0000-4000-8000-000000000002', 'Check B1', 'check-b1',
   array['check-g1@g.us'], now() - interval '1 hour');

insert into public.groups (tenant_id, whatsapp_group_id, name) values
  ('6a7e0000-0000-4000-8000-000000000001', 'check-g3@g.us', 'Grupo tres do check');

-- 2) JID novo que já está noutra campanha da loja: recusado no update e no insert, com a mensagem
--    do contrato apontando a campanha que já tem o grupo.
do $$
declare
  v_msg text;
begin
  begin
    update public.campaign_groups
       set group_ids = group_ids || 'check-g1@g.us'::text
     where id = '6a7e0000-0000-4000-8000-0000000000a2';
    raise exception 'FALHOU: update pos check-g1 em A2, que ja esta em A1';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from 'grupo_em_outra_campanha:check-g1@g.us:6a7e0000-0000-4000-8000-0000000000a1' then
      raise exception 'FALHOU: mensagem do update = %', v_msg;
    end if;
  end;

  begin
    insert into public.campaign_groups (id, tenant_id, name, slug, group_ids) values
      ('6a7e0000-0000-4000-8000-0000000000a3', '6a7e0000-0000-4000-8000-000000000001', 'Check A3', 'check-a3',
       array['check-g9@g.us', 'check-g2@g.us']);
    raise exception 'FALHOU: insert de A3 com check-g2, que ja esta em A1';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from 'grupo_em_outra_campanha:check-g2@g.us:6a7e0000-0000-4000-8000-0000000000a1' then
      raise exception 'FALHOU: mensagem do insert = %', v_msg;
    end if;
  end;
end $$;

-- 3) A trava é por loja: JID é id global do WhatsApp e duas lojas podem administrar o mesmo grupo.
do $$
begin
  update public.campaign_groups
     set group_ids = group_ids || 'check-g2@g.us'::text
   where id = '6a7e0000-0000-4000-8000-0000000000b1';
  if not exists (
    select 1 from public.campaign_groups
     where id = '6a7e0000-0000-4000-8000-0000000000b1'
       and group_ids = array['check-g1@g.us', 'check-g2@g.us']
  ) then
    raise exception 'FALHOU: B1 (outra loja) deveria aceitar check-g2';
  end if;
end $$;

-- 4) campaign_group_append_group_id (auto-grow, tela de comunidades) passa pelo mesmo trigger;
--    grupo livre entra e repetido continua idempotente.
do $$
declare
  v_msg text;
begin
  begin
    perform public.campaign_group_append_group_id(
      '6a7e0000-0000-4000-8000-000000000001', '6a7e0000-0000-4000-8000-0000000000a2', 'check-g2@g.us');
    raise exception 'FALHOU: append de check-g2 em A2 passou';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from 'grupo_em_outra_campanha:check-g2@g.us:6a7e0000-0000-4000-8000-0000000000a1' then
      raise exception 'FALHOU: mensagem do append = %', v_msg;
    end if;
  end;

  perform public.campaign_group_append_group_id(
    '6a7e0000-0000-4000-8000-000000000001', '6a7e0000-0000-4000-8000-0000000000a2', 'check-g7@g.us');
  perform public.campaign_group_append_group_id(
    '6a7e0000-0000-4000-8000-000000000001', '6a7e0000-0000-4000-8000-0000000000a2', 'check-g3@g.us');
  if not exists (
    select 1 from public.campaign_groups
     where id = '6a7e0000-0000-4000-8000-0000000000a2'
       and group_ids = array['check-g3@g.us', 'check-g7@g.us']
  ) then
    raise exception 'FALHOU: A2 deveria ser [check-g3, check-g7] depois dos appends';
  end if;
end $$;

-- 5) O mesmo JID repetido na MESMA campanha não é conflito (o pool usa a menor posição, PR 1).
do $$
begin
  update public.campaign_groups
     set group_ids = array['check-g7@g.us', 'check-g3@g.us', 'check-g7@g.us', 'check-g3@g.us']
   where id = '6a7e0000-0000-4000-8000-0000000000a2';
exception when unique_violation then
  raise exception 'FALHOU: JID repetido dentro de A2 foi tratado como conflito';
end $$;

-- 6) Conflito ANTIGO não trava nada. A4 nasce em TB com check-g3 (livre lá) e muda para TA sem
--    tocar group_ids — o trigger não dispara —, ficando em conflito com A2. Daí: reordenar e pôr
--    grupo livre passam; pôr grupo de outra campanha continua recusado.
insert into public.campaign_groups (id, tenant_id, name, slug, group_ids, created_at) values
  ('6a7e0000-0000-4000-8000-0000000000a4', '6a7e0000-0000-4000-8000-000000000002', 'Check A4', 'check-a4',
   array['check-g3@g.us', 'check-g5@g.us'], now() - interval '30 minutes');
update public.campaign_groups
   set tenant_id = '6a7e0000-0000-4000-8000-000000000001'
 where id = '6a7e0000-0000-4000-8000-0000000000a4';

do $$
declare
  v_msg text;
begin
  update public.campaign_groups
     set group_ids = array['check-g6@g.us', 'check-g5@g.us', 'check-g3@g.us']
   where id = '6a7e0000-0000-4000-8000-0000000000a4';

  begin
    update public.campaign_groups
       set group_ids = group_ids || 'check-g1@g.us'::text
     where id = '6a7e0000-0000-4000-8000-0000000000a4';
    raise exception 'FALHOU: check-g1 (de A1) entrou em A4 por ela ter conflito antigo';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from 'grupo_em_outra_campanha:check-g1@g.us:6a7e0000-0000-4000-8000-0000000000a1' then
      raise exception 'FALHOU: mensagem com conflito antigo = %', v_msg;
    end if;
  end;
exception when unique_violation then
  raise exception 'FALHOU: conflito antigo (check-g3 em A2 e A4) travou a edicao de A4';
end $$;

-- 7) A lista de conflitos: um JID por linha, cada campanha uma vez (menor posição), na ordem de
--    criação; check-g7 repetido só dentro de A2 não aparece; a loja TB não vê nada de TA.
do $$
declare
  v_linhas integer;
  v_nome text;
  v_campanhas jsonb;
begin
  select count(*) into v_linhas
    from public.grupos_em_mais_de_uma_campanha('6a7e0000-0000-4000-8000-000000000001');
  if v_linhas <> 1 then
    raise exception 'FALHOU: TA deveria ter 1 grupo em conflito, veio %', v_linhas;
  end if;

  select x.name, x.campanhas into v_nome, v_campanhas
    from public.grupos_em_mais_de_uma_campanha('6a7e0000-0000-4000-8000-000000000001') as x
   where x.whatsapp_group_id = 'check-g3@g.us';
  if v_nome is distinct from 'Grupo tres do check' then
    raise exception 'FALHOU: nome do grupo = %', v_nome;
  end if;
  if v_campanhas is distinct from jsonb_build_array(
       jsonb_build_object('id', '6a7e0000-0000-4000-8000-0000000000a2', 'name', 'Check A2', 'slug', 'check-a2', 'posicao', 2),
       jsonb_build_object('id', '6a7e0000-0000-4000-8000-0000000000a4', 'name', 'Check A4', 'slug', 'check-a4', 'posicao', 3)) then
    raise exception 'FALHOU: campanhas de check-g3 = %', v_campanhas;
  end if;

  if exists (select 1 from public.grupos_em_mais_de_uma_campanha('6a7e0000-0000-4000-8000-000000000002')) then
    raise exception 'FALHOU: TB nao tem conflito (check-g1 esta em B1 e em A1, mas A1 e de TA)';
  end if;
end $$;

-- 8) reordenar_campanha grava só se a lista é a que a tela viu e a nova é permutação dela.
do $$
declare
  ta constant uuid := '6a7e0000-0000-4000-8000-000000000001';
  a4 constant uuid := '6a7e0000-0000-4000-8000-0000000000a4';
  v_atual text[];
begin
  if public.reordenar_campanha(ta, a4, array['check-g5@g.us', 'check-g3@g.us'],
                               array['check-g3@g.us', 'check-g5@g.us']) then
    raise exception 'FALHOU: reordenou com esperado desatualizado (faltou check-g6)';
  end if;
  if public.reordenar_campanha(ta, a4, array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                               array['check-g3@g.us', 'check-g5@g.us']) then
    raise exception 'FALHOU: nova sem check-g6 foi aceita';
  end if;
  if public.reordenar_campanha(ta, a4, array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                               array['check-g3@g.us', 'check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us']) then
    raise exception 'FALHOU: nova com repetido foi aceita';
  end if;
  if public.reordenar_campanha(ta, a4, array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                               array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us', 'check-g8@g.us']) then
    raise exception 'FALHOU: nova com grupo a mais foi aceita';
  end if;
  if public.reordenar_campanha('6a7e0000-0000-4000-8000-000000000002', a4,
                               array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                               array['check-g3@g.us', 'check-g6@g.us', 'check-g5@g.us']) then
    raise exception 'FALHOU: reordenou campanha de outra loja';
  end if;
  select group_ids into v_atual from public.campaign_groups where id = a4;
  if v_atual is distinct from array['check-g6@g.us', 'check-g5@g.us', 'check-g3@g.us'] then
    raise exception 'FALHOU: uma recusa mexeu na lista: %', v_atual;
  end if;

  -- Válido: esperado em qualquer ordem; o conflito antigo de check-g3 não trava.
  if not public.reordenar_campanha(ta, a4, array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                                   array['check-g3@g.us', 'check-g6@g.us', 'check-g5@g.us']) then
    raise exception 'FALHOU: permutacao valida recusada';
  end if;
  select group_ids into v_atual from public.campaign_groups where id = a4;
  if v_atual is distinct from array['check-g3@g.us', 'check-g6@g.us', 'check-g5@g.us'] then
    raise exception 'FALHOU: A4 = % depois de reordenar', v_atual;
  end if;

  -- Repetido dentro da campanha some na ordem nova (A2 era [g7, g3, g7, g3]).
  if not public.reordenar_campanha(ta, '6a7e0000-0000-4000-8000-0000000000a2',
                                   array['check-g3@g.us', 'check-g7@g.us'],
                                   array['check-g3@g.us', 'check-g7@g.us']) then
    raise exception 'FALHOU: reordenar A2 (com repetido) recusado';
  end if;
  select group_ids into v_atual from public.campaign_groups where id = '6a7e0000-0000-4000-8000-0000000000a2';
  if v_atual is distinct from array['check-g3@g.us', 'check-g7@g.us'] then
    raise exception 'FALHOU: A2 = % depois de reordenar', v_atual;
  end if;
end $$;

rollback;

-- Assinatura para a baseline (fora da transação; só leitura). Esperado nos DOIS bancos:
--   f|grupos_em_mais_de_uma_campanha(p_tenant uuid)                                       d4b914108a3146913b311ff40fea570c
--   f|reordenar_campanha(p_tenant uuid, p_campanha uuid, p_esperado text[], p_nova text[])  e2129f5f932794247606386523d5715e
-- assinatura_total de PROD é a prova da baseline (deploy/supabase/schema-baseline.json).
select json_build_object(
  'assinatura', (
    select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C")
      from public.schema_signature()
     where nome like 'grupos_em_mais_de_uma_campanha(%'
        or nome like 'reordenar_campanha(%'),
  'assinatura_total', (
    select json_build_object(
      'objetos', count(*),
      'md5', md5(string_agg(chave || '=' || sig, ',' order by chave collate "C")))
      from (select kind || '|' || nome as chave, sig from public.schema_signature()) as s)
) as r;
```

Se a Task 1 apontou coluna obrigatória extra, acrescente-a agora ao `insert` da tabela dela (valor fixo).

- [ ] **Step 2: RED em dev** (DML dentro de `begin … rollback`; se o classificador negar, siga — o Igor roda o mesmo arquivo antes da migração na Task 10, Step 2):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f ../../infra/tests/grupo-uma-campanha-check.sql
```

Esperado: erro com `FALHOU: trigger campaign_groups_grupo_exclusivo ausente ou desligado`. Qualquer **outro** erro antes dele (ex.: `null value in column … of relation "organizations"`) é defeito do fixture: corrija o Step 1 e rode de novo.

- [ ] **Step 3: a migração** — `apps/web/supabase/migrations/20261010130000_grupo_uma_campanha.sql`:

```sql
-- Postar por grupo, PR 6: um grupo, uma campanha (spec 2026-10-10-postar-por-grupo-design §5.8, D4).
--
-- campaign_groups.group_ids guarda whatsapp_group_id. Grupo em duas campanhas tem dois links mandando
-- gente para ele (enche fora de ordem) e ganharia dois nomes no Padronizar (PR 8). Daqui pra frente
-- o banco recusa JID NOVO que já esteja em outra campanha da MESMA loja. O que já está em duas
-- campanhas não trava nada (só o JID que entra agora é conferido) e aparece em
-- grupos_em_mais_de_uma_campanha() para o lojista escolher. Nada sai sozinho.
--
-- Escritores cobertos sem saber do trigger: POST/PATCH /api/campanhas, campaign_group_append_group_id
-- (auto-grow e tela de comunidades) e o espelho de comunidade nativa (insert/update do sync, que
-- filtra antes — lib/campaigns/conflito-grupo.ts#gruposDoEspelho). Remover
-- (campaign_group_remove_group_id) nunca é recusado: não há JID novo. O app transforma a recusa em
-- 409 (lib/campaigns/conflito-grupo-409.ts): aplicar junto do merge do PR 6.
--
-- reordenar_campanha() mora aqui porque o Padronizar (PR 8) depende dela e do trigger juntos.
--
-- Aplicar nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns), depois de
-- 20261010120000_postar_por_grupo.sql. Conferir com infra/tests/grupo-uma-campanha-check.sql.

-- 1) Trigger. security invoker: quem escreve em campaign_groups é service_role (bypassa RLS) ou uma
--    RPC security definer; authenticated não tem escrita em public (20261004120000).
create or replace function app.campaign_groups_grupo_exclusivo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_antigos text[] := '{}';
  v_jid text;
  v_outra uuid;
begin
  if tg_op = 'UPDATE' then
    v_antigos := coalesce(old.group_ids, '{}');
  end if;

  -- ponytail: sem trava entre transações — duas escritas simultâneas ainda podem criar um conflito,
  -- que então aparece em grupos_em_mais_de_uma_campanha() como os antigos. Se acontecer,
  -- pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 0)) aqui.
  select n.jid, c.id
    into v_jid, v_outra
    from unnest(coalesce(new.group_ids, '{}')) as n(jid)
    join public.campaign_groups c
      on c.tenant_id = new.tenant_id
     and c.id <> new.id
     and c.group_ids @> array[n.jid]
   where not (v_antigos @> array[n.jid])
   order by c.created_at, c.id
   limit 1;

  if v_jid is not null then
    raise exception using
      errcode = 'unique_violation',
      message = 'grupo_em_outra_campanha:' || v_jid || ':' || v_outra::text;
  end if;

  return new;
end;
$$;

-- Disparar trigger não checa EXECUTE; o revoke é só para ninguém chamá-la por fora.
revoke all on function app.campaign_groups_grupo_exclusivo() from public, anon, authenticated;

drop trigger if exists campaign_groups_grupo_exclusivo on public.campaign_groups;
create trigger campaign_groups_grupo_exclusivo
  before insert or update of group_ids on public.campaign_groups
  for each row
  execute function app.campaign_groups_grupo_exclusivo();

-- 2) Os conflitos que já existem: um JID por linha, cada campanha uma vez (o mesmo JID repetido no
--    array vale a menor posição, como no pool do PR 1), campanhas em ordem de criação.
create or replace function public.grupos_em_mais_de_uma_campanha(p_tenant uuid)
returns table (whatsapp_group_id text, name text, campanhas jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with posicoes as (
    select j.jid, c.id, c.name, c.slug, c.created_at, min(j.posicao)::integer as posicao
      from public.campaign_groups c
     cross join lateral unnest(c.group_ids) with ordinality as j(jid, posicao)
     where c.tenant_id = p_tenant
     group by j.jid, c.id, c.name, c.slug, c.created_at
  )
  select p.jid,
         coalesce(nullif(g.name, ''), p.jid),
         jsonb_agg(
           jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'posicao', p.posicao)
           order by p.created_at, p.id)
    from posicoes p
    left join public.groups g
      on g.tenant_id = p_tenant
     and g.whatsapp_group_id = p.jid
   group by p.jid, g.name
  having count(*) > 1
   order by coalesce(nullif(g.name, ''), p.jid), p.jid;
$$;

-- 3) Ordem nova só se a lista é a que a tela viu (o auto-grow pode ter anexado um grupo no meio) e
--    se a nova é permutação dela, sem repetido. `for update` segura o append concorrente. O update
--    passa pelo trigger sem JID novo, então conflito antigo não trava.
create or replace function public.reordenar_campanha(
  p_tenant uuid,
  p_campanha uuid,
  p_esperado text[],
  p_nova text[]
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual text[];
begin
  select group_ids
    into v_atual
    from public.campaign_groups
   where id = p_campanha
     and tenant_id = p_tenant
     for update;

  if not found
     or p_esperado is null
     or p_nova is null
     or cardinality(p_nova) <> (select count(distinct x) from unnest(p_nova) as x)
     or array(select distinct x from unnest(coalesce(v_atual, '{}')) as x order by 1)
        is distinct from array(select distinct x from unnest(p_esperado) as x order by 1)
     or array(select x from unnest(p_nova) as x order by 1)
        is distinct from array(select distinct x from unnest(p_esperado) as x order by 1)
  then
    return false;
  end if;

  update public.campaign_groups
     set group_ids = p_nova
   where id = p_campanha
     and tenant_id = p_tenant;

  return true;
end;
$$;

-- 4) Só o service-role chama (o default privilege do grantor postgres dá EXECUTE a authenticated em
--    toda função nova de public).
revoke all on function public.grupos_em_mais_de_uma_campanha(uuid) from public, anon, authenticated;
grant execute on function public.grupos_em_mais_de_uma_campanha(uuid) to service_role;
revoke all on function public.reordenar_campanha(uuid, uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.reordenar_campanha(uuid, uuid, text[], text[]) to service_role;
```

- [ ] **Step 4: `apply-order.txt`** — acrescentar ao **fim** do arquivo (depois da entrada de `20261010120000`), exatamente:

```txt
# 2026-10-10 - Postar por grupo, PR 6: um grupo, uma campanha. Trigger campaign_groups_grupo_exclusivo
# (app.campaign_groups_grupo_exclusivo) recusa JID NOVO que ja esta em outra campanha da loja
# (unique_violation 'grupo_em_outra_campanha:<jid>:<id>'); grupos_em_mais_de_uma_campanha(p_tenant)
# lista os conflitos antigos e reordenar_campanha grava a ordem nova so se a lista nao mudou
# (execute so service_role). Depois de 20261010120000. Muda a baseline (dois f|). O gate nao ve
# trigger, schema app, ACL nem corpo — conferir com infra/tests/grupo-uma-campanha-check.sql nos
# dois bancos.
apps/web/supabase/migrations/20261010130000_grupo_uma_campanha.sql
```

- [ ] **Step 5: o script da baseline.** As duas chaves novas são calculáveis sem banco (a fórmula de `schema_signature()`); o mesmo script, com o check de **prod** (Task 10), prova o arquivo inteiro. Crie com a ferramenta Write `C:\Users\Igor\AppData\Local\Temp\baseline-pr6.mjs`:

```js
// node baseline-pr6.mjs [check-prod.json]   (cwd = raiz do worktree)
// Sem argumento: põe as duas chaves do PR 6 em deploy/supabase/schema-baseline.json, na posição da
// ordem do arquivo, sem mexer nas outras nem em gerado_em (só duas chaves foram calculadas — não
// houve snapshot novo). Com o check de PROD: confere o arquivo inteiro contra prod e sai 1 se divergir.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BASELINE = "deploy/supabase/schema-baseline.json";
const md5 = (s) => createHash("md5").update(s).digest("hex");
// sig = md5(pg_get_function_result || '|secdef=' || prosecdef || '|vol=' || provolatile)
const NOVAS = {
  "f|grupos_em_mais_de_uma_campanha(p_tenant uuid)": md5(
    "TABLE(whatsapp_group_id text, name text, campanhas jsonb)|secdef=true|vol=s",
  ),
  "f|reordenar_campanha(p_tenant uuid, p_campanha uuid, p_esperado text[], p_nova text[])": md5(
    "boolean|secdef=true|vol=v",
  ),
};

const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const entradas = Object.entries(base.objetos).filter(([k]) => !(k in NOVAS));
for (const [chave, sig] of Object.entries(NOVAS)) {
  const i = entradas.findIndex(([k]) => k.localeCompare(chave) > 0);
  entradas.splice(i < 0 ? entradas.length : i, 0, [chave, sig]);
}
const objetos = Object.fromEntries(entradas);
writeFileSync(BASELINE, `${JSON.stringify({ ...base, objetos }, null, 2)}\n`, "utf8");

// Ordem de code point = collate "C" do Postgres (as chaves são ASCII).
const chaves = Object.keys(objetos).sort();
const total = md5(chaves.map((k) => `${k}=${objetos[k]}`).join(","));
console.log(`baseline: ${chaves.length} objetos, md5 ${total}`);

if (process.argv[2]) {
  const prod = JSON.parse(readFileSync(process.argv[2], "utf8"));
  for (const [k, v] of Object.entries(NOVAS)) {
    if (prod.assinatura?.[k] !== v) {
      console.error(`prod diverge em ${k}: ${prod.assinatura?.[k]} != ${v}`);
      process.exit(1);
    }
  }
  if (total !== prod.assinatura_total?.md5 || chaves.length !== prod.assinatura_total?.objetos) {
    console.error(
      `NAO bate com prod: aqui ${chaves.length}/${total}, prod ${prod.assinatura_total?.objetos}/${prod.assinatura_total?.md5}.`,
    );
    console.error("Outra coisa mudou em prod desde a baseline da main — investigar, nao forcar.");
    process.exit(1);
  }
  console.log("= prod");
}
```

- [ ] **Step 6: rodar o script.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && node C:/Users/Igor/AppData/Local/Temp/baseline-pr6.mjs && git -C "$WT" diff --stat deploy/supabase/schema-baseline.json && git -C "$WT" diff deploy/supabase/schema-baseline.json | grep -E '^[+-] '
```

Esperado: `1 file changed, 2 insertions(+)` e as duas linhas `+` com `d4b914108a3146913b311ff40fea570c` e `e2129f5f932794247606386523d5715e`. Qualquer outra linha `+`/`-` = o arquivo da `main` não está na disposição do gerador: `git -C "$WT" checkout -- deploy/supabase/schema-baseline.json` e pare para perguntar ao Igor (não edite à mão).

- [ ] **Step 7: os testes que varrem a `apply-order`** (ACL das definer e transações de captura):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/supabase/privilegio-definer.test.ts src/lib/pages/capture-transaction.test.ts
```

Esperado: PASS (`# fail 0`). Falha em `privilegio-definer` = faltou `revoke … from … authenticated` numa das duas funções `public`.

- [ ] **Step 8: commit.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/supabase/migrations/20261010130000_grupo_uma_campanha.sql infra/tests/grupo-uma-campanha-check.sql deploy/supabase/apply-order.txt deploy/supabase/schema-baseline.json
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" diff --cached --stat
```

Esperado: os 4 arquivos.

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" commit -F - <<'EOF'
feat(db): one group per campaign trigger, conflicts list and guarded reorder

campaign_groups_grupo_exclusivo refuses a NEW whatsapp id that is already
in another campaign of the same tenant (unique_violation,
grupo_em_outra_campanha:<jid>:<id>); existing duplicates never block.
grupos_em_mais_de_uma_campanha lists them; reordenar_campanha writes a new
order only when the list is unchanged and the new one is a permutation.
Both RPCs are service_role only. Post-apply check in infra/tests; baseline
gets the two new function signatures.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4: store — conflitos, reordenar e remover (TDD, PostgREST falso)

**Files:**
- Create: `apps/web/src/lib/stores/campaign-groups.test.ts`
- Modify: `apps/web/src/lib/stores/campaign-groups.ts`

**Depends-on:** Task 2

**Interfaces:**
- Consumes: `ConflitoDeGrupo`, `lerConflitoGrupo` (Task 2); RPCs da Task 3 e `campaign_group_remove_group_id`.
- Produces (contrato, exatamente):
  - `listarConflitos(tenantId: string): Promise<Array<{ whatsappGroupId: string; nome: string; campanhas: Array<{ id: string; name: string; slug: string; posicao: number }> }>>`
  - `reordenarCampanha(tenantId: string, campaignId: string, esperado: string[], nova: string[]): Promise<boolean>` (consumida pelo PR 8)
  - `removeGroupId(tenantId: string, id: string, whatsappGroupId: string): Promise<void>` (Task 6)

- [ ] **Step 1: escrever o teste** — `apps/web/src/lib/stores/campaign-groups.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { lerConflitoGrupo } from "@/lib/campaigns/conflito-grupo";
import {
  appendGroupId,
  createCampaignGroup,
  listarConflitos,
  removeGroupId,
  reordenarCampanha,
} from "./campaign-groups";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (desenho de
 * `campaign-activity.test.ts`): prova, sem banco, que as RPCs do PR 6 levam a loja no corpo e
 * que a mensagem do trigger chega inteira até a rota — é ela que vira o 409.
 */

type Pedido = { metodo: string; caminho: string; corpo: unknown };

const pedidos: Pedido[] = [];
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: [] };

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => {
    bruto += parte.toString("utf8");
  });
  req.on("end", () => {
    pedidos.push({
      metodo: req.method ?? "",
      caminho: new URL(req.url ?? "/", "http://postgrest.falso").pathname,
      corpo: bruto ? JSON.parse(bruto) : null,
    });
    res.statusCode = resposta.status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(resposta.corpo));
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

function responder(status: number, corpo: unknown) {
  pedidos.length = 0;
  resposta = { status, corpo };
}

const A1 = "6a7e0000-0000-4000-8000-0000000000a1";
// 409 é o que o PostgREST devolve para unique_violation (23505). Não usar 503/520: o
// postgrest-js repete com espera.
const RECUSA = {
  code: "23505",
  details: null,
  hint: null,
  message: `grupo_em_outra_campanha:120363001@g.us:${A1}`,
};

test("listarConflitos chama a RPC com a loja e devolve o formato do contrato", async () => {
  responder(200, [
    {
      whatsapp_group_id: "g3@g.us",
      name: "Grupo VIP",
      campanhas: [
        { id: "a2", name: "Check A2", slug: "check-a2", posicao: 2 },
        { id: "a4", name: "Check A4", slug: "check-a4", posicao: "3" },
      ],
    },
    {
      whatsapp_group_id: "g8@g.us",
      name: null,
      campanhas: [
        { id: "a2", name: "Check A2", slug: "check-a2", posicao: 1 },
        { id: "a4", name: "Check A4", slug: "check-a4", posicao: 1 },
      ],
    },
  ]);

  assert.deepEqual(await listarConflitos("loja-a"), [
    {
      whatsappGroupId: "g3@g.us",
      nome: "Grupo VIP",
      campanhas: [
        { id: "a2", name: "Check A2", slug: "check-a2", posicao: 2 },
        { id: "a4", name: "Check A4", slug: "check-a4", posicao: 3 },
      ],
    },
    {
      whatsappGroupId: "g8@g.us",
      nome: "g8@g.us",
      campanhas: [
        { id: "a2", name: "Check A2", slug: "check-a2", posicao: 1 },
        { id: "a4", name: "Check A4", slug: "check-a4", posicao: 1 },
      ],
    },
  ]);
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/grupos_em_mais_de_uma_campanha");
  // Mutante: sem p_tenant a RPC nem existe com essa assinatura; com outro tenant, lista outra loja.
  assert.deepEqual(pedidos[0].corpo, { p_tenant: "loja-a" });
});

test("reordenarCampanha manda os quatro parâmetros e só é true quando a RPC diz true", async () => {
  responder(200, true);
  assert.equal(await reordenarCampanha("loja-a", A1, ["g1", "g2"], ["g2", "g1"]), true);
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/reordenar_campanha");
  assert.deepEqual(pedidos[0].corpo, {
    p_tenant: "loja-a",
    p_campanha: A1,
    p_esperado: ["g1", "g2"],
    p_nova: ["g2", "g1"],
  });

  responder(200, false);
  assert.equal(await reordenarCampanha("loja-a", A1, ["g1"], ["g1"]), false);
});

test("removeGroupId tira o grupo pela RPC atômica, com a loja", async () => {
  responder(200, {});
  await removeGroupId("loja-a", A1, "g9@g.us");
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/campaign_group_remove_group_id");
  assert.deepEqual(pedidos[0].corpo, { p_tenant_id: "loja-a", p_id: A1, p_whatsapp_group_id: "g9@g.us" });
});

test("a recusa do trigger chega inteira na rota, no insert e no append", async () => {
  responder(409, RECUSA);
  const noInsert = await createCampaignGroup("loja-a", {
    name: "Nova",
    slug: "nova",
    group_ids: ["120363001@g.us"],
  }).then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(noInsert instanceof Error);
  assert.deepEqual(lerConflitoGrupo(noInsert.message), { jid: "120363001@g.us", campanhaId: A1 });
  assert.equal(pedidos[0].caminho, "/rest/v1/campaign_groups");
  const linha = Array.isArray(pedidos[0].corpo) ? pedidos[0].corpo[0] : pedidos[0].corpo;
  assert.equal((linha as { tenant_id?: string }).tenant_id, "loja-a");

  responder(409, RECUSA);
  const noAppend = await appendGroupId("loja-a", A1, "120363001@g.us").then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(noAppend instanceof Error);
  assert.deepEqual(lerConflitoGrupo(noAppend.message), { jid: "120363001@g.us", campanhaId: A1 });
});

test("erro da RPC de conflitos sobe — a rota responde 500, nunca uma lista vazia", async () => {
  responder(404, {
    code: "PGRST202",
    details: null,
    hint: null,
    message: "Could not find the function public.grupos_em_mais_de_uma_campanha(p_tenant) in the schema cache",
  });
  await assert.rejects(listarConflitos("loja-a"), /grupos_em_mais_de_uma_campanha/);
});
```

- [ ] **Step 2: RED.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/campaign-groups.test.ts
```

Esperado: FAIL — `listarConflitos`/`reordenarCampanha`/`removeGroupId` não existem.

- [ ] **Step 3: implementar.** Em `apps/web/src/lib/stores/campaign-groups.ts`, troque

```ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
```

por

```ts
import "server-only";
import type { ConflitoDeGrupo } from "@/lib/campaigns/conflito-grupo";
import { getSupabaseAdmin } from "@/lib/supabase/server";
```

e, logo depois da função `appendGroupId` (antes de `deleteCampaignGroup`), acrescente:

```ts
/** Par de `appendGroupId`: tira 1 id de `group_ids` num UPDATE só (`campaign_group_remove_group_id`). */
export async function removeGroupId(tenantId: string, id: string, whatsappGroupId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("campaign_group_remove_group_id", {
    p_tenant_id: tenantId,
    p_id: id,
    p_whatsapp_group_id: whatsappGroupId,
  });
  if (error) throw new Error(error.message);
}

type ConflitoRow = {
  whatsapp_group_id: string;
  name: string | null;
  campanhas: Array<{ id: string; name: string; slug: string; posicao: number | string }> | null;
};

/**
 * Grupos que estão em mais de uma campanha da loja (`grupos_em_mais_de_uma_campanha`, PR 6). São
 * todos de antes do trigger `campaign_groups_grupo_exclusivo`, que recusa conflito novo.
 */
export async function listarConflitos(tenantId: string): Promise<ConflitoDeGrupo[]> {
  const { data, error } = await getSupabaseAdmin().rpc("grupos_em_mais_de_uma_campanha", { p_tenant: tenantId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ConflitoRow[]).map((r) => ({
    whatsappGroupId: r.whatsapp_group_id,
    nome: r.name ?? r.whatsapp_group_id,
    campanhas: (r.campanhas ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      posicao: Number(c.posicao),
    })),
  }));
}

/**
 * Grava a ordem nova só se a lista atual tem o mesmo conjunto que `esperado` e `nova` é uma
 * permutação dele (`reordenar_campanha`). `false` = a lista mudou no meio (o auto-grow anexou um
 * grupo) — quem chama responde 409 (Padronizar, PR 8).
 */
export async function reordenarCampanha(
  tenantId: string,
  campaignId: string,
  esperado: string[],
  nova: string[],
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("reordenar_campanha", {
    p_tenant: tenantId,
    p_campanha: campaignId,
    p_esperado: esperado,
    p_nova: nova,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
```

- [ ] **Step 4: GREEN.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/campaign-groups.test.ts
```

Esperado: `# pass 5`, `# fail 0`.

- [ ] **Step 5: o mutante do tenant morre.** Troque temporariamente `{ p_tenant: tenantId }` por `{ p_tenant: "outra" }` em `listarConflitos`, rode o Step 4 — tem de falhar no primeiro teste —, e desfaça (memória `pattern-teste-de-integracao-mata-mutante`):

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" diff --stat apps/web/src/lib/stores/campaign-groups.ts
```

Esperado depois de desfazer: só o diff do Step 3 (`1 file changed, ~60 insertions(+)`).

- [ ] **Step 6: commit.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/src/lib/stores/campaign-groups.ts apps/web/src/lib/stores/campaign-groups.test.ts
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" diff --cached --stat
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" commit -F - <<'EOF'
feat(campaigns): store wrappers for conflicts, guarded reorder and group removal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 5: a recusa vira 409 nas rotas, e o espelho de comunidade não é recusado

**Files:**
- Create: `apps/web/src/lib/campaigns/conflito-grupo-409.ts`
- Modify: `apps/web/src/app/api/campanhas/route.ts`
- Modify: `apps/web/src/app/api/comunidades/[slug]/grupos/route.ts`
- Modify: `apps/web/src/lib/stores/communities.ts`

**Depends-on:** Task 2, Task 4

**Interfaces:**
- Consumes: `lerConflitoGrupo`, `mensagemConflito`, `gruposDoEspelho` (Task 2); `getCampaignGroupById` (existente).
- Produces: `respostaConflitoGrupo(tenantId: string, erro: unknown): Promise<Response | null>`; POST/PATCH `/api/campanhas` e POST `/api/comunidades/[slug]/grupos` respondem **409** `{ error: string; grupo: string; campanha: { id: string; name: string } }` (contrato §4) quando o trigger recusa.

Decisão por escritor de `group_ids` (achados com `grep -rn "group_ids\|appendGroupId\|campaign_group_append_group_id\|createCampaignGroup\|updateCampaignGroup" apps/web/src apps/worker/src`):

| Escritor | Decisão |
|---|---|
| `POST /api/campanhas` (`createCampaignGroup`) | 409 |
| `PATCH /api/campanhas` (`updateCampaignGroup` com `group_ids`) | 409 |
| `POST /api/comunidades/[slug]/grupos` (`vincularGrupo` → append) | 409 (a tela de comunidades já mostra `data.error`) |
| `espelharComunidadesNativas` (insert/update da gaveta no `after()` do sync) | filtra com `gruposDoEspelho` antes de escrever |
| `ackGrowJob` → `appendGroupId` (auto-grow) | sem mudança: grupo recém-criado não pode conflitar |
| `DELETE /api/comunidades/[slug]/grupos`, `POST /api/campanhas/conflitos` (remove) | remover nunca é recusado |
| `identidade/route.ts`, `rename-slug.ts` (`updateCampaignGroup` sem `group_ids`) | o trigger não dispara (`update of group_ids`) |
| `apps/worker/src/grow-tenants.ts` | só lê |

- [ ] **Step 1: o adaptador** — `apps/web/src/lib/campaigns/conflito-grupo-409.ts`:

```ts
import "server-only";
import { lerConflitoGrupo, mensagemConflito } from "@/lib/campaigns/conflito-grupo";
import { getCampaignGroupById } from "@/lib/stores/campaign-groups";

/**
 * O 409 do contrato (`{ error, grupo, campanha: { id, name } }`) quando o erro é a recusa do
 * trigger `campaign_groups_grupo_exclusivo`; `null` para qualquer outro erro, que o chamador
 * relança. Usado por POST/PATCH /api/campanhas e POST /api/comunidades/[slug]/grupos.
 */
export async function respostaConflitoGrupo(tenantId: string, erro: unknown): Promise<Response | null> {
  const conflito = lerConflitoGrupo(erro instanceof Error ? erro.message : String(erro));
  if (!conflito) return null;
  // A outra campanha é da mesma loja (o trigger só compara dentro do tenant). Sem o nome a
  // resposta continua 409: falhar esta leitura não pode virar 500 de um erro já entendido.
  const outra = await getCampaignGroupById(tenantId, conflito.campanhaId).catch((e: unknown) => {
    console.error("[conflito-grupo] nome da outra campanha:", e);
    return null;
  });
  const name = outra?.name ?? "outra campanha";
  return Response.json(
    { error: mensagemConflito(null, name), grupo: conflito.jid, campanha: { id: conflito.campanhaId, name } },
    { status: 409 },
  );
}
```

- [ ] **Step 2: `api/campanhas/route.ts` — import.** Troque

```ts
import { COMUNIDADE_NATIVA_MENSAGEM } from "@/lib/communities/validation";
```

por

```ts
import { COMUNIDADE_NATIVA_MENSAGEM } from "@/lib/communities/validation";
import { respostaConflitoGrupo } from "@/lib/campaigns/conflito-grupo-409";
```

- [ ] **Step 3: POST.** Troque

```ts
  const rec = await supaStore.createCampaignGroup(tenantId, {
    name,
    slug,
    group_ids: Array.isArray(b.groupIds) ? b.groupIds.map(String) : [],
    auto_grow: b.autoGrow === true,
    grow_template: b.growTemplate as Record<string, unknown> | undefined,
  });
```

por

```ts
  let rec: supaStore.CampaignGroup;
  try {
    rec = await supaStore.createCampaignGroup(tenantId, {
      name,
      slug,
      group_ids: Array.isArray(b.groupIds) ? b.groupIds.map(String) : [],
      auto_grow: b.autoGrow === true,
      grow_template: b.growTemplate as Record<string, unknown> | undefined,
    });
  } catch (e) {
    // Um grupo, uma campanha: o trigger recusou grupo que já está em outra campanha.
    const conflito = await respostaConflitoGrupo(tenantId, e);
    if (conflito) return conflito;
    throw e;
  }
```

- [ ] **Step 4: PATCH.** Troque

```ts
  const updated = await supaStore.updateCampaignGroup(tenantId, id, patch);
  if (!updated) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
```

por

```ts
  let updated: supaStore.CampaignGroup | null;
  try {
    updated = await supaStore.updateCampaignGroup(tenantId, id, patch);
  } catch (e) {
    // Um grupo, uma campanha. Se este PATCH também trocou o link (acima), a troca já valeu: o
    // antigo vira apelido (rename-slug.ts) e repetir o PATCH é no-op no link. O seletor trava os
    // grupos de outra campanha, então isto só acontece em corrida.
    const conflito = await respostaConflitoGrupo(tenantId, e);
    if (conflito) return conflito;
    throw e;
  }
  if (!updated) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
```

- [ ] **Step 5: `api/comunidades/[slug]/grupos/route.ts`.** Troque

```ts
import { COMUNIDADE_NATIVA_MENSAGEM, validarWhatsappGroupId } from "@/lib/communities/validation";
```

por

```ts
import { COMUNIDADE_NATIVA_MENSAGEM, validarWhatsappGroupId } from "@/lib/communities/validation";
import { respostaConflitoGrupo } from "@/lib/campaigns/conflito-grupo-409";
```

e troque

```ts
    await vincularGrupo(ctx.tenantId, slug, lido.whatsappGroupId);
    return Response.json({ ok: true });
```

por

```ts
    try {
      await vincularGrupo(ctx.tenantId, slug, lido.whatsappGroupId);
    } catch (e) {
      // Um grupo, uma campanha: o append passa pelo trigger campaign_groups_grupo_exclusivo.
      const conflito = await respostaConflitoGrupo(ctx.tenantId, e);
      if (conflito) return conflito;
      throw e;
    }
    return Response.json({ ok: true });
```

- [ ] **Step 6: espelho de comunidade nativa (`lib/stores/communities.ts`).** Troque

```ts
import type { PapelComunidade } from "@/lib/communities/papel";
```

por

```ts
import type { PapelComunidade } from "@/lib/communities/papel";
import { gruposDoEspelho } from "@/lib/campaigns/conflito-grupo";
```

troque

```ts
  // Uma leitura só, antes do laço: cada slug que este laço cria entra no
  // mesmo Set, então uma comunidade nova nunca colide com a que acabou de
  // nascer duas iterações atrás. Consultar `listarComunidades` a cada volta
  // seria uma query por comunidade sem ganho nenhum.
  const slugsEmUso = new Set((await listarComunidades(tid)).map((c) => c.slug));

  let tocadas = 0;
  for (const nativa of nativas) {
    const ja = porJid.get(nativa.communityJid);
    if (ja) {
      const { error } = await getSupabaseAdmin()
        .from(TABLE)
        .update({ name: nativa.nome, group_ids: nativa.memberGroupIds })
```

por

```ts
  // Uma leitura só, antes do laço: cada slug que este laço cria entra no
  // mesmo Set, então uma comunidade nova nunca colide com a que acabou de
  // nascer duas iterações atrás. Consultar `listarComunidades` a cada volta
  // seria uma query por comunidade sem ganho nenhum. A mesma leitura traz os
  // `group_ids` de todas as campanhas para o filtro de um grupo, uma campanha.
  const todas = await listarComunidades(tid);
  const slugsEmUso = new Set(todas.map((c) => c.slug));

  let tocadas = 0;
  for (const nativa of nativas) {
    const ja = porJid.get(nativa.communityJid);
    // Um grupo, uma campanha: grupo que já está em outra campanha não entra
    // na gaveta (o que ela já tinha continua). Sem isto o trigger
    // campaign_groups_grupo_exclusivo recusaria a escrita inteira e esta
    // comunidade pararia de espelhar a cada sync, só com log.
    const grupos = gruposDoEspelho(nativa.memberGroupIds, todas, ja?.id ?? null);
    if (ja) {
      const { error } = await getSupabaseAdmin()
        .from(TABLE)
        .update({ name: nativa.nome, group_ids: grupos })
```

e, no `insert` logo abaixo, troque

```ts
          group_ids: nativa.memberGroupIds,
```

por

```ts
          group_ids: grupos,
```

- [ ] **Step 7: tipos e testes vizinhos.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsc --noEmit -p tsconfig.json && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/communities.test.ts src/lib/campaigns/conflito-grupo.test.ts src/app/api/campanhas/campanhas.integracoes.test.ts
```

Esperado: `tsc` sem saída; testes `# fail 0`. Erro de "used before being assigned" em `rec`/`updated` = o `catch` não está terminando em `return`/`throw` — confira os Steps 3 e 4.

- [ ] **Step 8: commit.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/src/lib/campaigns/conflito-grupo-409.ts apps/web/src/app/api/campanhas/route.ts "apps/web/src/app/api/comunidades/[slug]/grupos/route.ts" apps/web/src/lib/stores/communities.ts
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" diff --cached --stat
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" commit -F - <<'EOF'
feat(campanhas): map the exclusive-group trigger to a 409 and keep the native mirror writable

POST/PATCH /api/campanhas and POST /api/comunidades/[slug]/grupos return
409 { error, grupo, campanha } when the trigger refuses. The native
community mirror drops groups that already belong to another campaign
(keeping what the drawer already had) instead of being refused whole on
every sync.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 6: `GET/POST /api/campanhas/conflitos`

**Files:**
- Create: `apps/web/src/app/api/campanhas/conflitos/route.ts`

**Depends-on:** Task 2, Task 4

**Interfaces:**
- Consumes: `lerEscolha`, `planejarEscolha` (Task 2); `listCampaignGroups` (existente), `listarConflitos`, `removeGroupId` (Task 4).
- Produces (contrato §4): `GET /api/campanhas/conflitos` → `{ conflitos: ConflitoDeGrupo[] }`; `POST /api/campanhas/conflitos` corpo `{ jid: string; ficaEm: string }` → 200 `{ ok: true }`, 400/404/409 `{ error }`. Exige `campaign:edit` no POST.

- [ ] **Step 1: a rota** — `apps/web/src/app/api/campanhas/conflitos/route.ts`:

```ts
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { assertPermission } from "@/lib/permissions";
import { lerEscolha, planejarEscolha } from "@/lib/campaigns/conflito-grupo";
import { listCampaignGroups, listarConflitos, removeGroupId } from "@/lib/stores/campaign-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campanhas/conflitos → { conflitos }
 *
 * Grupos que estão em mais de uma campanha da loja (spec 2026-10-10-postar-por-grupo §6.6, D4).
 * São todos de antes do trigger `campaign_groups_grupo_exclusivo`, que recusa conflito novo.
 * Nada sai sozinho: o lojista escolhe no POST.
 */
export async function GET(req: Request) {
  try {
    const { tenantId } = await getTenantContext(req);
    return Response.json({ conflitos: await listarConflitos(tenantId) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/conflitos] falha ao listar:", error);
    return Response.json({ error: "Não deu pra carregar os grupos em duas campanhas." }, { status: 500 });
  }
}

/**
 * POST /api/campanhas/conflitos — body { jid, ficaEm } → { ok: true }
 *
 * O grupo fica em `ficaEm` e sai de toda outra campanha da loja que o tem, pela RPC atômica
 * `campaign_group_remove_group_id` (remover nunca é recusado pelo trigger). Recusa (409) quando
 * `ficaEm` não tem mais o grupo — senão ele ficaria sem campanha nenhuma.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "campaign:edit");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }
    const escolha = lerEscolha(body);
    if (!escolha.ok) return Response.json({ error: escolha.error }, { status: 400 });

    const plano = planejarEscolha(await listCampaignGroups(ctx.tenantId), escolha);
    if (!plano.ok) return Response.json({ error: plano.error }, { status: plano.status });

    for (const campanhaId of plano.tirarDe) {
      await removeGroupId(ctx.tenantId, campanhaId, escolha.jid);
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/conflitos] falha ao salvar a escolha:", error);
    return Response.json({ error: "Não deu pra salvar a escolha." }, { status: 500 });
  }
}
```

- [ ] **Step 2: tipos.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsc --noEmit -p tsconfig.json
```

Esperado: sem saída. (O comportamento da rota é a soma de `lerEscolha`/`planejarEscolha`, testados na Task 2, e das funções de store testadas na Task 4; a tela da Task 8 a exercita pelo e2e.)

- [ ] **Step 3: commit.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/src/app/api/campanhas/conflitos/route.ts
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" diff --cached --stat
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" commit -F - <<'EOF'
feat(campanhas): conflicts API to choose where a shared group stays

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 7: seletor de grupos trava grupo de outra campanha

**Files:**
- Modify: `apps/web/src/components/painel/campaign-config.tsx`

**Depends-on:** Task 2

**Interfaces:**
- Consumes: `travasDoSeletor`, `lerCorpo409`, `mensagemConflito`, `Conflito409` (Task 2); `GET /api/campanhas` (já devolve `id`, `name`, `groupIds` de toda campanha, gavetas incluídas).
- Produces: cada opção do seletor tem `data-testid="grupo-opcao-<jid>"` e `aria-pressed`; grupo de outra campanha (que esta ainda não tem) fica `disabled` com "já está em <Nome>"; "Selecionar todos" ignora os travados; 409 no salvar trava o grupo e mostra "O grupo “X” já está na campanha “Y”…". Consumido pelo e2e da Task 8.

- [ ] **Step 1: import.** Troque

```ts
import { campaignLinkPath } from "@/lib/custom-domains/host";
```

por

```ts
import { campaignLinkPath } from "@/lib/custom-domains/host";
import { lerCorpo409, mensagemConflito, travasDoSeletor, type Conflito409 } from "@/lib/campaigns/conflito-grupo";
```

- [ ] **Step 2: o erro de requisição carrega o 409.** Troque

```ts
class RequestError extends Error {
  readonly upgradeUrl: string | null;
  constructor(message: string, upgradeUrl: string | null) {
    super(message);
    this.upgradeUrl = upgradeUrl;
  }
}

async function toRequestError(res: Response, fallback: string): Promise<RequestError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; upgradeUrl?: string };
  return new RequestError(body?.error ?? fallback, body?.upgradeUrl ?? null);
}
```

por

```ts
class RequestError extends Error {
  readonly upgradeUrl: string | null;
  /** Só no 409 de grupo que já está em outra campanha (um grupo, uma campanha). */
  readonly conflito: Conflito409 | null;
  constructor(message: string, upgradeUrl: string | null, conflito: Conflito409 | null = null) {
    super(message);
    this.upgradeUrl = upgradeUrl;
    this.conflito = conflito;
  }
}

async function toRequestError(res: Response, fallback: string): Promise<RequestError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; upgradeUrl?: string };
  return new RequestError(body?.error ?? fallback, body?.upgradeUrl ?? null, lerCorpo409(body));
}
```

- [ ] **Step 3: estado.** Troque

```ts
  const [groupSearch, setGroupSearch] = useState("");
```

por

```ts
  const [groupSearch, setGroupSearch] = useState("");
  // Um grupo, uma campanha: JID → nome da OUTRA campanha que já tem o grupo.
  const [travas, setTravas] = useState<Map<string, string>>(() => new Map());
```

- [ ] **Step 4: carregar as campanhas nos dois modos.** Troque

```ts
      try {
        const g = await fetch("/api/groups").then((r) => r.json()).catch(() => []);
        setGroups(Array.isArray(g) ? g : []);
        if (mode === "create") {
```

por

```ts
      try {
        const [g, lista] = await Promise.all([
          fetch("/api/groups").then((r) => r.json()).catch(() => []),
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
        ]);
        setGroups(Array.isArray(g) ? g : []);
        const campanhas: Campanha[] = Array.isArray(lista) ? lista : [];
        // Grupo de OUTRA campanha aparece travado (o banco recusaria). Na criação toda campanha é
        // "outra"; na edição o recorte certo entra logo abaixo, quando a campanha é achada.
        setTravas(travasDoSeletor(campanhas, { id: null, groupIds: [] }));
        if (mode === "create") {
```

e troque

```ts
        if (mode === "edit" && slug) {
          const list: Campanha[] = await fetch("/api/campanhas").then((r) => r.json()).catch(() => []);
          const c = Array.isArray(list) ? list.find((x) => x.slug === slug || x.id === slug) : null;
          if (c) {
            setId(c.id);
```

por

```ts
        if (mode === "edit" && slug) {
          const c = campanhas.find((x) => x.slug === slug || x.id === slug);
          if (c) {
            setId(c.id);
            setTravas(travasDoSeletor(campanhas, { id: c.id, groupIds: c.groupIds ?? [] }));
```

- [ ] **Step 5: 409 no salvar.** Troque

```ts
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
      setUpgradeUrl(e instanceof RequestError ? e.upgradeUrl : null);
      setSaving(false);
    }
```

por

```ts
    } catch (e) {
      const conflito = e instanceof RequestError ? e.conflito : null;
      if (conflito) {
        // Corrida: outro lugar pôs o grupo noutra campanha depois que a tela carregou. Ele passa a
        // aparecer travado — ainda dá para desmarcar, não dá para marcar de novo.
        setTravas((t) => new Map(t).set(conflito.grupo, conflito.campanha.name));
        setError(
          mensagemConflito(groups.find((g) => g.id === conflito.grupo)?.name ?? null, conflito.campanha.name),
        );
      } else {
        setError(e instanceof Error ? e.message : "Erro inesperado.");
      }
      setUpgradeUrl(e instanceof RequestError ? e.upgradeUrl : null);
      setSaving(false);
    }
```

- [ ] **Step 6: "Selecionar todos" ignora os travados.** Troque

```ts
  const allFilteredSelected = filteredGroups.length > 0 && filteredGroups.every((g) => selected.has(g.id));
  const toggleSelectAllFiltered = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allFilteredSelected) filteredGroups.forEach((g) => n.delete(g.id));
      else filteredGroups.forEach((g) => n.add(g.id));
      return n;
    });
```

por

```ts
  // Travado = está em outra campanha e não está marcado aqui. Marcado continua clicável: é o
  // caminho para desmarcar depois de um 409.
  const travado = (gid: string) => travas.has(gid) && !selected.has(gid);
  const selecionaveis = filteredGroups.filter((g) => !travado(g.id));
  const allFilteredSelected = selecionaveis.length > 0 && selecionaveis.every((g) => selected.has(g.id));
  const toggleSelectAllFiltered = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allFilteredSelected) selecionaveis.forEach((g) => n.delete(g.id));
      else selecionaveis.forEach((g) => n.add(g.id));
      return n;
    });
```

e, no botão "Selecionar todos", troque

```tsx
                disabled={filteredGroups.length === 0}
```

por

```tsx
                disabled={selecionaveis.length === 0}
```

- [ ] **Step 7: a opção travada.** Troque

```tsx
              {filteredGroups.map((g) => {
                const sel = selected.has(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggle(g.id)}
                    className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color] duration-[160ms] ease-[var(--ease-fluxo)]", sel ? "border-cobalt-500 bg-cobalt-500/[0.05]" : "border-volt-950/[0.08] bg-papel hover:border-cobalt-500/30")}
                  >
```

por

```tsx
              {filteredGroups.map((g) => {
                const sel = selected.has(g.id);
                const emOutra = travas.get(g.id);
                const trava = travado(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    data-testid={`grupo-opcao-${g.id}`}
                    aria-pressed={sel}
                    disabled={trava}
                    onClick={() => toggle(g.id)}
                    className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color] duration-[160ms] ease-[var(--ease-fluxo)]", sel ? "border-cobalt-500 bg-cobalt-500/[0.05]" : "border-volt-950/[0.08] bg-papel hover:border-cobalt-500/30", trava && "cursor-not-allowed opacity-60 hover:border-volt-950/[0.08]")}
                  >
```

e troque

```tsx
                      <p className="font-data text-12 tabular-nums text-aco">{g.members?.toLocaleString("pt-BR") ?? 0} membros{!g.inviteUrl ? " · sem convite" : ""}</p>
                    </div>
```

por

```tsx
                      <p className="font-data text-12 tabular-nums text-aco">{g.members?.toLocaleString("pt-BR") ?? 0} membros{!g.inviteUrl ? " · sem convite" : ""}</p>
                      {emOutra && <p className="truncate text-12 text-aco">já está em {emOutra}</p>}
                    </div>
```

- [ ] **Step 8: tipos e lint do arquivo.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsc --noEmit -p tsconfig.json && npx eslint src/components/painel/campaign-config.tsx
```

Esperado: sem saída.

- [ ] **Step 9: commit.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/src/components/painel/campaign-config.tsx
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" diff --cached --stat
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" commit -F - <<'EOF'
feat(painel): lock groups that already belong to another campaign in the picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 8: tela de conflitos, faixa da aba Grupos e e2e

**Files:**
- Create: `apps/web/src/app/painel/campanhas/conflitos/page.tsx`
- Create: `apps/web/src/components/painel/campanhas/aviso-conflitos.tsx`
- Modify: `apps/web/src/app/painel/campanhas/[slug]/page.tsx`
- Create: `apps/web/e2e/painel-campanha-grupo-exclusivo.spec.ts`
- Modify: `apps/web/e2e/conteudo-esperado.ts`

**Depends-on:** Task 2, Task 6, Task 7 (o e2e cobra o seletor)

**Interfaces:**
- Consumes: `GET/POST /api/campanhas/conflitos` (Task 6), `faltaEscolher`, `avisoDaCampanha`, `ConflitoDeGrupo` (Task 2), `GET /api/groups` (membros), `data-testid="grupo-opcao-<jid>"` (Task 7).
- Produces: rota privada `/painel/campanhas/conflitos[?de=<slug>]` (o middleware já protege `/painel/*`; não é rota pública, então não entra em CSP/robots — memória `finding-rota-publica-precisa-3-registros`); `<AvisoConflitos campanhaId slug />` (`role="note"`); entrada em `CONTEUDO_ESPERADO` (a guarda de completude do smoke quebra sem ela).

- [ ] **Step 1: o e2e primeiro** — `apps/web/e2e/painel-campanha-grupo-exclusivo.spec.ts`:

```ts
import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Um grupo, uma campanha (spec 2026-10-10-postar-por-grupo §6.6, D4).
 *
 * Conflito NOVO não dá para fabricar — o trigger `campaign_groups_grupo_exclusivo` recusa. Então:
 * - o que é dado de verdade (seletor travado, 409 do POST e do PATCH) usa campanhas descartáveis
 *   criadas aqui e apagadas no fim, contra um grupo que JÁ está em alguma campanha da loja de QA
 *   (derivado de /api/campanhas e /api/groups, como painel-campanha-acoes-em-massa.spec.ts);
 * - a tela de conflitos e a faixa amarela leem `/api/campanhas/conflitos` interceptado
 *   (`page.route`), como painel-funis.spec.ts.
 * Os dois primeiros só passam com a migração 20261010130000 aplicada no banco de dev.
 */

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
type Grupo = { id: string };

exigeCredenciais();

/** Um grupo que já está em alguma campanha e aparece no seletor, com as campanhas que o têm. */
async function grupoEmCampanha(page: Page): Promise<{ jid: string; donas: Campanha[] } | null> {
  const resCampanhas = await page.request.get("/api/campanhas");
  expect(resCampanhas.ok(), `GET /api/campanhas respondeu ${resCampanhas.status()}`).toBeTruthy();
  const campanhas = (await resCampanhas.json()) as Campanha[];
  const resGrupos = await page.request.get("/api/groups");
  expect(resGrupos.ok(), `GET /api/groups respondeu ${resGrupos.status()}`).toBeTruthy();
  const noSeletor = new Set(((await resGrupos.json()) as Grupo[]).map((g) => g.id));

  for (const c of campanhas) {
    const jid = c.groupIds.find((g) => noSeletor.has(g));
    if (jid) return { jid, donas: campanhas.filter((x) => x.groupIds.includes(jid)) };
  }
  return null;
}

function criarCampanha(page: Page, nome: string, groupIds: string[] = []): Promise<APIResponse> {
  return page.request.post("/api/campanhas", {
    data: { name: `${nome} ${Date.now().toString(36)}`, groupIds },
  });
}

async function conferir409(res: APIResponse, jid: string, donas: Campanha[]) {
  expect(res.status(), "409 esperado — a migração 20261010130000 está aplicada no banco de dev?").toBe(409);
  const corpo = (await res.json()) as { error: string; grupo: string; campanha: { id: string; name: string } };
  expect(corpo.grupo).toBe(jid);
  const dona = donas.find((c) => c.id === corpo.campanha.id);
  expect(dona, `a campanha ${corpo.campanha.id} do 409 não tem o grupo ${jid}`).toBeTruthy();
  expect(corpo.campanha.name).toBe(dona?.name);
  expect(corpo.error).toContain(`“${dona?.name}”`);
}

test("o seletor trava o grupo que já está em outra campanha, com o nome dela", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const alvo = await grupoEmCampanha(page);
  test.skip(!alvo, "Nenhum grupo em campanha neste ambiente.");
  if (!alvo) return;

  const criada = await criarCampanha(page, "E2E seletor exclusivo");
  expect(criada.status(), `POST /api/campanhas respondeu ${criada.status()}`).toBe(201);
  const campanha = (await criada.json()) as Campanha;
  try {
    await page.goto(`/painel/campanhas/${campanha.slug ?? campanha.id}/editar`);
    await page.getByRole("button", { name: "Grupos", exact: true }).click();

    const opcao = page.getByTestId(`grupo-opcao-${alvo.jid}`);
    await expect(opcao).toBeDisabled();
    const texto = (await opcao.textContent()) ?? "";
    expect(
      alvo.donas.some((c) => texto.includes(`já está em ${c.name}`)),
      `"${texto}" não diz em qual campanha o grupo está`,
    ).toBeTruthy();
  } finally {
    await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

test("POST e PATCH com grupo de outra campanha respondem 409 no formato do contrato", async ({ page }) => {
  const alvo = await grupoEmCampanha(page);
  test.skip(!alvo, "Nenhum grupo em campanha neste ambiente.");
  if (!alvo) return;

  const apagar: string[] = [];
  try {
    // POST: a campanha nem nasce. (Sem o trigger ela nasceria — por isso o `apagar`.)
    const post = await criarCampanha(page, "E2E exclusivo post", [alvo.jid]);
    if (post.status() === 201) apagar.push(((await post.json()) as Campanha).id);
    await conferir409(post, alvo.jid, alvo.donas);

    // PATCH: campanha vazia tentando pegar o grupo.
    const vazia = await criarCampanha(page, "E2E exclusivo patch");
    expect(vazia.status(), `POST /api/campanhas respondeu ${vazia.status()}`).toBe(201);
    const campanha = (await vazia.json()) as Campanha;
    apagar.push(campanha.id);
    const patch = await page.request.patch("/api/campanhas", {
      data: { id: campanha.id, groupIds: [alvo.jid] },
    });
    await conferir409(patch, alvo.jid, alvo.donas);
  } finally {
    for (const id of apagar) await page.request.delete(`/api/campanhas?id=${encodeURIComponent(id)}`);
  }
});

const MODA = { id: "11111111-1111-4111-8111-111111111111", name: "Moda Kids do Sul", slug: "moda-kids-e2e" };
const SALDAO = { id: "22222222-2222-4222-8222-222222222222", name: "Saldão Outubro", slug: "saldao-e2e" };

test("a tela de conflitos só salva com todas as escolhas e manda uma por grupo", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const conflitos = [
    {
      whatsappGroupId: "e2e-vip@g.us",
      nome: "Grupo VIP Kids",
      campanhas: [{ ...MODA, posicao: 5 }, { ...SALDAO, posicao: 2 }],
    },
    {
      whatsappGroupId: "e2e-novo@g.us",
      nome: "Novo grupo",
      campanhas: [{ ...MODA, posicao: 14 }, { ...SALDAO, posicao: 4 }],
    },
  ];
  let enviados: Array<{ jid: string; ficaEm: string }> = [];
  await page.route("**/api/campanhas/conflitos", (rota) => {
    if (rota.request().method() === "POST") {
      enviados = [...enviados, rota.request().postDataJSON() as { jid: string; ficaEm: string }];
      return rota.fulfill({ json: { ok: true } });
    }
    return rota.fulfill({ json: { conflitos: enviados.length === conflitos.length ? [] : conflitos } });
  });

  await page.goto(`/painel/campanhas/conflitos?de=${MODA.slug}`);
  await expect(page.getByRole("heading", { name: "2 grupos estão em duas campanhas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Moda Kids do Sul" })).toHaveAttribute(
    "href",
    `/painel/campanhas/${MODA.slug}`,
  );

  const salvar = page.getByRole("button", { name: "Salvar escolhas" });
  await expect(salvar).toBeDisabled();
  await expect(page.getByText("Falta escolher 2 grupos.")).toBeVisible();

  await page.getByRole("group", { name: /Grupo VIP Kids/ }).getByRole("radio", { name: /Saldão Outubro/ }).check();
  await expect(page.getByText("Falta escolher 1 grupo.")).toBeVisible();
  await expect(salvar).toBeDisabled();

  await page.getByRole("group", { name: /Novo grupo/ }).getByRole("radio", { name: /Moda Kids do Sul/ }).check();
  await expect(page.getByText("Pronto: cada grupo fica em uma campanha só.")).toBeVisible();
  await salvar.click();

  await expect(page.getByRole("heading", { name: "Nenhum grupo está em duas campanhas" })).toBeVisible();
  expect(enviados).toEqual([
    { jid: "e2e-vip@g.us", ficaEm: SALDAO.id },
    { jid: "e2e-novo@g.us", ficaEm: MODA.id },
  ]);
  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

test("a aba Grupos avisa quando grupos desta campanha também estão em outra", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const res = await page.request.get("/api/campanhas");
  expect(res.ok(), `GET /api/campanhas respondeu ${res.status()}`).toBeTruthy();
  const campanha = ((await res.json()) as Campanha[]).find((c) => c.slug);
  test.skip(!campanha?.slug, "Nenhuma campanha neste ambiente.");
  if (!campanha?.slug) return;

  const aqui = { id: campanha.id, name: campanha.name, slug: campanha.slug, posicao: 1 };
  const outra = { id: "44444444-4444-4444-8444-444444444444", name: "Outra E2E", slug: "outra-e2e", posicao: 3 };
  await page.route("**/api/campanhas/conflitos", (rota) =>
    rota.fulfill({
      json: {
        conflitos: [
          { whatsappGroupId: "e2e-a@g.us", nome: "Grupo A E2E", campanhas: [aqui, { ...SALDAO, posicao: 2 }] },
          { whatsappGroupId: "e2e-b@g.us", nome: "Grupo B E2E", campanhas: [{ ...SALDAO, posicao: 1 }, aqui] },
          // Não envolve esta campanha: fica fora da conta da faixa.
          { whatsappGroupId: "e2e-c@g.us", nome: "Grupo C E2E", campanhas: [{ ...SALDAO, posicao: 4 }, outra] },
        ],
      },
    }),
  );

  await page.goto(`/painel/campanhas/${campanha.slug}`);
  await page.getByRole("button", { name: "Grupos", exact: true }).click();

  const aviso = page.getByRole("note").filter({ hasText: "desta campanha" });
  await expect(aviso).toContainText("2 grupos desta campanha também estão em Saldão Outubro.");
  await expect(aviso.getByRole("link", { name: "Escolher onde ficam" })).toHaveAttribute(
    "href",
    `/painel/campanhas/conflitos?de=${encodeURIComponent(campanha.slug)}`,
  );
  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
```

- [ ] **Step 2: a guarda de completude do smoke.** Em `apps/web/e2e/conteudo-esperado.ts`, troque

```ts
  "/painel/campanhas/nova": {
    ancora: /Nova campanha/,
    semLista: "Formulario de criacao; nao lista registro existente.",
  },
```

por

```ts
  "/painel/campanhas/nova": {
    ancora: /Nova campanha/,
    semLista: "Formulario de criacao; nao lista registro existente.",
  },

  "/painel/campanhas/conflitos": {
    // O <h1> só monta depois do fetch, e termina em "em duas campanhas" com e sem conflito.
    ancora: /em duas campanhas/,
    lista: {
      api: "/api/campanhas/conflitos",
      // `{ conflitos: [...] }`, não array cru; o campo do grupo é `nome`.
      marca: (j) => primeiroTexto((j as { conflitos?: unknown } | null)?.conflitos, "nome"),
      vazio: /Nenhum grupo está em duas campanhas/,
    },
  },
```

- [ ] **Step 3: a faixa** — `apps/web/src/components/painel/campanhas/aviso-conflitos.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { avisoDaCampanha, type ConflitoDeGrupo } from "@/lib/campaigns/conflito-grupo";

/**
 * Faixa amarela da aba Grupos (mockup "Main", spec §6.6): grupos DESTA campanha que também estão
 * em outra. Some sem conflito — e também quando a leitura falha: é aviso, não pode derrubar a aba.
 */
export function AvisoConflitos({ campanhaId, slug }: { campanhaId: string; slug: string }) {
  const [conflitos, setConflitos] = useState<ConflitoDeGrupo[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/campanhas/conflitos", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ conflitos?: ConflitoDeGrupo[] }>) : { conflitos: [] }))
      .then((j) => {
        if (vivo) setConflitos(j.conflitos ?? []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const aviso = avisoDaCampanha(conflitos, campanhaId);
  if (!aviso) return null;
  return (
    <div
      role="note"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-atencao/30 bg-atencao/10 px-4 py-3.5 text-sm text-atencao"
    >
      <AlertTriangle className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-[1_1_400px]">
        {aviso.inicio} <strong>{aviso.nomes}</strong>. Agora cada grupo pertence a uma campanha só.
      </span>
      <Link
        href={`/painel/campanhas/conflitos?de=${encodeURIComponent(slug)}`}
        className="font-semibold underline underline-offset-2"
      >
        Escolher onde ficam
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: pendurar a faixa na aba Grupos** (`apps/web/src/app/painel/campanhas/[slug]/page.tsx`; uma linha fora do miolo da aba, que o PR 4 reescreve). Troque

```tsx
import { AcoesEmMassa } from "@/components/painel/grupos/acoes-em-massa";
```

por

```tsx
import { AcoesEmMassa } from "@/components/painel/grupos/acoes-em-massa";
import { AvisoConflitos } from "@/components/painel/campanhas/aviso-conflitos";
```

e troque

```tsx
      <div className="hf-enter" key={tab}>
        {tab === "Grupos" && (
          o.groups.length === 0 ? (
```

por

```tsx
      <div className="hf-enter" key={tab}>
        {tab === "Grupos" && <AvisoConflitos campanhaId={campanha.id} slug={campanha.slug ?? campanha.id} />}
        {tab === "Grupos" && (
          o.groups.length === 0 ? (
```

- [ ] **Step 5: a tela** — `apps/web/src/app/painel/campanhas/conflitos/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Group } from "@/lib/mock-data";
import { faltaEscolher, type ConflitoDeGrupo } from "@/lib/campaigns/conflito-grupo";

const ERRO_CARGA = "Não deu pra carregar os grupos em duas campanhas.";

/**
 * Grupos em duas campanhas (mockup "Conflito", spec §6.6, D4). Lista a loja inteira — o
 * `?de=<slug>` só monta o caminho de volta para a campanha de onde o lojista veio. Nada sai
 * sozinho: cada grupo espera a escolha, e "Salvar escolhas" manda uma por grupo.
 */
export default function ConflitosDeGrupoPage() {
  const [conflitos, setConflitos] = useState<ConflitoDeGrupo[] | null>(null);
  const [membros, setMembros] = useState<Map<string, number>>(() => new Map());
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [de, setDe] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [res, grupos] = await Promise.all([
        fetch("/api/campanhas/conflitos", { cache: "no-store" }),
        fetch("/api/groups", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => []),
      ]);
      const corpo = (await res.json().catch(() => ({}))) as { conflitos?: ConflitoDeGrupo[]; error?: string };
      if (!res.ok) throw new Error(corpo.error ?? ERRO_CARGA);
      setConflitos(corpo.conflitos ?? []);
      setMembros(new Map((Array.isArray(grupos) ? (grupos as Group[]) : []).map((g) => [g.id, g.members ?? 0])));
      setEscolhas({});
    } catch (e) {
      setErro(e instanceof Error ? e.message : ERRO_CARGA);
    }
  }, []);

  useEffect(() => {
    setDe(new URLSearchParams(window.location.search).get("de"));
    void carregar();
  }, [carregar]);

  async function salvar() {
    if (!conflitos || faltaEscolher(conflitos, escolhas) > 0) return;
    setSalvando(true);
    let falha: string | null = null;
    // Um POST por grupo, em sequência: se um falhar, os anteriores já valeram e a lista
    // recarregada mostra só o que sobrou.
    for (const c of conflitos) {
      const res = await fetch("/api/campanhas/conflitos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: c.whatsappGroupId, ficaEm: escolhas[c.whatsappGroupId] }),
      }).catch(() => null);
      if (!res?.ok) {
        const corpo = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
        falha = corpo?.error ?? "Não deu pra salvar as escolhas.";
        break;
      }
    }
    await carregar();
    if (falha) setErro(falha);
    setSalvando(false);
  }

  const pendentes = conflitos ? faltaEscolher(conflitos, escolhas) : 0;
  const nomeDe = de ? conflitos?.flatMap((c) => c.campanhas).find((c) => c.slug === de)?.name : undefined;

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 px-4 py-8 sm:px-6">
      <nav aria-label="Caminho" className="text-13 text-slate-600">
        {de ? (
          <Link href={`/painel/campanhas/${encodeURIComponent(de)}`} className="underline underline-offset-2 hover:text-volt-950">
            {nomeDe ?? "Voltar para a campanha"}
          </Link>
        ) : (
          <Link href="/painel/campanhas" className="underline underline-offset-2 hover:text-volt-950">
            Campanhas
          </Link>
        )}{" "}
        / Grupos
      </nav>

      {erro && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-alerta/20 bg-alerta/[0.06] px-4 py-3 text-sm text-alerta"
        >
          <span>{erro}</span>
          <button type="button" onClick={() => void carregar()} className="font-medium underline underline-offset-2">
            Tentar de novo
          </button>
        </div>
      )}

      {conflitos === null ? (
        !erro && (
          <div className="space-y-3" role="status" aria-label="Carregando os grupos">
            <div className="pn-skeleton h-9 w-96 max-w-full rounded-lg" />
            <div className="pn-skeleton h-64 rounded-xl" />
          </div>
        )
      ) : conflitos.length === 0 ? (
        <div className="pn-card rounded-xl px-5 py-16 text-center">
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-volt-950">
            Nenhum grupo está em duas campanhas
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Cada grupo pertence a uma campanha só. Grupo que já é de outra campanha aparece travado na hora de escolher.
          </p>
        </div>
      ) : (
        <>
          <header className="space-y-1.5">
            <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">
              {conflitos.length === 1 ? "1 grupo está em duas campanhas" : `${conflitos.length} grupos estão em duas campanhas`}
            </h1>
            <p className="max-w-[780px] text-[15px] text-slate-600">
              Agora cada grupo pertence a uma campanha só. Com duas campanhas, dois links mandam gente para o mesmo grupo
              e ele enche fora de ordem. Escolha onde cada um fica — na outra campanha ele sai da lista e do link.
            </p>
          </header>

          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Escolher onde cada grupo fica" className="pn-card min-w-0 flex-[1.4_1_560px] rounded-xl">
              {conflitos.map((c) => (
                <fieldset key={c.whatsappGroupId} className="space-y-2.5 border-b border-line-200 px-5 py-4">
                  <legend className="float-left mb-2.5 flex w-full flex-wrap items-baseline justify-between gap-3">
                    <span className="text-[15px] font-semibold text-volt-950">{c.nome}</span>
                    <span className="text-13 text-slate-600">
                      <span className="font-data tabular-nums">
                        {(membros.get(c.whatsappGroupId) ?? 0).toLocaleString("pt-BR")}
                      </span>{" "}
                      membros
                    </span>
                  </legend>
                  {c.campanhas.map((camp) => {
                    const marcado = escolhas[c.whatsappGroupId] === camp.id;
                    return (
                      <label
                        key={camp.id}
                        className={cn(
                          "clear-both flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3",
                          marcado ? "border-cobalt-500 bg-cobalt-500/[0.05]" : "border-line-200",
                        )}
                      >
                        <input
                          type="radio"
                          name={`fica-${c.whatsappGroupId}`}
                          checked={marcado}
                          onChange={() => setEscolhas((e) => ({ ...e, [c.whatsappGroupId]: camp.id }))}
                          className="h-[18px] w-[18px] accent-cobalt-500"
                        />
                        <span className="flex-1 text-sm text-volt-950">
                          Fica em <strong>{camp.name}</strong>
                        </span>
                        <span className="text-13 text-slate-600">posição {camp.posicao}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl bg-poco px-5 py-4">
                <span className="text-13 text-slate-600">
                  {pendentes > 0
                    ? `Falta escolher ${pendentes} ${pendentes === 1 ? "grupo" : "grupos"}.`
                    : "Pronto: cada grupo fica em uma campanha só."}
                </span>
                <button
                  type="button"
                  onClick={() => void salvar()}
                  disabled={pendentes > 0 || salvando}
                  className="min-h-11 rounded-lg bg-cobalt-500 px-5 text-sm font-semibold text-paper-0 transition-[filter] duration-[160ms] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {salvando ? "Salvando…" : "Salvar escolhas"}
                </button>
              </div>
            </section>

            <aside
              aria-labelledby="conflitos-daqui-pra-frente"
              className="pn-card min-w-0 flex-[1_1_380px] space-y-2 rounded-xl px-5 py-4"
            >
              <h2 id="conflitos-daqui-pra-frente" className="text-base font-semibold text-volt-950">
                Daqui pra frente, ao escolher grupos da campanha
              </h2>
              <p className="text-13 text-slate-600">
                Grupo que já é de outra campanha aparece travado, com o nome dela. Para mudar um grupo de campanha, tire
                ele da outra primeiro.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: tipos (os dois) e lint.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.e2e.json && npx eslint src/app/painel/campanhas/conflitos/page.tsx src/components/painel/campanhas/aviso-conflitos.tsx "src/app/painel/campanhas/[slug]/page.tsx" e2e/painel-campanha-grupo-exclusivo.spec.ts e2e/conteudo-esperado.ts
```

Esperado: sem saída. O e2e roda no job `e2e` do CI (precisa das credenciais de QA e, para os dois primeiros testes, do DDL em dev — Task 10).

- [ ] **Step 7: ver a tela** (sem credencial de QA local, o CI é a prova; com ela, `npx playwright test e2e/painel-campanha-grupo-exclusivo.spec.ts` em `apps/web`). Se for abrir no navegador, lembre que `preview_start` serve o checkout **principal** (memória `finding-preview-serve-checkout-principal`): use o Playwright do worktree.

- [ ] **Step 8: commit.**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/src/app/painel/campanhas/conflitos/page.tsx apps/web/src/components/painel/campanhas/aviso-conflitos.tsx "apps/web/src/app/painel/campanhas/[slug]/page.tsx" apps/web/e2e/painel-campanha-grupo-exclusivo.spec.ts apps/web/e2e/conteudo-esperado.ts
```
```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" diff --cached --stat
```

Esperado: os 5 arquivos.

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" commit -F - <<'EOF'
feat(painel): conflicts screen and warning on the campaign groups tab

/painel/campanhas/conflitos lists every group that sits in more than one
campaign and saves one choice per group; the groups tab shows a yellow
note when this campaign shares groups. E2E covers the locked picker, the
real 409 on POST/PATCH and both screens.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 9: verificação, revisão, push e PR

**Files:** nenhum novo no repo (cria `C:\Users\Igor\AppData\Local\Temp\pr-postar-grupo-exclusivo.md`).

**Depends-on:** Tasks 2–8

**Interfaces:**
- Consumes: os sete commits.
- Produces: PR aberto com CI rodando (vermelho no `drift` e nos dois primeiros e2e até o DDL — esperado; a Task 10 resolve).

- [ ] **Step 1: tipos, lint e suíte.**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.e2e.json && npm run lint && npm test
```

Esperado: tudo verde; os `*.integration.test.ts` pulam (sem `E2E_TENANT_ID`).

- [ ] **Step 2: alcançar a `main` antes do push** (memória `finding-baseline-drift-entre-prs-paralelos`):

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" fetch origin main && git -C "$WT" log HEAD..origin/main --oneline
```

Se vier commit: `git -C "$WT" merge origin/main`. Conflito em `apply-order.txt` → manter as entradas dos dois lados, em ordem cronológica dos nomes de arquivo. Conflito em `schema-baseline.json` → `git -C "$WT" checkout --theirs deploy/supabase/schema-baseline.json`, rode a Task 3, Step 6 de novo (o script repõe as duas chaves na baseline nova), `git -C "$WT" add deploy/supabase/schema-baseline.json deploy/supabase/apply-order.txt` e `git -C "$WT" commit --no-edit`. Depois, Step 1 de novo.

- [ ] **Step 3: o gate real** (ferramenta PowerShell; sem `2>&1`):

```powershell
$wt = (git rev-parse --show-toplevel) -replace '/', '\'; & "$wt\infra\scripts\verify-local.ps1" | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Esperado: `EXIT=0`. Falha de build com `ENOSPC` = disco cheio (memória `finding-disco-cheio-c`), não código.

- [ ] **Step 4: revisão.** Despache **Code Reviewer** e **ecc:database-reviewer** em paralelo sobre `git -C <WT> diff origin/main...HEAD`, pedindo atenção a: o trigger só compara JIDs novos e só dentro do tenant; `security definer` + `search_path` + ACL das duas RPCs; `reordenar_campanha` (conjunto, permutação, repetidos, `for update`); o 409 não engole outros erros (`respostaConflitoGrupo` devolve `null` e o chamador relança); `gruposDoEspelho` nunca tira o que a gaveta já tinha; o seletor não trava grupo marcado. Corrija CRITICAL/HIGH antes de seguir (mudança de SQL = rodar a Task 3, Steps 7–8 de novo).

- [ ] **Step 5: corpo do PR** — ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\pr-postar-grupo-exclusivo.md`, trocando `<conflitos_por_loja de prod>` pelo valor da Task 1:

````markdown
PR 6 de 9 do **postar por grupo** — um grupo, uma campanha (spec `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` §2 D4, §5.8, §6.6; contratos `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md` §2 e §4; plano `docs/superpowers/plans/2026-10-10-postar-por-grupo-pr6-exclusividade.md`).

## O que muda

- **Banco** (`20261010130000_grupo_uma_campanha.sql`): trigger `campaign_groups_grupo_exclusivo` recusa JID **novo** que já está em outra campanha da mesma loja (`unique_violation`, `grupo_em_outra_campanha:<jid>:<id>`). Conflito que já existe não trava nada. `grupos_em_mais_de_uma_campanha(p_tenant)` lista os antigos; `reordenar_campanha(...)` grava a ordem nova só se a lista não mudou (é do Padronizar, PR 8). As duas com execute só `service_role`.
- **API**: POST/PATCH `/api/campanhas` e POST `/api/comunidades/[slug]/grupos` devolvem 409 `{ error, grupo, campanha: { id, name } }`. `GET/POST /api/campanhas/conflitos` lista e escolhe onde o grupo fica (sai das outras pela RPC atômica; recusa se a campanha escolhida não tem mais o grupo).
- **Espelho de comunidade nativa** (sync): grupo que já está em outra campanha não entra na gaveta; o que ela já tinha continua. Sem isso o trigger recusaria a escrita inteira e o espelho daquela comunidade pararia.
- **Painel**: no seletor de grupos, grupo de outra campanha aparece travado com "já está em <Nome>"; tela `/painel/campanhas/conflitos` (mockup "Conflito"); faixa amarela na aba Grupos quando a campanha divide grupo com outra.

Conflitos que já existiam em prod antes deste PR: <conflitos_por_loja de prod>.

## Ordem de deploy

O DDL vai nos dois bancos **antes** do merge, e o merge vem logo em seguida: este PR fica vermelho no `drift` e nos dois primeiros testes de `painel-campanha-grupo-exclusivo.spec.ts` até o DDL chegar no dev, e depois do DDL todo outro PR aberto fica vermelho no `drift` até esta baseline estar na `main`.

## Testes

- [x] `src/lib/campaigns/conflito-grupo.test.ts` (17): parser da mensagem (JID com `:`, mensagem embrulhada, uuid maiúsculo), 409 vs 402, travas do seletor (conflito antigo não trava), espelho da comunidade, escolha (409 quando a campanha não tem mais o grupo), faixa.
- [x] `src/lib/stores/campaign-groups.test.ts` (5, PostgREST falso): RPCs com o tenant no corpo; a recusa do trigger chega inteira no insert e no append.
- [x] `privilegio-definer.test.ts` e `capture-transaction.test.ts` com a `apply-order` nova.
- [x] tsc ×2, lint, `npm test`, `infra/scripts/verify-local.ps1`.
- [ ] `infra/tests/grupo-uma-campanha-check.sql` sem erro em dev e em prod (8 blocos: trigger e ACL, recusa no update/insert/append, outra loja livre, repetido na mesma campanha, conflito antigo não trava, lista de conflitos, reordenar) e `assinatura` igual nos dois.
- [ ] baseline = prod (md5 do schema inteiro) e `drift` verde.
- [ ] e2e `painel-campanha-grupo-exclusivo.spec.ts` (4) verde no job `e2e` depois do DDL em dev.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

- [ ] **Step 6: push e PR.** Se o classificador negar algum dos dois, não tente variação: entregue o comando ao Igor (memória `finding-classificador-bloqueia-merge-e-ddl`).

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" push -u origin feat/postar-grupo-exclusivo
```
```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-exclusivo --title "feat: one group per campaign — trigger, conflicts screen and locked picker (postar por grupo PR 6)" --body-file "C:/Users/Igor/AppData/Local/Temp/pr-postar-grupo-exclusivo.md"
```

Anote o número `<N>` do PR.

### Task 10: Pendências para o Igor — DDL nos dois bancos, prova e só então merge

**Files:** nenhum arquivo do repo (cria `C:\Users\Igor\AppData\Local\Temp\pr6-rollback.sql`, `pr6-check-dev.json`, `pr6-check-prod.json`, `pr6-card-fim.sql`).

**Depends-on:** Task 9

**Interfaces:**
- Consumes: migração e check (Task 3), `baseline-pr6.mjs` (Task 3, Step 5), PR `<N>` (Task 9).
- Produces: o PR 6 mergeado com o schema aplicado em dev e prod e a baseline provada igual a prod — o que o PR 8 exige.

**Por que nesta ordem.** O app mapeia a recusa do trigger para 409, então o DDL tem de chegar **antes ou junto** do merge, nunca muito antes nem depois:
- **DDL antes do código, por muito tempo:** um conflito vira 500 genérico ("Erro ao salvar.") em vez do 409 com o nome da campanha, e o espelho de comunidade nativa (ainda sem o filtro) é recusado inteiro a cada sync. Por isso, DDL em dev → prod → prova → merge, sem pausa.
- **Código antes do DDL:** `/api/campanhas/conflitos` responde 500 (RPC inexistente), a tela de conflitos mostra erro e a faixa some; nada quebra fora disso, mas a feature não existe.
- **Gate de drift:** com a baseline nova no PR, o `drift` deste PR fica vermelho até o DDL no dev; depois do DDL no dev, o `drift` de **todo** PR aberto fica vermelho até esta baseline entrar na `main`. Por isso o merge vem logo depois da prova.

- [ ] **Step 1: deixar pronto o desfazer** (só se o prod falhar depois de o dev ter sido aplicado). Ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\pr6-rollback.sql`:

```sql
-- Desfaz 20261010130000 num banco (usar no DEV só se o PROD falhar: dev à frente da baseline deixa
-- o drift vermelho para todo PR). Nada de dado de cliente: só trigger e funções.
drop trigger if exists campaign_groups_grupo_exclusivo on public.campaign_groups;
drop function if exists app.campaign_groups_grupo_exclusivo();
drop function if exists public.grupos_em_mais_de_uma_campanha(uuid);
drop function if exists public.reordenar_campanha(uuid, uuid, text[], text[]);
```

- [ ] **Step 2: PEÇA AO IGOR — DEV** (PowerShell 5.1, sem `&&`; o `if` impede aplicar no banco que estava ligado antes se o `link` falhar). A primeira query é o RED (tem de falhar no bloco 1) — pule-a se o RED já rodou na Task 3, Step 2:

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
$linkou = ($LASTEXITCODE -eq 0)
if ($linkou) { supabase db query --linked -o json -f ..\..\infra\tests\grupo-uma-campanha-check.sql; "RED esperado (FALHOU: trigger ... ausente): EXIT=$LASTEXITCODE" }
if ($linkou) { supabase db query --linked -f supabase\migrations\20261010130000_grupo_uma_campanha.sql }
if ($linkou -and $LASTEXITCODE -eq 0) { supabase db query --linked -o json -f ..\..\infra\tests\grupo-uma-campanha-check.sql }
if ($linkou -and $LASTEXITCODE -eq 0) { supabase db advisors --linked --type security --output-format json }
```

(`$linkou` existe porque a query do RED termina com erro de propósito: sem ele, o `if` seguinte não teria como saber se o `link` deu certo, e a migração poderia cair no banco que estava ligado antes.)

Peça que ele cole as saídas. Confira:
- o check depois da migração **sem erro**, e `rows[0].r.assinatura` = `{"f|grupos_em_mais_de_uma_campanha(p_tenant uuid)":"d4b914108a3146913b311ff40fea570c","f|reordenar_campanha(p_tenant uuid, p_campanha uuid, p_esperado text[], p_nova text[])":"e2129f5f932794247606386523d5715e"}`;
- no advisor (só a primeira linha da saída é JSON — a última costuma trazer um erro do PostHog colado), nenhum lint novo que cite `grupos_em_mais_de_uma_campanha`, `reordenar_campanha` ou `campaign_groups_grupo_exclusivo` além do que já está em `deploy/supabase/advisors-allowlist.json`.

Erro com `FALHOU: …` = defeito da migração ou do check: corrija (Task 3), commit novo, push, e peça **o mesmo bloco** de novo (é idempotente). Se o check não trouxer `rows[0].r`, peça que ele rode o arquivo no SQL Editor do Supabase de dev (mostra o resultado do último comando). **Não siga para o prod com o check falhando.** Salve o `r` em `C:\Users\Igor\AppData\Local\Temp\pr6-check-dev.json`.

- [ ] **Step 3: PEÇA AO IGOR — PROD**, logo em seguida (a partir do Step 2 o `drift` de todo PR aberto está vermelho). Ao final o link volta para dev:

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f supabase\migrations\20261010130000_grupo_uma_campanha.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f ..\..\infra\tests\grupo-uma-campanha-check.sql }
if ($LASTEXITCODE -eq 0) { supabase db advisors --linked --type security --output-format json }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Mesma conferência do Step 2, e `assinatura` de prod **idêntica** à de dev. Salve o `r` em `C:\Users\Igor\AppData\Local\Temp\pr6-check-prod.json`. Se o prod falhar e não der para corrigir na hora, o Igor desfaz o dev:

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f "C:\Users\Igor\AppData\Local\Temp\pr6-rollback.sql" }
```

- [ ] **Step 4: a baseline é a de prod** (por você):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && node C:/Users/Igor/AppData/Local/Temp/baseline-pr6.mjs C:/Users/Igor/AppData/Local/Temp/pr6-check-prod.json && git -C "$WT" status --short deploy/supabase/schema-baseline.json
```

Esperado: `baseline: <n> objetos, md5 <x>`, depois `= prod`, e o `status` vazio (o arquivo commitado já era esse). `NAO bate com prod` = algo além deste PR mudou em prod desde a baseline da `main`: **não force** — mostre ao Igor; a alternativa dele, com a chave de prod no ambiente e na raiz do worktree: `$env:SUPABASE_URL = "https://nidoatbxaylrkcgbszns.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role de PROD>"; npm run schema:baseline; Remove-Item env:SUPABASE_SERVICE_ROLE_KEY, env:SUPABASE_URL`, e commit do arquivo regenerado.

- [ ] **Step 5: o gate de drift** — local, se houver credencial de dev no checkout principal:

```bash
WT=$(git rev-parse --show-toplevel); ENVFILE=/c/Users/Igor/Desktop/HubFlow-platform/apps/web/.env.local; if [ -f "$ENVFILE" ]; then cd "$WT" && set -a && source <(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' "$ENVFILE" | sed 's/\r$//') && set +a && case "$SUPABASE_URL" in *wfjuwogxaupyadwhvoxy*) npm run check:drift ;; *) echo "ENVFILE nao aponta para dev: use o CI" ;; esac; else echo "sem credencial local: use o CI"; fi
```

Esperado: `Sem drift fora da allowlist.` (prova de uma vez que a baseline está certa e que dev = prod). Em seguida, rode de novo os jobs que falharam por falta do DDL (o SHA tem a baseline; o `drift` lê o dev vivo):

```bash
gh run list --repo codingB0y/Girumo --branch feat/postar-grupo-exclusivo --limit 1 --json databaseId,conclusion
```
```bash
gh run rerun <run-id> --failed --repo codingB0y/Girumo
```
```bash
gh pr checks <N> --repo codingB0y/Girumo --watch
```

Esperado: tudo verde — em especial `drift`, `advisors` e, no job `e2e`, os 4 testes de `painel-campanha-grupo-exclusivo.spec.ts` como `ok` (os dois primeiros são o GREEN real do trigger + 409). Se a `main` andou com outra baseline nesse meio-tempo, faça a Task 9, Step 2 (merge da `main` + script da baseline), push, e espere o CI de novo.

- [ ] **Step 6: merge — só agora, à mão, no verde** (a `main` não tem proteção: auto-merge mergearia na hora; memória `finding-main-sem-protecao-auto-merge-imediato`). Se o classificador negar, é comando do Igor:

```bash
gh pr merge <N> --repo codingB0y/Girumo --squash --delete-branch
```

Depois do merge: avise que todo PR aberto precisa de `git merge origin/main` antes do próximo push (senão o `drift` dele reprova com a baseline antiga).

- [ ] **Step 7: card (prod, pelo Igor).** Ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\pr6-card-fim.sql` (troque `<N>`):

```sql
select public.move_card('postar-por-grupo', 'em_construcao',
  'PR 6 mergeado: um grupo, uma campanha (trigger de exclusividade em dev e prod, tela de conflitos, seletor travado, reordenar_campanha pronta para o Padronizar)',
  'PR #<N>');
```

e mande ao Igor:

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "C:\Users\Igor\AppData\Local\Temp\pr6-card-fim.sql" }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

O card continua `em_construcao`: a feature são 9 PRs, e `no_ar_verificado` só com a prova do §11 do spec.

- [ ] **Step 8: registrar a decisão no grafo** — `kg_insert_text` (source `decisao-2026-10-10`); se travar (memória `finding-kg-query-retorna-none`), entregue ao Igor o `rag insert` equivalente em PowerShell:

```txt
decisão: um grupo pertence a uma campanha só (postar por grupo, D4). O banco garante com o trigger campaign_groups_grupo_exclusivo (before insert or update of group_ids em campaign_groups, função app.campaign_groups_grupo_exclusivo, security invoker): só JID NOVO (new menos old) é conferido contra as outras campanhas do MESMO tenant; recusa com unique_violation 'grupo_em_outra_campanha:<jid>:<id da campanha mais antiga>'. Conflito antigo nunca trava e nada sai sozinho: grupos_em_mais_de_uma_campanha(p_tenant) lista, a tela /painel/campanhas/conflitos deixa o lojista escolher, e POST /api/campanhas/conflitos tira o grupo das outras pela RPC campaign_group_remove_group_id. O app mapeia a recusa para 409 { error, grupo (JID), campanha { id, name } } em POST/PATCH /api/campanhas e POST /api/comunidades/[slug]/grupos. O espelho de comunidade nativa (sync) filtra antes de escrever (gruposDoEspelho): quem chegou primeiro fica com o grupo. reordenar_campanha(p_tenant, p_campanha, p_esperado, p_nova) grava só se o conjunto atual = esperado e nova é permutação (para o Padronizar, PR 8).
```

- [ ] **Step 9: encerrar** com "PRs que deixei abertos: …" (nenhum, ou `#<N>` e o motivo — p.ex. esperando o DDL do Igor) e lembrar que o PR 8 (Padronizar) depende deste mergeado e aplicado nos dois bancos.

---

## Self-review contra spec e contratos

- **D4 / §5.8:** trigger nos JIDs novos, `unique_violation` + mensagem exata (Task 3, migração §1; check blocos 2, 4, 6); conflito antigo não trava (bloco 6; `reordenar_campanha` sobre conflito antigo, bloco 8); pega `campaign_group_append_group_id` (bloco 4) e a escrita do espelho de comunidade (Task 5, Step 6 — decisão 1 acima); `grupos_em_mais_de_uma_campanha` com `[{id,name,slug,posicao}]` em ordem de criação (bloco 7); `reordenar_campanha` com conjunto + permutação + `false` quando a lista mudou (bloco 8). ✔
- **Contrato §2:** nomes, assinaturas e retorno idênticos; `name` (não `nome`) na RPC. ✔
- **Contrato §4:** `GET /api/campanhas/conflitos` → `{ conflitos: Array<{ whatsappGroupId, nome, campanhas: [{ id, name, slug, posicao }] }> }` (Task 4 + Task 6); `POST` `{ jid, ficaEm }` → `{ ok: true }` (Task 6); 409 de exclusividade `{ error, grupo, campanha: { id, name } }` em POST/PATCH `/api/campanhas` (Task 5). ✔
- **Assinaturas de store exigidas pelo PR 8:** `listarConflitos(tenantId)` e `reordenarCampanha(tenantId, campaignId, esperado, nova): Promise<boolean>` exatamente (Task 4). ✔
- **§6.6:** seletor travado com "já está em *Nome*" a partir do `GET /api/campanhas` (Task 7); tela do mockup + aviso na aba Grupos (Task 8). ✔
- **§7 "Grupo em duas campanhas":** "o trigger impede conflito novo" ✔; "fica fora dos renomes" é do PR 8 (consome `listarConflitos`).
- **§8:** SQL de conferência numa transação com `rollback`, ACL por `has_function_privilege` (bloco 1); funções puras com `node:test`; e2e. ✔
- **§9:** migração com `apply-order`, baseline e `infra/tests/*.sql`; DDL pelo Igor nos dois bancos; depende só do PR 1. ✔ — passa de ~10 arquivos (19), justificado em Global Constraints.
- **Banco (CLAUDE.md):** conferido por SQL e nas branches antes de criar (Task 1); `security definer` sempre com `set search_path`; revoke/grant explícitos depois de cada `create or replace`; nenhuma tabela nova (RLS não muda). ✔
