# Instagram: Pessoas, blocos livres e Conversas — design

> **Aprovado pelo Igor em 04/11/2026**, inclusive as decisões marcadas (minha). Provas P1–P9 da Zernio: cada ponto entra com o caminho seguro da coluna "Se não der" até a prova em produção.
>
> **Data:** 16/10/2026. **Mockup aprovado:** canvas de Design "Girumo · Contatos do Instagram"
> (`claude.ai/artifact/WcTVVVQWPdEdicS96XR1Qp`, 10 pranchetas: Conversas, Pessoas e Blocos).
> Continua `2026-10-02-instagram-fluxos-design.md` (fases 1–4 e 3a) e não muda a cobrança
> (`2026-10-07-instagram-assinatura-design.md`). Nada aqui toca `hubflow-engine/`.
>
> Onde está escrito **(minha)**, a decisão é do autor do spec e não foi combinada com o Igor.

## 1. Problema e objetivo

Hoje um fluxo do Instagram faz: comentário ou direct com a palavra → um direct, ou a confirmação
da fase 3a ("quer o link? responde SIM") → convite do grupo. Faltam três coisas:

1. **Decidir o caminho pelo que a pessoa respondeu** ("é pra qual idade?" → o grupo certo).
2. **Lembrar da pessoa**: guardar o que ela respondeu (campos), marcar (etiquetas) e achar depois.
3. **Responder à mão sem sair do painel** quando o robô não resolve ("tem do 1 ao 4?").

**Sucesso:** a lojista monta sozinha um fluxo que pergunta a idade e manda cada um pro grupo
certo; acha "quem pediu atacado esta semana" em Pessoas; responde pelo painel as conversas que o
robô não resolveu, sem o robô atravessar enquanto ela conversa.

**Fracasso mesmo funcionando:** o robô falar com a cliente enquanto a loja conversa com ela; a
Girumo virar depósito de conversa de cliente.

## 2. Decisões (Igor, 15–16/10)

| Tema | Decisão |
|---|---|
| Para que servem campos e etiquetas | Decidir o caminho dentro do fluxo **e** ver/filtrar as pessoas no painel. **Sem** disparo para quem tem etiqueta (o Instagram só deixa mandar direct até 24 h depois da última mensagem da pessoa) |
| Como a pessoa responde a uma Pergunta | **Botões de escolha** (padrão, até 13) **ou** texto livre, escolhido por pergunta |
| O que o "Se…" confere | Campo (**uma saída por valor** + "outro"), etiqueta (sim/não), segue a loja e clicou no link (estes dois chegam com a fase 3). Sem E/OU e sem horário nesta versão |
| Vida da ficha | Fica **12 meses desde a última conversa**; a loja edita campos e etiquetas e **apaga a pessoa** (pedido de exclusão); add-on cancelado = fichas somem em **30 dias** |
| Onde guardar | **Uma tabela** `ig_contacts`: campos em `jsonb`, etiquetas em `text[]` |
| Chat | A conversa **mora na Zernio**; a Girumo guarda só um **índice** (`ig_conversations`) e a tela se atualiza sozinha pelo **Supabase Realtime** (ver §7.1) |
| Quem vira pessoa | **Todo mundo que manda direct para a loja** ou entra num fluxo. *Muda a regra discutida antes ("só quem entra em fluxo"): com o chat, a lista de conversas já é de todo mundo* |
| Nome da aba | **Pessoas** (o painel já tem o módulo **Contatos**, que é o do WhatsApp) |
| Lugar no menu | **Instagram sobe para a barra de cima**, com o contador de "aguardando você", para loja com o add-on |
| Robô × pessoa | Responder no painel **pausa o robô 12 h** com aquela pessoa; o bloco Passar pra loja pausa 24 h; **Resolver** despausa |
| WhatsApp | **Fora.** Conversa 1:1 no WhatsApp contraria a decisão anti-ban "nunca DM" |

## 3. Fora de escopo (por enquanto)

- Disparo em massa para uma etiqueta; mensagem fora da janela iniciada pela loja.
- Condição por horário/dia, E/OU numa condição só, teste A/B.
- Atribuir conversa a uma pessoa da equipe. **Vendedora** não entra no Instagram **(minha)**: o
  guarda de módulo já fecha (o único módulo que se libera para ela é `postar`) e os helpers de RLS
  já a excluem; liberar é outra entrega.
