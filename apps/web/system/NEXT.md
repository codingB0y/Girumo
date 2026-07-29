# NEXT

> Status 2026-06-24: plano legado. A migracao atual usa Supabase Auth, Supabase Postgres/RLS/Storage,
> Stripe e engine em VPS/Coolify. Prisma, Neon e Asaas nao sao mais o caminho alvo.

## ✅ Executor de automações — FEITO (2026-07-29, PR #30)

Camadas 1, 2 e 3 do plano [`docs/superpowers/plans/2026-07-29-automations-executor.md`](../../../docs/superpowers/plans/2026-07-29-automations-executor.md)
entregues, ponta a ponta. Feature ativa: lojista liga um template em `/painel/automacoes` →
worker cria os runs → mensagem sai no grupo via engine legado.

- **Camada 1** — `automation_runs` (migração `20260729010000_automation_runs.sql`) + 4 RPCs
  (`claim`/`advance`/`finish`/`requeue`, padrão `app.*` + wrapper `public.*`) + tick
  `apps/worker/src/automations-loop.ts`. Smoke `infra/tests/automation-runs-smoke.sql` (12/12).
- **Camada 2** — gatilhos: `lead_entered` no `apps/worker/src/lead-capture.ts`;
  `group_full`/`group_stalled`/`weekly_recurring` por varredura em `apps/worker/src/automation-scans.ts`.
- **Camada 3** — envio por `engine_commands` (`type:'send_message'`), consumido HOJE pelo engine legado.

Guarda-corpo anti-DM em DUAS camadas: CHECK `@g.us` na tabela `automation_runs` + validação no enqueue
do worker. `engine_commands.payload` aceita `phone` e mandaria DM — nunca deixar passar.

⚠️ **Ponto de acoplamento com o F4 (ler antes de mexer no worker de envio):** o executor é o
**produtor** de `engine_commands`. O F4 troca só o **consumidor** (engine legado → worker Evolution).
Quem mexer no F4 **não pode** quebrar o contrato de payload `{jid, text}` de `type:'send_message'`,
senão o executor para de enviar no cutover.

## HANDOFF → lane Engine/Worker — F4: worker completo + anti-ban portado (2026-07-29)

Estado do Sprint 5 (migração Baileys → Evolution): **F0–F3 feitos, F4 é o próximo** (ver `TASK_PROGRESS.md`).
Hoje o envio real ainda passa pelo **engine legado Baileys** (`hubflow-engine/`), que consome
`engine_commands` em `queues/supabase-command-worker.js:102-106` → `sendText` → fila anti-ban →
`sock.sendMessage`. O F4 troca esse consumidor por um sender no `apps/worker` falando com a **Evolution API**.

**O item que trava o F4 é o anti-ban portado — precisa de decisão de arquitetura ANTES de codar.**
Hoje o governor de throughput vive **em memória, por processo**:
- `AntiBanQueue.sentTimestamps[]` = janelas de envio das últimas 24h, para os caps por minuto/hora/dia
  (`8/min`, `120/h`, `800/dia` base; warmup reduz o teto p/ número novo). Ver `index.js:105-121` +
  `anti-ban-queue.js`.
- Persistido em `engine-state.json` e restaurado no boot (`index.js:124-129`) — restart NÃO libera cota nova.
- Estado adicional por processo: warmup (por número), circuit breaker (falhas consecutivas), delivery tracker.

O problema: com **N réplicas de worker** consumindo uma fila Postgres única, cada réplica teria seu próprio
`sentTimestamps` e cada uma liberaria 8/min → na prática N×8/min pro mesmo número = **risco de ban**.

⚠️ **Nuance que muda o porte:** o cap de hoje é **global ao processo** (`maxPerMinute:8`), e funciona só
porque no engine legado **1 processo = 1 número**. No worker, se uma réplica atender N instâncias, um cap
global estrangularia *todos os números somados* a 8/min. Então **o governor tem que virar por-número**
(chaveado por `instance_id`), não global — em QUALQUER das opções abaixo. Isso é porte real, não cópia.

Três caminhos, do mais simples ao mais correto:

