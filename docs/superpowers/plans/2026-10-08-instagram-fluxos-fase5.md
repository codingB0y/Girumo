# Fluxos do Instagram — fase 5 — plano de implementação (mapa editável)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** no desktop, a visão "Mapa" deixa de ser só leitura: o lojista monta um fluxo do zero arrastando blocos (direct, convite, "segue a loja?"), liga saídas a blocos puxando uma linha, arrasta pra reposicionar, apaga, e edita o bloco selecionado num painel ao lado. O celular continua com o mapa só leitura.

**Architecture:** o grafo continua o mesmo `FlowDef` (`lib/ig/flow/*`), que ganha um mapa opcional de posições (`pos`) guardado no rascunho; `layout()` usa as posições quando todas existem e calcula quando faltam. A edição livre entra como operações nomeadas puras em `edit.ts` (`addNode`, `removeNode`, `connect`, `disconnect`, `moveNode`), e o componente `MapaEditavel` (React Flow, `@xyflow/react`) só traduz gestos em chamadas a essas operações. O autosave, a validação ("Pra publicar") e o passo a passo não mudam: `linearize` e `validateFlow` já aceitam qualquer grafo.

**Tech Stack:** Next 15 (App Router, `apps/web`), React 19, TypeScript strict, zod 4, `@xyflow/react` ^12 (nova dependência, MIT), `node:test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md` (§4.2 "Montar arrastando no mapa", §6 modelo e "posições passam a ser guardadas quando o mapa for editável", §10 tabela das visões, §16 fase 5). Depende da fase 3 mergeada (`docs/superpowers/plans/2026-10-08-instagram-fluxos-fase3.md`): o mapa editável mostra os números da fase 3 e não existe mais o portão `fase_seguinte`.

## Global Constraints

- O `FlowDef` continua `v: 1`: `pos` é opcional e todo rascunho antigo continua válido. **Posição não é comportamento**: mover um bloco não acende "Publicar alteração" (o comparador do editor ignora `pos`).
- Toda edição passa por operação nomeada de `lib/ig/flow/edit.ts` (spec §6): o componente nunca monta `nodes`/`edges` à mão. Operações são puras e devolvem um grafo novo.
- Regras que a edição livre preserva: um gatilho só (não se apaga nem se cria outro); uma ligação por saída (ligar de novo substitui); sem ligação de um bloco pra ele mesmo; só saídas que o bloco tem (`outsOf`). Tudo o mais (bloco solto, ciclo sem condição, segundo direct depois de comentário…) continua sendo a lista "Pra publicar" de `validateFlow`, mostrada em vermelho no bloco do mapa.
- Celular (abaixo de `lg`): mapa só leitura como hoje (spec §10 "Celular: … mapa só leitura"). O editável só monta de `lg` pra cima.
- Direção D: o bloco do mapa editável usa a mesma peça visual do mapa de hoje (`bg-paper-0`, `border-line-200`, `text-volt-950`, `text-slate-600`, `rounded-[10px]`); nada de `rounded-2xl`, `backdrop-blur`, gradiente; `bg-acid` só no Postar (`npm run painel:check`). O CSS do React Flow entra uma vez, no componente, e só o essencial é sobrescrito (fundo da caixa, cor das linhas e dos pontos).
- Nome acessível é contrato de teste: `role="region"` do mapa editável, `role="group" aria-label="Adicionar bloco"`, botão "Tirar bloco", `aria-label` dos pontos de ligação. Renomear exige atualizar o teste no mesmo PR.
- Dependência nova só esta (`@xyflow/react`); nada de dnd-kit, framer ou outra biblioteca de gestos. Sem migração.
- Um PR por assunto, fechado na mesma sessão: **2 PRs** (N modelo, O tela). Commits em inglês com prefixo semântico. O PR O só abre depois do merge do N, a partir de `origin/main`.

## Antes de começar (uma vez)

- [ ] `git fetch origin main`. Confirme que a fase 3 está na `main` (`apps/web/src/lib/ig/numeros.ts` existe e `apps/web/src/lib/ig/flow/fase.ts` não existe).
- [ ] `npm view @xyflow/react version peerDependencies` e confirme que a faixa de `react` aceita 19 (desde 12.3). Instale no PR O, não antes.
- [ ] Trabalhe no worktree da própria sessão. A cada PR: `git fetch origin main` e `git switch -c <branch> origin/main`.
- [ ] Gate (da raiz): `npm --workspace apps/web test`, os dois `tsc` (`tsconfig.json` e `tsconfig.e2e.json`), `npm --workspace apps/web run lint`, `painel:check`, `brand:check`, `npm run scan:secrets`; antes do push, `pwsh -File infra/scripts/verify-local.ps1`.
- [ ] Quadro (prod): ao começar o PR N (o card já existe em `nao_existe`, criado em 08/10 junto com o plano):

```sql
select public.move_card('ig-mapa-editavel', 'em_construcao', 'Fase 5 em implementação (plano docs/superpowers/plans/2026-10-08-instagram-fluxos-fase5.md): PR N posições e operações no modelo, PR O React Flow no editor.', 'plano fase 5');
update public.board_features set blocker = 'Fase 5 em implementação: N modelo (pos + operações), O mapa editável com React Flow.', updated_at = now() where key = 'ig-mapa-editavel';
```

## Mapa de arquivos

