-- Funcoes do funil das paginas publicas: record_lp_tracking_event e confirm_lp_capture.
--
-- Por que esta migration existe DEPOIS de as funcoes ja rodarem em producao:
-- em 20/08/2026, ao verificar o card paginas-tracking-captura, descobriu-se que
-- as duas existiam SO no banco de producao (aplicadas a mao) e em NENHUM arquivo
-- do repositorio. O que foi medido em dev naquele dia:
--   * POST /api/p/track respondia 204 e nao gravava nada. 204 e o mesmo codigo do
--     sucesso e do descarte por bot, entao a falha era invisivel: o funil nao
--     existia e ninguem recebia erro.
--   * POST /api/p/lead respondia 500 com "Could not find the function
--     public.confirm_lp_capture(...)" — este ao menos falhava alto.
-- Um banco novo (dev recriado, staging) nasceria com o mesmo buraco silencioso.
--
-- Idempotente (CREATE OR REPLACE nas duas). Aplicar nos DOIS bancos: dev
-- wfjuwogxaupyadwhvoxy e prod nidoatbxaylrkcgbszns. Em prod e no-op — o corpo
-- abaixo foi extraido de pg_get_functiondef do proprio prod, sem edicao.
--
-- Ambas sao SECURITY DEFINER com search_path fixo e travam a landing page com
-- SELECT ... FOR UPDATE antes de escrever: e isso que faz um render context
-- obsoleto virar LP_RENDER_CONTEXT_STALE em vez de gravar evento rotulado com a
-- versao errada da pagina.

