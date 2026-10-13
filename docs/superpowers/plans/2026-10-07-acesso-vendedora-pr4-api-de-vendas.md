# Acesso da vendedora — PR 4 (API de vendas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendedora (e qualquer membro) busca um cliente pelo número sem ver a lista, registra uma venda com produtos (nome · quantidade · valor unitário), vê as próprias vendas do mês e corrige/apaga a venda dela até 24 h — tudo por `/api/vendas/*`, gravando pela RPC `create_order_with_items` com `created_by`. A atribuição de campanha, o lead → `comprou` e o marco `first_order` passam a viver num helper só, usado também pelo `POST /api/orders`.

**Architecture:** Três rotas finas (`contato`, raiz, `[id]`) sobre `lib/vendas/request.ts` (zod, frases de tela, quem chama, tradução das exceções das RPCs) e `lib/stores/vendas.ts` (queries e RPCs, sempre `.eq("tenant_id")`). Regras puras em `lib/vendas/telefone.ts` (variantes do número, contrato) e `lib/vendas/month.ts` (mês de Brasília). `lib/orders/registrar.ts` envolve a gravação (`addOrder` no `/api/orders`, RPC no `/api/vendas`) com campanha → gravar → comprou → marco. Nenhuma mudança de banco: as RPCs, `order_items` e `created_by` são do PR 2; o guard de módulo e o `authUserId` no contexto são do PR 3.

