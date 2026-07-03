const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ConnectionWatchdog,
  createConnectionWatchdogManager,
} = require("./connection-watchdog.js");

const silentLogger = { log() {} };

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
