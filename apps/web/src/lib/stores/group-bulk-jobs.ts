import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { BulkAction, BulkJobInsert } from "@/lib/groups/bulk-batch";
import { decideInviteReview } from "@/lib/groups/invite-review";

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
  /** `null` no backfill de convite pela fila do lote — não pertence a campanha. */
  campaign_group_id: string | null;
  batch_id: string;
  action: BulkAction;
  group_id: string;
  whatsapp_group_id: string;
  description: string | null;
  media_id: string | null;
  /** Dígitos com DDI. Só preenchido em `remove_participant`. */
  target_phone: string | null;
  /** Nome novo do grupo. Só preenchido em `set_subject`. */
  subject: string | null;
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
  targetPhone?: string;
  subject?: string;
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

/** Grupos com check_invite ainda por rodar — evita enfileirar o mesmo grupo a cada sync. */
export async function listPendingCheckInviteGroupIds(tenantId: string): Promise<Set<string>> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("group_id")
    .eq("tenant_id", tenantId)
    .eq("action", "check_invite")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => (r as { group_id: string }).group_id));
}

/**
 * A campanha tem renome (`set_subject`) na fila ou rodando? O Padronizar recusa
 * enquanto tiver: `groups.name` só muda no ack `done`, então os grupos pendentes
 * ainda parecem "muda" e um segundo clique os enfileiraria de novo (outro
 * `batch_id`, a dedupe não pega) — o mesmo renome duas vezes na janela anti-ban.
 */
export async function hasPendingSubjectJobs(tenantId: string, campaignGroupId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .eq("action", "set_subject")
    .in("status", ["queued", "running"])
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
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
    targetPhone: row.target_phone ?? undefined,
    subject: row.subject ?? undefined,
  }));
}

/**
 * O que o worker reporta. `invite`, `httpStatus` e `detail` só existem para
 * `check_invite`, que é a única ação que devolve DADO em vez de só sucesso.
 */
export type BulkAckInput = {
  status: "done" | "failed";
  error?: string | null;
  /** `check_invite` concluído: o convite lido, ou `null` se não veio nenhum. */
  invite?: string | null;
  /** `check_invite` falhado: 0 = não chegou na Evolution, senão o status HTTP. */
  httpStatus?: number;
  detail?: string | null;
  /** `set_subject` concluído: o nome EXATO que o worker aplicou. Ver `decideAck`. */
  subject?: string;
};

const RENAME_NOT_CONFIRMED_ERROR = "Worker desatualizado: o renome não foi confirmado.";

/**
 * Decide o status que o job vai receber, ANTES de escrevê-lo.
 *
 * Trava mecânica do renome: um worker anterior ao `set_subject` não tem esse
 * `case` e devolve `done` sem ter renomeado nada. Aceitar esse `done` gravaria o
 * nome novo em `groups.name` e apagaria `display_name_base` de cada grupo do lote
 * com o nome ainda velho no WhatsApp — em silêncio. O worker novo ecoa o nome que
 * passou ao `setSubject`; sem o eco idêntico (comparação estrita, sem trim — é a
 * string armazenada que volta), o `done` vira `failed`.
 *
 * Só `done` custa a leitura: `failed` já é o pior caso e as demais ações não
 * ecoam nada. `null` = job não existe (para o tenant).
 */
async function decideAck(
  tenantId: string,
  id: string,
  ack: BulkAckInput,
): Promise<BulkAckInput | null> {
  if (ack.status !== "done") return ack;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("action, subject")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const job = data as Pick<BulkJobRow, "action" | "subject">;
  if (job.action === "set_subject" && ack.subject !== job.subject) {
    return { ...ack, status: "failed", error: RENAME_NOT_CONFIRMED_ERROR };
  }
  return ack;
}

/**
 * Registra o resultado de uma ação.
 *
 * Em `open`/`close` concluído, propaga para `groups.send_state` — é o que a tela
 * lê para mostrar aberto/fechado sem perguntar ao WhatsApp grupo a grupo. Em
 * `check_invite`, propaga o veredito da revisão pelo mesmo caminho. Em
 * `set_subject` concluído E confirmado pelo eco do worker (`decideAck`), propaga o
 * nome novo para `groups.name`.
 */
