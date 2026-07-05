# ENGINE_AUDIT.md — Auditoria da Engine WhatsApp (Baileys)

> **Natureza:** diagnóstico somente-leitura. Nenhum código/config foi alterado. Data: 2026-07-02.
> **Escopo lido:** `index.js` (896 LOC), `anti-ban-queue.js`, `queues/supabase-command-worker.js`,
> `package.json`, `Dockerfile`, `.dockerignore`, `deploy/coolify/engine.docker-compose.yml`, `supervisor.js`
> (parcial), `config/env.js` (existência). Fatos rastreáveis por `arquivo:linha`.
> **Veredito global:** o **núcleo anti-ban é excelente**; a **operabilidade/observabilidade e o caminho de
> multi-tenant são frágeis ou inexistentes**. Nada aqui é bloqueador do que já roda (1 número), mas há 3
> itens 🔴 que mordem em produção sob carga/reconexão.

## Placar por área

| Área | Nota | Resumo |
|---|---|---|
| Anti-ban / Rate limit | 🟢 Forte | Fila gaussiana + governor + warmup + breaker + estado persistido atômico |
| Fila / Workers | 🟢 Bom | 2 vias (HTTP pull + Supabase RPC), ambas passam pela fila anti-ban |
| Memory leak | 🟢 Bom | Podas ativas; 1 ressalva menor (cleanup de socket na reconexão) |
| Reconexão | 🟠 Médio | Backoff sólido inline, mas watchdog existe e **não está plugado** (half-open sem cobertura) |
| Docker / Coolify | 🟠 Médio | Multi-stage ok; falta non-root, resource limits, pin de versão |
| Health check | 🟠 Fraco | `/health` responde 200 mesmo **deslogado** do WhatsApp |
| Segurança | 🟠 Fraco | Container root, SERVICE_ROLE_KEY no container, `ENGINE_TOKEN` com default inseguro |
| Logs / Observabilidade | 🔴 Ruim | `console.log` com emoji, `pino` silenciado, zero métricas/traces |
| Arquitetura (CJS×ESM) | 🔴 Frágil | Mistura CommonJS + ESM só funciona em Node ≥22.12; imagem não pinada |
| Distribuição / Escalabilidade / Sessões | 🔴 Inexistente | Single-número; `supervisor.js` multi-tenant **não roda e está desalinhado** |
| Webhooks | ⚪ N/A | Engine é 100% PULL; não há ingestão por webhook (latência 3–10s) |
| Performance (CPU/RAM) | 🟡 Info | Sem limites nem profiling; desenho evita os vazamentos óbvios do Baileys |

---

## 1. Arquitetura

**Desenho:** processo único Node que junta (a) servidor Express de health
([index.js:2-23](index.js)), (b) socket Baileys ([index.js:642-647](index.js)), (c) fila anti-ban, (d)
worker Supabase, (e) timers (heartbeat 30s, dispatch/grow 10s). Engine **sem banco próprio**: estado em
memória (`Map`/`Set`) + arquivos (`auth/`, `engine-state.json`) + o app como fonte de verdade.

**Duas vias de comando coexistem:**
1. **Pull HTTP do app** — `POST /api/dispatch/pending` (10s) e `/api/groups/grow/pending`
   ([index.js:702-705](index.js)).
2. **Fila Postgres via RPC** — `claim_engine_commands` no `supabase-command-worker` (3s,
   [supabase-command-worker.js:133](queues/supabase-command-worker.js)).
Ambas legítimas e ambas passam pela fila anti-ban, mas são **dois modelos de fila** mantidos em paralelo —
custo de complexidade e de raciocínio.

### 🔴 A-1: mistura CommonJS + ESM depende de Node ≥ 22.12
`package.json` **não tem** `"type": "module"` → `.js` é CommonJS. Porém:
- `index.js` é CJS e faz `require("./anti-ban-queue.js")` e `require("./delivery-tracker.js")`
  ([index.js:42-45](index.js));
- **`anti-ban-queue.js` e `delivery-tracker.js` são ESM** (`import`/`export`).

