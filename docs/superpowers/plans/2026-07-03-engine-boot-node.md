# Engine Boot e Node Pinado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a dependência implícita de `require(esm)` e tornar o runtime Docker da engine reproduzível.

**Architecture:** A engine permanece CommonJS; módulos internos usam `module.exports`, enquanto o pacote ESM Baileys é carregado com `import()` durante um bootstrap assíncrono. Um teste de política de módulo protege o contrato e a imagem Docker usa uma versão completa de Node/Alpine nos dois estágios.

**Tech Stack:** Node.js 22, CommonJS, importação dinâmica ESM, `node:test`, Docker Alpine.

---

### Task 1: Criar o gate de formato de módulos

**Files:**
- Create: `hubflow-engine/test-module-format.js`
- Modify: `hubflow-engine/package.json`

- [ ] **Step 1: Escrever o teste inicialmente vermelho**

Criar `test-module-format.js` com `node:test`, ler `index.js`, `Dockerfile` e os quatro módulos internos e
afirmar separadamente que: os módulos não contêm `import ... from`/`export`; todos contêm
`module.exports`; `index.js` não usa `require("@whiskeysockets/baileys")` e usa `import()`; as duas linhas
`FROM` são idênticas e seguem `node:X.Y.Z-alpineX.Y`.

```js
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const read = (file) => readFileSync(join(__dirname, file), "utf8");
const internalModules = ["anti-ban-queue.js", "warmup.js", "group-guard.js", "delivery-tracker.js"];

test("módulos internos usam CommonJS explícito", () => {
  for (const file of internalModules) {
    const source = read(file);
    assert.doesNotMatch(source, /^\s*(?:import\s.+\sfrom\s|export\s)/m, file);
    assert.match(source, /module\.exports\s*=/, file);
  }
});

test("entrypoint carrega Baileys com importação dinâmica", () => {
  const source = read("index.js");
  assert.doesNotMatch(source, /require\(["']@whiskeysockets\/baileys["']\)/);
  assert.match(source, /import\(["']@whiskeysockets\/baileys["']\)/);
});

test("estágios Docker usam a mesma versão completa de Node e Alpine", () => {
  const images = [...read("Dockerfile").matchAll(/^FROM\s+(\S+)/gm)].map((match) => match[1]);
  assert.equal(images.length, 2);
  assert.equal(images[0], images[1]);
  assert.match(images[0], /^node:\d+\.\d+\.\d+-alpine\d+\.\d+$/);
});
```

- [ ] **Step 2: Tornar o teste executável pelo workspace**

Adicionar a `hubflow-engine/package.json`:

```json
"test": "node --test test-module-format.js && node test-modules.js"
```

- [ ] **Step 3: Executar e confirmar o RED**

Run: `npm --workspace hubflow-engine test`

Expected: FAIL por sintaxe ESM nos módulos, `require()` do Baileys e tag Docker móvel.

- [ ] **Step 4: Commit do teste vermelho**

```powershell
git add hubflow-engine/test-module-format.js hubflow-engine/package.json
git commit -m "test: define deterministic engine module policy"
```

### Task 2: Padronizar os módulos internos em CommonJS

**Files:**
- Modify: `hubflow-engine/anti-ban-queue.js`
- Modify: `hubflow-engine/warmup.js`
- Modify: `hubflow-engine/group-guard.js`
- Modify: `hubflow-engine/delivery-tracker.js`
- Modify: `hubflow-engine/test-modules.js`

- [ ] **Step 1: Converter imports e exports sem alterar comportamento**

Usar `require("timers/promises")` na fila, remover os prefixos `export` e declarar no fim de cada arquivo:

```js
module.exports = { AntiBanQueue };
module.exports = { WarmUp };
module.exports = { GROUP_OP_ERRORS, classifyGroupOpError, GroupOperationGuard };
module.exports = { DeliveryTracker };
```

- [ ] **Step 2: Converter o runner de comportamento**

Trocar os imports de `test-modules.js` por `require()` e envolver o trecho assíncrono em
`async function main()`, finalizando com:

