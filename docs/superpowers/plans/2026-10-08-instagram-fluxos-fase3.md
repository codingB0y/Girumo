# Fluxos do Instagram — fase 3 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a receita "Comentou, segue e entra no grupo" roda inteira: o direct pede resposta (com ou sem botão), a resposta abre a conversa, "segue a loja?" é conferido na Zernio, o convite sai, o clique no link é atribuído à pessoa, quem não clicou recebe o lembrete na hora marcada, e as duas visões e a lista mostram quantas pessoas passaram por cada passo.

**Architecture:** o motor (`lib/ig/engine/advance.ts`) passa a ser retomável: um run parado em `active` guarda o bloco e o que espera (`waiting`), e três eventos o acordam: a resposta da pessoa (webhook da Zernio), o clique no link (`/r/<slug>?ig=<ref>`) e o relógio (`POST /api/ig/tick`, batido pelo worker a cada minuto). A conversa da Zernio é gravada no run no primeiro direct da pessoa (coluna nova). Os números saem de `ig_run_steps` por uma função no banco, agrupada por bloco e saída. Uma migração só, nos dois bancos.

**Tech Stack:** Next 15 (App Router, `apps/web`), React 19, TypeScript strict, zod 4, Supabase (dois bancos; RPC via `getSupabaseAdmin().rpc`), worker Node (`apps/worker`, `startLoop`), `node:test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md` (leia §6, §8.2–8.5, §11, §13, §16 e o Apêndice). Planos anteriores, na `main`: fase 1 (`2026-10-03-instagram-fluxos-fase1.md`) e fase 2 (`2026-10-06-instagram-fluxos-fase2.md`). O código desta fase estende o que a fase 2 deixou em `apps/web/src/lib/ig/engine/*`, `lib/stores/ig-runs.ts` e `app/api/ig/webhook/route.ts`; leia esses quatro arquivos antes da Task 3.

## Global Constraints

- Toda query em tabela com `tenant_id` filtra `.eq("tenant_id", tenantId)`, inclusive update, delete e as chamadas de RPC (que recebem `p_tenant`). O service-role bypassa RLS; o filtro é a proteção. Única exceção já documentada: `getAccountByProviderId` (webhook).
- Stores Supabase-only, `import "server-only"`, `getSupabaseAdmin()`; teste de store com PostgREST falso em `node:http` (molde: `src/lib/stores/ig-runs.test.ts`). RPC no falso: `POST /rest/v1/rpc/<nome>` com o corpo `{ p_tenant, ... }`.
- Rotas do painel: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `requireInstagram(req)`, `assertPermission` nas escritas, `catch (e) { if (e instanceof Response) return e; throw e; }`. Rota da engine (`POST /api/ig/tick`): `getRouteTenantContext(req, { allowEngine: true })` e entrada **exata** em `ENGINE_ONLY` (`src/lib/security/request-access-policy.ts`); fora da lista = 401.
- Toda retomada de run é **reivindicada no banco antes de enviar** (update condicional que devolve 0 linhas quando outra requisição chegou antes): reenvio da Zernio, clique duplo e dois ticks do worker nunca mandam duas vezes. A chave de idempotência de um envio leva o bloco e a tentativa (`<run>:<bloco>:<tentativa>`), porque o mesmo bloco pode ser enviado de novo em outro evento (a volta "não segue → pede de novo").
- Regras da Meta: depois de comentário o primeiro direct é a resposta privada (sem botão); todo direct seguinte vai na conversa, que só existe depois de a pessoa mandar mensagem; a resposta abre uma janela de **24 h** (`window_expires_at` é reescrita na resposta); "segue a loja?" só resolve para quem já mandou mensagem (`isFollower: null` = trata como não segue); espera e lembrete até 1380 min; botão só por postback (`buttons: [{ type: "postback" }]`), e o toque chega como `message.received` com `metadata.postbackPayload`.
- Dados pessoais: continua valendo o da fase 2 (nunca o texto da mensagem). O `ref` do link é aleatório, nunca ecoado no HTML, e é **retirado** da URL mandada à Meta no evento de conversão (CAPI).
- O relógio é o worker (`apps/worker`), que já chama o app com `x-engine-token` e `x-tenant-id` (`createAppClient`). Sem `APP_URL`/`ENGINE_TOKEN` ou com `WORKER_IG_TICK_ENABLED` desligado o laço fica **desligado** e o worker avisa no log de boot; isso é uma falha silenciosa do produto (lembrete não sai), então o deploy desta fase inclui ligar a variável no Coolify.
- Interface em PT-BR, vocabulário do atacado ("pessoas", "direct", "atendimentos"). **Nunca "lead".** Sem emoji. Direção D como nas fases anteriores; `npm run painel:check` barra `bg-acid` fora do Postar. Números: `font-data`; "entraram no grupo" é estimativa e leva "≈".
- Nome acessível é contrato de teste (`aria-label`, `role="group"`, `role="status"`, `aria-pressed`). Renomear exige atualizar o teste no mesmo PR.
- Migração: idempotente, nos **dois** bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`), registrada em `deploy/supabase/apply-order.txt`, `deploy/supabase/schema-baseline.json` regenerado no mesmo PR (muda `t|ig_runs` e acrescenta duas funções). DDL quem aplica é o Igor. Função nova: `security invoker`, `set search_path = ''`, `revoke` de `public, anon, authenticated` explícito (função nova nasce chamável por `authenticated`).
- Um PR por assunto, fechado na mesma sessão. Este plano são **4 PRs** (J–M); cada um termina com "Gate" e "Entrega". Commits em inglês com prefixo semântico. PR empilhado + squash vira CONFLICTING: só abra o PR seguinte depois do merge do anterior, a partir de `origin/main`.

## Antes de começar (uma vez)

- [ ] `git fetch origin main`. Confirme na `main`: `apps/web/src/lib/ig/engine/advance.ts` exporta `advance(def, run, deps)` com `RunState.conversationId` e `Deps = { transport, link, step, now }`; `apps/web/src/lib/stores/ig-runs.ts` **não** tem `conversation_id`. Se o chat da fase 2 já tiver mergeado "confirmação com botão" (procure `buttons` em `apps/web/src/lib/ig/transport/types.ts`), **mantenha o nome e o formato que estiverem lá** e pule, na Task 4, o Step que acrescenta `buttons` ao transporte; o resto do plano usa `buttons?: { title: string; payload: string }[]` em `ConversationMessageInput`. Se o nome divergir, troque nas Tasks 4 e 5.
- [ ] Trabalhe no worktree da própria sessão. A cada PR: `git fetch origin main` e `git switch -c <branch> origin/main`.
- [ ] Dependências: `Test-Path apps/web/node_modules/next` e `Test-Path apps/worker/node_modules`. Se faltar, `npm ci` na raiz.
- [ ] Segredos em dev: `apps/web/.env.local` já tem `ZERNIO_API_KEY` e `ZERNIO_WEBHOOK_SECRET` (fase 2). O worker em dev precisa de `APP_URL=http://localhost:3000`, `ENGINE_TOKEN` igual ao do app e `WORKER_IG_TICK_ENABLED=true` em `apps/worker/.env`.
- [ ] Comandos do gate, da raiz (rode todos antes de cada push):

```bash
npm --workspace apps/web test
npm --workspace apps/worker test
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json
npm --workspace apps/worker run build
npm --workspace apps/web run lint
npm --workspace apps/web run painel:check
npm --workspace apps/web run brand:check
npm run scan:secrets
```

Antes do push, o gate completo: `pwsh -File infra/scripts/verify-local.ps1`.

- [ ] Um teste só (web): `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/advance.test.ts`. Worker: `npm --workspace apps/worker exec tsx -- --test src/ig-tick-loop.test.ts`.
- [ ] Quadro (prod `nidoatbxaylrkcgbszns`), ao começar o PR J. Os três cards desta fase já existem em `nao_existe` (criados em 08/10 junto com o plano); mova-os (se o classificador recusar, peça ao Igor). Rode com `npx supabase --workdir <pasta vazia> link --project-ref nidoatbxaylrkcgbszns --yes` e depois `npx supabase --workdir <pasta vazia> db query --linked -f arquivo.sql`:

```sql
select public.move_card('ig-resposta-e-segue', 'em_construcao', 'Fase 3 em implementação (plano docs/superpowers/plans/2026-10-08-instagram-fluxos-fase3.md): PR J schema+stores, PR K motor retomável.', 'plano fase 3');
select public.move_card('ig-clique-e-lembrete', 'em_construcao', 'Fase 3: PR L clique no /r e POST /api/ig/tick batido pelo worker.', 'plano fase 3');
select public.move_card('ig-numeros', 'em_construcao', 'Fase 3: PR M função ig_step_counts, rota de números, trilha, mapa e lista.', 'plano fase 3');
update public.board_features set blocker = 'Fase 3 em implementação: J schema+stores, K motor retomável, L clique+relógio, M números.', updated_at = now() where key in ('ig-resposta-e-segue', 'ig-clique-e-lembrete', 'ig-numeros');
```

## Contrato da Zernio usado nesta fase (além do da fase 2)

| Uso | Chamada | Resposta |
|---|---|---|
| Segue a loja? | `GET /v1/accounts/{accountId}/follow-status/{userId}?refresh=true` | `200 { isFollower: boolean \| null, unavailableReason?: "consent_required" \| "dm_access_disabled" \| "not_messageable" \| "error" }`. `null` = não dá pra saber (a pessoa nunca mandou mensagem) |
| Direct com botão | `POST /v1/inbox/conversations/{conversationId}/messages { accountId, message, buttons: [{ type: "postback", title, payload }] }` | 2xx. 1 a 3 botões; `title` até 20 caracteres |
| Toque no botão | evento `message.received` com `metadata.postbackPayload` = o `payload` enviado e `message.text` = o título do botão | — |

O `payload` que mandamos é `ig:<run.id>:<node.id>`: identifica o run sem depender de quem mandou.

## Mapa de arquivos

| Arquivo | Responsabilidade | PR |
|---|---|---|
| `apps/web/supabase/migrations/20261009120000_ig_fase3.sql`, `deploy/supabase/apply-order.txt`, `deploy/supabase/schema-baseline.json` | `ig_runs.conversation_id`; funções `ig_claim_due_runs` e `ig_step_counts` | J |
| `src/lib/stores/ig-runs.ts` (+ `.test.ts`) | ler por id e por ref, run esperando resposta, reivindicar, marcar clique, runs vencidos (RPC), contagens, números por passo (RPC) | J |
| `src/lib/ig/transport/types.ts`, `zernio.ts`, `fake.ts` (+ testes) | `followStatus`; `buttons` no direct da conversa | K |
| `src/lib/ig/engine/advance.ts` (+ `.test.ts`) | eventos `start/reply/click/timer`, condição, botão, hora de acordar, tentativa na chave | K |
| `src/lib/ig/engine/ambiente.ts` | `ambienteDeProducao()` (sai da rota do webhook) | K |
| `src/lib/ig/engine/resume.ts` (+ `.test.ts`) | `retomarRun(run, evento, amb, extra)` | K |
| `src/lib/ig/engine/handle-event.ts` (+ `.test.ts`) | resposta e postback antes do gatilho | K |
| `src/app/api/ig/webhook/route.ts` | usa `ambienteDeProducao` | K |
| `src/lib/ig/flow/fase.ts` (apagar), `validate.ts`, `app/api/ig/flows/[id]/publish/route.ts`, `components/painel/instagram/editor.tsx` | os blocos da fase 3 passam a publicar | K |
| `src/lib/ig/engine/click.ts` (+ `.test.ts`), `src/lib/links/short-link-click.ts` | clique atribuído; `ref` fora da URL da CAPI | L |
| `src/app/api/ig/tick/route.ts`, `src/lib/security/request-access-policy.ts` (+ teste) | o relógio | L |
| `apps/worker/src/ig-tick-loop.ts` (+ `.test.ts`), `env.ts`, `index.ts` | o laço de 1 minuto | L |
| `src/lib/ig/numeros.ts` (+ `.test.ts`) | contas puras: chegaram no bloco, saída, espessura | M |
| `src/app/api/ig/flows/[id]/numeros/route.ts`, `src/app/api/ig/flows/route.ts` | números do fluxo; resumo da loja na lista | M |
| `components/painel/instagram/use-numeros.ts`, `trilha.tsx`, `mapa.tsx`, `editor.tsx`, `lista.tsx`, e2e | mostrar | M |

---

## PR J — schema e stores

Branch: `feat/ig-fase3-schema`. Entrega: a coluna e as duas funções nos dois bancos, baseline regenerada, e a store com tudo que o motor retomável e os números vão usar. Nada observável no painel.

### Task 1: migração `ig_fase3`

**Files:**
- Create: `apps/web/supabase/migrations/20261009120000_ig_fase3.sql`
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)
- Modify: `deploy/supabase/schema-baseline.json` (regenerado)

- [ ] **Step 1: Confira que ainda não existe** (nos dois bancos; o CLAUDE.md pede isso antes de toda migração):

```sql
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ig_runs' and column_name = 'conversation_id';
select proname from pg_proc where proname in ('ig_claim_due_runs', 'ig_step_counts');
```

Expected: nenhuma linha nas duas consultas.

- [ ] **Step 2: Write the migration**

```sql
-- Fluxos do Instagram, fase 3 (spec docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md
-- §8.2–8.5 e §11; plano docs/superpowers/plans/2026-10-08-instagram-fluxos-fase3.md).
--
-- 1) A conversa da Zernio passa a ficar no run. A resposta privada a um comentário
--    não devolve conversa; ela só aparece quando a pessoa manda mensagem. Sem a
--    coluna, o relógio (worker) não teria por onde mandar o lembrete.
-- 2) ig_claim_due_runs: o relógio pega os runs com hora vencida de UMA loja e
--    zera a hora na mesma instrução (for update skip locked): dois ticks do worker
--    nunca acordam o mesmo run.
-- 3) ig_step_counts: os números por passo. O PostgREST não agrupa; a função conta
--    pessoas (run_id distinto) por bloco e saída num período.
--
-- security INVOKER: quem chama é o service-role do servidor. Função nova nasce
-- chamável por authenticated (default privilege): revogar explicitamente.
-- Idempotente. Vai nos DOIS bancos e muda deploy/supabase/schema-baseline.json
-- (t|ig_runs e as duas funções).

alter table public.ig_runs add column if not exists conversation_id text;

comment on column public.ig_runs.conversation_id is
  'Conversa na Zernio, gravada no 1º direct que a pessoa manda (a resposta privada a comentário não devolve conversa). Por ela saem os directs seguintes e o lembrete.';

create or replace function public.ig_claim_due_runs(p_tenant uuid, p_now timestamptz, p_limit integer)
returns setof public.ig_runs
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.ig_runs r
     set wake_at = null, updated_at = now()
   where r.id in (
     select id
       from public.ig_runs
      where tenant_id = p_tenant
        and status = 'active'
        and wake_at is not null
        and wake_at <= p_now
      order by wake_at
      limit greatest(1, least(coalesce(p_limit, 20), 100))
      for update skip locked
   )
  returning r.*;
$$;

comment on function public.ig_claim_due_runs(uuid, timestamptz, integer) is
  'Relógio dos fluxos do Instagram: devolve e desarma (wake_at = null) os runs ativos com hora vencida da loja. Quem chama retoma cada um.';

create or replace function public.ig_step_counts(p_tenant uuid, p_flow uuid, p_from timestamptz)
returns table (node_id text, "out" text, pessoas bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.node_id, s."out", count(distinct s.run_id)
    from public.ig_run_steps s
   where s.tenant_id = p_tenant
     and s.flow_id = p_flow
     and s.occurred_at >= p_from
   group by s.node_id, s."out";
$$;

comment on function public.ig_step_counts(uuid, uuid, timestamptz) is
  'Números por passo de um fluxo do Instagram: pessoas (runs distintos) que tomaram cada saída de cada bloco desde p_from.';

revoke all on function public.ig_claim_due_runs(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.ig_step_counts(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ig_claim_due_runs(uuid, timestamptz, integer) to service_role;
grant execute on function public.ig_step_counts(uuid, uuid, timestamptz) to service_role;
```

- [ ] **Step 3: Aplicar nos dois bancos** (o Igor roda o DDL; dev primeiro):

```powershell
npx supabase --workdir C:\tmp\sb-dev link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase --workdir C:\tmp\sb-dev db query --linked -f apps\web\supabase\migrations\20261009120000_ig_fase3.sql
npx supabase --workdir C:\tmp\sb link --project-ref nidoatbxaylrkcgbszns --yes
npx supabase --workdir C:\tmp\sb db query --linked -f apps\web\supabase\migrations\20261009120000_ig_fase3.sql
```

Conferir nos dois: as duas consultas do Step 1 agora devolvem `conversation_id` e as duas funções; e `select has_function_privilege('authenticated', 'public.ig_step_counts(uuid, uuid, timestamptz)', 'execute')` devolve `false`.

- [ ] **Step 4: apply-order e baseline**

No fim de `deploy/supabase/apply-order.txt`:

```
# 2026-10-09 - Fase 3 dos fluxos do Instagram: ig_runs.conversation_id e as funções
# ig_claim_due_runs (relógio) e ig_step_counts (números). Muda t|ig_runs e f|ig_*.
# Aplicado nos dois bancos em <data> (conferido por information_schema nos dois).
apps/web/supabase/migrations/20261009120000_ig_fase3.sql
```

Regenerar a baseline a partir de **prod**: `npm run schema:baseline` com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` de prod no ambiente; sem credencial de prod, use o caminho do plano da fase 1 (Task 7, Step "baseline"): `select json_object_agg(kind || '|' || nome, sig order by kind, nome)::text from public.schema_signature();` via `db query --linked` em prod e o script que monta o JSON. Depois `npm run check:drift` contra dev tem que passar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20261009120000_ig_fase3.sql deploy/supabase/apply-order.txt deploy/supabase/schema-baseline.json
git commit -m "feat(ig): phase 3 schema — run conversation, due-run claim and step counts"
```

### Task 2: store `ig-runs` — retomada, clique, relógio e contagens

**Files:**
- Modify: `apps/web/src/lib/stores/ig-runs.ts`
- Modify: `apps/web/src/lib/stores/ig-runs.test.ts`

