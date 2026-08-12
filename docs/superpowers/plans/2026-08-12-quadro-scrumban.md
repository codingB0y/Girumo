# Quadro Scrumban de features — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em `/admin/quadro` um quadro Scrumban das features do Girumo, com colunas de maturidade, feed de eventos e atualização a cada 4 segundos.

**Architecture:** Duas tabelas no Supabase (`board_features`, `board_events`) com RLS deny-all — só `service_role` lê. O evento é escrito por trigger, e uma constraint impede marcar feature como verificada sem prova. A página é server component atrás de `requireAdmin()`; o componente cliente faz polling numa rota de API protegida pelo mesmo cookie. Sem Realtime: a publicação `supabase_realtime` está vazia em dev e a RLS de prod bloqueia o cliente do navegador (ver D6 da spec).

**Tech Stack:** Next.js 15 App Router, React 19, Supabase (Postgres + service role), Tailwind, `tsx --test` com `node:assert/strict`.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md`. Nenhuma decisão nova sem passar por lá.
- Migração vai nos **dois** bancos: dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`. Registrar em `deploy/supabase/apply-order.txt`.
- Toda função SQL é `security definer` **com** `set search_path`. RLS ligada em toda tabela nova.
- As duas tabelas **não** têm `tenant_id` e **não** entram na publicação `supabase_realtime`.
- Nenhuma policy nas duas tabelas — o deny-all é intencional e é o isolamento.
- TypeScript strict, sem `any`. Import com alias `@/`.
- Testes rodam com `npm --workspace apps/web test` — o runner é `tsx --test "src/**/*.test.ts"`, **só `.ts`**. Arquivo `.tsx` não é testado; toda lógica que precisa de teste mora em `.ts`.
- Estilo de teste do repositório: asserts no topo do módulo com `node:assert/strict`, sem `describe`/`it`. Ver `apps/web/src/lib/analytics/funnel-summary.test.ts`.
- Português no texto de UI, comentário e mensagem de commit em português; identificadores em inglês.
- Commits atômicos, um por tarefa.

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `apps/web/supabase/migrations/20260812120000_board_quadro.sql` | tabelas, constraints, índices, trigger, RPC, RLS |
| `deploy/supabase/apply-order.txt` | ordem de aplicação (append) |
| `infra/tests/board-quadro-smoke.sql` | asserts do contrato do banco |
| `apps/web/src/lib/quadro/status.ts` | tipos, constantes e lógica pura (vencimento, WIP, agrupamento) |
| `apps/web/src/lib/quadro/status.test.ts` | testes da lógica pura |
| `apps/web/src/lib/stores/quadro.ts` | leitura/escrita no Supabase com service role |
| `apps/web/src/app/api/admin/quadro/route.ts` | `GET` (PR-1), `PATCH` e `POST` (PR-2) |
| `apps/web/src/app/admin/quadro/page.tsx` | server component, fetch inicial |
| `apps/web/src/components/admin/quadro/board.tsx` | cliente: polling, colunas, filtro de área |
| `apps/web/src/components/admin/quadro/card.tsx` | um card |
| `apps/web/src/components/admin/quadro/feed.tsx` | feed lateral de eventos |
| `apps/web/src/components/admin/sidebar.tsx` | item "Quadro" na seção Sistema |

**Desvio da spec, registrado:** a spec previa `lib/types/quadro.ts`. O plano usa `lib/quadro/status.ts` porque o arquivo carrega **lógica testável** (vencimento, WIP), não só tipos — e o runner só enxerga `.ts` dentro de `src/**`. Mesma pasta para o teste.

---

## PR-1 — Quadro em modo leitura

### Task 1: Migração do banco

**Files:**
- Create: `apps/web/supabase/migrations/20260812120000_board_quadro.sql`
- Create: `infra/tests/board-quadro-smoke.sql`
- Modify: `deploy/supabase/apply-order.txt` (append no fim)

**Interfaces:**
- Consumes: nada.
- Produces: tabelas `public.board_features` e `public.board_events`; função `public.move_card(p_key text, p_status text, p_note text, p_ref text default null, p_actor text default 'claude') returns public.board_features`.

- [ ] **Step 1: Escrever a migração**

Criar `apps/web/supabase/migrations/20260812120000_board_quadro.sql`:

```sql
-- ============================================================
-- Quadro Scrumban de features (docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md)
--
-- Dado operacional interno: SEM tenant_id, RLS ligada e SEM policy (deny-all).
-- Só service_role enxerga. NÃO entra na publicação supabase_realtime — a
-- entrega é por polling em rota autenticada.
-- Idempotente.
-- ============================================================

create table if not exists public.board_features (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  title       text not null,
  area        text not null,
  status      text not null default 'nao_existe',
  summary     text,
  blocker     text,
  evidence    text,
  evidence_at timestamptz,
  priority    text not null default 'media',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint board_features_status_valido
    check (status in ('nao_existe','em_construcao','no_ar_nao_verificado','no_ar_verificado','quebrado')),

  constraint board_features_priority_valida
    check (priority in ('alta','media','baixa')),

  -- A regra anti-mentira: verificado exige prova datada. Não é convenção, é o banco recusando.
  constraint board_features_verificado_exige_prova
    check (status <> 'no_ar_verificado' or (evidence is not null and evidence_at is not null))
);

create index if not exists board_features_status_idx
  on public.board_features (status, sort_order, created_at);

create table if not exists public.board_events (
  id          uuid primary key default gen_random_uuid(),
  feature_id  uuid references public.board_features(id) on delete cascade,
  from_status text,
  to_status   text,
  note        text,
  ref         text,
  actor       text not null default 'claude',
  created_at  timestamptz not null default now(),

  constraint board_events_actor_valido check (actor in ('claude','igor'))
);

create index if not exists board_events_created_idx
  on public.board_events (created_at desc);

alter table public.board_features enable row level security;
alter table public.board_events   enable row level security;
-- Nenhuma policy, de propósito. service_role bypassa RLS; todo o resto fica de fora.

-- ------------------------------------------------------------
-- Trigger: o evento é escrito pelo banco, não por disciplina de quem move.
-- Motivo/ref/ator chegam por GUC de transação (public.move_card seta).
-- Update cru grava evento com note nulo — e evento sem motivo é o sinal
-- de que alguém mexeu sem explicar.
-- ------------------------------------------------------------
create or replace function public.board_features_log_move()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    insert into public.board_events (feature_id, from_status, to_status, note, ref, actor)
    values (
      new.id,
      old.status,
      new.status,
      nullif(btrim(coalesce(current_setting('app.board_note', true), '')), ''),
      nullif(btrim(coalesce(current_setting('app.board_ref',  true), '')), ''),
      case when current_setting('app.board_actor', true) = 'igor' then 'igor' else 'claude' end
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists board_features_log_move on public.board_features;
create trigger board_features_log_move
  before update on public.board_features
  for each row execute function public.board_features_log_move();

-- ------------------------------------------------------------
-- public.move_card: um movimento = uma chamada. Exige motivo.
-- Ao mover para 'no_ar_verificado', carimba a prova com p_ref e a data de agora;
-- se não houver prova nenhuma, a constraint derruba o update — que é o objetivo.
-- ------------------------------------------------------------
create or replace function public.move_card(
  p_key    text,
  p_status text,
  p_note   text,
  p_ref    text default null,
  p_actor  text default 'claude'
) returns public.board_features
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.board_features;
begin
  if p_note is null or btrim(p_note) = '' then
    raise exception 'move_card exige motivo em p_note';
  end if;

  perform set_config('app.board_note',  p_note, true);
  perform set_config('app.board_ref',   coalesce(p_ref, ''), true);
  perform set_config('app.board_actor',
                     case when p_actor = 'igor' then 'igor' else 'claude' end, true);

  update public.board_features
     set status      = p_status,
         evidence    = case when p_status = 'no_ar_verificado'
                            then coalesce(p_ref, evidence) else evidence end,
         evidence_at = case when p_status = 'no_ar_verificado'
                            then now() else evidence_at end
   where key = p_key
  returning * into v_row;

  if v_row.id is null then
    raise exception 'card % nao existe', p_key;
  end if;

  return v_row;
end;
$$;

revoke all on function public.move_card(text, text, text, text, text)
  from public, anon, authenticated;
```

