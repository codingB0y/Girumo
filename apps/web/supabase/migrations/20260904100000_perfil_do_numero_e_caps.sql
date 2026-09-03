-- Perfil do número (novo × veterano) e tetos proporcionais à base de grupos.
--
-- POR QUE: o warm-up de 20/dia com reset a cada 72 h e os caps 8/120/800 vieram
-- do motor de DM. Aplicados a post em grupo, prendem número veterano no dia 1-2
-- (medido em 03/09: 13 send_media esperaram 13-21 h). Spec:
-- docs/superpowers/specs/2026-09-03-perfil-do-numero-e-fila-rapida-design.md
--
-- O gap 3-7 s, o breaker e o claim de 1 comando por número NÃO mudam.
-- Aplicar nos DOIS bancos. `numero_perfil` entra no schema-baseline; o corpo
-- das funções não entra no hash do gate de drift — conferir com pg_get_functiondef.

begin;

-- 1) Declaração do lojista ao conectar. null = instância anterior a esta
--    migração; a evidência (grupos admin) decide. A declaração só rebaixa.
alter table public.instances add column if not exists numero_perfil text;
alter table public.instances drop constraint if exists instances_numero_perfil_check;
alter table public.instances add constraint instances_numero_perfil_check
  check (numero_perfil is null or numero_perfil in ('novo', 'antigo'));
comment on column public.instances.numero_perfil is
  'Declarado ao conectar: novo (<30 dias) ou antigo. null = pré-existente, evidência decide. Só rebaixa: novo vence evidência; graduação vence declaração.';

-- 2) A ÚNICA fonte dos tetos. Claim e tela de saúde leem daqui.
create or replace function app.instance_caps(target_instance_id uuid)
returns table (
  perfil       text,
  per_min      integer,
  per_hour     integer,
  per_day      integer,
  admin_groups integer,
  warmup_day   integer,
  graduated    boolean
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_declared  text;
  v_tenant    uuid;
  v_groups    integer := 0;
  v_graduated boolean := false;
  v_started   timestamptz;
  v_day       integer := 0;
  v_ramp      integer;
begin
  select i.numero_perfil, i.tenant_id into v_declared, v_tenant
    from public.instances i
   where i.id = target_instance_id;

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
  end if;

  if v_graduated
     or (v_declared is distinct from 'novo' and (v_declared = 'antigo' or v_groups >= 5)) then
    return query select
      'veterano'::text,
      10,
      least(400, greatest(60, v_groups * 3)),
      least(1500, greatest(300, v_groups * 15)),
      v_groups,
      v_day + 1,
      true;
    return;
  end if;

  -- Novo: rampa de 7 dias (40, 64, 102, 164, 262, 419, 671), limitada pelos grupos.
  v_ramp := round(40 * power(1.6, v_day))::int;
  return query select
    'novo'::text,
    8,
    least(150, greatest(40, v_ramp)),
    least(800, greatest(40, v_groups * 6), v_ramp),
    v_groups,
    v_day + 1,
    false;
end;
$$;

revoke all on function app.instance_caps(uuid) from public, anon, authenticated;
grant execute on function app.instance_caps(uuid) to service_role;

-- 3) Wrapper: quem já chamava instance_daily_cap continua funcionando.
create or replace function app.instance_daily_cap(target_instance_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, app
as $$
  select c.per_day from app.instance_caps(target_instance_id) c;
$$;

revoke all on function app.instance_daily_cap(uuid) from public, anon, authenticated;
grant execute on function app.instance_daily_cap(uuid) to service_role;

-- 4) Claim de envio: mesmos predicados, tetos vindos de instance_caps.
--    `for update of cand`: a função na cláusula FROM não é lockável.
create or replace function app.claim_send_commands(
  max_commands integer default 5,
  p_tenant uuid default null
)
returns setof engine_commands
language plpgsql
security definer
set search_path to 'public', 'app'
as $function$
begin
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

revoke all on function app.claim_send_commands(integer, uuid) from public, anon, authenticated;
grant execute on function app.claim_send_commands(integer, uuid) to service_role;

