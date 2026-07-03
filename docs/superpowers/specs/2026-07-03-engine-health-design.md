# Engine Health Contract Design

## Objetivo

Distinguir processo vivo de engine operacional, sem criar loops de reinicialização durante autenticação por QR ou reconexões transitórias do WhatsApp.

## Contrato HTTP

- `GET /health/live` retorna `200` enquanto o processo Node consegue atender HTTP. O healthcheck do container usa este endpoint.
- `GET /health/ready` retorna `200` somente quando existe socket Baileys autenticado; retorna `503` nos estados inicializando, aguardando QR, reconectando ou deslogado.
- `GET /health` permanece como alias compatível de readiness e também retorna `503` quando o WhatsApp não está conectado.

As respostas usam JSON e expõem `ok`, `service`, `status`, `whatsappConnected`, `supabaseWorker` e `uptime`. Nenhum segredo, número ou identificador de tenant é retornado.

## Arquitetura

A decisão de status será extraída para um módulo CommonJS puro e sem dependência de Express ou Baileys. O módulo recebe um snapshot mínimo do runtime e devolve o status HTTP e o corpo da resposta. O `index.js` apenas coleta `currentSocket`, estado do worker e uptime, delegando a decisão.

O Docker Compose passa a verificar `/health/live`. Assim, uma sessão aguardando QR continua viva e observável, enquanto monitores funcionais podem consultar `/health/ready` ou `/health` para detectar indisponibilidade real do WhatsApp.

## Fluxo de estados

1. No boot, liveness responde `200`; readiness responde `503`.
2. Quando `connection.update` informa `open`, readiness passa a `200`.
3. Quando informa `close`, readiness volta imediatamente a `503`, antes da tentativa interna de reconexão.
4. Se o processo HTTP travar ou morrer, liveness falha e o Coolify pode reiniciar o container.

## Tratamento de erros

Estados incompletos ou ausentes são tratados como não prontos, nunca como sucesso. A resposta de readiness usa `503` sem lançar exceção. Liveness não depende de WhatsApp, Supabase ou serviços externos.

## Testes e verificação

- Teste unitário: liveness retorna `200` independentemente da conexão.
- Teste unitário: readiness retorna `503` sem socket autenticado.
- Teste unitário: readiness retorna `200` com WhatsApp conectado.
- Teste unitário: o corpo não inclui dados sensíveis.
- Gate: suíte da engine, verificação de sintaxe, suíte geral e validação do Compose.

## Fora de escopo

- Plugar o `ConnectionWatchdog`, que permanece como item V1 separado.
- Alterar política de reconexão ou backoff do Baileys.
- Adicionar métricas, logs estruturados ou dependências novas.
