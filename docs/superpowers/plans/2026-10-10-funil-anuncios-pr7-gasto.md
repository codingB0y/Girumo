# Funil de anúncios — PR 7: lançar gasto de anúncio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono (ou a administração) abre Resultados › Anúncios, clica em "Lançar gasto", escolhe a campanha entre os nomes que já chegaram nos cadastros, digita o valor usado e o período, e o relatório passa a mostrar gasto, retorno e custo por degrau; a lista de lançamentos edita e exclui; o gráfico por dia marca o dia em que cada lançamento começa.

**Architecture:** Duas rotas (`/api/anuncios/gasto` com GET/POST e `/api/anuncios/gasto/[id]` com PATCH/DELETE), todas atrás de `ads:manage`, sobre um store de `ad_spend` que filtra `tenant_id` em toda query. A lista de campanhas sai do próprio `attribution_report` (janela máxima de 400 dias), que agrega no banco: sem DDL e sem o teto de 1000 linhas do PostgREST. Regras de formulário, valor em R$, lista de campanhas e formatos ficam numa função pura testada; o diálogo usa a `Folha` do painel e só desenha; a página liga tudo nos três encaixes que o PR 5b deixou na `AbaAnuncios`.

**Tech Stack:** Next 15 App Router (route handlers + página cliente), Supabase service-role (PostgREST + `rpc`), zod 4, Tailwind 4 (tema G2), `node:test` + `react-dom/server` (`renderToStaticMarkup`), Playwright (job e2e do CI).

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md` (§1 "Gasto proporcional", §3 "Gasto", §4 "Lançar gasto", §6 "Gasto lançado para nome que nunca chegou", §7 segurança). Mockup: `scratchpad/mockup/project/Gasto.dc.html` (diálogo) e `Main.dc.html` (botão no cabeçalho, rodapé "3 lançamentos · lançar"), só referência visual.

**Depende de:** PR 1 (`ad_spend` e `attribution_report` nos dois bancos), PR 5a (`ads:manage`, `relatorioDeAnuncios`, `periodo-anuncios.ts`) e PR 5b (`AbaAnuncios` com os encaixes, `anuncios-tela.ts`, a página). Não depende do PR 6 (tabela e gaveta); os dois mexem em arquivos diferentes, exceto se o PR 6 tocar `app/painel/resultados/anuncios/page.tsx` — ver Task 4, Step 1. Índice: `docs/superpowers/plans/2026-10-10-funil-anuncios-00-indice.md`.

## Tamanho

Um PR, 10 arquivos (8 novos, 2 alterados — ver a tabela "Arquivos"). Cabe na regra de ~10. Branch `feat/funil-anuncios-pr7-gasto`, de `origin/main` **depois** do 5b mergeado.

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| **A lista de campanhas vem do `attribution_report` dos últimos 400 dias** (a janela máxima que o SQL aceita), pelo `GET /api/anuncios/gasto`, unida aos nomes dos lançamentos que já existem | O relatório já agrega `utm_campaign` (aparado com `btrim`) de `site_captures` **e** das páginas `/p/` no banco: nenhuma linha crua vem para o Node, então o teto de 1000 do PostgREST não corta nada. `select distinct` não existe no PostgREST; ler `site_captures` e deduplicar no Node cortaria em 1000 cadastros. Sem DDL | Uma consulta do relatório inteiro a mais por abertura da aba (só para dono/admin) e a cada lançamento salvo. Campanha que só chegou há mais de 400 dias não aparece na lista (a não ser que já tenha lançamento) |
| **A API aceita qualquer nome de 1 a 200 caracteres** (aparado); só a tela limita à lista | Conferir contra a lista no POST pediria rodar o relatório a cada gravação. E a spec §6 já prevê o nome que nunca chegou: vira linha de campanha só com gasto | Um nome digitado à mão pela API que nunca chega aparece como linha só com gasto — que é o comportamento desenhado |
| **PATCH troca os quatro campos** (mesmo corpo do POST), não é parcial | A regra `ends_on >= starts_on` precisa das duas datas; PATCH parcial obrigaria ler a linha antes e casar com o corpo. O formulário de edição sempre manda tudo | O cliente que um dia quiser mudar só o valor precisa mandar os quatro campos |
| **Valor em R$ reaproveita `parseValorDoPedido`**, com uma exceção: `1.620` (só grupos de milhar, sem vírgula) é mil seiscentos e vinte. E o campo mostra o valor lido ("= R$ 1.620,00") enquanto se digita | O Gerenciador mostra "R$1.620,00"; quem digita sem os centavos escreve "1.620", que o parser dos pedidos leria como R$ 1,62 — um gasto mil vezes menor, retorno mil vezes maior, em silêncio | Quem quis dizer R$ 1,62 digitando "1.620" grava R$ 1.620 — mas vê "= R$ 1.620,00" antes de salvar |
| **Excluir confirma na própria linha** ("Excluir este lançamento?" · Excluir · Manter), não com `useConfirmacao` | `useConfirmacao` abre outra `Folha` por cima do diálogo: duas armadilhas de foco no `document` disputam o Tab, e a de baixo puxa o foco de volta | Nenhum |
| **A anotação no gráfico vem dos lançamentos** (`starts_on` + `utm_campaign` de `GET /api/anuncios/gasto`, por `iniciosDosLancamentos`), não do relatório | O relatório só traz a soma proporcional por campanha, sem datas. `marcasDeGasto` (PR 5b) descarta o começo fora do período e junta o mesmo dia | Lançamento que começa antes do período e entra nele não ganha marca — a spec pede marca no dia que **começa** |
| **O diálogo nasce com as datas do período da aba** e **sem campanha escolhida** (opção vazia "Escolha a campanha…") | O subtítulo manda copiar o "Valor usado" "no mesmo período"; a aba já diz qual é. Pré-escolher a primeira da lista lançaria o gasto na campanha errada em silêncio | O lojista que lança outro intervalo troca as datas à mão; sempre escolhe a campanha |
| **O GET de gasto não cai se o relatório cair** (`Promise.allSettled`): os lançamentos saem e a lista de campanhas fica só com os nomes já lançados, com `console.error` | Editar e excluir não podem depender do relatório inteiro rodar | Com o relatório fora, campanha nova não aparece no seletor até ele voltar |
| **Até 500 lançamentos na lista** (`LIMITE`, com `ponytail:`) | Gasto é lançado à mão, poucos por mês; o teto evita o corte silencioso de 1000 ficar escondido | Loja com mais de 500 lançamentos vê só os 500 mais recentes no diálogo; o relatório continua somando todos (o SQL lê `ad_spend` inteiro) |
| **O rodapé do cartão conta todos os lançamentos** ("3 lançamentos · lançar"), não só os do período | É o mockup; o "proporcional aos dias" que ele substitui está dito no diálogo | Nenhum |

### Gasto lançado para nome que nunca chegou (spec §6) — conferido no SQL que já existe

`attribution_report` (`apps/web/supabase/migrations/20261010130100_funil_anuncios_relatorio.sql`) monta `linhas` com um segundo ramo:

```sql
    union all
    -- Campanha com gasto e nenhum cadastro no período: aparece só com o gasto.
    select 'campanha', g.campanha, null, null, 0, 0, 0, 0, 0, 0, 0, g.valor
      from gasto g
     where not exists (select 1 from coorte k where k.campanha = g.campanha)
