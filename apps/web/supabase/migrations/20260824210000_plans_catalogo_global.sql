-- A.4 da auditoria de 22/08/2026 — `plans` e servida sem filtro de tenant.
--
-- A conclusao, depois de conferir o dado: **isso esta certo**. `plans` e catalogo
-- global; as 4 linhas pertencem a uma organizacao sentinela ("HUBFLOW System") e
-- valem para todos. Filtrar por `tenant_id` devolveria lista vazia para as 21
-- organizacoes de producao e quebraria o checkout.
--
-- A metade estrutural do fix ja existia nos dois bancos (`plans_code_unique`,
-- UNIQUE (code)). O que faltava era a intencao escrita em algum lugar: sem isso,
-- a proxima auditoria — ou a proxima pessoa aplicando a regra geral do projeto,
-- que e "toda tabela com tenant_id precisa do filtro explicito" — "conserta" a
-- rota e derruba o checkout.

comment on table public.plans is
  'Catalogo GLOBAL de planos, nao particionado por tenant. As linhas pertencem a uma organizacao sentinela e valem para todas as organizacoes: consultas devem filtrar por code/active, NUNCA por tenant_id. A unicidade que importa e plans_code_unique (code). Servida por GET /api/plans e lida pelo checkout.';

comment on column public.plans.tenant_id is
  'Organizacao sentinela dona do catalogo, nao o tenant que assina o plano. Nao usar como filtro: quem assina o que vive em subscriptions.tenant_id.';

-- Idempotente: a constraint ja existe nos dois bancos desde antes desta migracao;
-- o bloco esta aqui para o caso de um banco novo ser levantado do zero.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.plans'::regclass and conname = 'plans_code_unique'
  ) then
    alter table public.plans add constraint plans_code_unique unique (code);
  end if;
end $$;
