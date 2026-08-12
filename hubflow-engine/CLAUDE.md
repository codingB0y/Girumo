# HUBFLOW Engine — primer da lane (Chat 2 / Backend)

> Carregado automaticamente pelo Claude Code ao abrir esta pasta. É o escopo desta lane.
> **Não toque no app `apps/web`** — a engine só consome a API dele via HTTP.

**O que é:** o serviço Node que fala com o WhatsApp. Roda com `node index.js`.
Sem banco — sessão em `auth/`, estado anti-ban em `engine-state.json`.

**Stack: CommonJS (`require`), não ESM.** O Baileys 7 é ESM e por isso é carregado por
`await import()` dentro de `loadBaileys()` — escrever `import` no topo de um módulo da
engine quebra o boot. Há um gate automatizado disso (`test-module-format.js`, roda no
`npm test`). Imagem fixada em `node:22.14.0-alpine3.21` nos dois estágios do Dockerfile.

## Você MEXE em (nesta pasta)
- `index.js` — conexão/QR, persistência de sessão, sync de grupos admin, **detecção de entrada/saída**
  (captura de lead), **motor de disparo**, heartbeat, atividade, `/status` autenticado.
- `connection-watchdog.js` — sonda o stream (presence `unavailable`); 3 falhas seguidas forçam
  reconexão. A trava `reconnecting` no `index.js` garante **1 socket por número** (2 sockets do
  mesmo número = vetor de ban nº1). Testes em `test-watchdog.js`.
- `scripts/backup-auth.js` — backup cifrado (AES-256-GCM, scrypt N=2^17) de `auth/` +
  `engine-state.json` para o Supabase Storage. Runbook: `docs/operations/backup-restore-engine.md`.
- `anti-ban-queue.js` — fila de envio (delays gaussianos, lanes, governor min/hora/dia, backoff, breaker).
- `warmup.js` · `group-guard.js` · `delivery-tracker.js` — controles anti-ban seguros.
- `test-queue.js` · `test-modules.js` — testes isolados (sem WhatsApp).

## Convenções (invioláveis)
- **Todo envio passa pela fila** (`sendText`/`broadcast`/`sendMedia`) — nunca `sock.sendMessage` cru.
- **Anti-ban = só controle operacional seguro.** Proibido fingerprint/proxy/stealth/evasão.
  Leia [DECISIONS.md](DECISIONS.md) antes de adicionar qualquer "módulo anti-ban".
- **Só monitora/dispara em grupo onde o número é ADMIN** (`adminGroupIds` é a única fonte). Sem fallback p/ "todos".
- Telefone via `resolvePhone` (LID→PN do Baileys 7); desconhecido grava vazio ("número oculto"), nunca inventa.
- Toda chamada ao app é **fail-silent** (app pode estar offline). Estado anti-ban PERSISTE (restart não libera nova cota).
- Operação de grupo em massa respeita `group-guard` + fila — senão "lota sozinho" vira "derruba sozinho".
- Rodar conectado ao app: `ENGINE_TOKEN=<mesmo do app> APP_URL=http://localhost:3000 node index.js`.

## A engine CONSOME estes endpoints do app (não os implementa)
`POST /api/leads` (entrada→lead) · `POST /api/groups` (sync) · `POST /api/session` (heartbeat 30s) ·
`POST /api/activity` · `POST /api/dispatch/pending` (claim) · `POST /api/dispatch/ack` ·
`GET /api/media/:id`. Todos com header `x-engine-token`.

> `GET /api/welcome` e `GET /api/optout` **saíram** desta lista (PR #44, 30/07): a engine
> não manda mais DM de boas-vindas. DM para quem nunca te escreveu é o maior vetor de ban,
> então boas-vindas viraram automação app-side **no grupo**. Não reintroduzir.
Payloads de fato estão no próprio `index.js` (os `appFetch`). Contrato canônico (lado app) é do **Chat 3**.

## Carregue ao iniciar (mínimo)
Este arquivo + [DECISIONS.md](DECISIONS.md) + [README.md](README.md) + o módulo que vai tocar. Só isso.

## Fronteira / handoff
Precisa de endpoint novo ou mudar payload? **Não mexa no app daqui.** Especifique o contrato desejado e
registre o handoff p/ o **Chat 3** em `C:\Users\Igor\Desktop\apps/web\system\NEXT.md`. A engine só
passa a usar quando o contrato existir. Para detalhes do lado-app, consulte por caminho completo:
`C:\Users\Igor\Desktop\apps/web\system\API_CONTRACTS.md`.
</content>
