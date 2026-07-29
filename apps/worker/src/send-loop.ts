/**
 * Loop de ENVIO (F4). Espelha o event-loop: claim em lote → processa cada
 * comando → fecha. A diferença é que o anti-ban vive no claim: claim_send_commands
 * só devolve send_message de número pronto (não pausado, gap de espaçamento
 * passou, sob caps min/hora/dia + warmup), no máx. 1 por número por lote. Logo o
 * loop pode ser burro e stateless — daí ser seguro sob N réplicas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EvolutionSender } from "./evolution-sender.js";
import { log } from "./log.js";
import { sendFromCommand, type EngineCommandRow, type SendDeps } from "./send-command.js";

/** Deps reais (Supabase + Evolution). Testes usam deps fake. */
export function makeSendDeps(supabase: SupabaseClient, sender: EvolutionSender): SendDeps {
  // provider_instance_id é estável por instância → cacheia os não-nulos por
  // processo. Não cacheia null: instância ainda não provisionada pode passar a ser.
  const nameCache = new Map<string, string>();

  return {
    async instanceName(instanceId) {
      const cached = nameCache.get(instanceId);
      if (cached !== undefined) return cached;
      const { data, error } = await supabase
        .from("instances")
        .select("provider_instance_id")
        .eq("id", instanceId)
        .maybeSingle();
      if (error) throw new Error(`instanceName: ${error.message}`);
      const name = typeof data?.provider_instance_id === "string" ? data.provider_instance_id : null;
      if (name) nameCache.set(instanceId, name);
      return name;
    },

    async sendText(instanceName, number, text) {
      await sender.sendText(instanceName, number, text);
    },

    async recordSend(instanceId, tenantId) {
      const { error } = await supabase.rpc("record_send", {
        target_instance_id: instanceId,
        target_tenant_id: tenantId,
      });
      if (error) throw new Error(`record_send: ${error.message}`);
    },

    async recordSendFailure(instanceId, tenantId) {
      const { error } = await supabase.rpc("record_send_failure", {
        target_instance_id: instanceId,
        target_tenant_id: tenantId,
      });
      if (error) throw new Error(`record_send_failure: ${error.message}`);
    },

    async completeCommand(commandId, success, errorMessage) {
      const { error } = await supabase.rpc("complete_engine_command", {
        target_command_id: commandId,
        success,
        error_message: errorMessage ?? null,
      });
      if (error) throw new Error(`complete_engine_command: ${error.message}`);
    },
  };
}

export type SendTickSummary = {
  claimed: number;
  sent: number;
  failed: number;
};

/**
 * Um ciclo de envio. Lança só se o claim (nível banco) falhar — erro por comando
 * é isolado: falha de negócio fecha o comando; falha de infra no meio (record/
 * complete) deixa o lease expirar e requeue_expired_commands recupera no próximo.
 */
export async function runSendTick(
  supabase: SupabaseClient,
  deps: SendDeps,
  batchSize: number,
): Promise<SendTickSummary> {
  const { data, error } = await supabase.rpc("claim_send_commands", { max_commands: batchSize });
  if (error) throw new Error(`claim_send_commands: ${error.message}`);

  const rows = (data ?? []) as EngineCommandRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const outcome = await sendFromCommand(row, deps);
      if (outcome.status === "sent") {
        sent += 1;
      } else {
        failed += 1;
        log.warn("comando de envio falhou", { command_id: row.command_id, reason: outcome.reason });
      }
    } catch (err) {
      // Infra fora no meio (record/complete): não fecha o comando → lease expira →
      // requeue no próximo ciclo. Conta como falha só para o resumo.
      failed += 1;
      log.error("envio falhou (infra)", {
        command_id: row.command_id,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }

  return { claimed: rows.length, sent, failed };
}

/** Poda o log de envios (janelas > ~25h). Chamado esporadicamente pelo index. */
export async function pruneSends(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("prune_instance_sends", {
    older_than: "25 hours",
  });
  if (error) throw new Error(`prune_instance_sends: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
