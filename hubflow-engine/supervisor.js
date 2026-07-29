/**
 * Supervisor multi-tenant — spawna e monitora N instâncias da engine (1 por número).
 * Cada instância é um child_process.fork do index.js com env próprio.
 * O supervisor:
 *  - Poll Supabase para descobrir instâncias ativas (tabela whatsapp_instances)
 *  - Spawna/mata processos conforme necessário
 *  - Health check periódico (HTTP /health de cada child)
 *  - Restart automático com backoff
 *  - Expõe /supervisor/health com status agregado
 *
 * Uso: ENGINE_MODE=supervisor node supervisor.js
 * Cada child roda com: ENGINE_MODE=worker INSTANCE_ID=xxx
 *
 * Sem Redis, sem K8s — só fork + Supabase.
 */

const { fork } = require("child_process");
const path = require("path");
const express = require("express");

const POLL_INTERVAL_MS = Number(process.env.SUPERVISOR_POLL_MS ?? 15_000);
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BACKOFF_BASE_MS = 3000;
const CHILD_ENTRY = path.join(__dirname, "index.js");

// Estado das instâncias gerenciadas
const instances = new Map(); // instanceId -> { process, status, restarts, lastStart, env }

function log(msg) {
  console.log(`[supervisor] ${new Date().toISOString()} ${msg}`);
}

/**
 * Spawna um child process para uma instância WhatsApp.
 */
