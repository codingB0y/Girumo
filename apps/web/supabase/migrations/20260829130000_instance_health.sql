-- Saúde do número — leitura do estado anti-ban para a tela do lojista (R2).
--
-- Contexto: desde 20260729120000_engine_antiban_state.sql o ritmo de envio vive
-- em `instance_send_state` + `instance_sends`, e o teto do dia é calculado por
-- `app.instance_daily_cap`. Nada disso tinha wrapper em `public`, então o app
-- não conseguia ler nem o teto — o melhor anti-ban da categoria era invisível
-- para quem paga por ele.
--
-- Por que uma RPC e não SELECTs no app: o teto do dia é uma REGRA (warmup com
-- fator por número, graduação em 7 dias, teto duro 800). Recalcular isso em
-- TypeScript criaria uma segunda verdade que diverge silenciosamente da que o
-- `claim_send_commands` usa de fato — exatamente a mentira que esta tela existe
-- para desfazer. Aqui a tela lê o MESMO `app.instance_daily_cap` do claim.
--
-- Só leitura: nenhuma escrita, nenhum efeito no caminho de envio.

create or replace function app.instance_health(target_tenant_id uuid)
returns table (
  instance_id          uuid,
  phone                text,
  status               text,
  connected_at         timestamptz,
  -- Dia do aquecimento em base 1 ("dia 3 de aquecimento"), espelhando o
  -- floor(epoch/86400) de app.instance_daily_cap. Número que nunca enviou não
  -- tem linha de estado e está no dia 1 (teto 20), que é o que o claim aplica.
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
  -- Último evento vindo do WhatsApp (webhook Evolution). É o único sinal de
  -- vida real da sessão: `instances.last_seen_at` só é tocado em transição de
  -- connection.update, não é heartbeat periódico (ver session-liveness.ts).
  last_event_at        timestamptz
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
    coalesce(
      floor(extract(epoch from now() - s.warmup_started_at) / 86400)::int,
      0
    ) + 1 as warmup_day,
    coalesce(s.warmup_graduated, false) as warmup_graduated,
    app.instance_daily_cap(i.id) as daily_cap,
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
        and c.failed_at > now() - interval '1 day')::int as failures_24h,
    s.last_active_at,
    (select max(e.created_at) from public.engine_events e where e.instance_id = i.id)
  from public.instances i
  left join public.instance_send_state s on s.instance_id = i.id
  -- O filtro por tenant é a proteção real: quem chama é service-role, que
  -- bypassa RLS por desenho (ver "Isolamento multi-tenant" no CLAUDE.md).
  where i.tenant_id = target_tenant_id
  order by
    -- Conectada primeiro: é a que o lojista está usando agora.
    (i.status = 'connected') desc,
    i.updated_at desc;
$$;

create or replace function public.instance_health(target_tenant_id uuid)
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
  last_event_at        timestamptz
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
  'Estado anti-ban por número para a tela de saúde (/painel/conectar). Só leitura; usa o MESMO app.instance_daily_cap do claim para não criar uma segunda verdade sobre o teto do dia.';
