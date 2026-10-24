-- Conferência do PR 1 do postar por grupo (migração 20261010120000_postar_por_grupo.sql), nos DOIS
-- bancos, depois de aplicar. Uma transação que termina em ROLLBACK: monta duas lojas descartáveis
-- (ids fixos c0c0c0c0-…), prova cada regra e desfaz tudo.
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\postar-por-grupo-check.sql
--
-- Esperado: termina sem erro (exit 0). Cada bloco levanta 'FALHOU <caso>: ...' quando a regra quebra.
-- "column ... does not exist" / "function ... does not exist" = a migração não foi aplicada aqui.
--
-- Spec docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md §8 (lista de testes SQL) e
-- os cinco modos de falha do "Review Focus" do plano do PR 1.
--
-- Lê dado real em um ponto só (bloco 1: nenhum grupo cheio sem marca, a prova do backfill).
-- app.promote_due_schedules e public.enviar_avisos_lotou varrem TODAS as lojas: o que fizerem com
-- linhas reais também é desfeito pelo rollback, e os asserts olham só as lojas de teste.
--
-- Existe porque o gate de drift não vê schema app, CHECK, índice, trigger, ACL nem corpo de função.
-- O executor do plano não roda isto (escreve, mesmo com rollback): é do Igor.

begin;

-- Roda em produção: promote_due_schedules(1000) e enviar_avisos_lotou travam linhas REAIS até o
-- rollback. Se não conseguir o lock em 5 s, ou passar de 2 min, aborta em vez de segurar o worker.
set local lock_timeout = '5s';
set local statement_timeout = '2min';

-- Lojas de teste, recriadas no começo de cada bloco (cada bloco é independente).
create or replace function pg_temp.postar_fixture() returns void
language plpgsql as $fx$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_b constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000b';
begin
  -- Leva junto grupos, campanhas, disparos, comandos, agendamentos e ofertas (on delete cascade).
  delete from public.organizations where id in (v_a, v_b);

  insert into public.organizations (id, tenant_id, name, slug) values
    (v_a, v_a, 'Check postar por grupo A', 'check-postar-por-grupo-a'),
    (v_b, v_b, 'Check postar por grupo B', 'check-postar-por-grupo-b');

  -- Plano vigente nas duas: loja sem plano não dispara sozinha (agendamento, C17 em 20261017123000;
  -- aviso ao lotar, 20261020120000). plans é catálogo global; quem concede é o status. Sai junto
  -- com a loja (on delete cascade).
  insert into public.subscriptions (tenant_id, plan_id, status)
  select t.id, (select p.id from public.plans p order by p.id limit 1), 'active'
  from (values (v_a), (v_b)) as t(id);
  if not (app.tenant_concede_plano(v_a) and app.tenant_concede_plano(v_b)) then
    raise exception 'FALHOU fixture: lojas de teste sem plano (public.plans vazio?)';
  end if;

  insert into public.instances (id, tenant_id, name, status, provider_instance_id, connected_at)
  values ('c0c0c0c0-0000-4000-8000-0000000000a1', v_a, 'principal', 'connected',
          'check-postar-por-grupo', now());

  -- Capacidade 100 => limiar 95. Pool da Campanha A, nesta ordem:
  --   a 50, admin, convite          -> enchendo (o primeiro disponível)
  --   b 40, admin, convite          -> fila
  --   c 96, admin, convite          -> lotado (nasce cheio: marca E aviso já dado)
  --   d  1, admin, convite, 1 nosso -> vazio
  --   e 30, NÃO admin               -> fila, fora de toda regra
  --   f 20, admin, SEM convite      -> fila (não recebe gente pelo link, recebe post)
  --   x sem linha em groups         -> não aparece; c repetido no fim -> vale a posição 3
  insert into public.groups
    (id, tenant_id, whatsapp_group_id, name, members, capacity, is_admin, invite_url, admins_ours)
  values
    ('c0c0c0c0-0000-4000-8000-0000000000aa', v_a, 'pg-a@g.us', 'Grupo A', 50, 100, true,  'https://chat.whatsapp.com/PgA', 1),
    ('c0c0c0c0-0000-4000-8000-0000000000ab', v_a, 'pg-b@g.us', 'Grupo B', 40, 100, true,  'https://chat.whatsapp.com/PgB', 1),
    ('c0c0c0c0-0000-4000-8000-0000000000ac', v_a, 'pg-c@g.us', 'Grupo C', 96, 100, true,  'https://chat.whatsapp.com/PgC', 1),
    ('c0c0c0c0-0000-4000-8000-0000000000ad', v_a, 'pg-d@g.us', 'Grupo D',  1, 100, true,  'https://chat.whatsapp.com/PgD', 1),
    ('c0c0c0c0-0000-4000-8000-0000000000ae', v_a, 'pg-e@g.us', 'Grupo E', 30, 100, false, 'https://chat.whatsapp.com/PgE', 0),
    ('c0c0c0c0-0000-4000-8000-0000000000af', v_a, 'pg-f@g.us', 'Grupo F', 20, 100, true,  null, 1),
    -- O MESMO JID de a, na loja B: 99 membros, não-admin. Não pode contaminar a loja A.
    ('c0c0c0c0-0000-4000-8000-0000000000ba', v_b, 'pg-a@g.us', 'Alheio',  99, 100, false, 'https://chat.whatsapp.com/PgX', 0);

  -- A2 repete pg-a de propósito: é o conflito legado de D4 (grupo em duas campanhas da loja).
  -- Desde o PR 6 o trigger campaign_groups_grupo_exclusivo recusa JID NOVO que já está noutra
  -- campanha da loja, então A2 não entra em v_a com pg-a. Sem desligar o trigger (isso trava
  -- campaign_groups com ACCESS EXCLUSIVE até o rollback, e isto roda em produção), mesmo truque do
  -- bloco 6 de grupo-uma-campanha-check.sql: A2 nasce em v_b, que ainda não tem campanha, e muda
  -- para v_a sem tocar group_ids (o trigger é `update of group_ids`, não dispara). B só entra
  -- depois, quando A2 já saiu de v_b. Linhas finais idênticas às de antes do PR 6.
  insert into public.campaign_groups (id, tenant_id, name, slug, group_ids) values
    ('c0c0c0c0-0000-4000-8000-0000000000c1', v_a, 'Campanha A', 'check-postar-a',
     array['pg-a@g.us', 'pg-b@g.us', 'pg-c@g.us', 'pg-d@g.us', 'pg-e@g.us', 'pg-f@g.us', 'pg-x@g.us', 'pg-c@g.us']);
  insert into public.campaign_groups (id, tenant_id, name, slug, group_ids) values
    ('c0c0c0c0-0000-4000-8000-0000000000c2', v_b, 'Campanha A2', 'check-postar-a2', array['pg-a@g.us']);
  update public.campaign_groups set tenant_id = v_a where id = 'c0c0c0c0-0000-4000-8000-0000000000c2';
  insert into public.campaign_groups (id, tenant_id, name, slug, group_ids) values
    ('c0c0c0c0-0000-4000-8000-0000000000c3', v_b, 'Campanha B', 'check-postar-b', array['pg-a@g.us']);
