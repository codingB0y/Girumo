# Postar por grupo — PR 7 (worker renomeia) e PR 8 (Padronizar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O lojista abre "Padronizar nomes e sequência" numa campanha, escolhe o nome base, ajusta a ordem com setas e aplica: a ordem do link (`campaign_groups.group_ids`) muda na hora, cada grupo que precisa ganha o nome `<base> <n>` aos poucos pela fila anti-ban das ações em massa, o painel passa a mostrar o nome novo quando o WhatsApp confirma, e o auto-grow cria o próximo grupo como `<base> <N+1>`.

**Architecture:** Dois PRs. O **PR 7** ensina a fila de ações em massa a renomear: `setSubject` no cliente Evolution do worker, `case "set_subject"` no `applyJob` (com `default` que falha ação desconhecida e bloqueio no dry-run), `subject` no job do app (`buildSubjectJobs`, claim) e o `ackBulk` de `done` gravando `groups.name` e limpando o nome interno. O **PR 8** põe o Padronizar em cima: regras puras em `lib/groups/padronizar.ts` (a tela e a rota usam as mesmas), `POST /api/campanhas/[slug]/grupos/padronizar` (valida, reordena via `reordenar_campanha`, enfileira um lote `set_subject`, grava `grow_template.subjectPattern`/`padronizadoEm`), `nextSeq` contando só a fila depois de `padronizadoEm`, `PATCH /api/campanhas` passando a **mesclar** o `growTemplate` (hoje substitui e apagaria `padronizadoEm`), um hook de progresso extraído de `acoes-em-massa.tsx` e a tela do mockup.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, Tailwind v4 com os tokens G2 (`text-13`, `text-28`, `pn-card`, `bg-acid-500` só no chip Lotado), lucide-react, `@supabase/supabase-js` 2.108 (PostgREST falso nos testes de store e de rota), `node --test` via tsx, Playwright, worker Node 22 (ESM/NodeNext) com Evolution API 2.3.7.

**Spec:** `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` (§2 D9, §6.7, §7, §8, §9, §11 item 4) · **contratos vinculantes:** `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md` (§1 coluna `subject` + `set_subject`, §3 `EstadoGrupo`/`listCampaignGroupStates`, §4 rotas `estados`/`conflitos`/`padronizar`, §5 `planejarRenomes`/`validarBase`/`ordemPadrao`/`nextSeq`/`padronizadoEm`) · mockup: `Padronizar.dc.html` (tela 3) e `Main.dc.html` (botão na campanha) do artifact https://claude.ai/artifact/VvMiGdwbaNCP9pHJQZzmwc.

## Global Constraints

Valem para os dois PRs:

- Código, identificadores e commits em inglês, **exceto** o vocabulário já em pt-BR do domínio (`padronizar`, `ordemPadrao`, `planejarRenomes`, `validarBase`, `padronizadoEm` — nomes do contrato). Texto de tela e de erro em pt-BR. Commits com prefixo semântico e terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (here-string `@'…'@` com o `'@` na coluna 0).
- Terminal é PowerShell 5.1: sem `&&`/`||`, encadear com `;` e `if ($LASTEXITCODE -eq 0) { … }`. Sempre `git -C <wt>` com caminho absoluto (`<wt>` = raiz do worktree da sessão, impressa no Step 1 da Task 0 de cada PR; substituir literalmente em todo comando). Nunca `git add -A`: só os arquivos da task, e `git -C <wt> diff --cached --stat` numa chamada **separada** antes de cada commit (índice sujo por agente externo já quase reverteu feature).
- Comandos de teste:
  - `apps/web` (em `<wt>\apps\web`): `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. **Arquivo dentro de `[slug]`:** o `node --test` do Node 24 lê o argumento como glob, e `[slug]` vira classe de caractere — trocar o segmento por `*` (ex.: `"src/app/api/campanhas/*/grupos/padronizar/route.test.ts"`).
  - `apps/worker` (em `<wt>\apps\worker`): `npx tsx --test <arquivo>`.
  - Tipos (lint e tsx **não** checam tipo): web `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; worker `npm --workspace apps/worker run build` (é `tsc`; `dist/` é ignorado pelo git). **O CI não compila o worker** (`verify.yml` não tem passo dele): erro de tipo ali só apareceria no build Docker do Coolify, com o worker de produção parado.
  - Os `*.test.ts` do worker ficam fora do `tsc` (`tsconfig.json: exclude`): dep que faltar no fake vira `deps.X is not a function`, não erro de compilação. Ao acrescentar método em `BulkDeps`, acrescentar à mão nos fakes.
- Antes do push: `infra/scripts/verify-local.ps1` (secrets + testes + tsc + build) — é o gate real; sem `2>&1`/`*>` (no PS 5.1 aviso de stderr vira falha falsa).
- Stores: todo acesso a tabela com `tenant_id` filtra `.eq("tenant_id", …)` — o service-role passa por cima do RLS, o filtro é a proteção.
- Nenhum DDL nestes PRs (a coluna `subject` e o CHECK de `set_subject` são do PR 1; `reordenar_campanha`/`grupos_em_mais_de_uma_campanha` são do PR 6). Leitura de schema em **dev** pelo CLI passa; em **prod** quem roda é o Igor.
- Card do quadro: `postar-por-grupo` (criado no PR 1). Mover ao começar e ao terminar cada PR (`public.move_card`, DML em prod pelo Igor). `move_card` não limpa `blocker` — atualizar à parte.
- Regra de PR do CLAUDE.md: base `main`, fechar o loop na mesma sessão (revisar → CI verde → mergear → apagar branch). Merge sempre à mão no verde (a `main` não tem proteção; auto-merge do GitHub mergearia na hora). Ao encerrar: "PRs que deixei abertos: …".
- **Ordem de deploy (não-negociável):** depois do merge do PR 7, o Igor faz **Redeploy do worker** no Coolify **antes** de o PR 8 ser mergeado. O worker de hoje não tem `case "set_subject"` nem `default`: um job de renome viraria `done` sem renomear nada, e o `ackBulk` gravaria em `groups.name` um nome que o WhatsApp nunca recebeu.

## Review Focus

Os cinco modos de falha mais prováveis que nenhum teste "do caminho feliz" pega — cada um ganhou um teste na task dona:

1. **Worker que não sabe renomear diz que renomeou.** O `switch` de `applyJob` não tem `default`: ação desconhecida devolve `undefined` e o ack sai `done`. Mesmo efeito se o dry-run (`WORKER_BULK_ENABLED != true`) não bloquear `setSubject` — aí ele renomearia de verdade em dry-run. → PR 7 **Task 3**: "ação desconhecida falha o job em vez de virar done" e "dry-run não renomeia grupo"; PR 8 **Task 0 Step 4** (gate: worker redeployado).
2. **`padronizadoEm` some do `grow_template`** e o próximo grupo nasce "Moda Kids do Sul 27" depois de uma sequência 1–20. Três portas: `parseGrowTemplate` não lê o campo; `PATCH /api/campanhas` **substitui** o `grow_template` inteiro (o `campaign-config.tsx` manda só `{ subjectPattern }` a cada salvar); a herança de identidade (`mergeGrowIdentity`) descartar chave. → PR 8 **Task 2** (`group-grow-store.test.ts`: `evaluateAutoGrow` manda `created_at=gt.…` ao `nextSeq`; data inválida não vira filtro), **Task 3** (`campanhas/route.test.ts`: PATCH mescla; `bulk-batch.test.ts`: identidade preserva `padronizadoEm`).
3. **Auto-grow nascendo durante o Padronizar.** Um job de criação na fila já carrega o `subject` resolvido com o molde antigo; se o grupo nascer depois da reordenação, entra no fim do pool com o nome velho. E um grupo anexado entre a leitura da tela e o clique muda o conjunto. → PR 8 **Task 4**: 409 com job de criação em voo **sem** chamar `reordenar_campanha`; 409 quando `reordenar_campanha` devolve `false`, sem enfileirar renome nem gravar molde.
4. **Nome base que corta, quebra ou duplica o número.** Espaço sobrando, quebra de linha colada do celular, emoji (2 unidades UTF-16), base com `{n}` (o `resolveSubject` só troca o primeiro e o grupo nasceria "Promo 21 {n}"), base que estoura 100 no WhatsApp. → PR 8 **Task 1**: testes de `validarBase` (trim, controle, `{n}`, 90/91, 45/46 emoji).
5. **Nome do painel mentindo depois de um renome.** Ack `failed` gravando nome; ack `done` sem `subject` apagando o nome; `done` sem limpar `display_name_base`/`display_number` (o painel continuaria mostrando o apelido interno — `group-display-name.ts`); escrita sem filtro de tenant; grupo que já está certo virando job (gasta janela anti-ban e mostra "Você mudou o nome do grupo" à toa); grupo renomeado à mão no WhatsApp depois do Padronizar. → PR 7 **Task 5** (store: só `done` com nome grava, com tenant e limpando o nome interno); PR 8 **Task 1** ("já está certo" não vira job; renomeado à mão volta para o nome da sequência).

---

## PR 7 — Worker renomeia grupo (`set_subject`)

Branch `feat/postar-grupo-set-subject`. Depende do **PR 1** mergeado e aplicado nos dois bancos. 11 arquivos (6 de código, 5 de teste). Sem mudança visível: nada no app produz `set_subject` até o PR 8.

### File Structure

| Arquivo | Ação | Responsabilidade | Task |
|---|---|---|---|
| `apps/worker/src/evolution-groups.ts` | modificar | `setSubject` no cliente e no contrato documentado | 2 |
| `apps/worker/src/evolution-groups.test.ts` | modificar | URL, corpo e erro do rename | 2 |
| `apps/worker/src/bulk-loop.ts` | modificar | `set_subject` no tipo, no claim, nas deps e no `applyJob`; `default` que falha | 3 |
| `apps/worker/src/bulk-loop.test.ts` | modificar | rename, rename sem nome, ação desconhecida | 3 |
| `apps/worker/src/bulk-deps.ts` | modificar | liga `setSubject` ao cliente Evolution | 3 |
| `apps/worker/src/bulk-dry-run.ts` | modificar | dry-run recusa renomear | 3 |
| `apps/worker/src/bulk-dry-run.test.ts` | modificar | dry-run não renomeia | 3 |
| `apps/web/src/lib/groups/bulk-batch.ts` | modificar | `BulkAction` + `subject` + `buildSubjectJobs` | 4 |
| `apps/web/src/lib/groups/bulk-batch.test.ts` | modificar | lote de renomes | 4 |
| `apps/web/src/lib/stores/group-bulk-jobs.ts` | modificar | `subject` no row/claim; `ackBulk` grava `groups.name` | 5 |
| `apps/web/src/lib/stores/group-bulk-jobs.test.ts` | criar | claim e ack contra PostgREST falso | 5 |

`bulk-deps.ts` não tem "mapeamento do claim" (o worker repassa o JSON do app tal como vem — `app.post<BulkJobClaim[]>`); quem monta o claim é `claimBulk` no app (Task 5). `/api/groups/bulk/pending` e `/ack` não mudam: já estão na allowlist `ENGINE_ONLY` e o `claim_bulk_jobs` devolve `setof group_bulk_jobs` (`returning j.*`), então a coluna `subject` sai sozinha — o mesmo caminho que levou `target_phone` em 17/09.

---

### Task 0: worktree, branch, pré-requisitos e card

**Files:** nenhum.

- [ ] **Step 1:** na sessão (que já roda num worktree — não criar outro):

```powershell
git rev-parse --show-toplevel
```

  Anotar a saída como `<wt>`.

- [ ] **Step 2:** atualizar e conferir que o PR 1 está em `main`:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> ls-tree --name-only origin/main apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql
```

  Esperado: o caminho impresso. Vazio → **parar e perguntar ao Igor** (PR 1 não mergeou).

- [ ] **Step 3:** branch a partir de `origin/main`, sem upstream herdado, defasagem zero:

```powershell
git -C <wt> switch -c feat/postar-grupo-set-subject origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Esperado: vazio.

- [ ] **Step 4:** PR 1 aplicado no banco de **dev** (leitura pelo CLI). Gravar o SQL num arquivo temporário sem BOM e rodar:

```powershell
$sql = "select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'group_bulk_jobs' and column_name = 'subject') as tem_subject, (select pg_get_constraintdef(oid) from pg_constraint where conname = 'group_bulk_jobs_action_check') as check_action, pg_get_function_result('public.claim_bulk_jobs(uuid,integer)'::regprocedure) as claim_devolve;"; [IO.File]::WriteAllText("$env:TEMP\pr7-prereq.sql", $sql)
```
```powershell
Set-Location <wt>\apps\web; npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes; if ($LASTEXITCODE -eq 0) { npx supabase db query --linked -o json -f "$env:TEMP\pr7-prereq.sql" }
```

  Esperado em `rows`: `tem_subject = 1`, `check_action` contendo `'set_subject'`, `claim_devolve = "SETOF group_bulk_jobs"`. Diferente → parar e perguntar ao Igor.

  **Prod (Igor):** o mesmo arquivo com `--project-ref nidoatbxaylrkcgbszns`. Mesmo resultado esperado. Sem a coluna em prod, o app novo (Task 5) lê `row.subject` como `undefined` e não quebra, mas o PR 8 não pode subir.

- [ ] **Step 5:** colisão com outra sessão:

```powershell
gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title
```

  Nenhum PR aberto mexendo em `apps/worker/src/bulk-*.ts`, `evolution-groups.ts`, `lib/groups/bulk-batch.ts` ou `lib/stores/group-bulk-jobs.ts` (`gh pr diff <N> --repo codingB0y/Girumo --name-only` nos suspeitos). Havendo, combinar com o Igor antes de seguir.

- [ ] **Step 6:** dependências do worktree (o `npm test` da raiz roda web, worker e engine):

```powershell
Test-Path "<wt>\node_modules\tsx"; Test-Path "<wt>\apps\web\node_modules\next"
```

  Algum `False` → `Set-Location <wt>; npm ci --no-audit --no-fund` (~1 min).

- [ ] **Step 7 (Igor, prod):** card ao começar.

```sql
select public.move_card('postar-por-grupo', 'em_construcao', 'PR 7 começou: worker renomeia grupo pela fila de ações em massa (set_subject)', 'feat/postar-grupo-set-subject');
```

  Erro "card não existe" → o PR 1 não criou o card: perguntar ao Igor a `key` certa (`select key, status from public.board_features where key ilike '%postar%'`), não inventar `INSERT`.

---

### Task 1: conferir o contrato `updateGroupSubject` no fonte da Evolution

**Files:** nenhum (leitura).
**Depends-on:** Task 0

A Evolution de produção é a 2.3.7 e não expõe Swagger; o contrato sai do código da tag (memória `finding-contrato-evolution-lido-na-fonte`). **A tag é `2.3.7`, sem `v`.** Rodar pela ferramenta **Bash** (o `base64 -d` é do Git Bash):

- [ ] **Step 1:** rota, schema, DTO, service e validação de `groupJid`:

```bash
gh api "repos/EvolutionAPI/evolution-api/contents/src/api/routes/group.router.ts?ref=2.3.7" --jq '.content' | base64 -d | grep -n -A9 "updateGroupSubject'"
gh api "repos/EvolutionAPI/evolution-api/contents/src/validate/group.schema.ts?ref=2.3.7" --jq '.content' | base64 -d | grep -n -A10 "updateGroupSubjectSchema"
gh api "repos/EvolutionAPI/evolution-api/contents/src/api/dto/group.dto.ts?ref=2.3.7" --jq '.content' | base64 -d | grep -n -A3 "class GroupSubjectDto"
gh api "repos/EvolutionAPI/evolution-api/contents/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts?ref=2.3.7" --jq '.content' | base64 -d | grep -n -A8 "public async updateGroupSubject"
gh api "repos/EvolutionAPI/evolution-api/contents/src/api/abstract/abstract.router.ts?ref=2.3.7" --jq '.content' | base64 -d | grep -n -A22 "public async groupValidate"
```

  Esperado (lido pelo autor deste plano em 10/10/2026):
  - router: `.post(this.routerPath('updateGroupSubject'), …)` com `groupValidate<GroupSubjectDto>`, `schema: updateGroupSubjectSchema`, resposta `HttpStatus.CREATED` (201).
  - schema: `properties: { groupJid: { type: 'string' }, subject: { type: 'string' } }`, `required: ['groupJid', 'subject']`, `...isNotEmpty('groupJid', 'subject')`.
  - DTO: `class GroupSubjectDto { groupJid: string; subject: string; }`.
  - service: `await this.client.groupUpdateSubject(data.groupJid, data.subject); return { update: 'success' };`.
  - `groupValidate`: lê `body.groupJid`, cai para `request.query.groupJid`, completa `@g.us` e faz `Object.assign(body, { groupJid })` **antes** de validar — por isso `groupJid` pode ir só na query, como em `setDescription`.

- [ ] **Step 2:** decidir. Igual ao esperado → seguir para a Task 2 com `POST /group/updateGroupSubject/{instance}?groupJid=…` e corpo `{ subject }`. **Diferente** (nome de campo, rota, método) → ajustar o `setSubject` e o teste da Task 2 ao que foi lido, e escrever a diferença no corpo do PR (seção "Contrato Evolution"). Nada de chamar a instância real para "testar": renomear é visível para os membros do grupo.

---

### Task 2: `setSubject` no cliente de grupos da Evolution (TDD)

**Files:** modificar `apps/worker/src/evolution-groups.ts`, `apps/worker/src/evolution-groups.test.ts`
**Depends-on:** Task 1
**Interfaces (produz, contrato §5):**
```ts
interface EvolutionGroups {
  setSubject(instanceName: string, groupJid: string, subject: string): Promise<void>;
}
```

- [ ] **Step 1 (teste):** acrescentar ao **fim** de `apps/worker/src/evolution-groups.test.ts`:

```ts
test("renomear manda o nome no corpo e o groupJid na query", async () => {
  // Contrato lido na tag 2.3.7: groupValidate copia o groupJid da query para o
  // corpo antes de validar, e updateGroupSubjectSchema exige `subject` não vazio.
  // A Evolution responde 201 { update: "success" } — e 201 é sucesso.
  const { groups, calls } = makeGroups(
    () => new Response(JSON.stringify({ update: "success" }), { status: 201 }),
  );

  await groups.setSubject("girumo-1", "120363000000000001@g.us", "Moda Kids do Sul 3");

  assert.equal(
    calls[0]?.url,
    "https://evo.example/group/updateGroupSubject/girumo-1?groupJid=120363000000000001%40g.us",
  );
  assert.equal(calls[0]?.init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { subject: "Moda Kids do Sul 3" });
});

test("renomear com erro da Evolution preserva o status e nomeia a operação", async () => {
  // 403 = perdemos o admin daquele grupo (permanente); sem o status o lote não
  // separaria isso de uma queda de rede.
  const { groups } = makeGroups(() => new Response("not-authorized", { status: 403 }));

  await assert.rejects(
    () => groups.setSubject("girumo-1", "120363000000000001@g.us", "Moda Kids do Sul 3"),
    (err: unknown) =>
      err instanceof EvolutionGroupError && err.status === 403 && /updateGroupSubject/.test(err.message),
  );
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/evolution-groups.test.ts
```

  Esperado: FAIL nos dois testes novos (`groups.setSubject is not a function`); os outros passam.

- [ ] **Step 3:** no cabeçalho de `evolution-groups.ts`, documentar o contrato:

  Antes:
```ts
 *   POST /group/updateGroupPicture/{instance}       required: groupJid, image
```
  Depois:
```ts
 *   POST /group/updateGroupPicture/{instance}       required: groupJid, image
 *   POST /group/updateGroupSubject/{instance}       required: groupJid, subject (isNotEmpty)
 *        responde 201 { update: "success" }; os membros veem "Você mudou o nome do grupo"
```

- [ ] **Step 4:** na interface:

  Antes:
```ts
  setDescription(instanceName: string, groupJid: string, description: string): Promise<void>;
  /** Fecha o grupo: só admin envia mensagem. */
```
  Depois:
```ts
  setDescription(instanceName: string, groupJid: string, description: string): Promise<void>;
  /**
   * Troca o nome do grupo. É operação VISÍVEL ("Você mudou o nome do grupo" para
   * todos os membros), por isso só sai pela fila de ações em massa, com o ritmo
   * anti-ban — nunca em rajada.
   */
  setSubject(instanceName: string, groupJid: string, subject: string): Promise<void>;
  /** Fecha o grupo: só admin envia mensagem. */
```

- [ ] **Step 5:** na implementação:

  Antes:
```ts
    async setDescription(instanceName, groupJid, description) {
      await request("group/updateGroupDescription", withJid("/group/updateGroupDescription", instanceName, groupJid), {
        method: "POST",
        body: JSON.stringify({ description }),
      });
    },
```
  Depois:
```ts
    async setDescription(instanceName, groupJid, description) {
      await request("group/updateGroupDescription", withJid("/group/updateGroupDescription", instanceName, groupJid), {
        method: "POST",
        body: JSON.stringify({ description }),
      });
    },

    async setSubject(instanceName, groupJid, subject) {
      await request("group/updateGroupSubject", withJid("/group/updateGroupSubject", instanceName, groupJid), {
        method: "POST",
        body: JSON.stringify({ subject }),
      });
    },
```

