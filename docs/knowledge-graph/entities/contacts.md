# Contacts

**Type:** data

Contacts represent the individuals or entities that interact with a system and are associated with a specific organization. Within the system, these entities serve to identify users or stakeholders for communication and messaging purposes, holding essential identity details such as names, phone numbers, and email addresses.

From a technical perspective, Contacts are defined as a database table specifically designed to store this contact information. The architecture of this table is structured to support multi-tenancy, as the data is strictly restricted by tenant membership and indexed by both tenant and email. By organizing information in this manner, the system ensures that contact details are securely managed and effectively retrieved within the context of the respective organization or tenant.

## Neighbors
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[messages|Messages]]
- [[app|App]]

## Appears in
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