end;
$fx$;

-- "pg-a=enchendo,pg-b=fila,..." na ordem do pool, lido pela RPC pública.
create or replace function pg_temp.estados(p_tenant uuid, p_campanha uuid) returns text
language sql as $fx$
  select string_agg(replace(e.whatsapp_group_id, '@g.us', '') || '=' || e.estado, ',' order by e.posicao)
  from public.campaign_group_states(p_tenant, p_campanha) as e;
$fx$;

-- JIDs que o run ATUAL de um disparo enfileirou, em ordem.
create or replace function pg_temp.jids_do_run(p_tenant uuid, p_broadcast uuid) returns text
language sql as $fx$
  select string_agg(c.payload ->> 'jid', ',' order by c.payload ->> 'jid')
  from public.engine_commands c
  join public.broadcasts b
    on b.tenant_id = c.tenant_id and b.id = c.origin_id and b.run_id = c.origin_run_id
  where c.tenant_id = p_tenant and c.origin_id = p_broadcast;
$fx$;

-- 1) Estrutura, privilégio e o backfill (só leitura).
do $$
declare
  v_c record;
  v_f record;
begin
  for v_c in
    select t.tabela, t.coluna, t.tipo
    from (values
      ('public.groups', 'lotado_em', 'timestamp with time zone'),
      ('public.groups', 'lotado_por', 'text'),
      ('public.groups', 'reaberto_em', 'timestamp with time zone'),
      ('public.groups', 'aviso_lotou_em', 'timestamp with time zone'),
      ('public.campaign_groups', 'aviso_ao_lotar', 'text'),
      ('public.campaign_groups', 'aviso_ao_lotar_desde', 'timestamp with time zone'),
      ('public.broadcasts', 'target_rule', 'text'),
      ('public.group_bulk_jobs', 'subject', 'text')
    ) as t(tabela, coluna, tipo)
  loop
    if not exists (
      select 1 from pg_attribute a
      where a.attrelid = v_c.tabela::regclass
        and a.attname = v_c.coluna
        and not a.attisdropped
        and not a.attnotnull
        and format_type(a.atttypid, a.atttypmod) = v_c.tipo
    ) then
      raise exception 'FALHOU coluna %.%: esperava % aceitando nulo', v_c.tabela, v_c.coluna, v_c.tipo;
    end if;
  end loop;

  if to_regclass('public.groups_aviso_lotou_pendente_idx') is null then
    raise exception 'FALHOU índice groups_aviso_lotou_pendente_idx ausente';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.groups'::regclass
      and t.tgname = 'groups_marca_lotado'
      and t.tgfoid = to_regprocedure('app.groups_marca_lotado()')
      and t.tgenabled <> 'D'
  ) then
    raise exception 'FALHOU trigger groups_marca_lotado ausente ou desligado';
  end if;

  -- Toda função que a migração cria ou reescreve, mais os dois wrappers públicos que chamam as
  -- reescritas: search_path fixo, definer onde deve, execute só service_role.
  for v_f in
    select f.sig, f.definer, p.oid, p.prosecdef, p.proconfig
    from (values
      ('public.campaign_group_states(uuid,uuid)', true),
      ('public.marcar_grupo_lotado(uuid,uuid)', true),
      ('public.reabrir_grupo(uuid,uuid)', true),
      ('public.enviar_avisos_lotou(integer)', true),
      ('public.enqueue_broadcast(uuid,uuid)', true),
      ('public.promote_due_schedules(integer)', true),
      ('app.enqueue_broadcast(uuid,uuid)', true),
      ('app.promote_due_schedules(integer)', true),
      ('app.groups_marca_lotado()', true),
      ('app.limiar_lotado(integer)', false),
      ('app.grupo_na_regra(text,boolean,text)', false),
      ('app.estados_da_campanha(uuid,uuid)', false),
      ('app.alvos_da_regra(uuid,uuid,text)', false),
      ('app.alvos_do_disparo(public.broadcasts)', false)
    ) as f(sig, definer)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
  loop
    if v_f.oid is null then
      raise exception 'FALHOU função ausente: %', v_f.sig;
    end if;
    if v_f.prosecdef is distinct from v_f.definer then
      raise exception 'FALHOU %: security definer = %, esperava %', v_f.sig, v_f.prosecdef, v_f.definer;
    end if;
    if not exists (select 1 from unnest(v_f.proconfig) as c(cfg) where c.cfg like 'search_path=%') then
      raise exception 'FALHOU %: sem set search_path', v_f.sig;
    end if;
    if has_function_privilege('anon', v_f.oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_f.oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_f.oid, 'EXECUTE') then
      raise exception 'FALHOU privilégio de %: anon=% authenticated=% service_role=%', v_f.sig,
        has_function_privilege('anon', v_f.oid, 'EXECUTE'),
        has_function_privilege('authenticated', v_f.oid, 'EXECUTE'),
        has_function_privilege('service_role', v_f.oid, 'EXECUTE');
    end if;
  end loop;

  -- Backfill (dado real): nenhum grupo cheio sem marca, e marca sempre com autor.
  if exists (select 1 from public.groups g
             where g.lotado_em is null and g.members >= app.limiar_lotado(g.capacity)) then
    raise exception 'FALHOU backfill: há grupo com members >= 95%% da capacidade sem lotado_em';
  end if;
  if exists (select 1 from public.groups g where (g.lotado_em is null) <> (g.lotado_por is null)) then
    raise exception 'FALHOU marca: lotado_em e lotado_por desencontrados';
  end if;
