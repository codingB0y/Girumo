# Objetivo

Implementar melhorias no Painel do Lojista focando em retenção e funcionalidade básica esperada de um SaaS:
1. Notificações in-app
2. Permissões granulares por role
3. Página de conta completa
4. Empty states com CTAs
5. Feedback de ações (toasts)
6. Histórico de disparos
7. Agendamento visual (calendário)
8. Webhook de notificação WhatsApp

# Plano

## Fase 1 — Toast/Feedback system (base pra tudo)
1. Criar componente Toast global
2. Integrar no layout do painel

## Fase 2 — Notificações in-app
3. Criar tabela notifications no Supabase (migration SQL)
4. Criar API route GET/POST /api/notifications
5. Criar componente NotificationBell no topbar
6. Criar dropdown de notificações com mark-as-read

## Fase 3 — Permissões por role
7. Criar helper `hasPermission(role, action)` 
8. Proteger ações sensíveis (billing, delete campaign, team management)
9. Esconder UI de ações não permitidas por role

## Fase 4 — Página de conta completa
10. Editar nome
11. Editar email (com confirmação)
12. Alterar senha
13. Deletar conta (com confirmação)

## Fase 5 — Empty states
14. Grupos: CTA para conectar WhatsApp
15. Campanhas: CTA para criar primeira
16. Contatos: CTA para criar campanha e captar
17. Resultados: CTA para disparar

## Fase 6 — Histórico de disparos
18. Criar API route GET /api/broadcasts/history
19. Criar página /painel/disparos com listagem
20. Mostrar: campanha, grupos, data, status, quantidade

## Fase 7 — Agendamento visual
21. Criar componente calendário semanal
22. Integrar na página de campanhas ou criar /painel/agenda
23. Permitir criar schedule clicando no dia

## Fase 8 — Webhook WhatsApp para lojista
24. Criar configuração de webhook por tenant
25. Disparar notificação WhatsApp em eventos (grupo lotou, lead quente)

**Total: 25 itens**

---

# Checklist

## Fase 1 — Toast system
- [ ] 1. Criar componente Toast global
- [ ] 2. Integrar no layout do painel

## Fase 2 — Notificações in-app
- [ ] 3. Migration SQL notifications
- [ ] 4. API route /api/notifications
- [ ] 5. Componente NotificationBell
- [ ] 6. Dropdown com mark-as-read

## Fase 3 — Permissões por role
- [ ] 7. Helper hasPermission(role, action)
- [ ] 8. Proteger ações sensíveis
- [ ] 9. Esconder UI por role

## Fase 4 — Página de conta
- [ ] 10. Editar nome
- [ ] 11. Editar email
- [ ] 12. Alterar senha
- [ ] 13. Deletar conta

## Fase 5 — Empty states
- [ ] 14. Grupos empty state
- [ ] 15. Campanhas empty state
- [ ] 16. Contatos empty state
- [ ] 17. Resultados empty state

## Fase 6 — Histórico de disparos
- [ ] 18. API /api/broadcasts/history
- [ ] 19. Página /painel/disparos
- [ ] 20. UI: campanha, grupos, data, status

## Fase 7 — Agendamento visual
- [ ] 21. Componente calendário semanal
- [ ] 22. Página /painel/agenda
- [ ] 23. Criar schedule ao clicar no dia

## Fase 8 — Webhook WhatsApp
- [ ] 24. Config webhook por tenant
- [ ] 25. Disparar em eventos

---

# Em andamento

(nenhum)

---

# Decisões

(nenhuma ainda)

---

# Arquivos alterados

(nenhum ainda)

---

# Próximos passos

Iniciar Fase 1: criar sistema de Toast global.
