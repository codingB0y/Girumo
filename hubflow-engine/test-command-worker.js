const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const {
  abortableSleep,
  createSupabaseCommandWorker,
} = require("./queues/supabase-command-worker.js");
const { boundedInteger } = require("./config/env.js");

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

function leasedCommand(overrides = {}) {
  return {
    command_id: "command-1",
    lease_token: "lease-1",
    attempt_count: 1,
    tenant_id: "tenant",
    instance_id: "instance",
    type: "send_message",
    payload: { phone: "5511999999999", text: "oi" },
    ...overrides,
  };
}

function successfulCompositeResult() {
  return [{ command_id: "command-1" }];
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
    lease_token: "old-lease",
    attempt_count: 1,
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
            lease_token: "queued-lease",
            attempt_count: 1,
            type: "send_message",
            payload: { phone: "5511999999999", text: "oi" },
          }];
        }
        return successfulCompositeResult();
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
  assert.deepEqual(calls, ["claim_engine_commands", "mark_engine_command_effect_started"]);
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
            lease_token: "sent-lease",
            attempt_count: 1,
            tenant_id: "tenant",
            instance_id: "instance",
            type: "send_message",
            payload: { phone: "5511999999999", text: "oi" },
          }];
        }
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => session.deactivate(),
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(9), false);
  assert.deepEqual(calls, ["claim_engine_commands", "mark_engine_command_effect_started"]);
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
            lease_token: "active-lease",
            attempt_count: 1,
            tenant_id: "tenant",
            instance_id: "instance",
            type: "refresh_status",
            payload: {},
          }];
        }
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => {},
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(13), true);
  assert.deepEqual(calls.map((call) => call.name), [
    "claim_engine_commands",
    "mark_engine_command_effect_started",
    "update_instance_status",
    "record_engine_event",
    "complete_engine_command",
  ]);
  assert.deepEqual(calls.at(-1).body, {
    target_command_id: "active-command",
    target_lease_token: "active-lease",
    success: true,
    error_message: null,
    target_failure_kind: "retryable",
    retry_delay_seconds: 30,
  });
});

test("comando nao suportado falha antes do efeito e conclui como permanente", async () => {
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
            lease_token: "failed-lease",
            attempt_count: 1,
            tenant_id: "tenant",
            instance_id: "instance",
            type: "unsupported",
            payload: {},
          }];
        }
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => {},
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(14), true);
  assert.deepEqual(calls.map((call) => call.name), [
    "claim_engine_commands",
    "complete_engine_command",
  ]);
  assert.equal(calls.at(-1).body.success, false);
  assert.equal(calls.at(-1).body.target_failure_kind, "permanent");
  assert.equal(calls.at(-1).body.retry_delay_seconds, 0);
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

test("claim envia lease configurado e send_message usa fencing em ordem", async () => {
  const calls = [];
  const session = createSession(16);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return [leasedCommand()];
        return { command_id: "command-1" };
      },
    },
    getSession: () => session,
    sendText: async () => calls.push({ name: "sendText" }),
    leaseSeconds: 75,
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(16), true);
  assert.deepEqual(calls.map(({ name }) => name), [
    "claim_engine_commands",
    "mark_engine_command_effect_started",
    "sendText",
    "update_instance_status",
    "record_engine_event",
    "complete_engine_command",
  ]);
  assert.deepEqual(calls[0].body, { max_commands: 5, lease_seconds: 75 });
  for (const call of calls.filter(({ name }) => [
    "mark_engine_command_effect_started",
    "update_instance_status",
    "record_engine_event",
    "complete_engine_command",
  ].includes(name))) {
    assert.equal(call.body.target_command_id, "command-1");
    assert.equal(call.body.target_lease_token, "lease-1");
  }
});

test("comando sem metadados obrigatorios de lease nunca executa nem conclui", async () => {
  const calls = [];
  const logger = createLogger();
  const session = createSession(17);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") {
          return [leasedCommand({ lease_token: undefined }), leasedCommand({ command_id: "c2", attempt_count: undefined })];
        }
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => calls.push({ name: "sendText" }),
    logger,
  });

  assert.equal(await worker.runOnce(17), true);
  assert.deepEqual(calls.map(({ name }) => name), ["claim_engine_commands"]);
  assert.equal(logger.errors.length, 2);
});

