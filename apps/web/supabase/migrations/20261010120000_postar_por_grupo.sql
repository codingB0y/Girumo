-- Postar por grupo, PR 1 (banco). Spec: docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md
-- §5.1–5.7; contrato: docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md §1.
--
-- 1. groups ganha a marca de lotado (lotado_em, lotado_por, reaberto_em, aviso_lotou_em), gravada
--    por um trigger quando o grupo cruza 95% subindo ou nasce cheio. A marca nunca sai sozinha (D1).
-- 2. campaign_groups ganha o aviso ao lotar; broadcasts, target_rule; group_bulk_jobs, subject e a
--    ação 'set_subject'.
-- 3. Estado do grupo e regras de destino existem num lugar só (spec §4): app.limiar_lotado,
--    app.grupo_na_regra, app.estados_da_campanha, app.alvos_da_regra, app.alvos_do_disparo.
-- 4. RPCs (execute só service_role): campaign_group_states, marcar_grupo_lotado, reabrir_grupo,
--    enviar_avisos_lotou.
-- 5. app.enqueue_broadcast monta os destinos por app.alvos_do_disparo; app.promote_due_schedules
--    abre a Oferta Relâmpago nos JIDs que o run enfileirou.
-- 6. Backfill: grupo que já está cheio ganha a marca, sem aviso.
--
-- Sozinha, não muda o que o lojista vê: o link (TS) ainda ignora lotado_em e nenhum disparo tem
-- target_rule até os PRs 2 e 5.
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns) e muda
-- deploy/supabase/schema-baseline.json: t|groups, t|campaign_groups, t|broadcasts,
-- t|group_bulk_jobs e quatro f|. O gate de drift não vê schema app, CHECK, índice, trigger, ACL
-- nem corpo de função — conferir com infra/tests/postar-por-grupo-check.sql nos dois bancos.

-- Se estourar o timeout (webhook segurando groups), é só rodar de novo: a migração é idempotente.
set lock_timeout = '5s';

-- 0) Trava. Os corpos de app.enqueue_broadcast e app.promote_due_schedules mais abaixo são os do
--    repo (20260730100000 e 20260930120000) com UMA troca cada. Se este banco tiver outro corpo
--    (correção aplicada à mão), o create or replace a apagaria em silêncio — e o gate de drift não
--    vê corpo de função. O md5 é do prosrc sem os comentários de linha (de dois hífens até o fim
--    da linha) e com todo espaço em branco reduzido a um: CRLF/LF, indentação e comentário não
--    contam. Comentário não conta porque o corpo de dev foi aplicado sem eles (código idêntico), e
--    comentário não muda o que a função faz. Vale porque nenhum dos dois corpos tem dois hífens
--    dentro de literal de texto. A marca é um trecho que só existe no corpo novo: reaplicar passa.
do $$
declare
  v_fn record;
begin
  for v_fn in
    select f.sig, f.md5_repo, f.marca_nova, p.prosrc,
           md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) as md5_banco
    from (values
      ('app.enqueue_broadcast(uuid,uuid)', '46e713964185fa644ed9fa85fb436cd7', 'app.alvos_do_disparo(b)'),
      ('app.promote_due_schedules(integer)', '1884d181994522ca27a9debde5deea1d', 'c.origin_run_id = v_broadcast.run_id')
    ) as f(sig, md5_repo, marca_nova)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
  loop
    if v_fn.prosrc is null then
      raise exception 'postar_por_grupo: % não existe neste banco', v_fn.sig;
    end if;
    if v_fn.md5_banco <> v_fn.md5_repo and position(v_fn.marca_nova in v_fn.prosrc) = 0 then
      raise exception 'postar_por_grupo: o corpo de % neste banco difere do repo (md5 normalizado %, esperado %). Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.',
        v_fn.sig, v_fn.md5_banco, v_fn.md5_repo;
    end if;
  end loop;
end $$;

-- 1) Colunas, CHECKs e índice (spec §5.1).
alter table public.groups
  add column if not exists lotado_em timestamptz,
  add column if not exists lotado_por text,
  add column if not exists reaberto_em timestamptz,
  add column if not exists aviso_lotou_em timestamptz;

