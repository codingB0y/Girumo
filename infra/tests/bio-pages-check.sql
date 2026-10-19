-- Conferência do PR 1 do Link da bio (migração 20261019120000_link_da_bio.sql), nos DOIS bancos.
-- Rodar de apps\web (dev pode ser pelo executor; prod é do Igor, depois do migrate-prod):
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\bio-pages-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: três lojas falsas (TA, TB, TC, ids b10b0000-…),
-- páginas com slugs girumo-check-bio-* (o app recusa slug com "girumo", então nenhuma página real tem
-- esses) e contadores. Cada bloco levanta 'FALHOU: …' e o script para ali. Leitura de conferência
-- sempre num comando separado da escrita (memória finding-select-na-mesma-expressao-ve-snapshot-antigo).
-- Sem erro, a última linha traz `r` com a assinatura dos seis objetos para a baseline.
--
-- Existe porque o gate de drift não vê RLS, policy, ACL, trigger, CHECK nem corpo de função.
-- Antes da migração o bloco 1 falha com 'FALHOU: tabela public.bio_pages ausente' — é o RED.
--
-- Lojas: TA = b10b0000-0000-4000-8000-00000000000a, TB = …0b, TC = …0c.
-- Páginas: PA = …0000000000a1 (TA), PB = …b1 (TB, apagada no bloco 5), PC = …c1 (TC, bloco 7).
-- Links: L1 = b10b0000-0000-4000-8000-0000000001a1, L2 = …1a2, L3 = …1a3. Página inexistente = …ff.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-00000000000a',
   'Check bio TA', 'check-bio-b10b-ta'),
  ('b10b0000-0000-4000-8000-00000000000b', 'b10b0000-0000-4000-8000-00000000000b',
   'Check bio TB', 'check-bio-b10b-tb'),
  ('b10b0000-0000-4000-8000-00000000000c', 'b10b0000-0000-4000-8000-00000000000c',
   'Check bio TC', 'check-bio-b10b-tc');

-- 1) Estrutura e privilégios: RLS sem policy; nada para anon/authenticated (tabela, coluna e função);
--    service_role com o que o app usa (e sem UPDATE/DELETE/TRUNCATE em bio_slugs); funções security
--    invoker com search_path fixo; trigger ligado; nomes de constraint que o store do PR 2 lê no 23505.
do $$
declare
  v_tabela text;
  v_ruins text;
begin
  foreach v_tabela in array array['public.bio_pages', 'public.bio_slugs', 'public.bio_contagens'] loop
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
  end loop;

  select string_agg(x.tabela || ':' || x.priv, ' ') into v_ruins
    from (values ('public.bio_pages', 'SELECT', true), ('public.bio_pages', 'INSERT', true),
                 ('public.bio_pages', 'UPDATE', true), ('public.bio_pages', 'DELETE', true),
                 ('public.bio_contagens', 'SELECT', true), ('public.bio_contagens', 'INSERT', true),
                 ('public.bio_contagens', 'UPDATE', true), ('public.bio_contagens', 'DELETE', true),
                 ('public.bio_slugs', 'SELECT', true), ('public.bio_slugs', 'INSERT', true),
                 ('public.bio_slugs', 'UPDATE', false), ('public.bio_slugs', 'DELETE', false),
                 ('public.bio_slugs', 'TRUNCATE', false)) as x(tabela, priv, deve)
   where has_table_privilege('service_role', x.tabela, x.priv) is distinct from x.deve;
  if v_ruins is not null then
    raise exception 'FALHOU: privilégio de service_role fora do contrato: %', v_ruins;
  end if;

  select string_agg(f.sig, ', ') into v_ruins
    from (values ('public.bio_contar(uuid,text)', true),
                 ('public.bio_relatorio(uuid,date,date)', true),
                 ('public.bio_registra_slug()', false)) as f(sig, rpc)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
   where p.oid is null
      or p.prosecdef
      or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or (f.rpc and not has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_ruins is not null then
    raise exception 'FALHOU: fora do contrato (existe, security invoker, search_path fixo, nada para anon/authenticated, RPC executável por service_role): %', v_ruins;
  end if;

  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.bio_pages'::regclass
       and t.tgname = 'bio_pages_registra_slug'
       and t.tgenabled = 'O'
       and t.tgfoid = 'public.bio_registra_slug()'::regprocedure
  ) then
    raise exception 'FALHOU: trigger bio_pages_registra_slug ausente, desligado ou com outra função';
  end if;

  if (select count(*) from pg_constraint
       where conrelid = 'public.bio_pages'::regclass
         and conname in ('bio_pages_tenant_id_key', 'bio_pages_slug_key')) <> 2 then
    raise exception 'FALHOU: bio_pages sem bio_pages_tenant_id_key e bio_pages_slug_key (o store do PR 2 lê esses nomes)';
  end if;
