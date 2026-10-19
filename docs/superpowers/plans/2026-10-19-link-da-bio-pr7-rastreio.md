# Link da bio — PR 7: rastreamento (Pixel da Meta e GA4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A página pública do link da bio dispara o Pixel da Meta (`PageView` ao abrir, `Contact` no toque do WhatsApp, `BioToque {botao}` nos outros) e o GA4 (`page_view`, `bio_toque {botao}`) quando a loja tem os ids, e o lojista preenche esses ids num bloco "Avançado" fechado no fim da aba Perfil.

**Architecture:** O `scriptDaPagina` (PR 3a, com o beacon do 4b) passa a ler `rastreio`: revalida cada id com as regras do §4 e, só com id válido, injeta o snippet oficial do Pixel e o carregador do gtag.js no fim do IIFE e os eventos no fim do handler de clique, depois do beacon — sem rastreio, a string sai byte a byte igual à do 4b. O `renderPaginaBio` passa `documento.rastreio` quando há id; a prévia continua sem `<script>`. A CSP da superfície `"bio"` ganha os hosts da Meta e do GA **fixos** (o middleware não sabe da loja). No painel, `BlocoAvancado` (componente novo) muda o documento por `mudarDocumento` e mostra o erro do salvar que o `useErroDaAba` da aba Perfil (6b) guarda; o PR 7 encaixa o bloco no fim da aba, põe os lugares dele na lista do hook e `rastreio` na `dona` do Perfil (`abas.tsx`).

**Tech Stack:** TypeScript strict, JS inline ES5, Next 15 (CSP do middleware), React 19 (painel `"use client"`), `node:test` + `node:assert/strict` via tsx, `react-dom/server` nos testes de componente, Playwright só na conferência (script fora do repo).

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` — §4 (linha `rastreio`), §6 (CSP da superfície `"bio"`), §8 (bloco "Avançado" no fim do Perfil), §9 (`scriptDaPagina` com `rastreio`), §10 (nada de texto livre no `<script>`), §11 (JS ≤ 3 KB, HTML ≤ 40 KB), §12 linha 7, §14.8. Índice: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`.

**Depende de:** PR 4b (beacon no `script.ts`) e PR 6b (`aba-perfil.tsx`, `useErroDaAba`, `idNaTela`, `lugarDoErro`) em `main` — e, por tabela, 2, 3a, 3b, 4a, 5 e 6a. É o último PR da série.

**Já rodado (no rascunho, fora do repo):** o `script.ts` da Task 1 com as linhas do 4b copiadas do plano dele — os 8 testes novos junto de dois do 3a, o "byte a byte" contra o array do 4b (1112 B sem rastreio, 2060 B com os dois ids) e o mutante sem a condição do `<summary>` derrubando o teste do "Como chegar"; o `buildCsp("bio")` da Task 3 com o `csp.test.ts` de hoje + o teste do 4a + o novo; o `bloco-avancado.tsx` da Task 4 com os 4 testes dele e o primeiro da Task 5, numa aba Perfil de mentira com o `useErroDaAba` copiado do plano do 6b e uma lista de lugares no formato do `LUGARES_DO_PERFIL`; `tsc` strict (target ES2017), o ESLint do `apps/web` e o lint do painel (`lintPainelSource`); e no Chromium: com a CSP nova o fbevents.js e o gtag.js carregam e os eventos saem (imagem no `/tr`, beacon no `/g/collect`) sem nenhuma violação; com a CSP do 4a os dois scripts são bloqueados. O que muda com o código real: a aba Perfil é a do 6b (Task 4 do plano dele: `LUGARES_DO_PERFIL`, `const erros = useErroDaAba(…)`, os quatro cartões com o `CartaoSelo` por último), não a de mentira.

## Arquivos (7 de código + 6 de teste: um PR só)

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/bio/render/script.ts` (+ `script.test.ts`) | 1 | Pixel e GA4 no JS da página, ids revalidados |
| `apps/web/src/lib/bio/render/index.ts` (+ `index.test.ts`) | 2 | passa `documento.rastreio` ao `scriptDaPagina` quando há id |
| `apps/web/src/lib/security/csp.ts` (+ `csp.test.ts`) | 3 | hosts da Meta e do GA fixos no ramo `"bio"` |
| `apps/web/src/lib/bio/editor.ts` (+ `editor.test.ts`) | 4 | as frases de `rastreio.metaPixelId` e `rastreio.ga4Id` |
| `apps/web/src/components/painel/link-da-bio/bloco-avancado.tsx` (+ `.test.ts`) | 4 | o bloco "Avançado" (novo) |
| `apps/web/src/components/painel/link-da-bio/aba-perfil.tsx` (+ `aba-perfil.test.ts`, do 6b) | 5 | o bloco no fim da aba e os lugares dele no `LUGARES_DO_PERFIL` |
| `apps/web/src/components/painel/link-da-bio/abas.tsx` | 5 | `rastreio` na `dona` do Perfil |

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| Os ids só entram no JS depois de `ID_PIXEL = /^\d{5,20}$/` e `ID_GA4 = /^G-[A-Z0-9]{4,}$/` **dentro** do `scriptDaPagina`; literal por `JSON.stringify` | O documento já passou pelo zod no salvar, mas quem põe o id no `<script>` não confia em quem chama (spec §10). Id que falha some como se estivesse vazio | Nenhum: a regra é a do §4 |
| Um `<script>` só: o fbevents.js e o gtag.js entram por `createElement` dentro do script com nonce | O teste do 3a ("um `<script>` só, com nonce") continua valendo; a CSP sem `'strict-dynamic'` libera o script injetado pelo host | Nenhum (conferido no Chromium) |
| Snippet oficial do Pixel (o do `/r/` e das LPs), mas `window.fbq(…)` explícito em vez do `fbq` global | No navegador dá no mesmo; no teste o `window` é um objeto falso passado ao `new Function` | Nenhum |
| GA4 por uma função local `gt` que empurra `arguments` no `window.dataLayer` (o contrato do gtag.js); o `config` manda o `page_view` sozinho; nada de `window.gtag` | Menos bytes e nenhum global novo | Nenhum |
| Eventos sem segurar a navegação, no mesmo handler do clique, depois do beacon do 4b | É o que as LPs já fazem com o `GroupJoin`; segurar o toque mudaria a página para todo mundo, com ou sem rastreio | Um toque que navega antes do fbevents.js/gtag.js carregar perde o evento (fica na fila) |
| "Como chegar" só conta quando o `<details>` abre: a mesma condição do beacon do 4b (`a.tagName!=="SUMMARY"\|\|!a.parentNode.open`) | O relatório (4b) e o Pixel/GA4 contam a mesma coisa; fechar o endereço não é interesse novo | Nenhum. Se o 4b mudar a regra dele, esta muda junto (o teste "Como chegar…" de cada PR acusa) |
| Cada rastreador no seu `try`, ao abrir e no toque | Bloqueador de anúncio ou erro de um não derruba o outro, nem o "Abrindo…", o Copiar CNPJ e o beacon | Nenhum |
| Injeção em dois pontos que não existiam: o fim do handler de clique e o fim do IIFE; vazios sem rastreio | Sem rastreio a página é exatamente a do 4b (snapshot na Task 1) | Nenhum |
| CSP `"bio"`: script `connect.facebook.net` + `www.googletagmanager.com` e connect `www.facebook.com` + os 3 do GA (iguais ao `click-redirect`); img `www.facebook.com` + `*.google-analytics.com` + `*.googletagmanager.com` | O evento da Meta sai como imagem no `/tr`; a lista de img do GA4 é a da documentação do Google. Sem Google Ads nem Google Signals (a página não tem Ads) | Propriedade com Google Signals pode ter requisição extra bloqueada (o `page_view` e o `bio_toque` passam) — a prova olha o console |
| "Avançado" = botão dentro de um `h2` com `aria-expanded`/`aria-controls` (como `bling-painel-ajustes.tsx`); os campos só existem aberto; não `<details>` | Mantém o título na navegação por títulos e o estado controlado por React (abrir por erro do salvar) | Nenhum |
| Chip "Configurado" no cabeçalho quando algum id não está vazio | O bloco nasce fechado: sem isso o lojista não vê que o pixel está ligado. Diz só o que a tela sabe (campo preenchido), como `etiquetaMeta` das Integrações | Nenhum |
| Erro do salvar pelo `useErroDaAba` do 6b: `LUGARES_DO_AVANCADO` entram no `LUGARES_DO_PERFIL` e `rastreio` entra na `dona` do Perfil (o 6b deixou de fora de propósito: sem campo, o erro ia para o aviso do topo da tela). O comentário da `AbaPerfil` do 6b previa o PR 7 filtrando o `erro` antes do hook: com os lugares na lista, não há filtro, e o comentário muda | O mesmo caminho das outras abas, sem código novo de erro: a frase embaixo do campo, o foco, o "some ao corrigir" (`corrigiu`) e o salvar que dá certo limpando tudo. Um erro por vez (o primeiro do zod), como no resto do editor | Com os dois ids errados, o segundo erro só aparece no segundo Salvar |
| Com erro num campo dele, o bloco sai aberto no mesmo render (não num efeito) e só fecha depois de corrigir; um efeito do bloco leva o foco ao campo depois do commit | Fechado, o campo nem existe: o foco do `useErroDaAba` (um `requestAnimationFrame`) pode chegar antes dele quando a aba já estava na tela | Nenhum |
| O painel guarda o que foi digitado; quem limpa é o zod do PR 2 no salvar (`trim` nos dois, GA4 em maiúsculas, teto 30) e o rascunho volta do servidor limpo (6a) | Uma regra só, onde ela já existe; nada de mexer no texto enquanto se digita | Nenhum |
| `maxLength` 30 nos dois campos | É o teto do GA4 no PR 2; o Pixel colado com espaço cabe e o zod limpa | Nenhum |
| Sem `<noscript>` do Pixel e sem banner de consentimento | Igual às LPs (`/p/`) e ao `/r/` | Mesma exposição que as LPs já têm |

## Global Constraints

- Eventos (spec §4, §14.8): Pixel `fbq("track","PageView")` ao abrir; no toque de `[data-link]` com `data-tipo="whatsapp"`, `fbq("track","Contact")`; nos outros tipos, `fbq("trackCustom","BioToque",{botao:<data-tipo>})`. GA4: `gtag("config",<id>)` (o `page_view` sai sozinho) e `gtag("event","bio_toque",{botao:<data-tipo>})` em todo toque. O `<summary>` do "Como chegar" só conta quando abre (a regra do beacon do 4b). **Nunca `Lead`** (o `/r/` já pode disparar o evento da campanha).
- Ids (spec §4): `metaPixelId` `^\d{5,20}$`, `ga4Id` `^G-[A-Z0-9]{4,}$`, ou vazio. Só entram no JS depois de revalidados no `scriptDaPagina`; nenhum texto livre dentro do `<script>` (spec §10).
- JS inline: ES5, sem `<`, ≤ 3 KB com os dois rastreadores (spec §11). Sem rastreio: byte a byte o JS do 4b. A prévia (`modo: "previa"`) nunca tem `<script>`.
- CSP `"bio"` (spec §6), exatamente: `default-src 'none'; script-src 'self' 'nonce-…' https://connect.facebook.net https://www.googletagmanager.com; style-src 'self' 'nonce-…'; img-src 'self' data: https://www.facebook.com https://*.google-analytics.com https://*.googletagmanager.com; font-src 'self'; connect-src 'self' https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` — e continua **um** header só.
- Painel (spec §8, §11): "Avançado" fechado no fim da aba Perfil; rótulo visível; erro do salvar pelo `useErroDaAba` do 6b, embaixo do campo com `aria-invalid` e `aria-describedby`, foco nele, some ao digitar; campo com `text-[16px]`; as classes de campo do 6a (`folha-de-link.tsx`); nada de `components/ui`; `npm run painel:check` e `npm run brand:check` passam.
- Testes: em `apps/web`, `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Componente com `renderToStaticMarkup(createElement(...))`, sem JSX no teste. **Nada de flag `s` em regex literal** (o `tsc` com target ES2017 dá TS1501): usar `[\s\S]`.
- Repositório público: ids, lojas e números fictícios (`1234567890`, `G-TESTE12345`, "Loja Exemplo"). Commits em inglês com prefixo semântico. Nenhuma DDL, nenhuma rota nova.

## Review Focus

- **Rastreador bloqueado ou quebrado** (bloqueador de anúncio, rede caída, o snippet da Meta falhando): a página continua — "Abrindo…", Copiar CNPJ, o beacon do 4b e o outro rastreador. Teste: "o Pixel quebrado não derruba o GA4 nem o resto da página" (Task 1).
- **Documento com id fora da regra** (SQL à mão, regra que mudou, chamada direta à API): nada desse id na página, e o outro, se válido, continua. Testes: "um id inválido não leva o outro junto" (Task 1) e "rastreio: id fora da regra… não entra na página" (Task 2).
- **Id colado com espaço ou GA4 em minúsculas**: o salvar passa e o id volta limpo. Teste: "rastreio (PR 7): vazio passa; colado com espaço…" (Task 4).
- **Salvar com id inválido com o Avançado fechado, ou estando em outra aba**: o editor vai para a aba Perfil, o bloco abre, a frase fica embaixo do campo (não no aviso do topo), o foco vai nele. Testes: "erro do salvar no GA4…" (Task 4), "Avançado: o último bloco da aba…" e "Avançado: o erro do salvar no rastreio é da aba Perfil…" (Task 5) e o roteiro da Task 6.
- **Página cheia (20 links) com os dois rastreadores**: HTML ≤ 40 KB e JS ≤ 3 KB. Testes: "os dois juntos: ES5, sem '<', em 3 KB…" (Task 1) e "página cheia… com os dois rastreadores" (Task 2).

---

### Task 0: Pré-condições, worktree, o JS de antes e o quadro

**Files:** nenhum.

- [ ] **Step 1: O 4b e o 6b estão em `main`?** Na raiz do checkout principal (`C:\Users\Igor\Desktop\HubFlow-platform`):

```bash
git fetch origin main
git log origin/main --oneline -100 -i --grep "bio"
```

Expected: os commits dos PRs 1, 2, 3a, 3b, 4a (duas partes), 4b, 5, 6a (duas partes) e 6b. Sem o 4b ou o 6b, **parar**: este PR mexe no JS do 4b e na aba do 6b.

- [ ] **Step 2: Worktree novo a partir de `origin/main`** (CLAUDE.md, "Regra de PR"; nunca `checkout -b` no checkout principal):

```bash
git worktree add -b feat/link-da-bio-pr7-rastreio .claude/worktrees/link-da-bio-pr7 origin/main
```

No worktree novo: `node_modules` por junction e e2e contra o dev só com `E2E_SUPABASE_*` no ambiente (ver "Ambiente do worktree" no índice). Daqui em diante os comandos rodam em `apps/web` deste worktree.

- [ ] **Step 3: Conferir o que este plano consome** (cada `grep` tem de achar a linha):

```bash
git grep -n "sendBeacon" -- src/lib/bio/render/script.ts
git grep -n "scriptDaPagina({ rastreio: null })" -- src/lib/bio/render/index.ts
git grep -n "surface === .bio." -- src/lib/security/csp.ts
git grep -n -E "metaPixelId|ga4Id" -- src/lib/bio/documento.ts
git grep -n -E "export (const MENSAGENS_DOS_CAMPOS|function (erroDoDocumento|estadoDe|idNaTela|lugarDoErro))" -- src/lib/bio/editor.ts
git grep -n -E "export function focarDepois" -- src/components/painel/link-da-bio/use-editor-bio.ts
git grep -n -E "export function useErroDaAba" -- src/components/painel/link-da-bio/erro-da-aba.tsx
git grep -n -E "export (type PropsDaAba|function abaDoErro)|id: .perfil." -- src/components/painel/link-da-bio/abas.tsx
git grep -n -E "export function AbaPerfil|useErroDaAba\(" -- src/components/painel/link-da-bio/aba-perfil.tsx
```

Expected: uma ou mais linhas em cada. Ler três arquivos inteiros e anotar:
- `src/lib/bio/render/script.ts`: o array tem de ser o do plano do 4b — as duas linhas do beacon (`var p=d.body.getAttribute("data-pagina");` e `if(p&&navigator.sendBeacon&&(a.tagName!=="SUMMARY"||!a.parentNode.open))navigator.sendBeacon(…)`) entre o `setTimeout(…,1600);` e o `var k=…`. Diferente → o `montar` da Task 1 copia o array que está em `main`, não o deste plano.
- `src/components/painel/link-da-bio/abas.tsx`: a `dona` do Perfil, que o 6b deixou como `/^(perfil|confere|feitoComGirumo)(\.|$)/` com o comentário "Sem `rastreio`: o PR 7 acrescenta…" (a Task 5 acrescenta).
- `src/components/painel/link-da-bio/aba-perfil.tsx`: no plano do 6b, a lista `LUGARES_DO_PERFIL` (constante de módulo), `const erros = useErroDaAba(erro, limparErro, LUGARES_DO_PERFIL, pagina.versao)` e os cartões `CartaoFotos`, `CartaoTextos`, `CartaoConfere` e `CartaoSelo` (o último, `id="bio-selo-titulo"`). Nome diferente em `main` → a Task 5 usa o de `main`.

- [ ] **Step 4: Gravar o JS de antes** (a prova do "byte a byte" da Task 1):

```bash
npx tsx -e "import { writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { scriptDaPagina } from './src/lib/bio/render/script'; writeFileSync(join(tmpdir(), 'bio-js-antes.txt'), scriptDaPagina({ rastreio: null }));"
```

Expected: sem saída; o arquivo `%TEMP%\bio-js-antes.txt` existe (1112 B, o número do plano do 4b).

- [ ] **Step 5: Quadro ao começar** (prod `nidoatbxaylrkcgbszns`; `npx supabase --workdir <pasta vazia> link --project-ref nidoatbxaylrkcgbszns --yes` e depois `npx supabase --workdir <pasta vazia> db query --linked -f arquivo.sql`; se o classificador recusar, pedir ao Igor):

```sql
update public.board_features
   set blocker = 'PR 7 (Pixel da Meta e GA4 na página + bloco Avançado no Perfil) em construção.',
       updated_at = now()
 where key = 'link-da-bio';
