-- 09/11/2026: agendamento sem post.
--
-- `schedules.broadcast_id` e um FK com ON DELETE SET NULL (schedules_broadcast_id_fkey): apagar o post
-- deixa o agendamento pendente e sem destino, e app.promote_due_schedules o "promovia" todo dia sem fazer
-- nada, so avancando a data. Em prod, dois recorrentes diarios estavam assim (Mega stock desde 19/09, Moda
-- kids desde 10/10): a loja acreditava num post diario que nao existia. Agora o agendamento sem
-- broadcast_id e sem campaign_message_id vira failed, a loja recebe a notificacao `agendamento_sem_post`
-- e fica um log. So o corpo de app.promote_due_schedules muda (app.*: nao mexe na baseline). Conferir nos
-- DOIS bancos com infra/tests/agendamento-sem-post-check.sql. Idempotente: a trava aceita o corpo anterior
-- (20261105140000) e o desta migracao.

-- Trava: promote_due_schedules tem que ser o corpo de 20261105140000 (md5 conferido em dev e prod em
-- 09/11) ou o desta migracao.
do $$
declare
  v_prom text;
begin
  select p.prosrc into v_prom from pg_proc p where p.oid = to_regprocedure('app.promote_due_schedules(integer)');
  if v_prom is null then
    raise exception 'agendamento_sem_post: app.promote_due_schedules não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_prom, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('8c4d3ed17a613f7e803a86b8925d4c06', 'ace587089cd637d708a9aec8df1793a9') then
    raise exception 'agendamento_sem_post: o corpo de app.promote_due_schedules neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

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
    select sc.id, sc.tenant_id, sc.broadcast_id, sc.campaign_message_id, sc.name, sc.scheduled_at, sc.recurrence
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
    -- Agendamento sem post (20261109120000): schedules.broadcast_id e um FK com ON DELETE SET NULL, entao
    -- apagar o post deixa o agendamento pendente e sem destino. Antes, a rodada nao fazia nada e so
    -- avancava a data, todo dia, em silencio: a loja acreditava num post diario que nao existia (dois
    -- recorrentes em prod, 2026-11). Encerra, avisa a loja e registra; o recorrente nao volta sozinho.
    if s.broadcast_id is null and s.campaign_message_id is null then
      update public.schedules
      set status = 'failed'::public.schedule_status, last_run_at = now(), updated_at = now()
      where id = s.id;
      insert into public.notifications (tenant_id, type, title, body, href)
      values (
        s.tenant_id,
        'agendamento_sem_post',
        'Agendamento encerrado: o post foi apagado',
        format('O agendamento "%s" (%s) não tem mais post para enviar, porque o post foi apagado. Ele foi encerrado e não vai mais sair. Para voltar a postar nesse horário, agende de novo a partir de um post.',
               s.name,
               case s.recurrence::text when 'daily' then 'diário' when 'weekly' then 'semanal' else 'único' end),
        '/painel/disparos');
      insert into public.logs (tenant_id, level, event, message, metadata)
      values (
        s.tenant_id, 'warn', 'agendamento_sem_post',
        format('Agendamento "%s" encerrado: o post vinculado foi apagado', s.name),
        jsonb_build_object('schedule_id', s.id, 'recurrence', s.recurrence, 'scheduled_at', s.scheduled_at));
      continue;
    end if;
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
