# Ações em massa nos grupos — PR 1 (Base) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a fila de ações em massa sobre grupos existentes funcionando ponta a ponta — enfileirar, drenar com ritmo anti-ban, aplicar na Evolution e reportar — em dry-run, sem interface.

**Architecture:** Espelha o auto-grow. Uma tabela de fila (`group_bulk_jobs`) com um job por *(grupo × ação)*; o app decide e enfileira, o worker claima por HTTP (`/api/groups/bulk/pending`), executa contra a Evolution e reporta (`/ack`). O ritmo (1 operação por tenant a cada 4s ≈ 15/min) **é** o anti-ban, travado em dois lugares: o `limit` da RPC de claim e o teto do loop.

**Tech Stack:** Next.js 15 (App Router) · Supabase Postgres · worker Node em `apps/worker` (ESM, `tsx --test`) · Evolution API v2.3.7

**Spec:** [`docs/superpowers/specs/2026-08-30-acoes-em-massa-grupos-design.md`](../specs/2026-08-30-acoes-em-massa-grupos-design.md)

## Global Constraints

- **Português** em comentário, mensagem de erro e commit. Código e identificadores em inglês.
- **TypeScript strict.** Nenhum `any` sem justificativa escrita.
- **Multi-tenant:** toda query em tabela com `tenant_id` leva `.eq("tenant_id", ...)` explícito. O service-role bypassa RLS — o filtro é a proteção real, não a policy.
- **RLS nas tabelas novas** usa `app.has_membership(tenant_id)`. **Nunca** `current_setting('app.tenant_id')` — o app não seta esse GUC e a policy nunca avaliaria verdadeiro.
- **`security definer` sempre com `set search_path`**, e `revoke ... from public, anon` (revogar só de `anon` não basta: o ACL padrão dá EXECUTE a PUBLIC).
- **Migração vai nos DOIS bancos:** dev `wfjuwogxaupyadwhvoxy` e prod `nidoatbxaylrkcgbszns`, e é registrada em `deploy/supabase/apply-order.txt`. Faltar em um quebra o gate de drift do CI.
- **Sem fallback JSON.** Diferente das rotas antigas, estas são Supabase-only. O dual-mode faz tabela ausente cair no JSON em silêncio — você validaria em dev um caminho que não é o que roda em produção.
- **Sem retry automático.** `failed` é terminal; `attempts` só conta recuperação de job preso.
- **Dry-run por default:** `WORKER_BULK_ENABLED != true` → o loop roda inteiro e não chama a Evolution.
- Testes do worker: `npm --workspace apps/worker test` · do web: `npm --workspace apps/web test`.
- Antes de qualquer push: `./verify-local.ps1` (é o gate real do CI — cobre scan de secrets, os dois `tsc` e o build).

---

### Task 1: Migração — fila, coluna de estado e RPC de claim

**Files:**
- Create: `apps/web/supabase/migrations/20260830120000_group_bulk_jobs.sql`
- Modify: `deploy/supabase/apply-order.txt` (acrescentar ao fim)

**Interfaces:**
- Consumes: nada.
- Produces: tabela `public.group_bulk_jobs`; colunas `public.groups.send_state` (`'open' | 'closed' | null`) e `public.groups.send_state_at` (`timestamptz`); função `public.claim_bulk_jobs(p_tenant uuid, p_limit int) returns setof public.group_bulk_jobs`.

- [ ] **Step 1: Conferir por SQL que nada disso já existe**

Antes de escrever migração, checar — no projeto já houve migração escrita para objeto que já existia.

Rodar via MCP Supabase (`execute_sql`) no projeto **dev** (`wfjuwogxaupyadwhvoxy`):

```sql
select
  to_regclass('public.group_bulk_jobs')                  as tabela,
  to_regprocedure('public.claim_bulk_jobs(uuid,int)')    as rpc,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='groups'
      and column_name in ('send_state','send_state_at')) as colunas_send_state;
```

Esperado: `tabela` null, `rpc` null, `colunas_send_state` = 0. Se qualquer um vier preenchido, **pare** e reporte — alguém já criou.

- [ ] **Step 2: Escrever a migração**

Criar `apps/web/supabase/migrations/20260830120000_group_bulk_jobs.sql`:

```sql
-- Fila de ações em massa sobre grupos que JÁ EXISTEM (foto, descrição,
-- abrir/fechar). Irmã de `group_grow_jobs`, que cobre a criação.
--
-- Um job por (grupo x ação), e não um job por lote com group_ids[]: falha
-- parcial precisa ter onde morar. 4 grupos que recusaram a foto não podem
-- obrigar os outros 87 a repetir a operação — e cada repetição gasta janela
-- anti-ban. O progresso ("47 de 91") sai da contagem de linhas do batch.

create table if not exists public.group_bulk_jobs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references organizations(id) on delete cascade,
  campaign_group_id  uuid not null references campaign_groups(id) on delete cascade,

  -- Agrupa os N jobs de UMA aplicação. É o que dá a barra de progresso.
  batch_id           uuid not null,

  action             text not null
                       check (action in ('set_description','set_picture','open','close')),

  group_id           uuid not null references groups(id) on delete cascade,
  -- Desnormalizado de propósito: o claim tem de ser autocontido, como
  -- group_grow_jobs.campaign_slug. O worker não faz join.
  whatsapp_group_id  text not null,

  -- Carga da ação. Conforme `action`, no máximo um dos dois é preenchido.
  description        text,
  media_id           text,

  status             text not null default 'queued'
                       check (status in ('queued','running','done','failed')),
  -- Conta recuperação de job preso, NÃO retry automático: `failed` é terminal.
  -- Reenfileirar 91 operações sozinho é como se fabrica rajada contra o
  -- WhatsApp, e o modo de falha mais provável (grupo onde perdemos o admin)
  -- não melhora com repetição.
  attempts           integer not null default 0,
  error              text,

  created_at         timestamptz not null default now(),
  running_since      timestamptz,
  last_ack_at        timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table public.group_bulk_jobs is
  'Fila de ações em massa sobre grupos existentes. Um job por (grupo x ação).';
comment on column public.group_bulk_jobs.batch_id is
  'Agrupa os jobs de uma aplicação. Base do progresso "N de M".';
comment on column public.group_bulk_jobs.attempts is
  'Recuperações de job preso. Não é retry: `failed` é terminal.';

-- Reenfileirar o mesmo lote vira no-op em vez de duplicar a operação no WhatsApp.
create unique index if not exists group_bulk_jobs_batch_uidx
  on public.group_bulk_jobs (tenant_id, batch_id, group_id, action);

create index if not exists group_bulk_jobs_queued_idx
  on public.group_bulk_jobs (tenant_id, created_at) where status = 'queued';
create index if not exists group_bulk_jobs_running_idx
  on public.group_bulk_jobs (tenant_id, last_ack_at) where status = 'running';
create index if not exists group_bulk_jobs_batch_idx
  on public.group_bulk_jobs (tenant_id, batch_id);

-- Estado de envio conhecido do grupo. Sem isso a tela não sabe dizer se o grupo
-- está aberto sem perguntar ao WhatsApp um a um. Registra o que NÓS aplicamos:
-- null é resposta honesta ("nunca aplicamos, não sabemos").
alter table public.groups
  add column if not exists send_state    text,
  add column if not exists send_state_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'groups_send_state_check'
  ) then
    alter table public.groups
      add constraint groups_send_state_check
      check (send_state is null or send_state in ('open','closed'));
  end if;
end $$;

-- Claim com teto. O `p_limit` é METADE do anti-ban (a outra metade é o intervalo
-- do tick no worker): uma operação por tenant por vez, espaçada de 4s, dá ~15/min
-- distribuídos. `skip locked` mantém dois workers coexistindo sem entregar o
-- mesmo job duas vezes.
create or replace function public.claim_bulk_jobs(p_tenant uuid, p_limit int default 1)
returns setof public.group_bulk_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- Revogar de `public` também: o ACL padrão de função é `=X/postgres`, ou seja
-- EXECUTE para PUBLIC — tirar de `anon` sozinho não fecha a porta.
revoke all on function public.claim_bulk_jobs(uuid, int) from public, anon;
grant execute on function public.claim_bulk_jobs(uuid, int) to service_role;

alter table public.group_bulk_jobs enable row level security;

-- Defesa em profundidade. A proteção REAL é o `.eq('tenant_id')` nas stores:
-- o caminho de escrita usa service-role, que bypassa RLS por desenho.
-- Padrão `app.has_membership` de propósito — a policy de group_grow_jobs usa
-- `current_setting('app.tenant_id')`, GUC que o app nunca seta, e por isso
-- nunca avalia verdadeiro.
drop policy if exists "group_bulk_jobs_tenant" on public.group_bulk_jobs;
create policy "group_bulk_jobs_tenant" on public.group_bulk_jobs
  for all
  using (app.has_membership(tenant_id))
  with check (app.has_membership(tenant_id));
```

