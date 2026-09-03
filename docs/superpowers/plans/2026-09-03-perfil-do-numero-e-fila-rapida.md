# Perfil do número e fila rápida — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tirar o lojista da fila sem soltar o anti-ban — perfil do número (novo × veterano) com tetos proporcionais aos grupos, leituras fora da cadência de escrita, e um worker que não roda tudo em série.

**Architecture:** o teto vive numa função só (`app.instance_caps`) que o claim e a tela de saúde consomem; a declaração do lojista entra em `instances.numero_perfil` e só rebaixa; o worker vira três loops independentes e o lote deixa de bloquear o tick na chamada à Evolution; `check_invite` e o backfill de convite passam a correr no ritmo do lote.

**Tech Stack:** Postgres/Supabase (plpgsql, RPCs `security definer`), Next.js 15 em `apps/web` (TypeScript strict, `@/` alias, testes com `tsx --test`), worker Node em `apps/worker` (ESM, `node --test` via `npm test`), Evolution API 2.3.7.

**Spec:** `docs/superpowers/specs/2026-09-03-perfil-do-numero-e-fila-rapida-design.md` — a spec é a autoridade; este plano é o argumento dela.

## Restrições globais (valores exatos, valem para toda tarefa)

- Perfis: `'novo'` | `'veterano'`. Declaração em `instances.numero_perfil`: `'novo'` | `'antigo'` | `null`.
- Composição do perfil, nesta ordem: graduou → veterano; declarou `novo` → novo; declarou `antigo` **ou** `admin_groups >= 5` → veterano; senão novo.
- `admin_groups` = `count(*) from groups where tenant_id = <tenant da instância> and is_admin and members >= 10`.
- Veterano: `per_min = 10`, `per_hour = least(400, greatest(60, admin_groups * 3))`, `per_day = least(1500, greatest(300, admin_groups * 15))`.
- Novo: `rampa = round(40 * power(1.6, dia))`, `per_min = 8`, `per_hour = least(150, greatest(40, rampa))`, `per_day = least(800, greatest(40, admin_groups * 6), rampa)`. `dia = floor(epoch(now - warmup_started_at) / 86400)`, 0 sem estado. Gradua quando `dia >= 7`.
- Reset do warm-up: `interval '14 days'`, só quando `not warmup_graduated`.
- Rate-limit (`status 429` **ou** detalhe contém `rate-overlimit`): `paused_until = now() + interval '30 minutes'`.
- Inalterados: gap `3 + ((random()+random())/2)*4` s, breaker `5 falhas → 60 s`, `failed` terminal no lote, nunca DM (`@g.us` only).
- Lote: tick 4 s, **1 claim por tenant por tick**, execução sem bloquear o tick, tenants em `Promise.allSettled`.
- Envio: `WORKER_SEND_POLL_MS` default `1000`, mínimo `250`.
- `check_invite`: sem janela de 60 s; `LEITURAS_POR_MINUTO = 15`.
- Toda migração: aplicada nos DOIS bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`), registrada em `deploy/supabase/apply-order.txt`, e `deploy/supabase/schema-baseline.json` atualizado quando muda coluna. Funções `security definer` sempre com `set search_path`; drop+create sempre seguido de `revoke ... from public, anon, authenticated; grant execute ... to service_role`.
- Stores Supabase: **toda** query filtra `.eq("tenant_id", ...)`.
- Commits em inglês com prefixo semântico; código em inglês, copy e comentários em português como o resto do repo.
- Antes de push: `.\verify-local.ps1` na raiz do worktree (cobre lint, os dois `tsc`, scan de secrets e build). `tsx --test` e lint **não** checam tipo — os dois `tsc` são obrigatórios.

---

## Como abrir a sessão de execução (Sonnet 5 como controlador)

As 4 decisões da spec foram aprovadas em 03/09/2026. A sessão de execução roda com o **Sonnet 5 como modelo principal**. Este plano foi escrito para isso: toda decisão de desenho já está tomada e todo código já está no texto. O controlador não decide desenho; ele despacha, confere, commita e fecha.

**Prompt de abertura (colar como primeira mensagem da sessão nova):**

```
Execute o plano docs/superpowers/plans/2026-09-03-perfil-do-numero-e-fila-rapida.md
com a skill superpowers:subagent-driven-development. A spec
docs/superpowers/specs/2026-09-03-perfil-do-numero-e-fila-rapida-design.md está
APROVADA (D1, D2, D7, D8) — não reabra decisões de desenho. Você é o controlador:
não escreve código, despacha um subagente por tarefa com o modelo marcado em
`Modelo:`, revisa cada diff com o modelo marcado em `Reviewer:`, commita por tarefa
e fecha PR. Comece pela seção "Como abrir a sessão de execução" do plano e siga
os 10 guardrails dela. Onda 1 = PRs A, B e C em três worktrees a partir de
origin/main. Nada no checkout principal.
```

**Guardrails que o controlador segue à letra (não há margem para "melhorar" o plano em execução):**

1. **Ler a spec e o plano inteiros uma vez**, criar o ledger (`.superpowers/sdd/<plano>/progress.md`) e um todo por tarefa antes do primeiro despacho. Depois, ler só o brief da tarefa da vez.
2. **Checkout principal é intocável.** `git status` nele mostra ~823 arquivos de `apps/web` apagados. Não restaurar, não commitar, não criar branch lá. Cada PR nasce com `git -C C:/Users/Igor/Desktop/HubFlow-platform worktree add ../girumo-pr-<letra> -b <branch> origin/main` seguido de `npm install` dentro do worktree. A spec e este plano estão **sem commit** no checkout principal: copiá-los para o worktree do PR A (`docs/superpowers/specs/` e `docs/superpowers/plans/`) e incluí-los no primeiro commit de A1 — é assim que eles chegam em `main`.
3. **Modelos:** implementador = `sonnet` em toda tarefa; reviewer = `sonnet` onde o plano diz `sonnet`, e **`opus`** onde diz "opus ou Fable" (A1, B1, C1, C2). O review final de cada branch usa `opus`. O controlador não faz review no lugar do subagente.
4. **Se um implementador desviar do código do plano**, o reviewer aponta e o controlador manda corrigir para o texto do plano. A única exceção aceitável é erro de compilação no código do plano: aí o implementador conserta o mínimo, explica no relatório, e o controlador registra `Ruling:` no ledger com o diff do que mudou.
5. **Cinco rodadas de fix por tarefa, no máximo.** Na 4ª e 5ª, implementador vira `opus`. Na 5ª ainda aberta, parar aquele PR e escrever no ledger o que está travando, sem improvisar.
6. **DDL é do Igor.** Quando a tarefa tiver `npx supabase db query --linked -f ...`, o controlador cola o comando na conversa e espera a confirmação "aplicado" antes de rodar os asserts. Nunca tentar `apply_migration` pelo MCP nem SQL DDL pelo `execute_sql` — o classificador bloqueia e o erro parece bug.
7. **Commit só depois de `git -C <worktree> diff --cached --stat` numa chamada separada**, conferindo que só entram os arquivos da tarefa. Nunca `git add -A`. Mensagem é a que está no passo "Controlador commita".
8. **Antes de cada push:** `.\verify-local.ps1` na raiz do worktree, verde. Depois `gh pr create`, `gh pr checks <n> --watch`, `gh pr merge <n> --squash --delete-branch`. CI vermelho não se contorna: volta para a tarefa.
9. **Ordem entre PRs:** A1 aplicada em PROD antes do redeploy do worker (C4). D só começa com A mergeado. C3 depende de A1 em DEV.
10. **Fechar a sessão** com: lista de "Rulings I made", PRs abertos (motivo), o `move_card` do quadro em prod, e o comando `rag insert` pronto. Se algo ficou pela metade, dizer o quê e por quê; não deixar PR em draft "pra depois".

## Protocolo de orquestração — controlador despacha, Sonnet implementa

O controlador não escreve código: despacha, revisa, commita e fecha PR. Os implementadores são subagentes `Agent` com `model: "sonnet"`. A qualidade não cai porque:

1. **Cada tarefa abaixo traz o código.** O implementador transcreve e testa; não decide desenho. Quando um passo diz "leia X e adapte", o que adaptar está dito.
2. **Uma tarefa = um brief.** O controlador extrai a tarefa com `scripts/task-brief PLAN_FILE N` (skill subagent-driven-development) e despacha com: (a) uma linha de onde a tarefa cabe, (b) o caminho do brief, (c) as interfaces das tarefas anteriores que o brief não conhece, (d) o caminho do arquivo de relatório. Nunca o plano inteiro.
3. **Implementador não commita** (regra de `parallel-subagent-driven-development.md`): deixa a árvore suja e devolve a lista de arquivos tocados. O controlador confere `git diff --cached` numa chamada separada (`finding-indice-sujo-quase-reverteu-feature`) e commita por tarefa.
4. **Review por tarefa em dois tempos**, com o pacote `scripts/review-package PLAN_FILE BASE HEAD`: conformidade com o brief + qualidade. Reviewer `sonnet` para diff pequeno; `opus` ou o próprio Fable para as tarefas de SQL (A1, B1) e do loop do worker (C1, C2) — são as que têm concorrência e ACL.
5. **Review final da branch** antes do PR: modelo mais capaz disponível, com o pacote `MERGE_BASE..HEAD` e a lista de "minors adiados" do ledger.
6. **Ledger** em `.superpowers/sdd/<plano>/progress.md` desde o primeiro despacho. Sobrevive a compaction; o controlador retoma dali, nunca da memória.
7. **Modelos por tarefa** estão marcados em cada tarefa (`Modelo:`). Quem despachar com modelo diferente do marcado registra o motivo no ledger.

### Ondas e worktrees

Cada PR nasce em worktree próprio a partir de `origin/main` (nunca `checkout -b` no checkout principal — o HEAD é compartilhado com outras sessões, e o principal está com `apps/web` apagado do disco):

```bash
git -C C:/Users/Igor/Desktop/HubFlow-platform fetch origin main
git -C C:/Users/Igor/Desktop/HubFlow-platform worktree add ../girumo-pr-a -b feat/perfil-do-numero origin/main
```

Depois `npm install` dentro do worktree (`finding-worktree-node-modules-junction`: não reutilizar junction do principal). Usar sempre `git -C <worktree>` e caminhos absolutos — o cwd do Bash reseta entre chamadas.

| Onda | PRs em paralelo | Por quê pode |
|---|---|---|
| 1 | **A** (SQL perfil + tipos web), **B** (leituras), **C** (worker) | `Files:` disjuntos: A toca migração nova + `instance-health.ts` + `api/instances`; B toca migração nova + `invite-*` + sync + cron; C só `apps/worker`. Sem `Depends-on` entre eles. |
| 2 | **D** (UI) | Depende de A mergeado (colunas novas de `instance_health`). |

Dentro de cada PR as tarefas são seriais (compartilham arquivos), salvo onde marcado.

### O que só o Igor faz

- **Aplicar DDL** nos dois bancos (o classificador bloqueia DDL vindo do agente — `finding-classificador-bloqueia-merge-e-ddl`). O plano entrega o comando pronto em cada tarefa de migração.
- **Aprovar as 4 decisões ⚠️ da spec** antes da onda 1 (D1 declaração só rebaixa; D2 tetos; D7 rollout; D8 telas).

### Fechamento de cada PR (controlador)

```bash
gh pr create --title "<tipo>: <resumo>" --body-file <worktree>/.superpowers/pr-body.md
gh pr checks <n> --watch
gh pr merge <n> --squash --delete-branch
```

Depois do merge: mover o card no quadro em prod (`select public.move_card('<key>', 'no_ar_nao_verificado', '<motivo>', 'PR #<n>')`; listar `key`s com `select key, title from public.board_features order by key` e criar o card `anti-ban-perfil-numero` se não existir), e registrar no grafo com `rag insert` quando ele voltar.

---

## PR A — Perfil do número e tetos proporcionais (SQL + tipos web)

Branch `feat/perfil-do-numero`. Arquivos: 1 migração nova, `deploy/supabase/{apply-order.txt,schema-baseline.json}`, `apps/web/src/lib/instance-health.ts` (+ test), `apps/web/src/app/api/instances/route.ts` (+ test). ≤ 8 arquivos.

### Task A1: migração `perfil_do_numero_e_caps`

**Modelo:** sonnet (transcrição) · **Reviewer:** opus ou Fable (ACL, `for update of`).
**Files:**
- Create: `apps/web/supabase/migrations/20260904100000_perfil_do_numero_e_caps.sql`
**Depends-on:** none
**Interfaces:**
- Produces: `app.instance_caps(uuid) returns table(perfil text, per_min int, per_hour int, per_day int, admin_groups int, warmup_day int, graduated boolean)`; `public.instance_health(uuid)` com colunas novas `perfil, per_hour, per_min, admin_groups`; `public.record_send_failure(uuid, uuid, boolean default false)`.

- [ ] **Step 1: escrever a migração exatamente assim**

```sql
-- Perfil do número (novo × veterano) e tetos proporcionais à base de grupos.
--
-- POR QUE: o warm-up de 20/dia com reset a cada 72 h e os caps 8/120/800 vieram
-- do motor de DM. Aplicados a post em grupo, prendem número veterano no dia 1-2
-- (medido em 03/09: 13 send_media esperaram 13-21 h). Spec:
-- docs/superpowers/specs/2026-09-03-perfil-do-numero-e-fila-rapida-design.md
--
-- O gap 3-7 s, o breaker e o claim de 1 comando por número NÃO mudam.
-- Aplicar nos DOIS bancos. `numero_perfil` entra no schema-baseline; o corpo
-- das funções não entra no hash do gate de drift — conferir com pg_get_functiondef.

