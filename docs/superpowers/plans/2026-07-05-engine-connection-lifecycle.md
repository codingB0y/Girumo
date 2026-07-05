# Engine Connection Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolar cada conexão Baileys por geração, recuperar sockets zumbis de forma determinística e processar comandos Supabase com lease, fencing e política segura para resultados incertos.

**Architecture:** Um `ConnectionSessionController` será a única autoridade sobre socket, geração, cancelamento, recursos e reconexão. A inicialização produzirá snapshots locais antes do commit, todos os listeners validarão a sessão ativa, e o worker terá uma execução abortável por geração. O banco fornecerá leases transacionais; comandos interrompidos antes do efeito serão repetidos, enquanto efeitos iniciados sem confirmação serão marcados como incertos.

**Tech Stack:** Node.js 22, CommonJS, Baileys, `node:test`, PostgreSQL/Supabase RPC, PowerShell.

---

## Estrutura de arquivos

- Create `hubflow-engine/connection-session.js`: sessão, geração, cancelamento, limpeza, recuperação e reconexão serializada.
- Create `hubflow-engine/connection-snapshot.js`: leitura e commit explícitos dos caches de configuração e grupos.
- Modify `hubflow-engine/connection-watchdog.js`: manter somente a política de ping e delegar recuperação ao controlador.
- Modify `hubflow-engine/index.js`: criar sessões, registrar listeners protegidos e associar recursos à geração.
- Create `hubflow-engine/test-connection-session.js`: testes determinísticos do controlador, snapshots e integração estática.
- Modify `hubflow-engine/queues/supabase-command-worker.js`: execução abortável, lease, fencing e resultado incerto.
- Create `hubflow-engine/test-command-worker.js`: testes do loop e protocolo de comandos.
- Create `infra/migrations/202607050001_engine_command_leases.sql`: schema e RPCs de lease.
- Create `infra/scripts/engine-command-leases.test.js`: contrato estático da migration e ordem de aplicação.
- Modify `infra/dev-setup/00_full_schema_dev.sql`: schema equivalente para ambiente novo.
- Modify `infra/dev-setup/04_storage_rpc_seed.sql`: RPCs equivalentes para ambiente novo.
- Modify `deploy/supabase/apply-order.txt` e `deploy/supabase/apply-order.md`: incluir a migration nova na ordem oficial.
- Modify `hubflow-engine/package.json` e `infra/scripts/verify-local.ps1`: incluir novos testes e checks.
- Modify `ROADMAP.md` e `PRODUCTION_CHECKLIST.md`: registrar somente gates comprovados.

### Task 1: Criar o controlador de sessão por geração

**Files:**
- Create: `hubflow-engine/connection-session.js`
- Create: `hubflow-engine/test-connection-session.js`
- Modify: `hubflow-engine/package.json`

- [ ] **Step 1: Escrever os testes RED do ciclo de vida**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { createConnectionSessionController } = require("./connection-session.js");

test("substituir sessão aborta e limpa a geração anterior", () => {
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const a = controller.create({ id: "a" });
  let cleaned = 0;
  a.addCleanup(() => cleaned++);
  const b = controller.create({ id: "b" });
  assert.equal(a.signal.aborted, true);
  assert.equal(a.state, "closed");
  assert.equal(cleaned, 1);
  assert.equal(b.isActive(), true);
});

test("inicialização obsoleta não executa commit", async () => {
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const a = controller.create({ id: "a" });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let commits = 0;
  const pending = controller.initialize(a, {
    prepare: async () => { await gate; return { value: 1 }; },
    commit: () => commits++,
  });
  controller.create({ id: "b" });
  release();
  assert.equal(await pending, false);
  assert.equal(commits, 0);
});

