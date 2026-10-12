# Funil de anúncios — PR 5: aba Anúncios no Resultados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O lojista abre Resultados › Anúncios e vê, para o período escolhido, quanto lançou de gasto, quanto vendeu pra quem veio dos anúncios e o retorno; o funil em degraus do cadastro à compra; cadastros × entradas por dia; por onde chegaram; o que ficou fora dos anúncios; e como cada número é contado — ou a tela Vazio, se a loja ainda não recebeu nenhum cadastro.

**Architecture:** Dois PRs. **5a (dados):** `GET /api/resultados/anuncios` valida o período, chama `attribution_report` pelo service-role com o tenant da sessão, passa o JSON pelo contrato zod (afrouxado para `vendido` negativo), tira todo gasto do relatório de quem não tem a ação nova `ads:manage` (`semGasto`, função pura) e diz se a loja já teve algum cadastro. **5b (tela):** a página cliente busca a rota pelo padrão `carga` da Vitrine e entrega a resposta a componentes que só desenham; tudo que a tela escreve ou mede (formatos, passagens, custos, geometria do funil, eixo do gráfico, marcas) sai de funções puras testadas. Nenhuma DDL.

**Tech Stack:** Next 15 App Router (route handler + página cliente), Supabase service-role (`rpc`), zod 4, Tailwind 4 (tema G2), `node:test` + `react-dom/server` (`renderToStaticMarkup`), Playwright (smoke do CI).

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md` (§1 regras, §3 "GET /api/resultados/anuncios", §4 telas, §6 bordas, §7 segurança, §8 testes). Mockups: Main, Celular, Vazio, Regras (`scratchpad/mockup/project/*.dc.html`, só referência visual).

**Depende de:** PR 1 (`attribution_report` nos dois bancos, `lerRelatorioAnuncios`). Não depende de 2, 3 e 4 (a aba lê o que existir). Índice: `docs/superpowers/plans/2026-10-10-funil-anuncios-00-indice.md`.

## Divisão em dois PRs

A aba inteira são 22 arquivos (10 de dados, 12 de tela). Passa dos ~10 da regra de PR, então:

| PR | Branch | Tasks | Arquivos |
|---|---|---|---|
| **5a** — rota | `feat/funil-anuncios-pr5a-rota` (de `origin/main`) | 1–4 | 10 |
| **5b** — aba | `feat/funil-anuncios-pr5b-aba` (de `origin/main` **depois** do 5a mergeado) | 5–7 | 12 |

O 5a sozinho não muda nada visível (a rota só é chamada pela aba). O 5b importa `periodo-anuncios.ts` e o tipo `RespostaAnuncios` do 5a.

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| **`vendido` aceita negativo no parser** (`z.number()`, ainda recusa NaN/Infinity/texto); `gasto` continua `nonnegative` | Um pedido de estorno lançado como valor negativo por outro caminho derrubava a aba inteira (500). Mudar o SQL exigiria DDL. `ad_spend` tem `check amount > 0`, então gasto negativo é contrato quebrado de verdade | Uma soma negativa aparece como "-R$ 40" na faixa; ninguém fica sem a aba |
| **Vazio = a loja nunca recebeu cadastro** (`tem_cadastro`, consulta `limit 1` em `site_captures` e `lp_captures`), não "zero no período" | Loja com integração ativa e semana parada não pode ver "Ainda não chegou nenhum cadastro"; ela vê o funil com "Nenhum cadastro com origem neste período" | Uma consulta a mais, só quando o período veio zerado |
| **"Lançar gasto" fica fora do 5b; a aba deixa três encaixes**: `acoesDoCabecalho` (botão), `rodapeDoGasto` (rodapé do cartão de gasto), `iniciosDeGasto` (anotação no gráfico) | Até o PR 7 não existe como lançar gasto, então o cartão mostra "—" e "nenhum gasto lançado no período" — sem link para lugar nenhum | Até o PR 7 o lojista não tem como lançar gasto pela tela (não tinha antes também) |
| **`por_dia.entraram` não é "corrigido"**: explicado em "Como cada número é contado" | O gráfico conta a entrada no dia em que aconteceu, só até o fim do período; o funil conta até hoje. Os dois estão certos para o que medem | Se o Igor preferir o gráfico batendo com o funil, é mudança de SQL (DDL) |
| **Degrau maior que o de cima** (entraram > foram; compraram > entraram) **não vira taxa > 100%**: a passagem diz "inclui quem entrou sem passar pelo link" / "inclui quem já era do grupo", e o desenho satura na largura do degrau de cima | Página da Girumo não mede "foi pro grupo" e convite repassado entra sem clique; "104% de quem foi" confunde | O desenho de uma loja só com páginas `/p/` fica com os 3 últimos degraus no piso — o número escrito continua certo |
| **Visão geral e Anúncios são links com URL própria** (`/painel/resultados` e `/painel/resultados/anuncios`), não abas com estado | Dá para mandar o link e voltar no navegador; a Visão geral não muda além de ganhar a navegação | Nenhum |
| **"Integração do site" aponta para `/painel/configuracoes?secao=integracoes`** (constante `HREF_INTEGRACAO_DO_SITE`) | É a porta "Integrações" do plano do PR 3 (`2026-10-10-funil-anuncios-pr3-integracao-tela.md`, `?secao=integracoes`), conferido na escrita deste plano | Se o 5b for ao ar antes do PR 3b, o link cai na primeira aba de Configurações até ele entrar |
| **Gasto só para quem tem `ads:manage`, desde o 5a** (decisão do controller pela spec §2–§3: gasto é dado de caixa). O 5a cria `"ads:manage": ["owner", "admin"]` e a rota passa o relatório por `semGasto` para os outros papéis: `total.gasto` e `linhas[].gasto` viram `null`, e some a linha de campanha que só existe por causa do gasto (gasto lançado sem cadastro no período: `cadastros = 0` no nível campanha). Retorno e custos são calculados na tela a partir do gasto, então somem junto; a anotação no gráfico não vem desta rota (vem do PR 7, que também exige `ads:manage`). O contrato do SQL continua estrito (`total.gasto` nunca nulo vindo do banco); `semGasto` devolve um tipo próprio, `RelatorioParaTela` (`gasto: number | null` no total e nas linhas), e rota e tela usam esse tipo | Nem por uma janela de tempo o operador vê gasto; e um `null` do SQL para o dono continua sendo erro, não "escondido" | O operador vê "—" em gasto, retorno e custo, com "só o dono e a administração veem o gasto" |

## Global Constraints

- Gasto é dado de caixa: só quem tem `ads:manage` (owner, admin) recebe `gasto` no relatório; os outros papéis recebem `null` em todo gasto (spec §3).
- Toda query em tabela com `tenant_id` filtra `.eq('tenant_id', tenantId)`; o `p_tenant` do RPC é **sempre** o do `getRouteTenantContext`, nunca da query string.
- Rota: `getRouteTenantContext(req, { allowEngine: false })`; erro que não é `Response` → 500 com `console.error`, sem mensagem do banco na resposta; `cache-control: no-store`.
- Vendedora: a rota e a página **não** entram em `lib/auth/modulos.ts` (fechado por padrão: API 403 pelo guard de `getTenantContext`, página bloqueada pela `GuardaDeModulo`).
- As janelas de crédito (7 dias entrada, 90 dias venda) moram em `public.attribution_report` (migração `20261010130100_funil_anuncios_relatorio.sql`), que é a origem. Há duas cópias em TypeScript: `JANELA_VENDA_DIAS` aqui (aviso de período recente) e `JANELA_VENDA_MS` no PR 3 (situação do cadastro); as duas levam comentário apontando para a função SQL. Mudar a janela = mudar as três.
- Período em `America/Sao_Paulo`; `de ≤ ate`; `ate − de ≤ 400` dias (mesma regra do SQL). Sem datas: últimos 30 dias contando hoje.
- Erro nunca vira zero (padrão `carga` da Vitrine): erro → cartão com "Tentar de novo"; carregando → esqueleto com `role="status"`.
- Tema G2: cartões `rounded-xl border border-line-200 bg-paper-0`; números em `font-brand` (Manrope); dado unitário em `font-data` (Plex Mono); escala de texto 12/13/15/20/28/32 só; funil em tons de `cobalt-500`; bico em `success-700`; nada de Acid; sem gradiente, blur ou raio > 12 px (o `vitrine-lint` reprova).
- Celular (< 768 px, `md:`): faixa rola de lado; funil em pé com o texto dentro dos degraus.
- Nomes acessíveis que o E2E e os testes usam são contrato: `nav "Seções do Resultados"`, `group "Período"` com botões `7 dias`/`30 dias`/`90 dias`/`Este mês` (`aria-pressed`), `status "Carregando o funil dos anúncios"`, botão `Tentar de novo`, `heading "Do anúncio à venda"`, `heading "Ainda não chegou nenhum cadastro com origem"`, links `Tenho site próprio` e `Usar uma página da Girumo`, `list "Funil do anúncio à venda"`, `summary "Como cada número é contado"`.
- Testes: `node:test` + `node:assert/strict`; rodar em `apps/web` com `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Componente: `renderToStaticMarkup` (molde: `components/painel/configuracoes/vitrine/aba-plano.test.ts`).
- Gate antes do push, em `apps/web`: `npm run lint`, `npx tsc --noEmit --project tsconfig.json`, `npx tsc --noEmit --project tsconfig.e2e.json`, `npm test`; depois o `infra/scripts/verify-local.ps1` do worktree.
- Nenhuma DDL. Commits em inglês com prefixo semântico.

## Review Focus

- **Loja com cadastro antigo e nenhum no período** (semana parada): tem que ver o funil com "Nenhum cadastro com origem neste período", não a tela Vazio. Coberto: teste da rota ("período zerado…") e do componente ("período com zero cadastros…").
- **Degrau maior que o de cima** (só páginas da Girumo, convite repassado, já-membro que compra): nada de "104%" nem funil com barriga. Coberto: `degrausDoTotal` e `geometriaDoFunil` ("nunca alarga").
- **Pedido com valor negativo vindo de outro caminho**: a aba abre e mostra "-R$ 40". Coberto: parser, rota e componente.
- **Lojista abrindo a aba entre 21h e meia-noite** (UTC já virou): o período tem que terminar no dia de Brasília. Coberto: `periodoDoAtalho` com `VIRADA`.
- **Operador abrindo a aba** (sem `ads:manage`): nenhum número de gasto em lugar nenhum da resposta, nem a campanha que só tinha gasto. Coberto: `semGasto` (Task 1), rota (Task 3), tela (Task 6).
- **Erro depois de ter carregado** (trocou de período e a rota falhou): não pode continuar mostrando o funil anterior com o botão do período novo marcado. Coberto: "erro ao trocar de período não mostra o relatório anterior". A corrida entre duas buscas fica com a página (só a última escreve, `useRef`).

---

## Arquivos

| Arquivo | PR | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/resultados/relatorio-anuncios.ts` (+ `.test.ts`) | 5a | contrato zod (vendido afrouxado, `total.gasto` nulo) + `semGasto` + tipo `RespostaAnuncios` |
| `apps/web/src/lib/permissions.ts` (+ `permissions.test.ts`) | 5a | ação `ads:manage` (owner, admin) |
| `apps/web/src/lib/resultados/periodo-anuncios.ts` (+ `.test.ts`) | 5a | atalhos, datas puras, `?de=&ate=` da rota |
| `apps/web/src/lib/stores/relatorio-de-anuncios.ts` | 5a | `rpc("attribution_report")` + "a loja já teve cadastro?" |
| `apps/web/src/app/api/resultados/anuncios/route.ts` (+ `route.test.ts`) | 5a | a rota |
| `apps/web/e2e/vendas-vendedora.spec.ts` | 5a | vendedora recebe 403 na rota nova |
| `apps/web/src/lib/resultados/anuncios-tela.ts` (+ `.test.ts`) | 5b | formatos, faixa, degraus, bico, geometria, por onde, gráfico, marcas, aviso, guarda da resposta |
| `apps/web/src/components/painel/resultados/secoes-do-resultados.tsx` | 5b | navegação Visão geral / Anúncios |
| `apps/web/src/components/painel/resultados/anuncios/funil-grande.tsx` | 5b | funil em degraus (computador e celular) |
| `apps/web/src/components/painel/resultados/anuncios/grafico-por-dia.tsx` | 5b | cadastros × entraram por dia, com marcas |
| `apps/web/src/components/painel/resultados/anuncios/como-contamos.tsx` | 5b | "Como cada número é contado" |
| `apps/web/src/components/painel/resultados/anuncios/aba-anuncios.tsx` (+ `.test.ts`) | 5b | a aba: cabeçalho, período, estados, faixa, por onde, fora, vazio |
| `apps/web/src/app/painel/resultados/anuncios/page.tsx` | 5b | busca e estado |
| `apps/web/src/components/painel/resultados/vitrine/resultados-vitrine.tsx` | 5b | a Visão geral ganha a navegação |
| `apps/web/e2e/conteudo-esperado.ts` | 5b | âncora da rota nova no smoke |
| `apps/web/e2e/painel-anuncios.spec.ts` | 5b | cadeia da spec §8: cadastro plantado no banco dev chega ao funil |

---

# PR 5a — `GET /api/resultados/anuncios`

Antes de tudo (CLAUDE.md, "Regra de PR"):

```bash
git fetch origin main
git worktree add -b feat/funil-anuncios-pr5a-rota ../pr5a origin/main
```

Comandos abaixo rodam em `apps/web` do worktree novo.

### Task 1: Contrato do relatório: `vendido` negativo, gasto nulo, `semGasto` e o tipo da resposta

**Files:**
- Modify: `apps/web/src/lib/resultados/relatorio-anuncios.ts` (arquivo inteiro abaixo)
- Test: `apps/web/src/lib/resultados/relatorio-anuncios.test.ts` (3 testes no fim)

**Interfaces:**
- Consumes: nada novo.
- Produces:
  - `type RelatorioParaTela = Omit<RelatorioAnuncios, "total"> & { total: Omit<RelatorioAnuncios["total"], "gasto"> & { gasto: number | null } }` — o que a tela recebe (`linhas[].gasto` já era `number | null`)
  - `type RespostaAnuncios = { relatorio: RelatorioParaTela; tem_cadastro: boolean }`
  - `lerRelatorioAnuncios(bruto: unknown): RelatorioAnuncios` (mesma assinatura; `vendido` de `total`, `linhas[]`, `por_origem[]` e `fora.vendido_sem_origem` agora aceita negativo; `total.gasto` continua estrito, `number` não negativo)
  - `semGasto(relatorio: RelatorioAnuncios): RelatorioParaTela` — `total.gasto = null`, `gasto = null` em toda linha, sem as linhas de campanha com `cadastros = 0`; não muta a entrada

- [ ] **Step 1: Write the failing test** — em `relatorio-anuncios.test.ts`, trocar o import por

```ts
import { lerRelatorioAnuncios, semGasto } from "./relatorio-anuncios";
```

e acrescentar ao fim do arquivo:

```ts
test("vendido negativo (pedido de estorno de outro caminho) passa como veio, sem derrubar a aba", () => {
  const r = lerRelatorioAnuncios({
    ...VALIDO,
    total: { ...VALIDO.total, vendido: -50 },
    linhas: [{ ...VALIDO.linhas[0], vendido: -50 }],
    por_origem: [{ origem: "ig", cadastros: 3, vendido: -50 }],
    fora: { ...VALIDO.fora, vendido_sem_origem: -10.5 },
  });
  assert.equal(r.total.vendido, -50);
  assert.equal(r.linhas[0].vendido, -50);
  assert.equal(r.fora.vendido_sem_origem, -10.5);
});

test("gasto negativo continua recusado: ad_spend não aceita, então é contrato quebrado", () => {
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, gasto: -1 } }), /relatorio invalido/);
  assert.throws(
    () => lerRelatorioAnuncios({ ...VALIDO, linhas: [{ ...VALIDO.linhas[0], gasto: -1 }] }),
    /relatorio invalido/,
  );
});

test("vendido infinito ou NaN continua recusado", () => {
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, vendido: Number.NaN } }), /relatorio invalido/);
  assert.throws(
    () => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, vendido: Number.POSITIVE_INFINITY } }),
    /relatorio invalido/,
  );
});

test("sem ads:manage: todo gasto vira null e some a campanha que só existia pelo gasto", () => {
  const r = lerRelatorioAnuncios({
    ...VALIDO,
    linhas: [
      ...VALIDO.linhas,
      { nivel: "campanha", campanha: "Só gasto", conjunto: null, anuncio: null, cadastros: 0, foram: 0, entraram: 0,
        ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0, gasto: 90 },
    ],
  });
  const escondido = semGasto(r);
  assert.equal(escondido.total.gasto, null);
  assert.ok(escondido.linhas.every((l) => l.gasto === null));
  assert.deepEqual(escondido.linhas.map((l) => l.campanha), ["C1", "C1"]);
  assert.doesNotMatch(JSON.stringify(escondido), /"gasto":\d|Só gasto/);
  // O resto do relatório passa igual, e a entrada não é mutada.
  assert.deepEqual({ ...escondido.total, gasto: r.total.gasto }, r.total);
  assert.equal(r.total.gasto, 190);
  assert.equal(r.linhas.length, 3);
});

test("o contrato do SQL continua estrito: total.gasto null vindo do banco é erro, não gasto escondido", () => {
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, gasto: null } }), /relatorio invalido/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.test.ts`
Expected: FAIL — `semGasto` não é exportado (e "vendido negativo…" cai com `relatorio invalido: total.vendido`).

- [ ] **Step 3: Write minimal implementation** — substituir o arquivo inteiro:

```ts
// apps/web/src/lib/resultados/relatorio-anuncios.ts
import { z } from "zod";

/**
 * Contrato do JSON de `public.attribution_report` (migração
 * 20261010130100_funil_anuncios_relatorio.sql; spec 2026-10-10-funil-anuncios §2).
 *
 * A tela nunca confia no formato: um campo que mudar no SQL quebra aqui, com
 * mensagem, em vez de virar zero desenhado no funil.
 */

