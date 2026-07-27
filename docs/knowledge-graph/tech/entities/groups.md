# Groups

**Type:** artifact

A table within the Supabase database containing information about WhatsApp groups.<SEP>A database table managing groups organized by tenant.<SEP>Digital representations of communication groups, such as WhatsApp groups, managed by tenants.<SEP>A database table storing group information, requiring owner or admin roles for write access.<SEP>A database table representing WhatsApp groups associated with a specific tenant.<SEP>A database table for managing generic collections or groups within the system.

## Neighbors
- [[tenant|Tenant]]
- [[migrate-json-to-supabasets|Migrate-json-to-supabase.ts]]
- [[organizations|Organizations]]

## Appears in
- `migrate-json-to-supabase.ts`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
- `202607010001_groups_broadcasts_schedules.sql`