```

O CTE `gasto` lê `ad_spend` com `g.tenant_id = p_tenant` e o período; a comparação com a coorte é por igualdade exata contra `nullif(btrim(s.utm_campaign), '')`. Por isso este PR **apara** `utm_campaign` antes de gravar: um nome com espaço sobrando nunca casaria com a coorte e viraria uma segunda linha, só com gasto. O teste de integração do PR 1 já prova o caso (`relatorio-anuncios.integration.test.ts`, campanha `C9`: `[c9.cadastros, c9.gasto]` = `[0, 90]`), e o `semGasto` do PR 5a tira essa linha do relatório de quem não tem `ads:manage`. Este PR não precisa de SQL novo; o teste da rota prova que o POST aceita o nome que ainda não chegou.

## Global Constraints

- Limites do `check` de `ad_spend` (`20261010130000_funil_anuncios_tabelas.sql`): `char_length(utm_campaign) between 1 and 200`; `ends_on >= starts_on`; `amount > 0 and amount <= 10000000`; `amount numeric(12, 2)`. O corpo é validado com esses mesmos limites **antes** do banco: violação é 400 com mensagem, nunca 500 do `check`.
- `utm_campaign` é aparado (`trim`) antes de validar e gravar.
- Todo verbo exige `ads:manage` (owner, admin), **inclusive o GET** (gasto é dado de caixa). Operador recebe 403 `{ "error": "Sem permissão para esta ação." }`; a vendedora para antes, no guard de módulo de `getTenantContext` (403, texto `MENSAGEM_BLOQUEIO`), porque `/api/anuncios/*` não entra em `lib/auth/modulos.ts` (fechado por padrão). A página já é bloqueada para ela pela `GuardaDeModulo` (PR 5b).
- Toda query em `ad_spend` com `.eq("tenant_id", tenantId)`, **inclusive PATCH e DELETE por id** (`.eq("tenant_id", …).eq("id", …)`). O tenant é sempre o de `getRouteTenantContext(req, { allowEngine: false })`; o corpo nunca escolhe a loja (`strictObject` recusa `tenant_id`).
- Rota: erro que não é `Response` → 500 com `console.error`, sem mensagem do banco na resposta; `cache-control: no-store`; id que não é uuid → 404 sem tocar o banco.
- Nenhuma DDL.
- Tema G2: cartões e campos `border-line-200`, `rounded-lg`; números em `font-data`; escala de texto 13/15/20 (campo de digitar em `text-[16px]`, como o de Contatos, para o iOS não dar zoom); `bg-cobalt-500` no botão principal; vermelho só `danger-700`; nada de Acid, gradiente, blur ou raio > 12 px (`npm run painel:check`).
- Nomes acessíveis são contrato com os testes: botão `Lançar gasto` (cabeçalho), botão `lançar` (rodapé do cartão), diálogo `Lançar gasto de anúncio` (`data-testid="anuncios-gasto"`), campos `Campanha`, `Valor usado`, `De`, `Até`, botões `Salvar gasto` / `Salvar alteração` / `Cancelar` / `Cancelar edição`, região `Lançamentos`, botões `Editar gasto de <campanha>, <período>`, `Excluir gasto de <campanha>, <período>`, `Excluir mesmo o gasto de <campanha>, <período>`, `Manter o gasto de <campanha>, <período>`, botão `Tentar de novo`, `status` "Carregando os lançamentos…".
- Testes: `node:test` + `node:assert/strict`; rodar em `apps/web` com `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Rota com PostgREST falso (molde: `app/api/integracoes/site/chave/route.test.ts`). Componente com `renderToStaticMarkup` (molde: `components/painel/configuracoes/vitrine/aba-plano.test.ts`).
- Gate antes do push, em `apps/web`: `npm run lint`, `npx tsc --noEmit --project tsconfig.json`, `npx tsc --noEmit --project tsconfig.e2e.json`, `npm test`, `npm run painel:check`; depois `infra/scripts/verify-local.ps1` do worktree.
- Commits em inglês com prefixo semântico.

## Review Focus

- **"1.620" digitado sem vírgula** (copiado do Gerenciador sem os centavos): tem que gravar R$ 1.620, não R$ 1,62, e o campo mostra o valor lido antes de salvar. Coberto: `valorDigitado` (Task 1) e "valor digitado aparece lido em reais" (Task 3).
- **Nome com espaço sobrando** (" VIP Atacado "): tem que gravar aparado, senão nunca casa com o `btrim` do relatório e vira uma segunda linha, só com gasto. Coberto: `lerFormulario` (Task 1) e "POST grava aparado" (Task 2).
- **id de outra loja em PATCH ou DELETE**: 404, e a query sempre leva `tenant_id`. Coberto: "PATCH e DELETE de id de outra loja" (Task 2).
- **Valor ou nome que o `check` recusaria** (0,004 que arredonda a zero, R$ 10.000.000,01, nome de 201 caracteres, até antes de de): 400 com mensagem, nunca o 500 do `check`. Coberto: "POST recusa o que o check da tabela recusaria" (Task 2).
- **Editar lançamento de campanha que parou de chegar** (fora dos 400 dias do relatório): a campanha continua no seletor, senão a edição troca o nome sem o lojista ver. Coberto: `campanhasDisponiveis` (Task 1) e "GET une as campanhas do relatório e dos lançamentos" (Task 2).

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/resultados/gasto-de-anuncio.ts` (+ `.test.ts`) | tipos, limites do `check`, valor em R$, formulário → corpo, lista de campanhas, formatos, guarda da resposta (puro, usado pelo cliente e pelo servidor) |
| `apps/web/src/lib/stores/ad-spend.ts` | schema zod do corpo + listar/criar/editar/excluir em `ad_spend`, sempre com `tenant_id` |
| `apps/web/src/app/api/anuncios/gasto/route.ts` | GET (lançamentos + campanhas) e POST |
| `apps/web/src/app/api/anuncios/gasto/[id]/route.ts` | PATCH e DELETE |
| `apps/web/src/app/api/anuncios/gasto/route.test.ts` | as duas rotas (e o store por elas) com PostgREST falso |
| `apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.tsx` (+ `.test.ts`) | botão, rodapé do cartão, diálogo |
| `apps/web/src/app/painel/resultados/anuncios/page.tsx` (alterado) | busca o gasto só com `ads:manage` e liga os três encaixes |
| `apps/web/e2e/vendas-vendedora.spec.ts` (alterado) | vendedora recebe 403 nas rotas de gasto |

São 10 arquivos: 8 novos, 2 alterados.

---

Antes de tudo (CLAUDE.md, "Regra de PR"), na raiz do checkout principal:

```bash
git fetch origin main
git log origin/main --oneline -30 | grep -E "PR 5a|PR 5b"
git worktree add -b feat/funil-anuncios-pr7-gasto ../pr7 origin/main
```

Expected: as duas linhas do 5a e do 5b aparecem no `grep`. Sem elas, **parar**: este PR importa `relatorioDeAnuncios`, `periodo-anuncios.ts`, `anuncios-tela.ts` e a `AbaAnuncios` com os encaixes. Conferir também os nomes que este plano consome:

```bash
cd ../pr7
grep -n "\"ads:manage\"" apps/web/src/lib/permissions.ts
grep -n "export async function relatorioDeAnuncios\|export const MAX_DIAS_ENTRE\|export function somarDias\|export function diasEntre\|export function dataValida\|export type Periodo" apps/web/src/lib/stores/relatorio-de-anuncios.ts apps/web/src/lib/resultados/periodo-anuncios.ts
grep -n "export function custo\|export function diaMes\|export function contagem\|export type InicioDeGasto" apps/web/src/lib/resultados/anuncios-tela.ts
grep -n "acoesDoCabecalho\|rodapeDoGasto\|iniciosDeGasto" apps/web/src/components/painel/resultados/anuncios/aba-anuncios.tsx
```

Expected: todas as linhas existem. Se um nome mudou no caminho, usar o nome de `main` e anotar no corpo do PR.

Comandos abaixo rodam em `apps/web` do worktree novo, salvo quando dito.

### Task 1: Regras puras do gasto

**Files:**
- Create: `apps/web/src/lib/resultados/gasto-de-anuncio.ts`
- Test: `apps/web/src/lib/resultados/gasto-de-anuncio.test.ts`

**Interfaces:**
- Consumes: `parseValorDoPedido(bruto: unknown): number` de `@/lib/orders/valor-do-pedido`; `custo(valor: number): string`, `diaMes(dia: string): string`, `contagem(n, um, varios): string`, `type InicioDeGasto = { dia: string; campanha: string }` de `@/lib/resultados/anuncios-tela` (PR 5b); `dataValida(dia): boolean`, `diasEntre(de, ate): number`, `type Periodo = { de: string; ate: string }` de `@/lib/resultados/periodo-anuncios` (PR 5a); `type LinhaRelatorio` de `@/lib/resultados/relatorio-anuncios` (só `nivel` e `campanha`, por `Pick`: serve às linhas de `RelatorioAnuncios`, que o store `relatorioDeAnuncios` devolve, e às de `RelatorioParaTela`, a saída de `semGasto`).
- Produces:
  - `MAX_CAMPANHA = 200`, `MAX_VALOR = 10_000_000`
  - `type LancamentoDeGasto = { id: string; utm_campaign: string; starts_on: string; ends_on: string; amount: number }`
  - `type CorpoDoGasto = Omit<LancamentoDeGasto, "id">`
  - `type RespostaDoGasto = { lancamentos: LancamentoDeGasto[]; campanhas: string[] }`
  - `type FormularioDeGasto = { campanha: string; valor: string; de: string; ate: string }`
  - `type FormularioLido = { ok: true; corpo: CorpoDoGasto } | { ok: false; erro: string }`
  - `emCentavos(valor: number): number`
  - `valorDigitado(texto: string): number | null`
  - `lerFormulario(form: FormularioDeGasto): FormularioLido`
  - `formularioNovo(periodo: Periodo): FormularioDeGasto`, `formularioDe(l: LancamentoDeGasto): FormularioDeGasto`
  - `type LinhaComCampanha = Pick<LinhaRelatorio, "nivel" | "campanha">`
  - `campanhasDisponiveis(linhas: readonly LinhaComCampanha[], lancamentos: readonly LancamentoDeGasto[]): string[]`
  - `periodoDoLancamento(l: LancamentoDeGasto): string` ("11/09 a 10/10")
  - `iniciosDosLancamentos(lancamentos: readonly LancamentoDeGasto[]): InicioDeGasto[]`
  - `textoDoRodape(quantos: number): string` ("3 lançamentos", "nenhum lançamento")
  - `ehRespostaDoGasto(corpo: unknown): corpo is RespostaDoGasto`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/resultados/gasto-de-anuncio.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  campanhasDisponiveis,
  ehRespostaDoGasto,
  formularioDe,
  formularioNovo,
  iniciosDosLancamentos,
  lerFormulario,
  MAX_VALOR,
  periodoDoLancamento,
  textoDoRodape,
  valorDigitado,
  type FormularioDeGasto,
  type LancamentoDeGasto,
} from "./gasto-de-anuncio";
import type { LinhaRelatorio } from "./relatorio-anuncios";

const L1: LancamentoDeGasto = {
  id: "l1",
  utm_campaign: "VIP Atacado — Goiânia",
  starts_on: "2026-09-11",
  ends_on: "2026-10-10",
  amount: 1620,
};

const FORM: FormularioDeGasto = { campanha: "VIP Atacado — Goiânia", valor: "1.620,00", de: "2026-09-11", ate: "2026-10-10" };

function linha(nivel: LinhaRelatorio["nivel"], campanha: string | null, conjunto: string | null = null): LinhaRelatorio {
  return {
    nivel, campanha, conjunto, anuncio: null,
    cadastros: 1, foram: 0, entraram: 0, ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0, gasto: null,
  };
}

function erroDe(form: FormularioDeGasto): string {
  const lido = lerFormulario(form);
  assert.equal(lido.ok, false);
  return lido.ok ? "" : lido.erro;
}

test("valor em reais como o lojista digita: vírgula decimal, milhar com ponto, R$ e espaços", () => {
  assert.equal(valorDigitado("R$ 1.620,00"), 1620);
  assert.equal(valorDigitado("R$ 980,00"), 980);
  assert.equal(valorDigitado("1620"), 1620);
  assert.equal(valorDigitado("1.620,5"), 1620.5);
  assert.equal(valorDigitado("240,99"), 240.99);
  assert.equal(valorDigitado("149.90"), 149.9);
});

test("\"1.620\" sem vírgula é mil seiscentos e vinte, não R$ 1,62", () => {
  assert.equal(valorDigitado("1.620"), 1620);
  assert.equal(valorDigitado("1.620.000"), 1_620_000);
});

test("valor fora do check da tabela é recusado: zero, negativo, centavo que arredonda a zero, mais de 10 milhões, lixo", () => {
  for (const t of ["", "R$", "0", "0,00", "-5", "0,004", "10.000.000,01", "abc"]) {
    assert.equal(valorDigitado(t), null, t);
  }
  assert.equal(valorDigitado("10.000.000,00"), MAX_VALOR);
  assert.equal(valorDigitado("0,01"), 0.01);
});

test("formulário vira o corpo da rota, com a campanha aparada e o valor em centavos", () => {
  assert.deepEqual(lerFormulario({ ...FORM, campanha: "  VIP Atacado — Goiânia " }), {
    ok: true,
    corpo: { utm_campaign: "VIP Atacado — Goiânia", amount: 1620, starts_on: "2026-09-11", ends_on: "2026-10-10" },
  });
  // Um dia só é período válido (ends_on >= starts_on).
  assert.equal(lerFormulario({ ...FORM, ate: "2026-09-11" }).ok, true);
});

test("formulário recusado diz o porquê", () => {
  // A opção vazia do seletor ("Escolha a campanha…") manda "": salvar sem escolher para aqui.
  assert.equal(erroDe({ ...FORM, campanha: "" }), "Escolha a campanha.");
  assert.equal(erroDe({ ...FORM, campanha: "   " }), "Escolha a campanha.");
  assert.equal(erroDe({ ...FORM, campanha: "x".repeat(201) }), "Escolha a campanha.");
  assert.match(erroDe({ ...FORM, valor: "0" }), /Valor inválido/);
  assert.equal(erroDe({ ...FORM, de: "2026-02-30" }), "Escolha as datas de início e fim.");
  assert.equal(erroDe({ ...FORM, ate: "" }), "Escolha as datas de início e fim.");
  assert.equal(erroDe({ ...FORM, ate: "2026-09-10" }), "A data final vem antes da inicial.");
});

test("formulário novo vem com o período da aba; editar traz o valor no formato digitável, ida e volta", () => {
  assert.deepEqual(formularioNovo({ de: "2026-09-11", ate: "2026-10-10" }), {
    campanha: "", valor: "", de: "2026-09-11", ate: "2026-10-10",
  });
  const f = formularioDe({ ...L1, amount: 1620.5 });
  assert.deepEqual(f, { campanha: "VIP Atacado — Goiânia", valor: "1.620,50", de: "2026-09-11", ate: "2026-10-10" });
  assert.equal(valorDigitado(f.valor), 1620.5);
});

test("campanhas: nível campanha do relatório, sem (sem UTM), mais as já lançadas, sem repetir, em ordem", () => {
  const linhas = [
    linha("campanha", "VIP Atacado — Goiânia"),
    linha("conjunto", "VIP Atacado — Goiânia", "Mulheres 25-45"),
    linha("campanha", "Brasil"),
    linha("campanha", null),
    // Maior que o check da tabela: escolher daria erro na hora de salvar.
    linha("campanha", "x".repeat(201)),
  ];
  // "Remarketing" parou de chegar (fora dos 400 dias), mas tem lançamento: continua na lista.
  const lancamentos = [L1, { ...L1, id: "l2", utm_campaign: "Remarketing" }];
  assert.deepEqual(campanhasDisponiveis(linhas, lancamentos), ["Brasil", "Remarketing", "VIP Atacado — Goiânia"]);
  assert.deepEqual(campanhasDisponiveis([], []), []);
});

test("período do lançamento, começos para o gráfico e o rodapé do cartão", () => {
  assert.equal(periodoDoLancamento(L1), "11/09 a 10/10");
  assert.equal(periodoDoLancamento({ ...L1, ends_on: "2026-09-11" }), "11/09");
  assert.deepEqual(iniciosDosLancamentos([L1]), [{ dia: "2026-09-11", campanha: "VIP Atacado — Goiânia" }]);
  assert.equal(textoDoRodape(0), "nenhum lançamento");
  assert.equal(textoDoRodape(1), "1 lançamento");
  assert.equal(textoDoRodape(3), "3 lançamentos");
});

test("guarda da resposta: só lançamentos com valor numérico e campanhas em texto", () => {
  assert.equal(ehRespostaDoGasto({ lancamentos: [L1], campanhas: ["A"] }), true);
  assert.equal(ehRespostaDoGasto({ lancamentos: [], campanhas: [] }), true);
  assert.equal(ehRespostaDoGasto(null), false);
  assert.equal(ehRespostaDoGasto({ error: "erro" }), false);
  assert.equal(ehRespostaDoGasto({ lancamentos: [{ ...L1, amount: "1620" }], campanhas: [] }), false);
  assert.equal(ehRespostaDoGasto({ lancamentos: [], campanhas: [1] }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/gasto-de-anuncio.test.ts`
Expected: FAIL — `Cannot find module './gasto-de-anuncio'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/resultados/gasto-de-anuncio.ts
import { parseValorDoPedido } from "@/lib/orders/valor-do-pedido";
import { contagem, custo, diaMes, type InicioDeGasto } from "@/lib/resultados/anuncios-tela";
import { dataValida, diasEntre, type Periodo } from "@/lib/resultados/periodo-anuncios";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";

/**
 * Gasto de anúncio lançado à mão (spec 2026-10-10-funil-anuncios §3–§4). Puro:
 * a tela e as rotas usam as mesmas regras, e os limites são os do `check` de
 * `public.ad_spend` (migração 20261010130000_funil_anuncios_tabelas.sql).
 */