- [ ] **Step 2: Escrever o smoke com os asserts do contrato**

Criar `infra/tests/board-quadro-smoke.sql`:

```sql
-- ============================================================
-- Smoke do quadro (20260812120000_board_quadro.sql).
-- Como rodar: contra o Supabase de DEV, via MCP execute_sql, ou
--   psql -d <db> -v ON_ERROR_STOP=1 -f infra/tests/board-quadro-smoke.sql
-- Usa a key fixa 'smoke-quadro' e limpa tudo no fim. NÃO rode em produção.
-- ============================================================
do $$
declare
  v_events integer;
  v_note   text;
  v_actor  text;
  v_erro   text;
begin
  delete from public.board_features where key = 'smoke-quadro';

  insert into public.board_features (key, title, area, status)
  values ('smoke-quadro', 'Smoke', 'Infra', 'nao_existe');

  -- 1) verificado sem prova é recusado pela constraint
  begin
    update public.board_features set status = 'no_ar_verificado' where key = 'smoke-quadro';
    raise exception 'FALHOU: aceitou verificado sem prova';
  exception when check_violation then
    null; -- esperado
  end;

  -- 2) move_card sem motivo é recusado
  begin
    perform public.move_card('smoke-quadro', 'em_construcao', '   ');
    raise exception 'FALHOU: aceitou move_card sem motivo';
  exception when raise_exception then
    get stacked diagnostics v_erro = message_text;
    if v_erro not like '%exige motivo%' then raise; end if;
  end;

  -- 3) move_card grava o evento com motivo e ator
  perform public.move_card('smoke-quadro', 'em_construcao', 'comecou', 'PR #999', 'igor');
  select count(*), max(note), max(actor) into v_events, v_note, v_actor
    from public.board_events e
    join public.board_features f on f.id = e.feature_id
   where f.key = 'smoke-quadro';
  if v_events <> 1 then raise exception 'FALHOU: esperava 1 evento, veio %', v_events; end if;
  if v_note  <> 'comecou' then raise exception 'FALHOU: motivo nao gravado (%)', v_note; end if;
  if v_actor <> 'igor'    then raise exception 'FALHOU: ator nao gravado (%)', v_actor; end if;

  -- 4) move_card para verificado carimba a prova e passa na constraint
  perform public.move_card('smoke-quadro', 'no_ar_verificado', 'verifiquei em prod', 'query X');
  if not exists (
    select 1 from public.board_features
     where key = 'smoke-quadro' and evidence = 'query X' and evidence_at is not null
  ) then
    raise exception 'FALHOU: prova nao foi carimbada';
  end if;

  -- 5) update cru gera evento com note nulo
  update public.board_features set status = 'quebrado' where key = 'smoke-quadro';
  if not exists (
    select 1 from public.board_events e
      join public.board_features f on f.id = e.feature_id
     where f.key = 'smoke-quadro' and e.to_status = 'quebrado' and e.note is null
  ) then
    raise exception 'FALHOU: update cru nao gerou evento sem motivo';
  end if;

  -- 6) delete do card leva os eventos junto
  delete from public.board_features where key = 'smoke-quadro';
  select count(*) into v_events from public.board_events
   where feature_id not in (select id from public.board_features);
  if v_events <> 0 then raise exception 'FALHOU: % evento(s) orfao(s)', v_events; end if;

  raise notice 'SMOKE DO QUADRO: 6/6 OK';
end $$;
```

- [ ] **Step 3: Registrar em `apply-order.txt`**

Adicionar no fim de `deploy/supabase/apply-order.txt`:

```
# Quadro Scrumban de features no /admin. Dado operacional interno: sem tenant_id,
# RLS ligada e sem policy (deny-all, só service_role). Não entra na publicação
# supabase_realtime — a entrega é por polling. Idempotente.
apps/web/supabase/migrations/20260812120000_board_quadro.sql
```

- [ ] **Step 4: Aplicar no DEV e rodar o smoke**

Aplicar a migração no projeto `wfjuwogxaupyadwhvoxy` (MCP `apply_migration`, nome `board_quadro`), depois rodar o conteúdo de `infra/tests/board-quadro-smoke.sql` via MCP `execute_sql`.

Esperado: `SMOKE DO QUADRO: 6/6 OK` sem exceção. Qualquer `FALHOU:` reprova a tarefa.

- [ ] **Step 5: Rodar o advisor de segurança**

MCP `get_advisors` com `type: "security"` no projeto de dev.
Esperado: nenhum aviso **novo** citando `board_features` ou `board_events`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/supabase/migrations/20260812120000_board_quadro.sql infra/tests/board-quadro-smoke.sql deploy/supabase/apply-order.txt
git commit -m "feat(quadro): tabelas, trigger e RPC do quadro de features"
```

---

### Task 2: Lógica pura do quadro

**Files:**
- Create: `apps/web/src/lib/quadro/status.ts`
- Test: `apps/web/src/lib/quadro/status.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type BoardStatus = "nao_existe" | "em_construcao" | "no_ar_nao_verificado" | "no_ar_verificado" | "quebrado"`
  - `type BoardPriority = "alta" | "media" | "baixa"`
  - `interface BoardFeature { id, key, title, area, status, summary, blocker, evidence, evidenceAt, priority, sortOrder, createdAt, updatedAt }`
  - `interface BoardEvent { id, featureId, fromStatus, toStatus, note, ref, actor, createdAt }`
  - `BOARD_STATUSES: readonly BoardStatus[]`, `STATUS_LABELS: Record<BoardStatus, string>`, `BOARD_AREAS: readonly string[]`
  - `WIP_LIMIT_EM_CONSTRUCAO = 3`, `VERIFICATION_STALE_DAYS = 30`
  - `isVerificationStale(feature: Pick<BoardFeature,"status"|"evidenceAt">, nowMs: number): boolean`
  - `wipState(count: number, limit: number): "ok" | "cheio" | "estourado"`
  - `groupByStatus(features: BoardFeature[]): Record<BoardStatus, BoardFeature[]>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/quadro/status.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  BOARD_STATUSES,
  STATUS_LABELS,
  VERIFICATION_STALE_DAYS,
  WIP_LIMIT_EM_CONSTRUCAO,
  groupByStatus,
  isVerificationStale,
  wipState,
  type BoardFeature,
} from "./status";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-08-12T00:00:00.000Z");
const daysAgo = (n: number) => new Date(now - n * DAY).toISOString();

