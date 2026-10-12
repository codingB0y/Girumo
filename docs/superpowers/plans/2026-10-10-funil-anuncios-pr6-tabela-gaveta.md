# Funil de anúncios — PR 6: tabela por campanha, gaveta do anúncio e cartões no celular Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na aba Anúncios, o lojista abre campanha › conjunto › anúncio numa tabela com um mini-funil deitado em cada linha (gasto, cadastros, compraram, vendido, retorno), clica "Ver quem" num anúncio e vê numa gaveta o funil dele, por onde a pessoa viu, quem comprou (nome do WhatsApp, telefone mascarado, grupo, datas, total) e quantos entraram e ainda não compraram, com links para o Contatos filtrado. No celular, um cartão por campanha com funil em pé.

**Architecture:** Três PRs. **6a (dados):** função SQL nova `attribution_people` (DDL do Igor, nos dois bancos) com a MESMA regra de `attribution_report` (texto conferido por um teste sem banco), filtrada por um anúncio, devolvendo as pessoas; a rota `GET /api/resultados/anuncios/pessoas` chama a função pelo service-role com o tenant da sessão, mascara o telefone e, com `lista=compraram|sem-compra`, devolve os contatos inteiros para o Contatos filtrado (lidos por id em lotes de 100). **6b (tela):** regras puras em `anuncios-linhas.ts` (árvore, colunas, geometria dos mini-funis, textos da gaveta) e componentes que só desenham: tabela + mini-funil A, cartões B e a gaveta (a `Folha` do painel). **6c (Contatos filtrado):** o Contatos lê o filtro do anúncio na URL e mostra só aquelas pessoas, com uma faixa no topo. O funil da gaveta sai da própria linha do relatório; a rota nova só traz pessoas.

**Tech Stack:** Next 15 App Router (route handler + componentes cliente), Supabase service-role (`rpc`), PL/pgSQL, zod 4, Tailwind 4 (tema G2), `node:test` + `react-dom/server` (`renderToStaticMarkup`), Playwright (403 da vendedora no CI).

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md` (§1 regras, §4 telas — tabela, gaveta, celular —, §6 bordas, §7 segurança, §8 testes). Mockups: MiniFunil, Anuncio, Celular, Main (`scratchpad/mockup/project/*.dc.html`, só referência visual).

**Depende de:**
- PR 5a mergeado: `lib/resultados/periodo-anuncios.ts` (`periodoDaBusca`, `Periodo`), `lib/stores/relatorio-de-anuncios.ts` (`PeriodoRecusado`), `semGasto` na rota do relatório e o tipo da tela `RelatorioParaTela` (`gasto: number | null` no total e nas linhas; `RelatorioAnuncios` continua o contrato estrito do SQL, usado aqui só no teste de integração).
- PR 5b mergeado (só para o 6b): `lib/resultados/anuncios-tela.ts`, `components/painel/resultados/anuncios/{aba-anuncios,funil-grande}.tsx`.
- PR 3a mergeado: `telefoneMascarado` em `lib/pages/phone.ts`. **Se o 3a ainda não estiver em `main`** quando o 6a começar, executar antes a Task 1 do plano do PR 3 (`2026-10-10-funil-anuncios-pr3-integracao-tela.md`) como está lá, com o commit de lá — nunca uma cópia da função aqui.

Índice: `docs/superpowers/plans/2026-10-10-funil-anuncios-00-indice.md`.

## Divisão em três PRs

| PR | Branch | Tasks | Arquivos | Depende de |
|---|---|---|---|---|
| **6a** — pessoas do anúncio | `feat/funil-anuncios-pr6a-pessoas` | 1–5 | 11 | 5a, 3a |
| **6b** — tabela, gaveta, cartões | `feat/funil-anuncios-pr6b-tabela` | 6–9 | 9 | 6a, 5b |
| **6c** — Contatos filtrado | `feat/funil-anuncios-pr6c-contatos` | 10 | 3 | 6a |

Cada um sai de `origin/main` com as dependências já mergeadas. O 6a sozinho não muda nada visível. **Ordem recomendada: 6a → 6c → 6b**: o 6c só precisa do 6a, e indo antes do 6b os links "Ver em Contatos" da gaveta já chegam a um Contatos que filtra (no caminho inverso, entre os dois merges o link abre a lista inteira — sem erro, mas sem filtro). Os 11 arquivos do 6a passam um pouco dos ~10 porque três deles são da DDL (migração, `apply-order`, baseline). O Contatos virou PR próprio porque, com o teste da faixa, o 6b passaria de 12 arquivos.

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| **Função SQL nova `attribution_people`** (DDL do Igor nos dois bancos), não TypeScript | A lista de quem comprou tem que dar o mesmo número da coluna "Compraram" do anúncio. O crédito olha **todos** os cadastros da loja com a mesma chave (o último antes do pedido), junta leads e pedidos pela chave de telefone e cruza a coorte — em TS isso são consultas fatiadas por telefone, com variantes de formato, paginadas contra o teto de 1000, e a regra duplicada em outra linguagem. O PR 3 só aguentou TS porque eram 5 pessoas. Na função, uma chamada e o JSON sai inteiro, sem teto | Uma migração a mais nos dois bancos. Os CTEs da regra ficam copiados em duas funções: mudar a regra exige mudar as duas — o teste sem banco "espelho da regra" compara o texto das duas migrações em todo `npm test`, e o de integração "a gaveta bate com a tabela" compara os números |
| **Contatos filtrado = a URL do Contatos com `?de&ate&campanha&conjunto&anuncio&lista=`**; a página lê no mount e chama a mesma rota com `lista=`, que lê os leads por id em lotes de 100 | O Contatos hoje não aceita filtro nenhum na URL, e a lista dele (`/api/leads`) para nas 1000 entradas mais recentes — quem já era do grupo e comprou pelo anúncio pode estar fora delas. Ids na URL estourariam o tamanho com algumas centenas de pessoas | Link com as UTMs na URL (até ~1 KB). A busca e os filtros de status do Contatos continuam funcionando sobre a lista filtrada |
| **"Entraram e ainda não compraram" = entrou pelo anúncio e não tem NENHUM pedido da chave depois da entrada** (decisão do controller), não "nenhum pedido creditado a este anúncio" | A lista serve para remarketing: quem entrou pelo A1 e comprou pelo A2 não pode receber oferta como se não tivesse comprado. A DDL ainda não foi aplicada, então corrige-se no SQL | Quem comprou **antes** de entrar e nada depois continua na lista — é o caso raro de quem compra fora do grupo e só depois entra |
| **Busca da gaveta com teto de 2000, sem aparar no JS** | `lp_captures` não tem teto de UTM (só o `site_captures` corta em 200); o SQL apara os dois lados com `nullif(btrim(...))` | Nenhum: acima de 2000 é URL quebrada, não anúncio |
| **Gaveta = a `Folha` que já existe (`emQualquerLargura`)**: diálogo central de 520 px no computador, folha de baixo no celular — não a gaveta lateral de 560 px do mockup | Reaproveita foco preso, Esc, fundo inerte e portal, já testados no painel | No computador o desenho difere do mockup; virar lateral é um modificador CSS em `.pn-folha` |
| **O funil da gaveta vem da linha do relatório**, que a tabela já tem; a rota da gaveta só traz por onde, compradores e "sem compra" | Um número nunca diverge entre a linha e a gaveta, e a gaveta pinta o funil na hora | Nenhum |
| **"(sem UTM)" abre como as outras campanhas** ("(sem conjunto)" › "(sem anúncio)") e ganha "Ver quem" — o mockup não abria essa linha | Quem chegou sem parâmetros também tem nome e telefone; sem abrir, a gaveta deles não existiria. A árvore fica sem caso especial | Duas linhas a mais quando "(sem UTM)" é aberto |
| **Comprador fora de Contatos** (pedido com telefone, ninguém com o número entrou no grupo) aparece na lista com "não está em Contatos"; "Ver os N em Contatos" conta só quem está lá | São os "21 pedidos sem `lead_id`" da loja-piloto: somem do Contatos, mas são venda do anúncio | Nenhum: a soma da lista continua batendo com "Vendido" |
| **Sem nome do WhatsApp** (o worker grava `name` nulo quase sempre) o título da linha é o telefone mascarado | Não inventar "Novo membro" numa lista de compradores | Nenhum |
| **Taxa do mini-funil usa `porcentagem` do PR 5** ("11%", não o "11,3%" do mockup) | Mesmo formato do funil grande e da faixa | Nenhum |
| **Campanhas ordenadas por vendido** (depois cadastros, depois nome), "(sem UTM)" sempre por último; o SQL devolve em ordem alfabética | Quem vende mais é o que o lojista procura primeiro | Nenhum |

## Global Constraints

- Telefone de terceiro sai **mascarado no servidor** em toda resposta da gaveta (`telefoneMascarado` de `@/lib/pages/phone`, ex. `(62) 9••••-4821`). O número inteiro só sai com `lista=` (Contatos, que já mostra o número inteiro hoje) — spec §7.
- Gasto: nada novo. A rota do relatório já manda `gasto: null` a quem não tem `ads:manage` (`semGasto`, PR 5a); tabela e cartões mostram "—" em gasto, retorno e custo por comprador, nunca "R$ 0". Conjunto e anúncio mostram "—" sempre (spec §1).
- Toda query em tabela com `tenant_id` filtra `.eq('tenant_id', tenantId)`; o `p_tenant` do RPC é **sempre** o do `getRouteTenantContext`, nunca da query string.
- Rota: `getRouteTenantContext(req, { allowEngine: false })`; erro que não é `Response` → 500 com `console.error`, sem mensagem do banco na resposta; `cache-control: no-store`.
- Vendedora: a rota nova **não** entra em `lib/auth/modulos.ts` (fechado por padrão: API 403 pelo guard de `getTenantContext`). As páginas Resultados e Contatos já são bloqueadas para ela pela `GuardaDeModulo`.
- DDL só pelo Igor, nos **dois** bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`), com entrada em `deploy/supabase/apply-order.txt` e baseline regenerada. `security definer` + `set search_path = ''`; `revoke … from public, anon, authenticated`; `grant execute … to service_role`.
- Tema G2: cartões `rounded-xl border border-line-200 bg-paper-0`; números em `font-brand`; dado unitário em `font-data`; escala de texto 12/13/15/20/28/32 só; degraus com `TOM_DO_DEGRAU` (cobalt); bico em `success-700`; nada de Acid; sem gradiente, blur ou raio > 12 px (o `vitrine-lint` reprova).
- Celular (< 768 px): a tabela some (`hidden md:block`) e aparecem os cartões B (`md:hidden`).
- Nomes acessíveis que os testes usam são contrato: `table "Resultado por campanha, conjunto e anúncio"`; botões `Abrir <nome>` / `Fechar <nome>` com `aria-expanded`; botão `Ver quem veio por <anúncio>`; diálogo com o nome do anúncio e `data-testid="gaveta-do-anuncio"`; `list "Funil do anúncio"`; `status "Carregando quem veio por este anúncio"`; botão `Tentar de novo`; heading `Quem comprou`; link `Ver os N em Contatos` / `Ver a pessoa em Contatos`; heading `Entraram e ainda não compraram`; link `Ver em Contatos`; no celular heading `Por campanha`, `article` com o nome da campanha, `list "Funil de <campanha>"`, botão `Ver N conjuntos e M anúncios` / `Fechar conjuntos`.
- Testes: `node:test` + `node:assert/strict`; rodar em `apps/web` com `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Componente: `renderToStaticMarkup`.
- Gate antes do push, em `apps/web`: `npm run lint`, `npx tsc --noEmit --project tsconfig.json`, `npx tsc --noEmit --project tsconfig.e2e.json`, `npm test`; depois o `infra/scripts/verify-local.ps1` do worktree.
- Commits em inglês com prefixo semântico.

## Review Focus

- **Nome de anúncio com caractere especial** (`—`, `%`, `&`, `+`, acento, espaço): da linha para a URL, da URL para a rota, da rota para o SQL tem que voltar idêntico, senão a gaveta abre vazia para o anúncio que vendeu. Coberto: ida e volta em `pessoas-do-anuncio.test.ts` e o corpo do RPC no teste da rota.
- **Comprador que não está em Contatos** (pedido com telefone, sem entrada no grupo): aparece na gaveta com "não está em Contatos", a soma continua batendo com "Vendido", e "Ver os N em Contatos" conta só quem está lá. Coberto: `linhaDoComprador`, conteúdo da gaveta e a rota com `lista=compraram` ignorando `lead_id` nulo.
- **Muita gente em "Entraram e ainda não compraram"** (mais de 100, mais de 1000): lotes de 100 no `in(...)` e nada cortado em 1000. Coberto: rota com 150 ids → duas consultas; integração com 1.500 na loja grande.
- **Operador abrindo a tabela** (sem `ads:manage`): nenhum valor de gasto, retorno ou custo por comprador em tabela e cartão, só "—". Coberto: teste da tabela e dos cartões com gasto `null`.
- **Linha sem cadastro** (campanha que só tem gasto) **ou sem comprador**: mini-funil sem NaN, taxa "—" ou "0%". Coberto: `miniFunilA` com zero e `colunasDaLinha` da campanha só com gasto.
- **Quem entrou pelo A1 e comprou pelo A2** aparecendo em "Entraram e ainda não compraram" do A1 (lista de remarketing com cliente dentro). Coberto: a Carla no teste de integração e `sem_compra ≤ entraram` em cada anúncio.
- **Contatos filtrado com respostas fora de ordem** ("Ver todos" clicado enquanto o filtro ainda carregava) ou com a lista vazia (texto do "ninguém entrou ainda" da Vitrine no lugar do texto do filtro). Coberto: contador "só a última resposta escreve" na página e o teste da `FaixaDoFiltro` vazia.

---

## Arquivos

| Arquivo | PR | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/resultados/pessoas-do-anuncio.ts` (+ `.test.ts`) | 6a | contrato zod de `attribution_people`, versão mascarada para a gaveta, busca na URL (rota e Contatos), `filtroDaUrl`, nomes do nulo (`SEM_*`), guardas do navegador |
| `apps/web/supabase/migrations/20261011120000_funil_anuncios_pessoas.sql` | 6a | `public.attribution_people` |
| `deploy/supabase/apply-order.txt` | 6a | entrada da migração |
| `deploy/supabase/schema-baseline.json` | 6a | regenerada pelo Igor |
| `apps/web/src/lib/resultados/relatorio-anuncios.integration.test.ts` | 6a | espelho da regra (sem banco); casos da gaveta contra o banco de dev, consistência com a tabela, sem teto de 1000 |
| `apps/web/src/lib/stores/relatorio-de-anuncios.ts` (do PR 5a) | 6a | + `pessoasDoAnuncio` |
| `apps/web/src/lib/stores/leads.ts` | 6a | + `listLeadsByIds` (lotes de 100) |
| `apps/web/src/app/api/resultados/anuncios/pessoas/route.ts` (+ `route.test.ts`) | 6a | a rota |
| `apps/web/e2e/vendas-vendedora.spec.ts` | 6a | vendedora recebe 403 na rota nova |
| `apps/web/src/lib/resultados/anuncios-linhas.ts` (+ `.test.ts`) | 6b | árvore, colunas, geometria dos mini-funis A/B e da gaveta, cartão, textos da gaveta |
| `apps/web/src/components/painel/resultados/anuncios/mini-funil.tsx` | 6b | `MiniFunilA` (deitado) e `FunilEmPe` (cartão e gaveta) |
| `apps/web/src/components/painel/resultados/anuncios/tabela-de-anuncios.tsx` | 6b | tabela que abre e fecha |
| `apps/web/src/components/painel/resultados/anuncios/cartoes-de-campanha.tsx` | 6b | cartões B do celular |
| `apps/web/src/components/painel/resultados/anuncios/gaveta-do-anuncio.tsx` | 6b | busca + `Folha` + conteúdo |
| `apps/web/src/components/painel/resultados/anuncios/por-campanha.tsx` (+ `.test.ts`) | 6b | junta tabela, cartões e gaveta |
| `apps/web/src/components/painel/resultados/anuncios/aba-anuncios.tsx` (do PR 5b) | 6b | encaixe de `PorCampanha` |
| `apps/web/src/components/painel/contatos/faixa-do-filtro.tsx` (+ `.test.ts`) | 6c | `tituloDoFiltro` e a faixa do topo (carregando, erro, vazio) |
| `apps/web/src/app/painel/contatos/page.tsx` | 6c | lê o filtro do anúncio na URL; só a última resposta escreve |

---

# PR 6a — quem veio por um anúncio

Antes de tudo (CLAUDE.md, "Regra de PR"), em PowerShell no checkout principal:

```powershell
git fetch origin main
git log HEAD..origin/main --oneline | Measure-Object -Line
git worktree add -b feat/funil-anuncios-pr6a-pessoas ..\pr6a origin/main
```

Confira que `origin/main` tem `apps/web/src/lib/resultados/periodo-anuncios.ts` (PR 5a) e `telefoneMascarado` em `apps/web/src/lib/pages/phone.ts` (PR 3a). Comandos abaixo rodam em `apps/web` do worktree novo, salvo quando dito.

### Task 1: Contrato e busca da gaveta

**Files:**
- Create: `apps/web/src/lib/resultados/pessoas-do-anuncio.ts`
- Test: `apps/web/src/lib/resultados/pessoas-do-anuncio.test.ts`

**Interfaces:**
- Consumes: `telefoneMascarado(raw: string | null | undefined): string` de `@/lib/pages/phone` (PR 3a); `type Periodo = { de: string; ate: string }` de `./periodo-anuncios` (PR 5a); `type Lead` de `@/lib/painel/types`.
- Produces (todos de `@/lib/resultados/pessoas-do-anuncio`):
  - `type PessoasDoAnuncio = { por_origem: { origem: string | null; cadastros: number; vendido: number }[]; compradores: { lead_id: string | null; nome: string | null; telefone: string | null; grupo: string | null; cadastro_em: string; primeira_compra: string; pedidos: number; vendido: number }[]; sem_compra: string[] }`
  - `lerPessoasDoAnuncio(bruto: unknown): PessoasDoAnuncio` — lança `Error("pessoas invalidas: <caminho> <mensagem>")`
  - `type CompradorDaGaveta = { nome: string | null; telefone: string; grupo: string | null; cadastro_em: string; primeira_compra: string; pedidos: number; vendido: number; em_contatos: boolean }`
  - `type PessoasDaGaveta = { por_origem: PessoasDoAnuncio["por_origem"]; compradores: CompradorDaGaveta[]; contatos_dos_compradores: number; sem_compra: number }` — `contatos_dos_compradores` é o número de `lead_id` **distintos** entre os compradores (o N de "Ver os N em Contatos", igual ao tamanho da lista que `lista=compraram` devolve)
  - `paraAGaveta(p: PessoasDoAnuncio): PessoasDaGaveta`
  - `const SEM_CAMPANHA = "(sem UTM)"`, `SEM_CONJUNTO = "(sem conjunto)"`, `SEM_ANUNCIO = "(sem anúncio)"` — como a tela chama o nulo de cada campo
  - `const LISTAS_DE_PESSOAS = ["compraram", "sem-compra"] as const`; `type ListaDePessoas`
  - `type ChaveDoAnuncio = { campanha: string | null; conjunto: string | null; anuncio: string | null }`
  - `const MAX_BUSCA = 2000`
  - `buscaDoAnuncio(periodo: Periodo, chave: ChaveDoAnuncio, lista?: ListaDePessoas): string`
  - `hrefDeContatos(periodo: Periodo, chave: ChaveDoAnuncio, lista: ListaDePessoas): string`
  - `type AnuncioLido = { ok: true; chave: ChaveDoAnuncio; lista: ListaDePessoas | null } | { ok: false; erro: string }`; `anuncioDaBusca(busca: URLSearchParams): AnuncioLido`
  - `type FiltroDoAnuncio = { chave: ChaveDoAnuncio; lista: ListaDePessoas; busca: string }`; `filtroDaUrl(search: string): FiltroDoAnuncio | null` — o que o Contatos (PR 6c) lê de `window.location.search`
  - `ehPessoasDaGaveta(corpo: unknown): corpo is PessoasDaGaveta`
  - `type ContatosDoAnuncio = { contatos: Lead[] }`; `ehContatosDoAnuncio(corpo: unknown): corpo is ContatosDoAnuncio`

**Teto da busca:** `site_captures` corta cada UTM em 200 (PR 2), mas `lp_captures` (páginas `/p/`, migração `20260715090000_lp_v2.sql`) não tem teto nenhum — conferido na escrita deste plano: sem `check`, e o `lib/pages` grava o que veio. Recusar acima de 200 deixaria sem gaveta o anúncio de nome longo de página. `MAX_BUSCA = 2000` é só teto de sanidade da URL (o link do Contatos inteiro fica abaixo de ~8 KB).

**Sem aparar no JS:** o SQL compara `nullif(btrim(param), '')` com `nullif(btrim(utm), '')`; aparar aqui não muda o resultado e esconderia diferença entre a URL e o que foi ao banco. Só o vazio vira nulo.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  anuncioDaBusca,
  buscaDoAnuncio,
  ehContatosDoAnuncio,
  ehPessoasDaGaveta,
  filtroDaUrl,
  hrefDeContatos,
  lerPessoasDoAnuncio,
  paraAGaveta,
} from "./pessoas-do-anuncio";

/** O JSON de `attribution_people`, com um comprador em Contatos e outro só com o telefone do pedido. */
const BRUTO = {
  por_origem: [{ origem: "ig", cadastros: 2, vendido: 600 }],
  compradores: [
    {
      lead_id: "lead-1",
      nome: "Maria Kids",
      telefone: "556299911111",
      grupo: "VIP 1",
      cadastro_em: "2026-01-05T13:00:00+00:00",
      primeira_compra: "2026-01-14T18:00:00+00:00",
      pedidos: 1,
      vendido: 600,
    },
    {
      lead_id: null,
      nome: null,
      telefone: "5562977771107",
      grupo: null,
      cadastro_em: "2026-01-06T13:00:00+00:00",
      primeira_compra: "2026-01-07T18:00:00+00:00",
      pedidos: 2,
      vendido: 960,
    },
  ],
  sem_compra: ["lead-2", "lead-3"],
};

const PERIODO = { de: "2026-09-11", ate: "2026-10-10" };