```

---

### Task 1: Pixel e GA4 no JS da página (`script.ts`)

**Files:**
- Modify: `apps/web/src/lib/bio/render/script.ts`
- Test: `apps/web/src/lib/bio/render/script.test.ts` (acrescentar ao fim; os testes do 3a e do 4b ficam como estão)

**Interfaces:**
- Consumes: o array do `JS` como está em `main` (3a + 4b); a marcação do §9 (`data-link`, `data-tipo`, `data-pagina`, `data-copiar`, `#lk-status`, o `<summary>` do endereço filho direto do `<details>`); no teste, o `JS`, o `type Ouvinte` e o `elemento(attrs, extra)` que o arquivo já tem (o 4b deu ao `elemento` o segundo parâmetro, `{ tagName?, parentNode? }`).
- Produces: `scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string` — mesma assinatura do §9, agora lendo `o.rastreio`. `null`, ids vazios ou fora da regra → o JS do 4b, byte a byte.

- [ ] **Step 1: Write the failing test** — acrescentar ao fim de `apps/web/src/lib/bio/render/script.test.ts`:

```ts
// ---------------------------------------------------------------- PR 7: Pixel da Meta e GA4

const PIXEL = "1234567890";
const GA4 = "G-TESTE12345";
type Chamadas = ArrayLike<unknown>[];

/**
 * Roda o JS com rastreio num DOM falso que também tem o que o Pixel e o GA4 usam
 * (createElement, head, o primeiro <script>) e o que o beacon do 4b lê (body, sendBeacon).
 * `window` vai por parâmetro: no navegador é o global.
 */
function rodaComRastreio(rastreio: { metaPixelId: string; ga4Id: string }) {
  const js = scriptDaPagina({ rastreio });
  const janela: { fbq?: { queue: Chamadas }; dataLayer?: Chamadas } = {};
  const carregados: string[] = [];
  const ouvintes: Record<string, Ouvinte> = {};
  const anexa = (t: { src: string }) => carregados.push(t.src);
  const documento = {
    head: { appendChild: anexa },
    body: { getAttribute: (n: string) => (n === "data-pagina" ? "pagina-falsa" : null) },
    getElementById: () => ({ textContent: "" }),
    getElementsByTagName: () => [{ parentNode: { insertBefore: anexa } }],
    createElement: () => ({ async: false, src: "" }),
    addEventListener: (tipo: string, fn: Ouvinte) => {
      ouvintes[tipo] = fn;
    },
  };
  new Function("window", "document", "navigator", "addEventListener", "setTimeout", "clearTimeout", js)(
    janela,
    documento,
    { sendBeacon: () => true },
    () => undefined,
    () => 0,
    () => undefined,
  );
  return {
    js,
    carregados,
    ouvintes,
    /** O que o Pixel guardou na fila (o fbevents.js não carrega no teste). */
    fbq: () => (janela.fbq?.queue ?? []).map((a) => Array.from(a)),
    /** O que foi pro dataLayer do GA4. */
    ga: () => (janela.dataLayer ?? []).map((a) => Array.from(a)),
    toca: (tipo: string) => ouvintes.click({ target: elemento({ "data-link": "l1", "data-tipo": tipo }).el }),
  };
}

test("sem rastreio (null, ids vazios ou fora da regra) o JS é o mesmo, sem nada da Meta nem do Google", () => {
  assert.doesNotMatch(JS, /fbq|gtag|dataLayer|facebook|googletagmanager|BioToque|bio_toque/);
  for (const rastreio of [
    { metaPixelId: "", ga4Id: "" },
    { metaPixelId: "1234", ga4Id: "G-ABC" },
    { metaPixelId: "123456789012345678901", ga4Id: "g-teste12345" },
    { metaPixelId: '1234567";alert(1);//', ga4Id: 'G-ABCD"</script><script>alert(1)' },
    { metaPixelId: "１２３４５６", ga4Id: "G-TESTE 12345" },
  ]) {
    assert.equal(scriptDaPagina({ rastreio }), JS, JSON.stringify(rastreio));
  }
});

test("Pixel: carrega o fbevents.js, init com o id e PageView ao abrir; nada do Google", () => {
  const r = rodaComRastreio({ metaPixelId: PIXEL, ga4Id: "" });
  assert.deepEqual(r.carregados, ["https://connect.facebook.net/en_US/fbevents.js"]);
  assert.deepEqual(r.fbq(), [["init", PIXEL], ["track", "PageView"]]);
  assert.doesNotMatch(r.js, /googletagmanager|dataLayer|bio_toque/);
});

test("Pixel no toque: Contact no WhatsApp, BioToque com o tipo nos outros; nunca Lead", () => {
  const r = rodaComRastreio({ metaPixelId: PIXEL, ga4Id: "" });
  for (const tipo of ["whatsapp", "grupo", "link", "endereco"]) r.toca(tipo);
  assert.deepEqual(r.fbq().slice(2), [
    ["track", "Contact"],
    ["trackCustom", "BioToque", { botao: "grupo" }],
    ["trackCustom", "BioToque", { botao: "link" }],
    ["trackCustom", "BioToque", { botao: "endereco" }],
  ]);
  assert.doesNotMatch(r.js, /Lead/);
});

test("GA4: carrega o gtag.js com o id, config (o page_view sai sozinho) e bio_toque com o tipo em todo toque", () => {
  const r = rodaComRastreio({ metaPixelId: "", ga4Id: GA4 });
  assert.deepEqual(r.carregados, [`https://www.googletagmanager.com/gtag/js?id=${GA4}`]);
  const [js, config] = r.ga();
  assert.equal(js[0], "js");
  assert.ok(js[1] instanceof Date);
  assert.deepEqual(config, ["config", GA4]);
  r.toca("whatsapp");
  r.toca("grupo");
  assert.deepEqual(r.ga().slice(2), [
    ["event", "bio_toque", { botao: "whatsapp" }],
    ["event", "bio_toque", { botao: "grupo" }],
  ]);
  assert.doesNotMatch(r.js, /connect\.facebook\.net|fbq/);
});

