-- Conferência do PR 8 · Parte 1 do Rastreio do pedido (migração 20261108120000_rastreio_melhor_envio.sql), nos
-- DOIS bancos, depois de aplicar. Rodar de apps\web (dev pode ser pelo executor; prod é do Igor, depois do
-- migrate-prod):
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\rastreio-melhor-envio-check.sql
--
-- Existe porque o gate de drift não vê RLS, policy, ACL, CHECK nem corpo de função.
-- Tudo o que escreve fica entre begin e rollback: duas lojas falsas (TA, TB, ids 7a5c0000-…) e os pedidos e a
-- conexão delas. Cada bloco levanta 'FALHOU: …' e o script para ali. Leitura de conferência sempre num comando
-- separado da escrita (memória finding-select-na-mesma-expressao-ve-snapshot-antigo). now() é um só na transação
-- inteira: os asserts de data usam igualdade.
-- Sem erro, a última linha traz `r` com a assinatura dos objetos para a baseline (dentro da transação).
-- Antes da migração o bloco 1 falha com 'FALHOU: tabela public.melhorenvio_connections ausente' — é o RED.
--
-- Lojas: TA = 7a5c0000-0000-4000-8000-00000000000a, TB = …0b.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7a5c0000-0000-4000-8000-00000000000a', '7a5c0000-0000-4000-8000-00000000000a',
   'Check melhor envio TA', 'check-melhorenvio-7a5c-ta'),
  ('7a5c0000-0000-4000-8000-00000000000b', '7a5c0000-0000-4000-8000-00000000000b',
   'Check melhor envio TB', 'check-melhorenvio-7a5c-tb');

-- 1) Contrato: as duas tabelas com RLS e sem policy; nada para anon/authenticated (tabela e coluna);
--    service_role com SELECT/INSERT/UPDATE/DELETE; a CHECK de status.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['public.melhorenvio_connections', 'public.melhorenvio_oauth_states'] loop
    if to_regclass(v_tabela) is null then
      raise exception 'FALHOU: tabela % ausente', v_tabela;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = to_regclass(v_tabela)) then
      raise exception 'FALHOU: RLS desligado em %', v_tabela;
    end if;
    if exists (select 1 from pg_policy p where p.polrelid = to_regclass(v_tabela)) then
      raise exception 'FALHOU: % tem policy (contrato: RLS ligado e nenhuma policy)', v_tabela;
    end if;
    if has_table_privilege('anon', v_tabela, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_table_privilege('authenticated', v_tabela, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege('anon', v_tabela, 'SELECT,INSERT,UPDATE,REFERENCES')
       or has_any_column_privilege('authenticated', v_tabela, 'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'FALHOU: anon/authenticated com privilégio em %', v_tabela;
    end if;
    if not (has_table_privilege('service_role', v_tabela, 'SELECT')
               and has_table_privilege('service_role', v_tabela, 'INSERT')
               and has_table_privilege('service_role', v_tabela, 'UPDATE')
               and has_table_privilege('service_role', v_tabela, 'DELETE')) then
      raise exception 'FALHOU: service_role sem SELECT/INSERT/UPDATE/DELETE em %', v_tabela;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.melhorenvio_connections'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%ativa%reautorizar%'
  ) then
    raise exception 'FALHOU: melhorenvio_connections sem CHECK de status (ativa, reautorizar)';
  end if;
end $$;

-- 2) Constraints pelo insert direto. Cada recusa num begin … exception, para o bloco seguir.
do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  tb constant uuid := '7a5c0000-0000-4000-8000-00000000000b';
begin
  insert into public.melhorenvio_connections (tenant_id, access_token_enc, refresh_token_enc, expires_at,
                                              refresh_expires_at)
  values (ta, 'v1:selado-a', 'v1:selado-r', now() + interval '30 days', now() + interval '45 days');

  begin
    insert into public.melhorenvio_connections (tenant_id, access_token_enc, refresh_token_enc, expires_at,
                                                refresh_expires_at)
    values (ta, 'v1:x', 'v1:y', now(), now());
    raise exception 'FALHOU: TA ganhou uma segunda conexão';
  exception when unique_violation then
    null;
  end;
  begin
    insert into public.melhorenvio_connections (tenant_id, status, access_token_enc, refresh_token_enc, expires_at,
                                                refresh_expires_at)
    values (tb, 'desconectada', 'v1:x', 'v1:y', now(), now());
    raise exception 'FALHOU: status desconectada aceito';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.melhorenvio_connections (tenant_id, refresh_token_enc, expires_at, refresh_expires_at)
    values (tb, 'v1:y', now(), now());
    raise exception 'FALHOU: conexão sem access_token_enc aceita';
  exception when not_null_violation then
    null;
  end;
  begin
    insert into public.melhorenvio_oauth_states (state_hash, tenant_id, user_id, expires_at)
    values (repeat('a', 64), '7a5c0000-0000-4000-8000-0000000000ff', gen_random_uuid(), now());
    raise exception 'FALHOU: state com loja inexistente aceito';
  exception when foreign_key_violation then
    null;
  end;
end $$;

do $$
declare
  v_c public.melhorenvio_connections;
begin
  select * into v_c from public.melhorenvio_connections where tenant_id = '7a5c0000-0000-4000-8000-00000000000a';
  if v_c.status is distinct from 'ativa' or v_c.has_labels is not null or v_c.first_pass_at is not null
     or v_c.last_check_at is not null or v_c.created_at is distinct from now()
     or v_c.updated_at is distinct from now() then
    raise exception 'FALHOU: conexão nova de TA = %', row_to_json(v_c);
  end if;
end $$;

-- 3) A regra no marco. O1 e O2 em enviado; X = duas horas atrás.
insert into public.tracking_orders (tenant_id, external_id, numero, order_created_at, status_raw, etapa)
values ('7a5c0000-0000-4000-8000-00000000000a', 'chk-m1', '4001', now(), 'on_carriage', 'enviado'),
       ('7a5c0000-0000-4000-8000-00000000000a', 'chk-m2', '4002', now(), 'on_carriage', 'enviado');

