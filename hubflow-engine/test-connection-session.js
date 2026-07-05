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
  assert.equal(b.generation, a.generation + 1);
  assert.equal(b.isActive(), true);
});

test("inicialização obsoleta não executa commit", async () => {
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const a = controller.create({ id: "a" });
  const gate = deferred();
  let commits = 0;
  const pending = controller.initialize(a, {
    prepare: async () => {
      await gate.promise;
      return { value: 1 };
    },
    commit: () => commits++,
  });

  controller.create({ id: "b" });
  gate.resolve();

  assert.equal(await pending, false);
  assert.equal(commits, 0);
});

test("recuperação com end travado invalida e agenda uma reconexão", async () => {
  const timers = createTimerHarness();
  let reconnects = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => reconnects++,
    closeTimeoutMs: 10,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({ end: () => new Promise(() => {}) });

  const recovering = controller.recover(session, new Error("zombie"), 0);
  assert.equal(session.state, "closed");
  timers.fireNext();
  await recovering;
  timers.fireNext();
  await flushPromises();

  assert.equal(reconnects, 1);
});

test("inicialização válida entrega snapshot à commit e deixa sessão ready", async () => {
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const session = controller.create({ id: "socket" });
  const snapshot = { groups: ["a"] };
  let received;

  const initialized = await controller.initialize(session, {
    prepare: async (signal) => {
      assert.equal(signal, session.signal);
      assert.equal(session.state, "initializing");
      return snapshot;
    },
    commit: (value, candidate) => {
      received = { value, candidate };
    },
  });

  assert.equal(initialized, true);
  assert.deepEqual(received, { value: snapshot, candidate: session });
  assert.equal(session.state, "ready");
});

test("commit que retorna thenable viola contrato síncrono e recupera", async () => {
  const timers = createTimerHarness();
  const endCalls = [];
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({ end: async (error) => endCalls.push(error) });

  const initialized = await controller.initialize(session, {
    prepare: async () => ({ value: 1 }),
    commit: () => Promise.resolve(),
  });

  assert.equal(initialized, false);
  assert.equal(session.state, "closed");
  assert.equal(endCalls.length, 1);
  assert.match(endCalls[0].message, /commit.*synchronous/i);
});

test("erro de inicialização recupera a sessão sem rejeitar", async () => {
  const timers = createTimerHarness();
  const error = new Error("configuração inválida");
  const endCalls = [];
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({ end: async (reason) => endCalls.push(reason) });

  const initialized = await controller.initialize(session, {
    prepare: async () => {
      throw error;
    },
    commit: () => assert.fail("commit não deveria executar"),
  });

  assert.equal(initialized, false);
  assert.equal(session.state, "closed");
  assert.deepEqual(endCalls, [error]);
  assert.equal(timers.active().length, 1);
  assert.equal(timers.active()[0].delay, 0);
});

test("cleanup é reverso, idempotente e continua após erro", async () => {
  const calls = [];
  const logs = [];
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    logger: { error: (message, error) => logs.push(`${message}: ${error.message}`) },
  });
  const session = controller.create({});
  session.addCleanup(() => calls.push("primeiro"));
  session.addCleanup(() => {
    calls.push("segundo");
    throw new Error("cleanup quebrado");
  });
  session.addCleanup(() => calls.push("terceiro"));

  controller.create({});
  assert.equal(await controller.handleClose(session, 0), false);

  assert.deepEqual(calls, ["terceiro", "segundo", "primeiro"]);
  assert.equal(logs.some((message) => message.includes("cleanup quebrado")), true);
});

test("rejeição assíncrona de cleanup é registrada", async () => {
  const logs = [];
  const calls = [];
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    logger: { error: (message, error) => logs.push(`${message}: ${error.message}`) },
  });
  const session = controller.create({});
  session.addCleanup(() => calls.push("cleanup anterior continuou"));
  session.addCleanup(async () => {
    throw new Error("cleanup assíncrono quebrado");
  });

  controller.create({});
  await session.whenClosed();

  assert.equal(logs.some((message) => message.includes("cleanup assíncrono quebrado")), true);
  assert.deepEqual(calls, ["cleanup anterior continuou"]);
});

