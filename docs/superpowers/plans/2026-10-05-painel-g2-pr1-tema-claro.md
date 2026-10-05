# Painel G2 — PR 1 (tema claro e fontes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O painel inteiro passa do tema noite para o tema claro frio do mockup G2, volta às fontes da raiz (Plex Sans, Plex Mono, Manrope) e os números grandes ficam em Manrope 700; nada de layout muda ainda.

**Architecture:** Só tokens. O bloco `:root:has(.pn-root)` de `painel-vitrine.css` (que hoje escreve os valores de noite) passa a escrever os valores claros do G2; o override de fontes `.pn-root { --font-plex-sans: var(--font-painel) }` e o `localFont` Archivo do layout saem. Os quatro números grandes trocam `[font-stretch:75%]` por `font-display font-bold tracking-[-0.015em]`.

**Tech Stack:** Next.js 15, Tailwind v4 (`@theme` sem `inline` para cores), `node --test` via tsx.

**Spec:** `docs/superpowers/specs/2026-10-05-painel-g2-barra-volt-design.md` (decisões 1, 2 e 3)

## Global Constraints

- Paleta do painel: fundo `#F3F5F7`, superfície `#FFFFFF`, fio `#DDE3E7`, hover `#F6F8F9`, selecionado `#E8EDF0`, tinta `#071923` (o volt da raiz), apoio `#52646C` (o slate da raiz). A landing continua creme: nada em `globals.css`.
- Fontes: as da raiz (`--font-plex-sans`, `--font-plex-mono`, `--font-manrope`). Archivo continua nas landings (`lp3`, `lp-cartaz`); só sai do painel.
- Acid só em Postar, AO VIVO e LOTOU; zero `button`/`a` com `bg-acid` na Início.
- Código e commits em inglês; texto de tela em pt-BR. Commits terminam com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; suíte `npm test`.
- Nunca `git add -A`; `git diff --cached --stat` antes de cada commit.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/painel/tema.test.ts` | criar | prova que o painel é claro e sem resto da noite |
| `apps/web/src/app/painel-vitrine.css` | modificar (linhas 1078–1172) | bloco de tokens do painel; remove override de fontes e regras da noite |
| `apps/web/src/app/painel/layout.tsx` | modificar | sai o `localFont` Archivo |
| `apps/web/src/components/painel/numeros.tsx:14` | modificar | número da célula em Manrope |
| `apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx:85` | modificar | número grande da faixa em Manrope |
| `apps/web/src/components/painel/campanhas/detalhe/link-e-cliques.tsx:197` | modificar | idem |
| `apps/web/src/components/painel/campanhas/detalhe/visao-geral.tsx:108` | modificar | idem |
| `apps/web/src/components/painel/home/ao-vivo/celula-do-grupo.tsx:17`, `notification-bell.tsx:38` | modificar | comentários que citam o tema noite |

---

### Task 1: tema claro (TDD no CSS)

**Files:**
- Create: `apps/web/src/lib/painel/tema.test.ts`
- Modify: `apps/web/src/app/painel-vitrine.css:1078-1172`

- [ ] **Step 1: teste**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const css = readFileSync(path.join(process.cwd(), "src", "app", "painel-vitrine.css"), "utf8");
const bloco = css.match(/:root:has\(\.pn-root\)\s*\{([^}]*)\}/)?.[1] ?? "";

test("o painel é claro e frio: fundo e superfície do G2, tinta volt da raiz", () => {
  assert.match(bloco, /color-scheme:\s*light/);
  assert.match(bloco, /--color-canvas-100:\s*#F3F5F7/i);
  assert.match(bloco, /--color-paper-0:\s*#FFFFFF/i);
  assert.match(bloco, /--color-line-200:\s*#DDE3E7/i);
  assert.doesNotMatch(bloco, /--color-volt-950|--color-slate-600/);
});

test("nada da noite sobrou: nem cor escura, nem Archivo no painel", () => {
  assert.doesNotMatch(css, /#061620|#0B2230|#E9F1F3|#16384A/i);
  assert.doesNotMatch(css, /--font-painel/);
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/tema.test.ts` → FAIL (bloco escuro).
- [ ] **Step 3:** substituir tudo de `/* ===... Tema noite — direção D` (linha 1078) até o fim do arquivo por:

