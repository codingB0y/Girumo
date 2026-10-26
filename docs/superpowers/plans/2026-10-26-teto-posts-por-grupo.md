# Teto de posts por grupo por dia — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nenhum grupo recebe do Girumo mais de 4 posts no mesmo dia de Brasília; o grupo que já chegou em 4 fica de fora do post, com o motivo visível no histórico e, antes de postar, no compositor.

**Architecture:** A regra vive inteira no banco: `app.posts_hoje_por_grupo` conta, `app.enqueue_broadcast` (a única porta de entrada dos envios) separa os grupos no teto e grava para eles um comando já `canceled` com `payload.foraDoTeto`. `app.promote_due_schedules` passa a ignorar essas linhas na oferta relâmpago e avisa o lojista quando um agendado é cortado inteiro. O TypeScript só lê: a entrega por grupo ganha o estado `fora_do_teto` (PR 1) e o compositor lê a contagem por `GET /api/groups/posts-hoje` (PR 2).

**Tech Stack:** Postgres/Supabase (plpgsql, migração aplicada pelo CI), Next.js App Router (rotas em `apps/web/src/app/api`), testes `tsx --test` (node:test) com PostgREST falso, Playwright no e2e.

**Spec:** `docs/superpowers/specs/2026-10-24-teto-posts-por-grupo-design.md` (ler inteira antes de começar; o plano argumenta a partir dela).

## Global Constraints

- Teto = **4**, só em `app.posts_por_grupo_dia()`. Nenhum arquivo TypeScript contém o número 4 como regra ou como texto (a spec §8: "O TypeScript nunca recalcula nem guarda o 4"). Por isso o rótulo do histórico é "limite do dia" e não "Já tinha 4 hoje" — correção minha de uma contradição interna da spec, ver "Decisões deste plano".
- Dia = data em `America/Sao_Paulo`, pelo `created_at` do comando.
- Contam: `type in ('send_message','send_media','send_poll')`, `status in ('queued','processing','done')`, por `tenant_id` + `payload->>'jid'`, qualquer número da loja.
- Erro do comando de fora (texto exato): `Não enviado: este grupo já recebeu 4 posts hoje (limite do anti-ban). Volta à meia-noite.` — montado no SQL com `app.posts_por_grupo_dia()`, não com o literal.
- Erro do post com todos de fora (texto exato): `Nenhum grupo recebeu: todos já tinham 4 posts hoje. O limite volta à meia-noite.` — idem.
- Notificação de agendado cortado inteiro: `type = 'teto_posts_grupo'`, título `Post agendado não saiu`, corpo `O post agendado "{nome}" não saiu: todos os grupos já tinham recebido 4 posts hoje. O limite volta à meia-noite.`, `href = '/painel/disparos'`.
- Migração: `apps/web/supabase/migrations/20261026120000_teto_posts_por_grupo.sql` + linha no fim de `deploy/supabase/apply-order.txt`. **Nunca DDL à mão**: o CI aplica (`migrate-dev` no PR, `migrate-prod` no merge). Todo `security definer` com `set search_path to 'public', 'app'`; toda função com `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role` explícitos.
- **Não fazer push da branch do PR 1 antes de a migração estar completa** (Tasks 1–3 verdes). O `migrate-dev` grava o nome do arquivo em `ops.applied_migrations` e não reaplica um arquivo editado depois.
- Rotas novas em `/api/groups/*` (namespace existente). Stores Supabase sempre com `.eq('tenant_id', ...)` ou `p_tenant` explícito.
- Commits em inglês com prefixo semântico e a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos de verificação TS (de `C:\Users\Igor\Desktop\HubFlow-platform` ou do worktree, raiz do repo):
  - `npm --workspace apps/web test`
  - `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`
  - `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json`
  - `npm --workspace apps/web run lint`
  O build fica com o CI (disco C: cheio dá ENOSPC disfarçado).

## Review Focus

1. **Virada do dia em UTC × Brasília:** comando criado às 23:59 de ontem (BRT) não conta; criado às 00:01 de hoje (BRT, que é 03:01 UTC) conta. Teste no bloco 2 da conferência (Task 1).
2. **Dois posts da mesma loja enfileirados juntos:** sem a trava por loja, os dois leem "3" e o grupo recebe 5. A trava tem que vir antes da contagem, na mesma transação do insert. Teste no bloco 3 (Task 2): a posição de `pg_advisory_xact_lock` no `prosrc` vem antes da de `posts_hoje_por_grupo`.
3. **Recorrente cortado inteiro mostrando a rodada de ontem:** o post `failed` precisa de `run_id` novo, senão a tabela mostra as células "entregue" de ontem. Teste no bloco 5 (Task 2): reenfileirar um post já `failed` troca o `run_id`.
4. **@todos de um post com grupos de fora:** a linha de fora leva `mentionAll: true` no payload, mas nunca é pega pelo claim, então não pode gastar o orçamento de 2 @todos. Teste no bloco 4 (Task 2): a linha de fora tem `claimed_at is null` e `status = 'canceled'`.
5. **Compositor com a contagem carregando ou com erro:** sem dados ou sem grupos, a linha não aparece e o botão segue habilitado. Teste na Task 8 (`grupos` vazio → `null`) e no e2e da Task 9 (rota de contagem respondendo 500 → nenhuma linha, botão habilitado).

---

## PR 1 — banco + histórico