| Arquivo | Responsabilidade | PR |
|---|---|---|
| `src/lib/ig/flow/types.ts`, `schema.ts` (+ `schema.test.ts`) | `FlowDef.pos` | N |
| `src/lib/ig/flow/layout.ts` (+ `layout.test.ts`) | usa `pos` quando completo; `comPosicoes(def)` | N |
| `src/lib/ig/flow/edit.ts` (+ `edit.test.ts`) | `addNode`, `removeNode`, `connect`, `disconnect`, `moveNode` | N |
| `src/components/painel/instagram/editor.tsx` | `canonico` ignora `pos` | N |
| `apps/web/package.json` | `@xyflow/react` | O |
| `src/components/painel/instagram/mapa-editavel.tsx`, `bloco-no.tsx` | o mapa editável e o bloco com pontos de ligação | O |
| `src/components/painel/instagram/painel-do-bloco.tsx` | o bloco selecionado no `aside` | O |
| `src/components/painel/instagram/editor.tsx` | monta o editável de `lg` pra cima; seleção; painel | O |
| `apps/web/e2e/painel-instagram.spec.ts` | adicionar bloco pelo mapa | O |

---

## PR N — posições e operações livres no modelo

Branch: `feat/ig-fase5-modelo`. Entrega: `pos` no grafo, `layout` que respeita posições, cinco operações novas em `edit.ts`, tudo puro e testado. Nada muda na tela além de o comparador ignorar `pos`.

### Task 1: `FlowDef.pos` no tipo e no esquema

**Files:**
- Modify: `apps/web/src/lib/ig/flow/types.ts` (`FlowDef`)
- Modify: `apps/web/src/lib/ig/flow/schema.ts` (`flowDefSchema`)
- Modify: `apps/web/src/lib/ig/flow/schema.test.ts` (um teste a mais)

**Interfaces:**
- Produces: `export type Pos = { x: number; y: number }`; `FlowDef = { v: 1; nodes: FlowNode[]; edges: FlowEdge[]; pos?: Record<string, Pos> }`.

- [ ] **Step 1: Write the failing test** (no fim de `schema.test.ts`)

```ts
test("pos é opcional, por id de bloco, com x e y finitos", () => {
  const base = { v: 1, nodes: [{ id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false }], edges: [] };
  assert.equal(parseFlowDef(base).ok, true);
  assert.equal(parseFlowDef({ ...base, pos: { gatilho: { x: 30, y: 30 } } }).ok, true);
  assert.equal(parseFlowDef({ ...base, pos: { gatilho: { x: "30", y: 30 } } }).ok, false);
  assert.equal(parseFlowDef({ ...base, pos: { gatilho: { x: 30, y: 30, z: 1 } } }).ok, false);
  assert.equal(parseFlowDef({ ...base, pos: { "Id Inválido": { x: 1, y: 1 } } }).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/flow/schema.test.ts`
Expected: FAIL (`pos` recusado pelo `strictObject`).

- [ ] **Step 3: Type and schema**

Em `types.ts`:

```ts
export type Pos = { x: number; y: number };
export type FlowDef = {
  v: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Posição de cada bloco no mapa, só quando o lojista mexeu no mapa editável (fase 5). Faltando, `layout()` calcula. */
  pos?: Record<string, Pos>;
};
```

Em `schema.ts`, `flowDefSchema`:

```ts
const pos = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const flowDefSchema = z.strictObject({
  v: z.literal(1),
  nodes: z.array(flowNodeSchema).min(1).max(MAX_NODES),
  edges: z.array(flowEdgeSchema).max(MAX_NODES * 2),
  pos: z.record(id, pos).optional(),
});
```

- [ ] **Step 4: Run tests, type-check**

Run: `npm --workspace apps/web test` e os dois `tsc`.
Expected: verde (`FlowDef` literais sem `pos` continuam válidos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/flow/types.ts apps/web/src/lib/ig/flow/schema.ts apps/web/src/lib/ig/flow/schema.test.ts
git commit -m "feat(ig): optional node positions on the flow definition"
```

### Task 2: `layout` respeita posições; `comPosicoes`

**Files:**
- Modify: `apps/web/src/lib/ig/flow/layout.ts`
- Modify: `apps/web/src/lib/ig/flow/layout.test.ts` (dois testes a mais)

**Interfaces:**
- Produces: `layout(def)` devolve as posições de `def.pos` quando **todos** os blocos têm uma; `comPosicoes(def): FlowDef` grava no `pos` as posições calculadas (sem mudar as que já existem).

- [ ] **Step 1: Write the failing tests** (no fim de `layout.test.ts`; use a receita que o arquivo já importa ou `RECIPES.comment_follow_invite.build()`)

```ts
test("com pos completo o mapa usa as posições guardadas e o tamanho acompanha", () => {
  const def = RECIPES.comment_invite.build();
  const comPos = { ...def, pos: { gatilho: { x: 100, y: 40 }, convite: { x: 600, y: 300 } } };
  const l = layout(comPos);
  assert.deepEqual(l.nodes.map((n) => [n.id, n.x, n.y]), [["gatilho", 100, 40], ["convite", 600, 300]]);
  assert.equal(l.width, 600 + NODE_W + PAD);
  assert.equal(l.height, 300 + NODE_H + PAD);
  assert.equal(l.edges.length, 1);
});

test("pos incompleto é ignorado; comPosicoes completa sem sobrescrever", () => {
  const def = RECIPES.comment_invite.build();
  const parcial = { ...def, pos: { gatilho: { x: 999, y: 999 } } };
  assert.equal(layout(parcial).nodes[0].x, PAD, "calculado, não 999");
  const completo = comPosicoes(parcial);
  assert.deepEqual(completo.pos?.gatilho, { x: 999, y: 999 });
  assert.deepEqual(completo.pos?.convite, { x: PAD + COL_PITCH, y: PAD });
  assert.equal(layout(completo).nodes[0].x, 999);
});
```

(importe `comPosicoes`, `COL_PITCH`, `NODE_H`, `NODE_W`, `PAD` de `./layout`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/flow/layout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Em `layout.ts`, renomeie a função atual para `calcular(def: FlowDef): Layout` (sem `export`) e acrescente:

```ts
import type { FlowDef, FlowOut, Pos } from "./types";

/** Tipo de uma ligação pelo que ela é no grafo, quando as posições vêm do lojista. */
function tipoDaAresta(def: FlowDef, from: string, out: FlowOut, to: string): EdgePos["kind"] {
  const trilha = new Set(linearize(def).map((p) => p.node.id));
  if (!trilha.has(to) && trilha.has(from)) return "desvio";
  if (MAIN_OUTS.includes(out)) return "principal";
  return "desvio";
}

/**
 * Com posição guardada para TODOS os blocos (mapa editável, fase 5), usa-as; a
 * caixa cresce até o bloco mais à direita e mais abaixo. Faltando alguma, calcula
 * tudo (um bloco novo sem posição não pode cair em cima de outro).
 */
export function layout(def: FlowDef): Layout {
  const pos = def.pos;
  if (!pos || !def.nodes.every((n) => pos[n.id])) return calcular(def);
  const nodes: NodePos[] = def.nodes.map((n, i) => ({ id: n.id, coluna: i, linha: 0, x: pos[n.id].x, y: pos[n.id].y }));
  const ids = new Set(def.nodes.map((n) => n.id));
  const edges: EdgePos[] = def.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ from: e.from, out: e.out, to: e.to, kind: tipoDaAresta(def, e.from, e.out, e.to) }));
  return {
    nodes,
    edges,
    width: Math.max(...nodes.map((n) => n.x)) + NODE_W + PAD,
    height: Math.max(...nodes.map((n) => n.y)) + NODE_H + PAD,
  };
}

