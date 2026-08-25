# GetTenantContext

**Type:** method

A function that retrieves tenant and authentication context from a request object.<SEP>A single layer responsible for validating sessions, resolving users and active tenants, validating memberships, returning roles, blocking tenants without users, and providing context for RLS.<SEP>A function that retrieves the tenant context using Authorization headers or session cookies.<SEP>GetTenantContext is a function that runs in Node with database access to perform session revocation checks.

## Neighbors
- [[supabase|Supabase]]
- [[stripe|Stripe]]
- [[get|GET]]
- [[request|Request]]
- [[tenantcontext|TenantContext]]
- [[sessionuser|SessionUser]]
- [[policy-padrao|Policy Padrao]]
- [[apps-web-src-lib-supabase-tenant-contextts|Apps/Web/Src/Lib/Supabase/Tenant-Context.ts]]
- [[publicsession_revocations|Public.Session_Revocations]]

## Appears in
- `apps » web » src » app » api » auth » me » route.ts`
- `docs » FASE_2_PLANO_DE_MIGRACAO.md`
- `docs » FASE_1_AUDITORIA_CODIGO_ATUAL.md`
- `decisao-2026-08-19-revogacao-verificada-em-prod`
