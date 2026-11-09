-- Conferência da migração 20261109140000_envio_pelo_avisos.sql (comunidade inteira no alvo sai pelo
-- Avisos), nos DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\envio-pelo-avisos-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (7f0b…) com plano, um número dos
-- grupos conectado, três comunidades (A inteira com Avisos admin, B com Avisos sem admin, C com um grupo
-- fora do alvo), um grupo solto e quatro posts. Cada bloco levanta 'FALHOU: …' e o script para ali. Sem
-- erro, a última linha traz r = 'ok'. Antes da migração o bloco 1 falha (md5 antigo) — é o RED.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7f0b0000-0000-4000-8000-000000000001', '7f0b0000-0000-4000-8000-000000000001', 'Check envio pelo Avisos', 'check-envio-pelo-avisos-7f0b');
insert into public.subscriptions (tenant_id, plan_id, status)
select '7f0b0000-0000-4000-8000-000000000001', p.id, 'free' from public.plans p limit 1;
insert into public.instances (id, tenant_id, name, status, phone, purpose, provider_instance_id) values
  ('7f0b0000-0000-4000-8000-0000000000e1', '7f0b0000-0000-4000-8000-000000000001', 'Check grupos', 'connected', '5511999990001', 'grupos', 'gr_check_avisos');

-- Comunidade A: pai (não admin), Avisos admin, 3 grupos-membro admin.
insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin, members, community_jid, community_role) values
  ('7f0b0000-0000-4000-8000-000000000001', 'comA-check@g.us',    'Comunidade A',        false, 1,   'comA-check@g.us', 'parent'),
  ('7f0b0000-0000-4000-8000-000000000001', 'comA-check-av@g.us', 'Avisos A',            true,  300, 'comA-check@g.us', 'announce'),
  ('7f0b0000-0000-4000-8000-000000000001', 'a1-check@g.us',      'A 1',                 true,  100, 'comA-check@g.us', 'member'),
  ('7f0b0000-0000-4000-8000-000000000001', 'a2-check@g.us',      'A 2',                 true,  100, 'comA-check@g.us', 'member'),
  ('7f0b0000-0000-4000-8000-000000000001', 'a3-check@g.us',      'A 3',                 true,  100, 'comA-check@g.us', 'member'),
  -- Comunidade B: Avisos em que NÃO somos admin.
  ('7f0b0000-0000-4000-8000-000000000001', 'comB-check-av@g.us', 'Avisos B',            false, 200, 'comB-check@g.us', 'announce'),
  ('7f0b0000-0000-4000-8000-000000000001', 'b1-check@g.us',      'B 1',                 true,  100, 'comB-check@g.us', 'member'),
  ('7f0b0000-0000-4000-8000-000000000001', 'b2-check@g.us',      'B 2',                 true,  100, 'comB-check@g.us', 'member'),
  -- Comunidade C: Avisos admin, 3 grupos; o post 1 só pega 2 deles.
  ('7f0b0000-0000-4000-8000-000000000001', 'comC-check-av@g.us', 'Avisos C',            true,  300, 'comC-check@g.us', 'announce'),
  ('7f0b0000-0000-4000-8000-000000000001', 'c1-check@g.us',      'C 1',                 true,  100, 'comC-check@g.us', 'member'),
  ('7f0b0000-0000-4000-8000-000000000001', 'c2-check@g.us',      'C 2',                 true,  100, 'comC-check@g.us', 'member'),
  ('7f0b0000-0000-4000-8000-000000000001', 'c3-check@g.us',      'C 3',                 true,  100, 'comC-check@g.us', 'member'),
  -- Grupo solto.
  ('7f0b0000-0000-4000-8000-000000000001', 'l1-check@g.us',      'Solto',               true,  100, null, null);

insert into public.broadcasts (id, tenant_id, name, message, status, group_ids, mention_all) values
  ('7f0b0000-0000-4000-8000-0000000000b1', '7f0b0000-0000-4000-8000-000000000001', 'Post 1 misto', 'teste', 'draft',
   array['a1-check@g.us','a2-check@g.us','a3-check@g.us','b1-check@g.us','b2-check@g.us','c1-check@g.us','c2-check@g.us','l1-check@g.us'], true),
  ('7f0b0000-0000-4000-8000-0000000000b2', '7f0b0000-0000-4000-8000-000000000001', 'Post 2 só A', 'teste', 'draft',
   array['a1-check@g.us','a2-check@g.us','a3-check@g.us'], false),
  ('7f0b0000-0000-4000-8000-0000000000b3', '7f0b0000-0000-4000-8000-000000000001', 'Post 3 A parcial', 'teste', 'draft',
   array['a1-check@g.us','a2-check@g.us'], false),
  ('7f0b0000-0000-4000-8000-0000000000b4', '7f0b0000-0000-4000-8000-000000000001', 'Post 4 todos', 'teste', 'draft', '{}'::text[], true);