test("Como chegar: o evento sai quando o <details> abre, não quando fecha (a regra do beacon do 4b)", () => {
  const r = rodaComRastreio({ metaPixelId: PIXEL, ga4Id: GA4 });
  // No clique o `open` ainda é o de antes: aberto = este toque fecha.
  const detalhes = { open: false };
  const { el } = elemento({ "data-link": "l-endereco", "data-tipo": "endereco" }, { tagName: "SUMMARY", parentNode: detalhes });
  r.ouvintes.click({ target: el }); // abre
  detalhes.open = true;
  r.ouvintes.click({ target: el }); // fecha
  assert.deepEqual(r.fbq().slice(2), [["trackCustom", "BioToque", { botao: "endereco" }]]);
  assert.deepEqual(r.ga().slice(2), [["event", "bio_toque", { botao: "endereco" }]]);
});

test("os dois juntos: ES5, sem '<', em 3 KB; Copiar CNPJ e clique fora de botão não disparam evento", () => {
  const r = rodaComRastreio({ metaPixelId: "12345678901234567890", ga4Id: GA4 });
  const bytes = Buffer.byteLength(r.js);
  assert.ok(bytes <= 3 * 1024, `${bytes} bytes`);
  assert.doesNotMatch(r.js, /<|=>|`|\b(?:let|const|class)\b/);
  assert.equal(r.carregados.length, 2);
  const antes = [r.fbq().length, r.ga().length];
  r.ouvintes.click({ target: elemento({ "data-copiar": "11222333000181" }).el });
  r.ouvintes.click({ target: { closest: () => null } });
  r.ouvintes.click({ target: elemento({ "data-link": "l1" }).el });
  assert.deepEqual([r.fbq().length, r.ga().length], antes);
});

test("um id inválido não leva o outro junto", () => {
  const soPixel = rodaComRastreio({ metaPixelId: PIXEL, ga4Id: "G-ab12" });
  assert.deepEqual(soPixel.carregados, ["https://connect.facebook.net/en_US/fbevents.js"]);
  const soGa = rodaComRastreio({ metaPixelId: "12a45", ga4Id: GA4 });
  assert.deepEqual(soGa.carregados, [`https://www.googletagmanager.com/gtag/js?id=${GA4}`]);
});

test("o Pixel quebrado não derruba o GA4 nem o resto da página", () => {
  const js = scriptDaPagina({ rastreio: { metaPixelId: PIXEL, ga4Id: GA4 } });
  const janela: { dataLayer?: Chamadas } = {};
  const ouvintes: Record<string, Ouvinte> = {};
  const documento = {
    head: { appendChild: () => undefined },
    body: { getAttribute: () => "pagina-falsa" },
    getElementById: () => ({ textContent: "" }),
    getElementsByTagName: () => [], // sem <script>: o snippet do Pixel quebra no insertBefore
    createElement: () => ({}),
    addEventListener: (tipo: string, fn: Ouvinte) => {
      ouvintes[tipo] = fn;
    },
  };
  new Function("window", "document", "navigator", "addEventListener", "setTimeout", "clearTimeout", js)(
    janela,
    documento,
    { sendBeacon: () => true },
    (tipo: string, fn: Ouvinte) => {
      ouvintes[`janela:${tipo}`] = fn;
    },
    () => 0,
    () => undefined,
  );
  assert.equal(typeof ouvintes.click, "function");
  assert.equal(typeof ouvintes["janela:pageshow"], "function");
  ouvintes.click({ target: elemento({ "data-link": "l1", "data-tipo": "grupo" }).el });
  assert.deepEqual((janela.dataLayer ?? []).map((a) => Array.from(a)).slice(2), [["event", "bio_toque", { botao: "grupo" }]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/script.test.ts`
Expected: FAIL nos 7 novos que esperam Meta ou Google — "Pixel: carrega o fbevents.js…" com `carregados` vazio (`[]` ≠ `["https://connect.facebook.net/en_US/fbevents.js"]`), e os outros do mesmo jeito. O "sem rastreio…" e os 11 do 3a e do 4b já passam.

- [ ] **Step 3: Implement** — reescrever `apps/web/src/lib/bio/render/script.ts`. O `const JS = [...].join("")` vira a função `montar(toque, fim)` com **as linhas do array como estão em `main`** (as do 3a e as do 4b, abaixo como o plano do 4b as deixa) e duas mudanças: a linha do `var k=…` perde o `});` do fim (ele vira um item próprio, depois de `toque`), e entre o `addEventListener("pageshow",…)` e o `"})();"` entra `fim`. Sai o `// eslint-disable-next-line @typescript-eslint/no-unused-vars` do 3a (o `o` passa a ser usado):

```ts
/**
 * O JS inline da página do link da bio, devolvido sem a tag (o `index.ts` o
 * embrulha em `<script nonce>`). Nenhum texto do lojista entra aqui: o script
 * só lê `data-*` que o renderizador emite (uuid da página e do link, tipo de
 * lista fechada, CNPJ em dígitos) e, com rastreio, os dois ids que passam nas
 * regras abaixo. PR 3a: "Abrindo…", balanço do toque e "Copiado"; PR 4b: o
 * beacon do toque; PR 7: Pixel da Meta (PageView, Contact, BioToque) e GA4
 * (page_view, bio_toque) — nunca Lead, que é do /r/ (spec §4, §14.8).
 */

/** As regras do §4 de novo: o documento já passou pelo zod no salvar, mas só id que passa AQUI entra no JS (spec §10). */
const ID_PIXEL = /^\d{5,20}$/;
const ID_GA4 = /^G-[A-Z0-9]{4,}$/;

/** O snippet oficial do Pixel, o mesmo do /r/ (`entry-page.ts`) e das LPs, com o `d` (document) da página. */
const SNIPPET_DO_PIXEL =
  "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,d,'script','https://connect.facebook.net/en_US/fbevents.js');";

/** Ao abrir: Pixel (PageView) e GA4 (o `config` manda o page_view). Cada um no seu try: um não derruba o outro nem a página. */
function aoAbrir(pixel: string, ga4: string): string {
  const meta = pixel
    ? `try{${SNIPPET_DO_PIXEL}window.fbq("init",${JSON.stringify(pixel)});window.fbq("track","PageView")}catch(x){}`
    : "";
  const google = ga4
    ? `try{var w=window,gt=function(){w.dataLayer.push(arguments)};w.dataLayer=w.dataLayer||[];gt("js",new Date());gt("config",${JSON.stringify(ga4)});var g=d.createElement("script");g.async=!0;g.src=${JSON.stringify(`https://www.googletagmanager.com/gtag/js?id=${ga4}`)};d.head.appendChild(g)}catch(x){}`
    : "";
  return meta || google ? `;${meta}${google}` : "";
}

/**
 * No toque de um botão (`k` = data-tipo): Contact no WhatsApp e BioToque nos outros; bio_toque no GA4.
 * Nunca Lead. O "Como chegar" só conta quando o <details> abre — a mesma regra do beacon do 4b (no clique
 * o `open` ainda é o de antes): se o 4b mudar a dele, mudar esta junto.
 */
function noToque(pixel: string, ga4: string): string {
  const meta = pixel
    ? 'try{if(k==="whatsapp")window.fbq("track","Contact");else window.fbq("trackCustom","BioToque",{botao:k})}catch(x){}'
    : "";
  const google = ga4 ? 'try{gt("event","bio_toque",{botao:k})}catch(x){}' : "";
  return meta || google ? `;if(k&&(a.tagName!=="SUMMARY"||!a.parentNode.open)){${meta}${google}}` : "";
}

/** `toque` e `fim` vazios = o JS de antes do PR 7, byte a byte (o JS é ES5 e sem "<": nunca fecha o <script>). */
function montar(toque: string, fim: string): string {
  return [
    "(function(){",
    'var d=document,s=d.getElementById("lk-status"),t=0,',
    'M={whatsapp:"Abrindo o WhatsApp…",grupo:"Abrindo o grupo…",link:"Abrindo…"};',
    'function diz(x){if(!s)return;s.textContent=x;clearTimeout(t);if(x)t=setTimeout(function(){s.textContent=""},3000)}',
    'd.addEventListener("click",function(e){',
    'var a=e.target&&e.target.closest?e.target.closest("[data-link],[data-copiar]"):null;if(!a)return;',
    'var c=a.getAttribute("data-copiar");',
    "if(c!==null){var n=navigator.clipboard;if(n&&n.writeText)n.writeText(c).then(function(){",
    'a.textContent="Copiado";diz("CNPJ copiado.");setTimeout(function(){a.textContent="Copiar CNPJ"},2200)},function(){});return}',
    'a.classList.remove("lk-toque");void a.offsetWidth;a.classList.add("lk-toque");',
    'setTimeout(function(){a.classList.remove("lk-toque")},1600);',
    // Beacon (PR 4b). No clique o `open` do <details> ainda é o de antes: aberto = este toque fecha, não conta.
    // Sempre `navigator.sendBeacon(…)`: a função solta (`var b=navigator.sendBeacon`) dá "Illegal invocation".
    'var p=d.body.getAttribute("data-pagina");',
    'if(p&&navigator.sendBeacon&&(a.tagName!=="SUMMARY"||!a.parentNode.open))navigator.sendBeacon("/api/p/bio/toque",JSON.stringify({p:p,l:a.getAttribute("data-link")}));',
    'var k=a.getAttribute("data-tipo");if(k&&M.hasOwnProperty(k))diz(M[k])',
    toque, // PR 7: eventos do toque (vazio sem rastreio)
    "});",
    'addEventListener("pageshow",function(){diz("")})',
    fim, // PR 7: Pixel e GA4 ao abrir (vazio sem rastreio)
    "})();",
  ].join("");
}

export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string {
  const r = o.rastreio;
  const pixel = r && ID_PIXEL.test(r.metaPixelId) ? r.metaPixelId : "";
  const ga4 = r && ID_GA4.test(r.ga4Id) ? r.ga4Id : "";
  return montar(noToque(pixel, ga4), aoAbrir(pixel, ga4));
}
```

Se o array em `main` não for o do plano do 4b (Task 0, Step 3), a regra é a mesma: copiar as linhas de `main`; `toque` entra no fim do handler de clique, depois do último statement do ramo `[data-link]` (com `a` e `k` no escopo) e antes do `});`; `fim` entra no fim do IIFE, antes do `})();`. O Step 5 prova que o resto ficou intacto.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/script.test.ts`
Expected: PASS — os 11 do 3a e do 4b mais os 8 novos (19), `fail 0`.

- [ ] **Step 5: Sem rastreio, byte a byte o JS do 4b**

```bash
npx tsx -e "import { writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { scriptDaPagina } from './src/lib/bio/render/script'; writeFileSync(join(tmpdir(), 'bio-js-depois.txt'), scriptDaPagina({ rastreio: null }));"
node -e "const fs=require('fs'),os=require('os'),p=require('path');const a=fs.readFileSync(p.join(os.tmpdir(),'bio-js-antes.txt'),'utf8'),b=fs.readFileSync(p.join(os.tmpdir(),'bio-js-depois.txt'),'utf8');console.log(a===b?'IGUAL':'DIFERENTE',a.length,b.length)"
```

Expected: `IGUAL <n> <n>` (o mesmo número duas vezes). `DIFERENTE` → alguma linha do array mudou: comparar os dois arquivos e desfazer.

- [ ] **Step 6: Lint**

Run: `npx eslint src/lib/bio/render/script.ts src/lib/bio/render/script.test.ts`
Expected: sem erro nem aviso.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bio/render/script.ts src/lib/bio/render/script.test.ts
git commit -m "feat(bio): Meta Pixel and GA4 in the page script, ids revalidated"
```

---

### Task 2: O render passa o rastreio (`index.ts`)

**Files:**
- Modify: `apps/web/src/lib/bio/render/index.ts` (só a linha do `script` no `renderPaginaBio`)
- Test: `apps/web/src/lib/bio/render/index.test.ts` (acrescentar ao fim)

**Interfaces:**
- Consumes: Task 1 (`scriptDaPagina`); do 3a, no teste: `publica`, `conta`, `NONCE`, `dadosFalsos`, `dadosCheios`, `type DadosRender`.
- Produces: `renderPaginaBio` com a mesma assinatura do §9; no modo `"publica"` o `<script>` é `scriptDaPagina({ rastreio: documento.rastreio })` quando algum id não está vazio, senão `scriptDaPagina({ rastreio: null })`.

- [ ] **Step 1: Write the failing test** — no topo de `apps/web/src/lib/bio/render/index.test.ts`, junto dos imports locais: `import { scriptDaPagina } from "./script";`. Ao fim do arquivo:

```ts
// ---------------------------------------------------------------- PR 7: rastreio

const RASTREIO = { metaPixelId: "1234567890", ga4Id: "G-TESTE12345" };
const comRastreio = (d: DadosRender, rastreio: DadosRender["documento"]["rastreio"]): DadosRender => ({
  ...d,
  documento: { ...d.documento, rastreio },
});
/** O conteúdo do único <script> da página (o JS não tem "<": o primeiro </script> é o dele). */
const JS_DA_PAGINA = /<script nonce="AAAAAAAAAAAAAAAAAAAAAA==">([\s\S]*?)<\/script>/;

test("rastreio: com id, o único <script> da página é o scriptDaPagina com o rastreio; sem id, o de sempre", () => {
  const html = publica(comRastreio(dadosFalsos(), RASTREIO));
  assert.equal(conta(html, /<script/g), 1);
  assert.equal(html.match(JS_DA_PAGINA)?.[1], scriptDaPagina({ rastreio: RASTREIO }));
  assert.match(html, /connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(html, /gtag\/js\?id=G-TESTE12345/);
  assert.equal(publica(dadosFalsos()).match(JS_DA_PAGINA)?.[1], scriptDaPagina({ rastreio: null }));
});

test("rastreio: id fora da regra (documento que não passou pelo zod) não entra na página", () => {
  const html = publica(comRastreio(dadosFalsos(), { metaPixelId: '1";alert(1)//', ga4Id: 'G-X"</script><script>alert(1)' }));
  assert.equal(conta(html, /<script/g), 1);
  assert.doesNotMatch(html, /alert\(1\)|fbevents|googletagmanager/);
});

test("rastreio: a prévia do painel nunca leva", () => {
  const html = renderPaginaBio(comRastreio(dadosFalsos(), RASTREIO), { modo: "previa", nonce: null, animarEntrada: false });
  assert.doesNotMatch(html, /<script|fbevents|googletagmanager/);
});

test("página cheia (20 links) com os dois rastreadores ainda cabe em 40 KB, nos 4 modelos", () => {
  // O Vitrine é o maior (PR 3b): a conta tem de valer em todos, não só no Etiqueta dos dados falsos.
  const paletaDe = { etiqueta: "azul", vitrine: "papel", romaneio: "kraft", classico: "claro" } as const;
  for (const modelo of ["etiqueta", "vitrine", "romaneio", "classico"] as const) {
    const d = comRastreio(dadosCheios(), { metaPixelId: "12345678901234567890", ga4Id: "G-TESTE12345" });
    const html = publica({ ...d, documento: { ...d.documento, modelo, paleta: paletaDe[modelo] } });
    const bytes = Buffer.byteLength(html);
    assert.ok(bytes <= 40 * 1024, `${modelo}: ${bytes} bytes`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/index.test.ts`
Expected: FAIL — o primeiro teste novo: o `<script>` ainda é o de `rastreio: null` (sem `fbevents`). Os outros três já passam.

- [ ] **Step 3: Implement** — em `renderPaginaBio` (`apps/web/src/lib/bio/render/index.ts`), trocar a linha

```ts
  const script = o.modo === "publica" ? `<script${nonce}>${scriptDaPagina({ rastreio: null })}</script>` : "";
```

por

```ts
  // Rastreio (PR 7): o documento já passou pelo zod, e o scriptDaPagina revalida cada id antes de pô-lo no JS.
  const { metaPixelId, ga4Id } = doc.rastreio;
  const rastreio = metaPixelId || ga4Id ? doc.rastreio : null;
  const script = o.modo === "publica" ? `<script${nonce}>${scriptDaPagina({ rastreio })}</script>` : "";
```

(`doc` é o nome que o 3a dá ao `d.documento` no `renderPaginaBio`; se for outro, usar o de lá.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/index.test.ts src/lib/bio/render/script.test.ts`
Expected: PASS, `fail 0` (os do 3a/3b/4b continuam: `dadosFalsos` e `dadosCheios` têm o rastreio vazio).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/render/index.ts src/lib/bio/render/index.test.ts
git commit -m "feat(bio): render passes the page tracking ids to the script"
```

---

### Task 3: Hosts da Meta e do GA na CSP `"bio"` (`csp.ts`)

**Files:**
- Modify: `apps/web/src/lib/security/csp.ts` (o ramo `if (surface === "bio")` do `buildCsp`, criado pelo 4a)
- Test: `apps/web/src/lib/security/csp.test.ts` (troca o teste de lista exata do 4a)

**Interfaces:**
- Consumes: `buildCsp`, `scriptSrc`, `NonceSurface` com `"bio"` (4a); no teste, `generateNonce` e `nonceSeenByNext` (já no arquivo).
- Produces: `buildCsp("bio", nonce, isDev)` com a política do Global Constraints. Assinatura igual.

- [ ] **Step 1: Write the failing test** — em `csp.test.ts`, **apagar** o teste do 4a `"CSP do link da bio: fechada, só o nonce, nenhum terceiro (spec link-da-bio §6)"` e pôr no lugar:

```ts
test("CSP do link da bio: o nonce e só os hosts da Meta e do GA, fixos (spec link-da-bio §6, PR 7)", () => {
  const nonce = generateNonce();
  const csp = buildCsp("bio", nonce, false);
  assert.deepEqual(csp.split("; "), [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://connect.facebook.net https://www.googletagmanager.com`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https://www.facebook.com https://*.google-analytics.com https://*.googletagmanager.com",
    "font-src 'self'",
    "connect-src 'self' https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ]);
  assert.equal(nonceSeenByNext(csp), nonce);
});
```

O laço `for (const surface of ["public-lp", "click-redirect", "bio"] as const)` do teste "production script-src drops unsafe-inline and unsafe-eval" (o 4a já pôs o `"bio"`) fica.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts`
Expected: FAIL — o `script-src` sem os dois hosts.

- [ ] **Step 3: Implement** — trocar o ramo `"bio"` do `buildCsp` inteiro (comentário incluso) por:

```ts
  if (surface === "bio") {
    // Link da bio (spec link-da-bio §6): HTML montado à mão, sem React — `<style>` e
    // `<script>` só com o nonce. Os hosts da Meta e do GA são FIXOS (PR 7), como no
    // click-redirect: quem monta a CSP é o middleware, que não sabe se a loja tem rastreio.
    // O script inline (com nonce) injeta o fbevents.js e o gtag.js, que entram pelo host;
    // a Meta manda o evento por imagem (www.facebook.com/tr) e o GA4 por beacon/fetch.
    return [
      "default-src 'none'",
      scriptSrc(nonce, isDev, "https://connect.facebook.net", "https://www.googletagmanager.com"),
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data: https://www.facebook.com https://*.google-analytics.com https://*.googletagmanager.com",
      "font-src 'self'",
      "connect-src 'self' https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; ");
  }
```

E no comentário do topo de `csp.ts` ("O que ENTRA"), na linha do `/bio/:slug` que o 4a escreveu, acrescentar: "com os hosts da Meta e do GA fixos (PR 7)".

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts`
Expected: PASS, `fail 0`.

- [ ] **Step 5: Algum outro teste fixa a CSP antiga?**

Run: `git grep -n -E "connect-src 'self'[^ ]|img-src 'self' data:[^ ]" -- src e2e`
Expected: nada (a CSP velha do `"bio"` era a única com `'self'` ou `data:` fechando a diretiva; o e2e do 4a só confere `default-src 'none'` e o nonce, e o do 4b o beacon no `connect-src 'self'`, que continua). Achou → trocar pela lista nova.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security/csp.ts src/lib/security/csp.test.ts
git commit -m "feat(bio): allow Meta and GA hosts in the link-in-bio CSP"
```

---

### Task 4: O bloco "Avançado" (frases + componente)

**Files:**
- Modify: `apps/web/src/lib/bio/editor.ts` (duas chaves em `MENSAGENS_DOS_CAMPOS`)
- Test: `apps/web/src/lib/bio/editor.test.ts` (acrescentar ao fim)
- Create: `apps/web/src/components/painel/link-da-bio/bloco-avancado.tsx`
- Test: `apps/web/src/components/painel/link-da-bio/bloco-avancado.test.ts`

**Interfaces:**
- Consumes: `type DocumentoBio` (PR 2); `MENSAGENS_DOS_CAMPOS`, `erroDoDocumento` (6a) e `idNaTela(campo: string): string`, `lugarDoErro(campo: string, lugares: readonly string[]): string | null` (6b), todos em `@/lib/bio/editor`; `type PropsDaAba` (6a, `abas.tsx`); `focarDepois(id: string): void` (6a, `use-editor-bio.ts`); `cn` (`@/lib/utils`); `ChevronDown` (lucide-react).
- Produces (`bloco-avancado.tsx`): `type CampoDoRastreio`, `type ErrosDoRastreio`, `LUGARES_DO_AVANCADO`, `type PropsDoConteudo`, `ConteudoDoAvancado`, `type PropsDoAvancado`, `BlocoAvancado` (assinaturas em "Interface com os outros PRs"). Ids de contrato: `bio-avancado` (o botão), `bio-avancado-campos`, e pelo `idNaTela`: `bio-rastreio-metaPixelId`, `bio-rastreio-ga4Id` (+ `-erro`, `-ajuda`).

- [ ] **Step 1: Write the failing tests**

Ao fim de `apps/web/src/lib/bio/editor.test.ts` (reusa o `ZAP`, o `documento(links)` e os imports que o 6a já tem no arquivo):

```ts
test("rastreio (PR 7): vazio passa; colado com espaço ou o GA4 em minúsculas também (o zod do PR 2 limpa); fora da regra, a frase do Avançado no campo", () => {
  const com = (rastreio: DocumentoBio["rastreio"]) => erroDoDocumento({ ...documento([ZAP]), rastreio });
  assert.equal(com({ metaPixelId: "", ga4Id: "" }), null);
  assert.equal(com({ metaPixelId: "1234567890", ga4Id: "G-AB12CD34EF" }), null);
  assert.equal(com({ metaPixelId: " 1234567890 ", ga4Id: " g-ab12cd34ef " }), null);
  assert.deepEqual(com({ metaPixelId: "12a45", ga4Id: "" }), {
    campo: "rastreio.metaPixelId",
    mensagem: "Confira o ID do pixel: só números, de 5 a 20. Está no Gerenciador de Eventos da Meta.",
  });
  assert.deepEqual(com({ metaPixelId: "", ga4Id: "G-AB" }), {
    campo: "rastreio.ga4Id",
    mensagem: "Confira o ID de medição: G- e pelo menos 4 letras ou números, como G-AB12CD34EF.",
  });
});
```

Criar `apps/web/src/components/painel/link-da-bio/bloco-avancado.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { lugarDoErro } from "@/lib/bio/editor";

import { BlocoAvancado, ConteudoDoAvancado, LUGARES_DO_AVANCADO, type PropsDoConteudo } from "./bloco-avancado";

// Dados fictícios: nada de cliente (repo público).
const noop = () => {};
const VAZIO = { metaPixelId: "", ga4Id: "" };
const FRASE_GA4 = "Confira o ID de medição: G- e pelo menos 4 letras ou números, como G-AB12CD34EF.";

function conteudo(over: Partial<PropsDoConteudo> = {}): string {
  const props: PropsDoConteudo = { rastreio: VAZIO, aberto: false, erros: {}, aoAlternar: noop, aoMudar: noop, ...over };
  return renderToStaticMarkup(createElement(ConteudoDoAvancado, props));
}

function bloco(erroDe: (lugar: string) => string | undefined, rastreio = VAZIO): string {
  return renderToStaticMarkup(createElement(BlocoAvancado, { rastreio, mudarDocumento: noop, erroDe, corrigiu: noop }));
}

test("fechado por padrão: botão Avançado no h2 com aria-expanded=false, a dica e nenhum campo", () => {
  const h = bloco(() => undefined);
  assert.match(h, /<h2[^>]*><button type="button" id="bio-avancado" aria-expanded="false"[^>]*><span[^>]*>Avançado<\/span>/);
  assert.doesNotMatch(h, /aria-controls=/);
  assert.match(h, />Pixel da Meta e Google Analytics, se a loja já usa\.</);
  assert.doesNotMatch(h, /bio-rastreio-|Configurado/);
});

test("aberto: os dois campos com rótulo, ajuda ligada e o valor; o pixel pede teclado numérico", () => {
  const h = conteudo({ aberto: true, rastreio: { metaPixelId: "1234567890", ga4Id: "G-AB12CD34EF" } });
  assert.match(h, /aria-expanded="true" aria-controls="bio-avancado-campos"/);
  assert.match(h, /<label for="bio-rastreio-metaPixelId"[^>]*>ID do pixel da Meta<\/label>/);
  assert.match(
    h,
    /<input type="text" inputMode="numeric"[^>]*id="bio-rastreio-metaPixelId" maxLength="30"[^>]*aria-describedby="bio-rastreio-metaPixelId-ajuda"[^>]*value="1234567890"\/>/,
  );
  assert.match(h, /<label for="bio-rastreio-ga4Id"[^>]*>ID de medição do Google Analytics 4<\/label>/);
  assert.match(h, /<input type="text" autoCapitalize="characters"[^>]*id="bio-rastreio-ga4Id"[^>]*value="G-AB12CD34EF"\/>/);
  assert.match(h, /<p id="bio-rastreio-metaPixelId-ajuda"[^>]*>Só números\. Está no Gerenciador de Eventos/);
  assert.match(h, /PageView ao abrir, Contact no botão do WhatsApp e BioToque nos outros\./);
  assert.match(h, /page_view ao abrir e bio_toque em cada botão tocado\./);
  assert.doesNotMatch(h, /aria-invalid="/);
});

test("erro do salvar no GA4: o bloco já abre com a frase embaixo do campo certo; o outro fica limpo", () => {
  assert.equal(lugarDoErro("rastreio.ga4Id", LUGARES_DO_AVANCADO), "rastreio.ga4Id");
  const h = bloco((lugar) => (lugar === "rastreio.ga4Id" ? FRASE_GA4 : undefined), { metaPixelId: "1234567890", ga4Id: "G-AB" });
  assert.match(h, /id="bio-avancado" aria-expanded="true" aria-controls="bio-avancado-campos"/);
  assert.match(
    h,
    /id="bio-rastreio-ga4Id"[^>]*aria-invalid="true" aria-describedby="bio-rastreio-ga4Id-erro bio-rastreio-ga4Id-ajuda"/,
  );
  assert.match(h, /<p id="bio-rastreio-ga4Id-erro"[^>]*>Confira o ID de medição: G- e pelo menos 4 letras ou números, como G-AB12CD34EF\.<\/p>/);
  assert.doesNotMatch(h, /id="bio-rastreio-metaPixelId"[^>]*aria-invalid="/);
  assert.doesNotMatch(h, /bio-rastreio-metaPixelId-erro/);
});

test("com id preenchido, o cabeçalho fechado diz Configurado", () => {
  assert.match(conteudo({ rastreio: { metaPixelId: "1234567890", ga4Id: "" } }), /Avançado<span class="pn-chip">Configurado<\/span>/);
  assert.doesNotMatch(conteudo(), /Configurado/);
  assert.doesNotMatch(conteudo({ rastreio: { metaPixelId: "   ", ga4Id: "" } }), /Configurado/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor.test.ts src/components/painel/link-da-bio/bloco-avancado.test.ts`
Expected: FAIL — no `editor.test.ts`, a frase é a padrão (`"Confira este campo."`); no outro, `Cannot find module './bloco-avancado'`.

Se o teste do `editor.test.ts` falhar no `campo` (diferente de `rastreio.metaPixelId`/`rastreio.ga4Id`), no colado com espaço, ou por `"12a45"`/`"G-AB"` passarem, o `documentoBio` não está como o PR 2 o escreveu (trim nos dois; GA4 com `toUpperCase` e `max(30)`; regras do §4): parar — o bloco depende desse caminho e dessa limpeza.

- [ ] **Step 3: Implement as frases** — em `MENSAGENS_DOS_CAMPOS` (`apps/web/src/lib/bio/editor.ts`), acrescentar ao fim do objeto:

```ts
  "rastreio.metaPixelId": "Confira o ID do pixel: só números, de 5 a 20. Está no Gerenciador de Eventos da Meta.",
  "rastreio.ga4Id": "Confira o ID de medição: G- e pelo menos 4 letras ou números, como G-AB12CD34EF.",
```

- [ ] **Step 4: Implement o bloco** — criar `apps/web/src/components/painel/link-da-bio/bloco-avancado.tsx`:

```tsx
"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import type { DocumentoBio } from "@/lib/bio/documento";
import { idNaTela } from "@/lib/bio/editor";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { focarDepois } from "./use-editor-bio";

/**
 * O "Avançado" da aba Perfil (spec 2026-10-19-link-da-bio §8; PR 7): fechado, com o id do Pixel
 * da Meta e o do GA4. Muda o documento só por `mudarDocumento`. O erro do salvar chega pelo
 * `useErroDaAba` da aba Perfil (6b), que precisa destes lugares na lista dela. Quem valida e
 * limpa é o `documentoBio` (PR 2: trim e GA4 em maiúsculas) e, de novo, o `scriptDaPagina`
 * (PR 7) antes de pôr o id no JS da página.
 */

export type CampoDoRastreio = keyof DocumentoBio["rastreio"];
export type ErrosDoRastreio = Partial<Record<CampoDoRastreio, string>>;

/** Os lugares do Avançado: entram na lista do `useErroDaAba` da aba Perfil (constante de módulo). */
export const LUGARES_DO_AVANCADO = ["rastreio.metaPixelId", "rastreio.ga4Id"] as const;

const ID_DO_BOTAO = "bio-avancado";
const ID_DOS_CAMPOS = "bio-avancado-campos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 py-2.5 text-[16px] leading-snug text-volt-950 aria-invalid:border-danger-700 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";

type DefinicaoDoCampo = {
  campo: CampoDoRastreio;
  rotulo: string;
  ajuda: string;
  extra: Pick<InputHTMLAttributes<HTMLInputElement>, "inputMode" | "autoCapitalize" | "placeholder">;
};

const CAMPOS: readonly DefinicaoDoCampo[] = [
  {
    campo: "metaPixelId",
    rotulo: "ID do pixel da Meta",
    ajuda:
      "Só números. Está no Gerenciador de Eventos, ao lado do nome do pixel. A página manda PageView ao abrir, Contact no botão do WhatsApp e BioToque nos outros.",
    extra: { inputMode: "numeric", placeholder: "1234567890" },
  },
  {
    campo: "ga4Id",
    rotulo: "ID de medição do Google Analytics 4",
    ajuda: "Começa com G-. A página manda page_view ao abrir e bio_toque em cada botão tocado.",
    extra: { autoCapitalize: "characters", placeholder: "G-XXXXXXXXXX" },
  },
];

export type PropsDoConteudo = {
  rastreio: DocumentoBio["rastreio"];
  aberto: boolean;
  erros: ErrosDoRastreio;
  aoAlternar: () => void;
  aoMudar: (campo: CampoDoRastreio, valor: string) => void;
};

/** O bloco sem estado: o teste o desenha fechado, aberto e com erro. */
export function ConteudoDoAvancado({ rastreio, aberto, erros, aoAlternar, aoMudar }: PropsDoConteudo) {
  const configurado = rastreio.metaPixelId.trim() !== "" || rastreio.ga4Id.trim() !== "";
  return (
    <section aria-labelledby={ID_DO_BOTAO} className="pn-card rounded-xl">
      <h2 className="font-brand text-15 font-bold text-volt-950">
        <button
          type="button"
          id={ID_DO_BOTAO}
          aria-expanded={aberto}
          aria-controls={aberto ? ID_DOS_CAMPOS : undefined}
          onClick={aoAlternar}
          className={cn("flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left lg:px-5", FOCO)}
        >
          <span className="flex flex-wrap items-center gap-2">
            Avançado
            {configurado && <span className="pn-chip">Configurado</span>}
          </span>
          <ChevronDown
            className={cn("h-5 w-5 flex-none text-slate-600 transition-transform", aberto && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </h2>
      <p className="px-4 pb-4 text-13 text-slate-600 lg:px-5">Pixel da Meta e Google Analytics, se a loja já usa.</p>
      {aberto && (
        <div id={ID_DOS_CAMPOS} className="grid gap-4 border-t border-line-200 p-4 lg:p-5">
          {CAMPOS.map(({ campo, rotulo, ajuda, extra }) => {
            const id = idNaTela(`rastreio.${campo}`);
            const erro = erros[campo];
            return (
              <div key={campo} className="grid gap-1.5">
                <label htmlFor={id} className={ROTULO}>
                  {rotulo}
                </label>
                <input
                  type="text"
                  {...extra}
                  id={id}
                  value={rastreio[campo]}
                  maxLength={30}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? `${id}-erro ${id}-ajuda` : `${id}-ajuda`}
                  onChange={(e) => aoMudar(campo, e.target.value)}
                  className={CAMPO}
                />
                {erro && (
                  <p id={`${id}-erro`} className={ERRO}>
                    {erro}
                  </p>
                )}
                <p id={`${id}-ajuda`} className={AJUDA}>
                  {ajuda}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export type PropsDoAvancado = {
  rastreio: DocumentoBio["rastreio"];
  mudarDocumento: PropsDaAba["mudarDocumento"];
  /** Do `useErroDaAba` da aba Perfil (6b): a frase guardada para o lugar e o "a lojista corrigiu". */
  erroDe: (lugar: string) => string | undefined;
  corrigiu: (lugar: string) => void;
};

/** O "Avançado" no fim da aba Perfil (o 6b cria a aba; o PR 7 encaixa este bloco nela). */
export function BlocoAvancado({ rastreio, mudarDocumento, erroDe, corrigiu }: PropsDoAvancado) {
  const [aberto, setAberto] = useState(false);
  const erros: ErrosDoRastreio = { metaPixelId: erroDe(LUGARES_DO_AVANCADO[0]), ga4Id: erroDe(LUGARES_DO_AVANCADO[1]) };
  const comErro = CAMPOS.find(({ campo }) => erros[campo])?.campo;

  // Erro do salvar num campo daqui: o bloco já sai aberto neste desenho (fechado, o campo nem existe).
  // O efeito o deixa aberto quando o erro sumir (a lojista está digitando nele) e leva o foco ao campo
  // depois deste commit — o foco do useErroDaAba pode ter chegado antes de o campo existir.
  useEffect(() => {
    if (!comErro) return;
    setAberto(true);
    focarDepois(idNaTela(`rastreio.${comErro}`));
  }, [comErro]);

  function mudar(campo: CampoDoRastreio, valor: string) {
    mudarDocumento((d) => ({ ...d, rastreio: { ...d.rastreio, [campo]: valor } }));
    corrigiu(`rastreio.${campo}`); // "o erro some ao corrigir" (§8)
  }

  return (
    <ConteudoDoAvancado
      rastreio={rastreio}
      aberto={aberto || comErro !== undefined}
      erros={erros}
      aoAlternar={() => {
        if (!comErro) setAberto((a) => !a); // com erro, o bloco fica aberto até corrigir
      }}
      aoMudar={mudar}
    />
  );
}
```

As classes de campo, rótulo, ajuda e erro são as da folha de link do 6a (`folha-de-link.tsx`) e da aba Perfil do 6b; o recuo (`p-4 lg:p-5`) é o do `CARTAO` da aba Perfil, para o título alinhar com o dos outros cartões. Se o 6a/6b exportarem essas classes com nome, importar em vez de repetir.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor.test.ts src/components/painel/link-da-bio/bloco-avancado.test.ts`
Expected: PASS — os do 6a/6b no `editor.test.ts` mais 1, e 4 no `bloco-avancado.test.ts`; `fail 0`.

- [ ] **Step 6: Lint e o lint do painel**

Run: `npx eslint src/lib/bio/editor.ts src/components/painel/link-da-bio/bloco-avancado.tsx src/components/painel/link-da-bio/bloco-avancado.test.ts` e `npm run painel:check`
Expected: eslint sem erro nem aviso; `painel:check OK`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bio/editor.ts src/lib/bio/editor.test.ts src/components/painel/link-da-bio/bloco-avancado.tsx src/components/painel/link-da-bio/bloco-avancado.test.ts
git commit -m "feat(link-da-bio): advanced block with Meta Pixel and GA4 ids"
```

---

### Task 5: O "Avançado" no fim da aba Perfil

**Files:**
- Modify: `apps/web/src/components/painel/link-da-bio/abas.tsx` (a `dona` do Perfil)
- Modify: `apps/web/src/components/painel/link-da-bio/aba-perfil.tsx` (6b)
- Test: `apps/web/src/components/painel/link-da-bio/aba-perfil.test.ts` (6b; acrescentar ao fim)

**Interfaces:**
- Consumes: Task 4 (`BlocoAvancado`, `LUGARES_DO_AVANCADO`); 6b (`AbaPerfil(p: PropsDaAba)`, `LUGARES_DO_PERFIL`, `erros = useErroDaAba(…)` com `erroDe`/`corrigiu`, o `CartaoSelo` como último cartão; no teste, `html(documento?, erro?)`, `DOC` e os imports do `aba-perfil.test.ts`); 6a (`abaDoErro(erro: ErroDeCampo | null): AbaDoEditor | undefined`).
- Produces: a aba Perfil termina no `BlocoAvancado`; erro `rastreio.*` do salvar leva à aba Perfil e aparece no campo dele, não no aviso do topo.

- [ ] **Step 1: Write the failing tests** — ao fim de `apps/web/src/components/painel/link-da-bio/aba-perfil.test.ts` (reusa o `html(documento, erro)`, o `DOC` e o import de `abaDoErro` que o 6b já tem no arquivo; o `DOC` é o `documentoFalso()` do 3a, com o rastreio vazio):

```ts
// ---------------------------------------------------------------- PR 7: o "Avançado" no fim da aba

test("Avançado: o último bloco da aba, fechado; o erro do rastreio abre o bloco no campo, não no aviso do topo", () => {
  const h = html();
  const avancado = h.indexOf('id="bio-avancado"');
  assert.ok(avancado > -1, "a aba Perfil não tem o Avançado");
  assert.ok(avancado > h.indexOf('id="bio-selo-titulo"'), "o Avançado não é o último bloco da aba");
  assert.match(h, /id="bio-avancado" aria-expanded="false"/);

  const comErro = html(DOC, { campo: "rastreio.ga4Id", mensagem: "Confira o ID de medição." });
  assert.match(comErro, /id="bio-avancado" aria-expanded="true"/);
  assert.match(comErro, /<p id="bio-rastreio-ga4Id-erro"[^>]*>Confira o ID de medição\.<\/p>/);
  assert.doesNotMatch(comErro, /id="bio-aba-aviso"/);
});

test("Avançado: o erro do salvar no rastreio é da aba Perfil (o editor troca para ela)", () => {
  assert.equal(abaDoErro({ campo: "rastreio.ga4Id", mensagem: "x" })?.id, "perfil");
  assert.equal(abaDoErro({ campo: "rastreio.metaPixelId", mensagem: "x" })?.id, "perfil");
});
```

Se o último cartão da aba em `main` não for o do selo (`id="bio-selo-titulo"`), usar no `indexOf` o título do último cartão.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-perfil.test.ts`
Expected: FAIL nos dois novos — "a aba Perfil não tem o Avançado" e `undefined !== "perfil"`; os do 6b passam.

- [ ] **Step 3: Implement a dona** — em `abas.tsx`, na entrada `{ id: "perfil", … }`: a `dona` passa a `/^(perfil|confere|feitoComGirumo|rastreio)(\.|$)/.test(campo)` e sai a linha de comentário de cima ("Sem `rastreio`: o PR 7 acrescenta…").

- [ ] **Step 4: Implement o encaixe** — em `aba-perfil.tsx`:

1. Import, junto dos locais: `import { BlocoAvancado, LUGARES_DO_AVANCADO } from "./bloco-avancado";`
2. No fim do `LUGARES_DO_PERFIL`, depois de `"confere.linhas",`: `...LUGARES_DO_AVANCADO, // PR 7: o erro rastreio.* fica embaixo do campo do Avançado`. Continua constante de módulo (o hook a usa nas dependências do efeito). Sem isso, o erro `rastreio.*` não tem lugar na aba e vai para o aviso do topo (`AvisoDaAba`).
3. No `return` da `AbaPerfil`, depois de `<CartaoSelo {...cartao} />`:

```tsx
      <BlocoAvancado
        rastreio={rascunho.documento.rastreio}
        mudarDocumento={mudarDocumento}
        erroDe={erros.erroDe}
        corrigiu={erros.corrigiu}
      />
```

4. No comentário da `AbaPerfil`, trocar "(o PR 7 filtra o `erro` antes do `useErroDaAba`)" por "(os lugares dele estão no `LUGARES_DO_PERFIL`)".

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-perfil.test.ts src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/bloco-avancado.test.ts`
Expected: PASS, `fail 0` (os do 6a/6b sem mudança — nenhum deles fixa `rastreio` sem dona; se algum fixar, trocar pela asserção nova, que é a mudança deste PR).

- [ ] **Step 6: Lint**

Run: `npx eslint src/components/painel/link-da-bio` e `npm run painel:check`
Expected: sem erro nem aviso; `painel:check OK`.

- [ ] **Step 7: Commit**

```bash
git add src/components/painel/link-da-bio/abas.tsx src/components/painel/link-da-bio/aba-perfil.tsx src/components/painel/link-da-bio/aba-perfil.test.ts
git commit -m "feat(link-da-bio): advanced block at the end of the profile tab"
```

---

### Task 6: Gate, conferência no navegador, revisão de segurança, PR e merge

**Files:** nenhum no repo. O script da conferência fica no scratchpad da sessão (ou em `%TEMP%\bio-rastreio\`).

- [ ] **Step 1: Gate da web** (em `apps/web`):

```bash
npm run lint
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm run painel:check
npm run brand:check
npm test
```

Expected: lint sem erro; os dois `tsc` sem saída; `painel:check OK`; `brand:check` verde; `npm test` com `fail 0`.

- [ ] **Step 2: Conferência no Chromium** (fora do repo; offline: tudo que é da Meta e do Google é respondido pelo script) — salvar como `<scratchpad>/bio-rastreio.ts`:

```ts
// Conferência do rastreio no Chromium — FORA do repositório. Rodar em apps/web:
//   npx tsx --import ./src/test/server-only-shim.mjs <caminho>/bio-rastreio.ts
// Serve a página de verdade (renderPaginaBio + buildCsp("bio")). O fbevents.js e o gtag.js são de
// mentira e mandam cada evento como os de verdade (imagem no /tr da Meta, beacon no /g/collect do GA4);
// nenhum request sai da máquina. Reprova: violação de CSP, erro de página, evento faltando ou sobrando,
// Lead, e qualquer request pra fora na página sem rastreio.
import { createRequire } from "node:module";
import path from "node:path";

import type { DadosRender } from "@/lib/bio/documento";
import { renderPaginaBio } from "@/lib/bio/render";
import { buildCsp } from "@/lib/security/csp";
import { dadosFalsos } from "@/test/bio-dados-falsos";

const { chromium } = createRequire(path.join(process.cwd(), "package.json"))("@playwright/test") as typeof import("@playwright/test");

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const FBEVENTS = `(function(){var f=window.fbq;function manda(a){if(a[0]==='init')return;var i=new Image();i.src='https://www.facebook.com/tr/?ev='+encodeURIComponent(a[1])+'&cd='+encodeURIComponent(JSON.stringify(a[2]||{}))}
f.callMethod=function(){manda(arguments)};var q=f.queue.slice();f.queue=[];q.forEach(function(a){manda(a)})})();`;
const GTAG = `(function(){var dl=window.dataLayer;function manda(a){if(a[0]==='config')navigator.sendBeacon('https://region1.google-analytics.com/g/collect?en=page_view');if(a[0]==='event')navigator.sendBeacon('https://region1.google-analytics.com/g/collect?en='+encodeURIComponent(a[1])+'&ep='+encodeURIComponent(JSON.stringify(a[2]||{})))}
dl.forEach(manda);dl.push=function(a){manda(a);return 0}})();`;

function comRastreio(metaPixelId: string, ga4Id: string): DadosRender {
  const d = dadosFalsos();
  return { ...d, documento: { ...d.documento, rastreio: { metaPixelId, ga4Id } } };
}

async function roda(dados: DadosRender): Promise<{ problemas: string[]; fora: string[] }> {
  const html = renderPaginaBio(dados, { modo: "publica", nonce: NONCE, animarEntrada: false });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const problemas: string[] = [];
  const fora: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) problemas.push(m.text());
  });
  page.on("pageerror", (e) => problemas.push(e.message));
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.host === "bio.local") {
      if (u.pathname === "/") {
        return route.fulfill({
          body: html,
          headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": buildCsp("bio", NONCE, false) },
        });
      }
      return route.fulfill({ status: 204, body: "" }); // fonte, imagem, beacon do 4b
    }
    fora.push(`${u.host}${u.pathname}${u.search}`);
    if (u.host === "connect.facebook.net") return route.fulfill({ body: FBEVENTS, headers: { "content-type": "text/javascript" } });
    if (u.host === "www.googletagmanager.com") return route.fulfill({ body: GTAG, headers: { "content-type": "text/javascript" } });
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto("http://bio.local/");
  await page.waitForTimeout(400);
  // O toque dispara o evento, mas a página não sai (o clique é cancelado antes, na captura). `dispatchEvent`
  // e não `click()`: a pílula "Abrindo…" fixa embaixo pode cobrir o botão seguinte e roubar o clique de mouse.
  await page.evaluate(() => addEventListener("click", (e) => e.preventDefault(), true));
  for (const tipo of ["whatsapp", "grupo", "link", "endereco"]) await page.locator(`[data-tipo="${tipo}"]`).first().dispatchEvent("click");
  await page.waitForTimeout(600);
  await browser.close();
  return { problemas, fora };
}

