# Modo Demonstração — Implementation Plan

> **REVERTIDO em 31/08/2026.** O modo demonstração saiu do produto: não
> fazia sentido com a estratégia. O `/demo`, a rota de captura, os componentes e
> a lib foram removidos; o CTA principal da landing passou a apontar para o
> WhatsApp de vendas. A tabela `demo_requests` continua nos dois bancos, inerte.
> Este documento fica como registro do desenho e das armadilhas encontradas.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar `/demo` — uma demonstração encenada, client-only, com dados simulados e sem instância Evolution conectada — mais a captura pública de nome + WhatsApp em `demo_requests`.

**Architecture:** Superfície própria fora do painel. O visitante avança quatro passos por clique; cada passo se anima sozinho a partir de fixtures em TypeScript. Nada no fluxo do demo chama Evolution ou Supabase — o único servidor envolvido é o `POST /api/demo/request`, que entra sem sessão pelo `AccessKind` novo `public-rate-limited` e é limitado por IP no middleware.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind, Supabase service-role, Resend, `node:test` via `tsx --test`, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-28-modo-demonstracao-design.md`](../specs/2026-08-28-modo-demonstracao-design.md)

## Global Constraints

- **Rótulo permanente "Demonstração — dados simulados"** visível em toda tela do demo. Não-negociável: este repositório já teve prova social fabricada em produção.
- **Zero chamadas a Evolution ou Supabase no fluxo do demo.** Só o POST da captura toca banco.
- **Toda migração vai nos DOIS bancos:** dev `wfjuwogxaupyadwhvoxy` e prod `nidoatbxaylrkcgbszns`. Aplicar em um só cria drift silencioso.
- **Identificadores em inglês, comentários e strings de tela em português** — é o padrão de `lib/` neste repo.
- TypeScript strict, sem `any` sem justificativa. Arquivos `kebab-case`, componentes `PascalCase`, funções `camelCase`.
- Commits com prefixo semântico, mensagem em inglês.
- `npm --workspace apps/web test` precisa continuar em **653+ passando, 0 falhas** (baseline colhido em 28/08 no worktree).

---

### Task 1: Fronteira pública — `/demo` sem sessão, captura limitada por IP

Sem esta tarefa a rota nasce morta: `classifyRequest` cairia na última linha (`startsWith("/api/")` → `"user"`) e o handler responderia **401 a todo visitante anônimo**.

**Files:**
- Modify: `apps/web/src/lib/public-pages.ts:17`
- Modify: `apps/web/src/lib/security/request-access-policy.ts:1-5` (união) e `:47-88` (classificação)
- Modify: `apps/web/src/middleware.ts:10-23` (tabela de tetos) e `:112` (branch)
- Test: `apps/web/src/lib/public-pages.test.ts`, `apps/web/src/lib/security/request-access-policy.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa)
- Produces: `AccessKind` ganha o membro `"public-rate-limited"`; `classifyRequest("/api/demo/request", "POST") === "public-rate-limited"`; `isPublicPage("/demo") === true`

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/web/src/lib/public-pages.test.ts`, acrescentar:

```ts
test("/demo abre sem sessão", () => {
  assert.equal(isPublicPage("/demo"), true);
});

test("prefixo de /demo não abre por acidente", () => {
  // A lista casa por caminho exato. Se algum dia virar prefixo, este teste cai.
  assert.equal(isPublicPage("/demo-interno"), false);
});
```

Em `apps/web/src/lib/security/request-access-policy.test.ts`, acrescentar:

```ts
test("captura do demo entra sem sessão e limitada por IP", () => {
  assert.equal(classifyRequest("/api/demo/request", "POST"), "public-rate-limited");
});