Branch `feat/teto-posts-banco`, worktree novo a partir de `origin/main` (`git fetch origin main` antes; defasagem > 20 commits → atualizar antes de escrever). Card do quadro `teto-posts-por-grupo` criado em `em_construcao` no começo (ver Task 6, passo 1).

### Task 1: Contagem do dia, teto, leitura para a tela e índice

**Files:**
- Create: `apps/web/supabase/migrations/20261026120000_teto_posts_por_grupo.sql` (seção 1)
- Modify: `deploy/supabase/apply-order.txt` (linha no fim)
- Create: `infra/tests/teto-posts-por-grupo-check.sql` (preâmbulo + blocos 1 e 2)

**Interfaces:**
- Produces:
  - `app.posts_por_grupo_dia() returns integer` — `language sql immutable`, devolve 4 (molde de `app.mention_all_daily_budget()` em `20261023120000`).
  - `app.posts_hoje_por_grupo(p_tenant uuid) returns table (jid text, posts integer)` — `language sql stable security definer`. Só grupos com post hoje.
  - `public.posts_hoje_por_grupo(p_tenant uuid) returns jsonb` → `{"teto": 4, "grupos": {"<jid>": <posts>}}`, `grupos` = `{}` quando vazio. `security definer`. Muda a baseline.
  - Índice `engine_commands_posts_dia_idx on public.engine_commands (tenant_id, created_at) where type in ('send_message','send_media','send_poll')`.

- [ ] **Step 1: Escrever o preâmbulo e os blocos 1–2 da conferência**

Molde: `infra/tests/antiban-saidas-e-todos-check.sql` (cabeçalho com os comandos para rodar em dev/prod, `begin;` … `rollback;`, cada bloco levanta `'FALHOU: …'`, última linha `select 'ok' as r;` antes do `rollback;`). Loja descartável `7e700000-0000-4000-8000-000000000001` (slug `check-teto-posts-7e70`), dois números conectados (`…0e1` e `…0e2`, ambos com `provider_instance_id` preenchido, como em `infra/tests/dispatch-fanout-smoke.sql`), três grupos admin com 100 membros: `teto-g1@g.us`, `teto-g2@g.us`, `teto-g3@g.us`.

Bloco 1 (contrato): as três funções existem; as duas `security definer` têm `search_path` e EXECUTE só do `service_role` (sem anon/authenticated); `app.posts_por_grupo_dia() = 4`; o índice existe (`to_regclass('public.engine_commands_posts_dia_idx') is not null`).

Bloco 2 (o que conta) — insere comandos direto em `public.engine_commands` com `created_at` explícito; `v_hoje := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'`:

| jid | linhas | conta? |
|---|---|---|
| g1 | 2 `done` `send_media` em `v_hoje + 1 minute` pelo número 1 | sim (2) |
| g1 | 1 `queued` `send_poll` em `v_hoje + 2 minutes` pelo número 2 | sim (dois números somam) |
| g1 | 1 `canceled` e 1 `failed` hoje | não |
| g1 | 1 `done` em `v_hoje - 1 minute` | não (ontem em Brasília) |
| g2 | 1 `processing` `send_message` em `v_hoje + 1 minute` | sim |

```sql
-- asserções do bloco 2
if (select jsonb_object_agg(jid, posts) from app.posts_hoje_por_grupo('7e700000-0000-4000-8000-000000000001'))
   is distinct from '{"teto-g1@g.us": 3, "teto-g2@g.us": 1}'::jsonb then
  raise exception 'FALHOU: contagem do dia errada';
end if;
if public.posts_hoje_por_grupo('7e700000-0000-4000-8000-000000000001')
   is distinct from '{"teto": 4, "grupos": {"teto-g1@g.us": 3, "teto-g2@g.us": 1}}'::jsonb then
  raise exception 'FALHOU: leitura da tela errada';
end if;
if public.posts_hoje_por_grupo(gen_random_uuid()) is distinct from '{"teto": 4, "grupos": {}}'::jsonb then
  raise exception 'FALHOU: loja sem post deveria devolver grupos vazio';
end if;
```

- [ ] **Step 2: Rodar a conferência em dev e ver falhar**

De `apps/web`, com `supabase/.temp/project-ref` = `wfjuwogxaupyadwhvoxy` (dev; se não for, `supabase link --project-ref wfjuwogxaupyadwhvoxy --yes`): `supabase db query --linked -o json -f ..\..\infra\tests\teto-posts-por-grupo-check.sql`. Alternativa sem `link`: MCP do Supabase `execute_sql` com o projeto de dev e o script inteiro.
Expected: erro `FALHOU: …` no bloco 1 (funções ausentes).

- [ ] **Step 3: Escrever a seção 1 da migração**

Cabeçalho no padrão de `20261023120000_antiban_saidas_e_todos.sql` (por quê, o que muda, "Idempotente", "muda a baseline"). Corpo da contagem:

```sql
select c.payload->>'jid', count(*)::int
from public.engine_commands c
where c.tenant_id = p_tenant
  and c.type in ('send_message', 'send_media', 'send_poll')
  and c.status in ('queued', 'processing', 'done')
  and c.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
  and c.payload ? 'jid'
group by 1
```

O wrapper monta `jsonb_build_object('teto', app.posts_por_grupo_dia(), 'grupos', coalesce(jsonb_object_agg(...), '{}'::jsonb))`. Índice com `create index if not exists`. Linha em `apply-order.txt` no formato das anteriores: `# 26/10: teto de 4 posts por grupo por dia (enqueue_broadcast deixa de fora, promote_due_schedules ignora na oferta e notifica). Muda a baseline.` + o caminho do arquivo.

