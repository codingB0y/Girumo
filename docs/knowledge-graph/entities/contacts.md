# Contacts

**Type:** data

Contacts represent both a functional database structure and a logical entity within the system. As a database table, the Contacts entity is responsible for storing comprehensive contact information, including names, phone numbers, and email addresses. This data is structured to be indexed by specific tenants and email addresses, ensuring that access is restricted by tenant membership to maintain data isolation across different organizational environments.

From a conceptual perspective, the Contacts entity identifies the individuals or external entities that interact with the system. By housing detailed identity information, the entity facilitates essential communication and messaging workflows. Each entry is explicitly associated with an organization, serving as a foundational component for managing and retrieving the contact details necessary for ongoing system interactions and organizational outreach.

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
