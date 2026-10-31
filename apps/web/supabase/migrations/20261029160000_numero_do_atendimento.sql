-- 2026-10-29 - Número do atendimento (Recuperar PR 2, comum com o Rastreio): no banco, quem escolhe
-- "o número da loja" passa a ver só o número dos grupos.
--
-- A loja ganha um segundo número, o do atendimento (instances.purpose = 'privado', PR 1a), que só fala
-- no privado e nunca posta em grupo. Spec: docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md,
-- §3 "Base do privado". Três corpos mudam, cada um com trava de md5 (molde de 20261026120000):
--
--   1. app.enqueue_broadcast: o número que dispara é o connected mais recente COM purpose = 'grupos'.
--      Sem isso, um número do atendimento conectado depois do dos grupos passaria a postar (o order by
--      é connected_at desc).
--   2. app.instance_caps: o número do atendimento não tem teto de post e devolve zero linhas. O claim de
--      post (cross join lateral) nunca pega comando de grupo nele, app.instance_health não o lista (a
--      saúde do número em /painel/conectar e o Job 6 do cron seguem só com o dos grupos) e
--      app.instance_daily_cap dele sai nulo.
--   3. public.avaliar_disjuntor_saidas: "a loja enviou nas últimas 3 h" conta só envio do número dos
--      grupos. O cancelamento já era só de send_message/send_media/send_poll: comando de DM (dm_text,
--      dm_image) não é tocado.
--
-- Corpo de função não entra no hash do gate de drift: não muda a baseline. Conferir com
-- infra/tests/numero-do-atendimento-check.sql nos dois bancos. Idempotente: create or replace, e cada
-- trava aceita o corpo anterior e o desta migração (reaplicar passa).

-- 0) Depende de instances.purpose (PR 1a). plpgsql não confere coluna ao criar a função: sem esta guarda
--    a migração passaria num banco sem a coluna e o envio quebraria na primeira chamada.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'instances' and column_name = 'purpose'
  ) then
    raise exception 'numero_do_atendimento: falta instances.purpose (migração do PR 1a)';
  end if;
end $$;

-- 1) app.enqueue_broadcast: corpo de 20261026120000 com uma troca (purpose = 'grupos' na escolha do número).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.enqueue_broadcast(uuid,uuid)');
  if v_src is null then
    raise exception 'numero_do_atendimento: app.enqueue_broadcast não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('1f4dd5f929572998777a1fd9c4901398', '568df07ab69fc81d8473e724b81c69b4') then
    raise exception 'numero_do_atendimento: o corpo de app.enqueue_broadcast neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

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
  v_teto integer := app.posts_por_grupo_dia();
  cheios text[];
  saindo integer := 0;
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
    -- Só o número dos grupos posta. O do atendimento (purpose = 'privado') nunca entra aqui, nem
    -- conectado depois: o order by abaixo o escolheria.
    and purpose = 'grupos'
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

  -- Uma contagem por loja de cada vez: dois posts enfileirados juntos leriam o mesmo "3".
  -- ponytail: o lock vale até o fim da transação de QUEM CHAMA. Resta deadlock entre dois loops
  -- de várias lojas que pegam os locks em ordem diferente (duas réplicas do worker sobrepostas num
  -- deploy, ou o check rodado em prod contra o worker); o Postgres aborta um lado e o worker repete
  -- no próximo tick.
  perform pg_advisory_xact_lock(hashtextextended('posts_por_grupo:' || target_tenant_id::text, 0));
  select coalesce(array_agg(h.jid), '{}') into cheios
  from app.posts_hoje_por_grupo(target_tenant_id) h
  where h.posts >= v_teto and h.jid = any(jids);

  -- Um comando por grupo. priority 100 = fan-out (ver engine_queue_v2).
  -- O payload é o contrato que apps/worker/src/send-command.ts consome.
  with ins as (
    insert into public.engine_commands (
      tenant_id, instance_id, type, status, payload, priority, dedupe_key,
      origin_kind, origin_id, origin_run_id, error
    )
    select
      target_tenant_id,
      target_instance,
      cmd_type,
      -- Grupo no teto: o comando nasce canceled, marcado e com o motivo; não sai e não conta.
      (case when t.jid = any(cheios) then 'canceled' else 'queued' end)::public.engine_command_status,
      case cmd_type
        when 'send_poll' then jsonb_build_object(
          'jid', t.jid, 'question', poll_question, 'options', to_jsonb(poll_options))
        when 'send_media' then jsonb_build_object(
          'jid', t.jid, 'mediaId', media, 'mediaType', media_kind,
          'caption', msg, 'mentionAll', mention, 'fileName', b.media_name)
        else jsonb_build_object(
          'jid', t.jid, 'text', msg, 'mentionAll', mention)
      end
        || case when t.jid = any(cheios) then jsonb_build_object('foraDoTeto', true) else '{}'::jsonb end,
      100,
      -- run_id na chave: sem ele, reenviar a MESMA oferta bateria no índice
      -- único, inseriria 0 linhas e o disparo sumiria em silêncio.
      'bc:' || target_broadcast_id::text || ':' || new_run_id::text || ':' || t.jid,
      'broadcast',
      target_broadcast_id,
      new_run_id,
      case when t.jid = any(cheios) then format(
        'Não enviado: este grupo já recebeu %s posts hoje (limite do anti-ban). Volta à meia-noite.', v_teto)
      end
    from unnest(jids) as t(jid)
    on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
    returning status
  )
  -- inserted = todas as linhas (total do post, inclui as de fora); saindo = só as que vão para a fila.
  select count(*)::integer, (count(*) filter (where ins.status = 'queued'))::integer
    into inserted, saindo
  from ins;

  -- Todos de fora: nenhum comando sai. O post vira failed numa rodada nova, com as linhas de fora
  -- nela, para a coluna do post mostrar "limite do dia" em cada grupo.
  if saindo = 0 then
    update public.broadcasts
    set
      run_id = new_run_id,
      status = 'failed',
      sent = 0,
      total = inserted,
      error = format(
        'Nenhum grupo recebeu: todos já tinham %s posts hoje. O limite volta à meia-noite.', v_teto),
      dispatched_at = now(),
      running_since = now(),
      last_ack_at = now(),
      updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

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

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.enqueue_broadcast(uuid, uuid) from public, anon, authenticated;
grant execute on function app.enqueue_broadcast(uuid, uuid) to service_role;

