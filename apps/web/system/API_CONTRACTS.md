# API_CONTRACTS

> Status 2026-06-24: partes deste documento registram o legado Prisma/Asaas.
> O caminho ativo usa Supabase Auth, Supabase Postgres/RLS e Stripe. As rotas
> `/api/auth/*`, `/api/plans` e `/api/subscription` foram migradas para Supabase.

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

## Motor de disparo de BROADCAST — FEITO (motor novo: fan-out em `engine_commands`)

**O que mudou na F5.** Antes, `queued` só sinalizava intenção e quem convertia isso em envio era o
engine legado (`/api/dispatch/pending`). Agora a RPC `enqueue_broadcast` faz o **fan-out** na hora,
dentro de uma transação: cria **1 comando por grupo** em `engine_commands`, que é o que o worker
consome. Quem a chama é `POST /api/campanhas/[slug]/messages`, depois de cobrar os tetos do plano.
(`POST /api/dispatch` e `POST /api/engine/commands` faziam o mesmo sem cobrar plano e sem chamador —
saíram em 16/10/2026.)

Estados do `status`:
`draft`/`failed`/`sent` = parado (pode ser (re)enfileirado) · `queued` = fan-out feito, nenhum comando
concluído ainda · `running` = ≥1 comando concluído e ainda há pendentes · `sent` = 0 pendentes e ≥1
entregue · `failed` = 0 pendentes e nenhum entregue, ou o fan-out foi impossível (sem número
conectado, sem grupo admin, oferta sem conteúdo, todos os grupos de destino já no teto do dia).

`total` = comandos criados; `sent` = comandos `done`. Quem escreve esses dois é
`reconcile_broadcast_progress`, **agregando** `engine_commands` no housekeeping do worker — nunca
incrementando. O envio é at-least-once, então `sent = sent + 1` contaria duas vezes num reenvio;
`count(*) filter (where status='done')` é idempotente por construção.

**Sem watchdog de 15 min.** A regra antiga ("preso em `running` sem ack há >15min → `failed`") foi
**removida**: ela é incompatível com o anti-ban. Com cap de 8/min um disparo de 300 grupos leva ~40
minutos, e no warmup de dia 1 (cap 20/dia) leva **dias** — legitimamente. O timeout mataria disparo
saudável. Quem detecta disparo morto agora é o reconciliador, por ausência de comandos pendentes.

