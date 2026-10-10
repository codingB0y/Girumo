# Postar por grupo — PR 5: postar com destino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O lojista escolhe para quais grupos o post vai — "Todos menos o que está enchendo" (padrão), "Só lotados", "Todos com gente" ou uma lista marcada à mão — na aba Posts da campanha/comunidade (inclusive o Funil), na folha "Postar" da barra e em Disparos. Atalho vira **regra guardada no disparo** (`broadcasts.target_rule`), refeita pelo banco na hora do envio; mexer na lista vira **lista fixa** conferida contra os grupos da campanha. O histórico mostra a regra enquanto o disparo não rodou.

**Architecture:** Uma função pura `lerDestino` (`lib/campaigns/destino.ts`, sem `server-only`) lê o corpo do POST e é a mesma fonte do tipo `Destino` e do padrão para a tela. A rota `POST /api/campanhas/[slug]/messages` valida o destino **antes** dos gates, grava `target_rule` **ou** `group_ids`, e só no "enviar agora" com regra lê `listCampaignGroupStates` (PR 2) para recusar regra vazia — quem resolve os grupos de verdade é `app.alvos_do_disparo` (PR 1). A tela tem um hook `useCargaDosEstados(slug)` (lê `GET .../grupos/estados`, PR 4) e um componente `DestinoGrupos` que só **apresenta**: a pertinência a cada regra vem de `naRegra` pronto do banco, e as contas/frases ficam em funções puras testadas (`lib/campaigns/destino-ui.ts`). `dispatch-view.ts` ganha `targetRule` e `regraPendente()` para o histórico.

**Tech Stack:** Next.js 15 (App Router, route handlers e client components), React 19, Tailwind v4 com as classes `pn-*` da Vitrine, `@supabase/supabase-js` 2.108 (PostgREST + RPC), `node --test` via tsx (node 24), Playwright 1.62, PowerShell 5.1 + Git Bash.

**Spec:** `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` (§2 D5–D8 e D11, §3, §4, §5.5, §6.5, §7, §8, §9, §11 item 2) · contratos **vinculantes**: `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md` (§1 regras e `EstadoRow`, §3 `estado.ts` e `campaign-group-states.ts`, §4 rotas, §5 `destino.ts` e `createBroadcast`) · mockup: telas "Postar nos grupos" e "Postar toda semana" do artifact https://claude.ai/artifact/VvMiGdwbaNCP9pHJQZzmwc (fonte local: `Postar.dc.html`, `Automacao.dc.html`).

## Global Constraints

- Pré-requisitos em `origin/main`: PR 1 (migração `20261010120000_postar_por_grupo.sql` aplicada em dev **e** prod), PR 2 (`apps/web/src/lib/groups/estado.ts`, `apps/web/src/lib/stores/campaign-group-states.ts`), PR 4 (`apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts`). Faltou um → parar e perguntar ao Igor.
- Este PR **não tem DDL**. Banco dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`.
- Dividido em dois PRs (ver "Divisão"): 5a branch `feat/postar-grupo-destino`, 5b branch `feat/postar-grupo-destino-tela`. Base sempre `origin/main`.
- Repositório: `codingB0y/Girumo`. Nunca auto-merge: o merge é `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`, à mão, com CI verde.
- Commits: prefixo semântico em inglês e o rodapé exato `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Corpo de PR em português, terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- `<wt>` = raiz do worktree da sessão, impressa na Task 0 Step 1; substituir literalmente em todo comando. Todo git é `git -C <wt>`.
- `<scratch>` = diretório de scratchpad da sessão do executor (fora do repo).
- Terminal: PowerShell 5.1, sem `&&`/`||` (encadear com `;`). Nunca `git add -A`. `git -C <wt> diff --cached --stat` numa chamada **separada** antes de cada commit.
- Unit (de `<wt>\apps\web`): `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`.
- Caminho com `[slug]` no runner do node 24 é glob: escrever `src/app/api/campanhas/[[]slug]/messages/route.test.ts` (o literal `[slug]` roda **0 testes** e sai verde). Conferir sempre a linha `ℹ tests N` com N > 0.
- Tipos (os dois; lint e tsx não checam tipo): `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`.
- Lint: `npm run lint` · suíte: `npm test` · lint da Vitrine: `npx tsx scripts/check-painel-vitrine.ts` (esperado `painel:check OK`).
- Gate antes do push (da raiz `<wt>`): `& .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"` → `EXIT=0`. Sem `2>&1` nem `*>`.
- Regras (contrato): `menos_enchendo` · `lotados` · `com_gente`. Padrão: `{ regra: "menos_enchendo" }`.
- Rótulos (`ROTULO_REGRA`, PR 2): `Todos menos o que está enchendo` · `Só lotados` · `Todos com gente`.
- Corpo do POST: `destino?: { regra: RegraDestino } | { grupos: string[] }`; `groupIds` continua aceito como lista fixa; `destino` vence `groupIds`.
- Erro de regra vazia (400): `Nenhum grupo nesta regra agora.`
- Erro de campanha sem grupos (400, texto de sempre): `Esta campanha ainda não tem grupos. Escolha os grupos antes de disparar.`
- Erro de grupo fora da campanha (400): `Um dos grupos escolhidos não está nesta campanha. Recarregue a página e escolha de novo.`
- Erro de lista vazia (400): `Escolha ao menos um grupo.` · regra fora do contrato (400): `Regra de destino inválida.` · forma inválida (400): `Destino inválido.` / `Lista de grupos inválida.`
- Estados: `GET /api/campanhas/[slug]/grupos/estados` → `{ grupos: EstadoGrupo[]; contagem; regras }`. Este PR lê **só** `grupos`; a tela nunca recalcula regra (usa `grupo.naRegra[regra]`).
- Nome acessível é contrato com o E2E: grupo `Atalhos de destino`; botões começam pelo rótulo da regra; `data-testid="destino-grupos"` e `data-testid="destino-resumo"`.
- Visual G2: Acid só no chip Lotado (`pn-chip--acid`) e no Postar; zero `bg-acid` novo; alvos ≥ 44px (`min-h-11`); corpo 14px, legenda 13px, `text-12` só em chip; borda colorida não pinta (`* { border-color }` fora de camada) → contorno é `ring-*`.
- Textos fora de colisão com sentinelas E2E (`e2e/conteudo-esperado.ts`): nada de `Nenhum disparo`, `Nenhum post` nem `Nenhum grupo` em texto fixo de tela.
- Tenant de QA do dev (`4483abf8-3483-40bf-a448-6b3ce9496374`) **não tem número** e os e2e contam com isso: teste que precisa de número cria o seu e apaga no fim.
- Vendedora (`seller` com módulo `postar`): o mapa de rotas por módulo (`apps/web/src/lib/auth/modulos.ts`, `ROTAS.postar`) **não está em `main`** em 10/10 — vem no PR #415 (`feat/vendedora-guard`, aberto). Com ele em `main`, a Task 4b libera `GET /api/campanhas/*/grupos/estados` em `postar` (sem isso o seletor dá 403 para ela). Sem ele, a Task 4b é pulada e a dependência vai escrita no PR e no relatório final — nunca criar `modulos.ts` aqui.
- Card do quadro: o da série "postar por grupo" (criado no PR 1; key a conferir, provável `postar-por-grupo`). `em_construcao` ao começar (Task 0); `move_card` na Task 14. DML em prod passa pelo Igor.
- Fechar o loop na mesma sessão. Ao encerrar: "PRs que deixei abertos: …".

## Divisão em dois PRs

Somando tudo dá 23 arquivos — bem acima da régua de ~10. Dividido assim:

| PR | Tasks | Arquivos | Branch | Depende de |
|---|---|---|---|---|
| **5a — API, `destino.ts`, histórico (dados), rota da vendedora** | 0–5 (com 4b) | 10 (8 sem a 4b) | `feat/postar-grupo-destino` | PRs 1, 2, 4; #415 só para a 4b |
| **5b — tela (seletor + aba Posts/Funil + folha + Disparos)** | 6–14 | 13 | `feat/postar-grupo-destino-tela` | 5a |

O 5a sozinho não muda nada para o lojista: as três telas ainda mandam `groupIds` com **todos** os grupos da campanha, que vira lista fixa conferida (todos estão em `group_ids`), e o Avisos passa pela exceção da comunidade. A regra padrão só chega com o 5b.

## File Structure

