# Changelog — DevZap Groups

Histórico de mudanças do produto (app `devzap-groups` + engine `devzap-engine`), reconstruído a partir
do log interno (`system/CHANGELOG.md`), `system/NEXT.md`, `DECISIONS.md` e do código.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).
O projeto ainda não usa versionamento semântico — as entradas são agrupadas por **data** (mais recente primeiro).
Datas em 2026.

---

## [Não lançado] — pendências priorizadas

- **Banco de dados** — migrar persistência de arquivo (`data/*.json|ndjson`) para SQLite/Postgres + Prisma.
  Resolve de uma vez **multi-tenant** (hoje single-tenant, `data/` global, 1 deploy por cliente), race de
  escrita e claim de disparo. Maior alavanca antes de escalar clientes.
- **Atribuição clique→entrada completa (Caminho A)** — casar a entrada no grupo com o clique recente do
  link na engine, não só por correlação de leitura.
- **Escopo de campanha no servidor** — `business-health` (funil/recompra do `/hoje`) e a captura da engine
  ainda operam todos os grupos admin; falta filtrar pela campanha ativa.
- **Config editável** — `WEEKLY_GOAL` (meta semanal) e limites anti-ban estão hard-coded.
- **Integração Meta Ads API** — hoje o kit de anúncio é manual (sem App Review).
- **Landing** — trocar o número de WhatsApp placeholder em `src/app/page.tsx` (`TODO Igor`).
- **Polish/UX round 2** — validação inline de formulário, Esc/foco em modais. _(skeletons ✅ feito)_
- **Engine** — multi-sessão (N números); operações de grupo em massa e ações agendadas de grupo (engine-only).

---

## 2026-06-22 — Frontend+UI: skeletons, lotação de grupos, landing futurista

### Adicionado
- **Loading skeletons no 1º fetch** — primitivo `components/ui/skeleton.tsx` + estado `loaded` em todas as
  telas client com lista (groups, leads, campaigns, campanhas, templates, schedules, indicacao, acquisition)
  e em settings (conexão sem flash de "Desconectado" + opt-out). Mata o "pisca vazio". crescer pulado (wizard).
- **Lotação dos grupos** na tela Grupos — KPIs **Grupos / Disponíveis / Cheios** + barra de lotação por grupo
  (`members`/`capacity`), 100% client com dado existente. Fatia visual do épico "Campanha que lota sozinho"
  (cap/rotação/auto-create seguem como handoff p/ Banco/API + Engine em `system/NEXT.md`).
- **Eyebrows de seção** na landing (rótulos techno em maiúsculas) nas 8 seções principais.
- **`docs/UI_RULES.md`** — fonte de verdade visual da lane Frontend+UI.

### Alterado
- **Landing repaginada (techno-futurist 2026)** — `src/app/page.tsx` + utilitários em `globals.css`:
  hero com grade técnica + aurora animada + shimmer no headline + badge glass; cards com borda em gradiente
  (`dz-border-glow`) + hover-lift; CTAs gradiente violeta→esmeralda com glow/varredura; bento grid nos
  benefícios; aurora atmosférica nas seções claras. Mantida a identidade violeta e o conteúdo/copy.
  a11y: respeita `prefers-reduced-motion`. Exceção só da landing — o painel segue Light Premium.
  Tendências (bento/aurora/glass) confirmadas por pesquisa.

---

## 2026-06-22

### Adicionado
- **Conceito de Campanhas** (modelo DevZapp: Campanha = escopo de grupos). Entidade `Campanha {name, loja,
  groupIds}` (`campanhas-store.ts`, `/api/campanhas` GET/POST/PATCH/DELETE), página `/campanhas` (criar por
  loja, atribuir grupos específicos do pool, ativar; agrupa por loja → multi-loja). Campanha ativa em cookie
  `dz_campanha` + seletor na topbar. Escopo aplicado (client-side) a ofertas, /crescer e Revendedoras.
