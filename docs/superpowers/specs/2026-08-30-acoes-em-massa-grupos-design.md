# Ações em massa nos grupos da campanha — desenho

> **Data:** 30/08/2026 · **Status:** aprovado pelo Igor em 30/08/2026
> **Escopo:** foto e descrição em massa, e abrir/fechar grupo (imediato e por horário).
> O executor espelha o auto-grow (`grow-loop.ts`), que é o precedente da casa para
> operação de grupo contra a Evolution.

## Problema

O painel sabe **criar** grupo (auto-grow) e **enviar** mensagem, mas não sabe
mexer nos grupos que já existem. Hoje, para o lojista com 91 grupos admin:

- trocar a foto de todos exige abrir 91 conversas no celular, uma a uma;
- padronizar a descrição, idem;
- "fechar o grupo fora do expediente" — a operação mais rotineira do atacado,
  porque grupo aberto de madrugada vira bagunça e opt-out — não existe. Quem faz,
  faz na mão, todo dia, duas vezes.

O código para as três operações **já está no repositório** e é usado uma vez só,
na criação: `evolution-groups.ts` expõe `setDescription`, `setPicture` e
`setAnnounceOnly`. O que falta é aplicá-las em lote sobre grupos existentes, com
fila, ritmo e agendamento.

## Decisão

Fila nova (`group_bulk_jobs`) com **um job por (grupo × ação)**, drenada por um
loop novo no worker (`bulk-loop.ts`). O app decide e enfileira; o worker executa e
reporta. Mesmo contrato `pending`/`ack` do auto-grow.

Um job por grupo — e não um job por lote com `group_ids[]` — porque falha parcial
precisa ter onde morar: 4 grupos que recusaram a foto não podem obrigar os outros
87 a repetir a operação, e o progresso ("47 de 91") sai de graça da contagem de
linhas.

### Decisões de produto travadas com o Igor (30/08)

| Pergunta | Decisão |
|---|---|
| O que é "abrir/fechar" | Quem pode **mandar mensagem**: `not_announcement` ↔ `announcement`. Não mexe em `locked`/`unlocked` nem no link de convite. |
| Foto | **Uma imagem só**, aplicada em todos os grupos da campanha. |
| Descrição | **Texto idêntico** em todos. Sem variáveis. |
| Escopo do lote | **Todos os grupos da campanha.** |
| Agendamento | Horário customizável **por dia da semana**, mais ação imediata ("abrir agora"). |
| Herança | Aplicar em massa **vira o padrão da campanha** — grava no `grow_template`. |
| Ritmo | **~15 grupos/min** (médio). |

#### Adendo do PR 2 (31/08/2026)

| Pergunta | Decisão |
|---|---|
| Escopo do lote | **Só grupos onde somos admin** (`is_admin === true`), corrigindo o "todos os grupos da campanha" acima. Grupo não-admin é falha garantida e cada falha queima 4s da janela anti-ban. A tela mostra "N de M". |
| Foto + descrição | **Um `batch_id` para as duas ações.** Uma aplicação é um evento só para o lojista. |
| Descrição vazia | Confirmação na tela **e** flag `confirmClear: true` no body; a rota recusa 400 sem ela. |

Medido em 31/08 antes de escrever o código: em **produção**, `campaign_groups.group_ids`
casa 100% por `whatsapp_group_id` e 0% por UUID de `groups.id` — é essa a chave que
`selectBulkTargets` usa. Em **dev** há seed antigo guardando UUID, que não casa com nada;
por isso a aba Grupos daquele tenant já mostrava "Grupo / 0 membros" antes deste PR.

### Abordagens descartadas

- **Reusar `engine_commands`** (fila que já existe e já tem claim anti-ban): é
  fila de *envio de mensagem*. O anti-ban dela conta mensagem por número/hora, e
  trocar foto passaria a gastar cota de disparo do lojista. Pior: `record_send` e
  `reconcile_broadcast_progress` agregam por broadcast, e jobs sem broadcast
  sujariam o progresso das ofertas.
