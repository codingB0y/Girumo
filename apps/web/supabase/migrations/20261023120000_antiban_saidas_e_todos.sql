-- 2026-10-23 - Anti-ban lê a reação da base: disjuntor por saídas e orçamento de @todos.
--
-- Incidente de 23/10/2026 (prod, Moda kids do Sul): o WhatsApp restringiu o número por 24 h
-- (connection.update close 401 às 13:25 BRT, "atividade pode caracterizar spam"). O volume ficou
-- DENTRO dos tetos (288 envios, pico 101/h, teto 114/h e 570/dia) e já tinha passado igual em
-- 09/10, 13/10 e 15/10. O que mudou: 7 de 8 posts com @todos (mentionsEveryOne notifica cada
-- membro, até em grupo silenciado) e saídas voluntárias coladas nos posts: 36, 26 e 18 nas três
-- horas seguintes, contra 0-7 de base. A tela de sair do grupo oferece "Sair e denunciar".
--
-- Duas travas novas, as duas no banco, ao lado dos tetos que já existem:
--
--   1. Disjuntor por saídas. public.avaliar_disjuntor_saidas(tenant) é chamado pelo webhook a cada
--      saída voluntária (author = participante) de grupo onde a loja é admin. Se as saídas das
--      últimas 3 h passarem do limite (1% dos membros, mínimo 30) e a loja enviou nesse intervalo,
--      os envios da loja param por 6 h: a fila é cancelada na hora, com o motivo, e o lojista
--      recebe uma notificação. Calibração (prod, 30 dias, Moda kids): 3 h máx. 85 em 13/10 e 80 em
--      23/10; demais dias <= 64. Com 5,6 mil membros o limite é 57: dispararia em 13/10 e às 11h de
--      23/10, duas horas antes da restrição. Um incidente só não calibra nada fino; o limite é
--      deliberadamente o ponto em que a base está claramente reagindo.
--      Não usa paused_until de propósito: send_hold_ended_at trata essa pausa como retenção e a fila
--      sairia toda junta quando ela acabasse. Com o disjuntor fora da retenção, o que for agendado
--      durante a pausa é cancelado pela tolerância de 15 min, com o motivo do disjuntor.
--
--   2. Orçamento de @todos. No claim, um post com mentionAll sai SEM a marcação se o número já
--      marcou todos em app.mention_all_daily_budget() posts diferentes nas últimas 24 h. O post não
--      é bloqueado. Um post que começou marcando segue marcando em todos os grupos, e um que foi
--      cortado segue cortado: a decisão é por post, não por grupo. Post = (origin_id, origin_run_id):
--      o origin_id é o id do broadcasts e se repete no agendamento recorrente e no reenvio; o run
--      muda a cada enfileiramento (100% dos mentionAll de prod têm run em 23/10). O comando cortado
--      leva mentionAllCortado = true no payload. Comando sem origin_id (não existe em prod) conta
--      como um post sozinho.
--
-- Muda o corpo de app.claim_send_commands (assinatura igual). Cria app.exit_breaker,
-- app.mention_all_daily_budget, app.exit_breaker_limit e public.avaliar_disjuntor_saidas (este
-- último muda a baseline). Idempotente.

-- Trava: o corpo atual tem que ser o de 20261017120000 (md5 conferido em prod em 23/10) ou o desta
-- migração (reaplicar passa). Normalização igual à de 20261017120000.
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.claim_send_commands(integer,uuid)');
  if v_src is null then
    raise exception 'antiban_saidas: app.claim_send_commands não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('531a0fd5414fe8bbec857ceb771f2505', 'e129ff5b504e8e86122f5fdf53bb1955') then
    raise exception 'antiban_saidas: o corpo de app.claim_send_commands neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

-- Uma linha por loja. until no futuro = disjuntor aberto.
create table if not exists app.exit_breaker (
  tenant_id  uuid primary key references public.organizations(id) on delete cascade,
  tripped_at timestamptz not null,
  until      timestamptz not null,
  saidas     integer not null,
  limite     integer not null
);
-- Defesa em profundidade: sem policy, só o service_role (que ignora RLS) lê e escreve.
alter table app.exit_breaker enable row level security;
revoke all on table app.exit_breaker from public, anon, authenticated;
grant select, insert, update, delete on table app.exit_breaker to service_role;

create or replace function app.mention_all_daily_budget()
returns integer
language sql
immutable
set search_path to 'public', 'app'
as $$ select 2 $$;

revoke all on function app.mention_all_daily_budget() from public, anon, authenticated;
grant execute on function app.mention_all_daily_budget() to service_role;

