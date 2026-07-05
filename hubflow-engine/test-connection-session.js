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

test("cleanup é reverso, idempotente e continua após erro", () => {
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
  assert.equal(controller.handleClose(session, 0), false);

  assert.deepEqual(calls, ["terceiro", "segundo", "primeiro"]);
  assert.equal(logs.some((message) => message.includes("cleanup quebrado")), true);
});

test("rejeição assíncrona de cleanup é registrada", async () => {
  const logs = [];
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    logger: { error: (message, error) => logs.push(`${message}: ${error.message}`) },
  });
  const session = controller.create({});
  session.addCleanup(async () => {
    throw new Error("cleanup assíncrono quebrado");
  });

  controller.create({});
  await flushPromises();

  assert.equal(logs.some((message) => message.includes("cleanup assíncrono quebrado")), true);
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
  assert.equal(controller.handleClose(session, 25), false);
  assert.equal(timers.active().length, 1);
  assert.equal(logs.some((message) => message.includes("end rejeitado")), true);

  timers.fireNext();
  await flushPromises();
  assert.equal(reconnects, 1);
});

test("scheduler mantém uma reconexão pendente e libera o slot antes de reconnect", async () => {
  const timers = createTimerHarness();
  const logs = [];
  let controller;
  let reconnects = 0;
  controller = createConnectionSessionController({
    reconnect: async () => {
      reconnects++;
      assert.equal(controller.scheduleReconnect(50), true);
      throw new Error("reconnect rejeitado");
    },
    logger: { log: (message, error) => logs.push(`${message}: ${error.message}`) },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  assert.equal(controller.scheduleReconnect(10), true);
  assert.equal(controller.scheduleReconnect(20), false);
  timers.fireNext();
  await flushPromises();

  assert.equal(reconnects, 1);
  assert.equal(timers.active().length, 1);
  assert.equal(timers.active()[0].delay, 50);
  assert.equal(logs.some((message) => message.includes("reconnect rejeitado")), true);
});

test("handleClose fecha a atual e evento tardio não duplica reconnect", () => {
  const timers = createTimerHarness();
  let cleaned = 0;
  const controller = createConnectionSessionController({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const session = controller.create({});
  session.addCleanup(() => cleaned++);

  assert.equal(controller.handleClose(session, 100), true);
  assert.equal(controller.handleClose(session, 100), false);

  assert.equal(session.state, "closed");
  assert.equal(session.signal.aborted, true);
  assert.equal(cleaned, 1);
  assert.equal(timers.active().length, 1);
});

test("shutdown fecha a sessão, cancela timer e impede timers futuros", () => {
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

  controller.shutdown();
  controller.shutdown();

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
