# Ações em massa nos grupos — PR 2 (Ações imediatas + interface) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar interface à fila que o PR 1 deixou viva: aplicar foto e descrição em massa, abrir e fechar os grupos da campanha na hora, e acompanhar o progresso — sem ninguém precisar dar `insert` à mão.

**Architecture:** As rotas são casca fina (auth + IO). Toda decisão — quais grupos entram, se a descrição vazia foi confirmada, o que herdar no `grow_template` — mora em funções puras em `lib/groups/bulk-batch.ts`, testáveis sem banco. A tela nunca vê o UUID de `groups`: manda só a carga, e o servidor resolve os alvos a partir de `campaign_groups.group_ids`. Progresso por polling, porque o realtime do app é decorativo.

**Tech Stack:** Next.js 15 (App Router, rotas `runtime = "nodejs"`) · React 19 client component · Supabase Postgres via service-role · testes `tsx --test` · E2E Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-30-acoes-em-massa-grupos-design.md`](../specs/2026-08-30-acoes-em-massa-grupos-design.md)

## Global Constraints

- **Português** em comentário, texto de tela, mensagem de erro e commit. Código e identificadores em inglês.
- **TypeScript strict.** Nenhum `any` sem justificativa escrita.
- **Multi-tenant:** toda query em tabela com `tenant_id` leva `.eq("tenant_id", ...)` explícito. O service-role bypassa RLS — o filtro é a proteção real, não a policy.
- **Auth das rotas de painel:** `getRouteTenantContext(req, { allowEngine: false })` + `assertPermission(role, "campaign:edit")`. **Nunca** `resolveSessionTenantId` — ele só lê cookie, e o painel também manda Bearer; a rota passaria em dev e daria 401 em produção.
- **Sem fallback JSON.** Estas rotas são Supabase-only, como as do PR 1. O dual-mode faz tabela ausente cair no JSON em silêncio.
- **Sem migração.** `groups.send_state`, `groups.send_state_at`, `groups.is_admin` e `group_bulk_jobs` já existem em dev (`wfjuwogxaupyadwhvoxy`) e prod (`nidoatbxaylrkcgbszns`) desde o PR 1. Se alguma task achar que precisa de DDL, **pare e reporte** — é sinal de que o entendimento está errado.
- **`campaign_groups.group_ids` guarda `whatsapp_group_id`, não o UUID de `groups`.** O mesmo vale para o `id` que `/api/groups` devolve ao front. O UUID real só existe no servidor.
- **Nunca `git add -A`** — outras sessões sujam o working tree deste worktree (há `competitor-profiles/`, `docs/brand/`, `graphify-out/` untracked). Adicionar arquivo por arquivo e conferir `git diff --cached` numa chamada separada antes de cada commit.
- Testes do web: `npm --workspace apps/web test`. Antes de qualquer push: `./verify-local.ps1` (é o gate real do CI — scan de secrets, os dois `tsc`, build).
- Windows PowerShell 5.1: sem `&&` e sem `||`.

## Decisões deste PR (fechadas com o Igor em 31/08/2026)

| Pergunta | Decisão |
|---|---|
| Quais grupos entram no lote | **Só onde somos admin** (`is_admin === true`). Grupo não-admin é falha garantida, e cada falha queima 4s da janela anti-ban. A tela diz "aplicar em N dos M". |
| Foto e descrição | **Um botão, um `batch_id`**, com as duas ações. Só a ação preenchida vira job. |
| Descrição vazia | Confirmação na tela **e** flag `confirmClear: true` no body. A rota recusa 400 sem a flag — o servidor é a última linha de defesa da ação mais destrutiva do PR. |

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/groups/bulk-batch.ts` (modificar) | Regras puras: seleção de alvos, plano da identidade, merge da herança. Já hospeda `buildBulkJobs` — mesma família, continua abaixo de 200 linhas. |
| `apps/web/src/lib/groups/bulk-batch.test.ts` (modificar) | Testes das três funções novas, ao lado dos 12 que já existem. |
| `apps/web/src/lib/stores/group-bulk-jobs.ts` (modificar) | `countBatch` passa a devolver as ações do lote; `latestBatchProgress` acha o lote mais recente da campanha. |
| `apps/web/src/lib/groups/bulk-request.ts` (criar) | Resolve tenant + campanha para as três rotas. IO puro, sem regra de negócio. |
| `apps/web/src/app/api/campanhas/[slug]/grupos/identidade/route.ts` (criar) | POST foto + descrição. |
| `apps/web/src/app/api/campanhas/[slug]/grupos/estado/route.ts` (criar) | POST abrir/fechar agora. |
| `apps/web/src/app/api/campanhas/[slug]/grupos/lotes/route.ts` (criar) | GET progresso do lote ativo. |
| `apps/web/src/lib/stores/groups.ts` (modificar) | Tipa `send_state` / `send_state_at`, que o `select("*")` já traz. |
| `apps/web/src/lib/mock-data.ts` (modificar) | `Group.sendState` para o front. |
| `apps/web/src/app/api/groups/route.ts` (modificar) | Mapeia `send_state` → `sendState`. |
| `apps/web/src/components/painel/grupos/acoes-em-massa.tsx` (criar) | Bloco da aba Grupos. |
| `apps/web/src/app/painel/campanhas/[slug]/page.tsx` (modificar) | Monta o bloco e o selo no `GroupCard`. |
| `apps/web/e2e/painel-campanha-acoes-em-massa.spec.ts` (criar) | E2E por contraste API × tela. |

---

### Task 1: `selectBulkTargets` — quais grupos entram no lote

**Files:**
- Modify: `apps/web/src/lib/groups/bulk-batch.ts` (acrescentar ao fim)
- Test: `apps/web/src/lib/groups/bulk-batch.test.ts` (acrescentar ao fim)

**Interfaces:**
- Consumes: `BulkTargetGroup` (já existe no arquivo).
- Produces: `selectBulkTargets(groupIds: readonly string[], groups: readonly BulkCandidateGroup[]): BulkTargetSelection`, com `BulkCandidateGroup = { id: string; whatsapp_group_id: string | null; is_admin?: boolean | null }` e `BulkTargetSelection = { targets: BulkTargetGroup[]; skippedNoAdmin: number; skippedNoId: number }`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `apps/web/src/lib/groups/bulk-batch.test.ts` (o arquivo já importa `assert` e `test`; acrescentar `selectBulkTargets` ao import existente de `./bulk-batch`):