CREATE OR REPLACE FUNCTION public.record_lp_tracking_event(
  p_tenant_id uuid,
  p_landing_page_id uuid,
  p_event_name text,
  p_event_data jsonb,
  p_published_version integer,
  p_structure text,
  p_visual_direction text,
  p_model_version integer,
  p_device text,
  p_idem_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_inserted int;
begin
  perform 1
    from public.landing_pages as target_page
   where target_page.id = p_landing_page_id
     and target_page.tenant_id = p_tenant_id
     and target_page.status = 'published'
     and target_page.published_version = p_published_version
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LP_RENDER_CONTEXT_STALE';
  end if;

  insert into public.lp_tracking_events (
    tenant_id, landing_page_id, event_name, event_data, published_version,
    structure, visual_direction, model_version, device, idem_key
  )
  values (
    p_tenant_id, p_landing_page_id, p_event_name, coalesce(p_event_data, '{}'::jsonb),
    p_published_version, p_structure, p_visual_direction, p_model_version,
    p_device, p_idem_key
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 and p_event_name = 'page_view' then
    update public.landing_pages
       set views_count = views_count + 1, updated_at = now()
     where id = p_landing_page_id and tenant_id = p_tenant_id;
  end if;

  return v_inserted = 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_lp_capture(
  p_tenant_id uuid, p_landing_page_id uuid, p_name text, p_whatsapp text,
  p_published_version integer, p_campaign_slug text, p_structure text,
  p_visual_direction text, p_model_version integer, p_notice_version text,
  p_notice_text text, p_device text, p_attribution jsonb, p_idem_key text,
  p_user_agent text, p_ip_hash text
)
RETURNS TABLE(out_created boolean, out_contact_id uuid, out_capture_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_contact_id uuid;
  v_capture_id uuid;
  v_capture_created boolean;
  v_event_idem_key text;
  v_legacy_event_idem_key text;
begin
  -- Serializa o conjunto por landing page: duas capturas concorrentes nao podem
  -- reconciliar `leads_count` a partir de snapshots diferentes, e retries
  -- continuam idempotentes.
  perform 1
    from public.landing_pages as target_page
   where target_page.id = p_landing_page_id
     and target_page.tenant_id = p_tenant_id
     and target_page.status = 'published'
     and target_page.published_version = p_published_version
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LP_RENDER_CONTEXT_STALE';
  end if;

  insert into public.lp_contacts as contact (tenant_id, name, whatsapp, updated_at)
  values (p_tenant_id, nullif(btrim(p_name), ''), p_whatsapp, now())
  on conflict (tenant_id, whatsapp) do update
    set name = coalesce(excluded.name, contact.name), updated_at = now()
  returning contact.id into v_contact_id;

  insert into public.lp_captures as capture (
    tenant_id, landing_page_id, contact_id, published_version, campaign_slug,
    structure, visual_direction, model_version, notice_version, notice_text,
    device, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, ttclid, referrer, idem_key
  )
  values (
    p_tenant_id, p_landing_page_id, v_contact_id, p_published_version, p_campaign_slug,
    p_structure, p_visual_direction, p_model_version, p_notice_version, p_notice_text,
    p_device,
    p_attribution ->> 'utm_source', p_attribution ->> 'utm_medium',
    p_attribution ->> 'utm_campaign', p_attribution ->> 'utm_content',
    p_attribution ->> 'utm_term', p_attribution ->> 'fbclid',
    p_attribution ->> 'gclid', p_attribution ->> 'ttclid',
    p_attribution ->> 'referrer', p_idem_key
  )
  on conflict (landing_page_id, published_version, contact_id, idem_key) do nothing
  returning capture.id into v_capture_id;

  v_capture_created := v_capture_id is not null;

  if v_capture_id is null then
    select capture.id into v_capture_id
      from public.lp_captures as capture
     where capture.landing_page_id = p_landing_page_id
       and capture.published_version = p_published_version
       and capture.contact_id = v_contact_id
       and capture.idem_key = p_idem_key;
  end if;

  -- Compatibilidade do painel legado. O indice parcial mantem o primeiro
  -- consentimento por pagina+WhatsApp; conflito nao invalida a captura v2.
  insert into public.lp_leads (
    tenant_id, landing_page_id, name, whatsapp, utm_source, utm_medium,
    utm_campaign, utm_content, utm_term, fbclid, gclid, ttclid, referrer,
    user_agent, ip_hash, consent_at, consent_text
  )
  values (
    p_tenant_id, p_landing_page_id, nullif(btrim(p_name), ''), p_whatsapp,
    p_attribution ->> 'utm_source', p_attribution ->> 'utm_medium',
    p_attribution ->> 'utm_campaign', p_attribution ->> 'utm_content',
    p_attribution ->> 'utm_term', p_attribution ->> 'fbclid',
    p_attribution ->> 'gclid', p_attribution ->> 'ttclid',
    p_attribution ->> 'referrer', p_user_agent, p_ip_hash, now(), p_notice_text
  )
  on conflict (landing_page_id, whatsapp) where whatsapp is not null do nothing;

  -- A versao entra na chave do evento. O formato antigo continua reconhecido
  -- para retries iniciados antes desta mudanca, sem duplicar evento confirmado.
  v_event_idem_key := v_contact_id::text || ':' || p_published_version::text || ':' || p_idem_key;
  v_legacy_event_idem_key := v_contact_id::text || ':' || p_idem_key;

  if not exists (
    select 1 from public.lp_tracking_events as event
     where event.landing_page_id = p_landing_page_id
       and event.event_name = 'lead_created'
       and event.published_version = p_published_version
       and event.idem_key in (v_event_idem_key, v_legacy_event_idem_key)
  ) then
    insert into public.lp_tracking_events (
      tenant_id, landing_page_id, event_name, event_data, published_version,
      structure, visual_direction, model_version, device, idem_key
    )
    values (
      p_tenant_id, p_landing_page_id, 'lead_created',
      coalesce(p_attribution, '{}'::jsonb) ||
        jsonb_build_object('published_version', p_published_version, 'contact_id', v_contact_id),
      p_published_version, p_structure, p_visual_direction, p_model_version,
      p_device, v_event_idem_key
    )
    on conflict do nothing;
  end if;

  -- Recalcular da fonte da verdade repara "evento sem contador" e retries de
  -- captura ja existente, sem incrementar duas vezes.
  update public.landing_pages as lp
     set leads_count = (
       select count(*)::int from public.lp_tracking_events as event
        where event.landing_page_id = p_landing_page_id
          and event.event_name in ('lead_created', 'Lead')
     ),
         updated_at = now()
   where lp.id = p_landing_page_id and lp.tenant_id = p_tenant_id;

  return query select v_capture_created, v_contact_id, v_capture_id;
end;
$function$;
