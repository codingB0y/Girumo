-- Funil de disparos (spec docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md)
--
-- Tres colunas de rastreio e um comportamento novo na promocao de agendamentos:
-- quando o broadcast promovido tem uma Oferta Relampago em rascunho ligada a ele,
-- a oferta abre no mesmo instante, na mesma transacao. E o que faz a etapa
-- "manda EU QUERO" do funil funcionar sem ninguem clicar em Abrir as 06:00.
--
-- Tudo numa transacao so: este arquivo e colado a mao nos DOIS bancos, e um
-- apply parcial (colunas sim, funcoes nao) deixaria o motor pela metade e o
-- gate de drift vermelho para todo mundo.

begin;

alter table public.broadcasts
  add column if not exists funnel_template_id text,
  add column if not exists funnel_run_id uuid;

comment on column public.broadcasts.funnel_template_id is
  'Roteiro do funil que gerou este broadcast (id de FUNNEL_TEMPLATES). Null fora do funil.';
comment on column public.broadcasts.funnel_run_id is
  'Agrupa as N mensagens de uma mesma confirmacao de funil. Gerado no cliente.';

create index if not exists broadcasts_funnel_run_idx
  on public.broadcasts (tenant_id, funnel_run_id)
  where funnel_run_id is not null;

alter table public.flash_offers
  add column if not exists broadcast_id uuid references public.broadcasts(id) on delete set null;

comment on column public.flash_offers.broadcast_id is
  'Oferta criada por uma etapa relampago do funil: abre quando este broadcast e promovido.';

create unique index if not exists flash_offers_broadcast_uidx
  on public.flash_offers (broadcast_id)
  where broadcast_id is not null;

-- {nicho} da copy do funil (spec 4.3). {loja} e organizations.name, que ja existe.
alter table public.organizations
  add column if not exists niche text;

comment on column public.organizations.niche is
  'Nicho da loja em texto livre ("moda feminina"), usado na copy do funil de disparos.';

-- app.lid_map_from_history roda uma vez por grupo DENTRO do loop de
-- promote_due_schedules, que segura os schedules com "for update skip locked".
-- Sem este indice a consulta e Seq Scan: ~49 ms por grupo medidos em prod
-- (33 mil linhas), ~1,3 s no maior broadcast de prod (26 grupos), e cresce com
-- a tabela. Os indices que ja existiam sao (id), (event_id) e (status, created_at),
-- nenhum serve para o filtro tenant_id + type + created_at.
create index if not exists engine_events_tenant_type_idx
  on public.engine_events (tenant_id, type, created_at desc);

-- Porte SQL de lidMapFromHistory (apps/web/src/lib/stores/flash-offers.ts):
-- ultimos 90 dias de group-participants.update do grupo, o registro mais
-- recente de cada @lid vence, telefone normalizado para digitos (8 a 15).
-- O phoneNumber chega como JID completo ("5511999998888@s.whatsapp.net"), e a
-- normalizacao repete telefoneValido() de apps/web/src/lib/relampago/lid-map.ts:
-- tira tudo que nao e digito da string inteira e exige 8 a 15 digitos.
create or replace function app.lid_map_from_history(p_tenant_id uuid, p_whatsapp_group_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  with eventos as (
    select e.payload, e.created_at
    from public.engine_events e
    where e.tenant_id = p_tenant_id
      and e.type = 'group-participants.update'
      and e.created_at >= now() - interval '90 days'
      and e.payload #>> '{data,id}' = p_whatsapp_group_id
    order by e.created_at desc
    limit 500
  ),
  participantes as (
    select distinct on (p->>'id')
      p->>'id' as jid,
      regexp_replace(p->>'phoneNumber', '\D', '', 'g') as fone
    from eventos ev
    cross join lateral jsonb_array_elements(coalesce(ev.payload #> '{data,participants}', '[]'::jsonb)) p
    where p->>'id' is not null
      and p->>'phoneNumber' is not null
    order by p->>'id', ev.created_at desc
  )
  select coalesce(jsonb_object_agg(jid, fone), '{}'::jsonb)
  from participantes
  where fone ~ '^\d{8,15}$';
$$;

revoke all on function app.lid_map_from_history(uuid, text) from public, anon, authenticated;
grant execute on function app.lid_map_from_history(uuid, text) to service_role;

-- Mesma funcao de 20260730100000_dispatch_fanout.sql, mais o bloco "Funil".
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

        update public.flash_offers
        set status = 'open', opened_at = now(), updated_at = now()
        where id = v_offer_id
          and tenant_id = s.tenant_id;

        -- Mesmo predicado de grupo que app.enqueue_broadcast usa para montar os
        -- destinos: so grupo em que o numero e admin, e group_ids vazio quer
        -- dizer "todos". Copiado de proposito -- se a oferta escutasse um
        -- conjunto diferente do que recebeu a mensagem, group_ids vazio abriria
        -- uma oferta com zero grupos e nenhum comentario entraria na fila.
        --
        -- Grupo que ja tem outra oferta aberta e pulado (indice parcial
        -- flash_offer_groups_um_aberto_uidx). A mensagem sai mesmo assim.
        insert into public.flash_offer_groups
          (tenant_id, offer_id, group_id, whatsapp_group_id, opened_at, lid_map)
        select g.tenant_id, v_offer_id, g.id, g.whatsapp_group_id, now(),
               app.lid_map_from_history(g.tenant_id, g.whatsapp_group_id)
        from public.groups g
        where g.tenant_id = s.tenant_id
          and g.is_admin
          and (
            coalesce(array_length(v_group_ids, 1), 0) = 0
            or g.whatsapp_group_id = any(v_group_ids)
          )
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

revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;

commit;