- Notas internas, notificação push no celular, "visto" nas mensagens enviadas, reações, gravar áudio.
- Ligar a pessoa do Instagram ao número dela no WhatsApp.
- Renomear etiqueta em massa (um catálogo de etiquetas pode vir depois sem mudar a ficha).
- Editar o fluxo arrastando no mapa: é a fase 5 (`docs/superpowers/plans/2026-10-08-instagram-fluxos-fase5.md`),
  que passa a nascer com os blocos deste spec.

## 4. O fluxo: blocos novos

Tudo em `apps/web/src/lib/ig/flow` continua **puro** e validado igual no painel e no servidor.
Fluxos já publicados continuam válidos e **se comportam como hoje**: todo campo novo é opcional e
nenhum tipo existente muda de forma.

### 4.1 Pergunta (o `message` que espera resposta)

O `MessageNode` ganha dois campos opcionais:

- `choices?: string[]` — 1 a 13 escolhas, até 20 caracteres cada, sem repetir (comparando por
  `normalizeForMatch`).
- `saveTo?: string | null` — o campo da ficha onde a resposta fica (`[a-z][a-z0-9_]{0,31}`).

Regras:

- Pergunta com escolhas **sempre espera** (`wait` obrigatório) e **não tem botão** (`button` nulo):
  a escolha já é o toque. Com escolhas, `wait.keywords` não vale (o editor esconde o campo).
- As escolhas vão como **respostas rápidas** do Instagram (`quickReplies` da Zernio), **menos no
  primeiro direct depois de um comentário**: ali o Instagram recusa interativo para quem não segue
  e a recusa gasta o único direct, então as escolhas **valem só digitando** (prancheta Editor:
  "Pergunta · 1º direct, sem botão"; o texto da mensagem diz o que responder).
- Uma escolha pode ter **alternativas separadas por vírgula**: "Sim, quero" casa "sim" ou
  "quero"; o botão mostra o texto inteiro **(minha)**.
- **Saídas:** com escolhas, `v0` … `v12` (uma por escolha, na ordem) mais `other`; sem escolhas,
  `replied` como hoje. `timeout` continua da fase 3.
- **`other` sem ligação = o robô continua esperando** uma resposta que case, como a espera com
  palavras faz hoje **(minha)**. É a única exceção à regra "saída sem ligação, o fluxo para ali":
  sem ela, um "o que é isso?" encerraria o atendimento.
- Apagar ou reordenar escolhas renumera as ligações junto (função pura do modelo, testada);
  ligação para uma saída que não existe mais é erro de validação.

**Qual saída a resposta tomou:**

1. toque numa resposta rápida com payload `<run>:<bloco>:<i>` → `v<i>`;
2. senão, `matchKeyword(texto, alternativas)` de `lib/ig/match-keyword.ts` (sem acento, sem
   caixa, palavra inteira, a mais longa ganha) → `v<i>` da escolha dona da alternativa. O toque
   também chega como texto, então este passo cobre o caso de a Zernio não repassar o payload (P1);
3. senão → `other` (ou continua esperando, se `other` não tem ligação).

Sem escolhas, vale o que já existe: `wait.keywords` filtra (vazio = qualquer resposta) e a
resposta que não casa não libera a espera.

**Guardar:** escolha → o texto inteiro da escolha; texto livre → o texto, cortado em 200
caracteres. Uma resposta nova troca a anterior.

### 4.2 Etiqueta (`tag`, novo)

`{ id, type: "tag", add: string[], remove: string[] }`, saída `next`. Não manda mensagem, então
pode vir em qualquer lugar, inclusive logo depois do gatilho. Nome normalizado ao digitar:
minúsculas, sem acento, espaço vira hífen, `[a-z0-9][a-z0-9-]{0,39}` (`Quer Infantil` →
`quer-infantil`).

### 4.3 Se… (`condition`, generalizado)

Hoje `ConditionNode` é `{ id, type: "condition", check: "follows" }`. Passa a
`{ id, type: "condition", check: "follows" | "clicked" | "field" | "tag", field?, values?, tag? }`.

| `check` | Configuração | Saídas |
|---|---|---|
| `field` | `field` + `values` (1–13) | `v0` … `v12` + `other` (campo vazio ou outro valor) |
| `tag` | `tag` | `yes` / `no` |
| `follows` | — | `yes` / `no` — **fase 3** |
| `clicked` | — | `yes` / `no` — **fase 3**: algum convite deste atendimento já foi clicado **(minha)** |

Valor de campo compara inteiro por `normalizeForMatch` (`goiania` = `Goiânia`). No Se…, saída sem
ligação para o fluxo (regra geral). O bloco "segue a loja?" que já existe não muda.

### 4.4 Passar pra loja (`handoff`, novo; entra com o chat, plano 2)