- **Paridade competitiva com o DevZapp** (4 lacunas do teardown em `system/COMPETITIVE.md`):
  - **Disparo com foto/vídeo** — `media-store.ts` + `/api/media` (upload) e `/api/media/[id]` (serve bytes
    por engine-token). UI anexa mídia (≤6MB) com preview estilo WhatsApp; engine baixa 1x e reusa em todos
    os grupos.
  - **Marcar todos (@)** — `mentionAll`: menção invisível de todos os participantes (força leitura).
  - **Pixel do Facebook no link** — `/r/[slug]` com pixel vira página intersticial (fbq PageView+Lead →
    redirect em 700ms) em vez de 302, para o Meta otimizar por quem entra.
  - **Enquete** — `poll{question, options}` enviada como enquete nativa do WhatsApp.
- **Landing page pública** em `/` (antes era redirect → /dashboard). Hero, prova social, problema/solução,
  como funciona, comparação, planos, garantia 30 dias, FAQ e CTAs para WhatsApp. Middleware libera `/`
  (app segue protegido).
- **Onboarding self-service** reforçado: `onboarding-checklist.tsx` com barra de progresso e 6 passos até
  o 1º pedido + próxima ação em destaque.

### Alterado
- **Reposicionamento da landing**: removido por completo o ângulo de "proteção contra ban" (assusta o
  cliente). Foco em crescimento + venda + simplicidade ("no piloto automático, do seu celular";
  "feito pra quem entende de moda, não de tecnologia").
- **Precificação** definida: **Essencial R$197 · Growth R$297 (mais escolhido) · Performance Max R$497**
  (flat por número, sem fidelidade, garantia 30 dias). Modelo vira self-service; só o Performance Max é DFY.
- Ordenação de grupos passou a listar os **maiores primeiro** (era menores) em /groups, seletor de ofertas,
  /crescer e atribuição de campanhas.

### Corrigido
- **Atribuição por `sourceGroupId` (JID do grupo)** em vez do nome — robusto a renomeação.
- **`enteredAt` imutável** no dedupe de lead + `lastSeenAt` — reentrada não infla "entradas de hoje".
- **Filtro de clique-bot** em `/r/` — UA de crawler/preview redireciona mas não conta clique.
- **Estado anti-ban/warmup persistido** (`engine-state.json`, carregado no boot, salvo no heartbeat e no
  SIGINT) — restart não libera nova cota diária.

---

## 2026-06-21

### Adicionado
- **Motor de disparo real (app → engine)** — o grande gargalo do produto. Lojista clica "Enviar agora" numa
  oferta → app enfileira (`queued`) → engine puxa via loop de 10s → dispara 1 msg/grupo pela fila anti-ban →
  reporta progresso real. `lib/dispatch-store.ts`, rotas `/api/dispatch[/pending][/ack]`. Barra de progresso
  ao vivo na página de ofertas.
- **Execução de agendamentos** — agendamento aponta para uma oferta real (`Schedule.campaignId`); sem timer
  novo: `/api/dispatch/pending` promove os vencidos (`pending → queued`) antes de claimar. Único → `done`;
  recorrente (daily/weekly) reprograma sozinho. `lib/schedules-store.ts`. **Ciclo de disparo completo:**
  criar oferta → enviar agora OU agendar → engine dispara no horário.
- **Piloto Automático "LOTAR MEU GRUPO"** — tela `/crescer` (wizard, 1 decisão por tela, 3 objetivos:
  lotar/vender/reativar) orquestrando endpoints reais (links, broadcasts, dispatch, schedules).
- **Kit de Anúncio Meta** (`/acquisition`) — pede o convite do grupo → cria link rastreável real → métricas
  reais (cliques + entradas, CPL). Copy em 3 ângulos, público-alvo, prompt de criativo, passo-a-passo.
  Substitui o cross-post nos próprios grupos (que não trazia gente nova).
- **Pedido + Recompra** — o produto passa a enxergar venda. `orders-store.ts` + `/api/orders`; botão "Pedido"
  na tela Revendedoras → cria pedido e marca lead "comprou". `business-health` ganhou compradoras distintas,
  pedidos e faturamento na semana, e detecção de **recompra** (compradora sumida há +14 dias) com próxima
  ação priorizando reativar. HOME ganhou faturamento no hero + card "Revendedoras pra reativar".
