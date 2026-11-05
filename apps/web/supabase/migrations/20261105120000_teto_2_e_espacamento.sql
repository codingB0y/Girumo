-- 2026-11-05 - Teto de 2 posts por grupo por dia e 2 h de espaçamento entre posts no mesmo grupo.
--
-- Por quê: a loja piloto teve o número restringido pelo WhatsApp em 23/10 e em 03/11/2026. Com o teto
-- de 4 (20261026120000) ela postou 4 posts por grupo em 29/10 e 30/10, 2 em 31/10 e 02/11, e caiu na
-- manhã de 03/11. Medido em prod (30 dias): cada post custa 20-85 saídas voluntárias nas 3 h seguintes;
-- dias de 1-2 posts por grupo tiveram 21-83 saídas, dias de 3-5 posts 47-119. Os posts saíam em
-- horário cravado (10:00, 11:00, 12:00) ou a cada 30-40 min, em lotes agendados de 8 a 26 de uma vez.
-- Decisão do Igor em 05/11: teto 2 e nunca dois posts no mesmo grupo com menos de 2 h.
--
-- O que muda (tudo em app.*, o gate de drift não vê corpo nem função do schema app: a baseline não muda):
--
--   1. app.posts_por_grupo_dia(): 4 → 2. Só o corpo, com trava de md5. O texto do motivo no comando de
--      fora e a notificação do agendado cortado inteiro (app.promote_due_schedules) já leem este valor.
--   2. app.espacamento_entre_posts(): 2 h. Mesmo molde (immutable, um valor só, nunca no TypeScript).
--   3. app.ultimo_post_por_grupo(p_tenant, p_desde): por grupo, o instante do último post desde p_desde
--      — greatest(created_at, available_at) dos comandos de envio queued/processing/done. Usa
--      available_at para um post já adiado empurrar o seguinte (encadeia), e não olha o dia: um post às
--      23:30 segura o das 00:30.
--   4. app.enqueue_broadcast: o grupo que recebeu post há menos de 2 h NÃO fica de fora — o comando
--      nasce queued com available_at = último post + 2 h e payload.adiadoPorEspacamento = true. O claim
--      só pega comando com available_at <= now(), então ele espera na fila. É adiamento, não corte: o
--      teto do dia é quem corta. Para quem chegou ao teto nada muda (canceled + foraDoTeto).
--      Corpo de 20261030160000 com três trocas: a variável v_espaco, o left join com
--      app.ultimo_post_por_grupo no insert, e available_at/adiadoPorEspacamento calculados por grupo.
--
-- Efeitos aceitos: um funil com etapas a 12 min de distância passa a sair a 2 h; "Postando agora" pode
-- mostrar um post em andamento por até 2 h; o aviso ao lotar pode sair até 2 h depois de lotar. A
-- tolerância de 15 min do claim conta a partir de available_at, então um comando adiado só é cancelado
-- se o número não enviar nada nos 15 min DEPOIS da hora adiada (worker fora ou número caído), como hoje.
--
-- Conferir nos DOIS bancos com infra/tests/teto-posts-por-grupo-check.sql (reescrito para 2 e com o bloco
-- de espaçamento). Idempotente: create or replace, e cada trava aceita o corpo anterior e o desta migração.

-- 1) Teto 4 → 2. Trava: só o corpo de 20261026120000 (select 4) ou o desta migração (select 2).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('app.posts_por_grupo_dia()');
  if v_src is null then
    raise exception 'teto_2_e_espacamento: app.posts_por_grupo_dia não existe neste banco (falta 20261026120000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('232446d0dab78d5ae67444d950824fde', '8222fbf4485048374b8751d04bb6c90a') then
    raise exception 'teto_2_e_espacamento: o corpo de app.posts_por_grupo_dia neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração e aplique de novo.';
  end if;
end $$;

create or replace function app.posts_por_grupo_dia()
returns integer
language sql
immutable
set search_path to 'public', 'app'
as $$ select 2 $$;

revoke all on function app.posts_por_grupo_dia() from public, anon, authenticated;
grant execute on function app.posts_por_grupo_dia() to service_role;

