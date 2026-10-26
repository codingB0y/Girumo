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
-- Idempotente (create or replace, create index if not exists). Sem trava de md5 nesta seção: ela só
-- cria objetos novos.

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