**Tech Stack:** Next.js 15 (route handlers, runtime nodejs), TypeScript strict, zod v4, `@supabase/supabase-js` (service-role), `node --test` via tsx com GoTrue/PostgREST falsos (padrão do #340).

**Spec:** `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` (§3 API, §6 bordas, §9 medição) · **Contrato:** `docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md` ("PR 1 → PR 4", "PR 2 → PR 3, 4, 6", "PR 3 → PR 4, 5, 6" consumidos; "PR 4 → PR 5" produzido).

## Global Constraints

Regras que valem para os seis PRs (índice):

- Código, identificadores e commits em inglês; texto de tela e de erro em pt-BR. Commits com prefixo semântico e terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Os nomes do contrato (`variantesDoTelefone`, `telefoneCanonico`, `ItemDeVenda`, `VendaDoMes`…) e os caminhos fixados pela spec ficam exatamente como estão; todo identificador **novo** deste plano é em inglês. Comentários em pt-BR (norma do repo).
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos (os **dois**) `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; suíte `npm test`.
- Antes do push: `infra/scripts/verify-local.ps1` (secrets + build) — é o gate real; o `verify` do CI é pulado na `main`. (O índice escreve `scripts/verify-local.ps1`; o arquivo mora em `infra/scripts/`.)
- Nunca `git add -A`. `git diff --cached --stat` numa chamada **separada** antes de cada commit. Git sempre com `git -C <W>` (o cwd do Bash reseta entre chamadas).
- Store Supabase: **sempre** `.eq("tenant_id", tenantId)` — o service-role ignora RLS.
- Card `acesso-vendedora` no quadro de prod ao começar e ao terminar (SQL na Task 0 e na Task 8; DML em prod passa pelo Igor).
- Fechar o loop na mesma sessão. Ao encerrar: "PRs que deixei abertos: …".

Deste PR:

- **Nada de banco aqui.** Sem migração, sem DDL. Se as RPCs do PR 2 não existirem em dev **e** prod, parar (Task 0).
- A vendedora nunca recebe lista de contatos: a busca devolve um contato ou `null`.
- Chaves de rate limit exatamente `vendas-busca:${authUserId}` (30/min) e `vendas-registro:${tenantId}` (60/min).
- `orders.value` continua sendo o total. `POST /api/orders` não muda de contrato (valor único, `addOrder`, sem itens).
- Frases de tela: "Digite o número com DDD." e "Preencha nome, quantidade e valor de cada produto." (mockup), "Passou de 24 horas: só o dono da loja corrige." (spec), "Contato não encontrado." (contrato do PR 1).
- Resposta 500 nunca leva a mensagem do banco (vai pro `console.error`).
- `<W>` = raiz do worktree da sessão (ex.: `C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\<nome>`). Comandos `npx`/`npm` rodam em `<W>\apps\web`; caminhos de arquivo abaixo são relativos a `apps/web` salvo indicação.

## Decisões deste plano (e por quê)

1. **`/api/orders` continua no `addOrder`; o helper só compartilha o entorno.** `recordOrder(tenantId, lead, write)` faz campanha → `write(campaignId)` → lead `comprou` → marco `first_order`; quem grava é o chamador. Gravar o pedido de valor único como 1 item sintético `{ name: "Pedido" }` contradiria a spec: "Pedido antigo (sem itens) aparece como 'Pedido sem itens'" e "Fora da v1: itens no 'Registrar pedido' do dono" — o pedido do dono passaria a aparecer com um produto falso chamado "Pedido".
2. **Lead nascido de venda, sem grupo de origem, pelo `upsert_lead`.** A RPC aceita grupo nulo: todos os `target_source_*` têm `default null` e as colunas são nullable (`supabase/migrations/20260727120000_leads_and_worker_reads.sql` L17–31 e L214–221). Reusa `addLead`; só `AddLeadInput.sourceGroup` vira opcional (`lib/stores/leads.ts` L136–142). O "sourceGroup é obrigatório" continua na rota `/api/leads` (L60–63), que é onde ele é regra (ingestão de grupo).
3. **Opt-out por variante, não por `isOptedOut`.** `isOptedOut` (`lib/stores/optouts.ts` L71–83) compara um número exato; descadastro gravado como `11987654321` não barraria `5511987654321`. A busca e o POST consultam `optouts` com `.in("phone", variantes)`. Em opt-out a busca devolve `contato: null` (não reexibe quem pediu pra sair) e o POST sem `leadId` registra **sem** lead (spec §3).
4. **"Mais recente primeiro" = `entered_at desc`** — não nulo e imutável; `last_seen_at` é nulo em lead `@lid`.
5. **Telefone e grupo do pedido.** Com lead: o telefone gravado no lead e `group_name` = grupo de origem do lead (o mesmo que "Registrar pedido" de Contatos manda — `components/painel/contatos/vitrine/contatos-vitrine.tsx` L377 —, para Resultados "por grupo" continuar coerente). Sem lead (opt-out): `55` + DDD + número (`telefoneCanonico`).
6. **Resposta do POST/PATCH sem reler o pedido.** Monta a `VendaDoMes` com a linha que a RPC devolve (`value` do banco) + os itens enviados, já arredondados em centavos antes da RPC. Uma releitura que falhasse depois do insert viraria 500 com a venda gravada — e o clique de novo duplicaria.
7. **Nome do cliente na lista em lotes de 100 ids.** `orders.lead_id` não tem FK para `leads` (`20260701030000_templates_orders_referrals.sql` L30), então `leads(name)` não embute; 1000 UUIDs numa URL passam dos ~8 KB do servidor.
8. **Validação antes de qualquer escrita.** Itens, total > 0 e telefone são conferidos antes de criar lead ou chamar a RPC: venda recusada não deixa lead órfão.

## File Structure

| Arquivo (em `apps/web/`) | Ação | Responsabilidade |
|---|---|---|
| `src/lib/vendas/telefone.ts` (+ `.test.ts`) | criar | `variantesDoTelefone`, `telefoneCanonico` (contrato, puro) |
| `src/lib/vendas/tipos.ts` | criar | tipos de resposta (contrato, sem `server-only`) |
| `src/lib/vendas/month.ts` (+ `.test.ts`) | criar | mês de Brasília (`brasiliaMonth`, `monthRange`, `MONTH_FORMAT`) |
| `src/lib/orders/registrar.ts` (+ `.test.ts`) | criar | `recordOrder`: campanha, comprou, `first_order` em volta da gravação |
| `src/app/api/orders/route.ts` | modificar | `POST` passa a usar `recordOrder` (continua no `addOrder`) |
| `src/lib/stores/leads.ts` | modificar | `AddLeadInput.sourceGroup` opcional |
| `src/lib/stores/vendas.ts` (+ `.test.ts`) | criar | leads por variante/id, opt-out, RPCs, mês, apagar, nomes |
| `src/lib/vendas/request.ts` | criar | zod, frases, `getSalesCaller`, `itemsForRpc`, `handleSalesErrors` |
| `src/app/api/vendas/contato/route.ts` | criar | `GET` busca por número |
| `src/app/api/vendas/route.ts` | criar | `GET` minhas vendas do mês, `POST` registrar |
| `src/app/api/vendas/[id]/route.ts` | criar | `PATCH` corrigir, `DELETE` apagar |
| `src/app/api/vendas/routes.test.ts` | criar | as rotas com GoTrue + PostgREST falsos |
| `src/lib/auth/modulos-rotas.test.ts` (do PR 3) | modificar | sai `PENDENTES_DO_PR_4` |

11 arquivos de produção + 6 de teste. A spec já partiu o PR 4 original em API (este) e tela (PR 5).

**Ordem / waves:** Tasks 1, 2 e 3 têm arquivos disjuntos e nenhuma dependência entre si (podem ir juntas). 4 depende de 2. 5 depende de 1 e 4. 6 depende de 3 e 5. 7 depende de 6. Com subagentes em paralelo, os passos de commit são do controller, na ordem das tasks.

---

### Task 0: preparação (branch, pré-requisitos, dependências, card, medição)

**Files:** nenhum arquivo do repo.
**Depends-on:** PRs 1, 2 e 3 mergeados em `main`; PR 2 aplicado em dev **e** prod.

- [ ] **Step 1: branch a partir de `origin/main`.** A sessão do app já roda num worktree próprio: criar a branch **nele**, não um worktree extra (o harness bloqueia escrita em outro worktree).

```bash
git -C <W> fetch origin main
git -C <W> status --short
git -C <W> switch -c feat/vendas-api origin/main
git -C <W> branch --unset-upstream
```

`status --short` tem que sair vazio antes do `switch`. Se a sessão estiver no checkout principal (sem worktree), usar `git worktree add .claude/worktrees/feat-vendas-api -b feat/vendas-api origin/main` e trabalhar lá.

- [ ] **Step 2: defasagem.** `git -C <W> log HEAD..origin/main --oneline` → vazio (a branch acabou de nascer de `origin/main`).

- [ ] **Step 3: o que os PRs 1–3 entregaram está em `main`.** Cada comando abaixo tem que achar pelo menos uma linha:

```bash
grep -n "export async function addOrder(tenantId: string" <W>/apps/web/src/lib/stores/orders.ts
grep -n "Contato não encontrado" <W>/apps/web/src/app/api/orders/route.ts
grep -n "authUserId" <W>/apps/web/src/lib/route-tenant-context.ts
grep -n "\"seller\"" <W>/apps/web/src/lib/permissions.ts
grep -n "MENSAGEM_BLOQUEIO" <W>/apps/web/src/lib/supabase/tenant-context.ts
grep -rn "create_order_with_items\|replace_order_items" <W>/apps/web/supabase/migrations
grep -rn "fora_da_janela\|pedido_nao_encontrado\|itens_invalidos\|total_zero" <W>/apps/web/supabase/migrations
```

Ler a migração das RPCs que o último grep achar e conferir os nomes dos parâmetros (`p_tenant_id, p_created_by, p_lead_id, p_phone, p_group_name, p_campaign_id, p_items` e `p_tenant_id, p_order_id, p_items, p_only_author`) e as quatro mensagens. Qualquer diferença com o contrato: **parar** e acertar o índice primeiro (regra do índice: nome fora dele não entra). Anotar também se `grep -rn "PENDENTES_DO_PR_4" <W>/apps/web/src` acha algo (usado na Task 7).

O Igor confirma que as RPCs existem nos **dois** bancos (leitura; o classificador barra até leitura em prod):

```sql
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('create_order_with_items', 'replace_order_items');
```

Duas linhas em dev (`wfjuwogxaupyadwhvoxy`) e duas em prod (`nidoatbxaylrkcgbszns`). Menos que isso → parar: a rota cairia em 500 em produção.

- [ ] **Step 4: dependências.** `Test-Path <W>\apps\web\node_modules\next` (PowerShell). Se `False`: conferir se o checkout principal tem `node_modules` populado (`(Get-ChildItem C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules).Count` > 0); se sim, as duas junctions com caminho absoluto:

```powershell
cmd /c mklink /J "<W>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
cmd /c mklink /J "<W>\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules"
```

Se o principal estiver vazio: `npm ci` na raiz do worktree (`<W>`).

- [ ] **Step 5: card (Igor, prod).**

```sql
select public.move_card('acesso-vendedora', 'em_construcao',
  'PR 4 começou: API de vendas (busca por número, registrar com itens, minhas vendas, corrigir/apagar em 24h)',
  'feat/vendas-api');
```

- [ ] **Step 6: medição do §9 (Igor, prod).** O Igor roda o SQL do §9 da spec em prod e cola o resultado. Anotar `leads_phone` (`total`, `com_phone`, `com_55`) para o corpo do PR (Task 8). Leitura:
  - `com_phone/total` alto → a busca acha a maioria dos clientes.
  - `com_phone/total` baixo (contatos em regime LID, sem telefone) → **nada muda no código**: a busca devolve `{ contato: null, optout: false }` e a venda cria um contato novo com telefone (spec §6: "avisar na tela ('cliente novo') é o comportamento correto, não bug"). O teste "ninguém com esse número → contato null" (Task 5) segura esse caminho. O número só entra no PR como contexto para a tela (PR 5).
  - `com_55` ≠ `com_phone` → é exatamente o caso das variantes com/sem 55 (Task 1).

---

### Task 1: variantes do telefone (TDD)

**Files:** criar `src/lib/vendas/telefone.ts`, `src/lib/vendas/telefone.test.ts`
**Depends-on:** none
**Interfaces (produz, contrato PR 4 → PR 5):**
```ts
export function variantesDoTelefone(entrada: string): string[] | null;
export function telefoneCanonico(entrada: string): string | null;
```

- [ ] **Step 1 (teste):** `src/lib/vendas/telefone.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { telefoneCanonico, variantesDoTelefone } from "./telefone";

const WITH_NINE = ["11987654321", "5511987654321", "1187654321", "551187654321"];
const WITHOUT_NINE = ["1187654321", "551187654321", "11987654321", "5511987654321"];

/**
 * O banco grava só dígitos e não normaliza o 55 nem o 9º dígito: o mesmo
 * cliente pode estar em qualquer uma dessas formas. A primeira variante é
 * sempre o número como foi digitado.
 */
const CASES: Array<{ why: string; input: string; variants: string[] | null; canonical: string | null }> = [
  { why: "celular com 9, só dígitos", input: "11987654321", variants: WITH_NINE, canonical: "5511987654321" },
  { why: "celular formatado com +55", input: "+55 (11) 98765-4321", variants: WITH_NINE, canonical: "5511987654321" },
  { why: "celular com o 55 colado", input: "5511987654321", variants: WITH_NINE, canonical: "5511987654321" },
  { why: "celular antigo sem o 9 ganha a variante com 9", input: "(11) 8765-4321", variants: WITHOUT_NINE, canonical: "551187654321" },
  { why: "celular antigo com 55", input: "551187654321", variants: WITHOUT_NINE, canonical: "551187654321" },
  { why: "fixo (começa em 2 a 5) não ganha 9", input: "1133334444", variants: ["1133334444", "551133334444"], canonical: "551133334444" },
  { why: "DDD 55 com 10 dígitos não perde o 55", input: "5532221100", variants: ["5532221100", "555532221100"], canonical: "555532221100" },
  { why: "menos de 10 dígitos", input: "987654321", variants: null, canonical: null },
  { why: "DDD terminado em zero", input: "1087654321", variants: null, canonical: null },
  { why: "DDD começando em zero", input: "0187654321", variants: null, canonical: null },
  { why: "dígitos demais", input: "55119876543210", variants: null, canonical: null },
  { why: "lixo", input: "abc", variants: null, canonical: null },
  { why: "vazio", input: "", variants: null, canonical: null },
];

for (const { why, input, variants, canonical } of CASES) {
  test(`${why}: ${JSON.stringify(input)}`, () => {
    assert.deepEqual(variantesDoTelefone(input), variants);
    assert.equal(telefoneCanonico(input), canonical);
  });
}
```

- [ ] **Step 2:** em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/vendas/telefone.test.ts` → FAIL (`Cannot find module './telefone'`).

- [ ] **Step 3 (implementação):** `src/lib/vendas/telefone.ts`

```ts
/**
 * O telefone que a vendedora digita → as formas em que o mesmo número pode
 * estar gravado em `leads.phone`.
 *
 * O banco grava só dígitos (`upsert_lead`) e não normaliza o 55 nem o 9º
 * dígito: o worker grava o que o WhatsApp entrega e o "Registrar pedido" grava
 * o que foi digitado. O mesmo cliente pode estar como 5511987654321,
 * 11987654321 ou 1187654321 — a busca pergunta por todas.
 *
 * Puro, sem `server-only`: a tela de vendas usa as mesmas regras.
 */

/** DDD (11 a 99, nenhum termina em zero) + 8 ou 9 dígitos. */
const NATIONAL_NUMBER = /^[1-9][1-9]\d{8,9}$/;

/** DDD + número, sem o 55. null se não for número brasileiro com DDD. */
function nationalNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  // 12–13 dígitos começando em 55 = país + DDD + número. Com 10–11, o 55 é o DDD (RS).
  const withoutCountry =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  return NATIONAL_NUMBER.test(withoutCountry) ? withoutCountry : null;
}

/** O mesmo celular com e sem o 9 da frente (o 9º dígito entrou entre 2012 e 2016). */
function withAndWithoutNine(national: string): string[] {
  const ddd = national.slice(0, 2);
  const number = national.slice(2);
  if (number.length === 9 && number.startsWith("9")) return [national, ddd + number.slice(1)];
  if (number.length === 8 && /^[6-9]/.test(number)) return [national, `${ddd}9${number}`];
  return [national];
}

/** Dígitos → variantes com/sem 55 e com/sem 9º dígito. null se < 10 dígitos nacionais. */
export function variantesDoTelefone(entrada: string): string[] | null {
  const national = nationalNumber(entrada);
  if (!national) return null;
  return [...new Set(withAndWithoutNine(national).flatMap((variant) => [variant, `55${variant}`]))];
}

/** "55" + DDD + número como digitado (com o 9 se veio com 9). null se inválido. */
export function telefoneCanonico(entrada: string): string | null {
  const national = nationalNumber(entrada);
  return national ? `55${national}` : null;
}
```

- [ ] **Step 4:** mesmo comando do Step 2 → PASS (13 testes).
- [ ] **Step 5 (commit):**

```bash
git -C <W> add apps/web/src/lib/vendas/telefone.ts apps/web/src/lib/vendas/telefone.test.ts
```
```bash
git -C <W> diff --cached --stat
```
```bash
git -C <W> commit -m "feat(vendas): phone variants for the sale lookup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: tipos de resposta e mês de Brasília (TDD)

**Files:** criar `src/lib/vendas/tipos.ts`, `src/lib/vendas/month.ts`, `src/lib/vendas/month.test.ts`
**Depends-on:** none
**Interfaces (produz):**
```ts
// tipos.ts — exatamente o contrato PR 4 → PR 5
export type ItemDeVenda; export type ContatoDaVenda; export type BuscaDeContato; export type VendaDoMes; export type VendasDoMes;
// month.ts
export const MONTH_FORMAT: RegExp;
export function brasiliaMonth(now: Date): string;              // "YYYY-MM"
export function monthRange(month: string): { start: string; end: string }; // ISO UTC, [start, end)
```

- [ ] **Step 1:** `src/lib/vendas/tipos.ts` (o bloco do contrato, sem mudar nome nem forma):

```ts
/**
 * Respostas de `/api/vendas/*` (spec 2026-10-07 §3; contrato PR 4 → PR 5 no
 * índice). Sem `server-only`: a tela de vendas importa daqui.
 */
export type ItemDeVenda = { nome: string; quantidade: number; valorUnitario: number };
export type ContatoDaVenda = { id: string; nome: string | null; telefone: string };
export type BuscaDeContato = { contato: ContatoDaVenda | null; optout: boolean };
export type VendaDoMes = {
  id: string; cliente: string | null; telefone: string; total: number; criadaEm: string;
  itens: ItemDeVenda[]; editavel: boolean;
};
export type VendasDoMes = { mes: string; total: number; quantidade: number; truncado: boolean;
  vendas: VendaDoMes[] };
```

- [ ] **Step 2 (teste):** `src/lib/vendas/month.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { MONTH_FORMAT, brasiliaMonth, monthRange } from "./month";

test("o mês vira à meia-noite de Brasília, três horas depois de Greenwich", () => {
  assert.equal(brasiliaMonth(new Date("2026-11-01T02:59:59.999Z")), "2026-10");
  assert.equal(brasiliaMonth(new Date("2026-11-01T03:00:00.000Z")), "2026-11");
});

test("faixa do mês: dia 1 às 00h de Brasília até o dia 1 seguinte, exclusivo", () => {
  assert.deepEqual(monthRange("2026-10"), { start: "2026-10-01T03:00:00.000Z", end: "2026-11-01T03:00:00.000Z" });
  // Mutante: dezembro sem virar o ano.
  assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01T03:00:00.000Z", end: "2027-01-01T03:00:00.000Z" });
});

test("formato aceito em ?mes=", () => {
  for (const valid of ["2026-01", "2026-10", "2099-12"]) assert.ok(MONTH_FORMAT.test(valid), valid);
  for (const invalid of ["2026-13", "2026-00", "2026-1", "1999-12", "2026-10-01", "out/2026", ""]) {
    assert.ok(!MONTH_FORMAT.test(invalid), invalid);
  }
});
```

- [ ] **Step 3:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/vendas/month.test.ts` → FAIL (módulo não existe).

- [ ] **Step 4 (implementação):** `src/lib/vendas/month.ts`

```ts
/**
 * O mês das vendas no fuso de Brasília: venda das 22h do dia 31 é do mês que
 * acaba, não do que já começou em Greenwich. UTC−3 fixo — o Brasil não tem
 * horário de verão desde 2019. Puro: a tela pode usar a mesma regra.
 */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "YYYY-MM" aceito em `?mes=`. Só anos 20xx: `Date.UTC` lê 0–99 como 1900 em diante. */
export const MONTH_FORMAT = /^20\d{2}-(0[1-9]|1[0-2])$/;

/** O mês ("YYYY-MM") em que o instante cai, em Brasília. */
export function brasiliaMonth(now: Date): string {
  return new Date(now.getTime() - BRASILIA_OFFSET_MS).toISOString().slice(0, 7);
}

/** Início (inclusivo) e fim (exclusivo) do mês de Brasília, em ISO UTC. Recebe um mês já validado. */
export function monthRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1) + BRASILIA_OFFSET_MS).toISOString(),
    end: new Date(Date.UTC(year, monthNumber, 1) + BRASILIA_OFFSET_MS).toISOString(),
  };
}
```

- [ ] **Step 5:** comando do Step 3 → PASS. `npx tsc --noEmit -p tsconfig.json` limpo.
- [ ] **Step 6 (commit):**

```bash
git -C <W> add apps/web/src/lib/vendas/tipos.ts apps/web/src/lib/vendas/month.ts apps/web/src/lib/vendas/month.test.ts
```
```bash
git -C <W> diff --cached --stat
```
```bash
git -C <W> commit -m "feat(vendas): response types and the Brasilia month range" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: o entorno do pedido num helper só (TDD)

**Files:** criar `src/lib/orders/registrar.ts`, `src/lib/orders/registrar.test.ts`; modificar `src/app/api/orders/route.ts`, `src/lib/stores/leads.ts`
**Depends-on:** none (consome `addOrder(tenantId, …)` do PR 1)
**Interfaces:**
```ts
// produz — lib/orders/registrar.ts
export type OrderLead = LeadAttribution & { id: string };
export async function recordOrder<O extends { id: string }>(
  tenantId: string,
  lead: OrderLead | null,
  write: (campaignId: string | undefined) => Promise<O>,
): Promise<O>;
// muda — lib/stores/leads.ts
export type AddLeadInput = { phone: string; name?: string; sourceGroup?: string; sourceGroupId?: string; sourceCampaign?: string };
// consome
addOrder(tenantId, { phone?, leadId?, group?, campaignId?, value }) // PR 1
countOrders(tenantId), updateLeadStatus(tenantId, id, "comprou"), listCampaignGroups(tenantId),
resolveCampaignId(lead, campaigns), trackFunnelEvent({ … })
```

O que sai do `POST /api/orders` (hoje `src/app/api/orders/route.ts` L46–82; o PR 1 trocou `addOrder({…})` por `addOrder(tenantId, {…})` e acrescentou a conferência do lead): atribuição (L49–60), lead → `comprou` (L69–73), marco `first_order` (L75–82).

- [ ] **Step 1 (teste):** `src/lib/orders/registrar.test.ts`

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { recordOrder as RecordOrder } from "./registrar";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (padrão de
 * `stores/leads.test.ts`): a query que sai daqui é a de produção, só a rede é
 * trocada. Cobre as duas rotas que gravam pedido — /api/orders e /api/vendas
 * chamam este mesmo `recordOrder`.
 */

type Seen = { method: string; url: URL; body: unknown };
type Reply = { status: number; body?: unknown; contentRange?: string };

const seen: Seen[] = [];
let reply: (request: Seen) => Reply = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let text = "";
  req.on("data", (chunk) => (text += chunk));
  req.on("end", () => {
    const request: Seen = {
      method: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      body: text ? JSON.parse(text) : undefined,
    };
    seen.push(request);
    const { status, body, contentRange } = reply(request);
    // `.maybeSingle()` fora de GET pede um objeto, não a lista.
    const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const payload = single && Array.isArray(body) ? body[0] : body;
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (payload !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
});

let recordOrder: typeof RecordOrder;

before(async () => {
  await new Promise<void>((ready) => postgrest.listen(0, "127.0.0.1", ready));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  ({ recordOrder } = await import("./registrar"));
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  seen.length = 0;
});

const TENANT = "loja-a";
const LEAD = { id: "lead-1", source_campaign: null, source_group_id: "vip1@g.us" };

const requestsTo = (path: string) => seen.filter((request) => request.url.pathname === path);
const trail = () => seen.map((request) => `${request.method} ${request.url.pathname}`);

/** O marco sai com `void` (não segura a resposta): chega depois. */
async function arrived(path: string): Promise<Seen> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const request = requestsTo(path)[0];
    if (request) return request;
    await new Promise((wait) => setTimeout(wait, 10));
  }
  throw new Error(`${path} não chegou`);
}

test("lead de grupo: a campanha mais antiga com o grupo, lead vira comprou e o 1º pedido marca first_order", async () => {
  reply = ({ method, url }) => {
    if (url.pathname === "/rest/v1/campaign_groups") {
      return {
        status: 200,
        body: [
          { id: "camp-nova", name: "Nova", slug: "nova", group_ids: ["vip1@g.us"], created_at: "2026-09-01T00:00:00Z" },
          { id: "camp-antiga", name: "Antiga", slug: "antiga", group_ids: ["vip1@g.us"], created_at: "2026-08-01T00:00:00Z" },
        ],
      };
    }
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ id: LEAD.id, status: "comprou" }] };
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/1" };
    if (url.pathname === "/rest/v1/funnel_events") return { status: 201 };
    return { status: 500 };
  };
  const campaigns: (string | undefined)[] = [];

  const order = await recordOrder(TENANT, LEAD, async (campaignId) => {
    campaigns.push(campaignId);
    return { id: "pedido-1" };
  });

  assert.deepEqual(order, { id: "pedido-1" });
  // Mutante: a campanha mais nova roubaria os pedidos de quem entrou pela antiga.
  assert.deepEqual(campaigns, ["camp-antiga"]);
  assert.equal(requestsTo("/rest/v1/campaign_groups")[0].url.searchParams.get("tenant_id"), "eq.loja-a");
  const [patch] = requestsTo("/rest/v1/leads");
  assert.equal(patch.method, "PATCH");
  assert.equal(patch.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(patch.url.searchParams.get("id"), "eq.lead-1");
  assert.deepEqual(patch.body, { status: "comprou" });
  const event = (await arrived("/rest/v1/funnel_events")).body as { tenant_id: string; event_name: string; metadata: unknown };
  assert.equal(event.tenant_id, TENANT);
  assert.equal(event.event_name, "first_order");
  assert.deepEqual(event.metadata, { orderId: "pedido-1" });
});

test("campanhas fora do ar não derrubam o pedido: grava sem origem", async () => {
  reply = ({ method, url }) => {
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 500, body: { message: "timeout" } };
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ id: LEAD.id }] };
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/3" };
    return { status: 500 };
  };
  const campaigns: (string | undefined)[] = [];

  const order = await recordOrder(TENANT, LEAD, async (campaignId) => {
    campaigns.push(campaignId);
    return { id: "pedido-2" };
  });

  assert.deepEqual(order, { id: "pedido-2" });
  assert.deepEqual(campaigns, [undefined]);
  assert.equal(requestsTo("/rest/v1/leads").length, 1);
  assert.equal(requestsTo("/rest/v1/funnel_events").length, 0);
});

test("sem lead: nem campanha nem status; do 2º pedido em diante, sem marco", async () => {
  reply = ({ method, url }) =>
    url.pathname === "/rest/v1/orders" && method === "HEAD" ? { status: 200, contentRange: "*/2" } : { status: 500 };
  const campaigns: (string | undefined)[] = [];

  await recordOrder(TENANT, null, async (campaignId) => {
    campaigns.push(campaignId);
    return { id: "pedido-3" };
  });

  assert.deepEqual(campaigns, [undefined]);
  assert.deepEqual(trail(), ["HEAD /rest/v1/orders"]);
});

test("gravação falhou: o erro sobe e o lead não vira comprou", async () => {
  reply = ({ url }) => (url.pathname === "/rest/v1/campaign_groups" ? { status: 200, body: [] } : { status: 500 });

  await assert.rejects(
    recordOrder(TENANT, LEAD, async () => {
      throw new Error("total_zero");
    }),
    { message: "total_zero" },
  );

  assert.deepEqual(trail(), ["GET /rest/v1/campaign_groups"]);
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/orders/registrar.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3 (implementação):** `src/lib/orders/registrar.ts`

```ts
import "server-only";

import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { resolveCampaignId, type LeadAttribution } from "@/lib/campaign-attribution";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
import { updateLeadStatus } from "@/lib/stores/leads";
import { countOrders } from "@/lib/stores/orders";

/** O lead do pedido, já conferido no tenant, com a origem que decide a campanha. */
export type OrderLead = LeadAttribution & { id: string };

/**
 * Tudo o que acontece em volta de gravar um pedido, igual para "Registrar
 * pedido" (POST /api/orders, valor único) e "Registrar venda" (POST
 * /api/vendas, com itens): a campanha sai do grupo de origem do lead, o lead
 * vira "comprou" e o primeiro pedido da loja marca `first_order`.
 *
 * Quem grava é o chamador (`write`), porque os dois gravam diferente — o
 * `addOrder` e a RPC `create_order_with_items`. Só a gravação derruba o
 * registro: campanha, status e marco são best-effort, como sempre foram.
 */
export async function recordOrder<O extends { id: string }>(
  tenantId: string,
  lead: OrderLead | null,
  write: (campaignId: string | undefined) => Promise<O>,
): Promise<O> {
  const campaignId = lead ? await campaignFromLead(tenantId, lead) : undefined;
  const order = await write(campaignId);
  if (lead) {
    // Lead apagado entre a conferência e aqui não derruba o pedido já criado.
    await updateLeadStatus(tenantId, lead.id, "comprou").catch(() => null);
  }
  await markFirstOrder(tenantId, order.id);
  return order;
}

/** Campanha cujo grupo contém a origem do lead. Sem match ou com erro: sem origem. */
async function campaignFromLead(tenantId: string, lead: LeadAttribution): Promise<string | undefined> {
  try {
    return resolveCampaignId(lead, await listCampaignGroups(tenantId)) ?? undefined;
  } catch (e) {
    console.error(`[orders] atribuição de campanha falhou para ${tenantId}:`, (e as Error).message);
    return undefined;
  }
}

/** Marco de ativação: contagem pós-insert, === 1 é o primeiro. */
async function markFirstOrder(tenantId: string, orderId: string): Promise<void> {
  try {
    if ((await countOrders(tenantId)) === 1) {
      void trackFunnelEvent({ tenantId, userId: null, event: "first_order", onlyFirst: true, metadata: { orderId } });
    }
  } catch (e) {
    console.error(`[orders] funnel tracking falhou para ${tenantId}:`, (e as Error).message);
  }
}
```

- [ ] **Step 4:** comando do Step 2 → PASS (4 testes).

- [ ] **Step 5: `POST /api/orders` usa o helper.** Ler `src/app/api/orders/route.ts` inteiro como o PR 1 deixou. Substituir a função `POST` inteira (de `export async function POST` até a `}` que fecha antes de `export async function DELETE`) por:

```ts
export async function POST(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const value = parseOrderValue(b.value);
  if (!value || value <= 0) {
    return Response.json({ error: "Informe o valor do pedido." }, { status: 400 });
  }
  try {
    const leadId = b.leadId ? String(b.leadId) : undefined;
    // O lead tem que ser desta loja (PR 1): sem isso o pedido gravaria o lead_id de outra.
    const origin = leadId ? await getLeadAttribution(tenantId, leadId) : null;
    if (leadId && !origin) return Response.json({ error: "Contato não encontrado." }, { status: 400 });

    // Valor único, sem itens: continua no addOrder. Itens e autora são da venda
    // (/api/vendas); "Registrar pedido" do dono fica como está (spec, fora da v1).
    const order = await recordOrder(tenantId, leadId && origin ? { id: leadId, ...origin } : null, (campaignId) =>
      addOrder(tenantId, {
        value,
        phone: b.phone ? String(b.phone) : undefined,
        leadId,
        group: b.group ? String(b.group) : undefined,
        campaignId,
      }),
    );
    return Response.json(order, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

  Se o PR 1 validou o formato do `leadId` antes da consulta (ex.: UUID inválido → 400 "Contato não encontrado."), manter essa linha logo acima de `const origin = …`: o contrato é a resposta, não o caminho. No bloco de imports do topo, tirar `countOrders` do import de `@/lib/stores/orders`, `updateLeadStatus` do de `@/lib/stores/leads`, e as linhas de `listCampaignGroups`, `resolveCampaignId` e `trackFunnelEvent` (só o POST usava); acrescentar `import { recordOrder } from "@/lib/orders/registrar";`. O resto do bloco (o que o GET e o DELETE do PR 1 usam) fica como está.

- [ ] **Step 6: lead sem grupo de origem.** Em `src/lib/stores/leads.ts` (hoje L136–142), trocar

```ts
export type AddLeadInput = {
  phone: string;
  name?: string;
  sourceGroup: string;
  sourceGroupId?: string;
  sourceCampaign?: string;
};
```

por

```ts
export type AddLeadInput = {
  phone: string;
  name?: string;
  /** Ausente quando o lead nasce de uma venda (`/api/vendas`), não da entrada num grupo. */
  sourceGroup?: string;
  sourceGroupId?: string;
  sourceCampaign?: string;
};
```

  `addLead` já manda `input.sourceGroup ?? null` (L158) e o `upsert_lead` aceita nulo; `/api/leads` continua exigindo `sourceGroup` na rota (L60–63).

- [ ] **Step 7:** `npx tsc --noEmit -p tsconfig.json` limpo; `npm run lint` sem import sobrando em `api/orders/route.ts`. Se o PR 1 deixou teste de rota para `/api/orders` (`grep -rln "api/orders" src --include=*.test.ts`), rodá-lo → PASS.
- [ ] **Step 8 (commit):**

```bash
git -C <W> add apps/web/src/lib/orders/registrar.ts apps/web/src/lib/orders/registrar.test.ts apps/web/src/app/api/orders/route.ts apps/web/src/lib/stores/leads.ts
```
```bash
git -C <W> diff --cached --stat
```
```bash
git -C <W> commit -m "refactor(orders): share campaign attribution, lead status and first-order milestone" -m "POST /api/orders keeps writing a single value through addOrder; the sales route will reuse the same helper around the items RPC. AddLeadInput.sourceGroup becomes optional for leads born from a sale." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: store de vendas (TDD)

**Files:** criar `src/lib/stores/vendas.ts`, `src/lib/stores/vendas.test.ts`
**Depends-on:** Task 2 (`monthRange`, tipos)
**Interfaces (produz):**
```ts
export const SALE_EDIT_WINDOW_MS: number;                       // 24 h
export type SalesCaller = { tenantId: string; authUserId: string; role: TenantRole };
export type RpcItem = { name: string; quantity: number; unit_price: number };
export type SaleLead = Pick<Lead, "id" | "name" | "phone" | "source_campaign" | "source_group_id" | "source_group_name">;
export type SaleOrder = { id; tenant_id; phone; lead_id; group_name; campaign_id; value; created_at; created_by };
export function toCents(value: number): number;
export async function findLeadByPhones(tenantId: string, phones: string[]): Promise<SaleLead | null>;
export async function findLeadById(tenantId: string, id: string): Promise<SaleLead | null>;
export async function isOptedOutAny(tenantId: string, phones: string[]): Promise<boolean>;
export async function createSale(input: { caller; leadId; phone; groupName; campaignId; items }): Promise<SaleOrder>;
export async function replaceSaleItems(caller: SalesCaller, orderId: string, items: RpcItem[]): Promise<SaleOrder>;
export async function deleteSale(caller: SalesCaller, orderId: string, now: Date): Promise<boolean>;
export async function leadNames(tenantId: string, ids: (string | null)[]): Promise<Map<string, string | null>>;
export function isSaleEditable(caller: SalesCaller, sale: { created_by: string | null; created_at: string }, now: Date): boolean;
export function saleFromOrder(order: SaleOrder, items: RpcItem[], client: string | null, caller: SalesCaller, now: Date): VendaDoMes;
export async function listMonthSales(caller: SalesCaller, month: string, now: Date): Promise<VendasDoMes>;
```
**Consome:** `TenantRole` com `"seller"` (PR 3, `lib/permissions.ts`); RPCs `create_order_with_items` / `replace_order_items` e `orders.created_by`, `order_items` (PR 2).

- [ ] **Step 1 (teste):** `src/lib/stores/vendas.test.ts`

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type * as Store from "./vendas";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (padrão de
 * `leads.test.ts`, #340): a query que sai daqui é a de produção. O que cada
 * teste confere é o filtro — o service-role passa por cima do RLS, então
 * `tenant_id` e `created_by` na URL são a proteção real.
 */

type Seen = { method: string; url: URL; prefer: string; body: unknown };
type Reply = { status: number; body?: unknown; contentRange?: string };

const seen: Seen[] = [];
let reply: (request: Seen) => Reply = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let text = "";
  req.on("data", (chunk) => (text += chunk));
  req.on("end", () => {
    const request: Seen = {
      method: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      body: text ? JSON.parse(text) : undefined,
    };
    seen.push(request);
    const { status, body, contentRange } = reply(request);
    const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const payload = single && Array.isArray(body) ? body[0] : body;
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (payload !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
});

let store: typeof Store;

before(async () => {
  await new Promise<void>((ready) => postgrest.listen(0, "127.0.0.1", ready));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  store = await import("./vendas");
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  seen.length = 0;
});

const SELLER = { tenantId: "loja-a", authUserId: "vendedora-1", role: "seller" } as const;
const OWNER = { tenantId: "loja-a", authUserId: "dono-1", role: "owner" } as const;
const NOW = new Date("2026-10-07T15:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const ITEMS = [{ name: "Saia midi", quantity: 1, unit_price: 59.9 }];
const LEAD_SELECT = "id,name,phone,source_campaign,source_group_id,source_group_name";

/** Todos os parâmetros da URL: filtros, select, order, limit. */
const params = (url: URL) => Object.fromEntries(url.searchParams);
const requestsTo = (path: string) => seen.filter((request) => request.url.pathname === path);

test("lead pelo número: no tenant, em qualquer variante, o que entrou por último, uma linha", async () => {
  const lead = {
    id: "l1", name: "Fernanda Lima", phone: "11987654321",
    source_campaign: null, source_group_id: "vip1@g.us", source_group_name: "VIP 1",
  };
  reply = () => ({ status: 200, body: [lead] });

  assert.deepEqual(await store.findLeadByPhones("loja-a", ["11987654321", "5511987654321"]), lead);

  assert.equal(seen[0].url.pathname, "/rest/v1/leads");
  assert.deepEqual(params(seen[0].url), {
    select: LEAD_SELECT,
    tenant_id: "eq.loja-a",
    phone: "in.(11987654321,5511987654321)",
    order: "entered_at.desc",
    limit: "1",
  });

  reply = () => ({ status: 200, body: [] });
  assert.equal(await store.findLeadByPhones("loja-a", ["11987654321"]), null);
});

test("lead por id: só do tenant; de outra loja volta null", async () => {
  reply = () => ({ status: 200, body: [] });

  assert.equal(await store.findLeadById("loja-a", "lead-de-outra-loja"), null);

  assert.deepEqual(params(seen[0].url), { select: LEAD_SELECT, tenant_id: "eq.loja-a", id: "eq.lead-de-outra-loja" });
});

test("opt-out vale para qualquer variante do número", async () => {
  reply = () => ({ status: 200, body: [{ id: "o1" }] });
  assert.equal(await store.isOptedOutAny("loja-a", ["11987654321", "5511987654321"]), true);
  assert.equal(seen[0].url.pathname, "/rest/v1/optouts");
  assert.deepEqual(params(seen[0].url), {
    select: "id",
    tenant_id: "eq.loja-a",
    phone: "in.(11987654321,5511987654321)",
    limit: "1",
  });

  reply = () => ({ status: 200, body: [] });
  assert.equal(await store.isOptedOutAny("loja-a", ["11987654321"]), false);
});

const MONTH_ROWS = [
  {
    id: "p1", lead_id: "l1", phone: "5511987654321", value: 287.7, created_at: hoursAgo(2), created_by: "vendedora-1",
    order_items: [
      { name: "Blusa bufante", quantity: 2, unit_price: 68.9, position: 1 },
      { name: "Conjunto alfaiataria", quantity: 1, unit_price: 149.9, position: 0 },
    ],
  },
  {
    id: "p2", lead_id: null, phone: "5511912345678", value: 534, created_at: hoursAgo(30), created_by: "vendedora-1",
    order_items: [{ name: "Calça wide leg", quantity: 6, unit_price: 89, position: 0 }],
  },
  // Pedido de antes dos itens: a tela mostra "Pedido sem itens".
  { id: "p3", lead_id: "l1", phone: "5511987654321", value: 50, created_at: hoursAgo(200), created_by: "vendedora-1", order_items: [] },
];

function monthReply(contentRange: string | undefined, rows: unknown[] = MONTH_ROWS) {
  return ({ url }: Seen): Reply => {
    if (url.pathname === "/rest/v1/orders") return { status: 200, body: rows, contentRange };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [{ id: "l1", name: "Patrícia Gomes" }] };
    return { status: 500 };
  };
}

test("vendas do mês: só as de quem chama, na faixa de Brasília, itens em ordem, cliente e editável da vendedora", async () => {
  reply = monthReply("0-2/3");

  const result = await store.listMonthSales(SELLER, "2026-10", NOW);

  assert.deepEqual(result, {
    mes: "2026-10",
    total: 871.7,
    quantidade: 3,
    truncado: false,
    vendas: [
      {
        id: "p1", cliente: "Patrícia Gomes", telefone: "5511987654321", total: 287.7, criadaEm: hoursAgo(2),
        itens: [
          { nome: "Conjunto alfaiataria", quantidade: 1, valorUnitario: 149.9 },
          { nome: "Blusa bufante", quantidade: 2, valorUnitario: 68.9 },
        ],
        editavel: true,
      },
      {
        id: "p2", cliente: null, telefone: "5511912345678", total: 534, criadaEm: hoursAgo(30),
        itens: [{ nome: "Calça wide leg", quantidade: 6, valorUnitario: 89 }],
        editavel: false,
      },
      { id: "p3", cliente: "Patrícia Gomes", telefone: "5511987654321", total: 50, criadaEm: hoursAgo(200), itens: [], editavel: false },
    ],
  });

  const [orders] = requestsTo("/rest/v1/orders");
  assert.equal(orders.method, "GET");
  assert.match(orders.prefer, /count=exact/);
  assert.equal(
    orders.url.searchParams.get("select"),
    "id,lead_id,phone,value,created_at,created_by,order_items(name,quantity,unit_price,position)",
  );
  // Mutantes: sem tenant (o service-role lê todas as lojas), sem autora (a vendedora
  // veria o caixa da loja), mês em UTC (a venda das 22h do dia 31 cairia no mês seguinte).
  assert.equal(orders.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(orders.url.searchParams.get("created_by"), "eq.vendedora-1");
  assert.deepEqual(orders.url.searchParams.getAll("created_at"), ["gte.2026-10-01T03:00:00.000Z", "lt.2026-11-01T03:00:00.000Z"]);
  assert.equal(orders.url.searchParams.get("order"), "created_at.desc");
  assert.equal(orders.url.searchParams.get("limit"), "1000");
  assert.deepEqual(requestsTo("/rest/v1/leads").map((request) => params(request.url)), [
    { select: "id,name", tenant_id: "eq.loja-a", id: "in.(l1)" },
  ]);
});

test("dono: as vendas dele, todas editáveis, sem prazo", async () => {
  reply = monthReply("0-2/3");

  const result = await store.listMonthSales(OWNER, "2026-10", NOW);

  assert.deepEqual(result.vendas.map((venda) => venda.editavel), [true, true, true]);
  assert.equal(requestsTo("/rest/v1/orders")[0].url.searchParams.get("created_by"), "eq.dono-1");
});

test("mais de 1000 no mês: truncado, e o total é só o das linhas que vieram", async () => {
  reply = monthReply("0-0/1500", [MONTH_ROWS[1]]);

  const result = await store.listMonthSales(SELLER, "2026-10", NOW);

  assert.equal(result.truncado, true);
  assert.equal(result.quantidade, 1500);
  assert.equal(result.total, 534);
});

test("contagem que não veio é erro, nunca um 'não truncou' que ninguém mediu", async () => {
  reply = monthReply(undefined, []);
  await assert.rejects(store.listMonthSales(SELLER, "2026-10", NOW), /Contagem/);
});

test("nomes dos clientes em lotes de 100, sem repetir id e sempre no tenant", async () => {
  reply = ({ url }) => ({
    status: 200,
    body: (url.searchParams.get("id") ?? "")
      .replace(/^in\.\(|\)$/g, "")
      .split(",")
      .map((id) => ({ id, name: `Cliente ${id}` })),
  });
  const ids = Array.from({ length: 150 }, (_, index) => `lead-${index}`);

  const names = await store.leadNames("loja-a", [...ids, "lead-0", null]);

  assert.equal(names.size, 150);
  assert.equal(names.get("lead-149"), "Cliente lead-149");
  const sizes = seen.map((request) => (request.url.searchParams.get("id") ?? "").split(",").length).sort((a, b) => b - a);
  assert.deepEqual(sizes, [100, 50]);
  for (const request of seen) assert.equal(request.url.searchParams.get("tenant_id"), "eq.loja-a");

  seen.length = 0;
  assert.equal((await store.leadNames("loja-a", [null])).size, 0);
  assert.equal(seen.length, 0);
});

test("apagar: vendedora só a própria e dentro das 24h; dono, qualquer venda do tenant", async () => {
  reply = () => ({ status: 200, body: [{ id: "p1" }] });
  assert.equal(await store.deleteSale(SELLER, "p1", NOW), true);
  assert.equal(seen[0].method, "DELETE");
  assert.deepEqual(params(seen[0].url), {
    tenant_id: "eq.loja-a",
    id: "eq.p1",
    created_by: "eq.vendedora-1",
    created_at: "gt.2026-10-06T15:00:00.000Z",
    select: "id",
  });

  reply = () => ({ status: 200, body: [] });
  assert.equal(await store.deleteSale(SELLER, "p1", NOW), false);

  seen.length = 0;
  assert.equal(await store.deleteSale(OWNER, "p1", NOW), false);
  assert.deepEqual(params(seen[0].url), { tenant_id: "eq.loja-a", id: "eq.p1", select: "id" });
});

test("RPCs: a autora é quem chama; a trava de 24h só vale para vendedora; o erro sai com a mensagem da RPC", async () => {
  reply = () => ({ status: 200, body: { id: "p9" } });

  await store.createSale({ caller: SELLER, leadId: null, phone: "5511912345678", groupName: null, campaignId: undefined, items: ITEMS });
  await store.replaceSaleItems(SELLER, "p9", ITEMS);
  await store.replaceSaleItems(OWNER, "p9", ITEMS);

  assert.deepEqual(requestsTo("/rest/v1/rpc/create_order_with_items")[0].body, {
    p_tenant_id: "loja-a",
    p_created_by: "vendedora-1",
    p_lead_id: null,
    p_phone: "5511912345678",
    p_group_name: null,
    p_campaign_id: null,
    p_items: ITEMS,
  });
  assert.deepEqual(requestsTo("/rest/v1/rpc/replace_order_items").map((request) => request.body), [
    { p_tenant_id: "loja-a", p_order_id: "p9", p_items: ITEMS, p_only_author: "vendedora-1" },
    { p_tenant_id: "loja-a", p_order_id: "p9", p_items: ITEMS, p_only_author: null },
  ]);

  reply = () => ({ status: 400, body: { code: "P0001", message: "fora_da_janela", details: null, hint: null } });
  await assert.rejects(store.replaceSaleItems(SELLER, "p9", ITEMS), { message: "fora_da_janela" });
});

test("editável: vendedora até 24h e só a própria; os outros papéis sempre", () => {
  const sale = (by: string, hours: number) => ({ created_by: by, created_at: hoursAgo(hours) });
  assert.equal(store.isSaleEditable(SELLER, sale("vendedora-1", 23.99), NOW), true);
  // O mesmo corte estrito da RPC: created_at > now() - 24h.
  assert.equal(store.isSaleEditable(SELLER, sale("vendedora-1", 24), NOW), false);
  assert.equal(store.isSaleEditable(SELLER, sale("outra-vendedora", 1), NOW), false);
  assert.equal(store.isSaleEditable(OWNER, sale("vendedora-1", 24 * 30), NOW), true);
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/vendas.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3 (implementação):** `src/lib/stores/vendas.ts`

```ts
import "server-only";

import type { TenantRole } from "@/lib/permissions";
import type { Lead } from "@/lib/stores/leads";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { monthRange } from "@/lib/vendas/month";
import type { VendaDoMes, VendasDoMes } from "@/lib/vendas/tipos";

/**
 * Vendas registradas pela vendedora (spec 2026-10-07): pedido com itens e
 * autora. Tudo passa pelo service-role, que ignora o RLS — o
 * `.eq("tenant_id")` de cada query é a proteção real.
 */

/** Até quando a vendedora corrige ou apaga a própria venda. A RPC `replace_order_items` usa o mesmo corte. */
export const SALE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** O PostgREST corta em 1000 linhas sem erro: passou disso, a lista avisa que é parcial. */
const MONTH_LIMIT = 1000;
/** 100 UUIDs numa URL dão ~4 KB; 1000 passariam dos ~8 KB que o servidor aceita. */
const NAME_BATCH = 100;

/** Quem chama a rota: a loja, a pessoa e o papel dela na loja. */
export type SalesCaller = { tenantId: string; authUserId: string; role: TenantRole };
/** Item no formato de `p_items` das RPCs; a ordem do array vira `position`. */
export type RpcItem = { name: string; quantity: number; unit_price: number };
/** O lead que a venda usa: nome pra tela, telefone pro pedido, origem pra campanha. */
export type SaleLead = Pick<Lead, "id" | "name" | "phone" | "source_campaign" | "source_group_id" | "source_group_name">;
/** Linha de `public.orders` como as RPCs devolvem. */
export type SaleOrder = {
  id: string;
  tenant_id: string;
  phone: string;
  lead_id: string | null;
  group_name: string | null;
  campaign_id: string | null;
  value: number;
  created_at: string;
  created_by: string | null;
};

type StoredItem = RpcItem & { position: number };
type SaleRow = Pick<SaleOrder, "id" | "lead_id" | "phone" | "value" | "created_at" | "created_by"> & {
  order_items: StoredItem[];
};

const LEAD_COLUMNS = "id, name, phone, source_campaign, source_group_id, source_group_name";
const SALE_COLUMNS = "id, lead_id, phone, value, created_at, created_by, order_items(name, quantity, unit_price, position)";

/** Arredonda em centavos, como o numeric(12,2) do banco. */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Lead da loja com um desses telefones; havendo dois, o que entrou por último. */
export async function findLeadByPhones(tenantId: string, phones: string[]): Promise<SaleLead | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("phone", phones)
    .order("entered_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as SaleLead[])[0] ?? null;
}

/** Lead da loja pelo id. null se não existe ou é de outra loja. */
export async function findLeadById(tenantId: string, id: string): Promise<SaleLead | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SaleLead | null) ?? null;
}

/**
 * Algum dos telefones está no descadastro? `isOptedOut` compara um número
 * exato; aqui o mesmo cliente pode estar com ou sem 55 e 9º dígito.
 */
export async function isOptedOutAny(tenantId: string, phones: string[]): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("optouts")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("phone", phones)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/** Pedido + itens numa transação (`create_order_with_items`). Exceção da RPC sai com a mensagem dela. */
export async function createSale(input: {
  caller: SalesCaller;
  leadId: string | null;
  phone: string;
  groupName: string | null;
  campaignId: string | undefined;
  items: RpcItem[];
}): Promise<SaleOrder> {
  const { data, error } = await getSupabaseAdmin().rpc("create_order_with_items", {
    p_tenant_id: input.caller.tenantId,
    p_created_by: input.caller.authUserId,
    p_lead_id: input.leadId,
    p_phone: input.phone,
    p_group_name: input.groupName,
    p_campaign_id: input.campaignId ?? null,
    p_items: input.items,
  });
  if (error) throw new Error(error.message);
  return data as SaleOrder;
}

/** Troca os itens e recalcula o total. Vendedora: só a própria e até 24h (senão `fora_da_janela`). */
export async function replaceSaleItems(caller: SalesCaller, orderId: string, items: RpcItem[]): Promise<SaleOrder> {
  const { data, error } = await getSupabaseAdmin().rpc("replace_order_items", {
    p_tenant_id: caller.tenantId,
    p_order_id: orderId,
    p_items: items,
    p_only_author: caller.role === "seller" ? caller.authUserId : null,
  });
  if (error) throw new Error(error.message);
  return data as SaleOrder;
}

/** Apaga a venda (os itens vão junto, `on delete cascade`). true só se uma linha saiu. */
export async function deleteSale(caller: SalesCaller, orderId: string, now: Date): Promise<boolean> {
  let query = getSupabaseAdmin().from("orders").delete().eq("tenant_id", caller.tenantId).eq("id", orderId);
  if (caller.role === "seller") {
    query = query
      .eq("created_by", caller.authUserId)
      .gt("created_at", new Date(now.getTime() - SALE_EDIT_WINDOW_MS).toISOString());
  }
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Nome de cada lead. `orders.lead_id` não tem FK para `leads`, então o nome
 * não vem embutido no pedido: busca à parte, em lotes de 100 ids.
 */
export async function leadNames(tenantId: string, ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  const batches = Array.from({ length: Math.ceil(unique.length / NAME_BATCH) }, (_, index) =>
    unique.slice(index * NAME_BATCH, (index + 1) * NAME_BATCH),
  );
  const replies = await Promise.all(
    batches.map((batch) => getSupabaseAdmin().from("leads").select("id, name").eq("tenant_id", tenantId).in("id", batch)),
  );
  return new Map(
    replies.flatMap(({ data, error }) => {
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; name: string | null }[]).map((lead) => [lead.id, lead.name] as const);
    }),
  );
}