for (const emptyResult of [null, []]) {
  test(`mark sem ownership (${JSON.stringify(emptyResult)}) bloqueia efeito e conclusao`, async () => {
    const calls = [];
    const session = createSession(18);
    const worker = createSupabaseCommandWorker({
      enabled: true,
      client: {
        async rpc(name, body) {
          calls.push({ name, body });
          if (name === "claim_engine_commands") return [leasedCommand()];
          if (name === "mark_engine_command_effect_started") return emptyResult;
          return successfulCompositeResult();
        },
      },
      getSession: () => session,
      sendText: async () => calls.push({ name: "sendText" }),
      logger: createLogger(),
    });

    assert.equal(await worker.runOnce(18), true);
    assert.deepEqual(calls.map(({ name }) => name), [
      "claim_engine_commands",
      "mark_engine_command_effect_started",
    ]);
  });
}

test("falhas auxiliares depois do envio sao fail-soft e ainda concluem sucesso", async () => {
  const calls = [];
  const session = createSession(19);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return [leasedCommand()];
        if (name === "update_instance_status" || name === "record_engine_event") throw new Error(`${name} indisponivel`);
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => calls.push({ name: "sendText" }),
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(19), true);
  assert.equal(calls.at(-1).name, "complete_engine_command");
  assert.equal(calls.at(-1).body.success, true);
  for (const call of calls.filter(({ name }) => [
    "update_instance_status",
    "record_engine_event",
  ].includes(name))) {
    assert.equal(call.body.target_command_id, "command-1");
    assert.equal(call.body.target_lease_token, "lease-1");
  }
});

test("erro de envio depois do mark conclui como uncertain sem retry automatico", async () => {
  const calls = [];
  const session = createSession(20);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return [leasedCommand()];
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => { throw new Error("resultado do envio desconhecido"); },
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(20), true);
  const completion = calls.find(({ name }) => name === "complete_engine_command");
  assert.equal(completion.body.success, false);
  assert.equal(completion.body.target_failure_kind, "uncertain");
  assert.equal(completion.body.retry_delay_seconds, 0);
});

test("payload invalido antes do mark conclui permanente sem backoff", async () => {
  const calls = [];
  const session = createSession(21);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") {
          return [leasedCommand({ attempt_count: 3, payload: { phone: "5511" } })];
        }
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => calls.push({ name: "sendText" }),
    retryDelaySeconds: 30,
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(21), true);
  assert.deepEqual(calls.map(({ name }) => name), ["claim_engine_commands", "complete_engine_command"]);
  assert.equal(calls[1].body.target_failure_kind, "permanent");
  assert.equal(calls[1].body.retry_delay_seconds, 0);
});

test("perda de lease em efeito auxiliar bloqueia eventos posteriores e complete", async () => {
  const calls = [];
  const session = createSession(25);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return [leasedCommand()];
        if (name === "update_instance_status") return [];
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => calls.push({ name: "sendText" }),
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(25), true);
  assert.deepEqual(calls.map(({ name }) => name), [
    "claim_engine_commands",
    "mark_engine_command_effect_started",
    "sendText",
    "update_instance_status",
  ]);
  assert.equal(calls.some(({ name }) => name === "record_engine_event"), false);
  assert.equal(calls.some(({ name }) => name === "complete_engine_command"), false);
});

test("envio longo renova lease sem sobrepor e limpa o intervalo", async () => {
  const calls = [];
  const sendGate = deferred();
  const sendStarted = deferred();
  const intervalCallbacks = [];
  const cleared = [];
  const renewGate = deferred();
  let renewCount = 0;
  const session = createSession(22);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return [leasedCommand()];
        if (name === "renew_engine_command_lease") {
          renewCount++;
          if (renewCount === 1) return renewGate.promise;
        }
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => { sendStarted.resolve(); return sendGate.promise; },
    setIntervalFn(callback, ms) { intervalCallbacks.push({ callback, ms }); return "renew-timer"; },
    clearIntervalFn(timer) { cleared.push(timer); },
    leaseSeconds: 60,
    logger: createLogger(),
  });

  const pending = worker.runOnce(22);
  await sendStarted.promise;
  assert.equal(intervalCallbacks[0].ms, 30000);
  const renewal1 = intervalCallbacks[0].callback();
  const renewal2 = intervalCallbacks[0].callback();
  await flush();
  assert.equal(renewCount, 1);
  renewGate.resolve(successfulCompositeResult());
  await Promise.all([renewal1, renewal2]);
  sendGate.resolve();
  assert.equal(await pending, true);
  assert.deepEqual(cleared, ["renew-timer"]);
  const renew = calls.find(({ name }) => name === "renew_engine_command_lease");
  assert.deepEqual(renew.body, {
    target_command_id: "command-1",
    target_lease_token: "lease-1",
    lease_seconds: 60,
  });
});

