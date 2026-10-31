-- Conferência do PR 1b do Recuperar (banco do Recuperar; migração 20261030140000_recuperar_banco.sql),
-- nos DOIS bancos, depois de aplicar. Rodar de apps\web (dev pode ser pelo executor; prod é do Igor,
-- depois do migrate-prod):
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\recuperar-banco-check.sql
--
-- Existe porque o gate de drift não vê RLS, policy, ACL, CHECK, índice, trigger, bucket nem corpo de
-- função. A matriz completa de recusas (o code e a constraint que o store do PR 7 lê pelo PostgREST),
-- o que o JWT da dona e o da vendedora leem e a limpeza com mensagens ligadas são do teste
-- apps/web/src/lib/recuperar/banco.integration.test.ts, no job e2e, contra dev. Aqui ficam o catálogo, as
-- regras principais e a limpeza, para provar também prod.
-- Escreve só entre begin e rollback: duas lojas falsas (0ec00000-…) e os casos/scripts/depoimentos delas.
-- Cada bloco levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha traz r = as seis
-- assinaturas da baseline. Antes da migração o bloco 1 falha com 'FALHOU: tabela public.recovery_settings
-- ausente'.

begin;

-- 1) Estrutura e privilégios. As quatro tabelas: existem, RLS ligado, exatamente a policy
--    <tabela>_select_member (select, só authenticated, por app.user_tenant_ids); anon sem privilégio
--    nenhum (nem por coluna); authenticated só com SELECT; service_role lê e escreve; trigger de updated_at
--    (é o relógio da retenção dos casos).
do $$
declare
  t text;
  r regclass;
begin
  foreach t in array array['recovery_settings', 'recovery_cases', 'recovery_scripts', 'recovery_testimonials'] loop
    r := to_regclass('public.' || t);
    if r is null then
      raise exception 'FALHOU: tabela public.% ausente', t;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = r) then
      raise exception 'FALHOU: RLS desligado em %', t;
    end if;
    if (select count(*) from pg_policy p where p.polrelid = r) <> 1
       or not exists (select 1 from pg_policy p
                       where p.polrelid = r and p.polname = t || '_select_member' and p.polcmd = 'r'
                         and p.polroles = array['authenticated'::regrole]::oid[]
                         and pg_get_expr(p.polqual, p.polrelid) like '%user_tenant_ids%') then
      raise exception 'FALHOU: % sem exatamente a policy %_select_member (select, authenticated, app.user_tenant_ids)', t, t;
    end if;
    if has_table_privilege('anon', r, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('anon', r, 'SELECT, INSERT, UPDATE, REFERENCES')
       or has_table_privilege('authenticated', r, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('authenticated', r, 'INSERT, UPDATE, REFERENCES')
       or not has_table_privilege('authenticated', r, 'SELECT') then
      raise exception 'FALHOU: privilégio de anon ou authenticated fora do contrato em % (authenticated só lê)', t;
    end if;
    if not (has_table_privilege('service_role', r, 'SELECT') and has_table_privilege('service_role', r, 'INSERT')
            and has_table_privilege('service_role', r, 'UPDATE') and has_table_privilege('service_role', r, 'DELETE')) then
      raise exception 'FALHOU: service_role sem leitura e escrita em %', t;
    end if;
    if not exists (select 1 from pg_trigger g
                    where g.tgrelid = r and g.tgname = 'set_updated_at_' || t
                      and g.tgfoid = to_regprocedure('app.set_updated_at()')
                      and g.tgtype = 19            -- row + before + update
                      and g.tgenabled = 'O') then
      raise exception 'FALHOU: % sem o trigger set_updated_at_% (before update, app.set_updated_at)', t, t;
    end if;
  end loop;
end $$;

-- 2) As duas funções de limpeza: app. invoker, public. definer (o PostgREST só enxerga public); as duas
--    com search_path fixo, ACL gravado, sem EXECUTE para PUBLIC, anon nem authenticated; service_role executa.
do $$
declare
  v_ruim text;
begin
  select string_agg(f.sig, ', ') into v_ruim
    from (values ('app.limpar_dados_vencidos_recuperar()', false),
                 ('public.limpar_dados_vencidos_recuperar()', true)) as f(sig, definer)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
   where p.oid is null
      or p.prosecdef <> f.definer
      or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
      or p.proacl is null
      or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_ruim is not null then
    raise exception 'FALHOU: funções de limpeza fora do contrato (definer só no wrapper, search_path, execute só service_role): %', v_ruim;
  end if;
end $$;

-- 3) private_messages: as quatro colunas do Recuperar e as duas FKs on delete set null; a coluna
--    phone_key gerada do caso; a FK da conversa também é set null.
do $$
declare
  v_ruim text;