const contagem = z.number().int().nonnegative();
/** Gasto vem de `ad_spend`, cujo check exige `amount > 0`: negativo aqui é contrato quebrado. */
const gasto = z.number().nonnegative();
/**
 * Vendido é soma de `orders.value`, que outro caminho grava (estorno lançado como
 * pedido negativo, ajuste). Um pedido estranho não derruba a aba inteira: o número
 * sai como veio, e só NaN/Infinity/texto continuam recusados.
 */
const vendido = z.number();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const linhaSchema = z.object({
  nivel: z.enum(["campanha", "conjunto", "anuncio"]),
  campanha: z.string().nullable(),
  conjunto: z.string().nullable(),
  anuncio: z.string().nullable(),
  cadastros: contagem,
  foram: contagem,
  entraram: contagem,
  ja_membros: contagem,
  compradores: contagem,
  pedidos: contagem,
  vendido,
  gasto: gasto.nullable(),
});

const relatorioSchema = z.object({
  periodo: z.object({ de: dia, ate: dia }),
  total: z.object({
    cadastros: contagem,
    foram: contagem,
    entraram: contagem,
    ja_membros: contagem,
    compradores: contagem,
    pedidos: contagem,
    vendido,
    gasto,
  }),
  linhas: z.array(linhaSchema),
  por_origem: z.array(z.object({ origem: z.string().nullable(), cadastros: contagem, vendido })),
  por_dia: z.array(z.object({ dia, cadastros: contagem, entraram: contagem })),
  fora: z.object({
    entradas_sem_cadastro: contagem,
    pedidos_sem_origem: contagem,
    vendido_sem_origem: vendido,
  }),
});

export type RelatorioAnuncios = z.infer<typeof relatorioSchema>;
export type LinhaRelatorio = z.infer<typeof linhaSchema>;
export type NivelLinha = LinhaRelatorio["nivel"];

/**
 * O relatório como a tela recebe: igual ao do SQL, mas com `total.gasto` podendo ser
 * `null` — o de quem não tem `ads:manage` (`semGasto`). O contrato do SQL continua
 * estrito: `null` no gasto do total vindo do banco é erro, não "escondido".
 */
export type RelatorioParaTela = Omit<RelatorioAnuncios, "total"> & {
  total: Omit<RelatorioAnuncios["total"], "gasto"> & { gasto: number | null };
};

/**
 * Corpo de `GET /api/resultados/anuncios`. `tem_cadastro` diz se a loja já recebeu
 * algum cadastro (de qualquer período): sem nenhum, a aba mostra a tela Vazio em
 * vez de um funil zerado.
 */
export type RespostaAnuncios = { relatorio: RelatorioParaTela; tem_cadastro: boolean };

/**
 * O relatório para quem não tem `ads:manage` (spec §2–§3: gasto é dado de caixa, só
 * dono e administração). Some todo gasto, e também a linha de campanha que só existe
 * por causa dele (gasto lançado sem nenhum cadastro no período: `cadastros = 0` no
 * nível campanha — campanha com cadastro sempre tem pelo menos 1). Retorno e custo
 * por degrau são calculados na tela a partir do gasto, então somem junto.
 * Não muta a entrada.
 */
export function semGasto(relatorio: RelatorioAnuncios): RelatorioParaTela {
  return {
    ...relatorio,
    total: { ...relatorio.total, gasto: null },
    linhas: relatorio.linhas
      .filter((l) => !(l.nivel === "campanha" && l.cadastros === 0))
      .map((l) => ({ ...l, gasto: null })),
  };
}

export function lerRelatorioAnuncios(bruto: unknown): RelatorioAnuncios {
  const lido = relatorioSchema.safeParse(bruto);
  if (!lido.success) {
    const primeiro = lido.error.issues[0];
    throw new Error(`relatorio invalido: ${primeiro?.path.join(".") ?? "?"} ${primeiro?.message ?? ""}`.trim());
  }
  return lido.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/resultados/relatorio-anuncios.ts apps/web/src/lib/resultados/relatorio-anuncios.test.ts
git commit -m "feat(resultados): ads report contract accepts negative sales and hides spend via semGasto"
```

### Task 2: Período da aba

**Files:**
- Create: `apps/web/src/lib/resultados/periodo-anuncios.ts`
- Test: `apps/web/src/lib/resultados/periodo-anuncios.test.ts`

**Interfaces:**
- Consumes: `dayBR(d?: Date): string`, `monthBR(d?: Date): string` de `@/lib/date-br`.
- Produces:
  - `const ATALHOS: readonly ["7d", "30d", "90d", "mes"]`; `type AtalhoDoPeriodo = "7d" | "30d" | "90d" | "mes"`
  - `type Periodo = { de: string; ate: string }`
  - `const MAX_DIAS_ENTRE = 400`
  - `somarDias(dia: string, n: number): string`
  - `diasEntre(de: string, ate: string): number`
  - `dataValida(dia: string): boolean`
  - `periodoDoAtalho(atalho: AtalhoDoPeriodo, agora: Date): Periodo`
  - `type PeriodoLido = { ok: true; periodo: Periodo } | { ok: false; erro: string }`
  - `periodoDaBusca(busca: URLSearchParams, agora: Date): PeriodoLido`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { dataValida, diasEntre, periodoDaBusca, periodoDoAtalho, somarDias } from "./periodo-anuncios";

/** 10/10/2026 às 02:00 UTC = 09/10 às 23:00 em Brasília: o "hoje" é 09/10. */
const VIRADA = new Date("2026-10-10T02:00:00Z");
const MEIO_DIA = new Date("2026-10-10T15:00:00Z");

test("atalhos contam hoje e usam o dia de Brasília, não o UTC", () => {
  assert.deepEqual(periodoDoAtalho("30d", MEIO_DIA), { de: "2026-09-11", ate: "2026-10-10" });
  assert.deepEqual(periodoDoAtalho("7d", MEIO_DIA), { de: "2026-10-04", ate: "2026-10-10" });
  assert.deepEqual(periodoDoAtalho("90d", MEIO_DIA), { de: "2026-07-13", ate: "2026-10-10" });
  assert.deepEqual(periodoDoAtalho("mes", MEIO_DIA), { de: "2026-10-01", ate: "2026-10-10" });
  assert.deepEqual(periodoDoAtalho("30d", VIRADA), { de: "2026-09-10", ate: "2026-10-09" });
  assert.deepEqual(periodoDoAtalho("mes", new Date("2026-11-01T02:00:00Z")), { de: "2026-10-01", ate: "2026-10-31" });
});

test("contas de data pura atravessam mês e ano", () => {
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(diasEntre("2026-09-11", "2026-10-10"), 29);
  assert.equal(diasEntre("2026-10-10", "2026-10-09"), -1);
});

test("data que não existe ou fora do formato é recusada", () => {
  assert.equal(dataValida("2026-10-10"), true);
  assert.equal(dataValida("2026-02-30"), false);
  assert.equal(dataValida("2026-13-01"), false);
  assert.equal(dataValida("10/10/2026"), false);
  assert.equal(dataValida("2026-10-10T00:00:00Z"), false);
  assert.equal(dataValida(""), false);
});

test("busca sem datas vale os últimos 30 dias", () => {
  assert.deepEqual(periodoDaBusca(new URLSearchParams(""), MEIO_DIA), {
    ok: true,
    periodo: { de: "2026-09-11", ate: "2026-10-10" },
  });
});

test("busca válida passa; o limite de 400 dias é o do SQL (ate - de)", () => {
  assert.deepEqual(periodoDaBusca(new URLSearchParams("de=2026-10-10&ate=2026-10-10"), MEIO_DIA), {
    ok: true,
    periodo: { de: "2026-10-10", ate: "2026-10-10" },
  });
  const limite = periodoDaBusca(new URLSearchParams(`de=2025-09-05&ate=${somarDias("2025-09-05", 400)}`), MEIO_DIA);
  assert.equal(limite.ok, true);
  const passou = periodoDaBusca(new URLSearchParams(`de=2025-09-05&ate=${somarDias("2025-09-05", 401)}`), MEIO_DIA);
  assert.deepEqual(passou, { ok: false, erro: "Escolha um período de até 400 dias." });
});

test("busca com uma data só, data inválida ou invertida: erro com mensagem", () => {
  const erro = (q: string) => {
    const lido = periodoDaBusca(new URLSearchParams(q), MEIO_DIA);
    return lido.ok ? null : lido.erro;
  };
  assert.equal(erro("de=2026-10-01"), "Informe as duas datas: de e ate.");
  assert.equal(erro("ate=2026-10-01"), "Informe as duas datas: de e ate.");
  assert.equal(erro("de=2026-02-30&ate=2026-03-10"), "Data inválida: use AAAA-MM-DD.");
  assert.equal(erro("de=&ate="), "Data inválida: use AAAA-MM-DD.");
  assert.equal(erro("de=2026-10-10&ate=2026-09-01"), "A data inicial vem depois da final.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/periodo-anuncios.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
import { dayBR, monthBR } from "@/lib/date-br";

/**
 * Período da aba Anúncios (spec 2026-10-10-funil-anuncios §1 e §3): datas puras
 * `YYYY-MM-DD` no relógio de Brasília. O período escolhe os CADASTROS (coorte).
 *
 * As mesmas regras que `public.attribution_report` recusa com `raise exception`
 * (de > ate, mais de 400 dias) são conferidas aqui antes, para a rota responder
 * 400 com mensagem em vez de depender do erro do banco.
 */

export const ATALHOS = ["7d", "30d", "90d", "mes"] as const;
export type AtalhoDoPeriodo = (typeof ATALHOS)[number];
export type Periodo = { de: string; ate: string };

/** O SQL recusa `p_ate - p_de > 400`. */
export const MAX_DIAS_ENTRE = 400;

const UM_DIA_MS = 86_400_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Data pura não tem fuso: as contas usam meia-noite UTC dos dois lados. */
function emMs(dia: string): number {
  return Date.parse(`${dia}T00:00:00Z`);
}

export function somarDias(dia: string, n: number): string {
  return new Date(emMs(dia) + n * UM_DIA_MS).toISOString().slice(0, 10);
}

/** Dias de `de` até `ate` (0 quando são o mesmo dia; negativo quando `ate` vem antes). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((emMs(ate) - emMs(de)) / UM_DIA_MS);
}

/** `2026-02-30` passa no regex e não existe: a volta pelo `Date` o recusa. */
export function dataValida(dia: string): boolean {
  if (!DATA.test(dia)) return false;
  const ms = emMs(dia);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === dia;
}

/** "30 dias" = os últimos 30 dias contando hoje; "mês" = do dia 1 até hoje. */
export function periodoDoAtalho(atalho: AtalhoDoPeriodo, agora: Date): Periodo {
  const ate = dayBR(agora);
  if (atalho === "mes") return { de: `${monthBR(agora)}-01`, ate };
  const dias = atalho === "7d" ? 7 : atalho === "30d" ? 30 : 90;
  return { de: somarDias(ate, -(dias - 1)), ate };
}

export type PeriodoLido = { ok: true; periodo: Periodo } | { ok: false; erro: string };

/** `?de=&ate=` da rota. Sem os dois: últimos 30 dias. Com um só, ou inválido: erro com mensagem. */
export function periodoDaBusca(busca: URLSearchParams, agora: Date): PeriodoLido {
  const de = busca.get("de");
  const ate = busca.get("ate");
  if (de === null && ate === null) return { ok: true, periodo: periodoDoAtalho("30d", agora) };
  if (de === null || ate === null) return { ok: false, erro: "Informe as duas datas: de e ate." };
  if (!dataValida(de) || !dataValida(ate)) return { ok: false, erro: "Data inválida: use AAAA-MM-DD." };
  const dias = diasEntre(de, ate);
  if (dias < 0) return { ok: false, erro: "A data inicial vem depois da final." };
  if (dias > MAX_DIAS_ENTRE) return { ok: false, erro: "Escolha um período de até 400 dias." };
  return { ok: true, periodo: { de, ate } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/periodo-anuncios.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/resultados/periodo-anuncios.ts apps/web/src/lib/resultados/periodo-anuncios.test.ts
git commit -m "feat(resultados): period presets and query parsing for the ads tab"
```

### Task 3: `ads:manage`, store do relatório e a rota

**Files:**
- Modify: `apps/web/src/lib/permissions.ts` (ação nova)
- Modify: `apps/web/src/lib/permissions.test.ts` (o mapa exaustivo `ACOES` não compila sem a ação nova; + 1 teste)
- Create: `apps/web/src/lib/stores/relatorio-de-anuncios.ts`
- Create: `apps/web/src/app/api/resultados/anuncios/route.ts`
- Test: `apps/web/src/app/api/resultados/anuncios/route.test.ts` (PostgREST falso; cobre a store pela rota)

**Interfaces:**
- Consumes: `lerRelatorioAnuncios`, `semGasto`, `RelatorioAnuncios`, `RelatorioParaTela`, `RespostaAnuncios` (Task 1); `hasPermission(role, action)` de `@/lib/permissions`; `Periodo`, `periodoDaBusca`, `diasEntre` (Task 2); `getSupabaseAdmin()`; `getRouteTenantContext(req, { allowEngine: false })`.
- Produces:
  - `Action` ganha `"ads:manage"` (owner, admin) — o PR 7 só passa a usar
  - `class PeriodoRecusado extends Error`
  - `relatorioDeAnuncios(tenantId: string, periodo: Periodo): Promise<RelatorioAnuncios>`
  - `temCadastroComOrigem(tenantId: string): Promise<boolean>`
  - `GET /api/resultados/anuncios?de=YYYY-MM-DD&ate=YYYY-MM-DD` → `200 RespostaAnuncios` (sem `ads:manage`: relatório por `semGasto`) | `400 { error: string }` | `403` (vendedora, texto `MENSAGEM_BLOQUEIO`) | `500 { error: "Não deu para montar o funil dos anúncios." }`

O `supabase-js` chama `rpc` como `POST /rest/v1/rpc/attribution_report` com o corpo `{ p_tenant, p_de, p_ate }` e devolve o `jsonb` já parseado; o erro do PostgREST traz `code` (`22023` é o `raise exception … errcode = '22023'` da função).

- [ ] **Step 1: Write the failing tests** — em `permissions.test.ts`, acrescentar `"ads:manage": true,` ao fim do objeto `ACOES` (depois de `"message:send": true,`) e, no fim do arquivo:

```ts
test("ads:manage (gasto de anúncio) só para dono e administração", () => {
  assert.equal(hasPermission("owner", "ads:manage"), true);
  assert.equal(hasPermission("admin", "ads:manage"), true);
  assert.equal(hasPermission("operator", "ads:manage"), false);
  assert.equal(hasPermission("seller", "ads:manage"), false);
});
```

E o teste da rota:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { dayBR } from "@/lib/date-br";
import { diasEntre } from "@/lib/resultados/periodo-anuncios";
import { GET } from "./route";

/** Dono logado por Bearer (mesmo molde de api/integracoes/site/chave/route.test.ts). */

const RELATORIO = {
  periodo: { de: "2026-09-11", ate: "2026-10-10" },
  total: { cadastros: 6, foram: 5, entraram: 4, ja_membros: 1, compradores: 2, pedidos: 3, vendido: 1300, gasto: 250 },
  linhas: [
    { nivel: "campanha", campanha: "C1", conjunto: null, anuncio: null, cadastros: 6, foram: 5, entraram: 4,
      ja_membros: 1, compradores: 2, pedidos: 3, vendido: 1300, gasto: 160 },
    { nivel: "anuncio", campanha: "C1", conjunto: "S1", anuncio: "A1", cadastros: 6, foram: 5, entraram: 4,
      ja_membros: 1, compradores: 2, pedidos: 3, vendido: 1300, gasto: null },
    { nivel: "campanha", campanha: "Só gasto", conjunto: null, anuncio: null, cadastros: 0, foram: 0, entraram: 0,
      ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0, gasto: 90 },
  ],
  por_origem: [{ origem: "ig", cadastros: 6, vendido: 1300 }],
  por_dia: [{ dia: "2026-10-10", cadastros: 6, entraram: 4 }],
  fora: { entradas_sem_cadastro: 2, pedidos_sem_origem: 1, vendido_sem_origem: 90 },
};
const ZERADO = {
  ...RELATORIO,
  total: { ...RELATORIO.total, cadastros: 0, foram: 0, entraram: 0, ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0 },
  linhas: [],
  por_origem: [],
};

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let rpc: { status: number; corpo: unknown } = { status: 200, corpo: RELATORIO };
let capturasDoSite: unknown[] = [];
let capturasDePagina: unknown[] = [];

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
    else if (chave === "POST /rest/v1/rpc/attribution_report") [status, corpo] = [rpc.status, rpc.corpo];
    else if (chave === "GET /rest/v1/site_captures") [status, corpo] = [200, capturasDoSite];
    else if (chave === "GET /rest/v1/lp_captures") [status, corpo] = [200, capturasDePagina];
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
  rpc = { status: 200, corpo: RELATORIO };
  capturasDoSite = [];
  capturasDePagina = [];
});

