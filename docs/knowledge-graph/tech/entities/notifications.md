# Notifications

**Type:** data

A database table designed to store in-app notifications, containing details such as identifier, tenant association, user association, type, title, body, link, read status, and creation timestamp.

## Neighbors
- [[organizations|Organizations]]
- [[users|Users]]
- [[row-level-security|Row Level Security]]
- [[idx_notifications_tenant_unread|Idx_Notifications_Tenant_Unread]]
- [[idx_notifications_user|Idx_Notifications_User]]
- [[authusers|Auth.Users]]

## Appears in
- `202607010010_notifications.sql`
