# Engine Commands

**Type:** data

A database table storing commands for the engine with status tracking and unique identifiers.<SEP>Instructions or tasks queued for the engine to execute in relation to specific instances.<SEP>A database table for system engine commands.<SEP>A database table for managing internal engine command execution and status.<SEP>A database table that tracks commands issued to engines, including status, payloads, and completion timestamps.<SEP>A database table storing engine commands, restricted by tenant membership.

## Neighbors
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[instances|Instances]]
- [[app|App]]

## Appears in
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