/** Vendedora corrige a própria venda até 24h; dono, admin e operador, qualquer uma. */
export function isSaleEditable(
  caller: SalesCaller,
  sale: { created_by: string | null; created_at: string },
  now: Date,
): boolean {
  if (caller.role !== "seller") return true;
  return sale.created_by === caller.authUserId && now.getTime() - Date.parse(sale.created_at) < SALE_EDIT_WINDOW_MS;
}

function toVendaDoMes(row: SaleRow, client: string | null, caller: SalesCaller, now: Date): VendaDoMes {
  return {
    id: row.id,
    cliente: client,
    telefone: row.phone,
    total: row.value,
    criadaEm: row.created_at,
    itens: [...row.order_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({ nome: item.name, quantidade: item.quantity, valorUnitario: item.unit_price })),
    editavel: isSaleEditable(caller, row, now),
  };
}

/** A venda que a RPC acabou de gravar, com os itens enviados (na ordem que virou `position`). */
export function saleFromOrder(
  order: SaleOrder,
  items: RpcItem[],
  client: string | null,
  caller: SalesCaller,
  now: Date,
): VendaDoMes {
  return toVendaDoMes({ ...order, order_items: items.map((item, position) => ({ ...item, position })) }, client, caller, now);
}

/**
 * As vendas de quem chama no mês de Brasília, mais recentes primeiro. Passou
 * de 1000: `truncado`, e o total é o das linhas que vieram (a tela avisa).
 */
