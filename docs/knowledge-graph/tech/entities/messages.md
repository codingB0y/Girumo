# Messages

**Type:** data

Represent communication records sent or received within the system, linked to instances, campaigns, and contacts.<SEP>A database table storing communication records associated with specific tenants.<SEP>A database table for message records.<SEP>A database table storing communication logs or message records.<SEP>A database table storing communication logs, indexed by tenant and creation time.<SEP>A database table that logs communication activity, including direction, status, and payload between instances, campaigns, and contacts.<SEP>A database table storing message information, restricted by tenant membership.

## Neighbors
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[instances|Instances]]
- [[campaigns|Campaigns]]
- [[contacts|Contacts]]
- [[app|App]]

## Appears in
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
