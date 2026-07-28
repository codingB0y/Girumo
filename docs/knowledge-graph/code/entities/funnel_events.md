# Funnel_events

**Type:** data

A database table recording events within a tenant's funnel, targeted for deletion when a tenant is deleted.<SEP>A database table that stores funnel event records including tenant IDs, user IDs, and event names.

## Neighbors
- [[route-handler|Route Handler]]
- [[trackfunnelevent|TrackFunnelEvent]]
- [[getfunnelmetrics|GetFunnelMetrics]]

## Appears in
- `apps » web » src » app » api » admin » tenants » [id] » actions » route.ts`
- `apps » web » src » lib » analytics » funnel-events.ts`
