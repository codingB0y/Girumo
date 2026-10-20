-- Conferência da migração 20261020120000_aviso_lotou_sem_estrutura.sql, nos DOIS bancos.
-- Uma transação que termina em ROLLBACK: monta duas lojas descartáveis (ids fixos c0c0c0c2-…), prova
-- que o aviso ao lotar não sai para pai nem Avisos de comunidade, nem para loja sem plano, e desfaz
-- tudo.
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\aviso-lotou-sem-estrutura-check.sql
--
-- Esperado: termina sem erro (exit 0). Cada bloco levanta 'FALHOU <caso>: ...' quando quebra.
-- Rodado ANTES de aplicar a migração, o bloco 1 levanta 'FALHOU corpo' (é a prova de que a
-- conferência pega a falta dela).
--
-- Existe porque a migração só troca o corpo de public.enviar_avisos_lotou, e o gate de drift não vê
-- corpo de função nem ACL.
--
-- public.enviar_avisos_lotou varre TODAS as lojas: o que fizer com linhas reais (disparo, marca) é
-- desfeito pelo rollback, e os asserts olham só as lojas de teste. Escreve, mesmo com rollback: em
-- prod é do Igor.

begin;

-- Em prod a varredura trava linhas REAIS até o rollback: sem lock em 5 s, ou passando de 2 min,
-- aborta em vez de segurar o worker.
set local lock_timeout = '5s';
set local statement_timeout = '2min';

-- 1) Corpo novo e ACL.
do $$
declare
  v_oid oid := to_regprocedure('public.enviar_avisos_lotou(integer)');
begin
  if v_oid is null then
    raise exception 'FALHOU função ausente: public.enviar_avisos_lotou (falta 20261010120000)';
  end if;
  if position('community_role' in pg_get_functiondef(v_oid)) = 0
     or position('tenant_concede_plano' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'FALHOU corpo: public.enviar_avisos_lotou ainda não filtra community_role/plano (migração não aplicada aqui)';
  end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute')
     or not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'FALHOU ACL: execute deveria ser só do service_role';
  end if;
end $$;

-- 2) Loja A (com plano): Avisos, pai, um membro de comunidade e um grupo comum. Loja B (sem plano):
--    um grupo comum. Todos admin, capacidade 1000 (limiar 950), 900 membros, na campanha da loja com
--    aviso ligado há 1 minuto. Sobem para 960 juntos: o trigger marca lotado_em em TODOS (inclusive
--    o Avisos — é o caminho perigoso) com aviso_lotou_em nulo.
--    Esperado: disparo só para os grupos comum e membro da A; B sem disparo, mas marcada; Avisos e
--    pai sem disparo e sem marca.
--    Sem número conectado nas lojas de teste: app.enqueue_broadcast devolve o disparo 'failed', mas
--    a linha em broadcasts existe — o assert é a linha (e o retorno 0); a fila com 'queued' já é
--    provada nos blocos 9 e 11 de postar-por-grupo-check.sql.
do $$
declare
  v_com constant uuid := 'c0c0c0c2-0000-4000-8000-00000000000a';
  v_sem constant uuid := 'c0c0c0c2-0000-4000-8000-00000000000b';
  v_texto constant text := 'Lotou! Entre no próximo pelo link da campanha.';
  v_plano uuid;
  v_got text;
  v_n integer;
