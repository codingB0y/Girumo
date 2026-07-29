# IMPLEMENTATION_PLAN.md — Produto & Valor (18 itens)

> **Origem:** `ANALISE_PRODUTO_VALOR_2026-07-28.md` (diagnóstico completo).
> **Como usar:** abra o Claude Code na raiz do repo e mande: *"Implementa o item X do IMPLEMENTATION_PLAN.md seguindo a spec. Um item = um PR."*
> **Regra de execução (herda ROADMAP/CLAUDE.md):** um item por PR · commits atômicos · `npm run web:lint` + `npm run web:build` antes de fechar · nunca remover o filtro `.eq('tenant_id')` de store · não tocar no núcleo anti-ban da engine · vocabulário do nicho (banido: IA, lançamento, lead user-facing, medo-de-ban — ver PROJECT_CONTEXT §Marketing).
>
> **Modelo sugerido por item:** 🟢 = Sonnet resolve com folga (spec fechada) · 🟣 = usar Opus (decisão de arquitetura/schema ou muitos arquivos).
> Status: `[ ]` a fazer · `[x]` feito · `[~]` parcial.

## Mapa rápido pro executor (não redescobrir)

| Coisa | Onde |
|---|---|
| Dashboard | `apps/web/src/app/painel/page.tsx` |
| Resultados (funil) | `apps/web/src/app/painel/resultados/page.tsx` |
| Contatos | `apps/web/src/app/painel/contatos/page.tsx` |
| Automações (tela) | `apps/web/src/app/painel/automacoes/page.tsx` · store `src/lib/stores/automations.ts` · API `src/app/api/automations/` |
| Leads | API `src/app/api/leads/route.ts` (PATCH muda status novo/ativo/comprou) · store legado `src/lib/leads-store.ts` |
| **Pedidos (JÁ EXISTE, sem UI)** | tabela `orders` em `apps/web/supabase/migrations/20260701030000_templates_orders_referrals.sql` · store `src/lib/stores/orders.ts` (`value` em R$, `lead_id`, `group_name`) · API `src/app/api/orders/route.ts` (GET/POST/DELETE) |
| Depoimentos (migração já existe) | `20260701040000_testimonials.sql` · `src/app/api/testimonials/` |
| Funnel events (já existe) | `20260701020000_funnel_events.sql` |
| Tracking Flow Pages | `POST /api/p/track` (PageView/GroupJoin) · tabelas `lp_leads`/`lp_tracking_events` |
| E-mails | `src/lib/email/*` + cron `src/app/api/cron/emails` (Resend; hoje: welcome, nudge 24h, trial-ending) |
| Engine | `hubflow-engine/index.js` (`/health` em ~linha 9; NÃO mexer no anti-ban) |
| Landing/planos | `src/app/page.tsx` + `src/components/landing/v2/*` e `lp2/*` |
| Migração nova | criar em `apps/web/supabase/migrations/` (padrão RLS: ver flow_pages) — aplicar em dev `wfju…` E prod `nido…` (cuidado com drift) |

---

# P0 — Semanas 1–2