/** `ad_spend_campanha_tamanho`: char_length(utm_campaign) between 1 and 200. */
export const MAX_CAMPANHA = 200;
/** `ad_spend_valor`: amount > 0 and amount <= 10000000. */
export const MAX_VALOR = 10_000_000;

export type LancamentoDeGasto = {
  id: string;
  utm_campaign: string;
  starts_on: string;
  ends_on: string;
  amount: number;
};
export type CorpoDoGasto = Omit<LancamentoDeGasto, "id">;
export type RespostaDoGasto = { lancamentos: LancamentoDeGasto[]; campanhas: string[] };
export type FormularioDeGasto = { campanha: string; valor: string; de: string; ate: string };
export type FormularioLido = { ok: true; corpo: CorpoDoGasto } | { ok: false; erro: string };
/** Só o que a lista de campanhas lê: vale para `RelatorioAnuncios` e para `RelatorioParaTela` (saída de `semGasto`). */
export type LinhaComCampanha = Pick<LinhaRelatorio, "nivel" | "campanha">;

/** `amount` é numeric(12, 2): o banco arredonda para centavos, e a validação olha o que vai ser gravado. */
export function emCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

const SO_MILHAR = /^\d{1,3}(\.\d{3})+$/;
const DUAS_CASAS = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

/**
 * O "Valor usado" como o lojista digita. Reaproveita o parser dos pedidos, com uma
 * exceção: "1.620" (só grupos de milhar, sem vírgula) é mil seiscentos e vinte —
 * o Gerenciador mostra "R$1.620,00", e quem copia sem os centavos não quer R$ 1,62.
 * Fora do `check` da tabela (zero, negativo, mais de 10 milhões): `null`.
 */
export function valorDigitado(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  const bruto = SO_MILHAR.test(limpo) ? Number(limpo.replace(/\./g, "")) : parseValorDoPedido(limpo);
  if (!Number.isFinite(bruto)) return null;
  const valor = emCentavos(bruto);
  return valor > 0 && valor <= MAX_VALOR ? valor : null;
}

/** O formulário do diálogo vira o corpo de POST/PATCH, ou o motivo de não virar. */
export function lerFormulario(form: FormularioDeGasto): FormularioLido {
  // Aparada: o relatório compara com `btrim(utm_campaign)`; espaço sobrando
  // viraria uma segunda linha de campanha, só com gasto.
  const campanha = form.campanha.trim();
  if (!campanha || campanha.length > MAX_CAMPANHA) return { ok: false, erro: "Escolha a campanha." };
  const valor = valorDigitado(form.valor);
  if (valor === null) return { ok: false, erro: "Valor inválido: use o formato 1.620,00 (até R$ 10.000.000)." };
  if (!dataValida(form.de) || !dataValida(form.ate)) return { ok: false, erro: "Escolha as datas de início e fim." };
  if (diasEntre(form.de, form.ate) < 0) return { ok: false, erro: "A data final vem antes da inicial." };
  return { ok: true, corpo: { utm_campaign: campanha, amount: valor, starts_on: form.de, ends_on: form.ate } };
}

/** Lançamento novo: as datas do período que a aba mostra; a campanha começa vazia (o lojista escolhe). */
export function formularioNovo(periodo: Periodo): FormularioDeGasto {
  return { campanha: "", valor: "", de: periodo.de, ate: periodo.ate };
}

/** Editar: o valor volta em "1.620,50", que `valorDigitado` lê de novo igual. */
export function formularioDe(l: LancamentoDeGasto): FormularioDeGasto {
  return {
    campanha: l.utm_campaign,
    valor: l.amount.toLocaleString("pt-BR", DUAS_CASAS),
    de: l.starts_on,
    ate: l.ends_on,
  };
}

/**
 * Os nomes que o diálogo oferece (spec §4: "lista dos utm_campaign já recebidos"):
 * as linhas de nível campanha do relatório, sem a "(sem UTM)" (nula), mais os nomes
 * que já têm lançamento — editar um lançamento de campanha que parou de chegar não
 * pode trocar o nome sem o lojista ver. Sem repetir, em ordem alfabética.
 */
export function campanhasDisponiveis(
  linhas: readonly LinhaComCampanha[],
  lancamentos: readonly LancamentoDeGasto[],
): string[] {
  const nomes = new Set<string>();
  for (const l of linhas) {
    if (l.nivel === "campanha" && l.campanha !== null && l.campanha.length <= MAX_CAMPANHA) nomes.add(l.campanha);
  }
  for (const l of lancamentos) nomes.add(l.utm_campaign);
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** "11/09 a 10/10"; um dia só: "11/09". */
export function periodoDoLancamento(l: LancamentoDeGasto): string {
  return l.starts_on === l.ends_on ? diaMes(l.starts_on) : `${diaMes(l.starts_on)} a ${diaMes(l.ends_on)}`;
}

/** A anotação do gráfico por dia (PR 5b, `marcasDeGasto`) marca o dia em que cada lançamento começa. */
export function iniciosDosLancamentos(lancamentos: readonly LancamentoDeGasto[]): InicioDeGasto[] {
  return lancamentos.map((l) => ({ dia: l.starts_on, campanha: l.utm_campaign }));
}

/** Rodapé do cartão "Gasto lançado" (mockup Main: "3 lançamentos · lançar"). */
export function textoDoRodape(quantos: number): string {
  return quantos === 0 ? "nenhum lançamento" : contagem(quantos, "lançamento", "lançamentos");
}

/** Mostra o valor lido ao lado do campo: "= R$ 1.620,00". */
export function valorLido(texto: string): string | null {
  const valor = valorDigitado(texto);
  return valor === null ? null : `= ${custo(valor)}`;
}

function ehLancamento(x: unknown): x is LancamentoDeGasto {
  if (typeof x !== "object" || x === null) return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.utm_campaign === "string" &&
    typeof l.starts_on === "string" &&
    typeof l.ends_on === "string" &&
    typeof l.amount === "number"
  );
}