export async function ackBulk(
  tenantId: string,
  id: string,
  rawAck: BulkAckInput,
): Promise<BulkJobRow | null> {
  const ack = await decideAck(tenantId, id, rawAck);
  if (!ack) return null;

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
    await propagaParaGrupo(tenantId, job.group_id, "send_state", {
      send_state: job.action === "open" ? "open" : "closed",
      send_state_at: now,
    });
  }

  // Renome concluído: o nome do WhatsApp mudou, então o do painel muda junto — e
  // o nome interno (`display_name_base`/`display_number`) é limpo, senão a tela
  // continuaria mostrando o apelido antigo por cima (`group-display-name.ts`).
  // `failed` não grava nada: no WhatsApp o grupo continua com o nome antigo.
  if (ack.status === "done" && job.action === "set_subject" && job.subject?.trim()) {
    await propagaParaGrupo(tenantId, job.group_id, "nome", {
      name: job.subject,
      display_name_base: "",
      display_number: 0,
    });
  }

  if (job.action === "check_invite") {
    await gravaRevisao(tenantId, job, ack, now);
  }

  return job;
}

/**
 * Escrita secundária em `groups` — nunca derruba o ack.
 *
 * O job JÁ aconteceu do lado do WhatsApp. Perder o reflexo na tela é ruim;
 * perder o ack seria pior, porque o job voltaria a ser aplicado — e reaplicar é
 * justamente o que gasta janela anti-ban à toa.
 */
async function propagaParaGrupo(
  tenantId: string,
  groupId: string,
  rotulo: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("groups")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", groupId);

  if (error) {
    console.error(`[group-bulk-jobs] falha ao gravar ${rotulo}:`, error.message);
  }
}

/**
 * Grava o veredito da revisão de convite.
 *
 * Lê o `invite_url` guardado ANTES de decidir: é a comparação com ele que separa
 * `same` de `changed`. A decisão em si é pura (`decideInviteReview`) — aqui só
 * mora o I/O.
 *
 * Falha passageira não grava nada: a revisão não aconteceu, e marcar `broken`
 * numa queda da Evolution acusaria de quebrado um grupo que está bom.
 */
async function gravaRevisao(
  tenantId: string,
  job: BulkJobRow,
  ack: BulkAckInput,
  now: string,
): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("groups")
    .select("invite_url")
    .eq("tenant_id", tenantId)
    .eq("id", job.group_id)
    .maybeSingle();

  if (error) {
    console.error("[group-bulk-jobs] falha ao ler invite_url para revisão:", error.message);
    return;
  }
  if (!data) return;

  const decisao = decideInviteReview({
    guardado: (data as { invite_url: string | null }).invite_url,
    lido: ack.status === "done" ? (ack.invite ?? null) : undefined,
    falha:
      ack.status === "failed"
        ? { status: ack.httpStatus ?? 0, detail: ack.detail ?? ack.error ?? null }
        : undefined,
  });

  if (!decisao.grava) return;

  await propagaParaGrupo(tenantId, job.group_id, "invite_check", {
    invite_check: decisao.verdict,
    invite_checked_at: now,
    // Convite trocado no WhatsApp: o guardado virou lixo e o `/r/` mandaria o
    // cliente para lugar nenhum. Só o caminho `changed` reescreve — `broken`
    // PRESERVA o guardado de propósito, porque perder acesso não é o mesmo que
    // o link ter mudado, e apagar deixaria a campanha sem destino nenhum.
    ...(decisao.inviteUrl ? { invite_url: decisao.inviteUrl } : {}),
  });
}

export type BatchCounts = {
  total: number;
  done: number;
  failed: number;
  pending: number;
  /** Ações distintas do lote — a tela escreve "Aplicando foto e descrição". */
  actions: BulkAction[];
};

export type BatchProgress = BatchCounts & {
  batchId: string;
  createdAt: string;
};

/** Progresso de um lote: o "47 de 91" da tela. */
export async function countBatch(tenantId: string, batchId: string): Promise<BatchCounts> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("status, action")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ status: BulkJobStatus; action: BulkAction }>;
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return {
    total: rows.length,
    done,
    failed,
    pending: rows.length - done - failed,
    actions: [...new Set(rows.map((r) => r.action))],
  };
}

/**
 * O lote mais recente de uma campanha, com progresso — ou `null` se nunca houve.
 *
 * A tela precisa disto (e não só da resposta do POST) porque o `batchId` que
 * vive na memória do componente morre num F5, e um lote de 91 grupos leva ~6
 * minutos: recarregar a página no meio é o caso comum, não a exceção.
 */
export async function latestBatchProgress(
  tenantId: string,
  campaignGroupId: string,
): Promise<BatchProgress | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("batch_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as { batch_id: string; created_at: string };
  const counts = await countBatch(tenantId, row.batch_id);
  return { ...counts, batchId: row.batch_id, createdAt: row.created_at };
}
