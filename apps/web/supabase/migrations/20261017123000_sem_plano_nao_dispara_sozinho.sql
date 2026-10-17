-- Loja sem plano não dispara sozinha (auditoria 16/10/2026, C17).
--
-- Cancelar a assinatura ou ficar inadimplente não parava o agendamento recorrente: o worker chama
-- app.promote_due_schedules a cada tick, ela pegava todo schedule vencido sem olhar plano e
-- chamava app.enqueue_broadcast — que também não olha. O recorrente avançava um dia e voltava no
-- seguinte, para sempre. O plano só era cobrado na rota que CRIA o envio (assertPlanLimit).
--
-- 1. app.tenant_concede_plano(p_tenant): o espelho SQL de subscriptionAccess(...).grantsPlan
--    (apps/web/src/lib/billing/subscription-access.ts). Mesma regra, inclusive concessão manual
--    (gravada como 'active'), teste grátis ('trialing'), cancelado no portal ainda no período
--    ('active' + cancel_at_period_end: concede) e boleto emitido ('unpaid' + stripe_status
--    'incomplete' até current_period_end). O espelho é travado por
--    apps/web/src/lib/billing/subscription-access-espelho.test.ts: mudar a regra de um lado só
--    reprova o teste.
-- 2. app.promote_due_schedules: loja sem plano é tratada como "perdeu a hora" — não chama o
--    enqueue. O único vira 'failed' (e o disparo, 'failed' com o motivo); o recorrente só avança
--    a data e segue 'pending', então volta sozinho se a loja reassinar. Não chamar o enqueue é de
--    propósito: ele marcaria o disparo 'failed' todo dia, e o cron de e-mail de "disparo falho"
--    escreveria todo dia para o ex-cliente.
--
-- O auto-grow (api/groups/grow/pending) faz a mesma pergunta pelo TS (tenantGrantsPlan).
--
-- Só schema app e corpo de função: a baseline (deploy/supabase/schema-baseline.json) não muda e o
-- gate de drift NÃO vê esta migração — conferir pelo md5 abaixo nos DOIS bancos (dev
-- wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).
--
-- Idempotente.

-- Trava: o corpo de app.promote_due_schedules abaixo é o de 20261010120000 com UMA troca. Se este
-- banco tiver outro corpo (correção aplicada à mão), o create or replace a apagaria em silêncio. Só
-- passa com um dos dois corpos conhecidos, pelo md5 normalizado (prosrc sem comentário de linha e
-- com espaço reduzido a um, como em 20261010120000): o de 20261010120000 (medido em 17/10 nos dois
-- bancos) ou o desta migração (reaplicar passa).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.promote_due_schedules(integer)');
  if v_src is null then
    raise exception 'sem_plano_nao_dispara_sozinho: app.promote_due_schedules não existe neste banco (falta 20261010120000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('57085f55acdffe5841b9e48a13683a2e', 'c1469c7f4fec5085d694da1706023ca9') then
    raise exception 'sem_plano_nao_dispara_sozinho: o corpo de app.promote_due_schedules neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

-- 1) A regra de subscriptionAccess(...).grantsPlan. `subscriptions` tem unique(tenant_id): sem
--    linha = sem plano. `status` é enum (sem o trim do TS). A ordem dos ramos do TS não importa
--    aqui: todos que concedem entram no `or`.
create or replace function app.tenant_concede_plano(p_tenant uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.tenant_id = p_tenant
      and (
        s.status in ('active', 'trialing', 'free')
        or (
          s.status = 'unpaid'
          and s.metadata ->> 'stripe_status' in ('incomplete')
          and s.current_period_end > now()
        )
      )
  );
$$;

-- 2) Troca: v_sem_plano entra junto do v_missed (falha o único com motivo próprio, não enfileira,
--    o recorrente só avança).
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
          and c.origin_run_id = v_broadcast.run_id;

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

-- 3) Privilégio. create or replace não preserva ACL de forma confiável (20260904100000), e função
--    de app nasce com EXECUTE para PUBLIC. Quem chama tenant_concede_plano é promote_due_schedules
--    (definer, dono postgres).
revoke all on function app.tenant_concede_plano(uuid) from public, anon, authenticated;
grant execute on function app.tenant_concede_plano(uuid) to service_role;
revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;