| Arquivo (em `apps/web/`) | Ação | Responsabilidade | Task |
|---|---|---|---|
| `src/lib/campaigns/destino.ts` | criar | `Destino`, `DESTINO_PADRAO`, `NENHUM_GRUPO_NA_REGRA`, `lerDestino` | 1 |
| `src/lib/campaigns/destino.test.ts` | criar | testes de `lerDestino` | 1 |
| `src/lib/stores/broadcasts.ts` | modificar | `Broadcast.target_rule`; `createBroadcast` aceita `target_rule` | 2 |
| `src/lib/stores/broadcasts-regra.integration.test.ts` | criar | regra → `engine_commands` só nos JIDs certos (dev) | 2 |
| `src/app/api/campanhas/[slug]/messages/route.ts` | modificar | destino no POST | 3 |
| `src/app/api/campanhas/[slug]/messages/route.test.ts` | criar | rota contra PostgREST falso | 3 |
| `src/lib/campaigns/dispatch-view.ts` | modificar | `targetRule`, `regraPendente` | 4 |
| `src/lib/campaigns/dispatch-view.test.ts` | modificar | testes do histórico com regra | 4 |
| `src/lib/auth/modulos.ts` | modificar (só se #415 em `main`) | `ROTAS.postar` ganha `GET /api/campanhas/*/grupos/estados` | 4b |
| `src/lib/auth/modulos.test.ts` | modificar (só se #415 em `main`) | linhas da tabela rota × método × módulo | 4b |
| `src/lib/campaigns/destino-ui.ts` | criar | contas e frases do seletor | 7 |
| `src/lib/campaigns/destino-ui.test.ts` | criar | testes delas | 7 |
| `src/components/painel/messages/destino-grupos.tsx` | criar | `useCargaDosEstados` + `DestinoGrupos` | 8 |
| `src/components/painel/messages/messages-tab.tsx` | modificar | seletor na aba Posts; envio com `destino` | 9 |
| `src/components/painel/messages/funnel/funnel-plan.ts` | modificar | `FunnelRun.destino`, `MessagePayload.destino` | 9 |
| `src/components/painel/messages/funnel/funnel-plan.test.ts` | modificar | payload com `destino` | 9 |
| `src/components/painel/messages/funnel/funnel-confirm.test.ts` | modificar | `run` com `destino` | 9 |
| `src/components/painel/messages/funnel/funnel-tab.tsx` | modificar | prop `destino` | 9 |
| `e2e/painel-funil.spec.ts` | modificar | funil manda a regra padrão | 9 |
| `src/components/painel/folha-postar.tsx` | modificar | seletor compacto na folha "Postar" | 10 |
| `src/app/painel/disparos/page.tsx` | modificar | POST com `destino` | 11 |
| `src/components/painel/disparos/vitrine/disparos-vitrine.tsx` | modificar | seletor, alcance pelo destino, histórico com regra | 11 |
| `e2e/painel-vitrine-disparos.spec.ts` | modificar | atalho padrão; espera dos estados | 11 |

## Divergências entre spec/contratos e o código (decididas aqui)

1. Spec §6.4 descreve a resposta de estados como `{ grupos, enchendo, contagem }`; o contrato §4 diz `{ grupos, contagem, regras }`. Vale o contrato. Este PR só lê `grupos` (as contagens dos atalhos saem de `naRegra`, a mesma fonte do rodapé).
2. Spec §6.5: `lerDestino(body, campanha)`; contrato §5: terceiro argumento `permitidosExtras`. Vale o contrato: é o JID do Avisos da comunidade nativa.
3. Spec §6.5 manda conferir se `assertPlanLimit("contacts:reach")` conta alcance por `groupIds`. **Não conta**: conta linhas de `leads` do tenant (`capability-limits.ts:74`). Nada a passar; só um comentário na rota.
4. Spec §8 põe o teste de `enqueue_broadcast` com regra em `campaign-group-states.integration.test.ts`. Aqui ele vive em `src/lib/stores/broadcasts-regra.integration.test.ts`: testa `createBroadcast` + `enqueueBroadcast` (este store) e não depende do arquivo do PR 2/4.
5. O Avisos não tem função de servidor própria: a rota reaproveita `listarComunidades(tenantId)` (`stores/communities.ts`) **só** quando `camp.whatsapp_community_jid` existe.
6. Props do componente: em vez de `(campaignSlug, value, onChange)`, `DestinoGrupos({ estados, value, onChange, compacto? })` + hook exportado `useCargaDosEstados(slug)` (o estado de carga chama `CargaDosEstados`; `EstadosDaCampanha` é o tipo da resposta que o plano do PR 4 exporta em `lib/groups/resumo-estados.ts`, usado aqui só para tipar o `fetch`). Disparos precisa da **mesma** seleção para o "Vai pra N grupos" e o rótulo do botão (contrato do E2E: os dois contam a mesma coisa).
7. Funil: `FunnelRun.groupIds` vira `FunnelRun.destino` (o spec só diz "inclui o fluxo de confirmação de Funil"). `e2e/painel-funil.spec.ts` cobrava `m.groupIds === campanha.groupIds` e muda junto.
8. Histórico: o spec escreve "Regra: todos menos…" (minúsculo); o rótulo é o `ROTULO_REGRA` do contrato ("Regra: Todos menos o que está enchendo").
9. `groupIds: []` significava "todos" antes; agora é lista vazia (400). Só cliente velho de campanha **sem** grupo mandava isso, e já recebia 400 (a mensagem de sempre é mantida nesse caso).
10. Fora deste PR (seguem contando todos os grupos da campanha): o CTA "Postar em N grupos" (`painel/campanhas/[slug]/page.tsx:249`) e "Enviar grupo a grupo (N envios)" da comunidade (`messages-tab.tsx:212`); a Agenda da aba Posts não mostra a regra do agendado (o spec pede só o Histórico de Disparos); modo JSON (`HUBFLOW_USE_SUPABASE=0`) ignora `destino` e vai para todos (spec §10).
11. O chip de estado é o `ChipDeEstado` que o PR 4 exporta de `components/painel/grupos/estado-do-grupo.tsx` (Task 7 do plano do PR 4) — uma cor de estado só no painel. Ajuste do coordenador: a versão anterior deste plano tinha um mapa local `CHIP_ESTADO`.
12. Vendedora: nem o spec nem o contrato do postar-por-grupo falam dela. O mapa `ROTAS` (PR #415, ainda fora de `main`) libera para `postar` só `POST /api/campanhas/*/messages` entre as rotas da campanha; o seletor novo lê `GET /api/campanhas/*/grupos/estados` → Task 4b, condicional. O #415 também põe `regraDaVendedora(...)` no POST de mensagens (403 "Grupo fora da campanha." olhando só `body.groupIds`, e 403 para recorrência). As edições da Task 3 não tocam esse bloco e continuam casando com o texto; depois do 5a, a checagem de grupo dela fica coberta por `lerDestino` para **todos** os papéis (inclusive `destino.grupos`), e a de recorrência segue valendo. Não remover nada do #415 aqui.
13. Mensagem de regra vazia: com ponto final, `Nenhum grupo nesta regra agora.` — o mesmo texto que o PR 1 grava no disparo falho (coordenação entre os planos).

## Review Focus

Os cinco defeitos mais prováveis que nenhum teste de task cobriria sozinho — cada um ganhou um teste na task dona:

1. **Estado velho entre abrir a tela e enviar.** A tela carrega os estados uma vez; o grupo pode começar a encher antes do clique. A regra nunca viaja como lista: a rota relê `campaign_group_states` a cada "enviar agora" com regra, com o tenant e a campanha da rota, e o banco refaz a lista no enqueue; a folha relê a cada abertura. **Teste:** Task 3, `route.test.ts` › "enviar agora sem destino: lê o estado na hora…" (RPC chamada **neste** POST, corpo `{ p_tenant, p_campaign }`; o estado do banco decide, não o cliente).
2. **Trocar de campanha (folha / Disparos) e mandar a lista fixa da anterior.** **Teste:** Task 7, `destino-ui.test.ts` › "trocar de campanha volta ao atalho padrão…" (`destinoDaCampanha`), com mutante.
3. **"Enviar pelo Avisos" quebrado pela conferência nova** (o Avisos nunca está em `group_ids`). **Teste:** Task 1 › "o Avisos da comunidade nativa entra só quando a rota o permite"; Task 3 › "comunidade nativa: o Avisos passa…" (consulta `announce` filtrada por tenant).
4. **O destino validado cedo pular o teto do plano.** Os `return` novos ficam antes do `assertPlanLimit`; um caminho de regra que saísse direto para o insert gravaria sem teto. **Teste:** Task 3 › "regra com grupo agora segue para o teto do plano" e "agendado com regra…" (`GET /subscriptions` acontece; nenhum `POST /broadcasts`). `send-gates.test.ts` continua verde.
5. **Lista fixa com JID que saiu da campanha** (auto-grow/remoção em outra aba). Antes ia sem conferência; agora 400 com "Recarregue" e nada gravado. **Teste:** Task 1 › "grupo que não está (ou não está mais) na campanha…"; Task 3 › "lista fixa com grupo de fora da campanha: 400, sem teto e sem gravar".

E o elo entre app e SQL: `createBroadcast` perder o `target_rule` faria o disparo cair no predicado antigo (`group_ids` vazio = **todos** os grupos admin). **Teste:** Task 2, `broadcasts-regra.integration.test.ts` (job e2e do CI, banco de dev).

E a vendedora com `postar`: o seletor chama uma rota que o mapa dela não abre → 403 e "Não deu pra carregar os grupos…" em Disparos e na folha (o post ainda sai pela regra padrão, porque o POST está liberado). **Teste:** Task 4b, `modulos.test.ts` (GET dos estados abre com `postar`; `grupos/lotado` e `grupos/estado` continuam fechados) e o estrutural `modulos-rotas.test.ts` do #415 (a rota existe e exporta `GET`).

---

# PR 5a — API, `destino.ts` e histórico

### Task 0: worktree, branch, pré-requisitos, defasagem e card

**Files:** nenhum.
**Depends-on:** none

- [ ] **Step 1:** na sessão (que já roda num worktree do app — não criar outro, `finding-harness-bloqueia-escrita-em-outro-worktree`):

```powershell
git rev-parse --show-toplevel
```

  Anotar a saída como `<wt>`.

- [ ] **Step 2:** atualizar `origin/main`:

```powershell
git -C <wt> fetch origin main
```

- [ ] **Step 3:** PR 1 em `main` (migração e ordem de aplicação):

```powershell
git -C <wt> cat-file -e origin/main:apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql; "EXIT=$LASTEXITCODE"
```
```powershell
git -C <wt> show origin/main:deploy/supabase/apply-order.txt | Select-String -SimpleMatch "20261010120000"
```

  Esperado: `EXIT=0` e uma linha. Faltou → **parar e perguntar ao Igor** (PR 1 não mergeou).

- [ ] **Step 4:** PR 2 em `main`:

```powershell
git -C <wt> show origin/main:apps/web/src/lib/groups/estado.ts | Select-String -Pattern "export type RegraDestino|export const REGRAS|export function isRegraDestino|export const ROTULO_REGRA|export const ROTULO_ESTADO|naRegra"
```
```powershell
git -C <wt> show origin/main:apps/web/src/lib/stores/campaign-group-states.ts | Select-String -Pattern "export async function listCampaignGroupStates"
```

  Esperado: todas as exportações listadas aparecem (e `naRegra` pelo menos uma vez); uma linha no segundo. Faltou → parar e perguntar ao Igor.

- [ ] **Step 5:** PR 4 em `main` (o `cat-file` não interpreta `[slug]` como glob):

```powershell
git -C <wt> cat-file -e "origin/main:apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts"; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`. Senão → parar e perguntar ao Igor. E o tipo da resposta, que o PR 4 exporta para este PR:

```powershell
git -C <wt> show origin/main:apps/web/src/lib/groups/resumo-estados.ts | Select-String -Pattern "export type EstadosDaCampanha"
```

  Esperado: uma linha. (O tipo de carga deste PR chama-se `CargaDosEstados` justamente para não colidir com ele.)

- [ ] **Step 5b:** acesso da vendedora — decide se a Task 4b roda. O mapa de módulos em `main`?

```powershell
git -C <wt> cat-file -e origin/main:apps/web/src/lib/auth/modulos.ts; "EXIT=$LASTEXITCODE"
```

  - `EXIT=0` (PR #415 mergeado) → a Task 4b **roda**. Conferir também que a rota de estados do PR 4 não exige uma permissão que a vendedora não tem (o mapa só deixa a requisição chegar; dentro da rota vale `lib/permissions.ts`, onde `seller` só tem `message:send`):

```powershell
git -C <wt> show "origin/main:apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts" | Select-String -Pattern "assertPermission|campaign:edit|allowEngine"
```

    Esperado: só a linha do `allowEngine: false`. Se o `GET` exigir `campaign:edit` (ou outra ação sem `seller`), **parar e perguntar ao Igor**: liberar no mapa não adiantaria, e mudar a permissão da rota é decisão do PR 4.
  - `EXIT≠0` (#415 ainda aberto) → a Task 4b é **pulada**, sem criar `modulos.ts`. Anotar para o corpo do PR (Task 5 Step 8 e Task 13 Step 8) e para o relatório final a dependência exata: "quando o #415 entrar, `ROTAS.postar` precisa de `{ padrao: "/api/campanhas/*/grupos/estados", metodos: ["GET"] }` e as linhas de teste da Task 4b; sem isso a vendedora com `postar` vê 'Não deu pra carregar os grupos desta campanha agora' no seletor (o post ainda sai pela regra padrão)". Se o #415 mergear antes do push do 5a, voltar e rodar a Task 4b.

- [ ] **Step 6:** o que o PR 1 já mexeu em `broadcasts.ts` (a guarda do claim legado):

```powershell
git -C <wt> grep -n "target_rule" origin/main -- apps/web/src/lib/stores/broadcasts.ts
```

  Esperado: só a linha `.is("target_rule", null)` do claim. Se aparecer `target_rule:` no tipo `Broadcast`, o Step 2 da Task 2 que acrescenta o campo ao tipo é pulado.

- [ ] **Step 7:** PR 1 aplicado no **dev** (leitura; passa no classificador). Gravar com a ferramenta Write o arquivo `<scratch>\pre-pr5.sql`:

```sql
select
  to_regprocedure('public.campaign_group_states(uuid,uuid)') is not null as estados,
  to_regprocedure('app.alvos_do_disparo(public.broadcasts)') is not null as alvos_do_disparo,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'broadcasts' and column_name = 'target_rule'
  ) as target_rule;
```

```powershell
Set-Location <wt>\apps\web; npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes; if ($LASTEXITCODE -eq 0) { npx supabase db query --linked -f <scratch>\pre-pr5.sql }
```

  Esperado: `t | t | t`. Qualquer `f` → parar: o PR 1 não foi aplicado no dev e o teste de integração (Task 2) vai reprovar no CI. Para **prod**, pedir ao Igor rodar o mesmo arquivo trocando a ref por `nidoatbxaylrkcgbszns` e confirmar `t | t | t` antes do merge do 5b.

- [ ] **Step 8:** branch a partir de `origin/main`, sem upstream herdado, defasagem zero:

```powershell
git -C <wt> switch -c feat/postar-grupo-destino origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Esperado no último: vazio.

- [ ] **Step 9:** colisão com outra sessão:

```powershell
gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title
```

  Nos suspeitos, `gh pr diff <N> --repo codingB0y/Girumo --name-only`: nenhum PR aberto mexendo em `messages/route.ts`, `stores/broadcasts.ts`, `dispatch-view.ts`, `messages-tab.tsx`, `funnel/*`, `folha-postar.tsx`, `painel/disparos/page.tsx`, `disparos-vitrine.tsx` ou `lib/auth/modulos.ts`. O #415 (`feat/vendedora-guard`) mexe em `messages/route.ts` e cria `modulos.ts`: é esperado (ver Divergência 12) — se ele ainda estiver aberto, as edições da Task 3 continuam valendo sobre o texto atual e sobre o dele. Outro PR além desse → avisar o Igor antes de seguir.

- [ ] **Step 10:** dependências do worktree:

```powershell
Test-Path "<wt>\node_modules\next"
```

  `False` → `Set-Location <wt>; npm ci --workspace apps/web --include-workspace-root --no-audit --no-fund` (`finding-worktree-node-modules-junction`).

- [ ] **Step 11:** `.env.local` para rodar integração/E2E local (Tasks 2 e 12): se `Test-Path "<wt>\apps\web\.env.local"` for `False` e existir o do checkout principal:

```powershell
Copy-Item "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\.env.local" "<wt>\apps\web\.env.local"
```

  Conferir só os nomes, nunca o valor:

```powershell
Select-String -Path "<wt>\apps\web\.env.local" -Pattern '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|E2E_EMAIL)=' | ForEach-Object { $_.Line.Split('=')[0] }
```

- [ ] **Step 12:** card no quadro (prod, Igor). Primeiro a key:

```sql
select key, status, blocker from public.board_features where key ilike '%postar%' or title ilike '%postar por grupo%';
```

  Depois (trocar `<card>` pela key achada):

```sql
select public.move_card('<card>', 'em_construcao', 'PR 5 (postar com destino) começou: API + seletor de grupos', 'feat/postar-grupo-destino');
```

---

### Task 1: `lerDestino` — destino do post como regra ou lista fixa

**Files:**
- Create: `apps/web/src/lib/campaigns/destino.ts`
- Create: `apps/web/src/lib/campaigns/destino.test.ts`

**Depends-on:** Task 0

**Interfaces:**
- Consome (PR 2, `@/lib/groups/estado`): `type RegraDestino = "menos_enchendo" | "lotados" | "com_gente"`; `function isRegraDestino(v: unknown): v is RegraDestino`.
- Produz:
  - `export type Destino = { regra: RegraDestino } | { grupos: string[] };`
  - `export const DESTINO_PADRAO: Destino;` (= `{ regra: "menos_enchendo" }`)
  - `export const NENHUM_GRUPO_NA_REGRA = "Nenhum grupo nesta regra agora.";`
  - `export function lerDestino(body: Record<string, unknown>, campanha: { group_ids: string[] }, permitidosExtras?: readonly string[]): { ok: true; destino: Destino } | { ok: false; error: string };`

- [ ] **Step 1 (RED):** criar `apps/web/src/lib/campaigns/destino.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { DESTINO_PADRAO, NENHUM_GRUPO_NA_REGRA, lerDestino } from "./destino";

const CAMPANHA = { group_ids: ["g1@g.us", "g2@g.us", "g3@g.us"] };
const SEM_GRUPOS = "Esta campanha ainda não tem grupos. Escolha os grupos antes de disparar.";
const DE_FORA = "Um dos grupos escolhidos não está nesta campanha. Recarregue a página e escolha de novo.";
const LISTA_VAZIA = "Escolha ao menos um grupo.";

test("sem destino nenhum vale o padrão seguro: todos menos o que está enchendo (D5)", () => {
  // Antes do seletor, post sem lista ia para TODOS os grupos da campanha.
  assert.deepEqual(lerDestino({ body: "oi" }, CAMPANHA), { ok: true, destino: { regra: "menos_enchendo" } });
  assert.deepEqual(DESTINO_PADRAO, { regra: "menos_enchendo" });
});

test("as três regras do contrato passam como regra", () => {
  for (const regra of ["menos_enchendo", "lotados", "com_gente"] as const) {
    assert.deepEqual(lerDestino({ destino: { regra } }, CAMPANHA), { ok: true, destino: { regra } });
  }
});

test("regra fora do contrato é recusada, não vira padrão nem 'todos'", () => {
  assert.deepEqual(lerDestino({ destino: { regra: "todos" } }, CAMPANHA), { ok: false, error: "Regra de destino inválida." });
  assert.deepEqual(lerDestino({ destino: { regra: null } }, CAMPANHA), { ok: false, error: "Regra de destino inválida." });
});

test("lista fixa com grupos da campanha: sem repetidos e sem espaço, na ordem enviada", () => {
  assert.deepEqual(lerDestino({ destino: { grupos: [" g3@g.us", "g1@g.us", "g3@g.us"] } }, CAMPANHA), {
    ok: true,
    destino: { grupos: ["g3@g.us", "g1@g.us"] },
  });
});

test("groupIds legado vira lista fixa com a mesma conferência", () => {
  assert.deepEqual(lerDestino({ groupIds: ["g2@g.us"] }, CAMPANHA), { ok: true, destino: { grupos: ["g2@g.us"] } });
  assert.deepEqual(lerDestino({ groupIds: ["x@g.us"] }, CAMPANHA), { ok: false, error: DE_FORA });
});

test("destino vence groupIds quando os dois chegam", () => {
  assert.deepEqual(lerDestino({ destino: { regra: "lotados" }, groupIds: ["g1@g.us"] }, CAMPANHA), {
    ok: true,
    destino: { regra: "lotados" },
  });
});

test("grupo que não está (ou não está mais) na campanha é recusado: antes passava sem conferência", () => {
  assert.deepEqual(lerDestino({ destino: { grupos: ["g1@g.us", "saiu@g.us"] } }, CAMPANHA), { ok: false, error: DE_FORA });
});

test("o Avisos da comunidade nativa entra só quando a rota o permite", () => {
  const avisos = "120363099@g.us";
  assert.deepEqual(lerDestino({ destino: { grupos: [avisos] } }, CAMPANHA, [avisos]), {
    ok: true,
    destino: { grupos: [avisos] },
  });
  assert.deepEqual(lerDestino({ destino: { grupos: [avisos] } }, CAMPANHA), { ok: false, error: DE_FORA });
  // Comunidade sem grupo vinculado: o Avisos é o único destino possível.
  assert.deepEqual(lerDestino({ destino: { grupos: [avisos] } }, { group_ids: [] }, [avisos]), {
    ok: true,
    destino: { grupos: [avisos] },
  });
});

test("lista vazia é recusada", () => {
  assert.deepEqual(lerDestino({ destino: { grupos: [] } }, CAMPANHA), { ok: false, error: LISTA_VAZIA });
  assert.deepEqual(lerDestino({ destino: { grupos: ["  "] } }, CAMPANHA), { ok: false, error: LISTA_VAZIA });
  // `groupIds: []` era "todos" antes; agora é lista vazia como qualquer outra.
  assert.deepEqual(lerDestino({ groupIds: [] }, CAMPANHA), { ok: false, error: LISTA_VAZIA });
});

test("campanha sem grupos mantém a mensagem de sempre", () => {
  assert.deepEqual(lerDestino({}, { group_ids: [] }), { ok: false, error: SEM_GRUPOS });
  assert.deepEqual(lerDestino({ destino: { regra: "com_gente" } }, { group_ids: [] }), { ok: false, error: SEM_GRUPOS });
  assert.deepEqual(lerDestino({ groupIds: [] }, { group_ids: [] }), { ok: false, error: SEM_GRUPOS });
});

test("forma inválida de destino é recusada", () => {
  for (const destino of ["menos_enchendo", ["g1@g.us"], {}, { grupos: "g1@g.us" }, { grupos: [1] }]) {
    assert.equal(lerDestino({ destino }, CAMPANHA).ok, false, JSON.stringify(destino));
  }
});

test("a mensagem de regra vazia é a do contrato", () => {
  assert.equal(NENHUM_GRUPO_NA_REGRA, "Nenhum grupo nesta regra agora.");
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/destino.test.ts
```

  Esperado: FAIL — `Cannot find module './destino'`.

- [ ] **Step 3 (GREEN):** criar `apps/web/src/lib/campaigns/destino.ts`:

```ts
/**
 * Para quais grupos um post vai (spec postar-por-grupo §6.5, D5–D8). Puro, sem
 * I/O e sem `server-only`: a rota de mensagens valida com ele e a tela usa o
 * mesmo `Destino` e o mesmo padrão.
 *
 * Regra = guardada no disparo (`broadcasts.target_rule`) e refeita pelo banco a
 * cada envio (`app.alvos_do_disparo`). Lista fixa = exatamente aqueles grupos.
 */
import { isRegraDestino, type RegraDestino } from "@/lib/groups/estado";

export type Destino = { regra: RegraDestino } | { grupos: string[] };

const REGRA_PADRAO: RegraDestino = "menos_enchendo";

/** D5: o padrão seguro. Antes do seletor, post sem lista ia para todos os grupos. */
export const DESTINO_PADRAO: Destino = { regra: REGRA_PADRAO };

export const NENHUM_GRUPO_NA_REGRA = "Nenhum grupo nesta regra agora.";

const SEM_GRUPOS = "Esta campanha ainda não tem grupos. Escolha os grupos antes de disparar.";
const DESTINO_INVALIDO = "Destino inválido.";
const REGRA_INVALIDA = "Regra de destino inválida.";
const LISTA_INVALIDA = "Lista de grupos inválida.";
const LISTA_VAZIA = "Escolha ao menos um grupo.";
const GRUPO_DE_FORA = "Um dos grupos escolhidos não está nesta campanha. Recarregue a página e escolha de novo.";

type Lido = { ok: true; destino: Destino } | { ok: false; error: string };
type Campanha = { group_ids: string[] };

/**
 * `permitidosExtras`: grupos aceitos na lista fixa mesmo fora de `group_ids` —
 * hoje só o Avisos da comunidade nativa, que `reconciliar.ts` tira de
 * `group_ids` de propósito.
 */
export function lerDestino(body: Record<string, unknown>, campanha: Campanha, permitidosExtras: readonly string[] = []): Lido {
  const bruto = body.destino;
  if (bruto !== undefined && bruto !== null) {
    if (typeof bruto !== "object" || Array.isArray(bruto)) return { ok: false, error: DESTINO_INVALIDO };
    const destino = bruto as Record<string, unknown>;
    if ("regra" in destino) return lerRegra(destino.regra, campanha);
    if ("grupos" in destino) return lerLista(destino.grupos, campanha, permitidosExtras);
    return { ok: false, error: DESTINO_INVALIDO };
  }
  // Compatibilidade: antes do seletor, `groupIds` era a lista do disparo.
  if (body.groupIds !== undefined && body.groupIds !== null) return lerLista(body.groupIds, campanha, permitidosExtras);
  return lerRegra(REGRA_PADRAO, campanha);
}

function lerRegra(regra: unknown, campanha: Campanha): Lido {
  if (!isRegraDestino(regra)) return { ok: false, error: REGRA_INVALIDA };
  if (campanha.group_ids.length === 0) return { ok: false, error: SEM_GRUPOS };
  return { ok: true, destino: { regra } };
}

function lerLista(bruto: unknown, campanha: Campanha, extras: readonly string[]): Lido {
  if (!Array.isArray(bruto) || !bruto.every((jid): jid is string => typeof jid === "string")) {
    return { ok: false, error: LISTA_INVALIDA };
  }
  const grupos = [...new Set(bruto.map((jid) => jid.trim()).filter(Boolean))];
  if (grupos.length === 0) {
    return { ok: false, error: campanha.group_ids.length === 0 && extras.length === 0 ? SEM_GRUPOS : LISTA_VAZIA };
  }
  const permitidos = new Set([...campanha.group_ids, ...extras]);
  if (grupos.some((jid) => !permitidos.has(jid))) return { ok: false, error: GRUPO_DE_FORA };
  return { ok: true, destino: { grupos } };
}
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/destino.test.ts
```

  Esperado: `ℹ tests 12`, `ℹ pass 12`, `ℹ fail 0`.

- [ ] **Step 5:** tipos:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```

  Esperado: sem saída.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/lib/campaigns/destino.ts apps/web/src/lib/campaigns/destino.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(destino): read a post destination as a rule or a fixed group list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `createBroadcast` grava a regra + teste de integração do enqueue

**Files:**
- Modify: `apps/web/src/lib/stores/broadcasts.ts:1-2` (imports), `:6-33` (tipo `Broadcast`), `:47-86` (`createBroadcast`)
- Create: `apps/web/src/lib/stores/broadcasts-regra.integration.test.ts`

**Depends-on:** Task 0

**Interfaces:**
- Consome: `RegraDestino` (PR 2); RPC `enqueue_broadcast` → `app.alvos_do_disparo(b)` (PR 1): com `target_rule`, os JIDs de `app.alvos_da_regra(tenant, campanha, regra)`; campanha nula → `'{}'` e `failed` "Nenhum grupo nesta regra agora."
- Produz: `Broadcast.target_rule: RegraDestino | null`; `createBroadcast(tenantId, input: { …; target_rule?: RegraDestino | null })`.

- [ ] **Step 1 (RED):** criar `apps/web/src/lib/stores/broadcasts-regra.integration.test.ts`:

```ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import type { RegraDestino } from "@/lib/groups/estado";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createBroadcast, enqueueBroadcast } from "./broadcasts";

/**
 * Contra o Supabase de DEV (job e2e do CI). A regra de destino vive no SQL
 * (`app.alvos_do_disparo` → `app.grupo_na_regra`) e o elo que a liga ao app é o
 * `target_rule` gravado por `createBroadcast`. Sem ele, o disparo cai no
 * predicado antigo — `group_ids` vazio = TODOS os grupos admin. Só o banco real
 * mostra isso (spec postar-por-grupo §8 e §11 item 2).
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const jid = (nome: string) => `destino-${RUN}-${nome}@g.us`;

// Na ordem do pool. O lotado vem marcado à mão (9 de 10 fica abaixo dos 95%),
// para o teste não depender do trigger da marca; o resto cai no estado pela
// contagem: o 1º disponível é o enchendo, 1 membro é vazio, sem admin sai das regras.
const GRUPOS = [
  { nome: "lotado", members: 9, capacity: 10, isAdmin: true, lotado: true },
  { nome: "enchendo", members: 5, capacity: 100, isAdmin: true, lotado: false },
  { nome: "fila", members: 5, capacity: 100, isAdmin: true, lotado: false },
  { nome: "vazio", members: 1, capacity: 100, isAdmin: true, lotado: false },
  { nome: "sem-admin", members: 5, capacity: 100, isAdmin: false, lotado: false },
];

const ESPERADO: Record<RegraDestino, string[]> = {
  menos_enchendo: [jid("lotado"), jid("fila")],
  lotados: [jid("lotado")],
  com_gente: [jid("lotado"), jid("enchendo"), jid("fila")],
};

let campanhaId = "";
let instanciaId = "";
const broadcastIds: string[] = [];

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

before(async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();

  const { error: erroGrupos } = await supabase.from("groups").insert(
    GRUPOS.map((g) => ({
      tenant_id: TENANT,
      whatsapp_group_id: jid(g.nome),
      name: `destino ${RUN} ${g.nome}`,
      members: g.members,
      capacity: g.capacity,
      is_admin: g.isAdmin,
      invite_url: `https://chat.whatsapp.com/destino${RUN}${g.nome.replace("-", "")}`,
      ...(g.lotado ? { lotado_em: agora, lotado_por: "manual" } : {}),
    })),
  );
  if (erroGrupos) throw new Error(erroGrupos.message);

  // Em 2020: longe da lista de campanhas que as telas do QA mostram primeiro.
  const { data: campanha, error: erroCampanha } = await supabase
    .from("campaign_groups")
    .insert({
      tenant_id: TENANT,
      name: `destino-${RUN}`,
      slug: `destino-${RUN}`,
      group_ids: GRUPOS.map((g) => jid(g.nome)),
      created_at: "2020-01-01T00:00:00.000Z",
    })
    .select("id")
    .single();
  if (erroCampanha) throw new Error(erroCampanha.message);
  campanhaId = campanha!.id as string;

  // O QA não tem número (os e2e de "sem número" contam com isso): este é só do
  // teste. Conectado, porque `enqueue_broadcast` só resolve destino com número;
  // pausado, para nenhum claim (worker de dev, schedules.integration em
  // paralelo) levar os comandos antes da conferência.
  const { data: instancia, error: erroInstancia } = await supabase
    .from("instances")
    .insert({
      tenant_id: TENANT,
      name: `destino-${RUN}`,
      status: "connected",
      provider_instance_id: `destino-${RUN}`,
      connected_at: agora,
    })
    .select("id")
    .single();
  if (erroInstancia) throw new Error(erroInstancia.message);
  instanciaId = instancia!.id as string;

  const { error: erroPausa } = await supabase
    .from("instance_send_state")
    .upsert(
      { instance_id: instanciaId, tenant_id: TENANT, paused_until: new Date(Date.now() + 3_600_000).toISOString() },
      { onConflict: "instance_id" },
    );
  if (erroPausa) throw new Error(erroPausa.message);
});

