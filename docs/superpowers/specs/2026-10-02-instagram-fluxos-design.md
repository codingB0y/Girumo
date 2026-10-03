# Fluxos do Instagram — design

> **Status:** aguardando revisão do Igor.
> **Data:** 02/10/2026.
> **Substitui** as decisões de produto e a arquitetura do `docs/IG_CONNECT_PRD.md` (16/08/2026).
> A Fase 0 (`docs/contexts/ig-connect-fase0.md`) segue valendo como referência das regras da Meta.
> **Mockup aprovado:** canvas de Design "Girumo · Fluxos do Instagram"
> (`claude.ai/artifact/Tbr29ammnMQrnXADVUK3qF`, versão 6). Fontes em
> `Desktop/girumo-design-refs/fluxo-instagram-2026-10-01/`.

---

## 1. O que é

Um construtor de fluxos para o Instagram dentro do painel: alguém comenta uma palavra num post,
manda a palavra no direct ou responde um story, e recebe no direct o link da campanha, que leva
ao grupo de WhatsApp com vaga. O lojista monta o fluxo a partir de uma receita, vê o mesmo fluxo
em duas visões (passo a passo e mapa) e acompanha quantas pessoas passaram por cada passo.

É um add-on pago. O WhatsApp não muda: o único elo entre os dois mundos continua sendo a URL
`/r/<slug>` dentro de uma mensagem do Instagram. Nada aqui toca `hubflow-engine/`.

## 2. Decisões

| Decisão | Valor | Quem / quando |
|---|---|---|
| Integração | **Zernio** (API de terceiros sobre a API oficial da Meta), no lugar do app próprio na Meta | Igor, 01/10 |
| Visões | **Um fluxo, duas visões**: "Passo a passo" e "Mapa", com o alternador "Ver como", ao criar e ao ver | Igor, 01/10 |
| Preço | **R$ 297/mês + taxa única de R$ 200** na primeira fatura (R$ 497 no primeiro mês) | Igor, 02/10 |
| Resposta pública no comentário | **Entra** | Igor, 01/10 |
| Story | **Entra** (resposta a story dispara fluxo) | Igor, 01/10 |
| Porteiro de 1 mensagem | **Continua**, como a receita mais simples | Igor, 01/10 |
| Motor do fluxo | **Nosso.** A Zernio só transporta mensagens e eventos | proposta deste spec (§5) |
| Primeiro direct depois de comentário | **Texto puro pedindo resposta.** Botão só depois que a pessoa responde | proposta deste spec (§4) |

O que cai do PRD de 16/08: add-on a R$ 97; "sem fluxo de vários passos"; "sem resposta pública";
"sem story"; app próprio com Instagram Login, OAuth nosso, token cifrado, refresh de 60 dias e
App Review. As tabelas `ig_triggers` e `ig_events` (vazias nos dois bancos, sem código que as
leia) saem; `ig_accounts` é adaptada (§7).

## 3. Prova da Zernio (02/10/2026)

Rodada na conta `@vireimoda`, com o perfil `igortoled0` como cliente. Plano grátis da Zernio.

| # | Pergunta | Resultado |
|---|---|---|
| P1 | Precisa de App Review nosso? | **Não.** A conta conecta pelo app da Zernio (Instagram Login) e já vem com as permissões de mensagem e comentário |
| P2 | Existe "add-on de inbox" pago? | **Não** no plano por uso. `/v1/workflows` e `/v1/comment-automations` responderam 200 |
| P3 | Comentário em post que não foi publicado pela Zernio gera aviso? | **Sim.** `comment.received` chegou em cerca de 1 s, com `postId: null` e `platformPostId` |
| P4 | Resposta privada de texto | **Aceita** |
| P5 | Resposta privada com botão, para quem segue | **Aceita.** O toque volta como mensagem com `metadata.postbackPayload` |
| P6 | Resposta privada com botão, para quem não segue | **Aceita no teste**, mas a pessoa tinha conversa aberta nas últimas 24 h. Para quem nunca falou com a loja a doc diz que o Instagram recusa (código 2, subcódigo 1545133) **e a tentativa gasta o único direct do comentário**. Não provado |
| P7 | Resposta pública no comentário | **Aceita** |
| P8 | Resposta da pessoa ao direct | Chega em `message.received` com `metadata.quotedMessageId` = id do direct enviado |
| P9 | Direct de continuação dentro das 24 h | **Aceito** |
| P10 | Resposta a story | Chega em `message.received` com `metadata.storyReply.storyId` |
| P11 | Palavra no direct | Chega em `message.received` comum |
| P12 | "Segue a loja?" | `GET /v1/accounts/{id}/follow-status/{userId}` responde. O valor que vem dentro dos webhooks fica **defasado por cerca de 1 minuto**; para decidir, consultar com `refresh=true` |
| P13 | O fluxo da própria Zernio serve de motor? | **Não para este produto.** No Instagram o workflow deles só envia texto ou mídia e só ramifica por variáveis do run (texto da resposta). Não checa seguidor nem clique |

