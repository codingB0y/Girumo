# Acesso da vendedora — PR 2 (banco) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O banco ganha tudo o que os PRs 3, 4 e 6 consomem: o papel `seller`, os módulos extras por membro (`memberships.modules`), o autor do pedido (`orders.created_by`), os itens do pedido (`order_items`), as duas RPCs que gravam pedido + itens de forma atômica e o RLS que deixa a vendedora sem leitura nenhuma pelo caminho `authenticated` — aplicado em dev **e** prod, com a baseline do gate de drift regenerada no mesmo PR.

**Architecture:** Duas migrações. A (`…120000`) só acrescenta `'seller'` ao enum `member_role`, sozinha, porque valor novo de enum não pode ser usado na transação em que nasce. B (`…120100`) usa esse valor: reescreve os helpers de leitura do RLS que não filtram papel (`app.user_tenant_ids()`, `app.has_membership(uuid)`, com o corpo de **prod** + `and m.role <> 'seller'`), cria colunas, tabela, RLS e três funções plpgsql `security invoker` com `search_path` vazio: um validador/somador interno (`order_items_total`) e as RPCs do contrato (`create_order_with_items`, `replace_order_items`), executáveis só por `service_role`. Um teste de integração contra o banco de dev (job `e2e` do CI), numa loja descartável com dona e vendedora logadas de verdade, prova soma, limites, janela de 24h, atomicidade e que o JWT da vendedora não lê nada; um SQL de conferência prova nos dois bancos o que o gate de drift não enxerga.

**Tech Stack:** Postgres 15 (Supabase), plpgsql, Supabase CLI (`db query --linked`), `@supabase/supabase-js` (service-role), `node --test` via tsx.

**Spec:** `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` (§1 "RLS — a vendedora não lê nada direto do banco", §2 Dados, §6, §7) · contrato: `docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md`, seção **"PR 2 → PR 3, 4, 6"** (nomes, assinaturas e mensagens de erro são vinculantes).

## Global Constraints

Regras que valem para os seis PRs (copiadas do índice):

- Código, identificadores e commits em inglês; texto de tela e de erro em pt-BR. Commits com prefixo semântico e terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`:
  - unit: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`
  - tipos (os **dois**; lint e tsx não checam tipo): `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`
  - lint: `npm run lint` · suíte: `npm test`
- Antes do push: `infra/scripts/verify-local.ps1` (secrets + build) — é o gate real; o `verify` do CI é pulado na `main`.
- Nunca `git add -A`. `git diff --cached --stat` numa chamada separada antes de cada commit.
- Store Supabase: **sempre** `.eq("tenant_id", tenantId)` — o service-role ignora RLS. Vale também para o teste de integração.
- Ao **começar**, mover o card no quadro de prod; ao terminar, `move_card` + `update ... set blocker = null`. DML em prod passa pelo Igor (o classificador barra). O plano lista o SQL; não pular.
- Fechar o loop na mesma sessão: revisar → CI verde → mergear → apagar branch. Ao encerrar: "PRs que deixei abertos: …".

Deste PR:

- Worktree `WT` = `C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco` (no Git Bash: `/c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco`), branch `feat/vendedora-banco`, base `origin/main`. O cwd do Bash reseta entre chamadas: **sempre** caminho absoluto / `git -C "$WT"`.
- Nomes, assinaturas e erros exatamente como no contrato. As RPCs falham com `raise exception` cuja mensagem é **só** o token: `itens_invalidos`, `total_zero`, `pedido_nao_encontrado`, `fora_da_janela`.
- Toda função nova: `security invoker`, `set search_path = ''` (nomes totalmente qualificados), e logo depois do `create or replace` o par `revoke execute ... from public, anon, authenticated` + `grant execute ... to service_role` — o default privilege do grantor `postgres` dá EXECUTE a `authenticated` em função nova, e `create or replace` não preserva ACL em dev.
- Migração idempotente (`if not exists`, constraint guardada por `do $$ … $$`, `drop policy if exists`).
- **DDL é do Igor.** O agente nunca aplica DDL (nem em dev, nem por MCP/`execute_sql`/`db query`). A antes de B, em comandos separados; dev e prod em sequência, sem pausa. **Do DDL ao merge, sem parar:** enquanto a baseline nova não estiver na `main`, o job `drift` de **todo** PR aberto fica vermelho (ele compara o dev vivo com a baseline do checkout).
- RLS da vendedora (spec §1): a migração B reescreve **só** os helpers do RLS que leem `public.memberships` sem filtrar papel e são usados por alguma policy (esperado: `app.user_tenant_ids()` e `app.has_membership(uuid)`; a lista vale o que a Task 1 achar em **prod**). Corpo copiado **verbatim** do `pg_get_functiondef` de prod + a linha `and m.role <> 'seller'`; linguagem, volatilidade, `security definer` e `set search_path` exatamente como em prod; o EXECUTE capturado na Task 1 é reaplicado depois do `create or replace`. Helpers que já listam papéis (`user_admin_tenant_ids`, `user_operator_tenant_ids`, `has_role`) ficam intocados. Nenhuma policy muda.
- Teste de integração: nunca contra prod (`EM_PRODUCAO`); cria a própria loja descartável (organização + dona + vendedora com login de verdade) e a apaga no `after()`, junto com os dois usuários de auth — a loja de QA não é tocada; sem `t.skip()` (o CI exige `# skipped 0` no passo de integração).

## Riscos para os PRs seguintes

- **Upload de mídia do módulo `postar` (PR 5, ou antes de qualquer vendedora ganhar `postar`).** `src/lib/media-upload-client.ts` sobe o arquivo **do browser, com o JWT de quem está logado**, para o bucket `uploads`; quem libera é a policy `storage_uploads_insert_member` de `storage.objects`, que no repo (`infra/rls/202606240004_storage_policies.sql`) usa `app.has_membership((storage.foldername(name))[1]::uuid)` — e o mesmo vale para select e update. Depois deste PR, a vendedora recebe 403 do Storage nesse upload. Correção: `/api/media/prepare` emite URL assinada (`createSignedUploadUrl`, service-role) e o cliente usa `uploadToSignedUrl`. O `remove` do caminho de falha já só passa para owner/admin (`has_role`). A Task 1 confirma as policies de `storage.objects` em **prod** (aplicadas à mão; o repo pode divergir); o resultado vai no corpo do PR.
- **Realtime** (`postgres_changes` respeita RLS): a vendedora não recebe evento de tabela nenhuma; a casca dela não deve assinar canal (PR 5).
- **Teste estrutural do PR 3** (allowlist de `.from("memberships")`): o teste de integração deste PR **escreve** em `memberships` de propósito, mas não precisa de entrada — o estrutural do PR 3 ignora `*.test.ts(x)`, e `order-items.integration.test.ts` casa com esse sufixo (conferido no plano do PR 3).

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/stores/order-items.integration.test.ts` | criar | contra o banco de dev, numa loja descartável: as RPCs (soma, ordem, limites, janela de 24h, tenant, atomicidade, cascade) e o RLS da vendedora (JWT dela lê 0 linhas, o da dona lê) |
| `apps/web/supabase/migrations/20261007120000_member_role_seller.sql` | criar | `member_role` ganha `'seller'` |
| `apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql` | criar | helpers de leitura do RLS sem `seller`, `modules` + check, `created_by` + índice, `order_items` + RLS, `order_items_total`, as duas RPCs, ACL |
| `deploy/supabase/apply-order.txt` | modificar | as duas migrações, A antes de B |
| `infra/tests/acesso-vendedora-check.sql` | criar | conferência pós-aplicação nos dois bancos + assinatura para a baseline |
| `infra/tests/tenant-tables-escrita-check.sql` | modificar | `order_items` entra na lista de tabelas de tenant |
| `deploy/supabase/schema-baseline.json` | modificar | `t\|memberships`, `t\|orders`, `t\|order_items` e três `f\|` |

---

### Task 0: worktree, branch e card

**Files:** nenhum arquivo do repo (cria o worktree e dois `.sql` temporários fora dele).

**Interfaces:**
- Produces: worktree `WT` na branch `feat/vendedora-banco`, com `node_modules`; `C:\Users\Igor\AppData\Local\Temp\vendedora-card-inicio.sql` (usado na Task 1).

- [ ] **Step 1: ninguém pegou isto ainda.**

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform fetch origin main
git -C /c/Users/Igor/Desktop/HubFlow-platform ls-remote --heads origin feat/vendedora-banco
gh pr list --repo codingB0y/Girumo --state open --head feat/vendedora-banco
```

Esperado: as duas últimas sem saída. Se a branch já existe ou há PR aberto, **pare** e pergunte ao Igor (outra sessão está nela).

- [ ] **Step 2: criar o worktree a partir de `origin/main` e entrar nele.**

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform worktree add -b feat/vendedora-banco /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco origin/main
```

Depois chame a ferramenta `EnterWorktree` com `path: C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco`.

- [ ] **Step 3: defasagem** (regra de PR do `CLAUDE.md`):

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco fetch origin main
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco log HEAD..origin/main --oneline | wc -l
```

Esperado: `0`.

- [ ] **Step 4: `node_modules`.** Na ferramenta PowerShell:

```powershell
Test-Path "C:\Users\Igor\Desktop\HubFlow-platform\node_modules\next"
```

Se `True`, ligar por junction (caminhos absolutos; a segunda só se a pasta de origem existir):

```powershell
cmd /c mklink /J "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
if (Test-Path "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules") { cmd /c mklink /J "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules" }
```

Se `False` (o `node_modules` do principal vive vazio desde 05/10):

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco"; npm ci --workspace apps/web --include-workspace-root --no-audit --no-fund
```

- [ ] **Step 5: SQL do card** (o Igor roda na Task 1, junto com a conferência de prod). Crie com a ferramenta Write `C:\Users\Igor\AppData\Local\Temp\vendedora-card-inicio.sql`:

```sql
-- Card do quadro (prod). Cria se ainda não existe (o PR 1 roda em paralelo) e move.
insert into public.board_features (key, title, area, summary)
values ('acesso-vendedora', 'Acesso da vendedora (vendas por módulo)', 'Auth',
        'Papel seller: a vendedora registra venda com itens e o dono libera outros módulos (spec 2026-10-07-acesso-vendedora-design).')
