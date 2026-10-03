# Início "Ao vivo" — PR 6 (celular) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em `/painel?ao-vivo` abaixo de 768 px, a tela do mockup F para celular: a faixa vira uma linha de números que rola de lado (com o AO VIVO e a hora em cima), e o conteúdo vira três abas — **Relâmpago · Postando · Grupos** — com um contador em cada uma, abrindo na Relâmpago quando há oferta no ar, senão no Postando quando há post saindo, senão em Grupos. A aba escolhida fica em `?aba=`. De 768 px para cima, nada muda.

**Architecture:** Só tela, sem dado novo. A escolha da aba inicial e os contadores são funções puras (`lib/painel/ao-vivo/abas.ts`). As três áreas continuam montadas como hoje; no celular a aba não escolhida ganha `max-md:hidden` (CSS), então o desktop segue com o layout de colunas do PR 5 sem ramificação de JS por largura.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, TypeScript strict, `node --test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md` (seção "Celular" e PR 6)

## Global Constraints

- Abaixo de 768 px só; de 768 px para cima a tela fica idêntica ao PR 5 (conferir 1100 e 1440).
- Abas acessíveis: `role="tablist"` com `aria-label`; cada aba `role="tab"` com `aria-selected`, `aria-controls` e roving `tabIndex` (setas esquerda/direita, Home/End); cada área `role="tabpanel"` com `aria-labelledby`. A lista de abas é `md:hidden`; no desktop os três painéis ficam visíveis ao mesmo tempo (aceito: lá não há abas para ler).
- `?aba=relampago|postando|grupos` na URL via `history.replaceState` (sem navegação, sem recarregar dados); valor inválido cai na regra da aba inicial.
- Acid só em Postar, AO VIVO e LOTOU; **zero** `button`/`a` com `bg-acid`.
- Sem estouro lateral em 390 (o próprio scroll da faixa é interno ao elemento, não da página).
- Código e commits em inglês; texto de tela em pt-BR. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; suíte `npm test`.
- Nunca `git add -A`; `git diff --cached --stat` antes de cada commit. Sem `next build`, dev server ou SQL.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/painel/ao-vivo/abas.ts` (+ `.test.ts`) | criar | `abaInicial`, `contadoresDasAbas`, `abaDaUrl` |
| `apps/web/src/components/painel/home/ao-vivo/abas-do-celular.tsx` | criar | a lista de abas |
| `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx` | modificar | estado da aba, painéis com `max-md:hidden` |
| `apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx` | modificar | linha rolável no celular |
| `apps/web/src/components/painel/home/ao-vivo/entradas-e-saidas.tsx` | modificar | seletor de período escondido no celular (fica Hoje) |
| `apps/web/e2e/painel-inicio-ao-vivo.spec.ts` | modificar | abas em 390; sem abas em 1440 |
| spec | modificar | notas do PR 6 |

---

### Task 1: lógica das abas (TDD)

```ts
export type Aba = "relampago" | "postando" | "grupos";
export const ABAS: readonly Aba[] = ["relampago", "postando", "grupos"];
export function abaDaUrl(valor: string | null): Aba | null;          // só os três valores, senão null
export function abaInicial(e: { relampagoNoAr: boolean; postSaindo: boolean }): Aba; // relampago > postando > grupos
export type ContadoresDasAbas = Record<Aba, string | null>;
export function contadoresDasAbas(e: {
  relampagoNoAr: boolean; esperando: number | null; // esperando = null quando a fila não carregou
  post: { entregues: number; total: number; saindo: boolean } | null;
  grupos: number;
}): ContadoresDasAbas;
```

Regras de `contadoresDasAbas`: Relâmpago = `String(esperando)` quando no ar e `esperando` conhecido, `"●"` quando no ar sem número, `null` sem oferta; Postando = `"27/40"` quando o post está saindo, senão `null`; Grupos = `String(grupos)` (ou `null` com 0).

- [ ] Step 1: testes (`abas.test.ts`) para as três funções, incluindo `abaDaUrl("x") === null`, a precedência de `abaInicial`, e cada ramo dos contadores. Step 2: RED. Step 3: implementar. Step 4: GREEN + `tsc` + lint. Step 5: commit `feat(painel): live home mobile tabs model`.

### Task 2: tela do celular

- [ ] **Step 1: faixa rolável.** Em `faixa-de-status.tsx`, abaixo de `md`, a grade das células vira `flex overflow-x-auto` com cada célula `flex-none` (largura pelo conteúdo, `whitespace-nowrap` nos números e rótulos, `px-4`), sem barra visível (`[scrollbar-width:none]`), separadas por fio (`border-l border-line-200`, a primeira sem); de `md` para cima, a grade atual intacta. O topo (AO VIVO + hora + "atualizado há") continua em cima. O contêiner da faixa ganha `tabIndex={0}` e `aria-label` já existente para poder rolar pelo teclado.
- [ ] **Step 2: abas.** `abas-do-celular.tsx`: `<div role="tablist" aria-label="Seções da tela ao vivo" className="md:hidden grid grid-cols-3 border-b border-line-200">` com três `button role="tab"` (Relâmpago · Postando · Grupos), contador num `span` ao lado (`text-12 tabular-nums text-slate-600`), traço de 2 px embaixo da aba ativa (`after:` com `bg-volt-950`), `aria-selected`, `aria-controls="painel-<aba>"`, `id="aba-<aba>"`, roving `tabIndex` e setas/Home/End.
- [ ] **Step 3: estado e painéis.** Em `inicio-ao-vivo.tsx`: `const [aba, setAba] = useState<Aba>(() => abaDaUrl(new URLSearchParams(window.location.search).get("aba")) ?? abaInicial(...))` (a tela só monta depois do skeleton, então `window` existe); ao trocar, `history.replaceState` mantendo `ao-vivo` e mudando só `aba`. Envolver: Relâmpago num `div id="painel-relampago" role="tabpanel" aria-labelledby="aba-relampago"`, Postando em `painel-postando`, e o par mapa + gráfico em `painel-grupos`; o não escolhido recebe `max-md:hidden`. Preservar as classes de grade/ordem do PR 5 nesses wrappers (elas iam nos próprios componentes — mover para o wrapper e conferir que 1280/1400/1440 continuam iguais). `contadoresDasAbas` com: `relampagoNoAr` = `noAr`; `esperando` = `null` (a fila só é lida dentro da coluna; deixar `null` e mostrar "●" — ver nota); `post` = o post de `postDaTabela` com `sent/total` e `saindo` (`running`/`queued`); `grupos` = `groups.length`.
- [ ] **Step 4: gráfico no celular.** Em `entradas-e-saidas.tsx`, o grupo de período ganha `max-md:hidden`; como o período padrão é "hoje", o celular fica em Hoje.
- [ ] **Step 5: e2e.** Teste novo com `test.use({ viewport: { width: 390, height: 844 } })`: em `/painel?ao-vivo`, a `tablist` "Seções da tela ao vivo" está visível; a aba Grupos clicada deixa `inicio-mapa` visível e `inicio-postando` escondido; a URL ganha `aba=grupos`; sem rolagem lateral. E em 1440: a `tablist` não está visível e `inicio-mapa`, `inicio-postando` e `inicio-relampago` estão todos visíveis.
- [ ] **Step 6: spec** — "Celular": o contador da Relâmpago é "●" enquanto o número de pessoas esperando não vem na parte `relampago` (pode entrar depois somando a fila na rota); o mapa no celular segue com as células de 56 px (5 por linha em 390), sem versão compacta separada.
- [ ] **Step 7:** os dois `tsc`, lint, `npm test`. Commits: `feat(painel): live home mobile tabs and scrolling strip` e `docs: Início ao vivo spec notes for PR 6`.

### Task 3: PR, CI, merge e verificação em produção

- [ ] Atualizar com `origin/main`, push, `gh pr create` (`feat(painel): Início ao vivo PR 6 — celular com abas (?ao-vivo)`), CI verde, `gh pr merge --squash`, apagar branch.
- [ ] Produção logado: 390 (abas, faixa rolando por dentro, sem rolagem da página, troca de aba muda `?aba=`), 1100 e 1440 iguais ao PR 5, contraste sem falha.
