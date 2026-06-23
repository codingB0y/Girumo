---
name: migration-start
description: Begin a zero-downtime schema migration using pgroll
---

# Start a migration

Begin a zero-downtime schema migration using pgroll.

## Usage

```bash
xata roll start <migration-file.yaml>
```

## Example

```bash
# Start the migration (expand phase)
xata roll start migrations/002_add_role.yaml

# Test your changes with both old and new schemas running
npm run dev
# ... verify everything works ...

# Complete the migration (contract phase)
xata roll complete
```

## How pgroll works

pgroll uses an **expand-contract pattern**:

### Expand phase (`xata roll start`)
- Creates new columns/tables
- Sets up views for both old and new schemas
- Installs triggers to keep both in sync
- Both versions of your app work simultaneously

### Contract phase (`xata roll complete`)
- Removes old schema views
- Drops sync triggers
- Cleans up

## Migration file format

pgroll migrations are YAML files with declarative operations:

```yaml
operations:
  - add_column:
      table: users
      column:
        name: role
        type: text
        nullable: false
        default: "'member'"
```

## Common operations

- `create_table` — Create a new table
- `add_column` — Add a column to existing table
- `drop_column` — Remove a column
- `rename_column` — Rename a column
- `alter_column` — Modify column properties
- `create_index` — Add an index

See [pgroll documentation](https://pgroll.com/docs/latest/operations) for all operations.

## Check migration status

```bash
xata roll status
```
