# TASK_PROGRESS_PANEL.md — Progresso da Auditoria

**Última atualização:** 2026-07-01

---

## Checklist Principal

- [x] Análise completa do painel (10 dimensões, notas 0-10)
- [x] Auditoria crítica (o que remover, o que esconder valor)
- [x] Oportunidades de retenção mapeadas
- [x] Propostas com 3 caminhos (A/B/C)
- [x] Priorização ICE
- [x] Decisões documentadas
- [x] Backlog priorizado
- [x] Notas de UX
- [ ] Implementação Caminho A — Sprint 1
- [ ] Validação com dados reais

---

## Arquivos Gerados

| Arquivo | Conteúdo |
|---------|----------|
| `docs/audit/PANEL_AUDIT.md` | Auditoria completa + propostas + ICE |
| `docs/audit/FEATURE_BACKLOG.md` | Backlog priorizado (Fazer Agora / Próximo Ciclo / Não Fazer) |
| `docs/audit/RETENTION_OPPORTUNITIES.md` | 6 oportunidades de retenção com implementação |
| `docs/audit/UX_NOTES.md` | Problemas de UX + padrões positivos + acessibilidade |
| `docs/audit/DECISIONS.md` | 8 decisões do Product Council |
| `docs/audit/CONTEXT_PANEL.md` | Contexto para continuação entre sessões |

---

## Próximos Passos (Implementação)

### Sprint "Fazer Agora" (estimativa: 3-4 dias)

- [ ] Adicionar "Resultados" na sidebar (`sidebar.tsx` + `mobile-nav.tsx`)
- [ ] Simplificar sidebar para 5+1 itens
- [ ] Substituir dashboard fake por queries Supabase reais
- [ ] Implementar empty states progressivos no dashboard
- [ ] Ações rápidas com Links funcionais
- [ ] Remover bottom stats redundantes do dashboard
- [ ] Limpar `/painel/ds`

### Sprint "Próximo Ciclo" (estimativa: 5-7 dias)

- [ ] Alertas operacionais (grupo cheio, campanha parada)
- [ ] Seção "Desde ontem" no dashboard
- [ ] Unificar Disparos dentro de Campanhas
- [ ] Indicador de conexão WhatsApp na sidebar
- [ ] Gating no ponto de uso (limites de plano visíveis)

---

## Status

**Fase atual:** Auditoria completa ✅ → Aguardando decisão de implementação