const conta = (lista: string[], trecho: string) => lista.filter((x) => x.includes(trecho)).length;

async function main() {
  const falhas: string[] = [];
  const com = await roda(comRastreio("1234567890", "G-TESTE12345"));
  console.log("com rastreio:", JSON.stringify(com.fora, null, 1));
  falhas.push(...com.problemas);
  const esperado: [string, number][] = [
    ["connect.facebook.net/en_US/fbevents.js", 1],
    ["www.googletagmanager.com/gtag/js?id=G-TESTE12345", 1],
    ["ev=PageView", 1],
    ["ev=Contact", 1],
    ["ev=BioToque", 3],
    ["en=page_view", 1],
    ["en=bio_toque", 4],
    ["Lead", 0],
  ];
  for (const [trecho, n] of esperado) {
    if (conta(com.fora, trecho) !== n) falhas.push(`com rastreio: ${trecho} ${conta(com.fora, trecho)}x (esperado ${n})`);
  }
  const sem = await roda(dadosFalsos());
  falhas.push(...sem.problemas);
  if (sem.fora.length) falhas.push(`sem rastreio saiu request pra fora: ${sem.fora.join(", ")}`);
  console.log(falhas.length ? `FALHAS:\n${falhas.join("\n")}` : "TUDO OK");
  process.exitCode = falhas.length ? 1 : 0;
}

