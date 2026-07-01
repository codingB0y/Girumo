# PANEL_AUDIT.md — Auditoria do Painel HubFlow

**Data:** 2026-07-01  
**Conselho:** Product Strategist · UX Research Lead · Growth PM · Operations Specialist · SaaS Monetization Reviewer · Critical Reviewer

---

## Resumo Executivo

O painel do HubFlow tem uma base sólida de produto — foco claro em gestão de grupos WhatsApp para resultado comercial. A arquitetura de telas é coerente, o design system está consistente, e o fluxo "campanha → grupo → contato → venda" é bem desenhado.

Porém, existem **problemas estruturais** que impactam retenção, frequência de uso e valor percebido para o público-alvo (lojistas 30+, pouco técnicos, que querem resultado rápido).

---

## FASE 1 — Notas por Dimensão (0–10)

| Dimensão | Nota | Justificativa |
|----------|------|---------------|
| Primeira impressão | 6/10 | Dashboard com dados simulados (TODO no código). Lojista entra e vê números fake. Valor zero no primeiro acesso. |
| Clareza | 7/10 | Navegação limpa, sidebar enxuta. Mas "Campanhas" vs "Disparos" vs "Mensagens" confundem — são 3 nomes pro mesmo conceito. |
| Tempo até valor | 4/10 | Precisa conectar WhatsApp → criar campanha → esperar gente entrar. Muitos passos antes de ver resultado. |
| Simplicidade | 7/10 | Telas individuais são simples. Problema é a quantidade de seções e sobreposição conceitual. |
| Retenção | 5/10 | Nenhum mecanismo de reengajamento. Nada puxa o lojista de volta no dia seguinte. |
| Frequência de uso | 4/10 | Sem motivo pra abrir todo dia. Não mostra o que mudou desde ontem. |
| Valor percebido | 6/10 | Grupos + campanhas = útil. Mas sem resultado real visível, parece dashboard vazio. |
| Recompra (renovação) | 5/10 | Plano fica em "Configurações" — escondido. Upgrade path não está claro. |
| Engajamento | 4/10 | Sem gamificação, sem progresso, sem streak, sem "seu grupo cresceu X hoje". |
| Conversão free→paid | 5/10 | Sem gating visível. Sem nudge de upgrade nos momentos de valor. |

**Média geral: 5.3/10**

---

## FASE 2 — Auditoria Crítica

### O que está bonito mas inútil?

1. **Dashboard com dados fake** (`page.tsx` dashboard usa `setTimeout` e dados hardcoded). Lojista abre e vê números que não são dele. Dá impressão de produto vazio.
2. **Atividade Recente hardcoded** — "2 min atrás", "Black Friday enviada" — tudo inventado.
3. **"Ações Rápidas" sem rota real** — botões são `Button variant="outline"` sem `onClick` funcional nem `Link`.
4. **Bottom Stats (Grupos Ativos, Campanhas Ativas, Ticket Médio)** — duplicam info dos cards de cima, sem ação.

### O que está complexo demais?

5. **Navegação fragmentada de comunicação**: sidebar tem "Mensagens" + tela de "Disparos" + "Campanhas" — o lojista não sabe a diferença. São 3 conceitos pra 1 ação: "mandar mensagem pro grupo".
6. **Configurações com 4 tabs** (Conexão, Equipe, Plano, Conta) — mistura coisas que o lojista visita 1x/mês com o que é crítico (conexão WhatsApp).

### O que quase ninguém usaria?

7. **Biblioteca** (`/painel/biblioteca`) — existe na rota mas não está na sidebar. Orphan page.
8. **Agenda** (`/painel/agenda`) — existe na rota mas não está na sidebar. Orphan page.
9. **DS** (`/painel/ds`) — design system page, não é feature de cliente.

### O que parece recurso mas não gera venda?

10. **Indicação** — legal pra growth do HubFlow, mas pra o lojista é low-priority. Ocupa espaço na sidebar que poderia ser algo que gera venda pra ELE.

### O que gera suporte?

11. **Conexão WhatsApp** — QR code com placeholder (FauxQR). Lojista vai escanear e nada acontece → suporte.
12. **Campanhas sem grupos vinculados** mostram status "Sem grupos" — confuso pra quem acabou de criar.

### O que está escondendo valor?