begin;

-- 1) Declaração do lojista ao conectar. null = instância anterior a esta
--    migração; a evidência (grupos admin) decide. A declaração só rebaixa.
alter table public.instances add column if not exists numero_perfil text;
alter table public.instances drop constraint if exists instances_numero_perfil_check;
alter table public.instances add constraint instances_numero_perfil_check
  check (numero_perfil is null or numero_perfil in ('novo', 'antigo'));
comment on column public.instances.numero_perfil is
  'Declarado ao conectar: novo (<30 dias) ou antigo. null = pré-existente, evidência decide. Só rebaixa: novo vence evidência; graduação vence declaração.';

-- 2) A ÚNICA fonte dos tetos. Claim e tela de saúde leem daqui.
create or replace function app.instance_caps(target_instance_id uuid)
returns table (
  perfil       text,
  per_min      integer,
  per_hour     integer,
  per_day      integer,
  admin_groups integer,
  warmup_day   integer,
  graduated    boolean
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_declared  text;
  v_tenant    uuid;
  v_groups    integer := 0;
  v_graduated boolean := false;
  v_started   timestamptz;
  v_day       integer := 0;
  v_ramp      integer;
begin
  select i.numero_perfil, i.tenant_id into v_declared, v_tenant
    from public.instances i
   where i.id = target_instance_id;

  if v_tenant is not null then
    -- Evidência: grupos que o número administra com gente de verdade.
    select count(*)::int into v_groups
      from public.groups g
     where g.tenant_id = v_tenant and g.is_admin and g.members >= 10;

    select coalesce(s.warmup_graduated, false), s.warmup_started_at
      into v_graduated, v_started
      from public.instance_send_state s
     where s.instance_id = target_instance_id;
    v_graduated := coalesce(v_graduated, false);

    if v_started is not null then
      v_day := floor(extract(epoch from now() - v_started) / 86400)::int;
    end if;
    if v_day >= 7 then
      v_graduated := true;
    end if;
  end if;

  if v_graduated
     or (v_declared is distinct from 'novo' and (v_declared = 'antigo' or v_groups >= 5)) then
    return query select
      'veterano'::text,
      10,
      least(400, greatest(60, v_groups * 3)),
      least(1500, greatest(300, v_groups * 15)),
      v_groups,
      v_day + 1,
      true;
    return;
  end if;

  -- Novo: rampa de 7 dias (40, 64, 102, 164, 262, 419, 671), limitada pelos grupos.
  v_ramp := round(40 * power(1.6, v_day))::int;
  return query select
    'novo'::text,
    8,
    least(150, greatest(40, v_ramp)),
    least(800, greatest(40, v_groups * 6), v_ramp),
    v_groups,
    v_day + 1,
    false;
end;
$$;

revoke all on function app.instance_caps(uuid) from public, anon, authenticated;
grant execute on function app.instance_caps(uuid) to service_role;

-- 3) Wrapper: quem já chamava instance_daily_cap continua funcionando.
create or replace function app.instance_daily_cap(target_instance_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, app
as $$
  select c.per_day from app.instance_caps(target_instance_id) c;
$$;

-- 4) Claim de envio: mesmos predicados, tetos vindos de instance_caps.
--    `for update of cand`: a função na cláusula FROM não é lockável.
create or replace function app.claim_send_commands(
  max_commands integer default 5,
  p_tenant uuid default null
)
returns setof engine_commands
language plpgsql
security definer
set search_path to 'public', 'app'
as $function$
begin
  return query
  update public.engine_commands c
  set
    status = 'processing',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now()
  where c.id in (
    select cand.id
    from public.engine_commands cand
    cross join lateral app.instance_caps(cand.instance_id) caps
    where cand.status = 'queued'
      and (p_tenant is null or cand.tenant_id = p_tenant)
      and cand.type in ('send_message', 'send_media', 'send_poll')
      and cand.available_at <= now()
      and cand.instance_id is not null
      and not exists (
        select 1 from public.instance_send_state s
        where s.instance_id = cand.instance_id
          and s.paused_until is not null
          and s.paused_until > now()
      )
      and coalesce(
        (select s.next_send_allowed_at from public.instance_send_state s where s.instance_id = cand.instance_id),
        now()
      ) <= now()
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 minute') < caps.per_min
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 hour') < caps.per_hour
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 day') < caps.per_day
      and cand.id = (
        select best.id
        from public.engine_commands best
        where best.status = 'queued'
          and (p_tenant is null or best.tenant_id = p_tenant)
          and best.type in ('send_message', 'send_media', 'send_poll')
          and best.available_at <= now()
          and best.instance_id = cand.instance_id
        order by best.priority asc, best.created_at asc, best.id asc
        limit 1
      )
    order by cand.priority asc, cand.created_at asc, cand.id asc
    limit greatest(max_commands, 1)
    for update of cand skip locked
  )
  returning c.*;
