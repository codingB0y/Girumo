-- Conferência da migração 20261029160000_numero_do_atendimento.sql (o número do atendimento fica fora
-- de todo seletor de post no banco), nos DOIS bancos. Rodar de apps\web:
--   npx supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   npx supabase db query --linked -o json -f ../../infra/tests/numero-do-atendimento-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (a7e0…) com o número dos grupos
-- conectado há 30 dias e o do atendimento conectado agora (é ele que o order by de antes escolhia), um
-- grupo administrado e comandos de envio. Cada bloco levanta 'FALHOU: …' e o script para ali. Sem erro,
-- a última linha traz r = 'ok'.
--
-- Antes da migração o bloco 1 falha com "o post saiu pelo número do atendimento": é o RED, e é também o
-- mutante — o corpo de hoje é o seletor sem o filtro.
--
-- Só toca a loja do check: enqueue_broadcast, o claim (p_tenant) e o disjuntor recebem o tenant dela.
-- Escreve, mesmo com rollback: em prod é do Igor.
--
-- O comando de DM do bloco 4 leva dm_module/valid_until (PR 1a) e private_message_id nulo. Se o PR 1a
-- tiver posto CHECK exigindo private_message_id em dm_text, criar antes a conversa e a mensagem da loja
-- do check e apontar para ela.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('a7e00000-0000-4000-8000-000000000001', 'a7e00000-0000-4000-8000-000000000001',
   'Check numero do atendimento', 'check-numero-atendimento-a7e0');

insert into public.instances (id, tenant_id, name, status, purpose, phone, provider_instance_id, connected_at) values
  ('a7e00000-0000-4000-8000-0000000000e1', 'a7e00000-0000-4000-8000-000000000001',
   'Check grupos', 'connected', 'grupos', '5562999990001', 'gr_check_atend_grupos', now() - interval '30 days'),
  ('a7e00000-0000-4000-8000-0000000000e2', 'a7e00000-0000-4000-8000-000000000001',
   'Check atendimento', 'connected', 'privado', '5562988880002', 'gr_check_atend_privado', now());

-- Um grupo administrado com 100 membros: limite do disjuntor = max(30, 1% de 100) = 30.
insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin, members) values
  ('a7e00000-0000-4000-8000-000000000001', 'atend-g1@g.us', 'Check grupo 1', true, 100);

-- 1) O post sai pelo número dos grupos, mesmo com o do atendimento conectado depois.
do $$
declare
  t    constant uuid := 'a7e00000-0000-4000-8000-000000000001';
  g    constant uuid := 'a7e00000-0000-4000-8000-0000000000e1';
  v_id uuid;
  b    public.broadcasts;
begin
  insert into public.broadcasts (tenant_id, name, message, group_ids, status)
  values (t, 'Check atendimento A', 'oferta', array['atend-g1@g.us'], 'draft')
  returning id into v_id;
  b := app.enqueue_broadcast(t, v_id);
  if b.status is distinct from 'queued' or b.total <> 1 then
    raise exception 'FALHOU: o post deveria entrar na fila: status %, total %, error %', b.status, b.total, b.error;
  end if;
  if exists (select 1 from public.engine_commands c
             where c.origin_id = v_id and c.origin_run_id = b.run_id
               and c.instance_id is distinct from g) then
    raise exception 'FALHOU: o post saiu pelo número do atendimento';
  end if;
end $$;

-- 2) Só o número do atendimento conectado: o post falha como "sem número" e nenhum comando nasce.
do $$
declare
  t    constant uuid := 'a7e00000-0000-4000-8000-000000000001';
  g    constant uuid := 'a7e00000-0000-4000-8000-0000000000e1';
  v_id uuid;
  b    public.broadcasts;
begin
  update public.instances set status = 'disconnected' where id = g;
  insert into public.broadcasts (tenant_id, name, message, group_ids, status)
  values (t, 'Check atendimento B', 'oferta', array['atend-g1@g.us'], 'draft')
  returning id into v_id;
  b := app.enqueue_broadcast(t, v_id);
  if b.status is distinct from 'failed' or b.error is distinct from 'Nenhum número conectado para disparar.' then
    raise exception 'FALHOU: sem o número dos grupos o post deveria falhar como sem número: status %, error %',
      b.status, b.error;
  end if;
  if exists (select 1 from public.engine_commands c where c.origin_id = v_id) then
    raise exception 'FALHOU: nasceu comando de post sem o número dos grupos';
  end if;
  update public.instances set status = 'connected' where id = g;
end $$;

-- 3) Teto, saúde e claim: o número do atendimento não tem teto de post, não aparece na saúde do número e
--    o claim de post nunca pega comando de grupo nele; o comando do número dos grupos (bloco 1) sai.
do $$
declare
  t constant uuid := 'a7e00000-0000-4000-8000-000000000001';
  g constant uuid := 'a7e00000-0000-4000-8000-0000000000e1';
  p constant uuid := 'a7e00000-0000-4000-8000-0000000000e2';
