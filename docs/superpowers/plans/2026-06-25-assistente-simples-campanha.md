# Assistente Simples de Campanha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar um diagnostico simples e uma unica proxima acao para cada campanha de grupos.

**Architecture:** Criar um helper puro para traduzir `CampaignOperationalStatus` e `CampaignPrimaryAction` em textos de usuario leigo. Usar o helper nos cards de `/campanhas` e no topo de `/campanhas/[id]`.

**Tech Stack:** Next.js App Router, React client components, TypeScript, testes com `tsx` e `node:assert`.

---

### Task 1: Helper de proximo passo

**Files:**
- Create: `apps/web/src/lib/campaign-next-step.ts`
- Create: `apps/web/src/lib/campaign-next-step.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import assert from "node:assert/strict";
import { getCampaignNextStep } from "./campaign-next-step";

assert.deepEqual(getCampaignNextStep("ready", { kind: "copy_link" }), {
  title: "Tudo pronto para divulgar",
  description: "Copie o link da campanha e envie para suas clientes.",
  actionLabel: "Copiar link",
});

assert.deepEqual(getCampaignNextStep("empty", { kind: "choose_groups" }), {
  title: "Escolha grupos para liberar o link",
  description: "Selecione os grupos que vao receber novas revendedoras.",
  actionLabel: "Escolher grupos",
});

assert.deepEqual(getCampaignNextStep("needs_invites", { kind: "configure_invites" }), {
  title: "Corrija convites antes de divulgar",
  description: "Algum grupo esta sem link de convite. Corrija isso para nao perder leads.",
  actionLabel: "Corrigir agora",
});

assert.deepEqual(getCampaignNextStep("full", { kind: "add_groups" }), {
  title: "Todos os grupos estao cheios",
  description: "Adicione outro grupo para continuar recebendo novas revendedoras.",
  actionLabel: "Adicionar grupo",
});
```

- [ ] **Step 2: Verify RED**

Run: `npm.cmd --workspace apps/web exec -- tsx src/lib/campaign-next-step.test.ts`

Expected: FAIL because `./campaign-next-step` does not exist.

- [ ] **Step 3: Implement helper**

Create `getCampaignNextStep(status, action)` returning `{ title, description, actionLabel }` for the four statuses.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd --workspace apps/web exec -- tsx src/lib/campaign-next-step.test.ts`

Expected: PASS.

### Task 2: Apply helper to campaign UI

**Files:**
- Modify: `apps/web/src/app/(app)/campanhas/page.tsx`
- Modify: `apps/web/src/app/(app)/campanhas/[id]/page.tsx`

- [ ] **Step 1: Update `/campanhas` card**

Import `getCampaignNextStep`. In each card, compute the next step from `overview.operationalStatus` and `overview.primaryAction`. Show a highlighted "Proximo passo" block above metrics with title, description and the same primary action button.

- [ ] **Step 2: Update `/campanhas/[id]`**

Import `getCampaignNextStep`. Add a top card after the header with "Proximo passo", title, description and action. If ready, show copy link; otherwise the action scrolls/points the user to the groups sections.

- [ ] **Step 3: Verify**

Run:

```powershell
npm.cmd --workspace apps/web exec -- tsc --noEmit
npm.cmd --workspace apps/web run lint
npm.cmd --workspace apps/web run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/lib/campaign-next-step.ts apps/web/src/lib/campaign-next-step.test.ts "apps/web/src/app/(app)/campanhas/page.tsx" "apps/web/src/app/(app)/campanhas/[id]/page.tsx"
git commit -m "feat: add simple campaign assistant"
```
