# Painel G2 — PR 4 (mapa dos grupos da Início ao vivo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O mapa dos grupos vira o do mockup G2: cabeçalho "58 grupos · 42.368 pessoas · +214 hoje" com o link "Todos os grupos"; filtros com o selo na cor do estado (LOTOU em Acid, QUASE em aviso, ATIVO em cinza, SEM CONVITE com fio vermelho) e a contagem; por campanha "40 grupos · 95% das vagas · +171 hoje" e "✓ abre o próximo sozinho" quando a regra está ligada; célula de 40 px com o número e o "+N" de hoje em 13 px, **sem percentual**, e a de LOTOU em Acid sólido; a campanha maior primeiro e as menores lado a lado na grade de dez colunas (6 + 3); rodapé de alerta com o botão "Configurar convite". O gráfico não muda (decisão 10).

**Architecture:** As regras ficam puras em `lib/painel/ao-vivo/mapa.ts` (TDD): a ordem dos blocos (maior primeiro, "Outros grupos" no fim), a largura de cada bloco (3, 6 ou 10 colunas pelo número de células), o lugar de cada um na grade (`lugaresDosBlocos`) e o preenchimento da célula (LOTOU = 100%). `mapa-dos-grupos.tsx` é reescrito em peças pequenas (cabeçalho, filtros, blocos, alertas); a partir de 768 px os blocos se posicionam na grade de 10 colunas por `grid-area` vindo de uma variável CSS, e cada bloco é um subgrid de duas linhas (cabeçalho, células) para dois blocos lado a lado começarem as células na mesma altura. `celula-do-grupo.tsx` muda só o miolo (tamanho, texto, preenchimento) e ganha a dica num componente próprio. Nenhum dado novo: tudo vem em `/api/painel/inicio`.

**Tech Stack:** Next.js 15, React 19, Tailwind v4.3, `node --test` via tsx, Playwright (CI).

**Spec:** `docs/superpowers/specs/2026-10-05-painel-g2-barra-volt-design.md` (decisão 7; decisões 3 e 11 como restrição; decisão 10: gráfico intocado; tabela de PRs, linha 4)

## Global Constraints

