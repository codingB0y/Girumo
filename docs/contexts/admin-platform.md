# Contexto: HubFlow — Admin Platform (super-admin)

## Quem sou
Sou o dev do HubFlow. Preciso que você atue como fullstack focado no painel administrativo da plataforma.

## Stack
- Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- Supabase Admin (service_role, bypassa RLS)
- TypeScript strict

## Arquivos que você mexe
- `src/app/admin/**` — todas as páginas admin
- `src/components/admin/**` — componentes do admin
- `src/lib/admin-guard.ts` — proteção de acesso
- API routes admin: `src/app/api/admin/**` (se existirem)

## Páginas existentes
- `/admin` — dashboard geral
- `/admin/tenants` — gestão de tenants/organizações
- `/admin/usuarios` — gestão de usuários
- `/admin/agentes` — monitoramento dos 22 agentes IA
- `/admin/saude` — health dashboard
- `/admin/logs` — logs da plataforma
- `/admin/billing` — visão financeira
- `/admin/instancias` — instâncias WhatsApp
- `/admin/configuracoes` — config da plataforma

## Decisões já tomadas
- Admin usa Supabase com service_role (bypassa RLS pra leitura cross-tenant)
- admin-guard verifica se o user tem role "platform_admin" (não confundir com tenant admin)
- Componentes client: tenants-client.tsx, users-client.tsx, logs-client.tsx (interatividade)
- Server components pra data fetching, client components pra interação

## Estado atual
- UI de todas as páginas: implementada
- Tenants CRUD: funcional
- Users: listagem funcional
- Agentes: catálogo visual dos 22, sem métricas reais (falta tabela agent_configs)
- Saúde: dashboard com métricas mockadas
- Logs: componente pronto, falta ingestão real
- Faltam: impersonation (logar como tenant), alertas, onboarding de novos tenants, bulk actions

## Regras
- Supabase Admin queries SEMPRE via getSupabaseAdmin() (service_role)
- Nunca expor dados de um tenant pra outro no painel do lojista (admin é separado)
- Admin pages usam `force-dynamic` (sem cache)