after(async () => {
  if (!TENANT || EM_PRODUCAO) return;
  const supabase = getSupabaseAdmin();
  if (broadcastIds.length) {
    await supabase.from("engine_commands").delete().eq("tenant_id", TENANT).in("origin_id", broadcastIds);
    await supabase.from("broadcasts").delete().eq("tenant_id", TENANT).in("id", broadcastIds);
  }
  // Comandos e estado de envio do número caem junto (on delete cascade).
  if (instanciaId) await supabase.from("instances").delete().eq("tenant_id", TENANT).eq("id", instanciaId);
  if (campanhaId) await supabase.from("campaign_groups").delete().eq("tenant_id", TENANT).eq("id", campanhaId);
  await supabase.from("groups").delete().eq("tenant_id", TENANT).in("whatsapp_group_id", GRUPOS.map((g) => jid(g.nome)));
});

async function jidsDoRun(runId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("engine_commands")
    .select("payload")
    .eq("tenant_id", TENANT)
    .eq("origin_run_id", runId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => String((c.payload as { jid?: unknown }).jid)).sort();
}

for (const regra of ["menos_enchendo", "lotados", "com_gente"] as const) {
  test(`regra ${regra}: o run manda exatamente para os grupos dela`, async () => {
    if (pular()) return;
    const criado = await createBroadcast(TENANT, {
      campaign_group_id: campanhaId,
      name: `destino-${RUN}`,
      message: "teste de destino",
      group_ids: [],
      target_rule: regra,
    });
    broadcastIds.push(criado.id);
    assert.equal(criado.target_rule, regra);

    const enfileirado = await enqueueBroadcast(TENANT, criado.id);
    assert.equal(enfileirado?.status, "queued", enfileirado?.error ?? "sem erro");
    // O enchendo fica fora de "menos_enchendo"; o sem-admin e o vazio, de todas.
    assert.deepEqual(await jidsDoRun(enfileirado!.run_id!), [...ESPERADO[regra]].sort());
    assert.equal(enfileirado?.total, ESPERADO[regra].length);
  });
}

test("lista fixa vai só para a lista, inclusive o grupo que está enchendo (D6)", async () => {
  if (pular()) return;
  const criado = await createBroadcast(TENANT, {
    campaign_group_id: campanhaId,
    name: `destino-${RUN}`,
    message: "teste de lista fixa",
    group_ids: [jid("enchendo")],
  });
  broadcastIds.push(criado.id);
  assert.equal(criado.target_rule, null);

  const enfileirado = await enqueueBroadcast(TENANT, criado.id);
  assert.deepEqual(await jidsDoRun(enfileirado!.run_id!), [jid("enchendo")]);
});

test("regra sem campanha (campanha apagada) falha com o motivo e nunca vira 'todos'", async () => {
  if (pular()) return;
  const criado = await createBroadcast(TENANT, {
    name: `destino-${RUN}`,
    message: "teste sem campanha",
    group_ids: [],
    target_rule: "menos_enchendo",
  });
  broadcastIds.push(criado.id);

  const enfileirado = await enqueueBroadcast(TENANT, criado.id);
  assert.equal(enfileirado?.status, "failed");
  assert.match(enfileirado?.error ?? "", /Nenhum grupo nesta regra agora\./);
  const { count, error } = await getSupabaseAdmin()
    .from("engine_commands")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
    .eq("origin_id", criado.id);
  if (error) throw new Error(error.message);
  assert.equal(count, 0);
});
```

- [ ] **Step 2 (GREEN):** em `apps/web/src/lib/stores/broadcasts.ts` — **pular a edição B se o Task 0 Step 6 mostrou `target_rule` no tipo**.

  Edição A — imports. Trocar:

```ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
```

  por:

```ts
import "server-only";
import type { RegraDestino } from "@/lib/groups/estado";
import { getSupabaseAdmin } from "@/lib/supabase/server";
```

  Edição B — tipo. Trocar:

```ts
  funnel_template_id: string | null;
  funnel_run_id: string | null;
  created_at: string;
  updated_at: string;
};
```

  por:

```ts
  funnel_template_id: string | null;
  funnel_run_id: string | null;
  /** Regra de destino (D8): refeita pelo banco a cada envio. Null = lista fixa em `group_ids`. */
  target_rule: RegraDestino | null;
  created_at: string;
  updated_at: string;
};
```

  Edição C — entrada de `createBroadcast`. Trocar:

```ts
    funnel_template_id?: string;
    funnel_run_id?: string;
  },
): Promise<Broadcast> {
```

  por:

```ts
    funnel_template_id?: string;
    funnel_run_id?: string;
    /** Regra de destino (D8). Com regra, `group_ids` vai vazio. */
    target_rule?: RegraDestino | null;
  },
): Promise<Broadcast> {
```

  Edição D — insert. Trocar:

```ts
      funnel_template_id: input.funnel_template_id ?? null,
      funnel_run_id: input.funnel_run_id ?? null,
    })
    .select("*")
    .single();
```

  por:

```ts
      funnel_template_id: input.funnel_template_id ?? null,
      funnel_run_id: input.funnel_run_id ?? null,
      // Só com regra: sem ela o insert é o mesmo de antes do seletor de destino.
      ...(input.target_rule ? { target_rule: input.target_rule } : {}),
    })
    .select("*")
    .single();