/** Grava as posições calculadas nos blocos que não têm; as que o lojista já moveu ficam. */
export function comPosicoes(def: FlowDef): FlowDef {
  const calculado = calcular(def);
  const pos: Record<string, Pos> = { ...(def.pos ?? {}) };
  for (const n of calculado.nodes) if (!pos[n.id]) pos[n.id] = { x: n.x, y: n.y };
  // Bloco solto não aparece em `calcular` (a trilha não chega nele): cai numa linha abaixo de tudo.
  let soltos = 0;
  const chao = calculado.height + PAD;
  for (const n of def.nodes) if (!pos[n.id]) pos[n.id] = { x: PAD + soltos++ * COL_PITCH, y: chao };
  return { ...def, pos };
}
```

Importe `MAIN_OUTS` de `./types` junto com os tipos. A ligação "volta" (ciclo pela condição) com posições livres vira `principal`/`desvio` pelo `out`; o traço tracejado só existe no layout calculado.

- [ ] **Step 4: Run tests**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/flow/layout.test.ts`
Expected: PASS (os antigos e os dois novos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/flow/layout.ts apps/web/src/lib/ig/flow/layout.test.ts
git commit -m "feat(ig): layout honours stored positions; comPosicoes fills the gaps"
```

### Task 3: operações livres — `addNode`, `removeNode`, `connect`, `disconnect`, `moveNode`

**Files:**
- Modify: `apps/web/src/lib/ig/flow/edit.ts` (acrescenta no fim)
- Modify: `apps/web/src/lib/ig/flow/edit.test.ts` (quatro testes a mais)
- Modify: `apps/web/src/components/painel/instagram/editor.tsx` (`canonico`)

**Interfaces:**
- Produces: `TipoNovo = "message" | "invite" | "condition"`; `addNode(def, tipo, pos) → { def: FlowDef; id: string }`; `removeNode(def, id) → FlowDef` (gatilho não sai); `connect(def, from, out, to) → FlowDef` (recusa saída inexistente, laço em si mesmo e alvo inexistente; substitui a ligação da saída); `disconnect(def, from, out) → FlowDef`; `moveNode(def, id, pos) → FlowDef`.

- [ ] **Step 1: Write the failing tests** (no fim de `edit.test.ts`)

```ts
test("addNode cria o bloco com texto padrão, id novo e posição; removeNode tira o bloco, as ligações e a posição, mas nunca o gatilho", () => {
  const base = RECIPES.blank.build();
  const { def: comDirect, id } = addNode(base, "message", { x: 300, y: 30 });
  assert.equal(id, "direct");
  const no = comDirect.nodes.find((n) => n.id === id);
  assert.deepEqual(no, { id: "direct", type: "message", text: DEFAULT_TEXTS.pedeResposta, button: null, wait: null });
  assert.deepEqual(comDirect.pos?.direct, { x: 300, y: 30 });
  const { id: id2 } = addNode(comDirect, "message", { x: 0, y: 0 });
  assert.equal(id2, "direct_2");
  const { def: comConvite, id: convite } = addNode(comDirect, "invite", { x: 600, y: 30 });
  assert.equal(convite, "convite");
  const ligado = connect(connect(comConvite, "gatilho", "next", "direct"), "direct", "next", "convite");
  const semDirect = removeNode(ligado, "direct");
  assert.deepEqual(semDirect.nodes.map((n) => n.id), ["gatilho", "convite"]);
  assert.deepEqual(semDirect.edges, []);
  assert.equal(semDirect.pos?.direct, undefined);
  assert.equal(removeNode(ligado, "gatilho"), ligado, "o gatilho não sai");
});

test("connect liga uma saída que o bloco tem, substitui a ligação anterior e recusa laço e saída inválida", () => {
  const { def: a, id: direct } = addNode(RECIPES.blank.build(), "message", { x: 1, y: 1 });
  const { def: b, id: convite } = addNode(a, "invite", { x: 2, y: 2 });
  const ligado = connect(b, "gatilho", "next", direct);
  assert.deepEqual(ligado.edges, [{ from: "gatilho", out: "next", to: direct }]);
  const trocado = connect(ligado, "gatilho", "next", convite);
  assert.deepEqual(trocado.edges, [{ from: "gatilho", out: "next", to: convite }]);
  assert.equal(connect(ligado, direct, "replied", convite), ligado, "direct sem espera não tem 'replied'");
  assert.equal(connect(ligado, direct, "next", direct), ligado, "sem laço em si mesmo");
  assert.equal(connect(ligado, direct, "next", "sumiu"), ligado);
  assert.deepEqual(disconnect(trocado, "gatilho", "next").edges, []);
});

test("condição e convite nascem com as saídas certas; moveNode só muda a posição", () => {
  const { def: a, id: segue } = addNode(RECIPES.blank.build(), "condition", { x: 5, y: 5 });
  assert.deepEqual(a.nodes.find((n) => n.id === segue), { id: "segue", type: "condition", check: "follows" });
  const movido = moveNode(a, segue, { x: 50, y: 60 });
  assert.deepEqual(movido.pos?.segue, { x: 50, y: 60 });
  assert.deepEqual(movido.nodes, a.nodes);
  assert.equal(moveNode(a, "sumiu", { x: 1, y: 1 }), a);
});

test("as operações antigas continuam funcionando num grafo com pos", () => {
  const def = { ...RECIPES.comment_invite.build(), pos: { gatilho: { x: 1, y: 1 }, convite: { x: 2, y: 2 } } };
  const comSegue = setFollowGate(def, true);
  assert.ok(comSegue.nodes.some((n) => n.type === "condition"));
  assert.deepEqual(comSegue.pos, def.pos, "blocos novos sem posição: o layout calcula até o lojista mexer");
});
```

(importe `addNode, connect, disconnect, moveNode, removeNode` de `./edit` e `DEFAULT_TEXTS` de `./recipes`, se ainda não importados.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/flow/edit.test.ts`
Expected: FAIL (funções não exportadas).

- [ ] **Step 3: Implement** (no fim de `edit.ts`; `freshId` e `ordenar` já existem; importe `outsOf` e `Pos` de `./types` e `hasNode` de `./graph`)

```ts
export type TipoNovo = "message" | "invite" | "condition";

const BASE_ID: Record<TipoNovo, string> = { message: "direct", invite: "convite", condition: "segue" };

function novoBloco(tipo: TipoNovo, id: string): FlowNode {
  switch (tipo) {
    case "message":
      return { id, type: "message", text: DEFAULT_TEXTS.pedeResposta, button: null, wait: null };
    case "invite":
      return { id, type: "invite", text: DEFAULT_TEXTS.convite, campaignSlug: null, remindAfterMinutes: null };
    case "condition":
      return { id, type: "condition", check: "follows" };
  }
}

/** Mapa editável (fase 5): bloco novo, solto, na posição onde o lojista pediu. */
export function addNode(def: FlowDef, tipo: TipoNovo, pos: Pos): { def: FlowDef; id: string } {
  const id = freshId(def, BASE_ID[tipo]);
  return { def: { ...def, nodes: [...def.nodes, novoBloco(tipo, id)], pos: { ...(def.pos ?? {}), [id]: pos } }, id };
}

/** Tira o bloco, as ligações que chegam e saem dele e a posição. O gatilho nunca sai. */
export function removeNode(def: FlowDef, id: string): FlowDef {
  const alvo = nodeById(def, id);
  if (!alvo || alvo.type === "trigger") return def;
  const pos = { ...(def.pos ?? {}) };
  delete pos[id];
  return { ...def, nodes: def.nodes.filter((n) => n.id !== id), edges: def.edges.filter((e) => e.from !== id && e.to !== id), ...(def.pos ? { pos } : {}) };
}

/** Liga `from.out → to`. Uma ligação por saída: ligar de novo substitui. Recusa saída que o bloco não tem, alvo inexistente e laço em si mesmo. */
export function connect(def: FlowDef, from: string, out: FlowOut, to: string): FlowDef {
  const origem = nodeById(def, from);
  if (!origem || !outsOf(origem).includes(out) || !hasNode(def, to) || from === to) return def;
  return { ...def, edges: [...def.edges.filter((e) => !(e.from === from && e.out === out)), { from, out, to }] };
}

export function disconnect(def: FlowDef, from: string, out: FlowOut): FlowDef {
  return { ...def, edges: def.edges.filter((e) => !(e.from === from && e.out === out)) };
}

export function moveNode(def: FlowDef, id: string, pos: Pos): FlowDef {
  if (!hasNode(def, id)) return def;
  return { ...def, pos: { ...(def.pos ?? {}), [id]: pos } };
}
```

Se `ordenar` for aplicado nessas operações, a ordem dos blocos novos muda a cada edição; **não** aplique: a ordem de inserção é a ordem do mapa.

- [ ] **Step 4: `canonico` ignora `pos`**

Em `editor.tsx`, a função `canonico` (que serializa o grafo para comparar rascunho e publicado) passa a receber o grafo sem posições: onde `mudou` chama `canonico(draft)` e `canonico(published)`, troque por `canonico({ ...draft, pos: undefined })` e `canonico({ ...published, pos: undefined })`. Mover bloco não acende "Publicar alteração".

- [ ] **Step 5: Run the gate**

Run: `npm --workspace apps/web test`, os dois `tsc`, `lint`.
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ig/flow/edit.ts apps/web/src/lib/ig/flow/edit.test.ts apps/web/src/components/painel/instagram/editor.tsx
git commit -m "feat(ig): free graph operations — add, remove, connect, disconnect, move"
```

### Gate N e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] `git push -u origin feat/ig-fase5-modelo` e PR:

```
PR N da fase 5 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-08-instagram-fluxos-fase5.md, Tasks 1–3).

