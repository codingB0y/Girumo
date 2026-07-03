# Engine Health Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar liveness e readiness da engine, retornando `503` quando o WhatsApp não estiver operacional sem provocar reinícios durante QR ou reconexão.

**Architecture:** Uma função CommonJS pura transforma o snapshot mínimo do runtime em `{ statusCode, body }`. O Express expõe liveness e readiness usando essa função; o Compose consulta somente liveness, enquanto `/health` continua compatível como alias de readiness.

**Tech Stack:** Node.js 22, CommonJS, Express 5, `node:test`, Docker Compose.

---

### Task 1: Política pura de health

**Files:**
- Create: `hubflow-engine/health.js`
- Create: `hubflow-engine/test-health.js`
- Modify: `hubflow-engine/package.json`

- [ ] **Step 1: Escrever o teste RED**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { buildHealthResponse, createHealthHandler } = require("./health.js");

test("liveness independe das integrações", () => {
  const result = buildHealthResponse("live", {
    whatsappConnected: false,
    supabaseWorker: false,
    uptime: 12,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.status, "live");
});

test("readiness falha fechada sem WhatsApp", () => {
  const result = buildHealthResponse("ready", {
    whatsappConnected: false,
    supabaseWorker: false,
    uptime: 12,
  });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.status, "not_ready");
});

test("readiness aprova WhatsApp conectado", () => {
  const result = buildHealthResponse("ready", {
    whatsappConnected: true,
    supabaseWorker: true,
    uptime: 12,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, "ready");
});

test("resposta não expõe dados fora do contrato", () => {
  const result = buildHealthResponse("ready", {
    whatsappConnected: true,
    supabaseWorker: true,
    uptime: 12,
    engineToken: "secret",
    tenantId: "tenant",
    phoneNumber: "5511999999999",
  });
  assert.deepEqual(Object.keys(result.body).sort(), [
    "ok",
    "service",
    "status",
    "supabaseWorker",
    "uptime",
    "whatsappConnected",
  ]);
});

test("handler aplica status HTTP e snapshot atual", () => {
  const handler = createHealthHandler("ready", () => ({
    whatsappConnected: false,
    supabaseWorker: false,
    uptime: 12,
  }));
  const observed = {};
  const response = {
    status(code) {
      observed.statusCode = code;
      return this;
    },
    json(body) {
      observed.body = body;
      return this;
    },
  };
  handler({}, response);
  assert.equal(observed.statusCode, 503);
  assert.equal(observed.body.status, "not_ready");
});
```

Adicionar `node --test test-health.js` ao script `test` da engine.

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test hubflow-engine/test-health.js`

Expected: FAIL com `Cannot find module './health.js'`.

- [ ] **Step 3: Implementar a política mínima**

```js
function buildHealthResponse(kind, state = {}) {
  const whatsappConnected = Boolean(state.whatsappConnected);
  const isLive = kind === "live";
  const ok = isLive || whatsappConnected;

  return {
    statusCode: ok ? 200 : 503,
    body: {
      ok,
      service: "hubflow-engine",
      status: isLive ? "live" : whatsappConnected ? "ready" : "not_ready",
      whatsappConnected,
      supabaseWorker: Boolean(state.supabaseWorker),
      uptime: Number.isFinite(state.uptime) ? state.uptime : 0,
    },
  };
}

function createHealthHandler(kind, getState) {
  return (_request, response) => {
    const result = buildHealthResponse(kind, getState());
    return response.status(result.statusCode).json(result.body);
  };
}

module.exports = { buildHealthResponse, createHealthHandler };
```

- [ ] **Step 4: Executar GREEN e suíte da engine**

Run: `node --test hubflow-engine/test-health.js`

Expected: 4 testes PASS.

Run: `npm run engine:test`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/health.js hubflow-engine/test-health.js hubflow-engine/package.json
git commit -m "test: define engine health contract"
```

### Task 2: Rotas liveness/readiness e healthcheck do container

**Files:**
- Modify: `hubflow-engine/index.js`
- Modify: `deploy/coolify/engine.docker-compose.yml`

- [ ] **Step 1: Integrar as três rotas no Express**

Importar `registerHealthRoutes` e substituir o handler atual por:

```js
registerHealthRoutes(app, () => ({
    whatsappConnected: Boolean(currentSocket?.user),
    supabaseWorker: supabaseCommandWorkerStarted,
    uptime: process.uptime(),
}));
```

Manter `/health` como alias de readiness. Não alterar as rotas de desenvolvimento.

- [ ] **Step 2: Apontar o Compose para liveness**

Alterar somente a URL do healthcheck:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3001/health/live"]
```

- [ ] **Step 3: Verificar sintaxe e contrato estático**

Run: `node --check hubflow-engine/index.js`

Expected: exit `0`.

Run: `docker compose -f deploy/coolify/engine.docker-compose.yml config`

Expected: configuração válida; se o Docker CLI não estiver disponível, registrar a limitação e validar o YAML pelo gate existente.

- [ ] **Step 4: Executar testes**

Run: `npm run engine:test && npm test`

Expected: todas as suítes PASS.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/index.js deploy/coolify/engine.docker-compose.yml
git commit -m "fix: separate engine liveness and readiness"
```

### Task 3: Atualizar gate de produção e executar verificação final

**Files:**
- Modify: `ROADMAP.md`
- Modify: `PRODUCTION_CHECKLIST.md`

- [ ] **Step 1: Atualizar somente o estado comprovado**

Marcar o item V1 `Engine /health` como implementado no status e na tabela do roadmap. No checklist, marcar `/health` com `503` quando desconectado e documentar `/health/live` como endpoint usado pelo container. Manter `ConnectionWatchdog` pendente.

- [ ] **Step 2: Executar gate completo**

Run: `npm run verify:local`

Expected: exit `0`; testes web/engine, build, sintaxe e scanners aprovados. Se Docker estiver indisponível, o gate deve registrar apenas essa limitação já prevista.

Run: `git diff --check`

Expected: exit `0` e nenhuma saída.

- [ ] **Step 3: Commit**

```powershell
git add ROADMAP.md PRODUCTION_CHECKLIST.md
git commit -m "docs: close engine health production gate"
```
