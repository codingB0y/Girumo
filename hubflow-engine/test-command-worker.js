const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const {
  abortableSleep,
  createSupabaseCommandWorker,
} = require("./queues/supabase-command-worker.js");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createSession(generation, sock = { user: { id: "1@s.whatsapp.net" } }) {
  let active = true;
  return {
    generation,
    sock,
    isActive: () => active,
    deactivate() {
      active = false;
    },
  };
}

function createLogger() {
  return {
    errors: [],
    logs: [],
    error(...args) { this.errors.push(args); },
    log(...args) { this.logs.push(args); },
  };
}

test("stop seguido de start nao reativa o loop antigo quando o sleep resolve tarde", async () => {
  const sleeps = [];
  let claims = 0;
  let session = createSession(1);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name) {
        if (name === "claim_engine_commands") claims++;
        return [];
      },
    },
    getSession: () => session,
    sendText: async () => {},
    sleep: () => {
      const gate = deferred();
      sleeps.push(gate);
      return gate.promise;
    },
    logger: createLogger(),
  });

  assert.equal(worker.start(1), true);
  await flush();
  assert.equal(claims, 1);

  assert.equal(worker.stop(1), true);
  session = createSession(2);
  assert.equal(worker.start(2), true);
  await flush();
  assert.equal(claims, 2);

  sleeps[0].resolve();
  await flush();
  assert.equal(claims, 2);
  worker.stop(2);
  sleeps.at(-1)?.resolve();
});

test("start da mesma geracao ativa e idempotente", async () => {
  const sleepGate = deferred();
  let claims = 0;
  const session = createSession(3);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: { rpc: async () => { claims++; return []; } },
    getSession: () => session,
    sendText: async () => {},
    sleep: () => sleepGate.promise,
    logger: createLogger(),
  });

  assert.equal(worker.start(3), true);
  assert.equal(worker.start(3), false);
  await flush();
  assert.equal(claims, 1);
  worker.stop(3);
  sleepGate.resolve();
});

test("cleanup de geracao antiga nao para a execucao nova", async () => {
  const sleeps = [];
  let session = createSession(4);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: { rpc: async () => [] },
    getSession: () => session,
    sendText: async () => {},
    sleep: () => {
      const gate = deferred();
      sleeps.push(gate);
      return gate.promise;
    },
    logger: createLogger(),
  });

  worker.start(4);
  await flush();
  session = createSession(5);
  worker.start(5);
  await flush();

  assert.equal(worker.stop(4), false);
  assert.equal(worker.getActiveGeneration(), 5);
  worker.stop(5);
  for (const gate of sleeps) gate.resolve();
});

test("claim concluido por geracao obsoleta nao envia comando", async () => {
  const claim = deferred();
  const sent = [];
  let session = createSession(6);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: { rpc: () => claim.promise },
    getSession: () => session,
    sendText: async (...args) => sent.push(args),
    logger: createLogger(),
  });

  const pending = worker.runOnce(6);
  session.deactivate();
  session = createSession(7);
  claim.resolve([{
    command_id: "old-claim",
    type: "send_message",
    payload: { phone: "5511999999999", text: "oi" },
  }]);

  assert.equal(await pending, false);
  assert.equal(sent.length, 0);
});

test("troca de geracao enquanto envio esta na fila impede sock.sendMessage", async () => {
  const queueGate = deferred();
  const socketCalls = [];
  const sock = {
    user: { id: "1@s.whatsapp.net" },
    sendMessage: async (...args) => socketCalls.push(args),
  };
  const session = createSession(8, sock);
  const calls = [];
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name) {
        calls.push(name);
        if (name === "claim_engine_commands") {
          return [{
            command_id: "queued-send",
            type: "send_message",
            payload: { phone: "5511999999999", text: "oi" },
          }];
        }
        return null;
      },
    },
    getSession: () => session,
    sendText: async (targetSock, jid, text, options) => {
      await queueGate.promise;
      options.assertActive();
      return targetSock.sendMessage(jid, { text });
    },
    logger: createLogger(),
  });

  const pending = worker.runOnce(8);
  await flush();
  session.deactivate();
  queueGate.resolve();
  assert.equal(await pending, false);
  assert.equal(socketCalls.length, 0);
  assert.deepEqual(calls, ["claim_engine_commands"]);
});

test("geracao obsoleta depois do envio nao atualiza, publica evento ou conclui", async () => {
  const calls = [];
  const session = createSession(9);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name) {
        calls.push(name);
        if (name === "claim_engine_commands") {
          return [{
            command_id: "sent-then-stale",
            tenant_id: "tenant",
            instance_id: "instance",
            type: "send_message",
            payload: { phone: "5511999999999", text: "oi" },
          }];
        }
        return null;
      },
    },
    getSession: () => session,
    sendText: async () => session.deactivate(),
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(9), false);
  assert.deepEqual(calls, ["claim_engine_commands"]);
});

