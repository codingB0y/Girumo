-- Conferência da migração 20261014120000_pool_sem_estrutura_de_comunidade.sql, nos DOIS bancos.
-- Uma transação que termina em ROLLBACK: monta uma loja descartável (ids fixos c0c0c0c1-…), prova
-- que grupo pai e Avisos de comunidade ficam fora do pool e desfaz tudo.
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\pool-sem-estrutura-de-comunidade-check.sql
--
-- Esperado: termina sem erro (exit 0). Cada bloco levanta 'FALHOU <caso>: ...' quando quebra.
-- Rodado ANTES de aplicar a migração, o bloco 1 levanta 'FALHOU corpo' (é a prova de que a
-- conferência pega a falta dela).
--
-- Existe porque a migração só troca o corpo de app.estados_da_campanha, e o gate de drift não vê
-- corpo de função nem ACL.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '1min';

-- 1) Corpo novo e ACL.
do $$
declare
  v_oid oid := to_regprocedure('app.estados_da_campanha(uuid,uuid)');
begin
  if v_oid is null then
    raise exception 'FALHOU função ausente: app.estados_da_campanha (falta 20261010120000)';
  end if;
  if position('community_role' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'FALHOU corpo: app.estados_da_campanha ainda não filtra community_role (migração não aplicada aqui)';
  end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute')
     or not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'FALHOU ACL: execute deveria ser só do service_role';
  end if;
end $$;

-- 2) Pool com Avisos, pai e um grupo comum. Capacidade 1000 => limiar 950.
--   avisos 990, announce -> nasce lotado (o trigger marca): sem o filtro entraria em "Só lotados"
--   pai    500, parent   -> disponível e na frente: sem o filtro seria o "enchendo" do link
--   comum   50, comum    -> o único que conta: enchendo
do $$
declare
  v_loja constant uuid := 'c0c0c0c1-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c1-0000-4000-8000-0000000000c1';
  v_estados text;
begin
  delete from public.organizations where id = v_loja;
  insert into public.organizations (id, tenant_id, name, slug)
  values (v_loja, v_loja, 'Check pool sem estrutura', 'check-pool-sem-estrutura');

  insert into public.groups
    (tenant_id, whatsapp_group_id, name, members, capacity, is_admin, invite_url, admins_ours,
     community_role, community_jid)
  values
    (v_loja, 'pse-avisos@g.us', 'Avisos', 990, 1000, true, 'https://chat.whatsapp.com/PseAvisos', 1, 'announce', 'pse-pai@g.us'),
    (v_loja, 'pse-pai@g.us',    'Pai',    500, 1000, true, 'https://chat.whatsapp.com/PsePai',    1, 'parent',   'pse-pai@g.us'),
    (v_loja, 'pse-comum@g.us',  'Comum',   50, 1000, true, 'https://chat.whatsapp.com/PseComum',  1, null,       null);

  insert into public.campaign_groups (id, tenant_id, name, slug, group_ids)
  values (v_camp, v_loja, 'Check pool', 'check-pool-sem-estrutura',
          array['pse-avisos@g.us', 'pse-pai@g.us', 'pse-comum@g.us']);

  select string_agg(replace(e.whatsapp_group_id, '@g.us', '') || '=' || e.estado, ',' order by e.posicao)
    into v_estados
  from public.campaign_group_states(v_loja, v_camp) as e;
  if v_estados is distinct from 'pse-comum=enchendo' then
    raise exception 'FALHOU estados: esperado pse-comum=enchendo, veio %', v_estados;
  end if;

  if app.alvos_da_regra(v_loja, v_camp, 'lotados') is distinct from '{}'::text[] then
    raise exception 'FALHOU lotados: %', app.alvos_da_regra(v_loja, v_camp, 'lotados');
  end if;
  if app.alvos_da_regra(v_loja, v_camp, 'com_gente') is distinct from array['pse-comum@g.us'] then
    raise exception 'FALHOU com_gente: %', app.alvos_da_regra(v_loja, v_camp, 'com_gente');
  end if;

  -- Lista fixa (sem regra) não muda: quem marca o Avisos à mão continua mandando para ele.
  insert into public.broadcasts (id, tenant_id, campaign_group_id, name, message, group_ids)
  values ('c0c0c0c1-0000-4000-8000-0000000000d1', v_loja, v_camp, 'Lista com Avisos', 'oi',
          array['pse-avisos@g.us', 'pse-comum@g.us']);
  if (select app.alvos_do_disparo(b) from public.broadcasts b
      where b.id = 'c0c0c0c1-0000-4000-8000-0000000000d1')
     is distinct from array['pse-avisos@g.us', 'pse-comum@g.us'] then
    raise exception 'FALHOU lista fixa: o Avisos marcado à mão saiu dos destinos';
  end if;
end $$;

-- Rede de segurança: se o cliente não honrar o rollback, a loja de teste sai aqui (cascade).
delete from public.organizations where id = 'c0c0c0c1-0000-4000-8000-00000000000a';

rollback;