```ts
/* ---------- selectBulkTargets ---------- */

// `campaign_groups.group_ids` guarda whatsapp_group_id, não o UUID de `groups`.
// Casar pela coluna errada devolveria lote vazio em produção com dado real.
test("casa group_ids por whatsapp_group_id e devolve o UUID do grupo", () => {
  const sel = selectBulkTargets(["120@g.us"], [
    { id: "uuid-1", whatsapp_group_id: "120@g.us", is_admin: true },
  ]);
  assert.deepEqual(sel.targets, [{ id: "uuid-1", whatsapp_group_id: "120@g.us" }]);
  assert.equal(sel.skippedNoAdmin, 0);
  assert.equal(sel.skippedNoId, 0);
});

// O caso que motivou a decisão: 105 grupos sem admin nunca são elegíveis, e
// enfileirá-los gastaria 4s de janela anti-ban cada um só para falhar.
test("grupo onde não somos admin fica de fora e é contado", () => {
  const sel = selectBulkTargets(["a@g.us", "b@g.us"], [
    { id: "uuid-a", whatsapp_group_id: "a@g.us", is_admin: true },
    { id: "uuid-b", whatsapp_group_id: "b@g.us", is_admin: false },
  ]);
  assert.deepEqual(sel.targets.map((t) => t.id), ["uuid-a"]);
  assert.equal(sel.skippedNoAdmin, 1);
});

// `is_admin` é opcional na store. Ausente significa "nunca medimos", não "sim":
// tratar como admin mandaria o lote para grupos que talvez recusem a operação.
test("is_admin ausente ou nulo conta como não-admin", () => {
  const sel = selectBulkTargets(["a@g.us", "b@g.us"], [
    { id: "uuid-a", whatsapp_group_id: "a@g.us" },
    { id: "uuid-b", whatsapp_group_id: "b@g.us", is_admin: null },
  ]);
  assert.deepEqual(sel.targets, []);
  assert.equal(sel.skippedNoAdmin, 2);
});

test("id da campanha sem grupo correspondente conta como sem id", () => {
  const sel = selectBulkTargets(["sumiu@g.us"], [
    { id: "uuid-a", whatsapp_group_id: "a@g.us", is_admin: true },
  ]);
  assert.deepEqual(sel.targets, []);
  assert.equal(sel.skippedNoId, 1);
});

test("grupo sem whatsapp_group_id nunca é alvo", () => {
  const sel = selectBulkTargets(["a@g.us"], [
    { id: "uuid-a", whatsapp_group_id: null, is_admin: true },
  ]);
  assert.deepEqual(sel.targets, []);
  assert.equal(sel.skippedNoId, 1);
});

// group_ids repetido geraria "aplicar em 3 grupos" com 2 grupos na tela — e o
// índice único da tabela absorveria a duplicata em silêncio no insert.
test("group_ids repetido não duplica o alvo nem a contagem", () => {
  const sel = selectBulkTargets(["a@g.us", "a@g.us"], [
    { id: "uuid-a", whatsapp_group_id: "a@g.us", is_admin: true },
  ]);
  assert.equal(sel.targets.length, 1);
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

```bash
npm --workspace apps/web test
```

Esperado: FAIL — `selectBulkTargets is not exported` / `is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar ao fim de `apps/web/src/lib/groups/bulk-batch.ts`:

```ts
/** Um grupo da store, como candidato a alvo do lote. */
export type BulkCandidateGroup = {
  id: string;
  whatsapp_group_id: string | null;
  is_admin?: boolean | null;
};

export type BulkTargetSelection = {
  targets: BulkTargetGroup[];
  /** Grupos da campanha onde não somos admin. */
  skippedNoAdmin: number;
  /** Ids da campanha sem grupo correspondente (ou grupo sem id do WhatsApp). */
  skippedNoId: number;
};

/**
 * Decide quais grupos da campanha entram no lote.
 *
 * Só entra grupo onde SOMOS admin: trocar foto, descrição ou o modo de envio é
 * operação de administrador, então enfileirar os outros produziria falha
 * garantida — e cada falha ainda gastaria uma janela de 4s do ritmo anti-ban.
 * As duas contagens não são cosméticas: são o que a tela mostra como
 * "aplicar em 91 dos 196 grupos", para o lojista não achar que o lote cobriu
 * tudo.
 *
 * `groupIds` vem de `campaign_groups.group_ids`, que guarda `whatsapp_group_id`
 * — nunca o UUID de `groups`.
 */
export function selectBulkTargets(
  groupIds: readonly string[],
  groups: readonly BulkCandidateGroup[],
): BulkTargetSelection {
  const porWhatsappId = new Map<string, BulkCandidateGroup>();
  for (const group of groups) {
    if (group.whatsapp_group_id) porWhatsappId.set(group.whatsapp_group_id, group);
  }

  const targets: BulkTargetGroup[] = [];
  let skippedNoAdmin = 0;
  let skippedNoId = 0;

  for (const whatsappGroupId of new Set(groupIds)) {
    const group = porWhatsappId.get(whatsappGroupId);
    if (!group?.whatsapp_group_id) {
      skippedNoId += 1;
      continue;
    }
    if (group.is_admin !== true) {
      skippedNoAdmin += 1;
      continue;
    }
    targets.push({ id: group.id, whatsapp_group_id: group.whatsapp_group_id });
  }

  return { targets, skippedNoAdmin, skippedNoId };
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

```bash
npm --workspace apps/web test
```

Esperado: PASS, incluindo os 12 testes que já existiam no arquivo.

- [ ] **Step 5: Rodar o mutante**

O teste que importa é o do `is_admin` ausente. Trocar em `bulk-batch.ts`:

```ts
    if (group.is_admin === false) {
```

Rodar `npm --workspace apps/web test`. **Esperado: FAIL** em "is_admin ausente ou nulo conta como não-admin". Se passar, o teste não vale nada — conserte o teste antes de seguir. Desfazer o mutante (voltar para `!== true`) e rodar de novo: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/groups/bulk-batch.ts apps/web/src/lib/groups/bulk-batch.test.ts
git diff --cached --stat
git commit -m "feat(grupos): selecionar alvos do lote so onde somos admin"
```

---

### Task 2: `planIdentityJobs` e `mergeGrowIdentity` — a trava do vazio e a herança

**Files:**
- Modify: `apps/web/src/lib/groups/bulk-batch.ts` (acrescentar ao fim)
- Test: `apps/web/src/lib/groups/bulk-batch.test.ts` (acrescentar ao fim)

**Interfaces:**
- Consumes: `buildBulkJobs`, `BulkTargetGroup`, `BulkJobInsert` (Task 1 e anteriores).
- Produces:
  - `planIdentityJobs(input: PlanIdentityInput): BulkJobInsert[]`, com `PlanIdentityInput = { tenantId: string; campaignGroupId: string; batchId: string; targets: readonly BulkTargetGroup[]; description?: string | null; mediaId?: string | null; confirmClear?: boolean }`.
  - `mergeGrowIdentity(current: Record<string, unknown> | null, identity: { description?: string | null; mediaId?: string | null }): Record<string, unknown>`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `apps/web/src/lib/groups/bulk-batch.test.ts` (e `planIdentityJobs`, `mergeGrowIdentity` ao import de `./bulk-batch`):

```ts
/* ---------- planIdentityJobs ---------- */

const ALVOS = [
  { id: "uuid-a", whatsapp_group_id: "a@g.us" },
  { id: "uuid-b", whatsapp_group_id: "b@g.us" },
];

const BASE = { tenantId: "t1", campaignGroupId: "cg1", batchId: "batch-1", targets: ALVOS };

// Uma aplicação = um batch_id. Se as duas ações caíssem em lotes diferentes, a
// barra de progresso teria de somar dois lotes que avançam em ritmos distintos.
test("foto e descrição juntas viram um lote só, com as duas ações", () => {
  const jobs = planIdentityJobs({ ...BASE, description: "Atacado", mediaId: "m1" });
  assert.equal(jobs.length, 4);
  assert.equal(new Set(jobs.map((j) => j.batch_id)).size, 1);
  assert.deepEqual(
    [...new Set(jobs.map((j) => j.action))].sort(),
    ["set_description", "set_picture"],
  );
});

test("só a ação preenchida vira job", () => {
  const jobs = planIdentityJobs({ ...BASE, mediaId: "m1" });
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.action === "set_picture"));
});

test("nada preenchido é erro, não lote vazio", () => {
  assert.throws(() => planIdentityJobs({ ...BASE }), /descrição, uma imagem/);
});

// A trava mais importante do PR: string vazia APAGA a descrição dos 91 grupos.
// O front confirma, mas o servidor é a última linha de defesa.
test("descrição vazia sem confirmação é recusada", () => {
  assert.throws(
    () => planIdentityJobs({ ...BASE, description: "" }),
    /Confirme para continuar/,
  );
});

test("descrição vazia COM confirmação é ação legítima e vira lote", () => {
  const jobs = planIdentityJobs({ ...BASE, description: "", confirmClear: true });
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].description, "");
});

// confirmClear é sobre apagar. Não pode virar um "ok" genérico que também
// libere o caso de nada preenchido.
test("confirmClear sozinho não substitui a carga", () => {
  assert.throws(() => planIdentityJobs({ ...BASE, confirmClear: true }), /descrição, uma imagem/);
});

test("sem alvo, o lote é vazio sem erro", () => {
  const jobs = planIdentityJobs({ ...BASE, targets: [], description: "Atacado" });
  assert.deepEqual(jobs, []);
});

/* ---------- mergeGrowIdentity ---------- */

// parseGrowTemplate devolve null sem subjectPattern: um replace aqui desligaria
// o auto-grow da campanha em silêncio, e o grupo 92 nasceria sem nome de molde.
test("herança preserva o resto do grow_template", () => {
  const merged = mergeGrowIdentity(
    { subjectPattern: "Promoções {n}", announce: false, memberAddMode: "admin_add" },
    { mediaId: "m1" },
  );
  assert.equal(merged.subjectPattern, "Promoções {n}");
  assert.equal(merged.announce, false);
  assert.equal(merged.memberAddMode, "admin_add");
  assert.equal(merged.mediaId, "m1");
});

test("campo não enviado não é apagado do template", () => {
  const merged = mergeGrowIdentity({ desc: "antiga", mediaId: "m0" }, { description: "nova" });
  assert.equal(merged.desc, "nova");
  assert.equal(merged.mediaId, "m0");
});

test("template nulo vira objeto novo", () => {
  assert.deepEqual(mergeGrowIdentity(null, { description: "x" }), { desc: "x" });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

```bash
npm --workspace apps/web test
```

Esperado: FAIL — `planIdentityJobs is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar ao fim de `apps/web/src/lib/groups/bulk-batch.ts`:

```ts
export type PlanIdentityInput = {
  tenantId: string;
  campaignGroupId: string;
  batchId: string;
  targets: readonly BulkTargetGroup[];
  description?: string | null;
  mediaId?: string | null;
  /** Consentimento explícito para apagar a descrição de todos os grupos. */
  confirmClear?: boolean;
};

/**
 * Monta o lote de identidade: foto e descrição sob o MESMO `batch_id`.
 *
 * Um lote só porque uma aplicação é um evento só para o lojista — a barra diz
 * "aplicando identidade, 47 de 182", não duas barras correndo em ritmos
 * diferentes na mesma fila.
 *
 * A trava do vazio é aqui, e não só na tela: string vazia apaga a descrição de
 * todos os grupos no WhatsApp. É ação legítima e tem de continuar possível —
 * mas pedida, nunca o efeito colateral de um campo esquecido ou de um `fetch`
 * escrito à mão.
 */
export function planIdentityJobs(input: PlanIdentityInput): BulkJobInsert[] {
  const temDescricao = typeof input.description === "string";
  const temFoto = Boolean(input.mediaId);

  if (!temDescricao && !temFoto) {
    throw new Error("Informe uma descrição, uma imagem, ou as duas.");
  }
  if (temDescricao && input.description === "" && input.confirmClear !== true) {
    throw new Error(
      "Descrição vazia apaga a descrição de todos os grupos. Confirme para continuar.",
    );
  }

  const comum = {
    tenantId: input.tenantId,
    campaignGroupId: input.campaignGroupId,
    batchId: input.batchId,
    groups: input.targets,
  };

  const jobs: BulkJobInsert[] = [];
  if (temDescricao) {
    jobs.push(
      ...buildBulkJobs({ ...comum, action: "set_description", description: input.description }),
    );
  }
  if (temFoto) {
    jobs.push(...buildBulkJobs({ ...comum, action: "set_picture", mediaId: input.mediaId }));
  }
  return jobs;
}

/**
 * Grava a identidade aplicada no `grow_template` da campanha — a herança.
 *
 * MERGE, nunca replace: `parseGrowTemplate` (em `group-grow-store.ts`) devolve
 * `null` quando falta `subjectPattern`, e um template nulo desliga o auto-grow.
 * Trocar o objeto inteiro por `{ desc, mediaId }` pararia a criação de grupos da
 * campanha sem erro nenhum aparecer na tela.
 */
export function mergeGrowIdentity(
  current: Record<string, unknown> | null,
  identity: { description?: string | null; mediaId?: string | null },
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(current ?? {}) };
  if (typeof identity.description === "string") merged.desc = identity.description;
  if (identity.mediaId) merged.mediaId = identity.mediaId;
  return merged;
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

```bash
npm --workspace apps/web test
```

Esperado: PASS.

- [ ] **Step 5: Rodar os dois mutantes**

Mutante A — afrouxar a trava do vazio. Trocar em `planIdentityJobs`:

```ts
  if (temDescricao && input.description === "" && input.confirmClear === false) {
```

Rodar `npm --workspace apps/web test`. **Esperado: FAIL** em "descrição vazia sem confirmação é recusada". Desfazer.

Mutante B — herança que apaga. Trocar em `mergeGrowIdentity`:

```ts
  const merged: Record<string, unknown> = {};
```

Rodar `npm --workspace apps/web test`. **Esperado: FAIL** em "herança preserva o resto do grow_template". Desfazer e rodar de novo: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/groups/bulk-batch.ts apps/web/src/lib/groups/bulk-batch.test.ts
git diff --cached --stat
git commit -m "feat(grupos): plano do lote de identidade e heranca no grow_template"
```

---

### Task 3: progresso do lote na store

**Files:**
- Modify: `apps/web/src/lib/stores/group-bulk-jobs.ts` (`countBatch`, ao fim do arquivo)

**Interfaces:**
- Consumes: `BulkAction` (de `bulk-batch.ts`), `BulkJobStatus`, `TABLE`.
- Produces:
  - `countBatch(tenantId: string, batchId: string): Promise<BatchCounts>` — assinatura mantida, retorno ganha `actions`. `BatchCounts = { total: number; done: number; failed: number; pending: number; actions: BulkAction[] }`.
  - `latestBatchProgress(tenantId: string, campaignGroupId: string): Promise<BatchProgress | null>`, com `BatchProgress = BatchCounts & { batchId: string; createdAt: string }`.

`countBatch` ainda não tem nenhum chamador (nasceu no PR 1 para esta tela), então ampliar o retorno não quebra nada — verificado com `grep -rn "countBatch" apps/`.

- [ ] **Step 1: Substituir `countBatch` e acrescentar `latestBatchProgress`**

Não há teste unitário aqui: a função é uma query. O que ela produz é coberto de ponta a ponta pelo E2E da Task 8 e pelo teste de integração do worker que já existe (`cadeia-acoes-em-massa.integration.test.ts`). Escrever um teste com Supabase mockado só provaria que o mock foi escrito conforme o código.

Trocar a `countBatch` atual (fim de `apps/web/src/lib/stores/group-bulk-jobs.ts`) por:

```ts
export type BatchCounts = {
  total: number;
  done: number;
  failed: number;
  pending: number;
  /** Ações distintas do lote — a tela escreve "Aplicando foto e descrição". */
  actions: BulkAction[];
};

export type BatchProgress = BatchCounts & {
  batchId: string;
  createdAt: string;
};

/** Progresso de um lote: o "47 de 91" da tela. */
export async function countBatch(tenantId: string, batchId: string): Promise<BatchCounts> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("status, action")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ status: BulkJobStatus; action: BulkAction }>;
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return {
    total: rows.length,
    done,
    failed,
    pending: rows.length - done - failed,
    actions: [...new Set(rows.map((r) => r.action))],
  };
}

/**
 * O lote mais recente de uma campanha, com progresso — ou `null` se nunca houve.
 *
 * A tela precisa disto (e não só da resposta do POST) porque o `batchId` que
 * vive na memória do componente morre num F5, e um lote de 91 grupos leva ~6
 * minutos: recarregar a página no meio é o caso comum, não a exceção.
 */
export async function latestBatchProgress(
  tenantId: string,
  campaignGroupId: string,
): Promise<BatchProgress | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("batch_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as { batch_id: string; created_at: string };
  const counts = await countBatch(tenantId, row.batch_id);
  return { ...counts, batchId: row.batch_id, createdAt: row.created_at };
}
```

- [ ] **Step 2: Conferir que compila**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

O `verify-local.ps1` roda os dois `tsc`; aqui basta o do web.
Esperado: sem erro.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/stores/group-bulk-jobs.ts
git diff --cached --stat
git commit -m "feat(grupos): progresso do lote mais recente da campanha"
```

---

### Task 4: `resolveBulkCampaign` + as duas rotas de ação

**Files:**
- Create: `apps/web/src/lib/groups/bulk-request.ts`
- Create: `apps/web/src/app/api/campanhas/[slug]/grupos/identidade/route.ts`
- Create: `apps/web/src/app/api/campanhas/[slug]/grupos/estado/route.ts`

**Interfaces:**
- Consumes: `selectBulkTargets`, `planIdentityJobs`, `mergeGrowIdentity`, `buildBulkJobs` (Tasks 1-2); `enqueueBulkJobs` (PR 1); `getRouteTenantContext`, `assertPermission`.
- Produces: `resolveBulkCampaign(req: Request, slug: string): Promise<{ tenantId: string; campaign: CampaignGroup }>` — lança `Response` (401/403/404), como os helpers do repo já fazem.
- Contrato de resposta das duas rotas POST: `201 { batchId, total, skipped: { semAdmin: number, semId: number } }`.

As duas rotas ficam na mesma task porque são gêmeas: um reviewer que rejeitasse uma rejeitaria a outra, e o helper que elas compartilham nasce aqui.

- [ ] **Step 1: Criar o helper de contexto**

Criar `apps/web/src/lib/groups/bulk-request.ts`:

```ts
import "server-only";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { assertPermission } from "@/lib/permissions";
import * as campaignGroupsStore from "@/lib/stores/campaign-groups";

/**
 * Tenant + campanha para as rotas de ação em massa.
 *
 * `allowEngine: false` porque estas são rotas de painel: quem aplica foto em 91
 * grupos é uma pessoa com papel no tenant, não o worker. E `getRouteTenantContext`
 * (não `resolveSessionTenantId`) porque o painel manda Bearer além do cookie — um
 * helper só-cookie passaria em dev e daria 401 em produção.
 *
 * Lança `Response` em vez de devolver erro: é o padrão do repo, e deixa a rota
 * com um `catch (e) { if (e instanceof Response) return e }` só.
 */
export async function resolveBulkCampaign(
  req: Request,
  slug: string,
): Promise<{ tenantId: string; campaign: campaignGroupsStore.CampaignGroup }> {
  const ctx = await getRouteTenantContext(req, { allowEngine: false });
  if (!ctx.role) throw new Response("Sem permissão para esta ação.", { status: 403 });
  assertPermission(ctx.role, "campaign:edit");

  const campaign = await campaignGroupsStore.getCampaignGroupBySlug(ctx.tenantId, slug);
  if (!campaign) {
    throw Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  }

  return { tenantId: ctx.tenantId, campaign };
}
```

- [ ] **Step 2: Criar a rota de identidade**

Criar `apps/web/src/app/api/campanhas/[slug]/grupos/identidade/route.ts`:

```ts
import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { mergeGrowIdentity, planIdentityJobs, selectBulkTargets } from "@/lib/groups/bulk-batch";
import { enqueueBulkJobs } from "@/lib/stores/group-bulk-jobs";
import * as campaignGroupsStore from "@/lib/stores/campaign-groups";
import * as groupsStore from "@/lib/stores/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/grupos/identidade
 * body { description?: string, mediaId?: string, confirmClear?: boolean }
 *
 * Enfileira foto e/ou descrição para todos os grupos ADMINISTRADOS da campanha,
 * sob um `batch_id` só, e grava a identidade no `grow_template` — sem isso o
 * grupo 92, criado pelo auto-grow, nasceria fora do padrão que o lojista acabou
 * de aplicar.
 *
 * A tela não manda a lista de grupos: ela nem conhece o UUID de `groups` (o
 * `id` que /api/groups devolve é o whatsapp_group_id). Quem resolve o alvo é o
 * servidor, a partir de `campaign_groups.group_ids`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    // `typeof` e não `??`: string vazia é carga legítima (apagar a descrição) e
    // um default a engoliria, transformando "não mandei descrição" em "apague".
    const description = typeof body.description === "string" ? body.description : undefined;
    const mediaId = typeof body.mediaId === "string" && body.mediaId ? body.mediaId : undefined;

    const groups = await groupsStore.listGroups(tenantId);
    const selection = selectBulkTargets(campaign.group_ids, groups);

    const batchId = crypto.randomUUID();
    let jobs;
    try {
      jobs = planIdentityJobs({
        tenantId,
        campaignGroupId: campaign.id,
        batchId,
        targets: selection.targets,
        description,
        mediaId,
        confirmClear: body.confirmClear === true,
      });
    } catch (validation) {
      const message =
        validation instanceof Error ? validation.message : "Dados inválidos.";
      return Response.json({ error: message }, { status: 400 });
    }

    if (selection.targets.length === 0) {
      return Response.json(
        {
          error:
            "Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá para trocar foto nem descrição.",
        },
        { status: 400 },
      );
    }

    const total = await enqueueBulkJobs(tenantId, jobs);

    // A herança é gravada mesmo que o enqueue tenha virado no-op por lote
    // repetido: o padrão da campanha é o que o lojista pediu, não o resultado da
    // deduplicação da fila.
    await campaignGroupsStore.updateCampaignGroup(tenantId, campaign.id, {
      grow_template: mergeGrowIdentity(campaign.grow_template, { description, mediaId }),
    });

    return Response.json(
      {
        batchId,
        total,
        skipped: { semAdmin: selection.skippedNoAdmin, semId: selection.skippedNoId },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/identidade] falha ao enfileirar:", error);
    return Response.json({ error: "Erro ao aplicar a identidade nos grupos." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Criar a rota de estado**

Criar `apps/web/src/app/api/campanhas/[slug]/grupos/estado/route.ts`:

```ts
import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { buildBulkJobs, selectBulkTargets } from "@/lib/groups/bulk-batch";
import { enqueueBulkJobs } from "@/lib/stores/group-bulk-jobs";
import * as groupsStore from "@/lib/stores/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/grupos/estado
 * body { action: "open" | "close" }
 *
 * "Abrir" e "fechar" são sobre quem pode MANDAR mensagem no grupo
 * (`not_announcement` / `announcement`). Não mexem no link de convite nem em
 * quem pode editar os dados do grupo.
 *
 * O reflexo em `groups.send_state` acontece no `ack` do worker, não aqui: a
 * tela só deve dizer "fechado" depois que o WhatsApp aceitou.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const action = body.action;
    if (action !== "open" && action !== "close") {
      return Response.json({ error: 'Ação deve ser "open" ou "close".' }, { status: 400 });
    }

    const groups = await groupsStore.listGroups(tenantId);
    const selection = selectBulkTargets(campaign.group_ids, groups);

    if (selection.targets.length === 0) {
      return Response.json(
        {
          error:
            "Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá para abrir nem fechar.",
        },
        { status: 400 },
      );
    }

    const batchId = crypto.randomUUID();
    const total = await enqueueBulkJobs(
      tenantId,
      buildBulkJobs({
        tenantId,
        campaignGroupId: campaign.id,
        batchId,
        action,
        groups: selection.targets,
      }),
    );

    return Response.json(
      {
        batchId,
        total,
        skipped: { semAdmin: selection.skippedNoAdmin, semId: selection.skippedNoId },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/estado] falha ao enfileirar:", error);
    return Response.json({ error: "Erro ao abrir ou fechar os grupos." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Conferir que compila e que os testes seguem passando**

```bash
npm --workspace apps/web test
npm --workspace apps/web run lint
```

Esperado: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/groups/bulk-request.ts "apps/web/src/app/api/campanhas/[slug]/grupos/identidade/route.ts" "apps/web/src/app/api/campanhas/[slug]/grupos/estado/route.ts"
git diff --cached --stat
git commit -m "feat(grupos): rotas de identidade e estado em massa"
```

---

### Task 5: rota de progresso do lote

**Files:**
- Create: `apps/web/src/app/api/campanhas/[slug]/grupos/lotes/route.ts`

**Interfaces:**
- Consumes: `resolveBulkCampaign` (Task 4), `latestBatchProgress` (Task 3).
- Produces: `GET` → `200 BatchProgress | null`.

- [ ] **Step 1: Criar a rota**

Criar `apps/web/src/app/api/campanhas/[slug]/grupos/lotes/route.ts`:

```ts
import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { latestBatchProgress } from "@/lib/stores/group-bulk-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campanhas/[slug]/grupos/lotes — progresso do lote mais recente.
 *
 * A tela faz polling disto a cada 3s enquanto houver job pendente. Polling e não
 * realtime porque o realtime do app é decorativo (`postgres_changes` sem evento
 * configurado) — uma barra que depende dele nunca se moveria.
 *
 * Não carrega os grupos de propósito: a cada 3 segundos, um `listGroups` por
 * batida seria uma query cara para responder um contador.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);
    return Response.json(await latestBatchProgress(tenantId, campaign.id));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/lotes] falha ao ler progresso:", error);
    return Response.json({ error: "Erro ao ler o progresso do lote." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Conferir**

```bash
npm --workspace apps/web run lint
```

Esperado: sem erro.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/api/campanhas/[slug]/grupos/lotes/route.ts"
git diff --cached --stat
git commit -m "feat(grupos): rota de progresso do lote em massa"
```

---

### Task 6: `sendState` da store até o selo no card

**Files:**
- Modify: `apps/web/src/lib/stores/groups.ts` (tipo `Group`)
- Modify: `apps/web/src/lib/mock-data.ts` (tipo `Group`)
- Modify: `apps/web/src/app/api/groups/route.ts` (mapa do GET)
- Modify: `apps/web/src/app/painel/campanhas/[slug]/page.tsx` (`GroupCard`)

**Interfaces:**
- Consumes: colunas `groups.send_state` e `groups.send_state_at`, que já existem nos dois bancos e já vêm no `select("*")` de `listGroups`.
- Produces: `Group.sendState?: "open" | "closed" | null` no tipo do front, servido por `GET /api/groups`.

- [ ] **Step 1: Tipar na store**

Em `apps/web/src/lib/stores/groups.ts`, dentro de `export type Group`, logo depois de `invite_url?: string;`:

```ts
  /**
   * Quem pode mandar mensagem no grupo, do jeito que NÓS aplicamos pela última
   * vez. `null` é resposta honesta ("nunca aplicamos"), não ausência de dado —
   * o WhatsApp não é consultado para preencher isto.
   */
  send_state?: "open" | "closed" | null;
  send_state_at?: string | null;
```

- [ ] **Step 2: Tipar no front**

Em `apps/web/src/lib/mock-data.ts`, dentro de `export type Group`, logo depois de `inviteUrl?: string;`:

```ts
  /** Estado de envio que aplicamos por último. `null`/ausente = nunca aplicamos. */
  sendState?: "open" | "closed" | null;
```

- [ ] **Step 3: Mapear no GET**

Em `apps/web/src/app/api/groups/route.ts`, no `groups.map(...)` do `GET`, acrescentar depois de `displayNumber: g.display_number,`:

```ts
    sendState: g.send_state ?? null,
```

- [ ] **Step 4: Selo no `GroupCard`**

Em `apps/web/src/app/painel/campanhas/[slug]/page.tsx`, dentro de `GroupCard`, o bloco `<div className="mt-3">` hoje fecha logo após o selo de status. Envolver os dois selos numa linha, substituindo o `</div>` que fecha esse bloco por:

```tsx
        <SeloEnvio estado={g.group?.sendState ?? null} />
      </div>
```

e trocar a abertura `<div className="mt-3">` por:

```tsx
      <div className="mt-3 flex flex-wrap items-center gap-2">
```

Acrescentar o componente junto dos outros helpers, no fim do arquivo:

```tsx
/**
 * Aberto / Fechado / sem informação.
 *
 * O terceiro estado é dito em voz alta de propósito: sumir com o selo quando
 * `send_state` é nulo faria "nunca aplicamos" parecer "está aberto", que é a
 * suposição errada mais cara — o lojista acharia que fechou o grupo de
 * madrugada quando não fechou.
 */
function SeloEnvio({ estado }: { estado: "open" | "closed" | null }) {
  if (estado === "open") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-sucesso/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-sucesso">
        <Unlock className="h-3 w-3" /> Aberto
      </span>
    );
  }
  if (estado === "closed") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-poco px-2.5 py-1 text-[10px] uppercase tracking-wider text-aco/70">
        <Lock className="h-3 w-3" /> Fechado
      </span>
    );
  }
  return (
    <span className="font-data inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider text-aco/40">
      Envio: sem informação
    </span>
  );
}
```

`Lock` e `Unlock` já estão importados no arquivo.

- [ ] **Step 5: Conferir**

```bash
npm --workspace apps/web run lint
npm --workspace apps/web test
```

Esperado: PASS nos dois.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/stores/groups.ts apps/web/src/lib/mock-data.ts apps/web/src/app/api/groups/route.ts "apps/web/src/app/painel/campanhas/[slug]/page.tsx"
git diff --cached --stat
git commit -m "feat(grupos): selo de aberto/fechado no card do grupo"
```

---

### Task 7: bloco "Ações em massa" na aba Grupos

**Files:**
- Create: `apps/web/src/components/painel/grupos/acoes-em-massa.tsx`
- Modify: `apps/web/src/app/painel/campanhas/[slug]/page.tsx` (import + montagem na aba Grupos)

**Interfaces:**
- Consumes: `POST .../grupos/identidade`, `POST .../grupos/estado`, `GET .../grupos/lotes` (Tasks 4-5); `POST /api/media` (já existe).
- Produces: `<AcoesEmMassa slug={string} administrados={number} totais={number} onLoteConcluido={() => void} />`.

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/components/painel/grupos/acoes-em-massa.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ações em massa sobre os grupos que JÁ EXISTEM na campanha: foto, descrição e
 * abrir/fechar.
 *
 * O que o componente NÃO faz, e por quê:
 *
 * - **Não escolhe os grupos.** Ele nem conhece o UUID de `groups` (o `id` que
 *   /api/groups devolve é o whatsapp_group_id). Manda só a carga; o servidor
 *   resolve o alvo a partir de `campaign_groups.group_ids`.
 * - **Não usa realtime.** O progresso é polling de 3s, porque o realtime do app
 *   é decorativo — uma barra pendurada nele nunca se moveria.
 * - **Não apaga descrição sem perguntar.** String vazia apaga a descrição de
 *   todos os grupos no WhatsApp; a confirmação daqui é a primeira barreira, e a
 *   flag `confirmClear` no body é a segunda, no servidor.
 */

type Progresso = {
  batchId: string;
  actions: string[];
  createdAt: string;
  total: number;
  done: number;
  failed: number;
  pending: number;
};

type Resultado = {
  batchId: string;
  total: number;
  skipped: { semAdmin: number; semId: number };
};

type Props = {
  slug: string;
  /** Grupos da campanha onde somos admin — os únicos que podem entrar no lote. */
  administrados: number;
  /** Total de grupos da campanha, para explicar a diferença. */
  totais: number;
  /** Chamado quando um lote termina, para a tela recarregar os selos. */
  onLoteConcluido: () => void;
};

/** Ritmo do executor: 1 operação a cada 4s ≈ 15/min. */
const OPS_POR_MINUTO = 15;
const POLL_MS = 3000;

const ROTULO_ACAO: Record<string, string> = {
  set_description: "descrição",
  set_picture: "foto",
  open: "abertura",
  close: "fechamento",
};

function descreveLote(actions: string[]): string {
  const nomes = actions.map((a) => ROTULO_ACAO[a] ?? a);
  if (nomes.length === 0) return "ações";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export function AcoesEmMassa({ slug, administrados, totais, onLoteConcluido }: Props) {
  const [descricao, setDescricao] = useState("");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [aplicando, setAplicando] = useState<"identidade" | "open" | "close" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  // Guarda o pendente da batida anterior: a transição >0 → 0 é o fim do lote.
  const pendenteAnterior = useRef<number | null>(null);

  const lerProgresso = useCallback(async () => {
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/lotes`);
      if (!res.ok) return;
      const dado = (await res.json()) as Progresso | null;
      setProgresso(dado);

      const antes = pendenteAnterior.current;
      pendenteAnterior.current = dado?.pending ?? null;
      if (antes !== null && antes > 0 && dado && dado.pending === 0) onLoteConcluido();
    } catch {
      // Uma batida perdida não é erro de tela: a próxima corrige.
    }
  }, [slug, onLoteConcluido]);

  // Busca no mount para reencontrar um lote em andamento depois de um F5 — com
  // 91 grupos o lote leva ~6 min, então recarregar no meio é o caso comum.
  useEffect(() => {
    lerProgresso();
  }, [lerProgresso]);

  useEffect(() => {
    if (!progresso || progresso.pending === 0) return;
    const id = setInterval(lerProgresso, POLL_MS);
    return () => clearInterval(id);
  }, [progresso, lerProgresso]);

  const enviarFoto = useCallback(async (file: File) => {
    setEnviandoFoto(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: form });
      if (!res.ok) throw new Error("Não foi possível enviar a imagem.");
      const data = (await res.json()) as { id: string };
      setMediaId(data.id);
      setNomeArquivo(file.name);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
    } finally {
      setEnviandoFoto(false);
    }
  }, []);

  function escolherFoto() {
    const input = arquivoRef.current;
    if (!input) return;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) enviarFoto(f);
      input.value = "";
    };
    input.click();
  }

  function relatar(resultado: Resultado, verbo: string) {
    const partes = [`${verbo} em ${resultado.total} operações.`];
    if (resultado.skipped.semAdmin > 0) {
      partes.push(
        `${resultado.skipped.semAdmin} grupo(s) ficaram de fora: não somos admin neles.`,
      );
    }
    const minutos = Math.max(1, Math.ceil(resultado.total / OPS_POR_MINUTO));
    partes.push(`Leva cerca de ${minutos} min — o ritmo é o que protege o número.`);
    setAviso(partes.join(" "));
  }

  async function aplicarIdentidade() {
    const temFoto = Boolean(mediaId);
    const texto = descricao;
    const vaiApagar = !temFoto || texto === "";

    if (!temFoto && texto === "") {
      setErro("Escolha uma imagem, escreva uma descrição, ou as duas.");
      return;
    }
    // Só pergunta quando a descrição vazia É a carga: com foto escolhida e
    // descrição em branco, o lote é só de foto e nada é apagado.
    const apagandoDescricao = texto === "" && !temFoto;
    if (apagandoDescricao) {
      const ok = window.confirm(
        `Isso vai APAGAR a descrição de ${administrados} grupo(s) no WhatsApp. Confirmar?`,
      );
      if (!ok) return;
    }

    setAplicando("identidade");
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/identidade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(texto !== "" || apagandoDescricao ? { description: texto } : {}),
          ...(mediaId ? { mediaId } : {}),
          ...(apagandoDescricao ? { confirmClear: true } : {}),
        }),
      });
      const dado = await res.json();
      if (!res.ok) throw new Error(dado?.error ?? "Não foi possível aplicar.");
      relatar(dado as Resultado, "Enfileirado");
      await lerProgresso();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar.");
    } finally {
      setAplicando(null);
    }
  }

  async function aplicarEstado(action: "open" | "close") {
    setAplicando(action);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/estado`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const dado = await res.json();
      if (!res.ok) throw new Error(dado?.error ?? "Não foi possível aplicar.");
      relatar(dado as Resultado, action === "open" ? "Abertura enfileirada" : "Fechamento enfileirado");
      await lerProgresso();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar.");
    } finally {
      setAplicando(null);
    }
  }

  const rodando = Boolean(progresso && progresso.pending > 0);
  const ocupado = aplicando !== null || enviandoFoto;
  const pct = progresso && progresso.total > 0
    ? ((progresso.done + progresso.failed) / progresso.total) * 100
    : 0;

  return (
    <section aria-label="Ações em massa" className="pn-card mb-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold text-volt-950">Ações em massa</h2>
        <p className="font-data text-[11px] text-aco/50" data-testid="acoes-massa-alcance">
          {administrados === totais
            ? `${administrados} grupo(s)`
            : `${administrados} de ${totais} grupo(s) — nos outros não somos admin`}
        </p>
      </div>

      {administrados === 0 ? (
        <p className="mt-3 text-sm text-atencao">
          Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá
          para trocar foto, descrição, nem abrir e fechar.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="acoes-massa-descricao"
                className="font-data text-[10px] uppercase tracking-wider text-aco/50"
              >
                Descrição
              </label>
              <textarea
                id="acoes-massa-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                placeholder="Texto que vai valer para todos os grupos."
                className="mt-1.5 w-full rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 outline-none placeholder:text-aco/40"
              />
              <p className="font-data mt-1 text-[10px] text-aco/45">
                Em branco (e sem foto) apaga a descrição de todos — pedimos confirmação.
              </p>
            </div>

            <div>
              <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">Foto</span>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={escolherFoto}
                  disabled={ocupado}
                  className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:opacity-50"
                >
                  {enviandoFoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {nomeArquivo ? "Trocar imagem" : "Escolher imagem"}
                </button>
                {nomeArquivo && (
                  <span className="truncate text-xs text-aco/60">{nomeArquivo}</span>
                )}
              </div>
              <input ref={arquivoRef} type="file" accept="image/*" className="hidden" />

              <button
                type="button"
                onClick={aplicarIdentidade}
                disabled={ocupado}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {aplicando === "identidade" && <Loader2 className="h-4 w-4 animate-spin" />}
                Aplicar nos {administrados} grupos
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-aco/10 pt-4">
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">
              Estado dos grupos
            </span>
            <button
              type="button"
              onClick={() => aplicarEstado("open")}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:opacity-50"
            >
              {aplicando === "open" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
              Abrir agora
            </button>
            <button
              type="button"
              onClick={() => aplicarEstado("close")}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:opacity-50"
            >
              {aplicando === "close" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Fechar agora
            </button>
          </div>
        </>
      )}

      {erro && <p className="mt-3 text-sm text-alerta">{erro}</p>}
      {aviso && !erro && <p className="mt-3 text-sm text-aco/70">{aviso}</p>}

      {progresso && progresso.total > 0 && (
        <div className="mt-4" data-testid="acoes-massa-progresso">
          <div className="flex items-center justify-between">
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">
              {rodando ? `Aplicando ${descreveLote(progresso.actions)}` : "Último lote"}
            </span>
            <span
              className="font-data text-sm tabular-nums text-volt-950"
              data-testid="acoes-massa-contador"
            >
              {progresso.done + progresso.failed} de {progresso.total}
            </span>
          </div>
          <div className="pn-poco mt-1.5 h-2 w-full overflow-hidden rounded-full">
            <div
              className="pn-fill h-full w-full rounded-full"
              style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }}
            />
          </div>
          {progresso.failed > 0 && (
            <p className={cn("font-data mt-1 text-[11px]", "text-atencao")}>
              {progresso.failed} falharam. Reaplique para tentar de novo só neles.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Montar na aba Grupos**

Em `apps/web/src/app/painel/campanhas/[slug]/page.tsx`:

Acrescentar ao import, junto dos outros de `@/components/painel`:

```tsx
import { AcoesEmMassa } from "@/components/painel/grupos/acoes-em-massa";
```

E no ramo `tab === "Grupos"`, no `else` (o que tem a grade), envolver a grade:

```tsx
          ) : (
            <>
              <AcoesEmMassa
                slug={campanha.slug ?? campanha.id}
                administrados={o.groups.filter((g) => g.group?.isAdmin).length}
                totais={o.groups.length}
                onLoteConcluido={loadData}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {o.groups.map((g) => <GroupCard key={g.id} g={g} live={live} origin={origin} />)}
              </div>
            </>
          )
