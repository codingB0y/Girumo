# Fase 6 - Engine Baileys

## Objetivo Da Fase

Preparar `hubflow-engine` para operar desacoplada, multi-tenant e orientada a comandos/eventos, sem criar uma segunda pasta `engine/` e sem mover toda a sessao Baileys em uma unica mudanca.

## Entrega Atual

Foi adicionada uma camada inicial de fila Supabase:

```txt
infra/migrations/202606240005_engine_rpc.sql
hubflow-engine/config/env.js
hubflow-engine/queues/supabase-command-worker.js
```

Tambem foram criados os diretorios alvo dentro da engine real:

```txt
hubflow-engine/
  api/
  events/
  queues/
  sessions/
  workers/
  webhooks/
```

## Fluxo

```txt
Next.js API - /api/engine/commands
  |
  v
Supabase public.engine_commands
  |
  v
app.claim_engine_commands()
  |
  v
hubflow-engine worker
  |
  v
Baileys socket conectado
  |
  v
app.record_engine_event()
  |
  v
app.update_instance_status()
```

## Comandos Suportados Nesta Fatia

### `send_message`

Payload:

```json
{
  "jid": "5511999999999@s.whatsapp.net",
  "text": "Mensagem"
}
```

Alternativa:

```json
{
  "phone": "+55 11 99999-9999",
  "text": "Mensagem"
}
```

### `refresh_status`

Registra um evento `instance_status` e atualiza `instances.status` para `connected` quando o socket atual estiver ativo.

## API Web Para Comandos

Rota criada:

```txt
POST /api/engine/commands
```

Headers:

```txt
Authorization: Bearer <supabase_access_token>
x-tenant-id: <tenant_id>
```

Body:

```json
{
  "instanceId": "uuid",
  "type": "send_message",
  "payload": {
    "phone": "+5511999999999",
    "text": "Mensagem"
  }
}
```

A rota valida:

- usuario autenticado no Supabase;
- membership aceita no tenant;
- instancia pertencente ao tenant;
- tipo de comando permitido.

## RPCs

Criadas em `infra/migrations/202606240005_engine_rpc.sql`:

```txt
app.claim_engine_commands(max_commands)
app.complete_engine_command(target_command_id, success, error_message)
app.record_engine_event(target_tenant_id, target_instance_id, target_type, target_payload, target_event_id)
app.update_instance_status(target_tenant_id, target_instance_id, target_status, target_phone, target_qr_code, target_engine_node, target_metadata)
```

`claim_engine_commands` usa `for update skip locked`, permitindo multiplos workers no futuro sem processar o mesmo comando duas vezes.

## Estado Atual Da Engine

- A sessao Baileys legada ainda usa `hubflow-engine/auth`.
- O worker Supabase inicia apenas quando o WhatsApp conecta.
- O worker para quando a conexao fecha.
- Redis continua opcional.
- Multi-instancia completa ainda nao foi implementada; a fatia atual prepara contrato e processamento de comandos.

## Deploy

Arquivos adicionados:

```txt
hubflow-engine/Dockerfile
hubflow-engine/.dockerignore
hubflow-engine/.env.example
```

No Coolify/VPS, a engine deve receber:

```txt
PORT
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ENGINE_COMMAND_POLL_MS
ENGINE_COMMAND_BATCH_SIZE
```

## Pendencias

- Migrar auth Baileys de `auth/` para `sessions/<tenant_id>/<instance_id>`.
- Criar `connection-worker` por instancia.
- Publicar QR code em `engine_events` e `instances.qr_code`.
- Evoluir status por instancia quando a engine passar a ter sockets dedicados.
- Substituir polling legado `/api/dispatch/pending` depois que campanhas migrarem para Supabase.
- Adicionar rate limit por `tenant_id + instance_id`.
