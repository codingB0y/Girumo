# Lane: Banco / API

**Pasta:** `devzap-groups` · **Foco:** a "cola" entre engine e frontend. Route handlers, persistência,
auth, regra de negócio do servidor e os **contratos**. Hoje store em arquivo; futuro Postgres/Prisma.

## Você MEXE em
- `src/app/api/**/route.ts` — todos os endpoints (leads, groups, session, activity, welcome, optout,
  dispatch[/pending][/ack], media, campanhas, broadcasts, templates, schedules, links, orders, referrals,
  ad-campaigns, auth) + `src/app/r/[slug]/route.ts`.
- `src/lib/*-store.ts` — leads, groups, orders, referrals, schedules, optout, welcome, activity, media,
  campanhas, dispatch, session, store, clicks-analytics.
- Infra de dados: `src/lib/json-collection.ts`, `src/lib/atomic-fs.ts`, `src/lib/crud-route.ts`.
- Regra de negócio servidor: `src/lib/business-health.ts` (funil, score, recompra).
- Auth/guard: `src/lib/auth.ts`, `src/middleware.ts`.
- Migração futura: schema Prisma/Postgres (ver `system/DB_SCHEMA.md`).

## Você LÊ, mas NÃO edita
- Telas/componentes/visual (`src/app/(app)/*`, `src/components/*`, `globals.css`) → lane **Frontend+UI**. Você entrega dado, não pinta tela.
- `devzap-engine/*` → lane **Engine**. Você define o contrato; a engine consome.

## Convenções (invioláveis)
- **Você é o dono do contrato.** Mudou request/response de um endpoint → atualize `system/API_CONTRACTS.md`
  e registre o handoff em `system/NEXT.md` (avisa Frontend+UI e Engine). Nunca quebre contrato em silêncio.
- Escrita em arquivo SEMPRE atômica + lock (`atomic-fs` / `json-collection.transact`) — engine e navegador escrevem concorrente.
- Rotas de engine exigem header `x-engine-token` (lista em `middleware.ts`). Rotas de navegador, cookie de sessão.
- Dedup de lead por TELEFONE (servidor), `enteredAt` imutável. LGPD: máscara no painel, delete disponível.
- Claim de disparo é transação atômica (sem disparo duplo); job preso >15min vira `failed`.
- Migração: 1 migração por feature, sem index/abstração prematura (ver `PROJECT_RULES.md`).

## Carregue ao iniciar (mínimo)
Este primer + `system/NEXT.md` + `system/API_CONTRACTS.md` + `system/DB_SCHEMA.md` + o store/rota que vai tocar.

## Fronteira / handoff
Mudança que exige nova tela/visual → handoff pra lane **Frontend+UI**. Mudança no que a engine envia →
handoff pra lane **Engine** (`devzap-engine`). Você só garante que o contrato existe e funciona end-to-end (testa com curl).
</content>
