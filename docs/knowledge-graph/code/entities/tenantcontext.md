# TenantContext

**Type:** concept

A utility function that retrieves the current tenant's context and authentication information from the request.<SEP>Information identifying the specific tenant associated with an API request.<SEP>A data object containing contextual information about the tenant, such as the unique tenant identifier and user role.<SEP>A utility function used to extract contextual information about a tenant, including authUserId, email, and role.<SEP>A data type structure containing authUserId, email, tenantId, and role for a tenant.

## Neighbors
- [[routets|Route.ts]]
- [[assertbillingrole|AssertBillingRole]]
- [[api|Api]]
- [[tenantcontextts|TenantContext.ts]]

## Appears in
- `apps » web » src » app » api » members » route.ts`
- `apps » web » src » app » api » campanhas » route.ts`
- `apps » web » src » app » api » auth » account » route.ts`
- `apps » web » src » lib » supabase » tenant-context.ts`