end;
$function$;

-- 5) record_send: reset do warm-up em 14 dias (era 72 h), só para quem não graduou.
create or replace function app.record_send(target_instance_id uuid, target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.instance_send_state (
    instance_id, tenant_id, warmup_started_at, last_active_at, next_send_allowed_at
  )
  values (
    target_instance_id, target_tenant_id, now(), now(),
    now() + make_interval(secs => 3 + ((random() + random()) / 2) * 4)
  )
  on conflict (instance_id) do update set
    warmup_started_at = case
      when not instance_send_state.warmup_graduated
        and now() - instance_send_state.last_active_at >= interval '14 days'
      then now()
      else instance_send_state.warmup_started_at
    end,
    warmup_graduated = case
      when not instance_send_state.warmup_graduated
        and now() - instance_send_state.last_active_at >= interval '14 days'
      then false
      when floor(extract(epoch from now() - instance_send_state.warmup_started_at) / 86400) >= 7
      then true
      else instance_send_state.warmup_graduated
    end,
    last_active_at = now(),
    consecutive_failures = 0,
    paused_until = null,
    next_send_allowed_at = now() + make_interval(secs => 3 + ((random() + random()) / 2) * 4),
    updated_at = now();

  insert into public.instance_sends (instance_id) values (target_instance_id);
end;
$$;

-- 6) record_send_failure ganha rate_limited. Parâmetro novo = sobrecarga, então
--    drop antes do create (ver 20260831160000_claim_por_tenant.sql).
drop function if exists public.record_send_failure(uuid, uuid);
drop function if exists app.record_send_failure(uuid, uuid);

