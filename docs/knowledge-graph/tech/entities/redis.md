# Redis

**Type:** artifact

Redis is a distributed in-memory data store, database, caching technology, and message broker service that serves various operational and architectural roles. It functions as an optional tool primarily utilized for engine operations, handling keys, optional queues, locks, throughput, and workers. Additionally, Redis is employed for rate-limiting and analytics. 

While certain parts of the infrastructure currently do not utilize Redis—relying instead on in-memory mechanisms for rate-limiting and analytics—it is actively acknowledged, planned, or maintained as a future scaling option for these capabilities. Redis is strictly intended for caching, queuing, locks, and rate-limiting, and is not meant to store canonical business data.<SEP>An optional tool mentioned for handling queues, locks, and idempotent events.<SEP>An optional in-memory data store for the multi-instance engine.<SEP>An optional caching and queue system used for the engine.<SEP>A technology used for operations, queues, locks, and idempotency.<SEP>Optional dependency for queues, locks, and workers.<SEP>An in-memory data store that remains optional for the engine.

## Neighbors
- [[hubflow|Hubflow]]
- [[hubflow-engine|Hubflow-Engine]]
- [[engine|Engine]]
- [[upstash|Upstash]]
- [[supabase-postgres|Supabase Postgres]]
- [[infra_auditmd|INFRA_AUDIT.md]]
- [[engine-command|Engine Command]]
- [[engine-event|Engine Event]]
- [[engine-baileys|Engine Baileys]]
- [[hubflow-engine|Hubflow Engine]]
- [[supflow-engine|Supflow-Engine]]
- [[hubflow-platform|HubFlow-platform]]

## Appears in
- `ROADMAP.md`
- `PRODUCTION_CHECKLIST.md`
- `PROJECT_CONTEXT.md`
- `docs » ARQUITETURA_MIGRACAO_HUBFLOW.md`
- `INFRA_AUDIT.md`
- `docs » FASE_2_PLANO_DE_MIGRACAO.md`
- `docs » FASE_6_ENGINE.md`
- `docs » FASE_1_AUDITORIA_CODIGO_ATUAL.md`