on conflict (key) do nothing;

select public.move_card('acesso-vendedora', 'em_construcao',
  'PR 2 começou: banco da vendedora (seller, memberships.modules, orders.created_by, order_items, RPCs)',
  'feat/vendedora-banco');
```

### Task 1: conferir se algum objeto já existe (dev, prod, branches)

**Files:** nenhum arquivo do repo (cria `C:\Users\Igor\AppData\Local\Temp\vendedora-precheck.sql`).

**Interfaces:**
- Consumes: `vendedora-card-inicio.sql` (Task 0).
- Produces: a resposta "nada existe ainda em dev nem em prod"; a policy real de leitura de `orders`; e, de **prod** (fonte da verdade — os helpers foram aplicados à mão), para cada função de `app` que lê `memberships`: `pg_get_functiondef`, se filtra papel, quantas policies a usam e quem tem EXECUTE — mais as policies de `storage.objects`. Pré-condição das Tasks 3 e 5. Salvar as duas saídas (objeto `r`) em `C:\Users\Igor\AppData\Local\Temp\vendedora-precheck-dev.json` e `…-prod.json`. Guardar também `leads_phone` de prod: é a medição do §9 do spec que o PR 4 precisa.

- [ ] **Step 1: nada disto está em outro PR ou branch** (`CLAUDE.md`: em 30/07 uma migração foi reescrita à toa porque já existia numa branch):

```bash
gh pr list --repo codingB0y/Girumo --state open --limit 50 --json number,title,headRefName
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco log --all --oneline -S order_items -- apps/web/supabase deploy/supabase
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco log --all --oneline -S "'seller'" -- apps/web/supabase
```

Esperado: nenhum PR aberto mexendo em `memberships`/`orders`/vendas, e os dois `log -S` vazios. Se aparecer algo, abra (`git diff origin/main...origin/<branch> --stat`) e pare para perguntar ao Igor.

- [ ] **Step 2: escrever a conferência** com a ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\vendedora-precheck.sql`:

```sql
-- Conferência ANTES das migrações do PR 2 (acesso da vendedora). Só leitura.
-- Esperado em 07/10: member_role = [owner, admin, operator]; memberships_modules,
-- constraint_modules e order_items = false; funcoes = null; orders_cols sem created_by;
-- orders_pol com "orders_select_member r: (tenant_id = ANY (app.user_tenant_ids()))";
-- helpers = has_membership(uuid) e user_tenant_ids() com filtra_papel = false e policies > 0,
-- has_role, user_admin_tenant_ids e user_operator_tenant_ids com filtra_papel = true;
-- policies_inline_memberships = null; storage_policies com app.has_membership(...).
select json_build_object(
  -- Funções de app que leem memberships. Prod é a fonte da verdade do corpo (aplicado à mão).
  'helpers', (
    select json_agg(json_build_object(
      'fn', p.oid::regprocedure::text,
      'filtra_papel', p.prosrc ~* '\mrole\M',
      'policies', (
        select count(*) from pg_policy pol
        where coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' '
              || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
              like '%app.' || p.proname || '(%'),
      'lang', l.lanname,
      'volatil', p.provolatile,
      'secdef', p.prosecdef,
      'config', p.proconfig,
      'dono', p.proowner::regrole::text,
      'execute', (
        select json_agg(g order by g) from (
          select case when a.grantee = 0 then 'public' else a.grantee::regrole::text end as g
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
          where a.privilege_type = 'EXECUTE') as x),
      'def', pg_get_functiondef(p.oid))
      order by p.oid::regprocedure::text)
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.pronamespace = 'app'::regnamespace
      and p.prokind = 'f'
      and p.prosrc ilike '%memberships%'),
  -- Policy que lê memberships sem passar por helper também deixaria a vendedora ler.
  'policies_inline_memberships', (
    select json_agg(c.relname || '.' || pol.polname)
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    where coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' '
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ilike '%memberships%'),
  'storage_policies', (
    select json_agg(json_build_object(
      'pol', polname, 'cmd', polcmd,
      'using', pg_get_expr(polqual, polrelid),
      'check', pg_get_expr(polwithcheck, polrelid)) order by polname)
    from pg_policy where polrelid = 'storage.objects'::regclass),
  'member_role', (select json_agg(enumlabel order by enumsortorder) from pg_enum
                  where enumtypid = 'public.member_role'::regtype),
  'role_dist', (select json_agg(json_build_object('role', role::text, 'n', n))
                from (select role, count(*) as n from public.memberships group by role) r),
  'memberships_modules', exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'memberships' and column_name = 'modules'),
  'constraint_modules', exists (select 1 from pg_constraint where conname = 'memberships_modules_validos'),
  'orders_cols', (select json_agg(column_name order by ordinal_position) from information_schema.columns
                where table_schema = 'public' and table_name = 'orders'),
  'orders_pol', (select json_agg(polname || ' ' || polcmd || ': ' || coalesce(pg_get_expr(polqual, polrelid), '-'))
                from pg_policy where polrelid = 'public.orders'::regclass),
  'order_items', to_regclass('public.order_items') is not null,
  'funcoes', (select json_agg(p.oid::regprocedure::text) from pg_proc p
                where p.pronamespace = 'public'::regnamespace
                  and p.proname in ('create_order_with_items', 'replace_order_items', 'order_items_total')),
  'leads_phone', (select json_build_object('total', count(*),
                'com_phone', count(*) filter (where coalesce(phone, '') ~ '^\d{10,13}$'),
                'com_55', count(*) filter (where phone ~ '^55\d{10,11}$'))
                from public.leads)
) as r;
```

- [ ] **Step 3: dev, por você** (leitura em dev passa no classificador desde 03/10):

```bash
cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco/apps/web && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -f "C:/Users/Igor/AppData/Local/Temp/vendedora-precheck.sql"
```

Se o classificador negar, não tente por outra ferramenta: o Igor roda o mesmo arquivo em dev no Step 4 (troque o ref no bloco).

- [ ] **Step 4: PEÇA AO IGOR — prod (conferência + card).** Mande este bloco (PowerShell) e siga para a Task 2 enquanto ele roda; a Task 5 só começa com a resposta dele:

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f "C:\Users\Igor\AppData\Local\Temp\vendedora-precheck.sql" }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f "C:\Users\Igor\AppData\Local\Temp\vendedora-card-inicio.sql" }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

- [ ] **Step 5: guardar as saídas.** Com a ferramenta Write, salve o objeto `r` (de `rows[0].r`) de dev em `C:\Users\Igor\AppData\Local\Temp\vendedora-precheck-dev.json` e o de prod em `C:\Users\Igor\AppData\Local\Temp\vendedora-precheck-prod.json` (JSON puro). A Task 3 copia os corpos de lá.

- [ ] **Step 6: decidir.** Nos dois bancos o resultado tem de bater com o "Esperado" do cabeçalho do SQL. Pare e mostre a saída ao Igor se:
  - qualquer objeto do PR já existir — `create table if not exists` pularia em silêncio uma tabela com outra forma;
  - `orders_pol` de leitura não for `tenant_id = ANY (app.user_tenant_ids())` — a policy de `order_items` (Task 3) copia a de `orders`;
  - `policies_inline_memberships` não for `null` — essas policies deixariam a vendedora ler sem passar por helper, e reescrever policy está fora deste PR;
  - `helpers` de dev e de prod divergirem em `def`, `config`, `secdef` ou `execute` — a migração é uma só para os dois bancos; o Igor decide (prod é a fonte da verdade).

  **Quais helpers recebem o filtro:** os de `helpers` com `filtra_papel = false` **e** `policies > 0`. Esperado: `app.has_membership(target_tenant_id uuid)` e `app.user_tenant_ids()`. Função de `app` que lê `memberships` sem filtrar papel mas não aparece em policy nenhuma (`policies = 0`) não é porta do RLS: fica como está e entra no corpo do PR. Se aparecer um terceiro helper com `filtra_papel = false` e `policies > 0`, ele entra na migração B com o mesmo tratamento da Task 3, Step 2 (corpo de prod verbatim + `and m.role <> 'seller'` no `where` da leitura de `memberships`, ACL reaplicado) e na lista de helpers do check (Task 4) e do teste (Task 2).

  **Storage:** anote as `storage_policies` de prod. Se alguma usar `app.has_membership(...)` ou `app.user_tenant_ids()` (esperado: select, insert e update de `uploads`), o risco de upload do PR 5 descrito em "Riscos" está confirmado — copie as policies para o corpo do PR (Task 7).

### Task 2: teste de integração das RPCs e do RLS da vendedora (RED)

**Files:**
- Create: `apps/web/src/lib/stores/order-items.integration.test.ts`

**Interfaces:**
- Consumes (criadas na Task 3, nomes do contrato):
  - `public.create_order_with_items(p_tenant_id uuid, p_created_by uuid, p_lead_id uuid, p_phone text, p_group_name text, p_campaign_id uuid, p_items jsonb) returns public.orders`
  - `public.replace_order_items(p_tenant_id uuid, p_order_id uuid, p_items jsonb, p_only_author uuid) returns public.orders`
  - `public.order_items (id, tenant_id, order_id, position, name, quantity, unit_price, created_at)`
  - `public.member_role` com `'seller'`; `app.user_tenant_ids()` e `app.has_membership(uuid)` sem `seller`
  - erros `itens_invalidos`, `total_zero`, `pedido_nao_encontrado`, `fora_da_janela`
  - já existentes: `getSupabaseAdmin()` e `getSupabaseAnonForToken(accessToken)` de `@/lib/supabase/server`