-- 1) Contrato: corpo do enqueue = o desta migração; avisos_que_cobrem security definer, search_path,
--    execute só do service_role.
do $$
declare
  p pg_proc;
begin
  select * into p from pg_proc where oid = to_regprocedure('app.enqueue_broadcast(uuid,uuid)');
  if p.oid is null then raise exception 'FALHOU: app.enqueue_broadcast ausente'; end if;
  if md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> '28f0a17697786251d87d8ae8bf927f67' then
    raise exception 'FALHOU: corpo de app.enqueue_broadcast não é o da migração 20261109140000';
  end if;
  select * into p from pg_proc where oid = to_regprocedure('app.avisos_que_cobrem(uuid,text[])');
  if p.oid is null then raise exception 'FALHOU: app.avisos_que_cobrem ausente'; end if;
  if not p.prosecdef
     or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
     or has_function_privilege('anon', p.oid, 'EXECUTE')
     or has_function_privilege('authenticated', p.oid, 'EXECUTE')
     or not has_function_privilege('service_role', p.oid, 'EXECUTE') then
    raise exception 'FALHOU: contrato de app.avisos_que_cobrem';
  end if;
end $$;

-- 2) A decisão pura: só a comunidade inteira com Avisos admin.
do $$
declare
  n int;
  r record;
begin
  select count(*) into n from app.avisos_que_cobrem('7f0b0000-0000-4000-8000-000000000001',
    array['a1-check@g.us','a2-check@g.us','a3-check@g.us','b1-check@g.us','b2-check@g.us','c1-check@g.us','c2-check@g.us','l1-check@g.us']);
  if n <> 1 then raise exception 'FALHOU: esperada 1 comunidade coberta, vieram %', n; end if;
  select * into r from app.avisos_que_cobrem('7f0b0000-0000-4000-8000-000000000001',
    array['a1-check@g.us','a2-check@g.us','a3-check@g.us','b1-check@g.us','b2-check@g.us','c1-check@g.us','c2-check@g.us','l1-check@g.us']);
  if r.community_jid <> 'comA-check@g.us' or r.aviso_jid <> 'comA-check-av@g.us'
     or r.cobertos <> array['a1-check@g.us','a2-check@g.us','a3-check@g.us'] then
    raise exception 'FALHOU: cobertura errada: % % %', r.community_jid, r.aviso_jid, r.cobertos;
  end if;
  select count(*) into n from app.avisos_que_cobrem('7f0b0000-0000-4000-8000-000000000001', array['a1-check@g.us','a2-check@g.us']);
  if n <> 0 then raise exception 'FALHOU: parcial não pode cobrir (%)', n; end if;
  select count(*) into n from app.avisos_que_cobrem('7f0b0000-0000-4000-8000-000000000001', array['b1-check@g.us','b2-check@g.us']);
  if n <> 0 then raise exception 'FALHOU: Avisos sem admin não pode cobrir (%)', n; end if;
  select count(*) into n from app.avisos_que_cobrem('7f0b0000-0000-4000-8000-000000000001', null);
  if n <> 0 then raise exception 'FALHOU: alvo nulo deveria dar 0 (%)', n; end if;
end $$;

-- 3) Post misto: A vira um envio no Avisos (sem @todos, viaAvisos), B e C seguem grupo a grupo, solto segue.
do $$
declare
  b public.broadcasts;
  jids text[];
  n int;
  pl jsonb;
begin
  b := app.enqueue_broadcast('7f0b0000-0000-4000-8000-000000000001', '7f0b0000-0000-4000-8000-0000000000b1');
  if b.status::text <> 'queued' or b.total <> 6 then raise exception 'FALHOU: post 1: status % total %', b.status, b.total; end if;
  select array_agg(c.payload->>'jid' order by c.payload->>'jid') into jids
    from public.engine_commands c where c.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and c.origin_id = '7f0b0000-0000-4000-8000-0000000000b1';
  if jids <> array['b1-check@g.us','b2-check@g.us','c1-check@g.us','c2-check@g.us','comA-check-av@g.us','l1-check@g.us'] then
    raise exception 'FALHOU: alvos do post 1: %', jids;
  end if;
  select c.payload into pl from public.engine_commands c
   where c.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and c.origin_id = '7f0b0000-0000-4000-8000-0000000000b1' and c.payload->>'jid' = 'comA-check-av@g.us';
  if (pl->>'mentionAll')::boolean or (pl->>'viaAvisos')::boolean is not true then
    raise exception 'FALHOU: payload do Avisos: %', pl;
  end if;
  select c.payload into pl from public.engine_commands c
   where c.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and c.origin_id = '7f0b0000-0000-4000-8000-0000000000b1' and c.payload->>'jid' = 'b1-check@g.us';
  if (pl->>'mentionAll')::boolean is not true or pl ? 'viaAvisos' then
    raise exception 'FALHOU: payload de grupo comum: %', pl;
  end if;
  select count(*) into n from public.engine_commands c
   where c.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and c.origin_id = '7f0b0000-0000-4000-8000-0000000000b1' and c.status::text <> 'queued';
  if n <> 0 then raise exception 'FALHOU: post 1 com comando fora de queued (%)', n; end if;