- [ ] **Step 4: Rodar a migração 2x + a conferência numa transação desfeita, em dev**

Montar `teto-dry-run.sql` no scratchpad = `begin;` + migração + migração + conferência (o `begin;` da conferência vira aviso dentro da transação aberta; o `rollback;` dela desfaz tudo). Rodar como no Step 2.
Expected: última linha `r = 'ok'`. Se o classificador recusar DDL mesmo em transação desfeita, registrar no ledger e seguir: a prova passa a ser o Step 3 da Task 6 (depois do `migrate-dev`), e as Tasks 2 e 3 rodam o mesmo dry-run só quando for possível.

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20261026120000_teto_posts_por_grupo.sql deploy/supabase/apply-order.txt infra/tests/teto-posts-por-grupo-check.sql
git commit -m "feat(antiban): count posts per group per day in the database"
```

### Task 2: `app.enqueue_broadcast` deixa de fora o grupo no teto

**Files:**
- Modify: `apps/web/supabase/migrations/20261026120000_teto_posts_por_grupo.sql` (seção 2)
- Modify: `infra/tests/teto-posts-por-grupo-check.sql` (blocos 3–6)

**Interfaces:**
- Consumes: `app.posts_por_grupo_dia()`, `app.posts_hoje_por_grupo(uuid)` (Task 1).
- Produces: comando de fora = linha de `engine_commands` da rodada com `status = 'canceled'`, `payload = <payload de sempre> || '{"foraDoTeto": true}'`, `error` = texto exato das Global Constraints, mesma `dedupe_key`/`instance_id`/`origin_*`. Post com todos de fora: `broadcasts.status = 'failed'`, `run_id` novo, `running_since = now()`, `total` = linhas de fora, `sent = 0`, `error` = texto exato. Post parcial: `status = 'queued'`, `total` = todas as linhas (inclui as de fora).

- [ ] **Step 1: Escrever os blocos 3–6 da conferência**

Para criar e enfileirar um post: `insert into public.broadcasts (tenant_id, name, message, group_ids, status) values (<loja>, <nome>, 'oferta', array[...], 'draft') returning id` e `app.enqueue_broadcast(<loja>, <id>)` (conferir colunas obrigatórias em `dispatch-fanout-smoke.sql`). Os blocos partem do estado do bloco 2 (g1 com 3, g2 com 1).

- Bloco 3 (trava): `position('pg_advisory_xact_lock' in prosrc) > 0` e menor que `position('posts_hoje_por_grupo' in prosrc)` no corpo de `app.enqueue_broadcast(uuid,uuid)`; md5 normalizado do corpo = o desta migração (calcular no Step 4).
- Bloco 4 (4º sai, 5º fica de fora, parcial): post A para `[g1]` → `queued`, g1 passa a 4. Post B para `[g1, g2]` com `mention_all = true` → `status = 'queued'`, `total = 2`; o comando de g2 `queued` sem `foraDoTeto`; o de g1 `canceled`, `payload->>'foraDoTeto' = 'true'`, `claimed_at is null`, `error` = texto exato. Depois, `app.posts_hoje_por_grupo` ainda dá g1 = 4 (a linha de fora não conta) e g2 = 2.
- Bloco 5 (todos de fora + recorrente): post C para `[g1]` → `failed`, `error` = texto exato, `total = 1`, `sent = 0`, `run_id is not null`, `running_since is not null`, uma linha `canceled` com `foraDoTeto` na rodada. Guardar o `run_id` e chamar `app.enqueue_broadcast` de novo no mesmo post (status `failed` é aceito, como no recorrente do dia seguinte) → `run_id` diferente do guardado e uma linha de fora na rodada nova.
- Bloco 6 (aviso ao lotar): g3 recebe 4 posts por `enqueue_broadcast` (4 posts para `[g3]`); preparar g3 para o aviso (campanha com `aviso_ao_lotar`, loja com plano, `lotado_em = now()`, `aviso_lotou_em is null` — molde em `infra/tests/aviso-lotou-sem-estrutura-check.sql`); `public.enviar_avisos_lotou(20)` devolve 0 para esta loja, o broadcast `Aviso ao lotar · …` fica `failed` com o erro do teto e g3 ganha `aviso_lotou_em` (aceito na spec).

- [ ] **Step 2: Rodar o dry-run da Task 1 (Step 4) e ver falhar**

Expected: `FALHOU` no bloco 3 (sem trava no corpo atual).

- [ ] **Step 3: Escrever a seção 2 da migração**

Trava de md5 antes do `create or replace`, no molde de `20261015120000_documento_no_disparo.sql`: aceita `2aa6376d6675983311f5e6d998d89a03` (corpo de 20261015120000, conferido no repo) ou o md5 do corpo desta migração. Corpo novo = o de `20261015120000` copiado inteiro, com estas trocas:

1. `declare`: `v_teto integer := app.posts_por_grupo_dia();`, `cheios text[];`, `saindo integer := 0;`.
2. Logo depois do retorno antecipado de `jids` vazio:
   ```sql
   -- Uma contagem por loja de cada vez: dois posts enfileirados juntos leriam o mesmo "3".
   perform pg_advisory_xact_lock(hashtextextended('posts_por_grupo:' || target_tenant_id::text, 0));
   select coalesce(array_agg(h.jid), '{}') into cheios
   from app.posts_hoje_por_grupo(target_tenant_id) h
   where h.posts >= v_teto and h.jid = any(jids);
   ```
3. No `insert into public.engine_commands`: incluir a coluna `error` e trocar `'queued'` e o `payload` por `case when t.jid = any(cheios) then …`: status `'canceled'`, payload `|| jsonb_build_object('foraDoTeto', true)`, `error` `format('Não enviado: este grupo já recebeu %s posts hoje (limite do anti-ban). Volta à meia-noite.', v_teto)`; os outros `'queued'`, payload e `error` de sempre (`null`). O `returning` passa a devolver `status` para contar `inserted` (todas) e `saindo` (só `queued`).
4. Antes do `update public.broadcasts` final: se `saindo = 0`, update com `run_id = new_run_id`, `status = 'failed'`, `sent = 0`, `total = inserted`, `error = format('Nenhum grupo recebeu: todos já tinham %s posts hoje. O limite volta à meia-noite.', v_teto)`, `dispatched_at = now()`, `running_since = now()`, `last_ack_at = now()`, `updated_at = now()`, `returning * into b; return b;`. Senão, o update de sempre.

Comentário de cabeçalho da seção explicando as quatro trocas. ACL explícito depois.

- [ ] **Step 4: Calcular o md5 do corpo novo e fechar a trava e o bloco 3**

Normalização igual à das migrações anteriores: `prosrc` → tira `--` até o fim da linha → colapsa espaço em um → `btrim`. Script de bolso (scratchpad, `python -I md5body.py <arquivo> app.enqueue_broadcast`):

```python
import re, sys, hashlib
src = open(sys.argv[1], encoding='utf-8').read()
i = src.lower().find('function ' + sys.argv[2].lower())
m = re.search(r'\$(\w*)\$', src[i:]); start = i + m.end(); end = src.index(m.group(0), start)
norm = re.sub(r'\s+', ' ', re.sub(r'--[^\n]*', '', src[start:end])).strip(' ')
print(hashlib.md5(norm.encode()).hexdigest())
```

Calibração: rodado em `20261015120000_documento_no_disparo.sql` tem que dar `2aa6376d6675983311f5e6d998d89a03`. Pôr o md5 novo na trava (segundo valor aceito) e no bloco 3.

- [ ] **Step 5: Rodar o dry-run e ver passar**

Expected: `r = 'ok'`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/supabase/migrations/20261026120000_teto_posts_por_grupo.sql infra/tests/teto-posts-por-grupo-check.sql
git commit -m "feat(antiban): leave groups at the daily cap out of the post"
```

