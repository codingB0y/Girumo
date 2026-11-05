-- Conferência da migração 20261106120000_ig_conversations.sql (Conversas do Instagram, PR 2a-1), nos DOIS bancos,
-- depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\ig-conversations-check.sql
--
-- Tudo o que escreve fica entre begin e rollback (lojas descartáveis 1c08…). Cada bloco levanta
-- 'FALHOU: …' e o script para ali. Sem erro, a última linha traz r = 'ok'. Antes da migração o bloco 1
-- falha (tabela ausente): é o RED.
--
-- Blocos: 1 contrato (tabelas, RLS, ACL, publicação do Realtime, funções); 2 touch (soma não lidas, não anda
-- para trás, status); 3 respostas prontas (teto de 50); 4 rotina (duas regras, evento, prazos).

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('1c080000-0000-4000-8000-000000000001', '1c080000-0000-4000-8000-000000000001', 'Check conversas ig', 'check-conversas-ig-1c08'),
  ('1c080000-0000-4000-8000-000000000002', '1c080000-0000-4000-8000-000000000002', 'Check conversas ig 2', 'check-conversas-ig-1c08b');

-- 1) Contrato.
do $$
declare
  tab text;
begin
  foreach tab in array array['ig_conversations', 'ig_conversation_events', 'ig_canned_replies', 'ig_contact_tombstones'] loop
    if to_regclass('public.' || tab) is null then
      raise exception 'FALHOU: public.% ausente', tab;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || tab)::regclass) then
      raise exception 'FALHOU: RLS desligado em %', tab;
    end if;
    if exists (select 1 from pg_policy where polrelid = ('public.' || tab)::regclass and polcmd <> 'r') then
      raise exception 'FALHOU: % não pode ter policy de escrita', tab;
    end if;
    if has_table_privilege('authenticated', 'public.' || tab, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || tab, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || tab, 'DELETE')
       or has_table_privilege('anon', 'public.' || tab, 'SELECT') then
      raise exception 'FALHOU: authenticated só lê e anon não lê %', tab;
    end if;
    if not has_table_privilege('service_role', 'public.' || tab, 'INSERT') then
      raise exception 'FALHOU: service_role sem acesso a %', tab;
    end if;
  end loop;

  foreach tab in array array['ig_conversations', 'ig_conversation_events', 'ig_canned_replies'] loop
    if not exists (select 1 from pg_policy where polrelid = ('public.' || tab)::regclass and polcmd = 'r') then
      raise exception 'FALHOU: policy de leitura de % ausente', tab;
    end if;
    if not has_table_privilege('authenticated', 'public.' || tab, 'SELECT') then
      raise exception 'FALHOU: authenticated precisa ler % (a RLS filtra)', tab;
    end if;
  end loop;

  if exists (select 1 from pg_policy where polrelid = 'public.ig_contact_tombstones'::regclass)
     or has_table_privilege('authenticated', 'public.ig_contact_tombstones', 'SELECT') then
    raise exception 'FALHOU: ig_contact_tombstones não pode ter leitura fora do servidor';
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ig_conversations') then
    raise exception 'FALHOU: ig_conversations fora da publicação supabase_realtime';
  end if;

  if exists (
    select 1
      from (values
        ('public.ig_conversation_touch(uuid,text,text,uuid,text,text,text,timestamptz,text,text)'),
        ('public.ig_conversations_rotina(timestamptz)')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: funções ausentes ou fora do contrato (security definer com search_path, execute só service_role)';
  end if;
end $$;

-- 2) touch.
do $$
declare
  t constant uuid := '1c080000-0000-4000-8000-000000000001';
  c public.ig_conversations;
begin
  c := public.ig_conversation_touch(t, 'z1', 'u1', null, 'ana', null, 'in', '2026-11-06T10:00:00Z', repeat('x', 300), 'waiting');
  if c.unread_count <> 1 or c.status <> 'waiting' or c.last_direction <> 'in' then
    raise exception 'FALHOU: primeira mensagem recebida (%)', to_jsonb(c);
  end if;
  if char_length(c.last_preview) <> 200 then raise exception 'FALHOU: preview deveria ser cortado em 200'; end if;

  c := public.ig_conversation_touch(t, 'z1', 'u1', null, null, 'Ana B', 'in', '2026-11-06T10:05:00Z', 'segunda', null);
  if c.unread_count <> 2 then raise exception 'FALHOU: recebida soma 1 não lida (%)', c.unread_count; end if;
  if c.status <> 'waiting' then raise exception 'FALHOU: status nulo deveria manter a situação'; end if;
  if c.username <> 'ana' or c.display_name <> 'Ana B' then raise exception 'FALHOU: nome vazio mantém, novo grava'; end if;

  -- aviso atrasado: não anda para trás e saída não soma não lida.
  c := public.ig_conversation_touch(t, 'z1', 'u1', null, null, null, 'out', '2026-11-06T09:00:00Z', 'velha', 'open');
  if c.last_message_at <> '2026-11-06T10:05:00Z'::timestamptz or c.last_preview <> 'segunda' or c.last_direction <> 'in' then
    raise exception 'FALHOU: última mensagem andou para trás (%)', to_jsonb(c);
  end if;
  if c.unread_count <> 2 then raise exception 'FALHOU: saída não pode somar não lida'; end if;
  if c.status <> 'open' then raise exception 'FALHOU: status decidido pelo servidor deveria gravar'; end if;
  if (select count(*) from public.ig_conversations where tenant_id = t) <> 1 then raise exception 'FALHOU: upsert duplicou a conversa'; end if;
end $$;

-- 3) Respostas prontas: teto de 50 por loja.
do $$
declare
  t constant uuid := '1c080000-0000-4000-8000-000000000001';
  i int;