- [ ] **Step 6:** rodar de novo:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/evolution-groups.test.ts
```

  Esperado: todos PASS.

- [ ] **Step 7:** commit.

```powershell
git -C <wt> add apps/worker/src/evolution-groups.ts apps/worker/src/evolution-groups.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 2 arquivos.

```powershell
git -C <wt> commit -m @'
feat(worker): add setSubject to the Evolution groups client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: `set_subject` no loop de ações em massa, `default` e dry-run (TDD)

**Files:** modificar `apps/worker/src/bulk-loop.ts`, `apps/worker/src/bulk-loop.test.ts`, `apps/worker/src/bulk-deps.ts`, `apps/worker/src/bulk-dry-run.ts`, `apps/worker/src/bulk-dry-run.test.ts`
**Depends-on:** Task 2
**Interfaces (produz):**
```ts
export type BulkAction = /* as de hoje */ | "set_subject";
export type BulkJobClaim = { /* … */ subject?: string };
export type BulkDeps = { /* … */ setSubject(instanceName: string, groupJid: string, subject: string): Promise<void> };
```

- [ ] **Step 1 (teste, fake):** em `apps/worker/src/bulk-loop.test.ts`, gravar o rename no fake.

  Antes:
```ts
  removidos: Array<{ jid: string; phone: string }>;
};
```
  Depois:
```ts
  removidos: Array<{ jid: string; phone: string }>;
  renomeados: Array<{ jid: string; subject: string }>;
};
```

  Antes:
```ts
    removidos: [],
  };
```
  Depois:
```ts
    removidos: [],
    renomeados: [],
  };
```

  Antes:
```ts
    removeParticipant: async (_i, jid, phone) => {
      rec.removidos.push({ jid, phone });
    },
    ...over,
```
  Depois:
```ts
    removeParticipant: async (_i, jid, phone) => {
      rec.removidos.push({ jid, phone });
    },
    setSubject: async (_i, jid, subject) => {
      rec.renomeados.push({ jid, subject });
    },
    ...over,
```

- [ ] **Step 2 (teste):** acrescentar ao **fim** de `bulk-loop.test.ts`:

```ts
test("set_subject renomeia com o nome exato do job", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ id: "nome-1", action: "set_subject", subject: "Moda Kids do Sul 3" })],
  });

  const summary = await runBulkTick(deps);
  await drainInFlight();

  assert.deepEqual(rec.renomeados, [{ jid: "111@g.us", subject: "Moda Kids do Sul 3" }]);
  // Rename não produz dado: o ack não leva a chave `invite`.
  assert.deepEqual(rec.acks, [{ jobId: "nome-1", ack: { status: "done" } }]);
  assert.equal(summary.done, 1);
});

test("set_subject sem nome falha o job SEM chamar a Evolution", async () => {
  // A Evolution recusaria com 400 (isNotEmpty) — mas só depois de gastar uma
  // janela do ritmo anti-ban para descobrir.
  for (const subject of [undefined, "", "   "]) {
    const { deps, rec } = makeDeps({
      claimJobs: async () => [job({ id: "nome-2", action: "set_subject", subject })],
    });

    const summary = await runBulkTick(deps);
    await drainInFlight();

    assert.equal(rec.renomeados.length, 0, `não pode chamar updateGroupSubject com ${JSON.stringify(subject)}`);
    assert.equal(summary.failed, 1);
    assert.match(String(rec.acks[0]?.ack.error), /sem nome/i);
  }
});

test("acao desconhecida falha o job em vez de virar done", async () => {
  // App mais novo que o worker: sem o `default`, o switch devolvia undefined, o
  // ack saía `done` e o app gravava um resultado que nunca aconteceu no WhatsApp.
  const { deps, rec } = makeDeps({
    claimJobs: async () => [
      job({ id: "x-1", action: "rename_everything" as unknown as BulkJobClaim["action"] }),
    ],
  });

  const summary = await runBulkTick(deps);
  await drainInFlight();

  assert.equal(summary.done, 0);
  assert.equal(summary.failed, 1);
  assert.equal(rec.acks[0]?.ack.status, "failed");
  assert.match(String(rec.acks[0]?.ack.error), /desconhecida/i);
});
```

- [ ] **Step 3 (teste, dry-run):** em `apps/worker/src/bulk-dry-run.test.ts`:

  Antes:
```ts
import { runBulkTick, type BulkAck, type BulkDeps, type BulkJobClaim } from "./bulk-loop.js";
```
  Depois:
```ts
import { drainInFlight, runBulkTick, type BulkAck, type BulkDeps, type BulkJobClaim } from "./bulk-loop.js";
```

  Antes:
```ts
    setPicture: async () => {},
    signedMediaUrl: async () => "https://signed.local/f.jpg",
```
  Depois:
```ts
    setPicture: async () => {},
    setSubject: async () => {},
    signedMediaUrl: async () => "https://signed.local/f.jpg",
```

  E acrescentar ao **fim** do arquivo:

```ts
test("dry-run nao renomeia grupo e falha o job com o motivo", async () => {
  // Renomear é a ação mais visível da fila ("Você mudou o nome do grupo" para
  // todos os membros). Em dry-run ela não pode escapar para a Evolution.
  const chamou: string[] = [];
  const acks: BulkAck[] = [];
  const deps = withBulkDryRun(
    baseDeps({
      claimJobs: async () => [
        { id: "j1", action: "set_subject", whatsappGroupId: "111@g.us", subject: "Moda Kids do Sul 1" },
      ],
      setSubject: async () => {
        chamou.push("nome");
      },
      ack: async (_t, _j, ack) => {
        acks.push(ack);
      },
    }),
  );

  await runBulkTick(deps);
  await drainInFlight();

  assert.deepEqual(chamou, [], "nada pode tocar a Evolution em dry-run");
  assert.equal(acks[0]?.status, "failed");
  assert.equal(acks[0]?.error, BULK_DRY_RUN_REASON);
});
```

- [ ] **Step 4:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/bulk-loop.test.ts src/bulk-dry-run.test.ts
```

  Esperado: FAIL nos quatro testes novos — sem o `case`, o `switch` devolve `undefined` e todo ack sai `done`: "set_subject renomeia…" (nada em `renomeados`), "set_subject sem nome…" (`summary.failed` = 0), "acao desconhecida…" (`summary.done` = 1) e "dry-run nao renomeia…" (`acks[0].status` = `done`). Os antigos passam.

- [ ] **Step 5:** `apps/worker/src/bulk-loop.ts` — tipo da ação:

  Antes:
```ts
  | "check_invite"
  | "remove_participant";
```
  Depois:
```ts
  | "check_invite"
  | "remove_participant"
  | "set_subject";
```

- [ ] **Step 6:** claim:

  Antes:
```ts
  /** Telefone (dígitos, com DDI) a remover. Só existe em `remove_participant`. */
  targetPhone?: string;
};
```
  Depois:
```ts
  /** Telefone (dígitos, com DDI) a remover. Só existe em `remove_participant`. */
  targetPhone?: string;
  /** Nome novo do grupo. Só existe em `set_subject`. */
  subject?: string;
};
```

- [ ] **Step 7:** deps:

  Antes:
```ts
  removeParticipant(instanceName: string, groupJid: string, participantPhone: string): Promise<void>;
};
```
  Depois:
```ts
  removeParticipant(instanceName: string, groupJid: string, participantPhone: string): Promise<void>;
  /** Troca o nome do grupo (Padronizar). */
  setSubject(instanceName: string, groupJid: string, subject: string): Promise<void>;
};
```

- [ ] **Step 8:** `applyJob`:

  Antes:
```ts
    case "remove_participant": {
      // Mesmo padrão de `set_description`: checagem de TIPO, não de verdade —
      // um job sem telefone é malformado e não pode virar remoção de ninguém.
      if (!job.targetPhone) throw new Error("Job de remoção sem telefone.");
      await deps.removeParticipant(instanceName, job.whatsappGroupId, job.targetPhone);
      return undefined;
    }
  }
}
```
  Depois:
```ts
    case "remove_participant": {
      // Mesmo padrão de `set_description`: checagem de TIPO, não de verdade —
      // um job sem telefone é malformado e não pode virar remoção de ninguém.
      if (!job.targetPhone) throw new Error("Job de remoção sem telefone.");
      await deps.removeParticipant(instanceName, job.whatsappGroupId, job.targetPhone);
      return undefined;
    }

    case "set_subject": {
      // Nome vazio seria 400 na Evolution (`isNotEmpty`) depois de gastar uma
      // janela do ritmo anti-ban. Falha aqui, sem chamar ninguém.
      const subject = job.subject ?? "";
      if (!subject.trim()) throw new Error("Job de renomear sem nome.");
      await deps.setSubject(instanceName, job.whatsappGroupId, subject);
      return undefined;
    }

    default: {
      // App mais novo que o worker manda ação que este não conhece. Sem isto o
      // switch devolvia `undefined`, o ack saía `done` e o app gravava um
      // resultado que nunca aconteceu no WhatsApp (o nome do grupo, no caso de
      // `set_subject`). Falha explícita aparece no progresso do lote.
      const desconhecida: never = job.action;
      throw new Error(`Ação desconhecida para este worker: ${String(desconhecida)}`);
    }
  }
}
```

- [ ] **Step 9:** `apps/worker/src/bulk-deps.ts`:

  Antes:
```ts
    removeParticipant: (instanceName, jid, phone) => groups.removeParticipant(instanceName, jid, phone),
```
  Depois:
```ts
    removeParticipant: (instanceName, jid, phone) => groups.removeParticipant(instanceName, jid, phone),
    setSubject: (instanceName, jid, subject) => groups.setSubject(instanceName, jid, subject),
```

- [ ] **Step 10:** `apps/worker/src/bulk-dry-run.ts`:

  Antes:
```ts
    setPicture: async (instanceName, jid) => recusar("trocaria a foto", instanceName, jid),
  };
```
  Depois:
```ts
    setPicture: async (instanceName, jid) => recusar("trocaria a foto", instanceName, jid),
    // O nome novo também não vai para o log: é conteúdo do lojista.
    setSubject: async (instanceName, jid) => recusar("renomearia o grupo", instanceName, jid),
  };
```

- [ ] **Step 11:** rodar os testes do worker e o `tsc` dele:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/bulk-loop.test.ts src/bulk-dry-run.test.ts src/evolution-groups.test.ts
```

  Esperado: todos PASS.

```powershell
Set-Location <wt>; npm --workspace apps/worker run build
```

  Esperado: exit 0, sem erro (confere o `never` do `default` e o `setSubject` em `makeBulkDeps`).

- [ ] **Step 12:** commit.

```powershell
git -C <wt> add apps/worker/src/bulk-loop.ts apps/worker/src/bulk-loop.test.ts apps/worker/src/bulk-deps.ts apps/worker/src/bulk-dry-run.ts apps/worker/src/bulk-dry-run.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 5 arquivos.

```powershell
git -C <wt> commit -m @'
feat(worker): run set_subject bulk jobs; unknown action fails the job

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: `set_subject` na montagem do lote do app (TDD)

**Files:** modificar `apps/web/src/lib/groups/bulk-batch.ts`, `apps/web/src/lib/groups/bulk-batch.test.ts`
**Depends-on:** Task 0
**Interfaces (produz):**
```ts
export type BulkAction = /* as de hoje */ | "set_subject";
export type BulkJobInsert = { /* … */ subject?: string | null };
export type SubjectJobInput = {
  tenantId: string;
  campaignGroupId: string;
  batchId: string;
  renomes: ReadonlyArray<{ groupId: string; whatsappGroupId: string; subject: string }>;
};
export function buildSubjectJobs(input: SubjectJobInput): BulkJobInsert[];
```

Decisão de API: cada grupo ganha um nome diferente, então o renome **não** passa por `buildBulkJobs` (mesma carga em todos). `buildSubjectJobs` recebe exatamente a saída de `planejarRenomes` (PR 8). `subject` fica **opcional** em `BulkJobInsert` porque há quem monte o job à mão sem conhecer a ação nova (o backfill de convite do sync, `app/api/groups/sync/route.ts:212-222`, ou onde o PR 3 o tiver movido); omitido, o PostgREST grava `null`.

- [ ] **Step 1 (teste):** em `apps/web/src/lib/groups/bulk-batch.test.ts`, import:

  Antes:
```ts
import {
  buildBulkJobs,
  mergeGrowIdentity,
```
  Depois:
```ts
import {
  buildBulkJobs,
  buildSubjectJobs,
  mergeGrowIdentity,
```

  E acrescentar ao **fim** do arquivo:

```ts
/* ---------- set_subject ---------- */

test("buildSubjectJobs faz um job por grupo, cada um com o SEU nome, no mesmo lote", () => {
  const jobs = buildSubjectJobs({
    ...BASE,
    renomes: [
      { groupId: "g1", whatsappGroupId: "111@g.us", subject: "Moda Kids do Sul 1" },
      { groupId: "g2", whatsappGroupId: "222@g.us", subject: "Moda Kids do Sul 2" },
    ],
  });

  assert.deepEqual(
    jobs.map((j) => [j.group_id, j.whatsapp_group_id, j.subject]),
    [
      ["g1", "111@g.us", "Moda Kids do Sul 1"],
      ["g2", "222@g.us", "Moda Kids do Sul 2"],
    ],
  );
  for (const job of jobs) {
    assert.equal(job.action, "set_subject");
    assert.equal(job.batch_id, "b1");
    assert.equal(job.tenant_id, "t1");
    assert.equal(job.campaign_group_id, "c1");
    assert.equal(job.description, null);
    assert.equal(job.media_id, null);
    assert.equal(job.target_phone, null);
  }
});

test("buildSubjectJobs com nome vazio lanca — o worker recusaria depois de gastar a janela", () => {
  assert.throws(
    () =>
      buildSubjectJobs({
        ...BASE,
        renomes: [{ groupId: "g1", whatsappGroupId: "111@g.us", subject: "   " }],
      }),
    /nome/i,
  );
});

test("buildBulkJobs recusa set_subject — renomear tem um nome por grupo", () => {
  assert.throws(() => buildBulkJobs({ ...BASE, action: "set_subject", groups: GRUPOS }), /buildSubjectJobs/);
});

test("as outras acoes nao carregam subject", () => {
  const [job] = buildBulkJobs({ ...BASE, action: "open", groups: [GRUPOS[0]] });
  assert.equal(job.subject, null);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/bulk-batch.test.ts
```

  Esperado: FAIL nos quatro testes novos (`buildSubjectJobs is not a function`; `set_subject` não lança; `subject` é `undefined`).

- [ ] **Step 3:** `apps/web/src/lib/groups/bulk-batch.ts` — documentação e tipo da ação:

  Antes:
```ts
 * uma vez por telefone (ver `duplicate-removal.ts`), nunca uma vez pro lote
 * inteiro.
 */
export type BulkAction =
  | "set_description"
  | "set_picture"
  | "open"
  | "close"
  | "check_invite"
  | "remove_participant";
```
  Depois:
```ts
 * uma vez por telefone (ver `duplicate-removal.ts`), nunca uma vez pro lote
 * inteiro.
 *
 * `set_subject` renomeia o grupo (Padronizar, spec 2026-10-10 §6.7). Também é
 * carga POR GRUPO — cada um ganha um número diferente —, por isso não passa por
 * `buildBulkJobs`: o lote sai de `buildSubjectJobs`.
 */
export type BulkAction =
  | "set_description"
  | "set_picture"
  | "open"
  | "close"
  | "check_invite"
  | "remove_participant"
  | "set_subject";
```

- [ ] **Step 4:** linha de insert:

  Antes:
```ts
  /** Dígitos com DDI. Só preenchido em `remove_participant`. */
  target_phone: string | null;
};

export type BuildBulkJobsInput = {
```
  Depois:
```ts
  /** Dígitos com DDI. Só preenchido em `remove_participant`. */
  target_phone: string | null;
  /**
   * Nome novo do grupo. Só preenchido em `set_subject`. Opcional no tipo porque
   * há quem monte o job à mão sem conhecer a ação (o backfill de convite do
   * sync); omitido, o banco grava `null`.
   */
  subject?: string | null;
};

export type BuildBulkJobsInput = {
```

- [ ] **Step 5:** guarda em `buildBulkJobs`:

  Antes:
```ts
  const { action } = input;

  if (action === "set_description" && typeof input.description !== "string") {
```
  Depois:
```ts
  const { action } = input;

  if (action === "set_subject") {
    throw new Error("Renomear tem um nome por grupo: use buildSubjectJobs.");
  }
  if (action === "set_description" && typeof input.description !== "string") {
```

- [ ] **Step 6:** `subject: null` nas outras ações e a função nova logo depois de `buildBulkJobs`:

  Antes:
```ts
      media_id: mediaId,
      target_phone: targetPhone,
    }));
}

/** Um grupo da store, como candidato a alvo do lote. */
```
  Depois:
```ts
      media_id: mediaId,
      target_phone: targetPhone,
      subject: null,
    }));
}

export type SubjectJobInput = {
  tenantId: string;
  campaignGroupId: string;
  batchId: string;
  /** A saída de `planejarRenomes` (lib/groups/padronizar.ts). */
  renomes: ReadonlyArray<{ groupId: string; whatsappGroupId: string; subject: string }>;
};

/**
 * Lote de renomes do Padronizar: um job por grupo, cada um com o SEU nome, sob
 * um `batch_id` só (a tela acompanha "renomeando 3 de 12" pela rota de lotes).
 *
 * Nome vazio lança: o worker recusaria do mesmo jeito, mas só depois de gastar
 * uma janela do ritmo anti-ban para descobrir.
 */
export function buildSubjectJobs(input: SubjectJobInput): BulkJobInsert[] {
  return input.renomes.map((renome): BulkJobInsert => {
    if (!renome.subject.trim()) throw new Error("Renomear exige um nome para cada grupo.");
    return {
      tenant_id: input.tenantId,
      campaign_group_id: input.campaignGroupId,
      batch_id: input.batchId,
      action: "set_subject",
      group_id: renome.groupId,
      whatsapp_group_id: renome.whatsappGroupId,
      description: null,
      media_id: null,
      target_phone: null,
      subject: renome.subject,
    };
  });
}

/** Um grupo da store, como candidato a alvo do lote. */
```

- [ ] **Step 7:** rodar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/bulk-batch.test.ts src/lib/groups/duplicate-removal.test.ts
```

  Esperado: todos PASS (`duplicate-removal` usa `buildBulkJobs` e não pode ter mudado).

- [ ] **Step 8:** commit.

```powershell
git -C <wt> add apps/web/src/lib/groups/bulk-batch.ts apps/web/src/lib/groups/bulk-batch.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 2 arquivos.

```powershell
git -C <wt> commit -m @'
feat(groups): build set_subject jobs with one name per group

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: claim leva o nome; `ackBulk` de `done` grava `groups.name` (TDD)

**Files:** modificar `apps/web/src/lib/stores/group-bulk-jobs.ts`; criar `apps/web/src/lib/stores/group-bulk-jobs.test.ts`
**Depends-on:** Task 4
**Interfaces (produz):**
```ts
export type BulkJobRow = { /* … */ subject: string | null };
export type BulkJobClaim = { /* … */ subject?: string };
// ackBulk: em `done` de `set_subject` com nome, grava groups.name = subject,
// display_name_base = '', display_number = 0 (filtro de tenant).
```

