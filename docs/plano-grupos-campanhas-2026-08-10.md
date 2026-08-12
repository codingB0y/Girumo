# Análise: /grupos + Área de Campanhas — plano de decisão pontuado

> **Documento pronto pra colar num chat novo (Opus 5).** Gerado em 2026-08-10 a partir de
> varredura real do código (2 agentes de exploração + diffs contra `origin/main`), grafo de
> conhecimento e memórias do projeto. Evidência ancorada em `origin/main` — a branch
> `feat/lp-girumo-v2` está **98 commits atrás** e NÃO reflete o estado real.

---

## §0. INSTRUÇÕES PRO OPUS 5 (leia antes de qualquer coisa)

Você vai conduzir o Igor por decisões de produto/engenharia sobre a aba `/painel/grupos` e a
área de Campanhas do Girumo (ex-HubFlow). Este documento já contém o diagnóstico completo —
**não re-explore o repo inteiro**; verifique pontualmente só o que estiver marcado com ⚠️.

**Como conduzir (formato obrigatório):**
1. Apresente um caminho de decisão por vez (§4: D1→D6), na ordem de pontuação.
2. Em cada caminho, **lidere com a recomendação** ("Recomendo a opção X — nota N/25 — porque…")
   e só depois mostre as alternativas com as notas delas. Use AskUserQuestion quando disponível.
3. Registrada a escolha do Igor, siga pro próximo caminho. No fim, monte o plano de execução
   em PRs (§5) ajustado às escolhas.
4. Não re-litigue decisão tomada. Se o Igor escolher contra a recomendação, aceite e planeje.

**Regras invioláveis do projeto (não são opinião — são decisões registradas):**
- **Anti-ban:** mensagem/automação de lojista **só posta em grupo, NUNCA DM**. O banco já
  garante (`automation_runs.target_group_jid CHECK '%@g.us'`). Não criar caminho novo de DM.
- **Só grupos admin** entram em sync/disparo/captura. `enqueue_broadcast` filtra `is_admin`
  até em lista explícita — é deliberado, não "corrigir".
- **`.eq('tenant_id')` É a proteção.** 68 arquivos usam service-role (bypassa RLS). Toda query
  em tabela com `tenant_id` leva o filtro explícito. RLS é segunda linha.
- **Dois bancos:** dev `wfjuwogxaupyadwhvoxy` · prod `nidoatbxaylrkcgbszns`. Migração vai nos
  DOIS, na ordem de `deploy/supabase/apply-order.txt`. Conferir por SQL se o objeto já existe
  antes de criar migração.
- **Dual-mode engana:** rotas caem em fallback JSON sem erro. Validar sempre contra Supabase
  real (`HUBFLOW_USE_SUPABASE` default = ligado).
- **Cutover gradual por `broadcasts.run_id`:** oferta com `run_id` é do motor novo; engine
  legada só claima `run_id IS NULL`. **Não remover esse filtro** antes de desligar o Baileys.
- **Worker nasce em DRY-RUN:** envio real só com `WORKER_SEND_ENABLED=true` no Coolify, depois
  de ler logs "DRY-RUN: enviaria…" e conferir todo destino `@g.us`.
- **Verdade do produto:** promessa na UI/copy tem que existir de verdade (histórico: ratings
  fake removidos; "IA que agenda" nunca prometer). Isso pesa nas notas abaixo.
- **PRs:** base sempre `main` (nunca branch sobre branch — e `feat/lp-girumo-v2` está 98
  atrás). Um PR = uma coisa, ~10 arquivos. Fechar o loop na mesma sessão. Ao encerrar,
  reportar "PRs que deixei abertos: …".
- **SEMPRE varrer `apps/worker`** ao analisar execução — 3 reviewers já erraram "executor não
  existe" por ignorá-lo.

**⚠️ Verificações de 5 minutos antes de executar qualquer coisa** (estado vivo pode divergir):
1. `curl -I https://<dominio>/r/<slug-de-campanha-real>` — confirma se o link mestre resolve
   em prod (diagnóstico prevê 404/queda no JSON; ver D2).
2. SQL em prod: `select status, count(*) from campaign_messages group by 1` — confirma
   mensagens órfãs em `scheduled`/`queued` (ver D1).
