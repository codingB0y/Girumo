/**
 * Loop de AÇÕES EM MASSA sobre grupos que já existem: foto, descrição e
 * abrir/fechar.
 *
 * Irmão de `grow-loop.ts`, com a mesma divisão de responsabilidade: o app decide
 * o que entra na fila, o worker só executa e reporta. Puro de propósito — todas
 * as dependências entram por parâmetro, para rodar sob `tsx --test` sem rede.
 *
 * ── Anti-ban ──────────────────────────────────────────────────────────────
 * O teto é a CADÊNCIA, como no auto-grow: no máximo UMA operação por tenant por
 * tick, com o tick a cada `WORKER_BULK_INTERVAL_MS` (4s) — ~15/min ESPAÇADOS.
 * Quinze chamadas de admin no mesmo segundo e 55s de silêncio dariam o mesmo
 * número por minuto e são exatamente o padrão de automação que se quer evitar.
 *
 * O teto vive em DOIS lugares de propósito: no `p_limit` da RPC `claim_bulk_jobs`
 * e aqui. Um `p_limit` alterado sem querer não pode virar rajada silenciosa.
 *
 * ── Por que o excedente vira `failed`, e não volta para a fila ─────────────
 * Não existe status "de volta ao início" nesta fila, e inventar um
 * reenfileiramento automático seria justamente a máquina de rajada que o teto
 * evita. `failed` com motivo explícito é honesto: aparece no progresso do lote, e
 * a tela oferece "tentar de novo nos que falharam" — uma ação de gente, não do
 * loop. Na prática este caminho não dispara, porque a RPC já entrega no máximo
 * um job; ele existe para o dia em que alguém mexer no `p_limit`.
 */

import { log } from "./log.js";

export type BulkAction = "set_description" | "set_picture" | "open" | "close";

/** O que o app entrega no claim. Autocontido: o worker não consulta o banco. */
export type BulkJobClaim = {
  id: string;
  action: BulkAction;
  whatsappGroupId: string;
  description?: string;
  mediaId?: string;
};

export type BulkAck = { status: "done" | "failed"; error?: string };

export type BulkDeps = {
  /** Tenants com fila a drenar. */
  listTenants(): Promise<string[]>;
  /** POST /api/groups/bulk/pending */
  claimJobs(tenantId: string): Promise<BulkJobClaim[]>;
  /** POST /api/groups/bulk/ack */
  ack(tenantId: string, jobId: string, ack: BulkAck): Promise<void>;
  /** Nome da instância na Evolution, ou null se o tenant não tem uma utilizável. */
  instanceFor(tenantId: string): Promise<string | null>;
  setOpenToAll(instanceName: string, groupJid: string): Promise<void>;
  setAnnounceOnly(instanceName: string, groupJid: string): Promise<void>;
  setDescription(instanceName: string, groupJid: string, description: string): Promise<void>;
  setPicture(instanceName: string, groupJid: string, imageUrl: string): Promise<void>;
  /** URL assinada de TTL curto, ou null (mídia apagada / id inválido). */
  signedMediaUrl(mediaId: string, tenantId: string): Promise<string | null>;
};

export type BulkTickSummary = {
  tenants: number;
  claimed: number;
  done: number;
  failed: number;
};

/** Teto anti-ban por tenant por tick. Ver o cabeçalho. */
export const MAX_OPS_PER_TENANT_PER_TICK = 1;

export const DEFERRED_REASON =
  "Adiado pelo ritmo anti-ban (uma operação por vez). Reaplique nos que falharam.";

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "erro desconhecido";
}

/** Executa UMA ação. Lança em falha — quem chama transforma em ack. */
async function applyJob(
  deps: BulkDeps,
  tenantId: string,
  instanceName: string,
  job: BulkJobClaim,
): Promise<void> {
  switch (job.action) {
    case "open":
      return deps.setOpenToAll(instanceName, job.whatsappGroupId);

    case "close":
      return deps.setAnnounceOnly(instanceName, job.whatsappGroupId);

    case "set_description": {
      // String vazia é ação legítima (apagar a descrição), então o teste é de
      // TIPO, não de verdade — um `?? ""` engoliria um job mal montado e
      // apagaria a descrição de 91 grupos sem ninguém ter pedido.
      if (typeof job.description !== "string") {
        throw new Error("Job de descrição sem texto.");
      }
      return deps.setDescription(instanceName, job.whatsappGroupId, job.description);
    }

    case "set_picture": {
      if (!job.mediaId) throw new Error("Job de foto sem imagem.");
      const url = await deps.signedMediaUrl(job.mediaId, tenantId);
      if (!url) throw new Error("A imagem não está mais disponível.");
      return deps.setPicture(instanceName, job.whatsappGroupId, url);
    }
  }
}

async function runTenant(
  deps: BulkDeps,
  tenantId: string,
  summary: BulkTickSummary,
): Promise<void> {
  const jobs = await deps.claimJobs(tenantId);
  if (jobs.length === 0) return;
  summary.claimed += jobs.length;

  const permitidos = jobs.slice(0, MAX_OPS_PER_TENANT_PER_TICK);
  const excedente = jobs.slice(MAX_OPS_PER_TENANT_PER_TICK);

  const instanceName = await deps.instanceFor(tenantId);

  for (const job of permitidos) {
    if (!instanceName) {
      summary.failed += 1;
      await deps.ack(tenantId, job.id, {
        status: "failed",
        error: "Sem instância conectada para aplicar a ação.",
      });
      continue;
    }

    try {
      await applyJob(deps, tenantId, instanceName, job);
      summary.done += 1;
      await deps.ack(tenantId, job.id, { status: "done" });
    } catch (error) {
      summary.failed += 1;
      await deps.ack(tenantId, job.id, { status: "failed", error: reason(error) });
    }
  }

  for (const job of excedente) {
    summary.failed += 1;
    await deps.ack(tenantId, job.id, { status: "failed", error: DEFERRED_REASON });
  }
}

export async function runBulkTick(deps: BulkDeps): Promise<BulkTickSummary> {
  const summary: BulkTickSummary = { tenants: 0, claimed: 0, done: 0, failed: 0 };

  const tenants = await deps.listTenants();
  summary.tenants = tenants.length;

  for (const tenantId of tenants) {
    try {
      await runTenant(deps, tenantId, summary);
    } catch (error) {
      // Um tenant fora do ar não pode travar a fila dos outros.
      log.warn("ações em massa: tenant falhou no tick", {
        tenant_id: tenantId,
        error: reason(error),
      });
    }
  }

  return summary;
}

export function bulkDidWork(summary: BulkTickSummary): boolean {
  return summary.claimed > 0 || summary.done > 0 || summary.failed > 0;
}
