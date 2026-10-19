# Link da bio — PR 3b: modelos Vitrine, Romaneio e Clássico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `renderPaginaBio` passa a desenhar os modelos Vitrine, Romaneio e Clássico com o CSS e a marcação do mockup — até aqui os três caíam no Etiqueta —, cada um com as suas fontes servidas de `public/fonts/bio/`. Dois PRs: Parte 1 (Vitrine e Romaneio) e Parte 2 (Clássico).

**Architecture:** Cada modelo é um módulo puro em `lib/bio/render/` que exporta um `ModeloRender` (o contrato do `modelo.ts` do 3a): a lista de fontes, o CSS fixo (`CSS_VITRINE`, `CSS_ROMANEIO`, `CSS_CLASSICO`; cor de paleta só por `var(--…)`), a cor do topo, o fundo que escolhe a logo e o `corpo`, montado com as peças comuns do `partes.ts` (imagem, destino, endereço, confere, selo, `atrasos`). O `index.ts` só troca as entradas de `MODELOS_RENDER`. Uma peça comum nova, `cnpjDaLoja`, guarda a regra do CNPJ do rodapé (o Etiqueta passa a usá-la). Os testes de contraste conferem cada par que o CSS desenha contra o `coresDoModelo` do PR 2; as contas ficam num ajudante só de teste, `src/test/bio-contraste.ts`. Nenhuma rota, nenhuma DDL.

**Tech Stack:** TypeScript strict, HTML/CSS puros, `node:test` + `node:assert/strict` via tsx, Playwright só na conferência visual (script fora do repo).

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` — §3 (tabela dos modelos, fontes, contraste, anel `--foco`/`--foco-fora`, animação), §4 (linha `confere`), §9 (marcação que o JS lê), §11 (página) e a linha 3b do §12. Visual: `C:\Users\Igor\Desktop\girumo-design-refs\link-da-bio\project\Main.dc.html` (CSS e marcação `.vt-*`, `.rm-*`, `.cl-*`), `paletas.json` e os prints `...\link-da-bio\shots\Vitrine-*.png`, `Romaneio-*.png` e `Classico-*.png`. Ficam fora do repo: têm foto e CNPJ da loja-piloto.

**Depende de:** PR 3a em `main` (e, por ele, o PR 2). O que este plano usa do 3a está na seção "Interface com os outros PRs" do plano dele (`docs/superpowers/plans/2026-10-19-link-da-bio-pr3a-render-etiqueta.md`). Índice: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`. Depende deste: o PR 6b (precisa da Parte 2 em `main`).

**Já rodado:** o código deste plano passou antes de virar plano, num diretório fora do repo montado com o código dos planos do 3a e do PR 2 (o `cores.ts` é o do plano do PR 2, função por função): Parte 1 com 106 testes (58 do 3a + 48 novos), `tsc` strict, o ESLint do repo e a conferência da Task 4 ("TUDO OK" nas 4 paletas do Vitrine, do Romaneio e do Etiqueta); Parte 2 com 125 testes e "TUDO OK" nas 4 do Clássico. Os passos "vermelhos" também rodaram: a falha esperada é a que está escrita em cada um. O que pode mudar com o PR 2 e o 3a de verdade: os testes de contraste e alguns bytes do HTML (ver "Riscos").

## Arquivos

### Parte 1 — Vitrine e Romaneio (10 de código + 10 de fonte)

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/bio/render/partes.ts` (+ `partes.test.ts`) | 1 | peça comum nova `cnpjDaLoja` |
| `apps/web/src/lib/bio/render/etiqueta.ts` | 1 | o rodapé passa a usar `cnpjDaLoja` |
| `apps/web/src/test/bio-contraste.ts` | 2 | contas dos testes de contraste e leitura do CSS (só teste) |
| `apps/web/src/lib/bio/render/vitrine.ts` (+ `vitrine.test.ts`) | 2 | CSS e corpo do Vitrine |
| `apps/web/src/lib/bio/render/modelos.test.ts` | 2, 3 | o que vale para todo modelo (estrutura, escape, `style=`, prévia, 40 KB) |
| `apps/web/src/lib/bio/render/romaneio.ts` (+ `romaneio.test.ts`) | 3 | CSS e corpo do Romaneio |
| `apps/web/src/lib/bio/render/index.ts` | 2, 3 | entradas `vitrine` e `romaneio` do mapa |
| `apps/web/public/fonts/bio/jost/` — `jost-latin.woff2`, `OFL.txt` | 2 | Jost variável 100–900 |
| `apps/web/public/fonts/bio/bodoni-moda/` — `bodoni-moda-latin-600.woff2`, `bodoni-moda-latin-500-italic.woff2`, `OFL.txt` | 2 | Bodoni Moda 600 e 500 itálico |
| `apps/web/public/fonts/bio/ibm-plex-mono/` — `ibm-plex-mono-latin-{400,500,600,700}.woff2`, `OFL.txt` | 3 | IBM Plex Mono |

### Parte 2 — Clássico (4 de código + 2 de fonte)

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/bio/render/classico.ts` (+ `classico.test.ts`) | 7 | CSS e corpo do Clássico |
| `apps/web/src/lib/bio/render/modelos.test.ts` | 7 | passa a cobrir os 4 (`MODELOS`) |
| `apps/web/src/lib/bio/render/index.ts` | 7 | entrada `classico` do mapa |
| `apps/web/public/fonts/bio/manrope/` — `manrope-latin.woff2`, `OFL.txt` | 7 | Manrope variável 200–800 |

Por que duas partes: a Parte 1 sozinha já tem 10 arquivos de código (índice: "Plano que passa de ~10 arquivos vem dividido"). A Parte 2 sai de `origin/main` depois da Parte 1 mergeada; entre as duas, o Clássico continua no Etiqueta como estava.

## Decisões deste plano

O mockup é a fonte dos valores; as linhas abaixo são onde o código se afasta dele (ou decide o que a spec não diz).

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| **Vitrine: topo com `min-height:520px` (só com foto) e a marca no fluxo** (`margin-top:auto`), com o escuro atrás do texto num `::before` (`rgb(0 0 0 / 0)` → `.62` em 56 px). Mockup: `height:520px`, marca `position:absolute` e um `::after` de `.32`→`.7` por cima da foto inteira | spec §11 (zoom de 200% não corta) e §3 (véu ≥ 60% sob texto em foto) | O alto da foto fica mais claro que no mockup |
| **Vitrine sem foto: o topo é o fundo `#151412` com a altura do texto** | nada de caixa vazia de 520 px | Topo baixo para quem não pôs foto |
| **Vitrine: "onde fica" com véu `rgb(0 0 0 / .62)`** (mockup `.42`) | a regra do 3a (véu fixo ≥ 60%) | Faixa mais escura |
| **Vitrine: coluna de no máximo 520 px** (`.vt-capa` e `.vt-folha`) | o mockup só tem celular; no computador a foto esticaria até a borda | — |
| **Vitrine: o toque na linha comum só mexe a seta** (mockup: também um tom `color-mix(--on 6%)` atrás) | com cores da marca o tom derrubava o texto para 4,09:1 | Toque menos visível na linha comum (o principal tem o brilho) |
| **Vitrine: o brilho da entrada no `::after` do principal, o do toque no `::before`** | trocar o nome da animação no mesmo pseudo-elemento faz a entrada tocar de novo quando a classe `lk-toque` sai (medido) | — |
| **Vitrine: fotos do catálogo com uma largura só (384)** | cada foto tem ~110 px no celular (384 sobra até 3×) e o pior caso de 40 KB não tinha folga para `srcset` | Foto um pouco mole em tela 3× na coluna de 520 px |
| **Vitrine: `h1` = nome (a logo clara dentro), a frase em `<p>`** (mockup: a frase era o `h1`) | spec §11 | — |
| **Romaneio: a serrilha (`mask`) no `::before` do papel; o "imprime" com `backwards`** | nada focável fica recortado e, impresso o papel, não sobra `clip-path` nele | — |
| **Romaneio: `<ul>`** (mockup `<ol>`) e os números "01" fora da árvore | spec §11 ("`<ul>` de `<a>`", "01" com `aria-hidden`); o principal (carimbo) não tem número | Leitor de tela não diz "1 de 5" |
| **Romaneio: tem `h1`** — a logo escura no papel, ou o nome em caixa alta (mockup: só a logo) | spec §11 | — |
| **Romaneio: confere próprio, com travessão e "Pix só no nome …"** (texto do mockup do Romaneio; spec §4 e os outros modelos: "O Pix cai só no nome …") | tom de nota; `data-copiar` e "Copiar CNPJ" iguais aos do `blocoConfere` | Trocar o texto é uma linha |
| **Romaneio: "Feito com Girumo" fora da nota com `--fundo2` atrás** (mockup: transparente sobre o degradê) | `--on2` sobre `--fundo3` dá 3,63:1 no kraft; `on2`/`fundo2` é par garantido do PR 2 | O selo vira pílula com fundo |
| **Romaneio: anel `--foco` na nota e `--foco-fora` fora dela** (`.rm-fora :focus-visible`) | spec §3 e decisão 1 do PR 2 | — |
| **Romaneio: o carimbo da entrada no `<li>`, o do toque no `<a>`** | a mesma razão do brilho do Vitrine | — |
| **Clássico: o pulso é uma cópia da pílula num `::after` atrás dela, que cresce (`scale(1.09,1.5)`) e some, 2 voltas** (mockup: `box-shadow` com `color-mix`, 3 voltas) | spec §3: só `transform`/`opacity`, no máximo 2 voltas; a escala imita o anel de 16 px do mockup | — |
| **Clássico: zoom `scale(2.2)` no CSS; a origem vem da classe de foco do 3a** (`lk-f-X-Y` dá `object-position` e `transform-origin`); sem foco, cresce em volta do centro (mockup: 2,3× fixo em 54% 44%) | spec §3 (2,2× em volta do foco), sem regra por página | — |
| **Clássico: `h1` = nome em texto; a logo não entra** (como no mockup) | o círculo já é a foto | Quem só tem logo não a vê no Clássico (o 6b pode avisar) |
| **Clássico: seta e subtítulo do principal em `--printinta`, sem `opacity`** (mockup: `--seta` e `opacity:.85`) | só par garantido; nada de opacity em texto | — |
| **Vitrine e Clássico: anel dentro do papel (confere, "Como chegar") em `var(--tinta)`** | o `--foco` é do fundo da página (PR 2, decisão 1) | — |
| **"Copiar CNPJ" com 44 px nos três** (mockup 34–36) | spec §11 | Botão mais alto |
| **Peça comum nova `cnpjDaLoja(doc)` em `partes.ts`; o Etiqueta passa a usá-la** | a regra (confere ligado + CNPJ válido) aparece no rodapé dos 4 e no confere do Romaneio; acrescentar, nunca renomear | — |
| **`atrasos(".vt-lista>li", …)` sem `.lk-entra` na frente** (o Etiqueta passa `.lk-entra .et-fio>li`) | 190 B a menos por página; atraso sem animação não faz nada; mesma especificidade da regra da entrada, e vem depois dela | — |
| **`:hover` só com `(hover:hover)`** | no celular o `:hover` gruda depois do toque | — |
| **Ajudante de teste `src/test/bio-contraste.ts`** | os 3 testes de modelo fazem as mesmas contas (razão, véu, cor sorteada, leitura do CSS) | — |
| **Fontes = os arquivos que o Google Fonts manda a um Chrome de macOS**, por URL fixa do `fonts.gstatic.com` + SHA-256 | é o método dos `src/fonts/` (a Manrope e a Plex 400/500 de lá são esses mesmos bytes); a versão que vai para Windows é outra, com hinting | — |
| **Bodoni Moda estática (600 e 500 itálico), não a variável** | o CSS só usa esses dois cortes: 32 KB contra 56 KB das duas variáveis | Peso novo no futuro = arquivo novo |

## Global Constraints

- Renderizador puro: nada de `server-only`, Supabase, React ou `node:` em `lib/bio/render/*.ts` (spec §9); roda no navegador na prévia do 6a.
- Texto do lojista só por `escapeHtml` (`lib/campaigns/entry-page.ts`), sempre entre aspas duplas; nenhum texto do lojista em `<script>` (spec §10).
- Nenhum atributo `style=` (spec §3); cor de paleta só por `var(--…)` no CSS do modelo; hex escrito só onde a tabela de decisões diz (fundo do topo `#151412`, verde do WhatsApp `#25D366`, branco, a máscara `#000`/`#0000`).
- Peças comuns do 3a: reusar, nunca duplicar nem renomear; peça nova só acrescentada (`cnpjDaLoja`). Os nomes do §9 são contrato.
- A página funciona sob a CSP da superfície "bio" (spec §6): `default-src 'none'; script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- Imagem pelo otimizador (spec §4): `srcset` 384/640/828 na foto do topo e na fachada; miniatura com `LARGURA_MINIATURA` (128); `fetchpriority="high"` só na foto do topo; `loading="lazy"` no resto.
- Fontes em `public/fonts/bio/<família>/`, cada família com o `OFL.txt`; o modelo carrega só as suas, com `preload` (spec §3, §11): Vitrine Jost + Bodoni Moda; Romaneio IBM Plex Mono 400–700; Clássico Manrope.
- Animação só CSS (`transform`/`opacity`/`clip-path`), toda dentro de `@media (prefers-reduced-motion:no-preference)`; entrada só sob `.lk-entra`; o toque pela classe `lk-toque` (continua com `animar = false`); o pulso do Clássico dá no máximo 2 voltas (spec §3).
- Contraste (spec §3): texto ≥ 4,5:1, ícone e seta ≥ 3:1, anel de foco ≥ 3:1 contra o fundo onde aparece; nada de `opacity` em texto; véu ≥ 60% sob texto em cima de foto.
- HTML ≤ 40 KB sem compressão (página cheia de 20 links); JS inline ≤ 3 KB; alvo de toque ≥ 44 px; reflow em 320 px sem rolagem lateral; Vitrine com `min-height` no topo e o texto no fluxo (spec §11).
- `h1` = nome da loja em todo modelo, o Romaneio também (com logo, a logo é `img` dentro do `h1`, `alt` = nome); frase em `<p>`; "Item/Abrir", "01" e o código de barras com `aria-hidden`; decoração com `aria-hidden`; o único `role="status"` é o do 3a (spec §11).
- Marcação que o JS lê (spec §9), igual à do 3a: `data-link`/`data-tipo` em todo botão (e no `<summary>` do endereço); `<button type="button" data-copiar>` com "Copiar CNPJ"; `#lk-status`.
- Repositório público: só a loja fictícia de `src/test/bio-dados-falsos.ts` nos testes e nos prints.
- Testes: um arquivo, em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Commits em inglês com prefixo semântico. Nenhuma DDL, nenhuma rota.

## Review Focus

- **Vitrine ou Clássico sem foto** (página recém-criada, lojista que tirou a foto): nada de caixa vazia de 520 px, círculo vazio nem `fetchpriority` sobrando. Testes: "sem foto o topo não tem min-height…" (Task 2) e "foto redonda…" com `capa: null` (Task 7).
- **Texto grande / zoom de 200% no topo do Vitrine**: o topo cresce com o texto em vez de cortar. Teste: "topo com min-height e o texto no fluxo…" (Task 2) + o print em 195 px da conferência (Task 4).
- **"Cores da sua marca" com qualquer par de hex**: todo par que o CSS de cada modelo desenha passa (texto 4,5, ícone/seta/anel 3). Teste: "cores da marca: 500 pares sorteados…" (Tasks 2, 3 e 7).
- **Romaneio com o confere e o selo desligados**: nenhum CNPJ perdido no fim da nota e nenhum rodapé vazio fora dela. Teste: "confere com travessão e Copiar CNPJ…" (Task 3).
- **Toque repetido no principal**: o brilho/carimbo do toque não faz a entrada tocar de novo quando a classe `lk-toque` sai. Testes: "o brilho do toque não é o da entrada" (Task 2), "o carimbo da entrada (no <li>) não briga com o do toque (no <a>)" (Task 3) e o "movimento" da conferência (Tasks 4 e 8).

---

## Parte 1 — Vitrine e Romaneio

Branch `feat/link-da-bio-pr3b-vitrine-romaneio`, worktree `.claude/worktrees/link-da-bio-pr3b-1`.

### Task 0: Branch e pré-condições

**Files:** nenhum.

- [ ] **Step 1: O 3a está em `main`?** Na raiz do checkout principal (`C:\Users\Igor\Desktop\HubFlow-platform`):

```bash
git fetch origin main
git log origin/main --oneline -3 -- apps/web/src/lib/bio/render/index.ts apps/web/src/lib/bio/render/etiqueta.ts
```

Expected: o commit do PR 3a na lista. Vazio → parar: este PR depende dele.

- [ ] **Step 2: Worktree novo a partir de `origin/main`** (CLAUDE.md, "Regra de PR"; nunca `checkout -b` no checkout principal):

```bash
git worktree add -b feat/link-da-bio-pr3b-vitrine-romaneio .claude/worktrees/link-da-bio-pr3b-1 origin/main
cd .claude/worktrees/link-da-bio-pr3b-1
npm ci
```

Daqui em diante todo comando roda em `apps/web` deste worktree.

- [ ] **Step 3: Conferir o que o 3a deixou** (o plano usa estes nomes):

```bash
grep -nE "^export (function|const) (LARGURA_MINIATURA|CSS_BASE|atrasos|blocoConfere|conteudoDoH1|dadosDoLink|destaqueHtml|detalhesDoEndereco|feitoComGirumo|formatarCnpj|hrefAttr|icone|imagem|tokensValidos)\b|^export const CNPJ" src/lib/bio/render/partes.ts
grep -nE "^export type (ModeloRender|ContextoRender|FonteDoModelo|LinkVisivel)\b" src/lib/bio/render/modelo.ts
grep -nE "^export (function (dadosFalsos|dadosCheios|documentoFalso)|const IDS)\b" src/test/bio-dados-falsos.ts
grep -n "vitrine: etiqueta\|romaneio: etiqueta\|classico: etiqueta" src/lib/bio/render/index.ts
grep -n "^function rodape" -A6 src/lib/bio/render/etiqueta.ts
```

Expected: 15 linhas no `partes.ts` (14 exports e o `export const CNPJ`, que o 3a já entrega alfanumérico), 4 no `modelo.ts`, 4 no `bio-dados-falsos.ts`, as 3 entradas do mapa ainda no Etiqueta e o `rodape` do Etiqueta com a conta do CNPJ escrita à mão (`CNPJ.test` e `formatarCnpj`). Faltando algo → parar e reportar. A `const CNPJ` pode ter outra regex (o PR 2 aceita CNPJ alfanumérico): tanto faz, `cnpjDaLoja` usa a constante.

- [ ] **Step 4: Quadro ao começar** (prod `nidoatbxaylrkcgbszns`; rodar com `npx supabase --workdir <pasta vazia> db query --linked -f arquivo.sql` depois de `npx supabase --workdir <pasta vazia> link --project-ref nidoatbxaylrkcgbszns --yes`; se o classificador recusar, pedir ao Igor). Ler o `blocker` e reescrevê-lo com o que está em construção, mantendo a lista do que falta:

```sql
select blocker from public.board_features where key = 'link-da-bio';
-- exemplo, com o 6a já em main:
update public.board_features
   set blocker = 'PR 3b parte 1 (modelos Vitrine e Romaneio) em construção. Falta: Clássico (3b parte 2), Aparência/Perfil/Divulgar e o item no menu (6b), rastreio (7).',
       updated_at = now()
 where key = 'link-da-bio';
```

---

### Task 1: Peça comum `cnpjDaLoja` (e o Etiqueta passa a usá-la)

**Files:**
- Modify: `apps/web/src/lib/bio/render/partes.ts` (fim do arquivo)
- Modify: `apps/web/src/lib/bio/render/etiqueta.ts` (função `rodape` e o import de `./partes`)
- Test: `apps/web/src/lib/bio/render/partes.test.ts` (import e um teste no fim)