- **Síncrono na rota do app** (sem fila, sem tabela): 91 grupos × ~1s estoura o
  timeout do serverless, não tem retry, não tem progresso — e o agendamento não
  teria como acontecer, porque rota não roda sozinha às 08:00.
- **Reusar a tabela `schedules`** para o horário: ela é amarrada a `broadcast_id`
  / `campaign_message_id` e tem status `pending|running|done|failed`, que é ciclo
  de vida de disparo único. Recorrência semanal com dias distintos e dois
  horários por dia não cabe no formato sem desfigurá-lo.

## Arquitetura

```
apps/web/supabase/migrations/
  <ts>_group_bulk_jobs.sql            fila + groups.send_state         (PR 1)
  <ts>_group_hours.sql                horário de funcionamento         (PR 3)

apps/web/src/lib/stores/
  group-bulk-jobs.ts                  enfileirar, claim, ack           (PR 1)
  group-hours.ts                      CRUD do horário                  (PR 3)
apps/web/src/lib/groups/
  bulk-batch.ts                       montar lote (puro, testável)     (PR 1)
  hours-window.ts                     janela por tz+weekday (puro)     (PR 3)

apps/web/src/app/api/groups/bulk/
  pending/route.ts                    worker claima                    (PR 1)
  ack/route.ts                        worker reporta                   (PR 1)
apps/web/src/app/api/campanhas/[slug]/grupos/
  identidade/route.ts                 foto + descrição                 (PR 2)
  estado/route.ts                     abrir/fechar agora               (PR 2)
  lotes/route.ts                      progresso do lote ativo          (PR 2)
  horario/route.ts                    CRUD do horário                  (PR 3)

apps/web/src/components/painel/grupos/
  acoes-em-massa.tsx                  bloco da aba Grupos              (PR 2)
  horario-semana.tsx                  grade de dias da semana          (PR 3)

apps/worker/src/
  bulk-loop.ts                        loop, deps injetadas             (PR 1)
  bulk-deps.ts                        ligação Supabase + Evolution     (PR 1)
  bulk-dry-run.ts                     embrulho que não chama a rede    (PR 1)
  evolution-groups.ts                 + setOpenToAll                   (PR 1)
```

## Modelo de dados

### `group_bulk_jobs` (PR 1)

```sql
create table if not exists public.group_bulk_jobs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references organizations(id) on delete cascade,
  campaign_group_id  uuid not null references campaign_groups(id) on delete cascade,

  -- Agrupa os N jobs de UMA aplicação. É o que dá a barra de progresso.
  batch_id           uuid not null,

  action             text not null
                       check (action in ('set_description','set_picture','open','close')),

  group_id           uuid not null references groups(id) on delete cascade,
  -- Desnormalizado de propósito: o claim precisa ser autocontido, como em
  -- group_grow_jobs.campaign_slug. O worker não faz join.
  whatsapp_group_id  text not null,

  -- Carga da ação. Exatamente um dos dois preenchido, conforme `action`.
  description        text,
  media_id           text,

  status             text not null default 'queued'
                       check (status in ('queued','running','done','failed')),
  attempts           integer not null default 0,
  error              text,

  created_at         timestamptz not null default now(),
  running_since      timestamptz,
  last_ack_at        timestamptz,
  updated_at         timestamptz not null default now()
);

-- Reenfileirar o mesmo lote é no-op em vez de duplicar a operação no WhatsApp.
create unique index if not exists group_bulk_jobs_batch_uidx
  on public.group_bulk_jobs (tenant_id, batch_id, group_id, action);

create index if not exists group_bulk_jobs_queued_idx
  on public.group_bulk_jobs (tenant_id, created_at) where status = 'queued';
create index if not exists group_bulk_jobs_running_idx
  on public.group_bulk_jobs (tenant_id, last_ack_at) where status = 'running';
create index if not exists group_bulk_jobs_batch_idx
  on public.group_bulk_jobs (tenant_id, batch_id);
```

### `groups.send_state` (PR 1)

```sql
alter table public.groups
  add column if not exists send_state    text check (send_state in ('open','closed')),
  add column if not exists send_state_at timestamptz;
```