end $$;

-- 2) Nasce cheio, estados na ordem do pool, as três regras, limiar e os CHECKs.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_got text;
begin
  perform pg_temp.postar_fixture();

  -- Grupo descoberto já cheio não "acabou de lotar": marca automática e aviso já dado (§5.3).
  if not exists (
    select 1 from public.groups
    where tenant_id = v_a and whatsapp_group_id = 'pg-c@g.us'
      and lotado_em is not null and lotado_por = 'auto'
      and aviso_lotou_em is not null and reaberto_em is null
  ) then
    raise exception 'FALHOU nasce cheio: pg-c deveria vir lotado (auto) com aviso_lotou_em';
  end if;

  -- Ordem do pool; JID repetido vale a menor posição; JID sem linha não aparece; um enchendo só.
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=enchendo,pg-b=fila,pg-c=lotado,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU estados: %', v_got;
  end if;
  select string_agg(e.posicao::text, ',' order by e.posicao) into v_got
  from public.campaign_group_states(v_a, v_camp) as e;
  if v_got is distinct from '1,2,3,4,5,6' then
    raise exception 'FALHOU posicao: %', v_got;
  end if;

  -- As três regras exigem admin; vazio (d) e não-admin (e) ficam fora de todas. Ordem do pool.
  if app.alvos_da_regra(v_a, v_camp, 'menos_enchendo') is distinct from array['pg-b@g.us', 'pg-c@g.us', 'pg-f@g.us'] then
    raise exception 'FALHOU menos_enchendo: %', app.alvos_da_regra(v_a, v_camp, 'menos_enchendo');
  end if;
  if app.alvos_da_regra(v_a, v_camp, 'lotados') is distinct from array['pg-c@g.us'] then
    raise exception 'FALHOU lotados: %', app.alvos_da_regra(v_a, v_camp, 'lotados');
  end if;
  if app.alvos_da_regra(v_a, v_camp, 'com_gente') is distinct from array['pg-a@g.us', 'pg-b@g.us', 'pg-c@g.us', 'pg-f@g.us'] then
    raise exception 'FALHOU com_gente: %', app.alvos_da_regra(v_a, v_camp, 'com_gente');
  end if;
  if app.alvos_da_regra(v_a, v_camp, 'todos') is distinct from '{}'::text[] then
    raise exception 'FALHOU regra desconhecida deveria dar zero grupos';
  end if;

  -- As colunas na_regra_* da RPC dizem o mesmo (as duas leem app.grupo_na_regra).
  select string_agg(replace(e.whatsapp_group_id, '@g.us', '') || ':'
           || e.na_regra_menos_enchendo::int || e.na_regra_lotados::int || e.na_regra_com_gente::int,
           ',' order by e.posicao)
    into v_got
  from public.campaign_group_states(v_a, v_camp) as e;
  if v_got is distinct from 'pg-a:001,pg-b:101,pg-c:111,pg-d:000,pg-e:000,pg-f:101' then
    raise exception 'FALHOU na_regra: %', v_got;
  end if;

  -- pode_reabrir: só lotado abaixo do limiar. c tem 96 de 100.
  if (select e.pode_reabrir from public.campaign_group_states(v_a, v_camp) as e
      where e.whatsapp_group_id = 'pg-c@g.us') then
    raise exception 'FALHOU pode_reabrir: pg-c com 96 de 100 não pode reabrir';
  end if;

  -- Limiar: 95% da capacidade; capacidade 0 ou nula vale 1024.
  if app.limiar_lotado(100) <> 95 or app.limiar_lotado(0) <> 972.8 or app.limiar_lotado(null) <> 972.8 then
    raise exception 'FALHOU limiar: % % %', app.limiar_lotado(100), app.limiar_lotado(0), app.limiar_lotado(null);
  end if;

  -- CHECKs (o gate não vê): valor fora da lista é recusado; set_subject e as seis ações antigas passam.
  begin
    update public.groups set lotado_por = 'outro' where tenant_id = v_a and whatsapp_group_id = 'pg-c@g.us';
    raise exception 'FALHOU check lotado_por: aceitou ''outro''';
  exception when check_violation then null;
  end;
  begin
    insert into public.broadcasts (tenant_id, name, target_rule) values (v_a, 'check', 'todos');
    raise exception 'FALHOU check target_rule: aceitou ''todos''';
  exception when check_violation then null;
  end;
  insert into public.group_bulk_jobs
    (tenant_id, campaign_group_id, batch_id, action, group_id, whatsapp_group_id, subject)
  select v_a, v_camp, 'c0c0c0c0-0000-4000-8000-0000000000e1', a.acao,
         'c0c0c0c0-0000-4000-8000-0000000000aa', 'pg-a@g.us',
         case when a.acao = 'set_subject' then 'Grupo 1' end
  from unnest(array['set_description', 'set_picture', 'open', 'close', 'check_invite',
                    'remove_participant', 'set_subject']) as a(acao);
  begin
    insert into public.group_bulk_jobs
      (tenant_id, campaign_group_id, batch_id, action, group_id, whatsapp_group_id)
    values (v_a, v_camp, 'c0c0c0c0-0000-4000-8000-0000000000e2', 'renomear',
            'c0c0c0c0-0000-4000-8000-0000000000aa', 'pg-a@g.us');
    raise exception 'FALHOU check action: aceitou ''renomear''';
  exception when check_violation then null;
  end;
