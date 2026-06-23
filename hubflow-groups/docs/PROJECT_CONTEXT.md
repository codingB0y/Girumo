# DevZap Groups — Contexto do Produto

> Documento de contexto reconstruído a partir da leitura do código (app + engine + landing).
> Última reconstrução: 2026-06-22. **Documentação, não código.**

O produto **DevZap Groups** vive hoje em **duas pastas separadas** no mesmo nível do Desktop:

| Pasta | Papel | Stack |
|---|---|---|
| `devzap-groups/` | App web: painel (frontend), API (backend) e landing page de marketing | Next.js 16 + React 19 + TypeScript + Tailwind 4 |
| `devzap-engine/` | Engine de WhatsApp (conexão, captura de leads, disparo, anti-ban) | Node.js (ESM) + Baileys 7 |

As duas se comunicam por **HTTP + token compartilhado** (`x-engine-token`). Não há banco de dados: a persistência é em **arquivos JSON / NDJSON** dentro de `devzap-groups/data/`.

---

## 1. Objetivo do sistema

Ferramenta de **growth e operação de vendas via grupos de WhatsApp**, feita para **atacadista de moda** (Brás, Madrugada, Mega Moda) que vende para revendedoras. O posicionamento é "VIP Growth OS": resolver três dores em um só lugar, **do celular e em linguagem de lojista leigo**:

1. **Atrair** — encher os grupos de revendedora nova (kit de anúncio para Meta + indicação premiada).
2. **Vender** — disparar ofertas para todos os grupos com um toque, no automático e em ritmo seguro.
3. **Medir** — funil simples (viu anúncio → entrou → interagiu → comprou → recomprou), saúde do negócio, quem sumiu para reativar.

O **risco crítico do produto** (e o motivo de a engine existir como PoC) é fechar o loop:
**clique no anúncio → entrada no grupo → lead contabilizado** — detectando em tempo real quem entra nos grupos via Baileys.

### Modelo de negócio (da landing)
Três planos mensais, sem fidelidade, garantia de 30 dias:
- **Essencial — R$197/mês**: 1 número, até 3 grupos, disparo + agendamento, boas-vindas, funil básico.
- **Growth — R$297/mês** (mais escolhido): grupos ilimitados, kit de anúncio + indicação premiada, medição completa, suporte WhatsApp.
- **Performance Max — R$497/mês**: feito-para-você, setup e ofertas operados em conjunto, revisão estratégica mensal 1:1.

---

## 2. Arquitetura

```
┌─────────────────────────┐         HTTP + x-engine-token         ┌──────────────────────────┐
│      devzap-engine       │  ───────────────────────────────────▶ │       devzap-groups       │
│   (Node + Baileys 7)     │  POST /api/leads     (entrada→lead)    │   (Next.js: app + API)    │
│                          │  POST /api/groups    (sync grupos)     │                          │
│  • Conexão WhatsApp (QR) │  POST /api/session   (heartbeat 30s)   │  ┌────────────────────┐  │
│  • group-participants ──▶│  POST /api/activity  (atividade grupo) │  │  data/*.json|ndjson │  │
│  • messages.upsert       │  GET  /api/welcome   (config)          │  │  (persistência MVP) │  │
│  • Fila anti-ban         │  GET  /api/optout    (lista)           │  └────────────────────┘  │
│  • WarmUp/Guard/Delivery │  POST /api/dispatch/pending (claim)    │                          │
│                          │  POST /api/dispatch/ack    (progresso) │  Painel (React) ── lojista│
│  Pull a cada 10s ◀───────│  GET  /api/media/:id (baixa foto)      │  Landing pública  /       │
└─────────────────────────┘                                        └──────────────────────────┘
         │ auth/  (sessão Baileys persistida em arquivo)
         │ engine-state.json (warmup + janelas de envio, sobrevive a restart)
```

### Fluxos principais