function pedir(busca: string): Request {
  return new Request(`http://girumo.test/api/resultados/anuncios${busca}`, {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}
const doRpc = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/attribution_report");
const dasCapturas = () =>
  chamadas.filter((c) => c.url.pathname === "/rest/v1/site_captures" || c.url.pathname === "/rest/v1/lp_captures");

test("dono: 200 com o relatório; o tenant do RPC é o da sessão, nunca o da query string", async () => {
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10&tenant_id=loja-x&p_tenant=loja-x"));
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const corpo = await resposta.json();
  assert.equal(corpo.tem_cadastro, true);
  assert.equal(corpo.relatorio.total.cadastros, 6);
  // Dono tem ads:manage: o gasto vem inteiro.
  assert.equal(corpo.relatorio.total.gasto, 250);
  assert.deepEqual(corpo.relatorio.linhas.map((l: { gasto: number | null }) => l.gasto), [160, null, 90]);
  assert.deepEqual(doRpc()[0]?.corpo, { p_tenant: "loja-b", p_de: "2026-09-11", p_ate: "2026-10-10" });
  // Cadastro no período já prova que existe: nada de consulta extra.
  assert.equal(dasCapturas().length, 0);
});

test("operador lê o funil sem nenhum gasto: nem total, nem linha, nem a campanha que só tinha gasto", async () => {
  papel = "operator";
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  assert.equal(corpo.relatorio.total.gasto, null);
  assert.equal(corpo.relatorio.total.vendido, 1300);
  assert.deepEqual(corpo.relatorio.linhas.map((l: { gasto: number | null }) => l.gasto), [null, null]);
  assert.doesNotMatch(JSON.stringify(corpo), /"gasto":\d|Só gasto/);
});

test("admin vê o gasto", async () => {
  papel = "admin";
  assert.equal((await (await GET(pedir("?de=2026-09-11&ate=2026-10-10"))).json()).relatorio.total.gasto, 250);
});

test("vendedora: 403 do guard de módulo e o RPC nunca roda", async () => {
  papel = "seller";
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 403);
  assert.equal(doRpc().length, 0);
});

test("período zerado: confere se a loja já teve cadastro, nas duas fontes e filtrando a loja", async () => {
  rpc = { status: 200, corpo: ZERADO };
  let corpo = await (await GET(pedir("?de=2026-09-11&ate=2026-10-10"))).json();
  assert.equal(corpo.tem_cadastro, false);
  const consultas = dasCapturas();
  assert.equal(consultas.length, 2);
  for (const c of consultas) {
    assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b");
    assert.equal(c.url.searchParams.get("limit"), "1");
  }

  capturasDePagina = [{ id: "c1" }];
  corpo = await (await GET(pedir("?de=2026-09-11&ate=2026-10-10"))).json();
  assert.equal(corpo.tem_cadastro, true);
});

test("sem datas: últimos 30 dias em Brasília, contando hoje", async () => {
  assert.equal((await GET(pedir(""))).status, 200);
  const enviado = doRpc()[0]?.corpo as { p_de: string; p_ate: string };
  assert.equal(enviado.p_ate, dayBR());
  assert.equal(diasEntre(enviado.p_de, enviado.p_ate), 29);
});

test("datas ruins: 400 com mensagem e o banco não é consultado", async () => {
  for (const busca of ["?de=2026-10-01", "?de=2026-02-30&ate=2026-03-10", "?de=2026-10-10&ate=2026-09-01", "?de=2024-01-01&ate=2026-01-01"]) {
    chamadas.length = 0;
    const resposta = await GET(pedir(busca));
    assert.equal(resposta.status, 400, busca);
    assert.equal(typeof (await resposta.json()).error, "string");
    assert.equal(doRpc().length, 0, busca);
  }
});

test("o banco recusa o período (22023): 400, não 500", async () => {
  rpc = { status: 400, corpo: { code: "22023", message: "periodo invalido", details: null, hint: null } };
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 400);
  assert.deepEqual(await resposta.json(), { error: "Período inválido." });
});

test("erro do banco ou formato quebrado: 500 sem vazar a mensagem do banco", async () => {
  rpc = { status: 401, corpo: { code: "42501", message: "permission denied for function attribution_report" } };
  let resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 500);
  assert.doesNotMatch(await resposta.text(), /permission|attribution_report/);

  rpc = { status: 200, corpo: { ...RELATORIO, total: { ...RELATORIO.total, cadastros: "6" } } };
  resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), { error: "Não deu para montar o funil dos anúncios." });
});

test("vendido negativo (pedido de estorno) não derruba a aba", async () => {
  rpc = { status: 200, corpo: { ...RELATORIO, total: { ...RELATORIO.total, vendido: -40 } } };
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 200);
  assert.equal((await resposta.json()).relatorio.total.vendido, -40);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/permissions.test.ts src/app/api/resultados/anuncios/route.test.ts`
Expected: FAIL — `./route` não existe e `hasPermission(…, "ads:manage")` dá `false` para o dono.

- [ ] **Step 3: A ação nova** — em `lib/permissions.ts`, acrescentar `| "ads:manage"` ao fim do tipo `Action` (depois de `| "message:send"`) e, ao fim de `PERMISSIONS`:

```ts
  // Gasto de anúncio é dado de caixa (spec 2026-10-10-funil-anuncios §3): lançar e ler.
  "ads:manage": ["owner", "admin"],
```

- [ ] **Step 3b: Write the store**

```ts
import "server-only";

import type { Periodo } from "@/lib/resultados/periodo-anuncios";
import { lerRelatorioAnuncios, type RelatorioAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * `attribution_report` recusou o período (`raise exception ... errcode 22023`).
 * A rota valida antes com as mesmas regras; isto é a rede de segurança se as
 * duas divergirem — vira 400, não 500.
 */
export class PeriodoRecusado extends Error {}

/**
 * Funil de anúncios da loja no período (`public.attribution_report`, só
 * `service_role`). O tenant vai explícito porque o service-role passa por cima
 * do RLS: é este parâmetro que isola as lojas. O JSON passa pelo contrato zod
 * antes de sair daqui — formato que mudar no SQL quebra com mensagem, não vira zero.
 */
export async function relatorioDeAnuncios(tenantId: string, periodo: Periodo): Promise<RelatorioAnuncios> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_report", {
    p_tenant: tenantId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  });
  if (error) throw error.code === "22023" ? new PeriodoRecusado(error.message) : new Error(error.message);
  return lerRelatorioAnuncios(data);
}

/**
 * A loja já recebeu algum cadastro, de qualquer período? Separa "ainda não
 * conectou nada" (tela Vazio) de "nada neste período" (funil zerado com aviso).
 * Uma linha basta: `limit(1)` nas duas fontes que o relatório lê.
 */