test("recuperação com end travado invalida e agenda uma reconexão", async () => {
  const timers = [];
  let reconnects = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => reconnects++,
    closeTimeoutMs: 10,
    setTimeoutFn(fn) { timers.push(fn); return fn; },
    clearTimeoutFn() {},
  });
  const session = controller.create({ end: () => new Promise(() => {}) });
  const recovering = controller.recover(session, new Error("zombie"), 0);
  timers.shift()();
  await recovering;
  assert.equal(session.state, "closed");
  timers.shift()();
  await Promise.resolve();
  assert.equal(reconnects, 1);
});
```

Adicionar `test-connection-session.js` ao script `test` da engine.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `node --test hubflow-engine/test-connection-session.js`

Expected: FAIL com `Cannot find module './connection-session.js'`.

- [ ] **Step 3: Implementar a API mínima do controlador**

```js
function createConnectionSessionController({
  reconnect,
  closeTimeoutMs = 10_000,
  logger = console,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let generation = 0;
  let current = null;
  let reconnectTimer = null;
  let stopped = false;

  function closeSession(session) {
    if (session.state === "closed") return false;
    session.state = "closing";
    session.abortController.abort();
    for (const cleanup of session.cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (error) { logger.error("session cleanup failed", error); }
    }
    session.state = "closed";
    if (current === session) current = null;
    return true;
  }

  function create(sock) {
    if (current) closeSession(current);
    const session = {
      generation: ++generation,
      sock,
      state: "connecting",
      abortController: new AbortController(),
      cleanups: [],
      get signal() { return this.abortController.signal; },
      isActive() { return current === this && !this.signal.aborted && this.state !== "closed"; },
      addCleanup(cleanup) { this.cleanups.push(cleanup); return cleanup; },
    };
    current = session;
    return session;
  }

  async function initialize(session, { prepare, commit }) {
    if (!session.isActive()) return false;
    session.state = "initializing";
    try {
      const snapshot = await prepare(session.signal);
      if (!session.isActive()) return false;
      commit(snapshot, session);
      if (!session.isActive()) return false;
      session.state = "ready";
      return true;
    } catch (error) {
      if (session.isActive()) await recover(session, error, 0);
      return false;
    }
  }
```

Completar o módulo com `scheduleReconnect`, `recover`, `handleClose`, `shutdown` e exports. `recover` deve invalidar primeiro, disputar `sock.end(error)` com o timeout injetado e agendar somente um reconnect.

- [ ] **Step 4: Executar GREEN e suíte da engine**

Run: `node --test hubflow-engine/test-connection-session.js`

Expected: 3 testes PASS.

Run: `npm run engine:test`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/connection-session.js hubflow-engine/test-connection-session.js hubflow-engine/package.json
git commit -m "feat: isolate engine connection sessions"
```

### Task 2: Tornar configuração e grupos snapshots atômicos

**Files:**
- Create: `hubflow-engine/connection-snapshot.js`
- Modify: `hubflow-engine/test-connection-session.js`
- Modify: `hubflow-engine/index.js`

- [ ] **Step 1: Escrever testes RED para ausência de mutação durante leitura**

```js
const { prepareConnectionSnapshot, commitConnectionSnapshot } = require("./connection-snapshot.js");

test("preparação retorna snapshot sem alterar caches", async () => {
  const state = {
    welcomeCfg: { enabled: false, message: "old" },
    optOutDigits: new Set(["1"]),
    adminGroupIds: new Set(["old@g.us"]),
    groupNames: new Map([["old@g.us", "Old"]]),
  };
  const snapshot = await prepareConnectionSnapshot({
    sock: {
      user: { id: "10@s.whatsapp.net" },
      groupFetchAllParticipating: async () => ({
        "new@g.us": { id: "new@g.us", subject: "New", owner: "10@s.whatsapp.net", participants: [] },
      }),
    },
    fetchWelcome: async () => ({ enabled: true, message: "Olá" }),
    fetchOptOut: async () => [{ phone: "+55 11" }],
    isAdminOf: () => true,
    myIds: () => new Set(["10"]),
    onlyDigits: (value) => String(value).replace(/\D/g, ""),
  });
  assert.deepEqual([...state.adminGroupIds], ["old@g.us"]);
  commitConnectionSnapshot(state, snapshot);
  assert.deepEqual([...state.adminGroupIds], ["new@g.us"]);
  assert.equal(state.welcomeCfg.enabled, true);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test hubflow-engine/test-connection-session.js`

Expected: FAIL com `Cannot find module './connection-snapshot.js'`.

- [ ] **Step 3: Implementar preparação e commit**

```js
async function prepareConnectionSnapshot({
  sock, fetchWelcome, fetchOptOut, isAdminOf, myIds, onlyDigits,
}) {
  const [welcome, optOut, groupsById] = await Promise.all([
    fetchWelcome(),
    fetchOptOut(),
    sock.groupFetchAllParticipating(),
  ]);
  const groups = Object.values(groupsById);
  const mine = myIds(sock);
  const adminGroups = groups.filter((group) => isAdminOf(group, mine));
  return {
    welcomeCfg: { enabled: Boolean(welcome.enabled), message: welcome.message ?? "" },
    optOutDigits: new Set((optOut ?? []).map((item) => onlyDigits(item.phone))),
    adminGroupIds: new Set(adminGroups.map((group) => group.id)),
    groupNames: new Map(groups.map((group) => [group.id, group.subject])),
    adminGroups,
    groupsPayload: {
      groups: adminGroups.map((group) => ({
        whatsappGroupId: group.id,
        name: group.subject,
        members: (group.participants ?? []).length,
      })),
    },
  };
}
```

`commitConnectionSnapshot(state, snapshot)` substituirá referências de config e copiará sets/maps em uma única etapa síncrona. Adaptar `index.js` para ler os valores por um objeto `connectionState`, eliminando mutações de `refreshConfig`, `listGroups` e `syncGroups` durante a preparação.

As leituras opcionais do painel mantêm o último valor conhecido quando falham: `fetchWelcome` retorna `connectionState.welcomeCfg` e `fetchOptOut` retorna os telefones do cache atual. Falha ao buscar grupos, que são a fonte de autorização para captura de leads, aborta a inicialização em vez de liberar monitoramento sem snapshot confiável.

- [ ] **Step 4: Verificar snapshot e regressões**

Run: `node --test hubflow-engine/test-connection-session.js && npm run engine:test`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/connection-snapshot.js hubflow-engine/test-connection-session.js hubflow-engine/index.js
git commit -m "refactor: commit engine connection snapshots atomically"
```

### Task 3: Integrar sessões, listeners e watchdog no entrypoint

**Files:**
- Modify: `hubflow-engine/index.js`
- Modify: `hubflow-engine/connection-watchdog.js`
- Modify: `hubflow-engine/test-connection-session.js`
- Modify: `hubflow-engine/test-watchdog.js`

- [ ] **Step 1: Escrever testes RED dos guards e recuperação**

```js
test("listener assíncrono obsoleto não executa efeito", async () => {
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const a = controller.create({ id: "a" });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let effects = 0;
  const guarded = a.guardAsync(async () => {
    await gate;
    a.assertActive();
    effects++;
  });
  const pending = guarded();
  controller.create({ id: "b" });
  release();
  await pending;
  assert.equal(effects, 0);
});

test("watchdog delega recuperação com a geração correta", async () => {
  const instances = [];
  class FakeWatchdog {
    constructor(options) { Object.assign(this, options); instances.push(this); }
    start() {}
    stop() {}
  }
  const recoveries = [];
  const manager = createConnectionWatchdogManager({
    recover: (session, error) => recoveries.push([session.generation, error.message]),
    Watchdog: FakeWatchdog,
    logger: { log() {} },
  });
  manager.attach({ generation: 7, sock: {} });
  await instances[0].onDead();
  assert.deepEqual(recoveries, [[7, "watchdog detected zombie connection"]]);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test hubflow-engine/test-connection-session.js hubflow-engine/test-watchdog.js`

Expected: FAIL porque `guardAsync`, `assertActive` e o contrato de recovery ainda não existem.

- [ ] **Step 3: Implementar guards e propriedade dos recursos**

Adicionar à sessão:

```js
assertActive() {
  if (!this.isActive()) throw new SessionAbortedError(this.generation);
}
guard(handler) {
  return (...args) => this.isActive() ? handler(...args) : undefined;
}
guardAsync(handler) {
  return async (...args) => {
    if (!this.isActive()) return undefined;
    try { return await handler(...args); }
    catch (error) {
      if (error instanceof SessionAbortedError || !this.isActive()) return undefined;
      throw error;
    }
  };
}
```

Em `index.js`, criar a sessão imediatamente após `makeWASocket`. Registrar cada listener por `session.guard` ou `session.guardAsync`; revalidar depois de `groupMetadata`, `resolvePhone`, fetches e antes de lead, boas-vindas, recibos ou mutações. Heartbeat, dispatch, watchdog e worker devem registrar seus cleanups na sessão.

Alterar o watchdog para receber `{ session, recover }`; `onDead` chama `recover(session, new Error("watchdog detected zombie connection"))`. Remover o encerramento direto do socket pelo manager.

- [ ] **Step 4: Verificar sintaxe, foco e suíte completa**

Run: `node --check hubflow-engine/index.js`

Expected: exit `0`.

Run: `node --test hubflow-engine/test-connection-session.js hubflow-engine/test-watchdog.js && npm run engine:test`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/index.js hubflow-engine/connection-session.js hubflow-engine/connection-watchdog.js hubflow-engine/test-connection-session.js hubflow-engine/test-watchdog.js
git commit -m "fix: fence engine effects by connection generation"
```

### Task 4: Tornar o loop do worker abortável por execução

**Files:**
- Create: `hubflow-engine/test-command-worker.js`
- Modify: `hubflow-engine/queues/supabase-command-worker.js`
- Modify: `hubflow-engine/package.json`

- [ ] **Step 1: Escrever testes RED para `stop → start`**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSupabaseCommandWorker } = require("./queues/supabase-command-worker.js");

test("start após stop não reativa loop antigo", async () => {
  const sleepers = [];
  let claims = 0;
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: { rpc: async (name) => name === "claim_engine_commands" ? (claims++, []) : [] },
    getSession: () => ({ generation: 2, isActive: () => true, sock: { user: { id: "1" } } }),
    sendText: async () => {},
    sleep: (_ms, signal) => new Promise((resolve) => {
      const done = () => resolve();
      signal.addEventListener("abort", done, { once: true });
      sleepers.push(done);
    }),
    logger: { log() {}, error() {} },
  });
  worker.start(1);
  await Promise.resolve();
  worker.stop();
  worker.start(2);
  await Promise.resolve();
  sleepers[0]();
  await Promise.resolve();
  assert.equal(claims, 2);
  worker.stop();
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test hubflow-engine/test-command-worker.js`

Expected: FAIL porque o worker atual não aceita dependências nem token de execução.

- [ ] **Step 3: Implementar run token e sleep cancelável**

```js
function abortableSleep(ms, signal, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout) {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeoutFn(done, ms);
    function done() {
      clearTimeoutFn(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function start(generation) {
  if (activeRun?.generation === generation && !activeRun.signal.aborted) return;
  stop();
  const controller = new AbortController();
  const run = { generation, controller, signal: controller.signal };
  activeRun = run;
  loop(run).catch((error) => logger.error("Engine Supabase worker parado:", error));
}

function stop() {
  if (!activeRun) return false;
  activeRun.controller.abort();
  activeRun = null;
  return true;
}
```

`tick(run)` e `handleCommand(run, command)` devem verificar `activeRun === run`, `!run.signal.aborted` e a sessão de mesma geração antes de cada etapa.

Expor `runOnce(generation)` no objeto retornado para executar um único tick determinístico nos testes; produção continuará usando `start()` e `stop()`.

- [ ] **Step 4: Verificar que existe somente um loop**

Run: `node --test hubflow-engine/test-command-worker.js`

Expected: PASS.

Run: `npm run engine:test`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/test-command-worker.js hubflow-engine/queues/supabase-command-worker.js hubflow-engine/package.json
git commit -m "fix: isolate supabase worker executions"
```

### Task 5: Adicionar schema e RPCs de lease com fencing

**Files:**
- Create: `infra/migrations/202607050001_engine_command_leases.sql`
- Create: `infra/scripts/engine-command-leases.test.js`
- Modify: `deploy/supabase/apply-order.txt`
- Modify: `deploy/supabase/apply-order.md`

- [ ] **Step 1: Escrever o teste RED do contrato SQL**

```js
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

test("migration implementa lease e fencing", () => {
  const sql = readFileSync("infra/migrations/202607050001_engine_command_leases.sql", "utf8");
  for (const token of [
    "engine_command_failure_kind", "lease_token", "lease_expires_at",
    "attempt_count", "max_attempts", "effect_started_at",
    "claim_engine_commands", "renew_engine_command_lease",
    "mark_engine_command_effect_started", "complete_engine_command",
    "engine_command_requeued", "engine_command_uncertain", "engine_command_attempts_exhausted",
  ]) assert.match(sql, new RegExp(token));
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /target_lease_token/i);
});

test("ordem de deploy inclui migration de lease", () => {
  const order = readFileSync("deploy/supabase/apply-order.txt", "utf8");
  assert.match(order, /202607050001_engine_command_leases\.sql/);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test infra/scripts/engine-command-leases.test.js`

Expected: FAIL com `ENOENT` para a migration nova.

- [ ] **Step 3: Criar migration aditiva**

```sql
do $$ begin
  create type public.engine_command_failure_kind as enum ('retryable', 'permanent', 'uncertain');
exception when duplicate_object then null;
end $$;

alter table public.engine_commands
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists effect_started_at timestamptz,
  add column if not exists failure_kind public.engine_command_failure_kind;
```

Recriar `app.claim_engine_commands(max_commands, lease_seconds)` para, na mesma transação, classificar leases expirados: `effect_started_at is null` volta a `queued` se houver tentativas; efeito iniciado vira `failed/uncertain`; tentativas esgotadas viram `failed/permanent`. Em seguida reivindicar com `FOR UPDATE SKIP LOCKED`, incrementar tentativa e gerar `lease_token`.

Ao classificar leases expirados, inserir em `engine_events` um evento idempotente por transição: `engine_command_requeued`, `engine_command_uncertain` ou `engine_command_attempts_exhausted`. O payload conterá apenas `command_id` e `attempt_count`; não copiará o payload do comando.

Criar RPCs `renew_engine_command_lease`, `mark_engine_command_effect_started` e `complete_engine_command` exigindo `command_id`, `lease_token`, `status = 'processing'` e lease ainda pertencente ao chamador.

- [ ] **Step 4: Verificar contrato e ordem**

Run: `node --test infra/scripts/engine-command-leases.test.js`

Expected: 2 testes PASS.

Run: `git diff --check`

Expected: exit `0` sem saída.

- [ ] **Step 5: Commit**

```powershell
git add infra/migrations/202607050001_engine_command_leases.sql infra/scripts/engine-command-leases.test.js deploy/supabase/apply-order.txt deploy/supabase/apply-order.md
git commit -m "feat: lease engine commands safely"
```

### Task 6: Usar o protocolo de lease no worker

**Files:**
- Modify: `hubflow-engine/queues/supabase-command-worker.js`
- Modify: `hubflow-engine/test-command-worker.js`
- Modify: `hubflow-engine/config/env.js`
- Modify: `deploy/coolify/.env.example`

- [ ] **Step 1: Escrever testes RED de fencing e resultado incerto**

```js
function makeWorker({
  command, calls, isActive = () => true, beforeEffect,
  sendText = async (...args) => calls.push({ name: "sendText", args }),
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
} = {}) {
  const session = {
    generation: 4,
    isActive,
    sock: { user: { id: "1" } },
  };
  return createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return command ? [command] : [];
        if (name === "mark_engine_command_effect_started" && beforeEffect) await beforeEffect();
        return [{}];
      },
    },
    getSession: () => session,
    sendText,
    sleep: async () => {},
    setIntervalFn,
    clearIntervalFn,
    logger: { log() {}, error() {} },
  });
}

test("worker marca efeito antes de enviar e conclui com lease", async () => {
  const calls = [];
  const command = {
    command_id: "c1", lease_token: "l1", type: "send_message",
    payload: { phone: "5511", text: "oi" }, tenant_id: "t1", instance_id: "i1",
  };
  const worker = makeWorker({ command, calls });
  await worker.runOnce(4);
  assert.deepEqual(calls.slice(0, 3).map((call) => call.name), [
    "claim_engine_commands", "mark_engine_command_effect_started", "sendText",
  ]);
  assert.equal(calls.at(-1).name, "complete_engine_command");
  assert.equal(calls.at(-1).body.target_lease_token, "l1");
});

test("troca de geração antes do efeito não envia e não conclui lease antigo", async () => {
  const calls = [];
  let active = true;
  let releaseGate;
  const gate = new Promise((resolve) => { releaseGate = resolve; });
  const command = {
    command_id: "c2", lease_token: "l2", type: "send_message",
    payload: { phone: "5511", text: "oi" }, tenant_id: "t1", instance_id: "i1",
  };
  const worker = makeWorker({ command, calls, isActive: () => active, beforeEffect: () => gate });
  const pending = worker.runOnce(4);
  active = false;
  releaseGate();
  await pending;
  assert.equal(calls.some((call) => call.name === "sendText"), false);
  assert.equal(calls.some((call) => call.name === "complete_engine_command"), false);
});

test("operação longa renova o lease até terminar", async () => {
  const calls = [];
  const intervals = [];
  let releaseSend;
  let signalSendStarted;
  const sendGate = new Promise((resolve) => { releaseSend = resolve; });
  const sendStarted = new Promise((resolve) => { signalSendStarted = resolve; });
  const command = {
    command_id: "c3", lease_token: "l3", type: "send_message",
    payload: { phone: "5511", text: "oi" }, tenant_id: "t1", instance_id: "i1",
  };
  const worker = makeWorker({
    command,
    calls,
    sendText: async () => { signalSendStarted(); return sendGate; },
    setIntervalFn(fn) { intervals.push(fn); return fn; },
    clearIntervalFn() {},
  });
  const pending = worker.runOnce(4);
  await sendStarted;
  await intervals[0]();
  assert.equal(calls.some((call) => call.name === "renew_engine_command_lease"), true);
  releaseSend();
  await pending;
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test hubflow-engine/test-command-worker.js`

Expected: FAIL porque os RPCs de lease ainda não são chamados.

- [ ] **Step 3: Implementar a sequência fenced**

Para `send_message`, executar exatamente:

```js
assertRunActive(run);
await rpc("mark_engine_command_effect_started", leaseBody(command));
assertRunActive(run);
await sendText(session.sock, jid, text);
assertRunActive(run);
await rpc("complete_engine_command", { ...leaseBody(command), success: true, error_message: null });
```

Para falha antes do efeito, concluir como `retryable` com `available_at` calculado pelo RPC. Para falha conhecida após o efeito, concluir como `uncertain` e nunca repetir automaticamente. Se o run for abortado, não tentar concluir com lease possivelmente obsoleto; o RPC de claim classificará o lease na expiração.

Envolver toda operação iniciada em `withLeaseRenewal(command, run, task)`. O helper agenda renovação a cada metade do lease, valida a geração antes do RPC e cancela o timer no `finally`. Os testes recebem `setIntervalFn` e `clearIntervalFn` injetados.

Ler `ENGINE_COMMAND_LEASE_SECONDS` com default `60`, mínimo `15` e máximo `900`. Adicionar o valor documentado ao template Coolify sem secret.

- [ ] **Step 4: Executar testes do worker e engine**

Run: `node --test hubflow-engine/test-command-worker.js`

Expected: PASS.

Run: `npm run engine:test`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/queues/supabase-command-worker.js hubflow-engine/test-command-worker.js hubflow-engine/config/env.js deploy/coolify/.env.example
git commit -m "fix: fence command effects with leases"
```

### Task 7: Manter o setup DEV equivalente à migration

**Files:**
- Modify: `infra/dev-setup/00_full_schema_dev.sql`
- Modify: `infra/dev-setup/04_storage_rpc_seed.sql`
- Modify: `infra/scripts/engine-command-leases.test.js`
- Modify: `infra/scripts/verify-local.ps1`

- [ ] **Step 1: Estender o teste RED de paridade**

```js
test("setup dev contém as mesmas colunas e RPCs de lease", () => {
  const schema = readFileSync("infra/dev-setup/00_full_schema_dev.sql", "utf8");
  const rpc = readFileSync("infra/dev-setup/04_storage_rpc_seed.sql", "utf8");
  for (const token of ["lease_token", "lease_expires_at", "attempt_count", "effect_started_at", "failure_kind"]) {
    assert.match(schema, new RegExp(token));
  }
  for (const token of ["renew_engine_command_lease", "mark_engine_command_effect_started", "target_lease_token"]) {
    assert.match(rpc, new RegExp(token));
  }
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test infra/scripts/engine-command-leases.test.js`

Expected: FAIL apontando tokens ausentes no setup DEV.

- [ ] **Step 3: Espelhar schema e RPCs sem divergência**

Adicionar o enum e as seis colunas ao `00_full_schema_dev.sql`. Substituir os RPCs antigos no `04_storage_rpc_seed.sql` pelas mesmas assinaturas e corpos da migration. Evitar uma segunda implementação: copiar literalmente os blocos SQL validados.

Adicionar ao bloco `Testes` de `verify-local.ps1`:

```powershell
node --test infra/scripts/engine-command-leases.test.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

- [ ] **Step 4: Verificar paridade**

Run: `node --test infra/scripts/engine-command-leases.test.js`

Expected: 3 testes PASS.

- [ ] **Step 5: Commit**

```powershell
git add infra/dev-setup/00_full_schema_dev.sql infra/dev-setup/04_storage_rpc_seed.sql infra/scripts/engine-command-leases.test.js infra/scripts/verify-local.ps1
git commit -m "test: keep engine lease schema in sync"
```

### Task 8: Adicionar observabilidade e atualizar gates comprovados

**Files:**
- Modify: `hubflow-engine/connection-session.js`
- Modify: `hubflow-engine/queues/supabase-command-worker.js`
- Modify: `hubflow-engine/test-connection-session.js`
- Modify: `hubflow-engine/test-command-worker.js`
- Modify: `ROADMAP.md`
- Modify: `PRODUCTION_CHECKLIST.md`

- [ ] **Step 1: Escrever testes RED dos campos estruturados**

```js
test("recuperação registra geração e motivo", async () => {
  const entries = [];
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    logger: { info(event) { entries.push(event); }, error(event) { entries.push(event); } },
  });
  const session = controller.create({ end: async () => {} });
  await controller.recover(session, new Error("zombie"), 0);
  assert.deepEqual(entries.find((entry) => entry.event === "connection_recovery"), {
    event: "connection_recovery", generation: 1, reason: "zombie",
  });
});
```

No worker, verificar eventos com `command_id`, `attempt_count`, `generation` e `outcome` para `requeued`, `permanent` e `uncertain`.

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test hubflow-engine/test-connection-session.js hubflow-engine/test-command-worker.js`

Expected: FAIL por ausência dos objetos estruturados.

- [ ] **Step 3: Emitir logs/eventos sem dados sensíveis**

Usar objetos com nomes estáveis:

```js
logger.info({ event: "connection_recovery", generation: session.generation, reason: error.message });
logger.info({
  event: "engine_command_outcome",
  generation: run.generation,
  command_id: command.command_id,
  attempt_count: command.attempt_count,
  outcome,
});
```

O worker chamará `record_engine_event` para `engine_command_started`, `engine_command_completed` e falhas conhecidas. Requeues, resultados incertos por crash e tentativas esgotadas serão emitidos transacionalmente pelo RPC de claim definido na Task 5.

Não registrar payload, telefone, texto, token de lease ou secrets. Registrar no checklist que alertas externos continuam pendentes até comprovação no ambiente; marcar somente código e testes concluídos.

- [ ] **Step 4: Verificar testes e documentação**

Run: `node --test hubflow-engine/test-connection-session.js hubflow-engine/test-command-worker.js`

Expected: PASS.

Run: `git diff --check`

Expected: exit `0` sem saída.

- [ ] **Step 5: Commit**

```powershell
git add hubflow-engine/connection-session.js hubflow-engine/queues/supabase-command-worker.js hubflow-engine/test-connection-session.js hubflow-engine/test-command-worker.js ROADMAP.md PRODUCTION_CHECKLIST.md
git commit -m "docs: record engine lifecycle production evidence"
```

### Task 9: Verificação final e revisão do gate

**Files:**
- Modify only if evidence requires correction: `ROADMAP.md`
- Modify only if evidence requires correction: `PRODUCTION_CHECKLIST.md`

- [ ] **Step 1: Executar testes focados**

Run: `node --test hubflow-engine/test-connection-session.js hubflow-engine/test-command-worker.js hubflow-engine/test-watchdog.js infra/scripts/engine-command-leases.test.js`

Expected: todos PASS e exit `0`.

- [ ] **Step 2: Executar suíte completa da engine e checks sintáticos**

Run: `npm run engine:test`

Expected: exit `0`.

Run: `node --check hubflow-engine/index.js; node --check hubflow-engine/connection-session.js; node --check hubflow-engine/connection-snapshot.js; node --check hubflow-engine/queues/supabase-command-worker.js`

Expected: todos exit `0`.

- [ ] **Step 3: Validar SQL em banco descartável quando disponível**

Run: `npx supabase db reset`

Expected: migrations aplicadas sem erro e banco local reiniciado. Se Docker/Supabase CLI não estiver disponível, manter o gate de banco real como pendente; o teste estático não autoriza marcá-lo como aprovado.

- [ ] **Step 4: Executar gate local completo**

Run: `npm run verify:local`

Expected: exit `0`, incluindo testes, TypeScript, build web, scanner de secrets e sintaxe.

- [ ] **Step 5: Revisar diff e estado do branch**

Run: `git diff --check`

Expected: exit `0` sem saída.

Run: `git status --short --branch`

Expected: branch correto e worktree limpa. Se documentação precisou ser corrigida conforme a evidência, criar commit específico antes da revisão final.

- [ ] **Step 6: Solicitar revisão em duas etapas**

Primeiro revisar conformidade com `docs/superpowers/specs/2026-07-05-engine-connection-lifecycle-design.md`. Depois revisar qualidade, corridas, segurança do SQL, privacidade dos logs e compatibilidade de deploy. Não abrir ou atualizar PR enquanto houver achado P0/P1.