- Produces: o gate de aceitação do PR — roda no passo "Integracao das stores contra o banco de dev" do job `e2e` (glob `src/**/*.integration.test.ts`; lá existem `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `E2E_TENANT_ID`). 11 testes.

- [ ] **Step 1: escrever o teste.** Ele cria uma loja descartável (organização + dona + vendedora, com usuário de auth e login por senha, no padrão de `api/auth/signup`: `auth.admin.createUser` com `email_confirm: true`, depois o mesmo `POST /auth/v1/token?grant_type=password` que o passo de integração do CI faz com `curl`) e apaga tudo no `after()`. A loja de QA não é tocada. O `.from("memberships")` é de propósito (cria as duas memberships) — ver "Riscos" sobre a allowlist do PR 3.

```ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";

/**
 * Contra o Supabase de DEV, numa loja descartável criada aqui e apagada no fim
 * (organização + dona + vendedora, com login de verdade). A loja de QA não é
 * tocada; E2E_TENANT_ID é só a chave de ligar — o CI o define no passo de
 * integração.
 *
 * 1. As RPCs da venda com itens (`create_order_with_items`, `replace_order_items`,
 *    migração 20261007120100): limites dos itens, soma, janela de 24h da autora e
 *    atomicidade estão no SQL — PostgREST falso não os alcança. As mensagens de
 *    erro são contrato com a API de vendas (PR 4), que as traduz.
 * 2. O RLS da vendedora (spec §1, "RLS"): o JWT dela fica no browser e a anon key
 *    é pública. Com ele, o PostgREST não pode devolver nada da loja; com o da dona,
 *    devolve. Tirar `and m.role <> 'seller'` de um helper de leitura derruba o
 *    teste de RLS.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
// Estas linhas criam usuário e loja: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const HORA_MS = 3_600_000;

type Pessoa = { id: string; token: string };
type Pedido = {
  id: string;
  tenant_id: string;
  created_by: string | null;
  phone: string;
  group_name: string | null;
  value: number | string;
};
type Resultado = { pedido: Pedido | null; erro: string | null };
type ItemSalvo = { position: number; name: string; quantity: number; unit_price: number | string };
type Tabela = "organizations" | "leads" | "orders" | "order_items";

const usuarios: string[] = [];
let loja = "";
let dona: Pessoa = { id: "", token: "" };
let vendedora: Pessoa = { id: "", token: "" };

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!LIGADO) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

/** Usuário de auth novo + login por senha no GoTrue: devolve o id e o JWT dele. */
async function criarPessoa(apelido: string): Promise<Pessoa> {
  const email = `vendtest-${RUN}-${apelido}@exemplo.invalid`;
  // Gerada aqui e descartada com o usuário no after().
  const password = `${randomUUID()}-Aa1!`;
  const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${apelido}: ${error?.message ?? "sem usuário"}`);
  usuarios.push(data.user.id);

  // O mesmo caminho do passo de integração do CI (curl em /auth/v1/token).
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const resposta = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_ANON_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resposta.ok) throw new Error(`login de ${apelido}: ${resposta.status} ${await resposta.text()}`);
  const { access_token: token } = (await resposta.json()) as { access_token: string };
  return { id: data.user.id, token };
}

before(async () => {
  if (pular()) return;
  // Sem a anon key não há login, e o teste de RLS não provaria nada.
  if (!process.env.SUPABASE_ANON_KEY) throw new Error("integração ligada sem SUPABASE_ANON_KEY");
  const supabase = getSupabaseAdmin();

  const { data: org, error: erroLoja } = await supabase
    .from("organizations")
    .insert({ name: `vendtest ${RUN}`, slug: `vendtest-${RUN}` })
    .select("id")
    .single();
  if (erroLoja) throw new Error(erroLoja.message);
  loja = org!.id as string;

  dona = await criarPessoa("dona");
  vendedora = await criarPessoa("vendedora");

  const aceito = new Date().toISOString();
  const { error: erroMembros } = await supabase.from("memberships").insert([
    { tenant_id: loja, user_id: dona.id, role: "owner", accepted_at: aceito },
    { tenant_id: loja, user_id: vendedora.id, role: "seller", accepted_at: aceito },
  ]);
  if (erroMembros) throw new Error(erroMembros.message);

  // Um contato, para o teste de RLS ter o que (não) ler em leads.
  const { error: erroContato } = await supabase.from("leads").insert({
    tenant_id: loja,
    phone: null,
    name: "Cliente teste",
    source_group_id: `vendtest-${RUN}@g.us`,
    entered_at: "2020-01-01T00:00:00.000Z",
  });
  if (erroContato) throw new Error(erroContato.message);
});

after(async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  // A loja leva junto memberships, leads, orders e order_items (on delete cascade).
  if (loja) {
    const { error } = await supabase.from("organizations").delete().eq("tenant_id", loja);
    if (error) throw new Error(error.message);
  }
  for (const id of usuarios) {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
  }
});

async function criar(itens: unknown): Promise<Resultado> {
  const { data, error } = await getSupabaseAdmin().rpc("create_order_with_items", {
    p_tenant_id: loja,
    p_created_by: vendedora.id,
    p_lead_id: null,
    p_phone: "+55 (11) 90000-0000",
    p_group_name: "  VIP teste  ",
    p_campaign_id: null,
    p_items: itens,
  });
  return { pedido: (data ?? null) as Pedido | null, erro: error?.message ?? null };
}

async function trocar(
  pedidoId: string,
  itens: unknown,
  soAutora: string | null,
  tenantId: string = loja,
): Promise<Resultado> {
  const { data, error } = await getSupabaseAdmin().rpc("replace_order_items", {
    p_tenant_id: tenantId,
    p_order_id: pedidoId,
    p_items: itens,
    p_only_author: soAutora,
  });
  return { pedido: (data ?? null) as Pedido | null, erro: error?.message ?? null };
}

/** [position, name, quantity, unit_price] na ordem gravada. */
async function itensDo(pedidoId: string): Promise<Array<[number, string, number, number]>> {
  const { data, error } = await getSupabaseAdmin()
    .from("order_items")
    .select("position, name, quantity, unit_price")
    .eq("tenant_id", loja)
    .eq("order_id", pedidoId)
    .order("position");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ItemSalvo[]).map((i) => [i.position, i.name, i.quantity, Number(i.unit_price)]);
}

async function valorDo(pedidoId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("value")
    .eq("tenant_id", loja)
    .eq("id", pedidoId)
    .single();
  if (error) throw new Error(error.message);
  return Number(data!.value);
}

async function pedidosDaLoja(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", loja);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Pedido válido de um item (Blusa · 1 · R$ 50), ponto de partida das correções. */
async function pedidoDeUmItem(): Promise<Pedido> {
  const { pedido, erro } = await criar([{ name: "Blusa", quantity: 1, unit_price: 50 }]);
  assert.equal(erro, null);
  return pedido!;
}

/** Linhas da loja que o PostgREST devolve para este JWT (caminho `authenticated`, com RLS). */
async function linhasVisiveis(token: string, tabela: Tabela): Promise<number> {
  const { data, error } = await getSupabaseAnonForToken(token).from(tabela).select("id").eq("tenant_id", loja);
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return (data ?? []).length;
}

const OUTROS_ITENS = [{ name: "Vestido", quantity: 1, unit_price: 99 }];

test("registra pedido e itens juntos: total = soma de quantidade × preço, na ordem enviada, nome aparado", async () => {
  if (pular()) return;
  const { pedido, erro } = await criar([
    { name: "  Blusa  ", quantity: 2, unit_price: 49.9 },
    { name: "Saia", quantity: 1, unit_price: 89.95 },
    // Brinde: item de valor zero é aceito; só a venda inteira precisa somar > 0.
    { name: "Brinde", quantity: 1, unit_price: 0 },
  ]);
  assert.equal(erro, null);
  assert.equal(Number(pedido!.value), 189.75);
  assert.equal(pedido!.tenant_id, loja);
  assert.equal(pedido!.created_by, vendedora.id);
  assert.equal(pedido!.phone, "5511900000000", "o telefone é gravado só com dígitos, como no addOrder");
  assert.equal(pedido!.group_name, "VIP teste");
  assert.deepEqual(await itensDo(pedido!.id), [
    [0, "Blusa", 2, 49.9],
    [1, "Saia", 1, 89.95],
    [2, "Brinde", 1, 0],
  ]);
});

test("50 itens é o teto e passa", async () => {
  if (pular()) return;
  const { pedido, erro } = await criar(
    Array.from({ length: 50 }, (_, i) => ({ name: `Peça ${i + 1}`, quantity: 1, unit_price: 1 })),
  );
  assert.equal(erro, null);
  assert.equal(Number(pedido!.value), 50);
  const itens = await itensDo(pedido!.id);
  assert.deepEqual(itens.map(([posicao]) => posicao), Array.from({ length: 50 }, (_, i) => i));
});

test("item fora do limite: itens_invalidos, e nenhum pedido sem itens fica para trás", async () => {
  if (pular()) return;
  const valido = { name: "Blusa", quantity: 1, unit_price: 10 };
  const casos: Array<[string, unknown]> = [
    ["lista vazia", []],
    ["51 itens", Array.from({ length: 51 }, () => valido)],
    ["nome só com espaço", [{ ...valido, name: "   " }]],
    ["nome com 121 letras", [{ ...valido, name: "a".repeat(121) }]],
    ["item sem nome", [{ quantity: 1, unit_price: 10 }]],
    ["quantidade 0", [{ ...valido, quantity: 0 }]],
    ["quantidade 10000", [{ ...valido, quantity: 10000 }]],
    ["quantidade quebrada", [{ ...valido, quantity: 1.5 }]],
    ["preço negativo", [{ ...valido, unit_price: -1 }]],
    ["preço acima de 999999,99", [{ ...valido, unit_price: 1000000 }]],
    ["preço como texto", [{ ...valido, unit_price: "10" }]],
    ["segundo item inválido depois de um válido", [valido, { ...valido, quantity: 0 }]],
    [
      "soma acima do teto de orders.value (numeric(12,2))",
      [
        { name: "a", quantity: 9999, unit_price: 999999.99 },
        { name: "b", quantity: 9999, unit_price: 999999.99 },
      ],
    ],
  ];
  const antes = await pedidosDaLoja();
  for (const [caso, itens] of casos) {
    const { erro } = await criar(itens);
    assert.equal(erro, "itens_invalidos", caso);
  }
  assert.equal(await pedidosDaLoja(), antes, "item inválido não pode deixar pedido órfão");
});

test("soma zero: total_zero, sem pedido órfão", async () => {
  if (pular()) return;
  const antes = await pedidosDaLoja();
  const { erro } = await criar([{ name: "Brinde", quantity: 2, unit_price: 0 }]);
  assert.equal(erro, "total_zero");
  assert.equal(await pedidosDaLoja(), antes);
});

test("a autora corrige dentro de 24h: troca os itens e recalcula o total", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  const { pedido: corrigido, erro } = await trocar(
    pedido.id,
    [
      { name: "Vestido", quantity: 3, unit_price: 120 },
      { name: "Cinto", quantity: 1, unit_price: 15.5 },
    ],
    vendedora.id,
  );
  assert.equal(erro, null);
  assert.equal(corrigido!.id, pedido.id);
  assert.equal(Number(corrigido!.value), 375.5);
  assert.deepEqual(await itensDo(pedido.id), [
    [0, "Vestido", 3, 120],
    [1, "Cinto", 1, 15.5],
  ]);
});

test("quem não é a autora não corrige: fora_da_janela, e nada muda", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  // Outra vendedora: a API passa o authUserId de quem chama como p_only_author.
  const { erro } = await trocar(pedido.id, OUTROS_ITENS, randomUUID());
  assert.equal(erro, "fora_da_janela");
  assert.deepEqual(await itensDo(pedido.id), [[0, "Blusa", 1, 50]]);
  assert.equal(await valorDo(pedido.id), 50);
});

test("passou de 24h: a autora não corrige mais; sem p_only_author (dono/admin) corrige", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  const { error } = await getSupabaseAdmin()
    .from("orders")
    .update({ created_at: new Date(Date.now() - 25 * HORA_MS).toISOString() })
    .eq("tenant_id", loja)
    .eq("id", pedido.id);
  if (error) throw new Error(error.message);

  assert.equal((await trocar(pedido.id, OUTROS_ITENS, vendedora.id)).erro, "fora_da_janela");
  assert.deepEqual(await itensDo(pedido.id), [[0, "Blusa", 1, 50]]);

  const dono = await trocar(pedido.id, OUTROS_ITENS, null);
  assert.equal(dono.erro, null);
  assert.equal(Number(dono.pedido!.value), 99);
  assert.deepEqual(await itensDo(pedido.id), [[0, "Vestido", 1, 99]]);
});

test("pedido de outra loja ou que não existe: pedido_nao_encontrado", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  // O service-role passa por cima do RLS: é o p_tenant_id que isola.
  assert.equal((await trocar(pedido.id, OUTROS_ITENS, null, randomUUID())).erro, "pedido_nao_encontrado");
  assert.equal((await trocar(randomUUID(), OUTROS_ITENS, null)).erro, "pedido_nao_encontrado");
  assert.deepEqual(await itensDo(pedido.id), [[0, "Blusa", 1, 50]]);
});

test("correção com item inválido ou soma zero: erro, e itens e total antigos ficam", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  assert.equal((await trocar(pedido.id, [], vendedora.id)).erro, "itens_invalidos");
  assert.equal(
    (await trocar(pedido.id, [{ name: "Brinde", quantity: 1, unit_price: 0 }], vendedora.id)).erro,
    "total_zero",
  );
  assert.deepEqual(await itensDo(pedido.id), [[0, "Blusa", 1, 50]]);
  assert.equal(await valorDo(pedido.id), 50);
});

test("apagar o pedido apaga os itens (on delete cascade)", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  assert.equal((await itensDo(pedido.id)).length, 1);
  const { error } = await getSupabaseAdmin().from("orders").delete().eq("tenant_id", loja).eq("id", pedido.id);
  if (error) throw new Error(error.message);
  assert.deepEqual(await itensDo(pedido.id), []);
});

test("RLS: com o JWT da vendedora o PostgREST não devolve nada da loja; com o da dona, devolve", async () => {
  if (pular()) return;
  const { erro } = await criar([{ name: "Blusa", quantity: 1, unit_price: 50 }]);
  assert.equal(erro, null);
  // organizations passa por app.has_membership(); leads, orders e order_items, por app.user_tenant_ids().
  const tabelas: Tabela[] = ["organizations", "leads", "orders", "order_items"];
  for (const tabela of tabelas) {
    assert.ok(
      (await linhasVisiveis(dona.token, tabela)) > 0,
      `a dona não viu ${tabela}: o controle falhou e o teste não prova nada`,
    );
    assert.equal(await linhasVisiveis(vendedora.token, tabela), 0, `a vendedora leu ${tabela} direto do banco`);
  }
});
```

- [ ] **Step 2: tipos e lint.**

```bash
cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco/apps/web && npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/stores/order-items.integration.test.ts
```

Esperado: sem erro.

- [ ] **Step 3: RED.** Primeiro descubra se há credencial de dev nesta máquina (imprime só o ref do projeto, nunca a chave):

```bash
for f in /c/Users/Igor/Desktop/HubFlow-platform/apps/web/.env.local /c/Users/Igor/Desktop/HubFlow-platform/.env.local; do [ -f "$f" ] && echo "$f -> $(grep -oE '^SUPABASE_URL=https://[a-z]+' "$f")"; done
```

Se algum arquivo mostrar `https://wfjuwogxaupyadwhvoxy`, guarde o caminho dele como `ENVFILE` e rode (a anon key pode estar só como `NEXT_PUBLIC_SUPABASE_ANON_KEY`, que é a mesma chave; `E2E_TENANT_ID` aqui é só a chave de ligar):

```bash
ENVFILE=<arquivo de cima>; cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco/apps/web && set -a && source <(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)=' "$ENVFILE" | sed 's/\r$//') && SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$NEXT_PUBLIC_SUPABASE_ANON_KEY}" && set +a && E2E_TENANT_ID=4483abf8-3483-40bf-a448-6b3ce9496374 npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/order-items.integration.test.ts
```

Esperado: FAIL no `before` — `invalid input value for enum member_role: "seller"` (a migração A ainda não existe); a loja e os usuários criados até ali são apagados pelo `after()`. Sem credencial de dev, este passo não tem RED local: rode o mesmo comando sem as variáveis e confirme que os 11 testes passam por `pular()` (é o que o `verify` do CI faz); o GREEN fica para o job `e2e` (Task 7).

- [ ] **Step 4: commit.**

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco add apps/web/src/lib/stores/order-items.integration.test.ts
```
```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco diff --cached --stat
```
```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco commit -F - <<'EOF'
test(db): integration test for the order-with-items RPCs and the seller RLS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 3: as duas migrações

**Files:**
- Create: `apps/web/supabase/migrations/20261007120000_member_role_seller.sql`
- Create: `apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql`

**Interfaces:**
- Consumes: `app.user_tenant_ids()` (helper real da policy `orders_select_member`, migração `20260713100000_rls_standardization.sql`; confirmado nos dois bancos na Task 1); de `vendedora-precheck-prod.json` (Task 1): `def`, `config`, `secdef`, `volatil`, `lang` e `execute` de cada helper que recebe o filtro; `public.organizations`, `public.orders`, `public.memberships`, `auth.users`.
- Produces (contrato "PR 2 → PR 3, 4, 6"):
  - `public.member_role` com `'seller'`.
  - `app.user_tenant_ids()` e `app.has_membership(target_tenant_id uuid)` (e qualquer outro helper que a Task 1 apontar) excluem `seller`: zero acesso `authenticated` para a vendedora. Assinatura, retorno, linguagem, volatilidade, `security definer`, `search_path` e EXECUTE iguais aos de prod.
  - `public.memberships.modules text[] not null default '{}'` + constraint `memberships_modules_validos`.
  - `public.orders.created_by uuid null references auth.users(id) on delete set null` + índice `orders_tenant_created_by_idx (tenant_id, created_by, created_at desc)`.
  - `public.order_items (id, tenant_id, order_id, position, name, quantity, unit_price, created_at)`, RLS ligado, policy `order_items_select_member`, escrita só `service_role`.
  - `public.create_order_with_items(p_tenant_id uuid, p_created_by uuid, p_lead_id uuid, p_phone text, p_group_name text, p_campaign_id uuid, p_items jsonb) returns public.orders`
  - `public.replace_order_items(p_tenant_id uuid, p_order_id uuid, p_items jsonb, p_only_author uuid) returns public.orders`
  - Interno (nenhum outro PR chama): `public.order_items_total(p_items jsonb) returns numeric` — valida e soma, para as duas RPCs terem uma regra só.
  - Erros: `itens_invalidos`, `total_zero`, `pedido_nao_encontrado`, `fora_da_janela`.

- [ ] **Step 1: migração A** — `apps/web/supabase/migrations/20261007120000_member_role_seller.sql`:

```sql
-- Acesso da vendedora, PR 2 (docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md §2):
-- papel novo 'seller'.
--
-- SOZINHA de propósito: valor novo de enum não pode ser usado na transação em que nasce
-- ("unsafe use of new value"). 20261007120100_acesso_vendedora.sql usa 'seller' num CHECK e
-- só roda depois desta commitada — aplicar em comandos separados, esta primeiro.
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).
-- Não muda a baseline: schema_signature() não vê valor de enum — conferir com
-- infra/tests/acesso-vendedora-check.sql (ok_enum_seller).

alter type public.member_role add value if not exists 'seller';
```

- [ ] **Step 2: conferir os helpers contra prod antes de escrever B.** O bloco `0)` da migração abaixo foi escrito com os corpos do repo (`infra/rls/202606240002_rls_policies.sql:12-25` e `20260713100000_rls_standardization.sql:32-43`). Prod é a fonte da verdade. Para cada helper que a Task 1 apontou (`filtra_papel = false` e `policies > 0`), compare com `def` de `vendedora-precheck-prod.json`:
  - o corpo entre `AS $function$` e `$function$`, ignorando só espaço em branco;
  - `config` (esperado `["search_path=public"]` em `user_tenant_ids` e `["search_path=public, auth"]` em `has_membership`), `secdef` (`true`), `volatil` (`"s"` = stable), `lang` (`"sql"`), e a assinatura/retorno;
  - `execute` (esperado `["postgres", "public"]` — ACL nulo, o default de função fora de `public`).

  Diferiu em qualquer um: troque o bloco `0)` pelo de prod **verbatim**, acrescentando só a linha `and m.role <> 'seller'` no `where` que lê `public.memberships`, com os mesmos `language`/volatilidade/`security definer`/`set search_path` de prod. Para o ACL, o par depois do `create or replace` é sempre `revoke all on function <fn> from public, anon, authenticated, service_role;` seguido de `grant execute on function <fn> to <papéis de "execute" menos o dono>;` (`public` vira `public`). Helper extra apontado pela Task 1 entra no mesmo bloco, do mesmo jeito.

- [ ] **Step 3: migração B** — `apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql`:

```sql
-- Acesso da vendedora, PR 2 (docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md §1 "RLS"
-- e §2; contrato em docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md, "PR 2 → PR 3, 4, 6").
--
-- Depende de 20261007120000_member_role_seller.sql JÁ COMMITADA: os helpers do RLS e o CHECK de
-- memberships comparam role com 'seller'.
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns) e muda
-- deploy/supabase/schema-baseline.json: t|memberships, t|orders, t|order_items e três f|.
-- O gate de drift não vê schema app, constraint, índice, policy, ACL nem corpo de função —
-- conferir com infra/tests/acesso-vendedora-check.sql nos dois bancos.

-- 0) RLS: a vendedora não lê nada direto do banco.
--    O access token dela fica no browser (src/lib/supabase/client.ts) e a anon key é pública;
--    authenticated mantém SELECT em public. Os helpers de LEITURA abaixo não filtravam papel, então
--    pelo PostgREST ela leria leads, orders e as outras tabelas da loja inteira, passando por cima
--    do guard da API e da decisão "só busca por número". Com o filtro, seller tem zero acesso
--    authenticated: tudo dela passa por rota service-role + guard.
--    Só estes dois mudam: user_admin_tenant_ids, user_operator_tenant_ids e has_role já listam
--    papéis e excluem seller. Nenhuma policy muda. Nenhuma vendedora existe hoje: ninguém perde
--    acesso. Corpo, linguagem, volatilidade, security definer e search_path copiados de
--    pg_get_functiondef de PROD (Task 1 do plano do PR 2); a única linha nova é a do seller.
--    Consequência conhecida: o upload direto do browser para storage.objects (policy com
--    app.has_membership) deixa de valer para seller — o módulo postar precisa de URL assinada.
create or replace function app.user_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and m.accepted_at is not null
    and m.role <> 'seller';
$$;

create or replace function app.has_membership(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.accepted_at is not null
      and m.role <> 'seller'
  )
$$;

-- create or replace não preserva ACL em todo banco: devolve exatamente o EXECUTE capturado em prod
-- na Task 1 (dono + PUBLIC = ACL nulo). Sem EXECUTE para authenticated, toda policy que chama
-- estes helpers passa a negar tudo para todo mundo.
revoke all on function app.user_tenant_ids() from public, anon, authenticated, service_role;
grant execute on function app.user_tenant_ids() to public;
revoke all on function app.has_membership(uuid) from public, anon, authenticated, service_role;
grant execute on function app.has_membership(uuid) to public;

comment on function app.user_tenant_ids() is
  'Tenants where auth.uid() holds an accepted membership, except as seller (seller has no authenticated access; spec 2026-10-07 §1). Single RLS mechanism.';
comment on function app.has_membership(uuid) is
  'True when auth.uid() holds an accepted membership in the tenant, except as seller (seller has no authenticated access; spec 2026-10-07 §1).';

-- 1) Módulos extras da vendedora. 'vendas' é implícito para seller e não é gravado; outro papel
--    não tem módulo nenhum (o acesso dele não passa por aqui).
alter table public.memberships
  add column if not exists modules text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.memberships'::regclass
      and conname = 'memberships_modules_validos'
  ) then
    alter table public.memberships
      add constraint memberships_modules_validos
      check (modules <@ array['postar']::text[] and (role = 'seller' or modules = '{}'));
  end if;
end;
$$;

comment on column public.memberships.modules is
  'Módulos opcionais liberados pelo dono para a vendedora (role = seller). vendas é implícito e não é gravado.';

-- 2) Quem registrou o pedido: "Minhas vendas" da vendedora e a janela de 24h para ela corrigir.
alter table public.orders
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists orders_tenant_created_by_idx
  on public.orders (tenant_id, created_by, created_at desc);

-- 3) Itens do pedido. orders.value continua sendo o total (Resultados, caixa do mês,
--    painel-metrics e atribuição por campanha não mudam); pedido antigo fica sem itens.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  position smallint not null default 0,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  quantity integer not null check (quantity between 1 and 9999),
  unit_price numeric(12,2) not null check (unit_price between 0 and 999999.99),
  created_at timestamptz not null default now()
);

comment on table public.order_items is
  'Itens de um pedido (nome livre, quantidade, valor unitário). Escrita só pelas RPCs create_order_with_items e replace_order_items, sob service-role.';

create index if not exists order_items_order_idx
  on public.order_items (order_id, position);

-- RLS como segunda linha, leitura no mesmo padrão de orders (orders_select_member).
alter table public.order_items enable row level security;
drop policy if exists order_items_select_member on public.order_items;
create policy order_items_select_member on public.order_items
  for select to authenticated
  using (tenant_id = any (app.user_tenant_ids()));

-- Só o servidor escreve. O event trigger de 20261004120000 já revoga isto em tabela nova;
-- fica explícito para não depender dele estar aplicado no banco. SELECT de authenticated fica,
-- como em orders: é onde a policy acima vale (e ela já exclui seller pelo helper do bloco 0).
revoke all on public.order_items from anon;
revoke insert, update, delete, truncate on public.order_items from authenticated;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.order_items to service_role;

-- 4) Validação e total dos itens: uma regra só para as duas RPCs.
--    p_items = [{ "name": text, "quantity": int, "unit_price": numeric }], 1..50, na ordem.
create or replace function public.order_items_total(p_items jsonb)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  qtd numeric;
  preco numeric;
  total numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'itens_invalidos';
  end if;
  -- Separado do if de cima: o Postgres não garante a ordem de avaliação de um "or", e
  -- jsonb_array_length estoura em valor que não é array.
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'itens_invalidos';
  end if;

  for item in select e.elemento from jsonb_array_elements(p_items) as e(elemento) loop
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item -> 'name') is distinct from 'string'
       or jsonb_typeof(item -> 'quantity') is distinct from 'number'
       or jsonb_typeof(item -> 'unit_price') is distinct from 'number' then
      raise exception 'itens_invalidos';
    end if;

    qtd := (item ->> 'quantity')::numeric;
    preco := (item ->> 'unit_price')::numeric;
    if char_length(btrim(item ->> 'name')) not between 1 and 120
       or qtd <> trunc(qtd)
       or qtd not between 1 and 9999
       or preco not between 0 and 999999.99 then
      raise exception 'itens_invalidos';
    end if;

    -- O mesmo arredondamento que numeric(12,2) faz ao gravar o item: total = soma dos itens gravados.
    total := total + qtd * round(preco, 2);
  end loop;

  -- Teto de orders.value (numeric(12,2)): passar disso estouraria o insert com um erro sem nome.
  if total > 9999999999.99 then
    raise exception 'itens_invalidos';
  end if;
  if total <= 0 then
    raise exception 'total_zero';
  end if;

  return round(total, 2);
end;
$$;

comment on function public.order_items_total(jsonb) is
  'Valida p_items (1..50; name 1..120 após trim; quantity inteiro 1..9999; unit_price 0..999999.99) e devolve a soma > 0. Erros: itens_invalidos, total_zero. Uso interno das RPCs de pedido.';

revoke execute on function public.order_items_total(jsonb) from public, anon, authenticated;
grant execute on function public.order_items_total(jsonb) to service_role;

-- 5) Registrar pedido com itens, numa transação só (a da chamada RPC).
create or replace function public.create_order_with_items(
  p_tenant_id uuid,
  p_created_by uuid,
  p_lead_id uuid,
  p_phone text,
  p_group_name text,
  p_campaign_id uuid,
  p_items jsonb
)
returns public.orders
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  pedido public.orders;
begin
  insert into public.orders (tenant_id, created_by, lead_id, phone, group_name, campaign_id, value)
  values (
    p_tenant_id,
    p_created_by,
    p_lead_id,
    -- Só dígitos, como o addOrder grava hoje.
    regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'),
    nullif(btrim(p_group_name), ''),
    p_campaign_id,
    public.order_items_total(p_items)
  )
  returning * into pedido;

  insert into public.order_items (tenant_id, order_id, position, name, quantity, unit_price)
  select p_tenant_id,
         pedido.id,
         (e.ord - 1)::smallint,
         btrim(e.item ->> 'name'),
         (e.item ->> 'quantity')::numeric::integer,
         round((e.item ->> 'unit_price')::numeric, 2)
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);

  return pedido;
end;
$$;

comment on function public.create_order_with_items(uuid, uuid, uuid, text, text, uuid, jsonb) is
  'Grava o pedido (value = soma dos itens) e os itens na ordem de p_items. Erros: itens_invalidos, total_zero. Chamada só pelo servidor, com o tenant explícito.';

revoke execute on function public.create_order_with_items(uuid, uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_items(uuid, uuid, uuid, text, text, uuid, jsonb) to service_role;

-- 6) Corrigir os itens de um pedido. p_only_author não nulo = regra da vendedora: só o pedido
--    dela, criado há menos de 24h. Dono/admin/operador passam null.
create or replace function public.replace_order_items(
  p_tenant_id uuid,
  p_order_id uuid,
  p_items jsonb,
  p_only_author uuid
)
returns public.orders
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  pedido public.orders;
  total numeric;
begin
  select * into pedido
  from public.orders o
  where o.id = p_order_id
    and o.tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if p_only_author is not null
     and (pedido.created_by is distinct from p_only_author
          or pedido.created_at <= now() - interval '24 hours') then
    raise exception 'fora_da_janela';
  end if;

  total := public.order_items_total(p_items);

  delete from public.order_items i
  where i.tenant_id = p_tenant_id
    and i.order_id = p_order_id;

  insert into public.order_items (tenant_id, order_id, position, name, quantity, unit_price)
  select p_tenant_id,
         p_order_id,
         (e.ord - 1)::smallint,
         btrim(e.item ->> 'name'),
         (e.item ->> 'quantity')::numeric::integer,
         round((e.item ->> 'unit_price')::numeric, 2)
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);

  update public.orders o
  set value = total
  where o.id = p_order_id
    and o.tenant_id = p_tenant_id
  returning * into pedido;

  return pedido;
end;
$$;

comment on function public.replace_order_items(uuid, uuid, jsonb, uuid) is
  'Troca os itens do pedido e recalcula value. Com p_only_author: só se created_by = p_only_author e created_at > now() - 24h. Erros: pedido_nao_encontrado, fora_da_janela, itens_invalidos, total_zero.';

revoke execute on function public.replace_order_items(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.replace_order_items(uuid, uuid, jsonb, uuid) to service_role;

-- O PostgREST passa a enxergar as RPCs sem esperar o recarregamento automático.
notify pgrst, 'reload schema';
```

- [ ] **Step 4: autoconferência no arquivo** (o banco só vê isto na Task 5; um erro aqui custa uma ida e volta com o Igor):

```bash
cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco && grep -c "security invoker" apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql && grep -c "set search_path = ''" apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql && grep -c "from public, anon, authenticated;" apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql && grep -c "to service_role;" apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql && grep -c "and m.role <> 'seller'" apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql && grep -c "^grant execute on function app\." apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql && grep -oE "raise exception '[a-z_]+'" apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql | sort | uniq -c
```

Esperado: `3`, `3`, `3`, `4` (três funções + a tabela), `2` e `2` (um por helper; mais, se a Task 1 apontou helper extra) e as mensagens `fora_da_janela` (1), `itens_invalidos` (5), `pedido_nao_encontrado` (1), `total_zero` (1) — nenhuma outra. Releia também o arquivo procurando nome não qualificado dentro dos corpos das três funções novas (tudo de tabela/função do projeto começa com `public.`; os helpers do bloco `0)` ficam como em prod, com `search_path` próprio).

- [ ] **Step 5: o teste de privilégio do repo continua verde** (ele varre a apply-order; as funções novas são invoker, então não entram nele, mas a varredura não pode quebrar):

```bash
cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco/apps/web && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/supabase/privilegio-definer.test.ts
```

Esperado: PASS.

- [ ] **Step 6: commit.**

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco add apps/web/supabase/migrations/20261007120000_member_role_seller.sql apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql
```
```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco diff --cached --stat
```
```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco commit -F - <<'EOF'
feat(db): seller role, member modules, order author, order items and order RPCs

Two migrations: the enum value goes alone because a new enum value cannot be
used in the transaction that adds it. order_items is written only through
create_order_with_items / replace_order_items (security invoker, empty
search_path, execute granted to service_role only). The RLS read helpers
app.user_tenant_ids() and app.has_membership() now exclude seller, so a
seller's JWT reads nothing through PostgREST; bodies copied from production.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4: ordem de aplicação e SQL de conferência

**Files:**
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)
- Create: `infra/tests/acesso-vendedora-check.sql`
- Modify: `infra/tests/tenant-tables-escrita-check.sql` (lista `t(name)`)

**Interfaces:**
- Consumes: os nomes da Task 3.
- Produces: `infra/tests/acesso-vendedora-check.sql`, que devolve uma linha `r` (json) com `ok_*` booleanos, `helpers_def_md5` (md5 do `pg_get_functiondef` de cada helper reescrito — o corpo não entra no gate de drift, então dev × prod se compara por aqui), `assinatura` (as 6 chaves que mudam na baseline) e `assinatura_total` (`{objetos, md5}` do schema inteiro, ordem `collate "C"`) — consumida nas Tasks 5 e 6. Se a Task 1 apontou helper extra, ele entra nas duas listas `values` de helpers deste arquivo.

- [ ] **Step 1: `apply-order.txt`** — acrescentar ao **fim** do arquivo, exatamente:

```txt
# 2026-10-07 - Acesso da vendedora, PR 2: member_role ganha 'seller'. Sozinha: valor novo de
# enum nao pode ser usado na transacao em que nasce — aplicar e commitar antes da seguinte.
apps/web/supabase/migrations/20261007120000_member_role_seller.sql
# 2026-10-07 - Acesso da vendedora, PR 2: app.user_tenant_ids() e app.has_membership() excluem
# seller (a vendedora nao le nada pelo caminho authenticated; corpo copiado de prod), mais
# memberships.modules (+ memberships_modules_validos), orders.created_by, order_items (RLS;
# leitura no padrao de orders; escrita so do servidor) e as RPCs create_order_with_items /
# replace_order_items / order_items_total (execute so service_role). Muda a baseline
# (t|memberships, t|orders, t|order_items e tres f|). O gate nao ve schema app, enum,
# constraint, policy, ACL nem corpo — conferir com infra/tests/acesso-vendedora-check.sql
# nos dois bancos.
apps/web/supabase/migrations/20261007120100_acesso_vendedora.sql
```

- [ ] **Step 2: `infra/tests/acesso-vendedora-check.sql`:**

```sql
-- Conferência do PR 2 do acesso da vendedora (migrações 20261007120000 e 20261007120100), nos
-- DOIS bancos, depois de aplicar:
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\acesso-vendedora-check.sql
--
-- Existe porque o gate de drift não enxerga nada disto: schema_signature() hasheia só nome e tipo
-- de coluna e resultado/secdef/volatilidade de função. Valor de enum, CHECK, índice, policy,
-- privilégio e corpo de função ficam de fora.
--
-- Esperado nos dois bancos: todo ok_* = true; "helpers_def_md5" e "assinatura" (6 chaves) IGUAIS
-- nos dois. "assinatura_total" de prod é a prova da baseline (deploy/supabase/schema-baseline.json).
-- Erro "relation public.order_items does not exist" = a migração 20261007120100 não foi aplicada.
select json_build_object(
  'ok_enum_seller', exists (
    select 1 from pg_enum
    where enumtypid = 'public.member_role'::regtype and enumlabel = 'seller'),
  -- Helpers de leitura do RLS: excluem seller, continuam security definer e chamáveis por
  -- authenticated (sem isso toda policy que os usa nega tudo para todo mundo).
  'ok_helpers_sem_seller', (
    select bool_and(
      p.oid is not null
      and p.prosecdef
      and p.prosrc like '%<> ''seller''%'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    from (values ('app.user_tenant_ids()'), ('app.has_membership(uuid)')) as h(sig)
    left join pg_proc p on p.oid = to_regprocedure(h.sig)),
  'helpers_def_md5', (
    select json_object_agg(h.sig, md5(pg_get_functiondef(p.oid)) order by h.sig)
    from (values ('app.user_tenant_ids()'), ('app.has_membership(uuid)')) as h(sig)
    join pg_proc p on p.oid = to_regprocedure(h.sig)),
  'helpers_execute', (
    select json_object_agg(h.sig, (
      select json_agg(g order by g) from (
        select case when a.grantee = 0 then 'public' else a.grantee::regrole::text end as g
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
        where a.privilege_type = 'EXECUTE') as x) order by h.sig)
    from (values ('app.user_tenant_ids()'), ('app.has_membership(uuid)')) as h(sig)
    join pg_proc p on p.oid = to_regprocedure(h.sig)),
  'ok_modules', exists (
    select 1 from pg_attribute
    where attrelid = 'public.memberships'::regclass and attname = 'modules' and not attisdropped
      and format_type(atttypid, atttypmod) = 'text[]' and attnotnull),
  'ok_modules_check', exists (
    select 1 from pg_constraint
    where conrelid = 'public.memberships'::regclass and conname = 'memberships_modules_validos'
      and contype = 'c' and convalidated),
  'modules_check', (
    select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.memberships'::regclass and conname = 'memberships_modules_validos'),
  'ok_created_by', exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
  'ok_indices', to_regclass('public.orders_tenant_created_by_idx') is not null
    and to_regclass('public.order_items_order_idx') is not null,
  'ok_rls_order_items', (select relrowsecurity from pg_class where oid = 'public.order_items'::regclass),
  'policies_order_items', (
    select json_agg(polname || ' ' || polcmd || ': ' || coalesce(pg_get_expr(polqual, polrelid), '-'))
    from pg_policy where polrelid = 'public.order_items'::regclass),
  'policies_orders', (
    select json_agg(polname || ' ' || polcmd || ': ' || coalesce(pg_get_expr(polqual, polrelid), '-'))
    from pg_policy where polrelid = 'public.orders'::regclass),
  'ok_order_items_so_servidor_escreve',
    not has_table_privilege('anon', 'public.order_items', 'SELECT')
    and not has_table_privilege('authenticated', 'public.order_items', 'INSERT')
    and not has_table_privilege('authenticated', 'public.order_items', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.order_items', 'DELETE')
    and not has_table_privilege('authenticated', 'public.order_items', 'TRUNCATE')
    and has_table_privilege('service_role', 'public.order_items', 'INSERT')
    and has_table_privilege('service_role', 'public.order_items', 'DELETE'),
  'ok_order_items_leitura_authenticated', has_table_privilege('authenticated', 'public.order_items', 'SELECT'),
  'checks_order_items', (
    select json_agg(pg_get_constraintdef(oid) order by conname)
    from pg_constraint where conrelid = 'public.order_items'::regclass and contype = 'c'),
  'ok_rpcs', (
    select bool_and(
      p.oid is not null
      and not p.prosecdef
      and p.proconfig = array['search_path=""']
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and has_function_privilege('service_role', p.oid, 'EXECUTE'))
    from (values
      ('public.create_order_with_items(uuid,uuid,uuid,text,text,uuid,jsonb)'),
      ('public.replace_order_items(uuid,uuid,jsonb,uuid)'),
      ('public.order_items_total(jsonb)')) as f(sig)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)),
  'rpcs', (
    select json_agg(json_build_object(
      'sig', f.sig,
      'existe', p.oid is not null,
      'definer', p.prosecdef,
      'config', p.proconfig,
      'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE')))
    from (values
      ('public.create_order_with_items(uuid,uuid,uuid,text,text,uuid,jsonb)'),
      ('public.replace_order_items(uuid,uuid,jsonb,uuid)'),
      ('public.order_items_total(jsonb)')) as f(sig)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)),
  'assinatura', (
    select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C")
    from public.schema_signature()
    where nome in ('memberships', 'orders', 'order_items')
       or nome like 'create_order_with_items(%'
       or nome like 'replace_order_items(%'
       or nome like 'order_items_total(%'),
  'assinatura_total', (
    select json_build_object(
      'objetos', count(*),
      'md5', md5(string_agg(chave || '=' || sig, ',' order by chave collate "C")))
    from (select kind || '|' || nome as chave, sig from public.schema_signature()) as s)
) as r;
```

- [ ] **Step 3: `tenant-tables-escrita-check.sql`** — na lista `t(name)`, troque a linha

```sql
  ('orders'), ('playbook_progress'), ('schedules'), ('template_folders'), ('templates'),
```

por

```sql
  ('order_items'), ('orders'), ('playbook_progress'), ('schedules'), ('template_folders'), ('templates'),
```

- [ ] **Step 4: a apply-order continua legível pelos testes que a varrem:**

```bash
cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco/apps/web && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/supabase/privilegio-definer.test.ts src/lib/pages/capture-transaction.test.ts
```

Esperado: PASS.

- [ ] **Step 5: commit.**

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco add deploy/supabase/apply-order.txt infra/tests/acesso-vendedora-check.sql infra/tests/tenant-tables-escrita-check.sql
```
```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco diff --cached --stat
```
```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco commit -F - <<'EOF'
chore(db): apply order and post-apply check for the seller schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 5: Pendência do Igor — aplicar nos dois bancos

**Files:** nenhum arquivo do repo (cria `C:\Users\Igor\AppData\Local\Temp\vendedora-rollback-b.sql`, que só é usado se o prod falhar).

**Interfaces:**
- Consumes: as duas migrações (Task 3), `acesso-vendedora-check.sql` (Task 4), o OK da Task 1 nos dois bancos.
- Produces: o schema novo em dev e prod; a saída do check de **dev** e de **prod** (o objeto `r`, em `rows[0].r`), que a Task 6 usa.

- [ ] **Step 1: deixar pronto o desfazer do dev** (só se o prod falhar depois de o dev ter sido aplicado; objetos novos e vazios, nenhum dado de cliente). Crie com a ferramenta Write `C:\Users\Igor\AppData\Local\Temp\vendedora-rollback-b.sql`:

```sql
-- Desfaz 20261007120100 num banco (usar no DEV só se o PROD falhar: dev à frente da baseline
-- deixa o gate de drift vermelho para todo PR). O 'seller' do enum fica: o Postgres não remove
-- valor de enum, e ele não entra na assinatura do gate.
drop function if exists public.replace_order_items(uuid, uuid, jsonb, uuid);
drop function if exists public.create_order_with_items(uuid, uuid, uuid, text, text, uuid, jsonb);
drop function if exists public.order_items_total(jsonb);
drop table if exists public.order_items;
drop index if exists public.orders_tenant_created_by_idx;
alter table public.orders drop column if exists created_by;
alter table public.memberships drop constraint if exists memberships_modules_validos;
alter table public.memberships drop column if exists modules;

-- Helpers de volta ao corpo de antes (o mesmo da Task 1; se o Step 2 da Task 3 trocou o bloco 0)
-- pelo corpo de prod, use aqui esse corpo SEM a linha do seller, e o mesmo par revoke/grant).
create or replace function app.user_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and m.accepted_at is not null;
$$;

create or replace function app.has_membership(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.accepted_at is not null
  )
$$;

revoke all on function app.user_tenant_ids() from public, anon, authenticated, service_role;
grant execute on function app.user_tenant_ids() to public;
revoke all on function app.has_membership(uuid) from public, anon, authenticated, service_role;
grant execute on function app.has_membership(uuid) to public;
```

- [ ] **Step 2: PEÇA AO IGOR — DEV.** Ele roda em PowerShell; o `if` impede aplicar a B se a A ou o link falharem (e impede aplicar no banco que estava ligado antes):

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco\apps\web"
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f supabase\migrations\20261007120000_member_role_seller.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f supabase\migrations\20261007120100_acesso_vendedora.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f ..\..\infra\tests\acesso-vendedora-check.sql }
if ($LASTEXITCODE -eq 0) { supabase db advisors --linked --type security --output-format json }
```

Peça que ele cole a saída do check (`rows[0].r`) e do advisor. Confira: todo `ok_*` = `true`; `helpers_execute` igual ao `execute` dos mesmos helpers em `vendedora-precheck-dev.json` (o ACL voltou); `assinatura` com 6 chaves; `policies_order_items` = `["order_items_select_member r: (tenant_id = ANY (app.user_tenant_ids()))"]`; `checks_order_items` com os três checks do spec; no advisor (só a primeira linha da saída é JSON — a última costuma trazer um erro do PostHog colado), nenhum lint novo que cite `order_items`, `create_order_with_items`, `replace_order_items`, `order_items_total`, `memberships` ou `orders` além do que já está em `deploy/supabase/advisors-allowlist.json`. Se o dev errar em qualquer comando: corrija a migração (Task 3), faça commit novo e peça o **mesmo bloco** de novo (é idempotente). **Não siga para o prod com `ok_*` falso.**

- [ ] **Step 3: PEÇA AO IGOR — PROD**, logo em seguida (sem pausa: a partir do Step 2 o `drift` de todo PR aberto está vermelho). Ao final o link volta para dev:

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f supabase\migrations\20261007120000_member_role_seller.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f supabase\migrations\20261007120100_acesso_vendedora.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f ..\..\infra\tests\acesso-vendedora-check.sql }
if ($LASTEXITCODE -eq 0) { supabase db advisors --linked --type security --output-format json }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Mesma conferência do Step 2 (com `helpers_execute` contra `vendedora-precheck-prod.json`), e mais: `assinatura` e `helpers_def_md5` de prod **idênticos** aos de dev. Se o prod falhar e não der para corrigir na hora, o Igor desfaz o dev:

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco\apps\web"
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f "C:\Users\Igor\AppData\Local\Temp\vendedora-rollback-b.sql" }
```