## [~] P0.1 ~~Corrigir marca "Girumo" no onboarding~~ — OBSOLETO (28/jul)
**Motivo:** este item foi escrito sem conhecimento do rebrand HubFlow→Girumo (PR #20, merge `6ddc1738`, 17/jul), que já está no histórico deste branch. `apps/web/src/lib/brand.ts` declara `name: "Girumo"` como fonte única da marca, e existe um gate de CI (`npm run brand:check` / `check-girumo-brand.mjs`) que **bloqueia** "hubflow" user-facing. Executar este item ao pé da letra reverteria o rebrand e quebraria o gate. `grep -ri girumo apps/web/src` retorna 60 arquivos — é o rebrand inteiro, não um typo isolado.
**Ação:** nenhuma. Se "Girumo" aparecer por engano em algum lugar específico pós-rebrand, tratar como bug pontual (não como grep→replace em massa) — ver [[girumo-rebrand-shipped]] na memória pra allowlist do que fica `hubflow` de propósito.

## [ ] P0.2 🟢 Registrar venda em 1 clique (UI sobre a infra de `orders` que já existe)
**Contexto:** backend pronto (`/api/orders` POST `{value, phone?, leadId?, group?}`). Falta UI. O status "comprou" do lead e o pedido são coisas ligadas: registrar pedido deve também marcar o lead.
**Arquivos:** `painel/contatos/page.tsx` (principal) · `src/app/api/orders/route.ts` (pequeno ajuste).
**Fazer:**
1. Em Contatos, adicionar botão "Registrar pedido" por linha (ao lado de "Conversar"). Abre modal mínimo: valor em R$ (input `inputmode="decimal"`, aceita vírgula) + botão salvar. Grupo e telefone vão preenchidos do lead (`sourceGroup`, `phone`).
2. No submit: `POST /api/orders` com `{value, leadId, phone, group}` e, se ok, `PATCH /api/leads {id, status:"comprou"}` (otimista na UI).
3. No `POST /api/orders`: quando vier `leadId`, chamar `updateLeadStatus(tenantId, leadId, "comprou")` server-side também (fonte da verdade no server; tolerar lead não-encontrado sem falhar o pedido). Import de `@/lib/leads-store` + `getRouteTenantContext` seguindo o padrão de `api/leads/route.ts`.
4. Valor: armazenar em reais com 2 casas (a coluna `value` já é numérica — conferir o tipo na migração e normalizar `"149,90"` → `149.90`).
**Aceite:** registrar pedido pela UI cria linha em `orders` com tenant correto, lead vira "Cliente" no filtro, valor com vírgula funciona, lint/build ok.
**Não fazer:** detecção automática de comprovante (P2), edição de pedido.

## [ ] P0.3 🟢 Corrigir métrica de conversão clique→grupo
**Contexto:** `painel/page.tsx` e `resultados/page.tsx` calculam `conversão = totalMembers / totalClicks`. `totalMembers` é estoque (inclui quem já estava no grupo) — número mente, pode passar de 100%.
**Fazer:** conversão = **entradas atribuídas** ÷ cliques. Entradas atribuídas = leads capturados pela engine (já são "entrou no grupo") no período. Usar `leads.length` (total) sobre `totalClicks` nas duas telas; renomear label pra "Conversão clique→entrada". No funil de Resultados, o passo 2 "Entraram no grupo" passa a usar `leads.length`, não `totalMembers` (membros totais podem continuar como KPI separado "Membros nos grupos").
**Aceite:** métrica nunca >100% com dados reais; funil monotônico (passo N ≤ passo N-1); labels atualizados nas 2 telas.

## [ ] P0.4 🟢 Funil fecha em pedidos reais (R$), não em status manual
**Contexto:** Resultados conta `clientes = leads com status "comprou"`. Com P0.2, a fonte boa é `orders`.
**Arquivo:** `painel/resultados/page.tsx`.
**Fazer:**
1. Buscar `/api/orders` junto dos outros fetches.
2. Passo 3 do funil: "Viraram pedidos" = nº de orders; adicionar tile "Vendas registradas: R$ X" (soma de `value`, formato pt-BR).
3. Nova seção "De onde veio cada venda": agrupar orders por `group_name` (fallback "sem grupo") com soma em R$ — é a promessa da landing ("mostra de qual grupo veio cada venda") cumprida na tela.
4. Empty state honesto quando não há pedido: "Registre seus pedidos na tela Contatos pra ver o caminho completo até a venda."
**Aceite:** com 2+ pedidos de grupos diferentes, a seção mostra os grupos com R$ correto; sem pedidos, empty state; lint/build ok.

## [ ] P0.5 🟢 Meta do mês definida pelo lojista
**Contexto:** meta atual é inventada (`max(1.5×mês passado, 50)`) em `painel/page.tsx`.
**Fazer:**
1. Persistir meta por tenant: chave em config/settings do tenant se já existir mecanismo (procurar em `api/subscription`/`configuracoes` um settings store); se não existir, criar tabela `tenant_settings (tenant_id pk, monthly_goal_contacts int, monthly_goal_revenue numeric, updated_at)` com RLS padrão + store + `GET/PATCH /api/settings`.
2. UI: no card "Meta do mês", ícone de lápis → input inline (meta em contatos; se houver P0.4, opção de meta em R$ que compara com soma de orders do mês).
3. Fallback quando não definida: manter o cálculo atual, mas com label "meta sugerida" + CTA "definir minha meta".
**Aceite:** meta editada persiste entre sessões e tenants não vazam (testar com 2 tenants dev); barra de progresso usa a meta salva.

## [x] P0.6 🟢 Oferta: executar decisões de 05/jul na landing/checkout
**Contexto:** decisões registradas em `offers/hubflow-offer-critique.md` + `landing-copy-v2.md`. ⚠️ Antes de mexer: confirmar com Igor se planos/preços vigentes são R$197/297/497 (pendência anotada no PROJECT_CONTEXT).
**Arquivos:** `src/app/page.tsx`, `src/components/landing/v2/*` (pricing, faq, cta), possivelmente `api/plans`/seed de planos e Stripe (só copy/nome — NÃO mexer em price IDs sem confirmar).
**Fazer:** (1) remover "7 dias grátis"/"teste grátis" de TODA a landing e fluxo de signup → substituir por "garantia de 30 dias incondicional" (copy do landing-copy-v2.md); (2) renomear "Performance Max" → "Operação" onde aparecer (landing, painel, seeds); (3) adicionar âncora de preço junto ao pricing: "A Mega Stock fez R$350 mil/mês com esse jeito de vender. O Growth custa menos que uma grade."; (4) FAQ: adicionar item de garantia (texto pronto no landing-copy-v2.md §FAQ).
**Aceite:** grep "7 dias" e "Performance Max" → 0 na landing/painel; build ok; screenshot da seção de planos pra revisão do Igor.

## [ ] P0.7 🟢 Separar automações do lojista × lifecycle do SaaS + templates no vocabulário
**Contexto:** `painel/automacoes/page.tsx` mistura triggers do lojista (`lead_entered`, `group_full`) com triggers internos do HubFlow (`no_connect_24h`, `trial_ending` — mensagens do SaaS pro lojista). E os templates têm copy genérica de infoproduto.
**Fazer:**
1. Remover dos TEMPLATES e TRIGGER_LABELS da tela os triggers `no_connect_24h` e `trial_ending` (o lifecycle já vive em `lib/email` + cron; não perder funcionalidade — só sai da tela do cliente). Se houver automações desses tipos persistidas, filtrar da listagem client-side e não permitir criar novas.
2. Reescrever templates no vocabulário do atacado (usar `customer-research/voc-atacadista.md` §4):
   - **"Boas-vindas de revendedor"** (`lead_entered`): espera 5min → "Oi! 👋 Bem-vindo(a) ao grupo da [loja]. Aqui você vê as novidades primeiro. Pedido mínimo, catálogo e horários: [link]. Qualquer coisa me chama!"
   - **"Novidade da semana"** (`lead_entered`, cadência 7d): mensagem "Chegou grade nova essa semana — dá uma olhada no grupo pra não perder as melhores peças."
   - **"Grupo lotou"** (`group_full`): mensagem interna/notificação — manter.
   - **"Reativação"** (novo template, `lead_entered` com espera 14d): "Faz um tempinho que você não pede — as novidades dessa semana estão saindo rápido. Quer que eu te mande o catálogo?"
3. Sem emoji em excesso; nada de "🔥 Já viu as novidades?".
**Aceite:** tela só mostra automações do negócio do lojista; templates novos criam e executam; e-mails de lifecycle continuam funcionando (cron intacto).

---

# P1 — Dias 30–60

## [x] P1.8 🟣 Playbook "Primeiros 30 dias" dentro do painel
**Objetivo:** produtizar o método Mega Stock como checklist vivo que substitui o vazio pós-onboarding. O maior item do plano — planejar com Opus antes de codar.
**Modelo de dados:** tabela `playbook_progress (tenant_id, step_key text, done_at timestamptz, pk(tenant_id, step_key))` com RLS padrão; passos definidos em código (`src/lib/playbook/steps.ts`), não no banco.
**Passos do playbook v1 (conteúdo — validar com Igor antes de codar):**
1. Conectar WhatsApp *(auto-detecta: session.live)*
2. Criar 1ª campanha *(auto: campanhas.length > 0)*
3. Divulgar o link em 3 lugares — bio do Instagram, etiqueta da sacola, status do WhatsApp *(manual: lojista marca)*
4. Postar a 1ª novidade nos grupos *(auto: 1º broadcast/disparo)*
5. Ativar boas-vindas de revendedor *(auto: automação lead_entered ativa)*
6. Primeiros 50 contatos via link *(auto: leads.length ≥ 50)*
7. Registrar o 1º pedido *(auto: orders.length ≥ 1)*
8. Definir a meta do mês *(auto: meta salva — P0.5)*
**UI:** card "Seus primeiros 30 dias" no topo do dashboard (entre header e bento) com progresso X/8, próximo passo em destaque + CTA direto; some quando 8/8 (vira badge "método rodando" nas configurações). Estilo O Balcão (`pn-card`, template de 8 passos do TASK_PROGRESS).
**API:** `GET/POST /api/playbook` (GET calcula os autos server-side agregando stores existentes; POST marca passos manuais).
**Aceite:** passos automáticos marcam sozinhos quando a condição vira verdade; progresso persiste por tenant; dashboard sem regressão pra quem já completou.

## [ ] P1.9 🟢 Relatório semanal automático (e-mail)
**Contexto:** infra Resend + cron diário já existem (`lib/email`, `api/cron/emails`, `vercel.json` com 2 crons).
**Fazer:**
1. Novo template `weekly-report` em `lib/email`: "Sua semana na [loja]": novos contatos, cliques, pedidos e R$ (orders), grupo destaque (mais entradas), comparação vs semana anterior (↑/↓). Vocabulário do nicho, sem jargão.
2. No cron diário: se `dow === segunda` (fuso America/Sao_Paulo), enviar pra cada tenant ativo com dados na semana. Idempotência: registrar envio (mesma mecânica dos e-mails existentes — seguir o padrão de dedup que o cron já usa; se não houver, tabela `email_log (tenant_id, kind, sent_at)`).
3. Opt-out simples nas configurações (`weekly_report_enabled` em tenant_settings de P0.5, default true).
**Aceite:** e-mail de teste renderiza com dados reais de um tenant dev; roda 1× por semana por tenant (rodar o cron 2× no mesmo dia não duplica); quem desligou não recebe.

## [ ] P1.10 🟢 Cadência de ativação dos 30 dias (substitui e-mails de trial)
**Contexto:** hoje: welcome, nudge 24h, trial-ending. Oferta nova não tem trial.
**Fazer:** no cron de e-mails, cadência por idade da conta: **D3** "seu link já teve X cliques — 3 lugares pra divulgar hoje" (se 0 cliques, versão 'primeiro lugar pra postar') · **D7** "grupos que enchem: poste a novidade de hoje" + estado do playbook (P1.8) · **D14** "metade da garantia: registre seus pedidos pra ver o funil em R$" · **D21** "falta 1 semana: o que os melhores lojistas fizeram até aqui". Aposentar `trial-ending` (guardar arquivo, remover do envio). Cada e-mail com 1 CTA único pro painel.
**Aceite:** conta dev com created_at manipulado recebe o e-mail certo em cada marco, 1×; trial-ending não dispara mais.

## [ ] P1.11 🟢 Grupos parados → campanha de reativação em 1 clique
**Contexto:** Resultados mostra ativos/mornos/parados (engagement por grupo) mas não oferece ação.
**Fazer:**
1. Em Resultados, no card "Atividade dos grupos", quando `parados > 0`: linha de alerta "N grupos parados" + botão "Criar campanha de reativação".
2. O botão navega pra `/painel/campanhas/nova?preset=reativacao&groups=<ids>` — a tela de nova campanha lê o preset e pré-preenche: nome ("Reativação [mês]"), grupos parados selecionados, mensagem-modelo de reativação (copy do vocabulário; oferta/novidade como gancho).
3. Implementar suporte a `?preset=` na tela de nova campanha de forma genérica (outros presets virão do P1.12).
**Aceite:** clicar no alerta abre nova campanha já montada pros grupos parados; criar funciona fim-a-fim; sem preset, tela igual à atual.

## [ ] P1.12 🟢 Templates de campanha por objetivo de atacado
**Depende de:** P1.11 (mecânica de preset).
**Fazer:** na tela `/painel/campanhas/nova`, passo inicial opcional "Qual o objetivo?": **Lançar novidade** · **Girar estoque parado** · **Reativar grupos** · **Semana de reposição** · **Do zero**. Cada objetivo = preset (nome, mensagem-modelo, dica de horário, sugestão de grupos). Copys em `src/lib/campaign-presets.ts` — revisão de texto pelo Igor antes do merge (marcar TODO). Integrar com a biblioteca se ela tiver conteúdo (ver P1.14).
**Aceite:** escolher objetivo pré-preenche a campanha; "Do zero" = fluxo atual intocado.

## [x] P1.13 🟢 `/health` honesto + alerta de desconexão pro lojista
**Contexto:** `hubflow-engine/index.js` (~linha 9): `/health` responde 200 mesmo deslogado (ENGINE_AUDIT item 9). Disparo que não sai = venda perdida em silêncio. ⚠️ NÃO tocar no anti-ban.
**Fazer:**
1. Engine: `/health` → `{status, connected, lastEventAt}` com **503 quando desconectado** (manter um `/live` sempre-200 pro orquestrador não matar o container em loop — conferir healthcheck do Coolify em `deploy/coolify/*` antes, pra não causar restart-loop).
2. App: no cron diário, checar sessão de cada tenant (`/api/session` ou tabela instances); se desconectado há >2h, e-mail "Seu WhatsApp desconectou — reconecte pra não perder a novidade de hoje" (dedup: 1 por dia).
3. Painel: banner persistente no dashboard quando `session.live === false` (hoje o estado desconectado vira onboarding — ok pra conta nova, mas conta com campanhas ativas precisa de alerta explícito "reconectar", não voltar pro passo 1).
**Aceite:** derrubar sessão em dev → `/health` 503, `/live` 200, banner aparece, e-mail 1×/dia; Coolify não entra em restart-loop.

## [x] P1.14 🟢 Auditar/entregar a Biblioteca (bônus prometido na oferta)
**Contexto:** `painel/biblioteca/page.tsx` tem 172 bytes — provável casca. "Biblioteca de copys e criativos" é bônus empacotado da oferta.
**Fazer:** (1) abrir e mapear o que existe (página, API `templates`, store, seed); (2) se vazia: popular com 15–20 copys reais de atacado por categoria (novidade, reposição, evento, reativação, boas-vindas) — conteúdo com Igor/Mega Stock, estrutura via seed em `api/templates` ou migração de seed; (3) botão "usar essa copy" que leva pra nova campanha/disparo com o texto aplicado (via preset de P1.11).
**Aceite:** biblioteca abre com conteúdo navegável por categoria e "usar" funciona; se o conteúdo real não estiver pronto, entregar a mecânica + 5 copys aprovadas (não inventar 20 copys sem revisão).

## [x] P1.15 🟢 Instrumentar funil de ativação (admin)
**Contexto:** é o item 20 do Sprint 4 (TASK_PROGRESS); `funnel_events` já tem migração (`20260701020000_funnel_events.sql`).
**Fazer:** registrar eventos por tenant nos marcos: connected, first_campaign, first_lead, leads_50, first_order, goal_set (hooks nos endpoints que já processam essas ações — ex.: `POST /api/orders` registra first_order se for o 1º). Tela `/admin/funnel`: tabela tenants × marcos com idade da conta e tempo até cada marco; destacar contas paradas há >5 dias no mesmo marco (são os refunds de amanhã).
**Aceite:** eventos idempotentes (1º pedido registra 1×); tela admin lista todos os tenants com marcos e tempos corretos.

---

# P2 — Dias 60–90

## [ ] P2.16 🟣 Modo Evento (assistente do evento de 2 dias)
**Objetivo:** o case "20 mil peças em 2 dias" como feature. Planejar com Opus (feature nova, mexe em agenda/disparos/grupos).
**Escopo v1 (wizard, sem IA):** criar "Evento" = nome + data + grupos → gera plano pré-montado sobre a infra existente de agendamento (módulo mensagens/schedules): **D-7 a D-1** aquecimento (2 posts agendados: "vem novidade grande aí") · **D0** abertura + drops em horários definidos · **D1** reposição + últimas peças · **D+1** pós-evento (agradecimento + próxima data). Cada mensagem editável antes de ativar; tela do evento mostra timeline e, durante, contadores (entradas, pedidos via P0.2).
**Modelo:** tabela `events (id, tenant_id, name, starts_at, ends_at, status)` + vincular schedules criados ao event_id (coluna nullable em schedules OU tabela de junção — decidir no planejamento olhando o schema real de schedules/messages).
**Aceite:** criar evento gera os agendamentos visíveis na agenda; cancelar evento cancela os pendentes; timeline reflete o que já saiu.

## [ ] P2.17 🟢 Cartão de resultado compartilhável + pedido de depoimento
**Contexto:** migração `testimonials` + `api/testimonials` já existem. Gargalo da oferta = prova de terceiros.
**Fazer:** (1) gerar cartão-imagem (OG-image style, rota `app/api/og` com `next/og` ImageResponse) nos momentos de pico: grupo lotou, meta batida, marco de pedidos — "247 revendedores no grupo em 9 dias 🎉 · [loja] com HubFlow"; (2) toast/modal de celebração (o Confetti já existe) com "Compartilhar" (baixar imagem / abrir wa.me com texto pronto); (3) no mesmo modal, 1 pergunta: "Conta em uma frase o que mudou?" → grava via `api/testimonials` (com consentimento explícito de uso público — checkbox).
**Aceite:** cartão renderiza com dados reais do tenant; depoimento salvo com flag de consentimento; nada dispara mais de 1× por marco.

## [ ] P2.18 🟢 Atribuição de R$ por campanha (fecha anúncio→venda)
**Depende de:** P0.2/P0.4 rodando e com dados.
**Fazer:** (1) `orders` ganha `campaign_id` nullable (migração): inferido do lead (`sourceCampaign`) quando o pedido nasce de um lead; (2) Resultados: "R$ por campanha" ao lado de "membros por campanha"; (3) na tela da campanha (`campanhas/[slug]`), tab Resultados ganha R$ e nº de pedidos.
**Aceite:** pedido registrado de lead com campanha aparece no R$ da campanha; pedidos sem lead caem em "sem origem".

## [ ] P2.19 🟢 VOC Mode 1 (pesquisa, não código)
**Fazer:** minerar as conversas reais de WhatsApp do Igor com clientes (export de 10–20 conversas) → 10–15 frases verbatim de lojista → atualizar `customer-research/voc-atacadista.md` (o doc pede exatamente isso no §5) → revisar copys de P0.7/P1.12/P1.14 com as frases reais.
**Aceite:** doc atualizado com quotes reais + lista de ajustes de copy aplicados.

## [ ] P2.20 🟢 Confiabilidade engine (watchdog + Sentry + backup)
**Contexto:** ENGINE_AUDIT R-1 (watchdog órfão), INFRA-5 (sem Sentry), INFRA-6 (volumes sem backup). ⚠️ Anti-ban intocado.
**Fazer:** (1) plugar `connection-watchdog.js` no boot do `index.js` (revisar antes se está alinhado com o fluxo atual de reconexão — ENGINE_AUDIT); (2) Sentry no `apps/web` (DSN via env, sample baixo) + captura de erros fatais da engine (Sentry node ou coletor simples que POSTa pro app); (3) backup: script/cron no Coolify que tar-gzipa `auth/` + `state` pra storage externo 1×/dia, com teste de restore documentado em runbook.
**Aceite:** matar a conexão em dev → watchdog reconecta sem intervenção; erro forçado aparece no Sentry; restore do backup testado 1× e documentado.

---

## Ordem de execução recomendada

```
Semana 1:  P0.1 → P0.2 → P0.3 → P0.4        (prova de valor destravada)
Semana 2:  P0.5 → P0.6* → P0.7               (*P0.6 depende de Igor confirmar preços)
Semana 3-4: P1.13 → P1.9 → P1.15             (confiabilidade + hábito + medição)
Semana 5-6: P1.8 (planejar com Opus antes) → P1.10
Semana 7-8: P1.11 → P1.12 → P1.14
Depois:    P2.18 → P2.17 → P2.16 (Opus) → P2.20 → P2.19 (paralelo, não é código)
```

**Decisões que só o Igor pode tomar (responder antes dos itens marcados):**
1. Preços/planos vigentes são R$197/297/497? (bloqueia P0.6)
2. Conteúdo: aprovar textos dos templates de automação (P0.7), passos do playbook (P1.8) e copys da biblioteca (P1.14).
3. Meta em R$ além de contatos? (P0.5 — recomendo sim, mas opcional)

**Dica de sessão no Claude Code:** uma sessão por item, começando com: *"Lê IMPLEMENTATION_PLAN.md e PROJECT_CONTEXT.md. Implementa APENAS o item [X] seguindo a spec, um PR, e roda lint+build antes de terminar. Marca o checkbox do item como [x] no plano ao final."* Itens 🟢 → Sonnet 5. Itens 🟣 (P1.8, P2.16) → planejar com Opus (plan mode), implementar com Sonnet.