- `FlowDef.pos` opcional (posições por bloco), aceito pelo esquema do rascunho; mover bloco não conta como alteração a publicar.
- `layout()` usa as posições quando todos os blocos têm; `comPosicoes()` completa as que faltam.
- Operações puras do mapa editável: `addNode`, `removeNode` (nunca o gatilho), `connect` (uma ligação por saída, sem laço), `disconnect`, `moveNode`.

Sem tela nova ainda; sem migração.
```

- [ ] Mergear e abrir a branch do PR O a partir de `origin/main`.

---

## PR O — o mapa editável no editor

Branch: `feat/ig-fase5-mapa`. Entrega: de `lg` pra cima, a visão "Mapa" é o React Flow: arrastar, ligar, apagar, adicionar pela paleta, editar o bloco selecionado no painel da direita; números da fase 3 nos blocos. Abaixo de `lg`, o mapa de hoje.

### Task 4: dependência e o bloco com pontos de ligação

**Files:**
- Modify: `apps/web/package.json` (via `npm install`)
- Create: `apps/web/src/components/painel/instagram/bloco-no.tsx`

**Interfaces:**
- Produces: `BlocoNo` (nó customizado do React Flow, `type: "bloco"`); `DadosDoBloco = { node: FlowNode; erro: boolean; numeros: Numeros | null }`; `NoDoMapa = Node<DadosDoBloco, "bloco">`.

- [ ] **Step 1: Install**

```bash
npm --workspace apps/web install @xyflow/react@^12
```

Confira que `apps/web/package.json` ganhou a linha e que `package-lock.json` mudou. Commit só no fim da task.

- [ ] **Step 2: O bloco**

```tsx
// apps/web/src/components/painel/instagram/bloco-no.tsx
"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { resumoDoBloco, rotuloDaSaida, tituloDoBloco } from "@/lib/ig/flow/labels";
import { NODE_W } from "@/lib/ig/flow/layout";
import { outsOf, type FlowNode } from "@/lib/ig/flow/types";
import { chegaram, saida, type Numeros } from "@/lib/ig/numeros";
import type { FlowDef } from "@/lib/ig/flow/types";
import { cn } from "@/lib/utils";
import { ICONE } from "./icones";