function feature(partial: Partial<BoardFeature> = {}): BoardFeature {
  return {
    id: "id-1",
    key: "k",
    title: "T",
    area: "Infra",
    status: "nao_existe",
    summary: null,
    blocker: null,
    evidence: null,
    evidenceAt: null,
    priority: "media",
    sortOrder: 0,
    createdAt: daysAgo(90),
    updatedAt: daysAgo(90),
    ...partial,
  };
}

// Não existe coluna "Feito": o vocabulário é o ponto do quadro.
assert.equal(BOARD_STATUSES.length, 5);
assert.ok(!BOARD_STATUSES.includes("feito" as never), "sem coluna Feito");
assert.equal(STATUS_LABELS.no_ar_nao_verificado, "No ar (não verificado)");

// Verificação vence depois de 30 dias.
{
  const fresco = feature({ status: "no_ar_verificado", evidence: "PR #1", evidenceAt: daysAgo(29) });
  const vencido = feature({ status: "no_ar_verificado", evidence: "PR #1", evidenceAt: daysAgo(31) });
  assert.equal(isVerificationStale(fresco, now), false);
  assert.equal(isVerificationStale(vencido, now), true);
  assert.equal(VERIFICATION_STALE_DAYS, 30);
}

// Exatamente 30 dias ainda não venceu — a borda é ">", não ">=".
assert.equal(
  isVerificationStale(feature({ status: "no_ar_verificado", evidenceAt: daysAgo(30) }), now),
  false,
);

// Só card verificado vence. Um "no ar não verificado" antigo não ganha selo:
// ele já está na coluna que diz a verdade.
assert.equal(
  isVerificationStale(feature({ status: "no_ar_nao_verificado", evidenceAt: daysAgo(365) }), now),
  false,
);

// Verificado sem data não vence (o banco impede o caso; a UI não deve quebrar).
assert.equal(
  isVerificationStale(feature({ status: "no_ar_verificado", evidenceAt: null }), now),
  false,
);

// WIP: abaixo do teto, no teto, acima do teto.
assert.equal(WIP_LIMIT_EM_CONSTRUCAO, 3);
assert.equal(wipState(2, 3), "ok");
assert.equal(wipState(3, 3), "cheio");
assert.equal(wipState(4, 3), "estourado");
assert.equal(wipState(0, 3), "ok");

// Agrupamento devolve as 5 chaves, mesmo vazias — a coluna existe sem card.
{
  const grupos = groupByStatus([
    feature({ id: "a", key: "a", status: "quebrado" }),
    feature({ id: "b", key: "b", status: "quebrado" }),
  ]);
  assert.equal(Object.keys(grupos).length, 5);
  assert.equal(grupos.quebrado.length, 2);
  assert.equal(grupos.nao_existe.length, 0);
}

// Ordenação dentro da coluna: sort_order primeiro, depois título.
{
  const grupos = groupByStatus([
    feature({ id: "2", key: "z", title: "Zebra", status: "em_construcao", sortOrder: 0 }),
    feature({ id: "1", key: "a", title: "Alfa", status: "em_construcao", sortOrder: 0 }),
    feature({ id: "0", key: "p", title: "Prioritario", status: "em_construcao", sortOrder: -1 }),
  ]);
  assert.deepEqual(grupos.em_construcao.map((f) => f.title), ["Prioritario", "Alfa", "Zebra"]);
}
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npm --workspace apps/web test
```

Esperado: FALHA com erro de módulo não encontrado (`Cannot find module './status'`).

- [ ] **Step 3: Implementar o módulo**

Criar `apps/web/src/lib/quadro/status.ts`:

```ts
export const BOARD_STATUSES = [
  "nao_existe",
  "em_construcao",
  "no_ar_nao_verificado",
  "no_ar_verificado",
  "quebrado",
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];
export type BoardPriority = "alta" | "media" | "baixa";

export const STATUS_LABELS: Record<BoardStatus, string> = {
  nao_existe: "Não existe",
  em_construcao: "Em construção",
  no_ar_nao_verificado: "No ar (não verificado)",
  no_ar_verificado: "No ar verificado",
  quebrado: "Quebrado / dívida",
};

export const BOARD_AREAS = [
  "Grupos",
  "Campanhas",
  "Disparos",
  "Automações",
  "Páginas",
  "Auth",
  "Engine/Worker",
  "Admin",
  "Landing",
  "Infra",
] as const;

/** Teto visual da coluna "Em construção". Não há trava no banco: trava vira gambiarra. */
export const WIP_LIMIT_EM_CONSTRUCAO = 3;

/** Verificação com mais de 30 dias ganha selo de vencida. */
export const VERIFICATION_STALE_DAYS = 30;

export interface BoardFeature {
  id: string;
  key: string;
  title: string;
  area: string;
  status: BoardStatus;
  summary: string | null;
  blocker: string | null;
  evidence: string | null;
  evidenceAt: string | null;
  priority: BoardPriority;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardEvent {
  id: string;
  featureId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  ref: string | null;
  actor: "claude" | "igor";
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Só card verificado vence. Um "no ar não verificado" antigo não ganha selo —
 * ele já está na coluna que conta a verdade.
 */
export function isVerificationStale(
  feature: Pick<BoardFeature, "status" | "evidenceAt">,
  nowMs: number,
): boolean {
  if (feature.status !== "no_ar_verificado") return false;
  if (!feature.evidenceAt) return false;

  const stampedAt = Date.parse(feature.evidenceAt);
  if (Number.isNaN(stampedAt)) return false;

  return nowMs - stampedAt > VERIFICATION_STALE_DAYS * DAY_MS;
}

export function wipState(count: number, limit: number): "ok" | "cheio" | "estourado" {
  if (count > limit) return "estourado";
  if (count === limit) return "cheio";
  return "ok";
}

export function groupByStatus(features: BoardFeature[]): Record<BoardStatus, BoardFeature[]> {
  const grupos = Object.fromEntries(
    BOARD_STATUSES.map((status) => [status, [] as BoardFeature[]]),
  ) as Record<BoardStatus, BoardFeature[]>;

  for (const feature of features) {
    grupos[feature.status]?.push(feature);
  }

  for (const status of BOARD_STATUSES) {
    grupos[status].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "pt-BR"),
    );
  }

