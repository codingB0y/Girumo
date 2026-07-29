/**
 * Loop do executor de automações — camada 1 do plano
 * (docs/superpowers/plans/2026-07-29-automations-executor.md).
 *
 * Mesma forma do event-loop.ts: a cada ciclo devolve runs com lease vencida,
 * reivindica runs vencidos e avança cada um um passo. Erro por run é isolado
 * (o run cai em 'failed'); erro de nível banco (claim/requeue) propaga pro
 * index degradar o /health.
 *
 * Nesta camada NADA cria runs automaticamente — os gatilhos são a camada 2.
 * Runs são inseridos à mão para teste, então o risco em produção é zero.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "./log.js";

export type AutomationStep = {
  id: string;
  type: string;
  delay_minutes: number;
  message?: string | null;
  media_id?: string | null;
  condition?: string | null;
};

export type AutomationRow = {
  id: string;
  enabled: boolean;
  steps: AutomationStep[];
};

export type AutomationRunRow = {
  id: string;
  tenant_id: string;
  automation_id: string;
  target_group_jid: string;
  current_step: number;
};

export type EnqueueMessageInput = {
  tenantId: string;
  runId: string;
  stepIndex: number;
  targetGroupJid: string;
  text: string;
};

export interface AutomationDeps {
  /** Config da automação (steps + enabled), lida a cada passo — pode ter mudado desde o run criado. */
  getAutomation(automationId: string): Promise<AutomationRow | null>;
  /** Enfileira em `engine_commands`. Idempotente: reprocessar o mesmo passo não duplica o envio. */
  enqueueMessage(input: EnqueueMessageInput): Promise<void>;
  advance(runId: string, nextStep: number, nextAt: Date): Promise<void>;
  finish(runId: string, status: "done" | "failed" | "cancelled", error?: string): Promise<void>;
}

const UNIQUE_VIOLATION = "23505";

/** Deps reais (Supabase) para o executor. Testes usam deps fake. */
export function makeAutomationDeps(supabase: SupabaseClient): AutomationDeps {
  return {
    async getAutomation(automationId) {
      const { data, error } = await supabase
        .from("automations")
        .select("id, enabled, steps")
        .eq("id", automationId)
        .maybeSingle();
      if (error) throw new Error(`getAutomation: ${error.message}`);
      if (!data) return null;
      return {
        id: data.id,
        enabled: Boolean(data.enabled),
        steps: Array.isArray(data.steps) ? (data.steps as AutomationStep[]) : [],
      };
    },

    async enqueueMessage({ tenantId, runId, stepIndex, targetGroupJid, text }) {
      // O CHECK de automation_runs já garante @g.us; esta validação é defesa
      // em profundidade — a decisão anti-ban (Igor, 28/07) nunca deve
      // depender só do schema pra não virar DM.
      if (!targetGroupJid.endsWith("@g.us")) {
        throw new Error(`enqueueMessage: destino nao e grupo (${targetGroupJid})`);
      }
      const { error } = await supabase.from("engine_commands").insert({
        tenant_id: tenantId,
        instance_id: null,
        type: "send_message",
        payload: { jid: targetGroupJid, text },
        priority: 50,
        dedupe_key: `auto:${runId}:${stepIndex}`,
      });
      // Unique violation no dedupe_key = este passo já foi enfileirado (o
      // worker morreu entre o insert e o advance de um ciclo anterior).
      // Idempotente por desenho: segue para o advance em vez de falhar.
      if (error && error.code !== UNIQUE_VIOLATION) {
        throw new Error(`enqueueMessage: ${error.message}`);
      }
    },

    async advance(runId, nextStep, nextAt) {
      const { error } = await supabase.rpc("advance_automation_run", {
        target_run_id: runId,
        next_step: nextStep,
        next_at: nextAt.toISOString(),
      });
      if (error) throw new Error(`advance_automation_run: ${error.message}`);
    },

    async finish(runId, status, errorMessage) {
      const { error } = await supabase.rpc("finish_automation_run", {
        target_run_id: runId,
        final_status: status,
        error_message: errorMessage ?? null,
      });
      if (error) throw new Error(`finish_automation_run: ${error.message}`);
    },
  };
}

