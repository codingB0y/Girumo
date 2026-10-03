-- Teste grátis de 7 dias com cartão (spec 2026-10-03).
--
-- As duas colunas moram em organizations pelo mesmo motivo do stripe_customer_id:
-- subscriptions tem unique(tenant_id) e é sobrescrita por todo evento do webhook,
-- então nada que precise sobreviver a uma assinatura pode morar lá.
--
--   trial_subscription_id  — a assinatura do Stripe que consumiu o teste desta conta.
--                            Nulo = nunca testou. É o id (e não um booleano) para o
--                            webhook saber qual de dois checkouts simultâneos venceu.
--   trial_card_fingerprint — o cartão do teste. O índice único é a trava
--                            "um teste por cartão" entre contas diferentes.
alter table public.organizations
  add column if not exists trial_subscription_id text,
  add column if not exists trial_card_fingerprint text;

create unique index if not exists organizations_trial_card_fingerprint_key
  on public.organizations (trial_card_fingerprint)
  where trial_card_fingerprint is not null;
