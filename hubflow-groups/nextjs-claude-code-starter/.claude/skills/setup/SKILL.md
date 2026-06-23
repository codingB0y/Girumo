---
name: setup
description: Connect this project to your Xata account, initialize pgroll and run migrations
---

# Setup Xata project

Connect this project to your Xata account and database.

## Steps

1. Authenticate with Xata (if not already logged in):
   ```bash
   xata auth login
   ```

2. Initialize the project:
   ```bash
   xata init
   ```
   Follow the prompts to select your organization, project and branch.

3. Get the connection string:
   ```bash
   xata branch url
   ```

4. Create `.env.local` with the connection string:
   ```bash
   echo "DATABASE_URL=<paste connection string>" > .env.local
   ```

5. Initialize pgroll (one-time setup):
   ```bash
   xata roll init
   ```

6. Run all migrations:
   ```bash
   xata roll start migrations/001_create_users.yaml
   xata roll complete
   xata roll start migrations/002_add_role.yaml
   xata roll complete
   xata roll start migrations/003_add_teams.yaml
   xata roll complete
   ```

7. Verify the setup:
   ```bash
   psql $(xata branch url) -c "SELECT * FROM users;"
   ```

## Notes

- The `xata init` command creates a `.xata` folder with configuration
- Connection strings include credentials — never commit `.env.local`
- `xata roll init` only needs to run once per database