- [ ] **Step 4: guardar as duas saídas.** Salve o objeto `r` de prod em `C:\Users\Igor\AppData\Local\Temp\vendedora-check-prod.json` e o de dev em `C:\Users\Igor\AppData\Local\Temp\vendedora-check-dev.json` (ferramenta Write; só o objeto `r`, JSON puro).

### Task 6: GREEN e baseline

**Files:**
- Modify: `deploy/supabase/schema-baseline.json`

**Interfaces:**
- Consumes: `vendedora-check-prod.json` e `vendedora-check-dev.json` (Task 5).
- Produces: baseline com `t|memberships` e `t|orders` novos e `t|order_items`, `f|create_order_with_items(p_tenant_id uuid, p_created_by uuid, p_lead_id uuid, p_phone text, p_group_name text, p_campaign_id uuid, p_items jsonb)`, `f|replace_order_items(p_tenant_id uuid, p_order_id uuid, p_items jsonb, p_only_author uuid)`, `f|order_items_total(p_items jsonb)` acrescentados — provada igual a prod pelo md5 do schema inteiro.

- [ ] **Step 1: GREEN do teste de integração** (só com a credencial de dev da Task 2, Step 3):

```bash
ENVFILE=<arquivo da Task 2>; cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco/apps/web && set -a && source <(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)=' "$ENVFILE" | sed 's/\r$//') && SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$NEXT_PUBLIC_SUPABASE_ANON_KEY}" && set +a && E2E_TENANT_ID=4483abf8-3483-40bf-a448-6b3ce9496374 npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/order-items.integration.test.ts
```