**A. Captura de lead (o "coração" do PoC)**
1. Engine conectada escuta `group-participants.update`.
2. Em grupos **onde o número é admin** (única fonte de verdade — nunca cai para "todos"), uma entrada (`add`) resolve o telefone real (LID→PN do Baileys 7) e chama `POST /api/leads`.
3. App faz **dedupe por telefone** (upsert): mesma pessoa não infla o funil; grupos extras vão para `alsoIn[]`. `enteredAt` é imutável (1ª entrada).
4. Opcional: boas-vindas automáticas em DM (se habilitado, fora do opt-out, ainda não saudado).

**B. Disparo de ofertas (motor real)**
1. Lojista cria uma **oferta** (broadcast) no painel e clica "Enviar agora" → `enqueueDispatch` muda status para `queued`.
2. Engine faz **poll a cada 10s** em `POST /api/dispatch/pending`; o app faz **claim atômico** (lock de arquivo) `queued → running` para evitar disparo duplicado, e recupera jobs `running` presos (>15min sem ack → `failed`).
3. Engine dispara **1 mensagem por grupo** pela fila anti-ban (texto / foto / vídeo / enquete, com opção `@todos`), reportando progresso real via `POST /api/dispatch/ack`.

**C. Telemetria ao vivo**
- Heartbeat a cada 30s (`POST /api/session`) com stats da fila, taxa de entrega e warmup → destrava cards de "número saudável"/densidade no painel.
- Snapshot de atividade dos grupos (`POST /api/activity`) — conta mensagens e remetentes únicos (só contagem, sem números — privacidade) → alimenta etapa "Interagiram" do funil e detecção de "grupo parado".

### Autenticação / segurança
- **Painel**: senha única (`APP_PASSWORD`) → cookie de sessão assinado por HMAC (`AUTH_SECRET`). `middleware.ts` protege tudo, exceto landing `/`, login, link público `/r/` e assets.
- **Engine→App**: header `x-engine-token` deve bater com `ENGINE_TOKEN`. Rotas de engine listadas explicitamente no middleware.
- Defaults inseguros existem (dev) — `.env.local` obrigatório em produção.

---

## 3. Stack

**App (`devzap-groups`)**
- Next.js **16.2.9** (App Router) — ⚠️ versão com breaking changes vs. treino; `AGENTS.md` manda ler `node_modules/next/dist/docs/` antes de codar.
- React **19.2.4**, TypeScript 5, Tailwind CSS **4** (via `@tailwindcss/postcss`).
- `lucide-react` (ícones), `clsx` + `tailwind-merge` (utilitário `cn`).
- **Sem ORM, sem banco**: persistência em `data/*.json` e `data/*.ndjson` com escrita atômica + lock por arquivo (`lib/atomic-fs.ts`, `lib/json-collection.ts`). Comentários marcam "migrar p/ Postgres/Prisma depois".

**Engine (`devzap-engine`)**
- Node.js ESM (`"type": "module"`), script único `node index.js`.
- `@whiskeysockets/baileys` **^7.0.0-rc13** (biblioteca **não-oficial**, via QR Code).
- `qrcode-terminal` (QR no terminal), `pino` (logger, silencioso por padrão).
- Sessão Baileys persistida em `auth/` (multi-file auth state). Estado anti-ban em `engine-state.json`.

**Observação:** `devzap-engine/agent-orchestrator/` é um repositório de terceiros (OSS, ferramenta de orquestração de agentes de dev) clonado como referência — **não faz parte do runtime do DevZap**. A engine real são os arquivos `.js` na raiz de `devzap-engine/`.

---

## 4. Componentes

### 4.1 Engine (`devzap-engine/`)
| Arquivo | Responsabilidade |
|---|---|
| `index.js` | Conexão Baileys, persistência de sessão, listagem/sync de grupos admin, detecção de entradas/saídas, motor de disparo, heartbeat, atividade, boas-vindas. |
| `anti-ban-queue.js` | Fila de envio: delays gaussianos (3–7s), lanes de prioridade, governor min/hora/dia, backoff exponencial, circuit breaker. **Todo envio passa por ela.** |
| `warmup.js` | Rampa de volume para número novo (dia 1 ≈ 20 msgs, gradua em ~7 dias). Gateia o teto diário da fila. |
| `group-guard.js` | Limita operações de grupo (3 adds/10min) p/ evitar `account_reachout_restricted`; classifica erros. |
| `delivery-tracker.js` | Mede taxa de entrega via recibos; alerta se < 60% (sinal de soft-ban). |
| `engine-state.json` | Estado anti-ban persistido (warmup + timestamps de envio das últimas 24h) — sobrevive a restart. |
| `test-queue.js`, `test-modules.js` | Testes isolados sem WhatsApp. |

