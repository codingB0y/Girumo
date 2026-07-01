# RETENTION_OPPORTUNITIES.md — Oportunidades de Retenção

**Data:** 2026-07-01

---

## Diagnóstico

O painel atual não tem nenhum mecanismo ativo de retenção. O lojista usa quando lembra, e esquece quando não precisa. Isso gera:

- Baixo DAU (daily active users)
- Churn silencioso (para de usar antes de cancelar)
- Percepção de "não preciso disso todo dia"

---

## Oportunidades Identificadas

### 1. Loop de Hábito Diário

**Gatilho:** "O que mudou desde ontem"  
**Ação:** Abrir o painel  
**Recompensa variável:** Ver crescimento (ou alerta se parou)

**Implementação:**
- Dashboard mostra delta diário no topo
- Push/email matinal: "Ontem: +8 membros, 45 cliques" (1 frase)
- Se não abriu em 3 dias: email "Seu grupo cresceu X enquanto você não olhava"

**Métrica:** DAU, sessões/semana

---

### 2. Alertas de Perda (Loss Aversion)

**Gatilho:** Algo ruim está acontecendo  
**Ação:** Lojista age pra corrigir  
**Recompensa:** Evitou perda de clientes

**Implementação:**
- "Grupo VIP está 95% cheio — crie outro antes de perder captação"
- "0 entradas em 3 dias — seu link pode estar quebrado"
- "5 membros saíram do grupo X esta semana"

**Métrica:** Tempo de reação, membros perdidos por inação

---

### 3. Progresso Visível (Endowed Progress)

**Gatilho:** Ver que está crescendo  
**Ação:** Continuar fazendo o que funciona  
**Recompensa:** Sensação de progresso

**Implementação:**
- Barra de progresso na dashboard: "150/500 membros este mês" (meta personalizável)
- "Você está no top 20% dos lojistas da plataforma" (benchmark)
- "Este mês: +34% vs mês passado"

**Métrica:** Retenção M2, M3

---

### 4. Ciclo Semanal de Resultado

**Gatilho:** Segunda-feira  
**Ação:** Ver resumo semanal  
**Recompensa:** Comprovar ROI da ferramenta

**Implementação:**
- Email/push toda segunda: "Semana passada: X membros, Y cliques, Z vendas"
- Comparação com semana anterior
- 1 sugestão de ação ("essa campanha está parada, reative")

**Métrica:** Retenção W2, W4, W8

---

### 5. Prova Social Interna

**Gatilho:** Ver que outros estão usando bem  
**Ação:** Copiar comportamento  
**Recompensa:** Não ficar pra trás

**Implementação:**
- "Lojistas como você enviam em média 3 campanhas/semana"
- "Seu grupo de Revendedoras cresceu mais rápido que 80% da base"
- Nada invasivo — 1 frase sutil na dashboard

**Métrica:** Campanhas criadas por semana

---

### 6. Valor Percebido no Cancelamento

**Gatilho:** Tentou cancelar  
**Ação:** Ver o que perde  
**Recompensa:** Reconsiderar

**Implementação:**
- Tela de cancelamento: "Se cancelar, você perde acesso a 1.247 contatos e 12 grupos ativos"
- Mostrar quanto cresceu desde que entrou
- Oferecer pause (1 mês grátis) em vez de cancelamento

**Métrica:** Churn rate, save rate

---

## Prioridade de Implementação

| # | Oportunidade | Esforço | Impacto Esperado |
|---|-------------|---------|------------------|
| 1 | Delta diário no dashboard | Baixo | Alto (hábito) |
| 2 | Alertas de grupo cheio | Médio | Alto (evita perda) |
| 3 | Resumo semanal por email | Médio | Alto (reengajamento) |
| 4 | Progresso visível (barra) | Baixo | Médio (motivação) |
| 5 | Prova social | Baixo | Médio (FOMO saudável) |
| 6 | Tela de cancelamento | Baixo | Alto (save rate) |

---

## Anti-patterns a Evitar

- ❌ Notificação excessiva (max 1 push/dia)
- ❌ Gamificação forçada (badges, pontos, ranking público)
- ❌ Dark patterns no cancelamento (dificultar saída)
- ❌ Métricas de vaidade ("1M de impressões!") que não significam venda
- ❌ Complexidade em nome de engajamento (mais telas ≠ mais uso)
