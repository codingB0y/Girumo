-- Conferência do PR 6 do postar por grupo (migração 20261017130000_grupo_uma_campanha.sql), nos
-- DOIS bancos, depois de aplicar. Rodar de apps\web:
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\grupo-uma-campanha-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: duas lojas descartáveis, campanhas e um grupo,
-- com uuids 6a7e…. Cada bloco levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha
-- traz `r` com a assinatura das duas funções para a baseline — o gate de drift não vê trigger,
-- schema app, ACL nem corpo de função; é este arquivo que prova isso nos dois bancos.
--
-- Antes da migração o bloco 1 falha com 'FALHOU: trigger campaign_groups_grupo_exclusivo
-- ausente ou desligado' — é o RED.
--
-- Lojas: TA = 6a7e0000-0000-4000-8000-000000000001, TB = 6a7e0000-0000-4000-8000-000000000002.
-- Campanhas: A1 (TA, a mais antiga), A2 (TA), B1 (TB), A3 (TA, recusada no bloco 2) e A4 (nasce
-- em TB e muda para TA no bloco 6: o trigger só olha group_ids, então mudar de loja simula um
-- conflito ANTIGO sem DDL).

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('6a7e0000-0000-4000-8000-000000000001', '6a7e0000-0000-4000-8000-000000000001',
   'Check grupo exclusivo TA', 'check-grupo-exclusivo-6a7e-ta'),
  ('6a7e0000-0000-4000-8000-000000000002', '6a7e0000-0000-4000-8000-000000000002',
   'Check grupo exclusivo TB', 'check-grupo-exclusivo-6a7e-tb');

-- 1) Trigger ligado; RPCs com a ACL do contrato; função do trigger fora do alcance de anon/authenticated.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.campaign_groups'::regclass
       and tgname = 'campaign_groups_grupo_exclusivo'
       and tgenabled = 'O'
  ) then
    raise exception 'FALHOU: trigger campaign_groups_grupo_exclusivo ausente ou desligado';
  end if;

  if exists (
    select 1
      from (values
        ('public.grupos_em_mais_de_uma_campanha(uuid)'),
        ('public.reordenar_campanha(uuid,uuid,text[],text[])')) as f(sig)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: grupos_em_mais_de_uma_campanha/reordenar_campanha fora do contrato (security definer, search_path, execute so service_role)';
  end if;

  if has_function_privilege('anon', 'app.campaign_groups_grupo_exclusivo()', 'EXECUTE')
     or has_function_privilege('authenticated', 'app.campaign_groups_grupo_exclusivo()', 'EXECUTE') then
    raise exception 'FALHOU: app.campaign_groups_grupo_exclusivo() executavel por anon/authenticated';
  end if;
end $$;

insert into public.campaign_groups (id, tenant_id, name, slug, group_ids, created_at) values
  ('6a7e0000-0000-4000-8000-0000000000a1', '6a7e0000-0000-4000-8000-000000000001', 'Check A1', 'check-a1',
   array['check-g1@g.us', 'check-g2@g.us'], now() - interval '3 hours'),
  ('6a7e0000-0000-4000-8000-0000000000a2', '6a7e0000-0000-4000-8000-000000000001', 'Check A2', 'check-a2',
   array['check-g3@g.us'], now() - interval '2 hours'),
  -- Mesmo check-g1 de A1, mas em OUTRA loja: tem de entrar.
  ('6a7e0000-0000-4000-8000-0000000000b1', '6a7e0000-0000-4000-8000-000000000002', 'Check B1', 'check-b1',
   array['check-g1@g.us'], now() - interval '1 hour');

insert into public.groups (tenant_id, whatsapp_group_id, name) values
  ('6a7e0000-0000-4000-8000-000000000001', 'check-g3@g.us', 'Grupo tres do check');

-- 2) JID novo que já está noutra campanha da loja: recusado no update e no insert, com a mensagem
--    do contrato apontando a campanha que já tem o grupo.
do $$
declare
  v_msg text;
begin
  begin
    update public.campaign_groups
       set group_ids = group_ids || 'check-g1@g.us'::text
     where id = '6a7e0000-0000-4000-8000-0000000000a2';
    raise exception 'FALHOU: update pos check-g1 em A2, que ja esta em A1';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from 'grupo_em_outra_campanha:check-g1@g.us:6a7e0000-0000-4000-8000-0000000000a1' then
      raise exception 'FALHOU: mensagem do update = %', v_msg;
    end if;
  end;

  begin
    insert into public.campaign_groups (id, tenant_id, name, slug, group_ids) values
      ('6a7e0000-0000-4000-8000-0000000000a3', '6a7e0000-0000-4000-8000-000000000001', 'Check A3', 'check-a3',
       array['check-g9@g.us', 'check-g2@g.us']);
    raise exception 'FALHOU: insert de A3 com check-g2, que ja esta em A1';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from 'grupo_em_outra_campanha:check-g2@g.us:6a7e0000-0000-4000-8000-0000000000a1' then
      raise exception 'FALHOU: mensagem do insert = %', v_msg;
    end if;
  end;
end $$;

