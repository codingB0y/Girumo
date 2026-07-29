# Executor de Automações — Plano

> Data: 2026-07-29. Estado: proposto (não implementado).
> Contexto: a tabela `automations` existe e o CRUD funciona (`/painel/automacoes`), mas
> **nada roda os `steps`**. Este plano cobre o que falta.

## Mapa de lanes (roteiro obrigatório do `apps/web/CLAUDE.md`)

1. **Espinha:** Banco/API — precisa de dado novo (`automation_runs`) e de RPCs de claim.
2. **Lanes tocadas:**
   - **Banco/API** — migração `automation_runs` + RPCs (`claim`/`advance`/`finish`/`requeue`).
   - **Engine/Worker** (`apps/worker`) — o tick que consome os runs e avança os passos.
   - **Frontend+UI** — nenhuma mudança nesta fase (`total_runs`/`last_run_at` já existem na tabela
     `automations` e a tela já os lê).
3. **Ordem:** contrato primeiro (migração + RPCs) → worker consome.
4. **Próxima lane:** começar por Banco/API (camada 1 abaixo); o worker só entra quando as RPCs existirem.

---

## Decisão de arquitetura

O executor tem **três camadas**, e a escolha da fila de envio é a menos importante das três.

```
[2] Triggers          → cria runs        (lead_entered, group_full, group_stalled, weekly_recurring)
[1] Máquina de estado → avança passos    (automation_runs: passo atual, quando dispara o próximo)
[3] Primitiva de envio→ posta no grupo   (engine_commands type=send_message)
```

### Por que `engine_commands` e não `broadcasts`

`engine_commands` com `type:'send_message'` **já funciona ponta a ponta hoje**:
`queues/supabase-command-worker.js:102-106` consome, chama `sendText(sock, jid, text)`, que passa
pela fila anti-ban antes do `sock.sendMessage`. O que nunca existiu é um *produtor* desse tipo — a
UI só emite `refresh_status`.

Consequência: escrevendo em `engine_commands` o executor funciona **agora** (via engine legado) e
continua funcionando **depois** do F4/F5 — o cutover troca o *consumidor* da fila, não o produtor.
O executor nunca precisa ser reescrito. Escrever em `broadcasts` seria construir sobre um caminho
que o F5 já prevê deletar ("rotas engine-only deletadas").

A tabela também já traz o que o executor precisa, nativamente:

| coluna | uso no executor |
|---|---|
| `available_at` (NOT NULL, default `now()`) | agendamento de passo com `delay_minutes` |
| `dedupe_key` (unique por tenant) | idempotência: `auto:<run_id>:<step_idx>` |
| `priority` (default 100) | mensagem de automação passa na frente de fan-out de broadcast |
| `instance_id` (NULLABLE) | não amarra a automação a uma instância específica |

### ⚠️ Guarda-corpo obrigatório: nunca DM

`broadcasts` é estruturalmente só-grupo (só tem `group_ids`, não existe campo de telefone).
`engine_commands.payload` **aceita `phone`** e mandaria DM alegremente
(`supabase-command-worker.js:39-41`). Isso violaria a decisão anti-ban do Igor (28/07, registrada no
cabeçalho da migração `20260728145600_automations.sql`): *"nenhum passo envia DM; toda mensagem é
postada nos grupos"*.

**Ao migrar para `engine_commands` perde-se essa garantia estrutural.** O helper de enqueue do
executor DEVE validar que o destino é JID de grupo (`@g.us`) e nunca emitir `payload.phone` —
com teste cobrindo a rejeição.

### Por que no `apps/worker` e não em cron da Vercel

- Os `delay_minutes` são de 5 min a 1440 min. O `vercel.json` só tem crons **diários**
  (`0 12 * * *`, `0 9 * * *`) — granularidade insuficiente.
- O trigger `lead_entered` nasce exatamente onde o worker já trabalha:
  `apps/worker/src/lead-capture.ts` → `upsert_lead`.
- O padrão de loop (`claim` → processa → `complete` → `requeue_stale`) já está provado em
  `apps/worker/src/event-loop.ts`.

**Pré-requisito:** o `apps/worker` precisa estar de fato deployado (`deploy/coolify/worker.docker-compose.yml`).
Confirmar antes da camada 2 — sem worker no ar, nada dispara.

---

## Camada 1 — Máquina de estado (COMEÇAR AQUI)

### 1.1 Migração `automation_runs`

`apps/web/supabase/migrations/<ts>_automation_runs.sql`. Espelha o padrão de
`20260727120000_leads_and_worker_reads.sql` (claim com lease + requeue de órfãos).