test("rejeicao tardia de claim obsoleto e observada sem logar erro da geracao antiga", async () => {
  const claim = deferred();
  const logger = createLogger();
  const session = createSession(10);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: { rpc: () => claim.promise },
    getSession: () => session,
    sendText: async () => {},
    logger,
  });

  const pending = worker.runOnce(10);
  worker.stop(10);
  claim.reject(new Error("late claim failure"));

  assert.equal(await pending, false);
  assert.equal(logger.errors.length, 0);
});

test("modo desativado e no-op sem construir cliente ou consultar sessao", async () => {
  let sessions = 0;
  const worker = createSupabaseCommandWorker({
    enabled: false,
    getSession: () => { sessions++; return createSession(11); },
    sendText: async () => {},
    logger: createLogger(),
  });

  assert.equal(worker.start(11), false);
  assert.equal(worker.stop(11), false);
  assert.equal(await worker.runOnce(11), false);
  assert.equal(sessions, 0);
});

test("sleep cancelavel liquida no abort e remove timer e listener", async () => {
  const controller = new AbortController();
  let timerCallback;
  let cleared;
  const sleepPromise = abortableSleep(
    1000,
    controller.signal,
    (callback) => {
      timerCallback = callback;
      return "timer-id";
    },
    (timer) => { cleared = timer; },
  );

  controller.abort();
  await sleepPromise;
  assert.equal(cleared, "timer-id");

  cleared = null;
  timerCallback();
  assert.equal(cleared, null);
});

test("run ativo preserva claim, efeitos e complete atuais", async () => {
  const calls = [];
  const session = createSession(13);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") {
          return [{
            command_id: "active-command",
            tenant_id: "tenant",
            instance_id: "instance",
            type: "refresh_status",
            payload: {},
          }];
        }
        return null;
      },
    },
    getSession: () => session,
    sendText: async () => {},
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(13), true);
  assert.deepEqual(calls.map((call) => call.name), [
    "claim_engine_commands",
    "update_instance_status",
    "record_engine_event",
    "complete_engine_command",
  ]);
  assert.deepEqual(calls.at(-1).body, {
    target_command_id: "active-command",
    success: true,
    error_message: null,
  });
});

test("falha ao atualizar instancia nao impede evento e complete de erro", async () => {
  const calls = [];
  const session = createSession(14);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") {
          return [{
            command_id: "failed-command",
            tenant_id: "tenant",
            instance_id: "instance",
            type: "unsupported",
            payload: {},
          }];
        }
        if (name === "update_instance_status") throw new Error("status unavailable");
        return null;
      },
    },
    getSession: () => session,
    sendText: async () => {},
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(14), true);
  assert.deepEqual(calls.map((call) => call.name), [
    "claim_engine_commands",
    "update_instance_status",
    "record_engine_event",
    "complete_engine_command",
  ]);
  assert.equal(calls.at(-1).body.success, false);
});

test("uma execucao nunca sobrepoe ticks", async () => {
  const firstClaim = deferred();
  const sleepGate = deferred();
  let claims = 0;
  const session = createSession(12);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      rpc: async () => {
        claims++;
        if (claims === 1) return firstClaim.promise;
        return [];
      },
    },
    getSession: () => session,
    sendText: async () => {},
    sleep: () => sleepGate.promise,
    logger: createLogger(),
  });

  worker.start(12);
  await flush();
  assert.equal(claims, 1);
  await flush();
  assert.equal(claims, 1);
  firstClaim.resolve([]);
  await flush();
  assert.equal(claims, 1);
  worker.stop(12);
  sleepGate.resolve();
});

test("falha de claim preserva backoff maior antes do proximo tick", async () => {
  const delays = [];
  const sleepGate = deferred();
  const session = createSession(15);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: { rpc: async () => { throw new Error("supabase unavailable"); } },
    getSession: () => session,
    sendText: async () => {},
    pollMs: 100,
    sleep: (ms) => {
      delays.push(ms);
      return sleepGate.promise;
    },
    logger: createLogger(),
  });

  worker.start(15);
  await flush();
  assert.deepEqual(delays, [200]);
  worker.stop(15);
  sleepGate.resolve();
});

test("entrypoint valida a geracao dentro da fila e associa start e stop a sessao", () => {
  const source = readFileSync(require.resolve("./index.js"), "utf8");
  assert.match(source, /function sendText\([\s\S]*?assertActive\?\.\(\)[\s\S]*?sock\.sendMessage/);
  assert.match(source, /getSession:\s*\(\)\s*=>\s*currentSession\?\.state\s*===\s*["']ready["']/);
  assert.match(source, /supabaseCommandWorker\.start\(session\.generation\)/);
  assert.match(source, /supabaseCommandWorker\.stop\(session\.generation\)/);
  assert.match(source, /supabaseCommandWorkerStarted\s*=\s*supabaseCommandWorker\.getActiveGeneration\(\)\s*===\s*session\.generation/);
});

test("suite da engine inclui os testes do worker", () => {
  const pkg = JSON.parse(readFileSync(require.resolve("./package.json"), "utf8"));
  assert.match(pkg.scripts.test, /test-command-worker\.js/);
});