-- Saídas em 3 h que abrem o disjuntor: 1% dos membros dos grupos que a loja administra com gente
-- de verdade (mesma evidência de app.instance_caps), nunca menos de 30.
create or replace function app.exit_breaker_limit(p_tenant uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select greatest(30, ceil(coalesce(sum(g.members), 0) * 0.01)::int)
  from public.groups g
  where g.tenant_id = p_tenant and g.is_admin and g.members >= 10
$$;

revoke all on function app.exit_breaker_limit(uuid) from public, anon, authenticated;
grant execute on function app.exit_breaker_limit(uuid) to service_role;

-- Partial index do orçamento: o claim conta posts com @todos do número nas últimas 24 h.
create index if not exists engine_commands_mention_all_idx
  on public.engine_commands (instance_id, claimed_at)
  where payload->>'mentionAll' = 'true';

create or replace function public.avaliar_disjuntor_saidas(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_until    timestamptz;
  v_saidas   integer;
  v_limite   integer;
  v_cancel   integer;
begin
  -- Uma avaliação por loja de cada vez: dois números no mesmo grupo recebem a mesma saída e
  -- chamariam isto em paralelo, abrindo (e notificando) duas vezes.
  perform pg_advisory_xact_lock(hashtextextended('exit_breaker:' || p_tenant::text, 0));

  select b.until into v_until from app.exit_breaker b where b.tenant_id = p_tenant;
  if v_until > now() then
    return jsonb_build_object('aberto', true, 'novo', false, 'ate', v_until);
  end if;

  -- Sem envio nas últimas 3 h não há o que pausar (e a saída não veio de post nosso).
  if not exists (
    select 1 from public.instance_sends x
    join public.instances i on i.id = x.instance_id
    where i.tenant_id = p_tenant and x.sent_at > now() - interval '3 hours'
  ) then
    return jsonb_build_object('aberto', false, 'motivo', 'sem_envio');
  end if;

  -- Saída voluntária = o autor do remove é o próprio participante (remoção por admin, incluindo
  -- o "remover duplicados", fica de fora). Só grupos que a loja administra. Pessoa contada uma vez
  -- por grupo (dois números da loja recebem o mesmo aviso).
  select count(*) into v_saidas
  from (
    select distinct e.payload #>> '{data,id}', p ->> 'id'
    from public.engine_events e
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(e.payload #> '{data,participants}') = 'array'
           then e.payload #> '{data,participants}' else '[]'::jsonb end) p
    where e.tenant_id = p_tenant
      and e.type = 'group-participants.update'
      and e.created_at > now() - interval '3 hours'
      and e.payload #>> '{data,action}' = 'remove'
      and p ->> 'id' = e.payload #>> '{data,author}'
      and exists (
        select 1 from public.groups g
        where g.tenant_id = p_tenant and g.is_admin
          and g.whatsapp_group_id = e.payload #>> '{data,id}'
      )
  ) s;

  v_limite := app.exit_breaker_limit(p_tenant);
  if v_saidas < v_limite then
    return jsonb_build_object('aberto', false, 'saidas', v_saidas, 'limite', v_limite);
  end if;

  v_until := now() + interval '6 hours';
  insert into app.exit_breaker (tenant_id, tripped_at, until, saidas, limite)
  values (p_tenant, now(), v_until, v_saidas, v_limite)
  on conflict (tenant_id) do update
    set tripped_at = excluded.tripped_at, until = excluded.until,
        saidas = excluded.saidas, limite = excluded.limite;

  -- O que já está na fila não sai: reconcile_broadcast_progress fecha a oferta com este motivo.
  update public.engine_commands c
  set status = 'canceled',
      error = 'Não enviado: o anti-ban pausou os posts porque muita gente saiu dos grupos logo depois dos últimos posts.',
      lease_expires_at = null,
      updated_at = now()
  where c.tenant_id = p_tenant
    and c.status = 'queued'
    and c.type in ('send_message', 'send_media', 'send_poll');
  get diagnostics v_cancel = row_count;

  insert into public.notifications (tenant_id, type, title, body, href)
  values (
    p_tenant,
    'antiban_saidas',
    'Posts pausados por 6 horas',
    format('%s pessoas saíram dos grupos nas últimas 3 horas, logo depois dos posts. Isso é o sinal que o WhatsApp usa para restringir o número, então pausamos os envios até %s. Evite marcar todos e espace os posts.',
           v_saidas, to_char(v_until at time zone 'America/Sao_Paulo', 'HH24:MI')),
    '/painel/conectar'
  );

  return jsonb_build_object('aberto', true, 'novo', true, 'ate', v_until,
                            'saidas', v_saidas, 'limite', v_limite, 'cancelados', v_cancel);
end;
$$;

revoke all on function public.avaliar_disjuntor_saidas(uuid) from public, anon, authenticated;
grant execute on function public.avaliar_disjuntor_saidas(uuid) to service_role;

-- Corpo de 20261017120000 com três trocas: (1) o cancelamento por tolerância diz o motivo quando o
-- disjuntor está aberto; (2) o claim não pega comando de loja com o disjuntor aberto; (3) o claim
-- corta o mentionAll acima do orçamento.
CREATE OR REPLACE FUNCTION app.claim_send_commands(max_commands integer DEFAULT 5, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS SETOF engine_commands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  -- Envio parado na fila alem da tolerancia, num numero que nao mandou nada
  -- nesse intervalo sem o anti-ban segurando (worker/VPS fora do ar, numero
  -- desconectado), e cancelado em vez de sair atrasado. A tolerancia conta do
  -- fim da retencao (app.send_hold_ended_at): fila parada pelo teto da hora ou
  -- pela pausa de 429 espera o gate abrir e sai (incidente de 09/10/2026).
  -- O disjuntor de saidas NAO e retencao: o que chega durante ele e cancelado.
  -- reconcile_broadcast_progress fecha a oferta.
  update public.engine_commands c
  set status = 'canceled',
      error = case
        when exists (select 1 from app.exit_breaker b
                     where b.tenant_id = c.tenant_id and b.until > now())
          then 'Não enviado: o anti-ban pausou os posts porque muita gente saiu dos grupos logo depois dos últimos posts.'
        -- Teto do dia nao entra na retencao (sairia no dia seguinte): cancela, com o motivo.
        when (select count(*) from public.instance_sends x
              where x.instance_id = c.instance_id
                and x.sent_at > now() - interval '1 day')
             >= (select k.per_day from app.instance_caps(c.instance_id) k)
          then 'Não enviado: ficou parado na fila além do horário (número no teto diário do anti-ban).'
        else 'Não enviado: ficou parado na fila além do horário (servidor ou número fora do ar).'
      end,
      lease_expires_at = null,
      updated_at = now()
  where c.status = 'queued'
    and (p_tenant is null or c.tenant_id = p_tenant)
    and c.type in ('send_message', 'send_media', 'send_poll')
    and c.instance_id is not null
    and c.available_at < now() - app.missed_send_tolerance()
    -- case, e nao and: a retencao (cara) so e calculada para numero sem envio recente.
    and case
      when exists (
        select 1 from public.instance_sends x
        where x.instance_id = c.instance_id
          and x.sent_at > now() - app.missed_send_tolerance()
      ) then false
      else app.send_hold_ended_at(c.instance_id) < now() - app.missed_send_tolerance()
    end;

  return query
  update public.engine_commands c
  set
    status = 'processing',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now(),
    -- Orcamento de @todos: decidido por post (origin_id + origin_run_id; o broadcast se repete
    -- no recorrente e no reenvio, o run nao). Post ja cortado segue cortado; post que ja saiu
    -- marcando segue marcando; post novo acima do orcamento sai sem marcar.
    payload = case
      when c.payload->>'mentionAll' = 'true' and (
        exists (
          select 1 from public.engine_commands x
          where x.origin_id = c.origin_id and x.id <> c.id
            and x.origin_run_id is not distinct from c.origin_run_id
            and x.payload->>'mentionAllCortado' = 'true'
        )
        or (
          not exists (
            select 1 from public.engine_commands x
            where x.origin_id = c.origin_id and x.id <> c.id
              and x.origin_run_id is not distinct from c.origin_run_id
              and x.claimed_at is not null
              and x.payload->>'mentionAll' = 'true'
          )
          and (select count(distinct (coalesce(x.origin_id, x.id), x.origin_run_id))
               from public.engine_commands x
               where x.instance_id = c.instance_id
                 and x.payload->>'mentionAll' = 'true'
                 and x.claimed_at > now() - interval '1 day'
                 and (coalesce(x.origin_id, x.id), x.origin_run_id)
                     is distinct from (coalesce(c.origin_id, c.id), c.origin_run_id))
              >= app.mention_all_daily_budget()
        )
      )
        then c.payload || jsonb_build_object('mentionAll', false, 'mentionAllCortado', true)
      else c.payload
    end
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
        select 1 from app.exit_breaker b
        where b.tenant_id = cand.tenant_id and b.until > now()
      )
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

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.claim_send_commands(integer, uuid) from public, anon, authenticated;
grant execute on function app.claim_send_commands(integer, uuid) to service_role;