- **Acid** só no selo LOTOU do filtro (`pn-chip pn-chip--acid`, um `span` dentro do botão) e no preenchimento da célula LOTOU (`bg-acid-500`, um `span` dentro do link). Zero `button`/`a` com `bg-acid` (regra 10; `painel-inicio-ao-vivo.spec.ts` e `painel-vitrine-casca.spec.ts`). `painel:check` conta no máximo 2 `bg-acid` por arquivo: `mapa-dos-grupos.tsx` fica com **zero** (a legenda sai), `celula-do-grupo.tsx` com um.
- **Tamanhos (decisão 3):** corpo 14 (`text-[14px]`: não existe token `text-14`), apoio e legenda `text-13`, título da seção 16/600. **Nenhum texto de 12 ou 11 px novo**: a célula sai de `text-12`/`text-[11px]` para `text-13`, a dica e as linhas de apoio dos blocos também. A exceção é o `pn-chip` (chip de estado, 12 px, mono), que a decisão 3 permite.
- **`cn()` com `text-13` + cor está liberado.** O #388 está em `main` (`d74760f6`): `apps/web/src/lib/utils.ts` usa `extendTailwindMerge` com `"font-size": [{ text: [validators.isInteger] }]`, então `cn("text-13 …", "text-volt-950")` preserva o tamanho. A restrição do PR 3 não vale mais; a Task 0 confere.
- **Contratos de e2e preservados:** `data-testid="inicio-mapa"` e o heading "Mapa dos grupos" nos dois estados (com e sem grupos); `data-testid="celula-do-grupo"` com um link de `aria-label` = `rotuloAcessivel(...)`; o botão "Ver os N grupos"/"Ver o grupo" (≥ 44 px, `href="/painel/grupos"`) só abaixo de 768 px; célula ≤ 40 px no celular. **Muda na mesma onda, com o e2e:** a célula do desktop de 56 → 40 px.
- **Sem API, store ou DDL.** Tudo que o mapa mostra já vem de `/api/painel/inicio` (`groups`, `campanhas[].autoGrow/slug/groupIds`, `atividade.hojePorGrupo/gruposAbertosHoje/porHora`).
- Arquivos < 800 linhas, funções < 50 (o `MapaDosGrupos` de hoje tem ~150 linhas de função: sai em peças); sem dependência nova (`Check` é do `lucide-react` já instalado; `grid-rows-subgrid` é utilitário do Tailwind 4).
- Comentários e identificadores em pt-BR (como os arquivos); commits em inglês com prefixo semântico, terminando com a linha de atribuição da sessão (hoje `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json` (lint e tsx não checam tipo); lint `npm run lint`; suíte `npm test`; lint da vitrine `npm run painel:check`.
- Git: o cwd do Bash reseta entre chamadas, então `git -C <worktree>` com caminho absoluto. Nunca `git add -A`; `git diff --cached --stat` numa chamada separada antes de cada commit (um agente externo já sujou o índice antes).

## Onde a spec e o código divergem (decidido neste plano)

1. **Tamanho da célula.** Spec, decisão 7: *"Célula de 40 px com o número e o '+N' de hoje"*. Código (`celula-do-grupo.tsx`): `className="relative h-14 w-14 max-md:h-9 max-md:w-auto"` (56×56 no desktop, numa `flex flex-wrap gap-1.5`), e o e2e trava `expect((await celulas.first().boundingBox())?.height).toBe(56)`. No mockup G2 os 40 px são a **altura** (`.cb{height:40px}`); a largura é a da coluna de uma grade de dez (`.cells{grid-template-columns:repeat(10,minmax(0,1fr))}`). **O plano segue a spec:** 40 px de altura a partir de 768 px, largura da coluna. Com o painel em `max-w-[90rem]` a coluna mais estreita é a de 1400 px (coluna do meio de 688 px → ~61 px por célula); de 1280 a 1399 ~77 px; empilhado (768–1279) de 66 a ~113 px. Cabe "142" + "+99" em 13 px numa linha (≈ 47 px + 4 de vão em 53 px úteis). **Não é preciso célula maior.** No celular a coluna tem ~33 px: a célula fica com 36 px (`h-9`, igual a hoje) e o "+N" desce para a segunda linha; o mockup do celular (30 px, só o número, 11 px) não entra por causa da decisão 3. O e2e do desktop passa de 56 para 40 no mesmo PR (Task 2).
2. **Texto da célula.** Spec, decisão 3: *"apoio e legenda 13 px (`text-12` só em chip de estado e contador)"*. Código: rótulo `text-12 font-semibold`, "+N"/"novo HH:MM" `text-[11px]`, dica `text-12`; mockup `.cb{…font-size:12px…}` e `.cells-m .cb{…font-size:11px}`. **O plano usa 13 px em tudo** (o pedido desta série é nenhum texto de 12/11 px na célula). Para caber: o "#" sai do número em todas as larguras ("40", como o mockup G2 desenha; hoje só o celular tira) e o "+N" fica em no máximo 3 caracteres em todas as larguras ("+42", "120", "1k"; hoje só o celular). `rotuloNoCelular` e `entradaNoCelular` passam a valer para as duas larguras e viram `rotuloNaCelula` e `entradaNaCelula`. O número inteiro continua no `aria-label` e na dica.
3. **"novo HH:MM" na célula.** Código do desktop: `` {c.novoAs ? `novo ${c.novoAs}` : c.entraram > 0 ? `+${numero(c.entraram)}` : ""} ``. Mockup G2: a célula do grupo novo mostra "+64" como as outras. "novo 09:14" em 13 px não cabe em 61 px ao lado do número. **O plano tira o "novo" da célula** e leva para todas as larguras a anotação do bloco que hoje é só do celular ("**novo 09:14** · o link já leva pro #40"); a dica e o `aria-label` continuam com "aberto hoje às 09:14".
4. **Percentual na célula.** Spec: *"sem o percentual (o preenchimento diz, e o tooltip confirma)"*. O código já não escreve % na célula desde a F; a dica tem `{Math.round(c.lotacao * 100)}% · {TEXTO_DO_ESTADO[c.estado]}`. **Nada a tirar**; o e2e passa a travar (nenhuma célula com "%" no texto).
5. **LOTOU sólido.** Decisão 11 + o pedido desta série: a célula LOTOU é Acid sólido. Código: o preenchimento de todo estado tem a altura da lotação (`` style={{ height: `${Math.round(c.lotacao * 100)}%` }} ``), e "cheio" começa em `GROUP_FULL_RATIO = 0.95` — a 95% sobra uma faixa branca de 5% em cima. **O plano enche 100%** quando o estado é "cheio" (`preenchimentoDaCelula`). Os outros estados seguem com a altura da lotação e o tom de hoje (quase em âmbar com fio, ativo em cinza com fio).
6. **Ordem e lado a lado.** Spec: *"Depois da campanha maior, as outras ficam lado a lado numa grade de dez colunas (a segunda com seis, a terceira com três)"*. Código: blocos na ordem da lista (`for (const c of campanhas) … blocos.push(…)`), cada um com a largura toda. A regra da spec é posicional e só descreve os dados do mockup (40, 12 e 6 grupos); uma segunda campanha de 80 grupos numa fatia de 6 colunas viraria 14 fileiras. **O plano decide pelo tamanho:** `montarMapa` ordena as campanhas pela quantidade de grupos (maior primeiro; empate na ordem da lista; "Outros grupos" sempre por último, porque não é campanha); a largura do bloco vem das células mostradas — até 6 → 3 colunas, até 12 → 6, acima → 10 (no máximo duas fileiras lado a lado, como no mockup); e os blocos entram em ordem, lado a lado enquanto cabem, com uma coluna vazia entre vizinhos (o 6 + 1 + 3 do mockup fecha as dez). Abaixo de 768 px todo bloco usa as dez colunas, um embaixo do outro (mockup do celular).
7. **Cor dos filtros.** Spec: *"SEM CONVITE com fio vermelho"*. A página da campanha (`visao-geral.tsx`) tem o mesmo selo com outra cor: `sem_convite: { texto: "Sem convite", classe: "pn-chip--risco" }` (fundo âmbar, texto vermelho). **O mapa segue a spec** (`border border-saida text-saida`, o mesmo vermelho do contorno da célula) e copia o resto do `SELO` da campanha (`pn-chip--acid`, `bg-aviso-fundo text-warning-700`, cinza do `pn-chip`, `pn-chip--line`). A página da campanha fica como está (fora do escopo; ver Riscos).
8. **Legenda.** Código: `const LEGENDA` com cinco amostras ("lotou", "quase", "com vaga", "sem convite", "sumiu do cadastro") e "· +n = entraram hoje". Mockup G2: sem legenda; a spec põe a cor do estado nos filtros. **O plano apaga a legenda**: os filtros são a legenda, e cada célula se explica na dica e no `aria-label`. Sai junto o único `bg-acid-500` de `mapa-dos-grupos.tsx`.
9. **Cabeçalho do mapa.** Spec: *"'58 grupos · 42.368 pessoas · +214 hoje' e o link 'Todos os grupos'"*. Código: "N grupos · N pessoas" e os filtros na mesma linha. **O "+N hoje" é a mesma conta do "Entraram hoje" da faixa e do gráfico** (`somaMedida(barrasDaAtividade(a, "hoje", "entraram")).entraram`), então o número bate nos três lugares; some quando é 0, como o "+N hoje" dos blocos. O link "Todos os grupos" fica **só a partir de 768 px**: no celular continua o botão "Ver os N grupos" embaixo (contrato do e2e e zona do polegar). O mockup do celular põe "Ver todos" no cabeçalho em vez do botão; não entra.
10. **Linha da campanha.** Spec: *"'40 grupos · 95% das vagas · +171 hoje' e '✓ abre o próximo sozinho' quando a regra está ligada"*. Código: desktop só `{b.todas.length}`; celular "+N hoje" no título e "N grupos · N pessoas · P% das vagas"; em todas `` textoAbreOutro = (ligado) => `Lotou → abre outro: ${ligado ? "ligado" : "desligado"}` ``. **O plano usa a linha da spec em todas as larguras** (sem "pessoas"; `resumoDoBloco.pessoas` fica sem uso e sai) e mostra "✓ abre o próximo sozinho" só com a regra ligada. Desligada não diz nada: quando todos os grupos lotam com ela desligada, o alerta do rodapé já avisa ("todos os grupos lotaram e o 'Lotou → abre outro' está desligado"). Continua link para `/editar` quando a campanha tem slug.
11. **Rodapé de alerta.** Spec: *"Rodapé de alerta com o botão 'Configurar convite' para o grupo sem convite"*. Código: os alertas ficam **em cima** dos blocos, com a ação como link de texto (`className="font-semibold text-cobalt-500 hover:underline"`). **O plano leva os alertas para o fim do cartão** (uma linha por alerta, com fio em cima) e a ação vira um `Link` com cara de botão de 32 px (é navegação, então `a`; nunca Acid). O texto continua o de `alertasDoMapa` ("Brás #2 está sem convite"): o do mockup ("o link caiu e ninguém novo entra por ele") afirma uma causa que "sem convite" não garante (o convite pode nunca ter sido configurado).
12. **"⚡ relâmpago no ar" na linha da campanha** (mockup, bloco Saldão): não está no texto da decisão 7 e o mapa não recebe a relâmpago. **Não entra.**
13. **Filtro pressionado.** Código: `bg-hover-ficha`. Mockup: `.chip.is-on{background:var(--s3)}` = `#E8EDF0`, o "selecionado" da decisão 1 (`--color-porta-ativa` no tema G2). **O plano usa `bg-porta-ativa`.**

## File Structure

| Arquivo (em `apps/web`) | Ação | Responsabilidade |
|---|---|---|
| `src/lib/painel/ao-vivo/mapa.ts` (+ `.test.ts`) | modificar | ordem dos blocos; `larguraDoBloco`, `lugaresDosBlocos`; `preenchimentoDaCelula`; `rotuloNaCelula`/`entradaNaCelula` (renomes); `resumoDoBloco` sem `pessoas` |
| `src/components/painel/home/ao-vivo/celula-do-grupo.tsx` | reescrever | célula de 40/36 px em 13 px, LOTOU sólido, dica num componente |
| `src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx` | reescrever | cabeçalho, filtros com selo, blocos na grade de 10, rodapé de alerta |
| `e2e/painel-inicio-ao-vivo.spec.ts` | modificar | 40 px sem %, 13 px, filtros, 10 colunas no celular |

`inicio-ao-vivo.tsx` não muda (as props do mapa são as mesmas). `painel-vitrine.css` não tem regra de mapa (`grep -n mapa` vazio) e não muda: tudo é utilitário do Tailwind e `pn-chip` (que já está em `@layer components`, então `bg-aviso-fundo`/`text-saida` na mesma tag vencem o primitivo).

### Ondas (regra de subagentes paralelos)

| Onda | Tasks | Por quê |
|---|---|---|
| 0 | Task 0 | preparação |
| 1 | Task 1 ∥ Task 2 | arquivos disjuntos; o e2e não importa a lib |
| 2 | Task 3 ∥ Task 4 | arquivos disjuntos; os dois importam da Task 1; a célula não muda de props |
| 3 | Task 5 | gate local, revisão, PR, produção |

Implementadores não commitam; o controller commita por task, na ordem da onda.

---

### Task 0: preparação

**Files:** nenhum
**Depends-on:** PR #389 (G2 PR 3) mergeado

- [ ] **Step 1:** `gh pr view 389 --json state,mergedAt` → `MERGED`. Se não: parar. Este PR assume a faixa do PR 3 no ar (o "+N hoje" do mapa tem que bater com o "Entraram hoje" dela).
- [ ] **Step 2:** no worktree da sessão (nunca o checkout principal; nunca `git worktree add`, o harness bloqueia escrever em outro worktree): `git -C <worktree> status --short` vazio, `git -C <worktree> fetch origin main`, `git -C <worktree> switch -c feat/painel-g2-mapa origin/main`.
- [ ] **Step 3:** conferir a base que este plano assume:
  - `git -C <worktree> grep -n "extendTailwindMerge" apps/web/src/lib/utils.ts` → existe (o `cn()` com `text-13` + cor é seguro);
  - `git -C <worktree> grep -n "h-14 w-14\|entradaNoCelular" apps/web/src/components/painel/home/ao-vivo/celula-do-grupo.tsx` → os dois existem;
  - `git -C <worktree> grep -n "const LEGENDA\|textoAbreOutro" apps/web/src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx` → os dois existem;
  - `git -C <worktree> grep -n "células de 56 px" apps/web/e2e/painel-inicio-ao-vivo.spec.ts` → existe;
  - `git -C <worktree> grep -n "numerosDaFaixa" apps/web/src/lib/painel/ao-vivo/faixa.ts` → existe (PR 3 em `main`).
  Se algo divergir, parar e reler os arquivos antes de seguir.
- [ ] **Step 4:** `gh pr list --state open` — nenhuma outra sessão com PR em `mapa-dos-grupos.tsx`, `celula-do-grupo.tsx` ou `mapa.ts`.
- [ ] **Step 5:** o card `painel-g2-barra-volt` continua `em_construcao` (é o card da série; só vai a `no_ar_verificado` depois do PR 5). Nada a mover.

### Task 1: regras do mapa G2 (TDD)

**Files:** `apps/web/src/lib/painel/ao-vivo/mapa.ts`, `apps/web/src/lib/painel/ao-vivo/mapa.test.ts`
**Depends-on:** Task 0

> O `tsc` do app fica vermelho entre esta task e o fim da onda 2 (`celula-do-grupo.tsx` ainda importa `rotuloNoCelular`/`entradaNoCelular`; `mapa-dos-grupos.tsx` lê `resumo.pessoas`). Aqui roda só o teste da unidade; o PR é squash.

- [ ] **Step 1 (teste):** em `mapa.test.ts`, trocar o bloco de import

```ts
import {
  CELULAS_POR_BLOCO_NO_LIMITE,
  celulasDoFiltro,
  MAX_ALERTAS,
  montarMapa,
  entradaNoCelular,
  novoDoBloco,
  resumoDoBloco,
  rotuloNoCelular,
  rotuloAcessivel,
  type BlocoDoMapa,
  type CampanhaDoMapa,
} from "./mapa";
```

  por

```ts
import {
  CELULAS_POR_BLOCO_NO_LIMITE,
  celulasDoFiltro,
  entradaNaCelula,
  larguraDoBloco,
  lugaresDosBlocos,
  MAX_ALERTAS,
  montarMapa,
  novoDoBloco,
  preenchimentoDaCelula,
  resumoDoBloco,
  rotuloAcessivel,
  rotuloNaCelula,
  type BlocoDoMapa,
  type CampanhaDoMapa,
} from "./mapa";
```

- [ ] **Step 2 (teste):** substituir os três testes inteiros, de `test("resumo do bloco: grupos, pessoas, % das vagas e entradas de hoje (o sumiu conta como grupo, não como vaga)", …` até o fim de `test("célula do celular: número sem #, +N em até 3 caracteres e sumiu sem a palavra", …` (linhas 248–284 de hoje), por:

```ts
test("resumo do bloco: grupos, % das vagas e entradas de hoje (o sumiu conta como grupo, não como vaga)", () => {
  const mapa = montarMapa({
    grupos: [grupo("40", { members: 900, capacity: 1000 }), grupo("39", { members: 500, capacity: 1000 })],
    campanhas: [{ ...vip, groupIds: ["40@g.us", "39@g.us", "sumido@g.us"] }],
    hojePorGrupo: { "40@g.us": { entraram: 64, sairam: 2 }, "39@g.us": { entraram: 7, sairam: 0 }, "sumido@g.us": { entraram: 1, sairam: 0 } },
    abertosHoje: [],
  });
  assert.deepEqual(resumoDoBloco(mapa.blocos[0]), { grupos: 3, pctDasVagas: 70, entraramHoje: 72 });
});

test("resumo do bloco: a % só olha grupos com capacidade; sem capacidade nenhuma ela é null", () => {
  const misto = montarMapa({
    grupos: [grupo("1", { members: 500, capacity: 1000 }), grupo("2", { members: 300, capacity: 0 })],
    campanhas: [],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  // O grupo sem capacidade conta como grupo, mas as 300 pessoas dele não entram na % (500/1000, não 800/1000).
  assert.deepEqual(resumoDoBloco(misto.blocos[0]), { grupos: 2, pctDasVagas: 50, entraramHoje: 0 });
  const semVaga = montarMapa({ grupos: [grupo("1", { members: 10, capacity: 0 })], campanhas: [], hojePorGrupo: {}, abertosHoje: [] });
  assert.deepEqual(resumoDoBloco(semVaga.blocos[0]), { grupos: 1, pctDasVagas: null, entraramHoje: 0 });
});

test("célula: número sem #, +N em até 3 caracteres e sumiu sem a palavra, em todas as larguras", () => {
  const mapa = montarMapa({
    grupos: [grupo("40"), grupo("solto", { name: "Clientes antigos" })],
    campanhas: [{ ...vip, groupIds: ["40@g.us", "fantasma@g.us"] }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  const [c40, sumiu] = vis(mapa.blocos[0]).celulas;
  assert.equal(rotuloNaCelula(c40), "40");
  assert.equal(rotuloNaCelula(sumiu), "");
  assert.equal(rotuloNaCelula(vis(mapa.blocos[1]).celulas[0]), "1º");
  assert.deepEqual([0, 7, 99, 100, 999, 1000, 1234, 54000, 250000].map(entradaNaCelula), ["", "+7", "+99", "100", "999", "1k", "1k", "54k", "99k"]);
  for (const n of [1, 42, 99, 100, 999, 1000, 99999, 1e7]) assert.ok(entradaNaCelula(n).length <= 3);
});
```

- [ ] **Step 3 (teste):** acrescentar no fim do arquivo:

```ts
test("a campanha maior vem primeiro; empate fica na ordem da lista; Outros grupos sempre por último", () => {
  const mapa = montarMapa({
    grupos: [
      grupo("1"),
      grupo("2"),
      grupo("3"),
      grupo("4"),
      grupo("5"),
      grupo("s1", { name: "Clientes antigos" }),
      grupo("s2", { name: "Fornecedores" }),
    ],
    campanhas: [
      { id: "c-bras", name: "Brás", groupIds: ["1@g.us"] },
      { id: "c-vip", name: "VIP", groupIds: ["2@g.us", "3@g.us", "4@g.us"] },
      { id: "c-sal", name: "Saldão", groupIds: ["5@g.us"] },
    ],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  // "Outros grupos" tem 2 e a Brás 1: mesmo maior, fica no fim (não é campanha).
  assert.deepEqual(mapa.blocos.map((b) => b.titulo), ["VIP", "Brás", "Saldão", "Outros grupos"]);
});

test("lotou enche a célula inteira (Acid sólido, decisão 11); os outros estados enchem até a lotação", () => {
  const mapa = montarMapa({
    grupos: [grupo("40", { members: 980 }), grupo("39", { members: 900 }), grupo("2", { members: 10, inviteUrl: undefined })],
    campanhas: [vip],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  const [c2, c39, c40] = vis(mapa.blocos[0]).celulas;
  assert.equal(c40.estado, "cheio");
  assert.equal(preenchimentoDaCelula(c40), 1);
  assert.equal(preenchimentoDaCelula(c39), 0.9);
  assert.equal(preenchimentoDaCelula(c2), 0.01);
});

test("largura do bloco: até 6 grupos em 3 colunas, até 12 em 6, acima disso a linha toda", () => {
  assert.deepEqual([1, 6, 7, 12, 13, 40].map((n) => larguraDoBloco(n)), [3, 3, 6, 6, 10, 10]);
});

test("lugares: a maior na linha toda; as menores lado a lado com uma coluna vazia entre elas (o 6 + 3 do mockup)", () => {
  assert.deepEqual(lugaresDosBlocos([40, 12, 6]), [
    { linha: 1, coluna: 1, largura: 10 },
    { linha: 2, coluna: 1, largura: 6 },
    { linha: 2, coluna: 8, largura: 3 },
  ]);
  // Dois de 6 não cabem lado a lado (6 + 1 + 6 > 10); três de 3 também não (3 + 1 + 3 + 1 + 3 > 10).
  assert.deepEqual(lugaresDosBlocos([12, 7, 3, 2, 1]), [
    { linha: 1, coluna: 1, largura: 6 },
    { linha: 2, coluna: 1, largura: 6 },
    { linha: 2, coluna: 8, largura: 3 },
    { linha: 3, coluna: 1, largura: 3 },
    { linha: 3, coluna: 5, largura: 3 },
  ]);
  // A linha toda depois de um bloco pequeno desce para a próxima linha.
  assert.deepEqual(lugaresDosBlocos([3, 20]), [
    { linha: 1, coluna: 1, largura: 3 },
    { linha: 2, coluna: 1, largura: 10 },
  ]);
  assert.deepEqual(lugaresDosBlocos([]), []);
});
```

- [ ] **Step 4:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/ao-vivo/mapa.test.ts` → FAIL (`entradaNaCelula`, `rotuloNaCelula`, `preenchimentoDaCelula`, `larguraDoBloco`, `lugaresDosBlocos` não existem; a ordem dos blocos e o `resumoDoBloco` sem `pessoas` falham).
- [ ] **Step 5:** em `mapa.ts`, trocar o comentário do topo

```ts
/**
 * O mapa dos grupos da Início "Ao vivo" (spec 2026-10-02): uma célula por grupo,
 * agrupada por campanha, com o estado de `estadoDoGrupo` — a mesma regra da tela
 * de Grupos, para o mapa nunca discordar dela.
 */
```

  por

```ts
/**
 * O mapa dos grupos da Início "Ao vivo" (spec 2026-10-02; G2 em 2026-10-05, decisão 7):
 * uma célula por grupo, agrupada por campanha, com o estado de `estadoDoGrupo` — a mesma
 * regra da tela de Grupos, para o mapa nunca discordar dela. A campanha maior vem primeiro
 * e as menores ficam lado a lado na grade de dez colunas (`lugaresDosBlocos`).
 */
```

- [ ] **Step 6:** em `mapa.ts`, trocar

```ts
export const MAX_ALERTAS = 3;
```

  por

```ts
export const MAX_ALERTAS = 3;
/** Colunas da grade do mapa a partir de 768 px (spec G2, decisão 7). No celular todo bloco usa as dez. */
export const COLUNAS_DO_MAPA = 10;
```

- [ ] **Step 7:** em `mapa.ts`, trocar o trecho de `export type ResumoDoBloco` até o fim de `entradaNoCelular`

```ts
export type ResumoDoBloco = { grupos: number; pessoas: number; pctDasVagas: number | null; entraramHoje: number };

const finito = (n: number) => (Number.isFinite(n) ? n : 0);

/**
 * Os números do cabeçalho do bloco no celular. O sumiu entra como grupo e como entrada (membros e capacidade 0).
 * A % das vagas só olha os grupos com capacidade conhecida: pessoas de grupo sem capacidade não inflam a conta;
 * sem nenhuma capacidade conhecida ela é `null` e a tela omite a frase.
 */
export function resumoDoBloco(b: BlocoDoMapa): ResumoDoBloco {
  const comVaga = b.todas.filter((c) => finito(c.capacidade) > 0);
  const vagas = comVaga.reduce((s, c) => s + c.capacidade, 0);
  const ocupadas = comVaga.reduce((s, c) => s + finito(c.membros), 0);
  return {
    grupos: b.todas.length,
    pessoas: b.todas.reduce((s, c) => s + finito(c.membros), 0),
    pctDasVagas: vagas > 0 ? Math.round((ocupadas / vagas) * 100) : null,
    entraramHoje: b.todas.reduce((s, c) => s + c.entraram, 0),
  };
}

/** Rótulo da célula no celular: sem o "#" ("40"); o sumiu não escreve a palavra (a célula mostra um ícone). */
export function rotuloNoCelular(c: CelulaDoMapa): string {
  return c.estado === "sumiu" ? "" : c.rotulo.replace(/^#/, "");
}

/** "+N" da célula do celular em no máximo 3 caracteres: "+42", "120" (sem o +), "1k". O nome acessível guarda o número inteiro. */
export function entradaNoCelular(n: number): string {
  if (!(n > 0)) return "";
  if (n < 100) return `+${n}`;
  if (n < 1000) return String(n);
  return `${Math.min(99, Math.floor(n / 1000))}k`;
}
```

  por

```ts
export type ResumoDoBloco = { grupos: number; pctDasVagas: number | null; entraramHoje: number };

const finito = (n: number) => (Number.isFinite(n) ? n : 0);

/**
 * A linha do bloco: "40 grupos · 95% das vagas · +171 hoje" (spec G2, decisão 7). O sumiu entra como grupo e
 * como entrada (capacidade 0). A % das vagas só olha os grupos com capacidade conhecida: pessoas de grupo sem
 * capacidade não inflam a conta; sem nenhuma capacidade conhecida ela é `null` e a tela omite a frase.
 */
export function resumoDoBloco(b: BlocoDoMapa): ResumoDoBloco {
  const comVaga = b.todas.filter((c) => finito(c.capacidade) > 0);
  const vagas = comVaga.reduce((s, c) => s + c.capacidade, 0);
  const ocupadas = comVaga.reduce((s, c) => s + finito(c.membros), 0);
  return {
    grupos: b.todas.length,
    pctDasVagas: vagas > 0 ? Math.round((ocupadas / vagas) * 100) : null,
    entraramHoje: b.todas.reduce((s, c) => s + c.entraram, 0),
  };
}

/** Rótulo da célula: sem o "#" ("40", como no mockup G2); o sumiu não escreve a palavra (a célula mostra um ícone). */
export function rotuloNaCelula(c: CelulaDoMapa): string {
  return c.estado === "sumiu" ? "" : c.rotulo.replace(/^#/, "");
}

/**
 * "+N" da célula em no máximo 3 caracteres: "+42", "120" (sem o +), "1k". Em 13 px cabe ao lado do número na
 * célula de ~61 px do desktop e embaixo dele na de ~33 px do celular. O nome acessível e a dica guardam o número inteiro.
 */
export function entradaNaCelula(n: number): string {
  if (!(n > 0)) return "";
  if (n < 100) return `+${n}`;
  if (n < 1000) return String(n);
  return `${Math.min(99, Math.floor(n / 1000))}k`;
}

/** Quanto da célula o preenchimento cobre: Lotou é Acid sólido na célula inteira (spec G2, decisão 11); os outros, a lotação. */
export function preenchimentoDaCelula(c: CelulaDoMapa): number {
  return c.estado === "cheio" ? 1 : c.lotacao;
}

export type LarguraDoBloco = 3 | 6 | 10;
export type LugarDoBloco = { linha: number; coluna: number; largura: LarguraDoBloco };

/** Até 6 grupos em 3 colunas e até 12 em 6 (no máximo duas fileiras, como no mockup G2); acima disso a linha toda. */
export function larguraDoBloco(celulas: number): LarguraDoBloco {
  if (celulas <= 6) return 3;
  if (celulas <= 12) return 6;
  return COLUNAS_DO_MAPA;
}

/**
 * Onde cada bloco fica na grade de 10 colunas, na ordem dada: lado a lado enquanto cabe, com uma coluna vazia
 * entre vizinhos (o 6 + 1 + 3 do mockup G2 fecha as dez). O que não cabe desce para a próxima linha.
 */
export function lugaresDosBlocos(celulas: readonly number[]): LugarDoBloco[] {
  // ponytail: next-fit — não volta para preencher a sobra de uma linha anterior; first-fit se o vazio incomodar.
  let linha = 1;
  let coluna = 1;
  return celulas.map((n) => {
    const largura = larguraDoBloco(n);
    if (coluna + largura - 1 > COLUNAS_DO_MAPA) {
      linha += 1;
      coluna = 1;
    }
    const lugar = { linha, coluna, largura };
    coluna += largura + 1;
    return lugar;
  });
}
```

- [ ] **Step 8:** em `montarMapa`, trocar

```ts
  const emCampanha = new Set<string>();
  const blocos: BlocoDoMapa[] = [];
  for (const c of campanhas) {
    const doBloco = gruposDa(c, porId);
    const sumidos = sumidosDa(c, porId);
    if (doBloco.length + sumidos.length === 0) continue;
    for (const g of doBloco) emCampanha.add(g.whatsappGroupId);
    blocos.push(bloco(c.id, c.name, hrefDaCampanha(c), c.autoGrow ?? null, doBloco, sumidos, ctx));
  }
  const fora = grupos.filter((g) => !emCampanha.has(g.whatsappGroupId));
```

  por

```ts
  const emCampanha = new Set<string>();
  const dasCampanhas: BlocoDoMapa[] = [];
  for (const c of campanhas) {
    const doBloco = gruposDa(c, porId);
    const sumidos = sumidosDa(c, porId);
    if (doBloco.length + sumidos.length === 0) continue;
    for (const g of doBloco) emCampanha.add(g.whatsappGroupId);
    dasCampanhas.push(bloco(c.id, c.name, hrefDaCampanha(c), c.autoGrow ?? null, doBloco, sumidos, ctx));
  }
  // A campanha maior primeiro (spec G2, decisão 7: as menores ficam lado a lado depois dela). O sort é estável:
  // empate fica na ordem da lista. "Outros grupos" não é campanha: vai sempre por último.
  const blocos = [...dasCampanhas].sort((a, b) => b.todas.length - a.todas.length);
  const fora = grupos.filter((g) => !emCampanha.has(g.whatsappGroupId));
```

  (a linha seguinte, `if (fora.length > 0) blocos.push(bloco("outros", …))`, fica como está.)

- [ ] **Step 9:** o comando do Step 4 → PASS (20 testes).
- [ ] **Step 10 (controller):** `git -C <worktree> add apps/web/src/lib/painel/ao-vivo/mapa.ts apps/web/src/lib/painel/ao-vivo/mapa.test.ts`; `git -C <worktree> diff --cached --stat` (só os dois); commit `feat(painel): G2 map rules: biggest campaign first, 3/6/10-column placement, solid LOTOU fill`.

### Task 2: e2e do mapa G2

**Files:** `apps/web/e2e/painel-inicio-ao-vivo.spec.ts`
**Depends-on:** Task 0

- [ ] **Step 1:** trocar a primeira linha

```ts
import { expect, test } from "@playwright/test";
```

  por

```ts
import { expect, test, type Locator } from "@playwright/test";
```

- [ ] **Step 2:** logo depois do comentário de abertura do arquivo (o bloco `/** Início "Ao vivo" (spec 2026-10-02)… */`), antes do primeiro `test.describe`, acrescentar:

```ts
/** Textos do mapa com menos de 13 px (spec G2, decisão 3). O `pn-chip` é a exceção: chip de estado de 12 px. */
function textosAbaixoDe13px(regiao: Locator): Promise<string[]> {
  return regiao.evaluate((el) =>
    [...el.querySelectorAll("*")]
      // nodeType 3 = texto: só os elementos que escrevem alguma coisa direto.
      .filter((n) => !n.closest(".pn-chip") && [...n.childNodes].some((c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== ""))
      .filter((n) => parseFloat(getComputedStyle(n).fontSize) < 13)
      .map((n) => (n.textContent ?? "").trim()),
  );
}

/** Quantas colunas tem a grade de células do bloco desta célula. */
function colunasDaGrade(celula: Locator): Promise<number> {
  return celula.evaluate((el) => getComputedStyle(el.closest("ul")!).gridTemplateColumns.split(" ").length);
}
```

- [ ] **Step 3:** no `describe("Início ao vivo no celular")`, substituir o teste inteiro

```ts
  test("o mapa é compacto no celular: célula baixa e o atalho para os grupos", async ({ page }) => {
    await page.goto("/painel?aba=grupos", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    const celulas = mapa.getByTestId("celula-do-grupo");
    expect(await celulas.count()).toBeGreaterThan(0);
    const caixa = await celulas.first().boundingBox();
    expect(caixa?.height).toBeLessThanOrEqual(40);
    const ver = mapa.getByRole("link", { name: /^Ver (os [\d.]+ grupos|o grupo)$/ });
    await expect(ver).toBeVisible();
    await expect(ver).toHaveAttribute("href", "/painel/grupos");
    expect((await ver.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
```

  por

```ts
  test("o mapa é compacto no celular: célula de até 40 px, dez colunas, texto de 13 px e o atalho para os grupos", async ({ page }) => {
    await page.goto("/painel?aba=grupos", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    const celulas = mapa.getByTestId("celula-do-grupo");
    expect(await celulas.count()).toBeGreaterThan(0);
    const caixa = await celulas.first().boundingBox();
    expect(caixa?.height).toBeLessThanOrEqual(40);
    // No celular todo bloco usa as dez colunas: o lado a lado é a partir de 768 px (spec G2, decisão 7).
    expect(await colunasDaGrade(celulas.first())).toBe(10);
    expect(await textosAbaixoDe13px(mapa)).toEqual([]);
    const ver = mapa.getByRole("link", { name: /^Ver (os [\d.]+ grupos|o grupo)$/ });
    await expect(ver).toBeVisible();
    await expect(ver).toHaveAttribute("href", "/painel/grupos");
    expect((await ver.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
```

- [ ] **Step 4:** no `describe("Início ao vivo a partir de 768 px")` (viewport 1440), substituir o teste inteiro

```ts
  test("o mapa mantém as células de 56 px e não mostra os atalhos do celular", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    const celulas = mapa.getByTestId("celula-do-grupo");
    expect(await celulas.count()).toBeGreaterThan(0);
    expect((await celulas.first().boundingBox())?.height).toBe(56);
    await expect(mapa.getByRole("link", { name: /^Ver (os [\d.]+ grupos|o grupo)$/ })).toBeHidden();
  });
```

  por

```ts
  test("o mapa G2: células de 40 px sem percentual, texto de 13 px, filtros com contagem e o atalho Todos os grupos", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    const celulas = mapa.getByTestId("celula-do-grupo");
    expect(await celulas.count()).toBeGreaterThan(0);
    expect((await celulas.first().boundingBox())?.height).toBe(40);
    // Sem o percentual na célula (decisão 7): a lotação é o preenchimento; a dica confirma.
    expect(await celulas.evaluateAll((cs) => cs.filter((c) => (c.textContent ?? "").includes("%")).length)).toBe(0);
    // A partir de 768 px o bloco tem 3, 6 ou 10 colunas, conforme o tamanho da campanha.
    expect([3, 6, 10]).toContain(await colunasDaGrade(celulas.first()));
    expect(await textosAbaixoDe13px(mapa)).toEqual([]);
    await expect(mapa.getByRole("link", { name: "Todos os grupos", exact: true })).toHaveAttribute("href", "/painel/grupos");
    const filtros = mapa.getByRole("group", { name: "Filtrar grupos" });
    await expect(filtros.getByRole("button", { name: /^Todos [\d.]+$/ })).toHaveAttribute("aria-pressed", "true");
    await expect(mapa.getByRole("link", { name: /^Ver (os [\d.]+ grupos|o grupo)$/ })).toBeHidden();
  });

  test("o filtro Lotou leva o selo Acid num span, não no botão, e mostra só os lotados", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    // /i: o selo é `pn-chip` (caixa alta por CSS), e o nome acessível pode vir como "Lotou" ou "LOTOU".
    const lotou = mapa.getByRole("group", { name: "Filtrar grupos" }).getByRole("button", { name: /^lotou [\d.]+$/i });
    await expect(lotou.locator(".pn-chip--acid")).toHaveCount(1);
    await lotou.click();
    await expect(lotou).toHaveAttribute("aria-pressed", "true");
    const nomes = await mapa
      .getByTestId("celula-do-grupo")
      .getByRole("link")
      .evaluateAll((ls) => ls.map((l) => l.getAttribute("aria-label") ?? ""));
    // O tenant de QA pode não ter grupo lotado: aí a tela diz isso.
    if (nomes.length === 0) await expect(mapa.getByText('Nenhum grupo em "Lotou".')).toBeVisible();
    for (const nome of nomes) expect(nome).toMatch(/, lotou(, |$)/);
  });
```

- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.e2e.json` → limpo. (O e2e só roda no CI.)
- [ ] **Step 6 (controller):** `git -C <worktree> add apps/web/e2e/painel-inicio-ao-vivo.spec.ts`; `diff --cached --stat`; commit `test(e2e): G2 map: 40 px cells without percent, 13 px text, state-colored filters`.

### Task 3: a célula G2

**Files:** `apps/web/src/components/painel/home/ao-vivo/celula-do-grupo.tsx`
**Depends-on:** Task 1

- [ ] **Step 1:** `celula-do-grupo.tsx` inteiro:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleSlash, Link2Off } from "lucide-react";
import { numero } from "@/lib/painel/grupos";
import {
  entradaNaCelula,
  preenchimentoDaCelula,
  rotuloAcessivel,
  rotuloNaCelula,
  TEXTO_DO_ESTADO,
  type CelulaDoMapa,
} from "@/lib/painel/ao-vivo/mapa";
import { cn } from "@/lib/utils";

/**
 * Célula do mapa G2 (spec 2026-10-05, decisão 7): o número do grupo e o "+N" de hoje, sem percentual. A lotação
 * enche a célula de baixo para cima e a dica confirma o número. Lotou é Acid sólido na célula inteira (decisão 11;
 * o número em Volt lê 14,5:1 em cima dele); os outros estados usam um tom fraco da cor com um fio sólido no topo.
 * O Acid fica no `span` — nunca na classe do link (regra 10, e2e da casca).
 *
 * Sem convite = contorno vermelho + ícone no lugar do "+N". O vermelho é `saida`, a cor da série de saídas do
 * gráfico (5,4:1 sobre a superfície branca; fio pede 3:1). Sumiu do cadastro = contorno tracejado e ícone.
 *
 * Texto de 13 px (decisão 3). A partir de 768 px: 40 px de altura e a largura da coluna da grade (~61 px na mais
 * estreita, a 1400 px), número e "+N" numa linha, embaixo. No celular a coluna tem ~33 px: 36 px de altura, com o
 * "+N" na segunda linha.
 */
const PREENCHIMENTO: Record<CelulaDoMapa["estado"], string> = {
  cheio: "bg-acid-500",
  quase: "bg-quase/25 border-t-2 border-quase",
  ativo: "bg-slate-600/20 border-t border-slate-600/60",
  sem_convite: "bg-slate-600/15",
  sumiu: "",
};

const BORDA: Record<CelulaDoMapa["estado"], string> = {
  cheio: "border-line-200",
  quase: "border-line-200",
  ativo: "border-line-200",
  sem_convite: "border-saida",
  sumiu: "border-dashed border-slate-600",
};

const CAIXA = [
  "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[4px] border bg-paper-0 px-0.5 py-[3px]",
  "text-13 leading-none tabular-nums text-volt-950",
  "md:flex-row md:items-end md:gap-1 md:rounded-md md:px-1 md:py-1",
].join(" ");

export function CelulaDoGrupo({ celula: c, bloco }: { celula: CelulaDoMapa; bloco: string }) {
  // WCAG 1.4.13: a dica fecha com Esc sem tirar o foco/mouse, e o mouse pode ir da célula até ela
  // (a dica é filha do mesmo contêiner, então sair da célula para a dica não conta como sair).
  const [mouse, setMouse] = useState(false);
  const [foco, setFoco] = useState(false);
  const [dispensada, setDispensada] = useState(false);
  const aberta = (mouse || foco) && !dispensada;

  useEffect(() => {
    if (!mouse && !foco) setDispensada(false);
  }, [mouse, foco]);

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDispensada(true);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberta]);

  return (
    <div
      data-testid="celula-do-grupo"
      className="relative h-9 md:h-10"
      onMouseEnter={() => setMouse(true)}
      onMouseLeave={() => setMouse(false)}
      onFocus={() => setFoco(true)}
      onBlur={() => setFoco(false)}
    >
      <Link
        href={c.href}
        aria-label={rotuloAcessivel(bloco, c)}
        className="block h-full w-full rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        <span aria-hidden="true" className={cn(CAIXA, BORDA[c.estado])}>
          <span className={cn("absolute inset-x-0 bottom-0", PREENCHIMENTO[c.estado])} style={{ height: `${Math.round(preenchimentoDaCelula(c) * 100)}%` }} />
          <span className="relative font-semibold">{rotuloNaCelula(c)}</span>
          <span className="relative flex font-medium">
            {c.estado === "sem_convite" ? (
              <Link2Off className="h-3.5 w-3.5 text-saida" aria-hidden="true" />
            ) : c.estado === "sumiu" ? (
              <CircleSlash className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
            ) : (
              entradaNaCelula(c.entraram)
            )}
          </span>
        </span>
      </Link>
      {aberta && <Dica celula={c} />}
    </div>
  );
}

/**
 * A dica no hover e no foco do teclado. No celular não: a célula é um toque que já leva ao grupo, e a dica passaria
 * da borda da tela; o leitor de tela já tem tudo no aria-label. O pb-1.5 faz a ponte entre a célula e a caixa: o
 * mouse não passa por um vão ao subir até ela.
 */
function Dica({ celula: c }: { celula: CelulaDoMapa }) {
  return (
    <span aria-hidden="true" className="absolute bottom-full left-1/2 z-20 -translate-x-1/2 pb-1.5 max-md:hidden">
      <span className="block w-max max-w-[240px] rounded-md bg-volt-950 px-2.5 py-1.5 text-13 leading-snug text-paper-0 shadow-lg">
        <span className="block font-semibold">{c.nome}</span>
        {c.estado === "sumiu" ? (
          <span className="block">{TEXTO_DO_ESTADO.sumiu}</span>
        ) : (
          <span className="block tabular-nums">
            {numero(c.membros)} / {numero(c.capacidade)} · {Math.round(c.lotacao * 100)}% · {TEXTO_DO_ESTADO[c.estado]}
          </span>
        )}
        {(c.entraram > 0 || c.sairam > 0) && (
          <span className="block tabular-nums">
            hoje: +{numero(c.entraram)} −{numero(c.sairam)}
          </span>
        )}
        {c.novoAs && <span className="block">aberto hoje às {c.novoAs}</span>}
      </span>
    </span>
  );
}
```

- [ ] **Step 2:** checagens (em `apps/web`):
  - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep celula-do-grupo` → vazio (o `tsc` inteiro só fica verde com a Task 4);
  - `grep -n "text-12\|text-\[11px\]\|h-14\|w-14" src/components/painel/home/ao-vivo/celula-do-grupo.tsx` → vazio;
  - `grep -c "bg-acid" src/components/painel/home/ao-vivo/celula-do-grupo.tsx` → 1.
- [ ] **Step 3 (controller):** `git -C <worktree> add apps/web/src/components/painel/home/ao-vivo/celula-do-grupo.tsx`; `diff --cached --stat` (só ele); commit `feat(painel): G2 map cell: 40 px, number and +N in 13 px, LOTOU fills the whole cell`.

### Task 4: o mapa G2

**Files:** `apps/web/src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx`
**Depends-on:** Task 1

- [ ] **Step 1:** `mapa-dos-grupos.tsx` inteiro:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { Campanha } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import { barrasDaAtividade, somaMedida, type AtividadeDaCampanha } from "@/lib/painel/atividade";
import {
  celulasDoFiltro,
  lugaresDosBlocos,
  montarMapa,
  novoDoBloco,
  resumoDoBloco,
  type AlertaDoMapa,
  type BlocoDoMapa,
  type CelulaDoMapa,
  type FiltroDoMapa,
  type LugarDoBloco,
} from "@/lib/painel/ao-vivo/mapa";
import type { EstadoNaCampanha } from "@/lib/painel/campanha-visao";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";
import { CelulaDoGrupo } from "./celula-do-grupo";

const FILTROS: [FiltroDoMapa, string][] = [
  ["todos", "Todos"],
  ["cheio", "Lotou"],
  ["quase", "Quase"],
  ["ativo", "Ativo"],
  ["sem_convite", "Sem convite"],
  ["sumiu", "Sumiu"],
];

/**
 * O selo de cada filtro na cor do estado (spec G2, decisão 7): os filtros são a legenda do mapa. `pn-chip` é o
 * chip de estado de 12 px, a exceção da decisão 3. Acid só no LOTOU (decisão 11), e no `span`: o botão nunca leva
 * `bg-acid` (regra 10). Mesmo desenho do `SELO` da campanha (`visao-geral.tsx`), menos o "sem convite", que aqui
 * é o fio vermelho da célula, como a spec pede.
 */
const SELO: Record<EstadoNaCampanha, string> = {
  cheio: "pn-chip--acid",
  quase: "bg-aviso-fundo text-warning-700",
  ativo: "",
  sem_convite: "border border-saida bg-paper-0 text-saida",
  sumiu: "pn-chip--line",
};

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const BOTAO_DO_CELULAR = `flex min-h-11 w-full min-w-0 items-center justify-center rounded-[var(--radius-control)] border border-line-200 px-3 text-center text-[14px] font-medium text-volt-950 ${FOCO}`;
const BOTAO_DO_ALERTA = `inline-flex h-8 shrink-0 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-semibold text-volt-950 hover:bg-hover-ficha ${FOCO}`;

/** Só a campanha com slug tem tela de configuração; "/painel/campanhas" e "Outros grupos" não. */
const linkDaCampanha = (href: string) => href.startsWith("/painel/campanhas/") && href !== "/painel/campanhas";

type Props = { grupos: Group[]; campanhas: Campanha[]; atividade: AtividadeDaCampanha | null };

/** O mapa dos grupos da Início "Ao vivo" (spec G2 2026-10-05, decisão 7): onde está entrando gente e o que lotou. */
export function MapaDosGrupos({ grupos, campanhas, atividade }: Props) {
  const [filtro, setFiltro] = useState<FiltroDoMapa>("todos");
  const mapa = useMemo(
    () =>
      montarMapa({
        grupos,
        campanhas,
        hojePorGrupo: atividade?.hojePorGrupo ?? {},
        abertosHoje: atividade?.gruposAbertosHoje ?? [],
      }),
    [grupos, campanhas, atividade],
  );
  const filtros = FILTROS.filter(([f]) => f !== "sumiu" || mapa.contagens.sumiu > 0);
  // O filtro escolhido some da lista quando a recarga zera o número (ex.: "Sumiu"): volta para "Todos".
  const [ativo, rotuloDoAtivo] = filtros.find(([f]) => f === filtro) ?? filtros[0];
  const total = mapa.contagens.todos;

  return (
    <section
      data-testid="inicio-mapa"
      aria-labelledby="mapa-titulo"
      className="rounded-[10px] border border-line-200 bg-paper-0 max-md:-mx-4 max-md:rounded-none max-md:border-x-0"
    >
      <Cabecalho grupos={grupos} total={total} atividade={atividade} />
      {total === 0 ? (
        <SemGrupos />
      ) : (
        <>
          <Filtros filtros={filtros} ativo={ativo} contagens={mapa.contagens} onEscolher={setFiltro} />
          <Blocos blocos={mapa.blocos} filtro={ativo} rotulo={rotuloDoAtivo} />
          {/* Só no celular (zona do polegar); a partir de 768 px o atalho é o "Todos os grupos" do cabeçalho. */}
          <div className="px-4 pb-4 md:hidden">
            <Link href="/painel/grupos" className={BOTAO_DO_CELULAR}>
              {total === 1 ? "Ver o grupo" : `Ver os ${numero(total)} grupos`}
            </Link>
          </div>
          <Alertas alertas={mapa.alertas} />
        </>
      )}
    </section>
  );
}

type PropsDoCabecalho = { grupos: Group[]; total: number; atividade: AtividadeDaCampanha | null };

/** "58 grupos · 42.368 pessoas · +214 hoje" e o atalho "Todos os grupos" (no celular o atalho é o botão de baixo). */
function Cabecalho({ grupos, total, atividade }: PropsDoCabecalho) {
  const pessoas = grupos.reduce((s, g) => s + (Number.isFinite(g.members) ? g.members : 0), 0);
  // A mesma conta do "Entraram hoje" da faixa e do gráfico: o número bate nos três lugares.
  const hoje = atividade ? somaMedida(barrasDaAtividade(atividade, "hoje", "entraram")).entraram : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-200 px-4 py-3 md:px-5">
      <h2 id="mapa-titulo" className="text-[16px] font-semibold text-volt-950">
        Mapa dos grupos
      </h2>
      {total > 0 && (
        <p className="text-13 tabular-nums text-slate-600">
          {numero(total)} {total === 1 ? "grupo" : "grupos"} · {numero(pessoas)} pessoas
          {hoje > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-serie">+{numero(hoje)} hoje</span>
            </>
          )}
        </p>
      )}
      {total > 0 && (
        <Link href="/painel/grupos" className={`ml-auto text-13 font-semibold text-cobalt-500 hover:underline max-md:hidden ${FOCO}`}>
          Todos os grupos
        </Link>
      )}
    </div>
  );
}

function SemGrupos() {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-15 font-semibold text-volt-950">Nenhum grupo ainda</p>
      <p className="mt-1 text-13 text-slate-600">Crie ou importe seus grupos do WhatsApp para vê-los aqui.</p>
      <Link href="/painel/grupos" className="mt-3 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-medium text-volt-950">
        Ir para Grupos
      </Link>
    </div>
  );
}

type PropsDosFiltros = {
  filtros: [FiltroDoMapa, string][];
  ativo: FiltroDoMapa;
  contagens: Record<FiltroDoMapa, number>;
  onEscolher: (f: FiltroDoMapa) => void;
};

/** Os filtros com o selo na cor do estado e a contagem. No celular rolam de lado. */
function Filtros({ filtros, ativo, contagens, onEscolher }: PropsDosFiltros) {
  return (
    <div role="group" aria-label="Filtrar grupos" className="flex gap-1.5 overflow-x-auto border-b border-line-200 px-4 py-2.5 [scrollbar-width:none] md:flex-wrap md:px-5">
      {filtros.map(([f, rotulo]) => (
        <button
          key={f}
          type="button"
          aria-pressed={ativo === f}
          onClick={() => onEscolher(f)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border px-2 text-13 font-semibold transition-colors",
            FOCO,
            ativo === f ? "border-slate-600 bg-porta-ativa text-volt-950" : "border-line-200 bg-paper-0 text-slate-600 hover:text-volt-950",
          )}
        >
          {f === "todos" ? rotulo : <span className={cn("pn-chip", SELO[f])}>{rotulo}</span>}{" "}
          <span className="tabular-nums">{numero(contagens[f])}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * As campanhas (a maior primeiro: `montarMapa` ordena). Abaixo de 768 px um bloco embaixo do outro, cada um com as
 * dez colunas. A partir daí, a grade de 10 colunas de `lugaresDosBlocos`: as linhas dela vão em pares (cabeçalho,
 * células) e cada bloco é um subgrid do seu par, para dois blocos lado a lado começarem as células na mesma altura
 * mesmo quando um cabeçalho quebra linha.
 */
function Blocos({ blocos, filtro, rotulo }: { blocos: BlocoDoMapa[]; filtro: FiltroDoMapa; rotulo: string }) {
  const visiveis = blocos.map((b) => ({ bloco: b, ...celulasDoFiltro(b, filtro) })).filter((v) => v.celulas.length > 0);
  if (visiveis.length === 0) {
    return <p className="px-4 py-4 text-13 text-slate-600 md:px-5">Nenhum grupo em &quot;{rotulo}&quot;.</p>;
  }
  const lugares = lugaresDosBlocos(visiveis.map((v) => v.celulas.length));
  return (
    <div className="flex flex-col gap-5 p-4 md:grid md:grid-cols-10 md:gap-x-1 md:gap-y-0 md:px-5 md:pb-0">
      {visiveis.map((v, i) => (
        <BlocoNoMapa key={v.bloco.chave} {...v} lugar={lugares[i]} />
      ))}
    </div>
  );
}

type PropsDoBloco = { bloco: BlocoDoMapa; celulas: CelulaDoMapa[]; ocultos: number; lugar: LugarDoBloco };

/** Uma campanha: "40 grupos · 95% das vagas · +171 hoje", o "abre o próximo sozinho" e as células. */
function BlocoNoMapa({ bloco: b, celulas, ocultos, lugar }: PropsDoBloco) {
  const resumo = resumoDoBloco(b);
  const novo = novoDoBloco(celulas);
  return (
    <div
      // grid-area = linha de cima do par / coluna / as duas linhas do par / as colunas do bloco. Só vale a partir de 768 px.
      style={{
        ["--lugar" as string]: `${2 * lugar.linha - 1} / ${lugar.coluna} / span 2 / span ${lugar.largura}`,
        ["--colunas" as string]: lugar.largura,
      }}
      className="flex min-w-0 flex-col md:grid md:grid-rows-subgrid md:[grid-area:var(--lugar)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pb-2.5">
        <h3 className="text-[14px] font-semibold text-volt-950">
          <Link href={b.href} className="hover:underline">
            {b.titulo}
          </Link>
        </h3>
        <p className="text-13 tabular-nums text-slate-600">
          {numero(resumo.grupos)} {resumo.grupos === 1 ? "grupo" : "grupos"}
          {resumo.pctDasVagas !== null && <> · {resumo.pctDasVagas}% das vagas</>}
          {resumo.entraramHoje > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-serie">+{numero(resumo.entraramHoje)} hoje</span>
            </>
          )}
        </p>
        {b.autoGrow && <AbreSozinho href={b.href} />}
      </div>
      <div className="md:pb-5">
        <ul className="grid grid-cols-10 gap-[3px] md:gap-1 md:[grid-template-columns:repeat(var(--colunas),minmax(0,1fr))]">
          {celulas.map((c) => (
            <li key={c.id} className="min-w-0">
              <CelulaDoGrupo celula={c} bloco={b.titulo} />
            </li>
          ))}
        </ul>
        {novo && (
          <p className="mt-2 text-13 text-slate-600">
            <b className="font-semibold text-volt-950">novo {novo.hora}</b> · o link já leva pro {novo.rotulo}
          </p>
        )}
        {ocultos > 0 && (
          <p className="mt-2 text-13 text-slate-600">
            mostrando os {celulas.filter((c) => c.estado !== "sumiu").length} mais cheios ·{" "}
            <Link href={b.href} className="font-semibold text-cobalt-500 hover:underline">
              ver todos os {numero(celulas.length + ocultos)}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * "✓ abre o próximo sozinho": só com o "Lotou → abre outro" ligado (spec G2, decisão 7). Desligado não diz nada:
 * quando todos lotam, o alerta do rodapé avisa.
 */
function AbreSozinho({ href }: { href: string }) {
  const texto = (
    <>
      <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
      abre o próximo sozinho
    </>
  );
  return (
    <p className="text-13 text-slate-600 md:ml-auto">
      {linkDaCampanha(href) ? (
        <Link href={`${href}/editar`} className="hover:underline">
          {texto}
        </Link>
      ) : (
        texto
      )}
    </p>
  );
}

/** Rodapé de alerta (spec G2, decisão 7): o que precisa de ação, com o botão que leva até ela (é navegação: `a`). */
function Alertas({ alertas }: { alertas: AlertaDoMapa[] }) {
  if (alertas.length === 0) return null;
  return (
    <ul>
      {alertas.map((a) => (
        <li key={a.chave} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-200 px-4 py-3 md:px-5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-13 text-volt-950">{a.texto}</p>
          <Link href={a.acao.href} className={BOTAO_DO_ALERTA}>
            {a.acao.rotulo}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2:** checagens (em `apps/web`, depois da Task 3 também aplicada — onda 2 fechada):
  - `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json` → limpos;
  - `npm run lint`, `npm test`, `npm run painel:check` → verdes;
  - `grep -n "text-12\|text-\[11px\]\|bg-acid\|LEGENDA\|textoAbreOutro" src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx` → vazio;
  - `grep -rn "entradaNoCelular\|rotuloNoCelular\|resumo\.pessoas" src --include=*.ts --include=*.tsx` → vazio;
  - `wc -l src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx src/components/painel/home/ao-vivo/celula-do-grupo.tsx src/lib/painel/ao-vivo/mapa.ts` → todos bem abaixo de 800 (~280, ~130, ~320).
- [ ] **Step 3 (controller):** `git -C <worktree> add apps/web/src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx`; `diff --cached --stat` (só ele); commit `feat(painel): G2 map: state-colored filters, today's total in the header, campaigns side by side, alert footer`.

### Task 5: gate local, revisão, PR, CI, merge, produção

**Files:** nenhum (correções da revisão voltam à task dona do arquivo)
**Depends-on:** Task 1, Task 2, Task 3, Task 4

- [ ] **Step 1 (visual local):** subir o app **deste worktree** com a skill `run-hubflow-web` (não `preview_start`: ele serve o checkout principal) e olhar `/painel` logado com Playwright em 1440, 1100 e 390:
  - 1440: cabeçalho "N grupos · N pessoas · +N hoje" com o **mesmo N** do "Entraram hoje" da faixa, e "Todos os grupos" à direita; a linha de filtros com os selos (LOTOU Acid, QUASE âmbar, ATIVO cinza, SEM CONVITE com fio vermelho, SUMIU só se houver) e a contagem; a campanha maior na linha toda; as de até 12 grupos lado a lado (6 + 3), com as células começando na mesma altura; célula de 40 px com "40" à esquerda e "+64" à direita em 13 px, sem "%"; a de LOTOU toda Acid, sem faixa branca; dica de 13 px com a % no hover e no Tab, Esc fecha; sem legenda; alertas no fim com o botão "Configurar convite(s)" / "Configurar campanha";
  - 1100: o mapa na largura toda (empilhado); células largas de 40 px; nada rola de lado;
  - 390: filtros rolam de lado; cada campanha na largura toda em dez colunas; célula de 36 px com o número em cima e o "+N" embaixo; "**novo HH:MM** · o link já leva pro #N" quando houver; "Ver os N grupos" e, por último, os alertas;
  - teclado: Tab pelos filtros, Enter/Espaço alterna `aria-pressed`; "Lotou" com zero mostra `Nenhum grupo em "Lotou".`
- [ ] **Step 2 (revisão):** revisor (agente Code Reviewer) sobre `git diff origin/main...HEAD` inteiro; corrigir CRITICAL/HIGH antes do push.
- [ ] **Step 3:** `git -C <worktree> fetch origin main`; `git -C <worktree> log HEAD..origin/main --oneline` vazio (senão `git -C <worktree> merge origin/main` e repetir a Task 4, Step 2); rodar `infra/scripts/verify-local.ps1` (o gate real do CI: secrets + build).
- [ ] **Step 4:** `git -C <worktree> push -u origin HEAD:feat/painel-g2-mapa`; `gh pr create --base main --title "feat(painel): G2 PR 4 — mapa dos grupos"` com corpo: resumo (decisão 7; LOTOU sólido pela decisão 11; célula de 40 px em 13 px; maior primeiro e lado a lado 6 + 3 por tamanho; legenda trocada pelos filtros; alertas no rodapé), as divergências 1, 3, 6, 7, 9, 10 e 11 deste plano, plano de teste (unit, os dois tsc, lint, painel:check, e2e no CI, visual nas três larguras) e o rodapé `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 5:** `gh pr checks <N> --watch` até verde. CI vermelho por corrida no banco dev (`processing`) → `gh pr update-branch <N>` (re-run reusa o SHA). `main` não tem proteção: **sem auto-merge**; no verde, `gh pr merge <N> --squash --delete-branch`. Se o classificador bloquear push ou merge, entregar ao Igor os dois comandos prontos (`gh pr checks <N>` e `gh pr merge <N> --squash --delete-branch`).
- [ ] **Step 6 (produção):** conferir em `/admin/configuracoes` (Deploy) que o commit do merge está no ar; logado na loja do Igor (hoje "Todos 110 · Lotou 1 · Quase 0 · Ativo 109"), as mesmas três larguras do Step 1, mais: o "+N hoje" do mapa igual ao "Entraram hoje" da faixa; a célula LOTOU inteira em Acid; clicar "Lotou" e ver só ela; nenhum texto de 12/11 px fora dos selos (DevTools, Computed). Não clicar em nada que grave (o botão do alerta só leva a Grupos; abrir e voltar basta).
- [ ] **Step 7:** o card `painel-g2-barra-volt` segue `em_construcao` (o PR 6 da série verifica tudo). Sugerir ao Igor, em PowerShell: `rag insert "decisão: mapa G2 da Início — campanha maior primeiro; bloco de até 6 grupos em 3 colunas, até 12 em 6, acima a linha toda, lado a lado com uma coluna vazia; célula de 40 px em 13 px sem %; LOTOU Acid sólido; filtros com selo na cor do estado no lugar da legenda; alertas no rodapé" --source decisao-2026-10-05`. Encerrar com "PRs que deixei abertos: …" (ou "nenhum").

## Riscos

- **Células largas entre 1024 e 1279 px.** Com o mapa empilhado na largura toda, a célula chega a ~113 × 40 px. Lê bem (o preenchimento é a altura), mas fica achatada. Se o Igor achar feio, é uma classe: `md:max-w-[720px]` na grade dos blocos.
- **Next-fit deixa buraco.** Campanhas de 40, 12, 12 e 6 grupos dão linha 2 com um bloco de 6 sozinho (4 colunas vazias). Aceito por ordem de leitura previsível (maior → menor); first-fit é a troca, se incomodar.
- **A ordem muda.** O mapa passa a ordenar as campanhas pelo tamanho; a tela Campanhas continua na ordem da lista. É o que a spec pede ("depois da campanha maior").
- **Aperto a 1400 px.** "142" + "+99" ocupam ~51 dos 53 px úteis da célula mais estreita. Grupo acima de #999 com mais de 99 entradas no dia transbordaria; o `overflow-hidden` corta e o `aria-label`/dica têm o número inteiro.
- **Dois "sem convite".** O selo do mapa é fio vermelho (spec); o da página da campanha é `pn-chip--risco` (âmbar com texto vermelho). Unificar é um PR à parte.
- **Subgrid.** `grid-template-rows: subgrid` é Baseline 2023 (Chrome 117, Safari 16, Firefox 71). Num navegador mais velho a declaração cai, o bloco segue posicionado pelo `grid-area` e só perde o alinhamento das células entre vizinhos.
- **e2e depende do tenant de QA.** O lado a lado não tem e2e (depende de quantas campanhas o QA tem): a regra está no unit (`lugaresDosBlocos`) e no visual do Step 1. O filtro "Lotou" cobre os dois caminhos (com e sem lotado).