13. **Resultados** (`/painel/resultados`) — a tela MAIS valiosa do produto (funil clique→membro→cliente) NÃO está na sidebar principal. É a prova de ROI e está escondida.
14. **Disparos** (`/painel/disparos`) — histórico de envios também não está na sidebar.

### O que pode ser removido?

- `/painel/ds` — remover (ferramenta interna)
- `/painel/biblioteca` — se não tem conteúdo, remover ou mover pra dentro de Campanhas
- `/painel/agenda` — se não está na sidebar, não existe pro usuário
- Dashboard bottom stats — redundantes

### O que deveria existir?

15. **"Ontem vs Hoje"** — número simples mostrando crescimento diário
16. **Alerta de grupo quase cheio** — o lojista precisa criar novo grupo, é urgente
17. **"Clientes inativos há X dias"** — lista pra recuperação
18. **Resumo diário push/email** — motivo pra voltar

---

## Autocrítica do Prompt

O prompt de auditoria é bem estruturado, mas tem um risco: ao excluir "IA", "automações", "analytics desnecessário", pode bloquear sugestões legítimas como um alerta automático simples ("grupo cheio") que não é "automação complexa" mas sim operação básica. A restrição deve ser lida como "nada complexo sem ROI" e não "zero automação".

---

## FASE 3 — Propostas

### Melhoria 1: Dashboard Real ("Meu Dia")

| Campo | Valor |
|-------|-------|
| Nome | Meu Dia — Dashboard com dados reais |
| Problema | Dashboard mostra dados fake. Primeiro acesso é decepcionante. |
| Solução | Substituir dados hardcoded por queries Supabase reais. Mostrar: novos membros HOJE, grupos com espaço, próximo disparo agendado, último resultado. Estado vazio orientado ("conecte WhatsApp" → "crie campanha" → "veja resultados"). |
| Impacto | Alto — primeira impressão define retenção D1 |
| Esforço | Médio (queries existem, falta conectar) |
| Risco | Baixo |
| Métrica | Retenção D1, D7 |
| Tempo para perceber valor | Imediato (primeiro login) |

### Melhoria 2: Simplificar Navegação (de 8 itens → 5)

| Campo | Valor |
|-------|-------|
| Nome | Sidebar Focada |
| Problema | 8 itens + 2 bottom = confusão. "Mensagens", "Disparos", "Campanhas" se sobrepõem. |
| Solução | Sidebar: **Início** (dashboard), **Campanhas** (inclui disparos), **Grupos**, **Contatos**, **Resultados**. Bottom: **Configurações**. Mover Indicação pra dentro de Config ou como banner no Início. Remover páginas órfãs. |
| Impacto | Alto — reduz carga cognitiva, lojista acha tudo |
| Esforço | Baixo (reorganização de rotas e sidebar) |
| Risco | Baixo (sem perda de funcionalidade) |
| Métrica | Task completion rate, support tickets |
| Tempo para perceber valor | Imediato |

### Melhoria 3: Resultados na Sidebar ("Quanto estou vendendo")

| Campo | Valor |
|-------|-------|
| Nome | Resultados Visíveis |
| Problema | A tela de Resultados (funil real) está escondida — não tem link na sidebar. É a prova de valor do produto. |
| Solução | Adicionar "Resultados" como 5º item da sidebar, com ícone de gráfico. Opcional: mostrar mini-funil no Dashboard. |
| Impacto | Alto — lojista VÊ o ROI, justifica mensalidade |
| Esforço | Mínimo (1 linha na sidebar + já existe a tela) |
| Risco | Zero |
| Métrica | Visualizações da tela, churn rate |
| Tempo para perceber valor | Imediato |

### Melhoria 4: Onboarding Progressivo (Empty States → Ação)

| Campo | Valor |
|-------|-------|
| Nome | Caminho Guiado |
| Problema | Primeiro acesso é confuso. Lojista não sabe por onde começar. Dashboard vazio não ajuda. |
| Solução | Quando sem WhatsApp conectado: Dashboard mostra APENAS o card de conexão + stepper (3 passos). Quando conectado sem campanha: mostra card "crie sua primeira campanha". Quando tem campanha: mostra resultados reais. Progressão: Conectar → Campanha → Resultado. |
| Impacto | Alto — reduz abandono no D0 |
| Esforço | Médio |
| Risco | Baixo |
| Métrica | Activation rate (% que conecta + cria campanha) |
| Tempo para perceber valor | Primeiro acesso (2 min) |