`require()` de um módulo ESM só é suportado a partir do **Node 22.12** (require(esm) síncrono). O
`Dockerfile` usa `node:22-alpine` **sem pin de patch** ([Dockerfile:1](Dockerfile)). Hoje `22-alpine`
resolve para ≥22.12 e sobe; um rebuild que pegue uma tag mais antiga, ou um downgrade para Node 20, **quebra
o boot inteiro** com `ERR_REQUIRE_ESM`. É reprodutibilidade pendurada num detalhe de minor.
→ **Fix barato:** padronizar tudo em ESM **ou** tudo em CJS, e **pinar** a imagem (`node:22.14-alpine` ou por
digest).

---

## 2. Anti-ban / Rate limit  🟢

Melhor parte da engine. [anti-ban-queue.js](anti-ban-queue.js): delays **gaussianos** (Box-Muller,
[:51-61](anti-ban-queue.js)), lanes de prioridade, **governor** por minuto/hora/dia
([:156-181](anti-ban-queue.js)), backoff exponencial, **circuit breaker** (5 falhas → pausa 60s). Integra
`WarmUp` (teto crescente ~7 dias) e `GroupOperationGuard` (2 create / 3 add por janela).

**Persistência correta:** estado salvo com **escrita atômica** (`tmp`+`rename`,
[index.js:103-115](index.js)) e o restart **restaura a janela de 24h** — não libera cota nova
([index.js:91-96](index.js)). Isso é o detalhe que a maioria erra. Salva em `SIGINT/SIGTERM/uncaughtException`
([index.js:119-134](index.js)).

**Limites:** um único número; caps globais fixos (8/120/800); sinal de ban real limitado a "entrega <60%"
([index.js:66-69](index.js)). Aceitável para o estágio.

---

## 3. Reconexão  🟠

Inline em `connection.update` ([index.js:712-730](index.js)): backoff exponencial 3s→60s + jitter, reset ao
abrir; `loggedOut` → limpa `auth/` e gera QR novo. Sólido para o caso comum.

**🟠 R-1 — watchdog órfão:** existe `connection-watchdog.js`, mas **`index.js` não o importa** (confirmado por
grep). A reconexão depende 100% do Baileys **emitir** `close`. Numa conexão **half-open** (socket "morto" sem
evento), não há timer externo que force o restart — exatamente o buraco que o watchdog cobriria. O
`/health` também não detecta (item 9).

**🟡 R-2 — sem cleanup do socket anterior:** cada reconexão chama `start()` de novo e registra listeners num
socket novo, mas o socket antigo não recebe `.end()`/`removeAllListeners()` explícito. Baileys costuma
encerrar sozinho; em ciclos longos de reconexão é um acúmulo teórico de listeners/sockets.

---

## 4. Logs  🔴

`console.log` com emojis, sem timestamp, sem nível, sem JSON ([index.js](index.js) inteiro). `pino` está
instanciado em **`level: "silent"`** ([index.js:49](index.js)) — ou seja, o logger estruturado existe e está
mudo, e a saída real é `console`. Em Coolify isso é impossível de filtrar/agregar/alertar. → migrar a saída
operacional para `pino` com `level` por env e stdout JSON.

---

## 5. Distribuição / Escalabilidade / Sessões  🔴

**Estado atual: single-instance, single-número.** `useMultiFileAuthState("auth")`
([index.js:629](index.js)) usa um diretório **fixo**. Rodar 2 réplicas do container = 2 conexões do **mesmo**
número = ban garantido. Não há isolamento por tenant.

**🔴 E-1 — o multi-tenant existe só como esboço não-funcional.** `supervisor.js` foi projetado
exatamente para isto (fork de N `index.js`, 1 por número, poll de instâncias no Supabase, health por child,
restart com backoff). **Mas:**
- **Não roda em produção:** `Dockerfile` faz `CMD ["node", "index.js"]`, não `supervisor.js`.
- **Está desalinhado com o `index.js` atual:** o supervisor injeta `ENGINE_MODE=worker` e `INSTANCE_ID`, que
  o `index.js` **não lê**; e todos os children usariam o **mesmo** `auth/` (colisão de sessão).
