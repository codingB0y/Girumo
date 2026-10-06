# Painel G2 — PR 3 (faixa de status da Início ao vivo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A faixa da Início ao vivo vira a do mockup G2: célula AO VIVO + hora + data, Entraram (número, variação, faísca, "N na terça passada, mesma hora"), Saíram (número e variação pela mesma regra; antes de 7 dias medidos, "medindo desde"), Cliques nos links (hoje; legenda "no total: VIP 263 · Saldão 48 · Brás 17"), Pedidos anotados hoje ("N pedidos · outubro em X% da meta" + editar meta) e, no fim, "atualizado há N min" com o botão de atualizar. **O Saldo sai.** No celular: cabeçalho (AO VIVO · hora · data · "há N min") e quatro células roláveis com rótulo, número de 28 px e variação, sem legendas.

**Architecture:** As regras de texto e de comparação ficam puras em `lib/painel/ao-vivo/faixa.ts` (TDD). `faixa-de-status.tsx` é reescrito num DOM só com três arranjos por CSS: celular (< 768), cabeçalho + grade de 2/4 colunas (768–1399) e uma linha só a partir de 1400 px (a mesma largura em que a Início ganha as três colunas). Os cliques por campanha usam `clicksByCampaign` (`lib/links/click-attribution.ts`, já existe). Nenhum dado novo: tudo vem em `/api/painel/inicio`.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, `node --test` via tsx, Playwright (CI).

**Spec:** `docs/superpowers/specs/2026-10-05-painel-g2-barra-volt-design.md` (decisão 6; decisões 3 e 11 como restrição; tabela de PRs, linha 3)

## Global Constraints