3. Conferir `HUBFLOW_USE_SUPABASE` e envs Evolution do worker no Coolify/Vercel.

---

## §1. O QUE EXISTE HOJE (evidência, `origin/main`)

### 1.1 Aba `/painel/grupos` — vitrine bem-acabada, quase sem ação

`apps/web/src/app/painel/grupos/page.tsx`:
- Lista com filtros (Todos/Ativos/Cheios/Sem convite), busca, 4 mini-stats, barra de
  capacidade, "Saúde" por engajamento, copiar link de convite.
- Em `main` ganhou o botão **"Sincronizar grupos"** → `POST /api/groups/sync` (novo endpoint
  que chama a **Evolution API** `fetchAllGroups`, detecta `is_admin`, grava só o que o
  WhatsApp é dono e **preserva** campos do painel — `syncGroupsFromProvider` em
  `apps/web/src/lib/stores/groups.ts`).
- **Única ação além do sync: copiar convite.** Nenhum controle de convite, capacidade,
  seleção, participante, renomeio.

### 1.2 Backend de grupos pronto e SEM UI (fio desligado)

| Capacidade | Onde existe | Estado |
|---|---|---|
| `PATCH /api/groups` (define `invite_url`, `capacity`, `display_name_base`, `display_number`) | `api/groups/route.ts:74` | **Zero chamadores** no repo — grep confirma |
| Nome interno "Grupo VIP {n}" | `lib/group-display-name.ts` (testado) | Só o teste importa |
| Alertas "grupo sem convite" (cron 9h) | `api/notifications/alerts/route.ts` | Aponta pra `/painel/grupos`… que não tem onde configurar (beco sem saída) |
| Leads por grupo (`sourceGroupId`, `alsoIn[]`) | `lib/leads-store.ts` + `apps/worker/src/lead-capture.ts` (vivo em prod, 6 leads) | Nenhuma tela mostra participantes/leads por grupo |
| `groups.engagement` | coluna + coluna "Saúde" na UI | **Nunca calculado** — hardcoded `medio`; UI sempre mostra "Média" |
| `groups.selected` | coluna | Morta — sempre `false`, nada usa |

### 1.3 Dois caminhos de sync com semânticas CONFLITANTES (ambos vivos)

- **Novo (Evolution):** `POST /api/groups/sync` → preserva `selected/capacity/engagement/invite_url`.
- **Legado (engine Baileys):** `POST /api/groups` (`route.ts:60-68`) → **reseta** `selected:false`
  e `engagement:"medio"` a cada sync, contrariando o contrato de `apps/web/system/API_CONTRACTS.md:43`.

### 1.4 Área de Campanhas — casca polida, execução fraturada

Páginas: lista (`campanhas/page.tsx`), wizard create/edit (`campaign-config.tsx` — em `main`
com passo "Objetivo"/presets + mensagem sugerida + deep-link `?preset=&groups=`), detalhe com
4 abas (Grupos/Mensagens/Visão geral/Resultados) — em `main` com tiles **Vendas/Pedidos**
reais (`orders.campaign_id` existe, `lib/campaign-attribution.ts` existe). `PlanGate` real.
Evento de ativação `first_campaign_created` instrumentado (`funnel_events`).

**Três motores de envio coexistem:**

| Motor | Caminho | Estado |
|---|---|---|
| **(a) Legado Baileys** | engine `index.js` poll 10s → `/api/dispatch/pending` → claima `broadcasts` (`run_id IS NULL`) → anti-ban **em RAM** (`anti-ban-queue.js`) | Vivo; é quem dispara hoje |
| **(b) Novo (worker+Evolution)** | RPC `enqueue_broadcast` (fanout → `engine_commands`) → `apps/worker/src/send-loop.ts` → Evolution API; anti-ban **no banco** (`claim_send_commands`: 8/min, 120/h, warmup até 800/dia); `housekeeping.ts` roda `promote_due_schedules` + `reconcile_broadcast_progress` | Pronto e vivo em prod, **em DRY-RUN** (falta `WORKER_SEND_ENABLED=true` + envs Evolution) |
| **(c) Beco sem saída** | Aba **Mensagens** da campanha → `campaign_messages` | **Nenhum executor lê essa tabela** (ver §2.1) |

