-- Conferência do PR 1a do Recuperar (base comum com o Rastreio; migração
-- 20261030120000_base_comum_yampi_privado.sql), nos DOIS bancos, depois de aplicar. Rodar de apps\web
-- (dev pode ser pelo executor; prod é do Igor, depois do migrate-prod):
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\base-comum-yampi-privado-check.sql
--
-- Existe porque o gate de drift não vê RLS, policy, ACL, CHECK, índice, trigger nem corpo de função.
-- O comportamento (constraints pelo PostgREST, phone_key, limpeza, o que o JWT da dona e o da vendedora
-- leem e não escrevem) é do
-- teste apps/web/src/lib/privado/base-comum.integration.test.ts, no job e2e, contra dev.
-- Escreve só entre begin e rollback: duas lojas falsas (ab1a0000-…) e um GRANT que só vive até o
-- rollback, para provar que é a trava (e não a falta de privilégio) que recusa a flag. Cada bloco
-- levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha traz r = as doze assinaturas da
-- baseline. Antes da migração o bloco 1 falha com 'FALHOU: tabela public.yampi_connections ausente'.

begin;

-- 1) As sete tabelas: existem, RLS ligado; anon sem privilégio nenhum (nem por coluna); service_role lê e
--    escreve. As cinco do número do atendimento: exatamente a policy <tabela>_select_member (select, só
--    authenticated, por app.user_tenant_ids) e authenticated só com SELECT. As duas da Yampi: nenhuma policy
--    e authenticated sem privilégio nenhum (credencial selada; payload cru com dado pessoal).
do $$
declare
  t text;
  r regclass;
  v_leitura boolean;
