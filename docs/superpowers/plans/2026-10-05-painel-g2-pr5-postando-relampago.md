# Painel G2 — PR 5: Postando agora, Relâmpago e o contador da barra

> Plano de implementação. Spec: `docs/superpowers/specs/2026-10-05-painel-g2-barra-volt-design.md`,
> decisões 8 (Postando), 9 (Relâmpago), o trecho da 4 sobre o contador no item Relâmpago da barra,
> com as decisões 3 (tamanhos), 10 (gráfico igual) e 11 (Acid) como restrições.

**Goal:** na Início "Ao vivo", a grade de 40 células do "Postando agora" vira uma barra de três
segmentos com legenda e o link "Ver em Disparos"; o "Relâmpago" ganha o placar de três números
(Pediram · Vendeu · Esperando) e a fila de cinco linhas em volta da posição atual com a linha
"N vendidas antes · mais N esperando · ver a fila inteira"; e o item Relâmpago da barra de cima
mostra quantas pessoas esperam na fila da oferta no ar (até aqui, um ponto branco).

**Architecture:** três funções puras novas com TDD (`segmentosDaEntrega` em `ao-vivo/postando.ts`,
`janelaDaFila` e `linhaDaFila` em `painel/relampago.ts`); dois componentes reescritos no miolo; o hook da
barra passa a ler duas rotas que já existem (`/api/relampago/offers` e `/api/relampago/offers/<id>`) e
a derivar `esperando` com `placarDaOferta`. Sem API, store, DDL ou tipo novo de dado.

**Tech Stack:** Next 15, React 19, Tailwind v4, TS strict, `node --test` via tsx, Playwright no CI.

---

## Global Constraints

- **Acid** só em Postar, AO VIVO e LOTOU (decisão 11). Nada neste PR leva Acid: o chip AO VIVO do
  Relâmpago já existe e fica. Zero `button`/`a` com `bg-acid`; o contador da barra é Paper sobre Volt.
- **Tamanhos** (decisão 3): corpo 14, apoio 13; nunca 12 fora de `pn-chip` e do contador da barra (o
  "contador" é exceção nominal da decisão). Os três números do placar em `font-display` 28/700, tracking
  −0,015em, como os da faixa.
