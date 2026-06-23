---
name: clone-production
description: Clone a production database with automatic PII anonymization
---

# Clone production database

Clone a production database with automatic PII anonymization.

## Usage

```bash
# Configure anonymization rules
xata clone config --source-url <production-connection-string>

# Run the clone
xata clone start --source-url <production-connection-string>
```

## Example workflow

```bash
# 1. Set up your production connection string
export PROD_URL="postgres://user:pass@prod-host:5432/mydb"

# 2. Configure what gets anonymized (interactive)
xata clone config --source-url $PROD_URL --mode=prompt

# 3. Run the clone
xata clone start --source-url $PROD_URL

# 4. Connect to your anonymized copy
psql $(xata branch url)
```

## Auto-detected PII columns

Xata automatically detects and anonymizes columns named:
- `email` → fake emails
- `name`, `first_name`, `last_name` → fake names
- `phone` → fake phone numbers
- `ssn` → masked SSN
- `address` → fake addresses
- And more...

## Custom transforms

Edit `.xata/clone.yaml` to customize:

```yaml
tables:
  users:
    columns:
      email:
        transform: email
      custom_field:
        transform: redact
```

## Available transforms

- `email` — Generate fake email
- `name` — Generate fake name
- `phone` — Generate fake phone
- `address` — Generate fake address
- `redact` — Replace with `[REDACTED]`
- `hash` — One-way hash (preserves uniqueness)
- `null` — Set to NULL

## Why this matters for AI apps

- Debug with real data distributions
- Test edge cases only production reveals
- Maintain referential integrity across tables
- Stay compliant with privacy regulations

## Tips

- Use a read-replica connection string if available
- Avoid pooler/pgbouncer endpoints (clone uses long transactions)
- Review `.xata/clone.yaml` before running in CI/CD
