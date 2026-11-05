-- Conferência da migração 20261105120000_ig_contacts.sql (Pessoas do Instagram, PR 1a), nos DOIS bancos,
-- depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\ig-contacts-check.sql
--
-- Tudo o que escreve fica entre begin e rollback (loja descartável 1c07…). Cada bloco levanta
-- 'FALHOU: …' e o script para ali. Sem erro, a última linha traz r = 'ok'. Antes da migração o bloco 1
-- falha (tabela ausente): é o RED.
--
-- Blocos: 1 contrato (tabela, RLS, policy, ACL das 6 funções, CHECK da receita, coluna);
-- 2 gravação (limites, remoção de campo, greatest, source_flow); 3 números e valores; 4 prazos.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('1c070000-0000-4000-8000-000000000001', '1c070000-0000-4000-8000-000000000001', 'Check pessoas ig', 'check-pessoas-ig-1c07'),
  ('1c070000-0000-4000-8000-000000000002', '1c070000-0000-4000-8000-000000000002', 'Check pessoas ig 2', 'check-pessoas-ig-1c07b');

-- 1) Contrato.
do $$
begin
  if to_regclass('public.ig_contacts') is null then
    raise exception 'FALHOU: public.ig_contacts ausente';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ig_contacts'::regclass) then
    raise exception 'FALHOU: RLS desligado em ig_contacts';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.ig_contacts'::regclass and polcmd = 'r') then
    raise exception 'FALHOU: policy de leitura de ig_contacts ausente';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.ig_contacts'::regclass and polcmd <> 'r') then
    raise exception 'FALHOU: ig_contacts não pode ter policy de escrita';
  end if;
  if has_table_privilege('authenticated', 'public.ig_contacts', 'INSERT')
     or has_table_privilege('authenticated', 'public.ig_contacts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.ig_contacts', 'DELETE')
     or has_table_privilege('anon', 'public.ig_contacts', 'SELECT') then
    raise exception 'FALHOU: authenticated só lê e anon não lê ig_contacts';
  end if;

  if exists (
    select 1
      from (values
        ('public.ig_contact_apply(uuid,text,text,jsonb,text[],text[],timestamptz,boolean,uuid)'),
        ('public.ig_contact_stats(uuid)'),
        ('public.ig_contact_field_values(uuid,text)'),
        ('public.ig_purge_contacts(timestamptz)'),
        ('app.ig_merge_fields(jsonb,jsonb)'),
        ('app.ig_merge_tags(text[],text[],text[])')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or (f.sig like 'public.%' and not has_function_privilege('service_role', p.oid, 'EXECUTE'))
  ) then
    raise exception 'FALHOU: funções ausentes ou fora do contrato (execute só service_role; helpers só internos)';
  end if;

  if exists (
    select 1 from pg_proc p
     where p.oid in (
       to_regprocedure('public.ig_contact_apply(uuid,text,text,jsonb,text[],text[],timestamptz,boolean,uuid)'),
       to_regprocedure('public.ig_contact_stats(uuid)'),
       to_regprocedure('public.ig_contact_field_values(uuid,text)'),
       to_regprocedure('public.ig_purge_contacts(timestamptz)'))
       and (not p.prosecdef
            or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%'))
  ) then
    raise exception 'FALHOU: as 4 funções públicas têm que ser security definer com search_path';
  end if;

  if pg_get_constraintdef((select oid from pg_constraint where conname = 'ig_flows_recipe_check'))
     not like '%comment_choose_group%'
     or pg_get_constraintdef((select oid from pg_constraint where conname = 'ig_flows_recipe_check'))
     not like '%comment_confirm_invite%' then
    raise exception 'FALHOU: CHECK ig_flows_recipe_check sem comment_choose_group (ou perdeu valor antigo)';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tenant_settings' and column_name = 'instagram_disabled_at') then
    raise exception 'FALHOU: tenant_settings.instagram_disabled_at ausente';
  end if;
end $$;

-- 2) Gravação.
do $$
declare
  t constant uuid := '1c070000-0000-4000-8000-000000000001';
  r public.ig_contacts;
  i int;
begin
  r := public.ig_contact_apply(t, 'u1', 'ana', '{"tamanho":"Infantil","Ruim":"x","1ruim":"y"}', array['vip','Maiusculo','novo'], '{}',
                               '2026-11-01T10:00:00Z', false, null);
  if r.fields <> '{"tamanho":"Infantil"}'::jsonb then raise exception 'FALHOU: campos fora do padrão deveriam ser ignorados (%)', r.fields; end if;
  if r.tags <> array['vip','novo'] then raise exception 'FALHOU: etiqueta fora do padrão deveria ser ignorada (%)', r.tags; end if;
  if r.last_dm_at is not null then raise exception 'FALHOU: p_dm=false não pode gravar last_dm_at'; end if;

  -- mesma pessoa: mescla, tira etiqueta, campo com null some, last_seen só anda para frente, username mantém.
  r := public.ig_contact_apply(t, 'u1', null, '{"cor":"azul","tamanho":null}', array['vip'], array['novo'],
                               '2026-10-01T10:00:00Z', true, null);
  if r.fields <> '{"cor":"azul"}'::jsonb then raise exception 'FALHOU: mescla/remoção de campo errada (%)', r.fields; end if;
  if r.tags <> array['vip'] then raise exception 'FALHOU: etiquetas erradas depois do segundo apply (%)', r.tags; end if;
  if r.username <> 'ana' then raise exception 'FALHOU: username deveria ser mantido quando vem nulo'; end if;
  if r.last_seen_at <> '2026-11-01T10:00:00Z'::timestamptz then raise exception 'FALHOU: last_seen_at andou para trás'; end if;
  if r.last_dm_at <> '2026-10-01T10:00:00Z'::timestamptz then raise exception 'FALHOU: last_dm_at deveria gravar quando p_dm'; end if;
  if (select count(*) from public.ig_contacts where tenant_id = t) <> 1 then raise exception 'FALHOU: upsert duplicou a pessoa'; end if;

  -- valor longo é cortado em 200; source_flow só grava se nulo (aqui o fluxo não existe: fica nulo).
  r := public.ig_contact_apply(t, 'u1', null, jsonb_build_object('cor', repeat('a', 300)), '{}', '{}', null, false, null);
  if char_length(r.fields ->> 'cor') <> 200 then raise exception 'FALHOU: valor deveria ser cortado em 200'; end if;

  -- teto de 30 campos (cor já existe e sempre atualiza) e de 50 etiquetas.
  for i in 1..40 loop
    r := public.ig_contact_apply(t, 'u1', null, jsonb_build_object('campo' || i, 'v'), '{}', '{}', null, false, null);
  end loop;
  if (select count(*) from jsonb_object_keys(r.fields)) <> 30 then raise exception 'FALHOU: teto de 30 campos'; end if;
  r := public.ig_contact_apply(t, 'u1', null, '{"cor":"verde"}', '{}', '{}', null, false, null);
  if r.fields ->> 'cor' <> 'verde' then raise exception 'FALHOU: campo existente deveria atualizar no teto'; end if;
  for i in 1..60 loop
    r := public.ig_contact_apply(t, 'u1', null, '{}', array['t' || i], '{}', null, false, null);
  end loop;
  if cardinality(r.tags) <> 50 then raise exception 'FALHOU: teto de 50 etiquetas (%)', cardinality(r.tags); end if;
end $$;

-- 3) Números e valores de campo (loja nova, 4 pessoas).
do $$
declare
  t constant uuid := '1c070000-0000-4000-8000-000000000002';
  s jsonb;
