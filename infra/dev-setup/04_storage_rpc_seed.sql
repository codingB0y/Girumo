-- ============================================================
-- HUBFLOW DEV — STORAGE + RPC + SEED
-- Executar após 03_rls_policies.sql
-- ============================================================

-- ========== STORAGE BUCKET ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 52428800, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Storage policies
create policy "storage_select_member" on storage.objects
  for select using (
    bucket_id = 'uploads'
    and app.has_membership((storage.foldername(name))[1]::uuid)
  );

create policy "storage_insert_member" on storage.objects
  for insert with check (
    bucket_id = 'uploads'
    and app.has_membership((storage.foldername(name))[1]::uuid)
  );

create policy "storage_update_member" on storage.objects
  for update using (
    bucket_id = 'uploads'
    and app.has_membership((storage.foldername(name))[1]::uuid)
  );

create policy "storage_delete_admin" on storage.objects
  for delete using (
    bucket_id = 'uploads'
    and app.has_role((storage.foldername(name))[1]::uuid, array['owner','admin']::public.member_role[])
  );

-- ========== ENGINE RPCs ==========

create or replace function app.claim_engine_commands(max_commands integer default 5)
returns setof public.engine_commands
language plpgsql security definer set search_path = public, app as $$
begin
  return query
  update public.engine_commands c
  set status = 'processing', claimed_at = now(), updated_at = now()
  where c.id in (
    select pending.id from public.engine_commands pending
    where pending.status = 'queued' and pending.available_at <= now()
    order by pending.created_at asc
    limit greatest(max_commands, 1)
    for update skip locked
  )
  returning c.*;
end;
$$;

create or replace function app.complete_engine_command(
  target_command_id uuid, success boolean, error_message text default null
)
returns public.engine_commands
language plpgsql security definer set search_path = public, app as $$
declare updated public.engine_commands;
begin
  update public.engine_commands
  set
    status = case when success then 'done'::public.engine_command_status else 'failed'::public.engine_command_status end,
    completed_at = case when success then now() else completed_at end,
    failed_at = case when success then failed_at else now() end,
    error = case when success then null else error_message end,
    updated_at = now()
  where command_id = target_command_id
  returning * into updated;
  return updated;
end;
$$;

create or replace function app.record_engine_event(
  target_tenant_id uuid, target_instance_id uuid, target_type text,
  target_payload jsonb default '{}'::jsonb, target_event_id uuid default gen_random_uuid()
)
returns public.engine_events
language plpgsql security definer set search_path = public, app as $$
declare inserted public.engine_events;
begin
  insert into public.engine_events (tenant_id, instance_id, event_id, type, payload, status)
  values (target_tenant_id, target_instance_id, target_event_id, target_type, coalesce(target_payload, '{}'::jsonb), 'received')
  on conflict (event_id) do update set payload = excluded.payload, updated_at = now()
  returning * into inserted;
  return inserted;
end;
$$;

create or replace function app.update_instance_status(
  target_tenant_id uuid, target_instance_id uuid, target_status public.instance_status,
  target_phone text default null, target_qr_code text default null,
  target_engine_node text default null, target_metadata jsonb default '{}'::jsonb
)
returns public.instances
language plpgsql security definer set search_path = public, app as $$
declare updated public.instances;
begin
  update public.instances set
    status = target_status,
    phone = coalesce(target_phone, phone),
    qr_code = case when target_status = 'qr' then target_qr_code else null end,
    last_seen_at = now(),
    connected_at = case when target_status = 'connected' then coalesce(connected_at, now()) else connected_at end,
    disconnected_at = case when target_status in ('disconnected', 'blocked', 'error') then now() else disconnected_at end,
    engine_node = coalesce(target_engine_node, engine_node),
    metadata = metadata || coalesce(target_metadata, '{}'::jsonb),
    updated_at = now()
  where id = target_instance_id and tenant_id = target_tenant_id
  returning * into updated;
  return updated;
end;
$$;

create or replace function increment_template_uses(template_id uuid)
returns void language sql security definer as $$
  update templates set uses = uses + 1 where id = template_id;
$$;

-- ========== SEED: SYSTEM ORG + PLANS ==========

insert into public.organizations (id, tenant_id, name, slug, status, metadata)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'HUBFLOW System',
  'hubflow-system',
  'active',
  '{"system": true}'::jsonb
)
on conflict (id) do update set name = excluded.name, slug = excluded.slug;

insert into public.plans (tenant_id, code, name, stripe_price_id, limits, active, sort_order)
values
(
  '00000000-0000-0000-0000-000000000001', 'FREE', 'FREE', null,
  '{"whatsapp_instances":1,"contacts":250,"campaigns":0,"funnels":1,"uploads_mb":100,"team_members":1}'::jsonb,
  true, 10
),
(
  '00000000-0000-0000-0000-000000000001', 'ESSENCIAL', 'Essencial', null,
  '{"whatsapp_instances":1,"contacts":2000,"campaigns":10,"funnels":5,"uploads_mb":1024,"team_members":3}'::jsonb,
  true, 20
),
(
  '00000000-0000-0000-0000-000000000001', 'GROWTH', 'Growth', null,
  '{"whatsapp_instances":3,"contacts":10000,"campaigns":50,"funnels":20,"uploads_mb":5120,"team_members":10}'::jsonb,
  true, 30
),
(
  '00000000-0000-0000-0000-000000000001', 'PERFORMANCE_MAX', 'Performance Max', null,
  '{"whatsapp_instances":10,"contacts":100000,"campaigns":500,"funnels":100,"uploads_mb":51200,"team_members":50}'::jsonb,
  true, 40
)
on conflict (code) do update set
  name = excluded.name,
  limits = excluded.limits,
  active = excluded.active,
  sort_order = excluded.sort_order;

-- ============================================================
-- PRONTO! Schema completo aplicado.
-- Agora suba o app e rode: POST /api/admin/seed/dev
-- ============================================================
