# Spec — Anti-ban portado (Sprint 5 · F4 · lane Engine/Worker)

> Status: **DECISÃO TOMADA → Opção C (cota/estado no banco)** — Igor, 2026-07-29.
> Escopo: `apps/worker` (worker novo, TS) falando com a Evolution API. **Não toca `apps/web`.**
> Fatias: (1) fundação de banco — estado por instância + RPCs + warmup em SQL ← ESTA;
> (2) senders + fiação no worker + testes; (3) fan-out broadcast + prioridade.

## 1. O que a F4 precisa entregar

Trocar o consumidor de `engine_commands` do **engine legado Baileys** (in-process,
`hubflow-engine/queues/supabase-command-worker.js` + `anti-ban-queue.js`) por um
**sender no `apps/worker`** que fala HTTP com a Evolution API — mantendo o mesmo
ritmo anti-ban por número.

### Restrição inviolável (contrato de cutover)
O sender novo **honra o mesmo payload** de `type:'send_message'` em `engine_commands`:

```jsonc
// engine_commands.payload para send_message (contrato ATUAL, não mudar)
{ "jid": "5511999999999@s.whatsapp.net", "text": "..." }
// aceitos hoje pelo worker legado (compat, manter): payload.phone (→ jid) e payload.message/body (→ text)
```

