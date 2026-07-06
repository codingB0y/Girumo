# Dead Code Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover apenas código comprovadamente inalcançável ou não utilizado, sem alterar comportamento e sem tocar nas LPs `/lp` e `/lp2`.

**Architecture:** A limpeza será feita em lotes independentes, começando por avisos determinísticos do ESLint. Antes de cada exclusão de arquivo ou função, o símbolo será pesquisado em todo o workspace ativo; após cada lote serão executados lint, testes e uma verificação do diff para impedir alterações nos caminhos protegidos.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node.js/CommonJS, ESLint, Knip e testes `node:test`/`tsx`.

---

### Task 1: Limpar símbolos locais comprovadamente não utilizados

**Files:**
- Modify: `apps/web/src/app/admin/alertas/page.tsx`
- Modify: `apps/web/src/app/painel/configuracoes/cancelar/page.tsx`
- Modify: `apps/web/src/app/painel/configuracoes/page.tsx`
- Modify: `apps/web/src/app/painel/configuracoes/webhooks/page.tsx`
- Modify: `apps/web/src/app/painel/dev-tools/page.tsx`
- Modify: `apps/web/src/app/painel/squad-os/agents/page.tsx`
- Modify: `apps/web/src/app/painel/squad-os/setup/page.tsx`
- Modify: `apps/web/src/components/impersonate-banner.tsx`
- Modify: `apps/web/src/components/landing/bento-card.tsx`
- Modify: `apps/web/src/lib/stores/squad-os.ts`
- Modify: `hubflow-engine/index-dev-real.js`
- Modify: `hubflow-engine/supervisor.js`

- [ ] Registrar a linha de base do ESLint e dos testes.
- [ ] Remover apenas imports, variáveis e estado apontados como não utilizados.
- [ ] Executar ESLint e testes completos.
- [ ] Confirmar que nenhum arquivo protegido aparece no diff.

### Task 2: Remover componentes sem consumidor no grafo de imports

**Files:**
- Delete: `apps/web/src/components/admin/breadcrumbs.tsx`
- Delete: `apps/web/src/components/admin/logs-client.tsx`
- Delete: `apps/web/src/components/admin/settings-editor.tsx`
- Delete: `apps/web/src/components/painel/confetti.tsx`
- Delete: `apps/web/src/components/painel/empty-state.tsx`
- Delete: `apps/web/src/components/painel/section-stub.tsx`
- Delete: `apps/web/src/components/painel/sparkline.tsx`
- Delete: `apps/web/src/components/testimonial-collect.tsx`
- Delete: componentes legados em `apps/web/src/components/landing/`, exceto `logo.tsx`, `icons.tsx` e `v2/**`

- [ ] Repetir a busca por import e nome exportado de cada componente.
- [ ] Excluir somente arquivos com zero consumidores alcançáveis.
- [ ] Rodar TypeScript/Next build para detectar imports dinâmicos ou convenções não capturadas.
- [ ] Confirmar que nenhum arquivo protegido aparece no diff.

### Task 3: Remover utilitários e funções comprovadamente sem chamadas

**Files:**
- Delete: `apps/web/src/lib/dev-guard.ts`
- Delete: `apps/web/src/lib/notify-tenant.ts`
- Delete: `apps/web/src/lib/referrals-store.ts`
- Delete: `apps/web/src/lib/testimonials-store.ts`
- Delete: `apps/web/src/lib/stores/index.ts`
- Delete: `apps/web/src/components/painel/messages/index.ts`
- Modify: stores e utilitários reportados pelo Knip
- Modify: `hubflow-engine/index.js`

- [ ] Revalidar cada função com busca por import, referência e chamada.
- [ ] Não excluir funções referenciadas internamente; nesses casos, remover somente o `export` desnecessário.
- [ ] Preservar `connection-watchdog.js` e `supervisor.js`, pois possuem decisões pendentes no roadmap.
- [ ] Executar lint, testes, build e Knip novamente.
- [ ] Confirmar que nenhum arquivo protegido aparece no diff.

### Task 4: Verificação final e revisão do escopo

**Files:**
- Review: todos os arquivos alterados por `git diff`

- [ ] Executar `npm test`.
- [ ] Executar `npm run engine:test`.
- [ ] Executar o ESLint excluindo `/lp` e `/lp2`.
- [ ] Executar `npm run web:build`.
- [ ] Revisar o diff e confirmar ausência de mudanças em `app/lp`, `app/lp2`, `components/lp` e `components/lp2`.
- [ ] Relatar itens removidos e itens deliberadamente preservados.
