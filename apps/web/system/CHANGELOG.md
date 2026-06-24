# CHANGELOG

## 2026-06-22 — CAMPANHAS (loja→campanha→grupos = base de tudo) + fix do filtro
Igor: "está misturando grupos aleatórios; quero criar campanhas e colocar os grupos que quiser; posso ter
2 lojas com campanhas diferentes". Implementado o modelo DevZapp (Campanha = escopo de grupos):
- FIX: filtro de grupos ordenava menores primeiro → agora MAIORES primeiro (members desc) em /groups,
  no seletor de ofertas, crescer e na atribuição de campanhas.
- CONCEITO CAMPANHAS: `campanhas-store.ts` (Campanha {name, loja, groupIds}) + `/api/campanhas`
  (GET/POST/PATCH/DELETE). Página `/campanhas` (nav "Campanhas"): cria campanha por LOJA, atribui grupos
  ESPECÍFICOS do pool sincronizado, ativa. Agrupa por loja (multi-loja). Campanha ATIVA num cookie
  (`dz_campanha`, lib/active-campanha.ts + hook use-campanhas.ts). Seletor de campanha ativa na TOPBAR.
- ESCOPO aplicado (client-side): ofertas, crescer e Revendedoras(leads) passam a operar SÓ os grupos da
  campanha ativa (sem campanha = todos). Testado e2e: criar/PATCH grupos/listar/excluir + página 200.
- AINDA GLOBAL (próximo passo, documentado): o FUNIL/recompra do /hoje (server, business-health) e a
  CAPTURA da engine (monitora todos os grupos admin) ainda não filtram por campanha. Pra fechar 100%:
  business-health lê o cookie e filtra leads/orders/activity por nomes dos grupos da campanha; e a engine
  passa a monitorar só os grupos das campanhas (app envia "managed group ids").
- DEFERIDO (engine-only, não testável sem WhatsApp): criar grupos em massa, agendar AÇÕES de grupo
  (nome/imagem/promover admin), link que rotaciona entre grupos quando lota.

## 2026-06-22 — PARIDADE COMPETITIVA c/ DevZapp: foto + @todos + pixel + enquete (autônomo)
Igor deu autonomia total. Fechei as 4 lacunas que o teardown do DevZapp apontou (system/COMPETITIVE.md):
- **DISPARO COM FOTO** — `media-store.ts` + `/api/media` (upload, cookie) e `/api/media/[id]` (serve bytes,
  engine-token). Campaign/DispatchJob += mediaId/mediaType. UI de ofertas: anexar foto (≤6MB) + preview
  estilo WhatsApp. Engine: baixa a foto 1x (appFetch c/ token → Buffer) e envia `{image, caption}` pela
  fila. Testado e2e: upload→engine baixa por token (200 image/png, bytes exatos)→claim carrega mediaId.
- **MARCAR TODOS (@)** — Campaign += mentionAll. Engine busca participantes (groupMetadata) e envia
  `mentions:[...]` (menção invisível que notifica). Toggle na UI + badge @todos no card.
- **PIXEL DO FACEBOOK no link** — TrackedLink += pixelId. /r/[slug] com pixel retorna PÁGINA INTERSTICIAL
  (Meta Pixel dispara PageView+Lead, redireciona em 700ms) em vez de 302 — Meta otimiza por quem ENTRA.
  Campo no Kit de Anúncio (/acquisition) e em /api/links. Testado: /r/ c/ pixel = HTML 200 com fbq; sem = 302.
- **ENQUETE (poll)** — Campaign += poll{question,options}. Engine envia `{poll:{name,values,selectableCount}}`.
  Composer na UI (pergunta + opções dinâmicas). Validação ≥2 opções.
- Card de oferta mostra 📷/@todos. Tudo passa pela fila anti-ban. Envio real precisa da engine ligada
  (testável só com WhatsApp); caminho de dados verificado e2e. ONDE AINDA GANHAMOS do DevZapp: venda/
  recompra/indicação/funil (eles param no lead). Próximas (menor prioridade): criar grupos em massa,
  agendar ações de grupo, links que rotacionam entre grupos.

