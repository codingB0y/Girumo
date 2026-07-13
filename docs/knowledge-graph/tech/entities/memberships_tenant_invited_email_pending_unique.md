# Memberships_tenant_invited_email_pending_unique

**Type:** artifact

A unique index on the memberships table ensuring that pending invites are unique per tenant and email address.

## Neighbors
- [[memberships|Memberships]]
- [[user_id|User_id]]
- [[tenant_id|Tenant_id]]
- [[invited_email|Invited_email]]
- [[accepted_at|Accepted_at]]

## Appears in
- `202606240006_membership_invites.sql`