Limites medidos e documentados: 60 requisições/min com até 2 contas conectadas, 600 a partir de 3;
entrega de webhook em até 5 s, com reenvio; 10 mil mensagens/mês grátis por time.

## 4. Escopo

### 4.1 Dentro

**Gatilhos**
- Comentário com palavra em post ou reel (qualquer um, ou um post específico).
- Palavra no direct.
- Resposta a story com a palavra (opção do gatilho de direct).

**Blocos**
- **Direct**: texto, com espera opcional pela resposta da pessoa (até 23 h).
- **Convite pro grupo**: texto + link da campanha, com lembrete opcional para quem não clicou.
- **Condição**: "Segue a loja?".
- **Resposta pública** no comentário: é um campo do gatilho de comentário, não um bloco.

**Receitas**
1. *Comentou, entra no grupo* — comentário → convite (o porteiro de 1 mensagem).
2. *Comentou, segue e entra no grupo* — comentário → direct que pede resposta → segue a loja? →
   convite → lembrete para quem não clicou.
3. *Pediu no direct* — palavra no direct ou resposta a story → convite.
4. *Em branco* — só o gatilho.

**Painel**: lista de fluxos, novo fluxo (receita + visão), editor com as duas visões, publicar,
pausar, atendimentos e números por passo.

### 4.2 Fora da primeira entrega (aparecem no mockup, ficam para depois)

| Item do mockup | Por quê fica fora |
|---|---|
| Blocos Etiqueta, Teste A/B, Esperar e Passar pra loja | Nenhuma receita depende deles. Etiqueta exige um cadastro de pessoas do Instagram que não existe |
| Receita "Perguntas prontas no direct" | É configuração da conta (até 4 atalhos), não um fluxo. O toque no atalho não foi provado |
| Botão "Testar" | Sem definição do que é testar. Entra junto com o motor, se fizer falta |
| Montar arrastando no mapa | É a parte cara (fase 5). Até lá o mapa é só leitura |
| Botão no primeiro direct | Ver P6. A palavra "toque" do mockup vira "resposta" nesse passo |

### 4.3 Regras que não mudam

1. Só respondemos a ação iniciada pela pessoa. Nunca direct frio.
2. O destino é sempre o link de uma campanha existente.
3. Interface em PT-BR com o vocabulário do atacado. "Atendimentos", "direct", "pessoas". **Nunca "lead".**
4. Não guardamos o texto do comentário nem do direct. Só a palavra que casou.

## 5. Arquitetura

```
Instagram ──► Zernio ──► POST /api/ig/webhook ──► motor (lib/ig/engine) ──► Zernio ──► Instagram
                              │                        │
                              ▼                        ▼
                          ig_runs                 ig_run_steps  ──► números por passo
                                                       ▲
pessoa clica ──► GET /r/<slug>?ig=<ref> ───────────────┘  (clique atribuído ao run)
```

**Por que o motor é nosso e não o workflow da Zernio (P13):**
- o produto pedido tem condição "segue a loja?" e "clicou no link?", que o workflow deles não avalia;
- os números por passo são o coração das duas visões, e saem direto do nosso registro de transições;
- o clique é medido pelo nosso `/r/<slug>`, não por eles;
- trocar de transporte (app próprio na Meta, outro fornecedor) não obriga a refazer fluxo nenhum.

O custo dessa escolha é um relógio do nosso lado para o lembrete (§8.4). É o único.

**Unidades** (todas em `apps/web/src`):

