-- 2026-10-26 - Teto de 4 posts por grupo por dia (dia de Brasília), a terceira alavanca do anti-ban.
--
-- Depois do incidente de 23/10/2026 (uma loja piloto, número restringido por 24 h) o #525 passou a
-- ler a reação da base (disjuntor por saídas e orçamento de @todos). Falta limitar quantas vezes o
-- MESMO grupo recebe post no mesmo dia: hoje os únicos tetos são por número (minuto, hora, dia), e
-- eles não impedem 8 posts no mesmo grupo. Prod, 30 dias: mediana 3 posts por grupo por dia, p90 7,
-- máximo 8; os dias de 7-8 posts tiveram 76-141 saídas, os de 1-2 tiveram 21-83. A regra vive só no
-- banco (o TypeScript nunca guarda o 4). Spec: docs/superpowers/specs/2026-10-24-teto-posts-por-grupo-design.md.
--
-- Esta migração tem três seções:
--
--   1. Contagem do dia, teto, leitura para a tela e índice (este bloco).
--      - app.posts_por_grupo_dia(): o teto (4), no molde de app.mention_all_daily_budget().
--      - app.posts_hoje_por_grupo(tenant): (jid, posts) de todo grupo da loja com post hoje. Conta
--        cada comando send_message/send_media/send_poll da loja para o grupo (payload->>'jid') criado
--        desde a meia-noite de Brasília com status queued, processing ou done. canceled e failed não
--        chegaram no grupo e não contam. A conta é por loja e grupo, não por número: dois números
--        somam. A origem do post (agora, agendado, recorrente, funil, reenvio, aviso ao lotar) não
--        importa.
--      - public.posts_hoje_por_grupo(tenant): wrapper para a tela, {"teto": 4, "grupos": {jid: n}}.
--        Muda a baseline.
--      - Índice parcial engine_commands_posts_dia_idx: a contagem roda a cada enfileiramento.
--
--   2. app.enqueue_broadcast: grupos que já têm 4 posts hoje ficam de fora, com o motivo.
--
--   3. app.promote_due_schedules: a oferta relâmpago ignora o grupo que ficou de fora e o agendado
--      cortado inteiro avisa o lojista.
--
-- Idempotente (create or replace, create index if not exists). A seção 1 não tem trava de md5: ela só
-- cria objetos novos. As seções 2 e 3 reescrevem corpos que já existem, e cada uma tem a sua trava.

-- 1) Contagem do dia, teto, leitura para a tela e índice.

create or replace function app.posts_por_grupo_dia()
returns integer
language sql
immutable
set search_path to 'public', 'app'
as $$ select 4 $$;

revoke all on function app.posts_por_grupo_dia() from public, anon, authenticated;
grant execute on function app.posts_por_grupo_dia() to service_role;

-- Uma linha por grupo da loja com pelo menos um post hoje. "Hoje" = desde a meia-noite de Brasília.
create or replace function app.posts_hoje_por_grupo(p_tenant uuid)
returns table (jid text, posts integer)
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select c.payload->>'jid', count(*)::int
  from public.engine_commands c
  where c.tenant_id = p_tenant
    and c.type in ('send_message', 'send_media', 'send_poll')
    and c.status in ('queued', 'processing', 'done')
    and c.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
    and c.payload->>'jid' is not null
  group by 1
$$;

revoke all on function app.posts_hoje_por_grupo(uuid) from public, anon, authenticated;
grant execute on function app.posts_hoje_por_grupo(uuid) to service_role;