end $$;

-- 2) Formato do slug: a CHECK recusa antes do trigger (23514). '_dominio' nunca é slug: a raiz do
--    domínio próprio (PR 4a) usa esse valor na rota.
do $$
declare
  v_slug text;
begin
  foreach v_slug in array array['ab', '_dominio', 'Girumo-check', 'girumo--check', 'girumo-check-',
                                '-girumo-check', 'girumo-check-bio-' || repeat('x', 24)] loop
    begin
      insert into public.bio_pages (tenant_id, slug, documento)
      values ('b10b0000-0000-4000-8000-00000000000c', v_slug, '{}');
      raise exception 'FALHOU: slug "%" aceito', v_slug;
    exception when check_violation then
      null;
    end;
  end loop;
end $$;

-- 3) Slug novo entra em bio_slugs; a loja troca e VOLTA a um slug que já foi dela; repetir o mesmo slug
--    no SET (o store manda o slug em todo salvar) passa; 40 caracteres passam; versao 0 não.
do $$
declare
  pa constant uuid := 'b10b0000-0000-4000-8000-0000000000a1';
  v_longo constant text := 'girumo-check-bio-' || repeat('x', 23);
  v_slugs text;
  v_atual text;
begin
  insert into public.bio_pages (id, tenant_id, slug, documento)
  values (pa, 'b10b0000-0000-4000-8000-00000000000a', 'girumo-check-bio-a', '{}');
  update public.bio_pages set slug = 'girumo-check-bio-a2' where id = pa;
  update public.bio_pages set slug = v_longo where id = pa;
  update public.bio_pages set slug = 'girumo-check-bio-a' where id = pa;
  update public.bio_pages set slug = 'girumo-check-bio-a', publicada = true, versao = versao + 1 where id = pa;

  select string_agg(s.slug, ',' order by s.slug collate "C") into v_slugs
    from public.bio_slugs s where s.pagina_id = pa;
  if v_slugs is distinct from 'girumo-check-bio-a,girumo-check-bio-a2,' || v_longo then
    raise exception 'FALHOU: bio_slugs de PA = %', v_slugs;
  end if;
  select slug into v_atual from public.bio_pages where id = pa;
  if v_atual is distinct from 'girumo-check-bio-a' then
    raise exception 'FALHOU: slug atual de PA = %', v_atual;
  end if;

  begin
    update public.bio_pages set versao = 0 where id = pa;
    raise exception 'FALHOU: versao 0 aceita';
  exception when check_violation then
    null;
  end;
exception when unique_violation then
  raise exception 'FALHOU: slug da própria página recusado: %', sqlerrm;
end $$;

-- 4) Slug que já foi de OUTRA página: 23505 citando bio_slugs, e a gravação inteira desfaz (update e
--    insert). Slug ATUAL de outra página e segunda página da mesma loja também são 23505, pela unique de
--    bio_pages — o PR 2 lê bio_pages_tenant_id_key para devolver a página que já existe.
do $$
declare
  pb constant uuid := 'b10b0000-0000-4000-8000-0000000000b1';
  v_msg text;
  v_slug text;
  v_dono uuid;
