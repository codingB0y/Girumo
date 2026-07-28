# HUBFLOW Engine - Deploy Coolify/VPS

Este guia sobe a engine oficial `hubflow-engine` em VPS/Coolify usando Docker Compose.

## Arquivos

```txt
hubflow-engine/Dockerfile
deploy/coolify/engine.docker-compose.yml
deploy/coolify/.env.example
```

## Variaveis

Copiar `deploy/coolify/.env.example` para as variaveis do app Coolify:

```txt
ENGINE_PORT=3001
APP_URL=https://app.seudominio.com
ENGINE_TOKEN=<mesmo ENGINE_TOKEN da Vercel>
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ENGINE_COMMAND_POLL_MS=3000
ENGINE_COMMAND_BATCH_SIZE=5
ENGINE_STATE_FILE=engine-state.json
```

## Volumes Persistentes

Manter persistentes:

```txt
hubflow_engine_auth -> /app/auth
hubflow_engine_sessions -> /app/sessions
hubflow_engine_state -> /app/state
```

`auth` e `state` nao devem voltar para Git.

## Healthcheck

Dois endpoints com propósitos diferentes:

- **`GET /live`** — liveness, sempre 200 se o processo está de pé. É o que o
  `healthcheck` do docker-compose usa (não pode derrubar o container só porque
  o WhatsApp caiu, senão vira restart-loop).
- **`GET /health`** — readiness real: `{ ok, status, connected, lastEventAt }`,
  **503 quando o WhatsApp está desconectado**. Use este pra monitoramento externo
  (uptime checker, alerta) que precisa saber se a sessão caiu.

```txt
GET https://engine.seudominio.com/live
GET https://engine.seudominio.com/health
```

Esperado (`/health`, conectado):

```json
{
  "ok": true,
  "status": "ok",
  "connected": true,
  "lastEventAt": "2026-07-28T14:00:00.000Z",
  "service": "hubflow-engine"
}
```

Validar via repo:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com" -EngineUrl "https://engine.seudominio.com"
```

## Fluxo De Comandos

1. App web cria `engine_commands` no Supabase.
2. Engine reivindica comandos via `app.claim_engine_commands`.
3. Engine executa no Baileys.
4. Engine completa comando via `app.complete_engine_command`.
5. Engine grava `engine_events`.
6. Engine atualiza `instances.status` via `app.update_instance_status`.

## Validacao E2E

1. Criar instancia no app.
2. Subir engine.
3. Escanear QR no log/terminal da engine.
4. No app, clicar `Status` em Instancias WhatsApp.
5. Confirmar comando em `engine_commands`.
6. Confirmar evento em `engine_events`.
7. Confirmar `instances.status`.

## Falhas Comuns

- `supabaseWorker: false`: `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` ausentes.
- Engine recebe comando mas falha: WhatsApp ainda nao esta conectado.
- App cria comando e engine nao processa: conferir service role, RPCs aplicadas e logs da engine.
- `/health` nao responde: conferir porta exposta, proxy do Coolify e healthcheck.
- Sessao some apos deploy: conferir volumes persistentes.

## Pendencia Arquitetural

A engine ainda precisa evoluir de sessao Baileys unica para sessoes por:

```txt
sessions/<tenant_id>/<instance_id>
```

O deploy atual ja separa a engine do app e usa comandos/eventos por tenant, mas multi-socket completo ainda e uma etapa posterior.