```

- [ ] **Step 3:** sem credencial o arquivo se pula sozinho (sai como **pass**, nunca `skip` — o passo de integração do CI reprova com `# skipped` > 0):

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/broadcasts-regra.integration.test.ts
```

  Esperado sem env: `ℹ pass 5`, `ℹ skipped 0`, e o log "E2E_TENANT_ID ausente — teste de integração pulado".

- [ ] **Step 4 (opcional, só com `.env.local` de dev e nenhum e2e de CI rodando):** conferir antes `gh run list --repo codingB0y/Girumo --workflow Verify --status in_progress --json databaseId,headBranch` vazio (o número conectado do teste fica visível ~1 s no QA). Rodar com o env carregado só neste processo:

```powershell
Set-Location <wt>\apps\web; Get-Content .env.local | Where-Object { $_ -match '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item -Path "env:$k" -Value $v.Trim('"') }; $env:E2E_TENANT_ID = "4483abf8-3483-40bf-a448-6b3ce9496374"; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/broadcasts-regra.integration.test.ts
```

  Esperado: `ℹ pass 5`. Mutante: comentar a linha `...(input.target_rule ? …)` da Edição D e rodar de novo → **FAIL** em "regra menos_enchendo", "regra lotados" e "regra com_gente" (o run vai para todos os grupos admin do QA). Desfazer com `git -C <wt> checkout -- apps/web/src/lib/stores/broadcasts.ts` **só depois do commit do Step 6** — antes disso, desfazer à mão e conferir com `git -C <wt> diff -- apps/web/src/lib/stores/broadcasts.ts`. Sem credencial: a prova é o passo "Integracao das stores contra o banco de dev" do job `e2e` do PR (Task 5).

- [ ] **Step 5:** tipos:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```

  Esperado: sem saída.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/lib/stores/broadcasts.ts apps/web/src/lib/stores/broadcasts-regra.integration.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(broadcasts): store the destination rule on the broadcast" -m "Integration test against dev: a rule broadcast enqueues commands only for the rule's groups, never for the group being filled." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: a rota de mensagens lê o destino

**Files:**
- Modify: `apps/web/src/app/api/campanhas/[slug]/messages/route.ts` (imports `:1-16`; POST Supabase `:128-190`; helpers `:256`)
- Create: `apps/web/src/app/api/campanhas/[slug]/messages/route.test.ts`

**Depends-on:** Task 1, Task 2

**Interfaces:**
- Consome: `lerDestino`, `NENHUM_GRUPO_NA_REGRA` (Task 1); `listCampaignGroupStates(tenantId: string, campaignId: string): Promise<EstadoGrupo[]>` (PR 2, RPC `campaign_group_states` com `{ p_tenant, p_campaign }`); `listarComunidades(tenantId: string): Promise<Comunidade[]>` (`stores/communities.ts`, existente: `avisoGroupId: string | null`); `createBroadcast` com `target_rule` (Task 2).
- Produz: `POST /api/campanhas/[slug]/messages` com corpo `destino?: { regra } | { grupos }` (contrato §4). Ordem: auth → campanha (404) → destino (400) → data (400) → regra vazia no "enviar agora" (400) → teto do plano (402) → número (409) → funil (400) → grava.

- [ ] **Step 1 (RED):** criar `apps/web/src/app/api/campanhas/[slug]/messages/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { POST } from "./route";

/**
 * O POST de mensagens contra um Supabase de mentira (o PostgREST falso de
 * `api/orders/route.test.ts`). Cobre o que a rota decide ANTES de gravar: o
 * destino (spec postar-por-grupo §6.5). O passo seguinte é o teto do plano, e o
 * banco falso responde 500 nele: chegar lá — status 500, `GET /subscriptions`
 * feito e nenhum `POST /broadcasts` — prova que o destino passou sem gravar nada.
 */

const CAMPANHA_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const G1 = "120363001@g.us";
const G2 = "120363002@g.us";
const G3 = "120363003@g.us";
const COMUNIDADE = "120363777@g.us";
const AVISOS = "120363099@g.us";
const RPC = "/rest/v1/rpc/campaign_group_states";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

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
    const { status, corpo } = responder(chamada);
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

function campanha(over: Record<string, unknown> = {}) {
  return {
    id: CAMPANHA_ID,
    tenant_id: "loja-b",
    name: "Moda Kids do Sul",
    slug: "moda-kids",
    group_ids: [G1, G2, G3],
    auto_grow: false,
    grow_template: null,
    metadata: {},
    whatsapp_community_jid: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

/** Linha de `campaign_group_states` como o banco devolve (snake_case, contrato §1). */
function estado(posicao: number, jid: string, estadoDoGrupo: string, menosEnchendo: boolean) {
  return {
    posicao,
    group_id: `00000000-0000-4000-8000-00000000000${posicao}`,
    whatsapp_group_id: jid,
    name: `Moda Kids do Sul ${posicao}`,
    members: 500,
    capacity: 1024,
    is_admin: true,
    invite_url: "https://chat.whatsapp.com/x",
    lotado_em: null,
    lotado_por: null,
    reaberto_em: null,
    aviso_lotou_em: null,
    estado: estadoDoGrupo,
    pode_reabrir: false,
    na_regra_menos_enchendo: menosEnchendo,
    na_regra_lotados: false,
    na_regra_com_gente: estadoDoGrupo !== "vazio",
  };
}

/** Dono logado por Bearer na `loja-b`; o teto do plano para a rota; o resto vem de `tabelas`. */
function banco(tabelas: Record<string, () => Resposta>): (chamada: Chamada) => Resposta {
  return ({ metodo, url }) => {
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: "loja-b", role: "owner" }] };
    if (url.pathname === "/rest/v1/subscriptions") return { status: 500, corpo: { message: "parou no teto" } };
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela() : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

function postar(corpo: unknown): Promise<Response> {
  return POST(
    new Request("http://girumo.test/api/campanhas/moda-kids/messages", {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ slug: "moda-kids" }) },
  );
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

/** O destino passou: a rota foi até o teto do plano e não gravou disparo. */
function chegouAoTeto(res: Response) {
  assert.equal(res.status, 500);
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 1);
  assert.equal(feitas("POST", "/rest/v1/broadcasts").length, 0);
}

test("lista fixa com grupo de fora da campanha: 400, sem teto e sem gravar", async () => {
  chamadas.length = 0;
  responder = banco({ "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }) });

  // Mutante: a rota de antes, que usava `body.groupIds` sem conferir nada.
  const res = await postar({ body: "oferta", groupIds: [G1, "120363999@g.us"] });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "Um dos grupos escolhidos não está nesta campanha. Recarregue a página e escolha de novo.",
  });
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 0);
  assert.equal(feitas("POST", "/rest/v1/broadcasts").length, 0);
  // Campanha comum não paga a consulta do Avisos.
  assert.equal(feitas("GET", "/rest/v1/groups").length, 0);
  const [busca] = feitas("GET", "/rest/v1/campaign_groups");
  assert.equal(busca.url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("regra fora do contrato: 400", async () => {
  chamadas.length = 0;
  responder = banco({ "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }) });

  const res = await postar({ body: "oferta", destino: { regra: "todos" } });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Regra de destino inválida." });
  assert.equal(feitas("POST", RPC).length, 0);
});

test("enviar agora sem destino: lê o estado na hora e recusa quando a regra padrão está vazia", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }),
    // Só o grupo que está enchendo e um vazio: "todos menos o que está enchendo" dá zero.
    [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "enchendo", false), estado(2, G2, "vazio", false)] }),
  });

  // Mutante: padrão "com_gente" (ou o "todos" de antes) mandaria para o G1, que está enchendo.
  const res = await postar({ body: "oferta" });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Nenhum grupo nesta regra agora." });
  // O estado é lido NESTE envio, da campanha e do tenant da rota — nunca o que a tela viu ao abrir.
  const [rpc] = feitas("POST", RPC);
  assert.deepEqual(rpc.corpo, { p_tenant: "loja-b", p_campaign: CAMPANHA_ID });
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 0);
});

test("regra com grupo agora segue para o teto do plano (o destino não pula o gate)", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }),
    [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "enchendo", false), estado(2, G2, "fila", true)] }),
  });

  chegouAoTeto(await postar({ body: "oferta", destino: { regra: "menos_enchendo" } }));
  assert.equal(feitas("POST", RPC).length, 1);
});

test("agendado com regra não consulta o estado agora: até a hora, algum grupo pode lotar", async () => {
  chamadas.length = 0;
  responder = banco({ "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }) });
  const amanha = new Date(Date.now() + 86_400_000).toISOString();

  chegouAoTeto(await postar({ body: "oferta", destino: { regra: "lotados" }, scheduledAt: amanha }));
  assert.equal(feitas("POST", RPC).length, 0);
});

test("comunidade nativa: o Avisos passa como lista fixa mesmo fora de group_ids", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha({ whatsapp_community_jid: COMUNIDADE })] }),
    "GET /rest/v1/groups": () => ({
      status: 200,
      corpo: [{ community_jid: COMUNIDADE, whatsapp_group_id: AVISOS, members: 3000, is_admin: true }],
    }),
  });

  // Mutante: conferir só `group_ids` quebraria o "Enviar pelo Avisos" da aba.
  chegouAoTeto(await postar({ body: "aviso", destino: { grupos: [AVISOS] } }));
  const [avisos] = feitas("GET", "/rest/v1/groups");
  assert.equal(avisos.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(avisos.url.searchParams.get("community_role"), "eq.announce");
});
```

- [ ] **Step 2:** rodar e ver falhar (o `[[]slug]` escapa o glob do node 24):

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test "src/app/api/campanhas/[[]slug]/messages/route.test.ts"
```

  Esperado: `ℹ tests 6`, **FAIL em 5** ("lista fixa…" e "regra fora…" recebem 500 do teto; "enviar agora…" recebe 500; "regra com grupo…" não chama a RPC; "comunidade…" não consulta `groups`). "agendado com regra…" passa também no código antigo — é o que garante que o agendado não muda de comportamento. Se aparecer `ℹ tests 0`, o caminho não foi escapado.

- [ ] **Step 3 (GREEN):** editar `apps/web/src/app/api/campanhas/[slug]/messages/route.ts`.

  Edição A — trocar:

```ts
import * as supaCampaigns from "@/lib/stores/campaign-groups";
```

  por:

```ts
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import { listCampaignGroupStates } from "@/lib/stores/campaign-group-states";
import { listarComunidades } from "@/lib/stores/communities";
```

  Edição B — trocar:

```ts
import { resolvePostMediaType } from "@/lib/campaigns/post-media";
```

  por:

```ts
import { resolvePostMediaType } from "@/lib/campaigns/post-media";
import { NENHUM_GRUPO_NA_REGRA, lerDestino } from "@/lib/campaigns/destino";
```

  Edição C — trocar (só existe no caminho Supabase):

```ts
  const groupIds = Array.isArray(body.groupIds) && body.groupIds.length > 0
    ? body.groupIds.map(String)
    : camp.group_ids;

  if (groupIds.length === 0) {
    return Response.json(
      { error: "Esta campanha ainda não tem grupos. Escolha os grupos antes de disparar." },
      { status: 400 },
    );
  }
```

  por:

```ts
  // Destino conferido antes de qualquer gate. Lista fixa só com grupo desta
  // campanha (antes não havia conferência nenhuma); sem destino, a regra padrão
  // em vez de "todos" (D5). O Avisos da comunidade nativa é a única exceção.
  const lido = lerDestino(body, camp, await avisosPermitidos(tenantId, camp));
  if (!lido.ok) return Response.json({ error: lido.error }, { status: 400 });
  const destino = lido.destino;

  const scheduledAt = parseScheduledAt(body.scheduledAt);
  if (body.scheduledAt && !scheduledAt) {
    return Response.json({ error: "Data de agendamento inválida." }, { status: 400 });
  }

  // A regra é refeita pelo banco no envio (`app.alvos_do_disparo`). Enviar agora
  // com ela vazia viraria um disparo `failed` no histórico: melhor dizer já. O
  // estado é lido AGORA, nunca o que a tela viu ao abrir. Agendado passa: até a
  // hora, algum grupo pode lotar.
  if ("regra" in destino && !scheduledAt) {
    const regra = destino.regra;
    const estados = await listCampaignGroupStates(tenantId, camp.id);
    if (!estados.some((g) => g.naRegra[regra])) {
      return Response.json({ error: NENHUM_GRUPO_NA_REGRA }, { status: 400 });
    }
  }
```

  Edição D — trocar:

```ts
    // Mesmo teto do outro caminho de envio (`/api/broadcasts`). Ficar so num dos
    // dois seria um limite que o cliente contorna trocando de tela.
    await assertPlanLimit(tenantId, "contacts:reach");
```

  por:

```ts
    // Mesmo teto do outro caminho de envio (`/api/broadcasts`). Ficar so num dos
    // dois seria um limite que o cliente contorna trocando de tela. Conta `leads`
    // do tenant, nao grupos: regra ou lista fixa, o teto e o mesmo.
    await assertPlanLimit(tenantId, "contacts:reach");
```

  Edição E — a data já foi lida acima. Trocar:

```ts
  const authUserId = await getSessionAccountId();

  const scheduledAt = parseScheduledAt(body.scheduledAt);
  if (body.scheduledAt && !scheduledAt) {
    return Response.json({ error: "Data de agendamento inválida." }, { status: 400 });
  }

  const funnel = parseFunnelFields(body);
```

  por:

```ts
  const authUserId = await getSessionAccountId();

  const funnel = parseFunnelFields(body);
```

  Edição F — trocar:

```ts
    message: messageBody,
    group_ids: groupIds,
    media_id: body.mediaId ? String(body.mediaId) : undefined,
```

  por:

```ts
    message: messageBody,
    // Regra: `group_ids` fica vazio e quem resolve os grupos é o banco, no envio.
    group_ids: "grupos" in destino ? destino.grupos : [],
    target_rule: "regra" in destino ? destino.regra : null,
    media_id: body.mediaId ? String(body.mediaId) : undefined,
```

  Edição G — trocar:

```ts
// --- helpers ---
```

  por:

```ts
// --- helpers ---

/**
 * O Avisos de uma comunidade nativa nunca está em `group_ids` (`reconciliar.ts`
 * o tira de propósito), mas é destino legítimo: é o "Enviar pelo Avisos" da aba.
 * Campanha comum não paga a consulta.
 */
async function avisosPermitidos(
  tenantId: string,
  camp: { id: string; whatsapp_community_jid: string | null },
): Promise<string[]> {
  if (!camp.whatsapp_community_jid) return [];
  const comunidade = (await listarComunidades(tenantId)).find((c) => c.id === camp.id);
  return comunidade?.avisoGroupId ? [comunidade.avisoGroupId] : [];
}
```

- [ ] **Step 4:** rodar o teste da rota, o de destino e o dos tetos:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test "src/app/api/campanhas/[[]slug]/messages/route.test.ts" src/lib/campaigns/destino.test.ts src/lib/billing/send-gates.test.ts
```

  Esperado: `ℹ tests 20`, `ℹ fail 0` (6 + 12 + 2).

- [ ] **Step 5:** tipos e lint:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json; npm run lint
```

  Esperado: tsc sem saída; lint sem erro.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add "apps/web/src/app/api/campanhas/[slug]/messages/route.ts" "apps/web/src/app/api/campanhas/[slug]/messages/route.test.ts"
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(messages): post by destination rule and reject groups outside the campaign" -m "No destination now means the safe default (all but the group being filled). Sending now with an empty rule answers 400 from the state read at send time; scheduled posts are accepted. The native community Avisos group stays allowed." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7 (mutantes, depois do commit):**
  1. Em `apps/web/src/lib/campaigns/destino.ts`, trocar `const REGRA_PADRAO: RegraDestino = "menos_enchendo";` por `"com_gente"` e rodar o Step 4 → **FAIL** em "enviar agora sem destino…" (e no primeiro teste de `destino.test.ts`). Desfazer: `git -C <wt> checkout -- apps/web/src/lib/campaigns/destino.ts`.
  2. Na rota, apagar o bloco `if ("regra" in destino && !scheduledAt) { … }` e rodar o Step 4 → **FAIL** em "enviar agora sem destino…" e "regra com grupo agora…". Desfazer: `git -C <wt> checkout -- "apps/web/src/app/api/campanhas/[slug]/messages/route.ts"`.

  Conferir `git -C <wt> status --short` limpo. Algum mutante sem FAIL → o teste não vale; corrigir o teste antes de seguir.

---

### Task 4: histórico — a regra enquanto o disparo não rodou

**Files:**
- Modify: `apps/web/src/lib/campaigns/dispatch-view.ts` (`:9-11` import, `:34-36` `BroadcastRow`, `:70-73` `DispatchView`, `:124-127` fim de `toDispatchView`)
- Modify: `apps/web/src/lib/campaigns/dispatch-view.test.ts` (`:2-10` imports, antes de `:193` `console.log`)

**Depends-on:** Task 0

**Interfaces:**
- Consome: `ROTULO_REGRA`, `isRegraDestino`, `RegraDestino` (PR 2).
- Produz: `BroadcastRow.target_rule?: string | null`; `DispatchView.targetRule?: RegraDestino`; `export function regraPendente(d: Pick<DispatchView, "targetRule" | "status">): string | null` (a tela usa no 5b).

- [ ] **Step 1 (RED):** em `apps/web/src/lib/campaigns/dispatch-view.test.ts`, trocar:

```ts
  indexSchedulesByBroadcast,
  resolveDispatchType,
```

  por:

```ts
  indexSchedulesByBroadcast,
  regraPendente,
  resolveDispatchType,
```

  e trocar:

```ts
console.log("dispatch-view tests passed");
```

  por:

```ts
// --- destino por regra (postar por grupo) ----------------------------------

// Agendado com regra: o histórico mostra a regra, não "0 / 0 grupos".
const regraAgendada = toDispatchView(
  broadcast({ id: "r1", group_ids: [], total: 0, target_rule: "menos_enchendo" }),
  "camp",
  schedule({ id: "s1", broadcast_id: "r1" }),
);
assert.equal(regraAgendada.targetRule, "menos_enchendo");
assert.equal(regraPendente(regraAgendada), "Regra: Todos menos o que está enchendo");

// Rascunho com regra (ainda não enfileirou) também.
assert.equal(
  regraPendente(toDispatchView(broadcast({ id: "r2", group_ids: [], total: 0, target_rule: "lotados" }), "camp", null)),
  "Regra: Só lotados",
);

// Depois que o banco refez a lista, vale o total real do run.
for (const status of ["queued", "running", "sent", "failed"] as const) {
  const rodou = toDispatchView(broadcast({ id: "r3", target_rule: "com_gente", status, sent: 12, total: 13 }), "camp", null);
  assert.equal(regraPendente(rodou), null, status);
  assert.equal(rodou.total, 13);
}

// Semanal depois do 1º envio: o agendamento seguinte não esconde o total real.
assert.equal(
  regraPendente(
    toDispatchView(
      broadcast({ id: "r4", target_rule: "menos_enchendo", status: "sent", sent: 13, total: 13 }),
      "camp",
      schedule({ id: "s4", broadcast_id: "r4", recurrence: "weekly" }),
    ),
  ),
  null,
);

// Lista fixa não tem regra; valor fora do contrato não vira rótulo.
assert.equal(regraPendente(toDispatchView(broadcast({ id: "r5" }), "camp", schedule({ id: "s5", broadcast_id: "r5" }))), null);
assert.equal(toDispatchView(broadcast({ id: "r6", target_rule: "todos" }), "camp", null).targetRule, undefined);

console.log("dispatch-view tests passed");
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/dispatch-view.test.ts
```

  Esperado: FAIL — `regraPendente is not a function` (ou `does not provide an export named 'regraPendente'`).

- [ ] **Step 3 (GREEN):** em `apps/web/src/lib/campaigns/dispatch-view.ts`.

  Edição A — trocar:

```ts
 * ler broadcasts e devolver o mesmo contrato.
 */

export type DispatchStatus =
```

  por:

```ts
 * ler broadcasts e devolver o mesmo contrato.
 */

import { ROTULO_REGRA, isRegraDestino, type RegraDestino } from "@/lib/groups/estado";

export type DispatchStatus =
```

  Edição B — trocar:

```ts
  funnel_template_id?: string | null;
  funnel_run_id?: string | null;
};
```

  por:

```ts
  funnel_template_id?: string | null;
  funnel_run_id?: string | null;
  /** Regra de destino (postar por grupo). Null = lista fixa em `group_ids`. */
  target_rule?: string | null;
};
```

  Edição C — trocar:

```ts
  funnelTemplateId?: string;
  funnelRunId?: string;
};
```

  por:

```ts
  funnelTemplateId?: string;
  funnelRunId?: string;
  /** Presente só em disparo com regra de destino; ausente = lista fixa. */
  targetRule?: RegraDestino;
};
```

  Edição D — trocar:

```ts
    funnelRunId: broadcast.funnel_run_id ?? undefined,
  };
}
```

  por:

```ts
    funnelRunId: broadcast.funnel_run_id ?? undefined,
    targetRule: isRegraDestino(broadcast.target_rule) ? broadcast.target_rule : undefined,
  };
}

/**
 * Disparo com regra que ainda não rodou: o total só existe depois que o banco
 * refaz a lista no envio, então o histórico mostra a regra em vez de "0 / 0".
 * Rodou, está rodando ou falhou → `null`, e vale o total real do run.
 */
export function regraPendente(d: Pick<DispatchView, "targetRule" | "status">): string | null {
  if (!d.targetRule || (d.status !== "draft" && d.status !== "scheduled")) return null;
  return `Regra: ${ROTULO_REGRA[d.targetRule]}`;
}
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/dispatch-view.test.ts
```

  Esperado: `ℹ pass 1`, `ℹ fail 0` e a linha `dispatch-view tests passed`.

- [ ] **Step 5:** `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json` → sem saída.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/lib/campaigns/dispatch-view.ts apps/web/src/lib/campaigns/dispatch-view.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(disparos): dispatch view carries the destination rule until the run resolves it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4b: vendedora com `postar` lê os estados (só se o PR #415 estiver em `main`)

**Condição:** roda só se o Task 0 Step 5b deu `EXIT=0` para `origin/main:apps/web/src/lib/auth/modulos.ts` **e** a rota de estados não exige permissão que `seller` não tem. Senão, pular: a dependência fica registrada (Task 0 Step 5b) e não se cria `modulos.ts` aqui.

**Files:**
- Modify: `apps/web/src/lib/auth/modulos.ts` (`ROTAS.postar`, a linha `{ padrao: "/api/campanhas/*/messages", metodos: ["POST"] }`)
- Modify: `apps/web/src/lib/auth/modulos.test.ts` (`TABELA`, blocos "postar" e "postar não edita")

**Depends-on:** Task 0

**Interfaces:**
- Consome (PR #415): `ROTAS: Record<Modulo | "base", ReadonlyArray<{ padrao: string; metodos: readonly string[] }>>`; `podeAcessar(acesso: Acesso, pathname: string, method: string): boolean` (`*` = um segmento); o estrutural `modulos-rotas.test.ts` (todo padrão do mapa tem `route.ts` que exporta cada método liberado).
- Consome (PR 4): `GET /api/campanhas/[slug]/grupos/estados` (`route.ts` exporta `GET`).
- Produz: `ROTAS.postar` com `{ padrao: "/api/campanhas/*/grupos/estados", metodos: ["GET"] }` — o mesmo módulo que já libera `POST /api/campanhas/*/messages`. Só o `GET`; `grupos/lotado` (marcar/reabrir, PR 4) e `grupos/estado` (abrir/fechar grupo) continuam fechados para ela.

- [ ] **Step 1 (RED):** em `apps/web/src/lib/auth/modulos.test.ts`, trocar:

```ts
  ["POST", "/api/campanhas/promo-de-verao/messages", false, true],
```

  por:

```ts
  ["POST", "/api/campanhas/promo-de-verao/messages", false, true],
  // Seletor "Para quais grupos" de Disparos e da folha Postar (postar por grupo, PR 5): só leitura.
  ["GET", "/api/campanhas/promo-de-verao/grupos/estados", false, true],
```

  e trocar:

```ts
  ["POST", "/api/campanhas/promo-de-verao/messages/cancel", false, false],
```

  por:

```ts
  ["POST", "/api/campanhas/promo-de-verao/messages/cancel", false, false],
  // Ler os estados não é mexer neles: marcar/reabrir lotado e abrir/fechar grupo seguem do dono.
  ["POST", "/api/campanhas/promo-de-verao/grupos/estados", false, false],
  ["POST", "/api/campanhas/promo-de-verao/grupos/lotado", false, false],
  ["POST", "/api/campanhas/promo-de-verao/grupos/estado", false, false],
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/modulos.test.ts
```

  Esperado: FAIL em "vendedora: rota × método × módulo" com `GET /api/campanhas/promo-de-verao/grupos/estados (com postar)`.

- [ ] **Step 3 (GREEN):** em `apps/web/src/lib/auth/modulos.ts`, trocar:

```ts
    { padrao: "/api/campanhas/*/messages", metodos: ["POST"] },