/** Guarda leve do corpo de `GET /api/anuncios/gasto` no cliente: o que não é a resposta vira erro, nunca lista vazia. */
export function ehRespostaDoGasto(corpo: unknown): corpo is RespostaDoGasto {
  if (typeof corpo !== "object" || corpo === null) return false;
  const c = corpo as Record<string, unknown>;
  return (
    Array.isArray(c.lancamentos) &&
    c.lancamentos.every(ehLancamento) &&
    Array.isArray(c.campanhas) &&
    c.campanhas.every((n) => typeof n === "string")
  );
}
```

`valorLido` também entra em **Produces** (a Task 3 usa): `valorLido(texto: string): string | null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/gasto-de-anuncio.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/resultados/gasto-de-anuncio.ts apps/web/src/lib/resultados/gasto-de-anuncio.test.ts
git commit -m "feat(resultados): pure rules for ad spend entries (amount, form, campaigns, formats)"
```

### Task 2: Store de `ad_spend` e as rotas de gasto

**Files:**
- Create: `apps/web/src/lib/stores/ad-spend.ts`
- Create: `apps/web/src/app/api/anuncios/gasto/route.ts`
- Create: `apps/web/src/app/api/anuncios/gasto/[id]/route.ts`
- Test: `apps/web/src/app/api/anuncios/gasto/route.test.ts` (as duas rotas; cobre o store por elas, como o PR 5a fez com o do relatório)

**Interfaces:**
- Consumes: `MAX_CAMPANHA`, `MAX_VALOR`, `emCentavos`, `campanhasDisponiveis`, `LancamentoDeGasto`, `CorpoDoGasto`, `RespostaDoGasto` (Task 1); `dataValida`, `somarDias`, `MAX_DIAS_ENTRE` de `@/lib/resultados/periodo-anuncios`; `relatorioDeAnuncios(tenantId, periodo): Promise<RelatorioAnuncios>` de `@/lib/stores/relatorio-de-anuncios` (nome do arquivo na correção do plano do PR 5; o tipo devolvido é o estrito, com gasto — a rota de gasto já exige `ads:manage`, então não passa por `semGasto`); `hasPermission(role, "ads:manage")` de `@/lib/permissions`; `getRouteTenantContext(req, { allowEngine: false })` (devolve `{ tenantId, role, authUserId, … }`); `dayBR(d)` de `@/lib/date-br`; `getSupabaseAdmin()`.
- Produces:
  - `corpoDoGasto` (zod; saída `CorpoDoGasto`), `ERRO_DO_CORPO: string`
  - `listarGastos(tenantId: string): Promise<LancamentoDeGasto[]>`
  - `criarGasto(tenantId: string, autor: string | null, corpo: CorpoDoGasto): Promise<LancamentoDeGasto>`
  - `editarGasto(tenantId: string, id: string, corpo: CorpoDoGasto): Promise<LancamentoDeGasto | null>`
  - `excluirGasto(tenantId: string, id: string): Promise<boolean>`
  - `GET /api/anuncios/gasto` → `200 RespostaDoGasto` (relatório fora: `campanhas` só com os nomes já lançados) | `403` | `500 { error: "Não deu para carregar os lançamentos de gasto." }` (só quando a lista de `ad_spend` falha)
  - `POST /api/anuncios/gasto` (corpo `CorpoDoGasto`) → `201 LancamentoDeGasto` | `400 { error: ERRO_DO_CORPO }` | `403` | `500 { error: "Não deu para salvar o gasto." }`
  - `PATCH /api/anuncios/gasto/[id]` (corpo `CorpoDoGasto`, os quatro campos) → `200 LancamentoDeGasto` | `400` | `403` | `404 { error: "Lançamento não encontrado." }` | `500`
  - `DELETE /api/anuncios/gasto/[id]` → `200 { ok: true }` | `403` | `404` | `500 { error: "Não deu para excluir o gasto." }`

O `supabase-js` manda: listar = `GET /rest/v1/ad_spend?select=…&tenant_id=eq.<t>&order=…&limit=500`; criar = `POST /rest/v1/ad_spend` com o objeto, `Accept` de objeto único (`.single()`); editar = `PATCH /rest/v1/ad_spend?tenant_id=eq.<t>&id=eq.<id>&select=…` (devolve lista); excluir = `DELETE /rest/v1/ad_spend?tenant_id=eq.<t>&id=eq.<id>&select=id` (devolve lista); relatório = `POST /rest/v1/rpc/attribution_report` com `{ p_tenant, p_de, p_ate }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/anuncios/gasto/route.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { dayBR } from "@/lib/date-br";
import { somarDias } from "@/lib/resultados/periodo-anuncios";
import { DELETE, PATCH } from "./[id]/route";
import { GET, POST } from "./route";

/** Dono logado por Bearer contra um Supabase de mentira (molde: api/integracoes/site/chave/route.test.ts). */

const L1 = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const L2 = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f2a3b4c5d";

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let falhar = false;
/** Só o relatório fora (os lançamentos respondem). */
let relatorioFora = false;
/** O que PATCH e DELETE devolvem: vazio = o id não é desta loja (o filtro de tenant não achou). */
let alteradas: unknown[] = [];

const LANCAMENTOS = [
  { id: L1, utm_campaign: "Remarketing", starts_on: "2026-10-01", ends_on: "2026-10-10", amount: 240 },
  // numeric pode chegar como texto: o store converte.
  { id: L2, utm_campaign: "VIP Atacado — Goiânia", starts_on: "2026-09-11", ends_on: "2026-10-10", amount: "1620.00" },
];
const ZERO = { foram: 0, entraram: 0, ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0 };
const RELATORIO = {
  periodo: { de: "2025-09-06", ate: "2026-10-11" },
  total: { ...ZERO, cadastros: 4, gasto: 0 },
  linhas: [
    { nivel: "campanha", campanha: "VIP Atacado — Goiânia", conjunto: null, anuncio: null, ...ZERO, cadastros: 2, gasto: 0 },
    { nivel: "conjunto", campanha: "VIP Atacado — Goiânia", conjunto: "Mulheres 25-45", anuncio: null, ...ZERO, cadastros: 2, gasto: null },
    { nivel: "campanha", campanha: "Brasil", conjunto: null, anuncio: null, ...ZERO, cadastros: 1, gasto: null },
    { nivel: "campanha", campanha: null, conjunto: null, anuncio: null, ...ZERO, cadastros: 1, gasto: null },
  ],
  por_origem: [],
  por_dia: [],
  fora: { entradas_sem_cadastro: 0, pedidos_sem_origem: 0, vendido_sem_origem: 0 },
};

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    const corpoPedido: unknown = bruto ? JSON.parse(bruto) : undefined;
    chamadas.push({ metodo: req.method ?? "", url, corpo: corpoPedido });
    const chave = `${req.method} ${url.pathname}`;
    let status = 500;
    let corpo: unknown = { message: `inesperado: ${chave}` };
    if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
    else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel, modules: [] }]];
    else if (falhar) [status, corpo] = [500, { code: "XX000", message: "segredo do banco" }];
    else if (chave === "POST /rest/v1/rpc/attribution_report") {
      [status, corpo] = relatorioFora ? [500, { code: "XX000", message: "segredo do banco" }] : [200, RELATORIO];
    }
    else if (chave === "GET /rest/v1/ad_spend") [status, corpo] = [200, LANCAMENTOS];
    else if (chave === "POST /rest/v1/ad_spend") [status, corpo] = [201, { id: L1, ...(corpoPedido as object) }];
    else if (chave === "PATCH /rest/v1/ad_spend" || chave === "DELETE /rest/v1/ad_spend") [status, corpo] = [200, alteradas];
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
after(() => { supabase.close(); });
beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  falhar = false;
  relatorioFora = false;
  alteradas = [];
});

function pedir(metodo: string, caminho = "/api/anuncios/gasto", corpo?: unknown): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}
const comId = (id: string) => ({ params: Promise.resolve({ id }) });
const noGasto = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/ad_spend" || c.url.pathname.startsWith("/rest/v1/rpc/"));
const escrita = (metodo: string) => chamadas.filter((c) => c.metodo === metodo && c.url.pathname === "/rest/v1/ad_spend");
const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

const BOM = { utm_campaign: "VIP Atacado — Goiânia", amount: 1620, starts_on: "2026-09-11", ends_on: "2026-10-10" };

test("GET: dono recebe os lançamentos da loja e as campanhas do relatório dos últimos 400 dias", async () => {
  // A rota lê o relógio sozinha: perto da meia-noite de Brasília o dia pode virar no meio do teste.
  const antes = dayBR(new Date());
  const r = await GET(pedir("GET"));
  const depois = dayBR(new Date());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const corpo = await r.json();
  assert.deepEqual(
    corpo.lancamentos.map((l: { id: string; amount: number }) => [l.id, l.amount]),
    [[L1, 240], [L2, 1620]],
  );
  // Nível campanha, sem a "(sem UTM)", unido aos nomes já lançados ("Remarketing" não está no relatório).
  assert.deepEqual(corpo.campanhas, ["Brasil", "Remarketing", "VIP Atacado — Goiânia"]);

  const lista = chamadas.find((c) => c.metodo === "GET" && c.url.pathname === "/rest/v1/ad_spend");
  assert.equal(lista?.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(lista?.url.searchParams.get("limit"), "500");
  const rpc = chamadas.find((c) => c.url.pathname === "/rest/v1/rpc/attribution_report");
  const { p_tenant, p_de, p_ate } = rpc?.corpo as { p_tenant: string; p_de: string; p_ate: string };
  assert.equal(p_tenant, "loja-b");
  // Hoje, ou ontem se a meia-noite passou entre a rota e o fim do teste.
  assert.ok(p_ate === antes || p_ate === depois, `p_ate ${p_ate} fora de ${antes}..${depois}`);
  assert.equal(p_de, somarDias(p_ate, -400));
});

test("GET com o relatório fora: os lançamentos saem, e o seletor fica com os nomes já lançados", async () => {
  relatorioFora = true;
  const r = await GET(pedir("GET"));
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.lancamentos.length, 2);
  assert.deepEqual(corpo.campanhas, ["Remarketing", "VIP Atacado — Goiânia"]);
  assert.doesNotMatch(JSON.stringify(corpo), /segredo/);
});

test("POST: grava na loja da sessão, com a campanha aparada e quem lançou", async () => {
  const r = await POST(pedir("POST", undefined, { ...BOM, utm_campaign: "  VIP Atacado — Goiânia  " }));
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { id: L1, ...BOM });
  assert.deepEqual(escrita("POST")[0]?.corpo, { ...BOM, tenant_id: "loja-b", created_by: "usuario-1" });
});

test("POST de campanha que ainda não chegou é aceito (spec §6: vira linha só com gasto no relatório)", async () => {
  const r = await POST(pedir("POST", undefined, { ...BOM, utm_campaign: "Black Friday" }));
  assert.equal(r.status, 201);
  assert.equal((escrita("POST")[0]?.corpo as { utm_campaign: string }).utm_campaign, "Black Friday");
});

test("POST aceita os limites exatos do check: R$ 10 milhões, 200 caracteres, um dia só", async () => {
  const r = await POST(pedir("POST", undefined, {
    utm_campaign: "x".repeat(200), amount: 10_000_000, starts_on: "2026-10-10", ends_on: "2026-10-10",
  }));
  assert.equal(r.status, 201);
});

test("POST recusa o que o check da tabela recusaria (400, nada gravado), e campo a mais", async () => {
  const ruins: unknown[] = [
    { ...BOM, utm_campaign: "   " },
    { ...BOM, utm_campaign: "x".repeat(201) },
    { ...BOM, amount: 0 },
    { ...BOM, amount: -5 },
    { ...BOM, amount: 0.004 },
    { ...BOM, amount: 10_000_000.01 },
    { ...BOM, amount: "1620" },
    { ...BOM, starts_on: "2026-02-30" },
    { ...BOM, ends_on: "10/10/2026" },
    { ...BOM, ends_on: "2026-09-10" },
    { ...BOM, tenant_id: "loja-a" },
    { utm_campaign: "C1", amount: 100, starts_on: "2026-10-01" },
    "não é json",
  ];
  for (const corpo of ruins) {
    const r = await POST(pedir("POST", undefined, corpo));
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.equal(typeof (await r.json()).error, "string");
  }
  assert.equal(escrita("POST").length, 0);
});

test("PATCH: troca os quatro campos do lançamento DESTA loja, filtrando tenant e id", async () => {
  alteradas = [{ id: L1, ...BOM, amount: 980 }];
  const r = await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L1}`, { ...BOM, amount: 980 }), comId(L1));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { id: L1, ...BOM, amount: 980 });
  const patch = escrita("PATCH")[0];
  assert.deepEqual(filtros(patch.url), { tenant_id: "eq.loja-b", id: `eq.${L1}` });
  const gravado = patch.corpo as Record<string, unknown>;
  assert.equal("tenant_id" in gravado, false);
  assert.match(String(gravado.updated_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual({ ...gravado, updated_at: undefined }, { ...BOM, amount: 980, updated_at: undefined });
});

test("PATCH e DELETE de id de outra loja: 404, e a query levou o tenant", async () => {
  alteradas = [];
  assert.equal((await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L2}`, BOM), comId(L2))).status, 404);
  assert.equal((await DELETE(pedir("DELETE", `/api/anuncios/gasto/${L2}`), comId(L2))).status, 404);
  for (const c of [...escrita("PATCH"), ...escrita("DELETE")]) {
    assert.deepEqual(filtros(c.url), { tenant_id: "eq.loja-b", id: `eq.${L2}` });
  }
});

