# girumo-worker

Worker da migração Evolution. Dois loops sobre a mesma cadência de poll:

- **Captura (F3):** consome `engine_events` e grava `leads`.
- **Envio (F4):** consome `engine_commands` (`send_message`) e envia pela Evolution
  API, com o anti-ban aplicado no banco (ver `docs/anti-ban-spec.md`).

## Loop de captura (F3)

A cada `WORKER_POLL_MS`:

1. `requeue_stale_engine_events` — devolve para a fila eventos presos em
   `processing` (worker que morreu no meio).
2. `claim_engine_events` — pega um lote com `FOR UPDATE SKIP LOCKED`.
3. Para cada evento `group-participants.update` com `action: "add"` num grupo
   onde somos admin (`groups.is_admin`): normaliza o participante e grava o lead
   via `upsert_lead`. Opt-out bloqueia a captura; `@lid` sem telefone vira lead
   com `phone` nulo (nunca inventa número).
4. `complete_engine_event` — marca `processed` (ou `failed` com a mensagem).

Eventos que não são de grupo, ações que não são `add`, grupos não-admin e grupos
desconhecidos são marcados `processed` sem gerar lead.

## Loop de envio (F4)

Liga só se `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` existirem (senão o worker roda
só a captura). A cada poll:

1. `claim_send_commands` — devolve `send_message` de número **pronto**: não pausado
   pelo breaker, gap de espaçamento (~3–7s) já passou, e sob os caps min/hora/dia +
   warmup. No máx. **1 comando por número por lote** (serializa por número; números
   distintos correm em paralelo). É aqui que o anti-ban vive — o worker é stateless,
   então N réplicas não liberam N× a cota.
2. Para cada comando: resolve o `provider_instance_id` (instanceName na Evolution),
   traduz o payload `{jid,text}` → `{number,text}` e faz `POST /message/sendText/{instance}`.
3. Sucesso → `record_send` (conta a janela + estica o gate) + `complete_engine_command(true)`.
   Falha de envio → `record_send_failure` (breaker do número) + `complete(false)`
   (retry/backoff do comando). Payload inválido falha sem tocar no estado do número.
4. `prune_instance_sends` ~1×/hora poda o log de janelas.

**Contrato preservado:** o payload de `send_message` é o mesmo do engine legado —
`{ jid, text }` (+ compat `phone`/`message`/`body`). O executor de automações não
muda no cutover. Detalhes e a decisão de arquitetura (opção C) em
[`docs/anti-ban-spec.md`](docs/anti-ban-spec.md).

## Rodar local

```bash
# na raiz do monorepo
npm install                      # linka o workspace apps/worker
npm run worker:test              # testes (puros, sem banco)

# rodar de fato (precisa de Supabase):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run worker:dev
```

## Variáveis de ambiente

| Var | Obrigatória | Default | O que é |
|---|---|---|---|
| `SUPABASE_URL` | sim | — | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | — | service_role (as RPCs só concedem execute a ela) |
| `WORKER_POLL_MS` | não | `3000` | intervalo entre ciclos |
| `WORKER_BATCH_SIZE` | não | `20` | máx. eventos por claim (captura) |
| `WORKER_REQUEUE_AFTER_SECONDS` | não | `300` | idade para reenfileirar evento preso |
| `WORKER_HEALTH_PORT` | não | `3002` | porta do `/health` |
| `EVOLUTION_API_URL` | não¹ | — | base da Evolution API (liga o loop de envio) |
| `EVOLUTION_API_KEY` | não¹ | — | apikey da Evolution (liga o loop de envio) |
| `WORKER_SEND_BATCH_SIZE` | não | `10` | máx. comandos por claim (envio) |

¹ Sem `EVOLUTION_API_URL`+`EVOLUTION_API_KEY` o loop de envio fica desligado e o
worker roda só a captura de leads.

## Deploy

`deploy/coolify/worker.docker-compose.yml` — 1 réplica, sem porta exposta.
Depende da migration `20260727130000_engine_event_processing_status.sql` estar
aplicada (destrava o claim). Ver `deploy/supabase/apply-order.txt`.

## Testes

Módulos puros (`participants`, `lead-capture`) testados contra as fixtures reais
em `apps/web/src/lib/evolution/__fixtures__/` e deps fake — sem banco. O acesso
ao Supabase é injetado (`makeDeps`), então a regra de captura é exercitada
isolada.
