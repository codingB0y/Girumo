# Schedules

**Type:** artifact

A data collection for automated tasks, containing campaign names, scheduling times, recurrence patterns, and status.<SEP>A database table managing the scheduling of tasks or events.<SEP>A database table that manages the timing and recurrence of broadcasts or campaign messages.<SEP>A database table storing schedule information, restricted by tenant membership.<SEP>A database table used for storing generic scheduling information for tasks or broadcasts.<SEP>A database table intended to manage recurring or timed events and execution patterns.

## Neighbors
- [[supabase|Supabase]]
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[broadcasts|Broadcasts]]
- [[schedulesjson|Schedules.json]]
- [[campaign-messages|Campaign Messages]]
- [[campaign_messages|Campaign_Messages]]

## Appears in
- `migrate-json-to-supabase.ts`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
- `202607010001_groups_broadcasts_schedules.sql`
