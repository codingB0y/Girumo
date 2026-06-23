# TASKS

## Done
- Frontend mock (todas as telas) + pivô p/ aquisição.
- Link tracker REAL (/r/:slug, /api/links, store de arquivo, tela /links ligada).
- Engine PoC Baileys (QR, sessão, lista grupos, detecta entradas).
- Anti-ban seguro: fila (delays/lanes/governor/backoff/breaker) + warmup + group-guard + delivery-tracker.

- Ponte engine→app REAL: engine detecta entrada → POST /api/leads → lead persiste (leads.ndjson) → /leads lê real (fallback mock). E2E testado.
- Analytics de link: /api/links/[slug] + /links/[slug] (cliques por dia + origem UTM). E2E testado.

## In progress
- (nenhuma)

## Backlog (prioridade ↓)
1. Validar engine com número real (QR) → confirma entrada + sobrevivência.
2. Migrar store de arquivo → Postgres/Prisma (+ backend). Aí paralelizar com subagentes.
3. Multi-sessão (N números) + auth JWT multi-tenant.
4. Integração Meta Ads API (depois do kit manual validar).

## Nota: subagentes não escrevem neste ambiente (Write bloqueado) → build inline.