begin
  select string_agg(e.nome, ', ') into v_ruim
    from (values ('case_id', 'uuid'), ('step_key', 'text'), ('script_id', 'uuid'), ('variant', 'smallint'))
           as e(nome, tipo)
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = 'public.private_messages'::regclass and a.attname = e.nome
                        and not a.attisdropped and format_type(a.atttypid, a.atttypmod) = e.tipo);
  if v_ruim is not null then
    raise exception 'FALHOU: private_messages sem as colunas (ou tipo errado): %', v_ruim;
  end if;

  select string_agg(e.nome, ', ') into v_ruim
    from (values ('public.private_messages', 'private_messages_case_id_fkey', 'public.recovery_cases'),
                 ('public.private_messages', 'private_messages_script_id_fkey', 'public.recovery_scripts'),
                 ('public.recovery_cases', 'recovery_cases_conversation_id_fkey', 'public.private_conversations'))
           as e(tabela, nome, alvo)
   where not exists (select 1 from pg_constraint c
                      where c.conrelid = e.tabela::regclass and c.conname = e.nome and c.contype = 'f'
                        and c.confrelid = e.alvo::regclass and c.confdeltype = 'n');
  if v_ruim is not null then
    raise exception 'FALHOU: FK sem on delete set null apontando para o alvo certo: %', v_ruim;
  end if;

  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.recovery_cases'::regclass and a.attname = 'phone_key'
                    and a.attgenerated = 's' and not a.attisdropped) then
    raise exception 'FALHOU: recovery_cases.phone_key tem de ser coluna gerada (public.phone_key(phone))';
  end if;
end $$;

-- 4) Bucket dos depoimentos: privado, 512 KiB, só jpeg/png/webp; nenhuma policy de storage.objects pode
--    alcançá-lo (toda policy fica restrita a um bucket_id, e nunca a este). Só o service-role assina URL.
do $$
declare
  v_nome text;
begin
  if not exists (select 1 from storage.buckets b
                  where b.id = 'recuperar-depoimentos' and b.public = false and b.file_size_limit = 524288
                    and b.allowed_mime_types is not null
                    and (select array_agg(m order by m) from unnest(b.allowed_mime_types) as m)
                        = array['image/jpeg', 'image/png', 'image/webp']) then
    raise exception 'FALHOU: bucket recuperar-depoimentos ausente ou fora do contrato (privado, 524288 bytes, jpeg/png/webp)';
  end if;
  select p.polname into v_nome
    from pg_policy p
   where p.polrelid = 'storage.objects'::regclass
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), 'bucket_id') not like '%bucket_id%'
          or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'bucket_id') not like '%bucket_id%'
          or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%recuperar-depoimentos%'
          or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%recuperar-depoimentos%')
   limit 1;
  if v_nome is not null then
    raise exception 'FALHOU: policy de storage.objects expõe o bucket: %', v_nome;
  end if;
end $$;

-- 5) Todo nome de constraint e de índice que os planos seguintes e o store do PR 7 leem existe (e, no caso
--    das constraints, está validada).
do $$
declare
  v_faltam text;
