-- Enviar arquivo (PDF, planilha, documento) nos grupos.
--
-- O composer só oferecia foto, vídeo e áudio: o #331 tirou o "Arquivo" porque o fan-out mandava
-- documento sem nome e o worker sem mimetype: um PDF chegaria quebrado no grupo. Esta migração
-- leva o nome que o lojista subiu (broadcasts.media_name) no payload de send_media como
-- `fileName`; o worker (apps/worker/src/send-command.ts) passa nome e mimetype para a Evolution.
-- O tipo não muda aqui: broadcasts guarda 'file' e o payload segue dizendo 'image'; o worker
-- reconhece documento pela extensão do arquivo, como já fazia com áudio. Só faltava o nome.
--
-- Uma troca no corpo de app.enqueue_broadcast (o jsonb_build_object de send_media). Assinatura
-- igual, então a baseline (deploy/supabase/schema-baseline.json) não muda e o gate de drift NÃO
-- vê esta migração — conferir pelo md5 abaixo nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns).
--
-- Idempotente.

-- Trava: o corpo abaixo é o de 20261010120000 com UMA troca. Se este banco tiver outro corpo
-- (correção aplicada à mão), o create or replace a apagaria em silêncio. Só passa com um dos dois
-- corpos conhecidos, pelo md5 normalizado (prosrc sem comentário de linha e com espaço reduzido a
-- um, como em 20261010120000): o de 20261010120000 ou o desta migração (reaplicar passa).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.enqueue_broadcast(uuid,uuid)');
  if v_src is null then
    raise exception 'documento_no_disparo: app.enqueue_broadcast não existe neste banco (falta 20261010120000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^
]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('b9772d71f65ea77f132cd10f28171fb5', '2aa6376d6675983311f5e6d998d89a03') then
    raise exception 'documento_no_disparo: o corpo de app.enqueue_broadcast neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

-- Troca: 'fileName', b.media_name no payload de send_media.
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
          'caption', msg, 'mentionAll', mention, 'fileName', b.media_name)
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

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.enqueue_broadcast(uuid, uuid) from public, anon, authenticated;
grant execute on function app.enqueue_broadcast(uuid, uuid) to service_role;
