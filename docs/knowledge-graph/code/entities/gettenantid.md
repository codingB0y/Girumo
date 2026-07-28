# GetTenantId

**Type:** method

A utility function that determines the tenant identifier associated with the current user by querying the memberships table.<SEP>A private helper function within Referrals.ts that retrieves the current tenant ID based on the authenticated user session.<SEP>An asynchronous function that retrieves the tenant identifier for the authenticated user session from memberships.

## Neighbors
- [[memberships|Memberships]]
- [[supabaseadmin|SupabaseAdmin]]
- [[getsessionaccountid|GetSessionAccountId]]
- [[listtemplates|ListTemplates]]
- [[createtemplate|CreateTemplate]]
- [[deletetemplate|DeleteTemplate]]
- [[referralsts|Referrals.ts]]
- [[ordersts|Orders.ts]]
- [[listorders|ListOrders]]
- [[addorder|AddOrder]]
- [[removeorder|RemoveOrder]]

## Appears in
- `apps » web » src » lib » stores » templates.ts`
- `apps » web » src » lib » stores » referrals.ts`
- `apps » web » src » lib » stores » orders.ts`
