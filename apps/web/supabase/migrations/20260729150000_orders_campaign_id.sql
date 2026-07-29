-- Atribuição de R$ por campanha (P2.18) — orders ganha campaign_id.
--
-- Inferido do lead quando o pedido nasce de um lead: o lead traz source_campaign
-- (nome/slug da campanha de origem), resolvido pro id da campanha no momento do
-- registro. Pedido sem lead (ou sem match) fica null → "sem origem".
--
-- Plain uuid nullable, sem FK — mesmo padrão do orders.lead_id (denormalizado,
-- como group_name já é). Não referencia campaign_groups pra não acoplar.

alter table orders add column if not exists campaign_id uuid;

create index if not exists idx_orders_campaign on orders(tenant_id, campaign_id);