- **(A) Sender único** — uma réplica só faz envio (as outras fazem captura/automações/varredura). O governor
  por-processo de hoje já está correto pra 1 processo; é literalmente o que o engine legado faz. Prós: mínimo
  esforço, reusa `anti-ban-queue.js`. Contras: sem escala horizontal de envio, ponto único (mas é o status quo).
- **(B) Afinidade instância→worker (sharding)** — cada instância (número) pertence a exatamente uma réplica,
  que mantém o governor em memória pros seus números. Precisa de camada de ownership (advisory lock / tabela
  de assignment) + failover quando uma réplica morre (o lease de `engine_commands` já cobre o job, mas o
  estado do governor teria que ser reconstruído da janela no banco no failover). Prós: escala e reusa a lógica.
  Contras: lógica de ownership/rebalance é trabalho real.
- **(C) Cota no banco** — Postgres vira fonte de verdade do governor: uma tabela de janelas por
  `(instance_id, minuto/hora/dia)`, e reservar um slot de envio é uma checagem transacional antes do send.
  Prós: correto sob N réplicas por construção, sobrevive a restart nativamente. Contras: mais trabalho de
  design (a query de janela) + um round-trip por slot (barato, já que é ≤8/min/número). O jitter gaussiano
  entre mensagens continua local — é pacing por-mensagem, não cap global.

**✅ DECISÃO (2026-07-29, Igor): opção A — sender único.** Justificativa: é o porte menos arriscado do item
mais perigoso do sprint, e pra ~10 contas (estimativa F1) um processo paceia 10 números × 8/min de sobra.
Escala horizontal (B/C) fica pra quando o volume exigir — deixar o seam preparado, não construir agora.
**Implicação concreta pro F4:** (1) refazer o governor por-`instance_id` (não global — ver nuance acima),
mesmo com sender único, senão os números competem pela mesma cota; (2) rodar o loop de envio em UMA réplica
só (as outras réplicas seguem com captura/automações/varredura); (3) persistir as janalas por-número
(equivalente ao `engine-state.json` de hoje, mas keyed por instância) pra restart não liberar cota nova.

Restrições invioláveis (ver `hubflow-engine/DECISIONS.md`): anti-ban = **só controle operacional seguro**,
proibido fingerprint/proxy/stealth/evasão. E o sender novo **tem que honrar o mesmo contrato de payload**
de `engine_commands` (`{jid, text}`) — senão quebra o executor de automações (acima).

**Primeiro passo do novo chat:** com a decisão A já fechada, detalhar o desenho do governor por-`instance_id`
(onde vive o `sentTimestamps` por número, como persiste, como o sender único é eleito) e então implementar:
sender Evolution + lease/retry (o `engine_commands` já tem lease/retry/priority desde `engine_queue_v2`) +
fan-out de broadcast. Fora do F4 fica o cutover (F5: desligar engine legado, deletar rotas engine-only) e a
limpeza (F6).

## ÉPICO "Contas + Billing" (login/cadastro/plano/assinatura/pagamento/financeiro/vencimento) — 2026-06-23
Decisões (Igor): **Híbrido** (modelo certo já; cadastro+pagamento MANUAL agora; checkout/recorrência
automáticos depois) · **Postgres + Prisma** · **Asaas**. Espinha = Banco/API. Contrato em `API_CONTRACTS.md`
(seção CONTAS + BILLING); modelo em `DB_SCHEMA.md` / `prisma/schema.prisma`.

- ✅ **Fatia 0 — Fundação (FEITA 2026-06-23):** Prisma 6 + `prisma/schema.prisma` (Account/Plan/Subscription/
  Invoice), client singleton `src/lib/db.ts`, seed dos 3 planos `prisma/seed.ts`, scripts `db:migrate/seed/studio`.
- ✅ **GATE DE INFRA RESOLVIDO (2026-06-23):** Postgres no **Neon** (sa-east-1), `DATABASE_URL` no `.env`.
  Migração `init` aplicada (tabelas criadas) + seed dos 3 planos rodado. Banco vivo.
