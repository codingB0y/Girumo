# SupaStore

**Type:** artifact

SupaStore is a comprehensive data access layer and service module designed to facilitate interaction with Supabase databases within an application. Functioning as a centralized interface for managing various data entities, it serves as the primary gateway for performing update and delete operations, as well as general data management tasks.

The module encompasses several specialized functions tailored to different operational domains. It is explicitly responsible for managing campaign groups, including group-related data storage and organization. Furthermore, SupaStore acts as a dedicated handler for campaign messages and executes tenant-specific operations, ensuring data integrity across distinct environments. 

Beyond its general data management capabilities, SupaStore includes functionality for schedule-related operations and broadcast-related data processing. Specifically, it is imported from the project path @/lib/stores/broadcasts, positioning it as an integral component for handling broadcast functions whenever Supabase integration is active. By consolidating these disparate storage and communication requirements into a single service, SupaStore provides a unified structure for database interaction and backend logic.

## Neighbors
- [[supabase|Supabase]]
- [[routets|Route.ts]]
- [[tenantid|TenantId]]
- [[group|Group]]
- [[response|Response]]
- [[campaigngroup|CampaignGroup]]
- [[get|GET]]
- [[post|POST]]
- [[delete|DELETE]]
- [[campaignmessage|CampaignMessage]]
- [[ackbroadcast|AckBroadcast]]
- [[delete|Delete]]
- [[broadcast|Broadcast]]

## Appears in
- `apps » web » src » app » api » campanhas » route.ts`
- `apps » web » src » app » api » schedules » route.ts`
- `apps » web » src » app » api » campanhas » [slug] » messages » route.ts`
- `apps » web » src » app » api » groups » route.ts`
- `apps » web » src » app » api » dispatch » ack » route.ts`
- `apps » web » src » app » api » broadcasts » route.ts`
- `apps » web » src » app » api » dispatch » pending » route.ts`