**Interfaces:**
- Produces: `RunRow` ganha `conversation_id: string | null`; `RunPatch` passa a aceitar também `clicked_at`, `window_expires_at`, `conversation_id`; novas funções `getRunById(tenantId, id)`, `getRunByRef(tenantId, ref)`, `findRunWaitingReply(tenantId, igUserId)`, `claimWaiting(tenantId, id, waiting: "reply" | "click") → boolean`, `markClicked(tenantId, id, atIso) → boolean`, `claimDueRuns(tenantId, nowIso, limit) → RunRow[]`, `stepCounts(tenantId, flowId, sinceIso) → { node_id; out; pessoas }[]`, `countRuns(tenantId, { flowId?, sinceIso, que: "chamaram" | "receberam" | "clicaram" }) → number`.

- [ ] **Step 1: Write the failing tests** (acrescente ao fim de `ig-runs.test.ts`; o servidor falso do arquivo já atende `HEAD` com `Content-Range: 0-0/3` e devolve `linha` ou `[linha]`; acrescente ao `linha` o campo `conversation_id: null` e, no `createServer`, antes do `if (req.method === "HEAD")`, um ramo para RPC: `if (url.pathname.startsWith("/rest/v1/rpc/")) { res.end(JSON.stringify(url.pathname.endsWith("ig_step_counts") ? [{ node_id: "gatilho", out: "next", pessoas: 3 }] : [linha])); return; }`)

```ts
test("ler por id, por ref e o run que espera resposta filtram a loja", async () => {
  pedidos.length = 0;
  await getRunById("loja-a", "r1");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.r1" });
  await getRunByRef("loja-a", "abcdefghijkl");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", ref: "eq.abcdefghijkl" });
  const esperando = await findRunWaitingReply("loja-a", "u1");
  assert.equal(esperando?.id, "r1");
  assert.deepEqual(filtros(pedidos[2].url), { tenant_id: "eq.loja-a", ig_user_id: "eq.u1", status: "eq.active", waiting: "eq.reply", order: "started_at.desc", limit: "1" });
  assert.ok(pedidos[2].url.searchParams.get("select")?.includes("conversation_id"));
});

test("reivindicar e marcar clique são updates condicionais que dizem se foram os primeiros", async () => {
  pedidos.length = 0;
  assert.equal(await claimWaiting("loja-a", "r1", "reply"), true);
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.r1", waiting: "eq.reply" });
  assert.deepEqual(Object.keys(pedidos[0].corpo as object).sort(), ["updated_at", "waiting"]);
  assert.equal((pedidos[0].corpo as { waiting: null }).waiting, null);
  proxima = { status: 200, body: [] };
  assert.equal(await claimWaiting("loja-a", "r1", "click"), false);
  assert.equal(await markClicked("loja-a", "r1", "2026-10-09T12:00:00Z"), true);
  assert.deepEqual(filtros(pedidos[2].url), { tenant_id: "eq.loja-a", id: "eq.r1", clicked_at: "is.null" });
  assert.deepEqual(pedidos[2].corpo, { clicked_at: "2026-10-09T12:00:00Z", updated_at: (pedidos[2].corpo as { updated_at: string }).updated_at });
});

test("runs vencidos e números por passo vão pelas funções do banco, com a loja no parâmetro", async () => {
  pedidos.length = 0;
  const vencidos = await claimDueRuns("loja-a", "2026-10-09T12:00:00Z", 20);
  assert.equal(vencidos.length, 1);
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/rpc/ig_claim_due_runs"]);
  assert.deepEqual(pedidos[0].corpo, { p_tenant: "loja-a", p_now: "2026-10-09T12:00:00Z", p_limit: 20 });
  const passos = await stepCounts("loja-a", "f1", "2026-09-09T00:00:00Z");
  assert.deepEqual(passos, [{ node_id: "gatilho", out: "next", pessoas: 3 }]);
  assert.deepEqual([pedidos[1].metodo, pedidos[1].url.pathname], ["POST", "/rest/v1/rpc/ig_step_counts"]);
  assert.deepEqual(pedidos[1].corpo, { p_tenant: "loja-a", p_flow: "f1", p_from: "2026-09-09T00:00:00Z" });
});

test("as três contagens usam HEAD com os filtros certos, com e sem fluxo", async () => {
  pedidos.length = 0;
  const desde = "2026-09-09T00:00:00Z";
  assert.equal(await countRuns("loja-a", { flowId: "f1", sinceIso: desde, que: "chamaram" }), 3);
  assert.equal(pedidos[0].metodo, "HEAD");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", started_at: `gte.${desde}`, flow_id: "eq.f1" });
  await countRuns("loja-a", { sinceIso: desde, que: "receberam" });
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", started_at: `gte.${desde}`, status: "in.(done,active,stopped)", node_id: "not.is.null" });
  await countRuns("loja-a", { sinceIso: desde, que: "clicaram" });
  assert.deepEqual(filtros(pedidos[2].url), { tenant_id: "eq.loja-a", started_at: `gte.${desde}`, clicked_at: "not.is.null" });
});
```

(importe `claimDueRuns, claimWaiting, countRuns, findRunWaitingReply, getRunById, getRunByRef, markClicked, stepCounts` junto dos outros; `proxima` já existe no arquivo.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/stores/ig-runs.test.ts`
Expected: FAIL (funções não exportadas).

- [ ] **Step 3: Implement**

Em `ig-runs.ts`: acrescente `conversation_id: string | null;` ao `RunRow` (depois de `clicked_at`), `conversation_id` ao fim de `COLS`, e troque `RunPatch` por:

```ts
export type RunPatch = Partial<Pick<RunRow, "status" | "node_id" | "waiting" | "wake_at" | "error_code" | "error_message" | "finished_at" | "clicked_at" | "window_expires_at" | "conversation_id">>;
```

Acrescente no fim do arquivo:

```ts
export async function getRunById(tenantId: string, id: string): Promise<RunRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select(COLS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as RunRow | null) ?? null;
}

/** O clique no `/r/<slug>?ig=<ref>`: o ref é único. */
export async function getRunByRef(tenantId: string, ref: string): Promise<RunRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select(COLS).eq("tenant_id", tenantId).eq("ref", ref).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as RunRow | null) ?? null;
}

/** O run mais recente desta pessoa parado esperando resposta (em qualquer fluxo da loja). */
export async function findRunWaitingReply(tenantId: string, igUserId: string): Promise<RunRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_runs")
    .select(COLS)
    .eq("tenant_id", tenantId)
    .eq("ig_user_id", igUserId)
    .eq("status", "active")
    .eq("waiting", "reply")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RunRow[])[0] ?? null;
}

/**
 * Reivindica a retomada: só quem zera `waiting` manda. Dois eventos pelo mesmo
 * run (reenvio da Zernio, dois ticks) chegam aqui; o segundo recebe `false`.
 */
export async function claimWaiting(tenantId: string, id: string, waiting: "reply" | "click"): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_runs")
    .update({ waiting: null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("waiting", waiting)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Primeiro clique da pessoa no link; `false` = já tinha clicado. */
export async function markClicked(tenantId: string, id: string, atIso: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_runs")
    .update({ clicked_at: atIso, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .is("clicked_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** O relógio: runs ativos com hora vencida, já desarmados pela função do banco. */
export async function claimDueRuns(tenantId: string, nowIso: string, limit: number): Promise<RunRow[]> {
  const { data, error } = await getSupabaseAdmin().rpc("ig_claim_due_runs", { p_tenant: tenantId, p_now: nowIso, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RunRow[];
}

export type StepCount = { node_id: string; out: string; pessoas: number };

/** Pessoas por bloco e saída desde `sinceIso` (função `ig_step_counts`). */
export async function stepCounts(tenantId: string, flowId: string, sinceIso: string): Promise<StepCount[]> {
  const { data, error } = await getSupabaseAdmin().rpc("ig_step_counts", { p_tenant: tenantId, p_flow: flowId, p_from: sinceIso });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ node_id: string; out: string; pessoas: number | string }>).map((r) => ({ node_id: r.node_id, out: r.out, pessoas: Number(r.pessoas) }));
}

export type FiltroContagem = { flowId?: string; sinceIso: string; que: "chamaram" | "receberam" | "clicaram" };

/**
 * chamaram = runs iniciados; receberam = runs que mandaram ao menos um direct
 * (só done/active/stopped têm bloco gravado depois de um envio); clicaram = com
 * clique. Sem flowId, a loja inteira (faixa da lista).
 */
export async function countRuns(tenantId: string, f: FiltroContagem): Promise<number> {
  let q = getSupabaseAdmin().from("ig_runs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("started_at", f.sinceIso);
  if (f.flowId) q = q.eq("flow_id", f.flowId);
  if (f.que === "receberam") q = q.in("status", ["done", "active", "stopped"]).not("node_id", "is", null);
  if (f.que === "clicaram") q = q.not("clicked_at", "is", null);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/stores/ig-runs.test.ts`
Expected: PASS (os 4 da fase 2 e os 4 novos). O `runs/route.ts` (Atendimentos) continua compilando: `RunRow` só ganhou campo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/ig-runs.ts apps/web/src/lib/stores/ig-runs.test.ts
git commit -m "feat(ig): runs store — lookups, claims, due runs, step counts and totals"
```

### Gate J e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde (inclui `check:drift` contra dev: só passa com a migração aplicada em dev e a baseline regenerada de prod).
- [ ] `git push -u origin feat/ig-fase3-schema` e PR:

```
PR J da fase 3 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-08-instagram-fluxos-fase3.md, Tasks 1–2).

- Migração `20261009120000_ig_fase3.sql`, aplicada nos dois bancos: `ig_runs.conversation_id`; `ig_claim_due_runs` (relógio, `for update skip locked`); `ig_step_counts` (números por bloco e saída). Baseline regenerada.
- Store `ig-runs`: ler por id/ref, run esperando resposta, reivindicar retomada, marcar clique, runs vencidos, números por passo, contagens (chamaram/receberam/clicaram).

Nada observável no painel.
```

- [ ] Mergear e abrir a branch do PR K a partir de `origin/main`.

---

## PR K — motor retomável: resposta, botão, "segue a loja?"

Branch: `feat/ig-fase3-motor`. Entrega: a receita "Comentou, segue e entra no grupo" publica e roda até o convite: direct pede resposta → a pessoa responde (texto ou toque no botão) → a Zernio diz se ela segue → convite (ou "pede pra seguir" e volta). O lembrete e o clique ainda não acordam o run (PR L), mas o run já fica `active` com `wake_at` marcado.

### Task 3: transporte — `followStatus` e `buttons`

**Files:**
- Modify: `apps/web/src/lib/ig/transport/types.ts`
- Modify: `apps/web/src/lib/ig/transport/zernio.ts` (métodos `sendMessage` e novo `followStatus`)
- Modify: `apps/web/src/lib/ig/transport/fake.ts` (arquivo inteiro abaixo)
- Modify: `apps/web/src/lib/ig/transport/zernio.test.ts` (dois testes a mais)

**Interfaces:**
- Produces: `ConversationMessageInput.buttons?: { title: string; payload: string }[]`; `Transport.followStatus(accountId, userId) → Promise<boolean | null>`; `createFakeTransport({ falhar?, contas?, segue? })` com `Chamada` `followStatus`.

- [ ] **Step 1: Write the failing tests** (acrescente ao fim de `zernio.test.ts`)

```ts
test("direct com botão vai como postback; sem botão o corpo não tem buttons", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: {} }, { status: 200, body: {} }]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  await z.sendMessage({ accountId: "c1", conversationId: "v1", message: "Quer o link?", idempotencyKey: "a", buttons: [{ title: "Quero o link", payload: "ig:run:no" }] });
  await z.sendMessage({ accountId: "c1", conversationId: "v1", message: "Link", idempotencyKey: "b" });
  assert.deepEqual(pedidos[0].corpo, { accountId: "c1", message: "Quer o link?", buttons: [{ type: "postback", title: "Quero o link", payload: "ig:run:no" }] });
  assert.deepEqual(pedidos[1].corpo, { accountId: "c1", message: "Link" });
});

test("followStatus pede refresh e traduz true/false/null; erro fixo vira null", async () => {
  const { fetchImpl, pedidos } = fetchFalso([
    { status: 200, body: { isFollower: true } },
    { status: 200, body: { isFollower: false } },
    { status: 200, body: { isFollower: null, unavailableReason: "consent_required" } },
    { status: 400, body: { error: "x", type: "invalid_request_error", code: "invalid_user_id" } },
  ]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  assert.equal(await z.followStatus("c1", "u/1"), true);
  assert.equal(pedidos[0].url.pathname, "/api/v1/accounts/c1/follow-status/u%2F1");
  assert.equal(pedidos[0].url.searchParams.get("refresh"), "true");
  assert.equal(await z.followStatus("c1", "u1"), false);
  assert.equal(await z.followStatus("c1", "u1"), null);
  assert.equal(await z.followStatus("c1", "u1"), null);
  const caiu = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
  await assert.rejects(() => createZernioTransport({ apiKey: "k", fetchImpl: caiu }).followStatus("c1", "u1"), (e: unknown) => e instanceof ZernioError && e.transient);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/transport/zernio.test.ts`
Expected: FAIL (`followStatus` não existe; `buttons` não vai no corpo).

- [ ] **Step 3: Types**

Em `types.ts`:

```ts
export type Botao = { title: string; payload: string };
export type ConversationMessageInput = { accountId: string; conversationId: string; message: string; idempotencyKey: string; buttons?: Botao[] };
```

e, dentro de `Transport`, depois de `sendMessage`:

```ts
  /** "Segue a loja?" com `refresh=true`. `null` = a Zernio não consegue dizer (a pessoa nunca mandou mensagem) ou recusou o pedido. Lança só erro passageiro. */
  followStatus(accountId: string, userId: string): Promise<boolean | null>;
```

- [ ] **Step 4: Zernio**

Em `zernio.ts`, troque `sendMessage` e acrescente `followStatus` logo depois:

```ts
    async sendMessage(i: ConversationMessageInput) {
      const body: Record<string, unknown> = { accountId: i.accountId, message: i.message };
      if (i.buttons?.length) body.buttons = i.buttons.map((b) => ({ type: "postback", title: b.title, payload: b.payload }));
      await call({ method: "POST", path: `v1/inbox/conversations/${seg(i.conversationId)}/messages`, body, idempotencyKey: i.idempotencyKey });
    },
    async followStatus(accountId, userId) {
      try {
        const r = await call<{ isFollower?: boolean | null }>({ method: "GET", path: `v1/accounts/${seg(accountId)}/follow-status/${seg(userId)}`, query: { refresh: "true" } });
        return r.isFollower === true ? true : r.isFollower === false ? false : null;
      } catch (e) {
        if (e instanceof ZernioError && !e.transient) return null;
        throw e;
      }
    },
```

- [ ] **Step 5: Fake (arquivo inteiro)**

```ts
// apps/web/src/lib/ig/transport/fake.ts
import type { ConversationMessageInput, PrivateReplyInput, PublicReplyInput, Transport, ZernioAccount, ZernioError } from "./types";

export type Chamada =
  | { metodo: "ensureProfile"; args: string }
  | { metodo: "connectUrl"; args: { profileId: string; redirectUrl: string } }
  | { metodo: "listAccounts"; args: string }
  | { metodo: "deleteAccount"; args: string }
  | { metodo: "privateReply"; args: PrivateReplyInput }
  | { metodo: "publicReply"; args: PublicReplyInput }
  | { metodo: "sendMessage"; args: ConversationMessageInput }
  | { metodo: "followStatus"; args: { accountId: string; userId: string } };

/**
 * Transporte dos testes: grava cada chamada e, por método, lança o erro
 * combinado em `falhar` (sempre que o método é chamado). `segue` é a resposta
 * de `followStatus` (padrão `true`). Sem "server-only" de propósito.
 */
export function createFakeTransport(opts: { falhar?: Partial<Record<Chamada["metodo"], ZernioError>>; contas?: ZernioAccount[]; segue?: boolean | null } = {}) {
  const chamadas: Chamada[] = [];
  const registra = (c: Chamada) => {
    chamadas.push(c);
    const erro = opts.falhar?.[c.metodo];
    if (erro) throw erro;
  };
  const transport: Transport = {
    async ensureProfile(name) {
      registra({ metodo: "ensureProfile", args: name });
      return "perfil-falso";
    },
    async connectUrl(profileId, redirectUrl) {
      registra({ metodo: "connectUrl", args: { profileId, redirectUrl } });
      return "https://zernio.falso/autorizar";
    },
    async listAccounts(profileId) {
      registra({ metodo: "listAccounts", args: profileId });
      return opts.contas ?? [];
    },
    async deleteAccount(accountId) {
      registra({ metodo: "deleteAccount", args: accountId });
    },
    async privateReply(i) {
      registra({ metodo: "privateReply", args: i });
    },
    async publicReply(i) {
      registra({ metodo: "publicReply", args: i });
    },
    async sendMessage(i) {
      registra({ metodo: "sendMessage", args: i });
    },
    async followStatus(accountId, userId) {
      registra({ metodo: "followStatus", args: { accountId, userId } });
      return opts.segue === undefined ? true : opts.segue;
    },
  };
  return { transport, chamadas };
}
```

- [ ] **Step 6: Run tests**

Run: `npm --workspace apps/web test`
Expected: PASS (os testes da fase 2 que usam o fake continuam valendo: `followStatus` só é chamado por quem pede).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/ig/transport/types.ts apps/web/src/lib/ig/transport/zernio.ts apps/web/src/lib/ig/transport/fake.ts apps/web/src/lib/ig/transport/zernio.test.ts
git commit -m "feat(ig): transport — follow status and postback buttons"
```

### Task 4: `advance` retomável (eventos, condição, botão, hora de acordar)

**Files:**
- Modify: `apps/web/src/lib/ig/engine/advance.ts` (arquivo inteiro abaixo)
- Modify: `apps/web/src/lib/ig/engine/advance.test.ts` (arquivo inteiro abaixo)

**Interfaces:**
- Produces: `RunState` ganha `igUserId: string`, `nodeId: string | null`, `attempt: string`; `Evento = "start" | "reply" | "click" | "timer"`; `Resultado` ganha `wakeAt: string | null`; `Deps` ganha `follows: (igUserId: string) => Promise<boolean>`; `advance(def, run, deps, evento = "start")`.

- [ ] **Step 1: Write the test file (inteiro)**

```ts
// apps/web/src/lib/ig/engine/advance.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import type { FlowDef, FlowOut } from "@/lib/ig/flow/types";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import { advance, type Deps, type RunState } from "./advance";

const comConvite = (def: FlowDef, slug = "vip"): FlowDef => ({ ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: slug } : n)) });
const T0 = new Date("2026-10-09T12:00:00Z");
const agora = () => T0;
const base: RunState = { id: "run-1", flowId: "f1", ref: "ref123456789", sourceKind: "comment", providerAccountId: "z1", igUserId: "u1", comment: { platformPostId: "post", commentId: "com" }, conversationId: null, windowExpiresAt: "2026-10-16T12:00:00Z", directsSent: 0, nodeId: null, attempt: "" };
const dm: RunState = { ...base, sourceKind: "dm", comment: null, conversationId: "conv", windowExpiresAt: "2026-10-10T12:00:00Z" };

function montar(opts: Parameters<typeof createFakeTransport>[0] = {}) {
  const { transport, chamadas } = createFakeTransport(opts);
  const passos: Array<[string, FlowOut]> = [];
  const deps: Deps = {
    transport,
    now: agora,
    link: async (slug, ref) => `https://app/r/${slug}?ig=${ref}`,
    step: async (n, o) => { passos.push([n, o]); },
    follows: async () => (opts.segue === undefined ? true : opts.segue === true),
  };
  return { deps, chamadas, passos };
}
const metodos = (c: ReturnType<typeof montar>["chamadas"]) => c.map((x) => x.metodo);

test("comentou, entra no grupo: resposta pública, uma privada com o link, termina", async () => {
  const { deps, chamadas, passos } = montar();
  const r = await advance(comConvite(RECIPES.comment_invite.build()), base, deps);
  assert.deepEqual([r.status, r.directsSent, r.wakeAt], ["done", 1, null]);
  assert.deepEqual(metodos(chamadas), ["publicReply", "privateReply"]);
  const privada = chamadas[1];
  assert.ok(privada.metodo === "privateReply");
  assert.equal(privada.args.message, "Oi! Aqui está o link do grupo VIP:\nhttps://app/r/vip?ig=ref123456789");
  assert.equal(privada.args.idempotencyKey, "run-1:convite");
  assert.deepEqual(passos, [["gatilho", "next"]]);
});

test("comentou, segue e entra: o primeiro direct pede resposta e o run fica esperando, com hora de vencer", async () => {
  const { deps, chamadas } = montar();
  const r = await advance(comConvite(RECIPES.comment_follow_invite.build()), base, deps);
  assert.deepEqual([r.status, r.waiting, r.nodeId], ["active", "reply", "pede"]);
  assert.equal(r.wakeAt, "2026-10-10T11:00:00.000Z", "1380 min depois");
  assert.deepEqual(metodos(chamadas), ["publicReply", "privateReply"]);
});

test("a resposta retoma do bloco parado: 'segue a loja?' na Zernio, convite na conversa, espera o clique com o lembrete marcado", async () => {
  const def = comConvite(RECIPES.comment_follow_invite.build());
  const parado: RunState = { ...base, conversationId: "conv-1", directsSent: 1, nodeId: "pede", attempt: "evt-2" };
  const { deps, chamadas, passos } = montar({ segue: true });
  const r = await advance(def, parado, deps, "reply");
  assert.deepEqual([r.status, r.waiting, r.nodeId], ["active", "click", "convite"]);
  assert.equal(r.wakeAt, "2026-10-09T13:00:00.000Z", "lembrete em 60 min");
  assert.deepEqual(metodos(chamadas), ["followStatus", "sendMessage"]);
  assert.ok(chamadas[0].metodo === "followStatus" && chamadas[0].args.userId === "u1");
  const envio = chamadas[1];
  assert.ok(envio.metodo === "sendMessage" && envio.args.conversationId === "conv-1" && envio.args.idempotencyKey === "run-1:convite:evt-2");
  assert.deepEqual(passos, [["pede", "replied"], ["segue", "yes"]]);
});

test("não segue: pede pra seguir e espera de novo; null da Zernio conta como não segue", async () => {
  const def = comConvite(RECIPES.comment_follow_invite.build());
  const parado: RunState = { ...base, conversationId: "conv-1", directsSent: 1, nodeId: "pede", attempt: "evt-2" };
  for (const segue of [false, null] as const) {
    const { deps, chamadas, passos } = montar({ segue });
    const r = await advance(def, parado, deps, "reply");
    assert.deepEqual([r.status, r.waiting, r.nodeId], ["active", "reply", "pede_seguir"]);
    assert.deepEqual(metodos(chamadas), ["followStatus", "sendMessage"]);
    assert.deepEqual(passos, [["pede", "replied"], ["segue", "no"]]);
  }
});

test("direct com botão vai com postback ig:<run>:<bloco>; a resposta privada nunca leva botão", async () => {
  const def: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "pergunta", type: "message", text: "Quer o link do grupo?", button: "Quero o link", wait: { minutes: 30 } },
      { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "pergunta" }, { from: "pergunta", out: "replied", to: "convite" }],
  };
  const { deps, chamadas } = montar();
  const r = await advance(def, dm, deps);
  assert.deepEqual([r.status, r.waiting, r.wakeAt], ["active", "reply", "2026-10-09T12:30:00.000Z"]);
  const envio = chamadas[0];
  assert.ok(envio.metodo === "sendMessage");
  assert.deepEqual(envio.args.buttons, [{ title: "Quero o link", payload: "ig:run-1:pergunta" }]);

  const depoisDoComentario: FlowDef = { ...def, nodes: def.nodes.map((n) => (n.type === "trigger" ? { ...n, on: "comment" as const } : n)) };
  const { deps: d2, chamadas: c2 } = montar();
  await advance(depoisDoComentario, base, d2);
  assert.ok(c2[0].metodo === "privateReply", "privada, sem botão");
});

test("clique e relógio: clicou segue 'clicked'; relógio em quem não clicou manda o lembrete e termina; relógio na espera sem desvio termina", async () => {
  const def = comConvite(RECIPES.comment_follow_invite.build());
  const noConvite: RunState = { ...base, conversationId: "conv-1", directsSent: 2, nodeId: "convite", attempt: "t1" };
  const clicou = await advance(def, noConvite, montar().deps, "click");
  assert.deepEqual([clicou.status, clicou.nodeId], ["done", "convite"]);

  const { deps, chamadas, passos } = montar();
  const lembrou = await advance(def, noConvite, deps, "timer");
  assert.deepEqual([lembrou.status, lembrou.nodeId, lembrou.wakeAt], ["done", "lembrete", null]);
  assert.deepEqual(metodos(chamadas), ["sendMessage"]);
  assert.deepEqual(passos, [["convite", "not_clicked"]]);

  const naEspera: RunState = { ...base, conversationId: "conv-1", directsSent: 1, nodeId: "pede", attempt: "t2" };
  const venceu = await advance(def, naEspera, montar().deps, "timer");
  assert.deepEqual([venceu.status, venceu.nodeId], ["done", "pede"]);
});

test("evento que não cabe no bloco parado vira falha unexpected_event; bloco sumido, missing_node", async () => {
  const def = comConvite(RECIPES.comment_follow_invite.build());
  const r1 = await advance(def, { ...base, nodeId: "pede", attempt: "x" }, montar().deps, "click");
  assert.deepEqual([r1.status, r1.errorCode], ["failed", "unexpected_event"]);
  const r2 = await advance(def, { ...base, nodeId: "sumiu", attempt: "x" }, montar().deps, "reply");
  assert.deepEqual([r2.status, r2.errorCode], ["failed", "missing_node"]);
});

test("convite com desvio por clique mas sem lembrete espera até a janela fechar", async () => {
  const def: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null },
      { id: "obrigado", type: "message", text: "Boa!", button: null, wait: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "convite" }, { from: "convite", out: "clicked", to: "obrigado" }],
  };
  const r = await advance(def, dm, montar().deps);
  assert.deepEqual([r.status, r.waiting, r.wakeAt], ["active", "click", "2026-10-10T12:00:00Z"]);
});