| Unidade | Faz | Depende de |
|---|---|---|
| `lib/ig/flow/*` | Tipos do fluxo, receitas, validação, trilha do passo a passo, posições do mapa. **Puro**, sem I/O | nada |
| `lib/ig/engine/*` | Decide o próximo passo de um run e executa as ações | `flow`, `transport`, stores |
| `lib/ig/transport/*` | Fala com a Zernio: enviar, responder, consultar seguidor, conectar conta, validar assinatura | `fetch` |
| `lib/stores/ig-*.ts` | `ig_accounts`, `ig_flows`, `ig_runs` (+ passos) | Supabase |
| `app/api/ig/*` | Rotas do painel, webhook, relógio | tudo acima |
| `app/painel/instagram/*` + `components/painel/instagram/*` | Telas | rotas |

`transport` é um tipo com duas implementações desde o primeiro dia: a da Zernio e a falsa dos testes.

## 6. Modelo do fluxo

Um fluxo é um grafo pequeno, guardado como JSON e versionado por `v`.

```ts
export type FlowDef = { v: 1; nodes: FlowNode[]; edges: FlowEdge[] };
export type FlowEdge = { from: string; out: string; to: string };

export type TriggerNode = {
  id: string; type: "trigger";
  on: "comment" | "dm";
  keywords: string[];
  postId: string | null;        // só comment; null = qualquer post ou reel
  publicReply: string | null;   // só comment; resposta pública no comentário
  storyReplies: boolean;        // só dm; resposta a story também dispara
};                               // saída: "next"

export type MessageNode = {
  id: string; type: "message";
  text: string;
  button: string | null;                 // rótulo do botão; proibido no 1º direct após comentário
  wait: { minutes: number } | null;      // espera resposta ou toque
};                               // saídas: com wait "replied" | "timeout"; sem wait "next"

export type InviteNode = {
  id: string; type: "invite";
  text: string;
  campaignSlug: string | null;           // link mestre da campanha (/r/<slug>)
  remindAfterMinutes: number | null;
};                               // saídas: "clicked" | "not_clicked"

export type ConditionNode = { id: string; type: "condition"; check: "follows" };
                                 // saídas: "yes" | "no"

export type FlowNode = TriggerNode | MessageNode | InviteNode | ConditionNode;
```

Saída sem aresta = o fluxo para ali ("Parou aqui" nas telas). Não existe bloco "fim".

**As duas visões saem do mesmo grafo, por função pura:**
- *Passo a passo* (`linearize`): a trilha principal segue as saídas `next`, `replied`, `yes`,
  `clicked`, nessa ordem de preferência. As outras (`timeout`, `no`, `not_clicked`) viram desvios
  pendurados no passo de origem.
- *Mapa* (`layout`): a trilha principal vira a espinha horizontal; os desvios descem da coluna
  do bloco de origem. As posições são calculadas, não guardadas. Só passam a ser guardadas quando
  o mapa for editável (fase 5).

**Edição na primeira entrega** é por operações nomeadas, não edição livre do grafo: alterar campo
de um bloco, acrescentar ou tirar "pedir resposta e conferir se segue", acrescentar ou tirar
"lembrar quem não clicou". São as sugestões "Dá pra acrescentar depois" do mockup.

**Validação** (`validate`, a mesma função no painel e no servidor) devolve a lista "Pra publicar":

| Regra | De onde vem |
|---|---|
| Exatamente 1 gatilho, com 1 a 10 palavras, sem repetição depois de normalizar | produto |
| Todo bloco com texto. Até 1000 **bytes** UTF-8; até 640 caracteres se tiver botão | Meta / Zernio |
| Convite com campanha escolhida, e a campanha existe | produto |
| Depois de comentário, o primeiro bloco manda o único direct permitido. Outro direct só em caminho que passou por `replied` | Meta: 1 resposta privada por comentário |
| Primeiro direct depois de comentário sem botão | P6 |
| Condição "segue a loja?" só em fluxo de direct ou depois de um `replied` | Meta só revela quem segue depois que a pessoa manda mensagem |
| Espera e lembrete de no máximo 1380 min (23 h) | Meta: janela de 24 h |
| Nenhum bloco inalcançável. Ciclo só passando por Condição | consistência |
| Conta do Instagram conectada e ativa | operação |
| Nenhum outro fluxo no ar com a mesma palavra no mesmo tipo de gatilho | 1 direct por comentário |

## 7. Dados

Uma migração só, nos **dois** bancos, registrada em `deploy/supabase/apply-order.txt`, com a
baseline regenerada no mesmo PR. As tabelas do motor nascem já na fase 1 para não repetir a
rodada manual de DDL.

