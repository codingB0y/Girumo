-- Evolution API provider columns on instances.
--
-- instances is the WhatsApp account entity (status, phone, qr_code, tenant).
-- The Evolution migration maps each row to one Evolution instance:
--   provider             -> which engine backs this account ('evolution')
--   provider_instance_id -> the Evolution instanceName (format: gr_<instances.id>)
-- Webhook payloads are resolved back to a tenant via
-- (provider, provider_instance_id) — no tenant data leaks into the name.

alter table public.instances
  add column if not exists provider text not null default 'evolution',
  add column if not exists provider_instance_id text;

create unique index if not exists instances_provider_instance_uidx
  on public.instances (provider, provider_instance_id)
  where provider_instance_id is not null;

-- Evolution CONNECTION_UPDATE states map to instance_status:
--   connecting -> connecting, open -> connected, close -> disconnected
alter type public.instance_status add value if not exists 'connecting';

comment on column public.instances.provider is
  'WhatsApp engine backing this account. evolution = Evolution API v2.';
comment on column public.instances.provider_instance_id is
  'Provider-side instance identifier (Evolution instanceName, hf_<id>).';
comment on table public.engine_commands is
  'Single work queue consumed by the WhatsApp worker (apps/worker) against the Evolution API provider.';