```

A contagem de administrados usa `g.group?.isAdmin`, o mesmo campo que `selectBulkTargets` usa no servidor — se as duas divergissem, a tela prometeria um alcance que o lote não cumpre.

- [ ] **Step 3: Provar que o componente chega na tela**

```bash
git grep -n "AcoesEmMassa" -- apps/web/src/app
```

Esperado: pelo menos duas linhas em `apps/web/src/app/painel/campanhas/[slug]/page.tsx` (import e uso). Componente criado não é componente montado — foi assim que o #114 morreu sem ninguém notar. O guard `component-reachability` também cobre isso:

```bash
npm --workspace apps/web test
```

Esperado: PASS, com o teste de órfãos incluído.

- [ ] **Step 4: Lint e build**

```bash
npm --workspace apps/web run lint
```

Esperado: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/painel/grupos/acoes-em-massa.tsx "apps/web/src/app/painel/campanhas/[slug]/page.tsx"
git diff --cached --stat
git commit -m "feat(grupos): bloco de acoes em massa na aba Grupos"
```

---

### Task 8: E2E por contraste API × tela

**Files:**
- Create: `apps/web/e2e/painel-campanha-acoes-em-massa.spec.ts`

**Interfaces:**
- Consumes: `GET /api/campanhas`, `GET /api/groups`, `GET .../grupos/lotes` (Task 5); os `data-testid` da Task 7 (`acoes-massa-alcance`, `acoes-massa-progresso`, `acoes-massa-contador`).