- [ ] **Step 1 (teste):** criar `apps/web/src/lib/stores/group-bulk-jobs.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { ackBulk, claimBulk } from "./group-bulk-jobs";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (desenho de
 * `leads.test.ts`): prova, sem banco, o que o renome do Padronizar escreve — e
 * onde. O service-role passa por cima do RLS, então o filtro de tenant conferido
 * aqui é a proteção de verdade.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

const JOB = {
  id: "job-1",
  tenant_id: "loja-a",
  campaign_group_id: "camp-1",
  batch_id: "lote-1",
  action: "set_subject",
  group_id: "grp-1",
  whatsapp_group_id: "111@g.us",
  description: null,
  media_id: null,
  target_phone: null,
  subject: "Moda Kids do Sul 3",
  status: "running",
  attempts: 1,
  error: null,
  created_at: "2026-10-10T12:00:00+00:00",
  running_since: "2026-10-10T12:00:04+00:00",
  last_ack_at: "2026-10-10T12:00:04+00:00",
  updated_at: "2026-10-10T12:00:04+00:00",
};

/** Ack devolve o job atualizado; o update de `groups` responde 204 (return=minimal). */
function comAck(linha: Record<string, unknown>): (chamada: Chamada) => Resposta {
  return ({ metodo, url }) => {
    if (metodo === "PATCH" && url.pathname === "/rest/v1/group_bulk_jobs") return { status: 200, corpo: [linha] };
    if (metodo === "PATCH" && url.pathname === "/rest/v1/groups") return { status: 204 };
    return { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

test("o claim entrega ao worker o nome do renome, e só no renome", async () => {
  chamadas.length = 0;
  responder = ({ metodo, url }) => {
    // failStaleRunning roda antes do claim e não acha nada preso.
    if (metodo === "PATCH" && url.pathname === "/rest/v1/group_bulk_jobs") return { status: 200, corpo: [] };
    if (metodo === "POST" && url.pathname === "/rest/v1/rpc/claim_bulk_jobs") {
      return { status: 200, corpo: [JOB, { ...JOB, id: "job-2", action: "open", subject: null }] };
    }
    return { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };

  const claim = await claimBulk("loja-a");

  assert.deepEqual(claim[0], {
    id: "job-1",
    action: "set_subject",
    whatsappGroupId: "111@g.us",
    description: undefined,
    mediaId: undefined,
    targetPhone: undefined,
    subject: "Moda Kids do Sul 3",
  });
  assert.equal(claim[1]?.subject, undefined);
  const [rpc] = feitas("POST", "/rest/v1/rpc/claim_bulk_jobs");
  assert.deepEqual(rpc?.corpo, { p_tenant: "loja-a", p_limit: 1 });
});

test("renome concluído grava o nome novo e limpa o nome interno, só no grupo da loja", async () => {
  chamadas.length = 0;
  responder = comAck({ ...JOB, status: "done" });

  const job = await ackBulk("loja-a", "job-1", { status: "done" });

  assert.equal(job?.subject, "Moda Kids do Sul 3");
  const [grupo] = feitas("PATCH", "/rest/v1/groups");
  assert.ok(grupo, "o nome do grupo não foi gravado");
  // Mutantes: sem o tenant, o service-role escreveria no grupo de outra loja com
  // o mesmo id; sem limpar o nome interno, o painel continuaria mostrando o
  // apelido antigo por cima do nome novo (group-display-name.ts).
  assert.equal(grupo.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(grupo.url.searchParams.get("id"), "eq.grp-1");
  assert.deepEqual(grupo.corpo, { name: "Moda Kids do Sul 3", display_name_base: "", display_number: 0 });
});

test("renome que falhou não mexe no nome do grupo", async () => {
  chamadas.length = 0;
  responder = comAck({ ...JOB, status: "failed", error: "Evolution group/updateGroupSubject falhou (403)" });

  // No WhatsApp o grupo continua com o nome antigo; gravar o novo aqui faria o
  // painel mentir.
  await ackBulk("loja-a", "job-1", { status: "failed", error: "Evolution group/updateGroupSubject falhou (403)" });

  assert.equal(feitas("PATCH", "/rest/v1/groups").length, 0);
});

test("renome concluído sem nome no job não apaga o nome do grupo", async () => {
  chamadas.length = 0;
  responder = comAck({ ...JOB, status: "done", subject: null });

  await ackBulk("loja-a", "job-1", { status: "done" });

  assert.equal(feitas("PATCH", "/rest/v1/groups").length, 0);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/group-bulk-jobs.test.ts
```

  Esperado: FAIL em "o claim entrega…" (`subject` ausente do claim) e em "renome concluído grava…" (nenhum PATCH em `groups`); os dois de "não mexe" passam (é o comportamento de hoje — e continuam valendo como mutante do código novo).

- [ ] **Step 3:** `apps/web/src/lib/stores/group-bulk-jobs.ts` — linha da tabela:

  Antes:
```ts
  /** Dígitos com DDI. Só preenchido em `remove_participant`. */
  target_phone: string | null;
  status: BulkJobStatus;
```
  Depois:
```ts
  /** Dígitos com DDI. Só preenchido em `remove_participant`. */
  target_phone: string | null;
  /** Nome novo do grupo. Só preenchido em `set_subject`. */
  subject: string | null;
  status: BulkJobStatus;
```

- [ ] **Step 4:** claim:

  Antes:
```ts
  mediaId?: string;
  targetPhone?: string;
};
```
  Depois:
```ts
  mediaId?: string;
  targetPhone?: string;
  subject?: string;
};
```

  Antes:
```ts
    targetPhone: row.target_phone ?? undefined,
  }));
```
  Depois:
```ts
    targetPhone: row.target_phone ?? undefined,
    subject: row.subject ?? undefined,
  }));
```

- [ ] **Step 5:** `ackBulk`:

  Antes:
```ts
  if (ack.status === "done" && (job.action === "open" || job.action === "close")) {
    await propagaParaGrupo(tenantId, job.group_id, "send_state", {
      send_state: job.action === "open" ? "open" : "closed",
      send_state_at: now,
    });
  }

  if (job.action === "check_invite") {
```
  Depois:
```ts
  if (ack.status === "done" && (job.action === "open" || job.action === "close")) {
    await propagaParaGrupo(tenantId, job.group_id, "send_state", {
      send_state: job.action === "open" ? "open" : "closed",
      send_state_at: now,
    });
  }

  // Renome concluído: o nome do WhatsApp mudou, então o do painel muda junto — e
  // o nome interno (`display_name_base`/`display_number`) é limpo, senão a tela
  // continuaria mostrando o apelido antigo por cima (`group-display-name.ts`).
  // `failed` não grava nada: no WhatsApp o grupo continua com o nome antigo.
  if (ack.status === "done" && job.action === "set_subject" && job.subject?.trim()) {
    await propagaParaGrupo(tenantId, job.group_id, "nome", {
      name: job.subject,
      display_name_base: "",
      display_number: 0,
    });
  }

  if (job.action === "check_invite") {
```

- [ ] **Step 6:** rodar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/group-bulk-jobs.test.ts src/lib/groups/bulk-batch.test.ts
```

  Esperado: todos PASS.

- [ ] **Step 7:** mutante do filtro de tenant (memória `pattern-teste-de-integracao-mata-mutante`): comentar `.eq("tenant_id", tenantId)` em `propagaParaGrupo`, rodar o Step 6 → **FAIL** em "renome concluído grava…"; reverter:

```powershell
git -C <wt> diff --stat -- apps/web/src/lib/stores/group-bulk-jobs.ts
```

  Esperado depois de reverter à mão: só as mudanças dos Steps 3–5 (conferir com `git -C <wt> diff -- apps/web/src/lib/stores/group-bulk-jobs.ts` que o `.eq("tenant_id", tenantId)` de `propagaParaGrupo` está intacto).

- [ ] **Step 8:** commit.

```powershell
git -C <wt> add apps/web/src/lib/stores/group-bulk-jobs.ts apps/web/src/lib/stores/group-bulk-jobs.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 2 arquivos.

```powershell
git -C <wt> commit -m @'
feat(groups): claim carries subject; done set_subject writes groups.name

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: verificação e revisão

**Files:** nenhum novo.
**Depends-on:** Tasks 1–5

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez:
  - `npx tsc --noEmit -p tsconfig.json` → exit 0 (confere o literal à mão de `api/groups/sync/route.ts` com o `subject` opcional)
  - `npx tsc --noEmit -p tsconfig.e2e.json` → exit 0
  - `npm run lint` → sem erro

- [ ] **Step 2:** worker:

```powershell
Set-Location <wt>; npm --workspace apps/worker run build
```
```powershell
Set-Location <wt>; npm --workspace apps/worker test
```

  Esperado: build exit 0; todos os testes do worker PASS.

- [ ] **Step 3:** o gate real:

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`.

- [ ] **Step 4:** revisão do diff inteiro (superpowers:requesting-code-review) sobre `git -C <wt> diff origin/main...HEAD`, com foco em: (1) nenhum caminho em que `set_subject` vire `done` sem `setSubject` ter resolvido (default, dry-run, sem instância); (2) `ackBulk` só escreve `groups` com filtro de tenant e só em `done` com nome; (3) o contrato da Task 1 bate com o código. CRITICAL/HIGH → corrigir e commitar antes do push.

- [ ] **Step 5:** defasagem: `git -C <wt> fetch origin main` e `git -C <wt> log HEAD..origin/main --oneline`. Commits novos → `git -C <wt> merge origin/main` (não rebase) e repetir Steps 1–3.

- [ ] **Step 6:** `git -C <wt> status --short` limpo e `git -C <wt> log origin/main..HEAD --oneline` com os 4 commits deste PR.

---

### Task 7: PR, merge, deploy do worker e quadro

**Files:** nenhum.
**Depends-on:** Task 6

- [ ] **Step 1:** push (o classificador às vezes nega push de branch nova a partir de worktree — negado uma vez, não tentar variação: entregar ao Igor):

```powershell
git -C <wt> push -u origin feat/postar-grupo-set-subject
```

- [ ] **Step 2:** PR:

```powershell
$corpo = @'
## O que entra

PR 7 de 9 do "Postar por grupo" (spec `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` §6.7). A fila de ações em massa aprende a renomear grupo:

- Worker: `setSubject` no cliente Evolution (`POST /group/updateGroupSubject/{instance}?groupJid=`, corpo `{ subject }`, contrato lido no fonte da 2.3.7), `case "set_subject"` no `applyJob` (nome vazio falha sem chamar a Evolution), dry-run recusa renomear.
- Worker: `default` no `applyJob` — ação desconhecida agora FALHA o job. Antes o ack saía `done` sem nada ter acontecido.
- App: `BulkAction` ganha `set_subject`, `buildSubjectJobs` monta um job por grupo com o nome de cada um; o claim leva `subject`; `ackBulk` de `done` grava `groups.name` e limpa o nome interno (`display_name_base`/`display_number`). `failed` não grava nada.

Nada no app produz `set_subject` ainda — quem produz é o PR 8 (Padronizar).

## Contrato Evolution

Conferido em `src/api/routes/group.router.ts`, `src/validate/group.schema.ts`, `src/api/dto/group.dto.ts` e `whatsapp.baileys.service.ts` da tag 2.3.7: `required: [groupJid, subject]` + `isNotEmpty`; `groupJid` pela query (o `groupValidate` copia para o corpo); resposta 201 `{ update: "success" }`.

## Deploy

1. Mergear (Vercel sobe o app sozinho).
2. Coolify: Redeploy do recurso do worker (`hubflow-platform:main-…`, compose do git). Sem variável nova.
3. Log de boot `worker iniciado` com `bulk: "on"` (ou `"dry-run"`, se for o caso).
4. **Só depois disso o PR 8 pode ser mergeado.**

## Teste

- [x] `npm --workspace apps/worker test` e `npm --workspace apps/worker run build`
- [x] `bulk-batch.test.ts` e `group-bulk-jobs.test.ts` (PostgREST falso; mutante do filtro de tenant derruba)
- [x] tsc x2, lint, verify-local.ps1
- [ ] CI verde
- [ ] Worker redeployado no Coolify e `worker iniciado` lido

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```
```powershell
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-set-subject --title "feat(worker): rename groups through the bulk queue (set_subject)" --body $corpo
```

- [ ] **Step 3:** CI (trocar `<N>`):

```powershell
gh pr checks <N> --repo codingB0y/Girumo
```

  E2E vermelho com 401/500 em spec que não é deste PR = corrida no banco de dev: `gh run rerun <run-id> --failed --repo codingB0y/Girumo` depois que o outro run terminar. Re-run reusa o SHA: se a `main` andou, `gh pr update-branch <N> --repo codingB0y/Girumo`.

#### Comandos para o Igor

Merge (à mão, com tudo verde):

```powershell
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

Deploy do worker: Coolify → recurso `hubflow-platform:main-…` → **Redeploy**. Conferir no log a linha `worker iniciado` com `bulk` = `"on"`. Anotar o SHA do deploy (aba Deployments): é o que a Task 0 do PR 8 confere.

Quadro (prod, depois do merge e do redeploy):

```sql
select public.move_card('postar-por-grupo', 'em_construcao', 'PR 7 mergeado e worker redeployado: fila de ações em massa renomeia grupo (set_subject); sem produtor até o PR 8', 'PR #<N>');
```

Ao encerrar: "PRs que deixei abertos: …".

---

## PR 8 — Padronizar nomes e sequência

Branch `feat/postar-grupo-padronizar`. Depende dos **PRs 2, 4, 6 e 7** mergeados, das migrações dos PRs 1 e 6 nos dois bancos e do **worker redeployado com o PR 7**.

### File Structure

| Arquivo (em `apps/web/`) | Ação | Responsabilidade | Task |
|---|---|---|---|
| `src/lib/groups/padronizar.ts` | criar | regras puras: ordem, base, renomes, molde, prévia | 1 |
| `src/lib/groups/padronizar.test.ts` | criar | testes das regras | 1 |
| `src/lib/stores/group-grow-jobs.ts` | modificar | `nextSeq(…, desde?)` | 2 |
| `src/lib/stores/group-grow-jobs.test.ts` | modificar | filtro `created_at` | 2 |
| `src/lib/group-grow-store.ts` | modificar | `padronizadoEm` no `GrowTemplate`, passado ao `nextSeq` | 2 |
| `src/lib/group-grow-store.test.ts` | modificar (criado pelo PR 2) | `evaluateAutoGrow` passa `padronizadoEm` ao `nextSeq` | 2 |
| `src/app/api/campanhas/route.ts` | modificar | PATCH mescla `growTemplate` | 3 |
| `src/app/api/campanhas/route.test.ts` | criar | PATCH preserva identidade e `padronizadoEm` | 3 |
| `src/lib/groups/bulk-batch.test.ts` | modificar | `mergeGrowIdentity` preserva o molde do Padronizar | 3 |
| `src/app/api/campanhas/[slug]/grupos/padronizar/route.ts` | criar | `POST` do Padronizar | 4 |
| `src/app/api/campanhas/[slug]/grupos/padronizar/route.test.ts` | criar | rota contra Supabase falso | 4 |
| `src/components/painel/grupos/use-progresso-do-lote.ts` | criar | polling de `GET …/grupos/lotes` (saiu de `acoes-em-massa.tsx`) | 5 |
| `src/components/painel/grupos/acoes-em-massa.tsx` | modificar | usa o hook; rótulo `set_subject` | 5 |
| `src/app/painel/campanhas/[slug]/padronizar/page.tsx` | criar | tela do mockup | 6 |
| `src/app/painel/campanhas/[slug]/page.tsx` | modificar | botão "Padronizar nomes e sequência" | 6 |
| `e2e/fixtures-dinamicas.ts` | modificar | fixture da rota dinâmica nova | 6 |
| `e2e/painel-campanha-padronizar.spec.ts` | criar | fluxo da tela | 7 |

**17 arquivos (7 de teste, 1 de apoio do E2E).** Passa da régua de ~10. Divisão sugerida, sem mudar nenhuma task:

| Bloco | Tasks | Arquivos | Branch | Depende de |
|---|---|---|---|---|
| 8A — regras e API | 1–4 | 11 | `feat/postar-grupo-padronizar-api` | PRs 2, 4, 6, 7 |
| 8B — tela | 5–7 | 6 | `feat/postar-grupo-padronizar` | 8A |

Dividindo: rodar a Task 8 e a Task 9 depois da Task 4 com o branch do 8A, e a Task 0 de novo (a partir de `origin/main` com o 8A mergeado) antes da Task 5. Sem dividir, seguir em ordem num branch só.

---

### Task 0: worktree, branch, pré-requisitos, gate do worker e card

**Files:** nenhum.

- [ ] **Step 1:** `git rev-parse --show-toplevel` → anotar como `<wt>`.

- [ ] **Step 2:** atualizar e conferir que os PRs 2, 4, 6 e 7 estão em `main`:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> ls-tree --name-only origin/main apps/web/src/lib/groups/estado.ts apps/web/src/lib/stores/campaign-group-states.ts "apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts" apps/web/src/app/api/campanhas/conflitos/route.ts
```

  Esperado: os quatro caminhos. Faltando → parar e perguntar ao Igor (PR 2, 4 ou 6 não mergeou).

```powershell
git -C <wt> grep -n "export async function reordenarCampanha\|export async function listarConflitos" origin/main -- apps/web/src/lib/stores/campaign-groups.ts
```

  Esperado: duas linhas (PR 6).

```powershell
git -C <wt> grep -n "set_subject" origin/main -- apps/worker/src/bulk-loop.ts apps/web/src/lib/groups/bulk-batch.ts apps/web/src/lib/stores/group-bulk-jobs.ts
```

  Esperado: linhas nos três (PR 7).

- [ ] **Step 3:** os nomes das RPCs que os stores chamam — o teste da Task 4 responde por caminho:

```powershell
git -C <wt> grep -n "rpc(" origin/main -- apps/web/src/lib/stores/campaign-group-states.ts apps/web/src/lib/stores/campaign-groups.ts
```

  Esperado: `campaign_group_states` com `{ p_tenant, p_campaign }`, `grupos_em_mais_de_uma_campanha` com `{ p_tenant }`, `reordenar_campanha` com `{ p_tenant, p_campanha, p_esperado, p_nova }` (contratos §1–§2). Diferente → ajustar só as chaves e os nomes de parâmetro no `banco()`/asserts da Task 4 Step 1, e anotar no PR.

  E a semântica do `reordenar_campanha` para JID repetido em `group_ids` (spec §5.2 admite duplicado):

```powershell
git -C <wt> grep -n -A40 "function public.reordenar_campanha" origin/main -- apps/web/supabase/migrations/
```

  A rota manda `p_nova` **sem repetição** e com os órfãos no fim (`completarOrdem`, Task 1). O SQL do plano do PR 6 compara conjuntos (`distinct`) e exige `p_nova` sem repetição — bate. Se o que foi mergeado exigir permutação com repetição (multiset), uma campanha com JID duplicado vai receber 409 até alguém limpar o array: **não** mudar o SQL aqui, anotar no PR e avisar o Igor.

- [ ] **Step 4 (gate, Igor):** o worker de produção roda o PR 7. No Coolify, aba Deployments do recurso do worker, o SHA do último deploy tem que conter o merge do PR 7:

```powershell
git -C <wt> merge-base --is-ancestor <sha-do-merge-do-PR7> <sha-do-deploy-do-worker>; "contem=$LASTEXITCODE"
```

  Esperado: `contem=0`. Diferente → **parar**: com o worker antigo, todo renome vira `done` sem renomear (Review Focus 1).

- [ ] **Step 5:** migrações dos PRs 1 e 6 em **dev** (leitura):

```powershell
$sql = "select to_regprocedure('public.campaign_group_states(uuid,uuid)') is not null as estados, to_regprocedure('public.grupos_em_mais_de_uma_campanha(uuid)') is not null as conflitos, to_regprocedure('public.reordenar_campanha(uuid,uuid,text[],text[])') is not null as reordenar, (select pg_get_constraintdef(oid) from pg_constraint where conname = 'group_bulk_jobs_action_check') like '%set_subject%' as acao;"; [IO.File]::WriteAllText("$env:TEMP\pr8-prereq.sql", $sql)
```
```powershell
Set-Location <wt>\apps\web; npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes; if ($LASTEXITCODE -eq 0) { npx supabase db query --linked -o json -f "$env:TEMP\pr8-prereq.sql" }
```

  Esperado: as quatro colunas `true`. **Prod (Igor):** mesmo arquivo com `nidoatbxaylrkcgbszns`, mesmo resultado.

- [ ] **Step 6:** caminhos que o PR 6/PR 4 escolheram e que a tela usa:

```powershell
git -C <wt> ls-tree -r --name-only origin/main -- apps/web/src/app/painel | Select-String -Pattern "conflito"
```

  Esperado (plano do PR 6): `apps/web/src/app/painel/campanhas/conflitos/page.tsx` → `/painel/campanhas/conflitos?de=<slug>`. Se for outro, trocar o valor de `CONFLITOS_HREF` na Task 6 Step 4.

```powershell
git -C <wt> grep -n "export function ChipDeEstado" origin/main -- apps/web/src/components/painel/grupos/estado-do-grupo.tsx
```

  Esperado: uma linha (`ChipDeEstado({ estado }: { estado: EstadoDoGrupo })`, PR 4 Task 7). A tela reusa o chip — Acid do Lotado e tracejado do vazio vêm dele. Vazio → o PR 4 mudou o nome/caminho: ajustar só o import da Task 6 Step 1.

- [ ] **Step 7:** branch:

```powershell
git -C <wt> switch -c feat/postar-grupo-padronizar origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Esperado: vazio.

- [ ] **Step 8:** colisão: `gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title` — nenhum PR aberto em `api/campanhas/route.ts`, `group-grow-store.ts`, `group-grow-jobs.ts`, `acoes-em-massa.tsx`, `painel/campanhas/[slug]/page.tsx` ou `e2e/fixtures-dinamicas.ts` (o PR 9 mexe no PATCH de `api/campanhas/route.ts`: se estiver aberto, combinar a ordem com o Igor — o conflito é textual).

- [ ] **Step 9:** dependências (`Test-Path "<wt>\node_modules\tsx"; Test-Path "<wt>\apps\web\node_modules\next"` → `npm ci --no-audit --no-fund` se algum `False`) e `.env.local` para o E2E local:

```powershell
if (-not (Test-Path -LiteralPath "<wt>\apps\web\.env.local")) { Copy-Item "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\.env.local" "<wt>\apps\web\.env.local" }
```
```powershell
Select-String -Path "<wt>\apps\web\.env.local" -Pattern '^(E2E_EMAIL|E2E_PASSWORD|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' | ForEach-Object { $_.Line.Split('=')[0] }
```

  Faltando `E2E_*`, o E2E local se marca skip e a prova da tela fica no artefato `e2e-report` do CI.

- [ ] **Step 10 (Igor, prod):**

```sql
select public.move_card('postar-por-grupo', 'em_construcao', 'PR 8 começou: Padronizar nomes e sequência', 'feat/postar-grupo-padronizar');
```

---

### Task 1: regras puras do Padronizar (TDD)

**Files:** criar `src/lib/groups/padronizar.ts`, `src/lib/groups/padronizar.test.ts`
**Depends-on:** Task 0
**Interfaces (produz; as três primeiras são do contrato §5):**
```ts
export const MAX_BASE = 90;
export type Conflito = { whatsappGroupId: string; nome: string; campanhas: Array<{ id: string; name: string; slug: string; posicao: number }> };
export type Renome = { groupId: string; whatsappGroupId: string; subject: string };
export type Decisao = "muda" | "certo" | "conflito" | "sem_admin";
export const NOTA_DA_DECISAO: Record<Decisao, string>;
export function nomeNaPosicao(base: string, indice: number): string;
export function ordemPadrao(estados: readonly EstadoGrupo[]): string[];
export function validarBase(base: unknown): { ok: true; base: string } | { ok: false; error: string };
export function planejarRenomes(input: { ordem: readonly string[]; base: string; estados: readonly EstadoGrupo[]; conflitos: ReadonlySet<string> }): Renome[];
export function ordemInicial(estados: readonly EstadoGrupo[], growTemplate: Record<string, unknown> | null | undefined): string[];
export function completarOrdem(ordem: readonly string[], esperado: readonly string[]): { ok: true; ordem: string[] } | { ok: false; error: string };
export function padronizarGrowTemplate(atual: Record<string, unknown> | null, base: string, agora: string): Record<string, unknown>;
export function baseInicial(nomeDaCampanha: string, growTemplate: Record<string, unknown> | null | undefined): string;
export function conflitosDaCampanha(conflitos: readonly Conflito[], campanhaId: string): { jids: Set<string>; nomes: string[]; outras: string[] };
export function mover(ordem: readonly string[], indice: number, delta: -1 | 1): string[];
export type LinhaDoPadrao = { jid: string; numero: number; atual: string; novo: string; decisao: Decisao; membros: number; estado: EstadoDoGrupo };
export type ResumoDoPadrao = { linhas: LinhaDoPadrao[]; mudam: number; jaCertos: number; proximo: string };
export function resumoDoPadrao(input: { ordem: readonly string[]; base: string; estados: readonly EstadoGrupo[]; conflitos: ReadonlySet<string>; tamanhoDoPool: number }): ResumoDoPadrao;
```

Escolhas registradas aqui (e testadas):
- `ordemPadrao` segue o spec §6.7, não o mockup: vazios ficam pela **posição atual** (o mockup ordenava vazios por membros). O teste fixa isso.
- `validarBase` conta em unidades UTF-16 (`.length`, emoji = 2): conservador contra o corte em 100 do WhatsApp. Recusa `{n}` na base (o `resolveSubject` do auto-grow troca só o primeiro `{n}`).
- Uma regra só decide "muda/certo/conflito/sem admin" (`decidir`): `planejarRenomes` (rota) e `resumoDoPadrao` (tela) usam a mesma, então "Mudam de nome" na tela = jobs criados.
- `completarOrdem`: a tela só conhece grupos com linha em `groups` (o estado não devolve JID órfão — spec §5.2); a rota acrescenta os órfãos no fim para `p_nova` ser permutação do conjunto atual.

- [ ] **Step 1 (teste):** criar `src/lib/groups/padronizar.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { EstadoGrupo } from "./estado";
import {
  MAX_BASE,
  NOTA_DA_DECISAO,
  baseInicial,
  completarOrdem,
  conflitosDaCampanha,
  mover,
  nomeNaPosicao,
  ordemInicial,
  ordemPadrao,
  padronizarGrowTemplate,
  planejarRenomes,
  resumoDoPadrao,
  validarBase,
  type Conflito,
} from "./padronizar";

function grupo(over: Partial<EstadoGrupo> & Pick<EstadoGrupo, "whatsappGroupId">): EstadoGrupo {
  return {
    posicao: 1,
    groupId: `id-${over.whatsappGroupId}`,
    nome: "Grupo",
    membros: 10,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/AAA",
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    estado: "fila",
    podeReabrir: false,
    naRegra: { menos_enchendo: true, lotados: false, com_gente: true },
    ...over,
  };
}

/* ---------- ordemPadrao ---------- */

test("ordemPadrao: lotados do mais cheio ao menos cheio, enchendo, fila do mais cheio, vazios na posição atual", () => {
  const estados = [
    grupo({ whatsappGroupId: "vazio-b", posicao: 1, estado: "vazio", membros: 1 }),
    grupo({ whatsappGroupId: "fila-pequena", posicao: 2, estado: "fila", membros: 9 }),
    grupo({ whatsappGroupId: "lotado-812", posicao: 3, estado: "lotado", membros: 812 }),
    grupo({ whatsappGroupId: "enchendo", posicao: 4, estado: "enchendo", membros: 958 }),
    grupo({ whatsappGroupId: "lotado-1003", posicao: 5, estado: "lotado", membros: 1003 }),
    grupo({ whatsappGroupId: "fila-grande", posicao: 6, estado: "fila", membros: 412 }),
    grupo({ whatsappGroupId: "vazio-a", posicao: 7, estado: "vazio", membros: 2 }),
  ];

  // vazio-b antes de vazio-a mesmo tendo menos membros: o spec manda os vazios
  // pela posição (o mockup ordenava por membros; o spec vence).
  assert.deepEqual(ordemPadrao(estados), [
    "lotado-1003",
    "lotado-812",
    "enchendo",
    "fila-grande",
    "fila-pequena",
    "vazio-b",
    "vazio-a",
  ]);
});

test("ordemPadrao: empate de membros fica na posição atual e a lista de entrada não muda", () => {
  const estados = [
    grupo({ whatsappGroupId: "b", posicao: 2, estado: "lotado", membros: 1000 }),
    grupo({ whatsappGroupId: "a", posicao: 1, estado: "lotado", membros: 1000 }),
  ];
  const copia = estados.map((g) => g.whatsappGroupId);

  assert.deepEqual(ordemPadrao(estados), ["a", "b"]);
  assert.deepEqual(
    estados.map((g) => g.whatsappGroupId),
    copia,
  );
});

test("ordemInicial: campanha já padronizada volta na ordem salva; nunca padronizada, na sugestão", () => {
  const estados = [
    grupo({ whatsappGroupId: "fila", posicao: 1, estado: "fila", membros: 5 }),
    grupo({ whatsappGroupId: "lotado", posicao: 2, estado: "lotado", membros: 1000 }),
  ];

  assert.deepEqual(ordemInicial(estados, { subjectPattern: "Kids {n}", padronizadoEm: "2026-10-10T12:00:00.000Z" }), [
    "fila",
    "lotado",
  ]);
  assert.deepEqual(ordemInicial(estados, { subjectPattern: "Kids {n}" }), ["lotado", "fila"]);
  assert.deepEqual(ordemInicial(estados, null), ["lotado", "fila"]);
});

/* ---------- validarBase ---------- */

test("validarBase tira o espaço das pontas", () => {
  assert.deepEqual(validarBase("  Moda Kids do Sul  "), { ok: true, base: "Moda Kids do Sul" });
});

test("validarBase recusa vazio, só espaço e o que não é texto", () => {
  for (const ruim of ["", "   ", undefined, null, 42]) {
    const r = validarBase(ruim);
    assert.equal(r.ok, false, `aceitou ${JSON.stringify(ruim)}`);
    if (!r.ok) assert.equal(r.error, "Escreva o nome base.");
  }
});

test("validarBase recusa quebra de linha e caractere de controle colados do celular", () => {
  for (const ruim of ["Moda\nKids", "Moda\r\nKids", "Moda\tKids", "Moda\u2028Kids"]) {
    const r = validarBase(ruim);
    assert.equal(r.ok, false, `aceitou ${JSON.stringify(ruim)}`);
    if (!r.ok) assert.match(r.error, /quebra de linha/);
  }
});

test("validarBase recusa {n} — o número entra sozinho e o auto-grow trocaria só o primeiro", () => {
  const r = validarBase("Promo {n}");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /\{n\}/);
});

test("validarBase aceita até 90 unidades e recusa 91", () => {
  assert.equal(validarBase("a".repeat(MAX_BASE)).ok, true);
  const r = validarBase("a".repeat(MAX_BASE + 1));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /90/);
});

test("validarBase conta emoji como 2: 45 emoji passam, 46 não", () => {
  // Conservador de propósito: seja qual for a conta do WhatsApp, "<base> 999"
  // nunca passa de 100 e o número nunca é cortado.
  assert.equal(validarBase("🔥".repeat(45)).ok, true);
  assert.equal(validarBase("🔥".repeat(46)).ok, false);
});

/* ---------- planejarRenomes ---------- */

const BASE = "Moda Kids do Sul";

test("planejarRenomes: só quem muda de nome vira job, com o número da posição", () => {
  const estados = [
    grupo({ whatsappGroupId: "g1", groupId: "grp-1", nome: "MODA KIDS SUL 1" }),
    grupo({ whatsappGroupId: "g2", groupId: "grp-2", nome: "Moda Kids do Sul 2" }),
    grupo({ whatsappGroupId: "g3", groupId: "grp-3", nome: "Grupo 19" }),
  ];

  assert.deepEqual(planejarRenomes({ ordem: ["g1", "g2", "g3"], base: BASE, estados, conflitos: new Set() }), [
    { groupId: "grp-1", whatsappGroupId: "g1", subject: "Moda Kids do Sul 1" },
    { groupId: "grp-3", whatsappGroupId: "g3", subject: "Moda Kids do Sul 3" },
  ]);
});

test("planejarRenomes: grupo em duas campanhas e grupo sem admin ficam de fora, sem tirar o número dos outros", () => {
  const estados = [
    grupo({ whatsappGroupId: "conflito", nome: "Grupo VIP Kids" }),
    grupo({ whatsappGroupId: "sem-admin", nome: "Antigo", isAdmin: false }),
    grupo({ whatsappGroupId: "g3", groupId: "grp-3", nome: "Novo grupo" }),
  ];

  assert.deepEqual(
    planejarRenomes({
      ordem: ["conflito", "sem-admin", "g3"],
      base: BASE,
      estados,
      conflitos: new Set(["conflito"]),
    }),
    [{ groupId: "grp-3", whatsappGroupId: "g3", subject: "Moda Kids do Sul 3" }],
  );
});

test("planejarRenomes: grupo renomeado à mão no WhatsApp depois do Padronizar volta para o nome da sequência", () => {
  // O nome comparado é o do WhatsApp (groups.name, atualizado pelo sync); o
  // apelido interno do painel não entra na conta.
  const estados = [grupo({ whatsappGroupId: "g1", groupId: "grp-1", nome: "Kids Promo Sábado" })];

  assert.deepEqual(planejarRenomes({ ordem: ["g1"], base: BASE, estados, conflitos: new Set() }), [
    { groupId: "grp-1", whatsappGroupId: "g1", subject: "Moda Kids do Sul 1" },
  ]);
});

test("planejarRenomes: JID sem estado (órfão no pool) não vira job mas ocupa a posição", () => {
  const estados = [grupo({ whatsappGroupId: "g2", groupId: "grp-2", nome: "x" })];

  assert.deepEqual(planejarRenomes({ ordem: ["orfao", "g2"], base: BASE, estados, conflitos: new Set() }), [
    { groupId: "grp-2", whatsappGroupId: "g2", subject: "Moda Kids do Sul 2" },
  ]);
});

/* ---------- completarOrdem ---------- */

test("completarOrdem põe os órfãos no fim, na ordem do pool, sem repetir", () => {
  const r = completarOrdem(["g2", "g1"], ["g1", "orfao-a", "g2", "orfao-b", "g1"]);
  assert.deepEqual(r, { ok: true, ordem: ["g2", "g1", "orfao-a", "orfao-b"] });
});

test("completarOrdem recusa JID de fora da campanha e JID repetido", () => {
  assert.equal(completarOrdem(["g1", "outro"], ["g1", "g2"]).ok, false);
  assert.equal(completarOrdem(["g1", "g1"], ["g1", "g2"]).ok, false);
});

test("completarOrdem recusa campanha sem grupo", () => {
  const r = completarOrdem([], []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /não tem grupos/);
});

/* ---------- grow_template ---------- */

test("padronizarGrowTemplate troca o molde, grava a data e preserva o resto", () => {
  // Sem subjectPattern o parseGrowTemplate desliga o auto-grow; sem desc/mediaId
  // o próximo grupo nasce sem a identidade aplicada.
  assert.deepEqual(
    padronizarGrowTemplate(
      { subjectPattern: "Ofertas {n}", desc: "Bazar", mediaId: "m1", announce: false },
      "Moda Kids do Sul",
      "2026-10-10T12:00:00.000Z",
    ),
    {
      subjectPattern: "Moda Kids do Sul {n}",
      desc: "Bazar",
      mediaId: "m1",
      announce: false,
      padronizadoEm: "2026-10-10T12:00:00.000Z",
    },
  );
  assert.deepEqual(padronizarGrowTemplate(null, "Kids", "2026-10-10T12:00:00.000Z"), {
    subjectPattern: "Kids {n}",
    padronizadoEm: "2026-10-10T12:00:00.000Z",
  });
});

test("baseInicial reaproveita a base do molde e cai no nome da campanha", () => {
  assert.equal(baseInicial("Moda Kids do Sul", { subjectPattern: "Kids Sul {n}" }), "Kids Sul");
  assert.equal(baseInicial("Moda Kids do Sul", { subjectPattern: "Promo #{n}" }), "Moda Kids do Sul");
  assert.equal(baseInicial("  Moda Kids do Sul ", null), "Moda Kids do Sul");
});

/* ---------- tela ---------- */

test("conflitosDaCampanha lista só os grupos desta campanha e o nome das outras", () => {
  const conflitos: Conflito[] = [
    {
      whatsappGroupId: "vip",
      nome: "Grupo VIP Kids",
      campanhas: [
        { id: "esta", name: "Moda Kids do Sul", slug: "moda-kids", posicao: 5 },
        { id: "outra", name: "Saldão Outubro", slug: "saldao", posicao: 1 },
      ],
    },
    {
      whatsappGroupId: "alheio",
      nome: "Grupo de outra dupla",
      campanhas: [
        { id: "x", name: "X", slug: "x", posicao: 1 },
        { id: "y", name: "Y", slug: "y", posicao: 1 },
      ],
    },
  ];

  const r = conflitosDaCampanha(conflitos, "esta");

  assert.deepEqual([...r.jids], ["vip"]);
  assert.deepEqual(r.nomes, ["Grupo VIP Kids"]);
  assert.deepEqual(r.outras, ["Saldão Outubro"]);
});

test("mover troca com o vizinho, não mexe na entrada e não sai das pontas", () => {
  const ordem = ["a", "b", "c"];

  assert.deepEqual(mover(ordem, 0, 1), ["b", "a", "c"]);
  assert.deepEqual(mover(ordem, 2, -1), ["a", "c", "b"]);
  assert.deepEqual(mover(ordem, 0, -1), ["a", "b", "c"]);
  assert.deepEqual(mover(ordem, 2, 1), ["a", "b", "c"]);
  assert.deepEqual(ordem, ["a", "b", "c"]);
});

test("resumoDoPadrao conta igual à rota e diz o nome do próximo grupo", () => {
  const estados = [
    grupo({ whatsappGroupId: "g1", nome: "Moda Kids do Sul 1", membros: 1000, estado: "lotado" }),
    grupo({ whatsappGroupId: "g2", nome: "Kids Sul #3", estado: "lotado" }),
    grupo({ whatsappGroupId: "vip", nome: "Grupo VIP Kids", estado: "lotado" }),
    grupo({ whatsappGroupId: "sem-admin", nome: "Antigo", isAdmin: false, estado: "fila" }),
  ];
  const ordem = ["g1", "g2", "vip", "sem-admin"];
  const conflitos = new Set(["vip"]);

  const r = resumoDoPadrao({ ordem, base: BASE, estados, conflitos, tamanhoDoPool: 5 });

  assert.equal(r.mudam, planejarRenomes({ ordem, base: BASE, estados, conflitos }).length);
  assert.equal(r.mudam, 1);
  assert.equal(r.jaCertos, 1);
  // Pool com 5 (um órfão sem linha em groups): o auto-grow numera pelo pool.
  assert.equal(r.proximo, "Moda Kids do Sul 6");
  assert.deepEqual(
    r.linhas.map((l) => [l.numero, l.novo, l.decisao]),
    [
      [1, "Moda Kids do Sul 1", "certo"],
      [2, "Moda Kids do Sul 2", "muda"],
      [3, "Grupo VIP Kids", "conflito"],
      [4, "Antigo", "sem_admin"],
    ],
  );
  assert.equal(NOTA_DA_DECISAO.conflito, "fica igual · em 2 campanhas");
});