end $$;

-- 3) Cruzar subindo e descendo (também pela capacidade), reabrir e marcar à mão.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_g_a constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000aa';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_c constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ac';
  v_g_f constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000af';
  v_g public.groups;
  v_r text;
begin
  perform pg_temp.postar_fixture();
  -- Dentro de uma transação now() não anda: c "lotou anteontem" para a data provar que não mudou.
  update public.groups set lotado_em = now() - interval '2 days' where tenant_id = v_a and id = v_g_c;

  -- Sobe: b vai de 40 a 95 (o limiar exato) -> lotado automático, aviso ainda não dado.
  update public.groups set members = 95 where tenant_id = v_a and id = v_g_b;
  select * into v_g from public.groups where tenant_id = v_a and id = v_g_b;
  if v_g.lotado_em is null or v_g.lotado_por is distinct from 'auto'
     or v_g.aviso_lotou_em is not null or v_g.reaberto_em is not null then
    raise exception 'FALHOU cruzar subindo: lotado_em=% lotado_por=% aviso_lotou_em=% reaberto_em=%',
      v_g.lotado_em, v_g.lotado_por, v_g.aviso_lotou_em, v_g.reaberto_em;
  end if;

  -- 94 de 100 não cruza.
  update public.groups set members = 94 where tenant_id = v_a and id = v_g_a;
  if (select lotado_em from public.groups where tenant_id = v_a and id = v_g_a) is not null then
    raise exception 'FALHOU limiar: 94 de 100 marcou lotado';
  end if;

  -- Desce: c (96) cai para 90 -> continua lotado, com a MESMA data (D1); agora pode reabrir.
  update public.groups set members = 90 where tenant_id = v_a and id = v_g_c;
  select * into v_g from public.groups where tenant_id = v_a and id = v_g_c;
  if v_g.lotado_em is distinct from now() - interval '2 days' or v_g.lotado_por is distinct from 'auto' then
    raise exception 'FALHOU cruzar descendo: lotado_em=% lotado_por=%', v_g.lotado_em, v_g.lotado_por;
  end if;
  if not (select e.pode_reabrir from public.campaign_group_states(v_a, v_camp) as e where e.group_id = v_g_c) then
    raise exception 'FALHOU pode_reabrir: pg-c com 90 de 100 deveria poder reabrir';
  end if;

  -- A capacidade também cruza: f (20 de 100) passa a ter capacidade 20 (limiar 19).
  update public.groups set capacity = 20 where tenant_id = v_a and id = v_g_f;
  if (select lotado_por from public.groups where tenant_id = v_a and id = v_g_f) is distinct from 'auto' then
    raise exception 'FALHOU cruzar pela capacidade';
  end if;

  -- Reabrir bloqueado: b está em 95 -> ainda_cheio, nada muda.
  v_r := public.reabrir_grupo(v_a, v_g_b);
  if v_r is distinct from 'ainda_cheio'
     or (select lotado_em from public.groups where tenant_id = v_a and id = v_g_b) is null then
    raise exception 'FALHOU reabrir cheio: %', v_r;
  end if;

  -- Reabrir liberado: c em 90 -> ok; marca limpa, reaberto_em gravado.
  v_r := public.reabrir_grupo(v_a, v_g_c);
  select * into v_g from public.groups where tenant_id = v_a and id = v_g_c;
  if v_r is distinct from 'ok' or v_g.lotado_em is not null or v_g.lotado_por is not null
     or v_g.reaberto_em is null then
    raise exception 'FALHOU reabrir: % lotado_em=% reaberto_em=%', v_r, v_g.lotado_em, v_g.reaberto_em;
  end if;
  if public.reabrir_grupo(v_a, v_g_c) is distinct from 'nao_lotado' then
    raise exception 'FALHOU reabrir de novo: esperava nao_lotado';
  end if;

  -- Marcar à mão: a -> ok (manual, sem aviso dado); de novo -> ja_lotado.
  if public.marcar_grupo_lotado(v_a, v_g_a) is distinct from 'ok' then
    raise exception 'FALHOU marcar a';
  end if;
  select * into v_g from public.groups where tenant_id = v_a and id = v_g_a;
  if v_g.lotado_em is null or v_g.lotado_por is distinct from 'manual' or v_g.aviso_lotou_em is not null then
    raise exception 'FALHOU marcar: lotado_em=% lotado_por=% aviso_lotou_em=%',
      v_g.lotado_em, v_g.lotado_por, v_g.aviso_lotou_em;
  end if;
  if public.marcar_grupo_lotado(v_a, v_g_a) is distinct from 'ja_lotado' then
    raise exception 'FALHOU marcar de novo: esperava ja_lotado';
  end if;

  -- Marcar o reaberto (c) limpa reaberto_em. A leitura vai num comando separado: um select na
  -- mesma expressão da chamada usa o snapshot de antes dela e veria o reaberto_em antigo.
  v_r := public.marcar_grupo_lotado(v_a, v_g_c);
  if v_r is distinct from 'ok'
     or (select reaberto_em from public.groups where tenant_id = v_a and id = v_g_c) is not null then
    raise exception 'FALHOU marcar o reaberto: % reaberto_em deveria limpar', v_r;
  end if;
end $$;

