# Organizacao de Grupos por Familia e Numero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar nome interno por familia e numero aos grupos, preservando o nome real do WhatsApp.

**Architecture:** Estender o tipo `Group` com campos opcionais, preservar esses campos no sync da engine, aceitar PATCH pela API e centralizar o nome exibido em um helper puro.

**Tech Stack:** Next.js App Router, React client components, TypeScript, `tsx` + `node:assert`.

---

### Task 1: Helper e modelo

**Files:**
- Modify: `apps/web/src/lib/mock-data.ts`
- Create: `apps/web/src/lib/group-display-name.ts`
- Create: `apps/web/src/lib/group-display-name.test.ts`

- [ ] Criar teste para `Promocoes 1`, `Promocoes` e fallback para nome real.
- [ ] Implementar helper `getGroupDisplayName(group)`.
- [ ] Rodar `npm.cmd --workspace apps/web exec -- tsx src/lib/group-display-name.test.ts`.

### Task 2: Persistencia e API

**Files:**
- Modify: `apps/web/src/lib/groups-store.ts`
- Modify: `apps/web/src/app/api/groups/route.ts`

- [ ] Preservar `displayNameBase` e `displayNumber` no `replaceGroups`.
- [ ] Permitir `updateGroup` salvar `displayNameBase` e `displayNumber`.
- [ ] Aceitar os campos no `PATCH /api/groups`.

### Task 3: UI e campanhas

**Files:**
- Modify: `apps/web/src/app/(app)/groups/page.tsx`
- Modify: `apps/web/src/app/(app)/campanhas/page.tsx`
- Modify: `apps/web/src/app/(app)/campanhas/[id]/page.tsx`

- [ ] Adicionar edicao simples de nome interno e numero na tela de grupos.
- [ ] Usar `getGroupDisplayName` no assistente de criacao e listas da campanha.
- [ ] Mostrar nome real do WhatsApp como contexto quando houver nome interno.

### Task 4: Verificacao

- [ ] `npm.cmd --workspace apps/web exec -- tsx src/lib/group-display-name.test.ts`
- [ ] `npm.cmd --workspace apps/web exec -- tsc --noEmit`
- [ ] `npm.cmd --workspace apps/web run lint`
- [ ] `npm.cmd --workspace apps/web run build`
- [ ] Commit `feat: add group family numbering`
