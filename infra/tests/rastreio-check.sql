-- Conferência do PR 1 do Rastreio do pedido (migração 20261031120000_rastreio_pedidos.sql), nos DOIS
-- bancos, depois de aplicar. Rodar de apps\web (dev pode ser pelo executor; prod é do Igor, depois do
-- migrate-prod):
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\rastreio-check.sql
--
-- Existe porque o gate de drift não vê RLS, policy, ACL, CHECK, índice, trigger nem corpo de função.
-- Tudo o que escreve fica entre begin e rollback: duas lojas falsas (TA, TB, ids 7a5c0000-…) e os pedidos,
-- avisos e configurações delas. Cada bloco levanta 'FALHOU: …' e o script para ali. Leitura de conferência
-- sempre num comando separado da escrita (memória finding-select-na-mesma-expressao-ve-snapshot-antigo).
-- now() é um só na transação inteira: os asserts de data usam igualdade.
-- O bloco 6 chama public.rastreio_purgar(), que varre TODAS as lojas e apaga — o rollback desfaz, mas em
-- prod quem roda é o Igor.
-- Sem erro, a última linha traz `r` com a assinatura dos objetos para a baseline (dentro da transação).
-- Antes da migração o bloco 1 falha com 'FALHOU: tabela public.tracking_orders ausente' — é o RED.
--
-- Lojas: TA = 7a5c0000-0000-4000-8000-00000000000a, TB = …0b.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7a5c0000-0000-4000-8000-00000000000a', '7a5c0000-0000-4000-8000-00000000000a',
   'Check rastreio TA', 'check-rastreio-7a5c-ta'),
  ('7a5c0000-0000-4000-8000-00000000000b', '7a5c0000-0000-4000-8000-00000000000b',
   'Check rastreio TB', 'check-rastreio-7a5c-tb');

-- 1) Contrato: as três tabelas com RLS e sem policy; nada para anon/authenticated (tabela e coluna);
--    service_role com SELECT/INSERT/UPDATE/DELETE. A flag do B·1a e a trava dela. FKs de
--    tracking_notices, constraints que as stores leem no 23505, os quatro índices e o token aleatório.
do $$
declare
  v_tabela text;
  v_ruins text;
begin
  foreach v_tabela in array array['public.tracking_orders', 'public.tracking_notices', 'public.tracking_settings'] loop
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
    select 1 from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'tenant_settings' and c.column_name = 'rastreio_enabled'
       and c.data_type = 'boolean' and c.is_nullable = 'NO' and c.column_default = 'false'
  ) then
    raise exception 'FALHOU: tenant_settings.rastreio_enabled não é boolean not null default false (B·1a)';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.tenant_settings'::regclass and not t.tgisinternal
       and t.tgenabled = 'O' and p.prosrc like '%rastreio_enabled%'
  ) then
    raise exception 'FALHOU: tenant_settings sem trigger ligado que guarde rastreio_enabled (B·1a)';
  end if;

  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.tracking_notices'::regclass and c.contype = 'f'
       and c.confrelid = 'public.private_messages'::regclass and c.confdeltype = 'n'
  ) then
    raise exception 'FALHOU: tracking_notices.message_id sem FK para private_messages on delete set null';
  end if;
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.tracking_notices'::regclass and c.contype = 'f'
       and c.confrelid = 'public.tracking_orders'::regclass and c.confdeltype = 'c'
       and array_length(c.conkey, 1) = 2
  ) then
    raise exception 'FALHOU: tracking_notices sem FK composta (tenant_id, order_id) para tracking_orders on delete cascade';
  end if;

  if (select count(*) from pg_constraint
       where conrelid = 'public.tracking_settings'::regclass
         and conname in ('tracking_settings_pkey', 'tracking_settings_public_slug_key')) <> 2 then
    raise exception 'FALHOU: tracking_settings sem tracking_settings_pkey e tracking_settings_public_slug_key (as stores leem esses nomes)';
  end if;

  select string_agg(i.nome, ', ') into v_ruins
    from unnest(array['tracking_orders_doc_idx', 'tracking_orders_etapa_idx', 'tracking_notices_fila_idx',
                      'tracking_notices_message_idx']) as i(nome)
   where to_regclass('public.' || i.nome) is null;
  if v_ruins is not null then
    raise exception 'FALHOU: índices ausentes: %', v_ruins;
  end if;

  if not exists (
    select 1 from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.tracking_orders'::regclass and a.attname = 'link_token'
       and pg_get_expr(d.adbin, d.adrelid) like '%gen_random_bytes(16)%'
  ) then
    raise exception 'FALHOU: link_token sem gen_random_bytes(16) no default';
  end if;
end $$;

-- 2) Constraints pelo insert direto. Cada recusa num begin … exception, para o bloco seguir.
do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  tb constant uuid := '7a5c0000-0000-4000-8000-00000000000b';
  v_matriz constant jsonb := '{"confirmado": {"whatsapp": false, "email": false}, "enviado": {"whatsapp": true, "email": true}, "retirada": {"whatsapp": true, "email": true}, "problema": {"whatsapp": true, "email": true}, "entregue": {"whatsapp": true, "email": false}}';
  v_s public.tracking_settings;
  v_o public.tracking_orders;
  v_n public.tracking_notices;
  v_msg text;
  v_slug text;
  v_qtd integer;