test("contrato: aceita o JSON da função; formato quebrado vira erro com o caminho", () => {
  const p = lerPessoasDoAnuncio(BRUTO);
  assert.equal(p.compradores.length, 2);
  assert.deepEqual(p.sem_compra, ["lead-2", "lead-3"]);
  // Estorno lançado como pedido negativo (decisão do PR 5) passa como veio.
  assert.equal(lerPessoasDoAnuncio({ ...BRUTO, por_origem: [{ origem: null, cadastros: 1, vendido: -40 }] }).por_origem[0].vendido, -40);
  assert.throws(
    () => lerPessoasDoAnuncio({ ...BRUTO, compradores: [{ ...BRUTO.compradores[0], pedidos: "1" }] }),
    /pessoas invalidas: compradores\.0\.pedidos/,
  );
  assert.throws(() => lerPessoasDoAnuncio(null), /pessoas invalidas/);
});

test("gaveta: telefone mascarado, sem id de contato, sem_compra vira contagem", () => {
  const g = paraAGaveta(lerPessoasDoAnuncio(BRUTO));
  assert.deepEqual(
    g.compradores.map((c) => [c.nome, c.telefone, c.grupo, c.em_contatos, c.pedidos, c.vendido]),
    [
      ["Maria Kids", "(62) ••••-1111", "VIP 1", true, 1, 600],
      [null, "(62) 9••••-1107", null, false, 2, 960],
    ],
  );
  assert.equal(g.contatos_dos_compradores, 1);
  assert.equal(g.sem_compra, 2);
  assert.deepEqual(g.por_origem, BRUTO.por_origem);
  // Nada que identifique alguém além do que a tela mostra.
  assert.doesNotMatch(JSON.stringify(g), /lead-|lead_id|556299911111|5562977771107/);
});

test("duas chaves de telefone no mesmo contato: 'Ver os N em Contatos' conta o contato uma vez", () => {
  const g = paraAGaveta(
    lerPessoasDoAnuncio({
      ...BRUTO,
      compradores: [BRUTO.compradores[0], { ...BRUTO.compradores[0], telefone: "5511988887777", vendido: 50 }],
    }),
  );
  assert.equal(g.compradores.length, 2);
  assert.equal(g.contatos_dos_compradores, 1);
});

test("busca do anúncio: nulo fica fora da URL, caractere especial vai codificado e volta igual", () => {
  const chave = { campanha: "VIP Atacado — Goiânia", conjunto: null, anuncio: "50% off & frete+grátis" };
  const busca = buscaDoAnuncio(PERIODO, chave, "compraram");
  assert.equal(
    busca,
    "de=2026-09-11&ate=2026-10-10&campanha=VIP+Atacado+%E2%80%94+Goi%C3%A2nia&anuncio=50%25+off+%26+frete%2Bgr%C3%A1tis&lista=compraram",
  );
  assert.deepEqual(anuncioDaBusca(new URLSearchParams(busca)), { ok: true, chave, lista: "compraram" });
  assert.equal(
    buscaDoAnuncio(PERIODO, { campanha: null, conjunto: null, anuncio: null }),
    "de=2026-09-11&ate=2026-10-10",
  );
  assert.equal(
    hrefDeContatos(PERIODO, chave, "sem-compra"),
    "/painel/contatos?de=2026-09-11&ate=2026-10-10&campanha=VIP+Atacado+%E2%80%94+Goi%C3%A2nia&anuncio=50%25+off+%26+frete%2Bgr%C3%A1tis&lista=sem-compra",
  );
});

test("busca lida: vazio vira nulo e o resto vai como veio (o SQL apara); lista desconhecida e acima de 2000 recusados", () => {
  assert.deepEqual(anuncioDaBusca(new URLSearchParams("campanha=&anuncio=%20A1%20")), {
    ok: true,
    chave: { campanha: null, conjunto: null, anuncio: " A1 " },
    lista: null,
  });
  assert.deepEqual(anuncioDaBusca(new URLSearchParams("lista=todos")), { ok: false, erro: "Lista inválida." });
  assert.deepEqual(anuncioDaBusca(new URLSearchParams(`anuncio=${"x".repeat(2001)}`)), {
    ok: false,
    erro: "Anúncio inválido.",
  });
  // Página /p/ não corta UTM em 200: nome longo de anúncio continua tendo gaveta.
  assert.equal(anuncioDaBusca(new URLSearchParams(`anuncio=${"x".repeat(2000)}`)).ok, true);
});

test("filtro do Contatos pela URL: só com lista válida; a busca volta inteira para a rota", () => {
  const busca = buscaDoAnuncio(PERIODO, { campanha: "C1", conjunto: null, anuncio: "A1" }, "sem-compra");
  assert.deepEqual(filtroDaUrl(`?${busca}`), {
    chave: { campanha: "C1", conjunto: null, anuncio: "A1" },
    lista: "sem-compra",
    busca,
  });
  assert.equal(filtroDaUrl(""), null);
  assert.equal(filtroDaUrl("?anuncio=A1"), null, "sem lista não é filtro (é a gaveta)");
  assert.equal(filtroDaUrl("?anuncio=A1&lista=todos"), null);
});

