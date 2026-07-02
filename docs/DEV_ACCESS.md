# DEV_ACCESS.md — Credenciais e Acessos do Ambiente DEV

> ⚠️ Estas credenciais são EXCLUSIVAS para o ambiente local de desenvolvimento.
> Elas NÃO funcionam em produção (bloqueadas pelo security guard).

---

## Super Admin

| Campo | Valor |
|-------|-------|
| Email | `admin@localhost.dev` |
| Senha | `DevOnly123!` |
| Role | `platform_admin` / `owner` |
| Permissões | Acesso total, impersonate, debug, logs |

---

## Usuários DEV

| Email | Senha | Tenant | Role |
|-------|-------|--------|------|
| `admin@localhost.dev` | `DevOnly123!` | todos | owner |
| `operador@dev.local` | `DevUser123!` | tenant-dev | operator |
| `admin@demo.local` | `DevUser123!` | tenant-demo | admin |
| `stress1@test.local` | `DevUser123!` | tenant-stress | operator |
| `stress2@test.local` | `DevUser123!` | tenant-stress | operator |
| `stress3@test.local` | `DevUser123!` | tenant-stress | admin |

---

## Tenants DEV

| Slug | Nome | Plano | Uso |
|------|------|-------|-----|
| `tenant-dev` | [DEV] Workspace Principal | Performance Max | Desenvolvimento geral |
| `tenant-demo` | [DEMO] Empresa Demonstração | Growth | Demos e apresentações |
| `tenant-stress` | [STRESS] Teste de Carga | Essencial | Testes de performance |

---

## Instâncias WhatsApp (Mock)

| Telefone | Tenant | Nome |
|----------|--------|------|
| `+5511000000001` | tenant-dev | DEV WhatsApp 1 |
| `+5511000000002` | tenant-demo | DEMO WhatsApp |
| `+5511000000003` | tenant-stress | STRESS WA 1 |
| `+5511000000004` | tenant-stress | STRESS WA 2 |

> Nenhuma dessas instâncias conecta com WhatsApp real.
> A engine mock simula envio/recebimento sem conexão externa.

---

## URLs Locais

| Serviço | URL |
|---------|-----|
| Web (Next.js) | `http://localhost:3000` |
| Engine Mock | `http://localhost:3001` |
| Dev Tools | `http://localhost:3000/painel/dev-tools` |
| Security Check | `http://localhost:3000/api/admin/dev-tools/security-check` |
| Engine Health | `http://localhost:3000/api/admin/dev-tools/engine-health` |

---

## Stripe (Test Mode)

| Tipo | Valor |
|------|-------|
| Chave | `sk_test_...` (configurar no .env.local) |
| Card de teste | `4242 4242 4242 4242` |
| Expiração | Qualquer data futura |
| CVC | Qualquer 3 dígitos |
| Card que falha | `4000 0000 0000 0002` |

---

## Permissões do Super Admin

O admin DEV pode:

- ✅ Acessar qualquer tenant
- ✅ Impersonate (ver como outro tenant)
- ✅ Trocar de tenant via switch no banner
- ✅ Executar seed / reset
- ✅ Ver logs de todos os tenants
- ✅ Simular webhooks, bans, falhas
- ✅ Trocar plano de qualquer tenant
- ✅ Simular cobrança
- ✅ Debug de sessions

---

## Tokens de Serviço

| Token | Valor | Uso |
|-------|-------|-----|
| ENGINE_TOKEN | `dev_engine_token_local` | Comunicação web↔engine |
| AUTH_SECRET | `dev-secret-local-troque-em-producao` | JWT sessions |

---

## Bloqueios de Segurança

Estas credenciais são **bloqueadas fora de DEV**:

- Emails `@localhost.dev`, `@dev.local`, `@test.local` → rejeitados em prod
- `ENGINE_MODE=mock` → impossível em prod
- `ENABLE_DEV_TOOLS=true` → bloqueado em prod
- Seed routes → retornam 403 em prod
- Dev tools routes → retornam 403 em prod