export type DadosDoBloco = { def: FlowDef; node: FlowNode; erro: boolean; numeros: Numeros | null };
export type NoDoMapa = Node<DadosDoBloco, "bloco">;

/**
 * O mesmo bloco do mapa só leitura, com um ponto de entrada à esquerda (menos o
 * gatilho) e um ponto de saída por saída, à direita de cada linha. O React Flow
 * usa o `id` do ponto como `sourceHandle`: é a saída (`FlowOut`).
 */
export function BlocoNo({ data, selected }: NodeProps<NoDoMapa>) {
  const { node, erro, numeros, def } = data;
  const Icone = ICONE[node.type];
  const chegou = numeros ? chegaram(def, numeros, node.id) : null;
  return (
    <article
      className={cn("rounded-[10px] border bg-paper-0", erro ? "border-danger-700" : selected ? "border-cobalt-500" : "border-line-200")}
      style={{ width: NODE_W }}
      aria-label={`${tituloDoBloco(node)}${erro ? ", com pendência" : ""}`}
    >
      {node.type !== "trigger" && <Handle type="target" position={Position.Left} id="in" aria-label={`Entrada de ${tituloDoBloco(node)}`} className="!h-3 !w-3 !border-slate-600 !bg-paper-0" />}
      <h3 className="flex h-10 items-center gap-2 border-b border-line-200 px-3 text-13 font-semibold text-volt-950">
        <Icone className="h-4 w-4 text-slate-600" strokeWidth={1.75} aria-hidden="true" />
        {tituloDoBloco(node)}
        {chegou !== null && <span className="ml-auto font-data text-12 font-normal text-slate-600">{chegou}</span>}
      </h3>
      <p className="px-3 py-2 text-12 leading-snug text-slate-600">{resumoDoBloco(node)}</p>
      <ul className="border-t border-line-200 px-3 py-1.5 text-12 text-slate-600">
        {outsOf(node).map((out) => (
          <li key={out} className="relative flex items-center justify-between py-0.5 pr-3">
            <span>{rotuloDaSaida(out, node)}</span>
            {numeros && <span className="font-data text-volt-950">{saida(numeros, node.id, out)}</span>}
            <Handle type="source" position={Position.Right} id={out} aria-label={`Ligar “${rotuloDaSaida(out, node)}”`} className="!right-[-7px] !top-1/2 !h-3 !w-3 !border-slate-600 !bg-paper-0" style={{ transform: "translateY(-50%)" }} />
          </li>
        ))}
      </ul>
    </article>
  );
}
```

Se `@/lib/utils` não exportar `cn`, use o helper que `editor.tsx` já importa (procure `import { cn }` lá e copie o caminho).

- [ ] **Step 3: Type-check**

Run: `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src/components/painel/instagram/bloco-no.tsx
git commit -m "feat(ig): React Flow dependency and the map block with handles"
```

### Task 5: o mapa editável

**Files:**
- Create: `apps/web/src/components/painel/instagram/mapa-editavel.tsx`

**Interfaces:**
- Consumes: `comPosicoes`, `layout` (Task 2), `addNode`/`removeNode`/`connect`/`disconnect`/`moveNode` (Task 3), `BlocoNo`/`NoDoMapa` (Task 4), `Issue`, `Numeros`.
- Produces: `<MapaEditavel def campanhas issues editar numeros selecionado aoSelecionar />` com `editar: (fn: (d: FlowDef) => FlowDef) => void` (o mesmo `editarELimpar` do editor) e `aoSelecionar: (id: string | null) => void`.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/painel/instagram/mapa-editavel.tsx
"use client";

import "@xyflow/react/dist/style.css";

import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge, type EdgeChange, type NodeChange, type OnSelectionChangeParams } from "@xyflow/react";
import { useCallback, useMemo } from "react";
import { addNode, connect, disconnect, moveNode, removeNode, type TipoNovo } from "@/lib/ig/flow/edit";
import { comPosicoes } from "@/lib/ig/flow/layout";
import { MAIN_OUTS, type FlowDef, type FlowOut } from "@/lib/ig/flow/types";
import type { Issue } from "@/lib/ig/flow/validate";
import { espessura, maiorSaida, saida, type Numeros } from "@/lib/ig/numeros";
import { BlocoNo, type NoDoMapa } from "./bloco-no";

type Editar = (fn: (d: FlowDef) => FlowDef) => void;
type Props = { def: FlowDef; issues: Issue[]; editar: Editar; numeros: Numeros | null; selecionado: string | null; aoSelecionar: (id: string | null) => void };

/** Fora do componente: o React Flow remonta os nós quando este objeto muda de identidade. */
const TIPOS = { bloco: BlocoNo };
const PALETA: Array<[TipoNovo, string]> = [["message", "Direct"], ["invite", "Convite pro grupo"], ["condition", "Segue a loja?"]];

function Interno({ def, issues, editar, numeros, selecionado, aoSelecionar }: Props) {
  const { screenToFlowPosition } = useReactFlow();
  // Todo bloco com posição: a primeira edição no mapa congela o layout calculado.
  const posicionado = useMemo(() => comPosicoes(def), [def]);
  const comErro = useMemo(() => new Set(issues.filter((i) => i.nodeId).map((i) => i.nodeId as string)), [issues]);
  const maior = numeros ? maiorSaida(numeros) : 0;

  const nodes = useMemo<NoDoMapa[]>(
    () =>
      posicionado.nodes.map((node) => ({
        id: node.id,
        type: "bloco",
        position: posicionado.pos?.[node.id] ?? { x: 0, y: 0 },
        data: { def: posicionado, node, erro: comErro.has(node.id), numeros },
        selected: node.id === selecionado,
        deletable: node.type !== "trigger",
      })),
    [posicionado, comErro, numeros, selecionado],
  );
  const edges = useMemo<Edge[]>(
    () =>
      posicionado.edges.map((e) => ({
        id: `${e.from}:${e.out}`,
        source: e.from,
        sourceHandle: e.out,
        target: e.to,
        targetHandle: "in",
        style: { stroke: MAIN_OUTS.includes(e.out) ? "var(--color-serie)" : "var(--color-saida)", strokeWidth: numeros ? espessura(saida(numeros, e.from, e.out), maior) : MAIN_OUTS.includes(e.out) ? 3 : 2 },
      })),
    [posicionado, numeros, maior],
  );

  const aoMudarNos = useCallback(
    (mudancas: NodeChange<NoDoMapa>[]) => {
      for (const m of mudancas) {
        // Só o fim do arrasto grava; o React Flow move o nó na tela sozinho durante o gesto.
        if (m.type === "position" && m.position && m.dragging === false) {
          const pos = { x: Math.round(m.position.x), y: Math.round(m.position.y) };
          editar((d) => moveNode(comPosicoes(d), m.id, pos));
        }
        if (m.type === "remove") editar((d) => removeNode(d, m.id));
      }
    },
    [editar],
  );
  const aoMudarLigacoes = useCallback(
    (mudancas: EdgeChange<Edge>[]) => {
      for (const m of mudancas) {
        if (m.type !== "remove") continue;
        const [from, out] = m.id.split(":");
        editar((d) => disconnect(d, from, out as FlowOut));
      }
    },
    [editar],
  );
  const aoLigar = useCallback(
    (c: Connection) => {
      if (!c.source || !c.sourceHandle || !c.target) return;
      editar((d) => connect(d, c.source, c.sourceHandle as FlowOut, c.target));
    },
    [editar],
  );
  const aoSelecionarNos = useCallback(({ nodes: sel }: OnSelectionChangeParams) => aoSelecionar(sel[0]?.id ?? null), [aoSelecionar]);
  const adicionar = (tipo: TipoNovo) => {
    const caixa = document.querySelector<HTMLElement>("[data-testid=ig-mapa-editavel] .react-flow");
    const r = caixa?.getBoundingClientRect();
    const centro = r ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    let novoId: string | null = null;
    editar((d) => {
      const r2 = addNode(comPosicoes(d), tipo, { x: Math.round(centro.x), y: Math.round(centro.y) });
      novoId = r2.id;
      return r2.def;
    });
    if (novoId) aoSelecionar(novoId);
  };

  return (
    <div data-testid="ig-mapa-editavel" role="region" aria-label="Mapa editável do fluxo" className="grid gap-3">
      <div role="group" aria-label="Adicionar bloco" className="flex flex-wrap items-center gap-2">
        <span className="text-12 text-slate-600">Adicionar bloco</span>
        {PALETA.map(([tipo, rotulo]) => (
          <button key={tipo} type="button" onClick={() => adicionar(tipo)} className="h-8 rounded-[var(--radius-control)] border border-line-200 px-2.5 text-13 text-volt-950 hover:bg-hover-ficha">
            {rotulo}
          </button>
        ))}
        <span className="ml-auto text-12 text-slate-600">Puxe de uma saída até um bloco pra ligar. Delete apaga o bloco ou a ligação selecionada.</span>
      </div>
      <div className="h-[560px] overflow-hidden rounded-[10px] border border-line-200 bg-canvas-100">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={TIPOS}
          onNodesChange={aoMudarNos}
          onEdgesChange={aoMudarLigacoes}
          onConnect={aoLigar}
          onSelectionChange={aoSelecionarNos}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.4}
          maxZoom={1.5}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          className="bg-canvas-100"
        >
          <Background gap={24} size={1} color="var(--color-line-200)" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
    </div>
  );
}

/** O mapa editável (desktop). Todo gesto vira uma operação nomeada de `edit.ts`; o React Flow só desenha. */
export function MapaEditavel(props: Props) {
  return (
    <ReactFlowProvider>
      <Interno {...props} />
    </ReactFlowProvider>
  );
}
```