- **Contrato divergente:** o supervisor fala da tabela `whatsapp_instances`; o schema real tem `instances`.
- O `compose` monta um volume **`sessions`** que o `index.js` **não usa** (órfão).

Conclusão honesta: "escalabilidade horizontal" e "multi-sessão" **não estão implementadas** — há um rascunho
que precisaria de: `INSTANCE_ID` → `auth/<instanceId>` isolado no `index.js`, `CMD` para o supervisor, e
alinhar o nome da tabela. É um projeto, não um ajuste.

---

## 6. Workers / Fila  🟢

- **Fila anti-ban:** ver item 2.
- **`supabase-command-worker`** ([queues/supabase-command-worker.js](queues/supabase-command-worker.js)):
  loop com `claim_engine_commands` (batch 5), trata `send_message`/`refresh_status`, faz `complete`/
  `record_engine_event`/`update_instance_status` via RPC, backoff em erro. Desativa-se sozinho se faltar
  `SUPABASE_*` ([:48-55](queues/supabase-command-worker.js)). Bom cidadão. **Acoplamento:** depende de 4 RPCs
  no banco (provável `infra/migrations/202606240005_engine_rpc.sql`) — se a assinatura mudar, quebra em
  runtime.
- **Concorrência de pollers:** dispatch 10s + grow 10s + worker 3s + heartbeat 30s no mesmo processo. Tudo
  com trava de reentrância (`dispatching`/`growing`/`running`) — ok.

---

## 7. Memory leak  🟢

Bem controlado. `pruneMemory()` roda no heartbeat (30s) e poda `welcomed` (>24h) e `groupActivity` (dias
anteriores) ([index.js:618-623](index.js)); `sentTimestamps` é filtrado a 24h; `welcoming` limpa no `finally`
([index.js:332-334](index.js)). **Ressalva menor:** `groupNames` nunca é podado
([index.js:825](index.js)) — cresce com o nº de grupos vistos (bounded, baixo risco). O desenho **evita** o
vazamento clássico do Baileys por **não** usar `makeInMemoryStore`.

---

## 8. Performance / CPU / RAM  🟡

- **Sem `resources.limits` no compose** — container sem teto de RAM/CPU; um pico leva o host a OOM sem
  fronteira. Em Coolify, definir `mem_limit`/`cpus`.
- Boas escolhas: `@todos` resolvido por **thunk serializado** na fila (não N `groupMetadata` em paralelo,
  [index.js:401-403](index.js)); mídia baixada **uma vez** e reusada no broadcast ([index.js:391-395](index.js)).
- Sem profiling nem métricas de processo expostas (ver item 11).

---

## 9. Health check  🟠

[index.js:9-17](index.js): `/health` **sempre responde 200**, mesmo com WhatsApp desconectado (informa
`whatsappConnected` no corpo, mas não muda o status). O healthcheck do `compose` só verifica se **responde**
([compose:healthcheck](../deploy/coolify/engine.docker-compose.yml)). Resultado: um container **vivo mas
deslogado** aparece **saudável** e o Coolify **não** reinicia. → separar `live` (processo ok) de `ready`
(WhatsApp conectado) e retornar **503** em `/health` quando `!whatsappConnected` para o orquestrador agir.

---

## 10. Docker / Coolify  🟠

**Bom:** multi-stage ([Dockerfile](Dockerfile)), `npm ci --omit=dev`, `wget` para healthcheck,
`restart: unless-stopped`, volumes nomeados (`auth`/`state`), `.dockerignore` cobrindo `auth`/`sessions`/
`engine-state.json`/`.env`.

**Faltas:**
- 🟠 **Roda como root** — sem `USER node`. Container comprometido = root no container.
- 🟠 **Imagem não pinada** — `node:22-alpine` sem patch/digest (ver A-1).
- 🟠 **Sem resource limits** (item 8).
- 🟡 **HEALTHCHECK só no compose**, não no `Dockerfile` — fora do Coolify (deploy manual) não há health.

