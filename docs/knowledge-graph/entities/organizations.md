# Organizations

**Type:** organization

Organizations serves as a core database entity and a primary table within the application schema of the Supabase database. Functioning as the central tenant or business entity within the Hubflow system, it represents the primary owner of various data records, including instances, funnels, and campaigns.

As a fundamental component of the system architecture, the Organizations table stores essential information required to manage distinct institutional or business tenants. This data includes unique tenant identifiers, slugs, and comprehensive metadata. Furthermore, the entity tracks the status of each organization and retains specific creation details, ensuring effective management and ownership tracking of all associated resources throughout the platform.<SEP>A database table representing organizations to which tenants belong.<SEP>An entity representing an organization that owns notifications within the multi-tenant system.

## Neighbors
- [[tenant|Tenant]]
- [[uploads|Uploads]]
- [[migrate-json-to-supabasets|Migrate-json-to-supabase.ts]]
- [[instances|Instances]]
- [[funnels|Funnels]]
- [[campaigns|Campaigns]]
- [[contacts|Contacts]]
- [[users|Users]]
- [[memberships|Memberships]]
- [[subscriptions|Subscriptions]]
- [[set_organization_tenant_id|Set_organization_tenant_id]]
- [[auth_users|Auth_users]]
- [[engine-events|Engine Events]]
- [[messages|Messages]]
- [[logs|Logs]]
- [[plans|Plans]]
- [[engine_commands|Engine_Commands]]
- [[engine_events|Engine_Events]]
- [[campaign-messages|Campaign Messages]]
- [[schedules|Schedules]]
- [[tracked-links|Tracked Links]]
- [[admin-alerts|Admin Alerts]]
- [[templates|Templates]]
- [[orders|Orders]]
- [[referrals|Referrals]]
- [[referral-configs|Referral Configs]]
- [[testimonials|Testimonials]]
- [[groups|Groups]]
- [[campaign-groups|Campaign Groups]]
- [[broadcasts|Broadcasts]]
- [[funnel-events|Funnel Events]]
- [[engine-commands|Engine Commands]]
- [[agent-configs|Agent Configs]]
- [[tenant_webhooks|Tenant_webhooks]]
- [[notifications|Notifications]]

## Appears in
- `migrate-json-to-supabase.ts`
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `202607010011_tenant_webhooks.sql`
- `202607010010_notifications.sql`