begin
  perform public.ig_contact_apply(t, 'a', 'a', '{"tamanho":"P","cor":"azul"}', array['vip'], '{}', now(), true, null);
  perform public.ig_contact_apply(t, 'b', 'b', '{"tamanho":"P"}', array['vip','novo'], '{}', now(), false, null);
  perform public.ig_contact_apply(t, 'c', 'c', '{"tamanho":"M"}', '{}', '{}', now() - interval '3 days', true, null);
  perform public.ig_contact_apply(t, 'd', 'd', '{}', '{}', '{}', now(), false, null);
  update public.ig_contacts set first_seen_at = now() - interval '5 days' where tenant_id = t and ig_user_id = 'c';

  s := public.ig_contact_stats(t);
  if (s ->> 'total')::int <> 4 or (s ->> 'hoje')::int <> 3 or (s ->> 'janela_24h')::int <> 1 or (s ->> 'com_etiqueta')::int <> 2 then
    raise exception 'FALHOU: números errados (%)', s;
  end if;
  if s #>> '{campos,0,campo}' <> 'tamanho' or (s #>> '{campos,0,pessoas}')::int <> 3 then
    raise exception 'FALHOU: campo mais preenchido errado (%)', s -> 'campos';
  end if;
  if s #>> '{etiquetas,0,etiqueta}' <> 'vip' or (s #>> '{etiquetas,0,pessoas}')::int <> 2 then
    raise exception 'FALHOU: etiqueta mais usada errada (%)', s -> 'etiquetas';
  end if;
  if public.ig_contact_stats(gen_random_uuid()) ->> 'total' <> '0' then
    raise exception 'FALHOU: loja sem pessoa deveria dar total 0';
  end if;
  if (select jsonb_object_agg(valor, pessoas) from public.ig_contact_field_values(t, 'tamanho'))
     is distinct from '{"P": 2, "M": 1}'::jsonb then
    raise exception 'FALHOU: valores do campo tamanho errados';
  end if;
end $$;

-- 4) Prazos: 12 meses sem conversa; loja cancelada há mais de 30 dias. Só olha a loja de teste:
--    o purge varre todas as lojas, mas o rollback desfaz o que fizer nas reais.
do $$
declare
  t1 constant uuid := '1c070000-0000-4000-8000-000000000001';
  t2 constant uuid := '1c070000-0000-4000-8000-000000000002';
  r jsonb;
begin
  update public.ig_contacts set last_seen_at = now() - interval '13 months' where tenant_id = t2 and ig_user_id = 'd';
  insert into public.tenant_settings (tenant_id, instagram_enabled, instagram_disabled_at)
    values (t1, false, now() - interval '31 days')
    on conflict (tenant_id) do update set instagram_enabled = false, instagram_disabled_at = now() - interval '31 days';
  r := public.ig_purge_contacts(now());
  if (select count(*) from public.ig_contacts where tenant_id = t2 and ig_user_id = 'd') <> 0 then
    raise exception 'FALHOU: pessoa de 13 meses deveria ser apagada';
  end if;
  if (select count(*) from public.ig_contacts where tenant_id = t2) <> 3 then
    raise exception 'FALHOU: pessoas recentes não podem ser apagadas';
  end if;
  if (select count(*) from public.ig_contacts where tenant_id = t1) <> 0 then
    raise exception 'FALHOU: loja cancelada há 31 dias deveria perder as pessoas';
  end if;
  if (r ->> 'inativas')::int < 1 or (r ->> 'loja_cancelada')::int < 1 then
    raise exception 'FALHOU: contagens do purge (%)', r;
  end if;
end $$;

select 'ok' as r;

rollback;
