---
name: migration-rollback
description: Undo an in-progress migration that hasn't been completed yet
---

# Roll back a migration

Undo an in-progress migration that hasn't been completed yet.

## Usage

```bash
xata roll rollback
```

## When to use

Use rollback when:
- Tests fail after `xata roll start`
- You discover issues during the expand phase
- You need to modify the migration before proceeding

## What happens

The rollback:
- Reverses the expand phase changes
- Removes new columns/tables that were added
- Drops the synchronization triggers
- Restores the database to pre-migration state

## Important

- Rollback only works **before** `xata roll complete`
- Once a migration is completed, you need a new migration to undo changes
- No data loss occurs during rollback (pgroll preserves existing data)

## Checking status

See what migration is in progress:

```bash
xata roll status
```

## After rollback

You can:
- Modify your migration file and try again with `xata roll start`
- Abandon the migration entirely
- Switch to a different branch to continue other work
