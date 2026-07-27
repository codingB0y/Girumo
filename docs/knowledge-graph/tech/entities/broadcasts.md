# Broadcasts

**Type:** artifact

Broadcasts is a centralized database table within the Supabase architecture designed to store, manage, and track mass communications and bulk messaging campaigns. Serving as a core data entity for the system’s outreach infrastructure, it functions as a repository for records of message distributions, ensuring that broadcast operations are systematically organized and linked to specific schedules.

This table captures comprehensive details regarding each broadcast, including relevant media information, precise timing configurations, and the delivery status of the messages. To support multi-tenant environments, the Broadcasts entity is structured to be restricted by tenant membership, ensuring that communications are securely isolated according to organizational boundaries.

Beyond initial distribution, Broadcasts acts as a tracking mechanism for outgoing communications sent to specific target audiences or designated campaign groups. By recording the status and engagement metrics associated with these operations, the table enables system administrators to monitor the efficacy and reach of their messaging efforts, facilitating the management of large-scale communication cycles from initiation through delivery.

## Neighbors
- [[supabase|Supabase]]
- [[tenant|Tenant]]
- [[migrate-json-to-supabasets|Migrate-json-to-supabase.ts]]
- [[organizations|Organizations]]
- [[broadcastsjson|Broadcasts.json]]
- [[schedules|Schedules]]
- [[campaign-groups|Campaign Groups]]

## Appears in
- `migrate-json-to-supabase.ts`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
- `202607010001_groups_broadcasts_schedules.sql`