export async function temCadastroComOrigem(tenantId: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const [site, pagina] = await Promise.all([
    db.from("site_captures").select("id").eq("tenant_id", tenantId).limit(1),
    db.from("lp_captures").select("id").eq("tenant_id", tenantId).limit(1),
  ]);
  if (site.error) throw new Error(site.error.message);
  if (pagina.error) throw new Error(pagina.error.message);
  return (site.data?.length ?? 0) > 0 || (pagina.data?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Write the route**

```ts
import { hasPermission } from "@/lib/permissions";
import { periodoDaBusca } from "@/lib/resultados/periodo-anuncios";
import { semGasto, type RelatorioParaTela, type RespostaAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { PeriodoRecusado, relatorioDeAnuncios, temCadastroComOrigem } from "@/lib/stores/relatorio-de-anuncios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * GET /api/resultados/anuncios?de=YYYY-MM-DD&ate=YYYY-MM-DD — o funil de anúncios
 * da loja (spec 2026-10-10-funil-anuncios §3). Sem datas: últimos 30 dias em
 * Brasília. O tenant é sempre o da sessão, nunca o da query string.
 *
 * A vendedora não chega aqui: a rota não está em `lib/auth/modulos.ts`, e o guard
 * de `getTenantContext` responde 403 a tudo que não está no mapa dela. O operador lê
 * o funil, mas sem nenhum gasto (`semGasto`): gasto exige `ads:manage` (spec §3).
 */
export async function GET(req: Request): Promise<Response> {
  let tenantId: string;
  let veGasto: boolean;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    tenantId = ctx.tenantId;
    veGasto = ctx.role !== null && hasPermission(ctx.role, "ads:manage");
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/resultados/anuncios] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  const lido = periodoDaBusca(new URL(req.url).searchParams, new Date());
  if (!lido.ok) return resposta({ error: lido.erro }, 400);

  try {
    const relatorio = await relatorioDeAnuncios(tenantId, lido.periodo);
    // Cadastro no período já prova que a loja tem: a segunda consulta só roda no zero.
    const tem_cadastro = relatorio.total.cadastros > 0 || (await temCadastroComOrigem(tenantId));
    const paraTela: RelatorioParaTela = veGasto ? relatorio : semGasto(relatorio);
    const corpo: RespostaAnuncios = { relatorio: paraTela, tem_cadastro };
    return resposta(corpo, 200);
  } catch (e) {
    if (e instanceof PeriodoRecusado) return resposta({ error: "Período inválido." }, 400);
    console.error(`[api/resultados/anuncios] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu para montar o funil dos anúncios." }, 500);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/permissions.test.ts src/app/api/resultados/anuncios/route.test.ts`
Expected: PASS (6 de `permissions` — 5 que já existem em `main` depois do #435 + o novo —, 10 da rota). As duas linhas `[api/resultados/anuncios] loja-b: …` no stderr são do teste de 500 e esperadas.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/permissions.ts apps/web/src/lib/permissions.test.ts apps/web/src/lib/stores/relatorio-de-anuncios.ts apps/web/src/app/api/resultados/anuncios/route.ts apps/web/src/app/api/resultados/anuncios/route.test.ts
git commit -m "feat(resultados): GET /api/resultados/anuncios with spend only for ads:manage"
```

### Task 4: Vendedora barrada no E2E, gate e PR 5a

**Files:**
- Modify: `apps/web/e2e/vendas-vendedora.spec.ts` (teste "as rotas do dono respondem 403 para ela; as de vendas, 200", logo depois do bloco do `/api/media/prepare`)

**Interfaces:**
- Consumes: `GET /api/resultados/anuncios` (Task 3); `MENSAGEM_BLOQUEIO` (já importado no spec).
- Produces: nada.

- [ ] **Step 1: Acrescentar a asserção** — depois de `expect(preparo.status()).toBe(403);`, dentro do mesmo teste:

```ts
    // Funil de anúncios (spec 2026-10-10 §7): rota nova, fora do mapa da vendedora.
    const anuncios = await page.request.get("/api/resultados/anuncios");
    expect(anuncios.status()).toBe(403);
    expect(await anuncios.text()).toBe(MENSAGEM_BLOQUEIO);
```

- [ ] **Step 2: Gate local** (em `apps/web`)

Run: `npm run lint` · `npx tsc --noEmit --project tsconfig.json` · `npx tsc --noEmit --project tsconfig.e2e.json` · `npm test`
Expected: tudo verde; `npm test` com os testes novos.

Depois, em PowerShell, o gate do CI a partir do worktree:

```
Set-Location <caminho do worktree pr5a>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/vendas-vendedora.spec.ts
git commit -m "test(e2e): seller gets 403 on the ads report route"
```

- [ ] **Step 4: PR** — push e PR "feat(resultados): GET /api/resultados/anuncios (funil de anúncios, PR 5a)", corpo com as decisões de `vendido` negativo, `tem_cadastro` e gasto só para `ads:manage`, terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. CI verde (o job e2e roda o 403 da vendedora contra o banco dev) → mergear → apagar a branch.

- [ ] **Step 5: Prova em prod depois do deploy**, logado como dono da loja-piloto, no console do navegador em `/painel`:

```js
await (await fetch("/api/resultados/anuncios?de=2026-09-11&ate=2026-10-10")).json()
```

Expected: `{ relatorio: { periodo: { de: "2026-09-11", ate: "2026-10-10" }, total: {…, gasto: 0}, … }, tem_cadastro: <true se o site já mandou cadastro> }` — dono recebe número em `gasto`; um operador da loja, se houver, recebe `gasto: null`. E `fetch("/api/resultados/anuncios?de=2026-10-10&ate=2026-09-01")` → status 400.

- [ ] **Step 6: Card** (prod): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 5a: rota do relatório no ar; aba vem no 5b', 'PR #<n>');`

---

# PR 5b — aba Anúncios

Com o 5a mergeado:

```bash
git fetch origin main
git worktree add -b feat/funil-anuncios-pr5b-aba ../pr5b origin/main
```

**Antes da Task 5:** conferir no plano do PR 3 (`2026-10-10-funil-anuncios-pr3-integracao-tela.md`) que a porta continua sendo `/painel/configuracoes?secao=integracoes`. Se tiver mudado, trocar o valor de `HREF_INTEGRACAO_DO_SITE` na Task 5 e a expectativa correspondente no teste da Task 6.

### Task 5: Regras puras da tela

**Files:**
- Create: `apps/web/src/lib/resultados/anuncios-tela.ts`
- Test: `apps/web/src/lib/resultados/anuncios-tela.test.ts`

**Interfaces:**
- Consumes: `tetoDoEixo(maximo: number): number` de `@/lib/painel/atividade`; `diasEntre`, `AtalhoDoPeriodo` (Task 2); `RelatorioParaTela`, `RespostaAnuncios` (Task 1). Toda função recebe as partes de `RelatorioParaTela` (gasto pode ser `null`).
- Produces (todos exportados de `@/lib/resultados/anuncios-tela`):
  - constantes: `JANELA_VENDA_DIAS = 90`, `HREF_INTEGRACAO_DO_SITE`, `HREF_NOVA_PAGINA = "/painel/pages/nova"`, `ROTULO_DO_ATALHO: Record<AtalhoDoPeriodo, string>`, `FUNIL_COMPUTADOR = { piso: 30, bico: 28 }`, `FUNIL_CELULAR = { piso: 48, bico: 40 }`
  - formatos: `dinheiro(v): string` ("R$ 21.760"), `custo(v): string` ("R$ 4,64"), `inteiro(n)`, `contagem(n, um, varios)`, `porcentagem(parte, todo): string | null`, `retorno(vendido, gasto: number | null): string | null` ("7,7×"; `null` com gasto 0 ou escondido), `custoPor(gasto: number | null, n): string | null`, `diaMes(dia): string` ("21/09"), `descricaoDoPeriodo(atalho): string`
  - `type CartaoDaFaixa = { chave: "gasto" | "vendido" | "retorno"; rotulo; valor; detalhe; sucesso: boolean }`; `faixaDoTotal(total): CartaoDaFaixa[]` — gasto `null` → "—" em gasto e retorno, com "só o dono e a administração veem o gasto"; gasto 0 → "—" com "nenhum gasto lançado no período"
  - `avisoDePeriodoRecente(ate: string, hoje: string): string | null`
  - `type DegrauDoFunil = { chave; rotulo; rotuloCurto; valor; passagem; taxa: string | null; custo: string | null; unidadeDoCusto }`; `degrausDoTotal(total): DegrauDoFunil[]`
  - `type BicoDoFunil = { valor; pedidos; esquerda; direita: string | null }`; `bicoDoTotal(total): BicoDoFunil`
  - `notaDeJaMembros(n): string | null`
  - `type FatiaDoFunil = { largura: number; recuo: number }`; `type FormaDoFunil = { piso: number; bico: number }`; `geometriaDoFunil(valores: readonly number[], forma: FormaDoFunil): FatiaDoFunil[]`; `clipDoDegrau(recuo: number): string`
  - `type CartaoDeOrigem = { nome: "Instagram" | "Facebook" | "Outros"; cadastros; vendido }`; `porOnde(porOrigem): CartaoDeOrigem[]`
  - `type DiaDoGrafico`, `type GraficoPorDiaModelo = { dias; teto; resumo }`; `graficoPorDia(porDia): GraficoPorDiaModelo`
  - `type InicioDeGasto = { dia: string; campanha: string }`; `type MarcaDoGrafico = { chave; posicao; texto }`; `marcasDeGasto(porDia, inicios): MarcaDoGrafico[]`
  - `ehRespostaAnuncios(corpo: unknown): corpo is RespostaAnuncios`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  avisoDePeriodoRecente,
  bicoDoTotal,
  clipDoDegrau,
  custo,
  degrausDoTotal,
  dinheiro,
  ehRespostaAnuncios,
  faixaDoTotal,
  FUNIL_CELULAR,
  FUNIL_COMPUTADOR,
  geometriaDoFunil,
  graficoPorDia,
  marcasDeGasto,
  notaDeJaMembros,
  porcentagem,
  porOnde,
  retorno,
} from "./anuncios-tela";

/** O Intl separa "R$" do número com espaço sem quebra; o teste lê com espaço comum. */
const sp = (s: string | null) => (s === null ? null : s.replace(/\u00a0/g, " "));

/** O exemplo do mockup (Main.dc.html). */
const TOTAL = {
  cadastros: 612,
  foram: 571,
  entraram: 498,
  ja_membros: 34,
  compradores: 46,
  pedidos: 58,
  vendido: 21760,
  gasto: 2840,
};

test("formatos: total sem centavos, custo com, taxa com uma casa só abaixo de 10%", () => {
  assert.equal(sp(dinheiro(21760)), "R$ 21.760");
  assert.equal(sp(dinheiro(-50)), "-R$ 50");
  assert.equal(sp(custo(4.6405)), "R$ 4,64");
  assert.equal(porcentagem(571, 612), "93%");
  assert.equal(porcentagem(46, 498), "9,2%");
  assert.equal(porcentagem(0, 10), "0%");
  assert.equal(porcentagem(3, 0), null);
  assert.equal(retorno(21760, 2840), "7,7×");
  assert.equal(retorno(21760, 0), null);
  assert.equal(retorno(-50, 100), "-0,5×");
});

test("faixa com gasto: gasto, vendido em verde e retorno com a frase por real", () => {
  const faixa = faixaDoTotal(TOTAL).map((c) => ({ ...c, valor: sp(c.valor), detalhe: sp(c.detalhe) }));
  assert.deepEqual(faixa, [
    { chave: "gasto", rotulo: "Gasto lançado", valor: "R$ 2.840", detalhe: "proporcional aos dias do período", sucesso: false },
    {
      chave: "vendido",
      rotulo: "Vendido pra quem veio dos anúncios",
      valor: "R$ 21.760",
      detalhe: "58 pedidos de 46 pessoas",
      sucesso: true,
    },
    { chave: "retorno", rotulo: "Retorno", valor: "7,7×", detalhe: "R$ 7,66 vendidos a cada R$ 1 de anúncio", sucesso: false },
  ]);
});

test("faixa sem gasto: travessão, nunca R$ 0 nem retorno inventado; singular certo", () => {
  const [gasto, vendido, ret] = faixaDoTotal({ ...TOTAL, gasto: 0, pedidos: 1, compradores: 1 });
  assert.equal(gasto.valor, "—");
  assert.equal(gasto.detalhe, "nenhum gasto lançado no período");
  assert.equal(vendido.detalhe, "1 pedido de 1 pessoa");
  assert.equal(ret.valor, "—");
  assert.equal(ret.detalhe, "aparece quando houver gasto lançado");
});

test("gasto escondido (null, sem ads:manage): travessão em gasto, retorno e custo, e o porquê", () => {
  const escondido = { ...TOTAL, gasto: null };
  const [gasto, , ret] = faixaDoTotal(escondido);
  assert.equal(gasto.valor, "—");
  assert.equal(gasto.detalhe, "só o dono e a administração veem o gasto");
  assert.equal(ret.valor, "—");
  assert.equal(ret.detalhe, "só o dono e a administração veem o gasto");
  assert.ok(degrausDoTotal(escondido).every((d) => d.custo === null));
  assert.equal(bicoDoTotal(escondido).direita, null);
  assert.equal(retorno(100, null), null);
});

test("degraus: passagem à esquerda e custo à direita, como no mockup", () => {
  const d = degrausDoTotal(TOTAL);
  assert.deepEqual(
    d.map((x) => [x.rotulo, x.valor, x.passagem, sp(x.custo), x.unidadeDoCusto]),
    [
      ["Se cadastraram", 612, "ponto de partida", "R$ 4,64", "por cadastro"],
      ["Foram pro grupo", 571, "93% dos cadastros", "R$ 4,97", "por clique"],
      ["Entraram no grupo", 498, "87% de quem foi", "R$ 5,70", "por entrada"],
      ["Compraram", 46, "9,2% de quem entrou", "R$ 61,74", "por comprador"],
    ],
  );
  assert.deepEqual(d.map((x) => x.taxa), [null, "93%", "87%", "9,2%"]);
});

test("degrau maior que o de cima não vira taxa acima de 100%: diz de onde veio a diferença", () => {
  // Só páginas da Girumo: ninguém "foi pro grupo" pelo link, mas 3 entraram e 5 compraram.
  const d = degrausDoTotal({ ...TOTAL, foram: 0, entraram: 3, compradores: 5, gasto: 0 });
  assert.equal(d[1].passagem, "0% dos cadastros");
  assert.equal(d[2].passagem, "inclui quem entrou sem passar pelo link");
  assert.equal(d[2].taxa, null);
  assert.equal(d[3].passagem, "inclui quem já era do grupo");
  assert.ok(d.every((x) => x.custo === null), "sem gasto, nenhum custo");
});

test("funil vazio: passagens viram travessão, sem dividir por zero", () => {
  const d = degrausDoTotal({ ...TOTAL, cadastros: 0, foram: 0, entraram: 0, compradores: 0 });
  assert.deepEqual(d.map((x) => x.passagem), ["ponto de partida", "—", "—", "—"]);
});

test("bico: vendido, pedidos por comprador e retorno; sem comprador não inventa ritmo", () => {
  const b = bicoDoTotal(TOTAL);
  assert.deepEqual({ ...b, valor: sp(b.valor) }, {
    valor: "R$ 21.760",
    pedidos: "58 pedidos",
    esquerda: "58 pedidos, 1,3 por comprador",
    direita: "7,7× de retorno",
  });
  const vazio = bicoDoTotal({ ...TOTAL, compradores: 0, pedidos: 0, vendido: 0, gasto: 0 });
  assert.equal(vazio.esquerda, "nenhum pedido ainda");
  assert.equal(vazio.direita, null);
});

test("nota de já membros só quando há", () => {
  assert.equal(
    notaDeJaMembros(34),
    "+34 se cadastraram já sendo do grupo. Não contam como entrada nova; o que compraram depois do cadastro conta pro anúncio.",
  );
  assert.equal(notaDeJaMembros(0), null);
});

test("geometria do funil grande: largura 30% + 70% × n/topo, fundo fecha no próximo e no bico", () => {
  assert.deepEqual(geometriaDoFunil([612, 571, 498, 46], FUNIL_COMPUTADOR), [
    { largura: 100, recuo: 2.34 },
    { largura: 95.31, recuo: 4.38 },
    { largura: 86.96, recuo: 29.73 },
    { largura: 35.26, recuo: 10.3 },
  ]);
  assert.deepEqual(geometriaDoFunil([612, 571, 498, 46], FUNIL_CELULAR), [
    { largura: 100, recuo: 1.74 },
    { largura: 96.52, recuo: 3.21 },
    { largura: 90.31, recuo: 21.26 },
    { largura: 51.91, recuo: 11.47 },
  ]);
});

test("geometria nunca alarga: degrau maior que o de cima satura na largura do de cima", () => {
  const g = geometriaDoFunil([10, 4, 6, 0], FUNIL_COMPUTADOR);
  assert.deepEqual(g, [
    { largura: 100, recuo: 21 },
    { largura: 58, recuo: 0 },
    { largura: 58, recuo: 24.14 },
    { largura: 30, recuo: 3.33 },
  ]);
  assert.ok(g.every((f) => f.recuo >= 0));
});

test("geometria com topo zero: tudo no piso, sem NaN", () => {
  const g = geometriaDoFunil([0, 0, 0, 0], FUNIL_COMPUTADOR);
  assert.deepEqual(g.map((f) => f.largura), [30, 30, 30, 30]);
  assert.ok(g.every((f) => Number.isFinite(f.recuo)));
});

test("clip-path do degrau", () => {
  assert.equal(clipDoDegrau(2.34), "polygon(0 0, 100% 0, 97.66% 100%, 2.34% 100%)");
  assert.equal(clipDoDegrau(0), "polygon(0 0, 100% 0, 100% 100%, 0% 100%)");
});

test("por onde: ig e fb do Meta viram Instagram e Facebook; o resto, e o sem origem, em Outros", () => {
  const cartoes = porOnde([
    { origem: "ig", cadastros: 356, vendido: 12420 },
    { origem: "FB", cadastros: 238, vendido: 8970 },
    { origem: "an", cadastros: 10, vendido: 300 },
    { origem: null, cadastros: 8, vendido: 70 },
    { origem: "instagram", cadastros: 1, vendido: 0 },
  ]);
  assert.deepEqual(cartoes, [
    { nome: "Instagram", cadastros: 357, vendido: 12420 },
    { nome: "Facebook", cadastros: 238, vendido: 8970 },
    { nome: "Outros", cadastros: 18, vendido: 370 },
  ]);
  assert.deepEqual(porOnde([{ origem: "ig", cadastros: 2, vendido: 0 }]), [
    { nome: "Instagram", cadastros: 2, vendido: 0 },
  ]);
  assert.deepEqual(porOnde([]), []);
});

test("gráfico por dia: rótulos dd/mm nas pontas e terços, teto redondo, resumo para o leitor de tela", () => {
  const porDia = Array.from({ length: 30 }, (_, i) => ({
    dia: `2026-09-${String(i + 1).padStart(2, "0")}`,
    cadastros: i === 20 ? 28 : 10,
    entraram: 1,
  }));
  const g = graficoPorDia(porDia);
  assert.equal(g.teto, 50);
  assert.deepEqual(
    g.dias.filter((d) => d.mostraRotulo).map((d) => d.rotulo),
    ["01/09", "11/09", "20/09", "30/09"],
  );
  assert.equal(g.dias[0].dica, "01/09: 10 cadastros, 1 entrou");
  assert.equal(
    g.resumo,
    "Cadastros e entradas por dia, de 01/09 a 30/09: 318 cadastros e 30 entradas; pico de 28 em 21/09.",
  );
});

test("gráfico sem movimento: resumo sem pico, teto mínimo; período de um dia tem um rótulo", () => {
  const g = graficoPorDia([{ dia: "2026-10-10", cadastros: 0, entraram: 0 }]);
  assert.equal(g.teto, 5);
  assert.equal(g.resumo, "Cadastros e entradas por dia, de 10/10 a 10/10: 0 cadastros e 0 entradas.");
  assert.deepEqual(g.dias.map((d) => d.mostraRotulo), [true]);
  assert.equal(graficoPorDia([]).resumo, "Sem dias no período.");
});

test("marcas de gasto: traço no começo do dia; fora do período some; mesmo dia junta", () => {
  const porDia = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"].map((dia) => ({
    dia,
    cadastros: 1,
    entraram: 1,
  }));
  assert.deepEqual(
    marcasDeGasto(porDia, [
      { dia: "2026-09-22", campanha: "Remarketing" },
      { dia: "2026-09-21", campanha: "Brasil" },
      { dia: "2026-09-22", campanha: "Goiânia" },
      { dia: "2026-09-22", campanha: "Goiânia" },
      { dia: "2026-08-01", campanha: "Antiga" },
    ]),
    [
      { chave: "2026-09-21", posicao: 0.25, texto: "21/09 · Brasil entrou no ar" },
      { chave: "2026-09-22", posicao: 0.5, texto: "22/09 · Remarketing, Goiânia entraram no ar" },
    ],
  );
  assert.deepEqual(marcasDeGasto(porDia, []), []);
});

test("aviso de período recente: até 90 dias depois do fim do período", () => {
  assert.match(avisoDePeriodoRecente("2026-10-10", "2026-10-10") ?? "", /ainda está comprando/);
  assert.match(avisoDePeriodoRecente("2026-07-13", "2026-10-10") ?? "", /ainda está comprando/);
  assert.equal(avisoDePeriodoRecente("2026-07-12", "2026-10-10"), null);
});