```sql
create table if not exists automation_runs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,
  automation_id     uuid not null references automations(id) on delete cascade,

  -- o que disparou (lead_id, group_id, etc) e onde as mensagens vão
  trigger_context   jsonb not null default '{}'::jsonb,
  target_group_jid  text not null,           -- sempre @g.us; nunca telefone

  -- estado da sequência
  status            text not null default 'pending'
                      check (status in ('pending','running','done','failed','cancelled')),
  current_step      integer not null default 0,
  next_step_at      timestamptz not null default now(),

  -- lease (mesmo contrato de engine_events)
  claimed_at        timestamptz,
  lease_expires_at  timestamptz,
  attempts          integer not null default 0,
  error             text,

  -- idempotência: um run por (automação, chave do gatilho)
  dedupe_key        text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists automation_runs_dedupe_uidx
  on automation_runs (tenant_id, dedupe_key) where dedupe_key is not null;

create index if not exists automation_runs_due_idx
  on automation_runs (status, next_step_at) where status in ('pending','running');

alter table automation_runs enable row level security;
create policy "automation_runs_tenant_isolation" on automation_runs
  for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

### 1.2 RPCs

Mesmo formato das existentes: função em `app.*`, wrapper em `public.*`,
`revoke ... from public, anon, authenticated`, `grant ... to service_role`.

- `app.claim_automation_runs(max_runs int default 5)` — `for update skip locked` sobre
  `status in ('pending','running') and next_step_at <= now()`; seta `status='running'`,
  `claimed_at`, `lease_expires_at = now() + 2 min`.
- `app.advance_automation_run(run_id, next_step int, next_at timestamptz)` — avança e solta o lease.
- `app.finish_automation_run(run_id, status, error)` — `done`/`failed`/`cancelled`; no `done`,
  incrementa `automations.total_runs` e seta `last_run_at`.
- `app.requeue_stale_automation_runs(older_than interval default '5 minutes')` — devolve runs presos
  em `running` com lease vencido.

### 1.3 Tick no worker

`apps/worker/src/automations-loop.ts`, com a mesma forma do `event-loop.ts` (deps injetáveis,
erro por item isolado, erro de banco propaga pra degradar o `/health`):

1. `requeue_stale_automation_runs`
2. `claim_automation_runs`
3. para cada run: carrega a `automation`, lê `steps[current_step]`, despacha por tipo:
   - **`wait`** → `advance(current_step+1, now() + delay_minutes)`
   - **`message`** → enqueue em `engine_commands` (`type:'send_message'`,
     `payload:{jid: target_group_jid, text: step.message}`, `available_at: now()`,
     `dedupe_key: 'auto:<run_id>:<step_idx>'`, `priority: 50`) → `advance(current_step+1, now())`
   - **`condition`** → avalia **na hora do disparo** (não pré-resolve); passa → avança, falha → `finish('cancelled')`
   - tipo desconhecido → `finish('failed')`
4. `current_step >= steps.length` → `finish('done')`
5. Automação com `enabled=false` no momento do tick → `finish('cancelled')` (respeita o lojista
   desligando no meio da sequência).

**Nesta camada nada cria runs automaticamente.** Runs são inseridos à mão (SQL) para teste.
Risco de produção: zero — nenhuma automação dispara sozinha ainda.

### 1.4 Testes

- `advance` por tipo de passo (`wait`/`message`/`condition`), incluindo `delay_minutes`.
- Sequência completa multi-passo até `done`, com `total_runs` incrementado.
- **Rejeição de DM**: passo cujo destino não seja `@g.us` não pode gerar comando.
- Idempotência: rodar o mesmo passo duas vezes não duplica `engine_commands` (via `dedupe_key`).
- `enabled=false` no meio → `cancelled`.
- Lease vencido → `requeue` devolve o run.

---

## Camada 2 — Triggers

Nada dispara automação hoje. Por gatilho:

| trigger | origem | como |
|---|---|---|
| `lead_entered` | evento | hook em `apps/worker/src/lead-capture.ts`, após `upsertLead`: cria run para cada automação `enabled` do tenant com esse trigger. `dedupe_key = 'lead:<lead_id>:<automation_id>'` |
| `group_full` | varredura | no mesmo tick: grupos que cruzaram o limite de participantes |
| `group_stalled` | varredura | grupos sem atividade há N dias |
| `weekly_recurring` | varredura | último run > 7 dias |

**Fora do escopo do executor:** `no_connect_24h` e `trial_ending` são lifecycle do SaaS e já vivem em
`lib/email` + cron (ver `RETIRED_LOJISTA_TRIGGERS` em `stores/automations.ts:15`). O executor deve
**ignorá-los** explicitamente, com teste.

---

## Camada 3 — Envio

Coberta pela decisão acima: `engine_commands`. Sem trabalho próprio além do helper de enqueue com o
guarda-corpo anti-DM (parte da camada 1).

---

## Riscos

1. **`engine_commands` permite DM.** Mitigação: validação no enqueue + teste. É o risco mais sério —
   um erro aqui queima números de cliente.
2. **Depende do engine legado estar no ar** para os comandos escoarem. Se estiver fora, os comandos
   acumulam em `queued` e drenam quando voltar (comportamento aceitável, não perde mensagem).
3. **F4 precisa preservar o `send_message`.** Quando o worker novo assumir `engine_commands`, ele tem
   que continuar honrando o mesmo contrato de payload — senão o executor quebra no cutover.
4. **Anti-ban distribuído (herdado do F4).** O estado anti-ban hoje é em memória + `engine-state.json`
   por processo, com caps fixos (`index.js:108-110`: 8/min, 120/h, 800/dia). Portar isso para um worker
   que consome fila Postgres exige decidir afinidade instância→worker (ou mover a cota pro banco).
   **Está no plano do Sprint 5 como um único checkbox ("anti-ban portado") e é o item mais arriscado dele.**
   Este executor *não resolve* isso, mas também não bloqueia nele — hoje o envio passa pelo anti-ban
   do engine legado, que já funciona.

## Fora de escopo

- Mudança de UI (a tela já mostra `total_runs`/`last_run_at`).
- Porte do anti-ban (é F4).
- Cutover do `broadcasts`/dispatch (é F5).