begin
  for i in 1..50 loop
    insert into public.ig_canned_replies (tenant_id, title, text) values (t, 'r' || i, 'texto');
  end loop;
  begin
    insert into public.ig_canned_replies (tenant_id, title, text) values (t, 'r51', 'texto');
    raise exception 'FALHOU: a 51ª resposta pronta deveria ser recusada';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ig_canned_replies_limit' then raise; end if;
  end;
  insert into public.ig_canned_replies (tenant_id, title, text)
    values ('1c080000-0000-4000-8000-000000000002', 'outra loja', 'texto');
end $$;

-- 4) Rotina.
do $$
declare
  t1 constant uuid := '1c080000-0000-4000-8000-000000000001';
  t2 constant uuid := '1c080000-0000-4000-8000-000000000002';
  agora constant timestamptz := now();
  r jsonb;
begin
  delete from public.ig_conversations where tenant_id = t1;

  -- A parada: Aberta há 25 h. B ativa: Aberta há 1 h. C: Aguardando, ficha com last_dm_at há 8 dias.
  -- D: Aguardando, ficha com last_dm_at há 2 dias. E: Aguardando sem ficha, última mensagem há 8 dias.
  -- F: Resolvida antiga (não muda). G: 13 meses (apaga).
  perform public.ig_conversation_touch(t1, 'A', 'ua', null, null, null, 'in', agora - interval '25 hours', 'a', 'open');
  perform public.ig_conversation_touch(t1, 'B', 'ub', null, null, null, 'in', agora - interval '1 hour', 'b', 'open');
  perform public.ig_conversation_touch(t1, 'C', 'uc', null, null, null, 'in', agora - interval '1 hour', 'c', 'waiting');
  perform public.ig_conversation_touch(t1, 'D', 'ud', null, null, null, 'in', agora - interval '1 hour', 'd', 'waiting');
  perform public.ig_conversation_touch(t1, 'E', 'ue', null, null, null, 'in', agora - interval '8 days', 'e', 'waiting');
  perform public.ig_conversation_touch(t1, 'F', 'uf', null, null, null, 'in', agora - interval '2 days', 'f', 'resolved');
  perform public.ig_conversation_touch(t1, 'G', 'ug', null, null, null, 'in', agora - interval '13 months', 'g', 'resolved');
  perform public.ig_contact_apply(t1, 'uc', 'c', '{}', '{}', '{}', agora - interval '8 days', true, null);
  perform public.ig_contact_apply(t1, 'ud', 'd', '{}', '{}', '{}', agora - interval '2 days', true, null);

  -- marcador velho e recente; loja cancelada há 31 dias com uma conversa.
  insert into public.ig_contact_tombstones (tenant_id, ig_user_hash, deleted_at) values
    (t1, 'velho', agora - interval '13 months'), (t1, 'novo', agora - interval '1 day');
  perform public.ig_conversation_touch(t2, 'H', 'uh', null, null, null, 'in', agora, 'h', 'open');
  insert into public.tenant_settings (tenant_id, instagram_enabled, instagram_disabled_at)
    values (t2, false, agora - interval '31 days')
    on conflict (tenant_id) do update set instagram_enabled = false, instagram_disabled_at = agora - interval '31 days';

  r := public.ig_conversations_rotina(agora);

  if (select status from public.ig_conversations where tenant_id = t1 and zernio_conversation_id = 'A') <> 'resolved' then
    raise exception 'FALHOU: Aberta parada há 25 h deveria resolver';
  end if;
  if (select status from public.ig_conversations where tenant_id = t1 and zernio_conversation_id = 'B') <> 'open' then
    raise exception 'FALHOU: Aberta de 1 h não pode resolver';
  end if;
  if (select status from public.ig_conversations where tenant_id = t1 and zernio_conversation_id = 'C') <> 'resolved' then
    raise exception 'FALHOU: Aguardando com janela fechada (ficha há 8 dias) deveria resolver';
  end if;
  if (select status from public.ig_conversations where tenant_id = t1 and zernio_conversation_id = 'D') <> 'waiting' then
    raise exception 'FALHOU: Aguardando com janela aberta (ficha há 2 dias) não pode resolver';
  end if;
  if (select status from public.ig_conversations where tenant_id = t1 and zernio_conversation_id = 'E') <> 'resolved' then
    raise exception 'FALHOU: Aguardando sem ficha e última mensagem há 8 dias deveria resolver';
  end if;

  if (select array_agg(c.zernio_conversation_id || ':' || e.detail order by c.zernio_conversation_id)
        from public.ig_conversation_events e join public.ig_conversations c on c.id = e.conversation_id
       where e.tenant_id = t1 and e.kind = 'resolved')
     is distinct from array['A:parada_24h', 'C:janela_fechou', 'E:janela_fechou'] then
    raise exception 'FALHOU: eventos de resolvida errados';
  end if;

  if exists (select 1 from public.ig_conversations where tenant_id = t1 and zernio_conversation_id = 'G') then
    raise exception 'FALHOU: conversa de 13 meses deveria ser apagada';
  end if;
  if exists (select 1 from public.ig_conversations where tenant_id = t2) then
    raise exception 'FALHOU: loja cancelada há 31 dias deveria perder as conversas';
  end if;
  if (select count(*) from public.ig_contact_tombstones where tenant_id = t1) <> 1 then
    raise exception 'FALHOU: só o marcador de 13 meses deveria sumir';
  end if;

  if (r ->> 'resolvidas_parada_24h')::int < 1 or (r ->> 'resolvidas_janela_fechou')::int < 2
     or (r ->> 'apagadas_12_meses')::int < 1 or (r ->> 'apagadas_loja_cancelada')::int < 1
     or (r ->> 'marcadores_apagados')::int < 1 then
    raise exception 'FALHOU: contagens da rotina (%)', r;
  end if;
end $$;

select 'ok' as r;

rollback;
