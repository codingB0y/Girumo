/**
 * Entrypoint do worker (F3b + executor de automações + envio da F4).
 *
 * Loops no mesmo ciclo de poll:
 *  - drena `engine_events` e grava leads via upsert_lead (não envia mensagem
 *    — escopo SÓ GRUPOS da F3); ao capturar um lead, já dispara `lead_entered`;
 *  - avança runs de `automation_runs` um passo por vez (camada 1 do plano);
 *  - a cada SCAN_INTERVAL_MS (bem mais raro que o poll), varre `group_full`,
 *    `group_stalled` e `weekly_recurring` — os três gatilhos que não nascem
 *    de um evento, então só têm como saber "aconteceu" varrendo o banco;
 *  - envio (F4): drena `engine_commands` (send_message/send_media/send_poll) →
 *    Evolution API, com o anti-ban aplicado no claim (claim_send_commands) e no
 *    record_send. Só liga se EVOLUTION_API_URL/KEY existirem — senão o worker
 *    roda sem enviar (mesma postura fail-safe do worker legado sem config).
 *    Mesmo configurado, o default é DRY-RUN: loga o que enviaria e não chama a
 *    Evolution até WORKER_SEND_ENABLED=true (ver send-dry-run.ts);
 *  - manutenção da fila: lease vencido, progresso de broadcast e agendamento.
 *    Roda SEMPRE, inclusive sem Evolution configurada (ver housekeeping.ts).
 *
 * Plano completo em docs/superpowers/plans/2026-07-29-automations-executor.md.
 */

import { makeAutomationDeps, runAutomationsTick } from "./automations-loop.js";
import { makeScanDeps, runAutomationScansTick } from "./automation-scans.js";
import { loadEnv, type WorkerEnv } from "./env.js";
import { createEvolutionSender } from "./evolution-sender.js";
import { makeDeps, runTick } from "./event-loop.js";
import { startHealthServer, type HealthState } from "./health.js";
import { housekeepingDidWork, runHousekeeping } from "./housekeeping.js";
import { log } from "./log.js";
import type { SendDeps } from "./send-command.js";
import { withDryRun } from "./send-dry-run.js";
import { makeSendDeps, runSendTick } from "./send-loop.js";
import { createSupabaseClient } from "./supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Varredura de grupos não precisa da cadência do tick de fila (poll_ms, tipicamente
// 3s) — rodar `groups`/`leads` inteiro nessa frequência seria puro desperdício,
// já que o dedupe_key faz o reenvio ser sempre um no-op mesmo se rodasse toda hora.
const SCAN_INTERVAL_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PRUNE_INTERVAL_MS = 3_600_000; // poda o log de envios ~1×/hora

/**
 * Cria as deps de envio se a Evolution estiver configurada; senão null (sender off).
 *
 * Com `WORKER_SEND_ENABLED != true` (o default) devolve as deps embrulhadas em
 * dry-run: o loop roda inteiro e loga o que enviaria, sem chamar a Evolution.
 */
function buildSendDeps(env: WorkerEnv, supabase: SupabaseClient): SendDeps | null {
  if (!env.evolutionApiUrl || !env.evolutionApiKey) {
    log.warn("loop de envio desligado: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes");
    return null;
  }
  const sender = createEvolutionSender({ baseUrl: env.evolutionApiUrl, apiKey: env.evolutionApiKey });
  const deps = makeSendDeps(supabase, sender);

  if (!env.sendEnabled) {
    log.warn("loop de envio em DRY-RUN: nada sai de verdade (WORKER_SEND_ENABLED != true)");
    return withDryRun(deps);
  }
  log.info("loop de envio ATIVO: mensagens serão enviadas de verdade");
  return deps;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceKey);
  const deps = makeDeps(supabase);
  const automationDeps = makeAutomationDeps(supabase);
  const scanDeps = makeScanDeps(supabase);
  let lastScanAt = 0;

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
    sender: sendDeps ? (env.sendEnabled ? "on" : "dry-run") : "off",
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

    // Loop de envio (F4), isolado do de captura: a falha de um não derruba o outro.
    if (!stopping && sendDeps) {
      try {
        const sent = await runSendTick(supabase, sendDeps, env.sendBatchSize);
        state.lastTickAt = Date.now();
        if (sent.claimed > 0) {
          log.info("ciclo de envio", sent);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "erro desconhecido";
        state.healthy = false;
        state.lastError = message;
        log.error("ciclo de envio falhou", { error: message });
      }
    }

    // Manutenção da fila — FORA do `if (sendDeps)`: lease vencido, progresso de
    // broadcast e agendamento não dependem de a Evolution estar configurada.
    if (!stopping) {
      try {
        const now = Date.now();
        const shouldPrune = now - lastPruneAt >= PRUNE_INTERVAL_MS;
        const summary = await runHousekeeping(supabase, { prune: shouldPrune });
        if (shouldPrune) lastPruneAt = now;
        if (housekeepingDidWork(summary)) {
          log.info("manutenção", summary);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "erro desconhecido";
        state.healthy = false;
        state.lastError = message;
        log.error("manutenção falhou", { error: message });
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