begin
  -- Configurações
  insert into public.tracking_settings (tenant_id, public_slug) values (ta, 'check-rastreio-ta');
  select * into v_s from public.tracking_settings where tenant_id = ta;
  if v_s.matrix is distinct from v_matriz or v_s.notify_store_on_problem is not true
     or v_s.vip_link_id is not null or v_s.store_whatsapp is not null
     or v_s.imported_at is not null or v_s.sweep_cursor is not null then
    raise exception 'FALHOU: settings de TA com padrão errado: %', row_to_json(v_s);
  end if;

  begin
    insert into public.tracking_settings (tenant_id, public_slug) values (tb, 'check-rastreio-ta');
    raise exception 'FALHOU: TB pegou o slug de TA';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%tracking_settings_public_slug_key%' then
      raise exception 'FALHOU: 23505 do slug repetido sem citar tracking_settings_public_slug_key: %', v_msg;
    end if;
  end;
  begin
    insert into public.tracking_settings (tenant_id, public_slug) values (ta, 'check-rastreio-ta2');
    raise exception 'FALHOU: TA ganhou uma segunda linha de settings';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%tracking_settings_pkey%' then
      raise exception 'FALHOU: 23505 da segunda linha sem citar tracking_settings_pkey: %', v_msg;
    end if;
  end;
  foreach v_slug in array array['ab', 'Check-ta', 'check--ta', '-check-ta', 'check-rastreio-' || repeat('x', 26)] loop
    begin
      insert into public.tracking_settings (tenant_id, public_slug) values (tb, v_slug);
      raise exception 'FALHOU: slug "%" aceito', v_slug;
    exception when check_violation then
      null;
    end;
  end loop;

  -- Pedido O1
  insert into public.tracking_orders (tenant_id, external_id, numero, order_created_at, status_raw, etapa, buyer_phone)
  values (ta, 'chk-n1', '2001', now(), 'on_carriage', 'enviado', '5511987654321');
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-n1';
  if v_o.link_token !~ '^[0-9a-f]{32}$' or v_o.phone_key is distinct from '1187654321'
     or v_o.phone_last4 is distinct from '4321' or v_o.source is distinct from 'yampi'
     or v_o.events is distinct from '[]'::jsonb or v_o.etapa_at is distinct from now() then
    raise exception 'FALHOU: pedido O1 = %', row_to_json(v_o);
  end if;

  begin
    insert into public.tracking_orders (tenant_id, external_id, numero, order_created_at, status_raw, etapa, buyer_phone)
    values (ta, 'chk-n2', '2002', now(), 'paid', 'confirmado', '11987654321');
    raise exception 'FALHOU: telefone sem 55 aceito';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.tracking_orders (tenant_id, external_id, numero, order_created_at, status_raw, etapa)
    values (ta, 'chk-n3', '2003', now(), 'paid', 'xyz');
    raise exception 'FALHOU: etapa xyz aceita';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.tracking_orders (tenant_id, external_id, numero, order_created_at, status_raw, etapa, doc_hmac)
    values (ta, 'chk-n4', '2004', now(), 'paid', 'confirmado', 'abc');
    raise exception 'FALHOU: doc_hmac abc aceito';
  exception when check_violation then
    null;
  end;

  -- Aviso
  insert into public.tracking_notices (tenant_id, order_id, etapa, channel) values (ta, v_o.id, 'enviado', 'whatsapp');
  select * into v_n from public.tracking_notices where order_id = v_o.id;
  if v_n.status is distinct from 'pendente' or v_n.attempts <> 0 or v_n.resends <> 0 then
    raise exception 'FALHOU: aviso novo = %', row_to_json(v_n);
  end if;
  insert into public.tracking_notices (tenant_id, order_id, etapa, channel) values (ta, v_o.id, 'enviado', 'whatsapp')
  on conflict (order_id, etapa, channel) do nothing;
  select count(*) into v_qtd from public.tracking_notices where order_id = v_o.id;
  if v_qtd <> 1 then
    raise exception 'FALHOU: on conflict do nothing deixou % avisos', v_qtd;
  end if;
  begin
    insert into public.tracking_notices (tenant_id, order_id, etapa, channel) values (ta, v_o.id, 'enviado', 'whatsapp');
    raise exception 'FALHOU: aviso repetido aceito';
  exception when unique_violation then
    null;
  end;
  begin
    insert into public.tracking_notices (tenant_id, order_id, etapa, channel) values (ta, v_o.id, 'separando', 'whatsapp');
    raise exception 'FALHOU: aviso de separando aceito';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.tracking_notices (tenant_id, order_id, etapa, channel) values (ta, v_o.id, 'entregue', 'sms');
    raise exception 'FALHOU: canal sms aceito';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.tracking_notices (tenant_id, order_id, etapa, channel, status)
    values (ta, v_o.id, 'entregue', 'email', 'xyz');
    raise exception 'FALHOU: status xyz aceito';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.tracking_notices (tenant_id, order_id, etapa, channel) values (tb, v_o.id, 'enviado', 'email');
    raise exception 'FALHOU: aviso de TB apontando pedido de TA aceito';
  exception when foreign_key_violation then
    null;
  end;
end $$;

-- Assinaturas para a baseline (dentro da transação, para aparecer também no dry-run).
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature() where nome like 'tracking\_%' or nome like 'rastreio\_%';
rollback;