- **Acid** só no chip AO VIVO (`pn-chip pn-chip--acid`, um `span`). Zero `button`/`a` com `bg-acid` (regra 10, `painel-vitrine-casca.spec.ts` e `painel-inicio-ao-vivo.spec.ts`).
- **Tamanhos (decisão 3):** rótulo e legenda `text-13`; números em `font-display font-bold tracking-[-0.015em]`: 32 na faixa a partir de 768 (`md:text-32`), 28 no celular (`text-28`) e na hora da célula AO VIVO na linha larga; a hora do cabeçalho é 16. **Nenhum texto de 12 px novo** (o `pn-chip` é a exceção da decisão 3). O "atualizado há" sai de `text-12` para `text-13`; a legenda "7 dias" da faísca não aparece na faixa.
- **`text-13` nunca passa por `cn()` junto com cor de texto.** O tailwind-merge 3 lê `text-13` como cor e o apaga (verificado em `apps/web`: `twMerge('text-13 font-semibold','text-danger-700')` → `"font-semibold text-danger-700"`). Na faixa as classes são string pura.
- **Um DOM só para todas as larguras.** Nada de texto duplicado escondido por CSS com o mesmo conteúdo: o `getByText` do Playwright é estrito e quebra com dois elementos. Só trechos complementares (`Pedidos<span class="max-md:hidden"> anotados</span> hoje`).
- **Contratos de e2e preservados:** `data-testid="inicio-faixa"`; `role="group"` "Números de hoje" com as células como filhos diretos; o chip casa `/AO VIVO/` uma vez; "Entraram hoje" e "Pedidos anotados hoje" visíveis a partir de 768 (o projeto `chromium` roda em 1280×720); o botão `/^(definir|editar) meta$/` e o campo "Meta do mês em R$" a partir de 768, com Esc/Cancelar devolvendo o foco ao botão; a âncora `/Entraram hoje/` de `e2e/conteudo-esperado.ts`.
- **Sem API, store ou DDL.** `links[].campaignGroupId` já vem de `carregarLinks` (`src/lib/painel/inicio-carga.ts:119`); só o tipo do cliente não o declarava. Filtros de tenant intocados.
- Arquivos < 800 linhas, funções < 50; sem dependência nova (`RefreshCw` é do `lucide-react` já instalado).
- Comentários e identificadores em pt-BR (como os arquivos); commits em inglês com prefixo semântico, terminando com a linha de atribuição da sessão (hoje `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json` (lint e tsx não checam tipo); lint `npm run lint`; suíte `npm test`; lint da vitrine `npm run painel:check`.
- Git: o cwd do Bash reseta entre chamadas, então `git -C <worktree>` com caminho absoluto. Nunca `git add -A`; `git diff --cached --stat` numa chamada separada antes de cada commit (um agente externo já sujou o índice antes).

## Onde a spec e o código divergem (decidido neste plano)

1. **Atribuição dos cliques.** Spec, "Dados": *"Cliques por campanha somam `TrackedLink.clicks` por `campaignName`"*. Código, `inicio-carga.ts:117`: *"Vínculo por ID: é o que sobrevive a renomear a campanha. `campaignName` continua exposto só para os links antigos, que ainda não têm o ID."* Link novo chega com `campaignName: ""`. **O plano usa `clicksByCampaign`** (ID primeiro, nome só no link legado), a mesma regra de `/painel/campanhas`.
2. **Meta do mês no celular.** Spec, decisão 6: *"No celular: … quatro células roláveis com rótulo, número de 28 px e variação, sem legendas."* Código atual (`faixa-de-status.tsx`): *"No celular o botão desce para a própria linha: a célula não passa de 260 px."* O editor da faixa é o **único** lugar do painel que grava `monthlyGoalRevenue` (`grep monthlyGoalRevenue src` só acha a faixa e a API). **O plano segue a spec**: no celular a meta não se edita; a partir de 768 px, sim. Se o Igor quiser o "editar meta" no celular, é tirar o `max-md:hidden` só do botão (uma linha na Task 3).
3. **"A comparação começa em DD/MM".** Código atual, legenda de Entraram no desktop: *"medindo desde … · a comparação com a semana passada começa em {comparacaoComecaEm(…)}"*. Spec: *"antes, 'medindo desde'"*. **O plano tira o "começa em"** e apaga `comparacaoComecaEm` (fica sem uso). `entradasDesde` é a constante global `ENTRADAS_E_SAIDAS_DESDE` (30/09 23:01), então o estado "medindo" acaba para todo tenant em 08/10.
4. **Largura.** O mockup G2 só desenha 1440 e 390, com legendas curtas ("VIP 263", sem "editar meta"). Com texto real a linha única não cabe abaixo de ~1400 px (medido pelo mockup: ~6,4 px por caractere a 13 px; as células fixas somam ~1.120 px). **O plano põe a linha única a partir de 1400 px**; de 768 a 1399, cabeçalho em cima e as quatro células em grade. Na linha única a legenda dos cliques encurta com "…" e leva o texto inteiro no `title`.
5. **Rótulos.** Mockup: "Saíram" (sem "hoje") e "27 na terça passada" (sem "mesma hora"); o plano segue o mockup. O raio continua `10px`, igual ao mapa, ao postando e ao gráfico ao lado (a spec cita o raio 12 do Bling, mas trocar só a faixa desalinharia a tela; os PRs 4 e 5 mexem nos vizinhos).
6. **`numeros.tsx` é compartilhado** com `campanhas/detalhe/visao-geral.tsx`. O plano só acrescenta `legenda?` à `Faisca` (padrão `true`, a campanha não muda) e tira o `curto` de `ContraSemanaPassada` (só a faixa usava). O "7 dias" de 12 px da campanha continua lá: fora do escopo.

## File Structure

| Arquivo (em `apps/web`) | Ação | Responsabilidade |
|---|---|---|
| `src/lib/painel/ao-vivo/faixa.ts` (+ `.test.ts`) | reescrever | números da faixa sem saldo; variação; legendas de comparação, cliques e pedidos; "há quanto"; data do AO VIVO |
| `src/components/painel/home/ao-vivo/faixa-de-status.tsx` | reescrever | a faixa G2 nos três arranjos |
| `src/components/painel/numeros.tsx` | modificar | `Faisca` com `legenda?`; `ContraSemanaPassada` sem `curto` |
| `src/components/painel/home/types.ts` | modificar | `TrackedLink.campaignGroupId` |
| `src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx` | modificar | passa `campanhas` e `onAtualizar` à faixa |
| `e2e/painel-inicio-ao-vivo.spec.ts` | modificar | celular com 4 células; linha única em 1440; cabeçalho + grade em 1100 |

`src/app/painel-vitrine.css` não tem regra de faixa (`grep -n faixa` vazio): nada muda lá.

### Ondas (regra de subagentes paralelos)

| Onda | Tasks | Por quê |
|---|---|---|
| 0 | Task 0 | preparação |
| 1 | Task 1 ∥ Task 2 | arquivos disjuntos; o e2e não importa a lib |
| 2 | Task 3 | importa as funções da Task 1 |
| 3 | Task 4 | gate local, revisão, PR, produção |

Implementadores não commitam; o controller commita por task, na ordem da onda.

---

### Task 0: preparação

**Files:** nenhum
**Depends-on:** PR #387 (G2 PR 2) mergeado

- [ ] **Step 1:** `gh pr view 387 --json state,mergedAt` → `MERGED`. Se não: parar. Este PR mexe em `inicio-ao-vivo.tsx`, que o #387 também mudou.
- [ ] **Step 2:** no worktree da sessão (nunca o checkout principal; nunca `git worktree add`, o harness bloqueia escrever em outro worktree): `git -C <worktree> status --short` vazio, `git -C <worktree> fetch origin main`, `git -C <worktree> switch -c feat/painel-g2-faixa origin/main`.
- [ ] **Step 3:** conferir a base que este plano assume:
  - `git -C <worktree> grep -n "NUMERO_28\|comparacaoComecaEm" apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx` → as duas existem;
  - `git -C <worktree> grep -n "mostrarChecklist = settingsOk" apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx` → existe (o checklist em toda largura do PR 2).
  Se algo divergir, parar e reler os arquivos antes de seguir.
- [ ] **Step 4:** `gh pr list --state open` — nenhuma outra sessão com PR em `faixa-de-status.tsx` ou `faixa.ts`.
- [ ] **Step 5:** o card `painel-g2-barra-volt` continua `em_construcao` (é o card da série; só vai a `no_ar_verificado` depois do PR 5). Nada a mover.

### Task 1: regras da faixa G2 (TDD)

**Files:** `apps/web/src/lib/painel/ao-vivo/faixa.ts`, `apps/web/src/lib/painel/ao-vivo/faixa.test.ts`
**Depends-on:** Task 0

> O `tsc` do app fica vermelho entre esta task e a Task 3 (`faixa-de-status.tsx` ainda importa `atualizadoHa` e lê `n.saldo`). Aqui roda só o teste da unidade; o PR é squash.

- [ ] **Step 1 (teste):** substituir `faixa.test.ts` inteiro por:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { AtividadeDaCampanha, Movimento, PontoDaSerie } from "@/lib/painel/atividade";
import {
  dataDaFaixa,
  haQuanto,
  legendaDaComparacao,
  legendaDosCliques,
  legendaDosPedidos,
  numerosDaFaixa,
  pedidosDeHoje,
  variacaoNaFaixa,
  type Comparacao,
} from "./faixa";

const ponto = (inicio: string, p: Partial<PontoDaSerie> = {}): PontoDaSerie => ({
  inicio, novas: 0, cliques: 0, entraram: 0, sairam: 0, ...p,
});

function atividade(geradoEm: string, porHora: PontoDaSerie[], porDia: PontoDaSerie[], semanaPassada: Partial<Movimento> = {}): AtividadeDaCampanha {
  return {
    geradoEm,
    entradasDesde: "2026-10-01T02:01:58.000Z",
    porHora,
    porDia,
    semanaPassada: { novas: 0, cliques: 0, entraram: 0, sairam: 0, ...semanaPassada },
    hojePorGrupo: {},
    gruposAbertosHoje: [],
  };
}

test("soma entraram, saíram e cliques de hoje", () => {
  const a = atividade(
    "2026-10-02T17:10:00.000Z",
    [ponto("2026-10-02T12:00:00.000Z", { entraram: 10, sairam: 2, cliques: 30 }), ponto("2026-10-02T16:00:00.000Z", { entraram: 5, sairam: 1, cliques: 4 })],
    [ponto("2026-10-01T03:00:00.000Z", { entraram: 20, sairam: 3 }), ponto("2026-10-02T03:00:00.000Z", { entraram: 15, sairam: 3 })],
  );
  const n = numerosDaFaixa(a);
  assert.equal(n.entraram, 15);
  assert.equal(n.sairam, 3);
  assert.equal(n.cliques, 34);
  // As barras vêm dos dias da série; o último é hoje, aceso.
  assert.equal(n.seteDias.at(-1)?.atual, true);
});

test("antes de 7 dias medidos não compara: diz desde quando mede", () => {
  const a = atividade("2026-10-02T17:10:00.000Z", [], [], { entraram: 99, sairam: 9 });
  assert.deepEqual(numerosDaFaixa(a).comparacao, { tipo: "medindo", desde: "2026-10-01T02:01:58.000Z" });
});

test("com a semana passada medida, compara entradas e saídas com ela", () => {
  const a = atividade("2026-10-09T17:10:00.000Z", [], [], { entraram: 40, sairam: 6 });
  assert.deepEqual(numerosDaFaixa(a).comparacao, {
    tipo: "contra",
    antes: { entraram: 40, sairam: 6 },
    diaPassado: "na sexta passada",
  });
});

test("variação: sinal de menos tipográfico, e nas saídas cair é bom", () => {
  assert.deepEqual(variacaoNaFaixa(214, 181), { texto: "+18%", bom: true });
  assert.deepEqual(variacaoNaFaixa(150, 181), { texto: "−17%", bom: false });
  assert.deepEqual(variacaoNaFaixa(23, 27, true), { texto: "−15%", bom: true });
  assert.deepEqual(variacaoNaFaixa(30, 27, true), { texto: "+11%", bom: false });
  assert.deepEqual(variacaoNaFaixa(10, 10, true), { texto: "0%", bom: true });
});

test("sem base na semana passada não há variação", () => {
  assert.equal(variacaoNaFaixa(5, 0), null);
});

test("legenda de entradas e saídas: o número da semana passada, ou desde quando mede", () => {
  const contra: Comparacao = { tipo: "contra", antes: { entraram: 1236, sairam: 27 }, diaPassado: "na terça passada" };
  assert.equal(legendaDaComparacao(contra, "entraram"), "1.236 na terça passada, mesma hora");
  assert.equal(legendaDaComparacao(contra, "sairam"), "27 na terça passada");
  const medindo: Comparacao = { tipo: "medindo", desde: "2026-10-01T02:01:58.000Z" };
  assert.equal(legendaDaComparacao(medindo, "entraram"), "medindo desde 30/09, 23h");
  assert.equal(legendaDaComparacao(medindo, "sairam"), "medindo desde 30/09, 23h");
});

const CAMPANHAS = [
  { id: "c1", name: "VIP Revenda" },
  { id: "c2", name: "Saldão de Setembro" },
  { id: "c3", name: "Lojistas do Brás" },
  { id: "c4", name: "Pouca Gente" },
];

test("legenda dos cliques: as três campanhas com mais cliques, no total", () => {
  const links = [
    { campaignGroupId: "c1", clicks: 200 },
    { campaignGroupId: "c1", clicks: 63 },
    { campaignGroupId: "c2", clicks: 48 },
    // Link antigo, sem o ID: casa pelo nome (regra de click-attribution).
    { campaignName: "lojistas do brás", clicks: 17 },
    { campaignGroupId: "c4", clicks: 2 },
    // Campanha apagada: conta no total, mas não entra na lista.
    { campaignGroupId: "apagada", clicks: 500 },
  ];
  assert.equal(legendaDosCliques(links, CAMPANHAS), "no total: VIP Revenda 263 · Saldão de Setembro 48 · Lojistas do Brás 17");
});

test("legenda dos cliques sem campanha atribuída, e sem clique nenhum", () => {
  assert.equal(legendaDosCliques([{ campaignGroupId: "apagada", clicks: 1500 }], CAMPANHAS), "1.500 no total");
  assert.equal(legendaDosCliques([], CAMPANHAS), "ninguém clicou num link ainda");
  assert.equal(legendaDosCliques([{ campaignGroupId: "c1", clicks: 0 }], CAMPANHAS), "ninguém clicou num link ainda");
});

test("pedidos de hoje: só os de hoje em Brasília, e a meta do mês em %", () => {
  const agora = new Date("2026-10-02T17:00:00.000Z");
  const orders = [
    { value: 100, created_at: "2026-10-02T13:00:00.000Z" },
    { value: 50, created_at: "2026-10-02T02:30:00.000Z" }, // 01/10 23:30 em Brasília
    { value: 250, created_at: "2026-10-01T15:00:00.000Z" },
  ];
  assert.deepEqual(pedidosDeHoje(orders, 1000, agora), { quantidade: 1, valor: 100, metaPct: 40 });
  assert.equal(pedidosDeHoje(orders, null, agora).metaPct, null);
  assert.equal(pedidosDeHoje(orders, 0, agora).metaPct, null);
});

test("legenda dos pedidos: quantos, e o mês contra a meta", () => {
  const agora = new Date("2026-10-05T17:00:00.000Z");
  assert.equal(legendaDosPedidos({ quantidade: 6, valor: 1240, metaPct: 63 }, agora, true), "6 pedidos · outubro em 63% da meta");
  assert.equal(legendaDosPedidos({ quantidade: 1, valor: 50, metaPct: 0 }, agora, true), "1 pedido · outubro em 0% da meta");
  assert.equal(legendaDosPedidos({ quantidade: 0, valor: 0, metaPct: null }, agora, true), "nenhum pedido hoje · sem meta do mês");
  // A meta que não carregou não vira "sem meta".
  assert.equal(legendaDosPedidos({ quantidade: 6, valor: 1240, metaPct: null }, agora, false), "6 pedidos · meta não carregou");
  // 31/10 às 23h em Brasília ainda é outubro.
  assert.equal(legendaDosPedidos({ quantidade: 2, valor: 80, metaPct: 90 }, new Date("2026-11-01T02:00:00.000Z"), true), "2 pedidos · outubro em 90% da meta");
});

test("há quanto: agora, minutos e horas", () => {
  const agora = new Date("2026-10-02T17:10:00.000Z");
  assert.equal(haQuanto("2026-10-02T17:09:40.000Z", agora), "agora");
  assert.equal(haQuanto("2026-10-02T17:07:00.000Z", agora), "há 3 min");
  assert.equal(haQuanto("2026-10-02T15:05:00.000Z", agora), "há 2 h");
});

test("data do AO VIVO por extenso e curta, no fuso de Brasília", () => {
  const esperado = { longa: "segunda, 5 de outubro", curta: "segunda 05/10" };
  assert.deepEqual(dataDaFaixa(new Date("2026-10-05T17:00:00.000Z")), esperado);
  // 23h30 de segunda em Brasília já é terça em UTC.
  assert.deepEqual(dataDaFaixa(new Date("2026-10-06T02:30:00.000Z")), esperado);
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/ao-vivo/faixa.test.ts` → FAIL (`variacaoNaFaixa`, `legendaDaComparacao`, `legendaDosCliques`, `legendaDosPedidos`, `haQuanto`, `dataDaFaixa` não existem).
- [ ] **Step 3:** substituir `faixa.ts` inteiro por:

```ts
import { dayBR, dayBROf, monthBR } from "@/lib/date-br";
import { clicksByCampaign, type AttributableCampaign, type AttributableLink } from "@/lib/links/click-attribution";
import {
  barrasDaAtividade,
  diaDaSemanaPassada,
  diaPorExtenso,
  nomeDoMes,
  semanaPassadaMedida,
  somaDa,
  somaMedida,
  variacao,
  type AtividadeDaCampanha,
  type Barra,
  type Movimento,
} from "@/lib/painel/atividade";
import { medindoDesde } from "@/lib/painel/atividade-texto";
import { numero } from "@/lib/painel/grupos";
import { revenueInMonth, type MonthlyOrder } from "@/lib/painel-metrics";

/**
 * A faixa de status da Início "Ao vivo" (spec 2026-10-02; G2 em 2026-10-05, decisão 6): a loja
 * inteira hoje. Mesmas contas da faixa da campanha (`visao-geral.tsx`), sobre a série da loja.
 * O saldo saiu da faixa: ele aparece no gráfico ("214 entraram · 23 saíram").
 */

export type Comparacao =
  | { tipo: "contra"; antes: Movimento; diaPassado: string }
  | { tipo: "medindo"; desde: string };

export type NumerosDaFaixa = {
  entraram: number;
  sairam: number;
  cliques: number;
  seteDias: Barra[];
  comparacao: Comparacao;
};

export type PedidosDeHoje = { quantidade: number; valor: number; metaPct: number | null };

export type VariacaoDaFaixa = { texto: string; bom: boolean };

const MIN_MS = 60_000;
/** A legenda dos cliques nomeia no máximo três campanhas (spec G2, decisão 6). */
const CAMPANHAS_NA_LEGENDA = 3;

export function numerosDaFaixa(a: AtividadeDaCampanha): NumerosDaFaixa {
  const hoje = somaMedida(barrasDaAtividade(a, "hoje", "entraram", "sairam"));
  return {
    entraram: hoje.entraram,
    sairam: hoje.sairam,
    cliques: somaDa(a.porHora, "cliques"),
    seteDias: barrasDaAtividade(a, "7d", "entraram"),
    comparacao: semanaPassadaMedida(a)
      ? {
          tipo: "contra",
          antes: { entraram: a.semanaPassada.entraram, sairam: a.semanaPassada.sairam },
          diaPassado: diaDaSemanaPassada(dayBR(new Date(a.geradoEm)), true),
        }
      : { tipo: "medindo", desde: a.entradasDesde },
  };
}

/**
 * "+18%" ou "−15%" (o sinal de menos tipográfico) e se o movimento é bom: mais entradas é bom; nas
 * saídas (`menosEMelhor`), cair é bom. Sem base na semana passada, null: não há o que comparar.
 */
export function variacaoNaFaixa(hoje: number, antes: number, menosEMelhor = false): VariacaoDaFaixa | null {
  const delta = variacao(hoje, antes);
  if (delta === null) return null;
  const sinal = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return { texto: `${sinal}${Math.abs(delta)}%`, bom: menosEMelhor ? delta <= 0 : delta >= 0 };
}

/**
 * Legenda de Entraram ("181 na terça passada, mesma hora") e de Saíram ("27 na terça passada",
 * como no mockup G2). Antes de 7 dias medidos, "medindo desde …" nas duas.
 */
export function legendaDaComparacao(c: Comparacao, medida: keyof Movimento): string {
  if (c.tipo === "medindo") return medindoDesde(c.desde);
  const base = `${numero(c.antes[medida])} ${c.diaPassado}`;
  return medida === "entraram" ? `${base}, mesma hora` : base;
}

/**
 * Legenda de "Cliques nos links": as três campanhas com mais cliques desde sempre (o número da célula
 * é de hoje; por isso "no total"). Atribuição de `click-attribution`: o ID manda, o nome só no link
 * legado. Clique de link sem campanha conta no total e não entra na lista.
 */
export function legendaDosCliques(links: readonly AttributableLink[], campanhas: readonly AttributableCampaign[]): string {
  const total = links.reduce((s, l) => s + (l.clicks ?? 0), 0);
  if (total === 0) return "ninguém clicou num link ainda";
  const porCampanha = clicksByCampaign(links, campanhas);
  const cliquesDe = (c: AttributableCampaign) => porCampanha.get(c.id) ?? 0;
  const maiores = campanhas
    .filter((c) => cliquesDe(c) > 0)
    .sort((a, b) => cliquesDe(b) - cliquesDe(a))
    .slice(0, CAMPANHAS_NA_LEGENDA);
  if (maiores.length === 0) return `${numero(total)} no total`;
  return `no total: ${maiores.map((c) => `${c.name} ${numero(cliquesDe(c))}`).join(" · ")}`;
}

export function pedidosDeHoje(orders: readonly MonthlyOrder[], metaDoMes: number | null, agora: Date): PedidosDeHoje {
  const hoje = dayBR(agora);
  const deHoje = orders.filter((o) => dayBROf(o.created_at) === hoje);
  const doMes = revenueInMonth(orders, monthBR(agora));
  return {
    quantidade: deHoje.length,
    valor: deHoje.reduce((s, o) => s + (o.value ?? 0), 0),
    metaPct: metaDoMes && metaDoMes > 0 ? Math.round((doMes / metaDoMes) * 100) : null,
  };
}

/** "6 pedidos · outubro em 63% da meta". A meta que não carregou não vira "sem meta do mês". */
export function legendaDosPedidos(p: PedidosDeHoje, agora: Date, metaOk: boolean): string {
  const quantos = p.quantidade === 0 ? "nenhum pedido hoje" : `${numero(p.quantidade)} ${p.quantidade === 1 ? "pedido" : "pedidos"}`;
  if (!metaOk) return `${quantos} · meta não carregou`;
  if (p.metaPct === null) return `${quantos} · sem meta do mês`;
  return `${quantos} · ${nomeDoMes(dayBR(agora)).toLowerCase()} em ${p.metaPct}% da meta`;
}

/** "agora", "há 3 min", "há 2 h": a idade da série. A faixa põe "atualizado" na frente a partir de 768 px. */
export function haQuanto(geradoEm: string, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - Date.parse(geradoEm)) / MIN_MS);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  return `há ${Math.floor(minutos / 60)} h`;
}

/** A data do AO VIVO no fuso de Brasília: "segunda, 5 de outubro" e, no celular, "segunda 05/10". */
export function dataDaFaixa(agora: Date): { longa: string; curta: string } {
  const dia = dayBR(agora);
  const longa = diaPorExtenso(dia);
  return { longa, curta: `${longa.split(",")[0]} ${dia.slice(8)}/${dia.slice(5, 7)}` };
}
```

- [ ] **Step 4:** o comando do Step 2 → PASS (12 testes).
- [ ] **Step 5:** `git -C <worktree> add apps/web/src/lib/painel/ao-vivo/faixa.ts apps/web/src/lib/painel/ao-vivo/faixa.test.ts`; `git -C <worktree> diff --cached --stat` (só os dois); commit `feat(painel): G2 strip rules: exits vs last week, top campaigns by clicks, orders vs month goal`.

### Task 2: e2e da faixa G2

**Files:** `apps/web/e2e/painel-inicio-ao-vivo.spec.ts`
**Depends-on:** Task 0

- [ ] **Step 1:** no `describe("Início ao vivo no celular")`, substituir o teste inteiro

```ts
  test("a faixa rola de lado e nenhuma célula passa de 260 px", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-faixa")).toBeVisible({ timeout: 30_000 });
    const larguras = await page
      .getByRole("group", { name: "Números de hoje" })
      .evaluate((el) => ({ celulas: [...el.children].map((c) => c.getBoundingClientRect().width), rola: el.scrollWidth > el.clientWidth }));
    expect(larguras.celulas).toHaveLength(5);
    expect(Math.max(...larguras.celulas)).toBeLessThanOrEqual(260);
    expect(larguras.rola).toBe(true);
  });
