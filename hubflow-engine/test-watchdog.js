const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const watchdogModule = require("./connection-watchdog.js");
const {
  ConnectionWatchdog,
  createConnectionWatchdogManager,
} = watchdogModule;

const silentLogger = { log() {} };

test("entrypoint conecta watchdog ao controlador de sessão", () => {
  const source = readFileSync(require.resolve("./index.js"), "utf8");
  const operations = readFileSync(require.resolve("./connection-operations.js"), "utf8");
  const watchdogSource = readFileSync(require.resolve("./connection-watchdog.js"), "utf8");
  assert.match(source, /connectionWatchdog\.attach\(session\)/);
  assert.match(source, /connectionWatchdog\.detach\(session\)/);
  assert.match(source, /connectionController\.create\(sock\)/);
  assert.match(source, /bindConnectionLifecycle\(\{/);
  assert.match(operations, /controller\.handleClose\(session, delay\)/);
  assert.match(source, /connectionController\.shutdown\(\)/);
  assert.match(source, /connectionController\.recover\(session, error, wait\)/);
  assert.deepEqual(Object.keys(watchdogModule).sort(), [
    "ConnectionWatchdog",
    "createConnectionWatchdogManager",
  ]);
  assert.doesNotMatch(watchdogSource, /\bsock\??\.end\b/);
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

test("attach da sessão atual reutiliza watchdog sem reiniciar", () => {
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

  const session = { sock: {}, generation: 1, isActive: () => true };
  const manager = createConnectionWatchdogManager({
    Watchdog: FakeWatchdog,
    logger: silentLogger,
    recover: async () => {},
  });

  const first = manager.attach(session);
  const second = manager.attach(session);

  assert.equal(second, first);
  assert.equal(instances.length, 1);
  assert.equal(first.startCalls, 1);
  assert.equal(first.stopCalls, 0);
});

test("manager propaga rejeição assíncrona de recover para o watchdog registrar", async () => {
  const logs = [];
  const socket = {
    sendPresenceUpdate: async () => {
      throw new Error("stream indisponível");
    },
  };
  const session = { sock: socket, generation: 1, isActive: () => true };
  const manager = createConnectionWatchdogManager({
    logger: { log: (message) => logs.push(message) },
    recover: async () => {
      throw new Error("recuperação falhou");
    },
  });
  const watchdog = manager.attach(session);
  watchdog._consecutiveFails = 2;

  try {
    await assert.doesNotReject(() => watchdog._ping());
    assert.equal(logs.some((message) => message.includes("recuperação falhou")), true);
  } finally {
    manager.stop();
  }
});

test("manager mantém somente a sessão ativa e recupera por geração", async () => {
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

  const recovered = [];
  const sessionA = { sock: {}, generation: 1, isActive: () => false };
  const sessionB = { sock: {}, generation: 2, isActive: () => true };
  const manager = createConnectionWatchdogManager({
    Watchdog: FakeWatchdog,
    logger: silentLogger,
    recover: async (session, error) => recovered.push([session, error]),
  });

  const watchdogA = manager.attach(sessionA);
  assert.equal(watchdogA.startCalls, 1);

  const watchdogB = manager.attach(sessionB);
  assert.equal(watchdogA.stopCalls, 1);
  assert.equal(watchdogB.startCalls, 1);

  await watchdogA.options.onDead();
  assert.equal(recovered.length, 0);

  assert.equal(manager.detach(sessionA), false);
  assert.equal(watchdogB.stopCalls, 0);

  await watchdogB.options.onDead();
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0][0], sessionB);
  assert.equal(recovered[0][1].message, "watchdog detected zombie connection");

  assert.equal(manager.detach(sessionB), true);
  assert.equal(watchdogB.stopCalls, 1);
  assert.equal(manager.stop(), false);
  assert.equal(watchdogB.stopCalls, 1);
  assert.equal(instances.length, 2);
});