begin
  foreach t in array array['yampi_connections', 'yampi_events', 'private_conversations', 'private_messages',
                           'private_number_state', 'private_signals', 'private_optouts'] loop
    r := to_regclass('public.' || t);
    if r is null then
      raise exception 'FALHOU: tabela public.% ausente', t;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = r) then
      raise exception 'FALHOU: RLS desligado em %', t;
    end if;
    v_leitura := t like 'private\_%';
    if v_leitura then
      if (select count(*) from pg_policy p where p.polrelid = r) <> 1
         or not exists (select 1 from pg_policy p
                         where p.polrelid = r and p.polname = t || '_select_member' and p.polcmd = 'r'
                           and p.polroles = array['authenticated'::regrole]::oid[]
                           and pg_get_expr(p.polqual, p.polrelid) like '%user_tenant_ids%') then
        raise exception 'FALHOU: % sem exatamente a policy %_select_member (select, authenticated, app.user_tenant_ids)', t, t;
      end if;
    elsif exists (select 1 from pg_policy p where p.polrelid = r) then
      raise exception 'FALHOU: % tem policy (as tabelas da Yampi são só do service_role)', t;
    end if;
    if has_table_privilege('anon', r, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('anon', r, 'SELECT, INSERT, UPDATE, REFERENCES')
       or has_table_privilege('authenticated', r, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('authenticated', r,
            case when v_leitura then 'INSERT, UPDATE, REFERENCES' else 'SELECT, INSERT, UPDATE, REFERENCES' end)
       or has_table_privilege('authenticated', r, 'SELECT') <> v_leitura then
      raise exception 'FALHOU: privilégio de anon ou authenticated fora do contrato em % (authenticated só lê as private_*)', t;
    end if;
    if not (has_table_privilege('service_role', r, 'SELECT') and has_table_privilege('service_role', r, 'INSERT')
            and has_table_privilege('service_role', r, 'UPDATE') and has_table_privilege('service_role', r, 'DELETE')) then
      raise exception 'FALHOU: service_role sem leitura e escrita em %', t;
    end if;
  end loop;
end $$;

-- 2) Nomes que as stores leem no erro, colunas novas, FK, índices e gatilhos.
do $$
declare
  v_faltam text;
begin
  select string_agg(e.tabela || '.' || e.nome, ', ') into v_faltam
    from (values
      ('instances', 'instances_purpose_check'),
      ('yampi_connections', 'yampi_connections_status_check'),
      ('yampi_connections', 'yampi_connections_segredos_selados'),
      ('yampi_connections', 'yampi_connections_ativa_tem_credencial'),
      ('yampi_events', 'yampi_events_dedupe_unique'),
      ('private_conversations', 'private_conversations_telefone_unique'),
      ('private_conversations', 'private_conversations_lid_unique'),
      ('private_conversations', 'private_conversations_tem_contato'),
      ('private_messages', 'private_messages_dedupe_unique'),
      ('private_messages', 'private_messages_provider_unique'),
      ('private_messages', 'private_messages_direcao_do_autor'),
      ('private_messages', 'private_messages_envio_completo'),
      ('private_number_state', 'private_number_state_horario'),
      ('private_signals', 'private_signals_kind_check'),
      ('private_optouts', 'private_optouts_telefone_unique')) as e(tabela, nome)
   where not exists (select 1 from pg_constraint c
                      where c.conrelid = ('public.' || e.tabela)::regclass
                        and c.conname = e.nome and c.convalidated);
  if v_faltam is not null then
    raise exception 'FALHOU: constraints ausentes: %', v_faltam;
  end if;

  if coalesce((select pg_get_constraintdef(c.oid) from pg_constraint c
                where c.conrelid = 'public.memberships'::regclass
                  and c.conname = 'memberships_modules_validos'), '')
     !~ '''postar''.*''recuperar''.*''rastreio''' then
    raise exception 'FALHOU: memberships_modules_validos não aceita postar, recuperar e rastreio';
  end if;

  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.engine_commands'::regclass
                    and c.conname = 'engine_commands_private_message_id_fkey'
                    and c.contype = 'f'
                    and c.confrelid = 'public.private_messages'::regclass
                    and c.confdeltype = 'n') then
    raise exception 'FALHOU: engine_commands.private_message_id sem FK on delete set null';
  end if;

  if (select count(*) from information_schema.columns k
       where k.table_schema = 'public' and k.is_nullable = 'NO'
         and (k.table_name::text, k.column_name::text, k.column_default::text) in (
           ('instances', 'purpose', '''grupos''::text'),
           ('tenant_settings', 'recuperar_enabled', 'false'),
           ('tenant_settings', 'rastreio_enabled', 'false'))) <> 3 then
    raise exception 'FALHOU: purpose, recuperar_enabled ou rastreio_enabled sem not null e o padrão do contrato';
  end if;

  select string_agg(i.nome, ', ') into v_faltam
    from (values ('instances_one_privado_per_tenant'), ('engine_commands_private_message_idx'),
                 ('engine_commands_dm_fila_idx'), ('yampi_events_pendentes_idx'),
                 ('private_conversations_tenant_status_idx'), ('private_messages_conversation_idx'),
                 ('private_signals_instance_at_idx')) as i(nome)
   where to_regclass('public.' || i.nome) is null;
  if v_faltam is not null then
    raise exception 'FALHOU: índices ausentes: %', v_faltam;
  end if;
  if not exists (select 1 from pg_index x
                  where x.indexrelid = 'public.instances_one_privado_per_tenant'::regclass
                    and x.indisunique
                    and pg_get_expr(x.indpred, x.indrelid) = '(purpose = ''privado''::text)') then
    raise exception 'FALHOU: instances_one_privado_per_tenant tem de ser único e parcial (purpose = privado)';
  end if;

  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.tenant_settings'::regclass
                    and t.tgname = 'tenant_settings_guard_recuperar_rastreio_flags'
                    and t.tgfoid = to_regprocedure('public.tenant_settings_guard_recuperar_rastreio_flags()')
                    and t.tgtype = 23            -- row + before + insert + update
                    and t.tgenabled = 'O') then
    raise exception 'FALHOU: trigger de guarda das flags ausente ou fora de before insert or update for each row';
  end if;
  select string_agg(x.tabela, ', ') into v_faltam
    from (values ('yampi_connections'), ('private_conversations'), ('private_messages'),
                 ('private_number_state')) as x(tabela)
   where not exists (select 1 from pg_trigger t
                      where t.tgrelid = ('public.' || x.tabela)::regclass
                        and t.tgname = 'set_updated_at_' || x.tabela);
  if v_faltam is not null then
    raise exception 'FALHOU: sem trigger de updated_at em: %', v_faltam;
  end if;
end $$;

-- 3) Funções: limpeza definer com search_path e execute só do service_role; trava invoker, ninguém
--    chama direto. As colunas phone_key geradas exigem que service_role execute public.phone_key.
do $$
begin
  if exists (
    select 1
      from (values ('app.limpar_dados_vencidos_comuns()', true),
                   ('public.limpar_dados_vencidos_comuns()', true),
                   ('public.tenant_settings_guard_recuperar_rastreio_flags()', false)) as f(sig, definer)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or p.prosecdef <> f.definer
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or (f.definer and not has_function_privilege('service_role', p.oid, 'EXECUTE'))
  ) then
    raise exception 'FALHOU: funções da base fora do contrato (definer, search_path, execute só service_role)';
  end if;
  if not has_function_privilege('service_role', 'public.phone_key(text)', 'EXECUTE') then
    raise exception 'FALHOU: service_role não executa public.phone_key (as colunas geradas quebram)';
  end if;
end $$;

-- 4) Trava das flags. O servidor (aqui, postgres) liga e desliga. authenticated não tem escrita em
--    tenant_settings; o GRANT abaixo vale só até o rollback, para a recusa vir da trava.
insert into public.organizations (id, tenant_id, name, slug) values
  ('ab1a0000-0000-4000-8000-00000000000a', 'ab1a0000-0000-4000-8000-00000000000a',
   'Check base privado A', 'check-base-privado-ab1a'),
  ('ab1a0000-0000-4000-8000-00000000000b', 'ab1a0000-0000-4000-8000-00000000000b',
   'Check base privado B', 'check-base-privado-ab1b');

do $$
begin
  insert into public.tenant_settings (tenant_id, recuperar_enabled, rastreio_enabled)
  values ('ab1a0000-0000-4000-8000-00000000000a', true, true);
  update public.tenant_settings set recuperar_enabled = false, rastreio_enabled = false
   where tenant_id = 'ab1a0000-0000-4000-8000-00000000000a';
  if not found then
    raise exception 'FALHOU: o servidor não desligou as flags';
  end if;
end $$;

grant insert (tenant_id, recuperar_enabled, rastreio_enabled) on public.tenant_settings to authenticated;
set local role authenticated;

do $$
begin
  begin
    insert into public.tenant_settings (tenant_id, rastreio_enabled)
    values ('ab1a0000-0000-4000-8000-00000000000b', true);
    raise exception 'FALHOU: authenticated ligou rastreio_enabled';
  exception when insufficient_privilege then
    if sqlerrm not like '%so podem ser alterados pelo servidor%' then
      raise exception 'FALHOU: recusado por outro motivo, não pela trava: %', sqlerrm;
    end if;
  end;
end $$;

reset role;

-- Rede de segurança: se o cliente não honrar o rollback, nada disto fica.
revoke insert (tenant_id, recuperar_enabled, rastreio_enabled) on public.tenant_settings from authenticated;
delete from public.organizations
where id in ('ab1a0000-0000-4000-8000-00000000000a', 'ab1a0000-0000-4000-8000-00000000000b');

-- 5) Assinaturas para a baseline (as doze chaves do Task 2, Step 3).
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature()
 where (kind = 't' and nome in ('instances', 'engine_commands', 'tenant_settings', 'yampi_connections',
                                'yampi_events', 'private_conversations', 'private_messages',
                                'private_number_state', 'private_signals', 'private_optouts'))
    or (kind = 'f' and nome in ('limpar_dados_vencidos_comuns()',
                                'tenant_settings_guard_recuperar_rastreio_flags()'));

rollback;