begin
  insert into public.bio_pages (id, tenant_id, slug, documento)
  values (pb, 'b10b0000-0000-4000-8000-00000000000b', 'girumo-check-bio-b', '{}');

  -- girumo-check-bio-a2 não é slug atual de ninguém: só bio_slugs barra.
  begin
    update public.bio_pages set slug = 'girumo-check-bio-a2' where id = pb;
    raise exception 'FALHOU: PB pegou girumo-check-bio-a2, que já foi de PA';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_slugs%' then
      raise exception 'FALHOU: 23505 do update sem citar bio_slugs: %', v_msg;
    end if;
  end;

  begin
    insert into public.bio_pages (id, tenant_id, slug, documento)
    values ('b10b0000-0000-4000-8000-0000000000c1', 'b10b0000-0000-4000-8000-00000000000c',
            'girumo-check-bio-a2', '{}');
    raise exception 'FALHOU: TC criou página com girumo-check-bio-a2, que já foi de PA';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_slugs%' then
      raise exception 'FALHOU: 23505 do insert sem citar bio_slugs: %', v_msg;
    end if;
  end;

  begin
    update public.bio_pages set slug = 'girumo-check-bio-a' where id = pb;
    raise exception 'FALHOU: PB pegou o slug atual de PA';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_pages_slug_key%' then
      raise exception 'FALHOU: 23505 do slug atual de outra página: %', v_msg;
    end if;
  end;

  begin
    insert into public.bio_pages (tenant_id, slug, documento)
    values ('b10b0000-0000-4000-8000-00000000000a', 'girumo-check-bio-a3', '{}');
    raise exception 'FALHOU: TA ganhou uma segunda página';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_pages_tenant_id_key%' then
      raise exception 'FALHOU: 23505 da segunda página da loja: %', v_msg;
    end if;
  end;

  select slug into v_slug from public.bio_pages where id = pb;
  if v_slug is distinct from 'girumo-check-bio-b' then
    raise exception 'FALHOU: PB ficou com o slug % depois das recusas', v_slug;
  end if;
  select pagina_id into v_dono from public.bio_slugs where slug = 'girumo-check-bio-a2';
  if v_dono is distinct from 'b10b0000-0000-4000-8000-0000000000a1'::uuid then
    raise exception 'FALHOU: girumo-check-bio-a2 em bio_slugs aponta para % (devia continuar de PA)', v_dono;
  end if;
  if exists (select 1 from public.bio_pages where tenant_id = 'b10b0000-0000-4000-8000-00000000000c')
     or exists (select 1 from public.bio_slugs where slug = 'girumo-check-bio-a3') then
    raise exception 'FALHOU: gravação recusada deixou rastro (página de TC ou slug a3)';
  end if;
end $$;

-- 5) Página apagada: o slug fica em bio_slugs com pagina_id null e não volta para ninguém — nem para a
--    própria loja numa página nova (o id mudou).
do $$
declare
  v_msg text;
  v_dono uuid;
begin
  delete from public.bio_pages where id = 'b10b0000-0000-4000-8000-0000000000b1';

  select pagina_id into v_dono from public.bio_slugs where slug = 'girumo-check-bio-b';
  if not found then
    raise exception 'FALHOU: girumo-check-bio-b sumiu de bio_slugs ao apagar a página';
  end if;
  if v_dono is not null then
    raise exception 'FALHOU: slug de página apagada ainda aponta para %', v_dono;
  end if;

  begin
    insert into public.bio_pages (id, tenant_id, slug, documento)
    values ('b10b0000-0000-4000-8000-0000000000b2', 'b10b0000-0000-4000-8000-00000000000b',
            'girumo-check-bio-b', '{}');
    raise exception 'FALHOU: slug de página apagada voltou a ser usado';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_slugs%' then
      raise exception 'FALHOU: 23505 do slug de página apagada sem citar bio_slugs: %', v_msg;
    end if;
  end;

  if exists (select 1 from public.bio_pages where tenant_id = 'b10b0000-0000-4000-8000-00000000000b') then
    raise exception 'FALHOU: a página recusada de TB ficou gravada';
  end if;
end $$;

