# UX_NOTES.md — Notas de UX

**Data:** 2026-07-01

---

## Público-alvo (contexto)

- Lojistas e atacadistas, maioria 30+
- Pouco técnicos, smartphone como ferramenta principal
- Querem resultado rápido ("mandei mensagem, vendeu")
- Não vão aprender ferramenta complexa
- Paciência baixa — se não entende em 5 segundos, fecha

---

## Problemas de UX Encontrados

### 1. Confusão conceitual na navegação

**Sidebar atual (8 itens):**
- Dashboard, Grupos, Mensagens, Campanhas, Clientes, Indicações, Assinatura, Configurações

**Problema:** 
- "Mensagens" vs "Campanhas" vs "Disparos" — lojista não distingue
- "Clientes" vs "Contatos" — existem as duas rotas
- "Assinatura" + "Plano" dentro de Config — duplicação

**Recomendação:**
```
Início (dashboard)
Campanhas (criar, gerenciar, histórico de envios)
Grupos (status, capacidade)
Contatos (leads que entraram)
Resultados (funil, ROI)
──────
Configurações (conexão, plano, equipe, conta)
```

5 itens + 1 = carga cognitiva mínima.

---

### 2. Dashboard sem estado vazio útil

**Atual:** Mostra cards com números zerados ou fake.

**Recomendação:**  
Progressive disclosure baseado no estágio:

| Estágio | O que mostra |
|---------|-------------|
| Sem WhatsApp | Card único: "Conecte em 2 min" com QR inline |
| Sem campanha | Card: "Crie sua primeira campanha" + explicação 1 frase |
| Campanha sem membros | Card: "Compartilhe o link" + copy button |
| Com dados | Dashboard real com delta diário |

Cada estágio mostra UMA ação. Nada mais.

---

### 3. Ações rápidas sem funcionalidade

**Atual:** 4 botões `Button variant="outline"` sem Link nem onClick real.

**Problema:** Lojista clica, nada acontece. Quebra confiança.

**Recomendação:**
- Cada ação rápida = Link para a tela certa
- Ou remover se não funciona ainda

---

### 4. Mobile-first não está completo

**Pontos positivos:**
- MobileNav existe e funciona
- Layout responsivo com grid cols

**Pontos de melhoria:**
- Tabelas em `/painel/grupos` e `/painel/contatos` usam grid responsivo (bom)
- Filtros com scroll horizontal (bom)
- Falta: bottom tab bar para ações frequentes no mobile ("enviar", "ver grupos")
- Cards de campanha podem ficar apertados em telas < 375px

---

### 5. Hierarquia visual inconsistente no Dashboard

**Problema:**
- 4 stat cards no topo (bom)
- 2 cards no meio (ações + atividade)
- 3 cards bottom stats (redundantes com o topo)

**Recomendação:** Remover bottom stats. São "Grupos Ativos", "Campanhas Ativas" e "Ticket Médio" — os dois primeiros já estão implícitos nos cards de cima, e ticket médio é analítico demais pro dia-a-dia do lojista.

---

### 6. Feedback de carregamento é genérico

**Atual:** `animate-pulse` em blocos cinza.

**Recomendação:** OK para MVP. No futuro, skeleton mais fiel ao layout final (não urgente).

---

### 7. Tela de Configurações é um mini-app

**Atual:** 4 seções (Conexão, Equipe, Plano, Conta) com tabs na esquerda.

**Problema:** Mistura coisas de frequência diferente:
- Conexão: visita 1x depois de conectar
- Plano: visita 1x/mês no máximo
- Equipe: visita 1x na vida
- Conta: quase nunca

**Recomendação:**
- Manter como está (é config, lojista raramente vai)
- MAS: status da conexão WhatsApp deveria ter badge/indicador na sidebar (bolinha verde/vermelha) pra não precisar entrar em Config pra saber se está online

---

### 8. Página de Resultados é o melhor produto da casa

**Atual:** Funil real (clique → membro → cliente), atividade dos grupos, membros por campanha.

**Problema:** NÃO ESTÁ NA SIDEBAR. É a tela que comprova o ROI do produto. Lojista não acha.

**Recomendação:** Promover a item principal da sidebar. Considerar mostrar mini-funil no Dashboard.

---

## Padrões Positivos (manter)

- ✅ Design system consistente (cores, tipografia, cards)
- ✅ CopyLink component reutilizado bem
- ✅ Filtros com contagem em cada opção
- ✅ Empty states com CTA (quando existem)
- ✅ Tela de Conectar WhatsApp com stepper claro
- ✅ Notificações com Realtime (infra pronta)
- ✅ Status operacional das campanhas (ready, needs_invites, full, empty)
- ✅ Ação "Conversar" direto no WhatsApp no contato

---

## Acessibilidade

**Positivo:**
- `sr-only` no botão de menu mobile ✅
- `aria-label` no NotificationBell ✅
- Semântica de headings (h1, h2) ✅

**A melhorar:**
- Filtros são `<button>` sem `role="tablist"` / `aria-selected`
- Dropdown de notificação sem `role="dialog"` / trap focus
- Tabela de grupos não usa `<table>` semântica (usa div grid) — aceitável pra layout mas screen readers perdem contexto
- Contraste de `text-aco/40` e `text-aco/50` provavelmente não passa WCAG AA em fundo branco

---

## Resumo de Ações UX

| Prioridade | Ação |
|-----------|------|
| P0 | Adicionar Resultados na sidebar |
| P0 | Remover/simplificar sidebar para 5 itens |
| P0 | Dashboard com dados reais + empty states |
| P1 | Ações rápidas com Links funcionais |
| P1 | Indicador de conexão WhatsApp na sidebar |
| P1 | Remover bottom stats do dashboard |
| P2 | Acessibilidade: aria roles nos filtros |
| P2 | Verificar contraste de texto em opacidades baixas |