test("resposta privada já gasta conta como enviada; erro fixo marca falha; passageiro estoura; pública falhar não para", async () => {
  const def = comConvite(RECIPES.comment_invite.build());
  const gasta = new ZernioError(400, "invalid_request_error", "private_reply_consumed", { privateReplyConsumed: true }, "spent");
  assert.equal((await advance(def, base, montar({ falhar: { privateReply: gasta } }).deps)).status, "done");
  const recusa = new ZernioError(400, "platform_error", "platform_api_error", null, "não");
  const r = await advance(def, base, montar({ falhar: { privateReply: recusa } }).deps);
  assert.deepEqual([r.status, r.errorCode, r.nodeId], ["failed", "platform_api_error", "convite"]);
  const fora = new ZernioError(502, "platform_error", "platform_api_error", null, "upstream");
  await assert.rejects(() => advance(def, base, montar({ falhar: { privateReply: fora } }).deps), (e: unknown) => e instanceof ZernioError && e.transient);
  const { deps, chamadas } = montar({ falhar: { publicReply: recusa } });
  assert.equal((await advance(def, base, deps)).status, "done");
  assert.deepEqual(metodos(chamadas), ["publicReply", "privateReply"]);
});

test("janela fechada: nada sai; segundo direct depois de comentário sem conversa: no_conversation; ciclo para em 2 visitas", async () => {
  const def = comConvite(RECIPES.comment_invite.build());
  const vencido = await advance(def, { ...base, windowExpiresAt: "2026-10-09T11:59:59Z" }, montar().deps);
  assert.deepEqual([vencido.status, vencido.errorCode], ["failed", "window_expired"]);

  const dois: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "m1", type: "message", text: "Oi", button: null, wait: null },
      { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "m1" }, { from: "m1", out: "next", to: "convite" }],
  };
  const r = await advance(dois, base, montar().deps);
  assert.deepEqual([r.status, r.errorCode, r.nodeId, r.directsSent], ["failed", "no_conversation", "convite", 1]);

  const ciclo: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "a", type: "message", text: "A", button: null, wait: null },
      { id: "b", type: "message", text: "B", button: null, wait: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "a" }, { from: "a", out: "next", to: "b" }, { from: "b", out: "next", to: "a" }],
  };
  const { deps, chamadas } = montar();
  const c = await advance(ciclo, dm, deps);
  assert.deepEqual([c.status, c.errorCode, chamadas.length], ["failed", "cycle", 4]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/advance.test.ts`
Expected: FAIL (tipos sem `igUserId`/`nodeId`/`attempt`, `advance` sem o 4º argumento, condição devolve `unsupported_node`).

- [ ] **Step 3: Rewrite `advance.ts` (inteiro)**

```ts
// apps/web/src/lib/ig/engine/advance.ts
import type { FlowDef, FlowNode, FlowOut, InviteNode, MessageNode } from "@/lib/ig/flow/types";
import { ZernioError, type Transport } from "@/lib/ig/transport/types";

export type RunState = {
  id: string;
  flowId: string;
  ref: string;
  sourceKind: "comment" | "dm" | "story";
  providerAccountId: string;
  /** IGSID da pessoa: é com ele que "segue a loja?" pergunta à Zernio. */
  igUserId: string;
  /** Só quem veio por comentário: onde vão a resposta pública e a privada. */
  comment: { platformPostId: string; commentId: string } | null;
  /** Conversa na Zernio. Nasce com quem veio por direct/story; depois de um comentário só existe quando a pessoa responde. */
  conversationId: string | null;
  windowExpiresAt: string;
  /** Directs já enviados neste run: o primeiro depois de comentário é a resposta privada. */
  directsSent: number;
  /** Bloco em que o run parou (`active`): de onde a retomada continua. `null` no início. */
  nodeId: string | null;
  /** Distingue envios do mesmo bloco em eventos diferentes (chave de idempotência). "" no início. */
  attempt: string;
};

export type Evento = "start" | "reply" | "click" | "timer";

export type Resultado = {
  status: "done" | "active" | "failed";
  nodeId: string | null;
  waiting: "reply" | "click" | null;
  /** Quando o relógio acorda o run (`active`): fim da espera pela resposta, hora do lembrete ou fim da janela. */
  wakeAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  directsSent: number;
};

export type Deps = {
  transport: Transport;
  link: (slug: string, ref: string) => Promise<string>;
  step: (nodeId: string, out: FlowOut) => Promise<void>;
  now: () => Date;
  /** "Segue a loja?": `true` só quando a Zernio confirma. */
  follows: (igUserId: string) => Promise<boolean>;
};

const MAX_VISITAS = 2;
const MAX_ERRO = 200;

type Envio = { ok: true } | { ok: false; code: string; message: string | null };

async function enviar(run: RunState, no: MessageNode | InviteNode, texto: string, directsSent: number, transport: Transport): Promise<Envio> {
  const idempotencyKey = run.attempt ? `${run.id}:${no.id}:${run.attempt}` : `${run.id}:${no.id}`;
  try {
    if (run.sourceKind === "comment" && directsSent === 0) {
      if (!run.comment) return { ok: false, code: "no_comment", message: null };
      // A resposta privada nunca leva botão: o Instagram recusa pra quem não segue e a recusa gasta o único direct.
      await transport.privateReply({ accountId: run.providerAccountId, platformPostId: run.comment.platformPostId, commentId: run.comment.commentId, message: texto, idempotencyKey });
      return { ok: true };
    }
    if (!run.conversationId) return { ok: false, code: "no_conversation", message: null };
    const buttons = no.type === "message" && no.button ? [{ title: no.button, payload: `ig:${run.id}:${no.id}` }] : undefined;
    await transport.sendMessage({ accountId: run.providerAccountId, conversationId: run.conversationId, message: texto, idempotencyKey, ...(buttons ? { buttons } : {}) });
    return { ok: true };
  } catch (e) {
    if (!(e instanceof ZernioError)) throw e;
    // Reenvio da Zernio depois de a privada já ter saído: está enviado.
    if (e.privateReplyConsumed) return { ok: true };
    // Rede, 429, 5xx: quem chama devolve 500 (ou remarca o relógio) e tenta de novo.
    if (e.transient) throw e;
    return { ok: false, code: e.code, message: e.message.slice(0, MAX_ERRO) };
  }
}

/** Que saída o evento toma no bloco em que o run parou; `null` = o evento não cabe neste bloco. */
function saidaDaRetomada(no: FlowNode, evento: Exclude<Evento, "start">): FlowOut | null {
  if (no.type === "message" && no.wait) return evento === "reply" ? "replied" : evento === "timer" ? "timeout" : null;
  if (no.type === "invite") return evento === "click" ? "clicked" : evento === "timer" ? "not_clicked" : null;
  return null;
}

/**
 * Executa o run até parar: terminou (`done`), ficou esperando (`active`, com
 * `waiting` e `wakeAt`) ou falhou. No início (`start`) parte do gatilho; nos
 * outros eventos parte do bloco em que o run parou (`run.nodeId`), toma a saída
 * do evento e segue. Cada transição grava um passo. Lança o `ZernioError`
 * passageiro em vez de gravar falha.
 */
export async function advance(def: FlowDef, run: RunState, deps: Deps, evento: Evento = "start"): Promise<Resultado> {
  const nos = new Map(def.nodes.map((n) => [n.id, n]));
  const proximo = (de: string, out: FlowOut) => def.edges.find((e) => e.from === de && e.out === out)?.to ?? null;
  const visitas = new Map<string, number>();
  const agora = deps.now();
  const minutos = (m: number) => new Date(agora.getTime() + m * 60_000).toISOString();
  let directsSent = run.directsSent;
  const falha = (nodeId: string | null, code: string, message: string | null): Resultado => ({ status: "failed", nodeId, waiting: null, wakeAt: null, errorCode: code, errorMessage: message, directsSent });
  const fim = (nodeId: string | null): Resultado => ({ status: "done", nodeId, waiting: null, wakeAt: null, errorCode: null, errorMessage: null, directsSent });
  const espera = (nodeId: string, waiting: "reply" | "click", wakeAt: string): Resultado => ({ status: "active", nodeId, waiting, wakeAt, errorCode: null, errorMessage: null, directsSent });

  let atualId: string | null;
  if (evento === "start") {
    const gatilho = def.nodes.find((n) => n.type === "trigger");
    if (!gatilho || gatilho.type !== "trigger") return falha(null, "no_trigger", null);
    // Resposta pública: ação do gatilho, só para quem comentou. A privada é o que importa; a pública falhar não para o run.
    if (run.sourceKind === "comment" && run.comment && gatilho.publicReply) {
      try {
        await deps.transport.publicReply({ accountId: run.providerAccountId, platformPostId: run.comment.platformPostId, commentId: run.comment.commentId, message: gatilho.publicReply, idempotencyKey: `${run.id}:${gatilho.id}:public` });
      } catch (e) {
        if (!(e instanceof ZernioError)) throw e;
      }
    }
    await deps.step(gatilho.id, "next");
    atualId = proximo(gatilho.id, "next");
  } else {
    const parado = run.nodeId ? nos.get(run.nodeId) : undefined;
    if (!parado) return falha(run.nodeId, "missing_node", null);
    const out = saidaDaRetomada(parado, evento);
    if (!out) return falha(parado.id, "unexpected_event", null);
    await deps.step(parado.id, out);
    atualId = proximo(parado.id, out);
    if (!atualId) return fim(parado.id);
  }

  while (atualId) {
    const no = nos.get(atualId);
    if (!no) return falha(atualId, "missing_node", null);
    const vez = (visitas.get(no.id) ?? 0) + 1;
    visitas.set(no.id, vez);
    if (vez > MAX_VISITAS) return falha(no.id, "cycle", null);
    if (agora.getTime() > Date.parse(run.windowExpiresAt)) return falha(no.id, "window_expired", null);
    if (no.type === "trigger") return falha(no.id, "trigger_in_middle", null);

    if (no.type === "condition") {
      const out: FlowOut = (await deps.follows(run.igUserId)) ? "yes" : "no";
      await deps.step(no.id, out);
      atualId = proximo(no.id, out);
      if (!atualId) return fim(no.id);
      continue;
    }

    const texto = no.type === "invite" && no.campaignSlug ? `${no.text}\n${await deps.link(no.campaignSlug, run.ref)}` : no.text;
    const envio = await enviar(run, no, texto, directsSent, deps.transport);
    if (!envio.ok) return falha(no.id, envio.code, envio.message);
    directsSent += 1;

    if (no.type === "message" && no.wait) return espera(no.id, "reply", minutos(no.wait.minutes));
    if (no.type === "invite") {
      const temDesvio = proximo(no.id, "clicked") !== null || proximo(no.id, "not_clicked") !== null || no.remindAfterMinutes !== null;
      if (!temDesvio) return fim(no.id);
      // Sem lembrete, o relógio só fecha o run quando a janela acaba.
      return espera(no.id, "click", no.remindAfterMinutes !== null ? minutos(no.remindAfterMinutes) : run.windowExpiresAt);
    }
    await deps.step(no.id, "next");
    atualId = proximo(no.id, "next");
    if (!atualId) return fim(no.id);
  }
  return fim(run.nodeId);
}
```

- [ ] **Step 4: Run tests**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/advance.test.ts`
Expected: PASS (10 testes). `handle-event.ts` ainda não compila (RunState mudou): a Task 5 conserta; não rode o `tsc` antes dela.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/engine/advance.ts apps/web/src/lib/ig/engine/advance.test.ts
git commit -m "feat(ig): resumable engine — reply, click and timer events, follow check, buttons, wake time"
```

### Task 5: ambiente de produção, `retomarRun` e a resposta no webhook

**Files:**
- Modify: `apps/web/src/lib/ig/engine/handle-event.ts` (arquivo inteiro abaixo)
- Create: `apps/web/src/lib/ig/engine/resume.ts`
- Create: `apps/web/src/lib/ig/engine/ambiente.ts`
- Modify: `apps/web/src/app/api/ig/webhook/route.ts`
- Modify: `apps/web/src/lib/ig/engine/handle-event.test.ts` (arquivo inteiro abaixo)
- Create: `apps/web/src/lib/ig/engine/resume.test.ts`

**Interfaces:**
- Produces: `Ambiente` ganha `contaDaLoja(tenantId) → IgAccount | null`, `fluxoPublicado(tenantId, flowId) → { def; version } | null`, `segue(providerAccountId, igUserId) → boolean`, e em `runs`: `porId`, `porRef`, `esperandoResposta(tenantId, igUserId)`, `reivindicar(tenantId, id, waiting) → boolean`, `marcarClique(tenantId, id, atIso) → boolean`, `vencidos(tenantId, nowIso, limit) → RunRow[]`; `retomarRun(run: RunRow, r: Retomada, amb) → Desfecho` com `Retomada = { kind: "reply" | "click" | "timer"; attempt: string; conversationId?: string; sentAt?: string }`; `ambienteDeProducao(): Ambiente`; `Desfecho` ganha `{ kind: "resumed"; tenantId; runId; status }`.

- [ ] **Step 1: Write the failing tests**

Os literais de `IgAccount` nos testes abaixo usam os campos de `src/lib/stores/ig-accounts.ts` (`id, username, status, provider, provider_account_id, provider_profile_id, connected_at`); se o tipo na `main` não tiver `provider_profile_id`, tire-o dos literais (o TypeScript recusa campo a mais em literal com tipo contextual).

`resume.test.ts`:

```ts
// apps/web/src/lib/ig/engine/resume.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import type { RunPatch, RunRow } from "@/lib/stores/ig-runs";
import type { Ambiente } from "./handle-event";
import { retomarRun } from "./resume";

const T0 = new Date("2026-10-09T12:00:00Z");
const def = { ...RECIPES.comment_follow_invite.build() };
const live = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
const run: RunRow = { id: "run-1", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f1", flow_version: 1, source_kind: "comment", source_id: "c1", ig_user_id: "u1", username: "igortoled0", matched_keyword: "quero", ref: "ref123456789", status: "active", node_id: "pede", waiting: "reply", wake_at: "2026-10-10T11:00:00Z", window_expires_at: "2026-10-16T12:00:00Z", clicked_at: null, conversation_id: null, error_code: null, error_message: null, started_at: "2026-10-09T11:00:00Z", updated_at: "2026-10-09T11:00:00Z", finished_at: null };

function ambiente(opts: { falhar?: Parameters<typeof createFakeTransport>[0]["falhar"]; segue?: boolean | null; reivindica?: boolean; fluxo?: boolean; conta?: boolean } = {}) {
  const { transport, chamadas } = createFakeTransport({ falhar: opts.falhar, segue: opts.segue });
  const patches: Array<[string, RunPatch]> = [];
  const amb: Ambiente = {
    transport,
    now: () => T0,
    novoRef: () => "novo-ref-12345",
    contaPorIdDaZernio: async () => null,
    mudarEstadoDaConta: async () => {},
    lojaLiberada: async () => true,
    fluxosNoAr: async () => [],
    contaDaLoja: async () => (opts.conta === false ? null : { id: "a1", username: "vireimoda", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "t" }),
    fluxoPublicado: async () => (opts.fluxo === false ? null : { def: live, version: 1 }),
    segue: async () => opts.segue === true || opts.segue === undefined,
    runs: {
      criar: async () => null,
      porOrigem: async () => null,
      porId: async () => run,
      porRef: async () => run,
      esperandoResposta: async () => run,
      atualizar: async (_t, id, patch) => { patches.push([id, patch]); },
      passo: async () => {},
      iniciadosDesde: async () => 0,
      entradaRecente: async () => false,
      reivindicar: async () => opts.reivindica ?? true,
      marcarClique: async () => true,
      vencidos: async () => [],
    },
    link: async (_t, slug, ref) => `https://app/r/${slug}?ig=${ref}`,
  };
  return { amb, chamadas, patches };
}

test("resposta: grava a conversa e a janela de 24 h, confere na Zernio, manda o convite e marca o lembrete", async () => {
  const { amb, chamadas, patches } = ambiente({ segue: true });
  const d = await retomarRun(run, { kind: "reply", attempt: "evt-9", conversationId: "conv-1", sentAt: "2026-10-09T11:59:00Z" }, amb);
  assert.deepEqual(d, { kind: "resumed", tenantId: "loja-a", runId: "run-1", status: "active" });
  assert.deepEqual(patches[0][1], { conversation_id: "conv-1", window_expires_at: "2026-10-10T11:59:00.000Z" });
  assert.deepEqual(patches[1][1], { status: "active", node_id: "convite", waiting: "click", wake_at: "2026-10-09T13:00:00.000Z", error_code: null, error_message: null, finished_at: null });
  assert.deepEqual(chamadas.map((c) => c.metodo), ["followStatus", "sendMessage"]);
  assert.ok(chamadas[1].metodo === "sendMessage" && chamadas[1].args.conversationId === "conv-1" && chamadas[1].args.idempotencyKey === "run-1:convite:evt-9");
});

test("só o primeiro a reivindicar manda; run que não espera, ou espera outra coisa, é ignorado", async () => {
  const { amb, chamadas } = ambiente({ reivindica: false });
  assert.deepEqual(await retomarRun(run, { kind: "reply", attempt: "e" }, amb), { kind: "ignored", reason: "já retomado" });
  assert.equal(chamadas.length, 0);
  assert.equal((await retomarRun({ ...run, status: "done" }, { kind: "reply", attempt: "e" }, ambiente().amb)).kind, "ignored");
  assert.equal((await retomarRun(run, { kind: "click", attempt: "e" }, ambiente().amb)).kind, "ignored");
});

test("relógio num convite já clicado vira clique; fluxo fora do ar para o run; conta inativa falha", async () => {
  const noConvite: RunRow = { ...run, node_id: "convite", waiting: "click", conversation_id: "conv-1", clicked_at: "2026-10-09T11:30:00Z" };
  const a = ambiente();
  const d = await retomarRun(noConvite, { kind: "timer", attempt: "t" }, a.amb);
  assert.deepEqual(d, { kind: "resumed", tenantId: "loja-a", runId: "run-1", status: "done" });
  assert.equal(a.chamadas.length, 0, "clicou: nada a mandar, o convite não tem saída clicked");

  const b = ambiente({ fluxo: false });
  assert.deepEqual(await retomarRun(run, { kind: "reply", attempt: "e" }, b.amb), { kind: "ignored", reason: "fluxo fora do ar" });
  assert.equal(b.patches[0][1].status, "stopped");

  const c = ambiente({ conta: false });
  assert.deepEqual(await retomarRun(run, { kind: "reply", attempt: "e" }, c.amb), { kind: "resumed", tenantId: "loja-a", runId: "run-1", status: "failed" });
  assert.equal(c.patches[0][1].error_code, "account_inactive");
});

test("erro passageiro devolve a espera; no relógio remarca pra 1 minuto", async () => {
  const fora = new ZernioError(503, "api_error", "temporarily_unavailable", null, "x");
  const a = ambiente({ falhar: { sendMessage: fora } });
  assert.deepEqual(await retomarRun(run, { kind: "reply", attempt: "e", conversationId: "conv-1", sentAt: "2026-10-09T11:59:00Z" }, a.amb), { kind: "retry", reason: "temporarily_unavailable" });
  assert.deepEqual(a.patches.at(-1)?.[1], { waiting: "reply" });

  const noConvite: RunRow = { ...run, node_id: "convite", waiting: "click", conversation_id: "conv-1", wake_at: null };
  const b = ambiente({ falhar: { sendMessage: fora } });
  await retomarRun(noConvite, { kind: "timer", attempt: "t" }, b.amb);
  assert.deepEqual(b.patches.at(-1)?.[1], { waiting: "click", wake_at: "2026-10-09T12:01:00.000Z" });
});
```

`handle-event.test.ts` (inteiro; o `ambiente()` daqui é o molde dos outros testes):

```ts
// apps/web/src/lib/ig/engine/handle-event.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import type { EventoZernio } from "@/lib/ig/webhook/events";
import type { RunPatch, RunRow } from "@/lib/stores/ig-runs";
import { tratarEvento, type Ambiente } from "./handle-event";

const T0 = new Date("2026-10-09T12:00:00Z");
const comentario: EventoZernio = { id: "e1", event: "comment.received", comment: { id: "c-1", platformPostId: "post-1", platform: "instagram", text: "quero", author: { id: "u1", username: "igortoled0", isOwnAccount: false }, createdAt: "2026-10-09T11:59:58Z", isReply: false }, account: { accountId: "z1" }, timestamp: "2026-10-09T11:59:59Z" };
const direct: EventoZernio = { id: "e2", event: "message.received", message: { platformMessageId: "m-1", platform: "instagram", direction: "incoming", text: "quero", sender: { id: "u1", username: "igortoled0" }, sentAt: "2026-10-09T11:59:58Z" }, conversation: { id: "conv-1", participantId: "u1" }, account: { accountId: "z1" }, timestamp: "2026-10-09T11:59:59Z" };

const def = { ...RECIPES.comment_invite.build() };
const live = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
const dmDef = RECIPES.dm_invite.build();
const dmLive = { ...dmDef, nodes: dmDef.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
const segueDef = RECIPES.comment_follow_invite.build();
const segueLive = { ...segueDef, nodes: segueDef.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };

type Opts = { falhar?: Parameters<typeof createFakeTransport>[0]["falhar"]; conta?: Partial<{ status: string }> | null; liberada?: boolean; recente?: boolean; iniciados?: number; existente?: RunRow | null; esperando?: RunRow | null; porId?: RunRow | null; segue?: boolean | null };

export function ambiente(opts: Opts = {}) {
  const { transport, chamadas } = createFakeTransport({ falhar: opts.falhar, segue: opts.segue });
  const criados: unknown[] = [];
  const patches: Array<[string, RunPatch]> = [];
  const estados: Array<[string, string, string | null]> = [];
  let proximoId = 1;
  const amb: Ambiente = {
    transport,
    now: () => T0,
    novoRef: () => "ref-fixo-12345",
    contaPorIdDaZernio: async (id) => (opts.conta === null || id !== "z1" ? null : ({ id: "a1", tenant_id: "loja-a", username: "vireimoda", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "t", ...opts.conta } as never)),
    mudarEstadoDaConta: async (t, s, e) => { estados.push([t, s, e]); },
    lojaLiberada: async () => opts.liberada ?? true,
    fluxosNoAr: async () => [{ id: "f-c", version: 3, published: live }, { id: "f-d", version: 1, published: dmLive }, { id: "f-s", version: 1, published: segueLive }],
    contaDaLoja: async () => ({ id: "a1", username: "vireimoda", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "t" }),
    fluxoPublicado: async (_t, flowId) => (flowId === "f-s" ? { def: segueLive, version: 1 } : flowId === "f-c" ? { def: live, version: 3 } : null),
    segue: async () => opts.segue === true || opts.segue === undefined,
    runs: {
      criar: async (tenantId, novo) => {
        criados.push({ tenantId, ...novo });
        if (opts.existente !== undefined) return null;
        return { id: `run-${proximoId++}`, tenant_id: tenantId, ig_account_id: novo.igAccountId, flow_id: novo.flowId, flow_version: novo.flowVersion, source_kind: novo.sourceKind, source_id: novo.sourceId, ig_user_id: novo.igUserId, username: novo.username, matched_keyword: novo.matchedKeyword, ref: novo.ref, status: "queued", node_id: null, waiting: null, wake_at: null, window_expires_at: novo.windowExpiresAt, clicked_at: null, conversation_id: null, error_code: null, error_message: null, started_at: T0.toISOString(), updated_at: T0.toISOString(), finished_at: null };
      },
      porOrigem: async () => opts.existente ?? null,
      porId: async () => opts.porId ?? null,
      porRef: async () => null,
      esperandoResposta: async () => opts.esperando ?? null,
      atualizar: async (_t, id, patch) => { patches.push([id, patch]); },
      passo: async () => {},
      iniciadosDesde: async () => opts.iniciados ?? 0,
      entradaRecente: async () => opts.recente ?? false,
      reivindicar: async () => true,
      marcarClique: async () => true,
      vencidos: async () => [],
    },
    link: async (_t, slug, ref) => `https://app/r/${slug}?ig=${ref}`,
  };
  return { amb, chamadas, criados, patches, estados };
}

const esperando: RunRow = { id: "run-velho", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f-s", flow_version: 1, source_kind: "comment", source_id: "c-0", ig_user_id: "u1", username: "igortoled0", matched_keyword: "quero", ref: "ref-velho-1234", status: "active", node_id: "pede", waiting: "reply", wake_at: "2026-10-10T11:00:00Z", window_expires_at: "2026-10-16T12:00:00Z", clicked_at: null, conversation_id: null, error_code: null, error_message: null, started_at: "2026-10-09T11:00:00Z", updated_at: "2026-10-09T11:00:00Z", finished_at: null };

test("comentário com a palavra vira run, resposta pública + privada com o link, e termina", async () => {
  const { amb, chamadas, criados, patches } = ambiente();
  const d = await tratarEvento(comentario, amb);
  assert.deepEqual(d, { kind: "handled", tenantId: "loja-a", runId: "run-1", status: "done" });
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply", "privateReply"]);
  const novo = criados[0] as Record<string, unknown>;
  assert.equal(novo.flowId, "f-c");
  assert.equal(novo.matchedKeyword, "quero");
  assert.equal(novo.windowExpiresAt, "2026-10-16T11:59:58.000Z");
  assert.deepEqual(patches[0][1], { status: "done", node_id: "convite", waiting: null, wake_at: null, error_code: null, error_message: null, finished_at: T0.toISOString() });
});

test("direct de quem tem run esperando resposta retoma o run em vez de abrir outro, mesmo com a palavra", async () => {
  const { amb, chamadas, criados } = ambiente({ esperando, segue: true });
  const d = await tratarEvento(direct, amb);
  assert.deepEqual(d, { kind: "resumed", tenantId: "loja-a", runId: "run-velho", status: "active" });
  assert.equal(criados.length, 0);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["followStatus", "sendMessage"]);
});

test("toque no botão chega como postback ig:<run>:<bloco> e retoma aquele run", async () => {
  const postback: EventoZernio = { ...direct, id: "e3", message: { ...direct.message, platformMessageId: "m-2", text: "Quero o link" }, metadata: { postbackPayload: "ig:run-velho:pede" } };
  const { amb, criados } = ambiente({ porId: esperando, segue: true });
  const d = await tratarEvento(postback, amb);
  assert.deepEqual(d, { kind: "resumed", tenantId: "loja-a", runId: "run-velho", status: "active" });
  assert.equal(criados.length, 0);
  // Postback de outra pessoa (sender diferente do run) não retoma nada e não abre run.
  const outra: EventoZernio = { ...postback, id: "e4", message: { ...postback.message, sender: { id: "u2" } } };
  assert.equal((await tratarEvento(outra, ambiente({ porId: esperando }).amb)).kind, "ignored");
});

test("direct sem run esperando segue o caminho do gatilho; story e direct comum viram run de direct", async () => {
  const { amb, chamadas, criados } = ambiente();
  await tratarEvento(direct, amb);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["sendMessage"]);
  assert.equal((criados[0] as { sourceKind: string }).sourceKind, "dm");
});

test("ignora: conta desconhecida, conta inativa, loja sem liberação, comentário da própria conta, resposta a comentário, sem palavra, direct de saída", async () => {
  assert.equal((await tratarEvento(comentario, ambiente({ conta: null }).amb)).kind, "ignored");
  assert.equal((await tratarEvento(comentario, ambiente({ conta: { status: "expired" } }).amb)).kind, "ignored");
  assert.equal((await tratarEvento(comentario, ambiente({ liberada: false }).amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, author: { ...comentario.comment.author, isOwnAccount: true } } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, isReply: true } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, text: "lindo" } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...direct, message: { ...direct.message, direction: "outgoing" } }, ambiente().amb)).kind, "ignored");
});