begin
  select string_agg(e.tabela || '.' || e.nome, ', ') into v_faltam
    from (values
      ('recovery_settings', 'recovery_settings_pix_p1_check'),
      ('recovery_settings', 'recovery_settings_pix_lembrete_check'),
      ('recovery_settings', 'recovery_settings_carrinho_c1_check'),
      ('recovery_settings', 'recovery_settings_carrinho_c2_check'),
      ('recovery_settings', 'recovery_settings_textos_check'),
      ('recovery_settings', 'recovery_settings_pedido_minimo_check'),
      ('recovery_settings', 'recovery_settings_numeros_check'),
      ('recovery_cases', 'recovery_cases_tenant_kind_yampi_key'),
      ('recovery_cases', 'recovery_cases_kind_check'),
      ('recovery_cases', 'recovery_cases_status_check'),
      ('recovery_cases', 'recovery_cases_tamanhos_check'),
      ('recovery_cases', 'recovery_cases_phone_check'),
      ('recovery_cases', 'recovery_cases_jid_check'),
      ('recovery_cases', 'recovery_cases_total_check'),
      ('recovery_cases', 'recovery_cases_items_check'),
      ('recovery_cases', 'recovery_cases_link_check'),
      ('recovery_cases', 'recovery_cases_step_check'),
      ('recovery_cases', 'recovery_cases_stop_reason_check'),
      ('recovery_cases', 'recovery_cases_recovered_cents_check'),
      ('recovery_cases', 'recovery_cases_recuperado_check'),
      ('recovery_cases', 'recovery_cases_agendado_check'),
      ('recovery_cases', 'recovery_cases_controle_check'),
      ('recovery_scripts', 'recovery_scripts_tenant_key_key'),
      ('recovery_scripts', 'recovery_scripts_key_check'),
      ('recovery_scripts', 'recovery_scripts_kind_check'),
      ('recovery_scripts', 'recovery_scripts_use_check'),
      ('recovery_scripts', 'recovery_scripts_title_check'),
      ('recovery_scripts', 'recovery_scripts_variants_check'),
      ('recovery_scripts', 'recovery_scripts_fixed_check'),
      ('recovery_scripts', 'recovery_scripts_chat_check'),
      ('recovery_scripts', 'recovery_scripts_automatico_check'),
      ('recovery_testimonials', 'recovery_testimonials_storage_path_key'),
      ('recovery_testimonials', 'recovery_testimonials_path_check'),
      ('recovery_testimonials', 'recovery_testimonials_caption_check'),
      ('recovery_testimonials', 'recovery_testimonials_label_check'),
      ('recovery_testimonials', 'recovery_testimonials_contadores_check'),
      ('private_messages', 'private_messages_step_key_check'),
      ('private_messages', 'private_messages_variant_check')) as e(tabela, nome)
   where not exists (select 1 from pg_constraint c
                      where c.conrelid = ('public.' || e.tabela)::regclass
                        and c.conname = e.nome and c.convalidated);
  if v_faltam is not null then
    raise exception 'FALHOU: constraints ausentes: %', v_faltam;
  end if;

  select string_agg(i.nome, ', ') into v_faltam
    from (values ('recovery_cases_agendador_idx'), ('recovery_cases_telefone_idx'),
                 ('recovery_cases_cart_token_idx'), ('recovery_cases_lista_idx'),
                 ('recovery_cases_conversa_idx'), ('recovery_testimonials_ativos_idx'),
                 ('private_messages_case_idx'), ('private_messages_script_idx')) as i(nome)
   where to_regclass('public.' || i.nome) is null;
  if v_faltam is not null then
    raise exception 'FALHOU: índices ausentes: %', v_faltam;
  end if;
end $$;

-- Daqui para baixo escreve (até o rollback). Duas lojas falsas.
insert into public.organizations (id, tenant_id, name, slug) values
  ('0ec00000-0000-4000-8000-00000000000a', '0ec00000-0000-4000-8000-00000000000a',
   'Check recuperar A', 'check-recuperar-0ec0-ta'),
  ('0ec00000-0000-4000-8000-00000000000b', '0ec00000-0000-4000-8000-00000000000b',
   'Check recuperar B', 'check-recuperar-0ec0-tb');

-- Confere que a constraint (ou o sqlstate) esperada é a que recusa, e que recusou: "aceito" e "recusado
-- por outro motivo" levantam FALHOU.
create function pg_temp.recusa(p_sql text, p_esperado text) returns void
language plpgsql as $$
declare v_constraint text; v_estado text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_constraint = constraint_name, v_estado = returned_sqlstate, v_msg = message_text;
    if p_esperado in (v_constraint, v_estado) then return; end if;
    raise exception 'FALHOU: "%" falhou por outro motivo (% / %): %', p_sql, v_estado, v_constraint, v_msg;
  end;
  raise exception 'FALHOU: aceito, deveria recusar: %', p_sql;
end $$;

-- 6) Ajustes: os padrões da ativação (automático desligado, controle ligado, Pix ligado, carrinho desligado)
--    e a recusa do que a spec não lista.
insert into public.recovery_settings (tenant_id) values ('0ec00000-0000-4000-8000-00000000000a');

do $$
declare
  s public.recovery_settings;