Esperado: `# pass 11`, `# fail 0`, `# skipped 0`. O teste de RLS carrega o próprio controle positivo (a dona vê as linhas): verde nele prova que o caminho `authenticated` funciona **e** que a vendedora não passa. Teste vermelho = defeito da migração ou do teste: diagnostique (superpowers:systematic-debugging); se for a migração, corrija, commit novo e volte à Task 5 (o bloco é idempotente; `create or replace` + revoke/grant reaplica). Sem credencial de dev, o GREEN é o passo "Integracao das stores contra o banco de dev" do job `e2e` (Task 7).

- [ ] **Step 2: o script que regrava a baseline.** Sem chave de prod no shell: as chaves que mudaram vêm do check de prod, e o arquivo só é gravado se o md5 do schema inteiro bater com o de prod (prova que as outras ~107 chaves continuam iguais). Crie com a ferramenta Write `C:\Users\Igor\AppData\Local\Temp\baseline-patch.mjs`:

```js
// node baseline-patch.mjs <check-prod.json> <check-dev.json>   (cwd = raiz do worktree)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const BASELINE = "deploy/supabase/schema-baseline.json";
const ler = (caminho) => JSON.parse(readFileSync(caminho, "utf8"));
const prod = ler(process.argv[2]);
const dev = ler(process.argv[3]);
const base = ler(BASELINE);

const novas = prod.assinatura ?? {};
if (Object.keys(novas).length !== 6) throw new Error(`esperava 6 chaves em assinatura, vieram ${Object.keys(novas).length}`);
if (!isDeepStrictEqual(novas, dev.assinatura)) throw new Error("assinatura de dev != prod: os bancos divergem nos objetos deste PR");

const objetos = { ...base.objetos, ...novas };
// Ordem de code point = collate "C" do Postgres (as chaves são ASCII).
const chaves = Object.keys(objetos).sort();
const md5 = createHash("md5").update(chaves.map((k) => `${k}=${objetos[k]}`).join(",")).digest("hex");
const { objetos: totalProd, md5: md5Prod } = prod.assinatura_total;
if (md5 !== md5Prod || chaves.length !== totalProd) {
  console.error(`NAO bate com prod: aqui ${chaves.length} objetos/${md5}, prod ${totalProd}/${md5Prod}.`);
  console.error("Outra coisa mudou em prod desde a baseline atual — investigar, nao forcar.");
  process.exit(1);
}

// Mesma disposição do arquivo gerado por `npm run schema:baseline` (a ordem linguística da RPC).
const ordenado = Object.fromEntries(
  Object.keys(objetos).sort((a, b) => a.localeCompare(b)).map((k) => [k, objetos[k]]),
);
// gerado_em de agora: o md5 prova o snapshot INTEIRO de prod, não só as 6 chaves.
const nova = { gerado_em: new Date().toISOString(), projeto: base.projeto, objetos: ordenado };
writeFileSync(BASELINE, `${JSON.stringify(nova, null, 2)}\n`, "utf8");
console.log(`baseline gravada: ${chaves.length} objetos, md5 ${md5} = prod`);
```