test("guarda da resposta: aceita o formato da rota, recusa erro e lixo", () => {
  const relatorio = {
    periodo: { de: "2026-09-11", ate: "2026-10-10" },
    total: TOTAL,
    linhas: [],
    por_origem: [],
    por_dia: [],
    fora: { entradas_sem_cadastro: 0, pedidos_sem_origem: 0, vendido_sem_origem: 0 },
  };
  assert.equal(ehRespostaAnuncios({ relatorio, tem_cadastro: true }), true);
  assert.equal(ehRespostaAnuncios({ error: "Não deu para montar o funil dos anúncios." }), false);
  assert.equal(ehRespostaAnuncios({ relatorio: { total: {} }, tem_cadastro: true }), false);
  assert.equal(ehRespostaAnuncios(null), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/anuncios-tela.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
import { tetoDoEixo } from "@/lib/painel/atividade";
import { diasEntre, type AtalhoDoPeriodo } from "./periodo-anuncios";
import type { RelatorioParaTela, RespostaAnuncios } from "./relatorio-anuncios";

/**
 * Regras puras da aba Anúncios do Resultados (spec 2026-10-10-funil-anuncios §1 e §4).
 *
 * Tudo que a tela escreve ou desenha sai daqui: formatos, passagens, custos,
 * geometria do funil, eixo do gráfico. Sem React e sem o relógio do navegador
 * (quem chama passa o "hoje"), para os testes fixarem cada caso.
 */

/**
 * A venda conta pro anúncio até 90 dias depois do cadastro. CÓPIA de `janela_venda`
 * em `public.attribution_report` (migração 20261010130100_funil_anuncios_relatorio.sql),
 * que é a origem; o PR 3 tem outra (`JANELA_VENDA_MS`). Mudou lá, muda aqui e lá.
 */
export const JANELA_VENDA_DIAS = 90;

/** Configurações › Integrações › Site próprio (PR 3 da série). */
export const HREF_INTEGRACAO_DO_SITE = "/painel/configuracoes?secao=integracoes";
export const HREF_NOVA_PAGINA = "/painel/pages/nova";

export const ROTULO_DO_ATALHO: Record<AtalhoDoPeriodo, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  mes: "Este mês",
};

const DESCRICAO_DO_ATALHO: Record<AtalhoDoPeriodo, string> = {
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
  "90d": "nos últimos 90 dias",
  mes: "neste mês",
};

export function descricaoDoPeriodo(atalho: AtalhoDoPeriodo): string {
  return DESCRICAO_DO_ATALHO[atalho];
}

const REAIS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const CENTAVOS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const UMA_CASA = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

/** Total grande, sem centavos: "R$ 21.760". */
export function dinheiro(valor: number): string {
  return REAIS.format(valor);
}

/** Custo unitário, com centavos: "R$ 4,64". */
export function custo(valor: number): string {
  return CENTAVOS.format(valor);
}

export function inteiro(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** "1 pedido", "58 pedidos". */
export function contagem(n: number, um: string, varios: string): string {
  return `${inteiro(n)} ${n === 1 ? um : varios}`;
}

/** "93%", "9,2%" (uma casa entre 0 e 10%), "0%". Sem base não existe taxa: `null`. */
export function porcentagem(parte: number, todo: number): string | null {
  if (!(todo > 0)) return null;
  const p = (parte / todo) * 100;
  return `${p > 0 && p < 10 ? p.toLocaleString("pt-BR", UMA_CASA) : Math.round(p).toLocaleString("pt-BR")}%`;
}

/**
 * "7,7×". Sem gasto lançado não existe retorno: `null` (a tela mostra travessão).
 * Gasto `null` é o relatório de quem não tem `ads:manage` (`semGasto`): também travessão.
 */
export function retorno(vendido: number, gasto: number | null): string | null {
  if (gasto === null || !(gasto > 0)) return null;
  return `${(vendido / gasto).toLocaleString("pt-BR", UMA_CASA)}×`;
}

/** Gasto dividido pelo degrau; sem gasto (zero ou escondido) ou degrau vazio: `null`. */
export function custoPor(gasto: number | null, n: number): string | null {
  return gasto !== null && gasto > 0 && n > 0 ? custo(gasto / n) : null;
}

export type CartaoDaFaixa = {
  chave: "gasto" | "vendido" | "retorno";
  rotulo: string;
  valor: string;
  detalhe: string;
  sucesso: boolean;
};

/** Quem não tem `ads:manage` recebe o gasto `null` (spec §3): o cartão diz por quê, sem link de lançar. */
const GASTO_ESCONDIDO = "só o dono e a administração veem o gasto";

/** Os três números do topo (spec §4): gasto lançado, vendido, retorno. */
export function faixaDoTotal(total: RelatorioParaTela["total"]): CartaoDaFaixa[] {
  const gasto = total.gasto;
  const temGasto = gasto !== null && gasto > 0;
  return [
    {
      chave: "gasto",
      rotulo: "Gasto lançado",
      valor: temGasto ? dinheiro(gasto) : "—",
      detalhe:
        gasto === null ? GASTO_ESCONDIDO : temGasto ? "proporcional aos dias do período" : "nenhum gasto lançado no período",
      sucesso: false,
    },
    {
      chave: "vendido",
      rotulo: "Vendido pra quem veio dos anúncios",
      valor: dinheiro(total.vendido),
      detalhe: `${contagem(total.pedidos, "pedido", "pedidos")} de ${contagem(total.compradores, "pessoa", "pessoas")}`,
      sucesso: true,
    },
    {
      chave: "retorno",
      rotulo: "Retorno",
      valor: retorno(total.vendido, total.gasto) ?? "—",
      detalhe: temGasto
        ? `${custo(total.vendido / gasto)} vendidos a cada R$ 1 de anúncio`
        : gasto === null
          ? GASTO_ESCONDIDO
          : "aparece quando houver gasto lançado",
      sucesso: false,
    },
  ];
}

/** Aviso amarelo: período cujo fim ainda está dentro da janela de venda continua vendendo. */
export function avisoDePeriodoRecente(ate: string, hoje: string): string | null {
  if (diasEntre(ate, hoje) >= JANELA_VENDA_DIAS) return null;
  return "Quem se cadastrou neste período ainda está comprando. O “Vendido” tende a crescer: a venda conta pro anúncio até 90 dias depois do cadastro.";
}

export type DegrauDoFunil = {
  chave: "cadastros" | "foram" | "entraram" | "compradores";
  rotulo: string;
  rotuloCurto: string;
  valor: number;
  /** À esquerda no computador: "93% dos cadastros". */
  passagem: string;
  /** Só a taxa, para a linha de dentro do degrau no celular. */
  taxa: string | null;
  /** À direita: "R$ 4,97", ou `null` sem gasto. */
  custo: string | null;
  unidadeDoCusto: string;
};

const DEGRAUS = [
  { chave: "cadastros", rotulo: "Se cadastraram", rotuloCurto: "cadastros", deQuem: "", unidade: "por cadastro", acima: "" },
  {
    chave: "foram",
    rotulo: "Foram pro grupo",
    rotuloCurto: "foram pro grupo",
    deQuem: "dos cadastros",
    unidade: "por clique",
    acima: "—",
  },
  {
    chave: "entraram",
    rotulo: "Entraram no grupo",
    rotuloCurto: "entraram",
    deQuem: "de quem foi",
    unidade: "por entrada",
    // Página da Girumo não mede "foi pro grupo" ainda, e convite repassado entra sem clique.
    acima: "inclui quem entrou sem passar pelo link",
  },
  {
    chave: "compradores",
    rotulo: "Compraram",
    rotuloCurto: "compraram",
    deQuem: "de quem entrou",
    unidade: "por comprador",
    // Quem já era do grupo compra pelo anúncio sem contar como entrada nova.
    acima: "inclui quem já era do grupo",
  },
] as const;

/** Os quatro degraus do funil grande, do total do relatório. */
export function degrausDoTotal(total: RelatorioParaTela["total"]): DegrauDoFunil[] {
  const valores = [total.cadastros, total.foram, total.entraram, total.compradores];
  return DEGRAUS.map((d, i) => {
    const valor = valores[i];
    const anterior = i === 0 ? null : valores[i - 1];
    const taxa = anterior === null || valor > anterior ? null : porcentagem(valor, anterior);
    const passagem =
      anterior === null ? "ponto de partida" : valor > anterior ? d.acima : taxa ? `${taxa} ${d.deQuem}` : "—";
    return {
      chave: d.chave,
      rotulo: d.rotulo,
      rotuloCurto: d.rotuloCurto,
      valor,
      passagem,
      taxa,
      custo: custoPor(total.gasto, valor),
      unidadeDoCusto: d.unidade,
    };
  });
}

export type BicoDoFunil = { valor: string; pedidos: string; esquerda: string; direita: string | null };

/** O bico verde: o vendido, o ritmo de pedidos e o retorno. */
export function bicoDoTotal(total: RelatorioParaTela["total"]): BicoDoFunil {
  const porComprador =
    total.compradores > 0 ? (total.pedidos / total.compradores).toLocaleString("pt-BR", UMA_CASA) : null;
  const pedidos = contagem(total.pedidos, "pedido", "pedidos");
  const r = retorno(total.vendido, total.gasto);
  return {
    valor: dinheiro(total.vendido),
    pedidos,
    esquerda: porComprador ? `${pedidos}, ${porComprador} por comprador` : "nenhum pedido ainda",
    direita: r ? `${r} de retorno` : null,
  };
}

export function notaDeJaMembros(n: number): string | null {
  if (n <= 0) return null;
  return `+${inteiro(n)} se cadastraram já sendo do grupo. Não contam como entrada nova; o que compraram depois do cadastro conta pro anúncio.`;
}

export type FatiaDoFunil = { largura: number; recuo: number };
export type FormaDoFunil = { piso: number; bico: number };

/** Funil grande no computador (mockup Main): degrau de 30% a 100%, bico de 28%. */
export const FUNIL_COMPUTADOR: FormaDoFunil = { piso: 30, bico: 28 };
/** Funil grande no celular (mockup Celular): texto dentro, então o degrau não afina abaixo de 48%. */
export const FUNIL_CELULAR: FormaDoFunil = { piso: 48, bico: 40 };

const duasCasas = (n: number) => Math.round(n * 100) / 100;

/**
 * Geometria de degraus que afinam (spec §4): largura `piso + (100 − piso) × n / topo`,
 * em %, e o recuo (%) de cada lado no fundo do degrau para ele fechar na largura do
 * próximo (o último fecha no `bico`).
 *
 * Um degrau nunca fica mais largo que o de cima: "entraram" pode passar de "foram"
 * (convite repassado) e o funil desenharia uma barriga. O número escrito continua o
 * real; só o desenho satura. Topo zero: todo degrau no piso.
 *
 * Serve também ao mini-funil (PR 6): a "largura" vira altura com outro piso e bico.
 */
export function geometriaDoFunil(valores: readonly number[], forma: FormaDoFunil): FatiaDoFunil[] {
  const topo = valores[0] ?? 0;
  let teto = topo;
  const larguras = valores.map((v) => {
    teto = Math.min(teto, Math.max(0, v));
    return topo > 0 ? forma.piso + ((100 - forma.piso) * teto) / topo : forma.piso;
  });
  return larguras.map((largura, i) => {
    const proxima = Math.min(largura, larguras[i + 1] ?? forma.bico);
    return { largura: duasCasas(largura), recuo: duasCasas(((largura - proxima) / (2 * largura)) * 100) };
  });
}

/** O `clip-path` que fecha o fundo do degrau no recuo. */
export function clipDoDegrau(recuo: number): string {
  return `polygon(0 0, 100% 0, ${duasCasas(100 - recuo)}% 100%, ${recuo}% 100%)`;
}

export type CartaoDeOrigem = { nome: "Instagram" | "Facebook" | "Outros"; cadastros: number; vendido: number };

/** `utm_source` do Meta (`{{site_source_name}}`): ig, fb, an, msg... Os dois grandes, o resto em "Outros". */
function grupoDaOrigem(origem: string | null): CartaoDeOrigem["nome"] {
  const o = (origem ?? "").trim().toLowerCase();
  if (o === "ig" || o === "instagram") return "Instagram";
  if (o === "fb" || o === "facebook") return "Facebook";
  return "Outros";
}

/** Bloco "por onde": só os grupos que tiveram alguma coisa, na ordem fixa. */
export function porOnde(porOrigem: RelatorioParaTela["por_origem"]): CartaoDeOrigem[] {
  const soma = new Map<CartaoDeOrigem["nome"], CartaoDeOrigem>(
    (["Instagram", "Facebook", "Outros"] as const).map((nome) => [nome, { nome, cadastros: 0, vendido: 0 }]),
  );
  for (const o of porOrigem) {
    const atual = soma.get(grupoDaOrigem(o.origem)) as CartaoDeOrigem;
    soma.set(atual.nome, { ...atual, cadastros: atual.cadastros + o.cadastros, vendido: atual.vendido + o.vendido });
  }
  return [...soma.values()].filter((c) => c.cadastros > 0 || c.vendido !== 0);
}

export type DiaDoGrafico = {
  chave: string;
  rotulo: string;
  cadastros: number;
  entraram: number;
  dica: string;
  mostraRotulo: boolean;
};
export type GraficoPorDiaModelo = { dias: DiaDoGrafico[]; teto: number; resumo: string };

/** "2026-09-21" → "21/09". */
export function diaMes(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Quatro rótulos no eixo, nas pontas e nos terços: 90 dias não cabem em 390 px. */
function rotulados(n: number): Set<number> {
  if (n <= 0) return new Set();
  return new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1]);
}

export function graficoPorDia(porDia: RelatorioParaTela["por_dia"]): GraficoPorDiaModelo {
  const comRotulo = rotulados(porDia.length);
  const dias = porDia.map((d, i) => ({
    chave: d.dia,
    rotulo: diaMes(d.dia),
    cadastros: d.cadastros,
    entraram: d.entraram,
    dica: `${diaMes(d.dia)}: ${contagem(d.cadastros, "cadastro", "cadastros")}, ${inteiro(d.entraram)} ${d.entraram === 1 ? "entrou" : "entraram"}`,
    mostraRotulo: comRotulo.has(i),
  }));
  const pico = porDia.reduce((m, d, i) => (d.cadastros > porDia[m].cadastros ? i : m), 0);
  const totalCadastros = porDia.reduce((s, d) => s + d.cadastros, 0);
  const totalEntraram = porDia.reduce((s, d) => s + d.entraram, 0);
  const resumo =
    porDia.length === 0
      ? "Sem dias no período."
      : `Cadastros e entradas por dia, de ${diaMes(porDia[0].dia)} a ${diaMes(porDia[porDia.length - 1].dia)}: ` +
        `${contagem(totalCadastros, "cadastro", "cadastros")} e ${contagem(totalEntraram, "entrada", "entradas")}` +
        (totalCadastros > 0 ? `; pico de ${inteiro(porDia[pico].cadastros)} em ${diaMes(porDia[pico].dia)}.` : ".");
  const maximo = Math.max(0, ...porDia.map((d) => Math.max(d.cadastros, d.entraram)));
  return { dias, teto: tetoDoEixo(maximo), resumo };
}

/** Um lançamento de gasto que começa num dia (PR 7 entrega a lista). */
export type InicioDeGasto = { dia: string; campanha: string };
export type MarcaDoGrafico = { chave: string; posicao: number; texto: string };

/**
 * Anotação de início de campanha no gráfico (spec §4): um traço no começo do dia em
 * que um lançamento de gasto começa. Dia fora do período não aparece; dois começos no
 * mesmo dia dividem o traço.
 */
export function marcasDeGasto(
  porDia: RelatorioParaTela["por_dia"],
  inicios: readonly InicioDeGasto[],
): MarcaDoGrafico[] {
  const n = porDia.length;
  const indice = new Map(porDia.map((d, i) => [d.dia, i]));
  const porData = new Map<string, string[]>();
  for (const inicio of inicios) {
    if (!indice.has(inicio.dia)) continue;
    const lista = porData.get(inicio.dia) ?? [];
    if (!lista.includes(inicio.campanha)) porData.set(inicio.dia, [...lista, inicio.campanha]);
  }
  return [...porData.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dia, campanhas]) => ({
      chave: dia,
      posicao: (indice.get(dia) as number) / n,
      texto: `${diaMes(dia)} · ${campanhas.join(", ")} ${campanhas.length === 1 ? "entrou" : "entraram"} no ar`,
    }));
}

/**
 * Guarda leve do corpo de `GET /api/resultados/anuncios` no cliente. A rota já
 * validou com zod (`lerRelatorioAnuncios`); aqui só se recusa o que não é a resposta.
 */
export function ehRespostaAnuncios(corpo: unknown): corpo is RespostaAnuncios {
  const c = corpo as Partial<RespostaAnuncios> | null;
  return (
    typeof c?.tem_cadastro === "boolean" &&
    typeof c.relatorio?.total?.cadastros === "number" &&
    Array.isArray(c.relatorio.por_dia) &&
    Array.isArray(c.relatorio.por_origem) &&
    Array.isArray(c.relatorio.linhas) &&
    typeof c.relatorio.fora?.entradas_sem_cadastro === "number"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/anuncios-tela.test.ts`
Expected: PASS (19 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/resultados/anuncios-tela.ts apps/web/src/lib/resultados/anuncios-tela.test.ts
git commit -m "feat(resultados): pure rules for the ads tab (formats, funnel geometry, chart, marks)"
```

### Task 6: Componentes da aba

**Files:**
- Create: `apps/web/src/components/painel/resultados/secoes-do-resultados.tsx`
- Create: `apps/web/src/components/painel/resultados/anuncios/funil-grande.tsx`
- Create: `apps/web/src/components/painel/resultados/anuncios/grafico-por-dia.tsx`
- Create: `apps/web/src/components/painel/resultados/anuncios/como-contamos.tsx`
- Create: `apps/web/src/components/painel/resultados/anuncios/aba-anuncios.tsx`
- Test: `apps/web/src/components/painel/resultados/anuncios/aba-anuncios.test.ts`

**Interfaces:**
- Consumes: tudo da Task 5 (gasto `null`, relatório de quem não tem `ads:manage`, sai como "—" pelos formatos, sem link de lançar); `AtalhoDoPeriodo`, `ATALHOS` (Task 2); `RelatorioParaTela`, `RespostaAnuncios` (Task 1); `Carga` de `@/lib/painel/types`; `cn` de `@/lib/utils`.
- Produces:
  - `type SecaoDoResultados = "visao-geral" | "anuncios"`; `SecoesDoResultados({ atual }: { atual: SecaoDoResultados })`
  - `TOM_DO_DEGRAU: readonly [string, string, string, string]` (classes dos quatro degraus); `FunilGrande({ total, descricaoDoPeriodo }: { total: RelatorioParaTela["total"]; descricaoDoPeriodo: string })`
  - `GraficoPorDia({ porDia, inicios }: { porDia: RelatorioParaTela["por_dia"]; inicios: readonly InicioDeGasto[] })`
  - `ComoContamos()`
  - `type PropsDaAbaAnuncios = { atalho; onAtalho; carga: Carga; resposta: RespostaAnuncios | null; hoje: string; aoTentarDeNovo; iniciosDeGasto?; acoesDoCabecalho?: ReactNode; rodapeDoGasto?: ReactNode }`; `AbaAnuncios(props: PropsDaAbaAnuncios)`

Os componentes não leem relógio nem rede: tudo chega por props, por isso o teste renderiza com `renderToStaticMarkup` sem DOM. Largura e recorte de cada degrau vão em variáveis CSS (`--w`/`--clip` no computador, `--w-cel`/`--clip-cel` no celular) e a classe `md:` escolhe — sem JavaScript medindo a janela. O desenho do funil é decorativo; os números, passagens e custos estão em texto (lista `Funil do anúncio à venda`).

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { RelatorioAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { AbaAnuncios, type PropsDaAbaAnuncios } from "./aba-anuncios";

const noop = () => {};

/** O exemplo do mockup (Main.dc.html), com 30 dias de 11/09 a 10/10. */
const RELATORIO: RelatorioAnuncios = {
  periodo: { de: "2026-09-11", ate: "2026-10-10" },
  total: { cadastros: 612, foram: 571, entraram: 498, ja_membros: 34, compradores: 46, pedidos: 58, vendido: 21760, gasto: 2840 },
  linhas: [],
  por_origem: [
    { origem: "ig", cadastros: 356, vendido: 12420 },
    { origem: "fb", cadastros: 238, vendido: 8970 },
    { origem: null, cadastros: 18, vendido: 370 },
  ],
  por_dia: Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 11 + i)).toISOString().slice(0, 10);
    return { dia: d, cadastros: 20, entraram: 16 };
  }),
  fora: { entradas_sem_cadastro: 715, pedidos_sem_origem: 7, vendido_sem_origem: 4120 },
};