### 4.2 App — Backend (`src/app/api/*` + `src/lib/*`)
**Rotas de API** (todas sob `data/` como storage):
- Consumidas pela engine: `/api/leads`, `/api/groups`, `/api/session`, `/api/activity`, `/api/welcome`, `/api/optout`, `/api/dispatch/pending`, `/api/dispatch/ack`, `/api/media/:id`.
- Consumidas pelo painel: `/api/campanhas`, `/api/broadcasts`, `/api/templates`, `/api/schedules`, `/api/links`, `/api/orders`, `/api/referrals`, `/api/ad-campaigns`, `/api/auth/*`.
- `/r/[slug]` (pública): redirect de link rastreável → registra clique (`clicks.ndjson`).

**Camada de domínio (`src/lib/`)**
- `json-collection.ts` — coleção genérica com CRUD + `transact` atômico (usada por broadcasts, templates, schedules, ad-campaigns, campanhas).
- `leads-store.ts` — leads em NDJSON com dedupe/upsert por telefone; status `novo|ativo|comprou`; remoção LGPD.
- `dispatch-store.ts` — motor de fila de disparo (enqueue / claim atômico / ack / recovery de job preso).
- `business-health.ts` — **núcleo da inteligência de negócio**: monta a Central de Resultados (funil, score 0–100, próxima ação única, recompra, grupos parados, faturamento). Só usa dado real; etapas não medidas aparecem como indisponíveis.
- `session-store.ts` — status real da sessão + `isLive` (conectada e heartbeat < 90s).
- Demais stores: `groups-store`, `orders-store`, `referrals-store`, `schedules-store`, `optout-store`, `welcome-store`, `activity-store`, `media-store`, `campanhas-store`, `clicks-analytics`, `active-campanha`, `auth`.

### 4.3 App — Frontend (`src/app/(app)/*` + `src/components/*`)
Painel autenticado, mobile-first, tema **claro premium com acento violeta** (`brand-*`). Navegação (sidebar):
`Hoje` · `Crescer` · `Visão geral` · `Campanhas` · `Meus grupos` · `Atrair revendedoras` · `Indicação premiada` · `Origem das entradas` · `Revendedoras` · `Ofertas` · `Modelos de mensagem` · `Divulgações agendadas` · `Resultados` · `Configurações`.

Componentes-chave: `funnel-visual`, `health-card`, `daily-checklist`, `onboarding-checklist`, `connection-banner` (alerta de WhatsApp desconectado), `campanha-selector`, `stat-card`, UI base (`button/card/input/badge`), `toast`.

### 4.4 Landing page (`src/app/page.tsx`)
Página pública de marketing (rota `/`), com hero, mockup do painel, problema/solução (Atrair/Vender/Medir), como funciona, comparação, **planos**, garantia, FAQ e CTAs para WhatsApp. ⚠️ Pendência: número de WhatsApp ainda é placeholder (`wa.me/5511999999999`, marcado com `TODO Igor`).

---

## 5. Regras de negócio

**Captura / atribuição**
- Só monitora e captura leads em **grupos onde o número conectado é admin** — `adminGroupIds` é a única fonte de verdade. "Melhor não capturar do que capturar grupo errado." Múltiplos sinais de admin (Baileys 7 + LID é inconsistente).
- Lead **deduplicado por telefone**; `enteredAt` imutável; reentradas só atualizam `lastSeenAt`; grupos extras em `alsoIn[]`.
- Telefone não resolvido (LID sem mapping) → lead com número oculto (sempre cria, não dá p/ deduplicar desconhecido).

