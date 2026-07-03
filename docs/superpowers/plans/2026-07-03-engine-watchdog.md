# Engine Connection Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar o watchdog ao socket Baileys ativo para recuperar conexões zumbis sem afetar sockets substituídos.

**Architecture:** O `ConnectionWatchdog` mantém a política de três pings falhos; um gerenciador no mesmo módulo controla attach/detach do único socket ativo e bloqueia callbacks obsoletos. O `index.js` conecta esse ciclo aos eventos open, close e shutdown, preservando o backoff existente.

**Tech Stack:** Node.js 22, CommonJS, Baileys, `node:test`.

---

### Task 1: Testar política e ciclo de vida do watchdog

**Files:**
- Create: `hubflow-engine/test-watchdog.js`
- Modify: `hubflow-engine/package.json`
- Test: `hubflow-engine/test-watchdog.js`

- [ ] **Step 1: Escrever o teste RED**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ConnectionWatchdog,
  createConnectionWatchdogManager,
} = require("./connection-watchdog.js");

test("ping bem-sucedido zera falhas anteriores", async () => {
  const watchdog = new ConnectionWatchdog({
    sock: { sendPresenceUpdate: async () => undefined },
    onDead: () => assert.fail("não deveria recuperar"),
    logger: { log() {} },
  });
  watchdog._consecutiveFails = 2;
  await watchdog._ping();
  assert.equal(watchdog._consecutiveFails, 0);
});

test("três falhas consecutivas recuperam uma única vez", async () => {
  let recovered = 0;
  const watchdog = new ConnectionWatchdog({
    sock: { sendPresenceUpdate: async () => { throw new Error("offline"); } },
    onDead: () => recovered++,
    logger: { log() {} },
  });
  await watchdog._ping();
  await watchdog._ping();
  await watchdog._ping();
  await watchdog._ping();
  assert.equal(recovered, 1);
});

test("manager substitui socket e ignora callback obsoleto", () => {
  const instances = [];
  class FakeWatchdog {
    constructor(options) {
      Object.assign(this, options);
      this.started = false;
      this.stopped = false;
      instances.push(this);
    }
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  const manager = createConnectionWatchdogManager({
    Watchdog: FakeWatchdog,
    logger: { log() {} },
  });
  const socketA = { endCalls: 0, end() { this.endCalls++; } };
  const socketB = { endCalls: 0, end() { this.endCalls++; } };

  manager.attach(socketA);
  manager.attach(socketB);
  assert.equal(instances[0].stopped, true);
  assert.equal(instances[1].started, true);

  instances[0].onDead();
  assert.equal(socketA.endCalls, 0);
  instances[1].onDead();
  assert.equal(socketB.endCalls, 1);

  assert.equal(manager.detach(socketA), false);
  assert.equal(instances[1].stopped, false);
  assert.equal(manager.detach(socketB), true);
  assert.equal(instances[1].stopped, true);
  manager.stop();
});
```

Adicionar `test-watchdog.js` ao comando `node --test` do script `test` da engine.

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test hubflow-engine/test-watchdog.js`

Expected: FAIL com `createConnectionWatchdogManager is not a function`.

- [ ] **Step 3: Implementar o gerenciador mínimo**

Adicionar a `connection-watchdog.js`:

```js
function createConnectionWatchdogManager({
  Watchdog = ConnectionWatchdog,
  logger = console,
} = {}) {
  let active = null;

  function detach(sock) {
    if (!active || (sock && active.sock !== sock)) return false;
    active.watchdog.stop();
    active = null;
    return true;
  }

  function attach(sock) {
    if (!sock) throw new Error("Socket obrigatório para o watchdog.");
    if (active?.sock === sock) return active.watchdog;
    detach();

    let watchdog;
    watchdog = new Watchdog({
      sock,
      logger,
      onDead: () => {
        if (active?.sock !== sock || active.watchdog !== watchdog) return;
        sock.end(new Error("watchdog detected zombie connection"));
      },
    });
    active = { sock, watchdog };
    watchdog.start();
    return watchdog;
  }

  return {
    attach,
    detach,
    stop: () => detach(),
  };
}

module.exports = { ConnectionWatchdog, createConnectionWatchdogManager };
```

- [ ] **Step 4: Executar GREEN e suíte da engine**

Run: `node --test hubflow-engine/test-watchdog.js`

Expected: 3 testes PASS.

Run: `npm run engine:test`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/connection-watchdog.js hubflow-engine/test-watchdog.js hubflow-engine/package.json
git commit -m "test: define engine watchdog lifecycle"
```

### Task 2: Integrar watchdog ao ciclo Baileys

**Files:**
- Modify: `hubflow-engine/index.js`
- Modify: `hubflow-engine/test-watchdog.js`

- [ ] **Step 1: Adicionar teste RED de integração estática**

```js
const { readFileSync } = require("node:fs");

test("entrypoint conecta watchdog a open, close e shutdown", () => {
  const source = readFileSync(require.resolve("./index.js"), "utf8");
  assert.match(source, /connectionWatchdog\.attach\(sock\)/);
  assert.match(source, /connectionWatchdog\.detach\(sock\)/);
  assert.match(source, /connectionWatchdog\.stop\(\)/);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test hubflow-engine/test-watchdog.js`

Expected: FAIL porque `index.js` ainda não contém as chamadas de ciclo de vida.

- [ ] **Step 3: Integrar no entrypoint**

Importar e criar uma instância:

```js
const { createConnectionWatchdogManager } = require("./connection-watchdog.js");

let currentSocket = null;
const connectionWatchdog = createConnectionWatchdogManager({ logger: console });
```

No shutdown, antes de parar o worker:

```js
connectionWatchdog.stop();
```

Na conexão aberta, depois de atribuir `currentSocket`:

```js
connectionWatchdog.attach(sock);
```

Na conexão fechada, antes de limpar o socket:

```js
connectionWatchdog.detach(sock);
if (currentSocket && currentSocket !== sock) return;
currentSocket = null;
```

O guard permite reconectar sockets que fecharam antes de abrir (`currentSocket === null`) e ignora close tardio quando já existe outro socket ativo.

- [ ] **Step 4: Verificar integração**

Run: `node --test hubflow-engine/test-watchdog.js`

Expected: 4 testes PASS.

Run: `node --check hubflow-engine/index.js && npm run engine:test`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/index.js hubflow-engine/test-watchdog.js
git commit -m "fix: recover zombie engine connections"
```

### Task 3: Fechar item no gate de produção

**Files:**
- Modify: `ROADMAP.md`
- Modify: `PRODUCTION_CHECKLIST.md`

- [ ] **Step 1: Atualizar somente o estado comprovado**

No status V1 do `ROADMAP.md`, mover o item 8 para a lista implementada. No `PRODUCTION_CHECKLIST.md`, marcar `connection-watchdog` como integrado e manter pendentes as configurações externas.

- [ ] **Step 2: Executar verificação final**

Run: `npm run verify:local`

Expected: exit `0`, incluindo testes, TypeScript, build, scanner e sintaxe da engine.

Run: `git diff --check`

Expected: exit `0` e nenhuma saída.

- [ ] **Step 3: Commit**

```powershell
git add ROADMAP.md PRODUCTION_CHECKLIST.md
git commit -m "docs: close engine watchdog production gate"
```
