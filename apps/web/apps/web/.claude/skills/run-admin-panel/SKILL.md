---
name: run-admin-panel
description: Build, run, test, and verify the HubFlow admin panel — dev server, API routes, smoke tests, build check
---

# Run Admin Panel

The HubFlow admin panel is a Next.js 15 App Router app at `apps/web/`. It requires auth (platform_admin email whitelist) so pages return 307 without a session. The **agent path** is the smoke script + curl-based API verification.

All paths below are relative to `apps/web/`.

## Prerequisites

- Node.js 18+ (confirmed working with 20.x)
- npm dependencies installed: `npm install`
- `.env.local` with Supabase + Stripe keys configured (18 vars)
- Supabase project linked (`supabase/.temp/project-ref` exists)

## Build

```bash
cd apps/web
rm -rf .next
npx next build
```

Expect: `✓ Compiled successfully` + `✓ Generating static pages (38/38)`.

**Gotcha:** If dev server is running simultaneously, build may fail with `Cannot find module '../../webpack-runtime.js'`. Kill the dev server first (`taskkill //F //IM node.exe` on Windows).

## Run (agent path) — Smoke Script

The primary verification tool:

```bash
bash .claude/skills/run-admin-panel/smoke.sh
```

This runs: build → start dev server → verify API routes → verify auth guard → check health → cleanup.

Output: pass/fail summary with colored output.

### Manual curl verification (dev server running)

Start the server:

```bash
npx next dev --port 3099 &
sleep 12
```

Verify:

```bash
# Health (no auth needed)
curl -s http://localhost:3099/api/health | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('status='+d.status+', db='+d.checks.database+', plans='+d.checks.planCount)"
# Expected: status=ok, db=ok, plans=4

# Admin pages (require auth → 307 redirect)
curl -s -o /dev/null -w '%{http_code}' http://localhost:3099/admin
# Expected: 307

# Admin API (require auth → 401)
curl -s http://localhost:3099/api/admin/settings
# Expected: {"error":"Nao autenticado."}

# Public pages (no auth)
curl -s -o /dev/null -w '%{http_code}' http://localhost:3099/login
# Expected: 200
```

## Run (human path)

```bash
cd apps/web
npx next dev
# Open http://localhost:3000/admin in browser
# Login with email in PLATFORM_ADMIN_EMAILS env var
```

## Test

```bash
npx next lint
```

No test framework configured yet (Vitest/Playwright pending).

## Key Files

| Path | Purpose |
|------|--------|
| `src/app/admin/layout.tsx` | Admin layout — auth guard + sidebar + topbar + breadcrumbs |
| `src/app/admin/page.tsx` | Dashboard — KPIs, alerts, recent tenants/users |
| `src/app/admin/tenants/page.tsx` | Tenants list — server-side pagination |
| `src/app/admin/tenants/[id]/page.tsx` | Tenant detail — actions (suspend/activate/delete) |
| `src/app/admin/billing/page.tsx` | Billing — Stripe real invoices + MRR |
| `src/app/admin/logs/page.tsx` | Logs — server-side pagination + filters |
| `src/app/api/admin/tenants/[id]/actions/route.ts` | Tenant actions API |
| `src/app/api/admin/settings/route.ts` | Platform settings CRUD API |
| `src/lib/admin-guard.ts` | Auth: email whitelist via `PLATFORM_ADMIN_EMAILS` |
| `src/components/admin/sidebar.tsx` | Sidebar — desktop + mobile drawer |

## Gotchas

- **Auth guard uses email whitelist**, not DB roles. Set `PLATFORM_ADMIN_EMAILS=your@email.com` in `.env.local`.
- **Admin uses `getSupabaseAdmin()` (service_role key)** — bypasses RLS for cross-tenant queries. Never use `getSupabase()` (anon) in admin pages.
- **Dev server + build conflict:** Can't run both simultaneously. The `.next` cache gets corrupted. Kill dev server before building.
- **Billing page calls Stripe API** — if `STRIPE_SECRET_KEY` is missing/invalid, it shows a graceful fallback ("Stripe não conectado") instead of crashing.
- **Migrations:** If `platform_settings` or `agent_configs` tables don't exist, pages show helpful SQL creation hints inline.
- **Windows:** Use `taskkill //F //IM node.exe` to kill dev server (no `kill` or `lsof`).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails with `Cannot find module webpack-runtime.js` | Kill dev server, `rm -rf .next`, rebuild |
| `/admin` returns 307 in browser | Not logged in. Use email from `PLATFORM_ADMIN_EMAILS` |
| `api/admin/*` returns `{"error":"Nao autenticado."}` | No session cookie. Login first at `/login` |
| Health shows `database: degraded` | Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` |
| Billing shows "Stripe não conectado" | Set valid `STRIPE_SECRET_KEY` in `.env.local` |
