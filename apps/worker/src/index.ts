/**
 * Entrypoint do worker de captura de leads (F3b).
 *
 * Faz uma coisa só: drena `engine_events` e grava leads via upsert_lead. Não
 * envia mensagem nenhuma (escopo SÓ GRUPOS da F3). O envio anti-ban entra na F4.
 */

import { loadEnv } from "./env.js";
import { makeDeps, runTick } from "./event-loop.js";
import { startHealthServer, type HealthState } from "./health.js";
import { log } from "./log.js";
import { createSupabaseClient } from "./supabase.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceKey);
  const deps = makeDeps(supabase);

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
