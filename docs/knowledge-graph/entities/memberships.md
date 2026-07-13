# Memberships

**Type:** artifact

Memberships is a database table located within the public schema that serves as a foundational structure for managing user associations within a system. Its primary purpose is to link individual users to specific organizations or tenants, thereby establishing and validating their access to organizational data.

By defining the relationship between users and these entities, the Memberships table functions as a central authority for assigning and tracking user roles and access levels. In addition to managing active user associations, the table is responsible for overseeing membership records and handling pending invitations, ensuring that role-based permissions are consistently applied across all relevant tenants.<SEP>A database table that maps users to tenants and defines their roles.

## Neighbors
- [[hubflow|Hubflow]]
- [[organizations|Organizations]]
- [[users|Users]]
- [[auth_users|Auth_users]]
- [[user_id|User_id]]
- [[memberships_tenant_invited_email_pending_unique|Memberships_tenant_invited_email_pending_unique]]
- [[owners-and-admins-manage-webhooks|Owners and Admins Manage Webhooks]]

## Appears in
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `202606240006_membership_invites.sql`
- `202607010011_tenant_webhooks.sql`
- `202607010010_notifications.sql`
- `202607010001_groups_broadcasts_schedules.sql`