-- Leitura para a tela: o teto e a contagem saem do mesmo lugar, o TypeScript não recalcula nada.
create or replace function public.posts_hoje_por_grupo(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select jsonb_build_object(
    'teto', app.posts_por_grupo_dia(),
    'grupos', coalesce(jsonb_object_agg(g.jid, g.posts), '{}'::jsonb)
  )
  from app.posts_hoje_por_grupo(p_tenant) g
$$;

revoke all on function public.posts_hoje_por_grupo(uuid) from public, anon, authenticated;
grant execute on function public.posts_hoje_por_grupo(uuid) to service_role;

-- A contagem filtra por loja e por data de criação, só nos comandos de envio.
create index if not exists engine_commands_posts_dia_idx
  on public.engine_commands (tenant_id, created_at)
  where type in ('send_message', 'send_media', 'send_poll');

-- 2) app.enqueue_broadcast: grupos que já têm o teto de posts hoje ficam de fora, com o motivo.
--
-- É a única porta de entrada dos envios (postar agora, agendado e recorrente, etapa de funil, aviso
-- ao lotar), então a regra roda aqui e só aqui. O corpo é o de 20261015120000 com quatro trocas:
--
--   1. declare: v_teto (app.posts_por_grupo_dia()), cheios (grupos já no teto) e saindo (comandos
--      que vão de fato para a fila).
--   2. Depois do retorno antecipado de "nenhum grupo de destino": advisory lock por loja e, só então,
--      a contagem do dia (app.posts_hoje_por_grupo) dos grupos deste post. Sem o lock, dois posts da
--      mesma loja enfileirados juntos leriam o mesmo "3" e o grupo iria a 5 (molde de
--      avaliar_disjuntor_saidas).
--   3. No insert dos comandos: o grupo cheio ganha, na mesma rodada, o comando já canceled com
--      payload.foraDoTeto = true e error = "Não enviado: ... Volta à meia-noite." (mesma dedupe_key,
--      mesmo número, mesma origem). canceled não conta no teto, não é pego pelo claim, não entra no
--      orçamento de @todos (exige claimed_at) e não é tocado pelo disjuntor nem pela tolerância (só
--      mexem em queued). Os outros grupos recebem o comando de sempre. O returning conta inserted
--      (todas as linhas, inclusive as de fora: total do post) e saindo (só as queued).
--   4. Antes do update final: se nada saiu (todos de fora), o post vira failed com run_id novo,
--      running_since = now(), total = linhas de fora, sent = 0 e error "Nenhum grupo recebeu: ...".
--      As linhas de fora ficam na rodada nova, então cada grupo mostra "limite do dia" na coluna do
--      post em vez das células de uma rodada antiga. reconcile_broadcast_progress só olha posts
--      queued/running e não reescreve esse failed. Corte parcial segue o update de sempre (queued).
--
-- Os textos levam o teto por format(..., v_teto): o 4 vive só em app.posts_por_grupo_dia().

-- Trava: o corpo abaixo é o de 20261015120000 com as quatro trocas. Se este banco tiver outro corpo
-- (correção aplicada à mão), o create or replace a apagaria em silêncio. Só passa com um dos dois
-- corpos conhecidos, pelo md5 normalizado (prosrc sem comentário de linha e com espaço reduzido a
-- um, como em 20261015120000): o de 20261015120000 ou o desta migração (reaplicar passa).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.enqueue_broadcast(uuid,uuid)');
  if v_src is null then
    raise exception 'teto_posts_por_grupo: app.enqueue_broadcast não existe neste banco (falta 20261015120000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('2aa6376d6675983311f5e6d998d89a03', '1f4dd5f929572998777a1fd9c4901398') then
    raise exception 'teto_posts_por_grupo: o corpo de app.enqueue_broadcast neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
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
  -- ponytail: o lock vale até o fim da transação de QUEM CHAMA. Os loops de várias lojas
  -- (promote_due_schedules, enviar_avisos_lotou) podem dar deadlock com um post manual simultâneo do
  -- mesmo disparo; o Postgres aborta um dos lados e o worker repete no próximo tick.
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

-- 3) app.promote_due_schedules: a oferta relâmpago ignora o grupo que ficou de fora e o agendado cortado
--    inteiro avisa o lojista.
--
-- O corpo é o de 20261017123000 com duas trocas:
--
--   1. A consulta que monta v_alvos (os grupos que receberam ESTA mensagem, de onde sai a lista de
--      grupos da oferta) ignora o comando com payload.foraDoTeto = true: esse grupo não recebeu a
--      mensagem, então a oferta não pode escutá-lo (nem segurar o índice
--      flash_offer_groups_um_aberto_uidx dele).
--   2. Logo depois do enqueue_broadcast: se o post voltou failed numa rodada NOVA (v_run_antes é o
--      run_id de antes da chamada) e essa rodada tem comando de fora, todos os grupos estavam no teto e
--      nada saiu. Insere uma notificação (type teto_posts_grupo, com href para /painel/disparos), com o
--      teto vindo de app.posts_por_grupo_dia(). Só a rodada nova conta: as outras falhas do enqueue
--      (sem número, sem grupo, sem conteúdo) não trocam o run_id, e um post que falhou por um desses
--      motivos depois de um corte de teto de outro dia ainda carrega a rodada de fora antiga.
--
-- Corte parcial não avisa. O recorrente que for cortado inteiro avisa de novo no dia seguinte em que
-- isso acontecer; o agendado único não repete (vira done).