**Interfaces:**
- Consumes: a `const CNPJ` (privada) e `formatarCnpj(digitos: string): string` do `partes.ts` (3a); `DocumentoBio` (PR 2), já importado no `partes.ts`; `documentoFalso()` (`src/test/bio-dados-falsos.ts`, 3a).
- Produces: `cnpjDaLoja(doc: DocumentoBio): string` — o CNPJ formatado quando o "confere" está ligado e o CNPJ passa na `CNPJ`; senão `""`. Usada pelo rodapé dos 4 modelos e pelo confere do Romaneio (Tasks 2, 3 e 7).

- [ ] **Step 1: Write the failing test** — em `partes.test.ts`, acrescentar `cnpjDaLoja,` no import de `./partes`, logo depois de `classeDoFoco,`, e no fim do arquivo:

```ts
test("cnpjDaLoja: formatado só com o confere ligado e 14 dígitos", () => {
  const doc = documentoFalso();
  assert.equal(cnpjDaLoja(doc), "11.222.333/0001-81");
  assert.equal(cnpjDaLoja({ ...doc, confere: { ...doc.confere, ativo: false } }), "");
  assert.equal(cnpjDaLoja({ ...doc, confere: { ...doc.confere, cnpj: "" } }), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/partes.test.ts`
Expected: FAIL — `TypeError: (0 , import_partes.cnpjDaLoja) is not a function` (`ℹ pass 19`, `ℹ fail 1`).

- [ ] **Step 3: Implement** — no fim de `partes.ts`, depois do `CSS_BASE`:

```ts
/** CNPJ do rodapé (e do confere do Romaneio): formatado com o "confere" ligado e o CNPJ válido pela `CNPJ`; senão "". */
export function cnpjDaLoja(doc: DocumentoBio): string {
  return doc.confere.ativo && CNPJ.test(doc.confere.cnpj) ? formatarCnpj(doc.confere.cnpj) : "";
}
```

- [ ] **Step 4: O Etiqueta usa a peça nova** — em `etiqueta.ts`, na função `rodape`, trocar

```ts
  const cnpj =
    doc.confere.ativo && CNPJ.test(doc.confere.cnpj)
      ? `<small>${escapeHtml(doc.perfil.nome)} · CNPJ ${formatarCnpj(doc.confere.cnpj)}</small>`
      : "";
```

por

```ts
  const numero = cnpjDaLoja(doc);
  const cnpj = numero ? `<small>${escapeHtml(doc.perfil.nome)} · CNPJ ${numero}</small>` : "";
```

e, no import de `./partes`, acrescentar `cnpjDaLoja,` logo depois de `blocoConfere,` e tirar `CNPJ,` e `formatarCnpj,` (o Etiqueta não os usa mais; o ESLint acusaria import sobrando).

- [ ] **Step 5: Run tests to verify they pass** (o rodapé do Etiqueta continua coberto pelos testes do 3a):

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/partes.test.ts src/lib/bio/render/etiqueta.test.ts src/lib/bio/render/index.test.ts`
Expected: `ℹ pass 53`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bio/render/partes.ts src/lib/bio/render/partes.test.ts src/lib/bio/render/etiqueta.ts
git commit -m "refactor(bio): shared cnpjDaLoja for the footer CNPJ of every model"
```

---

### Task 2: Modelo Vitrine (fontes Jost e Bodoni Moda)

**Files:**
- Create: `apps/web/public/fonts/bio/jost/jost-latin.woff2`, `apps/web/public/fonts/bio/jost/OFL.txt`
- Create: `apps/web/public/fonts/bio/bodoni-moda/bodoni-moda-latin-600.woff2`, `apps/web/public/fonts/bio/bodoni-moda/bodoni-moda-latin-500-italic.woff2`, `apps/web/public/fonts/bio/bodoni-moda/OFL.txt`
- Create: `apps/web/src/test/bio-contraste.ts`
- Create: `apps/web/src/lib/bio/render/vitrine.ts`
- Modify: `apps/web/src/lib/bio/render/index.ts` (import e a entrada `vitrine` do mapa)
- Test: `apps/web/src/lib/bio/render/vitrine.test.ts`, `apps/web/src/lib/bio/render/modelos.test.ts`

**Interfaces:**
- Consumes: do 3a — `ModeloRender`, `ContextoRender`, `FonteDoModelo`, `LinkVisivel` (`modelo.ts`); `atrasos`, `blocoConfere`, `conteudoDoH1`, `dadosDoLink`, `destaqueHtml`, `detalhesDoEndereco`, `feitoComGirumo`, `hrefAttr`, `icone`, `imagem`, `CSS_BASE`, `tokensValidos` (`partes.ts`); `renderPaginaBio` (`index.ts`); `IDS`, `dadosFalsos`, `dadosCheios` (`src/test/bio-dados-falsos.ts`). Da Task 1: `cnpjDaLoja`. Do PR 2: `coresDoModelo`, `TokensBio`, `MODELOS`, `PALETAS`, `documentoPadrao`, `DadosRender`, `DocumentoBio`, `Modelo`. Do repo: `escapeHtml`, `contrastRatio`, `parseHex`.
- Produces: `CSS_VITRINE: string` e `vitrine: ModeloRender` (`vitrine.ts`); o ajudante só de teste `src/test/bio-contraste.ts` — `razao(a: string, b: string): number`, `mistura(cor: string, alvo: string, t: number): string`, `type Par = readonly [frente: string, fundo: string, minimo: number, onde: string]`, `falhas(pares: readonly Par[]): string[]`, `sorteio(semente: number): () => string`, `regras(css: string): [string, string][]`, `keyframes(css: string): Record<string, string>`, `variaveisLidas(css: string): string[]`, `hexLiterais(css: string): string[]`; e o `modelos.test.ts` com a lista `MODELOS_PRONTOS`, que a Task 3 e a Parte 2 aumentam.

- [ ] **Step 1: As fontes** (Git Bash, em `apps/web`). Os woff2 são os que o Google Fonts manda a um Chrome de macOS (CSS2 da família → bloco `/* latin */`) — o método do README dos `src/fonts/` (a Manrope e a Plex 400/500 de lá são esses mesmos bytes; a versão que vai para Windows é outra, com hinting). Bodoni Moda estática nos dois cortes que o CSS usa; Jost variável. O `OFL.txt` vem do commit fixo do `google/fonts` que o 3a usou:

```bash
mkdir -p public/fonts/bio/jost public/fonts/bio/bodoni-moda
G=https://fonts.gstatic.com/s
curl -fsSL -o public/fonts/bio/jost/jost-latin.woff2 "$G/jost/v20/92zatBhPNqw73oTd4jQmfxI.woff2"
curl -fsSL -o public/fonts/bio/bodoni-moda/bodoni-moda-latin-600.woff2 "$G/bodonimoda/v28/aFT67PxzY382XsXX63LUYL6GYFcan6NJrKp-VPjfJMShrpsGFUt8oZDd8Id4tHrJcwDioQ.woff2"
curl -fsSL -o public/fonts/bio/bodoni-moda/bodoni-moda-latin-500-italic.woff2 "$G/bodonimoda/v28/aFT07PxzY382XsXX63LUYJSPUqb0pL6OQqxrZLnVbvZedvJtj-V7tIaZGsNItnDIUQT6oPgY.woff2"
OFL=https://raw.githubusercontent.com/google/fonts/beda156f5a2abc96ec52442f60bb1ab4d122e38d/ofl
curl -fsSL -o public/fonts/bio/jost/OFL.txt "$OFL/jost/OFL.txt"
curl -fsSL -o public/fonts/bio/bodoni-moda/OFL.txt "$OFL/bodonimoda/OFL.txt"
sha256sum public/fonts/bio/jost/jost-latin.woff2 public/fonts/bio/jost/OFL.txt public/fonts/bio/bodoni-moda/bodoni-moda-latin-600.woff2 public/fonts/bio/bodoni-moda/bodoni-moda-latin-500-italic.woff2 public/fonts/bio/bodoni-moda/OFL.txt
```

Expected:
```
235d8f8964bfdf105fc0c3e4c77b5e70f31bee1dad611d59318b5f2a5cb64d90 *public/fonts/bio/jost/jost-latin.woff2
1af3438a4d5f0ed2bdbc5751a5a67ebf6d537334161184b7fbb68503ef0ea0c5 *public/fonts/bio/jost/OFL.txt
228ff429b62ce79712ffc54e67110b6c43d5efb336ae6030b8711c60ee73ec6c *public/fonts/bio/bodoni-moda/bodoni-moda-latin-600.woff2
36f73bf92e84f95262cf093dc4048f13228b5b14ebcb80396e99eec945838699 *public/fonts/bio/bodoni-moda/bodoni-moda-latin-500-italic.woff2
1d084d2a6ecdadb969f9dbff4c834a8625e4c4625acd5c64f5e95809e4a3e0c2 *public/fonts/bio/bodoni-moda/OFL.txt
```

(26 588, 14 960 e 17 072 bytes; o `OFL.txt` da Jost começa com `Copyright 2020 The Jost Project Authors` e o da Bodoni com `Copyright 2020 The Bodoni Moda Project Authors`.) Hash diferente → parar: arquivo errado, ou o Google trocou a versão — aí refazer pelo CSS2 com User-Agent de Chrome de macOS (`fonts.googleapis.com/css2?family=Jost:wght@100..900` e `?family=Bodoni+Moda:ital,wght@0,600;1,500`), pegar o bloco `/* latin */`, conferir o print da Task 4 e trocar os hashes deste plano no corpo do PR.

- [ ] **Step 2: O ajudante dos testes** — criar `apps/web/src/test/bio-contraste.ts`:

```ts
/**
 * Contas dos testes dos modelos do link da bio (Vitrine, Romaneio, Clássico):
 * contraste entre tokens, cor sorteada e leitura do CSS. Só teste — nada daqui
 * vai para a página.
 */
import { contrastRatio, parseHex } from "@/lib/pages/palette";

/** Razão de contraste entre dois `#RRGGBB`; cor inválida (token que faltou) é erro. */
export function razao(a: string, b: string): number {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) throw new Error(`cor inválida: ${a} / ${b}`);
  return contrastRatio(x, y);
}

/** `cor` misturada `t` (0..1) rumo a `alvo`: o que se vê sob um véu `rgb(alvo / t)`. */
export function mistura(cor: string, alvo: string, t: number): string {
  const x = parseHex(cor);
  const y = parseHex(alvo);
  if (!x || !y) throw new Error(`cor inválida: ${cor} / ${alvo}`);
  const canal = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  return `#${canal(x.r, y.r)}${canal(x.g, y.g)}${canal(x.b, y.b)}`.toUpperCase();
}

/** `[frente, fundo, mínimo, onde]`: um par que o CSS desenha. */
export type Par = readonly [frente: string, fundo: string, minimo: number, onde: string];

/** Os pares abaixo do mínimo, com a razão medida (lista vazia = tudo passa). */
export function falhas(pares: readonly Par[]): string[] {
  return pares.flatMap(([a, b, min, onde]) => {
    const r = razao(a, b);
    return r >= min ? [] : [`${onde}: ${a} sobre ${b} = ${r.toFixed(2)} < ${min}`];
  });
}

/** mulberry32: as mesmas cores em toda rodada (a falha se repete em qualquer máquina). */
export function sorteio(semente: number): () => string {
  let s = semente;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const n = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return `#${Math.floor(n * 0x1000000).toString(16).padStart(6, "0").toUpperCase()}`;
  };
}

const KEYFRAMES = /@keyframes ([\w-]+)\{((?:[^{}]*\{[^{}]*\})*)\}/g;

/** `[seletor, declarações]` das regras fora de @keyframes (as de dentro de @media entram). */
export function regras(css: string): [string, string][] {
  const semKeyframes = css.replace(KEYFRAMES, "");
  return [...semKeyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

/** Corpo de cada @keyframes, pelo nome. */
export function keyframes(css: string): Record<string, string> {
  return Object.fromEntries([...css.matchAll(KEYFRAMES)].map((m) => [m[1], m[2]]));
}

/** As variáveis que o CSS lê (sem o `--`). */
export function variaveisLidas(css: string): string[] {
  return [...new Set(css.match(/var\(--[a-z0-9-]+\)/g) ?? [])].map((v) => v.slice(6, -1));
}

/** Cor escrita direto no CSS (fora de var()). */
export function hexLiterais(css: string): string[] {
  return [...new Set(css.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [])].sort();
}
```

- [ ] **Step 3: Write the failing tests** — criar `apps/web/src/lib/bio/render/vitrine.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { coresDoModelo, type TokensBio } from "@/lib/bio/cores";
import { PALETAS, type DadosRender, type DocumentoBio } from "@/lib/bio/documento";
import { falhas, hexLiterais, keyframes, mistura, razao, regras, sorteio, variaveisLidas, type Par } from "@/test/bio-contraste";
import { IDS, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";
import { CSS_BASE, tokensValidos } from "./partes";
import { CSS_VITRINE } from "./vitrine";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const tokens = (paleta: string, cores: DocumentoBio["cores"] = null) => tokensValidos(coresDoModelo("vitrine", paleta, cores));
const pagina = (perfil: Partial<DocumentoBio["perfil"]> = {}): string => {
  const d: DadosRender = dadosFalsos();
  const documento = { ...d.documento, modelo: "vitrine" as const, paleta: "papel", perfil: { ...d.documento.perfil, ...perfil } };
  return renderPaginaBio({ ...d, documento }, { modo: "publica", nonce: NONCE, animarEntrada: true });
};

/** Todo par de cor que o CSS do Vitrine desenha (o texto na foto tem véu fixo: teste à parte). */
function pares(t: TokensBio): Par[] {
  const c = (nome: string) => t[`--${nome}`];
  return [
    [c("on"), c("fundo2"), 4.5, "título, endereço e Abrir no Google Maps na folha"],
    [c("on2"), c("fundo2"), 4.5, "subtítulo, destaques, horário e rodapé"],
    [c("acento"), c("fundo2"), 4.5, "número do destaque"],
    [c("seta"), c("fundo2"), 3, "seta"],
    [c("ico"), c("icobg"), 3, "ícone do quadrado"],
    [c("printinta"), c("prin"), 4.5, "botão principal"],
    [c("printinta"), mistura(c("prin"), "#FFFFFF", 0.14), 3, "ícone do principal (véu branco de 14%)"],
    [c("tinta"), c("papel"), 4.5, "confere, Copiar CNPJ, anel de foco no confere e o aviso #lk-status"],
    [c("acento"), c("papel"), 4.5, "título e ícones do confere"],
    [c("foco"), c("fundo2"), 3, "anel de foco na folha"],
  ];
}

test("as 4 paletas do Vitrine passam em todo par que o modelo desenha", () => {
  for (const paleta of PALETAS.vitrine) assert.deepEqual(falhas(pares(tokens(paleta))), [], paleta);
});

test("cores da marca: 500 pares sorteados passam em todo par", () => {
  const hex = sorteio(20261019);
  const ruins: string[] = [];
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: hex(), botao: hex() };
    const f = falhas(pares(tokens("marca", cores)));
    if (f.length) ruins.push(`${cores.fundo}/${cores.botao}: ${f.join("; ")}`);
  }
  assert.deepEqual(ruins.slice(0, 5), []);
});

test("toda variável que o CSS lê existe nas 4 paletas e na marca", () => {
  const usadas = variaveisLidas(`${CSS_BASE}${CSS_VITRINE}`);
  assert.ok(usadas.length >= 12);
  for (const paleta of [...PALETAS.vitrine, "marca"]) {
    const t = tokens(paleta, paleta === "marca" ? { fundo: "#3A80BF", botao: "#F28C28" } : null);
    assert.deepEqual(usadas.filter((v) => !(`--${v}` in t)), [], paleta);
  }
});

test("texto em cima da foto: véu fixo de .62, branco com 6:1 em qualquer foto", () => {
  assert.match(CSS_VITRINE, /\.vt-onde\{[^}]*background:rgb\(0 0 0 \/ \.62\)/);
  assert.match(CSS_VITRINE, /\.vt-marca::before\{[^}]*rgb\(0 0 0 \/ \.62\) 56px\)/);
  assert.match(CSS_VITRINE, /\.vt-marca\{[^}]*padding:56px 6px 0/);
  assert.ok(razao("#FFFFFF", mistura("#FFFFFF", "#000000", 0.62)) >= 6);
});

test("topo com min-height e o texto no fluxo: zoom de 200% não corta", () => {
  const capa = regras(CSS_VITRINE).find(([s]) => s === ".vt-capa")?.[1] ?? "";
  assert.doesNotMatch(capa, /(?:^|;)height:/);
  assert.match(CSS_VITRINE, /\.vt-capa--foto\{min-height:520px\}/);
  const absolutos = regras(CSS_VITRINE).filter(([, d]) => /position:absolute/.test(d)).map(([s]) => s);
  assert.deepEqual(absolutos, [".vt-capa>img", ".vt-marca::before", ".vt-prin::before,.vt-prin::after"]);
});

