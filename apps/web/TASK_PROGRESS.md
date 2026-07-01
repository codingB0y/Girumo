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
4. Criar API route GET/PATCH /api/notifications
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
22. Criar página /painel/agenda
23. Permitir criar schedule clicando no dia

## Fase 8 — Webhook WhatsApp para lojista
24. Criar configuração de webhook por tenant
25. Disparar notificação WhatsApp em eventos (grupo lotou, lead quente)

**Total: 25 itens**

---

# Checklist

## Fase 1 — Toast system
- [x] 1. Criar componente Toast global — JÁ EXISTIA (`components/toast.tsx`)
- [x] 2. Integrar no layout do painel — adicionado ToastProvider no `painel/layout.tsx`

## Fase 2 — Notificações in-app
- [x] 3. Migration SQL notifications — `infra/migrations/202607010010_notifications.sql`
- [x] 4. API route /api/notifications — GET (listar) + PATCH (mark-as-read)
- [x] 5. Componente NotificationBell — com polling 30s, dropdown, badge de contagem
- [x] 6. Dropdown com mark-as-read — individual + marcar todas

## Fase 3 — Permissões por role
- [x] 7. Helper hasPermission(role, action) — `src/lib/permissions.ts`
- [x] 8. Proteger ações sensíveis — billing:manage (owner only), team:remove, campaign:delete, account:delete
- [x] 9. Esconder UI por role — RoleProvider + useRole hook no layout

## Fase 4 — Página de conta
- [x] 10. Editar nome — API PATCH /api/auth/account
- [x] 11. Editar email — via Supabase Auth admin
- [x] 12. Alterar senha — via Supabase Auth admin
- [x] 13. Deletar conta — DELETE /api/auth/account (owner only, com confirmação)

## Fase 5 — Empty states
- [x] 14. Componente EmptyState reutilizável criado
- [x] 15. Aplicado em disparos
- [x] 16. Aplicado em agenda
- [ ] 17. Aplicar em grupos, campanhas, contatos, resultados (pendente integração nas páginas existentes)

## Fase 6 — Histórico de disparos
- [x] 18. API /api/broadcasts/history
- [x] 19. Página /painel/disparos
- [x] 20. UI: campanha, grupos, data, status, KPIs, filtros

## Fase 7 — Agendamento visual
- [x] 21. Componente calendário semanal (inline na página)
- [x] 22. Página /painel/agenda com navegação entre semanas
- [x] 23. Botão + em dias vazios → /painel/campanhas/nova

## Fase 8 — Webhook WhatsApp
- [x] 24. Config webhook por tenant — migration + API PUT/GET /api/webhooks/config
- [x] 25. Helper notifyTenant() — cria notificação in-app + dispara via engine se webhook ativo

---

# Em andamento

- [ ] 17. Integrar EmptyState nas páginas existentes (grupos, campanhas, contatos, resultados)

---

# Decisões

| # | Decisão | Motivo |
|---|---------|--------|
| 1 | Toast já existia, só integrar | Não duplicar código |
| 2 | NotificationBell com polling 30s | SSE/WebSocket seria overengineering agora |
| 3 | RoleProvider carrega via /api/auth/me | Simples, um fetch, sem cookie parsing client |
| 4 | Permissões como map Action→Role[] | Fácil de estender, sem overhead |
| 5 | Account delete só owner | Evitar operator/admin deletar conta do tenant |
| 6 | notifyTenant() é dual | Sempre cria in-app, opcionalmente envia WhatsApp |
| 7 | Webhook usa engine via HTTP | Engine já tem infra de envio, não duplicar |

---

# Arquivos alterados

| Arquivo | Tipo | Mudança |
|---------|------|--------|
| `apps/web/src/app/painel/layout.tsx` | EDITADO | +ToastProvider, +RoleProvider |
| `apps/web/src/components/painel/topbar.tsx` | EDITADO | Bell estático → NotificationBell |
| `apps/web/src/components/painel/notification-bell.tsx` | NOVO | Dropdown de notificações |
| `apps/web/src/components/painel/role-provider.tsx` | NOVO | Context de permissões |
| `apps/web/src/components/painel/account-section.tsx` | NOVO | UI completa de conta |
| `apps/web/src/components/painel/empty-state.tsx` | NOVO | Componente reutilizável |
| `apps/web/src/lib/permissions.ts` | NOVO | hasPermission, Action types |
| `apps/web/src/lib/notify-tenant.ts` | NOVO | Dual notification (in-app + WhatsApp) |
| `apps/web/src/app/api/notifications/route.ts` | NOVO | GET + PATCH notificações |
| `apps/web/src/app/api/auth/me/route.ts` | NOVO | Retorna role/tenant do user logado |
| `apps/web/src/app/api/auth/account/route.ts` | NOVO | GET/PATCH/DELETE conta |
| `apps/web/src/app/api/broadcasts/history/route.ts` | NOVO | Histórico de disparos |
| `apps/web/src/app/api/webhooks/config/route.ts` | NOVO | Config webhook por tenant |
| `apps/web/src/app/painel/disparos/page.tsx` | NOVO | Página de histórico de disparos |
| `apps/web/src/app/painel/agenda/page.tsx` | NOVO | Calendário semanal de agendamentos |
| `infra/migrations/202607010010_notifications.sql` | NOVO | Tabela notifications |
| `infra/migrations/202607010011_tenant_webhooks.sql` | NOVO | Tabela tenant_webhooks |

---

# Próximos passos

1. Integrar EmptyState nas páginas existentes (grupos, campanhas, contatos, resultados)
2. Adicionar link "Disparos" e "Agenda" na sidebar do painel
3. Usar AccountSection na seção "Conta" de /painel/configuracoes
4. Rodar migrations no Supabase
5. Testar fluxo completo no browser
