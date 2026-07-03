# ROADMAP.md — HubFlow V1→V5

> Consolida os achados das 5 auditorias (`AUDIT_REPORT`, `ENGINE_AUDIT`, `BACKEND_AUDIT`, `FRONTEND_AUDIT`,
> `INFRA_AUDIT`) num plano faseado. Data: 2026-07-03.
>
> **Princípio:** cada fase tem um tema único e um **critério de saída** (gate). Não pular fase — segurança e
> bugs (V1) antes de qualquer refatoração; nada de reescrita, tudo incremental. Cada item referencia a
> auditoria de origem e o `arquivo:linha`.
>
> **Regra de ouro:** V1 é a única fase que mexe em *comportamento observável* por necessidade (bugs/segurança).
> V2 não muda comportamento (só estrutura). V3+ são melhorias medidas, não suposições.

---

## 🎯 Faseamento

```
V1 Correções     → o que está QUEBRADO ou é risco AGORA (segurança, bugs, falha silenciosa)
V2 Refatorações  → dívida estrutural, duplicação, limpeza (sem mudar comportamento)
V3 Performance   → otimização medida (menos client, cache, paginação, Lighthouse)
V4 Escalabilidade→ multi-instância, multi-tenant real, throughput distribuído
V5 Enterprise    → observabilidade, testes, compliance, DR/SLA
```

---

## 🔴 V1 — Correções  *(gate: nenhum 🔴 em aberto)*

**Status em 2026-07-03:** itens 1, 2, 3, 4, 9 e 11 implementados e verificados pelo gate local.
Itens 5, 6, 7, 8, 10 e 12 continuam abertos ou dependem de configuração externa.

Segurança, bugs e falhas silenciosas. É o que impede um cliente pago hoje.

| # | Item | Origem | Arquivo |
|---|---|---|---|
| 1 | `GET /api/admin/tenants/list` sem admin-guard → **leak cross-tenant** | BACKEND BE-1 | `app/api/admin/tenants/list/route.ts` |
| 2 | RBAC (`permissions.ts`) **não enforçado no server** → operator age como owner | BACKEND BE-2 | mutações em `app/api/*` |
| 3 | IDOR em `/api/media/[id]` (sem checar tenant do path) | BACKEND BE-5 | `lib/media-store.ts:110` |
| 4 | `ENGINE_TOKEN`/`AUTH_SECRET` com **defaults inseguros** → falhar boot se ausente em prod | AUDIT §5 / ENGINE 11 | `lib/auth.ts:8-9`, `hubflow-engine/index.js:190` |
| 5 | Rotacionar **Service Role Key** (pendente Sprint 1) | AUDIT §12 | painel Supabase |
| 6 | Engine: boot frágil **CJS×ESM** + **pinar** imagem Node | ENGINE A-1 | `hubflow-engine/*.js`, `Dockerfile` |
| 7 | Engine `/health` **mente** (200 deslogado) → 503 + live/ready | ENGINE 9 | `hubflow-engine/index.js:9` |
| 8 | Engine **watchdog órfão** (plugar `connection-watchdog`) | ENGINE R-1 | `hubflow-engine/index.js` |
| 9 | Runbook de banco **desatualizado** (6 migrações órfãs) | INFRA-2 | `deploy/supabase/apply-order.md` |
| 10 | Env template incompleto (`RESEND_API_KEY`, `PLATFORM_ADMIN_EMAILS`) → email/admin falham calados | INFRA-4 | `deploy/vercel/.env.production.example` |
| 11 | CI mínimo: `verify:local` + `scan:secrets` em PR (habilita todo o resto com rede) | INFRA-1/3 | `.github/workflows/` (novo) |
| 12 | Reconciliar `GO_NO_GO` (NO-GO declarado × "produção") | INFRA §12 | `deploy/GO_NO_GO.md` |

**Saída V1:** zero achados 🔴; smoke de isolamento 2-tenants passa; boot da engine determinístico; CI verde em PR.

---

## 🟠 V2 — Refatorações  *(gate: uma fonte de verdade por conceito; zero código morto)*

Dívida estrutural. **Não muda comportamento** — só remove duplicação e ambiguidade.