Notas pro executor: (1) o `onNodesChange` do React Flow 12 traz `dragging: false` na última mudança de posição do arrasto; se a sua versão não trouxer o campo, use `onNodeDragStop={(_, n) => editar((d) => moveNode(comPosicoes(d), n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }))}` e, em `aoMudarNos`, trate só `remove`. (2) Os nós são **controlados** (vêm de `def`): não use `useNodesState`. (3) O CSS do React Flow pinta `.react-flow__controls` e `.react-flow__edge-path`; se o botão de zoom sair com fundo branco no tema noite, acrescente no mesmo arquivo um `<style>` escopado por `[data-testid=ig-mapa-editavel]` com `.react-flow__controls-button { background: var(--color-paper-0); border-color: var(--color-line-200); color: var(--color-volt-950); }` — nada global.

- [ ] **Step 2: Type-check, lint, painel:check**

Run: `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`, `lint`, `painel:check`.
Expected: limpos. Se o `painel:check` reclamar da classe `!bg-paper-0` (prefixo `!`), troque pelas classes sem `!` e um `style={{ background: "var(--color-paper-0)" }}` no `Handle`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/painel/instagram/mapa-editavel.tsx
git commit -m "feat(ig): editable map — drag, connect, delete, add from palette"
```

### Task 6: o painel do bloco e a montagem no editor

**Files:**
- Create: `apps/web/src/components/painel/instagram/painel-do-bloco.tsx`
- Modify: `apps/web/src/components/painel/instagram/editor.tsx`
- Modify: `apps/web/e2e/painel-instagram.spec.ts`

**Interfaces:**
- Consumes: `BlocoForm` (`./bloco-form`, props `node, primeiroDepoisDoComentario, campanhas, issues, aoMudar`), `updateNode`, `removeNode`, `triggerOf`, `targetOf`.
- Produces: `<PainelDoBloco def id campanhas issues editar aoFechar />`.

- [ ] **Step 1: O painel**

```tsx
// apps/web/src/components/painel/instagram/painel-do-bloco.tsx
"use client";

