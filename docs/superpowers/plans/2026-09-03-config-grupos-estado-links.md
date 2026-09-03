# Configurações dos grupos — PR C (Estado + Revisar links) — Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-09-02-config-grupos-campanha-design.md`
> (Fatiamento item 3, decisões D7 e D8, seção "PR C — revisão de links")
> **Card:** `grupos-config-estado-links` (em `em_construcao` desde 03/09)
> **Antecessores fechados:** PR A #226, PR B #227, correções #229/#231/#232, rótulo #235.

## O que este PR é

O bloco "Ações em massa" da aba Grupos vira **"Configurações dos grupos"**, com três seções:

- **Identidade** — foto e descrição. É o que já existe, só muda de lugar.
- **Estado** — a contagem `abertos / fechados / sem informação` ANTES dos botões Abrir/Fechar.
  Hoje os botões existem sem nenhum número: o lojista aperta "Fechar agora" sem saber quantos
  já estão fechados.
- **Manutenção** — **Revisar links**: última revisão, contagem `iguais / trocados / quebrados`,
  e "Revisar agora" com ETA honesto.

## Reconhecimento feito ANTES de planejar (não repetir)

Conferido por SQL nos **dois** bancos em 03/09 — partem do mesmo ponto, sem drift:

| Objeto | prod `nidoatbxaylrkcgbszns` | dev `wfjuwogxaupyadwhvoxy` |
|---|---|---|
| `group_bulk_jobs_action_check` | `set_description, set_picture, open, close` | idêntico |
| `groups.invite_checked_at` / `invite_check` | não existem | idêntico |
| `group_bulk_jobs.payload` | não existe (é do PR D) | idêntico |
| `groups_send_state_check` | `null \| 'open' \| 'closed'` | idêntico |

`claim_bulk_jobs(p_tenant uuid, p_limit int default 1)` — `security definer`, `search_path`
setado, pega `status='queued'` ordenado por `created_at` com `for update skip locked`.

## O que JÁ EXISTE e vai ser reusado (não reescrever)

Esta é a parte que encurta o PR — quase nada de `check_invite` é novo:

| Peça | Onde | Para quê |
|---|---|---|
| `inviteUrl(instanceName, groupJid)` | `apps/worker/src/evolution-groups.ts:200` | A chamada HTTP do `check_invite` **já existe** no worker. Zero cliente novo. |
| `parseInviteResponse` | `apps/worker/src/invite-url.ts` | Extrai o convite da resposta. |
| `classifyInviteFailure` | `apps/web/src/lib/groups/invite-backfill.ts:109` | Permanente × passageiro, **já sabe** que a Evolution 2.3.7 achata toda falha de grupo num 404 e que a causa vive no `detail`. |
| `normalizeInviteUrl` | `apps/web/src/lib/groups/invite-url.ts` | Recusa URL que não seja do WhatsApp. |
| Padrão "job concluído escreve em `groups`" | `group-bulk-jobs.ts:171` (`open`/`close` → `send_state`) | A forma exata que `check_invite` precisa, já com a decisão de não derrubar o ack se a escrita secundária falhar. |

## Constraints globais

- **Migração nos DOIS bancos**, `deploy/supabase/apply-order.txt` e
  `deploy/supabase/schema-baseline.json`. O gate de drift do CI fica vermelho **para todos** se
  faltar em um — ver [[finding-classificador-libera-dml-bloqueia-ddl]]: o classificador libera
  DML e barra DDL na ferramenta Bash, então o DDL vai pela ferramenta PowerShell ou pelo MCP.