O spec **não** dispara um lote. Aplicar identidade num ambiente com sessão de WhatsApp de pé mexeria em grupos reais; e sem sessão, o worker falharia todos os jobs. O que se protege aqui é a promessa de alcance — o número que o lojista lê antes de clicar.

- [ ] **Step 1: Escrever o spec**

Criar `apps/web/e2e/painel-campanha-acoes-em-massa.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Bloco "Ações em massa" na aba Grupos da campanha.
 *
 * Desenho por CONTRASTE, como `painel-protecao-grupos.spec.ts`: o número de
 * grupos administrados depende de `groups.is_admin`, que nenhum ambiente
 * garante — em dev pode ser zero, em produção muda a cada sync. Um spec que
 * cobrasse "91 grupos" passaria hoje e quebraria amanhã por dado, não por
 * regresso.
 *
 * A âncora são as duas APIs que a tela usa; o spec cobra da tela exatamente o
 * que elas responderam.
 *
 * O QUE ISTO PROTEGE DE VERDADE: o alcance é a única frase da tela lida ANTES
 * de uma ação irreversível em 91 grupos de WhatsApp. Se ela dissesse "aplicar
 * em 196" quando o servidor vai aplicar em 91 — ou pior, o contrário — o
 * lojista clicaria sem saber o tamanho do que está fazendo.
 */

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
type Grupo = { id: string; isAdmin?: boolean; sendState?: "open" | "closed" | null };

exigeCredenciais();

test("o alcance do lote reflete os grupos administrados da campanha", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const resCampanhas = await page.request.get("/api/campanhas");
  expect(resCampanhas.ok(), `GET /api/campanhas respondeu ${resCampanhas.status()}`).toBeTruthy();
  const campanhas = (await resCampanhas.json()) as Campanha[];

  // Sem campanha com grupo não há bloco a cobrar — e inventar uma aqui criaria
  // dado que o próximo spec herdaria sujo.
  const campanha = campanhas.find((c) => c.groupIds.length > 0);
  test.skip(!campanha, "Nenhuma campanha com grupos neste ambiente.");
  if (!campanha) return;

  const resGrupos = await page.request.get("/api/groups");
  expect(resGrupos.ok(), `GET /api/groups respondeu ${resGrupos.status()}`).toBeTruthy();
  const grupos = (await resGrupos.json()) as Grupo[];

  const daCampanha = grupos.filter((g) => campanha.groupIds.includes(g.id));
  const administrados = daCampanha.filter((g) => g.isAdmin).length;

  await page.goto(`/painel/campanhas/${campanha.slug ?? campanha.id}`);

  const bloco = page.getByRole("region", { name: "Ações em massa" });
  await expect(bloco).toBeVisible();

  const alcance = bloco.getByTestId("acoes-massa-alcance");
  await expect(alcance).toContainText(String(administrados));

  if (administrados === 0) {
    // Zero admin não é "tudo certo": é que não há o que aplicar. Afirmar a
    // ausência pega o bug de oferecer um botão que só produziria falha.
    await expect(bloco.getByRole("button", { name: /Aplicar nos/ })).toHaveCount(0);
    await expect(bloco.getByRole("button", { name: "Abrir agora" })).toHaveCount(0);
  } else {
    await expect(bloco.getByRole("button", { name: `Aplicar nos ${administrados} grupos` })).toBeVisible();
    await expect(bloco.getByRole("button", { name: "Abrir agora" })).toBeVisible();
    await expect(bloco.getByRole("button", { name: "Fechar agora" })).toBeVisible();
    // O alcance parcial tem de ser dito: "91" sozinho, num pool de 196, deixaria
    // o lojista achar que o lote cobre a campanha inteira.
    if (administrados !== daCampanha.length) {
      await expect(alcance).toContainText(String(daCampanha.length));
    }
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

test("o progresso do lote reflete a rota de lotes", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const resCampanhas = await page.request.get("/api/campanhas");
  const campanhas = (await resCampanhas.json()) as Campanha[];
  const campanha = campanhas.find((c) => c.groupIds.length > 0);
  test.skip(!campanha, "Nenhuma campanha com grupos neste ambiente.");
  if (!campanha) return;

  const slug = campanha.slug ?? campanha.id;
  const resLote = await page.request.get(`/api/campanhas/${slug}/grupos/lotes`);
  expect(resLote.ok(), `GET .../grupos/lotes respondeu ${resLote.status()}`).toBeTruthy();
  const lote = (await resLote.json()) as
    | { total: number; done: number; failed: number }
    | null;

  await page.goto(`/painel/campanhas/${slug}`);
  const bloco = page.getByRole("region", { name: "Ações em massa" });
  await expect(bloco).toBeVisible();

  const progresso = bloco.getByTestId("acoes-massa-progresso");

  if (!lote || lote.total === 0) {
    // Nunca houve lote: mostrar uma barra em 0 de 0 sugeriria que algo está
    // rodando, que é a leitura errada mais provável desta tela.
    await expect(progresso).toHaveCount(0);
  } else {
    await expect(bloco.getByTestId("acoes-massa-contador")).toHaveText(
      `${lote.done + lote.failed} de ${lote.total}`,
    );
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
```

