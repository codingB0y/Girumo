# HUBFLOW Engine — PoC (Baileys)

Prova de conceito da engine de WhatsApp do **HUBFLOW**. Valida o risco crítico do produto:
conectar, manter a sessão e **detectar quem entra nos grupos** (o evento que fecha o loop
`clique no anúncio → entrada no grupo`).

> ⚠️ Usa biblioteca não-oficial (Baileys, via QR Code). Viola os Termos do WhatsApp e o número
> pode ser banido em uso de envio em massa. Use um **número de teste**, não o principal.

## Como rodar

```bash
npm install      # já feito
npm start
```

1. Um **QR Code** aparece no terminal.
2. No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho** → escaneie.
3. Ao conectar, ele lista seus grupos e passa a **monitorar entradas/saídas em tempo real**.

A sessão fica salva na pasta `./auth` — nas próximas vezes conecta sozinho, sem novo QR.
Para desconectar/zerar: apague a pasta `./auth`.

## O que observar (o teste que importa)

Com a engine rodando, **adicione alguém a um grupo** (ou peça pra entrar). No terminal deve aparecer:

```
🟢 ENTRADA: +5562XXXXXXXX entrou em "Atacado Polo 44 • Lote 1"
```

Se isso aparecer, o risco está vencido: dá pra contabilizar cada entrada automaticamente.

## Camada anti-ban (fila de envio)

Todo envio passa por uma **fila de controle operacional** (`anti-ban-queue.js`), inspirada na
[WaSP](https://github.com/kobie3717/wasp). Ela **não** usa evasão/stealth (sem spoofing, sem
proxy, sem emulação) — apenas reduz risco com comportamento mais natural e limites:

- **Delays humanizados** entre mensagens (padrão 3–7s, aleatório).
- **Lanes de prioridade** — respostas imediatas (ex.: boas-vindas a quem entrou) furam a fila.
- **Governor de throughput** — tetos por minuto / hora / dia (padrão 8 / 120 / 800).
- **Backoff exponencial** com jitter nas retentativas.
- **Circuit breaker** — pausa a fila após falhas consecutivas e retoma após o cooldown.

Use sempre `sendText(sock, jid, texto)` ou `broadcast(sock, jids, texto)` (já passam pela fila).
Teste a fila isoladamente, sem WhatsApp: `node test-queue.js`.

### Módulos adicionais (de `baileys-antiban`, só os seguros)

- **WarmUp** (`warmup.js`) — número novo começa com teto baixo (dia 1: ~20 msgs) e sobe ~7 dias.
  Gateia o teto diário da fila automaticamente.
- **GroupOperationGuard** (`group-guard.js`) — limita adds/creates em grupo (3 adds/10min) p/
  evitar `account_reachout_restricted`. Use `addToGroup(sock, jid, [num])`.
- **DeliveryTracker** (`delivery-tracker.js`) — mede taxa de entrega; alerta se < 60%.
- **Jitter gaussiano** nos delays (mais natural que uniforme).

Decisões e o que foi **recusado por ser evasão** (fingerprint, proxy, stealth, anti-ML): ver
[DECISIONS.md](DECISIONS.md). Teste os módulos: `node test-modules.js`.

> ⚠️ **Nenhuma fila garante não-ban.** Em envio massivo por biblioteca não-oficial o risco existe
> sempre. O que mais protege: número aquecido, volume baixo no começo, e ritmo humano — não um
> "modo mágico".

## O que este PoC NÃO faz ainda

- Não casa a entrada com o clique no anúncio (Caminho A) — é o próximo passo, integrar com a
  API de links do app (`/api/links`).
- Não envia broadcast (há um exemplo comentado em `index.js`).
- Não gerencia múltiplas sessões (1 número por vez) — multi-tenant vem depois.
- Não usa banco — sessão em arquivo (`./auth`).

## Estrutura

- `index.js` — conexão, persistência de sessão, listagem de grupos e detecção de entradas.
- `auth/` — credenciais da sessão (NÃO versionar / NÃO compartilhar).
