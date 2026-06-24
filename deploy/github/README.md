# HUBFLOW GitHub - Preparacao Do Repositorio

Este guia prepara o repo para servir como fonte de deploy da Vercel e da engine.

## Antes Do Primeiro Push/PR

Rodar:

```powershell
npm run verify:local
```

Esse comando valida:

- JSONs principais;
- templates de env;
- scan de secrets;
- TypeScript;
- build Next.js;
- sintaxe da engine.

## Gitignore E Runtime Data

Confirmar que nao entram no Git:

```txt
hubflow-engine/auth/
hubflow-engine/sessions/
hubflow-engine/engine-state.json
apps/web/data/
hubflow-groups/data/
```

Se algum runtime data ja apareceu no Git historico, rotacionar tokens/sessoes afetadas.

## Branch Principal

Recomendado:

- repo privado;
- branch `main` protegida;
- PR obrigatorio antes de merge;
- status check exigindo build/verify quando CI existir;
- secrets somente em Vercel/Coolify/Supabase/Stripe, nunca no repo.

## Antes De Conectar Na Vercel

Validar:

```powershell
npm run scan:secrets
npm run verify:local
```

Conferir:

- `vercel.json` existe na raiz;
- `deploy/vercel/.env.production.example` atualizado;
- `deploy/supabase/README.md` seguido;
- `deploy/stripe/setup.md` seguido;
- `deploy/coolify/README.md` seguido.

## Nao Fazer

- Nao commitar `.env.local`.
- Nao commitar service role.
- Nao commitar sessoes Baileys.
- Nao commitar dumps de banco.
- Nao usar `git reset --hard` para limpar segredo sem entender impacto; se segredo real vazou, rotacionar.
