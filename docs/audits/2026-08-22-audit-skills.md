# Auditoria read-only — 22/08/2026

Auditoria de leitura, sem nenhuma alteração de código, schema ou dado. Todo achado
abaixo tem `arquivo:linha` ou o SQL que rodou. Nada aqui é hipótese: o que não deu
para confirmar está na seção "Não verificado" no fim.

**Skills usadas, na ordem pedida:**

| Seção | Skill | Papel |
|---|---|---|
| A — Isolamento multi-tenant | `supabase-postgres-best-practices` | `security-rls-basics`, `security-privileges`, `query-missing-indexes`, `data-pagination` |
| B — Drift dev × prod | `supabase` | checklist de segurança (views, GUC, SECURITY DEFINER), workflow de migrações |
| C — Stripe | `stripe-best-practices` | verificação de assinatura, idempotência, RAK, eventos assíncronos |
| D — Cobertura E2E | `playwright-cli` | qualidade de asserção, cobertura de rota dinâmica |

**Projetos:** dev `wfjuwogxaupyadwhvoxy` · prod `nidoatbxaylrkcgbszns`.

---

## Seção A — Isolamento multi-tenant
> Skill: **supabase-postgres-best-practices**

### A.1 — A varredura de `apps/web/src/lib/**` está LIMPA

41 queries em tabelas com `tenant_id` dentro de `apps/web/src/lib`. Classifiquei uma
a uma exigindo `.eq("tenant_id"` no bloco da query. **Zero achados de filtro
faltando.** Os 4 casos que a varredura levantou são todos legítimos e foram
conferidos abrindo o arquivo:

| Local | Por que está certo |
|---|---|
| [`lib/analytics/funnel-events.ts:67`](apps/web/src/lib/analytics/funnel-events.ts:67) e `:86-89` | Agregação cross-tenant **de propósito** (dashboard admin). Único consumidor: [`app/admin/funil/page.tsx:32`](apps/web/src/app/admin/funil/page.tsx:32) |
| [`lib/auth/accept-pending-invite.ts:36`](apps/web/src/lib/auth/accept-pending-invite.ts:36) | `UPDATE ... .eq("id", invite.id)` sobre convite já validado |
| [`lib/email/send.ts:36`](apps/web/src/lib/email/send.ts:36) | `INSERT` em `logs`; a linha carrega `tenant_id` |
| [`lib/media-store.ts:137`](apps/web/src/lib/media-store.ts:137) | Leitura pública de mídia de LP. A autorização é o `kind` (`PUBLIC_LP_KINDS`), documentado em `:123-127`. O caminho privado usa `mediaPathBelongsToTenant` |

Estendi a mesma varredura para `apps/web/src/app/api/**` (179 queries). 23 sem
referência a tenant, 22 delas em superfície admin/global legítima. A única exceção
real é A.4 abaixo. [`api/links/route.ts:132`](apps/web/src/app/api/links/route.ts:132)
parece sem filtro, mas o `.eq("id", link.id)` opera sobre linha recém-criada por
`createTrackedLink(tenantId, …)` — falso positivo.

### A.2 — HIGH · O RLS não é "segunda linha de defesa": ele é inerte

O `CLAUDE.md` diz que o RLS "funciona como segunda linha de defesa, exercida só nos
poucos caminhos anon/authenticated". A evidência diz que **não existe caminho
anon/authenticated de dados**, e que as policies nunca poderiam conceder nada.

Três fatos, cada um verificado:

**(1) As policies de tenant dependem de uma GUC que o app nunca seta.**

```sql
select c.relname, p.polname, pg_get_expr(p.polqual, p.polrelid)
from pg_policy p join pg_class c on c.oid = p.polrelid ...
-- automation_runs, group_grow_jobs, ig_accounts, ig_events, ig_triggers,
-- lp_captures, lp_contacts:
--   (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)
```

```bash
grep -rn "app\.tenant_id\|app\.workspace_id\|set_config" apps/web/src apps/worker/src hubflow-engine/src
# (vazio)
```

`current_setting('app.tenant_id', true)` devolve NULL → `tenant_id = NULL` → NULL →
nenhuma linha passa. A policy é deny-all, nunca tenant-scoped.

**(2) As policies "service role" também nunca avaliam verdadeiro.**
`funnel_events`, `link_click_events` e `testimonials` usam
`current_setting('role', true) = 'service_role'`. O `service_role` tem `BYPASSRLS`,
então nunca chega a avaliar policy; para `anon`/`authenticated` a expressão é falsa.

**(3) `anon` tem SELECT nas 65 tabelas.**

```sql
select count(distinct table_name) from information_schema.role_table_grants
where table_schema='public' and grantee='anon' and privilege_type='SELECT';
-- 65   (idem para authenticated: 65)
```

E o cliente anon só é usado para auth, nunca para dados:

```bash
grep -rn "getSupabaseServerAnon" apps/web/src   # 2 arquivos, ambos .auth.*
```

**O que quebra na prática:** hoje, nada — o conjunto é fail-closed. O risco é o
próximo passo: com SELECT concedido a `anon` em todas as tabelas, **uma única policy
trocada por `using (true)` para "destravar" alguma tela vira dump público
imediato**, acessível com a chave `NEXT_PUBLIC_SUPABASE_ANON_KEY` que já está no
browser. Não há margem de erro: o RLS não segura nada hoje, então não vai atenuar o
engano.

**Fix sugerido:** corrigir a redação no `CLAUDE.md` (de "segunda linha" para
"decorativo — não confie") e escolher um caminho: ou revogar o SELECT de
`anon`/`authenticated` nas tabelas que nenhum caminho anon lê, ou reescrever as
policies para `auth.uid()` + `memberships` — padrão que a policy de `automations` já
usa e que de fato funciona.