void main();
```

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs "<scratchpad>/bio-rastreio.ts"`
Expected: a lista com fbevents.js, gtag.js, `ev=PageView`, `ev=Contact`, três `ev=BioToque` (`grupo`, `link`, `endereco` — o `<details>` começa fechado, então o toque abre e conta), `en=page_view` e quatro `en=bio_toque`, e no fim `TUDO OK`. Uma violação de CSP aparece como falha com o texto do Chromium ("violates the following Content Security Policy directive").

- [ ] **Step 3: Roteiro no painel** (dev local com `HUBFLOW_USE_SUPABASE=1` contra o banco de dev, servidor subido do `apps/web` deste worktree — o `preview_start` serve o checkout principal; logado como dono de uma loja de teste do dev; sem credencial na máquina, pedir ao Igor para entrar). Em `/painel/link-da-bio`, aba Perfil:
  1. O "Avançado" é o último bloco, fechado, sem "Configurado". Tab chega no botão; Enter abre; os dois campos aparecem.
  2. Colar ` 1234567890 ` no Pixel e ` g-ab12cd34ef ` no GA4 → aparece "Alterações não salvas"; Salvar → passa e os campos voltam como `1234567890` e `G-AB12CD34EF` (o zod do PR 2 limpou); fechado, o bloco diz "Configurado".
  3. Trocar o GA4 por `G-AB`, ir para a aba Links e tocar em Salvar → a tela vai para a aba Perfil, o Avançado está aberto, a frase "Confira o ID de medição…" fica embaixo do GA4 (o aviso do topo da aba não aparece) e o foco está no campo; digitar uma letra some com a frase e o bloco continua aberto.
  4. Corrigir, Salvar, abrir `/bio/<slug>` local (o `next dev` serve a CSP do middleware): no DevTools, aba Network, o `fbevents.js` e o `gtag/js` carregam e o console não tem violação de CSP. Depois, apagar os dois ids e salvar (a loja do dev fica sem rastreio).