```js
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Executar o teste focal**

Run: `node hubflow-engine/test-modules.js`

Expected: PASS com todos os checks anti-ban existentes.

- [ ] **Step 4: Executar o gate e observar apenas pendências de entrypoint/Docker**

Run: `node --test hubflow-engine/test-module-format.js`

Expected: módulos CommonJS passam; testes de Baileys e Docker continuam vermelhos.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/anti-ban-queue.js hubflow-engine/warmup.js hubflow-engine/group-guard.js hubflow-engine/delivery-tracker.js hubflow-engine/test-modules.js
git commit -m "refactor: standardize engine modules on commonjs"
```

### Task 3: Carregar Baileys explicitamente como ESM

**Files:**
- Modify: `hubflow-engine/index.js`

- [ ] **Step 1: Substituir o require implícito por bindings inicializados no bootstrap**

Declarar os bindings usados por `start()` no escopo do módulo:

```js
let useMultiFileAuthState;
let DisconnectReason;
let fetchLatestBaileysVersion;
let jidNormalizedUser;
let makeWASocket;

async function loadBaileys() {
  const baileys = await import("@whiskeysockets/baileys");
  ({ useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } = baileys);
  makeWASocket = baileys.default;
}
```

- [ ] **Step 2: Criar bootstrap com falha observável**

Substituir a chamada final por:

```js
async function bootstrap() {
  await loadBaileys();
  await start();
}

bootstrap().catch((error) => {
  console.error("Erro fatal ao iniciar a engine:", error);
  process.exit(1);
});
```

- [ ] **Step 3: Executar o gate focal**

Run: `node --test hubflow-engine/test-module-format.js`

Expected: teste do entrypoint passa; apenas pin Docker permanece vermelho.

- [ ] **Step 4: Validar sintaxe**

Run: `node --check hubflow-engine/index.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/index.js
git commit -m "fix: load baileys through explicit esm bootstrap"
```

### Task 4: Pinar o runtime Docker

**Files:**
- Modify: `hubflow-engine/Dockerfile`

- [ ] **Step 1: Fixar a mesma imagem nos dois estágios**

Usar `node:22.14.0-alpine3.21` em `deps` e `runner`, preservando as demais instruções.

- [ ] **Step 2: Executar o gate da engine**

Run: `npm --workspace hubflow-engine test`

Expected: PASS no teste de política e no teste comportamental.

- [ ] **Step 3: Validar build Docker quando o daemon estiver disponível**

Run: `docker build -t hubflow-engine:boot-gate ./hubflow-engine`

Expected: imagem construída. Se Docker não estiver instalado/ativo, registrar a limitação sem mascará-la.

- [ ] **Step 4: Commit**

```powershell
git add hubflow-engine/Dockerfile
git commit -m "build: pin engine node runtime"
```

### Task 5: Integrar o teste e atualizar a documentação

**Files:**
- Modify: `package.json`
- Modify: `infra/scripts/verify-local.ps1`
- Modify: `ROADMAP.md`
- Modify: `PRODUCTION_CHECKLIST.md`
- Modify: `PROJECT_CONTEXT.md`

- [ ] **Step 1: Incluir o teste da engine no gate raiz**

Adicionar `"engine:test": "npm --workspace hubflow-engine test"` ao `package.json` e chamar
`npm.cmd run engine:test` no bloco `Testes` de `verify-local.ps1`, após `npm.cmd test`.

```json
"engine:test": "npm --workspace hubflow-engine test"
```

```powershell
Invoke-NativeStep "Testes" {
  npm.cmd test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npm.cmd run engine:test
}
```

- [ ] **Step 2: Executar verificação completa**

Run: `npm run verify:local`

Expected: testes web/migração/engine, TypeScript, build, sintaxe e scans passam.

- [ ] **Step 3: Atualizar o estado auditável**

Marcar somente o V1.6 como implementado em `ROADMAP.md`; remover boot CJS×ESM/Node pinado dos bloqueadores
abertos no `PRODUCTION_CHECKLIST.md`; registrar a correção e a evidência em `PROJECT_CONTEXT.md`. Manter health,
watchdog, service-role e env como pendentes.

- [ ] **Step 4: Executar checks finais**

Run: `git diff --check`

Expected: nenhum erro.

Run: `git status --short`

Expected: somente os arquivos deste plano modificados.

- [ ] **Step 5: Commit**

```powershell
git add package.json infra/scripts/verify-local.ps1 ROADMAP.md PRODUCTION_CHECKLIST.md PROJECT_CONTEXT.md
git commit -m "docs: close deterministic engine boot gate"
```