-- 4) O sync grava por upsert do PostgREST (insert ... on conflict do update). O before insert
--    roda na linha proposta e não pode vazar para a existente; quem cruza é o before update.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_c constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ac';
begin
  perform pg_temp.postar_fixture();
  update public.groups set lotado_em = now() - interval '2 days' where tenant_id = v_a and id = v_g_c;

  insert into public.groups (tenant_id, whatsapp_group_id, name, members, capacity, is_admin)
  values
    (v_a, 'pg-b@g.us', 'Grupo B', 97, 100, true),
    (v_a, 'pg-c@g.us', 'Grupo C', 98, 100, true),
    (v_a, 'pg-novo@g.us', 'Grupo novo', 99, 100, true)
  on conflict (tenant_id, whatsapp_group_id)
  do update set members = excluded.members, name = excluded.name, is_admin = excluded.is_admin;

  -- b existia com 40 e cruzou: lotado automático SEM aviso dado (vai receber o aviso ao lotar).
  if not exists (
    select 1 from public.groups
    where tenant_id = v_a and id = v_g_b
      and lotado_em is not null and lotado_por = 'auto' and aviso_lotou_em is null
  ) then
    raise exception 'FALHOU upsert: pg-b deveria lotar sem aviso_lotou_em';
  end if;
  -- c já estava lotado: a marca não muda.
  if (select lotado_em from public.groups where tenant_id = v_a and id = v_g_c)
     is distinct from now() - interval '2 days' then
    raise exception 'FALHOU upsert: a marca de pg-c mudou';
  end if;
  -- O novo nasceu cheio: lotado e aviso já dado.
  if not exists (
    select 1 from public.groups
    where tenant_id = v_a and whatsapp_group_id = 'pg-novo@g.us'
      and lotado_por = 'auto' and aviso_lotou_em is not null
  ) then
    raise exception 'FALHOU upsert: pg-novo deveria nascer lotado com aviso_lotou_em';
  end if;
end $$;

-- 5) Prioridade do reaberto (D3): enche antes da sequência; dois reabertos, o de menor posição;
--    quando lota de novo, perde a prioridade e o link volta à sequência.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_c constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ac';
  v_got text;
begin
  perform pg_temp.postar_fixture();

  -- c (posição 3) cai para 90 e é reaberto: passa na frente de a (posição 1).
  update public.groups set members = 90 where tenant_id = v_a and id = v_g_c;
  if public.reabrir_grupo(v_a, v_g_c) is distinct from 'ok' then
    raise exception 'FALHOU prioridade: reabrir c';
  end if;
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=fila,pg-b=fila,pg-c=enchendo,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU prioridade (um reaberto): %', v_got;
  end if;

  -- b (posição 2) marcado e reaberto: dois reabertos, enche o de menor posição.
  if public.marcar_grupo_lotado(v_a, v_g_b) is distinct from 'ok' then
    raise exception 'FALHOU prioridade: marcar b';
  end if;
  if public.reabrir_grupo(v_a, v_g_b) is distinct from 'ok' then
    raise exception 'FALHOU prioridade: reabrir b';
  end if;
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=fila,pg-b=enchendo,pg-c=fila,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU prioridade (dois reabertos): %', v_got;
  end if;

  -- b lota de novo: o trigger marca e limpa reaberto_em; c volta a encher.
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_b;
  if (select reaberto_em from public.groups where tenant_id = v_a and id = v_g_b) is not null then
    raise exception 'FALHOU prioridade: reaberto_em de b não limpou ao lotar';
  end if;
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=fila,pg-b=lotado,pg-c=enchendo,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU prioridade (b relotou): %', v_got;
  end if;

  -- c lota: o link volta à sequência (a).
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_c;
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=enchendo,pg-b=lotado,pg-c=lotado,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU prioridade (volta à sequência): %', v_got;
  end if;
end $$;

-- 6) Outra loja: campanha lida com o tenant errado, o mesmo JID em duas lojas, marcar e reabrir
--    com o tenant errado. O service-role ignora RLS: o filtro de tenant É a proteção.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_b constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000b';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_camp_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c3';
  v_g_a constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000aa';
  v_g_c constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ac';
begin
  perform pg_temp.postar_fixture();

  if exists (select 1 from public.campaign_group_states(v_a, v_camp_b))
     or exists (select 1 from public.campaign_group_states(v_b, v_camp)) then
    raise exception 'FALHOU tenant: campanha lida com o tenant da outra loja';
  end if;

  -- O pg-a da loja B (99, não-admin) não contamina o da A.
  if (select e.members || ':' || e.estado from public.campaign_group_states(v_a, v_camp) as e
      where e.whatsapp_group_id = 'pg-a@g.us') is distinct from '50:enchendo' then
    raise exception 'FALHOU tenant: pg-a da loja A leu dado da loja B';
  end if;
  -- Na B, o pg-a dela: lotado (nasceu com 99) e fora das regras (não-admin).
  if pg_temp.estados(v_b, v_camp_b) is distinct from 'pg-a=lotado'
     or app.alvos_da_regra(v_b, v_camp_b, 'com_gente') is distinct from '{}'::text[] then
    raise exception 'FALHOU tenant: estados da loja B';
  end if;

  if public.marcar_grupo_lotado(v_b, v_g_a) is distinct from 'nao_encontrado'
     or public.reabrir_grupo(v_b, v_g_c) is distinct from 'nao_encontrado'
     or public.reabrir_grupo(v_a, gen_random_uuid()) is distinct from 'nao_encontrado' then
    raise exception 'FALHOU tenant: marcar/reabrir com o tenant errado';
  end if;
  if (select lotado_em from public.groups where tenant_id = v_a and id = v_g_a) is not null
     or (select lotado_em from public.groups where tenant_id = v_a and id = v_g_c) is null then
    raise exception 'FALHOU tenant: grupo da loja A mudou por chamada da loja B';
  end if;
end $$;

-- 7) Disparo: com regra (as três, e regra junto de group_ids), campanha apagada, e sem regra
--    (o predicado de antes, sem mudança).
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_camp2 constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c2';
  v_caso record;
  v_bc public.broadcasts;
  v_got text;