test("PATCH e DELETE com id que não é uuid: 404 sem tocar o banco; PATCH com corpo ruim: 400", async () => {
  assert.equal((await PATCH(pedir("PATCH", "/api/anuncios/gasto/abc", BOM), comId("abc"))).status, 404);
  assert.equal((await DELETE(pedir("DELETE", "/api/anuncios/gasto/abc"), comId("abc"))).status, 404);
  assert.equal((await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L1}`, { ...BOM, amount: 0 }), comId(L1))).status, 400);
  assert.equal(noGasto().length, 0);
});

test("DELETE: exclui o lançamento desta loja", async () => {
  alteradas = [{ id: L1 }];
  const r = await DELETE(pedir("DELETE", `/api/anuncios/gasto/${L1}`), comId(L1));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.deepEqual(filtros(escrita("DELETE")[0].url), { tenant_id: "eq.loja-b", id: `eq.${L1}` });
});

test("operador e vendedora: 403 em GET, POST, PATCH e DELETE, e nada chega em ad_spend nem no relatório", async () => {
  for (const p of ["operator", "seller"]) {
    papel = p;
    chamadas.length = 0;
    const respostas = [
      await GET(pedir("GET")),
      await POST(pedir("POST", undefined, BOM)),
      await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L1}`, BOM), comId(L1)),
      await DELETE(pedir("DELETE", `/api/anuncios/gasto/${L1}`), comId(L1)),
      // id inválido também: a permissão vem antes do 404.
      await DELETE(pedir("DELETE", "/api/anuncios/gasto/abc"), comId("abc")),
    ];
    for (const r of respostas) {
      assert.equal(r.status, 403, p);
      // A vendedora para no guard de módulo (texto fixo); o operador, na permissão do papel.
      if (p === "seller") assert.equal(await r.text(), MENSAGEM_BLOQUEIO);
      else assert.deepEqual(await r.json(), { error: "Sem permissão para esta ação." });
    }
    assert.equal(noGasto().length, 0, p);
  }
});

test("banco fora: 500 com mensagem nossa, nunca a do banco", async () => {
  falhar = true;
  const respostas = [
    await GET(pedir("GET")),
    await POST(pedir("POST", undefined, BOM)),
    await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L1}`, BOM), comId(L1)),
    await DELETE(pedir("DELETE", `/api/anuncios/gasto/${L1}`), comId(L1)),
  ];
  for (const r of respostas) {
    assert.equal(r.status, 500);
    assert.doesNotMatch(await r.text(), /segredo/);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/anuncios/gasto/route.test.ts`
Expected: FAIL — `Cannot find module './[id]/route'` (e `./route`).

- [ ] **Step 3: Write the store**

```ts
// apps/web/src/lib/stores/ad-spend.ts
import "server-only";

import { z } from "zod";

import {
  emCentavos,
  MAX_CAMPANHA,
  MAX_VALOR,
  type CorpoDoGasto,
  type LancamentoDeGasto,
} from "@/lib/resultados/gasto-de-anuncio";
import { dataValida } from "@/lib/resultados/periodo-anuncios";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "ad_spend";
const COLUNAS = "id, utm_campaign, starts_on, ends_on, amount";
// ponytail: teto fixo; gasto é lançado à mão, poucos por mês. Paginar se uma loja passar disso
// (o relatório não depende desta lista: o SQL lê ad_spend inteiro).
const LIMITE = 500;

/**
 * Corpo de POST e PATCH: os mesmos limites do `check` de `public.ad_spend`, para
 * a violação virar 400 com mensagem em vez do 500 do banco. `strictObject`: o
 * corpo nunca escolhe a loja (`tenant_id` a mais é recusado).
 */
export const corpoDoGasto = z
  .strictObject({
    utm_campaign: z.string().trim().min(1).max(MAX_CAMPANHA),
    // numeric(12, 2): valida o que vai ser gravado, já em centavos (0,004 vira 0 e é recusado).
    amount: z
      .number()
      .transform(emCentavos)
      .refine((v) => v > 0 && v <= MAX_VALOR),
    starts_on: z.string().refine(dataValida),
    ends_on: z.string().refine(dataValida),
  })
  .refine((c) => c.ends_on >= c.starts_on);

export const ERRO_DO_CORPO = "Confira a campanha, o valor (até R$ 10.000.000) e as datas (a final não pode vir antes).";

type Linha = { id: string; utm_campaign: string; starts_on: string; ends_on: string; amount: number | string };

function lancamento(l: Linha): LancamentoDeGasto {
  return { id: l.id, utm_campaign: l.utm_campaign, starts_on: l.starts_on, ends_on: l.ends_on, amount: Number(l.amount) };
}

/** Lançamentos da loja, do mais recente para o mais antigo. */
export async function listarGastos(tenantId: string): Promise<LancamentoDeGasto[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(COLUNAS)
    .eq("tenant_id", tenantId)
    .order("starts_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMITE);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Linha[]).map(lancamento);
}

export async function criarGasto(tenantId: string, autor: string | null, corpo: CorpoDoGasto): Promise<LancamentoDeGasto> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({ ...corpo, tenant_id: tenantId, created_by: autor })
    .select(COLUNAS)
    .single();
  if (error) throw new Error(error.message);
  return lancamento(data as Linha);
}

/**
 * Troca os quatro campos. O filtro de `tenant_id` é a proteção: o service-role
 * passa por cima do RLS, e sem ele um id de outra loja seria editado. `null`
 * quando o id não é desta loja (ou não existe).
 */
export async function editarGasto(tenantId: string, id: string, corpo: CorpoDoGasto): Promise<LancamentoDeGasto | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ ...corpo, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(COLUNAS);
  if (error) throw new Error(error.message);
  const linha = (data as Linha[] | null)?.[0];
  return linha ? lancamento(linha) : null;
}

/** `false` quando o id não é desta loja (ou não existe). */
export async function excluirGasto(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
```

- [ ] **Step 4: Write `GET`/`POST`**

```ts
// apps/web/src/app/api/anuncios/gasto/route.ts
import { dayBR } from "@/lib/date-br";
import { hasPermission } from "@/lib/permissions";
import { campanhasDisponiveis, type RespostaDoGasto } from "@/lib/resultados/gasto-de-anuncio";
import { MAX_DIAS_ENTRE, somarDias } from "@/lib/resultados/periodo-anuncios";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { corpoDoGasto, criarGasto, ERRO_DO_CORPO, listarGastos } from "@/lib/stores/ad-spend";
import { relatorioDeAnuncios } from "@/lib/stores/relatorio-de-anuncios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Gasto é dado de caixa: `ads:manage` (dono, administração) em todo verbo, o GET
 * também. A vendedora nem chega aqui: a rota não está em `lib/auth/modulos.ts` e o
 * guard de `getTenantContext` responde 403 antes.
 */
async function contexto(req: Request): Promise<{ tenantId: string; autor: string | null } | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "ads:manage")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    return { tenantId: ctx.tenantId, autor: ctx.authUserId };
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/anuncios/gasto] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }
}

/**
 * GET /api/anuncios/gasto — os lançamentos da loja e os nomes de campanha que o
 * diálogo oferece (spec 2026-10-10-funil-anuncios §3–§4). Os nomes saem do próprio
 * `attribution_report` na janela máxima (400 dias): ele agrega no banco, então o
 * teto de 1000 linhas do PostgREST não corta nada, e já apara o nome como o
 * relatório compara.
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await contexto(req);
  if (ctx instanceof Response) return ctx;

  const hoje = dayBR(new Date());
  const [lista, relatorio] = await Promise.allSettled([
    listarGastos(ctx.tenantId),
    relatorioDeAnuncios(ctx.tenantId, { de: somarDias(hoje, -MAX_DIAS_ENTRE), ate: hoje }),
  ]);
  if (lista.status === "rejected") {
    console.error(`[api/anuncios/gasto] ${ctx.tenantId}: ${(lista.reason as Error).message}`);
    return resposta({ error: "Não deu para carregar os lançamentos de gasto." }, 500);
  }
  // O relatório fora não pode travar editar e excluir: os lançamentos saem, e o
  // seletor fica com os nomes que já têm lançamento até o relatório voltar.
  if (relatorio.status === "rejected") {
    console.error(`[api/anuncios/gasto] relatório ${ctx.tenantId}: ${(relatorio.reason as Error).message}`);
  }
  const linhas = relatorio.status === "fulfilled" ? relatorio.value.linhas : [];
  const corpo: RespostaDoGasto = { lancamentos: lista.value, campanhas: campanhasDisponiveis(linhas, lista.value) };
  return resposta(corpo, 200);
}

/** POST /api/anuncios/gasto — lança o gasto de uma campanha num período. */
export async function POST(req: Request): Promise<Response> {
  const ctx = await contexto(req);
  if (ctx instanceof Response) return ctx;

  const lido = corpoDoGasto.safeParse(await req.json().catch(() => undefined));
  if (!lido.success) return resposta({ error: ERRO_DO_CORPO }, 400);

  try {
    return resposta(await criarGasto(ctx.tenantId, ctx.autor, lido.data), 201);
  } catch (e) {
    console.error(`[api/anuncios/gasto] ${ctx.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu para salvar o gasto." }, 500);
  }
}
```

- [ ] **Step 5: Write `PATCH`/`DELETE`**

```ts
// apps/web/src/app/api/anuncios/gasto/[id]/route.ts
import { z } from "zod";

import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { corpoDoGasto, editarGasto, ERRO_DO_CORPO, excluirGasto } from "@/lib/stores/ad-spend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const idDoLancamento = z.uuid();
const NAO_ACHEI = "Lançamento não encontrado.";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/** O mesmo portão de `../route.ts`: `ads:manage` antes de qualquer outra resposta (nem o 404 vaza). */
async function contexto(req: Request): Promise<{ tenantId: string } | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "ads:manage")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    return { tenantId: ctx.tenantId };
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/anuncios/gasto/id] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }
}

