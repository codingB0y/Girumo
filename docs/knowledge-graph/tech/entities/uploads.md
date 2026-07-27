# Uploads

**Type:** artifact

Uploads represent a multi-faceted architectural component within the system, serving both as a storage mechanism and a tracking repository for media content and files. In its physical storage capacity, the Uploads entity is structured as a storage bucket designed for the management of user-uploaded files. To maintain data integrity and security, these buckets must be explicitly configured as private, adhering to specific access policies that govern how content is stored and retrieved within the environment.

Beyond the storage layer, Uploads function as a critical database structure utilized to track and manage file or data upload records. This database table acts as a central registry that records essential information associated with each file, including metadata, file paths, and MIME types. The system links these records directly to specific tenants, organizations, and individual users, ensuring that all uploaded content is properly associated with its origin. Furthermore, the Uploads database component includes specific functionality to track updates made to these records, providing a comprehensive audit trail and management system for the entire lifecycle of file and media content stored within the system.<SEP>A database table storing upload information, restricted by tenant membership.<SEP>A storage bucket in Supabase used to store files managed by the Hubflow application.

## Neighbors
- [[supabase|Supabase]]
- [[tenant|Tenant]]
- [[organizations|Organizations]]
- [[users|Users]]
- [[app|App]]
- [[storageobjects|Storage.Objects]]
- [[storagebuckets|Storage.Buckets]]

## Appears in
- `apply-order.md`
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `202606240004_storage_policies.sql`
- `01_tables.sql`
- `03_rls_policies.sql`
- `deploy » supabase » README.md`