### A.3 — LOW · 4 tabelas com `tenant_id` têm RLS sem nenhuma policy

```sql
select c.relname, c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid=c.oid)
from pg_class c ... where existe coluna tenant_id and (relrowsecurity=false or policies=0);
-- prod: admin_alerts, engine_commands, engine_events, instance_send_state (4)
-- dev:  os mesmos 4
```

**Zero tabelas com `tenant_id` sem RLS ligado**, nos dois bancos — o `CLAUDE.md`
está certo nesse ponto. Sem policy = deny-all, então é seguro; fica como LOW por
higiene e porque o advisor reclama.

Mitigação existente e confirmada: event trigger `ensure_rls` → `rls_auto_enable()`
presente **nos dois** bancos (`select count(*) from pg_event_trigger where evtname='ensure_rls'`
= 1 em cada), então tabela nova nasce com RLS.

### A.4 — MEDIUM · `plans` é tabela de tenant servida sem filtro

`plans` tem coluna `tenant_id` e **todas as 4 linhas de prod estão preenchidas**:

```sql
select count(distinct tenant_id), count(*), (select count(*) from organizations) from plans;
-- tenants_com_plano=1 | linhas=4 | orgs_total=21
```

Dois consumidores leem sem filtro:
- [`api/plans/route.ts:8-12`](apps/web/src/app/api/plans/route.ts:8) — `.eq("active", true)` e mais nada
- [`api/billing/checkout/route.ts:18-23`](apps/web/src/app/api/billing/checkout/route.ts:18) — `.eq("code", planCode).eq("active", true).single()`

**O que quebra na prática:** hoje só 1 dos 21 tenants tem linhas em `plans`, então
nada vaza *ainda*. No dia em que um segundo tenant ganhar plano próprio: (a)
`/api/plans` devolve os planos alheios (id, code, name, limits, `stripe_price_id`)
para qualquer usuário logado; (b) o `.single()` do checkout passa a achar 2 linhas
com o mesmo `code` e estoura PGRST116 → **o checkout devolve "Plano nao encontrado"
para todo mundo**. É latente, não teórico.

**Fix sugerido:** decidir o que `plans` é. Se é catálogo global, `tenant_id` deveria
sair (ou ficar NULL) e o unique de `code` ser global. Se é por tenant, as duas
queries precisam de `.eq("tenant_id", ctx.tenantId)` e o unique vira `(tenant_id, code)`.

### A.5 — Advisors de segurança (`get_advisors type=security`)

**prod:** 13 × `rls_enabled_no_policy` (INFO) + 1 × `auth_leaked_password_protection` (WARN).
Nenhum lint de nível ERROR.

**dev:** 8 × `rls_enabled_no_policy` + 1 × leaked-password + **4 WARN que prod não
tem**: `confirm_lp_capture` e `record_lp_tracking_event` executáveis por `anon` e
por `authenticated` como `SECURITY DEFINER`. Isso é drift de GRANT (ver B.4).

Conferido e **limpo**: 0 views no schema public nos dois bancos (nada de view
burlando RLS, armadilha nº 1 da skill `supabase`); as 30 funções de prod e as 25 de
dev são todas `SECURITY DEFINER` **com `search_path` setado** — a regra do
`CLAUDE.md` está sendo cumprida sem exceção.

---

## Seção B — Drift dev × prod
> Skill: **supabase**

Método: assinatura `md5` da lista de colunas por tabela nos dois bancos, depois
detalhe só das divergentes. Prod = 65 tabelas / 30 funções. Dev = 53 / 25.

### B.1 — HIGH · Duas colunas existem em DEV e faltam em PROD, e o código lê as duas

Este é o caso mais grave da seção porque o drift está no sentido **contrário** do
esperado: dev está à frente, então tudo passa localmente e quebra em produção.

```sql
-- prod
select id, code, name, price_cents from public.plans limit 1;
-- ERROR: 42703: column "price_cents" does not exist

select id, phone, status, profile_name from public.instances limit 1;
-- ERROR: 42703: column "profile_name" does not exist
```

Em dev as duas existem (`information_schema.columns`: `plans` 11 colunas em dev × 10
em prod; `instances` 16 × 15).

Quem lê:

| Arquivo:linha | Query |
|---|---|
| [`app/admin/billing/page.tsx:63`](apps/web/src/app/admin/billing/page.tsx:63) | `.from("plans").select("id, code, name, price_cents")` |
| [`app/admin/tenants/[id]/page.tsx:50`](apps/web/src/app/admin/tenants/[id]/page.tsx:50) | idem |
| [`app/admin/instancias/page.tsx:13`](apps/web/src/app/admin/instancias/page.tsx:13) | `.select("id, tenant_id, phone, status, profile_name, …")` |
| [`app/admin/tenants/[id]/page.tsx:59`](apps/web/src/app/admin/tenants/[id]/page.tsx:59) | `.select("id, phone, status, profile_name, last_seen_at")` |

**O que quebra na prática — e por que ninguém viu:** as quatro usam
`const { data } = await supabase…`, descartando `error`
([billing:63](apps/web/src/app/admin/billing/page.tsx:63),
[instancias:11](apps/web/src/app/admin/instancias/page.tsx:11)). Em produção o
PostgREST devolve 42703, `data` vira `null`, e:

- `/admin/billing` → `planMap` vazio → **MRR renderiza R$ 0,00**
  ([`:86`](apps/web/src/app/admin/billing/page.tsx:86)) e a coluna de plano mostra "—"
  ([`:238`](apps/web/src/app/admin/billing/page.tsx:238)). Número financeiro errado,
  apresentado como certo.
