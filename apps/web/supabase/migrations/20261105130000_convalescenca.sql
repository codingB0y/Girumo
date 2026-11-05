-- 2026-11-05 - Convalescença: o número que o WhatsApp derrubou volta devagar.
--
-- Por quê: a loja piloto teve o número derrubado pelo WhatsApp (connection.update close 401,
-- "atividade pode caracterizar spam") em 23/10, 03/11 e 05/11/2026. Nas três vezes o lojista pareou
-- de novo assim que a restrição de 24 h acabou e os posts voltaram no ritmo de sempre: em 05/11 o
-- número reconectou às 10:59 do dia 04, postou para 35 grupos às 08:00 do dia 05 e caiu de novo às
-- 10:59. Depois de uma restrição o WhatsApp observa o número de perto, e o volume normal logo na volta
-- é o que renova a punição. Nada no Girumo sabia que o número tinha sido derrubado: o claim via
-- "connected" e aplicava os tetos de veterano.
--
-- O que muda:
--
--   1. app.convalescenca: uma linha por número derrubado — quando caiu (logout_at), quando voltou,
--      até quando os posts ficam pausados (logout + 48 h) e até quando o ritmo fica reduzido
--      (logout + 14 dias). Só o service_role lê e escreve.
--   2. public.iniciar_convalescenca(tenant, instance, logout_at): o webhook chama quando a sessão ABRE
--      depois de um 401 de 30 min ou mais antes. O fluxo de pareamento também emite 401 seguido de open,
--      em 0 a 15 min (prod, 60 dias: 0, 1, 3, 5, 6, 9 e 15 min); as derrubadas reais voltaram em
--      104 min a 3 dias. A função registra a convalescença, cancela a fila do número com o motivo,
--      notifica o lojista (type antiban_convalescenca) e grava em logs. Idempotente por derrubada: a
--      mesma logout_at não registra nem notifica duas vezes; uma derrubada mais nova reinicia as
--      janelas. Derrubada com mais de 14 dias não faz nada: o número voltou de uma ausência, não de
--      uma restrição (o aquecimento de record_send cuida desse caso).
--   3. app.instance_caps: perfil 'convalescente' enquanto perfil_ate > now(): 4/min, um post por hora
--      (per_hour = grupos com gente), dois posts por dia (per_day = 2 × grupos), pisos de 10 e 20 para
--      número sem grupo sincronizado, e nunca acima do que o perfil de base (novo/veterano) permitiria.
--      instance_health e a tela do número leem o perfil daqui; send_hold_ended_at usa o per_hour.
--   4. app.claim_send_commands: não pega comando de número com posts pausados, e o cancelamento por
--      tolerância diz o motivo (convalescença) antes do disjuntor. Como no disjuntor, a pausa NÃO é
--      retenção (send_hold_ended_at não a conhece): o que for agendado durante ela é cancelado pela
--      tolerância de 15 min com o motivo, em vez de sair tudo junto quando a pausa acabar.
--
-- public.iniciar_convalescenca é função nova em public: a baseline de drift muda (regerar depois do
-- migrate-dev). O resto é app.*. Travas de md5 nos dois corpos trocados; cada trava aceita o corpo
-- anterior e o desta migração. Conferir nos DOIS bancos com infra/tests/convalescenca-check.sql.

-- Travas: o corpo atual de claim_send_commands tem que ser o de 20261023120000 e o de instance_caps o
-- de 20261030160000 (md5 conferidos em dev e prod em 05/11), ou os desta migração (reaplicar passa).
do $$
declare
  v_claim text;
  v_caps  text;
begin
  select p.prosrc into v_claim from pg_proc p where p.oid = to_regprocedure('app.claim_send_commands(integer,uuid)');
  select p.prosrc into v_caps  from pg_proc p where p.oid = to_regprocedure('app.instance_caps(uuid)');
  if v_claim is null or v_caps is null then
    raise exception 'convalescenca: app.claim_send_commands ou app.instance_caps não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_claim, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('e129ff5b504e8e86122f5fdf53bb1955', '6626ee339918e46214a93ec035c1b40f') then
    raise exception 'convalescenca: o corpo de app.claim_send_commands neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_caps, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('e60de0eda8f02f171ec9cd2739cd0a7c', '5a6f3fc7b8ebb101d7fc8400b46973c0') then
    raise exception 'convalescenca: o corpo de app.instance_caps neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