```css
/* ======================================================================
   Tema do painel — G2 (docs/superpowers/specs/2026-10-05-painel-g2-barra-volt-design.md).

   O painel é claro e frio: o fundo e a superfície do mockup G2 entram trocando
   os VALORES da paleta enquanto ele está montado — o mesmo mecanismo do tema
   noite da direção D, que saiu em 05/10. Nenhum componente muda de classe. O
   seletor sobe até o :root para alcançar toast e folha fora de .pn-root. A
   landing continua no canvas creme (globals.css).

   Fora de @layer de propósito: regra sem camada vence a utilitária.
   ====================================================================== */
:root:has(.pn-root) {
  color-scheme: light;
  --color-canvas-100: #F3F5F7; /* fundo */
  --color-paper-0: #FFFFFF; /* superfície */
  --color-line-200: #DDE3E7; /* fio */
  --color-hover-ficha: #F6F8F9;
  --color-porta-ativa: #E8EDF0;
  /* Aliases são resolvidos onde nascem (:root creme): sem redeclarar, herdariam o creme. */
  --color-papel: var(--color-paper-0);
  --color-poco: color-mix(in srgb, var(--color-line-200) 45%, var(--color-paper-0));
  --color-balcao: var(--color-canvas-100);
  --background: var(--color-canvas-100);
  /* Casca: o trilho é a própria superfície; o selecionado, um degrau abaixo dela. */
  --pn-trilho: #FFFFFF;
  --pn-selecionado: #E8EDF0;
}
```

- [ ] **Step 4:** teste → PASS. Trocar os dois comentários: `celula-do-grupo.tsx:17` ("no tema noite (7,2:1 na superfície; o `danger-700` dava 2,7:1 ali)" → conferir o contraste da cor citada sobre `#FFFFFF`; se a cor foi escolhida para o escuro e não passa de 4,5:1 no branco, voltar para o token da raiz) e `notification-bell.tsx:38` ("Um tom só: a superfície é clara e o ícone, apoio.").
- [ ] **Step 5:** commit `feat(painel): light G2 theme replaces the night tokens`.

### Task 2: fontes da raiz e números em Manrope

**Files:**
- Modify: `apps/web/src/app/painel/layout.tsx` (sai `localFont`, `archivo` e `${archivo.variable}`), `apps/web/src/app/painel-vitrine.css` (sai o bloco `.pn-root { --font-plex-sans… }` com o comentário "Archivo no painel"), os quatro números.

- [ ] **Step 1:** `layout.tsx`: remover `import localFont from "next/font/local";`, o `const archivo = localFont({...})` e o comentário acima dele; a classe vira `` `pn-root font-body flex min-h-screen w-full bg-canvas-100 text-volt-950` ``. Comentário do layout: "Casca da direção D (spec 2026-09-24): corredor + letreiro no desktop, letreiro + barra no mobile; tema claro G2 (spec 2026-10-05)."
- [ ] **Step 2:** números:
  - `numeros.tsx:14` e `link-e-cliques.tsx:197`: `className="mt-2 font-display text-32 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950"`
  - `faixa-de-status.tsx:85`: `className="font-display text-[40px] max-md:text-28 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950"`
  - `visao-geral.tsx:108`: `className="font-display text-[40px] font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950"`
- [ ] **Step 3:** `grep -rn "font-stretch\|font-painel\|archivo" src/app/painel src/components/painel src/app/painel-vitrine.css` → vazio. Os dois `tsc`, `npm run lint`, `npm test` (inclui `tema.test.ts` e `brand-css.test.ts`).
- [ ] **Step 4:** commit `feat(painel): root fonts back in the panel, big numbers in Manrope`.

### Task 3: PR, CI, merge, produção

- [ ] `git fetch origin main`; push `feat/painel-g2-casca` com `-u`; `gh pr create` título `feat(painel): G2 PR 1 — tema claro e fontes da raiz`; CI verde; `gh pr merge --squash --delete-branch`.
- [ ] Produção logada (`/admin/configuracoes` mostra o deploy): `/painel` em 1440 e 390 claro, números em Manrope, zero texto volt sobre fundo volt; `/painel/campanhas/<slug>`, `/painel/grupos`, `/painel/disparos`, `/painel/relampago`, `/painel/configuracoes` sem fundo escuro remanescente e sem texto apagado (apoio ≥ 4,5:1).