- `/admin/instancias` → `hasInstances = false` → a tela diz **"Nenhuma instância
  encontrada"**. Prod tem 6:
  ```sql
  select count(*) from public.instances;  -- 6
  select count(*) from public.plans;      -- 4
  ```

Nenhum 500, nenhum log, nenhum alerta. A tela mente com cara de tela vazia.

**Fix sugerido:** aplicar as duas colunas em prod (`alter table … add column if not
exists`) — é o caminho curto e reconcilia com o que o código já espera. E, no mesmo
passo, passar a checar `error` nessas 4 queries: sem isso o próximo drift também vai
virar tela vazia silenciosa.

### B.2 — HIGH · 5 funções existem só em prod; 4 delas são o worker de leads inteiro

Só em prod: `claim_engine_events`, `complete_engine_event`,
`requeue_stale_engine_events`, `upsert_lead`, `increment_automation_runs`.
Só em dev: nenhuma.

As 4 primeiras são exatamente o que [`apps/worker/src/event-loop.ts`](apps/worker/src/event-loop.ts)
chama — `:135`, `:98`, `:107`, `:48` — e o próprio
[`apps/worker/src/supabase.ts:8-9`](apps/worker/src/supabase.ts:8) as documenta como
o contrato do worker.

**O que quebra na prática:** o worker de leads **não roda contra dev**. Qualquer
teste de integração dele em dev falha na primeira RPC, então o caminho só é
exercitado em produção — que é o pior lugar para descobrir defeito. É o mesmo padrão
que já mordeu antes com `groups.is_admin`.

`increment_automation_runs` existe em prod e **não é chamada em lugar nenhum**
(`grep -r increment_automation_runs apps/` não acha chamador) — função órfã, LOW.

**Fix sugerido:** aplicar as 5 em dev a partir de `deploy/supabase/apply-order.txt`,
e depois rodar o worker contra dev uma vez para provar que a cadeia fecha.

### B.3 — MEDIUM · 12 tabelas existem só em prod; 6 são lidas pelo código

Só em prod: `agents`, `agent_skills`, `artifacts`, `decisions`, `handoffs`,
`knowledge`, `memories`, `missions`, `skills`, `squad_agents`, `squads`,
`tenant_webhooks`.

Destas, 6 aparecem em `.from()` no web app (Squad OS):
`squads` (5×), `missions` (3×), `decisions` (3×), `agents` (3×), `memories` (2×),
`handoffs` (2×).

**O que quebra na prática:** o módulo Squad OS responde `42P01 relation does not
exist` em dev. Mesma classe do B.1, sentido inverso: a feature está viva em prod e
morta em dev, então qualquer conferência local do Squad OS mede uma tela vazia.

### B.4 — MEDIUM · O drift não é só de objeto: é de GRANT

`confirm_lp_capture` e `record_lp_tracking_event` existem **nos dois** bancos, mas o
advisor só acusa `anon_security_definer_function_executable` em **dev**. Ou seja: em
dev o `anon` tem EXECUTE nessas duas `SECURITY DEFINER`; em prod, não.

**O que quebra na prática:** a LP pública chama essas RPCs sem sessão. Se prod não
concede EXECUTE ao `anon`, o tracking da LP falha em produção — e falha invisível,
porque `/api/p/track` usa 204 tanto para sucesso quanto para erro engolido
(armadilha já registrada no histórico do projeto). O oposto também é ruim: se em dev
está aberto e em prod fechado, testar em dev não prova nada sobre prod.

**Fix sugerido:** comparar `pg_proc.proacl` das duas funções entre os bancos e
igualar deliberadamente — decidindo qual dos dois está certo — em vez de deixar a
diferença acontecer por acidente de aplicação manual.

### B.5 — LOW · O diretório de migrações não bate com a ordem de aplicação

```bash
ls apps/web/supabase/migrations/*.sql | wc -l          # 41
grep -c '\.sql' deploy/supabase/apply-order.txt        # 47
```

6 entradas de diferença. Consistente com o que o `CLAUDE.md` já avisa (o diretório
não é retrato do schema), mas vale registrar o número: nenhuma das duas listas
sozinha reconstrói nenhum dos dois bancos.

---

## Seção C — Stripe
> Skill: **stripe-best-practices**

Arquivos lidos: `api/billing/webhook`, `checkout`, `portal`, `churn`,
`lib/billing/stripe.ts`, `lib/security-guards.ts`, `api/plans`.

### O que está CERTO (conferido, não presumido)

- **Assinatura do webhook é verificada.** [`webhook/route.ts:81`](apps/web/src/app/api/billing/webhook/route.ts:81)
  usa `constructEvent(rawBody, signature, secret)` com o corpo cru de `req.text()`
  ([`:78`](apps/web/src/app/api/billing/webhook/route.ts:78)), e falha fechado se
  faltar assinatura ou secret ([`:73-75`](apps/web/src/app/api/billing/webhook/route.ts:73)).
- **`tenant_id` é derivado no servidor, nunca vem do cliente.**
  [`checkout/route.ts:11-12`](apps/web/src/app/api/billing/checkout/route.ts:11)
  (`getTenantContext` + `assertBillingRole`) e o id entra em
  `subscription_data.metadata` ([`:66-72`](apps/web/src/app/api/billing/checkout/route.ts:66)),
  que é de onde o webhook lê ([`:20`](apps/web/src/app/api/billing/webhook/route.ts:20)).
  A amarração tenant ↔ customer ↔ subscription está correta.
- **Sem `payment_method_types`** no `sessions.create` — respeita a regra da skill
  (dynamic payment methods).
