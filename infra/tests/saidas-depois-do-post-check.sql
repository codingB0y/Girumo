-- Conferência de 20261111120000_saidas_depois_do_post.sql (public.campaign_post_leaves), nos DOIS bancos,
-- depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\saidas-depois-do-post-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: duas lojas descartáveis (7c1d…), seis grupos, posts e
-- comandos de envio terminados, entradas e saídas. Cada bloco levanta 'FALHOU: …' e o script para ali.
-- Sem erro, a última linha traz r = 'ok'. Antes da migração o bloco 1 falha (função ausente): é o RED.
--
-- O dia do roteiro, a partir de t0 = 01/11 12:00 UTC, nos grupos g1, g2, g3 (da campanha), g4 (fora
-- dela) e na comunidade X (Avisos av, membros m1 e m2, da campanha):
--   A (campanha)  t0 em g1, t0+1min em g2
--   B (campanha)  t0+1h em g1                 -- colado em A: a saída de g1 depois de t0+1h é de B
--   Z (outra)     t0+2h em g2                 -- corta a janela de A em g2; não aparece no resultado
--   D (campanha)  t0+10h em g1                -- ninguém sai depois dele
--   E (campanha)  t0+20h no Avisos de X       -- chega a m1 e m2
--   F (campanha)  t0 em g4                    -- g4 não é da campanha: F não aparece

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-000000000001', 'Check saidas depois do post', 'check-saidas-post-7c1d'),
  ('7c1d0000-0000-4000-8000-000000000002', '7c1d0000-0000-4000-8000-000000000002', 'Check saidas outra loja', 'check-saidas-outra-7c1d');

insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin, members, community_jid, community_role) values
  ('7c1d0000-0000-4000-8000-000000000001', 'g1-saidas@g.us', 'G 1', true, 100, null, null),
  ('7c1d0000-0000-4000-8000-000000000001', 'g2-saidas@g.us', 'G 2', true, 100, null, null),
  ('7c1d0000-0000-4000-8000-000000000001', 'g3-saidas@g.us', 'G 3', true, 100, null, null),
  ('7c1d0000-0000-4000-8000-000000000001', 'g4-saidas@g.us', 'G 4', true, 100, null, null),
  ('7c1d0000-0000-4000-8000-000000000001', 'x-saidas@g.us',  'Comunidade X', true, 1, 'x-saidas@g.us', 'parent'),
  ('7c1d0000-0000-4000-8000-000000000001', 'av-saidas@g.us', 'Avisos X', true, 200, 'x-saidas@g.us', 'announce'),
  ('7c1d0000-0000-4000-8000-000000000001', 'm1-saidas@g.us', 'X 1', true, 100, 'x-saidas@g.us', 'member'),
  ('7c1d0000-0000-4000-8000-000000000001', 'm2-saidas@g.us', 'X 2', true, 100, 'x-saidas@g.us', 'member');

insert into public.campaign_groups (id, tenant_id, name, slug) values
  ('7c1d0000-0000-4000-8000-0000000000c1', '7c1d0000-0000-4000-8000-000000000001', 'Campanha do check', 'check-saidas-campanha'),
  ('7c1d0000-0000-4000-8000-0000000000c2', '7c1d0000-0000-4000-8000-000000000001', 'Outra campanha', 'check-saidas-outra');

insert into public.broadcasts (id, tenant_id, campaign_group_id, name, message, status) values
  ('7c1d0000-0000-4000-8000-0000000000a1', '7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-0000000000c1', 'A', 'a', 'sent'),
  ('7c1d0000-0000-4000-8000-0000000000b1', '7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-0000000000c1', 'B', 'b', 'sent'),
  ('7c1d0000-0000-4000-8000-0000000000f2', '7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-0000000000c2', 'Z', 'z', 'sent'),
  ('7c1d0000-0000-4000-8000-0000000000d1', '7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-0000000000c1', 'D', 'd', 'sent'),
  ('7c1d0000-0000-4000-8000-0000000000e1', '7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-0000000000c1', 'E', 'e', 'sent'),
  ('7c1d0000-0000-4000-8000-0000000000f1', '7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-0000000000c1', 'F', 'f', 'sent');

