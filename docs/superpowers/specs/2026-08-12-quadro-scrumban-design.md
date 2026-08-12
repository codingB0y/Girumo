# Quadro Scrumban de features — design

**Data:** 2026-08-12
**Estado:** aprovado, aguardando plano de implementação

## Problema

O estado das features do Girumo vive espalhado em cinco lugares que não conversam:
`TASK_PROGRESS.md` (519 linhas de sprints F0–F5 com checkbox), 92 PRs quase todos
mergeados, `docs/superpowers/specs/` e `plans/`, os `docs/plano-*.md` avulsos, e as
memórias de sessão. O issue tracker do GitHub está **vazio** — nunca teve uma issue
aberta ou fechada, apesar das labels de triagem existirem.

Não existe nenhuma superfície onde se responda "o que existe, o que está no ar, o que
está quebrado" sem reconstruir a resposta lendo tudo.

### O modo de falha específico deste projeto

O padrão que se repete no histórico não é tarefa parada na fila. É **feature que parece
pronta e não está**:

- o executor de automações está vivo em produção e **ocioso** — zero automações ligadas;
- o link mestre depende de `invite_url`, um campo que o lojista **não tem UI** para preencher;
- `components/instances-panel.tsx` era **código morto**, nunca importado;
- o gate de lotação do auto-grow estava com a **lógica invertida** — ligar a feature criaria grupo do nada;
- 5 dos 13 PRs drenados em 30/07 **não tinham nada a entregar**: o trabalho já estava em `main` por outro caminho.

Um quadro com coluna "Feito" teria mostrado todos esses casos como feitos. O vocabulário
do board é, portanto, a decisão de design mais importante — não a tecnologia.

## Decisões

| # | Decisão | Alternativas descartadas |
|---|---|---|
| D1 | **Card = feature do produto**, não tarefa de sprint | Card por tarefa/PR (esvazia ao fim da sprint, não mostra o produto); dois níveis épico+tarefa (dobra o custo e um dos níveis apodrece) |
| D2 | **Mora no Supabase + página `/admin/quadro`** | GitHub Projects (fora do produto, visual não é o dele); arquivo versionado no git (não atualiza durante a sessão) |
| D3 | **Colunas = maturidade honesta**, sem "Feito" | Scrumban clássico (a coluna "Feito" é exatamente a mentira que morde); fluxo + selo separado (dois estados por card, um apodrece) |
| D4 | **Edição por controles simples**, sem arrastar | Drag-and-drop (dobra o PR: biblioteca, toque, ordem persistida, teclado — para um card movido por dia); só leitura (obriga a pedir no chat) |
| D5 | **Limite de WIP visual + feed de eventos** | Sprints nomeadas com data (a cadência real é por sessão, não quinzenal) |
| D6 | **Entrega em polling de 4s**, não Supabase Realtime | ver "Correção" abaixo |

### Correção: o Realtime deste app é decorativo

A opção D2 foi apresentada prometendo "Supabase Realtime de graça, o app já usa o padrão".
**A promessa não se sustenta.** Verificado nos dois bancos em 12/08/2026:

- **dev (`wfjuwogxaupyadwhvoxy`):** a publicação `supabase_realtime` está **vazia** — nenhuma tabela;
- **prod (`nidoatbxaylrkcgbszns`):** 6 tabelas publicadas (`squads`, `agents`, `missions`,
  `decisions`, `memories`, `handoffs`), mas a policy delas é
  `workspace_id = current_setting('app.workspace_id')` — um GUC de sessão que o cliente do
  navegador nunca seta. A RLS derruba a leitura antes de virar evento.

Os três consumidores de `postgres_changes` no web (`painel/squad-os`, `notification-bell`,
`realtime-toasts`) estão inscritos em nada. **Achado registrado, fora do escopo deste
trabalho** — não corrigir aqui.

Consequência para este design: entrega por **polling**. Realtime exigiria liberar `SELECT`
ao cliente anônimo (a anon key vai no bundle → roadmap interno, incluindo a coluna
"quebrado", legível por qualquer um). SSE não sobrevive ao corte de duração de função do
Vercel. Polling de 4s numa aba aberta é indistinguível de push para este uso.

## Arquitetura

