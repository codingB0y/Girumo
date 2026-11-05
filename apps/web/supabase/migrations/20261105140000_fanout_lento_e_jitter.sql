-- 2026-11-05 - Fan-out lento e irregular, e agendamento sem horário cravado.
--
-- Por quê: a loja piloto teve o número derrubado pelo WhatsApp três vezes em 13 dias (23/10, 03/11 e
-- 05/11/2026) com volume dentro dos tetos. Dois sinais de robô sobraram depois do teto por grupo
-- (20261105120000) e da convalescença (20261105130000): o post para 35 grupos saía em ~3 min (gap de
-- 3 a 7 s entre mensagens, 288 envios em 23/10 com pico de 101/h) e os agendados saíam no segundo zero
-- (10:00:00, 11:00:00, 12:00:00), em lotes de 8 a 26 de uma vez. Um admin humano postando em 35 grupos
-- leva de 20 s a 1 min por grupo e nunca acerta o segundo zero. O número do Igor, que nunca caiu, posta
-- num grupo só — não tem fan-out nenhum.
--
-- O que muda (tudo em app.*, a baseline de drift não muda):
--
--   1. app.lote_minimo(): 10. A partir de quantas mensagens em curso o número está "em lote".
--   2. app.record_send: o lote em curso = envios dos últimos 15 min + comandos de envio queued/processing
--      do número (o comando que acabou de sair ainda está processing: record_send roda antes do
--      complete). Em lote, a próxima mensagem só é liberada em 20 a 60 s (uniforme); fora de lote, 3 a
--      7 s como antes. Um post de 35 grupos passa a levar ~23 min em vez de ~3; os tetos por minuto,
--      hora e dia continuam valendo por cima.
--   3. app.atraso_do_agendamento(id, scheduled_at): 0 a 7 min, determinístico por ocorrência (hash do id
--      + horário): o mesmo atraso em todas as rodadas do housekeeping (a cada 30 s), e diferente de um
--      dia para o outro no recorrente. app.promote_due_schedules só promove quando
--      scheduled_at + atraso <= now(). "Perdeu a hora" continua contado do scheduled_at (15 min): o
--      atraso consome parte da folga, nunca passa dela.
--
-- Efeitos aceitos: "Postando agora" e o ETA da campanha mostram ~45 s por mensagem em lote (6 s fora
-- dele); o agendado das 10:00 sai entre 10:00 e 10:07. Conferir nos DOIS bancos com
-- infra/tests/fanout-lento-e-jitter-check.sql. Idempotente: cada trava aceita o corpo anterior e o
-- desta migração.

-- Travas: record_send tem que ser o corpo de 20260904100000 e promote_due_schedules o de 20261026120000
-- (md5 conferidos em dev e prod em 05/11), ou os desta migração.
do $$
declare
  v_send text;
  v_prom text;
begin
  select p.prosrc into v_send from pg_proc p where p.oid = to_regprocedure('app.record_send(uuid,uuid)');
  select p.prosrc into v_prom from pg_proc p where p.oid = to_regprocedure('app.promote_due_schedules(integer)');
  if v_send is null or v_prom is null then
    raise exception 'fanout_lento: app.record_send ou app.promote_due_schedules não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_send, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('f964b6ae35f57d1daff363c083fbb761', 'd3cf06ff734ad93b31d8f2df9eae0376') then
    raise exception 'fanout_lento: o corpo de app.record_send neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_prom, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('4127cefa0ac99b2ecddddd416a62cdfc', '8c4d3ed17a613f7e803a86b8925d4c06') then
    raise exception 'fanout_lento: o corpo de app.promote_due_schedules neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

-- 1) A partir de quantas mensagens em curso o número está em lote. Mesmo molde de posts_por_grupo_dia.
create or replace function app.lote_minimo()
returns integer
language sql
immutable
set search_path to 'public', 'app'
as $$ select 10 $$;

revoke all on function app.lote_minimo() from public, anon, authenticated;
grant execute on function app.lote_minimo() to service_role;

