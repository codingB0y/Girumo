-- Conferência da migração 20261017120500_engine_events_indice_instancia.sql, nos DOIS bancos.
-- Só lê: não grava nada.
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\engine-events-indice-instancia-check.sql
--
-- Esperado: termina sem erro (exit 0). Rodado ANTES de aplicar a migração, levanta
-- 'FALHOU índice' (é a prova de que a conferência pega a falta dela).
--
-- Existe porque o gate de drift não vê índice.
--
-- O plano é conferido com seq scan desligado: prova que a subquery de app.instance_health casa
-- com o índice mesmo no dev, onde engine_events fica quase vazia e o planejador prefere Seq Scan.
-- Em prod a escolha deve ser natural (o índice de mesmo formato (tenant_id, type, created_at desc)
-- já é escolhido sem forçar): conferir rodando o mesmo explain sem o set_config.

do $$
declare
  v_line text;
  v_plan text := '';
begin
  if not exists (
    select 1
    from pg_index x
    where x.indexrelid = to_regclass('public.engine_events_instance_created_idx')
      and x.indrelid = 'public.engine_events'::regclass
      and x.indisvalid
      and pg_get_indexdef(x.indexrelid) like '%(instance_id, created_at DESC)'
  ) then
    raise exception 'FALHOU índice: public.engine_events_instance_created_idx (instance_id, created_at desc) ausente ou inválido (migração não aplicada aqui)';
  end if;

  perform set_config('enable_seqscan', 'off', true);
  for v_line in execute
    'explain select max(e.created_at) from public.engine_events e '
    || 'where e.instance_id = ''00000000-0000-4000-8000-000000000000''::uuid'
  loop
    v_plan := v_plan || v_line || E'\n';
  end loop;
  if position('engine_events_instance_created_idx' in v_plan) = 0 then
    raise exception E'FALHOU plano: o max(created_at) por instance_id não usa o índice:\n%', v_plan;
  end if;
end $$;