**Destinos.** `groupIds` vazio = todos os grupos **admin** do tenant (regra do legado: "nunca dispara
em grupo onde não somos admin"). Lista explícita é interseccionada com os grupos admin — o sync novo
grava também os grupos não-admin, e disparar neles queimaria cota anti-ban com envio que o WhatsApp
recusa, além de alimentar o breaker do número.

**Teto de posts por grupo por dia.** `enqueue_broadcast` conta, por grupo, os posts do dia de Brasília
(`app.posts_hoje_por_grupo`) contra o teto de `app.posts_por_grupo_dia()` — o número vive só nessa função,
nunca no código. A contagem roda sob advisory lock da loja, então dois posts enfileirados juntos não leem o
mesmo total. Grupo no teto **não sai**: a rodada ganha, para ele, uma linha em `engine_commands` já
`canceled`, com `payload.foraDoTeto = true` e o motivo em `error`. Essa linha entra em `total` (a coluna do
post mostra "limite do dia" naquele grupo), não conta como entregue e nunca é reivindicada pelo worker.
Se **todos** os grupos de destino estão no teto, nenhum comando sai: o post vira `failed`, numa rodada nova
(`run_id` novo, com as linhas de fora), com o motivo em `error`. `POST /api/campanhas/[slug]/messages`
("postar agora") responde `422 { error }` quando o post volta `failed` — o motivo vem do banco, pronto pra
tela; sem isso a rota diria `201` e a tela "Postado" de um post que não saiu. Post agendado cortado inteiro
não tem tela aberta: `promote_due_schedules` grava uma notificação `teto_posts_grupo` pro lojista.

**Tipo do comando**, com a precedência do legado — enquete > mídia > texto:
- `send_message` → `{ jid, text, mentionAll }`
- `send_media` → `{ jid, mediaId, mediaType, caption, mentionAll }`
- `send_poll` → `{ jid, question, options[] }` (enquete exige ≥2 opções; com menos, cai para texto)

**Reenvio.** `dedupe_key = bc:<broadcastId>:<runId>:<jid>`. O `runId` (coluna `broadcasts.run_id`)
muda a cada enfileiramento — sem ele, reenviar a mesma oferta bateria no índice único de dedupe,
inseriria 0 comandos e o disparo sumiria em silêncio.

**Convivência com o motor legado.** `run_id` não-nulo marca a oferta como sendo do motor novo, e o
claim legado filtra `run_id is null`. Os dois consumidores podem ficar vivos ao mesmo tempo sem
disparo duplo, e o rollback é trivial.

`Campaign = { id, name, status, message, groupIds, mediaId?, mediaType?("image"|"video"), mentionAll?, poll?{question,options}, runId?, sent, total, createdAt, error?, dispatchedAt?, runningSince?, lastAckAt? }`

### GET/POST/DELETE /api/broadcasts  (navegador, cookie)
GET → `Campaign[]`. POST cria oferta (`status:"draft"`): body exige `name` + (`message` OU `mediaId` OU
`poll` válida {question, ≥2 options}); aceita `groupIds[]`, `mediaId`, `mediaType`, `mentionAll`. → `201 Campaign`.
DELETE `?id=` → `{ ok:true }`.

### POST /api/dispatch/pending  (ENGINE, header `x-engine-token`) — LEGADO, sai na F5
Claim do engine antigo. Filtra `run_id is null`, então **ignora** o que o motor novo enfileirou.

### POST /api/dispatch/ack  (ENGINE, header `x-engine-token`) — LEGADO, sai na F5
Ack do engine antigo. No motor novo o progresso vem do reconciliador, não deste endpoint.

### GET/POST/DELETE /api/schedules  (navegador, cookie)
Agendamento aponta p/ uma oferta real (`campaignId`). POST exige `campaignName` + `scheduledAt`;
aceita `campaignId`, `recurrence:"none"|"daily"|"weekly"` (default `none`). `status` inicia `pending`.
A execução é do worker (`promote_due_schedules`, no housekeeping): vencidos disparam o **fan-out** e
então viram `done` (uma vez) ou reprogramam (recorrência). Recorrente atrasado avança até o futuro —
worker parado 3 dias gera 1 disparo, não 3. `Schedule = { id, campaignId?, campaignName, scheduledAt,
recurrence, status, lastRunAt? }`.

### GET/POST/PATCH/DELETE /api/campanhas  (navegador, cookie)
Campanha = ESCOPO de grupos (loja → campanhas → grupos), **não** é disparo. POST exige `name`
(`loja` default "Minha loja", `groupIds[]`). PATCH `{ id, name?, loja?, groupIds? }`. DELETE `?id=`.
`Campanha = { id, name, loja, groupIds, createdAt }`. A campanha ativa vive no cookie `dz_campanha`.

### GET /api/campanhas/[slug]/entradas  (navegador, cookie)
→ `200 { entradas, ultimas }`, tudo lido no banco (`leads.source_group_id` no pool
da campanha), porque a lista de `/api/leads` para em 1000 linhas:
- `entradas: number` — quem entrou desde a criação da campanha (`entered_at >= created_at`).
- `ultimas: { id, nome, grupo, entrouEm }[]` — as 5 entradas mais recentes, de qualquer dia. `nome` já
  vem abreviado ("Daiane S."); telefone e nome inteiro não saem do servidor (LGPD).

`404` se a campanha não é do tenant · `500` se qualquer leitura falhar.

### GET /api/leads/contagem  (navegador, cookie)
→ `200 { total: number, clientes: number }`: quantos leads o tenant tem, e quantos têm
`status = 'comprou'`. Contado no banco (HEAD + `count=exact`), porque a lista de `/api/leads` para em
1000 linhas. Consumida por `/painel/resultados` e `/painel/configuracoes/cancelar`. Engine não entra
(`403`, embora o prefixo `/api/leads` seja compartilhado no middleware) · `500` se a contagem falhar.

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

## FLOW PAGES (LPs de captação pra grupos — Sessão 1 publicada 2026-07-02)
Tabelas `landing_page_templates` / `landing_pages` / `lp_leads` / `lp_tracking_events`
(migração `20260702120000_flow_pages.sql`; prefixo lp_ evita colisão com leads/eventos legados).
Multi-tenant: FK `organizations(id)` + RLS `current_setting('app.tenant_id')` + filtro explícito no store.
Shapes TS: `src/lib/pages/schema.ts` (fonte da verdade). Destino do lead: `campaign_slug` → `/r/{slug}`
(rotação de grupos) com `target_group_url` (chat.whatsapp.com|wa.me, https) como fallback.

### GET /api/pages  ✅ (painel, tenant via getTenantContext)
→ `LandingPage[]` do tenant, created_at desc.

### POST /api/pages  ✅ (painel, tenant)
Body `{ template_id, content: LpContent, campaign_slug?, target_group_url?, meta_pixel_id?, ga4_id? }`.
`LpContent = { store_name, photo_url(https), headline, description, group_topic, primary_color: iris|emerald|amber }`.
Valida content (limites/enum), gera slug `{nome}-{sufixo4}`, cria `status='draft'`.
→ `201 LandingPage` | `400 {error, details[]}` | `404` template.

### GET /api/pages/templates  ✅ (painel, tenant)
→ `LpTemplate[]` (catálogo seedado: promo-relampago, sorteio-premio, catalogo-grupo).

### GET /api/p/{slug}  ✅ (PÚBLICO — fora do middleware)
→ LP `published` (sem tenant_id/contadores) | `404`. Regex de slug validada.

### GET /api/p/health  ✅ (PÚBLICO)
→ `{ ok, db: up|down, templates_count }` · 503 se db down ou seed ausente.

### GET /p/{slug}  ✅ (página pública, ISR)
`unstable_cache` tag `lp:{slug}` + revalidate 300s. Publish/edit (sessão 3) chama `revalidateTag`.
Render escolhe componente por `template.component_key` (registry em `components/pages/templates`).

### GET /api/pages/{id}  ✅ (painel, tenant)
→ `{ page: LandingPage, metrics: {views, leads, conversion%}, leads: LpLeadRow[≤20] }`.
Métricas derivadas de `lp_tracking_events` (contadores nas colunas = cache).

### PATCH /api/pages/{id}  ✅ (painel, tenant)
Body parcial `{ content?, target_group_url?, campaign_slug?, meta_pixel_id?, ga4_id?, status? }`.
Publicar exige destino (campanha ou URL); 1ª publicação seta `published_at`.
Sempre chama `revalidateTag(lp:{slug})` → página no ar atualiza em segundos.

### POST /api/p/track  ✅ (PÚBLICO, rate-limit 30/min/ip, filtro de bot UA)
`{slug, event: PageView|GroupJoin, utm_*, fbclid, gclid, ttclid, referrer}` → grava `lp_tracking_events`
(+RPC views em PageView). Responde 204 sempre (sendBeacon não lê corpo; bot não ganha dica).
`Lead` NÃO é aceito aqui — só via /api/p/lead (exige consent).

### POST /api/p/lead  ✅ (PÚBLICO, rate-limit 5/min/ip, honeypot `website`)
`{slug, name(≥2), whatsapp, consent: true, utm_*...}` → normaliza E.164 BR (400 se inválido),
snapshot `consent_text` + `consent_at`, `ip_hash` sha256(ip+salt), upsert dedup (landing_page_id, whatsapp)
→ `{ ok, redirect_url, duplicated }`. Evento `Lead` + contador SÓ na 1ª captura.

### Client-side (LP pública)
`TrackingScripts`: captura UTMs/fbclid/gclid/ttclid+referrer da URL → sessionStorage (1ª origem da sessão
vence) + beacon PageView + injeta Meta Pixel/GA4 só se IDs configurados. `LeadForm`: form nome+zap+consent,
sucesso → botão "Entrar no grupo" (beacon GroupJoin + fbq Lead/gtag generate_lead) → navega pro destino.
CSP: /p/* tem política própria no next.config (img https:, vendors de pixel; 'unsafe-eval' SÓ em dev — Turbopack).

### Painel  ✅
`/painel/pages` (lista) · `/painel/pages/nova` (form 7 campos + preview ao vivo com o MESMO componente
da LP pública) · `/painel/pages/{id}` (publicar/pausar, copiar link, métricas, últimos 20 leads c/ UTM, edição).
Item "Páginas" na sidebar.

### Fora do MVP (registrado)
Componentes visuais distintos por template (os 3 usam BasicTemplate — decisão Igor 2026-07-02) ·
TikTok pixel client · captcha · custom domain · retenção automatizada de lp_tracking_events (90d, cron manual).

---

## Playbook "Primeiros 30 dias" (P1.8)  ✅

`GET /api/playbook` → estado do checklist do tenant:
```
{ steps: { key, title, description, auto:boolean, done:boolean, doneAt:string|null, ctaHref, ctaLabel }[],
  completed:number, total:8, nextStepKey:string|null, graduated:boolean }
```
Passos AUTO são computados server-side agregando stores existentes (session/campanhas/broadcasts/
automations/leads count/orders count/tenant_settings); o passo manual (`share_link`) vem de
`playbook_progress`. GET faz write-through sticky dos autos já atingidos → progresso não regride.

`POST /api/playbook` body `{ stepKey }` → marca um passo MANUAL (valida `MANUAL_STEP_KEYS`, 400 senão);
retorna o mesmo shape recomputado. Passos definidos em `lib/playbook/steps.ts` (contrato só-leitura pro Frontend).

### GET /api/cron/group-invites

Cron do Vercel, uma vez por dia (`0 6 * * *`). `Authorization: Bearer <CRON_SECRET>`.
Cadência diária porque o plano Hobby da Vercel só libera cron uma vez por dia —
`*/10 * * * *` é rejeitado no deploy.

Preenche `groups.invite_url` de até 10 grupos por TENANT conectado onde
`is_admin = true` e o convite está vazio, buscando na Evolution
(`GET /group/inviteCode/{instance}?groupJid=`).

Um tenant tem várias linhas em `instances`; a sessão usada é UMA por tenant,
escolhida por `selectSessionRow`/`isConnectedStatus` (`lib/session-select.ts`) —
a mesma regra do painel. Tenant cuja linha escolhida não está viva é pulado.

A cadência do cron × o teto de 10 por execução É o rate limiter: até 10 convites
por instância por dia, por conta de WhatsApp — mais conservador que o desenho
original de 10/10min, não menos. Alterar um sem o outro quebra a política anti-ban.

Com muitas tenants o loop serial pode não caber no `maxDuration` de um único
run; a ordem dos tenants gira por dia (`rotateByDay`, em `invite-backfill.ts`)
para que ninguém fique preso no fim da fila pra sempre — cada tenant lidera o
run em algum dia dentro de um ciclo de N dias (N = número de tenants).

Resposta: `{ ok: true, filled, failed, skipped, remaining, timestamp }`

- `filled` — convites gravados
- `failed` — dois casos diferentes por trás do mesmo contador: quando a Evolution responde sem
  convite válido ou devolve erro permanente **marcável** (ver abaixo), grava
  `groups.metadata.inviteFetch = { failed, reason, at }` e o grupo sai da fila até um resgate manual;
  nos demais (falha ao listar `groups` do tenant, convite obtido mas não gravado, erro inesperado) só
  conta como falha — o grupo continua na fila e tenta de novo na próxima execução
  - **Nota:** resposta HTTP 200 sem convite utilizável não tem proteção do breaker instance-wide — é
    marcado de imediato como falha permanente, pois 200 é sinal inequívoco de que a instância está
    viva e o grupo é que tem problema irrecuperável (admin perdido, revogação, etc.)
- `skipped` — o grupo continua na fila e volta na próxima execução (diária). Dois casos: falha
  passageira (rede/5xx) e falha permanente **não reconhecida** ainda não marcada (ver abaixo)
- `remaining` — quantos ainda esperam vez. Inclui grupos não tentados quando o breaker instance-wide
  dispara (3 falhas seguidas sem preenchimento algum), pois eles não foram processados neste run e
  retentarão na próxima execução

Erro permanente marcável × não reconhecido: a Evolution 2.3.7 achata toda falha
de grupo num 404 igual, então um 404 sem padrão conhecido tanto pode ser "este
grupo perdeu admin" quanto "esta instância sumiu". Só é marcado na hora o erro
**reconhecido** (403/forbidden/not-authorized, travado, revogado). O 404 genérico
só vira marca depois que a instância provou que responde — pelo menos um convite
preenchido no mesmo run. Enquanto não provar, ele conta como `skipped`; e 3
seguidos sem nenhum convite param o loop daquele tenant (log `console.error`) e o
run segue para os outros tenants.

## Settings do tenant + segmento (GET/PATCH /api/settings) — 30/08/2026

GET → `200` `{ tenantId, weeklyReportEnabled, disconnectAlertEnabled, broadcastAlertEnabled,
monthlyGoalContacts, monthlyGoalRevenue, segment, onboardingDismissedAt, onboardingCompletedAt, updatedAt? }`

PATCH body (todos opcionais): os campos acima, sendo `segment: SegmentId | null` — ids canônicos em
`src/lib/segments.ts` (`moda_atacado`, `calcados`, `beleza`, `mercado`, `moveis`, `outro`); valor fora do
catálogo → `400`; `null`/`""` limpam. `segment` alimenta os packs de conteúdo (`src/lib/content-packs.ts`):
`moda_atacado` → copies originais da biblioteca; `mercado` → pack próprio; demais/`null` → pack neutro.
`POST /api/auth/signup` aceita `segment` opcional e grava best-effort após criar o tenant (conta > ramo).
Tenants anteriores à migração `20260830233000` foram backfillados como `moda_atacado`.

## Posts de hoje por grupo (GET /api/groups/posts-hoje) — 26/10/2026

Rota de painel (`allowEngine: false`: sessão por Bearer ou cookie; a engine leva 403). Sem corpo e sem
parâmetro: o tenant é sempre o da sessão, nunca um da query.

Permissão: `message:send`, a mesma de `POST /api/campanhas/[slug]/messages` — dono, admin, operador e a
vendedora com o módulo `postar` (a rota está no mapa `postar` de `lib/auth/modulos.ts`; sem o módulo, 403).

`200` → `{ teto, grupos }`, o retorno de `public.posts_hoje_por_grupo(p_tenant)` repassado sem mexer:
- `teto` — inteiro > 0, o limite de posts por grupo por dia de Brasília (`app.posts_por_grupo_dia()`)
- `grupos` — `{ "<jid do grupo>": <posts de hoje> }`; grupo sem post hoje não aparece, e sem nenhum post
  é `{}`

**O teto vem do banco; a tela nunca guarda o número.** Nenhum arquivo do app repete o valor: o composer
lê `teto` desta resposta. Resposta do RPC fora do formato (`teto` não inteiro > 0, `grupos` que não seja
objeto de inteiros ≥ 0) é erro, não zero: a tela fica sem a linha do teto em vez de mostrar contagem errada.

Erros:
- `403` — papel sem `message:send`, vendedora sem o módulo de postar, ou chamada da engine
- `501 { error: "A contagem de posts de hoje precisa do banco." }` — sem `USE_SUPABASE` (modo JSON não tem contagem)
- `500 { error: "Não deu para ler os posts de hoje." }` — o RPC falhou ou devolveu formato inesperado

## Rastreio do pedido — 31/10/2026

Contrato das rotas do Rastreio; cada uma diz o PR que a cria. Nenhuma existe ainda: a Parte 2 do PR 1 só publica
os tipos (`lib/rastreio/tipos.ts`) e as stores (`lib/stores/rastreio-*.ts`).

**Rotas de painel** (`/api/rastreio/*`): `allowEngine: false`, o tenant é sempre o da sessão (nunca da query ou do
corpo), permissão `settings:connection` (a vendedora leva 403). Loja sem `rastreio_enabled` leva
`403 { error: "O Rastreio de pedidos não está liberado para esta loja.", code: "rastreio_disabled" }` (molde de
`lib/ig/access.ts`). Nada da compradora sai além do primeiro nome.

### Cron

`GET /api/cron/rastreio` (PR 2, a cada 5 min, `isCronAuthorized`) → `200 { ok: true, lojas, falhas, purgados }`.
`purgados` é `number` só na execução das 06:00 UTC (`purgarVencidos()`); nas outras é `null`.

### Configuração

`GET /api/rastreio/config` (PR 6) → `{ config, linkDaBusca }`, com `config: Omit<RastreioConfig, "tenantId" | "sweepCursor">`.
Cria a config na primeira leitura (`garantirConfig`).

`PATCH /api/rastreio/config` (PR 6) — qualquer parte de `{ publicSlug, matrix, notifyStoreOnProblem, vipLinkId, storeWhatsapp }`;
responde como o GET.
- `400 { error, campo }` — slug fora do formato ou reservado, matriz incompleta, número inválido (ou o dos grupos,
  por `lib/bio/conferir.ts`), link de outra loja
- `409 { error, campo: "publicSlug" }` — `SlugEmUso`

### Entregas

Todas exigem `settings:connection` (dono e admin; a vendedora leva o 403 do mapa) e `rastreio_enabled`; desligado →
`403 { error, code: "rastreio_disabled" }`. Resposta sempre com `Cache-Control: no-store`.

`GET|POST /api/rastreio/entregas` (PR 6) — corpo do `POST`: `{ filtro?, busca?, pagina?, pedido? }`. `filtro` (`todos` ·
`a_caminho` · `sem_codigo` · `problema` · `whatsapp_falhou` · `entregues`), `busca` (nº do pedido, nome ou CPF/CNPJ via
`doc_hmac`), `pagina` (1-400), `pedido` (uuid, abre um pedido). O `GET` lê `filtro`, `pagina` e `pedido` da query e
**ignora `busca`**: o documento nunca vai em URL nem em log. `400 { error }` se `pedido` não for uuid.

`200` → `RespostaDeEntregas`: `{ numeros, filtro, pagina, porPagina, total, linhas, atualizadoEm }`
- `numeros` — `{ todos, aCaminho, semCodigo, problema, whatsappFalhou, entreguesEm7Dias, avisosHoje: { whatsapp, email } }`
- `linhas` — uma por pedido; só o primeiro nome da compradora; `telefone` só na linha `problema` (para "Chamar
  compradora"), nunca e-mail, documento ou endereço.

`POST /api/rastreio/entregas/[id]/reenviar` (PR 6; `reabrirAvisos` da etapa atual) → `200 { reabertos, canais }`.
Avisos em `pendente`/`enviando` não são reabertos; quem envia é o cron (até 5 min), a rota não envia.
- `400` — `id` que não é uuid · `404` — pedido que não é da loja
- `409 { error, code }` com `code`: `avisos_parados` (compradora pediu para parar) · `etapa_sem_aviso` · `sem_canal`

`GET /api/rastreio/saude` (PR 6) → `{ enviados, comCodigo, maisAntigoSemCodigo: { id, numero, desde } | null }`,
sobre os pedidos postados nos últimos 7 dias.

### Página pública (PR 3)

`GET/POST /rastreio/[slug]` (busca), `GET /rastreio/[slug]/[token]` (um pedido) e
`POST /rastreio/[slug]/[token]/parar` — no domínio do lojista, sem o `[slug]`.
- HTML com `x-robots-tag: noindex`, `cache-control: private, no-store` e CSP com nonce
- loja sem o Rastreio ligado → `404`
- textos fixos do índice; `429` acima de 5/min ou 20/h por IP + loja
- o token mostra um pedido só; token desconhecido → `404` com a busca
- parar avisos só por `POST` (`303`); `GET` no `/parar` → `405` sem gravar; nunca escreve em `optouts`
