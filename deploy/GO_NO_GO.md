# HUBFLOW - Go/No-Go Producao

Este documento decide se o HUBFLOW pode receber o primeiro cliente pago.

## Resultado

```txt
Status: NO-GO
Motivo: ambiente online real ainda precisa ser validado com credenciais, dominios e webhooks definitivos.
```

Atualize para `GO` somente quando todos os itens obrigatorios abaixo estiverem aprovados.

## GO Obrigatorio

### GitHub

- Repo privado ou sem qualquer secret historico acessivel.
- `npm run scan:secrets` aprovado.
- Auditoria de dependencias aprovada em ambiente autorizado.
- `hubflow-engine/auth/` fora do indice Git.
- Dados runtime fora do Git.
- Branch principal protegida.

### Supabase

- Migrations aplicadas em ordem.
- RLS habilitado nas tabelas sensiveis.
- Smoke test de RLS aprovado com dois tenants.
- Bucket `uploads` privado.
- Policies de storage aprovadas.
- Backups habilitados.

### Vercel

- Deploy apontando para `apps/web`.
- `vercel.json` respeitado.
- Todas as envs obrigatorias configuradas.
- `NEXT_PUBLIC_APP_URL` usando dominio final.
- `/api/health` retorna `status=ok`.
- Build sem dependencia operacional de Prisma.

### Stripe

- Produtos criados:
  - Essencial;
  - Growth;
  - Performance Max.
- Price IDs configurados na Vercel ou no banco.
- Webhook apontando para dominio final.
- Assinatura do webhook validada.
- Checkout e portal testados.
- Downgrade/cancelamento refletidos no Supabase.

### Engine

- Engine publicada em VPS/Coolify.
- Volumes persistentes ativos para sessoes.
- `/health` retorna `ok=true`.
- `ENGINE_TOKEN` alinhado com Vercel.
- Engine processa comandos via Supabase.
- Restart preserva sessao de teste.

### Produto

- Registro, login, logout e recuperacao de senha aprovados.
- Convite de membro aprovado.
- Owner/Admin/Operator testados.
- Upload privado aprovado.
- Limites por plano aprovados.
- Auditoria visivel por tenant.

## NO-GO Imediato

Nao liberar producao se qualquer item abaixo ocorrer:

- `SUPABASE_SERVICE_ROLE_KEY` aparece no client bundle ou em arquivo versionado.
- RLS desativado em tabela sensivel.
- Tenant A consegue acessar dados do tenant B.
- Stripe webhook aceita request sem assinatura valida.
- Engine processa comando sem `tenant_id` ou `instance_id`.
- Sessoes Baileys reais estao versionadas.
- `/api/health` retorna `degraded`.
- Engine `/health` falha.
- `npm run scan:secrets` falha.
- auditoria de dependencias aponta vulnerabilidade sem mitigacao aprovada.

## Comando Final De Smoke

```powershell
npm run verify:local
npm run verify:online -- -AppUrl "https://app.seudominio.com" -EngineUrl "https://engine.seudominio.com"
```

## Registro Da Decisao

Antes de mudar para `GO`, registrar:

- data;
- responsavel;
- dominios finais;
- Supabase project id;
- Stripe mode usado;
- commit/tag publicado;
- resultado dos testes E2E;
- resultado da auditoria de dependencias.