-- Trava: o corpo abaixo é o de 20261017123000 com as duas trocas (mais a variável v_run_antes que a
-- troca 2 pede). Se este banco tiver outro corpo (correção aplicada à mão), o create or replace a
-- apagaria em silêncio. Só passa com um dos dois corpos conhecidos, pelo md5 normalizado (prosrc sem
-- comentário de linha e com espaço reduzido a um, como em 20261017123000): o de 20261017123000 (medido
-- em 17/10 nos dois bancos) ou o desta migração (reaplicar passa).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.promote_due_schedules(integer)');
  if v_src is null then
    raise exception 'teto_posts_por_grupo: app.promote_due_schedules não existe neste banco (falta 20261017123000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('c1469c7f4fec5085d694da1706023ca9', '0f48fb11381555e32bfe4748fdfe4896') then
    raise exception 'teto_posts_por_grupo: o corpo de app.promote_due_schedules neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

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
  v_sem_plano boolean;
  v_run_antes uuid;
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
    -- Loja sem plano (cancelou, inadimplente, boleto vencido) nao dispara
    -- sozinha. O recorrente fica pendente e volta se ela reassinar.
    v_sem_plano := not app.tenant_concede_plano(s.tenant_id);

    if (v_missed or v_sem_plano) and s.recurrence = 'none' and s.broadcast_id is not null then
      update public.broadcasts
      set status = 'failed',
          error = case
            when v_sem_plano then 'Não enviado: a assinatura não está ativa.'
            else 'Não enviado: perdeu o horário agendado (servidor fora do ar).'
          end,
          updated_at = now()
      where id = s.broadcast_id
        and tenant_id = s.tenant_id
        and status in ('draft', 'sent', 'failed');
    end if;

    if not v_missed and not v_sem_plano and s.broadcast_id is not null then
      -- A rodada do post antes do enqueue: so uma rodada NOVA com status failed e o corte do teto
      -- (os outros failed do enqueue nao trocam o run_id).
      select b.run_id into v_run_antes
      from public.broadcasts b
      where b.id = s.broadcast_id
        and b.tenant_id = s.tenant_id;

      v_broadcast := app.enqueue_broadcast(s.tenant_id, s.broadcast_id);
      -- Contagem inalterada de proposito: "promovido" sempre quis dizer
      -- "agendamento com broadcast que chegou na hora", nao "mensagem que saiu".
      promoted := promoted + 1;

      -- Teto de posts por grupo (20261026120000): se TODOS os grupos ja estavam no teto, o post
      -- voltou failed numa rodada nova, so com as linhas de fora (payload.foraDoTeto). O lojista nao
      -- estava olhando: avisa. Corte parcial nao avisa, o post saiu para os outros grupos.
      if v_broadcast.id is not null
         and v_broadcast.status = 'failed'
         and v_broadcast.run_id is distinct from v_run_antes
         and exists (
           select 1
           from public.engine_commands c
           where c.tenant_id = s.tenant_id
             and c.origin_kind = 'broadcast'
             and c.origin_id = s.broadcast_id
             and c.origin_run_id = v_broadcast.run_id
             and c.payload ->> 'foraDoTeto' = 'true'
         ) then
        insert into public.notifications (tenant_id, type, title, body, href)
        values (
          s.tenant_id,
          'teto_posts_grupo',
          'Post agendado não saiu',
          format(
            'O post agendado "%s" não saiu: todos os grupos já tinham %s posts hoje. O limite volta à meia-noite.',
            v_broadcast.name, app.posts_por_grupo_dia()),
          '/painel/disparos');
      end if;

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
          and c.origin_run_id = v_broadcast.run_id
          and coalesce(c.payload ->> 'foraDoTeto', '') <> 'true';

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
      set status = case
            when v_missed or v_sem_plano then 'failed'::public.schedule_status
            else 'done'::public.schedule_status
          end,
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

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;