**`ig_accounts` (alterar)**
- `provider text not null default 'zernio'` (`'zernio' | 'meta'`)
- `provider_account_id text` (id da conta na Zernio; é a chave de roteamento do webhook; único)
- `provider_profile_id text` (perfil da Zernio do tenant)
- `access_token_enc` e `token_expires_at` passam a aceitar nulo (quem guarda o token é a Zernio)
- `ig_user_id` guarda o id da conta no Instagram (`metadata.instagramScopedId` na Zernio), que é
  o `sender.id` das mensagens que a própria loja envia
- troca a policy inerte (`current_setting`) por `app.has_membership(tenant_id)` só de leitura

**`ig_flows` (nova)**: `id`, `tenant_id`, `ig_account_id` (nulo enquanto não há conta), `name`,
`recipe`, `status` (`draft | live | paused`), `draft jsonb`, `published jsonb`, `version int`,
`published_at`, `created_at`, `updated_at`.

**`ig_runs` (nova)**: uma linha por pessoa que entrou num fluxo.
`id`, `tenant_id`, `ig_account_id`, `flow_id`, `flow_version`, `source_kind`
(`comment | dm | story`), `source_id` (**único global**: é a idempotência), `ig_user_id`,
`username`, `matched_keyword`, `ref` (aleatório, único; vai no link e nos botões), `status`
(`queued | active | done | stopped | failed`), `node_id`, `waiting` (`reply | click`), `wake_at`,
`window_expires_at`, `clicked_at`, `error_code`, `error_message`, `started_at`, `updated_at`,
`finished_at`.

**`ig_run_steps` (nova)**: uma linha por transição. `id`, `tenant_id`, `flow_id`, `run_id`,
`node_id`, `out`, `occurred_at`. É a fonte dos números.

**`tenant_settings.instagram_enabled boolean not null default false`**: a liberação por loja.

**Saem**: `ig_triggers` e `ig_events`, com guarda que aborta a migração se houver linha.

Regras: `create ... if not exists`; RLS ligado com policy `app.has_membership(tenant_id)` de
leitura e escrita revogada de `authenticated` (só o servidor escreve); todo acesso das stores
filtra `.eq("tenant_id", ...)`. Retenção de 90 dias para `ig_runs` e `ig_run_steps`.

## 8. Motor

### 8.1 Entrada

`POST /api/ig/webhook`, registrado em `PROVIDER_WEBHOOKS` e em `RATE_LIMITS`.

1. Lê o corpo cru e confere `X-Zernio-Signature` (HMAC-SHA256 em hex, segredo em
   `ZERNIO_WEBHOOK_SECRET`) com comparação em tempo constante. Falhou: 401, sem efeito.
2. Acha o tenant por `account.accountId` → `ig_accounts.provider_account_id`. Conta desconhecida
   ou loja sem `instagram_enabled`: 202 e nada mais (o endpoint não vira oráculo).
3. Traduz o evento:
   - `comment.received`: ignora comentário da própria conta (`author.isOwnAccount`) e resposta a
     outro comentário (`isReply`). Casa a palavra com `matchKeyword` entre os fluxos no ar.
     Fluxo de post específico ganha de "qualquer post"; depois, a palavra mais longa.
   - `message.received`: se a pessoa tem run ativo esperando resposta, avança o run. Senão, tenta
     gatilho de direct (e de story, quando vem `metadata.storyReply`).
   - `account.connected` / `account.disconnected`: atualiza `ig_accounts.status`.
4. Grava o run (o `source_id` único barra reenvio) e executa o primeiro passo **na mesma
   requisição**. Deu certo: 200. Falha passageira: 500, e a Zernio reenvia com espera crescente.

Nada que não casa é gravado. Quem comenta outra coisa não deixa rastro no nosso banco.

### 8.2 Execução

`advance(run, evento)` com `evento` em `start | reply | click | timer`:

| Bloco | Ação | Fica esperando |
|---|---|---|
| Gatilho de comentário | Resposta pública, se configurada | não |
| Direct | Resposta privada (se é o primeiro direct de um comentário) ou mensagem na conversa | resposta, se `wait` |
| Convite | Mesmo envio, com `…/r/<slug>?ig=<ref>` no fim do texto | clique, se há lembrete ou aresta `clicked` |
| Condição "segue a loja?" | Consulta `follow-status` com `refresh=true` | não |