end $$;

-- 4) Só A de novo: um envio no Avisos, e o espaçamento entre posts vale para o Avisos como para
--    qualquer grupo (segundo post em menos de 2 h sai adiado).
do $$
declare
  b public.broadcasts;
  c public.engine_commands;
  n int;
begin
  b := app.enqueue_broadcast('7f0b0000-0000-4000-8000-000000000001', '7f0b0000-0000-4000-8000-0000000000b2');
  if b.status::text <> 'queued' or b.total <> 1 then raise exception 'FALHOU: post 2: status % total %', b.status, b.total; end if;
  select * into c from public.engine_commands x where x.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and x.origin_id = '7f0b0000-0000-4000-8000-0000000000b2';
  if c.payload->>'jid' <> 'comA-check-av@g.us' or (c.payload->>'adiadoPorEspacamento')::boolean is not true
     or c.available_at <= now() or (c.payload->>'mentionAll')::boolean then
    raise exception 'FALHOU: post 2: %', c.payload;
  end if;
end $$;

-- 5) A parcial (2 dos 3 grupos): grupo a grupo, nada no Avisos.
do $$
declare
  b public.broadcasts;
  jids text[];
begin
  b := app.enqueue_broadcast('7f0b0000-0000-4000-8000-000000000001', '7f0b0000-0000-4000-8000-0000000000b3');
  select array_agg(c.payload->>'jid' order by c.payload->>'jid') into jids
    from public.engine_commands c where c.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and c.origin_id = '7f0b0000-0000-4000-8000-0000000000b3';
  if b.total <> 2 or jids <> array['a1-check@g.us','a2-check@g.us'] then raise exception 'FALHOU: post 3: total % alvos %', b.total, jids; end if;
end $$;

-- 6) "Todos os grupos" (group_ids vazio): A e C colapsam; B segue grupo a grupo (Avisos sem admin não é
--    alvo nem colapsa); o pai não é admin, não entra. O Avisos de A já tem 2 posts hoje: cai no teto.
do $$
declare
  b public.broadcasts;
  jids text[];
  c public.engine_commands;
  n int;
begin
  b := app.enqueue_broadcast('7f0b0000-0000-4000-8000-000000000001', '7f0b0000-0000-4000-8000-0000000000b4');
  select array_agg(x.payload->>'jid' order by x.payload->>'jid') into jids
    from public.engine_commands x where x.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and x.origin_id = '7f0b0000-0000-4000-8000-0000000000b4';
  if jids <> array['b1-check@g.us','b2-check@g.us','comA-check-av@g.us','comC-check-av@g.us','l1-check@g.us'] then
    raise exception 'FALHOU: alvos do post 4: %', jids;
  end if;
  select * into c from public.engine_commands x
   where x.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and x.origin_id = '7f0b0000-0000-4000-8000-0000000000b4' and x.payload->>'jid' = 'comA-check-av@g.us';
  if c.status::text <> 'canceled' or (c.payload->>'foraDoTeto')::boolean is not true then
    raise exception 'FALHOU: Avisos de A deveria estar no teto: % %', c.status, c.payload;
  end if;
  select count(*) into n from public.engine_commands x
   where x.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and x.origin_id = '7f0b0000-0000-4000-8000-0000000000b4' and x.status::text = 'queued';
  if n <> 4 then raise exception 'FALHOU: post 4 deveria ter 4 na fila, tem %', n; end if;
end $$;

-- 7) Idempotente: o post 1 já está na fila; chamar de novo não refaz o fan-out.
do $$
declare
  n int;
begin
  perform app.enqueue_broadcast('7f0b0000-0000-4000-8000-000000000001', '7f0b0000-0000-4000-8000-0000000000b1');
  select count(*) into n from public.engine_commands c where c.tenant_id = '7f0b0000-0000-4000-8000-000000000001' and c.origin_id = '7f0b0000-0000-4000-8000-0000000000b1';
  if n <> 6 then raise exception 'FALHOU: fan-out repetido (% comandos)', n; end if;
end $$;

select 'ok' as r;

rollback;