import { removeNode, updateNode } from "@/lib/ig/flow/edit";
import { nodeById, targetOf, triggerOf } from "@/lib/ig/flow/graph";
import { tituloDoBloco } from "@/lib/ig/flow/labels";
import type { FlowDef } from "@/lib/ig/flow/types";
import type { Issue } from "@/lib/ig/flow/validate";
import { BlocoForm, type CampanhaOpcao } from "./bloco-form";

type Editar = (fn: (d: FlowDef) => FlowDef) => void;

/** O bloco selecionado no mapa, com o mesmo formulário do passo a passo. */
export function PainelDoBloco({ def, id, campanhas, issues, editar, aoFechar }: { def: FlowDef; id: string; campanhas: CampanhaOpcao[]; issues: Issue[]; editar: Editar; aoFechar: () => void }) {
  const node = nodeById(def, id);
  if (!node) return null;
  const t = triggerOf(def);
  const primeiroDepoisDoComentario = t?.on === "comment" && targetOf(def, t.id, "next") === node.id;
  return (
    <section aria-label={`Bloco selecionado: ${tituloDoBloco(node)}`} className="rounded-[10px] border border-line-200 bg-paper-0 px-5 py-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-15 font-semibold text-volt-950">{tituloDoBloco(node)}</h2>
        <button type="button" onClick={aoFechar} className="text-13 text-slate-600 hover:text-volt-950">Fechar</button>
      </header>
      <div className="mt-3">
        <BlocoForm node={node} primeiroDepoisDoComentario={primeiroDepoisDoComentario} campanhas={campanhas} issues={issues} aoMudar={(patch) => editar((d) => updateNode(d, node.id, patch))} />
      </div>
      {node.type !== "trigger" && (
        <button
          type="button"
          onClick={() => {
            editar((d) => removeNode(d, node.id));
            aoFechar();
          }}
          className="mt-4 h-8 rounded-[var(--radius-control)] border border-line-200 px-2.5 text-13 text-danger-700 hover:bg-hover-ficha"
        >
          Tirar bloco
        </button>
      )}
    </section>
  );
}
```

Se `BlocoForm` não cobrir o bloco de condição (ele não tem campo), o painel mostra só o título e "Tirar bloco": confira em `bloco-form.tsx` o que ele desenha para `condition` e, se lançar, envolva o `<BlocoForm>` em `{node.type !== "condition" && (…)}`.

- [ ] **Step 2: Editor**

Em `editor.tsx`:

1. Imports: `import { MapaEditavel } from "./mapa-editavel";` e `import { PainelDoBloco } from "./painel-do-bloco";`.
2. Estado: `const [selecionado, setSelecionado] = useState<string | null>(null);`. Ao trocar de visão para "passo" ou de aba, `setSelecionado(null)` (dentro de `trocarVisao` e no `onClick` das abas).
3. No ramo `visao === "mapa"`, troque o bloco atual por:

```tsx
            <div className="grid content-start gap-3">
              <div className="hidden lg:block">
                <MapaEditavel def={flow.draft} issues={issues} editar={editarELimpar} numeros={numeros} selecionado={selecionado} aoSelecionar={setSelecionado} />
              </div>
              <div className="lg:hidden">
                <Mapa def={flow.draft} numeros={numeros} />
                <p className="mt-3 text-12 text-slate-600">No celular o mapa é só pra olhar. Pra montar arrastando, abra no computador; pra mudar um bloco, troque pra “Passo a passo”.</p>
              </div>
            </div>