Cada transição grava uma linha em `ig_run_steps`. Todo envio leva `Idempotency-Key` derivado de
`run.id` + `node_id`.

### 8.3 Regras de proteção

- **Uma entrada por pessoa por fluxo a cada 24 h.** Quem comenta de novo não recebe de novo.
- **Trava de retomada**: run em `queued` há mais de 2 min pode ser reexecutado por um reenvio. Se
  a resposta privada já tinha saído, a Zernio devolve `details.privateReplyConsumed` e o run é
  marcado como enviado.
- **Teto por conta**: a Meta permite 750 respostas privadas por hora. Acima de 700 runs iniciados
  na última hora, o motor para de iniciar novos e mostra o motivo no painel.
- **Janela**: nenhum envio depois de `window_expires_at`. O run termina com o motivo.
- **Ciclo**: um bloco é visitado no máximo 2 vezes por run.
- **Erro da Zernio ou da Meta**: `error_code` cru no run; o painel traduz para PT-BR.
- **Fluxo pausado**: runs ativos viram `stopped`.

### 8.4 Relógio (fase 3)

O único passo que acontece "depois" é o lembrete de quem não clicou. A Vercel só agenda uma vez
por dia e o banco não tem `pg_cron`. O worker (`apps/worker`), que já roda manutenção a cada
30 s, passa a chamar `POST /api/ig/tick` uma vez por minuto com o token da engine. A rota pega os
runs com `wake_at` vencido (`for update skip locked`) e chama `advance(run, timer)`. Toda a
lógica continua no `apps/web`; o worker só bate o ponto.

Até a fase 3 não existe relógio: as receitas de 1 direct não precisam dele.

### 8.5 Clique atribuído (fase 3)

`/r/<slug>?ig=<ref>`: depois do filtro de robô que já existe, e dentro do `after()` que já existe,
o handler marca `clicked_at` no run daquele `ref` (só no primeiro clique, e só se o tenant do run
é o do link) e chama `advance(run, click)`. O `ref` é aleatório, casa com
`^[A-Za-z0-9_-]{10,24}$`, não carrega dado pessoal, nunca é ecoado no HTML e é retirado da URL
enviada à Meta no evento de conversão. O redirecionamento nunca espera nem falha por causa disso.

## 9. Conexão da conta (fase 2)

1. O lojista clica em **Conectar Instagram**. O servidor garante o perfil da Zernio do tenant
   (`POST /v1/profiles` com o id do tenant como nome; o 409 devolve o perfil que já existe) e
   redireciona para a `authUrl` de `GET /v1/connect/instagram`, pedindo só os escopos de
   comentário e mensagem. O `redirect_url` leva um `state` assinado (HMAC, 10 min, tenant).
2. A volta cai em `/api/ig/connect/callback`, rota de usuário logado. O servidor confere o
   `state`, **ignora os ids da query** e confirma na Zernio (`GET /v1/accounts?profileId=`) qual
   conta entrou no perfil. Só então grava `ig_accounts`.
3. Desconectar: `DELETE /v1/accounts/{id}` e `status = 'disconnected'`. Fluxos no ar são pausados.
4. `account.disconnected` da Zernio marca a conta como `expired`; o painel pede para reconectar.

Uma conta por tenant, como no índice que já existe. A mesma conta não entra em dois tenants.

O webhook da Zernio é **um só para todas as lojas**, criado uma vez por nós (runbook, fase 2),
com os eventos `comment.received`, `message.received`, `account.connected`, `account.disconnected`.

## 10. Painel

**Rotas**
- `/painel/instagram` — lista de fluxos, estado da conta, números do período.
- `/painel/instagram/novo` — receita + visão em que vai montar.
- `/painel/instagram/[id]` — o fluxo. Abas "Roteiro" e "Atendimentos". Alternador "Ver como".

**Menu**: item "Instagram" no grupo "Lotar", depois de Campanhas. Só aparece para loja com
`instagram_enabled`. Os itens do menu ganham um campo opcional `requer`, e quem desenha o menu
filtra por ele. O estado vem de `GET /api/ig/status`
(`{ enabled, account, live }`), buscado uma vez pela casca. Loja sem a liberação que abre a rota
por link direto vê um aviso de que o Instagram não está liberado para ela, sem preço. A oferta
com preço só entra na fase 4.

