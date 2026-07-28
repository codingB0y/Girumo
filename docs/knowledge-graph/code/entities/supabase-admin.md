# Supabase Admin

**Type:** artifact

Supabase Admin is a specialized administrative interface and client service designed to provide elevated access to the Supabase backend infrastructure. As a powerful tool for developers and administrators, it facilitates direct interaction with the underlying database, allowing for the execution of administrative queries and the management of critical application data.

Functioning as a robust database client, Supabase Admin enables precise control over various architectural layers. It serves as a primary point of contact for interacting with the application’s storage layer and is frequently utilized to manage and query specific database tables, such as those housing membership records and referral data.

Beyond direct table manipulation, Supabase Admin acts as a comprehensive service for overseeing account-level operations. It provides necessary visibility into subscription details, service plans, and real-time usage metrics. By consolidating these administrative and analytical capabilities into a single interface, Supabase Admin streamlines the management of both the data layer and the operational status of a Supabase project.<SEP>An administrative client instance retrieved via getSupabaseAdmin to interact with the database.

## Neighbors
- [[supabase|Supabase]]
- [[logs|Logs]]
- [[memberships|Memberships]]
- [[instances|Instances]]
- [[routets|Route.ts]]
- [[templates|Templates]]
- [[postgrest|PostgREST]]
- [[database-status|Database Status]]
- [[templates-count|Templates Count]]
- [[entitlementsts|Entitlements.ts]]
- [[tracked-linksts|Tracked-links.ts]]
- [[resolvetenantid|ResolveTenantId]]
- [[schedulests|Schedules.ts]]
- [[referralsts|Referrals.ts]]
- [[referrals-table|Referrals Table]]
- [[referral-configs-table|Referral Configs Table]]
- [[reset-route|Reset Route]]

## Appears in
- `apps » web » src » app » api » instances » route.ts`
- `apps » web » src » lib » pages » store.ts`
- `apps » web » src » lib » billing » entitlements.ts`
- `apps » web » src » lib » stores » tracked-links.ts`
- `apps » web » src » app » api » media » route.ts`
- `apps » web » src » app » api » groups » route.ts`
- `apps » web » src » lib » stores » schedules.ts`
- `apps » web » src » lib » stores » referrals.ts`
- `apps » web » src » app » api » admin » dev-tools » reset » route.ts`
