# Subscriptions

**Type:** data

Subscriptions are represented as a database table, specifically within a Supabase database, designed to manage and track the relationship between tenants and their respective billing plans. This table serves as the central repository for storing detailed subscription information, ensuring that each tenant is linked to a specific plan and that their current service status is accurately maintained.

Functionally, the Subscriptions table categorizes the status of these plans, identifying whether a subscription is active, trialing, free, or past due. Beyond simple status tracking, the table is responsible for managing critical administrative details, including the tracking of trial expiration dates to ensure timely transitions. Furthermore, it integrates with external billing infrastructure by storing essential identifiers, such as Stripe customer IDs, which are necessary for processing and reconciling payments against the tenant's chosen plan. By aggregating these records, the system provides a comprehensive overview of tenant billing cycles and subscription health.<SEP>A database table containing subscription records cleared during the database reset.<SEP>A database table storing tenant subscription statuses, plans, and Stripe identifiers.<SEP>A database table storing tenant subscription statuses.<SEP>A database table recording tenant subscription details and statuses.

## Neighbors
- [[supabase|Supabase]]
- [[tenant|Tenant]]
- [[plans|Plans]]
- [[routets|Route.ts]]
- [[get|Get]]
- [[organizations|Organizations]]
- [[entitlementsts|Entitlements.ts]]
- [[route-handler|Route Handler]]
- [[admindashboardpage|AdminDashboardPage]]
- [[admintenantdetailpage|AdminTenantDetailPage]]
- [[email-notification-system|Email Notification System]]
- [[reset-route|Reset Route]]

## Appears in
- `apps » web » src » lib » billing » entitlements.ts`
- `apps » web » src » app » api » admin » tenants » [id] » actions » route.ts`
- `apps » web » src » app » api » billing » portal » route.ts`
- `apps » web » src » app » admin » page.tsx`
- `apps » web » src » app » api » admin » seed » route.ts`
- `apps » web » src » app » admin » tenants » [id] » page.tsx`
- `apps » web » src » app » api » cron » emails » route.ts`
- `apps » web » src » app » api » subscription » route.ts`
- `apps » web » src » app » api » admin » dev-tools » reset » route.ts`
- `apps » web » src » app » admin » billing » page.tsx`
- `apps » web » src » app » api » admin » tenants » bulk » route.ts`
- `apps » web » src » app » api » auth » callback » route.ts`
