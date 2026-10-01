-- 2026-09-30 - agendamento que perdeu a hora nao dispara atrasado.
--
-- Incidente: a VPS ficou fora do ar de 28/09 a 30/09 e, ao voltar, mensagens
-- agendadas sairam todas de uma vez, fora de hora. Para cliente isso e oferta
-- no grupo na hora errada. Regra nova, nos dois pontos onde o atraso entra:
--   1. promote_due_schedules: agendamento vencido ha mais que a tolerancia nao
--      enfileira. Unico vira 'failed' (e a oferta ligada mostra o motivo);
--      recorrente so avanca para a proxima data.
--   2. claim_send_commands: comando de envio parado na fila alem da tolerancia,
--      num numero sem envio nesse intervalo, vira 'canceled'.
-- Corpos copiados de prod (pg_get_functiondef) em 30/09; so os trechos novos mudaram.

create or replace function app.missed_send_tolerance()
 returns interval
 language sql
 immutable
 set search_path to 'public', 'app'
as $function$
  select interval '15 minutes';
$function$;

revoke all on function app.missed_send_tolerance() from public, anon, authenticated;
grant execute on function app.missed_send_tolerance() to service_role;

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
  v_group_ids text[];
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
        select b.group_ids into v_group_ids
        from public.broadcasts b
        where b.id = s.broadcast_id
          and b.tenant_id = s.tenant_id;

        -- Mesmo predicado de grupo que app.enqueue_broadcast usa para montar os
        -- destinos: so grupo em que o numero e admin, e group_ids vazio quer
        -- dizer "todos". Copiado de proposito -- se a oferta escutasse um
        -- conjunto diferente do que recebeu a mensagem, group_ids vazio abriria
        -- uma oferta com zero grupos e nenhum comentario entraria na fila.
        select coalesce(array_agg(g.whatsapp_group_id), '{}') into v_alvos
        from public.groups g
        where g.tenant_id = s.tenant_id
          and g.is_admin
          and (
            coalesce(array_length(v_group_ids, 1), 0) = 0
            or g.whatsapp_group_id = any(v_group_ids)
          );

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
$function$;

CREATE OR REPLACE FUNCTION app.claim_send_commands(max_commands integer DEFAULT 5, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS SETOF engine_commands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  -- Envio parado na fila alem da tolerancia, num numero que nao mandou nada
  -- nesse intervalo (worker/VPS fora do ar, numero desconectado), e cancelado
  -- em vez de sair atrasado. Fila andando sob os caps do anti-ban nao expira:
  -- ha envio recente no numero. reconcile_broadcast_progress fecha a oferta.
  update public.engine_commands c
  set status = 'canceled',
      error = 'Não enviado: ficou parado na fila além do horário (servidor fora do ar).',
      lease_expires_at = null,
      updated_at = now()
  where c.status = 'queued'
    and (p_tenant is null or c.tenant_id = p_tenant)
    and c.type in ('send_message', 'send_media', 'send_poll')
    and c.instance_id is not null
    and c.available_at < now() - app.missed_send_tolerance()
    and not exists (
      select 1 from public.instance_sends x
      where x.instance_id = c.instance_id
        and x.sent_at > now() - app.missed_send_tolerance()
    );

  return query
  update public.engine_commands c
  set
    status = 'processing',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now()
  where c.id in (
    select cand.id
    from public.engine_commands cand
    cross join lateral app.instance_caps(cand.instance_id) caps
    where cand.status = 'queued'
      and (p_tenant is null or cand.tenant_id = p_tenant)
      and cand.type in ('send_message', 'send_media', 'send_poll')
      and cand.available_at <= now()
      and cand.instance_id is not null
      and not exists (
        select 1 from public.instance_send_state s
        where s.instance_id = cand.instance_id
          and s.paused_until is not null
          and s.paused_until > now()
      )
      and coalesce(
        (select s.next_send_allowed_at from public.instance_send_state s where s.instance_id = cand.instance_id),
        now()
      ) <= now()
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 minute') < caps.per_min
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 hour') < caps.per_hour
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 day') < caps.per_day
      and cand.id = (
        select best.id
        from public.engine_commands best
        where best.status = 'queued'
          and (p_tenant is null or best.tenant_id = p_tenant)
          and best.type in ('send_message', 'send_media', 'send_poll')
          and best.available_at <= now()
          and best.instance_id = cand.instance_id
        order by best.priority asc, best.created_at asc, best.id asc
        limit 1
      )
    order by cand.priority asc, cand.created_at asc, cand.id asc
    limit greatest(max_commands, 1)
    for update of cand skip locked
  )
  returning c.*;
end;
$function$;

revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;
revoke all on function app.claim_send_commands(integer, uuid) from public, anon, authenticated;
grant execute on function app.claim_send_commands(integer, uuid) to service_role;
