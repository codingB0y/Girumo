# Decisão (2026-07-29): reconstrução de tabelas base perdidas em produção durante a integração P0–P2

## Contexto

Ao integrar 8 PRs do roadmap (P1.8, P1.9, P1.10, P1.11/1.12, P1.14, P1.15, P2.17, P2.18) num único branch (`claude/integration-p0-p2`, PR #39) e preparar o deploy, foi detectado drift entre os dois projetos Supabase:

- **dev** = `wfjuwogxaupyadwhvoxy`
- **prod** = `nidoatbxaylrkcgbszns` (hubflow-production)

O prod tinha as migrations `funnel_events` (20260701020000) e `testimonials` (20260701040000) **registradas** no histórico (`supabase_migrations.schema_migrations`), mas as **tabelas não existiam fisicamente**. Nenhuma migration versionada dropa essas tabelas — a remoção veio de fora do versionamento (SQL manual ou reset de branch que perdeu o schema mas manteve o histórico).

## Decisão

Reconstruir as tabelas base faltantes (`funnel_events`, `testimonials`) diretamente em prod, rodando o DDL de origem (que é `create table if not exists`, idempotente) via `execute_sql` — **sem registrar novo histórico**, já que o histórico já as dava como aplicadas. Em seguida aplicar as 5 novas migrations da integração via `apply_migration` (essas sim entram no histórico do prod), validar o schema, e só então fazer o merge do PR #39 → `main` (deploy prod).

## Racional

- O drift é artefato de sincronização, não decisão de produto: o código no `main` já depende dessas tabelas (funnel tracking, testimonials na landing).
- Tabelas estavam vazias/inexistentes → recriar não destrói dado.
- DDL idempotente → seguro re-rodar.
- Ordem migrations-antes-do-merge é obrigatória porque `main`→Vercel faz deploy de produção; mergear o código antes do schema causaria erro em runtime (ex.: insert em `orders` com coluna `campaign_id` inexistente).

## Migrations da integração (aplicadas em dev e prod)

1. `20260728140000_tenant_settings` — cria/completa `tenant_settings` (`monthly_goal_contacts`, `monthly_goal_revenue`, `weekly_report_enabled`, `created_at`, `updated_at`) + RLS `app.user_tenant_ids()` + trigger `app.set_updated_at()`.
2. `20260729120000_funnel_events_user_optional` — `funnel_events.user_id` passa a nullable (marcos disparados pela engine não têm usuário logado).
3. `20260729140000_playbook_progress` — tabela do checklist "Primeiros 30 dias" (P1.8), PK `(tenant_id, step_key)`, RLS padronizada.
4. `20260729150000_orders_campaign_id` — `orders.campaign_id` uuid nullable + índice `idx_orders_campaign` (atribuição de R$ por campanha, P2.18).
5. `20260729160000_celebrations_and_testimonial_consent` — tabela `celebrations` (dedupe de marcos) + `testimonials.consent_public` boolean default false.

## Aprendizado / runbook

- **SEMPRE verificar drift real** (schema físico via `information_schema`/`to_regclass`, não só o histórico de migrations) em dev **E** prod antes de aplicar migrations que dependem de tabelas base.
- O histórico de migrations do Supabase pode divergir do schema físico após reset de branch ou DDL manual. `list_migrations` mente; confie em `to_regclass`/`information_schema`.
- Produção estava marcada NO-GO por causa desse tipo de inconsistência — confirmado.
- `git` duplica silenciosamente funções idênticas adicionadas em dois branches no auto-merge (ocorreu com `countLeads` em `stores/leads.ts`, vindo de #31 e #36) — verificar com `grep -c` após cada merge.

## Resultado

PR #39 mergeado em `main`; os 8 PRs originais fechados como merged. dev e prod com schema alinhado e validado (tabelas, colunas, RLS, policies, nullable).
