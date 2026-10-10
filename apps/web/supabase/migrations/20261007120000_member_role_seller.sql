-- Acesso da vendedora, PR 2 (docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md §2):
-- papel novo 'seller'.
--
-- SOZINHA de propósito: valor novo de enum não pode ser usado na transação em que nasce
-- ("unsafe use of new value"). 20261007120100_acesso_vendedora.sql usa 'seller' num CHECK e
-- só roda depois desta commitada — aplicar em comandos separados, esta primeiro.
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).
-- Não muda a baseline: schema_signature() não vê valor de enum — conferir com
-- infra/tests/acesso-vendedora-check.sql (ok_enum_seller).

alter type public.member_role add value if not exists 'seller';
