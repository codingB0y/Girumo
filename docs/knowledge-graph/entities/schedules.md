# Schedules

**Type:** data

A data collection for automated tasks, containing campaign names, scheduling times, recurrence patterns, and status.<SEP>A database table managing the scheduling of tasks or events.<SEP>A database table that manages the timing and recurrence of broadcasts or campaign messages.<SEP>A database table storing schedule information, restricted by tenant membership.

## Neighbors
- [[supabase|Supabase]]
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[broadcasts|Broadcasts]]
- [[schedulesjson|Schedules.json]]
- [[campaign-messages|Campaign Messages]]

## Appears in
- `migrate-json-to-supabase.ts`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
