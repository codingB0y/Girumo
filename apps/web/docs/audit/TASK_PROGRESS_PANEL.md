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
- [x] Implementação Caminho A — Sprint 1
- [ ] Validação com dados reais

---

## Implementação Caminho A

- [x] Simplificar sidebar para 5+1 itens (Início, Campanhas, Grupos, Contatos, Resultados + Configurações)
- [x] Simplificar mobile-nav (bottom bar: Início, Campanhas, Grupos, Resultados + Mais)
- [x] Dashboard com dados reais (consome /api/groups, /api/campanhas, /api/links, /api/leads, /api/session)
- [x] Empty states progressivos (3 estágios: conectar → campanha → compartilhar)
- [x] Ações rápidas com Links funcionais
- [x] Remover bottom stats redundantes do dashboard
- [x] Alerta de grupo quase cheio no dashboard
- [x] Highlight "novos contatos hoje"
- [x] Build passa sem erros ✅
- [ ] Remover `/painel/ds` (pendente confirmação)
- [ ] Remover `animated-number.tsx` (não mais usado)

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|--------|
| `src/components/painel/sidebar.tsx` | Reduzido de 4 seções/13 itens para 5+1 itens flat |
| `src/components/painel/mobile-nav.tsx` | Bottom bar com 4+Mais, drawer com 6 itens |
| `src/app/painel/page.tsx` | Dashboard completo com dados reais + onboarding progressivo |

---

## Arquivos Gerados (Auditoria)

| Arquivo | Conteúdo |
|---------|----------|
| `docs/audit/PANEL_AUDIT.md` | Auditoria completa + propostas + ICE |
| `docs/audit/FEATURE_BACKLOG.md` | Backlog priorizado |
| `docs/audit/RETENTION_OPPORTUNITIES.md` | 6 oportunidades de retenção |
| `docs/audit/UX_NOTES.md` | Problemas + padrões positivos |
| `docs/audit/DECISIONS.md` | 8 decisões do Product Council |
| `docs/audit/CONTEXT_PANEL.md` | Contexto para continuação |

---

## Próximos Passos

### Limpeza (5 min)
- [ ] Deletar `src/components/painel/animated-number.tsx`
- [ ] Deletar `src/app/painel/ds/page.tsx`

### Próximo Ciclo
- [ ] Alertas operacionais via Realtime (grupo cheio, campanha parada)
- [ ] Seção "Desde ontem" no dashboard (delta diário)
- [ ] Unificar Disparos dentro de Campanhas
- [ ] Indicador de conexão WhatsApp na sidebar (badge verde/vermelho)
- [ ] Gating no ponto de uso (limites de plano visíveis)

---

## Status

**Fase atual:** Caminho A implementado ✅ → Limpeza pendente