test("nomeNaPosicao numera a partir de 1", () => {
  assert.equal(nomeNaPosicao("Kids", 0), "Kids 1");
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/padronizar.test.ts
```

  Esperado: FAIL ao importar `./padronizar` (arquivo não existe).

- [ ] **Step 3:** criar `src/lib/groups/padronizar.ts`:

```ts
/**
 * "Padronizar nomes e sequência" (spec 2026-10-10 §6.7, D9). Funções PURAS —
 * sem Supabase e sem `server-only`: a rota usa para decidir o que entra na fila,
 * e a tela usa as MESMAS para a prévia. O "Mudam de nome" que o lojista lê antes
 * de clicar é, por construção, o número de jobs que o servidor cria.
 */

import type { EstadoDoGrupo, EstadoGrupo } from "@/lib/groups/estado";

/**
 * O WhatsApp corta o nome do grupo em 100. 90 deixa espaço para " 999".
 * Conta em unidades UTF-16 (`.length`, emoji = 2): é o lado conservador — seja
 * qual for a conta do WhatsApp, o nome nunca passa de 100 nem perde o número.
 */
export const MAX_BASE = 90;

/** Linha de `GET /api/campanhas/conflitos` (contrato §4, PR 6). */
export type Conflito = {
  whatsappGroupId: string;
  nome: string;
  campanhas: Array<{ id: string; name: string; slug: string; posicao: number }>;
};

/** Um renome a enfileirar: entra direto em `buildSubjectJobs`. */
export type Renome = { groupId: string; whatsappGroupId: string; subject: string };

/** O que acontece com o grupo numa posição da sequência. */
export type Decisao = "muda" | "certo" | "conflito" | "sem_admin";

export const NOTA_DA_DECISAO: Record<Decisao, string> = {
  muda: "",
  certo: "já está certo",
  conflito: "fica igual · em 2 campanhas",
  sem_admin: "fica igual · não somos admin",
};

const ORDEM_DO_ESTADO: Record<EstadoDoGrupo, number> = { lotado: 0, enchendo: 1, fila: 2, vazio: 3 };

/** Nome do grupo na posição `indice` (base 0) da sequência. */
export function nomeNaPosicao(base: string, indice: number): string {
  return `${base} ${indice + 1}`;
}

/**
 * Sugestão de ordem (D9): lotados do mais cheio para o menos cheio; o que está
 * enchendo; fila do mais cheio para o menos cheio; vazios. Empate — e os vazios
 * entre si — ficam na posição atual.
 */
export function ordemPadrao(estados: readonly EstadoGrupo[]): string[] {
  return [...estados]
    .sort(
      (a, b) =>
        ORDEM_DO_ESTADO[a.estado] - ORDEM_DO_ESTADO[b.estado] ||
        (a.estado === "vazio" ? 0 : b.membros - a.membros) ||
        a.posicao - b.posicao,
    )
    .map((g) => g.whatsappGroupId);
}

/**
 * Ordem com que a tela abre. Campanha nunca padronizada: a sugestão. Já
 * padronizada: a ordem salva (posição do pool) — "depois a ordem fica fixa" (D9),
 * e reabrir a tela não pode embaralhar o que o lojista ajustou com as setas.
 */
export function ordemInicial(
  estados: readonly EstadoGrupo[],
  growTemplate: Record<string, unknown> | null | undefined,
): string[] {
  if (typeof growTemplate?.padronizadoEm === "string") {
    return [...estados].sort((a, b) => a.posicao - b.posicao).map((g) => g.whatsappGroupId);
  }
  return ordemPadrao(estados);
}

/** Quebra de linha, tab e afins — o que o celular cola junto sem a pessoa ver. */
function temControle(texto: string): boolean {
  for (let i = 0; i < texto.length; i += 1) {
    const code = texto.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

export function validarBase(base: unknown): { ok: true; base: string } | { ok: false; error: string } {
  const limpa = typeof base === "string" ? base.trim() : "";
  if (!limpa) return { ok: false, error: "Escreva o nome base." };
  if (temControle(limpa)) return { ok: false, error: "O nome base não pode ter quebra de linha." };
  if (limpa.includes("{n}")) {
    return { ok: false, error: "Tire o {n} do nome: o número entra sozinho no fim." };
  }
  if (limpa.length > MAX_BASE) {
    return { ok: false, error: `O nome base pode ter até ${MAX_BASE} caracteres (emoji conta como 2).` };
  }
  return { ok: true, base: limpa };
}

/**
 * A regra única. Conflito antes de admin: grupo em duas campanhas fica parado até
 * o lojista escolher onde ele mora, sejamos admin ou não.
 */
function decidir(grupo: EstadoGrupo, indice: number, base: string, conflitos: ReadonlySet<string>): Decisao {
  if (conflitos.has(grupo.whatsappGroupId)) return "conflito";
  if (!grupo.isAdmin) return "sem_admin";
  return grupo.nome === nomeNaPosicao(base, indice) ? "certo" : "muda";
}

/**
 * Um renome por grupo cujo nome do WhatsApp (`groups.name`) difere de
 * "<base> <posição>". Grupo já certo não vira job: renomear para o mesmo nome
 * gastaria uma janela anti-ban e ainda mostraria "Você mudou o nome do grupo".
 * JID sem estado (órfão) ocupa a posição mas não vira job.
 */
export function planejarRenomes(input: {
  ordem: readonly string[];
  base: string;
  estados: readonly EstadoGrupo[];
  conflitos: ReadonlySet<string>;
}): Renome[] {
  const porJid = new Map(input.estados.map((g) => [g.whatsappGroupId, g]));
  const renomes: Renome[] = [];
  input.ordem.forEach((jid, indice) => {
    const grupo = porJid.get(jid);
    if (!grupo || decidir(grupo, indice, input.base, input.conflitos) !== "muda") return;
    renomes.push({ groupId: grupo.groupId, whatsappGroupId: jid, subject: nomeNaPosicao(input.base, indice) });
  });
  return renomes;
}

/**
 * Valida a ordem que veio da tela contra a lista que ela estava vendo
 * (`esperado` = `campaign_groups.group_ids` no carregamento) e acrescenta, no fim
 * e na ordem do pool, os JIDs que a tela não mostra (sem linha em `groups`). O
 * resultado é permutação SEM REPETIÇÃO do conjunto — o que `reordenar_campanha`
 * grava.
 */
export function completarOrdem(
  ordem: readonly string[],
  esperado: readonly string[],
): { ok: true; ordem: string[] } | { ok: false; error: string } {
  if (esperado.length === 0) return { ok: false, error: "Esta campanha ainda não tem grupos." };
  const doPool = new Set(esperado);
  const vistos = new Set<string>();
  for (const jid of ordem) {
    if (!doPool.has(jid) || vistos.has(jid)) {
      return { ok: false, error: "A ordem tem grupo repetido ou que não é desta campanha." };
    }
    vistos.add(jid);
  }
  return { ok: true, ordem: [...ordem, ...[...doPool].filter((jid) => !vistos.has(jid))] };
}

/**
 * `grow_template` depois do Padronizar: molde "<base> {n}" e `padronizadoEm`
 * (o `nextSeq` conta só a fila depois dessa data). MERGE, nunca replace — sem
 * `subjectPattern` o auto-grow desliga; sem `desc`/`mediaId` o próximo grupo
 * nasce sem a identidade aplicada.
 */
export function padronizarGrowTemplate(
  atual: Record<string, unknown> | null,
  base: string,
  agora: string,
): Record<string, unknown> {
  return { ...(atual ?? {}), subjectPattern: `${base} {n}`, padronizadoEm: agora };
}

/** Base com que a tela abre: a do molde "<base> {n}", senão o nome da campanha. */
export function baseInicial(
  nomeDaCampanha: string,
  growTemplate: Record<string, unknown> | null | undefined,
): string {
  const bruto = growTemplate?.subjectPattern;
  const molde = typeof bruto === "string" ? bruto.trim() : "";
  const sufixo = " {n}";
  return molde.endsWith(sufixo) ? molde.slice(0, -sufixo.length).trim() : nomeDaCampanha.trim();
}

/** Os conflitos que tocam ESTA campanha, para o aviso amarelo da tela. */
export function conflitosDaCampanha(
  conflitos: readonly Conflito[],
  campanhaId: string,
): { jids: Set<string>; nomes: string[]; outras: string[] } {
  const daqui = conflitos.filter((c) => c.campanhas.some((camp) => camp.id === campanhaId));
  return {
    jids: new Set(daqui.map((c) => c.whatsappGroupId)),
    nomes: daqui.map((c) => c.nome),
    outras: [
      ...new Set(daqui.flatMap((c) => c.campanhas.filter((camp) => camp.id !== campanhaId).map((camp) => camp.name))),
    ],
  };
}

/** Seta ↑ (−1) e ↓ (+1). Fora das pontas devolve uma cópia igual. */
export function mover(ordem: readonly string[], indice: number, delta: -1 | 1): string[] {
  const nova = [...ordem];
  const alvo = indice + delta;
  if (indice < 0 || indice >= nova.length || alvo < 0 || alvo >= nova.length) return nova;
  [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
  return nova;
}

export type LinhaDoPadrao = {
  jid: string;
  /** Posição na sequência, a partir de 1. */
  numero: number;
  atual: string;
  novo: string;
  decisao: Decisao;
  membros: number;
  estado: EstadoDoGrupo;
};

export type ResumoDoPadrao = { linhas: LinhaDoPadrao[]; mudam: number; jaCertos: number; proximo: string };

/**
 * A prévia da tela. `tamanhoDoPool` é `group_ids.length` — o mesmo `poolSize` que
 * o `nextSeq` usa —, então "Próximo grupo criado sozinho" é o nome que o
 * auto-grow vai dar.
 */
export function resumoDoPadrao(input: {
  ordem: readonly string[];
  base: string;
  estados: readonly EstadoGrupo[];
  conflitos: ReadonlySet<string>;
  tamanhoDoPool: number;
}): ResumoDoPadrao {
  const porJid = new Map(input.estados.map((g) => [g.whatsappGroupId, g]));
  const linhas: LinhaDoPadrao[] = [];
  input.ordem.forEach((jid, indice) => {
    const grupo = porJid.get(jid);
    if (!grupo) return;
    const decisao = decidir(grupo, indice, input.base, input.conflitos);
    const ficaIgual = decisao === "conflito" || decisao === "sem_admin";
    linhas.push({
      jid,
      numero: indice + 1,
      atual: grupo.nome,
      novo: ficaIgual ? grupo.nome : nomeNaPosicao(input.base, indice),
      decisao,
      membros: grupo.membros,
      estado: grupo.estado,
    });
  });
  return {
    linhas,
    mudam: linhas.filter((l) => l.decisao === "muda").length,
    jaCertos: linhas.filter((l) => l.decisao === "certo").length,
    proximo: nomeNaPosicao(input.base, Math.max(input.tamanhoDoPool, input.ordem.length)),
  };
}
```

- [ ] **Step 4:** rodar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/padronizar.test.ts
```

  Esperado: todos PASS.

- [ ] **Step 5:** tipos (o arquivo de teste entra no `tsconfig.json`):

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```

  Esperado: exit 0. Erro em `grupo()` do teste → os campos de `EstadoGrupo` do PR 2 divergem do contrato §3: ajustar o **teste** ao tipo real e anotar a divergência no PR.

- [ ] **Step 6:** commit.

```powershell
git -C <wt> add apps/web/src/lib/groups/padronizar.ts apps/web/src/lib/groups/padronizar.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 2 arquivos.

```powershell
git -C <wt> commit -m @'
feat(groups): pure rules for standardizing group names and order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 2: `nextSeq` conta só a fila depois do Padronizar (TDD)

**Files:** modificar `src/lib/stores/group-grow-jobs.ts`, `src/lib/stores/group-grow-jobs.test.ts`, `src/lib/group-grow-store.ts`, `src/lib/group-grow-store.test.ts` (criado pelo PR 2)
**Depends-on:** Task 0
**Interfaces (produz, contrato §5):**
```ts
export async function nextSeq(tenantId: string, campaignGroupId: string, poolSize: number, desde?: string | null): Promise<number>;
// GrowTemplate (interno de group-grow-store.ts) ganha `padronizadoEm?: string` (ISO normalizado).
```

- [ ] **Step 1 (teste, store):** em `src/lib/stores/group-grow-jobs.test.ts`:

  Antes:
```ts
import { listGroupsCreatedSince, listGroupsCreatedSinceByTenant } from "./group-grow-jobs";
```
  Depois:
```ts
import { listGroupsCreatedSince, listGroupsCreatedSinceByTenant, nextSeq } from "./group-grow-jobs";
```

  E acrescentar ao **fim** do arquivo:

```ts
test("nextSeq depois do Padronizar só olha os jobs criados depois dele", async () => {
  pedidos.length = 0;
  linhas = [{ seq: 26 }];

  assert.equal(await nextSeq("loja-a", "camp-1", 20, "2026-10-10T12:00:00.000Z"), 27);

  assert.equal(pedidos.length, 1);
  const [url] = pedidos;
  assert.equal(url.pathname, "/rest/v1/group_grow_jobs");
  // Mutante: sem o `created_at`, o seq 26 de antes da padronização faria o
  // próximo grupo nascer "Moda Kids do Sul 27" depois de uma sequência 1–20.
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    select: "seq",
    tenant_id: "eq.loja-a",
    campaign_group_id: "eq.camp-1",
    created_at: "gt.2026-10-10T12:00:00.000Z",
    order: "seq.desc",
    limit: "1",
  });
});

test("nextSeq sem job novo desde o Padronizar parte do tamanho do pool", async () => {
  pedidos.length = 0;
  linhas = [];

  assert.equal(await nextSeq("loja-a", "camp-1", 20, "2026-10-10T12:00:00.000Z"), 21);
});

test("nextSeq sem Padronizar continua olhando a fila inteira", async () => {
  pedidos.length = 0;
  linhas = [{ seq: 26 }];

  assert.equal(await nextSeq("loja-a", "camp-1", 20), 27);
  assert.equal(await nextSeq("loja-a", "camp-1", 20, null), 27);
  assert.equal(pedidos.length, 2);
  for (const url of pedidos) assert.equal(url.searchParams.has("created_at"), false);
});
```

- [ ] **Step 2 (teste, auto-grow):** `src/lib/group-grow-store.test.ts` foi **criado pelo PR 2** (plano `pr2-pr3-link-e-contagem`, Task 7) com o PostgREST falso do auto-grow: `chamadas`, `tabelas`, `feitas`, `Chamada`, `Resposta`, `CAMPANHA`, `GRUPO_ABERTO`, `JOB` e `avaliacaoCom(grupo)`. Conferir que estão lá:

```powershell
git -C <wt> grep -n "function avaliacaoCom\|const GRUPO_ABERTO\|const CAMPANHA\|let tabelas" origin/main -- apps/web/src/lib/group-grow-store.test.ts
```

  Esperado: quatro linhas. Nome diferente no que foi mergeado → ajustar só as referências abaixo. Acrescentar ao **fim** do arquivo:

```ts
/* ---------- PR 8: o padronizadoEm chega ao nextSeq ---------- */

/** O pool de `avaliacaoCom` (grupo marcado lotado: merece o próximo), com o molde do teste. */
function avaliacaoPadronizada(growTemplate: Record<string, unknown>): Record<string, (c: Chamada) => Resposta> {
  return {
    ...avaliacaoCom({ ...GRUPO_ABERTO, lotado_em: "2026-10-09T12:00:00+00:00" }),
    "GET /rest/v1/campaign_groups": () => ({
      status: 200,
      corpo: [{ ...CAMPANHA, grow_template: growTemplate }],
    }),
  };
}

const buscaDoSeq = () =>
  feitas("GET", "/rest/v1/group_grow_jobs").find((c) => c.url.searchParams.get("select") === "seq");

test("campanha padronizada: o próximo número conta só a fila depois do Padronizar", async () => {
  chamadas.length = 0;
  tabelas = avaliacaoPadronizada({
    subjectPattern: "Moda Kids do Sul {n}",
    padronizadoEm: "2026-10-10T12:00:00.000Z",
  });

  await evaluateAutoGrow("loja-a");

  // Mutante: o parâmetro `desde` é opcional — esquecer de passá-lo compila, e o
  // seq antigo da fila faria o próximo grupo nascer fora da sequência.
  const seq = buscaDoSeq();
  assert.ok(seq, "o nextSeq não foi consultado");
  assert.equal(seq.url.searchParams.get("created_at"), "gt.2026-10-10T12:00:00.000Z");
  const [criado] = feitas("POST", "/rest/v1/group_grow_jobs");
  assert.equal((criado?.corpo as Record<string, unknown> | undefined)?.subject, "Moda Kids do Sul 2");
});

test("sem Padronizar, ou com data que não é data, o número olha a fila inteira", async () => {
  for (const growTemplate of [
    { subjectPattern: "Moda Kids do Sul {n}" },
    { subjectPattern: "Moda Kids do Sul {n}", padronizadoEm: "ontem" },
  ]) {
    chamadas.length = 0;
    tabelas = avaliacaoPadronizada(growTemplate);

    await evaluateAutoGrow("loja-a");

    const seq = buscaDoSeq();
    assert.ok(seq, "o nextSeq não foi consultado");
    // Lixo no jsonb não pode virar filtro: o PostgREST devolveria 400 e o
    // auto-grow da loja inteira pararia.
    assert.equal(seq.url.searchParams.has("created_at"), false);
  }
});
```

- [ ] **Step 3:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/group-grow-jobs.test.ts src/lib/group-grow-store.test.ts
```

  Esperado: FAIL em "nextSeq depois do Padronizar…" (sem `created_at`), "nextSeq sem job novo…" (27 em vez de 21) e "campanha padronizada…" (sem `created_at`); os demais — inclusive os do PR 2 — passam. Se "o nextSeq não foi consultado" falhar nos dois testes novos, a decisão de criar grupo mudou depois do PR 2: ler `evaluateAutoGrowSupabase` em `origin/main` e ajustar só `avaliacaoPadronizada` para a campanha continuar merecendo grupo novo.

- [ ] **Step 4:** `src/lib/stores/group-grow-jobs.ts`:

  Antes:
```ts
/**
 * Próximo número ({n}) da campanha. Continua de onde a fila parou; na primeira
 * vez parte do tamanho do pool, para não renumerar grupos que já existem.
 */
export async function nextSeq(tenantId: string, campaignGroupId: string, poolSize: number): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("seq")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Math.max(data?.seq ?? 0, poolSize) + 1;
}
```
  Depois:
```ts
/**
 * Próximo número ({n}) da campanha. Continua de onde a fila parou; na primeira
 * vez parte do tamanho do pool, para não renumerar grupos que já existem.
 *
 * `desde` = `grow_template.padronizadoEm`. Depois do Padronizar a sequência é
 * 1..N, e um `seq` antigo maior que o pool (26, de antes) faria o próximo grupo
 * nascer "Moda Kids do Sul 27" depois de uma sequência 1–20. Com ele, só contam
 * os jobs criados depois da padronização: `max(maiorSeqDesde, poolSize) + 1`.
 */
export async function nextSeq(
  tenantId: string,
  campaignGroupId: string,
  poolSize: number,
  desde?: string | null,
): Promise<number> {
  let query = getSupabaseAdmin()
    .from(TABLE)
    .select("seq")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId);
  if (desde) query = query.gt("created_at", desde);
  const { data, error } = await query.order("seq", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return Math.max(data?.seq ?? 0, poolSize) + 1;
}
```

- [ ] **Step 5:** `src/lib/group-grow-store.ts` — tipo:

  Antes:
```ts
type GrowTemplate = {
  subjectPattern: string;
  desc?: string;
  mediaId?: string;
  announce: boolean;
  memberAddMode: "admin_add" | "all_member_add";
};
```
  Depois:
```ts
type GrowTemplate = {
  subjectPattern: string;
  desc?: string;
  mediaId?: string;
  announce: boolean;
  memberAddMode: "admin_add" | "all_member_add";
  /** Quando o lojista padronizou (ISO). O `{n}` conta só a fila depois disso. */
  padronizadoEm?: string;
};
```

- [ ] **Step 6:** parse:

  Antes:
```ts
    memberAddMode: t.memberAddMode === "all_member_add" ? "all_member_add" : "admin_add",
  };
}
```
  Depois:
```ts
    memberAddMode: t.memberAddMode === "all_member_add" ? "all_member_add" : "admin_add",
    padronizadoEm: dataIso(t.padronizadoEm),
  };
}

/**
 * ISO válido ou `undefined`. O valor vira filtro de URL do PostgREST no
 * `nextSeq`: lixo ali seria 400, e o auto-grow da loja inteira pararia.
 */
function dataIso(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const ms = Date.parse(valor);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}
```

- [ ] **Step 7:** chamada:

  Antes:
```ts
    const seq = await supaJobs.nextSeq(tenantId, c.id, c.group_ids.length);
```
  Depois:
```ts
    const seq = await supaJobs.nextSeq(tenantId, c.id, c.group_ids.length, template.padronizadoEm);
```

- [ ] **Step 8:** rodar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/group-grow-jobs.test.ts src/lib/group-grow-store.test.ts src/lib/groups/grow-headroom.test.ts
```

  Esperado: todos PASS.

- [ ] **Step 9:** commit.

```powershell
git -C <wt> add apps/web/src/lib/stores/group-grow-jobs.ts apps/web/src/lib/stores/group-grow-jobs.test.ts apps/web/src/lib/group-grow-store.ts apps/web/src/lib/group-grow-store.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 4 arquivos.

```powershell
git -C <wt> commit -m @'
feat(grow): nextSeq counts only jobs after padronizadoEm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: `PATCH /api/campanhas` mescla o `growTemplate` (TDD)

**Files:** modificar `src/app/api/campanhas/route.ts`, `src/lib/groups/bulk-batch.test.ts`; criar `src/app/api/campanhas/route.test.ts`
**Depends-on:** Task 0

Achado deste plano, fora do spec: o `campaign-config.tsx` (`growTemplatePatch`, linha ~206) manda `{ growTemplate: { subjectPattern } }` em **todo** salvar com auto-grow ligado, e o PATCH faz `patch.grow_template = b.growTemplate` — substitui o objeto. Hoje isso já apaga a identidade aplicada (`desc`, `mediaId`); com o PR 8 apagaria o `padronizadoEm`, e o próximo grupo voltaria a numerar pela fila velha.

- [ ] **Step 1 (teste):** criar `src/app/api/campanhas/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { PATCH } from "./route";

/**
 * O PATCH de campanha contra um Supabase de mentira (desenho de
 * `app/api/orders/route.test.ts`): sessão, membership e campanha saem como em
 * produção; só a rede é trocada.
 */

const CAMPANHA_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
});

after(() => {
  supabase.close();
});

const NO_BANCO = {
  id: CAMPANHA_ID,
  tenant_id: "loja-b",
  name: "Moda Kids do Sul",
  slug: "moda-kids",
  group_ids: ["g1@g.us"],
  auto_grow: true,
  grow_template: {
    subjectPattern: "Moda Kids do Sul {n}",
    desc: "Bazar",
    mediaId: "m1",
    padronizadoEm: "2026-10-10T12:00:00.000Z",
  },
  metadata: {},
  whatsapp_community_jid: null,
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};

/** Dono logado por Bearer na `loja-b`; o resto responde por "MÉTODO /caminho". */
function banco(tabelas: Record<string, (chamada: Chamada) => Resposta>): (chamada: Chamada) => Resposta {
  return (chamada) => {
    const { metodo, url } = chamada;
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: "loja-b", role: "owner" }] };
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela(chamada) : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

function patchDoDono(corpo: unknown): Request {
  return new Request("http://girumo.test/api/campanhas", {
    method: "PATCH",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

const comCampanha = () =>
  banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [NO_BANCO] }),
    "PATCH /rest/v1/campaign_groups": (c) => ({
      status: 200,
      corpo: [{ ...NO_BANCO, ...(c.corpo as Record<string, unknown>) }],
    }),
  });