## 2026-06-22 — Reposicionamento da landing (SEM medo de ban) + onboarding self-service
- DECISÃO do Igor: TIRAR o ângulo de "proteção contra ban" da landing — falar disso PLANTA a dúvida de
  que ban é risco e ASSUSTA o cliente. (Contraria o Growth Hacker, que centrava nisso; Igor conhece o
  público.) Landing reposicionada para CRESCIMENTO + VENDA + SIMPLICIDADE: hero "no piloto automático,
  do seu celular"; seção escura virou "Feito pra quem entende de moda, não de tecnologia" (facilidade);
  removidas todas as menções a ban/medo/spam (hero, badges, problema, FAQ, CTA, metadata, planos). Zero
  ocorrência de "ban" na page. Mantido só "envio no ritmo certo" (neutro/positivo, sem fear).
- ONBOARDING SELF-SERVICE reforçado (modelo agora depende do cliente ativar sozinho): `onboarding-
  checklist.tsx` virou guia de ativação com barra de PROGRESSO + 6 passos cobrindo o ciclo até o "aha"
  (conectar→grupos→atrair→1ª revendedora→1ª oferta→1º PEDIDO) + destaque da PRÓXIMA AÇÃO única com botão.
  Lê sinais reais (session/groups/ads/refs/links/leads/broadcasts/orders). Build OK.