- **Sem API nem store.** O contador lê rotas que já existem; se a fila não vier, cai no ponto branco.
- **tenant_id:** nada tocado em `src/app/api` nem `src/lib/stores`.
- Arquivos < 800 linhas, funções < 50 linhas (o revisor cobra), sem `any`, sem dependência nova.
- `cn()` é seguro com `text-13` (#388 em `main`).
- Comentários e identificadores em pt-BR, como nos arquivos.
- Implementadores não commitam; o controller commita por task, em ordem de onda.

## Onde a spec e o código divergem (decidido neste plano)

1. **De onde vem o "pessoas esperando" da barra.** A decisão 4 pede o contador em toda rota; só a Início
   tem a fila (via `onEsperando`). A lista `/api/relampago/offers` não traz fila. **Decisão:** o hook da
   barra, que já busca a lista a cada minuto com oferta no ar, busca também `/api/relampago/offers/<id>`
   da primeira oferta aberta e deriva `esperando = placarDaOferta(queue).esperando`. Sem a fila (rota
   falhou), fica o ponto branco de hoje. Custo: uma leitura a mais por minuto, só com oferta aberta (a
   Início já lê a mesma rota a cada 10 s quando visível).
2. **"Em volta da posição atual"** (decisão 9). Hoje a fila mostra as cinco primeiras entradas sem
   desfecho. **Decisão:** a janela começa uma linha antes da primeira entrada ainda em aberto (uma linha já
   resolvida dá contexto, como no mockup: 5ª Vendida, 6ª Em conversa, 7ª a próxima…) e segue por cinco. O
   que ficou fora vira "N vendidas antes · mais N esperando".
3. **Legenda da barra de entrega.** A spec diz "entregues · enviando · na fila, mais falhou quando houver";
   o código de hoje diz "postando" e a `LegendaDaEntrega` da campanha escreve "Post das HH:MM:" com ícones.
   **Decisão:** legenda própria do Postando com quadradinhos nas cores dos segmentos e as palavras da
   spec ("enviando"); "cancelado" entra só quando houver, como "falhou". A `LegendaDaEntrega` da página da
   campanha não muda.
4. **A grade por grupo sai de vez** (decisão 8). `gradeDaEntrega`, `rotuloDaCelula`, `tituloDaGrade` e o
   tipo `CelulaDaGrade` ficam sem consumidor: saem com seus testes. A entrega por grupo mora em Disparos,
   para onde o link do cabeçalho leva.
5. **Prop `grupos` do Postando** só servia à grade: sai do componente e da chamada no container.
6. **Mockup × spec no cabeçalho do Postando.** O mockup escreve "VIP Revenda · começou às 14:08 · foto e
   texto"; a spec não pede. Fica a linha de hoje ("{abertura} · {campanha}").
7. **Celular:** mesmo desenho (o mockup do celular mostra a barra de três segmentos e o placar de três).
8. **Mockup do placar:** 14 pediram, 4 vendeu, 8 esperando e "5ª Vendida" não fecham entre si; os números
   da tela vêm de `placarDaOferta` e `janelaDaFila`, que fecham.

## File Structure

| Arquivo | O que muda |
|---|---|
| `apps/web/src/lib/painel/ao-vivo/postando.ts` | entra `segmentosDaEntrega`; saem a grade e seus helpers |
| `apps/web/src/lib/painel/ao-vivo/postando.test.ts` | testes dos segmentos; testes da grade saem |
| `apps/web/src/lib/painel/relampago.ts` | entram `janelaDaFila` e `linhaDaFila` |
| `apps/web/src/lib/painel/relampago.test.ts` | testes da janela e da linha |
| `apps/web/src/components/painel/home/ao-vivo/postando-agora.tsx` | barra de três segmentos + legenda; link "Ver em Disparos"; 13 px |
| `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx` | tira `grupos` da chamada do Postando |
| `apps/web/src/components/painel/home/ao-vivo/relampago-ao-vivo.tsx` | placar de três; fila em janela com linha de resumo; 13 px |
| `apps/web/src/components/painel/barra-de-cima.tsx` | hook lê a fila da oferta aberta; contador no item Relâmpago |
| `apps/web/src/app/painel-vitrine.css` | `.pn-barra__contador` |
| `apps/web/e2e/painel-inicio-ao-vivo.spec.ts` | link para Disparos, sem grade, sem "Atendidas", nada abaixo de 13 px |
| `docs/superpowers/specs/2026-10-05-painel-g2-barra-volt-design.md` | decisão 4: o contador chegou |

### Ondas (regra de subagentes paralelos)

- **Onda 0:** Task 0.
- **Onda 1 (paralela):** Task 1 (lib postando), Task 2 (lib relâmpago), Task 3 (e2e), Task 6 (barra + CSS +
  spec). Arquivos disjuntos, sem dependência entre si.
- **Onda 2 (paralela):** Task 4 (Postando, depende da 1), Task 5 (Relâmpago, depende da 2).
- **Onda 3:** Task 7.

O `tsc` fica vermelho em `postando-agora.tsx` do fim da Task 1 ao fim da Task 4 (a grade saiu da lib). O
PR é squash.

---

### Task 0: preparação

**Files:** nenhum
**Depends-on:** PR #392 (G2 PR 4) mergeado

- [ ] A branch `feat/painel-g2-postando` já existe no worktree da sessão, cortada de `origin/main`
      em `dca9fb8d` (merge do #392). Conferir: `git -C <worktree> log --oneline -1` mostra `dca9fb8d`
      ou mais novo e `git -C <worktree> status --short` está limpo.
- [ ] Se `origin/main` andou: `git -C <worktree> fetch origin main` e `git -C <worktree> merge origin/main`
      (sem conflito esperado: nada toca os mesmos arquivos).
- [ ] Commitar este plano: `docs: painel G2 PR 5 plan (postando, relâmpago e contador da barra)`.

---

### Task 1: segmentos da entrega (TDD) e fim da grade

**Files:** `apps/web/src/lib/painel/ao-vivo/postando.ts`, `apps/web/src/lib/painel/ao-vivo/postando.test.ts`
**Depends-on:** Task 0

- [ ] **Step 1 (RED):** em `postando.test.ts`, trocar o import e acrescentar o teste. O import passa a:

```ts
import {
  fraseDoAndamento,
  placarDosGrupos,
  proximosAgendamentos,
  segmentosDaEntrega,
  terminaPorVolta,
  textoDoPost,
  versaoDoPost,
} from "./postando";
```

Apagar a função `grupo()` e os imports `Group` e `EntregaNoGrupo` se ficarem sem uso (o `EntregaNoGrupo`
é usado só pelo teste da grade). Apagar os testes **"grade ordena pelo numero do grupo…"**, **"rotulo da
celula diz o estado por extenso…"**, **"grupo sem numero usa o nome, cortado…"** e **"rotulo do grupo fora
do cadastro nao repete a frase"**. No teste **"titulo da grade e placar no singular e no plural"**, tirar as
linhas de `tituloDaGrade` e renomear para **"placar no singular e no plural"**. Acrescentar:

```ts
test("segmentos da entrega: entregues sempre; enviando, na fila, falhou e cancelado só com gente", () => {
  assert.deepEqual(segmentosDaEntrega(resumo({ entregues: 27, postando: 1, naFila: 12, total: 40 })), [
    { estado: "entregue", n: 27, texto: "entregues" },
    { estado: "postando", n: 1, texto: "enviando" },
    { estado: "na_fila", n: 12, texto: "na fila" },
  ]);
  assert.deepEqual(segmentosDaEntrega(resumo({ entregues: 1, falharam: 1, cancelados: 2, total: 4 })), [
    { estado: "entregue", n: 1, texto: "entregue" },
    { estado: "falhou", n: 1, texto: "falhou" },
    { estado: "cancelado", n: 2, texto: "cancelados" },
  ]);
  assert.deepEqual(segmentosDaEntrega(resumo({ total: 0 })), [{ estado: "entregue", n: 0, texto: "entregues" }]);
});
```

- [ ] **Step 2:** rodar `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/ao-vivo/postando.test.ts`
      (de `apps/web`). Esperado: o teste novo falha com `segmentosDaEntrega is not a function`; os outros
      passam.
- [ ] **Step 3 (GREEN):** em `postando.ts`, apagar `CelulaDaGrade`, `LIMITE_DO_ROTULO`, `GRUPO_FORA_DO_CADASTRO`,
      `TEXTO_DO_ESTADO`, `gradeDaEntrega`, `rotuloDaCelula`, `tituloDaGrade` e os imports que ficarem sem uso
      (`numeroDoGrupo`, `Group`, e `horaBR`/`EntregaNoGrupo` se só a grade os usava — o eslint aponta). Ajustar o
      comentário de cabeçalho do módulo: "A coluna "Postando agora" da Início "Ao vivo": quando o post
      termina, a barra de entrega e os próximos agendamentos." Acrescentar, depois de `placarDosGrupos`:

```ts
export type SegmentoDaEntrega = { estado: EstadoDaEntrega; n: number; texto: string };

/**
 * Os segmentos da barra de entrega (spec G2, decisão 8): entregues sempre (é o que a lojista espera ver,
 * mesmo em zero); enviando, na fila, falhou e cancelado só quando há alguém neles.
 */
export function segmentosDaEntrega(r: ResumoDaEntrega): SegmentoDaEntrega[] {
  const todos: SegmentoDaEntrega[] = [
    { estado: "entregue", n: r.entregues, texto: r.entregues === 1 ? "entregue" : "entregues" },
    { estado: "postando", n: r.postando, texto: "enviando" },
    { estado: "na_fila", n: r.naFila, texto: "na fila" },
    { estado: "falhou", n: r.falharam, texto: r.falharam === 1 ? "falhou" : "falharam" },
    { estado: "cancelado", n: r.cancelados, texto: r.cancelados === 1 ? "cancelado" : "cancelados" },
  ];
  return todos.filter((s) => s.n > 0 || s.estado === "entregue");
}
```

- [ ] **Step 4:** o teste passa (11 testes: 14 de antes − 4 da grade + 1 novo; o "titulo e placar" virou só
      placar). `npx eslint src/lib/painel/ao-vivo/postando.ts src/lib/painel/ao-vivo/postando.test.ts` limpo.
      `grep -rn "gradeDaEntrega\|rotuloDaCelula\|tituloDaGrade\|CelulaDaGrade" src e2e` só acha
      `postando-agora.tsx` (Task 4 limpa).
- [ ] **Commit (controller):** `refactor(painel): delivery bar segments; the per-group grid leaves the Início lib`

---

### Task 2: janela e linha da fila (TDD)

**Files:** `apps/web/src/lib/painel/relampago.ts`, `apps/web/src/lib/painel/relampago.test.ts`
**Depends-on:** Task 0

- [ ] **Step 1 (RED):** em `relampago.test.ts`, acrescentar `janelaDaFila` e `linhaDaFila` ao import e, depois
      do teste "sem ninguém esperando, não há próxima", os testes (usam a `fila` de exemplo e as fixtures
      `vendida`/`naFila` que já existem no arquivo):

```ts
test("janela da fila: começa uma linha antes da primeira em aberto e segue por N; o resto vira resumo", () => {
  // fila: e1 vendida, e2 desistiu, e3 em conversa, e4 reservada, e5 e e6 esperando.
  const cinco = janelaDaFila(fila, 5);
  assert.deepEqual(cinco.linhas.map((l) => [l.entrada.id, l.posicao]), [["e2", 1], ["e3", 2], ["e4", 3], ["e5", 4], ["e6", 5]]);
  assert.equal(cinco.vendidasAntes, 1);
  assert.equal(cinco.maisEsperando, 0);

  const tres = janelaDaFila(fila, 3);
  assert.deepEqual(tres.linhas.map((l) => l.entrada.id), ["e2", "e3", "e4"]);
  assert.equal(tres.maisEsperando, 2);
});

test("janela da fila: tudo resolvido mostra a última linha; fila vazia não mostra nada", () => {
  const prontas = janelaDaFila([{ id: "a", ...vendida }, { id: "b", ...vendida }], 5);
  assert.deepEqual(prontas.linhas.map((l) => l.entrada.id), ["b"]);
  assert.equal(prontas.vendidasAntes, 1);
  assert.deepEqual(janelaDaFila([], 5), { linhas: [], vendidasAntes: 0, maisEsperando: 0 });
});

test("linha da fila: só as partes que existem; nada quando a janela mostra tudo", () => {
  assert.equal(linhaDaFila({ vendidasAntes: 4, maisEsperando: 5 }), "4 vendidas antes · mais 5 esperando");
  assert.equal(linhaDaFila({ vendidasAntes: 1, maisEsperando: 0 }), "1 vendida antes");
  assert.equal(linhaDaFila({ vendidasAntes: 0, maisEsperando: 1 }), "mais 1 esperando");
  assert.equal(linhaDaFila({ vendidasAntes: 0, maisEsperando: 0 }), null);
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/relampago.test.ts`
      → os três novos falham (`is not a function`); o resto passa.
- [ ] **Step 3 (GREEN):** em `relampago.ts`, depois de `proximaDaFila`:

```ts
export type JanelaDaFila<T> = {
  linhas: { entrada: T; posicao: number }[];
  /** Vendidas que ficaram antes da janela. */
  vendidasAntes: number;
  /** Esperando (sem reserva e sem desfecho) que ficaram depois da janela. */
  maisEsperando: number;
};

/**
 * As linhas da fila em volta da posição atual (spec G2, decisão 9): uma linha já resolvida para dar
 * contexto e, da primeira ainda em aberto em diante, as próximas. `posicao` é o índice na fila inteira
 * (o ordinal que a tela mostra). O que ficou fora vai para `linhaDaFila`.
 */
export function janelaDaFila<T extends EntradaLike>(fila: readonly T[], linhas: number): JanelaDaFila<T> {
  const primeiraAberta = fila.findIndex((e) => !e.outcome);
  const inicio = Math.max(0, (primeiraAberta === -1 ? fila.length : primeiraAberta) - 1);
  const dentro = fila.slice(inicio, inicio + linhas).map((entrada, i) => ({ entrada, posicao: inicio + i }));
  return {
    linhas: dentro,
    vendidasAntes: fila.slice(0, inicio).filter((e) => e.outcome === "sold").length,
    maisEsperando: fila.slice(inicio + dentro.length).filter(estaEsperando).length,
  };
}

/** "4 vendidas antes · mais 5 esperando"; null quando a janela mostra a fila inteira. */
export function linhaDaFila(j: { vendidasAntes: number; maisEsperando: number }): string | null {
  const partes = [
    j.vendidasAntes > 0 ? `${j.vendidasAntes} ${j.vendidasAntes === 1 ? "vendida" : "vendidas"} antes` : null,
    j.maisEsperando > 0 ? `mais ${j.maisEsperando} esperando` : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(" · ") : null;
}
```

`estaEsperando` já existe no arquivo (acima de `placarDaOferta`); se estiver declarado depois do ponto de
inserção, mover a inserção para depois dele.

- [ ] **Step 4:** teste verde; `npx eslint src/lib/painel/relampago.ts src/lib/painel/relampago.test.ts` limpo.
- [ ] **Commit (controller):** `feat(painel): queue window around the current position and its summary line`

---

### Task 3: e2e

**Files:** `apps/web/e2e/painel-inicio-ao-vivo.spec.ts`
**Depends-on:** Task 0

- [ ] **Step 1:** no describe **"Início ao vivo a partir de 768 px"** (viewport 1440), acrescentar no fim:

```ts
  test("Postando e Relâmpago G2: link para Disparos, sem grade por grupo, placar sem Atendidas e nada abaixo de 13 px", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    const postando = page.getByTestId("inicio-postando");
    const relampago = page.getByTestId("inicio-relampago");
    await expect(postando.getByRole("link", { name: "Ver em Disparos" })).toHaveAttribute("href", "/painel/disparos");
    // A grade de 40 células saiu (decisão 8): nenhuma célula por grupo, com ou sem post saindo.
    await expect(postando.locator('[title*=": entregue"], [title*=": na fila"], [title*=": postando"]')).toHaveCount(0);
    // O placar é Pediram · Vendeu · Esperando (decisão 9); com ou sem oferta, "Atendidas" não existe mais.
    await expect(relampago.getByText("Atendidas")).toHaveCount(0);
    expect(await textosAbaixoDe13px(postando)).toEqual([]);
    expect(await textosAbaixoDe13px(relampago)).toEqual([]);
  });
```

`textosAbaixoDe13px` já existe no arquivo (PR 4) e exclui `.pn-chip`.

- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.e2e.json` e `npx eslint e2e/painel-inicio-ao-vivo.spec.ts` limpos.
      Não rodar o Playwright localmente.
- [ ] **Commit (controller):** `test(e2e): Postando and Relâmpago G2 on the Início`

---

### Task 4: Postando agora G2

**Files:** `apps/web/src/components/painel/home/ao-vivo/postando-agora.tsx`, `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx`
**Depends-on:** Task 1

- [ ] **Step 1:** em `postando-agora.tsx`, trocar o bloco de imports e o `CELULA`/`ORDEM_DA_LEGENDA` por:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bolha } from "@/components/painel/bolha";
import { useEntrega, type LeituraDaEntrega } from "@/components/painel/campanhas/detalhe/entrega";
import type { Disparo, Schedule } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import {
  estaSaindo,
  fraseDoAndamento,
  placarDosGrupos,
  proximosAgendamentos,
  segmentosDaEntrega,
  terminaPorVolta,
  textoDoPost,
  versaoDoPost,
} from "@/lib/painel/ao-vivo/postando";
import { quandoDoPost } from "@/lib/painel/campanha-visao";
import { postDaTabela, resumoDaEntrega, type EstadoDaEntrega } from "@/lib/painel/entrega";
import { numero } from "@/lib/painel/grupos";
import type { OfferTotalsRow } from "@/lib/stores/flash-offers";
import { cn } from "@/lib/utils";

/**
 * A cor de cada segmento da barra de entrega e do quadradinho da legenda (spec G2, decisão 8). A legenda
 * escreve o estado, então a cor não está sozinha. "Na fila" é o tom do trilho: é o que ainda não saiu.
 */
const SEGMENTO: Record<EstadoDaEntrega, string> = {
  entregue: "bg-success-700",
  postando: "bg-cobalt-500",
  na_fila: "bg-line-200",
  falhou: "bg-saida",
  cancelado: "bg-slate-600/40",
};
```

- [ ] **Step 2:** na `Previa`, a nota passa de `text-12` para `text-13`:

```tsx
      {nota && <p className="mt-1.5 text-13 text-slate-600">{nota}</p>}
```

- [ ] **Step 3:** apagar a função `Grade` inteira e pôr no lugar:

```tsx
/**
 * A barra de três segmentos e a legenda (spec G2, decisão 8): a grade de 40 células saiu; a entrega grupo a
 * grupo mora em Disparos, para onde o link do cabeçalho leva. A barra é decorativa: a legenda é o texto.
 */
function BarraDaEntrega({ leitura, entrega, desatualizada }: {
  leitura: LeituraDaEntrega;
  entrega: ReturnType<typeof useEntrega>["entrega"];
  desatualizada: boolean;
}) {
  const resumo = useMemo(() => (entrega ? resumoDaEntrega(entrega.grupos) : null), [entrega]);
  if (!entrega || !resumo) {
    return <p className="text-13 text-slate-600">{leitura === "falhou" ? "A entrega não carregou." : "lendo a entrega…"}</p>;
  }
  if (resumo.total === 0) return <p className="text-13 text-slate-600">Nenhum grupo na entrega ainda.</p>;
  const segmentos = segmentosDaEntrega(resumo);
  return (
    <div className="space-y-2">
      <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-[4px]">
        {segmentos
          .filter((s) => s.n > 0)
          .map((s) => (
            <span key={s.estado} className={cn("block", SEGMENTO[s.estado], s.estado === "postando" && "motion-safe:animate-pulse")} style={{ flex: s.n }} />
          ))}
      </div>
      <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-13 text-slate-600">
        {segmentos.map((s) => (
          <span key={s.estado} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-[2px]", SEGMENTO[s.estado])} aria-hidden="true" />
            <span>
              <span className="font-semibold tabular-nums text-volt-950">{numero(s.n)}</span> {s.texto}
            </span>
          </span>
        ))}
        {desatualizada && <span>· não deu para atualizar agora; tentando de novo</span>}
      </p>
    </div>
  );
}
```

- [ ] **Step 4:** `Props` perde `grupos: Group[]`; `PostandoAgora` perde `grupos` na desestruturação. O
      cabeçalho e a chamada da grade mudam:

```tsx
      <div className="flex items-center justify-between gap-3 border-b border-line-200 px-5 py-3">
        <h2 id="postando-titulo" className="text-[16px] font-semibold text-volt-950">
          Postando agora
        </h2>
        {/* A entrega grupo a grupo mora em Disparos (decisão 8). */}
        <Link href="/painel/disparos" className="shrink-0 text-13 font-semibold text-cobalt-500 hover:underline">
          Ver em Disparos
        </Link>
      </div>
```

e, no lugar de `<Grade post={post} grupos={grupos} leitura={leitura} entrega={entrega} desatualizada={desatualizada} hora={hora} />`:

```tsx
            <BarraDaEntrega leitura={leitura} entrega={entrega} desatualizada={desatualizada} />
```

Atualizar o comentário do `PostandoAgora`: `/** "Postando agora" da Início "Ao vivo" (spec G2, decisão 8): o post que sai, a barra de entrega e o que vem depois. */`.

- [ ] **Step 5:** em `inicio-ao-vivo.tsx`, tirar a linha `grupos={groups}` da chamada de `<PostandoAgora`.
- [ ] **Step 6:** de `apps/web`: `npx tsc --noEmit -p tsconfig.json` limpo (a Task 1 já está commitada);
      `npx eslint src/components/painel/home/ao-vivo/postando-agora.tsx src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx`
      limpo; `grep -n "text-12\|text-\[1[12]px\]\|bg-acid\|Grade\b\|LegendaDaEntrega\|lucide" src/components/painel/home/ao-vivo/postando-agora.tsx`
      vazio; `npx tsx scripts/check-painel-vitrine.ts` → OK.
- [ ] **Commit (controller):** `feat(painel): Postando agora G2 — delivery bar with legend, link to Disparos`

---

### Task 5: Relâmpago G2

**Files:** `apps/web/src/components/painel/home/ao-vivo/relampago-ao-vivo.tsx`
**Depends-on:** Task 2

- [ ] **Step 1:** acrescentar `janelaDaFila` e `linhaDaFila` ao import de `@/lib/painel/relampago`.
- [ ] **Step 2:** trocar o `<dl className="grid grid-cols-4 gap-2">…</dl>` inteiro por `<Placar placar={placar} />`
      e acrescentar, antes de `OfertaNoAr`:

```tsx
/** Pediram · Vendeu · Esperando (spec G2, decisão 9): "Atendidas" saiu. Números no tamanho da faixa. */
function Placar({ placar }: { placar: { pediram: number; vendeu: number; esperando: number } }) {
  return (
    <dl role="group" aria-label="Placar da oferta" className="grid grid-cols-3 gap-2">
      {(
        [
          ["Pediram", placar.pediram],
          ["Vendeu", placar.vendeu],
          ["Esperando", placar.esperando],
        ] as const
      ).map(([rotulo, valor]) => (
        // dt antes de dd (ordem do leitor de tela); o número aparece em cima.
        <div key={rotulo} className="flex min-w-0 flex-col-reverse gap-1">
          <dt className="text-13 text-slate-600">{rotulo}</dt>
          <dd className="font-display text-28 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950">{numero(valor)}</dd>
        </div>
      ))}
    </dl>
  );
}
```

(`numero` vem de `@/lib/painel/grupos`: acrescentar o import.)

- [ ] **Step 3:** em `OfertaNoAr`, apagar o cálculo de `proximas` e o bloco `<div className="space-y-2"><h3 …>Fila</h3>…</div>`
      inteiro; no lugar do bloco, `<FilaDaOferta oferta={oferta} offer={offer} queue={queue} me={me} agora={agora} />`.
      Acrescentar, antes de `OfertaNoAr`:

```tsx
type PropsDaFila = {
  oferta: OfertaDaInicio;
  offer: FilaPayload["offer"];
  queue: FilaPayload["queue"];
  me: string;
  agora: Date;
};

/**
 * Cinco linhas em volta da posição atual (spec G2, decisão 9) e a linha "N vendidas antes · mais N
 * esperando · ver a fila inteira". Linha já resolvida fica apagada: é contexto, não a vez de alguém.
 */
function FilaDaOferta({ oferta, offer, queue, me, agora }: PropsDaFila) {
  const janela = janelaDaFila(queue, LINHAS_DA_FILA);
  const resumo = linhaDaFila(janela);
  const todasResolvidas = queue.length > 0 && queue.every((e) => e.outcome);
  return (
    <div className="space-y-2">
      <h3 className="text-13 font-semibold text-volt-950">Fila</h3>
      {queue.length === 0 ? (
        <p className="text-13 text-slate-600">Ninguém comentou ainda.</p>
      ) : (
        <ol className="space-y-1.5">
          {janela.linhas.map(({ entrada, posicao }) => (
            <li key={entrada.id} className={cn("flex min-w-0 items-center gap-2 text-13", entrada.outcome ? "text-slate-600" : "text-volt-950")}>
              <span className="font-data w-8 shrink-0 tabular-nums">{ordinal(posicao)}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{nomeDe(entrada)}</span>
              <span className="font-data shrink-0 tabular-nums text-slate-600">{horarioComSegundos(entrada.commented_at)}</span>
              <Situacao entrada={entrada} me={me} timerSeconds={offer.timer_seconds} agora={agora} />
            </li>
          ))}
        </ol>
      )}
      <p className="text-13 text-slate-600">
        {todasResolvidas ? "Todo mundo já foi atendido · " : resumo ? `${resumo} · ` : ""}
        <Link href={`/painel/relampago/${oferta.id}`} className={linkDiscreto}>
          ver a fila inteira
        </Link>
      </p>
    </div>
  );
}
```

`FilaPayload` vem de `@/components/painel/relampago/use-oferta` (`import { useOferta, type FilaPayload } from …`).
Com isso, `OfertaNoAr` perde ~25 linhas; conferir que ficou com 50 ou menos (se passar, extrair também o
bloco "Fechar oferta" como `FecharOferta`).

- [ ] **Step 4:** `grep -n "text-12\|Atendidas\|proximas\|bg-acid" src/components/painel/home/ao-vivo/relampago-ao-vivo.tsx`
      vazio (o `pn-chip--acid` do AO VIVO fica: é o chip, não `bg-acid`). `npx tsc --noEmit -p tsconfig.json`,
      `npx eslint src/components/painel/home/ao-vivo/relampago-ao-vivo.tsx`, `npx tsx scripts/check-painel-vitrine.ts`.
- [ ] **Commit (controller):** `feat(painel): Relâmpago G2 — three-cell score, queue window with summary line`

---

### Task 6: contador no item Relâmpago da barra

**Files:** `apps/web/src/components/painel/barra-de-cima.tsx`, `apps/web/src/app/painel-vitrine.css`, `docs/superpowers/specs/2026-10-05-painel-g2-barra-volt-design.md`
**Depends-on:** Task 0

- [ ] **Step 1:** em `barra-de-cima.tsx`, acrescentar aos imports `import { numero } from "@/lib/painel/grupos";`
      e `import { placarDaOferta, type EntradaLike } from "@/lib/painel/relampago";`. Trocar o bloco de
      `type Oferta = { status?: string };` até o fim de `useRelampagoNoAr` por:

```tsx
type Oferta = { id?: string; status?: string };
type Relampago = { noAr: boolean; esperando: number | null };
const QUIETO: Relampago = { noAr: false, esperando: null };

async function lerJson(url: string): Promise<unknown> {
  return fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/** A oferta aberta e, se a fila vier, quantas pessoas esperam nela — duas leituras das rotas que já existem. */
async function lerRelampago(): Promise<Relampago> {
  const lista = (await lerJson("/api/relampago/offers")) as { offers?: Oferta[] } | null;
  const aberta = (Array.isArray(lista?.offers) ? lista.offers : []).find((o) => o.status === "open");
  if (!aberta?.id) return QUIETO;
  const detalhe = (await lerJson(`/api/relampago/offers/${aberta.id}`)) as { queue?: EntradaLike[] } | null;
  return { noAr: true, esperando: Array.isArray(detalhe?.queue) ? placarDaOferta(detalhe.queue).esperando : null };
}

/**
 * Há oferta relâmpago no ar, e quantas pessoas esperam na fila dela (spec G2, decisão 4)? Busca ao montar,
 * ao entrar ou sair de /relampago e quando a aba volta a ficar visível depois de um minuto; com oferta no
 * ar confere a cada minuto, porque ela fecha por tempo e a fila anda. O layout não remonta entre rotas.
 * `ativo` falso (modo foco) não busca nada.
 */
function useRelampagoNaBarra(ativo: boolean): Relampago {
  const naArea = usePathname().startsWith(RELAMPAGO);
  const [relampago, setRelampago] = useState<Relampago>(QUIETO);
  const noAr = relampago.noAr;
  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    let ultimaBusca = 0;
    async function buscar() {
      ultimaBusca = Date.now();
      const lido = await lerRelampago();
      if (!cancelado) setRelampago(lido);
    }
    void buscar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaBusca > REFRESCO_MS) void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const conferir = noAr
      ? setInterval(() => {
          if (document.visibilityState === "visible") void buscar();
        }, REFRESCO_MS)
      : undefined;
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
      clearInterval(conferir);
    };
  }, [ativo, naArea, noAr]);
  return relampago;
}
```

- [ ] **Step 2:** `NavDaBarra` passa a receber `relampago: Relampago` e o item fica:

```tsx
        <Link key={item.href} href={item.href} aria-current={isNavItemActive(pathname, item.href) ? "page" : undefined} className="pn-barra__item">
          {item.curto ?? item.label}
          {item.href === RELAMPAGO && <SinalDoRelampago {...relampago} />}
        </Link>
```

com, antes de `NavDaBarra`:

```tsx
/** Oferta no ar: quantas pessoas esperam na fila (decisão 4); sem a fila lida, o ponto Paper de antes. */
function SinalDoRelampago({ noAr, esperando }: Relampago) {
  if (!noAr) return null;
  if (esperando === null) return <span className="pn-barra__ponto" role="img" aria-label="oferta no ar" />;
  return (
    <span className="pn-barra__contador">
      {numero(esperando)}
      <span className="sr-only"> esperando</span>
    </span>
  );
}
```

Em `BarraDeCima`: `const relampago = useRelampagoNaBarra(!foco);` e `<NavDaBarra relampago={relampago} />`.
O nome acessível do item vira "Relâmpago 8 esperando": o e2e da casca casa `/^Relâmpago/`, segue valendo.

- [ ] **Step 3:** em `painel-vitrine.css`, logo depois da regra `.pn-barra__ponto { … }`:

```css
/* Oferta no ar com a fila lida: quantas pessoas esperam (decisão 4). Paper sobre Volt, 16,9:1; 12 px é a
   exceção do contador (decisão 3). */
.pn-barra__contador {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--color-paper-0);
  color: #071923;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4:** na spec, decisão 4, trocar as linhas

```
   da loja (link para Configurações). Relâmpago carrega um contador com o número de pessoas esperando
   quando há oferta no ar — entra no PR 5 junto com o placar, que é de onde o número vem; até lá o item
   leva um ponto branco quando há oferta no ar (branco, não Acid: decisão 11). O item ativo tem a
   tinta clara e um traço de 2 px embaixo.
```

por

```
   da loja (link para Configurações). Relâmpago carrega um contador com o número de pessoas esperando
   quando há oferta no ar (a barra lê a fila da oferta aberta; sem a fila, um ponto branco — branco, não
   Acid: decisão 11). O item ativo tem a tinta clara e um traço de 2 px embaixo.
```

- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.json`, `npx eslint src/components/painel/barra-de-cima.tsx`,
      `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/tema.test.ts` (lê o CSS),
      `npx tsx scripts/check-painel-vitrine.ts`. `grep -n "acid" src/components/painel/barra-de-cima.tsx` vazio.
- [ ] **Commit (controller):** `feat(painel): the bar's Relâmpago item counts the people waiting in the open offer`

---

### Task 7: gate local, revisão, PR, CI, merge, produção

**Files:** nenhum (correções da revisão voltam à task dona do arquivo)
**Depends-on:** Tasks 1 a 6

- [ ] De `apps/web`: `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.e2e.json`,
      `npm run lint`, `npm test` (tudo verde), `npx tsx scripts/check-painel-vitrine.ts`.
- [ ] Da raiz: `powershell -ExecutionPolicy Bypass -File infra\scripts\verify-local.ps1` (segredos, build).
- [ ] Revisão do diff (`git diff origin/main...HEAD`): com Opus/Sonnet no limite semanal (até 10/10 8h), o
      controller revisa lendo o diff, com atenção a: nome acessível do item Relâmpago; `OfertaNoAr` ≤ 50
      linhas; nada abaixo de 13 px; o segundo fetch do hook só com oferta aberta; `grupos` sem sobra no
      Postando.
- [ ] `git push -u origin feat/painel-g2-postando`; `gh pr create` com o corpo do PR (o que muda, decisões
      1–5 acima, regra do Acid, testes, fora do PR: PR 6) terminando em
      `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] Uma consulta ao CI (`get_status`); no verde, `gh pr merge <N> --squash --delete-branch`.
- [ ] Produção (deploy em `/admin/configuracoes`; Igor logado no painel do navegador), 1440 e 390: Postando
      com barra de segmentos + legenda e o link "Ver em Disparos"; Relâmpago quieta ou com placar de três
      e a fila em janela; barra de cima com o item Relâmpago (ponto/contador só com oferta no ar — se houver
      uma na loja do Igor, conferir o número contra `/painel/relampago`); nada abaixo de 13 px fora do chip.
- [ ] Memória da série e `MEMORY.md` atualizadas; card do quadro: PR 6.

## Riscos

- **Fila grande na barra:** `/api/relampago/offers/<id>` devolve a fila inteira a cada minuto enquanto há
  oferta aberta. A Início já faz o mesmo a cada 10 s; em loja com fila de centenas, o custo é o mesmo da
  página. Se pesar, a saída é um `?resumo=1` na rota (API, fora deste PR).
- **Duas ofertas abertas:** o contador é da primeira da lista (a mais recente); a Início também mostra a
  primeira. "+N outras no ar" continua só na Início.
- **Janela com `posicao` deslocada:** o ordinal da linha é o índice na fila inteira, não na janela — o teste
  da Task 2 fixa isso; uma regressão aqui faria "5ª" virar "1ª".
- **Postando sem `grupos`:** se algum outro consumidor passar `grupos` ao `PostandoAgora`, o `tsc` acusa
  (só `inicio-ao-vivo.tsx` chama hoje).
- **Revisão sem segunda opinião** até 10/10: o controller revisa sozinho. Pontos que um revisor pegaria estão
  listados na Task 7.