- [ ] **Step 4: Revisão de segurança** (a CSP fica mais larga e um dado do lojista passa a entrar num `<script>`): despachar o agente **Security Engineer** com `git diff origin/main...HEAD` e este roteiro: (a) nenhum id entra no JS sem passar em `ID_PIXEL`/`ID_GA4` dentro do `scriptDaPagina`, qualquer que seja quem chama; (b) o literal do id sai por `JSON.stringify` e o JS continua sem `<`; (c) a CSP `"bio"` ganhou só os hosts da lista, sem `'unsafe-inline'`, `'unsafe-eval'` (fora do dev) nem `'strict-dynamic'`; `object-src`, `base-uri`, `form-action` e `frame-ancestors` continuam fechados; (d) a prévia do painel continua sem `<script>`; (e) o painel não monta HTML com o id. Corrigir CRITICAL/HIGH antes de seguir.

- [ ] **Step 5: Gate completo** (na raiz do worktree; Windows PowerShell 5.1, sem `&&`): `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`
Expected: `Verificacao local concluida com sucesso.` (Disco cheio/ENOSPC: deixar o CI validar.)

- [ ] **Step 6: Defasagem** — `git fetch origin main; git log HEAD..origin/main --oneline` → vazio ou poucos; senão `git rebase origin/main` e repetir o Step 5.

