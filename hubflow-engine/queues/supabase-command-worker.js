const {
  boundedInteger,
  hasSupabaseEngineConfig,
  optionalEnv,
  requireEnv,
} = require("../config/env.js");

class WorkerRunAbortedError extends Error {
  constructor(generation) {
    super(`Supabase command worker generation ${generation} is no longer active`);
    this.name = "WorkerRunAbortedError";
    this.code = "ENGINE_WORKER_RUN_ABORTED";
    this.generation = generation;
    this.retryable = false;
  }
}

class LeaseLostError extends Error {
  constructor(commandId, operation) {
    super(`Lease do comando ${commandId} perdido durante ${operation}`);
    this.name = "LeaseLostError";
    this.code = "ENGINE_COMMAND_LEASE_LOST";
    this.commandId = commandId;
    this.operation = operation;
    this.retryable = false;
  }
}

class PermanentCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermanentCommandError";
    this.retryable = false;
  }
}

function abortableSleep(ms, signal, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeoutFn(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    timer = setTimeoutFn(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

function createSupabaseRestClient() {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  async function request(path, { method = "GET", body } = {}) {
    const response = await fetch(`${baseUrl}/rest/v1${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Supabase ${method} ${path} falhou: ${response.status} ${text}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  return {
    rpc(name, body) {
      return request(`/rpc/${name}`, { method: "POST", body });
    },
  };
}

function toWhatsAppJid(payload) {
  if (payload.jid) return String(payload.jid);
  if (payload.phone) {
    const digits = String(payload.phone).replace(/\D/g, "");
    if (digits) return `${digits}@s.whatsapp.net`;
  }
  return null;
}

function compositeRow(result) {
  if (Array.isArray(result)) return result.length > 0 ? result[0] : null;
  return result && typeof result === "object" ? result : null;
}

function leaseBody(command) {
  return {
    target_command_id: command.command_id,
    target_lease_token: command.lease_token,
  };
}

function hasLeaseMetadata(command) {
  return Boolean(
    command &&
    command.command_id &&
    command.lease_token &&
    Number.isInteger(command.attempt_count) &&
    command.attempt_count > 0,
  );
}

function retryDelayForAttempt(attemptCount, baseSeconds) {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 10));
  return Math.min(baseSeconds * (2 ** exponent), 3600);
}

function createSupabaseCommandWorker({
  enabled = hasSupabaseEngineConfig(),
  client,
  getSession,
  sendText,
  logger = console,
  sleep = abortableSleep,
  pollMs = Number(optionalEnv("ENGINE_COMMAND_POLL_MS") ?? 3000),
  batchSize = Number(optionalEnv("ENGINE_COMMAND_BATCH_SIZE") ?? 5),
  leaseSeconds = boundedInteger(optionalEnv("ENGINE_COMMAND_LEASE_SECONDS"), 60, 15, 900),
  retryDelaySeconds = 30,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (!enabled) {
    return {
      getActiveGeneration: () => null,
      runOnce: async () => false,
      start() {
        logger.log("Supabase engine worker desativado: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.");
        return false;
      },
      stop: () => false,
    };
  }

  const supabase = client ?? createSupabaseRestClient();
  let activeRun = null;

  function isRunCurrent(run) {
    if (!run || activeRun !== run || run.signal.aborted) return false;
    const session = getSession?.();
    return Boolean(
      session &&
      session.generation === run.generation &&
      session.isActive?.(),
    );
  }

  function assertRunActive(run) {
    if (!isRunCurrent(run)) throw new WorkerRunAbortedError(run?.generation);
    return getSession();
  }

  function isObsolete(run, error) {
    return error instanceof WorkerRunAbortedError || !isRunCurrent(run);
  }

  function isLeaseLost(error) {
    return error instanceof LeaseLostError;
  }

  function logInfo(entry) {
    const write = logger.info ?? logger.log;
    if (typeof write === "function") write.call(logger, entry);
  }

  function commandTelemetry(run, command, outcome) {
    return {
      event: "engine_command_outcome",
      generation: run.generation,
      command_id: command.command_id,
      attempt_count: command.attempt_count,
      outcome,
    };
  }

  async function rpc(run, name, body) {
    assertRunActive(run);
    const result = await supabase.rpc(name, body);
    assertRunActive(run);
    return result;
  }

  async function recordEvent(run, command, type, payload = {}) {
    if (!command.tenant_id || !command.instance_id) return;
    await fencedRpc(run, command, "record_engine_event", {
      target_tenant_id: command.tenant_id,
      target_instance_id: command.instance_id,
      target_type: type,
      target_payload: payload,
    });
  }

  async function updateInstance(run, command, status, payload = {}) {
    if (!command.tenant_id || !command.instance_id) return;
    await fencedRpc(run, command, "update_instance_status", {
      target_tenant_id: command.tenant_id,
      target_instance_id: command.instance_id,
      target_status: status,
      target_phone: payload.phone ?? null,
      target_qr_code: payload.qr_code ?? null,
      target_engine_node: payload.engine_node ?? null,
      target_metadata: payload.metadata ?? {},
    });
  }

  async function fencedRpc(run, command, name, body = {}) {
    const result = await rpc(run, name, { ...leaseBody(command), ...body });
    if (!compositeRow(result)) throw new LeaseLostError(command.command_id, name);
    return result;
  }

  async function complete(
    run,
    command,
    success,
    errorMessage = null,
    failureKind = "retryable",
    retryDelay = retryDelaySeconds,
  ) {
    await fencedRpc(run, command, "complete_engine_command", {
      success,
      error_message: errorMessage,
      target_failure_kind: failureKind,
      retry_delay_seconds: retryDelay,
    });
  }

  async function withLeaseRenewal(command, run, task) {
    let renewalPromise = null;
    let renewalError = null;
    const intervalMs = Math.max(1000, Math.floor(leaseSeconds * 1000 / 2));

    const renew = () => {
      if (renewalPromise) return renewalPromise;
      renewalPromise = (async () => {
        assertRunActive(run);
        await fencedRpc(run, command, "renew_engine_command_lease", {
          lease_seconds: leaseSeconds,
        });
        assertRunActive(run);
        // Renovação OK limpa erro transitório anterior (blip de rede). Se o lease
        // foi de fato perdido, o próximo fencedRpc re-lança e renewalError persiste.
        renewalError = null;
      })()
        .catch((error) => {
          renewalError = error;
        })
        .finally(() => {
          renewalPromise = null;
        });
      return renewalPromise;
    };

    const assertLeaseActive = () => {
      assertRunActive(run);
      if (renewalError) throw renewalError;
      return getSession();
    };

    const interval = setIntervalFn(renew, intervalMs);
    try {
      return await task(assertLeaseActive);
    } finally {
      clearIntervalFn(interval);
      if (renewalPromise) await renewalPromise;
    }
  }

  async function failSoft(run, operation) {
    try {
      await operation();
    } catch (error) {
      if (isObsolete(run, error) || isLeaseLost(error)) throw error;
      logger.error(`Efeito auxiliar do worker falhou: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function recordCommandLifecycle(run, command, type, outcome = null) {
    const payload = {
      command_id: command.command_id,
      attempt_count: command.attempt_count,
    };
    if (outcome) payload.outcome = outcome;
    await failSoft(run, () => recordEvent(run, command, type, payload));
  }

  async function executeCommand(run, command, assertLeaseActive) {
    let effectStarted = false;
    try {
      const session = assertLeaseActive();
      const sock = session.sock;
      const payload = command.payload ?? {};

      if (!sock?.user) throw new Error("WhatsApp nao conectado.");

      if (command.type === "send_message") {
        const jid = toWhatsAppJid(payload);
        const text = payload.text || payload.message || payload.body;
        if (!jid || !text) {
          throw new PermanentCommandError("send_message exige payload.jid ou payload.phone e payload.text.");
        }

        await fencedRpc(run, command, "mark_engine_command_effect_started");
        effectStarted = true;
        assertLeaseActive();
        await recordCommandLifecycle(run, command, "engine_command_started");
        assertLeaseActive();
        await sendText(sock, jid, String(text), {
          session,
          assertActive: assertLeaseActive,
        });
        assertLeaseActive();
        await failSoft(run, () => updateInstance(run, command, "connected", {
          metadata: { last_command: "send_message", whatsapp_user: sock.user?.id ?? null },
        }));
        assertLeaseActive();
        await failSoft(run, () => recordEvent(run, command, "message_sent", {
          jid,
          text_length: String(text).length,
        }));
      } else if (command.type === "refresh_status") {
        await fencedRpc(run, command, "mark_engine_command_effect_started");
        effectStarted = true;
        assertLeaseActive();
        await recordCommandLifecycle(run, command, "engine_command_started");
        assertLeaseActive();
        await updateInstance(run, command, "connected", {
          metadata: { whatsapp_user: sock.user?.id ?? null },
        });
        assertLeaseActive();
        await recordEvent(run, command, "instance_status", {
          status: "connected",
          whatsapp_user: sock.user?.id ?? null,
        });
      } else {
        throw new PermanentCommandError(`Comando de engine nao suportado: ${command.type}`);
      }

      assertLeaseActive();
      await recordCommandLifecycle(run, command, "engine_command_completion_requested", "success");
      assertLeaseActive();
      await complete(run, command, true);
      logInfo(commandTelemetry(run, command, "success"));
      return true;
    } catch (error) {
      if (isObsolete(run, error) || isLeaseLost(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Falha no comando ${command.command_id}: ${message}`);
      assertLeaseActive();
      if (effectStarted) {
        await recordCommandLifecycle(run, command, "engine_command_completion_requested", "uncertain");
        assertLeaseActive();
        await complete(run, command, false, message, "uncertain", 0);
        logInfo(commandTelemetry(run, command, "uncertain"));
      } else {
        const failureKind = error?.retryable === false ? "permanent" : "retryable";
        await recordCommandLifecycle(run, command, "engine_command_failed", failureKind);
        assertLeaseActive();
        await complete(
          run,
          command,
          false,
          message,
          failureKind,
          failureKind === "retryable" ? retryDelayForAttempt(command.attempt_count, retryDelaySeconds) : 0,
        );
        logInfo(commandTelemetry(run, command, failureKind));
      }
      return true;
    }
  }

  async function processCommand(run, command) {
    if (!hasLeaseMetadata(command)) {
      logger.error("Comando ignorado: command_id, lease_token e attempt_count validos sao obrigatorios.");
      return true;
    }

    try {
      return await withLeaseRenewal(
        command,
        run,
        (assertLeaseActive) => executeCommand(run, command, assertLeaseActive),
      );
    } catch (error) {
      if (isObsolete(run, error)) return false;
      if (isLeaseLost(error)) {
        logger.error(error.message);
        return true;
      }
      throw error;
    }
  }

  async function executeTick(run) {
    const claimResult = await rpc(run, "claim_engine_commands", {
      max_commands: batchSize,
      lease_seconds: leaseSeconds,
    });
    const commands = Array.isArray(claimResult)
      ? claimResult
      : (compositeRow(claimResult) ? [claimResult] : []);
    if (commands.length > 0) {
      logger.log(`Engine Supabase: ${commands.length} comando(s) recebido(s).`);
    }

    for (const command of commands ?? []) {
      assertRunActive(run);
      if (!await processCommand(run, command)) return false;
    }
    return true;
  }

  function tick(run) {
    if (run.tickPromise) return run.tickPromise;
    const operation = executeTick(run).catch((error) => {
      if (isObsolete(run, error)) return false;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Engine Supabase worker: ${message}`);
      run.nextDelayMs = Math.min(pollMs * 2, 15000);
      return true;
    });
    run.tickPromise = operation;
    operation.finally(() => {
      if (run.tickPromise === operation) run.tickPromise = null;
    });
    return operation;
  }

  async function loop(run) {
    while (isRunCurrent(run)) {
      await tick(run);
      if (!isRunCurrent(run)) return;
      const delayMs = run.nextDelayMs ?? pollMs;
      run.nextDelayMs = null;
      try {
        await sleep(delayMs, run.signal);
      } catch (error) {
        if (!isObsolete(run, error)) throw error;
      }
    }
  }

  function stop(generation) {
    if (!activeRun || (generation !== undefined && activeRun.generation !== generation)) return false;
    const run = activeRun;
    activeRun = null;
    run.controller.abort();
    return true;
  }

  function createRun(generation) {
    const controller = new AbortController();
    return {
      generation,
      controller,
      signal: controller.signal,
      tickPromise: null,
      loopPromise: null,
      nextDelayMs: null,
    };
  }

  function start(generation) {
    if (activeRun?.generation === generation && !activeRun.signal.aborted) return false;
    stop();
    const run = createRun(generation);
    activeRun = run;
    logger.log("Engine Supabase worker iniciado.");
    run.loopPromise = loop(run).catch((error) => {
      if (!isObsolete(run, error)) logger.error("Engine Supabase worker parado:", error);
    });
    return true;
  }

  async function runOnce(generation) {
    if (activeRun?.generation === generation && !activeRun.signal.aborted) {
      return tick(activeRun);
    }
    stop();
    const run = createRun(generation);
    activeRun = run;
    try {
      return await tick(run);
    } finally {
      if (activeRun === run) {
        activeRun = null;
        run.controller.abort();
      }
    }
  }

  return {
    getActiveGeneration: () => activeRun?.generation ?? null,
    runOnce,
    start,
    stop,
  };
}

module.exports = {
  LeaseLostError,
  PermanentCommandError,
  WorkerRunAbortedError,
  abortableSleep,
  compositeRow,
  createSupabaseCommandWorker,
  leaseBody,
};