Fonte: `supabase-command-worker.js:38-45,102-112` (`toWhatsAppJid`, `handleCommand`).
O **executor de automações (PR #30)** já roda hoje escrevendo esses comandos; ele
é agnóstico a quem consome. Se o shape mudar, o executor quebra no cutover. → **congelado.**

O que muda é só o **transporte** (Baileys `sock.sendMessage` → `POST` Evolution
`/message/sendText/{instance}`) e **onde vive o estado anti-ban**. O contrato da fila,
não.

## 2. O problema que trava a F4 (por que não é só "portar o código")

O anti-ban de hoje é um **governor em memória, por processo**:

- `anti-ban-queue.js`: `sentTimestamps[]` na instância da classe; caps
  **8/min · 120/h · 800/dia** (`index.js:105-129`), delay gaussiano 3–7s entre envios,
  backoff, circuit breaker.
- `warmup.js`: rampa de volume (dia1=20, ×~1.5–2.2/dia, gradua em 7 dias) que **reduz o
  teto diário** via `getDailyCap`.
- `group-guard.js`: janelas de operação de grupo (add 3/10min, create 2/10min…).

No engine legado isso é **correto por acidente de topologia**: **1 processo = 1 número**
(um `sock` Baileys). Um governor por processo = um governor por número.

Dois fatos quebram isso na F4:

1. **N réplicas, uma fila.** `engine_commands` é fila única drenada por
   `claim_engine_commands` (SKIP LOCKED, migration `20260713120000`). Com N workers,
   cada réplica teria seu próprio `sentTimestamps[]` → **cada uma libera a cota cheia**
   (8/min vira 8×N/min no mesmo número) = **risco de ban**. O contador em memória não é
   compartilhado entre réplicas.
2. **1 processo agora = N números.** Mesmo com **1 réplica só**, o worker novo é
   multi-tenant: consome comandos de **várias `instances`** (vários números). O governor
   global-por-processo do legado somaria envios de números diferentes no mesmo balde —
   **a cota anti-ban é por número (`instance_id`), não global.** Portar 1:1 já estaria
   errado aqui.

Corolário: **o estado anti-ban tem que ser chaveado por `instance_id`** em qualquer
opção — e, com N réplicas, **compartilhado**. Some-se a dívida já registrada
(`NEXT.md`: "Estado anti-ban/warmup em MEMÓRIA reseta no restart") — um restart do
worker não pode liberar cota nova.

## 3. Invariantes (valem para A, B e C)

- **I1 — Cota por número.** Caps min/hora/dia e warmup são por `instance_id`.
- **I2 — Nunca 2× a cota.** Sob qualquer nº de réplicas, o total enviado por um número
  respeita os caps. Zero double-send.
- **I3 — Restart não libera cota.** Estado sobrevive a crash/redeploy (Coolify faz
  `SIGTERM` + novo container).
- **I4 — Ritmo humano preservado.** Gap gaussiano 3–7s **entre envios do mesmo número**
  (números diferentes correm em paralelo).
- **I5 — Warmup respeitado.** Número novo rampa 7 dias; teto diário reduzido enquanto aquece.
- **I6 — Contrato de payload congelado** (seção 1). `type:'send_message'` `{jid,text}`.
- **I7 — Só controle operacional seguro.** Nada de fingerprint/proxy/stealth/evasão
  (`hubflow-engine/DECISIONS.md`). Portamos WarmUp/Guard/DeliveryTracker/jitter; ponto.

## 4. As três opções

### A — Sender único (singleton)
Exatamente **1 réplica** faz envio. O governor em memória (por `instance_id`) fica correto
porque um só processo vê todos os envios de todos os números. Um lock/lease no banco
(`sender_leader`) garante que, se alguém subir uma 2ª réplica, ela **não envia** (fica só
em standby ou só na captura de leads/loop B).

- **Prós:** menor diff; reusa `anti-ban-queue.js`/`warmup.js` quase 1:1 (só re-chaveados por
  instância). Serialização por número é trivial (in-process).
- **Contras:** **I3 exige persistir** o estado mesmo assim (senão restart zera) → já não é
  "só memória". Sem escala horizontal no envio. Sender morto = fila de envio parada até o
  lease expirar e outro assumir (janela de indisponibilidade). Ponto único de falha.
- **Cutover-safety:** alta (comportamento ~idêntico ao legado, 1 processo). 
- **Custo real:** baixo-médio (lease de líder + persistência do estado).

### B — Afinidade instância→worker (sharding)
Cada `instance_id` é **dono de exatamente um worker** (hash consistente ou claim de posse
com lease). O worker dono roda o governor em memória para **suas** instâncias.

- **Prós:** escala horizontal de verdade; reusa a fila por instância; cada número tem um só
  governor vivo.
- **Contras:** **rebalanceamento é o inferno** — quando N muda (deploy, crash, scale), a
  posse migra; durante o handover **dois donos** = risco de 2× cota (viola I2) se o lease
  não for perfeito. Ainda precisa persistir estado (I3) ou o novo dono libera cota nova.
  Complexidade alta para um ganho (escala) que **não precisamos** no volume atual
  (~10 números, 8/min cada = trivial p/ 1 processo). Prematuro.
- **Cutover-safety:** média (mais partes móveis, mais modos de falha novos no cutover).
- **Custo real:** alto.

### C — Cota/estado no banco (stateless workers) — **RECOMENDADA**
O estado anti-ban vive no **Postgres**, por `instance_id`. Workers ficam **stateless**
(igual ao loop B da F3: deps injetadas, sem estado local). O anti-ban entra **no próprio
claim** — que já é atômico (`SKIP LOCKED` + lease).

Mecanismo concreto:

- **Migration nova** (lane Engine/Worker escreve SQL; o worker só chama RPC — mesmo padrão
  de F0–F3). Por instância:
  - `instance_sends(instance_id, sent_at)` append-only (podado > 24h) → conta janelas
    min/hora/dia. ~800/dia/número × 10 = ~8k linhas/dia, podadas: trivial.
  - `instance_send_state(instance_id, warmup_started_at, warmup_graduated,
    next_send_allowed_at, paused_until)` — warmup, gate de espaçamento, circuit breaker.
- **`claim_send_commands(max, node)`** (novo RPC, irmão do `claim_engine_commands`): só
  devolve comandos `send_message` cujo `instance_id` está **pronto** —
  (a) `paused_until` no passado, (b) sob min/hora/dia contando `instance_sends` **e**
  aplicando o teto do warmup, (c) `next_send_allowed_at <= now()`. Devolve **no máx. 1
  comando pronto por instância** por tick → serializa por número; números distintos correm
  em paralelo. Marca `processing` + lease (reusa o padrão do v2).
- **`record_send(instance_id)`** (pós-envio OK): insere timestamp e grava
  `next_send_allowed_at = now() + gap` (gap gaussiano 3–7s) → espaçamento I4 e caps I1
  ficam **corretos entre réplicas por construção**.
- **Warmup** (`warmup.js`) porta para SQL: dia = `floor((now - warmup_started_at)/1d)`;
  teto = `day1Limit * growth^dia`, `∞` após 7 dias; reentra em warmup após inatividade.
  Chaveado por instância.
- **Circuit breaker** por instância: N falhas seguidas → `paused_until = now()+cooldown`
  (o backoff por-comando de `complete_engine_command` já cobre a retentativa individual).
- **Comandos que não são envio** (`refresh_status` etc.) seguem pelo `claim_engine_commands`
  normal, sem gate anti-ban.

- **Prós:** satisfaz I1–I5 **por construção, em qualquer nº de réplicas** (inclusive 1);
  **resolve a dívida do restart de graça** (estado é o banco, não a memória); é **extensão
  do mecanismo já enviado** (claim/lease/SKIP LOCKED da F0–F3), não subsistema novo;
  worker stateless combina com o design da F3.
- **Contras:** +1 round-trip de DB por envio (irrelevante no volume; o gargalo é o HTTP da
  Evolution + o gap de 3–7s); warmup/breaker viram SQL (mais verboso que a classe JS);
  DeliveryTracker (taxa de entrega) fica como follow-up (derivável de `engine_events`
  `message_sent` vs status da Evolution — não bloqueia o cutover).
- **Cutover-safety:** alta (contrato de payload intacto; caps idênticos; só muda onde o
  contador mora). Dá para deployar com **1 réplica hoje** e ir para N sem redesenho.
- **Custo real:** médio (uma migration + 2 RPCs + porte de warmup/gate; senders são finos).

## 5. Recomendação

**C — cota/estado no banco, embutida num claim instância-aware.** É a única opção que é ao
mesmo tempo (1) correta sob qualquer contagem de réplicas incluindo a atual (1),
(2) restart-safe (fecha a dívida já listada no `NEXT.md`), e (3) continuação natural do
claim/lease que já shipou nas F0–F3. Deploya com 1 réplica agora; ir para N fica seguro sem
redesenho. **A** é o "menos código" mas ainda exige persistência (I3) e não escala; **B** é
escala que não precisamos e traz o risco de handover (2× cota) bem na hora do cutover.

Todas as três honram o contrato `{jid,text}` — a escolha é ortogonal ao payload; é só sobre
**onde o contador de ritmo mora**.

## 6. Depois de A/B/C escolhido (não fazer antes)
1. (C) Migration: `instance_sends` + `instance_send_state` + `claim_send_commands` +
   `record_send` + warmup em SQL; RPCs `service_role`-only (padrão do v2).
2. `apps/worker`: `evolution-sender.ts` (POST `/message/sendText`, resolve `instance` via
   `instances.provider_instance_id`), `send-loop.ts` (claim→send→record/complete), fiação no
   `index.ts` ao lado do loop B.
3. Testes puros (fixtures + deps fake, como `lead-capture.test.ts`): caps por janela, gate de
   espaçamento, warmup, breaker, mapeamento `{jid,text}`→Evolution, idempotência no requeue.
4. Fan-out de broadcast + lease/retry (já no esqueleto do v2) e prioridade
   (welcome=10 fura broadcast=100).
5. Handoff/registro no `TASK_PROGRESS.md` (F4) e, se C, sugerir `rag insert` da decisão.