export async function listMonthSales(caller: SalesCaller, month: string, now: Date): Promise<VendasDoMes> {
  const { start, end } = monthRange(month);
  const { data, error, count } = await getSupabaseAdmin()
    .from("orders")
    .select(SALE_COLUMNS, { count: "exact" })
    .eq("tenant_id", caller.tenantId)
    .eq("created_by", caller.authUserId)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .limit(MONTH_LIMIT);
  if (error) throw new Error(error.message);
  // Contagem que não veio é erro, nunca um "não truncou" que ninguém mediu.
  if (count === null || !Number.isInteger(count)) throw new Error("Contagem das vendas não veio.");
  const rows = (data ?? []) as unknown as SaleRow[];
  const names = await leadNames(caller.tenantId, rows.map((row) => row.lead_id));
  const vendas = rows.map((row) =>
    toVendaDoMes(row, row.lead_id ? (names.get(row.lead_id) ?? null) : null, caller, now),
  );
  return {
    mes: month,
    total: toCents(vendas.reduce((sum, venda) => sum + venda.total, 0)),
    quantidade: count,
    truncado: count > rows.length,
    vendas,
  };
}
```

- [ ] **Step 4:** comando do Step 2 → PASS (11 testes). `npx tsc --noEmit -p tsconfig.json` limpo (se o select embutido reclamar de tipo, o `as unknown as SaleRow[]` já é o padrão do repo — `stores/flash-offers.ts` L452).
- [ ] **Step 5 (commit):**

```bash
git -C <W> add apps/web/src/lib/stores/vendas.ts apps/web/src/lib/stores/vendas.test.ts
```
```bash
git -C <W> diff --cached --stat
```
```bash
git -C <W> commit -m "feat(vendas): sales store over the order RPCs" -m "Lead lookup by phone variants, opt-out across variants, create/replace through create_order_with_items and replace_order_items, month list with exact count and truncation flag, seller-scoped delete inside the 24h window. Every query filters by tenant_id." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: entrada das rotas e busca por número (TDD)

