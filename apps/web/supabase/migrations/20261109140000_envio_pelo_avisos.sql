-- 09/11/2026: envio pelo Avisos da comunidade nativa, automatico.
--
-- A loja piloto posta o mesmo conteudo em 36 grupos: 36 envios identicos em minutos, a rajada que o
-- WhatsApp derrubou tres vezes em 15 dias (analise de 07/11). O WhatsApp tem o mecanismo certo para isso:
-- o grupo de Avisos da comunidade, em que um post do admin alcanca todo mundo dos grupos vinculados (ate
-- 2.000 pessoas). O Girumo ja le a comunidade nativa e ja dispara pelo Avisos a mao ("Enviar pelo Avisos",
-- 23/09). Falta o automatico: quando TODOS os grupos-membro de uma comunidade estao no alvo de um post e
-- o numero e admin do Avisos dela, app.enqueue_broadcast troca esses grupos pelo Avisos. Post parcial segue
-- grupo a grupo (audiencia intacta). No Avisos nao vai @todos (ele ja notifica a comunidade) e o comando
-- leva payload.viaAvisos = true. Teto por grupo e espacamento valem para o Avisos como para qualquer grupo.
-- Tudo em app.*: nao muda a baseline. Conferir nos DOIS bancos com infra/tests/envio-pelo-avisos-check.sql.
-- Idempotente: a trava aceita o corpo anterior (20261105120000) e o desta migracao.

-- Trava: enqueue_broadcast tem que ser o corpo de 20261105120000 (md5 conferido em dev e prod em 09/11)
-- ou o desta migracao.
do $$
declare
  v_body text;
begin
  select p.prosrc into v_body from pg_proc p where p.oid = to_regprocedure('app.enqueue_broadcast(uuid,uuid)');
  if v_body is null then
    raise exception 'envio_pelo_avisos: app.enqueue_broadcast não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_body, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('6cd933f1e73c6e9a71651d37241f621e', '28f0a17697786251d87d8ae8bf927f67') then
    raise exception 'envio_pelo_avisos: o corpo de app.enqueue_broadcast neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

-- 1) Quais Avisos cobrem o alvo: para cada comunidade nativa da loja em que TODOS os grupos-membro
--    conhecidos estao no alvo e o numero e admin do Avisos, a comunidade, o JID do Avisos e os grupos
--    cobertos. Comunidade com grupo de fora, ou com Avisos em que nao somos admin, nao aparece.
create or replace function app.avisos_que_cobrem(p_tenant uuid, p_jids text[])
returns table (community_jid text, aviso_jid text, cobertos text[])
language sql
stable
security definer
set search_path = public, app
as $$
  with alvo as (
    select distinct t.jid from unnest(coalesce(p_jids, '{}'::text[])) as t(jid)
  ),
  membros as (
    select g.community_jid, g.whatsapp_group_id as jid, (a.jid is not null) as no_alvo
    from public.groups g
    left join alvo a on a.jid = g.whatsapp_group_id
    where g.tenant_id = p_tenant
      and g.community_jid is not null
      and g.community_role = 'member'
      and g.whatsapp_group_id is not null
  ),
  cobertas as (
    select m.community_jid, array_agg(m.jid order by m.jid) as cobertos
    from membros m
    group by m.community_jid
    having bool_and(m.no_alvo)
  )
  select c.community_jid, av.whatsapp_group_id, c.cobertos
  from cobertas c
  join public.groups av
    on av.tenant_id = p_tenant
   and av.community_jid = c.community_jid
   and av.community_role = 'announce'
   and av.is_admin
   and av.whatsapp_group_id is not null;
$$;

revoke all on function app.avisos_que_cobrem(uuid, text[]) from public, anon, authenticated;
grant execute on function app.avisos_que_cobrem(uuid, text[]) to service_role;

-- 2) enqueue_broadcast com o colapso (diff contra 20261105120000: variaveis avisos/cobertos, o bloco
--    depois de alvos_do_disparo, mentionAll desligado no Avisos e payload.viaAvisos).
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
  avisos text[] := '{}';
  cobertos text[] := '{}';
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

  -- Comunidade nativa (20261109140000): se TODOS os grupos-membro de uma comunidade estao no alvo e o
  -- numero e admin do Avisos dela, os grupos saem do alvo e entra o Avisos. Um envio alcanca a comunidade
  -- inteira (ate 2.000 pessoas) no lugar de N envios identicos: e o mecanismo que o proprio WhatsApp
  -- desenhou para o admin falar com todo mundo, e tira do numero a rajada que o derrubou. Post parcial
  -- (so parte dos grupos da comunidade) segue grupo a grupo, para nao mudar a audiencia. No Avisos nao
  -- vai @todos: ele ja notifica a comunidade.
  select coalesce(array_agg(distinct a.aviso_jid), '{}'), coalesce(array_agg(distinct c.jid), '{}')
    into avisos, cobertos
  from app.avisos_que_cobrem(target_tenant_id, jids) a
  cross join lateral unnest(a.cobertos) as c(jid);

  if coalesce(array_length(avisos, 1), 0) > 0 then
    select coalesce(array_agg(x.jid order by x.jid), '{}') into jids
    from (
      select t.jid from unnest(jids) as t(jid) where t.jid <> all(cobertos)
      union
      select v.jid from unnest(avisos) as v(jid)
    ) x;
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
          'caption', msg, 'mentionAll', (mention and t.jid <> all(avisos)), 'fileName', b.media_name)
        else jsonb_build_object(
          'jid', t.jid, 'text', msg, 'mentionAll', (mention and t.jid <> all(avisos)))
      end
        || case when t.jid = any(cheios) then jsonb_build_object('foraDoTeto', true) else '{}'::jsonb end
        || case when t.jid = any(avisos) then jsonb_build_object('viaAvisos', true) else '{}'::jsonb end
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

revoke all on function app.enqueue_broadcast(uuid, uuid) from public, anon, authenticated;
grant execute on function app.enqueue_broadcast(uuid, uuid) to service_role;
