# TECH_DEBT

- **Persistência em arquivo** (links.json/clicks.ndjson) — sem concorrência real nem queries.
  Migrar p/ Postgres/Prisma. Risco: corrida de escrita em volume alto.
- **Dados mock** em todas as telas exceto /links — substituir por API real conforme backend nasce.
- **Engine single-session** — produto exige multi-sessão (N números). Reescrever gestão de sessão.
- **Sem auth** — app é aberto; falta JWT + multi-tenant.
- **Sem backend** — lógica hoje em route handlers do Next; mover p/ NestJS quando crescer.
- **Atribuição estimada** (Caminho A) — entrada↔anúncio não é exata. Aceito por decisão.