test("proteções: entrada recente e teto da conta não criam run; reenvio em andamento pede retry", async () => {
  assert.deepEqual(await tratarEvento(comentario, ambiente({ recente: true }).amb), { kind: "ignored", reason: "24h" });
  assert.deepEqual(await tratarEvento(comentario, ambiente({ iniciados: 700 }).amb), { kind: "ignored", reason: "teto" });
  const naFila: RunRow = { ...esperando, status: "queued", node_id: null, waiting: null, flow_id: "f-c", started_at: "2026-10-09T11:59:30Z" };
  assert.deepEqual(await tratarEvento(comentario, ambiente({ existente: naFila }).amb), { kind: "retry", reason: "em andamento" });
});

test("erro passageiro da Zernio no início pede reenvio; eventos de conta mudam o estado", async () => {
  const fora = new ZernioError(503, "api_error", "temporarily_unavailable", null, "x");
  const a = ambiente({ falhar: { privateReply: fora } });
  assert.deepEqual(await tratarEvento(comentario, a.amb), { kind: "retry", reason: "temporarily_unavailable" });
  const b = ambiente();
  await tratarEvento({ id: "e9", event: "account.disconnected", account: { accountId: "z1", reason: "token" }, timestamp: "t" }, b.amb);
  await tratarEvento({ id: "e10", event: "account.connected", account: { accountId: "z1" }, timestamp: "t" }, b.amb);
  assert.deepEqual(b.estados, [["loja-a", "expired", "token"], ["loja-a", "active", null]]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/resume.test.ts src/lib/ig/engine/handle-event.test.ts`
Expected: FAIL (`./resume` não existe; `Ambiente` sem os membros novos).

- [ ] **Step 3: `resume.ts`**

```ts
// apps/web/src/lib/ig/engine/resume.ts
import { ZernioError } from "@/lib/ig/transport/types";
import type { RunRow } from "@/lib/stores/ig-runs";
import { advance, type Evento, type RunState } from "./advance";
import type { Ambiente, Desfecho } from "./handle-event";

export type Retomada = {
  kind: Exclude<Evento, "start">;
  /** Identifica a tentativa na chave de idempotência: id do evento da Zernio, hora do clique ou fatia do relógio. */
  attempt: string;
  /** Só na resposta: a conversa e a hora da mensagem da pessoa (abre 24 h). */
  conversationId?: string;
  sentAt?: string;
};

const UM_DIA_MS = 24 * 60 * 60_000;
const NOVA_TENTATIVA_MS = 60_000;

/**
 * Acorda um run parado (`active`): reivindica no banco (só o primeiro manda),
 * grava a conversa quando é resposta, executa a partir do bloco parado e guarda
 * o resultado. Erro passageiro devolve a espera para a próxima tentativa.
 */
export async function retomarRun(run: RunRow, r: Retomada, amb: Ambiente): Promise<Desfecho> {
  const tenantId = run.tenant_id;
  if (run.status !== "active" || !run.node_id || !run.waiting) return { kind: "ignored", reason: "não está esperando" };
  // Relógio num convite que a pessoa já clicou: é um clique, não "não clicou".
  const kind: Retomada["kind"] = r.kind === "timer" && run.waiting === "click" && run.clicked_at ? "click" : r.kind;
  const esperado = kind === "timer" ? run.waiting : kind === "reply" ? "reply" : "click";
  if (run.waiting !== esperado) return { kind: "ignored", reason: "esperava outra coisa" };
  if (!(await amb.runs.reivindicar(tenantId, run.id, run.waiting))) return { kind: "ignored", reason: "já retomado" };

  const agora = amb.now();
  const conta = await amb.contaDaLoja(tenantId);
  if (!conta || conta.status !== "active" || !conta.provider_account_id) {
    await amb.runs.atualizar(tenantId, run.id, { status: "failed", error_code: "account_inactive", error_message: null, finished_at: agora.toISOString() });
    return { kind: "resumed", tenantId, runId: run.id, status: "failed" };
  }
  const fluxo = await amb.fluxoPublicado(tenantId, run.flow_id);
  if (!fluxo) {
    await amb.runs.atualizar(tenantId, run.id, { status: "stopped", finished_at: agora.toISOString() });
    return { kind: "ignored", reason: "fluxo fora do ar" };
  }

  let conversationId = run.conversation_id;
  let windowExpiresAt = run.window_expires_at ?? agora.toISOString();
  if (kind === "reply" && r.conversationId) {
    conversationId = r.conversationId;
    const base = r.sentAt ? Date.parse(r.sentAt) : NaN;
    windowExpiresAt = new Date((Number.isFinite(base) ? base : agora.getTime()) + UM_DIA_MS).toISOString();
    await amb.runs.atualizar(tenantId, run.id, { conversation_id: conversationId, window_expires_at: windowExpiresAt });
  }

  const providerAccountId = conta.provider_account_id;
  const estado: RunState = {
    id: run.id,
    flowId: run.flow_id,
    ref: run.ref,
    sourceKind: run.source_kind,
    providerAccountId,
    igUserId: run.ig_user_id,
    comment: null,
    conversationId,
    windowExpiresAt,
    // Um run só para depois de mandar ao menos um direct: o próximo vai na conversa.
    directsSent: 1,
    nodeId: run.node_id,
    attempt: r.attempt,
  };
  const runId = run.id;
  const flowId = run.flow_id;
  try {
    const res = await advance(
      fluxo.def,
      estado,
      {
        transport: amb.transport,
        now: amb.now,
        link: (slug, ref) => amb.link(tenantId, slug, ref),
        step: (nodeId, out) => amb.runs.passo(tenantId, { flowId, runId, nodeId, out }),
        follows: (igUserId) => amb.segue(providerAccountId, igUserId),
      },
      kind,
    );
    await amb.runs.atualizar(tenantId, runId, {
      status: res.status,
      node_id: res.nodeId,
      waiting: res.waiting,
      wake_at: res.wakeAt,
      error_code: res.errorCode,
      error_message: res.errorMessage,
      finished_at: res.status === "active" ? null : agora.toISOString(),
    });
    return { kind: "resumed", tenantId, runId, status: res.status };
  } catch (e) {
    if (e instanceof ZernioError && e.transient) {
      // Devolve a espera. Resposta: a Zernio reenvia o evento (500). Relógio: a hora foi desarmada, remarca em 1 min.
      await amb.runs.atualizar(tenantId, runId, kind === "timer" ? { waiting: run.waiting, wake_at: new Date(agora.getTime() + NOVA_TENTATIVA_MS).toISOString() } : { waiting: run.waiting });
      return { kind: "retry", reason: e.code };
    }
    throw e;
  }
}
```

- [ ] **Step 4: `handle-event.ts` (inteiro)**

```ts
// apps/web/src/lib/ig/engine/handle-event.ts
import type { FlowDef, FlowOut } from "@/lib/ig/flow/types";
import { TETO_RUNS_POR_HORA } from "@/lib/ig/limites";
import { ZernioError, type Transport } from "@/lib/ig/transport/types";
import type { ComentarioRecebido, EventoZernio, MensagemRecebida } from "@/lib/ig/webhook/events";
import type { AccountStatus, IgAccount, IgAccountComLoja } from "@/lib/stores/ig-accounts";
import type { NovoRun, RunPatch, RunRow, SourceKind } from "@/lib/stores/ig-runs";
import { advance, type RunState } from "./advance";
import { retomarRun } from "./resume";
import { escolherFluxo, type FluxoNoAr, type Origem } from "./select-flow";

/** Tudo que o tratamento toca, injetado: a rota liga nas stores de verdade; o teste, em memória. */
export type Ambiente = {
  transport: Transport;
  now: () => Date;
  novoRef: () => string;
  contaPorIdDaZernio: (providerAccountId: string) => Promise<IgAccountComLoja | null>;
  mudarEstadoDaConta: (tenantId: string, status: AccountStatus, lastError: string | null) => Promise<void>;
  lojaLiberada: (tenantId: string) => Promise<boolean>;
  fluxosNoAr: (tenantId: string) => Promise<FluxoNoAr[]>;
  contaDaLoja: (tenantId: string) => Promise<IgAccount | null>;
  /** O grafo publicado do fluxo, se ele está no ar. */
  fluxoPublicado: (tenantId: string, flowId: string) => Promise<{ def: FlowDef; version: number } | null>;
  /** "Segue a loja?" na Zernio (`true` só quando ela confirma). */
  segue: (providerAccountId: string, igUserId: string) => Promise<boolean>;
  runs: {
    criar: (tenantId: string, novo: NovoRun) => Promise<RunRow | null>;
    porOrigem: (tenantId: string, sourceId: string) => Promise<RunRow | null>;
    porId: (tenantId: string, id: string) => Promise<RunRow | null>;
    porRef: (tenantId: string, ref: string) => Promise<RunRow | null>;
    esperandoResposta: (tenantId: string, igUserId: string) => Promise<RunRow | null>;
    atualizar: (tenantId: string, id: string, patch: RunPatch) => Promise<void>;
    passo: (tenantId: string, input: { flowId: string; runId: string; nodeId: string; out: FlowOut }) => Promise<void>;
    iniciadosDesde: (tenantId: string, igAccountId: string, sinceIso: string) => Promise<number>;
    entradaRecente: (tenantId: string, flowId: string, igUserId: string, sinceIso: string) => Promise<boolean>;
    reivindicar: (tenantId: string, id: string, waiting: "reply" | "click") => Promise<boolean>;
    marcarClique: (tenantId: string, id: string, atIso: string) => Promise<boolean>;
    vencidos: (tenantId: string, nowIso: string, limit: number) => Promise<RunRow[]>;
  };
  link: (tenantId: string, slug: string, ref: string) => Promise<string>;
};

export type Desfecho =
  | { kind: "ignored"; reason: string }
  | { kind: "account"; tenantId: string }
  | { kind: "retry"; reason: string }
  | { kind: "handled"; tenantId: string; runId: string; status: "done" | "active" | "failed" }
  | { kind: "resumed"; tenantId: string; runId: string; status: "done" | "active" | "failed" };

const UMA_HORA_MS = 60 * 60_000;
const UM_DIA_MS = 24 * UMA_HORA_MS;
const SETE_DIAS_MS = 7 * UM_DIA_MS;
/** Run na fila há mais que isto pode ser reexecutado por um reenvio (spec §8.3). */
const RETOMADA_MS = 2 * 60_000;

type Entrada = {
  origem: Origem;
  sourceKind: SourceKind;
  sourceId: string;
  igUserId: string;
  username: string | null;
  comment: RunState["comment"];
  conversationId: string | null;
  windowExpiresAt: string;
};

const iso = (ms: number) => new Date(ms).toISOString();

/** Data da Zernio que não parseia vira "agora": nunca uma janela que não fecha. */
const ou = (texto: string, agoraMs: number) => {
  const ms = Date.parse(texto);
  return Number.isFinite(ms) ? ms : agoraMs;
};

function deComentario(ev: ComentarioRecebido, agoraMs: number): Entrada | null {
  const c = ev.comment;
  if (c.platform !== "instagram" || c.author.isOwnAccount || c.isReply) return null;
  return {
    origem: { kind: "comment", postId: c.platformPostId, text: c.text },
    sourceKind: "comment",
    sourceId: c.id,
    igUserId: c.author.id,
    username: c.author.username ?? null,
    comment: { platformPostId: c.platformPostId, commentId: c.id },
    conversationId: null,
    windowExpiresAt: iso(ou(c.createdAt, agoraMs) + SETE_DIAS_MS),
  };
}

function deMensagem(ev: MensagemRecebida, agoraMs: number): Entrada | null {
  const m = ev.message;
  if (m.platform !== "instagram" || m.direction !== "incoming" || !m.text) return null;
  const story = ev.metadata?.storyReply !== undefined;
  return {
    origem: story ? { kind: "story", text: m.text } : { kind: "dm", text: m.text },
    sourceKind: story ? "story" : "dm",
    sourceId: m.platformMessageId,
    igUserId: m.sender.id,
    username: m.sender.username ?? null,
    comment: null,
    conversationId: ev.conversation.id,
    windowExpiresAt: iso(ou(m.sentAt, agoraMs) + UM_DIA_MS),
  };
}

/** `ig:<runId>:<nodeId>` → runId; qualquer outra coisa, null. */
function runDoPostback(payload: string | undefined): string | null {
  if (!payload) return null;
  const [prefixo, runId] = payload.split(":");
  return prefixo === "ig" && runId ? runId : null;
}

/**
 * Antes do gatilho: a mensagem de quem tem run parado esperando resposta (ou o
 * toque no botão de um run) retoma o run, mesmo que o texto case uma palavra.
 */
async function tentarResposta(ev: MensagemRecebida, tenantId: string, amb: Ambiente): Promise<Desfecho | null> {
  if (ev.message.platform !== "instagram" || ev.message.direction !== "incoming") return null;
  const igUserId = ev.message.sender.id;
  const runId = runDoPostback(ev.metadata?.postbackPayload);
  const run = runId ? await amb.runs.porId(tenantId, runId) : await amb.runs.esperandoResposta(tenantId, igUserId);
  if (!run || run.ig_user_id !== igUserId) return runId ? { kind: "ignored", reason: "postback sem run" } : null;
  if (run.status !== "active" || run.waiting !== "reply") return runId ? { kind: "ignored", reason: "run não espera resposta" } : null;
  return retomarRun(run, { kind: "reply", attempt: ev.id, conversationId: ev.conversation.id, sentAt: ev.message.sentAt }, amb);
}

/**
 * Traduz o evento, acha a loja, trata resposta/postback, senão escolhe o fluxo,
 * aplica as proteções, grava o run (idempotente por source_id) e executa o
 * primeiro passo na mesma chamada. Nada que não casa deixa rastro no banco.
 */
export async function tratarEvento(ev: EventoZernio, amb: Ambiente): Promise<Desfecho> {
  const conta = await amb.contaPorIdDaZernio(ev.account.accountId);
  if (!conta) return { kind: "ignored", reason: "conta desconhecida" };
  const tenantId = conta.tenant_id;

  if (ev.event === "account.connected") {
    await amb.mudarEstadoDaConta(tenantId, "active", null);
    return { kind: "account", tenantId };
  }
  if (ev.event === "account.disconnected") {
    await amb.mudarEstadoDaConta(tenantId, "expired", ev.account.reason ?? null);
    return { kind: "account", tenantId };
  }
  if (conta.status !== "active") return { kind: "ignored", reason: "conta inativa" };
  if (!(await amb.lojaLiberada(tenantId))) return { kind: "ignored", reason: "loja sem liberação" };

  if (ev.event === "message.received") {
    const resposta = await tentarResposta(ev, tenantId, amb);
    if (resposta) return resposta;
  }

  const agora = amb.now();
  const entrada = ev.event === "comment.received" ? deComentario(ev, agora.getTime()) : deMensagem(ev, agora.getTime());
  if (!entrada) return { kind: "ignored", reason: "evento sem gatilho" };

  const escolha = escolherFluxo(await amb.fluxosNoAr(tenantId), entrada.origem);
  if (!escolha) return { kind: "ignored", reason: "sem fluxo" };

  // Reenvio primeiro: o run da 1ª tentativa casaria a trava de 24 h e o reenvio seria descartado.
  const existente = await amb.runs.porOrigem(tenantId, entrada.sourceId);
  let run: RunRow | null;
  if (existente) {
    if (existente.status !== "queued") return { kind: "ignored", reason: "duplicado" };
    // Na fila há pouco: a 1ª tentativa pode estar rodando. 500 faz a Zernio tentar de novo depois.
    if (agora.getTime() - Date.parse(existente.started_at) <= RETOMADA_MS) return { kind: "retry", reason: "em andamento" };
    // O fluxo do run saiu do ar (ou outro ganhou a palavra) no meio: não executa um grafo que não é o dele.
    if (existente.flow_id !== escolha.flowId) {
      await amb.runs.atualizar(tenantId, existente.id, { status: "stopped", finished_at: agora.toISOString() });
      return { kind: "ignored", reason: "fluxo mudou" };
    }
    run = existente;
  } else {
    if (await amb.runs.entradaRecente(tenantId, escolha.flowId, entrada.igUserId, iso(agora.getTime() - UM_DIA_MS))) return { kind: "ignored", reason: "24h" };
    if ((await amb.runs.iniciadosDesde(tenantId, conta.id, iso(agora.getTime() - UMA_HORA_MS))) >= TETO_RUNS_POR_HORA) return { kind: "ignored", reason: "teto" };
    run = await amb.runs.criar(tenantId, {
      igAccountId: conta.id,
      flowId: escolha.flowId,
      flowVersion: escolha.version,
      sourceKind: entrada.sourceKind,
      sourceId: entrada.sourceId,
      igUserId: entrada.igUserId,
      username: entrada.username,
      matchedKeyword: escolha.keyword,
      ref: amb.novoRef(),
      windowExpiresAt: entrada.windowExpiresAt,
    });
    // Outra requisição criou o mesmo run agora: o reenvio cai no ramo de cima.
    if (!run) return { kind: "retry", reason: "corrida" };
  }

  const estado: RunState = {
    id: run.id,
    flowId: run.flow_id,
    ref: run.ref,
    sourceKind: run.source_kind,
    providerAccountId: ev.account.accountId,
    igUserId: entrada.igUserId,
    comment: entrada.comment,
    conversationId: entrada.conversationId,
    windowExpiresAt: run.window_expires_at ?? entrada.windowExpiresAt,
    directsSent: 0,
    nodeId: null,
    attempt: "",
  };
  const runId = run.id;
  const flowId = run.flow_id;
  try {
    const r = await advance(escolha.def, estado, {
      transport: amb.transport,
      now: amb.now,
      link: (slug, ref) => amb.link(tenantId, slug, ref),
      step: (nodeId, out) => amb.runs.passo(tenantId, { flowId, runId, nodeId, out }),
      follows: (igUserId) => amb.segue(ev.account.accountId, igUserId),
    });
    await amb.runs.atualizar(tenantId, runId, {
      status: r.status,
      node_id: r.nodeId,
      waiting: r.waiting,
      wake_at: r.wakeAt,
      error_code: r.errorCode,
      error_message: r.errorMessage,
      // Quem veio por direct/story já tem conversa: guarda, que o lembrete sai por ela.
      ...(entrada.conversationId ? { conversation_id: entrada.conversationId } : {}),
      finished_at: r.status === "active" ? null : agora.toISOString(),
    });
    return { kind: "handled", tenantId, runId, status: r.status };
  } catch (e) {
    // O run fica `queued`: o reenvio da Zernio o retoma depois de 2 min.
    if (e instanceof ZernioError && e.transient) return { kind: "retry", reason: e.code };
    throw e;
  }
}
```

O teste do comentário espera o patch **sem** `conversation_id` (quem veio por comentário não tem); o do direct ganha a chave. Se o primeiro teste falhar por chave a mais, confira a ordem das chaves do `deepEqual`: ele compara conteúdo, não ordem.

- [ ] **Step 5: `ambiente.ts` e a rota do webhook**

```ts
// apps/web/src/lib/ig/engine/ambiente.ts
import "server-only";

import { zernioApiKey } from "@/lib/ig/segredos";
import { ZernioError } from "@/lib/ig/transport/types";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { getAccount, getAccountByProviderId, setAccountStatus } from "@/lib/stores/ig-accounts";
import { getFlow, listLiveFlows } from "@/lib/stores/ig-flows";
import { claimDueRuns, claimWaiting, countRunsStartedSince, createRun, findRunWaitingReply, getRunById, getRunByRef, getRunBySourceId, hasRecentRun, markClicked, recordStep, updateRun } from "@/lib/stores/ig-runs";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import type { Ambiente } from "./handle-event";
import { linkDoConvite, novoRef } from "./link";

/** O `Ambiente` de verdade: webhook, clique no /r e relógio usam o mesmo. */
export function ambienteDeProducao(): Ambiente {
  const transport = createZernioTransport({ apiKey: zernioApiKey() });
  return {
    transport,
    now: () => new Date(),
    novoRef,
    contaPorIdDaZernio: getAccountByProviderId,
    mudarEstadoDaConta: setAccountStatus,
    lojaLiberada: async (tenantId) => (await getTenantSettings(tenantId)).instagramEnabled,
    fluxosNoAr: listLiveFlows,
    contaDaLoja: getAccount,
    fluxoPublicado: async (tenantId, flowId) => {
      const f = await getFlow(tenantId, flowId);
      return f && f.status === "live" && f.published ? { def: f.published, version: f.version } : null;
    },
    segue: async (providerAccountId, igUserId) => {
      try {
        return (await transport.followStatus(providerAccountId, igUserId)) === true;
      } catch (e) {
        // Passageiro estoura pra quem chama devolver a espera; o resto é "não segue".
        if (e instanceof ZernioError && e.transient) throw e;
        return false;
      }
    },
    runs: {
      criar: createRun,
      porOrigem: getRunBySourceId,
      porId: getRunById,
      porRef: getRunByRef,
      esperandoResposta: findRunWaitingReply,
      atualizar: updateRun,
      passo: recordStep,
      iniciadosDesde: countRunsStartedSince,
      entradaRecente: hasRecentRun,
      reivindicar: claimWaiting,
      marcarClique: markClicked,
      vencidos: claimDueRuns,
    },
    link: linkDoConvite,
  };
}
```

Em `webhook/route.ts`: apague a função `ambiente()` e os imports que só ela usava (`createZernioTransport`, `zernioApiKey`, `linkDoConvite`, `novoRef`, `getAccountByProviderId`, `setAccountStatus`, `listLiveFlows`, `getTenantSettings`, e de `ig-runs` tudo menos `purgeOldRuns`); importe `import { ambienteDeProducao } from "@/lib/ig/engine/ambiente";` e troque `tratarEvento(ev, ambiente())` por `tratarEvento(ev, ambienteDeProducao())`. Logo abaixo de `if (desfecho.kind === "handled") {`, trate também a retomada:

```ts
  if (desfecho.kind === "resumed") return Response.json({ runId: desfecho.runId, status: desfecho.status, resumed: true });
```

(antes do bloco `handled`, para o `after(purgeOldRuns)` continuar só no atendimento novo).

- [ ] **Step 6: Run tests, type-check**

Run: `npm --workspace apps/web test` e os dois `tsc`.
Expected: PASS; tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/ig/engine/handle-event.ts apps/web/src/lib/ig/engine/handle-event.test.ts apps/web/src/lib/ig/engine/resume.ts apps/web/src/lib/ig/engine/resume.test.ts apps/web/src/lib/ig/engine/ambiente.ts apps/web/src/app/api/ig/webhook/route.ts
git commit -m "feat(ig): resume runs on reply and postback; production environment shared by webhook, click and clock"
```

### Task 6: os blocos da fase 3 passam a publicar

**Files:**
- Delete: `apps/web/src/lib/ig/flow/fase.ts`, `apps/web/src/lib/ig/flow/fase.test.ts`
- Modify: `apps/web/src/lib/ig/flow/validate.ts` (`IssueCode` e `GRUPOS`)
- Modify: `apps/web/src/app/api/ig/flows/[id]/publish/route.ts`
- Modify: `apps/web/src/components/painel/instagram/editor.tsx`
- Modify: `apps/web/src/lib/ig/transport/erros.ts`

- [ ] **Step 1: Apagar o portão**

```bash
git rm apps/web/src/lib/ig/flow/fase.ts apps/web/src/lib/ig/flow/fase.test.ts
```

Em `validate.ts`: tire `| "fase_seguinte"` de `IssueCode` e `"fase_seguinte"` da lista `codes` do grupo `regras`. Em `publish/route.ts`: tire o `import { foraDaFase }` e o `...foraDaFase(flow.draft)` (o array vira só `validateFlow(...)`). Em `editor.tsx`: tire o import e o spread em `issuesDoCliente` (volta a ser `validateFlow(...)` direto). Em `erros.ts`, troque a linha de `unsupported_node` por:

```ts
  unexpected_event: "Chegou uma resposta que este passo não esperava.",
```

- [ ] **Step 2: Run the gate**

Run: `npm --workspace apps/web test`, os dois `tsc`, `lint`. `grep -rn "fase_seguinte\|foraDaFase" apps/web/src` tem que voltar vazio.
Expected: verde. O e2e da fase 1 (`painel-instagram.spec.ts`) continua: a receita com "segue" agora só mostra "Conecte o Instagram pra publicar." na loja de QA (sem conta).

- [ ] **Step 3: Commit**

```bash
git add -A apps/web/src/lib/ig/flow apps/web/src/app/api/ig/flows apps/web/src/components/painel/instagram/editor.tsx apps/web/src/lib/ig/transport/erros.ts
git commit -m "feat(ig): waits, follow check and reminders can be published"
```

### Gate K e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] `git push -u origin feat/ig-fase3-motor` e PR:

```
PR K da fase 3 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-08-instagram-fluxos-fase3.md, Tasks 3–6).

- Transporte: `followStatus` (refresh=true) e botões postback no direct da conversa.
- Motor retomável: `advance` recebe o evento (`start`/`reply`/`click`/`timer`), parte do bloco parado, resolve "segue a loja?", manda botão como postback, devolve a hora de acordar; chave de idempotência leva a tentativa.
- `retomarRun`: reivindica no banco, grava conversa e janela de 24 h na resposta, trata relógio em convite já clicado, devolve a espera no erro passageiro.
- Webhook: resposta e toque no botão (`ig:<run>:<bloco>`) retomam o run antes do gatilho. `ambienteDeProducao` compartilhado.
- Espera, condição e lembrete publicam (portão `fase_seguinte` removido).

Depende do PR J (coluna `conversation_id`). O lembrete e o clique só acordam o run no PR L.
```

- [ ] **Prova em produção (depois do deploy):** na VIREI MODA, fluxo "Comentou, segue e entra no grupo" com "quero" e a campanha; publicar. Com a `@igortoled0` **sem seguir** a `@vireimoda`: comentar "quero" → chega o direct pedindo resposta; responder "ok" → chega "pra receber o link, segue a loja…"; seguir e responder de novo → chega o convite com o link. Conferir:

```sql
select status, node_id, waiting, wake_at, conversation_id is not null as tem_conversa, window_expires_at from public.ig_runs where tenant_id = '47c280cb-702a-445d-997e-8eea2f8fd173' order by started_at desc limit 1;
select node_id, "out", occurred_at from public.ig_run_steps where tenant_id = '47c280cb-702a-445d-997e-8eea2f8fd173' order by occurred_at desc limit 6;
```

Esperado: passos `gatilho/next`, `pede/replied`, `segue/no`, `pede_seguir/replied`, `segue/yes`; run `active`, `waiting = click`, `wake_at` = +60 min. Quadro: `select public.move_card('ig-resposta-e-segue', 'no_ar_verificado', 'Resposta retoma o run, segue a loja? conferido na Zernio, convite enviado.', '<data/hora + os passos>');` e `update public.board_features set blocker = null where key = 'ig-resposta-e-segue';`.

- [ ] Mergear e abrir a branch do PR L a partir de `origin/main`.

---

## PR L — clique atribuído e o relógio

Branch: `feat/ig-fase3-clique-relogio`. Entrega: quem clica no link do convite tem o clique gravado no run (e o desvio "clicou" segue, se existir); o worker bate `POST /api/ig/tick` a cada minuto e o app acorda os runs vencidos: espera que venceu toma `timeout`, convite sem clique toma `not_clicked` e manda o lembrete.

### Task 7: clique no `/r/<slug>?ig=<ref>`

**Files:**
- Create: `apps/web/src/lib/ig/engine/click.ts`
- Create: `apps/web/src/lib/ig/engine/click.test.ts`
- Modify: `apps/web/src/lib/links/short-link-click.ts` (depois do bloco `if (human) { … allSettled … }`, e o `sourceUrl` da CAPI)

**Interfaces:**
- Consumes: `Ambiente`, `Desfecho` (Task 5), `retomarRun`, `ambienteDeProducao`.
- Produces: `REF_RE`, `urlSemRef(url: URL): string`, `tratarClique(tenantId, ref: string | null, amb) → Desfecho`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/engine/click.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import type { RunPatch, RunRow } from "@/lib/stores/ig-runs";
import { tratarClique, urlSemRef } from "./click";
import type { Ambiente } from "./handle-event";

const T0 = new Date("2026-10-09T12:00:00Z");
const def = RECIPES.dm_invite.build();
const live = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip", remindAfterMinutes: 60 } : n)) };
const run: RunRow = { id: "run-1", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f1", flow_version: 1, source_kind: "dm", source_id: "m1", ig_user_id: "u1", username: null, matched_keyword: "quero", ref: "AbCdEfGhIjKl", status: "active", node_id: "convite", waiting: "click", wake_at: "2026-10-09T13:00:00Z", window_expires_at: "2026-10-10T12:00:00Z", clicked_at: null, conversation_id: "conv-1", error_code: null, error_message: null, started_at: "2026-10-09T11:00:00Z", updated_at: "2026-10-09T11:00:00Z", finished_at: null };

function ambiente(opts: { run?: RunRow | null; primeiro?: boolean } = {}) {
  const { transport, chamadas } = createFakeTransport();
  const patches: Array<[string, RunPatch]> = [];
  const amb: Ambiente = {
    transport,
    now: () => T0,
    novoRef: () => "x",
    contaPorIdDaZernio: async () => null,
    mudarEstadoDaConta: async () => {},
    lojaLiberada: async () => true,
    fluxosNoAr: async () => [],
    contaDaLoja: async () => ({ id: "a1", username: "loja", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "t" }),
    fluxoPublicado: async () => ({ def: live, version: 1 }),
    segue: async () => true,
    runs: {
      criar: async () => null, porOrigem: async () => null, porId: async () => null,
      porRef: async () => (opts.run === undefined ? run : opts.run),
      esperandoResposta: async () => null,
      atualizar: async (_t, id, patch) => { patches.push([id, patch]); },
      passo: async () => {}, iniciadosDesde: async () => 0, entradaRecente: async () => false,
      reivindicar: async () => true,
      marcarClique: async () => opts.primeiro ?? true,
      vencidos: async () => [],
    },
    link: async (_t, slug, ref) => `https://app/r/${slug}?ig=${ref}`,
  };
  return { amb, chamadas, patches };
}

test("o primeiro clique de quem espera o clique segue 'clicked' (sem saída: termina) e nada é enviado", async () => {
  const { amb, chamadas, patches } = ambiente();
  const d = await tratarClique("loja-a", "AbCdEfGhIjKl", amb);
  assert.deepEqual(d, { kind: "resumed", tenantId: "loja-a", runId: "run-1", status: "done" });
  assert.equal(chamadas.length, 0);
  assert.equal(patches.at(-1)?.[1].status, "done");
});

test("ref inválido, desconhecido ou já clicado: ignorado; run que não espera clique só grava o clique", async () => {
  assert.equal((await tratarClique("loja-a", null, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarClique("loja-a", "curto", ambiente().amb)).kind, "ignored");
  assert.equal((await tratarClique("loja-a", "AbCdEfGhIjKl", ambiente({ run: null }).amb)).kind, "ignored");
  assert.deepEqual(await tratarClique("loja-a", "AbCdEfGhIjKl", ambiente({ primeiro: false }).amb), { kind: "ignored", reason: "já clicou" });
  const feito = ambiente({ run: { ...run, status: "done", waiting: null } });
  assert.deepEqual(await tratarClique("loja-a", "AbCdEfGhIjKl", feito.amb), { kind: "ignored", reason: "clique gravado" });
  assert.equal(feito.patches.length, 0, "o clique foi gravado por marcarClique, não por patch");
});

test("a URL mandada à Meta sai sem o ref", () => {
  assert.equal(urlSemRef(new URL("https://app.girumo.com.br/r/vip?ig=AbCdEfGhIjKl&fbclid=xyz")), "https://app.girumo.com.br/r/vip?fbclid=xyz");
  assert.equal(urlSemRef(new URL("https://loja.com/vip")), "https://loja.com/vip");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/click.test.ts`
Expected: FAIL (módulo `./click` não existe).

- [ ] **Step 3: `click.ts`**

```ts
// apps/web/src/lib/ig/engine/click.ts
import type { Ambiente, Desfecho } from "./handle-event";
import { retomarRun } from "./resume";

/** O `ref` do link (spec §8.5): aleatório, sem dado pessoal. */
export const REF_RE = /^[A-Za-z0-9_-]{10,24}$/;

/** A URL mandada à Meta (CAPI) nunca leva o ref. */
export function urlSemRef(url: URL): string {
  const limpa = new URL(url);
  limpa.searchParams.delete("ig");
  return limpa.toString();
}

/**
 * `/r/<slug>?ig=<ref>`: grava o primeiro clique no run da pessoa e, se o run
 * está parado esperando o clique, segue a saída "clicou". Nunca segura o
 * visitante: quem chama roda isto depois da resposta.
 */
export async function tratarClique(tenantId: string, ref: string | null, amb: Ambiente): Promise<Desfecho> {
  if (!ref || !REF_RE.test(ref)) return { kind: "ignored", reason: "sem ref" };
  const run = await amb.runs.porRef(tenantId, ref);
  if (!run) return { kind: "ignored", reason: "ref desconhecido" };
  const agora = amb.now().toISOString();
  if (!(await amb.runs.marcarClique(tenantId, run.id, agora))) return { kind: "ignored", reason: "já clicou" };
  if (run.status !== "active" || run.waiting !== "click") return { kind: "ignored", reason: "clique gravado" };
  return retomarRun({ ...run, clicked_at: agora }, { kind: "click", attempt: `click:${agora}` }, amb);
}
```

- [ ] **Step 4: `short-link-click.ts`**

Imports:

```ts
import { ambienteDeProducao } from "@/lib/ig/engine/ambiente";
import { REF_RE, tratarClique, urlSemRef } from "@/lib/ig/engine/click";
```

Logo depois do bloco `if (human) { … await Promise.allSettled([...]); }` (linhas 100–108):

```ts
  // Clique atribuído a um atendimento do Instagram (`?ig=<ref>`). Depois da
  // resposta, e o visitante nunca espera por ele.
  const igRef = reqUrl.searchParams.get("ig");
  if (human && igRef && REF_RE.test(igRef)) {
    const tenantId = link.tenant_id;
    after(() => tratarClique(tenantId, igRef, ambienteDeProducao()).catch((e: unknown) => console.warn(`[short-link/ig] ${slug}: ${e instanceof Error ? e.message : "erro"}`)));
  }
```

No `buildCapiPayload({ … })`, troque `sourceUrl: reqUrl.toString(),` por `sourceUrl: urlSemRef(reqUrl),`.

- [ ] **Step 5: Run tests and type-check**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/click.test.ts` e os dois `tsc`.
Expected: PASS; tsc limpo (`link.tenant_id` existe em `TrackedLink`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ig/engine/click.ts apps/web/src/lib/ig/engine/click.test.ts apps/web/src/lib/links/short-link-click.ts
git commit -m "feat(ig): attribute link clicks to runs; keep the ref out of the CAPI url"
```

### Task 8: `POST /api/ig/tick` (só a engine)

**Files:**
- Create: `apps/web/src/app/api/ig/tick/route.ts`
- Modify: `apps/web/src/lib/security/request-access-policy.ts:17-28` (`ENGINE_ONLY`)
- Modify: `apps/web/src/lib/security/request-access-policy.test.ts`

- [ ] **Step 1: Write the failing test** (depois do teste "the Zernio webhook is session-less…"):

```ts
test("the Instagram clock is engine-only: POST, exact path", () => {
  assert.equal(classifyRequest("/api/ig/tick", "POST"), "engine-only");
  assert.equal(classifyRequest("/api/ig/tick", "GET"), "user");
  assert.equal(classifyRequest("/api/ig/tick/x", "POST"), "user");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/security/request-access-policy.test.ts`
Expected: FAIL (`/api/ig/tick` POST classificado como `user`).

- [ ] **Step 3: Allowlist e rota**

Em `ENGINE_ONLY`, depois de `"POST /api/groups/bulk/ack",`: `"POST /api/ig/tick",`.

```ts
// apps/web/src/app/api/ig/tick/route.ts
import { ambienteDeProducao } from "@/lib/ig/engine/ambiente";
import { retomarRun } from "@/lib/ig/engine/resume";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOTE = 20;
/** Tentativas do relógio no mesmo bloco dentro de 10 min dividem a chave de idempotência (a Zernio replica em vez de mandar de novo). */
const FATIA_MS = 10 * 60_000;

// POST /api/ig/tick — a ENGINE (worker) acorda os runs da loja com hora vencida.
// Só a engine (ENGINE_ONLY); a loja vem no x-tenant-id. O worker chama uma vez por
// minuto por loja com run vencido; o lote de 20 cabe no tempo da função.
export async function POST(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  const amb = ambienteDeProducao();
  const agora = amb.now();
  const vencidos = await amb.runs.vencidos(tenantId, agora.toISOString(), LOTE);
  const fatia = Math.floor(agora.getTime() / FATIA_MS);
  const resultados: string[] = [];
  for (const run of vencidos) {
    const d = await retomarRun(run, { kind: "timer", attempt: `timer:${run.node_id}:${fatia}` }, amb);
    resultados.push(d.kind === "resumed" ? d.status : d.kind);
  }
  return Response.json({ acordados: vencidos.length, resultados });
}
```

- [ ] **Step 4: Run tests, type-check**

Run: `npm --workspace apps/web test` e os dois `tsc`.
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/ig/tick/route.ts apps/web/src/lib/security/request-access-policy.ts apps/web/src/lib/security/request-access-policy.test.ts
git commit -m "feat(ig): engine-only clock route wakes due runs"
```

### Task 9: o laço do worker

**Files:**
- Create: `apps/worker/src/ig-tick-loop.ts`
- Create: `apps/worker/src/ig-tick-loop.test.ts`
- Modify: `apps/worker/src/env.ts` (`WorkerEnv` e `loadEnv`)
- Modify: `apps/worker/src/index.ts` (deps, log de boot, laço 5, `Promise.all`)

**Interfaces:**
- Consumes: `createAppClient` (`./app-client.js`), `distinctTenantIds` (`./grow-tenants.js`), `startLoop` (`./loop.js`), `log` (`./log.js`).
- Produces: `IgTickDeps = { listDueTenants(nowIso) → string[]; tick(tenantId) → { acordados } ; now? }`, `runIgTick(deps) → { tenants; acordados; falhas }`, `igTickDidWork`, `makeIgTickDeps(supabase, app)`, `listIgDueTenants(supabase, nowIso)`; env `igTickEnabled`, `igTickMs`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/worker/src/ig-tick-loop.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { igTickDidWork, runIgTick, type IgTickDeps } from "./ig-tick-loop.js";

test("uma chamada por loja com run vencido, somando os acordados; uma loja falhar não para as outras", async () => {
  const chamadas: string[] = [];
  const deps: IgTickDeps = {
    now: () => new Date("2026-10-09T12:00:00Z"),
    listDueTenants: async (nowIso) => {
      assert.equal(nowIso, "2026-10-09T12:00:00.000Z");
      return ["loja-a", "loja-b", "loja-c"];
    },
    tick: async (tenantId) => {
      chamadas.push(tenantId);
      if (tenantId === "loja-b") throw new Error("500 /api/ig/tick");
      return { acordados: tenantId === "loja-a" ? 2 : 1 };
    },
  };
  const resumo = await runIgTick(deps);
  assert.deepEqual(resumo, { tenants: 3, acordados: 3, falhas: 1 });
  assert.deepEqual(chamadas, ["loja-a", "loja-b", "loja-c"]);
  assert.equal(igTickDidWork(resumo), true);
});

test("sem loja vencida não chama o app", async () => {
  let chamou = false;
  const resumo = await runIgTick({ listDueTenants: async () => [], tick: async () => { chamou = true; return { acordados: 0 }; } });
  assert.deepEqual(resumo, { tenants: 0, acordados: 0, falhas: 0 });
  assert.equal(chamou, false);
  assert.equal(igTickDidWork(resumo), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/worker exec tsx -- --test src/ig-tick-loop.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: `ig-tick-loop.ts`**

```ts
// apps/worker/src/ig-tick-loop.ts
/**
 * Relógio dos fluxos do Instagram (spec 2026-10-02 §8.4): a Vercel só agenda uma
 * vez por dia e o banco não tem pg_cron, então é este worker que, a cada
 * minuto, acha as lojas com run ativo de hora vencida e chama
 * POST /api/ig/tick nelas. Toda a lógica (o que fazer com o run) vive no app;
 * aqui é só o ponto batido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppClient } from "./app-client.js";
import { distinctTenantIds } from "./grow-tenants.js";
import { log } from "./log.js";

export type IgTickDeps = {
  listDueTenants: (nowIso: string) => Promise<string[]>;
  tick: (tenantId: string) => Promise<{ acordados: number }>;
  now?: () => Date;
};

export type IgTickSummary = { tenants: number; acordados: number; falhas: number };

/** Lojas com run ativo e hora vencida. O índice parcial ig_runs_wake_idx cobre a consulta. */
export async function listIgDueTenants(supabase: SupabaseClient, nowIso: string): Promise<string[]> {
  const { data, error } = await supabase.from("ig_runs").select("tenant_id").eq("status", "active").not("wake_at", "is", null).lte("wake_at", nowIso).limit(500);
  if (error) throw new Error(`listIgDueTenants: ${error.message}`);
  return distinctTenantIds(data ?? []);
}

export function makeIgTickDeps(supabase: SupabaseClient, app: AppClient): IgTickDeps {
  return {
    listDueTenants: (nowIso) => listIgDueTenants(supabase, nowIso),
    tick: (tenantId) => app.post<{ acordados: number }>(tenantId, "/api/ig/tick"),
  };
}

/** Um ciclo: uma chamada por loja vencida. Uma loja falhar não segura as outras. */
export async function runIgTick(deps: IgTickDeps): Promise<IgTickSummary> {
  const agora = (deps.now ?? (() => new Date()))().toISOString();
  const tenants = await deps.listDueTenants(agora);
  let acordados = 0;
  let falhas = 0;
  for (const tenantId of tenants) {
    try {
      acordados += (await deps.tick(tenantId)).acordados;
    } catch (err) {
      falhas += 1;
      log.warn("relógio do Instagram falhou numa loja", { tenantId, error: err instanceof Error ? err.message : "erro desconhecido" });
    }
  }
  return { tenants: tenants.length, acordados, falhas };
}

export const igTickDidWork = (s: IgTickSummary): boolean => s.tenants > 0;
```

- [ ] **Step 4: `env.ts`**

Em `WorkerEnv`, depois de `bulkIntervalMs: number;`:

```ts
  /**
   * Relógio dos fluxos do Instagram: chama POST /api/ig/tick nas lojas com run
   * de hora vencida (espera que venceu, lembrete). Default desligado como os
   * outros laços; desligado, lembrete nenhum sai — ligar no Coolify.
   */
  igTickEnabled: boolean;
  igTickMs: number;
```

Em `loadEnv()`, depois de `bulkIntervalMs: …,`:

```ts
    igTickEnabled: boolEnv("WORKER_IG_TICK_ENABLED"),
    // Mínimo de 15 s: o lembrete tem precisão de minuto; abaixo disso é só carga.
    igTickMs: intEnv("WORKER_IG_TICK_MS", 60_000, 15_000),
```

- [ ] **Step 5: `index.ts`**

Imports (junto dos outros `./…js`): `import { igTickDidWork, makeIgTickDeps, runIgTick, type IgTickDeps } from "./ig-tick-loop.js";` (e `import type { WorkerEnv } from "./env.js";` se ainda não houver).

Uma função ao lado de `buildBulkDeps`:

```ts
function buildIgTickDeps(env: WorkerEnv, supabase: SupabaseClient): IgTickDeps | null {
  if (!env.igTickEnabled) {
    log.warn("relógio do Instagram desligado (WORKER_IG_TICK_ENABLED != true): esperas e lembretes não vencem");
    return null;
  }
  if (!env.appBaseUrl || !env.engineToken) {
    log.warn("relógio do Instagram desligado: APP_URL/ENGINE_TOKEN ausentes");
    return null;
  }
  return makeIgTickDeps(supabase, createAppClient({ baseUrl: env.appBaseUrl, engineToken: env.engineToken }));
}
```

Depois de `const bulkDeps = buildBulkDeps(env, supabase);`: `const igTickDeps = buildIgTickDeps(env, supabase);`. No log "worker iniciado", depois de `bulk_interval_ms: env.bulkIntervalMs,`: `ig_tick: igTickDeps ? "on" : "off", ig_tick_ms: env.igTickMs,`. Depois do laço `lote` (antes do `await Promise.all`):

```ts
  // 5) relógio dos fluxos do Instagram: uma chamada por loja com run vencido, a cada minuto.
  const relogio = igTickDeps
    ? startLoop({
        name: "ig-tick",
        intervalMs: env.igTickMs,
        isStopping,
        onError: falhou("relógio do Instagram"),
        async tick() {
          const r = await runIgTick(igTickDeps);
          state.lastTickAt = Date.now();
          if (igTickDidWork(r)) log.info("relógio do Instagram", r);
        },
      })
    : null;
```

e `await Promise.all([principal.done, envio?.done, grow?.done, lote?.done, relogio?.done]);`.

- [ ] **Step 6: Tests and build**

Run: `npm --workspace apps/worker test` e `npm --workspace apps/worker run build`.
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/ig-tick-loop.ts apps/worker/src/ig-tick-loop.test.ts apps/worker/src/env.ts apps/worker/src/index.ts
git commit -m "feat(worker): Instagram clock loop calls /api/ig/tick for stores with due runs"
```

### Gate L e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] `git push -u origin feat/ig-fase3-clique-relogio` e PR:

```
PR L da fase 3 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-08-instagram-fluxos-fase3.md, Tasks 7–9).

- Clique: `/r/<slug>?ig=<ref>` grava `clicked_at` no run (primeiro clique) e segue "clicou" quando o run espera; roda depois da resposta; o ref sai da URL mandada à CAPI.
- Relógio: `POST /api/ig/tick` (ENGINE_ONLY) acorda até 20 runs vencidos da loja (`ig_claim_due_runs`): espera vencida → `timeout`; convite sem clique → `not_clicked` (lembrete).
- Worker: laço `ig-tick` (`WORKER_IG_TICK_ENABLED`, `WORKER_IG_TICK_MS`, default 60 s), uma chamada por loja com run vencido.

Deploy: no Coolify do worker, `WORKER_IG_TICK_ENABLED=true` (APP_URL e ENGINE_TOKEN já existem). Sem isso o worker avisa no boot e nenhum lembrete sai.
```

- [ ] **Prova em produção:** (1) com a variável ligada e o worker reiniciado, o log de boot mostra `ig_tick: "on"`; (2) na VIREI MODA, fluxo com "Lembrar quem não clicou" em **2 min** (`remindAfterMinutes` mínimo é 1): comentar "quero" com a `@igortoled0` seguindo, responder, receber o convite, **não clicar**; em até 3 min chega o lembrete; (3) clicar no link do lembrete: `clicked_at` preenchido. Conferir:

```sql
select status, node_id, waiting, wake_at, clicked_at, finished_at from public.ig_runs where tenant_id = '47c280cb-702a-445d-997e-8eea2f8fd173' order by started_at desc limit 1;
select node_id, "out", occurred_at from public.ig_run_steps where tenant_id = '47c280cb-702a-445d-997e-8eea2f8fd173' order by occurred_at desc limit 8;
```

Esperado: passo `convite/not_clicked`, run `done` no `lembrete`, `clicked_at` depois do clique. Quadro: `select public.move_card('ig-clique-e-lembrete', 'no_ar_verificado', 'Lembrete saiu pelo relógio do worker; clique no link gravado no run.', '<data/hora + os passos>');` e `update public.board_features set blocker = null where key = 'ig-clique-e-lembrete';`.

- [ ] Mergear e abrir a branch do PR M a partir de `origin/main`.

---

## PR M — números nas duas visões e na lista

Branch: `feat/ig-fase3-numeros`. Entrega: cada passo e cada desvio mostram quantas pessoas passaram; no mapa a ligação engrossa com o uso; a lista tem a faixa "chamaram · receberam o direct · clicaram"; "entraram no grupo" aparece como estimativa (≈).

### Task 10: contas puras

**Files:**
- Create: `apps/web/src/lib/ig/numeros.ts`
- Create: `apps/web/src/lib/ig/numeros.test.ts`

**Interfaces:**
- Produces: `PorPasso = Record<string, number>` (chave `"<nodeId>:<out>"`); `Numeros = { dias; porPasso; chamaram; receberam; clicaram; entraram: number | null }`; `Resumo = Pick<Numeros, "dias" | "chamaram" | "receberam" | "clicaram"> & { entraram?: number | null }`; `chave(nodeId, out)`, `montarPorPasso(linhas)`, `saida(n, nodeId, out)`, `chegaram(def, n, nodeId)`, `maiorSaida(n)`, `espessura(pessoas, maior)`, `estimarEntradas(clicaram, taxaPorCento)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/numeros.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "./flow/recipes";
import { chegaram, espessura, estimarEntradas, maiorSaida, montarPorPasso, saida, type Numeros } from "./numeros";

const def = RECIPES.comment_follow_invite.build();
const n: Numeros = {
  dias: 30,
  porPasso: montarPorPasso([
    { node_id: "gatilho", out: "next", pessoas: 10 },
    { node_id: "pede", out: "replied", pessoas: 6 },
    { node_id: "segue", out: "yes", pessoas: 4 },
    { node_id: "segue", out: "no", pessoas: 3 },
    { node_id: "pede_seguir", out: "replied", pessoas: 1 },
    { node_id: "convite", out: "not_clicked", pessoas: 2 },
  ]),
  chamaram: 10,
  receberam: 9,
  clicaram: 2,
  entraram: 1,
};

test("quem chegou num bloco é a soma das saídas que apontam pra ele; no gatilho, quem chamou", () => {
  assert.equal(chegaram(def, n, "gatilho"), 10);
  assert.equal(chegaram(def, n, "pede"), 10);
  // "segue" recebe de pede/replied (6) e de pede_seguir/replied (1): são passagens, uma pessoa pode contar duas vezes na volta.
  assert.equal(chegaram(def, n, "segue"), 7);
  assert.equal(chegaram(def, n, "convite"), 4);
  assert.equal(chegaram(def, n, "lembrete"), 2);
  assert.equal(saida(n, "segue", "no"), 3);
  assert.equal(saida(n, "convite", "clicked"), 0);
});

test("espessura vai de 2 a 8 px proporcional à saída mais usada; sem gente, 2", () => {
  assert.equal(maiorSaida(n), 10);
  assert.equal(espessura(10, 10), 8);
  assert.equal(espessura(5, 10), 5);
  assert.equal(espessura(0, 10), 2);
  assert.equal(espessura(3, 0), 2);
});

test("entraram é clicaram × taxa da campanha, ou null sem taxa", () => {
  assert.equal(estimarEntradas(20, 35), 7);
  assert.equal(estimarEntradas(20, null), null);
  assert.equal(estimarEntradas(0, 50), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/numeros.test.ts`
Expected: FAIL (módulo `./numeros` não existe).

- [ ] **Step 3: Write the module**

```ts
// apps/web/src/lib/ig/numeros.ts
import type { FlowDef, FlowOut } from "./flow/types";

/** `"<nodeId>:<out>"` → pessoas que tomaram a saída no período. */
export type PorPasso = Record<string, number>;

export type Numeros = {
  dias: number;
  porPasso: PorPasso;
  /** Runs iniciados. */
  chamaram: number;
  /** Runs que mandaram ao menos um direct. */
  receberam: number;
  /** Runs com clique no link. */
  clicaram: number;
  /** Estimativa: clicaram × taxa de entrada da campanha. `null` = sem taxa ainda. */
  entraram: number | null;
};

export type Resumo = Pick<Numeros, "dias" | "chamaram" | "receberam" | "clicaram"> & { entraram?: number | null };

export const chave = (nodeId: string, out: FlowOut | string): string => `${nodeId}:${out}`;

export function montarPorPasso(linhas: readonly { node_id: string; out: string; pessoas: number }[]): PorPasso {
  const porPasso: PorPasso = {};
  for (const l of linhas) porPasso[chave(l.node_id, l.out)] = l.pessoas;
  return porPasso;
}

export function saida(n: Numeros, nodeId: string, out: FlowOut): number {
  return n.porPasso[chave(nodeId, out)] ?? 0;
}

/**
 * Quantas passagens chegaram no bloco: no gatilho, quem chamou; nos outros, a
 * soma das saídas que apontam pra ele. Numa volta (não segue → pede de novo →
 * segue) a mesma pessoa passa duas vezes e conta duas: é passagem, não cadastro.
 */
export function chegaram(def: FlowDef, n: Numeros, nodeId: string): number {
  if (def.nodes.find((x) => x.id === nodeId)?.type === "trigger") return n.chamaram;
  return def.edges.filter((e) => e.to === nodeId).reduce((soma, e) => soma + saida(n, e.from, e.out), 0);
}

export function maiorSaida(n: Numeros): number {
  return Math.max(0, ...Object.values(n.porPasso));
}

/** Ligação do mapa: 2 px sem gente, até 8 px na saída mais usada. */
export function espessura(pessoas: number, maior: number): number {
  if (maior <= 0 || pessoas <= 0) return 2;
  return 2 + Math.round((pessoas / maior) * 6);
}

export function estimarEntradas(clicaram: number, taxaPorCento: number | null): number | null {
  if (taxaPorCento === null) return null;
  return Math.round((clicaram * taxaPorCento) / 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/numeros.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/numeros.ts apps/web/src/lib/ig/numeros.test.ts
git commit -m "feat(ig): pure step-count helpers"
```

### Task 11: rotas — números do fluxo e resumo da loja

**Files:**
- Create: `apps/web/src/app/api/ig/flows/[id]/numeros/route.ts`
- Modify: `apps/web/src/app/api/ig/flows/route.ts` (`GET`)

**Interfaces:**
- Consumes: `stepCounts`, `countRuns` (Task 2), `getFlow`, `getCampaignGroupBySlug` (`@/lib/stores/campaign-groups`), `getTrackedLinkBySlug` (`@/lib/stores/tracked-links`), `countEntriesSince` (`@/lib/stores/leads`), `entriesPerClick` (`@/lib/campaigns/campaign-entries`), `montarPorPasso`, `estimarEntradas`.
- Produces: `GET /api/ig/flows/[id]/numeros?dias=7|30|90 → Numeros`; `GET /api/ig/flows → { flows, resumo: Resumo }`.

- [ ] **Step 1: A rota dos números**

```ts
// apps/web/src/app/api/ig/flows/[id]/numeros/route.ts
import { requireInstagram } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { estimarEntradas, montarPorPasso, type Numeros } from "@/lib/ig/numeros";
import { entriesPerClick } from "@/lib/campaigns/campaign-entries";
import { getCampaignGroupBySlug } from "@/lib/stores/campaign-groups";
import { getFlow } from "@/lib/stores/ig-flows";
import { countRuns, stepCounts } from "@/lib/stores/ig-runs";
import { countEntriesSince } from "@/lib/stores/leads";
import { getTrackedLinkBySlug } from "@/lib/stores/tracked-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIAS = [7, 30, 90] as const;
const DIA_MS = 86_400_000;

/**
 * "Entraram no grupo" é estimativa (spec §11): cliques do fluxo × taxa de
 * entrada da campanha do primeiro convite (entradas nos grupos dela ÷ cliques do
 * link mestre). O WhatsApp não diz qual pessoa do Instagram entrou.
 */
async function estimativaDeEntradas(tenantId: string, slug: string | null, clicaram: number): Promise<number | null> {
  if (!slug || clicaram === 0) return slug ? 0 : null;
  const [campanha, link] = await Promise.all([getCampaignGroupBySlug(tenantId, slug), getTrackedLinkBySlug(slug)]);
  if (!campanha || !link || link.tenant_id !== tenantId) return null;
  const entradas = await countEntriesSince(tenantId, campanha.group_ids, campanha.created_at);
  return estimarEntradas(clicaram, entriesPerClick(entradas, link.clicks));
}

// GET /api/ig/flows/[id]/numeros?dias=30 — leitura: qualquer papel da loja.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireInstagram(req);
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const pedido = Number(new URL(req.url).searchParams.get("dias") ?? "30");
    const dias = (DIAS as readonly number[]).includes(pedido) ? pedido : 30;
    const flow = await getFlow(ctx.tenantId, id);
    if (!flow) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const sinceIso = new Date(Date.now() - dias * DIA_MS).toISOString();
    const [passos, chamaram, receberam, clicaram] = await Promise.all([
      stepCounts(ctx.tenantId, id, sinceIso),
      countRuns(ctx.tenantId, { flowId: id, sinceIso, que: "chamaram" }),
      countRuns(ctx.tenantId, { flowId: id, sinceIso, que: "receberam" }),
      countRuns(ctx.tenantId, { flowId: id, sinceIso, que: "clicaram" }),
    ]);
    const slug = flow.published?.nodes.find((n) => n.type === "invite" && n.campaignSlug)?.campaignSlug ?? null;
    const corpo: Numeros = { dias, porPasso: montarPorPasso(passos), chamaram, receberam, clicaram, entraram: await estimativaDeEntradas(ctx.tenantId, slug, clicaram) };
    return Response.json(corpo);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

Confira os nomes exatos: `getCampaignGroupBySlug(tenantId, slug)` devolve `{ group_ids, created_at, … }`; `getTrackedLinkBySlug(slug)` devolve `{ tenant_id, clicks, … }`; `countEntriesSince(tenantId, groupIds, since)`; `entriesPerClick(entries, clicks): number | null`. Se `n.type === "invite" && n.campaignSlug` não estreitar o tipo no `find`, troque por `.find((n): n is InviteNode => n.type === "invite" && n.campaignSlug !== null)` importando `InviteNode` de `@/lib/ig/flow/types`.

- [ ] **Step 2: O resumo na lista**

Em `flows/route.ts`, importe `import { countRuns } from "@/lib/stores/ig-runs";` e `import type { Resumo } from "@/lib/ig/numeros";` e troque o `GET`:

```ts
const DIAS_DO_RESUMO = 30;

export async function GET(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    const sinceIso = new Date(Date.now() - DIAS_DO_RESUMO * 86_400_000).toISOString();
    const [flows, chamaram, receberam, clicaram] = await Promise.all([
      listFlows(ctx.tenantId),
      countRuns(ctx.tenantId, { sinceIso, que: "chamaram" }),
      countRuns(ctx.tenantId, { sinceIso, que: "receberam" }),
      countRuns(ctx.tenantId, { sinceIso, que: "clicaram" }),
    ]);
    const resumo: Resumo = { dias: DIAS_DO_RESUMO, chamaram, receberam, clicaram };
    return Response.json({ flows, resumo });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

- [ ] **Step 3: Type-check**

Run: os dois `tsc` e `lint`.
Expected: limpos.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/api/ig/flows/[id]/numeros/route.ts" apps/web/src/app/api/ig/flows/route.ts
git commit -m "feat(ig): flow step numbers endpoint and store summary on the list"
```

### Task 12: mostrar — trilha, mapa, editor e lista

**Files:**
- Create: `apps/web/src/components/painel/instagram/use-numeros.ts`
- Create: `apps/web/src/components/painel/instagram/resumo-numeros.tsx`
- Modify: `apps/web/src/components/painel/instagram/trilha.tsx`
- Modify: `apps/web/src/components/painel/instagram/mapa.tsx`
- Modify: `apps/web/src/components/painel/instagram/editor.tsx`
- Modify: `apps/web/src/components/painel/instagram/lista.tsx`
- Modify: `apps/web/e2e/painel-instagram.spec.ts`

- [ ] **Step 1: O hook**

```ts
// apps/web/src/components/painel/instagram/use-numeros.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Numeros } from "@/lib/ig/numeros";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";

const valida = (corpo: unknown): corpo is Numeros => !!corpo && typeof corpo === "object" && typeof (corpo as Numeros).chamaram === "number" && typeof (corpo as Numeros).porPasso === "object";

/** Números do fluxo publicado no período. `ligado = false` (rascunho nunca publicado) não busca nada. */
export function useNumeros(id: string, dias: number, ligado: boolean): { numeros: Numeros | null; carga: Carga; recarregar: () => void } {
  const [numeros, setNumeros] = useState<Numeros | null>(null);
  const [carga, setCarga] = useState<Carga>("ok");
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  useEffect(() => {
    if (!ligado) {
      setNumeros(null);
      return;
    }
    void buscar<Numeros>(`/api/ig/flows/${id}/numeros?dias=${dias}`, valida, setNumeros, setCarga);
  }, [id, dias, ligado, versao]);
  return { numeros, carga, recarregar };
}
```

- [ ] **Step 2: A faixa de resumo (lista e editor)**

```tsx
// apps/web/src/components/painel/instagram/resumo-numeros.tsx
import type { Resumo } from "@/lib/ig/numeros";

const CELULAS: Array<[keyof Resumo, string]> = [["chamaram", "chamaram"], ["receberam", "receberam o direct"], ["clicaram", "clicaram no link"]];

/** "Últimos 30 dias: 12 chamaram · 11 receberam o direct · 4 clicaram no link · ≈ 2 entraram no grupo". */
export function ResumoNumeros({ resumo }: { resumo: Resumo }) {
  return (
    <section role="region" aria-label={`Números dos últimos ${resumo.dias} dias`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[10px] border border-line-200 bg-paper-0 px-4 py-3 text-13 text-slate-600">
      <span className="text-12">Últimos {resumo.dias} dias</span>
      {CELULAS.map(([chave, rotulo]) => (
        <span key={chave}><span className="font-data text-15 font-semibold text-volt-950">{resumo[chave]}</span> {rotulo}</span>
      ))}
      {resumo.entraram !== undefined && resumo.entraram !== null && (
        <span title="Estimativa: cliques × taxa de entrada da campanha. O WhatsApp não diz quem veio do Instagram."><span className="font-data text-15 font-semibold text-volt-950">≈ {resumo.entraram}</span> entraram no grupo</span>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Trilha com números**

Em `trilha.tsx`: importe `import { chegaram, saida, type Numeros } from "@/lib/ig/numeros";`. `Contexto` ganha `numeros: Numeros | null`. Em `Bloco`, logo depois de `const Icone = ICONE[node.type];`: `const chegou = ctx.numeros ? chegaram(def, ctx.numeros, node.id) : null;`. No `<h3>`, depois de `{tituloDoBloco(node)}`:

```tsx
          {chegou !== null && <span className="ml-auto font-data text-12 font-normal text-slate-600">{chegou} {chegou === 1 ? "pessoa" : "pessoas"}</span>}
```

Nos rótulos das saídas, um contador depois do nome: no `<li>` de `fim`, troque `{rotuloDaSaida(fim.out, node)}</span>` por `{rotuloDaSaida(fim.out, node)}</span>{ctx.numeros && <span className="font-data"> · {saida(ctx.numeros, node.id, fim.out)}</span>}`; no `<li>` de cada ramo, depois do `<span className="font-medium …">{rotuloDaSaida(r.out, node)}</span>`, o mesmo com `r.out`. A assinatura vira `Trilha({ def, campanhas, issues, editar, numeros = null }: { …; numeros?: Numeros | null })` e o `ctx` recebe `numeros`.

- [ ] **Step 4: Mapa com espessura e contagem**

Em `mapa.tsx`: importe `import { espessura, maiorSaida, saida, type Numeros } from "@/lib/ig/numeros";`. `Mapa({ def, numeros = null }: { def: FlowDef; numeros?: Numeros | null })`. Antes do `return`: `const maior = numeros ? maiorSaida(numeros) : 0;`. No `<path>`, troque `strokeWidth={e.kind === "principal" ? 3 : 2}` por `strokeWidth={numeros ? espessura(saida(numeros, e.from, e.out), maior) : e.kind === "principal" ? 3 : 2}`. No `<li>` das saídas, troque o ponto por um contador quando há números:

```tsx
{outsOf(node).map((out) => (
  <li key={out} className="flex items-center justify-between py-0.5">
    <span>{rotuloDaSaida(out, node)}</span>
    {numeros ? <span className="font-data text-volt-950">{saida(numeros, node.id, out)}</span> : <span aria-hidden="true" className="h-2 w-2 rounded-full border border-slate-600" />}
  </li>
))}
```

- [ ] **Step 5: Editor — período e passagem dos números**

Em `editor.tsx`: imports `import { useNumeros } from "./use-numeros";` e `import { ResumoNumeros } from "./resumo-numeros";`. Estado `const [dias, setDias] = useState(30);` e, depois de `useFluxo(id)`: `const { numeros, recarregar: recarregarNumeros } = useNumeros(id, dias, !!flow?.published);`. Depois de publicar ou mudar o estado com sucesso (`aoPublicar` no ramo `ok`, e no `then` do interruptor sem erro), chame `recarregarNumeros()`. Na faixa de abas, dentro do `{aba === "roteiro" && ( … )}` e antes do grupo "Ver como", quando `flow.published`:

```tsx
            <label className="flex items-center gap-1 text-12 text-slate-600">
              Últimos
              <select aria-label="Período dos números" value={dias} onChange={(e) => setDias(Number(e.target.value))} className="h-8 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-1.5 text-13 text-volt-950">
                <option value={7}>7 dias</option>
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
              </select>
            </label>
```

Passe `numeros={numeros}` para `<Trilha …>` e `<Mapa …>`. No `<aside>`, antes de `<Previa …>`: `{numeros && <ResumoNumeros resumo={numeros} />}`.

- [ ] **Step 6: Lista com a faixa**

Em `lista.tsx`: `type Resposta = { flows: FlowSummary[]; resumo?: Resumo }` (importe `Resumo` de `@/lib/ig/numeros` e `ResumoNumeros`); estado `const [resumo, setResumo] = useState<Resumo | null>(null);`; no `buscar`, `(r) => { setFluxos(r.flows); setResumo(r.resumo ?? null); }`. Entre o `</header>` e o `<div className="mt-5 rounded-[10px] …">` da tabela: `{resumo && <div className="mt-5"><ResumoNumeros resumo={resumo} /></div>}`.

- [ ] **Step 7: e2e**

No teste "a lista mostra o estado da conta…" de `painel-instagram.spec.ts`, depois do `expect` do botão:

```ts
    await expect(page.getByRole("region", { name: "Números dos últimos 30 dias" })).toBeVisible();
```

- [ ] **Step 8: Gate local**

Run: os nove comandos do gate (`painel:check` conta `bg-acid`: nenhum destes arquivos usa).
Expected: verde.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/painel/instagram/use-numeros.ts apps/web/src/components/painel/instagram/resumo-numeros.tsx apps/web/src/components/painel/instagram/trilha.tsx apps/web/src/components/painel/instagram/mapa.tsx apps/web/src/components/painel/instagram/editor.tsx apps/web/src/components/painel/instagram/lista.tsx apps/web/e2e/painel-instagram.spec.ts
git commit -m "feat(ig): step numbers in both views, period selector, store summary strip"
```

### Gate M e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] `git push -u origin feat/ig-fase3-numeros` e PR:

```
PR M da fase 3 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-08-instagram-fluxos-fase3.md, Tasks 10–12). Fecha a fase 3.

- `GET /api/ig/flows/[id]/numeros?dias=7|30|90`: pessoas por bloco e saída (`ig_step_counts`), chamaram/receberam/clicaram, "entraram" estimado (≈, cliques × taxa de entrada da campanha).
- Passo a passo: "N pessoas" em cada bloco e contador em cada saída. Mapa: ligação de 2 a 8 px pelo uso, contador nas saídas. Seletor de período.
- Lista: faixa "Últimos 30 dias: chamaram · receberam o direct · clicaram no link".
```

- [ ] **Prova em produção:** abrir o fluxo da VIREI MODA usado nos Gates K e L: a trilha mostra "N pessoas" no gatilho e os contadores nas saídas batem com `select node_id, "out", count(distinct run_id) from public.ig_run_steps where tenant_id = '47c280cb-702a-445d-997e-8eea2f8fd173' and flow_id = '<id>' group by 1, 2;`. O mapa engrossa a ligação principal. A lista mostra a faixa. Print. Quadro: `select public.move_card('ig-numeros', 'no_ar_verificado', 'Números por passo batem com ig_run_steps; faixa na lista.', '<data/hora + a consulta e o print>');` e `update public.board_features set blocker = null where key = 'ig-numeros';`.

- [ ] Mergear. Encerrar a sessão com "PRs que deixei abertos: nenhum" e o `rag insert` abaixo.

```powershell
rag insert "decisão 2026-10: Fluxos do Instagram fase 3 no ar (plano docs/superpowers/plans/2026-10-08-instagram-fluxos-fase3.md): PR J ig_runs.conversation_id + ig_claim_due_runs + ig_step_counts; PR K motor retomável (reply/click/timer, segue a loja? com refresh=true, botão postback ig:<run>:<bloco>, janela de 24 h na resposta, retomada reivindicada no banco); PR L clique no /r?ig=<ref> e relógio POST /api/ig/tick batido pelo worker (WORKER_IG_TICK_ENABLED); PR M números por passo nas duas visões e faixa da lista, entraram ≈ cliques × taxa da campanha. Decisões: isFollower null conta como não segue; sem lembrete o convite com desvio espera até a janela fechar; chave de idempotência leva a tentativa (evento da Zernio, hora do clique, fatia de 10 min do relógio)." --source decisao-2026-10-instagram-fase3
```

## O que fica para as próximas fases (não faça agora)

- **Fase 5** (mapa editável): plano próprio em `docs/superpowers/plans/2026-10-08-instagram-fluxos-fase5.md`.
- Política de privacidade citando a Zernio como suboperadora (fora deste plano; o chat da fase 2 ficou com ela).
- "Entraram no grupo" por pessoa (o WhatsApp não diz quem veio do Instagram): continua estimativa.
- Etiqueta, teste A/B, espera genérica, passar pra loja, perguntas prontas (spec §17).

## Auto-revisão do plano (feita em 08/10)

**Cobertura do spec (fase 3 em §16):**

| Spec | Onde |
|---|---|
| §8.2 Direct com espera: fica esperando resposta | Task 4 (`espera(..., "reply", wakeAt)`) |
| §8.2 Convite: espera clique se há lembrete ou aresta `clicked` | Task 4 |
| §8.2 Condição "segue a loja?" com `refresh=true` | Tasks 3, 4, 5 (`segue`) |
| §8.2 Cada transição grava um passo; `Idempotency-Key` por run + bloco | Task 4 (`deps.step`, chave com tentativa) |
| §8.3 Trava de retomada (reenvio), janela, ciclo, pausado para os runs | Tasks 4, 5 (`reivindicar`), `stopActiveRuns` (fase 2) |
| §8.4 Relógio: worker chama `POST /api/ig/tick` a cada minuto; `for update skip locked`; `advance(run, timer)` | Tasks 1, 8, 9 |
| §8.5 Clique atribuído: `/r/<slug>?ig=<ref>`, depois do filtro de robô, dentro do `after()`, só no primeiro clique, só se o tenant do run é o do link, ref nunca ecoado e fora da URL da CAPI | Task 7 |
| §9.3 Desconectar pausa os fluxos no ar (runs param) | fase 2 (`stopActiveRuns`); `retomarRun` recusa conta inativa (Task 5) |
| §10 fase 3: números em cada passo e desvio; espessura no mapa | Task 12 |
| §11 `ig_run_steps` agrupado por `(node_id, out)` por função no banco; faixa da lista; "entraram" ≈ cliques × taxa | Tasks 1, 10, 11, 12 |
| §13 `POST /api/ig/tick` só a engine, em `ENGINE_ONLY` | Task 8 |
| §15 testes puros, stores com PostgREST falso, e2e, prova por fase | cada Task; Gates K, L, M |
| §16 "A receita 2 roda inteira e os números batem com o banco" | Gates K, L, M |
| Botão de confirmação antes do link (pedido do Igor em 08/10) | Tasks 3, 4, 5: `MessageNode.button` vira postback, o toque conta como resposta |

**Placeholders:** nenhum "TBD"/"TODO"; `<data>`/`<data/hora …>` são os valores que o executor preenche na hora (apply-order e prova do quadro).

**Consistência de tipos:** `RunRow.conversation_id` (Task 2) é lido em `retomarRun` (Task 5) e preenchido em `handle-event` (Task 5); `RunPatch` com `clicked_at`/`window_expires_at`/`conversation_id` (Task 2) é o que `retomarRun` e o `tratarEvento` gravam; `claimWaiting`/`markClicked`/`claimDueRuns`/`findRunWaitingReply`/`getRunById`/`getRunByRef` (Task 2) batem com `Ambiente.runs.reivindicar/marcarClique/vencidos/esperandoResposta/porId/porRef` (Tasks 5, 7, 8) via `ambienteDeProducao`; `Transport.followStatus` e `buttons` (Task 3) são usados em `advance` (Task 4) e no `segue` do ambiente (Task 5); `Evento`/`RunState.nodeId/attempt/igUserId`/`Resultado.wakeAt` (Task 4) batem com `retomarRun` (Task 5), `tratarClique` (Task 7) e a rota do relógio (Task 8); `Desfecho.resumed` (Task 5) é tratado no webhook (Task 5), no clique (Task 7) e no tick (Task 8); `stepCounts`/`countRuns` (Task 2) alimentam as rotas (Task 11) e `Numeros`/`Resumo` (Task 10) alimentam o hook e os componentes (Task 12).