### Task 3: `app.promote_due_schedules` ignora os de fora e avisa o corte inteiro

**Files:**
- Modify: `apps/web/supabase/migrations/20261026120000_teto_posts_por_grupo.sql` (seção 3)
- Modify: `infra/tests/teto-posts-por-grupo-check.sql` (blocos 7–8)

**Interfaces:**
- Consumes: o formato do comando de fora e do post `failed` (Task 2).
- Produces: notificação `teto_posts_grupo` (texto nas Global Constraints).

- [ ] **Step 1: Escrever os blocos 7–8**

A loja precisa de plano (`app.tenant_concede_plano`), como no bloco 6. Agendamento = `insert into public.schedules (tenant_id, broadcast_id, name, scheduled_at, recurrence, status) values (…, now() - interval '1 minute', 'none', 'pending')` (conferir colunas em `postar-por-grupo-check.sql`, que já monta oferta relâmpago); depois `app.promote_due_schedules(50)`.

- Bloco 7 (relâmpago parcial): post para `[g1, g2]` (g1 já em 4) com uma `flash_offers` em `draft` ligada a ele (molde em `postar-por-grupo-check.sql`) → a oferta abre e `flash_offer_groups` dela tem só `teto-g2@g.us`; nenhuma notificação `teto_posts_grupo` para a loja.
- Bloco 8 (agendado cortado inteiro): post de nome `Check teto` para `[g1]` agendado → post `failed`; existe exatamente uma notificação da loja com `type = 'teto_posts_grupo'`, `title = 'Post agendado não saiu'`, `body = 'O post agendado "Check teto" não saiu: todos os grupos já tinham recebido 4 posts hoje. O limite volta à meia-noite.'`, `href = '/painel/disparos'`. Mais o md5 do corpo de `app.promote_due_schedules(integer)` = o desta migração.

- [ ] **Step 2: Rodar o dry-run e ver falhar**

Expected: `FALHOU` no bloco 7 (g1 aparece em `flash_offer_groups`).

- [ ] **Step 3: Escrever a seção 3 da migração**

Trava de md5 aceitando `c1469c7f4fec5085d694da1706023ca9` (corpo de `20261017123000_sem_plano_nao_dispara_sozinho.sql`, conferido no repo com o script da Task 2) ou o desta migração. Corpo novo = o de `20261017123000` com duas trocas:

1. A consulta que monta `v_alvos` ganha `and coalesce(c.payload->>'foraDoTeto', '') <> 'true'`.
2. Logo depois de `v_broadcast := app.enqueue_broadcast(...)`: se `v_broadcast.id is not null and v_broadcast.status = 'failed'` e existe comando da rodada (`origin_kind = 'broadcast'`, `origin_id = s.broadcast_id`, `origin_run_id = v_broadcast.run_id`, `tenant_id = s.tenant_id`) com `payload->>'foraDoTeto' = 'true'`, inserir em `public.notifications (tenant_id, type, title, body, href)` com o `body` montado por `format(…, v_broadcast.name, app.posts_por_grupo_dia())`.