- [ ] **Step 3: rodar o script.**

```bash
cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco && node C:/Users/Igor/AppData/Local/Temp/baseline-patch.mjs C:/Users/Igor/AppData/Local/Temp/vendedora-check-prod.json C:/Users/Igor/AppData/Local/Temp/vendedora-check-dev.json && git diff --stat deploy/supabase/schema-baseline.json && git diff deploy/supabase/schema-baseline.json | grep -E '^[+-] ' | cut -c1-90
```

Esperado: `baseline gravada: 113 objetos, md5 … = prod` (109 de 05/10 + 4; se a `main` já trouxe outra baseline, o número muda — vale o que o md5 provar) e no diff só `gerado_em`, `t|memberships`, `t|orders` trocados e as 4 chaves novas. Se o script recusar, **não** edite o arquivo à mão; alternativa do Igor com a chave de prod no ambiente, na raiz do worktree: `$env:SUPABASE_URL = "https://nidoatbxaylrkcgbszns.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role de PROD>"; npm run schema:baseline; Remove-Item env:SUPABASE_SERVICE_ROLE_KEY, env:SUPABASE_URL`.

- [ ] **Step 4: o gate de verdade** (com a credencial de dev, se houver; senão o job `drift` do CI confere):

```bash
ENVFILE=<arquivo da Task 2>; cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco && set -a && source <(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' "$ENVFILE" | sed 's/\r$//') && set +a && npm run check:drift
```

