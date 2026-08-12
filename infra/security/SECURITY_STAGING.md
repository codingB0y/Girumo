# Harness de Security Scan — Staging Descartável

Ambiente e scripts para rodar o **active scan autenticado** com segurança. Complementa o `SECURITY_AUDIT.md` (raiz): o DAST sem-credencial já validou o perímetro (headers, gates de auth 401, rate-limit); isto cobre o que faltava — **IDOR cross-tenant e fuzzing autenticado**.

## ⚠️ Regra de ouro
Rode **só contra staging descartável**. Nunca contra produção nem contra o dev com banco real: o active scan fuzza `POST`/`DELETE` e o HubFlow tem side-effects reais (WhatsApp via engine, Stripe). O `zap-automation.yaml` já exclui os endpoints perigosos, e o `seed` recusa URLs com "prod".

## Pré-requisitos
- Docker Desktop **aberto** (daemon rodando).
- Um banco Supabase **descartável** — opções:
  - **Local** (recomendado): `supabase init` + `supabase start` (sobe Postgres+Auth em Docker, 100% isolado).
  - Ou um **projeto Supabase novo** só pra testes.
- A **engine desligada** ou em `ENGINE_MODE=mock` (não plugar WhatsApp real).

## Passos

```bash
# 1) Subir o banco descartável (opção local) e aplicar o schema
supabase start
# aplique as migrations de apps/web/supabase/migrations/ (via `supabase db reset` ou seu script de apply)

# 2) Apontar o app pro banco descartável e subir em modo seguro
#    .env.local do apps/web -> SUPABASE_URL / *_ANON_KEY / SERVICE_ROLE_KEY do supabase local
#    ENGINE_MODE=mock (engine não conecta WhatsApp)
npm run web:dev   # http://localhost:3000

# 3) Semear 2 tenants de teste
SUPABASE_URL=<staging> SUPABASE_SERVICE_ROLE_KEY=<staging> \
  node infra/security/seed-test-tenants.mjs

# 4) TESTE DE OURO — isolamento multi-tenant (prova C2/H2/M6 no runtime)
BASE=http://localhost:3000 bash infra/security/idor-crosstenant-test.sh
#    -> "isolamento multi-tenant OK ✅"  ou falha com exit 2

# 5) Active scan autenticado (OWASP ZAP) — fuzzing com os endpoints perigosos excluídos
cd infra/security
docker run --rm -t -v "$PWD:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable \
  zap.sh -cmd -autorun /zap/wrk/zap-automation.yaml
#    -> relatório em infra/security/zap-report.html

# 6) (opcional) Nuclei — CVE/misconfig/exposure
#    baixe o binário de github.com/projectdiscovery/nuclei/releases e:
nuclei -u http://localhost:3000 -t http/misconfiguration/ -t http/exposures/ -rl 20
```

## O que cada peça cobre
| Script | Prova |
|--------|-------|
| `seed-test-tenants.mjs` | Cria 2 tenants isolados (A/B) com login funcional |
| `idor-crosstenant-test.sh` | **A não lê/apaga recurso de B** — o vetor central do multi-tenant (C2/H2/M6) |
| `zap-automation.yaml` | Spider + passive + active scan autenticado, sem tocar WhatsApp/Stripe |

## Notas
- Credenciais de teste ficam no topo do `seed` e do `idor-test` — são de **staging descartável**, não são segredo.
- Se a auth do ZAP falhar (versões de Auth variam), confira `loggedInRegex` (`"tenantId"`) contra a resposta real do `/api/auth/login`.
- Ampliar o `idor-test` para outros recursos: repita o padrão com `/api/links/:slug` (M6) e `/api/campanhas/:slug/messages` (H2), sempre evitando os endpoints que disparam envio.