async function requeueStale(supabase: SupabaseClient, olderThanSeconds: number): Promise<number> {
  const { data, error } = await supabase.rpc("requeue_stale_automation_runs", {
    older_than: `${olderThanSeconds} seconds`,
  });
  if (error) throw new Error(`requeue_stale_automation_runs: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

type RunOutcome = "advanced" | "done" | "failed" | "cancelled";

/** Decide e executa o próximo passo de um run já reivindicado (lease em mãos). */
async function processRun(run: AutomationRunRow, deps: AutomationDeps): Promise<RunOutcome> {
  const automation = await deps.getAutomation(run.automation_id);

  if (!automation) {
    await deps.finish(run.id, "failed", "automacao nao encontrada");
    return "failed";
  }
  // Lojista pode desligar a automação no meio de uma sequência em andamento;
  // respeita isso em vez de continuar disparando passos de algo desativado.
  if (!automation.enabled) {
    await deps.finish(run.id, "cancelled");
    return "cancelled";
  }
  if (run.current_step >= automation.steps.length) {
    await deps.finish(run.id, "done");
    return "done";
  }

  const step = automation.steps[run.current_step];
  if (!step) {
    await deps.finish(run.id, "failed", `passo ${run.current_step}: steps[${run.current_step}] ausente`);
    return "failed";
  }

  switch (step.type) {
    case "wait": {
      const delayMs = Math.max(0, step.delay_minutes) * 60_000;
      await deps.advance(run.id, run.current_step + 1, new Date(Date.now() + delayMs));
      return "advanced";
    }

    case "message": {
      const text = step.message?.trim();
      if (!text) {
        await deps.finish(run.id, "failed", `passo ${run.current_step}: message sem texto`);
        return "failed";
      }
      await deps.enqueueMessage({
        tenantId: run.tenant_id,
        runId: run.id,
        stepIndex: run.current_step,
        targetGroupJid: run.target_group_jid,
        text,
      });
      await deps.advance(run.id, run.current_step + 1, new Date());
      return "advanced";
    }

    case "condition": {
      // Nenhum gatilho ou tela produz passo `condition` hoje — não existe
      // avaliador de expressão implementado em lugar nenhum do repo. Falha
      // explícita em vez de inventar semântica (sempre passa arriscaria
      // mandar mensagem por engano; sempre cancela esconderia o problema).
      await deps.finish(run.id, "failed", `passo ${run.current_step}: condition sem avaliador implementado`);
      return "failed";
    }

    default: {
      await deps.finish(run.id, "failed", `passo ${run.current_step}: tipo desconhecido "${step.type}"`);
      return "failed";
    }
  }
}

export type AutomationsTickSummary = {
  requeued: number;
  claimed: number;
  advanced: number;
  done: number;
  failed: number;
  cancelled: number;
};

/**
 * Um ciclo completo. Lança só se claim/requeue (nível banco) falhar — erro
 * por run é isolado e vira `failed` naquele run.
 */
export async function runAutomationsTick(
  supabase: SupabaseClient,
  deps: AutomationDeps,
  batchSize: number,
  requeueAfterSeconds: number,
): Promise<AutomationsTickSummary> {
  const requeued = await requeueStale(supabase, requeueAfterSeconds);
  if (requeued > 0) log.warn("runs de automacao reenfileirados", { requeued });

  const { data, error } = await supabase.rpc("claim_automation_runs", { max_runs: batchSize });
  if (error) throw new Error(`claim_automation_runs: ${error.message}`);

  const rows = (data ?? []) as AutomationRunRow[];
  const summary: AutomationsTickSummary = {
    requeued,
    claimed: rows.length,
    advanced: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const run of rows) {
    try {
      const outcome = await processRun(run, deps);
      summary[outcome] += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      summary.failed += 1;
      // Mesmo caso do event-loop: se o próprio finish(failed) falhar (banco
      // fora), o run fica 'running' e o requeue do próximo ciclo o recupera.
      await deps.finish(run.id, "failed", message).catch((finishErr) => {
        log.error("falha ao marcar run como failed", {
          run_id: run.id,
          error: finishErr instanceof Error ? finishErr.message : "erro desconhecido",
        });
      });
      log.error("run de automacao falhou", { run_id: run.id, tenant_id: run.tenant_id, error: message });
    }
  }

  return summary;
}