-- 6) bio_contar: dia de America/Sao_Paulo, não o da sessão. Com a sessão em UTC+14 e depois em UTC-11,
--    a qualquer hora um dos dois fusos cai noutra data que a de São Paulo: current_date ou now()::date
--    no lugar do fuso fixo separaria as duas visitas em dias diferentes. Página inexistente: sem efeito e
--    sem erro. alvo fora do formato (lixo ou uuid em maiúsculas): 23514.
do $$
declare
  ta constant uuid := 'b10b0000-0000-4000-8000-00000000000a';
  pa constant uuid := 'b10b0000-0000-4000-8000-0000000000a1';
  l1 constant text := 'b10b0000-0000-4000-8000-0000000001a1';
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
  v_linhas text;
begin
  perform set_config('TimeZone', 'Pacific/Kiritimati', true);
  perform public.bio_contar(pa, 'visita');
  perform set_config('TimeZone', 'Pacific/Pago_Pago', true);
  perform public.bio_contar(pa, 'visita');
  perform set_config('TimeZone', 'UTC', true);
  perform public.bio_contar(pa, l1);
  perform public.bio_contar('b10b0000-0000-4000-8000-0000000000ff', 'visita');

  select string_agg(c.tenant_id::text || ' ' || c.dia::text || ' ' || c.alvo || ' ' || c.total::text, '; '
                    order by c.alvo collate "C" desc)
    into v_linhas
    from public.bio_contagens c
   where c.pagina_id in (pa, 'b10b0000-0000-4000-8000-0000000000ff');
  if v_linhas is distinct from format('%s %s visita 2; %s %s %s 1', ta, v_hoje, ta, v_hoje, l1) then
    raise exception 'FALHOU: bio_contagens depois das chamadas = % (hoje em SP = %)', v_linhas, v_hoje;
  end if;

  begin
    perform public.bio_contar(pa, 'abc');
    raise exception 'FALHOU: bio_contar aceitou o alvo "abc"';
  exception when check_violation then
    null;
  end;
  begin
    perform public.bio_contar(pa, upper(l1));
    raise exception 'FALHOU: bio_contar aceitou uuid em maiúsculas';
  exception when check_violation then
    null;
  end;
end $$;

-- 7) bio_relatorio: soma da loja no intervalo (inclusivo); porDia com TODOS os dias, zeros incluídos, em
--    ordem; porLink só com ids de link (toques desc, empate por linkId); nada de outra loja, mesmo com o
--    mesmo id de link no mesmo dia. Dias de janeiro de 2026: as visitas de hoje (bloco 6) ficam fora.
insert into public.bio_pages (id, tenant_id, slug, documento)
values ('b10b0000-0000-4000-8000-0000000000c1', 'b10b0000-0000-4000-8000-00000000000c',
        'girumo-check-bio-c', '{}');

insert into public.bio_contagens (tenant_id, pagina_id, dia, alvo, total) values
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2025-12-31', 'visita', 100),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-01', 'visita', 3),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-01', 'b10b0000-0000-4000-8000-0000000001a1', 2),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-03', 'visita', 5),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-03', 'b10b0000-0000-4000-8000-0000000001a1', 1),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-03', 'b10b0000-0000-4000-8000-0000000001a2', 4),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-04', 'b10b0000-0000-4000-8000-0000000001a3', 3),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-06', 'b10b0000-0000-4000-8000-0000000001a1', 100),
  ('b10b0000-0000-4000-8000-00000000000c', 'b10b0000-0000-4000-8000-0000000000c1', '2026-01-02', 'visita', 50),
  ('b10b0000-0000-4000-8000-00000000000c', 'b10b0000-0000-4000-8000-0000000000c1', '2026-01-02', 'b10b0000-0000-4000-8000-0000000001a1', 7);

do $$
declare
  ta constant uuid := 'b10b0000-0000-4000-8000-00000000000a';
  l1 constant text := 'b10b0000-0000-4000-8000-0000000001a1';
  l2 constant text := 'b10b0000-0000-4000-8000-0000000001a2';
  l3 constant text := 'b10b0000-0000-4000-8000-0000000001a3';
  v jsonb;
