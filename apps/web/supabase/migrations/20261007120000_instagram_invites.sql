-- Convite nominal do add-on Instagram: desconto na implementação, uma loja,
-- uso único, 7 dias (docs/superpowers/specs/2026-10-07-instagram-assinatura-design.md §5–6).
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json
-- (entrada nova t|instagram_invites).

create table if not exists public.instagram_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  -- Só o SHA-256 (hex) do token: o link sai uma vez, na resposta de "Gerar".
  token_hash text not null,
  discount_percent integer not null check (discount_percent between 0 and 100),
  -- Cupom da Stripe restrito ao produto Implementação; nulo quando o desconto é 0%.
  stripe_coupon_id text,
  expires_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_at timestamptz,
  stripe_subscription_id text,
  constraint instagram_invites_token_hash_unique unique (token_hash)
);

comment on table public.instagram_invites is
  'Convite nominal do add-on Instagram gerado no admin: desconto de 0 a 100% na implementação, uso único, validade de 7 dias.';

-- Um convite aberto por loja: gerar outro revoga o anterior antes.
create unique index if not exists instagram_invites_um_aberto_por_loja
  on public.instagram_invites (tenant_id) where revoked_at is null and used_at is null;

-- RLS como segunda linha: quem grava e lê é o servidor, com o tenant explícito.
alter table public.instagram_invites enable row level security;
drop policy if exists "instagram_invites_tenant_read" on public.instagram_invites;
create policy "instagram_invites_tenant_read" on public.instagram_invites
  for select using (app.has_membership(tenant_id));

-- Só o servidor escreve. O event trigger de 20261004120000 já revoga isto em
-- tabela nova; fica explícito para não depender dele estar aplicado no banco.
revoke insert, update, delete, truncate on public.instagram_invites from authenticated;