| # | Item | Origem |
|---|---|---|
| 1 | Consolidar **um shell**: decidir `(app)` EN × `painel` PT e remover o duplicado (sidebar/topbar/mobile-nav/stat-card) | FRONTEND FE-2/3 |
| 2 | Unificar **tokens**: `brand-*` (#7c5cff) × `iris/breu` (#6a4bf0) num só vocabulário/cor | FRONTEND FE-1 |
| 3 | Deletar **componentes landing mortos** (flow-visual, product-frame, testimonial-card, bento-card, landing/pricing) | FRONTEND FE-4 |
| 4 | Migrar `leads-store`/`optout-store` (NDJSON global) → Supabase **tenant-scoped**; remover stores JSON legados | BACKEND BE-4 / AUDIT §7 |
| 5 | Fechar o gap **RLS×service-role**: wrapper que exige `tenant_id` (falha em dev se ausente) ou cliente por-token | AUDIT §6 |
| 6 | Limpar **resíduos** do repo (`hubflow-groups/`, `api/`, `packages/`, `apps/web/prisma`, `nextjs-claude-code-starter`) | AUDIT §13.5 |
| 7 | Engine: **entrypoint canônico** (doc/rename index vs dev*) + remover volume `sessions` órfão | ENGINE 5 / INFRA §5 |
| 8 | Remover fonte órfã (Instrument Serif) e separar fontes landing × painel | FRONTEND FE-7 |

**Saída V2:** um shell, um vocabulário de token, um caminho de dados por tenant, repo sem projeto predecessor.

---

## 🟡 V3 — Performance  *(gate: Lighthouse medido + metas batidas)*

Otimização **medida**, não suposta. Rodar baseline antes de mexer.

| # | Item | Origem |
|---|---|---|
| 1 | Reduzir **client-heavy**: converter listas/cards estáticos em Server Components (107/155 hoje) | FRONTEND FE-6 |
| 2 | **Caching**: `unstable_cache` curto em leituras quentes (planos/templates/config) | BACKEND §7 |
| 3 | **Paginação por cursor** (`.range`) nas listagens (hoje sem limite ou limit fixo) | BACKEND BE-6 |
| 4 | `assertUploadLimit` → agregar `sum` no banco (hoje full-scan no JS) | BACKEND BE-7 |
| 5 | **Lighthouse real**: baseline + atacar TBT (menos JS) e CLS (reservar espaço dos banners) | FRONTEND §7 |
| 6 | Engine: **observabilidade** — `pino` estruturado + `/metrics` | ENGINE 4/13 |
| 7 | Docker **hardening** (non-root, resource limits) | ENGINE 10 / INFRA §5 |

**Saída V3:** Lighthouse ≥ meta acordada; queries paginadas; engine com logs estruturados e limites de container.

---

## 🟢 V4 — Escalabilidade  *(gate: 2ª instância sobe sem colisão)*

Sair do single-instance/single-número.

| # | Item | Origem |
|---|---|---|
| 1 | Engine **multi-tenant real**: `supervisor` funcional — `auth/<instanceId>` isolado, `CMD`=supervisor, alinhar tabela `instances` | ENGINE E-1 |
| 2 | **Rate-limit distribuído** (Upstash/Redis) — hoje in-memory single-instance | AUDIT §13 / INFRA §6 |
| 3 | Analytics de página distribuído (sair do in-memory) | INFRA §6 |
| 4 | **Webhook app→engine** (corta latência de disparo de 3-10s) | ENGINE 12 |
| 5 | **Consolidar migrações** numa fonte única (elimina o drift de vez) | AUDIT §13.3 / INFRA-2 |
| 6 | **Backup automatizado** dos volumes da engine (`auth/`+`state`) | INFRA-6 |

**Saída V4:** N números/tenants numa engine; estado compartilhado sobrevive a restart e escala horizontal.

---

## 🏛️ V5 — Enterprise  *(gate: pronto para cliente grande/auditoria)*

Robustez, confiança e recursos que vendem para conta grande.

| # | Item | Origem |
|---|---|---|
| 1 | **Error-tracking** (Sentry no app + coletor de erros da engine) | INFRA-5 |
| 2 | **Testes automatizados**: integração/e2e + teste de **isolamento multi-tenant** (store sem `tenant_id` falha) | AUDIT §13 / BACKEND |
| 3 | **Audit log de impersonation** (Sprint 4 item 19) | TASK_PROGRESS |
| 4 | **Funnel dashboard admin** (Sprint 4 item 20) | TASK_PROGRESS |
| 5 | Endurecer segurança: `security-guards` **bloqueantes** em prod, `gitleaks` em CI, secrets em vault | INFRA §3 / §2 |
| 6 | **DR/SLA**: PITR Supabase validado, runbook de restore, uptime/alertas | INFRA §11 |

**Saída V5:** observável, testado, auditável, com plano de recuperação — apto a SLA.

---

## 🔗 Rastreabilidade (achado → versão)

| Auditoria | V1 | V2 | V3 | V4 | V5 |
|---|---|---|---|---|---|
| **Backend** | BE-1, BE-2, BE-5 | BE-4, RLS gap | BE-6, BE-7, cache | — | testes isolamento |
| **Engine** | A-1, /health, watchdog, token | entrypoint, sessions | pino, /metrics, hardening | multi-tenant, webhook | error-collector |
| **Frontend** | — | FE-1/2/3/4/7 | FE-5/6, Lighthouse | — | — |
| **Infra** | INFRA-1/2/4, key, GO/NO-GO | resíduos | Docker limits | migrações única, backup engine | Sentry, gitleaks, DR |
| **Geral** | rotação key, defaults | dedup, RLS, resíduos | — | rate-limit distrib. | testes, audit log |

---

## 📌 Notas de execução

- **Uma versão por vez, um item por PR** — cada correção é atômica e reversível (regra do projeto).
- Antes de codar qualquer item: consultar `PROJECT_CONTEXT.md` e a auditoria de origem; **não reler o projeto**.
- **V1 primeiro, sempre.** Um 🔴 de segurança aberto trava a promoção para as fases seguintes.
- Este roadmap é vivo: marque como concluído somente o que passou no gate ou foi confirmado no ambiente externo.
