# Perfil do número e fila rápida — desenho

> **Data:** 2026-09-03 · **Status:** **APROVADA pelo Igor em 03/09/2026** — D1, D2, D7 e D8 (marcadas ⚠️) confirmadas por escrito; a execução acontece numa sessão nova com o Sonnet 5 como controlador, seguindo o plano ·
> **Origem:** diagnóstico "Fila e velocidade sem ban" (mesma data) ·
> **Plano:** `docs/superpowers/plans/2026-09-03-perfil-do-numero-e-fila-rapida.md`

## 1. Problema, com os números medidos em produção (03/09)

| Sintoma que o lojista sente | Causa medida | Onde |
|---|---|---|
| "Limite baixo de mensagens por dia" | Warm-up de **20/dia** aplicado a todo número, com reset a cada **72 h** parado. O número do Igor (conectado desde agosto) está em `warmup_graduated=false` e recomeçou o dia 1 em 01/09. 13 `send_media` esperaram **13 h em média, 21 h 30 no pior caso**. | `app.instance_daily_cap`, `app.record_send` |
| "Demora de envio" | Caps fixos **8/min · 120/h · 800/dia** herdados do motor de DM. 91 grupos = 12 min por oferta; 800/dia = 8 ofertas. | `app.claim_send_commands` |
| "Trocar foto demora e entra na fila" | A Evolution leva **3,5 s** por foto. A fila levou **230 s em média** de espera: o worker roda envio, lote, grow e manutenção **em série** num só `while`, com claim por HTTP na Vercel a cada job e `sleep(3 s)` no fim. Cadência efetiva ≈ 1 job a cada 8–16 s, não 4 s. | `apps/worker/src/index.ts:184-296`, `bulk-loop.ts` |
| "Revisar links entra numa fila de demora" | `check_invite` a **1 por minuto** por tenant (D7, PR #238). É um `GET`. 91 grupos = 1 h 31. | `claim_bulk_jobs` |
| Convites faltando por dias | Backfill em cron **diário** de 10 por instância (Hobby da Vercel recusa cron de 10 min). | `api/cron/group-invites` |

O que **não** está errado e fica como está: gap gaussiano 3–7 s entre envios do mesmo número, circuit breaker (5 falhas → 60 s), "nunca DM", `failed` terminal no lote. São eles que evitam rajada, e rajada em metadata de grupo é o único padrão com erro documentado (429 `rate-overlimit`, Baileys FAQ / #797 / Evolution #691).

## 2. Decisões

**D1 — O perfil do número combina três sinais, e a declaração só rebaixa.** ⚠️
O lojista declara ao conectar: *"Esse número é novo (menos de 30 dias)"* ou *"Uso há mais de 30 dias"*. A evidência vem do sync: quantos grupos o número administra com 10+ membros. A graduação vem do estado anti-ban (7 dias de rampa completos).

Composição, nesta ordem:
1. graduou → `veterano` (promoção vence tudo);
2. declarou `novo` → `novo` (a declaração de risco vence a evidência: um chip virgem promovido a admin de 91 grupos no dia 1 é exatamente o caso perigoso);
3. declarou `antigo`, **ou** administra 5+ grupos com 10+ membros → `veterano`;
4. senão → `novo`.

Por que a mentira é inofensiva: um chip virgem que declara "antigo" não tem grupos, e o teto é proporcional aos grupos (D2). Ele ganha `veterano` no rótulo e 300/dia no número, que não consegue usar.

`numero_perfil = null` só existe para instâncias criadas antes desta mudança; para elas a evidência decide (o número do Igor vira `veterano` no mesmo instante).

**D2 — Os tetos são proporcionais à base de grupos, com piso e teto.** ⚠️

| Perfil | /min | /hora | /dia |
|---|---|---|---|
| `veterano` | 10 | `least(400, greatest(60, grupos × 3))` | `least(1500, greatest(300, grupos × 15))` |
| `novo` | 8 | `least(150, greatest(40, rampa))` | `least(800, greatest(40, grupos × 6), rampa)` |

`rampa = round(40 × 1,6^dia)`: 40, 64, 102, 164, 262, 419, 671; gradua no dia 7. `grupos` = grupos admin do tenant com `members >= 10`. Para 91 grupos: veterano 1.365/dia e 273/h; 200 grupos: 1.500/dia e 400/h.

Honestidade: nenhuma fonte certifica 1.500/dia. A comunidade (baileys-antiban) opera em 200/h · 1.500–2.000/dia e o lojista já ultrapassa isso na mão. Por isso D7.

**D3 — Reset do warm-up passa de 72 h para 14 dias, e só para quem não graduou.** Alinha com a janela em que o próprio WhatsApp desloga dispositivos vinculados. Feriado prolongado deixa de zerar o número.

**D4 — Sinal de rate-limit vira pausa longa.** Resposta 429 ou corpo com `rate-overlimit` na Evolution → `paused_until = now() + 30 min` no número, em vez dos 60 s do breaker. Sem coluna nova. É a única resposta do WhatsApp que enxergamos, e ela passa a valer como freio.

**D5 — O worker deixa de ser um `while` só.** Três loops independentes (envio a 1 s, lote a 4 s, grow no intervalo próprio), cada um com guarda de reentrada. No lote, o claim continua 1 por tenant por tick, mas a execução (Evolution + ack) **não bloqueia o próximo tick**: o espaçamento passa a ser no *início* da operação, que é o que o WhatsApp vê. Tenants correm em paralelo (`Promise.allSettled`); dentro do tenant, uma operação a cada 4 s. Envio: linhas do claim são de instâncias distintas por construção, então também correm em paralelo.

Descartado: rota síncrona para lote de 1 grupo. Com o loop corrigido, uma foto leva ≈ 4 s de tick + 3,5 s de Evolution + 3 s de polling da tela ≈ 10 s. A rota síncrona economizaria 7 s e duplicaria o cliente Evolution no web app. Reabrir só se a latência da Evolution subir.

**D6 — Leitura não tem cadência de escrita.** `check_invite` perde a janela de 60 s e corre no ritmo do lote (15/min): 91 grupos em 6 min. O backfill de convite sai do cron: ao fim do sync, os grupos admin sem `invite_url` e sem marcador de falha entram como `check_invite` na mesma fila. Cron, rota e entrada na allowlist morrem.

**D7 — Rollout por instância, medido.** ⚠️ A migração muda o padrão para todos, mas a tela de saúde passa a mostrar perfil, tetos e motivo. Durante 14 dias o controlador observa em prod: `record_send_failure` com `rate_limited=true`, `paused_until` de 30 min, e `engine_events` com `429`. Qualquer ocorrência → reverter `1500 → 800` e `400 → 240` na função (um `create or replace`), e investigar.

**D8 — A tela explica a espera.** ⚠️ Conectar ganha a pergunta do perfil antes de gerar o QR. Saúde do número mostra "Veterano · até 1.365 mensagens/dia e 273/h, pelos seus 91 grupos" ou "Novo · dia 3 de 7 · teto de hoje 102". Disparos mostram "Enviando 38 de 91 · ≈ 6 min".

## 3. Mudanças por camada

### 3.1 Banco (uma migração por PR, aplicada nos DOIS bancos)

**PR A — `20260904100000_perfil_do_numero_e_caps.sql`**
- `instances.numero_perfil text` com `check in ('novo','antigo')`, nullable.
- `app.instance_caps(uuid) returns table(perfil, per_min, per_hour, per_day, admin_groups, warmup_day, graduated)` — a única fonte dos tetos (D1 + D2).
- `app.instance_daily_cap(uuid)` vira wrapper de `instance_caps.per_day` (mantém o contrato de quem já chama).
- `app.claim_send_commands` troca `< 8`, `< 120` e `instance_daily_cap` por um `cross join lateral app.instance_caps(cand.instance_id)`.
- `app.record_send`: `interval '72 hours'` → `interval '14 days'`.
- `app.record_send_failure(uuid, uuid, rate_limited boolean default false)` — drop + create das duas (app e public), grants refeitos, pausa de 30 min quando `rate_limited`.
- `app.instance_health` / `public.instance_health` — drop + create com 4 colunas novas: `perfil text`, `per_hour integer`, `per_min integer`, `admin_groups integer`; `daily_cap`, `warmup_day` e `warmup_graduated` passam a vir de `instance_caps`.

**PR B — `20260904110000_check_invite_sem_janela.sql`**
- `public.claim_bulk_jobs` recriada sem o predicado `action <> 'check_invite' or not exists (... 60 seconds)`. Revoke/grant repetidos.

O gate de drift do CI só enxerga coluna nova (`numero_perfil`); corpo de função e CHECK não entram no hash. Conferir nos dois bancos com `pg_get_functiondef` como o PR #238 fez, e atualizar `deploy/supabase/schema-baseline.json` + `apply-order.txt`.

### 3.2 Web app

- `POST /api/instances` aceita `numero_perfil` (`'novo' | 'antigo'`). Valor inválido → 400; ausente → grava `null` (compatível com o E2E, que cria instância sem o campo). A obrigatoriedade é da tela, não da API.
- `/painel/conectar`: quando não há instância, mostra a pergunta e só cria após a escolha.
- `lib/instance-health.ts`: `InstanceHealthRow` e `NumberHealth` ganham `perfil`, `perHour`/`hourlyCap`, `perMin`/`minuteCap`, `adminGroups`.
- `numero-saude.tsx`: badge de perfil, teto do dia e da hora vindos da RPC, copy explicando o motivo. Some o "teto de 120/h" hardcoded.
- `invite-review.ts`: `LEITURAS_POR_MINUTO = 15`; `etaRevisaoMin(91) = 7`.
- `api/groups/sync`: após `syncGroupsFromProvider`, enfileira `check_invite` para grupos admin sem convite e sem `metadata.inviteFetch`, pulando os que já têm job `queued`/`running`.
- Remover: `api/cron/group-invites/route.ts`, entrada em `vercel.json`, path na allowlist de `request-access-policy.ts` (+ teste), `selectBackfillCandidates`/`rotateByDay` e `backfill-run-log.ts` se ficarem sem importador.
- `/painel/disparos`: pílula com progresso e ETA.

### 3.3 Worker

- `index.ts`: `startLoop(nome, intervaloMs, tick)` com guarda de reentrada; loops de envio (`WORKER_SEND_POLL_MS`, default 1000, mín 250), lote (4 s) e grow (5 min) independentes do loop de eventos/manutenção (`pollMs`).
- `bulk-loop.ts`: `runBulkTick` roda tenants com `Promise.allSettled`; `runTenant` claima 1 job e dispara `executeAndAck` **sem await**, registrando a promise em `inFlight`; `drainInFlight()` no shutdown.
- `send-loop.ts`: linhas processadas com `Promise.allSettled`.
- `send-command.ts` + `evolution-sender.ts`: `EvolutionSendError.status === 429` ou detalhe contendo `rate-overlimit` → `recordSendFailure(instanceId, tenantId, true)`.

## 4. Fora de escopo (e por quê)

- Fórmula acima de 1.500/dia ou 400/h — só depois dos 14 dias de D7.
- Spintax / variação de mensagem (R4 da análise de 28/08) — outro PR.
- Pré-voo de admin antes de enfileirar (R5) — outro PR; interage com o breaker, merece spec própria.
- Editar a declaração depois de conectar — a evidência corrige sozinha em 1 sync; UI de edição é YAGNI até alguém pedir.
- Cache de metadata de grupo na Evolution (`CACHE_LOCAL_ENABLED`) — é env no Coolify, não código; entra como item do checklist de deploy do PR C.

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Teto novo dispara 429 | D4 pausa 30 min; D7 reverte com um `create or replace` |
| Chip virgem declara "antigo" | Teto proporcional aos grupos (D2) limita o dano a 300/dia sem grupos onde postar |
| Lote paralelo entre tenants sobrecarrega a Evolution | Cada tenant continua 1 op/4 s; Evolution atende N instâncias por desenho |
| Fire-and-forget perde ack se o worker morrer | `STALE_RUNNING_MS` já devolve `running` preso para `failed` em 5 min; a tela oferece "reaplicar nos que falharam" |
| Drop/create de função perde ACL | Cada migração repete `revoke ... from public, anon, authenticated; grant ... to service_role` |
| `apps/web` apagado do disco no checkout principal (823 arquivos) | Todo trabalho em worktree novo a partir de `origin/main`; nada é commitado no checkout principal |