**Modo foco**: a tela do fluxo não tem menu lateral nem barra de cima do painel, como no mockup.
Hoje nenhuma tela do painel faz isso. O `CascaContext` ganha `foco`; a página liga ao montar e
desliga ao sair; `Corredor`, `Letreiro` e `BarraMobile` não desenham nada enquanto está ligado.
As rotas de lista e de novo fluxo ficam dentro da casca normal.

**As duas visões** usam a mesma barra de cima e a mesma faixa de abas, com o alternador no mesmo
lugar. A visão escolhida fica em `localStorage`, por pessoa ("abre na última que você usou").

| | Passo a passo | Mapa |
|---|---|---|
| Fase 1 | Monta e edita. Prévia "Como a cliente vê". Lista "Pra publicar" | Só leitura, com os mesmos blocos |
| Fase 3 | Números em cada passo e desvio | Espessura da ligação proporcional a quantas pessoas passaram |
| Fase 5 | igual | Edita arrastando (React Flow) |

**Rascunho e publicação**: editar mexe só no `draft`, salvo sozinho (com indicação "Salvando" /
"Salvo"). "Publicar" valida no servidor, copia `draft` para `published` e sobe `version`.
"Publicar alteração" aparece quando o rascunho difere do publicado. O interruptor "no ar" pausa e
retoma.

**Celular**: passo a passo completo; mapa só leitura. Mesmo alternador.

**Direção D**: tema noite, Archivo, superfícies e linhas dos tokens que já existem, tabelas com
fio, nada de grade de cartões, no máximo 2 usos de `bg-acid` por arquivo (`npm run painel:check`).
Contador de mensagem em **bytes**.

## 11. Números (fase 3)

`ig_run_steps` agrupado por `(node_id, out)` no período, por função no banco (o PostgREST não
agrupa). Daí saem os números de cada passo, as espessuras do mapa e a faixa do topo da lista:
chamaram, receberam o direct, clicaram.

"Entraram no grupo" é **estimativa**, como no mockup: cliques × taxa de entrada da campanha. O
WhatsApp não diz qual pessoa do Instagram entrou. A tela marca o número com "≈".

## 12. Cobrança (fase 4)

- Stripe: preço recorrente de R$ 297 (`STRIPE_PRICE_INSTAGRAM`) como **segundo item** da
  assinatura que a loja já tem, mais R$ 200 avulsos na primeira fatura
  (`STRIPE_PRICE_INSTAGRAM_ATIVACAO`).
- Antes disso, dois consertos no que existe: o webhook do Stripe lê só `items.data[0]` e
  sobrescreve `subscriptions.metadata` inteiro a cada evento. Ele passa a identificar o item do
  plano pelo preço e a mesclar o `metadata`.
- O webhook liga e desliga `tenant_settings.instagram_enabled` conforme o item existe na
  assinatura. Cancelou o plano, cai o add-on junto.
- Até a fase 4 a liberação é manual, por loja (admin ou SQL).
- A partir desta fase, loja sem o add-on que abre `/painel/instagram` vê a oferta com o preço e
  o botão de assinar, no lugar do aviso neutro das fases anteriores.

## 13. Segurança e LGPD

| Superfície | Proteção |
|---|---|
| `POST /api/ig/webhook` | HMAC do corpo cru, tempo constante, sem sessão. 202 para conta desconhecida |
| `/api/ig/connect/callback` | `state` assinado + sessão. Nunca confia nos ids da query |
| `POST /api/ig/tick` | Só a engine (token), na lista `ENGINE_ONLY` |
| Rotas do painel | `getTenantContext` + `assertPermission` nas escritas. Loja sem o add-on: 403 |
| Chave da Zernio | `ZERNIO_API_KEY`, só servidor, nunca `NEXT_PUBLIC_`, nunca em log |
| Stores | `.eq("tenant_id", ...)` em toda leitura e escrita |

Dados pessoais guardados: id escopado do Instagram, @, palavra que casou, datas e estado.
**Não guardamos** texto de comentário ou direct, mídia, foto, nem quem comentou sem casar palavra.
Retenção de 90 dias. A Zernio passa a ser suboperadora dos directs: a política de privacidade
precisa citá-la antes da venda.

## 14. Operação

