# API_CONTRACTS

## Existente (devzap-groups, Next route handlers)

### GET /r/:slug
Resolve um clique p/ um grupo. Conta o clique humano (UTM/referer/UA → clicks.ndjson; bots não contam).
Dois modos, nesta ordem:
- **slug de LINK** → destino fixo. Se `clickCap` definido e já atingido → `200` página "grupo cheio"
  (NÃO redireciona). Senão `302` → `destinationUrl` (ou intersticial do Pixel, se houver).
- **slug de CAMPANHA** (link mestre) → `302` → convite do **próximo grupo disponível** do pool
  (preenchimento sequencial, pula cheios e sem-convite). Todos cheios → `200` página "grupos cheios".
- slug inexistente → `404`. O clique do mestre grava `target` (JID do grupo escolhido) p/ atribuição.

### GET /api/links
→ `200` `TrackedLink[]` com `clicks: number`, ordenado por cliques desc.
`TrackedLink = { id, slug, destinationUrl, targetGroupName, campaignName, pixelId?, clickCap?, createdAt }`

### POST /api/links
Body: `{ destinationUrl (https, obrigatório), slug?, targetGroupName?, campaignName?, pixelId?, clickCap? }`
→ `201` TrackedLink | `400` inválido | `409` slug duplicado.
Slug é normalizado (slugify) a partir de slug/campaign/group. `clickCap` = inteiro > 0 (teto de cliques humanos).

## Campanha que lota sozinho (cap + roteamento) — FEITO (Banco/API)
Roteamento por lotação: o link mestre da campanha distribui os cliques pelo pool de grupos, enchendo um
até ~95% da capacidade e transbordando pro próximo. "Disponível" = grupo TEM `inviteUrl` E `members <
capacity * 0.95`. Sem `inviteUrl` o grupo nunca recebe (não há p/ onde mandar). Member count vem do último
sync da engine (pode estar defasado — o `clickCap` por link é o freio fino entre syncs).

**`capacity` é CONSTANTE de produto = 1024** (`DEFAULT_CAPACITY` em `groups-store.ts`). O spike Baileys 7
(NEXT.md) confirmou que `GroupMetadata` só expõe `size` (membros atuais), nunca o teto — a engine **não**
reporta `capacity`. O campo aceito no sync/PATCH existe só p/ ajuste manual; se o WhatsApp mudar o limite,
edita-se a constante. A engine reporta apenas `members` e `inviteUrl`.

### GET /api/groups  (navegador GET; engine via `x-engine-token`)
→ `Group[] = { id, name, whatsappGroupId, members, capacity, selected, engagement, inviteUrl? }`.

### POST /api/groups  (ENGINE, sync)
Body `{ groups: [{ whatsappGroupId, name, members, inviteUrl?, capacity? }] }`. Substitui a lista, mas
**preserva** `inviteUrl`/`capacity`/`selected` definidos no painel p/ grupos que ainda existem (sync não apaga config).
→ `201 { count }`.

### PATCH /api/groups  (navegador)
Painel define convite/capacidade de um grupo (necessário p/ o roteamento). Body `{ id, inviteUrl?, capacity? }`
→ `200 Group` | `400` id ausente | `404` não encontrado.

### GET/POST/PATCH/DELETE /api/campanhas  (navegador) — atualizado
`Campanha = { id, name, loja, groupIds[], slug, autoGrow?, growTemplate?, growCounter?, createdAt }`.
O `slug` é o link mestre: `/r/<slug>` roteia. Gerado no POST (único no namespace `/r/`, compartilhado com
links) e backfillado no GET p/ campanhas antigas. PATCH aceita também `autoGrow` (bool) e
`growTemplate = { subjectPattern("...{n}..."), desc?, mediaId?, announce?(=true), memberAddMode?("admin_add"|"all_member_add") }`.

## Auto-grow: campanha cria o próximo grupo sozinho — FEITO (Banco/API); Engine consome
Quando `autoGrow` está ligado e o pool da campanha não tem mais nenhum grupo com folga (com `inviteUrl`
e `members < 90% capacity`), o app enfileira a criação do próximo grupo. A engine puxa, cria no WhatsApp e
devolve o convite; o app registra o grupo no pool e o `/r/<campanha>` passa a roteá-lo. **Trigger proativo a
90%** (cria antes do pool esgotar, p/ o visitante nunca ver "cheio"). Espelha o motor de disparo (claim/ack
atômico, job preso em `running` >15min → `failed`). Fila em `data/group-grow.json`.