`{ id, type: "handoff", text: string | null }`, **sem saída**. Manda o texto, se houver (ex.: "Já
já alguém da loja te responde por aqui."), põe a conversa em **Aguardando você** e pausa o robô com
a pessoa por 24 h. Sem a tela de Conversas ele não teria para onde passar, por isso nasce no plano 2.

### 4.5 Validação nova

| Código | Quando |
|---|---|
| `escolhas_invalidas` | escolha vazia, repetida, acima de 20 caracteres, mais de 13, alternativa repetida entre escolhas, ou escolhas junto com botão |
| `campo_invalido` | `saveTo`/`field` fora do formato |
| `etiqueta_invalida` | etiqueta fora do formato, ou bloco Etiqueta sem nada para pôr/tirar |
| `condicao_incompleta` | `field` sem valores, `tag` sem etiqueta |
| `botao_sem_espera` | passa a valer também para escolhas sem `wait` |
| `fase_seguinte` | `follows`, `clicked` e `timeout` até a fase 3 |

`botao_no_primeiro_direct` continua só para `button`: escolhas no primeiro direct são permitidas e
saem sem respostas rápidas (§4.1).

### 4.6 Passo a passo e Mapa

`MAIN_OUTS` ganha `v0`: na trilha, a primeira escolha é o caminho principal e as outras aparecem
como desvios, como `no` hoje. O Mapa (só leitura até a fase 5) desenha uma seta por saída.
Etiqueta e Se… ganham rótulo e ícone na trilha e no Mapa como no mockup.

### 4.7 Receita nova: "Comentou, escolhe o grupo"

O roteiro da prancheta Editor: comentário → Pergunta no 1º direct ("Quer que eu te envie?
Responde SIM.", escolha "Sim, quero" que vale digitando) → Pergunta "É pra qual idade?" com três
escolhas e Guardar em `tamanho` → um convite por escolha. No plano 1 os dois `outro` ficam sem
ligação (o robô continua esperando); o plano 2 liga os dois em Passar pra loja, como no mockup.
Precisa entrar no CHECK `ig_flows_recipe_check`.

## 5. Pessoas (`ig_contacts`)

### 5.1 Tabela

```sql
create table public.ig_contacts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.organizations(id) on delete cascade,
  ig_user_id     text not null,              -- id escopado do Instagram (o mesmo de ig_runs)
  username       text,
  fields         jsonb not null default '{}'::jsonb,   -- { "tamanho": "Infantil" }
  tags           text[] not null default '{}',
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),   -- última interação dela: prazo de 12 meses
  last_dm_at     timestamptz,                          -- última mensagem dela no direct: janela da Meta
  source_flow_id uuid references public.ig_flows(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (tenant_id, ig_user_id)
);
create index on public.ig_contacts using gin (tags);
create index on public.ig_contacts (tenant_id, last_seen_at desc);
```

RLS ligado; leitura para `authenticated` por `tenant_id = any(app.user_tenant_ids())` (o helper já
exclui a vendedora); escrita **só pelo servidor**. Toda query da store filtra `tenant_id`.

### 5.2 Gravação atômica

`public.ig_contact_apply(p_tenant uuid, p_ig_user_id text, p_username text, p_set jsonb,
p_add text[], p_remove text[], p_seen_at timestamptz, p_dm boolean, p_source_flow uuid)`:

- `security definer` com `set search_path`; EXECUTE revogado de `public`, `anon` **e
  `authenticated`** (o default privilege do banco concede a `authenticated`), só `service_role`.
- Num comando só: upsert, mescla os campos, põe/tira etiquetas, `last_seen_at` (e `last_dm_at`
  quando `p_dm`) **só andam para frente** (`greatest`). Duas mensagens da mesma pessoa chegando
  juntas não apagam a gravação uma da outra.
- Limites: valor acima de 200 caracteres é cortado; campo novo além do 30º e etiqueta além da 50ª
  são ignorados. Nunca falha o atendimento por limite.

### 5.3 Quando nasce e o que atualiza

- Nasce no primeiro **direct recebido** ou na primeira **entrada num fluxo** (inclusive por
  comentário). Comentário que não casa nenhum fluxo não cria pessoa.
- `last_seen_at`: direct recebido, toque e comentário que entra num fluxo. `last_dm_at`: só direct
  recebido (o toque chega como mensagem e conta).
- `username` é atualizado sempre que o evento traz o @.
- Pergunta com `saveTo`, bloco Etiqueta e a tela (edição à mão, etiqueta em massa) gravam campos e
  etiquetas.
- Com o add-on desligado, o webhook não grava ficha nem índice (o motor já não roda).
- **Apagar da lista** **(minha)**: apaga a ficha, a linha do índice de conversas (e o registro
  dela, em cascata) e os atendimentos (`ig_runs`, com os passos); pede à Zernio para apagar a
  cópia da conversa (P9), que continua no Instagram da loja. Assim a varredura do "Atualizar"
  (§7.11) não a traz de volta; se ela escrever de novo, volta como pessoa nova. Se a Zernio não
  apagar, guardar um marcador com o id cifrado (hash) para a varredura pular quem foi apagada.
  A tela pede confirmação: não tem volta.

### 5.4 Rotina (fechar conversas e prazos)

Rotina **de hora em hora** `GET /api/cron/ig-rotina` (Vercel cron, `isCronAuthorized` com
`CRON_SECRET`, como `/api/cron/emails`):

- fecha conversas pelas regras automáticas da §7.3 (plano 2);
- apaga a pessoa com `last_seen_at` há mais de **12 meses** e a conversa com `last_message_at` há
  mais de 12 meses;
- apaga pessoas e conversas de loja com `tenant_settings.instagram_disabled_at` há mais de
  **30 dias**.

`instagram_disabled_at` (coluna nova em `tenant_settings`) é gravada por `setInstagramEnabled`
(`lib/stores/tenant-settings.ts`) quando desliga e limpa quando liga. `ig_runs` continua com os
90 dias de hoje (limpeza no próprio webhook).

### 5.5 Tela Pessoas (`/painel/instagram/pessoas`)

- Números (de uma função SQL, contando no banco: o PostgREST corta lista em 1000 sem avisar):
  pessoas (+ hoje), conversaram nas últimas 24 h (= ainda podem receber direct, por `last_dm_at`),
  com alguma etiqueta (% do total), campo mais preenchido (em quantas pessoas).
- Filtros que combinam: busca por @, etiquetas ("tem todas"), campo = valor (os valores que existem
  na loja, com a contagem de cada), última conversa (24 h, 7 dias, 30 dias, tudo).
- Tabela: @, etiquetas, os 3 campos mais usados da loja como colunas, última conversa (bolinha
  verde = `last_dm_at` há menos de 24 h), "veio por". 50 por página, total por contagem à parte.
- Nome de campo na tela: primeira letra maiúscula e `_` vira espaço (`tamanho` → "Tamanho").
- Ficha lateral: campos editáveis, etiquetas, atendimentos (os `ig_runs` dela), origem, **Abrir
  conversa** (com o plano 2), **Apagar da lista**.
- Em massa: pôr/tirar etiqueta nos selecionados ou em todos os filtrados.
- **Exportar CSV** e **Apagar**: só dono ou admin.
- **Depois de cancelar o add-on** **(minha)**: por 30 dias Pessoas fica só leitura, com Exportar
  CSV (dono ou admin) e um aviso com a data em que as fichas somem. É como a loja leva os dados
  embora. Conversas e Fluxos fecham como hoje (`requireInstagram` em `lib/ig/access.ts`).

## 6. Motor

- Lê a ficha **uma vez por evento**, mantém a cópia em memória atualizada e grava pelo
  `ig_contact_apply` depois de cada passo que muda algo: o "Se… campo" logo depois de uma Pergunta
  enxerga o que ela acabou de gravar.
- Pergunta com escolhas manda `quickReplies` com título e payload `<run>:<bloco>:<i>`, menos no
  primeiro direct depois de comentário (§4.1); a retomada da fase 3a (`resumed_by`, busca por id e
  depois pelo @) decide a saída como em §4.1 e grava o `saveTo`. Resposta que não casa, com `other`
  sem ligação, não reivindica o run: ele segue esperando.
- Etiqueta e Se… não mandam mensagem, não gastam direct e contam visita na guarda de ciclo
  (`MAX_VISITAS` de `advance.ts`).
- **Robô pausado** (`ig_conversations.bot_paused_until` no futuro, plano 2): nenhum run abre nem
  retoma para essa pessoa, nem por direct nem por comentário **(minha)**.
- **A loja respondeu pelo painel:** além de pausar, encerra o run que esperava resposta dessa
  pessoa **(minha)**: sem isso, um "sim" dela depois da pausa retomaria um fluxo velho.
- O motor **nunca** usa a tag de atendimento humano (§7.5).

## 7. Conversas

### 7.1 Onde mora cada coisa

| Dado | Onde | Por quê |
|---|---|---|
| Mensagens, anexos, histórico | **Zernio** (`/v1/inbox/conversations/{id}/messages`) | Ela já guarda e importa o histórico (até 500 conversas × 500 mensagens por conta); a Girumo não guarda conversa de cliente |
| Lista: quem, quando, não lidas, situação, última mensagem, robô pausado | **`ig_conversations`** (nosso) | Lista rápida e filtrável por etiqueta mesmo com a Zernio lenta (60–207 s por chamada em 08/10) |
| O que o robô e a loja fizeram em cada conversa, **sem texto** | **`ig_conversation_events`** (nosso) **(minha)** | Rótulos "Robô · fluxo" e "Você" nas bolhas e as marcas do fio, como no mockup; a Zernio não separa o que o robô mandou do que a loja mandou (os dois vão pela API) |
| Tela ao vivo | **Supabase Realtime** (`postgres_changes` em `ig_conversations`) | Só manda quando muda: consulta repetida custa saída do Supabase (a cota estourou em set/2026) |

**Atenção, o Realtime do app hoje é decorativo** (spec do quadro, D6): o sino de avisos assina
`postgres_changes`, mas a publicação `supabase_realtime` está vazia em dev e não tem `notifications`
em prod; ele não recebe nada. Esta é a **primeira assinatura que precisa funcionar de verdade**:
a migração põe `ig_conversations` na publicação (nos dois bancos, idempotente) e a leitura vale pela
RLS de `authenticated`. O PR 1 do plano 2 prova em dev que o navegador recebe o evento. Se não
receber, a lista consulta o índice a cada 30 s pedindo só o que mudou (`?since=`) e o resto do
desenho não muda **(minha)**.

### 7.2 Tabelas

```sql
create table public.ig_conversations (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.organizations(id) on delete cascade,
  ig_account_id          uuid,            -- como ig_runs: sem FK, a conta pode ser trocada
  zernio_conversation_id text not null,
  ig_user_id             text not null,   -- liga com ig_contacts
  username               text,
  display_name           text,
  status                 text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  folder                 text not null default 'inbox' check (folder in ('inbox', 'requests')),
  unread_count           integer not null default 0,
  last_message_at        timestamptz,
  last_direction         text check (last_direction in ('in', 'out')),
  last_preview           text,            -- só a última mensagem, até 200 caracteres
  bot_paused_until       timestamptz,
  updated_at             timestamptz not null default now(),
  unique (tenant_id, zernio_conversation_id)
);
create index on public.ig_conversations (tenant_id, status, last_message_at desc);
-- + entrar na publicação supabase_realtime (idempotente: conferir pg_publication_tables antes)

create table public.ig_conversation_events (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null references public.organizations(id) on delete cascade,
  conversation_id   uuid not null references public.ig_conversations(id) on delete cascade,
  kind              text not null check (kind in ('bot_message', 'store_message', 'waiting', 'paused', 'resolved')),
  zernio_message_id text,                 -- só nas mensagens que nós mandamos (P3)
  run_id            uuid,                 -- só nas do robô
  detail            text,                 -- motivo curto: 'handoff', 'janela_fechou', 'parada_24h'…
  occurred_at       timestamptz not null default now()
);
create index on public.ig_conversation_events (tenant_id, conversation_id, occurred_at);
```

As duas com RLS ligado; leitura para `authenticated` por `tenant_id = any(app.user_tenant_ids())`;
escrita só pelo servidor. A janela da Meta sai de `ig_contacts.last_dm_at` (fonte única).

### 7.3 Situação da conversa

| Situação | Quando entra |
|---|---|
| **Aberta** | direct ao qual o robô mandou alguma mensagem de volta; a loja respondeu pelo painel **(minha)** |
| **Aguardando você** | direct ao qual o robô **não mandou nada** de volta (nenhum fluxo casou, a resposta não liberou a espera, ou o caminho terminou sem mensagem); direct com o robô pausado; bloco Passar pra loja |
| **Resolvida** | a loja clica em Resolver (zera a pausa); importada sem mensagem nas últimas 24 h; e, pela rotina de hora em hora **(minha)**: Aberta parada há 24 h, e Aguardando você quando a janela de 7 dias fecha (ninguém mais pode responder) |

Mensagem nova numa conversa resolvida a reabre pelas mesmas regras. Toda mudança de situação grava
um evento com o motivo.

### 7.4 Webhook

- `message.received` (já chega hoje e é descartado quando não casa nada; traz
  `message.conversationId` e `sender.{id, name, username}`): depois do motor, atualiza o índice
  (`last_*`, `unread_count + 1`, situação pela §7.3) e a ficha (`ig_contact_apply` com `p_dm`).
- `message.sent`: atualiza `last_*` e a direção. Resposta feita **pelo app do Instagram** também
  pausa o robô **se** a prova P3 mostrar um campo que a separe do envio pela API (provável:
  `sentVia`); senão, só a resposta pelo painel pausa. "Id fora do nosso registro" **não** serve de
  sinal: o aviso da Zernio pode chegar antes de a nossa chamada de envio voltar com o id.
- Todo direct passa a gravar (antes só os que casavam): duas chamadas ao Supabase por direct.

### 7.5 Janela da Meta

| Desde a última mensagem dela | Robô | Pessoa da loja |
|---|---|---|
| até 24 h | responde | responde normal |
| de 24 h a 7 dias | **não manda nada** | responde como atendimento humano: `messagingType: "MESSAGE_TAG"`, `messageTag: "HUMAN_AGENT"` |
| mais de 7 dias | — | **fechado** até ela escrever de novo |

A rota de envio decide por `last_dm_at` e recusa (409) depois de 7 dias.

### 7.6 Rotas

Todas exigem sessão de dono, admin ou operador de loja com o Instagram ligado e filtram
`tenant_id`. **`[id]` é o id do nosso índice:** a rota confere que a linha é da loja e tira dela o
`zernio_conversation_id` e a conta. Nada que chega do navegador vai direto para a Zernio.

| Rota | O que faz |
|---|---|
| `GET /api/ig/conversations` | Lista do índice: situação, não lidas, pedidos, etiqueta (pelas fichas), busca por @, 50 por página |
| `GET /api/ig/conversations/[id]/messages` | Mensagens pela Zernio (cursor), com os rótulos e as marcas do fio (§7.7); se `last_dm_at` está vazio (conversa importada), calcula e grava |
| `POST /api/ig/conversations/[id]/messages` | Envia texto, foto ou vídeo; aplica a janela; grava o evento com o id devolvido; pausa o robô 12 h e encerra a espera (§6) |
| `POST /api/ig/conversations/[id]/read` | Zera não lidas e marca lida na Zernio (só se havia não lidas) |
| `PATCH /api/ig/conversations/[id]` | Resolver, pausar e retomar o robô |
| `GET /api/ig/conversations/[id]/media` | Pede à Zernio um link novo do anexo (`refreshUrl`, com a chave do servidor) e responde **302** para ele; nunca passa os bytes pela função (limite de 4,5 MB da Vercel) |
| `POST /api/ig/conversations/[id]/invite` | Manda o convite da campanha com botão de URL |
| `DELETE /api/ig/contacts/[id]` | Apagar da lista (§5.3), só dono ou admin |
| `GET/POST/DELETE /api/ig/canned-replies` | Respostas prontas da loja |

O motor também grava `bot_message` com o id de cada envio dele.

### 7.7 Tela Conversas (`/painel/instagram`, aba padrão)

- Abas do Instagram: **Conversas** (com contador) · Fluxos · Pessoas.
- Três colunas: lista (filtros Abertas, Aguardando você, Não lidas, Resolvidas, Pedidos), conversa,
  ficha resumida.
- No fio: bolhas nossas com rótulo **Robô · <fluxo>** ou **Você** (pelo id nos eventos); marcas
  por horário: escolha tocada e etiqueta posta (dos `ig_run_steps` dela, com o rótulo do fluxo
  publicado; bloco que não existe mais vira "passo do fluxo"), convite, aguardando você, robô pausa
  aqui, resolvida (dos eventos).
- Campo de resposta com o estado da janela, **Respostas prontas** (`/`), **Convite do grupo**,
  **Foto ou vídeo**, Enviar.
- Celular: lista → conversa em tela cheia (modo foco da casca, `useFoco`), ficha num botão.
- Barra de cima: item **Instagram** com o número de "aguardando você", no padrão do contador do
  Relâmpago, atualizado pela mesma assinatura do Realtime; título da aba do navegador com o
  mesmo número.

### 7.8 Respostas prontas

`ig_canned_replies (id, tenant_id, title ≤ 40, text ≤ 1000, created_at)`, até 50 por loja, RLS no
mesmo padrão. Abrem com `/` no campo de resposta.

### 7.9 Convite pelo chat

Escolhe a campanha e manda o texto com o botão "Entrar no grupo VIP" (link da campanha). O clique
passa a contar para a conversa quando o clique atribuído da fase 3 existir; até lá é o link da
campanha.

### 7.10 Mídia

- **Recebida:** áudio, foto e vídeo tocam/aparecem pela rota de mídia (§7.6); nada é copiado para
  o nosso armazenamento.
- **Enviada:** sobe direto do navegador para o Storage (`lib/media-upload-client.ts`, URL de envio
  assinada); a Zernio exige URL HTTPS pública, então a rota de envio gera um link assinado de
  leitura, curto, só para o envio. Limites do Instagram: PNG/JPEG até 8 MB, MP4 até 25 MB.

### 7.11 Primeira abertura e pedidos

- Na primeira abertura, varre `GET /v1/inbox/conversations?accountId=…` (até 5 páginas de 100)
  e cria a linha do índice **e a ficha** de cada conversa **(minha)**: entra **Resolvida**, ou
  **Aberta** se a última mensagem tem menos de 24 h; `last_dm_at` fica vazio até a conversa ser
  aberta ou ela escrever. Um botão "Atualizar" repete a varredura (a importação da Zernio pode
  terminar depois); a varredura nunca recria quem foi apagada (§5.3).
- **Pedidos de mensagem** (quem não segue a loja) entram no índice com `folder = 'requests'`, pelo
  webhook (se P5 confirmar) e pela varredura. **Aceitar** chama a Zernio e muda para `inbox`.

## 8. Permissões

| Ação | Quem |
|---|---|
| Ver e responder conversas, ver Pessoas, pôr/tirar etiqueta, editar campo | dono, admin e operador de loja com o Instagram ligado |
| Exportar CSV, apagar pessoa, editar respostas prontas | dono ou admin |
| Pessoas só leitura + CSV nos 30 dias depois de cancelar | dono ou admin (§5.5) |
| Vendedora | não entra no Instagram nesta versão (§3) |

## 9. Privacidade

Política de privacidade (sobe `LEGAL_VERSION` em `lib/legal.ts`):

- **Pessoas do Instagram:** @, id do Instagram, campos e etiquetas que a loja configurou, data da
  última conversa; ficam 12 meses sem conversa e somem 30 dias depois de a loja cancelar o add-on
  (nesse intervalo a loja pode exportar). A loja é a controladora; a Girumo, operadora. "Apagar da
  lista" atende o pedido de exclusão e pede à Zernio para apagar a cópia da conversa.
- **Conversas:** a Girumo **não guarda o histórico**; guarda só o índice com a última mensagem
  (até 200 caracteres) e um registro, **sem texto**, do que o robô e a loja fizeram em cada
  conversa. Mensagens e anexos ficam na Zernio e no Instagram.
- Texto digitado pela pessoa só vira campo quando a loja configurou "Guardar em".

## 10. Provas antes de programar

| # | Pergunta | Se não der |
|---|---|---|
| P1 | O toque numa resposta rápida chega com o payload (em `metadata`, como o `postbackPayload` do botão)? | Casar pelo texto (§4.1 passo 2), que já é o caminho principal |
| P2 | Resposta rápida funciona no Instagram via envio da Zernio com `quickReplies`? | Botões de postback (até 3 por mensagem) |
| P3 | (a) O envio pela API devolve o id da mensagem? (b) `message.sent` de resposta feita **pelo app** do Instagram chega e traz algo que a separe da enviada pela API (`sentVia`)? | (a) Fio sem rótulo nas bolhas, só com as marcas; (b) pausa só para resposta pelo painel |
| P4 | `HUMAN_AGENT` é aceito para as contas conectadas pela Zernio? | Fechar o envio em 24 h |
| P5 | Pedido de mensagem dispara `message.received` com a pasta? | Pedidos só pela varredura e pelo "Atualizar" |
| P6 | Limite de chamadas: era **60/min no plano inicial da Zernio, para todas as lojas juntas** (uma chave só). Qual é o do plano atual? | Nenhuma chamada por item da lista; conversa aberta só busca de novo quando o índice avisa mensagem nova; 429 vira espera com aviso na tela |
| P7 | O `refreshUrl` do anexo precisa da chave da API e devolve um link novo? | A rota de mídia segue igual se precisar; se não precisar, o 302 pode ir direto |
| P8 | O id de quem comenta é o mesmo de quem manda direct? Conferir na prova pendente da fase 3a (card `ig-confirma-link`) | Se for diferente: na retomada pelo @, a ficha do id do comentário é fundida na do direct (campos do direct ganham, etiquetas somam) **(minha)**. Se for igual, nada a fazer |
| P9 | O `DELETE` de conversa da Zernio apaga só a cópia dela (sem mexer no Instagram da loja) e a conversa volta se a pessoa escrever de novo? | Marcador com o id cifrado para a varredura pular quem foi apagada (§5.3) |

## 11. Ordem de entrega

Dois planos, PR por PR a partir de `origin/main`, migrações pelo CI (`apply-order.txt` + baseline).

**Plano 1 — Pessoas e blocos**

1. **Ficha:** `ig_contacts`, `ig_contact_apply`, `tenant_settings.instagram_disabled_at`, store,
   rotina `ig-rotina` (prazos), texto da política (Pessoas).
2. **Modelo:** tipos, esquema, saídas `v0…`/`other`, alternativas por vírgula, validação,
   `MAIN_OUTS`, rótulos, trilha e Mapa (leitura) cientes de Pergunta com escolhas, Etiqueta e Se…
   campo/etiqueta; receita "Comentou, escolhe o grupo" (com o CHECK).
3. **Motor:** escolhas pelo transporte (`quickReplies`, nenhuma no 1º direct), `other` sem ligação
   esperando, Guardar em, Etiqueta, Se… campo/etiqueta; todo direct grava a ficha.
4. **Editor:** formulários dos blocos, trilha, prévia.
5. **Tela Pessoas:** rotas (lista, números, filtros, ficha, em massa, CSV, apagar), a aba e o modo
   só leitura depois de cancelar.

**Plano 2 — Conversas** (começa depois do PR 1 do plano 1)

1. **Índice:** `ig_conversations` e `ig_conversation_events` (publicação do Realtime, RLS),
   webhook atualiza índice e ficha, varredura da primeira abertura, regras automáticas na
   `ig-rotina`, texto da política (Conversas), **prova do Realtime em dev**.
2. **Rotas:** lista, mensagens, envio com janela e `HUMAN_AGENT`, lidas, resolver/pausar, mídia,
   apagar também na Zernio.
3. **Tela Conversas:** lista, conversa com rótulos e marcas, ficha, campo de resposta, ao vivo,
   celular.
4. **Robô × pessoa:** pausa e fim da espera no motor, bloco Passar pra loja (modelo, editor e
   motor), receita com os dois `outro` em Passar pra loja, contador na barra de cima.
5. **Extras:** respostas prontas, convite pelo chat, enviar foto e vídeo.

**Fase 3** (relógio, clique atribuído, "segue a loja?", números) segue no seu plano
(`2026-10-08-instagram-fluxos-fase3.md`), mas o PR K dele precisa ser reconciliado com a fase 3a e
com o "Se…" generalizado daqui antes de executar.

**Quadro:** cards `ig-pessoas`, `ig-blocos-livres` e `ig-conversas` em `nao_existe`, movidos ao
começar cada plano.

## 12. Riscos

- **Zernio lenta ou fora:** a lista continua (índice nosso); abrir a conversa e enviar dependem
  dela. Mensagem de erro clara e reenvio.
- **Limite da Zernio dividido entre todas as lojas (P6):** o chat soma chamadas ao motor.
- **Realtime nunca funcionou neste app:** prova no PR 1 do plano 2, com a saída de 30 s pronta.
  Conexões abertas: uma por aba do painel de loja com o add-on; conferir o limite do plano do
  Supabase.
- **Saída do Supabase:** a cota já estourou em set/2026; por isso nada de consulta repetida e
  respostas sem corpo (`return=minimal`) nas gravações do webhook.
- **Mesma pessoa com dois ids (P8):** sem a fusão, viraria duas fichas.

## 13. Testes e prova

- **Puro:** validação, `outsOf`, renumeração das escolhas, alternativas por vírgula, casamento da
  escolha, normalização de etiqueta e de campo, situação da conversa (§7.3, inclusive as passagens
  automáticas) e janela (§7.5) como funções.
- **Motor** com transporte falso: escolha por toque e por texto, "outro" ligado e sem ligação,
  nenhuma resposta rápida no 1º direct, Guardar em, Etiqueta, Se… campo/etiqueta, robô pausado
  (direct e comentário), fim da espera, Passar pra loja.
- **Stores** com PostgREST falso (filtro `tenant_id` em toda query); a função SQL conferida nos dois
  bancos (ACL incluída: `has_function_privilege` para `authenticated` deve dar falso).
- **Rotas:** janela (24 h, 7 dias, fechada), `[id]` de outra loja dá 404, permissão de CSV e
  apagar, só leitura depois de cancelar, mídia responde 302.
- **Prova em produção** por PR, numa loja liberada: fluxo "Comentou, escolhe o grupo" do comentário
  ao convite certo, etiqueta na ficha, conversa "aguardando você" respondida pelo painel com o robô
  pausado.
