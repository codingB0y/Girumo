# HUBFLOW - Deploy Online

Este diretorio concentra os guias para publicar o HUBFLOW sem recriar o sistema do zero.

## Ordem Recomendada

1. GitHub: `deploy/github/README.md`
2. Supabase: `deploy/supabase/README.md`
3. Stripe: `deploy/stripe/setup.md`
4. Vercel: `deploy/vercel/README.md`
5. Coolify/VPS: `deploy/coolify/README.md`
6. E2E online: `deploy/e2e/README.md`
7. Go/No-Go: `deploy/GO_NO_GO.md`

## Preflight Local

Antes de publicar:

```powershell
npm run verify:local
```

Esse comando valida:

- JSON e templates de env;
- scan local de secrets;
- TypeScript do app web;
- build Next.js 15;
- sintaxe principal da engine.

## Smoke Online

Apos publicar Vercel e Coolify:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com" -EngineUrl "https://engine.seudominio.com"
```

## Estado Atual

```txt
Stack web: Next.js 15 App Router + TypeScript + Tailwind
Banco/Auth/Storage: Supabase
Billing: Stripe
Engine: hubflow-engine em VPS/Coolify
Status producao: NO-GO ate validacao real do ambiente online
```

