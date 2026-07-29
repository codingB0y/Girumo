/**
 * Entrypoint do worker (F3b + executor de automações).
 *
 * Três loops no mesmo ciclo de poll:
 *  - drena `engine_events` e grava leads via upsert_lead (não envia mensagem
 *    — escopo SÓ GRUPOS da F3); ao capturar um lead, já dispara `lead_entered`;
 *  - avança runs de `automation_runs` um passo por vez (camada 1 do plano);
 *  - a cada SCAN_INTERVAL_MS (bem mais raro que o poll), varre `group_full`,
 *    `group_stalled` e `weekly_recurring` — os três gatilhos que não nascem
 *    de um evento, então só têm como saber "aconteceu" varrendo o banco.
 * Plano completo em docs/superpowers/plans/2026-07-29-automations-executor.md.
 */

import { makeAutomationDeps, runAutomationsTick } from "./automations-loop.js";
import { makeScanDeps, runAutomationScansTick } from "./automation-scans.js";
import { loadEnv } from "./env.js";
import { makeDeps, runTick } from "./event-loop.js";
import { startHealthServer, type HealthState } from "./health.js";
import { log } from "./log.js";
import { createSupabaseClient } from "./supabase.js";

// Varredura de grupos não precisa da cadência do tick de fila (poll_ms, tipicamente
// 3s) — rodar `groups`/`leads` inteiro nessa frequência seria puro desperdício,
// já que o dedupe_key faz o reenvio ser sempre um no-op mesmo se rodasse toda hora.
const SCAN_INTERVAL_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceKey);
  const deps = makeDeps(supabase);
  const automationDeps = makeAutomationDeps(supabase);
  const scanDeps = makeScanDeps(supabase);
  let lastScanAt = 0;

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
      const automationsSummary = await runAutomationsTick(
        supabase,
        automationDeps,
        env.batchSize,
        env.requeueAfterSeconds,
      );
      state.lastTickAt = Date.now();
      state.healthy = true;
      state.lastError = null;
      if (summary.claimed > 0) {
        log.info("ciclo", summary);
      }
      if (automationsSummary.claimed > 0) {
        log.info("ciclo automacoes", automationsSummary);
      }

      if (Date.now() - lastScanAt >= SCAN_INTERVAL_MS) {
        lastScanAt = Date.now();
        const scansSummary = await runAutomationScansTick(scanDeps);
        const totalCreated =
          scansSummary.groupFullCreated + scansSummary.groupStalledCreated + scansSummary.weeklyRecurringCreated;
        if (totalCreated > 0) {
          log.info("varredura de gatilhos", scansSummary);
        }
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