alter table public.groups drop constraint if exists groups_lotado_por_check;
alter table public.groups
  add constraint groups_lotado_por_check
  check (lotado_por is null or lotado_por in ('auto', 'manual'));

comment on column public.groups.lotado_em is
  'Marca de lotado (D1). Gravada pelo trigger groups_marca_lotado ao cruzar 95% subindo, ou por marcar_grupo_lotado. Nunca sai sozinha: só reabrir_grupo limpa.';
comment on column public.groups.lotado_por is
  '''auto'' (trigger ou backfill) ou ''manual'' (marcar_grupo_lotado). Nulo quando não lotado.';
comment on column public.groups.reaberto_em is
  'Reaberto à mão (reabrir_grupo): tem prioridade no link (D3). O trigger limpa quando lota de novo.';
comment on column public.groups.aviso_lotou_em is
  'Aviso ao lotar já tratado (D10): uma vez por grupo, nunca é limpa. Grupo que nasce cheio e o backfill já vêm preenchidos.';

alter table public.campaign_groups
  add column if not exists aviso_ao_lotar text,
  add column if not exists aviso_ao_lotar_desde timestamptz;

comment on column public.campaign_groups.aviso_ao_lotar is
  'Texto enviado uma vez a cada grupo da campanha que ganha a marca de lotado (D10). Nulo ou vazio = desligado.';
comment on column public.campaign_groups.aviso_ao_lotar_desde is
  'Quando o aviso foi ligado: só grupo que lotar a partir daqui recebe (não retroativo).';

alter table public.broadcasts
  add column if not exists target_rule text;

-- SEM check amarrando target_rule a campaign_group_id: a FK é on delete set null e o check faria
-- apagar campanha falhar. Campanha nula = zero alvos (app.alvos_do_disparo).
alter table public.broadcasts drop constraint if exists broadcasts_target_rule_check;
alter table public.broadcasts
  add constraint broadcasts_target_rule_check
  check (target_rule is null or target_rule in ('menos_enchendo', 'lotados', 'com_gente'));

comment on column public.broadcasts.target_rule is
  'Regra de destino refeita na hora do envio (D8): menos_enchendo | lotados | com_gente. Nula = lista fixa em group_ids.';

alter table public.group_bulk_jobs
  add column if not exists subject text;

-- CHECK de checagem não tem ALTER: recriar com as seis ações de 20260917010000 + set_subject.
alter table public.group_bulk_jobs drop constraint if exists group_bulk_jobs_action_check;
alter table public.group_bulk_jobs
  add constraint group_bulk_jobs_action_check
  check (action = any (array[
    'set_description', 'set_picture', 'open', 'close', 'check_invite', 'remove_participant',
    'set_subject'
  ]));

comment on column public.group_bulk_jobs.subject is
  'Nome novo do grupo. Só preenchido em set_subject (Padronizar, D9).';

-- Varredor do aviso (enviar_avisos_lotou): só os lotados ainda sem aviso.
create index if not exists groups_aviso_lotou_pendente_idx
  on public.groups (tenant_id)
  where lotado_em is not null and aviso_lotou_em is null;

-- 2) Estado e regras (spec §3, §5.2). Ninguém mais decide "lotado", "enchendo" ou regra.

create or replace function app.limiar_lotado(p_capacity integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (case when p_capacity > 0 then p_capacity else 1024 end) * 0.95;
$$;

-- A ÚNICA definição das regras de destino. Toda regra exige admin (como o fan-out já exigia).
create or replace function app.grupo_na_regra(p_estado text, p_is_admin boolean, p_regra text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_is_admin and case p_regra
      when 'menos_enchendo' then p_estado in ('lotado', 'fila')
      when 'lotados' then p_estado = 'lotado'
      when 'com_gente' then p_estado in ('lotado', 'fila', 'enchendo')
      else false
    end,
    false);
$$;

create or replace function app.estados_da_campanha(p_tenant uuid, p_campanha uuid)
returns table (
  posicao integer,
  group_id uuid,
  whatsapp_group_id text,
  name text,
  members integer,
  capacity integer,
  is_admin boolean,
  invite_url text,
  lotado_em timestamptz,
  lotado_por text,
  reaberto_em timestamptz,
  aviso_lotou_em timestamptz,
  estado text,
  pode_reabrir boolean,
  na_regra_menos_enchendo boolean,
  na_regra_lotados boolean,
  na_regra_com_gente boolean
)
language sql
stable
set search_path = ''
as $$
  with pool as (
    -- JID repetido no array vale a menor posição.
    select distinct on (p.jid) p.jid, p.posicao::integer as posicao
    from public.campaign_groups c
    cross join lateral unnest(c.group_ids) with ordinality as p(jid, posicao)
    where c.tenant_id = p_tenant
      and c.id = p_campanha
    order by p.jid, p.posicao
  ),
  grupos as (
    -- JID do pool sem linha em groups não sai (o link já o ignora; diagnosePool trata).
    select pool.posicao, g.id, g.whatsapp_group_id, g.name, g.members, g.capacity, g.is_admin,
           g.invite_url, g.lotado_em, g.lotado_por, g.reaberto_em, g.aviso_lotou_em, g.admins_ours,
           -- Disponível = isGroupAvailable (resolve-click-target.ts, convite com /i) + não lotado.
           (g.is_admin
             and coalesce(g.invite_url, '') ~* '^https?://\S+$'
             and g.lotado_em is null
             and g.members < app.limiar_lotado(g.capacity)) as disponivel
    from pool
    join public.groups g
      on g.tenant_id = p_tenant
     and g.whatsapp_group_id = pool.jid
  ),
  enchendo as (
    -- O primeiro disponível: reabertos primeiro (D3), entre eles e depois deles a ordem do pool.
    select gr.id
    from grupos gr
    where gr.disponivel
    order by (gr.reaberto_em is null), gr.posicao
    limit 1
  ),
  classificados as (
    select gr.*,
           case
             when gr.lotado_em is not null then 'lotado'
             when gr.id = (select e.id from enchendo e) then 'enchendo'
             when gr.members <= greatest(gr.admins_ours, 1) then 'vazio'
             else 'fila'
           end as estado
    from grupos gr
  )
  select cl.posicao, cl.id, cl.whatsapp_group_id, cl.name, cl.members, cl.capacity, cl.is_admin,
         cl.invite_url, cl.lotado_em, cl.lotado_por, cl.reaberto_em, cl.aviso_lotou_em, cl.estado,
         (cl.lotado_em is not null and cl.members < app.limiar_lotado(cl.capacity)),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'menos_enchendo'),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'lotados'),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'com_gente')
  from classificados cl
  order by cl.posicao;
$$;

-- JIDs da regra, na ordem do pool. Campanha nula ou de outra loja = zero JIDs.
create or replace function app.alvos_da_regra(p_tenant uuid, p_campanha uuid, p_regra text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(e.whatsapp_group_id order by e.posicao), '{}'::text[])
  from app.estados_da_campanha(p_tenant, p_campanha) as e
  where app.grupo_na_regra(e.estado, e.is_admin, p_regra);
$$;

-- Destinos de um disparo. Com regra: os JIDs da regra, refeitos agora (D8); campanha nula (apagada)
-- dá zero, nunca "todos". Sem regra: o predicado de 20260730100000, sem mudança — só grupo em que o
-- número é admin, e group_ids vazio = todos os admin. O is_admin vale para a lista explícita também:
-- o sync grava TODOS os grupos com a flag, e disparar onde não somos admin é envio que o WhatsApp
-- recusa, que queima cota anti-ban e cujas falhas alimentam o breaker do número.
create or replace function app.alvos_do_disparo(b public.broadcasts)
returns text[]
language sql
stable
set search_path = ''
as $$
  select case
    when b.target_rule is not null then
      app.alvos_da_regra(b.tenant_id, b.campaign_group_id, b.target_rule)
    else (
      select coalesce(array_agg(g.whatsapp_group_id order by g.whatsapp_group_id), '{}'::text[])
      from public.groups g
      where g.tenant_id = b.tenant_id
        and g.is_admin
        and (
          coalesce(array_length(b.group_ids, 1), 0) = 0
          or g.whatsapp_group_id = any(b.group_ids)
        )
    )
  end;
$$;

-- 3) A marca automática (spec §5.3): o único escritor automático de lotado_em. Todo escritor de
--    members (apply_group_members_delta, upsert do sync, insertNewGroups, registerGrownGroup) passa
--    por ele sem saber. security definer: chama app.limiar_lotado como dono, e não como o papel que
--    escreveu o grupo, que pode não ter USAGE no schema app nem EXECUTE em app.limiar_lotado.
create or replace function app.groups_marca_lotado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Já marcado: nada a fazer. Nunca limpa a marca (D1).
  if new.lotado_em is not null then
    return new;
  end if;
  if new.members < app.limiar_lotado(new.capacity) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Descoberto já cheio não "acabou de lotar": sem o aviso_lotou_em, o primeiro sync de um
    -- lojista novo dispararia o aviso em todos os grupos cheios.
    new.lotado_em := now();
    new.lotado_por := 'auto';
    new.aviso_lotou_em := now();
  elsif old.members < app.limiar_lotado(old.capacity) then
    -- Cruzou subindo. O reaberto perde a prioridade no link (D3); o aviso não é tocado (D10).
    new.lotado_em := now();
    new.lotado_por := 'auto';
    new.reaberto_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists groups_marca_lotado on public.groups;
create trigger groups_marca_lotado
  before insert or update of members, capacity on public.groups
  for each row
  execute function app.groups_marca_lotado();

-- 4) Backfill (spec §5.7). Não dispara o trigger (não toca members/capacity) e não gera aviso:
--    os grupos que já estavam cheios aparecem como "Lotou hoje".
update public.groups
   set lotado_em = now(), lotado_por = 'auto', aviso_lotou_em = now()
 where lotado_em is null
   and members >= app.limiar_lotado(capacity);

-- 5) RPCs (spec §5.2, §5.4, §5.6). PostgREST só enxerga public: estes são os wrappers.

create or replace function public.campaign_group_states(p_tenant uuid, p_campaign uuid)
returns table (
  posicao integer,
  group_id uuid,
  whatsapp_group_id text,
  name text,
  members integer,
  capacity integer,
  is_admin boolean,
  invite_url text,
  lotado_em timestamptz,
  lotado_por text,
  reaberto_em timestamptz,
  aviso_lotou_em timestamptz,
  estado text,
  pode_reabrir boolean,
  na_regra_menos_enchendo boolean,
  na_regra_lotados boolean,
  na_regra_com_gente boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.estados_da_campanha(p_tenant, p_campaign);
$$;

create or replace function public.marcar_grupo_lotado(p_tenant uuid, p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups g
     set lotado_em = now(), lotado_por = 'manual', reaberto_em = null
   where g.tenant_id = p_tenant
     and g.id = p_group
     and g.lotado_em is null;
  if found then
    return 'ok';
  end if;

  perform 1 from public.groups g where g.tenant_id = p_tenant and g.id = p_group;
  if found then
    return 'ja_lotado';
  end if;
  return 'nao_encontrado';
end;
$$;

create or replace function public.reabrir_grupo(p_tenant uuid, p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lotado boolean;
begin
  -- A condição de vaga vai NO where (D2): checar e gravar num passo só, sem corrida.
  update public.groups g
     set lotado_em = null, lotado_por = null, reaberto_em = now()
   where g.tenant_id = p_tenant
     and g.id = p_group
     and g.lotado_em is not null
     and g.members < app.limiar_lotado(g.capacity);
  if found then
    return 'ok';
  end if;

  select g.lotado_em is not null into v_lotado
  from public.groups g
  where g.tenant_id = p_tenant and g.id = p_group;
  if not found then
    return 'nao_encontrado';
  end if;
  if not v_lotado then
    return 'nao_lotado';
  end if;
  return 'ainda_cheio';
end;
$$;

-- Aviso ao lotar (D10). Chamado pelo worker a cada 30 s (PR 9): devolve só um inteiro (egress) —
-- quantos avisos ficaram NA FILA (broadcast com status 'queued'; o que falhou no enfileiramento não
-- conta). Um aviso por GRUPO: grupo em duas campanhas da loja (conflito legado de D4)
-- pega uma só, a mais antiga com aviso ligado. aviso_lotou_em é gravado qualquer que seja o
-- resultado do enfileiramento (sem número conectado vira 'failed' no histórico de Disparos, como
-- qualquer disparo; não tenta de novo a cada 30 s).
-- Janela de frescor: só avisa quem lotou na última hora (g.lotado_em >= now() - interval '1 hour').
-- Grupo que encheu fora de uma campanha com aviso e entrou nela depois não pode receber um "Lotou!"
-- atrasado; 1 hora tolera uma pane curta do worker sem perder o aviso de quem acabou de lotar.
-- Grupo elegível em que o número NÃO é admin: não envia (o WhatsApp recusaria), não conta no
-- retorno, mas marca aviso_lotou_em. Sem isso ficaria pendente para sempre e, se o número virasse
-- admin dias depois, o aviso sairia atrasado.
create or replace function public.enviar_avisos_lotou(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_broadcast_id uuid;
  v_bc public.broadcasts;
  v_enviados integer := 0;
begin
  for r in
    select g.id as group_id, g.tenant_id, g.whatsapp_group_id, g.name, g.is_admin,
           c.id as campanha_id, c.aviso_ao_lotar
    from public.groups g
    cross join lateral (
      select cg.id, cg.aviso_ao_lotar
      from public.campaign_groups cg
      where cg.tenant_id = g.tenant_id
        and g.whatsapp_group_id = any(cg.group_ids)
        and nullif(btrim(cg.aviso_ao_lotar), '') is not null
        and g.lotado_em >= cg.aviso_ao_lotar_desde
      order by cg.created_at, cg.id
      limit 1
    ) as c
    where g.lotado_em is not null
      and g.lotado_em >= now() - interval '1 hour'
      and g.aviso_lotou_em is null
    order by g.lotado_em, g.id
    limit greatest(coalesce(p_limit, 20), 1)
    for update of g skip locked
  loop
    if r.is_admin then
      insert into public.broadcasts (tenant_id, campaign_group_id, name, message, group_ids, status)
      values (r.tenant_id, r.campanha_id, 'Aviso ao lotar · ' || r.name, r.aviso_ao_lotar,
              array[r.whatsapp_group_id], 'draft')
      returning id into v_broadcast_id;

      v_bc := app.enqueue_broadcast(r.tenant_id, v_broadcast_id);
      if v_bc.status = 'queued' then
        v_enviados := v_enviados + 1;
      end if;
    end if;

    update public.groups
       set aviso_lotou_em = now()
     where tenant_id = r.tenant_id
       and id = r.group_id;
  end loop;

  return v_enviados;
end;
$$;

-- 6) Disparo (spec §5.5). Corpos do repo — a trava do bloco 0 garantiu que são os deste banco —
--    com UMA troca cada.

-- Troca: o bloco de destinos (comentário + select ... into jids) vira app.alvos_do_disparo(b), e o
-- erro de destino vazio fica específico quando há regra.
create or replace function app.enqueue_broadcast(
  target_tenant_id uuid,
  target_broadcast_id uuid
)
returns public.broadcasts
language plpgsql
security definer
set search_path = public, app
as $$
declare
  b public.broadcasts;
  target_instance uuid;
  new_run_id uuid := gen_random_uuid();
  cmd_type text;
  jids text[];
  inserted integer := 0;
  msg text;
  media text;
  media_kind text;
  mention boolean;
  poll_question text;
  poll_options text[];
begin
  -- FOR UPDATE serializa duplo-clique no botão: o segundo espera o primeiro
  -- terminar e então cai no guard de status abaixo, em vez de fazer 2 fan-outs.
  select * into b
  from public.broadcasts
  where id = target_broadcast_id and tenant_id = target_tenant_id
  for update;

  if not found then
    return null;
  end if;

  -- Idempotente: já na fila / já rodando não refaz o fan-out. Mesmos estados que
  -- o enqueueBroadcast antigo aceitava (draft/sent/failed).
  if b.status not in ('draft', 'sent', 'failed') then
    return b;
  end if;

  msg := coalesce(b.message, '');
  media := b.media_id;
  mention := coalesce(b.mention_all, false);
  media_kind := case when b.media_type in ('video', 'document') then b.media_type else 'image' end;
  poll_question := nullif(b.poll ->> 'question', '');

  select coalesce(array_agg(value), '{}'::text[])
    into poll_options
  from jsonb_array_elements_text(coalesce(b.poll -> 'options', '[]'::jsonb)) as value
  where value <> '';

  -- Tipo do comando com a MESMA precedência do engine legado
  -- (hubflow-engine/index.js: enquete > mídia > texto).
  if poll_question is not null and coalesce(array_length(poll_options, 1), 0) >= 2 then
    cmd_type := 'send_poll';
  elsif media is not null then
    cmd_type := 'send_media';
  elsif msg <> '' then
    cmd_type := 'send_message';
  else
    update public.broadcasts
    set status = 'failed', error = 'Oferta sem conteúdo (texto, mídia ou enquete).',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Número que vai disparar. Fixado agora: o comando carrega instance_id e o
  -- gate anti-ban é POR NÚMERO, então o alvo precisa ser conhecido no enfileiramento.
  select id into target_instance
  from public.instances
  where tenant_id = target_tenant_id
    and status = 'connected'
    and provider_instance_id is not null
  order by connected_at desc nulls last, created_at asc
  limit 1;

  if target_instance is null then
    update public.broadcasts
    set status = 'failed', error = 'Nenhum número conectado para disparar.',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Destinos: app.alvos_do_disparo (20261010120000) é a única definição. Sem regra
  -- (target_rule nulo) é o predicado de antes; com regra, os JIDs da regra na
  -- campanha, refeitos agora (spec D8).
  jids := app.alvos_do_disparo(b);

  if coalesce(array_length(jids, 1), 0) = 0 then
    update public.broadcasts
    set status = 'failed',
        error = case
          when b.target_rule is not null then 'Nenhum grupo nesta regra agora.'
          else 'Nenhum grupo de destino (verifique se o número é admin dos grupos).'
        end,
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Um comando por grupo. priority 100 = fan-out (ver engine_queue_v2).
  -- O payload é o contrato que apps/worker/src/send-command.ts consome.
  with ins as (
    insert into public.engine_commands (
      tenant_id, instance_id, type, status, payload, priority, dedupe_key,
      origin_kind, origin_id, origin_run_id
    )
    select
      target_tenant_id,
      target_instance,
      cmd_type,
      'queued',
      case cmd_type
        when 'send_poll' then jsonb_build_object(
          'jid', t.jid, 'question', poll_question, 'options', to_jsonb(poll_options))
        when 'send_media' then jsonb_build_object(
          'jid', t.jid, 'mediaId', media, 'mediaType', media_kind,
          'caption', msg, 'mentionAll', mention)
        else jsonb_build_object(
          'jid', t.jid, 'text', msg, 'mentionAll', mention)
      end,
      100,
      -- run_id na chave: sem ele, reenviar a MESMA oferta bateria no índice
      -- único, inseriria 0 linhas e o disparo sumiria em silêncio.
      'bc:' || target_broadcast_id::text || ':' || new_run_id::text || ':' || t.jid,
      'broadcast',
      target_broadcast_id,
      new_run_id
    from unnest(jids) as t(jid)
    on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*)::integer into inserted from ins;

  update public.broadcasts
  set
    run_id = new_run_id,
    status = 'queued',
    sent = 0,
    total = inserted,
    error = null,
    dispatched_at = null,
    running_since = now(),
    last_ack_at = now(),
    updated_at = now()
  where id = target_broadcast_id
  returning * into b;

  return b;
end;
$$;

-- Troca: o bloco que COPIAVA o predicado de destino para abrir a Oferta Relâmpago passa a ler os
-- JIDs que enqueue_broadcast enfileirou neste run (a variável v_group_ids saiu junto).
create or replace function app.promote_due_schedules(max_schedules integer default 50)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  promoted integer := 0;
  s record;
  step interval;
  next_at timestamptz;
  v_offer_id uuid;
  v_alvos text[];
  v_anteriores uuid[];
  v_broadcast public.broadcasts;
  v_missed boolean;
begin
  for s in
    select sc.id, sc.tenant_id, sc.broadcast_id, sc.scheduled_at, sc.recurrence
    from public.schedules sc
    where sc.status = 'pending'
      and sc.scheduled_at <= now()
    order by sc.scheduled_at asc
    limit greatest(max_schedules, 1)
    for update skip locked
  loop
    -- Perdeu a hora (worker/VPS fora do ar): nao dispara atrasado. Mensagem de
    -- oferta fora do horario e pior que mensagem nenhuma.
    v_missed := now() - s.scheduled_at > app.missed_send_tolerance();

    if v_missed and s.recurrence = 'none' and s.broadcast_id is not null then
      update public.broadcasts
      set status = 'failed',
          error = 'Não enviado: perdeu o horário agendado (servidor fora do ar).',
          updated_at = now()
      where id = s.broadcast_id
        and tenant_id = s.tenant_id
        and status in ('draft', 'sent', 'failed');
    end if;

    if not v_missed and s.broadcast_id is not null then
      v_broadcast := app.enqueue_broadcast(s.tenant_id, s.broadcast_id);
      -- Contagem inalterada de proposito: "promovido" sempre quis dizer
      -- "agendamento com broadcast que chegou na hora", nao "mensagem que saiu".
      promoted := promoted + 1;

      -- Funil: etapa relampago. A oferta ligada abre agora, junto da mensagem.
      --
      -- So abre se enqueue_broadcast realmente enfileirou. Ela devolve o
      -- broadcast e volta com status 'failed' e total 0 quando nao ha numero
      -- conectado, nao ha grupo de destino ou o conteudo esta vazio; devolve
      -- null quando o broadcast sumiu. Abrir a oferta nesses casos criaria uma
      -- oferta que ninguem foi convidado a usar, e ela seguraria o indice
      -- flash_offer_groups_um_aberto_uidx do grupo ate alguem fechar a mao.
      v_offer_id := null;
      if v_broadcast.id is not null
         and v_broadcast.status = 'queued'
         and coalesce(v_broadcast.total, 0) > 0 then
        select fo.id into v_offer_id
        from public.flash_offers fo
        where fo.broadcast_id = s.broadcast_id
          and fo.tenant_id = s.tenant_id
          and fo.status = 'draft'
        limit 1;
      end if;

      if v_offer_id is not null then
        -- Os grupos que receberam ESTA mensagem: os JIDs que enqueue_broadcast
        -- enfileirou neste run. Antes este bloco copiava o predicado de destino;
        -- com a regra de destino (broadcasts.target_rule, 20261010120000) a copia
        -- divergiria e a oferta escutaria grupo que nao recebeu a mensagem.
        -- origin_id + origin_run_id vao pelo engine_commands_origin_idx.
        select coalesce(array_agg(c.payload ->> 'jid'), '{}') into v_alvos
        from public.engine_commands c
        where c.tenant_id = s.tenant_id
          and c.origin_kind = 'broadcast'
          and c.origin_id = s.broadcast_id
          and c.origin_run_id = v_broadcast.run_id;

        -- A oferta de funil anterior nesses grupos da lugar a esta (ver topo).
        select coalesce(array_agg(distinct fo.id), '{}') into v_anteriores
        from public.flash_offer_groups fog
        join public.flash_offers fo
          on fo.id = fog.offer_id
         and fo.tenant_id = fog.tenant_id
        where fog.tenant_id = s.tenant_id
          and fog.closed_at is null
          and fog.whatsapp_group_id = any(v_alvos)
          and fo.broadcast_id is not null
          and fo.status = 'open'
          and fo.id <> v_offer_id;

        if coalesce(array_length(v_anteriores, 1), 0) > 0 then
          update public.flash_offers
          set status = 'closed', closed_at = now(), updated_at = now()
          where tenant_id = s.tenant_id
            and id = any(v_anteriores);

          update public.flash_offer_groups
          set closed_at = now()
          where tenant_id = s.tenant_id
            and offer_id = any(v_anteriores)
            and closed_at is null;
        end if;

        update public.flash_offers
        set status = 'open', opened_at = now(), updated_at = now()
        where id = v_offer_id
          and tenant_id = s.tenant_id;

        -- Grupo que ainda tem outra oferta aberta (so pode ser oferta criada a
        -- mao) e pulado pelo indice parcial. A mensagem sai mesmo assim.
        insert into public.flash_offer_groups
          (tenant_id, offer_id, group_id, whatsapp_group_id, opened_at, lid_map)
        select g.tenant_id, v_offer_id, g.id, g.whatsapp_group_id, now(),
               app.lid_map_from_history(g.tenant_id, g.whatsapp_group_id)
        from public.groups g
        where g.tenant_id = s.tenant_id
          and g.whatsapp_group_id = any(v_alvos)
        on conflict (tenant_id, whatsapp_group_id) where closed_at is null do nothing;
      end if;
    end if;

    if s.recurrence = 'none' then
      update public.schedules
      set status = case when v_missed then 'failed'::public.schedule_status else 'done'::public.schedule_status end,
          last_run_at = now(), updated_at = now()
      where id = s.id;
    else
      step := case when s.recurrence = 'daily' then interval '1 day' else interval '7 days' end;
      -- Avanca ate o futuro: um worker parado 3 dias nao pode gerar 3 disparos.
      next_at := s.scheduled_at;
      while next_at <= now() loop
        next_at := next_at + step;
      end loop;
      update public.schedules
      set scheduled_at = next_at, last_run_at = now(), updated_at = now()
      where id = s.id;
    end if;
  end loop;

  return promoted;
end;
$$;

-- 7) Privilégio. create or replace não preserva ACL de forma confiável (20260904100000); função
--    nova de public nasce executável por authenticated (default privilege do grantor postgres); e
--    função de app nasce com EXECUTE para PUBLIC. Todas ficam postgres + service_role. Quem chama as
--    de app são funções definer de dono postgres (wrappers, trigger, enqueue, promote); trigger não
--    precisa de EXECUTE para disparar.
revoke all on function app.limiar_lotado(integer) from public, anon, authenticated;
grant execute on function app.limiar_lotado(integer) to service_role;
revoke all on function app.grupo_na_regra(text, boolean, text) from public, anon, authenticated;
grant execute on function app.grupo_na_regra(text, boolean, text) to service_role;
revoke all on function app.estados_da_campanha(uuid, uuid) from public, anon, authenticated;
grant execute on function app.estados_da_campanha(uuid, uuid) to service_role;
revoke all on function app.alvos_da_regra(uuid, uuid, text) from public, anon, authenticated;
grant execute on function app.alvos_da_regra(uuid, uuid, text) to service_role;
revoke all on function app.alvos_do_disparo(public.broadcasts) from public, anon, authenticated;
grant execute on function app.alvos_do_disparo(public.broadcasts) to service_role;
revoke all on function app.groups_marca_lotado() from public, anon, authenticated;
grant execute on function app.groups_marca_lotado() to service_role;
revoke all on function app.enqueue_broadcast(uuid, uuid) from public, anon, authenticated;
grant execute on function app.enqueue_broadcast(uuid, uuid) to service_role;
revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;
revoke all on function public.campaign_group_states(uuid, uuid) from public, anon, authenticated;
grant execute on function public.campaign_group_states(uuid, uuid) to service_role;
revoke all on function public.marcar_grupo_lotado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.marcar_grupo_lotado(uuid, uuid) to service_role;
revoke all on function public.reabrir_grupo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reabrir_grupo(uuid, uuid) to service_role;
revoke all on function public.enviar_avisos_lotou(integer) from public, anon, authenticated;
grant execute on function public.enviar_avisos_lotou(integer) to service_role;

-- O PostgREST passa a enxergar as RPCs sem esperar o recarregamento automático.
notify pgrst, 'reload schema';
