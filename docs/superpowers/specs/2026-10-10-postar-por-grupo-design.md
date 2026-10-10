# Postar por grupo — design

- **Status:** aguardando revisão do Igor
- **Data:** 10/10/2026 (decisões tomadas em 08–10/10, sessão de grilling)
- **Mockup:** https://claude.ai/artifact/VvMiGdwbaNCP9pHJQZzmwc (5 telas; 1, 2, 3 e 5 clicáveis)
- **Base:** `origin/main` em `1ef1007d`

## 1. Problema

A loja lota os grupos de uma campanha **um por um** pelo link mestre `/r/<slug>`. Hoje toda postagem
vai para **todos** os grupos da campanha (`messages/route.ts:136-138` usa `camp.group_ids` inteiro) —
inclusive o grupo que está recebendo gente agora. Quem acabou de entrar chega no meio de uma conversa,
quem já estava vê a mesma mensagem de novo quando o grupo seguinte começa a receber posts, e vira bagunça.

O lojista precisa de um jeito fácil de postar **em todos os grupos menos o que está enchendo**, de
**marcar e desmarcar** grupos lotados, e de **organizar** os grupos numa sequência com nome padronizado.

## 2. Decisões (vinculantes para os planos)

| # | Decisão |
|---|---|
| D1 | "Lotado" é uma **marca gravada** no grupo (`lotado_em`), nunca recalculada da contagem. Entra sozinha quando o grupo **cruza 95% subindo**, ou à mão pelo botão "Marcar como lotado". Nunca sai sozinha. |
| D2 | **"Reabrir"** limpa a marca e devolve o grupo ao link. Fica **bloqueado** (com o motivo na tela) se o grupo ainda está ≥ 95%. Depois de reaberto, ele lota de novo sozinho ao cruzar 95%. |
| D3 | O link **pula grupos lotados**, qualquer que seja a contagem. O grupo reaberto **tem prioridade** sobre a sequência; quando lota, o link volta à ordem normal. |
| D4 | Um grupo pertence a **uma campanha só**. Os que hoje estão em duas aparecem numa lista para o lojista escolher onde ficam; nada é removido sozinho. |
| D5 | **Postar não bloqueia nada.** O estado do grupo pré-filtra o destino. O único grupo excluído por padrão é o **"enchendo agora"** (o que o link está usando neste instante). |
| D6 | Seletor de destino com três atalhos: **Todos menos o que está enchendo** (padrão), **Só lotados**, **Todos com gente**. Embaixo, a lista com caixa por grupo. Marcar o grupo que está enchendo mostra um **aviso amarelo** que não impede o envio. |
| D7 | **Grupos vazios** (só o nosso número) ficam fora de todos os atalhos. Aparecem desmarcados e dá para marcar à mão. |
| D8 | Atalho escolhido = **regra guardada no disparo**, refeita **na hora do envio** (agendado e repetido incluídos). Mexer na lista à mão = **lista fixa**. |
| D9 | **"Padronizar nomes e sequência"**: nome base + prévia ordenada (**lotados primeiro, cada bloco do mais cheio para o menos cheio**; depois enchendo, fila e vazios). Setas para ajustar. Aplicar renomeia aos poucos pela fila anti-ban, salva a ordem e faz o auto-grow criar o próximo como "<base> <n+1>". Depois a ordem fica fixa. Grupos em duas campanhas não são renomeados até o conflito ser resolvido. |
| D10 | **Aviso ao lotar** por campanha: texto opcional, enviado **uma vez por grupo** quando ele ganha a marca de lotado (sozinho ou à mão). Reabrir e lotar de novo não repete. Grupos já lotados antes de ligar o aviso não recebem. |
| D11 | "Postar toda semana" **não** é automação: é o agendamento com `recurrence = weekly` que já existe. Como a regra é refeita a cada envio, o repetido semanal pula o grupo que estiver enchendo naquele dia. |
| D12 | Limite de lotado fica em **95% da capacidade** (a capacidade já é editável por grupo, 1–1024). Sem configuração nova. |

