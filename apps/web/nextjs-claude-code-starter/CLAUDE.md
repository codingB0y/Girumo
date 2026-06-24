# Next.js + Xata Starter

## Xata CLI

This project uses Xata for Postgres database management. Key commands:

- `xata auth login` — authenticate
- `xata init` — link project to Xata (creates `.xata/` config)
- `xata branch url` — get connection string for current branch
- `xata checkout <branch>` — switch active branch
- `xata roll init` — one-time pgroll setup (required before first migration)
- `xata roll start <file>` — begin expand phase (both old and new schemas live)
- `xata roll complete` — contract phase (finalize migration)
- `xata roll rollback` — undo expand phase
- `xata roll status` — check migration progress
- `xata branch create --name <name>` — create branch (uses `--name` flag)
- `xata branch wait-ready <name>` — wait for branch (positional arg, NOT `--name`)
- `xata clone start --source-url <url>` — clone with PII anonymization

## Project structure

- `migrations/` — pgroll YAML migration files (001, 002, 003)
- `src/lib/db.ts` — database connection and query helpers
- `src/app/page.tsx` — main page showing users and teams
- `.env.local` — contains `DATABASE_URL` (never commit this)

## Database schema

After all migrations:
- `users` table: id, email, name, role, team_id, created_at
- `teams` table: id, name, created_at
- Foreign key: users.team_id → teams.id

## Environment

- `DATABASE_URL` — Xata Postgres connection string from `xata branch url`

## Conventions

- Run `xata roll init` before first migration on any new database
- Always `xata branch wait-ready` after `xata branch create`
- Migration files use YAML format, not JSON