**Files:** criar `src/lib/vendas/request.ts`, `src/app/api/vendas/contato/route.ts`, `src/app/api/vendas/routes.test.ts`
**Depends-on:** Tasks 1 e 4
**Interfaces:**
```ts
// produz — lib/vendas/request.ts (server-only)
export const MESSAGES: { phone; items; zeroTotal; contact; window; notFound; month; body; tooManySearches; tooManySales; failure };
export type BodyItems;
export const saleBody;        // z.strictObject — POST /api/vendas (spec §3)
export const correctionBody;  // z.strictObject({ itens }) — PATCH
export function bodyErrorMessage(error: z.ZodError): string;
export function itemsForRpc(items: BodyItems): { items: RpcItem[] } | { error: string };
export async function getSalesCaller(req: Request): Promise<SalesCaller>;
export async function handleSalesErrors(route: () => Promise<Response>): Promise<Response>;
// produz — rota (contrato PR 4 → PR 5)
GET /api/vendas/contato?telefone= → 200 BuscaDeContato · 400 { error } · 429 { error }
// consome
getRouteTenantContext(req, { allowEngine: false }) → { tenantId, actor, role, authUserId, modules } (PR 3; o guard de módulo roda dentro)
checkRateLimit(id, max, windowMs): Promise<boolean>   // true = bloqueado (lib/security/rate-limit.ts L44)
parseValorDoPedido(bruto: unknown): number            // lib/orders/valor-do-pedido.ts L12
```

O teste de rota roda o handler real, o `getRouteTenantContext` real (com o guard do PR 3) e o cliente real do Supabase contra um GoTrue + PostgREST falsos no mesmo servidor (`/auth/v1/user` e `/rest/v1/memberships` respondem pelo token Bearer). Se o `getTenantContext` do PR 3 consultar alguma tabela além de `memberships` para montar o contexto, acrescentar em `answer` uma resposta igual à de memberships para ela.

- [ ] **Step 1 (teste):** `src/app/api/vendas/routes.test.ts`

```ts
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { GET as ContactGet } from "./contato/route";

/**
 * As rotas de vendas de ponta a ponta: o handler real, o getRouteTenantContext
 * real (com o guard de módulo do PR 3) e o cliente real do Supabase, falando
 * com um GoTrue e um PostgREST de mentira no mesmo servidor — só a rede é
 * trocada (padrão de `stores/leads.test.ts`, #340). O token Bearer escolhe
 * quem chama; a membership volta com a loja e o papel dessa pessoa.
 */

const STORE = "0b7c9a52-3d1e-4f6a-9c2b-5e8d7f1a2b3c";
const OTHER_STORE = "6f5e4d3c-2b1a-4c9d-8e7f-a0b1c2d3e4f5";
const SELLER = "5a1f0c3e-8b2d-4e7f-9a6c-1d3e5f7a9b0c";
const OWNER = "7e2d4c6b-1a3f-4b5e-8c7d-9f0a1b2c3d4e";
const LEAD = "3c9e1a7b-5d2f-4a8c-b6e0-2f4a6c8e0b1d";

/** Cada token é uma pessoa. "varredura" e "outra-loja" têm balde de rate limit só deles. */
const USERS: Record<string, { id: string; tenant: string; role: string }> = {
  "token-vendedora": { id: SELLER, tenant: STORE, role: "seller" },
  "token-dono": { id: OWNER, tenant: STORE, role: "owner" },
  "token-varredura": { id: "2b4d6f8a-0c1e-4a3b-9d5f-7e9a1c3e5b7d", tenant: STORE, role: "seller" },
  "token-outra-loja": { id: "8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d", tenant: OTHER_STORE, role: "owner" },
};

const FERNANDA = {
  id: LEAD, name: "Fernanda Lima", phone: "5511987654321",
  source_campaign: null, source_group_id: "vip1@g.us", source_group_name: "VIP 1",
};

type Seen = { method: string; url: URL; prefer: string; body: unknown };
type Reply = { status: number; body?: unknown; contentRange?: string };

const seen: Seen[] = [];
let database: (request: Seen) => Reply = () => ({ status: 500, body: { message: "sem resposta" } });

/** GoTrue e memberships respondem pelo token; o resto é do teste (e fica em `seen`). */
function answer(req: IncomingMessage, request: Seen): Reply {
  if (request.url.pathname === "/auth/v1/user") {
    const token = String(req.headers.authorization ?? "").replace(/^Bearer /i, "");
    const user = USERS[token];
    return user
      ? { status: 200, body: { id: user.id, email: `${token}@loja.test`, aud: "authenticated", role: "authenticated" } }
      : { status: 401, body: { message: "invalid JWT" } };
  }
  if (request.url.pathname === "/rest/v1/memberships") {
    const userId = request.url.searchParams.get("user_id")?.replace(/^eq\./, "");
    const user = Object.values(USERS).find((candidate) => candidate.id === userId);
    return { status: 200, body: user ? [{ tenant_id: user.tenant, role: user.role, modules: [] }] : [] };
  }
  seen.push(request);
  return database(request);
}

const server = createServer((req, res) => {
  let text = "";
  req.on("data", (chunk) => (text += chunk));
  req.on("end", () => {
    const request: Seen = {
      method: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      prefer: String(req.headers.prefer ?? ""),
      body: text ? JSON.parse(text) : undefined,
    };
    const { status, body, contentRange } = answer(req, request);
    // `.single()`/`.maybeSingle()` fora de GET pedem um objeto, não a lista.
    const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const payload = single && Array.isArray(body) ? body[0] : body;
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (payload !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
});

let contactGet: typeof ContactGet;

before(async () => {
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-do-gotrue-falso";
  // Rate limit em memória: sem Upstash o balde é deste processo (lido na importação).
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  ({ GET: contactGet } = await import("./contato/route"));
});

after(() => {
  server.close();
});

beforeEach(() => {
  seen.length = 0;
});

function call(method: string, path: string, token: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const requestsTo = (path: string) => seen.filter((request) => request.url.pathname === path);

test("sem login → 401, e nada de vendas é lido", async () => {
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11987654321", null));
  assert.equal(res.status, 401);
  assert.equal(seen.length, 0);
});

test("busca: um cliente só, achado por qualquer forma do número, sempre no tenant", async () => {
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [FERNANDA] };
    return { status: 500 };
  };

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=(11)%2098765-4321", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: { id: LEAD, nome: "Fernanda Lima", telefone: "5511987654321" }, optout: false });
  const variants = "in.(11987654321,5511987654321,1187654321,551187654321)";
  for (const path of ["/rest/v1/optouts", "/rest/v1/leads"]) {
    const [request] = requestsTo(path);
    assert.equal(request.url.searchParams.get("tenant_id"), `eq.${STORE}`, path);
    assert.equal(request.url.searchParams.get("phone"), variants, path);
    assert.equal(request.url.searchParams.get("limit"), "1", path);
  }
});

test("número sem DDD → 400 com a frase da tela, sem ir ao banco", async () => {
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=98765-4321", "token-vendedora"));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Digite o número com DDD." });
  assert.equal(seen.length, 0);
});

test("número em opt-out: optout true e nenhum contato, sem ler o lead", async () => {
  database = ({ url }) => (url.pathname === "/rest/v1/optouts" ? { status: 200, body: [{ id: "o1" }] } : { status: 500 });

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11987654321", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: null, optout: true });
  assert.equal(requestsTo("/rest/v1/leads").length, 0);
});

test("ninguém com esse número → contato null: a tela registra como cliente novo", async () => {
  // Também é o caso dos contatos capturados em regime LID, sem telefone (spec §6, medição do §9).
  database = ({ url }) =>
    url.pathname === "/rest/v1/optouts" || url.pathname === "/rest/v1/leads" ? { status: 200, body: [] } : { status: 500 };

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11912345678", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: null, optout: false });
});

test("30 buscas por minuto por pessoa; a 31ª é 429", async () => {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const res = await contactGet(call("GET", "/api/vendas/contato?telefone=1", "token-varredura"));
    assert.equal(res.status, 400, `busca ${attempt}`);
  }
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=1", "token-varredura"));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "Muitas buscas seguidas. Espere um minuto e tente de novo." });
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/vendas/routes.test.ts` → FAIL (`Cannot find module './contato/route'`).

- [ ] **Step 3:** `src/lib/vendas/request.ts`

