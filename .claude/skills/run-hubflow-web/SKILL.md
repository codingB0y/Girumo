---
name: run-hubflow-web
description: Build, run, test, drive, and verify the HubFlow web app — Next.js dev server, API smoke tests, curl-based verification, build check
---

# Run HubFlow Web

HubFlow Web is a Next.js 15 (App Router) multi-tenant SaaS at `apps/web/`. Auth is required for admin pages (email whitelist via `PLATFORM_ADMIN_EMAILS`). The **agent path** is the smoke script + curl-based API verification.

All paths relative to repo root.

## Prerequisites

- Node.js 20+ (confirmed v24.14.0)
- npm deps installed: `npm install` (monorepo root installs all workspaces)
- `apps/web/.env.local` configured with 18 vars (Supabase + Stripe)

## Build

```powershell
npm run web:build
```

Expect: `✓ Compiled successfully` — static pages prerendered, dynamic routes marked `ƒ`.

**Gotcha:** If dev server is running, build may fail with webpack-runtime conflict. Kill node first.

## Run (agent path) — Smoke Script

Primary verification:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -c 'cd apps/web && bash ../../.claude/skills/run-hubflow-web/smoke.sh'
```

Or from Git Bash:

```bash
cd apps/web && bash ../../.claude/skills/run-hubflow-web/smoke.sh
```

The script: starts dev server on port 3099 → waits for ready → tests health/auth/public endpoints → reports pass/fail → kills server.

### Manual curl verification (dev server already running)

```powershell
# Start server
Set-Location apps/web
cmd /c 'npx next dev --port 3099'
```

In another terminal:

```powershell
# Health (no auth needed)
(Invoke-WebRequest http://localhost:3099/api/health -UseBasicParsing).Content | ConvertFrom-Json | Format-List
# Expected: status=ok, database=ok, planCount=4

# Admin pages (require auth → 307)
(Invoke-WebRequest http://localhost:3099/admin -UseBasicParsing -MaximumRedirection 0 -ErrorAction SilentlyContinue).StatusCode
# Expected: 307

# Admin API (require auth → 401)
try { Invoke-WebRequest http://localhost:3099/api/admin/settings -UseBasicParsing } catch { $_.Exception.Response.StatusCode.Value__ }
# Expected: 401

# Public pages
(Invoke-WebRequest http://localhost:3099/login -UseBasicParsing).StatusCode
# Expected: 200
```

## Run (human path)

```powershell
npm run web:dev
# Open http://localhost:3000 in browser
# Admin: http://localhost:3000/admin (needs email in PLATFORM_ADMIN_EMAILS)
```

## Test

```powershell
npm run web:lint
```

No test framework (Vitest/Playwright) configured yet. Lint is the automated check.

## Key Endpoints

| Endpoint | Auth | Expected |
|----------|------|----------|
| `GET /api/health` | None | 200 — `{"status":"ok"}` |
| `GET /admin` | Session | 307 redirect without auth |
| `GET /api/admin/settings` | Session (admin) | 401 without auth |
| `POST /api/admin/tenants/[id]/actions` | Session (admin) | 401 without auth |
| `GET /login` | None | 200 |
| `GET /signup` | None | 200 |

## Gotchas

- **Auth guard = email whitelist.** Set `PLATFORM_ADMIN_EMAILS=your@email.com` in `.env.local`. Not DB roles.
- **Admin uses `getSupabaseAdmin()` (service_role key)** — bypasses RLS. Never use `getSupabase()` (anon) in admin routes.
- **Dev server + build conflict.** Can't coexist. Kill dev server before building: `taskkill /F /IM node.exe`.
- **Windows `npx` not directly runnable via `node`.** Use `cmd /c 'npx next ...'` or Git Bash. The `.bin/next` shim is a shell script, not valid JS.
- **Billing page needs `STRIPE_SECRET_KEY`** — shows graceful fallback "Stripe não conectado" if missing.
- **First request after cold start takes ~12s** (Next.js compiling). Health endpoint responds faster on subsequent hits.
- **Lint has 3 non-blocking warnings** (unused vars in configuracoes, tenant-actions, bento-card). Not errors.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `npx` via `Start-Process` or `node .bin/next` fails with SyntaxError | Use `cmd /c 'npx next ...'` on Windows |
| Build fails with `Cannot find module webpack-runtime.js` | Kill dev server, `rm -rf apps/web/.next`, rebuild |
| Health returns `database: degraded` | Check `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` |
| `/admin` returns 307 in browser | Not logged in with whitelisted email |
| Port 3099 already in use | `Get-NetTCPConnection -LocalPort 3099` → `Stop-Process -Id <PID>` |
| Build shows 0 errors but lint has warnings | Warnings are non-blocking; build still succeeds |
