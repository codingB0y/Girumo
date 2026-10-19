-- 2026-10-19 — Bling: canais de venda fora do Meta (pedido do Igor: loja com Yampi, que já manda a compra ao Meta).
--
-- O pedido do Bling traz o canal de venda (`loja.id`); o retrato (bling_orders.snapshot) passa a guardá-lo como
-- `lojaId`, sem coluna nova. Aqui só a lista, por loja, dos canais cujos pedidos não mandam evento ao Meta: a venda
-- continua em orders, na origem e nas listas; o Purchase e o InitiateCheckout dela ficam com status 'desligado'.
--
-- Idempotente. Sem CHECK: o PATCH do cartão limita a 50 inteiros positivos (zod). A tabela já tem RLS sem policy e
-- só service_role; a coluna nova herda isso.
alter table public.bling_connections
  add column if not exists meta_skip_store_ids bigint[] not null default '{}';

comment on column public.bling_connections.meta_skip_store_ids is
  'Canais de venda do Bling (loja.id) cujos pedidos não mandam evento ao Meta: o canal (Yampi...) já manda. A venda segue na Girumo.';