-- 3) A trava é por loja: JID é id global do WhatsApp e duas lojas podem administrar o mesmo grupo.
do $$
begin
  update public.campaign_groups
     set group_ids = group_ids || 'check-g2@g.us'::text
   where id = '6a7e0000-0000-4000-8000-0000000000b1';
  if not exists (
    select 1 from public.campaign_groups
     where id = '6a7e0000-0000-4000-8000-0000000000b1'
       and group_ids = array['check-g1@g.us', 'check-g2@g.us']
  ) then
    raise exception 'FALHOU: B1 (outra loja) deveria aceitar check-g2';
  end if;
end $$;

-- 4) campaign_group_append_group_id (auto-grow, tela de comunidades) passa pelo mesmo trigger;
--    grupo livre entra e repetido continua idempotente.
do $$
declare
  v_msg text;
begin
  begin
    perform public.campaign_group_append_group_id(
      '6a7e0000-0000-4000-8000-000000000001', '6a7e0000-0000-4000-8000-0000000000a2', 'check-g2@g.us');
    raise exception 'FALHOU: append de check-g2 em A2 passou';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from 'grupo_em_outra_campanha:check-g2@g.us:6a7e0000-0000-4000-8000-0000000000a1' then
      raise exception 'FALHOU: mensagem do append = %', v_msg;
    end if;
  end;

  perform public.campaign_group_append_group_id(
    '6a7e0000-0000-4000-8000-000000000001', '6a7e0000-0000-4000-8000-0000000000a2', 'check-g7@g.us');
  perform public.campaign_group_append_group_id(
    '6a7e0000-0000-4000-8000-000000000001', '6a7e0000-0000-4000-8000-0000000000a2', 'check-g3@g.us');
  if not exists (
    select 1 from public.campaign_groups
     where id = '6a7e0000-0000-4000-8000-0000000000a2'
       and group_ids = array['check-g3@g.us', 'check-g7@g.us']
  ) then
    raise exception 'FALHOU: A2 deveria ser [check-g3, check-g7] depois dos appends';
  end if;
end $$;

-- 5) O mesmo JID repetido na MESMA campanha não é conflito (o pool usa a menor posição, PR 1).
do $$
begin
  update public.campaign_groups
     set group_ids = array['check-g7@g.us', 'check-g3@g.us', 'check-g7@g.us', 'check-g3@g.us']
   where id = '6a7e0000-0000-4000-8000-0000000000a2';
exception when unique_violation then
  raise exception 'FALHOU: JID repetido dentro de A2 foi tratado como conflito';
end $$;

-- 6) Conflito ANTIGO não trava nada. A4 nasce em TB com check-g3 (livre lá) e muda para TA sem
--    tocar group_ids — o trigger não dispara —, ficando em conflito com A2. Daí: reordenar e pôr
--    grupo livre passam; pôr grupo de outra campanha continua recusado.
insert into public.campaign_groups (id, tenant_id, name, slug, group_ids, created_at) values
  ('6a7e0000-0000-4000-8000-0000000000a4', '6a7e0000-0000-4000-8000-000000000002', 'Check A4', 'check-a4',
   array['check-g3@g.us', 'check-g5@g.us'], now() - interval '30 minutes');
update public.campaign_groups
   set tenant_id = '6a7e0000-0000-4000-8000-000000000001'
 where id = '6a7e0000-0000-4000-8000-0000000000a4';

do $$
declare
  v_msg text;
begin
  update public.campaign_groups
     set group_ids = array['check-g6@g.us', 'check-g5@g.us', 'check-g3@g.us']
   where id = '6a7e0000-0000-4000-8000-0000000000a4';

  begin
    update public.campaign_groups
       set group_ids = group_ids || 'check-g1@g.us'::text
     where id = '6a7e0000-0000-4000-8000-0000000000a4';
    raise exception 'FALHOU: check-g1 (de A1) entrou em A4 por ela ter conflito antigo';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from 'grupo_em_outra_campanha:check-g1@g.us:6a7e0000-0000-4000-8000-0000000000a1' then
      raise exception 'FALHOU: mensagem com conflito antigo = %', v_msg;
    end if;
  end;
exception when unique_violation then
  raise exception 'FALHOU: conflito antigo (check-g3 em A2 e A4) travou a edicao de A4';
end $$;

-- 7) A lista de conflitos: um JID por linha, cada campanha uma vez (menor posição), na ordem de
--    criação; check-g7 repetido só dentro de A2 não aparece; a loja TB não vê nada de TA.
do $$
declare
  v_linhas integer;
  v_nome text;
  v_campanhas jsonb;