begin
  perform pg_temp.postar_fixture();

  insert into public.broadcasts (id, tenant_id, campaign_group_id, name, message, group_ids, target_rule)
  values
    ('c0c0c0c0-0000-4000-8000-0000000000d1', v_a, v_camp, 'Regra padrão', 'oi', '{}', 'menos_enchendo'),
    ('c0c0c0c0-0000-4000-8000-0000000000d2', v_a, v_camp, 'Só lotados', 'oi', '{}', 'lotados'),
    ('c0c0c0c0-0000-4000-8000-0000000000d3', v_a, v_camp, 'Todos com gente', 'oi', '{}', 'com_gente'),
    ('c0c0c0c0-0000-4000-8000-0000000000d4', v_a, v_camp, 'Regra e lista', 'oi', array['pg-a@g.us'], 'lotados'),
    ('c0c0c0c0-0000-4000-8000-0000000000d5', v_a, v_camp2, 'Campanha some', 'oi', '{}', 'com_gente'),
    ('c0c0c0c0-0000-4000-8000-0000000000d6', v_a, v_camp, 'Sem regra', 'oi', '{}', null),
    ('c0c0c0c0-0000-4000-8000-0000000000d7', v_a, v_camp, 'Lista fixa', 'oi',
     array['pg-b@g.us', 'pg-e@g.us', 'pg-zz@g.us'], null),
    ('c0c0c0c0-0000-4000-8000-0000000000d8', v_a, v_camp, 'Só não-admin', 'oi', array['pg-e@g.us'], null);

  -- Com regra: os JIDs da regra (nem o enchendo a, nem o vazio d, nem o não-admin e). Com regra,
  -- group_ids não conta.
  for v_caso in
    select * from (values
      ('c0c0c0c0-0000-4000-8000-0000000000d1'::uuid, 'pg-b@g.us,pg-c@g.us,pg-f@g.us', 3),
      ('c0c0c0c0-0000-4000-8000-0000000000d2'::uuid, 'pg-c@g.us', 1),
      ('c0c0c0c0-0000-4000-8000-0000000000d3'::uuid, 'pg-a@g.us,pg-b@g.us,pg-c@g.us,pg-f@g.us', 4),
      ('c0c0c0c0-0000-4000-8000-0000000000d4'::uuid, 'pg-c@g.us', 1)
    ) as t(id, jids, total)
  loop
    v_bc := app.enqueue_broadcast(v_a, v_caso.id);
    v_got := pg_temp.jids_do_run(v_a, v_caso.id);
    if v_bc.status is distinct from 'queued' or v_bc.total <> v_caso.total
       or v_got is distinct from v_caso.jids then
      raise exception 'FALHOU disparo "%": status=% total=% jids=%', v_bc.name, v_bc.status, v_bc.total, v_got;
    end if;
  end loop;

  -- Campanha apagada com disparo de regra: a FK zera campaign_group_id -> zero alvos -> failed com
  -- a mensagem da regra. Nunca cai em "todos" (§7).
  delete from public.campaign_groups where tenant_id = v_a and id = v_camp2;
  v_bc := app.enqueue_broadcast(v_a, 'c0c0c0c0-0000-4000-8000-0000000000d5');
  if v_bc.campaign_group_id is not null or v_bc.status is distinct from 'failed' or v_bc.total <> 0
     or v_bc.error is distinct from 'Nenhum grupo nesta regra agora.'
     or pg_temp.jids_do_run(v_a, 'c0c0c0c0-0000-4000-8000-0000000000d5') is not null then
    raise exception 'FALHOU campanha apagada: campanha=% status=% total=% erro=%',
      v_bc.campaign_group_id, v_bc.status, v_bc.total, v_bc.error;
  end if;

  -- Sem regra: group_ids vazio = todos os admin da loja (em ordem de JID).
  select * into v_bc from public.broadcasts where tenant_id = v_a and id = 'c0c0c0c0-0000-4000-8000-0000000000d6';
  if array_to_string(app.alvos_do_disparo(v_bc), ',')
     is distinct from 'pg-a@g.us,pg-b@g.us,pg-c@g.us,pg-d@g.us,pg-f@g.us' then
    raise exception 'FALHOU sem regra (todos): %', app.alvos_do_disparo(v_bc);
  end if;
  -- Lista fixa: interseção com os admin.
  select * into v_bc from public.broadcasts where tenant_id = v_a and id = 'c0c0c0c0-0000-4000-8000-0000000000d7';
  if array_to_string(app.alvos_do_disparo(v_bc), ',') is distinct from 'pg-b@g.us' then
    raise exception 'FALHOU sem regra (lista): %', app.alvos_do_disparo(v_bc);
  end if;
  -- Só não-admin: falha com a mensagem de antes.
  v_bc := app.enqueue_broadcast(v_a, 'c0c0c0c0-0000-4000-8000-0000000000d8');
  if v_bc.status is distinct from 'failed'
     or v_bc.error is distinct from 'Nenhum grupo de destino (verifique se o número é admin dos grupos).' then
    raise exception 'FALHOU sem regra (não-admin): status=% erro=%', v_bc.status, v_bc.error;
  end if;
end $$;

-- 8) Oferta Relâmpago agendada com regra: abre nos JIDs que o run enfileirou, nem um a mais.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_bc constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000d9';
  v_fo constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000f1';
  v_oferta text;
  v_cmds text;
begin
  perform pg_temp.postar_fixture();

  insert into public.broadcasts (id, tenant_id, campaign_group_id, name, message, target_rule)
  values (v_bc, v_a, v_camp, 'Relâmpago', 'Comente EU QUERO', 'menos_enchendo');
  insert into public.flash_offers (id, tenant_id, name, slots, broadcast_id)
  values (v_fo, v_a, 'Relâmpago', 3, v_bc);
  insert into public.schedules (tenant_id, broadcast_id, name, scheduled_at)
  values (v_a, v_bc, 'Relâmpago', now());

  perform app.promote_due_schedules(1000);

  if (select status from public.flash_offers where tenant_id = v_a and id = v_fo) is distinct from 'open' then
    raise exception 'FALHOU oferta: não abriu';
  end if;
  select string_agg(g.whatsapp_group_id, ',' order by g.whatsapp_group_id) into v_oferta
  from public.flash_offer_groups g
  where g.tenant_id = v_a and g.offer_id = v_fo;
  v_cmds := pg_temp.jids_do_run(v_a, v_bc);
  if v_oferta is distinct from v_cmds or v_oferta is distinct from 'pg-b@g.us,pg-c@g.us,pg-f@g.us' then
    raise exception 'FALHOU oferta: escuta % e a mensagem foi para %', v_oferta, v_cmds;
  end if;
