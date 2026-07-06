const { hasSupabaseEngineConfig, optionalEnv, requireEnv } = require("../config/env.js");

class WorkerRunAbortedError extends Error {
  constructor(generation) {
    super(`Supabase command worker generation ${generation} is no longer active`);
    this.name = "WorkerRunAbortedError";
    this.code = "ENGINE_WORKER_RUN_ABORTED";
    this.generation = generation;
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

function createSupabaseCommandWorker({
  enabled = hasSupabaseEngineConfig(),
  client,
  getSession,
  sendText,
  logger = console,
  sleep = abortableSleep,
  pollMs = Number(optionalEnv("ENGINE_COMMAND_POLL_MS") ?? 3000),
  batchSize = Number(optionalEnv("ENGINE_COMMAND_BATCH_SIZE") ?? 5),
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

  async function rpc(run, name, body) {
    assertRunActive(run);
    const result = await supabase.rpc(name, body);
    assertRunActive(run);
    return result;
  }

  async function recordEvent(run, command, type, payload = {}) {
    if (!command.tenant_id || !command.instance_id) return;
    await rpc(run, "record_engine_event", {
      target_tenant_id: command.tenant_id,
      target_instance_id: command.instance_id,
      target_type: type,
      target_payload: payload,
    });
  }

  async function updateInstance(run, command, status, payload = {}) {
    if (!command.tenant_id || !command.instance_id) return;
    await rpc(run, "update_instance_status", {
      target_tenant_id: command.tenant_id,
      target_instance_id: command.instance_id,
      target_status: status,
      target_phone: payload.phone ?? null,
      target_qr_code: payload.qr_code ?? null,
      target_engine_node: payload.engine_node ?? null,
      target_metadata: payload.metadata ?? {},
    });
  }

  async function complete(run, command, success, errorMessage = null) {
    await rpc(run, "complete_engine_command", {
      target_command_id: command.command_id,
      success,
      error_message: errorMessage,
    });
  }

  async function handleCommand(run, command) {
    const session = assertRunActive(run);
    const sock = session.sock;
    const payload = command.payload ?? {};

    if (!sock?.user) throw new Error("WhatsApp nao conectado.");

    if (command.type === "send_message") {
      const jid = toWhatsAppJid(payload);
      const text = payload.text || payload.message || payload.body;
      if (!jid || !text) throw new Error("send_message exige payload.jid ou payload.phone e payload.text.");
      assertRunActive(run);
      await sendText(sock, jid, String(text), {
        session,
        assertActive: () => assertRunActive(run),
      });
      assertRunActive(run);
      await updateInstance(run, command, "connected", {
        metadata: { last_command: "send_message", whatsapp_user: sock.user?.id ?? null },
      });
      assertRunActive(run);
      await recordEvent(run, command, "message_sent", { jid, text_length: String(text).length });
      return;
    }

    if (command.type === "refresh_status") {
      await updateInstance(run, command, "connected", {
        metadata: { whatsapp_user: sock.user?.id ?? null },
      });
      assertRunActive(run);
      await recordEvent(run, command, "instance_status", {
        status: "connected",
        whatsapp_user: sock.user?.id ?? null,
      });
      return;
    }

    throw new Error(`Comando de engine nao suportado: ${command.type}`);
  }

  async function processCommand(run, command) {
    try {
      await handleCommand(run, command);
      assertRunActive(run);
      await complete(run, command, true);
      return true;
    } catch (error) {
      if (isObsolete(run, error)) return false;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Falha no comando ${command.command_id}: ${message}`);
      try {
        try {
          await updateInstance(run, command, "error", { metadata: { last_error: message } });
        } catch (updateError) {
          if (isObsolete(run, updateError)) return false;
          // Compatibilidade: falha ao refletir status nao pode impedir evento/complete.
        }
        assertRunActive(run);
        await recordEvent(run, command, "engine_error", {
          command_id: command.command_id,
          error: message,
        });
        assertRunActive(run);
        await complete(run, command, false, message);
      } catch (reportError) {
        if (isObsolete(run, reportError)) return false;
        throw reportError;
      }
      return true;
    }
  }

  async function executeTick(run) {
    const commands = await rpc(run, "claim_engine_commands", { max_commands: batchSize });
    if (Array.isArray(commands) && commands.length > 0) {
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
  WorkerRunAbortedError,
  abortableSleep,
  createSupabaseCommandWorker,
};