/** PATCH /api/anuncios/gasto/[id] — troca campanha, valor e datas de um lançamento desta loja. */
export async function PATCH(req: Request, { params }: Props): Promise<Response> {
  const ctx = await contexto(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  // Id que não é uuid daria 22P02 no PostgREST (500): para quem chama, é "não existe".
  if (!idDoLancamento.safeParse(id).success) return resposta({ error: NAO_ACHEI }, 404);

  const lido = corpoDoGasto.safeParse(await req.json().catch(() => undefined));
  if (!lido.success) return resposta({ error: ERRO_DO_CORPO }, 400);

  try {
    const editado = await editarGasto(ctx.tenantId, id, lido.data);
    return editado ? resposta(editado, 200) : resposta({ error: NAO_ACHEI }, 404);
  } catch (e) {
    console.error(`[api/anuncios/gasto/id] ${ctx.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu para salvar o gasto." }, 500);
  }
}

/** DELETE /api/anuncios/gasto/[id] — apaga um lançamento desta loja. */
export async function DELETE(req: Request, { params }: Props): Promise<Response> {
  const ctx = await contexto(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!idDoLancamento.safeParse(id).success) return resposta({ error: NAO_ACHEI }, 404);

  try {
    return (await excluirGasto(ctx.tenantId, id)) ? resposta({ ok: true }, 200) : resposta({ error: NAO_ACHEI }, 404);
  } catch (e) {
    console.error(`[api/anuncios/gasto/id] ${ctx.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu para excluir o gasto." }, 500);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/anuncios/gasto/route.test.ts`
Expected: PASS (12 testes). As linhas `[api/anuncios/gasto] loja-b: …`, `[api/anuncios/gasto] relatório loja-b: …` e `[api/anuncios/gasto/id] loja-b: …` no stderr são dos testes "relatório fora" e "banco fora", e esperadas.

Se o teste do operador/vendedora falhar com status 401: conferir se o `getTenantContext` de `main` pede mais alguma rota ao Supabase falso (o molde do `chave/route.test.ts` responde só `/auth/v1/user` e `/rest/v1/memberships`); acrescentar a resposta que faltar no servidor falso, nunca afrouxar a asserção.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/stores/ad-spend.ts apps/web/src/app/api/anuncios/gasto/route.ts "apps/web/src/app/api/anuncios/gasto/[id]/route.ts" apps/web/src/app/api/anuncios/gasto/route.test.ts
git commit -m "feat(anuncios): ad spend routes behind ads:manage with a tenant-scoped store"
```

### Task 3: Diálogo "Lançar gasto de anúncio"

**Files:**
- Create: `apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.tsx`
- Test: `apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.test.ts`

**Interfaces:**
- Consumes: `Folha({ aberta, aoFechar, titulo, testId, emQualquerLargura, children })` de `@/components/painel/folha` (portal, foco preso, Esc, raiz `inert`; `emQualquerLargura` vira diálogo centrado ≥ 1024 px); `custo` de `@/lib/resultados/anuncios-tela`; `formularioDe`, `formularioNovo`, `lerFormulario`, `periodoDoLancamento`, `textoDoRodape`, `valorLido`, `FormularioDeGasto`, `LancamentoDeGasto`, `RespostaDoGasto` (Task 1); `Carga` de `@/lib/painel/types`; `Periodo` de `@/lib/resultados/periodo-anuncios`; `cn` de `@/lib/utils`; rotas da Task 2.
- Produces:
  - `BotaoLancarGasto({ onClick }: { onClick: () => void })` — botão "Lançar gasto" para `acoesDoCabecalho`
  - `RodapeDoGasto({ quantos, onLancar }: { quantos: number; onLancar: () => void })` — "3 lançamentos · lançar" para `rodapeDoGasto`
  - `type PropsDoConteudo`, `ConteudoDoGasto(props)` — só desenha (testável sem DOM)
  - `type PropsDoDialogo = { carga: Carga; resposta: RespostaDoGasto | null; periodo: Periodo; aoFechar: () => void; aoTentarDeNovo: () => void; aoMudar: () => void }`, `DialogoDeGasto(props)` — monta já aberto; quem chama monta e desmonta

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { lerFormulario, type RespostaDoGasto } from "@/lib/resultados/gasto-de-anuncio";
import { BotaoLancarGasto, ConteudoDoGasto, RodapeDoGasto, type PropsDoConteudo } from "./dialogo-de-gasto";

const noop = () => {};

const RESPOSTA: RespostaDoGasto = {
  lancamentos: [
    { id: "l1", utm_campaign: "VIP Atacado — Goiânia", starts_on: "2026-09-11", ends_on: "2026-10-10", amount: 1620 },
    { id: "l2", utm_campaign: "Remarketing", starts_on: "2026-10-01", ends_on: "2026-10-10", amount: 240.5 },
  ],
  campanhas: ["Remarketing", "VIP Atacado — Goiânia"],
};

function html(over: Partial<PropsDoConteudo> = {}): string {
  const props: PropsDoConteudo = {
    carga: "ok",
    resposta: RESPOSTA,
    form: { campanha: "Remarketing", valor: "", de: "2026-09-11", ate: "2026-10-10" },
    editando: null,
    excluindo: null,
    salvando: false,
    erro: null,
    onCampo: noop,
    onSalvar: noop,
    onCancelarEdicao: noop,
    onEditar: noop,
    onPedirExclusao: noop,
    onExcluir: noop,
    onFechar: noop,
    aoTentarDeNovo: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(ConteudoDoGasto, props));
}

test("lista os lançamentos com campanha, período e valor; editar e excluir dizem de qual", () => {
  const h = html();
  assert.match(h, /VIP Atacado — Goiânia/);
  assert.match(h, /11\/09 a 10\/10/);
  assert.match(h, /R\$\s1\.620,00/);
  assert.match(h, /R\$\s240,50/);
  assert.match(h, /aria-label="Editar gasto de VIP Atacado — Goiânia, 11\/09 a 10\/10"/);
  assert.match(h, /aria-label="Excluir gasto de Remarketing, 01\/10 a 10\/10"/);
  assert.match(h, /aria-labelledby="gasto-lancamentos"/);
  // Alvo do foco depois de excluir (a linha some com o botão clicado).
  assert.match(h, /<h3 id="gasto-lancamentos" tabindex="-1"/);
});

test("a campanha é escolhida da lista que já chegou, com a atual marcada", () => {
  const h = html();
  assert.match(h, /<label for="gasto-campanha"[^>]*>Campanha<\/label>/);
  assert.match(h, /<option value="Remarketing" selected="">Remarketing<\/option>/);
  assert.match(h, /<option value="VIP Atacado — Goiânia">VIP Atacado — Goiânia<\/option>/);
  assert.match(h, /<option value="">Escolha a campanha…<\/option>/);
  assert.match(h, /A lista vem dos nomes de campanha que já chegaram nos cadastros\./);
  assert.match(h, /<button type="submit"[^>]*>Salvar gasto<\/button>/);
});

test("lançamento novo nasce sem campanha escolhida; salvar sem escolher mostra o motivo", () => {
  const vazio = { campanha: "", valor: "1.620", de: "2026-09-11", ate: "2026-10-10" };
  const h = html({ form: vazio });
  assert.match(h, /<option value="" selected="">Escolha a campanha…<\/option>/);
  assert.doesNotMatch(h, /<option value="Remarketing" selected="">/);
  // Salvar fica habilitado: é o clique que mostra o motivo, em vez de um botão morto sem explicação.
  assert.doesNotMatch(h, /<button type="submit" disabled=""/);
  // O erro que o diálogo põe na tela é o de `lerFormulario` para a campanha vazia.
  const lido = lerFormulario(vazio);
  assert.equal(lido.ok, false);
  assert.match(html({ form: vazio, erro: lido.ok ? null : lido.erro }), /role="alert"[^>]*>Escolha a campanha\.</);
});

test("sem nenhuma campanha recebida: diz por quê e não deixa salvar", () => {
  const h = html({ resposta: { lancamentos: [], campanhas: [] }, form: { campanha: "", valor: "", de: "2026-09-11", ate: "2026-10-10" } });
  assert.match(h, /Nenhum nome de campanha chegou nos cadastros ainda/);
  assert.doesNotMatch(h, /<select/);
  assert.match(h, /<button type="submit" disabled=""[^>]*>Salvar gasto<\/button>/);
  assert.match(h, /Nenhum gasto lançado ainda\./);
});

test("valor digitado aparece lido em reais, para \"1.620\" não virar R$ 1,62", () => {
  assert.match(html({ form: { campanha: "Remarketing", valor: "1.620", de: "2026-09-11", ate: "2026-10-10" } }), /= R\$\s1\.620,00/);
  assert.doesNotMatch(html({ form: { campanha: "Remarketing", valor: "abc", de: "2026-09-11", ate: "2026-10-10" } }), /= R\$/);
});

test("editando: salvar vira alteração e cancelar desfaz a edição", () => {
  const h = html({ editando: "l1" });
  assert.match(h, />Salvar alteração<\/button>/);
  assert.match(h, />Cancelar edição<\/button>/);
  assert.doesNotMatch(h, />Salvar gasto</);
});

test("excluir pede confirmação na própria linha, sem abrir outro diálogo", () => {
  const h = html({ excluindo: "l2" });
  assert.match(h, /Excluir este lançamento\?/);
  assert.match(h, /aria-label="Excluir mesmo o gasto de Remarketing, 01\/10 a 10\/10"/);
  assert.match(h, /aria-label="Manter o gasto de Remarketing, 01\/10 a 10\/10"/);
  assert.doesNotMatch(h, /aria-label="Editar gasto de Remarketing/);
  assert.match(h, /aria-label="Editar gasto de VIP Atacado — Goiânia/);
});

test("erro ao carregar: Tentar de novo, nunca lista vazia nem formulário", () => {
  const h = html({ carga: "erro" });
  assert.match(h, /Não deu para carregar os lançamentos\./);
  assert.match(h, />Tentar de novo<\/button>/);
  assert.doesNotMatch(h, /Nenhum gasto lançado|<form|<select/);
});

test("primeira carga anuncia; recarregar depois de salvar mantém a lista", () => {
  assert.match(html({ carga: "carregando", resposta: null }), /role="status"[^>]*>Carregando os lançamentos…/);
  const recarregando = html({ carga: "carregando" });
  assert.match(recarregando, /Remarketing/);
  assert.doesNotMatch(recarregando, /role="status"/);
});

test("erro de salvar aparece como alerta", () => {
  assert.match(html({ erro: "A data final vem antes da inicial." }), /role="alert"[^>]*>A data final vem antes da inicial\./);
});

test("botão do cabeçalho e rodapé do cartão abrem o diálogo", () => {
  const botao = renderToStaticMarkup(createElement(BotaoLancarGasto, { onClick: noop }));
  assert.match(botao, /aria-haspopup="dialog"/);
  assert.match(botao, />Lançar gasto<\/button>/);
  assert.match(
    renderToStaticMarkup(createElement(RodapeDoGasto, { quantos: 3, onLancar: noop })),
    /^3 lançamentos · <button[^>]*>lançar<\/button>$/,
  );
  assert.match(renderToStaticMarkup(createElement(RodapeDoGasto, { quantos: 0, onLancar: noop })), /^nenhum lançamento · /);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/resultados/anuncios/dialogo-de-gasto.test.ts`
Expected: FAIL — `Cannot find module './dialogo-de-gasto'`.

- [ ] **Step 3: Write the component**

```tsx
// apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.tsx
"use client";

import { useState } from "react";

import { Folha } from "@/components/painel/folha";
import type { Carga } from "@/lib/painel/types";
import { custo } from "@/lib/resultados/anuncios-tela";
import {
  formularioDe,
  formularioNovo,
  lerFormulario,
  periodoDoLancamento,
  textoDoRodape,
  valorLido,
  type FormularioDeGasto,
  type LancamentoDeGasto,
  type RespostaDoGasto,
} from "@/lib/resultados/gasto-de-anuncio";
import type { Periodo } from "@/lib/resultados/periodo-anuncios";
import { cn } from "@/lib/utils";

const BOTAO =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 text-[16px] text-volt-950 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const PRIMARIO =
  "min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 transition-[filter] hover:brightness-95 disabled:opacity-60";
const SECUNDARIO =
  "min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100";
const NA_LINHA = "min-h-9 rounded-md px-2.5 text-13 font-semibold";

/** Cabeçalho da aba (encaixe `acoesDoCabecalho` do PR 5b). */
export function BotaoLancarGasto({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" className={BOTAO}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      Lançar gasto
    </button>
  );
}

/** Rodapé do cartão "Gasto lançado" (encaixe `rodapeDoGasto`): "3 lançamentos · lançar". */
export function RodapeDoGasto({ quantos, onLancar }: { quantos: number; onLancar: () => void }) {
  return (
    <>
      {`${textoDoRodape(quantos)} · `}
      <button
        type="button"
        onClick={onLancar}
        aria-haspopup="dialog"
        className="font-semibold text-cobalt-500 underline-offset-2 hover:underline"
      >
        lançar
      </button>
    </>
  );
}

export type PropsDoConteudo = {
  carga: Carga;
  resposta: RespostaDoGasto | null;
  form: FormularioDeGasto;
  /** id do lançamento em edição; `null` = lançamento novo. */
  editando: string | null;
  /** id do lançamento pedindo confirmação de exclusão. */
  excluindo: string | null;
  salvando: boolean;
  erro: string | null;
  onCampo: (campo: keyof FormularioDeGasto, valor: string) => void;
  onSalvar: () => void;
  onCancelarEdicao: () => void;
  onEditar: (lancamento: LancamentoDeGasto) => void;
  onPedirExclusao: (id: string | null) => void;
  onExcluir: (id: string) => void;
  onFechar: () => void;
  aoTentarDeNovo: () => void;
};

/**
 * O miolo do diálogo (mockup Gasto): formulário em cima, lançamentos embaixo. Só
 * desenha. Erro nunca vira lista vazia (padrão `carga` da Vitrine); recarregar
 * depois de salvar mantém a lista anterior na tela até a nova chegar.
 */
export function ConteudoDoGasto(p: PropsDoConteudo) {
  return (
    <div className="space-y-5 pb-2">
      <p className="text-13 text-slate-600">
        Copie do Gerenciador de Anúncios a coluna “Valor usado” da campanha, no mesmo período.
      </p>
      {p.carga === "erro" ? (
        <div className="rounded-lg bg-canvas-100 px-3 py-3">
          <p className="text-15 text-volt-950">Não deu para carregar os lançamentos.</p>
          <button type="button" onClick={p.aoTentarDeNovo} className={cn(SECUNDARIO, "mt-2")}>
            Tentar de novo
          </button>
        </div>
      ) : p.resposta === null ? (
        <p role="status" className="text-13 text-slate-600">
          Carregando os lançamentos…
        </p>
      ) : (
        <>
          <Formulario {...p} campanhas={p.resposta.campanhas} />
          <Lancamentos {...p} lancamentos={p.resposta.lancamentos} />
        </>
      )}
    </div>
  );
}

function Formulario(p: PropsDoConteudo & { campanhas: readonly string[] }) {
  const semCampanha = p.campanhas.length === 0;
  const lido = valorLido(p.form.valor);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        p.onSalvar();
      }}
      className="flex flex-col gap-3.5"
    >
      <div className="flex flex-col gap-1.5">
        {semCampanha ? (
          <>
            <p className={ROTULO}>Campanha</p>
            <p className="text-13 text-slate-600">
              Nenhum nome de campanha chegou nos cadastros ainda. Lance o gasto quando o primeiro cadastro de anúncio
              chegar.
            </p>
          </>
        ) : (
          <>
            <label htmlFor="gasto-campanha" className={ROTULO}>
              Campanha
            </label>
            <select
              id="gasto-campanha"
              value={p.form.campanha}
              onChange={(e) => p.onCampo("campanha", e.target.value)}
              className={CAMPO}
            >
              <option value="">Escolha a campanha…</option>
              {p.campanhas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-13 text-slate-600">A lista vem dos nomes de campanha que já chegaram nos cadastros.</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gasto-valor" className={ROTULO}>
            Valor usado
          </label>
          <input
            id="gasto-valor"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="1.620,00"
            value={p.form.valor}
            onChange={(e) => p.onCampo("valor", e.target.value)}
            aria-describedby="gasto-valor-lido"
            className={cn(CAMPO, "font-data tabular-nums")}
          />
          <span id="gasto-valor-lido" aria-live="polite" className="font-data text-13 text-slate-600">
            {lido ?? ""}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gasto-de" className={ROTULO}>
            De
          </label>
          <input id="gasto-de" type="date" value={p.form.de} onChange={(e) => p.onCampo("de", e.target.value)} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gasto-ate" className={ROTULO}>
            Até
          </label>
          <input id="gasto-ate" type="date" value={p.form.ate} onChange={(e) => p.onCampo("ate", e.target.value)} className={CAMPO} />
        </div>
      </div>

      <p className="rounded-lg bg-canvas-100 px-3 py-2.5 text-13 text-slate-600">
        Se o período escolhido nos Resultados pegar só parte deste lançamento, entra a parte proporcional aos dias.
      </p>

      {p.erro && (
        <p role="alert" className="text-13 text-danger-700">
          {p.erro}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={p.editando ? p.onCancelarEdicao : p.onFechar} className={SECUNDARIO}>
          {p.editando ? "Cancelar edição" : "Cancelar"}
        </button>
        <button type="submit" disabled={p.salvando || semCampanha} className={PRIMARIO}>
          {p.salvando ? "Salvando…" : p.editando ? "Salvar alteração" : "Salvar gasto"}
        </button>
      </div>
    </form>
  );
}

function Lancamentos(p: PropsDoConteudo & { lancamentos: readonly LancamentoDeGasto[] }) {
  return (
    <section aria-labelledby="gasto-lancamentos" className="border-t border-line-200 pt-4">
      <h3 id="gasto-lancamentos" tabIndex={-1} className="font-brand text-15 font-semibold text-volt-950 focus:outline-none">
        Lançamentos
      </h3>
      {p.lancamentos.length === 0 ? (
        <p className="mt-2 text-13 text-slate-600">Nenhum gasto lançado ainda.</p>
      ) : (
        <ul className="mt-1">
          {p.lancamentos.map((l) => {
            const qual = `${l.utm_campaign}, ${periodoDoLancamento(l)}`;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-200 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-15 font-semibold text-volt-950">{l.utm_campaign}</span>
                  <span className="font-data text-13 text-slate-600">{periodoDoLancamento(l)}</span>
                </span>
                <span className="font-data text-15 tabular-nums text-volt-950">{custo(l.amount)}</span>
                {p.excluindo === l.id ? (
                  <>
                    <span className="text-13 text-volt-950">Excluir este lançamento?</span>
                    <button
                      type="button"
                      aria-label={`Excluir mesmo o gasto de ${qual}`}
                      onClick={() => p.onExcluir(l.id)}
                      disabled={p.salvando}
                      className={cn(NA_LINHA, "bg-danger-700 text-paper-0 disabled:opacity-60")}
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      aria-label={`Manter o gasto de ${qual}`}
                      autoFocus
                      onClick={() => p.onPedirExclusao(null)}
                      className={cn(NA_LINHA, "border border-line-200 text-volt-950 hover:bg-canvas-100")}
                    >
                      Manter
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Editar gasto de ${qual}`}
                      onClick={() => p.onEditar(l)}
                      className={cn(NA_LINHA, "border border-line-200 text-volt-950 hover:bg-canvas-100")}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir gasto de ${qual}`}
                      onClick={() => p.onPedirExclusao(l.id)}
                      className={cn(NA_LINHA, "text-danger-700 hover:bg-canvas-100")}
                    >
                      Excluir
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export type PropsDoDialogo = {
  carga: Carga;
  resposta: RespostaDoGasto | null;
  /** Período que a aba mostra: as datas do lançamento novo nascem nele. */
  periodo: Periodo;
  aoFechar: () => void;
  /** Refaz `GET /api/anuncios/gasto`. */
  aoTentarDeNovo: () => void;
  /** Lançou, editou ou excluiu: a página recarrega a lista e o relatório (o gasto proporcional mudou). */
  aoMudar: () => void;
};

const FALHA_DE_REDE = "Sem conexão. Confira a internet e tente de novo.";

/**
 * "Lançar gasto de anúncio" (spec §4, mockup Gasto). Monta já aberto: a página
 * monta quando abre e desmonta quando fecha, então o formulário sempre começa
 * limpo, com as datas do período atual.
 */
export function DialogoDeGasto({ carga, resposta, periodo, aoFechar, aoTentarDeNovo, aoMudar }: PropsDoDialogo) {
  const [form, setForm] = useState<FormularioDeGasto>(() => formularioNovo(periodo));
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function recomecar() {
    setForm(formularioNovo(periodo));
    setEditando(null);
    setErro(null);
  }

  async function enviar(url: string, init: RequestInit): Promise<boolean> {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      if (r.ok) return true;
      // Nossas rotas mandam `{ error }`; o 403 do guard de módulo é texto puro.
      const corpo: unknown = await r.json().catch(() => null);
      const mensagem = (corpo as { error?: unknown } | null)?.error;
      setErro(typeof mensagem === "string" ? mensagem : "Não deu para salvar o gasto.");
      return false;
    } catch {
      setErro(FALHA_DE_REDE);
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvar() {
    const lido = lerFormulario(form);
    if (!lido.ok) {
      setErro(lido.erro);
      return;
    }
    const ok = await enviar(editando ? `/api/anuncios/gasto/${editando}` : "/api/anuncios/gasto", {
      method: editando ? "PATCH" : "POST",
      body: JSON.stringify(lido.corpo),
    });
    if (!ok) return;
    recomecar();
    aoMudar();
  }

  async function excluir(id: string) {
    const ok = await enviar(`/api/anuncios/gasto/${id}`, { method: "DELETE" });
    setExcluindo(null);
    // O botão clicado some com a linha (ou com a confirmação): sem isto o foco cai no
    // <body>, fora do diálogo. Vai para o título da lista, que é onde a mudança aparece.
    document.getElementById("gasto-lancamentos")?.focus();
    if (!ok) return;
    // Excluiu o que estava editando: salvar depois daria 404.
    if (editando === id) recomecar();
    aoMudar();
  }

  return (
    <Folha aberta aoFechar={aoFechar} titulo="Lançar gasto de anúncio" testId="anuncios-gasto" emQualquerLargura>
      <ConteudoDoGasto
        carga={carga}
        resposta={resposta}
        form={form}
        editando={editando}
        excluindo={excluindo}
        salvando={salvando}
        erro={erro}
        onCampo={(campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))}
        onSalvar={() => void salvar()}
        onCancelarEdicao={recomecar}
        onEditar={(l) => {
          setForm(formularioDe(l));
          setEditando(l.id);
          setExcluindo(null);
          setErro(null);
          // O formulário fica em cima da lista: leva o foco para o valor, que é o que se corrige.
          document.getElementById("gasto-valor")?.focus();
        }}
        onPedirExclusao={setExcluindo}
        onExcluir={(id) => void excluir(id)}
        onFechar={aoFechar}
        aoTentarDeNovo={aoTentarDeNovo}
      />
    </Folha>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/resultados/anuncios/dialogo-de-gasto.test.ts`
Expected: PASS (11 testes).

Se o teste do `selected=""` falhar porque a versão do React em `main` serializa `<option>` de outro jeito, trocar a asserção para olhar o `value` do `<select>` com o mesmo rigor (a campanha atual marcada), nunca removê-la.

- [ ] **Step 5: Run the painel lint**

Run: `npm run painel:check`
Expected: `painel:check OK`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.tsx apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.test.ts
git commit -m "feat(resultados): ad spend dialog with inline delete confirmation"
```

### Task 4: Ligar na aba, vendedora barrada no E2E, gate e PR

**Files:**
- Modify: `apps/web/src/app/painel/resultados/anuncios/page.tsx`
- Modify: `apps/web/e2e/vendas-vendedora.spec.ts` (teste "as rotas do dono respondem 403 para ela; as de vendas, 200", logo depois da asserção de `/api/resultados/anuncios` que o PR 5a pôs)

**Interfaces:**
- Consumes: `BotaoLancarGasto`, `RodapeDoGasto`, `DialogoDeGasto` (Task 3); `ehRespostaDoGasto`, `iniciosDosLancamentos`, `RespostaDoGasto` (Task 1); `useRole()` (`{ role: TenantRole | null }`) de `@/components/painel/role-provider`; `hasPermission` de `@/lib/permissions`; `buscar(url, valido, guardar, marcar)` de `@/lib/painel/carregar`; a página do PR 5b (`carregar`, `atalho`) e as props `acoesDoCabecalho`, `rodapeDoGasto`, `iniciosDeGasto` da `AbaAnuncios`.
- Produces: nada além da tela.

**De onde vêm os três encaixes:**
- `acoesDoCabecalho` — `BotaoLancarGasto`, só com `ads:manage`.
- `rodapeDoGasto` — `RodapeDoGasto` com `gasto.lancamentos.length`, só com `ads:manage` e depois que `GET /api/anuncios/gasto` respondeu (até lá o cartão mostra o texto do PR 5b).
- `iniciosDeGasto` — `iniciosDosLancamentos(gasto.lancamentos)`: **os lançamentos de `GET /api/anuncios/gasto`** (`starts_on` e `utm_campaign` de cada um). O relatório não serve: só traz o gasto somado e proporcional por campanha, sem datas. `marcasDeGasto` (PR 5b) descarta o começo fora do período e junta dois começos no mesmo dia.

- [ ] **Step 1: A página** — é a página do PR 5b com o gasto ligado. Se `main` divergir do bloco abaixo fora das partes de gasto (por exemplo, o PR 6 mexeu nela), manter o que está em `main` e acrescentar só: os imports novos, o bloco "Gasto é dado de caixa…" até `inicios`, o `<>…</>` com as três props novas na `AbaAnuncios` e o `DialogoDeGasto`.

```tsx
// apps/web/src/app/painel/resultados/anuncios/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRole } from "@/components/painel/role-provider";
import { AbaAnuncios } from "@/components/painel/resultados/anuncios/aba-anuncios";
import {
  BotaoLancarGasto,
  DialogoDeGasto,
  RodapeDoGasto,
} from "@/components/painel/resultados/anuncios/dialogo-de-gasto";
import { dayBR } from "@/lib/date-br";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import { hasPermission } from "@/lib/permissions";
import { ehRespostaAnuncios } from "@/lib/resultados/anuncios-tela";
import { ehRespostaDoGasto, iniciosDosLancamentos, type RespostaDoGasto } from "@/lib/resultados/gasto-de-anuncio";
import { periodoDoAtalho, type AtalhoDoPeriodo } from "@/lib/resultados/periodo-anuncios";
import type { RespostaAnuncios } from "@/lib/resultados/relatorio-anuncios";

/**
 * Resultados › Anúncios (spec 2026-10-10-funil-anuncios §4). Uma consulta do
 * relatório, refeita a cada troca de período; para quem tem `ads:manage`, mais a
 * lista de lançamentos de gasto, que liga o botão, o rodapé do cartão e as marcas
 * do gráfico.
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

  // Gasto é dado de caixa (`ads:manage`: dono e administração). Papel ainda
  // carregando (`null`) também não busca: o operador receberia 403 da rota.
  const { role } = useRole();
  const lancaGasto = role !== null && hasPermission(role, "ads:manage");
  const [gasto, setGasto] = useState<RespostaDoGasto | null>(null);
  const [cargaDoGasto, setCargaDoGasto] = useState<Carga>("carregando");
  const [lancando, setLancando] = useState(false);

  const carregarGasto = useCallback(() => {
    void buscar("/api/anuncios/gasto", ehRespostaDoGasto, setGasto, setCargaDoGasto);
  }, []);

  useEffect(() => {
    if (lancaGasto) carregarGasto();
  }, [lancaGasto, carregarGasto]);

  // Lançar, editar ou excluir muda o gasto proporcional do relatório: os dois recarregam.
  const aoMudarGasto = useCallback(() => {
    carregarGasto();
    carregar();
  }, [carregarGasto, carregar]);

  const abrir = useCallback(() => setLancando(true), []);
  const inicios = useMemo(() => (gasto ? iniciosDosLancamentos(gasto.lancamentos) : undefined), [gasto]);

  return (
    <>
      <AbaAnuncios
        atalho={atalho}
        onAtalho={setAtalho}
        carga={carga}
        resposta={resposta}
        hoje={dayBR()}
        aoTentarDeNovo={carregar}
        acoesDoCabecalho={lancaGasto ? <BotaoLancarGasto onClick={abrir} /> : undefined}
        rodapeDoGasto={
          lancaGasto && gasto ? <RodapeDoGasto quantos={gasto.lancamentos.length} onLancar={abrir} /> : undefined
        }
        iniciosDeGasto={lancaGasto ? inicios : undefined}
      />
      {lancaGasto && lancando && (
        <DialogoDeGasto
          carga={cargaDoGasto}
          resposta={gasto}
          periodo={periodoDoAtalho(atalho, new Date())}
          aoFechar={() => setLancando(false)}
          aoTentarDeNovo={carregarGasto}
          aoMudar={aoMudarGasto}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Vendedora no E2E** — em `e2e/vendas-vendedora.spec.ts`, dentro do teste "as rotas do dono respondem 403 para ela; as de vendas, 200", **depois da última asserção do funil** — a de `/api/resultados/anuncios` (PR 5a) ou, se o PR 6a já estiver em `main`, a dele com `/pessoas`, que entra no mesmo lugar. Não reordenar o que já está lá:

```ts
    // Gasto de anúncio (funil de anúncios, PR 7): dado de caixa, fora do mapa dela em todo verbo.
    const gasto = await page.request.get("/api/anuncios/gasto");
    expect(gasto.status()).toBe(403);
    expect(await gasto.text()).toBe(MENSAGEM_BLOQUEIO);
    const lancar = await page.request.post("/api/anuncios/gasto", {
      data: { utm_campaign: "C1", amount: 100, starts_on: "2026-10-01", ends_on: "2026-10-10" },
    });
    expect(lancar.status()).toBe(403);
    expect(await lancar.text()).toBe(MENSAGEM_BLOQUEIO);
    const editar = await page.request.patch("/api/anuncios/gasto/00000000-0000-4000-8000-000000000000", {
      data: { utm_campaign: "C1", amount: 100, starts_on: "2026-10-01", ends_on: "2026-10-10" },
    });
    expect(editar.status()).toBe(403);
    expect(await editar.text()).toBe(MENSAGEM_BLOQUEIO);
    const apagar = await page.request.delete("/api/anuncios/gasto/00000000-0000-4000-8000-000000000000");
    expect(apagar.status()).toBe(403);
    expect(await apagar.text()).toBe(MENSAGEM_BLOQUEIO);
```

- [ ] **Step 3: Gate local** (em `apps/web`)

Run: `npm run lint` · `npx tsc --noEmit --project tsconfig.json` · `npx tsc --noEmit --project tsconfig.e2e.json` · `npm test` · `npm run painel:check`
Expected: tudo verde; `npm test` com os 32 testes novos (9 + 12 + 11).

Depois, em PowerShell, o gate do CI a partir do worktree:

```
Set-Location <caminho do worktree pr7>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 4: Conferir no navegador** (dev local com `HUBFLOW_USE_SUPABASE=1`, banco dev; em worktree, pelo Playwright — o `preview_start` serve o checkout principal), logado como dono, em `/painel/resultados/anuncios`:
  - "Lançar gasto" no cabeçalho abre "Lançar gasto de anúncio"; Esc fecha e o foco volta ao botão;
  - o seletor abre em "Escolha a campanha…"; salvar sem escolher mostra "Escolha a campanha.";
  - digitar "1.620" mostra "= R$ 1.620,00"; salvar → o lançamento aparece na lista, o cartão "Gasto lançado" e o retorno mudam, e o rodapé conta "1 lançamento · lançar";
  - se o lançamento começa dentro do período, o gráfico por dia ganha a marca daquele dia;
  - Editar → o formulário traz o valor "1.620,00"; "Salvar alteração" troca na lista;
  - editar um lançamento e, sem salvar, excluir o mesmo → o formulário volta a "Salvar gasto" (não sobra edição de um id que não existe);
  - Excluir → "Excluir este lançamento?"; Manter desfaz; Excluir apaga e o gasto some do cartão;
  - em 390 px o diálogo vira folha de baixo, os três campos empilham;
  - logado como operador da mesma loja (se houver usuário de teste com esse papel): nenhum botão "Lançar gasto", nenhum "lançar" no cartão, e a aba de rede não mostra `GET /api/anuncios/gasto`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/painel/resultados/anuncios/page.tsx apps/web/e2e/vendas-vendedora.spec.ts
git commit -m "feat(resultados): wire ad spend into the ads tab; seller gets 403 on spend routes"
```

- [ ] **Step 6: PR** — `git fetch origin main && git log HEAD..origin/main --oneline` (atrasada → `git merge origin/main` antes do push, por causa da baseline do drift entre PRs paralelos); push e PR "feat(resultados): lançar gasto de anúncio (funil de anúncios, PR 7)", corpo com as decisões (lista de campanhas pelo relatório de 400 dias, API aceita nome que ainda não chegou, PATCH com os quatro campos, "1.620" = mil seiscentos e vinte, exclusão confirmada na linha, anotação pelos lançamentos), print do diálogo em 1280 e 390 px, terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. CI verde (o job e2e roda o 403 da vendedora contra o banco dev) → mergear → apagar a branch.

- [ ] **Step 7: Prova em prod depois do deploy**, logado como dono da loja-piloto, no console do navegador em `/painel`:

```js
await (await fetch("/api/anuncios/gasto")).json()
```

Expected: `{ lancamentos: [...], campanhas: [<os utm_campaign que o site já mandou>] }`. Lançar um gasto pela tela para uma campanha da lista e conferir que a faixa mostra o gasto e o retorno do período; excluir em seguida se for teste.

- [ ] **Step 8: Card** (prod, pelo Igor — `move_card` é DML): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 7: lançar gasto no ar (rotas com ads:manage, diálogo, rodapé e marca no gráfico); prova do funil inteiro no PR 8', 'PR #<n>');`

---

## O que precisa do Igor

- Nada de DDL: este PR não cria tabela, função nem índice (a lista de campanhas sai do `attribution_report` que já existe, e o caso "nome que nunca chegou" já está no SQL do PR 1).
- O `move_card` do Step 8, em prod.
- Push e merge do PR, se o classificador barrar.
