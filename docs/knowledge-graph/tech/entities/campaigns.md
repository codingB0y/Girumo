# Campaigns

**Type:** data

Campaigns serve as an entity within the system representing marketing or operational communication initiatives. These initiatives are executed through specific instances and funnels, allowing for targeted outreach aligned with organizational goals. By associating these campaigns with messages, the entity provides a structured approach to managing and tracking various communication efforts across an organization.

In a technical context, Campaigns are managed as a database table dedicated to storing comprehensive campaign data. This table is designed to maintain strict data segregation and operational control by being tied to specific tenants. Each entry within this database is restricted by tenant membership, ensuring that campaign information remains isolated and secure for each respective organization. Furthermore, the system tracks these campaigns based on their operational status, allowing for the effective monitoring and management of the campaign lifecycle from inception to execution.

## Neighbors
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[instances|Instances]]
- [[funnels|Funnels]]
- [[messages|Messages]]
- [[app|App]]
- [[campaign-groups|Campaign Groups]]

## Appears in
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