create function app.record_send_failure(
  target_instance_id uuid,
  target_tenant_id uuid,
  rate_limited boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.instance_send_state (instance_id, tenant_id, consecutive_failures, paused_until)
  values (
    target_instance_id, target_tenant_id, 1,
    case when rate_limited then now() + interval '30 minutes' end
  )
  on conflict (instance_id) do update set
    consecutive_failures = instance_send_state.consecutive_failures + 1,
    paused_until = case
      when rate_limited then now() + interval '30 minutes'
      when instance_send_state.consecutive_failures + 1 >= 5 then now() + interval '60 seconds'
      else instance_send_state.paused_until
    end,
    updated_at = now();
end;
$$;

create function public.record_send_failure(
  target_instance_id uuid,
  target_tenant_id uuid,
  rate_limited boolean default false
)
returns void
language sql
security definer
set search_path = public, app
as $$
  select app.record_send_failure(target_instance_id, target_tenant_id, rate_limited);
$$;

revoke all on function public.record_send_failure(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_send_failure(uuid, uuid, boolean) to service_role;

-- 7) instance_health com perfil e tetos. Tipo de retorno muda → drop + create.
drop function if exists public.instance_health(uuid);
drop function if exists app.instance_health(uuid);

create function app.instance_health(target_tenant_id uuid)
returns table (
  instance_id          uuid,
  phone                text,
  status               text,
  connected_at         timestamptz,
  warmup_day           integer,
  warmup_graduated     boolean,
  daily_cap            integer,
  sent_24h             integer,
  sent_1h              integer,
  sent_1m              integer,
  next_send_allowed_at timestamptz,
  paused_until         timestamptz,
  consecutive_failures integer,
  failures_24h         integer,
  last_active_at       timestamptz,
  last_event_at        timestamptz,
  perfil               text,
  per_hour             integer,
  per_min              integer,
  admin_groups         integer
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    i.id,
    i.phone,
    i.status::text,
    i.connected_at,
    caps.warmup_day,
    caps.graduated,
    caps.per_day,
    (select count(*) from public.instance_sends x
      where x.instance_id = i.id and x.sent_at > now() - interval '1 day')::int,
    (select count(*) from public.instance_sends x
      where x.instance_id = i.id and x.sent_at > now() - interval '1 hour')::int,
    (select count(*) from public.instance_sends x
      where x.instance_id = i.id and x.sent_at > now() - interval '1 minute')::int,
    s.next_send_allowed_at,
    s.paused_until,
    coalesce(s.consecutive_failures, 0),
    (select count(*) from public.engine_commands c
      where c.instance_id = i.id
        and c.status = 'failed'
        and c.failed_at > now() - interval '1 day')::int,
    s.last_active_at,
    (select max(e.created_at) from public.engine_events e where e.instance_id = i.id),
    caps.perfil,
    caps.per_hour,
    caps.per_min,
    caps.admin_groups
  from public.instances i
  left join public.instance_send_state s on s.instance_id = i.id
  cross join lateral app.instance_caps(i.id) caps
  -- O filtro por tenant é a proteção real: service-role bypassa RLS.
  where i.tenant_id = target_tenant_id
  order by (i.status = 'connected') desc, i.updated_at desc;
$$;

create function public.instance_health(target_tenant_id uuid)
returns table (
  instance_id          uuid,
  phone                text,
  status               text,
  connected_at         timestamptz,
  warmup_day           integer,
  warmup_graduated     boolean,
  daily_cap            integer,
  sent_24h             integer,
  sent_1h              integer,
  sent_1m              integer,
  next_send_allowed_at timestamptz,
  paused_until         timestamptz,
  consecutive_failures integer,
  failures_24h         integer,
  last_active_at       timestamptz,
  last_event_at        timestamptz,
  perfil               text,
  per_hour             integer,
  per_min              integer,
  admin_groups         integer
)
language sql
stable
security definer
set search_path = public, app
as $$
  select * from app.instance_health(target_tenant_id);
$$;

revoke execute on function public.instance_health(uuid) from public, anon, authenticated;
grant execute on function public.instance_health(uuid) to service_role;

comment on function public.instance_health(uuid) is
  'Estado anti-ban por número para /painel/conectar. Só leitura; usa app.instance_caps, a mesma fonte do claim.';

commit;
```

- [ ] **Step 2: aplicar em DEV (Igor roda; o agente entrega o comando)**

```bash
npx supabase link --project-ref wfjuwogxaupyadwhvoxy
npx supabase db query --linked -f apps/web/supabase/migrations/20260904100000_perfil_do_numero_e_caps.sql
```

- [ ] **Step 3: asserts em DEV (o agente roda via MCP `execute_sql`, projeto dev)**

```sql
-- (a) perfil de uma instância inexistente = novo, 40/dia
select * from app.instance_caps(gen_random_uuid());
-- esperado: novo | 8 | 40 | 40 | 0 | 1 | false

-- (b) claim continua chamável com 1 e 2 argumentos
select count(*) from public.claim_send_commands(1);
select count(*) from public.claim_send_commands(1, null);

-- (c) ACL: nenhuma função nova concede a authenticated
select p.proname, pg_get_functiondef(p.oid) is not null as ok,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_pode
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('app','public')
  and p.proname in ('instance_caps','instance_daily_cap','claim_send_commands','record_send','record_send_failure','instance_health');
-- esperado: authenticated_pode = false em todas
```

Se (c) devolver `true` em alguma linha, o `revoke` daquela função está faltando — corrigir na migração antes de seguir.

- [ ] **Step 4: registrar em `deploy/supabase/apply-order.txt`** (última linha, com o comentário no mesmo estilo das anteriores):

```
# 2026-09-04 · perfil do numero (instances.numero_perfil) + app.instance_caps como fonte
# unica dos tetos; claim_send_commands, record_send (reset 14d), record_send_failure
# (rate_limited), instance_health (+perfil, per_hour, per_min, admin_groups). Aplicada nos DOIS.
# O gate de drift so ve a coluna nova; conferir corpo das funcoes com pg_get_functiondef.
apps/web/supabase/migrations/20260904100000_perfil_do_numero_e_caps.sql
```

- [ ] **Step 5: relatório** — arquivos tocados, saída dos asserts (a)(b)(c) colada. Sem commit (controlador commita: `feat(antiban): perfil do numero e tetos proporcionais em instance_caps`).

### Task A2: tipos e derivação da saúde do número

**Modelo:** sonnet · **Reviewer:** sonnet.
**Files:**
- Modify: `apps/web/src/lib/instance-health.ts`
- Modify: `apps/web/src/lib/instance-health.test.ts` (se não existir, criar)
**Depends-on:** A1 (contrato das colunas).
**Interfaces:**
- Consumes: colunas `perfil, per_hour, per_min, admin_groups` de `instance_health`.
- Produces: `NumberHealth.perfil: "novo" | "veterano"`, `NumberHealth.hourlyCap: number`, `NumberHealth.minuteCap: number`, `NumberHealth.adminGroups: number`.

- [ ] **Step 1: teste que falha** — acrescentar ao arquivo de teste (usar a fixture de linha já existente no teste; se o arquivo não existir, montar `baseRow` com TODOS os campos de `InstanceHealthRow` preenchidos com valores plausíveis):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveHealth, type InstanceHealthRow } from "./instance-health";

test("deriveHealth expõe perfil e tetos vindos da RPC", () => {
  const row: InstanceHealthRow = {
    ...baseRow,
    perfil: "veterano",
    per_hour: 273,
    per_min: 10,
    admin_groups: 91,
    daily_cap: 1365,
  };
  const health = deriveHealth(row, new Date("2026-09-04T12:00:00Z"));
  assert.equal(health.perfil, "veterano");
  assert.equal(health.hourlyCap, 273);
  assert.equal(health.minuteCap, 10);
  assert.equal(health.adminGroups, 91);
  assert.equal(health.dailyCap, 1365);
});
```

- [ ] **Step 2: rodar e ver falhar** — `cd apps/web && npx tsx --test src/lib/instance-health.test.ts` → falha de tipo/propriedade inexistente.

- [ ] **Step 3: implementar** — em `InstanceHealthRow` acrescentar:

```ts
  perfil: "novo" | "veterano";
  per_hour: number;
  per_min: number;
  admin_groups: number;
```

Em `NumberHealth` acrescentar:

```ts
  perfil: "novo" | "veterano";
  hourlyCap: number;
  minuteCap: number;
  adminGroups: number;
```

Em `deriveHealth`, no objeto retornado:

```ts
    perfil: row.perfil,
    hourlyCap: Math.max(0, row.per_hour),
    minuteCap: Math.max(0, row.per_min),
    adminGroups: Math.max(0, row.admin_groups),
```

Atualizar toda fixture existente do teste para carregar os 4 campos novos (o `tsc` acusa as que faltarem).

- [ ] **Step 4: rodar** — `npx tsx --test src/lib/instance-health.test.ts` verde; `npx tsc --noEmit -p apps/web` verde.

- [ ] **Step 5: relatório** — arquivos, saída dos testes. Controlador commita: `feat(antiban): NumberHealth carrega perfil e tetos por hora/minuto`.

### Task A3: `POST /api/instances` aceita a declaração

**Modelo:** sonnet · **Reviewer:** sonnet.
**Files:**
- Modify: `apps/web/src/app/api/instances/route.ts:54-70`
- Create: `apps/web/src/lib/instances/numero-perfil.ts`
- Create: `apps/web/src/lib/instances/numero-perfil.test.ts`
**Depends-on:** A1.
**Interfaces:**
- Produces: `parseNumeroPerfil(input: unknown): { ok: true; value: "novo" | "antigo" | null } | { ok: false; error: string }`; body `numero_perfil?: "novo" | "antigo"` no POST.

- [ ] **Step 1: teste** (`numero-perfil.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumeroPerfil } from "./numero-perfil";

test("aceita novo, antigo e ausente", () => {
  assert.deepEqual(parseNumeroPerfil("novo"), { ok: true, value: "novo" });
  assert.deepEqual(parseNumeroPerfil("antigo"), { ok: true, value: "antigo" });
  assert.deepEqual(parseNumeroPerfil(undefined), { ok: true, value: null });
});

test("rejeita qualquer outro valor", () => {
  assert.equal(parseNumeroPerfil("veterano").ok, false);
  assert.equal(parseNumeroPerfil(1).ok, false);
  assert.equal(parseNumeroPerfil("").ok, false);
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx tsx --test src/lib/instances/numero-perfil.test.ts`.

- [ ] **Step 3: implementar** (`numero-perfil.ts`):

```ts
export type NumeroPerfilDeclarado = "novo" | "antigo";

/** Declaração do lojista ao conectar. Ausente = null (instância legada / E2E). */
export function parseNumeroPerfil(
  input: unknown,
): { ok: true; value: NumeroPerfilDeclarado | null } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (input === "novo" || input === "antigo") return { ok: true, value: input };
  return { ok: false, error: "numero_perfil deve ser 'novo' ou 'antigo'." };
}
```

Na rota, logo após a linha que lê `body` (linha 54), trocar o tipo do body para `{ name?: string; phone?: string; numero_perfil?: unknown }` e acrescentar:

```ts
    const perfil = parseNumeroPerfil(body.numero_perfil);
    if (!perfil.ok) return Response.json({ error: perfil.error }, { status: 400 });
```

No `insert` (linhas ~60-68) acrescentar o campo `numero_perfil: perfil.value,` ao lado de `name` e `phone`. Import: `import { parseNumeroPerfil } from "@/lib/instances/numero-perfil";`.

- [ ] **Step 4: rodar** — teste verde; `npx tsc --noEmit -p apps/web` verde; `npm run lint -w apps/web` verde.

- [ ] **Step 5: relatório**. Controlador commita: `feat(instances): POST aceita numero_perfil declarado ao conectar`.

### Task A4: baseline de schema, prod e PR

**Modelo:** controlador (Fable) com o Igor.
**Files:**
- Modify: `deploy/supabase/schema-baseline.json`
**Depends-on:** A1–A3.

- [ ] **Step 1: Igor aplica em PROD** — `npx supabase link --project-ref nidoatbxaylrkcgbszns && npx supabase db query --linked -f apps/web/supabase/migrations/20260904100000_perfil_do_numero_e_caps.sql`.
- [ ] **Step 2: conferir os dois bancos** — rodar em cada um `select md5(pg_get_functiondef('app.instance_caps'::regproc)), md5(pg_get_functiondef('app.claim_send_commands(integer,uuid)'::regprocedure));` e comparar. Divergiu = um banco não recebeu a migração.
- [ ] **Step 3: baseline** — seguir exatamente o que o commit `05a3cf67` (PR #238) fez em `schema-baseline.json`: regenerar a assinatura de prod com a RPC `schema_signature()` (`tecnica-baseline-schema-sem-credencial-prod`) e substituir o valor. Rodar `npx tsx infra/scripts/check-schema-drift.ts` até verde.
- [ ] **Step 4: verificar em prod que o número do Igor virou veterano** — `select * from app.instance_caps('b9f62617-13fd-4dc6-b209-3c9351feab42');` → esperado `veterano | 10 | 273 | 1365 | 91 | ... | true` (os 91 podem variar com o sync).
- [ ] **Step 5: `.\verify-local.ps1`, push, PR, checks, merge.** Título: `feat(antiban): perfil do numero e tetos proporcionais aos grupos`.

---

## PR B — Leituras no ritmo do lote (revisão de links e backfill de convite)

Branch `feat/leituras-no-ritmo-do-lote`. Arquivos: 1 migração, `invite-review.ts` (+test), `group-bulk-jobs.ts`, `invite-enqueue.ts` (+test), `api/groups/sync/route.ts`, remoção do cron (rota, `vercel.json`, allowlist + test), `apply-order.txt`. ≤ 10 arquivos.

### Task B1: migração `check_invite_sem_janela` + ETA

**Modelo:** sonnet · **Reviewer:** opus ou Fable (ACL).
**Files:**
- Create: `apps/web/supabase/migrations/20260904110000_check_invite_sem_janela.sql`
- Modify: `apps/web/src/lib/groups/invite-review.ts:106-110`
- Modify: `apps/web/src/lib/groups/invite-review.test.ts`
**Depends-on:** none.

- [ ] **Step 1: teste** — em `invite-review.test.ts`, localizar o(s) teste(s) de `etaRevisaoMin` e trocar as expectativas: `etaRevisaoMin(91)` → `7`; `etaRevisaoMin(1)` → `1`; `etaRevisaoMin(200)` → `14`. Se não houver teste, criar:

```ts
test("ETA da revisão segue o ritmo do lote (15/min)", () => {
  assert.equal(etaRevisaoMin(1), 1);
  assert.equal(etaRevisaoMin(91), 7);
  assert.equal(etaRevisaoMin(200), 14);
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx tsx --test src/lib/groups/invite-review.test.ts`.

- [ ] **Step 3: implementar** — em `invite-review.ts` substituir o bloco da constante por:

```ts
/**
 * A revisão corre no ritmo do lote: uma leitura a cada 4 s por tenant (~15/min).
 * Antes era 1/min (D7): 91 grupos levavam 1 h 31 para um GET que ninguém
 * documentou como risco. A escrita de admin continua espaçada pelo bulk-loop.
 */
export const LEITURAS_POR_MINUTO = 15;
```

E a migração, com a função inteira (é a de `20260903130000` sem o predicado do `check_invite`):

```sql
-- check_invite volta ao ritmo do lote. A janela de 60 s (D7, PR #238) tratava
-- uma leitura (GET /group/inviteCode) com a cadência de uma escrita de admin:
-- 91 grupos em 1 h 31. Nenhuma fonte associa leitura de convite a ban; o 429
-- documentado (Baileys #797, Evolution #691) é rajada de metadata, e 1 op/4 s
-- está ordens de grandeza abaixo. Aplicar nos DOIS bancos.
--
-- Também libera campaign_group_id: o backfill de convite passa a entrar nesta
-- fila a partir do sync, sem campanha. A tela de progresso filtra por
-- campaign_group_id, então lotes sem campanha ficam invisíveis para ela.

begin;

alter table public.group_bulk_jobs alter column campaign_group_id drop not null;

create or replace function public.claim_bulk_jobs(p_tenant uuid, p_limit integer default 1)
 returns setof group_bulk_jobs
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with picked as (
    select id
      from public.group_bulk_jobs
     where tenant_id = p_tenant
       and status = 'queued'
     order by created_at
     limit greatest(p_limit, 1)
     for update skip locked
  )
  update public.group_bulk_jobs j
     set status        = 'running',
         running_since = now(),
         last_ack_at   = now(),
         attempts      = j.attempts + 1,
         updated_at    = now()
    from picked
   where j.id = picked.id
  returning j.*;
end;
$function$;

revoke all on function public.claim_bulk_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_bulk_jobs(uuid, integer) to service_role;

commit;
```

- [ ] **Step 4: rodar** — teste verde; `tsc` verde. Igor aplica em DEV (`npx supabase db query --linked -f ...`). Assert: `select pg_get_functiondef('public.claim_bulk_jobs(uuid,integer)'::regprocedure) not like '%60 seconds%';` → `true`.

- [ ] **Step 5: relatório**. Controlador commita: `feat(grupos): revisar links no ritmo do lote, sem janela de 60s`.

### Task B2: backfill de convite entra na fila do lote a partir do sync

**Modelo:** sonnet · **Reviewer:** sonnet.
**Files:**
- Create: `apps/web/src/lib/groups/invite-enqueue.ts`
- Create: `apps/web/src/lib/groups/invite-enqueue.test.ts`
- Modify: `apps/web/src/lib/stores/group-bulk-jobs.ts` (função nova ao lado de `enqueueBulkJobs`)
- Modify: `apps/web/src/app/api/groups/sync/route.ts` (após a linha `const synced = await syncGroupsFromProvider(ctx.tenantId, rows);`, ~linha 133)
**Depends-on:** B1 (`campaign_group_id` nulável).
**Interfaces:**
- Consumes: `enqueueBulkJobs(tenantId, jobs: BulkJobInsert[])`, `BulkJobInsert` de `bulk-batch.ts`, `listGroups(tenantId)` de `stores/groups.ts`.
- Produces: `selecionarGruposSemConvite(groups, jaNaFila): BulkTargetGroup[]`; `listPendingCheckInviteGroupIds(tenantId): Promise<Set<string>>`.

- [ ] **Step 1: teste** (`invite-enqueue.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { selecionarGruposSemConvite } from "./invite-enqueue";

const g = (over: Partial<Parameters<typeof selecionarGruposSemConvite>[0][number]>) => ({
  id: "g1",
  whatsapp_group_id: "1203@g.us",
  is_admin: true,
  invite_url: null,
  metadata: {},
  ...over,
});

test("entra só grupo admin, sem convite, sem falha marcada, com JID e fora da fila", () => {
  const out = selecionarGruposSemConvite(
    [
      g({ id: "a" }),
      g({ id: "b", is_admin: false }),
      g({ id: "c", invite_url: "https://chat.whatsapp.com/x" }),
      g({ id: "d", metadata: { inviteFetch: { failed: true, reason: "x", at: "y" } } }),
      g({ id: "e", whatsapp_group_id: null }),
      g({ id: "f" }),
    ],
    new Set(["f"]),
  );
  assert.deepEqual(out.map((x) => x.id), ["a"]);
});
```

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar** (`invite-enqueue.ts`):

```ts
import type { BulkTargetGroup } from "@/lib/groups/bulk-batch";

export type GrupoParaConvite = {
  id: string;
  whatsapp_group_id: string | null;
  is_admin?: boolean;
  invite_url?: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Backfill de convite pela fila do lote (substitui o cron diário de 10/dia).
 * `metadata.inviteFetch` é o marcador de falha definitiva do backfill antigo:
 * grupo marcado só volta por PATCH manual (clearInviteFetchError), nunca sozinho.
 */
export function selecionarGruposSemConvite(
  groups: readonly GrupoParaConvite[],
  jaNaFila: ReadonlySet<string>,
): BulkTargetGroup[] {
  return groups
    .filter(
      (g) =>
        g.is_admin === true &&
        !g.invite_url &&
        !!g.whatsapp_group_id &&
        g.metadata?.inviteFetch === undefined &&
        !jaNaFila.has(g.id),
    )
    .map((g) => ({ id: g.id, whatsapp_group_id: g.whatsapp_group_id }));
}
```

Em `group-bulk-jobs.ts`, ao lado de `enqueueBulkJobs`:

```ts
/** Grupos com check_invite ainda por rodar — evita enfileirar o mesmo grupo a cada sync. */
export async function listPendingCheckInviteGroupIds(tenantId: string): Promise<Set<string>> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("group_id")
    .eq("tenant_id", tenantId)
    .eq("action", "check_invite")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => (r as { group_id: string }).group_id));
}
```

Na rota de sync, depois de `const synced = await syncGroupsFromProvider(ctx.tenantId, rows);`:

```ts
    // Backfill de convite pela fila do lote (15/min), no lugar do cron diário.
    // Falha aqui não pode derrubar o sync: convite é enriquecimento.
    let convitesEnfileirados = 0;
    try {
      const [grupos, jaNaFila] = await Promise.all([
        listGroups(ctx.tenantId),
        listPendingCheckInviteGroupIds(ctx.tenantId),
      ]);
      const alvos = selecionarGruposSemConvite(grupos, jaNaFila);
      if (alvos.length > 0) {
        convitesEnfileirados = await enqueueBulkJobs(
          ctx.tenantId,
          alvos.map((g) => ({
            tenant_id: ctx.tenantId,
            campaign_group_id: null,
            batch_id: crypto.randomUUID(),
            action: "check_invite" as const,
            group_id: g.id,
            whatsapp_group_id: g.whatsapp_group_id as string,
            description: null,
            media_id: null,
          })),
        );
      }
    } catch (err) {
      console.error("[api/groups/sync] backfill de convite nao enfileirou:", err);
    }
```

`BulkJobInsert.campaign_group_id` passa a ser `string | null` em `bulk-batch.ts` (ajuste de tipo, uma linha). Incluir `convitesEnfileirados` no `metadata` do log `groups.synced` já existente. Imports: `listGroups` (já pode estar importado do store), `listPendingCheckInviteGroupIds`, `enqueueBulkJobs`, `selecionarGruposSemConvite`.

Um `batch_id` por grupo é deliberado: o índice único é `(tenant_id, batch_id, group_id, action)`, e o filtro `jaNaFila` é quem evita duplicar entre syncs.

- [ ] **Step 4: rodar** — teste verde; `tsc` verde; lint verde.

- [ ] **Step 5: relatório**. Controlador commita: `feat(grupos): backfill de convite pela fila do lote a partir do sync`.

### Task B3: remover o cron diário de convites

**Modelo:** sonnet · **Reviewer:** sonnet.
**Files:**
- Delete: `apps/web/src/app/api/cron/group-invites/route.ts` (e o `.test.ts` irmão, se existir)
- Modify: `apps/web/vercel.json` (remover a entrada `/api/cron/group-invites`)
- Modify: `apps/web/src/lib/security/request-access-policy.ts:72` (remover a linha do path) e `request-access-policy.test.ts` (remover/ajustar o caso do path)
- Modify/Delete: `apps/web/src/lib/groups/invite-backfill.ts` — remover `selectBackfillCandidates`, `rotateByDay` e seus testes **se** `git grep -n "selectBackfillCandidates\|rotateByDay" apps/web/src` só apontar para a rota removida e para o próprio teste. `parseInviteCodeResponse`, `classifyInviteFailure`, `buildInviteFetchMarker`, `clearInviteFetchMarker` FICAM (o ack do `check_invite` usa).
- Delete: `apps/web/src/lib/groups/backfill-run-log.ts` + test **se** ficar sem importador (mesmo critério de `git grep`).
**Depends-on:** B2 (o substituto precisa existir antes de apagar o original).

- [ ] **Step 1:** `git grep -n "group-invites\|selectBackfillCandidates\|rotateByDay\|backfill-run-log" apps/web` — anotar todos os importadores.
- [ ] **Step 2:** apagar/editar conforme a lista acima. No `request-access-policy.test.ts`, se houver `assert.equal(classifyRequest("/api/cron/group-invites"...), "cron")`, trocar para afirmar que agora é `"user"` (path removido da allowlist).
- [ ] **Step 3:** `npx tsx --test src/lib/security/request-access-policy.test.ts` verde; `tsc` verde; lint verde; `npm run build -w apps/web` verde (rota apagada não pode sobrar em nenhum import).
- [ ] **Step 4: relatório** — lista do que foi apagado e por quê (grep colado). Controlador commita: `refactor(grupos): remover cron diario de convite, substituido pela fila do lote`.

### Task B4: apply-order, baseline, prod e PR

**Modelo:** controlador com o Igor. Igual à A4: registrar a migração em `apply-order.txt` (com comentário no mesmo estilo), Igor aplica em PROD, conferir `pg_get_functiondef` nos dois bancos, baseline só se o gate reclamar (a única mudança de coluna é `drop not null`, que não entra no hash — conferir `information_schema.columns.is_nullable` nos dois bancos), `.\verify-local.ps1`, PR `feat(grupos): leituras no ritmo do lote e backfill de convite pelo sync`, merge.

---

## PR C — Worker sem loop único

Branch `feat/worker-loops-independentes`. Só `apps/worker`. ≤ 8 arquivos.

### Task C1: `startLoop` e loops independentes

**Modelo:** sonnet · **Reviewer:** opus ou Fable (concorrência e shutdown).
**Files:**
- Modify: `apps/worker/src/env.ts:104-106` (campo novo `sendPollMs`)
- Create: `apps/worker/src/loop.ts`
- Create: `apps/worker/src/loop.test.ts`
- Modify: `apps/worker/src/index.ts:184-296`
**Depends-on:** none.
**Interfaces:**
- Produces: `startLoop(opts: { name: string; intervalMs: number; tick: () => Promise<void>; isStopping: () => boolean; onError: (err: unknown) => void }): { done: Promise<void> }`.

- [ ] **Step 1: teste** (`loop.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { startLoop } from "./loop.js";

test("startLoop não reentra: um tick lento não sobrepõe o próximo", async () => {
  let running = 0;
  let maxConcurrent = 0;
  let ticks = 0;
  let stopping = false;
  const loop = startLoop({
    name: "t",
    intervalMs: 5,
    isStopping: () => stopping,
    onError: () => undefined,
    async tick() {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      ticks += 1;
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
      if (ticks >= 3) stopping = true;
    },
  });
  await loop.done;
  assert.equal(maxConcurrent, 1);
  assert.equal(ticks, 3);
});

test("startLoop isola erro do tick e continua", async () => {
  let ticks = 0;
  let stopping = false;
  const errors: unknown[] = [];
  const loop = startLoop({
    name: "t",
    intervalMs: 1,
    isStopping: () => stopping,
    onError: (e) => errors.push(e),
    async tick() {
      ticks += 1;
      if (ticks === 1) throw new Error("boom");
      if (ticks >= 2) stopping = true;
    },
  });
  await loop.done;
  assert.equal(errors.length, 1);
  assert.equal(ticks, 2);
});
```

- [ ] **Step 2: rodar e ver falhar** — `cd apps/worker && npm test -- src/loop.test.ts` (ou `node --import tsx --test src/loop.test.ts`, conforme o `package.json` do worker).

- [ ] **Step 3: implementar** (`loop.ts`):

```ts
/**
 * Um loop por trabalho. Antes, envio, lote, grow e manutenção rodavam em série
 * dentro de um único `while` com sleep(pollMs): uma foto de grupo (3,5 s na
 * Evolution) + claim por HTTP + sleep segurava o envio de todos os tenants, e a
 * cadência efetiva do lote era 1 op a cada 8-16 s, não 4 s (medido em 03/09).
 *
 * `tick` nunca reentra: o próximo só agenda depois que o anterior resolve.
 * O intervalo é entre o FIM de um tick e o INÍCIO do próximo.
 */
export type LoopOptions = {
  name: string;
  intervalMs: number;
  tick: () => Promise<void>;
  isStopping: () => boolean;
  onError: (err: unknown) => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function startLoop(opts: LoopOptions): { done: Promise<void> } {
  const done = (async () => {
    while (!opts.isStopping()) {
      try {
        await opts.tick();
      } catch (err) {
        opts.onError(err);
      }
      if (opts.isStopping()) break;
      await sleep(opts.intervalMs);
    }
  })();
  return { done };
}
```

Em `env.ts`, ao lado de `sendBatchSize`:

```ts
    // Envio poll curto: o ritmo do número vem do gate no claim (gap 3-7 s), não do poll.
    sendPollMs: intEnv("WORKER_SEND_POLL_MS", 1000, 250),
```

(e o campo no tipo `WorkerEnv`).

Em `index.ts`, substituir o `while (!stopping) { ... }` (linhas 184-296) por quatro loops. Manter **intactos** os corpos de cada bloco (o que hoje está dentro de cada `try`), só mudando quem os agenda:

```ts
  const isStopping = () => stopping;
  const falhou = (escopo: string) => (err: unknown) => {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    state.healthy = false;
    state.lastError = message;
    log.error(`${escopo} falhou`, { error: message });
  };

  // 1) eventos + automações + varredura + manutenção, no pollMs de sempre.
  const principal = startLoop({
    name: "principal",
    intervalMs: env.pollMs,
    isStopping,
    onError: falhou("ciclo"),
    async tick() {
      // Mover para cá, sem alterar, estas linhas do `while` antigo (index.ts:186-200):
      //   const summary = await runTick(supabase, deps, env.batchSize, env.requeueAfterSeconds);
      //   const automationsSummary = await runAutomationsTick(supabase, automationDeps, env.batchSize, env.requeueAfterSeconds);
      //   state.lastTickAt = Date.now(); state.healthy = true; state.lastError = null;
      //   if (summary.claimed > 0) log.info("ciclo", summary);
      //   if (automationsSummary.claimed > 0) log.info("ciclo automacoes", automationsSummary);
      // Depois o bloco `if (Date.now() - lastScanAt >= SCAN_INTERVAL_MS) { ... }` (index.ts:203-211), inteiro.
      // Por fim o bloco de manutenção (index.ts:277-284), inteiro:
      //   const now = Date.now(); const shouldPrune = now - lastPruneAt >= PRUNE_INTERVAL_MS;
      //   const summary2 = await runHousekeeping(supabase, { prune: shouldPrune });
      //   if (shouldPrune) lastPruneAt = now;
      //   if (housekeepingDidWork(summary2)) log.info("manutenção", summary2);
      // (renomear a segunda `summary` para não colidir com a primeira.)
    },
  });

  // 2) envio, poll curto; o gap do número vive no claim.
  const envio = sendDeps
    ? startLoop({
        name: "envio",
        intervalMs: env.sendPollMs,
        isStopping,
        onError: falhou("ciclo de envio"),
        async tick() {
          const sent = await runSendTick(supabase, sendDeps, env.sendBatchSize);
          state.lastTickAt = Date.now();
          if (sent.claimed > 0) log.info("ciclo de envio", sent);
        },
      })
    : null;

  // 3) auto-grow, intervalo próprio (é o anti-ban de create).
  const grow = growDeps
    ? startLoop({
        name: "grow",
        intervalMs: env.growIntervalMs,
        isStopping,
        onError: falhou("ciclo de auto-grow"),
        async tick() {
          const grown = await runGrowTick(growDeps);
          state.lastTickAt = Date.now();
          if (growDidWork(grown)) log.info("ciclo de auto-grow", grown);
        },
      })
    : null;

  // 4) ações em massa, 4 s entre CLAIMS; a execução não bloqueia (ver bulk-loop.ts).
  const lote = bulkDeps
    ? startLoop({
        name: "lote",
        intervalMs: env.bulkIntervalMs,
        isStopping,
        onError: falhou("ciclo de ações em massa"),
        async tick() {
          const applied = await runBulkTick(bulkDeps);
          state.lastTickAt = Date.now();
          if (bulkDidWork(applied)) log.info("ciclo de ações em massa", applied);
        },
      })
    : null;

  await Promise.all([principal.done, envio?.done, grow?.done, lote?.done]);
  if (bulkDeps) await drainInFlight();
  log.info("worker encerrado");
```

Onde hoje `lastScanAt`/`lastPruneAt` são comparados dentro do `while`, manter a mesma lógica dentro do `tick` do loop principal (`SCAN_INTERVAL_MS`, `PRUNE_INTERVAL_MS` continuam). `drainInFlight` vem de C2; se C1 for revisado antes de C2 existir, importar `drainInFlight` de `bulk-loop.ts` já nesta tarefa como `export async function drainInFlight(): Promise<void> {}` (corpo real em C2).

- [ ] **Step 4: rodar** — `npm test` do worker verde (todos, não só o novo); `npx tsc --noEmit -p apps/worker` verde.

- [ ] **Step 5: relatório**. Controlador commita: `refactor(worker): um loop por trabalho; envio, lote e grow deixam de rodar em serie`.

### Task C2: lote sem bloquear o tick, tenants em paralelo

**Modelo:** sonnet · **Reviewer:** opus ou Fable.
**Files:**
- Modify: `apps/worker/src/bulk-loop.ts:110-172`
- Modify: `apps/worker/src/bulk-loop.test.ts`
**Depends-on:** C1.
**Interfaces:**
- Produces: `drainInFlight(): Promise<void>`; `runBulkTick` mantém a assinatura e o `BulkTickSummary` (`tenants, claimed, done, failed` — `done`/`failed` passam a contar acks **já concluídos** no tick, e ganha `started: number`).

- [ ] **Step 1: teste** — acrescentar a `bulk-loop.test.ts` (reusar os deps fake já existentes no arquivo):

```ts
test("o tick devolve antes da Evolution terminar e o ack chega depois", async () => {
  let resolveEvolution!: () => void;
  const acks: string[] = [];
  const deps = fakeDeps({
    claimJobs: async () => [fakeJob({ id: "j1", action: "open" })],
    setOpenToAll: () => new Promise<void>((r) => { resolveEvolution = r; }),
    ack: async (_t, id) => { acks.push(id); },
  });
  const summary = await runBulkTick(deps);
  assert.equal(summary.started, 1);
  assert.deepEqual(acks, []);
  resolveEvolution();
  await drainInFlight();
  assert.deepEqual(acks, ["j1"]);
});

test("tenants correm em paralelo: dois tenants, um tick, dois starts", async () => {
  const starts: string[] = [];
  const deps = fakeDeps({
    listTenants: async () => ["t1", "t2"],
    claimJobs: async (t) => [fakeJob({ id: `j-${t}`, action: "open" })],
    setOpenToAll: async () => { starts.push("x"); },
  });
  const summary = await runBulkTick(deps);
  await drainInFlight();
  assert.equal(summary.started, 2);
  assert.equal(starts.length, 2);
});
```

Se `fakeDeps`/`fakeJob` não existirem com esses nomes, usar os helpers que o arquivo já tem e adaptar os nomes — **o comportamento afirmado não muda**.

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar** — em `bulk-loop.ts`:

```ts
/** Execuções em voo. O tick agenda e devolve; o ack fecha aqui. */
const inFlight = new Set<Promise<void>>();

/** Espera o que estiver em voo (shutdown). */
export async function drainInFlight(): Promise<void> {
  await Promise.allSettled([...inFlight]);
}

function track(p: Promise<void>): void {
  inFlight.add(p);
  void p.finally(() => inFlight.delete(p));
}
```

`runTenant` passa a: claimar (await), resolver `instanceFor` (await), e para cada job permitido chamar `track(executeAndAck(deps, tenantId, instanceName, job, summary))` **sem await**; o `excedente` continua recebendo ack `failed` com `DEFERRED_REASON` (pode ficar com await, é rápido). `executeAndAck`:

```ts
async function executeAndAck(
  deps: BulkDeps,
  tenantId: string,
  instanceName: string,
  job: BulkJobClaim,
  summary: BulkTickSummary,
): Promise<void> {
  try {
    await applyJob(deps, tenantId, instanceName, job);
    await deps.ack(tenantId, job.id, { status: "done" });
    summary.done += 1;
  } catch (error) {
    try {
      await deps.ack(tenantId, job.id, { status: "failed", error: reason(error) });
    } catch (ackError) {
      log.error("ações em massa: ack falhou", { job: job.id, error: reason(ackError) });
    }
    summary.failed += 1;
  }
}
```

`runBulkTick`: trocar o `for (const tenantId of tenants) { await runTenant(...) }` por

```ts
  const results = await Promise.allSettled(tenants.map((tenantId) => runTenant(deps, tenantId, summary)));
  for (const r of results) {
    if (r.status === "rejected") {
      log.warn("ações em massa: tenant falhou no tick", { error: reason(r.reason) });
    }
  }
```

`summary.started += permitidos.length` dentro de `runTenant`. Atualizar o cabeçalho do arquivo (linhas 1-30): o espaçamento é entre **inícios**; o tick não espera a Evolution. `bulkDidWork` passa a olhar `started` também.

- [ ] **Step 4: rodar** — `npm test` do worker verde; `tsc` verde.

- [ ] **Step 5: relatório**. Controlador commita: `perf(worker): lote espaca inicios, nao fins; tenants em paralelo`.

### Task C3: envio em paralelo entre números e rate-limit vira pausa longa

**Modelo:** sonnet · **Reviewer:** sonnet.
**Files:**
- Modify: `apps/worker/src/send-loop.ts:68-82,118-136`
- Modify: `apps/worker/src/send-command.ts:48-50,195-199`
- Modify: `apps/worker/src/send-command.test.ts` (ou o teste existente do send-command)
**Depends-on:** A1 aplicada em DEV (assinatura `record_send_failure(uuid, uuid, boolean)`); C1.
**Interfaces:**
- Consumes: `EvolutionSendError.status: number` (`evolution-sender.ts:13-19`), RPC `record_send_failure(target_instance_id, target_tenant_id, rate_limited)`.
- Produces: `SendDeps.recordSendFailure(instanceId, tenantId, rateLimited: boolean)`.

- [ ] **Step 1: teste** — no teste do `send-command`, com os deps fake já existentes:

```ts
test("429 da Evolution registra falha com rate_limited=true", async () => {
  const calls: Array<{ rateLimited: boolean }> = [];
  const deps = fakeSendDeps({
    sendText: async () => { throw new EvolutionSendError(429, "rate-overlimit"); },
    recordSendFailure: async (_i, _t, rateLimited) => { calls.push({ rateLimited }); },
  });
  const out = await sendFromCommand(fakeCommand({ type: "send_message" }), deps);
  assert.equal(out.status, "failed");
  assert.deepEqual(calls, [{ rateLimited: true }]);
});

test("falha comum registra rate_limited=false", async () => {
  const calls: boolean[] = [];
  const deps = fakeSendDeps({
    sendText: async () => { throw new EvolutionSendError(500, "boom"); },
    recordSendFailure: async (_i, _t, rateLimited) => { calls.push(rateLimited); },
  });
  await sendFromCommand(fakeCommand({ type: "send_message" }), deps);
  assert.deepEqual(calls, [false]);
});
```

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar** — em `send-command.ts`:

```ts
  recordSendFailure(instanceId: string, tenantId: string, rateLimited: boolean): Promise<void>;
```

e, no `catch` que hoje chama `deps.recordSendFailure(row.instance_id, row.tenant_id)` (~linha 197):

```ts
    await deps.recordSendFailure(row.instance_id, row.tenant_id, isRateLimited(error));
```

com

```ts
// import { EvolutionSendError } from "./evolution-sender.js"; (no topo de send-command.ts,
// se ainda não estiver importado — o teste também importa dali.)

/** 429 ou "rate-overlimit" no detalhe: o WhatsApp está freando ESTE número. */
export function isRateLimited(error: unknown): boolean {
  if (!(error instanceof EvolutionSendError)) return false;
  return error.status === 429 || /rate-overlimit/i.test(error.message);
}
```

Em `send-loop.ts`, o dep real:

```ts
    async recordSendFailure(instanceId, tenantId, rateLimited) {
      const { error } = await supabase.rpc("record_send_failure", {
        target_instance_id: instanceId,
        target_tenant_id: tenantId,
        rate_limited: rateLimited,
      });
      if (error) throw new Error(`record_send_failure: ${error.message}`);
    },
```

E o `for (const row of rows)` vira paralelo (cada linha é de uma instância distinta por construção do claim):

```ts
  const results = await Promise.allSettled(rows.map((row) => sendFromCommand(row, deps)));
  let sent = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.status === "sent") {
      sent += 1;
    } else {
      failed += 1;
      if (r.status === "fulfilled") {
        log.warn("comando de envio falhou", { command_id: rows[i].command_id, reason: r.value.reason });
      } else {
        log.error("envio falhou (infra)", {
          command_id: rows[i].command_id,
          error: r.reason instanceof Error ? r.reason.message : "erro desconhecido",
        });
      }
    }
  });
```

- [ ] **Step 4: rodar** — `npm test` do worker verde; `tsc` verde.

- [ ] **Step 5: relatório**. Controlador commita: `feat(worker): envio paralelo entre numeros; 429 vira pausa de 30 min no numero`.

### Task C4: deploy do worker e checklist do Coolify

**Modelo:** controlador com o Igor.

- [ ] `.\verify-local.ps1`, PR `refactor(worker): loops independentes, lote sem bloqueio, rate-limit como pausa`, merge.
- [ ] Redeploy do worker no Coolify **depois** de A1 estar em prod (a RPC de 3 parâmetros precisa existir antes do worker chamar).
- [ ] Ler a linha de boot `worker iniciado`: `sender: on`, `bulk: on`, `grow: on|dry-run`.
- [ ] Na Evolution (Coolify), conferir `CACHE_LOCAL_ENABLED=true` ou `CACHE_REDIS_ENABLED=true` — é a mitigação do 429 recomendada pelo Baileys FAQ (metadata de grupo por envio). Anotar o valor no relatório do PR.
- [ ] Medir em prod, 24 h depois: `select action, round(avg(extract(epoch from (running_since - created_at)))) as espera_s from public.group_bulk_jobs where created_at > now() - interval '1 day' group by 1;` — esperado `espera_s` ≤ 10 para lotes pequenos.

---

## PR D — O que o lojista vê

Branch `feat/tela-perfil-e-eta`. Depende de **A mergeado**. ≤ 6 arquivos.

### Task D1: pergunta do perfil antes do QR

**Modelo:** sonnet · **Reviewer:** sonnet + uma olhada do Fable no copy.
**Files:**
- Create: `apps/web/src/components/painel/pergunta-perfil-numero.tsx`
- Modify: `apps/web/src/app/painel/conectar/page.tsx:366-392`
- Modify: `apps/web/e2e/rotas.ts` ou o spec de conectar **só se** o E2E existente clicar no fluxo de criação (verificar com `git grep -n "conectar" apps/web/e2e`).
**Depends-on:** A3 mergeado.

- [ ] **Step 1: componente**

```tsx
"use client";

import { useState } from "react";
import { Smartphone, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NumeroPerfilDeclarado } from "@/lib/instances/numero-perfil";

type Props = { onEscolher: (perfil: NumeroPerfilDeclarado) => void; ocupado?: boolean };

const OPCOES: Array<{ valor: NumeroPerfilDeclarado; titulo: string; texto: string; Icone: typeof Smartphone }> = [
  {
    valor: "antigo",
    titulo: "Uso este número há mais de 30 dias",
    texto: "O WhatsApp já confia nele. Você posta nos seus grupos desde o primeiro dia, no ritmo da sua base.",
    Icone: Smartphone,
  },
  {
    valor: "novo",
    titulo: "É um número novo (menos de 30 dias)",
    texto: "Número novo que dispara muito é o que o WhatsApp bloqueia. Ele começa com 40 mensagens por dia e o teto sobe sozinho por 7 dias.",
    Icone: Clock,
  },
];

export function PerguntaPerfilNumero({ onEscolher, ocupado }: Props) {
  const [escolha, setEscolha] = useState<NumeroPerfilDeclarado | null>(null);
  return (
    <section aria-labelledby="perfil-titulo" className="space-y-4">
      <h2 id="perfil-titulo" className="text-lg font-semibold">Antes do QR code: esse número é novo?</h2>
      <p className="text-sm text-aco/70">
        A resposta define o ritmo de envio. Você não perde nada respondendo com honestidade — um número
        antigo libera mais; um número novo é protegido enquanto aquece.
      </p>
      <div role="radiogroup" aria-labelledby="perfil-titulo" className="grid gap-3 sm:grid-cols-2">
        {OPCOES.map(({ valor, titulo, texto, Icone }) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={escolha === valor}
            onClick={() => setEscolha(valor)}
            className={cn(
              "rounded-lg border p-4 text-left transition focus-visible:outline focus-visible:outline-2",
              escolha === valor ? "border-cobalt-500 bg-cobalt-500/5" : "border-poco hover:border-aco/30",
            )}
          >
            <Icone className="mb-2 h-5 w-5 text-cobalt-700" aria-hidden />
            <div className="font-medium">{titulo}</div>
            <div className="mt-1 text-sm text-aco/70">{texto}</div>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!escolha || ocupado}
        onClick={() => escolha && onEscolher(escolha)}
        className="rounded-md bg-cobalt-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Gerar QR code
      </button>
    </section>
  );
}
```

Usar as classes de cor que `conectar/page.tsx` já usa (`cobalt-*`, `aco`, `poco` aparecem em `disparos/page.tsx`); se o projeto tiver um componente de botão padrão em `@/components/ui`, usar ele no lugar do `<button>` cru.

- [ ] **Step 2: fiação em `conectar/page.tsx`** — estado novo `const [perfilEscolhido, setPerfilEscolhido] = useState<NumeroPerfilDeclarado | null>(null);` e uma ref `perfilRef` espelhando (o `load` é `useCallback` com polling; ler da ref evita closure velha). No bloco `if (list.length === 0) { ... }` (linha ~370), **antes** de `if (creating.current) return null;`:

```ts
        if (!perfilRef.current) {
          setPrecisaPerfil(true);
          return null;
        }
```

e o `body` do `fetch("/api/instances", { method: "POST", ... })` passa a `JSON.stringify({ name: "WhatsApp", numero_perfil: perfilRef.current })`. No JSX, quando `precisaPerfil && !instance`, renderizar `<PerguntaPerfilNumero ocupado={loading} onEscolher={(p) => { perfilRef.current = p; setPerfilEscolhido(p); setPrecisaPerfil(false); void load(true); }} />` no lugar do QR. Depois de a instância existir, o componente não aparece mais (a instância manda no fluxo, como hoje).

- [ ] **Step 3: E2E** — se algum spec de `conectar` depende da criação automática, acrescentar o clique em "Uso este número há mais de 30 dias" + "Gerar QR code" antes de esperar o QR. Rodar só esse spec: `npx playwright test <spec> -g conectar`.

- [ ] **Step 4:** `tsc`, lint, `npm run build -w apps/web` verdes. Screenshot da tela em `e2e-results/` para o PR (Playwright com `storageState` de `e2e-results/.auth/usuario.json`, como em `saude-do-numero-r2-r3`).

- [ ] **Step 5: relatório**. Controlador commita: `feat(conectar): pergunta se o numero e novo antes de gerar o QR`.

### Task D2: saúde do número mostra perfil e tetos reais

**Modelo:** sonnet · **Reviewer:** sonnet.
**Files:**
- Modify: `apps/web/src/components/painel/numero-saude.tsx:105-150`
**Depends-on:** A2 mergeado.

- [ ] **Step 1:** onde hoje aparece `health.graduated ? "Aquecimento concluído" : \`Dia ${health.warmupDay} de aquecimento\`` (linha ~110), trocar por um badge + texto:

```tsx
<span className="rounded-full bg-cobalt-500/10 px-2 py-0.5 text-xs font-medium text-cobalt-700">
  {health.perfil === "veterano" ? "Número veterano" : `Número novo · dia ${health.warmupDay} de 7`}
</span>
```

Linha ~120-121 (explicação): 

```tsx
{health.perfil === "veterano"
  ? `Até ${health.dailyCap} mensagens por dia e ${health.hourlyCap} por hora, calculado pelos seus ${health.adminGroups} grupos com gente. Enviamos 1 a cada 5 s para parecer uso humano.`
  : `Número novo que dispara muito é o que o WhatsApp bloqueia. Hoje o teto é ${health.dailyCap}; ele sobe sozinho a cada dia até o 7º.`}
```

Linha ~136 (`nota="teto de 120/h"`) → `` nota={`teto de ${health.hourlyCap}/h`} ``. Se `health.pausedSeconds > 60` mostrar `Pausado ${Math.ceil(health.pausedSeconds / 60)} min: o WhatsApp pediu para desacelerar.` no lugar do texto de teto.

- [ ] **Step 2:** `tsc`, lint verdes; screenshot com o seed do tenant QA (procedimento em `saude-do-numero-r2-r3`), apagar o seed depois.
- [ ] **Step 3: relatório**. Controlador commita: `feat(saude): perfil do numero e tetos por hora/dia na tela`.

### Task D3: disparos com progresso e ETA

**Modelo:** sonnet · **Reviewer:** sonnet.
**Files:**
- Modify: `apps/web/src/lib/campaigns/dispatch-view.ts` (garantir `sent: number` e `total: number` no `TenantDispatchView`; se faltarem, mapear de `broadcasts.sent`/`broadcasts.total`)
- Create: `apps/web/src/lib/campaigns/dispatch-eta.ts` + `.test.ts`
- Modify: `apps/web/src/app/painel/disparos/page.tsx` (onde a pílula `STATUS[status]` é renderizada)
**Depends-on:** none (pode rodar na onda 1 se o controlador quiser; está em D por ser tela).

- [ ] **Step 1: teste**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { etaDisparo } from "./dispatch-eta";

test("ETA usa 6 s por mensagem restante e arredonda para cima", () => {
  assert.equal(etaDisparo({ sent: 38, total: 91 }), "≈ 6 min");
  assert.equal(etaDisparo({ sent: 0, total: 5 }), "≈ 1 min");
  assert.equal(etaDisparo({ sent: 91, total: 91 }), null);
});
```

- [ ] **Step 2: implementar**

```ts
/** 10/min é o teto de veterano; 6 s por mensagem é a promessa que não mente para cima. */
const SEGUNDOS_POR_MENSAGEM = 6;

export function etaDisparo(view: { sent: number; total: number }): string | null {
  const restantes = Math.max(0, view.total - view.sent);
  if (restantes === 0) return null;
  const minutos = Math.max(1, Math.ceil((restantes * SEGUNDOS_POR_MENSAGEM) / 60));
  return `≈ ${minutos} min`;
}
```

Na página, ao lado da pílula para `queued` e `running`: `{eta && <span className="text-xs text-aco/60">{d.sent} de {d.total} · {eta}</span>}` com `const eta = etaDisparo(d)`.

- [ ] **Step 3:** teste verde; `tsc`, lint verdes.
- [ ] **Step 4: relatório**. Controlador commita: `feat(disparos): progresso e ETA na pilula de envio`.

### Task D4: PR e verificação

- [ ] `.\verify-local.ps1`, PR `feat(painel): perfil do numero no conectar, tetos na saude, ETA nos disparos`, merge.
- [ ] Verificar em prod com o tenant do Igor: a saúde mostra `Número veterano` e o teto 1.365 (ou o valor de `instance_caps`). Só então mover o card para `no_ar_verificado` com a prova (screenshot ou linha da RPC).

---

## Depois dos 4 PRs — D7, os 14 dias de medição

Controlador agenda (ou o Igor roda) uma vez por dia, em prod:

```sql
select
  (select count(*) from public.instance_send_state where paused_until > now() - interval '1 day' and paused_until - updated_at > interval '20 minutes') as pausas_rate_limit_24h,
  (select count(*) from public.engine_events where created_at > now() - interval '1 day' and payload::text ilike '%rate-overlimit%') as eventos_429_24h,
  (select count(*) from public.instance_sends where sent_at > now() - interval '1 day') as envios_24h,
  (select max(sent_1h) from (select count(*) as sent_1h from public.instance_sends where sent_at > now() - interval '1 day' group by date_trunc('hour', sent_at)) h) as pico_hora;
```

- Qualquer `pausas_rate_limit_24h > 0` ou `eventos_429_24h > 0` → rodar em prod o `create or replace` de `app.instance_caps` com `1500 → 800` e `400 → 240`, e abrir investigação com o `engine_events` do horário.
- 14 dias limpos → registrar no grafo: `rag insert "decisão 2026-09-18: tetos de veterano (10/min, grupos×3/h até 400, grupos×15/dia até 1500) validados 14 dias sem 429 em prod" --source decisao-2026-09-18` e abrir a discussão da fase 2 (3.000/dia).

## Fora do plano (de propósito)

Spintax (R4), pré-voo de admin (R5), edição da declaração depois de conectar, rota síncrona para lote de 1 grupo, fórmula acima de 1.500/dia. Cada um é PR próprio, e nenhum bloqueia estes quatro.
