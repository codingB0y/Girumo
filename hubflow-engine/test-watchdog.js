const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const {
  ConnectionWatchdog,
  closeSupersededSocket,
  createConnectionLifecycleManager,
  createConnectionWatchdogManager,
} = require("./connection-watchdog.js");

const silentLogger = { log() {} };

test("entrypoint conecta watchdog a open, close e shutdown", () => {
  const source = readFileSync(require.resolve("./index.js"), "utf8");
  assert.match(source, /connectionWatchdog\.attach\(sock\)/);
  assert.match(source, /connectionWatchdog\.detach\(sock\)/);
  assert.match(source, /connectionWatchdog\.stop\(\)/);
  assert.match(source, /connectionLifecycle\.track\(sock\)/);
  assert.match(source, /connectionLifecycle\.release\(sock\)/);
  assert.match(source, /connectionLifecycle\.shutdown\(\)/);
  assert.match(source, /closeSupersededSocket\(sock, console\)/);
  assert.match(source, /getRetryDelay:/);
});

function createTimerHarness() {
  const scheduled = [];
  const cleared = [];
  return {
    scheduled,
    cleared,
    setTimeoutFn(callback, delay) {
      const handle = { callback, delay };
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      cleared.push(handle);
    },
  };
}

test("lifecycle rastreia o socket mais recente desde a criação", () => {
  const lifecycle = createConnectionLifecycleManager({ reconnect: async () => {} });
  const socketA = {};
  const socketB = {};

  lifecycle.track(socketA);
  lifecycle.track(socketB);

  assert.equal(lifecycle.isLatest(socketA), false);
  assert.equal(lifecycle.isLatest(socketB), true);
});

test("release de socket antigo não afeta o socket atual", () => {
  const lifecycle = createConnectionLifecycleManager({ reconnect: async () => {} });
  const socketA = {};
  const socketB = {};
  lifecycle.track(socketA);
  lifecycle.track(socketB);

  assert.equal(lifecycle.release(socketA), false);
  assert.equal(lifecycle.isLatest(socketB), true);
});

test("release do socket mais recente antes de open permite reconexão", () => {
  const lifecycle = createConnectionLifecycleManager({ reconnect: async () => {} });
  const socket = {};
  lifecycle.track(socket);

  assert.equal(lifecycle.release(socket), true);
  assert.equal(lifecycle.isLatest(socket), false);
});