ACL explícito de `app.promote_due_schedules(integer)` depois.

- [ ] **Step 4: Calcular o md5 do corpo novo, fechar a trava e o bloco 8, rodar o dry-run**

Expected: `r = 'ok'`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20261026120000_teto_posts_por_grupo.sql infra/tests/teto-posts-por-grupo-check.sql
git commit -m "feat(antiban): flash offers skip capped groups, notify a fully capped schedule"
```

### Task 4: Estado `fora_do_teto` na entrega por grupo

**Files:**
- Modify: `apps/web/src/lib/stores/broadcast-deliveries.ts`, `apps/web/src/lib/stores/broadcast-deliveries.test.ts`
- Modify: `apps/web/src/lib/painel/entrega.ts`, `apps/web/src/lib/painel/entrega.test.ts`
- Modify: `apps/web/src/app/api/disparos/[id]/grupos/route.ts`
- Modify: `apps/web/src/components/painel/campanhas/detalhe/entrega.tsx` (`ESTADO`, `LegendaDaEntrega`)
- Modify: `apps/web/src/lib/painel/ao-vivo/postando.ts`, `apps/web/src/lib/painel/ao-vivo/postando.test.ts` (`segmentosDaEntrega`)
- Modify: `apps/web/src/components/painel/home/ao-vivo/postando-agora.tsx` (`SEGMENTO`)

**Interfaces:**
- Produces:
  - `EntregaBruta` ganha `fora: string | null` (`payload->>foraDoTeto`).
  - `type EstadoDaEntrega = "entregue" | "postando" | "na_fila" | "falhou" | "cancelado" | "fora_do_teto"`.
  - `estadoDaEntrega(status: string, foraDoTeto?: boolean): EstadoDaEntrega | null` — `fora_do_teto` só quando `status === "canceled"` e a marca vem.
  - `ResumoDaEntrega` ganha `foraDoTeto: number`; `resumoDaEntrega` conta cada estado explicitamente (o `else` que somava tudo em `cancelados` some).

- [ ] **Step 1: Escrever os testes que falham**

```ts
// broadcast-deliveries.test.ts — o teste existente passa a esperar:
assert.equal(url.searchParams.get("select"), "jid:payload->>jid,fora:payload->>foraDoTeto,status,completed_at,failed_at");

// entrega.test.ts
test("a marca de fora do teto só vale para comando cancelado", () => {
  assert.equal(estadoDaEntrega("canceled", true), "fora_do_teto");
  assert.equal(estadoDaEntrega("canceled", false), "cancelado");
  assert.equal(estadoDaEntrega("done", true), "entregue");
});
test("o resumo conta os de fora do teto à parte dos cancelados", () => {
  const g = (estado: EntregaNoGrupo["estado"], i: number): EntregaNoGrupo => ({ grupo: `${i}@g.us`, estado, quando: null });
  const resumo = resumoDaEntrega([g("entregue", 0), g("fora_do_teto", 1), g("fora_do_teto", 2), g("cancelado", 3)]);
  assert.deepEqual(resumo, { entregues: 1, postando: 0, naFila: 0, falharam: 0, cancelados: 1, foraDoTeto: 2, total: 4 });
  assert.equal(aindaSaindo(resumo), false);
});
// postando.test.ts
test("os de fora do teto viram um segmento próprio e só aparecem quando existem", () => {
  const base: ResumoDaEntrega = { entregues: 30, postando: 0, naFila: 0, falharam: 0, cancelados: 1, foraDoTeto: 6, total: 37 };
  assert.deepEqual(segmentosDaEntrega(base).map((s) => s.estado), ["entregue", "cancelado", "fora_do_teto"]);
  assert.deepEqual(segmentosDaEntrega(base).at(-1), { estado: "fora_do_teto", n: 6, texto: "no limite do dia" });
  assert.equal(segmentosDaEntrega({ ...base, foraDoTeto: 0 }).some((s) => s.estado === "fora_do_teto"), false);
});
```

O `deepEqual` do resumo no teste existente (`entrega.test.ts:30`) ganha `foraDoTeto: 0`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace apps/web test` · Expected: FAIL nos testes acima.

- [ ] **Step 3: Implementar**

- Rota de grupos: `estadoDaEntrega(linha.status, linha.fora === "true")`.
- `ESTADO` em `entrega.tsx`: `fora_do_teto: { texto: "limite do dia", classe: "text-slate-600", Icone: CalendarX2 }` (lucide-react, já é dependência). Legenda: `["fora_do_teto", resumo.foraDoTeto, "no limite do dia"]` depois de cancelados.
- `segmentosDaEntrega`: `{ estado: "fora_do_teto", n: r.foraDoTeto, texto: "no limite do dia" }` depois de cancelado.
- `SEGMENTO` em `postando-agora.tsx`: `fora_do_teto: "bg-slate-600/20"`.
- `itemAoVivo` e `visao-geral.tsx` não mudam (o tipo obriga só os `Record`).

- [ ] **Step 4: Rodar testes e os dois tsc**