- **Indicação Premiada** (`/indicacao`) — 2ª fonte de gente nova, orgânica. Link pessoal rastreável por
  revendedora, ranking por entradas→cliques, recompensa/meta, botão copia link + mensagem pronta.
  `referrals-store.ts`, `/api/referrals[/config]`. Atribuição honesta (cliques exatos; entradas prováveis
  por janela de 30min).
- **Atividade no grupo** — engine conta mensagens de membros (`messages.upsert`) nos grupos admin (só
  contagem, sem PII) e envia snapshot no heartbeat (`/api/activity`, `activity-store.ts`). Acende a etapa
  "Interagiram" do funil.

### Alterado
- **Design Light Premium** — direção escolhida pelo Igor: tema claro elevado com acento violeta (#7C5CFF) +
  gradientes e profundidade (não dark). Verde reservado a sucesso/crescimento. Tokens em `globals.css` +
  Card/Button/Badge/Input premium, Sidebar/Topbar/Login/HOME reestilizados.
- **Funil visual** (`funnel-visual.tsx`) virou peça central da HOME: afunila por proporção real, % entre
  etapas, perda no caminho, insight automático do maior gargalo + CTA. Etapas sem dado aparecem como
  "em breve" (mantêm a forma sem inventar número).

### Segurança / robustez (hardening para venda)
- **Autenticação real** — `lib/auth.ts` (cookie de sessão assinado por HMAC, Edge-safe) + `middleware.ts`
  protege páginas (redirect /login) e API (401); engine autentica por header `x-engine-token`.
  `.env.local` (`APP_PASSWORD`, `ENGINE_TOKEN`, `AUTH_SECRET`).
- **Integridade de escrita** — `lib/atomic-fs.ts` (escrita atômica tmp+rename + lock serial por arquivo);
  todos os stores migrados; `json-collection` ganhou `transact`. Mata corrupção e race entre engine e navegador.
- **Disparo sem duplicação** — `claimPending` virou transação atômica sob lock; job preso em "running" sem
  ack há >15min é recuperado como "failed" (não re-enfileira sozinho).
- **Leads (qualidade + LGPD)** — dedupe por telefone (upsert + `alsoIn`), status editável (PATCH + select,
  destrava etapa "Comprou"), exclusão LGPD, opt-out filtra a captura.

### Corrigido
- **Número errado no painel** — a engine gravava o LID do Baileys 7 (`xxx@lid`) como se fosse telefone.
  `resolvePhone()` mapeia LID→telefone real; desconhecido entra como "Número oculto" (conta a entrada sem
  inventar número).
- **Captura em grupo alheio** — a engine monitorava entradas de qualquer grupo por causa do fallback
  "nenhum admin → todos". Agora `adminGroupIds` é a única fonte; detecção de admin multi-sinal; sem fallback
  para "todos". Melhor não capturar do que capturar errado.
- **Falso "grupo parado"** — grupo lotado que vende era marcado morto só por parar de entrar gente nova.
  Agora "parado" = sem entrada **e** sem conversa há 7 dias (usa atividade real).
- **Privacidade no painel** — `maskPhone()` mostra país+DDD e só os 2 últimos dígitos; número completo
  segue armazenado para o disparo.
- Anti-ban: boas-vindas saíram da lane prioritária; fila ganhou `getMaxPerHour` derivado do warmup
  (espalha a cota do número novo pelo dia, evita burst de bot).

---

## 2026-06-20

### Adicionado
- **Ponte engine → app validada no número real** — engine conecta, lista grupos admin, detecta entrada
  (`group-participants.update`) → `POST /api/leads` → lead aparece no painel. Loop ponta a ponta OK.
- **Camada anti-ban (engine)** — fila de envio (`anti-ban-queue.js`: delays humanizados 3–7s, lanes de
  prioridade, governor min/hora/dia 8/120/800, backoff exponencial, circuit breaker) + módulos seguros:
  `warmup.js` (rampa de volume), `group-guard.js` (limite de operações de grupo), `delivery-tracker.js`
  (alerta de entrega <60%) + jitter gaussiano. 9/9 testes. Evasão (fingerprint/proxy/stealth) recusada por
  princípio — ver `DECISIONS.md`.
- **Boas-vindas automáticas (Sprint 2)** — 1º disparo real do produto: DM na entrada do grupo, via fila
  anti-ban, respeitando opt-out e dedupe. App: `welcome-store` + `/api/welcome` + toggle no Settings.
- **Central de Resultados (V2)** — nova HOME `/hoje`: card principal "seu negócio está crescendo?", funil
  honesto, próxima ação única, score de saúde do negócio (0–100). `lib/business-health.ts` (só dado real).
- **Modo Operador `/hoje`, checklist diário, ranking de grupos, banner de desconexão** (Sprint 3).
- **Status de conexão real** — engine envia stats no heartbeat (fila/entrega/warmup + `connectedSince`);
  `HealthCard` ("número saudável", "conectado há X").
- **Onboarding checklist** + biblioteca de 5 modelos prontos curados (sem IA).

### Alterado
- **De-fake** — app saiu 100% do mock: session/dashboard/reports/settings/grupos/leads reais;
  templates/broadcasts/schedules/ad-campaigns persistem (`json-collection` + `crud-route`). `mock-data.ts`
  reduzido a tipos. Botões mortos removidos.
- **Terminologia sem jargão** (V2) — Leads→Revendedoras, Broadcast→Ofertas, Aquisição→Atrair revendedoras,
  Links→Origem das entradas, Relatórios→Resultados, Dashboard→Visão geral.
- **UX round 1** — navegação mobile (drawer), sistema de Toast, confirmação de exclusão, foco a11y no Button.
- **Memória do projeto** — bootstrap de `system/` (PROJECT_RULES, ARCHITECTURE, DECISIONS, API_CONTRACTS,
  DB_SCHEMA, TASKS, NEXT, CHANGELOG, TECH_DEBT).

### Corrigido
- Parsing de participante do Baileys 7 (objeto/LID, não string) + try/catch no handler + auto-limpeza de
  `auth` em logout/QR expirado.
- `tsconfig` exclui `nextjs-claude-code-starter/` (boilerplate intruso quebrava o type-check).
- Incidente de disco C: a 0 byte (ENOSPC) travou build — limpeza de cache npm + `.next` resolveu.

---

## 2026-06-19

### Adicionado
- **Scaffold do app** — Next.js 16 + React 19 + Tailwind 4 (TS, App Router, `src/`), todas as telas em mock.
- **PoC da engine (Baileys 7)** — `index.js`: conecta via QR, persiste sessão em `auth/`, reconecta sozinho,
  lista grupos e detecta entradas/saídas. Projeto isolado em `devzap-engine`.
- **Link tracker real** — `/r/[slug]` conta o clique (UTM/referer/UA) e redireciona 302; `/api/links`
  (GET/POST); store em arquivo (`links.json` + `clicks.ndjson`). 1ª peça real do produto.

### Alterado
- **Pivô de escopo** — de "broadcast em grupos" para **máquina de aquisição** (anúncio Meta → link
  rastreado → entrada no grupo → lead no app). Kommo descartado (leads ficam na própria plataforma).

### Decisões fundadoras (ver `system/DECISIONS.md`)
- Engine: **Baileys direto** (não Evolution/Cloud API — Cloud API não permite broadcast em grupo).
- Público: lojista acessa direto → **produto self-service** (assinatura à parte).
- Rastreio: **Caminho A** (link encurtado, atribuição estimada).
- Meta Ads: **kit de campanha manual** (sem App Review por ora).
- **Sem IA** — modelos prontos curados.
- Anti-ban: só controles seguros; evasão recusada.
- Persistência inicial em arquivo (migrar para Postgres depois).
- Ordem de build: frontend-first (mock) → 1ª peça real (link tracker) → engine PoC.
</content>