- [ ] **Step 3: Aplicar em DEV e conferir**

Via MCP Supabase `apply_migration` no projeto `wfjuwogxaupyadwhvoxy`, nome `group_bulk_jobs`, com o SQL acima.

Depois, `execute_sql` no mesmo projeto — a mesma consulta do Step 1. Esperado agora: `tabela` = `group_bulk_jobs`, `rpc` preenchido, `colunas_send_state` = 2.

- [ ] **Step 4: Aplicar em PROD e conferir**

Idêntico, no projeto `nidoatbxaylrkcgbszns`. Aplicar nos dois é obrigatório: as rotas não têm fallback, então tabela faltando em prod é 500 em produção.

- [ ] **Step 5: Rodar o advisor de segurança**

MCP Supabase `get_advisors` com `type: "security"` nos **dois** projetos. Esperado: nenhum achado novo mencionando `group_bulk_jobs` ou `claim_bulk_jobs`. Se aparecer "function search_path mutable" ou "RLS disabled" nessas, corrija antes de commitar.

- [ ] **Step 6: Registrar em `apply-order.txt`**

Acrescentar ao fim de `deploy/supabase/apply-order.txt`:

```
# 30/08/2026 - Fila de acoes em massa sobre grupos existentes (foto, descricao,
# abrir/fechar) + `groups.send_state`. O claim tem teto (`claim_bulk_jobs`
# p_limit) porque metade do anti-ban e o tamanho do lote e a outra metade e o
# intervalo do tick no worker.
apps/web/supabase/migrations/20260830120000_group_bulk_jobs.sql
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/supabase/migrations/20260830120000_group_bulk_jobs.sql deploy/supabase/apply-order.txt
git commit -m "feat(grupos): fila de acoes em massa e estado de envio do grupo"
```

---

### Task 2: `setOpenToAll` no cliente Evolution

**Files:**
- Modify: `apps/worker/src/evolution-groups.ts`
- Test: `apps/worker/src/evolution-groups.test.ts`

**Interfaces:**
- Consumes: `EvolutionGroups`, `createEvolutionGroups` (já existem).
- Produces: método `setOpenToAll(instanceName: string, groupJid: string): Promise<void>` na interface `EvolutionGroups`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `apps/worker/src/evolution-groups.test.ts`:

```ts
test("setOpenToAll manda action not_announcement com o jid na query", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const groups = createEvolutionGroups({
    baseUrl: "https://evo.local",
    apiKey: "k",
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    },
  });

  await groups.setOpenToAll("girumo-1", "12345@g.us");

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/group\/updateSetting\/girumo-1\?groupJid=12345%40g\.us$/);
  assert.deepEqual(calls[0].body, { action: "not_announcement" });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm --workspace apps/worker test
```

Esperado: FALHA com `groups.setOpenToAll is not a function`.

- [ ] **Step 3: Implementar**

Na interface `EvolutionGroups` de `apps/worker/src/evolution-groups.ts`, logo abaixo de `setAnnounceOnly`:

```ts
  /** Reabre o grupo: volta a permitir que qualquer membro envie mensagem. */
  setOpenToAll(instanceName: string, groupJid: string): Promise<void>;
```

E no objeto devolvido por `createEvolutionGroups`, logo abaixo de `setAnnounceOnly`:

```ts
    async setOpenToAll(instanceName, groupJid) {
      // "not_announcement" = todos enviam. É o inverso exato de setAnnounceOnly,
      // e o único par de valores desse enum que a v2.3.7 aceita para envio.
      await request("group/updateSetting", withJid("/group/updateSetting", instanceName, groupJid), {
        method: "POST",
        body: JSON.stringify({ action: "not_announcement" }),
      });
    },
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm --workspace apps/worker test
```

Esperado: PASSA, e nenhum teste existente quebra.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/evolution-groups.ts apps/worker/src/evolution-groups.test.ts
git commit -m "feat(evolution): reabrir grupo com action not_announcement"
```

---

### Task 3: `bulk-batch.ts` — montar o lote (puro)

**Files:**
- Create: `apps/web/src/lib/groups/bulk-batch.ts`
- Test: `apps/web/src/lib/groups/bulk-batch.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type BulkAction = "set_description" | "set_picture" | "open" | "close"`
  - `type BulkTargetGroup = { id: string; whatsapp_group_id: string | null }`
  - `type BulkJobInsert = { tenant_id, campaign_group_id, batch_id, action, group_id, whatsapp_group_id, description, media_id }` (todos `string`, `description`/`media_id` são `string | null`)
  - `function buildBulkJobs(input: { tenantId: string; campaignGroupId: string; batchId: string; action: BulkAction; groups: readonly BulkTargetGroup[]; description?: string | null; mediaId?: string | null }): BulkJobInsert[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/web/src/lib/groups/bulk-batch.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildBulkJobs, type BulkTargetGroup } from "./bulk-batch";

const BASE = { tenantId: "t1", campaignGroupId: "c1", batchId: "b1" };
const GRUPOS: BulkTargetGroup[] = [
  { id: "g1", whatsapp_group_id: "111@g.us" },
  { id: "g2", whatsapp_group_id: "222@g.us" },
];

test("gera um job por grupo", () => {
  const jobs = buildBulkJobs({ ...BASE, action: "open", groups: GRUPOS });
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((j) => j.group_id), ["g1", "g2"]);
  assert.deepEqual(jobs.map((j) => j.whatsapp_group_id), ["111@g.us", "222@g.us"]);
});

test("open e close nao carregam descricao nem midia", () => {
  const [job] = buildBulkJobs({ ...BASE, action: "close", groups: [GRUPOS[0]] });
  assert.equal(job.description, null);
  assert.equal(job.media_id, null);
  assert.equal(job.action, "close");
});

test("set_description carrega o texto e zera a midia", () => {
  const [job] = buildBulkJobs({ ...BASE, action: "set_description", groups: [GRUPOS[0]], description: "Bazar VIP" });
  assert.equal(job.description, "Bazar VIP");
  assert.equal(job.media_id, null);
});

test("set_description aceita string vazia — apagar a descricao e uma acao valida", () => {
  const [job] = buildBulkJobs({ ...BASE, action: "set_description", groups: [GRUPOS[0]], description: "" });
  assert.equal(job.description, "");
});

test("set_description sem description e erro, nao string vazia silenciosa", () => {
  assert.throws(
    () => buildBulkJobs({ ...BASE, action: "set_description", groups: GRUPOS }),
    /descrição/i,
  );
});

test("set_picture carrega a midia e zera a descricao", () => {
  const [job] = buildBulkJobs({ ...BASE, action: "set_picture", groups: [GRUPOS[0]], mediaId: "m1" });
  assert.equal(job.media_id, "m1");
  assert.equal(job.description, null);
});

test("set_picture sem mediaId e erro", () => {
  assert.throws(() => buildBulkJobs({ ...BASE, action: "set_picture", groups: GRUPOS }), /imagem/i);
});

