# DECISIONS — Anti-ban (hubflow-engine)

Fonte avaliada: `kobie3717/baileys-antiban` (clonado e lido em 2026-06-20).
Critério: implementar **controle operacional seguro** (fazer menos, mais devagar, monitorar);
**recusar evasão** (forjar identidade ou enganar a detecção do WhatsApp).

## Implementado (seguro)

| Módulo | Arquivo | O que faz |
|---|---|---|
| WarmUp | `warmup.js` | Rampa de volume p/ número novo (dia1=20, cresce ~7 dias). Gateia o teto diário da fila. |
| GroupOperationGuard | `group-guard.js` | Limita add/remove/create/invite por janela (3 adds/10min). Classifica erros (`reachout_restricted`, `rate-overlimit`...). |
| DeliveryTracker | `delivery-tracker.js` | Mede taxa de entrega; <60% = alerta de soft-ban. |
| Jitter gaussiano | `anti-ban-queue.js` | Delay entre envios via Box-Muller (mais natural que uniforme). |

Já existentes antes: fila com delays humanizados, lanes de prioridade, governor min/hora/dia,
backoff exponencial, circuit breaker.

## Recusado (evasão — NÃO implementar)

- `deviceFingerprint` / `sessionFingerprint` / `wrapSocketWithFingerprint` — randomizar fingerprint de device p/ evitar clustering. **Forja de identidade.**
- `proxyRotator` — rotação de proxy p/ mascarar origem. **Mascaramento de identidade.**
- `stealthConnect` — conexão "stealth". **Evasão por design.**
- `legitimacySignalInjector` — typos/pausas falsas p/ driblar o ML "too perfect". **Evasão de detecção.**
- `contentVariator` — spinning de conteúdo p/ driblar dedup de spam. **Evasão de detecção.**
- `humanEntropy` — ruído (typing/presence/read) cujo propósito declarado é evitar detecção de bot. **Evasão de detecção.**
- `banRecoveryOrchestrator` / `reputationVoucher` — retomar após ban / inflar reputação. **Burlar punição da plataforma.**
- Rodízio de números para dividir os envios de uma loja — alternar ou sortear qual número da loja
  executa cada envio ou ação para diluir volume ou padrão por número. Nada de balanceamento, sorteio ou
  revezamento de número por post, por grupo ou por ação. Decisão do Igor em 2026-11-09. O propósito é
  diluir o padrão por número para escapar da detecção da plataforma. **Evasão de detecção.**
  - Hoje a escolha é fixa por run, nunca por envio: `pickSendInstance`
    (`apps/worker/src/pick-send-instance.ts`) devolve o número de grupos `connected` mais antigo, e
    `app.enqueue_broadcast` (`apps/web/supabase/migrations/20261109140000_envio_pelo_avisos.sql`) fixa um
    único número para o disparo inteiro (o conectado há menos tempo). Nenhum sorteia nem reveza.
  - Alcance: ter mais de um número conectado **não** é o que está recusado; cada número segue os próprios
    tetos. Segundo número como admin reserva ou como observador de grupo está **em aberto**, não decidido aqui.

## Recusado (risco de denúncia — NÃO implementar)

Recusa por **risco**, não por evasão: não há detecção a driblar, só uma prática que gera denúncia.

- **Adicionar pessoas a grupo de WhatsApp por número de telefone** — nem por botão no painel, nem por
  automação ou agendamento. Grupo recebe gente **só por link de convite**. Decisão do Igor em 2026-11-09.
  **Incluir quem não pediu para entrar leva a denúncia e à restrição do número.**
  - No código: `apps/worker/src/evolution-groups.ts` só chama `group/updateParticipant` com
    `action: "remove"` (`removeParticipant`), e o comentário do cabeçalho registra que o pool é
    populado por link, nunca por `add`. Não reintroduzir `add` de terceiro sem nova decisão.
  - Alcance: vale para terceiros. Um segundo número do próprio lojista como admin reserva está
    **em aberto** e não é decidido aqui.

## Nome de dispositivo (revisado 2026-07-30 — E0.4)

O campo `browser` do Baileys é o **nome do dispositivo vinculado** (o que aparece em
"Aparelhos conectados" do WhatsApp), **fixo por sessão**. Distinção que importa:

- ✅ **Permitido:** um nome **estável e realista** (`Browsers.ubuntu("Chrome")`). O valor
  antigo `["HUBFLOW","Chrome","1.0.0"]` era uma anomalia auto-infligida — nenhum cliente
  legítimo se chama "HUBFLOW". Usar um nome normal **remove** um sinal de automação; não é
  forjar identidade pra evadir detecção, é parar de se auto-denunciar.
- ⛔ **Segue recusado:** **randomizar** o fingerprint/nome a cada conexão pra driblar
  *clustering* (o `deviceFingerprint`/`wrapSocketWithFingerprint` da lista acima). Isso sim é
  evasão — e ainda por cima gera "aparelho novo" a cada boot, que é um gatilho de segurança.

Regra: **nome de dispositivo fixo e realista = ok; randomização = não.**

## Ressalva permanente

Nenhum controle garante não-ban. O que protege de fato: número aquecido (WarmUp), volume baixo
no início, ritmo humano e boa taxa de entrega. A fila reduz risco; não é blindagem.
