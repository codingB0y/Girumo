# Demonstração Pública do Painel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disponibilizar uma demonstração pública e interativa da Girumo que simula conexão e operação do painel sem acessar qualquer dado ou integração real.

**Architecture:** Uma rota pública `/demo` renderiza uma experiência client-side baseada em dados determinísticos de `demo-data.ts`. A experiência mantém a jornada e as interações apenas em memória e utiliza componentes próprios de demo, evitando imports de stores, APIs ou componentes de painel que façam `fetch`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, Lucide React e testes `node:test` executados por `tsx`.

## Global Constraints

- `/demo` deve estar acessível sem autenticação e não pode expor APIs internas.
- A demo não pode chamar engine, Supabase, rotas `/api/*`, `localStorage`, `sessionStorage` ou cookies.
- Todos os números, nomes, grupos, contatos e métricas devem ser fictícios e conter o aviso persistente `Modo demonstração`.
- O estado de conexão e as ações simuladas existem somente em memória e reiniciam ao recarregar a página.
- O CTA de conversão deve apontar para `/signup`.
- Não criar commits: o usuário não solicitou operações de Git.

---

### Task 1: Criar o contrato de dados fictícios

**Files:**
- Create: `apps/web/src/lib/demo-data.ts`
- Test: `apps/web/src/lib/demo-data.test.ts`

**Interfaces:**
- Produces: `DemoScenario`, `DemoGroup`, `DemoCampaign`, `DemoContact`, `DemoMetric`, `demoScenario`.
- Consumes: nenhuma store, variável de ambiente, API ou utilitário de tenant.

- [ ] **Step 1: Escrever o teste que falha para o cenário determinístico**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { demoScenario } from "./demo-data";

test("o cenário demo contém uma operação conectada e coerente", () => {
  assert.equal(demoScenario.connection.status, "connected");
  assert.ok(demoScenario.groups.length >= 3);
  assert.ok(demoScenario.contacts.length >= 4);
  assert.ok(demoScenario.campaign.groupIds.every((id) => demoScenario.groups.some((group) => group.id === id)));
  assert.equal(demoScenario.metrics.contacts, demoScenario.contacts.length);
});
```

- [ ] **Step 2: Executar o teste para confirmar a falha inicial**

Run: `npm.cmd --workspace apps/web test -- src/lib/demo-data.test.ts`

Expected: FAIL porque `./demo-data` ainda não existe.

- [ ] **Step 3: Implementar os tipos e o cenário local**

```ts
export type DemoScenario = {
  storeName: string;
  connection: { status: "connected"; phone: string };
  groups: DemoGroup[];
  campaign: DemoCampaign;
  contacts: DemoContact[];
  metrics: DemoMetric;
};

export const demoScenario: DemoScenario = {
  storeName: "Aurora Atacado",
  connection: { status: "connected", phone: "+55 62 99999-0000" },
  groups: [],
  campaign: { id: "demo-campanha-inverno", name: "Semana do Inverno", groupIds: [] },
  contacts: [],
  metrics: { contacts: 0, clicks: 0, conversionRate: 0 },
};
```

Preencher os arrays com grupos, campanha, contatos e métricas fictícios coerentes. Não importar nenhuma dependência de dados reais.

- [ ] **Step 4: Executar o teste para confirmar que passa**

Run: `npm.cmd --workspace apps/web test -- src/lib/demo-data.test.ts`

Expected: PASS.

### Task 2: Criar a experiência e o painel simulados

**Files:**
- Create: `apps/web/src/components/demo/demo-experience.tsx`
- Create: `apps/web/src/components/demo/demo-dashboard.tsx`
- Create: `apps/web/src/components/demo/demo-experience.test.ts`
- Consumes: `apps/web/src/lib/demo-data.ts`

**Interfaces:**
- Consumes: `demoScenario: DemoScenario`.
- Produces: `DemoExperience` com a jornada `intro | connecting | dashboard` e `DemoDashboard` que recebe `scenario: DemoScenario`.

- [ ] **Step 1: Escrever o teste estático que falha para isolamento e CTAs**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = readFileSync(path.join(root, "components/demo/demo-experience.tsx"), "utf8");

test("a experiência demo não toca integrações reais", () => {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\/api\/|ENGINE_URL|supabase|localStorage|sessionStorage|document\.cookie/i);
  assert.match(source, /Modo demonstração/);
  assert.match(source, /href="\/signup"/);
});
```

- [ ] **Step 2: Executar o teste para confirmar a falha inicial**

Run: `npm.cmd --workspace apps/web test -- src/components/demo/demo-experience.test.ts`