- **O portal é tenant-scoped** ([`portal/route.ts:14-22`](apps/web/src/app/api/billing/portal/route.ts:14)).
- **`churn/route.ts` trata erro corretamente** ([`:45-48`](apps/web/src/app/api/billing/churn/route.ts:45)) —
  é o contraexemplo dentro do próprio módulo.

### C.1 — CRITICAL · O webhook marca "já processei" ANTES de processar, e descarta o erro do upsert

Duas falhas que se somam na mesma requisição.

**(a) Marcador de dedupe gravado antes do trabalho.**
[`webhook/route.ts:96-102`](apps/web/src/app/api/billing/webhook/route.ts:96) insere
`stripe.webhook.received` em `logs`. Só *depois*, em
[`:104-130`](apps/web/src/app/api/billing/webhook/route.ts:104), o evento é
processado. Se o processamento falhar, o Stripe reenvia — e o reenvio bate no
`if (existing) return … duplicate` de
[`:94`](apps/web/src/app/api/billing/webhook/route.ts:94) e **é descartado**.

Além disso o dedupe é `select`-depois-`insert`
([`:87-92`](apps/web/src/app/api/billing/webhook/route.ts:87)) sem unique constraint:
duas entregas concorrentes do mesmo evento veem `existing = null` e processam as duas.