Sem essa coluna a interface não tem como dizer se o grupo está aberto ou fechado
sem perguntar ao WhatsApp grupo a grupo. É escrita no `ack` de um job `open`/`close`
— ou seja, reflete o que **nós** aplicamos, e `null` significa honestamente
"nunca aplicamos, não sabemos".

### `group_hours` (PR 3)

```sql
create table if not exists public.group_hours (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references organizations(id) on delete cascade,
  campaign_group_id  uuid not null references campaign_groups(id) on delete cascade,

  weekday            smallint not null check (weekday between 0 and 6),  -- 0 = domingo
  opens_at           time,     -- null = não abre nesse dia
  closes_at          time,     -- null = não fecha nesse dia
  timezone           text not null default 'America/Sao_Paulo',
  enabled            boolean not null default true,

  -- Idempotência sem lock: "já abriu hoje?" é uma comparação de data.
  last_open_on       date,
  last_close_on      date,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists group_hours_dia_uidx
  on public.group_hours (tenant_id, campaign_group_id, weekday);
```

Hora **local + timezone**, não UTC. Guardar UTC obrigaria a reconverter a cada
mudança de horário de verão e é a origem clássica do grupo que abre 3h errado.

### RLS

⚠️ **A policy de `group_grow_jobs` não será copiada.** Ela usa
`current_setting('app.tenant_id', true)::uuid`, e o app **nunca seta esse GUC** —
é uma das 13 policies do banco que nunca avaliam verdadeiro (ver CLAUDE.md,
medição de 22/08). As duas tabelas novas usam o padrão das 99 que funcionam:

```sql
alter table public.group_bulk_jobs enable row level security;
create policy "group_bulk_jobs_tenant" on public.group_bulk_jobs
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));
```

Isso é defesa em profundidade, não a proteção real: o caminho de escrita usa
service-role, então **todo acesso continua obrigado a filtrar `.eq('tenant_id')`
explicitamente**.

## Execução e anti-ban

`bulk-loop.ts` roda em cadência própria: **tick de 4s, no máximo 1 operação por
tenant por tick** → ~15/min, com espaçamento uniforme.

O espaçamento é deliberado e não é o mesmo que "15 por minuto". Disparar 15
chamadas de admin no mesmo segundo e ficar 55s parado é exatamente o padrão de
automação que o WhatsApp reconhece; uma a cada 4s parece uso. Como no auto-grow,
**o intervalo é o anti-ban** — sem bucket em memória, sem tabela de estado.

Com 91 grupos, um lote leva ~6 minutos. Consequência a comunicar na interface: um
"abrir 08:00" termina de valer por volta de 08:06.

Fluxo por tick, por tenant:

1. `POST /api/groups/bulk/pending` — claima os jobs. **A partir do PR 3**, a rota
   materializa o horário (`materializeScheduled`) **antes** do claim, espelhando
   `/grow/pending`, que roda `evaluateAutoGrow` antes de claimar: a decisão fica
   no app, o worker continua burro. No PR 1 a rota só claima.
2. Executa a ação contra a Evolution. Para `set_picture`, o `media_id` vira URL
   assinada de TTL curto pelo mesmo `signedMediaUrl` que o auto-grow já usa
   (`grow-deps.ts`) — a Evolution busca a imagem no ato do POST.
3. `POST /api/groups/bulk/ack` com `{ id, status, error? }`. Em `open`/`close`
   com sucesso, o app grava `groups.send_state`.

Job preso em `running` além de `STALE_RUNNING_MS` volta para `failed`, como em
`failStaleRunning` do grow.

**Não há retry automático.** `failed` é terminal e `attempts` serve só para
contar recuperações de job preso. Reenfileirar 91 operações sozinho, sem alguém
olhando o motivo, é como se fabrica rajada contra o WhatsApp — e o modo de falha
mais provável (grupo onde perdemos o admin) não melhora com repetição. A interface
mostra quantos falharam e oferece "tentar de novo nos que falharam", que abre um
lote novo.

### Cliente Evolution

Um método novo, `setOpenToAll(instanceName, groupJid)` → `POST
/group/updateSetting` com `action: "not_announcement"`. O `setAnnounceOnly` que
já existe é o "fechar". Ambos já validados contra o schema da v2.3.7.

