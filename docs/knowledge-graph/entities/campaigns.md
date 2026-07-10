# Campaigns

**Type:** data

Campaigns are represented as a database table designed to manage and store information regarding marketing or operational initiatives. As a structural component of the system, this entity serves to track various communication initiatives that are executed for specific organizations or tenants.

Each campaign is strictly associated with a designated tenant, ensuring that data access and management remain restricted by tenant membership. Furthermore, these initiatives are linked to specific instances and funnels, providing a clear framework for how communications are directed and executed. Beyond basic storage, the table often manages metadata such as campaign status, allowing for the organized tracking of performance and progress. Additionally, the Campaigns entity acts as a central repository that can be associated with various messages, facilitating the integration of campaign data into broader operational or marketing workflows.

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