| Item | Valor |
|---|---|
| Variáveis novas | `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET` (web); nada novo no worker além da rota |
| Custo por conta conectada | 2 grátis; US$ 6 da 3ª à 10ª; US$ 3 da 11ª à 100ª; US$ 1 depois |
| Mensagens | 10 mil/mês grátis no time inteiro; depois US$ 1 por 10 mil |
| Cartão na Zernio | **Obrigatório antes da 3ª conta** e antes de passar de 10 mil mensagens. Sem ele a conexão devolve 402 e o envio 403 |
| Limite de chamadas | 60/min até 2 contas; 600/min a partir de 3 |

## 15. Testes

- **Puros** (`node:test`, ao lado do código): validação, receitas, trilha, posições do mapa,
  contagem em bytes, escolha do fluxo, `advance` com transporte falso, assinatura do webhook,
  leitura dos dois eventos (zod).
- **Stores**: PostgREST falso embutido no teste, conferindo o filtro de tenant.
- **Integração** (banco de dev): as funções de banco da fase 3.
- **E2E** (Playwright): rotas novas em `conteudo-esperado.ts`; criar rascunho por receita, trocar
  de visão, publicar bloqueado com o motivo.
- **Prova em produção por fase**, na `@vireimoda`, com a evidência no card do quadro.

## 16. Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 0 | Prova da Zernio | **Feito em 02/10** (§3) |
| 1 | Migração, modelo do fluxo, stores, rotas, painel: lista, novo, passo a passo, mapa só leitura, modo foco, menu com liberação por loja | Igor cria e edita rascunho das 4 receitas nas duas visões. "Publicar" bloqueado com o motivo "conecte o Instagram" |
| 2 | Cliente da Zernio, conectar e desconectar, webhook, motor das receitas de 1 direct, resposta pública, gatilhos de comentário, direct e story, publicar e pausar, aba Atendimentos | Comentário real na `@vireimoda` vira direct com o link em menos de 5 s |
| 3 | Espera por resposta, condição "segue a loja?", clique atribuído, lembrete (relógio), números nas duas visões e na lista | A receita 2 roda inteira e os números batem com o banco |
| 4 | Cobrança do add-on | Loja assina pelo painel e o Instagram libera sozinho |
| 5 | Mapa editável | Igor monta um fluxo do zero arrastando blocos |

Um PR por assunto. As fases 1 e 2 são vários PRs cada.

## 17. Depois

Etiqueta, teste A/B, espera genérica, passar pra loja, perguntas prontas, botão automático para
quem já segue, pausar o fluxo quando a loja responde à mão, mais de uma conta por loja,
transporte direto na Meta.

---

## Apêndice — contrato da Zernio usado (base `https://zernio.com/api`)

| Uso | Chamada |
|---|---|
| Perfil do tenant | `POST /v1/profiles { name }` |
| Conectar | `GET /v1/connect/instagram?profileId=&redirect_url=&scopes=comments,messaging` → `{ authUrl }` |
| Contas do perfil | `GET /v1/accounts?profileId=` |
| Desconectar | `DELETE /v1/accounts/{accountId}` |
| Resposta privada | `POST /v1/inbox/comments/{platformPostId}/{commentId}/private-reply { accountId, message, buttons? }` |
| Resposta pública | `POST /v1/inbox/comments/{platformPostId} { accountId, message, commentId }` |
| Direct na conversa | `POST /v1/inbox/conversations/{conversationId}/messages { accountId, message, buttons? }` |
| Segue a loja? | `GET /v1/accounts/{accountId}/follow-status/{userId}?refresh=true` → `{ isFollower }` |
| Webhook | `POST /v1/webhooks/settings { name, url, secret, events }` |

Autenticação: `Authorization: Bearer <chave>`. Reenvio seguro: cabeçalho `Idempotency-Key`.
Erro: `{ error, type, code, platformError, details }`.

**Campos provados nos eventos**
- `comment.received`: `comment.id`, `comment.platformPostId`, `comment.text`, `comment.author.id`,
  `comment.author.username`, `comment.author.isOwnAccount`, `comment.isReply`,
  `account.accountId`.
- `message.received`: `message.platformMessageId`, `message.text`, `message.sender.id`,
  `message.sender.username`, `message.sentAt`, `conversation.id`, `conversation.participantId`,
  `account.accountId`, `metadata.quotedMessageId`, `metadata.postbackPayload`,
  `metadata.storyReply.storyId`.
- `comment.author.id` e `conversation.participantId` são o mesmo id da pessoa. É por ele que a
  resposta no direct encontra o run que nasceu do comentário.