  return grupos;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
npm --workspace apps/web test
```

Esperado: PASS, sem falha nova em nenhum outro arquivo de teste.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quadro/status.ts apps/web/src/lib/quadro/status.test.ts
git commit -m "feat(quadro): logica de vencimento de verificacao, WIP e agrupamento"
```

---

### Task 3: Store e rota de leitura

**Files:**
- Create: `apps/web/src/lib/stores/quadro.ts`
- Create: `apps/web/src/app/api/admin/quadro/route.ts`

**Interfaces:**
- Consumes: `BoardFeature`, `BoardEvent`, `BoardStatus` de `@/lib/quadro/status`; `getSupabaseAdmin` de `@/lib/supabase/server`; `getAdminContext` de `@/lib/admin-guard`.
- Produces:
  - `loadQuadro(): Promise<QuadroSnapshot>` onde `interface QuadroSnapshot { features: BoardFeature[]; events: BoardEvent[] }`
  - `GET /api/admin/quadro` → `200 { features, events }` ou `401 { error: "Unauthorized" }`

- [ ] **Step 1: Escrever a store**

Criar `apps/web/src/lib/stores/quadro.ts`:

```ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { BoardEvent, BoardFeature, BoardPriority, BoardStatus } from "@/lib/quadro/status";

export interface QuadroSnapshot {
  features: BoardFeature[];
  events: BoardEvent[];
}

const FEED_LIMIT = 30;

type FeatureRow = {
  id: string;
  key: string;
  title: string;
  area: string;
  status: string;
  summary: string | null;
  blocker: string | null;
  evidence: string | null;
  evidence_at: string | null;
  priority: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  feature_id: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  ref: string | null;
  actor: string;
  created_at: string;
};

function toFeature(row: FeatureRow): BoardFeature {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    area: row.area,
    status: row.status as BoardStatus,
    summary: row.summary,
    blocker: row.blocker,
    evidence: row.evidence,
    evidenceAt: row.evidence_at,
    priority: row.priority as BoardPriority,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEvent(row: EventRow): BoardEvent {
  return {
    id: row.id,
    featureId: row.feature_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    ref: row.ref,
    actor: row.actor === "igor" ? "igor" : "claude",
    createdAt: row.created_at,
  };
}

/**
 * Lê o quadro inteiro. São dezenas de cards, não milhares — buscar tudo e
 * agrupar em memória é mais simples e mais barato que paginar.
 */
export async function loadQuadro(): Promise<QuadroSnapshot> {
  const supabase = getSupabaseAdmin();

  const [featuresResult, eventsResult] = await Promise.all([
    supabase
      .from("board_features")
      .select(
        "id, key, title, area, status, summary, blocker, evidence, evidence_at, priority, sort_order, created_at, updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    supabase
      .from("board_events")
      .select("id, feature_id, from_status, to_status, note, ref, actor, created_at")
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
  ]);

  if (featuresResult.error) {
    throw new Error(`Falha ao ler board_features: ${featuresResult.error.message}`);
  }
  if (eventsResult.error) {
    throw new Error(`Falha ao ler board_events: ${eventsResult.error.message}`);
  }

  return {
    features: ((featuresResult.data ?? []) as FeatureRow[]).map(toFeature),
    events: ((eventsResult.data ?? []) as EventRow[]).map(toEvent),
  };
}
```

- [ ] **Step 2: Escrever a rota**

Criar `apps/web/src/app/api/admin/quadro/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { loadQuadro } from "@/lib/stores/quadro";

export const dynamic = "force-dynamic";

/** GET — snapshot do quadro (cards + últimos 30 eventos). Alimenta o polling. */
export async function GET() {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await loadQuadro();
    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar tipos e lint**

```bash
npm --workspace apps/web run lint
```

Esperado: sem erro nos dois arquivos novos.

- [ ] **Step 4: Provar que a rota nega quem não é admin**

Com o dev server rodando (`npm run web:dev`), sem cookie de sessão:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/quadro
```

Esperado: `401`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/quadro.ts apps/web/src/app/api/admin/quadro/route.ts
git commit -m "feat(quadro): store com service role e rota GET protegida"
```

---

### Task 4: Página, colunas e feed

**Files:**
- Create: `apps/web/src/app/admin/quadro/page.tsx`
- Create: `apps/web/src/components/admin/quadro/board.tsx`
- Create: `apps/web/src/components/admin/quadro/card.tsx`
- Create: `apps/web/src/components/admin/quadro/feed.tsx`
- Modify: `apps/web/src/components/admin/sidebar.tsx` (seção "Sistema")

**Interfaces:**
- Consumes: `loadQuadro`, `QuadroSnapshot`; tudo de `@/lib/quadro/status`.
- Produces: rota `/admin/quadro`; componente `<QuadroBoard initial={snapshot} />`.

- [ ] **Step 1: Escrever o card**

Criar `apps/web/src/components/admin/quadro/card.tsx`:

```tsx
"use client";

import { isVerificationStale, type BoardFeature } from "@/lib/quadro/status";

const PRIORITY_STYLE: Record<BoardFeature["priority"], string> = {
  alta: "bg-danger-700/10 text-danger-700",
  media: "bg-aco/10 text-aco",
  baixa: "bg-aco/5 text-aco/60",
};

function diasDesde(iso: string, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(iso)) / (24 * 60 * 60 * 1000));
}

interface QuadroCardProps {
  feature: BoardFeature;
  nowMs: number;
}

