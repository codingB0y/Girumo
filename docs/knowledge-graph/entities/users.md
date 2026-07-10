# Users

**Type:** person

Users are defined in two primary contexts: as authorized individuals interacting with the system and as a specific database table architecture within the application schema.

As individuals, Users are registered participants within the authentication system who perform specific actions, such as creating uploads or appearing as distinct actors in system logs. These individuals are identified by unique user IDs and are responsible for interacting with the system, including the receipt and management of notifications. Users are typically associated with specific organizations and may have their account status, contact information, and authentication credentials tracked to facilitate their activity.

Within the application’s database schema, Users refer to a dedicated table designed to store comprehensive account and profile information. This table serves as the primary repository for user data, linking individual profiles to their respective authentication identifiers and organizational affiliations. By centralizing account details and authentication links, the Users table enables the system to maintain accurate records of each registered individual's identity, permissions, and status, thereby supporting the broader functionality of the application.

## Neighbors
- [[uploads|Uploads]]
- [[organizations|Organizations]]
- [[logs|Logs]]
- [[memberships|Memberships]]
- [[auth_users|Auth_users]]
- [[notifications|Notifications]]

## Appears in
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
- `202607010010_notifications.sql`