**Rota:** `/admin/quadro`, atrás do `requireAdmin()` existente (`apps/web/src/lib/admin-guard.ts`).
Nome em português seguindo as outras 12 rotas do admin. Entrada na sidebar, seção "Sistema".

**Banco:** as duas tabelas vão nos **dois** Supabase (regra do projeto), mas o **dado
canônico é o de produção** — é onde o board é consultado, em `girumo.com.br/admin/quadro`.
O agente escreve em prod via SQL do MCP, esteja trabalhando local ou não. Dev recebe o mesmo
schema e duas linhas de semente, só para a página buildar e os testes rodarem; o dado de dev
é rascunho e pode divergir sem consequência.

**Segurança:** RLS ligada e **sem policy nenhuma** nas duas tabelas — deny-all, só
`service_role` enxerga. A página lê no servidor com `getSupabaseAdmin()` depois do
`requireAdmin()`; a escrita passa por rota de API com a mesma guarda. Nenhum caminho
anônimo, nenhum lojista. As tabelas **não** entram na publicação `supabase_realtime`.

Sem `tenant_id`: é dado operacional interno, não dado de cliente. A regra do
`.eq('tenant_id')` não se aplica porque não há tenant — o isolamento aqui é o deny-all.

## Modelo de dados

### `public.board_features`

| coluna | tipo | papel |
|---|---|---|
| `id` | uuid pk | |
| `key` | text unique | slug estável (`grupos-auto-grow`) — é por ele que o agente move o card sem ambiguidade |
| `title` | text | nome legível |
| `area` | text | raia/filtro: `Grupos`, `Campanhas`, `Disparos`, `Automações`, `Páginas`, `Auth`, `Engine/Worker`, `Admin`, `Landing`, `Infra` |
| `status` | text | `nao_existe` · `em_construcao` · `no_ar_nao_verificado` · `no_ar_verificado` · `quebrado` |
| `summary` | text | uma linha: o que a feature é |
| `blocker` | text | **por que não anda**; nulo quando anda. É o campo que teria gritado "`invite_url` não tem UI" |
| `evidence` | text | a prova: `PR #90`, uma query, um caminho de arquivo |
| `evidence_at` | timestamptz | quando a prova foi colhida |
| `priority` | text | `alta` · `media` · `baixa` |
| `sort_order` | integer | ordem dentro da coluna |
| `created_at` / `updated_at` | timestamptz | |

**A regra anti-mentira é uma constraint, não um combinado:**

```sql
constraint board_features_verificado_exige_prova
  check (status <> 'no_ar_verificado'
         or (evidence is not null and evidence_at is not null))
```

O Postgres recusa o update. Não existe "prometo verificar depois".

### `public.board_events` (append-only)

`id`, `feature_id` (fk, `on delete cascade`), `from_status`, `to_status`, `note` (o motivo),
`ref` (PR/commit/arquivo), `actor` (`claude` | `igor`), `created_at`.

**Escrito por trigger**, não por disciplina: `after update of status on board_features`
insere o evento. Não há como mover um card e esquecer de registrar. Quando o update vem
cru (sem passar pelo RPC), `note` fica nulo — e um evento sem motivo é, ele próprio, o
sinal de que alguém mexeu sem explicar.

### `app.move_card(...)`

RPC `security definer` com `set search_path` (padrão do projeto, como
`app.enqueue_broadcast`), assinatura `(p_key, p_status, p_note, p_ref, p_actor)`. Faz o
update e carrega `note`/`ref`/`actor` para o trigger via GUC de transação. Uma chamada por
movimento — é o que torna verdadeiro o "eu movo o card com uma chamada".

## A página

Cinco colunas com rolagem horizontal, **filtro por área no topo** — não raias. Com ~40 cards
em 5 colunas, raia por área produziria uma grade quase vazia; o filtro dá a mesma leitura
sem o buraco.

**Cabeçalho de coluna:** nome, contagem, e em "Em construção" o limite de WIP no formato
`2/3`, vermelho ao estourar. Limite **só visual, sem trava no banco** — trava viraria
obstáculo contornado por gambiarra.

**Card:** título, chip de área, marca de prioridade, `blocker` em vermelho quando existe, e a
idade da verificação quando verificado.

