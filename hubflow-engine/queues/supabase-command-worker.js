const { hasSupabaseEngineConfig, optionalEnv, requireEnv } = require("../config/env.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function createSupabaseCommandWorker({ getSocket, sendText, logger = console } = {}) {
  if (!hasSupabaseEngineConfig()) {
    return {
      start() {
        logger.log("Supabase engine worker desativado: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.");
      },
      stop() {},
    };
  }

  const supabase = createSupabaseRestClient();
  const pollMs = Number(optionalEnv("ENGINE_COMMAND_POLL_MS") ?? 3000);
  const batchSize = Number(optionalEnv("ENGINE_COMMAND_BATCH_SIZE") ?? 5);
  let stopped = true;
  let running = false;

  async function recordEvent(command, type, payload = {}) {
    if (!command.tenant_id || !command.instance_id) return;
    await supabase.rpc("record_engine_event", {
      target_tenant_id: command.tenant_id,
      target_instance_id: command.instance_id,
      target_type: type,
      target_payload: payload,
    });
  }

  async function updateInstance(command, status, payload = {}) {
    if (!command.tenant_id || !command.instance_id) return;
    await supabase.rpc("update_instance_status", {
      target_tenant_id: command.tenant_id,
      target_instance_id: command.instance_id,
      target_status: status,
      target_phone: payload.phone ?? null,
      target_qr_code: payload.qr_code ?? null,
      target_engine_node: payload.engine_node ?? null,
      target_metadata: payload.metadata ?? {},
    });
  }

  async function complete(command, success, errorMessage = null) {
    await supabase.rpc("complete_engine_command", {
      target_command_id: command.command_id,
      success,
      error_message: errorMessage,
    });
  }

  async function handleCommand(command) {
    const sock = getSocket?.();
    const payload = command.payload ?? {};

    if (!sock?.user) {
      throw new Error("WhatsApp nao conectado.");
    }

    if (command.type === "send_message") {
      const jid = toWhatsAppJid(payload);
      const text = payload.text || payload.message || payload.body;
      if (!jid || !text) throw new Error("send_message exige payload.jid ou payload.phone e payload.text.");
      await sendText(sock, jid, String(text));
      await updateInstance(command, "connected", {
        metadata: { last_command: "send_message", whatsapp_user: sock.user?.id ?? null },
      });
      await recordEvent(command, "message_sent", { jid, text_length: String(text).length });
      return;
    }

    if (command.type === "refresh_status") {
      await updateInstance(command, "connected", {
        metadata: { whatsapp_user: sock.user?.id ?? null },
      });
      await recordEvent(command, "instance_status", {
        status: "connected",
        whatsapp_user: sock.user?.id ?? null,
      });
      return;
    }

    throw new Error(`Comando de engine nao suportado: ${command.type}`);
  }

  async function tick() {
    if (running || stopped) return;
    running = true;

    try {
      const commands = await supabase.rpc("claim_engine_commands", { max_commands: batchSize });
      if (Array.isArray(commands) && commands.length > 0) {
        logger.log(`Engine Supabase: ${commands.length} comando(s) recebido(s).`);
      }

      for (const command of commands ?? []) {
        try {
          await handleCommand(command);
          await complete(command, true);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Falha no comando ${command.command_id}: ${message}`);
          await updateInstance(command, "error", { metadata: { last_error: message } }).catch(() => {});
          await recordEvent(command, "engine_error", { command_id: command.command_id, error: message });
          await complete(command, false, message);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Engine Supabase worker: ${message}`);
      await sleep(Math.min(pollMs * 2, 15000));
    } finally {
      running = false;
    }
  }

  async function loop() {
    while (!stopped) {
      await tick();
      await sleep(pollMs);
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      logger.log("Engine Supabase worker iniciado.");
      loop().catch((error) => logger.error("Engine Supabase worker parado:", error));
    },
    stop() {
      stopped = true;
    },
  };
}

module.exports = {
  createSupabaseCommandWorker,
};