-- Um comando terminado por grupo; run_id = o id do post com o último dígito trocado.
insert into public.engine_commands (tenant_id, type, status, payload, origin_kind, origin_id, origin_run_id, created_at, completed_at)
select '7c1d0000-0000-4000-8000-000000000001', 'send_message', 'done', jsonb_build_object('jid', v.jid), 'broadcast',
       v.post::uuid, (left(v.post, 35) || '9')::uuid, v.quando - interval '1 minute', v.quando
from (values
  ('7c1d0000-0000-4000-8000-0000000000a1', 'g1-saidas@g.us',  timestamptz '2026-11-01 12:00+00'),
  ('7c1d0000-0000-4000-8000-0000000000a1', 'g2-saidas@g.us',  timestamptz '2026-11-01 12:01+00'),
  ('7c1d0000-0000-4000-8000-0000000000b1', 'g1-saidas@g.us',  timestamptz '2026-11-01 13:00+00'),
  ('7c1d0000-0000-4000-8000-0000000000f2', 'g2-saidas@g.us',  timestamptz '2026-11-01 14:00+00'),
  ('7c1d0000-0000-4000-8000-0000000000d1', 'g1-saidas@g.us',  timestamptz '2026-11-01 22:00+00'),
  ('7c1d0000-0000-4000-8000-0000000000e1', 'av-saidas@g.us',  timestamptz '2026-11-02 08:00+00'),
  ('7c1d0000-0000-4000-8000-0000000000f1', 'g4-saidas@g.us',  timestamptz '2026-11-01 12:00+00')
) as v(post, jid, quando);

-- Comando que falhou não é entrega: se contasse, ele cortaria a janela de B em g1 às 13:30.
insert into public.engine_commands (tenant_id, type, status, payload, origin_kind, origin_id, origin_run_id, created_at, failed_at)
values ('7c1d0000-0000-4000-8000-000000000001', 'send_message', 'failed', '{"jid":"g1-saidas@g.us"}', 'broadcast',
        '7c1d0000-0000-4000-8000-0000000000f2', '7c1d0000-0000-4000-8000-0000000000f9',
        timestamptz '2026-11-01 13:29+00', timestamptz '2026-11-01 13:30+00');

insert into public.group_member_events (tenant_id, whatsapp_group_id, participant, kind, occurred_at) values
  -- A: g1 às 12:30 e g2 às 13:30 (a janela de g2 vai até Z, 14:00).
  ('7c1d0000-0000-4000-8000-000000000001', 'g1-saidas@g.us', 'p1@lid', 'leave', '2026-11-01 12:30+00'),
  ('7c1d0000-0000-4000-8000-000000000001', 'g2-saidas@g.us', 'p2@lid', 'leave', '2026-11-01 13:30+00'),
  -- Entrada não é saída.
  ('7c1d0000-0000-4000-8000-000000000001', 'g1-saidas@g.us', 'p3@lid', 'join', '2026-11-01 12:10+00'),
  -- g3 não recebeu A: a saída de g3 não é de ninguém.
  ('7c1d0000-0000-4000-8000-000000000001', 'g3-saidas@g.us', 'p4@lid', 'leave', '2026-11-01 12:30+00'),
  -- Depois de Z em g2: de Z, que é de outra campanha.
  ('7c1d0000-0000-4000-8000-000000000001', 'g2-saidas@g.us', 'p5@lid', 'leave', '2026-11-01 14:30+00'),
  -- B: g1 às 13:30 e às 15:30 (a janela de B vai até 16:00).
  ('7c1d0000-0000-4000-8000-000000000001', 'g1-saidas@g.us', 'p6@lid', 'leave', '2026-11-01 13:30+00'),
  ('7c1d0000-0000-4000-8000-000000000001', 'g1-saidas@g.us', 'p7@lid', 'leave', '2026-11-01 15:30+00'),
  -- Mais de 3 h depois de B e antes de D: de ninguém.
  ('7c1d0000-0000-4000-8000-000000000001', 'g1-saidas@g.us', 'p8@lid', 'leave', '2026-11-01 17:00+00'),
  -- E pelo Avisos: m1 e m2.
  ('7c1d0000-0000-4000-8000-000000000001', 'm1-saidas@g.us', 'p9@lid', 'leave', '2026-11-02 08:30+00'),
  ('7c1d0000-0000-4000-8000-000000000001', 'm2-saidas@g.us', 'p10@lid', 'leave', '2026-11-02 09:00+00'),
  -- Outra loja, mesmo grupo e mesma hora: não entra na conta desta.
  ('7c1d0000-0000-4000-8000-000000000002', 'g1-saidas@g.us', 'p11@lid', 'leave', '2026-11-01 12:20+00');