end $$;

-- 9) Aviso ao lotar (D10): uma vez por grupo, só quem lotou depois de ligar, envio só para admin,
--    só da mesma loja; reabrir e lotar de novo não repete. Todo grupo que "recebe" aqui lotou agora
--    (dentro da janela de 1 h do bloco 12).
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_b constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000b';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_camp2 constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c2';
  v_camp_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c3';
  v_g_a constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000aa';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_e constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ae';
  v_g_f constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000af';
  v_texto constant text := 'Lotou! Entre no próximo pelo link da campanha.';
  v_n integer;
  v_got text;
begin
  perform pg_temp.postar_fixture();

  update public.campaign_groups
  set aviso_ao_lotar = v_texto, aviso_ao_lotar_desde = now()
  where tenant_id in (v_a, v_b) and id in (v_camp, v_camp2, v_camp_b);

  -- f lotou 10 min ANTES de ligar o aviso (dentro da janela de 1 h: só o aviso_ao_lotar_desde barra).
  update public.groups set lotado_em = now() - interval '10 minutes', lotado_por = 'manual'
  where tenant_id = v_a and id = v_g_f;
  -- Cruzam agora: a (em duas campanhas da loja, A e A2), b, e e (não-admin).
  update public.groups set members = 96 where tenant_id = v_a and id in (v_g_a, v_g_b, v_g_e);

  v_n := public.enviar_avisos_lotou(500);
  if v_n < 2 then
    raise exception 'FALHOU aviso: enviou %, esperava ao menos 2', v_n;
  end if;

  -- Um aviso por grupo: a (uma vez, mesmo em duas campanhas) e b. Nada enviado para c (nasceu
  -- cheio), f (lotou antes de ligar), e (não-admin: só marcado, ver bloco 10), nem na loja B (o
  -- pg-a dela não é o da A).
  select string_agg(array_to_string(b.group_ids, ','), ',' order by array_to_string(b.group_ids, ','))
    into v_got
  from public.broadcasts b
  where b.tenant_id in (v_a, v_b) and b.name like 'Aviso ao lotar · %';
  if v_got is distinct from 'pg-a@g.us,pg-b@g.us' then
    raise exception 'FALHOU aviso: avisos para %', v_got;
  end if;

  -- O aviso de b: nome, texto e campanha certos, e foi para a fila (número conectado).
  if not exists (
    select 1 from public.broadcasts b
    where b.tenant_id = v_a and b.name = 'Aviso ao lotar · Grupo B'
      and b.message = v_texto and b.campaign_group_id = v_camp
      and b.status = 'queued' and b.total = 1
  ) then
    raise exception 'FALHOU aviso: o de pg-b não saiu como esperado';
  end if;

  select string_agg(replace(g.whatsapp_group_id, '@g.us', '') || '=' || (g.aviso_lotou_em is not null)::text,
                    ',' order by g.whatsapp_group_id)
    into v_got
  from public.groups g
  where g.tenant_id = v_a and g.whatsapp_group_id in ('pg-a@g.us', 'pg-b@g.us', 'pg-e@g.us', 'pg-f@g.us');
  -- e (não-admin) também fica marcado, sem envio; f (antes de ligar) segue pendente para sempre.
  if v_got is distinct from 'pg-a=true,pg-b=true,pg-e=true,pg-f=false' then
    raise exception 'FALHOU aviso_lotou_em: %', v_got;
  end if;

  -- Segunda varredura: nada novo. Reabrir b e lotar de novo: não repete.
  perform public.enviar_avisos_lotou(500);
  update public.groups set members = 50 where tenant_id = v_a and id = v_g_b;
  if public.reabrir_grupo(v_a, v_g_b) is distinct from 'ok' then
    raise exception 'FALHOU aviso: reabrir b';
  end if;
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_b;
  perform public.enviar_avisos_lotou(500);

  if (select count(*) from public.broadcasts b
      where b.tenant_id in (v_a, v_b) and b.name like 'Aviso ao lotar · %') <> 2 then
    raise exception 'FALHOU aviso: repetiu (segunda varredura ou depois de reabrir)';
  end if;
end $$;

-- 10) Aviso ao lotar em grupo onde o número NÃO é admin: elegível (lotou depois de ligar, aviso
--     configurado, aviso_lotou_em nulo) -> não envia, não conta no retorno, mas marca
--     aviso_lotou_em. Senão ficaria pendente para sempre e sairia atrasado no dia em que o número
--     virasse admin.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_g_e constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ae';
  v_n integer;
begin
  perform pg_temp.postar_fixture();
  -- Drena antes o que já estiver pendente no banco (dado real; desfeito pelo rollback), para o
  -- retorno abaixo contar só o cenário deste bloco.
  perform public.enviar_avisos_lotou(100000);

  update public.campaign_groups
  set aviso_ao_lotar = 'Lotou! Entre no próximo pelo link da campanha.', aviso_ao_lotar_desde = now()
  where tenant_id = v_a and id = v_camp;
  -- Só e cruza (30 -> 96): lotado automático, elegível, não-admin.
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_e;
  if not exists (
    select 1 from public.groups
    where tenant_id = v_a and id = v_g_e
      and lotado_em is not null and aviso_lotou_em is null and not is_admin
  ) then
    raise exception 'FALHOU aviso não-admin: pg-e deveria estar lotado, sem aviso, não-admin';
  end if;

  v_n := public.enviar_avisos_lotou(100000);
  if v_n <> 0 then
    raise exception 'FALHOU aviso não-admin: retorno %, esperava 0', v_n;
  end if;
  if exists (select 1 from public.broadcasts b
             where b.tenant_id = v_a and b.name like 'Aviso ao lotar · %') then
    raise exception 'FALHOU aviso não-admin: criou broadcast para grupo onde não somos admin';
  end if;
  if (select aviso_lotou_em from public.groups where tenant_id = v_a and id = v_g_e) is null then
    raise exception 'FALHOU aviso não-admin: aviso_lotou_em deveria estar preenchido';
  end if;

  -- O número vira admin depois: o aviso NÃO sai atrasado.
  update public.groups set is_admin = true where tenant_id = v_a and id = v_g_e;
  perform public.enviar_avisos_lotou(100000);
  if exists (select 1 from public.broadcasts b
             where b.tenant_id = v_a and b.name like 'Aviso ao lotar · %') then
    raise exception 'FALHOU aviso não-admin: saiu atrasado depois de virar admin';
  end if;