-- 2) O espaçamento mínimo entre dois posts no mesmo grupo.
create or replace function app.espacamento_entre_posts()
returns interval
language sql
immutable
set search_path to 'public', 'app'
as $$ select interval '2 hours' $$;

revoke all on function app.espacamento_entre_posts() from public, anon, authenticated;
grant execute on function app.espacamento_entre_posts() to service_role;

-- 3) Último post por grupo desde p_desde. greatest(created_at, available_at): um comando já adiado conta
--    pela hora em que vai sair, para o post seguinte encadear atrás dele. Mesmo recorte de comando que
--    app.posts_hoje_por_grupo (tipos de envio, queued/processing/done, jid no payload), sem o filtro de dia.
create or replace function app.ultimo_post_por_grupo(p_tenant uuid, p_desde timestamptz)
returns table (jid text, ultimo timestamptz)
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select c.payload->>'jid', max(greatest(c.created_at, c.available_at))
  from public.engine_commands c
  where c.tenant_id = p_tenant
    and c.type in ('send_message', 'send_media', 'send_poll')
    and c.status in ('queued', 'processing', 'done')
    and c.payload->>'jid' is not null
    and greatest(c.created_at, c.available_at) >= p_desde
  group by 1
$$;

revoke all on function app.ultimo_post_por_grupo(uuid, timestamptz) from public, anon, authenticated;
grant execute on function app.ultimo_post_por_grupo(uuid, timestamptz) to service_role;

-- 4) app.enqueue_broadcast com o adiamento. Trava: o corpo atual tem que ser o de 20261030160000 ou o
--    desta migração (reaplicar passa). Normalização igual às migrações anteriores.
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('app.enqueue_broadcast(uuid,uuid)');
  if v_src is null then
    raise exception 'teto_2_e_espacamento: app.enqueue_broadcast não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('568df07ab69fc81d8473e724b81c69b4', '6cd933f1e73c6e9a71651d37241f621e') then
    raise exception 'teto_2_e_espacamento: o corpo de app.enqueue_broadcast neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
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
  v_espaco interval := app.espacamento_entre_posts();
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
  --
  -- Espaçamento (20261105120000): grupo com post nas últimas v_espaco horas (pela hora em que o post
  -- sai, greatest(created_at, available_at)) recebe o comando com available_at = esse post + v_espaco e
  -- payload.adiadoPorEspacamento = true. O claim só pega comando com available_at <= now(): o post
  -- espera na fila em vez de ficar de fora. O grupo no teto segue canceled, sem adiamento.
  with ultimo as (
    select u.jid, u.ultimo
    from app.ultimo_post_por_grupo(target_tenant_id, now() - v_espaco) u
    where u.jid = any(jids)
  ), ins as (
    insert into public.engine_commands (
      tenant_id, instance_id, type, status, payload, priority, dedupe_key,
      origin_kind, origin_id, origin_run_id, error, available_at
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
        || case when t.jid = any(cheios) then jsonb_build_object('foraDoTeto', true) else '{}'::jsonb end
        || case when t.jid <> all(cheios) and u.ultimo is not null and u.ultimo + v_espaco > now()
                then jsonb_build_object('adiadoPorEspacamento', true) else '{}'::jsonb end,
      100,
      -- run_id na chave: sem ele, reenviar a MESMA oferta bateria no índice
      -- único, inseriria 0 linhas e o disparo sumiria em silêncio.
      'bc:' || target_broadcast_id::text || ':' || new_run_id::text || ':' || t.jid,
      'broadcast',
      target_broadcast_id,
      new_run_id,
      case when t.jid = any(cheios) then format(
        'Não enviado: este grupo já recebeu %s posts hoje (limite do anti-ban). Volta à meia-noite.', v_teto)
      end,
      case when t.jid <> all(cheios) and u.ultimo is not null and u.ultimo + v_espaco > now()
           then u.ultimo + v_espaco else now() end
    from unnest(jids) as t(jid)
    left join ultimo u on u.jid = t.jid
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
