-- Funil: a oferta relampago nova substitui a de funil anterior nos mesmos grupos.
--
-- Oferta so fecha na mao (timer_seconds e o prazo da reserva de CADA cliente,
-- nao da oferta). Sem isto, a Grade do dia repetida (PR #313) e o "Abriu ·
-- dia 2" do Evento de 2 dias batiam no indice flash_offer_groups_um_aberto_uidx
-- quando a lojista nao fechava a oferta do dia anterior: a oferta nova abria
-- com ZERO grupos, a mensagem "manda EU QUERO" saia e nenhum pedido entrava na
-- fila -- sem sinal nenhum na tela.
--
-- Regra: ao abrir uma oferta de funil, fecha antes as ofertas de FUNIL
-- (broadcast_id nao nulo) ainda abertas que seguram algum dos grupos-alvo,
-- do mesmo jeito que o botao Fechar (closeOffer): a oferta inteira e todos os
-- grupos dela. Oferta criada a mao (broadcast_id nulo) nao e tocada; nesse
-- caso o grupo continua pulado, como o spec ja previa.
--
-- Mesma funcao de 20260919120000_funnel_dispatch.sql; muda so o bloco "Funil".
-- Conferido antes de escrever: definicao identica nos dois bancos
-- (md5 42cb73a92472a15741558d0787ad5abb) e ACL {postgres, service_role}.

begin;

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
  v_group_ids text[];
  v_alvos text[];
  v_anteriores uuid[];
  v_broadcast public.broadcasts;
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
    if s.broadcast_id is not null then
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
      set status = 'done', last_run_at = now(), updated_at = now()
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

-- create or replace ja nasceu com ACL errado em dev (memoria de 09/2026):
-- reafirma o que os dois bancos tinham antes.
revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;

commit;
