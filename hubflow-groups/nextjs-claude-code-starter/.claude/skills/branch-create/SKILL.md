---
name: branch-create
description: Create an isolated database branch for feature development
---

# Create a database branch

Create an isolated database branch for feature development.

## Usage

```bash
xata branch create --name <branch-name>
xata branch wait-ready <branch-name>
```

## Example

```bash
# Create a branch for a new feature
xata branch create --name feature/user-roles

# Wait for the branch to be ready
xata branch wait-ready feature/user-roles

# Get the connection string for the new branch
xata branch url feature/user-roles

# Update .env.local with the new connection string
```

## How it works

Xata branches use **copy-on-write** technology:
- Branch creation is instant (regardless of database size)
- Storage is shared with the parent until data diverges
- Each branch has its own connection string
- Branches can automatically hibernate when inactive

## Best practices

- Use descriptive branch names: `feature/`, `fix/`, `experiment/`
- Delete branches when done: `xata branch delete --name <branch-name>`
- Use `xata branch list` to see all branches
- Use `xata branch tree` for a visual hierarchy

## Switching branches

To work with a different branch, update `DATABASE_URL` in `.env.local`:

```bash
# Get connection string for a specific branch
xata branch url <branch-name>
```
