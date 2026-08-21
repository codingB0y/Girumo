# Orders

**Type:** data

A database table storing order information related to tenants.<SEP>Records of customer transactions or sales associated with specific tenants and groups.<SEP>A database table storing order information, restricted by tenant membership.<SEP>A database table established via migration 20260701030000.<SEP>Existing table and store for orders, tracking values, lead IDs, and group names.<SEP>Backend infrastructure and database table storing order information including value, phone, lead ID, and group.<SEP>Orders data table that gains a nullable campaign_id inferred from lead sourceCampaign.

## Neighbors
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[campaigns|Campaigns]]
- [[migration-20260701030000|Migration 20260701030000]]
- [[api-orders|Api/Orders]]
- [[contatos|Contatos]]
- [[lead|Lead]]

## Appears in
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
- `decisao-2026-07-29`
- `IMPLEMENTATION_PLAN.md`