test("cleanup assíncrono preserva ordem reversa e expõe drain", async () => {
  const gate = deferred();
  const calls = [];
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const session = controller.create({});
  session.addCleanup(() => calls.push("primeiro"));
  session.addCleanup(() => calls.push("segundo"));
  session.addCleanup(async () => {
    calls.push("terceiro:start");
    await gate.promise;
    calls.push("terceiro:end");
  });

  controller.create({});
  assert.equal(session.signal.aborted, true);
  assert.equal(session.state, "closing");
  assert.deepEqual(calls, ["terceiro:start"]);

  gate.resolve();
  await session.whenClosed();
  assert.deepEqual(calls, ["terceiro:start", "terceiro:end", "segundo", "primeiro"]);
  assert.equal(session.state, "closed");
});

test("shutdown só resolve depois de drenar cleanup", async () => {
  const gate = deferred();
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const session = controller.create({});
  session.addCleanup(() => gate.promise);
  let shutdownResolved = false;

  const shuttingDown = controller.shutdown().then(() => {
    shutdownResolved = true;
  });
  await flushPromises();
  assert.equal(shutdownResolved, false);
  assert.equal(session.state, "closing");

  gate.resolve();
  await shuttingDown;
  assert.equal(shutdownResolved, true);
  assert.equal(session.state, "closed");
});

test("cleanup adicionado durante closing executa imediatamente e entra no drain", async () => {
  const original = deferred();
  const late = deferred();
  const calls = [];
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const session = controller.create({});
  session.addCleanup(() => original.promise);
  controller.create({});

  session.addCleanup(() => {
    calls.push("late");
    return late.promise;
  });
  assert.deepEqual(calls, ["late"]);

  original.resolve();
  await flushPromises();
  assert.equal(session.state, "closing");
  late.resolve();
  await session.whenClosed();
  assert.equal(session.state, "closed");

  session.addCleanup(() => calls.push("after-closed"));
  await session.whenClosed();
  assert.deepEqual(calls, ["late", "after-closed"]);
});

test("shutdown aguarda cleanup tardio de sessão já closed", async () => {
  const late = deferred();
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const oldSession = controller.create({});
  controller.create({});
  oldSession.addCleanup(() => late.promise);
  let shutdownResolved = false;

  const shuttingDown = controller.shutdown().then(() => {
    shutdownResolved = true;
  });
  await flushPromises();
  assert.equal(shutdownResolved, false);

  late.resolve();
  await shuttingDown;
  assert.equal(shutdownResolved, true);
});

test("rejeição de end é registrada e ainda agenda uma única reconexão", async () => {
  const timers = createTimerHarness();
  const logs = [];
  let reconnects = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => reconnects++,
    logger: { log: (message, error) => logs.push(`${message}: ${error.message}`) },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({
    end: async () => {
      throw new Error("end rejeitado");
    },
  });

  assert.equal(await controller.recover(session, new Error("falha"), 25), true);
  assert.equal(await controller.handleClose(session, 25), false);
  assert.equal(timers.active().length, 1);
  assert.equal(logs.some((message) => message.includes("end rejeitado")), true);

  timers.fireNext();
  await flushPromises();
  assert.equal(reconnects, 1);
});

test("scheduler mantém no máximo uma reconexão em voo", async () => {
  const timers = createTimerHarness();
  const firstReconnect = deferred();
  let reconnects = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => {
      reconnects++;
      if (reconnects === 1) await firstReconnect.promise;
    },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  assert.equal(controller.scheduleReconnect(10), true);
  assert.equal(controller.scheduleReconnect(20), false);
  timers.fireNext();
  await flushPromises();
  assert.equal(reconnects, 1);
  assert.equal(controller.scheduleReconnect(30), false);

  firstReconnect.resolve();
  await flushPromises();
  assert.equal(controller.scheduleReconnect(40), true);
  timers.fireNext();
  await flushPromises();
  assert.equal(reconnects, 2);
});