---

## §2. OS 5 BURACOS CRÍTICOS (o que está quebrado de verdade)

### 2.1 🔴 A ÚNICA UI de envio do lojista não envia nada
A aba Mensagens ("Enviar agora" / "Agendar" / "Agenda", composer completo com mídia, enquete,
@todos, recorrência) grava em `campaign_messages` com `status='scheduled'|'queued'`
(`api/campanhas/[slug]/messages/route.ts:111-129`). **Nada consome**: `promote_due_schedules`
(SQL) só promove `schedules.broadcast_id`; o worker drena `engine_commands`; a engine legada
claima `broadcasts`. Grep global: zero leitores de `campaign_messages` fora das próprias rotas.
A ponte msg→broadcast existia **só no ramo JSON legado** (`lib/messages-store.ts:76-101`) e
nunca foi portada. **Sintoma:** mensagem eternamente "Agendado" na Agenda. Enquanto isso, o
caminho que FUNCIONA (`/api/broadcasts` + `/api/schedules` + `/api/dispatch`) **não tem UI**
(`/painel/disparos` e `/painel/agenda` são `redirect("/painel/campanhas")`).

### 2.2 🔴 O link mestre `/r/<slug>` roda 100% em JSON legado
`app/r/[slug]/route.ts` importa `lib/store.ts` (links.json/clicks.ndjson),
`lib/campanhas-store.ts` (campanhas.json) e `lib/groups-store.ts` (groups.json) — **nenhum
tem ramo Supabase** (grep `USE_SUPABASE` nesses stores: vazio). Com Supabase ligado, a
campanha criada no painel não existe no JSON → o link exibido com destaque em 4 lugares da
UI tende a **404 "Link não encontrado"** (⚠️ verificação viva #1). A rotação "grupo lotou →
manda pro próximo" (`nextAvailableGroup`) e a gravação de clique moram nesse caminho morto.

### 2.3 🔴 Auto-grow (a promessa central do produto) está inerte em 3 camadas
O toggle "Automatizar criação de grupos?" (default **ligado**, copy: "a Girumo cria um grupo
novo quando o atual lota") não faz nada:
1. `lib/group-grow-store.ts` é **JSON-only** — com Supabase ligado, itera lista vazia;
2. `evaluateAutoGrow` exige `growTemplate.subjectPattern` e **nenhuma UI escreve
   `growTemplate`** (wizard envia só `{name, groupIds, autoGrow}`) → `continue` sempre;
3. O executor completo e testado (`hubflow-engine/index.js:496-557`: cria grupo, descrição,
   announcement, foto, `groupInviteCode`, com `group-guard` 2/10min) **só existe na engine
   legada Baileys** — e nunca recebe job.
É exatamente a feature confirmada como real na memória de produto ("grupo lotou → próximo
criado automaticamente") e o coração do método VIP da história fundadora (Mega Stock,
5k→350k/mês). **Hoje é promessa sem lastro na UI** — viola a regra da verdade do produto.

### 2.4 🟠 Métricas exibidas que não medem nada
- **Cliques = 0 sempre:** a lista soma `tracked_links.clicks` casando **string**
  `link.campaignName === campanha.name`; criar campanha nunca cria tracked_link;
  `tracked_links.clicks` **nunca é incrementado** (o `/r/` grava em ndjson JSON).
- **"Conversão clique→membro" é aritmética falsa:** `totalMembers / clicks` — membros totais
  do grupo (qualquer origem) sobre cliques (0).
- **"Saúde" sempre "Média"** (§1.2).
Histórico do projeto: dados fabricados no painel já foram removidos uma vez (03/ago). Isso
é a mesma classe de problema.

### 2.5 🟡 Higiene com risco real
- `resolveTenantId()` duplicado em 5 rotas (`campanhas/[slug]/messages`, `broadcasts`,
  `schedules`, `dispatch`, `links`) pega **sempre a primeira membership** — ignora
  `x-tenant-id`; usuário multi-tenant fica preso no tenant mais antigo.
- TDZ `ReferenceError` no ramo JSON de `PATCH`/`DELETE /api/campanhas`
  (`route.ts:116` usa `tenantId` declarado em `:141`; idem `:173`/`:179`).
- `GROUP_FULL_RATIO` triplicado (0.95, 0.95, 0.9 em `alerts`).
- Timezone: `schedule-composer.tsx` monta `new Date("YYYY-MM-DDTHH:mm")` no fuso do browser.
- Sync legado resetando campos do painel (§1.3).
- Libs mortas: `campaign-create-wizard.ts`, `campaign-next-step.ts`, `primaryAction`
  calculado e nunca lido.

---

## §3. RÉGUA DE PONTUAÇÃO

Cada opção recebe **Nota = Impacto×2 + Reuso + Facilidade + Segurança** (máx **25**):
- **Impacto (0-5):** avança o método VIP / receita e confiança do lojista?
- **Reuso (0-5):** aproveita backend já pronto? (5 = só ligar fio)
- **Facilidade (0-5):** 5 = dias, 1 = semanas.
- **Segurança (0-5):** 5 = sem risco de ban/regressão/drift.

---

## §4. CAMINHOS DE DECISÃO (perguntar ao Igor, um por vez, nesta ordem)

### D1 — Ligar o disparo de verdade (aba Mensagens → motor real) — **o maior buraco**

| Opção | O que é | I | R | F | S | **Nota** |
|---|---|---|---|---|---|---|
| **A. Ponte no write** ✅ | Ao criar `campaign_message`: criar broadcast espelho (com `campaign_group_id` preenchido — coluna existe e está sempre NULL) e, se agendada, `schedule` com `broadcast_id`. O resto (promote → fanout → worker/engine, anti-ban, reconcile) **já existe** | 5 | 5 | 4 | 4 | **23** |
| B. Executor lê `campaign_messages` | Novo promote/fanout por mensagem no worker | 5 | 3 | 2 | 3 | 18 |
| C. UI nova sobre broadcasts | Aposenta aba Mensagens, refaz UI em cima de `/api/broadcasts`+`/api/schedules` | 4 | 3 | 2 | 4 | 17 |

**Recomendação: A (23/25).** É ~2-4 arquivos, reusa TODA a máquina nova, e resolve recorrência
e progresso (reconcile) de graça. Incluir no mesmo PR: corrigir o TDZ e o timezone (mandar
offset explícito), e parar de engolir o erro do PATCH de `autoGrow` (`.catch(() => {})`).
**Pergunta pro Igor:** fechamos o loop pela ponte no write (A)?

### D2 — Tirar o link mestre `/r/` do JSON (funil de captação)

| Opção | O que é | I | R | F | S | **Nota** |
|---|---|---|---|---|---|---|
| **A. Portar `/r/` pra Supabase** ✅ | Resolver slug em `campaign_groups`/`tracked_links`, rotação `nextAvailableGroup` sobre `groups` (Supabase), clique → incrementar `tracked_links.clicks` + evento (padrão `lp_tracking_events` já existe) | 5 | 4 | 4 | 4 | **22** |
| B. Dual-write JSON+Supabase | Band-aid: escrever nos dois | 3 | 3 | 4 | 3 | 16 |
| C. Aposentar `/r/` → Flow Pages `/p/` | `/p/` vira porta única; `/r/` vira redirect | 4 | 3 | 2 | 4 | 17 |

**Recomendação: A (22/25) agora**, com C como direção de médio prazo (Flow Pages já aponta
`resolveTargetUrl → /r/<campaign_slug>` — portado o `/r/`, os dois convivem). Links já
divulgados não podem quebrar. Isso também destrava a métrica de Cliques real (D5).
**Pergunta pro Igor:** porto o `/r/` pra Supabase mantendo o formato de URL atual?

### D3 — Auto-grow: religar a promessa central

| Opção | O que é | I | R | F | S | **Nota** |
|---|---|---|---|---|---|---|
| **B. Religar via engine legada (Baileys)** ✅ | Grow store → Supabase (fila de jobs), wizard grava `growTemplate` (o preset de Objetivo já sugere nome — "{n}" entra aí), executor Baileys **já pronto e testado** consome como hoje | 5 | 4 | 3 | 3 | **20** |
| A. Reimplementar no motor novo | Execução de criação de grupo via Evolution API no worker (⚠️ verificar endpoint de group-create da Evolution e permissões) | 5 | 2 | 2 | 4 | 18 |
| C. Honestidade imediata | Esconder o toggle até a feature existir (1 linha) | 2 | 5 | 5 | 5 | 19 |

**Recomendação: B (20/25) + C imediato enquanto B não chega em prod** (são compatíveis — C é
temporário e barato; não deixar promessa inerte no ar). A é o destino natural quando o
cutover Baileys→Evolution acontecer; construir a fila em Supabase já pensando nisso (job
agnóstico de executor). **Pergunta estratégica pro Igor (só você pode responder):** a engine
Baileys ainda é aposta viva pros próximos 1-2 meses, ou o cutover pra Evolution está próximo?
Se cutover próximo → inverte pra A.

### D4 — `/grupos`: de vitrine a balcão de operação

| Opção | O que é | I | R | F | S | **Nota** |
|---|---|---|---|---|---|---|
| **A. Ações mínimas** ✅ | Editar convite+capacidade inline (o `PATCH` já existe sem chamador!), consertar "Saúde" (ver D5), badge admin/não-admin (`is_admin` já vem do sync novo), CTA "criar campanha com estes grupos" (deep-link `?groups=` **já existe** no wizard em main) | 4 | 5 | 4 | 5 | **22** |
| B. Central completa | + participantes/leads por grupo (dados existem: `sourceGroupId`, worker `participants.ts`), nome interno "Grupo VIP {n}", ações em massa | 4 | 3 | 2 | 4 | 17 |
| C. Manter como está | — | 0 | 5 | 5 | 5 | 15 |

**Recomendação: A (22/25) agora** — é quase tudo ligar fio existente e mata o beco sem saída
dos alertas ("configure o convite" → agora tem onde). B vira fase 2 seletiva (a visão de
leads por grupo é a parte mais valiosa — conecta com o funil).
**Pergunta pro Igor:** fecho o pacote A? E na fase 2, participantes/leads por grupo te
interessa antes ou depois do auto-grow?

### D5 — Métricas que não mentem

| Opção | O que é | I | R | F | S | **Nota** |
|---|---|---|---|---|---|---|
| **A. Honestidade já** ✅ | Esconder/placeholder: Cliques e "Conversão" até D2 entregar dado real; "Saúde" vira "—" até ter cálculo (ou calcular de `engine_events`/activity) | 3 | 5 | 5 | 5 | **21** |
| B. Só quando o dado real existir | Espera D2/D4 e liga tudo de uma vez | 4 | 4 | 2 | 4 | 18 |

**Recomendação: A (21/25)** — mesma regra que já tirou rating fake e dados fabricados do
painel. Aplicar dentro dos PRs que já tocarem essas páginas (custo ~zero). B acontece
naturalmente depois. **Pergunta pro Igor:** ok esconder métrica sem lastro até o dado real?

### D6 — PR-0 de higiene (recomendação única, sem alternativas)

Pacote de ~1 dia, primeiro de todos (derisca o resto): trocar `resolveTenantId` duplicado
por `getTenantContext` nas 5 rotas · fix TDZ (`campanhas/route.ts`) · unificar
`GROUP_FULL_RATIO` em constante única · sync legado parar de resetar `selected`/`engagement`
(alinhar com `syncGroupsFromProvider`) · deletar libs mortas (`campaign-create-wizard`,
`campaign-next-step`) ou ligá-las. **Pergunta pro Igor:** aprova o PR-0 como primeiro passo?

---

## §5. SEQUÊNCIA SUGERIDA (ajustar após as respostas)

| Fase | Conteúdo | Dependências |
|---|---|---|
| **0** | D6 (higiene) + D5-A (honestidade) + D3-C (esconder toggle) | — |
| **1** | D1-A: ponte campaign_messages → broadcasts/schedules | Fase 0 |
| **2** | D2-A: `/r/` no Supabase + clicks reais | — (paralelo à 1) |
| **3** | D4-A: `/grupos` com ações mínimas | — |
| **4** | D3-B: auto-grow religado (fila Supabase + template no wizard) | Decisão estratégica de motor |
| **5** | D4-B seletivo: leads/participantes por grupo | Fases 2-4 |

Cada fase = 1 PR de escopo fechado (~10 arquivos), base `main`, migração (quando houver) nos
2 bancos via `apply-order.txt`, CI verde, merge na mesma sessão.

**Ação de deploy paralela (não é código, não esquecer):** ligar o motor novo de verdade —
conferir envs Evolution do worker no Coolify, rodar E2E em DRY-RUN, virar
`WORKER_SEND_ENABLED=true` (runbook `docs/runbooks/2026-07-29-teste-e2e-automacoes.md`).

---

## §6. FONTES

Varredura por agentes (10/ago): página/API/stores de grupos, área de campanhas completa,
engine Baileys, worker; diffs `HEAD..origin/main` confirmando o que mudou em main
(sync Evolution, presets, Vendas/Pedidos, funnel_events, fanout/worker) e o que **não**
mudou (`/r/` JSON, `group-grow-store` JSON, `campaign_messages` sem leitor, PATCH groups sem
chamador). Memórias: verdade do produto (04/jul), história fundadora Mega Stock, anti-ban
nunca-DM, sprint 5 F4+F5 aplicado nos 2 bancos (30/jul), automações executor vivo/ocioso
(10/ago), auditoria de segurança 06/ago.

---

## §7. ADENDO 11/08/2026 — sessão de decisão e estado verificado

Este documento é um retrato de 10/ago. Em 11/ago as decisões foram tomadas com o Igor e o
estado vivo foi verificado por SQL em produção e `curl`. O que mudou:

**Já entregue desde então (não decidir de novo):**
- **D1-A** — a ponte existe: `api/campanhas/[slug]/messages/route.ts` chama `createBroadcast`,
  e `lib/campaigns/dispatch-view.ts` traduz broadcasts de volta pro contrato da aba Mensagens.
  As 4 linhas em `campaign_messages` (status `queued`, 27/jul a 06/ago) são resíduo de antes.
- **D2-A** — `/r/[slug]` já tem ramo Supabase. Confirmado vivo: `GET https://www.girumo.com.br/r/test`
  responde **200** com a mensagem `empty-pool` do caminho novo (não o 404 previsto aqui).
- **D5-A** — PR #71 (merged) removeu as métricas fabricadas, inclusive a coluna "Saúde";
  PR #81 põe uma métrica real de entradas no lugar da conversão falsa.

**Decisões registradas (11/08):**
- **D4 → pacote A.** Convite e capacidade editáveis, badge admin/não-admin, CTA de campanha.
- **D5 → honestidade já.** Já satisfeita pelos PRs acima.
- **D3 → B + C imediato.** Esconder o toggle agora; auto-grow via fila Supabase + executor
  Baileys. Pergunta estratégica respondida pelo Igor: **Baileys segue de pé por 1-2 meses**.
- **D6 → PR-0 primeiro.** Entregue no PR #82.

**O gargalo real, medido em produção (11/08):**

| Sinal | Valor |
|---|---|
| `groups` | 194 · 90 admin · **0 com `invite_url`** |
| `broadcasts` / `schedules` | **0 linhas** — a máquina nunca foi exercitada |
| `engine_commands` | 3, todos `canceled` |
| `automations` | 4, todas desligadas |
| `instances` | 1 `connected`; `engine_events` com evento de hoje |
| `campaign_groups` (única campanha) | `auto_grow=true` e `grow_template` NULL |

Ou seja: o que trava o produto hoje **não é código de disparo** — é `invite_url` vazio em
194 grupos, sem UI que permita preencher (o `PATCH /api/groups` segue sem chamador). É isso
que o D4 resolve.

**Correções ao diagnóstico original:**
- §2.5 — o TDZ em `campanhas/route.ts` já foi corrigido.
- §2.5 — `subscription/route.ts` **já honrava** `x-tenant-id`; o bug de multi-tenant valia
  para `broadcasts`, `dispatch`, `links`, `media` e `schedules`.
- §1.3 — o sync legado é pior do que descrito: além de `selected`/`engagement`, ele forçava
  `capacity` de volta pra 1024 a cada rodada.
- §0 — o domínio de produção é `www.girumo.com.br` (`girumo.com` não resolve).