Esperado: `Sem drift fora da allowlist.` — prova de uma vez que a baseline está certa e que dev = prod.

- [ ] **Step 5: commit.**

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco add deploy/supabase/schema-baseline.json
```
```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco diff --cached --stat
```
```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco commit -F - <<'EOF'
chore(db): schema baseline with the seller schema

memberships and orders change shape; order_items and the three order
functions are new. Whole-schema md5 matches production.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 7: verificação, PR e comandos para o Igor

**Files:** nenhum novo no repo (cria `C:\Users\Igor\AppData\Local\Temp\pr-vendedora-banco.md`).

**Interfaces:**
- Consumes: os quatro commits das Tasks 2, 3, 4 e 6.
- Produces: PR mergeado em `main` com as migrações aplicadas nos dois bancos e a baseline nova — o que o PR 3 exige para começar.

- [ ] **Step 1: tipos, lint e suíte.**

```bash
cd /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco/apps/web && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.e2e.json && npm run lint && npm test
```

Esperado: tudo verde; no `npm test` os testes de integração passam por `pular()` (sem `E2E_TENANT_ID`).

- [ ] **Step 2: alcançar a `main` antes do push** (baseline entre PRs paralelos: o `drift` compara o dev vivo com a baseline **do checkout do PR**):

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco fetch origin main
git -C /c/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/vendedora-banco log HEAD..origin/main --oneline
```

Se vier algum commit: `git -C <WT> merge origin/main`. Conflito em `apply-order.txt` → manter as entradas dos dois lados, na ordem cronológica dos nomes de arquivo. Conflito em `schema-baseline.json` → `git -C <WT> checkout --theirs deploy/supabase/schema-baseline.json` (a da `main`), peça ao Igor o check de **prod** de novo (bloco da Task 5, Step 3, só a linha do `acesso-vendedora-check.sql`, com o link ida e volta), regrave `vendedora-check-prod.json` e rode a Task 6, Steps 3–4 outra vez; depois `git add` dos dois arquivos e `git -C <WT> commit --no-edit`.

- [ ] **Step 3: o gate real** (ferramenta PowerShell; sem `2>&1`):

```powershell
& "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco\infra\scripts\verify-local.ps1" | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Esperado: `EXIT=0`.

