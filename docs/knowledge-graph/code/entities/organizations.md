# Organizations

**Type:** data

Organizations is a crucial database table schema and system entity that serves as a central repository for managing tenant-related information within the system, specifically functioning within the Supabase database. As a core collection of data, Organizations represents the tenants that own or utilize AI agent configurations, storing organization and tenant names created during user registration. 

The structure of the Organizations table encompasses several key attributes necessary for comprehensive tenant identification and management. It maintains unique identifiers for each organization, along with their respective names and slugs, which serve as descriptive, URL-friendly identifiers. Furthermore, the table records the operational status of each tenant—providing clarity on whether an account is active or otherwise categorized—and stores suspension timestamps alongside tenant statuses. 

In addition to descriptive metadata and organizational details, the Organizations table tracks temporal information by storing creation timestamps for each entry. By consolidating details such as IDs, names, slugs, statuses, and creation metadata, the table enables robust administration, retrieval of organization names based on tenant identifiers, and general tracking of organizations or tenants linked to WhatsApp instances. Additionally, it contains organization records that are designated to be cleared during a database reset.

## Neighbors
- [[supabase|Supabase]]
- [[tenant|Tenant]]
- [[memberships|Memberships]]
- [[instances|Instances]]
- [[users|Users]]
- [[get|Get]]
- [[adminlogspage|AdminLogsPage]]
- [[adminalertaspage|AdminAlertasPage]]
- [[route-handler|Route Handler]]
- [[admindashboardpage|AdminDashboardPage]]
- [[subscriptions|Subscriptions]]
- [[admintenantdetailpage|AdminTenantDetailPage]]
- [[getsupabaseadmin|getSupabaseAdmin]]
- [[agent_configs|Agent_configs]]
- [[reset-route|Reset Route]]
- [[admininstanciaspage|AdminInstanciasPage]]
- [[apps-web-src-app-admin-usuarios-pagetsx|Apps/web/src/app/admin/usuarios/page.tsx]]

## Appears in
- `apps » web » src » app » admin » logs » page.tsx`
- `apps » web » src » app » admin » alertas » page.tsx`
- `apps » web » src » app » api » admin » tenants » [id] » actions » route.ts`
- `apps » web » src » app » api » admin » tenants » list » route.ts`
- `apps » web » src » app » admin » page.tsx`
- `apps » web » src » app » api » admin » seed » route.ts`
- `apps » web » src » app » admin » tenants » [id] » page.tsx`
- `apps » web » src » lib » route-tenant-context.ts`
- `apps » web » src » app » admin » agentes » page.tsx`
- `apps » web » src » app » api » admin » dev-tools » reset » route.ts`
- `apps » web » src » app » admin » instancias » page.tsx`
- `apps » web » src » app » admin » billing » page.tsx`
- `apps » web » src » app » api » admin » tenants » bulk » route.ts`
- `apps » web » src » app » admin » usuarios » page.tsx`
- `apps » web » src » app » api » auth » callback » route.ts`