```

  por:

```ts
    { padrao: "/api/campanhas/*/messages", metodos: ["POST"] },
    // Seletor "Para quais grupos" (`destino-grupos.tsx`) de Disparos e da folha: só leitura.
    { padrao: "/api/campanhas/*/grupos/estados", metodos: ["GET"] },
```

- [ ] **Step 4:** o teste da tabela, o estrutural (a rota existe e exporta `GET`) e o dos resolvedores:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/modulos.test.ts src/lib/auth/modulos-rotas.test.ts src/lib/auth/resolvedores-com-guard.test.ts
```

  Esperado: `ℹ fail 0`. Se `modulos-rotas.test.ts` reprovar com "nenhum route.ts em src/app/api/campanhas/*/grupos/estados", o PR 4 não está em `main` — voltar ao Task 0 Step 5.

- [ ] **Step 5:** `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json` → sem saída.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/lib/auth/modulos.ts apps/web/src/lib/auth/modulos.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "fix(auth): seller with the postar module reads campaign group states" -m "The destination picker in Disparos and the Post sheet calls GET /api/campanhas/[slug]/grupos/estados; without it the seller got 403 there. Read only: marking groups full and opening/closing groups stay closed." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7 (mutante, depois do commit):** trocar o padrão novo por `"/api/campanhas/*/grupos/*"` com `metodos: ["GET", "POST"]` e rodar o Step 4 → **FAIL** nas linhas `grupos/lotado`, `grupos/estado` e `POST …/grupos/estados`. Desfazer: `git -C <wt> checkout -- apps/web/src/lib/auth/modulos.ts`; `git -C <wt> status --short` limpo.

---

### Task 5: verificação, revisão e PR 5a

**Files:** nenhum novo.
**Depends-on:** Tasks 1–4 (e 4b, se rodou)

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez: `npx tsc --noEmit -p tsconfig.json` · `npx tsc --noEmit -p tsconfig.e2e.json` · `npm run lint` · `npm test` · `npx tsx scripts/check-painel-vitrine.ts`. Esperado: tudo limpo; `npm test` com `ℹ fail 0` (os `*.integration.test.ts` saem como pass sem credencial).

- [ ] **Step 2:** o gate real:

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`.

- [ ] **Step 3:** revisão do diff inteiro (superpowers:requesting-code-review) sobre `git -C <wt> diff origin/main...HEAD`, com foco em: (1) nenhum caminho de POST grava sem passar pelo teto do plano e pelo número conectado; (2) o filtro de tenant em toda query nova (a do Avisos via `listarComunidades`); (3) `group_ids` vazio só sai com `target_rule` preenchido; (4) caminho JSON legado intocado. CRITICAL/HIGH → corrigir, commitar, repetir os Steps 1–2.

- [ ] **Step 4:** defasagem: `git -C <wt> fetch origin main` e `git -C <wt> log HEAD..origin/main --oneline`. Commits novos → `git -C <wt> merge origin/main` (não rebase) e repetir os Steps 1–2.

- [ ] **Step 5:** `git -C <wt> status --short` limpo e `git -C <wt> log origin/main..HEAD --oneline` com os commits das Tasks 1–4 (e o da 4b, se rodou): 4 ou 5.

- [ ] **Step 6:** nenhum e2e de outro PR rodando no banco de dev (`finding-e2e-local-e-ci-corrida-no-mesmo-banco`): `gh run list --repo codingB0y/Girumo --workflow Verify --status in_progress --json databaseId,headBranch` vazio, senão esperar.

- [ ] **Step 7:** push (se o classificador negar, não tentar terceira variação: entregar os comandos ao Igor e esperar — `finding-classificador-bloqueia-merge-e-ddl`):

```powershell
git -C <wt> push -u origin feat/postar-grupo-destino
```

- [ ] **Step 8:** PR (Git Bash, por causa do heredoc):

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-destino --title "feat(postar): destino por regra na API de mensagens (postar por grupo, PR 5a)" --body "$(cat <<'EOF'
## O que entra

- `lib/campaigns/destino.ts`: `lerDestino(body, campanha, permitidosExtras)`. `destino: { regra }` ou `{ grupos }`; `groupIds` continua aceito como lista fixa; sem nada, `{ regra: "menos_enchendo" }` (D5).
- `POST /api/campanhas/[slug]/messages`: lista fixa só com grupo da campanha (ou o Avisos da comunidade nativa) — antes não havia conferência; regra gravada em `broadcasts.target_rule` e refeita pelo banco no envio; enviar agora com regra vazia → 400 "Nenhum grupo nesta regra agora.", lido do estado na hora; agendado é aceito.
- `createBroadcast` aceita `target_rule`.
- `dispatch-view.ts`: `targetRule` e `regraPendente()` para o histórico (a tela usa no PR 5b).
- `contacts:reach` conta `leads`, não grupos: o teto é o mesmo para regra e lista (conferido, só comentário).
- Vendedora com `postar`: `ROTAS.postar` libera `GET /api/campanhas/*/grupos/estados` (só leitura; `grupos/lotado` e `grupos/estado` seguem fechados).

## Para o lojista

Nada muda ainda: as telas seguem mandando `groupIds` com todos os grupos da campanha, que vira lista fixa conferida. O seletor e o padrão "Todos menos o que está enchendo" chegam no PR 5b.

## Teste

- [x] `destino.test.ts`, `route.test.ts` (PostgREST falso), `dispatch-view.test.ts`, `send-gates.test.ts`, `modulos.test.ts` + `modulos-rotas.test.ts`
- [x] mutantes: padrão `com_gente` e rota sem a leitura do estado derrubam o `route.test.ts`
- [ ] `broadcasts-regra.integration.test.ts` no job e2e (dev): regra gera comando só para os grupos certos, nunca para o que está enchendo
- [x] tsc x2, lint, npm test, painel:check, verify-local.ps1
- [ ] CI verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

  Task 4b pulada (#415 fora de `main`): no corpo, trocar o bullet da vendedora por "**Pendente (depende do #415):** `ROTAS.postar` precisa de `{ padrao: '/api/campanhas/*/grupos/estados', metodos: ['GET'] }`; sem isso a vendedora com `postar` vê erro no seletor do PR 5b (o post ainda sai pela regra padrão)" e tirar `modulos.test.ts` + `modulos-rotas.test.ts` da lista de testes.

- [ ] **Step 9:** CI (o número do PR sai do Step 8):

```powershell
gh pr checks <N> --repo codingB0y/Girumo --watch
```

  No log do job `e2e`, passo "Integracao das stores contra o banco de dev": as 5 linhas de `broadcasts-regra.integration.test.ts` com `ok`. E2E vermelho com 401/500 em specs alheios = corrida no banco de dev → `gh run rerun <run-id> --failed --repo codingB0y/Girumo` depois que o outro run terminar. PR atrás da main → `gh pr update-branch <N> --repo codingB0y/Girumo` (re-run reusa o SHA antigo).

- [ ] **Step 10:** merge **pelo Igor**, com CI verde (main sem proteção: nada de auto-merge):

```powershell
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

  Se o merge não puder sair agora, seguir para o 5b mesmo assim pela variante "empilhada" da Task 6 e dizer isso explicitamente no fim.

---

# PR 5b — tela: seletor, aba Posts/Funil, folha e Disparos

### Task 6: branch do 5b

**Files:** nenhum.
**Depends-on:** Task 5

- [ ] **Step 1:** `git -C <wt> fetch origin main` e conferir o 5a na main:

```powershell
git -C <wt> cat-file -e origin/main:apps/web/src/lib/campaigns/destino.ts; "EXIT=$LASTEXITCODE"
```

- [ ] **Step 2a (5a mergeado, `EXIT=0`):**

```powershell
git -C <wt> switch -c feat/postar-grupo-destino-tela origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> branch -D feat/postar-grupo-destino
```

- [ ] **Step 2b (5a ainda não mergeado, `EXIT≠0`):** empilhar localmente — **nunca abrir o PR do 5b com base no 5a** (CLAUDE.md, "Regra de PR"):

```powershell
git -C <wt> switch -c feat/postar-grupo-destino-tela feat/postar-grupo-destino
```

  Depois do merge do 5a (squash), antes do push do 5b (Task 13 Step 5): `git -C <wt> fetch origin main` e `git -C <wt> rebase --onto origin/main feat/postar-grupo-destino feat/postar-grupo-destino-tela`.

- [ ] **Step 3:** `git -C <wt> log HEAD..origin/main --oneline` → vazio no caminho 2a.

---

### Task 7: contas e frases do seletor (`destino-ui.ts`)

**Files:**
- Create: `apps/web/src/lib/campaigns/destino-ui.ts`
- Create: `apps/web/src/lib/campaigns/destino-ui.test.ts`

**Depends-on:** Task 6

**Interfaces:**
- Consome: `EstadoGrupo`, `EstadoDoGrupo`, `RegraDestino` (PR 2); `Destino`, `DESTINO_PADRAO` (Task 1); `frasePlural(n, singular, plural)` (`@/lib/painel/disparos`, existente).
- Produz:
  - `selecionados(grupos: readonly EstadoGrupo[], destino: Destino): string[]`
  - `alternar(grupos: readonly EstadoGrupo[], destino: Destino, jid: string): Destino`
  - `avisoEnchendo(grupos: readonly EstadoGrupo[], destino: Destino): EstadoGrupo | null`
  - `resumoDoDestino(grupos: readonly EstadoGrupo[], destino: Destino): { grupos: number; pessoas: number }`
  - `fraseResumo(r: { grupos: number; pessoas: number }): string`
  - `fraseVazios(grupos: readonly EstadoGrupo[], destino: Destino): string | null`
  - `FRASE_DA_REGRA: Record<RegraDestino, string>`
  - `fraseListaFixa(n: number): string`
  - `destinoDaCampanha(escolha: { slug: string; destino: Destino } | null, slug: string): Destino`

- [ ] **Step 1 (RED):** criar `apps/web/src/lib/campaigns/destino-ui.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { EstadoDoGrupo, EstadoGrupo } from "@/lib/groups/estado";
import { DESTINO_PADRAO } from "./destino";
import {
  FRASE_DA_REGRA,
  alternar,
  avisoEnchendo,
  destinoDaCampanha,
  fraseListaFixa,
  fraseResumo,
  fraseVazios,
  resumoDoDestino,
  selecionados,
} from "./destino-ui";

/** O que a API de estados manda: `naRegra` vem PRONTO do banco. */
function grupo(posicao: number, estado: EstadoDoGrupo, membros: number, naRegra: EstadoGrupo["naRegra"]): EstadoGrupo {
  return {
    posicao,
    groupId: `00000000-0000-4000-8000-00000000000${posicao}`,
    whatsappGroupId: `g${posicao}@g.us`,
    nome: `Moda Kids do Sul ${posicao}`,
    membros,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/x",
    lotadoEm: estado === "lotado" ? "2026-10-08T12:00:00.000Z" : null,
    lotadoPor: estado === "lotado" ? "auto" : null,
    reabertoEm: null,
    avisoLotouEm: null,
    estado,
    podeReabrir: false,
    naRegra,
  };
}

const FORA_DE_TODAS = { menos_enchendo: false, lotados: false, com_gente: false };

// Pool como o mockup: lotado, enchendo, fila, um "fila" que o banco tirou das
// regras (não somos admin) e um vazio.
const GRUPOS: EstadoGrupo[] = [
  grupo(1, "lotado", 1003, { menos_enchendo: true, lotados: true, com_gente: true }),
  grupo(2, "enchendo", 958, { menos_enchendo: false, lotados: false, com_gente: true }),
  grupo(3, "fila", 412, { menos_enchendo: true, lotados: false, com_gente: true }),
  { ...grupo(4, "fila", 300, FORA_DE_TODAS), isAdmin: false },
  grupo(5, "vazio", 1, FORA_DE_TODAS),
];

test("regra: o destino é o que o banco marcou em naRegra, na ordem do pool", () => {
  assert.deepEqual(selecionados(GRUPOS, { regra: "menos_enchendo" }), ["g1@g.us", "g3@g.us"]);
  assert.deepEqual(selecionados(GRUPOS, { regra: "lotados" }), ["g1@g.us"]);
  assert.deepEqual(selecionados(GRUPOS, { regra: "com_gente" }), ["g1@g.us", "g2@g.us", "g3@g.us"]);
});

test("a tela não recalcula a regra pelo estado: o 'fila' que o banco tirou fica de fora", () => {
  // Mutante: filtrar por g.estado em vez de naRegra levaria o g4 (sem admin).
  assert.equal(selecionados(GRUPOS, { regra: "menos_enchendo" }).includes("g4@g.us"), false);
  assert.equal(selecionados(GRUPOS, { regra: "com_gente" }).includes("g4@g.us"), false);
});

test("lista fixa: os marcados que existem nos estados, na ordem do pool", () => {
  assert.deepEqual(selecionados(GRUPOS, { grupos: ["g5@g.us", "g1@g.us", "sumiu@g.us"] }), ["g1@g.us", "g5@g.us"]);
});

test("mexer numa caixa a partir da regra vira lista fixa (D8)", () => {
  assert.deepEqual(alternar(GRUPOS, DESTINO_PADRAO, "g3@g.us"), { grupos: ["g1@g.us"] });
  assert.deepEqual(alternar(GRUPOS, DESTINO_PADRAO, "g5@g.us"), { grupos: ["g1@g.us", "g3@g.us", "g5@g.us"] });
});

test("na lista fixa a caixa marca e desmarca, sem carregar grupo que sumiu dos estados", () => {
  const fixa = { grupos: ["g1@g.us", "sumiu@g.us"] };
  assert.deepEqual(alternar(GRUPOS, fixa, "g2@g.us"), { grupos: ["g1@g.us", "g2@g.us"] });
  assert.deepEqual(alternar(GRUPOS, fixa, "g1@g.us"), { grupos: [] });
});

test("aviso amarelo só quando o grupo que está enchendo está no destino (D6)", () => {
  assert.equal(avisoEnchendo(GRUPOS, DESTINO_PADRAO), null);
  assert.equal(avisoEnchendo(GRUPOS, { regra: "com_gente" })?.nome, "Moda Kids do Sul 2");
  assert.equal(avisoEnchendo(GRUPOS, { grupos: ["g2@g.us"] })?.whatsappGroupId, "g2@g.us");
  assert.equal(avisoEnchendo(GRUPOS, { grupos: ["g1@g.us"] }), null);
});

test("resumo conta os grupos e soma as pessoas do destino", () => {
  assert.deepEqual(resumoDoDestino(GRUPOS, DESTINO_PADRAO), { grupos: 2, pessoas: 1415 });
  assert.equal(fraseResumo({ grupos: 2, pessoas: 1415 }), "2 grupos · 1.415 pessoas");
  assert.equal(fraseResumo({ grupos: 1, pessoas: 1 }), "1 grupo · 1 pessoa");
});

test("nota dos vazios: só os vazios que ficaram de fora (D7)", () => {
  assert.equal(fraseVazios(GRUPOS, DESTINO_PADRAO), "1 vazio fica de fora — marque à mão se quiser.");
  assert.equal(fraseVazios(GRUPOS, { grupos: ["g5@g.us"] }), null);
  const doisVazios = [...GRUPOS, grupo(6, "vazio", 1, FORA_DE_TODAS)];
  assert.equal(fraseVazios(doisVazios, DESTINO_PADRAO), "2 vazios ficam de fora — marque à mão se quiser.");
});

test("frases da regra e da lista fixa", () => {
  assert.match(FRASE_DA_REGRA.menos_enchendo, /refeita na hora do envio/);
  assert.match(FRASE_DA_REGRA.menos_enchendo, /enchendo na hora fica de fora/);
  assert.match(FRASE_DA_REGRA.com_gente, /inclusive o que estiver enchendo/);
  assert.match(FRASE_DA_REGRA.lotados, /só os grupos lotados/);
  assert.equal(fraseListaFixa(0), "Marque ao menos um grupo.");
  assert.equal(fraseListaFixa(1), "Você mexeu na lista: sai só neste grupo, mesmo que ele lote ou comece a encher até lá.");
  assert.equal(
    fraseListaFixa(3),
    "Você mexeu na lista: sai exatamente nestes 3 grupos, mesmo que algum lote ou comece a encher até lá.",
  );
});