- ✅ **Fatia 1 — Auth real (FEITA 2026-06-23):** `bcryptjs`; `POST /api/auth/signup` ({name,email,password})
  + `POST /api/auth/login` ({email,password}) por conta; cookie de sessão agora carrega `accountId`
  (`auth.ts`: `signSession(accountId)`, `verifySession`→`accountId|null`). middleware libera `/signup`.
  Senha única `APP_PASSWORD` aposentada (export mantido, sem uso). Testado e2e no Neon (signup/dup 409/login/401 senha).
  → **HANDOFF Frontend+UI:** (a) tela `/login` passa a postar `{email,password}` (hoje manda `{password}`);
  (b) criar tela `/signup` ({name,email,password} → `POST /api/auth/signup`); ambas públicas no middleware.
  → ✅ **Frontend+UI FEITO (2026-06-23):** `/login` agora posta `{email,password}` e mostra o erro do corpo;
  nova tela `/signup` ({name,email,password}, valida e-mail + senha ≥6, trata 409 e-mail duplicado) → `/hoje`.
  Casca compartilhada `components/auth-shell.tsx` (visual futurista da landing) + cross-link login↔signup. typecheck OK.
- ✅ **Fatia 2 — Planos + assinatura (FEITA 2026-06-23):** `GET /api/plans` (catálogo do seed); `GET /api/subscription`
  (assinatura ativa + plano, ou null); `POST /api/subscription` ({planId} → cria/atualiza Subscription, 1 por conta,
  `currentPeriodEnd`=+intervalo, gera 1ª Invoice OPEN venc. hoje; idempotente na fatura OPEN). `src/lib/session.ts`
  (`getSessionAccountId`). Testado e2e no Neon (listar/assinar/consultar/reassinar sem duplicar). `tsc` limpo.
  → **HANDOFF Frontend+UI:** tela de escolha de plano — `GET /api/plans` → cards (preço em `priceCents/100`),
  ao escolher `POST /api/subscription {planId}`; mostrar assinatura atual via `GET /api/subscription`
  (`plan.name`, `currentPeriodEnd` = próximo vencimento). A fatura gerada aparece no painel financeiro (Fatia 3).
- ⬜ **Fatia 3 — Financeiro + vencimento (Banco/API):** `GET /api/invoices`; `POST /api/invoices/:id/pay`
  (manual → PAID, estende `currentPeriodEnd`, reativa conta); job diário marca OVERDUE/SUSPENDED após carência.
  → handoff Frontend: painel financeiro. → handoff Engine: **gate** (não disparar se conta SUSPENDED).
- ⬜ **Fatia 4 — Asaas (automático):** customer/subscription no Asaas, `POST /api/billing/asaas/webhook`
  (PAYMENT_CONFIRMED/OVERDUE → atualiza Invoice/Subscription/Account). Troca pagamento manual por PIX/boleto/cartão.
- ⬜ **Fatia 5 (futura) — multi-tenant real:** migrar o operacional (file-store) p/ Postgres com `accountId`.
- Ordem: GATE infra → 1 → 2 → 3 (Frontend consome cada uma) → 4 → 5. Cada fatia respeita o budget Medium e para.

## HANDOFF → lane Banco/API (estrutura/docs, 2026-06-22)
Levantado pela lane **Frontend+UI**. NÃO executei — cruza lanes. Quando Banco/API pegar:
1. **Tipos compartilhados:** `src/lib/mock-data.ts` (hoje só tipos) → mover p/ `src/types/`
   (ex.: `src/types/domain.ts`). Rename + atualizar imports. **18 arquivos** afetados:
   - Banco/API (8): `dispatch-store`, `business-health`, `groups-store`, `schedules-store`,
     `api/broadcasts`, `api/ad-campaigns`, `api/schedules`, `api/templates`.
   - Frontend+UI (10): páginas leads/crescer/campaigns/campanhas/groups/acquisition/indicacao/
     schedules/templates + `components/onboarding-checklist`.
   - Como toca os dois lados, fazer num passo coordenado (ou Banco/API renomeia e avisa Frontend+UI
     ajustar os imports das telas). Tipos = contrato compartilhado, dono = Banco/API.
