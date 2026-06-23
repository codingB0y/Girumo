---
name: migration-complete
description: Finish an ongoing migration by running the contract phase
---

# Complete a migration

Finish an ongoing migration by running the contract phase.

## Usage

```bash
xata roll complete
```

## When to use

Run this command **after** you have:
1. Started a migration with `xata roll start`
2. Tested that your application works with the new schema
3. Deployed application code that uses the new schema

## What happens

The contract phase:
- Removes the old schema views
- Drops synchronization triggers
- Cleans up temporary objects
- Finalizes the migration

## Checking status

Before completing, verify the migration state:

```bash
xata roll status
```

## Important

- Only run `complete` when you're confident the migration is successful
- If something is wrong, use `xata roll rollback` instead
- After completion, the migration cannot be rolled back
