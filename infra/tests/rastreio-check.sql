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

-- 3) A regra da etapa: ordem das 8 etapas (retirada e problema empatam) e quem pode mudar para quem.
do $$
declare
  v_ruins text;
  v_ordem text;
begin
  select string_agg(f.sig, ', ') into v_ruins
    from (values ('app.rastreio_etapa_ordem(text)'), ('app.rastreio_etapa_pode_mudar(text,text)')) as f(sig)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
   where p.oid is null
      or p.provolatile <> 'i'
      or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_ruins is not null then
    raise exception 'FALHOU: fora do contrato (existe, immutable, search_path fixo, EXECUTE só do service_role): %', v_ruins;
  end if;

  select string_agg(e || '=' || app.rastreio_etapa_ordem(e), ',' order by n) into v_ordem
    from unnest(array['aguardando_pagamento', 'confirmado', 'separando', 'enviado', 'retirada', 'problema',
                      'entregue', 'cancelado']) with ordinality as x(e, n);
  if v_ordem is distinct from
     'aguardando_pagamento=1,confirmado=2,separando=3,enviado=4,retirada=5,problema=5,entregue=6,cancelado=7' then
    raise exception 'FALHOU: ordem das etapas = %', v_ordem;
  end if;
  if app.rastreio_etapa_ordem('xyz') is not null then
    raise exception 'FALHOU: etapa xyz tem ordem';
  end if;

  select string_agg(coalesce(r.atual, 'null') || '->' || coalesce(r.nova, 'null') || ' devia ser ' || r.esperado, '; ')
    into v_ruins
    from (values (null, 'confirmado', true), ('confirmado', 'confirmado', false), ('separando', 'enviado', true),
                 ('enviado', 'separando', false), ('entregue', 'enviado', false), ('problema', 'enviado', true),
                 ('retirada', 'enviado', true), ('enviado', 'retirada', true), ('retirada', 'problema', true),
                 ('problema', 'retirada', true), ('problema', 'entregue', true), ('entregue', 'problema', false),
                 ('entregue', 'cancelado', true), ('aguardando_pagamento', 'cancelado', true),
                 ('cancelado', 'entregue', false), ('cancelado', 'aguardando_pagamento', false),
                 ('confirmado', 'aguardando_pagamento', false), ('enviado', null, false)) as r(atual, nova, esperado)
   where app.rastreio_etapa_pode_mudar(r.atual, r.nova) is distinct from r.esperado;
  if v_ruins is not null then
    raise exception 'FALHOU: regra da etapa diverge: %', v_ruins;
  end if;
end $$;

-- 4) rastreio_gravar_pedido: contrato, prova da corrida pela ordem no corpo, pedido novo e repetido.
--    A conferência é uma sessão só; a prova da corrida é a ordem no corpo mais a semântica do Postgres: o
--    insert … on conflict do nothing espera a transação concorrente e, em READ COMMITTED, o for update relê
--    a versão que ela gravou — então a regra da etapa precisa vir depois do for update.
do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  tb constant uuid := '7a5c0000-0000-4000-8000-00000000000b';
  v_hist constant jsonb := '[{"etapa": "confirmado", "at": "2026-10-20T13:00:00Z"}, {"etapa": "separando", "at": "2026-10-21T09:00:00Z"}]';
  v_base jsonb := jsonb_build_object('numero', '1001', 'order_created_at', '2026-10-20T12:00:00Z',
                    'buyer_first_name', 'Ana', 'buyer_phone', '5511987654321', 'doc_hmac', repeat('a', 64),
                    'historico', '[]'::jsonb);
  v_ruins text;
  v_src text;
  r jsonb;
  r1 jsonb;
  v_o public.tracking_orders;
  v_msg text;
  v_qtd integer;
