# Início "Ao vivo" — PR 3 (entradas e saídas por hora) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em `/painel?ao-vivo`, abaixo do mapa, o gráfico "Entradas e saídas" da loja inteira, com os períodos Hoje (por hora) · 7 dias · Mês e, em Hoje, as marcas dos posts e dos grupos abertos.

**Architecture:** Sem DDL e sem parte nova: a parte `atividade` já traz `porHora`, `porDia`, `entradasDesde` e `gruposAbertosHoje` da loja inteira, e `disparos` já vem como `TenantDispatchView[]` do servidor. Os textos puros que a página da campanha e a Início compartilham (`medindoDesde`, `saldo`, `fraseDoMovimento`) saem dos módulos de tela da campanha para `lib/painel/atividade-texto.ts`, com testes. O gráfico reusa `GraficoDeBarras`, `barrasDaAtividade`, `marcasDePost` e `marcasDeGrupoAberto`.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, TypeScript strict, `node --test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md` (seção "Entradas e saídas por hora" e PR 3)

## Global Constraints

- Acid só em Postar, AO VIVO e LOTOU; **zero** `button`/`a` com `bg-acid` na Início.
- Medição de entradas e saídas começa em `ENTRADAS_E_SAIDAS_DESDE`; barra anterior é "sem medição", nunca zero (o `GraficoDeBarras` já faz isso com `rotuloSemMedicao`).
- Entradas e saídas só existem para grupos cadastrados.
- A página da campanha não muda de comportamento nem de texto.
- Código e commits em inglês; texto de tela em pt-BR. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; suíte `npm test`.
- Nunca `git add -A`; `git diff --cached --stat` antes de cada commit. Sem `next build` local.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/painel/atividade-texto.ts` (+ `.test.ts`) | criar | `medindoDesde`, `saldo`, `fraseDoMovimento` (puros) |
| `apps/web/src/components/painel/campanhas/detalhe/analise.tsx` | modificar | importa de `atividade-texto` (remove as cópias) |
| `apps/web/src/components/painel/campanhas/detalhe/grafico-barras.tsx` | modificar | importa `saldo` |
| `apps/web/src/components/painel/campanhas/detalhe/visao-geral.tsx`, `link-e-cliques.tsx` | modificar | imports |
| `apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx` | modificar | imports |
| `apps/web/src/lib/painel/atividade.ts` | modificar | `marcasDeGrupoAberto(grupos, { comNome })` |
| `apps/web/src/components/painel/home/types.ts`, `use-dashboard-data.ts` | modificar | `disparos` tipado como o que o servidor manda |
| `apps/web/src/components/painel/home/ao-vivo/entradas-e-saidas.tsx` | criar | o gráfico da loja |
| `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx`, `apps/web/src/app/painel/page.tsx` | modificar | monta o gráfico, passa `disparos` |
| `apps/web/e2e/painel-inicio-ao-vivo.spec.ts` | modificar | o gráfico aparece |
| spec | modificar | marcas: relâmpago no PR 5; até 2 linhas de rótulo |

---

### Task 1: textos da atividade num módulo só (refactor + testes)

**Files:** criar `lib/painel/atividade-texto.ts` e `.test.ts`; modificar `analise.tsx`, `grafico-barras.tsx`, `visao-geral.tsx`, `link-e-cliques.tsx`, `faixa-de-status.tsx`.

**Interfaces:**
- Produces:
  - `saldo(n: number): string` — corpo idêntico ao de `grafico-barras.tsx:262`.
  - `medindoDesde(iso: string): string` — corpo idêntico ao de `analise.tsx:76`.
  - `fraseDoMovimento(barras: Barra[], m: Movimento, quando: string, desde: string | null, onde?: string): string` — corpo idêntico ao de `analise.tsx:253`, mais o parâmetro opcional `onde` (padrão `""`) inserido logo depois de `quando` (antes da nota de medição) em todas as frases que levam `quando`, só quando não vazio, para a Início poder dizer "nos grupos da loja" sem mudar o texto da campanha. Leva junto o `contagem` e as duas constantes `unidadeDeEntradas`/`unidadeDeSaidas` que ela usa (exportadas, porque `analise.tsx` as usa no `GraficoDeBarras`).

- [ ] **Step 1: Testes primeiro** (`atividade-texto.test.ts`), sobre o comportamento atual:
  - `saldo(29) === "+29"`, `saldo(-3) === "−3"` (sinal tipográfico U+2212), `saldo(0) === "0"`, `saldo(1500) === "+1.500"`.
  - `medindoDesde("2026-10-01T03:00:00.000Z") === "medindo desde 01/10"`; `medindoDesde("2026-10-01T02:01:58.000Z") === "medindo desde 30/09, 23h"`.
  - `fraseDoMovimento`: todas as barras `semMedicao` → `"Entradas e saídas ainda não eram medidas neste período (medindo desde 30/09, 23h)."`; sem movimento → `"Ninguém entrou nem saiu hoje."`; com movimento (barras com `valor` 5 e 0, `abaixo` 1 e 2, a de 5 com `rotuloLongo` `"12h às 12h59"`, m = {entraram: 5, sairam: 3}) → `"5 entraram e 3 saíram hoje; saldo +2. O pico foi 12h às 12h59, com 5."`; o mesmo com `onde = "nos grupos da loja"` → `"5 entraram e 3 saíram hoje nos grupos da loja; saldo +2. O pico foi 12h às 12h59, com 5."`. Montar as `Barra` à mão com todos os campos do tipo (`chave`, `rotulo`, `rotuloLongo`, `valor`, `abaixo`, `futuro: false`, `atual: false`, `semMedicao`).
- [ ] **Step 2:** rodar e ver falhar (módulo não existe).
- [ ] **Step 3:** criar o módulo movendo os corpos (cópia exata) e o parâmetro `onde`; em `analise.tsx`, apagar `medindoDesde`, `fraseDoMovimento`, `unidadeDeEntradas`, `unidadeDeSaidas` locais e importar do módulo novo; **manter** `contagem` local de `analise.tsx` se `frase`/`conversao` ainda o usam. Continuar exportando `medindoDesde` de `analise.tsx`? **Não**: atualizar os importadores (`visao-geral.tsx`, `link-e-cliques.tsx`, `faixa-de-status.tsx`) para `@/lib/painel/atividade-texto`. Em `grafico-barras.tsx`, apagar `saldo` e importar do módulo; atualizar `visao-geral.tsx` e `faixa-de-status.tsx` para importar `saldo` do módulo novo. `grep -rn "medindoDesde\|saldo\b" src` não pode deixar import antigo.
- [ ] **Step 4:** teste novo verde; os dois `tsc`, lint e `npm test` verdes.
- [ ] **Step 5:** commit `refactor(painel): activity copy helpers in one module`.

---

### Task 2: o gráfico da loja na Início

**Files:** modificar `lib/painel/atividade.ts` (+ teste em `atividade.test.ts`), `components/painel/home/types.ts`, `use-dashboard-data.ts`, `inicio-ao-vivo.tsx`, `app/painel/page.tsx`, `e2e/painel-inicio-ao-vivo.spec.ts`, spec; criar `components/painel/home/ao-vivo/entradas-e-saidas.tsx`.

**Interfaces:**
- Consumes: `barrasDaAtividade`, `somaMedida`, `marcasDePost`, `marcasDeGrupoAberto`, `nomeDoMes`, `diaPorExtenso`, `type Periodo`, `type AtividadeDaCampanha` de `@/lib/painel/atividade`; `fraseDoMovimento`, `medindoDesde`, `unidadeDeEntradas`, `unidadeDeSaidas` (Task 1); `GraficoDeBarras` de `@/components/painel/campanhas/detalhe/grafico-barras`; `TenantDispatchView` de `@/lib/campaigns/dispatch-view`.
- Produces: `EntradasESaidas({ atividade, posts })` com `data-testid="inicio-entradas"` e `<h2>` "Entradas e saídas".

- [ ] **Step 1: Marca de grupo aberto com o nome (TDD).** Em `atividade.test.ts`, teste: `marcasDeGrupoAberto([{ nome: "VIP Revenda 40", seq: 40, grupo: "g40@g.us", quando: "2026-10-02T12:14:00.000Z" }], { comNome: true })[0].texto === "VIP Revenda 40 aberto"`, e sem a opção continua `"#40 aberto"`. Ver falhar; acrescentar o segundo parâmetro opcional `opcoes: { comNome?: boolean } = {}` e usar `g.nome` quando `comNome`. Na loja inteira "#40" é ambíguo entre campanhas.
- [ ] **Step 2: `disparos` com o tipo real.** O servidor manda `TenantDispatchView[]` (`buildTenantDispatchList`), e o cliente tipa como `Disparo`. Em `components/painel/home/types.ts`, fazer `export type Disparo = TenantDispatchView;` (import type de `@/lib/campaigns/dispatch-view`) e conferir que os usos da Vitrine (`ultimo-post.tsx`, `inicio-vitrine.tsx`) ainda compilam — os campos que eles leem (`id`, `status`, `sent`, `total`, `dispatchedAt`, `body`, `campaignName`) existem no tipo do servidor. Se algum não bater, parar e reportar NEEDS_CONTEXT em vez de forçar com cast.
- [ ] **Step 3: O componente.** `entradas-e-saidas.tsx`, `"use client"`, seguindo `AnaliseDaCampanha`/`Graficos` de `analise.tsx` só para entradas e saídas (sem a coluna de cliques — os cliques da loja já estão na faixa):
  - `section` com `aria-labelledby`, cabeçalho com `<h2 className="text-[16px] font-semibold text-volt-950">Entradas e saídas</h2>`, o segmentado Hoje, por hora · 7 dias · <mês> (botões com `aria-pressed`, mesmo visual do de `analise.tsx`) e à direita `diaPorExtenso(hoje) · dados até HH:MM`.
  - `atividade` nulo: `<p>` "A série não carregou." (a faixa já diz o mesmo; sem botão de tentar de novo — a recarga de 60 s tenta sozinha).
  - Com dado: `figure` com `figcaption` (`"Entradas e saídas {quando}"` + `fraseDoMovimento(entradas, somaMedida(entradas), quando, algoSemMedicao ? medindoDesde(a.entradasDesde) : null, "nos grupos da loja")`) e o `GraficoDeBarras` com `key={periodo}`, `barras={barrasDaAtividade(a, periodo, "entraram", "sairam")}`, `unidade`/`unidadeAbaixo`, `rotuloACada={periodo === "hoje" ? 3 : 1}`, `agora` em Hoje, `rotuloSemMedicao={medindoDesde(a.entradasDesde)}` e `marcas` em Hoje = `[...marcasDePost(posts, new Date(a.geradoEm)), ...marcasDeGrupoAberto(a.gruposAbertosHoje, { comNome: true })]` ordenadas por `posicao`.
  - Legenda igual à de `analise.tsx` (Entraram `bg-serie`, Saíram `bg-saida`) com o texto "cada entrada e saída nos grupos da loja em que você é admin".
  - Os mesmos `useMemo` de `Graficos`.
- [ ] **Step 4: Montar.** Em `inicio-ao-vivo.tsx`, prop `disparos: Disparo[]`, renderizar `<EntradasESaidas atividade={atividade} posts={disparos} />` logo depois do `<MapaDosGrupos … />`; comentário do componente: PR 3 = o gráfico. Em `page.tsx`, passar `disparos={disparos}`.
- [ ] **Step 5: e2e.** No primeiro teste de `painel-inicio-ao-vivo.spec.ts`, depois da asserção do mapa: `await expect(page.getByTestId("inicio-entradas").getByRole("heading", { name: "Entradas e saídas" })).toBeVisible();`.
- [ ] **Step 6: Spec.** Na seção "Entradas e saídas por hora": a marca "relâmpago no ar" entra no PR 5, junto com a parte `relampago`; e as marcas usam as até duas linhas de rótulo do `GraficoDeBarras` (as que não cabem ficam só com o traço), no lugar de "no máximo 4 marcas visíveis". O grupo aberto aparece com o nome ("VIP Revenda 40 aberto").
- [ ] **Step 7:** os dois `tsc`, lint, `npm test`. Commits: `feat(painel): store-wide join/leave chart on the live home` (código + teste) e `docs: Início ao vivo spec notes for PR 3` (spec), cada um só com os seus arquivos.

---

### Task 3: PR, CI, merge e verificação em produção

- [ ] `git fetch origin main && git merge origin/main`; `git diff origin/main...HEAD --stat` só com os arquivos deste plano.
- [ ] Push, `gh pr create` (`feat(painel): Início ao vivo PR 3 — entradas e saídas por hora (?ao-vivo)`, corpo com resumo, teste e `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), `mcp__ccd_pr__get_status`.
- [ ] CI verde → `gh pr merge <N> --squash` → apagar o branch remoto.
- [ ] Produção logado em `/painel?ao-vivo` (1440 / 1100 / 390): o gráfico de Hoje bate com `porHora` da API; a faixa "medindo desde" aparece nas horas antes da medição em 7 dias/Mês; marcas de post do dia aparecem; contraste sem falha; a página de uma campanha continua com os mesmos textos da Análise.