test("nada de opacity em texto: só as entradas fazem fade, e terminam em 1", () => {
  assert.deepEqual(regras(CSS_VITRINE).filter(([, d]) => /opacity/.test(d)), []);
  const comFade = Object.entries(keyframes(CSS_VITRINE)).filter(([, corpo]) => /opacity/.test(corpo));
  assert.deepEqual(comFade.map(([nome]) => nome), ["vt-ergue", "vt-entra"]);
  for (const [, corpo] of comFade) assert.match(corpo, /to\{opacity:1;/);
});

test("cor de paleta só por var(--…): hex literal só no topo escuro e no verde do WhatsApp", () => {
  assert.deepEqual(hexLiterais(CSS_VITRINE), ["#151412", "#25D366", "#fff"]);
});

test("tudo que mexe fica em no-preference; o brilho do toque não é o da entrada", () => {
  const [antes, depois] = CSS_VITRINE.split("@media (prefers-reduced-motion:no-preference){");
  assert.ok(depois);
  assert.doesNotMatch(antes, /animation|transition/);
  assert.match(depois, /\.lk-entra \.vt-prin::after\{animation:vt-brilho 1\.3s 1\.25s/);
  assert.match(depois, /\.vt-prin\.lk-toque::before\{animation:vt-brilho \.9s/);
  assert.match(depois, /\.vt-lista>li:nth-child\(2\)\{animation-delay:410ms\}/);
});

test("alvo de toque ≥ 44 px", () => {
  assert.match(CSS_VITRINE, /\.vt-prin\{[^}]*min-height:66px/);
  assert.match(CSS_VITRINE, /\.vt-linha\{[^}]*min-height:82px/);
  assert.match(CSS_VITRINE, /\.vt-mapa\{[^}]*min-height:50px/);
  assert.match(CSS_VITRINE, /\.vt-copiar\{[^}]*min-height:44px/);
});

test("duas famílias, três arquivos: Jost variável e Bodoni Moda 600 e 500 itálico, com preload", () => {
  const html = pagina();
  assert.equal(html.match(/rel="preload"/g)?.length, 3);
  for (const arquivo of ["jost/jost-latin.woff2", "bodoni-moda/bodoni-moda-latin-600.woff2", "bodoni-moda/bodoni-moda-latin-500-italic.woff2"]) {
    assert.ok(html.includes(`<link rel="preload" href="/fonts/bio/${arquivo}" as="font" type="font/woff2" crossorigin>`), arquivo);
  }
  assert.match(html, /@font-face\{font-family:"Bodoni Moda";font-style:italic;font-weight:500;font-display:swap;src:url\(\/fonts\/bio\/bodoni-moda\/bodoni-moda-latin-500-italic\.woff2\) format\("woff2"\)\}/);
  assert.match(html, /\.lk\{font-family:"Jost"/);
});

test("topo: foto com prioridade, 'onde fica', logo clara no h1 e a frase em <p>", () => {
  const html = pagina();
  assert.match(html, /<header class="vt-capa vt-capa--foto"><img class="lk-f-50-30" src="[^"]*capa-falsa[^"]*" srcset="[^"]*384w[^"]*640w[^"]*828w" sizes="\(max-width: 520px\) 100vw, 520px" width="640" height="800" alt="Fachada da loja de exemplo" fetchpriority="high" decoding="async">/);
  assert.match(html, /<p class="vt-onde"><svg[^>]*><use href="#lk-i-mapa"><\/use><\/svg><span>Loja na Rua Exemplo/);
  assert.match(html, /<div class="vt-marca"><h1 class="vt-nome"><img class="vt-logo" src="[^"]*logo-clara-falsa[^"]*"[^>]*alt="Ateliê Exemplo Kids" decoding="async"><\/h1><p class="vt-frase">Kits de roupa infantil/);
  assert.match(html, /<meta name="theme-color" content="#151412">/);
});

test("sem foto o topo não tem min-height; sem logo o h1 é o nome; só a logo escura vai numa placa", () => {
  const sem = pagina({ capa: null, logoClara: null, logoEscura: null });
  assert.match(sem, /<header class="vt-capa"><p class="vt-onde">/);
  assert.match(sem, /<h1 class="vt-nome">Ateliê Exemplo Kids<\/h1>/);
  assert.doesNotMatch(sem, /fetchpriority/);
  assert.match(pagina({ logoClara: null }), /<h1 class="vt-nome"><span class="lk-placa"><img class="vt-logo" src="[^"]*logo-escura-falsa/);
});

test("lista: o principal é a pílula (WhatsApp verde), o catálogo leva as fotos e o endereço abre ali mesmo", () => {
  const html = pagina();
  assert.match(html, /<li class="vt-li-prin"><a class="vt-prin" href="https:\/\/wa\.me\/5562900000000\?text=[^"]+" data-link="[^"]+" data-tipo="whatsapp"><span class="vt-zap vt-zap--wa"><svg/);
  assert.match(html, new RegExp(`<a class="vt-linha" href="https://exemplo\\.com\\.br/catalogo" data-link="${IDS.catalogo}" data-tipo="link"><span class="vt-tile">`));
  assert.match(html, /<span class="vt-fotos" aria-hidden="true"><img src="[^"]*kit-1-falso[^"]*w=384&amp;q=75" width="120" height="150" alt="" loading="lazy" decoding="async">/);
  assert.match(html, /<details class="vt-abre"><summary class="vt-linha" data-link="[^"]+" data-tipo="endereco"><span class="vt-tile">/);
  assert.match(html, /<div class="vt-caminho"><img src="[^"]*fachada-falsa[^"]*"[^>]*sizes="\(max-width: 520px\) calc\(100vw - 44px\), 476px" width="640" height="400" alt="" loading="lazy"/);
  assert.match(html, /<footer class="vt-rodape"><span>Instagram @atelie\.exemplo<\/span><small>Ateliê Exemplo Kids · CNPJ 11\.222\.333\/0001-81<\/small><a class="lk-feito"/);
});
```

e `apps/web/src/lib/bio/render/modelos.test.ts` — o que vale para todo modelo (o Etiqueta entra como referência; a Task 3 e a Parte 2 aumentam a lista):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { PALETAS, documentoPadrao, type DadosRender, type Modelo } from "@/lib/bio/documento";
import { IDS, dadosCheios, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";

/** O que vale para todo modelo (spec §10 e §11), na primeira paleta de cada um. */
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const NOME = "Ateliê Exemplo Kids";
const no = (modelo: Modelo, d: DadosRender = dadosFalsos()): DadosRender => ({
  ...d,
  documento: { ...d.documento, modelo, paleta: PALETAS[modelo][0] },
});
const publica = (d: DadosRender) => renderPaginaBio(d, { modo: "publica", nonce: NONCE, animarEntrada: true });
const conta = (html: string, re: RegExp) => html.match(re)?.length ?? 0;
/** Os modelos com módulo próprio (os outros ainda desenham com o Etiqueta); a Parte 2 troca por `MODELOS`. */
const MODELOS_PRONTOS: readonly Modelo[] = ["etiqueta", "vitrine"];

for (const modelo of MODELOS_PRONTOS) {
  test(`${modelo}: um h1 com o nome (ou a logo com alt = nome), um role=status fora da lista, decoração com aria-hidden`, () => {
    const html = publica(no(modelo));
    assert.equal(conta(html, /<h1/g), 1);
    const h1 = /<h1 class="[^"]+">([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
    assert.ok(h1 === NOME || new RegExp(`^(?:<span class="lk-placa[^"]*">)?<img [^>]*alt="${NOME}"`).test(h1), h1);
    assert.equal(conta(html, /role="status"/g), 1);
    assert.match(html, /<\/main><p id="lk-status" class="lk-status" role="status"><\/p><\/div>/);
    assert.match(html, /<meta name="theme-color" content="#[0-9A-F]{6}">/);
    for (const svg of html.match(/<svg class="i[^"]*"[^>]*>/g) ?? []) assert.match(svg, /aria-hidden="true"/);
  });

  test(`${modelo}: um item por link visível, na ordem, com data-link e data-tipo`, () => {
    const html = publica(no(modelo));
    assert.match(html, new RegExp(`<ul class="[a-z-]+" aria-label="Links da ${NOME}">`));
    const ids = [...html.matchAll(/data-link="([^"]+)" data-tipo="([a-z]+)"/g)].map((m) => `${m[2]}:${m[1]}`);
    assert.deepEqual(ids, [
      `whatsapp:${IDS.whatsapp}`,
      `link:${IDS.catalogo}`,
      `grupo:${IDS.grupo}`,
      `endereco:${IDS.endereco}`,
      `link:${IDS.canal}`,
    ]);
    assert.match(html, new RegExp(`<summary class="[a-z-]+" data-link="${IDS.endereco}" data-tipo="endereco">`));
    assert.match(html, /href="\/r\/vip-exemplo" data-link/);
    assert.match(html, /<button type="button" class="[a-z]+-copiar" data-copiar="11222333000181">Copiar CNPJ<\/button>/);
  });

  test(`${modelo}: texto do lojista nunca vira HTML, em campo nenhum`, () => {
    const d = no(modelo);
    const MAL = `"><script>alert(1)</script><b>x</b>'<img src=x onerror=y>`;
    const perfil = { ...d.documento.perfil, nome: MAL, frase: MAL, destaques: [MAL, MAL], local: MAL, instagram: MAL, capaAlt: MAL };
    const confere = { ativo: true, razao: MAL, cnpj: "11222333000181", linhas: [MAL, MAL] };
    const links = d.documento.links.map((l) =>
      l.tipo === "endereco" ? { ...l, titulo: MAL, sub: MAL, endereco: MAL, horario: MAL } : { ...l, titulo: MAL, sub: MAL },
    );
    const html = publica({ ...d, documento: { ...d.documento, perfil, confere, links } });
    assert.doesNotMatch(html, /<script>alert|<b>x<\/b>|<img src=x|'<img|"><script/);
  });

  test(`${modelo}: sem style=, com nonce; a prévia não tem <script> nem href`, () => {
    const html = publica(no(modelo));
    assert.doesNotMatch(html, /\sstyle=/);
    assert.doesNotMatch(publica(no(modelo, dadosCheios())), /\sstyle=/);
    assert.match(html, /<style nonce="AAAAAAAAAAAAAAAAAAAAAA==">/);
    assert.equal(conta(html, /<script/g), 1);
    const previa = renderPaginaBio(no(modelo), { modo: "previa", nonce: null, animarEntrada: false });
    assert.doesNotMatch(previa, /<script/);
    assert.doesNotMatch(previa, /<a [^>]*href=/);
    assert.match(previa, /<a class="[^"]+" data-link=/);
  });

  test(`${modelo}: desligado, escondido e sem destino somem; todos escondidos = nenhuma lista`, () => {
    const d = no(modelo);
    const links = d.documento.links.map((l) =>
      l.id === IDS.canal ? { ...l, ativo: false } : l.id === IDS.catalogo && l.tipo === "link" ? { ...l, url: "javascript:alert(1)" } : l,
    );
    const html = publica({ ...d, documento: { ...d.documento, links }, linksEscondidos: [IDS.whatsapp], campanhas: {} });
    for (const id of [IDS.canal, IDS.catalogo, IDS.whatsapp, IDS.grupo]) assert.doesNotMatch(html, new RegExp(id));
    assert.doesNotMatch(html, /javascript:/);
    const vazia = publica({ ...d, linksEscondidos: d.documento.links.map((l) => l.id) });
    assert.doesNotMatch(vazia, /aria-label="Links da/);
    assert.match(vazia, /<h1/);
  });

  test(`${modelo}: página recém-criada (documentoPadrao) abre sem elemento vazio`, () => {
    const d = no(modelo, { ...dadosFalsos(), documento: documentoPadrao({ nome: "Loja Nova", campanhaId: IDS.campanha }) });
    const html = publica(d);
    assert.match(html, /<h1 class="[^"]+">Loja Nova<\/h1>/);
    assert.match(html, /href="\/r\/vip-exemplo"/);
    assert.doesNotMatch(html, /<(p|ul|h1|figure|footer|section|header|div|article) class="[^"]*"><\/\1>/);
  });

  test(`${modelo}: página cheia (20 links no limite) cabe em 40 KB`, () => {
    const html = publica(no(modelo, dadosCheios()));
    assert.equal(conta(html, /data-link=/g), 20);
    const bytes = Buffer.byteLength(html);
    assert.ok(bytes <= 40 * 1024, `${bytes} bytes`);
  });
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/vitrine.test.ts src/lib/bio/render/modelos.test.ts`
Expected: FAIL — `Error: Cannot find module './vitrine'` no `vitrine.test.ts` e `✖ vitrine: um h1 com o nome (ou a logo com alt = nome)…` no `modelos.test.ts` (o Etiqueta desenhando a paleta do Vitrine não acha `--fundo1` e sai sem `theme-color`); `ℹ pass 13`, `ℹ fail 2`.

- [ ] **Step 5: Implement** — criar `apps/web/src/lib/bio/render/vitrine.ts`:

```ts
/**
 * Modelo Vitrine: foto cheia da loja no topo, com a logo e a frase em itálico;
 * a lista sobe por cima como uma folha; o botão principal é uma pílula com um
 * brilho que passa uma vez na entrada (e de novo no toque). Valores do mockup
 * (Main.dc.html, prefixo `vt-`) com as regras da revisão: topo com min-height
 * e o texto no fluxo (zoom de 200% não corta), véu fixo de .62 sob o texto da
 * foto, sem opacity em texto, alvos ≥ 44 px, h1 = nome da loja, nada de style=.
 */
import { escapeHtml } from "@/lib/campaigns/entry-page";
import type { ContextoRender, FonteDoModelo, LinkVisivel, ModeloRender } from "./modelo";
import {
  atrasos,
  blocoConfere,
  cnpjDaLoja,
  conteudoDoH1,
  dadosDoLink,
  destaqueHtml,
  detalhesDoEndereco,
  feitoComGirumo,
  hrefAttr,
  icone,
  imagem,
} from "./partes";

const FONTES_VITRINE: readonly FonteDoModelo[] = [
  { familia: "Jost", arquivo: "jost/jost-latin.woff2", peso: "100 900", estilo: "normal" },
  { familia: "Bodoni Moda", arquivo: "bodoni-moda/bodoni-moda-latin-600.woff2", peso: "600", estilo: "normal" },
  { familia: "Bodoni Moda", arquivo: "bodoni-moda/bodoni-moda-latin-500-italic.woff2", peso: "500", estilo: "italic" },
];

/** Fundo do topo (atrás da foto e no lugar dela): theme-color e fundo que escolhe a logo. */
const FUNDO_DO_TOPO = "#151412";
/** As fotos do catálogo têm ~1/3 da coluna (≤ 160 px): 384 basta até 2,4x. */
const LARGURA_DAS_FOTOS = [384] as const;
const SIZES_CAPA = "(max-width: 520px) 100vw, 520px";
const SIZES_CAMINHO = "(max-width: 520px) calc(100vw - 44px), 476px";

export const CSS_VITRINE = [
  '.lk{font-family:"Jost","Futura",system-ui,sans-serif}',
  ".vt{background:var(--fundo2);color:var(--on);font-size:16px;line-height:1.45}",
  ".vt-capa{position:relative;isolation:isolate;display:flex;flex-direction:column;max-width:520px;margin:0 auto;padding:14px 14px 48px;overflow:hidden;background:#151412;color:#fff}",
  ".vt-capa--foto{min-height:520px}",
  ".vt-capa>img{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover;object-position:50% 30%}",
  ".vt-onde{align-self:flex-start;display:flex;align-items:flex-start;gap:7px;padding:7px 11px;border-radius:12px;background:rgb(0 0 0 / .62);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-size:12.5px;line-height:1.3;font-weight:500}",
  ".vt-onde svg.i{width:15px;height:15px;margin-top:1px}",
  ".vt-marca{position:relative;margin-top:auto;padding:56px 6px 0;display:grid;justify-items:start;gap:12px}",
  '.vt-marca::before{content:"";position:absolute;inset:0 -14px -48px;z-index:-1;background:linear-gradient(180deg,rgb(0 0 0 / 0),rgb(0 0 0 / .62) 56px)}',
  ".vt-nome{font-size:15px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;line-height:1.3}",
  ".vt-logo{width:146px;height:65px;object-fit:contain;object-position:left center;filter:drop-shadow(0 2px 10px rgb(0 0 0 / .35))}",
  ".lk-placa .vt-logo{width:118px;height:52px;object-position:center;filter:none}",
  '.vt-frase{font-family:"Bodoni Moda",Georgia,serif;font-weight:500;font-style:italic;font-size:31px;line-height:1.08;letter-spacing:-.01em;text-wrap:balance;text-shadow:0 2px 18px rgb(0 0 0 / .35)}',
  ".vt-folha{position:relative;z-index:2;max-width:520px;margin:-26px auto 0;background:var(--fundo2);border-radius:26px 26px 0 0;padding:22px 18px 30px;display:grid;grid-template-columns:minmax(0,1fr);gap:22px}",
  ".vt-fatos{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;font-size:13.5px;color:var(--on2)}",
  '.vt-fatos b{font-family:"Bodoni Moda",Georgia,serif;font-size:18px;font-weight:600;color:var(--acento)}',
  ".vt-lista{display:grid}",
  ".vt-lista>li{border-bottom:1px solid var(--linha)}",
  ".vt-lista>li.vt-li-prin{border-bottom:0;padding-bottom:12px}",
  ".vt-prin{position:relative;overflow:hidden;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;min-height:66px;padding:10px 20px 10px 10px;border-radius:999px;background:var(--prin);color:var(--printinta);text-decoration:none;box-shadow:0 16px 30px -20px rgb(0 0 0 / .6)}",
  '.vt-prin::before,.vt-prin::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 35%,rgb(255 255 255 / .3) 50%,transparent 65%);transform:translateX(-130%)}',
  ".vt-zap{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:rgb(255 255 255 / .14);color:var(--printinta)}",
  ".lk .vt-zap--wa{background:#25D366;color:#fff}",
  ".vt-prin .vt-rot{font-size:17px;font-weight:600;line-height:1.2}",
  ".vt-prin .vt-sub{font-size:13px;line-height:1.3;color:var(--printinta)}",
  ".vt-linha{display:grid;grid-template-columns:56px minmax(0,1fr) auto;align-items:center;column-gap:14px;min-height:82px;padding:12px 4px;text-decoration:none;color:var(--on);border-radius:12px}",
  ".vt-prin,.vt-linha{cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  ".vt-tile{width:56px;height:56px;border-radius:14px;display:grid;place-items:center;background:var(--icobg);color:var(--ico)}",
  ".vt-txt{display:grid;gap:2px;min-width:0}",
  ".vt-rot{font-size:16.5px;font-weight:600;letter-spacing:-.005em;line-height:1.25}",
  ".vt-sub{font-size:13.5px;color:var(--on2);line-height:1.35}",
  ".lk svg.vt-seta{width:20px;height:20px;color:var(--seta)}",
  ".vt-abre[open] svg.vt-seta{transform:rotate(90deg)}",
  ".vt-fotos{grid-column:1 / -1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}",
  ".vt-fotos img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:12px}",
  ".vt-caminho{display:grid;gap:12px;padding:4px 4px 16px}",
  ".vt-caminho img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:50% 30%;border-radius:16px}",
  ".vt-caminho address{font-style:normal;font-size:14.5px;line-height:1.5;white-space:pre-line}",
  ".vt-hora{font-size:13px;color:var(--on2)}",
  ".vt-mapa{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;border-radius:999px;border:1.5px solid var(--on);color:var(--on);font-weight:600;text-decoration:none}",
  ".vt-mapa svg.i{width:18px;height:18px}",
  ".vt-confere{background:var(--papel);border:1px solid var(--linha);border-radius:18px;padding:18px;display:grid;gap:12px;color:var(--tinta)}",
  ".vt-confere h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--acento);font-weight:700}",
  ".vt-confere ul{display:grid;gap:10px}",
  ".vt-confere li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;font-size:14.5px;line-height:1.45}",
  ".vt-confere li svg.i{width:20px;height:20px;color:var(--acento);margin-top:1px}",
  ".vt-confere b{font-weight:600}",
  ".vt-cnpj{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}",
  ".vt-cnpj>span{font-variant-numeric:tabular-nums;font-weight:600}",
  ".vt-copiar{font-size:12.5px;font-weight:600;color:var(--tinta);background:none;border:1.5px solid var(--linha);border-radius:999px;min-height:44px;padding:0 14px;cursor:pointer}",
  ".vt-confere :focus-visible{outline-color:var(--tinta)}",
  ".vt-rodape{display:grid;justify-items:center;gap:8px;text-align:center;font-size:13px;color:var(--on2)}",
  ".vt-rodape small{font-size:11.5px}",
  "@media (prefers-reduced-motion:no-preference){",
  ".vt-prin{transition:transform .2s cubic-bezier(.22,1,.36,1)}",
  ".vt-prin:active{transform:scale(.98)}",
  ".lk svg.vt-seta{transition:transform .25s cubic-bezier(.22,1,.36,1)}",
  ".vt-linha:active svg.vt-seta,.vt-linha.lk-toque svg.vt-seta{transform:translateX(3px)}",
  ".lk-entra .vt-capa>img{animation:vt-zoom 1.8s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .vt-marca>*{animation:vt-ergue .9s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .vt-marca>:nth-child(2){animation-delay:120ms}",
  ".lk-entra .vt-folha{animation:vt-sobe .95s .15s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .vt-lista>li{animation:vt-entra .7s cubic-bezier(.16,1,.3,1) both}",
  atrasos(".vt-lista>li", 350, 60),
  // brilho da entrada no ::after, o do toque no ::before: trocar de nome no mesmo
  // pseudo-elemento faria a entrada tocar de novo quando o toque acaba
  ".lk-entra .vt-prin::after{animation:vt-brilho 1.3s 1.25s cubic-bezier(.4,0,.2,1) both}",
  ".vt-prin.lk-toque::before{animation:vt-brilho .9s cubic-bezier(.4,0,.2,1)}",
  "}",
  // hover só onde existe ponteiro: no celular o :hover gruda depois do toque
  "@media (prefers-reduced-motion:no-preference) and (hover:hover){.vt-linha:hover svg.vt-seta{transform:translateX(3px)}}",
  "@keyframes vt-zoom{from{transform:scale(1.14)}to{transform:none}}",
  "@keyframes vt-ergue{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}",
  "@keyframes vt-sobe{from{transform:translateY(64px)}to{transform:none}}",
  "@keyframes vt-entra{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}",
  "@keyframes vt-brilho{to{transform:translateX(130%)}}",
].join("");

function itemDaLista(v: LinkVisivel, c: ContextoRender): string {
  const l = v.link;
  const sub = l.sub ? `<span class="vt-sub">${escapeHtml(l.sub)}</span>` : "";
  const texto = `<span class="vt-txt"><span class="vt-rot">${escapeHtml(l.titulo)}</span>${sub}</span>`;
  const seta = icone("seta", "i vt-seta");
  if (l.tipo === "endereco") {
    const caminho = detalhesDoEndereco(v, c, {
      prefixo: "vt",
      classeDoResumo: "vt-linha",
      resumo: `<span class="vt-tile">${icone(l.icone)}</span>${texto}${seta}`,
      foto: { largura: 640, altura: 400, sizes: SIZES_CAMINHO },
    });
    return `<li>${caminho}</li>`;
  }
  const destino = `${hrefAttr(v.href, c.modo)}${dadosDoLink(v)}`;
  if (v.principal) {
    const zap = l.icone === "whatsapp" ? " vt-zap--wa" : "";
    return `<li class="vt-li-prin"><a class="vt-prin"${destino}><span class="vt-zap${zap}">${icone(l.icone)}</span>${texto}${icone("seta")}</a></li>`;
  }
  const fotos = (l.tipo === "link" ? l.fotos : [])
    .map((f) => imagem(f, { largura: 120, altura: 150, sizes: "120px", alt: "", carregamento: "lazy", larguras: LARGURA_DAS_FOTOS }))
    .join("");
  const vitrine = fotos ? `<span class="vt-fotos" aria-hidden="true">${fotos}</span>` : "";
  return `<li><a class="vt-linha"${destino}><span class="vt-tile">${icone(l.icone)}</span>${texto}${seta}${vitrine}</a></li>`;
}

function rodape(c: ContextoRender): string {
  const p = c.d.documento.perfil;
  const insta = p.instagram ? `<span>Instagram @${escapeHtml(p.instagram)}</span>` : "";
  const cnpj = cnpjDaLoja(c.d.documento);
  const linhaDoCnpj = cnpj ? `<small>${escapeHtml(p.nome)} · CNPJ ${cnpj}</small>` : "";
  const feito = feitoComGirumo(c);
  return insta || linhaDoCnpj || feito ? `<footer class="vt-rodape">${insta}${linhaDoCnpj}${feito}</footer>` : "";
}

function corpo(c: ContextoRender): string {
  const doc = c.d.documento;
  const p = doc.perfil;
  const capa = p.capa
    ? imagem(p.capa, { largura: 640, altura: 800, sizes: SIZES_CAPA, alt: p.capaAlt, carregamento: "prioridade" })
    : "";
  const onde = p.local ? `<p class="vt-onde">${icone("mapa")}<span>${escapeHtml(p.local)}</span></p>` : "";
  const h1 = `<h1 class="vt-nome">${conteudoDoH1(c, { classe: "vt-logo", largura: 146, altura: 65, sizes: "146px" })}</h1>`;
  const frase = p.frase ? `<p class="vt-frase">${escapeHtml(p.frase)}</p>` : "";
  const topo = `<header class="vt-capa${capa ? " vt-capa--foto" : ""}">${capa}${onde}<div class="vt-marca">${h1}${frase}</div></header>`;
  const fatos = p.destaques.length
    ? `<ul class="vt-fatos">${p.destaques.map((t) => `<li>${destaqueHtml(t)}</li>`).join("")}</ul>`
    : "";
  const lista = c.links.length
    ? `<ul class="vt-lista" aria-label="Links da ${escapeHtml(p.nome)}">${c.links.map((v) => itemDaLista(v, c)).join("")}</ul>`
    : "";
  const folha = `${fatos}${lista}${blocoConfere(doc, "vt")}${rodape(c)}`;
  return `<main class="vt">${topo}${folha ? `<div class="vt-folha">${folha}</div>` : ""}</main>`;
}

export const vitrine: ModeloRender = {
  fontes: FONTES_VITRINE,
  css: CSS_VITRINE,
  corDoTopo: () => FUNDO_DO_TOPO,
  fundoDoLogo: () => FUNDO_DO_TOPO,
  corpo,
};
```

- [ ] **Step 6: O mapa** — em `index.ts`, acrescentar `import { vitrine } from "./vitrine";` logo depois de `import { scriptDaPagina } from "./script";` e trocar o comentário e o mapa (`/** O PR 3b troca as três últimas entradas… */` + `MODELOS_RENDER`) por:

```ts
/** Os modelos ainda sem módulo próprio desenham com o Etiqueta. */
const MODELOS_RENDER: Record<Modelo, ModeloRender> = {
  etiqueta,
  vitrine,
  romaneio: etiqueta,
  classico: etiqueta,
};
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/vitrine.test.ts src/lib/bio/render/modelos.test.ts`
Expected: `ℹ pass 27`, `ℹ fail 0`. A pasta inteira (`--test "src/lib/bio/render/*.test.ts"`): `ℹ pass 86`.

Se um teste de contraste falhar, a mensagem diz o par (ex.: `ícone do principal (véu branco de 14%): #… sobre #… = 2.87 < 3`). Com o `cores.ts` do plano do PR 2 todos passam: falha aqui quer dizer que o PR 2 mudou — parar e reportar o par; não afrouxar o mínimo nem mexer no CSS para "passar".

- [ ] **Step 8: Lint e tipos**

Run: `npx eslint src/lib/bio/render/vitrine.ts src/lib/bio/render/vitrine.test.ts src/lib/bio/render/modelos.test.ts src/lib/bio/render/index.ts src/test/bio-contraste.ts` e depois `npx tsc --noEmit --project tsconfig.json`
Expected: nenhuma saída nos dois.

- [ ] **Step 9: Commit**

```bash
git add public/fonts/bio/jost public/fonts/bio/bodoni-moda src/test/bio-contraste.ts src/lib/bio/render/vitrine.ts src/lib/bio/render/vitrine.test.ts src/lib/bio/render/modelos.test.ts src/lib/bio/render/index.ts
git commit -m "feat(bio): Vitrine model with self-hosted Jost and Bodoni Moda"
```

---

### Task 3: Modelo Romaneio (IBM Plex Mono 400–700)

**Files:**
- Create: `apps/web/public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-400.woff2`, `…-500.woff2`, `…-600.woff2`, `…-700.woff2`, `apps/web/public/fonts/bio/ibm-plex-mono/OFL.txt`
- Create: `apps/web/src/lib/bio/render/romaneio.ts`
- Modify: `apps/web/src/lib/bio/render/index.ts` (import e a entrada `romaneio`)
- Modify: `apps/web/src/lib/bio/render/modelos.test.ts` (`MODELOS_PRONTOS`)
- Test: `apps/web/src/lib/bio/render/romaneio.test.ts`

**Interfaces:**
- Consumes: o mesmo da Task 2, mais `LARGURA_MINIATURA` (`partes.ts`, 3a), `DocumentoBio` (PR 2) e o ajudante `bio-contraste.ts` (Task 2). Não usa `blocoConfere`: o confere do Romaneio é próprio, com as mesmas regras (só com o "confere" ligado; a linha do Pix só com razão + CNPJ válido; linhas vazias somem).
- Produces: `CSS_ROMANEIO: string` e `romaneio: ModeloRender` (`romaneio.ts`).

- [ ] **Step 1: As fontes** (Git Bash, em `apps/web`). 400, 500 e o `OFL.txt` são cópia dos `src/fonts/ibm-plex-mono/` (spec §3); 600 e 700 vêm do mesmo lugar e do mesmo jeito da Task 2 (`css2?family=IBM+Plex+Mono:wght@400;500;600;700` com UA de macOS — as URLs de 400 e 500 desse CSS dão os mesmos bytes dos `src/fonts`):

```bash
mkdir -p public/fonts/bio/ibm-plex-mono
cp src/fonts/ibm-plex-mono/ibm-plex-mono-latin-400.woff2 src/fonts/ibm-plex-mono/ibm-plex-mono-latin-500.woff2 src/fonts/ibm-plex-mono/OFL.txt public/fonts/bio/ibm-plex-mono/
G=https://fonts.gstatic.com/s/ibmplexmono/v20
curl -fsSL -o public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-600.woff2 "$G/-F6qfjptAgt5VM-kVkqdyU8n3vAOwlBFgsAXHNk.woff2"
curl -fsSL -o public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-700.woff2 "$G/-F6qfjptAgt5VM-kVkqdyU8n3pQPwlBFgsAXHNk.woff2"
sha256sum public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-400.woff2 public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-500.woff2 public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-600.woff2 public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-700.woff2 public/fonts/bio/ibm-plex-mono/OFL.txt
```

Expected:
```
c36f509c0a8f9f85f29cb44bc8701d8a9e0b14c499e77a884f789ead7093a7ac *public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-400.woff2
a76f53ca6612e7b3828eec2311098675b7f9849ae4169a8bcef6302aec02a6c0 *public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-500.woff2
ad4580d8cb4b5f627c2d18457656732f7f7b070f7837fbc380e08054157e6f6c *public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-600.woff2
9e1455e6e9c5866f607e464fffb7855486dcf575b7e69b83a3d234e587fce41b *public/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-700.woff2
7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da *public/fonts/bio/ibm-plex-mono/OFL.txt
```

(10 052, 10 060, 10 120 e 10 128 bytes.) A IBM reserva o nome "Plex": os arquivos vão como vieram, sem modificação (README dos `src/fonts`).

- [ ] **Step 2: Write the failing test** — criar `apps/web/src/lib/bio/render/romaneio.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { coresDoModelo, type TokensBio } from "@/lib/bio/cores";
import { PALETAS, type DadosRender, type DocumentoBio } from "@/lib/bio/documento";
import { falhas, hexLiterais, keyframes, regras, sorteio, variaveisLidas, type Par } from "@/test/bio-contraste";
import { IDS, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";
import { CSS_BASE, tokensValidos } from "./partes";
import { CSS_ROMANEIO } from "./romaneio";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const tokens = (paleta: string, cores: DocumentoBio["cores"] = null) => tokensValidos(coresDoModelo("romaneio", paleta, cores));
const pagina = (perfil: Partial<DocumentoBio["perfil"]> = {}): string => {
  const d: DadosRender = dadosFalsos();
  const documento = { ...d.documento, modelo: "romaneio" as const, paleta: "kraft", perfil: { ...d.documento.perfil, ...perfil } };
  return renderPaginaBio({ ...d, documento }, { modo: "publica", nonce: NONCE, animarEntrada: true });
};

/** Todo par de cor que o CSS do Romaneio desenha: no papel, e fora dele sobre o degradê fundo1–fundo3. */
function pares(t: TokensBio): Par[] {
  const c = (nome: string) => t[`--${nome}`];
  return [
    [c("tinta"), c("papel"), 4.5, "itens, h1, frase, CNPJ, linha tocada (invertida) e o aviso #lk-status"],
    [c("tinta2"), c("papel"), 4.5, "número, subtítulo, onde fica, horário e rótulo"],
    [c("acento"), c("papel"), 4.5, "carimbo"],
    [c("on2"), c("fundo2"), 4.5, "Feito com Girumo (o selo leva o fundo2 atrás)"],
    [c("foco"), c("papel"), 3, "anel de foco no papel"],
    [c("foco-fora"), c("fundo1"), 3, "anel de foco fora do papel (fundo1)"],
    [c("foco-fora"), c("fundo2"), 3, "anel de foco fora do papel (fundo2)"],
    [c("foco-fora"), c("fundo3"), 3, "anel de foco fora do papel (fundo3)"],
  ];
}

test("as 4 paletas do Romaneio passam em todo par, inclusive os dois anéis de foco", () => {
  for (const paleta of PALETAS.romaneio) assert.deepEqual(falhas(pares(tokens(paleta))), [], paleta);
});

test("cores da marca: 500 pares sorteados passam em todo par", () => {
  const hex = sorteio(20261019);
  const ruins: string[] = [];
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: hex(), botao: hex() };
    const f = falhas(pares(tokens("marca", cores)));
    if (f.length) ruins.push(`${cores.fundo}/${cores.botao}: ${f.join("; ")}`);
  }
  assert.deepEqual(ruins.slice(0, 5), []);
});

test("toda variável que o CSS lê existe nas 4 paletas e na marca", () => {
  const usadas = variaveisLidas(`${CSS_BASE}${CSS_ROMANEIO}`);
  assert.ok(usadas.includes("foco-fora"));
  for (const paleta of [...PALETAS.romaneio, "marca"]) {
    const t = tokens(paleta, paleta === "marca" ? { fundo: "#3A80BF", botao: "#F28C28" } : null);
    assert.deepEqual(usadas.filter((v) => !(`--${v}` in t)), [], paleta);
  }
});

test("a serrilha fica no ::before do papel e o papel impresso não guarda clip-path: o anel de foco nunca é cortado", () => {
  const comMascara = regras(CSS_ROMANEIO).filter(([, d]) => /(?:^|;)(?:-webkit-)?mask/.test(d)).map(([s]) => s);
  assert.deepEqual(comMascara, [".rm-papel::before"]);
  assert.deepEqual(regras(CSS_ROMANEIO).filter(([, d]) => /clip-path/.test(d)), []);
  assert.match(CSS_ROMANEIO, /\.lk-entra \.rm-papel\{animation:rm-imprime 1\.2s [^}]* backwards\}/);
});

test("fora do papel o anel é --foco-fora; dentro, o --foco do CSS base", () => {
  assert.match(CSS_ROMANEIO, /\.rm-fora :focus-visible\{outline-color:var\(--foco-fora\)\}/);
  const trocas = regras(CSS_ROMANEIO).filter(([, d]) => /outline/.test(d)).map(([s]) => s);
  assert.deepEqual(trocas, [".rm-fora :focus-visible"]);
  assert.match(CSS_ROMANEIO, /\.rm-fora \.lk-feito\{background:var\(--fundo2\)\}/);
});

test("nada de opacity em texto: só o filete do carimbo e as entradas, que terminam em 1", () => {
  assert.deepEqual(regras(CSS_ROMANEIO).filter(([, d]) => /opacity/.test(d)).map(([s]) => s), [".rm-carimbo::before"]);
  const comFade = Object.entries(keyframes(CSS_ROMANEIO)).filter(([, corpo]) => /opacity/.test(corpo));
  assert.deepEqual(comFade.map(([nome]) => nome), ["rm-linha", "rm-carimba"]);
  for (const [, corpo] of comFade) assert.match(corpo, /(?:to|100%)\{opacity:1;/);
});

test("cor de paleta só por var(--…): hex literal só na máscara da serrilha", () => {
  assert.deepEqual(hexLiterais(CSS_ROMANEIO), ["#000", "#0000"]);
});

test("tudo que mexe fica em no-preference; o carimbo da entrada (no <li>) não briga com o do toque (no <a>)", () => {
  const [antes, depois] = CSS_ROMANEIO.split("@media (prefers-reduced-motion:no-preference){");
  assert.ok(depois);
  assert.doesNotMatch(antes, /animation|transition/);
  const entrada = depois.indexOf(".lk-entra .rm-itens>li.rm-li-prin{animation:rm-carimba .55s 1.15s");
  assert.ok(entrada > depois.indexOf(".rm-itens>li:nth-child(20){animation-delay:2070ms}"), "depois dos atrasos");
  assert.match(depois, /\.rm-carimbo\.lk-toque\{animation:rm-recarimba \.5s/);
});

test("alvo de toque ≥ 44 px", () => {
  assert.match(CSS_ROMANEIO, /\.rm-linha\{[^}]*min-height:58px/);
  assert.match(CSS_ROMANEIO, /\.rm-mapa\{[^}]*min-height:44px/);
  assert.match(CSS_ROMANEIO, /\.rm-copiar\{[^}]*min-height:44px/);
});

test("IBM Plex Mono nos 4 pesos, com preload, e nenhuma outra fonte", () => {
  const html = pagina();
  assert.equal(html.match(/rel="preload"/g)?.length, 4);
  for (const peso of ["400", "500", "600", "700"]) {
    assert.ok(html.includes(`<link rel="preload" href="/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-${peso}.woff2" as="font" type="font/woff2" crossorigin>`), peso);
    assert.ok(html.includes(`@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:${peso};font-display:swap;`), peso);
  }
});

test("topo: h1 = nome (a logo escura no papel claro), frase e onde fica em <p>, sem a foto", () => {
  const html = pagina();
  assert.match(html, /<header class="rm-topo"><h1 class="rm-nome"><img class="rm-logo" src="[^"]*logo-escura-falsa[^"]*"[^>]*alt="Ateliê Exemplo Kids" decoding="async"><\/h1><p class="rm-frase">Kits de roupa infantil[^<]*<\/p><p class="rm-local">Loja na Rua Exemplo/);
  assert.doesNotMatch(html, /capa-falsa[^"]*"[^>]*fetchpriority|<img [^>]*fetchpriority/);
  assert.match(pagina({ logoClara: null, logoEscura: null }), /<h1 class="rm-nome">Ateliê Exemplo Kids<\/h1>/);
});

test("itens: o principal é o carimbo sem número; os outros 01, 02… com número, rótulo, pontilhado e seta fora da árvore", () => {
  const html = pagina();
  assert.match(html, /<p class="rm-rotulo" aria-hidden="true"><span>Item<\/span><span>Abrir<\/span><\/p><ul class="rm-itens" aria-label="Links da Ateliê Exemplo Kids"><li class="rm-li-prin"><a class="rm-carimbo" href="https:\/\/wa\.me\//);
  assert.match(html, new RegExp(`<a class="rm-linha" href="https://exemplo\\.com\\.br/catalogo" data-link="${IDS.catalogo}" data-tipo="link"><span class="rm-n" aria-hidden="true">01</span><span class="rm-t">Catálogo de kits</span><span class="rm-pontos" aria-hidden="true"></span><span class="rm-seta" aria-hidden="true">→</span><span class="rm-sub">`));
  assert.match(html, /<span class="rm-mini" aria-hidden="true"><img src="[^"]*kit-1-falso[^"]*w=128&amp;q=75" width="38" height="46" alt="" loading="lazy"/);
  assert.deepEqual([...html.matchAll(/<span class="rm-n" aria-hidden="true">(\d+)<\/span>/g)].map((m) => m[1]), ["01", "02", "03", "04"]);
  assert.match(html, new RegExp(`<details class="rm-abre"><summary class="rm-linha" data-link="${IDS.endereco}" data-tipo="endereco"><span class="rm-n" aria-hidden="true">03</span><span class="rm-t">Como chegar na loja</span><span class="rm-pontos" aria-hidden="true"></span><span class="rm-seta" aria-hidden="true">↓</span>`));
  assert.match(html, /<a class="rm-mapa" href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=[^"]+">Abrir no Google Maps <span aria-hidden="true">→<\/span><\/a>/);
  for (const hr of html.match(/<hr[^>]*>/g) ?? []) assert.equal(hr, '<hr class="rm-corte" aria-hidden="true">');
});

test("confere com travessão e Copiar CNPJ; a nota fecha com código de barras decorativo, @ e CNPJ", () => {
  const html = pagina();
  assert.match(html, /<section class="rm-confere" aria-labelledby="lk-confere"><h2 id="lk-confere">Antes de pagar, confere<\/h2><ul><li><span aria-hidden="true">—<\/span><span>Pix só no nome <b>Ateliê Exemplo Comércio de Roupas Ltda<\/b><span class="rm-cnpj"><span>CNPJ 11\.222\.333\/0001-81<\/span><button type="button" class="rm-copiar" data-copiar="11222333000181">Copiar CNPJ<\/button><\/span><\/span><\/li><li><span aria-hidden="true">—<\/span><span>Na primeira compra/);
  assert.match(html, /<footer class="rm-fim"><strong>Obrigado pela preferência<\/strong><span class="rm-barras" aria-hidden="true"><\/span><span>@atelie\.exemplo<\/span><span>CNPJ 11\.222\.333\/0001-81<\/span><\/footer><\/article><\/div><footer class="rm-fora"><a class="lk-feito"/);
  const d = dadosFalsos();
  const semConfere = renderPaginaBio(
    { ...d, documento: { ...d.documento, modelo: "romaneio", paleta: "kraft", feitoComGirumo: false, confere: { ...d.documento.confere, ativo: false } } },
    { modo: "publica", nonce: NONCE, animarEntrada: true },
  );
  assert.doesNotMatch(semConfere, /class="rm-confere"|CNPJ \d|class="rm-fora"/);
  assert.match(semConfere, /<footer class="rm-fim"><strong>Obrigado pela preferência<\/strong>/);
});
```

e, em `modelos.test.ts`, pôr o Romaneio na lista:

```ts
const MODELOS_PRONTOS: readonly Modelo[] = ["etiqueta", "vitrine", "romaneio"];
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/romaneio.test.ts src/lib/bio/render/modelos.test.ts`
Expected: FAIL — `Error: Cannot find module './romaneio'` (`ℹ pass 21`, `ℹ fail 1`). Os 7 testes comuns do Romaneio passam ainda no Etiqueta (a paleta do Romaneio tem `--fundo1`); quem prova o modelo é o `romaneio.test.ts`.

- [ ] **Step 4: Implement** — criar `apps/web/src/lib/bio/render/romaneio.ts`:

```ts
/**
 * Modelo Romaneio: a nota que vai junto com o fardo do atacado. Papel com borda
 * serrilhada que "imprime" na entrada, itens numerados com pontilhado, botão
 * principal carimbado (de novo no toque), código de barras no fim; não usa a
 * foto. Valores do mockup (Main.dc.html, prefixo `rm-`) com as regras da
 * revisão: a serrilha fica no ::before do papel (nada focável é recortado), h1 =
 * nome da loja, fora do papel o anel de foco é `--foco-fora`, alvos ≥ 44 px,
 * números, rótulo e código de barras fora da árvore de acessibilidade.
 */
import type { DocumentoBio } from "@/lib/bio/documento";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import type { ContextoRender, FonteDoModelo, LinkVisivel, ModeloRender } from "./modelo";
import {
  LARGURA_MINIATURA,
  atrasos,
  cnpjDaLoja,
  conteudoDoH1,
  dadosDoLink,
  destaqueHtml,
  detalhesDoEndereco,
  feitoComGirumo,
  hrefAttr,
  icone,
  imagem,
} from "./partes";

const FONTES_ROMANEIO: readonly FonteDoModelo[] = ["400", "500", "600", "700"].map((peso) => ({
  familia: "IBM Plex Mono",
  arquivo: `ibm-plex-mono/ibm-plex-mono-latin-${peso}.woff2`,
  peso,
  estilo: "normal",
}));

const SERRILHA =
  "conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) top/18px 51% repeat-x,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/18px 51% repeat-x";
const CORTE = '<hr class="rm-corte" aria-hidden="true">';
const SIZES_CAMINHO = "(max-width: 448px) calc(100vw - 98px), 350px";

export const CSS_ROMANEIO = [
  '.lk{font-family:"IBM Plex Mono",ui-monospace,monospace}',
  ".rm{background-color:var(--fundo2);background-image:radial-gradient(circle at 18% 8%,var(--fundo1) 0,transparent 46%),radial-gradient(circle at 92% 86%,var(--fundo3) 0,transparent 52%);color:var(--on);font-size:15px;line-height:1.5;padding:26px 14px 30px}",
  ".rm-sombra{max-width:420px;margin:0 auto;filter:drop-shadow(0 18px 28px rgb(0 0 0 / .26))}",
  ".rm-papel{position:relative;isolation:isolate;color:var(--tinta);padding:34px 20px 40px}",
  `.rm-papel::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--papel);-webkit-mask:${SERRILHA};mask:${SERRILHA}}`,
  ".rm-topo{display:grid;justify-items:center;gap:10px;text-align:center}",
  ".rm-nome{font-size:20px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1.25;max-width:22ch}",
  ".rm-logo{width:150px;height:67px;object-fit:contain}",
  ".lk-placa .rm-logo{width:120px;height:53px}",
  ".rm-frase{font-size:14px;line-height:1.5;max-width:32ch}",
  ".rm-local{font-size:11.5px;line-height:1.45;color:var(--tinta2);text-transform:uppercase;letter-spacing:.06em;max-width:36ch}",
  ".rm-corte{border:0;border-top:2px dashed var(--linha);margin:18px 0}",
  ".rm-fatos{display:grid;gap:7px;font-size:13.5px;line-height:1.4}",
  ".rm-fatos li{display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:start}",
  ".rm-fatos svg.i{width:16px;height:16px;margin-top:2px;stroke-width:2.6}",
  ".rm-fatos b{font-weight:700}",
  ".rm-rotulo{display:flex;justify-content:space-between;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--tinta2);margin:0 0 4px}",
  ".rm-itens{display:grid;gap:2px}",
  ".rm-linha{display:grid;grid-template-columns:30px minmax(0,auto) minmax(14px,1fr) auto;align-items:baseline;column-gap:6px;row-gap:2px;min-height:58px;padding:10px 8px;margin:0 -8px;border-radius:6px;color:var(--tinta);text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  ".rm-n{font-size:12.5px;color:var(--tinta2);font-variant-numeric:tabular-nums}",
  ".rm-t{font-size:15px;font-weight:600;line-height:1.3}",
  ".rm-pontos{align-self:end;border-bottom:2px dotted var(--linha);margin-bottom:7px;min-width:14px}",
  ".rm-seta{font-weight:700}",
  ".rm-sub{grid-column:2 / -1;font-size:12.5px;color:var(--tinta2);line-height:1.4}",
  ".rm-linha:active,.rm-linha.lk-toque,.rm-abre[open]>summary.rm-linha{background:var(--tinta);color:var(--papel)}",
  ":is(.rm-linha:active,.rm-linha.lk-toque,.rm-abre[open]>summary) :is(.rm-n,.rm-sub){color:var(--papel)}",
  ".rm-mini{grid-column:2 / -1;display:flex;gap:6px;margin-top:6px}",
  ".rm-mini img{width:38px;height:46px;object-fit:cover;border-radius:4px;filter:grayscale(.15)}",
  ".rm-carimbo{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;margin:12px 6px 16px;padding:14px 16px;border:3px solid var(--acento);border-radius:10px;color:var(--acento);background:var(--papel);text-decoration:none;transform:rotate(-2deg);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  '.rm-carimbo::before{content:"";position:absolute;inset:4px;border:1.5px solid var(--acento);border-radius:6px;opacity:.55;pointer-events:none}',
  ".rm-ctxt{display:grid;gap:4px;min-width:0}",
  ".rm-crot{font-size:17px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;line-height:1.15}",
  ".rm-csub{font-size:12.5px;font-weight:500;line-height:1.35;color:var(--tinta2)}",
  ".lk .rm-carimbo svg.i{width:30px;height:30px}",
  ".rm-abre .rm-caminho{display:grid;gap:10px;padding:12px 0 8px 30px;font-size:13.5px}",
  ".rm-caminho img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:50% 30%;filter:grayscale(.2) contrast(1.05)}",
  ".rm-caminho address{font-style:normal;white-space:pre-line;line-height:1.5}",
  ".rm-hora{color:var(--tinta2);font-size:12.5px}",
  ".rm-mapa{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:13px;color:var(--tinta);text-decoration:underline;text-underline-offset:4px}",
  ".rm-confere h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin-bottom:10px}",
  ".rm-confere ul{display:grid;gap:10px;font-size:13.5px;line-height:1.45}",
  ".rm-confere li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px}",
  ".rm-confere b{font-weight:700}",
  ".rm-cnpj{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin-top:4px}",
  ".rm-copiar{background:none;border:0;border-bottom:2px solid currentColor;color:var(--tinta);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;min-height:44px;padding:6px 2px 2px;cursor:pointer}",
  ".rm-fim{display:grid;justify-items:center;gap:8px;text-align:center;font-size:12.5px}",
  ".rm-fim strong{font-size:13px;letter-spacing:.1em;text-transform:uppercase}",
  ".rm-barras{width:78%;height:44px;background:repeating-linear-gradient(90deg,var(--tinta) 0 2px,transparent 2px 4px,var(--tinta) 4px 5px,transparent 5px 8px,var(--tinta) 8px 11px,transparent 11px 13px,var(--tinta) 13px 14px,transparent 14px 17px)}",
  ".rm-fora{max-width:420px;margin:18px auto 0;display:grid;justify-items:center;gap:8px;text-align:center;font-size:12.5px;color:var(--on2)}",
  // o fundo da página é um degradê de fundo1–fundo3: o selo leva o fundo2 junto (on2/fundo2 é par garantido)
  ".rm-fora .lk-feito{background:var(--fundo2)}",
  ".rm-fora :focus-visible{outline-color:var(--foco-fora)}",
  // inversão no hover só onde existe ponteiro: no celular o :hover gruda depois do toque
  "@media (hover:hover){.rm-linha:hover{background:var(--tinta);color:var(--papel)}.rm-linha:hover :is(.rm-n,.rm-sub){color:var(--papel)}}",
  "@media (prefers-reduced-motion:no-preference){",
  ".rm-linha{transition:background-color .15s,color .15s}",
  ".rm-carimbo:active{transform:rotate(-2deg) scale(.98)}",
  // backwards: depois de impresso não fica clip-path nenhum no papel
  ".lk-entra .rm-papel{animation:rm-imprime 1.2s cubic-bezier(.3,.75,.25,1) backwards}",
  ".lk-entra .rm-itens>li{animation:rm-linha .45s cubic-bezier(.22,1,.36,1) both}",
  atrasos(".rm-itens>li", 550, 80),
  // o carimbo da entrada vai no <li> (depois dos atrasos, que têm a mesma especificidade);
  // o do toque, no <a>: os dois nunca brigam pelo mesmo animation-name
  ".lk-entra .rm-itens>li.rm-li-prin{animation:rm-carimba .55s 1.15s cubic-bezier(.16,1,.3,1) both}",
  ".rm-carimbo.lk-toque{animation:rm-recarimba .5s cubic-bezier(.16,1,.3,1)}",
  "}",
  "@keyframes rm-imprime{from{clip-path:inset(0 0 100% 0);transform:translateY(-12px)}to{clip-path:inset(0);transform:none}}",
  "@keyframes rm-linha{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}",
  "@keyframes rm-carimba{0%{opacity:0;transform:rotate(-12deg) scale(1.7)}72%{opacity:1;transform:scale(.96)}100%{opacity:1;transform:none}}",
  "@keyframes rm-recarimba{0%{transform:rotate(-2deg) scale(1.12)}60%{transform:rotate(-2deg) scale(.96)}100%{transform:rotate(-2deg)}}",
].join("");

function itemDaLista(v: LinkVisivel, c: ContextoRender, numero: string): string {
  const l = v.link;
  const titulo = escapeHtml(l.titulo);
  const destino = `${hrefAttr(v.href, c.modo)}${dadosDoLink(v)}`;
  if (v.principal) {
    const sub = l.sub ? `<span class="rm-csub">${escapeHtml(l.sub)}</span>` : "";
    return `<li class="rm-li-prin"><a class="rm-carimbo"${destino}>${icone(l.icone)}<span class="rm-ctxt"><span class="rm-crot">${titulo}</span>${sub}</span></a></li>`;
  }
  const sub = l.sub ? `<span class="rm-sub">${escapeHtml(l.sub)}</span>` : "";
  const linha = (seta: string) =>
    `<span class="rm-n" aria-hidden="true">${numero}</span><span class="rm-t">${titulo}</span><span class="rm-pontos" aria-hidden="true"></span><span class="rm-seta" aria-hidden="true">${seta}</span>${sub}`;
  if (l.tipo === "endereco") {
    const caminho = detalhesDoEndereco(v, c, {
      prefixo: "rm",
      classeDoResumo: "rm-linha",
      resumo: linha("↓"),
      foto: { largura: 640, altura: 400, sizes: SIZES_CAMINHO },
      mapa: 'Abrir no Google Maps <span aria-hidden="true">→</span>',
    });
    return `<li>${caminho}</li>`;
  }
  const fotos = (l.tipo === "link" ? l.fotos : [])
    .map((f) => imagem(f, { largura: 38, altura: 46, sizes: "38px", alt: "", carregamento: "lazy", larguras: LARGURA_MINIATURA }))
    .join("");
  const mini = fotos ? `<span class="rm-mini" aria-hidden="true">${fotos}</span>` : "";
  return `<li><a class="rm-linha"${destino}>${linha("→")}${mini}</a></li>`;
}

/** Itens numerados 01, 02… na ordem da página; o principal (carimbo) não leva número. */
function itens(c: ContextoRender): string {
  let n = 0;
  return c.links.map((v) => itemDaLista(v, c, v.principal ? "" : String(++n).padStart(2, "0"))).join("");
}

/** O "confere" do Romaneio: travessão no lugar do ícone, mesmas regras do `blocoConfere`. */
function confere(doc: DocumentoBio): string {
  const cf = doc.confere;
  if (!cf.ativo) return "";
  const cnpj = cnpjDaLoja(doc);
  const linhas: string[] = [];
  if (cf.razao && cnpj) {
    linhas.push(
      `<li><span aria-hidden="true">—</span><span>Pix só no nome <b>${escapeHtml(cf.razao)}</b><span class="rm-cnpj"><span>CNPJ ${cnpj}</span><button type="button" class="rm-copiar" data-copiar="${cf.cnpj}">Copiar CNPJ</button></span></span></li>`,
    );
  }
  for (const linha of cf.linhas) {
    if (linha.trim()) linhas.push(`<li><span aria-hidden="true">—</span><span>${escapeHtml(linha)}</span></li>`);
  }
  if (linhas.length === 0) return "";
  return `${CORTE}<section class="rm-confere" aria-labelledby="lk-confere"><h2 id="lk-confere">Antes de pagar, confere</h2><ul>${linhas.join("")}</ul></section>`;
}

/** Fim da nota: agradecimento, código de barras (decoração), @ e CNPJ. */
function fim(c: ContextoRender): string {
  const doc = c.d.documento;
  const insta = doc.perfil.instagram ? `<span>@${escapeHtml(doc.perfil.instagram)}</span>` : "";
  const cnpj = cnpjDaLoja(doc);
  return `${CORTE}<footer class="rm-fim"><strong>Obrigado pela preferência</strong><span class="rm-barras" aria-hidden="true"></span>${insta}${cnpj ? `<span>CNPJ ${cnpj}</span>` : ""}</footer>`;
}

function corpo(c: ContextoRender): string {
  const doc = c.d.documento;
  const p = doc.perfil;
  const h1 = `<h1 class="rm-nome">${conteudoDoH1(c, { classe: "rm-logo", largura: 150, altura: 67, sizes: "150px" })}</h1>`;
  const frase = p.frase ? `<p class="rm-frase">${escapeHtml(p.frase)}</p>` : "";
  const local = p.local ? `<p class="rm-local">${escapeHtml(p.local)}</p>` : "";
  const fatos = p.destaques.length
    ? `${CORTE}<ul class="rm-fatos">${p.destaques.map((t) => `<li>${icone("check")}<span>${destaqueHtml(t)}</span></li>`).join("")}</ul>`
    : "";
  const lista = c.links.length
    ? `${CORTE}<p class="rm-rotulo" aria-hidden="true"><span>Item</span><span>Abrir</span></p><ul class="rm-itens" aria-label="Links da ${escapeHtml(p.nome)}">${itens(c)}</ul>`
    : "";
  const papel = `<article class="rm-papel"><header class="rm-topo">${h1}${frase}${local}</header>${fatos}${lista}${confere(doc)}${fim(c)}</article>`;
  const feito = feitoComGirumo(c);
  return `<main class="rm"><div class="rm-sombra">${papel}</div>${feito ? `<footer class="rm-fora">${feito}</footer>` : ""}</main>`;
}

export const romaneio: ModeloRender = {
  fontes: FONTES_ROMANEIO,
  css: CSS_ROMANEIO,
  corDoTopo: (t) => t["--fundo2"] ?? "",
  fundoDoLogo: (t) => t["--papel"] ?? "",
  corpo,
};
```

- [ ] **Step 5: O mapa** — em `index.ts`, acrescentar `import { romaneio } from "./romaneio";` logo depois do import de `./partes` e, no mapa, trocar `romaneio: etiqueta,` por `romaneio,`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/romaneio.test.ts src/lib/bio/render/modelos.test.ts`
Expected: `ℹ pass 34`, `ℹ fail 0`. A pasta inteira (`--test "src/lib/bio/render/*.test.ts"`): `ℹ pass 106`. Par de contraste falhando: como no Step 7 da Task 2.

- [ ] **Step 7: Lint e tipos**

Run: `npx eslint src/lib/bio/render/romaneio.ts src/lib/bio/render/romaneio.test.ts src/lib/bio/render/modelos.test.ts src/lib/bio/render/index.ts` e depois `npx tsc --noEmit --project tsconfig.json`
Expected: nenhuma saída.

- [ ] **Step 8: Commit**

```bash
git add public/fonts/bio/ibm-plex-mono src/lib/bio/render/romaneio.ts src/lib/bio/render/romaneio.test.ts src/lib/bio/render/modelos.test.ts src/lib/bio/render/index.ts
git commit -m "feat(bio): Romaneio model with self-hosted IBM Plex Mono 400-700"
```

---

### Task 4: Conferência visual (Vitrine, Romaneio e o Etiqueta)

**Files:** nenhum no repo. O script fica no scratchpad da sessão (ou em `%TEMP%\bio-previa\`). É o `bio-previa.ts` da Task 6 do 3a com mais checagens: as 4 paletas, as famílias de cada modelo, o zoom de 200% do Vitrine, o anel fora da nota do Romaneio, a entrada que acaba e o toque que não a repete. A Parte 2 roda o mesmo.

- [ ] **Step 1: O Playwright está lá?** Em `apps/web`: `node -e "require.resolve('@playwright/test')"` não pode dar erro (o `npm ci` da Task 0 instala na raiz do worktree). O navegador de teste já está em `%LOCALAPPDATA%\ms-playwright`; se o script reclamar de executável, `npx playwright install chromium`.

- [ ] **Step 2: Escrever o script** — salvar como `<scratchpad>/bio-previa-3b.ts`:

```ts
// Conferência visual dos modelos do link da bio — FORA do repositório. Rodar em apps/web:
//   npx tsx <caminho>/bio-previa-3b.ts <modelo> [paleta]
// Sem paleta, passa pelas 4 do modelo. Serve o HTML com a CSP da superfície "bio" (spec §6),
// as fontes de public/ e fotos falsas; tira print em 390 e 320 px da página de exemplo e da
// cheia e reprova: CSP violada, rolagem lateral, fonte do modelo que não carregou, alvo < 44 px,
// animação com movimento reduzido, (Vitrine) texto do topo cortado com zoom de 200% e
// (Romaneio) anel de foco fora do papel que não é o --foco-fora. Com movimento ligado, na
// primeira paleta: a entrada termina (o pulso do Clássico para) e o toque no principal não faz
// a entrada tocar de novo. Mede também o HTML no pior caso do 3a (URLs no limite de 500).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";

import { PALETAS, type DadosRender, type Modelo } from "@/lib/bio/documento";
import { renderPaginaBio } from "@/lib/bio/render";
import { dadosCheios, dadosFalsos } from "@/test/bio-dados-falsos";

const { chromium } = createRequire(path.join(process.cwd(), "package.json"))("@playwright/test") as typeof import("@playwright/test");

const modelo = (process.argv[2] ?? "vitrine") as Modelo;
const paletas: readonly string[] = process.argv[3] ? [process.argv[3]] : PALETAS[modelo];
const FAMILIAS: Record<Modelo, string[]> = {
  etiqueta: ["Lexend"],
  vitrine: ["Jost", "Bodoni Moda"],
  romaneio: ["IBM Plex Mono"],
  classico: ["Manrope"],
};
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const CSP = `default-src 'none'; script-src 'self' 'nonce-${NONCE}'; style-src 'self' 'nonce-${NONCE}'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
const SAIDA = path.join(tmpdir(), "bio-previa", modelo);
const FOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#c9a27e"/><stop offset="1" stop-color="#4d6a89"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="360" r="140" fill="#f1e2d2"/><rect x="250" y="520" width="300" height="420" rx="40" fill="#2f3b4a"/></svg>`;
const logo = (cor: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="320"><text x="360" y="215" font-family="Arial" font-size="170" font-weight="700" text-anchor="middle" fill="${cor}">exemplo</text></svg>`;
const PUBLICA = { modo: "publica" as const, nonce: NONCE, animarEntrada: true };

function com(d: DadosRender, paleta: string): DadosRender {
  return { ...d, documento: { ...d.documento, modelo, paleta } };
}

/** O pior caso medido pelo 3a: a página cheia com as 17 URLs no limite de 500 e a mensagem do WhatsApp no de 300. */
function piorCaso(): DadosRender {
  const d = dadosCheios();
  const links = d.documento.links.map((l) => {
    if (l.tipo === "link") return { ...l, url: `${l.url.slice(0, 60)}?x=${"a".repeat(500)}`.slice(0, 500) };
    if (l.tipo === "whatsapp") return { ...l, mensagem: "Coleção de verão com peças à pronta-entrega e reposição toda semana ".repeat(6).slice(0, 300) };
    return l;
  });
  return { ...d, documento: { ...d.documento, links } };
}

/** Responde só por bio.local: a página com a CSP, as fontes de public/ e imagens falsas. */
async function servir(page: Page, html: string, erros: string[]) {
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(e.message));
  await page.route("http://bio.local/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ body: html, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP } });
    if (url.pathname.startsWith("/fonts/bio/")) return route.fulfill({ body: readFileSync(path.join("public", url.pathname)), headers: { "content-type": "font/woff2" } });
    if (url.pathname === "/_next/image") {
      const fonte = url.searchParams.get("url") ?? "";
      const corpo = fonte.includes("logo-clara") ? logo("#ffffff") : fonte.includes("logo") ? logo("#16304f") : FOTO;
      return route.fulfill({ body: corpo, headers: { "content-type": "image/svg+xml" } });
    }
    erros.push(`404 ${url.pathname}`);
    return route.fulfill({ status: 404, body: "" });
  });
}

/** Romaneio: o anel do "Feito com Girumo" (fora do papel) é o --foco-fora da paleta. */
async function focoFora(browser: Browser, paleta: string, falhas: string[]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const erros: string[] = [];
  await servir(page, renderPaginaBio(com(dadosFalsos(), paleta), PUBLICA), erros);
  await page.goto("http://bio.local/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".rm-fora .lk-feito").focus();
  const anel = await page.evaluate(() => {
    const raiz = document.querySelector<HTMLElement>(".lk");
    const feito = document.querySelector<HTMLElement>(".rm-fora .lk-feito");
    if (!raiz || !feito) return null;
    const hex = getComputedStyle(raiz).getPropertyValue("--foco-fora").trim();
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const s = getComputedStyle(feito);
    return { esperado: `rgb(${r}, ${g}, ${b})`, cor: s.outlineColor, estilo: s.outlineStyle };
  });
  if (!anel || anel.estilo !== "solid" || anel.cor !== anel.esperado) falhas.push(`${paleta}: anel fora do papel ${JSON.stringify(anel)}`);
  else console.log(`${paleta}: anel fora do papel ${anel.cor} = --foco-fora`);
  await page.locator(".rm-fora").screenshot({ path: path.join(SAIDA, `${paleta}-foco-fora.png`) });
  falhas.push(...erros.map((e) => `${paleta}/foco-fora: ${e}`));
  await ctx.close();
}

/** Com movimento ligado: a entrada acaba (nada rodando em 7 s) e o toque no principal não a repete. */
async function movimento(browser: Browser, paleta: string, falhas: string[]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const erros: string[] = [];
  await servir(page, renderPaginaBio(com(dadosFalsos(), paleta), PUBLICA), erros);
  await page.goto("http://bio.local/");
  const rodando = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running")
        .map((a) => (a instanceof CSSAnimation ? a.animationName : "transição")),
    );
  await page.waitForTimeout(7000);
  const depoisDaEntrada = await rodando();
  if (depoisDaEntrada.length) falhas.push(`movimento: ainda rodando 7 s depois de abrir: ${depoisDaEntrada.join(", ")}`);
  const principal = page.locator(".et-tag--prin, .vt-prin, .rm-carimbo, .cl-btn--prin").first();
  await principal.evaluate((el) => el.addEventListener("click", (e) => e.preventDefault()));
  await principal.click();
  await page.waitForTimeout(150);
  const noToque = await rodando();
  await page.screenshot({ path: path.join(SAIDA, `${paleta}-toque.png`) });
  await page.waitForTimeout(2000);
  const depoisDoToque = await rodando();
  if (depoisDoToque.length) falhas.push(`movimento: a entrada tocou de novo depois do toque: ${depoisDoToque.join(", ")}`);
  falhas.push(...erros.map((e) => `movimento: ${e}`));
  console.log(`movimento (${paleta}): no toque ${noToque.join(", ") || "nada"}; 2 s depois: ${depoisDoToque.join(", ") || "nada"}`);
  await ctx.close();
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const browser = await chromium.launch();
  const falhas: string[] = [];
  const pior = Buffer.byteLength(renderPaginaBio(com(piorCaso(), paletas[0]), PUBLICA));
  console.log(`${modelo}: pior caso ${pior} B`);
  if (pior > 40 * 1024) falhas.push(`pior caso com ${pior} B: passa de 40 KB`);
  for (const paleta of paletas) {
    for (const [nome, dados] of Object.entries({ exemplo: dadosFalsos(), cheia: dadosCheios() })) {
      const html = renderPaginaBio(com(dados, paleta), PUBLICA);
      writeFileSync(path.join(SAIDA, `${paleta}-${nome}.html`), html);
      console.log(`${paleta}/${nome}: HTML ${Buffer.byteLength(html)} B`);
      // 195 px de largura = a coluna de 390 px com zoom de 200%
      const larguras = modelo === "vitrine" && nome === "cheia" ? [390, 320, 195] : [390, 320];
      for (const largura of larguras) {
        const tag = `${paleta}/${nome}@${largura}`;
        const ctx = await browser.newContext({ viewport: { width: largura, height: largura === 195 ? 422 : 844 }, deviceScaleFactor: 2, reducedMotion: "reduce", hasTouch: true });
        const page = await ctx.newPage();
        const erros: string[] = [];
        await servir(page, html, erros);
        await page.goto("http://bio.local/");
        await page.evaluate(() => document.fonts.ready);
        await page.locator("summary").first().click();
        await page.evaluate(() => document.fonts.ready);
        const m = await page.evaluate((familias) => {
          const capa = document.querySelector(".vt-capa");
          const r = capa?.getBoundingClientRect();
          return {
            rolagemLateral: document.documentElement.scrollWidth > window.innerWidth,
            fontes: familias.filter((f) => ![...document.fonts].some((ff) => ff.family.replace(/"/g, "") === f && ff.status === "loaded")),
            fonteComErro: [...document.fonts].filter((f) => f.status === "error").map((f) => `${f.family} ${f.weight} ${f.style}`),
            animacoes: document.getAnimations().length,
            pequenos: [...document.querySelectorAll<HTMLElement>("a,button,summary")]
              .map((el) => ({ el, b: el.getBoundingClientRect() }))
              .filter(({ b }) => b.height > 0 && b.height < 44)
              .map(({ el, b }) => `${el.className} ${Math.round(b.height)}px`),
            cortado: r
              ? [...document.querySelectorAll(".vt-capa h1, .vt-capa p")]
                  .filter((el) => {
                    const b = el.getBoundingClientRect();
                    return b.top < r.top - 1 || b.bottom > r.bottom + 1;
                  })
                  .map((el) => el.className)
              : [],
          };
        }, FAMILIAS[modelo]);
        if (m.rolagemLateral && largura !== 195) falhas.push(`${tag}: rolagem lateral`);
        if (m.fontes.length) falhas.push(`${tag}: fonte que não carregou: ${m.fontes.join(", ")}`);
        if (m.fonteComErro.length) falhas.push(`${tag}: face com erro: ${m.fonteComErro.join(", ")}`);
        if (m.animacoes) falhas.push(`${tag}: ${m.animacoes} animação(ões) com movimento reduzido`);
        if (m.pequenos.length && largura !== 195) falhas.push(`${tag}: alvo < 44 px: ${m.pequenos.join(", ")}`);
        if (m.cortado.length) falhas.push(`${tag}: texto do topo cortado: ${m.cortado.join(", ")}`);
        falhas.push(...erros.map((e) => `${tag}: ${e}`));
        await page.screenshot({ path: path.join(SAIDA, `${paleta}-${nome}-${largura}.png`), fullPage: true });
        if (nome === "exemplo" && largura === 390) {
          await page.keyboard.press("Tab");
          await page.keyboard.press("Tab");
          await page.screenshot({ path: path.join(SAIDA, `${paleta}-foco.png`) });
        }
        await ctx.close();
      }
    }
    if (modelo === "romaneio") await focoFora(browser, paleta, falhas);
  }
  await movimento(browser, paletas[0], falhas);
  await browser.close();
  console.log(`prints em ${SAIDA}`);
  console.log(falhas.length ? `FALHAS:\n${falhas.join("\n")}` : "TUDO OK");
  process.exitCode = falhas.length ? 1 : 0;
}

void main();
```

Uma violação de CSP (um `style=` que escapou, um `<script>` sem nonce, fonte ou foto de fora) aparece como erro de console e reprova.

- [ ] **Step 3: Rodar** — em `apps/web`, um modelo por vez (o Etiqueta também: o rodapé dele mudou na Task 1):

```bash
npx tsx --tsconfig tsconfig.json "<scratchpad>/bio-previa-3b.ts" vitrine
npx tsx --tsconfig tsconfig.json "<scratchpad>/bio-previa-3b.ts" romaneio
npx tsx --tsconfig tsconfig.json "<scratchpad>/bio-previa-3b.ts" etiqueta
```

Expected (os bytes variam alguns bytes com o PR 2 e o 3a de verdade; com o 4b já em `main`, o JS tem 1 112 B e todo HTML sobe 206 B):
```
vitrine: pior caso 40684 B
papel/exemplo: HTML 20839 B
papel/cheia: HTML 32782 B
noite/exemplo: HTML 20839 B
noite/cheia: HTML 32782 B
rose/exemplo: HTML 20839 B
rose/cheia: HTML 32782 B
azul/exemplo: HTML 20839 B
azul/cheia: HTML 32782 B
movimento (papel): no toque vt-brilho; 2 s depois: nada
prints em C:\Users\Igor\AppData\Local\Temp\bio-previa\vitrine
TUDO OK
```
```
romaneio: pior caso 37488 B
kraft/exemplo: HTML 19444 B
kraft/cheia: HTML 29586 B
kraft: anel fora do papel rgb(0, 0, 0) = --foco-fora
caneta/exemplo: HTML 19444 B
caneta/cheia: HTML 29586 B
caneta: anel fora do papel rgb(255, 255, 255) = --foco-fora
nota/exemplo: HTML 19444 B
nota/cheia: HTML 29586 B
nota: anel fora do papel rgb(255, 255, 255) = --foco-fora
azul/exemplo: HTML 19444 B
azul/cheia: HTML 29586 B
azul: anel fora do papel rgb(255, 255, 255) = --foco-fora
movimento (kraft): no toque rm-recarimba; 2 s depois: nada
prints em C:\Users\Igor\AppData\Local\Temp\bio-previa\romaneio
TUDO OK
```
```
etiqueta: pior caso 39446 B
azul/exemplo: HTML 19896 B
azul/cheia: HTML 31544 B
rosa/exemplo: HTML 19896 B
rosa/cheia: HTML 31544 B
menta/exemplo: HTML 19896 B
menta/cheia: HTML 31544 B
grafite/exemplo: HTML 19896 B
grafite/cheia: HTML 31544 B
movimento (azul): no toque transição, et-balanca; 2 s depois: nada
prints em C:\Users\Igor\AppData\Local\Temp\bio-previa\etiqueta
TUDO OK
```

"pior caso … passa de 40 KB" na lista de falhas → ver "Riscos", item dos 40 KB.

- [ ] **Step 4: Olhar os prints** (`%TEMP%\bio-previa\<modelo>\`) ao lado de `Desktop\girumo-design-refs\link-da-bio\shots\Vitrine-1-topo.png`, `Vitrine-2-rolagem.png`, `Vitrine-3-rolagem.png`, `Romaneio-1-topo.png` e `Romaneio-2-rolagem.png`. Tem de bater:
  - **Vitrine** (`<paleta>-exemplo-390.png`): foto cheia no topo com a pílula escura do "onde fica", a logo e a frase grande em itálico (Bodoni) sobre o escuro da foto, a folha subindo por cima com cantos de 26 px, os destaques com o número em Bodoni na cor de acento, a pílula do WhatsApp com o círculo verde, as linhas com o quadrado do ícone e a seta, as 3 fotos do catálogo, o "Como chegar" aberto com a fachada e o botão de contorno do mapa, o confere em papel, o rodapé com o selo; `noite` toda escura. Diferenças **esperadas** (tabela de decisões): o alto da foto mais claro, a faixa do "onde fica" mais escura, a coluna parando em 520 px. `cheia-195.png` (zoom de 200%): o topo cresce com o texto, nada cortado.
  - **Romaneio**: o degradê da paleta, a nota com a borda serrilhada em cima e embaixo, o nome em caixa alta, os cortes tracejados, os destaques com ✓, "ITEM / ABRIR", o carimbo do WhatsApp torto (−2°) com o filete duplo, os itens 01, 02… com pontilhado e seta, o "Como chegar" aberto (linha invertida), o confere com travessão, o fim com "Obrigado pela preferência", código de barras, @ e CNPJ; o "Feito com Girumo" fora da nota numa pílula. `<paleta>-foco-fora.png`: anel preto no kraft e branco nas outras três.
  - **Todos**: em 320 px a página "cheia" quebra o título sem espaço e o @ comprido sem rolar de lado; `<paleta>-foco.png` com o anel visível no segundo item focado; `<paleta>-toque.png` com o brilho passando na pílula (Vitrine) ou o carimbo batendo de novo (Romaneio) e a pílula "Abrindo o WhatsApp…" embaixo.

- [ ] **Step 5: Anotar as medidas** para o corpo do PR: HTML de exemplo, da página cheia e do pior caso de cada modelo (o Lighthouse ≥ 90 da spec §11 só com a rota no ar: fica para a prova do §13).

---

### Task 5: Gate, PR, merge e card (Parte 1)

**Files:** nenhum.

- [ ] **Step 1: Gate da web** (em `apps/web`):

```bash
npm run lint
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm run painel:check
npm run brand:check
npm test
```

Expected: lint sem erro (e sem aviso nos arquivos novos); os dois `tsc` sem saída; `painel:check OK` (nada daqui está em `PAINEL_ROOTS`); `brand:check` verde (`lib/bio` não está nas raízes dele, e `#25D366` não é cor proibida); `npm test` com `fail 0`.

- [ ] **Step 2: Gate completo** (na raiz do worktree; Windows PowerShell 5.1: `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`).

Expected: `Verificacao local concluida com sucesso.`

- [ ] **Step 3: PR** — `git push -u origin feat/link-da-bio-pr3b-vitrine-romaneio`; PR "feat(bio): Vitrine and Romaneio models (link da bio, PR 3b part 1)" com: o que entra (dois modelos, `cnpjDaLoja`, o ajudante de contraste, 10 arquivos de fonte com os SHA-256 conferidos), que o Clássico continua no Etiqueta até a Parte 2, as medidas da Task 4, a tabela de decisões resumida (topo do Vitrine com `min-height`, véus de `.62`, `<ul>` e `h1` no Romaneio, selo com fundo fora da nota, `--foco-fora`, Copiar CNPJ de 44 px), e terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: CI verde → merge** (a `main` não tem proteção: o auto-merge do GitHub mergearia na hora, então é à mão, no verde):

```bash
gh pr checks <n> --watch
gh pr merge <n> --squash --delete-branch
```

- [ ] **Step 5: Card** (prod; mesmo jeito da Task 0):

```sql
select public.move_card('link-da-bio', 'em_construcao',
  'PR 3b parte 1: modelos Vitrine e Romaneio no renderizador, em main', 'PR #<n>');
update public.board_features
   set blocker = '<o blocker lido na Task 0, com "Clássico (3b parte 2)" no lugar do 3b>',
       updated_at = now()
 where key = 'link-da-bio';
```

(`move_card` não limpa o `blocker`; por isso o `update` à mão.)

- [ ] **Step 6: Fechar a parte** — `git worktree remove .claude/worktrees/link-da-bio-pr3b-1` e seguir para a Parte 2 na mesma sessão. Se a sessão acabar aqui, reportar "PRs que deixei abertos: nenhum" e que a Parte 2 (Clássico) não começou.

---

## Parte 2 — Clássico

Branch `feat/link-da-bio-pr3b-classico`, worktree `.claude/worktrees/link-da-bio-pr3b-2`.

### Task 6: Branch e pré-condições

**Files:** nenhum.

- [ ] **Step 1: A Parte 1 está em `main`?** Na raiz do checkout principal:

```bash
git fetch origin main
git log origin/main --oneline -3 -- apps/web/src/lib/bio/render/vitrine.ts apps/web/src/lib/bio/render/romaneio.ts
```

Expected: o commit da Parte 1. Vazio → parar.

- [ ] **Step 2: Worktree novo**

```bash
git worktree add -b feat/link-da-bio-pr3b-classico .claude/worktrees/link-da-bio-pr3b-2 origin/main
cd .claude/worktrees/link-da-bio-pr3b-2
npm ci
```

- [ ] **Step 3: Conferir** (em `apps/web`):

```bash
grep -n "classico: etiqueta" src/lib/bio/render/index.ts
grep -n "MODELOS_PRONTOS" src/lib/bio/render/modelos.test.ts
```

Expected: 1 linha no `index.ts` e 2 no `modelos.test.ts` (a declaração com `["etiqueta", "vitrine", "romaneio"]` e o `for`).

---

### Task 7: Modelo Clássico (Manrope)

**Files:**
- Create: `apps/web/public/fonts/bio/manrope/manrope-latin.woff2`, `apps/web/public/fonts/bio/manrope/OFL.txt`
- Create: `apps/web/src/lib/bio/render/classico.ts`
- Modify: `apps/web/src/lib/bio/render/index.ts` (import, a entrada `classico` e o comentário que sai)
- Modify: `apps/web/src/lib/bio/render/modelos.test.ts` (os 4 modelos)
- Test: `apps/web/src/lib/bio/render/classico.test.ts`

**Interfaces:**
- Consumes: o mesmo da Task 2 (inclusive `blocoConfere`, `detalhesDoEndereco` e `LARGURA_MINIATURA`; não usa `conteudoDoH1`: o `h1` é o nome em texto), o ajudante `bio-contraste.ts` e `cnpjDaLoja` (Parte 1); `MODELOS` (PR 2).
- Produces: `CSS_CLASSICO: string` e `classico: ModeloRender` (`classico.ts`); o mapa completo.

- [ ] **Step 1: A fonte** (Git Bash, em `apps/web`) — cópia dos `src/fonts/manrope/` (spec §3):

```bash
mkdir -p public/fonts/bio/manrope
cp src/fonts/manrope/manrope-latin.woff2 src/fonts/manrope/OFL.txt public/fonts/bio/manrope/
sha256sum public/fonts/bio/manrope/manrope-latin.woff2 public/fonts/bio/manrope/OFL.txt
```

Expected:
```
e310b55a7fd9677f5e3555e6c6c4d064fa1f1d24393f0ddbe217cea12a8c432f *public/fonts/bio/manrope/manrope-latin.woff2
4b8929f05a122b7abb9059501dc7dc4df86f8c97d5a1769d60d82cf2d2795dde *public/fonts/bio/manrope/OFL.txt
```

(24 576 bytes; o `OFL.txt` começa com `Copyright 2018 The Manrope Project Authors`.)

- [ ] **Step 2: Write the failing tests** — criar `apps/web/src/lib/bio/render/classico.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { coresDoModelo, type TokensBio } from "@/lib/bio/cores";
import { PALETAS, type DadosRender, type DocumentoBio } from "@/lib/bio/documento";
import { falhas, hexLiterais, keyframes, mistura, regras, sorteio, variaveisLidas, type Par } from "@/test/bio-contraste";
import { IDS, dadosFalsos } from "@/test/bio-dados-falsos";
import { CSS_CLASSICO } from "./classico";
import { renderPaginaBio } from "./index";
import { CSS_BASE, tokensValidos } from "./partes";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const tokens = (paleta: string, cores: DocumentoBio["cores"] = null) => tokensValidos(coresDoModelo("classico", paleta, cores));
const pagina = (perfil: Partial<DocumentoBio["perfil"]> = {}): string => {
  const d: DadosRender = dadosFalsos();
  const documento = { ...d.documento, modelo: "classico" as const, paleta: "claro", perfil: { ...d.documento.perfil, ...perfil } };
  return renderPaginaBio({ ...d, documento }, { modo: "publica", nonce: NONCE, animarEntrada: true });
};

/** Todo par de cor que o CSS do Clássico desenha. */
function pares(t: TokensBio): Par[] {
  const c = (nome: string) => t[`--${nome}`];
  return [
    [c("on"), c("fundo2"), 4.5, "nome e frase"],
    [c("on2"), c("fundo2"), 4.5, "@ e rodapé"],
    [c("on"), c("chip"), 4.5, "destaque"],
    [c("acento"), c("chip"), 4.5, "número do destaque"],
    [c("tinta"), c("cartao"), 4.5, "botão"],
    [c("tinta2"), c("cartao"), 4.5, "subtítulo do botão"],
    [c("seta"), c("cartao"), 3, "seta"],
    [c("ico"), c("icobg"), 3, "ícone"],
    [c("printinta"), c("prin"), 4.5, "botão principal (título, subtítulo e seta) e Abrir no Google Maps"],
    [c("printinta"), mistura(c("prin"), "#000000", 0.12), 3, "ícone do principal (véu preto de 12%)"],
    [c("tinta"), c("papel"), 4.5, "Como chegar, confere, anel de foco neles e o aviso #lk-status"],
    [c("tinta2"), c("papel"), 4.5, "horário"],
    [c("ico"), c("papel"), 4.5, "título e ícones do confere"],
    [c("tinta"), c("icobg"), 4.5, "Copiar CNPJ"],
    [c("foco"), c("fundo2"), 3, "anel de foco"],
  ];
}

test("as 4 paletas do Clássico passam em todo par que o modelo desenha", () => {
  for (const paleta of PALETAS.classico) assert.deepEqual(falhas(pares(tokens(paleta))), [], paleta);
});

test("cores da marca: 500 pares sorteados passam em todo par", () => {
  const hex = sorteio(20261019);
  const ruins: string[] = [];
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: hex(), botao: hex() };
    const f = falhas(pares(tokens("marca", cores)));
    if (f.length) ruins.push(`${cores.fundo}/${cores.botao}: ${f.join("; ")}`);
  }
  assert.deepEqual(ruins.slice(0, 5), []);
});

test("toda variável que o CSS lê existe nas 4 paletas e na marca", () => {
  const usadas = variaveisLidas(`${CSS_BASE}${CSS_CLASSICO}`);
  assert.ok(usadas.includes("anel"));
  for (const paleta of [...PALETAS.classico, "marca"]) {
    const t = tokens(paleta, paleta === "marca" ? { fundo: "#3A80BF", botao: "#F28C28" } : null);
    assert.deepEqual(usadas.filter((v) => !(`--${v}` in t)), [], paleta);
  }
});

test("o pulso do principal dá no máximo 2 voltas e só mexe em transform e opacity", () => {
  const regra = /\.lk-entra \.cl-btn--prin::after\{animation:cl-pulso ([^}]+)\}/.exec(CSS_CLASSICO)?.[1] ?? "";
  const voltas = regra.split(" ").find((p) => /^(?:\d+|infinite)$/.test(p));
  assert.equal(voltas, "2");
  const corpo = keyframes(CSS_CLASSICO)["cl-pulso"] ?? "";
  const propriedades = new Set([...corpo.matchAll(/([a-z-]+):/g)].map((m) => m[1]));
  assert.deepEqual([...propriedades].sort(), ["opacity", "transform"]);
});

test("foto redonda: zoom de 2,2× em volta do ponto de foco", () => {
  assert.match(CSS_CLASSICO, /\.cl-avatar img\{[^}]*object-fit:cover;transform:scale\(2\.2\)\}/);
  const html = pagina();
  assert.match(html, /<div class="cl-avatar"><img class="lk-f-50-30" src="[^"]*capa-falsa[^"]*" srcset="[^"]*384w[^"]*640w[^"]*828w" sizes="238px" width="108" height="108" alt="Fachada da loja de exemplo" fetchpriority="high" decoding="async"><\/div>/);
  assert.match(html, /\.lk \.lk-f-50-30\{object-position:50% 30%;transform-origin:50% 30%\}/);
  assert.doesNotMatch(pagina({ capa: null }), /cl-avatar"|fetchpriority/);
});

test("nada de opacity em texto: só o anel do pulso e as entradas, que terminam em 1", () => {
  assert.deepEqual(regras(CSS_CLASSICO).filter(([, d]) => /opacity/.test(d)).map(([s]) => s), [".cl-btn--prin::after"]);
  const comFade = Object.entries(keyframes(CSS_CLASSICO)).filter(([, corpo]) => /opacity/.test(corpo));
  assert.deepEqual(comFade.map(([nome]) => nome), ["cl-pop", "cl-sobe", "cl-pulso"]);
  for (const [nome, corpo] of comFade) if (nome !== "cl-pulso") assert.match(corpo, /to\{opacity:1;/);
});

test("cor de paleta só por var(--…): hex literal só no verde do WhatsApp", () => {
  assert.deepEqual(hexLiterais(CSS_CLASSICO), ["#25D366", "#fff"]);
});

test("tudo que mexe fica em no-preference; o toque não depende da entrada", () => {
  const [antes, depois] = CSS_CLASSICO.split("@media (prefers-reduced-motion:no-preference){");
  assert.ok(depois);
  assert.doesNotMatch(antes, /animation|transition/);
  assert.match(depois, /\.cl-btn:active,\.cl-btn\.lk-toque\{transform:scale\(\.97\)\}/);
  assert.match(depois, /\.cl-lista>li:nth-child\(2\)\{animation-delay:305ms\}/);
});

test("alvo de toque ≥ 44 px", () => {
  assert.match(CSS_CLASSICO, /\.cl-btn\{[^}]*min-height:64px/);
  assert.match(CSS_CLASSICO, /\.cl-mapa\{[^}]*min-height:48px/);
  assert.match(CSS_CLASSICO, /\.cl-copiar\{[^}]*min-height:44px/);
});

test("uma fonte: Manrope variável, com preload", () => {
  const html = pagina();
  assert.equal(html.match(/rel="preload"/g)?.length, 1);
  assert.match(html, /<link rel="preload" href="\/fonts\/bio\/manrope\/manrope-latin\.woff2" as="font" type="font\/woff2" crossorigin>/);
  assert.match(html, /@font-face\{font-family:"Manrope";font-style:normal;font-weight:200 800;font-display:swap;/);
});

test("o h1 é o nome em texto (a logo não entra), com o @ e a frase em <p> logo abaixo", () => {
  const html = pagina();
  assert.match(html, /<h1 class="cl-nome cl-sobe">Ateliê Exemplo Kids<\/h1><p class="cl-arroba cl-sobe">@atelie\.exemplo<\/p><p class="cl-frase cl-sobe">Kits de roupa infantil/);
  assert.doesNotMatch(html, /logo-(?:clara|escura)-falsa[^"]*"[^>]*alt=/);
});

test("botões em pílula: principal com o anel, catálogo com as capinhas e o endereço abre ali mesmo", () => {
  const html = pagina();
  assert.match(html, /<a class="cl-btn cl-btn--prin" href="https:\/\/wa\.me\/5562900000000\?text=[^"]+" data-link="[^"]+" data-tipo="whatsapp"><span class="cl-ico cl-ico--zap">/);
  assert.match(html, new RegExp(`<a class="cl-btn" href="https://exemplo\\.com\\.br/catalogo" data-link="${IDS.catalogo}" data-tipo="link"><span class="cl-capas" aria-hidden="true"><img src="[^"]*kit-1-falso[^"]*w=128&amp;q=75" width="30" height="30" alt="" loading="lazy"`));
  assert.match(html, /<details class="cl-abre"><summary class="cl-btn" data-link="[^"]+" data-tipo="endereco"><span class="cl-ico">/);
  assert.match(html, /<a class="cl-mapa" href="https:\/\/www\.google\.com\/maps\/[^"]+"><svg/);
  assert.match(html, /<footer class="cl-rodape"><small>Ateliê Exemplo Kids · CNPJ 11\.222\.333\/0001-81<\/small><a class="lk-feito"/);
});
```

e, em `modelos.test.ts`, passar a cobrir os 4: no import do PR 2 trocar `import { PALETAS, documentoPadrao, type DadosRender, type Modelo } from "@/lib/bio/documento";` por

```ts
import { MODELOS, PALETAS, documentoPadrao, type DadosRender, type Modelo } from "@/lib/bio/documento";
```

apagar as duas linhas de `MODELOS_PRONTOS` (o comentário e a `const`) e trocar `for (const modelo of MODELOS_PRONTOS) {` por `for (const modelo of MODELOS) {`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/classico.test.ts src/lib/bio/render/modelos.test.ts`
Expected: FAIL — `Error: Cannot find module './classico'` e `✖ classico: um h1 com o nome (ou a logo com alt = nome)…` (o Etiqueta desenhando a paleta do Clássico sai sem `theme-color`); `ℹ pass 27`, `ℹ fail 2`.

- [ ] **Step 4: Implement** — criar `apps/web/src/lib/bio/render/classico.ts`:

```ts
/**
 * Modelo Clássico: o formato que todo mundo conhece do link da bio — foto
 * redonda, nome, @, botões em pílula —, com um anel pulsando no principal.
 * Valores do mockup (Main.dc.html, prefixo `cl-`) com as regras da revisão: o
 * pulso anima só transform/opacity e dá no máximo 2 voltas, a foto redonda tem
 * zoom de 2,2× em volta do ponto de foco, sem opacity em texto, alvos ≥ 44 px,
 * h1 = nome da loja, nada de style=.
 */
import { escapeHtml } from "@/lib/campaigns/entry-page";
import type { ContextoRender, FonteDoModelo, LinkVisivel, ModeloRender } from "./modelo";
import {
  LARGURA_MINIATURA,
  atrasos,
  blocoConfere,
  cnpjDaLoja,
  dadosDoLink,
  destaqueHtml,
  detalhesDoEndereco,
  feitoComGirumo,
  hrefAttr,
  icone,
  imagem,
} from "./partes";

const FONTES_CLASSICO: readonly FonteDoModelo[] = [
  { familia: "Manrope", arquivo: "manrope/manrope-latin.woff2", peso: "200 800", estilo: "normal" },
];

/** 108 px de círculo com zoom de 2,2×: o que aparece pede ~238 px de imagem. */
const SIZES_AVATAR = "238px";
const SIZES_CAMINHO = "(max-width: 476px) calc(100vw - 64px), 412px";

export const CSS_CLASSICO = [
  '.lk{font-family:"Manrope",system-ui,sans-serif}',
  ".cl{background:var(--fundo2);color:var(--on);font-size:16px;line-height:1.45;padding:36px 18px 32px}",
  ".cl-col{max-width:440px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center;gap:10px}",
  ".cl-avatar{width:108px;height:108px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 3px var(--fundo2),0 0 0 6px var(--anel);margin-bottom:8px;background:var(--fundo3)}",
  // o zoom cresce em volta do foco: a classe lk-f-X-Y dá object-position e transform-origin
  ".cl-avatar img{width:100%;height:100%;object-fit:cover;transform:scale(2.2)}",
  ".cl-nome{font-size:21px;font-weight:800;letter-spacing:-.015em;line-height:1.2}",
  ".cl-arroba{font-size:14px;font-weight:600;color:var(--on2)}",
  ".cl-frase{font-size:15px;line-height:1.5;max-width:32ch}",
  ".cl-fatos{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:4px}",
  ".cl-fatos li{font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:999px;background:var(--chip);border:1px solid var(--chipbd)}",
  ".cl-fatos b{color:var(--acento);font-weight:800}",
  ".cl-lista{width:100%;display:grid;gap:12px;margin-top:14px}",
  ".cl-btn{position:relative;display:grid;grid-template-columns:48px minmax(0,1fr) 48px;align-items:center;gap:6px;min-height:64px;padding:8px;border-radius:999px;background:var(--cartao);color:var(--tinta);text-decoration:none;box-shadow:0 1px 2px rgb(0 0 0 / .06),0 10px 24px -18px rgb(0 0 0 / .5);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  ".cl-ico{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--icobg);color:var(--ico)}",
  ".lk .cl-ico--zap{background:#25D366;color:#fff}",
  ".cl-txt{display:grid;gap:1px;justify-items:center;min-width:0}",
  ".cl-rot{font-size:16px;font-weight:700;line-height:1.25}",
  ".cl-sub{font-size:12.5px;font-weight:500;color:var(--tinta2);line-height:1.3}",
  ".cl-btn--prin{isolation:isolate;background:var(--prin);color:var(--printinta)}",
  ".cl-btn--prin .cl-sub,.cl-btn--prin .cl-dir{color:var(--printinta)}",
  ".cl-btn--prin .cl-ico{background:rgb(0 0 0 / .12);color:var(--printinta)}",
  // o anel do pulso: uma cópia da pílula atrás dela, que cresce e some (só transform/opacity)
  '.cl-btn--prin::after{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--prin);opacity:0;pointer-events:none}',
  ".cl-capas{display:flex;justify-self:center}",
  ".cl-capas img{width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid var(--cartao);margin-left:-14px}",
  ".cl-capas img:first-child{margin-left:0}",
  ".cl-dir{display:grid;place-items:center;color:var(--seta)}",
  ".cl-abre[open] .cl-dir svg{transform:rotate(90deg)}",
  ".cl-caminho{margin-top:10px;background:var(--papel);color:var(--tinta);border-radius:22px;padding:14px;display:grid;gap:12px;text-align:left}",
  ".cl-caminho img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:50% 30%;border-radius:14px}",
  ".cl-caminho address{font-style:normal;font-size:14px;line-height:1.5;white-space:pre-line}",
  ".cl-hora{font-size:13px;color:var(--tinta2)}",
  ".cl-mapa{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:999px;background:var(--prin);color:var(--printinta);font-weight:700;text-decoration:none}",
  ".cl-mapa svg.i{width:18px;height:18px}",
  ".cl-confere{width:100%;margin-top:6px;text-align:left;background:var(--papel);color:var(--tinta);border-radius:22px;padding:18px;display:grid;gap:12px;box-shadow:0 10px 24px -20px rgb(0 0 0 / .5)}",
  ".cl-confere h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--ico)}",
  ".cl-confere ul{display:grid;gap:10px}",
  ".cl-confere li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;font-size:14.5px;line-height:1.45}",
  ".cl-confere li svg.i{width:20px;height:20px;color:var(--ico);margin-top:1px}",
  ".cl-confere b{font-weight:700}",
  ".cl-cnpj{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}",
  ".cl-cnpj>span{font-variant-numeric:tabular-nums;font-weight:700}",
  ".cl-copiar{font-size:12.5px;font-weight:700;color:var(--tinta);background:var(--icobg);border:0;border-radius:999px;min-height:44px;padding:0 14px;cursor:pointer}",
  ".cl-confere :focus-visible,.cl-caminho :focus-visible{outline-color:var(--tinta)}",
  ".cl-rodape{display:grid;justify-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--on2)}",
  ".cl-rodape small{font-size:11.5px}",
  "@media (prefers-reduced-motion:no-preference){",
  ".cl-btn{transition:transform .18s cubic-bezier(.22,1,.36,1)}",
  ".cl-btn:active,.cl-btn.lk-toque{transform:scale(.97)}",
  ".cl-dir svg{transition:transform .3s cubic-bezier(.22,1,.36,1)}",
  ".lk-entra .cl-avatar{animation:cl-pop .8s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .cl-sobe{animation:cl-sobe .6s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .cl-sobe:nth-child(3){animation-delay:60ms}",
  ".lk-entra .cl-sobe:nth-child(4){animation-delay:120ms}",
  ".lk-entra .cl-sobe:nth-child(5){animation-delay:180ms}",
  ".lk-entra .cl-lista>li{animation:cl-sobe .55s cubic-bezier(.16,1,.3,1) both}",
  atrasos(".cl-lista>li", 250, 55),
  ".lk-entra .cl-btn--prin::after{animation:cl-pulso 2.2s 1.1s ease-out 2}",
  "}",
  "@keyframes cl-pop{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:none}}",
  "@keyframes cl-sobe{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}",
  "@keyframes cl-pulso{from{opacity:.55;transform:none}to{opacity:0;transform:scale(1.09,1.5)}}",
].join("");

function botao(v: LinkVisivel, c: ContextoRender): string {
  const l = v.link;
  const sub = l.sub ? `<span class="cl-sub">${escapeHtml(l.sub)}</span>` : "";
  const texto = `<span class="cl-txt"><span class="cl-rot">${escapeHtml(l.titulo)}</span>${sub}</span>`;
  const dir = `<span class="cl-dir">${icone("seta")}</span>`;
  const ico = `<span class="cl-ico${l.icone === "whatsapp" ? " cl-ico--zap" : ""}">${icone(l.icone)}</span>`;
  if (l.tipo === "endereco") {
    return detalhesDoEndereco(v, c, {
      prefixo: "cl",
      classeDoResumo: "cl-btn",
      resumo: `${ico}${texto}${dir}`,
      foto: { largura: 640, altura: 400, sizes: SIZES_CAMINHO },
    });
  }
  const fotos = (l.tipo === "link" ? l.fotos : [])
    .map((f) => imagem(f, { largura: 30, altura: 30, sizes: "30px", alt: "", carregamento: "lazy", larguras: LARGURA_MINIATURA }))
    .join("");
  const lado = fotos ? `<span class="cl-capas" aria-hidden="true">${fotos}</span>` : ico;
  return `<a class="cl-btn${v.principal ? " cl-btn--prin" : ""}"${hrefAttr(v.href, c.modo)}${dadosDoLink(v)}>${lado}${texto}${dir}</a>`;
}

function rodape(c: ContextoRender): string {
  const cnpj = cnpjDaLoja(c.d.documento);
  const linhaDoCnpj = cnpj ? `<small>${escapeHtml(c.d.documento.perfil.nome)} · CNPJ ${cnpj}</small>` : "";
  const feito = feitoComGirumo(c);
  return linhaDoCnpj || feito ? `<footer class="cl-rodape">${linhaDoCnpj}${feito}</footer>` : "";
}

function corpo(c: ContextoRender): string {
  const doc = c.d.documento;
  const p = doc.perfil;
  const foto = p.capa
    ? imagem(p.capa, { largura: 108, altura: 108, sizes: SIZES_AVATAR, alt: p.capaAlt, carregamento: "prioridade" })
    : "";
  const avatar = foto ? `<div class="cl-avatar">${foto}</div>` : "";
  const arroba = p.instagram ? `<p class="cl-arroba cl-sobe">@${escapeHtml(p.instagram)}</p>` : "";
  const frase = p.frase ? `<p class="cl-frase cl-sobe">${escapeHtml(p.frase)}</p>` : "";
  const fatos = p.destaques.length
    ? `<ul class="cl-fatos cl-sobe">${p.destaques.map((t) => `<li>${destaqueHtml(t)}</li>`).join("")}</ul>`
    : "";
  const lista = c.links.length
    ? `<ul class="cl-lista" aria-label="Links da ${escapeHtml(p.nome)}">${c.links.map((v) => `<li>${botao(v, c)}</li>`).join("")}</ul>`
    : "";
  return `<main class="cl"><div class="cl-col">${avatar}<h1 class="cl-nome cl-sobe">${escapeHtml(p.nome)}</h1>${arroba}${frase}${fatos}${lista}${blocoConfere(doc, "cl")}${rodape(c)}</div></main>`;
}

export const classico: ModeloRender = {
  fontes: FONTES_CLASSICO,
  css: CSS_CLASSICO,
  corDoTopo: (t) => t["--fundo2"] ?? "",
  fundoDoLogo: (t) => t["--fundo2"] ?? "",
  corpo,
};
```

- [ ] **Step 5: O mapa** — em `index.ts`, acrescentar `import { classico } from "./classico";` logo antes de `import { etiqueta } from "./etiqueta";`, apagar o comentário `/** Os modelos ainda sem módulo próprio desenham com o Etiqueta. */` e deixar o mapa assim:

```ts
const MODELOS_RENDER: Record<Modelo, ModeloRender> = {
  etiqueta,
  vitrine,
  romaneio,
  classico,
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/classico.test.ts src/lib/bio/render/modelos.test.ts`
Expected: `ℹ pass 40`, `ℹ fail 0`. A pasta inteira (`--test "src/lib/bio/render/*.test.ts"`): `ℹ pass 125`. Par de contraste falhando: como no Step 7 da Task 2.

- [ ] **Step 7: Lint e tipos**

Run: `npx eslint src/lib/bio/render/classico.ts src/lib/bio/render/classico.test.ts src/lib/bio/render/modelos.test.ts src/lib/bio/render/index.ts` e depois `npx tsc --noEmit --project tsconfig.json`
Expected: nenhuma saída.

- [ ] **Step 8: Commit**

```bash
git add public/fonts/bio/manrope src/lib/bio/render/classico.ts src/lib/bio/render/classico.test.ts src/lib/bio/render/modelos.test.ts src/lib/bio/render/index.ts
git commit -m "feat(bio): Classico model with self-hosted Manrope"
```

---

### Task 8: Conferência visual do Clássico e as medidas

**Files:** nenhum no repo (o script da Task 4).

- [ ] **Step 1: Rodar** — em `apps/web`: `npx tsx --tsconfig tsconfig.json "<scratchpad>/bio-previa-3b.ts" classico`

Expected:
```
classico: pior caso 37748 B
claro/exemplo: HTML 17950 B
claro/cheia: HTML 29846 B
escuro/exemplo: HTML 17949 B
escuro/cheia: HTML 29845 B
lavanda/exemplo: HTML 17950 B
lavanda/cheia: HTML 29846 B
azul/exemplo: HTML 17949 B
azul/cheia: HTML 29845 B
movimento (claro): no toque transição; 2 s depois: nada
prints em C:\Users\Igor\AppData\Local\Temp\bio-previa\classico
TUDO OK
```

"nada" 7 s depois de abrir prova que o pulso parou nas 2 voltas; "2 s depois: nada", que o toque não refez a entrada. Os outros três modelos não mudam nesta parte (os números da Task 4 valem).

- [ ] **Step 2: Olhar os prints** ao lado de `shots\Classico-1-topo.png` e `Classico-2-rolagem.png`: a foto redonda com o anel duplo (fundo e `--anel`) e o zoom de 2,2× centrado no ponto de foco, o nome em negrito, o @, a frase, os destaques em pílula, os botões em pílula com o ícone num círculo à esquerda e a seta à direita, o principal escuro (`claro`) ou amarelo (`escuro`) com o círculo verde do WhatsApp, as capinhas sobrepostas no catálogo, o "Como chegar" aberto em papel com o botão cheio do mapa, o confere em papel e o rodapé. `azul`: anel de foco branco (decisão 1 do PR 2).

- [ ] **Step 3: As medidas para o corpo do PR**

| Modelo | Exemplo | Página cheia (20 links) | Pior caso (URLs de 500) |
|---|---|---|---|
| Etiqueta (3a) | 19 896 B | 31 544 B | 39 446 B |
| Vitrine | 20 839 B | 32 782 B | 40 684 B |
| Romaneio | 19 444 B | 29 586 B | 37 488 B |
| Clássico | 17 950 B | 29 846 B | 37 748 B |

JS inline: 906 B (3a; 1 112 B com o 4b).

---

### Task 9: Gate, PR, merge e card (Parte 2)

**Files:** nenhum.

- [ ] **Step 1: Gate da web e gate completo** — os mesmos comandos dos Steps 1 e 2 da Task 5, com o mesmo Expected.

- [ ] **Step 2: PR** — `git push -u origin feat/link-da-bio-pr3b-classico`; PR "feat(bio): Classico model (link da bio, PR 3b part 2)" com: o Clássico (pulso por `transform`/`opacity` em 2 voltas, zoom de 2,2× no foco, `h1` em texto), a Manrope com o SHA-256, a tabela de medidas da Task 8, o "TUDO OK", e terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: CI verde → merge**

```bash
gh pr checks <n> --watch
gh pr merge <n> --squash --delete-branch
```

- [ ] **Step 4: Card** (prod):

```sql
select public.move_card('link-da-bio', 'em_construcao',
  'PR 3b parte 2: modelo Clássico; os 4 modelos no renderizador, em main', 'PR #<n>');
update public.board_features
   set blocker = '<o blocker atual sem o Clássico/3b na lista do que falta>',
       updated_at = now()
 where key = 'link-da-bio';
```

- [ ] **Step 5: Grafo** — sugerir ao Igor (PowerShell): `rag insert "decisão: link da bio PR 3b — Vitrine, Romaneio e Clássico em lib/bio/render como ModeloRender; topo do Vitrine com min-height e texto no fluxo; serrilha do Romaneio no ::before e --foco-fora só fora da nota; pulso do Clássico por transform/opacity em 2 voltas; fontes do Google para macOS por URL fixa com SHA-256; peça comum cnpjDaLoja" --source decisao-2026-10-19`.

- [ ] **Step 6: Fechar** — `git worktree remove .claude/worktrees/link-da-bio-pr3b-2` e reportar "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite do PR

**Parte 1**
- `vitrine` e `romaneio` com módulo próprio no `MODELOS_RENDER`; `classico` ainda no Etiqueta; `cnpjDaLoja` em `partes.ts`, usada pelo Etiqueta.
- 48 testes novos passando (`partes` 1, `vitrine` 13, `romaneio` 13, `modelos` 21) e a suíte inteira verde.
- Página cheia (20 links) ≤ 40 KB nos dois (32 782 B e 29 586 B) e o pior caso também (40 684 B e 37 488 B); JS sem mudança.
- Conferência "TUDO OK" nas 4 paletas do Vitrine, do Romaneio e do Etiqueta: sem violação de CSP, sem rolagem lateral em 390 e 320 px, fontes do modelo carregadas, alvos ≥ 44 px, nada animando com movimento reduzido, topo do Vitrine inteiro com zoom de 200%, anel fora da nota = `--foco-fora`, entrada que acaba e toque que não a repete; prints batendo com o mockup, menos as diferenças da tabela de decisões.
- Nenhum `style=`; prévia sem `<script>` e sem `href`; nenhum texto do lojista vira HTML (todos os campos).
- Os 10 arquivos de fonte com os SHA-256 das Tasks 2 e 3.
- `verify-local.ps1` verde, CI verde, mergeado na mesma sessão, card movido e `blocker` reescrito.

**Parte 2**
- `classico` com módulo próprio; `modelos.test.ts` cobrindo os 4 (`MODELOS`).
- 19 testes novos (`classico` 12, `modelos` 7); 125 na pasta `render`; suíte verde.
- Página cheia 29 846 B, pior caso 37 748 B; conferência "TUDO OK" nas 4 paletas, com o pulso parando nas 2 voltas.
- `manrope-latin.woff2` e `OFL.txt` com os SHA-256 da Task 7.
- `verify-local.ps1` verde, CI verde, mergeado, card movido, worktrees removidos.

## Comandos de verificação

```bash
# em apps/web do worktree da parte
npx tsx --import ./src/test/server-only-shim.mjs --test "src/lib/bio/render/*.test.ts"   # 106 na Parte 1, 125 na Parte 2
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm run lint
npm run painel:check
npm run brand:check
npm test
npx tsx --tsconfig tsconfig.json "<scratchpad>/bio-previa-3b.ts" vitrine    # e romaneio, etiqueta (Parte 1) / classico (Parte 2)
sha256sum public/fonts/bio/*/*.woff2                                        # hashes das Tasks 2, 3 e 7 (e a Lexend do 3a)
# na raiz do worktree
powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1
```

## Riscos e pontos de atenção

- **Contraste depende do PR 2.** Os pares de cada modelo foram conferidos contra o `coresDoModelo` do plano do PR 2 (as 12 paletas prontas destes modelos e 500 pares sorteados por modelo). Se o PR 2 mudar, o teste diz o par: corrigir no `cores.ts` (o par entra no `PARES_DE_CONTRASTE`, que passa tudo por `garante`), nunca afrouxando o mínimo. Dois pares deste plano não estão na lista do PR 2 e passam por folga: o ícone sobre o círculo translúcido do principal (Vitrine: `--printinta` sobre `--prin` com 14% de branco; Clássico: com 12% de preto). Se a derivação das cores da marca mudar, são os primeiros a cair.
- **CNPJ alfanumérico.** O PR 2 aceita (decisão 6; spec §4 e §9) e o 3a já entra com a `CNPJ` alfanumérica (`^[0-9A-Z]{12}\d{2}$`, exportada). `cnpjDaLoja` e o confere do Romaneio seguem a constante, então os 4 modelos mostram o CNPJ com letras formatado (`12.ABC.345/01DE-35`). Os testes daqui usam o CNPJ de dígitos da loja fictícia; o de letras já está coberto no `partes.test.ts` do 3a.
- **40 KB no pior caso do Vitrine.** 40 684 B com o JS do 3a (276 B de folga); com o JS do 4b (1 112 B), ~40 890 B (70 B). O script reprova acima de 40 960 B; se reprovar, tirar o `-webkit-backdrop-filter`/`backdrop-filter` do `.vt-onde` (~60 B; o véu de `.62` já garante o contraste) e depois a regra de `:hover` (~110 B), e dizer no PR. Com os dois rastreadores do PR 7 (JS de 2 060 B) esse pior caso artificial passa de 40 KB (~41,8 KB); a página cheia realista fica em ~33,9 KB.
- **`:is()` na inversão do Romaneio** (Safari 14+, Chrome 88+): navegador sem `:is()` perde só a cor do número e do subtítulo na linha pressionada (`--tinta2` sobre `--tinta` por um instante).
- **Fontes por URL fixa.** As do `fonts.gstatic.com` são versionadas (`v20`, `v28`); se uma sair do ar, refazer pelo CSS2 com UA de macOS (Step 1 da Task 2) e conferir o print. A Lexend do 3a veio do fontsource (a versão com hinting, praticamente o mesmo tamanho); as deste PR seguem o método dos `src/fonts`. Não mexi na do 3a.
- **Cache da fonte.** `public/` sai sem cache longo (3a): o Vitrine revalida 58 KB e o Romaneio 40 KB de fonte a cada visita (304). O `Cache-Control: public, max-age=31536000, immutable` em `/fonts/bio/:path*` (sugerido ao 4a) vale para os 4 modelos.
- **Clássico:** a logo não aparece (o `h1` é o nome); os atrasos de `.cl-sobe:nth-child(3…5)` contam o avatar — sem foto, andam uma posição (só a entrada muda).
- **Prévia do 6a/6b:** o Vitrine faz preload de 3 arquivos e o Romaneio de 4; no `srcdoc` sem cache longo isso repete a cada recarga da prévia (o 6b já espera 300 ms antes de recarregar).
- **Dados falsos compartilhados** (3a): nunca trocar por dado de cliente.

## Interface com os outros PRs

### O que este PR exporta

```ts
// apps/web/src/lib/bio/render/vitrine.ts — Parte 1
export const CSS_VITRINE: string;   // CSS fixo do modelo (nenhum dado da loja); cor de paleta só por var(--…)
export const vitrine: ModeloRender; // fontes: Jost 100–900 + Bodoni Moda 600 e 500 itálico; corDoTopo e fundoDoLogo = () => "#151412"

// apps/web/src/lib/bio/render/romaneio.ts — Parte 1
export const CSS_ROMANEIO: string;
export const romaneio: ModeloRender; // fontes: IBM Plex Mono 400/500/600/700; corDoTopo = (t) => t["--fundo2"]; fundoDoLogo = (t) => t["--papel"]

// apps/web/src/lib/bio/render/classico.ts — Parte 2
export const CSS_CLASSICO: string;
export const classico: ModeloRender; // fonte: Manrope 200–800; corDoTopo e fundoDoLogo = (t) => t["--fundo2"]

// apps/web/src/lib/bio/render/partes.ts — peça comum nova (Parte 1)
export function cnpjDaLoja(doc: DocumentoBio): string; // formatado se confere.ativo e o cnpj passa na `CNPJ` do confere; senão ""

// apps/web/src/test/bio-contraste.ts — só teste (Parte 1)
export function razao(a: string, b: string): number;                  // erro se uma das cores não for #RRGGBB
export function mistura(cor: string, alvo: string, t: number): string; // "#RRGGBB" maiúsculo: o que se vê sob um véu rgb(alvo / t)
export type Par = readonly [frente: string, fundo: string, minimo: number, onde: string];
export function falhas(pares: readonly Par[]): string[];               // [] = todo par passa
export function sorteio(semente: number): () => string;                // mulberry32 → "#RRGGBB"
export function regras(css: string): [string, string][];               // [seletor, declarações], fora de @keyframes
export function keyframes(css: string): Record<string, string>;        // corpo de cada @keyframes pelo nome
export function variaveisLidas(css: string): string[];                 // var(--x) lidas, sem o "--"
export function hexLiterais(css: string): string[];                    // hex escritos no CSS, ordenados, sem repetição
```

Sem mudança de assinatura: `renderPaginaBio(d, o)` (3a) — agora `d.documento.modelo` escolhe o modelo de verdade nos 4 (`MODELOS_RENDER` completo depois da Parte 2).

Arquivos estáticos: `/fonts/bio/jost/jost-latin.woff2` e `OFL.txt`; `/fonts/bio/bodoni-moda/bodoni-moda-latin-600.woff2`, `bodoni-moda-latin-500-italic.woff2` e `OFL.txt`; `/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-{400,500,600,700}.woff2` e `OFL.txt`; `/fonts/bio/manrope/manrope-latin.woff2` e `OFL.txt`.

Marcação que o JS lê (§9), garantida pelo `modelos.test.ts` nos 4: os botões `<a class="vt-prin|vt-linha|rm-carimbo|rm-linha|cl-btn[ cl-btn--prin]" href=… data-link="<uuid>" data-tipo="whatsapp|grupo|link">`; o endereço `<summary class="vt-linha|rm-linha|cl-btn" data-link="<uuid>" data-tipo="endereco">`; `<button type="button" class="vt-copiar|rm-copiar|cl-copiar" data-copiar="<CNPJ sem pontuação>">Copiar CNPJ</button>`; o `#lk-status` do 3a logo depois do `</main>`. Toque pela classe `lk-toque` (o script do 3a), entrada sob `lk-entra`.

### O que este PR usa

- **PR 3a**, `lib/bio/render/modelo.ts`: `ModeloRender`, `ContextoRender`, `FonteDoModelo`, `LinkVisivel`.
- **PR 3a**, `lib/bio/render/partes.ts`: `LARGURA_MINIATURA: readonly [128]`, `atrasos(seletor: string, inicioMs: number, passoMs: number): string`, `blocoConfere(doc: DocumentoBio, prefixo: string): string`, `conteudoDoH1(c: ContextoRender, o: { classe: string; largura: number; altura: number; sizes: string }): string`, `dadosDoLink(v: LinkVisivel): string`, `destaqueHtml(texto: string): string`, `detalhesDoEndereco(v: LinkVisivel, c: ContextoRender, o: { prefixo: string; classeDoResumo: string; resumo: string; foto: { largura: number; altura: number; sizes: string }; mapa?: string }): string`, `feitoComGirumo(c: ContextoRender): string`, `formatarCnpj(digitos: string): string` e a `const CNPJ` (dentro de `cnpjDaLoja`), `hrefAttr(href: string, modo: ModoRender): string`, `icone(nome: string, classe?: string): string`, `imagem(m: MidiaRef, o: OpcoesDaImagem): string`; nos testes, `CSS_BASE` e `tokensValidos(t: TokensBio): TokensBio`. A classe de foco (`lk-f-X-Y`, com `object-position` e `transform-origin`) vem de `imagem`/`regrasDoFoco`.
- **PR 3a**, `lib/bio/render/index.ts`: o mapa `MODELOS_RENDER` (editado) e `renderPaginaBio` (testes e conferência); `etiqueta.ts` (o `rodape` passa a usar `cnpjDaLoja`).
- **PR 3a**, `src/test/bio-dados-falsos.ts`: `IDS`, `dadosFalsos()`, `dadosCheios()`, `documentoFalso()`.
- **PR 2**, `lib/bio/cores.ts`: `TokensBio`, `coresDoModelo(modelo, paleta, cores)` — as chaves que cada CSS lê: Vitrine `fundo2 on on2 linha acento tinta icobg ico seta prin printinta papel foco`; Romaneio `fundo1 fundo2 fundo3 on on2 papel tinta tinta2 linha acento foco foco-fora`; Clássico `fundo2 fundo3 on on2 chip chipbd acento cartao tinta tinta2 icobg ico seta prin printinta papel anel foco` (o teste "toda variável que o CSS lê…" acusa a que faltar).
- **PR 2**, `lib/bio/documento.ts`: `MODELOS`, `PALETAS`, `Modelo`, `DocumentoBio`, `DadosRender`, `documentoPadrao` (testes).
- **Repo**: `escapeHtml` (`lib/campaigns/entry-page.ts`, com o `'` do PR 2), `contrastRatio` e `parseHex` (`lib/pages/palette.ts`, só nos testes).

### Quem usa o quê

- **PR 6b** (Aparência, miniaturas e prévia): `renderPaginaBio(dados, { modo: "previa", … })` com os 4 modelos de verdade — precisa da Parte 2 em `main`. O Romaneio não usa a foto, o Clássico não usa a logo (o `h1` é o nome) e o Vitrine carrega duas famílias. As paletas são as do PR 2.
- **PR 4b**: o beacon sobe o JS para 1 112 B; o pior caso do Vitrine fica em ~40 890 B (ainda ≤ 40 960). Quem mexer no JS depois mede de novo com o `bio-previa-3b.ts`.
- **PR 7**: com os dois rastreadores (JS de 2 060 B) a página cheia do Vitrine fica em ~33,9 KB; o teste "página cheia (20 links) com os dois rastreadores" deveria rodar nos 4 `MODELOS` (o Vitrine é o maior). O pior caso artificial do Vitrine passa de 40 KB com rastreio ligado (Riscos).
- **PR 4a**: nada muda — a rota chama `renderPaginaBio` igual; `font-src 'self'` da CSP cobre as fontes novas.
