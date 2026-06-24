# HUBFLOW Web - Deploy Vercel

Este guia publica `apps/web` na Vercel usando Root Directory `apps/web`.

## Preflight

Rodar localmente antes de abrir deploy:

```powershell
npm run verify:local
```

## Projeto Vercel

1. Criar projeto na Vercel.
2. Conectar o repositorio GitHub raiz.
3. Configurar **Root Directory** como:

```txt
apps/web
```

4. Manter `apps/web/vercel.json` como fonte dos comandos:

```txt
installCommand: npm install
buildCommand: npm run build
outputDirectory: .next
framework: nextjs
```

## Variaveis

Usar o template:

```txt
deploy/vercel/.env.production.example
```

Obrigatorias:

```txt
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SALES_WHATSAPP_URL
AUTH_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_ESSENCIAL
STRIPE_PRICE_GROWTH
STRIPE_PRICE_PERFORMANCE_MAX
ENGINE_TOKEN
HUBFLOW_DATA_DIR
```

`NEXT_PUBLIC_SALES_WHATSAPP_URL` e opcional, mas recomendado para a landing. Se ficar vazio, o CTA principal usa `/signup`.

`SUPABASE_SERVICE_ROLE_KEY` deve existir apenas em server env da Vercel. Nunca expor no client.

## Dominio

Configurar:

```txt
https://app.seudominio.com
```

Depois atualizar:

- `NEXT_PUBLIC_APP_URL` na Vercel;
- Supabase Auth Site URL;
- Supabase Auth Redirect URLs;
- Stripe webhook URL;
- `APP_URL` no Coolify da engine.

## Deployment Protection

Para o app publico funcionar, desativar protecao de deploy da Vercel no ambiente usado por clientes:

```txt
Settings -> Deployment Protection
Vercel Authentication: Disabled
```

Se essa protecao ficar ativa, rotas como `/signup`, `/api/auth/signup`, `/api/health` e `/api/billing/webhook` podem redirecionar para `vercel.com/sso-api`, quebrando cadastro, healthcheck e webhook Stripe.

## Validacao Pos-Deploy

Rodar:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com"
```

O app deve retornar:

```json
{
  "service": "hubflow-web",
  "status": "ok"
}
```

Se retornar `degraded`, revisar:

- `checks.env`;
- `checks.stripePrices`;
- `checks.database`;
- `checks.planCount`;
- `checks.storage`.

## Falhas Comuns

- Build falha por caminho: conferir `vercel.json`.
- `/api/health` degraded: envs ou Supabase incompletos.
- Login falha: conferir Supabase Auth URL Configuration.
- Checkout desabilitado: conferir `STRIPE_PRICE_*`.
- Webhook falha: conferir `STRIPE_WEBHOOK_SECRET`.