test("outros métodos na captura do demo ficam no gate de sessão", () => {
  // Path exato + método exato. GET aqui não tem uso legítimo, e deixar o
  // prefixo largo é como DELETE /api/auth/account nasceu fail-open.
  assert.equal(classifyRequest("/api/demo/request", "GET"), "user");
  assert.equal(classifyRequest("/api/demo/outra", "POST"), "user");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace apps/web test 2>&1 | grep -A3 "demo"`
Expected: FAIL — `isPublicPage("/demo")` devolve `false` e `classifyRequest` devolve `"user"`.

- [ ] **Step 3: Implementar**

Em `apps/web/src/lib/public-pages.ts`, linha 17:

```ts
export const PUBLIC_PAGES: readonly string[] = ["/", "/home-v2", "/termos", "/privacidade", "/demo"];
```

Em `apps/web/src/lib/security/request-access-policy.ts`, acrescentar o membro à união (linha 2):

```ts
export type AccessKind =
  | "public"
  | "public-rate-limited"
  | "auth-rate-limited"
```

…e, dentro de `classifyRequest`, **antes** da última linha (`return pathname.startsWith("/api/") ? "user" : "public";`):

```ts
  // Captura do modo demonstração: entra sem sessão por natureza — quem preenche
  // o formulário ainda NÃO tem conta, que é o ponto do paid-first. O payload é
  // validado no próprio handler; o middleware só limita por IP.
  //
  // Path EXATO, igual ao bloco dos crons: prefixo `/api/demo/` abriria qualquer
  // rota futura da família sem gate nenhum.
  if (key === "POST /api/demo/request") return "public-rate-limited";
```

Em `apps/web/src/middleware.ts`, acrescentar à tabela `RATE_LIMITS` (linha 10):

```ts
  // Captura do demo: formulário público de dois campos. Teto baixo — ninguém
  // agenda 6 demonstrações por minuto.
  //
  // A entrada é OBRIGATÓRIA, não decorativa: `isRateLimited` faz
  // `Object.entries(RATE_LIMITS).find(...)` e devolve `false` quando não acha o
  // path. Sem esta linha o branch abaixo roda e nunca limita nada — fail-open.
  "/api/demo/request": 5,
```

…e estender o branch existente (linha ~112):

```ts
  // Public auth mutations are rate-limited before reaching their handlers.
  if (accessKind === "auth-rate-limited" || accessKind === "public-rate-limited") {
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace apps/web test`
Expected: PASS, contagem total maior que o baseline de 653, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/public-pages.ts apps/web/src/lib/public-pages.test.ts apps/web/src/lib/security/request-access-policy.ts apps/web/src/lib/security/request-access-policy.test.ts apps/web/src/middleware.ts
git commit -m "feat(demo): public boundary for the demo page and its capture route"
```

---

### Task 2: Extrair os tipos do painel — a âncora anti-drift

O tipo `Lead` está declarado dentro de uma página e não é importável. Sem extrair, as fixtures do demo teriam que **redeclarar** o formato — e uma cópia não quebra quando o original muda. É exatamente o drift que a spec quer evitar.

**Files:**
- Create: `apps/web/src/lib/painel/types.ts`
- Modify: `apps/web/src/app/painel/contatos/page.tsx:7-18` (remover as declarações locais, importar)
- Test: nenhum novo. O gate é o `tsc` mais a suíte existente.

**Interfaces:**
- Produces: `export type Lead` e `export type LeadStatus` em `@/lib/painel/types`

- [ ] **Step 1: Criar o módulo de tipos**

Criar `apps/web/src/lib/painel/types.ts`:

```ts
/**
 * Tipos que as telas do painel consomem das rotas de API.
 *
 * Moram fora das páginas porque o modo demonstração (`lib/demo/fixtures.ts`)
 * precisa importá-los: é o acoplamento em TIPO que faz a fixture parar de
 * compilar quando o contrato da rota muda. Sem isso, o demo passa a mostrar um
 * formato que o produto não usa mais — e mente em silêncio, que é a falha que
 * o gatilho G1 mede como arrependimento pós-compra.
 */

export type LeadStatus = "novo" | "ativo" | "comprou";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  sourceGroup: string;
  sourceCampaign: string;
  status: LeadStatus;
  enteredAt: string;
  /** ISO da última saída de grupo, ou null se nunca saiu. */
  leftAt?: string | null;
};
```

- [ ] **Step 2: Trocar a declaração local pelo import**

Em `apps/web/src/app/painel/contatos/page.tsx`, apagar o bloco `type LeadStatus = ...` e `type Lead = { ... }` (linhas 7-18) e acrescentar aos imports:

```ts
import type { Lead, LeadStatus } from "@/lib/painel/types";
```

- [ ] **Step 3: Verificar que nada quebrou**

Run: `npm --workspace apps/web run lint && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: sem erro. `lint` sozinho **não** checa tipo — o `tsc` é o que vale aqui.

Run: `npm --workspace apps/web test`
Expected: 653+ passando, 0 falhas.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/painel/types.ts apps/web/src/app/painel/contatos/page.tsx
git commit -m "refactor(painel): extract Lead types so the demo can bind to them"
```

---

### Task 3: Roteiro puro e fixtures

**Files:**
- Create: `apps/web/src/lib/demo/script.ts`
- Create: `apps/web/src/lib/demo/fixtures.ts`
- Test: `apps/web/src/lib/demo/script.test.ts`

**Interfaces:**
- Consumes: `Lead`, `LeadStatus` de `@/lib/painel/types` (Task 2)
- Produces: `DEMO_STEPS`, `stepAt(index)`, `nextStep(index)`, `isLastStep(index)`, `DEMO_STEP_COUNT`; fixtures `DEMO_GROUPS`, `DEMO_LEADS`, `DEMO_ORDER`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/demo/script.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_STEPS, DEMO_STEP_COUNT, isLastStep, nextStep, stepAt } from "./script";

test("o roteiro tem exatamente quatro passos, na ordem da venda", () => {
  assert.equal(DEMO_STEP_COUNT, 4);
  assert.deepEqual(
    DEMO_STEPS.map((s) => s.id),
    ["campaign", "dispatch", "group", "order"],
  );
});

test("avançar anda um passo por vez", () => {
  assert.equal(nextStep(0), 1);
  assert.equal(nextStep(1), 2);
});

test("avançar no último passo não sai do fim", () => {
  // Sem o clamp, o índice cresceria para sempre e stepAt devolveria undefined —
  // tela branca no exato momento em que o CTA precisa aparecer.
  assert.equal(nextStep(3), 3);
  assert.equal(nextStep(99), 3);
});

test("índice fora da faixa cai no passo mais próximo, nunca em undefined", () => {
  assert.equal(stepAt(-1).id, "campaign");
  assert.equal(stepAt(99).id, "order");
});

test("só o último passo dispensa botão de avançar — ali entra o CTA", () => {
  assert.equal(isLastStep(3), true);
  assert.equal(isLastStep(2), false);
  assert.equal(stepAt(3).action, null);
  for (const i of [0, 1, 2]) assert.notEqual(stepAt(i).action, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test apps/web/src/lib/demo/script.test.ts`
Expected: FAIL — `Cannot find module './script'`.

- [ ] **Step 3: Escrever as fixtures**

Criar `apps/web/src/lib/demo/fixtures.ts`:

```ts
import type { Lead } from "@/lib/painel/types";

/**
 * Dados encenados do modo demonstração.
 *
 * Tipados com os MESMOS tipos que as rotas reais devolvem, de propósito: se o
 * contrato mudar, isto para de compilar e o `tsc` do CI acusa antes de o demo
 * passar a mostrar um produto que não existe mais.
 *
 * Nada aqui vai para banco nenhum. São constantes de módulo.
 */

export type DemoGroup = {
  name: string;
  members: number;
  capacity: number;
};

/** Três grupos, como um lojista pequeno de verdade tem. */
export const DEMO_GROUPS: readonly DemoGroup[] = [
  { name: "Atacado Moda — VIP 01", members: 812, capacity: 1024 },
  { name: "Atacado Moda — VIP 02", members: 640, capacity: 1024 },
  { name: "Lançamentos da Semana", members: 297, capacity: 1024 },
];

export const DEMO_CAMPAIGN_NAME = "Nova coleção — sexta 19h";

/**
 * Os leads entram um a um no passo 3. A ordem do array é a ordem de entrada.
 * Telefones com o final mascarado: é o que o painel real mostra, e um número
 * plausível numa tela pública vira ligação para um estranho.
 */
export const DEMO_LEADS: readonly Lead[] = [
  {
    id: "demo-1",
    name: "Camila R.",
    phone: "(62) 9****-1420",
    sourceGroup: "Atacado Moda — VIP 01",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "novo",
    enteredAt: "2026-08-28T19:00:12.000Z",
    leftAt: null,
  },
  {
    id: "demo-2",
    name: "Juliana P.",
    phone: "(11) 9****-8871",
    sourceGroup: "Atacado Moda — VIP 01",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "novo",
    enteredAt: "2026-08-28T19:00:31.000Z",
    leftAt: null,
  },
  {
    id: "demo-3",
    name: "Marcos A.",
    phone: "(31) 9****-2093",
    sourceGroup: "Lançamentos da Semana",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "ativo",
    enteredAt: "2026-08-28T19:01:04.000Z",
    leftAt: null,
  },
  {
    id: "demo-4",
    name: "Patrícia L.",
    phone: "(62) 9****-5567",
    sourceGroup: "Atacado Moda — VIP 02",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "ativo",
    enteredAt: "2026-08-28T19:01:47.000Z",
    leftAt: null,
  },
  {
    id: "demo-5",
    name: "Renata S.",
    phone: "(85) 9****-3310",
    sourceGroup: "Atacado Moda — VIP 01",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "comprou",
    enteredAt: "2026-08-28T19:02:20.000Z",
    leftAt: null,
  },
];

export type DemoOrder = {
  buyer: string;
  items: number;
  total: number;
};

/** O pedido do passo 4 — vem da lead que entrou com status `comprou`. */
export const DEMO_ORDER: DemoOrder = {
  buyer: "Renata S.",
  items: 12,
  total: 1840,
};
```

- [ ] **Step 4: Escrever o roteiro**

Criar `apps/web/src/lib/demo/script.ts`:

```ts
/**
 * Máquina de passos do modo demonstração. Pura: sem I/O, sem `server-only`,
 * roda sob `tsx --test`.
 *
 * O estado inteiro do demo é UM índice. Tudo o mais é derivado daqui.
 */

export type DemoStepId = "campaign" | "dispatch" | "group" | "order";

export type DemoStep = {
  id: DemoStepId;
  /** Título curto do passo. */
  title: string;
  /** O que o lojista está vendo acontecer, em uma frase. */
  narration: string;
  /** Rótulo do botão que avança. `null` no último passo: ali entra o CTA. */
  action: string | null;
};

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: "campaign",
    title: "A campanha está pronta",
    narration: "Três grupos selecionados e uma novidade para anunciar.",
    action: "Disparar campanha",
  },
  {
    id: "dispatch",
    title: "Saindo com cadência",
    narration:
      "As mensagens saem espaçadas, uma por grupo — nunca no privado de ninguém. É o que mantém o número vivo.",
    action: "Ver o grupo enchendo",
  },
  {
    id: "group",
    title: "O grupo enchendo",
    narration: "Quem clicou no convite entra, e vira contato com origem registrada.",
    action: "Ver o primeiro pedido",
  },
  {
    id: "order",
    title: "O primeiro pedido",
    narration: "A venda fecha e o pedido aparece amarrado à campanha que a gerou.",
    action: null,
  },
];

export const DEMO_STEP_COUNT = DEMO_STEPS.length;

/** Índice preso à faixa válida — nunca devolve `undefined`. */
export function stepAt(index: number): DemoStep {
  const clamped = Math.min(Math.max(index, 0), DEMO_STEP_COUNT - 1);
  return DEMO_STEPS[clamped]!;
}

/** Avança um passo, parando no último. */
export function nextStep(index: number): number {
  return Math.min(index + 1, DEMO_STEP_COUNT - 1);
}

export function isLastStep(index: number): boolean {
  return index >= DEMO_STEP_COUNT - 1;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx tsx --test apps/web/src/lib/demo/script.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/demo/script.ts apps/web/src/lib/demo/fixtures.ts apps/web/src/lib/demo/script.test.ts
git commit -m "feat(demo): pure step script and typed fixtures"
```

---

### Task 4: Tabela `demo_requests` nos dois bancos

**Files:**
- Create: `apps/web/supabase/migrations/20260828160000_demo_requests.sql`
- Modify: `deploy/supabase/apply-order.txt` (acrescentar ao fim)

**Interfaces:**
- Produces: `public.demo_requests(id, name, phone, step_reached, source, notified_at, created_at)` em dev e prod

- [ ] **Step 1: Conferir que a tabela ainda não existe**

Verificar nos **dois** bancos antes de escrever migração — a regra do projeto existe porque já se escreveu migração para algo que já estava pronto:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'demo_requests';
```

Expected: zero linhas nos dois.

- [ ] **Step 2: Escrever a migração**

Criar `apps/web/supabase/migrations/20260828160000_demo_requests.sql`:

```sql
-- Solicitacoes de demonstracao agendada (modo demonstracao, /demo).
--
-- SEM tenant_id de proposito: quem preenche este formulario AINDA NAO TEM conta
-- — e exatamente o ponto do paid-first. Nao ha tenant a que atribuir a linha, e
-- inventar um so para satisfazer coluna seria mentira no dado.
--
-- RLS ligada assim mesmo, por defesa em profundidade. NENHUMA policy: a tabela
-- e escrita e lida so por service-role. E deny-all por DESENHO, nao por
-- acidente — diferente das 13 policies inertes descritas no CLAUDE.md, que
-- dependem de GUC que o app nunca seta.
create table if not exists public.demo_requests (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text not null,
  step_reached int,
  source       text not null default 'demo',
  -- Quando o aviso de venda saiu. NULL = a linha existe mas ninguem foi
  -- avisado; e o que se consulta quando um lead "sumiu".
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.demo_requests enable row level security;

-- O admin lista por data. Sem indice isto e seq scan desde a primeira consulta.
create index if not exists demo_requests_created_at_idx
  on public.demo_requests (created_at desc);
```

- [ ] **Step 3: Registrar na ordem de aplicação**

Acrescentar ao fim de `deploy/supabase/apply-order.txt`:

```
# 28/08/2026 - Modo demonstracao (Fase 3 do paid-first, PR 1). Captura do CTA
# "agendar demonstracao" em /demo: nome + WhatsApp de quem ainda NAO tem conta.
# Sem tenant_id porque e pre-tenant; RLS ligada sem policy, service-role only.
# `step_reached` guarda ate onde a pessoa foi no roteiro — quem desiste no passo
# 2 e quem chega ao pedido sao leads diferentes, e e o campo que liga o demo a
# coorte do PR 2.
apps/web/supabase/migrations/20260828160000_demo_requests.sql
```

- [ ] **Step 4: Aplicar nos DOIS bancos e conferir**

Aplicar o SQL em dev (`wfjuwogxaupyadwhvoxy`) e em prod (`nidoatbxaylrkcgbszns`). Depois, nos dois:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'demo_requests'
order by ordinal_position;

select relrowsecurity from pg_class where relname = 'demo_requests';
```

Expected: 7 colunas idênticas nos dois bancos, `relrowsecurity = true` nos dois.

- [ ] **Step 5: Rodar o gate de drift**

Run: `npm run check:drift`
Expected: sem drift novo. Se acusar, a migração saiu diferente entre os bancos — corrigir antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add apps/web/supabase/migrations/20260828160000_demo_requests.sql deploy/supabase/apply-order.txt
git commit -m "feat(demo): demo_requests table for scheduled-demo captures"
```

---

### Task 5: Validação do payload

Pura e testável, separada do handler — o handler não é testável sob `tsx --test`.

**Files:**
- Create: `apps/web/src/lib/demo/request-validation.ts`
- Test: `apps/web/src/lib/demo/request-validation.test.ts`

**Interfaces:**
- Produces: `normalizePhoneBR(raw: string): string | null`; `validateDemoRequest(body: unknown): DemoRequestValidation`, onde `DemoRequestValidation = { ok: true; value: { name: string; phone: string; stepReached: number | null } } | { ok: false; error: string }`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/demo/request-validation.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhoneBR, validateDemoRequest } from "./request-validation";

test("aceita celular com máscara e devolve só dígitos", () => {
  assert.equal(normalizePhoneBR("(62) 99819-1314"), "62998191314");
});

test("aceita +55 na frente e descarta o país", () => {
  assert.equal(normalizePhoneBR("+55 62 99819-1314"), "62998191314");
  assert.equal(normalizePhoneBR("5562998191314"), "62998191314");
});

test("recusa fixo — o produto manda no WhatsApp", () => {
  // 10 dígitos, sem o 9 do celular.
  assert.equal(normalizePhoneBR("(62) 3212-1314"), null);
});

test("recusa DDD inválido e número curto", () => {
  assert.equal(normalizePhoneBR("(00) 99819-1314"), null);
  assert.equal(normalizePhoneBR("99819"), null);
});

test("payload válido passa e vem normalizado", () => {
  const r = validateDemoRequest({ name: "  Igor Toledo ", phone: "+55 62 99819-1314", stepReached: 3 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.value, { name: "Igor Toledo", phone: "62998191314", stepReached: 3 });
});

test("nome vazio ou só espaço é recusado com mensagem de gente", () => {
  const r = validateDemoRequest({ name: "   ", phone: "62998191314" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, "Preencha seu nome.");
});

test("nome absurdamente longo é recusado", () => {
  const r = validateDemoRequest({ name: "a".repeat(121), phone: "62998191314" });
  assert.equal(r.ok, false);
});

test("telefone inválido é recusado com mensagem própria", () => {
  const r = validateDemoRequest({ name: "Igor", phone: "3212-1314" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, "Informe um celular com DDD e WhatsApp.");
});

test("body que não é objeto não derruba a rota", () => {
  // req.json() devolve null quando o corpo não é JSON. Sem este caminho o
  // handler estoura em TypeError e vira 500 numa requisição só malformada.
  assert.equal(validateDemoRequest(null).ok, false);
  assert.equal(validateDemoRequest("x").ok, false);
  assert.equal(validateDemoRequest(42).ok, false);
});

test("stepReached fora da faixa do roteiro vira null em vez de sujar o banco", () => {
  const r = validateDemoRequest({ name: "Igor", phone: "62998191314", stepReached: 99 });
  assert.equal(r.ok && r.value.stepReached, null);
  const s = validateDemoRequest({ name: "Igor", phone: "62998191314", stepReached: "dois" });
  assert.equal(s.ok && s.value.stepReached, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test apps/web/src/lib/demo/request-validation.test.ts`
Expected: FAIL — `Cannot find module './request-validation'`.

- [ ] **Step 3: Implementar**

Criar `apps/web/src/lib/demo/request-validation.ts`:

```ts
import { DEMO_STEP_COUNT } from "./script";

/**
 * Validação do payload da captura de demonstração. Pura, sem `server-only`:
 * o handler de rota não roda sob `tsx --test`, então a regra mora aqui.
 */

const NAME_MAX = 120;

export type DemoRequestValue = {
  name: string;
  phone: string;
  stepReached: number | null;
};

export type DemoRequestValidation =
  | { ok: true; value: DemoRequestValue }
  | { ok: false; error: string };

/**
 * Devolve só os dígitos de um celular brasileiro, ou `null` se não for um.
 *
 * Exige o 9 do celular: o produto inteiro fala por WhatsApp, então um fixo aqui
 * é lead que nunca vai ser alcançado. DDD válido é 11-99.
 */
export function normalizePhoneBR(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length === 13 ? digits.slice(2) : digits;

  if (local.length !== 11) return null;
  if (local[2] !== "9") return null;

  const ddd = Number(local.slice(0, 2));
  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99) return null;

  return local;
}

export function validateDemoRequest(body: unknown): DemoRequestValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Envio inválido." };
  }

  const raw = body as Record<string, unknown>;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { ok: false, error: "Preencha seu nome." };
  if (name.length > NAME_MAX) return { ok: false, error: "Nome longo demais." };

  const phoneRaw = typeof raw.phone === "string" ? raw.phone : "";
  const phone = normalizePhoneBR(phoneRaw);
  if (!phone) return { ok: false, error: "Informe um celular com DDD e WhatsApp." };

  // Fora da faixa vira null em vez de erro: o passo é telemetria, não é o que a
  // pessoa preencheu. Recusar o lead por causa disso seria perder a venda por
  // um campo que ela nem viu.
  const step = raw.stepReached;
  const stepReached =
    typeof step === "number" && Number.isInteger(step) && step >= 0 && step < DEMO_STEP_COUNT
      ? step
      : null;

  return { ok: true, value: { name, phone, stepReached } };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test apps/web/src/lib/demo/request-validation.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/demo/request-validation.ts apps/web/src/lib/demo/request-validation.test.ts
git commit -m "feat(demo): validate and normalize demo request payloads"
```

---

### Task 6: Aviso de venda por e-mail (sem tenant)

`sendEmail` **não serve aqui**: ele grava em `public.logs`, cuja coluna `tenant_id` é NOT NULL, e quem pede demonstração é pré-tenant.

**Files:**
- Create: `apps/web/src/lib/demo/notify.ts`
- Modify: `deploy/vercel/.env.production.example` (nova variável)

**Interfaces:**
- Consumes: `getResend`, `FROM_EMAIL` de `@/lib/email/client`
- Produces: `notifyDemoRequest(input: { name: string; phone: string; stepReached: number | null; persisted: boolean }): Promise<boolean>`

- [ ] **Step 1: Implementar o helper**

Criar `apps/web/src/lib/demo/notify.ts`:

```ts
import "server-only";
import { getResend, FROM_EMAIL } from "@/lib/email/client";
import { stepAt } from "./script";

/**
 * Avisa o time de vendas que alguém pediu demonstração.
 *
 * NÃO usa `sendEmail` de propósito: aquele helper grava o resultado em
 * `public.logs`, cuja coluna `tenant_id` é NOT NULL — e quem preenche este
 * formulário é pré-tenant. Emprestar o tenant de outra pessoa só para satisfazer
 * a constraint seria mentira no log de entrega.
 *
 * O registro do envio mora em `demo_requests.notified_at`.
 *
 * Best-effort: devolve `false` em vez de lançar. Quando isto roda, a linha já
 * está no banco — derrubar a resposta por causa do aviso seria perder o lead
 * duas vezes.
 */
export async function notifyDemoRequest(input: {
  name: string;
  phone: string;
  stepReached: number | null;
  /** false quando o insert falhou e o e-mail é a única cópia que restou. */
  persisted: boolean;
}): Promise<boolean> {
  const to = process.env.SALES_NOTIFICATION_EMAIL;
  if (!to) {
    console.error("[demo] SALES_NOTIFICATION_EMAIL ausente — aviso de venda não enviado.");
    return false;
  }

  const step = input.stepReached === null ? "não informado" : stepAt(input.stepReached).title;
  const alerta = input.persisted
    ? ""
    : "<p><strong>Atenção: esta solicitação NÃO foi gravada no banco.</strong> " +
      "Este e-mail é a única cópia — responda agora.</p>";

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Demonstração pedida: ${input.name}`,
      html:
        `${alerta}` +
        `<p><strong>${input.name}</strong> pediu uma demonstração.</p>` +
        `<p>WhatsApp: <a href="https://wa.me/55${input.phone}">${input.phone}</a></p>` +
        `<p>Parou em: ${step}</p>`,
    });
    if (error) {
      console.error("[demo] Resend recusou o aviso de venda:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[demo] Falha ao enviar aviso de venda:", err);
    return false;
  }
}
```

- [ ] **Step 2: Declarar a variável no template de env**

Acrescentar a `deploy/vercel/.env.production.example`:

```
# Para onde vai o aviso de "pediu demonstração" em /demo. Sem isto o lead é
# gravado em demo_requests mas ninguém é avisado na hora.
SALES_NOTIFICATION_EMAIL=
```

- [ ] **Step 3: Rodar o gate de template de env**

Run: `npm run check:env:vercel`
Expected: PASS. Este gate roda no CI — variável usada em código e ausente do template quebra o build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/demo/notify.ts deploy/vercel/.env.production.example
git commit -m "feat(demo): sales alert for demo requests without borrowing a tenant"
```

---

### Task 7: A rota de captura

**Files:**
- Create: `apps/web/src/app/api/demo/request/route.ts`

**Interfaces:**
- Consumes: `validateDemoRequest` (Task 5), `notifyDemoRequest` (Task 6), `getSupabaseAdmin` de `@/lib/supabase/server`, `checkRateLimit` de `@/lib/security/rate-limit`
- Produces: `POST /api/demo/request` → `201 { ok: true }` · `400 { error }` · `429 { error }` · `500 { error, whatsappUrl }`

- [ ] **Step 1: Implementar o handler**

Criar `apps/web/src/app/api/demo/request/route.ts`:

```ts
import { after } from "next/server";
import { validateDemoRequest } from "@/lib/demo/request-validation";
import { notifyDemoRequest } from "@/lib/demo/notify";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uma hora. O teto por telefone é folgado — erra-se pouco pedindo demo. */
const PHONE_WINDOW_MS = 60 * 60 * 1000;
const PHONE_MAX = 2;

const SALES_WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  "https://wa.me/5562998191314?text=Ol%C3%A1!%20Quero%20agendar%20uma%20demonstra%C3%A7%C3%A3o.";

/**
 * POST /api/demo/request — captura do CTA "agendar demonstração" em /demo.
 *
 * Entra sem sessão: quem preenche ainda não tem conta. O middleware já limitou
 * por IP (`public-rate-limited` + entrada em RATE_LIMITS); aqui limitamos por
 * TELEFONE, que é outra dimensão — a mesma pessoa trocando de rede não escapa.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const validation = validateDemoRequest(body);

  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { name, phone, stepReached } = validation.value;

  if (await checkRateLimit(`demo:${phone}`, PHONE_MAX, PHONE_WINDOW_MS)) {
    return Response.json(
      { error: "Já recebemos seu pedido. Em instantes falamos com você." },
      { status: 429 },
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("demo_requests")
    .insert({ name, phone, step_reached: stepReached, source: "demo" })
    .select("id")
    .single();

  if (error) {
    // O insert é a fonte da verdade e ele falhou. Não engolir: avisar por
    // e-mail marcando que NÃO gravou, e devolver ao visitante um caminho que
    // não depende de nada nosso funcionar.
    console.error("[demo] Falha ao gravar demo_requests:", error.message);
    after(() => notifyDemoRequest({ name, phone, stepReached, persisted: false }));
    return Response.json(
      {
        error: "Não conseguimos registrar agora. Fale com a gente no WhatsApp.",
        whatsappUrl: SALES_WHATSAPP_URL,
      },
      { status: 500 },
    );
  }

  // Fora do caminho da resposta: o visitante não espera o Resend.
  after(async () => {
    const sent = await notifyDemoRequest({ name, phone, stepReached, persisted: true });
    if (!sent) return;
    const { error: markError } = await getSupabaseAdmin()
      .from("demo_requests")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", data.id);
    if (markError) {
      console.error("[demo] Aviso enviado mas notified_at não gravou:", markError.message);
    }
  });

  return Response.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `npm --workspace apps/web run lint && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: sem erro.

- [ ] **Step 3: Provar que a rota responde sem sessão**

Subir o dev server e exercitar os três desfechos — inclusive o **controle negativo**, porque 401 e 307 são iguais para rota que não existe:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/demo/request -H 'content-type: application/json' -d '{"name":"Teste","phone":"62998191314","stepReached":3}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/demo/request -H 'content-type: application/json' -d '{"name":"","phone":"x"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/demo/rota-que-nao-existe -H 'content-type: application/json' -d '{}'
```

Expected: `201`, `400`, e a terceira **diferente de 201/400** (404 ou 401). Se a terceira também responder 201, a classificação pegou prefixo em vez de path exato.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/demo/request/route.ts
git commit -m "feat(demo): public capture route for scheduled demo requests"
```

---

### Task 8: Casca do demo — página, fluxo e o rótulo

**Files:**
- Create: `apps/web/src/app/demo/page.tsx`
- Create: `apps/web/src/components/demo/demo-badge.tsx`
- Create: `apps/web/src/components/demo/demo-flow.tsx`

**Interfaces:**
- Consumes: `DEMO_STEPS`, `stepAt`, `nextStep`, `isLastStep` (Task 3)
- Produces: `<DemoFlow />` (client), `<DemoBadge />`; a página `/demo`

- [ ] **Step 1: O rótulo**

Criar `apps/web/src/components/demo/demo-badge.tsx`:

```tsx
/**
 * Rótulo permanente do modo demonstração.
 *
 * Não é decoração e não pode virar opcional: este repositório já publicou prova
 * social fabricada em produção. Uma tela que mostra números inventados sem
 * dizer que são inventados é a mesma falha com roupa nova.
 */
export function DemoBadge() {
  return (
    <p
      data-testid="demo-badge"
      className="inline-flex items-center gap-2 rounded-full bg-cobalt-500/[0.07] px-3 py-1 text-xs font-medium text-cobalt-500"
    >
      <span aria-hidden="true">●</span>
      Demonstração — dados simulados
    </p>
  );
}
```

- [ ] **Step 2: O fluxo**

Criar `apps/web/src/components/demo/demo-flow.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DEMO_STEP_COUNT, isLastStep, nextStep, stepAt } from "@/lib/demo/script";
import { DemoBadge } from "./demo-badge";

/**
 * O estado inteiro do demo é este índice. Nada aqui chama API, banco ou
 * Evolution — as telas leem constantes de módulo.
 */
export function DemoFlow() {
  const [index, setIndex] = useState(0);
  const step = stepAt(index);
  const last = isLastStep(index);

  return (
    <section className="pn-root mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-6 space-y-3">
        <DemoBadge />
        <p className="text-sm text-volt-950/60" data-testid="demo-progress">
          Passo {index + 1} de {DEMO_STEP_COUNT}
        </p>
        <h1 className="font-display text-2xl text-volt-950">{step.title}</h1>
        <p className="text-volt-950/70">{step.narration}</p>
      </header>

      <div data-testid={`demo-step-${step.id}`} className="rounded-2xl bg-canvas-100 p-4">
        {/* As telas entram na Task 9. */}
      </div>

      {step.action ? (
        <button
          type="button"
          data-testid="demo-advance"
          onClick={() => setIndex(nextStep(index))}
          className="mt-6 rounded-xl bg-acid-500 px-5 py-3 font-medium text-volt-950"
        >
          {step.action}
        </button>
      ) : null}

      {last ? <div data-testid="demo-cta">{/* CTA entra na Task 10. */}</div> : null}
    </section>
  );
}
```

- [ ] **Step 3: A página**

Criar `apps/web/src/app/demo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { DemoFlow } from "@/components/demo/demo-flow";

export const metadata: Metadata = {
  title: "Demonstração — Girumo",
  description: "Veja como uma campanha vira grupo cheio e pedido, sem conectar nada.",
};

export default function DemoPage() {
  return <DemoFlow />;
}
```

- [ ] **Step 4: Verificar no navegador**

Subir o dev server e abrir `/demo` **deslogado**. Conferir: a página abre sem redirecionar para `/login`, o rótulo aparece, e os quatro passos avançam até o último, onde o botão some.

Se a página redirecionar para `/login`, a Task 1 não pegou — conferir `PUBLIC_PAGES`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/demo/page.tsx apps/web/src/components/demo/demo-badge.tsx apps/web/src/components/demo/demo-flow.tsx
git commit -m "feat(demo): demo shell with permanent simulated-data label"
```

---

### Task 9: As quatro telas encenadas

**Files:**
- Create: `apps/web/src/components/demo/steps/campaign-step.tsx`
- Create: `apps/web/src/components/demo/steps/dispatch-step.tsx`
- Create: `apps/web/src/components/demo/steps/group-step.tsx`
- Create: `apps/web/src/components/demo/steps/order-step.tsx`
- Modify: `apps/web/src/components/demo/demo-flow.tsx` (trocar o placeholder pelo switch)

**Interfaces:**
- Consumes: `DEMO_GROUPS`, `DEMO_LEADS`, `DEMO_ORDER`, `DEMO_CAMPAIGN_NAME` (Task 3)
- Produces: quatro componentes sem props, cada um com `data-testid` próprio

- [ ] **Step 1: Tela 1 — a campanha**

`campaign-step.tsx`: lista `DEMO_GROUPS` com nome e `members`/`capacity`, e mostra `DEMO_CAMPAIGN_NAME` como título da campanha. Estático, sem animação.

- [ ] **Step 2: Tela 2 — o disparo com cadência**

`dispatch-step.tsx`: percorre `DEMO_GROUPS` marcando "enviado" um a um com `setInterval` de ~900ms, e exibe o intervalo entre envios em texto ("aguardando 40s entre grupos"). Encerra o intervalo no cleanup do `useEffect`.

A cadência é o argumento de venda: mostra que o produto espaça de propósito e **só posta no grupo, nunca no privado**.

- [ ] **Step 3: Tela 3 — o grupo enchendo**

`group-step.tsx`: revela `DEMO_LEADS` um a um (~700ms), com contador acumulado. Cada linha mostra `name`, `phone` mascarado e `sourceGroup`, no mesmo formato da tela `/painel/contatos`.

- [ ] **Step 4: Tela 4 — o pedido**

`order-step.tsx`: mostra `DEMO_ORDER` — comprador, itens, total em BRL — amarrado a `DEMO_CAMPAIGN_NAME`. Estático.

- [ ] **Step 5: Ligar no fluxo**

Em `demo-flow.tsx`, trocar o placeholder por:

```tsx
{step.id === "campaign" ? <CampaignStep /> : null}
{step.id === "dispatch" ? <DispatchStep /> : null}
{step.id === "group" ? <GroupStep /> : null}
{step.id === "order" ? <OrderStep /> : null}
```

Montagem condicional, não `hidden` com CSS: as telas 2 e 3 têm timer, e manter as quatro montadas faria todas animarem de uma vez, fora de ordem.

- [ ] **Step 6: Verificar**

Run: `npm --workspace apps/web run lint && npx tsc --noEmit -p apps/web/tsconfig.json`

No navegador, percorrer os quatro passos e conferir que cada animação começa **ao entrar** no passo, não antes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/demo/steps apps/web/src/components/demo/demo-flow.tsx
git commit -m "feat(demo): the four staged screens"
```

---

### Task 10: O CTA de agendar demonstração

**Files:**
- Create: `apps/web/src/components/demo/demo-cta.tsx`
- Modify: `apps/web/src/components/demo/demo-flow.tsx` (trocar o placeholder do CTA)

**Interfaces:**
- Consumes: `POST /api/demo/request` (Task 7)
- Produces: `<DemoCta stepReached={number} />`

- [ ] **Step 1: O formulário**

`demo-cta.tsx`, client component com dois campos (nome, WhatsApp) e três estados: `idle`, `sending`, `done`. No erro 500, renderizar o link do `whatsappUrl` que a rota devolve — é o caminho que não depende de nada nosso funcionar. `data-testid`: `demo-cta-name`, `demo-cta-phone`, `demo-cta-submit`, `demo-cta-done`, `demo-cta-error`.

O `stepReached` vem do índice atual, não de um campo — é telemetria, não pergunta.

- [ ] **Step 2: Ligar no fluxo**

Em `demo-flow.tsx`: `{last ? <DemoCta stepReached={index} /> : null}`.

- [ ] **Step 3: Verificar ponta a ponta, deslogado**

Percorrer `/demo` até o fim, enviar o formulário, e conferir a linha no banco de **dev**:

```sql
select name, phone, step_reached, source, notified_at, created_at
from public.demo_requests order by created_at desc limit 1;
```

Expected: uma linha com o telefone só em dígitos e `step_reached = 3`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/demo/demo-cta.tsx apps/web/src/components/demo/demo-flow.tsx
git commit -m "feat(demo): schedule-a-demo capture form"
```

---

### Task 11: A landing aponta para o demo

**Files:**
- Modify: `apps/web/src/components/lp3/landing-data.ts:5`
- Modify: `apps/web/src/components/lp3/landing-desktop.tsx:41,435`
- Modify: `apps/web/src/components/lp3/landing-mobile.tsx`
- Modify: `apps/web/src/components/lp3/nav.tsx` (o `signupUrl` do `Lp2Nav`)

**Interfaces:**
- Produces: `DEMO_URL` exportado de `landing-data.ts`

- [ ] **Step 1: A constante**

Em `landing-data.ts`, junto de `SIGNUP_URL`:

```ts
/**
 * Porta principal da landing desde o paid-first (28/08/2026).
 *
 * O CTA apontava para /signup, e o signup faz router.replace("/painel") sem
 * passar por checkout: com o FREE morto, quem clicava ganhava uma conta em
 * BLOCKED_LIMITS que não fazia nada. Este PR para de alimentar esse buraco pelo
 * botão principal — mas NÃO o fecha; o conserto do /signup é PR próprio.
 */
export const DEMO_URL = "/demo";
```

`SIGNUP_URL` **continua exportado** — o buraco não é fechado aqui, só deixa de ser o caminho principal.

- [ ] **Step 2: Trocar os pontos de entrada**

Nos quatro pontos (nav, hero, seção final, sticky mobile), trocar `SIGNUP_URL` por `DEMO_URL` e ajustar o rótulo para **"Ver demonstração"**. `WHATSAPP_URL` fica como está, secundário.

- [ ] **Step 3: Verificar**

Run: `npm --workspace apps/web run lint && npx tsc --noEmit -p apps/web/tsconfig.json`

Conferir por SSR que nenhum CTA principal ainda aponta para `/signup`:

```bash
curl -s http://localhost:3000/ | grep -o 'href="/signup"' | wc -l
```

Expected: `0`. Ao casar strings interpoladas no HTML do Next, lembrar de remover os `<!-- -->` entre os pedaços.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/lp3
git commit -m "feat(landing): point the primary CTA at the demo instead of signup"
```

---

### Task 12: E2E e fechamento

**Files:**
- Create: `apps/web/e2e/demo.spec.ts`

- [ ] **Step 1: O spec**

Criar `apps/web/e2e/demo.spec.ts`, **sem estado de sessão** (o demo é público — se o spec herdar o storageState autenticado, ele não prova nada sobre visitante anônimo):

```ts
import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("visitante anônimo percorre o demo e o rótulo nunca some", async ({ page }) => {
  await page.goto("/demo");

  // Não redirecionou para o login.
  await expect(page).toHaveURL(/\/demo$/);

  for (let i = 0; i < 3; i++) {
    await expect(page.getByTestId("demo-badge")).toBeVisible();
    await page.getByTestId("demo-advance").click();
  }

  await expect(page.getByTestId("demo-badge")).toBeVisible();
  await expect(page.getByTestId("demo-step-order")).toBeVisible();
  await expect(page.getByTestId("demo-advance")).toHaveCount(0);
  await expect(page.getByTestId("demo-cta")).toBeVisible();
});

test("o formulário recusa telefone que não é celular", async ({ page }) => {
  await page.goto("/demo");
  for (let i = 0; i < 3; i++) await page.getByTestId("demo-advance").click();

  await page.getByTestId("demo-cta-name").fill("Teste E2E");
  await page.getByTestId("demo-cta-phone").fill("(62) 3212-1314");
  await page.getByTestId("demo-cta-submit").click();

  await expect(page.getByTestId("demo-cta-error")).toBeVisible();
});
```

O caminho feliz do formulário **não** entra no E2E: ele grava linha no banco de dev a cada execução de CI. A prova do caminho feliz é o Step 3 da Task 10, colhida à mão.

- [ ] **Step 2: Rodar o E2E**

Run: `npm run web:e2e -- demo.spec.ts`
Expected: 2 passando.

- [ ] **Step 3: Gate completo antes do push**

Run: `npm run verify:local`
Expected: PASS — cobre `next build`, scan de secrets e os templates de env.

Run: `npm --workspace apps/web test`
Expected: 653+ passando, 0 falhas.

- [ ] **Step 4: Commit e push**

```bash
git add apps/web/e2e/demo.spec.ts
git commit -m "test(demo): e2e for the anonymous demo walkthrough"
git push -u origin worktree-fase3-demo
```

- [ ] **Step 5: Abrir o PR e mover o card**

Abrir o PR contra `main`. Depois de mergear, mover o card com a prova colhida:

```sql
select public.move_card('demo-modo-demonstracao', 'no_ar_nao_verificado', '<motivo>', 'PR #N');
```

`no_ar_verificado` só depois de abrir `/demo` em produção, deslogado, e ver os quatro passos rodarem — mergeado não é verificado.

---

## Self-review

**Cobertura da spec:** fronteira pública → Task 1. Tipos e drift → Task 2. Roteiro e fixtures → Task 3. Tabela → Task 4. Validação → Task 5. E-mail sem tenant → Task 6. Rota e tratamento de erro → Task 7. Rótulo obrigatório → Task 8 (e asserção no E2E da Task 12). Quatro telas → Task 9. CTA → Task 10. Landing → Task 11. Testes → Tasks 1, 3, 5, 12.

**Fora de escopo, conforme a spec:** o conserto do `/signup` e o funil por coorte (PR 2).

**Contagem de arquivos:** ~18 tocados. Acima do "passou de ~10, provavelmente são dois PRs" do CLAUDE.md — mas são uma feature só e o corte natural (landing separada do demo) entregaria um demo sem porta de entrada. Se o review pedir, a Task 11 é o pedaço que sai limpo para um PR próprio.
