-- Admin da plataforma passa a ser identidade (auth_user_id), não string de e-mail.
--
-- Antes: `admin-guard.ts` comparava o e-mail do usuário logado contra a env
-- PLATFORM_ADMIN_EMAILS, com fallback hardcoded. Como o signup cria conta com
-- `email_confirm: true` sem verificar posse do endereço, qualquer e-mail da
-- allowlist ainda não cadastrado podia ser registrado por terceiro — que virava
-- super-admin das rotas /admin. Amarrar em auth_user_id fecha o vetor: o id só
-- existe depois que a conta existe, e não é adivinhável.
--
-- Idempotente. RLS ligada sem policy = deny-all para anon/authenticated; o acesso
-- é só por service-role (que bypassa RLS), igual ao resto das rotas admin.

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
-- A página /admin/configuracoes nunca chamou a rota, o editor que a consumia foi
-- deletado, nenhum código lê a tabela para decidir comportamento, e ela tem 0 linhas
-- em dev e prod. Mantê-la só sugere no mapa do sistema uma configuração que não existe.
drop table if exists public.platform_settings;