- [ ] **Step 2: Conferir a assinatura dos helpers**

`coletarFalhasDeApi` é usado exatamente como em `painel-protecao-grupos.spec.ts`. Antes de rodar:

```bash
grep -n "export function coletarFalhasDeApi" -A 6 apps/web/e2e/sessao-helpers.ts
```

Se a assinatura divergir do uso acima, ajustar o spec para casar com o helper — **não** mudar o helper.

- [ ] **Step 3: Rodar o E2E**

```bash
npm --workspace apps/web run e2e -- painel-campanha-acoes-em-massa
```

O script chama-se `e2e` (`playwright test`). Sem `E2E_EMAIL`/`E2E_PASSWORD` no ambiente o spec pula — isso é esperado localmente, não é falha.

Esperado: PASS (ou SKIP por falta de credencial).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/painel-campanha-acoes-em-massa.spec.ts
git diff --cached --stat
git commit -m "test(e2e): alcance e progresso das acoes em massa por contraste"
```

---

### Task 9: fechar o PR

**Files:**
- Modify: `docs/superpowers/specs/2026-08-30-acoes-em-massa-grupos-design.md` (adendo com as decisões de 31/08)

- [ ] **Step 1: Registrar as decisões novas no spec**

O spec dizia "todos os grupos da campanha" e não fechava o formato da confirmação. Acrescentar, logo depois da tabela "Decisões de produto travadas com o Igor (30/08)":

```markdown
#### Adendo do PR 2 (31/08/2026)

