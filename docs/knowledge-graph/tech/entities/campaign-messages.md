# Campaign Messages

**Type:** artifact

A database table tracking messages sent within campaigns.<SEP>A database table storing details about message campaigns, including body text, scheduling information, and status.<SEP>Content templates and message bodies associated with specific campaign groups.<SEP>A database table storing campaign message data, restricted by tenant membership.<SEP>A database table defining specific message content, media, and scheduling details for campaigns.

## Neighbors
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[schedules|Schedules]]
- [[campaign-groups|Campaign Groups]]

## Appears in
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
- `202607010001_groups_broadcasts_schedules.sql`
