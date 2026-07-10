# Instances

**Type:** artifact

Instances is a comprehensive entity represented as a database table designed to store, track, and manage various operational deployments and system components associated with an organization. As a central repository, this entity captures information regarding specific service instances, engine nodes, and application deployments, serving as a critical reference point for messages, system logs, and engine-related commands.

Within the scope of its functionality, the Instances entity plays a vital role in tenant management by tracking individual tenant instances alongside their current operational status. It acts as a registry for communication and messaging nodes, specifically encompassing WhatsApp service instances linked to an organization. In this capacity, it monitors essential metrics such as connectivity status and the specific assignment of engine nodes to these services.

Furthermore, the Instances entity serves as a management layer for organizational infrastructure, ensuring that deployment instances are maintained under defined security policies. By consolidating data on both infrastructure deployment and communication architecture, it provides a unified view of the operational nodes and services that facilitate an organization's digital operations.

## Neighbors
- [[organizations|Organizations]]
- [[update_instance_status|Update_Instance_Status]]
- [[campaigns|Campaigns]]
- [[messages|Messages]]
- [[engine-commands|Engine Commands]]
- [[engine-events|Engine Events]]
- [[app|App]]
- [[logs|Logs]]

## Appears in
- `202606240005_engine_rpc.sql`
- `202606240001_base_schema.sql`
- `202606240002_rls_policies.sql`
- `02_indexes_triggers.sql`
- `01_tables.sql`