### POST /api/groups/grow/pending  (ENGINE, header `x-engine-token`)
Avalia o auto-grow (enfileira o que falta) e reivindica os jobs numa transação atômica (sem criação dupla).
→ `GrowClaim[] = { id, campaignSlug, subject, desc?, mediaId?, announce, memberAddMode }`.
A engine recomenda popular por LINK de convite (não `add` em massa — link não dispara `account_reachout_restricted`).

### POST /api/groups/grow/ack  (ENGINE, header `x-engine-token`)
A engine reporta a criação. Body `{ id, status:"running"|"created"|"failed", whatsappGroupId?, members?, inviteLink?, error? }`.
→ `200 GrowJob` | `400` id/status inválidos | `404` job não encontrado.
Em `created` (com `whatsappGroupId` + `inviteLink`): o app **registra o grupo no pool** (upsert, sem apagar os
demais) e **adiciona o JID ao `groupIds` da campanha** — daí o `/r/<campanha>` já o roteia.

### GET/POST /api/session
GET → status + `live` (heartbeat <90s) + `connectedSince` + `stats` (EngineStats).
POST (engine heartbeat 30s): `{ status, phone, profileName, connectedSince, stats }`.
`EngineStats = { queue:{pendentes,enviadasUltimoMinuto/Hora/Hoje,pausada}, delivery:{sentInWindow,deliveredInWindow,deliveryRate}, warmup:{phase,day,totalDays,todayLimit,todaySent} }`

### GET/POST /api/welcome  (Sprint 2)
GET → `{ enabled, message, updatedAt }` (a engine lê p/ decidir boas-vindas).
POST: `{ enabled?, message? }` → `201` config. {nome} é a única variável.

### GET /api/optout
→ `OptOut[] = { id, phone, reason, date }`. A engine lê e nunca dá boas-vindas a esses números.

## Motor de disparo de BROADCAST (ponte app→engine) — FEITO

A fila de disparo reaproveita `broadcasts.json` (`Campaign[]`). Estados do `status`:
`draft`/`failed`/`sent` = parado (pode ser (re)enfileirado) · `queued` = lojista mandou enviar,
aguardando a engine puxar · `running` = engine claimou e está disparando pela fila anti-ban.
1 mensagem por grupo (`total = groupIds.length`). Job preso em `running` sem ack há >15min → `failed`
(não re-enfileira sozinho, p/ evitar disparo duplo).

`Campaign = { id, name, status, message, groupIds, mediaId?, mediaType?("image"|"video"), mentionAll?, poll?{question,options}, sent, total, createdAt, error?, dispatchedAt?, runningSince?, lastAckAt? }`

### GET/POST/DELETE /api/broadcasts  (navegador, cookie)
GET → `Campaign[]`. POST cria oferta (`status:"draft"`): body exige `name` + (`message` OU `mediaId` OU
`poll` válida {question, ≥2 options}); aceita `groupIds[]`, `mediaId`, `mediaType`, `mentionAll`. → `201 Campaign`.
DELETE `?id=` → `{ ok:true }`.

### POST /api/dispatch  (navegador, cookie)
Lojista clicou "Enviar agora". Body `{ id }` → enfileira (`status:"queued"`, reset de contadores).
→ `202 Campaign` | `400` id ausente/JSON inválido | `404` oferta não encontrada.
Idempotente: se já `queued`/`running`, retorna a oferta sem mudar.

### POST /api/dispatch/pending  (ENGINE, header `x-engine-token`)
A engine reivindica a fila. Antes do claim, promove agendamentos vencidos → `queued` (sem timer).
Claim é transação atômica única (sem disparo duplo) e marca os claimados como `running`.
→ `DispatchJob[] = { id, name, message, groupIds, mediaId?, mediaType?, mentionAll?, poll? }`.
(POST porque tem efeito colateral.)

### POST /api/dispatch/ack  (ENGINE, header `x-engine-token`)
A engine reporta progresso/resultado. Body `{ id, status:"running"|"sent"|"failed", sent, total, error? }`.
→ `200 Campaign` | `400` id/status inválidos | `404` não encontrada. `sent`/`failed` carimbam `dispatchedAt`.