-- 2) app.instance_caps: corpo de 20260904100000 com uma troca (zero linhas para o número do atendimento).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.instance_caps(uuid)');
  if v_src is null then
    raise exception 'numero_do_atendimento: app.instance_caps não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('b72a1efad9acd074f3b50f81811edf0f', 'e60de0eda8f02f171ec9cd2739cd0a7c') then
    raise exception 'numero_do_atendimento: o corpo de app.instance_caps neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

create or replace function app.instance_caps(target_instance_id uuid)
returns table (
  perfil       text,
  per_min      integer,
  per_hour     integer,
  per_day      integer,
  admin_groups integer,
  warmup_day   integer,
  graduated    boolean
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_declared  text;
  v_tenant    uuid;
  v_groups    integer := 0;
  v_graduated boolean := false;
  v_started   timestamptz;
  v_day       integer := 0;
  v_ramp      integer;
  v_purpose   text;
begin
  select i.numero_perfil, i.tenant_id, i.purpose into v_declared, v_tenant, v_purpose
    from public.instances i
   where i.id = target_instance_id;

  -- O número do atendimento não tem teto de post: zero linhas. O claim de post nunca pega comando
  -- dele e app.instance_health não o lista. O ritmo do privado é outro (PR 3).
  if v_purpose = 'privado' then
    return;
  end if;

  if v_tenant is not null then
    -- Evidência: grupos que o número administra com gente de verdade.
    select count(*)::int into v_groups
      from public.groups g
     where g.tenant_id = v_tenant and g.is_admin and g.members >= 10;

    select coalesce(s.warmup_graduated, false), s.warmup_started_at
      into v_graduated, v_started
      from public.instance_send_state s
     where s.instance_id = target_instance_id;
    v_graduated := coalesce(v_graduated, false);

    if v_started is not null then
      v_day := floor(extract(epoch from now() - v_started) / 86400)::int;
    end if;
    if v_day >= 7 then
      v_graduated := true;
    end if;
  end if;

  if v_graduated
     or (v_declared is distinct from 'novo' and (v_declared = 'antigo' or v_groups >= 5)) then
    return query select
      'veterano'::text,
      10,
      least(400, greatest(60, v_groups * 3)),
      least(1500, greatest(300, v_groups * 15)),
      v_groups,
      v_day + 1,
      true;
    return;
  end if;

  -- Novo: rampa de 7 dias (40, 64, 102, 164, 262, 419, 671), limitada pelos grupos.
  v_ramp := round(40 * power(1.6, v_day))::int;
  return query select
    'novo'::text,
    8,
    least(150, greatest(40, v_ramp)),
    least(800, greatest(40, v_groups * 6), v_ramp),
    v_groups,
    v_day + 1,
    false;
end;
$$;

revoke all on function app.instance_caps(uuid) from public, anon, authenticated;
grant execute on function app.instance_caps(uuid) to service_role;

-- 3) public.avaliar_disjuntor_saidas: corpo de 20261023120000 com uma troca (só envio do número dos grupos).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('public.avaliar_disjuntor_saidas(uuid)');
  if v_src is null then
    raise exception 'numero_do_atendimento: public.avaliar_disjuntor_saidas não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('13246a4fb89d8de0375c2d78fea3934a', '448edbce30d6ac74449ba9b7be6980ee') then
    raise exception 'numero_do_atendimento: o corpo de public.avaliar_disjuntor_saidas neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

