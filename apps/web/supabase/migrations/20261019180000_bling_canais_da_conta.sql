-- 2026-10-19 — Bling: os canais de venda da conta, com nome (GET /canais-venda: Yampi, Shopee...).
--
-- O motor relê a cada 24 h, como as situações, e o cartão mostra cada canal pelo nome para a loja tirar do Meta o
-- que já manda o evento (bling_connections.meta_skip_store_ids, 20261019160000). Pede o escopo "Canais de venda"
-- no app do Bling.
--   sales_channels    null = nunca lidos, ou o app sem o escopo (o cartão cai nos ids vistos nos pedidos);
--                     [] = a conta não tem canal. Itens: {id, nome, tipo, ativo}.
--   sales_channels_at a hora da última leitura (com ou sem o escopo); a reconexão volta a null (relê na hora).
--
-- Idempotente. A tabela já tem RLS sem policy e só service_role; as colunas novas herdam isso.
alter table public.bling_connections
  add column if not exists sales_channels jsonb,
  add column if not exists sales_channels_at timestamptz;

comment on column public.bling_connections.sales_channels is
  'Canais de venda da conta no Bling (GET /canais-venda): [{id, nome, tipo, ativo}]. null = nunca lidos ou o app sem o escopo.';
comment on column public.bling_connections.sales_channels_at is
  'Hora da última leitura dos canais (relê a cada 24 h; a reconexão volta a null).';