begin
  v := public.bio_relatorio(ta, '2026-01-01', '2026-01-05');
  if v is distinct from jsonb_build_object(
       'visitas', 8, 'toques', 10,
       'porLink', jsonb_build_array(
         jsonb_build_object('linkId', l2, 'toques', 4),
         jsonb_build_object('linkId', l1, 'toques', 3),
         jsonb_build_object('linkId', l3, 'toques', 3)),
       'porDia', jsonb_build_array(
         jsonb_build_object('dia', '2026-01-01', 'visitas', 3, 'toques', 2),
         jsonb_build_object('dia', '2026-01-02', 'visitas', 0, 'toques', 0),
         jsonb_build_object('dia', '2026-01-03', 'visitas', 5, 'toques', 5),
         jsonb_build_object('dia', '2026-01-04', 'visitas', 0, 'toques', 3),
         jsonb_build_object('dia', '2026-01-05', 'visitas', 0, 'toques', 0))) then
    raise exception 'FALHOU: relatório de TA de 01 a 05/01 = %', v;
  end if;

  v := public.bio_relatorio(ta, '2026-01-03', '2026-01-03');
  if v is distinct from jsonb_build_object(
       'visitas', 5, 'toques', 5,
       'porLink', jsonb_build_array(
         jsonb_build_object('linkId', l2, 'toques', 4),
         jsonb_build_object('linkId', l1, 'toques', 1)),
       'porDia', jsonb_build_array(jsonb_build_object('dia', '2026-01-03', 'visitas', 5, 'toques', 5))) then
    raise exception 'FALHOU: relatório de um dia só = %', v;
  end if;

  v := public.bio_relatorio(ta, '2026-01-05', '2026-01-01');
  if v is distinct from jsonb_build_object('visitas', 0, 'toques', 0, 'porLink', '[]'::jsonb, 'porDia', '[]'::jsonb) then
    raise exception 'FALHOU: intervalo invertido = %', v;
  end if;

  -- TB: página apagada no bloco 5 (os contadores foram junto, on delete cascade).
  v := public.bio_relatorio('b10b0000-0000-4000-8000-00000000000b', '2026-01-01', '2026-01-02');
  if v is distinct from jsonb_build_object(
       'visitas', 0, 'toques', 0, 'porLink', '[]'::jsonb,
       'porDia', jsonb_build_array(
         jsonb_build_object('dia', '2026-01-01', 'visitas', 0, 'toques', 0),
         jsonb_build_object('dia', '2026-01-02', 'visitas', 0, 'toques', 0))) then
    raise exception 'FALHOU: loja sem página = %', v;
  end if;

  v := public.bio_relatorio('b10b0000-0000-4000-8000-00000000000c', '2026-01-01', '2026-01-05');
  if (v ->> 'visitas')::int <> 50 or (v ->> 'toques')::int <> 7
     or v -> 'porLink' is distinct from jsonb_build_array(jsonb_build_object('linkId', l1, 'toques', 7)) then
    raise exception 'FALHOU: relatório de TC = %', v;
  end if;

  v := public.bio_relatorio(ta, '2026-01-01', '2026-01-30');
  if jsonb_array_length(v -> 'porDia') <> 30
     or (v -> 'porDia' -> 0 ->> 'dia') <> '2026-01-01'
     or (v -> 'porDia' -> 29 ->> 'dia') <> '2026-01-30'
     or (v ->> 'visitas')::int <> 8
     or (v ->> 'toques')::int <> 110 then
    raise exception 'FALHOU: relatório de 30 dias = %', v;
  end if;
end $$;

rollback;

-- Assinatura dos seis objetos para a baseline (fora da transação; só leitura). Esperado nos DOIS bancos
-- (as mesmas chaves de deploy/supabase/schema-baseline.json):
--   f|bio_contar(p_pagina uuid, p_alvo text)                    f2c82bbfe5a21c72a45959602a2e2c79
--   f|bio_registra_slug()                                       e8c9208442517f72c1f64ecc6b5cfb2d
--   f|bio_relatorio(p_tenant uuid, p_desde date, p_ate date)    a91b06bba633257f616b13e6aabcb670
--   t|bio_contagens                                             c39da7f1605b7f185db441b3a69035b8
--   t|bio_pages                                                 bd259afbabda80540720fe5e78281ed7
--   t|bio_slugs                                                 c75871f8691ac0e2371ba87d9c46b5ec
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature()
 where nome like 'bio\_%';
