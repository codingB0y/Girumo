-- Checklist de ativação da aba Início.
--
-- Os cinco passos continuam DERIVADOS dos dados (conectou? sincronizou grupos?
-- criou campanha? teve clique? captou contato?) — não há espelho de estado aqui.
-- O banco guarda só as duas coisas que os dados não sabem responder:
--
--   onboarding_dismissed_at  o lojista fechou o card. Sem isso o "fechar" morria
--                            no reload, que era o comportamento do skipOnboarding
--                            em useState.
--   onboarding_completed_at  quando os cinco acenderam pela primeira vez. Serve
--                            de marco (tempo signup → ativação) e evita reabrir o
--                            card se um sinal oscilar depois.
--
-- Idempotente. A tabela já tem RLS + policy por tenant; colunas novas herdam.

alter table public.tenant_settings
  add column if not exists onboarding_dismissed_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.tenant_settings.onboarding_dismissed_at is
  'Quando o lojista fechou o checklist de ativação da Início. Null = ainda visível.';
comment on column public.tenant_settings.onboarding_completed_at is
  'Quando os 5 passos de ativação ficaram completos pela primeira vez.';