2. **Consolidar docs num só diretório:** mover `system/*` → `docs/`. Preservar API_CONTRACTS, DB_SCHEMA,
   COMPETITIVE, PRICING, PROJECT_RULES, TASKS, TECH_DEBT. Resolver duplicação: "estado atual"
   (este `NEXT.md` vs `STATE.md` proposto — escolher UM nome) e changelog (`docs/CHANGELOG.md` limpo +
   `system/CHANGELOG.md` cru — manter os dois papéis, um diretório). Atualizar caminhos em
   `docs/context/*`, no `CLAUDE.md` raiz e no `devzap-engine/CLAUDE.md`.
3. **Estrutura:** `data/` permanece (é o "banco" atual). Garantir `import "server-only"` em todo store
   (já é o caso) p/ travar a fronteira front↔servidor em runtime. Opcional: `src/hooks/` (mover
   `use-campanhas.ts` — frontend, baixo risco).

Feito nesta passada (Frontend+UI): `docs/UI_RULES.md` criado.

## ÉPICO "Campanha que lota sozinho" (2026-06-22) — Banco/API ✅, Engine+Frontend ⬜
Origem: lane Frontend+UI (ver `system/COMPETITIVE.md` Teardown 2). Fatia visual JÁ FEITA (KPIs
**Grupos / Disponíveis / Cheios** + barra de lotação na tela Grupos).
- ✅ **Banco/API FEITO (2026-06-22), contrato em `API_CONTRACTS.md`:**
  1. **Cap de cliques** — `TrackedLink += clickCap?`; `/r/<slug>` para de redirecionar no cap (página "cheio").
  2. **Link mestre de campanha** — `Campanha += slug`; `/r/<slug>` roteia p/ o próximo grupo DISPONÍVEL
     (`inviteUrl` + `members < 95% capacity`), pula cheios e sem-convite. Clique grava `target` (JID).
  3. **`Group += inviteUrl?`** + `PATCH /api/groups` (painel seta convite/capacidade); sync da engine
     PRESERVA esses campos. Testado e2e com curl (roteia, pula cheio, cap bloqueia, 404).
- ✅ **Contrato de auto-grow PUBLICADO (2026-06-23, Banco/API)** — Engine SAIU do standby, pode implementar 4-5:
  - `capacity` confirmado CONSTANTE 1024 no app (Baileys não expõe; ver spike). Engine só manda `members`/`inviteUrl`.
  - **`POST /api/groups/grow/pending`** (token) → `[{ id, campaignSlug, subject, desc?, mediaId?, announce, memberAddMode }]`
    (avalia auto-grow proativo a 90% + claim atômico). **`POST /api/groups/grow/ack`** (token) →
    `{ id, status:"running"|"created"|"failed", whatsappGroupId?, members?, inviteLink?, error? }`.
  - No `created`, o app já registra o grupo no pool e aponta o `/r/<campanha>`. Trigger/numeração/template
    são do app (`Campanha.autoGrow`+`growTemplate`). Testado e2e (enfileira→claim→ack→pool→/r roteia).
- ⬜ **Engine (4-5, AGORA destravado):** implementar o poll de `grow/pending`, criar o grupo (`groupCreate`,
  `groupSettingUpdate announcement`, `groupInviteCode`…) e dar `ack created` com `inviteLink`. Reportar
  `inviteUrl`/`members` no sync `/api/groups` (campos já aceitos). RESPEITAR group-guard + fila. Popular por LINK.
- ⬜ **Frontend+UI (consome o contrato):** campo `clickCap` no form de link; campo `inviteUrl`/`capacity`
  por grupo (`PATCH /api/groups`); exibir/copiar o link mestre `/r/<campanha.slug>` (vem no `GET /api/campanhas`).
- **NÃO copiar** do DevZapp: dedup por cookie (já temos por telefone) e painel de cliques como produto-fim.
- Limitação conhecida: `members` defasa entre syncs da engine; `clickCap` por link é o freio fino nesse meio-tempo.

### SPIKE Engine (viabilidade Baileys 7, 2026-06-22) — NÃO implementado, só levantamento
Investigação no `@whiskeysockets/baileys` instalado. Fonte citada por arquivo:lib.