do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  x  constant timestamptz := now() - interval '2 hours';
  o1 uuid := (select id from public.tracking_orders where tenant_id = ta and external_id = 'chk-m1');
  r  jsonb;
begin
  r := public.rastreio_gravar_marco(ta, o1, 'entregue', x, 'melhorenvio:delivered');
  if (r->>'mudou')::boolean is not true or r->>'etapa_anterior' is distinct from 'enviado'
     or r->>'etapa' is distinct from 'entregue' or (r->>'id')::uuid is distinct from o1
     or r->>'link_token' !~ '^[0-9a-f]{32}$' or (r->>'tem_telefone')::boolean is not false
     or (r->>'tem_email')::boolean is not false or not (r ? 'notices_stopped_at') then
    raise exception 'FALHOU: primeiro marco de O1 = %', r;
  end if;
end $$;

do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  x  constant timestamptz := now() - interval '2 hours';
  v_o public.tracking_orders;
begin
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-m1';
  if v_o.etapa is distinct from 'entregue' or v_o.etapa_at is distinct from x
     or v_o.status_raw is distinct from 'melhorenvio:delivered'
     or v_o.purge_after is distinct from x + interval '90 days'
     or v_o.events -> -1 is distinct from jsonb_build_object('etapa', 'entregue', 'at', x)
     or jsonb_array_length(v_o.events) <> 1 then
    raise exception 'FALHOU: O1 depois do marco = %', row_to_json(v_o);
  end if;
end $$;

do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  x  constant timestamptz := now() - interval '2 hours';
  o1 uuid := (select id from public.tracking_orders where tenant_id = ta and external_id = 'chk-m1');
  r  jsonb;
begin
  r := public.rastreio_gravar_marco(ta, o1, 'entregue', x, 'melhorenvio:delivered');
  if (r->>'mudou')::boolean is not false or r->>'etapa' is distinct from 'entregue' then
    raise exception 'FALHOU: marco repetido em O1 = %', r;
  end if;
  -- Mutante do spec §8: problema lido depois de entregue não leva a etapa para trás.
  r := public.rastreio_gravar_marco(ta, o1, 'problema', now(), 'melhorenvio:paused');
  if (r->>'mudou')::boolean is not false or r->>'etapa' is distinct from 'entregue'
     or r->>'etapa_anterior' is distinct from 'entregue' then
    raise exception 'FALHOU: problema sobre entregue em O1 = %', r;
  end if;
end $$;

