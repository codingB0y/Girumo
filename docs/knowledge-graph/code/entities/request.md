# Request

**Type:** artifact

A Request is a standard web interface object used to represent an incoming HTTP request within the application’s API framework. It serves as the primary mechanism for receiving, managing, and structuring data sent to various API route handlers, ensuring that information is consistently formatted and accessible for processing. By acting as a unified structure for incoming traffic, the Request object facilitates essential communication between the client and the server, accommodating both GET and POST methods depending on the specific operational requirements of the route.

In the context of POST operations, the Request object is frequently utilized to handle client-provided data transmitted within the request body. This includes sensitive or functional information such as user credentials for login, payloads for squad creation, details for order creation or deletion, and specific mission or dispatch progress data. Furthermore, these POST requests often carry essential headers, such as bearer tokens, and specific identifiers like membership invitation IDs, which are necessary for authentication and process authorization.

In GET operations, the Request object is employed to manage and transmit the URL parameters required for executing specific functional tasks, such as cancellation operations. By consolidating URL parameters and request body content into a single interface, the Request object provides a reliable structure that enables route handlers to efficiently retrieve the data necessary to perform their intended tasks. Across all implementations, the Request object remains a fundamental component for maintaining the flow of data within the API architecture.<SEP>A web API request object processed by the GET route function.

## Neighbors
- [[routets|Route.ts]]
- [[tenantid|TenantId]]
- [[cancelmessage-route|CancelMessage Route]]
- [[squad-os-missions-api|Squad-Os Missions API]]
- [[api-route|Api Route]]
- [[optout-api-route|Optout API Route]]
- [[squad-os|Squad-Os]]
- [[accept-invitation-api|Accept Invitation API]]
- [[post|POST]]
- [[delete|DELETE]]
- [[login-route|Login Route]]
- [[getroutetenantcontext|getRouteTenantContext]]
- [[gettenantcontext|getTenantContext]]
- [[get|GET]]

## Appears in
- `apps » web » src » app » api » groups » grow » pending » route.ts`
- `apps » web » src » app » api » p » [slug] » route.ts`
- `apps » web » src » app » api » campanhas » [slug] » messages » cancel » route.ts`
- `apps » web » src » app » api » squad-os » missions » route.ts`
- `apps » web » src » app » api » squad-os » decisions » route.ts`
- `apps » web » src » app » api » instances » route.ts`
- `apps » web » src » app » api » optout » route.ts`
- `apps » web » src » app » api » dispatch » ack » route.ts`
- `apps » web » src » app » api » squad-os » squads » route.ts`
- `apps » web » src » app » api » members » accept » route.ts`
- `apps » web » src » app » api » dispatch » pending » route.ts`
- `apps » web » src » lib » crud-route.ts`
- `apps » web » src » app » api » auth » login » route.ts`
- `apps » web » src » lib » route-tenant-context.ts`
- `apps » web » src » app » api » orders » route.ts`
- `apps » web » src » app » api » media » [id] » route.ts`