**Anti-ban (controle operacional, NÃO evasão)** — ver `devzap-engine/DECISIONS.md`
- Critério: "fazer menos, mais devagar, monitorar". **Recusado por princípio**: fingerprint de device, rotação de proxy, stealth connect, injeção de typos/pausas falsas, spinning de conteúdo, ban-recovery — tudo classificado como forja de identidade / evasão de detecção.
- Defaults da fila: delay 3–7s, 8/min, 120/h, 800/dia; warmup reduz o teto p/ número novo e espalha a cota por ~8h ativas.
- Estado anti-ban **persiste** (`engine-state.json`): restart não libera nova cota diária.
- Disclaimer permanente: nenhuma fila garante não-ban; protege de fato número aquecido + volume baixo + ritmo humano + boa entrega.

**Disparo**
- 1 mensagem por grupo; grupos vazios → dispara em **todos os grupos admin**; nunca dispara onde não é admin.
- Claim atômico evita disparo duplicado; job `running` sem ack > 15min vira `failed` (não re-enfileira sozinho, p/ não arriscar duplo envio).
- Foto/vídeo baixados uma vez e reusados; suporta enquete e `@todos` (menção invisível de todos os participantes).

**Boas-vindas / opt-out / LGPD**
- DM de boas-vindas passa pela fila anti-ban (lane normal — DM a quem nunca te escreveu é o maior vetor de ban). Dedupe por número.
- Respeita lista de **opt-out**; lead pode ser excluído (direito de eliminação LGPD).

**Medição (`business-health.ts`)**
- Funil: tráfego (cliques) → entradas (leads) → interagiram (atividade) → compraram (orders) → recompraram → cliente ativa. **Etapas não medidas vêm marcadas como indisponíveis** (não inventa número).
- **Score de saúde 0–100** = crescimento (até 45) + atividade recente (até 25) + conexão ao vivo (30). Status verde ≥70 / amarelo ≥45 / vermelho.
- Meta semanal fixa: **50 novas revendedoras** (`WEEKLY_GOAL`).
- "Grupo parado" = sem entrada **e** sem conversa há 7 dias. "Recompra/sumida" = quem comprou mas não compra há +14 dias (reativação = venda mais barata).
- Sempre **uma única "próxima ação"** sugerida, priorizada por contexto (desconectado > reativar sumidas > poucas entradas > reaquecer > manter).

**Conceito de "Campanha" (workspace)**
- `campanha` (≠ "ofertas/campaigns") é um **escopo de trabalho** que agrupa um conjunto de grupos (ex.: campanha "Inverno" da loja "virei moda"). Guardado em cookie `dz_campanha`; sem campanha ativa, o app opera todos os grupos.

---

## 6. Estado atual

**Engine** — PoC funcional, conectado a um número real:
- ✅ Conecta, persiste sessão, lista grupos admin, **detecta entradas/saídas em tempo real**, registra leads no app.
- ✅ Fila anti-ban + WarmUp + Guard + DeliveryTracker implementados e testáveis isoladamente.
- ✅ Motor de disparo real (texto/foto/vídeo/enquete/@todos) com progresso e recuperação de job preso.
- ✅ Boas-vindas automáticas, sync de grupos, heartbeat e atividade.
- `engine-state.json` mostra warmup em curso (dia 2026-06-22, `graduated: false`, 1 enviada hoje).
- ❌ Pendências declaradas no README: casar entrada **com o clique do anúncio** (Caminho A completo via `/api/links`); multi-tenant (hoje 1 número por vez); banco de dados.

**App** — painel + landing operacionais sobre storage em arquivo:
- Dados reais já presentes: 3 leads, 1 pedido, cliques, 28 grupos sincronizados (campanha "Inverno"/"virei moda"), templates, broadcasts.
- ⚠️ Persistência é MVP em arquivo (lock + escrita atômica) — marcada para migrar a Postgres/Prisma.
- ⚠️ Landing com número de WhatsApp placeholder (`TODO Igor`).
- ⚠️ `WEEKLY_GOAL` e config de boas-vindas ainda hard-coded / self-service parcial.

**Integração** — app↔engine funcionando via token; defaults de dev inseguros (exigem `.env.local` próprio em produção).

> Resumo: **engine PoC validada + app/landing prontos como MVP**, ainda sobre arquivos JSON, single-tenant, com a atribuição clique→entrada e a migração para banco como próximos passos.
</content>
</invoke>
