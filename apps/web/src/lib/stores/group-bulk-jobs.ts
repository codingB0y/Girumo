import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { BulkAction, BulkJobInsert } from "@/lib/groups/bulk-batch";

/**
 * Fila de ações em massa sobre grupos que já existem (foto, descrição,
 * abrir/fechar). Irmã de `group-grow-jobs.ts`, que cobre a criação.
 *
 * Supabase-only de propósito, sem o fallback JSON das stores antigas: com
 * dual-mode, tabela ausente não dá erro — cai no JSON em silêncio, e você
 * validaria em dev um caminho de código que não é o que roda em produção.
 *
 * Todo acesso filtra `tenant_id` explicitamente. O service-role bypassa RLS por
 * desenho, então esse filtro é a proteção real; a policy é defesa em profundidade.
 */

export type BulkJobStatus = "queued" | "running" | "done" | "failed";

export type BulkJobRow = {
  id: string;
  tenant_id: string;
  campaign_group_id: string;
  batch_id: string;
  action: BulkAction;
  group_id: string;
  whatsapp_group_id: string;
  description: string | null;
  media_id: string | null;
  status: BulkJobStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  running_since: string | null;
  last_ack_at: string | null;
  updated_at: string;
};

/** O que o worker recebe no claim. Autocontido: ele não consulta o banco. */
export type BulkJobClaim = {
  id: string;
  action: BulkAction;
  whatsappGroupId: string;
  description?: string;
  mediaId?: string;
};

const TABLE = "group_bulk_jobs";

/**
 * Operação de metadata de grupo é rápida (segundos). 5 min já é folga larga —
 * mais que isso deixaria a fila inteira parada atrás de um job que o worker
 * claimou e abandonou.
 */
export const STALE_RUNNING_MS = 5 * 60_000;

/**
 * Metade do anti-ban. A outra metade é `WORKER_BULK_INTERVAL_MS` (4s): um job a
 * cada 4s dá ~15/min ESPAÇADOS. Quinze de uma vez e 55s de silêncio dariam o
 * mesmo número por minuto e são o padrão de automação que se quer evitar.
 */
export const CLAIM_LIMIT = 1;

/**
 * Insere o lote. Reenfileirar o mesmo lote é no-op — o índice único
 * (tenant, batch, grupo, ação) transforma a repetição em nada, em vez de
 * duplicar a operação no WhatsApp.
 *
 * Devolve quantos jobs entraram de fato.
 */
export async function enqueueBulkJobs(
  tenantId: string,
  jobs: readonly BulkJobInsert[],
): Promise<number> {
  if (jobs.length === 0) return 0;

  const rows = jobs.map((job) => ({ ...job, tenant_id: tenantId }));
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, {
      onConflict: "tenant_id,batch_id,group_id,action",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/**
 * Devolve à realidade os jobs que o worker claimou e nunca reportou.
 *
 * Sem isso a fila trava: o job fica `running` para sempre e o `claim` só olha
 * `queued`, então nada mais anda para aquele tenant.
 */
export async function failStaleRunning(tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "failed",
      error: "Operação interrompida (executor desconectou).",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("status", "running")
    .lt("last_ack_at", cutoff)
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/**
 * Recupera o que travou e reivindica o próximo job (teto `CLAIM_LIMIT`).
 *
 * O claim mora numa RPC (`claim_bulk_jobs`) e não numa sequência de queries
 * porque `for update skip locked` é o que mantém dois workers coexistindo sem
 * entregar o mesmo job duas vezes.
 */
export async function claimBulk(tenantId: string): Promise<BulkJobClaim[]> {
  await failStaleRunning(tenantId);

  const { data, error } = await getSupabaseAdmin().rpc("claim_bulk_jobs", {
    p_tenant: tenantId,
    p_limit: CLAIM_LIMIT,
  });

  if (error) throw new Error(error.message);

  return ((data ?? []) as BulkJobRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    whatsappGroupId: row.whatsapp_group_id,
    description: row.description ?? undefined,
    mediaId: row.media_id ?? undefined,
  }));
}

/**
 * Registra o resultado de uma ação.
 *
 * Em `open`/`close` concluído, propaga para `groups.send_state` — é o que a tela
 * lê para mostrar aberto/fechado sem perguntar ao WhatsApp grupo a grupo.
 */
export async function ackBulk(
  tenantId: string,
  id: string,
  ack: { status: "done" | "failed"; error?: string | null },
): Promise<BulkJobRow | null> {
  const now = new Date().toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: ack.status,
      error: ack.error ?? null,
      last_ack_at: now,
      updated_at: now,
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const job = data as BulkJobRow;

  if (ack.status === "done" && (job.action === "open" || job.action === "close")) {
    const { error: stateError } = await getSupabaseAdmin()
      .from("groups")
      .update({
        send_state: job.action === "open" ? "open" : "closed",
        send_state_at: now,
      })
      .eq("tenant_id", tenantId)
      .eq("id", job.group_id);

    // Não derruba o ack: o job JÁ foi aplicado no WhatsApp. Perder o reflexo na
    // tela é ruim; perder o ack seria pior, porque o job voltaria a ser aplicado
    // — e reaplicar é justamente o que gasta janela anti-ban à toa.
    if (stateError) {
      console.error("[group-bulk-jobs] falha ao gravar send_state:", stateError.message);
    }
  }

  return job;
}

/** Progresso de um lote: o "47 de 91" da tela. */
export async function countBatch(
  tenantId: string,
  batchId: string,
): Promise<{ total: number; done: number; failed: number; pending: number }> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ status: BulkJobStatus }>;
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return { total: rows.length, done, failed, pending: rows.length - done - failed };
}
