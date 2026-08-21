-- Admin da plataforma passa a ser identidade (auth_user_id), não string de e-mail.
--
-- Antes: `admin-guard.ts` autorizava comparando o e-mail do usuário logado contra
-- a env `PLATFORM_ADMIN_EMAILS`. Como o signup cria conta com `email_confirm: true`
-- sem verificar posse do endereço, qualquer e-mail da allowlist ainda não cadastrado
-- podia ser registrado por terceiro — que virava super-admin das rotas /admin.
-- Amarrar em `auth_user_id` fecha o vetor: o id só existe depois que a conta existe,
-- e não é adivinhável.
--
-- Idempotente. RLS ligada sem policy = deny-all para anon/authenticated; o acesso é
-- só por service-role (que bypassa RLS), igual ao resto das rotas admin.
--
-- ATENÇÃO — a tabela nasce VAZIA de propósito, e o guard falha fechado. Ambiente
-- novo não tem admin nenhum até alguém ser semeado por SQL. Isso é o lado seguro
-- de falhar, mas significa que semear vem ANTES do deploy do código que lê a tabela.

create table if not exists public.platform_admins (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

comment on table public.platform_admins is
  'Super-admins da plataforma. Autorização de /admin é por auth_user_id; a coluna email é só rótulo para leitura humana.';
comment on column public.platform_admins.email is
  'Rótulo informativo no momento do cadastro. NUNCA usar como critério de autorização.';

alter table public.platform_admins enable row level security;

-- platform_settings: órfã dos dois lados desde o refactor de dead-code de 06/07/2026.
-- Verificado em 17/08/2026 por SQL nos dois bancos: 0 linhas em dev e em prod, e o
-- único código que a tocava era `/api/admin/settings`, que não tinha um chamador em
-- todo o `apps/web/src` — rota e tabela saem juntas neste PR. Mantê-la só sugeriria
-- no mapa do sistema uma configuração de plataforma que não existe.
drop table if exists public.platform_settings;
