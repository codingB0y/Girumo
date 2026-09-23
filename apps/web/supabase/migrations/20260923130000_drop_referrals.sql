-- 2026-09-23 - Remove a feature de indicação/referral (programa de indicadoras)
-- do produto, a pedido do usuário: considerada desnecessária, sem uso real.
-- RLS policies e índices somem em cascata com o DROP TABLE.
drop table if exists public.referrals;
drop table if exists public.referral_configs;