begin
  select * into s from public.recovery_settings where tenant_id = '0ec00000-0000-4000-8000-00000000000a';
  if not (s.automatico = false and s.pix_ligado and not s.carrinho_ligado and s.controle and s.responder_com_link
          and s.pix_espera_p1_min = 3 and s.pix_lembrete_antes_min = 10
          and s.carrinho_espera_c1 = 'dia_seguinte_10h' and s.carrinho_c2_dias = 1
          and not s.carrinho_c3_ligado and cardinality(s.numeros_ignorados) = 0) then
    raise exception 'FALHOU: os padrões de recovery_settings saíram diferentes da Decisão 7 do plano';
  end if;
end $$;

select pg_temp.recusa($q$ update public.recovery_settings set pix_espera_p1_min = 4
  where tenant_id = '0ec00000-0000-4000-8000-00000000000a' $q$, 'recovery_settings_pix_p1_check');
select pg_temp.recusa($q$ update public.recovery_settings set numeros_ignorados = array['(85) 99999-0000']
  where tenant_id = '0ec00000-0000-4000-8000-00000000000a' $q$, 'recovery_settings_numeros_check');

-- 7) Casos. phone_key igual para o mesmo celular com e sem o 55 e o 9º dígito; o que o banco recusa (link
--    com o login da cliente, JID @lid, valor zero, agendado sem horário); a unicidade por (loja, tipo, id da
--    Yampi) deixa passar o mesmo id em outro tipo e em outra loja.
do $$
declare
  v_a text;
  v_b text;
begin
  insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix', 'pk-a', '5511900000001', 15000, 'em_sequencia')
  returning phone_key into v_a;
  insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status)
  values ('0ec00000-0000-4000-8000-00000000000a', 'carrinho', 'pk-b', '1100000001', 15000, 'em_sequencia')
  returning phone_key into v_b;
  if v_a is distinct from '1100000001' or v_b is distinct from '1100000001' then
    raise exception 'FALHOU: phone_key diferente para o mesmo celular com e sem 55 e 9º dígito (% / %)', v_a, v_b;
  end if;
end $$;

select pg_temp.recusa($q$ insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status, link)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix', 'x-link', '5511900000001', 15000, 'em_sequencia',
          'https://seguro.loja.test/c/abc?customerToken=xyz') $q$, 'recovery_cases_link_check');
select pg_temp.recusa($q$ insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status, jid)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix', 'x-jid', '5511900000001', 15000, 'em_sequencia',
          '123456789012345@lid') $q$, 'recovery_cases_jid_check');
select pg_temp.recusa($q$ insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix', 'x-zero', '5511900000001', 0, 'em_sequencia') $q$,
  'recovery_cases_total_check');
select pg_temp.recusa($q$ insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix', 'x-agendado', '5511900000001', 15000, 'agendado') $q$,
  'recovery_cases_agendado_check');
select pg_temp.recusa($q$ insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix', 'pk-a', '5511900000001', 15000, 'em_sequencia') $q$,
  'recovery_cases_tenant_kind_yampi_key');

-- O mesmo id da Yampi em outro tipo (carrinho) e em outra loja passa.
insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status) values
  ('0ec00000-0000-4000-8000-00000000000a', 'carrinho', 'pk-a', '5511900000001', 15000, 'em_sequencia'),
  ('0ec00000-0000-4000-8000-00000000000b', 'pix', 'pk-a', '5511900000001', 15000, 'em_sequencia');

-- updated_at anda no update (o trigger só age em update; o insert guarda o que veio).
do $$
declare
  v_id uuid;
  v_depois timestamptz;
begin
  insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status, updated_at)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix', 'trg-1', '5511900000001', 15000, 'em_sequencia',
          now() - interval '2 days')
  returning id into v_id;
  update public.recovery_cases set stop_reason = 'x' where id = v_id;
  select updated_at into v_depois from public.recovery_cases where id = v_id;
  if v_depois < now() then
    raise exception 'FALHOU: o trigger não atualizou updated_at no update de recovery_cases';
  end if;
end $$;

-- 8) Scripts e depoimentos.
insert into public.recovery_scripts (tenant_id, key, kind, use, title, variants)
values ('0ec00000-0000-4000-8000-00000000000a', 'pix.p1', 'pix', 'automatico', 'Pix P1', array['a', 'b']);

select pg_temp.recusa($q$ insert into public.recovery_scripts (tenant_id, key, kind, use, title, variants)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix.p2', 'pix', 'chat', 'Pix P2', array['a', 'b']) $q$,
  'recovery_scripts_chat_check');