-- 1) Contrato: existe, é invoker com search_path, e só o service_role executa.
do $$
declare
  f oid := to_regprocedure('public.campaign_post_leaves(uuid,uuid,text[],timestamptz,timestamptz)');
begin
  if f is null then raise exception 'FALHOU: public.campaign_post_leaves não existe'; end if;
  if (select prosecdef from pg_proc where oid = f) then raise exception 'FALHOU: a função é security definer'; end if;
  if not exists (select 1 from pg_proc where oid = f and proconfig::text like '%search_path=%') then
    raise exception 'FALHOU: sem search_path fixo';
  end if;
  if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
    raise exception 'FALHOU: anon ou authenticated executa a função';
  end if;
  if not has_function_privilege('service_role', f, 'execute') then
    raise exception 'FALHOU: service_role não executa a função';
  end if;
end $$;

-- 2) A regra no roteiro do dia.
do $$
declare
  obtido text;
  esperado text := 'a1 grupos=2 sairam=2 de=2026-11-01 12:00 ate=2026-11-01 14:00'
    || ' | b1 grupos=1 sairam=2 de=2026-11-01 13:00 ate=2026-11-01 16:00'
    || ' | d1 grupos=1 sairam=0 de=2026-11-01 22:00 ate=2026-11-02 01:00'
    || ' | e1 grupos=2 sairam=2 de=2026-11-02 08:00 ate=2026-11-02 11:00';
begin
  select string_agg(format('%s grupos=%s sairam=%s de=%s ate=%s', right(r.broadcast_id::text, 2), r.grupos, r.sairam,
                           to_char(r.sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
                           to_char(r.conta_ate at time zone 'UTC', 'YYYY-MM-DD HH24:MI')), ' | ' order by right(r.broadcast_id::text, 2))
    into obtido
    from public.campaign_post_leaves(
      '7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-0000000000c1',
      array['g1-saidas@g.us', 'g2-saidas@g.us', 'g3-saidas@g.us', 'av-saidas@g.us', 'm1-saidas@g.us', 'm2-saidas@g.us'],
      '2026-11-01 00:00+00', '2026-11-03 00:00+00') r;
  if obtido is distinct from esperado then
    raise exception 'FALHOU: regra de atribuição. esperado [%] obtido [%]', esperado, obtido;
  end if;
end $$;

-- 3) Outra loja não vê nada da primeira, nem com os mesmos grupos e a mesma campanha.
do $$
begin
  if exists (
    select 1 from public.campaign_post_leaves(
      '7c1d0000-0000-4000-8000-000000000002', '7c1d0000-0000-4000-8000-0000000000c1',
      array['g1-saidas@g.us', 'g2-saidas@g.us'], '2026-11-01 00:00+00', '2026-11-03 00:00+00')
  ) then
    raise exception 'FALHOU: a outra loja leu posts da primeira';
  end if;
end $$;

-- 4) Janela acima de 45 dias não volta nada (o mesmo teto das outras funções da série).
do $$
begin
  if exists (
    select 1 from public.campaign_post_leaves(
      '7c1d0000-0000-4000-8000-000000000001', '7c1d0000-0000-4000-8000-0000000000c1',
      array['g1-saidas@g.us'], '2026-10-01 00:00+00', '2026-11-30 00:00+00')
  ) then
    raise exception 'FALHOU: janela de 60 dias respondeu';
  end if;
end $$;

select 'ok' as r;

rollback;