-- 1) Uma linha por número derrubado. posts_pausados_ate no futuro = posts parados; perfil_ate no
--    futuro = ritmo reduzido (app.instance_caps). As duas datas contam da derrubada, não da volta.
create table if not exists app.convalescenca (
  instance_id        uuid primary key references public.instances(id) on delete cascade,
  tenant_id          uuid not null references public.organizations(id) on delete cascade,
  logout_at          timestamptz not null,
  reconnected_at     timestamptz not null,
  posts_pausados_ate timestamptz not null,
  perfil_ate         timestamptz not null,
  cancelados         integer not null default 0,
  created_at         timestamptz not null default now()
);
-- Defesa em profundidade: sem policy, só o service_role (que ignora RLS) lê e escreve.
alter table app.convalescenca enable row level security;
revoke all on table app.convalescenca from public, anon, authenticated;
grant select, insert, update, delete on table app.convalescenca to service_role;

-- As duas janelas, no mesmo molde de app.posts_por_grupo_dia: um valor só, lido pelo banco.
create or replace function app.convalescenca_pausa()
returns interval
language sql
immutable
set search_path to 'public', 'app'
as $$ select interval '48 hours' $$;

create or replace function app.convalescenca_duracao()
returns interval
language sql
immutable
set search_path to 'public', 'app'
as $$ select interval '14 days' $$;

revoke all on function app.convalescenca_pausa() from public, anon, authenticated;
grant execute on function app.convalescenca_pausa() to service_role;
revoke all on function app.convalescenca_duracao() from public, anon, authenticated;
grant execute on function app.convalescenca_duracao() to service_role;