### GET/POST/DELETE /api/schedules  (navegador, cookie)
Agendamento aponta p/ uma oferta real (`campaignId`). POST exige `campaignName` + `scheduledAt`;
aceita `campaignId`, `recurrence:"none"|"daily"|"weekly"` (default `none`). `status` inicia `pending`.
A execução acontece via `/api/dispatch/pending`: vencidos viram `done` (uma vez) ou reprogramam (recorrência);
sem `campaignId` → `failed`. `Schedule = { id, campaignId?, campaignName, scheduledAt, recurrence, status, lastRunAt? }`.

### GET/POST/PATCH/DELETE /api/campanhas  (navegador, cookie)
Campanha = ESCOPO de grupos (loja → campanhas → grupos), **não** é disparo. POST exige `name`
(`loja` default "Minha loja", `groupIds[]`). PATCH `{ id, name?, loja?, groupIds? }`. DELETE `?id=`.
`Campanha = { id, name, loja, groupIds, createdAt }`. A campanha ativa vive no cookie `dz_campanha`.

> ⚠️ **Aberto (handoff Engine):** as mensagens já usam variáveis além de `{nome}`
> (`{nome_loja}`, `{preco}`, `{link_catalogo}` etc.), mas o contrato de welcome diz "{nome} é a única
> variável". Definir/registrar quem expande quais variáveis no disparo de broadcast — hoje não documentado.

## CONTAS + BILLING (épico — fundação + Fatias 1-2 FEITAS; 3-4 em fatias)
Domínio em Postgres/Prisma (`prisma/schema.prisma`, `src/lib/db.ts`). Modelo: Account(tenant)/Plan/
Subscription/Invoice (ver DB_SCHEMA.md). Auth real (e-mail+senha por conta) substitui a senha única.
Escopo fase 1 = híbrido: cadastro/pagamento MANUAL; checkout/recorrência Asaas automáticos vêm depois.
`accountId` da sessão lido por `src/lib/session.ts` (`getSessionAccountId()`).

### POST /api/auth/signup  ✅ (público)
Body `{ name, email, password(≥6) }` → cria `Account` (passwordHash bcrypt) + assina cookie de sessão (`sub=accountId`).
→ `201 { id, name, email }` | `409` e-mail já existe | `400` inválido.

### POST /api/auth/login  ✅ (público) — substituiu o login por senha única
Body `{ email, password }` → valida hash, assina sessão. → `200 { id, name, email }` | `401` | `403` conta CANCELED.

### GET /api/plans  ✅ (navegador, sessão)
→ `Plan[] = { id, code, name, priceCents, interval }` (catálogo do seed, ativos, ordem preço asc).

### GET /api/subscription  ✅ (navegador, sessão)
→ assinatura ativa da conta logada com o plano embutido (`{ ...sub, plan }`), ou `null`. `401` sem sessão.

### POST /api/subscription  ✅ (navegador, sessão)
`{ planId }` → cria/atualiza a `Subscription` (1 por conta, `currentPeriodEnd` = agora + intervalo) e gera a
1ª `Invoice` OPEN (vencimento hoje, `amountCents` = preço do plano). Idempotente: não duplica fatura OPEN.
→ `201 { subscription, invoice }` | `400` plano inválido | `401`. Fase 4 troca por cobrança recorrente Asaas.

### GET /api/invoices  (navegador, sessão) — "financeiro"
→ `Invoice[]` da conta `{ amountCents, dueDate, status, method?, invoiceUrl? }`, ordenado por dueDate desc.

### POST /api/invoices/:id/pay  (admin, fase 1 manual)
Marca `Invoice` como `PAID` (method `MANUAL`), estende `currentPeriodEnd`, reativa `Account` se suspensa.

### POST /api/billing/asaas/webhook  (Asaas, fase 2) — header de token próprio
Recebe eventos (`PAYMENT_CONFIRMED`/`PAYMENT_OVERDUE`/…) → atualiza Invoice/Subscription/Account.
Vencimento/corte: job diário marca `OVERDUE` o que passou de `dueDate` e `SUSPENDED` a conta após carência.

> **Gate de acesso (handoff Engine + middleware):** conta `SUSPENDED` → middleware bloqueia o painel e a
> engine não dispara. A engine deve checar status da conta antes de operar (definir no contrato da fatia de gate).

## Planejado (outros)
Webhook Meta Ads. Migração do operacional (file-store→Postgres) com `accountId` (multi-tenant real).