test("PATCH com growTemplate mantém a identidade e o padronizadoEm que estão no banco", async () => {
  chamadas.length = 0;
  responder = comCampanha();

  // O que o campaign-config manda a cada salvar. Mutante: o
  // `patch.grow_template = b.growTemplate` antigo, que trocava o objeto inteiro.
  const res = await PATCH(
    patchDoDono({ id: CAMPANHA_ID, autoGrow: true, groupIds: ["g1@g.us"], growTemplate: { subjectPattern: "Ofertas {n}" } }),
  );

  assert.equal(res.status, 200);
  const [gravado] = feitas("PATCH", "/rest/v1/campaign_groups");
  assert.ok(gravado, "a campanha não foi gravada");
  assert.equal(gravado.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.deepEqual((gravado.corpo as { grow_template?: unknown }).grow_template, {
    subjectPattern: "Ofertas {n}",
    desc: "Bazar",
    mediaId: "m1",
    padronizadoEm: "2026-10-10T12:00:00.000Z",
  });
});

test("PATCH só com growTemplate busca a campanha da loja para mesclar", async () => {
  chamadas.length = 0;
  responder = comCampanha();

  const res = await PATCH(patchDoDono({ id: CAMPANHA_ID, growTemplate: { subjectPattern: "Ofertas {n}" } }));

  assert.equal(res.status, 200);
  const [busca] = feitas("GET", "/rest/v1/campaign_groups");
  assert.ok(busca, "a campanha atual não foi lida");
  assert.equal(busca.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(busca.url.searchParams.get("id"), `eq.${CAMPANHA_ID}`);
  const [gravado] = feitas("PATCH", "/rest/v1/campaign_groups");
  assert.equal(
    (gravado?.corpo as { grow_template?: { padronizadoEm?: string } } | undefined)?.grow_template?.padronizadoEm,
    "2026-10-10T12:00:00.000Z",
  );
});
```

- [ ] **Step 2 (teste):** em `src/lib/groups/bulk-batch.test.ts`, depois do teste "template nulo vira objeto novo":

  Antes:
```ts
test("template nulo vira objeto novo", () => {
  assert.deepEqual(mergeGrowIdentity(null, { description: "x" }), { desc: "x" });
});
```
  Depois:
```ts
test("template nulo vira objeto novo", () => {
  assert.deepEqual(mergeGrowIdentity(null, { description: "x" }), { desc: "x" });
});

test("identidade aplicada depois do Padronizar preserva o molde e o padronizadoEm", () => {
  // Sem padronizadoEm o nextSeq volta a contar a fila de antes e o próximo
  // grupo nasce com o número errado.
  const merged = mergeGrowIdentity(
    { subjectPattern: "Moda Kids do Sul {n}", padronizadoEm: "2026-10-10T12:00:00.000Z" },
    { description: "Bazar" },
  );
  assert.equal(merged.subjectPattern, "Moda Kids do Sul {n}");
  assert.equal(merged.padronizadoEm, "2026-10-10T12:00:00.000Z");
  assert.equal(merged.desc, "Bazar");
});
```

- [ ] **Step 3:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/campanhas/route.test.ts src/lib/groups/bulk-batch.test.ts
```

  Esperado: FAIL nos dois testes do PATCH (`grow_template` = só `{ subjectPattern }`; o segundo nem lê a campanha); o novo de `bulk-batch` **passa** (o `mergeGrowIdentity` já mescla — o teste fica como guarda de regressão).

- [ ] **Step 4:** `src/app/api/campanhas/route.ts`, no ramo Supabase do PATCH:

  Antes:
```ts
  if (b.growTemplate && typeof b.growTemplate === "object") {
    patch.grow_template = b.growTemplate as Record<string, unknown>;
  }
```
  Depois:
```ts
  if (b.growTemplate && typeof b.growTemplate === "object") {
    // MERGE com o que está no banco, nunca replace. O painel (campaign-config)
    // só manda `subjectPattern`; trocar o objeto inteiro apagava a identidade
    // aplicada (`desc`, `mediaId`) e o `padronizadoEm` do Padronizar — e sem ele
    // o próximo grupo do auto-grow voltava a numerar pela fila de antes.
    const atual = current ?? (await supaStore.getCampaignGroupById(tenantId, id));
    patch.grow_template = {
      ...(atual?.grow_template ?? {}),
      ...(b.growTemplate as Record<string, unknown>),
    };
  }
```

- [ ] **Step 5:** rodar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/campanhas/route.test.ts src/lib/groups/bulk-batch.test.ts src/app/api/campanhas/campanhas.integracoes.test.ts
```

  Esperado: todos PASS. (Se o PR 6 ou o PR 9 tiverem acrescentado leitura ao PATCH — por exemplo, conferir conflito antes do update —, o fake responde 500 "inesperado: …": acrescentar a chave que faltar ao `comCampanha()`.)

- [ ] **Step 6:** commit.

```powershell
git -C <wt> add apps/web/src/app/api/campanhas/route.ts apps/web/src/app/api/campanhas/route.test.ts apps/web/src/lib/groups/bulk-batch.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 3 arquivos.

```powershell
git -C <wt> commit -m @'
fix(campanhas): PATCH merges growTemplate instead of replacing it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: `POST /api/campanhas/[slug]/grupos/padronizar` (TDD)

**Files:** criar `src/app/api/campanhas/[slug]/grupos/padronizar/route.ts`, `src/app/api/campanhas/[slug]/grupos/padronizar/route.test.ts`
**Depends-on:** Tasks 1, 2
**Interfaces (produz, contrato §4):** corpo `{ base: string; ordem: string[]; esperado: string[] }` → `201 { batchId: string; renomes: number }`; `400 { error }` (base, ordem, campanha sem grupo); `409 { error }` (lista mudou, grupo novo nascendo, comunidade nativa); `404` (campanha de outra loja ou inexistente, via `resolveBulkCampaign`); `403` sem `campaign:edit`.

Ordem do handler (cada passo antes do seguinte, por motivo):
1. sessão + `campaign:edit` + campanha da loja (`resolveBulkCampaign`);
2. corpo: `validarBase`, `ordem`/`esperado` como listas de texto, `completarOrdem` — tudo antes de tocar o banco;
3. comunidade nativa → 409 (o sync regrava `group_ids` dela);
4. job de criação em voo → 409 **sem** reordenar (o grupo novo nasceria com o nome antigo — Review Focus 3);
5. estados + conflitos (leitura);
6. `reordenar_campanha(esperado, ordem completa)` → `false` = 409, nada enfileirado nem gravado;
7. `planejarRenomes` → `buildSubjectJobs` → `enqueueBulkJobs` (um `batch_id`);
8. `grow_template` com `padronizarGrowTemplate`.

- [ ] **Step 1 (teste):** criar `src/app/api/campanhas/[slug]/grupos/padronizar/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { POST } from "./route";

/**
 * A rota do Padronizar contra um Supabase de mentira (desenho de
 * `app/api/orders/route.test.ts`): sessão, membership, campanha, estados,
 * conflitos, reordenação, fila e molde saem como em produção; só a rede é
 * trocada. O que se prova aqui é a ORDEM das escritas e o que NÃO acontece
 * quando a lista mudou.
 */

const CAMPANHA_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
});

after(() => {
  supabase.close();
});

const ESPERADO = ["g1@g.us", "g2@g.us", "g3@g.us", "g4@g.us", "g5@g.us", "orfao@g.us"];
const ORDEM = ["g2@g.us", "g1@g.us", "g3@g.us", "g4@g.us", "g5@g.us"];

const CAMPANHA = {
  id: CAMPANHA_ID,
  tenant_id: "loja-b",
  name: "Moda Kids do Sul",
  slug: "moda-kids",
  group_ids: ESPERADO,
  auto_grow: true,
  grow_template: { subjectPattern: "Ofertas {n}", desc: "Bazar", mediaId: "m1" },
  metadata: {},
  whatsapp_community_jid: null as string | null,
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};

/** Linha `EstadoRow` (contrato §1), com o que cada teste precisa mudar. */
function linha(over: Record<string, unknown>): Record<string, unknown> {
  return {
    posicao: 1,
    group_id: "grp-x",
    whatsapp_group_id: "gx@g.us",
    name: "Grupo",
    members: 10,
    capacity: 1024,
    is_admin: true,
    invite_url: "https://chat.whatsapp.com/AAA111",
    lotado_em: null,
    lotado_por: null,
    reaberto_em: null,
    aviso_lotou_em: null,
    estado: "fila",
    pode_reabrir: false,
    na_regra_menos_enchendo: true,
    na_regra_lotados: false,
    na_regra_com_gente: true,
    ...over,
  };
}

const ESTADOS = [
  linha({ posicao: 1, group_id: "grp-1", whatsapp_group_id: "g1@g.us", name: "Moda Kids do Sul 1", members: 1000, estado: "lotado", lotado_em: "2026-10-01T00:00:00+00:00", lotado_por: "auto" }),
  linha({ posicao: 2, group_id: "grp-2", whatsapp_group_id: "g2@g.us", name: "Kids Sul #3", members: 990, estado: "lotado", lotado_em: "2026-10-02T00:00:00+00:00", lotado_por: "auto" }),
  linha({ posicao: 3, group_id: "grp-3", whatsapp_group_id: "g3@g.us", name: "Moda Kids do Sul 3", members: 958, estado: "enchendo" }),
  linha({ posicao: 4, group_id: "grp-4", whatsapp_group_id: "g4@g.us", name: "Grupo antigo", members: 412, is_admin: false }),
  linha({ posicao: 5, group_id: "grp-5", whatsapp_group_id: "g5@g.us", name: "Grupo 19", members: 1, estado: "vazio" }),
];

/** g2 também está no "Saldão Outubro": entra na ordem, não é renomeado. */
const CONFLITOS = [
  {
    whatsapp_group_id: "g2@g.us",
    name: "Kids Sul #3",
    campanhas: [
      { id: CAMPANHA_ID, name: "Moda Kids do Sul", slug: "moda-kids", posicao: 2 },
      { id: "outra", name: "Saldão Outubro", slug: "saldao", posicao: 1 },
    ],
  },
];

type Tabelas = Record<string, (chamada: Chamada) => Resposta>;

/** Dono logado por Bearer na `loja-b`; o resto responde por "MÉTODO /caminho". */
function banco(over: Tabelas = {}): (chamada: Chamada) => Resposta {
  const tabelas: Tabelas = {
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [CAMPANHA] }),
    "GET /rest/v1/group_grow_jobs": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/rpc/campaign_group_states": () => ({ status: 200, corpo: ESTADOS }),
    "POST /rest/v1/rpc/grupos_em_mais_de_uma_campanha": () => ({ status: 200, corpo: CONFLITOS }),
    "POST /rest/v1/rpc/reordenar_campanha": () => ({ status: 200, corpo: true }),
    "POST /rest/v1/group_bulk_jobs": (c) => ({
      status: 201,
      corpo: (c.corpo as unknown[]).map((_, i) => ({ id: `job-${i}` })),
    }),
    "PATCH /rest/v1/campaign_groups": () => ({ status: 200, corpo: [CAMPANHA] }),
    ...over,
  };
  return (chamada) => {
    const { metodo, url } = chamada;
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: "loja-b", role: "owner" }] };
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela(chamada) : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

function padronizar(corpo: unknown): Promise<Response> {
  return POST(
    new Request("http://girumo.test/api/campanhas/moda-kids/grupos/padronizar", {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ slug: "moda-kids" }) },
  );
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

const escritas = () => [
  ...feitas("POST", "/rest/v1/rpc/reordenar_campanha"),
  ...feitas("POST", "/rest/v1/group_bulk_jobs"),
  ...feitas("PATCH", "/rest/v1/campaign_groups"),
];