```ts
import "server-only";

import { z } from "zod";

import { parseValorDoPedido } from "@/lib/orders/valor-do-pedido";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { toCents, type RpcItem, type SalesCaller } from "@/lib/stores/vendas";

/** Frases de tela (pt-BR). "phone" e "items" são as do mockup; "window", a da spec. */
export const MESSAGES = {
  phone: "Digite o número com DDD.",
  items: "Preencha nome, quantidade e valor de cada produto.",
  zeroTotal: "A venda precisa somar mais que zero.",
  contact: "Contato não encontrado.",
  window: "Passou de 24 horas: só o dono da loja corrige.",
  notFound: "Venda não encontrada.",
  month: "Mês inválido.",
  body: "Dados inválidos. Recarregue a página e tente de novo.",
  tooManySearches: "Muitas buscas seguidas. Espere um minuto e tente de novo.",
  tooManySales: "Muitas vendas seguidas. Espere um minuto e tente de novo.",
  failure: "Não deu para concluir agora. Tente de novo.",
} as const;

/** Teto de `order_items.unit_price` (check do PR 2). */
const MAX_UNIT_PRICE = 999_999.99;

const bodyItems = z
  .array(
    z.strictObject({
      nome: z.string().trim().min(1).max(120),
      quantidade: z.number().int().min(1).max(9999),
      valorUnitario: z.union([z.string(), z.number()]),
    }),
  )
  .min(1)
  .max(50);

export type BodyItems = z.infer<typeof bodyItems>;

/** POST /api/vendas (spec §3). */
export const saleBody = z
  .strictObject({
    leadId: z.uuid().optional(),
    telefone: z.string().max(30).optional(),
    nome: z.string().trim().max(80).optional(),
    itens: bodyItems,
  })
  .refine((body) => body.leadId !== undefined || body.telefone !== undefined, {
    message: MESSAGES.phone,
    path: ["telefone"],
  });

/** PATCH /api/vendas/[id]. */
export const correctionBody = z.strictObject({ itens: bodyItems });

/** A frase do 400 pelo primeiro campo que falhou. */
export function bodyErrorMessage(error: z.ZodError): string {
  switch (error.issues[0]?.path[0]) {
    case "itens":
      return MESSAGES.items;
    case "telefone":
      return MESSAGES.phone;
    case "leadId":
      return MESSAGES.contact;
    default:
      return MESSAGES.body;
  }
}

/**
 * Itens no formato da RPC, ou a frase do 400. "149,90" e 149.9 passam pelo
 * mesmo `parseValorDoPedido` da tela. Arredonda em centavos aqui para a
 * resposta bater com o numeric(12,2) gravado. Item de R$ 0 passa (brinde);
 * venda que soma zero, não (spec §6).
 */
export function itemsForRpc(items: BodyItems): { items: RpcItem[] } | { error: string } {
  const converted = items.map((item) => ({
    name: item.nome,
    quantity: item.quantidade,
    unit_price: toCents(parseValorDoPedido(item.valorUnitario)),
  }));
  if (converted.some((item) => !Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price > MAX_UNIT_PRICE)) {
    return { error: MESSAGES.items };
  }
  const total = toCents(converted.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  return total > 0 ? { items: converted } : { error: MESSAGES.zeroTotal };
}

/**
 * Quem chama, já passado pelo guard de módulo do PR 3 (roda dentro do
 * getRouteTenantContext): vendedora só chega aqui em rota de `vendas`.
 */
export async function getSalesCaller(req: Request): Promise<SalesCaller> {
  const ctx = await getRouteTenantContext(req, { allowEngine: false });
  // Com allowEngine false só sobra actor "user", que sempre traz authUserId e role; o tipo não sabe disso.
  if (!ctx.authUserId || !ctx.role) throw new Response("Tenant nao encontrado ou sem permissao.", { status: 403 });
  return { tenantId: ctx.tenantId, authUserId: ctx.authUserId, role: ctx.role };
}

/** As exceções das RPCs (contrato do PR 2) → status e frase de tela. */
const RPC_ERRORS = new Map<string, { status: number; error: string }>([
  ["itens_invalidos", { status: 400, error: MESSAGES.items }],
  ["total_zero", { status: 400, error: MESSAGES.zeroTotal }],
  ["fora_da_janela", { status: 403, error: MESSAGES.window }],
  ["pedido_nao_encontrado", { status: 404, error: MESSAGES.notFound }],
]);

/**
 * O miolo de toda rota de vendas. Response lançada (sessão, guard) sai como
 * veio; exceção de RPC vira a frase da tela; o resto é 500 sem a mensagem do
 * banco na resposta (ela vai pro log).
 */
export async function handleSalesErrors(route: () => Promise<Response>): Promise<Response> {
  try {
    return await route();
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : String(e);
    const known = RPC_ERRORS.get(message);
    if (known) return Response.json({ error: known.error }, { status: known.status });
    console.error("[vendas]", message);
    return Response.json({ error: MESSAGES.failure }, { status: 500 });
  }
}
```

- [ ] **Step 4:** `src/app/api/vendas/contato/route.ts`

```ts
import { checkRateLimit } from "@/lib/security/rate-limit";
import { findLeadByPhones, isOptedOutAny } from "@/lib/stores/vendas";
import { MESSAGES, getSalesCaller, handleSalesErrors } from "@/lib/vendas/request";
import { variantesDoTelefone } from "@/lib/vendas/telefone";
import type { BuscaDeContato } from "@/lib/vendas/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Buscas por pessoa por minuto: segura varrer a base da loja chutando números. */
const SEARCHES_PER_MINUTE = 30;

// GET /api/vendas/contato?telefone= — um cliente pelo número, nunca a lista.
// Número em opt-out: não devolve o contato (quem pediu pra sair não reaparece);
// a venda desse número sai sem lead (POST /api/vendas).
export async function GET(req: Request) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    if (await checkRateLimit(`vendas-busca:${caller.authUserId}`, SEARCHES_PER_MINUTE, 60_000)) {
      return Response.json({ error: MESSAGES.tooManySearches }, { status: 429 });
    }
    const phones = variantesDoTelefone(new URL(req.url).searchParams.get("telefone") ?? "");
    if (!phones) return Response.json({ error: MESSAGES.phone }, { status: 400 });
    if (await isOptedOutAny(caller.tenantId, phones)) {
      return Response.json({ contato: null, optout: true } satisfies BuscaDeContato);
    }
    const lead = await findLeadByPhones(caller.tenantId, phones);
    const result: BuscaDeContato = {
      contato: lead ? { id: lead.id, nome: lead.name, telefone: lead.phone ?? "" } : null,
      optout: false,
    };
    return Response.json(result);
  });
}
```

- [ ] **Step 5:** comando do Step 2 → PASS (6 testes). `npx tsc --noEmit -p tsconfig.json` limpo.
- [ ] **Step 6 (commit):**

```bash
git -C <W> add apps/web/src/lib/vendas/request.ts apps/web/src/app/api/vendas/contato/route.ts apps/web/src/app/api/vendas/routes.test.ts
```
```bash
git -C <W> diff --cached --stat
```
```bash
git -C <W> commit -m "feat(vendas): contact lookup by phone for the seller" -m "GET /api/vendas/contato returns one contact or null, never the list; opt-out across phone variants hides the contact; 30 lookups per minute per person." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: registrar venda e minhas vendas do mês (TDD)

**Files:** criar `src/app/api/vendas/route.ts`; modificar `src/app/api/vendas/routes.test.ts`
**Depends-on:** Tasks 3 e 5
**Interfaces (produz, contrato PR 4 → PR 5):**
```
POST /api/vendas  body { leadId?, telefone?, nome?, itens: [{ nome, quantidade, valorUnitario: string | number }] }
  → 201 VendaDoMes · 400 { error } · 429 { error }
GET  /api/vendas?mes=YYYY-MM (default: mês corrente em Brasília) → 200 VendasDoMes · 400 { error }
```
**Consome:** `recordOrder` (Task 3), `addLead` (`sourceGroup` opcional, Task 3), store (Task 4), `request.ts` (Task 5), `variantesDoTelefone`/`telefoneCanonico` (Task 1), `brasiliaMonth`/`MONTH_FORMAT` (Task 2).

- [ ] **Step 1 (teste, cabeçalho):** em `routes.test.ts`,
  - logo acima de `import type { GET as ContactGet } from "./contato/route";`, acrescentar

    ```ts
    import { brasiliaMonth, monthRange } from "@/lib/vendas/month";

    ```
  - logo abaixo dela, acrescentar `import type { GET as SalesGet, POST as SalesPost } from "./route";`
  - abaixo de `let contactGet: typeof ContactGet;`, acrescentar

    ```ts
    let salesGet: typeof SalesGet;
    let salesPost: typeof SalesPost;
    ```
  - no `before`, abaixo de `({ GET: contactGet } = await import("./contato/route"));`, acrescentar `({ GET: salesGet, POST: salesPost } = await import("./route"));`

- [ ] **Step 2 (teste, casos):** acrescentar ao fim de `routes.test.ts`:

```ts
const ORDER = "9d8c7b6a-5f4e-4d3c-a2b1-0f9e8d7c6b5a";
const NEW_LEAD = "4d0f2b8c-6e3a-4b9d-a7f1-3a5b7d9f1c2e";
const CAMPAIGN = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ONE_ITEM = [{ nome: "Saia midi", quantidade: 1, valorUnitario: "59,90" }];

/** A linha de `public.orders` que as RPCs devolvem. */
function orderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER, tenant_id: STORE, phone: "5511987654321", lead_id: LEAD, group_name: "VIP 1", campaign_id: null,
    value: 59.9, created_at: new Date().toISOString(), created_by: SELLER, ...overrides,
  };
}

const rpcBody = (name: string) => requestsTo(`/rest/v1/rpc/${name}`)[0]?.body as Record<string, unknown> | undefined;

test("registrar com leadId do tenant: RPC com a vendedora de autora, campanha do lead, lead vira comprou", async () => {
  const createdAt = new Date().toISOString();
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [FERNANDA] };
    if (url.pathname === "/rest/v1/campaign_groups") {
      return {
        status: 200,
        body: [{ id: CAMPAIGN, name: "VIP outubro", slug: "vip-outubro", group_ids: ["vip1@g.us"], created_at: "2026-10-01T12:00:00Z" }],
      };
    }
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") {
      return { status: 200, body: orderRow({ campaign_id: CAMPAIGN, value: 287.7, created_at: createdAt }) };
    }
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ ...FERNANDA, status: "comprou" }] };
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/7" };
    return { status: 500 };
  };

  const res = await salesPost(
    call("POST", "/api/vendas", "token-vendedora", {
      leadId: LEAD,
      itens: [
        { nome: "Conjunto alfaiataria", quantidade: 1, valorUnitario: "149,90" },
        { nome: "Blusa bufante", quantidade: 2, valorUnitario: 68.9 },
      ],
    }),
  );

  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), {
    id: ORDER, cliente: "Fernanda Lima", telefone: "5511987654321", total: 287.7, criadaEm: createdAt,
    itens: [
      { nome: "Conjunto alfaiataria", quantidade: 1, valorUnitario: 149.9 },
      { nome: "Blusa bufante", quantidade: 2, valorUnitario: 68.9 },
    ],
    editavel: true,
  });
  const [lookup] = requestsTo("/rest/v1/leads");
  assert.equal(lookup.url.searchParams.get("tenant_id"), `eq.${STORE}`);
  assert.equal(lookup.url.searchParams.get("id"), `eq.${LEAD}`);
  assert.deepEqual(rpcBody("create_order_with_items"), {
    p_tenant_id: STORE, p_created_by: SELLER, p_lead_id: LEAD, p_phone: "5511987654321", p_group_name: "VIP 1",
    p_campaign_id: CAMPAIGN,
    p_items: [
      { name: "Conjunto alfaiataria", quantity: 1, unit_price: 149.9 },
      { name: "Blusa bufante", quantity: 2, unit_price: 68.9 },
    ],
  });
  assert.deepEqual(requestsTo("/rest/v1/leads").find((request) => request.method === "PATCH")?.body, { status: "comprou" });
});

test("leadId de outra loja → 400 Contato não encontrado., e nada é gravado", async () => {
  database = ({ url }) => (url.pathname === "/rest/v1/leads" ? { status: 200, body: [] } : { status: 500 });

  const res = await salesPost(call("POST", "/api/vendas", "token-vendedora", { leadId: LEAD, itens: ONE_ITEM }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Contato não encontrado." });
  assert.deepEqual(seen.map((request) => `${request.method} ${request.url.pathname}`), ["GET /rest/v1/leads"]);
});

test("sem leadId, cliente gravado em outro formato: usa o lead achado e não cria outro", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [{ ...FERNANDA, phone: "11987654321" }] };
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") return { status: 200, body: orderRow({ phone: "11987654321" }) };
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [FERNANDA] };
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/8" };
    return { status: 500 };
  };

  const res = await salesPost(
    call("POST", "/api/vendas", "token-vendedora", { telefone: "+55 11 98765-4321", nome: "Outro nome", itens: ONE_ITEM }),
  );

  assert.equal(res.status, 201);
  assert.equal((await res.json()).cliente, "Fernanda Lima");
  assert.equal(requestsTo("/rest/v1/rpc/upsert_lead").length, 0);
  assert.equal(rpcBody("create_order_with_items")?.p_lead_id, LEAD);
  assert.equal(rpcBody("create_order_with_items")?.p_phone, "11987654321");
});