begin
  if exists (select 1 from app.instance_caps(p)) then
    raise exception 'FALHOU: o número do atendimento ganhou teto de post';
  end if;
  if not exists (select 1 from app.instance_caps(g)) then
    raise exception 'FALHOU: o número dos grupos perdeu o teto de post';
  end if;
  if exists (select 1 from public.instance_health(t) h where h.instance_id = p) then
    raise exception 'FALHOU: o número do atendimento apareceu na saúde do número';
  end if;
  if not exists (select 1 from public.instance_health(t) h where h.instance_id = g) then
    raise exception 'FALHOU: o número dos grupos sumiu da saúde do número';
  end if;

  insert into public.engine_commands (id, tenant_id, instance_id, type, status, payload, available_at) values
    ('a7e00000-0000-4000-8000-0000000000c1', t, p, 'send_message', 'queued',
     '{"jid": "atend-g1@g.us", "text": "x"}', now());
  perform app.claim_send_commands(10, t);
  -- queued até o PR 3; depois dele, canceled com o motivo (o claim de grupos cancela comando de grupo em
  -- número que não é 'grupos'). Nos dois casos, nunca processing.
  if (select c.status from public.engine_commands c where c.id = 'a7e00000-0000-4000-8000-0000000000c1')
     not in ('queued', 'canceled') then
    raise exception 'FALHOU: o claim de post pegou comando de grupo no número do atendimento';
  end if;
  if not exists (select 1 from public.engine_commands c
                 where c.tenant_id = t and c.instance_id = g and c.status = 'processing') then
    raise exception 'FALHOU: o claim de post deveria ter pegado o comando do número dos grupos';
  end if;
end $$;

-- 4) Disjuntor: envio só do número do atendimento nas últimas 3 h não conta (sem_envio). Com envio do
--    número dos grupos, 30 saídas abrem o disjuntor e os posts na fila caem; o comando de DM fica.
do $$
declare
  t constant uuid := 'a7e00000-0000-4000-8000-000000000001';
  g constant uuid := 'a7e00000-0000-4000-8000-0000000000e1';
  p constant uuid := 'a7e00000-0000-4000-8000-0000000000e2';
  r jsonb;
begin
  insert into public.instance_sends (instance_id, sent_at) values (p, now() - interval '20 minutes');
  insert into public.engine_events (tenant_id, instance_id, type, payload, created_at)
  select t, g, 'group-participants.update',
         jsonb_build_object('data', jsonb_build_object(
           'id', 'atend-g1@g.us', 'action', 'remove', 'author', 'p' || n || '@lid',
           'participants', jsonb_build_array(jsonb_build_object('id', 'p' || n || '@lid')))),
         now() - interval '10 minutes'
  from generate_series(1, 30) n;

  r := public.avaliar_disjuntor_saidas(t);
  if (r->>'aberto')::boolean or r->>'motivo' is distinct from 'sem_envio' then
    raise exception 'FALHOU: envio só do número do atendimento não deveria contar para o disjuntor, veio %', r;
  end if;

  insert into public.instance_sends (instance_id, sent_at) values (g, now() - interval '20 minutes');
  insert into public.engine_commands (id, tenant_id, instance_id, type, status, payload, available_at,
                                      dm_module, valid_until) values
    ('a7e00000-0000-4000-8000-0000000000c2', t, p, 'dm_text', 'queued', '{}', now(),
     'teste', now() + interval '1 hour');
  r := public.avaliar_disjuntor_saidas(t);
  if not coalesce((r->>'aberto')::boolean, false) or not coalesce((r->>'novo')::boolean, false) then
    raise exception 'FALHOU: 30 saídas com envio do número dos grupos deveriam abrir o disjuntor, veio %', r;
  end if;
  if (select c.status from public.engine_commands c where c.id = 'a7e00000-0000-4000-8000-0000000000c2')
     is distinct from 'queued' then
    raise exception 'FALHOU: o disjuntor de saídas cancelou um comando de DM';
  end if;
  if exists (select 1 from public.engine_commands c
             where c.tenant_id = t and c.status = 'queued'
               and c.type in ('send_message', 'send_media', 'send_poll')) then
    raise exception 'FALHOU: o disjuntor deveria cancelar os posts na fila';
  end if;
end $$;

-- 5) Contrato: os corpos são os desta migração (md5 normalizado, como na trava), security definer com
--    search_path e execute só do service_role.
do $$
begin
  if exists (
    select 1
      from (values
        ('app.enqueue_broadcast(uuid,uuid)', '568df07ab69fc81d8473e724b81c69b4'),
        ('app.instance_caps(uuid)', 'e60de0eda8f02f171ec9cd2739cd0a7c'),
        ('public.avaliar_disjuntor_saidas(uuid)', '448edbce30d6ac74449ba9b7be6980ee')) as f(sig, md5)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> f.md5
  ) then
    raise exception 'FALHOU: corpo de função diferente do da migração 20261029160000';
  end if;

  if exists (
    select 1
      from (values
        ('app.enqueue_broadcast(uuid,uuid)'),
        ('app.instance_caps(uuid)'),
        ('public.avaliar_disjuntor_saidas(uuid)')) as f(sig)
      join pg_proc p on p.oid = to_regprocedure(f.sig)
     where not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: funções fora do contrato (security definer, search_path, execute só service_role)';
  end if;
end $$;

select 'ok' as r;

rollback;