test("trocar de campanha volta ao atalho padrão; a mesma campanha mantém a escolha", () => {
  const escolha = { slug: "moda-kids", destino: { grupos: ["g1@g.us"] } };
  assert.deepEqual(destinoDaCampanha(escolha, "moda-kids"), { grupos: ["g1@g.us"] });
  // Mutante: devolver a escolha sem olhar o slug mandaria a lista de uma campanha
  // para outra — 400 "grupo de fora" no melhor caso.
  assert.deepEqual(destinoDaCampanha(escolha, "outra"), DESTINO_PADRAO);
  assert.deepEqual(destinoDaCampanha(null, "moda-kids"), DESTINO_PADRAO);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/destino-ui.test.ts
```

  Esperado: FAIL — `Cannot find module './destino-ui'`.

- [ ] **Step 3 (GREEN):** criar `apps/web/src/lib/campaigns/destino-ui.ts`:

```ts
/**
 * Apresentação do seletor "Para quais grupos" (spec postar-por-grupo §6.5).
 * Pura e sem `server-only`. A pertinência a cada regra vem PRONTA do banco
 * (`naRegra`, de `app.grupo_na_regra`): aqui só se conta e se escreve o que já
 * veio marcado — nunca se recalcula regra pelo estado (spec §4).
 */
import type { EstadoGrupo, RegraDestino } from "@/lib/groups/estado";
import { frasePlural } from "@/lib/painel/disparos";
import { DESTINO_PADRAO, type Destino } from "./destino";

/** JIDs que o destino alcança, na ordem do pool. */
export function selecionados(grupos: readonly EstadoGrupo[], destino: Destino): string[] {
  if ("regra" in destino) {
    const regra = destino.regra;
    return grupos.filter((g) => g.naRegra[regra]).map((g) => g.whatsappGroupId);
  }
  const fixa = new Set(destino.grupos);
  return grupos.filter((g) => fixa.has(g.whatsappGroupId)).map((g) => g.whatsappGroupId);
}

/** Clique numa caixa. A partir de uma regra, mexer na lista vira lista fixa (D8). */
export function alternar(grupos: readonly EstadoGrupo[], destino: Destino, jid: string): Destino {
  const marcados = new Set(selecionados(grupos, destino));
  if (marcados.has(jid)) marcados.delete(jid);
  else marcados.add(jid);
  return { grupos: grupos.map((g) => g.whatsappGroupId).filter((j) => marcados.has(j)) };
}

/** O grupo que está enchendo, quando o destino o inclui: vira o aviso amarelo (D6). */
export function avisoEnchendo(grupos: readonly EstadoGrupo[], destino: Destino): EstadoGrupo | null {
  const marcados = new Set(selecionados(grupos, destino));
  return grupos.find((g) => g.estado === "enchendo" && marcados.has(g.whatsappGroupId)) ?? null;
}

export function resumoDoDestino(grupos: readonly EstadoGrupo[], destino: Destino): { grupos: number; pessoas: number } {
  const marcados = new Set(selecionados(grupos, destino));
  const doDestino = grupos.filter((g) => marcados.has(g.whatsappGroupId));
  return { grupos: doDestino.length, pessoas: doDestino.reduce((soma, g) => soma + Math.max(0, g.membros), 0) };
}

/** "13 grupos · 9.736 pessoas". */
export function fraseResumo(r: { grupos: number; pessoas: number }): string {
  return `${frasePlural(r.grupos, "grupo", "grupos")} · ${frasePlural(r.pessoas, "pessoa", "pessoas")}`;
}

/** D7: vazio fica fora de todo atalho, mas dá para marcar à mão. */
export function fraseVazios(grupos: readonly EstadoGrupo[], destino: Destino): string | null {
  const marcados = new Set(selecionados(grupos, destino));
  const fora = grupos.filter((g) => g.estado === "vazio" && !marcados.has(g.whatsappGroupId)).length;
  return fora === 0 ? null : `${frasePlural(fora, "vazio fica", "vazios ficam")} de fora — marque à mão se quiser.`;
}

export const FRASE_DA_REGRA: Record<RegraDestino, string> = {
  menos_enchendo:
    "A lista é refeita na hora do envio: grupo que lotar até lá entra; o que estiver enchendo na hora fica de fora.",
  lotados: "A lista é refeita na hora do envio: só os grupos lotados naquele momento.",
  com_gente: "A lista é refeita na hora do envio: todos os grupos com gente, inclusive o que estiver enchendo.",
};

export function fraseListaFixa(n: number): string {
  if (n === 0) return "Marque ao menos um grupo.";
  if (n === 1) return "Você mexeu na lista: sai só neste grupo, mesmo que ele lote ou comece a encher até lá.";
  return `Você mexeu na lista: sai exatamente nestes ${frasePlural(n, "grupo", "grupos")}, mesmo que algum lote ou comece a encher até lá.`;
}

/** A escolha vale só para a campanha em que foi feita (folha e Disparos trocam de campanha). */
export function destinoDaCampanha(escolha: { slug: string; destino: Destino } | null, slug: string): Destino {
  return escolha && escolha.slug === slug ? escolha.destino : DESTINO_PADRAO;
}
```

- [ ] **Step 4:** rodar de novo:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/destino-ui.test.ts
```

  Esperado: `ℹ tests 10`, `ℹ pass 10`.

- [ ] **Step 5:** `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json` → sem saída.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/lib/campaigns/destino-ui.ts apps/web/src/lib/campaigns/destino-ui.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(destino): selection, counts and copy for the group destination picker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7 (mutantes, depois do commit):**
  1. Em `selecionados`, trocar `g.naRegra[regra]` por `g.estado !== "vazio" && g.estado !== "enchendo"` → rodar o Step 4 → **FAIL** em "a tela não recalcula a regra…".
  2. Em `destinoDaCampanha`, trocar o corpo por `return escolha ? escolha.destino : DESTINO_PADRAO;` → **FAIL** em "trocar de campanha…".

  Desfazer cada um com `git -C <wt> checkout -- apps/web/src/lib/campaigns/destino-ui.ts` e conferir `git -C <wt> status --short` limpo.

---

### Task 8: componente `DestinoGrupos` e o hook dos estados

**Files:**
- Create: `apps/web/src/components/painel/messages/destino-grupos.tsx`

**Depends-on:** Task 7

**Interfaces:**
- Consome: `GET /api/campanhas/[slug]/grupos/estados` com a resposta tipada por `type EstadosDaCampanha` de `@/lib/groups/resumo-estados` (PR 4, Task 3 dele; só `grupos` é lido); `REGRAS`, `ROTULO_REGRA` (PR 2); `ChipDeEstado` de `@/components/painel/grupos/estado-do-grupo` (PR 4, Task 7 dele); funções da Task 7; `numero` (`@/lib/painel/grupos`); `cn` (`@/lib/utils`).
- Produz:
  - `export type CargaDosEstados = { carga: "carregando" } | { carga: "erro"; mensagem: string } | { carga: "pronto"; grupos: EstadoGrupo[] };`
  - `export function useCargaDosEstados(slug: string): CargaDosEstados` — slug vazio não busca; voltar ao mesmo slug busca de novo.
  - `export function DestinoGrupos(props: { estados: CargaDosEstados; value: Destino; onChange: (destino: Destino) => void; compacto?: boolean }): JSX.Element`

- [ ] **Step 1:** criar `apps/web/src/components/painel/messages/destino-grupos.tsx`:

```tsx
"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DESTINO_PADRAO, type Destino } from "@/lib/campaigns/destino";
import {
  FRASE_DA_REGRA,
  alternar,
  avisoEnchendo,
  fraseListaFixa,
  fraseResumo,
  fraseVazios,
  resumoDoDestino,
  selecionados,
} from "@/lib/campaigns/destino-ui";
import { ChipDeEstado } from "@/components/painel/grupos/estado-do-grupo";
import { REGRAS, ROTULO_REGRA, type EstadoGrupo } from "@/lib/groups/estado";
import type { EstadosDaCampanha } from "@/lib/groups/resumo-estados";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";

/** Três momentos da consulta, nunca dois: esperando ≠ falhou ≠ pronto. */
export type CargaDosEstados =
  | { carga: "carregando" }
  | { carga: "erro"; mensagem: string }
  | { carga: "pronto"; grupos: EstadoGrupo[] };

const CARREGANDO: CargaDosEstados = { carga: "carregando" };
const ERRO_ESTADOS = "Não deu pra carregar os grupos desta campanha agora. Recarregue a página para escolher os grupos.";

/**
 * Estados dos grupos da campanha (`GET .../grupos/estados`). Slug vazio = nada a
 * buscar (folha fechada, sem campanha). Voltar ao mesmo slug busca de novo: a
 * tela não decide com o estado de quando foi aberta.
 */
export function useCargaDosEstados(slug: string): CargaDosEstados {
  const [carga, setCarga] = useState<{ slug: string; valor: CargaDosEstados } | null>(null);

  useEffect(() => {
    if (!slug) {
      setCarga(null);
      return;
    }
    let vivo = true;
    fetch(`/api/campanhas/${encodeURIComponent(slug)}/grupos/estados`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Partial<EstadosDaCampanha>>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        const grupos = Array.isArray(data.grupos) ? data.grupos : [];
        if (vivo) setCarga({ slug, valor: { carga: "pronto", grupos } });
      })
      .catch(() => {
        if (vivo) setCarga({ slug, valor: { carga: "erro", mensagem: ERRO_ESTADOS } });
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  return carga?.slug === slug ? carga.valor : CARREGANDO;
}

type Props = {
  estados: CargaDosEstados;
  value: Destino;
  onChange: (destino: Destino) => void;
  /** Folha da barra e Disparos: sem cartão, lista mais baixa e sem rodapé (a tela já mostra o alcance). */
  compacto?: boolean;
};

/**
 * "Para quais grupos" (spec postar-por-grupo §6.5, D6–D8): três atalhos com
 * contagem, a frase da regra, a lista com caixa e estado, o aviso amarelo se o
 * grupo que está enchendo entrar, a nota dos vazios e "Lista fixa" + "Voltar
 * para a regra". Só apresenta: quem decide o que entra em cada regra é o banco.
 */
export function DestinoGrupos({ estados, value, onChange, compacto = false }: Props) {
  const tituloId = useId();
  return (
    <section
      aria-labelledby={tituloId}
      data-testid="destino-grupos"
      className={compacto ? "space-y-3" : "pn-card space-y-3 rounded-[var(--radius-control)] p-4"}
    >
      <h2 id={tituloId} className="text-16 font-semibold text-volt-950">
        Para quais grupos
      </h2>
      {estados.carga === "carregando" ? (
        <p role="status" className="text-13 text-slate-600">
          Carregando os grupos…
        </p>
      ) : estados.carga === "erro" ? (
        <p role="alert" className="text-13 text-alerta">
          {estados.mensagem}
        </p>
      ) : estados.grupos.length === 0 ? (
        <p className="text-13 text-slate-600">Esta campanha ainda não tem grupos.</p>
      ) : (
        <Escolha grupos={estados.grupos} value={value} onChange={onChange} compacto={compacto} />
      )}
    </section>
  );
}

function Escolha({
  grupos,
  value,
  onChange,
  compacto,
}: {
  grupos: EstadoGrupo[];
  value: Destino;
  onChange: (destino: Destino) => void;
  compacto: boolean;
}) {
  const marcados = new Set(selecionados(grupos, value));
  const enchendo = avisoEnchendo(grupos, value);
  const vazios = fraseVazios(grupos, value);

  return (
    <>
      <div role="group" aria-label="Atalhos de destino" className="flex flex-wrap gap-2">
        {REGRAS.map((regra) => {
          const ativo = "regra" in value && value.regra === regra;
          return (
            <button
              key={regra}
              type="button"
              aria-pressed={ativo}
              onClick={() => onChange({ regra })}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-14 font-medium",
                ativo
                  ? "bg-cobalt-500 text-white"
                  : "bg-paper-0 text-volt-950 ring-1 ring-inset ring-line-200 hover:ring-cobalt-500",
              )}
            >
              {ROTULO_REGRA[regra]}
              <span className={cn("font-data text-13 tabular-nums", ativo ? "text-white/80" : "text-slate-600")}>
                {numero(selecionados(grupos, { regra }).length)}
              </span>
            </button>
          );
        })}
        {"grupos" in value && (
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-volt-950 px-4 text-14 font-medium text-white">
            Lista fixa
            <span className="font-data text-13 tabular-nums text-acid-500">{numero(marcados.size)}</span>
          </span>
        )}
      </div>

      {"regra" in value ? (
        <p className="text-13 text-slate-600">
          Regra: <strong className="font-semibold text-volt-950">{ROTULO_REGRA[value.regra]}</strong>.{" "}
          {FRASE_DA_REGRA[value.regra]}
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 text-13 text-slate-600">
          <span>{fraseListaFixa(marcados.size)}</span>
          <button
            type="button"
            onClick={() => onChange(DESTINO_PADRAO)}
            className="min-h-11 font-semibold text-cobalt-500"
          >
            Voltar para a regra
          </button>
        </p>
      )}

      {vazios && <p className="text-13 text-slate-600">{vazios}</p>}

      {enchendo && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-control)] bg-aviso-fundo px-3 py-2.5 text-13 text-volt-950"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-atencao" aria-hidden="true" />
          <span>
            Inclui o <strong className="font-semibold">{enchendo.nome}</strong>, que está recebendo gente pelo link
            agora. Quem entrar depois chega no meio desta conversa. Dá para enviar mesmo assim.
          </span>
        </div>
      )}

      <ul className={cn("overflow-y-auto rounded-[var(--radius-control)] border", compacto ? "max-h-56" : "max-h-96")}>
        {grupos.map((g) => (
          <li key={g.groupId} className="border-b last:border-0">
            <label
              className={cn(
                "grid min-h-11 cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 text-14",
                g.estado === "enchendo" && "bg-cobalt-500/5",
                g.estado === "vazio" ? "text-slate-600" : "text-volt-950",
              )}
            >
              <input
                type="checkbox"
                className="h-[18px] w-[18px] accent-cobalt-500"
                checked={marcados.has(g.whatsappGroupId)}
                onChange={() => onChange(alternar(grupos, value, g.whatsappGroupId))}
              />
              <span className="truncate font-medium">{g.nome}</span>
              <span className="font-data text-13 tabular-nums text-slate-600">{numero(g.membros)}</span>
              <ChipDeEstado estado={g.estado} />
            </label>
          </li>
        ))}
      </ul>

      {!compacto && (
        <p data-testid="destino-resumo" className="font-data text-14 tabular-nums text-volt-950">
          {fraseResumo(resumoDoDestino(grupos, value))}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 2:** tipos, lint e lint da Vitrine:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json; npm run lint; npx tsx scripts/check-painel-vitrine.ts
```

  Esperado: tsc sem saída; lint sem erro; `painel:check OK` (zero `bg-acid` novo, nenhum raio acima de 12px).

- [ ] **Step 3:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/messages/destino-grupos.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(postar): destination picker with rule shortcuts, group list and filling-group warning" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: aba Posts (campanha e comunidade) e o Funil mandam o destino

**Files:**
- Modify: `apps/web/src/components/painel/messages/messages-tab.tsx` (`:8-12` imports, `:71` alvos, `:104-107` e `:136-139` corpo do POST, `:247` sub-abas, `:302` FunnelTab)
- Modify: `apps/web/src/components/painel/messages/funnel/funnel-plan.ts` (`:10-12` imports, `:60` `FunnelRun`, `:67` `MessagePayload`, `:226` `messagePayload`)
- Modify: `apps/web/src/components/painel/messages/funnel/funnel-plan.test.ts` (`:149`, `:155`, `:161`, `:169`)
- Modify: `apps/web/src/components/painel/messages/funnel/funnel-confirm.test.ts` (`:19`, `:242`)
- Modify: `apps/web/src/components/painel/messages/funnel/funnel-tab.tsx` (`:5-6` imports, `:20-21` props, `:172` `semGrupos`, `:323` run)
- Modify: `apps/web/e2e/painel-funil.spec.ts` (`:70`, `:167-168`)

**Depends-on:** Task 8

**Interfaces:**
- Consome: `DestinoGrupos`, `useCargaDosEstados` (Task 8); `Destino`, `DESTINO_PADRAO` (Task 1).
- Produz: `FunnelRun = { templateId: FunnelTemplateId; runId: string; destino: Destino }`; `MessagePayload.destino: Destino` (sai `groupIds`); `FunnelTabProps.destino: Destino` (sai `groupIds`). A aba manda `destino` no POST: o do seletor, ou `{ grupos: [avisoGroupId] }` no "Enviar pelo Avisos".

- [ ] **Step 1 (RED):** testes do funil. Em `funnel-plan.test.ts`, trocar:

```ts
  const run = { templateId: "live" as const, runId: "7d6f1e1a-0000-4000-8000-000000000001", groupIds: ["g1", "g2"] };
```

  por:

```ts
  const run = { templateId: "live" as const, runId: "7d6f1e1a-0000-4000-8000-000000000001", destino: { regra: "menos_enchendo" as const } };
```

  trocar:

```ts
  assert.deepEqual(p.groupIds, ["g1", "g2"]);
```

  por:

```ts
  // O funil leva o destino da aba; a regra é refeita pelo banco na hora de cada mensagem (D8).
  assert.deepEqual(p.destino, { regra: "menos_enchendo" });
  assert.equal("groupIds" in p, false);
```

  e trocar as duas ocorrências de:

```ts
{ templateId: "live", runId: "r", groupIds: ["g"] }
```

  por:

```ts
{ templateId: "live", runId: "r", destino: { grupos: ["g"] } }
```

  Em `funnel-confirm.test.ts`, trocar:

```ts
const run = { templateId: "live" as const, runId: "7d6f1e1a-0000-4000-8000-000000000001", groupIds: ["g1"] };
```

  por:

```ts
const run = { templateId: "live" as const, runId: "7d6f1e1a-0000-4000-8000-000000000001", destino: { grupos: ["g1"] } };
```

  e trocar:

```ts
  const runDo = (n: number) => ({ templateId: "grade-do-dia" as const, runId: `7d6f1e1a-0000-4000-8000-00000000000${n}`, groupIds: ["g1"] });
```

  por:

```ts
  const runDo = (n: number) => ({ templateId: "grade-do-dia" as const, runId: `7d6f1e1a-0000-4000-8000-00000000000${n}`, destino: { grupos: ["g1"] } });
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/messages/funnel/funnel-plan.test.ts
```

  Esperado: FAIL em "payload da mensagem: agendada, sem recorrência, com o par do funil" (`p.destino` é `undefined`).

- [ ] **Step 3 (GREEN):** `funnel-plan.ts`. Trocar:

```ts
import { ROTEIRO_OPENING, atOpening } from "@/lib/funnels/pracas";
```

  por:

```ts
import type { Destino } from "@/lib/campaigns/destino";
import { ROTEIRO_OPENING, atOpening } from "@/lib/funnels/pracas";
```

  trocar:

```ts
export type FunnelRun = { templateId: FunnelTemplateId; runId: string; groupIds: readonly string[] };
```

  por:

```ts
export type FunnelRun = { templateId: FunnelTemplateId; runId: string; destino: Destino };
```

  trocar (em `MessagePayload`):

```ts
  groupIds: string[];
```

  por:

```ts
  destino: Destino;
```

  e trocar (em `messagePayload`):

```ts
    groupIds: [...run.groupIds],
```

  por:

```ts
    destino: run.destino,
```

- [ ] **Step 4:** `funnel-tab.tsx`. Trocar:

```ts
import { useToast } from "@/components/toast";
```

  por:

```ts
import { useToast } from "@/components/toast";
import type { Destino } from "@/lib/campaigns/destino";
```

  trocar:

```ts
  /** Os mesmos alvos da aba (grupo a grupo ou Avisos). */
  groupIds: string[];
```

  por:

```ts
  /** O mesmo destino da aba: a regra ou a lista do seletor, ou o Avisos. */
  destino: Destino;
```

  trocar:

```ts
  const semGrupos = props.groupIds.length === 0;
```

  por:

```ts
  // `groupCount` é o tamanho de `group_ids` (1 no Avisos): o mesmo critério de antes.
  const semGrupos = props.groupCount === 0;
```

  e trocar:

```ts
          run: { templateId, runId: atuais[day].runId, groupIds: props.groupIds },
```

  por:

```ts
          run: { templateId, runId: atuais[day].runId, destino: props.destino },
```

- [ ] **Step 5:** `messages-tab.tsx`. Trocar:

```ts
import { numero } from "@/lib/painel/grupos";
```

  por:

```ts
import { numero } from "@/lib/painel/grupos";
import { DESTINO_PADRAO, type Destino } from "@/lib/campaigns/destino";
```

  trocar:

```ts
import { FunnelTab } from "./funnel/funnel-tab";
```

  por:

```ts
import { FunnelTab } from "./funnel/funnel-tab";
import { DestinoGrupos, useCargaDosEstados } from "./destino-grupos";
```

  trocar:

```ts
  const alvos = usarAvisos && avisoGroupId ? [avisoGroupId] : groupIds;
```

  por:

```ts
  // Regra por padrão (D5); mexer na lista vira lista fixa (D8). O Avisos é
  // sempre lista fixa de um grupo só, fora do seletor.
  const [destino, setDestino] = useState<Destino>(DESTINO_PADRAO);
  const estados = useCargaDosEstados(campaignSlug);
  const destinoDoEnvio: Destino = usarAvisos && avisoGroupId ? { grupos: [avisoGroupId] } : destino;
```

  trocar **as duas** ocorrências (em `handleSend` e `handleSchedule`; no Edit, `replace_all`):

```ts
          groupIds: alvos,
```

  por:

```ts
          destino: destinoDoEnvio,
```

  trocar:

```tsx
      {/* Sub-tabs */}
```

  por:

```tsx
      {!usarAvisos && subTab !== "Agenda" && (
        <DestinoGrupos estados={estados} value={destino} onChange={setDestino} />
      )}
      {/* Sub-tabs */}
```

  e trocar:

```tsx
            groupIds={alvos}
```

  por:

```tsx
            destino={destinoDoEnvio}
```

- [ ] **Step 6:** `e2e/painel-funil.spec.ts`. Trocar:

```ts
      groupIds: body.groupIds,
```

  por:

```ts
      groupIds: [],
```

  e trocar:

```ts
    // Campanha com grupos: os alvos são os groupIds dela (disparo pro público certo).
    expect(m.groupIds).toEqual(campanha.groupIds);
```

  por:

```ts
    // D5/D8: o funil leva o destino da aba — por padrão a regra, refeita pelo banco
    // na hora de cada mensagem, e não a lista congelada da campanha.
    expect(m.destino).toEqual({ regra: "menos_enchendo" });
    expect(m).not.toHaveProperty("groupIds");
```

- [ ] **Step 7:** testes do funil, tipos (os dois: o spec mudou) e lint:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/messages/funnel/funnel-plan.test.ts src/components/painel/messages/funnel/funnel-confirm.test.ts
```
```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json; npx tsc --noEmit -p tsconfig.e2e.json; npm run lint
```

  Esperado: `ℹ fail 0`; os dois tsc sem saída; lint limpo. Um `groupIds` sobrando em `funnel-*` aparece no tsc — conferir com `git -C <wt> grep -n "groupIds" -- apps/web/src/components/painel/messages/funnel` (esperado: nada).

- [ ] **Step 8:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/messages/messages-tab.tsx apps/web/src/components/painel/messages/funnel/funnel-plan.ts apps/web/src/components/painel/messages/funnel/funnel-plan.test.ts apps/web/src/components/painel/messages/funnel/funnel-confirm.test.ts apps/web/src/components/painel/messages/funnel/funnel-tab.tsx apps/web/e2e/painel-funil.spec.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(postar): campaign Posts tab and funnel send the chosen destination" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: folha "Postar" da barra

**Files:**
- Modify: `apps/web/src/components/painel/folha-postar.tsx` (`:6-11` imports e tipo, `:38` estado, `:41-45` reset ao fechar, `:71` campanha, `:81` corpo, `:140-145` contagem, depois do `</label>` `:145`)

**Depends-on:** Task 8

**Interfaces:**
- Consome: `DestinoGrupos`, `useCargaDosEstados` (Task 8); `destinoDaCampanha`, `fraseResumo`, `resumoDoDestino` (Task 7); `Destino` (Task 1).
- Produz: POST com `{ ...payload, destino }`. O destino volta ao padrão ao trocar de campanha e a cada abertura; os estados são relidos a cada abertura.

- [ ] **Step 1:** trocar:

```ts
import { MessageComposer, type ComposerPayload } from "@/components/painel/messages/message-composer";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { Bolha } from "./bolha";
import { Folha } from "./folha";

type Campanha = { id: string; name: string; slug?: string; groupIds?: string[] };
```

  por:

```ts
import { MessageComposer, type ComposerPayload } from "@/components/painel/messages/message-composer";
import { DestinoGrupos, useCargaDosEstados } from "@/components/painel/messages/destino-grupos";
import type { Destino } from "@/lib/campaigns/destino";
import { destinoDaCampanha, fraseResumo, resumoDoDestino } from "@/lib/campaigns/destino-ui";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { Bolha } from "./bolha";
import { Folha } from "./folha";

type Campanha = { id: string; name: string; slug?: string };
```

- [ ] **Step 2:** trocar:

```ts
  const [texto, setTexto] = useState("");
```

  por:

```ts
  const [texto, setTexto] = useState("");
  // O destino vale para a campanha em que foi escolhido e para esta abertura:
  // trocar de campanha ou reabrir a folha volta ao atalho padrão.
  const [escolha, setEscolha] = useState<{ slug: string; destino: Destino } | null>(null);
  // Fechada, a folha não busca; reaberta, relê os estados (ela não desmonta ao fechar).
  const estados = useCargaDosEstados(aberta ? slug : "");
```

- [ ] **Step 3:** trocar:

```ts
    if (!aberta) {
      // A folha não desmonta ao fechar; sem isto a prévia antiga piscaria ao reabrir.
      setTexto("");
      return;
    }
```

  por:

```ts
    if (!aberta) {
      // A folha não desmonta ao fechar; sem isto a prévia antiga piscaria ao reabrir.
      setTexto("");
      setEscolha(null);
      return;
    }
```

- [ ] **Step 4:** trocar:

```ts
  const campanha = useMemo(() => campanhas.find((c) => (c.slug ?? c.id) === slug) ?? null, [campanhas, slug]);
```

  por:

```ts
  const campanha = useMemo(() => campanhas.find((c) => (c.slug ?? c.id) === slug) ?? null, [campanhas, slug]);
  const destino = destinoDaCampanha(escolha, slug);
```

- [ ] **Step 5:** trocar:

```ts
        body: JSON.stringify({ ...payload, groupIds: campanha.groupIds ?? [] }),
```

  por:

```ts
        body: JSON.stringify({ ...payload, destino }),
```

- [ ] **Step 6:** trocar:

```tsx
            {campanha && (
              <span className="font-data mt-1 block text-12 tabular-nums text-slate-600">
                {campanha.groupIds?.length ?? 0} grupos
              </span>
            )}
          </label>
```

  por:

```tsx
            {campanha && estados.carga === "pronto" && (
              <span className="font-data mt-1 block text-12 tabular-nums text-slate-600">
                {fraseResumo(resumoDoDestino(estados.grupos, destino))}
              </span>
            )}
          </label>

          <DestinoGrupos
            estados={estados}
            value={destino}
            onChange={(d) => setEscolha({ slug, destino: d })}
            compacto
          />
```

- [ ] **Step 7:** `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json; npm run lint; npx tsx scripts/check-painel-vitrine.ts` → limpos, `painel:check OK`.

- [ ] **Step 8:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/folha-postar.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(postar): the bar's Post sheet picks the destination, reset per campaign and per opening" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Disparos — seletor, alcance pelo destino e histórico com a regra

**Files:**
- Modify: `apps/web/src/app/painel/disparos/page.tsx` (`:8` imports, `:86` assinatura, `:94` corpo)
- Modify: `apps/web/src/components/painel/disparos/vitrine/disparos-vitrine.tsx` (`:9-15` imports, `:32` prop, `:64-75` estado e alcance, `:126-128` seletor, `:131` e `:135` composers, `:162-166` linha do alcance, `:204` e `:219-221` linha do histórico)
- Modify: `apps/web/e2e/painel-vitrine-disparos.spec.ts` (`:65-68` espera, fim do arquivo)

**Depends-on:** Task 8, Task 4 (5a)

**Interfaces:**
- Consome: `DestinoGrupos`, `useCargaDosEstados` (Task 8); `destinoDaCampanha`, `selecionados` (Task 7); `regraPendente` (Task 4); `alcance`, `fraseAlcance`, `frasePlural`, `rotuloPostar` (`@/lib/painel/disparos`, existentes).
- Produz: `DisparosVitrine` prop `aoDisparar: (payload: ComposerPayload | SchedulePayload, destino: Destino) => Promise<void>`. O aviso "Vai pra N grupos", o botão "Postar em N grupos" e o número do atalho marcado contam a mesma seleção.

- [ ] **Step 1 (RED):** `e2e/painel-vitrine-disparos.spec.ts`. Trocar:

```ts
    await page.route("**/api/groups**", async (rota) => {
      await new Promise((pronto) => setTimeout(pronto, 4000));
      await rota.continue();
    });
```

  por:

```ts
    await page.route("**/api/groups**", async (rota) => {
      await new Promise((pronto) => setTimeout(pronto, 4000));
      await rota.continue();
    });
    // O alcance agora é o do destino: sem os estados dos grupos também não há conta.
    await page.route("**/grupos/estados**", async (rota) => {
      await new Promise((pronto) => setTimeout(pronto, 4000));
      await rota.continue();
    });
```

  e trocar (o fim do arquivo):

```ts
    expect(classes).not.toContain("bg-acid");
  });
});
```

  por:

```ts
    expect(classes).not.toContain("bg-acid");
  });

  test("o atalho padrão vem marcado e o aviso conta o que ele conta", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });

    const alcance = page.getByTestId("disparos-alcance");
    await expect(alcance).not.toContainText("Contando");
    const destino = page.getByTestId("destino-grupos");
    await expect(destino).toBeVisible();
    test.skip(
      (await destino.getByText("Esta campanha ainda não tem grupos.").count()) > 0,
      "a campanha escolhida não tem grupo com estado; nada a afirmar aqui",
    );

    // D5: sem escolher nada, o post vai para todos menos o que está enchendo.
    const atalho = destino
      .getByRole("group", { name: "Atalhos de destino" })
      .getByRole("button", { name: /^Todos menos o que está enchendo/ });
    await expect(atalho).toHaveAttribute("aria-pressed", "true");

    const noAtalho = /([\d.]+)$/.exec((await atalho.innerText()).trim())?.[1];
    const noAviso = /Vai pra ([\d.]+) grupos?/.exec(await alcance.innerText())?.[1] ?? "0";
    expect(noAviso, "o aviso tem que contar os grupos do atalho escolhido").toBe(noAtalho);

    await test.info().attach("disparos-destino", { body: await destino.screenshot(), contentType: "image/png" });
  });
});
```

- [ ] **Step 2:** `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.e2e.json` → sem saída (o spec compila; ele só fica verde depois dos Steps 3–4, no CI ou na Task 12).

- [ ] **Step 3 (GREEN):** `apps/web/src/app/painel/disparos/page.tsx`. Trocar:

```ts
import type { Group } from "@/lib/mock-data";
```

  por:

```ts
import type { Group } from "@/lib/mock-data";
import type { Destino } from "@/lib/campaigns/destino";
```

  trocar:

```ts
  async function dispatch(payload: ComposerPayload | SchedulePayload) {
```

  por:

```ts
  async function dispatch(payload: ComposerPayload | SchedulePayload, destino: Destino) {
```

  e trocar:

```ts
        body: JSON.stringify({ ...payload, groupIds: campanhaAtual.groupIds }),
```

  por:

```ts
        body: JSON.stringify({ ...payload, destino }),
```

- [ ] **Step 4 (GREEN):** `apps/web/src/components/painel/disparos/vitrine/disparos-vitrine.tsx`.

  Edição A — trocar:

```ts
import { ScheduleComposer, type SchedulePayload } from "@/components/painel/messages/schedule-composer";
import { alcance, fraseAlcance, quadradinhos, rotuloPostar } from "@/lib/painel/disparos";
import { diaHoraCurto } from "@/lib/painel/inicio";
import { useCarimboEvento } from "@/lib/painel/use-carimbo-evento";
import type { Group } from "@/lib/mock-data";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
```

  por:

```ts
import { ScheduleComposer, type SchedulePayload } from "@/components/painel/messages/schedule-composer";
import { DestinoGrupos, useCargaDosEstados } from "@/components/painel/messages/destino-grupos";
import { alcance, fraseAlcance, frasePlural, quadradinhos, rotuloPostar } from "@/lib/painel/disparos";
import { diaHoraCurto } from "@/lib/painel/inicio";
import { useCarimboEvento } from "@/lib/painel/use-carimbo-evento";
import type { Group } from "@/lib/mock-data";
import type { Destino } from "@/lib/campaigns/destino";
import { destinoDaCampanha, selecionados } from "@/lib/campaigns/destino-ui";
import { regraPendente, type TenantDispatchView } from "@/lib/campaigns/dispatch-view";
```

  Edição B — trocar:

```ts
  aoDisparar: (payload: ComposerPayload | SchedulePayload) => Promise<void>;
```

  por:

```ts
  aoDisparar: (payload: ComposerPayload | SchedulePayload, destino: Destino) => Promise<void>;
```

  Edição C — trocar:

```tsx
  const [agendando, setAgendando] = useState(false);
  const [texto, setTexto] = useState("");

  // Sem memo: `agora` muda a cada render e congelaria o "há 2 dias" do histórico.
  const agora = new Date();
  const campanha = campanhas.find((c) => (c.slug ?? c.id) === slug) ?? null;
  const alvo = alcance(grupos, campanha?.groupIds);
  // Só depois de ter a lista de grupos a contagem pode aparecer no aviso e no
  // botão: antes disso ela diria "os grupos sumiram" a quem só esperou meio
  // segundo a mais pela rota de grupos.
  const contagemPronta = gruposOk && !gruposCarregando;
  const semCampanha = campanhas.length === 0;
```

  por:

```tsx
  const [agendando, setAgendando] = useState(false);
  const [texto, setTexto] = useState("");
  // O destino escolhido vale só para a campanha em que foi escolhido: a lista
  // fixa de uma, mandada para outra, seria recusada (grupo de fora da campanha).
  const [escolha, setEscolha] = useState<{ slug: string; destino: Destino } | null>(null);
  const destino = destinoDaCampanha(escolha, slug);
  const estados = useCargaDosEstados(slug);

  // Sem memo: `agora` muda a cada render e congelaria o "há 2 dias" do histórico.
  const agora = new Date();
  const campanha = campanhas.find((c) => (c.slug ?? c.id) === slug) ?? null;
  // O alcance é o do DESTINO, não o da campanha inteira: o aviso, o botão e o
  // atalho marcado contam a mesma coisa.
  const doDestino = estados.carga === "pronto" ? selecionados(estados.grupos, destino) : [];
  const alvo = alcance(grupos, doDestino);
  // Só depois de ter a lista de grupos e os estados a contagem pode aparecer no
  // aviso e no botão: antes disso ela diria "os grupos sumiram" a quem só
  // esperou meio segundo a mais.
  const contagemPronta = gruposOk && !gruposCarregando && estados.carga === "pronto";
  const semCampanha = campanhas.length === 0;

  function linhaDeAlcance(): string {
    if (gruposCarregando || estados.carga === "carregando") return "Contando quantas pessoas veem…";
    if (estados.carga === "erro") return estados.mensagem;
    if (estados.grupos.length > 0 && doDestino.length === 0) {
      return "Esta escolha não tem grupos agora — troque o atalho ou marque os grupos à mão.";
    }
    if (!gruposOk) {
      return `Vai pra ${frasePlural(doDestino.length, "grupo", "grupos")} · não deu pra contar as pessoas agora.`;
    }
    return fraseAlcance(alvo);
  }
```

  Edição D — trocar:

```tsx
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
```

  por:

```tsx
          </div>

          <div className="mt-4">
            <DestinoGrupos
              estados={estados}
              value={destino}
              onChange={(d) => setEscolha({ slug, destino: d })}
              compacto
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
```

  Edição E — trocar:

```tsx
                <ScheduleComposer onSchedule={aoDisparar} scheduling={enviando} />
```

  por:

```tsx
                <ScheduleComposer onSchedule={(p) => aoDisparar(p, destino)} scheduling={enviando} />
```

  e trocar:

```tsx
                  onSend={aoDisparar}
```

  por:

```tsx
                  onSend={(p) => aoDisparar(p, destino)}
```

  Edição F — trocar:

```tsx
                {gruposCarregando
                  ? "Contando quantas pessoas veem…"
                  : gruposOk
                    ? fraseAlcance(alvo)
                    : `Vai pra ${campanha?.groupIds.length ?? 0} grupos · não deu pra contar as pessoas agora.`}
```

  por:

```tsx
                {linhaDeAlcance()}
```

  Edição G — trocar:

```tsx
  const quando = d.scheduledAt ?? d.dispatchedAt ?? d.createdAt;
```

  por:

```tsx
  const quando = d.scheduledAt ?? d.dispatchedAt ?? d.createdAt;
  // Regra que ainda não rodou: o total só existe depois que o banco refaz a lista.
  const regra = regraPendente(d);
```

  e trocar:

```tsx
        <span className="font-data ml-auto text-13 tabular-nums text-volt-950">
          {d.sent} / {d.total} <span className="text-slate-600">grupos</span>
        </span>
```

  por:

```tsx
        {regra ? (
          <span className="ml-auto text-13 text-slate-600">{regra}</span>
        ) : (
          <span className="font-data ml-auto text-13 tabular-nums text-volt-950">
            {d.sent} / {d.total} <span className="text-slate-600">grupos</span>
          </span>
        )}
```

- [ ] **Step 5:** tipos (os dois), lint, Vitrine e a suíte:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json; npx tsc --noEmit -p tsconfig.e2e.json; npm run lint; npx tsx scripts/check-painel-vitrine.ts; npm test
```

  Esperado: limpos, `painel:check OK`, `ℹ fail 0`. Conferir que não sobrou corpo de POST com `groupIds` nas telas:

```powershell
git -C <wt> grep -n "groupIds:" -- apps/web/src/components/painel apps/web/src/app/painel
```

  Esperado: nenhuma linha que monte corpo de POST para `/messages` (tipos e props de leitura podem aparecer).

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/app/painel/disparos/page.tsx apps/web/src/components/painel/disparos/vitrine/disparos-vitrine.tsx apps/web/e2e/painel-vitrine-disparos.spec.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(disparos): pick the destination, count reach from it and show pending rules in history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: E2E local e conferência visual

**Files:** nenhum.
**Depends-on:** Tasks 9, 10, 11

Em worktree, nada de `preview_start` nem do pane do app (servem o checkout principal — `finding-preview-serve-checkout-principal`). Sem `.env.local` com `E2E_EMAIL`/`E2E_PASSWORD`, pular esta task: a prova vem do job `e2e` do CI (Task 13) e do anexo `disparos-destino` no `e2e-report`.

- [ ] **Step 1:** nenhum e2e de CI no banco de dev agora:

```powershell
gh run list --repo codingB0y/Girumo --workflow Verify --status in_progress --json databaseId,headBranch
```

  Lista não vazia → esperar.

- [ ] **Step 2:** dev server do worktree numa porta própria (`run_in_background: true`):

```powershell
Set-Location <wt>\apps\web; npx next dev -p 3005
```

  Esperar responder: `Invoke-WebRequest http://localhost:3005/login -UseBasicParsing | Select-Object StatusCode` → 200.

- [ ] **Step 3:** os specs tocados e o da casca (abre a folha):

```powershell
Set-Location <wt>\apps\web; $env:E2E_BASE_URL = "http://localhost:3005"; npx playwright test e2e/painel-vitrine-disparos.spec.ts e2e/painel-funil.spec.ts e2e/painel-vitrine-casca.spec.ts --project=chromium
```

  Esperado: verde (o "atalho padrão" pode sair `skipped` se a 1ª campanha do QA não tiver grupo com estado — o seed de dev guarda UUID em `group_ids`, `finding-group-ids-casa-por-whatsapp-id`).

- [ ] **Step 4:** abrir o anexo: `Get-ChildItem <wt>\apps\web\e2e-report\data\*.png | Sort-Object LastWriteTime -Descending | Select-Object -First 1` e ler com a ferramenta Read. Conferir contra o mockup: título "Para quais grupos"; três atalhos em pílula com a contagem, "Todos menos o que está enchendo" em cobalto; frase "Regra: …"; lista com caixa, nome, membros e chip (LOTADO em Acid, ENCHENDO AGORA em cobalto, NA FILA cinza, VAZIO tracejado); nada abaixo de 12px; sem rolagem lateral. Defeito → corrigir no componente, commitar, repetir os Steps 3–4.

- [ ] **Step 5:** derrubar o dev server pelo PID (`finding-taskstop-nao-mata-next-dev`):

```powershell
Get-NetTCPConnection -LocalPort 3005 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

---

### Task 13: verificação final, revisão e PR 5b

**Files:** nenhum novo.
**Depends-on:** Tasks 7–12

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez: `npx tsc --noEmit -p tsconfig.json` · `npx tsc --noEmit -p tsconfig.e2e.json` · `npm run lint` · `npm test` · `npx tsx scripts/check-painel-vitrine.ts`.

- [ ] **Step 2:** gate real:

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`.

- [ ] **Step 3:** revisão do diff inteiro (superpowers:requesting-code-review; a revisão por task não vê a costura — `pattern-revisao-final-pega-o-que-revisao-por-task-nao-ve`) sobre `git -C <wt> diff origin/main...HEAD`, com foco em: (1) as três telas e o Funil mandam `destino` e nenhuma manda `groupIds`; (2) o Avisos da comunidade continua `{ grupos: [avisoGroupId] }`; (3) trocar de campanha (folha/Disparos) e reabrir a folha voltam ao padrão; (4) condição a condição contra o JSX antigo (`finding-gate-de-exibicao-some-no-diff`): a contagem de Disparos ainda espera `/api/groups` **e** os estados; o botão não fica Acid sem contagem; (5) nada de "Nenhum grupo/disparo/post" em texto fixo. CRITICAL/HIGH → corrigir e commitar.

- [ ] **Step 4:** defasagem: `git -C <wt> fetch origin main` e `git -C <wt> log HEAD..origin/main --oneline` → commits novos → `git -C <wt> merge origin/main`, Steps 1–2 de novo.

- [ ] **Step 5:** se a Task 6 foi pelo caminho 2b (empilhado): com o 5a já mergeado, `git -C <wt> rebase --onto origin/main feat/postar-grupo-destino feat/postar-grupo-destino-tela`, depois `git -C <wt> log origin/main..HEAD --oneline` mostrando **só** os commits das Tasks 7–11, e Steps 1–2 de novo.

- [ ] **Step 6:** `git -C <wt> status --short` limpo.

- [ ] **Step 7:** nenhum e2e de outro PR rodando (`gh run list … --status in_progress` vazio), depois o push:

```powershell
git -C <wt> push -u origin feat/postar-grupo-destino-tela
```

- [ ] **Step 8:** PR (Git Bash):

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-destino-tela --title "feat(postar): escolher para quais grupos o post vai (postar por grupo, PR 5b)" --body "$(cat <<'EOF'
## O que entra

- Seletor "Para quais grupos" (`components/painel/messages/destino-grupos.tsx`): atalhos **Todos menos o que está enchendo** (padrão), **Só lotados** e **Todos com gente** com contagem; frase da regra (refeita na hora do envio); lista com caixa e estado; aviso amarelo, sem bloquear, quando o grupo que está enchendo entra; nota dos vazios; "Lista fixa" + "Voltar para a regra". Lê `GET /api/campanhas/[slug]/grupos/estados`; a pertinência a cada regra vem de `naRegra` (nada recalculado na tela).
- Aba Posts da campanha e da comunidade, inclusive o Funil: mandam `destino`. O "Enviar pelo Avisos" segue como lista fixa de um grupo.
- Folha "Postar" da barra: seletor compacto; volta ao padrão ao trocar de campanha e a cada abertura, e relê os estados.
- Disparos: seletor; "Vai pra N grupos", o botão e o atalho contam a mesma seleção; o histórico mostra "Regra: …" enquanto o disparo com regra não rodou.

## Para o lojista

Post sem escolher nada deixa de ir para o grupo que está recebendo gente pelo link (D5). "Postar toda semana" é o agendamento semanal de sempre: a regra é refeita a cada envio (D11).

## Teste

- [x] `destino-ui.test.ts` (com mutantes: regra recalculada pelo estado; escolha que vaza de campanha)
- [x] `funnel-plan.test.ts`, `funnel-confirm.test.ts`
- [x] tsc x2, lint, npm test, painel:check, verify-local.ps1
- [ ] e2e `painel-vitrine-disparos.spec.ts` (atalho padrão; anexo `disparos-destino`), `painel-funil.spec.ts`, `painel-vitrine-casca.spec.ts`
- [ ] CI verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

  Se a Task 4b foi pulada no 5a e o #415 continua fora de `main`, acrescentar ao corpo, antes de "## Teste": "**Pendente (depende do #415):** a vendedora com `postar` vê erro no seletor até `ROTAS.postar` ganhar `GET /api/campanhas/*/grupos/estados` (texto e teste prontos na Task 4b do plano do PR 5)". Se o #415 entrou entre o 5a e o 5b, rodar a Task 4b nesta branch antes do push (2 arquivos a mais no 5b).

- [ ] **Step 9:** CI:

```powershell
gh pr checks <N> --repo codingB0y/Girumo --watch
```

  E2E vermelho com 401/500 em specs alheios = corrida no banco de dev → `gh run rerun <run-id> --failed --repo codingB0y/Girumo` depois do outro run. Abrir o anexo `disparos-destino` do artefato `e2e-report` se a Task 12 foi pulada.

- [ ] **Step 10:** merge **pelo Igor**, com CI verde e com o PR 1 confirmado em **prod** (Task 0 Step 7):

```powershell
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

---

### Task 14: verificação em produção, quadro e grafo

**Files:** nenhum.
**Depends-on:** Task 13 (5b mergeado e no ar)

- [ ] **Step 1:** o deploy de prod tem o commit do 5b (`verificar-commit-em-producao`): `/admin/configuracoes` → "Deploy" mostra o SHA do merge.

- [ ] **Step 2:** o Igor posta na campanha real (Moda Kids do Sul) **com o atalho padrão** — post de verdade, que ele já ia fazer; nada de post de teste em grupo de cliente.

- [ ] **Step 3:** gravar com a ferramenta Write `<scratch>\verificar-destino.sql` (trocar `<slug>` pelo da campanha; achar com `select id, slug, name from public.campaign_groups where name ilike '%moda kids%';`):

```sql
with camp as (
  select id, tenant_id from public.campaign_groups where slug = '<slug>'
),
ultimo as (
  select b.id, b.run_id, b.status, b.total
  from public.broadcasts b, camp
  where b.tenant_id = camp.tenant_id
    and b.campaign_group_id = camp.id
    and b.target_rule = 'menos_enchendo'
    and b.run_id is not null
  order by b.created_at desc
  limit 1
),
enchendo as (
  select s.whatsapp_group_id, s.name
  from camp, public.campaign_group_states(camp.tenant_id, camp.id) s
  where s.estado = 'enchendo'
)
select
  (select id from ultimo) as broadcast_id,
  (select status from ultimo) as status,
  (select count(*) from public.engine_commands ec, ultimo where ec.origin_run_id = ultimo.run_id) as comandos,
  (select name from enchendo) as enchendo_agora,
  exists (
    select 1 from public.engine_commands ec, ultimo, enchendo
    where ec.origin_run_id = ultimo.run_id and ec.payload->>'jid' = enchendo.whatsapp_group_id
  ) as enchendo_recebeu;
```

  Comando para o Igor (prod; o `if` impede consultar o banco errado se o link falhar):

```powershell
Set-Location <wt>\apps\web; npx supabase link --project-ref nidoatbxaylrkcgbszns --yes; if ($LASTEXITCODE -eq 0) { npx supabase db query --linked -f <scratch>\verificar-destino.sql }
```

  Esperado (spec §11 item 2): `comandos` > 0 e `enchendo_recebeu = false`. Rodar logo depois do post: o "enchendo" de agora tem que ser o do momento do envio. `enchendo_recebeu = true` → o card vai para `quebrado` com o motivo, e investigar `app.alvos_do_disparo` antes de qualquer outro PR da série.

- [ ] **Step 4:** quadro (prod, Igor; `<card>` = key da Task 0 Step 12). Se os PRs 6–9 **ainda não** estão todos no ar, o card segue em construção:

```sql
select public.move_card('<card>', 'em_construcao', 'PR 5 no ar e conferido em prod: post com o atalho padrão não chega ao grupo que está enchendo (spec §11 item 2)', 'PR #<N do 5a> e #<N do 5b>');
```
```sql
update public.board_features set blocker = 'Faltam os PRs da série ainda não mergeados (6 exclusividade, 7/8 padronizar, 9 aviso ao lotar) e os itens 3–5 do §11' where key = '<card>';
```

  Se **todos** os itens 1–5 do §11 já foram vistos funcionando em prod (prova colhida na hora):

```sql
select public.move_card('<card>', 'no_ar_verificado', 'Postar por grupo em prod: §11 itens 1–5 conferidos', '<link ou descrição da prova>');
```
```sql
update public.board_features set blocker = null where key = '<card>';
```

- [ ] **Step 5:** grafo (PowerShell, raiz do checkout principal; sugerir ao Igor):

```powershell
rag insert "decisão: postar por grupo — o destino do post é regra (target_rule, refeita pelo banco em app.alvos_do_disparo a cada envio) ou lista fixa conferida contra campaign_groups.group_ids (exceção: o Avisos da comunidade nativa). Sem destino, o padrão é menos_enchendo. A tela só apresenta: a pertinência vem de naRegra do endpoint de estados; lerDestino (lib/campaigns/destino.ts) é a única leitura do corpo." --source decisao-2026-10-10-postar-destino
```

- [ ] **Step 6:** ao encerrar a sessão: "PRs que deixei abertos: …" (ou "nenhum"), com o motivo de cada um.

---

## Self-review contra spec e contratos

| Item | Onde |
|---|---|
| D5 padrão "Todos menos o que está enchendo"; antes era "todos" | Task 1 (`DESTINO_PADRAO`, teste 1), Task 3 (rota sem destino), Tasks 9–11 (estado inicial das telas), e2e Task 11 |
| D6 três atalhos, lista com caixa, aviso amarelo que não bloqueia | Task 8 (`REGRAS`, `avisoEnchendo` com `role="alert"`, sem `disabled`), Task 7 (testes) |
| D7 vazios fora dos atalhos, marcáveis à mão | `naRegra` do banco (contrato §1: vazio não está em regra nenhuma) + `fraseVazios`; caixa sempre habilitada |
| D8 atalho = regra guardada; mexer na lista = lista fixa | Task 2 (`target_rule`), Task 3 (grava `target_rule` **ou** `group_ids`), Task 7 (`alternar`) |
| D11 semanal sem automação nova | `ScheduleComposer` intocado; a regra viaja no `broadcast` do agendamento (Task 3 aceita agendado sem ler estado); frase "refeita na hora do envio" |
| §3 regras e §4 "o TS não recalcula" | `selecionados` lê `naRegra`; rota usa `estados.some((g) => g.naRegra[regra])`; mutante na Task 7 |
| §5.5 `alvos_do_disparo`, campanha nula → `failed` "Nenhum grupo nesta regra agora." | Task 2 (integração: três regras, lista fixa, campanha nula) |
| §6.5 `lerDestino(body, campanha, permitidosExtras)` e erros | Task 1; assinatura do contrato §5 |
| §6.5 envio agora com regra vazia → 400; agendado aceito | Task 3 (testes 3, 4, 5) |
| §6.5 `assertPlanLimit("contacts:reach")` | conferido: conta `leads`; teste "regra com grupo agora segue para o teto"; `send-gates.test.ts` |
| §6.5 componente, `messages-tab` (inclui Funil), folha, Disparos | Tasks 8, 9, 10, 11 |
| §6.5 histórico "Regra: …" / total real depois do run | Task 4 (`regraPendente`), Task 11 Edição G |
| §6.5 e2e com o atalho padrão | Task 11 (novo teste) e Task 9 (`painel-funil.spec.ts`) |
| §7 "regra agendada que dá zero" e "campanha apagada" | banco (PR 1); Task 2 cobre campanha nula; agendado aceito na Task 3 |
| §8 integração que mata o mutante da regra | Task 2 (arquivo próprio — divergência 4) |
| §9 ≤ ~10 arquivos por PR | 10 (5a, 8 sem a 4b) e 13 (5b; o 5b é uma coisa só: o seletor nas telas que postam) |
| §11 item 2 | Task 14 |
| Vendedora com `postar` alcança o seletor (requisito do coordenador) | Task 4b, condicional ao #415 em `main`; senão dependência registrada (Task 0 Step 5b, corpos dos PRs) |
| Mensagem `Nenhum grupo nesta regra agora.` igual à do PR 1 | Task 1 (`NENHUM_GRUPO_NA_REGRA`), Task 3 (teste), Task 2 (regex) |
| Integração fora de `campaign-group-states.integration.test.ts` (é do PR 4) | Task 2 (`broadcasts-regra.integration.test.ts`) |
| Contrato §3 (`estado.ts`, `listCampaignGroupStates`) consumido sem renomear | Tasks 1, 3, 4, 7, 8 |
| Contrato §4 (`POST .../messages` com `destino`, `groupIds` aceito) | Tasks 1 e 3 |
| Contrato §5 (`createBroadcast` com `target_rule`) | Task 2 |