test("salva a ordem, enfileira um renome por grupo que muda num lote só e grava o molde", async () => {
  chamadas.length = 0;
  responder = banco();

  const res = await padronizar({ base: "  Moda Kids do Sul ", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 201);
  const resposta = (await res.json()) as { batchId: string; renomes: number };
  assert.equal(resposta.renomes, 2);

  // A campanha é a da loja da sessão.
  const [campanha] = feitas("GET", "/rest/v1/campaign_groups");
  assert.equal(campanha?.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(campanha?.url.searchParams.get("slug"), "eq.moda-kids");

  // A ordem gravada é a da tela com o órfão (sem linha em groups) no fim.
  const [reordena] = feitas("POST", "/rest/v1/rpc/reordenar_campanha");
  assert.deepEqual(reordena?.corpo, {
    p_tenant: "loja-b",
    p_campanha: CAMPANHA_ID,
    p_esperado: ESPERADO,
    p_nova: [...ORDEM, "orfao@g.us"],
  });

  // g1 (posição 2) e g5 (posição 5) mudam; g2 em conflito, g3 já certo e g4 sem
  // admin ficam de fora.
  const [fila] = feitas("POST", "/rest/v1/group_bulk_jobs");
  const jobs = fila?.corpo as Array<Record<string, unknown>>;
  assert.deepEqual(
    jobs.map((j) => [j.group_id, j.whatsapp_group_id, j.subject]),
    [
      ["grp-1", "g1@g.us", "Moda Kids do Sul 2"],
      ["grp-5", "g5@g.us", "Moda Kids do Sul 5"],
    ],
  );
  for (const job of jobs) {
    assert.equal(job.action, "set_subject");
    assert.equal(job.tenant_id, "loja-b");
    assert.equal(job.campaign_group_id, CAMPANHA_ID);
    assert.equal(job.batch_id, resposta.batchId);
  }

  // Molde mesclado, com a data do Padronizar.
  const [molde] = feitas("PATCH", "/rest/v1/campaign_groups");
  assert.equal(molde?.url.searchParams.get("tenant_id"), "eq.loja-b");
  const template = (molde?.corpo as { grow_template: Record<string, unknown> }).grow_template;
  assert.equal(template.subjectPattern, "Moda Kids do Sul {n}");
  assert.equal(template.desc, "Bazar");
  assert.equal(template.mediaId, "m1");
  assert.equal(Number.isNaN(Date.parse(String(template.padronizadoEm))), false);

  // Reordenar ANTES de enfileirar: renome sem ordem salva numeraria grupos que
  // o link não segue.
  assert.ok(chamadas.indexOf(reordena!) < chamadas.indexOf(fila!));
});

test("lista mudou no meio (reordenar devolve false): 409 e nada enfileirado nem gravado", async () => {
  chamadas.length = 0;
  responder = banco({ "POST /rest/v1/rpc/reordenar_campanha": () => ({ status: 200, corpo: false }) });

  const res = await padronizar({ base: "Moda Kids do Sul", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "A lista de grupos mudou. Recarregue a página." });
  assert.equal(feitas("POST", "/rest/v1/group_bulk_jobs").length, 0);
  assert.equal(feitas("PATCH", "/rest/v1/campaign_groups").length, 0);
});

test("grupo novo nascendo agora: 409 sem reordenar — ele nasceria com o nome antigo", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/group_grow_jobs": () => ({ status: 200, corpo: [{ campaign_group_id: CAMPANHA_ID }] }),
  });

  const res = await padronizar({ base: "Moda Kids do Sul", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 409);
  assert.match(((await res.json()) as { error: string }).error, /grupo novo/);
  assert.equal(escritas().length, 0);
  const [voo] = feitas("GET", "/rest/v1/group_grow_jobs");
  assert.equal(voo?.url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("base inválida responde 400 sem tocar estado, conflito nem fila", async () => {
  chamadas.length = 0;
  responder = banco();

  const res = await padronizar({ base: "   ", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Escreva o nome base." });
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/rest/v1/rpc/")).length, 0);
  assert.equal(escritas().length, 0);
});

test("ordem com grupo de fora da campanha responde 400", async () => {
  chamadas.length = 0;
  responder = banco();

  const res = await padronizar({ base: "Moda Kids do Sul", ordem: [...ORDEM, "intruso@g.us"], esperado: ESPERADO });

  assert.equal(res.status, 400);
  assert.equal(escritas().length, 0);
});

test("comunidade nativa do WhatsApp responde 409 — a ordem dela vem do sync", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({
      status: 200,
      corpo: [{ ...CAMPANHA, whatsapp_community_jid: "120363999999999999@g.us" }],
    }),
  });

  const res = await padronizar({ base: "Moda Kids do Sul", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 409);
  assert.equal(escritas().length, 0);
});
```

- [ ] **Step 2:** rodar e ver falhar (o `*` no lugar de `[slug]` é obrigatório — Global Constraints):

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test "src/app/api/campanhas/*/grupos/padronizar/route.test.ts"
```

  Esperado: FAIL ao importar `./route` (arquivo não existe).

- [ ] **Step 3:** criar `src/app/api/campanhas/[slug]/grupos/padronizar/route.ts`:

```ts
import { COMUNIDADE_NATIVA_MENSAGEM } from "@/lib/communities/validation";
import { buildSubjectJobs } from "@/lib/groups/bulk-batch";
import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { completarOrdem, padronizarGrowTemplate, planejarRenomes, validarBase } from "@/lib/groups/padronizar";
import { listCampaignGroupStates } from "@/lib/stores/campaign-group-states";
import * as campaignGroupsStore from "@/lib/stores/campaign-groups";
import { enqueueBulkJobs } from "@/lib/stores/group-bulk-jobs";
import { listInFlightCampaignIds } from "@/lib/stores/group-grow-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTA_MUDOU = "A lista de grupos mudou. Recarregue a página.";
const GRUPO_NASCENDO =
  "Um grupo novo desta campanha está sendo criado agora. Espere ele aparecer e tente de novo.";

function listaDeTexto(valor: unknown): string[] | null {
  return Array.isArray(valor) && valor.every((item) => typeof item === "string") ? valor : null;
}

/**
 * POST /api/campanhas/[slug]/grupos/padronizar
 * body { base, ordem: string[], esperado: string[] } → 201 { batchId, renomes }
 *
 * "Padronizar nomes e sequência" (spec 2026-10-10 §6.7, D9). Salva a ordem do
 * link na hora (`reordenar_campanha`), enfileira os renomes num lote só pela
 * fila anti-ban das ações em massa e grava o molde "<base> {n}" + `padronizadoEm`
 * no `grow_template`, para o auto-grow criar o próximo como "<base> <n+1>".
 *
 * `esperado` é a lista que a tela estava vendo. Se o conjunto mudou entre o
 * carregamento e o clique (o auto-grow anexou um grupo), `reordenar_campanha`
 * devolve false e a resposta é 409 — nada enfileirado, nada gravado.
 *
 * O nome no banco (`groups.name`) só muda no ack `done` de cada renome
 * (`ackBulk`): renome que falha deixa o grupo com o nome antigo nos dois lados.
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

    const base = validarBase(body.base);
    if (!base.ok) return Response.json({ error: base.error }, { status: 400 });

    const ordem = listaDeTexto(body.ordem);
    const esperado = listaDeTexto(body.esperado);
    if (!ordem || !esperado) {
      return Response.json({ error: "Envie a ordem dos grupos e a lista que você estava vendo." }, { status: 400 });
    }
    const completa = completarOrdem(ordem, esperado);
    if (!completa.ok) return Response.json({ error: completa.error }, { status: 400 });

    // A gaveta espelho de comunidade nativa tem `group_ids` regravado a cada sync.
    if (campaign.whatsapp_community_jid) {
      return Response.json({ error: COMUNIDADE_NATIVA_MENSAGEM }, { status: 409 });
    }

    // Job de criação na fila já carrega o nome resolvido com o molde antigo: o
    // grupo nasceria fora do padrão, no fim da sequência recém-salva.
    // ponytail: ainda sobra a janela entre esta leitura e o `reordenar_campanha`;
    // se o grupo for anexado nela, o próprio reordenar devolve false (409).
    if ((await listInFlightCampaignIds(tenantId)).has(campaign.id)) {
      return Response.json({ error: GRUPO_NASCENDO }, { status: 409 });
    }

    const [estados, conflitos] = await Promise.all([
      listCampaignGroupStates(tenantId, campaign.id),
      campaignGroupsStore.listarConflitos(tenantId),
    ]);

    const salvou = await campaignGroupsStore.reordenarCampanha(tenantId, campaign.id, esperado, completa.ordem);
    if (!salvou) return Response.json({ error: LISTA_MUDOU }, { status: 409 });

    const renomes = planejarRenomes({
      ordem: completa.ordem,
      base: base.base,
      estados,
      conflitos: new Set(conflitos.map((c) => c.whatsappGroupId)),
    });
    const batchId = crypto.randomUUID();
    await enqueueBulkJobs(tenantId, buildSubjectJobs({ tenantId, campaignGroupId: campaign.id, batchId, renomes }));

    await campaignGroupsStore.updateCampaignGroup(tenantId, campaign.id, {
      grow_template: padronizarGrowTemplate(campaign.grow_template, base.base, new Date().toISOString()),
    });

    return Response.json({ batchId, renomes: renomes.length }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/padronizar] falha ao padronizar:", error);
    return Response.json({ error: "Erro ao padronizar os grupos." }, { status: 500 });
  }
}
```

  (Constantes **sem** `export`: o Next recusa export que não é campo de rota em `route.ts`.)

- [ ] **Step 4:** rodar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test "src/app/api/campanhas/*/grupos/padronizar/route.test.ts"
```

  Esperado: todos PASS. "inesperado: POST /rest/v1/rpc/…" → o store do PR 2/6 chama outro caminho: voltar à Task 0 Step 3 e ajustar o fake.

- [ ] **Step 5:** mutantes (TDD já viu o vermelho do arquivo inteiro; estes provam os testes de borda): (a) apagar o bloco `if ((await listInFlightCampaignIds…` → rodar o Step 4 → **FAIL** em "grupo novo nascendo…"; (b) trocar `if (!salvou) return …` por nada → **FAIL** em "lista mudou…". Reverter cada um e conferir com `git -C <wt> status --short` que só os dois arquivos novos aparecem (untracked).

- [ ] **Step 6:** tipos: `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json` → exit 0.

- [ ] **Step 7:** commit.

```powershell
git -C <wt> add "apps/web/src/app/api/campanhas/[slug]/grupos/padronizar/route.ts" "apps/web/src/app/api/campanhas/[slug]/grupos/padronizar/route.test.ts"
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 2 arquivos.

```powershell
git -C <wt> commit -m @'
feat(campanhas): POST grupos/padronizar saves order and enqueues renames

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: progresso do lote vira hook compartilhado

**Files:** criar `src/components/painel/grupos/use-progresso-do-lote.ts`; modificar `src/components/painel/grupos/acoes-em-massa.tsx`
**Depends-on:** Task 0
**Interfaces (produz):**
```ts
export type ProgressoDoLote = { batchId: string; actions: string[]; createdAt: string; total: number; done: number; failed: number; pending: number };
export const OPS_POR_MINUTO = 15;
export function useProgressoDoLote(slug: string, onLoteConcluido?: () => void): { progresso: ProgressoDoLote | null; lerProgresso: () => Promise<void> };
```

Código movido sem mudar comportamento (polling de 3s só com pendente, busca no mount, `onLoteConcluido` na transição >0 → 0). A cobertura é a do E2E que já existe (`painel-campanha-acoes-em-massa.spec.ts`, "o progresso do lote reflete a rota de lotes"), rodado na Task 8.

- [ ] **Step 1:** criar `src/components/painel/grupos/use-progresso-do-lote.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Progresso do lote mais recente de ações em massa da campanha
 * (`GET /api/campanhas/[slug]/grupos/lotes`) — o "47 de 91".
 *
 * Saiu de `acoes-em-massa.tsx` para o Padronizar acompanhar os renomes pelo
 * mesmo caminho. Polling de 3s enquanto houver job pendente, e não realtime: o
 * realtime do app é decorativo, e uma barra pendurada nele nunca se moveria.
 * Busca no mount para reencontrar um lote em andamento depois de um F5 — com 91
 * grupos o lote leva ~6 min, então recarregar no meio é o caso comum.
 */

export type ProgressoDoLote = {
  batchId: string;
  actions: string[];
  createdAt: string;
  total: number;
  done: number;
  failed: number;
  pending: number;
};

/** Ritmo do executor: 1 operação a cada 4s ≈ 15/min. */
export const OPS_POR_MINUTO = 15;
const POLL_MS = 3000;

export function useProgressoDoLote(slug: string, onLoteConcluido?: () => void) {
  const [progresso, setProgresso] = useState<ProgressoDoLote | null>(null);
  // Guarda o pendente da batida anterior: a transição >0 -> 0 é o fim do lote.
  const pendenteAnterior = useRef<number | null>(null);

  const lerProgresso = useCallback(async () => {
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/lotes`);
      if (!res.ok) return;
      const dado = (await res.json()) as ProgressoDoLote | null;
      setProgresso(dado);

      const antes = pendenteAnterior.current;
      pendenteAnterior.current = dado?.pending ?? null;
      if (antes !== null && antes > 0 && dado && dado.pending === 0) onLoteConcluido?.();
    } catch {
      // Uma batida perdida não é erro de tela: a próxima corrige.
    }
  }, [slug, onLoteConcluido]);

  useEffect(() => {
    lerProgresso();
  }, [lerProgresso]);

  useEffect(() => {
    if (!progresso || progresso.pending === 0) return;
    const id = setInterval(lerProgresso, POLL_MS);
    return () => clearInterval(id);
  }, [progresso, lerProgresso]);

  return { progresso, lerProgresso };
}
```

- [ ] **Step 2:** `acoes-em-massa.tsx` — imports:

  Antes:
```tsx
import { useCallback, useEffect, useRef, useState } from "react";
```
  Depois:
```tsx
import { useCallback, useRef, useState } from "react";
```

  Antes:
```tsx
import { RemoverDuplicados } from "./remover-duplicados";
```
  Depois:
```tsx
import { RemoverDuplicados } from "./remover-duplicados";
import { OPS_POR_MINUTO, useProgressoDoLote } from "./use-progresso-do-lote";
```

- [ ] **Step 3:** tipo que saiu:

  Antes:
```tsx
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
```
  Depois:
```tsx
type Resultado = {
```

- [ ] **Step 4:** constantes e rótulo do renome:

  Antes:
```tsx
/** Ritmo do executor: 1 operação a cada 4s ≈ 15/min. */
const OPS_POR_MINUTO = 15;
const POLL_MS = 3000;

const ROTULO_ACAO: Record<string, string> = {
  set_description: "descrição",
  set_picture: "foto",
  open: "abertura",
  close: "fechamento",
  check_invite: "revisão dos links",
  remove_participant: "remoção de duplicado",
};
```
  Depois:
```tsx
const ROTULO_ACAO: Record<string, string> = {
  set_description: "descrição",
  set_picture: "foto",
  open: "abertura",
  close: "fechamento",
  check_invite: "revisão dos links",
  remove_participant: "remoção de duplicado",
  set_subject: "renomeação",
};
```

- [ ] **Step 5:** estado e efeitos:

  Antes:
```tsx
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  // Guarda o pendente da batida anterior: a transição >0 -> 0 é o fim do lote.
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
```
  Depois:
```tsx
  const { progresso, lerProgresso } = useProgressoDoLote(slug, onLoteConcluido);
  const arquivoRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 6:** tipos e lint:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```
```powershell
Set-Location <wt>\apps\web; npx eslint src/components/painel/grupos/acoes-em-massa.tsx src/components/painel/grupos/use-progresso-do-lote.ts
```

  Esperado: exit 0 nos dois, sem `no-unused-vars` (o `useEffect` saiu do import junto com os efeitos).

- [ ] **Step 7:** commit.

```powershell
git -C <wt> add apps/web/src/components/painel/grupos/use-progresso-do-lote.ts apps/web/src/components/painel/grupos/acoes-em-massa.tsx
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 2 arquivos.

```powershell
git -C <wt> commit -m @'
refactor(painel): share batch progress polling as a hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: tela "Padronizar nomes e sequência", botão na campanha e fixture

**Files:** criar `src/app/painel/campanhas/[slug]/padronizar/page.tsx`; modificar `src/app/painel/campanhas/[slug]/page.tsx`, `e2e/fixtures-dinamicas.ts`
**Depends-on:** Tasks 1, 4, 5

Tradução do mockup para o painel real: barra Volt da casca (a página não desenha barra); raio 12 (`rounded-xl`); h1 `font-brand text-28 font-bold`; legenda `text-13`; números em Manrope (`font-brand`); setas de **44px** (o mockup tinha 40); input 16px (`text-base`); `<label>` no campo; erro em `role="alert"`; a confirmação num `role="status"` **sempre montado** (região viva inserida já com texto não é anunciada). O chip de estado é o `ChipDeEstado` do PR 4 (Acid só no Lotado, G2 regra 11; vazio tracejado na cor padrão, porque contorno colorido não pinta com `border-*`); a tela não tem fundo Acid próprio. Tabela de verdade (`<table>`), rolando de lado dentro do cartão no celular; a página não rola de lado em 390.

`/painel/campanhas/[slug]/padronizar` é rota **dinâmica** nova: `painel-rotas-dinamicas.spec.ts` varre o filesystem e **reprova** se ela não tiver fixture em `e2e/fixtures-dinamicas.ts` (Step 5). A tela mostra o nome da campanha no caminho ("<campanha> / Grupos") e, com slug inexistente, só "Campanha não encontrada." — é essa diferença que o contraste mede.

- [ ] **Step 1:** criar `src/app/painel/campanhas/[slug]/padronizar/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { ChipDeEstado } from "@/components/painel/grupos/estado-do-grupo";
import { OPS_POR_MINUTO, useProgressoDoLote } from "@/components/painel/grupos/use-progresso-do-lote";
import type { EstadoGrupo } from "@/lib/groups/estado";
import {
  NOTA_DA_DECISAO,
  baseInicial,
  conflitosDaCampanha,
  mover,
  ordemInicial,
  ordemPadrao,
  resumoDoPadrao,
  validarBase,
  type Conflito,
} from "@/lib/groups/padronizar";
import { cn } from "@/lib/utils";

/**
 * "Padronizar nomes e sequência" (spec 2026-10-10 §6.7 e D9; mockup, tela 3).
 *
 * A prévia usa as MESMAS funções puras que a rota (`lib/groups/padronizar.ts`):
 * o "Mudam de nome" que o lojista lê antes de clicar é o número de jobs que o
 * servidor cria. A tela não decide nada sozinha — manda base, ordem e a lista
 * que estava vendo (`esperado`), e o servidor recusa com 409 se a lista mudou.
 */

type Campanha = {
  id: string;
  name: string;
  slug?: string;
  groupIds: string[];
  growTemplate?: Record<string, unknown> | null;
};

type Resultado = { batchId: string; renomes: number };

/** Tela de conflitos do PR 6 ("um grupo, uma campanha"); `?de=<slug>` monta o caminho de volta. */
const CONFLITOS_HREF = "/painel/campanhas/conflitos";

const listaPtBr = new Intl.ListFormat("pt-BR", { type: "conjunction" });

async function lerJson<T>(res: Response, padrao: string): Promise<T> {
  const corpo: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const erro = (corpo as { error?: unknown } | null)?.error;
    throw new Error(typeof erro === "string" ? erro : padrao);
  }
  return corpo as T;
}

function Celula({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b px-5 py-3.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="text-13 text-slate-600">{rotulo}</span>
      {children}
    </div>
  );
}

export default function PadronizarNomesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const caminho = encodeURIComponent(slug);

  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [naoAchou, setNaoAchou] = useState(false);
  const [estados, setEstados] = useState<EstadoGrupo[] | null>(null);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [base, setBase] = useState("");
  const [ordem, setOrdem] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [listaMudou, setListaMudou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const { progresso, lerProgresso } = useProgressoDoLote(slug);

  const carregar = useCallback(async () => {
    setErro(null);
    setListaMudou(false);
    try {
      const lista = await lerJson<Campanha[]>(await fetch("/api/campanhas"), "Não foi possível carregar a campanha.");
      const achada = lista.find((c) => c.slug === slug || c.id === slug) ?? null;
      setCampanha(achada);
      setNaoAchou(achada === null);
      if (!achada) return;

      const [resEstados, resConflitos] = await Promise.all([
        fetch(`/api/campanhas/${caminho}/grupos/estados`),
        fetch("/api/campanhas/conflitos"),
      ]);
      const { grupos } = await lerJson<{ grupos: EstadoGrupo[] }>(resEstados, "Não foi possível carregar os grupos.");
      const lidos = await lerJson<{ conflitos: Conflito[] }>(
        resConflitos,
        "Não foi possível conferir os grupos que estão em duas campanhas.",
      );
      setEstados(grupos);
      setConflitos(lidos.conflitos);
      setOrdem(ordemInicial(grupos, achada.growTemplate));
      setBase((atual) => atual || baseInicial(achada.name, achada.growTemplate));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }, [slug, caminho]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const validacao = validarBase(base);
  const baseDaPrevia = validacao.ok ? validacao.base : base.trim();
  const daCampanha = useMemo(() => conflitosDaCampanha(conflitos, campanha?.id ?? ""), [conflitos, campanha]);
  const resumo = useMemo(
    () =>
      resumoDoPadrao({
        ordem,
        base: baseDaPrevia,
        estados: estados ?? [],
        conflitos: daCampanha.jids,
        tamanhoDoPool: campanha?.groupIds.length ?? 0,
      }),
    [ordem, baseDaPrevia, estados, daCampanha, campanha],
  );
  const loteDesta = resultado && progresso?.batchId === resultado.batchId ? progresso : null;

  const mensagem = !resultado
    ? ""
    : resultado.renomes === 0
      ? "Ordem salva. Nenhum nome precisava mudar."
      : `Ordem salva. ${resultado.renomes} ${resultado.renomes === 1 ? "grupo vai ser renomeado" : "grupos vão ser renomeados"} aos poucos — cerca de ${Math.max(1, Math.ceil(resultado.renomes / OPS_POR_MINUTO))} min.`;

  async function aplicar() {
    if (!campanha || !validacao.ok) return;
    setEnviando(true);
    setErro(null);
    setListaMudou(false);
    try {
      const res = await fetch(`/api/campanhas/${caminho}/grupos/padronizar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ base: validacao.base, ordem, esperado: campanha.groupIds }),
      });
      if (res.status === 409) setListaMudou(true);
      setResultado(await lerJson<Resultado>(res, "Não foi possível aplicar."));
      await lerProgresso();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar.");
    } finally {
      setEnviando(false);
    }
  }

  const voltar = `/painel/campanhas/${caminho}`;
  const nomesEmConflito = daCampanha.nomes.length;

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 px-4 py-6 sm:px-8">
      <header className="space-y-1.5">
        <p className="text-13 text-slate-600">
          {campanha ? (
            <Link href={voltar} className="transition-colors hover:text-volt-950">
              {campanha.name}
            </Link>
          ) : (
            "Campanha"
          )}{" "}
          / Grupos
        </p>
        <h1 className="font-brand text-28 font-bold tracking-[-0.01em] text-volt-950">Padronizar nomes e sequência</h1>
        <p className="max-w-[760px] text-sm text-slate-600">
          A ordem abaixo vira a ordem do link e o número no nome de cada grupo. Começa pelos lotados, do mais cheio para
          o menos cheio; depois o que está enchendo, os da fila e os vazios. Use as setas para ajustar.
        </p>
      </header>

      <p role="status" data-testid="padronizar-status" className="text-sm font-medium text-volt-950">
        {mensagem}
      </p>

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-aviso-fundo px-4 py-3 text-sm text-alerta">
          <span>{erro}</span>
          {listaMudou && (
            <button
              type="button"
              onClick={() => void carregar()}
              className="min-h-11 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-sm font-medium text-volt-950"
            >
              Recarregar a lista
            </button>
          )}
        </div>
      )}

      {naoAchou ? (
        <p className="text-sm text-slate-600">Campanha não encontrada.</p>
      ) : estados === null ? (
        erro ? null : <p className="text-sm text-slate-600">Carregando os grupos…</p>
      ) : resultado ? (
        <section aria-label="Aplicando" className="pn-card space-y-4 rounded-xl p-5">
          {loteDesta && loteDesta.total > 0 && (
            <div data-testid="padronizar-progresso">
              <div className="flex items-center justify-between text-13 text-slate-600">
                <span>{loteDesta.pending > 0 ? "Renomeando" : "Renomeação concluída"}</span>
                <span className="font-data tabular-nums text-volt-950">
                  {loteDesta.done + loteDesta.failed} de {loteDesta.total}
                </span>
              </div>
              <div className="pn-poco mt-1.5 h-2 w-full overflow-hidden rounded-full">
                <div
                  className="pn-fill h-full w-full rounded-full"
                  style={{
                    transform: `scaleX(${Math.max((loteDesta.done + loteDesta.failed) / loteDesta.total, 0.02)})`,
                  }}
                />
              </div>
              {loteDesta.failed > 0 && (
                <p className="mt-1.5 text-13 text-atencao">
                  {loteDesta.failed} não mudaram de nome (sem admin ou o WhatsApp recusou). Padronize de novo para
                  tentar só neles.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Link
              href={voltar}
              className="inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-4 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
            >
              Voltar para a campanha
            </Link>
            <button
              type="button"
              onClick={() => {
                setResultado(null);
                void carregar();
              }}
              className="min-h-11 rounded-lg border border-line-200 bg-paper-0 px-4 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
            >
              Padronizar de novo
            </button>
          </div>
        </section>
      ) : estados.length === 0 ? (
        <p className="text-sm text-slate-600">Esta campanha ainda não tem grupos.</p>
      ) : (
        <>
          <section aria-label="Nome base" className="pn-card flex flex-wrap items-end gap-4 rounded-xl p-5">
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
              <label htmlFor="padronizar-base" className="text-sm font-semibold text-volt-950">
                Nome base
              </label>
              <input
                id="padronizar-base"
                type="text"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                aria-invalid={!validacao.ok}
                aria-describedby={validacao.ok ? undefined : "padronizar-base-erro"}
                className="min-h-11 rounded-lg border border-line-200 bg-paper-0 px-3 text-base text-volt-950"
              />
              {!validacao.ok && (
                <p id="padronizar-base-erro" className="text-13 text-alerta">
                  {validacao.error}
                </p>
              )}
            </div>
            <div className="flex min-w-0 flex-[2_1_380px] flex-col gap-1">
              <span className="text-13 text-slate-600">Fica assim</span>
              <span className="break-words font-data text-sm text-volt-950">
                {baseDaPrevia} 1, {baseDaPrevia} 2, {baseDaPrevia} 3…
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOrdem(ordemPadrao(estados))}
              className="min-h-11 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
            >
              Ordenar por membros de novo
            </button>
          </section>

          <section aria-label="Resumo" className="pn-card grid grid-cols-1 rounded-xl sm:grid-cols-3">
            <Celula rotulo="Mudam de nome">
              <span className="font-brand text-28 font-bold tabular-nums text-volt-950">{resumo.mudam}</span>
            </Celula>
            <Celula rotulo="Já estão certos">
              <span className="font-brand text-28 font-bold tabular-nums text-volt-950">{resumo.jaCertos}</span>
            </Celula>
            <Celula rotulo="Próximo grupo criado sozinho">
              <span className="break-words font-brand text-20 font-bold text-volt-950">{resumo.proximo}</span>
            </Celula>
          </section>

          {nomesEmConflito > 0 && (
            <div role="note" className="flex items-start gap-2.5 rounded-xl bg-aviso-fundo px-4 py-3 text-sm text-atencao">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{listaPtBr.format(daCampanha.nomes)}</strong> também {nomesEmConflito === 1 ? "está" : "estão"} em{" "}
                {listaPtBr.format(daCampanha.outras)}: {nomesEmConflito === 1 ? "entra" : "entram"} na ordem, mas não{" "}
                {nomesEmConflito === 1 ? "é renomeado" : "são renomeados"} até você{" "}
                <Link href={`${CONFLITOS_HREF}?de=${caminho}`} className="font-semibold underline">
                  escolher onde ficam
                </Link>
                .
              </span>
            </div>
          )}

          <p className="text-13 text-slate-600">
            Em cada grupo renomeado os membros veem a linha “Você mudou o nome do grupo”. Os nomes mudam aos poucos,
            pela mesma fila das ações em massa; a ordem do link muda na hora.
          </p>

          <section aria-label="Prévia da sequência" className="pn-card overflow-x-auto rounded-xl">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-13 text-slate-600">
                  <th scope="col" className="px-4 py-2.5 font-medium">Nº</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Nome atual</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Nome novo</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Membros</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Ordem</th>
                </tr>
              </thead>
              <tbody>
                {resumo.linhas.map((linha) => {
                  const indice = linha.numero - 1;
                  return (
                    <tr key={linha.jid} data-testid="padronizar-linha" data-jid={linha.jid} className="border-b last:border-b-0">
                      <td className="px-4 py-1.5 font-data font-medium">{linha.numero}</td>
                      <td className="px-4 py-1.5 text-slate-600">{linha.atual}</td>
                      <td className="px-4 py-1.5">
                        <span className={cn("font-medium", linha.decisao === "muda" ? "text-volt-950" : "text-slate-600")}>
                          {linha.novo}
                        </span>
                        {NOTA_DA_DECISAO[linha.decisao] && (
                          <span className="ml-2 text-13 text-slate-600">{NOTA_DA_DECISAO[linha.decisao]}</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right font-data text-13 tabular-nums">
                        {linha.membros.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-1.5">
                        <ChipDeEstado estado={linha.estado} />
                      </td>
                      <td className="px-4 py-1.5">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Subir ${linha.atual}`}
                            disabled={indice === 0}
                            onClick={() => setOrdem((atual) => mover(atual, indice, -1))}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-200 bg-paper-0 text-volt-950 disabled:opacity-35"
                          >
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Descer ${linha.atual}`}
                            disabled={indice === ordem.length - 1}
                            onClick={() => setOrdem((atual) => mover(atual, indice, 1))}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-200 bg-paper-0 text-volt-950 disabled:opacity-35"
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="flex flex-wrap justify-end gap-2.5">
            <Link
              href={voltar}
              className="inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-4 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
            >
              Cancelar
            </Link>
            <button
              type="button"
              onClick={() => void aplicar()}
              disabled={!validacao.ok || enviando || ordem.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-cobalt-500 px-4 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {resumo.mudam > 0
                ? `Renomear ${resumo.mudam} ${resumo.mudam === 1 ? "grupo" : "grupos"} e salvar a ordem`
                : "Salvar a ordem"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** botão na campanha (`src/app/painel/campanhas/[slug]/page.tsx`) — import:

  Antes:
```tsx
  Loader2,
} from "lucide-react";
```
  Depois:
```tsx
  Loader2,
  ListOrdered,
} from "lucide-react";
```

  (Se o PR 4/5 mudou a lista de ícones, só acrescentar `ListOrdered` ao import de `lucide-react`.)

- [ ] **Step 3:** o link, ao lado do Postar (mockup `Main.dc.html`). O header real tem "Postar em N grupos", não "Postar nos grupos"; o Padronizar entra antes dele:

  Antes:
```tsx
            <AjudaPainel />
```
  Depois:
```tsx
            <AjudaPainel />
            {o.groupCount > 0 && (
              <Link
                href={`/painel/campanhas/${encodeURIComponent(campanha.slug ?? campanha.id)}/padronizar`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
              >
                <ListOrdered className="h-4 w-4" aria-hidden="true" /> Padronizar nomes e sequência
              </Link>
            )}
```

  (`h-10` como os vizinhos do cabeçalho — "Editar campanha" e o Postar —, para a linha não desalinhar.)

- [ ] **Step 4:** `CONFLITOS_HREF` — se a Task 0 Step 6 achou outro caminho para a tela de conflitos do PR 6, trocar o valor da constante no arquivo do Step 1 (uma linha).

- [ ] **Step 5:** fixture da rota dinâmica (`e2e/fixtures-dinamicas.ts`):

  Antes:
```ts
  "/painel/campanhas/[slug]/editar": fixtureCampanhaEdicao(),
```
  Depois:
```ts
  "/painel/campanhas/[slug]/editar": fixtureCampanhaEdicao(),
  // Campanha recém-criada não tem grupos: a tela mostra o nome no caminho
  // ("<campanha> / Grupos") e "ainda não tem grupos"; slug inexistente mostra só
  // "Campanha não encontrada." — é essa diferença que o contraste mede.
  "/painel/campanhas/[slug]/padronizar": fixtureCampanha(),
```

- [ ] **Step 6:** tipos, lint e lint da Vitrine:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```
```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.e2e.json
```
```powershell
Set-Location <wt>\apps\web; npm run lint
```
```powershell
Set-Location <wt>\apps\web; npx tsx scripts/check-painel-vitrine.ts
```

  Esperado: exit 0 nos quatro; `painel:check OK` (nenhum fundo Acid novo: o do Lotado mora no `ChipDeEstado`).

- [ ] **Step 7:** commit.

```powershell
git -C <wt> add "apps/web/src/app/painel/campanhas/[slug]/padronizar/page.tsx" "apps/web/src/app/painel/campanhas/[slug]/page.tsx" apps/web/e2e/fixtures-dinamicas.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 3 arquivos.

```powershell
git -C <wt> commit -m @'
feat(painel): standardize names and sequence page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 7: E2E do Padronizar

**Files:** criar `e2e/painel-campanha-padronizar.spec.ts`
**Depends-on:** Task 6

Estratégia: campanha **própria** do run, com dois grupos do tenant de E2E que não estão em campanha nenhuma (o trigger de exclusividade do PR 6 recusaria grupo de outra campanha). Apagar a campanha no `finally` leva junto os jobs (`group_bulk_jobs.campaign_group_id … on delete cascade`). O tenant de E2E pode não ter instância conectada: os jobs ficam `queued` e somem com a campanha — o spec cobra a ordem salva, o molde e os jobs criados, **não** o rename no WhatsApp. Expectativas **derivadas** das APIs em runtime (nada de número fixo — `painel-campanha-acoes-em-massa.spec.ts`).

- [ ] **Step 1:** criar `e2e/painel-campanha-padronizar.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * "Padronizar nomes e sequência" de ponta a ponta, menos o WhatsApp: a tela
 * mostra a prévia, as setas mudam a ordem, e aplicar grava no banco a ordem QUE A
 * TELA MOSTRAVA, o molde "<base> {n}" e um job `set_subject` por grupo que muda.
 *
 * Campanha própria do run, com dois grupos fora de qualquer campanha (o trigger
 * de exclusividade recusaria grupo alheio). Apagada no fim — os jobs caem junto
 * (on delete cascade). Sem instância no tenant de E2E os jobs ficam na fila: o
 * rename de verdade é conferido em produção (spec §11 item 4).
 */

type Campanha = {
  id: string;
  slug?: string;
  groupIds: string[];
  growTemplate?: Record<string, unknown> | null;
};
type Estado = { whatsappGroupId: string; nome: string; isAdmin: boolean };

exigeCredenciais();

async function lerJson<T>(page: Page, url: string): Promise<T> {
  const res = await page.request.get(url);
  expect(res.ok(), `GET ${url} respondeu ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

test("padronizar salva a ordem da tela, o molde e um renome por grupo que muda", async ({ page }, testInfo) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const campanhas = await lerJson<Campanha[]>(page, "/api/campanhas");
  const grupos = await lerJson<Array<{ id: string }>>(page, "/api/groups");
  const emCampanha = new Set(campanhas.flatMap((c) => c.groupIds));
  const livres = grupos.map((g) => g.id).filter((id) => !emCampanha.has(id)).slice(0, 2);
  test.skip(livres.length < 2, "O tenant de E2E precisa de 2 grupos fora de qualquer campanha.");

  const sufixo = Date.now().toString(36);
  const criada = await page.request.post("/api/campanhas", {
    data: { name: `E2E padronizar ${sufixo}`, groupIds: livres },
  });
  expect(criada.ok(), `POST /api/campanhas respondeu ${criada.status()}: ${await criada.text()}`).toBeTruthy();
  const campanha = (await criada.json()) as { id: string; slug?: string };
  const slug = campanha.slug ?? campanha.id;

  try {
    // A porta de entrada é o botão do cabeçalho da campanha.
    await page.goto(`/painel/campanhas/${slug}`);
    await page.getByRole("link", { name: "Padronizar nomes e sequência" }).click();
    await expect(page).toHaveURL(new RegExp(`/painel/campanhas/${slug}/padronizar$`));

    const linhas = page.getByTestId("padronizar-linha");
    await expect(linhas).toHaveCount(2);

    const base = `E2E Padrao ${sufixo}`;
    await page.getByLabel("Nome base").fill(base);
    await expect(page.getByText(`${base} 1, ${base} 2, ${base} 3…`)).toBeVisible();

    // Nome acessível é contrato: "Subir <nome>" / "Descer <nome>".
    const antes = await linhas.evaluateAll((els) => els.map((el) => el.getAttribute("data-jid") ?? ""));
    await expect(linhas.nth(0).getByRole("button", { name: /^Subir / })).toBeDisabled();
    await expect(linhas.nth(1).getByRole("button", { name: /^Descer / })).toBeDisabled();
    await linhas.nth(0).getByRole("button", { name: /^Descer / }).click();
    const depois = await linhas.evaluateAll((els) => els.map((el) => el.getAttribute("data-jid") ?? ""));
    expect(depois).toEqual([antes[1], antes[0]]);

    // 390 px: a página não rola de lado (a tabela rola dentro do cartão).
    await page.setViewportSize({ width: 390, height: 844 });
    const semRolagemLateral = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(semRolagemLateral, "a tela do Padronizar rola de lado em 390 px").toBe(true);
    await testInfo.attach("padronizar-390", { body: await page.screenshot(), contentType: "image/png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await testInfo.attach("padronizar-1280", { body: await page.screenshot(), contentType: "image/png" });

    // O que o servidor DEVE enfileirar, derivado das APIs que a tela também lê.
    const { grupos: estados } = await lerJson<{ grupos: Estado[] }>(page, `/api/campanhas/${slug}/grupos/estados`);
    const { conflitos } = await lerJson<{ conflitos: Array<{ whatsappGroupId: string }> }>(
      page,
      "/api/campanhas/conflitos",
    );
    const emConflito = new Set(conflitos.map((c) => c.whatsappGroupId));
    const renomesEsperados = depois.filter((jid, i) => {
      const estado = estados.find((e) => e.whatsappGroupId === jid);
      return Boolean(estado?.isAdmin) && !emConflito.has(jid) && estado?.nome !== `${base} ${i + 1}`;
    }).length;

    await page.getByRole("button", { name: /salvar a ordem/ }).click();
    await expect(page.getByTestId("padronizar-status")).toContainText("Ordem salva");

    const salva = (await lerJson<Campanha[]>(page, "/api/campanhas")).find((c) => c.id === campanha.id);
    expect(salva?.groupIds, "a ordem gravada não é a que a tela mostrava").toEqual(depois);
    expect(salva?.growTemplate?.subjectPattern).toBe(`${base} {n}`);
    expect(typeof salva?.growTemplate?.padronizadoEm).toBe("string");

    const lote = await lerJson<{ total: number; actions: string[] } | null>(page, `/api/campanhas/${slug}/grupos/lotes`);
    if (renomesEsperados === 0) {
      // Nenhum grupo administrado: nada a renomear, e nenhum lote inventado.
      expect(lote?.total ?? 0).toBe(0);
    } else {
      expect(lote?.total).toBe(renomesEsperados);
      expect(lote?.actions).toEqual(["set_subject"]);
    }
  } finally {
    await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
```

- [ ] **Step 2:** tipos dos specs:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.e2e.json
```

  Esperado: exit 0.

- [ ] **Step 3:** commit.

```powershell
git -C <wt> add apps/web/e2e/painel-campanha-padronizar.spec.ts
```
```powershell
git -C <wt> diff --cached --stat
```

  Esperado: 1 arquivo.

```powershell
git -C <wt> commit -m @'
test(e2e): standardize saves order and enqueues renames

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 8: verificação local, visual e revisão

**Files:** nenhum.
**Depends-on:** Tasks 1–7

Em worktree, nada de `preview_start` nem do pane do app (servem o checkout principal). O Playwright do próprio worktree sobe o app e fotografa.

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez: `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.e2e.json`, `npm run lint`, `npm test`, `npx tsx scripts/check-painel-vitrine.ts`. Esperado: tudo exit 0.

- [ ] **Step 2:** nenhum E2E de outro run batendo no banco de dev agora:

```powershell
gh run list --repo codingB0y/Girumo --workflow Verify --status in_progress --json databaseId,headBranch
```

  Lista não vazia → esperar terminar.

- [ ] **Step 3:** dev server do worktree numa porta própria, em background (`run_in_background: true`):

```powershell
Set-Location <wt>\apps\web; npx next dev -p 3005
```

  Esperar: `Invoke-WebRequest http://localhost:3005/login -UseBasicParsing | Select-Object StatusCode` → 200.

- [ ] **Step 4:** specs desta tela, da rota dinâmica e das ações em massa (o hook da Task 5):

```powershell
Set-Location <wt>\apps\web; $env:E2E_BASE_URL = "http://localhost:3005"; npx playwright test e2e/painel-campanha-padronizar.spec.ts e2e/painel-rotas-dinamicas.spec.ts e2e/painel-campanha-acoes-em-massa.spec.ts --project=chromium
```

  Esperado: verde. Skip por credencial → a prova fica no artefato `e2e-report` do CI (Task 9). Skip de "2 grupos fora de qualquer campanha" → anotar no PR (a prova da tela fica na verificação em produção, Task 9).

- [ ] **Step 5:** ler as capturas (`Get-ChildItem <wt>\apps\web\e2e-report\data\*.png | Sort-Object LastWriteTime -Descending | Select-Object -First 2`, abrir com Read) e conferir contra `Padronizar.dc.html`: caminho "<campanha> / Grupos", h1 28/700 Manrope, cartão do nome base com "Fica assim" em mono e "Ordenar por membros de novo", faixa de 3 números (28 px) com "Próximo grupo criado sozinho", nota "Você mudou o nome do grupo", tabela Nº/Nome atual/Nome novo/Membros/Estado/Ordem com setas de 44 px, Acid só no chip Lotado, "Cancelar" + botão Cobalt; 390 sem rolagem lateral. Defeito → corrigir no componente, commitar (`fix(painel): …`), repetir Steps 4–5.

- [ ] **Step 6:** derrubar o dev server pelo PID (o `TaskStop` não mata o `next dev`):

```powershell
Get-NetTCPConnection -LocalPort 3005 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

- [ ] **Step 7:** o gate real:

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`.

- [ ] **Step 8:** revisão final do diff inteiro (a revisão por task não vê a costura — `pattern-revisao-final-pega-o-que-revisao-por-task-nao-ve`): superpowers:requesting-code-review sobre `git -C <wt> diff origin/main...HEAD`, com foco em (1) tela e rota contam igual (`decidir` único); (2) nenhum caminho grava `group_ids` ou enfileira renome quando `reordenar_campanha` devolve false ou há grow em voo; (3) `padronizadoEm` sobrevive aos três escritores de `grow_template` (Padronizar, identidade, config); (4) filtros de tenant em toda leitura/escrita nova. CRITICAL/HIGH → corrigir e commitar.

- [ ] **Step 9:** defasagem (`git -C <wt> fetch origin main`; `git -C <wt> log HEAD..origin/main --oneline`). Commits novos → `git -C <wt> merge origin/main` e repetir Steps 1 e 7. `git -C <wt> status --short` limpo; `git -C <wt> log origin/main..HEAD --oneline` com os 7 commits (mais os `fix` da Task 8, se houve).

---

### Task 9: PR, merge, verificação em produção e quadro

**Files:** nenhum.
**Depends-on:** Task 8

- [ ] **Step 1:** push:

```powershell
git -C <wt> push -u origin feat/postar-grupo-padronizar
```

- [ ] **Step 2:** PR:

```powershell
$corpo = @'
## O que entra

PR 8 de 9 do "Postar por grupo" (spec `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` §6.7, D9). "Padronizar nomes e sequência" na campanha:

- Regras puras em `lib/groups/padronizar.ts` (ordem sugerida, validação da base, renomes, prévia) — a tela e a rota usam as mesmas, então "Mudam de nome" = jobs criados.
- `POST /api/campanhas/[slug]/grupos/padronizar`: salva a ordem do link (`reordenar_campanha`; lista mudou → 409), enfileira um lote `set_subject` só com quem muda de nome (pula grupo em duas campanhas e grupo sem admin), grava `grow_template.subjectPattern = "<base> {n}"` e `padronizadoEm`. Grupo novo nascendo na hora → 409.
- `nextSeq` conta só a fila depois de `padronizadoEm`: o próximo grupo do auto-grow nasce `<base> <N+1>`.
- `PATCH /api/campanhas` passa a MESCLAR o `growTemplate` (antes substituía: cada salvar da tela de configuração apagava `desc`/`mediaId` da identidade e apagaria o `padronizadoEm`).
- Tela do mockup em `/painel/campanhas/<slug>/padronizar`, botão no cabeçalho da campanha; progresso pelo `GET …/grupos/lotes` (hook extraído de `acoes-em-massa.tsx`, que ganhou o rótulo "renomeação").

## Pré-requisito de deploy

Worker já redeployado com o PR 7 (conferido na Task 0 Step 4). Sem ele, renome vira `done` sem renomear.

## Teste

- [x] `padronizar.test.ts`, `group-grow-jobs.test.ts`, `group-grow-store.test.ts`, `campanhas/route.test.ts`, `grupos/padronizar/route.test.ts` (Supabase falso; mutantes do grow em voo e do reordenar=false derrubam)
- [x] tsc x2, lint, npm test, painel:check, verify-local.ps1
- [x] e2e `painel-campanha-padronizar.spec.ts`, `painel-rotas-dinamicas.spec.ts`, `painel-campanha-acoes-em-massa.spec.ts` (local ou CI)
- [ ] CI verde
- [ ] Verificação em produção (spec §11 item 4)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```
```powershell
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-padronizar --title "feat(campanhas): standardize group names and sequence" --body $corpo
```

- [ ] **Step 3:** CI: `gh pr checks <N> --repo codingB0y/Girumo`. Conferir no `e2e-report` do CI que `painel-campanha-padronizar.spec.ts` **rodou** (não skip); se pulou por falta de grupos livres, escrever isso num comentário do PR.

#### Comandos para o Igor

Merge (à mão, com tudo verde):

```powershell
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

Verificação em produção (spec §11 item 4), **depois** de `/admin/configuracoes` → "Deploy" mostrar um commit que contém o merge (verificar logo após o merge mede o binário antigo):

1. Em `/painel/campanhas/<slug-da-Moda-Kids-do-Sul>`, "Padronizar nomes e sequência". Conferir a prévia (lotados primeiro, do mais cheio ao menos cheio; enchendo; fila; vazios), o aviso amarelo se houver grupo em duas campanhas, e o "Próximo grupo criado sozinho". **Renomear é visível para os membros** ("Você mudou o nome do grupo"): aplicar só com a base decidida.
2. Acompanhar "Renomeando X de N" até o fim (~N/15 min).
3. Leitura em prod:

```sql
select c.grow_template->>'subjectPattern' as molde,
       c.grow_template->>'padronizadoEm'  as padronizado_em,
       (select json_object_agg(j.status, j.n)
          from (select b.status, count(*) as n
                  from public.group_bulk_jobs b
                 where b.tenant_id = c.tenant_id
                   and b.campaign_group_id = c.id
                   and b.action = 'set_subject'
                   and b.created_at >= (c.grow_template->>'padronizadoEm')::timestamptz - interval '1 minute'
                 group by b.status) j) as renomes
  from public.campaign_groups c
 where c.tenant_id = '<tenant-id>' and c.slug = '<slug>';
```

  Esperado: `molde = "<base> {n}"`, `padronizado_em` preenchido, `renomes` só com `done` (e `failed` explicável: sem admin/403).

```sql
select u.pos, g.name, g.display_name_base, g.display_number
  from public.campaign_groups c
 cross join lateral unnest(c.group_ids) with ordinality as u(jid, pos)
  join public.groups g on g.tenant_id = c.tenant_id and g.whatsapp_group_id = u.jid
 where c.tenant_id = '<tenant-id>' and c.slug = '<slug>'
 order by u.pos;
```

  Esperado: `name = "<base> <pos>"` nos renomeados, `display_name_base = ''` e `display_number = 0` neles.

4. No celular: dois grupos renomeados com o nome novo e a linha "Você mudou o nome do grupo"; no painel, o mesmo nome na aba Grupos.
5. Quando o auto-grow criar o próximo grupo (não dá para forçar), ele nasce `<base> <N+1>` — conferir quando acontecer e anotar no card.

Quadro (prod). Se os itens 1, 2, 3 e 5 do §11 **já** foram verificados (PRs 2, 4, 5, 9 no ar e conferidos), a feature fecha:

```sql
select public.move_card('postar-por-grupo', 'no_ar_verificado', 'Padronizar verificado em prod: nomes mudaram no WhatsApp e no painel, subjectPattern e padronizadoEm gravados (spec §11 item 4); itens 1–3 e 5 já verificados', '<link da prova: print do grupo renomeado + saída do SQL>');
```
```sql
update public.board_features set blocker = null where key = 'postar-por-grupo';
```

  Se ainda falta algum item (ex.: o PR 9 não subiu):

```sql
select public.move_card('postar-por-grupo', 'em_construcao', 'PR 8 no ar e verificado (§11 item 4: Padronizar renomeia no WhatsApp e no painel)', 'PR #<N>');
```
```sql
update public.board_features set blocker = '<o que falta: ex. PR 9 (aviso ao lotar) e §11 item 5>' where key = 'postar-por-grupo';
```

Grafo (PowerShell, na raiz do checkout principal):

```powershell
rag insert "decisão: Padronizar (postar por grupo, PR 7/8) renomeia pela fila de ações em massa (set_subject), o nome no banco só muda no ack done; salva a ordem com reordenar_campanha (lista mudou = 409, grow em voo = 409); grava grow_template.subjectPattern '<base> {n}' e padronizadoEm, e nextSeq conta só jobs criados depois dele; PATCH /api/campanhas mescla growTemplate" --source decisao-2026-10-10-padronizar
```

Ao encerrar: "PRs que deixei abertos: …".

---

## Self-review contra spec e contratos

- **D9:** nome base + prévia ordenada (lotados por membros desc → enchendo → fila por membros desc → vazios; empate pela posição) — Task 1 `ordemPadrao`; setas — Task 6 (`mover`, aria "Subir/Descer <nome>", desabilitadas nas pontas); aplicar renomeia aos poucos pela fila anti-ban (PR 7 + Task 4), salva a ordem (Task 4), auto-grow cria "<base> <n+1>" (Task 2); ordem fixa depois (`ordemInicial` volta na ordem salva); conflito não renomeia (Task 1 `decidir`, Task 4 teste, aviso da Task 6). ✔
- **§6.7 worker:** `setSubject` com contrato lido no fonte (Task 1–2), `case "set_subject"` com erro sem `subject` (Task 3), `subject` no claim (Task 5 — o mapeamento mora em `claimBulk`, não em `bulk-deps.ts`), `ackBulk` no `done` grava `name` e limpa `display_name_base`/`display_number` (Task 5). ✔
- **§6.7 app:** `ordemPadrao`/`planejarRenomes`/`validarBase` com as assinaturas do contrato §5 (objeto de entrada com `estados`, que vence a assinatura posicional do spec); rota com corpo/respostas do contrato §4; `nextSeq(…, desde?)` do contrato §5; `padronizadoEm` no `grow_template`; tela do mockup com progresso pelo `GET …/grupos/lotes`. ✔
- **§7 bordas:** auto-grow anexa grupo durante o Padronizar → 409 (Task 4); renome falha → job `failed`, nome no banco intacto, ordem já salva (Tasks 4–5); grupo em duas campanhas fora dos renomes (Tasks 1, 4). ✔
- **§8 testes:** `padronizar.ts` (Task 1), `bulk-loop` `set_subject` (Task 3), `evolution-groups` URL e corpo (Task 2). ✔
- **§9:** PR 7 depende do 1; PR 8 de 4, 6, 7 (e do 2, de onde vêm `estado.ts` e o store de estados — contratos §3). Sem DDL. ✔
- **§11 item 4:** Task 9. ✔
- **Fora do spec, acrescentado e justificado:** `default` no `applyJob` e `setSubject` no dry-run (Review Focus 1); merge do `growTemplate` no PATCH (Review Focus 2); 409 com grow em voo (Review Focus 3); `{n}` e controle recusados na base (Review Focus 4); fixture da rota dinâmica (o `painel-rotas-dinamicas.spec.ts` reprovaria sem ela); hook de progresso extraído (reuso pedido em vez de cópia).
