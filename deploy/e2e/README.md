# HUBFLOW - Validacao E2E Online

Este roteiro valida o fluxo minimo depois que Vercel, Supabase, Stripe e Engine/Coolify estiverem publicados.

## Pre-requisitos

- App web publicado na Vercel.
- Supabase com migrations aplicadas.
- Bucket `uploads` privado criado.
- Produtos e precos Stripe criados.
- Stripe webhook apontando para `/api/billing/webhook`.
- Engine publicada no Coolify/VPS.
- `ENGINE_TOKEN` igual na Vercel e na Engine.

## 1. Healthchecks

Validar app:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com"
```

Validar app e engine:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com" -EngineUrl "https://engine.seudominio.com"
```

Resultado esperado:

- app com `service=hubflow-web` e `status=ok`;
- engine com `service=hubflow-engine` e `ok=true`.

Se o app retornar `degraded`, corrigir `checks` antes de seguir.

## 2. Registro E Tenant

1. Criar uma conta nova pelo app online.
2. Confirmar no Supabase:
   - registro em `users`;
   - registro em `organizations`;
   - membership `owner`;
   - subscription/plano inicial `FREE`.
3. Fazer logout e login novamente.
4. Confirmar sessao persistente.

## 3. Isolamento Multi-Tenant

Criar dois tenants de teste:

- `tenant_a`;
- `tenant_b`.

Validar:

- tenant A nao lista contatos, uploads, instancias, campanhas, mensagens ou logs do tenant B;
- tenant B nao lista dados do tenant A;
- Operator nao acessa billing;
- Admin nao remove Owner unico;
- Owner acessa billing e membros.

Executar tambem:

```sql
-- Ajustar UUIDs antes de rodar em ambiente real.
\i infra/tests/rls-smoke-check.sql
```

## 4. Storage Privado

1. Fazer upload de arquivo pela UI ou rota autenticada.
2. Confirmar registro em `uploads`.
3. Confirmar path no formato:

```txt
uploads/<tenant_id>/<categoria>/<arquivo>
```

4. Confirmar que URL publica direta nao abre sem assinatura/permissao.
5. Confirmar limite de upload por plano.

## 5. Stripe

1. Entrar com tenant de teste.
2. Abrir checkout do plano Essencial.
3. Pagar em modo teste.
4. Confirmar webhook recebido com assinatura valida.
5. Confirmar `subscriptions` atualizada no Supabase.
6. Abrir Customer Portal.
7. Fazer cancelamento/downgrade.
8. Confirmar entitlements aplicados:
   - FREE bloqueia acima de 1 instancia;
   - Essencial respeita limites configurados;
   - Growth libera campanhas;
   - Performance Max remove limites operacionais planejados.

## 6. Engine Baileys

1. Criar instancia WhatsApp no app.
2. Confirmar registro em `instances` com `tenant_id`.
3. Acionar `refresh_status`.
4. Confirmar comando em `engine_commands`.
5. Confirmar engine processando comando e gerando `engine_events`.
6. Confirmar `instances.status` atualizado.
7. Validar QR code.
8. Conectar WhatsApp de teste.
9. Reiniciar container da engine.
10. Confirmar reconexao usando volume persistente.

## 7. Auditoria E Logs

Confirmar eventos minimos em `logs`:

- signup/login;
- criacao de instancia;
- checkout/portal;
- webhook Stripe;
- upload;
- comando engine;
- erro operacional simulado.

Confirmar que todos os eventos possuem:

- `tenant_id`;
- `actor_user_id` quando houver usuario;
- `created_at`.

## 8. Criterio De Conclusao

O E2E esta aprovado quando:

- `npm run verify:online` passa para app e engine;
- landing, login, signup e recuperacao de senha abrem sem erro;
- RLS bloqueia tenant cruzado;
- Stripe checkout e webhook funcionam;
- storage privado funciona;
- engine processa pelo menos um comando por tenant;
- auditoria mostra eventos principais;
- nenhum secret real aparece no repositorio.

Se precisar validar somente healthchecks, sem abrir paginas publicas:

```powershell
npm run verify:online -- -AppUrl "https://app.seudominio.com" -EngineUrl "https://engine.seudominio.com" -SkipPublicPages
```
