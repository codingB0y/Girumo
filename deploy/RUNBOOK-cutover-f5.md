# Runbook — Cutover da F5 (Baileys → Evolution)

Passo a passo do que falta para desligar o engine legado. **A ordem importa**: o smoke e2e (passo 4)
depende dos três anteriores.

> **Regra de ouro:** não desligue o Baileys antes do passo 4 passar. A convivência é segura por
> construção — o claim legado filtra `run_id is null`, então os dois motores rodam juntos sem disparo
> duplo. Não há pressa, e desligar antes de provar o motor novo **para o disparo**.

---

## Passo 0 — Auditar o que já está aplicado

**Não confie no histórico de migrations do Supabase.** Parte do schema foi aplicada via `psql`
direto, sem registrar em `supabase_migrations` — o próprio `apply-order.txt` avisa isso. O histórico
mostra menos do que realmente existe, e agir por ele leva a reaplicar coisa à toa ou, pior, a achar
que algo está lá quando não está.

Rode esta query **em cada ambiente** (dev e prod). É só catálogo: sem efeito colateral, seguro em
produção.

```sql
with probe(ord, migration, objeto, presente) as (
  select 1, '202606240001_base_schema', 'tabela organizations',
    to_regclass('public.organizations') is not null
  union all select 2, '202607010001_groups_broadcasts_schedules', 'tabela broadcasts',
    to_regclass('public.broadcasts') is not null
  union all select 3, '20260713110000_evolution_provider_columns', 'instances.provider_instance_id',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='instances' and column_name='provider_instance_id')
  union all select 4, '20260713120000_engine_queue_v2', 'app.requeue_expired_commands',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app' and p.proname='requeue_expired_commands')
  union all select 5, '20260713120000_engine_queue_v2', 'engine_commands.dedupe_key',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='engine_commands' and column_name='dedupe_key')
  union all select 6, '20260727120000_leads_and_worker_reads', 'groups.is_admin',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='groups' and column_name='is_admin')
  union all select 7, '20260727120000_leads_and_worker_reads', 'tabela leads',
    to_regclass('public.leads') is not null
  union all select 8, '20260727130000_engine_event_processing_status', 'enum tem processing',
    exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='engine_event_status' and e.enumlabel='processing')
  union all select 9, '20260728145600_automations', 'tabela automations',
    to_regclass('public.automations') is not null
  union all select 10, '20260729010000_automation_runs', 'tabela automation_runs',
    to_regclass('public.automation_runs') is not null
  union all select 11, '20260729120000_engine_antiban_state', 'tabela instance_send_state',
    to_regclass('public.instance_send_state') is not null
  union all select 12, '20260729120000_engine_antiban_state', 'app.claim_send_commands',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app' and p.proname='claim_send_commands')
  union all select 13, '20260730100000_dispatch_fanout', 'broadcasts.run_id',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='broadcasts' and column_name='run_id')
  union all select 14, '20260730100000_dispatch_fanout', 'app.enqueue_broadcast',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app' and p.proname='enqueue_broadcast')
)
select ord, migration, objeto, case when presente then 'OK' else 'FALTA' end as status
from probe order by ord;
```

### Resultado no `hubflow-dev` (sondado em 2026-07-29)

| Migration | Estado |
|---|---|
| `20260713110000_evolution_provider_columns` | ✅ aplicada |
| `20260713120000_engine_queue_v2` | ✅ aplicada |
| `20260727120000_leads_and_worker_reads` | ❌ **FALTA** (`groups.is_admin` ausente) |
| `20260729120000_engine_antiban_state` | ❌ **FALTA** |
| `20260730100000_dispatch_fanout` | ❌ **FALTA** |

Repare que falta a migration da **F3**, não só as da F4/F5. `groups.is_admin` é o que
`app.enqueue_broadcast` usa para resolver os destinos do disparo — sem ela, o fan-out não funciona.

**`hubflow-production` ainda não foi sondado.** Rode a query acima antes de aplicar qualquer coisa lá.

---

## Passo 1 — Aplicar as migrations faltantes

Na ordem do [`deploy/supabase/apply-order.txt`](supabase/apply-order.txt). São idempotentes
(`add column if not exists`, `create or replace`), então reaplicar o que já está não quebra.

> ⚠️ **Não use `infra/scripts/apply-supabase-sql.sh`.** Ele tem 6 arquivos hardcoded, contra as 30
> entradas do `apply-order.txt` que a versão `.ps1` lê. O `docs/FASE_7_DEPLOY.md:109` manda usar o
> `.sh` no Linux/macOS — ele aplicaria um schema incompleto **em silêncio**. Bug conhecido, ainda não
> corrigido.

**Opção A — PowerShell (lê o `apply-order.txt`, é a fonte canônica):**

```powershell
.\infra\scripts\apply-supabase-sql.ps1 -DatabaseUrl "postgresql://..."
```

**Opção B — arquivo a arquivo**, só os que a auditoria acusou como `FALTA`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/supabase/migrations/20260727120000_leads_and_worker_reads.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/supabase/migrations/20260729120000_engine_antiban_state.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/supabase/migrations/20260730100000_dispatch_fanout.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/supabase/migrations/20260730110000_retire_refresh_status.sql
```

> ⚠️ **`20260713100000_rls_standardization.sql` é sensível a ordem.** O `apply-order.txt` a coloca
> fora da ordem cronológica **de propósito**: ela pula tabelas que ainda não existem, então precisa
> rodar depois de todas as criações. Se a auditoria acusar que falta, respeite a posição no arquivo,
> não a data no nome.

**Sinal de sucesso:** rode a query do Passo 0 de novo — tudo `OK`.

---

## Passo 2 — Ligar o loop de envio no worker

O worker sobe sem `EVOLUTION_API_KEY`, mas **só com a captura de leads** — o envio fica desligado.

| Variável | Valor |
|---|---|
| `EVOLUTION_API_KEY` | o mesmo `AUTHENTICATION_API_KEY` da Evolution |
| `EVOLUTION_API_URL` | já tem default `http://evolution:8080` no compose (rede interna, não o domínio público) |
| `EVOLUTION_NETWORK` | só se o Coolify prefixar o nome da rede |