begin
  select string_agg(f.sig, ', ') into v_ruins
    from (values ('public.rastreio_gravar_pedido(uuid,jsonb)')) as f(sig)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
   where p.oid is null
      or not p.prosecdef
      or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_ruins is not null then
    raise exception 'FALHOU: fora do contrato (existe, security definer, search_path fixo, EXECUTE só do service_role): %', v_ruins;
  end if;

  select regexp_replace(lower(p.prosrc), '--[^\n]*', '', 'g') into v_src
    from pg_proc p where p.oid = 'public.rastreio_gravar_pedido(uuid,jsonb)'::regprocedure;
  if not (0 < position('do nothing' in v_src)
          and position('do nothing' in v_src) < position('for update' in v_src)
          and position('for update' in v_src) < position('rastreio_etapa_pode_mudar' in v_src)
          and position('rastreio_etapa_pode_mudar' in v_src) < position('update public.tracking_orders' in v_src)) then
    raise exception 'FALHOU: a regra da etapa precisa vir depois do for update';
  end if;

  -- chk-1 novo
  r1 := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-1', 'etapa', 'confirmado',
          'status_raw', 'paid', 'tracking_code', null));
  if (r1->>'mudou')::boolean is not true or r1->>'etapa_anterior' is not null or r1->>'etapa' <> 'confirmado'
     or r1->>'link_token' !~ '^[0-9a-f]{32}$' then
    raise exception 'FALHOU: chk-1 novo devolveu %', r1;
  end if;
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-1';
  if v_o.events is distinct from jsonb_build_array(jsonb_build_object('etapa', 'confirmado', 'at', now()))
     or v_o.etapa_at is distinct from now() or v_o.purge_after is not null then
    raise exception 'FALHOU: linha de chk-1 novo = %', row_to_json(v_o);
  end if;

  -- chk-1 igual (a varredura repetindo o aviso)
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-1', 'etapa', 'confirmado',
         'status_raw', 'paid', 'tracking_code', null));
  if (r->>'mudou')::boolean is not false or r->>'etapa_anterior' is distinct from 'confirmado'
     or r->>'id' <> r1->>'id' or r->>'link_token' <> r1->>'link_token' then
    raise exception 'FALHOU: chk-1 repetido devolveu %', r;
  end if;
  select count(*) into v_qtd from public.tracking_orders where tenant_id = ta and external_id = 'chk-1';
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-1';
  if v_qtd <> 1 or jsonb_array_length(v_o.events) <> 1 then
    raise exception 'FALHOU: chk-1 repetido deixou % linhas e events %', v_qtd, v_o.events;
  end if;

  -- chk-1 na TB
  r := public.rastreio_gravar_pedido(tb, v_base || jsonb_build_object('external_id', 'chk-1', 'etapa', 'enviado',
         'status_raw', 'on_carriage', 'tracking_code', null));
  if (r->>'mudou')::boolean is not true or r->>'id' = r1->>'id' then
    raise exception 'FALHOU: chk-1 na TB devolveu %', r;
  end if;
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-1';
  if v_o.etapa <> 'confirmado' or jsonb_array_length(v_o.events) <> 1 then
    raise exception 'FALHOU: chk-1 da TB mexeu no de TA: %', row_to_json(v_o);
  end if;

  -- chk-4 com etapa nula
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-4', 'etapa', null,
         'status_raw', 'alias_novo', 'tracking_code', null));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-4';
  if r->>'etapa' is distinct from 'aguardando_pagamento' or (r->>'mudou')::boolean is not true
     or v_o.events is distinct from jsonb_build_array(jsonb_build_object('etapa', 'aguardando_pagamento', 'at', now())) then
    raise exception 'FALHOU: chk-4 devolveu % e gravou %', r, row_to_json(v_o);
  end if;

  -- chk-5 separando com histórico datado da etapa atual
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-5', 'etapa', 'separando',
         'status_raw', 'invoiced', 'tracking_code', null, 'historico', v_hist));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-5';
  if (r->>'mudou')::boolean is not true or v_o.events is distinct from v_hist
     or v_o.etapa_at is distinct from '2026-10-21T09:00:00Z'::timestamptz then
    raise exception 'FALHOU: chk-5 devolveu % e gravou %', r, row_to_json(v_o);
  end if;

  -- chk-6 enviado com o mesmo histórico: carimba enviado agora
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-6', 'etapa', 'enviado',
         'status_raw', 'on_carriage', 'tracking_code', null, 'historico', v_hist));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-6';
  if (r->>'mudou')::boolean is not true
     or v_o.events is distinct from v_hist || jsonb_build_array(jsonb_build_object('etapa', 'enviado', 'at', now()))
     or v_o.etapa_at is distinct from now() then
    raise exception 'FALHOU: chk-6 devolveu % e gravou %', r, row_to_json(v_o);
  end if;

  -- chk-7 importação sem histórico: sem data inventada
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-7', 'etapa', 'separando',
         'status_raw', 'invoiced', 'tracking_code', null, 'carimbar', false));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-7';
  if (r->>'mudou')::boolean is not true or v_o.events is distinct from '[]'::jsonb
     or v_o.etapa_at is distinct from '2026-10-20T12:00:00Z'::timestamptz then
    raise exception 'FALHOU: chk-7 devolveu % e gravou %', r, row_to_json(v_o);
  end if;

  -- Recusas: nada gravado
  begin
    perform public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', '', 'etapa', 'confirmado',
              'status_raw', 'paid'));
    v_msg := null;
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null or v_msg not like '%obrigatórios%' then
    raise exception 'FALHOU: external_id vazio aceito ou recusado com outra mensagem: %', v_msg;
  end if;
  begin
    perform public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-8', 'etapa', 'xyz',
              'status_raw', 'paid'));
    v_msg := null;
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null or v_msg not like '%etapa desconhecida%' then
    raise exception 'FALHOU: etapa xyz aceita ou recusada com outra mensagem: %', v_msg;
  end if;
  begin
    perform public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-9', 'etapa', 'confirmado',
              'status_raw', 'paid', 'buyer_phone', '11987654321'));
    raise exception 'FALHOU: telefone sem 55 aceito por rastreio_gravar_pedido';
  exception when check_violation then
    null;
  end;
  if exists (select 1 from public.tracking_orders
              where tenant_id = ta and external_id in ('', 'chk-8', 'chk-9')) then
    raise exception 'FALHOU: chamada recusada deixou pedido gravado';
  end if;