**(4) Limite real de membros (cap): NÃO existe na API do Baileys.**
- `GroupMetadata` (`lib/Types/GroupMetadata.d.ts:49`) só tem `size?: number` = contagem ATUAL,
  não o teto. `extractGroupMetadata` (`lib/Socket/groups.js:314`) faz `size = attrs.size ?? participants.length`.
- Não há campo de capacidade em lugar nenhum do tipo. O token `max_participants` existe no dicionário
  binário (`lib/WABinary/constants.js:352`) mas NÃO é parseado para `GroupMetadata` — inacessível pela API tipada.
- **Conclusão p/ o contrato:** a Engine reporta `members` (real) e **NÃO consegue** reportar `capacity` real.
  O cap de 1024 é constante do WhatsApp (server-side), não um dado consultável. → **manter `capacity: 1024` fixo
  no app** (constante de produto, não vinda da Engine). Se um dia o WhatsApp mudar p/ 1025/2048, é editar a constante.

**(5) Criar + auto-configurar grupo: TOTALMENTE viável.** Chamadas (todas em `lib/Socket/groups.js`):
- `groupCreate(subject, participants[])` → retorna `GroupMetadata` com `.id` (jid) já pronto. Pode criar com
  `participants: []` (só o dono). (`:70`)
- `groupUpdateDescription(jid, desc)` — descrição. (`:157`)
- `groupSettingUpdate(jid, "announcement")` — **"só admin envia"** (o que queremos p/ grupo de oferta). (`:258`)
  `"not_announcement"` reabre; `"locked"/"unlocked"` = só admin edita infos.
- `groupMemberAddMode(jid, "admin_add")` — só admin adiciona membros. (`:261`)
- `groupJoinApprovalMode(jid, "on"|"off")` — exigir aprovação p/ entrar. (`:264`)
- `updateProfilePicture(jid, content)` — foto do grupo (jid = grupo). (`Socket/chats.js:191`)
- `groupInviteCode(jid)` → **link de convite** (`https://chat.whatsapp.com/<code>`) p/ devolver ao pool da campanha. (`:171`)
- Cada uma é uma `groupQuery` separada = N stanzas ao servidor por grupo criado (≈6-7 ops no fluxo completo).

**(2) RISCO de criar/popular em massa — e dois sinais REAIS que o Baileys 7 expõe (leitura pura, monitorar):**
- `fetchAccountReachoutTimelock()` → `{ isActive, timeEnforcementEnds, enforcementType }` (`Types/State.d.ts:43`).
  Quando `isActive`, **o WhatsApp já bloqueia envios/chamadas** — é o `account_reachout_restricted` consultável.
- `fetchNewChatMessageCap()` → `{ total_quota, used_quota, cycle_start/end, capping_status: NONE|FIRST_WARNING|
  SECOND_WARNING|CAPPED }` (`Types/State.d.ts:87`). Cota OFICIAL de "mensagens p/ chats novos" + evento
  `message-capping.update`. É o orçamento real que add em massa / boas-vindas consomem.
- Estes dois são **monitoramento, não evasão** → OK pelo `DECISIONS.md`. A Engine pode passar a checar o
  reachout-lock ANTES de criar grupo e expor `used/total_quota` no heartbeat (pausa a fila se `CAPPED`/`isActive`).
- Gating proposto (Engine, via `group-guard.js` + fila): `create` já limitado a **2/10min** (`group-guard.js:11`).
  Para "lotar sozinho", criar grupo é raro (1 a cada vez que o anterior enche) → 2/10min sobra. O risco MAIOR
  não é criar, é **popular** (add de quem não te conhece = maior vetor de ban): `add` a **3/10min**
  (`group-guard.js:9`) + tudo pela fila anti-ban. Recomendo o produto **preferir LINK de convite** (membro entra
  sozinho) a `groupParticipantsUpdate(...,'add')` — entrada por link não dispara reachout-restricted.