Expected: tudo verde; os dois `tsc` sem erro (eles pegam qualquer `Record<EstadoDaEntrega, …>` esquecido).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/broadcast-deliveries.ts apps/web/src/lib/stores/broadcast-deliveries.test.ts apps/web/src/lib/painel/entrega.ts apps/web/src/lib/painel/entrega.test.ts "apps/web/src/app/api/disparos/[id]/grupos/route.ts" apps/web/src/components/painel/campanhas/detalhe/entrega.tsx apps/web/src/lib/painel/ao-vivo/postando.ts apps/web/src/lib/painel/ao-vivo/postando.test.ts apps/web/src/components/painel/home/ao-vivo/postando-agora.tsx
git commit -m "feat(painel): show groups left out by the daily cap in the delivery"
```

### Task 5: A rota de postar responde 422 quando o post não sai

**Files:**
- Modify: `apps/web/src/app/api/campanhas/[slug]/messages/route.ts` (fim do `POST`, depois de `enqueueBroadcast`)
- Test: `apps/web/src/app/api/campanhas/[slug]/messages/route.test.ts`

**Interfaces:**
- Consumes: `broadcastsStore.enqueueBroadcast(tenantId, id): Promise<Broadcast | null>` (sem mudança).
- Produces: `POST /api/campanhas/[slug]/messages` "enviar agora" → `422 { error: <broadcasts.error> }` quando o fan-out volta `status = 'failed'` (fallback `"O post não saiu."` se `error` vier nulo). Agendado continua `201`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
test("post que o banco devolve failed (todos no limite do dia) responde 422 com o motivo e não marca ativação", async () => {
  chamadas.length = 0;
  const motivo = "Nenhum grupo recebeu: todos já tinham 4 posts hoje. O limite volta à meia-noite.";
  responder = gravando({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }),
    [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "fila", true)] }),
    "POST /rest/v1/rpc/enqueue_broadcast": () => ({ status: 200, corpo: { id: "bc-1", status: "failed", error: motivo, sent: 0, total: 1 } }),
  });
  const res = await postar({ body: "oferta" });
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: motivo });
  assert.equal(feitas("POST", "/rest/v1/funnel_events").length, 0);
});
```

(Os testes existentes seguem `201`: no `gravando` o RPC devolve `null`.)

- [ ] **Step 2: Rodar e ver falhar** — Expected: status 201 em vez de 422.

- [ ] **Step 3: Implementar** — o retorno 422 entra antes do `trackFunnelEvent` de `first_dispatch`. Conferir os chamadores do POST (`folha-postar.tsx`, `painel/disparos/page.tsx`, `messages-tab.tsx`, `funnel-confirm.ts`): os três primeiros já mostram `body.error` quando `!res.ok`; o funil só agenda (não é afetado). Nenhum muda.

- [ ] **Step 4: Rodar testes e os dois tsc** — Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/campanhas/[slug]/messages/route.ts" "apps/web/src/app/api/campanhas/[slug]/messages/route.test.ts"
git commit -m "fix(postar): answer 422 with the reason when the post does not go out"
```

### Task 6: Fechamento do PR 1

- [ ] **Step 1: Card** — criar em prod o card `teto-posts-por-grupo` em `em_construcao`, do mesmo jeito que o PR 1 do postar por grupo criou o dele (spec do quadro `docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md`). Escrita em prod: se o classificador recusar, entra na lista de comandos do Igor no fim.
- [ ] **Step 2: Gate local** — os quatro comandos das Global Constraints verdes.
- [ ] **Step 3: Push + PR** — `git push -u origin feat/teto-posts-banco`; `gh pr create --base main --title "feat(antiban): cap posts per group per day (teto, PR 1)"`, corpo com resumo, a spec, o plano de teste (conferência SQL em dev e prod) e `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. O `migrate-dev` aplica em dev.
- [ ] **Step 4: Conferência em dev** — rodar `infra/tests/teto-posts-por-grupo-check.sql` em dev (como na Task 1, Step 2). Expected: `r = 'ok'`.
- [ ] **Step 5: Baseline** — `npm run schema:baseline` com `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de **dev**, commit `chore(schema): baseline with posts_hoje_por_grupo (dev = prod + this PR)`, push. O `drift` fica verde.
- [ ] **Step 6: CI verde → merge** — `gh pr checks <N>` e, com tudo verde, `gh pr merge <N> --squash --delete-branch` (a `main` não tem proteção: merge à mão no verde, nunca auto-merge). O `migrate-prod` aplica em prod.
- [ ] **Step 7: Conferência em prod** — mesma do Step 4 com `nidoatbxaylrkcgbszns` (o Igor roda ou dá o ok no chat). Depois `select public.move_card('teto-posts-por-grupo', 'no_ar_nao_verificado', 'PR 1 no ar: teto aplicado no banco, conferência ok em prod', 'PR #<N>');`.

---

## PR 2 — linha no compositor

Branch `feat/teto-posts-compositor`, worktree novo a partir de `origin/main` **depois** do merge do PR 1 (o wrapper `public.posts_hoje_por_grupo` precisa existir em prod).

### Task 7: `GET /api/groups/posts-hoje`

**Files:**
- Create: `apps/web/src/lib/painel/posts-hoje.ts` (só o tipo, nesta task)
- Create: `apps/web/src/lib/stores/posts-hoje.ts`, `apps/web/src/lib/stores/posts-hoje.test.ts`
- Create: `apps/web/src/app/api/groups/posts-hoje/route.ts`, `apps/web/src/app/api/groups/posts-hoje/route.test.ts`
- Modify: `apps/web/system/API_CONTRACTS.md` (seção nova no fim)

**Interfaces:**
- Produces:
  - `export type PostsHoje = { teto: number; grupos: Readonly<Record<string, number>> }` em `lib/painel/posts-hoje.ts` (sem `server-only`, o cliente importa).
  - `lerPostsHoje(tenantId: string): Promise<PostsHoje>` em `lib/stores/posts-hoje.ts` (`server-only`): `rpc("posts_hoje_por_grupo", { p_tenant: tenantId })`; lança se o RPC falhar ou se a resposta não tiver `teto` inteiro > 0 e `grupos` objeto de inteiros ≥ 0.
  - `GET /api/groups/posts-hoje` → `200 PostsHoje`; `501 { error: "A contagem de posts de hoje precisa do banco." }` sem `USE_SUPABASE`; `403` sem `message:send`; `500 { error: "Não deu para ler os posts de hoje." }` se a leitura falhar.

- [ ] **Step 1: Escrever os testes que falham**

Store (PostgREST falso no molde de `broadcast-deliveries.test.ts`):
- `"lê a contagem da loja pelo RPC e devolve teto e grupos"`: o pedido é `POST /rest/v1/rpc/posts_hoje_por_grupo` com corpo `{ "p_tenant": "loja-a" }`; resposta `{ teto: 4, grupos: { "1@g.us": 3 } }` volta igual.
- `"resposta fora do formato lança em vez de virar contagem zero"`: `{ teto: "4", grupos: {} }` e `{ teto: 4, grupos: { "1@g.us": -1 } }` → `assert.rejects`.

Rota (harness de `campanhas/[slug]/messages/route.test.ts`: PostgREST falso + login por Bearer):
- `"quem posta lê a contagem da própria loja"`: 200, corpo igual ao do RPC, RPC chamado com o tenant da sessão (inclui a vendedora com o módulo de postar).
- `"papel sem permissão de postar recebe 403"`.

- [ ] **Step 2: Rodar e ver falhar** — Expected: módulos ausentes.

- [ ] **Step 3: Implementar** — rota: `getRouteTenantContext(req, { allowEngine: false })` e `assertCampaignOperator(ctx.role, "message:send")` como na rota de postar; `export const runtime = "nodejs"`, `dynamic = "force-dynamic"`; `catch` repassa `instanceof Response`. Contrato em `API_CONTRACTS.md` no formato das seções vizinhas: rota, permissão, corpo, erros, "o teto vem do banco; a tela nunca guarda o número".

- [ ] **Step 4: Rodar testes e os dois tsc** — Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/painel/posts-hoje.ts apps/web/src/lib/stores/posts-hoje.ts apps/web/src/lib/stores/posts-hoje.test.ts apps/web/src/app/api/groups/posts-hoje apps/web/system/API_CONTRACTS.md
git commit -m "feat(api): read today's post count per group"
```