test("guardas do navegador: aceitam o formato da rota, recusam erro e lixo", () => {
  assert.equal(ehPessoasDaGaveta(paraAGaveta(lerPessoasDoAnuncio(BRUTO))), true);
  assert.equal(ehPessoasDaGaveta({ error: "Não deu para carregar quem veio por este anúncio." }), false);
  assert.equal(ehPessoasDaGaveta(null), false);
  assert.equal(ehContatosDoAnuncio({ contatos: [] }), true);
  assert.equal(ehContatosDoAnuncio({ error: "x" }), false);
  assert.equal(ehContatosDoAnuncio(undefined), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/pessoas-do-anuncio.test.ts`
Expected: FAIL — `Cannot find module './pessoas-do-anuncio'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/resultados/pessoas-do-anuncio.ts
import { z } from "zod";

import type { Lead } from "@/lib/painel/types";
import { telefoneMascarado } from "@/lib/pages/phone";
import type { Periodo } from "./periodo-anuncios";

/**
 * Quem veio por um anúncio (gaveta "Ver quem" da aba Anúncios; spec
 * 2026-10-10-funil-anuncios §4 e §7): o contrato do JSON de
 * `public.attribution_people`, a versão que sai para o navegador (telefone
 * mascarado, sem id de contato) e a busca na URL que a rota e o Contatos
 * filtrado leem.
 *
 * Sem `server-only`: a gaveta e o Contatos importam os tipos e a busca daqui.
 */

const contagem = z.number().int().nonnegative();
/** Soma de `orders.value`: outro caminho grava estorno como pedido negativo (decisão do PR 5). */
const vendido = z.number();

const compradorSchema = z.object({
  lead_id: z.string().nullable(),
  nome: z.string().nullable(),
  telefone: z.string().nullable(),
  grupo: z.string().nullable(),
  cadastro_em: z.string(),
  primeira_compra: z.string(),
  pedidos: contagem,
  vendido,
});

const pessoasSchema = z.object({
  por_origem: z.array(z.object({ origem: z.string().nullable(), cadastros: contagem, vendido })),
  compradores: z.array(compradorSchema),
  sem_compra: z.array(z.string()),
});

export type PessoasDoAnuncio = z.infer<typeof pessoasSchema>;

export function lerPessoasDoAnuncio(bruto: unknown): PessoasDoAnuncio {
  const lido = pessoasSchema.safeParse(bruto);
  if (!lido.success) {
    const primeiro = lido.error.issues[0];
    throw new Error(`pessoas invalidas: ${primeiro?.path.join(".") ?? "?"} ${primeiro?.message ?? ""}`.trim());
  }
  return lido.data;
}

export type CompradorDaGaveta = {
  nome: string | null;
  /** Sempre mascarado: `(62) 9••••-4821`. */
  telefone: string;
  grupo: string | null;
  cadastro_em: string;
  primeira_compra: string;
  pedidos: number;
  vendido: number;
  /** Tem contato (entrou num grupo). */
  em_contatos: boolean;
};

export type PessoasDaGaveta = {
  por_origem: PessoasDoAnuncio["por_origem"];
  compradores: CompradorDaGaveta[];
  /**
   * Contatos distintos entre os compradores: o N de "Ver os N em Contatos".
   * Duas chaves de telefone podem cair no mesmo contato (pedido com `lead_id`
   * e telefone diferente do dele); a lista de `lista=compraram` deduplica, e o
   * N tem que bater com ela.
   */
  contatos_dos_compradores: number;
  /** Quantos entraram pelo anúncio e não compraram nada depois de entrar. */
  sem_compra: number;
};

/**
 * O que a gaveta recebe (spec §7): telefone mascarado aqui, no servidor; o id do
 * contato vira só "está em Contatos" e a lista de quem não comprou vira contagem.
 */
export function paraAGaveta(p: PessoasDoAnuncio): PessoasDaGaveta {
  const contatos = new Set(p.compradores.flatMap((c) => (c.lead_id ? [c.lead_id] : [])));
  return {
    por_origem: p.por_origem,
    compradores: p.compradores.map((c) => ({
      nome: c.nome,
      telefone: telefoneMascarado(c.telefone),
      grupo: c.grupo,
      cadastro_em: c.cadastro_em,
      primeira_compra: c.primeira_compra,
      pedidos: c.pedidos,
      vendido: c.vendido,
      em_contatos: c.lead_id !== null,
    })),
    contatos_dos_compradores: contatos.size,
    sem_compra: p.sem_compra.length,
  };
}

/** Como a tela chama o nulo de cada campo de UTM. */
export const SEM_CAMPANHA = "(sem UTM)";
export const SEM_CONJUNTO = "(sem conjunto)";
export const SEM_ANUNCIO = "(sem anúncio)";

export const LISTAS_DE_PESSOAS = ["compraram", "sem-compra"] as const;
export type ListaDePessoas = (typeof LISTAS_DE_PESSOAS)[number];

/** Um anúncio da tabela. Nulo = `SEM_CAMPANHA` / `SEM_CONJUNTO` / `SEM_ANUNCIO`. */
export type ChaveDoAnuncio = { campanha: string | null; conjunto: string | null; anuncio: string | null };

const CAMPOS = ["campanha", "conjunto", "anuncio"] as const;
/**
 * Teto de sanidade da URL, não de UTM: `site_captures` corta em 200 (PR 2), mas
 * `lp_captures` (páginas /p/) grava sem teto — recusar acima de 200 deixaria sem
 * gaveta o anúncio de nome longo de página.
 */
export const MAX_BUSCA = 2000;

/**
 * `de=…&ate=…&campanha=…&conjunto=…&anuncio=…[&lista=…]`. Campo nulo fica fora
 * da URL: na volta, ausente e vazio viram nulo, que é como o SQL compara
 * (`nullif(btrim(...), '')` dos dois lados).
 */
export function buscaDoAnuncio(periodo: Periodo, chave: ChaveDoAnuncio, lista?: ListaDePessoas): string {
  const busca = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
  for (const campo of CAMPOS) {
    const valor = chave[campo];
    if (valor !== null) busca.set(campo, valor);
  }
  if (lista) busca.set("lista", lista);
  return busca.toString();
}

/** O Contatos só com quem veio pelo anúncio (a página lê o filtro no mount, PR 6c). */
export function hrefDeContatos(periodo: Periodo, chave: ChaveDoAnuncio, lista: ListaDePessoas): string {
  return `/painel/contatos?${buscaDoAnuncio(periodo, chave, lista)}`;
}

export type AnuncioLido =
  | { ok: true; chave: ChaveDoAnuncio; lista: ListaDePessoas | null }
  | { ok: false; erro: string };

/** Lê o anúncio da busca. Não apara: o SQL apara os dois lados; só o vazio vira nulo. */
export function anuncioDaBusca(busca: URLSearchParams): AnuncioLido {
  const lista = busca.get("lista");
  if (lista !== null && !(LISTAS_DE_PESSOAS as readonly string[]).includes(lista)) {
    return { ok: false, erro: "Lista inválida." };
  }
  const ler = (campo: (typeof CAMPOS)[number]) => busca.get(campo) || null;
  const chave: ChaveDoAnuncio = { campanha: ler("campanha"), conjunto: ler("conjunto"), anuncio: ler("anuncio") };
  if (Object.values(chave).some((v) => v !== null && v.length > MAX_BUSCA)) {
    return { ok: false, erro: "Anúncio inválido." };
  }
  return { ok: true, chave, lista: lista as ListaDePessoas | null };
}

export type FiltroDoAnuncio = { chave: ChaveDoAnuncio; lista: ListaDePessoas; busca: string };

/**
 * O filtro do Contatos vindo da gaveta: `search` é o `window.location.search`.
 * Sem `lista` válida não é filtro — o Contatos fica como sempre foi.
 */
export function filtroDaUrl(search: string): FiltroDoAnuncio | null {
  const busca = new URLSearchParams(search);
  const lido = anuncioDaBusca(busca);
  if (!lido.ok || lido.lista === null) return null;
  return { chave: lido.chave, lista: lido.lista, busca: busca.toString() };
}

/** Guarda leve no navegador: a rota já validou com zod; aqui só se recusa o que não é a resposta. */
export function ehPessoasDaGaveta(corpo: unknown): corpo is PessoasDaGaveta {
  const c = corpo as Partial<PessoasDaGaveta> | null;
  return (
    typeof c?.sem_compra === "number" &&
    typeof c.contatos_dos_compradores === "number" &&
    Array.isArray(c.compradores) &&
    Array.isArray(c.por_origem)
  );
}

/** Resposta da rota com `lista=`: os contatos inteiros, no formato do `/api/leads`. */
export type ContatosDoAnuncio = { contatos: Lead[] };

export function ehContatosDoAnuncio(corpo: unknown): corpo is ContatosDoAnuncio {
  return Array.isArray((corpo as Partial<ContatosDoAnuncio> | null)?.contatos);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/pessoas-do-anuncio.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/resultados/pessoas-do-anuncio.ts apps/web/src/lib/resultados/pessoas-do-anuncio.test.ts
git commit -m "feat(resultados): contract, masking and URL search for the ad's people drawer"
```

### Task 2: `attribution_people` — migração, espelho da regra e teste de integração

**Files:**
- Create: `apps/web/supabase/migrations/20261011120000_funil_anuncios_pessoas.sql`
- Modify: `deploy/supabase/apply-order.txt` (entrada no fim)
- Modify: `apps/web/src/lib/resultados/relatorio-anuncios.integration.test.ts` (imports, três variáveis, o insert de `leads` e a Carla no `before`, 1 teste sem banco + 5 de integração no fim)

**Interfaces:**
- Consumes: `lerPessoasDoAnuncio`, `PessoasDoAnuncio` (Task 1); `attribution_report` e as tabelas do PR 1.
- Produces: `public.attribution_people(p_tenant uuid, p_de date, p_ate date, p_campanha text, p_conjunto text, p_anuncio text) returns jsonb` — só `service_role` executa. JSON: `{ por_origem: [{ origem, cadastros, vendido }], compradores: [{ lead_id, nome, telefone, grupo, cadastro_em, primeira_compra, pedidos, vendido }], sem_compra: [lead_id] }`. Período inválido → `raise exception 'periodo invalido…' using errcode = '22023'`.

A regra é a de `attribution_report` (spec §1): vale o último cadastro da pessoa (chave de telefone) antes do evento — entrada até 7 dias antes, pedido até 90 —, e o período escolhe os cadastros. Os CTEs `cadastros`, `coorte`, `entradas`, `entrada_credito`, `pedidos` e `pedido_credito` são cópia literal dos de `20261010130100_funil_anuncios_relatorio.sql`, **na mesma ordem e sem comentário dentro** (o filtro do anúncio, `do_anuncio`, vem depois de `pedido_credito`). Duas guardas seguram as duas funções juntas:

- **Espelho do texto, sem banco** (roda em todo `npm test`): o bloco de `cadastros as (` até o fim de `pedido_credito` tem que ser idêntico nas duas migrações, normalizado em espaço e sem comentário; a única diferença aceita são as duas colunas a mais de `pedidos` (`o.lead_id` e `… as telefone`). As constantes `janela_entrada`, `janela_venda` e `fuso` também. Pega desvio que a fixture não exercita.
- **Consistência no banco de dev** (job e2e): para cada anúncio do relatório, compradores, vendido e cadastros da gaveta batem com a linha, e `sem_compra` nunca passa de `entraram`.

**"Entraram e ainda não compraram" serve para remarketing** (decisão do controller): não pode ter quem já comprou, nem por outro anúncio. A condição é "nenhum pedido da chave depois da entrada" — `not exists (select 1 from pedidos p where p.chave = e.chave and p.created_at >= e.entered_at)` —, não "nenhum pedido creditado a este anúncio".

O revoke de `authenticated` também é conferido pelo `apps/web/src/lib/supabase/privilegio-definer.test.ts`, que lê a `apply-order` e reprova função `security definer` sem `revoke … from authenticated` na última migração que a toca — por isso a entrada no `apply-order` (Step 5) faz parte desta task.

- [ ] **Step 1: Write the failing test** — em `relatorio-anuncios.integration.test.ts`:

Acrescentar aos imports do topo (depois de `import { after, before, test } from "node:test";`):

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
```

e trocar o import local por:

```ts
import { lerPessoasDoAnuncio, type PessoasDoAnuncio } from "./pessoas-do-anuncio";
import { lerRelatorioAnuncios, type LinhaRelatorio, type RelatorioAnuncios } from "./relatorio-anuncios";
```

Logo depois de `let lojaGrande = "";`:

```ts
let maria = "";
let bia = "";
let carla = "";
```

No `before`, trocar o começo do insert de `leads`:

```ts
  const [l1] = await inserir("leads", [
    { tenant_id: loja, phone: "556299911111", entered_at: "2026-01-05T10:05:00-03:00" },
    { tenant_id: loja, phone: "5562988882222", entered_at: "2026-01-13T12:00:00-03:00" },
```

por

```ts
  const [l1, l2] = await inserir("leads", [
    // Nome e grupo só na Maria: a gaveta (attribution_people) devolve os dois.
    { tenant_id: loja, phone: "556299911111", entered_at: "2026-01-05T10:05:00-03:00", name: "Maria Kids", source_group_name: "VIP 1" },
    { tenant_id: loja, phone: "5562988882222", entered_at: "2026-01-13T12:00:00-03:00" },
```

e, logo depois do `]);` que fecha esse insert:

```ts
  maria = l1.id;
  bia = l2.id;
```

Ainda no `before`, depois de `await inserir("leads", entradas);` (o último insert da loja grande):

```ts
  // Carla (loja grande, março, longe dos outros casos): entra pelo Y1 e compra pelo Y2.
  // "Entraram e ainda não compraram" do Y1 é lista de remarketing: ela não pode estar lá.
  await inserir("site_captures", [
    cadastro(lojaGrande, "y1", "+5562966667777", "2026-03-02T10:00:00-03:00", { origem: "ig", campanha: "CY", conjunto: "S1", anuncio: "Y1" }),
    cadastro(lojaGrande, "y2", "+5562966667777", "2026-03-05T10:00:00-03:00", { origem: "fb", campanha: "CY", conjunto: "S1", anuncio: "Y2" }),
  ]);
  const [lCarla] = await inserir("leads", [
    { tenant_id: lojaGrande, phone: "5562966667777", entered_at: "2026-03-02T10:05:00-03:00" },
  ]);
  carla = lCarla.id;
  await inserir("orders", [
    { tenant_id: lojaGrande, phone: "5562966667777", value: 200, created_at: "2026-03-06T10:00:00-03:00" },
  ]);
```

Depois da função `relatorio(...)`:

```ts
async function pessoas(
  tenant: string,
  de: string,
  ate: string,
  campanha: string | null,
  conjunto: string | null,
  anuncio: string | null,
): Promise<PessoasDoAnuncio> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_people", {
    p_tenant: tenant,
    p_de: de,
    p_ate: ate,
    p_campanha: campanha,
    p_conjunto: conjunto,
    p_anuncio: anuncio,
  });
  if (error) throw new Error(error.message);
  return lerPessoasDoAnuncio(data);
}

/**
 * A regra copiada em attribution_people, lida da migração: do `cadastros as (` ao
 * fim de `pedido_credito`, sem comentário e com o espaço normalizado. As duas
 * colunas a mais de `pedidos` na gaveta são descontadas; nada mais pode diferir.
 */
const MIGRACOES = path.join(process.cwd(), "supabase", "migrations");
const FIM_DA_REGRA = "order by p.id, c.created_at desc, c.id desc";

function regraDe(arquivo: string): { regra: string; constantes: string[] } {
  const sql = readFileSync(path.join(MIGRACOES, arquivo), "utf8").replace(/--[^\n]*/g, "");
  const inicio = sql.indexOf("cadastros as (");
  const fim = sql.indexOf(FIM_DA_REGRA, inicio);
  assert.ok(inicio >= 0 && fim > inicio, `${arquivo}: não achei o bloco da regra`);
  const regra = sql
    .slice(inicio, fim + FIM_DA_REGRA.length)
    .replace(" o.lead_id,", "")
    .replace("coalesce(nullif(btrim(o.phone), ''), l.phone) as telefone,", "")
    .replace(/\s+/g, " ")
    .trim();
  const constantes = ["janela_entrada", "janela_venda", "fuso"].map((nome) => {
    const achada = sql.match(new RegExp(`${nome} constant [^;]+;`));
    assert.ok(achada, `${arquivo}: constante ${nome} sumiu`);
    return achada[0].replace(/\s+/g, " ");
  });
  return { regra, constantes };
}
```

E no fim do arquivo:

```ts
test("espelho da regra (sem banco): attribution_people copia attribution_report sem desvio", () => {
  const relatorio = regraDe("20261010130100_funil_anuncios_relatorio.sql");
  const gaveta = regraDe("20261011120000_funil_anuncios_pessoas.sql");
  assert.deepEqual(gaveta.constantes, relatorio.constantes);
  assert.equal(gaveta.regra, relatorio.regra);
});

test("pessoas do A1: Maria comprou com nome e grupo; Bia entrou e não comprou", { skip: pular() }, async () => {
  const p = await pessoas(loja, "2026-01-01", "2026-04-30", "C1", "S1", "A1");
  assert.equal(p.compradores.length, 1);
  const [m] = p.compradores;
  assert.deepEqual(
    { lead_id: m.lead_id, nome: m.nome, grupo: m.grupo, telefone: m.telefone, pedidos: m.pedidos, vendido: m.vendido },
    { lead_id: maria, nome: "Maria Kids", grupo: "VIP 1", telefone: "556299911111", pedidos: 1, vendido: 600 },
  );
  assert.equal(Date.parse(m.cadastro_em), Date.parse("2026-01-05T10:00:00-03:00"));
  assert.equal(Date.parse(m.primeira_compra), Date.parse("2026-01-14T15:00:00-03:00"));
  assert.deepEqual(p.sem_compra, [bia]);
  assert.deepEqual(p.por_origem, [{ origem: "ig", cadastros: 2, vendido: 600 }]);
});

test("pessoas do A2: pedido sem telefone casa pelo telefone do lead; quem já era membro não entra em 'sem compra'", { skip: pular() }, async () => {
  const p = await pessoas(loja, "2026-01-01", "2026-04-30", "C1", "S1", "A2");
  assert.deepEqual(p.compradores.map((c) => [c.lead_id, c.telefone, c.vendido]), [[maria, "556299911111", 400]]);
  assert.deepEqual(p.sem_compra, []);
  assert.deepEqual(p.por_origem, [{ origem: "fb", cadastros: 1, vendido: 400 }]);
});

test("entrou pelo Y1 e comprou pelo Y2: fora de 'sem compra' do Y1, compradora do Y2", { skip: pular() }, async () => {
  const y1 = await pessoas(lojaGrande, "2026-03-01", "2026-03-31", "CY", "S1", "Y1");
  assert.deepEqual([y1.compradores.length, y1.sem_compra], [0, []]);
  const y2 = await pessoas(lojaGrande, "2026-03-01", "2026-03-31", "CY", "S1", "Y2");
  assert.deepEqual(y2.compradores.map((c) => [c.lead_id, c.vendido]), [[carla, 200]]);
});

test("a gaveta bate com a tabela: compradores, vendido, cadastros e 'sem compra' de cada anúncio", { skip: pular() }, async () => {
  for (const [tenant, de, ate] of [
    [loja, "2026-01-01", "2026-04-30"],
    [lojaGrande, "2026-03-01", "2026-03-31"],
  ] as const) {
    const r = await relatorio(tenant, de, ate);
    const anuncios = r.linhas.filter((l) => l.nivel === "anuncio");
    assert.ok(anuncios.length >= 2, `só ${anuncios.length} anúncios no relatório`);
    for (const a of anuncios) {
      const p = await pessoas(tenant, de, ate, a.campanha, a.conjunto, a.anuncio);
      const nome = `${a.campanha}/${a.conjunto}/${a.anuncio}`;
      assert.equal(p.compradores.length, a.compradores, nome);
      assert.equal(p.compradores.reduce((s, c) => s + c.vendido, 0), a.vendido, nome);
      assert.equal(p.por_origem.reduce((s, o) => s + o.cadastros, 0), a.cadastros, nome);
      assert.ok(p.sem_compra.length <= a.entraram, `${nome}: sem_compra ${p.sem_compra.length} > entraram ${a.entraram}`);
    }
  }
});

test("loja grande: 1.500 entraram sem comprar, sem cortar em 1000; nada de outra loja; período inválido", { skip: pular() }, async () => {
  const grande = await pessoas(lojaGrande, "2026-02-01", "2026-02-28", "CX", null, null);
  assert.equal(grande.sem_compra.length, LOTE);
  assert.deepEqual(grande.compradores, []);

  // A intrusa tem o telefone da Maria, mas os pedidos da Maria são da outra loja.
  const intrusa = await pessoas(lojaGrande, "2026-01-01", "2026-01-31", "C1", null, null);
  assert.deepEqual([intrusa.compradores.length, intrusa.sem_compra.length], [0, 0]);

  const { error } = await getSupabaseAdmin().rpc("attribution_people", {
    p_tenant: loja,
    p_de: "2026-02-01",
    p_ate: "2026-01-01",
    p_campanha: null,
    p_conjunto: null,
    p_anuncio: null,
  });
  assert.match(error?.message ?? "", /periodo invalido/);
});
```

A Carla fica na loja grande, em março: os testes antigos da loja pequena (`r.total` em `deepEqual`, C1, A1, A2, `fora`, `por_origem`) e os da loja grande (CX em fevereiro, a intrusa em janeiro) não a enxergam.

- [ ] **Step 2: Run test to verify it fails**

Em `apps/web`, sem credencial nenhuma:

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.integration.test.ts`
Expected: FAIL no "espelho da regra" — `ENOENT … 20261011120000_funil_anuncios_pessoas.sql`; os de banco aparecem como pulados.

Com as credenciais de **dev** no ambiente (`E2E_TENANT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), o mesmo comando falha também nos 5 de banco — `Could not find the function public.attribution_people(...)` —, e os 4 antigos continuam PASS.

- [ ] **Step 3: Write the migration**

```sql
-- Funil de anúncios, parte 3: quem veio por um anúncio (gaveta "Ver quem" da aba
-- Anúncios; spec 2026-10-10-funil-anuncios §4 e §7).
--
-- Idempotente. Vai nos DOIS bancos e muda deploy/supabase/schema-baseline.json
-- (f|attribution_people). Depende de 20261010130100_funil_anuncios_relatorio.sql.
--
-- MESMA regra de attribution_report: vale o último cadastro da pessoa (phone_key)
-- antes do evento — entrada até 7 dias antes, pedido até 90 dias antes, as duas
-- bordas inclusivas — e o período escolhe os CADASTROS (coorte). Os CTEs de
-- `cadastros` a `pedido_credito` são CÓPIA dos de attribution_report, na mesma
-- ordem e sem comentário dentro: o teste "espelho da regra" compara o texto das
-- duas migrações, e o de integração "a gaveta bate com a tabela" compara os números.
--
-- Só o nível anúncio: campanha, conjunto e anúncio comparados com
-- `is not distinct from` (nulo casa "(sem UTM)", "(sem conjunto)", "(sem anúncio)").
-- O telefone sai inteiro: a rota mascara antes de responder ao navegador.

create or replace function public.attribution_people(
  p_tenant uuid,
  p_de date,
  p_ate date,
  p_campanha text,
  p_conjunto text,
  p_anuncio text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  janela_entrada constant interval := interval '7 days';
  janela_venda constant interval := interval '90 days';
  fuso constant text := 'America/Sao_Paulo';
  v_campanha constant text := nullif(btrim(p_campanha), '');
  v_conjunto constant text := nullif(btrim(p_conjunto), '');
  v_anuncio constant text := nullif(btrim(p_anuncio), '');
  v_ini timestamptz;
  v_fim timestamptz;
  v_resultado jsonb;
begin
  if p_tenant is null or p_de is null or p_ate is null or p_de > p_ate then
    raise exception 'periodo invalido' using errcode = '22023';
  end if;
  if p_ate - p_de > 400 then
    raise exception 'periodo invalido: mais de 400 dias' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_tenant) then
    raise exception 'loja inexistente' using errcode = '22023';
  end if;

  v_ini := p_de::timestamp at time zone fuso;
  v_fim := (p_ate + 1)::timestamp at time zone fuso;

  -- Todos os cadastros da loja (o crédito olha para trás, então não só os do período).
  with
  cadastros as (
    select s.id, s.phone_key as chave, s.created_at,
           nullif(btrim(s.utm_source), '') as origem,
           nullif(btrim(s.utm_campaign), '') as campanha,
           nullif(btrim(s.utm_term), '') as conjunto,
           nullif(btrim(s.utm_content), '') as anuncio
      from public.site_captures s
     where s.tenant_id = p_tenant and s.phone_key is not null
    union all
    select c.id, public.phone_key(k.whatsapp), c.created_at,
           nullif(btrim(c.utm_source), ''), nullif(btrim(c.utm_campaign), ''),
           nullif(btrim(c.utm_term), ''), nullif(btrim(c.utm_content), '')
      from public.lp_captures c
      join public.lp_contacts k on k.id = c.contact_id and k.tenant_id = p_tenant
     where c.tenant_id = p_tenant and public.phone_key(k.whatsapp) is not null
  ),
  coorte as (
    select * from cadastros where created_at >= v_ini and created_at < v_fim
  ),
  entradas as (
    select l.id, public.phone_key(l.phone) as chave, l.entered_at
      from public.leads l
     where l.tenant_id = p_tenant
  ),
  entrada_credito as (
    select distinct on (e.id) e.id as lead_id, e.entered_at, c.id as cadastro_id
      from entradas e
      join cadastros c
        on c.chave = e.chave
       and c.created_at <= e.entered_at
       and c.created_at >= e.entered_at - janela_entrada
     order by e.id, c.created_at desc, c.id desc
  ),
  pedidos as (
    select o.id, o.value, o.created_at, o.lead_id,
           coalesce(nullif(btrim(o.phone), ''), l.phone) as telefone,
           public.phone_key(coalesce(nullif(btrim(o.phone), ''), l.phone)) as chave
      from public.orders o
      left join public.leads l on l.id = o.lead_id and l.tenant_id = p_tenant
     where o.tenant_id = p_tenant
  ),
  pedido_credito as (
    select distinct on (p.id) p.id as pedido_id, c.id as cadastro_id
      from pedidos p
      join cadastros c
        on c.chave = p.chave
       and c.created_at <= p.created_at
       and c.created_at >= p.created_at - janela_venda
     order by p.id, c.created_at desc, c.id desc
  ),
  -- Daqui para baixo é só da gaveta: os cadastros do anúncio pedido.
  do_anuncio as (
    select * from coorte k
     where k.campanha is not distinct from v_campanha
       and k.conjunto is not distinct from v_conjunto
       and k.anuncio is not distinct from v_anuncio
  ),
  vendas as (
    select p.id, p.value, p.created_at, p.chave, p.telefone, p.lead_id,
           k.origem, k.created_at as cadastro_em
      from pedido_credito pc
      join pedidos p on p.id = pc.pedido_id
      join do_anuncio k on k.id = pc.cadastro_id
  ),
  -- Uma linha por pessoa (chave): soma do que ela comprou por ESTE anúncio.
  compradores as (
    select v.chave,
           sum(v.value) as vendido,
           count(*) as pedidos,
           min(v.cadastro_em) as cadastro_em,
           min(v.created_at) as primeira_compra,
           (array_agg(v.telefone order by v.created_at desc))[1] as telefone,
           (array_agg(v.lead_id order by v.created_at desc) filter (where v.lead_id is not null))[1] as lead_do_pedido
      from vendas v
     group by v.chave
  ),
  -- Pedido sem lead_id (só telefone): o contato é o da primeira entrada com a mesma chave.
  lead_da_chave as (
    select distinct on (e.chave) e.chave, e.id
      from entradas e
     where e.chave in (select c.chave from compradores c)
     order by e.chave, e.entered_at, e.id
  ),
  -- Entraram pelo anúncio e não compraram NADA depois de entrar, nem por outro
  -- anúncio: é a lista de remarketing, não pode ter quem já comprou.
  sem_compra as (
    select distinct ec.lead_id
      from entrada_credito ec
      join do_anuncio k on k.id = ec.cadastro_id
      join entradas e on e.id = ec.lead_id
     where not exists (
       select 1 from pedidos p where p.chave = e.chave and p.created_at >= e.entered_at
     )
  )
  select jsonb_build_object(
    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', o.origem, 'cadastros', o.cadastros, 'vendido', o.vendido)
                       order by o.cadastros desc, o.origem nulls last)
        from (
          select k.origem, count(*) as cadastros,
                 coalesce((select sum(v.value) from vendas v where v.origem is not distinct from k.origem), 0) as vendido
            from do_anuncio k group by k.origem
        ) o
    ), '[]'::jsonb),
    'compradores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lead_id', l.id,
               'nome', nullif(btrim(l.name), ''),
               'telefone', c.telefone,
               'grupo', nullif(btrim(l.source_group_name), ''),
               'cadastro_em', c.cadastro_em,
               'primeira_compra', c.primeira_compra,
               'pedidos', c.pedidos,
               'vendido', c.vendido)
             order by c.vendido desc, c.primeira_compra, c.chave)
        from compradores c
        left join lead_da_chave lc on lc.chave = c.chave
        left join public.leads l on l.id = coalesce(c.lead_do_pedido, lc.id) and l.tenant_id = p_tenant
    ), '[]'::jsonb),
    'sem_compra', coalesce((select jsonb_agg(s.lead_id order by s.lead_id) from sem_compra s), '[]'::jsonb)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.attribution_people(uuid, date, date, text, text, text) is
  'Quem veio por um anúncio (compradores e quem entrou sem comprar nada depois), pela mesma regra de attribution_report. Só service_role; a rota passa o tenant do contexto e mascara o telefone.';

-- Função nova nasce executável por authenticated (default privilege do Supabase):
-- revogar explícito. Só o servidor chama, com o tenant da sessão.
-- Guarda no repositório: apps/web/src/lib/supabase/privilegio-definer.test.ts.
revoke all on function public.attribution_people(uuid, date, date, text, text, text) from public, anon, authenticated;
grant execute on function public.attribution_people(uuid, date, date, text, text, text) to service_role;
```

O comentário "Todos os cadastros da loja…" fica **antes** do `with`, fora do bloco comparado; dentro do bloco não há comentário (o espelho os tira de qualquer jeito, mas a migração do relatório também não tem).

- [ ] **Step 4: Run test to verify the mirror passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.integration.test.ts`
Expected: o "espelho da regra" PASS; os de banco pulados sem credencial (com credencial de dev, continuam FAIL até a Task 3 aplicar a função).

- [ ] **Step 5: Entrada no `apply-order`** — acrescentar ao fim de `deploy/supabase/apply-order.txt`:

```
# 2026-10-11 - Funil de anuncios, parte 3: attribution_people (quem veio por um anuncio; so
# service_role). Depende da parte 2. Muda a baseline (f|attribution_people). Copia os CTEs de
# attribution_report (o teste "espelho da regra" compara o texto): mudar a regra num exige
# mudar no outro.
apps/web/supabase/migrations/20261011120000_funil_anuncios_pessoas.sql
```

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/supabase/privilegio-definer.test.ts`
Expected: PASS — a função nova está na `apply-order` e o revoke de `authenticated` está na última migração que a toca.

- [ ] **Step 6: Commit**

```bash
git add apps/web/supabase/migrations/20261011120000_funil_anuncios_pessoas.sql deploy/supabase/apply-order.txt apps/web/src/lib/resultados/relatorio-anuncios.integration.test.ts
git commit -m "feat(db): attribution_people lists who came through an ad (same rule as the report, mirror-tested)"
```

### Task 3: Aplicar nos dois bancos, privilégio, advisor e baseline (Igor)

**Files:**
- Modify: `deploy/supabase/schema-baseline.json` (regenerado)

**Interfaces:**
- Consumes: a migração da Task 2.
- Produces: `public.attribution_people` viva em dev e prod; baseline nova.

As Tasks 4 e 5 não esperam por esta; só o **push** do 6a espera (o job e2e e o gate de drift do CI leem o banco de dev).

- [ ] **Step 1: PEÇA AO IGOR para aplicar nos dois bancos** (DDL em prod é dele). PowerShell, numa pasta vazia fora do repositório (`$w`) e com `$repo` = a raiz do worktree do 6a:

```powershell
$w = "C:\Users\Igor\sb-tmp"; New-Item -ItemType Directory -Force $w | Out-Null
$repo = "<raiz do worktree pr6a>"
$sql = "$repo\apps\web\supabase\migrations\20261011120000_funil_anuncios_pessoas.sql"
npx supabase --workdir $w link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase --workdir $w db query --linked -f $sql
npx supabase --workdir $w link --project-ref nidoatbxaylrkcgbszns --yes
npx supabase --workdir $w db query --linked -f $sql
```

- [ ] **Step 2: Conferir privilégio e corpo nos DOIS bancos** (leitura). O gate de drift não vê ACL nem corpo de função, então isto é a prova:

```powershell
[IO.File]::WriteAllText("$w\confere-pessoas.sql", @'
select
  has_function_privilege('authenticated', 'public.attribution_people(uuid,date,date,text,text,text)', 'execute') as authenticated_executa,
  has_function_privilege('anon', 'public.attribution_people(uuid,date,date,text,text,text)', 'execute') as anon_executa,
  has_function_privilege('service_role', 'public.attribution_people(uuid,date,date,text,text,text)', 'execute') as service_executa,
  (select md5(prosrc) from pg_proc where oid = 'public.attribution_people(uuid,date,date,text,text,text)'::regprocedure) as corpo;
'@)
npx supabase --workdir $w link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase --workdir $w db query --linked -f "$w\confere-pessoas.sql"
npx supabase --workdir $w link --project-ref nidoatbxaylrkcgbszns --yes
npx supabase --workdir $w db query --linked -f "$w\confere-pessoas.sql"
```

Expected nos dois: `false, false, true` e o **mesmo** `corpo` (md5) em dev e prod.

- [ ] **Step 3: Advisor de segurança nos dois bancos**

```powershell
npx supabase --workdir $w link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase --workdir $w db advisors --linked --type security --output-format json
npx supabase --workdir $w link --project-ref nidoatbxaylrkcgbszns --yes
npx supabase --workdir $w db advisors --linked --type security --output-format json
```

Expected: nenhum achado novo citando `attribution_people`. Achado novo → corrigir a migração (não acrescentar em `advisors-allowlist.json`).

- [ ] **Step 4: Regenerar a baseline** — com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **de produção** no ambiente, na raiz do worktree do 6a: `npm run schema:baseline`. `deploy/supabase/schema-baseline.json` ganha `f|attribution_people(...)`. Se outro PR mexeu na baseline enquanto isso, fazer merge de `origin/main` antes de regenerar.

- [ ] **Step 5: Rodar o teste de integração** com as credenciais de dev, em `apps/web`:

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.integration.test.ts`
Expected: PASS (10 testes: os 4 antigos, o espelho e os 5 da gaveta). Sem credencial na máquina, o job e2e do CI confirma.

- [ ] **Step 6: Commit**

```bash
git add deploy/supabase/schema-baseline.json
git commit -m "chore(schema): baseline with attribution_people"
```

### Task 4: Store, leads por id e a rota

**Files:**
- Modify: `apps/web/src/lib/stores/relatorio-de-anuncios.ts` (do PR 5a: import + função no fim)
- Modify: `apps/web/src/lib/stores/leads.ts` (constante + função depois de `listLeads`)
- Create: `apps/web/src/app/api/resultados/anuncios/pessoas/route.ts`
- Test: `apps/web/src/app/api/resultados/anuncios/pessoas/route.test.ts` (PostgREST falso; cobre as duas stores pela rota)

**Interfaces:**
- Consumes: `lerPessoasDoAnuncio`, `paraAGaveta`, `anuncioDaBusca`, `ChaveDoAnuncio`, `ContatosDoAnuncio`, `PessoasDoAnuncio` (Task 1); `periodoDaBusca`, `Periodo` (PR 5a); `PeriodoRecusado` (PR 5a, mesmo arquivo da store); `leadParaOPainel(lead)` de `@/lib/painel/inicio-carga`; `getRouteTenantContext`; `getSupabaseAdmin`.
- Produces:
  - `pessoasDoAnuncio(tenantId: string, periodo: Periodo, chave: ChaveDoAnuncio): Promise<PessoasDoAnuncio>` em `@/lib/stores/relatorio-de-anuncios` (lança `PeriodoRecusado` no `22023`)
  - `listLeadsByIds(tenantId: string, ids: readonly string[]): Promise<Lead[]>` em `@/lib/stores/leads` — mais recentes primeiro
  - `GET /api/resultados/anuncios/pessoas?de&ate&campanha&conjunto&anuncio` → `200 PessoasDaGaveta`
  - `GET …&lista=compraram|sem-compra` → `200 ContatosDoAnuncio` (contatos no formato do `/api/leads`, número inteiro)
  - erros: `400 { error }` (período, lista ou anúncio inválido; `22023`) | `403` (vendedora) | `500 { error: "Não deu para carregar quem veio por este anúncio." }`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { GET } from "./route";

/** Dono logado por Bearer (mesmo molde de api/resultados/anuncios/route.test.ts). */

const PESSOAS = {
  por_origem: [{ origem: "ig", cadastros: 3, vendido: 2440 }],
  compradores: [
    {
      lead_id: "lead-1",
      nome: "Bia Kids Modas",
      telefone: "5562999994821",
      grupo: "VIP 1",
      cadastro_em: "2026-09-14T15:00:00+00:00",
      primeira_compra: "2026-09-16T15:00:00+00:00",
      pedidos: 2,
      vendido: 1480,
    },
    {
      lead_id: null,
      nome: null,
      telefone: "5562977771107",
      grupo: null,
      cadastro_em: "2026-09-15T15:00:00+00:00",
      primeira_compra: "2026-09-15T18:00:00+00:00",
      pedidos: 1,
      vendido: 960,
    },
  ],
  sem_compra: ["lead-2", "lead-3"],
};

function lead(id: string, entered_at: string, phone: string) {
  return {
    id,
    tenant_id: "loja-b",
    phone,
    name: null,
    source_group_id: "g1",
    source_group_name: "VIP 1",
    source_campaign: null,
    status: "novo",
    entered_at,
    last_seen_at: null,
    also_in: [],
    metadata: {},
    created_at: entered_at,
    updated_at: entered_at,
  };
}
const LEADS = [
  lead("lead-1", "2026-09-20T12:00:00Z", "5562999994821"),
  lead("lead-2", "2026-09-25T12:00:00Z", "5562988881107"),
  lead("lead-3", "2026-09-22T12:00:00Z", "5562977773333"),
];

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let rpc: { status: number; corpo: unknown } = { status: 200, corpo: PESSOAS };
let leadsFalham = false;

/** `id=in.(a,b)` do postgrest-js → ["a", "b"]. */
function idsDaBusca(url: URL): string[] {
  return (url.searchParams.get("id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
}

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    chamadas.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined });
    const chave = `${req.method} ${url.pathname}`;
    let status = 500;
    let corpo: unknown = { message: `inesperado: ${chave}` };
    if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
    else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel, modules: [] }]];
    else if (chave === "POST /rest/v1/rpc/attribution_people") [status, corpo] = [rpc.status, rpc.corpo];
    else if (chave === "GET /rest/v1/leads") {
      const ids = idsDaBusca(url);
      [status, corpo] = leadsFalham
        ? [500, { message: "leads caiu" }]
        : [200, LEADS.filter((l) => ids.includes(l.id))];
    }
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
});
after(() => {
  supabase.close();
});
beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  rpc = { status: 200, corpo: PESSOAS };
  leadsFalham = false;
});

const PERIODO = "de=2026-09-11&ate=2026-10-10";
function pedir(busca: string): Request {
  return new Request(`http://girumo.test/api/resultados/anuncios/pessoas?${busca}`, {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}
const doRpc = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/attribution_people");
const dosLeads = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/leads");

test("gaveta: telefone mascarado, sem id; o tenant do RPC é o da sessão e o anúncio vai como veio", async () => {
  const resposta = await GET(
    pedir(
      `${PERIODO}&campanha=VIP+Atacado+%E2%80%94+Goi%C3%A2nia&anuncio=50%25+off+%26+frete%2Bgr%C3%A1tis&tenant_id=loja-x&p_tenant=loja-x`,
    ),
  );
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const texto = await resposta.text();
  const corpo = JSON.parse(texto);
  assert.deepEqual(doRpc()[0]?.corpo, {
    p_tenant: "loja-b",
    p_de: "2026-09-11",
    p_ate: "2026-10-10",
    p_campanha: "VIP Atacado — Goiânia",
    p_conjunto: null,
    p_anuncio: "50% off & frete+grátis",
  });
  assert.deepEqual(
    corpo.compradores.map((c: { nome: string | null; telefone: string; em_contatos: boolean }) => [
      c.nome,
      c.telefone,
      c.em_contatos,
    ]),
    [
      ["Bia Kids Modas", "(62) 9••••-4821", true],
      [null, "(62) 9••••-1107", false],
    ],
  );
  assert.equal(corpo.contatos_dos_compradores, 1);
  assert.equal(corpo.sem_compra, 2);
  assert.doesNotMatch(texto, /5562999994821|5562977771107|lead-|lead_id/);
  assert.equal(dosLeads().length, 0);
});

test("operador e admin também leem a gaveta (não tem gasto nela)", async () => {
  for (const p of ["operator", "admin"]) {
    papel = p;
    assert.equal((await GET(pedir(PERIODO))).status, 200, p);
  }
});

test("vendedora: 403 do guard de módulo e o RPC nunca roda", async () => {
  papel = "seller";
  const resposta = await GET(pedir(PERIODO));
  assert.equal(resposta.status, 403);
  assert.equal(doRpc().length, 0);
});

test("lista=compraram: só quem tem contato, lido por id e filtrando a loja, com o número inteiro", async () => {
  const resposta = await GET(pedir(`${PERIODO}&anuncio=A1&lista=compraram`));
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  assert.deepEqual(
    corpo.contatos.map((c: { id: string; phone: string }) => [c.id, c.phone]),
    [["lead-1", "5562999994821"]],
  );
  const [consulta] = dosLeads();
  assert.equal(consulta.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.deepEqual(idsDaBusca(consulta.url), ["lead-1"]);
});

test("lista=sem-compra: os que entraram sem comprar, mais recentes primeiro", async () => {
  const corpo = await (await GET(pedir(`${PERIODO}&anuncio=A1&lista=sem-compra`))).json();
  assert.deepEqual(corpo.contatos.map((c: { id: string }) => c.id), ["lead-2", "lead-3"]);
});

test("mais de 100 pessoas: lotes de 100 no in(), todos filtrando a loja", async () => {
  rpc = { status: 200, corpo: { ...PESSOAS, sem_compra: Array.from({ length: 150 }, (_, i) => `lead-${i}`) } };
  assert.equal((await GET(pedir(`${PERIODO}&lista=sem-compra`))).status, 200);
  const consultas = dosLeads();
  assert.deepEqual(consultas.map((c) => idsDaBusca(c.url).length).sort((a, b) => a - b), [50, 100]);
  for (const c of consultas) assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("ninguém na lista: nenhuma consulta a leads", async () => {
  rpc = { status: 200, corpo: { ...PESSOAS, compradores: [], sem_compra: [] } };
  const corpo = await (await GET(pedir(`${PERIODO}&lista=compraram`))).json();
  assert.deepEqual(corpo, { contatos: [] });
  assert.equal(dosLeads().length, 0);
});

test("busca ruim: 400 com mensagem e o banco não é consultado", async () => {
  for (const busca of [
    `${PERIODO}&lista=todos`,
    `${PERIODO}&anuncio=${"x".repeat(2001)}`,
    "de=2026-10-10&ate=2026-09-01",
    "de=2026-02-30&ate=2026-03-10",
  ]) {
    chamadas.length = 0;
    const resposta = await GET(pedir(busca));
    assert.equal(resposta.status, 400, busca);
    assert.equal(typeof (await resposta.json()).error, "string", busca);
    assert.equal(doRpc().length, 0, busca);
  }
});

test("o banco recusa o período (22023): 400, não 500", async () => {
  rpc = { status: 400, corpo: { code: "22023", message: "periodo invalido", details: null, hint: null } };
  const resposta = await GET(pedir(PERIODO));
  assert.equal(resposta.status, 400);
  assert.deepEqual(await resposta.json(), { error: "Período inválido." });
});

test("erro do banco, formato quebrado ou leads fora do ar: 500 sem vazar a mensagem", async () => {
  rpc = { status: 401, corpo: { code: "42501", message: "permission denied for function attribution_people" } };
  let resposta = await GET(pedir(PERIODO));
  assert.equal(resposta.status, 500);
  assert.doesNotMatch(await resposta.text(), /permission|attribution_people/);

  rpc = { status: 200, corpo: { ...PESSOAS, sem_compra: "2" } };
  resposta = await GET(pedir(PERIODO));
  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), { error: "Não deu para carregar quem veio por este anúncio." });

  rpc = { status: 200, corpo: PESSOAS };
  leadsFalham = true;
  resposta = await GET(pedir(`${PERIODO}&lista=sem-compra`));
  assert.equal(resposta.status, 500);
  assert.doesNotMatch(await resposta.text(), /leads caiu/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/resultados/anuncios/pessoas/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: A store do anúncio** — em `apps/web/src/lib/stores/relatorio-de-anuncios.ts` (criado no PR 5a), acrescentar ao bloco de imports, depois do import de `@/lib/resultados/periodo-anuncios`:

```ts
import {
  lerPessoasDoAnuncio,
  type ChaveDoAnuncio,
  type PessoasDoAnuncio,
} from "@/lib/resultados/pessoas-do-anuncio";
```

e ao fim do arquivo:

```ts
/**
 * Quem veio por um anúncio no período (`public.attribution_people`, só
 * `service_role`): a mesma regra de `relatorioDeAnuncios`, com as pessoas no
 * lugar das contagens. O tenant vai explícito pelo mesmo motivo — é ele que
 * isola as lojas. O telefone sai inteiro daqui: quem responde ao navegador
 * mascara (`paraAGaveta`).
 */
export async function pessoasDoAnuncio(
  tenantId: string,
  periodo: Periodo,
  chave: ChaveDoAnuncio,
): Promise<PessoasDoAnuncio> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_people", {
    p_tenant: tenantId,
    p_de: periodo.de,
    p_ate: periodo.ate,
    p_campanha: chave.campanha,
    p_conjunto: chave.conjunto,
    p_anuncio: chave.anuncio,
  });
  if (error) throw error.code === "22023" ? new PeriodoRecusado(error.message) : new Error(error.message);
  return lerPessoasDoAnuncio(data);
}
```

- [ ] **Step 4: Leads por id** — em `apps/web/src/lib/stores/leads.ts`, logo depois da função `listLeads`:

```ts
/** Ids por `in.(…)`: a URL do PostgREST não aguenta centenas de uuids, e o lote fica longe das 1000 linhas. */
const IDS_POR_CONSULTA = 100;

/**
 * Leads do tenant por id, mais recentes primeiro. Em lotes: "entraram e ainda
 * não compraram" de um anúncio passa fácil de 100 pessoas, e `listLeads` para
 * nas 1000 mais recentes — quem já era do grupo ficaria de fora.
 */
export async function listLeadsByIds(tenantId: string, ids: readonly string[]): Promise<Lead[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) lotes.push(ids.slice(i, i + IDS_POR_CONSULTA));
  const respostas = await Promise.all(
    lotes.map((lote) => getSupabaseAdmin().from(TABLE).select("*").eq("tenant_id", tenantId).in("id", lote)),
  );
  const leads: Lead[] = [];
  for (const { data, error } of respostas) {
    if (error) throw new Error(error.message);
    leads.push(...((data ?? []) as Lead[]));
  }
  return leads.sort((a, b) => (a.entered_at < b.entered_at ? 1 : a.entered_at > b.entered_at ? -1 : 0));
}
```

- [ ] **Step 5: Write the route**

```ts
import { leadParaOPainel } from "@/lib/painel/inicio-carga";
import { periodoDaBusca } from "@/lib/resultados/periodo-anuncios";
import { anuncioDaBusca, paraAGaveta, type ContatosDoAnuncio } from "@/lib/resultados/pessoas-do-anuncio";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listLeadsByIds } from "@/lib/stores/leads";
import { PeriodoRecusado, pessoasDoAnuncio } from "@/lib/stores/relatorio-de-anuncios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERRO = "Não deu para carregar quem veio por este anúncio.";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * GET /api/resultados/anuncios/pessoas?de&ate&campanha&conjunto&anuncio[&lista=]
 * (spec 2026-10-10-funil-anuncios §4 e §7). Sem `lista`: a gaveta "Ver quem" —
 * por onde, compradores com o telefone MASCARADO aqui e a contagem de quem entrou
 * sem comprar. Com `lista=compraram|sem-compra`: os contatos inteiros, para o
 * Contatos filtrado (que já mostra o número inteiro hoje).
 *
 * O tenant é sempre o da sessão. A vendedora não chega aqui: a rota não está em
 * `lib/auth/modulos.ts`. Não tem gasto nesta resposta, então operador lê igual.
 */
export async function GET(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    tenantId = (await getRouteTenantContext(req, { allowEngine: false })).tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/resultados/anuncios/pessoas] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  const busca = new URL(req.url).searchParams;
  const periodo = periodoDaBusca(busca, new Date());
  if (!periodo.ok) return resposta({ error: periodo.erro }, 400);
  const anuncio = anuncioDaBusca(busca);
  if (!anuncio.ok) return resposta({ error: anuncio.erro }, 400);

  try {
    const pessoas = await pessoasDoAnuncio(tenantId, periodo.periodo, anuncio.chave);
    if (anuncio.lista === null) return resposta(paraAGaveta(pessoas), 200);

    const ids =
      anuncio.lista === "compraram"
        ? pessoas.compradores.flatMap((c) => (c.lead_id ? [c.lead_id] : []))
        : pessoas.sem_compra;
    const leads = await listLeadsByIds(tenantId, [...new Set(ids)]);
    const corpo: ContatosDoAnuncio = { contatos: leads.map(leadParaOPainel) };
    return resposta(corpo, 200);
  } catch (e) {
    if (e instanceof PeriodoRecusado) return resposta({ error: "Período inválido." }, 400);
    console.error(`[api/resultados/anuncios/pessoas] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: ERRO }, 500);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/resultados/anuncios/pessoas/route.test.ts src/lib/stores/leads.test.ts`
Expected: PASS (10 testes da rota; `leads.test.ts` continua verde). As linhas `[api/resultados/anuncios/pessoas] loja-b: …` no stderr são do teste de 500 e esperadas.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/stores/relatorio-de-anuncios.ts apps/web/src/lib/stores/leads.ts apps/web/src/app/api/resultados/anuncios/pessoas
git commit -m "feat(resultados): GET /api/resultados/anuncios/pessoas with masked phones and contact lists by id"
```

### Task 5: Vendedora barrada no E2E, gate, PR 6a, prova e card

**Files:**
- Modify: `apps/web/e2e/vendas-vendedora.spec.ts` (teste "as rotas do dono respondem 403 para ela; as de vendas, 200", logo depois do bloco `/api/resultados/anuncios` que o PR 5a acrescentou)

**Interfaces:**
- Consumes: `GET /api/resultados/anuncios/pessoas` (Task 4); `MENSAGEM_BLOQUEIO` (já importado no spec).
- Produces: nada.

- [ ] **Step 1: Acrescentar a asserção** — depois de `expect(await anuncios.text()).toBe(MENSAGEM_BLOQUEIO);`, dentro do mesmo teste:

```ts
    // Gaveta "Ver quem" (spec 2026-10-10 §7): nomes e telefones de compradores, fora do mapa dela.
    const pessoas = await page.request.get("/api/resultados/anuncios/pessoas");
    expect(pessoas.status()).toBe(403);
    expect(await pessoas.text()).toBe(MENSAGEM_BLOQUEIO);
```

A inserção fica **logo depois** do bloco de `anuncios` (PR 5a) e termina em `expect(await pessoas.text()).toBe(MENSAGEM_BLOQUEIO);`. O PR 7 também acrescenta asserções neste teste, depois do 6a: elas vão depois desta linha, que passa a ser a âncora dele.

- [ ] **Step 2: Gate local** (em `apps/web`)

Run: `npm run lint` · `npx tsc --noEmit --project tsconfig.json` · `npx tsc --noEmit --project tsconfig.e2e.json` · `npm test`
Expected: tudo verde; os integration tests aparecem como pulados localmente.

Depois, em PowerShell, o gate do CI a partir do worktree:

```
Set-Location <caminho do worktree pr6a>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/vendas-vendedora.spec.ts
git commit -m "test(e2e): seller gets 403 on the ad people route"
```

- [ ] **Step 4: PR** — **só depois da Task 3 completa** (função nos dois bancos + baseline commitada). Push e PR "feat(resultados): attribution_people e rota da gaveta do anúncio (funil de anúncios, PR 6a)". No corpo: migração **já aplicada nos dois bancos**, saída do Step 2 da Task 3 (privilégio e md5 iguais), advisor limpo, a decisão "função SQL em vez de TS" com o custo, terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. CI verde (job e2e roda o teste de integração e o 403 da vendedora; job `drift` confere a baseline) → mergear → apagar a branch.

- [ ] **Step 5: Prova em prod depois do deploy**, logado como dono da loja-piloto, no console do navegador em `/painel`, com um anúncio que tenha comprador na tabela do relatório:

```js
const r = await (await fetch("/api/resultados/anuncios?de=2026-09-11&ate=2026-10-10")).json();
const a = r.relatorio.linhas.find((l) => l.nivel === "anuncio" && l.compradores > 0);
const q = new URLSearchParams({ de: "2026-09-11", ate: "2026-10-10" });
for (const k of ["campanha", "conjunto", "anuncio"]) if (a[k] !== null) q.set(k, a[k]);
const g = await (await fetch(`/api/resultados/anuncios/pessoas?${q}`)).json();
[a.compradores, g.compradores.length, a.vendido, g.compradores.reduce((s, c) => s + c.vendido, 0), g.compradores.map((c) => c.telefone)]
```

Expected: os dois primeiros iguais, os dois seguintes iguais, e todo telefone no formato `(DD) 9••••-NNNN`. Sem nenhum anúncio com comprador ainda (cadastros do site recém-chegando), conferir só o formato e `sem_compra`.

- [ ] **Step 6: Card** (prod): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 6a: attribution_people nos dois bancos e rota da gaveta; tabela e gaveta no 6b', 'PR #<n>');`

---

# PR 6b — tabela, gaveta e cartões

Com o 6a e o 5b mergeados, em PowerShell no checkout principal:

```powershell
git fetch origin main
git worktree add -b feat/funil-anuncios-pr6b-tabela ..\pr6b origin/main
```

Confira que `origin/main` tem `apps/web/src/components/painel/resultados/anuncios/aba-anuncios.tsx` e `funil-grande.tsx` (PR 5b) e `apps/web/src/lib/resultados/pessoas-do-anuncio.ts` (6a). Comandos abaixo rodam em `apps/web` do worktree novo.

### Task 6: Regras puras da tabela, dos cartões e da gaveta

**Files:**
- Create: `apps/web/src/lib/resultados/anuncios-linhas.ts`
- Test: `apps/web/src/lib/resultados/anuncios-linhas.test.ts`

**Interfaces:**
- Consumes: de `./anuncios-tela` (PR 5b): `clipDoDegrau(recuo)`, `contagem(n, um, varios)`, `custoPor(gasto | null, n)`, `degrausDoTotal(total)`, `dinheiro(v)`, `geometriaDoFunil(valores, forma)`, `inteiro(n)`, `porcentagem(parte, todo)`, `porOnde(porOrigem)`, `retorno(vendido, gasto | null)`, tipos `CartaoDeOrigem`, `FatiaDoFunil`, `FormaDoFunil`; `diaMesBR(iso)` de `@/lib/date-br`; `ChaveDoAnuncio`, `CompradorDaGaveta`, `SEM_CAMPANHA`, `SEM_CONJUNTO`, `SEM_ANUNCIO` (6a); `LinhaRelatorio`, `NivelLinha`, `RelatorioParaTela` (PR 5a).
- Produces (todos de `@/lib/resultados/anuncios-linhas`):
  - `type Contas = RelatorioParaTela["total"]` (uma `LinhaRelatorio` entra direto)
  - `MINI_FUNIL_A = { piso: 22, bico: 16 }`, `MINI_FUNIL_B = { piso: 40, bico: 36 }`, `FUNIL_GAVETA = { piso: 36, bico: 34 }`
  - `rotuloDaLinha(l)`, `caminhoDaLinha(l)`, `chaveDaLinha(l): ChaveDoAnuncio`
  - `type NoDaTabela = { chave: string; linha: LinhaRelatorio; rotulo: string; tipo: string; filhos: NoDaTabela[] }`; `arvoreDasLinhas(linhas): NoDaTabela[]`
  - `type LinhaVisivel = { no: NoDaTabela; profundidade: number; aberto: boolean }`; `linhasVisiveis(arvore, abertos: ReadonlySet<string>): LinhaVisivel[]`
  - `type ColunasDaLinha = { gasto; cadastros; compraram; vendido; retorno }` (strings); `colunasDaLinha(c: Contas)`
  - `clipDeitado(f: FatiaDoFunil): string`; `type MiniFunilModelo = { segmentos: { clip: string; titulo: string }[]; taxa: string; leitor: string }`; `miniFunilA(c: Contas)`
  - `type DegrauEmPe = { chave: string; valor: number; rotulo: string; passagem: string; largura: number; clip: string }`; `type FunilEmPeModelo = { degraus: DegrauEmPe[]; bico: { largura: number; valor: string; pedidos: string } }`; `funilEmPe(c: Contas, forma: FormaDoFunil)`
  - `type CartaoDeCampanha = { chave; rotulo; aviso: string | null; gasto; funil: FunilEmPeModelo; retorno; compram; porComprador; mais: string | null }`; `cartaoDaCampanha(no: NoDaTabela)`
  - `resumoDaLinha(c: Contas): string`
  - `type FatiaDeOrigem = { nome: CartaoDeOrigem["nome"]; largura: number; texto: string }`; `fatiasDeOrigem(porOrigem)`
  - `type LinhaDoComprador = { titulo; detalhe; total; quando }`; `linhaDoComprador(c: CompradorDaGaveta)`
  - `verEmContatos(n)`, `notaForaDeContatos(n): string | null`, `textoDeSemCompra(semCompra, entraram)` (o `tituloDoFiltro` do Contatos fica no 6c, junto da faixa)

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arvoreDasLinhas,
  caminhoDaLinha,
  cartaoDaCampanha,
  chaveDaLinha,
  colunasDaLinha,
  fatiasDeOrigem,
  FUNIL_GAVETA,
  funilEmPe,
  linhaDoComprador,
  linhasVisiveis,
  miniFunilA,
  notaForaDeContatos,
  resumoDaLinha,
  rotuloDaLinha,
  textoDeSemCompra,
  verEmContatos,
} from "./anuncios-linhas";
import type { LinhaRelatorio } from "./relatorio-anuncios";

/** O Intl separa "R$" do número com espaço sem quebra; o teste lê com espaço comum. */
const legivel = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replace(/\u00a0/g, " "));

function linha(
  nivel: LinhaRelatorio["nivel"],
  campanha: string | null,
  conjunto: string | null,
  anuncio: string | null,
  [cadastros, foram, entraram, compradores]: [number, number, number, number],
  vendido: number,
  gasto: number | null = null,
  pedidos = compradores,
): LinhaRelatorio {
  return { nivel, campanha, conjunto, anuncio, cadastros, foram, entraram, ja_membros: 0, compradores, pedidos, vendido, gasto };
}

const G = "VIP Atacado — Goiânia";
const B = "VIP Atacado — Brasil";
const S1 = "Lojistas de moda infantil · Goiânia 40 km";
const S2 = "Interesse: moda infantil atacado";
const S3 = "Brasil · lojistas 25–50";

/** O exemplo do mockup (Main.dc.html), na ordem alfabética em que o SQL devolve. */
const LINHAS: LinhaRelatorio[] = [
  linha("campanha", B, null, null, [196, 182, 158, 12], 5740, 980),
  linha("conjunto", B, S3, null, [196, 182, 158, 12], 5740),
  linha("anuncio", B, S3, "Kit 10 peças — carrossel", [76, 69, 59, 3], 1330),
  linha("anuncio", B, S3, "Verão Kids — vídeo 15s", [120, 113, 99, 9], 4410),
  linha("campanha", G, null, null, [371, 348, 304, 31], 14980, 1620, 39),
  linha("conjunto", G, S2, null, [143, 134, 115, 9], 4140),
  linha("anuncio", G, S2, "Preço de atacado — estático", [47, 44, 38, 2], 830),
  linha("anuncio", G, S2, "Provador ao vivo — reels", [96, 90, 77, 7], 3310),
  linha("conjunto", G, S1, null, [228, 214, 189, 22], 10840),
  linha("anuncio", G, S1, "Kit 10 peças — carrossel", [87, 81, 71, 6], 2920),
  linha("anuncio", G, S1, "Verão Kids — vídeo 15s", [141, 133, 118, 16], 7920, null, 21),
  linha("campanha", null, null, null, [14, 14, 14, 0], 0),
  linha("conjunto", null, null, null, [14, 14, 14, 0], 0),
  linha("anuncio", null, null, null, [14, 14, 14, 0], 0),
];
const A1 = LINHAS[10];

test("árvore: campanha › conjunto › anúncio, maior vendido primeiro e (sem UTM) por último", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  assert.deepEqual(
    arvore.map((n) => [n.tipo, n.rotulo]),
    [
      ["Campanha", G],
      ["Campanha", B],
      ["Sem parâmetros no link", "(sem UTM)"],
    ],
  );
  assert.deepEqual(arvore[0].filhos.map((s) => s.rotulo), [S1, S2]);
  assert.deepEqual(
    arvore[0].filhos[0].filhos.map((a) => [a.tipo, a.rotulo]),
    [
      ["Anúncio", "Verão Kids — vídeo 15s"],
      ["Anúncio", "Kit 10 peças — carrossel"],
    ],
  );
  assert.deepEqual(arvore[2].filhos.map((s) => s.rotulo), ["(sem conjunto)"]);
  assert.deepEqual(arvore[2].filhos[0].filhos.map((a) => a.rotulo), ["(sem anúncio)"]);
  // O mesmo nome de anúncio em duas campanhas não se mistura.
  assert.equal(arvore[1].filhos[0].filhos.find((a) => a.rotulo === "Verão Kids — vídeo 15s")?.linha.cadastros, 120);
});

test("campanha só com gasto (nenhum cadastro) entra sem filhos, antes do (sem UTM)", () => {
  const c9 = linha("campanha", "C9", null, null, [0, 0, 0, 0], 0, 90);
  const arvore = arvoreDasLinhas([...LINHAS, c9]);
  assert.deepEqual(arvore.map((n) => n.rotulo), [G, B, "C9", "(sem UTM)"]);
  assert.deepEqual(arvore[2].filhos, []);
});

test("linhas visíveis: fechado mostra só campanhas; aberto desce um nível por vez", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  assert.deepEqual(
    linhasVisiveis(arvore, new Set()).map((l) => [l.profundidade, l.no.rotulo, l.aberto]),
    [
      [0, G, false],
      [0, B, false],
      [0, "(sem UTM)", false],
    ],
  );
  const abertos = new Set([arvore[0].chave, arvore[0].filhos[0].chave]);
  assert.deepEqual(
    linhasVisiveis(arvore, abertos).map((l) => [l.profundidade, l.no.rotulo]),
    [
      [0, G],
      [1, S1],
      [2, "Verão Kids — vídeo 15s"],
      [2, "Kit 10 peças — carrossel"],
      [1, S2],
      [0, B],
      [0, "(sem UTM)"],
    ],
  );
  // Conjunto aberto dentro de campanha fechada não aparece.
  assert.equal(linhasVisiveis(arvore, new Set([arvore[0].filhos[0].chave])).length, 3);
});

test("colunas: gasto e retorno só na campanha; sem gasto, escondido ou zero, travessão", () => {
  const [goiania] = arvoreDasLinhas(LINHAS);
  assert.deepEqual(legivel(colunasDaLinha(goiania.linha)), {
    gasto: "R$ 1.620",
    cadastros: "371",
    compraram: "31",
    vendido: "R$ 14.980",
    retorno: "9,2×",
  });
  const conjunto = colunasDaLinha(goiania.filhos[0].linha);
  assert.deepEqual([conjunto.gasto, conjunto.retorno], ["—", "—"]);
  for (const gasto of [null, 0]) {
    const c = colunasDaLinha({ ...goiania.linha, gasto });
    assert.deepEqual([c.gasto, c.retorno], ["—", "—"], String(gasto));
  }
  // Campanha só com gasto: o retorno zero é verdade, não travessão.
  const c9 = colunasDaLinha(linha("campanha", "C9", null, null, [0, 0, 0, 0], 0, 90));
  assert.deepEqual(legivel([c9.gasto, c9.cadastros, c9.retorno]), ["R$ 90", "0", "0,0×"]);
});

test("mini-funil A: altura pelos cadastros da própria linha, número de cada degrau no título e no leitor", () => {
  const m = miniFunilA(A1);
  assert.deepEqual(m.segmentos, [
    { clip: "polygon(0 0%, 100% 2.2%, 100% 97.8%, 0 100%)", titulo: "141 cadastros" },
    { clip: "polygon(0 2.2%, 100% 6.4%, 100% 93.6%, 0 97.8%)", titulo: "133 foram pro grupo" },
    { clip: "polygon(0 6.4%, 100% 34.6%, 100% 65.4%, 0 93.6%)", titulo: "118 entraram" },
    { clip: "polygon(0 34.6%, 100% 42%, 100% 58%, 0 65.4%)", titulo: "16 compraram" },
  ]);
  assert.equal(m.taxa, "11%");
  assert.equal(m.leitor, "Funil: 141 cadastros, 133 foram pro grupo, 118 entraram, 16 compraram.");
});

test("mini-funil A sem cadastro (campanha só com gasto): tudo no piso, taxa em travessão, sem NaN", () => {
  const m = miniFunilA(linha("campanha", "C9", null, null, [0, 0, 0, 0], 0, 90));
  const piso = "polygon(0 39%, 100% 39%, 100% 61%, 0 61%)";
  assert.deepEqual(m.segmentos.map((s) => s.clip), [piso, piso, piso, "polygon(0 39%, 100% 42%, 100% 58%, 0 61%)"]);
  assert.equal(m.taxa, "—");
  assert.doesNotMatch(JSON.stringify(m), /NaN/);
});

test("mini-funil A nunca alarga: entraram acima de foram satura na altura de cima", () => {
  const m = miniFunilA(linha("anuncio", "C", "S", "A", [10, 4, 6, 0], 0));
  assert.deepEqual(m.segmentos.map((s) => s.clip), [
    "polygon(0 0%, 100% 23.4%, 100% 76.6%, 0 100%)",
    "polygon(0 23.4%, 100% 23.4%, 100% 76.6%, 0 76.6%)",
    "polygon(0 23.4%, 100% 39%, 100% 61%, 0 76.6%)",
    "polygon(0 39%, 100% 42%, 100% 58%, 0 61%)",
  ]);
  assert.equal(m.taxa, "0%");
});

test("funil em pé da gaveta: 36% + 64%, bico de 34%, passagem só com a taxa", () => {
  const f = funilEmPe(A1, FUNIL_GAVETA);
  assert.deepEqual(
    f.degraus.map((d) => [d.valor, d.rotulo, d.passagem, d.largura, d.clip]),
    [
      [141, "cadastros", "", 100, "polygon(0 0, 100% 0, 98.18% 100%, 1.82% 100%)"],
      [133, "foram pro grupo", "94%", 96.37, "polygon(0 0, 100% 0, 96.47% 100%, 3.53% 100%)"],
      [118, "entraram", "89%", 89.56, "polygon(0 0, 100% 0, 74.15% 100%, 25.85% 100%)"],
      [16, "compraram", "14%", 43.26, "polygon(0 0, 100% 0, 89.3% 100%, 10.7% 100%)"],
    ],
  );
  assert.deepEqual(legivel(f.bico), { largura: 34, valor: "R$ 7.920", pedidos: "21 pedidos" });
});

test("cartão B: funil 40% + 60%, retorno, taxa e custo por comprador; 'Ver N conjuntos e M anúncios'", () => {
  const [goiania, brasil, semUtm] = arvoreDasLinhas(LINHAS);
  const c = cartaoDaCampanha(goiania);
  assert.deepEqual(
    legivel({
      rotulo: c.rotulo,
      aviso: c.aviso,
      gasto: c.gasto,
      retorno: c.retorno,
      compram: c.compram,
      porComprador: c.porComprador,
      mais: c.mais,
    }),
    {
      rotulo: G,
      aviso: null,
      gasto: "R$ 1.620",
      retorno: "9,2×",
      compram: "8,4%",
      porComprador: "R$ 52,26",
      mais: "Ver 2 conjuntos e 4 anúncios",
    },
  );
  assert.deepEqual(c.funil.degraus.map((d) => d.largura), [100, 96.28, 89.16, 45.01]);
  assert.equal(c.funil.degraus[2].clip, "polygon(0 0, 100% 0, 75.24% 100%, 24.76% 100%)");
  assert.equal(c.funil.bico.largura, 36);
  assert.equal(cartaoDaCampanha(brasil).mais, "Ver 1 conjunto e 2 anúncios");

  const s = cartaoDaCampanha(semUtm);
  assert.deepEqual(
    [s.aviso, s.gasto, s.retorno, s.compram, s.porComprador, s.mais],
    ["Chegaram sem os parâmetros do anúncio no link.", "—", "—", "0%", "—", "Ver 1 conjunto e 1 anúncio"],
  );
});

test("cartão sem ads:manage (gasto null): gasto, retorno e custo em travessão", () => {
  const [goiania] = arvoreDasLinhas(LINHAS.map((l) => ({ ...l, gasto: null })));
  const c = cartaoDaCampanha(goiania);
  assert.deepEqual([c.gasto, c.retorno, c.porComprador], ["—", "—", "—"]);
});

test("rótulos, caminho e chave da linha", () => {
  const vazia = { nivel: "anuncio", campanha: null, conjunto: null, anuncio: null } as const;
  assert.equal(rotuloDaLinha(vazia), "(sem anúncio)");
  assert.equal(rotuloDaLinha({ ...vazia, nivel: "conjunto" }), "(sem conjunto)");
  assert.equal(rotuloDaLinha({ ...vazia, nivel: "campanha" }), "(sem UTM)");
  assert.equal(caminhoDaLinha(vazia), "(sem UTM) › (sem conjunto)");
  assert.equal(caminhoDaLinha(A1), `${G} › ${S1}`);
  assert.deepEqual(chaveDaLinha(A1), { campanha: G, conjunto: S1, anuncio: "Verão Kids — vídeo 15s" });
});

test("resumo da linha no cartão aberto", () => {
  assert.equal(legivel(resumoDaLinha(A1)), "141 cadastros · 16 compraram · R$ 7.920");
  assert.equal(legivel(resumoDaLinha(linha("anuncio", "C", "S", "A", [1, 1, 1, 1], 50))), "1 cadastro · 1 comprou · R$ 50");
});

test("por onde a pessoa viu: fatias em % dos cadastros, ig e fb agrupados como na aba", () => {
  assert.deepEqual(
    fatiasDeOrigem([
      { origem: "ig", cadastros: 90, vendido: 5000 },
      { origem: "fb", cadastros: 51, vendido: 2920 },
    ]),
    [
      { nome: "Instagram", largura: 63.83, texto: "Instagram 64%" },
      { nome: "Facebook", largura: 36.17, texto: "Facebook 36%" },
    ],
  );
  assert.deepEqual(fatiasDeOrigem([]), []);
});

test("comprador: nome do WhatsApp quando há; sem nome, o telefone mascarado vira o título", () => {
  const base = {
    nome: "Bia Kids Modas",
    telefone: "(62) 9••••-4821",
    grupo: "Moda Kids VIP 3",
    cadastro_em: "2026-09-14T15:00:00+00:00",
    primeira_compra: "2026-09-16T15:00:00+00:00",
    pedidos: 2,
    vendido: 1480,
    em_contatos: true,
  };
  assert.deepEqual(legivel(linhaDoComprador(base)), {
    titulo: "Bia Kids Modas",
    detalhe: "(62) 9••••-4821 · Moda Kids VIP 3",
    total: "R$ 1.480",
    quando: "cadastro 14/09 · 1ª compra 16/09 · 2 pedidos",
  });
  assert.deepEqual(
    legivel(linhaDoComprador({ ...base, nome: "  ", grupo: null, pedidos: 1, em_contatos: false })),
    {
      titulo: "(62) 9••••-4821",
      detalhe: "não está em Contatos",
      total: "R$ 1.480",
      quando: "cadastro 14/09 · 1ª compra 16/09",
    },
  );
});

test("textos da gaveta", () => {
  assert.equal(verEmContatos(16), "Ver os 16 em Contatos");
  assert.equal(verEmContatos(1), "Ver a pessoa em Contatos");
  assert.equal(notaForaDeContatos(0), null);
  assert.equal(notaForaDeContatos(1), "1 pessoa comprou sem estar em Contatos: o telefone veio só no pedido.");
  assert.equal(notaForaDeContatos(3), "3 pessoas compraram sem estar em Contatos: o telefone veio só no pedido.");
  assert.equal(textoDeSemCompra(102, 118), "Entraram pelo anúncio. Uma oferta postada no grupo alcança quem continua lá.");
  assert.equal(textoDeSemCompra(0, 0), "Ninguém entrou no grupo por este anúncio ainda.");
  assert.equal(textoDeSemCompra(0, 5), "Quem entrou por este anúncio já comprou.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/anuncios-linhas.test.ts`
Expected: FAIL — `Cannot find module './anuncios-linhas'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/resultados/anuncios-linhas.ts
import { diaMesBR } from "@/lib/date-br";
import {
  clipDoDegrau,
  contagem,
  custoPor,
  degrausDoTotal,
  dinheiro,
  geometriaDoFunil,
  inteiro,
  porcentagem,
  porOnde,
  retorno,
  type CartaoDeOrigem,
  type FatiaDoFunil,
  type FormaDoFunil,
} from "./anuncios-tela";
import {
  SEM_ANUNCIO,
  SEM_CAMPANHA,
  SEM_CONJUNTO,
  type ChaveDoAnuncio,
  type CompradorDaGaveta,
} from "./pessoas-do-anuncio";
import type { LinhaRelatorio, NivelLinha, RelatorioParaTela } from "./relatorio-anuncios";

/**
 * Regras puras da tabela campanha › conjunto › anúncio, dos cartões do celular e
 * da gaveta "Ver quem" (spec 2026-10-10-funil-anuncios §4, mockups MiniFunil,
 * Main, Celular e Anuncio). Os componentes só desenham o que sai daqui.
 */

/** O que tabela, cartão e gaveta leem de uma linha. O total do relatório também cabe. */
export type Contas = RelatorioParaTela["total"];

/** Mini-funil A, deitado na linha da tabela (mockup MiniFunil): altura 22% + 78% × n/cadastros, bico 16%. */
export const MINI_FUNIL_A: FormaDoFunil = { piso: 22, bico: 16 };
/** Mini-funil B, em pé no cartão do celular (mockup Celular): 40% + 60%, bico 36%. */
export const MINI_FUNIL_B: FormaDoFunil = { piso: 40, bico: 36 };
/** Funil em pé da gaveta do anúncio (mockup Anuncio): 36% + 64%, bico 34%. */
export const FUNIL_GAVETA: FormaDoFunil = { piso: 36, bico: 34 };

const NOMES_DOS_DEGRAUS = ["cadastros", "foram pro grupo", "entraram", "compraram"] as const;
const valoresDe = (c: Contas) => [c.cadastros, c.foram, c.entraram, c.compradores];
const umaCasa = (n: number) => Math.round(n * 10) / 10;
const duasCasas = (n: number) => Math.round(n * 100) / 100;

type Nomes = Pick<LinhaRelatorio, "nivel" | "campanha" | "conjunto" | "anuncio">;

export function rotuloDaLinha(l: Nomes): string {
  if (l.nivel === "campanha") return l.campanha ?? SEM_CAMPANHA;
  if (l.nivel === "conjunto") return l.conjunto ?? SEM_CONJUNTO;
  return l.anuncio ?? SEM_ANUNCIO;
}

/** "Campanha › Conjunto", acima do nome do anúncio na gaveta. */
export function caminhoDaLinha(l: Nomes): string {
  return `${l.campanha ?? SEM_CAMPANHA} › ${l.conjunto ?? SEM_CONJUNTO}`;
}

export function chaveDaLinha(l: Nomes): ChaveDoAnuncio {
  return { campanha: l.campanha, conjunto: l.conjunto, anuncio: l.anuncio };
}

export type NoDaTabela = { chave: string; linha: LinhaRelatorio; rotulo: string; tipo: string; filhos: NoDaTabela[] };

const TIPO: Record<NivelLinha, string> = { campanha: "Campanha", conjunto: "Conjunto", anuncio: "Anúncio" };

function no(l: LinhaRelatorio, filhos: NoDaTabela[]): NoDaTabela {
  return {
    chave: JSON.stringify([l.nivel, l.campanha, l.conjunto, l.anuncio]),
    linha: l,
    rotulo: rotuloDaLinha(l),
    tipo: l.nivel === "campanha" && l.campanha === null ? "Sem parâmetros no link" : TIPO[l.nivel],
    filhos,
  };
}

/** Quem vende mais primeiro; empate por cadastros e pelo nome. */
function ordenar(nos: NoDaTabela[]): NoDaTabela[] {
  return [...nos].sort(
    (a, b) =>
      b.linha.vendido - a.linha.vendido ||
      b.linha.cadastros - a.linha.cadastros ||
      a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );
}

/**
 * As linhas do relatório (os três níveis já agregados no SQL) viram árvore.
 * "(sem UTM)" vai por último: não é campanha de verdade, mas abre como as outras
 * para quem chegou sem parâmetros também ter "Ver quem".
 */
export function arvoreDasLinhas(linhas: readonly LinhaRelatorio[]): NoDaTabela[] {
  const anunciosDe = (s: LinhaRelatorio) =>
    linhas.filter((l) => l.nivel === "anuncio" && l.campanha === s.campanha && l.conjunto === s.conjunto);
  const conjuntosDe = (c: LinhaRelatorio) =>
    linhas.filter((l) => l.nivel === "conjunto" && l.campanha === c.campanha);
  const campanhas = ordenar(
    linhas
      .filter((l) => l.nivel === "campanha")
      .map((c) => no(c, ordenar(conjuntosDe(c).map((s) => no(s, ordenar(anunciosDe(s).map((a) => no(a, [])))))))),
  );
  return [...campanhas.filter((n) => n.linha.campanha !== null), ...campanhas.filter((n) => n.linha.campanha === null)];
}

export type LinhaVisivel = { no: NoDaTabela; profundidade: number; aberto: boolean };

/** O que a tabela mostra com estas chaves abertas: filho só aparece com o pai aberto. */
export function linhasVisiveis(
  arvore: readonly NoDaTabela[],
  abertos: ReadonlySet<string>,
  profundidade = 0,
): LinhaVisivel[] {
  return arvore.flatMap((n) => {
    const aberto = n.filhos.length > 0 && abertos.has(n.chave);
    return [{ no: n, profundidade, aberto }, ...(aberto ? linhasVisiveis(n.filhos, abertos, profundidade + 1) : [])];
  });
}

export type ColunasDaLinha = { gasto: string; cadastros: string; compraram: string; vendido: string; retorno: string };

/**
 * Gasto só existe na campanha (spec §1); conjunto e anúncio chegam com `null`, e
 * quem não tem `ads:manage` também (`semGasto`). Sem gasto: travessão, nunca R$ 0.
 */
export function colunasDaLinha(c: Contas): ColunasDaLinha {
  return {
    gasto: c.gasto !== null && c.gasto > 0 ? dinheiro(c.gasto) : "—",
    cadastros: inteiro(c.cadastros),
    compraram: inteiro(c.compradores),
    vendido: dinheiro(c.vendido),
    retorno: retorno(c.vendido, c.gasto) ?? "—",
  };
}

/**
 * Recorte do degrau deitado: a altura (`largura` da geometria) centrada na
 * vertical, fechando à direita na altura do próximo — `recuo` é % da própria
 * altura, de cada lado (a mesma conta do funil grande, girada).
 */
export function clipDeitado(f: FatiaDoFunil): string {
  const proxima = f.largura * (1 - (2 * f.recuo) / 100);
  const a = umaCasa((100 - f.largura) / 2);
  const b = umaCasa((100 - proxima) / 2);
  return `polygon(0 ${a}%, 100% ${b}%, 100% ${umaCasa(100 - b)}%, 0 ${umaCasa(100 - a)}%)`;
}

export type MiniFunilModelo = { segmentos: { clip: string; titulo: string }[]; taxa: string; leitor: string };

/**
 * Mini-funil A (spec §4): quatro degraus deitados com a altura relativa aos
 * cadastros da PRÓPRIA linha, a taxa de compra na ponta, o número de cada degrau
 * no `title` e tudo em texto para o leitor de tela.
 */
export function miniFunilA(c: Contas): MiniFunilModelo {
  const valores = valoresDe(c);
  const textos = valores.map((v, i) => `${inteiro(v)} ${NOMES_DOS_DEGRAUS[i]}`);
  return {
    segmentos: geometriaDoFunil(valores, MINI_FUNIL_A).map((f, i) => ({ clip: clipDeitado(f), titulo: textos[i] })),
    taxa: porcentagem(c.compradores, c.cadastros) ?? "—",
    leitor: `Funil: ${textos.join(", ")}.`,
  };
}

export type DegrauEmPe = {
  chave: string;
  valor: number;
  rotulo: string;
  /** Só a taxa ("94%"); o primeiro degrau não tem. */
  passagem: string;
  largura: number;
  clip: string;
};
export type FunilEmPeModelo = { degraus: DegrauEmPe[]; bico: { largura: number; valor: string; pedidos: string } };

/** Funil em pé pequeno (cartão B e gaveta): a geometria do PR 5 com outra forma. */
export function funilEmPe(c: Contas, forma: FormaDoFunil): FunilEmPeModelo {
  const geometria = geometriaDoFunil(valoresDe(c), forma);
  return {
    degraus: degrausDoTotal(c).map((d, i) => ({
      chave: d.chave,
      valor: d.valor,
      rotulo: NOMES_DOS_DEGRAUS[i],
      passagem: i === 0 ? "" : (d.taxa ?? d.passagem),
      largura: geometria[i].largura,
      clip: clipDoDegrau(geometria[i].recuo),
    })),
    bico: { largura: forma.bico, valor: dinheiro(c.vendido), pedidos: contagem(c.pedidos, "pedido", "pedidos") },
  };
}

export type CartaoDeCampanha = {
  chave: string;
  rotulo: string;
  aviso: string | null;
  gasto: string;
  funil: FunilEmPeModelo;
  retorno: string;
  compram: string;
  porComprador: string;
  /** "Ver 2 conjuntos e 4 anúncios"; `null` sem filhos. */
  mais: string | null;
};

/** Mini-funil B (spec §4, celular): um cartão por campanha. */
export function cartaoDaCampanha(n: NoDaTabela): CartaoDeCampanha {
  const l = n.linha;
  const anuncios = n.filhos.reduce((soma, s) => soma + s.filhos.length, 0);
  return {
    chave: n.chave,
    rotulo: n.rotulo,
    aviso: l.campanha === null ? "Chegaram sem os parâmetros do anúncio no link." : null,
    gasto: colunasDaLinha(l).gasto,
    funil: funilEmPe(l, MINI_FUNIL_B),
    retorno: retorno(l.vendido, l.gasto) ?? "—",
    compram: porcentagem(l.compradores, l.cadastros) ?? "—",
    porComprador: custoPor(l.gasto, l.compradores) ?? "—",
    mais:
      n.filhos.length === 0
        ? null
        : `Ver ${contagem(n.filhos.length, "conjunto", "conjuntos")} e ${contagem(anuncios, "anúncio", "anúncios")}`,
  };
}

/** Uma linha de conjunto ou anúncio no cartão aberto: "141 cadastros · 16 compraram · R$ 7.920". */
export function resumoDaLinha(c: Contas): string {
  return `${contagem(c.cadastros, "cadastro", "cadastros")} · ${inteiro(c.compradores)} ${
    c.compradores === 1 ? "comprou" : "compraram"
  } · ${dinheiro(c.vendido)}`;
}

export type FatiaDeOrigem = { nome: CartaoDeOrigem["nome"]; largura: number; texto: string };

/** "Por onde a pessoa viu" na gaveta: a barra em % dos cadastros, com os grupos do `porOnde` da aba. */
export function fatiasDeOrigem(porOrigem: RelatorioParaTela["por_origem"]): FatiaDeOrigem[] {
  const cartoes = porOnde(porOrigem).filter((c) => c.cadastros > 0);
  const total = cartoes.reduce((s, c) => s + c.cadastros, 0);
  return cartoes.map((c) => ({
    nome: c.nome,
    largura: duasCasas((c.cadastros / total) * 100),
    texto: `${c.nome} ${porcentagem(c.cadastros, total) ?? ""}`,
  }));
}

export type LinhaDoComprador = { titulo: string; detalhe: string; total: string; quando: string };

/**
 * Uma pessoa em "Quem comprou". O worker quase nunca tem o nome do WhatsApp:
 * sem nome, o telefone (já mascarado pela rota) é o título.
 */
export function linhaDoComprador(c: CompradorDaGaveta): LinhaDoComprador {
  const nome = c.nome?.trim() || null;
  return {
    titulo: nome ?? c.telefone,
    detalhe: [nome ? c.telefone : null, c.grupo, c.em_contatos ? null : "não está em Contatos"]
      .filter(Boolean)
      .join(" · "),
    total: dinheiro(c.vendido),
    quando: [
      `cadastro ${diaMesBR(c.cadastro_em) ?? "—"}`,
      `1ª compra ${diaMesBR(c.primeira_compra) ?? "—"}`,
      c.pedidos > 1 ? `${inteiro(c.pedidos)} pedidos` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function verEmContatos(n: number): string {
  return n === 1 ? "Ver a pessoa em Contatos" : `Ver os ${inteiro(n)} em Contatos`;
}

/** Quem comprou só com telefone no pedido (ninguém com o número entrou num grupo). */
export function notaForaDeContatos(n: number): string | null {
  if (n <= 0) return null;
  return `${contagem(n, "pessoa comprou", "pessoas compraram")} sem estar em Contatos: o telefone veio só no pedido.`;
}

export function textoDeSemCompra(semCompra: number, entraram: number): string {
  if (semCompra > 0) return "Entraram pelo anúncio. Uma oferta postada no grupo alcança quem continua lá.";
  return entraram === 0
    ? "Ninguém entrou no grupo por este anúncio ainda."
    : "Quem entrou por este anúncio já comprou.";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/anuncios-linhas.test.ts`
Expected: PASS (15 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/resultados/anuncios-linhas.ts apps/web/src/lib/resultados/anuncios-linhas.test.ts
git commit -m "feat(resultados): pure rules for the ads table, mini funnels, mobile cards and the people drawer"
```

### Task 7: Mini-funil A, funil em pé, tabela e cartões B

**Files:**
- Create: `apps/web/src/components/painel/resultados/anuncios/mini-funil.tsx`
- Create: `apps/web/src/components/painel/resultados/anuncios/tabela-de-anuncios.tsx`
- Create: `apps/web/src/components/painel/resultados/anuncios/cartoes-de-campanha.tsx`
- Test: `apps/web/src/components/painel/resultados/anuncios/por-campanha.test.ts` (criado aqui; a Task 8 acrescenta)

**Interfaces:**
- Consumes: tudo da Task 6; `TOM_DO_DEGRAU` de `./funil-grande` (PR 5b); `inteiro` de `@/lib/resultados/anuncios-tela`; `cn` de `@/lib/utils`.
- Produces:
  - `MiniFunilA({ contas }: { contas: Contas })`
  - `FunilEmPe({ modelo, rotulo, tamanho }: { modelo: FunilEmPeModelo; rotulo: string; tamanho: "cartao" | "gaveta" })`
  - `TabelaDeAnuncios({ arvore, total, onVerQuem, abertosDeInicio }: { arvore: readonly NoDaTabela[]; total: Contas; onVerQuem: (linha: LinhaRelatorio) => void; abertosDeInicio?: readonly string[] })`
  - `CartoesDeCampanha({ arvore, onVerQuem, abertosDeInicio }: { arvore: readonly NoDaTabela[]; onVerQuem: (linha: LinhaRelatorio) => void; abertosDeInicio?: readonly string[] })`

`abertosDeInicio` existe para o teste desenhar linhas abertas sem DOM (o `renderToStaticMarkup` não clica); a aba não passa.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { arvoreDasLinhas } from "@/lib/resultados/anuncios-linhas";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";
import { CartoesDeCampanha } from "./cartoes-de-campanha";
import { TabelaDeAnuncios } from "./tabela-de-anuncios";

const noop = () => {};
/** Espaço sem quebra do Intl ("R$ 1.620") vira espaço comum para o teste ler. */
const html = (el: ReactElement) => renderToStaticMarkup(el).replace(/\u00a0/g, " ");

function linha(
  nivel: LinhaRelatorio["nivel"],
  campanha: string | null,
  conjunto: string | null,
  anuncio: string | null,
  [cadastros, foram, entraram, compradores]: [number, number, number, number],
  vendido: number,
  gasto: number | null = null,
  pedidos = compradores,
): LinhaRelatorio {
  return { nivel, campanha, conjunto, anuncio, cadastros, foram, entraram, ja_membros: 0, compradores, pedidos, vendido, gasto };
}

const G = "VIP Atacado — Goiânia";
const B = "VIP Atacado — Brasil";
const S1 = "Lojistas de moda infantil · Goiânia 40 km";
const S2 = "Interesse: moda infantil atacado";
const S3 = "Brasil · lojistas 25–50";

/** O exemplo do mockup (Main.dc.html). */
const LINHAS: LinhaRelatorio[] = [
  linha("campanha", B, null, null, [196, 182, 158, 12], 5740, 980),
  linha("conjunto", B, S3, null, [196, 182, 158, 12], 5740),
  linha("anuncio", B, S3, "Kit 10 peças — carrossel", [76, 69, 59, 3], 1330),
  linha("anuncio", B, S3, "Verão Kids — vídeo 15s", [120, 113, 99, 9], 4410),
  linha("campanha", G, null, null, [371, 348, 304, 31], 14980, 1620, 39),
  linha("conjunto", G, S2, null, [143, 134, 115, 9], 4140),
  linha("anuncio", G, S2, "Preço de atacado — estático", [47, 44, 38, 2], 830),
  linha("anuncio", G, S2, "Provador ao vivo — reels", [96, 90, 77, 7], 3310),
  linha("conjunto", G, S1, null, [228, 214, 189, 22], 10840),
  linha("anuncio", G, S1, "Kit 10 peças — carrossel", [87, 81, 71, 6], 2920),
  linha("anuncio", G, S1, "Verão Kids — vídeo 15s", [141, 133, 118, 16], 7920, null, 21),
  linha("campanha", null, null, null, [14, 14, 14, 0], 0),
  linha("conjunto", null, null, null, [14, 14, 14, 0], 0),
  linha("anuncio", null, null, null, [14, 14, 14, 0], 0),
];
const TOTAL = {
  cadastros: 581,
  foram: 544,
  entraram: 476,
  ja_membros: 20,
  compradores: 43,
  pedidos: 54,
  vendido: 20720,
  gasto: 2600,
};

test("tabela fechada: só campanhas, cada uma com o botão de abrir; total no pé com o próprio mini-funil", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  const h = html(createElement(TabelaDeAnuncios, { arvore, total: TOTAL, onVerQuem: noop }));
  assert.match(h, /<table aria-label="Resultado por campanha, conjunto e anúncio"/);
  assert.match(h, /aria-expanded="false" aria-label="Abrir VIP Atacado — Goiânia"/);
  assert.match(h, /aria-expanded="false" aria-label="Abrir \(sem UTM\)"/);
  assert.doesNotMatch(h, /Verão Kids|Ver quem/);
  assert.match(h, />Total dos anúncios</);
  assert.match(h, /title="581 cadastros"/);
  assert.match(h, /Funil: 581 cadastros, 544 foram pro grupo, 476 entraram, 43 compraram\./);
  assert.match(h, />7,4%</);
  assert.match(h, />R\$ 2\.600</);
  assert.match(h, />8,0×</);
});

test("tabela aberta: conjunto e anúncio com o próprio mini-funil, 'Ver quem' só no anúncio, gasto e retorno só na campanha", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  const h = html(
    createElement(TabelaDeAnuncios, {
      arvore,
      total: TOTAL,
      onVerQuem: noop,
      abertosDeInicio: [arvore[0].chave, arvore[0].filhos[0].chave],
    }),
  );
  assert.match(h, /aria-expanded="true" aria-label="Fechar VIP Atacado — Goiânia"/);
  assert.match(h, /aria-label="Ver quem veio por Verão Kids — vídeo 15s"/);
  assert.doesNotMatch(h, /Ver quem veio por Lojistas/);
  assert.match(h, /title="141 cadastros"/);
  assert.match(h, /clip-path:polygon\(0 0%, 100% 2\.2%, 100% 97\.8%, 0 100%\)/);
  assert.match(h, /Funil: 141 cadastros, 133 foram pro grupo, 118 entraram, 16 compraram\./);
  assert.match(h, />R\$ 1\.620</);
  assert.match(h, />9,2×</);
  const conjunto = h.match(/Lojistas de moda infantil · Goiânia 40 km[\s\S]*?<\/tr>/)?.[0] ?? "";
  assert.equal((conjunto.match(/>—</g) ?? []).length, 2, "gasto e retorno do conjunto");
  assert.match(conjunto, />R\$ 10\.840</);
});

test("operador (gasto escondido): nenhum gasto nem retorno na tabela e nos cartões", () => {
  const arvore = arvoreDasLinhas(LINHAS.map((l) => ({ ...l, gasto: null })));
  const tabela = html(createElement(TabelaDeAnuncios, { arvore, total: { ...TOTAL, gasto: null }, onVerQuem: noop }));
  assert.doesNotMatch(tabela, /R\$ 1\.620|R\$ 980|R\$ 2\.600|×/);
  const cartoes = html(createElement(CartoesDeCampanha, { arvore, onVerQuem: noop }));
  assert.match(cartoes, /gasto —/);
  assert.doesNotMatch(cartoes, /×|R\$ 52,26/);
});

test("cartões B: funil em pé com bico em R$, retorno, taxa e custo por comprador, e o botão de ver conjuntos", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  const h = html(createElement(CartoesDeCampanha, { arvore, onVerQuem: noop }));
  assert.match(h, /<h2 id="cartoes-titulo"[^>]*>Por campanha<\/h2>/);
  assert.match(h, /<article aria-label="VIP Atacado — Goiânia"/);
  assert.match(h, />gasto R\$ 1\.620</);
  assert.match(h, /<ol aria-label="Funil de VIP Atacado — Goiânia"/);
  assert.match(h, /width:89\.16%;clip-path:polygon\(0 0, 100% 0, 75\.24% 100%, 24\.76% 100%\)/);
  assert.match(h, />R\$ 14\.980</);
  assert.match(h, /Retorno<\/dt><dd[^>]*>9,2×</);
  assert.match(h, /Compram<\/dt><dd[^>]*>8,4%</);
  assert.match(h, /Por comprador<\/dt><dd[^>]*>R\$ 52,26</);
  assert.match(h, /aria-expanded="false"[^>]*>Ver 2 conjuntos e 4 anúncios</);
  assert.match(h, /Chegaram sem os parâmetros do anúncio no link\./);
  assert.doesNotMatch(h, /Ver quem/);
});

test("cartão aberto: conjuntos e anúncios com resumo e 'Ver quem'", () => {
  const arvore = arvoreDasLinhas(LINHAS);
  const h = html(createElement(CartoesDeCampanha, { arvore, onVerQuem: noop, abertosDeInicio: [arvore[0].chave] }));
  assert.match(h, /aria-expanded="true"[^>]*>Fechar conjuntos</);
  assert.match(h, /<ul aria-label="Conjuntos de VIP Atacado — Goiânia"/);
  assert.match(h, />141 cadastros · 16 compraram · R\$ 7\.920</);
  assert.match(h, /aria-label="Ver quem veio por Verão Kids — vídeo 15s"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/resultados/anuncios/por-campanha.test.ts`
Expected: FAIL — `Cannot find module './cartoes-de-campanha'`.

- [ ] **Step 3: Mini-funis**

```tsx
// apps/web/src/components/painel/resultados/anuncios/mini-funil.tsx
import { miniFunilA, type Contas, type FunilEmPeModelo } from "@/lib/resultados/anuncios-linhas";
import { inteiro } from "@/lib/resultados/anuncios-tela";
import { cn } from "@/lib/utils";
import { TOM_DO_DEGRAU } from "./funil-grande";

/**
 * Mini-funil A (spec 2026-10-10-funil-anuncios §4, mockup MiniFunil): quatro
 * degraus deitados, cada um com a altura relativa aos cadastros da própria
 * linha, e a taxa de compra na ponta. O desenho é decorativo: o número de cada
 * degrau fica no `title` (passar o mouse) e o funil inteiro em texto para o
 * leitor de tela.
 */
export function MiniFunilA({ contas }: { contas: Contas }) {
  const m = miniFunilA(contas);
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex h-10 flex-none items-center gap-0.5">
        {m.segmentos.map((s, i) => (
          <span
            key={s.titulo}
            title={s.titulo}
            className={cn("block h-10 w-11", TOM_DO_DEGRAU[i])}
            style={{ clipPath: s.clip }}
          />
        ))}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-brand text-15 font-bold tabular-nums text-volt-950">{m.taxa}</span>
        <span className="text-12 text-slate-600">compram</span>
      </span>
      <span className="sr-only">{m.leitor}</span>
    </div>
  );
}

type PropsDoFunilEmPe = { modelo: FunilEmPeModelo; rotulo: string; tamanho: "cartao" | "gaveta" };

/**
 * Funil em pé pequeno, com o texto dentro do degrau: o cartão B do celular e a
 * gaveta do anúncio. Na gaveta, a passagem fica à esquerda e o bico diz
 * "Vendido"; no cartão, só o valor.
 */
export function FunilEmPe({ modelo, rotulo, tamanho }: PropsDoFunilEmPe) {
  const gaveta = tamanho === "gaveta";
  const linha = gaveta ? "grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3" : "flex";
  return (
    <ol aria-label={rotulo} className={cn("flex flex-col", gaveta ? "gap-[3px]" : "gap-0.5")}>
      {modelo.degraus.map((d, i) => (
        <li key={d.chave} className={linha}>
          {gaveta && <span className="text-right text-13 text-slate-600">{d.passagem}</span>}
          <div
            className={cn(
              "mx-auto flex items-center justify-center gap-1.5 text-center",
              gaveta ? "h-[52px]" : "h-9",
              TOM_DO_DEGRAU[i],
            )}
            style={{ width: `${d.largura}%`, clipPath: d.clip }}
          >
            <span className={cn("font-brand font-bold tabular-nums", gaveta ? "text-20" : "text-15")}>
              {inteiro(d.valor)}
            </span>
            <span className="text-13 font-semibold">{d.rotulo}</span>
          </div>
        </li>
      ))}
      <li className={linha}>
        {gaveta && <span className="text-right text-13 text-slate-600">{modelo.bico.pedidos}</span>}
        <div
          className={cn(
            "mx-auto flex flex-col items-center justify-center rounded-b-lg bg-success-700 text-paper-0",
            gaveta ? "h-[52px]" : "h-[34px]",
          )}
          style={{ width: `${modelo.bico.largura}%` }}
        >
          <span className="font-brand text-15 font-bold tabular-nums">{modelo.bico.valor}</span>
          {gaveta ? (
            <span className="text-12 font-semibold">Vendido</span>
          ) : (
            <span className="sr-only">vendido</span>
          )}
        </div>
      </li>
    </ol>
  );
}
```

- [ ] **Step 4: A tabela**

```tsx
// apps/web/src/components/painel/resultados/anuncios/tabela-de-anuncios.tsx
"use client";

import { useState } from "react";

import { colunasDaLinha, linhasVisiveis, type Contas, type NoDaTabela } from "@/lib/resultados/anuncios-linhas";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";
import { MiniFunilA } from "./mini-funil";

type Props = {
  arvore: readonly NoDaTabela[];
  total: Contas;
  onVerQuem: (linha: LinhaRelatorio) => void;
  /** Chaves abertas na primeira pintura (o teste desenha sem clicar). */
  abertosDeInicio?: readonly string[];
};

const COLUNAS_DE_NUMERO = ["Gasto", "Cadastros", "Compraram", "Vendido", "Retorno"] as const;
const NUMERO = "font-data px-3 py-3 text-right tabular-nums";
const BOTAO_PEQUENO =
  "inline-flex flex-none items-center rounded-md text-13 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/**
 * Tabela campanha › conjunto › anúncio (spec 2026-10-10-funil-anuncios §4, mockup
 * Main): abre e fecha por nível, mini-funil A em cada linha, gasto e retorno só na
 * campanha (conjunto e anúncio mostram "—"). "Ver quem" só no anúncio: abre a gaveta.
 */
export function TabelaDeAnuncios({ arvore, total, onVerQuem, abertosDeInicio = [] }: Props) {
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(abertosDeInicio));
  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  const doTotal = colunasDaLinha(total);

  return (
    <div className="overflow-x-auto">
      <table
        aria-label="Resultado por campanha, conjunto e anúncio"
        className="w-full min-w-[980px] border-collapse text-15 text-volt-950"
      >
        <thead>
          <tr className="border-y border-line-200 bg-canvas-100 text-13 text-slate-600">
            <th scope="col" className="py-2.5 pl-5 pr-3 text-left font-medium">
              Campanha › conjunto › anúncio
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Do cadastro à compra
            </th>
            {COLUNAS_DE_NUMERO.map((c) => (
              <th key={c} scope="col" className="px-3 py-2.5 text-right font-medium last:pr-5">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhasVisiveis(arvore, abertos).map(({ no, profundidade, aberto }) => {
            const col = colunasDaLinha(no.linha);
            return (
              <tr key={no.chave} className={cn("border-b border-line-200", profundidade > 0 && "bg-canvas-100/40")}>
                <th
                  scope="row"
                  className="py-1.5 pr-3 text-left font-normal"
                  style={{ paddingLeft: `${14 + profundidade * 28}px` }}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {no.filhos.length > 0 ? (
                      <button
                        type="button"
                        aria-expanded={aberto}
                        aria-label={`${aberto ? "Fechar" : "Abrir"} ${no.rotulo}`}
                        onClick={() => alternar(no.chave)}
                        className={cn(BOTAO_PEQUENO, "h-8 w-8 justify-center text-slate-600 hover:bg-canvas-100")}
                      >
                        <svg
                          aria-hidden="true"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={cn("transition-transform", aberto && "rotate-90")}
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    ) : (
                      <span aria-hidden="true" className="w-8 flex-none" />
                    )}
                    <span className="flex min-w-0 max-w-[340px] flex-col">
                      <span className="text-12 text-slate-600">{no.tipo}</span>
                      <span title={no.rotulo} className={cn("truncate", profundidade === 0 && "font-semibold")}>
                        {no.rotulo}
                      </span>
                    </span>
                    {no.linha.nivel === "anuncio" && (
                      <button
                        type="button"
                        aria-label={`Ver quem veio por ${no.rotulo}`}
                        onClick={() => onVerQuem(no.linha)}
                        className={cn(
                          BOTAO_PEQUENO,
                          "ml-auto min-h-8 border border-line-200 bg-paper-0 px-2.5 text-volt-950 hover:bg-canvas-100",
                        )}
                      >
                        Ver quem
                      </button>
                    )}
                  </div>
                </th>
                <td className="px-3 py-1.5">
                  <MiniFunilA contas={no.linha} />
                </td>
                <td className={NUMERO}>{col.gasto}</td>
                <td className={NUMERO}>{col.cadastros}</td>
                <td className={NUMERO}>{col.compraram}</td>
                <td className={cn(NUMERO, "font-medium text-success-700")}>{col.vendido}</td>
                <td className={cn(NUMERO, "pr-5 font-medium")}>{col.retorno}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <th scope="row" className="py-3.5 pl-5 pr-3 text-left">
              Total dos anúncios
            </th>
            <td className="px-3 py-1.5">
              <MiniFunilA contas={total} />
            </td>
            <td className={NUMERO}>{doTotal.gasto}</td>
            <td className={NUMERO}>{doTotal.cadastros}</td>
            <td className={NUMERO}>{doTotal.compraram}</td>
            <td className={cn(NUMERO, "text-success-700")}>{doTotal.vendido}</td>
            <td className={cn(NUMERO, "pr-5")}>{doTotal.retorno}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Os cartões B**

```tsx
// apps/web/src/components/painel/resultados/anuncios/cartoes-de-campanha.tsx
"use client";

import { useState } from "react";

import { cartaoDaCampanha, resumoDaLinha, type NoDaTabela } from "@/lib/resultados/anuncios-linhas";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";
import { FunilEmPe } from "./mini-funil";

type Props = {
  arvore: readonly NoDaTabela[];
  onVerQuem: (linha: LinhaRelatorio) => void;
  /** Campanhas abertas na primeira pintura (o teste desenha sem clicar). */
  abertosDeInicio?: readonly string[];
};

/**
 * Mini-funil B (spec 2026-10-10-funil-anuncios §4, mockup Celular): abaixo de
 * 768 px a tabela não cabe, então cada campanha vira um cartão com funil em pé,
 * bico em R$, retorno, taxa de compra e custo por comprador. "Ver N conjuntos"
 * abre a lista de conjuntos e anúncios dentro do próprio cartão.
 */
export function CartoesDeCampanha({ arvore, onVerQuem, abertosDeInicio = [] }: Props) {
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(abertosDeInicio));
  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  return (
    <section aria-labelledby="cartoes-titulo" className="flex flex-col gap-2.5">
      <h2 id="cartoes-titulo" className="font-brand text-20 font-bold text-volt-950">
        Por campanha
      </h2>
      {arvore.map((no) => {
        const c = cartaoDaCampanha(no);
        const aberto = abertos.has(no.chave);
        return (
          <article key={no.chave} aria-label={c.rotulo} className="rounded-xl border border-line-200 bg-paper-0 px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="min-w-0 text-15 font-semibold text-volt-950">{c.rotulo}</h3>
              <span className="font-data whitespace-nowrap text-13 text-slate-600">{`gasto ${c.gasto}`}</span>
            </div>
            {c.aviso && <p className="mt-1 text-13 text-slate-600">{c.aviso}</p>}
            <div className="mt-3">
              <FunilEmPe modelo={c.funil} rotulo={`Funil de ${c.rotulo}`} tamanho="cartao" />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-1 text-13">
              <div>
                <dt className="text-slate-600">Retorno</dt>
                <dd className="font-brand text-15 font-bold tabular-nums text-volt-950">{c.retorno}</dd>
              </div>
              <div>
                <dt className="text-slate-600">Compram</dt>
                <dd className="font-data text-volt-950">{c.compram}</dd>
              </div>
              <div>
                <dt className="text-slate-600">Por comprador</dt>
                <dd className="font-data text-volt-950">{c.porComprador}</dd>
              </div>
            </dl>
            {c.mais && (
              <button
                type="button"
                aria-expanded={aberto}
                onClick={() => alternar(no.chave)}
                className="mt-1 inline-flex min-h-11 items-center text-13 font-semibold text-cobalt-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
              >
                {aberto ? "Fechar conjuntos" : c.mais}
              </button>
            )}
            {aberto && (
              <ul aria-label={`Conjuntos de ${c.rotulo}`} className="mt-1 divide-y divide-line-200 border-t border-line-200">
                {no.filhos.map((conjunto) => (
                  <li key={conjunto.chave} className="py-2.5">
                    <p className="text-12 text-slate-600">{conjunto.tipo}</p>
                    <p className="text-15 font-semibold text-volt-950">{conjunto.rotulo}</p>
                    <p className="text-13 text-slate-600">{resumoDaLinha(conjunto.linha)}</p>
                    <ul className="mt-1.5 space-y-1 pl-3">
                      {conjunto.filhos.map((anuncio) => (
                        <li key={anuncio.chave} className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-15 text-volt-950">{anuncio.rotulo}</span>
                            <span className="block text-13 text-slate-600">{resumoDaLinha(anuncio.linha)}</span>
                          </span>
                          <button
                            type="button"
                            aria-label={`Ver quem veio por ${anuncio.rotulo}`}
                            onClick={() => onVerQuem(anuncio.linha)}
                            className="inline-flex min-h-11 flex-none items-center rounded-md border border-line-200 bg-paper-0 px-3 text-13 font-semibold text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
                          >
                            Ver quem
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/resultados/anuncios/por-campanha.test.ts src/lib/painel/vitrine-lint.test.ts`
Expected: PASS (5 testes; o `vitrine-lint` continua verde — ele varre `src/components/painel`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/painel/resultados/anuncios/mini-funil.tsx apps/web/src/components/painel/resultados/anuncios/tabela-de-anuncios.tsx apps/web/src/components/painel/resultados/anuncios/cartoes-de-campanha.tsx apps/web/src/components/painel/resultados/anuncios/por-campanha.test.ts
git commit -m "feat(resultados): campaign table with mini funnel A and mobile campaign cards"
```

### Task 8: Gaveta, `PorCampanha` e o encaixe na aba

**Files:**
- Create: `apps/web/src/components/painel/resultados/anuncios/gaveta-do-anuncio.tsx`
- Create: `apps/web/src/components/painel/resultados/anuncios/por-campanha.tsx`
- Modify: `apps/web/src/components/painel/resultados/anuncios/aba-anuncios.tsx` (do PR 5b: um import e uma linha dentro da função `Relatorio`)
- Test: `apps/web/src/components/painel/resultados/anuncios/por-campanha.test.ts` (imports + 5 testes no fim)

**Interfaces:**
- Consumes: Task 6 e Task 7; `Folha` de `@/components/painel/folha` (`aberta`, `aoFechar`, `titulo`, `testId`, `emQualquerLargura`); `buscar(url, valido, guardar, marcar)` de `@/lib/painel/carregar`; `Carga` de `@/lib/painel/types`; `buscaDoAnuncio`, `ehPessoasDaGaveta`, `hrefDeContatos`, `PessoasDaGaveta` (6a); `contagem`, `inteiro` (PR 5b); `Periodo` (PR 5a); `AbaAnuncios`, `PropsDaAbaAnuncios` (PR 5b).
- Produces:
  - `type PropsDoConteudo = { linha: LinhaRelatorio; periodo: Periodo; carga: Carga; pessoas: PessoasDaGaveta | null; aoTentarDeNovo: () => void }`; `ConteudoDaGaveta(props: PropsDoConteudo)`
  - `GavetaDoAnuncio({ linha, periodo, aoFechar }: { linha: LinhaRelatorio | null; periodo: Periodo; aoFechar: () => void })`
  - `PorCampanha({ relatorio }: { relatorio: RelatorioParaTela })`
  - Encaixe: `<PorCampanha relatorio={relatorio} />` entre a `<section aria-labelledby="dia-titulo">` e `<Fora fora={relatorio.fora} />`, como o plano do PR 5 reservou.

A `Folha` usa portal: o teste desenha o `ConteudoDaGaveta` direto, e a `GavetaDoAnuncio` fechada (`linha = null`) não desenha nada.

- [ ] **Step 1: Write the failing test** — em `por-campanha.test.ts`, acrescentar aos imports:

```ts
import type { PessoasDaGaveta } from "@/lib/resultados/pessoas-do-anuncio";
import { AbaAnuncios } from "./aba-anuncios";
import { ConteudoDaGaveta } from "./gaveta-do-anuncio";
```

(o import de `LinhaRelatorio` vira `import type { LinhaRelatorio, RelatorioParaTela } from "@/lib/resultados/relatorio-anuncios";`) e, ao fim do arquivo:

```ts
const PERIODO = { de: "2026-09-11", ate: "2026-10-10" };
const A1 = LINHAS[10];

const PESSOAS: PessoasDaGaveta = {
  por_origem: [
    { origem: "ig", cadastros: 90, vendido: 5000 },
    { origem: "fb", cadastros: 51, vendido: 2920 },
  ],
  compradores: [
    {
      nome: "Bia Kids Modas",
      telefone: "(62) 9••••-4821",
      grupo: "Moda Kids VIP 3",
      cadastro_em: "2026-09-14T15:00:00+00:00",
      primeira_compra: "2026-09-16T15:00:00+00:00",
      pedidos: 2,
      vendido: 1480,
      em_contatos: true,
    },
    {
      nome: null,
      telefone: "(62) 9••••-1107",
      grupo: null,
      cadastro_em: "2026-09-15T15:00:00+00:00",
      primeira_compra: "2026-09-15T18:00:00+00:00",
      pedidos: 1,
      vendido: 960,
      em_contatos: false,
    },
  ],
  contatos_dos_compradores: 1,
  sem_compra: 102,
};

function gaveta(over: Partial<Parameters<typeof ConteudoDaGaveta>[0]> = {}): string {
  return html(
    createElement(ConteudoDaGaveta, {
      linha: A1,
      periodo: PERIODO,
      carga: "ok",
      pessoas: PESSOAS,
      aoTentarDeNovo: noop,
      ...over,
    }),
  );
}

test("gaveta carregando: o funil da linha aparece na hora, as pessoas em esqueleto anunciado", () => {
  const h = gaveta({ carga: "carregando", pessoas: null });
  assert.match(h, />VIP Atacado — Goiânia › Lojistas de moda infantil · Goiânia 40 km</);
  assert.match(h, /<ol aria-label="Funil do anúncio"/);
  assert.match(h, />141<\/span><span[^>]*>cadastros</);
  assert.match(h, />94%</);
  assert.match(h, />21 pedidos</);
  assert.match(h, />R\$ 7\.920</);
  assert.match(h, /role="status" aria-label="Carregando quem veio por este anúncio"/);
  assert.doesNotMatch(h, /Quem comprou/);
});

test("gaveta com erro: alerta com Tentar de novo, nenhuma pessoa", () => {
  const h = gaveta({ carga: "erro", pessoas: null });
  assert.match(h, /role="alert"/);
  assert.match(h, /Não deu para carregar quem veio por este anúncio\./);
  assert.match(h, />Tentar de novo</);
  assert.doesNotMatch(h, /Quem comprou|Entraram e ainda não compraram/);
});

test("gaveta carregada: por onde, quem comprou com telefone mascarado e datas, links pro Contatos filtrado", () => {
  const h = gaveta();
  assert.match(h, />Por onde a pessoa viu</);
  assert.match(h, /style="width:63\.83%"/);
  assert.match(h, />Instagram 64%</);
  assert.match(h, /<h3 id="quem-comprou-titulo"[^>]*>Quem comprou<\/h3>/);
  assert.match(h, />2 pessoas</);
  assert.match(h, />Bia Kids Modas</);
  assert.match(h, />\(62\) 9••••-4821 · Moda Kids VIP 3</);
  assert.match(h, />cadastro 14\/09 · 1ª compra 16\/09 · 2 pedidos</);
  assert.match(h, />R\$ 1\.480</);
  assert.match(h, />\(62\) 9••••-1107</);
  assert.match(h, />não está em Contatos</);
  assert.match(
    h,
    /href="\/painel\/contatos\?de=2026-09-11&amp;ate=2026-10-10&amp;campanha=VIP\+Atacado\+%E2%80%94\+Goi%C3%A2nia&amp;conjunto=[^"]*&amp;anuncio=[^"]*&amp;lista=compraram"[^>]*>Ver a pessoa em Contatos</,
  );
  assert.match(h, /1 pessoa comprou sem estar em Contatos/);
  assert.match(h, /<h3 id="sem-compra-titulo"[^>]*>Entraram e ainda não compraram<\/h3>/);
  assert.match(h, />102</);
  assert.match(h, /lista=sem-compra"[^>]*>Ver em Contatos</);
});

test("gaveta sem comprador nem entrada: frases no lugar das listas, nenhum link pro Contatos", () => {
  const vazio = { ...A1, entraram: 0, compradores: 0, pedidos: 0, vendido: 0 };
  const h = gaveta({ linha: vazio, pessoas: { por_origem: [], compradores: [], contatos_dos_compradores: 0, sem_compra: 0 } });
  assert.match(h, /Ninguém comprou por este anúncio ainda\./);
  assert.match(h, /Ninguém entrou no grupo por este anúncio ainda\./);
  assert.doesNotMatch(h, /painel\/contatos|Por onde a pessoa viu/);
});

test("a aba encaixa a tabela e os cartões entre o gráfico por dia e 'fora dos anúncios'; sem linhas, nada", () => {
  const relatorio: RelatorioParaTela = {
    periodo: PERIODO,
    total: TOTAL,
    linhas: LINHAS,
    por_origem: [],
    por_dia: [{ dia: "2026-10-10", cadastros: 1, entraram: 1 }],
    fora: { entradas_sem_cadastro: 0, pedidos_sem_origem: 0, vendido_sem_origem: 0 },
  };
  const props = {
    atalho: "30d" as const,
    onAtalho: noop,
    carga: "ok" as const,
    hoje: "2026-10-10",
    aoTentarDeNovo: noop,
  };
  const h = html(createElement(AbaAnuncios, { ...props, resposta: { relatorio, tem_cadastro: true } }));
  const dia = h.indexOf("Cadastros e entradas por dia");
  const tabela = h.indexOf("Por campanha, conjunto e anúncio");
  const cartoes = h.indexOf('id="cartoes-titulo"');
  const fora = h.indexOf("No mesmo período, fora dos anúncios");
  assert.ok(dia > -1 && dia < tabela && tabela < cartoes && cartoes < fora, `${dia} ${tabela} ${cartoes} ${fora}`);
  assert.match(h, /<section aria-labelledby="tabela-titulo" class="hidden [^"]*md:block/);
  assert.match(h, /<div class="md:hidden"><section aria-labelledby="cartoes-titulo"/);

  const semLinhas = html(
    createElement(AbaAnuncios, { ...props, resposta: { relatorio: { ...relatorio, linhas: [] }, tem_cadastro: true } }),
  );
  assert.doesNotMatch(semLinhas, /Por campanha/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/resultados/anuncios/por-campanha.test.ts`
Expected: FAIL — `Cannot find module './gaveta-do-anuncio'`.

- [ ] **Step 3: A gaveta**

```tsx
// apps/web/src/components/painel/resultados/anuncios/gaveta-do-anuncio.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Folha } from "@/components/painel/folha";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import {
  caminhoDaLinha,
  chaveDaLinha,
  fatiasDeOrigem,
  FUNIL_GAVETA,
  funilEmPe,
  linhaDoComprador,
  notaForaDeContatos,
  rotuloDaLinha,
  textoDeSemCompra,
  verEmContatos,
  type FatiaDeOrigem,
} from "@/lib/resultados/anuncios-linhas";
import { contagem, inteiro } from "@/lib/resultados/anuncios-tela";
import type { Periodo } from "@/lib/resultados/periodo-anuncios";
import {
  buscaDoAnuncio,
  ehPessoasDaGaveta,
  hrefDeContatos,
  type PessoasDaGaveta,
} from "@/lib/resultados/pessoas-do-anuncio";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";
import { FunilEmPe } from "./mini-funil";

const TOM_DA_ORIGEM: Record<FatiaDeOrigem["nome"], string> = {
  Instagram: "bg-cobalt-500",
  Facebook: "bg-cobalt-500/50",
  Outros: "bg-slate-600/40",
};
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const LINK = cn("inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500 hover:underline", FOCO);
const BOTAO = cn(
  "inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-3.5 text-15 font-semibold text-volt-950 hover:bg-canvas-100",
  FOCO,
);
const BOTAO_PRIMARIO = cn(
  "inline-flex min-h-11 items-center rounded-lg bg-cobalt-500 px-3.5 text-15 font-semibold text-paper-0 hover:bg-cobalt-500/90",
  FOCO,
);

export type PropsDoConteudo = {
  linha: LinhaRelatorio;
  periodo: Periodo;
  carga: Carga;
  pessoas: PessoasDaGaveta | null;
  aoTentarDeNovo: () => void;
};

/**
 * O corpo da gaveta "Ver quem" (spec 2026-10-10-funil-anuncios §4, mockup
 * Anuncio). O funil sai da linha do relatório e aparece na hora; as pessoas
 * chegam pela rota. Só desenha: quem busca é a `GavetaDoAnuncio`.
 */
export function ConteudoDaGaveta({ linha, periodo, carga, pessoas, aoTentarDeNovo }: PropsDoConteudo) {
  return (
    <div className="flex flex-col gap-5 pb-2">
      <p className="text-13 text-slate-600">{caminhoDaLinha(linha)}</p>
      <FunilEmPe modelo={funilEmPe(linha, FUNIL_GAVETA)} rotulo="Funil do anúncio" tamanho="gaveta" />
      {carga === "erro" ? (
        <div role="alert" className="rounded-lg border border-line-200 px-4 py-3.5">
          <p className="text-15 text-volt-950">Não deu para carregar quem veio por este anúncio.</p>
          <button type="button" onClick={aoTentarDeNovo} className={cn(BOTAO, "mt-3")}>
            Tentar de novo
          </button>
        </div>
      ) : carga === "carregando" || pessoas === null ? (
        <div role="status" aria-label="Carregando quem veio por este anúncio" className="space-y-2">
          <div className="pn-skeleton h-3 rounded-full" />
          <div className="pn-skeleton h-14 rounded-lg" />
          <div className="pn-skeleton h-14 rounded-lg" />
        </div>
      ) : (
        <Pessoas linha={linha} periodo={periodo} pessoas={pessoas} />
      )}
      <p className="text-13 text-slate-600">
        Origem casada pelo telefone do cadastro. O nome vem do WhatsApp de quem entrou.
      </p>
    </div>
  );
}

function Pessoas({ linha, periodo, pessoas }: { linha: LinhaRelatorio; periodo: Periodo; pessoas: PessoasDaGaveta }) {
  const chave = chaveDaLinha(linha);
  const fatias = fatiasDeOrigem(pessoas.por_origem);
  // N de "Ver os N em Contatos" = contatos distintos (`paraAGaveta` deduplica): bate com a lista do Contatos.
  const emContatos = pessoas.contatos_dos_compradores;
  const nota = notaForaDeContatos(pessoas.compradores.filter((c) => !c.em_contatos).length);

  return (
    <>
      {fatias.length > 0 && (
        <div>
          <p className="mb-2 text-13 text-slate-600">Por onde a pessoa viu</p>
          <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full bg-canvas-100">
            {fatias.map((f) => (
              <span key={f.nome} className={cn("block", TOM_DA_ORIGEM[f.nome])} style={{ width: `${f.largura}%` }} />
            ))}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 text-13 text-slate-600">
            {fatias.map((f) => (
              <li key={f.nome}>{f.texto}</li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="quem-comprou-titulo">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="quem-comprou-titulo" className="font-brand text-15 font-semibold text-volt-950">
            Quem comprou
          </h3>
          <span className="text-13 text-slate-600">{contagem(pessoas.compradores.length, "pessoa", "pessoas")}</span>
        </div>
        {pessoas.compradores.length === 0 ? (
          <p className="mt-2 text-15 text-slate-600">Ninguém comprou por este anúncio ainda.</p>
        ) : (
          <ul className="mt-2.5 border-t border-line-200">
            {pessoas.compradores.map((c, i) => {
              const l = linhaDoComprador(c);
              return (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line-200 py-3">
                  <span className="text-15 font-semibold text-volt-950">{l.titulo}</span>
                  <span className="font-data text-right text-15 font-medium text-success-700">{l.total}</span>
                  <span className="text-13 text-slate-600">{l.detalhe}</span>
                  <span className="text-right text-13 text-slate-600">{l.quando}</span>
                </li>
              );
            })}
          </ul>
        )}
        {emContatos > 0 && (
          <Link href={hrefDeContatos(periodo, chave, "compraram")} className={cn(LINK, "mt-1")}>
            {verEmContatos(emContatos)}
          </Link>
        )}
        {nota && <p className="mt-1 text-13 text-slate-600">{nota}</p>}
      </section>

      <section aria-labelledby="sem-compra-titulo" className="rounded-lg bg-canvas-100 px-4 py-3.5">
        <h3 id="sem-compra-titulo" className="font-brand text-15 font-semibold text-volt-950">
          Entraram e ainda não compraram
        </h3>
        <p className="font-brand my-1 text-28 font-bold tabular-nums text-volt-950">{inteiro(pessoas.sem_compra)}</p>
        <p className="text-13 text-slate-600">{textoDeSemCompra(pessoas.sem_compra, linha.entraram)}</p>
        {pessoas.sem_compra > 0 && (
          <Link href={hrefDeContatos(periodo, chave, "sem-compra")} className={cn(BOTAO_PRIMARIO, "mt-2.5")}>
            Ver em Contatos
          </Link>
        )}
      </section>
    </>
  );
}

type Props = { linha: LinhaRelatorio | null; periodo: Periodo; aoFechar: () => void };

/**
 * A gaveta "Ver quem": busca `GET /api/resultados/anuncios/pessoas` (telefone já
 * mascarado pelo servidor) e mostra na `Folha` do painel — diálogo central no
 * computador, folha de baixo no celular. Quem abre dá `key` por anúncio: trocar
 * de anúncio remonta a gaveta, e nada da busca anterior aparece nem escreve.
 */
export function GavetaDoAnuncio({ linha, periodo, aoFechar }: Props) {
  const [pessoas, setPessoas] = useState<PessoasDaGaveta | null>(null);
  const [carga, setCarga] = useState<Carga>("carregando");

  // Depende das datas, não da identidade do objeto `periodo`: o mesmo período num
  // objeto novo não dispara outra busca.
  const { de, ate } = periodo;
  const carregar = useCallback(() => {
    if (!linha) return;
    void buscar(
      `/api/resultados/anuncios/pessoas?${buscaDoAnuncio({ de, ate }, chaveDaLinha(linha))}`,
      ehPessoasDaGaveta,
      setPessoas,
      setCarga,
    );
  }, [linha, de, ate]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!linha) return null;
  return (
    <Folha aberta aoFechar={aoFechar} titulo={rotuloDaLinha(linha)} testId="gaveta-do-anuncio" emQualquerLargura>
      <ConteudoDaGaveta linha={linha} periodo={periodo} carga={carga} pessoas={pessoas} aoTentarDeNovo={carregar} />
    </Folha>
  );
}
```

- [ ] **Step 4: `PorCampanha`**

```tsx
// apps/web/src/components/painel/resultados/anuncios/por-campanha.tsx
"use client";

import { useCallback, useMemo, useState } from "react";

import { arvoreDasLinhas, chaveDaLinha } from "@/lib/resultados/anuncios-linhas";
import type { LinhaRelatorio, RelatorioParaTela } from "@/lib/resultados/relatorio-anuncios";
import { CartoesDeCampanha } from "./cartoes-de-campanha";
import { GavetaDoAnuncio } from "./gaveta-do-anuncio";
import { TabelaDeAnuncios } from "./tabela-de-anuncios";

/**
 * Campanha › conjunto › anúncio na aba Anúncios (spec 2026-10-10-funil-anuncios
 * §4): a tabela no computador, os cartões B abaixo de 768 px e uma gaveta só,
 * aberta por "Ver quem" de qualquer um dos dois.
 */
export function PorCampanha({ relatorio }: { relatorio: RelatorioParaTela }) {
  // A gaveta fica presa ao relatório em que foi aberta: relatório novo (outro
  // período, gasto relançado pelo PR 7) fecha a gaveta em vez de mostrar a linha
  // velha com números que a tabela já não tem. Estado derivado, sem efeito.
  const [aberto, setAberto] = useState<{ linha: LinhaRelatorio; relatorio: RelatorioParaTela } | null>(null);
  const anuncio = aberto?.relatorio === relatorio ? aberto.linha : null;
  const verQuem = useCallback((linha: LinhaRelatorio) => setAberto({ linha, relatorio }), [relatorio]);
  const fechar = useCallback(() => setAberto(null), []);
  const arvore = useMemo(() => arvoreDasLinhas(relatorio.linhas), [relatorio.linhas]);

  if (arvore.length === 0) return null;

  return (
    <>
      <section aria-labelledby="tabela-titulo" className="hidden rounded-xl border border-line-200 bg-paper-0 pb-2 pt-5 md:block">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3.5">
          <h2 id="tabela-titulo" className="font-brand text-20 font-bold text-volt-950">
            Por campanha, conjunto e anúncio
          </h2>
          <span className="text-13 text-slate-600">Gasto é por campanha. Conjunto e anúncio mostram o que trouxeram.</span>
        </div>
        <TabelaDeAnuncios arvore={arvore} total={relatorio.total} onVerQuem={verQuem} />
      </section>
      <div className="md:hidden">
        <CartoesDeCampanha arvore={arvore} onVerQuem={verQuem} />
      </div>
      <GavetaDoAnuncio
        key={anuncio ? JSON.stringify(chaveDaLinha(anuncio)) : "fechada"}
        linha={anuncio}
        periodo={relatorio.periodo}
        aoFechar={fechar}
      />
    </>
  );
}
```

- [ ] **Step 5: O encaixe na aba** — em `aba-anuncios.tsx` (PR 5b), acrescentar o import depois de `import { GraficoPorDia } from "./grafico-por-dia";`:

```tsx
import { PorCampanha } from "./por-campanha";
```

e, na função `Relatorio`, entre o `</section>` que fecha `<section aria-labelledby="dia-titulo" …>` e `<Fora fora={relatorio.fora} />`:

```tsx
      <PorCampanha relatorio={relatorio} />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/resultados/anuncios/por-campanha.test.ts src/components/painel/resultados/anuncios/aba-anuncios.test.ts src/lib/painel/vitrine-lint.test.ts`
Expected: PASS (10 de `por-campanha`; os 10 da aba continuam verdes — nos fixtures deles `linhas` é `[]`, então nada muda; `vitrine-lint` verde).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/painel/resultados/anuncios/gaveta-do-anuncio.tsx apps/web/src/components/painel/resultados/anuncios/por-campanha.tsx apps/web/src/components/painel/resultados/anuncios/aba-anuncios.tsx apps/web/src/components/painel/resultados/anuncios/por-campanha.test.ts
git commit -m "feat(resultados): ad people drawer and the campaign table slot in the ads tab"
```

### Task 9: Gate, PR 6b, prova em prod, card e grafo

**Files:** nenhum novo.

**Interfaces:**
- Consumes: tudo acima.
- Produces: nada.

- [ ] **Step 1: Gate local** (em `apps/web`)

Run: `npm run lint` · `npx tsc --noEmit --project tsconfig.json` · `npx tsc --noEmit --project tsconfig.e2e.json` · `npm test`
Expected: tudo verde.

Depois, em PowerShell:

```
Set-Location <caminho do worktree pr6b>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 2: Ver a tela** — `npm run dev` neste worktree (dev local usa Supabase: `HUBFLOW_USE_SUPABASE=1`). A loja de QA não tem cadastro com origem, então a aba mostra a tela Vazio e a tabela não aparece — o desenho da tabela, dos cartões e da gaveta é conferido pelos testes das Tasks 7 e 8 e pela prova em prod (Step 4). Aqui confira só que a aba abre sem erro no console e que a Visão geral continua igual. O `preview_start` serve o checkout principal, não o worktree: para captura, use o Playwright do repo.

- [ ] **Step 3: PR** — push e PR "feat(resultados): tabela por campanha, gaveta do anúncio e cartões no celular (funil de anúncios, PR 6b)", com a lista de decisões deste plano que tocam a tela (gaveta = `Folha`, "(sem UTM)" abre, comprador fora de Contatos, ordem por vendido), terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. CI verde → mergear → apagar a branch.

- [ ] **Step 4: Prova em prod depois do deploy** — dono da loja-piloto em `/painel/resultados/anuncios`, com cadastros do site já chegando:
  - em 1280 px: a tabela abre campanha › conjunto › anúncio; o mini-funil de cada linha mostra o número de cada degrau ao passar o mouse; gasto e retorno só na campanha;
  - "Ver quem" num anúncio com comprador: a quantidade de "Quem comprou" é igual à coluna "Compraram" da linha, e a soma dos totais é igual a "Vendido"; todo telefone sai `(DD) 9••••-NNNN` (DevTools › Rede: a resposta de `/api/resultados/anuncios/pessoas` não tem número inteiro);
  - "Ver os N em Contatos" abre o Contatos com N pessoas e a faixa do anúncio; "Ver em Contatos" de "Entraram e ainda não compraram" abre com a contagem da gaveta (com o 6c no ar; sem ele, o link abre a lista inteira);
  - em 390 px: um cartão por campanha com funil em pé e bico em R$; "Ver N conjuntos e M anúncios" abre a lista com "Ver quem", e a gaveta sobe como folha de baixo;
  - um operador da loja, se houver: tabela e cartões com "—" em gasto, retorno e por comprador.

- [ ] **Step 5: Card** (prod): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 6b: tabela com mini-funil A, gaveta Ver quem e cartões B no ar; gasto no PR 7', 'PR #<n>');`

- [ ] **Step 6: Registrar a decisão no grafo** — no PowerShell do checkout principal, com o venv do LightRAG ativo:

```powershell
rag insert "decisão: a gaveta 'Ver quem' da aba Anúncios lê public.attribution_people (cópia dos CTEs de attribution_report filtrada por um anúncio, só service_role, telefone mascarado na rota), não TypeScript; 'entraram e ainda não compraram' é quem não tem nenhum pedido da chave depois da entrada (lista de remarketing); o Contatos filtra por ?campanha&conjunto&anuncio&lista=compraram|sem-compra chamando a mesma rota, que lê os leads por id em lotes de 100 (o /api/leads para nas 1000 mais recentes)" --source decisao-2026-10-11
```

---

# PR 6c — Contatos filtrado pelo anúncio

Depende só do 6a (`filtroDaUrl`, `SEM_ANUNCIO`, a rota com `lista=`). Recomendado mergear **antes** do 6b, para os links "Ver em Contatos" da gaveta já chegarem filtrando. Em PowerShell no checkout principal:

```powershell
git fetch origin main
git worktree add -b feat/funil-anuncios-pr6c-contatos ..\pr6c origin/main
```

Comandos abaixo rodam em `apps/web` do worktree novo.

### Task 10: Faixa do filtro e o Contatos que lê o anúncio na URL

**Files:**
- Create: `apps/web/src/components/painel/contatos/faixa-do-filtro.tsx`
- Test: `apps/web/src/components/painel/contatos/faixa-do-filtro.test.ts`
- Modify: `apps/web/src/app/painel/contatos/page.tsx` (arquivo inteiro abaixo)

**Interfaces:**
- Consumes: `filtroDaUrl(search)`, `FiltroDoAnuncio`, `ChaveDoAnuncio`, `ListaDePessoas`, `SEM_ANUNCIO`, `ehContatosDoAnuncio` (6a); `buscar` de `@/lib/painel/carregar`; `Carga`, `Lead` de `@/lib/painel/types`; `ContatosVitrine` (sem mudança); `GET /api/resultados/anuncios/pessoas?…&lista=` (6a).
- Produces:
  - `tituloDoFiltro(chave: ChaveDoAnuncio, lista: ListaDePessoas): string`
  - `textoDoFiltroVazio(lista: ListaDePessoas): string`
  - `FaixaDoFiltro({ titulo, carga, vazio, aoTentarDeNovo, aoVerTodos }: { titulo: string; carga: Carga; vazio: string | null; aoTentarDeNovo: () => void; aoVerTodos: () => void })`
  - `/painel/contatos?de&ate&campanha&conjunto&anuncio&lista=compraram|sem-compra` mostra só quem veio pelo anúncio, com a faixa no topo; "Ver todos os contatos" volta à lista inteira. Sem `lista` válida na URL, a página é a de hoje.

Três cuidados da página:
- **Lê a URL no `useEffect`** (`window.location.search` → `filtroDaUrl`), não com `useSearchParams`: sem fronteira de `Suspense`, `useSearchParams` derruba o pré-render (mesmo padrão de `campanhas/[slug]/page.tsx`).
- **Só a última resposta escreve**: um contador `useRef` compartilhado por `carregarTodos` e `carregarFiltro`. Sem ele, clicar "Ver todos" com o filtro ainda carregando deixa a resposta atrasada do filtro pintar por cima da lista inteira (e vice-versa).
- **Lista vazia com filtro** não chega à `ContatosVitrine`, cujo vazio diz "A lista enche sozinha quando alguém entra num grupo seu" — falso aqui. A faixa mostra o vazio do filtro.

"Ver todos" é botão, não `<a>`: a regra `no-html-link-for-pages` do lint reprova `<a>` para página interna, e um `Link` para a mesma rota não remonta a página.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FaixaDoFiltro, textoDoFiltroVazio, tituloDoFiltro } from "./faixa-do-filtro";

const noop = () => {};
const faixa = (over: Partial<Parameters<typeof FaixaDoFiltro>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(FaixaDoFiltro, {
      titulo: "Quem comprou pelo anúncio “A1”",
      carga: "ok",
      vazio: null,
      aoTentarDeNovo: noop,
      aoVerTodos: noop,
      ...over,
    }),
  );

test("título do filtro pelo anúncio; nulo vira '(sem anúncio)'", () => {
  assert.equal(
    tituloDoFiltro({ campanha: "C", conjunto: "S", anuncio: "Verão Kids — vídeo 15s" }, "compraram"),
    "Quem comprou pelo anúncio “Verão Kids — vídeo 15s”",
  );
  assert.equal(
    tituloDoFiltro({ campanha: null, conjunto: null, anuncio: null }, "sem-compra"),
    "Quem entrou pelo anúncio “(sem anúncio)” e ainda não comprou",
  );
});

test("vazio do filtro diz por que está vazio, nunca o vazio da lista inteira", () => {
  assert.equal(
    textoDoFiltroVazio("compraram"),
    "Ninguém que comprou por este anúncio está em Contatos: o telefone veio só no pedido.",
  );
  assert.equal(textoDoFiltroVazio("sem-compra"), "Ninguém nesta lista: quem entrou por este anúncio já comprou.");
});

test("faixa carregada: título anunciado e o botão de voltar à lista inteira", () => {
  const h = faixa();
  assert.match(h, /role="status"/);
  assert.match(h, /Quem comprou pelo anúncio “A1”/);
  assert.match(h, /<button type="button"[^>]*>Ver todos os contatos<\/button>/);
  assert.doesNotMatch(h, /Tentar de novo|A lista enche sozinha/);
});

test("faixa vazia: título e o vazio do filtro", () => {
  const h = faixa({ vazio: textoDoFiltroVazio("sem-compra") });
  assert.match(h, /Quem comprou pelo anúncio “A1”/);
  assert.match(h, /Ninguém nesta lista: quem entrou por este anúncio já comprou\./);
});

test("faixa com erro: alerta, Tentar de novo e Ver todos; o título não aparece como se tivesse carregado", () => {
  const h = faixa({ carga: "erro" });
  assert.match(h, /role="alert"/);
  assert.match(h, /Não deu para carregar quem veio por este anúncio\./);
  assert.match(h, />Tentar de novo</);
  assert.match(h, />Ver todos os contatos</);
  assert.doesNotMatch(h, /Quem comprou pelo anúncio/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/contatos/faixa-do-filtro.test.ts`
Expected: FAIL — `Cannot find module './faixa-do-filtro'`.

- [ ] **Step 3: A faixa**

```tsx
// apps/web/src/components/painel/contatos/faixa-do-filtro.tsx
import type { Carga } from "@/lib/painel/types";
import { SEM_ANUNCIO, type ChaveDoAnuncio, type ListaDePessoas } from "@/lib/resultados/pessoas-do-anuncio";

const BOTAO =
  "inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-3.5 text-15 font-semibold text-volt-950 hover:bg-canvas-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

export function tituloDoFiltro(chave: ChaveDoAnuncio, lista: ListaDePessoas): string {
  const anuncio = chave.anuncio ?? SEM_ANUNCIO;
  return lista === "compraram"
    ? `Quem comprou pelo anúncio “${anuncio}”`
    : `Quem entrou pelo anúncio “${anuncio}” e ainda não comprou`;
}

/** O vazio do filtro: a lista inteira tem gente, este recorte é que não tem. */
export function textoDoFiltroVazio(lista: ListaDePessoas): string {
  return lista === "compraram"
    ? "Ninguém que comprou por este anúncio está em Contatos: o telefone veio só no pedido."
    : "Ninguém nesta lista: quem entrou por este anúncio já comprou.";
}

type Props = {
  titulo: string;
  carga: Carga;
  /** Texto do vazio do filtro (lista carregada e sem ninguém); `null` com gente na lista. */
  vazio: string | null;
  aoTentarDeNovo: () => void;
  aoVerTodos: () => void;
};

/**
 * A faixa do Contatos filtrado pela gaveta "Ver quem" (Resultados › Anúncios):
 * diz de qual anúncio é o recorte e volta à lista inteira. Erro nunca vira lista
 * vazia (padrão `carga` da Vitrine).
 */
export function FaixaDoFiltro({ titulo, carga, vazio, aoTentarDeNovo, aoVerTodos }: Props) {
  const erro = carga === "erro";
  return (
    <div className="px-4 pt-5 lg:px-8">
      <div
        role={erro ? "alert" : "status"}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-200 bg-paper-0 px-4 py-3"
      >
        <div>
          <p className="text-15 text-volt-950">{erro ? "Não deu para carregar quem veio por este anúncio." : titulo}</p>
          {!erro && vazio && <p className="mt-1 text-13 text-slate-600">{vazio}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {erro && (
            <button type="button" onClick={aoTentarDeNovo} className={BOTAO}>
              Tentar de novo
            </button>
          )}
          <button type="button" onClick={aoVerTodos} className={BOTAO}>
            Ver todos os contatos
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/contatos/faixa-do-filtro.test.ts src/lib/painel/vitrine-lint.test.ts`
Expected: PASS (5 testes; `vitrine-lint` verde).

- [ ] **Step 5: A página**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FaixaDoFiltro, textoDoFiltroVazio, tituloDoFiltro } from "@/components/painel/contatos/faixa-do-filtro";
import { ContatosVitrine } from "@/components/painel/contatos/vitrine/contatos-vitrine";
import { buscar } from "@/lib/painel/carregar";
import type { Carga, Lead } from "@/lib/painel/types";
import type { MonthlyOrder } from "@/lib/painel-metrics";
import { ehContatosDoAnuncio, filtroDaUrl, type FiltroDoAnuncio } from "@/lib/resultados/pessoas-do-anuncio";

export default function PainelContatos() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<MonthlyOrder[]>([]);
  const [meta, setMeta] = useState<number | null>(null);
  // Sem isto, "R$ 0,00" por falha de rede fica igual a mês sem venda nenhuma.
  const [caixaOk, setCaixaOk] = useState(true);
  const [caixaCarregando, setCaixaCarregando] = useState(true);
  // Vindo da gaveta "Ver quem" (Resultados › Anúncios): só quem veio por um anúncio.
  const [filtro, setFiltro] = useState<FiltroDoAnuncio | null>(null);
  const [cargaDoFiltro, setCargaDoFiltro] = useState<Carga>("carregando");
  // "Ver todos" com o filtro ainda carregando dispara duas buscas: só a última escreve.
  const ultima = useRef(0);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch("/api/orders").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      fetch("/api/settings").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
    ])
      .then(([o, s]) => {
        if (!vivo) return;
        setPedidos(Array.isArray(o) ? o : []);
        setMeta(typeof s?.monthlyGoalRevenue === "number" ? s.monthlyGoalRevenue : null);
      })
      .catch(() => {
        if (vivo) setCaixaOk(false);
      })
      .finally(() => {
        if (vivo) setCaixaCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const carregarTodos = useCallback(() => {
    const esta = ++ultima.current;
    setLoading(true);
    fetch("/api/leads")
      .then((r) => r.json())
      .then((l) => {
        if (esta === ultima.current) setLeads(Array.isArray(l) ? l : []);
      })
      .catch(() => {})
      .finally(() => {
        if (esta === ultima.current) setLoading(false);
      });
  }, []);

  // Contatos do anúncio vêm da rota da gaveta (por id, em lotes): o `/api/leads`
  // para nas 1000 entradas mais recentes e quem já era do grupo ficaria de fora.
  const carregarFiltro = useCallback((f: FiltroDoAnuncio) => {
    const esta = ++ultima.current;
    void buscar(
      `/api/resultados/anuncios/pessoas?${f.busca}`,
      ehContatosDoAnuncio,
      (r) => {
        if (esta === ultima.current) setLeads(r.contatos);
      },
      (c) => {
        if (esta !== ultima.current) return;
        setCargaDoFiltro(c);
        setLoading(c === "carregando");
      },
    );
  }, []);

  useEffect(() => {
    const f = filtroDaUrl(window.location.search);
    setFiltro(f);
    if (f) carregarFiltro(f);
    else carregarTodos();
  }, [carregarFiltro, carregarTodos]);

  const verTodos = () => {
    window.history.replaceState(null, "", "/painel/contatos");
    setFiltro(null);
    carregarTodos();
  };

  const filtroVazio = filtro !== null && cargaDoFiltro === "ok" && leads.length === 0;

  return (
    <>
      {filtro && (
        <FaixaDoFiltro
          titulo={tituloDoFiltro(filtro.chave, filtro.lista)}
          carga={cargaDoFiltro}
          vazio={filtroVazio ? textoDoFiltroVazio(filtro.lista) : null}
          aoTentarDeNovo={() => carregarFiltro(filtro)}
          aoVerTodos={verTodos}
        />
      )}
      {/* Com filtro, erro e vazio ficam só na faixa: o vazio da Vitrine fala da loja inteira. */}
      {filtro && (cargaDoFiltro === "erro" || filtroVazio) ? null : (
        <ContatosVitrine
          contatos={leads}
          pedidos={pedidos}
          meta={meta}
          carregando={loading || caixaCarregando}
          caixaOk={caixaOk}
          onPedidoRegistrado={(leadId, valor) => {
            // Soma no total na hora: o caixa do rodapé sobe sem esperar o refetch.
            setPedidos((p) => [...p, { value: valor, created_at: new Date().toISOString() }]);
            // O servidor promove o lead a cliente; sem isto o chip ficava em "NOVO"
            // e os contadores de filtro não subiam até um reload.
            setLeads((l) => l.map((x) => (x.id === leadId ? { ...x, status: "comprou" } : x)));
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 6: Gate local** (em `apps/web`)

Run: `npm run lint` · `npx tsc --noEmit --project tsconfig.json` · `npx tsc --noEmit --project tsconfig.e2e.json` · `npm test`
Expected: tudo verde.

Depois, em PowerShell:

```
Set-Location <caminho do worktree pr6c>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 7: Ver a tela** — `npm run dev` neste worktree (`HUBFLOW_USE_SUPABASE=1`), dono da loja de QA:
  - `/painel/contatos?de=2026-09-11&ate=2026-10-10&anuncio=nada&lista=compraram` → faixa "Quem comprou pelo anúncio “nada”" com o vazio do filtro, e **nenhum** "A lista enche sozinha";
  - "Ver todos os contatos" → a lista inteira e a URL fica `/painel/contatos`;
  - `/painel/contatos` sem busca está igual a antes; `?lista=todos` também (lista inválida não é filtro).

O `preview_start` serve o checkout principal, não o worktree: para captura, use o Playwright do repo.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/painel/contatos/faixa-do-filtro.tsx apps/web/src/components/painel/contatos/faixa-do-filtro.test.ts apps/web/src/app/painel/contatos/page.tsx
git commit -m "feat(contatos): filter by ad from the people drawer (?lista=compraram|sem-compra)"
```

- [ ] **Step 9: PR** — push e PR "feat(contatos): Contatos filtrado pelo anúncio (funil de anúncios, PR 6c)", terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. CI verde → mergear → apagar a branch.

- [ ] **Step 10: Prova em prod** — depois do deploy (e do 6b, se ele já estiver no ar), dono da loja-piloto: "Ver os N em Contatos" na gaveta abre o Contatos com N pessoas e a faixa do anúncio; "Ver em Contatos" de "Entraram e ainda não compraram" abre com a contagem da gaveta. Sem o 6b no ar, a mesma prova pela URL montada no console com `hrefDeContatos` e um anúncio do `fetch` da Task 5.

- [ ] **Step 11: Card** (prod): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 6c: Contatos filtrado pelo anúncio (compraram / sem compra)', 'PR #<n>');`

---

## Interfaces para o PR 7 (gasto)

- O PR 6 só toca `aba-anuncios.tsx` dentro da função `Relatorio` (um import e `<PorCampanha relatorio={relatorio} />` antes de `<Fora …/>`). Não mexe em `PropsDaAbaAnuncios`, em `page.tsx` nem nos encaixes `acoesDoCabecalho` / `rodapeDoGasto` / `iniciosDeGasto`. Se o PR 7 entrar antes, nada muda aqui; se entrar depois, idem.
- A tabela e os cartões leem o gasto de `relatorio.linhas[].gasto` (nível campanha). Depois de o PR 7 salvar, editar ou excluir um lançamento e chamar o `carregar()` da página, a aba remonta o `Relatorio` com o relatório novo e o gasto proporcional da tabela acompanha sozinho — o PR 7 não precisa avisar o PR 6.
- A campanha que só tem gasto (`cadastros = 0`, só para quem tem `ads:manage`) já aparece na tabela e no cartão, sem filhos e com mini-funil no piso.
