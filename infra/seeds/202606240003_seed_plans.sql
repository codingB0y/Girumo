-- HUBFLOW - Fase 4 - Plan catalog seed
-- Apply after schema and RLS. Use a privileged Supabase SQL context.

insert into public.organizations (id, tenant_id, name, slug, status, metadata)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'HUBFLOW System',
  'hubflow-system',
  'active',
  '{"system": true}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  metadata = excluded.metadata;

insert into public.plans (tenant_id, code, name, stripe_price_id, limits, active, sort_order)
values
(
  '00000000-0000-0000-0000-000000000001',
  'FREE',
  'FREE',
  null,
  '{
    "whatsapp_instances": 1,
    "contacts": 250,
    "campaigns": 0,
    "funnels": 1,
    "uploads_mb": 100,
    "team_members": 1
  }'::jsonb,
  true,
  10
),
(
  '00000000-0000-0000-0000-000000000001',
  'ESSENCIAL',
  'Essencial',
  null,
  '{
    "whatsapp_instances": 1,
    "contacts": 2000,
    "campaigns": 10,
    "funnels": 5,
    "uploads_mb": 1024,
    "team_members": 3
  }'::jsonb,
  true,
  20
),
(
  '00000000-0000-0000-0000-000000000001',
  'GROWTH',
  'Growth',
  null,
  '{
    "whatsapp_instances": 3,
    "contacts": 10000,
    "campaigns": 50,
    "funnels": 20,
    "uploads_mb": 5120,
    "team_members": 10
  }'::jsonb,
  true,
  30
),
(
  '00000000-0000-0000-0000-000000000001',
  'PERFORMANCE_MAX',
  'Performance Max',
  null,
  '{
    "whatsapp_instances": 10,
    "contacts": 100000,
    "campaigns": 500,
    "funnels": 100,
    "uploads_mb": 51200,
    "team_members": 50
  }'::jsonb,
  true,
  40
)
on conflict (code) do update set
  name = excluded.name,
  stripe_price_id = excluded.stripe_price_id,
  limits = excluded.limits,
  active = excluded.active,
  sort_order = excluded.sort_order;
