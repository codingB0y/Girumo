# ARCHITECTURE

Dois projetos separados no Desktop:

## 1. devzap-groups (Next.js 16, App Router, TS, Tailwind v4)
- Frontend SaaS. Hoje: telas de aquisição com dados MOCK (`src/lib/mock-data.ts`).
- **Real**: rastreador de links — `/r/[slug]` (redirect+conta clique), `/api/links` (GET/POST),
  store em arquivo (`src/lib/store.ts` → `data/links.json` + `data/clicks.ndjson`).
- Telas: dashboard, groups, acquisition, links (real), leads, campaigns(broadcast), templates,
  schedules, reports, settings, login.

## 2. devzap-engine (Node ESM, Baileys 7) — PoC isolado
- Conexão QR + sessão persistida (`auth/`), lista grupos, detecta entradas (`group-participants.update`).
- Anti-ban (seguro): `anti-ban-queue.js` (delays gaussianos, lanes, governor, backoff, breaker),
  `warmup.js`, `group-guard.js`, `delivery-tracker.js`.

## Fluxo alvo
Anúncio Meta → link `/r/:slug` (conta clique) → entra no grupo → engine detecta entrada →
casa com clique recente (Caminho A) → lead no app → realimenta campanha.

## Planejado (ainda não existe)
Backend NestJS+Prisma+Postgres (migrar store de arquivo), filas BullMQ, multi-sessão (N números),
auth JWT multi-tenant, ponte engine→app (POST de entrada).