do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  x  constant timestamptz := now() - interval '2 hours';
  v_o public.tracking_orders;
begin
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-m1';
  if v_o.etapa is distinct from 'entregue' or v_o.etapa_at is distinct from x
     or v_o.status_raw is distinct from 'melhorenvio:delivered' or jsonb_array_length(v_o.events) <> 1 then
    raise exception 'FALHOU: O1 mudou com marco repetido ou atrasado = %', row_to_json(v_o);
  end if;
end $$;

do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  o2 uuid := (select id from public.tracking_orders where tenant_id = ta and external_id = 'chk-m2');
  r  jsonb;
begin
  r := public.rastreio_gravar_marco(ta, o2, 'problema', now() + interval '1 day', 'melhorenvio:undelivered');
  if (r->>'mudou')::boolean is not true or r->>'etapa' is distinct from 'problema' then
    raise exception 'FALHOU: problema em O2 = %', r;
  end if;
end $$;

do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  v_o public.tracking_orders;
  r  jsonb;
begin
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-m2';
  if v_o.etapa is distinct from 'problema' or v_o.etapa_at is distinct from now() or v_o.purge_after is not null
     or v_o.status_raw is distinct from 'melhorenvio:undelivered' then
    raise exception 'FALHOU: O2 com data futura = %', row_to_json(v_o);
  end if;
  r := public.rastreio_gravar_marco(ta, v_o.id, 'entregue', now(), 'melhorenvio:delivered');
  if (r->>'mudou')::boolean is not true or r->>'etapa_anterior' is distinct from 'problema' then
    raise exception 'FALHOU: problema não andou para entregue em O2 = %', r;
  end if;
end $$;

-- 4) Recusas e isolamento por loja.
do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  tb constant uuid := '7a5c0000-0000-4000-8000-00000000000b';
  o1 uuid := (select id from public.tracking_orders where tenant_id = ta and external_id = 'chk-m1');
  v_sig constant text := 'public.rastreio_gravar_marco(uuid, uuid, text, timestamptz, text)';
  v_args text[];
  r  jsonb;
begin
  r := public.rastreio_gravar_marco(tb, o1, 'problema', now(), 'melhorenvio:paused');
  if r is not null then
    raise exception 'FALHOU: TB gravou marco no pedido de TA = %', r;
  end if;
  r := public.rastreio_gravar_marco(ta, gen_random_uuid(), 'entregue', now(), 'melhorenvio:delivered');
  if r is not null then
    raise exception 'FALHOU: pedido inexistente devolveu %', r;
  end if;

  foreach v_args slice 1 in array array[
    array['enviado', 'melhorenvio:delivered', 'o'],
    array['entregue', 'delivered', 'o'],
    array['entregue', 'melhorenvio:Delivered', 'o'],
    array['entregue', 'melhorenvio:delivered', 'null']
  ] loop
    begin
      perform public.rastreio_gravar_marco(ta, case when v_args[3] = 'o' then o1 end, v_args[1], now(), v_args[2]);
      raise exception 'FALHOU: aceito %', v_args;
    exception when raise_exception then
      if sqlerrm like 'FALHOU:%' then raise; end if;
    end;
  end loop;

  if has_function_privilege('anon', v_sig, 'execute') or has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'FALHOU: anon/authenticated executam rastreio_gravar_marco';
  end if;
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'FALHOU: service_role não executa rastreio_gravar_marco';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_sig::regprocedure and p.prosecdef
                   and p.proconfig @> array['search_path=public, app']) then
    raise exception 'FALHOU: rastreio_gravar_marco sem security definer e search_path fixo';
  end if;
end $$;

do $$
declare
  v_o public.tracking_orders;
begin
  select * into v_o from public.tracking_orders
   where tenant_id = '7a5c0000-0000-4000-8000-00000000000a' and external_id = 'chk-m1';
  if v_o.etapa is distinct from 'entregue' or v_o.status_raw is distinct from 'melhorenvio:delivered'
     or jsonb_array_length(v_o.events) <> 1 then
    raise exception 'FALHOU: O1 mudou numa recusa = %', row_to_json(v_o);
  end if;
end $$;

-- Assinaturas para a baseline (dentro da transação, para aparecer também no dry-run).
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature() where nome like 'melhorenvio\_%' or nome like 'rastreio_gravar_marco(%';
rollback;