---

## 11. Segurança  🟠

- 🔴 **`ENGINE_TOKEN` com default inseguro** `"dz_dev_engine_token"` ([index.js:190](index.js)) — se a env
  não for setada, a engine autentica no app com o token público de dev. Deve **falhar o boot** se ausente em
  produção.
- 🟠 **`SUPABASE_SERVICE_ROLE_KEY` dentro do container** (necessária para o worker, [compose](../deploy/coolify/engine.docker-compose.yml)) — é chave *god-mode* que **bypassa RLS**. Container comprometido = banco inteiro. Minimizar superfície / considerar rota via app em vez de RPC direto.
- 🟠 **`appFetch` usa `APP_URL` cru** ([index.js:193-198](index.js)) — se `APP_URL` for `http://` em rede
  pública, o `x-engine-token` trafega em claro. Garantir HTTPS ou rede interna Coolify.
- 🟡 `/health` expõe `uptime`/estado sem auth (info leak menor; aceitável para health).

---

## 12. Webhooks  ⚪ N/A (com observação)

A engine **não expõe webhooks de entrada** — toda integração é **PULL** (engine puxa do app por HTTP e do
Supabase por RPC). Não há endpoint que receba eventos do app. **Consequência:** latência de disparo de
**3–10s** (intervalo do poll). Um webhook `app → engine` ("há disparo novo") derrubaria essa latência para
~imediato, mas hoje é inexistente. Os webhooks reais do produto (Stripe etc.) vivem no **app**, não aqui.

---

## 13. Observabilidade  🔴

Sem `/metrics` (Prometheus), sem tracing, sem logs estruturados. A engine **calcula** stats boas
(`queue.stats()`, `delivery.getStats()`, `warmup.status()`) mas só as manda ao **app** via heartbeat
([index.js:233-247](index.js)) e para o **console**. Não há visão operacional da própria engine em Coolify.
Único "alerta" é um `console.log` quando a entrega cai <60%. → expor `/metrics` e/ou empurrar as stats para
um coletor; elevar `pino`.

---

## 14. Prioridades sugeridas (NÃO implementar sem aprovação)

Incremental, sem reescrever o núcleo (que é bom). Ordem por risco:

| P | Item | Ação mínima | Ref. |
|---|---|---|---|
| P0 | Boot frágil CJS×ESM | padronizar módulos + **pinar** imagem Node | A-1 |
| P0 | Token/segredos | falhar boot se `ENGINE_TOKEN` ausente em prod; revisar exposição da service-role | 11 |
| P1 | Health mente | `/health` → 503 quando deslogado; separar live/ready | 9 |
| P1 | Reconexão half-open | plugar `connection-watchdog.js` no `index.js` | R-1 |
| P1 | Container root / sem limites | `USER node` + `mem_limit`/`cpus` no compose | 10, 8 |
| P2 | Observabilidade | `pino` estruturado + `/metrics` | 4, 13 |
| P2 | Latência de disparo | webhook `app→engine` opcional (fallback mantém poll) | 12 |
| P3 | Multi-tenant real | isolar `auth/<INSTANCE_ID>`, `CMD`=supervisor, alinhar tabela `instances`, remover volume `sessions` órfão | E-1 |

---

## 15. Resposta direta: "é necessário este audit?"

**Sim, e ele rende.** Diferente de itens aspiracionais da lista (distribuição/escalabilidade **não existem**
ainda — são um esboço em `supervisor.js`), a auditoria revelou **riscos concretos de produção** que não
apareceriam a olho nu: o **boot pendurado no minor do Node** (A-1), o **health que mente** (9), o **watchdog
desligado** (R-1) e o **token/segredos** (11). O núcleo anti-ban, por outro lado, está **acima da média** e
**não deve ser tocado** além de ajustes.

*Fim do relatório. Diagnóstico apenas; nenhuma alteração aplicada.*