**Selo "verificação vencida":** card em `no_ar_verificado` com `evidence_at` de mais de 30
dias ganha selo de vencimento. Sem isso o quadro vira foto antiga em três semanas e volta a
mentir — com mais confiança, que é pior. Não move o card de coluna: só marca.

**Feed:** coluna lateral colapsável com os últimos 30 eventos — data, card, transição, motivo,
`ref`.

## Como o card se move

- **O agente:** `app.move_card(...)` via SQL do MCP, apontando para prod.
- **O Igor:** seletor de coluna no card → `PATCH /api/admin/quadro`, que chama o mesmo RPC com
  `actor = 'igor'`. Também cria card, edita nota, blocker e prioridade.
- **Regra no `CLAUDE.md`:** ao terminar feature ou PR, atualizar o card correspondente.

Este último item é o único pedaço que depende de disciplina, e vai falhar às vezes. O selo de
vencimento existe para tornar essa falha visível em vez de silenciosa.

## Carga inicial

Fontes: `TASK_PROGRESS.md`, os 92 PRs, os `docs/plano-*.md`, `docs/superpowers/specs|plans/`,
e as memórias de sessão.

**Nada nasce em `no_ar_verificado`.** Só entra em verificado o que for verificado no ato, com
prova anexada. Todo o resto — mesmo mergeado, mesmo rodando em produção — nasce em
`no_ar_nao_verificado`.

O quadro vai nascer feio, com a maioria dos cards numa coluna que parece acusação. É esse o
valor: o histórico do projeto diz que boa parte do que se supõe pronto não está.

## Fora de escopo (YAGNI)

Burndown, cycle time, velocity, sprint com data de início e fim, drag-and-drop, notificação
por e-mail, permissão multi-usuário. A cadência real do projeto é por sessão, não por
calendário; gráfico de sprint num time de uma pessoa é enfeite que envelhece.

## Arquivos

```
apps/web/supabase/migrations/20260812120000_board_quadro.sql   # tabelas, trigger, RPC, RLS
deploy/supabase/apply-order.txt                                # + entrada
apps/web/src/lib/types/quadro.ts                               # tipos e o union de status
apps/web/src/lib/stores/quadro.ts                              # leitura/escrita, service role
apps/web/src/app/api/admin/quadro/route.ts                     # GET + POST + PATCH, requireAdmin
apps/web/src/app/admin/quadro/page.tsx                         # server component, fetch inicial
apps/web/src/components/admin/quadro/board.tsx                 # client, polling de 4s
apps/web/src/components/admin/quadro/card.tsx
apps/web/src/components/admin/quadro/feed.tsx
apps/web/src/components/admin/sidebar.tsx                      # + item "Quadro" em Sistema
```

## Testes

| o quê | como |
|---|---|
| A constraint recusa `no_ar_verificado` sem prova | smoke SQL em Postgres real, no padrão de `infra/tests/dispatch-fanout-smoke.sql` |
| `move_card` grava o evento com motivo e ator | mesmo smoke |
| Update cru grava evento com `note` nulo | mesmo smoke |
| A rota de API rejeita quem não é admin | teste da rota |
| Selo de vencimento aparece acima de 30 dias | teste de componente com data fixa |
| Contador de WIP fica vermelho ao estourar | teste de componente |

## Faseamento

| PR | conteúdo | por quê separado |
|---|---|---|
| **PR-1** | migração (tabelas, trigger, constraint, RPC), página read-only, feed, polling | entrega o quadro funcionando; prova o conceito |
| **PR-2** | edição: seletor de coluna, criar card, nota, blocker, prioridade | é UI + API, não schema |
| **PR-3** | carga das ~40 features, regra no `CLAUDE.md` | é conteúdo, não código — e é a parte demorada |

## Riscos

**O quadro depende de alimentação.** Trigger, constraint e selo de vencimento tornam o
apodrecimento visível, não o impedem. Um quadro inteiro com selo vencido em duas semanas é o
sistema funcionando: avisando que ninguém verificou nada.

**O dado vive fora do git.** Diferente de um arquivo versionado, um card pode divergir do
código sem que nenhum review barre. Mitigado pelo par `evidence` + `evidence_at`, que obriga
a apontar para algo concreto e datado.

**Divergência dev↔prod é esperada e aceita** para estas duas tabelas — dev é rascunho por
desenho, não por descuido.