test("scheduler mantém no máximo um reconnect pendente", () => {
  const timers = createTimerHarness();
  const lifecycle = createConnectionLifecycleManager({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  assert.equal(lifecycle.scheduleReconnect(1000), true);
  assert.equal(lifecycle.scheduleReconnect(2000), false);
  assert.equal(timers.scheduled.length, 1);
  assert.equal(timers.scheduled[0].delay, 1000);
});

test("timer disparado libera o slot para futuro reconnect", () => {
  const timers = createTimerHarness();
  const lifecycle = createConnectionLifecycleManager({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  lifecycle.scheduleReconnect(1000);

  timers.scheduled[0].callback();

  assert.equal(lifecycle.scheduleReconnect(2000), true);
  assert.equal(timers.scheduled.length, 2);
});

test("socket obsoleto é encerrado", async () => {
  const endCalls = [];
  const socket = { end: async (error) => endCalls.push(error) };

  await closeSupersededSocket(socket, silentLogger);

  assert.equal(endCalls.length, 1);
  assert.equal(endCalls[0].message, "superseded connection");
});

test("rejeição ao encerrar socket obsoleto é registrada sem propagar", async () => {
  const logs = [];
  const socket = {
    end: async () => {
      throw new Error("end falhou");
    },
  };

  await assert.doesNotReject(() =>
    closeSupersededSocket(socket, { log: (message) => logs.push(message) }),
  );

  assert.equal(logs.some((message) => message.includes("end falhou")), true);
});

test("scheduler registra rejeição do reconnect e agenda nova tentativa", async () => {
  const timers = createTimerHarness();
  const logs = [];
  const lifecycle = createConnectionLifecycleManager({
    reconnect: async () => {
      throw new Error("start falhou");
    },
    getRetryDelay: () => 2500,
    logger: { log: (message) => logs.push(message) },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  lifecycle.scheduleReconnect(1000);

  timers.scheduled[0].callback();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(logs.some((message) => message.includes("start falhou")), true);
  assert.equal(timers.scheduled.length, 2);
  assert.equal(timers.scheduled[1].delay, 2500);
});

test("shutdown impede retry após reconnect em voo rejeitar", async () => {
  const timers = createTimerHarness();
  const reconnectResult = deferred();
  const lifecycle = createConnectionLifecycleManager({
    reconnect: () => reconnectResult.promise,
    getRetryDelay: () => 2500,
    logger: silentLogger,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  lifecycle.scheduleReconnect(1000);
  timers.scheduled[0].callback();
  await new Promise((resolve) => setImmediate(resolve));

  lifecycle.shutdown();
  reconnectResult.reject(new Error("start falhou"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(timers.scheduled.length, 1);
});

test("exceção ao calcular retry é registrada sem novo timer", async () => {
  const timers = createTimerHarness();
  const logs = [];
  const lifecycle = createConnectionLifecycleManager({
    reconnect: async () => {
      throw new Error("start falhou");
    },
    getRetryDelay: () => {
      throw new Error("delay falhou");
    },
    logger: { log: (message) => logs.push(message) },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  lifecycle.scheduleReconnect(1000);

  timers.scheduled[0].callback();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(logs.some((message) => message.includes("delay falhou")), true);
  assert.equal(timers.scheduled.length, 1);
});

test("shutdown cancela reconnect pendente e bloqueia novos schedules", () => {
  const timers = createTimerHarness();
  const lifecycle = createConnectionLifecycleManager({
    reconnect: async () => {},
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  lifecycle.scheduleReconnect(1000);

  lifecycle.shutdown();

  assert.deepEqual(timers.cleared, [timers.scheduled[0]]);
  assert.equal(lifecycle.scheduleReconnect(2000), false);
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

test("ping bem-sucedido zera falhas consecutivas", async () => {
  const watchdog = new ConnectionWatchdog({
    sock: { sendPresenceUpdate: async () => {} },
    logger: silentLogger,
    timeoutMs: 10,
  });
  watchdog._alive = true;
  watchdog._consecutiveFails = 2;

  await watchdog._ping();

  assert.equal(watchdog._consecutiveFails, 0);
});

test("três falhas consecutivas disparam onDead uma única vez", async () => {
  let deadCalls = 0;
  const watchdog = new ConnectionWatchdog({
    sock: {
      sendPresenceUpdate: async () => {
        throw new Error("stream indisponível");
      },
    },
    onDead: () => deadCalls++,
    logger: silentLogger,
    timeoutMs: 10,
  });
  watchdog._alive = true;

  await watchdog._ping();
  await watchdog._ping();
  await watchdog._ping();
  await watchdog._ping();

  assert.equal(deadCalls, 1);
  assert.equal(watchdog._alive, false);
});

test("stop invalida conclusão de ping em voo", async () => {
  const pingResult = deferred();
  let intervalCallback;
  const watchdog = new ConnectionWatchdog({
    sock: { sendPresenceUpdate: () => pingResult.promise },
    logger: silentLogger,
    timeoutMs: 100,
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return 1;
    },
    clearIntervalFn() {},
  });

  watchdog.start();
  watchdog._consecutiveFails = 2;
  const ping = intervalCallback();
  watchdog.stop();
  pingResult.resolve();
  await ping;

  assert.equal(watchdog._consecutiveFails, 2);
});

test("stop invalida rejeição de ping em voo sem disparar onDead", async () => {
  const pingResult = deferred();
  let intervalCallback;
  let deadCalls = 0;
  const watchdog = new ConnectionWatchdog({
    sock: { sendPresenceUpdate: () => pingResult.promise },
    onDead: () => deadCalls++,
    logger: silentLogger,
    timeoutMs: 100,
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return 1;
    },
    clearIntervalFn() {},
  });

  watchdog.start();
  watchdog._consecutiveFails = 2;
  const ping = intervalCallback();
  watchdog.stop();
  pingResult.reject(new Error("falha tardia"));
  await ping;

  assert.equal(watchdog._consecutiveFails, 2);
  assert.equal(deadCalls, 0);
});

test("stop liquida imediatamente ping que nunca responde e limpa timeout", { timeout: 100 }, async () => {
  let intervalCallback;
  const timeoutHandle = { id: "pending-timeout" };
  const cleared = [];
  const watchdog = new ConnectionWatchdog({
    sock: { sendPresenceUpdate: () => new Promise(() => {}) },
    logger: silentLogger,
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return 1;
    },
    clearIntervalFn() {},
    setTimeoutFn: () => timeoutHandle,
    clearTimeoutFn: (handle) => cleared.push(handle),
  });

  watchdog.start();
  const ping = intervalCallback();
  watchdog.stop();
  await ping;

  assert.deepEqual(cleared, [timeoutHandle]);
});

test("ping rápido cancela explicitamente seu timeout", async () => {
  const timeoutHandle = { id: "watchdog-timeout" };
  const cleared = [];
  const watchdog = new ConnectionWatchdog({
    sock: { sendPresenceUpdate: async () => {} },
    logger: silentLogger,
    setTimeoutFn: () => timeoutHandle,
    clearTimeoutFn: (handle) => cleared.push(handle),
  });

  await watchdog._ping();

  assert.deepEqual(cleared, [timeoutHandle]);
});

test("pings não se sobrepõem", async () => {
  const pingResult = deferred();
  let sendCalls = 0;
  const watchdog = new ConnectionWatchdog({
    sock: {
      sendPresenceUpdate: () => {
        sendCalls++;
        return pingResult.promise;
      },
    },
    logger: silentLogger,
    timeoutMs: 100,
  });

  const firstPing = watchdog._ping();
  const secondPing = watchdog._ping();
  assert.equal(sendCalls, 1);

  pingResult.resolve();
  await Promise.all([firstPing, secondPing]);
});

test("onDead que lança é registrado sem rejeitar o ping", async () => {
  const logs = [];
  const watchdog = new ConnectionWatchdog({
    sock: {
      sendPresenceUpdate: async () => {
        throw new Error("stream indisponível");
      },
    },
    onDead: () => {
      throw new Error("recuperação falhou");
    },
    logger: { log: (message) => logs.push(message) },
    timeoutMs: 10,
  });
  watchdog._consecutiveFails = 2;

  await assert.doesNotReject(() => watchdog._ping());

  assert.equal(watchdog._alive, false);
  assert.equal(logs.some((message) => message.includes("recuperação falhou")), true);
});

test("attach do socket atual reutiliza watchdog sem reiniciar", () => {
  const instances = [];
  class FakeWatchdog {
    constructor(options) {
      this.options = options;
      this.startCalls = 0;
      this.stopCalls = 0;
      instances.push(this);
    }

    start() {
      this.startCalls++;
    }

    stop() {
      this.stopCalls++;
    }
  }

  const socket = {};
  const manager = createConnectionWatchdogManager({
    Watchdog: FakeWatchdog,
    logger: silentLogger,
  });

  const first = manager.attach(socket);
  const second = manager.attach(socket);

  assert.equal(second, first);
  assert.equal(instances.length, 1);
  assert.equal(first.startCalls, 1);
  assert.equal(first.stopCalls, 0);
});

test("manager propaga rejeição assíncrona de end para o watchdog registrar", async () => {
  const logs = [];
  const socket = {
    sendPresenceUpdate: async () => {
      throw new Error("stream indisponível");
    },
    end: async () => {
      throw new Error("encerramento falhou");
    },
  };
  const manager = createConnectionWatchdogManager({
    logger: { log: (message) => logs.push(message) },
  });
  const watchdog = manager.attach(socket);
  watchdog._consecutiveFails = 2;

  try {
    await assert.doesNotReject(() => watchdog._ping());
    assert.equal(logs.some((message) => message.includes("encerramento falhou")), true);
  } finally {
    manager.stop();
  }
});

test("manager mantém apenas o watchdog do socket ativo", () => {
  const instances = [];
  class FakeWatchdog {
    constructor(options) {
      this.options = options;
      this.startCalls = 0;
      this.stopCalls = 0;
      instances.push(this);
    }

    start() {
      this.startCalls++;
    }

    stop() {
      this.stopCalls++;
    }
  }

  const endCallsA = [];
  const endCallsB = [];
  const socketA = { end: (error) => endCallsA.push(error) };
  const socketB = { end: (error) => endCallsB.push(error) };
  const manager = createConnectionWatchdogManager({
    Watchdog: FakeWatchdog,
    logger: silentLogger,
  });

  const watchdogA = manager.attach(socketA);
  assert.equal(watchdogA.startCalls, 1);

  const watchdogB = manager.attach(socketB);
  assert.equal(watchdogA.stopCalls, 1);
  assert.equal(watchdogB.startCalls, 1);

  watchdogA.options.onDead();
  assert.equal(endCallsA.length, 0);

  assert.equal(manager.detach(socketA), false);
  assert.equal(watchdogB.stopCalls, 0);

  watchdogB.options.onDead();
  assert.equal(endCallsB.length, 1);
  assert.equal(endCallsB[0].message, "watchdog detected zombie connection");

  assert.equal(manager.detach(socketB), true);
  assert.equal(watchdogB.stopCalls, 1);
  assert.equal(manager.stop(), false);
  assert.equal(watchdogB.stopCalls, 1);
  assert.equal(instances.length, 2);
});