```

  por

```ts
  test("a faixa do celular: cabeçalho AO VIVO e quatro células roláveis de até 260 px, sem legendas nem Saldo", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const faixa = page.getByTestId("inicio-faixa");
    await expect(faixa).toBeVisible({ timeout: 30_000 });
    await expect(faixa.getByText(/AO VIVO/)).toBeVisible();
    const medidas = await faixa
      .getByRole("group", { name: "Números de hoje" })
      .evaluate((el) => ({ celulas: [...el.children].map((c) => c.getBoundingClientRect().width), rolagem: getComputedStyle(el).overflowX }));
    expect(medidas.celulas).toHaveLength(4);
    expect(Math.max(...medidas.celulas)).toBeLessThanOrEqual(260);
    // Rola quando não cabe. Com os números pequenos do tenant de QA as quatro podem caber em 390 px,
    // então o contrato é a rolagem ligada, não o conteúdo transbordando.
    expect(medidas.rolagem).toBe("auto");
    await expect(faixa.getByText("Saldo hoje", { exact: true })).toHaveCount(0);
    // Sem legenda no celular (spec G2, decisão 6): a das entradas está no DOM, escondida.
    await expect(faixa.getByText(/^medindo desde|, mesma hora$/).first()).toBeHidden();
    await expect(faixa.getByRole("button", { name: "Atualizar agora" })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
```

- [ ] **Step 2:** no `describe("Início ao vivo a partir de 768 px")` (viewport 1440), acrescentar no fim:

```ts
  test("a faixa é uma linha só: AO VIVO, quatro números e o atualizar no fim; o Saldo saiu", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const faixa = page.getByTestId("inicio-faixa");
    await expect(faixa).toBeVisible({ timeout: 30_000 });
    for (const rotulo of ["Entraram hoje", "Saíram", "Cliques nos links", "Pedidos anotados hoje"]) {
      await expect(faixa.getByText(rotulo, { exact: true })).toBeVisible();
    }
    await expect(faixa.getByText("Saldo hoje", { exact: true })).toHaveCount(0);
    const atualizar = faixa.getByRole("button", { name: "Atualizar agora" });
    await expect(atualizar).toBeVisible();
    await expect(faixa.getByText(/^atualizado (agora|há \d+ (min|h))$|não carregou$/)).toBeVisible();
    const [numeros, botao] = await Promise.all([faixa.getByRole("group", { name: "Números de hoje" }).boundingBox(), atualizar.boundingBox()]);
    expect(numeros).not.toBeNull();
    expect(botao).not.toBeNull();
    // Mesma linha: o botão à direita dos números e dentro da altura deles.
    expect(botao!.x).toBeGreaterThanOrEqual(numeros!.x + numeros!.width - 1);
    const meio = botao!.y + botao!.height / 2;
    expect(meio).toBeGreaterThan(numeros!.y);
    expect(meio).toBeLessThan(numeros!.y + numeros!.height);
    // O botão refaz a carga da tela (a mesma recarga silenciosa do minuto).
    const recarga = page.waitForRequest((r) => r.url().includes("/api/painel/inicio"));
    await atualizar.click();
    await recarga;
  });
```

- [ ] **Step 3:** acrescentar no fim do arquivo:

```ts
test.describe("Início ao vivo entre 768 e 1400 px", () => {
  test.use({ viewport: { width: 1100, height: 900 } });

  test("a faixa põe AO VIVO e o atualizar numa linha em cima e os quatro números embaixo", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const faixa = page.getByTestId("inicio-faixa");
    await expect(faixa).toBeVisible({ timeout: 30_000 });
    const grupo = faixa.getByRole("group", { name: "Números de hoje" });
    await expect(grupo.locator(":scope > *")).toHaveCount(4);
    const [numeros, botao] = await Promise.all([grupo.boundingBox(), faixa.getByRole("button", { name: "Atualizar agora" }).boundingBox()]);
    expect(numeros).not.toBeNull();
    expect(botao).not.toBeNull();
    expect(botao!.y + botao!.height).toBeLessThanOrEqual(numeros!.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
```

- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.e2e.json` → limpo. (O e2e só roda no CI.)
- [ ] **Step 5:** `git -C <worktree> add apps/web/e2e/painel-inicio-ao-vivo.spec.ts`; `diff --cached --stat`; commit `test(e2e): G2 strip: one line from 1400 px, header over the grid below it, four phone cells`.

### Task 3: a faixa G2 no componente

**Files:** `apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx`, `apps/web/src/components/painel/numeros.tsx`, `apps/web/src/components/painel/home/types.ts`, `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx`
**Depends-on:** Task 1

- [ ] **Step 1:** `types.ts`, trocar

```ts
export type TrackedLink = {
  slug: string;
  campaignName?: string;
  clicks: number;
};
```

  por

```ts
export type TrackedLink = {
  slug: string;
  /** Vínculo com a campanha por ID (`carregarLinks` já devolve); `campaignName` só vale no link antigo. */
  campaignGroupId?: string | null;
  campaignName?: string;
  clicks: number;
};
```

- [ ] **Step 2:** `numeros.tsx` inteiro:

```tsx
"use client";

/** Peças da faixa de números da campanha (direção D); a faísca também está na faixa da Início "Ao vivo". */

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { variacao, type Barra } from "@/lib/painel/atividade";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";

export function Celula({ rotulo, valor, className, children }: { rotulo: string; valor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("bg-paper-0 px-5 py-4", className)}>
      <p className="text-13 text-slate-600">{rotulo}</p>
      <p className="mt-2 font-display text-32 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950">{valor}</p>
      <div className="mt-2.5 text-13 text-slate-600">{children}</div>
    </div>
  );
}

/** Hoje contra o mesmo dia da semana passada, até a mesma hora: dia parcial contra dia parcial. */
export function ContraSemanaPassada({ hoje, antes, diaPassado }: { hoje: number; antes: number; diaPassado: string }) {
  const delta = variacao(hoje, antes);
  if (delta === null) return <>{numero(antes)} {diaPassado}, mesma hora</>;
  return (
    <>
      <span className={cn("inline-flex items-center font-semibold", delta >= 0 ? "text-success-700" : "text-danger-700")}>
        {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
        {delta > 0 ? "+" : ""}
        {delta}%
      </span>{" "}
      {`vs ${numero(antes)} ${diaPassado}, mesma hora`}
    </>
  );
}

/** Entraram contra saíram hoje, numa barra só. */
export function EntrouSaiu({ entraram, sairam }: { entraram: number; sairam: number }) {
  const total = entraram + sairam;
  return (
    <span className="mb-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-line-200" aria-hidden="true">
      {total > 0 && <span className="bg-serie" style={{ width: `${(entraram / total) * 100}%` }} />}
      {total > 0 && <span className="bg-saida" style={{ width: `${(sairam / total) * 100}%` }} />}
    </span>
  );
}

/**
 * Os últimos 7 dias em miniatura; o de hoje aceso, e dia sem medição só com o traço. Sem `legenda`,
 * só as barras: na faixa da Início elas ficam ao lado do número, na altura dele.
 */
export function Faisca({ barras, legenda = true }: { barras: Barra[]; legenda?: boolean }) {
  const max = Math.max(1, ...barras.map((b) => (b.semMedicao ? 0 : b.valor)));
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" aria-hidden="true">
      <span className="flex h-8 items-end gap-[3px]">
        {barras.map((b) => (
          <span
            key={b.chave}
            className={cn("block w-[5px] rounded-t-[1px]", b.semMedicao ? "bg-line-200" : b.atual ? "bg-serie" : "bg-slate-600/50")}
            style={{ height: b.semMedicao ? 2 : `${Math.max(8, (b.valor / max) * 100)}%` }}
          />
        ))}
      </span>
      {legenda && <span className="text-12 text-slate-600">7 dias</span>}
    </span>
  );
}
```

- [ ] **Step 3:** `faixa-de-status.tsx` inteiro:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Faisca } from "@/components/painel/numeros";
import type { Campanha, Order, TrackedLink } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import {
  dataDaFaixa,
  haQuanto,
  legendaDaComparacao,
  legendaDosCliques,
  legendaDosPedidos,
  numerosDaFaixa,
  pedidosDeHoje,
  variacaoNaFaixa,
} from "@/lib/painel/ao-vivo/faixa";
import { numero } from "@/lib/painel/grupos";
import { EditorDaMeta, useSalvarMeta } from "./meta-do-mes";

/*
 * Faixa G2 (spec 2026-10-05, decisão 6), três arranjos num DOM só:
 * - abaixo de 768 px: cabeçalho (AO VIVO · hora · data · "há N min") e quatro células que rolam de lado, sem legenda;
 * - de 768 a 1399 px: o mesmo cabeçalho, com o botão de atualizar, e as células em grade de 2 e depois 4 colunas;
 * - a partir de 1400 px (onde a Início ganha as três colunas): uma linha só, como no mockup.
 * Classes em string pura, sem `cn()`: o tailwind-merge 3 lê `text-13` como cor e o apaga ao lado de `text-slate-600`.
 */
const SECAO = [
  "grid grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden border border-line-200 bg-paper-0",
  "max-md:-mx-4 max-md:border-x-0 md:rounded-[10px]",
  "min-[87.5rem]:flex min-[87.5rem]:items-stretch min-[87.5rem]:px-5",
].join(" ");
const RELOGIO = [
  "col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 px-4 pt-2.5 pb-1.5 md:px-5 md:py-3",
  "min-[87.5rem]:flex-none min-[87.5rem]:flex-col min-[87.5rem]:items-start min-[87.5rem]:justify-center",
  "min-[87.5rem]:gap-1 min-[87.5rem]:py-4 min-[87.5rem]:pl-1 min-[87.5rem]:pr-6",
].join(" ");
const NUMEROS = [
  "col-span-2 row-start-2 flex overflow-x-auto px-4 pb-3 [scrollbar-width:none]",
  "md:grid md:grid-cols-2 md:gap-px md:overflow-visible md:border-t md:border-line-200 md:bg-line-200 md:p-0 lg:grid-cols-4",
  "min-[87.5rem]:flex min-[87.5rem]:min-w-0 min-[87.5rem]:flex-1 min-[87.5rem]:gap-0 min-[87.5rem]:border-t-0 min-[87.5rem]:bg-transparent",
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cobalt-500",
].join(" ");
const CELULA = [
  "flex flex-none flex-col whitespace-nowrap border-r border-line-200 bg-paper-0 pt-1.5 pr-[18px] mr-[18px] last:mr-0 last:border-r-0",
  "md:mr-0 md:border-r-0 md:px-5 md:py-4 md:whitespace-normal",
  "min-[87.5rem]:justify-center min-[87.5rem]:border-l min-[87.5rem]:px-6 min-[87.5rem]:whitespace-nowrap",
].join(" ");
/** A célula dos cliques fica com a sobra da linha larga; a legenda dela encurta com "…". */
const CELULA_FLEXIVEL = " min-[87.5rem]:min-w-0 min-[87.5rem]:flex-1";
const NUMERO = "font-display text-28 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950 md:text-32";
const HORA = "font-display text-[16px] font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950 min-[87.5rem]:text-28";
const BOTAO_DA_META = "font-semibold text-cobalt-500 underline-offset-2 hover:underline";
const BOTAO_ATUALIZAR = [
  "inline-grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-slate-600 hover:bg-hover-ficha hover:text-volt-950",
  "focus-visible:outline-2 focus-visible:outline-cobalt-500 max-md:hidden",
].join(" ");
const SEM_SERIE = "a série não carregou";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  atividade: AtividadeDaCampanha | null;
  campanhas: Campanha[];
  links: TrackedLink[];
  orders: Order[];
  metaDoMes: number | null;
  agora: Date;
  /** Falso = a parte não carregou: mostrar isso, não um zero que parece fato. */
  ordersOk: boolean;
  linksOk: boolean;
  settingsOk: boolean;
  /** Meta de receita gravada: a tela atualiza o dado sem recarregar. */
  onMetaSalva: (valor: number) => void;
  /** O botão no fim da faixa: a mesma recarga silenciosa que roda a cada minuto. */
  onAtualizar: () => void;
};

/** A faixa de status da Início "Ao vivo" (spec G2, decisão 6): a loja inteira hoje, numa linha. */
export function FaixaDeStatus({ atividade, campanhas, links, orders, metaDoMes, agora, ordersOk, linksOk, settingsOk, onMetaSalva, onAtualizar }: Props) {
  const n = atividade ? numerosDaFaixa(atividade) : null;
  // Semana passada medida: variação nas entradas e nas saídas. Antes disso, só o "medindo desde" da legenda.
  const antes = n && n.comparacao.tipo === "contra" ? n.comparacao.antes : null;
  const cliques = linksOk ? legendaDosCliques(links, campanhas) : "os links não carregaram";

  return (
    <section data-testid="inicio-faixa" aria-label="A loja hoje" className={SECAO}>
      <Relogio agora={agora} />
      {/* tabIndex: no celular as setas do teclado rolam a faixa. */}
      <div role="group" aria-label="Números de hoje" tabIndex={0} className={NUMEROS}>
        <CelulaDaFaixa
          rotulo="Entraram hoje"
          valor={n ? numero(n.entraram) : "—"}
          junto={
            n && (
              <>
                {antes && <Variacao hoje={n.entraram} antes={antes.entraram} />}
                <span className="max-md:hidden">
                  <Faisca barras={n.seteDias} legenda={false} />
                </span>
              </>
            )
          }
          legenda={n ? legendaDaComparacao(n.comparacao, "entraram") : SEM_SERIE}
        />
        <CelulaDaFaixa
          rotulo="Saíram"
          valor={n ? numero(n.sairam) : "—"}
          junto={n && antes && <Variacao hoje={n.sairam} antes={antes.sairam} menosEMelhor />}
          legenda={n ? legendaDaComparacao(n.comparacao, "sairam") : null}
        />
        <CelulaDaFaixa
          rotulo={
            <>
              Cliques<span className="max-md:hidden"> nos links</span>
            </>
          }
          valor={n ? numero(n.cliques) : "—"}
          legenda={cliques}
          legendaInteira={cliques}
        />
        <CelulaDosPedidos orders={orders} metaDoMes={metaDoMes} agora={agora} ordersOk={ordersOk} settingsOk={settingsOk} onMetaSalva={onMetaSalva} />
      </div>
      <Atualizado geradoEm={atividade?.geradoEm ?? null} agora={agora} onAtualizar={onAtualizar} />
    </section>
  );
}

/** AO VIVO, a hora e a data: a primeira célula na linha larga; o cabeçalho da faixa abaixo de 1400 px. */
function Relogio({ agora }: { agora: Date }) {
  const data = dataDaFaixa(agora);
  return (
    <div className={RELOGIO}>
      <span className="pn-chip pn-chip--acid">
        <span aria-hidden="true">●</span> AO VIVO
      </span>
      <time dateTime={agora.toISOString()} className={HORA}>
        {horaBR(agora.toISOString())}
      </time>
      <span className="min-w-0 truncate text-13 text-slate-600">
        <span className="max-md:hidden">{data.longa}</span>
        <span className="md:hidden">{data.curta}</span>
      </span>
    </div>
  );
}

type PropsDaCelula = {
  rotulo: ReactNode;
  valor: string;
  /** Ao lado do número: a variação contra a semana passada (e a faísca, nas entradas). */
  junto?: ReactNode;
  /** Some no celular (spec G2, decisão 6: lá a célula é rótulo, número e variação). */
  legenda: ReactNode;
  /** Só a dos cliques: na linha larga a célula fica com a sobra e a legenda encurta; o texto inteiro vai no title. */
  legendaInteira?: string;
};

function CelulaDaFaixa({ rotulo, valor, junto, legenda, legendaInteira }: PropsDaCelula) {
  const flexivel = legendaInteira !== undefined;
  return (
    <div className={flexivel ? CELULA + CELULA_FLEXIVEL : CELULA}>
      <p className="text-13 text-slate-600">{rotulo}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className={NUMERO}>{valor}</p>
        {junto}
      </div>
      <div title={legendaInteira} className={`mt-1.5 text-13 text-slate-600 max-md:hidden${flexivel ? " min-[87.5rem]:truncate" : ""}`}>
        {legenda}
      </div>
    </div>
  );
}

/** "+18%" ao lado do número: verde quando o movimento é bom (nas saídas, cair é bom). */
function Variacao({ hoje, antes, menosEMelhor = false }: { hoje: number; antes: number; menosEMelhor?: boolean }) {
  const v = variacaoNaFaixa(hoje, antes, menosEMelhor);
  if (!v) return null;
  return (
    <span className={`text-13 font-semibold tabular-nums ${v.bom ? "text-success-700" : "text-danger-700"}`}>
      {v.texto}
      <span className="sr-only"> contra a semana passada</span>
    </span>
  );
}

type PropsDosPedidos = Pick<Props, "orders" | "metaDoMes" | "agora" | "ordersOk" | "settingsOk" | "onMetaSalva">;

/** "Pedidos anotados hoje" com o editor da meta do mês: o único lugar do painel onde ela se define. */
function CelulaDosPedidos({ orders, metaDoMes, agora, ordersOk, settingsOk, onMetaSalva }: PropsDosPedidos) {
  const [editando, setEditando] = useState(false);
  const botaoDaMeta = useRef<HTMLButtonElement>(null);
  const jaEditou = useRef(false);
  const { salvando, salvar } = useSalvarMeta(onMetaSalva);
  // Fechar o editor (Esc, Cancelar, Salvar) devolve o foco ao botão que o abriu.
  useEffect(() => {
    if (editando) jaEditou.current = true;
    else if (jaEditou.current) botaoDaMeta.current?.focus();
  }, [editando]);

  const pedidos = pedidosDeHoje(orders, metaDoMes, agora);
  const legenda = !ordersOk ? (
    "os pedidos não carregaram"
  ) : (
    <>
      {legendaDosPedidos(pedidos, agora, settingsOk)}
      {settingsOk && !editando && (
        <>
          {" · "}
          <button ref={botaoDaMeta} type="button" onClick={() => setEditando(true)} className={BOTAO_DA_META}>
            {metaDoMes ? "editar meta" : "definir meta"}
          </button>
        </>
      )}
      {settingsOk && editando && (
        <EditorDaMeta
          meta={metaDoMes}
          salvando={salvando}
          onSalvar={async (texto) => {
            if (await salvar(texto)) setEditando(false);
          }}
          onCancelar={() => setEditando(false)}
        />
      )}
    </>
  );
  return (
    <CelulaDaFaixa
      rotulo={
        <>
          Pedidos<span className="max-md:hidden"> anotados</span> hoje
        </>
      }
      valor={ordersOk ? brl.format(pedidos.valor) : "—"}
      legenda={legenda}
    />
  );
}

/** "atualizado há N min" e o botão de atualizar; no celular, só "há N min" (a recarga do minuto segue sozinha). */
function Atualizado({ geradoEm, agora, onAtualizar }: { geradoEm: string | null; agora: Date; onAtualizar: () => void }) {
  return (
    <div className="col-start-2 row-start-1 flex items-center gap-1.5 pr-4 text-13 text-slate-600 md:pr-3 min-[87.5rem]:flex-none min-[87.5rem]:pl-6 min-[87.5rem]:pr-0">
      <p className="whitespace-nowrap">
        <span className="max-md:hidden">{geradoEm ? "atualizado " : "a série "}</span>
        {geradoEm ? haQuanto(geradoEm, agora) : "não carregou"}
      </p>
      <button type="button" onClick={onAtualizar} aria-label="Atualizar agora" title="Atualizar agora" className={BOTAO_ATUALIZAR}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4:** `inicio-ao-vivo.tsx`, trocar

```tsx
      <FaixaDeStatus
        atividade={atividade}
        links={links}
```

  por

```tsx
      <FaixaDeStatus
        atividade={atividade}
        campanhas={campanhas}
        links={links}
```

  e trocar

```tsx
        onMetaSalva={(valor) => onSettingsSaved({ ...settings, monthlyGoalRevenue: valor })}
      />
```

  por

```tsx
        onMetaSalva={(valor) => onSettingsSaved({ ...settings, monthlyGoalRevenue: valor })}
        onAtualizar={onAtualizar}
      />
```

- [ ] **Step 5:** checagens (em `apps/web`):
  - `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json` → limpos;
  - `npm run lint`, `npm test`, `npm run painel:check` → verdes;
  - `grep -n "text-12\|bg-acid\|cn(" src/components/painel/home/ao-vivo/faixa-de-status.tsx` → vazio;
  - `grep -rn "atualizadoHa\|comparacaoComecaEm\|saldoSemana" src --include=*.ts --include=*.tsx` → vazio; `grep -rn "curto" src/components/painel/numeros.tsx src/components/painel/home/ao-vivo/faixa-de-status.tsx` → vazio;
  - `wc -l src/components/painel/home/ao-vivo/faixa-de-status.tsx` → bem abaixo de 800 (~230).
- [ ] **Step 6:** `git -C <worktree> add` dos quatro arquivos; `diff --cached --stat` (só eles); commit `feat(painel): G2 strip on Início ao vivo: AO VIVO cell, four numbers, refresh at the end; Saldo out`.

### Task 4: gate local, revisão, PR, CI, merge, produção

**Files:** nenhum (correções da revisão voltam à task dona do arquivo)
**Depends-on:** Task 1, Task 2, Task 3

- [ ] **Step 1 (visual local):** subir o app **deste worktree** com a skill `run-hubflow-web` (não `preview_start`: ele serve o checkout principal) e olhar `/painel` logado com Playwright em 1440, 1100 e 390:
  - 1440: uma linha (AO VIVO + hora 28 + data por extenso | Entraram 32 + variação + faísca | Saíram | Cliques | Pedidos | "atualizado há N min" ⟳); sem Saldo; a legenda dos cliques com "…" se não couber, e o `title` com tudo;
  - 1100: cabeçalho (chip, hora 16, data por extenso … "atualizado há" ⟳) e as quatro células em grade de 4, legendas quebrando linha; sem rolagem lateral;
  - 390: cabeçalho (chip, hora, "segunda 05/10" … "há N min") e quatro células roláveis com rótulo curto ("Cliques", "Pedidos hoje"), número 28 e variação, sem legenda; nada passa de 390;
  - "definir/editar meta" abre o campo em 1100 e 1440; Esc fecha e o foco volta ao botão.
- [ ] **Step 2 (revisão):** revisor (agente Code Reviewer) sobre `git diff origin/main...HEAD` inteiro; corrigir CRITICAL/HIGH antes do push.
- [ ] **Step 3:** `git -C <worktree> fetch origin main`; `git -C <worktree> log HEAD..origin/main --oneline` vazio (senão `git -C <worktree> merge origin/main` e repetir a Task 3, Step 5); rodar `infra/scripts/verify-local.ps1` (o gate real do CI: secrets + build).
- [ ] **Step 4:** `git -C <worktree> push -u origin HEAD:feat/painel-g2-faixa`; `gh pr create --base main --title "feat(painel): G2 PR 3 — faixa de status"` com corpo: resumo (decisão 6; Saldo fora; cliques por campanha via `clicksByCampaign`; arranjos 390 / 768–1399 / 1400+), as divergências 1 a 4 deste plano, plano de teste (unit, os dois tsc, lint, painel:check, e2e no CI, visual nas três larguras) e o rodapé `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 5:** `gh pr checks <N> --watch` até verde. CI vermelho por corrida no banco dev (`processing`) → `gh pr update-branch <N>` (re-run reusa o SHA). `main` não tem proteção: **sem auto-merge**; no verde, `gh pr merge <N> --squash --delete-branch`. Se o classificador bloquear push ou merge, entregar ao Igor os dois comandos prontos (`gh pr checks <N>` e `gh pr merge <N> --squash --delete-branch`).
- [ ] **Step 6 (produção):** conferir em `/admin/configuracoes` (Deploy) que o commit do merge está no ar; logado na loja do Igor, as mesmas três larguras do Step 1, mais: clicar ⟳ e ver "atualizado agora"; a variação só aparece a partir de 08/10 (antes disso, "medindo desde 30/09, 23h" nas legendas). Não salvar meta em produção (abrir e Esc basta).
- [ ] **Step 7:** o card `painel-g2-barra-volt` segue `em_construcao` (o PR 6 da série verifica tudo). Sugerir ao Igor, em PowerShell: `rag insert "decisão: faixa G2 da Início numa linha só a partir de 1400 px; de 768 a 1399 cabeçalho + grade; Saldo fora da faixa; cliques por campanha pela regra de click-attribution (ID primeiro)" --source decisao-2026-10-05`. Encerrar com "PRs que deixei abertos: …" (ou "nenhum").

## Riscos

- **Legenda dos cliques encurtada entre 1400 e ~1600 px** quando os nomes das campanhas são longos: o `title` mostra tudo. Se o Igor achar pouco, a saída é encurtar cada nome na função pura, não no CSS.
- **Meta do mês sem editor no celular** (divergência 2). Reversível numa linha.
- **`text-13` dentro de `cn()`** já apaga o tamanho em pelo menos 8 lugares do painel (ex.: `notification-bell.tsx:193`, `grupos-vitrine.tsx:229`, `conectar-vitrine.tsx:370`): fora do escopo deste PR, vale um PR próprio.