select pg_temp.recusa($q$ insert into public.recovery_scripts (tenant_id, key, kind, use, title, variants, fixed_variant)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix.p3', 'pix', 'automatico', 'Pix P3', array['a', 'b'], 3) $q$,
  'recovery_scripts_fixed_check');
select pg_temp.recusa($q$ insert into public.recovery_scripts (tenant_id, key, kind, use, title, variants)
  values ('0ec00000-0000-4000-8000-00000000000a', 'pix.p1', 'pix', 'automatico', 'Pix P1 de novo', array['a']) $q$,
  'recovery_scripts_tenant_key_key');

insert into public.recovery_testimonials (tenant_id, storage_path, caption, label, authorized_by)
values ('0ec00000-0000-4000-8000-00000000000a', '0ec00000-0000-4000-8000-00000000000a/foto-1.jpg',
        'Amei', 'Ana', '0ec00000-0000-4000-8000-0000000000aa');

-- Sem autorização a linha não existe (not null, sqlstate 23502); caminho de outra loja é recusado.
select pg_temp.recusa($q$ insert into public.recovery_testimonials (tenant_id, storage_path, caption, label)
  values ('0ec00000-0000-4000-8000-00000000000a', '0ec00000-0000-4000-8000-00000000000a/foto-2.jpg', 'Amei', 'Ana') $q$,
  '23502');
select pg_temp.recusa($q$ insert into public.recovery_testimonials (tenant_id, storage_path, caption, label, authorized_by)
  values ('0ec00000-0000-4000-8000-00000000000a', '0ec00000-0000-4000-8000-00000000000b/foto-3.jpg', 'Amei', 'Ana',
          '0ec00000-0000-4000-8000-0000000000aa') $q$, 'recovery_testimonials_path_check');

-- 9) Limpeza. Sete casos de TA com updated_at explícito: perdido 181 d, recuperado 400 d e respondeu 181 d
--    somem; parado 179 d, respondeu 10 d, agendado 181 d e em_sequencia 181 d ficam (o que espera o próximo
--    passo automático nunca some, por velho que seja). Outras lojas reais podem ter vencidos: o retorno
--    é >= 3, e o rollback desfaz tudo.
insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status, next_step_at,
                                   recovered_at, recovered_cents, updated_at)
select '0ec00000-0000-4000-8000-00000000000a', 'pix', 'lp-' || v.n, '5511900000001', 15000, v.status,
       now(), now(), 15000, now() - make_interval(days => v.dias)
  from (values (0, 'perdido', 181), (1, 'recuperado', 400), (2, 'respondeu', 181), (3, 'parado', 179),
               (4, 'respondeu', 10), (5, 'agendado', 181), (6, 'em_sequencia', 181)) as v(n, status, dias);

do $$
declare
  v_n integer;
  v_restam text;
begin
  v_n := app.limpar_dados_vencidos_recuperar();
  if v_n < 3 then
    raise exception 'FALHOU: a limpeza devolveu % (esperava >= 3)', v_n;
  end if;
  select string_agg(c.yampi_id, ',' order by c.yampi_id) into v_restam
    from public.recovery_cases c
   where c.tenant_id = '0ec00000-0000-4000-8000-00000000000a' and c.yampi_id like 'lp-%';
  if v_restam is distinct from 'lp-3,lp-4,lp-5,lp-6' then
    raise exception 'FALHOU: depois da limpeza restaram % (esperava lp-3,lp-4,lp-5,lp-6)', v_restam;
  end if;
  -- O wrapper que o cron chama devolve inteiro (nada mais vence agora).
  if public.limpar_dados_vencidos_recuperar() is null then
    raise exception 'FALHOU: public.limpar_dados_vencidos_recuperar() devolveu nulo';
  end if;
end $$;

-- Rede de segurança: se o cliente não honrar o rollback, nada disto fica.
delete from public.organizations
where id in ('0ec00000-0000-4000-8000-00000000000a', '0ec00000-0000-4000-8000-00000000000b');

rollback;

-- 10) Assinaturas para a baseline (as seis chaves da Task 3; só leitura, depois do rollback).
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature()
 where (kind = 't' and nome in ('recovery_settings', 'recovery_cases', 'recovery_scripts',
                                'recovery_testimonials', 'private_messages'))
    or (kind = 'f' and nome = 'limpar_dados_vencidos_recuperar()');
