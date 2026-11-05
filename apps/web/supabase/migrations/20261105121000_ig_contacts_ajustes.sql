-- apps/web/supabase/migrations/20261105121000_ig_contacts_ajustes.sql
-- Ajustes da revisão do PR 1a (20261105120000_ig_contacts.sql), em arquivo próprio porque o CI aplica por nome
-- e a migração anterior já rodou em dev.
--
-- 1) ig_contact_apply: data vinda do webhook não passa de agora + 5 min (uma data no futuro deixaria a ficha
--    eterna e a janela da Meta "aberta").
-- 2) ig_purge_contacts: loja cancelada há mais de 30 dias perde também os atendimentos (ig_runs, passos em
--    cascata). Sem isso eles só sumiriam pela limpeza de 90 dias do webhook, que não roda para loja sem o add-on.
-- 3) Lojas que já tinham cancelado antes desta coluna existir ganham o carimbo agora (só quem teve fluxo).
--
-- create or replace não preserva ACL em dev: o revoke/grant é repetido no fim.

set lock_timeout = '5s';

create or replace function public.ig_contact_apply(
  p_tenant uuid,
  p_ig_user_id text,
  p_username text,
  p_set jsonb,
  p_add text[],
  p_remove text[],
  p_seen_at timestamptz,
  p_dm boolean,
  p_source_flow uuid
)
returns public.ig_contacts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seen timestamptz := least(coalesce(p_seen_at, now()), now() + interval '5 minutes');
  v_row public.ig_contacts;
begin
  insert into public.ig_contacts as c
    (tenant_id, ig_user_id, username, fields, tags, first_seen_at, last_seen_at, last_dm_at, source_flow_id)
  values (
    p_tenant, p_ig_user_id, nullif(p_username, ''),
    app.ig_merge_fields('{}'::jsonb, p_set),
    app.ig_merge_tags('{}'::text[], p_add, p_remove),
    v_seen, v_seen,
    case when p_dm then v_seen end,
    p_source_flow
  )
  on conflict (tenant_id, ig_user_id) do update set
    username       = coalesce(nullif(p_username, ''), c.username),
    fields         = app.ig_merge_fields(c.fields, p_set),
    tags           = app.ig_merge_tags(c.tags, p_add, p_remove),
    last_seen_at   = greatest(c.last_seen_at, v_seen),
    last_dm_at     = case when p_dm then greatest(c.last_dm_at, v_seen) else c.last_dm_at end,
    source_flow_id = coalesce(c.source_flow_id, p_source_flow),
    updated_at     = now()
  returning c.* into v_row;
  return v_row;
end;
$$;

create or replace function public.ig_purge_contacts(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_idle bigint;
  v_off bigint;
  v_runs bigint;
begin
  delete from public.ig_contacts where last_seen_at < p_now - interval '12 months';
  get diagnostics v_idle = row_count;

  delete from public.ig_contacts c
  using public.tenant_settings s
  where s.tenant_id = c.tenant_id
    and s.instagram_enabled is not true
    and s.instagram_disabled_at < p_now - interval '30 days';
  get diagnostics v_off = row_count;

  delete from public.ig_runs r
  using public.tenant_settings s
  where s.tenant_id = r.tenant_id
    and s.instagram_enabled is not true
    and s.instagram_disabled_at < p_now - interval '30 days';
  get diagnostics v_runs = row_count;

  return jsonb_build_object('inativas', v_idle, 'loja_cancelada', v_off, 'atendimentos_loja_cancelada', v_runs);
end;
$$;

update public.tenant_settings s
   set instagram_disabled_at = now()
 where s.instagram_enabled is not true
   and s.instagram_disabled_at is null
   and exists (select 1 from public.ig_flows f where f.tenant_id = s.tenant_id);

revoke all on function public.ig_contact_apply(uuid, text, text, jsonb, text[], text[], timestamptz, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.ig_purge_contacts(timestamptz) from public, anon, authenticated;
grant execute on function public.ig_contact_apply(uuid, text, text, jsonb, text[], text[], timestamptz, boolean, uuid) to service_role;
grant execute on function public.ig_purge_contacts(timestamptz) to service_role;