end $$;

-- 5) "Não volta": aviso atrasado não leva a etapa para trás; retirada e problema voltam a enviado; cancelado
--    não sai. Os três campos novos do retorno (notices_stopped_at, tem_telefone, tem_email) na criação e na
--    atualização.
do $$
declare
  ta constant uuid := '7a5c0000-0000-4000-8000-00000000000a';
  v_base jsonb := jsonb_build_object('numero', '1001', 'order_created_at', '2026-10-20T12:00:00Z',
                    'buyer_first_name', 'Ana', 'buyer_phone', '5511987654321', 'doc_hmac', repeat('a', 64),
                    'historico', '[]'::jsonb);
  r jsonb;
  v_o public.tracking_orders;
  v_passo record;
  v_purge timestamptz;
begin
  -- chk-1 de TA (confirmado, do bloco 4)
  -- a) enviado com código
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-1', 'etapa', 'enviado',
         'status_raw', 'on_carriage', 'tracking_code', 'AA123456789BR'));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-1';
  if r->>'etapa' <> 'enviado' or (r->>'mudou')::boolean is not true or r->>'etapa_anterior' <> 'confirmado'
     or jsonb_array_length(v_o.events) <> 2 or v_o.tracking_code is distinct from 'AA123456789BR'
     or r->>'notices_stopped_at' is not null or (r->>'tem_telefone')::boolean is not true
     or (r->>'tem_email')::boolean is not false then
    raise exception 'FALHOU: chk-1 (a) devolveu % e gravou %', r, row_to_json(v_o);
  end if;

  -- b) entregue sem código: purge_after em 90 dias, código fica
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-1', 'etapa', 'entregue',
         'status_raw', 'delivered', 'tracking_code', null));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-1';
  if r->>'etapa' <> 'entregue' or (r->>'mudou')::boolean is not true or r->>'etapa_anterior' <> 'enviado'
     or jsonb_array_length(v_o.events) <> 3 or v_o.purge_after is distinct from now() + interval '90 days'
     or v_o.tracking_code is distinct from 'AA123456789BR' then
    raise exception 'FALHOU: chk-1 (b) devolveu % e gravou %', r, row_to_json(v_o);
  end if;
  v_purge := v_o.purge_after;

  -- c) enviado atrasado
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-1', 'etapa', 'enviado',
         'status_raw', 'on_carriage', 'tracking_code', 'AA123456789BR'));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-1';
  if r->>'etapa' <> 'entregue' or (r->>'mudou')::boolean is not false or r->>'etapa_anterior' <> 'entregue'
     or jsonb_array_length(v_o.events) <> 3 or v_o.status_raw <> 'delivered'
     or v_o.purge_after is distinct from v_purge then
    raise exception 'FALHOU: chk-1 (c) devolveu % e gravou %', r, row_to_json(v_o);
  end if;

  -- d) alias desconhecido
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-1', 'etapa', null,
         'status_raw', 'alias_novo', 'tracking_code', null));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-1';
  if r->>'etapa' <> 'entregue' or (r->>'mudou')::boolean is not false or r->>'etapa_anterior' <> 'entregue'
     or jsonb_array_length(v_o.events) <> 3 or v_o.status_raw <> 'delivered' then
    raise exception 'FALHOU: chk-1 (d) devolveu % e gravou %', r, row_to_json(v_o);
  end if;

  -- chk-2: separando → separando (status_raw novo) → enviado → problema → enviado → retirada → problema → retirada
  for v_passo in
    select * from (values (1, 'separando', 'invoiced', true), (2, 'separando', 'on_carriage', false),
                          (3, 'enviado', 'on_carriage', true), (4, 'problema', 'exception', true),
                          (5, 'enviado', 'on_carriage', true), (6, 'retirada', 'waiting_pickup', true),
                          (7, 'problema', 'exception', true), (8, 'retirada', 'waiting_pickup', true))
                  as p(n, etapa, status_raw, mudou)
     order by n
  loop
    if v_passo.n = 8 then
      update public.tracking_orders set notices_stopped_at = now() where tenant_id = ta and external_id = 'chk-2';
    end if;
    r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-2', 'etapa', v_passo.etapa,
           'status_raw', v_passo.status_raw, 'tracking_code', null));
    if (r->>'mudou')::boolean is distinct from v_passo.mudou then
      raise exception 'FALHOU: chk-2 passo % (%) devolveu %', v_passo.n, v_passo.etapa, r;
    end if;
    if v_passo.n = 1 and (r->>'notices_stopped_at' is not null or (r->>'tem_telefone')::boolean is not true
                          or (r->>'tem_email')::boolean is not false) then
      raise exception 'FALHOU: chk-2 criado devolveu %', r;
    end if;
    if v_passo.n = 2 then
      select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-2';
      if v_o.status_raw <> 'on_carriage' then
        raise exception 'FALHOU: chk-2 na mesma etapa não gravou o status_raw novo: %', row_to_json(v_o);
      end if;
    end if;
    if v_passo.n = 8 and r->'notices_stopped_at' is distinct from to_jsonb(now()) then
      raise exception 'FALHOU: chk-2 não devolveu o notices_stopped_at gravado: %', r;
    end if;
  end loop;
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-2';
  if v_o.etapa <> 'retirada' or jsonb_array_length(v_o.events) <> 7 or v_o.purge_after is not null then
    raise exception 'FALHOU: chk-2 terminou em %', row_to_json(v_o);
  end if;

  -- chk-3: confirmado → cancelado → (enviado, entregue, confirmado não mudam). Sem telefone, com e-mail.
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-3', 'etapa', 'confirmado',
         'status_raw', 'paid', 'buyer_phone', null, 'buyer_email_enc', 'selado-de-teste'));
  if (r->>'mudou')::boolean is not true or (r->>'tem_telefone')::boolean is not false
     or (r->>'tem_email')::boolean is not true then
    raise exception 'FALHOU: chk-3 criado devolveu %', r;
  end if;
  r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-3', 'etapa', 'cancelado',
         'status_raw', 'cancelled', 'buyer_phone', null));
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-3';
  if (r->>'mudou')::boolean is not true or v_o.purge_after is distinct from now() + interval '90 days'
     or (r->>'tem_telefone')::boolean is not false or (r->>'tem_email')::boolean is not true then
    raise exception 'FALHOU: chk-3 cancelado devolveu % e gravou %', r, row_to_json(v_o);
  end if;
  for v_passo in select * from (values (1, 'enviado'), (2, 'entregue'), (3, 'confirmado')) as p(n, etapa) order by n loop
    r := public.rastreio_gravar_pedido(ta, v_base || jsonb_build_object('external_id', 'chk-3', 'etapa', v_passo.etapa,
           'status_raw', 'x', 'buyer_phone', null));
    if (r->>'mudou')::boolean is not false or r->>'etapa' <> 'cancelado' then
      raise exception 'FALHOU: chk-3 saiu de cancelado com %: %', v_passo.etapa, r;
    end if;
  end loop;
  select * into v_o from public.tracking_orders where tenant_id = ta and external_id = 'chk-3';
  if v_o.etapa <> 'cancelado' or jsonb_array_length(v_o.events) <> 2 then
    raise exception 'FALHOU: chk-3 terminou em %', row_to_json(v_o);
  end if;
end $$;

-- Assinaturas para a baseline (dentro da transação, para aparecer também no dry-run).
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature() where nome like 'tracking\_%' or nome like 'rastreio\_%';
rollback;