test("rejeição de reconnect é registrada e libera o slot após liquidação", async () => {
  const timers = createTimerHarness();
  const logs = [];
  const controller = createConnectionSessionController({
    reconnect: async () => {
      throw new Error("reconnect rejeitado");
    },
    logger: { log: (message, error) => logs.push(`${message}: ${error.message}`) },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.scheduleReconnect(0);
  timers.fireNext();
  await flushPromises();

  assert.equal(logs.some((message) => message.includes("reconnect rejeitado")), true);
  assert.equal(controller.scheduleReconnect(10), true);
});

test("recover antigo não agenda reconnect se outra sessão surgir durante end", async () => {
  const timers = createTimerHarness();
  const ending = deferred();
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const a = controller.create({ end: () => ending.promise });
  const recovering = controller.recover(a, new Error("falha A"), 50);
  await flushPromises();

  const b = controller.create({});
  ending.resolve();
  await recovering;

  assert.equal(b.isActive(), true);
  assert.equal(timers.active().length, 0);
});

test("create cancela reconnect pendente de geração anterior", () => {
  const timers = createTimerHarness();
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  controller.create({});
  controller.scheduleReconnect(100);

  controller.create({});

  assert.equal(timers.active().length, 0);
});

test("shutdown cancela wrapper de reconnect bloqueado e sinaliza callback", async () => {
  const timers = createTimerHarness();
  const reconnecting = deferred();
  let reconnectSignal;
  let effects = 0;
  let reconnects = 0;
  const controller = createConnectionSessionController({
    reconnect: async (signal) => {
      reconnects++;
      reconnectSignal = signal;
      await reconnecting.promise;
      if (!signal.aborted) effects++;
    },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  controller.scheduleReconnect(0);
  timers.fireNext();
  await flushPromises();

  const shuttingDown = controller.shutdown();
  assert.equal(controller.scheduleReconnect(0), false);
  assert.throws(() => controller.create({}), /stopped/i);
  await shuttingDown;
  assert.equal(reconnectSignal.aborted, true);
  assert.equal(effects, 0);

  reconnecting.resolve();
  await flushPromises();

  assert.equal(reconnects, 1);
  assert.equal(effects, 0);
  assert.equal(timers.active().length, 0);
});

test("reconnect que ignora abort pode rejeitar tarde sem unhandled", async () => {
  const timers = createTimerHarness();
  const reconnecting = deferred();
  const logs = [];
  let reconnectSignal;
  const controller = createConnectionSessionController({
    reconnect: (signal) => {
      reconnectSignal = signal;
      return reconnecting.promise;
    },
    logger: { log: (message, error) => logs.push(`${message}: ${error.message}`) },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  controller.scheduleReconnect(0);
  timers.fireNext();
  await flushPromises();

  await controller.shutdown();
  assert.equal(reconnectSignal.aborted, true);
  reconnecting.reject(new Error("reconnect tardio"));
  await flushPromises();

  assert.equal(logs.some((message) => message.includes("reconnect tardio")), true);
  assert.equal(timers.active().length, 0);
});

test("shutdown cancela recover travado, limpa closeTimeout e absorve rejeição tardia", async () => {
  const timers = createTimerHarness();
  const ending = deferred();
  const logs = [];
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    logger: { log: (message, error) => logs.push(`${message}: ${error.message}`) },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({ end: () => ending.promise });
  const recovering = controller.recover(session, new Error("falha"), 0);
  await flushPromises();
  assert.equal(timers.active().length, 1);

  await controller.shutdown();
  assert.equal(await recovering, true);
  assert.equal(timers.active().length, 0);

  ending.reject(new Error("end tardio"));
  await flushPromises();
  assert.equal(logs.some((message) => message.includes("end tardio")), true);
});

test("shutdown liquida initialize cujo prepare ignora abort sem executar commit", async () => {
  const preparing = deferred();
  let commits = 0;
  let initializationSettled = false;
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const session = controller.create({});
  const initialization = controller
    .initialize(session, {
      prepare: () => preparing.promise,
      commit: () => commits++,
    })
    .then((result) => {
      initializationSettled = true;
      return result;
    });
  await flushPromises();

  await controller.shutdown();
  await flushPromises();
  const settledBeforePrepare = initializationSettled;
  preparing.reject(new Error("prepare tardio"));

  assert.equal(await initialization, false);
  assert.equal(settledBeforePrepare, true);
  assert.equal(commits, 0);
});

test("shutdown imediato impede prepare ainda não iniciado", async () => {
  let prepares = 0;
  const controller = createConnectionSessionController({ reconnect: async () => {} });
  const session = controller.create({});
  const initialization = controller.initialize(session, {
    prepare: async () => prepares++,
    commit: () => assert.fail("commit não deveria executar"),
  });

  await controller.shutdown();

  assert.equal(await initialization, false);
  assert.equal(prepares, 0);
});

test("shutdown imediato impede sock.end ainda não iniciado", async () => {
  const timers = createTimerHarness();
  let endCalls = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({ end: async () => endCalls++ });
  const recovering = controller.recover(session, new Error("falha"), 0);

  await controller.shutdown();

  assert.equal(await recovering, true);
  assert.equal(endCalls, 0);
  assert.equal(timers.active().length, 0);
});

test("handleClose aguarda cleanup antes de agendar reconnect", async () => {
  const timers = createTimerHarness();
  const cleanup = deferred();
  let reconnects = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => reconnects++,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({});
  session.addCleanup(() => cleanup.promise);

  const closing = controller.handleClose(session, 0);
  await flushPromises();
  assert.equal(timers.active().length, 0);
  cleanup.resolve();
  assert.equal(await closing, true);

  assert.equal(timers.active().length, 1);
  timers.fireNext();
  await flushPromises();
  assert.equal(reconnects, 1);
});

test("handleClose fecha a atual e evento tardio não duplica reconnect", async () => {
  const timers = createTimerHarness();
  let cleaned = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({});
  session.addCleanup(() => cleaned++);

  assert.equal(await controller.handleClose(session, 100), true);
  assert.equal(await controller.handleClose(session, 100), false);

  assert.equal(session.state, "closed");
  assert.equal(session.signal.aborted, true);
  assert.equal(cleaned, 1);
  assert.equal(timers.active().length, 1);
});

test("shutdown fecha a sessão, cancela timer e impede timers futuros", async () => {
  const timers = createTimerHarness();
  let cleaned = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({});
  session.addCleanup(() => cleaned++);
  controller.scheduleReconnect(100);

  await controller.shutdown();
  await controller.shutdown();

  assert.equal(session.state, "closed");
  assert.equal(cleaned, 1);
  assert.equal(timers.active().length, 0);
  assert.equal(controller.scheduleReconnect(200), false);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createTimerHarness() {
  const pending = [];
  const cleared = [];
  return {
    pending,
    cleared,
    setTimeoutFn(callback, delay) {
      const handle = { callback, delay, cleared: false };
      pending.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      handle.cleared = true;
      cleared.push(handle);
    },
    fireNext() {
      const handle = pending.find((candidate) => !candidate.cleared && !candidate.fired);
      assert.ok(handle, "esperava um timer pendente");
      handle.fired = true;
      handle.callback();
      return handle;
    },
    active() {
      return pending.filter((handle) => !handle.cleared && !handle.fired);
    },
  };
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}
