-- Domínio próprio do lojista para os links de grupo
-- (docs/superpowers/specs/2026-10-04-dominio-proprio-design.md).
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json
-- (entrada nova t|custom_domains).

create table if not exists public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  hostname text not null,
  verification_token text not null,
  status text not null default 'pending' check (status in ('pending', 'active')),
  last_error text,
  checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  -- Um domínio por conta. Trocar = remover e cadastrar de novo.
  constraint custom_domains_tenant_unique unique (tenant_id),
  constraint custom_domains_hostname_minusculo check (hostname = lower(hostname))
);

comment on table public.custom_domains is
  'Subdomínio do lojista que serve /r, /c e /p dele. Ativo só depois da prova de posse por TXT (_girumo-verify) e da Vercel aceitar o host.';

-- Único SÓ entre ativos: com unique global, quem cadastrasse primeiro o
-- subdomínio de outra loja (sem conseguir provar posse) travaria o dono de
-- verdade. Pendentes coexistem; só quem tem o TXT chega a ativo. É também o
-- índice da consulta "de quem é este host" que roda a cada clique.
create unique index if not exists custom_domains_hostname_ativo
  on public.custom_domains (hostname) where status = 'active';

-- RLS como segunda linha: quem grava e lê é o servidor, com o tenant explícito.
alter table public.custom_domains enable row level security;
drop policy if exists "custom_domains_tenant_read" on public.custom_domains;
create policy "custom_domains_tenant_read" on public.custom_domains
  for select using (app.has_membership(tenant_id));

-- Só o servidor escreve: ativar um domínio decide qual tenant um host serve.
-- O event trigger de 20261004120000 já revoga isto em tabela nova; fica
-- explícito para não depender dele estar aplicado no banco.
revoke insert, update, delete, truncate on public.custom_domains from authenticated;
