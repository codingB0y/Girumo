# Subscriptions

**Type:** data

A database table managing subscription details, linked to Stripe customer identifiers.<SEP>A database table managing the relationship between organizations and their chosen subscription plans.<SEP>A database table tracking organizational subscriptions.<SEP>A database table managing user subscriptions, associated with Stripe customer identifiers.<SEP>Manages the subscription state of organizations, linking them to specific plans and Stripe billing information.<SEP>A database table linking organizations to specific service plans.

## Neighbors
- [[organizations|Organizations]]
- [[plans|Plans]]
- [[signup-api-route|Signup API Route]]

## Appears in
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `apps » web » src » app » api » auth » signup » route.ts`