test("sem leadId e sem cliente: cria o lead sem grupo de origem, com o nome digitado", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/upsert_lead") {
      return {
        status: 200,
        body: { id: NEW_LEAD, name: "Maria Souza", phone: "5511912345678", source_campaign: null, source_group_id: null, source_group_name: null },
      };
    }
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") {
      return { status: 200, body: orderRow({ lead_id: NEW_LEAD, phone: "5511912345678", group_name: null }) };
    }
    if (url.pathname === "/rest/v1/leads" && method === "PATCH") return { status: 200, body: [{ id: NEW_LEAD }] };
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/9" };
    return { status: 500 };
  };

  const res = await salesPost(
    call("POST", "/api/vendas", "token-vendedora", { telefone: "11 91234-5678", nome: "  Maria Souza ", itens: ONE_ITEM }),
  );

  assert.equal(res.status, 201);
  assert.equal((await res.json()).cliente, "Maria Souza");
  assert.deepEqual(rpcBody("upsert_lead"), {
    target_tenant_id: STORE,
    target_phone: "5511912345678",
    target_name: "Maria Souza",
    target_source_group_id: null,
    target_source_group_name: null,
    target_source_campaign: null,
  });
  assert.equal(rpcBody("create_order_with_items")?.p_lead_id, NEW_LEAD);
  assert.equal(rpcBody("create_order_with_items")?.p_group_name, null);
});

test("número em opt-out: venda sem lead e sem tocar em leads; item de R$ 0 (brinde) passa", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [{ id: "o1" }] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") {
      return { status: 200, body: orderRow({ lead_id: null, phone: "5511912345678", group_name: null }) };
    }
    if (url.pathname === "/rest/v1/orders" && method === "HEAD") return { status: 200, contentRange: "*/10" };
    return { status: 500 };
  };

  const res = await salesPost(
    call("POST", "/api/vendas", "token-vendedora", {
      telefone: "11912345678",
      nome: "Maria",
      itens: [...ONE_ITEM, { nome: "Brinde: sacola", quantidade: 1, valorUnitario: "0" }],
    }),
  );

  assert.equal(res.status, 201);
  assert.equal((await res.json()).cliente, null);
  assert.equal(requestsTo("/rest/v1/leads").length, 0);
  assert.equal(requestsTo("/rest/v1/rpc/upsert_lead").length, 0);
  assert.equal(rpcBody("create_order_with_items")?.p_lead_id, null);
  assert.equal(rpcBody("create_order_with_items")?.p_phone, "5511912345678");
  assert.deepEqual(rpcBody("create_order_with_items")?.p_items, [
    { name: "Saia midi", quantity: 1, unit_price: 59.9 },
    { name: "Brinde: sacola", quantity: 1, unit_price: 0 },
  ]);
});

test("corpo ruim → 400 com a frase da tela, sem ir ao banco", async () => {
  const okItem = { nome: "Saia midi", quantidade: 1, valorUnitario: "59,90" };
  const items = "Preencha nome, quantidade e valor de cada produto.";
  const cases: Array<[unknown, string]> = [
    [{ telefone: "11987654321", itens: [] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, nome: "  " }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, quantidade: 0 }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, valorUnitario: "abc" }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, valorUnitario: "-5" }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, valorUnitario: "1000000" }] }, items],
    [{ telefone: "11987654321", itens: [{ ...okItem, valorUnitario: "0" }] }, "A venda precisa somar mais que zero."],
    [{ telefone: "9876-5432", itens: [okItem] }, "Digite o número com DDD."],
    [{ itens: [okItem] }, "Digite o número com DDD."],
    [{ leadId: "nao-e-uuid", itens: [okItem] }, "Contato não encontrado."],
    [{ telefone: "11987654321", itens: [okItem], desconto: 10 }, "Dados inválidos. Recarregue a página e tente de novo."],
    [null, "Dados inválidos. Recarregue a página e tente de novo."],
  ];

  for (const [body, error] of cases) {
    const res = await salesPost(call("POST", "/api/vendas", "token-vendedora", body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(await res.json(), { error }, JSON.stringify(body));
  }
  assert.equal(seen.length, 0);
});

test("exceção da RPC vira a frase da tela, e o lead não vira comprou", async () => {
  database = ({ method, url }) => {
    if (url.pathname === "/rest/v1/leads" && method === "GET") return { status: 200, body: [FERNANDA] };
    if (url.pathname === "/rest/v1/campaign_groups") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/rpc/create_order_with_items") {
      return { status: 400, body: { code: "P0001", message: "itens_invalidos", details: null, hint: null } };
    }
    return { status: 500 };
  };

  const res = await salesPost(call("POST", "/api/vendas", "token-vendedora", { leadId: LEAD, itens: ONE_ITEM }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Preencha nome, quantidade e valor de cada produto." });
  assert.equal(requestsTo("/rest/v1/leads").filter((request) => request.method === "PATCH").length, 0);
});

test("60 vendas por minuto por loja; a 61ª é 429", async () => {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const res = await salesPost(call("POST", "/api/vendas", "token-outra-loja", {}));
    assert.equal(res.status, 400, `venda ${attempt}`);
  }
  const res = await salesPost(call("POST", "/api/vendas", "token-outra-loja", {}));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "Muitas vendas seguidas. Espere um minuto e tente de novo." });
});

test("minhas vendas: sem ?mes= é o mês corrente de Brasília, e só as de quem chama", async () => {
  database = ({ url }) => (url.pathname === "/rest/v1/orders" ? { status: 200, body: [], contentRange: "*/0" } : { status: 500 });
  const month = brasiliaMonth(new Date());

  const res = await salesGet(call("GET", "/api/vendas", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { mes: month, total: 0, quantidade: 0, truncado: false, vendas: [] });
  const [orders] = requestsTo("/rest/v1/orders");
  const { start, end } = monthRange(month);
  assert.deepEqual(orders.url.searchParams.getAll("created_at"), [`gte.${start}`, `lt.${end}`]);
  assert.equal(orders.url.searchParams.get("created_by"), `eq.${SELLER}`);
  assert.equal(orders.url.searchParams.get("tenant_id"), `eq.${STORE}`);
});

test("mês fora do formato → 400 Mês inválido.", async () => {
  const res = await salesGet(call("GET", "/api/vendas?mes=2026-13", "token-vendedora"));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Mês inválido." });
  assert.equal(seen.length, 0);
});
```

- [ ] **Step 3:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/vendas/routes.test.ts` → FAIL (`Cannot find module './route'`).

- [ ] **Step 4 (implementação):** `src/app/api/vendas/route.ts`

```ts
import { recordOrder } from "@/lib/orders/registrar";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { addLead } from "@/lib/stores/leads";
import {
  createSale,
  findLeadById,
  findLeadByPhones,
  isOptedOutAny,
  listMonthSales,
  saleFromOrder,
  type SaleLead,
} from "@/lib/stores/vendas";
import { MONTH_FORMAT, brasiliaMonth } from "@/lib/vendas/month";
import { MESSAGES, bodyErrorMessage, getSalesCaller, handleSalesErrors, itemsForRpc, saleBody } from "@/lib/vendas/request";
import { telefoneCanonico, variantesDoTelefone } from "@/lib/vendas/telefone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vendas por loja por minuto. */
const SALES_PER_MINUTE = 60;

// GET /api/vendas?mes=YYYY-MM — as vendas de quem chama no mês de Brasília
// (default: o corrente). Para qualquer papel: as de quem chamou.
export async function GET(req: Request) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    const now = new Date();
    const month = new URL(req.url).searchParams.get("mes") || brasiliaMonth(now);
    if (!MONTH_FORMAT.test(month)) return Response.json({ error: MESSAGES.month }, { status: 400 });
    return Response.json(await listMonthSales(caller, month, now));
  });
}

// POST /api/vendas — registra uma venda com itens; a autora é quem chama.
export async function POST(req: Request) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    if (await checkRateLimit(`vendas-registro:${caller.tenantId}`, SALES_PER_MINUTE, 60_000)) {
      return Response.json({ error: MESSAGES.tooManySales }, { status: 429 });
    }
    const body = saleBody.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ error: bodyErrorMessage(body.error) }, { status: 400 });
    const parsed = itemsForRpc(body.data.itens);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const contact = await saleContact(caller.tenantId, body.data);
    if ("error" in contact) return Response.json({ error: contact.error }, { status: 400 });
    const { lead, phone } = contact;

    const order = await recordOrder(caller.tenantId, lead, (campaignId) =>
      createSale({ caller, leadId: lead?.id ?? null, phone, groupName: lead?.source_group_name ?? null, campaignId, items: parsed.items }),
    );
    return Response.json(saleFromOrder(order, parsed.items, lead?.name ?? null, caller, new Date()), { status: 201 });
  });
}

/**
 * O lead da venda e o telefone gravado no pedido. Com `leadId`, o lead tem que
 * ser desta loja. Sem, acha pelo número em qualquer formato ou cria um sem
 * grupo de origem. Número em opt-out: venda sem lead — quem pediu pra sair
 * não entra na base, nem por uma venda.
 */
async function saleContact(
  tenantId: string,
  body: { leadId?: string; telefone?: string; nome?: string },
): Promise<{ lead: SaleLead | null; phone: string } | { error: string }> {
  if (body.leadId) {
    const lead = await findLeadById(tenantId, body.leadId);
    return lead ? { lead, phone: lead.phone ?? "" } : { error: MESSAGES.contact };
  }
  const phones = variantesDoTelefone(body.telefone ?? "");
  const canonical = telefoneCanonico(body.telefone ?? "");
  if (!phones || !canonical) return { error: MESSAGES.phone };
  if (await isOptedOutAny(tenantId, phones)) return { lead: null, phone: canonical };
  const found = await findLeadByPhones(tenantId, phones);
  if (found) return { lead: found, phone: found.phone ?? canonical };
  return { lead: await addLead(tenantId, { phone: canonical, name: body.nome || undefined }), phone: canonical };
}
```

- [ ] **Step 5:** comando do Step 3 → PASS (16 testes). `npx tsc --noEmit -p tsconfig.json` limpo.
- [ ] **Step 6 (commit):**

```bash
git -C <W> add apps/web/src/app/api/vendas/route.ts apps/web/src/app/api/vendas/routes.test.ts
```
```bash
git -C <W> diff --cached --stat
```
```bash
git -C <W> commit -m "feat(vendas): record a sale with items and list my month" -m "POST /api/vendas validates everything before writing, resolves the lead (tenant check, phone variants, new lead without source group, none on opt-out) and records through create_order_with_items with created_by, wrapped by recordOrder. GET /api/vendas lists the caller's sales in the Brasilia month. 60 sales per minute per store." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: corrigir e apagar dentro da janela (TDD) e o fim de `PENDENTES_DO_PR_4`

**Files:** criar `src/app/api/vendas/[id]/route.ts`; modificar `src/app/api/vendas/routes.test.ts`, `src/lib/auth/modulos-rotas.test.ts` (do PR 3)
**Depends-on:** Task 6
**Interfaces (produz, contrato PR 4 → PR 5):**
```
PATCH  /api/vendas/[id] body { itens } → 200 VendaDoMes · 400 { error } · 403 { error } · 404 { error }
DELETE /api/vendas/[id]               → 200 { ok: true } · 403 { error } · 404 { error }
```

- [ ] **Step 1 (teste, cabeçalho):** em `routes.test.ts`, abaixo de `import type { GET as SalesGet, POST as SalesPost } from "./route";` acrescentar `import type { DELETE as SaleDelete, PATCH as SalePatch } from "./[id]/route";`; abaixo de `let salesPost: typeof SalesPost;` acrescentar

```ts
let salePatch: typeof SalePatch;
let saleDelete: typeof SaleDelete;
```

  e no `before`, abaixo da linha que importa `./route`, acrescentar `({ PATCH: salePatch, DELETE: saleDelete } = await import("./[id]/route"));`

- [ ] **Step 2 (teste, casos):** acrescentar ao fim de `routes.test.ts`:

```ts
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

test("vendedora corrige a própria venda: trava de autora na RPC, 200 com os itens novos", async () => {
  const createdAt = hoursAgo(1);
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/rpc/replace_order_items") return { status: 200, body: orderRow({ value: 119.8, created_at: createdAt }) };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [{ id: LEAD, name: "Fernanda Lima" }] };
    return { status: 500 };
  };

  const res = await salePatch(
    call("PATCH", `/api/vendas/${ORDER}`, "token-vendedora", { itens: [{ nome: "Vestido midi", quantidade: 2, valorUnitario: "59,90" }] }),
    withId(ORDER),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    id: ORDER, cliente: "Fernanda Lima", telefone: "5511987654321", total: 119.8, criadaEm: createdAt,
    itens: [{ nome: "Vestido midi", quantidade: 2, valorUnitario: 59.9 }],
    editavel: true,
  });
  assert.deepEqual(rpcBody("replace_order_items"), {
    p_tenant_id: STORE,
    p_order_id: ORDER,
    p_items: [{ name: "Vestido midi", quantity: 2, unit_price: 59.9 }],
    p_only_author: SELLER,
  });
  assert.equal(requestsTo("/rest/v1/leads")[0].url.searchParams.get("tenant_id"), `eq.${STORE}`);
});

test("passou de 24 horas (ou não é dela) → 403 com a frase da tela", async () => {
  database = () => ({ status: 400, body: { code: "P0001", message: "fora_da_janela", details: null, hint: null } });

  const res = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-vendedora", { itens: ONE_ITEM }), withId(ORDER));

  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Passou de 24 horas: só o dono da loja corrige." });
});

test("dono corrige qualquer venda da loja, sem trava de autora nem de prazo", async () => {
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/rpc/replace_order_items") return { status: 200, body: orderRow({ created_at: hoursAgo(24 * 30) }) };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [{ id: LEAD, name: "Fernanda Lima" }] };
    return { status: 500 };
  };

  const res = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-dono", { itens: ONE_ITEM }), withId(ORDER));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).editavel, true);
  assert.equal(rpcBody("replace_order_items")?.p_only_author, null);
});

