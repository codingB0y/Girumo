# CONTEXT_ADMIN.md — Squad Admin HubFlow

## Objetivo atual
Manter e evoluir a área `/admin` — painel super-admin da plataforma multi-tenant.

## Arquitetura atual
- **Framework:** Next.js 15 (App Router) + React 19 + Tailwind CSS
- **Auth:** Super-admin via lista de emails em `PLATFORM_ADMIN_EMAILS` env var
- **Guard:** `requireAdmin()` em `src/lib/admin-guard.ts` — verifica cookie de sessão + email na whitelist
- **Layout:** `src/app/admin/layout.tsx` — server component, verifica admin antes de renderizar
- **Sidebar:** `src/components/admin/sidebar.tsx` — client component com seções Plataforma/Financeiro/Sistema
- **Backend:** Supabase Admin client (service_role) para queries cross-tenant
- **DB:** Supabase Postgres com RLS — admin bypassa RLS via service_role key

## Funcionalidades prontas
- [x] Dashboard (`/admin`) — KPIs, alertas inadimplentes, instâncias offline, quick actions
- [x] Tenants (`/admin/tenants`) — listagem com filtros, busca, sort
- [x] Tenant detalhe (`/admin/tenants/[id]`) — informações do org
- [x] Usuários (`/admin/usuarios`) — listagem com filtros, busca, export CSV
- [x] Instâncias (`/admin/instancias`) — monitoramento de sessões WhatsApp
- [x] Agentes IA (`/admin/agentes`) — status dos 22 agentes por categoria
- [x] Billing (`/admin/billing`) — visão financeira
- [x] Logs (`/admin/logs`) — filtro level/tenant, busca, export CSV
- [x] Saúde (`/admin/saude`) — consome /api/health, mostra status visual
- [x] Funil (`/admin/funil`) — métricas de conversão analytics
- [x] Configurações (`/admin/configuracoes`) — settings da plataforma

## Decisões tomadas
- Admin auth por email whitelist (não por role em DB) — simplicidade fase 1
- Admin usa Supabase service_role (bypassa RLS) — necessário pra queries cross-tenant
- Sidebar usa cor `alerta` (vermelho) pra distinguir de painel tenant (iris/roxo)
- Client components separados em `src/components/admin/` pra interatividade
- Dados carregados server-side via Supabase Admin quando possível

## Componentes existentes
- `AdminSidebar` — sidebar com 3 seções e 10 rotas
- `AdminTopbar` — topbar minimalista
- `AdminStatCard` — card reutilizável pra KPIs
- `AdminTenantsClient` — tabela interativa de tenants
- `AdminUsersClient` — tabela interativa de usuários
- `AdminLogsClient` — tabela interativa de logs

## Fluxos
1. Usuário acessa `/admin` → layout chama `requireAdmin()` → verifica cookie + email
2. Se não-admin → redirect `/login?next=/admin`
3. Se admin → renderiza layout com sidebar + conteúdo
4. Cada página busca dados via `getSupabaseAdmin()` (service_role)

## Arquivos importantes
```
src/app/admin/layout.tsx              — layout principal
src/app/admin/page.tsx                — dashboard
src/app/admin/tenants/page.tsx        — lista tenants
src/app/admin/tenants/[id]/page.tsx   — detalhe tenant
src/app/admin/usuarios/page.tsx       — lista usuários
src/app/admin/instancias/page.tsx     — instâncias WhatsApp
src/app/admin/agentes/page.tsx        — agentes IA
src/app/admin/billing/page.tsx        — billing
src/app/admin/logs/page.tsx           — logs
src/app/admin/saude/page.tsx          — health
src/app/admin/funil/page.tsx          — funnel analytics
src/app/admin/configuracoes/page.tsx  — configurações
src/components/admin/sidebar.tsx      — sidebar nav
src/components/admin/topbar.tsx       — topbar
src/components/admin/stat-card.tsx    — stat card
src/components/admin/tenants-client.tsx — tenants table
src/components/admin/users-client.tsx — users table
src/components/admin/logs-client.tsx  — logs table
src/lib/admin-guard.ts               — auth guard
```

## Dependências
- `@/lib/supabase/server` → `getSupabaseAdmin()`
- `@/lib/auth` → `SESSION_COOKIE`, `verifySession()`
- `@/lib/utils` → `cn()` (className merge)
- `lucide-react` → ícones
- `next/navigation` → routing
- Supabase tables: `organizations`, `users`, `memberships`, `subscriptions`, `plans`, `instances`, `logs`, `agent_configs`

## Pendências
- [ ] Funil: página usa `getFunnelMetrics()` — verificar se está funcional
- [ ] Dashboard: alertas dependem de dados reais (ainda poucos tenants)
- [ ] Tenant detalhe: ações (suspender, excluir) são placeholder
- [ ] Billing: integração real com dados Stripe (subscriptions)
- [ ] Configurações: campos editáveis (atualmente readonly)
- [ ] Agentes: depende de tabela `agent_configs` populada
- [ ] Mobile: admin não tem navegação mobile (só desktop sidebar)

## Próximos passos
1. Auditar cada página pra botões/ações não-funcionais
2. Tornar ações do tenant detalhe funcionais (suspender/ativar)
3. Completar billing com dados reais do Stripe
4. Adicionar navegação mobile ao admin

## Como continuar em outro chat
```
Leia CONTEXT_ADMIN.md e TASK_PROGRESS_ADMIN.md.
Continue exatamente do estado salvo.
Não releia o projeto. Escopo: apenas /admin.
```

## Última atualização
2026-07-01T09:30:00Z — Inicialização do contexto
