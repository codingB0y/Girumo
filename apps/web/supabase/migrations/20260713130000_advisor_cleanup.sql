-- Advisor cleanup: pre-existing security debt surfaced by get_advisors.
-- NÃO faz parte da F0 (a F0 não introduziu nenhum destes) — é limpeza da
-- dívida que já existia no schema antes da migração Evolution.
--
-- Corrige dois lints:
--   0011 function_search_path_mutable  -> fixa search_path nas funções antigas
--   0028/0029 *_security_definer_function_executable -> revoga EXECUTE de
--             anon/authenticated nas funções SECURITY DEFINER que só devem
--             rodar server-side (chamadas via service_role no app).
--
-- Robusto a divergência de ambiente: dev não tem app.is_system_tenant nem
-- public.increment_automation_runs; os blocos usam lookup em pg_proc e só
-- agem sobre o que existe. Rodar duas vezes é inócuo.

-- ============================================================
-- 1) search_path imutável (0011)
-- ============================================================

do $$
declare
  fn record;
  targets text[][] := array[
    array['app', 'set_updated_at'],
    array['app', 'set_organization_tenant_id'],
    array['app', 'current_user_id'],
    array['app', 'is_system_tenant'],
    array['public', 'increment_template_uses'],
    array['public', 'increment_automation_runs'],
    array['public', 'increment_lp_counter']
  ];
  pair text[];
begin
  foreach pair slice 1 in array targets loop
    for fn in
      select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = pair[1] and p.proname = pair[2]
    loop
      execute format('alter function %s set search_path = public', fn.sig);
    end loop;
  end loop;
end;
$$;

-- ============================================================
-- 2) Revogar EXECUTE de anon/authenticated nas SECURITY DEFINER
--    server-side (0028/0029). service_role mantém o acesso.
-- ============================================================

do $$
declare
  fn record;
  targets text[][] := array[
    array['public', 'increment_template_uses'],
    array['public', 'increment_automation_runs'],
    array['public', 'increment_lp_counter'],
    array['public', 'rls_auto_enable']
  ];
  pair text[];
begin
  foreach pair slice 1 in array targets loop
    for fn in
      select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = pair[1] and p.proname = pair[2]
    loop
      execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
      execute format('grant execute on function %s to service_role', fn.sig);
    end loop;
  end loop;
end;
$$;