test("venda que não existe → 404; id que não é UUID nem chega ao banco", async () => {
  database = () => ({ status: 400, body: { code: "P0001", message: "pedido_nao_encontrado", details: null, hint: null } });
  const missing = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-dono", { itens: ONE_ITEM }), withId(ORDER));
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Venda não encontrada." });

  seen.length = 0;
  const patched = await salePatch(call("PATCH", "/api/vendas/123", "token-dono", { itens: ONE_ITEM }), withId("123"));
  const deleted = await saleDelete(call("DELETE", "/api/vendas/123", "token-dono"), withId("123"));
  assert.equal(patched.status, 404);
  assert.equal(deleted.status, 404);
  assert.equal(seen.length, 0);
});

test("correção com itens ruins → 400 antes da RPC", async () => {
  const res = await salePatch(call("PATCH", `/api/vendas/${ORDER}`, "token-vendedora", { itens: [] }), withId(ORDER));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Preencha nome, quantidade e valor de cada produto." });
  assert.equal(seen.length, 0);
});

test("vendedora apaga a própria venda dentro das 24h", async () => {
  database = ({ method, url }) =>
    method === "DELETE" && url.pathname === "/rest/v1/orders" ? { status: 200, body: [{ id: ORDER }] } : { status: 500 };
  const cutoff = Date.now() - 24 * 3_600_000;

  const res = await saleDelete(call("DELETE", `/api/vendas/${ORDER}`, "token-vendedora"), withId(ORDER));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const [deleted] = requestsTo("/rest/v1/orders");
  assert.equal(deleted.url.searchParams.get("tenant_id"), `eq.${STORE}`);
  assert.equal(deleted.url.searchParams.get("created_by"), `eq.${SELLER}`);
  const limit = Date.parse((deleted.url.searchParams.get("created_at") ?? "").replace(/^gt\./, ""));
  assert.ok(Math.abs(limit - cutoff) < 5_000, "o corte é agora − 24h");
});

test("vendedora, nada apagado (outra autora ou mais de 24h) → 403 com a frase", async () => {
  database = () => ({ status: 200, body: [] });
  const res = await saleDelete(call("DELETE", `/api/vendas/${ORDER}`, "token-vendedora"), withId(ORDER));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Passou de 24 horas: só o dono da loja corrige." });
});

test("dono apaga sem filtro de autora nem prazo; nada apagado → 404", async () => {
  database = () => ({ status: 200, body: [] });

  const res = await saleDelete(call("DELETE", `/api/vendas/${ORDER}`, "token-dono"), withId(ORDER));

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Venda não encontrada." });
  const [deleted] = requestsTo("/rest/v1/orders");
  assert.equal(deleted.url.searchParams.get("tenant_id"), `eq.${STORE}`);
  assert.equal(deleted.url.searchParams.get("created_by"), null);
  assert.equal(deleted.url.searchParams.get("created_at"), null);
});
```

- [ ] **Step 3:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/vendas/routes.test.ts` → FAIL (`Cannot find module './[id]/route'`).

- [ ] **Step 4 (implementação):** `src/app/api/vendas/[id]/route.ts`

```ts
import { z } from "zod";

import { deleteSale, leadNames, replaceSaleItems, saleFromOrder } from "@/lib/stores/vendas";
import { MESSAGES, bodyErrorMessage, correctionBody, getSalesCaller, handleSalesErrors, itemsForRpc } from "@/lib/vendas/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saleId = z.uuid();

// PATCH /api/vendas/[id] — troca os itens e recalcula o total. Vendedora: só a
// própria e até 24h (a RPC confere e lança `fora_da_janela`).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    const { id } = await params;
    if (!saleId.safeParse(id).success) return Response.json({ error: MESSAGES.notFound }, { status: 404 });
    const body = correctionBody.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ error: bodyErrorMessage(body.error) }, { status: 400 });
    const parsed = itemsForRpc(body.data.itens);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const order = await replaceSaleItems(caller, id, parsed.items);
    const names = await leadNames(caller.tenantId, [order.lead_id]);
    const client = order.lead_id ? (names.get(order.lead_id) ?? null) : null;
    return Response.json(saleFromOrder(order, parsed.items, client, caller, new Date()));
  });
}

// DELETE /api/vendas/[id] — vendedora: só a própria, até 24h; dono, admin e
// operador: qualquer venda da loja (o mesmo poder do DELETE /api/orders).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    const { id } = await params;
    if (!saleId.safeParse(id).success) return Response.json({ error: MESSAGES.notFound }, { status: 404 });
    if (await deleteSale(caller, id, new Date())) return Response.json({ ok: true });
    // Pros filtros de autora e prazo, "não existe" e "passou de 24h" dão no mesmo: não pode.
    return caller.role === "seller"
      ? Response.json({ error: MESSAGES.window }, { status: 403 })
      : Response.json({ error: MESSAGES.notFound }, { status: 404 });
  });
}
```

- [ ] **Step 5:** comando do Step 3 → PASS (24 testes).

- [ ] **Step 6: fim de `PENDENTES_DO_PR_4`.** `grep -rn "PENDENTES_DO_PR_4" <W>/apps/web/src`. O PR 3 deixou as rotas de vendas do mapa num conjunto pulado pelo teste estrutural 2 (mapa × `route.ts` reais × métodos exportados), porque elas só nascem aqui. Esperado em `src/lib/auth/modulos-rotas.test.ts` algo como:

```ts
/** Rotas de vendas: o mapa já as nomeia, os route.ts nascem no PR 4. */
const PENDENTES_DO_PR_4 = new Set([
  "GET /api/vendas/contato",
  "GET /api/vendas",
  "POST /api/vendas",
  "PATCH /api/vendas/*",
  "DELETE /api/vendas/*",
]);
```

  e, dentro do laço que cruza o mapa com os arquivos,

```ts
      if (PENDENTES_DO_PR_4.has(`${metodo} ${padrao}`)) continue;
```

  Apagar a constante (com o comentário) e toda linha que a lê. Se o formato for outro (padrões sem método, `Array`, `includes`), a regra é a mesma: some a constante e toda leitura dela — o teste passa a exigir os cinco handlers de vendas. Se o grep não achar nada, pular este step e anotar no corpo do PR ("o PR 3 não deixou pendência de vendas no teste estrutural").

- [ ] **Step 7:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/auth/modulos-rotas.test.ts` → PASS (agora cobrindo `contato/route.ts` GET, `route.ts` GET/POST e `[id]/route.ts` PATCH/DELETE). `npx tsc --noEmit -p tsconfig.json` limpo.
- [ ] **Step 8 (commit):** (o diretório inteiro de vendas: o `[id]` em pathspec do git é glob)

```bash
git -C <W> add apps/web/src/app/api/vendas apps/web/src/lib/auth/modulos-rotas.test.ts
```
```bash
git -C <W> diff --cached --stat
```

  Conferir que a lista tem só `[id]/route.ts`, `routes.test.ts` e `modulos-rotas.test.ts`.

```bash
git -C <W> commit -m "feat(vendas): correct and delete a sale within the 24h window" -m "PATCH goes through replace_order_items with p_only_author for sellers; DELETE filters by author and the 24h cutoff for sellers. The module-map structural test no longer skips the sales routes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: verificação, mutantes, PR e comandos para o Igor

**Files:** nenhum novo (o corpo do PR vai num arquivo fora do repo).
**Depends-on:** Tasks 1–7

- [ ] **Step 1: tipos, lint, suíte** (em `<W>\apps\web`):

```bash
npx tsc --noEmit -p tsconfig.json
```
```bash
npx tsc --noEmit -p tsconfig.e2e.json
```
```bash
npm run lint
```
```bash
npm test
```

  Tudo limpo/verde. Falhou: corrigir na task de origem e commitar o conserto separado (`fix(vendas): …`).

- [ ] **Step 2: rodar os mutantes** (o commit já existe, então `git restore` não perde nada). Para cada um: editar, rodar o teste indicado, ver **FAIL**, desfazer com `git -C <W> restore <arquivo>`.
  1. `src/lib/stores/vendas.ts`, em `deleteSale`: apagar a linha `.eq("created_by", caller.authUserId)` → `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/vendas.test.ts` falha em "apagar: vendedora só a própria…".
  2. `src/lib/stores/vendas.ts`, em `listMonthSales`: apagar `.eq("tenant_id", caller.tenantId)` → o mesmo teste falha em "vendas do mês…".
  3. `src/app/api/vendas/contato/route.ts`: trocar `if (await isOptedOutAny(caller.tenantId, phones))` por `if (false)` → `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/vendas/routes.test.ts` falha em "número em opt-out: optout true…".

  Mutante que passa = teste fraco: reforçar o teste antes de seguir.

- [ ] **Step 3: defasagem.** `git -C <W> fetch origin main` e `git -C <W> log HEAD..origin/main --oneline`. Não vazio → `git -C <W> merge origin/main` e repetir o Step 1.

- [ ] **Step 4: gate real** (PowerShell, na raiz do worktree; sem `2>&1`, que no PS 5.1 transforma warning de stderr em falha):

```powershell
Set-Location <W>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  `EXIT=0`.

- [ ] **Step 5: revisão.** Despachar um Code Reviewer sobre `git -C <W> diff origin/main...HEAD` (foco: filtro de tenant em toda query, vendedora nunca recebendo lista, janela de 24h coerente entre `isSaleEditable`, `deleteSale` e a RPC, 500 sem mensagem do banco). CRITICAL/HIGH corrigidos e commitados (`fix(vendas): …`) antes do push; repetir Steps 1 e 4 se houve conserto.

- [ ] **Step 6: corpo do PR.** Escrever `C:\Users\Igor\AppData\Local\Temp\pr4-vendas-api.md` (fora do repo) com o conteúdo abaixo, trocando os `<…>` pelos números da Task 0 Step 6:

```markdown
## O que entra

PR 4 do acesso da vendedora (spec `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` §3; contrato "PR 4 → PR 5" no índice).

- `GET /api/vendas/contato?telefone=` — um cliente pelo número, nunca a lista. Procura todas as formas do número (com/sem 55, com/sem 9º dígito). Número em opt-out: `{ contato: null, optout: true }`. 30 buscas/min por pessoa.
- `POST /api/vendas` — venda com itens pela RPC `create_order_with_items`, autora = quem chama. Lead: o do `leadId` (tem que ser da loja), ou achado pelo número, ou criado sem grupo de origem; em opt-out, sem lead. Tudo validado antes de gravar. 60 vendas/min por loja.
- `GET /api/vendas?mes=YYYY-MM` — as vendas de quem chama no mês de Brasília, com itens, `truncado` acima de 1000 e `editavel` calculado no servidor.
- `PATCH` / `DELETE /api/vendas/[id]` — vendedora só a própria, até 24h ("Passou de 24 horas: só o dono da loja corrige."); dono/admin/operador, qualquer venda da loja.
- `lib/orders/registrar.ts` — campanha pelo lead, lead → `comprou` e marco `first_order` num helper só, usado também pelo `POST /api/orders` (que continua gravando valor único pelo `addOrder`, sem itens).
- `AddLeadInput.sourceGroup` opcional: lead nascido de venda não tem grupo de origem (o `upsert_lead` já aceitava nulo).
- O teste estrutural do mapa de módulos deixa de pular as rotas de vendas.

Sem tela e sem mudança de banco. Ninguém vira vendedora antes do PR 6 (convite).

## Medição do §9 (prod)

Leads com telefone: <com_phone>/<total> (<com_55> com 55). Contato sem telefone (regime LID) não é achado pela busca; a venda cria um contato novo com telefone — previsto na spec §6, a tela (PR 5) mostra "cliente novo".

## Como testar

Em `apps/web`:
- `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/vendas/telefone.test.ts src/lib/vendas/month.test.ts src/lib/orders/registrar.test.ts src/lib/stores/vendas.test.ts src/app/api/vendas/routes.test.ts`
- `npm test`, os dois `tsc`, `npm run lint`; na raiz, `infra/scripts/verify-local.ps1`.
- Mutantes rodados: sem `created_by` no apagar, sem `tenant_id` no mês, sem checar opt-out na busca — os três derrubam os testes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 7: Comandos para o Igor** (PowerShell 5.1, um por bloco, sem `&&`):

```bash
git -C <W> push -u origin feat/vendas-api
```
```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/vendas-api --title "feat(vendas): API de vendas — busca por número, registrar com itens, minhas vendas, corrigir/apagar (acesso da vendedora, PR 4)" --body-file C:\Users\Igor\AppData\Local\Temp\pr4-vendas-api.md
```
```bash
gh pr checks <N> --repo codingB0y/Girumo
```
```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

  (`--repo` no merge evita o `git checkout main` local que falha quando a `main` está presa em outro worktree.) `main` sem proteção: mergear à mão só com os checks verdes, nunca auto-merge.

  Depois do merge, no SQL de **prod** (o card continua em construção: sem tela e sem convite, a feature ainda não existe para ninguém):

```sql
select public.move_card('acesso-vendedora', 'em_construcao',
  'PR 4 mergeado: API de vendas (busca, registrar com itens, minhas vendas, corrigir/apagar em 24h). Faltam tela (PR 5) e convite (PR 6).',
  'PR #<N>');
update public.board_features set blocker = null where key = 'acesso-vendedora';
```

  Registrar a decisão no grafo (PowerShell, no checkout principal, onde o LightRAG roda):

```bash
rag insert "decisão: API de vendas (PR 4 do acesso da vendedora) — POST /api/orders continua gravando valor único pelo addOrder; venda com itens só por /api/vendas via create_order_with_items com created_by; o entorno do pedido (campanha pelo lead, lead comprou, first_order) vive em lib/orders/registrar.ts; busca por número em todas as variantes (55 e 9º dígito); número em opt-out vende sem lead e a busca não devolve o contato; vendedora corrige/apaga só a própria venda até 24h." --source decisao-2026-10-07-vendas-api
```

- [ ] **Step 8: encerrar.** Reportar "PRs que deixei abertos: #<N> (motivo)" — ou "nenhum" se o Igor já mergeou na sessão.