- **Rebase em `origin/main` antes do gate local.** `main` andou hoje (#233, #234, #235); o
  baseline do gate de drift é comparado contra o arquivo DESTA branch.
- **Anti-ban:** os três loops (envio, auto-grow, ações em massa) usam a MESMA instância da
  Evolution, ou seja o mesmo número. `check_invite` acrescenta um consumidor. É por isso que
  D7 escolheu um ritmo próprio e muito mais lento que o do lote de identidade.
- Toda query em tabela com `tenant_id` leva `.eq('tenant_id', ...)` explícito.
- Estilo de teste não é uniforme no repo: **siga o arquivo que está editando**. Em arquivo de
  asserts soltos o escopo é único e nome de `const` colide.

---

## A decisão de desenho que este PR resolve

`check_invite` é a **primeira ação da fila que produz DADO**, não só sucesso/fracasso. Isso bate
em dois contratos existentes:

### 1. Cadência: D7 pede 10 leituras / 10 min, o loop roda 15/min

O loop de lote é 1 operação por tenant por tick, tick de 4 s (`MAX_OPS_PER_TENANT_PER_TICK = 1`
+ `WORKER_BULK_INTERVAL_MS`) — ~15/min. D7 quer **1 leitura por minuto** para `check_invite`.

**Decisão: a trava vai na RPC `claim_bulk_jobs`, não num loop novo.** Um segundo loop seria
outro processo mordendo o mesmo número, outra env var e outro intervalo para calibrar. A RPC já
é o lugar onde o teto mora (o cabeçalho do `bulk-loop.ts` diz, textualmente, que o teto vive em
dois lugares de propósito).

**A trava PULA, não bloqueia.** Um `check_invite` estrangulado na cabeça da fila (91 deles
enfileirados) travaria por 91 minutos um lote de foto enfileirado depois. O predicado filtra
`check_invite` da escolha quando já saiu um no último minuto, deixando as outras ações passarem.

### 2. Ack: o contrato de hoje é `{status, error?}` e não cabe resultado

**Decisão: o worker não decide `same`/`changed`/`broken`.** Ele devolve o que leu
(`invite: string | null`) ou o erro cru com o status HTTP. **Quem compara é o web**, onde o
`invite_url` guardado está e onde `classifyInviteFailure` já mora. O worker continua burro, a
decisão fica pura e testável sem rede.

| O que o worker devolve | O que o web grava |
|---|---|
| `done` + convite igual ao guardado | `invite_check='same'`, `invite_checked_at=now()` |
| `done` + convite diferente e válido | `invite_check='changed'`, **atualiza `invite_url`**, `invite_checked_at=now()` |
| `failed` + falha **permanente** (403 / gone / locked) | `invite_check='broken'`, `invite_checked_at=now()`, **NÃO apaga** o `invite_url` guardado |
| `failed` + falha **passageira** (rede / 5xx) | job `failed`, **nada** gravado em `groups` — a revisão não aconteceu, e fingir que aconteceu é pior que não ter revisado |

A quarta linha é a que importa: marcar `broken` numa queda de rede diria ao lojista que o grupo
está quebrado quando o problema era a Evolution — e `classifyInviteFailure` já sabe separar os
dois casos, inclusive o 404 achatado que não distingue "perdi o admin" de "a instância sumiu".

---

## Tarefas

### Task 0: Baseline da worktree
Branch nova de `origin/main` (já com #235). Confirmar árvore limpa e `git log -1`.

### Task 1: Migração nos dois bancos
`apps/web/supabase/migrations/2026-09-03-check-invite-e-revisao.sql`:
- `alter table public.group_bulk_jobs drop constraint group_bulk_jobs_action_check;`
  `... add constraint group_bulk_jobs_action_check check (action = any (array['set_description','set_picture','open','close','check_invite']));`
- `alter table public.groups add column if not exists invite_checked_at timestamptz;`
- `alter table public.groups add column if not exists invite_check text;`
  `... add constraint groups_invite_check_check check (invite_check is null or invite_check = any (array['same','changed','broken']));`
- `create or replace function public.claim_bulk_jobs(...)` com o predicado da cadência.

Aplicar em **dev e prod**, atualizar `apply-order.txt`, regenerar `schema-baseline.json`,
rodar o advisor de segurança do Supabase.

### Task 2: `bulk-batch.ts` — a ação nova (puro)
`BulkAction` ganha `check_invite`. `planCheckInviteJobs` monta o lote (sem `description`, sem
`media_id`) — reusa `selectBulkTargets`, que já descarta quem não é admin. Testes no arquivo
existente.

### Task 3: `invite-review.ts` — a decisão (puro, novo)
`decideInviteReview({ guardado, lido, falha })` → `{ verdict, inviteUrl? }` conforme a tabela
acima. `resumoRevisao(grupos)` → contagens + `ultimaRevisao`. `etaRevisao(n)` → minutos a
1/min. Testes cobrindo as quatro linhas + o mutante (trocar permanente por passageiro).

### Task 4: Store e ack
`ackBulk` aceita `{ status, error?, invite?, httpStatus?, detail? }` e, para `check_invite`
concluído, grava em `groups` no mesmo padrão do `send_state`. `claimBulk` sem mudança
(a trava é da RPC).

### Task 5: Rota `/api/campanhas/[slug]/grupos/revisao`
`POST` enfileira o lote (irmã de `identidade` e `estado`). `GET` devolve o resumo (contagens +
última revisão) para a tela.

### Task 6: Worker
`BulkDeps` ganha `inviteUrl`; `bulk-deps.ts` liga no `createEvolutionGroups` que já existe.
`applyJob` passa a poder devolver resultado, e o `case "check_invite"` devolve o convite lido.
O `catch` do `runTenant` passa a repassar `httpStatus`/`detail` no ack. Testes no
`bulk-loop.test.ts`.

### Task 7: UI — "Configurações dos grupos"
Renomear o bloco e as três seções. **Estado** ganha a contagem antes dos botões. **Manutenção**
ganha Revisar links com última revisão, contagens e "Revisar agora". O ETA deixa de ser
`OPS_POR_MINUTO` fixo: identidade continua 15/min, revisão é 1/min.

### Task 8: E2E
Contraste API × tela no padrão de [[pattern-e2e-contraste-api-x-tela]]: âncora do bloco novo +
expectativa derivada em runtime da rota `GET .../revisao`, nunca número fixo.

### Task 9: Gate local, PR, CI, merge, quadro
`verify-local.ps1` → push → PR → CI verde nos 7 → merge → `move_card`.

---

## Fora deste PR (declarado, não esquecido)

- **Varredura noturna de madrugada** (segunda metade de D7). Exige cron novo, que precisa
  entrar na allowlist do `vercel.json` (fora dela dá 401) e o plano Hobby só aceita cron
  diário — é decisão de infra, não de tela. O "Revisar agora" manual entrega o valor primeiro.
- **PR D — remover pessoas** (`remove_participants`, coluna `payload`, listagem de
  participantes). Confirmado por SQL que `payload` não existe em nenhum dos dois bancos.
- **Horário automático de abrir/fechar** (PR 3 da spec de 30/08) — a seção Estado cita como
  próximo passo, sem botão morto.

## Tamanho

~16 arquivos. A regra do CLAUDE.md diz que acima de ~10 provavelmente são dois PRs; aqui a
divisão natural seria Estado (sem migração) e Revisar links (com migração), mas as duas
reescrevem o MESMO bloco de tela — separar significaria renomear e reestruturar
`acoes-em-massa.tsx` duas vezes, com a segunda desfazendo o layout da primeira. Fica um PR só,
com a varredura noturna cortada fora para compensar.