| Pergunta | Decisão |
|---|---|
| Escopo do lote | **Só grupos onde somos admin** (`is_admin === true`), corrigindo o "todos os grupos da campanha" acima. Grupo não-admin é falha garantida e cada falha queima 4s da janela anti-ban. A tela mostra "N de M". |
| Foto + descrição | **Um `batch_id` para as duas ações.** Uma aplicação é um evento só para o lojista. |
| Descrição vazia | Confirmação na tela **e** flag `confirmClear: true` no body; a rota recusa 400 sem ela. |
```

- [ ] **Step 2: Rodar o gate real**

```powershell
./verify-local.ps1
```

Esperado: verde. Cobre scan de secrets, os dois `tsc` e o build — `lint` e `tsx --test` sozinhos não checam tipo.

- [ ] **Step 3: Commit e push**

```bash
git add docs/superpowers/specs/2026-08-30-acoes-em-massa-grupos-design.md docs/superpowers/plans/2026-08-31-acoes-em-massa-grupos-pr2.md
git diff --cached --stat
git commit -m "docs(grupos): decisoes e plano do PR 2 das acoes em massa"
git push -u origin feat/grupos-acoes-em-massa-pr2
```

- [ ] **Step 4: Abrir o PR**

```bash
gh pr create --base main --title "feat(grupos): acoes em massa - interface e acoes imediatas (PR 2/3)" --body-file -
```

Corpo do PR: o que entrou (rotas, regras puras, componente, selo), o que ficou de fora (PR 3: `group_hours`, grade semanal, materialização agendada), e o teste manual — aplicar descrição numa campanha de dev e ver o contador andar, lembrando que o worker está em dry-run (`WORKER_BULK_ENABLED != true`), então nada chega ao WhatsApp até alguém virar a chave e dar Redeploy no Coolify.

- [ ] **Step 5: Mover o card do quadro**

Em **prod** (`nidoatbxaylrkcgbszns`), depois do merge:

```sql
select public.move_card(
  'grupos-acoes-em-massa',
  'no_ar_nao_verificado',
  'PR 2 mergeado: interface de foto/descricao/abrir/fechar e progresso do lote.',
  'PR #<numero>'
);
```

`no_ar_nao_verificado` e não `no_ar_verificado`: mergeado não é verificado, e o worker segue em dry-run — não há como ter visto funcionar de ponta a ponta.

---

## Auto-revisão do plano

**Cobertura do spec (seção "Interface" do design):**

| Item do spec | Task |
|---|---|
| Upload da foto + textarea + "Aplicar nos N grupos" | 7 |
| Descrição vazia exige confirmação explícita | 2 (servidor) + 7 (tela) |
| "Abrir agora" / "Fechar agora" | 4 (rota) + 7 (tela) |
| Progresso "Aplicando foto — 47 de 91", por polling | 3 + 5 + 7 |
| Selo aberto/fechado/sem informação por `GroupCard` | 6 |
| Herança: gravar `desc`/`mediaId` no `grow_template` | 2 + 4 |
| Rotas `identidade`, `estado`, `lotes` | 4 e 5 |

Fora de escopo por desenho (PR 3): `group_hours`, grade de dias da semana, `materializeScheduled` na rota `pending`, e o job `open`/`close` que o auto-grow enfileira ao criar grupo.

**Consistência de nomes** conferida entre tasks: `selectBulkTargets` / `BulkTargetSelection` / `skippedNoAdmin` / `skippedNoId` (Task 1) são os mesmos usados nas Tasks 4 e 7; `planIdentityJobs`, `mergeGrowIdentity` (Task 2) idem; `countBatch` ganha `actions` na Task 3 e é isso que a Task 7 lê em `progresso.actions`; `resolveBulkCampaign` (Task 4) é reusado pela Task 5; `sendState` (Task 6) é o nome no front, `send_state` na store; `AcoesEmMassa` com as props `slug`/`administrados`/`totais`/`onLoteConcluido` (Task 7) casa com a montagem no mesmo passo e com os `data-testid` cobrados na Task 8.
