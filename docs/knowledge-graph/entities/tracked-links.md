# Tracked Links

**Type:** data

A data collection for monitoring URL clicks, featuring slugs, target URLs, and click counts.<SEP>A database table storing URLs and slugs for link tracking.<SEP>A database table that tracks click metrics for specific URLs associated with campaign groups.<SEP>A database table storing tracked link data, requiring owner or admin roles for write access.

## Neighbors
- [[supabase|Supabase]]
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[linksjson|Links.json]]
- [[campaign-groups|Campaign Groups]]

## Appears in
- `migrate-json-to-supabase.ts`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
