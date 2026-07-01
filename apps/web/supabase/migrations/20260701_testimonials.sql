-- Testimonials table for collecting and displaying real customer reviews.
-- Depoimentos ficam pending até admin aprovar.

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  store text not null default '',
  quote text not null,
  rating smallint not null default 5 check (rating between 1 and 5),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_testimonials_approved on testimonials(approved) where approved = true;

alter table testimonials enable row level security;

-- Tenants can insert their own testimonials
create policy "Tenants insert own testimonials"
  on testimonials for insert
  with check (tenant_id::text = current_setting('request.jwt.claims', true)::jsonb->>'tenant_id');

-- Anyone can read approved testimonials (public landing page)
create policy "Public read approved testimonials"
  on testimonials for select
  using (approved = true);

-- Service role full access
create policy "Service role full access testimonials"
  on testimonials for all
  using (current_setting('role', true) = 'service_role');