Contexto que mudou durante o desenho: as automações (gatilhos `group_full`, `weekly_recurring`) foram
**removidas em 23/09** (#321–#324). D10 e D11 substituem o que elas fariam, sem ressuscitar o motor.

## 3. Vocabulário

Estados de um grupo **dentro da sua campanha**:

| Estado | Regra | Link manda gente? | Atalho padrão posta? |
|---|---|---|---|
| `lotado` | `lotado_em is not null` | não | sim |
| `enchendo` | o **primeiro grupo disponível** na ordem de prioridade (seção 5.2) — no máximo 1 por campanha | sim | **não** |
| `vazio` | não lotado, não enchendo, `members <= greatest(admins_ours, 1)` | quando chegar a vez | não (só à mão) |
| `fila` | todo o resto | quando chegar a vez | sim |

"Disponível" = `is_admin` + convite `^https?://\S+$` + não lotado + `members < limiar`. É exatamente o
`isGroupAvailable` de hoje (`resolve-click-target.ts:69`) mais a marca de lotado.

`limiar(capacity) = (capacity > 0 ? capacity : 1024) × 0,95`.

Regras de destino (`target_rule`):

| Regra | Inclui |
|---|---|
| `menos_enchendo` | `lotado` + `fila` |
| `lotados` | `lotado` |
| `com_gente` | `lotado` + `fila` + `enchendo` |

Toda regra exige `is_admin` (como o fan-out já exige hoje).

## 4. Princípio de arquitetura: um lugar só

O bug que este desenho evita é o de hoje: o link considera cheio em 95% (TS), a automação morta
considerava em 100% (worker) e a tela da campanha em 95% sem olhar `is_admin` (outro TS). **Estado,
"enchendo agora" e regras de destino existem em uma função SQL só**, e todos os consumidores leem dela:

```
app.limiar_lotado(capacity)                  ─┐
app.estados_da_campanha(tenant, campanha)    ─┼─► public.campaign_group_states  ──► link /r/, API de estados, telas
app.grupo_na_regra(estado, is_admin, regra)  ─┤
app.alvos_da_regra(tenant, campanha, regra)  ─┴─► app.alvos_do_disparo(b) ──► enqueue_broadcast, promote_due_schedules
```

O TS **não** recalcula estado nem regra: ele recebe `estado` e `na_regra_*` prontos. O único TS de
regra que sobra é apresentação (rótulos, cores, contagem do que já veio marcado).

A marca de lotado também tem **um ponto de escrita automática só**: um trigger em `groups` que
olha `members`/`capacity`. Todos os escritores de `members` (RPC do webhook, sync, insert de grupo novo,
auto-grow) passam por ele sem saber que ele existe.

## 5. Banco

Uma migração principal (PR 1) e uma pequena (PR 6, exclusividade). As duas vão para **dev e prod**,
entram em `deploy/supabase/apply-order.txt`, atualizam `deploy/supabase/schema-baseline.json` e trazem
um `infra/tests/*.sql` de conferência, como as migrações recentes (#409, #372).

### 5.1 Colunas

| Tabela | Coluna | Tipo | Observação |
|---|---|---|---|
| `groups` | `lotado_em` | `timestamptz null` | D1 |
| `groups` | `lotado_por` | `text null check (lotado_por in ('auto','manual'))` | tela mostra "automático"/"marcado à mão" |
| `groups` | `reaberto_em` | `timestamptz null` | prioridade no link (D3); limpa quando lota de novo |
| `groups` | `aviso_lotou_em` | `timestamptz null` | D10: uma vez por grupo, nunca é limpa |
| `campaign_groups` | `aviso_ao_lotar` | `text null` | D10; vazio/nulo = desligado |
| `campaign_groups` | `aviso_ao_lotar_desde` | `timestamptz null` | quando o aviso foi ligado; só grupo que lotar depois disso recebe |
| `broadcasts` | `target_rule` | `text null check (target_rule in ('menos_enchendo','lotados','com_gente'))` | D8 |
| `group_bulk_jobs` | `subject` | `text null` | D9 |
| `group_bulk_jobs` | CHECK de `action` | + `'set_subject'` | D9 |

**Não** criar `check (target_rule is null or campaign_group_id is not null)`: a FK
`broadcasts.campaign_group_id` é `on delete set null`, e o CHECK faria apagar campanha falhar. A
função de alvos trata campanha nula (seção 5.4).

Índice parcial para o varredor do aviso: `groups (tenant_id) where lotado_em is not null and aviso_lotou_em is null`.

### 5.2 Funções de estado (schema `app`)

- `app.limiar_lotado(capacity int) returns numeric` — `immutable`. Fórmula da seção 3.
- `app.estados_da_campanha(p_tenant uuid, p_campanha uuid)` — `stable`. Devolve, **na ordem do pool**:
  `posicao, group_id, whatsapp_group_id, name, members, capacity, is_admin, invite_url, lotado_em,
  lotado_por, reaberto_em, aviso_lotou_em, estado, pode_reabrir, na_regra_menos_enchendo,
  na_regra_lotados, na_regra_com_gente`.
  - Pool = `unnest(campaign_groups.group_ids) with ordinality`, filtrado por `tenant_id` **e** `id`.
    Se o mesmo JID aparecer duas vezes no array, vale a menor posição (`distinct on`).
  - JID do pool sem linha em `groups` não sai (hoje o link já ignora; `diagnosePool` trata).
  - `enchendo` = primeiro disponível em `order by (reaberto_em is null), posicao` — **reabertos
    primeiro, entre eles a ordem do pool**.
  - `pode_reabrir` = `lotado_em is not null and members < limiar`.
  - `na_regra_*` vêm de `app.grupo_na_regra(estado, is_admin, regra)` — `immutable`, a **única**
    definição das regras.
- `app.alvos_da_regra(p_tenant, p_campanha, p_regra) returns text[]` — JIDs com `na_regra_<regra>`,
  na ordem do pool.
- Wrapper `public.campaign_group_states(p_tenant uuid, p_campaign uuid)` — `security definer`,
  `set search_path`, execute **só** `service_role`.

### 5.3 Trigger da marca automática

`before insert or update of members, capacity on public.groups` → `app.groups_marca_lotado()`:

- **INSERT** com `members >= limiar(capacity)`: `lotado_em = now()`, `lotado_por = 'auto'`,
  **`aviso_lotou_em = now()`** (grupo descoberto já cheio não "acabou de lotar"; sem isso, o primeiro
  sync de um lojista novo dispararia aviso em todos os grupos cheios).
- **UPDATE** com `new.lotado_em is null` e `new.members >= limiar(new.capacity)` e
  `old.members < limiar(old.capacity)` (cruzou subindo): `lotado_em = now()`, `lotado_por = 'auto'`,
  `reaberto_em = null`.
- Nunca limpa `lotado_em`.

Funciona para todos os escritores (`apply_group_members_delta`, upserts do sync, `insertNewGroups`,
`registerGrownGroup`): o upsert do PostgREST vira `insert ... on conflict do update`, que dispara o
`before update` com `members` na lista de colunas.

### 5.4 Ações manuais (RPCs, execute só `service_role`)

- `public.marcar_grupo_lotado(p_tenant, p_group uuid) returns text` — `'ok' | 'ja_lotado' | 'nao_encontrado'`.
  Seta `lotado_em = now()`, `lotado_por = 'manual'`, `reaberto_em = null`.
- `public.reabrir_grupo(p_tenant, p_group uuid) returns text` — `'ok' | 'nao_lotado' | 'ainda_cheio' | 'nao_encontrado'`.
  A condição `members < limiar` vai **no `where` do update** (atômico, sem corrida entre checar e gravar).
  Seta `lotado_em = null`, `lotado_por = null`, `reaberto_em = now()`.

### 5.5 Disparo

- `app.alvos_do_disparo(b public.broadcasts) returns text[]`:
  - `b.target_rule is not null` → `app.alvos_da_regra(b.tenant_id, b.campaign_group_id, b.target_rule)`;
    campanha nula → `'{}'`.
  - senão → o predicado de hoje, sem mudança (`is_admin` e `group_ids` vazio = todos os admin).
- `app.enqueue_broadcast`: troca o `select ... into jids` (`dispatch_fanout.sql:149-157`) por
  `jids := app.alvos_do_disparo(b)`. Erro de destino vazio fica específico: com regra,
  "Nenhum grupo nesta regra agora."; sem regra, a mensagem atual.
- `app.promote_due_schedules` (versão de `20260930120000`): o bloco que **copia** o predicado para
  abrir a Oferta Relâmpago (linhas 103-110) passa a ler os JIDs do próprio run:
  `select array_agg(payload->>'jid') from engine_commands where origin_run_id = v_broadcast.run_id`.
  Assim a oferta escuta exatamente quem recebeu a mensagem, com ou sem regra, e some a cópia.
- `create or replace` nas duas: **reaplicar** `revoke ... from public, anon, authenticated` / `grant ...
  to service_role` e conferir com `has_function_privilege` nos dois bancos (memória
  `finding-create-or-replace-nao-preserva-acl-em-dev`).
- Caminho legado (`claimPendingBroadcasts`, motor Baileys): só pega `queued` com `run_id is null`, e
  `enqueue_broadcast` sempre seta `run_id`, então disparo com regra nunca chega lá. Mesmo assim,
  acrescentar `.is("target_rule", null)` ao claim: disparo com regra e `group_ids` vazio, se escapasse
  para o motor legado, iria para **todos** os grupos.

### 5.6 Aviso ao lotar

`public.enviar_avisos_lotou(p_limit int default 20) returns integer` (execute só `service_role`):

1. Seleciona `groups g` + `campaign_groups c` (`g.whatsapp_group_id = any(c.group_ids)`, mesmo tenant)
   com `g.lotado_em is not null`, `g.aviso_lotou_em is null`, `g.is_admin`,
   `nullif(trim(c.aviso_ao_lotar), '') is not null`, `g.lotado_em >= c.aviso_ao_lotar_desde`;
   `for update of g skip locked`, `limit p_limit`.
2. Para cada um: insere `broadcasts` (`campaign_group_id = c.id`, `name = 'Aviso ao lotar · ' || g.name`,
   `message = c.aviso_ao_lotar`, `group_ids = array[g.whatsapp_group_id]`, `status = 'draft'`),
   chama `app.enqueue_broadcast` e seta `g.aviso_lotou_em = now()` **qualquer que seja o resultado**.
   Falha (sem número conectado) fica visível no histórico de Disparos como qualquer disparo; não
   tenta de novo a cada 30 s.
3. Devolve quantos enviou (só um inteiro: o worker roda a cada 30 s, cuidar do egress —
   memória `finding-egress-supabase-e-polling-do-worker`).

### 5.7 Backfill (na migração do PR 1)

```sql
update public.groups
   set lotado_em = now(), lotado_por = 'auto', aviso_lotou_em = now()
 where lotado_em is null
   and members >= app.limiar_lotado(capacity);
```

Não dispara o trigger (não toca `members`/`capacity`) e não gera aviso. Consequência aceita: os grupos
que já estavam cheios aparecem como "Lotou hoje".

### 5.8 Exclusividade (migração do PR 6)

- Trigger `before insert or update of group_ids on public.campaign_groups`: calcula os JIDs **novos**
  (`new.group_ids` menos `old.group_ids`) e, se algum já estiver em outra campanha do mesmo tenant,
  `raise exception` com `errcode = 'unique_violation'` e mensagem `grupo_em_outra_campanha:<jid>:<id da outra>`.
  Conflitos que **já existem** não travam nada (só JID novo é checado).
- Pega também `campaign_group_append_group_id` (auto-grow) e a criação de comunidade nativa.
- `public.grupos_em_mais_de_uma_campanha(p_tenant)` → `whatsapp_group_id, nome, campanhas jsonb`
  (`[{id, name, slug, posicao}]`).
- `public.reordenar_campanha(p_tenant, p_campanha, p_esperado text[], p_nova text[]) returns boolean` —
  grava `p_nova` só se o conjunto atual de `group_ids` for igual a `p_esperado` e `p_nova` for uma
  permutação dele. `false` = a lista mudou no meio (auto-grow anexou grupo) → a API responde 409.
  *(Fica no PR 6 porque o Padronizar, PR 8, depende dos dois.)*

## 6. Aplicação

### 6.1 Link `/r/` e `/c/` (PR 2)

- `short-link-click.ts:89-93`: link de campanha deixa de chamar `groupsStore.listGroups` (o tenant
  inteiro, paginado) e chama `public.campaign_group_states` (só os grupos da campanha, já com estado).
- `resolve-click-target.ts`: `ResolvableGroup` ganha `estado`. O alvo passa a ser
  `remembered ?? groups.find(g => g.estado === "enchendo")`. `nextAvailableGroup` e `isGroupAvailable`
  saem do caminho do link (conferir importadores; `lib/groups-store.ts` é do modo JSON e fica).
- **Grupo lembrado continua vencendo mesmo lotado** (`resolve-click-target.ts:117-126`): quem já
  clicou quase sempre já está dentro. Não muda.
- `diagnosePool` continua igual; "todos lotados" cai em `all-full`.
- Modo JSON (`legacyGet`, `HUBFLOW_USE_SUPABASE=0`): fora de escopo, continua com a lógica antiga.

### 6.2 Auto-grow (PR 2)

- `grow-headroom.ts` `hasHeadroom`: grupo com `lotado_em` conta **sem vaga**, mesmo abaixo de 90%
  (senão um grupo marcado à mão com 812 seguraria a criação do próximo para sempre). Não filtrar do
  pool: pool resolvido vazio tem significado próprio (`shouldEnqueueGrow` → `false`).
- `registerGrownGroup` (`group-grow-store.ts:287-320`): gravar `admins_counted_at = now()` no insert e
  no update. Hoje grupo criado pelo auto-grow fica com a contagem parada até um sync manual, porque
  `apply_group_members_delta` só soma onde `admins_counted_at is not null` — ele nunca lotaria sozinho.
  A base é conhecida: o grupo acabou de ser criado por nós. Conferir os consumidores de
  `groups_sem_backup_idx` (aviso de "sem admin reserva" pode passar a aparecer, e é verdadeiro).

### 6.3 Recontagem diária (PR 3)

Não existe hoje nenhuma recontagem periódica: só o webhook e o botão. Evento perdido = contagem errada
para sempre = marca automática que nunca vem.

- Extrair o núcleo do `POST /api/groups/sync` numa função `sincronizarGrupos(tenantId, { somenteContagem })`
  usada pela rota atual e por uma rota engine-only nova `POST /api/groups/recount` (header
  `x-tenant-id`). **A rota nova entra na allowlist `ENGINE_ONLY`** (memória
  `finding-rota-nova-da-engine-precisa-da-allowlist`).
- `somenteContagem`: atualiza `members` (com `escolherContagem`, a proteção contra payload truncado) e
  `admins_*`; não enfileira `check_invite` nem mexe em convite.
- Respeitar a trava de "um sync por número de cada vez" do #397.
- Worker: loop novo `recount` em `index.ts`, `WORKER_RECOUNT_INTERVAL_MS` padrão 24 h (mínimo 1 h),
  tenants com instância conectada, um por vez.

### 6.4 Estados e ações do grupo (PR 4)

- `GET /api/campanhas/[slug]/grupos/estados` — tenant pela sessão (`allowEngine: false`). Resposta:
  `{ grupos: EstadoGrupo[], contagem: { lotado, enchendo, fila, vazio, membros }, regras: Record<RegraDestino, number> }`
  (o "enchendo" é o grupo com `estado === "enchendo"` dentro de `grupos`), `EstadoGrupo` = colunas da seção 5.2
  em camelCase — formato exato no arquivo de contratos dos planos.
- `POST /api/campanhas/[slug]/grupos/lotado` `{ groupId, acao: "marcar" | "reabrir" }` — exige
  `campaign:edit`; confere que o grupo é **desta** campanha; `ainda_cheio` → 409 com a mensagem do
  mockup ("Ainda está com X de Y (Z%)…").
- Aba Grupos da campanha (`painel/campanhas/[slug]/page.tsx:362-398`):
  - faixa de contagem (Lotados / Enchendo agora / Na fila / Vazios / Membros);
  - linha "O link está mandando gente para **X**" (+ "reaberto, tem prioridade" quando for o caso);
  - por grupo: posição, membros com barra, chip de estado, detalhe ("Lotou há 3 dias · automático",
    "Pausado: volta a encher quando o 12 lotar"), botão "Marcar como lotado" na linha que está
    enchendo e menu ⋯ com "Reabrir"/"Marcar como lotado" e "Editar capacidade".
  - `buildCampaignGroupsOverview`/`getCampaignGroupStatus` deixam de decidir cheio/ativo nesta aba.
    A tela global `/painel/grupos` não é por campanha e fica como está.
- Componente novo em `components/painel/grupos/` (chip + menu), visual do mockup (tokens G2: acid só no
  chip Lotado e no Postar; números em Manrope; legenda 13 px).

### 6.5 Postar com destino (PR 5)

- **Função pura** `lib/campaigns/destino.ts` (+ teste): `lerDestino(body, campanha)` →
  `{ regra }` | `{ grupos: string[] }` | erro.
  - `body.destino = { regra }` com regra válida → regra.
  - `body.destino = { grupos }` ou `body.groupIds` (compatibilidade) → lista fixa; **todo JID precisa
    estar em `campanha.group_ids`** (validação que hoje não existe), exceto o grupo de Avisos da
    comunidade daquela campanha (caminho `usarAvisos` de `messages-tab.tsx:71`, que continua).
  - nada → `{ regra: "menos_enchendo" }` (o padrão seguro; antes era "todos").
  - lista vazia → 400.
- `messages/route.ts`: usa `lerDestino`; grava `target_rule` **ou** `group_ids`. Envio "agora" com regra
  que hoje dá zero grupos → 400 "Nenhum grupo nesta regra agora." (agendado é aceito: pode encher até lá).
  Conferir `assertPlanLimit("contacts:reach")` (linhas 147-155): se ele conta alcance por `groupIds`,
  passar os JIDs resolvidos da regra.
- Componente `components/painel/messages/destino-grupos.tsx`: atalhos com contagem, frase da regra
  ("refeita na hora do envio"), lista com caixa e chip de estado, aviso amarelo se o `enchendo` estiver
  marcado, nota dos vazios, "Lista fixa" + "Voltar para a regra". Lê `/grupos/estados`; a pertinência
  a cada regra vem de `naRegra*` (sem recalcular).
- Plugar em `messages-tab.tsx` (inclui o fluxo de confirmação de Funil, que passa pelo mesmo envio),
  `folha-postar.tsx` (botão Postar da barra) e `painel/disparos/page.tsx`.
- Histórico de Disparos (`lib/campaigns/dispatch-view.ts`): disparo com regra ainda não enviado mostra
  "Regra: todos menos o que está enchendo"; enviado mostra o total real do run.
- e2e: `painel-vitrine-disparos.spec.ts` passa a esperar o atalho padrão.

### 6.6 Um grupo, uma campanha (PR 6)

- Migração da seção 5.8.
- `api/campanhas/route.ts` POST/PATCH: `unique_violation` com prefixo `grupo_em_outra_campanha` → 409
  `{ error, grupo, campanha }`. Fluxo de comunidade nativa recebe a mesma mensagem.
- `campaign-config.tsx` (seletor `:441-513`): grupo de outra campanha aparece travado com "já está em
  *Nome*" (o mapa JID → campanha sai do `GET /api/campanhas`, que já devolve `groupIds`).
- `GET /api/campanhas/conflitos` e `POST /api/campanhas/conflitos { jid, ficaEm }` — remove o JID das
  outras campanhas com `campaign_group_remove_group_id`. Tela do mockup (5) + aviso na aba Grupos.

### 6.7 Padronizar (PR 7 worker, PR 8 app)

**Worker (PR 7):**
- `evolution-groups.ts`: `setSubject(instance, jid, subject)` → `POST /group/updateGroupSubject/{instance}?groupJid=`
  body `{ subject }`, no molde de `setDescription` (`:175-180`). **Conferir o corpo no fonte da
  Evolution** antes (memória `finding-contrato-evolution-lido-na-fonte`).
- `bulk-loop.ts` `applyJob`: `case "set_subject"` (erro se `subject` vazio). Tipo do job e mapeamento do
  claim em `bulk-deps.ts` ganham `subject`.
- App: `/api/groups/bulk/pending` devolve `subject`; `ackBulk` (`group-bulk-jobs.ts:179-216`), no `done`
  de `set_subject`, grava `groups.name = subject` e limpa o nome interno (`display_name_base = ''`,
  `display_number = 0`) — senão o painel continua mostrando o nome interno antigo
  (`group-display-name.ts`).

**App (PR 8):**
- Função pura `lib/groups/padronizar.ts` (+ teste):
  - `ordemPadrao(estados)`: lotados por membros desc; depois enchendo; fila por membros desc; vazios;
    empate pela posição atual.
  - `planejarRenomes(ordem, base, conflitos)`: um job por grupo cujo nome muda, pulando conflito e
    não-admin.
  - `validarBase(base)`: 1–90 caracteres depois do `trim`, sem quebra de linha (o WhatsApp corta o nome
    em 100; sobra espaço para " 999").
- `POST /api/campanhas/[slug]/grupos/padronizar` `{ base, ordem: string[], esperado: string[] }` —
  `campaign:edit`; `reordenar_campanha` (false → 409 "A lista de grupos mudou, recarregue");
  enfileira `set_subject` num `batch_id` só; grava em `grow_template` `subjectPattern = base + " {n}"`
  e `padronizadoEm`.
- `nextSeq` (`group-grow-jobs.ts:52-63`): com `padronizadoEm`, considera só jobs criados depois dele —
  `max(maiorSeqDesde, poolSize) + 1`. Sem isso, um `seq` antigo maior que o pool faria o próximo nascer
  "Moda Kids do Sul 26" depois de uma sequência 1–20.
- Tela do mockup (3): nome base, "Fica assim", resumo (mudam / já certos / próximo criado sozinho),
  aviso de conflito, aviso de "Você mudou o nome do grupo", tabela com setas, progresso pelo
  `GET .../grupos/lotes` que já existe.

### 6.8 Aviso ao lotar (PR 9)

- `campaign-config.tsx`: seção "Aviso ao lotar" (caixa + texto até 1000 caracteres). PATCH
  `api/campanhas` aceita `avisoAoLotar`; vazio→texto seta `aviso_ao_lotar_desde = now()`, texto→vazio
  zera os dois, texto→texto mantém o `desde`.
- Worker `housekeeping.ts:77-88`: chama `enviar_avisos_lotou(20)` junto das outras RPCs; loga a contagem
  quando > 0.
- "Últimos avisos" na tela: grupos da campanha com `avisoLotouEm`, mais recentes primeiro (vem do
  endpoint de estados, sem tabela nova).

## 7. Bordas e erros

| Situação | Comportamento |
|---|---|
| Grupo cai de 97% para 94% depois de lotado | Continua lotado (D1). Reabrir fica liberado. |
| Reabrir com o grupo ≥ 95% | 409 com a mensagem; nada muda. |
| Reaberto chega a 95% | Trigger marca de novo, limpa `reaberto_em`; link volta à sequência; aviso **não** repete. |
| Dois reabertos ao mesmo tempo | Enche o de menor posição primeiro. |
| Todos lotados | Link bloqueia com `all-full` (página de lotado / lista de espera, como hoje); auto-grow cria o próximo. |
| Regra agendada que na hora dá zero grupos | Disparo vira `failed` "Nenhum grupo nesta regra agora." (visível no histórico). |
| Campanha apagada com disparo de regra agendado | `campaign_group_id` vira nulo → zero alvos → `failed`. Nunca cai em "todos". |
| Webhook perdido | Corrigido na recontagem diária; a marca vem quando a contagem cruza. |
| Lojista novo, primeiro sync com grupos cheios | Marcados no insert, sem aviso. |
| Ligar o aviso com 11 grupos já lotados | Nenhum recebe (`lotado_em < aviso_ao_lotar_desde`). |
| Auto-grow anexa grupo durante o Padronizar | `reordenar_campanha` devolve `false` → 409, prévia recarrega. |
| Renomear falha num grupo | Job `failed`, os outros seguem; o nome no banco só muda no `done`. A ordem do link já está salva. |
| Grupo em duas campanhas | Fica fora dos renomes até o conflito ser resolvido; o trigger impede conflito novo. |

## 8. Testes

- **Funções puras (node:test, ao lado do código):** `destino.ts`, `padronizar.ts`, `resolve-click-target`
  (alvo = `enchendo`, lembrado vence lotado), `grow-headroom` (lotado sem vaga), `bulk-loop`
  (`set_subject`), `evolution-groups` (URL e corpo do rename).
- **SQL:** `infra/tests/postar-por-grupo-check.sql`, numa transação com `rollback`, rodado nos dois
  bancos: cria campanha e grupos de teste e prova cruzamento subindo/descendo, insert já cheio,
  reabrir bloqueado e liberado, prioridade do reaberto, as três regras, vazio, campanha nula, aviso uma
  vez só, aviso não retroativo, ACL das funções novas (`has_function_privilege`).
- **Integração (job e2e do CI):** `campaign-group-states.integration.test.ts` com o tenant de E2E —
  estados pela RPC, marcar/reabrir, `enqueue_broadcast` com regra gerando `engine_commands` só para os
  JIDs certos (é isso que mata o mutante que troca a regra no SQL; memória
  `pattern-teste-de-integracao-mata-mutante`).
- **e2e:** disparos com o atalho padrão; aba Grupos mostrando estado e menu.

## 9. Fatias de PR

Cada PR ≤ ~10 arquivos, base `main`, fechado na mesma sessão (CLAUDE.md, "Regra de PR").

| PR | Conteúdo | Depende de | DDL? |
|---|---|---|---|
| 1 | Migração principal (5.1–5.7) + apply-order + baseline + `infra/tests/postar-por-grupo-check.sql` + guarda no claim legado | — | **sim, Igor nos 2 bancos** |
| 2 | Link pelo estado + auto-grow (headroom e contagem do grupo novo) | 1 | não |
| 3 | Recontagem diária (rota engine + loop do worker) | — | não |
| 4 | Endpoint de estados + marcar/reabrir + aba Grupos | 1 | não |
| 5 | Postar com destino (API + componente + 3 telas + histórico) | 1, 4 | não |
| 6 | Um grupo, uma campanha (migração 5.8 + API + seletor + conflitos) | 1 | **sim** |
| 7 | Worker `set_subject` + `ackBulk` grava o nome | 1 | não |
| 8 | Padronizar (função pura + rota + `nextSeq` + tela) | 4, 6, 7 | não |
| 9 | Aviso ao lotar (config + housekeeping + últimos avisos) | 1, 4 | não |

Ordem segura de deploy: o PR 1 sozinho não muda o que o lojista vê — o link (TS) ainda ignora
`lotado_em` e nenhum disparo tem `target_rule`. A marca começa a valer no link com o PR 2. O trigger de
exclusividade fica fora do PR 1 de propósito: sem o mapeamento de erro do PR 6, ele viraria 500 no
seletor de grupos da campanha.

Worker (PRs 3, 7, 9) tem deploy separado do app: conferir no plano como sobe.

## 10. Fora de escopo

- Limite de lotado configurável (D12).
- Reordenar a sequência sozinho depois do Padronizar.
- Tela global `/painel/grupos` com estado por campanha.
- Modo JSON (`HUBFLOW_USE_SUPABASE=0`) com a lógica nova.
- Reviver o motor de automações.
- Arrastar-e-soltar no Padronizar (setas ↑↓ cobrem e são acessíveis por teclado).

## 11. Verificação em produção (para o card `no_ar_verificado`)

Na campanha real Moda Kids do Sul:
1. A aba Grupos mostra os lotados do backfill e um "Enchendo agora" igual ao destino real de `/r/<slug>`.
2. Post com o atalho padrão: os `engine_commands` do run não contêm o JID do grupo que está enchendo.
3. Reabrir um lotado com vaga: o próximo clique em `/r/` vai para ele.
4. Padronizar: nomes mudam no WhatsApp e no painel; `grow_template.subjectPattern` gravado.
5. Aviso ao lotar ligado: o próximo grupo que lotar recebe uma mensagem, uma vez.