```

4. No `<aside>`: quando `visao === "mapa" && selecionado`, mostre `<PainelDoBloco def={flow.draft} id={selecionado} campanhas={campanhas ?? []} issues={issues} editar={editarELimpar} aoFechar={() => setSelecionado(null)} />` no lugar de `<Previa …>`; `<PraPublicar issues={issues} />` continua embaixo nos dois casos.

- [ ] **Step 3: e2e** (no primeiro teste de `painel-instagram.spec.ts`, depois de `await expect(page.getByTestId("ig-mapa")).toBeVisible();`, que continua valendo no celular; o projeto Playwright padrão é desktop, então o editável monta):

```ts
      const mapaEditavel = page.getByRole("region", { name: "Mapa editável do fluxo" });
      await expect(mapaEditavel).toBeVisible();
      const antes = await mapaEditavel.locator("article").count();
      await page.getByRole("group", { name: "Adicionar bloco" }).getByRole("button", { name: "Direct" }).click();
      await expect(mapaEditavel.locator("article")).toHaveCount(antes + 1);
      await expect(page.getByRole("region", { name: /^Bloco selecionado: Direct/ })).toBeVisible();
      await page.getByRole("button", { name: "Tirar bloco" }).click();
      await expect(mapaEditavel.locator("article")).toHaveCount(antes);
      await expect(page.getByRole("status").filter({ hasText: /Salvo/ })).toBeVisible();
```

Se o seletor `getByTestId("ig-mapa")` do teste antigo passar a casar o mapa do celular escondido (`lg:hidden`), troque a linha por `await expect(page.getByRole("region", { name: "Mapa editável do fluxo" })).toBeVisible();`.

- [ ] **Step 4: Gate local**

Run: os sete comandos do gate e `npx playwright test e2e/painel-instagram.spec.ts` (precisa das credenciais de QA, como os outros e2e).
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/painel/instagram/painel-do-bloco.tsx apps/web/src/components/painel/instagram/editor.tsx apps/web/e2e/painel-instagram.spec.ts
git commit -m "feat(ig): editable map in the editor with the selected-block panel; mobile keeps read-only map"
```

### Gate O e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] `git push -u origin feat/ig-fase5-mapa` e PR:

```
PR O da fase 5 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-08-instagram-fluxos-fase5.md, Tasks 4–6). Fecha a fase 5.

- `@xyflow/react` ^12 (só esta dependência).
- Mapa editável de `lg` pra cima: arrastar (posição guardada no rascunho), ligar puxando de uma saída, apagar bloco ou ligação, adicionar pela paleta; bloco com pendência fica marcado; números da fase 3 nos blocos e nas ligações.
- Painel "Bloco selecionado" no lado direito com o mesmo formulário do passo a passo e "Tirar bloco".
- Celular: mapa só leitura, como antes.
```

- [ ] **Prova em produção:** na VIREI MODA, "Novo fluxo" → "Em branco" → visão Mapa: adicionar Direct e Convite, ligar gatilho → direct → convite, escolher a palavra e a campanha no painel, "Publicar" libera. Comentar a palavra com a `@igortoled0` e receber o direct. Print do mapa montado. Quadro: `select public.move_card('ig-mapa-editavel', 'no_ar_verificado', 'Fluxo montado do zero no mapa e publicado; comentário virou direct.', '<data/hora + print + run>');` e `update public.board_features set blocker = null where key = 'ig-mapa-editavel';`.

- [ ] Mergear. Encerrar a sessão com "PRs que deixei abertos: nenhum" e:

```powershell
rag insert "decisão 2026-10: Fluxos do Instagram fase 5 no ar (plano docs/superpowers/plans/2026-10-08-instagram-fluxos-fase5.md): FlowDef.pos opcional (posições guardadas no rascunho, ignoradas na comparação com o publicado), layout usa pos quando completo, operações puras addNode/removeNode/connect/disconnect/moveNode, mapa editável com @xyflow/react só no desktop (celular segue só leitura), painel do bloco selecionado reaproveita BlocoForm." --source decisao-2026-10-instagram-fase5
```

## Auto-revisão do plano (feita em 08/10)

**Cobertura do spec:**

| Spec | Onde |
|---|---|
| §4.2 "Montar arrastando no mapa … (fase 5)" | Tasks 5, 6 |
| §6 "As posições … só passam a ser guardadas quando o mapa for editável (fase 5)" | Tasks 1, 2 |
| §6 edição por operações nomeadas | Task 3 (`edit.ts`), Task 5 (o componente só chama operações) |
| §6 validação igual nas duas visões (uma ligação por saída, bloco solto, ciclo…) | Task 3 (`connect` substitui), `validateFlow` já existente, pendência marcada no bloco (Task 4) |
| §10 "Fase 5: Edita arrastando (React Flow)"; "Celular: … mapa só leitura" | Tasks 5, 6 |
| §16 "Igor monta um fluxo do zero arrastando blocos" | Gate O |

**Placeholders:** nenhum. **Consistência de tipos:** `Pos`/`FlowDef.pos` (Task 1) usados em `layout`/`comPosicoes` (Task 2) e nas operações (Task 3); `NoDoMapa`/`DadosDoBloco` (Task 4) são o `nodes` de `MapaEditavel` (Task 5); `MapaEditavel` e `PainelDoBloco` recebem o mesmo `editarELimpar` do editor (Task 6); `numeros` vem do hook da fase 3.
