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

export type BulkAction = "set_description" | "set_picture" | "open" | "close" | "check_invite";

/** O que o app entrega no claim. Autocontido: o worker não consulta o banco. */
export type BulkJobClaim = {
  id: string;
  action: BulkAction;
  whatsappGroupId: string;
  description?: string;
  mediaId?: string;
};

/**
 * `invite`, `httpStatus` e `detail` só existem para `check_invite`.
 *
 * O worker NÃO classifica a revisão. Ele devolve o que leu, ou o erro cru com o
 * status HTTP, e o servidor decide `same`/`changed`/`broken` — é lá que o
 * `invite_url` guardado está, e onde `classifyInviteFailure` já mora. Repassar o
 * status é o que permite separar "perdi o admin" (permanente) de "a Evolution
 * caiu" (passageiro): sem ele, uma queda de rede marcaria 91 grupos bons como
 * quebrados.
 */
export type BulkAck = {
  status: "done" | "failed";
  error?: string;
  /** `check_invite` concluído: o convite lido, ou `null` se não veio nenhum. */
  invite?: string | null;
  /** 0 = não chegou na Evolution (timeout/rede); senão o status HTTP. */
  httpStatus?: number;
  detail?: string;
};

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
  /** Convite canônico do grupo, ou `null` se a Evolution não devolveu um válido. */
  inviteUrl(instanceName: string, groupJid: string): Promise<string | null>;
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

/**
 * Executa UMA ação. Lança em falha — quem chama transforma em ack.
 *
 * Devolve o convite lido quando a ação é `check_invite`; `undefined` para as
 * outras, que não produzem dado nenhum.
 */
async function applyJob(
  deps: BulkDeps,
  tenantId: string,
  instanceName: string,
  job: BulkJobClaim,
): Promise<string | null | undefined> {
  switch (job.action) {
    case "open":
      return deps.setOpenToAll(instanceName, job.whatsappGroupId).then(() => undefined);

    case "close":
      return deps.setAnnounceOnly(instanceName, job.whatsappGroupId).then(() => undefined);

    // Única ação que LÊ. `null` é resposta legítima ("a Evolution não devolveu
    // convite utilizável"), não erro — quem decide o que isso significa para o
    // lojista é o servidor.
    case "check_invite":
      return deps.inviteUrl(instanceName, job.whatsappGroupId);

    case "set_description": {
      // String vazia é ação legítima (apagar a descrição), então o teste é de
      // TIPO, não de verdade — um `?? ""` engoliria um job mal montado e
      // apagaria a descrição de 91 grupos sem ninguém ter pedido.
      if (typeof job.description !== "string") {
        throw new Error("Job de descrição sem texto.");
      }
      await deps.setDescription(instanceName, job.whatsappGroupId, job.description);
      return undefined;
    }

    case "set_picture": {
      if (!job.mediaId) throw new Error("Job de foto sem imagem.");
      const url = await deps.signedMediaUrl(job.mediaId, tenantId);
      if (!url) throw new Error("A imagem não está mais disponível.");
      await deps.setPicture(instanceName, job.whatsappGroupId, url);
      return undefined;
    }
  }
}

/**
 * Erro da Evolution → o que o ack precisa carregar.
 *
 * O `status` é o que separa passageiro de permanente do outro lado. Sem ele todo
 * erro chegaria como texto e a classificação teria de adivinhar — que é o que
 * marcaria 91 grupos bons como quebrados numa queda de rede.
 */
function detalhaFalha(error: unknown): { error: string; httpStatus?: number; detail?: string } {
  const mensagem = reason(error);
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number"
    ? { error: mensagem, httpStatus: status, detail: mensagem }
    : { error: mensagem };
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
      const invite = await applyJob(deps, tenantId, instanceName, job);
      summary.done += 1;
      await deps.ack(tenantId, job.id, {
        status: "done",
        // Só a revisão devolve dado; as outras não põem a chave no ack.
        ...(job.action === "check_invite" ? { invite: invite ?? null } : {}),
      });
    } catch (error) {
      summary.failed += 1;
      await deps.ack(tenantId, job.id, { status: "failed", ...detalhaFalha(error) });
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