test("grupo sem whatsapp_group_id e descartado — nao da para agir nele", () => {
  const jobs = buildBulkJobs({
    ...BASE,
    action: "open",
    groups: [GRUPOS[0], { id: "g3", whatsapp_group_id: null }],
  });
  assert.deepEqual(jobs.map((j) => j.group_id), ["g1"]);
});

test("lista vazia devolve lote vazio, sem erro", () => {
  assert.deepEqual(buildBulkJobs({ ...BASE, action: "open", groups: [] }), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm --workspace apps/web test
```

Esperado: FALHA com erro de módulo não encontrado (`./bulk-batch`).

- [ ] **Step 3: Implementar**

Criar `apps/web/src/lib/groups/bulk-batch.ts`:

```ts
/**
 * Montagem do lote de ações em massa. Função PURA — sem Supabase, sem rede.
 *
 * Fica separada da store para que a regra que decide o que vai para a fila seja
 * testável sem banco. O que ela protege:
 *
 * - Grupo sem `whatsapp_group_id` é descartado: enfileirar um job que não tem
 *   como ser executado só produziria uma falha garantida daqui a alguns minutos.
 * - `set_description` sem `description` LANÇA em vez de virar string vazia.
 *   String vazia apaga a descrição dos grupos no WhatsApp — é uma ação legítima,
 *   mas tem de ser pedida, nunca ser o default de um campo esquecido.
 */

export type BulkAction = "set_description" | "set_picture" | "open" | "close";

export type BulkTargetGroup = {
  id: string;
  whatsapp_group_id: string | null;
};

export type BulkJobInsert = {
  tenant_id: string;
  campaign_group_id: string;
  batch_id: string;
  action: BulkAction;
  group_id: string;
  whatsapp_group_id: string;
  description: string | null;
  media_id: string | null;
};

export type BuildBulkJobsInput = {
  tenantId: string;
  campaignGroupId: string;
  batchId: string;
  action: BulkAction;
  groups: readonly BulkTargetGroup[];
  description?: string | null;
  mediaId?: string | null;
};

export function buildBulkJobs(input: BuildBulkJobsInput): BulkJobInsert[] {
  const { action } = input;

  if (action === "set_description" && typeof input.description !== "string") {
    throw new Error("A descrição é obrigatória para aplicar descrição em massa.");
  }
  if (action === "set_picture" && !input.mediaId) {
    throw new Error("A imagem é obrigatória para aplicar foto em massa.");
  }

  const description = action === "set_description" ? (input.description as string) : null;
  const mediaId = action === "set_picture" ? (input.mediaId as string) : null;

  return input.groups
    .filter((g): g is BulkTargetGroup & { whatsapp_group_id: string } => Boolean(g.whatsapp_group_id))
    .map((g) => ({
      tenant_id: input.tenantId,
      campaign_group_id: input.campaignGroupId,
      batch_id: input.batchId,
      action,
      group_id: g.id,
      whatsapp_group_id: g.whatsapp_group_id,
      description,
      media_id: mediaId,
    }));
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm --workspace apps/web test
```

Esperado: os 9 testes passam.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/groups/bulk-batch.ts apps/web/src/lib/groups/bulk-batch.test.ts
git commit -m "feat(grupos): montagem do lote de acoes em massa"
```

---

### Task 4: Store `group-bulk-jobs.ts`

**Files:**
- Create: `apps/web/src/lib/stores/group-bulk-jobs.ts`

**Interfaces:**
- Consumes: `BulkAction`, `BulkJobInsert` de `@/lib/groups/bulk-batch`; `getSupabaseAdmin` de `@/lib/supabase/server`.
- Produces:
  - `type BulkJobStatus = "queued" | "running" | "done" | "failed"`
  - `type BulkJobRow` (colunas da tabela)
  - `type BulkJobClaim = { id: string; action: BulkAction; whatsappGroupId: string; description?: string; mediaId?: string }`
  - `const STALE_RUNNING_MS = 5 * 60_000`
  - `const CLAIM_LIMIT = 1`
  - `enqueueBulkJobs(tenantId: string, jobs: readonly BulkJobInsert[]): Promise<number>`
  - `failStaleRunning(tenantId: string): Promise<number>`
  - `claimBulk(tenantId: string): Promise<BulkJobClaim[]>`
  - `ackBulk(tenantId: string, id: string, ack: { status: "done" | "failed"; error?: string | null }): Promise<BulkJobRow | null>`

- [ ] **Step 1: Implementar a store**

Não tem teste unitário próprio: é I/O fino sobre o Supabase, e a regra que dá para testar sem banco já saiu para `bulk-batch.ts` (Task 3). A cobertura vem do teste de integração da Task 8.

Criar `apps/web/src/lib/stores/group-bulk-jobs.ts`:

```ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { BulkAction, BulkJobInsert } from "@/lib/groups/bulk-batch";

/**
 * Fila de ações em massa sobre grupos existentes.
 *
 * Supabase-only de propósito, sem o fallback JSON das stores antigas: com
 * dual-mode, tabela ausente não dá erro — cai no JSON e você valida em dev um
 * caminho de código que não é o que roda em produção.
 */

export type BulkJobStatus = "queued" | "running" | "done" | "failed";

export type BulkJobRow = {
  id: string;
  tenant_id: string;
  campaign_group_id: string;
  batch_id: string;
  action: BulkAction;
  group_id: string;
  whatsapp_group_id: string;
  description: string | null;
  media_id: string | null;
  status: BulkJobStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  running_since: string | null;
  last_ack_at: string | null;
  updated_at: string;
};

/** O que o worker recebe no claim. Autocontido: ele não faz join. */
export type BulkJobClaim = {
  id: string;
  action: BulkAction;
  whatsappGroupId: string;
  description?: string;
  mediaId?: string;
};

const TABLE = "group_bulk_jobs";

/**
 * Operação de metadata é rápida (segundos). 5 min já é folga larga — mais que
 * isso deixaria a fila parada atrás de um job que o worker abandonou.
 */
export const STALE_RUNNING_MS = 5 * 60_000;

/**
 * Metade do anti-ban. A outra metade é `WORKER_BULK_INTERVAL_MS` (4s): 1 job a
 * cada 4s dá ~15/min ESPAÇADOS. Quinze de uma vez e 55s parado seria o mesmo
 * número por minuto e o padrão de automação que se quer evitar.
 */
export const CLAIM_LIMIT = 1;

/** Insere o lote. Reenfileirar o mesmo lote é no-op (unique batch/grupo/ação). */
export async function enqueueBulkJobs(
  tenantId: string,
  jobs: readonly BulkJobInsert[],
): Promise<number> {
  if (jobs.length === 0) return 0;
  const rows = jobs.map((j) => ({ ...j, tenant_id: tenantId }));
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "tenant_id,batch_id,group_id,action", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Devolve à realidade os jobs que o worker claimou e abandonou. */
export async function failStaleRunning(tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "failed",
      error: "Operação interrompida (executor desconectou).",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("status", "running")
    .lt("last_ack_at", cutoff)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Recupera o que travou e reivindica o próximo job (teto CLAIM_LIMIT). */
export async function claimBulk(tenantId: string): Promise<BulkJobClaim[]> {
  await failStaleRunning(tenantId);

  const { data, error } = await getSupabaseAdmin().rpc("claim_bulk_jobs", {
    p_tenant: tenantId,
    p_limit: CLAIM_LIMIT,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as BulkJobRow[]).map((r) => ({
    id: r.id,
    action: r.action,
    whatsappGroupId: r.whatsapp_group_id,
    description: r.description ?? undefined,
    mediaId: r.media_id ?? undefined,
  }));
}

/**
 * Registra o resultado. Em `open`/`close` concluído, propaga para
 * `groups.send_state` — é o que a tela lê para mostrar aberto/fechado sem
 * perguntar ao WhatsApp.
 */
export async function ackBulk(
  tenantId: string,
  id: string,
  ack: { status: "done" | "failed"; error?: string | null },
): Promise<BulkJobRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: ack.status, error: ack.error ?? null, last_ack_at: now, updated_at: now })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const job = data as BulkJobRow;
  if (ack.status === "done" && (job.action === "open" || job.action === "close")) {
    const { error: stateError } = await getSupabaseAdmin()
      .from("groups")
      .update({ send_state: job.action === "open" ? "open" : "closed", send_state_at: now })
      .eq("tenant_id", tenantId)
      .eq("id", job.group_id);
    // Não derruba o ack: o job FOI aplicado no WhatsApp. Perder o reflexo na
    // tela é ruim; perder o ack faria o job ser reaplicado, e reaplicar é o que
    // gasta janela anti-ban à toa.
    if (stateError) console.error("[group-bulk-jobs] falha ao gravar send_state:", stateError.message);
  }

  return job;
}
```

- [ ] **Step 2: Verificar tipo e lint**

```bash
npm --workspace apps/web run lint
npx tsc -p apps/web/tsconfig.json --noEmit
```

Esperado: sem erro. (`lint` e `tsx --test` não checam tipo — o `tsc` é obrigatório.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/stores/group-bulk-jobs.ts
git commit -m "feat(grupos): store da fila de acoes em massa"
```

---

### Task 5: Rotas `pending` e `ack`

**Files:**
- Create: `apps/web/src/app/api/groups/bulk/pending/route.ts`
- Create: `apps/web/src/app/api/groups/bulk/ack/route.ts`

**Interfaces:**
- Consumes: `claimBulk`, `ackBulk` da Task 4; `getRouteTenantContext` de `@/lib/route-tenant-context`.
- Produces: `POST /api/groups/bulk/pending` → `BulkJobClaim[]`; `POST /api/groups/bulk/ack` com corpo `{ id: string; status: "done" | "failed"; error?: string }` → `BulkJobRow`.

- [ ] **Step 1: Criar `pending`**

Criar `apps/web/src/app/api/groups/bulk/pending/route.ts`:

```ts
import { claimBulk } from "@/lib/stores/group-bulk-jobs";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/groups/bulk/pending — o WORKER reivindica a próxima ação em massa.
 *
 * Devolve no máximo `CLAIM_LIMIT` jobs: o tamanho do lote é metade do anti-ban.
 * No PR 3 esta rota passa a materializar o horário de funcionamento ANTES do
 * claim, como `/grow/pending` faz com `evaluateAutoGrow`.
 */
export async function POST(req: Request) {
  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
    return Response.json(await claimBulk(tenantId));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/groups/bulk/pending] falha ao reivindicar:", error);
    return Response.json({ error: "Erro ao reivindicar ações em massa." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Criar `ack`**

Criar `apps/web/src/app/api/groups/bulk/ack/route.ts`:

```ts
import { ackBulk } from "@/lib/stores/group-bulk-jobs";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/groups/bulk/ack — o WORKER reporta o resultado de uma ação.
 * body { id, status: "done"|"failed", error? }
 *
 * Só dois status terminais: não há `running` intermediário como no auto-grow,
 * porque aqui a operação é uma chamada só, não uma sequência create → descrição
 * → foto → convite.
 */
export async function POST(req: Request) {
  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const id = body.id ? String(body.id) : "";
    const status = body.status as "done" | "failed";
    if (!id || !["done", "failed"].includes(status)) {
      return Response.json({ error: "id e status válidos são obrigatórios." }, { status: 400 });
    }

    const job = await ackBulk(tenantId, id, {
      status,
      error: typeof body.error === "string" ? body.error : null,
    });
    if (!job) return Response.json({ error: "Job não encontrado." }, { status: 404 });
    return Response.json(job);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/groups/bulk/ack] falha ao registrar resultado:", error);
    return Response.json({ error: "Erro ao registrar o resultado." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar tipo, lint e build**

```bash
npm --workspace apps/web run lint
npx tsc -p apps/web/tsconfig.json --noEmit
```

Esperado: sem erro.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/groups/bulk
git commit -m "feat(grupos): rotas de claim e ack das acoes em massa"
```

---

### Task 6: `bulk-loop.ts` — o loop (puro, TDD)

**Files:**
- Create: `apps/worker/src/bulk-loop.ts`
- Test: `apps/worker/src/bulk-loop.test.ts`

**Interfaces:**
- Consumes: `log` de `./log.js`.
- Produces:
  - `type BulkAction = "set_description" | "set_picture" | "open" | "close"`
  - `type BulkJobClaim = { id: string; action: BulkAction; whatsappGroupId: string; description?: string; mediaId?: string }`
  - `type BulkAck = { status: "done" | "failed"; error?: string }`
  - `type BulkDeps` (ver Step 3)
  - `type BulkTickSummary = { tenants: number; claimed: number; done: number; failed: number }`
  - `const MAX_OPS_PER_TENANT_PER_TICK = 1`
  - `const DEFERRED_REASON: string`
  - `async function runBulkTick(deps: BulkDeps): Promise<BulkTickSummary>`
  - `function bulkDidWork(s: BulkTickSummary): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/worker/src/bulk-loop.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  bulkDidWork,
  runBulkTick,
  type BulkAck,
  type BulkDeps,
  type BulkJobClaim,
} from "./bulk-loop.js";

type AckCall = { jobId: string; ack: BulkAck };

type Recorded = {
  acks: AckCall[];
  opened: string[];
  closed: string[];
  described: Array<{ jid: string; text: string }>;
  pictured: Array<{ jid: string; url: string }>;
};

function job(over: Partial<BulkJobClaim> = {}): BulkJobClaim {
  return { id: "job-1", action: "open", whatsappGroupId: "111@g.us", ...over };
}

function makeDeps(over: Partial<BulkDeps> = {}): { deps: BulkDeps; rec: Recorded } {
  const rec: Recorded = { acks: [], opened: [], closed: [], described: [], pictured: [] };
  const deps: BulkDeps = {
    listTenants: async () => ["tenant-a"],
    claimJobs: async () => [job()],
    ack: async (_tenantId, jobId, ack) => {
      rec.acks.push({ jobId, ack });
    },
    instanceFor: async () => "girumo-1",
    setOpenToAll: async (_i, jid) => {
      rec.opened.push(jid);
    },
    setAnnounceOnly: async (_i, jid) => {
      rec.closed.push(jid);
    },
    setDescription: async (_i, jid, text) => {
      rec.described.push({ jid, text });
    },
    setPicture: async (_i, jid, url) => {
      rec.pictured.push({ jid, url });
    },
    signedMediaUrl: async () => "https://signed.local/foto.jpg",
    ...over,
  };
  return { deps, rec };
}

test("open chama setOpenToAll e conclui", async () => {
  const { deps, rec } = makeDeps();
  const summary = await runBulkTick(deps);

  assert.deepEqual(rec.opened, ["111@g.us"]);
  assert.deepEqual(rec.acks, [{ jobId: "job-1", ack: { status: "done" } }]);
  assert.equal(summary.done, 1);
  assert.equal(summary.failed, 0);
});

test("close chama setAnnounceOnly", async () => {
  const { deps, rec } = makeDeps({ claimJobs: async () => [job({ action: "close" })] });
  await runBulkTick(deps);
  assert.deepEqual(rec.closed, ["111@g.us"]);
  assert.equal(rec.opened.length, 0);
});

test("set_description aplica o texto exato, inclusive vazio", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ action: "set_description", description: "" })],
  });
  await runBulkTick(deps);
  assert.deepEqual(rec.described, [{ jid: "111@g.us", text: "" }]);
});

test("set_picture assina a midia antes de aplicar", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ action: "set_picture", mediaId: "m1" })],
  });
  await runBulkTick(deps);
  assert.deepEqual(rec.pictured, [{ jid: "111@g.us", url: "https://signed.local/foto.jpg" }]);
});

test("midia que nao assina falha o job SEM chamar a Evolution", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ action: "set_picture", mediaId: "sumida" })],
    signedMediaUrl: async () => null,
  });
  const summary = await runBulkTick(deps);

  assert.equal(rec.pictured.length, 0);
  assert.equal(summary.failed, 1);
  assert.equal(rec.acks[0].ack.status, "failed");
  assert.match(String(rec.acks[0].ack.error), /imagem/i);
});

test("tenant sem instancia falha o job e nao chama a Evolution", async () => {
  const { deps, rec } = makeDeps({ instanceFor: async () => null });
  const summary = await runBulkTick(deps);

  assert.equal(rec.opened.length, 0);
  assert.equal(summary.failed, 1);
  assert.match(String(rec.acks[0].ack.error), /instância/i);
});

test("erro da Evolution vira ack failed com a mensagem", async () => {
  const { deps, rec } = makeDeps({
    setOpenToAll: async () => {
      throw new Error("Evolution group/updateSetting falhou (403)");
    },
  });
  const summary = await runBulkTick(deps);

  assert.equal(summary.failed, 1);
  assert.match(String(rec.acks[0].ack.error), /403/);
});

test("teto de ritmo: so a primeira operacao roda; o excedente falha explicito", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ id: "j1" }), job({ id: "j2" }), job({ id: "j3" })],
  });
  const summary = await runBulkTick(deps);

  assert.deepEqual(rec.opened, ["111@g.us"]);
  assert.equal(summary.done, 1);
  assert.equal(summary.failed, 2);
  assert.match(String(rec.acks[1].ack.error), /ritmo/i);
});

test("falha de um tenant nao impede o proximo", async () => {
  const { deps, rec } = makeDeps({
    listTenants: async () => ["a", "b"],
    claimJobs: async (tenantId) => {
      if (tenantId === "a") throw new Error("app fora do ar");
      return [job()];
    },
  });
  const summary = await runBulkTick(deps);

  assert.equal(summary.done, 1);
  assert.equal(rec.opened.length, 1);
});

test("bulkDidWork so e verdadeiro quando algo aconteceu", () => {
  assert.equal(bulkDidWork({ tenants: 3, claimed: 0, done: 0, failed: 0 }), false);
  assert.equal(bulkDidWork({ tenants: 1, claimed: 1, done: 1, failed: 0 }), true);
  assert.equal(bulkDidWork({ tenants: 1, claimed: 1, done: 0, failed: 1 }), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm --workspace apps/worker test
```

Esperado: FALHA — módulo `./bulk-loop.js` não existe.

- [ ] **Step 3: Implementar**

Criar `apps/worker/src/bulk-loop.ts`:

```ts
/**
 * Loop de AÇÕES EM MASSA sobre grupos que já existem: foto, descrição e
 * abrir/fechar.
 *
 * Irmão de `grow-loop.ts`, com a mesma divisão de responsabilidade: o app decide
 * o que entra na fila, o worker só executa e reporta. Puro de propósito — todas
 * as dependências entram por parâmetro, para rodar sob `tsx --test` sem rede.
 *
 * ── Anti-ban ──────────────────────────────────────────────────────────────
 * O teto é a CADÊNCIA, como no auto-grow: no máximo UMA operação por tenant por
 * tick, com o tick a cada `WORKER_BULK_INTERVAL_MS` (4s) — ~15/min ESPAÇADOS.
 * Quinze chamadas de admin no mesmo segundo e 55s de silêncio dariam o mesmo
 * número por minuto e são o padrão de automação que se quer evitar.
 *
 * O teto vive em dois lugares de propósito: no `p_limit` da RPC `claim_bulk_jobs`
 * e aqui. Um `p_limit` alterado sem querer não pode virar rajada silenciosa.
 *
 * ── Por que o excedente vira `failed`, e não volta para a fila ─────────────
 * Não existe status "de volta ao início" nesta fila, e inventar um reenfileiramento
 * automático seria justamente a máquina de rajada que o teto evita. `failed` com
 * motivo explícito é honesto: aparece no progresso do lote, e a tela oferece
 * "tentar de novo nos que falharam" — uma ação de gente, não do loop. Na prática
 * este caminho não dispara, porque a RPC já entrega no máximo um job.
 */

import { log } from "./log.js";

export type BulkAction = "set_description" | "set_picture" | "open" | "close";

/** O que o app entrega no claim. Autocontido: o worker não consulta o banco. */
export type BulkJobClaim = {
  id: string;
  action: BulkAction;
  whatsappGroupId: string;
  description?: string;
  mediaId?: string;
};

export type BulkAck = { status: "done" | "failed"; error?: string };

export type BulkDeps = {
  /** Tenants com fila a drenar. */
  listTenants(): Promise<string[]>;
  /** POST /api/groups/bulk/pending */
  claimJobs(tenantId: string): Promise<BulkJobClaim[]>;
  /** POST /api/groups/bulk/ack */
  ack(tenantId: string, jobId: string, ack: BulkAck): Promise<void>;
  /** Nome da instância na Evolution, ou null se o tenant não tem uma utilizável. */
  instanceFor(tenantId: string): Promise<string | null>;
  setOpenToAll(instanceName: string, groupJid: string): Promise<void>;
  setAnnounceOnly(instanceName: string, groupJid: string): Promise<void>;
  setDescription(instanceName: string, groupJid: string, description: string): Promise<void>;
  setPicture(instanceName: string, groupJid: string, imageUrl: string): Promise<void>;
  /** URL assinada de TTL curto, ou null (mídia apagada / id inválido). */
  signedMediaUrl(mediaId: string, tenantId: string): Promise<string | null>;
};

export type BulkTickSummary = {
  tenants: number;
  claimed: number;
  done: number;
  failed: number;
};

/** Teto anti-ban por tenant por tick. Ver o cabeçalho. */
export const MAX_OPS_PER_TENANT_PER_TICK = 1;

export const DEFERRED_REASON =
  "Adiado pelo ritmo anti-ban (uma operação por vez). Reaplique nos que falharam.";

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "erro desconhecido";
}

/** Executa UMA ação. Lança em falha — quem chama transforma em ack. */
async function applyJob(
  deps: BulkDeps,
  tenantId: string,
  instanceName: string,
  job: BulkJobClaim,
): Promise<void> {
  switch (job.action) {
    case "open":
      return deps.setOpenToAll(instanceName, job.whatsappGroupId);
    case "close":
      return deps.setAnnounceOnly(instanceName, job.whatsappGroupId);
    case "set_description": {
      // String vazia é ação legítima (apagar a descrição), então o teste é de
      // tipo, não de verdade — `?? ""` engoliria um job mal montado.
      if (typeof job.description !== "string") {
        throw new Error("Job de descrição sem texto.");
      }
      return deps.setDescription(instanceName, job.whatsappGroupId, job.description);
    }
    case "set_picture": {
      if (!job.mediaId) throw new Error("Job de foto sem imagem.");
      const url = await deps.signedMediaUrl(job.mediaId, tenantId);
      if (!url) throw new Error("A imagem não está mais disponível.");
      return deps.setPicture(instanceName, job.whatsappGroupId, url);
    }
  }
}

async function runTenant(
  deps: BulkDeps,
  tenantId: string,
  summary: BulkTickSummary,
): Promise<void> {
  const jobs = await deps.claimJobs(tenantId);
  if (jobs.length === 0) return;
  summary.claimed += jobs.length;

  const permitidos = jobs.slice(0, MAX_OPS_PER_TENANT_PER_TICK);
  const excedente = jobs.slice(MAX_OPS_PER_TENANT_PER_TICK);

  const instanceName = await deps.instanceFor(tenantId);

  for (const job of permitidos) {
    if (!instanceName) {
      summary.failed += 1;
      await deps.ack(tenantId, job.id, {
        status: "failed",
        error: "Sem instância conectada para aplicar a ação.",
      });
      continue;
    }
    try {
      await applyJob(deps, tenantId, instanceName, job);
      summary.done += 1;
      await deps.ack(tenantId, job.id, { status: "done" });
    } catch (error) {
      summary.failed += 1;
      await deps.ack(tenantId, job.id, { status: "failed", error: reason(error) });
    }
  }

  for (const job of excedente) {
    summary.failed += 1;
    await deps.ack(tenantId, job.id, { status: "failed", error: DEFERRED_REASON });
  }
}

export async function runBulkTick(deps: BulkDeps): Promise<BulkTickSummary> {
  const summary: BulkTickSummary = { tenants: 0, claimed: 0, done: 0, failed: 0 };

  const tenants = await deps.listTenants();
  summary.tenants = tenants.length;

  for (const tenantId of tenants) {
    try {
      await runTenant(deps, tenantId, summary);
    } catch (error) {
      // Um tenant fora do ar não pode travar a fila dos outros.
      log.warn("ações em massa: tenant falhou no tick", {
        tenant_id: tenantId,
        error: reason(error),
      });
    }
  }

  return summary;
}

export function bulkDidWork(summary: BulkTickSummary): boolean {
  return summary.claimed > 0 || summary.done > 0 || summary.failed > 0;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm --workspace apps/worker test
```

Esperado: os 10 testes passam.

- [ ] **Step 5: Matar o mutante do teto de ritmo**

O teste que mais importa é o do teto — é ele que segura o anti-ban. Provar que ele mata:

Trocar temporariamente em `bulk-loop.ts`:

```ts
export const MAX_OPS_PER_TENANT_PER_TICK = 99;
```

Rodar `npm --workspace apps/worker test`. **Esperado: FALHA** em "teto de ritmo". Se passar, o teste não vale nada — conserte-o antes de seguir.

Reverter para `1` e rodar de novo: PASSA.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/bulk-loop.ts apps/worker/src/bulk-loop.test.ts
git commit -m "feat(worker): loop das acoes em massa com teto de ritmo por tenant"
```

---

### Task 7: Ligar o loop — deps, dry-run, env e wiring

**Files:**
- Create: `apps/worker/src/bulk-deps.ts`
- Create: `apps/worker/src/bulk-dry-run.ts`
- Test: `apps/worker/src/bulk-dry-run.test.ts`
- Modify: `apps/worker/src/env.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `BulkDeps`, `runBulkTick`, `bulkDidWork` da Task 6; `AppClient`; `EvolutionGroups` (com `setOpenToAll` da Task 2); `resolveMediaPath` de `./media-id.js`; `pickSendInstance` de `./pick-send-instance.js`.
- Produces: `makeBulkDeps(supabase, app, groups): BulkDeps`; `withBulkDryRun(deps): BulkDeps`; `env.bulkEnabled: boolean`; `env.bulkIntervalMs: number`.

- [ ] **Step 1: Escrever o teste do dry-run**

Criar `apps/worker/src/bulk-dry-run.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { runBulkTick, type BulkDeps } from "./bulk-loop.js";
import { BULK_DRY_RUN_REASON, withBulkDryRun } from "./bulk-dry-run.js";

function baseDeps(over: Partial<BulkDeps> = {}): BulkDeps {
  return {
    listTenants: async () => ["t1"],
    claimJobs: async () => [{ id: "j1", action: "open", whatsappGroupId: "111@g.us" }],
    ack: async () => {},
    instanceFor: async () => "girumo-1",
    setOpenToAll: async () => {},
    setAnnounceOnly: async () => {},
    setDescription: async () => {},
    setPicture: async () => {},
    signedMediaUrl: async () => "https://signed.local/f.jpg",
    ...over,
  };
}

test("dry-run nao chama a Evolution e falha o job com motivo explicito", async () => {
  let chamou = false;
  const acks: Array<{ status: string; error?: string }> = [];

  const deps = withBulkDryRun(
    baseDeps({
      setOpenToAll: async () => {
        chamou = true;
      },
      ack: async (_t, _j, ack) => {
        acks.push(ack);
      },
    }),
  );

  const summary = await runBulkTick(deps);

  assert.equal(chamou, false, "não pode tocar a Evolution em dry-run");
  assert.equal(summary.failed, 1);
  assert.equal(acks[0].error, BULK_DRY_RUN_REASON);
});

test("dry-run deixa claim e instanceFor rodarem de verdade", async () => {
  let claimou = false;
  const deps = withBulkDryRun(
    baseDeps({
      claimJobs: async () => {
        claimou = true;
        return [{ id: "j1", action: "close", whatsappGroupId: "111@g.us" }];
      },
    }),
  );

  await runBulkTick(deps);
  assert.equal(claimou, true, "o caminho até a porta da Evolution tem de ser exercitado");
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm --workspace apps/worker test
```

Esperado: FALHA — `./bulk-dry-run.js` não existe.

- [ ] **Step 3: Implementar o dry-run**

Criar `apps/worker/src/bulk-dry-run.ts`:

```ts
/**
 * Modo DRY-RUN das ações em massa.
 *
 * Exercita o caminho inteiro — descobre tenants, claima de verdade (o job SAI da
 * fila e fica `running`), resolve a instância — e para na porta da Evolution.
 *
 * A parada vira `failed` com motivo explícito, e não silêncio: sem isso o job
 * ficaria pendurado em `running` até o `failStaleRunning` cinco minutos depois, e
 * quem estivesse olhando o progresso veria um lote travado sem explicação.
 *
 * Repare que aqui o dry-run é MAIS agressivo que o do envio, que deixa o comando
 * concluir. É a mesma escolha do auto-grow: sem operação real não há resultado
 * real, e marcar `done` gravaria no banco um `send_state` que não corresponde ao
 * que o WhatsApp mostra — dado falso no painel.
 */

import type { BulkDeps } from "./bulk-loop.js";
import { log } from "./log.js";

export const BULK_DRY_RUN_REASON =
  "DRY-RUN: ações em massa desligadas (WORKER_BULK_ENABLED != true)";

function recusar(acao: string, instanceName: string, groupJid: string): never {
  log.info(`DRY-RUN: ${acao}`, { instance_name: instanceName, group_jid: groupJid });
  throw new Error(BULK_DRY_RUN_REASON);
}

export function withBulkDryRun(deps: BulkDeps): BulkDeps {
  return {
    ...deps,
    setOpenToAll: async (i, jid) => recusar("abriria o grupo", i, jid),
    setAnnounceOnly: async (i, jid) => recusar("fecharia o grupo", i, jid),
    setDescription: async (i, jid) => recusar("trocaria a descrição", i, jid),
    setPicture: async (i, jid) => recusar("trocaria a foto", i, jid),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm --workspace apps/worker test
```

Esperado: os 2 testes novos passam.

- [ ] **Step 5: Criar as deps reais**

Criar `apps/worker/src/bulk-deps.ts`:

```ts
/**
 * Deps reais do loop de ações em massa: Supabase + app web + Evolution.
 *
 * Separado de `bulk-loop.ts` para o loop continuar puro e testável sem rede —
 * mesmo arranjo de `grow-deps.ts` em relação a `grow-loop.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppClient } from "./app-client.js";
import type { BulkAck, BulkDeps, BulkJobClaim } from "./bulk-loop.js";
import type { EvolutionGroups } from "./evolution-groups.js";
import { log } from "./log.js";
import { resolveMediaPath } from "./media-id.js";
import { type InstanceRow, pickSendInstance } from "./pick-send-instance.js";

/** Mesmo bucket e TTL do envio e do auto-grow. */
const MEDIA_BUCKET = "uploads";
const SIGNED_URL_TTL_SECONDS = 300;

/** Tenants com job na fila. Só esses precisam de tick. */
async function listBulkTenants(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("group_bulk_jobs")
    .select("tenant_id")
    .eq("status", "queued")
    .limit(500);
  if (error) throw new Error(`listBulkTenants: ${error.message}`);
  return [...new Set((data ?? []).map((r) => String(r.tenant_id)))];
}

export function makeBulkDeps(
  supabase: SupabaseClient,
  app: AppClient,
  groups: EvolutionGroups,
): BulkDeps {
  return {
    listTenants: () => listBulkTenants(supabase),

    async claimJobs(tenantId) {
      const jobs = await app.post<BulkJobClaim[]>(tenantId, "/api/groups/bulk/pending");
      return Array.isArray(jobs) ? jobs : [];
    },

    async ack(tenantId, jobId, ack: BulkAck) {
      await app.post(tenantId, "/api/groups/bulk/ack", { id: jobId, ...ack });
    },

    async instanceFor(tenantId) {
      const { data, error } = await supabase
        .from("instances")
        .select("id, status, provider_instance_id, created_at")
        .eq("tenant_id", tenantId);
      if (error) throw new Error(`instanceFor: ${error.message}`);

      const rows = (data ?? []) as InstanceRow[];
      const chosenId = pickSendInstance(rows);
      if (!chosenId) return null;

      // Diferente do auto-grow, aqui NÃO é preciso o número da instância: nenhuma
      // dessas operações leva `participants`. Só o nome basta.
      const name = rows.find((row) => row.id === chosenId)?.provider_instance_id;
      if (!name) {
        log.warn("ações em massa: instância sem nome de provedor", { tenant_id: tenantId });
        return null;
      }
      return name;
    },

    setOpenToAll: (instanceName, jid) => groups.setOpenToAll(instanceName, jid),
    setAnnounceOnly: (instanceName, jid) => groups.setAnnounceOnly(instanceName, jid),
    setDescription: (instanceName, jid, description) =>
      groups.setDescription(instanceName, jid, description),
    setPicture: (instanceName, jid, imageUrl) => groups.setPicture(instanceName, jid, imageUrl),

    async signedMediaUrl(mediaId, tenantId) {
      // A checagem de tenant é obrigatória: o mediaId é o storage path em
      // base64url, não um segredo (ver media-id.ts).
      const storagePath = resolveMediaPath(mediaId, tenantId);
      if (!storagePath) {
        log.warn("ações em massa: mediaId inválido para o tenant", { tenant_id: tenantId });
        return null;
      }
      const { data, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (error) {
        log.warn("ações em massa: falha ao assinar a imagem", { error: error.message });
        return null;
      }
      return data?.signedUrl ?? null;
    },
  };
}
```

- [ ] **Step 6: Acrescentar as flags no `env.ts`**

Em `apps/worker/src/env.ts`, no tipo `WorkerEnv`, logo abaixo de `growIntervalMs`:

```ts
  /** Se false (default), as ações em massa rodam em dry-run. */
  bulkEnabled: boolean;
  /** Intervalo do tick. É metade do anti-ban: 4s ≈ 15 operações/min espaçadas. */
  bulkIntervalMs: number;
```

E no objeto devolvido por `loadEnv`, logo abaixo da linha de `growIntervalMs`:

```ts
    bulkEnabled: boolEnv("WORKER_BULK_ENABLED"),
    bulkIntervalMs: intEnv("WORKER_BULK_INTERVAL_MS", 4_000, 1_000),
```

- [ ] **Step 7: Ligar no `index.ts`**

Em `apps/worker/src/index.ts`:

1. Nos imports, junto dos outros:

```ts
import { makeBulkDeps } from "./bulk-deps.js";
import { withBulkDryRun } from "./bulk-dry-run.js";
import { bulkDidWork, runBulkTick, type BulkDeps } from "./bulk-loop.js";
```

2. Uma função de montagem, ao lado de `buildSendDeps`:

```ts
/**
 * Deps das ações em massa, ou null se a Evolution não está configurada.
 * Com `WORKER_BULK_ENABLED != true` (o default) devolve embrulhado em dry-run.
 */
function buildBulkDeps(
  env: WorkerEnv,
  supabase: SupabaseClient,
  app: AppClient,
): BulkDeps | null {
  if (!env.evolutionApiUrl || !env.evolutionApiKey) {
    log.warn("ações em massa desligadas: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes");
    return null;
  }
  const groups = createEvolutionGroups({ baseUrl: env.evolutionApiUrl, apiKey: env.evolutionApiKey });
  const deps = makeBulkDeps(supabase, app, groups);

  if (!env.bulkEnabled) {
    log.warn("ações em massa em DRY-RUN: nada muda de verdade (WORKER_BULK_ENABLED != true)");
    return withBulkDryRun(deps);
  }
  log.info("ações em massa ATIVAS: foto, descrição e abrir/fechar serão aplicados");
  return deps;
}
```

`AppClient` já é importado? Se não, acrescente `import type { AppClient } from "./app-client.js";`.

3. Perto de `let lastGrowAt = 0;`, acrescentar:

```ts
  let lastBulkAt = 0;
```

4. Onde `growDeps` é construído, construir também:

```ts
  const bulkDeps = buildBulkDeps(env, supabase, app);
```

(Use os mesmos nomes de variável já em escopo para `supabase` e o `AppClient` — confira as linhas vizinhas antes de colar.)

5. No log de boot (onde aparece `grow_interval_ms`), acrescentar `bulk_interval_ms: env.bulkIntervalMs,`.

6. No corpo do laço, logo depois do bloco do grow (por volta da linha 205):

```ts
    if (!stopping && bulkDeps && Date.now() - lastBulkAt >= env.bulkIntervalMs) {
      lastBulkAt = Date.now();
      try {
        const applied = await runBulkTick(bulkDeps);
        if (bulkDidWork(applied)) {
          log.info("ações em massa: tick", applied);
          idle = false;
        }
      } catch (error) {
        log.error("ações em massa: tick falhou", {
          error: error instanceof Error ? error.message : "erro desconhecido",
        });
      }
    }
```

Se a variável de "houve trabalho" no laço não se chamar `idle`, use a que estiver lá — copie a forma exata do bloco do grow logo acima.

- [ ] **Step 8: Verificar tipo e testes**

```bash
npm --workspace apps/worker test
npx tsc -p apps/worker/tsconfig.json --noEmit
```

Esperado: tudo passa, sem erro de tipo.

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/bulk-deps.ts apps/worker/src/bulk-dry-run.ts apps/worker/src/bulk-dry-run.test.ts apps/worker/src/env.ts apps/worker/src/index.ts
git commit -m "feat(worker): ligar o loop de acoes em massa em dry-run"
```

---

### Task 8: Teste de integração da cadeia

**Files:**
- Create: `apps/worker/src/cadeia-acoes-em-massa.integration.test.ts`

**Interfaces:**
- Consumes: `runBulkTick`, `BulkDeps` da Task 6.
- Produces: nada (só cobertura).

O unitário da Task 6 prova cada elo. Este prova o que só quebra **entre** os elos: que o `action` que sai do claim é o mesmo que chega na chamada certa da Evolution, e que o ack devolve o par (job, resultado) coerente. É o defeito que passa quando dois lados evoluem separados.

- [ ] **Step 1: Escrever o teste**

Criar `apps/worker/src/cadeia-acoes-em-massa.integration.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { runBulkTick, type BulkDeps, type BulkJobClaim } from "./bulk-loop.js";

/**
 * Cadeia: fila com 4 ações -> quatro ticks -> quatro chamadas distintas na
 * Evolution -> quatro acks `done`, um por job.
 *
 * O teto de ritmo é 1 por tick, então a fila só drena em ticks sucessivos — e é
 * exatamente isso que o teste fixa: nenhuma rajada, e nada se perde.
 */
test("a fila drena um job por tick, cada acao na chamada certa", async () => {
  const fila: BulkJobClaim[] = [
    { id: "j1", action: "close", whatsappGroupId: "111@g.us" },
    { id: "j2", action: "set_description", whatsappGroupId: "222@g.us", description: "Bazar VIP" },
    { id: "j3", action: "set_picture", whatsappGroupId: "333@g.us", mediaId: "m1" },
    { id: "j4", action: "open", whatsappGroupId: "444@g.us" },
  ];

  const chamadas: string[] = [];
  const acks: Array<{ id: string; status: string }> = [];

  const deps: BulkDeps = {
    listTenants: async () => ["t1"],
    // Espelha a RPC: entrega no máximo um, na ordem de criação.
    claimJobs: async () => fila.splice(0, 1),
    ack: async (_t, id, ack) => {
      acks.push({ id, status: ack.status });
    },
    instanceFor: async () => "girumo-1",
    setOpenToAll: async (_i, jid) => {
      chamadas.push(`open:${jid}`);
    },
    setAnnounceOnly: async (_i, jid) => {
      chamadas.push(`close:${jid}`);
    },
    setDescription: async (_i, jid, texto) => {
      chamadas.push(`desc:${jid}:${texto}`);
    },
    setPicture: async (_i, jid, url) => {
      chamadas.push(`foto:${jid}:${url}`);
    },
    signedMediaUrl: async (mediaId) => `https://signed.local/${mediaId}.jpg`,
  };

  for (let i = 0; i < 4; i += 1) await runBulkTick(deps);

  assert.deepEqual(chamadas, [
    "close:111@g.us",
    "desc:222@g.us:Bazar VIP",
    "foto:333@g.us:https://signed.local/m1.jpg",
    "open:444@g.us",
  ]);
  assert.deepEqual(acks, [
    { id: "j1", status: "done" },
    { id: "j2", status: "done" },
    { id: "j3", status: "done" },
    { id: "j4", status: "done" },
  ]);

  // Um quinto tick com a fila vazia não pode inventar trabalho.
  const vazio = await runBulkTick(deps);
  assert.equal(vazio.claimed, 0);
  assert.equal(vazio.done, 0);
});
```

- [ ] **Step 2: Rodar**

```bash
npm --workspace apps/worker test
```

Esperado: PASSA.

- [ ] **Step 3: Matar o mutante**

Provar que o teste pega o defeito *entre* os elos. Em `bulk-loop.ts`, trocar temporariamente o caso `close`:

```ts
    case "close":
      return deps.setOpenToAll(instanceName, job.whatsappGroupId);
```

Rodar `npm --workspace apps/worker test`. **Esperado: FALHA** — `chamadas[0]` vira `open:111@g.us`. Reverter e confirmar que volta a passar.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/cadeia-acoes-em-massa.integration.test.ts
git commit -m "test(worker): cadeia das acoes em massa, um job por tick"
```

---

### Task 9: Fechar o PR

- [ ] **Step 1: Prova de fumaça contra o banco de dev**

Sem interface, a única forma de saber que a cadeia funciona é exercitá-la à mão. Este passo também é o que justifica `enqueueBulkJobs` existir no PR 1 — ela ainda não tem chamador de produção (isso é o PR 2).

Com o worker rodando local contra dev e `WORKER_BULK_ENABLED` **ausente** (dry-run), enfileirar um job real via MCP Supabase `execute_sql` no projeto `wfjuwogxaupyadwhvoxy`:

```sql
insert into public.group_bulk_jobs
  (tenant_id, campaign_group_id, batch_id, action, group_id, whatsapp_group_id)
select g.tenant_id, cg.id, gen_random_uuid(), 'close', g.id, g.whatsapp_group_id
  from public.groups g
  join public.campaign_groups cg on cg.tenant_id = g.tenant_id
 where g.whatsapp_group_id is not null
 limit 1
returning id, status;
```

Esperar ~10s e conferir:

```sql
select id, action, status, attempts, error, running_since, last_ack_at
  from public.group_bulk_jobs
 order by created_at desc limit 1;
```

**Esperado:** `status = 'failed'`, `attempts = 1`, `error` contendo `DRY-RUN` e `WORKER_BULK_ENABLED`. Isso prova, de uma vez: a RPC claimou, o worker chamou o app, o app respondeu, o loop parou na porta da Evolution e o ack voltou.

Se o `status` continuar `queued`, o worker não está vendo a fila — confira `LOG` do worker e `WORKER_BULK_INTERVAL_MS`. Se vier `done`, o dry-run **não** está ativo: pare e conserte antes de mergear, porque significa que o loop mexeria em grupos de verdade.

Limpar depois:

```sql
delete from public.group_bulk_jobs where status = 'failed' and error like 'DRY-RUN%';
```

- [ ] **Step 2: Rodar o gate local**

```bash
./verify-local.ps1
```

É o gate real do CI (scan de secrets, os dois `tsc`, build). Esperado: verde. Rodar **antes** de pushar, não depois.

- [ ] **Step 3: Conferir o índice antes de commitar**

Outra sessão pode ter sujado o índice. **Nunca `git add -A`.**

```bash
git status --short
git diff --cached --stat
```

Esperado: só os arquivos das Tasks 1–8. Se aparecer coisa de `competitor-profiles/` ou `docs/knowledge-graph/`, desfaça com `git restore --staged <path>`.

- [ ] **Step 4: Abrir o PR**

Base `main`. Título: `feat(grupos): fila de ações em massa sobre grupos existentes (PR 1/3)`.

O corpo precisa dizer, com estas palavras:

- **Nada muda em produção ainda:** sem interface, e o worker está em dry-run (`WORKER_BULK_ENABLED` ausente).
- **Migração já aplicada nos dois bancos** (dev e prod), registrada em `apply-order.txt`.
- **Depois do merge, o worker no Coolify precisa de Redeploy manual** — PR de código não muda a stack.
- Link para a spec.

- [ ] **Step 5: Mover o card do quadro**

Primeiro descobrir se já existe card, em **produção** (`nidoatbxaylrkcgbszns`):

```sql
select key, title, status, blocker
  from public.board_features
 where key ilike '%massa%' or key ilike '%bulk%'
    or title ilike '%massa%' or title ilike '%foto%' or title ilike '%descri%';
```

Se voltar vazio, criar o card antes de mover (o schema fica em `docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md`). Com a `key` em mãos:

```sql
select public.move_card(
  '<key da consulta acima>',
  'em_construcao',
  'PR 1/3 da fila de ações em massa: base, sem UI, worker em dry-run',
  'PR #<número do PR>'
);
```

No fim do PR 1 o status certo é `em_construcao`, **não** `no_ar_verificado`: verificado exige prova colhida na hora, e sem interface não há o que olhar. (`move_card` não limpa `blocker` — se houver um obsoleto, apague em UPDATE separado.)

- [ ] **Step 6: Fechar o loop na mesma sessão**

`gh pr checks` verde → `gh pr merge` → deletar a branch. Não deixar aberto "pra depois".

---

## Notas de execução

**Branch:** o HEAD desta pasta é compartilhado com outras sessões do CCD — `git checkout -b` aqui move o HEAD delas. Ou criar worktree (`git worktree add`, que **não** mexe no HEAD atual), ou confirmar que nenhuma outra sessão está rodando antes de trocar de branch. A base é sempre `main`, nunca outra branch de feature.

**Ordem:** as Tasks 1–2 são independentes entre si. A 3 depende da 1 só conceitualmente (nomes de coluna). A 4 depende da 1 e 3. A 5 depende da 4. A 6 depende da 2. A 7 depende da 5 e 6. A 8 depende da 6.

**O que este PR NÃO faz:**

- Nenhuma interface e nenhuma rota que o painel chame. Enfileirar ainda é INSERT à mão (Task 9, Step 1) — o chamador de `enqueueBulkJobs` nasce no PR 2.
- Nenhum agendamento: `group_hours` e a materialização por horário são o PR 3. Por isso a rota `pending` deste PR só claima, sem `materializeScheduled`.
- Nenhuma herança no `grow_template` — gravar `desc`/`mediaId` da campanha depende da rota de identidade, que é PR 2.
- Nenhum E2E: o teste que a spec pede ("aplicar descrição em massa e ver o progresso avançar") precisa de tela, então vem no PR 2. A cobertura aqui é unitária (Task 6), de integração (Task 8) e a prova de fumaça contra o banco de dev (Task 9, Step 1).