Expected: FAIL porque o componente ainda não existe.

- [ ] **Step 3: Implementar a jornada client-side**

```tsx
"use client";

type DemoStage = "intro" | "connecting" | "dashboard";

export function DemoExperience() {
  const [stage, setStage] = useState<DemoStage>("intro");
  const [notice, setNotice] = useState<string | null>(null);

  if (stage === "dashboard") {
    return <DemoDashboard scenario={demoScenario} onSimulatedAction={setNotice} notice={notice} />;
  }

  return <DemoConnection stage={stage} onStart={() => setStage("connecting")} onConnect={() => setStage("dashboard")} />;
}
```

Implementar `DemoConnection` com introdução, QR apenas ilustrativo, texto explícito de que não há conexão real e botão `Simular conexão`. Implementar `DemoDashboard` com cabeçalho, selo persistente, navegação local e cartões de início, grupos, campanha, contatos e resultados do `demoScenario`. As ações devem chamar somente `onSimulatedAction` e exibir uma notificação local, sem `fetch`.

- [ ] **Step 4: Executar o teste para confirmar que passa**

Run: `npm.cmd --workspace apps/web test -- src/components/demo/demo-experience.test.ts`

Expected: PASS.

### Task 3: Publicar a rota e liberá-la no middleware

**Files:**
- Create: `apps/web/src/app/demo/page.tsx`
- Create: `apps/web/src/app/demo/page.test.ts`
- Modify: `apps/web/src/middleware.ts:47-51`

**Interfaces:**
- Consumes: `DemoExperience` de `@/components/demo/demo-experience`.
- Produces: a rota pública `/demo` com metadata própria e acesso sem sessão.

- [ ] **Step 1: Escrever o teste que falha para contrato de rota pública**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const page = readFileSync(path.join(appRoot, "app/demo/page.tsx"), "utf8");
const middleware = readFileSync(path.join(appRoot, "middleware.ts"), "utf8");

test("a rota demo é pública e usa a experiência isolada", () => {
  assert.match(page, /DemoExperience/);
  assert.match(page, /Demonstração/);
  assert.match(middleware, /pathname === "\/demo"/);
});
```

- [ ] **Step 2: Executar o teste para confirmar a falha inicial**

Run: `npm.cmd --workspace apps/web test -- src/app/demo/page.test.ts`

Expected: FAIL porque a rota e a regra pública ainda não existem.

- [ ] **Step 3: Implementar a rota e a exceção de autenticação**

```tsx
import type { Metadata } from "next";
import { DemoExperience } from "@/components/demo/demo-experience";

export const metadata: Metadata = {
  title: "Demonstração",
  description: "Conheça o painel da Girumo sem conectar seu WhatsApp.",
};

export default function DemoPage() {
  return <DemoExperience />;
}
```

Adicionar `if (pathname === "/demo") return NextResponse.next();` junto das demais rotas públicas do middleware. Não alterar o comportamento de autenticação das rotas `/painel` ou `/api`.

- [ ] **Step 4: Executar o teste para confirmar que passa**

Run: `npm.cmd --workspace apps/web test -- src/app/demo/page.test.ts`

Expected: PASS.

### Task 4: Validar isolamento, qualidade e acesso público

**Files:**
- Modify: somente os arquivos criados e alterados nas Tasks 1–3, se a validação identificar falha diretamente relacionada.

**Interfaces:**
- Consumes: rota `/demo`, `demoScenario`, `DemoExperience` e exceção pública no middleware.
- Produces: demonstração compilável, acessível e sem referências a integrações reais.

- [ ] **Step 1: Executar a suíte de testes focada**

Run: `npm.cmd --workspace apps/web test -- src/lib/demo-data.test.ts src/components/demo/demo-experience.test.ts src/app/demo/page.test.ts`

Expected: PASS para os três testes.

- [ ] **Step 2: Executar lint do app web**

Run: `npm.cmd --workspace apps/web run lint`

Expected: saída sem erros de ESLint.

- [ ] **Step 3: Executar o build de produção**

Run: `npm.cmd --workspace apps/web run build`

Expected: build concluído e rota `/demo` listada sem erro de compilação.

- [ ] **Step 4: Verificar manualmente a jornada no navegador local**

Run: `npm.cmd --workspace apps/web run dev`

Expected: ao abrir `http://localhost:3000/demo` sem sessão, a tela carrega; `Simular conexão` abre o painel com dados fictícios; ações exibem feedback local; `Criar minha conta` leva para `/signup`; a aba Network não apresenta chamadas a `/api/*` ou à engine.