- [ ] **Step 4: revisão.** Despache o agente **Code Reviewer** (ou `ecc:database-reviewer`) sobre `git -C <WT> diff origin/main...HEAD`, pedindo atenção a: helpers do RLS idênticos aos de prod (`vendedora-precheck-prod.json`) a não ser pela linha do `seller`, com o EXECUTE de antes; `search_path` vazio com nomes qualificados, ACL das três funções, atomicidade, janela de 24h, idempotência; limpeza da loja e dos usuários no teste. Corrija CRITICAL/HIGH antes de seguir (mudança de SQL = volta à Task 5).

- [ ] **Step 5: corpo do PR** — ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\pr-vendedora-banco.md`, trocando os `<…>` pelos valores reais:

````markdown
PR 2 de 6 do acesso da vendedora (spec `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` §1 "RLS" e §2; contrato "PR 2 → PR 3, 4, 6" em `docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md`).

## O que muda no banco

- `member_role` ganha `seller` (migração própria: valor novo de enum não pode ser usado na transação em que nasce).
- RLS: `app.user_tenant_ids()` e `app.has_membership(uuid)` passam a excluir `seller` (corpo copiado de prod + uma linha; `security definer`, `search_path` e EXECUTE iguais). A vendedora tem o próprio token no browser e a anon key é pública: sem isto ela leria pelo PostgREST `leads`, `orders` e o resto da loja. Os helpers que já listam papéis não mudaram; nenhuma policy mudou; nenhuma vendedora existe hoje.
- `memberships.modules text[] not null default '{}'` + `memberships_modules_validos` (só `postar`, e só para `seller`).
- `orders.created_by` (→ `auth.users`, `on delete set null`) + `orders_tenant_created_by_idx`.
- `order_items` com os checks do spec, RLS ligado, leitura no padrão de `orders` (`app.user_tenant_ids()`), escrita só `service_role`.
- RPCs `create_order_with_items` e `replace_order_items` (+ `order_items_total`, interno): `security invoker`, `search_path` vazio, EXECUTE só `service_role`. Erros: `itens_invalidos`, `total_zero`, `pedido_nao_encontrado`, `fora_da_janela`.
- `orders.value` continua sendo o total: Resultados, caixa do mês e atribuição por campanha não mudam.

## Já aplicado

- Dev e prod em <data/hora>, A depois B. `infra/tests/acesso-vendedora-check.sql` com todo `ok_*` = true nos dois; `assinatura` e `helpers_def_md5` iguais nos dois; `helpers_execute` igual ao de antes.
- Advisor de segurança nos dois: <sem lint novo | o que apareceu>.
- `schema-baseline.json`: 6 chaves; md5 do schema inteiro = prod (<md5>, <N> objetos).

## Testes

- `src/lib/stores/order-items.integration.test.ts` (banco de dev, job `e2e`, numa loja descartável com dona e vendedora logadas de verdade): soma e ordem, teto de 50, cada limite de item → `itens_invalidos` sem pedido órfão, `total_zero`, autora dentro de 24h, outra pessoa e depois de 24h → `fora_da_janela`, dono sem `p_only_author`, outra loja → `pedido_nao_encontrado`, cascade; e RLS: com o JWT da vendedora `organizations`, `leads`, `orders` e `order_items` devolvem 0 linhas, com o da dona devolvem.
- tsc ×2, lint, `npm test`, `infra/scripts/verify-local.ps1`.

## Riscos para os próximos PRs

- `storage.objects` em prod: <colar as policies da Task 1>. Usam `app.has_membership(...)`: o upload direto do browser (`media-upload-client.ts`) deixa de valer para a vendedora. Antes de liberar `postar` a uma vendedora (PR 5), `/api/media/prepare` precisa emitir URL assinada (`createSignedUploadUrl`) e o cliente usar `uploadToSignedUrl`.
- Realtime: a vendedora não recebe evento; a casca dela não deve assinar canal (PR 5).
- PR 3: a allowlist do teste estrutural de `.from("memberships")` precisa incluir `src/lib/stores/order-items.integration.test.ts` (ele cria a dona e a vendedora da loja descartável).

## Depois do merge

O PR 1 (paralelo) precisa de `git merge origin/main` antes do push final, senão o `drift` dele reprova com a baseline antiga.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

- [ ] **Step 6: Comandos para o Igor** (um bloco por comando; PowerShell 5.1, sem `&&`). Se o classificador deixar você mesmo rodar push e `gh pr create`, rode; merge e o SQL do card são dele.

```bash
git -C "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\vendedora-banco" push -u origin feat/vendedora-banco
```
```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/vendedora-banco --title "feat(db): seller role, member modules, order items and order RPCs (vendedora PR 2)" --body-file "C:\Users\Igor\AppData\Local\Temp\pr-vendedora-banco.md"
```
```bash
gh pr checks <N> --repo codingB0y/Girumo --watch
```

Antes de mergear, confira no log do job `e2e`, passo "Integracao das stores contra o banco de dev", que os 11 testes de `order-items.integration.test.ts` aparecem como `ok` (é o GREEN deste PR), e que `drift` e `advisors` estão verdes. A `main` não tem proteção: merge só à mão, no verde.

```bash
gh pr merge <N> --repo codingB0y/Girumo --squash --delete-branch
```

Card (prod, SQL Editor do Supabase ou `supabase db query --linked` com o link em prod e de volta para dev):

```sql
select public.move_card('acesso-vendedora', 'em_construcao',
  'PR 2 mergeado: seller (sem acesso authenticated), memberships.modules, orders.created_by, order_items e RPCs no ar em dev e prod; PR 3 pode começar',
  'PR #<N>');
update public.board_features set blocker = null where key = 'acesso-vendedora';
```

- [ ] **Step 7: registrar a decisão no grafo** — chame `kg_insert_text` (source `decisao-2026-10-07`) com o texto abaixo; se travar, entregue ao Igor o `rag insert` equivalente em PowerShell:

```txt
decisão: venda com itens (acesso da vendedora) grava só pelas RPCs create_order_with_items e replace_order_items (security invoker, search_path vazio, EXECUTE só service_role; validação única em order_items_total). orders.value continua sendo o total; order_items tem RLS de leitura no padrão de orders (app.user_tenant_ids) e escrita só do servidor. member_role ganhou 'seller' numa migração separada (enum novo não é usável na transação em que nasce). RLS: app.user_tenant_ids() e app.has_membership() excluem seller (and m.role <> 'seller'), então a vendedora não lê nada pelo caminho authenticated — tudo dela passa por rota service-role + guard; helpers que listam papéis ficaram como estavam. Consequência: upload de mídia da vendedora tem de ser por URL assinada da API (storage.objects usa has_membership).
```

- [ ] **Step 8: encerrar** com "PRs que deixei abertos: …" (nenhum, ou o número e o motivo — p.ex. esperando o Igor mergear) e lembrar que o PR 3 só começa com este mergeado e aplicado nos dois bancos.