-- 2) Registro da convalescença. Chamada pelo webhook na abertura da sessão; devolve o que fez.
create or replace function public.iniciar_convalescenca(p_tenant uuid, p_instance uuid, p_logout_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_purpose text;
  v_phone   text;
  v_atual   app.convalescenca;
  v_pausa   timestamptz;
  v_perfil  timestamptz;
  v_cancel  integer := 0;
  v_quando  text;
begin
  if p_logout_at is null then
    return jsonb_build_object('iniciada', false, 'motivo', 'sem_logout');
  end if;

  -- O filtro por tenant é a proteção real: service-role bypassa RLS.
  select i.purpose, i.phone into v_purpose, v_phone
  from public.instances i
  where i.id = p_instance and i.tenant_id = p_tenant;
  if not found then
    return jsonb_build_object('iniciada', false, 'motivo', 'instancia_desconhecida');
  end if;
  -- O número do atendimento não tem teto de post (instance_caps devolve zero linhas): nada a pausar.
  if v_purpose is distinct from 'grupos' then
    return jsonb_build_object('iniciada', false, 'motivo', 'nao_e_numero_dos_grupos');
  end if;

  v_perfil := p_logout_at + app.convalescenca_duracao();
  if v_perfil <= now() then
    return jsonb_build_object('iniciada', false, 'motivo', 'derrubada_antiga');
  end if;

  -- Um registro por número de cada vez: o connection.update open chega em rajada.
  perform pg_advisory_xact_lock(hashtextextended('convalescenca:' || p_instance::text, 0));

  select * into v_atual from app.convalescenca v where v.instance_id = p_instance;
  if found and v_atual.logout_at >= p_logout_at then
    return jsonb_build_object('iniciada', false, 'motivo', 'ja_registrada',
                              'posts_pausados_ate', v_atual.posts_pausados_ate, 'perfil_ate', v_atual.perfil_ate);
  end if;

  v_pausa := p_logout_at + app.convalescenca_pausa();

  insert into app.convalescenca (instance_id, tenant_id, logout_at, reconnected_at, posts_pausados_ate, perfil_ate)
  values (p_instance, p_tenant, p_logout_at, now(), v_pausa, v_perfil)
  on conflict (instance_id) do update
    set tenant_id = excluded.tenant_id, logout_at = excluded.logout_at, reconnected_at = excluded.reconnected_at,
        posts_pausados_ate = excluded.posts_pausados_ate, perfil_ate = excluded.perfil_ate, cancelados = 0;

  -- O que já está na fila do número não sai: reconcile_broadcast_progress fecha a oferta com o motivo.
  if v_pausa > now() then
    update public.engine_commands c
    set status = 'canceled',
        error = format('Não enviado: o WhatsApp derrubou este número e o anti-ban pausou os posts até %s (convalescença).',
                       to_char(v_pausa at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')),
        lease_expires_at = null,
        updated_at = now()
    where c.tenant_id = p_tenant
      and c.instance_id = p_instance
      and c.status = 'queued'
      and c.type in ('send_message', 'send_media', 'send_poll');
    get diagnostics v_cancel = row_count;
    update app.convalescenca set cancelados = v_cancel where instance_id = p_instance;
  end if;

  v_quando := to_char(p_logout_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  insert into public.notifications (tenant_id, type, title, body, href)
  values (
    p_tenant,
    'antiban_convalescenca',
    'Número em convalescença',
    case
      when v_pausa > now() then
        format('O WhatsApp derrubou este número em %s. Para ele não cair de novo, os posts ficam pausados até %s e, até %s, saem no ritmo de 1 post por hora e no máximo %s por grupo por dia.',
               v_quando,
               to_char(v_pausa at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
               to_char(v_perfil at time zone 'America/Sao_Paulo', 'DD/MM'),
               app.posts_por_grupo_dia())
      else
        format('O WhatsApp derrubou este número em %s. Para ele não cair de novo, até %s os posts saem no ritmo de 1 post por hora e no máximo %s por grupo por dia.',
               v_quando,
               to_char(v_perfil at time zone 'America/Sao_Paulo', 'DD/MM'),
               app.posts_por_grupo_dia())
    end,
    '/painel/conectar'
  );

  insert into public.logs (tenant_id, instance_id, level, event, message, metadata)
  values (
    p_tenant, p_instance, 'warn', 'antiban_convalescenca',
    'Convalescença iniciada: o WhatsApp derrubou o número e ele voltou',
    jsonb_build_object('logout_at', p_logout_at, 'reconnected_at', now(), 'posts_pausados_ate', v_pausa,
                       'perfil_ate', v_perfil, 'cancelados', v_cancel, 'phone', v_phone)
  );

  return jsonb_build_object('iniciada', true, 'posts_pausados_ate', v_pausa, 'perfil_ate', v_perfil,
                            'cancelados', v_cancel);
end;
$$;

revoke all on function public.iniciar_convalescenca(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.iniciar_convalescenca(uuid, uuid, timestamptz) to service_role;

-- 3) Corpo de 20261030160000 reorganizado: o perfil de base (novo/veterano) vai para variáveis e a
--    convalescença aperta por cima dele, nunca afrouxa. Assinatura e colunas iguais.
CREATE OR REPLACE FUNCTION app.instance_caps(target_instance_id uuid)
 RETURNS TABLE(perfil text, per_min integer, per_hour integer, per_day integer, admin_groups integer, warmup_day integer, graduated boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  v_declared  text;
  v_tenant    uuid;
  v_groups    integer := 0;
  v_graduated boolean := false;
  v_started   timestamptz;
  v_day       integer := 0;
  v_ramp      integer;
  v_purpose   text;
  v_conv_ate  timestamptz;
  v_perfil    text;
  v_per_min   integer;
  v_per_hour  integer;
  v_per_day   integer;
begin
  select i.numero_perfil, i.tenant_id, i.purpose into v_declared, v_tenant, v_purpose
    from public.instances i
   where i.id = target_instance_id;

  -- O número do atendimento não tem teto de post: zero linhas. O claim de post nunca pega comando
  -- dele e app.instance_health não o lista. O ritmo do privado é outro (PR 3).
  if v_purpose = 'privado' then
    return;
  end if;

  if v_tenant is not null then
    -- Evidência: grupos que o número administra com gente de verdade.
    select count(*)::int into v_groups
      from public.groups g
     where g.tenant_id = v_tenant and g.is_admin and g.members >= 10;

    select coalesce(s.warmup_graduated, false), s.warmup_started_at
      into v_graduated, v_started
      from public.instance_send_state s
     where s.instance_id = target_instance_id;
    v_graduated := coalesce(v_graduated, false);

    if v_started is not null then
      v_day := floor(extract(epoch from now() - v_started) / 86400)::int;
    end if;
    if v_day >= 7 then
      v_graduated := true;
    end if;

    select v.perfil_ate into v_conv_ate
      from app.convalescenca v
     where v.instance_id = target_instance_id;
  end if;

  if v_graduated
     or (v_declared is distinct from 'novo' and (v_declared = 'antigo' or v_groups >= 5)) then
    v_perfil   := 'veterano';
    v_per_min  := 10;
    v_per_hour := least(400, greatest(60, v_groups * 3));
    v_per_day  := least(1500, greatest(300, v_groups * 15));
    v_graduated := true;
  else
    -- Novo: rampa de 7 dias (40, 64, 102, 164, 262, 419, 671), limitada pelos grupos.
    v_ramp     := round(40 * power(1.6, v_day))::int;
    v_perfil   := 'novo';
    v_per_min  := 8;
    v_per_hour := least(150, greatest(40, v_ramp));
    v_per_day  := least(800, greatest(40, v_groups * 6), v_ramp);
    v_graduated := false;
  end if;

  -- Convalescença (20261105130000): nos 14 dias depois de o WhatsApp derrubar o número, o ritmo é o
  -- de um número em observação, seja ele novo ou veterano: 4/min, um post por hora (per_hour = grupos)
  -- e dois posts por dia (per_day = 2 × grupos). Pisos para número sem grupo sincronizado; nunca acima
  -- do que o perfil de base permitiria.
  if v_conv_ate > now() then
    v_perfil   := 'convalescente';
    v_per_min  := least(v_per_min, 4);
    v_per_hour := least(v_per_hour, greatest(10, v_groups));
    v_per_day  := least(v_per_day, greatest(20, v_groups * 2));
  end if;

  return query select v_perfil, v_per_min, v_per_hour, v_per_day, v_groups, v_day + 1, v_graduated;
end;
$function$;

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.instance_caps(uuid) from public, anon, authenticated;
grant execute on function app.instance_caps(uuid) to service_role;

-- 4) Corpo de 20261023120000 com duas trocas: (1) o cancelamento por tolerância diz o motivo quando o
--    número está em convalescença (antes do disjuntor); (2) o claim não pega comando de número com os
--    posts pausados pela convalescença.
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
  -- O disjuntor de saidas e a convalescenca NAO sao retencao: o que chega
  -- durante eles e cancelado. reconcile_broadcast_progress fecha a oferta.
  update public.engine_commands c
  set status = 'canceled',
      error = case
        when exists (select 1 from app.convalescenca v
                     where v.instance_id = c.instance_id and v.posts_pausados_ate > now())
          then (select format('Não enviado: o WhatsApp derrubou este número e o anti-ban pausou os posts até %s (convalescença).',
                              to_char(v.posts_pausados_ate at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
                  from app.convalescenca v where v.instance_id = c.instance_id)
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
        select 1 from app.convalescenca v
        where v.instance_id = cand.instance_id and v.posts_pausados_ate > now()
      )
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

revoke all on function app.claim_send_commands(integer, uuid) from public, anon, authenticated;
grant execute on function app.claim_send_commands(integer, uuid) to service_role;
