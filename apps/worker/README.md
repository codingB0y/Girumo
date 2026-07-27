# girumo-worker

Worker de captura de leads (F3 da migração Evolution). Consome `engine_events` e
grava `leads`. **Não envia mensagem nenhuma** — o escopo da F3 é só grupos; o
envio anti-ban entra na F4.

## O que ele faz

Loop a cada `WORKER_POLL_MS`:

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
| `WORKER_BATCH_SIZE` | não | `20` | máx. eventos por claim |
| `WORKER_REQUEUE_AFTER_SECONDS` | não | `300` | idade para reenfileirar evento preso |
| `WORKER_HEALTH_PORT` | não | `3002` | porta do `/health` |

## Deploy

`deploy/coolify/worker.docker-compose.yml` — 1 réplica, sem porta exposta.
Depende da migration `20260727130000_engine_event_processing_status.sql` estar
aplicada (destrava o claim). Ver `deploy/supabase/apply-order.txt`.

## Testes

Módulos puros (`participants`, `lead-capture`) testados contra as fixtures reais
em `apps/web/src/lib/evolution/__fixtures__/` e deps fake — sem banco. O acesso
ao Supabase é injetado (`makeDeps`), então a regra de captura é exercitada
isolada.