/** Espaço sem quebra do Intl ("R$ 21.760") vira espaço comum para o teste ler. */
function html(over: Partial<PropsDaAbaAnuncios> = {}): string {
  const props: PropsDaAbaAnuncios = {
    atalho: "30d",
    onAtalho: noop,
    carga: "ok",
    resposta: { relatorio: RELATORIO, tem_cadastro: true },
    hoje: "2026-10-10",
    aoTentarDeNovo: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(AbaAnuncios, props)).replace(/\u00a0/g, " ");
}

test("carregando: esqueleto anunciado, nenhum número", () => {
  const h = html({ carga: "carregando", resposta: null });
  assert.match(h, /role="status" aria-label="Carregando o funil dos anúncios"/);
  assert.doesNotMatch(h, /Do anúncio à venda|R\$/);
  assert.match(h, /aria-label="Período"/);
});

test("erro: alerta com Tentar de novo, nunca zero", () => {
  const h = html({ carga: "erro", resposta: null });
  assert.match(h, /role="alert"/);
  assert.match(h, /Não deu para carregar o funil dos anúncios\./);
  assert.match(h, />Tentar de novo</);
  assert.doesNotMatch(h, /R\$ 0/);
});

test("erro ao trocar de período não mostra o relatório anterior", () => {
  const h = html({ carga: "erro" });
  assert.doesNotMatch(h, /Do anúncio à venda/);
});

test("vazio: as duas portas de entrada, sem seletor de período", () => {
  const h = html({ resposta: { relatorio: RELATORIO, tem_cadastro: false } });
  assert.match(h, /Ainda não chegou nenhum cadastro com origem/);
  assert.match(h, /href="\/painel\/configuracoes\?secao=integracoes"[^>]*>[\s\S]*Tenho site próprio/);
  assert.match(h, /href="\/painel\/pages\/nova"[^>]*>[\s\S]*Usar uma página da Girumo/);
  assert.doesNotMatch(h, /aria-label="Período"/);
  assert.doesNotMatch(h, /Do anúncio à venda/);
});