end $$;

-- 11) O retorno conta só o que ficou NA FILA. Grupo elegível e admin numa loja SEM número conectado
--     (a B não tem instância): o disparo nasce 'failed', aviso_lotou_em é gravado (não tenta de novo
--     a cada 30 s) e o retorno não o conta. Na loja A (com número) o pg-b conta: retorno exato = 1.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_b constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000b';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_camp_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c3';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_alheio constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ba';
  v_n integer;
begin
  perform pg_temp.postar_fixture();
  -- Drena antes o que já estiver pendente no banco (dado real; desfeito pelo rollback), para o
  -- retorno abaixo contar só o cenário deste bloco.
  perform public.enviar_avisos_lotou(100000);

  update public.campaign_groups
  set aviso_ao_lotar = 'Lotou! Entre no próximo pelo link da campanha.', aviso_ao_lotar_desde = now()
  where tenant_id in (v_a, v_b) and id in (v_camp, v_camp_b);
  -- Loja A: b cruza (40 -> 96), admin, com número conectado.
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_b;
  -- Loja B: o Alheio nasceu cheio (aviso já dado, não-admin); aqui ele vira admin e elegível.
  update public.groups set is_admin = true, aviso_lotou_em = null
  where tenant_id = v_b and id = v_g_alheio;

  v_n := public.enviar_avisos_lotou(100000);
  if v_n <> 1 then
    raise exception 'FALHOU aviso contagem: retorno %, esperava 1 (só o pg-b, que ficou na fila)', v_n;
  end if;
  if not exists (select 1 from public.broadcasts b
                 where b.tenant_id = v_a and b.name = 'Aviso ao lotar · Grupo B' and b.status = 'queued') then
    raise exception 'FALHOU aviso contagem: o aviso de pg-b deveria estar queued';
  end if;
  if not exists (select 1 from public.broadcasts b
                 where b.tenant_id = v_b and b.name = 'Aviso ao lotar · Alheio'
                   and b.status = 'failed' and b.total = 0) then
    raise exception 'FALHOU aviso contagem: sem número conectado o aviso deveria existir como failed';
  end if;
  if (select aviso_lotou_em from public.groups where tenant_id = v_b and id = v_g_alheio) is null then
    raise exception 'FALHOU aviso contagem: aviso_lotou_em deveria estar preenchido mesmo com falha';
  end if;

  -- Não tenta de novo a cada 30 s.
  v_n := public.enviar_avisos_lotou(100000);
  if v_n <> 0
     or (select count(*) from public.broadcasts b
         where b.tenant_id = v_b and b.name like 'Aviso ao lotar · %') <> 1 then
    raise exception 'FALHOU aviso contagem: repetiu o aviso que falhou (retorno %)', v_n;
  end if;
end $$;

-- 12) Frescor (1 h): grupo que lotou há mais de 1 h não recebe "Lotou!" atrasado, mesmo com o aviso
--     ligado antes (aviso_ao_lotar_desde de ontem, para só a janela decidir): sem envio, sem
--     broadcast e aviso_lotou_em continua nulo. Dentro da janela (50 min) recebe.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_g_a constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000aa';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_n integer;
begin
  perform pg_temp.postar_fixture();
  -- Drena antes o que já estiver pendente no banco (dado real; desfeito pelo rollback), para o
  -- retorno abaixo contar só o cenário deste bloco.
  perform public.enviar_avisos_lotou(100000);

  update public.campaign_groups
  set aviso_ao_lotar = 'Lotou! Entre no próximo pelo link da campanha.',
      aviso_ao_lotar_desde = now() - interval '1 day'
  where tenant_id = v_a and id = v_camp;
  -- a lotou há 2 h (fora da janela); b há 50 min (dentro). Ambos admin, ambos na campanha.
  update public.groups set lotado_em = now() - interval '2 hours', lotado_por = 'manual'
  where tenant_id = v_a and id = v_g_a;
  update public.groups set lotado_em = now() - interval '50 minutes', lotado_por = 'manual'
  where tenant_id = v_a and id = v_g_b;

  v_n := public.enviar_avisos_lotou(100000);
  if v_n <> 1 then
    raise exception 'FALHOU frescor: retorno %, esperava 1 (só o pg-b, de 50 min)', v_n;
  end if;
  if exists (select 1 from public.broadcasts b
             where b.tenant_id = v_a and b.name = 'Aviso ao lotar · Grupo A') then
    raise exception 'FALHOU frescor: criou aviso para pg-a, que lotou há 2 h';
  end if;
  if (select aviso_lotou_em from public.groups where tenant_id = v_a and id = v_g_a) is not null then
    raise exception 'FALHOU frescor: aviso_lotou_em de pg-a deveria continuar nulo';
  end if;
  if not exists (select 1 from public.broadcasts b
                 where b.tenant_id = v_a and b.name = 'Aviso ao lotar · Grupo B' and b.status = 'queued')
     or (select aviso_lotou_em from public.groups where tenant_id = v_a and id = v_g_b) is null then
    raise exception 'FALHOU frescor: pg-b (50 min) deveria ter recebido o aviso';
  end if;
end $$;

-- 13) Rede de segurança: se o cliente não honrar o rollback abaixo, as lojas de teste saem aqui
--     (cascade). Com o rollback valendo, este delete também é desfeito.
delete from public.organizations
where id in ('c0c0c0c0-0000-4000-8000-00000000000a', 'c0c0c0c0-0000-4000-8000-00000000000b');

rollback;
