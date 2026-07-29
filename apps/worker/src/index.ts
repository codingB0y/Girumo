/**
 * Entrypoint do worker.
 *
 * Dois loops sobre a mesma cadência de poll:
 *   - captura (F3): drena `engine_events` → grava leads via upsert_lead;
 *   - envio (F4): drena `engine_commands` (send_message) → Evolution API, com o
 *     anti-ban aplicado no claim (claim_send_commands) e no record_send.
 *
 * O loop de envio só liga se EVOLUTION_API_URL/KEY existirem — senão o worker
 * roda só a captura (mesma postura fail-safe do worker legado sem config).
 */

import { loadEnv, type WorkerEnv } from "./env.js";
import { createEvolutionSender } from "./evolution-sender.js";
import { makeDeps, runTick } from "./event-loop.js";
import { startHealthServer, type HealthState } from "./health.js";
import { log } from "./log.js";
import type { SendDeps } from "./send-command.js";
import { makeSendDeps, pruneSends, runSendTick } from "./send-loop.js";
import { createSupabaseClient } from "./supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PRUNE_INTERVAL_MS = 3_600_000; // poda o log de envios ~1×/hora

/** Cria as deps de envio se a Evolution estiver configurada; senão null (sender off). */
function buildSendDeps(env: WorkerEnv, supabase: SupabaseClient): SendDeps | null {
  if (!env.evolutionApiUrl || !env.evolutionApiKey) {
    log.warn("loop de envio desligado: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes");
    return null;
  }
  const sender = createEvolutionSender({ baseUrl: env.evolutionApiUrl, apiKey: env.evolutionApiKey });
  return makeSendDeps(supabase, sender);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceKey);
  const deps = makeDeps(supabase);

  const sendDeps = buildSendDeps(env, supabase);
  let lastPruneAt = 0;

  const state: HealthState = { healthy: true, lastTickAt: null, lastError: null };
  const server = startHealthServer(env.healthPort, () => state);

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("encerrando", { signal });
    server.close();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  log.info("worker iniciado", {
    poll_ms: env.pollMs,
    batch_size: env.batchSize,
    send_batch_size: env.sendBatchSize,
    sender: sendDeps ? "on" : "off",
    health_port: env.healthPort,
  });

  while (!stopping) {
    try {
      const summary = await runTick(supabase, deps, env.batchSize, env.requeueAfterSeconds);
      state.lastTickAt = Date.now();
      state.healthy = true;
      state.lastError = null;
      if (summary.claimed > 0) {
        log.info("ciclo", summary);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      state.healthy = false;
      state.lastError = message;
      log.error("ciclo falhou", { error: message });
    }

    // Loop de envio (F4), isolado do de captura: a falha de um não derruba o outro.
    if (!stopping && sendDeps) {
      try {
        const sent = await runSendTick(supabase, sendDeps, env.sendBatchSize);
        state.lastTickAt = Date.now();
        if (sent.claimed > 0) {
          log.info("ciclo de envio", sent);
        }
        const now = Date.now();
        if (now - lastPruneAt >= PRUNE_INTERVAL_MS) {
          lastPruneAt = now;
          const removed = await pruneSends(supabase);
          if (removed > 0) log.info("log de envios podado", { removed });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "erro desconhecido";
        state.healthy = false;
        state.lastError = message;
        log.error("ciclo de envio falhou", { error: message });
      }
    }

    // Sai já se um sinal chegou durante o tick, sem esperar o poll inteiro.
    if (stopping) break;
    await sleep(env.pollMs);
  }

  log.info("worker encerrado");
}

main().catch((err) => {
  log.error("fatal", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
