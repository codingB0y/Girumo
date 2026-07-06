const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const { AntiBanQueue } = require("./anti-ban-queue.js");
const { SessionAbortedError } = require("./connection-session.js");
const { createQueuedTextSender } = require("./queued-text-sender.js");
const {
  WorkerRunAbortedError,
  createSupabaseCommandWorker,
} = require("./queues/supabase-command-worker.js");

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createQueue(options = {}) {
  return new AntiBanQueue({
    minDelayMs: 0,
    maxDelayMs: 0,
    priorityDelayMs: 0,
    maxPerMinute: 100,
    maxPerHour: 100,
    maxPerDay: 100,
    backoffBaseMs: 1,
    breakerCooldownMs: 1,
    ...options,
  });
}

test("erros de cancelamento por geracao usam contrato nao retentavel", () => {
  assert.equal(new SessionAbortedError(1).retryable, false);
  assert.equal(new WorkerRunAbortedError(1).retryable, false);
});

test("fila rejeita erro nao retentavel uma vez e processa o proximo item", async () => {
  let cancelledAttempts = 0;
  let validAttempts = 0;
  let sent = 0;
  const queue = createQueue({
    maxRetries: 3,
    breakerThreshold: 1,
    onSent: () => sent++,
  });

  const cancelled = queue.enqueue(async () => {
    cancelledAttempts++;
    const error = new Error("obsolete generation");
    error.retryable = false;
    throw error;
  });
  const valid = queue.enqueue(async () => {
    validAttempts++;
    return "sent";
  });

  await assert.rejects(cancelled, /obsolete generation/);
  assert.equal(await valid, "sent");
  assert.equal(cancelledAttempts, 1);
  assert.equal(validAttempts, 1);
  assert.equal(queue.consecutiveFailures, 0);
  assert.equal(queue.paused, false);
  assert.equal(sent, 1);
});

test("erros transitorios continuam usando as retentativas existentes", async () => {
  let attempts = 0;
  const queue = createQueue({ maxRetries: 2 });
  const result = await queue.enqueue(async () => {
    attempts++;
    if (attempts < 3) throw new Error("temporary failure");
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("worker obsoleto sai da fila sem retries e a geracao nova envia", async () => {
  const blockerStarted = deferred();
  const releaseBlocker = deferred();
  const queueLogs = [];
  const queue = createQueue({
    maxRetries: 3,
    onLog: (message) => queueLogs.push(message),
  });
  const blocker = queue.enqueue(async () => {
    blockerStarted.resolve();
    await releaseBlocker.promise;
    return "blocker";
  });
  await blockerStarted.promise;

  const socketCalls = [];
  let session = {
    generation: 20,
    sock: {
      user: { id: "20@s.whatsapp.net" },
      sendMessage: async (jid, content) => socketCalls.push({ generation: 20, jid, content }),
    },
    isActive: () => true,
    assertActive() { return this; },
  };
  const sendText = createQueuedTextSender(queue);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name) {
        if (name !== "claim_engine_commands") return { command_id: `command-${session.generation}` };
        return [{
          command_id: `command-${session.generation}`,
          lease_token: `lease-${session.generation}`,
          attempt_count: 1,
          type: "send_message",
          payload: { phone: "5511999999999", text: `generation-${session.generation}` },
        }];
      },
    },
    getSession: () => session,
    sendText,
    logger: { log() {}, error() {} },
  });

  const runA = worker.runOnce(20);
  await flush();
  session = {
    generation: 21,
    sock: {
      user: { id: "21@s.whatsapp.net" },
      sendMessage: async (jid, content) => socketCalls.push({ generation: 21, jid, content }),
    },
    isActive: () => true,
    assertActive() { return this; },
  };
  const runB = worker.runOnce(21);
  await flush();
  releaseBlocker.resolve();

  await blocker;
  assert.equal(await runA, false);
  assert.equal(await runB, true);
  assert.deepEqual(socketCalls.map((call) => call.generation), [21]);
  assert.equal(queueLogs.some((message) => message.includes("Retry")), false);
});

test("suite da engine inclui os testes unitarios da fila", () => {
  const pkg = JSON.parse(readFileSync(require.resolve("./package.json"), "utf8"));
  assert.match(pkg.scripts.test, /test-anti-ban-queue\.js/);
});