**Shape que a Engine CONSEGUE reportar (p/ alimentar o contrato Banco/API):**
```
// por grupo (já hoje, no sync /api/groups):
{ whatsappGroupId, name, members }          // members = GroupMetadata.size (real). SEM capacity real.
// ao criar grupo novo (fluxo 5, quando o contrato existir):
{ whatsappGroupId, name, members, inviteLink, announce: true, createdByEngine: true }
// no heartbeat /api/session.stats (saúde do número — opcional, novo):
{ reachoutLock: { active, endsAt }, newChatCap: { used, total, status } }
```

**Handoff p/ Banco/API (o que a Engine PRECISA do contrato, quando for implementar 4-5):**
1. `capacity` permanece **constante do app (1024)** — Engine não fornece (Baileys não expõe). Confirmar no contrato.
2. Definir endpoint/payload p/ a Engine **registrar grupo recém-criado no pool** (provável `POST /api/groups`
   com `inviteLink` + flag de origem) e p/ o `/r/<campanha>` passar a roteá-lo. Banco/API publica o shape em
   `API_CONTRACTS.md`; a Engine só consome quando existir.
3. (Opcional) campo no heartbeat p/ os sinais `reachoutLock`/`newChatCap` se o app quiser exibir no HealthCard.
**Engine não implementa nada disto agora — aguarda o contrato (itens 1-3 do épico) ser publicado.**

#### Mensagem pronta p/ a lane Banco/API (colar no chat)
> **Engine → Banco/API — épico "Campanha que lota sozinho" (itens 4-5)**
> Spike do Baileys 7 fechado (ver acima, SPIKE Engine). Preciso de vocês p/ ligar a auto-criação de grupo:
> 1. **`capacity` fica constante 1024 no app** — Baileys não expõe o cap real; a Engine só manda `members`. Confirmem.
> 2. **Decisão "lotou → cria outro" é de vocês** (app conhece campanha/pool/template); Engine é só executora.
>    Publiquem em `API_CONTRACTS.md` o par claim/ack espelhando o disparo:
>    `POST /api/groups/grow/pending` → `[{id, campaignSlug, subject, desc?, mediaId?, announce, memberAddMode}]`
>    e `POST /api/groups/grow/ack` → `{id, status, whatsappGroupId, members, inviteLink, error?}`.
>    No `created`, vocês registram o grupo no pool e apontam o `/r/<campanha>` pra ele.
> 3. **Recomendo popular por LINK de convite, não `add` em massa** (link não dispara `account_reachout_restricted`)
>    — assim o `inviteLink` do ack já basta, sem endpoint de "adicionar membros".
> Engine só implementa 4-5 DEPOIS que (1-3) estiverem em `API_CONTRACTS.md`. Sem isso, standby.

#### RESPOSTA Banco/API → Engine (2026-06-23, colar no chat da Engine) — CONTRATO NO AR ✅
> **Banco/API → Engine — auto-grow publicado, podem implementar 4-5.**
> Subi tudo em `API_CONTRACTS.md` (seção "Auto-grow") e testei o ciclo e2e (enfileira→claim→ack→pool→/r roteia).
> 1. **`capacity` confirmado constante 1024** no app — vocês NÃO mandam capacity; só `members` e `inviteUrl`.
> 2. **Par claim/ack pronto, exatamente como pediram:**
>    - `POST /api/groups/grow/pending` (header `x-engine-token`) → `[{ id, campaignSlug, subject, desc?, mediaId?, announce, memberAddMode }]`.
>      Eu avalio o auto-grow (proativo a 90%) e claimo atômico antes de devolver. Job preso em `running` >15min → `failed`.
>    - `POST /api/groups/grow/ack` (token) → `{ id, status:"running"|"created"|"failed", whatsappGroupId?, members?, inviteLink?, error? }`.
>      No `created`, EU registro o grupo no pool e adiciono ao `groupIds` da campanha — o `/r/<campanha>` já roteia. Vocês não tocam pool/campanha.
> 3. **Fluxo sugerido por job:** `groupCreate(subject,[])` → `groupSettingUpdate(jid,"announcement")` se `announce` →
>    `groupMemberAddMode(jid, memberAddMode)` → `groupInviteCode(jid)` → `ack created` com `whatsappGroupId`+`inviteLink`.
>    Popular por LINK (o `inviteLink` basta). Respeitem group-guard (create 2/10min) + fila anti-ban.
> 4. **Trigger é meu** (app decide "lotou→cria"); vocês são só executores do que vier no pending. Liguem o poll junto do de disparo.
> 5. (Opcional, quando quiserem) heartbeat com `reachoutLock`/`newChatCap` p/ o HealthCard — me avisem o shape e eu exponho.