function spawnInstance(instanceId, envOverrides = {}) {
  const existing = instances.get(instanceId);
  if (existing?.process && !existing.process.killed) {
    log(`⚠️  ${instanceId} já rodando (pid ${existing.process.pid}). Ignorando.`);
    return;
  }

  const childEnv = {
    ...process.env,
    ENGINE_MODE: "worker",
    INSTANCE_ID: instanceId,
    // Cada instância usa auth dir próprio para isolamento de sessão
    AUTH_DIR: path.join(__dirname, "auth", instanceId),
    ENGINE_STATE_FILE: path.join(__dirname, `engine-state-${instanceId}.json`),
    // Porta 0 = OS atribui (ou desabilita HTTP no child se não precisar)
    PORT: "0",
    ...envOverrides,
  };

  const child = fork(CHILD_ENTRY, [], {
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  const state = {
    process: child,
    status: "starting",
    restarts: existing?.restarts ?? 0,
    lastStart: Date.now(),
    instanceId,
    pid: child.pid,
  };
  instances.set(instanceId, state);

  // Log do child com prefixo
  child.stdout?.on("data", (d) => {
    for (const line of d.toString().split("\n").filter(Boolean)) {
      console.log(`[${instanceId}] ${line}`);
    }
  });
  child.stderr?.on("data", (d) => {
    for (const line of d.toString().split("\n").filter(Boolean)) {
      console.error(`[${instanceId}:err] ${line}`);
    }
  });

  // IPC: child reporta status
  child.on("message", (msg) => {
    if (msg?.type === "status") {
      state.status = msg.status; // "connected", "disconnected", "qr_waiting"
    }
  });

  child.on("exit", (code, signal) => {
    log(`💀 ${instanceId} (pid ${state.pid}) saiu: code=${code} signal=${signal}`);
    state.status = "exited";
    state.process = null;

    // Restart automático com backoff
    if (state.restarts < MAX_RESTART_ATTEMPTS) {
      state.restarts++;
      const delay = RESTART_BACKOFF_BASE_MS * 2 ** (state.restarts - 1);
      log(`🔄 Restart ${state.restarts}/${MAX_RESTART_ATTEMPTS} de ${instanceId} em ${Math.round(delay / 1000)}s...`);
      setTimeout(() => spawnInstance(instanceId, envOverrides), delay);
    } else {
      log(`🛑 ${instanceId} excedeu restarts (${MAX_RESTART_ATTEMPTS}). Marcando como dead.`);
      state.status = "dead";
    }
  });

  log(`🚀 ${instanceId} spawned (pid ${child.pid})`);
}

/**
 * Para uma instância gracefully (SIGTERM → timeout → SIGKILL).
 */
function stopInstance(instanceId) {
  const state = instances.get(instanceId);
  if (!state?.process || state.process.killed) {
    instances.delete(instanceId);
    return;
  }
  log(`🛑 Parando ${instanceId} (pid ${state.pid})...`);
  state.process.kill("SIGTERM");
  // Force kill após 10s se não sair
  setTimeout(() => {
    if (state.process && !state.process.killed) {
      log(`⚠️  ${instanceId} não saiu em 10s. SIGKILL.`);
      state.process.kill("SIGKILL");
    }
  }, 10_000);
}

/**
 * Reconcilia instâncias ativas (do Supabase) com processos rodando.
 * Spawna novos, mata os que não devem mais existir.
 */
async function reconcile(activeInstances) {
  const activeIds = new Set(activeInstances.map((i) => i.id));

  // Spawnar instâncias novas
  for (const inst of activeInstances) {
    if (!instances.has(inst.id) || instances.get(inst.id).status === "dead") {
      // Reset restarts para instância nova ou re-ativada
      if (instances.has(inst.id)) instances.get(inst.id).restarts = 0;
      spawnInstance(inst.id, inst.env ?? {});
    }
  }

  // Matar instâncias que não estão mais ativas
  for (const [id] of instances) {
    if (!activeIds.has(id)) {
      stopInstance(id);
      instances.delete(id);
    }
  }
}

/**
 * Busca instâncias ativas no Supabase. Retorna [{id, env}].
 * Fallback: se SUPABASE não configurado, usa INSTANCE_IDS env (comma-separated).
 */
async function fetchActiveInstances() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/rest/v1/whatsapp_instances?status=eq.active&select=id,config`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        }
      );
      if (res.ok) {
        const rows = await res.json();
        return rows.map((r) => ({ id: r.id, env: r.config ?? {} }));
      }
      log(`⚠️  Supabase respondeu ${res.status} ao buscar instâncias.`);
    } catch (err) {
      log(`⚠️  Falha ao buscar instâncias do Supabase: ${err.message}`);
    }
  }

  // Fallback: env-based (dev local)
  const ids = (process.env.INSTANCE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.map((id) => ({ id, env: {} }));
}

// === Health endpoint agregado ===
const app = express();
const SUPERVISOR_PORT = Number(process.env.SUPERVISOR_PORT ?? 3010);

app.get("/supervisor/health", (req, res) => {
  const summary = [];
  for (const [id, state] of instances) {
    summary.push({
      instanceId: id,
      status: state.status,
      pid: state.pid,
      restarts: state.restarts,
      uptime: state.lastStart ? Math.round((Date.now() - state.lastStart) / 1000) : 0,
    });
  }
  const allHealthy = summary.every((s) => s.status === "connected");
  res.status(allHealthy ? 200 : 207).json({
    ok: allHealthy,
    instances: summary,
    total: summary.length,
    healthy: summary.filter((s) => s.status === "connected").length,
  });
});

app.post("/supervisor/restart/:id", (req, res) => {
  const id = req.params.id;
  const state = instances.get(id);
  if (!state) return res.status(404).json({ error: "Instance not found" });
  state.restarts = 0; // reset backoff
  stopInstance(id);
  // O exit handler vai re-spawnar
  res.json({ ok: true, message: `Restarting ${id}` });
});

// === Main loop ===
async function main() {
  log("Supervisor iniciando...");
  app.listen(SUPERVISOR_PORT, "0.0.0.0", () => {
    log(`Health endpoint em :${SUPERVISOR_PORT}/supervisor/health`);
  });

  // Poll inicial
  const active = await fetchActiveInstances();
  if (active.length === 0) {
    log("⚠️  Nenhuma instância ativa encontrada. Aguardando...");
  }
  await reconcile(active);

  // Poll periódico: descobre novas instâncias / remove desativadas
  setInterval(async () => {
    try {
      const active = await fetchActiveInstances();
      await reconcile(active);
    } catch (err) {
      log(`⚠️  Erro no poll de instâncias: ${err.message}`);
    }
  }, POLL_INTERVAL_MS);
}

// Graceful shutdown: para todos os children
function shutdownAll() {
  log("Supervisor desligando — parando todas as instâncias...");
  for (const [id] of instances) stopInstance(id);
  setTimeout(() => process.exit(0), 12_000); // dá tempo pro SIGTERM
}
process.on("SIGINT", shutdownAll);
process.on("SIGTERM", shutdownAll);

main().catch((err) => {
  console.error("Supervisor erro fatal:", err);
  process.exit(1);
});
