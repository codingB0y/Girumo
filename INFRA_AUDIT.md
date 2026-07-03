# INFRA_AUDIT.md — Auditoria de Infraestrutura & Deploy

> **Natureza:** diagnóstico somente-leitura. Nenhuma config alterada. Data: 2026-07-03.
> **Escopo lido:** `deploy/GO_NO_GO.md`, `deploy/github|coolify|supabase|vercel` READMEs, `apply-order.md`,
> `infra/scripts/scan-secrets.ps1`, `.env.production.example`, `.gitignore`, `vercel.json`,
> `deploy/coolify/engine.docker-compose.yml`, e checagens `git ls-files`/grep.
> **Limite honesto:** DNS, SSL, valores de env, branch protection e backups do Supabase são **config externa
> (GitHub/Vercel/Coolify/Supabase)** — não vivem no repo. Onde não dá para validar por código, marco
> **[EXTERNO]** e deixo checklist para você confirmar nos painéis.
> **Veredito:** o **ferramental e os runbooks são bons** (GO/NO-GO, ordem de migração, scan de secrets,
> volumes), mas há **3 buracos de processo**: sem CI, runbook de banco **desatualizado**, e template de env
> **incompleto**. E o repo ainda declara **`Status: NO-GO`**.

## Placar

| Item | Nota | Fonte | Resumo |
|---|---|---|---|
| GitHub / CI | 🔴 | repo | **Nenhum CI/CD**; gate só manual (`verify:local`) |
| Supabase (migrações) | 🔴 | repo | `apply-order.md` **não cobre 6 migrações** de `apps/web/supabase` |
| Secrets | 🟢/🟠 | repo | Nada versionado ✓; mas scan é **manual + regex** |
| Env config | 🟠 | repo | Template **sem** `RESEND_API_KEY`/`PLATFORM_ADMIN_EMAILS` (verificar) |
| Coolify / Engine | 🟢 | repo | Runbook sólido; reconhece pendência multi-socket |
| Docker | 🟠 | repo | root + sem limits + volume `sessions` órfão (ver ENGINE_AUDIT) |
| Redis | 🟡 | repo | **Não usado** → rate-limit/analytics in-memory |
| Stripe | 🟢 | repo | Webhook idempotente + setup documentado |
| Backup | 🟠 | misto | Volumes persistem, mas **sem estratégia de backup** deles |
| Logs / Observabilidade | 🟠 | repo | Sem agregador/error-tracking (Sentry etc.) |
| DNS | ⚪ | [EXTERNO] | Vercel/Coolify auto; não verificável no repo |
| SSL | ⚪ | [EXTERNO] | Vercel + Coolify/Traefik (Let's Encrypt) auto |

---

## 1. GitHub / CI-CD  🔴

**Nenhum workflow do HubFlow.** Os únicos `.github/workflows` no repo pertencem a subprojetos de terceiros
(`hubflow-engine/agent-orchestrator/*` e o starter legado em `hubflow-groups/`), **não** ao produto. O próprio
[deploy/github/README.md:43](deploy/github/README.md) confirma: *"status check exigindo build/verify **quando
CI existir**"*.

🔴 **INFRA-1 — sem gate automático.** Lint, `tsc`, build, testes e `scan:secrets` só rodam via
`npm run verify:local` **manual** antes do push. Vercel e Coolify fazem deploy **direto do git** — se alguém
esquecer o `verify:local`, código quebrado/secret vaza vai para produção sem barreira. → mínimo: um workflow
que rode `verify:local` em PR.

**[EXTERNO]** Branch `main` protegida e PR obrigatório são *recomendados* no README, mas são config do GitHub
— **confirmar** que estão ativos (sem isso, push direto na `main` = deploy).

---

## 2. Supabase  🔴 (migrações) / 🟢 (RLS docs)

- 🔴 **INFRA-2 — runbook de banco desatualizado.** [apply-order.md](deploy/supabase/apply-order.md) lista **só
  as 6 migrações de `infra/`** e **zero** das 6 de `apps/web/supabase/migrations`
  (`admin_enhancements`, `funnel_events`, `templates_orders_referrals`, `testimonials`, `admin_alerts`,
  `flow_pages` — confirmado por grep). Quem provisionar um banco novo seguindo o runbook fica **sem 6 módulos**
  (admin, funil, templates, testimonials, alertas, Flow Pages). É a materialização do drift de migrações do
  [AUDIT_REPORT.md](AUDIT_REPORT.md) §13.3.
- 🟢 Ordem base + smoke RLS de 2 tenants documentados ([apply-order.md:22-27](deploy/supabase/apply-order.md),
  `infra/tests/rls-smoke-check.sql`). Bom.
- 🟡 **Dois projetos** (dev `wfju…` / prod `nido…`) — o `TASK_PROGRESS.md` relata migração aplicada nos dois
  com relink manual; risco de aplicar no projeto errado (sem CI que faça isso deterministicamente).
- **[EXTERNO]** "Backups habilitados" e "bucket `uploads` privado" são itens do GO/NO-GO — confirmar no painel
  Supabase (PITR/daily depende do plano).

---

## 3. Secrets  🟢/🟠

- 🟢 `.gitignore` cobre `.env*`, `hubflow-engine/auth/`, `sessions`, `engine-state.json`, `data/` — e
  `git ls-files` confirma **nada sensível versionado** (só `.env.example`/`.env.production.example`). `.vercel`
  também não está no git.
- 🟠 **INFRA-3 — scan de secrets é manual + regex.** [scan-secrets.ps1](infra/scripts/scan-secrets.ps1) cobre
  `sk_live/sk_test/whsec/service-role/engine-token`, mas roda **só quando alguém chama** (não é pre-commit nem
  CI) e é regex (falsos-negativos possíveis). → plugar em `pre-commit` e/ou CI; considerar `gitleaks`.
- 🟢 GO/NO-GO tem **NO-GO imediato** claro se service-role vazar ou aparecer no bundle
  ([GO_NO_GO.md:77-86](deploy/GO_NO_GO.md)).

---

## 4. Env config  🟠

🟠 **INFRA-4 — template de env provavelmente incompleto.** [deploy/vercel/.env.production.example](deploy/vercel/.env.production.example)
tem 16 chaves, mas **não** inclui:
- `PLATFORM_ADMIN_EMAILS` — sem ela, `admin-guard` cai no default hardcoded `igor@hubflow.com.br`
  (ver BACKEND_AUDIT BE-3).
- `RESEND_API_KEY` — os emails transacionais (welcome/nudge/trial) usam Resend; se não setada, **falham em
  silêncio** (fail-silent). **Verificar** o nome exato usado em `lib/email/client.ts`.
- Possivelmente credenciais do Google OAuth (`/api/auth/google` existe).
→ auditar `process.env.*` do código contra o template e completar. `check-env-template.ps1` existe para isso —
mas valida o template, não o superset real de envs usadas.

---

## 5. Coolify / Docker / Engine  🟢 runbook / 🟠 hardening

- 🟢 [deploy/coolify/README.md](deploy/coolify/README.md) é sólido: variáveis, volumes persistentes
  (`auth`/`sessions`/`state`), healthcheck, fluxo de comandos por RPC, falhas comuns. **Honesto**: reconhece a
  pendência de evoluir de **sessão Baileys única → `sessions/<tenant_id>/<instance_id>`**
  ([:90-98](deploy/coolify/README.md)) — mesma conclusão do ENGINE_AUDIT §5.
- 🟠 **Hardening do container** (detalhado no [ENGINE_AUDIT.md](hubflow-engine/ENGINE_AUDIT.md) §10): roda como
  **root**, **sem resource limits**, imagem `node:22-alpine` **não pinada**, e o compose monta um volume
  **`sessions`** que o `index.js` **não usa**.
- App web **não tem Dockerfile** (serverless na Vercel) — correto.

---

## 6. Redis  🟡

**Não usado.** Única menção é "escalar → Upstash" como nota futura no middleware de auth e em
[lib/pages/analytics.ts:8](apps/web/src/lib/pages/analytics.ts). Consequência: **rate-limit e analytics de
página são in-memory** — não sobrevivem a restart e não são consistentes entre instâncias. Aceitável enquanto
web = 1 função serverless por região; vira problema ao escalar. Sem ação agora.

---

## 7. Stripe  🟢

Webhook com verificação de assinatura + **idempotência** via tabela `logs` (BACKEND_AUDIT/AUDIT geral).
`deploy/stripe/setup.md` documenta produtos e price IDs; GO/NO-GO exige checkout/portal/downgrade testados e
webhook no domínio final. Price IDs por env (`STRIPE_PRICE_*`). Nada pendente no código — só validação
[EXTERNO] (webhook secret e endpoint no dashboard Stripe).

---

## 8. DNS  ⚪ [EXTERNO]

Não há config de DNS no repo (esperado). Domínios referenciados no código: `app.hubflow.com.br` (app),
`engine.hubflow.com`/`engine.seudominio.com` (engine, em `security-guards.ts` e nos runbooks). **Checklist
externo:** apontar `app.*` → Vercel, `engine.*` → VPS/Coolify; confirmar que `NEXT_PUBLIC_APP_URL` e `APP_URL`
(engine) usam o domínio final (GO/NO-GO já cobra isso).

---

## 9. SSL  ⚪ [EXTERNO]

Auto-provisionado: Vercel emite/renova para o app; Coolify (Traefik) emite Let's Encrypt para a engine. Não há
nada a versionar. **Checklist externo:** confirmar HTTPS forçado nos dois e que `appFetch` da engine usa
`https://` (ver ENGINE_AUDIT §11 — token em claro se `APP_URL` for `http`).

---

## 10. Logs / Observabilidade  🟠

- App: grava eventos na tabela `logs` do Supabase (auditável por tenant) + logs de runtime da Vercel.
- Engine: `console.log` sem estrutura (ENGINE_AUDIT §4).
- 🟠 **INFRA-5 — sem agregador nem error-tracking** (grep: nenhum Sentry/Logtail/Datadog). Um erro em produção
  não gera alerta; depende de olhar logs da Vercel/Coolify manualmente. → considerar Sentry (app) e envio das
  stats/erros da engine para um coletor.

---

## 11. Backup  🟠

- **Supabase**: [EXTERNO] — backups do plano (PITR/daily). GO/NO-GO exige "backups habilitados"; **confirmar**.
- 🟠 **INFRA-6 — volumes da engine sem backup.** `auth/` (sessão Baileys) e `engine-state.json` (estado
  anti-ban) persistem em volumes Docker, mas **não há estratégia de backup/restore** documentada. Se o VPS
  morrer, perde-se a sessão (obriga re-scan do QR = downtime do cliente) e o estado de warmup/cota. → snapshot
  periódico dos volumes ou export da sessão.
- App `data/` (JSON legado) é efêmero/gitignored — ok.

---

## 12. Status de produção  🟠 (divergência a resolver)

[GO_NO_GO.md:8](deploy/GO_NO_GO.md) declara **`Status: NO-GO`** ("ambiente online real ainda precisa ser
validado com credenciais, domínios e webhooks definitivos"), mas o contexto do projeto trata o HubFlow como
**em produção**. Ou o documento está **desatualizado** (produção liberada sem atualizar o GO/NO-GO), ou a
produção é "soft" sem o go formal. **Vale reconciliar** — o GO/NO-GO é a fonte de verdade da prontidão e não
deveria divergir do estado real.

---

## 13. Prioridades sugeridas (NÃO implementar sem aprovação)

| P | Item | Ação mínima | Ref. |
|---|---|---|---|
| P0 | Runbook de banco | atualizar `apply-order.md` com as 6 migrações de `apps/web/supabase` | INFRA-2 |
| P0 | Env incompleto | auditar `process.env` do código × template; add `RESEND_API_KEY`/`PLATFORM_ADMIN_EMAILS` | INFRA-4 |
| P1 | CI mínimo | workflow rodando `verify:local` em PR + `scan:secrets` | INFRA-1, INFRA-3 |
| P1 | Backup da engine | snapshot periódico de `auth/`+`state` | INFRA-6 |
| P2 | Error-tracking | Sentry no app; coletor p/ erros da engine | INFRA-5 |
| P2 | Reconciliar GO/NO-GO | atualizar status real + registrar decisão | §12 |
| P3 | Docker hardening | non-root, limits, pin, remover volume `sessions` | §5 / ENGINE_AUDIT |

---

## 14. Checklist [EXTERNO] para você confirmar nos painéis

- [ ] GitHub: `main` protegida + PR obrigatório.
- [ ] Vercel: 16+ envs setadas (incl. as faltantes da §4); `NEXT_PUBLIC_APP_URL` no domínio final.
- [ ] Supabase: backups/PITR habilitados; bucket `uploads` privado; RLS smoke de 2 tenants OK.
- [ ] Coolify: HTTPS forçado; volumes persistentes ativos; `ENGINE_TOKEN` = o da Vercel.
- [ ] Stripe: webhook no domínio final + assinatura validada; checkout/portal/cancelamento testados.
- [ ] DNS: `app.*`→Vercel, `engine.*`→VPS.

---

## 15. Resposta direta

A infra **não está improvisada** — há runbooks, GO/NO-GO, ordem de migração, scan de secrets e volumes
persistentes, o que é mais maturidade do que a média nesse estágio. Os furos são de **processo, não de
plataforma**: falta o CI que torna os runbooks *automáticos* em vez de *lembrados*, o runbook de banco
**divergiu** do código (6 migrações órfãs), e o template de env está incompleto. Nada disso é reescrita — são
correções de P0/P1 baratas. O que eu faria hoje: **INFRA-2** (atualizar `apply-order.md`) e **INFRA-4**
(completar as envs), porque ambos causam falha silenciosa num provisionamento novo.

*Fim do relatório. Diagnóstico apenas; nenhuma alteração aplicada.*