## ✅ Feito
- Engine→app validado no número real (conecta, grupos admin, entrada→lead).
- App 100% sem mock: session/dashboard/reports/settings/grupos/leads reais;
  templates/broadcasts/schedules/ad-campaigns persistem (criar/listar/excluir).
- Botões mortos resolvidos.
- SPRINT 1 (anti-ansiedade): stats da engine no heartbeat → HealthCard (número saudável/
  conectado há X/densidade). Dashboard reorientado (entraram hoje, meta semanal, entrada≠venda).
  Onboarding checklist. Grupos parados (B5). Biblioteca de modelos prontos (B4).
- SPRINT 2: boas-vindas automáticas — DM real na entrada do grupo, via fila anti-ban,
  respeitando opt-out, toggle+texto no Settings (/api/welcome). Primeiro disparo REAL do produto.
- SPRINT 3 (resto das sugestões aprovadas): Modo Operador /hoje (D3), checklist diário (D4),
  ranking de grupos (B1), banner de desconexão (C3), labels "estimada" (C4). Build OK.
- V2 SPRINT 1 (reposicionamento): terminologia sem jargão + HOME Central de Resultados
  (card principal, funil honesto, próxima ação única, saúde do negócio 0-100, saúde do número).
  lib business-health.ts. Build OK.

## BLOQUEADORES P/ COBRAR (auditoria 2026-06-21) — STATUS
- ✅ **AUTENTICAÇÃO** FEITA: lib/auth.ts (cookie HMAC) + middleware.ts (protege páginas/API, libera
  /login /api/auth /r/), login/logout reais, engine via x-engine-token. Senha em APP_PASSWORD (.env.local).
- ✅ **RACE nas escritas** FEITA: lib/atomic-fs.ts (tmp+rename + lock serial por arquivo); todos os stores.
- ✅ **claimPending atômico** FEITO (transact sob lock) + **job preso em "running"** recuperado (>15min sem
  ack → failed). Campaign += runningSince/lastAckAt.
- ✅ **leads dedupe** (upsert por telefone + alsoIn), **status editável** (PATCH+select, destrava "comprou"),
  **delete LGPD**, **opt-out filtra captura** + remoção. Copy do opt-out corrigida.
- ⬜ **MULTI-TENANT**: AINDA single-tenant (data/ global, sem tenantId). Modelo provisório = 1 deploy/cliente.
  Próxima grande alavanca: migrar p/ SQLite/Postgres COM tenantId (resolve multi-tenant + dá base sólida).
- ⬜ Estado anti-ban/warmup em MEMÓRIA reseta no restart (engine) — persistir contadores/warmup no boot.
- ⬜ middleware.ts: Next avisa deprecação (sugere "proxy"). Funciona; renomear quando migrar de versão.

## V2/V3 — o que falta (ordem)
- ✅ **MOTOR DE DISPARO REAL** (ponte app→engine) FEITO (2026-06-21). Oferta → "Enviar agora" →
  fila `queued` → engine puxa (loop 10s) → dispara 1/grupo pela fila anti-ban → progresso real.
  Rotas /api/dispatch[/pending][/ack], lib/dispatch-store.ts. Testado end-to-end.
- ✅ **Execução dos AGENDAMENTOS** FEITO (2026-06-21). Agendamento aponta p/ oferta real; a rota
  /api/dispatch/pending promove os vencidos→queued antes de claimar (sem timer). Recorrência reprograma
  sozinha. lib/schedules-store.ts. Testado. CICLO DE DISPARO COMPLETO (enviar agora + agendar).
- ✅ **Piloto Automático "LOTAR MEU GRUPO"** FEITO (2026-06-21). Tela /crescer, wizard 3 objetivos
  (lotar/vender/reativar) orquestrando links+broadcasts+dispatch+schedules. Testado e2e.
  Falta: validar disparo real ligado na engine (teste de fogo) + persistir estado anti-ban no restart.
