# Contexto: HubFlow — Painel do Lojista + Auth + Multi-tenant

## Quem sou
Sou o dev do HubFlow, um SaaS de automação de WhatsApp para lojistas. Preciso que você atue como senior fullstack focado neste domínio.

## Stack
- Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- Supabase (Auth, Postgres, RLS por tenant)
- TypeScript strict, imports com @/
- Monorepo: este código está em `apps/web/`

## Arquivos que você mexe
- `src/app/painel/**` — todas as páginas do painel do lojista
- `src/app/login/`, `src/app/signup/`, `src/app/forgot-password/`, `src/app/reset-password/`
- `src/app/api/auth/**` — login, logout, signup
- `src/app/api/campanhas/`, `src/app/api/groups/`, `src/app/api/schedules/`, `src/app/api/links/`, `src/app/api/session/`, `src/app/api/dispatch/`, `src/app/api/leads/`, `src/app/api/media/`, `src/app/api/welcome/`, `src/app/api/optout/`, `src/app/api/activity/`
- `src/lib/supabase/` — client.ts, server.ts, tenant-context.ts
- `src/lib/stores/` — Supabase stores (broadcasts, groups, schedules, tracked-links, etc)
- `src/lib/auth.ts`, `src/lib/session.ts`
- `src/lib/*-store.ts` — stores legados (campanhas, messages, leads, etc)

## Arquitetura de auth
- Login via Supabase Auth (signInWithPassword)
- Session cookie (`hf_session`) com JWT assinado server-side
- `getTenantContext(req)` resolve o tenant do usuário via tabela `memberships`
- RLS no Supabase é a camada primária de isolamento — nunca bypassar sem motivo
- Roles: owner, admin, operator

## Decisões já tomadas (não contradizer)
- Supabase RLS como isolamento multi-tenant (não middleware custom)
- Dual-mode API routes: Supabase stores primário + JSON fallback pra dev local
- Módulo mensagens com scheduling via Supabase (não Agenda.js)
- Stores migraram de JSON pra Supabase (stores/ usa supabase client)
- tenant-context.ts aceita Bearer token OU session cookie

## Convenções
- Arquivos: kebab-case. Componentes: PascalCase. Funções: camelCase
- API routes validam input server-side
- Tailwind classes utilitárias, sem CSS custom
- Componentes em `src/components/`, páginas em `src/app/`

## Estado atual
- Painel funcional: dashboard, campanhas (CRUD), grupos, disparos, agenda, contatos, biblioteca, configurações
- Auth: login/signup/logout/forgot/reset implementados
- Stores Supabase: broadcasts, groups, schedules, tracked-links migrados
- Faltam: onboarding do lojista, notificações in-app, permissões granulares por role

## Regras
- Todo endpoint que a Engine consome deve manter o contrato (não quebrar): /api/leads, /api/groups, /api/session, /api/activity, /api/welcome, /api/optout, /api/dispatch/pending, /api/dispatch/ack, /api/media/:id
- Header `x-engine-token` autentica chamadas da engine
- Nunca commitar .env.local ou secrets
