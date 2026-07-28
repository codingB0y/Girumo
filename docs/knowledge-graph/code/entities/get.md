# GET

**Type:** method

GET is an asynchronous HTTP GET request handler and API route handler function utilized across various backend services to retrieve specific data, configurations, and system statuses. Depending on the context of the route it serves, GET functions perform several distinct operations.

As an API handler, GET is responsible for retrieving a list of schedules from either the legacy store or Supabase, returning a list of items from a collection, and providing platform settings fetched directly from the database. It also serves media bytes from specific API routes and executes health checks to return a JSON response containing the current system health status. 

Furthermore, GET functions serve as specialized HTTP request handlers dedicated to fetching subscription data, tenant webhook configuration data, and referral configuration data.<SEP>An API handler function that processes GET requests to retrieve welcome configurations for a tenant.<SEP>An asynchronous API route handler function for HTTP GET requests that returns click analytics data for a given link slug.<SEP>An API route handler method for retrieving group activity read by the panel.

## Neighbors
- [[getsupabaseadmin|GetSupabaseAdmin]]
- [[routets|Route.ts]]
- [[gettenantcontext|GetTenantContext]]
- [[getroutetenantcontext|GetRouteTenantContext]]
- [[request|Request]]
- [[response|Response]]
- [[supastore|SupaStore]]
- [[flowpageshealth|FlowPagesHealth]]
- [[crudroute|CrudRoute]]
- [[apps-web-src-app-api-webhooks-config-routets|Apps/web/src/app/api/webhooks/config/route.ts]]
- [[tenant_webhooks|Tenant_webhooks]]
- [[readmedia|ReadMedia]]
- [[apps-web-src-app-api-media-id-routets|Apps/web/src/app/api/media/[id]/route.ts]]
- [[uint8array|Uint8Array]]
- [[getreferralconfig|GetReferralConfig]]
- [[apps-web-src-app-api-referrals-config-routets|Apps/web/src/app/api/referrals/config/route.ts]]
- [[platform-settings|Platform Settings]]
- [[apps-web-src-app-api-admin-settings-routets|Apps/Web/Src/App/Api/Admin/Settings/Route.ts]]
- [[apps-web-src-app-api-welcome-routets|Apps/Web/Src/App/Api/Welcome/Route.ts]]
- [[getwelcome|GetWelcome]]
- [[getclickanalytics|GetClickAnalytics]]
- [[apps-web-src-app-api-links-slug-routets|Apps/web/src/app/api/links/[slug]/route.ts]]
- [[listactivity|ListActivity]]
- [[apps-web-src-app-api-activity-routets|Apps/web/src/app/api/activity/route.ts]]

## Appears in
- `apps » web » src » app » api » schedules » route.ts`
- `apps » web » src » app » api » subscription » route.ts`
- `apps » web » src » lib » crud-route.ts`
- `apps » web » src » app » api » webhooks » config » route.ts`
- `apps » web » src » app » api » media » [id] » route.ts`
- `apps » web » src » app » api » referrals » config » route.ts`
- `apps » web » src » app » api » admin » settings » route.ts`
- `apps » web » src » app » api » p » health » route.ts`
- `apps » web » src » app » api » welcome » route.ts`
- `apps » web » src » app » api » links » [slug] » route.ts`
- `apps » web » src » app » api » activity » route.ts`