- Modelar PEDIDOS (registro manual de venda) → destrava etapas do funil (pedido/recompra/cliente ativa)
  e o "+pedidos" real. Hoje só temos lead.status=comprou (manual).
- Medir ATIVIDADE no grupo (msgs/reações) → destrava etapa "interação" + score de qualidade (B6/D2).
- Biblioteca de campanhas por categorias V2 (Lançamento/Reposição/Queima/Kits/Frete/Combo) — polish do B4.
- Wizard de primeiros passos com vídeo (V2#6) — falta gravar os vídeos.

## Falta (observação no tempo)
- Sobrevivência do número (ban) — agora COM disparo real (boas-vindas). Ligar com volume baixo,
  observar a taxa de entrega no HealthCard. É o teste de fogo do Sprint 2.

## Próximas tasks de build (ordem sugerida)
- ✅ **Disparo real de BROADCAST** FEITO — era duplicata do "MOTOR DE DISPARO REAL" do V2 SPRINT.
  Confirmado em 2026-06-22: 3 broadcasts reais enviados (queued→running→sent) em broadcasts.json.
  Contrato agora documentado em API_CONTRACTS.md (rotas /api/dispatch[/pending][/ack], /api/broadcasts).
- ✅ **Execução de agendamentos** FEITO — sem worker dedicado; /api/dispatch/pending promove vencidos.
1. **Atribuição do lead ao clique** (Caminho A) — casar entrada no grupo com o clique recente do link.
2. **Backend Postgres/Prisma + multi-sessão (N números) + auth JWT** — sair do file-store.
3. Integração Meta Ads API (depois do kit manual validar).
4. Meta semanal (WEEKLY_GOAL) e limites anti-ban viram CONFIG editável (hoje hardcoded no app/engine).
5. Score de qualidade / atividade no grupo (B6/D2) — precisa capturar msgs/reações (lift maior).

## Handoff (lane Banco/API → Engine)
- ⬜ **Espelhar roteiro de feature no `devzap-engine/CLAUDE.md`**: o CLAUDE.md raiz de `devzap-groups`
  ganhou o bloco **"Feature nova → roteiro"** (triagem espinha→lanes→ordem→próxima lane antes de codar).
  A lane Engine vive noutra pasta, fora da minha fronteira. Colar o mesmo bloco em `devzap-engine/CLAUDE.md`
  pra que uma feature descrita primeiro no chat da Engine também rode a triagem. (Pedido do Igor, 2026-06-22.)
- ⬜ **Variáveis de template no broadcast**: o app já grava mensagens com `{nome_loja}`, `{preco}`,
  `{link_catalogo}` além de `{nome}`, mas o contrato de welcome diz "{nome} é a única variável".
  Engine: definir quais variáveis expande no disparo (e o app envia os valores) ou tratar como texto literal.
  Sem isso, o lojista pode ver `{preco}` cru na mensagem enviada. Detalhe em API_CONTRACTS.md (seção Aberto).

## UX round 2 (pendente — melhorias de polish)
- ✅ Loading skeletons no 1º fetch — `components/ui/skeleton.tsx` + estado `loaded` em todas as
  telas client com lista (groups, leads, campaigns, campanhas, templates, schedules, indicacao,
  acquisition) + settings (conexão sem flash de "Desconectado" + opt-out). crescer pulado (wizard,
  sem pisca na 1ª pintura). typecheck OK. (2026-06-22, lane Frontend+UI.)
- Validação inline de formulário (msgs de erro, não só botão disabled).
- Modais: fechar no Esc + trap de foco (links "Novo link" e similares).
- Trocar `<a href>` por `next/link` nas navegações internas (groups/leads → /campaigns).
- Tela de login: virar real (auth) — hoje qualquer credencial entra.
- Revisar contraste/aria nos ícones-botão restantes.

## Dívida
- `mock-data.ts` agora só tem tipos → renomear p/ `types.ts` (atualizar imports).
- File-store → Postgres. Ver TECH_DEBT.md.