test("relatório: seção Anúncios marcada, aviso, faixa, funil, por onde, fora e regras", () => {
  const h = html();
  assert.match(h, /aria-current="page"[^>]*href="\/painel\/resultados\/anuncios"/);
  assert.match(h, /<a class="[^"]*" href="\/painel\/resultados">Visão geral/);
  assert.match(h, /aria-pressed="true"[^>]*>30 dias</);
  assert.match(h, /ainda está comprando/);
  // Faixa.
  assert.match(h, /Gasto lançado<\/p><p[^>]*>R\$ 2\.840</);
  assert.match(h, /Vendido pra quem veio dos anúncios<\/p><p[^>]*>R\$ 21\.760</);
  assert.match(h, /58 pedidos de 46 pessoas/);
  assert.match(h, /7,7×/);
  // Funil: passagem, custo, geometria em variável CSS, bico e nota.
  assert.match(h, /Do anúncio à venda/);
  assert.match(h, /Quem se cadastrou nos últimos 30 dias, acompanhado até hoje/);
  assert.match(h, /93% dos cadastros/);
  assert.match(h, /R\$ 61,74<\/span> <span[^>]*>por comprador/);
  assert.match(h, /--clip:polygon\(0 0, 100% 0, 97\.66% 100%, 2\.34% 100%\)/);
  assert.match(h, /58 pedidos, 1,3 por comprador/);
  assert.match(h, /\+34 se cadastraram já sendo do grupo/);
  // Gráfico, por onde, fora, regras.
  assert.match(h, /role="img" aria-label="Cadastros e entradas por dia, de 11\/09 a 10\/10: 600 cadastros e 480 entradas/);
  assert.match(h, /Instagram<\/p><p[^>]*>356 <span[^>]*>· R\$ 12\.420/);
  assert.match(h, /Outros<\/p><p[^>]*>18 /);
  assert.match(h, />715</);
  assert.match(h, /R\$ 4\.120 <span[^>]*>· 7 pedidos/);
  assert.match(h, /<summary[^>]*>Como cada número é contado<\/summary>/);
});

test("período com zero cadastros numa loja que já teve: frase no lugar do funil, sem geometria", () => {
  const zerado = {
    ...RELATORIO,
    total: { ...RELATORIO.total, cadastros: 0, foram: 0, entraram: 0, ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0 },
    por_origem: [],
  };
  const h = html({ resposta: { relatorio: zerado, tem_cadastro: true } });
  assert.match(h, /Nenhum cadastro com origem neste período/);
  assert.doesNotMatch(h, /--clip:/);
  assert.doesNotMatch(h, /Por onde chegaram/);
});

test("sem gasto: travessão no gasto e no retorno, nenhum custo inventado", () => {
  const h = html({ resposta: { relatorio: { ...RELATORIO, total: { ...RELATORIO.total, gasto: 0 } }, tem_cadastro: true } });
  assert.match(h, /Gasto lançado<\/p><p[^>]*>—</);
  assert.match(h, /nenhum gasto lançado no período/);
  assert.doesNotMatch(h, /por cadastro|por entrada/);
});

test("gasto escondido (operador, sem ads:manage): travessão em gasto, retorno e custos, e nenhum valor de gasto", () => {
  const h = html({ resposta: { relatorio: { ...RELATORIO, total: { ...RELATORIO.total, gasto: null } }, tem_cadastro: true } });
  assert.match(h, /Gasto lançado<\/p><p[^>]*>—</);
  assert.match(h, /só o dono e a administração veem o gasto/);
  assert.match(h, /Retorno<\/p><p[^>]*>—</);
  assert.doesNotMatch(h, /R\$ 2\.840|7,7×|por cadastro|por entrada/);
});

test("vendido negativo aparece como veio", () => {
  const h = html({ resposta: { relatorio: { ...RELATORIO, total: { ...RELATORIO.total, vendido: -40 } }, tem_cadastro: true } });
  assert.match(h, /-R\$ 40/);
});

test("pontos de encaixe do PR 7: ações no cabeçalho, rodapé do gasto e anotação de início no gráfico", () => {
  const h = html({
    acoesDoCabecalho: createElement("button", { type: "button" }, "Lançar gasto"),
    rodapeDoGasto: createElement("span", null, "3 lançamentos"),
    iniciosDeGasto: [{ dia: "2026-09-21", campanha: "VIP Atacado — Brasil" }],
  });
  assert.match(h, /<button type="button">Lançar gasto<\/button>/);
  assert.match(h, /<span>3 lançamentos<\/span>/);
  assert.doesNotMatch(h, /proporcional aos dias do período/);
  assert.match(h, /21\/09 · VIP Atacado — Brasil entrou no ar/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/resultados/anuncios/aba-anuncios.test.ts`
Expected: FAIL — `./aba-anuncios` não existe.

- [ ] **Step 3: Navegação do Resultados**

```tsx
import Link from "next/link";

import { cn } from "@/lib/utils";

export type SecaoDoResultados = "visao-geral" | "anuncios";

const SECOES: ReadonlyArray<{ chave: SecaoDoResultados; rotulo: string; href: string }> = [
  { chave: "visao-geral", rotulo: "Visão geral", href: "/painel/resultados" },
  { chave: "anuncios", rotulo: "Anúncios", href: "/painel/resultados/anuncios" },
];

/**
 * As seções do Resultados (spec 2026-10-10-funil-anuncios §4). Links, não abas:
 * cada seção tem URL própria, que dá para mandar e para voltar no navegador.
 */
export function SecoesDoResultados({ atual }: { atual: SecaoDoResultados }) {
  return (
    <nav aria-label="Seções do Resultados" className="flex gap-1">
      {SECOES.map((s) => (
        <Link
          key={s.chave}
          href={s.href}
          aria-current={s.chave === atual ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center px-3.5 text-15 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt-500",
            s.chave === atual
              ? "font-semibold text-volt-950 shadow-[inset_0_-2px_0_var(--color-cobalt-500)]"
              : "font-medium text-slate-600 hover:text-volt-950",
          )}
        >
          {s.rotulo}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Funil grande**

```tsx
import type { CSSProperties } from "react";

import {
  bicoDoTotal,
  clipDoDegrau,
  degrausDoTotal,
  FUNIL_CELULAR,
  FUNIL_COMPUTADOR,
  geometriaDoFunil,
  inteiro,
  notaDeJaMembros,
  type DegrauDoFunil,
} from "@/lib/resultados/anuncios-tela";
import type { RelatorioParaTela } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";

/** Tons de cobalt que escurecem degrau a degrau (spec §4); o último leva texto claro. O mini-funil (PR 6) usa os mesmos. */
export const TOM_DO_DEGRAU = [
  "bg-cobalt-500/15 text-volt-950",
  "bg-cobalt-500/30 text-volt-950",
  "bg-cobalt-500/50 text-volt-950",
  "bg-cobalt-500 text-paper-0",
] as const;

/** Passagem | degrau | custo no computador; só o degrau, com o texto dentro, no celular. */
const LINHA =
  "grid grid-cols-1 items-center md:grid-cols-[minmax(96px,210px)_minmax(0,1fr)_minmax(96px,210px)] md:gap-x-5";

/**
 * Largura e fundo do degrau mudam com a tela: as duas geometrias vão em variáveis
 * CSS e a classe escolhe qual vale (`md:`), sem JavaScript medindo janela.
 */
function forma(computador: { largura: number; recuo: number }, celular: { largura: number; recuo: number }) {
  return {
    "--w": `${computador.largura}%`,
    "--clip": clipDoDegrau(computador.recuo),
    "--w-cel": `${celular.largura}%`,
    "--clip-cel": clipDoDegrau(celular.recuo),
  } as CSSProperties;
}

/** A linha de dentro do degrau no celular: "93% · R$ 4,97 cada". */
function linhaDoCelular(d: DegrauDoFunil): string {
  return [d.taxa, d.custo ? `${d.custo} cada` : null].filter(Boolean).join(" · ");
}

type Props = { total: RelatorioParaTela["total"]; descricaoDoPeriodo: string };

/**
 * O funil grande da aba Anúncios (spec §4, mockups Main e Celular): degraus que
 * afinam com o número de cada um, a passagem à esquerda, o custo à direita e o bico
 * verde com o vendido. O desenho é decorativo; tudo que ele diz está em texto.
 */
export function FunilGrande({ total, descricaoDoPeriodo }: Props) {
  const degraus = degrausDoTotal(total);
  const valores = degraus.map((d) => d.valor);
  const computador = geometriaDoFunil(valores, FUNIL_COMPUTADOR);
  const celular = geometriaDoFunil(valores, FUNIL_CELULAR);
  const bico = bicoDoTotal(total);
  const nota = notaDeJaMembros(total.ja_membros);

  return (
    <section aria-labelledby="funil-titulo" className="rounded-xl border border-line-200 bg-paper-0 px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="funil-titulo" className="font-brand text-20 font-bold text-volt-950">
          Do anúncio à venda
        </h2>
        <span className="text-13 text-slate-600">Quem se cadastrou {descricaoDoPeriodo}, acompanhado até hoje</span>
      </div>

      {total.cadastros === 0 ? (
        <p className="mt-4 text-15 text-slate-600">
          Nenhum cadastro com origem neste período. Escolha um período maior para ver o funil.
        </p>
      ) : (
        <>
          <div aria-hidden="true" className={cn(LINHA, "mt-4 hidden text-13 text-slate-600 md:grid")}>
            <span className="pb-2 text-right">Passagem do degrau</span>
            <span />
            <span className="pb-2">Custo de cada um</span>
          </div>
          <ol aria-label="Funil do anúncio à venda" className="mt-3 flex flex-col gap-[3px] md:mt-0 md:gap-1">
            {degraus.map((d, i) => (
              <li key={d.chave} className={LINHA}>
                <span className="hidden text-right text-13 text-slate-600 md:block">{d.passagem}</span>
                <div
                  className={cn(
                    "mx-auto flex h-[60px] w-[var(--w-cel)] flex-col items-center justify-center text-center [clip-path:var(--clip-cel)]",
                    "md:h-[76px] md:w-[var(--w)] md:[clip-path:var(--clip)]",
                    TOM_DO_DEGRAU[i],
                  )}
                  style={forma(computador[i], celular[i])}
                >
                  <span className="text-13 font-semibold md:flex md:flex-col md:items-center">
                    <span className="font-brand text-20 font-bold tabular-nums md:text-28">{inteiro(d.valor)}</span>{" "}
                    <span className="md:hidden">{d.rotuloCurto}</span>
                    <span className="hidden md:inline">{d.rotulo}</span>
                  </span>
                  {linhaDoCelular(d) && <span className="text-12 md:hidden">{linhaDoCelular(d)}</span>}
                </div>
                <span className="hidden text-13 md:block">
                  {d.custo ? (
                    <>
                      <span className="font-data text-volt-950">{d.custo}</span>{" "}
                      <span className="text-slate-600">{d.unidadeDoCusto}</span>
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </span>
              </li>
            ))}
            <li className={LINHA}>
              <span className="hidden text-right text-13 text-slate-600 md:block">{bico.esquerda}</span>
              <div
                className="mx-auto flex h-14 w-[var(--w-cel)] flex-col items-center justify-center rounded-b-lg bg-success-700 text-center text-paper-0 md:h-[68px] md:w-[var(--w)]"
                style={{ "--w": `${FUNIL_COMPUTADOR.bico}%`, "--w-cel": `${FUNIL_CELULAR.bico}%` } as CSSProperties}
              >
                <span className="font-brand text-20 font-bold tabular-nums">{bico.valor}</span>
                <span className="text-12 font-semibold md:text-13">
                  <span className="md:hidden">Vendido · {bico.pedidos}</span>
                  <span className="hidden md:inline">Vendido</span>
                </span>
              </div>
              <span className="hidden text-13 md:block">
                {bico.direita ? <span className="font-data text-volt-950">{bico.direita}</span> : <span className="text-slate-600">—</span>}
              </span>
            </li>
          </ol>
          {nota && <p className="mt-4 text-13 text-slate-600">{nota}</p>}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Gráfico por dia**

```tsx
import { graficoPorDia, marcasDeGasto, type InicioDeGasto } from "@/lib/resultados/anuncios-tela";
import type { RelatorioParaTela } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";

type Props = {
  porDia: RelatorioParaTela["por_dia"];
  /** Começos de lançamento de gasto no período (PR 7). Sem eles, nenhuma anotação. */
  inicios: readonly InicioDeGasto[];
};

/**
 * Cadastros × entraram por dia (spec §4), em colunas HTML como o `GraficoDeBarras`
 * da campanha: o texto do eixo fica em 12 px de verdade em qualquer largura. Duas
 * colunas por dia, lado a lado; o dia que começa um lançamento de gasto ganha um
 * traço com o nome da campanha.
 */
export function GraficoPorDia({ porDia, inicios }: Props) {
  const { dias, teto, resumo } = graficoPorDia(porDia);
  const marcas = marcasDeGasto(porDia, inicios);
  const altura = (v: number) => `${(v / teto) * 100}%`;

  return (
    <figure className="m-0 mt-4">
      <div className="flex gap-2">
        <div aria-hidden="true" className="relative h-44 w-7 shrink-0 text-right text-12 tabular-nums leading-none text-slate-600">
          {/* O meio só ganha número quando é inteiro: "2,5 cadastros" não existe. */}
          {[teto, teto / 2, 0].map((m, i) =>
            Number.isInteger(m) ? (
              <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>
                {m.toLocaleString("pt-BR")}
              </span>
            ) : null,
          )}
        </div>
        <div className="relative h-44 min-w-0 flex-1">
          <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
            <span className="block border-t border-dashed border-line-200" />
            <span className="block border-t border-dashed border-line-200" />
            <span className="block border-t border-slate-600/50" />
          </div>
          {/* `div`, não `ol`: `role="img"` apaga a semântica dos filhos e o axe acusa `li` órfão. */}
          <div role="img" aria-label={resumo} className="absolute inset-0 flex items-end gap-[3px]">
            {dias.map((d) => (
              <span key={d.chave} title={d.dica} className="flex h-full min-w-0 flex-1 items-end gap-px">
                <span
                  className="block flex-1 rounded-t-[2px] bg-cobalt-500/30"
                  style={{ height: altura(d.cadastros), minHeight: d.cadastros > 0 ? 2 : 0 }}
                />
                <span
                  className="block flex-1 rounded-t-[2px] bg-cobalt-500"
                  style={{ height: altura(d.entraram), minHeight: d.entraram > 0 ? 2 : 0 }}
                />
              </span>
            ))}
          </div>
          {marcas.map((m) => (
            <span
              key={m.chave}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-slate-600"
              style={{ left: `${m.posicao * 100}%` }}
            >
              <span
                className={cn(
                  "absolute top-0.5 whitespace-nowrap bg-paper-0 px-1 text-12 text-volt-950",
                  // Perto do fim, o rótulo cresce para a esquerda e não sai do cartão.
                  m.posicao > 0.6 ? "right-1.5" : "left-1.5",
                )}
              >
                {m.texto}
              </span>
            </span>
          ))}
        </div>
      </div>
      <ol aria-hidden="true" className="ml-9 mt-1.5 flex h-4 gap-[3px] text-12 text-slate-600">
        {dias.map((d) => (
          <li key={d.chave} className="relative min-w-0 flex-1">
            {d.mostraRotulo && (
              <span className="font-data absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{d.rotulo}</span>
            )}
          </li>
        ))}
      </ol>
      {marcas.length > 0 && <figcaption className="sr-only">{marcas.map((m) => m.texto).join(". ")}</figcaption>}
    </figure>
  );
}
```

- [ ] **Step 6: Como cada número é contado**

```tsx
/**
 * "Como cada número é contado" (spec §1, mockup Regras): a regra única e o que
 * cada número da aba conta. `<details>` nativo: abre e fecha sem JavaScript e o
 * leitor de tela já anuncia o estado.
 */
const REGRAS: ReadonlyArray<readonly [string, string]> = [
  [
    "Cadastros",
    "Cadastros feitos no período, no site da loja e nas páginas da Girumo. O mesmo envio repetido conta uma vez.",
  ],
  [
    "Foram pro grupo",
    "Cadastros cujo link do grupo foi aberto. Cadastros das páginas da Girumo ainda não contam neste degrau.",
  ],
  [
    "Entraram",
    "Entradas no grupo cujo último cadastro da pessoa, até 7 dias antes, é deste anúncio. Pode passar de “foram pro grupo”: convite repassado e página da Girumo entram sem passar pelo link.",
  ],
  ["Já eram membros", "Cadastro feito por quem já estava no grupo. Não conta como entrada nova."],
  [
    "Compraram e vendido",
    "Pedidos cujo último cadastro da pessoa, até 90 dias antes, é deste anúncio. Um pedido nunca conta para dois anúncios.",
  ],
  [
    "Gasto e retorno",
    "Gasto lançado à mão por campanha, proporcional aos dias que caem no período. Retorno = vendido ÷ gasto.",
  ],
  [
    "Gráfico por dia",
    "Cada entrada aparece no dia em que aconteceu, só até o fim do período. O funil conta também quem entrou depois, então a soma do gráfico pode ficar abaixo do funil.",
  ],
  [
    "Fora dos anúncios",
    "Entradas e pedidos do período sem cadastro antes, pela data em que aconteceram. Não soma com o funil, que conta pela data do cadastro.",
  ],
];

export function ComoContamos() {
  return (
    <details className="rounded-xl border border-line-200 bg-paper-0">
      <summary className="flex min-h-11 cursor-pointer items-center px-5 text-15 font-semibold text-cobalt-500 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt-500">
        Como cada número é contado
      </summary>
      <div className="border-t border-line-200 px-5 py-4">
        <p className="text-15 text-volt-950">
          Uma regra só: vale o último cadastro da pessoa antes de cada entrada ou pedido. Pessoa é o telefone (DDD
          + últimos 8 dígitos, com ou sem o nono dígito). O período escolhe os cadastros, e cada um é acompanhado até
          hoje.
        </p>
        <dl className="mt-3 divide-y divide-line-200">
          {REGRAS.map(([nome, regra]) => (
            <div key={nome} className="grid gap-1 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-15 font-semibold text-volt-950">{nome}</dt>
              <dd className="text-15 text-slate-600">{regra}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
```

- [ ] **Step 7: A aba**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

import { SecoesDoResultados } from "@/components/painel/resultados/secoes-do-resultados";
import type { Carga } from "@/lib/painel/types";
import {
  avisoDePeriodoRecente,
  contagem,
  descricaoDoPeriodo,
  dinheiro,
  faixaDoTotal,
  HREF_INTEGRACAO_DO_SITE,
  HREF_NOVA_PAGINA,
  inteiro,
  porOnde,
  ROTULO_DO_ATALHO,
  type CartaoDeOrigem,
  type InicioDeGasto,
} from "@/lib/resultados/anuncios-tela";
import { ATALHOS, type AtalhoDoPeriodo } from "@/lib/resultados/periodo-anuncios";
import type { RelatorioParaTela, RespostaAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";
import { ComoContamos } from "./como-contamos";
import { FunilGrande } from "./funil-grande";
import { GraficoPorDia } from "./grafico-por-dia";

export type PropsDaAbaAnuncios = {
  atalho: AtalhoDoPeriodo;
  onAtalho: (atalho: AtalhoDoPeriodo) => void;
  carga: Carga;
  resposta: RespostaAnuncios | null;
  /** `YYYY-MM-DD` de Brasília: quem chama passa, para a tela não ler o relógio. */
  hoje: string;
  aoTentarDeNovo: () => void;
  /** Começos de lançamento de gasto (PR 7): viram anotação no gráfico por dia. */
  iniciosDeGasto?: readonly InicioDeGasto[];
  /** Botões antes de "Integração do site" no cabeçalho (PR 7: "Lançar gasto"). */
  acoesDoCabecalho?: ReactNode;
  /** Troca o rodapé do cartão "Gasto lançado" (PR 7: "3 lançamentos · lançar"). */
  rodapeDoGasto?: ReactNode;
};

const CARTAO = "rounded-xl border border-line-200 bg-paper-0";
const BOTAO =
  "inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-3.5 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/**
 * Resultados › Anúncios (spec 2026-10-10-funil-anuncios §4). Só desenha: a página
 * busca `GET /api/resultados/anuncios` e passa a carga. Erro nunca vira zero (padrão
 * `carga` da Vitrine); loja sem nenhum cadastro vê a tela Vazio, não um funil zerado.
 */
export function AbaAnuncios({
  atalho,
  onAtalho,
  carga,
  resposta,
  hoje,
  aoTentarDeNovo,
  iniciosDeGasto = [],
  acoesDoCabecalho,
  rodapeDoGasto,
}: PropsDaAbaAnuncios) {
  const vazio = carga === "ok" && resposta !== null && !resposta.tem_cadastro;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Resultados</h1>
          <p className="mt-1 text-15 text-slate-600">Qual anúncio trouxe quem comprou, pelo telefone do cadastro.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {acoesDoCabecalho}
          <Link href={HREF_INTEGRACAO_DO_SITE} className={BOTAO}>
            Integração do site
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-200">
        <SecoesDoResultados atual="anuncios" />
        {!vazio && <SeletorDePeriodo atalho={atalho} onAtalho={onAtalho} />}
      </div>

      {carga === "erro" ? (
        <Erro aoTentarDeNovo={aoTentarDeNovo} />
      ) : carga === "carregando" || resposta === null ? (
        <Esqueleto />
      ) : !resposta.tem_cadastro ? (
        <Vazio />
      ) : (
        <Relatorio
          relatorio={resposta.relatorio}
          atalho={atalho}
          hoje={hoje}
          iniciosDeGasto={iniciosDeGasto}
          rodapeDoGasto={rodapeDoGasto}
        />
      )}
    </div>
  );
}

function SeletorDePeriodo({ atalho, onAtalho }: { atalho: AtalhoDoPeriodo; onAtalho: (a: AtalhoDoPeriodo) => void }) {
  return (
    <div role="group" aria-label="Período" className="mb-2 flex rounded-lg bg-canvas-100 p-0.5">
      {ATALHOS.map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={atalho === a}
          onClick={() => onAtalho(a)}
          className={cn(
            "min-h-8 rounded-md px-3 text-13 font-semibold transition-colors",
            atalho === a ? "bg-paper-0 text-volt-950" : "text-slate-600 hover:text-volt-950",
          )}
        >
          {ROTULO_DO_ATALHO[a]}
        </button>
      ))}
    </div>
  );
}

function Relatorio({
  relatorio,
  atalho,
  hoje,
  iniciosDeGasto,
  rodapeDoGasto,
}: {
  relatorio: RelatorioParaTela;
  atalho: AtalhoDoPeriodo;
  hoje: string;
  iniciosDeGasto: readonly InicioDeGasto[];
  rodapeDoGasto?: ReactNode;
}) {
  const aviso = avisoDePeriodoRecente(relatorio.periodo.ate, hoje);
  const origens = porOnde(relatorio.por_origem);

  return (
    <>
      {aviso && (
        <p className="pn-aviso rounded-lg" role="status">
          {aviso}
        </p>
      )}
      <Faixa total={relatorio.total} rodapeDoGasto={rodapeDoGasto} />
      <FunilGrande total={relatorio.total} descricaoDoPeriodo={descricaoDoPeriodo(atalho)} />
      <section aria-labelledby="dia-titulo" className={cn(CARTAO, "px-4 py-5 md:px-6")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dia-titulo" className="font-brand text-20 font-bold text-volt-950">
            Cadastros e entradas por dia
          </h2>
          <span className="flex gap-3.5 text-13 text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-cobalt-500/30" />
              Cadastros
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-cobalt-500" />
              Entraram
            </span>
          </span>
        </div>
        <GraficoPorDia porDia={relatorio.por_dia} inicios={iniciosDeGasto} />
        {origens.length > 0 && <PorOnde origens={origens} />}
      </section>
      <Fora fora={relatorio.fora} />
      <ComoContamos />
    </>
  );
}

/** Os três números do topo. No celular a faixa rola de lado (spec §4, mockup Celular). */
function Faixa({ total, rodapeDoGasto }: { total: RelatorioParaTela["total"]; rodapeDoGasto?: ReactNode }) {
  return (
    <section
      aria-label="Números do período"
      // Rola no celular: precisa receber foco para quem navega por teclado.
      tabIndex={0}
      className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 focus-visible:outline-2 focus-visible:outline-cobalt-500 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0"
    >
      {faixaDoTotal(total).map((c) => (
        <div key={c.chave} className={cn(CARTAO, "min-w-[220px] shrink-0 snap-start px-[18px] py-4 md:min-w-0")}>
          <p className="text-13 text-slate-600">{c.rotulo}</p>
          <p
            className={cn(
              "font-brand mt-1.5 text-32 font-bold tabular-nums tracking-[-0.5px]",
              c.sucesso ? "text-success-700" : "text-volt-950",
            )}
          >
            {c.valor}
          </p>
          <p className="mt-0.5 text-13 text-slate-600">
            {c.chave === "gasto" && rodapeDoGasto ? rodapeDoGasto : c.detalhe}
          </p>
        </div>
      ))}
    </section>
  );
}

function PorOnde({ origens }: { origens: readonly CartaoDeOrigem[] }) {
  return (
    <ul aria-label="Por onde chegaram" className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {origens.map((o) => (
        <li key={o.nome} className="rounded-lg bg-canvas-100 px-3 py-2.5">
          <p className="text-13 text-slate-600">{o.nome}</p>
          <p className="font-brand mt-0.5 text-20 font-bold tabular-nums text-volt-950">
            {inteiro(o.cadastros)} <span className="text-13 font-medium text-slate-600">· {dinheiro(o.vendido)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function Fora({ fora }: { fora: RelatorioParaTela["fora"] }) {
  return (
    <section aria-labelledby="fora-titulo" className={cn(CARTAO, "px-4 py-5 md:px-6")}>
      <h2 id="fora-titulo" className="font-brand text-20 font-bold text-volt-950">
        No mesmo período, fora dos anúncios
      </h2>
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-canvas-100 px-4 py-3.5">
          <p className="text-13 text-slate-600">Entraram sem cadastro antes</p>
          <p className="font-brand my-1 text-28 font-bold tabular-nums text-volt-950">
            {inteiro(fora.entradas_sem_cadastro)}
          </p>
          <p className="text-13 text-slate-600">Convite repassado, link direto ou contato sem telefone.</p>
        </div>
        <div className="rounded-lg bg-canvas-100 px-4 py-3.5">
          <p className="text-13 text-slate-600">Vendas sem origem</p>
          <p className="font-brand my-1 text-28 font-bold tabular-nums text-volt-950">
            {dinheiro(fora.vendido_sem_origem)}{" "}
            <span className="text-15 font-medium text-slate-600">
              · {contagem(fora.pedidos_sem_origem, "pedido", "pedidos")}
            </span>
          </p>
          <p className="text-13 text-slate-600">Quem comprou sem ter se cadastrado nos 90 dias antes.</p>
        </div>
      </div>
      <p className="mt-3.5 text-13 text-slate-600">
        Aqui conta a data da entrada ou do pedido. O funil acima conta a data do cadastro, então os dois não somam
        com a Visão geral.
      </p>
    </section>
  );
}

function Erro({ aoTentarDeNovo }: { aoTentarDeNovo: () => void }) {
  return (
    <div className={cn(CARTAO, "p-6")} role="alert">
      <p className="text-15 text-volt-950">Não deu para carregar o funil dos anúncios.</p>
      <p className="mt-1 text-13 text-slate-600">Seus cadastros e vendas continuam registrados.</p>
      <button type="button" onClick={aoTentarDeNovo} className={cn(BOTAO, "mt-3")}>
        Tentar de novo
      </button>
    </div>
  );
}

function Esqueleto() {
  return (
    <div role="status" aria-label="Carregando o funil dos anúncios" className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pn-skeleton h-28 rounded-xl" />
        ))}
      </div>
      <div className="pn-skeleton h-80 rounded-xl" />
    </div>
  );
}

function OpcaoDoVazio({ href, titulo, texto, acao }: { href: string; titulo: string; texto: string; acao: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border border-line-200 bg-paper-0 p-4 transition-colors hover:border-cobalt-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
    >
      <span className="text-15 font-semibold text-volt-950">{titulo}</span>
      <span className="text-13 text-slate-600">{texto}</span>
      <span className="mt-1 text-13 font-semibold text-cobalt-500">{acao} →</span>
    </Link>
  );
}

/** Loja que nunca recebeu cadastro com origem (spec §4 "Vazio", mockup Vazio). */
function Vazio() {
  return (
    <section aria-labelledby="vazio-titulo" className={cn(CARTAO, "grid gap-6 p-6 md:grid-cols-[1.2fr_1fr]")}>
      <div>
        <h2 id="vazio-titulo" className="font-brand text-20 font-bold text-volt-950">
          Ainda não chegou nenhum cadastro com origem
        </h2>
        <p className="mt-2 text-15 text-slate-600">
          Pra saber qual anúncio traz gente pro grupo e qual traz venda, a Girumo precisa do telefone de quem se
          cadastrou e dos parâmetros do anúncio. Escolha por onde eles chegam:
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-15 text-volt-950">
          <li>Cadastro passa pela Girumo: seu site ou uma página nossa.</li>
          <li>Os anúncios levam os parâmetros de URL.</li>
          <li>Venda lançada no contato, como já é hoje.</li>
        </ol>
      </div>
      <div className="flex flex-col gap-3">
        <OpcaoDoVazio
          href={HREF_INTEGRACAO_DO_SITE}
          titulo="Tenho site próprio"
          texto="O site manda o cadastro pra Girumo e recebe o link do grupo. Pede uma mudança pequena no site."
          acao="Conectar o site"
        />
        <OpcaoDoVazio
          href={HREF_NOVA_PAGINA}
          titulo="Usar uma página da Girumo"
          texto="Já vem com cadastro e origem. Não precisa programar nada."
          acao="Criar página"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/resultados/anuncios/aba-anuncios.test.ts src/lib/painel/vitrine-lint.test.ts`
Expected: PASS (10 testes da aba; o `vitrine-lint` continua verde — ele varre `src/components/painel`).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/painel/resultados/secoes-do-resultados.tsx apps/web/src/components/painel/resultados/anuncios
git commit -m "feat(resultados): ads tab components (strip, stepped funnel, daily chart, sources, outside, empty)"
```

### Task 7: Página, navegação na Visão geral, smoke, gate e PR 5b

**Files:**
- Create: `apps/web/src/app/painel/resultados/anuncios/page.tsx`
- Modify: `apps/web/src/components/painel/resultados/vitrine/resultados-vitrine.tsx` (import + navegação depois do `<header>`)
- Modify: `apps/web/e2e/conteudo-esperado.ts` (entrada nova depois de `"/painel/resultados"`)
- Create: `apps/web/e2e/painel-anuncios.spec.ts` (E2E de cadeia, spec §8)

**Interfaces:**
- Consumes: `AbaAnuncios` (Task 6); `SecoesDoResultados` (Task 6); `ehRespostaAnuncios` (Task 5); `periodoDoAtalho`, `AtalhoDoPeriodo` (Task 2); `buscar(url, valido, guardar, marcar)` de `@/lib/painel/carregar`; `dayBR()`.
- Produces: rota de página `/painel/resultados/anuncios`.

- [ ] **Step 1: A página**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AbaAnuncios } from "@/components/painel/resultados/anuncios/aba-anuncios";
import { dayBR } from "@/lib/date-br";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import { ehRespostaAnuncios } from "@/lib/resultados/anuncios-tela";
import { periodoDoAtalho, type AtalhoDoPeriodo } from "@/lib/resultados/periodo-anuncios";
import type { RespostaAnuncios } from "@/lib/resultados/relatorio-anuncios";

/**
 * Resultados › Anúncios (spec 2026-10-10-funil-anuncios §4). Uma consulta só,
 * `GET /api/resultados/anuncios`, refeita a cada troca de período.
 */
export default function PainelResultadosAnuncios() {
  const [atalho, setAtalho] = useState<AtalhoDoPeriodo>("30d");
  const [resposta, setResposta] = useState<RespostaAnuncios | null>(null);
  const [carga, setCarga] = useState<Carga>("carregando");
  // Trocar de período rápido dispara duas buscas; só a última pode escrever na tela,
  // senão a de 7 dias que chegou atrasada pinta o funil com o botão "90 dias" marcado.
  const ultima = useRef(0);

  const carregar = useCallback(() => {
    const esta = ++ultima.current;
    const { de, ate } = periodoDoAtalho(atalho, new Date());
    void buscar(
      `/api/resultados/anuncios?de=${de}&ate=${ate}`,
      ehRespostaAnuncios,
      (r) => {
        if (esta === ultima.current) setResposta(r);
      },
      (c) => {
        if (esta === ultima.current) setCarga(c);
      },
    );
  }, [atalho]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <AbaAnuncios
      atalho={atalho}
      onAtalho={setAtalho}
      carga={carga}
      resposta={resposta}
      hoje={dayBR()}
      aoTentarDeNovo={carregar}
    />
  );
}
```

- [ ] **Step 2: A Visão geral ganha a navegação** — em `resultados-vitrine.tsx`, acrescentar o import junto dos outros `@/…` (antes de `import { cn } from "@/lib/utils";`):

```tsx
import { SecoesDoResultados } from "@/components/painel/resultados/secoes-do-resultados";
```

e, logo depois do `</header>` do retorno principal (o que tem `<h1 …>Resultados</h1>` e "Do clique ao cliente — sem número inflado."):

```tsx
      <div className="border-b border-line-200">
        <SecoesDoResultados atual="visao-geral" />
      </div>
```

O esqueleto da Visão geral (o `return` de `cena === "carregando"`) fica como está.

- [ ] **Step 3: Âncora da rota nova no smoke** — a varredura do `painel-rotas.spec.ts` acha a página sozinha e **quebra a suite** sem declaração. Em `e2e/conteudo-esperado.ts`, depois da entrada `"/painel/resultados"`:

```ts
  "/painel/resultados/anuncios": {
    // Só existe com a resposta da rota na tela: o funil (loja com cadastro) ou a tela
    // Vazio (loja de QA, sem cadastro). Nenhum dos dois aparece no esqueleto nem no erro.
    ancora: /Do anúncio à venda|Ainda não chegou nenhum cadastro com origem/,
    semLista:
      "Agrega cadastros, entradas e pedidos em funil; quem confere o número contra o banco é o teste de integração de attribution_report.",
  },
```

- [ ] **Step 3b: E2E da cadeia** (spec §8) — a âncora acima passa tanto com o funil quanto com a Vazio, então sozinha não prova que o relatório chega à tela. Este spec planta um cadastro no tenant de QA pelo service role (mesmo molde de `e2e/vendas-vendedora.spec.ts`: `createClient` com `E2E_SUPABASE_URL`/`E2E_SUPABASE_SERVICE_ROLE_KEY`, tenant de QA por `GET /api/auth/me` com `ESTADO_LOGADO`), abre a aba e limpa no fim. Roda no projeto `chromium` (dono de QA logado) do job e2e, contra o banco dev:

```ts
import { randomBytes, randomInt } from "node:crypto";

import { expect, request as novoRequest, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * A cadeia da spec 2026-10-10-funil-anuncios §8, do banco à tela: um cadastro com
 * campanha gravado em `site_captures` do tenant de QA aparece na aba Anúncios.
 *
 * A âncora do smoke (`conteudo-esperado.ts`) aceita o funil OU a tela Vazio, então
 * sozinha não prova que o relatório chega à tela. Aqui o dado é plantado pelo
 * service role (molde: `vendas-vendedora.spec.ts`), com `event_id` e campanha de
 * sufixo sorteado, e sai no afterAll. O nome da campanha é conferido na resposta da
 * rota: a tabela por campanha só chega no PR 6, que passa a cobrar o nome na tela.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);
/** Só o que este spec cria começa assim: a limpeza não toca em mais nada. */
const PREFIXO = "e2e-anuncios-";
const UMA_HORA_MS = 3_600_000;

type Resposta = {
  tem_cadastro: boolean;
  relatorio: { total: { cadastros: number }; linhas: Array<{ nivel: string; campanha: string | null; cadastros: number }> };
};

function bancoDeDev(): SupabaseClient {
  return createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** A loja em que o usuário de QA cai ao logar: é o tenant que a aba vai ler. */
async function lojaDeQa(): Promise<string> {
  const api = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
  try {
    const res = await api.get("/api/auth/me");
    if (!res.ok()) throw new Error(`GET /api/auth/me do usuário de QA respondeu ${res.status()}`);
    const me = (await res.json()) as { tenantId?: string | null };
    if (!me.tenantId) throw new Error("o usuário de QA não tem loja");
    return me.tenantId;
  } finally {
    await api.dispose();
  }
}

test.describe("aba Anúncios: cadastro gravado no banco chega ao funil", () => {
  test.skip(
    !TEM_CREDENCIAIS || !TEM_BANCO,
    "Precisa do usuário de QA (E2E_EMAIL/E2E_PASSWORD) e da service role de dev (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).",
  );

  const sufixo = randomBytes(6).toString("hex");
  const eventId = `${PREFIXO}${sufixo}`;
  const campanha = `E2E Anúncios ${sufixo}`;
  let banco: SupabaseClient | undefined;
  let loja = "";

  test.beforeAll(async () => {
    banco = bancoDeDev();
    loja = await lojaDeQa();
    // Resto de execução que morreu antes do afterAll. Mais de uma hora: não pega um run vivo em paralelo.
    const { error: erroVelhos } = await banco
      .from("site_captures")
      .delete()
      .eq("tenant_id", loja)
      .like("event_id", `${PREFIXO}%`)
      .lt("created_at", new Date(Date.now() - UMA_HORA_MS).toISOString());
    if (erroVelhos) throw new Error(`limpeza de cadastros velhos: ${erroVelhos.message}`);

    const { error } = await banco.from("site_captures").insert({
      tenant_id: loja,
      whatsapp: `+55629${String(randomInt(10_000_000, 100_000_000))}`,
      event_id: eventId,
      utm_source: "ig",
      utm_campaign: campanha,
      page_url: `https://e2e.example/vip?utm_source=ig&utm_campaign=${encodeURIComponent(campanha)}`,
    });
    if (error) throw new Error(`insert em site_captures: ${error.message}`);
  });

  test.afterAll(async () => {
    if (!banco || !loja) return;
    const { error } = await banco.from("site_captures").delete().eq("tenant_id", loja).eq("event_id", eventId);
    if (error) throw new Error(`limpeza do cadastro ${eventId}: ${error.message}`);
  });

  test("o funil mostra pelo menos o cadastro plantado, e a resposta traz a campanha", async ({ page }) => {
    const chegou = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/resultados/anuncios" && r.request().method() === "GET",
    );
    await page.goto("/painel/resultados/anuncios", { waitUntil: "load" });

    const resposta = await chegou;
    expect(resposta.status()).toBe(200);
    const corpo = (await resposta.json()) as Resposta;
    expect(corpo.tem_cadastro).toBe(true);
    expect(corpo.relatorio.linhas).toContainEqual(
      expect.objectContaining({ nivel: "campanha", campanha, cadastros: 1 }),
    );

    // A tela: funil (não a tela Vazio) e o degrau de cima com pelo menos 1.
    await expect(page.getByRole("heading", { name: "Do anúncio à venda" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Ainda não chegou nenhum cadastro com origem" })).toHaveCount(0);
    const topo = page.getByRole("list", { name: "Funil do anúncio à venda" }).getByRole("listitem").first();
    const numero = (await topo.innerText()).match(/\d[\d.]*/)?.[0] ?? "0";
    expect(Number(numero.replace(/\./g, ""))).toBeGreaterThanOrEqual(1);
  });
});
```

O nome da campanha é cobrado na resposta da rota porque a tela do 5b não o escreve; o PR 6 (tabela) acrescenta a cobrança na tela. Local, com o dev server de pé e as credenciais de QA e a service role de dev no ambiente: `npx playwright test e2e/painel-anuncios.spec.ts --project=chromium`. Sem elas o spec pula (como o da vendedora); no CI ele roda.

- [ ] **Step 4: Ver a tela** — `npm run dev` neste worktree (dev local usa Supabase: `HUBFLOW_USE_SUPABASE=1`), entrar como dono da loja de QA e abrir `/painel/resultados/anuncios` em 1280 px e em 390 px. Conferir: navegação com "Anúncios" sublinhado; a tela Vazio (a loja de QA não tem cadastro) com as duas portas; na "Visão geral" a navegação aparece e leva de volta. O funil cheio é conferido pelo teste da Task 6 e pela prova em prod (Step 8). O `preview_start` serve o checkout principal, não o worktree: para captura, use o Playwright do repo.

- [ ] **Step 5: Gate local** (em `apps/web`)

Run: `npm run lint` · `npx tsc --noEmit --project tsconfig.json` · `npx tsc --noEmit --project tsconfig.e2e.json` · `npm test`
Expected: tudo verde.

Depois, em PowerShell:

```
Set-Location <caminho do worktree pr5b>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/painel/resultados/anuncios/page.tsx apps/web/src/components/painel/resultados/vitrine/resultados-vitrine.tsx apps/web/e2e/conteudo-esperado.ts apps/web/e2e/painel-anuncios.spec.ts
git commit -m "feat(resultados): Anúncios tab page, section nav and signup-to-funnel E2E"
```

- [ ] **Step 7: PR** — push e PR "feat(resultados): aba Anúncios no Resultados (funil de anúncios, PR 5b)", com print em 1280 e 390 px e a lista de encaixes para os PRs 6 e 7, terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. CI verde (o smoke `painel-rotas` abre `/painel/resultados/anuncios` e cobra a âncora; `painel-anuncios.spec.ts` planta o cadastro e cobra o funil — os dois contra o banco dev) → mergear → apagar a branch.

- [ ] **Step 8: Prova em prod depois do deploy** — dono da loja-piloto em `/painel/resultados/anuncios`:
  - com cadastro do site já chegando: funil com os mesmos números do `fetch` do PR 5a para o mesmo período; trocar 7/30/90 dias/Este mês refaz a consulta;
  - sem cadastro ainda: a tela Vazio;
  - em 390 px: faixa rola de lado, funil em pé com o texto dentro;
  - "Como cada número é contado" abre e fecha.

- [ ] **Step 9: Card** (prod): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 5b: aba Anúncios no ar (faixa, funil, gráfico, por onde, fora, vazio); tabela e gaveta no PR 6', 'PR #<n>');`

- [ ] **Step 10: Grafo** (PowerShell, do checkout principal):

```powershell
rag insert "decisão: na aba Anúncios do Resultados, gasto de anúncio só sai para quem tem ads:manage (owner/admin); GET /api/resultados/anuncios passa o relatório por semGasto (tipo RelatorioParaTela) para os outros papéis, sem mudar o SQL; o contrato do SQL continua estrito no gasto e aceita vendido negativo" --source decisao-2026-10-11
rag insert "decisão: a aba Anúncios mostra a tela Vazio só quando a loja nunca recebeu cadastro (tem_cadastro, limit 1 em site_captures e lp_captures); período sem cadastro mostra o funil com aviso; degrau maior que o de cima não vira taxa acima de 100% e o desenho satura" --source decisao-2026-10-11
rag insert "decisão: por_dia.entraram do attribution_report conta a entrada no dia em que aconteceu, só até o fim do período; o funil conta até hoje; a diferença é explicada em 'Como cada número é contado', não corrigida" --source decisao-2026-10-11
```

- [ ] **Step 11:** Reportar ao encerrar: "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Interfaces para os PRs 6 e 7

**Rota e tipos**

- `GET /api/resultados/anuncios?de=YYYY-MM-DD&ate=YYYY-MM-DD` → `RespostaAnuncios = { relatorio: RelatorioParaTela; tem_cadastro: boolean }` (tipos em `@/lib/resultados/relatorio-anuncios`; `RelatorioAnuncios` é o contrato estrito do SQL; `LinhaRelatorio`, `NivelLinha` no mesmo arquivo). As linhas vêm ordenadas por campanha › conjunto › anúncio, nível campanha primeiro; `gasto` só no nível campanha.
- Período: `periodoDoAtalho`, `AtalhoDoPeriodo`, `ATALHOS`, `Periodo`, `diasEntre`, `somarDias`, `dataValida` em `@/lib/resultados/periodo-anuncios`.
- Store: `relatorioDeAnuncios(tenantId, periodo)`, `temCadastroComOrigem(tenantId)`, `PeriodoRecusado` em `@/lib/stores/relatorio-de-anuncios`.
- **`"ads:manage": ["owner", "admin"]` já existe em `@/lib/permissions` a partir do 5a.** O PR 7 só usa: `assertPermission(ctx.role, "ads:manage")` em todo verbo de `/api/anuncios/gasto`, inclusive o GET. `semGasto(relatorio)` está em `@/lib/resultados/relatorio-anuncios`, e a rota do relatório já o aplica a quem não tem a ação: `total.gasto` e `linhas[].gasto` chegam `null`.

**Formatos e geometria** (`@/lib/resultados/anuncios-tela`)

- `dinheiro`, `custo`, `inteiro`, `contagem(n, um, varios)`, `porcentagem(parte, todo)`, `retorno(vendido, gasto)`, `custoPor(gasto, n)`, `diaMes(dia)`.
- `geometriaDoFunil(valores, { piso, bico })` → `{ largura, recuo }[]` e `clipDoDegrau(recuo)` → `polygon(...)`. O mini-funil A (PR 6, deitado) usa a "largura" como **altura** com `{ piso: 22, bico: 16 }` (mockup MiniFunil: `0.22 + 0.78 × n/n0`, bico 0,16); o B (cartão no celular) usa `{ piso: 40, bico: 36 }`. A saturação (degrau nunca maior que o de cima) já vem de graça.
- `TOM_DO_DEGRAU` em `@/components/painel/resultados/anuncios/funil-grande` — as quatro classes de cor dos degraus (cadastros → compraram), para o mini-funil usar os mesmos tons.
- `degrausDoTotal(total)`, `bicoDoTotal(total)` e `faixaDoTotal(total)` aceitam `gasto: number | null`, então uma `LinhaRelatorio` entra direto: conjunto e anúncio (gasto `null`) e qualquer linha do relatório sem `ads:manage` saem com custos e retorno `null` → "—", como a spec pede.

**PR 6 — tabela, gaveta, cartões B**

- Encaixe: em `aba-anuncios.tsx`, função `Relatorio`, entre a `<section aria-labelledby="dia-titulo">` e `<Fora fora={relatorio.fora} />`. Ela já recebe `relatorio: RelatorioParaTela` (`relatorio.linhas`). No computador a tabela; abaixo de `md` os cartões B (`md:hidden` / `hidden md:block`).
- Não mexer em `FunilGrande` nem no contrato da rota; a gaveta busca o que precisar numa rota própria.
- A gaveta mascara telefone com `telefoneMascarado` de `@/lib/pages/phone` ("(62) 9••••-4821"), criado no **PR 3a** (`2026-10-10-funil-anuncios-pr3-integracao-tela.md`). Por isso o PR 6 depende do 3a mergeado, além do 5b.

**PR 7 — gasto**

- Página (`app/painel/resultados/anuncios/page.tsx`): buscar `GET /api/anuncios/gasto` só para quem tem `ads:manage` (`useRole()` + `hasPermission`) e passar à `AbaAnuncios` — para os outros papéis, nenhum dos três:
  - `acoesDoCabecalho` — o botão "Lançar gasto" que abre o diálogo (vai antes de "Integração do site");
  - `rodapeDoGasto` — substitui o texto do cartão "Gasto lançado" (ex.: "3 lançamentos · lançar");
  - `iniciosDeGasto: InicioDeGasto[]` — `{ dia: starts_on, campanha: utm_campaign }` de cada lançamento; `marcasDeGasto` descarta o que cai fora do período e junta o mesmo dia.
  - Depois de salvar/editar/excluir um lançamento, chamar o `carregar()` da página para o relatório refazer o gasto proporcional.
- **Gasto para operador:** resolvido no 5a. A rota do relatório manda `gasto: null` a quem não tem `ads:manage` e a tela mostra "—" com "só o dono e a administração veem o gasto". O PR 7 não mexe nisso; só não passa `rodapeDoGasto`, `acoesDoCabecalho` nem `iniciosDeGasto` a esses papéis.
- Lista de campanhas do diálogo: os `utm_campaign` distintos das linhas de nível `campanha` do relatório (`relatorio.linhas.filter(l => l.nivel === "campanha" && l.campanha)`), mais o que a rota de gasto devolver.