- [ ] **Step 7: PR** — `git push -u origin feat/link-da-bio-pr7-rastreio`; PR "feat(bio): Meta Pixel and GA4 on the link-in-bio page (link da bio, PR 7)" com: os eventos (Pixel `PageView`/`Contact`/`BioToque {botao}`; GA4 `page_view`/`bio_toque {botao}`; o "Como chegar" só ao abrir; nunca `Lead`), a CSP nova (as 10 diretivas), o bloco Avançado, as medidas (JS sem e com os dois ids, do teste de 3 KB), o "IGUAL" do snapshot, o "TUDO OK" do Chromium, o resultado da revisão de segurança, a tabela de decisões resumida, e terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 8: CI verde → merge** (a `main` não tem proteção: merge à mão, no verde):

```bash
gh pr checks <n> --watch
gh pr merge <n> --squash --delete-branch
```

Vermelho só no e2e por `processing`/timeout de rede → rerun (achado "CI: corrida no banco dev"), nunca afrouxar teste.

---

### Task 7: Prova em produção, quadro e fechamento

**Files:** nenhum.

- [ ] **Step 1: O deploy é este commit?** Em `/admin/configuracoes`, "Deploy" mostra o SHA do merge. Antes disso nada abaixo vale.

- [ ] **Step 2: CSP em produção** (PowerShell; `curl.exe -sI` é HEAD: não conta visita):

```powershell
(curl.exe -sI "https://www.girumo.com.br/bio/<slug-da-loja-de-teste>" | Select-String "^content-security-policy:")
```

Expected: **uma** linha, com `script-src 'self' 'nonce-…' https://connect.facebook.net https://www.googletagmanager.com` e o resto da lista da Task 3. Duas linhas → CSP dupla (reverter este PR e abrir o achado). Repetir na raiz do domínio próprio da loja de teste, se ela tiver.

- [ ] **Step 3: Ids de teste na loja de teste** — o Igor cria (ou indica) um Pixel e uma propriedade GA4 **só de teste** (nunca o pixel de cliente; o da Girumo só se não houver outro, e aí apagar os ids no fim). No painel de produção da loja de teste: Link da bio → Perfil → Avançado → preencher os dois → Salvar. O cabeçalho do bloco diz "Configurado"; a página está "No ar".

- [ ] **Step 4: Meta — Test Events.** Gerenciador de Eventos → o pixel de teste → Testar eventos → "Testar eventos do navegador" → URL `https://www.girumo.com.br/bio/<slug>` → Abrir site. Na página, **Ctrl+clique** em WhatsApp, Grupo VIP e um link comum (Ctrl+clique abre o destino noutra aba e mantém a página, então o evento sai) e toque no "Como chegar" (abre o endereço na mesma página). Expected em Test Events: `PageView`, `Contact`, e `BioToque` com `botao` = `grupo`, `link`, `endereco`; nenhum `Lead` vindo da URL `/bio/…` (um `Lead` da URL `/r/…` depois do Grupo VIP é o evento da campanha, se ela usar o mesmo pixel). `SubscribedButtonClick` ou `Microdata` são os eventos automáticos da Meta (configuração automática do pixel), não deste PR. Print da tela.

- [ ] **Step 5: GA4 — DebugView.** Tag Assistant (`tagassistant.google.com`) → conectar a URL da página → tocar nos mesmos botões → no GA4, Administrador → DebugView: `page_view` e `bio_toque` com o parâmetro `botao` (`click`, `scroll` e `user_engagement` são da medição otimizada do GA4, não deste PR). Se o Tag Assistant não conectar (o console da página acusa CSP), **não** alargar a CSP para o depurador: usar o relatório Tempo real do GA4 e o DevTools → Network filtrando `collect` (`en=bio_toque` com `ep.botao=`), e anotar no PR. Print.

- [ ] **Step 6: Console limpo** — com a página aberta e os dois ids, o console do DevTools não tem nenhuma violação de CSP. Colar no PR (comentário) os prints dos Steps 4–6 e a saída do Step 2.

- [ ] **Step 7: Quadro** (prod; mesmo jeito da Task 0). O 6b (Parte 2) já move o card para `no_ar_nao_verificado`:

```sql
select key, status, blocker from public.board_features where key = 'link-da-bio';
-- Só se o status ainda for em_construcao (move_card para o mesmo status não grava evento):
select public.move_card('link-da-bio', 'no_ar_nao_verificado',
  'PR 7: Pixel da Meta e GA4 na página e o bloco Avançado no Perfil; a série inteira em main', 'PR #<n>');
-- O move_card não mexe no blocker:
update public.board_features
   set blocker = 'Falta a prova do §13 da spec (loja de teste no celular e no navegador do Instagram com visita e toques no relatório; domínio próprio da piloto; Lighthouse ≥ 90). Rastreio provado no PR #<n>.',
       updated_at = now()
 where key = 'link-da-bio';
```

Se a prova do §13 inteira (passos 1–3) já estiver colhida nesta sessão, em vez disso: `select public.move_card('link-da-bio', 'no_ar_verificado', 'Prova do §13 e do rastreio colhidas em <data>', '<link dos prints e do Lighthouse>');` e `update public.board_features set blocker = null, updated_at = now() where key = 'link-da-bio';`.

- [ ] **Step 8: Grafo** — sugerir ao Igor (PowerShell): `rag insert "decisão: link da bio dispara Pixel (PageView, Contact no WhatsApp, BioToque nos outros) e GA4 (page_view, bio_toque) pelo script inline com nonce, ids revalidados no scriptDaPagina; Como chegar só conta ao abrir, como o beacon; nunca Lead (é do /r/); CSP bio com os hosts da Meta e do GA fixos" --source decisao-2026-10-19-link-da-bio-pr7`.

- [ ] **Step 9: Fechar** — apagar o worktree (`git worktree remove .claude/worktrees/link-da-bio-pr7`) e reportar "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite do PR

- `scriptDaPagina` com o nome e a assinatura do §9, agora lendo `rastreio`: Pixel `PageView` ao abrir, `Contact` no WhatsApp, `BioToque {botao}` nos outros; GA4 `config` (`page_view`) e `bio_toque {botao}`; o "Como chegar" só conta ao abrir; nunca `Lead`.
- Sem rastreio (null, vazio ou id fora da regra), o JS é o do 4b byte a byte (snapshot "IGUAL"); com os dois ids, ES5, sem `<`, ≤ 3 KB (2060 B no rascunho).
- `renderPaginaBio` passa `documento.rastreio` só no modo `"publica"` e só quando há id; continua um `<script>` só, com nonce; página cheia com os dois ids ≤ 40 KB.
- CSP `"bio"` exatamente a do Global Constraints, um header só em produção (`curl.exe -sI`).
- Painel: "Avançado" fechado no fim da aba Perfil, com "Configurado" quando há id; erro do salvar no `rastreio.*` leva à aba Perfil, abre o bloco, fica embaixo do campo certo (`aria-invalid`, `aria-describedby`), foco nele, some ao digitar; id colado com espaço ou GA4 em minúsculas salva limpo.
- Testes novos verdes: `script` +8, `index` +4, `csp` (1 trocado), `editor` +1, `bloco-avancado` 4, `aba-perfil` +2; suíte inteira, os dois `tsc`, lint, `painel:check`, `brand:check`, build e CI verdes; conferência no Chromium "TUDO OK"; revisão de segurança sem CRITICAL/HIGH.
- Mergeado na mesma sessão; prova em produção (Test Events e DebugView, ou o substituto anotado) colada no PR; card e `blocker` atualizados.

## Comandos de verificação

```bash
# em apps/web do worktree do PR
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/script.test.ts src/lib/bio/render/index.test.ts src/lib/security/csp.test.ts src/lib/bio/editor.test.ts src/components/painel/link-da-bio/bloco-avancado.test.ts src/components/painel/link-da-bio/aba-perfil.test.ts
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm run lint
npm run painel:check
npm run brand:check
npm test
npx tsx --import ./src/test/server-only-shim.mjs "<scratchpad>/bio-rastreio.ts"   # conferência no Chromium (Task 6)
# na raiz do worktree (PowerShell 5.1)
powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1
# depois do deploy
(curl.exe -sI "https://www.girumo.com.br/bio/<slug>" | Select-String "^content-security-policy:")
```

## Riscos e pontos de atenção