### Task 8: A frase da linha

**Files:**
- Modify: `apps/web/src/lib/painel/posts-hoje.ts`
- Create: `apps/web/src/lib/painel/posts-hoje.test.ts`

**Interfaces:**
- Consumes: `PostsHoje` (Task 7).
- Produces: `type TomDaLinha = "info" | "aviso" | "erro"`; `type LinhaDosPostsHoje = { texto: string; tom: TomDaLinha }`; `linhaDosPostsHoje(dados: PostsHoje, grupos: readonly string[]): LinhaDosPostsHoje | null`. Grupo ausente em `dados.grupos` conta 0; `n = grupos.length`; `k` = grupos com contagem ≥ `teto`; `max` = maior contagem.

- [ ] **Step 1: Escrever os testes que falham**

```ts
const dados = (grupos: Record<string, number>): PostsHoje => ({ teto: 4, grupos });
test("sem grupos escolhidos ou sem post hoje, nenhuma linha", () => {
  assert.equal(linhaDosPostsHoje(dados({ "a": 4 }), []), null);
  assert.equal(linhaDosPostsHoje(dados({}), ["a", "b"]), null);
});
test("abaixo do teto mostra o maior número", () => {
  assert.deepEqual(linhaDosPostsHoje(dados({ "a": 1, "b": 3 }), ["a", "b", "c"]),
    { texto: "Hoje: até 3 de 4 posts nestes grupos.", tom: "info" });
});
test("alguns no teto avisam quantos ficam de fora", () => {
  assert.deepEqual(linhaDosPostsHoje(dados({ "a": 4, "b": 5, "c": 2 }), ["a", "b", "c"]),
    { texto: "2 de 3 grupos já receberam 4 posts hoje e vão ficar de fora.", tom: "aviso" });
});
test("todos no teto dizem que o post não vai sair", () => {
  assert.deepEqual(linhaDosPostsHoje(dados({ "a": 4, "b": 4 }), ["a", "b"]),
    { texto: "Todos estes grupos já receberam 4 posts hoje. O post não vai sair; o limite volta à meia-noite.", tom: "erro" });
});
test("o teto vem dos dados, não do código", () => {
  assert.equal(linhaDosPostsHoje({ teto: 2, grupos: { "a": 2 } }, ["a", "b"])?.texto,
    "1 de 2 grupos já receberam 2 posts hoje e vão ficar de fora.");
});
```