### Melhoria 5: Alertas Operacionais ("Grupo quase cheio")

| Campo | Valor |
|-------|-------|
| Nome | Alertas de Ação |
| Problema | Lojista não sabe que o grupo encheu. Perde captação. Só descobre se abrir a tela de Grupos. |
| Solução | NotificationBell (já existe com Realtime) dispara alerta quando: grupo > 90% capacidade, campanha sem link de convite, 0 novos membros em 3 dias. Alerta = notificação + badge na sidebar. |
| Impacto | Alto — evita perda de receita |
| Esforço | Médio (lógica no backend, frontend já existe) |
| Risco | Baixo |
| Métrica | Tempo de reação a grupo cheio, leads perdidos |
| Tempo para perceber valor | Quando primeiro grupo enche |

### Melhoria 6: Frequência Diária ("O que mudou hoje")

| Campo | Valor |
|-------|-------|
| Nome | Resumo Diário |
| Problema | Sem motivo pra abrir o painel todo dia. Lojista esquece, churn aumenta. |
| Solução | No Dashboard, seção "Desde ontem": +X membros, Y cliques, Z mensagens enviadas. Números com setas verdes/vermelhas comparando com dia anterior. Opcionalmente: push/email diário com 1 número ("seu grupo cresceu 12 membros ontem"). |
| Impacto | Alto — cria hábito diário |
| Esforço | Médio (query com date filter) |
| Risco | Baixo |
| Métrica | DAU, sessões por semana |
| Tempo para perceber valor | D2 (segundo dia) |

---

## Caminhos

### CAMINHO A — Mais simples (1–2 sprints)

Focar em percepção imediata:
1. Resultados na sidebar (10 min)
2. Simplificar sidebar para 5 itens (2h)
3. Dashboard com dados reais via Supabase (1-2 dias)
4. Empty states progressivos (1 dia)

**Resultado:** produto parece completo e funcional. Resolve a primeira impressão.

### CAMINHO B — Mais escalável (3–4 sprints)

Caminho A + infraestrutura de hábito:
1. Tudo do Caminho A
2. Alertas operacionais com Realtime (já parcialmente existe)
3. "Desde ontem" no dashboard
4. Unificar Campanhas + Disparos em uma tela

**Resultado:** produto cria hábito diário. Retenção sobe.

### CAMINHO C — Mais premium (5–6 sprints)

Caminho B + monetização:
1. Tudo do Caminho B
2. Gating inteligente (limites visíveis no ponto de uso)
3. Upgrade nudges contextuais ("grupo cheio, upgrade pra mais grupos")
4. Resumo diário por email/push
5. Comparativo mensal de resultados

**Resultado:** produto justifica preço, upgrade path claro, churn cai.

---

## Recomendação

**CAMINHO A primeiro, depois B.**

Motivo: o produto precisa resolver a primeira impressão ANTES de otimizar retenção. Dados fake no dashboard é o maior detrator atual. É rápido de resolver e muda a percepção do produto inteiro.

---

## Priorização ICE

| # | Melhoria | Impacto | Confiança | Esforço* | Score | Classificação |
|---|----------|---------|-----------|----------|-------|---------------|
| 3 | Resultados na sidebar | 9 | 10 | 10 | 29 | FAZER AGORA |
| 2 | Sidebar focada (5 itens) | 8 | 9 | 9 | 26 | FAZER AGORA |
| 1 | Dashboard real | 9 | 8 | 7 | 24 | FAZER AGORA |
| 4 | Onboarding progressivo | 8 | 8 | 7 | 23 | FAZER AGORA |
| 5 | Alertas operacionais | 8 | 7 | 6 | 21 | PRÓXIMO CICLO |
| 6 | Resumo diário | 7 | 7 | 6 | 20 | PRÓXIMO CICLO |

*Esforço invertido: 10 = muito fácil, 1 = muito difícil

---

## NÃO FAZER

- Chat interno entre lojistas
- CRM com pipeline de vendas
- Analytics avançado com gráficos de linha
- Automações condicionais (if/then)
- Integração com 10 plataformas
- Editor de mensagem drag-and-drop
- Segmentação avançada de contatos
- A/B testing de mensagens
- Dashboard com 15 KPIs

Nenhum desses resolve o problema real: **lojista quer ver grupo crescendo e vendas entrando, com zero fricção.**
