-- Revogação de sessão (item L6 da auditoria de 06/08/2026).
--
-- O cookie `dz_session` vale 30 dias e, até aqui, o logout só apagava o cookie
-- do navegador: o token continuava válido até expirar sozinho. Se vazasse, não
-- havia como invalidar.
--
-- Desenho por USUÁRIO, não por sessão: guardamos o instante a partir do qual os
-- tokens daquele auth_user passam a ser recusados. Revogar é escrever `now()`;
-- todo token com `iat` anterior morre de uma vez. Resolve o caso real ("vazou,
-- derruba tudo") sem precisar registrar cada sessão emitida. "Sair só deste
-- dispositivo" fica de fora de propósito — exigiria guardar sessão a sessão.
--
-- Sem tenant_id: a sessão é do auth_user, que pode ter membership em mais de um
-- tenant. Revogar vale para todos, que é o comportamento desejado.

create table if not exists public.session_revocations (
  auth_user_id uuid primary key,
  -- Tokens emitidos ANTES deste instante são recusados.
  revoked_before timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.session_revocations is
  'Corte de validade de sessão por usuário: token com iat < revoked_before é recusado.';

alter table public.session_revocations enable row level security;

-- Deny-all de propósito: só o service-role (que bypassa RLS) lê e escreve.
-- Nenhum cliente anon/authenticated tem motivo para tocar nesta tabela, e uma
-- policy permissiva aqui viraria um jeito de descobrir quem foi desconectado.
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.session_revocations'::regclass
      and polname = 'session_revocations_deny_all'
  ) then
    create policy session_revocations_deny_all
      on public.session_revocations
      for all
      using (false)
      with check (false);
  end if;
end $$;