test("renew vazio durante mark bloqueia efeitos posteriores e conclusao", async () => {
  const calls = [];
  const markGate = deferred();
  let intervalCallback;
  const session = createSession(23);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return [leasedCommand()];
        if (name === "mark_engine_command_effect_started") return markGate.promise;
        if (name === "renew_engine_command_lease") return [];
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => calls.push({ name: "sendText" }),
    setIntervalFn(callback) { intervalCallback = callback; return "timer"; },
    clearIntervalFn() {},
    logger: createLogger(),
  });

  const pending = worker.runOnce(23);
  await flush();
  await intervalCallback();
  markGate.resolve(successfulCompositeResult());
  assert.equal(await pending, true);
  assert.equal(calls.some(({ name }) => name === "sendText"), false);
  assert.equal(calls.some(({ name }) => name === "complete_engine_command"), false);
});

test("refresh_status marca efeito antes dos auxiliares e conclui sucesso", async () => {
  const calls = [];
  const session = createSession(24);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return [leasedCommand({ type: "refresh_status", payload: {} })];
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => {},
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(24), true);
  assert.deepEqual(calls.map(({ name }) => name), [
    "claim_engine_commands",
    "mark_engine_command_effect_started",
    "update_instance_status",
    "record_engine_event",
    "complete_engine_command",
  ]);
  assert.equal(calls.at(-1).body.success, true);
  for (const call of calls.filter(({ name }) => [
    "mark_engine_command_effect_started",
    "update_instance_status",
    "record_engine_event",
    "complete_engine_command",
  ].includes(name))) {
    assert.equal(call.body.target_command_id, "command-1");
    assert.equal(call.body.target_lease_token, "lease-1");
  }
});

test("refresh_status com falha de efeito principal conclui como uncertain", async () => {
  const calls = [];
  const session = createSession(26);
  const worker = createSupabaseCommandWorker({
    enabled: true,
    client: {
      async rpc(name, body) {
        calls.push({ name, body });
        if (name === "claim_engine_commands") return [leasedCommand({ type: "refresh_status", payload: {} })];
        if (name === "update_instance_status") throw new Error("status indisponivel");
        return successfulCompositeResult();
      },
    },
    getSession: () => session,
    sendText: async () => {},
    logger: createLogger(),
  });

  assert.equal(await worker.runOnce(26), true);
  assert.deepEqual(calls.map(({ name }) => name), [
    "claim_engine_commands",
    "mark_engine_command_effect_started",
    "update_instance_status",
    "complete_engine_command",
  ]);
  assert.equal(calls.at(-1).body.success, false);
  assert.equal(calls.at(-1).body.target_failure_kind, "uncertain");
  assert.equal(calls.at(-1).body.retry_delay_seconds, 0);
});

test("boundedInteger aplica default e limites do lease", () => {
  assert.equal(boundedInteger(undefined, 60, 15, 900), 60);
  assert.equal(boundedInteger(null, 60, 15, 900), 60);
  assert.equal(boundedInteger("invalid", 60, 15, 900), 60);
  assert.equal(boundedInteger("1", 60, 15, 900), 15);
  assert.equal(boundedInteger("1200", 60, 15, 900), 900);
  assert.equal(boundedInteger("90", 60, 15, 900), 90);
});

test("entrypoint valida a geracao dentro da fila e associa start e stop a sessao", () => {
  const source = readFileSync(require.resolve("./index.js"), "utf8");
  const senderSource = readFileSync(require.resolve("./queued-text-sender.js"), "utf8");
  assert.match(source, /createQueuedTextSender\(queue,\s*\{\s*resolveMentions\s*\}\)/);
  assert.match(senderSource, /assertActive\?\.\(\)[\s\S]*?sock\.sendMessage/);
  assert.match(source, /getSession:\s*\(\)\s*=>\s*currentSession\?\.state\s*===\s*["']ready["']/);
  assert.match(source, /supabaseCommandWorker\.start\(session\.generation\)/);
  assert.match(source, /supabaseCommandWorker\.stop\(session\.generation\)/);
  assert.match(source, /supabaseCommandWorkerStarted\s*=\s*supabaseCommandWorker\.getActiveGeneration\(\)\s*===\s*session\.generation/);
});

test("suite da engine inclui os testes do worker", () => {
  const pkg = JSON.parse(readFileSync(require.resolve("./package.json"), "utf8"));
  assert.match(pkg.scripts.test, /test-command-worker\.js/);
});