### Dry-run

`WORKER_BULK_ENABLED != true` é o default: o loop roda inteiro, loga o que faria
e não chama a Evolution — igual a envio e auto-grow. Sem isso, o primeiro deploy
mexeria em 91 grupos reais.

## Herança

Aplicar identidade em massa **também** grava `desc` e `mediaId` em
`campaign_groups.grow_template`. O `grow-loop` já lê esses campos na criação, então
o grupo 92 nasce com a foto e a descrição certas — sem isso, cada grupo novo
nasceria fora do padrão que o lojista acabou de aplicar.

Para o estado de envio: ao criar um grupo, o auto-grow enfileira um job
`open`/`close` conforme a janela vigente. Sem isso o grupo novo nasceria fechado
(o `announce: true` do template) no meio do expediente, e só abriria no dia
seguinte.

## Interface

Aba **Grupos** da campanha, um bloco "Ações em massa" acima da grade:

- **Identidade** — upload da foto, textarea da descrição, botão "Aplicar nos N
  grupos". Descrição vazia **exige confirmação explícita**: string vazia apaga a
  descrição dos 91 grupos no WhatsApp, e isso não pode ser um clique distraído.
- **Horário de funcionamento** — grade de dias da semana com abre/fecha, mais
  "Abrir agora" e "Fechar agora".
- **Progresso** — enquanto um lote roda: "Aplicando foto — 47 de 91". Polling,
  não realtime: o realtime do app é decorativo (`postgres_changes` sem evento).
- **Selo** por `GroupCard`: aberto / fechado / sem informação.

## Testes

- **Unitário, sem rede:** `bulk-loop.ts` com deps injetadas (padrão de
  `grow-loop.test.ts`); `hours-window.ts` — a conversão tz+weekday, incluindo
  virada de dia e `opens_at` nulo; `bulk-batch.ts` — montagem do lote.
- **Integração:** a cadeia enfileirar → claim → ack → `send_state` gravado, no
  molde de `cadeia-automacao.integration.test.ts`. Um teste de integração é o que
  pega o defeito *entre* os elos; e o mutante tem de ser rodado para provar que o
  teste mata.
- **E2E:** aplicar descrição em massa e ver o progresso avançar. Contraste
  API × tela (âncora + derivação em runtime), não número fixo no spec.

## Riscos

| Risco | Tratamento |
|---|---|
| Migração só num banco | Aplicar em **dev e prod** e registrar em `deploy/supabase/apply-order.txt`. O gate de drift do CI quebra se faltar. |
| Worker não pega o código novo | Coolify precisa de **Redeploy manual** — PR de código não muda a stack. |
| Descrição vazia apaga tudo | Confirmação explícita na interface antes de enfileirar. |
| Lote disparado duas vezes | `unique (tenant_id, batch_id, group_id, action)`; reenfileirar é no-op. |
| Ban do número | Espaçamento de 4s + dry-run por default + teto por tenant por tick. |
| `send_state` divergir do WhatsApp | `null` é estado legítimo ("não sabemos"). A coluna registra o que aplicamos, não o que o WhatsApp diz. |

## Fora de escopo

- Foto do **número** conectado (`updateProfilePicture`) — é uma chamada só, não é
  operação em massa.
- `locked`/`unlocked` (quem edita os dados do grupo).
- Revogar link de convite: invalidaria os links já espalhados em LP e anúncio.
- Descrição com variáveis por grupo.

## Fatiamento

Um PR único passaria de 25 arquivos; o CLAUDE.md manda quebrar.

1. **PR 1 — Base.** Migração (`group_bulk_jobs` + `send_state`), store, rotas
   `pending`/`ack`, `bulk-loop.ts` em dry-run, `setOpenToAll`. Sem interface.
2. **PR 2 — Ações imediatas + interface.** Rotas de identidade e estado, bloco de
   ações em massa, selo, progresso.
3. **PR 3 — Horário automático.** `group_hours`, CRUD, grade semanal,
   materialização agendada e herança no `grow_template`.
