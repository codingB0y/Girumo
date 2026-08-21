# Baileys

**Type:** artifact

Baileys is a software library, module, messaging engine, and custom technical base integrated into architectures like Hubflow to handle communication processes, messaging functionalities, and WhatsApp integration. Functioning as an underlying WhatsApp web API client library, Baileys is utilized for socket connections, WhatsApp web automation, and executing WhatsApp-related commands, serving as the underlying connection library and engine operated by the business as well as by platforms such as the Evolution API. Within the Hubflow-Engine, it provides single-session and multi-session capabilities supporting multi-device sessions and multi-instance setups.

Technically, Baileys is implemented as an ESM package and software dependency that is explicitly loaded via `import()` during an asynchronous bootstrap function. As a decoupled and separate service, it is deployed in environments like VPS, Coolify, and Docker, maintaining distinct separation from the frontend and API. It operates as a messaging engine session component organized around commands and events by tenant ID and instance ID, with implementation details including use in the current engine Proof of Concept with multi-file auth state, local session storage, and a legacy messaging session implementation.

Regarding session management and security, Baileys requires strict security versioning. Session data for the technology and library is stored in Docker volumes, and sessions must never be committed to Git. Furthermore, versioned sessions managed by the library require rotation or disconnection before any online deployment.<SEP>A legacy engine that claims broadcasts and contains a complete group creation executor.

## Neighbors
- [[hubflow|Hubflow]]
- [[vercel|Vercel]]
- [[hubflow-engine|Hubflow-Engine]]
- [[coolify|Coolify]]
- [[engine|Engine]]
- [[hubflow-engine|HubFlow Engine]]
- [[hubflow|HubFlow]]
- [[hubflow-github|Hubflow GitHub]]
- [[engine-baileys|Engine Baileys]]
- [[nodejs|Node.js]]
- [[hubflow-engine|Hubflow Engine]]
- [[auth|Auth/솥]]
- [[vps|VPS]]
- [[docker|Docker]]
- [[supabase-postgres|Supabase Postgres]]
- [[engine-atual|Engine Atual]]
- [[hubflow-engine-auth|Hubflow Engine Auth]]
- [[hubflow-engine-auth|Hubflow-engine/auth/]]
- [[post-api-instances|POST /api/instances]]
- [[hubflow-engine|Hubflow-engine]]
- [[hubflow|HUBFLOW]]
- [[engine-boot-e-node-pinado-implementation-plan|Engine Boot e Node Pinado Implementation Plan]]
- [[indexjs|Index.js]]
- [[esm|ESM]]
- [[git|Git]]
- [[cloud-api|Cloud Api]]
- [[evolution-api|Evolution Api]]
- [[evolution-api|Evolution API]]
- [[group-grow-storets|Group-grow-store.ts]]

## Appears in
- `DEPLOY_ONLINE_RUNBOOK.md`
- `PRODUCTION_CHECKLIST.md`
- `PROJECT_CONTEXT.md`
- `GO_NO_GO.md`
- `deploy » coolify » README.md`
- `deploy » github » README.md`
- `docs » ARQUITETURA_MIGRACAO_HUBFLOW.md`
- `docs » FASE_7_DEPLOY.md`
- `AUDIT_REPORT.md`
- `INFRA_AUDIT.md`
- `docs » FASE_2_PLANO_DE_MIGRACAO.md`
- `docs » FASE_6_ENGINE.md`
- `docs » FASE_1_AUDITORIA_CODIGO_ATUAL.md`
- `docs » superpowers » plans » 2026-07-03-engine-boot-node.md`
- `docs » FASE_8_CHECKLIST_PRODUCAO.md`
- `docs » superpowers » specs » 2026-07-03-engine-boot-node-design.md`
- `ENGINE_ANALYSIS.md`
- `achado-2026-08-10`