begin
  select count(*) into v_linhas
    from public.grupos_em_mais_de_uma_campanha('6a7e0000-0000-4000-8000-000000000001');
  if v_linhas <> 1 then
    raise exception 'FALHOU: TA deveria ter 1 grupo em conflito, veio %', v_linhas;
  end if;

  select x.name, x.campanhas into v_nome, v_campanhas
    from public.grupos_em_mais_de_uma_campanha('6a7e0000-0000-4000-8000-000000000001') as x
   where x.whatsapp_group_id = 'check-g3@g.us';
  if v_nome is distinct from 'Grupo tres do check' then
    raise exception 'FALHOU: nome do grupo = %', v_nome;
  end if;
  if v_campanhas is distinct from jsonb_build_array(
       jsonb_build_object('id', '6a7e0000-0000-4000-8000-0000000000a2', 'name', 'Check A2', 'slug', 'check-a2', 'posicao', 2),
       jsonb_build_object('id', '6a7e0000-0000-4000-8000-0000000000a4', 'name', 'Check A4', 'slug', 'check-a4', 'posicao', 3)) then
    raise exception 'FALHOU: campanhas de check-g3 = %', v_campanhas;
  end if;

  if exists (select 1 from public.grupos_em_mais_de_uma_campanha('6a7e0000-0000-4000-8000-000000000002')) then
    raise exception 'FALHOU: TB nao tem conflito (check-g1 esta em B1 e em A1, mas A1 e de TA)';
  end if;
end $$;

-- 8) reordenar_campanha grava só se a lista é a que a tela viu e a nova é permutação dela.
do $$
declare
  ta constant uuid := '6a7e0000-0000-4000-8000-000000000001';
  a4 constant uuid := '6a7e0000-0000-4000-8000-0000000000a4';
  v_atual text[];
begin
  if public.reordenar_campanha(ta, a4, array['check-g5@g.us', 'check-g3@g.us'],
                               array['check-g3@g.us', 'check-g5@g.us']) then
    raise exception 'FALHOU: reordenou com esperado desatualizado (faltou check-g6)';
  end if;
  if public.reordenar_campanha(ta, a4, array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                               array['check-g3@g.us', 'check-g5@g.us']) then
    raise exception 'FALHOU: nova sem check-g6 foi aceita';
  end if;
  if public.reordenar_campanha(ta, a4, array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                               array['check-g3@g.us', 'check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us']) then
    raise exception 'FALHOU: nova com repetido foi aceita';
  end if;
  if public.reordenar_campanha(ta, a4, array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                               array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us', 'check-g8@g.us']) then
    raise exception 'FALHOU: nova com grupo a mais foi aceita';
  end if;
  if public.reordenar_campanha('6a7e0000-0000-4000-8000-000000000002', a4,
                               array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                               array['check-g3@g.us', 'check-g6@g.us', 'check-g5@g.us']) then
    raise exception 'FALHOU: reordenou campanha de outra loja';
  end if;
  select group_ids into v_atual from public.campaign_groups where id = a4;
  if v_atual is distinct from array['check-g6@g.us', 'check-g5@g.us', 'check-g3@g.us'] then
    raise exception 'FALHOU: uma recusa mexeu na lista: %', v_atual;
  end if;

  -- Válido: esperado em qualquer ordem; o conflito antigo de check-g3 não trava.
  if not public.reordenar_campanha(ta, a4, array['check-g3@g.us', 'check-g5@g.us', 'check-g6@g.us'],
                                   array['check-g3@g.us', 'check-g6@g.us', 'check-g5@g.us']) then
    raise exception 'FALHOU: permutacao valida recusada';
  end if;
  select group_ids into v_atual from public.campaign_groups where id = a4;
  if v_atual is distinct from array['check-g3@g.us', 'check-g6@g.us', 'check-g5@g.us'] then
    raise exception 'FALHOU: A4 = % depois de reordenar', v_atual;
  end if;

  -- Repetido dentro da campanha some na ordem nova (A2 era [g7, g3, g7, g3]).
  if not public.reordenar_campanha(ta, '6a7e0000-0000-4000-8000-0000000000a2',
                                   array['check-g3@g.us', 'check-g7@g.us'],
                                   array['check-g3@g.us', 'check-g7@g.us']) then
    raise exception 'FALHOU: reordenar A2 (com repetido) recusado';
  end if;
  select group_ids into v_atual from public.campaign_groups where id = '6a7e0000-0000-4000-8000-0000000000a2';
  if v_atual is distinct from array['check-g3@g.us', 'check-g7@g.us'] then
    raise exception 'FALHOU: A2 = % depois de reordenar', v_atual;
  end if;
end $$;

rollback;

-- Assinatura para a baseline (fora da transação; só leitura). Esperado nos DOIS bancos:
--   f|grupos_em_mais_de_uma_campanha(p_tenant uuid)                                       d4b914108a3146913b311ff40fea570c
--   f|reordenar_campanha(p_tenant uuid, p_campanha uuid, p_esperado text[], p_nova text[])  e2129f5f932794247606386523d5715e
-- assinatura_total de PROD é a prova da baseline (deploy/supabase/schema-baseline.json).
select json_build_object(
  'assinatura', (
    select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C")
      from public.schema_signature()
     where nome like 'grupos_em_mais_de_uma_campanha(%'
        or nome like 'reordenar_campanha(%'),
  'assinatura_total', (
    select json_build_object(
      'objetos', count(*),
      'md5', md5(string_agg(chave || '=' || sig, ',' order by chave collate "C")))
      from (select kind || '|' || nome as chave, sig from public.schema_signature()) as s)
) as r;
