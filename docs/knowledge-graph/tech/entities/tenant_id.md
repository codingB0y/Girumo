# Tenant_id

**Type:** concept

An identifier for the tenant associated with a membership record.<SEP>A unique identifier used to associate records with specific tenants, required for validating memberships.<SEP>A unique identifier representing a tenant within the membership and tracked links systems.<SEP>An identifier used to scope data per tenant.<SEP>A metadata identifier required for saving subscription records properly.

## Neighbors
- [[stripe|Stripe]]
- [[publictracked_links|Public.tracked_links]]
- [[memberships_tenant_invited_email_pending_unique|Memberships_tenant_invited_email_pending_unique]]
- [[has_membership|Has_membership]]

## Appears in
- `202606240006_membership_invites.sql`
- `03_rls_policies.sql`
- `202607010001_groups_broadcasts_schedules.sql`
- `decisao-2026-08-11`
- `apps » web » src » lib » billing » stripe-webhook.test.ts`
