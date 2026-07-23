-- Girumo LP v2: confirmação transacional e idempotência por versão publicada.
-- A função inteira executa na transação da chamada PostgreSQL. Qualquer erro
-- reverte contato, captura, lead legado, evento e reconciliação do contador.

drop index if exists uq_lp_events_idem;
create unique index uq_lp_events_idem
  on lp_tracking_events(landing_page_id, event_name, published_version, idem_key)
  where idem_key is not null;

create or replace function confirm_lp_capture(
  p_tenant_id uuid,
  p_landing_page_id uuid,
  p_name text,
  p_whatsapp text,
  p_published_version int,
  p_campaign_slug text,
  p_structure text,
  p_visual_direction text,
  p_model_version int,
  p_notice_version text,
  p_notice_text text,
  p_device text,
  p_attribution jsonb,
  p_idem_key text,
  p_user_agent text,
  p_ip_hash text
)
returns table(created boolean, contact_id uuid, capture_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact_id uuid;
  v_capture_id uuid;
  v_capture_created boolean;
  v_event_idem_key text;
  v_legacy_event_idem_key text;
begin
  if not exists (
    select 1
    from landing_pages
    where id = p_landing_page_id
      and tenant_id = p_tenant_id
  ) then
    raise exception 'landing page does not belong to tenant';
  end if;

  insert into lp_contacts (
    tenant_id,
    name,
    whatsapp,
    updated_at
  )
  values (
    p_tenant_id,
    nullif(btrim(p_name), ''),
    p_whatsapp,
    now()
  )
  on conflict (tenant_id, whatsapp) do update
    set name = coalesce(excluded.name, lp_contacts.name),
        updated_at = now()
  returning id into v_contact_id;

  insert into lp_captures (
    tenant_id,
    landing_page_id,
    contact_id,
    published_version,
    campaign_slug,
    structure,
    visual_direction,
    model_version,
    notice_version,
    notice_text,
    device,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    fbclid,
    gclid,
    ttclid,
    referrer,
    idem_key
  )
  values (
    p_tenant_id,
    p_landing_page_id,
    v_contact_id,
    p_published_version,
    p_campaign_slug,
    p_structure,
    p_visual_direction,
    p_model_version,
    p_notice_version,
    p_notice_text,
    p_device,
    p_attribution ->> 'utm_source',
    p_attribution ->> 'utm_medium',
    p_attribution ->> 'utm_campaign',
    p_attribution ->> 'utm_content',
    p_attribution ->> 'utm_term',
    p_attribution ->> 'fbclid',
    p_attribution ->> 'gclid',
    p_attribution ->> 'ttclid',
    p_attribution ->> 'referrer',
    p_idem_key
  )
  on conflict (landing_page_id, published_version, contact_id, idem_key) do nothing
  returning id into v_capture_id;

  v_capture_created := v_capture_id is not null;

  if v_capture_id is null then
    select id
      into v_capture_id
      from lp_captures
     where landing_page_id = p_landing_page_id
       and published_version = p_published_version
       and contact_id = v_contact_id
       and idem_key = p_idem_key;
  end if;

  -- Compatibilidade do painel legado. O índice parcial atual mantém o primeiro
  -- consentimento por página+WhatsApp; conflito não invalida a captura v2.
  insert into lp_leads (
    tenant_id,
    landing_page_id,
    name,
    whatsapp,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    fbclid,
    gclid,
    ttclid,
    referrer,
    user_agent,
    ip_hash,
    consent_at,
    consent_text
  )
  values (
    p_tenant_id,
    p_landing_page_id,
    nullif(btrim(p_name), ''),
    p_whatsapp,
    p_attribution ->> 'utm_source',
    p_attribution ->> 'utm_medium',
    p_attribution ->> 'utm_campaign',
    p_attribution ->> 'utm_content',
    p_attribution ->> 'utm_term',
    p_attribution ->> 'fbclid',
    p_attribution ->> 'gclid',
    p_attribution ->> 'ttclid',
    p_attribution ->> 'referrer',
    p_user_agent,
    p_ip_hash,
    now(),
    p_notice_text
  )
  on conflict (landing_page_id, whatsapp) where whatsapp is not null do nothing;

  -- A versão participa tanto da coluna única quanto da chave legível e dos
  -- dados do evento. O formato antigo é reconhecido para retries iniciados antes
  -- desta migration, sem duplicar o evento já confirmado.
  v_event_idem_key :=
    v_contact_id::text || ':' || p_published_version::text || ':' || p_idem_key;
  v_legacy_event_idem_key := v_contact_id::text || ':' || p_idem_key;

  if not exists (
    select 1
      from lp_tracking_events
     where landing_page_id = p_landing_page_id
       and event_name = 'lead_created'
       and published_version = p_published_version
       and idem_key in (v_event_idem_key, v_legacy_event_idem_key)
  ) then
    insert into lp_tracking_events (
      tenant_id,
      landing_page_id,
      event_name,
      event_data,
      published_version,
      structure,
      visual_direction,
      model_version,
      device,
      idem_key
    )
    values (
      p_tenant_id,
      p_landing_page_id,
      'lead_created',
      coalesce(p_attribution, '{}'::jsonb) ||
        jsonb_build_object(
          'published_version', p_published_version,
          'contact_id', v_contact_id
        ),
      p_published_version,
      p_structure,
      p_visual_direction,
      p_model_version,
      p_device,
      v_event_idem_key
    )
    on conflict do nothing;
  end if;

  -- Recalcular a partir da fonte da verdade repara tanto "evento sem contador"
  -- quanto retries de uma captura que já existia, sem incrementar duas vezes.
  update landing_pages as lp
     set leads_count = (
       select count(*)::int
         from lp_tracking_events as event
        where event.landing_page_id = p_landing_page_id
          and event.event_name in ('lead_created', 'Lead')
     ),
         updated_at = now()
   where lp.id = p_landing_page_id
     and lp.tenant_id = p_tenant_id;

  return query select v_capture_created, v_contact_id, v_capture_id;
end;
$$;

revoke all on function confirm_lp_capture(
  uuid, uuid, text, text, int, text, text, text, int, text, text, text, jsonb,
  text, text, text
) from public;
revoke all on function confirm_lp_capture(
  uuid, uuid, text, text, int, text, text, text, int, text, text, text, jsonb,
  text, text, text
) from anon;
revoke all on function confirm_lp_capture(
  uuid, uuid, text, text, int, text, text, text, int, text, text, text, jsonb,
  text, text, text
) from authenticated;
grant execute on function confirm_lp_capture(
  uuid, uuid, text, text, int, text, text, text, int, text, text, text, jsonb,
  text, text, text
) to service_role;
