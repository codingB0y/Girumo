-- HUBFLOW - RLS smoke check
-- Execute no SQL Editor do Supabase apos aplicar migrations/seeds.
-- Troque os UUIDs abaixo por dois usuarios reais de tenants diferentes.
--
-- Objetivo:
-- 1. Simular auth.uid() do usuario A.
-- 2. Confirmar que usuario A enxerga apenas o tenant A.
-- 3. Repetir para usuario B.

begin;

-- select set_config('request.jwt.claim.sub', '<AUTH_USER_ID_A>', true);
-- select auth.uid() as simulated_user_a;
-- select tenant_id, role from public.memberships order by created_at;
-- select id, tenant_id, name from public.organizations order by created_at;
-- select tenant_id, email from public.users order by created_at;
-- select tenant_id, status from public.subscriptions order by created_at;

-- select set_config('request.jwt.claim.sub', '<AUTH_USER_ID_B>', true);
-- select auth.uid() as simulated_user_b;
-- select tenant_id, role from public.memberships order by created_at;
-- select id, tenant_id, name from public.organizations order by created_at;
-- select tenant_id, email from public.users order by created_at;
-- select tenant_id, status from public.subscriptions order by created_at;

rollback;
