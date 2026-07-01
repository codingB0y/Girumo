# FEATURE_BACKLOG.md — Backlog Priorizado

**Data:** 2026-07-01  
**Fonte:** PANEL_AUDIT.md

---

## FAZER AGORA (Sprint atual)

### 1. Resultados na Sidebar
- **O quê:** Adicionar "Resultados" como item na sidebar principal
- **Arquivo:** `apps/web/src/components/painel/sidebar.tsx` + `mobile-nav.tsx`
- **Esforço:** 10 min
- **Critério de done:** Link visível, ativo quando na rota `/painel/resultados`

### 2. Simplificar Sidebar (8 → 5 itens)
- **O quê:** Reorganizar navegação
- **De:** Dashboard, Grupos, Mensagens, Campanhas, Clientes, Indicações + Assinatura, Configurações
- **Para:** Início, Campanhas, Grupos, Contatos, Resultados + Configurações
- **Ações:**
  - Remover "Mensagens" da sidebar (disparos vivem dentro de Campanhas)
  - Remover "Indicações" da sidebar (mover pra banner no Início ou dentro de Config)
  - Renomear "Clientes" → "Contatos" (já é o nome da rota real)
  - Adicionar "Resultados"
  - Remover "Assinatura" do bottom (já está em Configurações > Plano)
- **Esforço:** 2h
- **Critério de done:** Sidebar com 5+1 itens, todas as rotas acessíveis

### 3. Dashboard com Dados Reais
- **O quê:** Substituir dados fake por queries Supabase
- **Arquivo:** `apps/web/src/app/painel/page.tsx`
- **Ações:**
  - Query real: total de membros nos grupos do tenant
  - Query real: cliques totais nas campanhas
  - Query real: disparos enviados este mês
  - Query real: novos contatos hoje/esta semana
  - Atividade recente: últimos 5 eventos reais (broadcasts, novos membros)
  - Ações rápidas com Links funcionais
- **Esforço:** 1-2 dias
- **Critério de done:** Todos os números refletem dados reais do tenant

### 4. Empty States Progressivos (Onboarding)
- **O quê:** Dashboard se adapta ao estágio do usuário
- **Estágios:**
  1. Sem WhatsApp → card grande "Conectar" + stepper
  2. Sem campanha → card "Crie sua primeira campanha"
  3. Com campanha, sem membros → card "Compartilhe o link"
  4. Com membros → dashboard completo com dados reais
- **Esforço:** 1 dia
- **Critério de done:** Cada estágio mostra a próxima ação correta

---

## PRÓXIMO CICLO (Sprint seguinte)

### 5. Alertas Operacionais
- **O quê:** Notificações automáticas para eventos críticos
- **Triggers:**
  - Grupo > 90% capacidade → "Grupo X quase cheio"
  - Campanha sem link de convite → "Configure o link"
  - 0 novos membros em 3 dias → "Campanha parada"
- **Infraestrutura:** NotificationBell + Supabase Realtime (já existem)
- **Esforço:** 3-4 dias
- **Critério de done:** Alerts disparam corretamente e aparecem no bell

### 6. Seção "Desde Ontem" no Dashboard
- **O quê:** Bloco no topo do dashboard mostrando delta diário
- **Métricas:** +X membros, +Y cliques, Z disparos enviados
- **Visual:** Números com seta verde/vermelha + comparação vs ontem
- **Esforço:** 1-2 dias
- **Critério de done:** Números corretos comparando hoje vs ontem

### 7. Unificar Campanhas + Disparos
- **O quê:** Histórico de disparos como tab/seção dentro de Campanhas
- **Motivo:** Lojista não distingue "campanha" de "disparo" — é tudo "mensagem que mandei"
- **Esforço:** 1 dia
- **Critério de done:** `/painel/disparos` redireciona pra campanhas, histórico acessível

---

## NÃO FAZER (consciente)

- [ ] Chat interno
- [ ] CRM com pipeline
- [ ] Analytics com gráficos de linha
- [ ] Automações if/then
- [ ] Integrações externas
- [ ] Editor drag-and-drop
- [ ] Segmentação avançada
- [ ] A/B testing
- [ ] Dashboard com 15+ KPIs

---

## Páginas a Remover/Limpar

| Rota | Ação | Motivo |
|------|------|--------|
| `/painel/ds` | Remover | Ferramenta interna, não é feature |
| `/painel/biblioteca` | Avaliar | Sem link na sidebar, orphan |
| `/painel/agenda` | Avaliar | Sem link na sidebar, orphan |
| `/painel/mensagens` | Redirecionar | Absorvida por Campanhas |
| `/painel/clientes` | Redirecionar → contatos | Duplicata conceitual |