-- 2) Corpo de 20260904100000 com uma troca: o intervalo até o próximo envio depende do lote em curso.
CREATE OR REPLACE FUNCTION app.record_send(target_instance_id uuid, target_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  v_lote integer;
  v_gap  double precision;
begin
  -- Lote em curso deste numero: o que saiu nos ultimos 15 min mais o que esta na fila ou em voo
  -- (o comando que acabou de sair ainda esta processing: record_send roda antes do complete). Em
  -- lote, 20 a 60 s ate a proxima mensagem, uniforme: o ritmo de um admin postando grupo a grupo.
  -- Fora de lote, 3 a 7 s (triangular), como antes.
  select (select count(*) from public.instance_sends x
           where x.instance_id = target_instance_id
             and x.sent_at > now() - interval '15 minutes')
       + (select count(*) from public.engine_commands c
           where c.instance_id = target_instance_id
             and c.status in ('queued', 'processing')
             and c.type in ('send_message', 'send_media', 'send_poll'))
    into v_lote;
  if v_lote >= app.lote_minimo() then
    v_gap := 20 + random() * 40;
  else
    v_gap := 3 + ((random() + random()) / 2) * 4;
  end if;

  insert into public.instance_send_state (
    instance_id, tenant_id, warmup_started_at, last_active_at, next_send_allowed_at
  )
  values (
    target_instance_id, target_tenant_id, now(), now(),
    now() + make_interval(secs => v_gap)
  )
  on conflict (instance_id) do update set
    warmup_started_at = case
      when not instance_send_state.warmup_graduated
        and now() - instance_send_state.last_active_at >= interval '14 days'
      then now()
      else instance_send_state.warmup_started_at
    end,
    warmup_graduated = case
      when not instance_send_state.warmup_graduated
        and now() - instance_send_state.last_active_at >= interval '14 days'
      then false
      when floor(extract(epoch from now() - instance_send_state.warmup_started_at) / 86400) >= 7
      then true
      else instance_send_state.warmup_graduated
    end,
    last_active_at = now(),
    consecutive_failures = 0,
    paused_until = null,
    next_send_allowed_at = now() + make_interval(secs => v_gap),
    updated_at = now();

  insert into public.instance_sends (instance_id) values (target_instance_id);
end;
$function$;

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.record_send(uuid, uuid) from public, anon, authenticated;
grant execute on function app.record_send(uuid, uuid) to service_role;

-- 3) Atraso de 0 a 7 min por ocorrência do agendamento. Determinístico (hash do id + epoch do horário,
--    independente do fuso da sessão): o housekeeping roda a cada 30 s e precisa ver sempre o mesmo
--    atraso; o recorrente muda de atraso a cada dia porque o horário muda. `& 2147483647` evita o abs()
--    de um bigint negativo extremo.
create or replace function app.atraso_do_agendamento(p_id uuid, p_quando timestamptz)
returns interval
language sql
immutable
set search_path to 'public', 'app'
as $$
  select make_interval(secs => mod(hashtextextended(p_id::text || '|' || extract(epoch from p_quando)::bigint::text, 0) & 2147483647, 421))
$$;

revoke all on function app.atraso_do_agendamento(uuid, timestamptz) from public, anon, authenticated;
grant execute on function app.atraso_do_agendamento(uuid, timestamptz) to service_role;

-- 4) Corpo de 20261026120000 com uma troca: o cursor só pega agendamento cujo horário + atraso já passou.
--    scheduled_at <= now() fica por cima para o schedules_due_idx continuar servindo.
CREATE OR REPLACE FUNCTION app.promote_due_schedules(max_schedules integer DEFAULT 50)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
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
      -- Horario cravado (10:00:00) e assinatura de robo: cada ocorrencia espera mais 0 a 7 min,
      -- o mesmo atraso em todas as rodadas do housekeeping e diferente de um dia para o outro no
      -- recorrente. "Perdeu a hora" segue contado do scheduled_at: o atraso so gasta parte da folga.
      and sc.scheduled_at + app.atraso_do_agendamento(sc.id, sc.scheduled_at) <= now()
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
            'O post agendado "%s" não saiu: todos os grupos já tinham recebido %s posts hoje. O limite volta à meia-noite.',
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
$function$;

revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;
