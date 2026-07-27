# Engine

**Type:** organization

The Engine is a core software component and system service designed to handle backend processing, multi-tenant supervision, and the execution of specific tasks and operations. Functioning as a central subsystem within a project, the Engine is responsible for managing session states and processing commands, particularly within environments such as VPS or Coolify. It is engineered to perform critical system operations and is supported by an orphan supervisor or watchdog mechanism to ensure operational continuity.

To maintain system reliability, the Engine requires deterministic booting processes and consistent health checks. It operates as an active system component that monitors its own status while providing observability into its tasks. Furthermore, the Engine acts as an external system that facilitates system-wide coordination by providing regular heartbeat updates and comprehensive engine statistics to the session store. Through these integrated functions, the Engine serves as the foundation for backend task management and session oversight.

## Neighbors
- [[hubflow|Hubflow]]
- [[vercel|Vercel]]
- [[supabase|Supabase]]
- [[stripe|Stripe]]
- [[coolify|Coolify]]
- [[baileys|Baileys]]
- [[nodejs|Node.js]]
- [[sentry|Sentry]]
- [[gitleaks|Gitleaks]]
- [[pino|Pino]]
- [[docker|Docker]]
- [[upstash|Upstash]]
- [[lighthouse|Lighthouse]]
- [[redis|Redis]]
- [[smoke-command|Smoke Command]]
- [[service-role|Service-Role]]
- [[node|Node]]
- [[alpine|Alpine]]
- [[session-api-route|Session API Route]]
- [[engine-stats|Engine Stats]]

## Appears in
- `ROADMAP.md`
- `PRODUCTION_CHECKLIST.md`
- `PROJECT_CONTEXT.md`
- `GO_NO_GO.md`
- `apps » web » src » app » api » session » route.ts`
