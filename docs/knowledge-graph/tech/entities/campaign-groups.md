# Campaign Groups

**Type:** data

A database table categorizing campaigns into groups.<SEP>A logical grouping entity that categorizes campaign messages and tracked links.<SEP>Collections or segments of communication groups targeted for marketing or administrative campaigns.<SEP>A database table storing campaign group associations, requiring owner or admin roles for write access.<SEP>A database table storing campaign configurations used for routing and tracking links.<SEP>The database table where campaigns are actually recorded by the campaign route.

## Neighbors
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[broadcasts|Broadcasts]]
- [[tracked-links|Tracked Links]]
- [[campaigns|Campaigns]]
- [[campaign-messages|Campaign Messages]]
- [[routets|Route.ts]]

## Appears in
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
- `202607010001_groups_broadcasts_schedules.sql`
- `decisao-2026-08-18-campanha-402-plano-free-campaigns-zero`