**(b) O upsert da assinatura não checa erro.**
[`webhook/route.ts:36`](apps/web/src/app/api/billing/webhook/route.ts:36):
`await supabase.from("subscriptions").upsert({…}, { onConflict: "tenant_id" })` — o
resultado é jogado fora inteiro. E há duas constraints unique na tabela:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.subscriptions'::regclass and contype in ('u','p');
-- subscriptions_tenant_unique               UNIQUE (tenant_id)
-- subscriptions_stripe_subscription_unique  UNIQUE (stripe_subscription_id)
```

O `onConflict` resolve só a primeira. Um conflito na segunda (mesmo
`stripe_subscription_id` chegando com outro `tenant_id`) levanta 23505, que ninguém
lê, e o handler segue para o `return Response.json({ received: true })` de
[`:132`](apps/web/src/app/api/billing/webhook/route.ts:132).

**O que quebra na prática:** o cliente paga, o Stripe recebe **200**, e a assinatura
nunca é gravada. Como o Stripe só reenvia em não-2xx — e mesmo se reenviasse, (a)
descartaria — **a perda é permanente e silenciosa**. Não existe caminho de
recuperação automático.

Evidência de que isso nunca foi exercido em produção:
```sql
select count(*) from public.logs where event = 'stripe.webhook.received';         -- 0
select count(*) from public.subscriptions where status in ('active','trialing');  -- 0
```
Zero webhooks recebidos, zero assinaturas ativas. A cadeia de cobrança **nunca rodou
de ponta a ponta em prod**.

**Fix sugerido:** inverter a ordem — processar primeiro, gravar o marcador por
último, na mesma transação. Trocar o `select`-depois-`insert` por um unique index em
`(event, (metadata->>'stripe_event_id'))` e deixar o banco resolver a corrida. E, no
mínimo, `const { error } = await …upsert(…)` com `throw` em cima: falhar com 5xx é o
que faz o Stripe reenviar.

### C.2 — HIGH · Nenhum tratamento de evento fora de ordem

O Stripe não garante ordem de entrega. O handler
([`:104-110`](apps/web/src/app/api/billing/webhook/route.ts:104)) trata
`created`/`updated`/`deleted` com o **mesmo** `upsertSubscription`, sem comparar
`event.created`, sem versionar, sem guardar timestamp do último evento aplicado.

**O que quebra na prática:** um `customer.subscription.updated` antigo chegando
depois de um `deleted` reescreve o status para `active`. O tenant fica com acesso
pago depois de cancelar — ou perde acesso pago depois de reativar, dependendo de qual
atrasou. O `onConflict: "tenant_id"` ([`:57`](apps/web/src/app/api/billing/webhook/route.ts:57))
garante que o último a escrever ganha, e "último a escrever" não é "último a
acontecer".

**Fix sugerido:** guardar `stripe_event_created_at` na linha e aplicar só se o evento
for mais novo (`where stripe_event_created_at < excluded.stripe_event_created_at`).

### C.3 — MEDIUM · `payment_status` nunca é checado; boleto/Pix marcam "pagamento concluído" sem pagamento

[`webhook/route.ts:112-130`](apps/web/src/app/api/billing/webhook/route.ts:112) trata
`checkout.session.completed` sem olhar `session.payment_status`, e **não existe
handler para `checkout.session.async_payment_succeeded`**:

```bash
grep -n "event.type ===\|async_payment\|invoice\." apps/web/src/app/api/billing/
# só 4 tipos: subscription.created/updated/deleted + checkout.session.completed
```

A skill é explícita: fulfillment tem que estar nos dois handlers, com gate em
`payment_status`.

**O que quebra na prática:** em produto brasileiro com boleto/Pix,
`checkout.session.completed` dispara com `payment_status: 'unpaid'`. O código então
(1) chama `trackFunnelEvent({ event: "payment_completed" })`
([`:122-127`](apps/web/src/app/api/billing/webhook/route.ts:122)) — **o funil
registra pagamento que não aconteceu**; e (2) grava a assinatura via
`mapStripeStatus`, cujo fallback em [`:15`](apps/web/src/app/api/billing/webhook/route.ts:15)
transforma `incomplete` em `past_due`, apagando a diferença entre "aguardando boleto"
e "inadimplente". Quando o boleto é pago, `async_payment_succeeded` chega e ninguém
escuta.

### C.4 — MEDIUM · `trackFunnelEvent` não é aguardado dentro do route handler

[`webhook/route.ts:122`](apps/web/src/app/api/billing/webhook/route.ts:122) — promise
solta, sem `await` e sem `after()`. O `return` de
[`:132`](apps/web/src/app/api/billing/webhook/route.ts:132) pode congelar a lambda
antes do insert. É exatamente o padrão que já foi corrigido em outro ponto do projeto
com `after()`.

### C.5 — MEDIUM · Um customer Stripe novo a cada checkout abandonado

[`checkout/route.ts:33-51`](apps/web/src/app/api/billing/checkout/route.ts:33) procura
`stripe_customer_id` em `subscriptions` — tabela que **só o webhook escreve**
([`webhook:36`](apps/web/src/app/api/billing/webhook/route.ts:36)). Se o usuário abre
o checkout e desiste, nada é gravado; na tentativa seguinte `customerId` é `undefined`
de novo e `stripe.customers.create` roda outra vez. Sem `idempotencyKey` em nenhuma
das duas chamadas ([`:43`](apps/web/src/app/api/billing/checkout/route.ts:43),
[`:54`](apps/web/src/app/api/billing/checkout/route.ts:54)).

**O que quebra na prática:** customers órfãos acumulam, todos com
`metadata.tenant_id` igual. Quando o pagamento finalmente acontece, o portal
([`portal:25`](apps/web/src/app/api/billing/portal/route.ts:25)) aponta para um só
deles — os outros ficam invisíveis no app e visíveis no dashboard do Stripe.

**Fix sugerido:** persistir o `customer.id` assim que criado, e passar
`idempotencyKey` nas duas chamadas.

### C.6 — MEDIUM · O guard de chave Stripe não cobre restricted keys

[`security-guards.ts:35`](apps/web/src/lib/security-guards.ts:35) e
[`:40`](apps/web/src/lib/security-guards.ts:40) checam só os prefixos `sk_test_` e
`sk_live_`. Uma chave `rk_` (restricted) passa nos dois testes e cai no
`return { allowed: true }` de [`:47`](apps/web/src/lib/security-guards.ts:47).

**O que quebra na prática:** a proteção "chave de teste em produção" — que é o motivo
do guard existir — **deixa de valer** no dia em que a equipe adotar RAK, que é
justamente o que a skill recomenda como padrão (`rk_` sobre `sk_`). Um `rk_test_` em
produção passa batido.

**Fix sugerido:** normalizar por `_test_` / `_live_` no meio da string, não por
prefixo `sk_`.

### C.7 — MEDIUM · Cliente Stripe sem `apiVersion` pinada

[`lib/billing/stripe.ts:21`](apps/web/src/lib/billing/stripe.ts:21):
`new Stripe(requireEnv("STRIPE_SECRET_KEY"))` — sem `{ apiVersion }`. O SDK está em
`^22.2.3` (`apps/web/package.json:32`), com `^`, então um `npm update` troca a versão
da API sem ninguém decidir.

**O que quebra na prática:** o próprio código já convive com uma mudança dessas —
`current_period_start` é lido de `subscription.items.data[0]`, não do objeto
`Subscription` ([`webhook:44-49`](apps/web/src/app/api/billing/webhook/route.ts:44)).
A próxima mudança de shape vira `null` silencioso nas datas do período.

### C.8 — MEDIUM · A query de dedupe do webhook faz seq scan em `logs`

[`webhook/route.ts:87-92`](apps/web/src/app/api/billing/webhook/route.ts:87) filtra
por `event` + `.contains("metadata", {…})` (jsonb). Índices existentes:

```sql
select indexdef from pg_indexes where schemaname='public' and tablename='logs';
-- logs_pkey (id)
-- logs_tenant_created_idx (tenant_id, created_at DESC)
```

Nenhum índice em `event`, nenhum GIN em `metadata`. Regra `query-missing-indexes` da
skill de Postgres. `logs` é a tabela de log do app inteiro e cresce sem limite (272
linhas hoje — o problema é a curva, não o número). O índice unique proposto em C.1
resolve correção e performance de uma vez.

---

## Seção D — Cobertura E2E
> Skill: **playwright-cli**

10 specs, 1167 linhas, rodando no CI (`.github/workflows/verify.yml:30`).

### O que está CERTO

A suíte já evita as armadilhas clássicas de asserção.
[`painel-rotas.spec.ts`](apps/web/e2e/painel-rotas.spec.ts) não se contenta com
status: checa `.pn-root` visível ([`:39`](apps/web/e2e/painel-rotas.spec.ts:39)),
`pageerror` ([`:42`](apps/web/e2e/painel-rotas.spec.ts:42)), espera o shell buscar
dados antes de fotografar ([`:47`](apps/web/e2e/painel-rotas.spec.ts:47)) e coleta
5xx da própria app ([`:60`](apps/web/e2e/painel-rotas.spec.ts:60)). O
[`admin-gate.spec.ts:78-90`](apps/web/e2e/admin-gate.spec.ts:78) tem teste de
controle provando que o que barra `/admin` é o `requireAdmin` e não sessão expirada.
As rotas saem do filesystem ([`rotas.ts:29`](apps/web/e2e/rotas.ts:29)), então rota
nova entra sozinha.

**Rotas dinâmicas estão cobertas** — o buraco foi fechado. Os 4 padrões existentes no
disco (`/painel/pages/[id]`, `/painel/campanhas/[slug]`,
`/painel/squad-os/squads/[slug]`, `/admin/tenants/[id]`) têm fixture registrado em
[`fixtures-dinamicas.ts:200-205`](apps/web/e2e/fixtures-dinamicas.ts:200), e o spec
cobra que todo padrão varrido tenha fixture.

### D.1 — HIGH · Zero cobertura do fluxo de pagamento

```bash
grep -rniE "stripe|billing|checkout|pagamento" apps/web/e2e/ --include=*.ts
# só comentários; nenhum teste
```

Nenhum spec toca `/api/billing/checkout`, `/api/billing/portal`,
`/api/billing/webhook`, a seleção de plano ou o `billing-panel.tsx`.

**O que quebra na prática:** é o módulo com os achados C.1 (CRITICAL) e C.2 (HIGH), e
o SQL mostra que ele nunca rodou de verdade em prod (0 webhooks, 0 assinaturas
ativas). Ou seja: o caminho de receita é simultaneamente o menos testado e o menos
exercido. Nada no CI notaria se ele parasse de funcionar — porque nunca provou que
funciona.

**Fix sugerido:** teste de integração no handler do webhook (não precisa de browser):
alimentar um evento assinado com `stripe.webhooks.generateTestHeaderString` e cobrar
que a linha em `subscriptions` aparece; um segundo teste reenviando o mesmo evento
após forçar falha no upsert, cobrando que o reenvio **grava** em vez de ser
descartado — é o mutante que mata C.1.

### D.2 — HIGH · As 13 telas de `/admin` têm cobertura de gate, nenhuma de renderização

Por decisão explícita e documentada ([`rotas.ts:118-123`](apps/web/e2e/rotas.ts:118)):
o usuário de QA é lojista comum e promovê-lo a admin quebraria os testes H1 de
`seguranca-impersonation.spec.ts`. Então `admin-gate.spec.ts` só prova que quem não
pode não entra ([`:41-55`](apps/web/e2e/admin-gate.spec.ts:41),
[`:62-76`](apps/web/e2e/admin-gate.spec.ts:62)) — nunca que a tela funciona.

**O que quebra na prática:** é literalmente a razão pela qual B.1 chegou em produção.
`/admin/billing` e `/admin/instancias` estão quebradas em prod agora, e a suíte está
verde.

### D.3 — HIGH · As asserções existentes passariam mesmo com a tela quebrada

Este é o item que o pedido chama de "assertion que passaria com a feature quebrada",
e vale mesmo para o smoke bom do `/painel`.

O erro do B.1 acontece num **server component**: o `getSupabaseAdmin()` fala com o
PostgREST a partir do servidor, e o erro vira `data: null` sem exceção. Então, se
`/admin/billing` fosse coberta pelo smoke atual, o resultado seria:

| Asserção | Com a tela quebrada |
|---|---|
| `resposta.status() < 400` ([`painel-rotas:34`](apps/web/e2e/painel-rotas.spec.ts:34)) | ✅ passa — a página responde 200 |
| shell visível ([`:39`](apps/web/e2e/painel-rotas.spec.ts:39)) | ✅ passa — o layout monta |
| `pageerror` vazio ([`:42`](apps/web/e2e/painel-rotas.spec.ts:42)) | ✅ passa — não há exceção no browser |
| `falhasDeApi` vazio ([`:60`](apps/web/e2e/painel-rotas.spec.ts:60)) | ✅ passa — [`sessao-helpers.ts:69-75`](apps/web/e2e/sessao-helpers.ts:69) escuta `page.on("response")`, e a chamada ao Supabase **nunca passa pelo browser** |

Quatro asserções, quatro verdes, tela mentindo. Falta a única que pegaria: cobrar
**conteúdo esperado** — que o MRR não seja "R$ 0,00" quando há assinatura, que a
tabela de instâncias tenha linha quando o banco tem 6.

**Fix sugerido:** para as telas que renderizam dado vindo do servidor, uma asserção
de conteúdo — nem que seja "a região não está no estado-vazio" — vale mais do que as
quatro genéricas juntas.

### D.4 — HIGH · O E2E roda contra o schema de DEV, que é o schema errado

[`playwright.config.ts:21-23`](apps/web/playwright.config.ts:21): "o alvo padrão é o
dev server local, que desde 11/08 aponta para o Supabase de dev".

**O que quebra na prática:** dev tem `price_cents` e `profile_name`; prod não. Então
**mesmo depois de corrigir D.2 e D.3**, o teste continuaria verde — porque o ambiente
de teste não reproduz o defeito. Esta é a raiz estrutural: enquanto o schema de dev e
o de prod divergirem, o E2E não é evidência sobre produção, e mover card para
`no_ar_verificado` com base no relatório dele é falso positivo por construção.

**Fix sugerido:** um gate no CI que compare a assinatura de colunas/funções dos dois
bancos e falhe no drift. É a mesma consulta `md5` usada nesta auditoria e roda em
segundos — transforma a Seção B inteira numa classe de bug que não volta.

### D.5 — MEDIUM · `getFunnelMetrics` conta errado a partir de ~1000 eventos

Fora do escopo estrito de E2E, mas é o que alimenta a tela `/admin/funil` que ninguém
testa. [`funnel-events.ts:67-69`](apps/web/src/lib/analytics/funnel-events.ts:67) faz
`.select("event_name")` **sem `limit` e sem paginação**, e conta em JS. Idem
[`:86-89`](apps/web/src/lib/analytics/funnel-events.ts:86). O PostgREST corta em
`max-rows` (1000 por padrão no Supabase). Regra `data-pagination` da skill de
Postgres.

**O que quebra na prática:** hoje `funnel_events` tem 7 linhas em prod, então está
correto. Passando de 1000, a contagem para de crescer e o dashboard de funil passa a
mostrar número errado **sem nenhum sinal de erro** — o mesmo modo de falha do B.1.

**Fix sugerido:** contar no banco (`select event_name, count(*) … group by`) via RPC,
em vez de trazer linha por linha.

---

## Consolidado por severidade

| # | Sev | Onde (arquivo:linha / SQL) | O que quebra na prática | Fix sugerido |
|---|---|---|---|---|
| C.1 | **CRITICAL** | [`webhook/route.ts:96-102`](apps/web/src/app/api/billing/webhook/route.ts:96) + [`:36`](apps/web/src/app/api/billing/webhook/route.ts:36) · `select count(*) from logs where event='stripe.webhook.received'` → **0** | Marcador de dedupe gravado antes do processamento + erro do upsert descartado: cliente paga, Stripe recebe 200, assinatura nunca é gravada, reenvio é tratado como duplicata. Perda permanente e silenciosa | Processar → gravar marcador por último; unique index em `(event, metadata->>'stripe_event_id')`; checar `error` e devolver 5xx |
| B.1 | **HIGH** | `select price_cents from plans` → **42703** · [`admin/billing/page.tsx:63`](apps/web/src/app/admin/billing/page.tsx:63), [`admin/instancias/page.tsx:13`](apps/web/src/app/admin/instancias/page.tsx:13), [`admin/tenants/[id]/page.tsx:50,59`](apps/web/src/app/admin/tenants/[id]/page.tsx:50) | `plans.price_cents` e `instances.profile_name` só existem em dev. Em prod: MRR renderiza **R$ 0,00** e `/admin/instancias` diz "Nenhuma instância" com 6 no banco. Sem erro, sem log | `add column if not exists` nos dois; passar a checar `error` nas 4 queries |
| C.2 | **HIGH** | [`webhook/route.ts:104-110`](apps/web/src/app/api/billing/webhook/route.ts:104), [`:57`](apps/web/src/app/api/billing/webhook/route.ts:57) | Nenhuma guarda de ordem: `updated` antigo depois de `deleted` reativa assinatura cancelada (ou o inverso). Último a escrever ≠ último a acontecer | Gravar `stripe_event_created_at` e só aplicar evento mais novo |
| A.2 | **HIGH** | `pg_policy` → `current_setting('app.tenant_id')` · `grep set_config` → vazio · `role_table_grants` → **65 tabelas com SELECT para `anon`** | RLS é inerte, não "2ª linha": policies dependem de GUC nunca setada. Com SELECT aberto ao `anon` nas 65 tabelas, **uma policy trocada por `using(true)` vira dump público** com a chave que já está no browser | Corrigir o `CLAUDE.md`; revogar SELECT de `anon` onde não há caminho anon, ou reescrever policies com `auth.uid()`+`memberships` |
| B.2 | **HIGH** | `pg_proc` dev × prod · [`worker/event-loop.ts:48,98,107,135`](apps/worker/src/event-loop.ts:48) | 4 RPCs do worker de leads só existem em prod → o worker **não roda contra dev**; caminho só exercitado em produção | Aplicar as 5 funções em dev via `apply-order.txt` e rodar o worker uma vez |
| D.1 | **HIGH** | `grep -riE "stripe\|billing\|checkout" apps/web/e2e/` → nenhum teste | Módulo de receita com 0 cobertura — exatamente onde estão C.1 e C.2 | Teste de integração do handler com evento assinado + reenvio após falha |
| D.2 | **HIGH** | [`rotas.ts:118-123`](apps/web/e2e/rotas.ts:118), [`admin-gate.spec.ts:41-55`](apps/web/e2e/admin-gate.spec.ts:41) | As 13 telas de `/admin` só têm teste de gate. É por isso que B.1 passou | Cobertura de renderização de `/admin` com usuário admin dedicado |
| D.3 | **HIGH** | [`painel-rotas.spec.ts:34,39,42,60`](apps/web/e2e/painel-rotas.spec.ts:34) + [`sessao-helpers.ts:69-75`](apps/web/e2e/sessao-helpers.ts:69) | Erro de server component não vira 5xx nem `pageerror`: as 4 asserções do smoke ficam verdes com a tela quebrada | Asserção de conteúdo (não-estado-vazio) nas telas que renderizam dado do servidor |
| D.4 | **HIGH** | [`playwright.config.ts:21-23`](apps/web/playwright.config.ts:21) | E2E roda contra Supabase de **dev**, que tem as colunas que prod não tem → o defeito B.1 é irreproduzível no CI por construção | Gate de CI comparando assinatura de schema dev × prod |
| A.4 | MEDIUM | `select count(distinct tenant_id) from plans` → **1 de 21 orgs** · [`api/plans/route.ts:8-12`](apps/web/src/app/api/plans/route.ts:8), [`checkout/route.ts:18-23`](apps/web/src/app/api/billing/checkout/route.ts:18) | `plans` tem `tenant_id` preenchido e é servida sem filtro. Com 2º tenant: vaza plano alheio **e** o `.single()` estoura → checkout morre para todos | Decidir se `plans` é global ou por tenant; `unique(tenant_id, code)` + `.eq("tenant_id")` |
| B.3 | MEDIUM | assinatura de tabelas dev × prod · `grep .from("squads\|missions\|…")` | 12 tabelas só em prod, 6 lidas pelo web app: Squad OS responde `42P01` em dev | Aplicar as tabelas em dev |
| B.4 | MEDIUM | `get_advisors`: dev tem `anon_security_definer_function_executable`, prod não | Drift de GRANT: `confirm_lp_capture`/`record_lp_tracking_event` executáveis por `anon` em dev, não em prod. O tracking da LP pode estar morto em prod atrás de um 204 | Comparar `pg_proc.proacl` e igualar deliberadamente |
| C.3 | MEDIUM | [`webhook/route.ts:112-130`](apps/web/src/app/api/billing/webhook/route.ts:112), [`:15`](apps/web/src/app/api/billing/webhook/route.ts:15) | `payment_status` nunca checado e sem handler de `async_payment_succeeded`: boleto/Pix registram `payment_completed` **sem pagamento**, e `incomplete` vira `past_due` | Gate em `payment_status` + handler do evento assíncrono |
| C.4 | MEDIUM | [`webhook/route.ts:122`](apps/web/src/app/api/billing/webhook/route.ts:122) | `trackFunnelEvent` sem `await` nem `after()`: lambda pode congelar antes do insert | Envolver em `after()` |
| C.5 | MEDIUM | [`checkout/route.ts:33-51`](apps/web/src/app/api/billing/checkout/route.ts:33) | Customer Stripe novo a cada checkout abandonado; sem `idempotencyKey` | Persistir `customer.id` na criação + idempotency key |
| C.6 | MEDIUM | [`security-guards.ts:35,40`](apps/web/src/lib/security-guards.ts:35) | Guard só reconhece `sk_`: uma restricted key (`rk_test_`) em produção passa batido — e RAK é o padrão recomendado | Casar por `_test_`/`_live_`, não por prefixo `sk_` |
| C.7 | MEDIUM | [`lib/billing/stripe.ts:21`](apps/web/src/lib/billing/stripe.ts:21) | Sem `apiVersion` e SDK em `^22.2.3`: update troca a versão da API sem decisão. O código já convive com uma mudança de shape dessas | Pinar `apiVersion` explicitamente |
| C.8 | MEDIUM | `pg_indexes` em `logs` → só `pkey` e `(tenant_id, created_at)` · [`webhook/route.ts:87-92`](apps/web/src/app/api/billing/webhook/route.ts:87) | Dedupe faz seq scan em `logs` (tabela de log do app inteiro, sem limite de crescimento) | O unique index de C.1 resolve os dois |
| D.5 | MEDIUM | [`funnel-events.ts:67-69,86-89`](apps/web/src/lib/analytics/funnel-events.ts:67) | `select` sem `limit`: acima de `max-rows` (1000) o funil conta errado sem sinal de erro | Agregar no banco com `group by` |
| A.3 | LOW | `pg_policy` → `admin_alerts`, `engine_commands`, `engine_events`, `instance_send_state` com 0 policies (dev e prod) | RLS ligado sem policy = deny-all. Seguro, mas polui o advisor | Policy explícita de service-role ou documentar a intenção |
| B.5 | LOW | `ls migrations/*.sql` = 41 · `apply-order.txt` = 47 | Nenhuma das duas listas reconstrói nenhum dos dois bancos | Reconciliar ou marcar o diretório como não-fonte-de-verdade |
| — | LOW | `increment_automation_runs` em `pg_proc` de prod; `grep` no repo não acha chamador | Função órfã | Remover |
| — | LOW | `get_advisors` (dev e prod): `auth_leaked_password_protection` WARN | Senha vazada conhecida é aceita no signup | Ligar no painel do Supabase |
| — | LOW | policy `lp_templates_read` em `landing_page_templates` com `using (true)` | Leitura anônima total. A tabela não tem `tenant_id` — é catálogo, então o risco é baixo | Confirmar que é intencional e comentar |

---

## Os 3 primeiros a atacar

**1 · C.1 — o webhook do Stripe perde pagamento em silêncio.**
É o único CRITICAL e o único achado onde o prejuízo é dinheiro que já entrou. O
agravante é que os dois defeitos se protegem: o erro descartado impede o 5xx que
faria o Stripe reenviar, e o marcador gravado cedo faria o reenvio ser ignorado de
qualquer forma. Não há recuperação automática nem rastro para auditar depois. E o
`select count(*) from logs where event='stripe.webhook.received'` = **0** significa
que isso nunca foi exercido em produção — então o custo de consertar agora é o mais
baixo que vai ser, e a primeira venda real é o pior momento possível para descobrir.

**2 · B.1 — as duas colunas que faltam em prod.**
É o mais barato de todos (dois `alter table`) e é o que está quebrado **agora**, em
produção, mostrando **MRR R$ 0,00** numa tela de decisão financeira. Não é risco
futuro: `/admin/instancias` diz "Nenhuma instância encontrada" enquanto o banco tem
6. Vem em segundo só porque não perde dado — mas é o único item desta lista cujo
efeito já está visível na tela hoje.

**3 · D.4 — o gate de drift no CI.**
Os dois itens acima são consertos pontuais; este é o que impede a classe inteira de
voltar. Enquanto o E2E rodar contra um schema que não é o de produção, a suíte não é
evidência sobre prod — e, pior, mover card para `no_ar_verificado` com base no
relatório dela é falso positivo por construção, que é exatamente o que a coluna
existe para evitar. A consulta já está escrita (a assinatura `md5` por tabela usada
nesta auditoria), roda em segundos, e teria pego B.1, B.2, B.3 e B.4 de uma vez.

---

## Não verificado

Registrado para não passar por cobertura que não houve:

- **Não abri as 179 queries das API routes uma a uma.** A varredura de A.1 é por
  grep + contexto de 10 linhas; classifiquei manualmente só as 23 que o filtro
  levantou. Uma query com o `.eq("tenant_id")` a mais de 10 linhas do `.from()`
  contaria como OK sem eu ter olhado.
- **Não executei o webhook do Stripe.** C.1–C.3 são leitura de código somada ao
  estado do banco (0 eventos, 0 assinaturas ativas). Não simulei entrega fora de
  ordem nem reenvio.
- **Não rodei a suíte E2E.** D.1–D.4 vêm de leitura dos specs e da config.
- **Não conferi `pg_proc.proacl`** das duas funções de B.4 — o achado vem da
  diferença entre os advisors dos dois bancos, que é forte mas indireta.
- **Nada foi escrito em nenhum dos dois bancos.** Todo SQL desta auditoria é
  `select`; as duas queries que retornaram 42703 são leituras que falharam, não
  escritas.
