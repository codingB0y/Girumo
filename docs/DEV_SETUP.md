# DEV_SETUP.md — Configuração do Ambiente Local

> Guia completo para rodar o HubFlow localmente com isolamento total de produção.

---

## Pré-requisitos

- Node.js 18+
- npm 9+
- Git
- Conta Supabase (projeto DEV separado)
- Conta Stripe (Test Mode)

---

## 1. Clonar e instalar

```bash
git clone git@github.com:seu-org/HubFlow-platform.git
cd HubFlow-platform
npm install
```

---

## 2. Criar projeto Supabase DEV

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. Crie um **novo projeto** (NÃO use o projeto de produção)
3. Nome sugerido: `hubflow-dev` ou `hubflow-local`
4. Anote:
   - Project URL: `https://xxxxxx.supabase.co`
   - Anon Key: `eyJ...`
   - Service Role Key: `eyJ...`

> ⚠️ **NUNCA** use o projeto de produção para desenvolvimento.

---

## 3. Configurar variáveis de ambiente

### Web (apps/web)

Edite `apps/web/.env.local` com os valores do seu projeto DEV:

```env
# Substituir pelos valores reais do projeto Supabase DEV
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO-DEV.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_URL=https://SEU-PROJETO-DEV.supabase.co
SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Stripe Test Mode
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Engine (hubflow-engine)

Edite `hubflow-engine/.env.dev`:

```env
ENGINE_MODE=mock
PORT=3001
```

---

## 4. Aplicar schema no Supabase DEV

Execute as migrations no seu projeto DEV:

```bash
# Via Supabase CLI (se configurado)
npx supabase db push --linked

# Ou copie o SQL do dashboard:
# Supabase Dashboard → SQL Editor → Cole o schema
```

---

## 5. Rodar o seed DEV

Após o schema estar aplicado:

```bash
# Subir o app
cd apps/web && npm run dev

# Em outro terminal, popular banco:
curl -X POST http://localhost:3000/api/admin/seed/dev
```

Isso cria:
- Super admin: `admin@localhost.dev` / `DevOnly123!`
- 3 tenants: `tenant-dev`, `tenant-demo`, `tenant-stress`
- Usuários fake com roles variados
- Planos e subscriptions
- Instâncias WhatsApp fake

---

## 6. Subir os serviços

### Terminal 1 — Web (Next.js)

```bash
cd apps/web
npm run dev
# → http://localhost:3000
```

### Terminal 2 — Engine Mock

```bash
cd hubflow-engine
npm run dev
# → http://localhost:3001
```

---

## 7. Validar ambiente

Acesse: `http://localhost:3000/api/admin/dev-tools/security-check`

Deve retornar:
```json
{
  "isolated": true,
  "security": { "safe": true, "violations": [] },
  "checklist": {
    "stripeIsolated": true,
    "engineIsolated": true,
    "databaseSeparated": true,
    "domainLocal": true,
    "devToolsEnabled": true,
    "mockEngineEnabled": true,
    "productionBlocked": true
  }
}
```

---

## 8. Acessar o painel

1. Abra `http://localhost:3000/login`
2. Login com `admin@localhost.dev` / `DevOnly123!`
3. Você verá a barra verde "🟢 LOCAL DEV MODE" no topo
4. Acesse Developer Tools em `/painel/dev-tools`

---

## Estrutura de ambientes

| Ambiente | Banco | Engine | Stripe | Domínio |
|----------|-------|--------|--------|---------|
| DEV | Supabase projeto separado | Mock (localhost:3001) | sk_test_ | localhost:3000 |
| STAGING | Supabase projeto separado | Engine staging | sk_test_ | staging.hubflow.com.br |
| PRODUCTION | Supabase prod | Engine prod | sk_live_ | app.hubflow.com.br |

---

## Troubleshooting

### "Variável obrigatória não configurada"
→ Preencha todos os valores em `.env.local` (remova os placeholders)

### "Chave Stripe LIVE detectada em ambiente DEV"
→ Troque `sk_live_` por `sk_test_` no `.env.local`

### Engine offline
→ Rode `cd hubflow-engine && npm run dev` em terminal separado

### Seed falhou
→ Verifique se o schema foi aplicado no Supabase DEV
→ Verifique se as credenciais Supabase estão corretas

---

## Comandos úteis

```bash
# Web
npm run web:dev          # Dev server
npm run web:build        # Build
npm run web:lint         # Lint

# Engine
cd hubflow-engine
npm run dev              # Engine mock
npm start                # Engine real (produção)

# Seed
curl -X POST http://localhost:3000/api/admin/seed/dev
curl -X POST http://localhost:3000/api/admin/dev-tools/reset

# Security check
curl http://localhost:3000/api/admin/dev-tools/security-check

# Engine health
curl http://localhost:3000/api/admin/dev-tools/engine-health
```