Sobre a rede: o worker é **outra stack** que a Evolution, então anexa à rede dela como externa. O
`worker.docker-compose.yml` já traz `name: ${EVOLUTION_NETWORK:-girumo-net}`. Se o Coolify prefixar
(ex.: `<projeto>_girumo-net`), descubra o nome real com `docker network ls` e sete `EVOLUTION_NETWORK`
— senão `http://evolution:8080` não resolve.

**Sinal de que ficou faltando:** o log do worker mostra `loop de envio desligado`.
**Sinal de sucesso:** o log de boot mostra `sender: "on"`.

---

## Passo 3 — Bloquear a Manager UI

No proxy do Coolify, negue `/manager` e `/manager/*` (ou restrinja por IP). O painel do Girumo não
usa o manager. Pendência aberta desde a F1 — ver o checklist em
[`deploy/coolify/README.evolution.md`](coolify/README.evolution.md).

**Sinal de sucesso:** `curl https://wa.<dominio>/manager` devolve 403/404 de fora da rede.

---

## Passo 4 — Smoke e2e (o teste de fogo)

Com o worker ligado e um número conectado, dispare uma oferta de **teto pequeno (2–3 grupos)** pelo
painel e acompanhe.

### 4a. O fan-out criou a fila?

```sql
select type, status, payload->>'jid' as jid, dedupe_key, origin_kind, origin_run_id
from public.engine_commands
where origin_id = '<broadcast_id>'
order by created_at;
```

Esperado: **1 linha por grupo**, `origin_kind = 'broadcast'`, e `dedupe_key` no formato
`bc:<broadcast_id>:<run_id>:<jid>`.

### 4b. O progresso volta para o painel?

```sql
select status, sent, total, run_id, error from public.broadcasts where id = '<broadcast_id>';
```

Esperado: caminha `queued → running → sent`, com `sent` batendo a contagem de comandos `done`.
O roll-up roda no housekeeping do worker (poll de 3 s), então há alguns segundos de atraso — é
esperado e irrelevante perto do ritmo do anti-ban.

### 4c. ⚠️ Mídia e enquete — o item de maior risco

**`sendMedia` e `sendPoll` nunca tocaram a instância real.** O smoke da F1 só exercitou `sendText`;
esses dois seguem a API v2 documentada, mas não foram confirmados contra o servidor.

Teste os três explicitamente, um disparo cada:
1. só texto → deve virar `send_message`
2. com foto → `send_media` (a legenda é o texto da oferta)
3. com enquete → `send_poll` (a enquete tem precedência sobre mídia e texto)

Se der **400 da Evolution**, o conserto é pontual e isolado: só
`apps/worker/src/evolution-sender.ts`. Nada fora daquele módulo depende do shape do payload.

### 4d. O anti-ban está respirando?

```sql
select instance_id, count(*) as envios_ultima_hora
from public.instance_sends
where sent_at > now() - interval '1 hour'
group by instance_id;

select instance_id, warmup_started_at, warmup_graduated, next_send_allowed_at,
       consecutive_failures, paused_until
from public.instance_send_state;
```

Esperado: os envios acumulando e o ritmo **abaixo** do cap. Número novo entra em warmup (dia 1 tem
teto de 20/dia), então um disparo grande pode levar dias — **isso é o desenho funcionando**, não
travamento. Não existe mais watchdog de 15 min justamente por isso.

`paused_until` preenchido = o circuit breaker abriu (falhas seguidas naquele número). Se aparecer no
smoke, o problema não é ritmo: veja o `error` dos `engine_commands` que falharam antes de mexer em
qualquer cap.

---

## Passo 5 — Só então, o cutover

Com o passo 4 verde, a F5 pode desligar o Baileys: deletar as rotas engine-only, o ramo
`x-engine-token`, os envs `ENGINE_*`, o workspace `hubflow-engine` e os scripts `engine:*` do CI. O
mapa completo está em [`apps/web/system/NEXT.md`](../apps/web/system/NEXT.md), seção "Mapa do
cutover".

---

## Se algo der errado

| Sintoma | Causa provável |
|---|---|
| Disparo fica `failed` na hora, com "Nenhum número conectado" | nenhuma `instances` com `status='connected'` **e** `provider_instance_id` preenchido |
| Disparo fica `failed` com "Nenhum grupo de destino" | nenhum grupo com `is_admin = true` — rode o sync de grupos, ou a migration da F3 não foi aplicada |
| Fila criada mas nada sai | `EVOLUTION_API_KEY` ausente (log `loop de envio desligado`), ou a rede não resolve `evolution:8080` |
| Comandos presos em `processing` | o housekeeping não está rodando — confira o log `manutenção` no worker |
| Progresso parado mas comandos concluindo | `reconcile_broadcast_progress` ausente no banco (migration do fan-out não aplicada) |

**Rollback:** não precisa reverter migration nenhuma. Como o claim legado filtra `run_id is null`,
basta religar o engine Baileys e parar de usar o motor novo — as ofertas antigas continuam saindo
pelo caminho velho.