create or replace function public.avaliar_disjuntor_saidas(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_until    timestamptz;
  v_saidas   integer;
  v_limite   integer;
  v_cancel   integer;
begin
  -- Uma avaliação por loja de cada vez: dois números no mesmo grupo recebem a mesma saída e
  -- chamariam isto em paralelo, abrindo (e notificando) duas vezes.
  perform pg_advisory_xact_lock(hashtextextended('exit_breaker:' || p_tenant::text, 0));

  select b.until into v_until from app.exit_breaker b where b.tenant_id = p_tenant;
  if v_until > now() then
    return jsonb_build_object('aberto', true, 'novo', false, 'ate', v_until);
  end if;

  -- Sem envio nas últimas 3 h não há o que pausar (e a saída não veio de post nosso).
  if not exists (
    select 1 from public.instance_sends x
    join public.instances i on i.id = x.instance_id
    -- Só envio do número dos grupos: mensagem no privado não é post e não explica saída de grupo.
    where i.tenant_id = p_tenant and i.purpose = 'grupos' and x.sent_at > now() - interval '3 hours'
  ) then
    return jsonb_build_object('aberto', false, 'motivo', 'sem_envio');
  end if;

  -- Saída voluntária = o autor do remove é o próprio participante (remoção por admin, incluindo
  -- o "remover duplicados", fica de fora). Só grupos que a loja administra. Pessoa contada uma vez
  -- por grupo (dois números da loja recebem o mesmo aviso).
  select count(*) into v_saidas
  from (
    select distinct e.payload #>> '{data,id}', p ->> 'id'
    from public.engine_events e
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(e.payload #> '{data,participants}') = 'array'
           then e.payload #> '{data,participants}' else '[]'::jsonb end) p
    where e.tenant_id = p_tenant
      and e.type = 'group-participants.update'
      and e.created_at > now() - interval '3 hours'
      and e.payload #>> '{data,action}' = 'remove'
      and p ->> 'id' = e.payload #>> '{data,author}'
      and exists (
        select 1 from public.groups g
        where g.tenant_id = p_tenant and g.is_admin
          and g.whatsapp_group_id = e.payload #>> '{data,id}'
      )
  ) s;

  v_limite := app.exit_breaker_limit(p_tenant);
  if v_saidas < v_limite then
    return jsonb_build_object('aberto', false, 'saidas', v_saidas, 'limite', v_limite);
  end if;

  v_until := now() + interval '6 hours';
  insert into app.exit_breaker (tenant_id, tripped_at, until, saidas, limite)
  values (p_tenant, now(), v_until, v_saidas, v_limite)
  on conflict (tenant_id) do update
    set tripped_at = excluded.tripped_at, until = excluded.until,
        saidas = excluded.saidas, limite = excluded.limite;

  -- O que já está na fila não sai: reconcile_broadcast_progress fecha a oferta com este motivo.
  update public.engine_commands c
  set status = 'canceled',
      error = 'Não enviado: o anti-ban pausou os posts porque muita gente saiu dos grupos logo depois dos últimos posts.',
      lease_expires_at = null,
      updated_at = now()
  where c.tenant_id = p_tenant
    and c.status = 'queued'
    and c.type in ('send_message', 'send_media', 'send_poll');
  get diagnostics v_cancel = row_count;

  insert into public.notifications (tenant_id, type, title, body, href)
  values (
    p_tenant,
    'antiban_saidas',
    'Posts pausados por 6 horas',
    format('%s pessoas saíram dos grupos nas últimas 3 horas, logo depois dos posts. Isso é o sinal que o WhatsApp usa para restringir o número, então pausamos os envios até %s. Evite marcar todos e espace os posts.',
           v_saidas, to_char(v_until at time zone 'America/Sao_Paulo', 'HH24:MI')),
    '/painel/conectar'
  );

  return jsonb_build_object('aberto', true, 'novo', true, 'ate', v_until,
                            'saidas', v_saidas, 'limite', v_limite, 'cancelados', v_cancel);
end;
$$;

revoke all on function public.avaliar_disjuntor_saidas(uuid) from public, anon, authenticated;
grant execute on function public.avaliar_disjuntor_saidas(uuid) to service_role;