## 2026-06-22 — LANDING PAGE (conversão) + PRECIFICAÇÃO + 4 consertos baratos
- 4 CONSERTOS do auditor: (1) atribuição de anúncio por `sourceGroupId` (JID do grupo) em vez do nome —
  engine reportLead passa o id, lead carrega sourceGroupId, ad-campaigns casa por id (fallback nome);
  (2) `enteredAt` IMUTÁVEL no dedupe + `lastSeenAt` (reentrada não infla "entradas de hoje"); (3) filtro
  de clique-bot em /r/ (UA de crawler/preview redireciona mas NÃO conta); (4) estado anti-ban/warmup
  PERSISTIDO (engine-state.json carregado no boot, salvo no heartbeat + SIGINT) — restart não libera nova
  cota diária. Build OK (os testes e2e de #1-3 ficaram pela metade por interrupção; lógica conferida).
- LANDING PAGE pública em `/` (era redirect→/dashboard): construída com 2 agentes (Growth Hacker p/ copy
  de conversão + Pricing Analyst p/ preço). Eixo de conversão = MEDO DE BAN + prova de venda (não features);
  CTA → WhatsApp humano (converte mais que form p/ leigo). Seções: hero (dark premium), faixa de confiança,
  problema/agitação, 3 pilares, como funciona, ANTI-BAN (seção própria), atrair (anúncio+indicação),
  features→benefícios, PLANOS, garantia, FAQ (<details>), CTA final. Middleware: `/` público (app segue
  protegido). Premium, responsiva. Verificado: / = 200 público, /hoje = 307. TODO Igor: trocar o número
  WHATSAPP placeholder em src/app/page.tsx.
- PRECIFICAÇÃO: analista recomendou DFY R$497/997/1497 (~7-8 clientes). Igor DEFINIU preços de entrada
  mais baixos: **Essencial 197 · Growth 297⭐ · Performance Max 497** (flat por número, garantia 30d, sem
  fidelidade). Implicação (em PRICING.md): a R$~250-300/ticket, R$7-8k MRR = ~25-30 clientes → o modelo
  vira SELF-SERVICE (DFY não cabe no teto de 30min/dia nesse preço; só o Performance Max é DFY). Churn é
  o risco a vigiar; precisa de bom onboarding no app.

## 2026-06-21 — ATIVIDADE NO GRUPO (conserta o falso "grupo parado" + acende "Interagiram")
Auditor: um grupo LOTADO que VENDE era marcado "parado" só porque parou de ENTRAR gente nova — métrica
de sucesso virando alarme falso. A engine não media conversa. Corrigido.
- ENGINE: listener `messages.upsert` conta mensagens de MEMBROS (não as minhas) nos grupos admin →
  por grupo/dia: mensagens + remetentes únicos (só CONTAGEM, sem PII) + lastMessageAt. `reportActivity()`
  envia o snapshot no heartbeat (30s) p/ `/api/activity`.
- APP: `activity-store.ts` (activity.json, upsert por grupo, atômico) + rota `/api/activity` (GET +
  POST engine-token; adicionada às ENGINE_ROUTES do middleware).
- business-health: (1) "grupos parados" agora = SEM entrada E SEM conversa há 7d (usa lastMessageAt) —
  o conserto principal; (2) etapa "Interagiram" do funil ACESA = membros ativos (antes "em breve");
  (3) score de atividade considera conversa (lastMessageAt), não só entrada/oferta. HOME mostra
  "💬 N mensagens hoje em X grupos" no card do funil. Nota do funil atualizada.
- Testado e2e: engine reporta (200), sem token 401, HOME acende "Interagiram" (12 ativos) + conversas hoje.
- Próximas (mapeadas pelos agentes, ainda pendentes): atribuição por targetGroupId; enteredAt imutável;
  filtro de clique-bot em /r/; persistir estado anti-ban/warmup no restart.

## 2026-06-21 — INDICAÇÃO PREMIADA (gente nova SEM verba de anúncio)
A 2ª fonte real de gente nova (a 1ª é tráfego pago). Revendedora traz revendedora (sacoleira conhece
sacoleira) — viral e de graça. Tela `/indicacao` (nav "Indicação premiada").
- `referrals-store.ts` (referrals.json + referral-config.json = recompensa/meta). `store.listClicks()`
  novo (cliques com timestamp). Rotas `/api/referrals` (GET ranking, POST, DELETE) + `/api/referrals/config`.
- Mecânica: lojista define a RECOMPENSA + meta (ex: "Brinde, 3 indicações"); gera um LINK PESSOAL
  rastreável por revendedora (nome + grupo + convite → cria link real via /api/links → /r/<slug>
  redireciona pro grupo e conta clique). A revendedora compartilha o link DELA com amigas de FORA.
- ATRIBUIÇÃO honesta: cliques = exatos (por link); entradas = PROVÁVEIS (correlação por janela: entrada
  no grupo até 30min após um clique no link da pessoa → atribuída a ela; sem mudar a engine, só leitura).
  Ranking por entradas→cliques, 🏆 no líder, selo "ganhou o prêmio" quem bate a meta. Botão copia o
  LINK e uma MENSAGEM pronta pra mandar pra revendedora.
- Testado e2e: config 201, link pessoal criado, 2 cliques→302, ranking cliques:2 (entradas só conta
  entrada POSTERIOR ao clique — comportamento correto).

## 2026-06-21 — PEDIDO + RECOMPRA (o produto passa a enxergar VENDA) + anti-ban
2 agentes (Growth Hacker + auditor de código) convergiram: o produto via "entrou gente" mas era CEGO
p/ venda e recompra — onde está o dinheiro do atacado→revenda. Igor escolheu construir Pedido+Recompra.
- PEDIDO REAL: `orders-store.ts` (orders.ndjson, valor+data, atômico/lock) + `/api/orders` (GET/POST/
  DELETE). Botão "Pedido" na tela Revendedoras (prompt de valor) → cria pedido E marca lead "comprou".
  Pedido vira a FONTE de verdade de faturamento (antes era só status manual cego).
- business-health.ts: `pedidos` = compradoras distintas (etapa "Compraram" do funil agora REAL),
  + `pedidosSemana`, `faturamentoSemana` (R$). RECOMPRA: detecta compradora "sumida" (sem comprar há
  +14 dias) → `recompra {sumidas, list}`. Próxima ação PRIORIZA reativar (a venda mais barata).
- HOME /hoje: hero ganhou "vendido na semana" (R$) e "pedidos na semana"; novo card "Revendedoras pra
  reativar" (lista sumidas com nº mascarado + há Nd + CTA "Enviar oferta de volta"). Testado e2e:
  registra pedido→lead comprou→faturamento no hero→card recompra→próxima ação reativar.
- ANTI-BAN (2 consertos do auditor): (1) boas-vindas saiu da LANE PRIORITÁRIA (DM a desconhecido em
  lote não pode furar o ritmo); (2) fila ganhou `getMaxPerHour` derivado do warmup (ceil(capDia/8)) —
  espalha a cota do número novo pelo dia em vez de disparar tudo em 3 min (burst = cara de bot).
- ADIADO (próximas alavancas mapeadas pelos agentes): indicação rastreada por pessoa (gente nova sem
  verba); messages.upsert p/ medir atividade real no grupo (conserta falso "grupo parado" + acende
  etapa "Interagiram"); atribuição por targetGroupId; enteredAt imutável; filtro de clique-bot.

## 2026-06-21 — KIT DE ANÚNCIO META (lotar = gente NOVA de fora) + correção de rota
Igor (com razão) rejeitou o "cross-post nos próprios grupos": só recircula quem ele já tem, zero gente nova.
Única fonte real de gente nova via software = TRÁFEGO (anúncio Meta). Reformulei "lotar" p/ ser isto.
- BUG do kit antigo (/acquisition): mostrava vmd.link/... mas NUNCA criava o link, e NÃO pedia o
  convite do grupo (destino). Logo o anúncio não tinha pra onde mandar a pessoa — não funcionava.
- AGORA /acquisition = Kit de Anúncio Meta REAL: pede o link de convite do grupo → cria link
  RASTREÁVEL de verdade (POST /api/links, destino=convite) → `/r/<slug>` redireciona pro grupo e
  CONTA o clique. AdCampaign += inviteUrl. GET /api/ad-campaigns devolve métricas REAIS (cliques do
  link + entradas no grupo via leads; cpl = spend/entradas). Kit completo: copy (3 ângulos) com botão
  COPIAR por campo, público-alvo concreto p/ colar no Meta, prompt de imagem do criativo, estimativa
  (cliques/entradas por R$/dia), passo-a-passo. Testado e2e: cria→link 201→/r/ 302 p/ o convite→
  cliques/entradas reais→invite inválido 400.
- /crescer: objetivo "Lotar" virou LINK pro kit (/acquisition); REMOVIDO o fluxo de cross-post do
  wizard (estado/passos/execução de "lotar"). Wizard ficou só Vender/Reativar (disparo p/ grupos atuais).
  Botão "LOTAR MEU GRUPO" do hero → /acquisition.
- Honestidade: software arma o canal (link rastreável + copy + público + criativo + medição); o
  RESULTADO depende da verba de anúncio do Igor. Não promete mágica.

## 2026-06-21 — PILOTO AUTOMÁTICO "LOTAR MEU GRUPO" (feature-vitrine V3)
Tela `/crescer` (nav "Crescer" + botão "LOTAR MEU GRUPO" no hero do /hoje). Wizard guiado, 1 decisão
por tela, que ORQUESTRA peças REAIS (não fachada) — usa os endpoints que já existem:
- 3 objetivos: 🚀 Lotar grupo (atrair) · 🛍 Vender estoque · 🔥 Reativar grupo.
- LOTAR: escolhe grupo → cola link de convite (vira link RASTREÁVEL via /api/links) → mensagem
  (template ou escrita, link anexado) → divulgar (postar nos OUTROS grupos via motor de disparo, agora
  ou agendado / OU só gerar p/ postar manual) → revisar → executa. Tela de sucesso mostra o link p/ copiar.
- VENDER/REATIVAR: mensagem → grupos-alvo (multi/único) → quando (agora/agendar) → executa via
  /api/broadcasts + /api/dispatch (ou /api/schedules). Acompanhar → /hoje.
- Componente único `crescer/page.tsx` (client), premium (stepper, cards de opção, prévia WhatsApp, glow).
  Testado e2e: login, /crescer 200, criação de link rastreável 201, /r/<slug> 302 + clique contado.
  (O "Modo Automático/Manual" do V3 = este wizard é o automático; manual segue nas telas Ofertas/Links.)

## 2026-06-21 — DESIGN: Light Premium (Igor: "muito simples e cru")
Direção escolhida por ele (AskUserQuestion c/ previews): LIGHT PREMIUM elevado (acento violeta
#7C5CFF + profundidade + gradientes), NÃO dark full. Foco em fundação que propaga + telas-vitrine.
- globals.css: paleta de marca VIOLETA (brand-50..800), sombras em camadas (--shadow-card/-hover/-brand),
  fundo com radial-gradients sutis (violeta + verde), font-smoothing, scrollbar fina, ::selection violeta,
  util .dz-rise (entrada). Verde mantido só p/ SUCESSO/crescimento (semântico); violeta = marca/CTA.
- Componentes (propagam p/ tudo): Card (rounded-2xl, shadow-card em camadas, hover, backdrop-blur),
  Button (primary = gradiente violeta + shadow-brand + hover lift, rounded-xl), Badge (tons com ring +
  tom 'brand'), Input/Textarea (foco violeta com ring-4).
- Navegação: Sidebar (logo gradiente, "VIP Growth OS", ativo violeta com barra-indicadora, blur),
  Topbar (sticky + blur + avatar gradiente), MobileNav (logo/ativo violeta).
- Login: fundo escuro #0c0a1a com glows violeta+esmeralda, logo gradiente, cartão branco elevado (shadow-2xl).
- HOME /hoje: HERO virou card GRADIENTE ESCURO premium (violeta→indigo) com glows, stats em "vidro"
  (white/5 + blur), meta com barra gradiente violeta→esmeralda, .dz-rise. Padrão dashboard top (Linear/Vercel).
- 2º PASSE (uniformização): migrei os verdes "de marca" p/ violeta em todas as telas internas — abas de
  filtro (leads), checkboxes de seleção (campaigns/groups), ícones decorativos (leads/campaigns/acquisition/
  dashboard/links), focos de inputs/selects (templates/schedules/acquisition/leads), chips (templates/
  campaigns/acquisition) e o painel de onboarding. Verde mantido SÓ em sucesso semântico (conectado no
  topbar, "comprou"/"enviada" badges, concluído nos checklists, saudável no HealthCard, boas-vindas ON).
  Identidade agora uniforme: violeta = marca/ação, verde = sucesso. Build OK.

## 2026-06-21 — HARDENING P/ VENDA (lote grande)
Atacados os bloqueadores da auditoria. Tudo testado end-to-end (script curl) e build OK.
- AUTENTICAÇÃO REAL (era o #1: login era Link puro, /api aberto). `lib/auth.ts` (cookie de sessão
  assinado HMAC, Edge-safe), `middleware.ts` protege páginas (redirect /login) e /api (401), libera
  /login, /api/auth, link público /r/ e estáticos. Login real (senha → /api/auth/login → cookie),
  logout real na sidebar. A ENGINE autentica por header `x-engine-token` (rotas session/groups/leads/
  welcome/optout/dispatch). `.env.local` (APP_PASSWORD/ENGINE_TOKEN/AUTH_SECRET) + `.env.example`.
  Testado: sem cookie→401, página→redirect, token certo→200, token errado→401, senha errada→401.
- INTEGRIDADE: `lib/atomic-fs.ts` — escrita ATÔMICA (tmp+rename) + LOCK serial por arquivo. Todos os
  stores migrados (json-collection, leads, groups, session, welcome, optout, store/links). Mata corrupção
  e race entre engine (polling) e navegador (read-modify-write se cruzando). json-collection ganhou
  `transact` (read-modify-write atômico).
- DISPARO ROBUSTO: `claimPending` agora é TRANSAÇÃO ATÔMICA (sob lock) — sem disparo duplicado; e
  RECUPERA job preso em "running" sem ack há >15min (engine caiu) marcando "failed" (não re-enfileira
  sozinho p/ não arriscar duplo envio). Campaign += runningSince/lastAckAt. Ack carimba lastAckAt.
- LEADS (qualidade + LGPD): DEDUPE por telefone (upsert; re-entrada acumula grupo em `alsoIn`, não
  infla funil/meta). Telefone vazio (LID não resolvido) sempre entra. STATUS editável: PATCH /api/leads
  + <select> na tabela (destrava a etapa "Comprou" do funil/score, antes inalcançável). DELETE /api/leads
  (LGPD, direito de eliminação) + botão lixeira. Opt-out FILTRA captura (número opted-out não vira lead).
  Opt-out ganhou remoção (DELETE /api/optout + botão X no settings). Copy do opt-out corrigida (não promete
  excluir alguém de mensagem de GRUPO — impossível tecnicamente). Testado: dedupe=1, opt-out=0, PATCH, DELETE.
- DEFERIDO consciente (documentado em NEXT.md): MULTI-TENANT real (tenantId + DB) — segue 1-deploy-por-cliente
  por ora; migração p/ SQLite/Postgres é a próxima grande alavanca e resolve multi-tenant de vez.
  Aviso: middleware.ts gera warning de deprecação do Next (sugere "proxy") — funciona, renomear depois.

- FIX RAIZ (número errado no painel): a engine gravava o LID do WhatsApp (xxx@lid, identificador de
  privacidade do Baileys 7) como se fosse telefone → números falsos tipo "+176755117654019". Agora
  `resolvePhone(sock, jid)` mapeia LID→telefone real via `sock.signalRepository.lidMapping.getPNForLID()`;
  se o número ainda não é conhecido, grava VAZIO (entra como "Número oculto" no painel, conta a entrada
  mas não inventa número). `welcomeNewMember` e o handler de entrada/saída agora usam o telefone resolvido.
  App: /api/leads aceita phone vazio (exige só sourceGroup); leads/page mostra "Número oculto" quando vazio.
  ATENÇÃO: leads antigos em data/leads.ndjson têm LID falso e NÃO são recuperáveis offline (precisa do mapa
  da sessão viva) — recomendado limpar p/ começar correto. Exige RESTART da engine (código novo) + app.
- FIX (privacidade/LGPD): número de WhatsApp do lead aparecia CRU no painel de revendedoras.
  Novo `maskPhone()` em lib/utils.ts (mostra país+DDD e só os 2 últimos: "+55 11 •••••-••21").
  Aplicado na tabela de leads; número completo segue armazenado p/ o disparo. Opt-out deixado visível
  (lista que o próprio lojista digita p/ gerenciar).
- FIX (engine): monitorava entradas de QUALQUER grupo (inclusive onde o número não é admin), por causa
  do fallback "nenhum admin detectado → sincroniza TODOS". Agora: `adminGroupIds` Set é a única fonte do
  que monitoramos; detecção de admin multi-sinal (dono do grupo via owner/ownerPn + flags admin/isAdmin/
  isSuperAdmin do Baileys 7, casando com id E lid); o handler group-participants.update faz early-return
  se o grupo não é admin; disparo "todos os grupos" agora usa adminGroupIds (não groupNames, que inclui
  não-admin p/ log). SEM fallback p/ "todos" no monitoramento — melhor não capturar do que capturar errado.
- AUDITORIA (subagente) p/ lançamento pago — achados ALTOS pendentes (ver NEXT.md): (1) sem auth/middleware
  (login é Link puro), (2) single-tenant estrutural (sem tenantId; data/ global), (3) race nas escritas JSON
  (read-modify-write sem lock atômico), (4) claimPending não-atômico → risco de disparo duplo, (5) job preso
  em "running" se a engine cai. MÉDIOS: estado anti-ban/warmup em memória (reseta no restart), leads sem
  dedupe (infla funil), status do lead nunca muda (etapa "comprou" inalcançável pela UI), opt-out não filtra
  disparo de oferta nem captura de lead (copy promete o que não faz). Recomendação: migrar persistência p/
  SQLite/Postgres com tenantId resolve 2+3+4 e parte do 5 de uma vez — maior alavancagem antes do 1º cliente.
- EXECUÇÃO DE AGENDAMENTOS no horário (fecha o ciclo do disparo). Agendamento agora aponta para uma
  OFERTA real (`Schedule.campaignId`, escolhida num select na página — não mais texto livre). Sem timer
  novo: a rota `/api/dispatch/pending` (que a engine puxa a cada 10s) primeiro roda `processDueSchedules()`
  — promove agendamentos vencidos (scheduledAt<=agora, pending) para a fila `queued`, depois claima. Única
  vira `done`; recorrente (daily/weekly) reprograma sozinha p/ a próxima ocorrência futura (cobre execuções
  perdidas) e segue `pending`; `lastRunAt` registrado; sem oferta vinculada → `failed`. `lib/schedules-store.ts`.
  Testado end-to-end: vencido→done+oferta running; diária→reprograma p/ data futura. Build OK.
  CICLO DE DISPARO COMPLETO: criar oferta → enviar agora OU agendar (única/recorrente) → engine dispara
  pela fila anti-ban no horário, com progresso real. Base pronta p/ Modo/Piloto Automático do V3 orquestrarem.
- MOTOR DE DISPARO REAL (broadcast de ofertas app→engine). Antes a engine só disparava boas-vindas
  1-a-1; o `broadcast()` existia mas estava comentado. Agora: o lojista clica "Enviar agora" numa
  oferta → app enfileira (status `queued`) → a engine PUXA a fila (mesmo padrão de polling do
  welcome/optout, loop dedicado de 10s) → dispara 1 msg/grupo pela fila anti-ban → reporta progresso
  REAL de volta (cada `enqueue` resolve no envio de fato). Peças:
  - App: `lib/dispatch-store.ts` (enqueue/claim/ack), rotas `/api/dispatch` (enqueue), `/api/dispatch/
    pending` (claim atômico queued→running, evita disparo duplo), `/api/dispatch/ack` (progresso/result).
    `json-collection` ganhou `update`/`updateWhere`. `CampaignStatus` += `queued`. Página de ofertas:
    botão "Enviar agora"/"Enviar de novo", barra de progresso sent/total ao vivo (auto-refresh 4s),
    erro do disparo no card. broadcast nasce com total = nº de grupos.
  - Engine: `pollDispatches`/`runDispatch`/`ackDispatch`; groupIds do app = JIDs (sync usa o id do grupo);
    groupIds vazio = todos os grupos conhecidos. `listGroups` roda ANTES de aceitar disparos.
  - Testado end-to-end (sem WhatsApp): create→queued→claim→2º claim vazio→ack parcial→ack final=sent.
  DESTRAVA: base p/ Modo Automático e Piloto Automático "LOTAR MEU GRUPO" do V3 (orquestram este motor).
  FALTA p/ fechar o ciclo: execução dos AGENDAMENTOS (worker que enfileira no horário) usando este motor.

## 2026-06-20
- V3 — FUNIL VISUAL como peça central da HOME. Novo componente `funnel-visual.tsx`: funil vertical
  que afunila (largura proporcional ao valor real vs topo), cor+ícone por etapa, % de passagem entre
  etapas medidas, indicador de perda ("−N no caminho"), variação semana-a-semana na etapa Entraram
  (única com histórico), toggle Simples/Detalhado, e INSIGHT AUTOMÁTICO que aponta o maior gargalo
  (só entre etapas que medimos: Viram anúncio→Entraram→Compraram) + CTA contextual. Etapas sem dado
  (Interagiram/Voltaram/Cliente fiel) aparecem como camadas 🔒 "em breve" — mantêm a FORMA do funil
  sem inventar número. lib `business-health.ts` ganhou cor/ícone/short por etapa + `getResultsOverview`
  agora calcula `funnelInsight` (gargalo). HOME /hoje reordenada p/ a ordem do V3: hero → funil →
  próxima ação + saúde do negócio → saúde do número + rotina. Build OK.
  ADIADO do V3 (decisão consciente): reskin dark premium + bottom-bar (🏠 Hoje/👥 Grupos/🚀 Crescer/
  ⚙️ Perfil) é reestruturação grande de navegação — fazer em sprint próprio. Modo/Piloto Automático e
  etapas não-medidas continuam presos ao motor de disparo + medição de atividade no grupo.
- V2 SPRINT 1 — Reposicionamento + Central de Resultados (visão "produto = assistente de resultado",
  usuário leigo). Terminologia: matou jargão na nav + títulos (Leads→Revendedoras, Broadcast→Ofertas,
  Aquisição→Atrair revendedoras, Links→Origem das entradas, Relatórios→Resultados, Dashboard→Visão geral).
  Nova HOME /hoje = Central de Resultados: card principal ("seu negócio está crescendo?" + revendedoras hoje
  + pedidos + meta semanal), FUNIL visual honesto (Tráfego→Entraram→Pedido reais; Interação/Recompra/Cliente
  ativa marcados "em breve" — não temos o dado), card PRÓXIMA AÇÃO (uma só, mata paralisia), SAÚDE DO NEGÓCIO
  (score 0-100 de crescimento+atividade+conexão), HealthCard re-rotulado p/ "Saúde do número" (Envios hoje/Fila/
  Última conexão). lib `business-health.ts` (getResultsOverview) centraliza o cálculo, só com dado real.
  ADIADO (precisa do motor de disparo real): Modo Automático (3) e Piloto Automático "LOTAR MEU GRUPO" (10).
  ADIADO (precisa medir atividade no grupo + modelar pedidos): interação/recompra/cliente ativa, pedidos auto.
- Incidente: disco C: chegou a 0 byte livre e travou escrita/build. Limpei cache npm + `.next` (regeneráveis);
  voltou a 25 GB após o build. Suspeitos de espaço: `.next` (~800MB), node_modules, repo intruso starter (275MB).
- SPRINT 3 (resto das sugestões aprovadas): Modo Operador "/hoje" (D3) — cockpit do operador de
  30min/dia: saudação + entradas de hoje, "Precisa de você" (leads novos/grupos parados/grupos
  quase cheios) e HealthCard. Checklist diário (D4) persistido por DATA no localStorage
  (daily-checklist.tsx). Ranking de grupos por entradas (B1) no dashboard. Banner global de
  desconexão (C3, connection-banner.tsx no layout — só alerta queda real, dispensável e rearma).
  Labels de atribuição marcadas como "estimada/Caminho A" (C4) em /reports.
  Nav ganhou item "Hoje" (1º). ADIADOS (corretamente): B6/D2 completo (precisa atividade no grupo),
  A3 (fundir aquisição+broadcast), C5 (multi-sessão cedo), D1 (é copy).
- SPRINT 2 — Boas-vindas automáticas (disparo REAL engatilhado pela entrada).
  App: welcome-store + /api/welcome (GET/POST) + card no Settings (toggle + textarea {nome}).
  Engine: na entrada do grupo, manda DM de boas-vindas SE habilitado, fora do opt-out, dedupe por número,
  só p/ JID de telefone (@s.whatsapp.net), via fila anti-ban (lane prioritária). Config+optout cacheados,
  atualizados no heartbeat (30s). É o "produto rodando sozinho" — com freios de ban.
- SPRINT 1 — "matar a ansiedade" (fiação de dado que já existe):
  1.1 Enabler: engine manda stats no heartbeat (fila/entrega/warm-up + connectedSince).
      session-store ganhou EngineStats + connectedSince; /api/session POST grava. HealthCard
      (número saudável/conectado há X/densidade — A4+C3+C2). Topbar mostra "há Xd".
  1.2 Dashboard reorientado: "Entraram hoje" (A1), "Entradas na semana / meta 50" (B3),
      "Compraram" separado de entrada (C1), HealthCard no lugar do card vazio.
  1.3 OnboardingChecklist (A2): lê session/grupos/links/ad-campaigns/leads; some quando completo.
  1.4 Grupos parados (B5): "frio há X dias" por grupo (casado pelo nome do lead). Biblioteca de
      campanhas (B4): 5 modelos prontos curados (sem IA) com botão "Carregar modelos prontos".
- UX round 1: navegação mobile (drawer hambúrguer — antes não dava p/ navegar no celular),
  sistema de Toast (feedback em salvar/excluir/copiar), confirmação antes de excluir,
  foco visível (a11y) global no Button. Provider de toast no layout (app).
- DE-FAKE pass 2: persistência real (json-collection + crud-route) para templates, broadcasts,
  schedules, ad-campaigns (+ /api/* GET/POST/DELETE). Páginas wired (criar/listar/excluir).
  mock-data.ts reduzido a SÓ tipos (zero dado fake no código). groups/leads sem fallback mock (empty states).
- DE-FAKE pass 3 (botões): templates copiar/excluir, campaigns duplicar/excluir/salvar, acquisition salvar/copiar/excluir,
  schedules criar/cancelar, groups sincronizar+"criar campanha"→/campaigns, leads "mensagem em massa"→/campaigns. Removidos botões mortos.
- DE-FAKE pass 1: status de conexão REAL (session-store + /api/session + engine heartbeat 30s + Topbar real → mata número fake em toda página). Dashboard, Relatórios e Settings reais (agregam grupos/leads/cliques). Opt-out real (optout-store + /api/optout). Empty states no lugar de mock.
- engine+app: sync de grupos REAIS (só onde o número é admin; fallback p/ todos se LID atrapalhar).
  POST /api/groups + groups-store + /groups lê real. Validado no número real. UX: /groups busca 1x no load (precisa F5).
- engine: fix parsing de participante (Baileys 7 LID) + try/catch no handler + auto-limpeza de auth em logout.
- VALIDADO no número real: conecta + lista grupos admin + detecta entrada → lead no painel.
- app: ponte engine→app real (POST /api/leads + leads-store + /leads lê real). E2E testado.
- app: analytics de link (/api/links/[slug] + /links/[slug], cliques por dia/origem). E2E testado.
- engine: reportLead() POSTa entrada do grupo p/ o app.
- tsconfig: exclui `nextjs-claude-code-starter/` (boilerplate intruso quebrava o type-check).
- system/: bootstrap da memória do projeto (OS V2).
- engine: módulos anti-ban seguros (warmup, group-guard, delivery-tracker, jitter gaussiano). 9/9 testes.
- engine: PoC Baileys (QR + sessão + grupos + detecção de entrada) + fila anti-ban base.
- app: link tracker real (/r/:slug, /api/links, store de arquivo) + tela /links ligada a dados reais.

## 2026-06-19
- app: scaffold Next.js + telas mock; pivô de broadcast → máquina de aquisição (Meta + link rastreado).
