# CONTEXT_PANEL.md — Contexto para Continuação

**Última atualização:** 2026-07-01

---

## Estado Atual

Auditoria completa do painel do cliente foi realizada por um Product Council de 6 especialistas. O painel tem **nota geral 5.3/10** — base funcional sólida mas sem mecanismos de retenção, dados reais, ou clareza de navegação para o público-alvo (lojistas 30+).

---

## Visão do Produto

Ferramenta de gestão de grupos WhatsApp focada em resultado comercial:
- Campanha → Link → Grupo → Contato → Venda
- Simplicidade máxima, zero complexidade
- Valor = "meus grupos crescem e eu vendo mais"

---

## Funcionalidades Existentes (rotas do painel)

| Rota | Status | Na sidebar? |
|------|--------|-------------|
| `/painel` | Dashboard (dados fake) | ✅ |
| `/painel/campanhas` | Funcional, bem construída | ✅ |
| `/painel/grupos` | Funcional, com filtros | ✅ |
| `/painel/contatos` | Funcional (leads) | ❌ (era "Clientes") |
| `/painel/resultados` | Funcional (funil real) | ❌ ESCONDIDA |
| `/painel/disparos` | Funcional (histórico) | ❌ |
| `/painel/indicacao` | Funcional (referral) | ✅ |
| `/painel/configuracoes` | Funcional (4 seções) | ✅ |
| `/painel/conectar` | Onboarding WhatsApp | ❌ (via Config) |
| `/painel/biblioteca` | Existe | ❌ Órfã |
| `/painel/agenda` | Existe | ❌ Órfã |
| `/painel/ds` | Dev tool | ❌ Remover |

---

## Decisões Tomadas

1. Sidebar reduzida: Início, Campanhas, Grupos, Contatos, Resultados + Config
2. Resultados como item principal (prova de ROI)
3. Dashboard com dados reais Supabase + empty states progressivos
4. Indicação sai da sidebar (vai pra banner contextual)
5. Nenhuma feature de hype (IA, CRM, chat, automações)
6. Alertas operacionais no próximo ciclo
7. Remover páginas órfãs
8. Monetização via gating no ponto de uso (ciclo futuro)

---

## Hipóteses a Validar

1. Sidebar com 5 itens reduz confusão e aumenta task completion
2. Dashboard real + empty states melhora activation rate D0
3. Resultados visíveis reduz churn (lojista vê ROI)
4. Delta diário ("desde ontem") cria hábito de uso frequente
5. Alertas de grupo cheio evitam perda de captação

---

## Próximas Ações

**Imediatas (Caminho A):**
1. Refatorar sidebar (5+1 itens)
2. Dashboard com queries reais
3. Empty states progressivos
4. Limpar páginas órfãs

**Ciclo seguinte (Caminho B):**
1. Alertas operacionais
2. "Desde ontem" no dashboard
3. Unificar disparos em campanhas
4. Gating de plano contextual

---

## Como Continuar

```
Leia docs/audit/CONTEXT_PANEL.md e continue.
Não releia o projeto.

Próximo passo: implementar Caminho A (sidebar + dashboard real + empty states).
Arquivos relevantes:
- apps/web/src/components/painel/sidebar.tsx
- apps/web/src/components/painel/mobile-nav.tsx  
- apps/web/src/app/painel/page.tsx
- apps/web/src/app/painel/layout.tsx

Decisões em docs/audit/DECISIONS.md
Backlog em docs/audit/FEATURE_BACKLOG.md
```

---

## Prompt de Retomada

> Sou o Igor. Leia `docs/audit/CONTEXT_PANEL.md` e implemente o Caminho A da auditoria do painel: refatorar sidebar para 5+1 itens, dashboard com dados reais do Supabase, e empty states progressivos. Decisões e backlog estão em `docs/audit/`.
