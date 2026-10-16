# Integração Bling — vendas do ERP no funil e no Meta — design

**Data:** 13/10/2026 · **Status:** desenho aprovado pelo Igor em 13/10 (7 seções) + mockup
**Mockup:** https://claude.ai/artifact/Fpbmf3pLq7F8t6BzsAhX2z (não conectado, importando, conectado,
ajustes, listas, alertas, vendas)
**Card do quadro:** `integracao-bling` (prod, `em_construcao` desde 13/10)
**Depende de:** funil de anúncios (`2026-10-10-funil-anuncios-design.md`) — a atribuição é dele; aqui só
entra venda em `orders`. Porta "Integrações" do PR 3b (#443, já na `main`).

## Problema

A loja registra a venda no Bling (ERP). A Girumo só conhece venda lançada à mão em `orders`, então o funil
de anúncios não enxerga a maior parte das vendas de quem usa Bling, e o Meta não recebe a compra — otimiza
por clique e cadastro, não por quem compra.

Pedido do Igor (13/10): botão "Conectar Bling"; venda que sai no Bling chega na Girumo na hora com os dados
da venda e da cliente; a Girumo acha o grupo e o anúncio; manda pro Meta com o máximo de dados de casamento
(inclusive nascimento); quem não tiver origem vai pra uma lista sincronizada com o Meta; "tem que rodar
redondinho", sem bug de conexão nem lentidão.

## Decisões do Igor (13/10)

| Pergunta | Decisão |
|---|---|
| O que conta como venda | **Configurado no cartão do Bling, por loja**: checklist das situações da conta Bling dela |
| Pedido criado e não pago (em aberto, cancelado) | Vira **lead qualificado** (lista própria) |
| Cliente que fecha pedido | **Sai da lista anterior**: cada cliente em uma lista só |
| Cliente de valor alto | Lista própria, com **valor mínimo configurável** no cartão |
| Quais vendas vão pro Meta | **Todas** (o Meta atribui sozinho; a lista de compradores fica completa) |
| Como a lista chega ao Meta | **Pelos eventos** (Purchase/InitiateCheckout via CAPI); o lojista cria os públicos uma vez no Gerenciador; histórico em CSV. Sincronização pela API do Meta fica para a fase 2 do funil (app do Meta) |

## O que a análise mudou no pedido

1. **A chave Bling ↔ Girumo é o WhatsApp**, pela `phone_key` do funil (DDD + 8 últimos dígitos; resolve o
   nono dígito). A Girumo não tem e-mail de ninguém. E-mail, nascimento, sexo, cidade, UF e CEP servem ao
   **Meta**, em hash, para casar a compradora.
2. **Sem segunda atribuição.** A venda do Bling entra em `orders` (com `source = 'bling'`). A aba
   Anúncios, o Resultados e o status "comprou" do lead passam a contar sozinhos. Sem origem → "fora dos
   anúncios" do funil.
3. **Todas as vendas vão ao Meta** como `Purchase` com dados do cliente. O Meta casa a compradora com quem
   viu/clicou e atribui mesmo quando a Girumo não acha a ligação. Com cadastro do site, vão também `fbc`/`fbp`.
4. **Histórico de 90 dias** ao conectar (a janela de venda do funil). O Meta só aceita evento de até 7 dias:
   o resto entra no funil e nas listas, não como evento.
5. **Venda do Bling não se edita na Girumo**: o Bling é a fonte.

## Restrições externas (pesquisa de 13/10, fontes em `developer.bling.com.br` e `developers.facebook.com`)

**Bling (API v3):**

| Fato | Consequência no desenho |
|---|---|
| OAuth só Authorization Code; `redirect_uri` e escopos fixos no cadastro do app | escopos certos de primeira |
| **Mudar escopo revoga todos os usuários do app** | lista de escopos fechada (§11) |
| App multi-loja tem de ser **público**; sem homologação, **no máximo 10 autorizações** | piloto ≤ 10 lojas; homologação antes da 11ª |
| `code` vale 1 min; **reusar o `code` revoga o usuário** | retorno de uso único, travado no banco |
| Token: `POST https://api.bling.com.br/Api/v3/oauth/token`, Basic `client_id:client_secret`, form-urlencoded, `Accept: 1.0`; access 6 h, refresh 30 dias; header `enable-jwt: 1` em tudo (token opaco descontinuado; JWT de 1,5–3 mil caracteres) | cliente HTTP manda `enable-jwt: 1` sempre |
| Refresh token **rotaciona** (3 SDKs de terceiros; a doc não diz) | renovação serializada por loja, com versão |
| 3 req/s e 120 mil/dia **por conta Bling**, somando todos os apps dela | 1 chamada a cada 350 ms por loja; 429 com recuo |
| 429 = `{"error":{"type":"TOO_MANY_REQUESTS",…,"period":"second"\|"day"}}`, sem `Retry-After` documentado | recuo próprio 1/2/4 s |
| Bloqueio de IP: 300 erros/10 s → 10 min; 600 req/10 s → 10 min; **20 chamadas a `/oauth/token` em 60 s → 60 min** | orçamento global de renovação; disjuntor por loja |
| Webhook configurado **no cadastro do app** (vale para toda loja que autorizar); recurso `order`: `created`, `updated`, `deleted` | um endpoint só, roteado por `companyId` |
| Envelope `{eventId, date, version, event, companyId, data}`; `data` do pedido v1: `id, data, numero, numeroLoja, total, contato{id}, vendedor{id}, loja{id}, situacao{id,valor}`; `deleted` só `{id}` | aviso só marca o pedido; o estado vem de GET |
| Assinatura `X-Bling-Signature-256: sha256=<hex>` = HMAC-SHA256 do corpo cru com o `client_secret` | conferência em tempo constante |
| Responder 2xx em **5 s**; retenta por **3 dias**; esgotado, **o Bling desliga o webhook do recurso** | resposta imediata + fila; varredura independe do aviso |
| Entrega fora de ordem e com duplicata | fila por pedido; processamento lê o estado atual |
| `companyId` = `GET /empresas/me/dados-basicos` → `data.id` (escopo "dados básicos da empresa") | gravado na conexão |
| `GET /pedidos/vendas` filtra por `dataInicial/dataFinal` (dia) e `dataAlteracaoInicial/Final` (`YYYY-MM-DD HH:MM:SS`, fuso não documentado); `pagina`, `limite` (padrão 100); item traz `id, numero, data, total, contato{id,nome,tipoPessoa,numeroDocumento}, situacao{id,valor}` | varredura por alteração; histórico por dia |
| `GET /contatos/{id}` traz `email, emailNotaFiscal, celular, telefone, endereco.geral{cep,municipio,uf}, dadosAdicionais{dataNascimento:"YYYY-MM-DD", sexo:"M"\|"F"}, tipo (F/J/E), pais{nome}`; a lista não traz e-mail | contato por id, com cache |
| Situações: `GET /situacoes/modulos` e `GET /situacoes/modulos/{id}` → `[{id, nome, idHerdado, cor}]`; ids padrão (não oficiais, convergentes): 6 Em aberto, 9 Atendido, 12 Cancelado, 15 Em andamento, 18 Venda agenciada, 21 Em digitação, 24 Verificado | checklist por loja; base pelo `idHerdado` |
| Homologação: dados do app (logo, nome, descrições, categoria, retorno, homepage sem login, manual, vídeo), teste técnico em `/homologacao/produtos` (10 s, 2 s entre passos), revisão humana | pendência do Igor (§11) |

**Meta:**

| Fato | Consequência |
|---|---|
| `action_source = chat` = "conversão feita por app de mensagem" | venda no WhatsApp pela vendedora |
| `event_time` até **7 dias**; um evento velho derruba o lote inteiro | evento só até 7 dias; um pedido por envio |
| `em, ph, fn, ln, db, ge, ct, st, zp, country, external_id` em SHA-256, aceitam **lista**; `fbc`/`fbp` sem hash | os dois formatos do celular juntos |
| Purchase exige `value` + `currency`; dedup pixel × servidor por `event_id` + `event_name` em 48 h | `event_id` estável por pedido |
| "Todos os `action_source` habilitam criação de público"; público por evento retém até 180 dias | públicos pela regra do evento |
| Lista de clientes pela API exige `ads_management` com Full access (revisão + verificação da empresa) e aceite de termos por conta | fase 2 |
| EMQ só para eventos web | sem nota de casamento para `chat` |
| A CAPI segue o ciclo da Graph: v23.0 vale até 08/10/2027 (a Marketing API v23 venceu, mas não usamos endpoint dela) | `GRAPH_API_VERSION` fica; subir antes de 10/2027, fora deste trabalho |

## Abordagem

```
Bling ─aviso─▶ POST /api/integracoes/bling/webhook ─ confere assinatura ─ marca bling_orders(pedido) pendente ─ 200
                                                   └ after(): sincronizar(loja, gatilho 'aviso', 45 s)
Vercel Cron */5 ─▶ GET /api/cron/bling ─ por loja ativa: sincronizar(loja, 'cron', orçamento)

sincronizar(loja):
  trava da loja (bling_claim) ── ocupada? sai (quem tem a trava drena)
  token vencendo em < 30 min? renova (orçamento global 10/min; versão contra corrida)
  situações com mais de 24 h? recarrega
  [cron] varredura: pedidos alterados nas últimas 4 h → pendente só o que mudou
  [cron] histórico: até 3 páginas da janela de 90 dias
  drena pendentes (próxima tentativa ≤ agora) até o orçamento acabar
  solta a trava; sobrou pendente vencido? tenta a trava de novo uma vez

processar(pedido):
  estado = retrato fresco da lista (≤ 10 min) ou GET /pedidos/vendas/{id} (404 = excluído)
  tipo = venda | pedido | ignorado | excluído
  cliente = cache de 24 h ou GET /contatos/{id} → telefone + hashes
  orders: venda → cria (recordOrder) ou atualiza; não-venda com pedido Girumo → remove
  listas do cliente → recalcula
  Meta (ligado e com pixel): InitiateCheckout e/ou Purchase ainda não enviados
  feito → pendente = false; erro → nova tentativa 1 min, 5 min, 30 min, 2 h, 12 h; depois falha visível
```

**Por que Vercel Cron e não o worker:** o worker já é o maior consumidor de saída do Supabase
(`finding-egress-supabase-e-polling-do-worker`); um ciclo a cada 5 min por loja custa algumas consultas e
o plano Pro da Vercel (13/10) permite cron por minuto. **Por que o aviso e a varredura juntos:** o aviso dá
segundos; a varredura garante que nada se perde (aviso desligado pelo Bling, Vercel fora do ar, entrega
perdida).

## 1. Regras

### Tipo do pedido

`base(s) = s.idHerdado > 0 ? s.idHerdado : s.id` (situação própria herda de uma padrão).

| Condição | Tipo |
|---|---|
| GET devolve 404, ou aviso `order.deleted` confirmado por 404 | `excluido` |
| `base = 21` (Em digitação) | `ignorado` (nada acontece até sair dela) |
| `total ≤ 0` | `ignorado` (bonificação/troca; nunca grava valor ≤ 0 em `orders` — o relatório do funil recusa) |
| `situacao.id ∈ sale_situation_ids` da loja | `venda` |
| qualquer outra (em aberto, cancelado, em andamento…) | `pedido` (lead qualificado) |

- `sale_situation_ids` padrão: toda situação com `base = 9` (Atendido), inclusive a 9 — **calculado na hora**
  sobre as situações atuais enquanto a loja não escolhe (vazio no banco = nunca escolheu). Gravar o padrão
  congelaria uma situação filha criada depois (ex. "Pago") como pedido para sempre.
- O cartão **não** deixa marcar situação com `base ∈ {12, 21}` (Cancelado, Em digitação): o PATCH recusa.
- Situações carregadas falhando: usa os ids padrão acima com os nomes padrão, só na memória (o motor
  recarrega e o padrão é recalculado). Na reconexão, falhar não apaga a lista que a loja já tinha.
- O Salvar do cartão só manda as situações quando a dona mexeu nas caixas, junto com a versão das situações que
  ela viu (hash do conteúdo da lista, guardado com a lista quando o formulário abre — a recarga de fundo do cartão
  não mexe no formulário aberto); se a lista mudou no meio, 409 "recarregue" — uma situação nova que chegou com o
  formulário aberto não vira escolha por acidente. Releitura com a mesma lista não muda a versão. Situações sem a
  versão → 400. O padrão efetivo de uma loja que nunca
  escolheu nunca é gravado.
- Pedido numa situação que a lista ainda não tem (criada há pouco): relê as situações uma vez por execução; ainda
  desconhecida → o pedido volta para a fila no recuo normal, sem contar como falha da loja (classificar sem a base
  certa poderia transformar uma venda em pedido para sempre).

### Hora da venda

- **Hora de um pedido** = a hora em que a Girumo o viu pela primeira vez (`first_seen_at`) se `order_date` é
  o dia dessa primeira vez em `America/Sao_Paulo`; senão `order_date` às 12:00 de São Paulo — e nunca depois
  de agora. A venda fica datada pelo dia do pedido, como no próprio Bling; um pedido antigo editado hoje não
  vira venda de hoje, e a nova tentativa de um pedido não muda a hora (a venda, o `created_at` e o
  `event_time` batem).
- `sale_at` = hora do pedido, gravada na primeira vez que ele é `venda` (não muda depois).
- `orders.created_at = sale_at` (o funil conta venda pela data dela).
- `event_time` do Purchase = `sale_at`; do InitiateCheckout = hora do pedido na primeira vez que ele é
  `pedido` ou `venda`.
- Evento com `event_time` mais velho que **6 dias e 23 h** não vai: status `fora_da_janela`.
- `origin` (aviso, varredura, histórico) só registra por onde o pedido chegou — vale na criação da linha e
  não muda depois; serve para o progresso do histórico, não para a hora.

### Pedido na Girumo (`orders`)

| Tipo agora | Já existe pedido Girumo? | Ação |
|---|---|---|
| `venda` | não | `recordOrder(tenant, lead, write)`: lead pela `findLeadByPhones(variantesDoTelefone(tel))`; `write` insere `orders {id, tenant_id, phone, lead_id, group_name (lead.source_group_name), campaign_id, value = total, source 'bling', created_at = sale_at}`; o lead vira "comprou"; marco `first_order` |
| `venda` | sim | atualiza `value` e `phone` se mudaram (lead/campanha não mudam) |
| `pedido`, `ignorado`, `excluido` | sim | apaga o pedido Girumo; `bling_orders.order_id = null` |
| `pedido`, `ignorado`, `excluido` | não | apaga pelo id determinístico (o órfão de uma volta que morreu antes de ligar) |

- **Nunca duplica:** o `id` da venda em `orders` é determinístico — UUID v8 dos 16 primeiros bytes de
  `sha256("bling:<loja>:<pedido>")`. A volta que morre entre criar a venda e gravar `bling_orders.order_id`
  não cria outra: o insert seguinte dá 23505 e vira update da mesma. A ligação e o status do Meta (efeitos
  que já aconteceram fora) são gravados na hora, com até 4 tentativas.
- Busca de campanha que falha reagenda o pedido (`recordOrder(…, { throwOnCampaignError: true })`): a venda
  criada sem campanha nunca mais ganharia uma. As vendas manuais seguem sem campanha nesse caso, como sempre.
- Sem telefone no contato: a venda entra com `phone = ''` (não casa no funil; conta em "sem origem").
- `orders.source = 'bling'`: `PATCH/DELETE /api/vendas/[id]` e `DELETE /api/orders` devolvem **409**
  `{"error":"venda_do_bling"}`; a tela não mostra Corrigir/Excluir.
- Venda registrada à mão **e** no Bling conta duas vezes. Sem deduplicação automática na v1: ao conectar,
  o "Registrar venda" ganha o aviso "Esta loja recebe as vendas do Bling: registre aqui só o que não passa
  pelo Bling".

### Listas (por pessoa; cada pessoa em uma só)

**Pessoa** = `phone_key` do contato; contato sem telefone é uma pessoa sozinho. Dois cadastros da mesma
cliente no Bling (vendedora que cria contato novo em vez de buscar) contam como uma pessoa: todos os
contatos dela recebem a mesma lista, e contagem e CSV contam pessoas.

| Lista | Regra (sobre os pedidos importados de todos os contatos da pessoa) |
|---|---|
| `alto_valor` | tem `venda` e `high_value` definido e `max(total das vendas) ≥ high_value` |
| `comprador` | tem `venda` (e não é alto valor) |
| `lead` | não tem `venda` e tem `pedido` |
| (nenhuma) | só `ignorado`/`excluido` |

- Recalcula o contato depois de cada pedido processado; recalcula a loja toda quando `high_value` muda.
- `lista_changed_at` registra a última troca (base para a sincronização por API da fase 2).
- Venda cancelada depois de ter contado: o contato pode voltar a `lead` na Girumo; no Meta a compra
  continua (não se desfaz), e o público de leads exclui quem fez Purchase. Diferença rara e aceita.

## 2. Dados

Uma migração `apps/web/supabase/migrations/20261013120000_integracao_bling.sql`, nos **dois** bancos, entrada
em `deploy/supabase/apply-order.txt`, `create … if not exists`, RLS ligado em tudo, baseline do gate de
drift regenerada. Conferido em dev em 13/10: nenhum objeto `bling_*` existe; `orders` não tem `source`.

```sql
create table if not exists public.bling_connections (
  tenant_id            uuid primary key references public.organizations(id) on delete cascade,
  company_id           text unique,                 -- null depois de desconectar
  company_name         text,
  status               text not null default 'ativa' check (status in ('ativa','reconectar','desconectada')),
  access_token_enc     text,                         -- AES-256-GCM (lib/security/secret-box)
  refresh_token_enc    text,
  access_expires_at    timestamptz,
  token_version        integer not null default 0,
  key_fp               text,                         -- impressão (16 hex) da chave que selou os tokens
  token_retry_at       timestamptz,                  -- nenhuma renovação antes disso (falha não definitiva)
  situations           jsonb not null default '[]'::jsonb,  -- [{id, nome, base}]
  situations_at        timestamptz,
  sale_situation_ids   bigint[] not null default '{}',
  high_value           numeric(12,2) check (high_value is null or (high_value > 0 and high_value <= 10000000)),
  meta_enabled         boolean not null default true,
  meta_campaign_id     uuid references public.campaign_groups(id) on delete set null,
  backfill_from        date,
  backfill_until       date,
  backfill_page        integer not null default 1 check (backfill_page >= 1),
  backfill_done_at     timestamptz,
  backfill_fails       integer not null default 0,   -- falhas seguidas na página do histórico (12 → pula)
  scan_cursor          timestamptz,                  -- fim da última passada completa da varredura
  scan_from            timestamptz,                  -- fim da última fatia lida inteira da passada em andamento
  scan_slice_s         integer,                      -- tamanho candidato da próxima fatia (null = 6 h)
  lease_holder         uuid,
  lease_until          timestamptz,
  paused_until         timestamptz,
  consecutive_failures integer not null default 0,
  last_webhook_at      timestamptz,
  last_scan_at         timestamptz,                  -- último avanço da varredura (fatia lida inteira)
  last_scan_change_at  timestamptz,
  last_sale_at         timestamptz,
  last_error           text,
  last_error_at        timestamptz,
  reconnect_alerted_at timestamptz,
  connected_by         uuid references auth.users(id) on delete set null,
  connected_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.bling_oauth_states (
  state_hash text primary key,                         -- sha256 hex; o state inteiro só vive no cookie
  tenant_id  uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.bling_contacts (
  tenant_id        uuid not null references public.organizations(id) on delete cascade,
  bling_contact_id bigint not null,
  name             text,
  person_type      text check (person_type in ('F','J','E')),
  phone            text,                               -- 55 + DDD + número; null = sem telefone
  phone_key        text generated always as (public.phone_key(phone)) stored,
  meta_hashes      jsonb not null default '{}'::jsonb, -- {em[],ph[],fn,ln,db,doby,dobm,dobd,ge,ct,st,zp,country,external_id}
  lista            text check (lista in ('alto_valor','comprador','lead')),
  lista_changed_at timestamptz,
  fetched_at       timestamptz not null default now(),
  primary key (tenant_id, bling_contact_id)
);
create index if not exists bling_contacts_lista_idx on public.bling_contacts (tenant_id, lista, bling_contact_id);
create index if not exists bling_contacts_key_idx   on public.bling_contacts (tenant_id, phone_key);

create table if not exists public.bling_orders (
  tenant_id        uuid not null references public.organizations(id) on delete cascade,
  bling_order_id   bigint not null,
  numero           text,
  order_date       date,
  total            numeric(12,2),
  situacao_id      bigint,
  bling_contact_id bigint,
  kind             text check (kind in ('venda','pedido','ignorado','excluido')),
  order_id         uuid unique references public.orders(id) on delete set null,
  origin           text not null default 'aviso' check (origin in ('aviso','varredura','historico')),
  first_seen_at    timestamptz not null default now(),
  sale_at          timestamptz,
  ic_status        text check (ic_status in ('enviado','fora_da_janela','sem_pixel','desligado','sem_dados','erro')),
  ic_sent_at       timestamptz,
  purchase_status  text check (purchase_status in ('enviado','fora_da_janela','sem_pixel','desligado','sem_dados','erro')),
  purchase_sent_at timestamptz,
  meta_error       text,
  origem           text check (origem in ('anuncio','grupo','sem_origem')),
  origem_detalhe   text,
  snapshot         jsonb,
  snapshot_at      timestamptz,
  pending          boolean not null default true,
  low_priority     boolean not null default false,     -- pendência só do histórico: vai depois da venda ao vivo
  attempts         integer not null default 0,
  next_try_at      timestamptz not null default now(),
  last_error       text,
  updated_at       timestamptz not null default now(),
  primary key (tenant_id, bling_order_id)
);
create index if not exists bling_orders_pending_idx on public.bling_orders (tenant_id, low_priority, next_try_at) where pending;
create index if not exists bling_orders_contact_idx on public.bling_orders (tenant_id, bling_contact_id);
create index if not exists bling_orders_recent_idx  on public.bling_orders (tenant_id, order_date desc, bling_order_id desc);

alter table public.orders
  add column if not exists source text not null default 'manual' check (source in ('manual','bling'));
```

**Funções** (todas `security invoker` — o tenant vem de quem chama, então definer com EXECUTE vazado seria cross-tenant —, `set search_path = ''`, `revoke execute … from public, anon,
authenticated`, `grant execute … to service_role`, conferidas com `has_function_privilege`):

- `bling_claim(p_tenant uuid, p_holder uuid, p_seconds integer) returns boolean` — pega a trava se
  `status = 'ativa'`, livre ou vencida (ou já do mesmo `p_holder`) e fora de `paused_until`; usa `now()` do
  banco (sem relógio do servidor). `p_seconds` entre 10 e 600.
- `bling_release(p_tenant uuid, p_holder uuid) returns void` — solta só se o dono for `p_holder`.
- `bling_enqueue(p_tenant uuid, p_origin text, p_items jsonb) returns integer` — a fila num comando só:
  `aviso` insere ou marca pendente e **apaga o retrato** (o processamento faz GET); `varredura` insere ou, se
  situação/total/contato diferem do último processado, troca o retrato e marca pendente — e reabre a linha
  `excluido` fora da fila que a lista ainda mostra (um 404 transitório a marcou); `historico` só insere o que
  não existe, com `low_priority` (aviso e varredura que tocam a linha tiram). `origin` só vale na criação da
  linha. Devolve quantas linhas mudaram.
- `bling_recompute_lists(p_tenant uuid, p_contact bigint default null) returns integer` — aplica §1 Listas
  (a pessoa do contato, ou a loja toda), atualiza `lista_changed_at` só quando muda; devolve quantos mudaram.
- `bling_resumo(p_tenant uuid) returns jsonb` — números do cartão (vendas e vendido em 30 dias, origem,
  estado dos eventos do Meta, falhas = pedidos com `last_error` pendentes ou não, pendentes, pedidos lidos
  do histórico, pessoas por lista), tudo agregado no banco.

**RLS e privilégios:** as quatro tabelas com RLS ligado e **sem policy e sem grant para
`authenticated`** (como `site_integrations`/`ad_spend`): tudo passa pelas rotas com `getSupabaseAdmin` e
`.eq('tenant_id', …)`. `anon` coberto pelo `ensure_anon_revoked`; conferir depois. `orders.source`: a
coluna nova herda os grants da tabela.

## 3. Fluxos

### Conectar

1. `POST /api/integracoes/bling/conectar` (chamada do painel, com o Bearer e o `x-tenant-id` de sempre) —
   `getRouteTenantContext`, permissão `settings:connection` (owner/admin). Sem `BLING_CLIENT_ID`/
   `BLING_CLIENT_SECRET`/`INTEGRATIONS_ENCRYPTION_KEY` → 503.
   Gera `state` (32 bytes, base64url), grava `bling_oauth_states(sha256(state), tenant, user,
   now()+10 min)` (apaga os vencidos da loja), põe o cookie `bling_oauth_state` (HttpOnly, Secure,
   SameSite=Lax, `Path=/api/integracoes/bling`, 10 min) e responde `{ url }` com
   `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=…&state=…`; o painel navega
   para lá. (POST e não link: o painel autentica por Bearer, que uma navegação não carrega, e a loja certa
   vem do `x-tenant-id` de quem tem mais de uma.)
2. `GET /api/integracoes/bling/retorno` — **sem sessão**: é uma navegação vinda do Bling, que não carrega o
   Bearer do painel. Autenticado pelo par `state` (parâmetro) + cookie, como manda o OAuth: o `state` é de
   uso único, vale 10 min e guarda a loja e o usuário que pediram (validados com permissão no passo 1).
   Na política de acesso: `public-rate-limited`, 20/min por IP.
   - `?error=…` → volta ao cartão com `?secao=integracoes&bling=recusado`.
   - Cookie ≠ `state` (tempo constante) ou ausente → `bling=sessao`.
   - **Consome** o state: `delete … where state_hash = $1 and expires_at > now() returning tenant_id,
     user_id` — só um retorno passa; o segundo (duplo clique, reload) cai em `bling=sessao` **sem** trocar o
     `code` de novo (reusar revoga a loja no Bling). Confere de novo que o usuário do state ainda é
     owner/admin da loja do state (membership aceita).
   - Troca o `code` (`authorization_code`, `enable-jwt: 1`); `GET /empresas/me/dados-basicos` →
     `company_id`, nome.
   - `company_id` já ligado a **outra** loja → `bling=outra_loja` (não grava tokens; revoga o token recém-emitido).
   - Upsert de `bling_connections`: tokens cifrados com a impressão da chave (`key_fp`), `status 'ativa'`,
     `token_version + 1`, `backfill_from = hoje − 90`, `backfill_until = hoje`, `backfill_page = 1`,
     `backfill_done_at = null`, `scan_cursor = now()`, falhas zeradas, `reconnect_alerted_at = null`.
     Reconexão mantém ajustes e histórico; só reabre o histórico se nunca terminou; **não solta a trava** (a
     execução em curso adota o par novo no lote seguinte).
   - Carrega as situações (falhou → grava `[]` sem hora; o motor recarrega na 1ª execução).
     `sale_situation_ids` vazio = a loja nunca escolheu = **padrão calculado na hora** sobre as situações
     atuais (§1); o padrão nunca é gravado.
   - 302 para `/painel/configuracoes?secao=integracoes&bling=conectado` e `after(sincronizar(loja,
     'conexao'))`.
   - Erro na troca/empresa → `bling=erro` (log com `error.type`, sem token). A tela mostra mensagem para cada
     `bling=` (exigência da homologação: interface amigável de sucesso e erro).

### Aviso (webhook)

`POST /api/integracoes/bling/webhook` (público, `webhook` na política de acesso):

1. Corpo cru até 64 KB (maior → 413). `X-Bling-Signature-256` confere com HMAC do corpo e o
   `BLING_CLIENT_SECRET` → senão **401**.
2. JSON + zod: `{eventId: string, event: string, companyId: string, data: {id: number|string}}`. Inválido →
   **200** e log (assinatura boa = é o Bling; 4xx repetido faria o Bling desligar o webhook de todas as lojas).
3. `event` fora de `order.created|order.updated|order.deleted` → 200.
4. `companyId` → `bling_connections` (qualquer status; desconectada/desconhecida → 200 e nada).
5. Upsert em `bling_orders (tenant, id)`: `pending = true`, `next_try_at = now()`, `attempts = 0`; linha nova
   ganha `origin = 'aviso'`. `last_webhook_at = now()`.
6. **200** e `after(sincronizar(loja, 'aviso', 45 s))`.

### Varredura, histórico e drenagem (cron)

`GET /api/cron/bling` a cada 5 min (`*/5 * * * *` no `vercel.json`, `isCronAuthorized`, `maxDuration =
300`). Lojas `ativa` fora de `paused_until`, ordenadas por `last_scan_at nulls first`, **em sequência**;
orçamento total 270 s; cada loja até 60 s, ou até 150 s se tem histórico pendente. Cada loja recebe também a vida
que resta à função (300 s menos o já gasto): chamada externa que tem efeito (Meta, `/oauth/token`) só começa se o
timeout inteiro cabe antes disso — nunca é encurtada (abortar uma chamada que o outro lado concluiu reenviaria
evento ou perderia o refresh rotacionado).

- **Varredura** — o Bling pagina por **posição**: entre duas leituras, o pedido que muda de novo sai da janela,
  a lista anda para trás e o primeiro da página seguinte cai numa página já lida. Por isso ela **nunca
  pagina entre execuções**: anda em **fatias de tempo, cada uma lida inteira** (página 1 até a vazia) numa
  execução só, e o progresso guardado é sempre o fim de uma fatia lida inteira (`scan_from`).
  - Passada nova (sem `scan_from`, e `last_scan_at` < agora − 4 min): de `max(scan_cursor, agora − 72 h) −
    4 h` até agora. A sobra de 4 h cobre o fuso não documentado do filtro; o teto de 72 h é o tempo que o
    Bling retenta o aviso. Passada em andamento: continua de `scan_from` sem esperar (nunca antes de
    agora − 76 h: um trecho que falha para sempre acaba saindo da janela).
  - Fatias `GET /pedidos/vendas?dataAlteracaoInicial=…&dataAlteracaoFinal=…&pagina=N&limite=100` (hora de
    São Paulo) com o tamanho candidato guardado em `scan_slice_s` (6 h no começo): inteira (veio a página vazia) →
    grava `scan_from = fim` (ou, na última, `scan_cursor = fim` e `scan_from = null`) e o candidato dobra; 10
    páginas cheias → metade, de novo da página 1. No piso de 1 min lê até a página vazia sem o teto de 10 páginas
    (um lote de NF-e que mexe em 1000 pedidos num minuto não para a varredura). Fatia interrompida (falha,
    orçamento) não grava nada, é relida inteira e o tamanho guardado volta a no máximo 6 h.
  - Varredura e histórico só começam uma página se sobra mais que a reserva da fila (`max(30 s, metade do
    orçamento da rodada)`), e cada página tem prazo próprio (fim − 22 s: os 20 s que uma linha da fila exige mais a
    folga do timer e da gravação da página): página lenta para a varredura sem contar erro, e a fila sempre drena.
  - Cada item vai para `bling_enqueue('varredura')`, que só marca pendente o que mudou; item torto com id vai
    como `aviso`. Se marcou algo → `last_scan_change_at = now()`. `last_scan_at` = último avanço: sem avanço há
    mais de 1 h (falha, lentidão ou piso) vira aviso no cartão, que sai sozinho quando volta a andar.
- **Histórico** (se `backfill_done_at` nulo): `dataInicial=backfill_from&dataFinal=backfill_until&pagina=
  backfill_page`, até 3 páginas por execução **começando uma antes** de onde a anterior parou (pedido apagado
  no meio desloca a lista; reler não duplica); itens viram linhas `origin = 'historico'` com `snapshot` e
  `low_priority`; página vazia → `backfill_done_at = now()`; página que falha → `last_error`. A relida que falha
  não impede a frente. Na 12ª falha seguida da frente (`backfill_fails`) tenta a seguinte: respondeu → a da frente
  está quebrada e é pulada com aviso (só o histórico perde aquela página); falhou também → não pula (é o Bling ou a
  consulta, não a página) e o cartão avisa "histórico parado". Página nunca é pulada sem a seguinte provar que a
  consulta funciona — uma queda do Bling não apaga histórico. A falha da frente só conta quando outra listagem
  respondeu na mesma execução (varredura ou relida): uma queda total nunca arma a válvula; a parada zera a conta, e o
  aviso sai do cartão quando a frente volta a andar.
- **Drenagem:** linhas `pending and next_try_at <= now()` em lotes de 20 por `low_priority, next_try_at` (a
  venda ao vivo não espera o histórico). A trava é renovada a cada lote; perdeu → para. Cada lote **lista os
  pendentes antes de reler a conexão**, e o Salvar do cartão **grava o ajuste antes de reabrir** os pedidos (se a
  reabertura falha, desfaz a gravação e responde 500): linha listada depois da reabertura sempre vê o ajuste novo;
  linha listada antes tem o `updated_at` trocado pela reabertura e a gravação guardada falha — volta para a fila.
  A reabertura inclui a linha na fila ainda sem dia (histórico importando).

### Processar um pedido

- **Estado:** `snapshot` presente → usa (é sempre o último retrato da lista: a varredura troca quando muda,
  o aviso apaga); ausente → `GET /pedidos/vendas/{id}` (404 → `excluido`). Sem idade-limite para o retrato:
  pedido do histórico na fila há 1 h não paga um GET a mais.
- **Histórico:** só busca a próxima página quando a fila da loja tem menos de 300 pendentes.
- **Contato** (tipo `venda` ou `pedido`): `bling_contacts` com `fetched_at` < 24 h → usa; senão
  `GET /contatos/{id}` → `dados-do-cliente` (§4) → upsert. 404 → segue sem dados.
- **orders** (§1) → **Meta** (§4) → **grava** o estado processado (tipo, contato, total, situação,
  `order_id`, `sale_at`, origem, status dos eventos, e o **retrato = o estado usado**) → **listas**
  (`bling_recompute_lists(loja, contato)` e do contato anterior, se mudou). A lista lê o que está gravado
  em `bling_orders`: recalcular antes de gravar deixaria a lista um pedido atrasada.
- Rede de segurança das listas: toda execução de cron que processou algo termina com
  `bling_recompute_lists(loja)` (loja toda), e o fim do histórico também.
- **Páginas** (varredura e histórico): lê até vir uma página **vazia**. `listarPedidos` descarta item
  malformado, então "menos de 100" não prova que acabou.
- **Sucesso:** `pending = false`, `attempts = 0`, `last_error = null`, campos do estado gravados.
- **Erro do pedido:** `attempts + 1`, `next_try_at = now() + [1 min, 5 min, 30 min, 2 h, 12 h][attempts]`;
  na 6ª falha `pending = false` com `last_error` (aparece como falha no cartão; uma alteração nova do pedido
  o reabre).

### Cliente HTTP do Bling (um por execução e loja)

- Base `https://api.bling.com.br/Api/v3`; headers `Authorization: Bearer`, `enable-jwt: 1`,
  `Accept: application/json`; timeout 15 s; **350 ms entre chamadas**.
- 429 → espera 1 s, 2 s, 4 s; ainda 429 → `RateLimited` (para a execução da loja; volta no próximo cron).
- 5xx, rede, timeout → até 2 novas tentativas (1 s, 3 s) → `Transient`.
- 401 → renova o token uma vez (se não acabou de renovar) e repete; de novo 401 → **transitório** (a
  renovação deu certo, então a concessão está viva: é incidente do Bling ou proxy). Uma renovação forçada por
  execução; a segunda relê a conexão (a dona pode ter reconectado) sem chamar `/oauth/token`.
- 403 com o erro do Bling → `MissingScope` (configuração do app; aparece no cartão); sem o corpo do Bling →
  transitório (bloqueio de IP, WAF).
- 404 → `NotFound` (para quem chamou decidir), com qualquer corpo. Um 404 falso (proxy) que marca uma venda como
  excluída se cura sozinho: a varredura reabre a linha `excluido` que a lista do Bling ainda mostra. Tratar o 404
  sem corpo como transitório deixaria a venda apagada de verdade em `orders` e alimentaria o disjuntor.
- Prazo da execução esgotado é um campo do erro (`prazoEsgotado`), não falha: para a rodada sem gastar
  tentativa do pedido nem passo do disjuntor.
- Disjuntor: 5 falhas seguidas (`Transient`/`RateLimited`) na execução → `paused_until = now() + 15 min ×
  2^(n−1)` até 2 h, `consecutive_failures + 1`; sucesso zera. Mais de 20 erros numa execução → para (longe
  dos 300/10 s do bloqueio de IP).

### Token

- Renova quando `access_expires_at < now() + 30 min`, sempre dentro da trava.
- Antes de chamar `/oauth/token`: `checkRateLimit("bling:oauth-token", 10, 60_000)` (Upstash, todas as
  lojas e instâncias) → bloqueado = pula a loja nesta execução (o token ainda vale ≥ 25 min).
- Antes de renovar, relê a conexão: `token_version` mudou → adota o par do banco sem chamar `/oauth/token`.
- Grava com `update … where tenant_id = $1 and token_version = $lido` (+1), com até 4 tentativas. Zero
  linhas = outro processo renovou: relê e segue. **Não gravou mesmo assim:** o refresh velho já morreu no
  Bling, então o par novo fica em memória, é regravado a cada lote e antes de soltar a trava, e a execução
  não abre outra rodada lendo o par velho.
- Falha não definitiva do `/oauth/token` → `token_retry_at = agora + 5 min` (nenhuma renovação antes; o token
  atual segue se ainda vale). Upstash fora: o limitador global cai para um balde em memória de **1 renovação por
  minuto por instância** (nem N×10/min, que bloquearia o IP, nem zero, que pararia todas as lojas). Renovação
  barrada com o token já sem vida → `last_error` no cartão. O aviso de renovação (barrada ou falha) sai do cartão
  na primeira renovação que dá certo.
- `invalid_grant`/`invalid_token`/`UNAUTHORIZED_ERROR` na renovação: relê (na hora, em 2 s e em 5 s — outro
  processo pode estar gravando o par que acabou de rotacionar); se `token_version` mudou, segue com o novo;
  senão `status = 'reconectar'`, `last_error`, e e-mail aos donos uma vez (`reconnect_alerted_at`; se nenhum
  e-mail sai, o alerta volta a nulo e o cron tenta de novo).
- Token que não abre com a chave atual: `key_fp` gravado diferente → é a chave do servidor que mudou (problema
  da Girumo): `last_error` e a loja para, **sem** reconectar nem e-mail. Senão, reconectar.
- O `retorno` também consome o orçamento (não espera: o `code` vence em 1 min).

### Desconectar

`DELETE /api/integracoes/bling` (owner/admin): revoga no Bling (`POST /oauth/revoke` com o refresh token,
melhor esforço), apaga tokens, `company_id = null`, `status = 'desconectada'`, solta a trava. Pedidos,
contatos e vendas importadas ficam.

## 4. Meta

### Dados do cliente (`lib/meta/dados-do-cliente.ts`, puro)

Normaliza como o SDK oficial (`facebook_business/adobjects/serverside/normalize.py` — conferir no código do
SDK ao implementar) e devolve os hashes SHA-256 hex:

| Campo | Origem no Bling | Normalização |
|---|---|---|
| `ph` (lista) | `celular`, `telefone` | dígitos; `telefoneCanonico` (55 + DDD + número); celular com e sem o 9 (`variantesDoTelefone` só as com 55) |
| `em` (lista) | `email`, `emailNotaFiscal` | separar por `, ; espaço`, aparar, minúsculas, validar `x@y.z`, sem repetição |
| `fn`, `ln` | `nome` (só `tipo F`) | minúsculas, sem pontuação, acento mantido; primeiro e último nome |
| `db` | `dadosAdicionais.dataNascimento` (só F) | `YYYYMMDD`; também `doby` `YYYY`, `dobm` `MM`, `dobd` `DD` para o CSV |
| `ge` | `dadosAdicionais.sexo` (só F) | `m`/`f` |
| `ct` | `endereco.geral.municipio` | minúsculas, sem dígitos, pontuação e espaços |
| `st` | `endereco.geral.uf` | sigla em minúsculas (`sp`) |
| `zp` | `endereco.geral.cep` | 8 dígitos |
| `country` | `pais.nome` vazio ou Brasil → `br`; outro → sem país | ISO-2 minúsculo |
| `external_id` | `phone_key` | hash |

Cliente PJ (`tipo J`) e `E` (estrangeiro) não leva `fn/ln/db/ge`. Nada em texto é guardado além de
`name` e `phone` (já são dados da Girumo); o resto vive só como hash em `bling_contacts.meta_hashes`.
Isso é **minimização, não anonimização**: nascimento, sexo, UF e CEP são reversíveis por força bruta.

### Eventos

| Evento | Quando | `event_id` | `custom_data` |
|---|---|---|---|
| `InitiateCheckout` | primeira vez que o pedido é `pedido` ou `venda` | `bling-ic-<bling_order_id>` | `value`, `currency: "BRL"`, `order_id: numero` |
| `Purchase` | primeira vez que é `venda` | `bling-<bling_order_id>` | `value`, `currency: "BRL"`, `order_id: numero`, `origem`, `faixa` |

- `action_source: "chat"`, `user_data` = hashes do contato + `fbc`/`fbp` do cadastro mais recente da mesma
  `phone_key` em `site_captures` (até 90 dias antes) quando houver.
- `origem`: `anuncio` (há cadastro com `utm_campaign` na janela de 90 dias), `grupo` (há lead com a
  chave), `sem_origem`. `faixa`: `alto` se `high_value` definido e `total ≥ high_value`; senão `normal`.
- Os dois eventos do mesmo pedido saem num envio só. Um evento por pedido nunca é reenviado depois de
  `enviado` (dedup servidor × servidor não é documentada).
- Status por evento: `enviado`; `fora_da_janela` (> 6 d 23 h); `desligado` (`meta_enabled = false`);
  `sem_pixel`; `sem_dados` (nenhum de em/ph/external_id/fbc/fbp); `erro` (mensagem de `descreveErro` em
  `meta_error`, tenta de novo com o pedido).
- **Pixel:** `meta_campaign_id` definido → `readIntegracoes(campanha.metadata).meta` (pixel + token +
  `test_code`); senão, se as campanhas da loja com pixel e token configurados usam **um único** pixel, ele;
  senão `sem_pixel` e o cartão pede para escolher.
- Reaproveita `sendCapiEvent`/`descreveErro`/`capiEndpoint` de `lib/campaigns/meta-capi.ts`, generalizando o
  tipo do payload e a regra de sinal (`temSinalDeCasamento` passa a aceitar `em`/`ph`/`external_id`).

### Públicos (receita mostrada no cartão; criados uma vez no Gerenciador)

1. **Alto valor** — Purchase · últimos 180 dias · parâmetro `faixa` = `alto`.
2. **Compradores** — Purchase · últimos 180 dias · excluindo o público 1.
3. **Leads qualificados** — InitiateCheckout · últimos 180 dias · excluindo quem fez Purchase em 180 dias.

Se o Gerenciador não permitir filtrar por `faixa` em evento `chat`, a receita 1 usa `value ≥ X` (anotado
no PR da tela depois da prova com a piloto).

### CSV por lista (histórico)

`GET /api/integracoes/bling/lista?l=alto_valor|comprador|lead` (owner/admin): `text/csv`, colunas
`email,email,phone,phone,phone,fn,ln,ct,st,zip,country,doby,dobm,dobd,gen,extern_id` com os hashes (vazio
quando não há), lidas de `bling_contacts` em páginas de 1000 por `bling_contact_id` (sem o corte do
PostgREST). Nome `girumo-<lista>-<AAAA-MM-DD>.csv`.

## 5. API (resumo)

| Rota | Quem | Faz |
|---|---|---|
| `POST /api/integracoes/bling/conectar` | owner/admin | state + cookie, devolve a URL do Bling |
| `GET /api/integracoes/bling/retorno` | state + cookie (sem sessão) | troca o code, grava, volta ao cartão |
| `POST /api/integracoes/bling/webhook` | Bling (assinatura) | marca pedido, 200, processa depois |
| `GET /api/cron/bling` | Vercel Cron | varredura, histórico, drenagem |
| `GET /api/integracoes/bling` | owner/admin | estado do cartão (sem token) |
| `PATCH /api/integracoes/bling` | owner/admin | ajustes |
| `DELETE /api/integracoes/bling` | owner/admin | desconectar |
| `GET /api/integracoes/bling/lista` | owner/admin | CSV |

- **`GET`** devolve: `{ disponivel, conexao: null | { status, empresa, conectada_em, ultima_venda_em,
  tempo_real: 'ok'|'parado', ultimo_erro }, historico: { lidos, concluido }, ajustes: { situacoes:
  [{id, nome, base, conta, bloqueada}], high_value, meta_enabled, pixel: { escolhido, opcoes: [{campaign_id,
  campanha, pixel_id}] } }, numeros_30d: { vendas, vendido, com_origem: {anuncio, grupo}, sem_origem,
  meta: {enviadas, fora_da_janela, falhas} }, listas: { alto_valor, comprador, lead }, ultimas: [ { hora,
  cliente, telefone_mascarado, valor, origem, meta, situacao } ] }`. `tempo_real = 'parado'` quando
  `last_webhook_at < now() − 6 h` e `last_scan_change_at > last_webhook_at` (ou nunca houve aviso e a
  varredura achou mudança). Contagens por `count: 'exact', head: true` ou somas no banco — nunca listas
  cortadas em 1000.
- **`PATCH`** (zod `.strict()`): `sale_situation_ids` (ids conhecidos, nenhum com base 12/21, ≥ 1),
  `high_value` (null ou 0 < v ≤ 10.000.000), `meta_enabled` (bool), `meta_campaign_id` (null ou campanha da
  loja com pixel e token). Mudou `sale_situation_ids` → pedidos da janela de 90 dias voltam a pendente
  (reclassificação). Mudou `high_value` → `bling_recompute_lists(loja)`.
- Vendedora: nenhuma rota nova no mapa dela (`lib/auth/modulos.ts` é fechado por padrão).
- Política de acesso: `POST /api/integracoes/bling/webhook` em `PROVIDER_WEBHOOKS`; `/api/cron/bling` na lista
  de crons; o resto é rota autenticada comum.

## 6. Telas (ver mockup)

- **Configurações › Integrações › Bling**, abaixo de "Site próprio" (porta do #443).
  - Não conectado: promessa, 3 linhas do que acontece, "Conectar Bling", nota "só leitura" e "importamos os
    últimos 90 dias".
  - Importando: barra indeterminada com "N pedidos lidos" (o Bling não informa o total); vendas novas já
    entram.
  - Conectado: estado ("Recebendo · última venda há N min"), números de 30 dias, últimas 8 vendas
    (cliente com telefone mascarado, valor, origem, Meta, situação), links para Vendas e Ajustes.
  - Ajustes: checklist de situações (Cancelado e Em digitação travadas, com a explicação), valor alto,
    enviar ao Meta + pixel, nota de hash, "Salvar ajustes", "Desconectar Bling".
  - Listas: 3 contadores com regra e "Baixar CSV para o Meta", receita dos 3 públicos.
  - Alertas: âmbar "Tempo real parado" (as vendas seguem pela varredura); vermelho "O Bling recusou o
    acesso" com "Reconectar Bling".
  - Retorno: mensagem para cada `?bling=` (conectado, recusado, sessao, outra_loja, erro).
  - Indisponível (variáveis faltando): "Integração indisponível no momento".
- **Vendas:** selo "Bling"; venda do Bling sem Corrigir/Excluir ("Altere no Bling"); "Registrar venda" com o
  aviso de não duplicar quando a loja tem Bling ativo.
- Tema G2 da porta de Integrações (mesmos componentes do Site próprio).

## 7. Erros e bordas

| Caso | Comportamento |
|---|---|
| Aviso duplicado / fora de ordem | Uma linha por pedido; processamento lê o estado atual |
| Girumo fora do ar por horas | O Bling retenta 3 dias; a varredura de 4 h pega o resto ao voltar |
| Bling desliga o webhook | Vendas seguem pela varredura (≤ 5 min); cartão "tempo real parado"; reativar no cadastro do app |
| 429 do Bling | Recuo 1/2/4 s; persiste → próxima execução; disjuntor |
| Renovação recusada | `reconectar`, e-mail aos donos uma vez, "Reconectar Bling" |
| Duas renovações ao mesmo tempo | Impossível sob a trava; versão impede sobrescrever |
| Retorno chamado duas vezes | O segundo não troca o `code` (state consumido) |
| Mesma conta Bling em duas lojas | Recusado no retorno (`company_id` único) |
| Pedido sem telefone | Entra sem casar (sem origem); Meta com e-mail se houver, senão `sem_dados` |
| Contato apagado no Bling | Segue sem dados do cliente |
| Total ≤ 0 | `ignorado` (nunca vai a `orders`) |
| Pedido apagado no Bling | `excluido`: some de `orders` |
| Venda cancelada depois de enviada ao Meta | Some do funil; no Meta fica |
| Loja troca as situações de venda | Reclassifica a janela de 90 dias |
| Loja sem pixel configurado | `sem_pixel`; cartão manda configurar numa campanha |
| Variáveis do Bling ausentes | Rotas 503; cartão "indisponível"; cron não faz nada |
| Venda registrada à mão e no Bling | Conta duas vezes (aviso na tela; dedup fora da v1) |

## 8. Segurança e LGPD

- Tokens cifrados com AES-256-GCM (`lib/security/secret-box.ts`): `v1.<iv>.<tag>.<cifra>` em base64url, IV de
  12 bytes aleatório por cifra, chave de 32 bytes em `INTEGRATIONS_ENCRYPTION_KEY` (base64). Cifra adulterada
  ou chave errada → erro (nunca devolve lixo). Token nunca sai do servidor nem vai para log.
- `state` de 32 bytes, só o hash no banco, uso único, 10 min, preso à loja e ao usuário.
- Webhook: HMAC em tempo constante; corpo ≤ 64 KB; nada do corpo vai para log além de `event` e ids.
- Toda query com `.eq('tenant_id', …)`; tabelas novas sem grant para `authenticated`.
- Telefone mascarado em toda resposta do cartão; e-mail, nascimento e endereço nunca em texto.
- `owner/admin` para tudo; vendedora fora.
- LGPD: a loja é a controladora; a Girumo opera. O cartão explica o envio ao Meta (hash) e permite desligar;
  termos/privacidade precisam citar a operação (pendência do Igor).

## 9. Testes

- **Unidade** (`node:test` via tsx):
  - secret-box (ida e volta, adulteração, chave errada, formato);
  - URL de autorização e corpo/headers da troca e da renovação;
  - assinatura (válida, inválida, prefixo, tamanho);
  - parser do aviso;
  - classificação (base herdada, 21, total ≤ 0, padrão de venda, bloqueio de 12/21);
  - hora da venda e janela de 7 dias;
  - dados do cliente (cada campo, PJ, e-mails múltiplos, celular com e sem 9, país);
  - payload dos eventos (`chat`, listas, `origem`, `faixa`, `event_id`);
  - escolha do pixel;
  - recuo e disjuntor do cliente HTTP (fetch e relógio falsos);
  - motor com dependências falsas:
    - venda nova → `orders`;
    - venda → cancelada → remove;
    - aviso duplicado → um pedido;
    - 404 → excluído;
    - `invalid_grant` → reconectar;
    - versão de token mudou → segue;
    - orçamento acaba → solta a trava.
- **Store com PostgREST falso** (técnica registrada): o aviso não muda `origin` de linha existente; o
  histórico não sobrescreve linha existente; a varredura só marca o que mudou.
- **Integração no banco de dev** (job e2e, depois de o `migrate-dev` aplicar a migração):
  - `bling_claim` concorrente (dois donos → um ganha; vencida → outro pega);
  - `bling_release` de dono errado não solta;
  - `bling_recompute_lists` nos 4 casos + troca de `high_value`;
  - `orders.source` padrão `manual`;
  - privilégios (`authenticated` sem execute nas 3 funções, sem select nas 4 tabelas).
- **E2E** (Playwright, CI): cartão "não conectado" para o dono; vendedora recebe 403 nas rotas novas; venda
  com `source = 'bling'` aparece com selo e sem Corrigir/Excluir (fixture criada pela service-role).
- **Prova em prod** (card): loja piloto conecta; uma venda criada no Bling aparece em `orders` em < 1 min,
  no cartão e na aba Anúncios; o Events Manager mostra o Purchase recebido; CSV abre no Meta.

## 10. PRs (um por coisa)

| # | Conteúdo | Depende de |
|---|---|---|
| 1 | Migração (§2) + `apply-order` + baseline + teste de integração das funções | — |
| 2 | Núcleo Bling (puro): `secret-box`, `bling/oauth`, `bling/cliente`, `bling/api`, `bling/aviso`, `bling/classificar` | — |
| 3 | Núcleo Meta (puro): `meta/dados-do-cliente`, generalização de `meta-capi`, `bling/eventos-meta` | — |
| 4 | Conexão: stores de conexão e state, conectar/retorno/desconectar, política de acesso do retorno | 2 |
| 5 | Motor: stores de pedidos e contatos, projeção em `orders`, processar, sincronizar, e-mail de reconectar | 2, 3, 4 |
| 6 | Entrada: aviso (webhook) + cron + `vercel.json` + política de acesso | 5 |
| 7 | API do cartão (`GET/PATCH`) e CSV das listas | 4, 5 |
| 8 | Vendas: servidor (`source`, 409, `blingAtivo`) e tela (selo, sem Corrigir, aviso) | 1 (DDL) |
| 9 | Tela do cartão em Configurações › Integrações + E2E | 7 |

PRs 2–7 e 9 entram em `main` antes da DDL sem quebrar nada: sem as variáveis do Bling as rotas devolvem
503 (o `GET` do cartão responde "indisponível" sem consultar o banco) e o cron não toca no banco. A DDL do
PR 1 é aplicada pelo CI (#455, 15/10): o `migrate-dev` aplica em dev no próprio PR, a baseline do drift é
regerada lendo dev depois disso e entra no PR, e o `migrate-prod` aplica em prod no merge. O PR 8 só entra
depois de o `migrate-prod` do PR 1 terminar com sucesso (ele lê `orders.source`, que a tela de Vendas usa ao vivo).

## 11. Pendências do Igor (roteiro)

1. **Criar o app no Bling** (Central de Extensões › Área do Integrador › Criar aplicativo), **visibilidade
   Pública**:
   - Link de redirecionamento: `https://app.girumo.com.br/api/integracoes/bling/retorno`.
   - **Escopos (só leitura), todos de primeira** — mudar depois desconecta todas as lojas: Pedidos de
     Venda, Contatos, Dados básicos da empresa, Situações (módulos), Vendedores.
   - Aba Webhooks: servidor `https://app.girumo.com.br/api/integracoes/bling/webhook`; recurso Pedido de
     Venda (`order`): `created`, `updated`, `deleted`; versão v1.
2. **Vercel (projeto `girumo`, Production):** `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`,
   `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes aleatórios em base64; gerar uma vez e nunca trocar sem migrar os
   tokens).
3. Publicar os PRs na ordem 5, 6, 7, 9, 1, 8 (a DDL do 1 vai pelo CI, nunca à mão).
4. Termos/privacidade: citar o envio de dados de clientes ao Meta em hash.
5. **Homologação** antes da 11ª loja: logo, descrições, categoria, homepage sem login, manual, vídeo; teste
   técnico (roteiro no plano); revisão.

## Limites conhecidos (aceitos nas revisões)

- Histórico: se a página relida falha justo na execução seguinte a um pedido apagado no Bling, um pedido antigo pode
  escorregar para a página já lida e não entrar (duas coisas raras ao mesmo tempo; o fluxo ao vivo não passa por aí).
- Histórico: duas páginas que o Bling nunca consegue devolver, uma atrás da outra, param a importação (aviso no
  cartão); uma página quebrada com a seguinte vazia é pulada (era a última e não pode ser lida).
- Varredura: um único minuto com mais pedidos alterados do que cabem nas páginas de uma execução para a varredura até
  o teto de 76 h, com aviso no cartão em 1 h (as vendas novas seguem pelo aviso).
- Aviso (60 s): com o Bling a ~12 s por página, a última página da fatia pode não caber; vira "sem tempo" e o cron
  pega (troca aceita para a fila sempre drenar).
- Cartão: a versão das situações é o hash da lista na ordem em que o Bling a devolve; se um dia ele devolver a
  mesma lista em outra ordem, o Salvar aberto naquela hora recebe 409 e basta recarregar.
- Cartão: se a reabertura dos pedidos falha, o Salvar desfaz o ajuste e responde 500; um lote que releu a conexão
  nesse intervalo pode ter classificado até 20 pedidos da fila com o ajuste novo (ficam assim até o próximo Salvar
  que dê certo ou até mudarem no Bling). Se a reabertura e o desfazer falham juntos, o ajuste novo fica gravado sem
  reabrir os 90 dias, e salvar o mesmo ajuste de novo não reabre. O desfazer também pode reverter o Salvar de outra
  aba que caia no mesmo intervalo. Tudo pede falha do banco no meio do Salvar (revisão R5).
- Histórico: se a falha foi na página vazia do fim, o aviso "parou" fica no cartão até vencer (24 h), com a
  importação já concluída (revisão R5).

## Fora da v1

- Sincronização das listas pela API do Meta (fase 2 do funil: app do Meta com Full access).
- Mapear o vendedor do Bling (`vendedor.id`) para a vendedora da Girumo.
- Deduplicar venda lançada à mão e no Bling.
- Itens do pedido (`order_items`) e `contents` do Purchase para catálogo.
- Webhook de contato (o Bling não tem; contato vem com o pedido).