- **Evento perdido no toque rápido.** O toque não espera o fbevents.js/gtag.js: se a pessoa toca antes de eles carregarem (4G lento) e o botão navega na mesma aba (link, grupo), o evento fica na fila e se perde; o GA4 já carregado sai por beacon, a imagem da Meta pode ser cancelada pela navegação. Mesmo teto das LPs com o `GroupJoin`. Se a contagem da Meta ficar muito abaixo da nossa (`bio_contagens`), o próximo passo é a API de Conversões no servidor, não segurar a navegação.
- **A regra do "Como chegar" mora em dois lugares.** A condição `a.tagName!=="SUMMARY"||!a.parentNode.open` está no beacon (4b) e nos eventos (PR 7), no mesmo handler. Quem mudar uma muda a outra; os testes "endereço: o beacon sai quando…" (4b) e "Como chegar: o evento sai quando…" (PR 7) acusam a diferença.
- **`ga4Id` sem teto no §4** (`^G-[A-Z0-9]{4,}$`). O PR 2 pôs `.max(30)` no zod e o painel `maxLength` 30; o `ID_GA4` do `script.ts` segue o §4 sem teto. Um documento escrito por fora do zod com um GA4 enorme só incha o JS além de 3 KB (o conteúdo é só `G-` e alfanumérico: não abre injeção).
- **40 KB no pior caso.** O 3a mediu o pior caso teórico (17 URLs no limite de 500 e a mensagem do WhatsApp no de 300) em 39 378 B, com o JS do 3a (906 B). O 4b soma 206 B ao JS (906 → 1112 B) e os dois rastreadores ~950 B (1112 → 2060 B): ~40 530 B, abaixo dos `40 * 1024` do teste por ~430 B. Se o 3b (CSS e marcação maiores) já tiver comido essa folga, esse pior caso passa: medir de novo como o 3a mediu. O caso realista (o teste da Task 2) fica em ~32 KB.
- **Linhas do 4b.** O `montar` copia as linhas do plano do 4b; o snapshot (Task 0 Step 4 × Task 1 Step 5) prova que nada mais mudou, e os testes do 4b continuam rodando com `rastreio: null`.
- **Caminho e limpeza do zod no rastreio.** O bloco depende de o `documentoBio` reportar `rastreio.metaPixelId`/`rastreio.ga4Id` e de limpar o que o painel guarda como foi digitado (PR 2: `trim` nos dois, GA4 com `toUpperCase`). O teste do `editor.test.ts` (Task 4) acusa as duas coisas.
- **Aba Perfil do 6b.** O encaixe segue o plano do 6b (`LUGARES_DO_PERFIL` constante de módulo, `erros = useErroDaAba(…)` com `erroDe`/`erroSolto`/`corrigiu`, `CartaoSelo` por último). Se a aba em `main` divergir do plano, valem os nomes de `main` (Task 0, Step 3). Os dois testes da Task 5 cobrem o encaixe e o caminho do erro no render; o foco (efeito + `requestAnimationFrame`) só o passo 3 do roteiro (Task 6) mostra — não pular.
- **Google Signals / Tag Assistant.** A CSP segue a lista base do GA4. Propriedade com Google Signals pode ter requisições extras bloqueadas (o `page_view` e o `bio_toque` passam), e o Tag Assistant pode não conectar sob a CSP fechada; nos dois casos o console mostra. Não alargar a CSP sem decisão (a lista de hosts é fechada de propósito, como no `click-redirect`).
- **Consentimento.** A página não tem banner, como as LPs e o `/r/`: ligar o Pixel/GA4 é escolha do lojista no painel.
- **Flag `s` em regex literal** dá TS1501 no `tsc` com target ES2017 (TypeScript 5.9): os testes deste plano usam `[\s\S]`. (Os planos do 6a e do 6b têm `/…/s` em teste — o 6b, no "Foto e logo" do `aba-perfil.test.ts`, que este PR edita: se o `tsc` acusar ali, é a mesma troca.)

## Interface com os outros PRs

### O que este PR exporta

```ts
// apps/web/src/lib/bio/render/script.ts — contrato do §9 (assinatura igual; agora lê o rastreio)
export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string;
// null, ids vazios ou fora de /^\d{5,20}$/ e /^G-[A-Z0-9]{4,}$/ → o JS do 4b, byte a byte.
// Com id válido: Pixel (snippet oficial; init + PageView; no toque Contact se data-tipo = "whatsapp",
// senão trackCustom BioToque {botao: data-tipo}) e GA4 (dataLayer, gtag.js por createElement,
// config = page_view; no toque bio_toque {botao}). O <summary> só conta ao abrir. ES5, sem "<", ≤ 3 KB. Nunca Lead.

// apps/web/src/lib/bio/render/index.ts — contrato do §9 (assinatura igual)
export function renderPaginaBio(
  d: DadosRender,
  o: { modo: "publica" | "previa"; nonce: string | null; animarEntrada: boolean },
): string; // "publica": scriptDaPagina({ rastreio: documento.rastreio }) se algum id não está vazio; "previa": sem <script>

// apps/web/src/lib/security/csp.ts — assinatura igual; o ramo "bio" ganha os hosts fixos
export function buildCsp(surface: NonceSurface, nonce: string, isDev: boolean): string;
// "bio" = default-src 'none'; script-src 'self' 'nonce-…' https://connect.facebook.net https://www.googletagmanager.com;
// style-src 'self' 'nonce-…'; img-src 'self' data: https://www.facebook.com https://*.google-analytics.com https://*.googletagmanager.com;
// font-src 'self'; connect-src 'self' https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com;
// object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

// apps/web/src/lib/bio/editor.ts — duas chaves novas em MENSAGENS_DOS_CAMPOS
// "rastreio.metaPixelId": "Confira o ID do pixel: só números, de 5 a 20. Está no Gerenciador de Eventos da Meta."
// "rastreio.ga4Id": "Confira o ID de medição: G- e pelo menos 4 letras ou números, como G-AB12CD34EF."

// apps/web/src/components/painel/link-da-bio/abas.tsx — a dona do Perfil passa a ser
// /^(perfil|confere|feitoComGirumo|rastreio)(\.|$)/ (abaDoErro({ campo: "rastreio.*" })?.id === "perfil")

// apps/web/src/components/painel/link-da-bio/bloco-avancado.tsx — novo ("use client")
export type CampoDoRastreio = keyof DocumentoBio["rastreio"]; // "metaPixelId" | "ga4Id"
export type ErrosDoRastreio = Partial<Record<CampoDoRastreio, string>>;
export const LUGARES_DO_AVANCADO: readonly ["rastreio.metaPixelId", "rastreio.ga4Id"];
export type PropsDoConteudo = {
  rastreio: DocumentoBio["rastreio"];
  aberto: boolean;
  erros: ErrosDoRastreio;
  aoAlternar: () => void;
  aoMudar: (campo: CampoDoRastreio, valor: string) => void;
};
export function ConteudoDoAvancado(p: PropsDoConteudo): React.JSX.Element;
export type PropsDoAvancado = {
  rastreio: DocumentoBio["rastreio"];
  mudarDocumento: PropsDaAba["mudarDocumento"];
  erroDe: (lugar: string) => string | undefined; // do useErroDaAba da aba Perfil
  corrigiu: (lugar: string) => void;             // idem
};
export function BlocoAvancado(p: PropsDoAvancado): React.JSX.Element;
```

Ids de contrato (testes e roteiro): `bio-avancado` (botão, com `aria-expanded`), `bio-avancado-campos`, e pelo `idNaTela` do 6b `bio-rastreio-metaPixelId` e `bio-rastreio-ga4Id` (+ `-erro`, `-ajuda`). `aba-perfil.tsx` (6b) passa a terminar em `<BlocoAvancado … />`, depois do `CartaoSelo`, e a ter `...LUGARES_DO_AVANCADO` no fim do `LUGARES_DO_PERFIL`.

### O que este PR usa

| Símbolo | Arquivo | PR |
|---|---|---|
| `type DocumentoBio` (`rastreio: { metaPixelId: string; ga4Id: string }`), `type DadosRender`, `documentoBio` (regras do §4 no rastreio, `trim` nos dois, GA4 `toUpperCase` + `max(30)`, caminho `rastreio.<campo>`), `documentoPadrao(i: { nome: string; campanhaId: string \| null }): DocumentoBio` | `apps/web/src/lib/bio/documento.ts` | 2 |
| `type PaginaBio` (só tipo: módulo `server-only`) | `apps/web/src/lib/stores/bio-pages.ts` | 2 |
| `scriptDaPagina` (o array do `JS` que vira `montar`), `renderPaginaBio` (a linha do `script`); nos testes `JS`, `type Ouvinte`, `publica`, `conta`, `NONCE` | `apps/web/src/lib/bio/render/script.ts`, `index.ts` e os `.test.ts` | 3a |
| `dadosFalsos(): DadosRender`, `dadosCheios(): DadosRender` (rastreio vazio) | `apps/web/src/test/bio-dados-falsos.ts` | 3a |
| `NonceSurface` com `"bio"`, o ramo `"bio"` do `buildCsp`, `scriptSrc`; no teste `nonceSeenByNext` e o laço com `"bio"` | `apps/web/src/lib/security/csp.ts` (+ `.test.ts`) | 4a |
| as duas linhas do beacon no ramo `[data-link]` (`var p=d.body.getAttribute("data-pagina");` e o `if(p&&navigator.sendBeacon&&(a.tagName!=="SUMMARY"\|\|!a.parentNode.open))…`); no teste, `elemento(attrs, extra?: { tagName?: string; parentNode?: { open: boolean } })` | `apps/web/src/lib/bio/render/script.ts` (+ `.test.ts`) | 4b |
| `type ErroDeCampo = { campo: string; mensagem: string }`, `MENSAGENS_DOS_CAMPOS`, `erroDoDocumento(documento: DocumentoBio): ErroDeCampo \| null`, `estadoDe(pagina: PaginaBio): EstadoSalvavel`, `type ContextoDoEditor` | `apps/web/src/lib/bio/editor.ts` | 6a |
| `idNaTela(campo: string): string` (`"rastreio.ga4Id"` → `"bio-rastreio-ga4Id"`), `lugarDoErro(campo: string, lugares: readonly string[]): string \| null` | `apps/web/src/lib/bio/editor.ts` | 6b |
| `type PropsDaAba` (`rascunho`, `mudarDocumento`, `erro`, `limparErro`, …), `abaDoErro(erro: ErroDeCampo \| null): AbaDoEditor \| undefined`, a entrada do Perfil em `ABAS` | `apps/web/src/components/painel/link-da-bio/abas.tsx` | 6a / 6b |
| `focarDepois(id: string): void` | `apps/web/src/components/painel/link-da-bio/use-editor-bio.ts` | 6a |
| `useErroDaAba(erro: ErroDeCampo \| null, limparErro: () => void, lugares: readonly string[], versao: number): { erroDe; erroSolto; corrigiu }`, `ID_DO_AVISO_DA_ABA = "bio-aba-aviso"` | `apps/web/src/components/painel/link-da-bio/erro-da-aba.tsx` | 6b |
| `AbaPerfil(p: PropsDaAba)`, `LUGARES_DO_PERFIL: readonly string[]`, `const erros = useErroDaAba(erro, limparErro, LUGARES_DO_PERFIL, pagina.versao)`, o `CartaoSelo` (`id="bio-selo-titulo"`) como último cartão; no teste, `html(documento?: DocumentoBio, erro?: ErroDeCampo \| null): string`, `DOC` e o import de `abaDoErro` | `apps/web/src/components/painel/link-da-bio/aba-perfil.tsx` (+ `.test.ts`) | 6b |
| `cn`, `ChevronDown`, `.pn-card`, `.pn-chip`; middleware que aplica `buildCsp("bio", …)` em `/bio/*` e na raiz do domínio próprio | já em `main` | 4a / — |

### Quem usa o quê

Ninguém depois: é o último PR da série. O que fica para a prova do §13 (card `no_ar_verificado`): a página publicada da loja de teste e o relatório (4a/4b/6b), o domínio próprio da piloto e o Lighthouse ≥ 90.
