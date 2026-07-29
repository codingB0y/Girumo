/**
 * Loop de consumo de eventos (loop B da migração Evolution).
 *
 * A cada ciclo: reenfileira eventos presos → claim em lote → processa cada um →
 * marca processed/failed. Falha de um evento não derruba o loop; falha do claim
 * (banco fora) propaga para o index marcar o worker degradado no /health.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  captureFromEvent,
  type CaptureDeps,
  type EngineEventRow,
} from "./lead-capture.js";
import { log } from "./log.js";

/** Deps reais (Supabase) para a captura. Testes usam deps fake. */
export function makeDeps(supabase: SupabaseClient): CaptureDeps {
  const deps: CaptureDeps = {
    async getGroup(tenantId, whatsappGroupId) {
      const { data, error } = await supabase
        .from("groups")
        .select("name, is_admin")
        .eq("tenant_id", tenantId)
        .eq("whatsapp_group_id", whatsappGroupId)
        .maybeSingle();
      if (error) throw new Error(`getGroup: ${error.message}`);
      if (!data) return null;
      return {
        name: typeof data.name === "string" ? data.name : null,
        isAdmin: Boolean(data.is_admin),
      };
    },

    async isOptedOut(tenantId, phone) {
      const { data, error } = await supabase
        .from("optouts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw new Error(`isOptedOut: ${error.message}`);
      return Boolean(data);
    },

    async upsertLead(input) {
      const { data, error } = await supabase.rpc("upsert_lead", {
        target_tenant_id: input.tenantId,
        // "" quando phone é null → a RPC resolve para NULL e sempre insere
        // (participante @lid não tem chave de dedupe). Igual ao leads-store.
        target_phone: input.phone ?? "",
        target_name: input.name,
        target_source_group_id: input.sourceGroupId,
        target_source_group_name: input.sourceGroupName,
        target_source_campaign: null,
      });
      if (error) throw new Error(`upsertLead: ${error.message}`);
      const leadId = (data as { id?: string } | null)?.id;
      if (!leadId) throw new Error("upsertLead: RPC nao devolveu id do lead");
      return leadId;
    },

    async triggerLeadEnteredAutomations({ tenantId, leadId, groupJid }) {
      const { data: automations, error } = await supabase
        .from("automations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("trigger", "lead_entered")
        .eq("enabled", true);
      if (error) throw new Error(`triggerLeadEnteredAutomations: ${error.message}`);

      for (const automation of (automations ?? []) as { id: string }[]) {
        const { error: insertError } = await supabase.from("automation_runs").insert({
          tenant_id: tenantId,
          automation_id: automation.id,
          trigger_context: { lead_id: leadId },
          target_group_jid: groupJid,
          dedupe_key: `lead:${leadId}:${automation.id}`,
        });
        // Unique violation no dedupe_key = essa automação já disparou pra esse
        // lead antes (reentrada no grupo). Idempotente por desenho: ignora.
        if (insertError && insertError.code !== "23505") {
          throw new Error(`triggerLeadEnteredAutomations: ${insertError.message}`);
        }
      }
    },
  };
  return deps;
}

async function completeEvent(
  supabase: SupabaseClient,
  eventId: string,
  status: "processed" | "failed",
  errorMessage?: string,
): Promise<void> {
  const { error } = await supabase.rpc("complete_engine_event", {
    target_event_id: eventId,
    target_status: status,
    target_error: errorMessage ?? null,
  });
  if (error) throw new Error(`complete_engine_event: ${error.message}`);
}

async function requeueStale(supabase: SupabaseClient, olderThanSeconds: number): Promise<number> {
  const { data, error } = await supabase.rpc("requeue_stale_engine_events", {
    older_than: `${olderThanSeconds} seconds`,
  });
  if (error) throw new Error(`requeue_stale_engine_events: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

export type TickSummary = {
  requeued: number;
  claimed: number;
  processed: number;
  failed: number;
  leads: number;
};

/**
 * Um ciclo completo. Lança só se o claim/requeue (nível banco) falhar — erro por
 * evento é isolado e vira `failed` naquele evento.
 */
export async function runTick(
  supabase: SupabaseClient,
  deps: CaptureDeps,
  batchSize: number,
  requeueAfterSeconds: number,
): Promise<TickSummary> {
  const requeued = await requeueStale(supabase, requeueAfterSeconds);
  if (requeued > 0) log.warn("eventos reenfileirados", { requeued });

  const { data, error } = await supabase.rpc("claim_engine_events", { max_events: batchSize });
  if (error) throw new Error(`claim_engine_events: ${error.message}`);

  const rows = (data ?? []) as EngineEventRow[];
  let processed = 0;
  let failed = 0;
  let leads = 0;

  for (const row of rows) {
    try {
      const outcome = await captureFromEvent(row, deps);
      await completeEvent(supabase, row.event_id, "processed");
      processed += 1;
      leads += outcome.leads;
      if (outcome.leads > 0 || outcome.optedOut > 0) {
        log.info("evento processado", {
          event_id: row.event_id,
          tenant_id: row.tenant_id,
          leads: outcome.leads,
          opted_out: outcome.optedOut,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      failed += 1;
      // O complete(failed) pode também falhar (banco fora); nesse caso o evento
      // fica em 'processing' e o requeue do próximo ciclo o recupera.
      await completeEvent(supabase, row.event_id, "failed", message).catch((completeErr) => {
        log.error("falha ao marcar evento como failed", {
          event_id: row.event_id,
          error: completeErr instanceof Error ? completeErr.message : "erro desconhecido",
        });
      });
      log.error("evento falhou", { event_id: row.event_id, tenant_id: row.tenant_id, error: message });
    }
  }

  return { requeued, claimed: rows.length, processed, failed, leads };
}
