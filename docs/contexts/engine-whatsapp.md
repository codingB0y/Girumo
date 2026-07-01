# Contexto: HubFlow — Engine WhatsApp (hubflow-engine)

## Quem sou
Sou o dev do HubFlow. Preciso que você atue como backend engineer especialista em Node.js e WhatsApp automation.

## Stack
- Node.js (ESM) — puro, sem framework
- @whiskeysockets/baileys 7 (conexão WhatsApp)
- Express 5 (API interna)
- Pino (logs)
- Sem banco — sessão em `auth/`, estado em `engine-state.json`

## Arquivos que você mexe (apenas `hubflow-engine/`)
- `index.js` — conexão, QR, sync grupos, detecção entrada/saída, motor de disparo, heartbeat
- `anti-ban-queue.js` — fila de envio (delays gaussianos, lanes, governor min/hora/dia, backoff, breaker)
- `warmup.js` — rampa de volume pra número novo
- `group-guard.js` — limita operações de grupo (3 adds/10min)
- `delivery-tracker.js` — mede taxa de entrega, alerta soft-ban
- `connection-watchdog.js` — reconexão automática
- `supervisor.js` — monitora saúde
- `api/` — endpoints internos
- `workers/`, `queues/`, `events/`, `webhooks/`

## Regras invioláveis
1. **Todo envio passa pela fila** (sendText/broadcast/sendMedia) — NUNCA sock.sendMessage cru
2. **Anti-ban = só controle operacional seguro.** PROIBIDO: fingerprint, proxy rotation, stealth connect, content spinning, human entropy fake, ban recovery
3. **Só monitora/dispara em grupos onde o número é ADMIN** (adminGroupIds)
4. Telefone via resolvePhone (LID→PN do Baileys 7); desconhecido = vazio, nunca inventar
5. Chamadas ao app são fail-silent (app pode estar offline)
6. Estado anti-ban PERSISTE (restart não libera nova cota)
7. Operação de grupo em massa respeita group-guard + fila

## O que a Engine consome do app (via HTTP)
Todos com header `x-engine-token`:
- POST /api/leads — registra entrada de lead
- POST /api/groups — sync de grupos
- POST /api/session — heartbeat (30s)
- POST /api/activity — registra atividade
- GET /api/welcome — busca msg de boas-vindas
- GET /api/optout — lista de opt-out
- POST /api/dispatch/pending — claim de mensagens pendentes
- POST /api/dispatch/ack — confirma envio
- GET /api/media/:id — baixa mídia

## Decisões registradas (anti-ban)
- Implementado: WarmUp, GroupOperationGuard, DeliveryTracker, Jitter gaussiano
- Recusado: deviceFingerprint, proxyRotator, stealthConnect, legitimacySignalInjector, contentVariator, humanEntropy, banRecoveryOrchestrator

## Estado atual
- Conexão Baileys funcional com QR
- Fila anti-ban com lanes de prioridade
- Warmup implementado (7 dias)
- Heartbeat pro app
- Faltam: reconexão robusta em produção, deploy em VPS/Coolify, métricas de entrega em dashboard

## Fronteira
NÃO toque em `apps/web/`. Se precisar de endpoint novo ou mudar payload, especifique o contrato desejado e eu levo pro chat do Painel.