begin
  delete from public.organizations where id in (v_com, v_sem);
  insert into public.organizations (id, tenant_id, name, slug) values
    (v_com, v_com, 'Check aviso sem estrutura (com plano)', 'check-aviso-sem-estrutura-com'),
    (v_sem, v_sem, 'Check aviso sem estrutura (sem plano)', 'check-aviso-sem-estrutura-sem');

  -- plans é catálogo global: qualquer plano serve, quem concede é o status.
  select p.id into v_plano from public.plans p order by p.id limit 1;
  if v_plano is null then
    raise exception 'FALHOU fixture: public.plans vazio, não dá para montar a loja com plano';
  end if;
  insert into public.subscriptions (tenant_id, plan_id, status)
  values (v_com, v_plano, 'active');
  if not app.tenant_concede_plano(v_com) or app.tenant_concede_plano(v_sem) then
    raise exception 'FALHOU fixture: tenant_concede_plano com=% sem=%',
      app.tenant_concede_plano(v_com), app.tenant_concede_plano(v_sem);
  end if;

  insert into public.groups
    (tenant_id, whatsapp_group_id, name, members, capacity, is_admin, invite_url, admins_ours,
     community_role, community_jid)
  values
    (v_com, 'ase-avisos@g.us', 'Avisos', 900, 1000, true, 'https://chat.whatsapp.com/AseAvisos', 1, 'announce', 'ase-pai@g.us'),
    (v_com, 'ase-pai@g.us',    'Pai',    900, 1000, true, 'https://chat.whatsapp.com/AsePai',    1, 'parent',   'ase-pai@g.us'),
    (v_com, 'ase-membro@g.us', 'Membro', 900, 1000, true, 'https://chat.whatsapp.com/AseMembro', 1, 'member',   'ase-pai@g.us'),
    (v_com, 'ase-comum@g.us',  'Comum',  900, 1000, true, 'https://chat.whatsapp.com/AseComum',  1, null,       null),
    (v_sem, 'asb-comum@g.us',  'Comum',  900, 1000, true, 'https://chat.whatsapp.com/AsbComum',  1, null,       null);

  insert into public.campaign_groups
    (id, tenant_id, name, slug, group_ids, aviso_ao_lotar, aviso_ao_lotar_desde)
  values
    ('c0c0c0c2-0000-4000-8000-0000000000c1', v_com, 'Check aviso com plano', 'check-aviso-sem-estrutura-com',
     array['ase-avisos@g.us', 'ase-pai@g.us', 'ase-membro@g.us', 'ase-comum@g.us'], v_texto, now() - interval '1 minute'),
    ('c0c0c0c2-0000-4000-8000-0000000000c2', v_sem, 'Check aviso sem plano', 'check-aviso-sem-estrutura-sem',
     array['asb-comum@g.us'], v_texto, now() - interval '1 minute');

  -- Drena o que já estiver pendente no banco (dado real; desfeito pelo rollback), para o retorno
  -- abaixo contar só este cenário.
  perform public.enviar_avisos_lotou(100000);

  update public.groups set members = 960 where tenant_id in (v_com, v_sem);

  -- O cenário é o perigoso: todos lotados agora, inclusive o Avisos, e nenhum avisado.
  if (select count(*) from public.groups g
      where g.tenant_id in (v_com, v_sem) and g.lotado_em is not null and g.aviso_lotou_em is null) <> 5 then
    raise exception 'FALHOU fixture: esperava os 5 grupos lotados e sem aviso antes da varredura';
  end if;

  -- Retorno = só o que ficou NA FILA. As lojas de teste não têm número conectado: app.enqueue_broadcast
  -- (20261015120000) acha target_instance nulo e devolve o disparo 'failed' ("Nenhum número
  -- conectado"), que não conta — o esperado é 0. O dreno acima tirou o pendente real; um grupo real
  -- que lotar entre o dreno e esta chamada daria falso positivo (mesmo risco dos blocos 10 e 11 de
  -- postar-por-grupo-check.sql): rodar de novo.
  v_n := public.enviar_avisos_lotou(100000);
  if v_n <> 0 then
    raise exception 'FALHOU retorno: %, esperava 0 (lojas de teste sem número conectado)', v_n;
  end if;
  if exists (select 1 from public.broadcasts b
             where b.tenant_id in (v_com, v_sem) and b.name like 'Aviso ao lotar · %'
               and b.status is distinct from 'failed') then
    raise exception 'FALHOU retorno: aviso de teste deveria ser failed (sem número conectado)';
  end if;

  select string_agg(b.tenant_id::text || ':' || array_to_string(b.group_ids, ','), ','
                    order by b.tenant_id, array_to_string(b.group_ids, ','))
    into v_got
  from public.broadcasts b
  where b.tenant_id in (v_com, v_sem) and b.name like 'Aviso ao lotar · %';
  if v_got is distinct from v_com::text || ':ase-comum@g.us,' || v_com::text || ':ase-membro@g.us' then
    raise exception 'FALHOU disparos: esperado só ase-comum e ase-membro da loja com plano, veio %', v_got;
  end if;

  select string_agg(replace(g.whatsapp_group_id, '@g.us', '') || '=' || (g.aviso_lotou_em is not null)::text,
                    ',' order by g.whatsapp_group_id)
    into v_got
  from public.groups g
  where g.tenant_id in (v_com, v_sem);
  -- Loja sem plano marcada (senão volta a cada 30 s e enche o p_limit); estrutura sem marca.
  if v_got is distinct from 'asb-comum=true,ase-avisos=false,ase-comum=true,ase-membro=true,ase-pai=false' then
    raise exception 'FALHOU aviso_lotou_em: %', v_got;
  end if;

  -- Segunda varredura: nada novo (a loja sem plano não volta; a estrutura segue de fora).
  perform public.enviar_avisos_lotou(100000);
  if (select count(*) from public.broadcasts b
      where b.tenant_id in (v_com, v_sem) and b.name like 'Aviso ao lotar · %') <> 2 then
    raise exception 'FALHOU segunda varredura: criou disparo novo';
  end if;
end $$;

-- Rede de segurança: se o cliente não honrar o rollback, as lojas de teste saem aqui (cascade).
delete from public.organizations
where id in ('c0c0c0c2-0000-4000-8000-00000000000a', 'c0c0c0c2-0000-4000-8000-00000000000b');

rollback;