export function QuadroCard({ feature, nowMs }: QuadroCardProps) {
  const vencido = isVerificationStale(feature, nowMs);

  return (
    <article className="rounded-lg border border-line-200 bg-paper-0 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-volt-950">{feature.title}</h3>
        <span
          className={`font-data shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${PRIORITY_STYLE[feature.priority]}`}
        >
          {feature.priority}
        </span>
      </div>

      <p className="font-data mt-1 text-[10px] uppercase tracking-wider text-aco/55">
        {feature.area}
      </p>

      {feature.summary ? (
        <p className="mt-2 text-xs leading-relaxed text-aco/80">{feature.summary}</p>
      ) : null}

      {feature.blocker ? (
        <p className="mt-2 rounded bg-danger-700/8 px-2 py-1 text-xs leading-relaxed text-danger-700">
          <span className="font-semibold">Trava:</span> {feature.blocker}
        </p>
      ) : null}

      {feature.status === "no_ar_verificado" && feature.evidenceAt ? (
        <p
          className={`font-data mt-2 text-[10px] uppercase tracking-wider ${vencido ? "text-danger-700" : "text-aco/45"}`}
        >
          {vencido ? "⚠ verificação vencida · " : "verificado "}
          há {diasDesde(feature.evidenceAt, nowMs)} dias
          {feature.evidence ? ` · ${feature.evidence}` : ""}
        </p>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 2: Escrever o feed**

Criar `apps/web/src/components/admin/quadro/feed.tsx`:

```tsx
"use client";

import { useState } from "react";
import { STATUS_LABELS, type BoardEvent, type BoardFeature, type BoardStatus } from "@/lib/quadro/status";

function rotulo(status: string | null): string {
  if (!status) return "—";
  return STATUS_LABELS[status as BoardStatus] ?? status;
}

function horario(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface QuadroFeedProps {
  events: BoardEvent[];
  features: BoardFeature[];
}

export function QuadroFeed({ events, features }: QuadroFeedProps) {
  const [aberto, setAberto] = useState(true);
  const titulos = new Map(features.map((f) => [f.id, f.title]));

  return (
    <aside className="w-full shrink-0 lg:w-72">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="font-data flex w-full items-center justify-between rounded-lg border border-line-200 bg-paper-0 px-3 py-2 text-[11px] uppercase tracking-wider text-aco/70"
      >
        Atividade
        <span aria-hidden="true">{aberto ? "−" : "+"}</span>
      </button>

      {aberto ? (
        <ol className="mt-2 space-y-2">
          {events.length === 0 ? (
            <li className="px-1 text-xs text-aco/50">Nenhum movimento ainda.</li>
          ) : null}

          {events.map((event) => (
            <li key={event.id} className="rounded-lg border border-line-200 bg-paper-0 p-2.5">
              <p className="font-data text-[10px] uppercase tracking-wider text-aco/45">
                {horario(event.createdAt)} · {event.actor}
              </p>
              <p className="mt-1 text-xs font-semibold text-volt-950">
                {event.featureId ? titulos.get(event.featureId) ?? "(card removido)" : "—"}
              </p>
              <p className="mt-0.5 text-xs text-aco/70">
                {rotulo(event.fromStatus)} → {rotulo(event.toStatus)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-aco/80">
                {event.note ?? <span className="text-danger-700">movido sem motivo registrado</span>}
              </p>
              {event.ref ? (
                <p className="font-data mt-1 text-[10px] uppercase tracking-wider text-aco/45">
                  {event.ref}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 3: Escrever o board com polling**

Criar `apps/web/src/components/admin/quadro/board.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BOARD_STATUSES,
  STATUS_LABELS,
  WIP_LIMIT_EM_CONSTRUCAO,
  groupByStatus,
  wipState,
  type BoardEvent,
  type BoardFeature,
} from "@/lib/quadro/status";
import { QuadroCard } from "./card";
import { QuadroFeed } from "./feed";

const POLL_MS = 4000;

const WIP_STYLE = {
  ok: "text-aco/45",
  cheio: "text-aco/70",
  estourado: "text-danger-700",
} as const;

interface QuadroBoardProps {
  initial: { features: BoardFeature[]; events: BoardEvent[] };
}

export function QuadroBoard({ initial }: QuadroBoardProps) {
  const [snapshot, setSnapshot] = useState(initial);
  const [area, setArea] = useState<string>("todas");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelado = false;

    async function puxar() {
      try {
        const resposta = await fetch("/api/admin/quadro", { cache: "no-store" });
        if (!resposta.ok) return;
        const dados = (await resposta.json()) as QuadroBoardProps["initial"];
        if (!cancelado) {
          setSnapshot(dados);
          setNowMs(Date.now());
        }
      } catch {
        // Falha de rede é transitória: o próximo ciclo tenta de novo.
      }
    }

    const timer = setInterval(puxar, POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, []);

  const areas = useMemo(
    () => Array.from(new Set(snapshot.features.map((f) => f.area))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [snapshot.features],
  );

  const visiveis = area === "todas"
    ? snapshot.features
    : snapshot.features.filter((f) => f.area === area);

  const grupos = groupByStatus(visiveis);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="quadro-area" className="font-data text-[11px] uppercase tracking-wider text-aco/55">
          Área
        </label>
        <select
          id="quadro-area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="rounded-lg border border-line-200 bg-paper-0 px-2 py-1 text-xs text-volt-950"
        >
          <option value="todas">Todas ({snapshot.features.length})</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-2">
          {BOARD_STATUSES.map((status) => {
            const cards = grupos[status];
            const temLimite = status === "em_construcao";
            const estado = temLimite ? wipState(cards.length, WIP_LIMIT_EM_CONSTRUCAO) : "ok";

            return (
              <section key={status} className="flex w-64 shrink-0 flex-col gap-2">
                <header className="flex items-baseline justify-between px-1">
                  <h2 className="font-data text-[11px] uppercase tracking-wider text-aco/70">
                    {STATUS_LABELS[status]}
                  </h2>
                  <span className={`font-data text-[11px] ${WIP_STYLE[estado]}`}>
                    {temLimite ? `${cards.length}/${WIP_LIMIT_EM_CONSTRUCAO}` : cards.length}
                  </span>
                </header>

                {cards.map((feature) => (
                  <QuadroCard key={feature.id} feature={feature} nowMs={nowMs} />
                ))}
              </section>
            );
          })}
        </div>

        <QuadroFeed events={snapshot.events} features={snapshot.features} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Escrever a página**

Criar `apps/web/src/app/admin/quadro/page.tsx`:

```tsx
import { loadQuadro } from "@/lib/stores/quadro";
import { QuadroBoard } from "@/components/admin/quadro/board";

export const dynamic = "force-dynamic";

export default async function AdminQuadroPage() {
  const snapshot = await loadQuadro();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Quadro</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          {snapshot.features.length} features · atualiza sozinho a cada 4s
        </p>
      </div>

      <QuadroBoard initial={snapshot} />
    </div>
  );
}
```

- [ ] **Step 5: Adicionar o item na sidebar**

Em `apps/web/src/components/admin/sidebar.tsx`, na seção `"Sistema"`, inserir como **primeiro** item da lista (antes de `/admin/alertas`):

```tsx
      { href: "/admin/quadro", label: "Quadro", icon: KanbanSquare },
```

E acrescentar `KanbanSquare` ao import de `lucide-react` já existente no arquivo.

- [ ] **Step 6: Semear dois cards no dev e conferir na tela**

Rodar no Supabase de dev (MCP `execute_sql`):

```sql
insert into public.board_features (key, title, area, status, summary, blocker, priority)
values
  ('semente-em-construcao', 'Semente em construção', 'Infra', 'em_construcao',
   'Card de semente do dev. Pode apagar.', null, 'baixa'),
  ('semente-travada', 'Semente travada', 'Grupos', 'quebrado',
   'Card de semente do dev. Pode apagar.', 'Trava de exemplo, para conferir o estilo vermelho.', 'alta')
on conflict (key) do nothing;
```

Subir o dev server, abrir `/admin/quadro` autenticado como admin e conferir:
as 5 colunas aparecem (inclusive as vazias), o contador de "Em construção" mostra `1/3`,
o card travado mostra a trava em vermelho, e o feed mostra "Nenhum movimento ainda".

Depois mover um card pelo MCP e confirmar que **a tela muda sozinha em até 4 segundos**, sem recarregar:

```sql
select public.move_card('semente-em-construcao', 'no_ar_nao_verificado', 'conferindo o polling', 'plano task 4');
```

- [ ] **Step 7: Lint e build**

```bash
npm --workspace apps/web run lint
```

Esperado: limpo nos arquivos novos.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/admin/quadro/page.tsx apps/web/src/components/admin/quadro apps/web/src/components/admin/sidebar.tsx
git commit -m "feat(quadro): pagina do quadro com colunas, feed e polling de 4s"
```

---

### Task 5: Aplicar em produção e abrir o PR-1

**Files:** nenhum arquivo novo.

**Interfaces:**
- Consumes: a migração da Task 1.
- Produces: schema do quadro presente em prod.

- [ ] **Step 1: Aplicar a migração no PROD**

MCP `apply_migration` no projeto `nidoatbxaylrkcgbszns`, nome `board_quadro`, com o conteúdo idêntico ao arquivo da Task 1.

- [ ] **Step 2: Rodar o smoke no PROD**

Rodar `infra/tests/board-quadro-smoke.sql` via MCP `execute_sql` no projeto de prod.
Esperado: `SMOKE DO QUADRO: 6/6 OK`. O smoke usa a key fixa `smoke-quadro` e apaga o próprio rastro.

- [ ] **Step 3: Conferir que os dois bancos têm o mesmo schema**

Rodar nos **dois** projetos:

```sql
select table_name, count(*) as colunas
  from information_schema.columns
 where table_schema = 'public' and table_name in ('board_features','board_events')
 group by table_name order by table_name;
```

Esperado: resultado idêntico nos dois — `board_events` com 8 colunas, `board_features` com 13.

- [ ] **Step 4: Rodar o advisor de segurança no PROD**

MCP `get_advisors`, `type: "security"`. Esperado: nenhum aviso novo citando as duas tabelas.

- [ ] **Step 5: Abrir o PR-1**

```bash
git push -u origin feat/quadro-scrumban
gh pr create --title "feat(quadro): quadro Scrumban de features no /admin (PR-1)" --body "Ver docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md. Migração aplicada em dev e prod, smoke 6/6 nos dois."
```

---

## PR-2 — Edição

### Task 6: Escrita na API

**Files:**
- Modify: `apps/web/src/lib/stores/quadro.ts` (append)
- Modify: `apps/web/src/app/api/admin/quadro/route.ts` (append)

**Interfaces:**
- Consumes: `loadQuadro`, `QuadroSnapshot`, `BoardFeature` da Task 3; `public.move_card` da Task 1.
- Produces:
  - `moveCard(input: { key: string; status: BoardStatus; note: string; ref?: string | null }): Promise<void>`
  - `updateFeature(key: string, patch: { summary?: string | null; blocker?: string | null; priority?: BoardPriority; sortOrder?: number }): Promise<void>`
  - `createFeature(input: { key: string; title: string; area: string; summary?: string | null; priority?: BoardPriority }): Promise<void>`
  - `PATCH /api/admin/quadro` → `200 { success: true }` · `400` · `401` · `500`
  - `POST /api/admin/quadro` → `201 { success: true }` · `400` · `401` · `409` (key repetida) · `500`

- [ ] **Step 1: Acrescentar as funções de escrita na store**

Ao fim de `apps/web/src/lib/stores/quadro.ts`. **Não acrescentar import novo** — o `import type { BoardEvent, BoardFeature, BoardPriority, BoardStatus }` do topo, criado na Task 3, já cobre tudo que estas funções usam.

```ts
/** Move o card. O ator é sempre 'igor': quem passa por aqui é a UI, não o agente. */
export async function moveCard(input: {
  key: string;
  status: BoardStatus;
  note: string;
  ref?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.rpc("move_card", {
    p_key: input.key,
    p_status: input.status,
    p_note: input.note,
    p_ref: input.ref ?? null,
    p_actor: "igor",
  });

  if (error) throw new Error(`Falha ao mover ${input.key}: ${error.message}`);
}

/** Edita campos que não são status. Mudança de status passa obrigatoriamente por moveCard. */
export async function updateFeature(
  key: string,
  patch: {
    summary?: string | null;
    blocker?: string | null;
    priority?: BoardPriority;
    sortOrder?: number;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const row: Record<string, unknown> = {};
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.blocker !== undefined) row.blocker = patch.blocker;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;

  if (Object.keys(row).length === 0) return;

  const { error } = await supabase.from("board_features").update(row).eq("key", key);
  if (error) throw new Error(`Falha ao editar ${key}: ${error.message}`);
}

export async function createFeature(input: {
  key: string;
  title: string;
  area: string;
  summary?: string | null;
  priority?: BoardPriority;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("board_features").insert({
    key: input.key,
    title: input.title,
    area: input.area,
    summary: input.summary ?? null,
    priority: input.priority ?? "media",
    status: "nao_existe",
  });

  if (error) {
    // 23505 = unique_violation na coluna key
    if (error.code === "23505") throw new Error(`DUPLICADO:${input.key}`);
    throw new Error(`Falha ao criar ${input.key}: ${error.message}`);
  }
}
```

- [ ] **Step 2: Acrescentar `PATCH` e `POST` na rota**

Primeiro, **no topo do arquivo**, ajustar os imports que a Task 3 deixou — `NextRequest` entra na linha do `next/server` existente, e as duas linhas novas vão junto das outras:

```ts
import { NextRequest, NextResponse } from "next/server";
import { BOARD_STATUSES, type BoardPriority, type BoardStatus } from "@/lib/quadro/status";
import { createFeature, loadQuadro, moveCard, updateFeature } from "@/lib/stores/quadro";
```

Depois, **ao fim** de `apps/web/src/app/api/admin/quadro/route.ts`:

```ts
const PRIORIDADES: readonly BoardPriority[] = ["alta", "media", "baixa"];

/**
 * PATCH — move o card ou edita seus campos.
 * Body: { key, status?, note?, ref?, summary?, blocker?, priority?, sortOrder? }
 * Mover exige `note`: o motivo é o que dá valor ao feed.
 */
export async function PATCH(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    key?: string;
    status?: string;
    note?: string;
    ref?: string | null;
    summary?: string | null;
    blocker?: string | null;
    priority?: string;
    sortOrder?: number;
  };

  if (!body.key) return NextResponse.json({ error: "key obrigatória" }, { status: 400 });

  try {
    if (body.status !== undefined) {
      if (!BOARD_STATUSES.includes(body.status as BoardStatus)) {
        return NextResponse.json({ error: `status inválido: ${body.status}` }, { status: 400 });
      }
      if (!body.note?.trim()) {
        return NextResponse.json({ error: "mover exige motivo" }, { status: 400 });
      }
      await moveCard({
        key: body.key,
        status: body.status as BoardStatus,
        note: body.note,
        ref: body.ref ?? null,
      });
    }

    if (body.priority !== undefined && !PRIORIDADES.includes(body.priority as BoardPriority)) {
      return NextResponse.json({ error: `prioridade inválida: ${body.priority}` }, { status: 400 });
    }

    await updateFeature(body.key, {
      summary: body.summary,
      blocker: body.blocker,
      priority: body.priority as BoardPriority | undefined,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — cria card novo, sempre em 'nao_existe'. Body: { key, title, area, summary?, priority? } */
export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    key?: string;
    title?: string;
    area?: string;
    summary?: string | null;
    priority?: string;
  };

  if (!body.key || !body.title || !body.area) {
    return NextResponse.json({ error: "key, title e area são obrigatórios" }, { status: 400 });
  }

  try {
    await createFeature({
      key: body.key,
      title: body.title,
      area: body.area,
      summary: body.summary ?? null,
      priority: (body.priority as BoardPriority | undefined) ?? "media",
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    if (message.startsWith("DUPLICADO:")) {
      return NextResponse.json({ error: "já existe card com essa key" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Provar os quatro caminhos com curl**

Dev server rodando, autenticado como admin (usar o cookie de sessão do navegador em `-b`):

```bash
curl -s -X PATCH localhost:3000/api/admin/quadro -H 'content-type: application/json' -d '{"key":"semente-travada","status":"em_construcao"}'
curl -s -X PATCH localhost:3000/api/admin/quadro -H 'content-type: application/json' -d '{"key":"semente-travada","status":"inventado","note":"x"}'
curl -s -X PATCH localhost:3000/api/admin/quadro -H 'content-type: application/json' -d '{"key":"semente-travada","status":"em_construcao","note":"destravando"}'
curl -s -X POST  localhost:3000/api/admin/quadro -H 'content-type: application/json' -d '{"key":"semente-travada","title":"Repetida","area":"Infra"}'
```

Esperado, na ordem: `400 mover exige motivo` · `400 status inválido` · `200 success` · `409 já existe card com essa key`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/stores/quadro.ts apps/web/src/app/api/admin/quadro/route.ts
git commit -m "feat(quadro): PATCH e POST para mover, editar e criar card"
```

---

### Task 7: Controles de edição no card

**Files:**
- Modify: `apps/web/src/components/admin/quadro/card.tsx`
- Modify: `apps/web/src/components/admin/quadro/board.tsx`
- Create: `apps/web/src/components/admin/quadro/novo-card.tsx`

**Interfaces:**
- Consumes: `PATCH`/`POST /api/admin/quadro` da Task 6.
- Produces: `<NovoCardForm onCriado={() => void} />`; `QuadroCardProps` ganha `onMudou: () => void`.

- [ ] **Step 1: Acrescentar o seletor de status no card**

Em `card.tsx`, estender a interface e o corpo. A prop `onMudou` avisa o board para puxar o snapshot na hora, sem esperar o ciclo de 4s:

```tsx
interface QuadroCardProps {
  feature: BoardFeature;
  nowMs: number;
  onMudou: () => void;
}
```

Dentro de `QuadroCard`, antes do `return`:

```tsx
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function mover(status: BoardStatus) {
    const note = window.prompt("Por que está movendo? (vai pro feed)");
    if (!note?.trim()) return;

    const ref = status === "no_ar_verificado"
      ? window.prompt("Prova (PR, query, arquivo) — obrigatória para verificado:")
      : window.prompt("Referência (PR, commit, arquivo) — opcional:");

    if (status === "no_ar_verificado" && !ref?.trim()) {
      setErro("Verificado exige prova.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/admin/quadro", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: feature.key, status, note, ref: ref ?? null }),
      });
      if (!resposta.ok) {
        const dados = (await resposta.json()) as { error?: string };
        setErro(dados.error ?? "Falhou");
        return;
      }
      onMudou();
    } catch {
      setErro("Rede falhou. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }
```

E no fim do `<article>`, antes de fechar:

```tsx
      <label className="sr-only" htmlFor={`mover-${feature.key}`}>
        Mover {feature.title}
      </label>
      <select
        id={`mover-${feature.key}`}
        value={feature.status}
        disabled={salvando}
        onChange={(e) => mover(e.target.value as BoardStatus)}
        className="mt-2 w-full rounded border border-line-200 bg-canvas-100 px-1.5 py-1 text-[11px] text-aco disabled:opacity-50"
      >
        {BOARD_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      {erro ? <p className="mt-1 text-[11px] text-danger-700">{erro}</p> : null}
```

Acrescentar aos imports do arquivo: `useState` de `react`; `BOARD_STATUSES`, `STATUS_LABELS`, `type BoardStatus` de `@/lib/quadro/status`.

- [ ] **Step 2: Escrever o formulário de card novo**

Criar `apps/web/src/components/admin/quadro/novo-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BOARD_AREAS } from "@/lib/quadro/status";

interface NovoCardFormProps {
  onCriado: () => void;
}

export function NovoCardForm({ onCriado }: NovoCardFormProps) {
  const [aberto, setAberto] = useState(false);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<string>(BOARD_AREAS[0]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /** A key é derivada do título: estável, legível e é por ela que o agente move o card. */
  const key = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!key) {
      setErro("Título vazio.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/admin/quadro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, title, area }),
      });
      if (!resposta.ok) {
        const dados = (await resposta.json()) as { error?: string };
        setErro(dados.error ?? "Falhou");
        return;
      }
      setTitle("");
      setAberto(false);
      onCriado();
    } catch {
      setErro("Rede falhou. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg border border-line-200 bg-paper-0 px-3 py-1.5 text-xs font-semibold text-volt-950"
      >
        Novo card
      </button>
    );
  }

  return (
    <form onSubmit={criar} className="flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título da feature"
        aria-label="Título da feature"
        className="rounded-lg border border-line-200 bg-paper-0 px-2 py-1 text-xs text-volt-950"
      />
      <select
        value={area}
        onChange={(e) => setArea(e.target.value)}
        aria-label="Área"
        className="rounded-lg border border-line-200 bg-paper-0 px-2 py-1 text-xs text-volt-950"
      >
        {BOARD_AREAS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={salvando}
        className="rounded-lg bg-volt-950 px-3 py-1.5 text-xs font-semibold text-paper-0 disabled:opacity-50"
      >
        Criar
      </button>
      <button type="button" onClick={() => setAberto(false)} className="text-xs text-aco/60">
        Cancelar
      </button>
      {key ? <span className="font-data text-[10px] text-aco/45">key: {key}</span> : null}
      {erro ? <span className="text-[11px] text-danger-700">{erro}</span> : null}
    </form>
  );
}
```

- [ ] **Step 3: Ligar os dois no board**

Em `board.tsx`: extrair a função `puxar` do `useEffect` para o corpo do componente (envolvida em `useCallback`), passar como `onMudou` para cada `<QuadroCard>` e como `onCriado` para `<NovoCardForm>`, e renderizar o formulário ao lado do filtro de área:

```tsx
  const puxar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/admin/quadro", { cache: "no-store" });
      if (!resposta.ok) return;
      const dados = (await resposta.json()) as QuadroBoardProps["initial"];
      setSnapshot(dados);
      setNowMs(Date.now());
    } catch {
      // Falha de rede é transitória: o próximo ciclo tenta de novo.
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(puxar, POLL_MS);
    return () => clearInterval(timer);
  }, [puxar]);
```

Acrescentar `useCallback` ao import de `react` e `NovoCardForm` aos imports locais.

- [ ] **Step 4: Conferir os três caminhos na tela**

Com o dev server, em `/admin/quadro`:
1. mover um card e cancelar o prompt de motivo → nada acontece;
2. mover para "No ar verificado" sem preencher a prova → aparece "Verificado exige prova." e o card não muda;
3. mover com motivo e prova → o card troca de coluna e o feed ganha a linha na hora, sem esperar os 4s.

- [ ] **Step 5: Lint**

```bash
npm --workspace apps/web run lint
```

- [ ] **Step 6: Commit e PR-2**

```bash
git add apps/web/src/components/admin/quadro
git commit -m "feat(quadro): mover card pelo seletor e criar card novo"
gh pr create --title "feat(quadro): edicao do quadro (PR-2)" --body "Ver docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md."
```

---

## PR-3 — Carga e regra

### Task 8: Regra de manutenção no CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (nova seção antes de "Comandos rápidos")

**Interfaces:**
- Consumes: `public.move_card` da Task 1.
- Produces: nada em código.

- [ ] **Step 1: Escrever a seção**

Inserir em `CLAUDE.md`, logo antes de `## Comandos rápidos (diga isso no chat)`:

```markdown
## Quadro de features (`/admin/quadro`)

O estado das features vive em `board_features` no Supabase de **produção**
(`nidoatbxaylrkcgbszns`) — dev é rascunho. Spec:
`docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md`.

**Ao terminar qualquer feature ou PR, mova o card no mesmo passo** — em prod:

```sql
select public.move_card('<key>', '<status>', '<motivo>', '<PR #N ou arquivo>');
```

Status: `nao_existe` · `em_construcao` · `no_ar_nao_verificado` · `no_ar_verificado` · `quebrado`.

**`no_ar_verificado` só com prova colhida na hora.** Mergeado não é verificado; rodando
em produção não é verificado. Verificado é ter olhado e visto funcionar. O banco recusa
o movimento sem prova, e a prova vence em 30 dias.

Quando a feature estiver parada, escreva o motivo em `blocker` — é o campo que teria
mostrado "`invite_url` não tem UI" antes de virar incidente.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: regra de manutencao do quadro de features"
```

---

### Task 9: Carga inicial das features

**Files:**
- Create: `docs/quadro-carga-inicial.sql` (o insert, versionado para poder reexecutar)

**Interfaces:**
- Consumes: `public.board_features` da Task 1.
- Produces: as linhas do quadro em prod.

- [ ] **Step 1: Levantar as features das fontes**

Ler, nesta ordem, anotando cada feature com área, uma linha de resumo e a trava quando houver:
`TASK_PROGRESS.md` (sprints F0–F5); `gh pr list --state merged --limit 100`;
`docs/plano-grupos-campanhas-2026-08-10.md`, `docs/plano-aba-paginas-opus5.md`,
`docs/plano-aba-configuracoes-opus5.md`, `docs/plano-implementacao-paginas-2026-08-11.md`;
`docs/superpowers/specs/` e `plans/`.

- [ ] **Step 2: Escrever o SQL da carga**

Criar `docs/quadro-carga-inicial.sql` no formato abaixo, uma linha por feature.
**Regra da carga: nada entra em `no_ar_verificado`.** Mesmo mergeado, mesmo rodando em
produção — sem prova colhida na hora, o card nasce em `no_ar_nao_verificado`.

```sql
-- Carga inicial do quadro. Idempotente: reexecutar não duplica nem sobrescreve
-- movimento manual (on conflict do nothing).
insert into public.board_features (key, title, area, status, summary, blocker, priority) values
  ('grupos-auto-grow', 'Auto-grow de grupos', 'Grupos', 'no_ar_nao_verificado',
   'Cria grupo novo quando o pool lota. Fila em Supabase.',
   'Nunca rodou com pool real: o gate honesto entrou no PR #90 e não foi exercitado.', 'alta'),
  ('grupos-invite-url', 'Link mestre de convite', 'Grupos', 'quebrado',
   'Link único que distribui entrada entre os grupos.',
   'Depende de invite_url, que o lojista não tem UI para preencher — só via PATCH /api/groups.', 'alta'),
  ('automacoes-executor', 'Executor de automações', 'Automações', 'no_ar_nao_verificado',
   'Worker em apps/worker que dispara as automações do lojista.',
   'Vivo em produção e ocioso: zero automações ligadas, então nunca executou de verdade.', 'alta')
  -- … uma linha por feature levantada no Step 1
on conflict (key) do nothing;
```

- [ ] **Step 3: Aplicar em PROD e conferir a distribuição**

Rodar o arquivo via MCP `execute_sql` no projeto `nidoatbxaylrkcgbszns`, depois:

```sql
select status, count(*) from public.board_features group by status order by count(*) desc;
```

Esperado: a maioria em `no_ar_nao_verificado`, **zero** em `no_ar_verificado`. Se aparecer
algum verificado, a regra da carga foi violada — corrigir antes de seguir.

- [ ] **Step 4: Limpar as sementes de dev**

```sql
delete from public.board_features where key like 'semente-%' or key = 'smoke-quadro';
```

Rodar nos dois bancos.

- [ ] **Step 5: Commit e PR-3**

```bash
git add docs/quadro-carga-inicial.sql
git commit -m "docs(quadro): carga inicial das features do produto"
gh pr create --title "feat(quadro): carga inicial e regra de manutencao (PR-3)" --body "Ver docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md."
```

---

## Rastreamento spec → tarefa

| requisito da spec | tarefa |
|---|---|
| Rota `/admin/quadro` atrás de `requireAdmin` | 4 |
| Tabelas nos dois bancos, canônico em prod | 1, 5 |
| RLS deny-all, sem policy, fora da publicação realtime | 1 |
| Constraint "verificado exige prova" | 1 (smoke asserts 1 e 4) |
| Evento escrito por trigger, inclusive em update cru | 1 (smoke asserts 3 e 5) |
| RPC `public.move_card` com motivo obrigatório | 1 (smoke assert 2) |
| 5 colunas de maturidade, sem "Feito" | 2, 4 |
| Filtro por área, não raia | 4 |
| WIP visual `2/3`, vermelho ao estourar | 2, 4 |
| Selo de verificação vencida em 30 dias | 2, 4 |
| Card mostra blocker em vermelho | 4 |
| Feed dos últimos 30 eventos, colapsável | 3, 4 |
| Polling de 4s | 4 |
| Igor move por seletor, cria card, edita | 6, 7 |
| Regra no `CLAUDE.md` | 8 |
| Carga inicial sem nada em verificado | 9 |
| Fora de escopo: burndown, sprint, drag-and-drop | nenhuma tarefa, por desenho |