- [ ] **Step 2: Rodar e ver falhar** · **Step 3: Implementar** · **Step 4: Rodar e ver passar**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/painel/posts-hoje.ts apps/web/src/lib/painel/posts-hoje.test.ts
git commit -m "feat(painel): sentence for today's posts in the chosen groups"
```

### Task 9: A linha nos três compositores

**Files:**
- Create: `apps/web/src/components/painel/messages/linha-posts-hoje.tsx`
- Modify: `apps/web/src/components/painel/messages/message-composer.tsx` (prop nova)
- Modify: `apps/web/src/components/painel/folha-postar.tsx`, `apps/web/src/components/painel/messages/messages-tab.tsx`, `apps/web/src/components/painel/disparos/vitrine/disparos-vitrine.tsx`
- Test: `apps/web/e2e/painel-vitrine-disparos.spec.ts`

**Interfaces:**
- Consumes: `GET /api/groups/posts-hoje` (Task 7), `linhaDosPostsHoje` (Task 8), `selecionados(grupos, destino)` de `lib/campaigns/destino-ui.ts`.
- Produces:
  - `usePostsHoje(): { dados: PostsHoje | null; reler: () => void }` — lê ao montar e a cada `reler()`; resposta não-ok, erro de rede ou formato inválido → `dados = null` (sem linha; o banco decide no envio).
  - `LinhaPostsHoje({ dados, grupos }: { dados: PostsHoje | null; grupos: readonly string[] })` — `null` quando não há frase; senão `<p role="status">` com a frase; tom `info` → `text-slate-600`, `aviso` → `text-alerta`, `erro` → `text-danger-700` (conferir os tokens em `globals.css`).
  - `MessageComposer` ganha `aviso?: React.ReactNode`, renderizado logo acima da linha do botão de enviar. O botão nunca é desabilitado por causa da linha.

- [ ] **Step 1: Escrever o e2e que falha**

Em `painel-vitrine-disparos.spec.ts`, no mesmo molde em que o spec já simula `/grupos/estados` e `/api/groups` (d29056a0): simular `/api/groups/posts-hoje`.
- `"grupos no limite do dia aparecem antes de postar"`: dois dos grupos simulados com 4 → `getByText("2 de <n> grupos já receberam 4 posts hoje e vão ficar de fora.")` visível e o botão de postar habilitado.
- `"todos no limite: avisa que o post não vai sair"`: todos com 4 → texto do caso `erro` visível, botão habilitado.
- `"contagem fora do ar não mostra linha nem trava o botão"`: rota respondendo 500 → nenhum texto com "posts hoje", botão habilitado.

- [ ] **Step 2: Rodar e ver falhar** — `npm --workspace apps/web run e2e -- painel-vitrine-disparos.spec.ts` (precisa das credenciais de e2e; sem elas, o CI roda no PR e a falha aparece lá). Expected: textos ausentes.

- [ ] **Step 3: Implementar e ligar** — cada compositor chama `usePostsHoje()`, calcula `grupos` com `selecionados(estados.grupos, destino)` só quando `estados.carga === "pronto"` (senão `[]`; a vitrine já tem `doDestino`) e passa `aviso={<LinhaPostsHoje dados={...} grupos={...} />}` ao `MessageComposer`. Depois de post aceito, `reler()` na aba Posts e na vitrine (a folha fecha; ao reabrir, monta e lê de novo).

- [ ] **Step 4: Rodar testes, os dois tsc, lint e o e2e** — Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/painel/messages/linha-posts-hoje.tsx apps/web/src/components/painel/messages/message-composer.tsx apps/web/src/components/painel/folha-postar.tsx apps/web/src/components/painel/messages/messages-tab.tsx apps/web/src/components/painel/disparos/vitrine/disparos-vitrine.tsx apps/web/e2e/painel-vitrine-disparos.spec.ts
git commit -m "feat(painel): warn before posting when groups hit today's limit"
```

### Task 10: Fechamento do PR 2 e verificação

- [ ] **Step 1:** gate local → push → `gh pr create` (título `feat(painel): today's post count in the composer (teto, PR 2)`) → CI verde → merge à mão → deploy da Vercel ok.
- [ ] **Step 2: Prova em prod (só com dado real, nunca fabricado):** no primeiro dia em que um grupo de cliente chegar em 4, colher (a) a linha do compositor com o aviso, (b) a célula "limite do dia" na tabela do post, (c) por SQL: nenhum grupo-dia com mais de 4 comandos `done` desde o merge do PR 1 (consulta de `posts-por-grupo-dia.sql`, filtrada por `created_at >= <merge>`). Com as três, `move_card('teto-posts-por-grupo', 'no_ar_verificado', …, '<prova>')`.
- [ ] **Step 3:** memória do projeto (nota da feature) e `kg_insert_text` com a decisão (teto 4, regra no banco, linha de fora `canceled` + `foraDoTeto`).
- [ ] **Step 4:** ao encerrar, reportar "PRs que deixei abertos: …".

---

## Decisões deste plano (além das da spec)

- **Rótulo "limite do dia" no lugar de "Já tinha 4 hoje":** a spec manda o TypeScript nunca guardar o 4 e, ao mesmo tempo, fixa um rótulo com o 4 no histórico. O número continua visível onde vem do banco (o `error` do comando e a linha do compositor, que recebe o teto do servidor).
- **Índice parcial** `engine_commands_posts_dia_idx (tenant_id, created_at)` para os envios: a contagem roda a cada post enfileirado e a cada abertura do compositor.
- **Conferência em transação desfeita antes do push**, porque o `migrate-dev` não reaplica um arquivo editado.
- **Sem teste de integração em TS** para a regra: a conferência SQL cobre o banco (mesmo padrão do #525), e os testes TS cobrem só o que o TS faz.
- **Notificação com `type = 'teto_posts_grupo'`**: `public.notifications` não restringe o tipo (o #525 gravou `antiban_saidas` do mesmo jeito).