-- 5) record_send: reset do warm-up em 14 dias (era 72 h), só para quem não graduou.
create or replace function app.record_send(target_instance_id uuid, target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.instance_send_state (
    instance_id, tenant_id, warmup_started_at, last_active_at, next_send_allowed_at
  )
  values (
    target_instance_id, target_tenant_id, now(), now(),
    now() + make_interval(secs => 3 + ((random() + random()) / 2) * 4)
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
    next_send_allowed_at = now() + make_interval(secs => 3 + ((random() + random()) / 2) * 4),
    updated_at = now();

  insert into public.instance_sends (instance_id) values (target_instance_id);
end;
$$;

revoke all on function app.record_send(uuid, uuid) from public, anon, authenticated;
grant execute on function app.record_send(uuid, uuid) to service_role;

-- 6) record_send_failure ganha rate_limited. Parâmetro novo = sobrecarga, então
--    drop antes do create (ver 20260831160000_claim_por_tenant.sql).
drop function if exists public.record_send_failure(uuid, uuid);
drop function if exists app.record_send_failure(uuid, uuid);

create function app.record_send_failure(
  target_instance_id uuid,
  target_tenant_id uuid,
  rate_limited boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.instance_send_state (instance_id, tenant_id, consecutive_failures, paused_until)
  values (
    target_instance_id, target_tenant_id, 1,
    case when rate_limited then now() + interval '30 minutes' end
  )
  on conflict (instance_id) do update set
    consecutive_failures = instance_send_state.consecutive_failures + 1,
    paused_until = case
      when rate_limited then now() + interval '30 minutes'
      when instance_send_state.consecutive_failures + 1 >= 5 then now() + interval '60 seconds'
      else instance_send_state.paused_until
    end,
    updated_at = now();
end;
$$;

revoke all on function app.record_send_failure(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function app.record_send_failure(uuid, uuid, boolean) to service_role;

create function public.record_send_failure(
  target_instance_id uuid,
  target_tenant_id uuid,
  rate_limited boolean default false
)
returns void
language sql
security definer
set search_path = public, app
as $$
  select app.record_send_failure(target_instance_id, target_tenant_id, rate_limited);
$$;

revoke all on function public.record_send_failure(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_send_failure(uuid, uuid, boolean) to service_role;

-- 7) instance_health com perfil e tetos. Tipo de retorno muda → drop + create.
drop function if exists public.instance_health(uuid);
drop function if exists app.instance_health(uuid);

create function app.instance_health(target_tenant_id uuid)
returns table (
  instance_id          uuid,
  phone                text,
  status               text,
  connected_at         timestamptz,
  warmup_day           integer,
  warmup_graduated     boolean,
  daily_cap            integer,
  sent_24h             integer,
  sent_1h              integer,
  sent_1m              integer,
  next_send_allowed_at timestamptz,
  paused_until         timestamptz,
  consecutive_failures integer,
  failures_24h         integer,
  last_active_at       timestamptz,
  last_event_at        timestamptz,
  perfil               text,
  per_hour             integer,
  per_min              integer,
  admin_groups         integer
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    i.id,
    i.phone,
    i.status::text,
    i.connected_at,
    caps.warmup_day,
    caps.graduated,
    caps.per_day,
    (select count(*) from public.instance_sends x
      where x.instance_id = i.id and x.sent_at > now() - interval '1 day')::int,
    (select count(*) from public.instance_sends x
      where x.instance_id = i.id and x.sent_at > now() - interval '1 hour')::int,
    (select count(*) from public.instance_sends x
      where x.instance_id = i.id and x.sent_at > now() - interval '1 minute')::int,
    s.next_send_allowed_at,
    s.paused_until,
    coalesce(s.consecutive_failures, 0),
    (select count(*) from public.engine_commands c
      where c.instance_id = i.id
        and c.status = 'failed'
        and c.failed_at > now() - interval '1 day')::int,
    s.last_active_at,
    (select max(e.created_at) from public.engine_events e where e.instance_id = i.id),
    caps.perfil,
    caps.per_hour,
    caps.per_min,
    caps.admin_groups
  from public.instances i
  left join public.instance_send_state s on s.instance_id = i.id
  cross join lateral app.instance_caps(i.id) caps
  -- O filtro por tenant é a proteção real: service-role bypassa RLS.
  where i.tenant_id = target_tenant_id
  order by (i.status = 'connected') desc, i.updated_at desc;
$$;

revoke all on function app.instance_health(uuid) from public, anon, authenticated;
grant execute on function app.instance_health(uuid) to service_role;

create function public.instance_health(target_tenant_id uuid)
returns table (
  instance_id          uuid,
  phone                text,
  status               text,
  connected_at         timestamptz,
  warmup_day           integer,
  warmup_graduated     boolean,
  daily_cap            integer,
  sent_24h             integer,
  sent_1h              integer,
  sent_1m              integer,
  next_send_allowed_at timestamptz,
  paused_until         timestamptz,
  consecutive_failures integer,
  failures_24h         integer,
  last_active_at       timestamptz,
  last_event_at        timestamptz,
  perfil               text,
  per_hour             integer,
  per_min              integer,
  admin_groups         integer
)
language sql
stable
security definer
set search_path = public, app
as $$
  select * from app.instance_health(target_tenant_id);
$$;

revoke execute on function public.instance_health(uuid) from public, anon, authenticated;
grant execute on function public.instance_health(uuid) to service_role;

comment on function public.instance_health(uuid) is
  'Estado anti-ban por número para /painel/conectar. Só leitura; usa app.instance_caps, a mesma fonte do claim.';

commit;
